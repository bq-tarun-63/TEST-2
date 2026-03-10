import { Octokit } from "@octokit/rest";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongoDb/mongodb";
import type { IGitHubConnection, InstallationSummary } from "@/models/types/GitHubConnection";
import { DatabaseService } from "@/services/databaseService";
import type { IBlock } from "@/models/types/Block";
import type { IDatabaseSource } from "@/models/types/DatabaseSource";
import { io as ClientIO, Socket } from "socket.io-client";


export interface GitHubPullRequestStatus {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  htmlUrl: string;
  headSha?: string;
  baseSha?: string;
  updatedAt?: string;
}

const COLLECTION = "githubConnections";
const githubClientId = process.env.GITHUB_CLIENT_ID || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";

type OAuthResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

async function emitNoteUpdatedEvent(noteId: string, dataSourceId: string) {
  try {
    const socketServerUrl =
      process.env.SOCKET_SERVER_URL || "https://socket-server-8.onrender.com"; // <-- fix typo here
    const socketPath = process.env.SOCKET_SERVER_PATH || "/socket.io"; // set to '/socket.io-notifications' if needed
    console.log("[GitHub Webhook] Using socketServerUrl:", socketServerUrl, "path:", socketPath);

    await new Promise<void>((resolve) => {
      let settled = false;
      let absoluteTimeout: ReturnType<typeof setTimeout> | null = null;
      const settle = (msg?: string) => {
        if (!settled) {
          settled = true;
          if (absoluteTimeout) {
            clearTimeout(absoluteTimeout);
            absoluteTimeout = null;
          }
          console.log("[GitHub Webhook] settle:", msg || "done");
          resolve();
        }
      };

      // Longer connection timeout and allow reconnection for a short period
      const socket = ClientIO(socketServerUrl, {
        path: socketPath,
        // do NOT force websocket only — allow polling then upgrade
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 500,
        timeout: 10000, // 10s connect timeout
        // if your server uses self-signed certs in dev:
        // extraHeaders: { "X-My-Header": "..." },
      });

      const cleanup = (reason?: string) => {
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
        socket.off("reconnect_attempt", handleReconnectAttempt);
        socket.off("reconnect_failed", handleReconnectFailed);

        try {
          if (socket && (socket as Socket).connected) {
            socket.disconnect();
          } else {
            socket.close();
          }
        } catch (e) {
          // ignore
        }
        settle(reason);
      };

      const handleConnect = () => {
        console.log("[GitHub Webhook] Socket connected:", socket.id);
        try {
          const payload = { noteId, dataSourceId };
          console.log("--------------------------------------------------------");
          socket.emit("note-updated", payload);
          console.log("[GitHub Webhook] Emitted note-updated", { noteId, dataSourceId });
        } catch (e) {
          console.warn("[GitHub Webhook] emit failed:", e);
        }
        // allow some time for socket to send before cleanup
        setTimeout(() => cleanup("sent"), 2500);
      };

      const handleError = (err: any) => {
        console.log("[GitHub Webhook] Socket connection error (non-critical):", err && err.message ? err.message : err);
        // wait a little to allow reconnect attempts, then cleanup
        // don't immediately resolve — let reconnection attempts run
      };

      const handleReconnectAttempt = (attempt: number) => {
        console.log(`[GitHub Webhook] reconnect attempt ${attempt}`);
      };

      const handleReconnectFailed = () => {
        console.warn("[GitHub Webhook] reconnect failed, cleaning up");
        cleanup("reconnect_failed");
      };

      socket.on("connect", handleConnect);
      socket.on("connect_error", handleError);
      socket.on("reconnect_attempt", handleReconnectAttempt);
      socket.on("reconnect_failed", handleReconnectFailed);

      // absolute safety timeout (longer)
      absoluteTimeout = setTimeout(() => {
        console.warn("[GitHub Webhook] absolute socket timeout reached, cleaning up");
        cleanup("timeout");
      }, 20000);
    });
  } catch (socketErr) {
    console.log("[GitHub Webhook] Socket emit error (non-critical):", socketErr);
  }
}

async function exchangeCodeForToken(code: string, redirectUri?: string): Promise<OAuthResponse> {
  if (!githubClientId || !githubClientSecret) {
    throw new Error("GitHub OAuth client is not configured.");
  }
  const params = new URLSearchParams({
    client_id: githubClientId,
    client_secret: githubClientSecret,
    code,
  });
  if (redirectUri) params.append("redirect_uri", redirectUri);

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: params,
  });
  const data = (await response.json()) as OAuthResponse & { error?: string; error_description?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "Failed to exchange code for token");
  }
  return data;
}

async function refreshToken(refreshToken: string): Promise<OAuthResponse> {
  if (!githubClientId || !githubClientSecret) {
    throw new Error("GitHub OAuth client is not configured.");
  }
  const params = new URLSearchParams({
    client_id: githubClientId,
    client_secret: githubClientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: params,
  });
  const data = (await response.json()) as OAuthResponse & { error?: string; error_description?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "Failed to refresh GitHub token");
  }
  return data;
}

async function getCollection() {
  const client = await clientPromise();
  const db = client.db();
  return db.collection<IGitHubConnection>(COLLECTION);
}

async function fetchInstallations(octokit: Octokit): Promise<InstallationSummary[]> {
  try {
    const { data } = await octokit.apps.listInstallationsForAuthenticatedUser();
    return data.installations.map((installation) => ({
      id: installation.id,
      accountId: installation.account?.id ?? 0,
      accountLogin: (() => {
        const account = installation.account;
        if (account && "login" in account && typeof account.login === "string") {
          return account.login;
        }
        if (account && "name" in account && typeof account.name === "string") {
          return account.name ?? "";
        }
        return "";
      })(),
      repositorySelection: installation.repository_selection,
      targetType: installation.target_type,
      suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : undefined,
    }));
  } catch (error) {
    console.warn("Unable to fetch installations for user:", error);
    return [];
  }
}

export const GitHubIntegrationService = {
  async startOAuth(code: string, redirectUri?: string) {
    return exchangeCodeForToken(code, redirectUri);
  },

  async refreshUserToken(connection: IGitHubConnection) {
    if (!connection.refreshToken) {
      throw new Error("Connection does not have a refresh token.");
    }
    const refreshed = await refreshToken(connection.refreshToken);
    const now = new Date();
    const expiresAt = refreshed.expires_in
      ? new Date(now.getTime() + refreshed.expires_in * 1000)
      : undefined;
    const refreshExpiresAt = refreshed.refresh_token_expires_in
      ? new Date(now.getTime() + refreshed.refresh_token_expires_in * 1000)
      : undefined;

    const collection = await getCollection();
    await collection.updateOne(
      { _id: connection._id },
      {
        $set: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? connection.refreshToken,
          tokenType: refreshed.token_type,
          scopes: refreshed.scope ? refreshed.scope.split(",") : connection.scopes,
          expiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
          updatedAt: now,
        },
      }
    );

    return {
      ...connection,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? connection.refreshToken,
      tokenType: refreshed.token_type,
      scopes: refreshed.scope ? refreshed.scope.split(",") : connection.scopes,
      expiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      updatedAt: now,
    };
  },

  async upsertConnection({
    userId,
    tokenResponse,
    redirectUri,
  }: {
    userId: string;
    tokenResponse: OAuthResponse;
    redirectUri?: string;
  }) {
    const octokit = new Octokit({
      auth: tokenResponse.access_token,
    });
    const { data: user } = await octokit.users.getAuthenticated();
    if (!("login" in user)) {
      throw new Error("GitHub OAuth response did not include a user identity.");
    }
    const installations = await fetchInstallations(octokit);

    const now = new Date();
    const expiresAt = tokenResponse.expires_in
      ? new Date(now.getTime() + tokenResponse.expires_in * 1000)
      : undefined;
    const refreshExpiresAt = tokenResponse.refresh_token_expires_in
      ? new Date(now.getTime() + tokenResponse.refresh_token_expires_in * 1000)
      : undefined;

    const collection = await getCollection();

    const updateDoc: Partial<IGitHubConnection> & { updatedAt: Date } = {
      githubUserId: user.id,
      githubLogin: user.login,
      githubAvatarUrl: user.avatar_url,
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type,
      scopes: tokenResponse.scope ? tokenResponse.scope.split(",") : [],
      expiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      installations,
      updatedAt: now,
    };
    if (tokenResponse.refresh_token) {
      updateDoc.refreshToken = tokenResponse.refresh_token;
    }

    await collection.updateOne(
      { userId: new ObjectId(userId) },
      {
        $set: updateDoc,
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return { redirectUri, installations };
  },

  async getConnectionByUserId(userId: string) {
    const collection = await getCollection();
    return collection.findOne({ userId: new ObjectId(userId) });
  },

  async deleteConnection(userId: string) {
    const collection = await getCollection();
    await collection.deleteOne({ userId: new ObjectId(userId) });
  },

  async getOctokitForUser(userId: string): Promise<Octokit | null> {
    const connection = await this.getConnectionByUserId(userId);
    if (!connection) return null;
    let activeConnection = connection;
    if (connection.expiresAt && connection.expiresAt < new Date()) {
      activeConnection = await this.refreshUserToken(connection);
    }
    return new Octokit({
      auth: activeConnection.accessToken,
    });
  },

  async updateInstallations(installation: InstallationSummary) {
    const collection = await getCollection();
    await collection.updateMany(
      { "installations.id": installation.id },
      {
        $set: {
          "installations.$.repositorySelection": installation.repositorySelection,
          "installations.$.targetType": installation.targetType,
          "installations.$.suspendedAt": installation.suspendedAt,
          updatedAt: new Date(),
        },
      }
    );
  },

  async removeInstallation(installationId: number) {
    const collection = await getCollection();
    await collection.updateMany(
      {},
      {
        $pull: { installations: { id: installationId } },
        $set: { updatedAt: new Date() },
      }
    );
  },

  async getPullRequestStatus({
    userId,
    owner,
    repo,
    pullNumber,
    installationId,
  }: {
    userId: string;
    owner: string;
    repo: string;
    pullNumber: number;
    installationId?: number;
  }): Promise<GitHubPullRequestStatus> {
    let octokit = await this.getOctokitForUser(userId);

    // Try user token first, fallback to installation if needed
    if (!octokit && installationId) {
      const { GitHubAppService } = await import("./githubAppService");
      try {
        octokit = await GitHubAppService.getOctokitForInstallation(installationId);
      } catch (error) {
        console.warn("Failed to get installation Octokit:", error);
      }
    }

    if (!octokit) {
      throw new Error("GitHub connection not found for user");
    }
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      merged: Boolean(data.merged_at),
      draft: Boolean(data.draft),
      htmlUrl: data.html_url,
      headSha: data.head?.sha,
      baseSha: data.base?.sha,
      updatedAt: data.updated_at,
    };
  },

  async listPullRequests({
    userId,
    owner,
    repo,
    installationId,
    state = "open",
    perPage = 30,
  }: {
    userId: string;
    owner: string;
    repo: string;
    installationId?: number;
    state?: "open" | "closed" | "all";
    perPage?: number;
  }): Promise<GitHubPullRequestStatus[]> {
    let octokit = await this.getOctokitForUser(userId);

    // Try user token first, fallback to installation if needed
    if (!octokit && installationId) {
      const { GitHubAppService } = await import("./githubAppService");
      try {
        octokit = await GitHubAppService.getOctokitForInstallation(installationId);
      } catch (error) {
        console.warn("Failed to get installation Octokit:", error);
      }
    }

    if (!octokit) {
      throw new Error("GitHub connection not found for user");
    }

    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: perPage,
      sort: "updated",
      direction: "desc",
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state as "open" | "closed",
      merged: Boolean(pr.merged_at),
      draft: Boolean(pr.draft),
      htmlUrl: pr.html_url,
      headSha: pr.head?.sha,
      baseSha: pr.base?.sha,
      updatedAt: pr.updated_at,
    }));
  },

  /**
   * Finds all notes with a linked PR and updates their status automatically
   */
  async syncPrStatusToNotes({
    owner,
    repo,
    pullNumber,
    state,
    merged,
    installationId,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
    state: "open" | "closed";
    merged: boolean;
    installationId?: number;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksCollection = db.collection<IBlock>("blocks");
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

    try {
      // Find all database sources that have github_pr properties
      const allDataSources = await databaseSourcesCollection.find({}).toArray();

      for (const dataSource of allDataSources) {
        const properties = dataSource.properties || {};

        // Find all github_pr properties in this data source
        const githubPrProperties = Object.entries(properties).filter(
          ([_, prop]) => prop.type === "github_pr",
        );

        if (githubPrProperties.length === 0) continue;

        // Find blocks (pages) in this data source that have database properties
        // Note: In IBlock, databaseProperties are inside value (IPage), and parentId links to dataSource
        const blocks = await blocksCollection
          .find({
            parentId: String(dataSource._id),
            "value.databaseProperties": {
              $exists: true,
            },
          })
          .toArray();

        for (const block of blocks) {
          // Cast value to any/IPage to access databaseProperties
          const blockValue = block.value as any;
          if (!blockValue || !blockValue.databaseProperties) continue;

          // Check each github_pr property
          for (const [propertyId, propertySchema] of githubPrProperties) {
            const prValue = blockValue.databaseProperties[propertyId];
            if (!prValue || typeof prValue !== "object") continue;

            // Check if this note's PR matches the webhook PR
            const prOwner = prValue.owner;
            const prRepo = prValue.repo;
            const prNumber = prValue.pullNumber ?? prValue.number;

            if (
              prOwner === owner &&
              prRepo === repo &&
              Number(prNumber) === pullNumber
            ) {
              console.log(
                `[GitHub Webhook] Found matching PR in block ${block._id}, property ${propertyId}. Updating status...`,
              );

              // Check if auto-sync is enabled (default: true)
              const autoSync = propertySchema.githubPrConfig?.autoSync ?? true;
              if (!autoSync) {
                console.log(
                  `[GitHub Webhook] Auto-sync disabled for property ${propertyId}, skipping update`,
                );
                continue;
              }

              // Update the PR value and status
              try {
                // Get a system user or use the block creator
                const systemUser = {
                  _id: block.createdBy?.userId,
                  id: String(block.createdBy?.userId),
                  name: "System",
                  email: block.createdBy?.userEmail || "system@example.com",
                };

                // Prepare the updated PR value
                const updatedPrValue = {
                  ...prValue,
                  state,
                  merged,
                  lastSyncedAt: new Date().toISOString(),
                  prUpdatedAt: new Date().toISOString(),
                };

                // Use the existing updatePropertyValue logic to handle status updates
                // Note: blockId argument expects the block._id
                await DatabaseService.updatePropertyValue({
                  dataSourceId: String(dataSource._id),
                  blockId: String(block._id),
                  propertyId,
                  value: updatedPrValue,
                  currentUser: systemUser as any,
                });

                console.log(
                  `[GitHub Webhook] Successfully updated block ${block._id} for PR ${owner}/${repo}#${pullNumber}`,
                );

                await emitNoteUpdatedEvent(String(block._id), String(dataSource._id));
              } catch (error) {
                console.error(
                  `[GitHub Webhook] Failed to update block ${block._id}:`,
                  error,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[GitHub Webhook] Error syncing PR status to notes:", error);
    }
  },
};

export default GitHubIntegrationService;

