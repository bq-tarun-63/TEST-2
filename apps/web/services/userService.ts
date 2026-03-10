import clientPromise from "@/lib/mongoDb/mongodb";
import { IOrganization } from "@/models/types/Organization";
import { type IUser, User } from "@/models/types/User";
import { AuditService } from "./auditService";
import { ObjectId } from "mongodb";

export const UserService = {

  async findUserByEmail({ email }: { email: string }): Promise<IUser | null> {
    const client = await clientPromise();
    const db = client.db();
    const collection = db.collection<IUser>("users");

    const user = await collection.findOne({ email });

    if (!user) {
      return null;
    }

    return User.formatUser(user);
  },

  async createUser({ userData }: { userData: { email: string; name?: string; image?: string } }): Promise<IUser> {
    const client = await clientPromise();
    const db = client.db();
    const collection = db.collection<IUser>("users");

    // Check if user with this email already exists
    const existingUser = await collection.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Create index for email uniqueness if it doesn't exist
    await collection.createIndex({ email: 1 }, { unique: true });

    const newUser: IUser = {
      email: userData.email,
      name: userData.name || "",
      image: userData.image || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newUser);

    return {
      ...User.formatUser(newUser),
      _id: result.insertedId,
      id: result.insertedId.toString(),
    };
  },
  async findOrCreateUserFromSession({
    session,
  }: {
    session: { email: string; name?: string; image?: string };
  }): Promise<IUser> {
    const client = await clientPromise();
    const db = client.db();
    const usersCol = db.collection<IUser>("users");
    const orgsCol = db.collection<IOrganization>("organizations");

    // Try to find existing user
    const user = await usersCol.findOne({ email: session.email });
    if (user) {
      return User.formatUser(user);
    }

    // Extract domain from email
    const emailDomain = session.email.split("@")[1]?.toLowerCase();
    // Find matching organization by allowedDomains
    let matchedOrg;
    if (emailDomain) {
      matchedOrg = await orgsCol.findOne({
        allowedDomains: emailDomain
      });
    }
    const now = new Date();
    const newUser: IUser = {
      email: session.email,
      name: session.name || "",
      image: session.image || "",
      createdAt: now,
      updatedAt: now,
      ...(matchedOrg
        ? {
          organizationId: matchedOrg._id,
          organizationName: matchedOrg.name,
          organizationDomain: emailDomain
        }
        : {})
    };

    const result = await usersCol.insertOne(newUser);
    newUser._id = result.insertedId;

    // Audit Log: Create User (via Session)
    AuditService.log({
      action: "CREATE",
      noteId: result.insertedId.toString(),
      userId: result.insertedId.toString(),
      userEmail: newUser.email,
      userName: newUser.name || "Unknown",
      noteName: "New User via Session",
      serviceType: "MONGODB",
      field: "user",
      oldValue: undefined,
      newValue: "created",
      organizationDomain: emailDomain,
    }).catch(console.error);

    return User.formatUser(newUser);
  },

  /**
   * Get current user with organization details and sync if needed
   */
  async getCurrentUserWithOrg(user: IUser, session: any): Promise<IUser> {
    const client = await clientPromise();
    const db = client.db();

    // logic from route.ts
    const REVENT_LABS_WORKSPACE_IDS: string[] = process.env.REVENT_LABS_WORKSPACE_IDS
      ? process.env.REVENT_LABS_WORKSPACE_IDS.split(",").filter(Boolean)
      : [];

    const emailDomain = session.user.email && session.user.email.includes("@")
      ? session.user.email.split("@")[1]?.toLowerCase()
      : undefined;

    /* //make sure if the domain is @REVENT_LABS thenpush the user to
      the REVENT_LABS organization MEMBER FIELD
    */
    if (emailDomain === "reventlabs.com") {
      // Import dynamically to avoid circular dependencies if any
      const { addMemberToWorkspace } = await import("@/services/notificationServices");

      for (const workspaceId of REVENT_LABS_WORKSPACE_IDS) {
        await addMemberToWorkspace({
          workspaceId,
          user: {
            userId: new ObjectId(user._id),
            userName: user.name || "",
            userEmail: user.email || "",
          },
          role: "member",
        });
      }
    }

    // Look for matching organization
    let organization: any;
    if (emailDomain) {
      const { OrganizationService } = await import("@/services/organizationService");
      organization = await OrganizationService.findByDomain({ domain: emailDomain });
    }

    if (organization) {
      // Update user with org details
      await db.collection<IUser>("users").updateOne(
        { _id: new ObjectId(user._id) },
        {
          $set: {
            organizationId: organization._id,
            organizationDomain: organization.allowedDomains,
            updatedAt: new Date(),
          },
        },
      );

      // Return updated user object
      return {
        ...user,
        organizationId: organization._id,
        organizationDomain: organization.allowedDomains
      };
    }

    return user;
  },

  /**
   * Get public profile data for a user
   */
  async getPublicProfile(userId: string): Promise<Partial<IUser> | null> {
    const client = await clientPromise();
    const db = client.db();

    if (!ObjectId.isValid(userId)) {
      return null;
    }

    const targetUser = await db.collection<IUser>("users").findOne({ _id: new ObjectId(userId) });

    if (!targetUser) {
      return null;
    }

    // Secure Projection (Public Profile Data Only)
    return {
      id: targetUser._id ? targetUser._id.toString() : undefined,
      _id: targetUser._id,
      name: targetUser.name,
      image: targetUser.image,
      about: targetUser.about,
      coverUrl: targetUser.coverUrl,
      organizationDomain: targetUser.organizationDomain,
      organizationId: targetUser.organizationId,
    };
  },

  /**
   * Get public profile data for a user by email
   */
  async getPublicProfileByEmail(email: string): Promise<Partial<IUser> | null> {
    const client = await clientPromise();
    const db = client.db();

    const targetUser = await db.collection<IUser>("users").findOne({ email: email.toLowerCase() });

    if (!targetUser) {
      return null;
    }

    // Secure Projection (Public Profile Data Only) - consistent with getPublicProfile
    return {
      id: targetUser._id ? targetUser._id.toString() : undefined,
      _id: targetUser._id,
      name: targetUser.name,
      image: targetUser.image,
      about: targetUser.about,
      coverUrl: targetUser.coverUrl,
      organizationDomain: targetUser.organizationDomain,
      email: targetUser.email,
      organizationId: targetUser.organizationId,
    };
  },

  /**
   * Update user profile fields (whitelist protected)
   */
  async updateUserProfile(userId: string, updates: Partial<IUser>): Promise<IUser | null> {
    const client = await clientPromise();
    const db = client.db();

    // Whitelist allowed fields
    const allowedUpdates = ['name', 'image', 'about', 'coverUrl'];
    const safeUpdates: Partial<IUser> = {};

    let hasUpdates = false;
    for (const field of allowedUpdates) {
      if (field in updates) {
        // @ts-ignore
        safeUpdates[field as keyof IUser] = updates[field as keyof IUser];
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      return null; // Or throw error
    }

    safeUpdates.updatedAt = new Date();

    const result = await db.collection<IUser>("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: safeUpdates }
    );

    if (result.matchedCount === 0) {
      return null;
    }

    // Fetch updated user to return complete object
    const updatedUser = await db.collection<IUser>("users").findOne({ _id: new ObjectId(userId) });
    return updatedUser;
  }
};
