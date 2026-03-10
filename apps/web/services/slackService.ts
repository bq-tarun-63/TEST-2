import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import { ObjectId } from "mongodb";
import { ISlackConnection } from '@/models/types/SlackConnection';
import { IBlock, IPage, ParentTable } from '@/models/types/Block';
import { BlockService, BlockCreateInput } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";


export const SlackService = {
  /**
   * Verified that the request actually comes from Slack
   */
  verifySignature(rawBody: string, signature: string, timestamp: string): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error('[Slack Service] SLACK_SIGNING_SECRET is missing');
      return false;
    }

    // 1. Check if the request is too old (to prevent replay attacks)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
    if (parseInt(timestamp) < fiveMinutesAgo) return false;

    // 2. Concatenate the version number + timestamp + raw body
    const sigBaseString = `v0:${timestamp}:${rawBody}`;

    // 3. Compute the HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', signingSecret);
    const mySignature = `v0=${hmac.update(sigBaseString).digest('hex')}`;

    // 4. Compare using timingSafeEqual to prevent timing attacks
    const mySigBuffer = Buffer.from(mySignature);
    const sigBuffer = Buffer.from(signature || "");

    if (mySigBuffer.length !== sigBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      new Uint8Array(mySigBuffer),
      new Uint8Array(sigBuffer)
    );
  },

  /**
   * Handle the link_shared event by unfurling Books links
   */
  async handleLinkUnfurl(event: any, teamId: string) {
    const { links, channel, message_ts } = event;

    // 1. Find the slack connection to get the access token
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

    const connection = await slackCollection.findOne({ slackTeamId: teamId });
    if (!connection) return;
    const client = new WebClient(connection.slackAccessToken);
    const unfurls: Record<string, any> = {};
    for (const link of links) {
      const url = link.url;
      const match = url.match(/\/notes\/([a-f\d]{24})/); // Matches the Note ID

      if (match && match[1]) {
        const blockId = match[1];
        try {
          const blocksColl = metadataDb.collection<IBlock>("blocks");
          const block = await blocksColl.findOne({ _id: new ObjectId(blockId), status: "alive" });
          if (block && block.blockType === "page") {
            const pageValue = block.value as IPage;

            // Default simple context elements
            const contextElements: any[] = [{ type: "mrkdwn", text: `_Created by ${block.createdBy.userName}_` }];

            // Context-Aware Unfurling: Check if Database Item
            const isDatabaseItem = (pageValue as any).databaseProperties !== undefined;
            const fields: any[] = [];

            if (isDatabaseItem) {
              const dbProps = (pageValue as any).databaseProperties || {};
              const dataSourceColl = metadataDb.collection("databaseSources");
              const dataSource = await dataSourceColl.findOne({
                blockIds: String(block._id)
              });

              if (dataSource && dataSource.properties) {
                let statusField: any = null;
                let priorityField: any = null;
                let assigneeField: any = null;

                const props = Object.entries(dataSource.properties).map(([id, p]: any) => ({ id, ...p }));

                // Priority
                const prioProp = props.find(p => p.name?.toLowerCase().includes("priority"));
                if (prioProp) {
                  const val = dbProps[prioProp.id];
                  if (val != null) priorityField = { type: "mrkdwn", text: `*Priority*\n${val}` };
                }

                // Status
                const statProp = props.find(p => p.type === "status" && p.name?.toLowerCase() !== "priority");
                if (statProp) {
                  let val = dbProps[statProp.id];
                  if (val != null) {
                    if (statProp.options) {
                      const opt = statProp.options.find((o: any) => o.id === val);
                      if (opt) val = opt.name;
                    }
                    statusField = { type: "mrkdwn", text: `*Status*\n${val}` };
                  }
                }

                // Assignee
                const personProp = props.find(p => p.type === "person" || p.name?.toLowerCase().includes("assignee"));
                if (personProp) {
                  const val = dbProps[personProp.id];
                  if (val != null) {
                    let display = String(val);
                    if (Array.isArray(val)) display = `${val.length} assigned`;
                    assigneeField = { type: "mrkdwn", text: `*Assignee*\n${display}` };
                  }
                }

                // Push non-null fields
                [statusField, priorityField, assigneeField].forEach(f => {
                  if (f) fields.push(f);
                });
              }
            }

            const blockUI: any = {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${pageValue.title || 'Untitled Note'}*`
              }
            };
            if (fields.length > 0) {
              blockUI.fields = fields;
            }

            unfurls[url] = {
              color: "#000000",
              blocks: [
                blockUI,
                {
                  type: "context",
                  elements: [{ type: "mrkdwn", text: `_Created by ${block.createdBy.userName}_` }]
                }
              ]
            };
          }
        } catch (error) {
          console.error(`[Slack Service] Error fetching block ${blockId}:`, error);
        }
      }
    }
    // 2. Send the unfurl to Slack
    if (Object.keys(unfurls).length > 0) {
      await client.chat.unfurl({ channel, ts: message_ts, unfurls });
    }
  },

  /**
   * Find a Slack connection for a specific user
   */
  async getConnectionByUserId(userId: string): Promise<ISlackConnection | null> {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

    return await slackCollection.findOne({ userId, isActive: true });
  },

  /**
   * Disconnect Slack for a specific user
   */
  async deleteConnection(userId: string): Promise<void> {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

    await slackCollection.deleteOne({ userId });
  },

  /**
   * Open a modal in Slack to confirm/edit the note content (from message shortcut)
   */
  async handleSaveToBooks(payload: any) {
    const { trigger_id, message, team, user } = payload;

    // 1. Get client
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
    const connection = await slackCollection.findOne({ slackTeamId: team.id });
    if (!connection) return;

    // 2. Fetch workspace name for context
    const workspacesColl = metadataDb.collection("workspaces");
    const workspace = await workspacesColl.findOne({
      _id: new ObjectId(connection.workspaceId)
    });
    const workspaceName = workspace?.name || "Unknown Workspace";

    // 3. Fetch workspace databases for the dropdown
    const databasesColl = metadataDb.collection("databaseSources");
    const databases = await databasesColl.find({ workspaceId: connection.workspaceId }).toArray();

    const dbOptions: any[] = [];
    databases.forEach((db: any) => {
      let dbName = db.title || db.title?.[0]?.[0] || "Untitled Database";
      if (Array.isArray(dbName)) dbName = dbName.join(""); // parse rich text if needed
      if (typeof dbName !== "string") dbName = "Untitled Database";

      dbOptions.push({
        text: { type: "plain_text", text: `📊 ${dbName.substring(0, 50)}` },
        value: String(db._id)
      });
    });

    // Fallback if no databases exist
    if (dbOptions.length === 0) {
      dbOptions.push({
        text: { type: "plain_text", text: "📄 Standard Page (No Database)" },
        value: "standard_page"
      });
    }

    const client = new WebClient(connection.slackAccessToken);

    // Generate initial dynamic properties for the first database selected by default
    const initialDatabase = databases.length > 0 ? databases[0] : null;
    const initialDynamicBlocks = this._generateDynamicPropBlocks(initialDatabase);

    const initialTitle = message?.text ? message.text.substring(0, 50) + (message.text.length > 50 ? "..." : "") : undefined;
    const initialContent = message?.text ? message.text : undefined;

    // 4. Open Modal
    await client.views.open({
      trigger_id,
      view: {
        type: "modal",
        callback_id: "save_to_books_modal",
        title: { type: "plain_text", text: `Save to ${workspaceName.substring(0, 16)}` },
        blocks: [
          {
            type: "section",
            block_id: "database_select",
            text: { type: "mrkdwn", text: "*Destination Board/Database*" },
            accessory: {
              type: "static_select",
              action_id: "database_dropdown",
              options: dbOptions,
              initial_option: dbOptions[0]
            }
          },
          {
            type: "input",
            block_id: "note_title",
            label: { type: "plain_text", text: "Title / Issue Name" },
            element: {
              type: "plain_text_input",
              action_id: "title_input",
              ...(initialTitle ? { initial_value: initialTitle } : { placeholder: { type: "plain_text", text: "Enter issue title..." } })
            }
          },
          {
            type: "input",
            block_id: "note_content",
            label: { type: "plain_text", text: "Description" },
            element: {
              type: "plain_text_input",
              action_id: "content_input",
              multiline: true,
              ...(initialContent ? { initial_value: initialContent } : { placeholder: { type: "plain_text", text: "Describe the bug or issue..." } })
            }
          },
          ...initialDynamicBlocks
        ],
        submit: { type: "plain_text", text: "Save" },
        // Pass original message info
        private_metadata: JSON.stringify({
          channel: payload.channel?.id,
          message_ts: message?.ts, // ONLY the actual message.ts, not the trigger ts
          pageType: "private"
        })
      }
    });
    console.log(`[Slack Service] Opened save modal. Metadata initialized with channel: ${payload.channel?.id}, message_ts: ${message?.ts}`);
    console.log(`[Slack Service] Opened save modal. Metadata initialized with channel: ${payload.channel?.id}, message_ts: ${message?.ts || payload.message_ts}`);
  },

  /**
   * Handle the dynamic re-rendering of the modal when a user selects a database
   */
  async updateModalWithProperties(payload: any) {
    const { view, user, team, actions } = payload;

    // Safety check
    if (!view || !view.blocks) return;

    // Find the selected database ID from the dropdown state or the action value
    let selectedDatabaseId = "standard_page";
    if (view.state && view.state.values && view.state.values.database_select && view.state.values.database_select.database_dropdown) {
      selectedDatabaseId = view.state.values.database_select.database_dropdown.selected_option.value;
    }

    // Reconstruct the base blocks (Dropdown + Title + Description)
    // We just reuse the existing first 3 blocks, but keep the submitted state intact if possible
    const currentBlocks = view.blocks;
    const baseBlocks = currentBlocks.slice(0, 3); // Database dropdown, Title, Description

    // If standard page, no dynamic properties
    if (selectedDatabaseId === "standard_page") {
      // Just clear any extra blocks that might have been added previously
      await this._executeUpdateView(team.id, view.id, view.hash, baseBlocks, view.title, view.submit, view.private_metadata);
      return;
    }

    // 1. Fetch the Database Schema
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const databasesColl = metadataDb.collection("databaseSources");

    const dbSource = await databasesColl.findOne({ _id: new ObjectId(selectedDatabaseId) });
    if (!dbSource || !dbSource.properties) {
      await this._executeUpdateView(team.id, view.id, view.hash, baseBlocks, view.title, view.submit, view.private_metadata);
      return;
    }

    // 2. Generate Dynamic Prop Blocks
    const dynamicBlocks = this._generateDynamicPropBlocks(dbSource);

    // 3. Update the Modal View
    const finalBlocks = [...baseBlocks, ...dynamicBlocks];
    await this._executeUpdateView(team.id, view.id, view.hash, finalBlocks, view.title, view.submit, view.private_metadata);
  },

  /**
   * Helper to generate dynamic property blocks from a database source
   */
  _generateDynamicPropBlocks(dbSource: any): any[] {
    const dynamicBlocks: any[] = [];
    if (!dbSource || !dbSource.properties) return dynamicBlocks;

    // Properties might be stored as an object/dictionary in Mongo
    const propertiesArray = Array.isArray(dbSource.properties)
      ? dbSource.properties
      : Object.values(dbSource.properties || {});

    // Filter to supported types and respect the workspace admin's visibility settings
    let propertiesToRender = propertiesArray.filter((prop: any) =>
      prop &&
      prop.showProperty !== false &&
      prop.isVisibleInSlack !== false &&
      ['select', 'multi_select', 'status', 'person', 'date'].includes(prop.type)
    );

    // Deduplicate properties based on their target ID to prevent Slack block_id collisions
    const seenIds = new Set<string>();
    propertiesToRender = propertiesToRender.filter((prop: any) => {
      let propNameStr = prop.name || "Unknown Property";
      if (Array.isArray(propNameStr)) propNameStr = propNameStr.join("");
      if (typeof propNameStr !== "string") propNameStr = "Unknown Property";

      const propId = String(prop.id || prop._id || propNameStr.toLowerCase().replace(/\s+/g, "_") || Math.random().toString(36).substring(7));
      if (seenIds.has(propId)) {
        return false;
      }
      seenIds.add(propId);
      return true;
    });

    propertiesToRender.forEach((prop: any) => {
      let propNameStr = prop.name || "Unknown Property";
      if (Array.isArray(propNameStr)) propNameStr = propNameStr.join("");
      if (typeof propNameStr !== "string") propNameStr = "Unknown Property";

      const propId = String(prop.id || prop._id || propNameStr.toLowerCase().replace(/\s+/g, "_") || Math.random().toString(36).substring(7));
      let propName = propNameStr;

      // Build options array for select/status fields
      if ((prop.type === 'select' || prop.type === 'status' || prop.type === 'multi_select') && prop.options) {
        let initialOption: any = null;

        const slackOptions = prop.options
          .filter((opt: any) => opt && opt.id && String(opt.id).trim() !== "")
          .map((opt: any) => {
            let optVal = opt.name || opt.value || opt.label || "Untitled";
            if (Array.isArray(optVal)) optVal = optVal.join("");
            if (typeof optVal !== "string") optVal = "Untitled";

            const optionObj = {
              text: { type: "plain_text", text: String(optVal).substring(0, 75) },
              value: String(opt.id)
            };

            // Check if this option is marked as the default in the schema
            if (opt.isDefault === true || String(prop.defaultValue) === String(opt.id)) {
              initialOption = optionObj;
            }

            return optionObj;
          });

        if (slackOptions.length > 0) {
          const isMulti = prop.type === 'multi_select';

          const elementPayload: any = {
            type: isMulti ? "multi_static_select" : "static_select",
            action_id: `action_${propId}`,
            placeholder: { type: "plain_text", text: `Select ${propName}` },
            options: slackOptions,
          };

          if (initialOption) {
            if (isMulti) {
              elementPayload.initial_options = [initialOption];
            } else {
              elementPayload.initial_option = initialOption;
            }
          }

          dynamicBlocks.push({
            type: "input",
            block_id: `prop_${propId}`,
            optional: true,
            label: { type: "plain_text", text: `${propName} (optional)` },
            element: elementPayload
          });
        }
      }

      // Build user select field
      if (prop.type === 'person' || prop.type === 'user') {
        dynamicBlocks.push({
          type: "input",
          block_id: `prop_${propId}`,
          optional: true,
          label: { type: "plain_text", text: `${propName} (optional)` },
          element: {
            type: "users_select",
            action_id: `action_${propId}`,
            placeholder: { type: "plain_text", text: `Select assignee` }
          }
        });
      }

      // Build date picker
      if (prop.type === 'date') {
        dynamicBlocks.push({
          type: "input",
          block_id: `prop_${propId}`,
          optional: true,
          label: { type: "plain_text", text: `${propName} (optional)` },
          element: {
            type: "datepicker",
            action_id: `action_${propId}`,
            initial_date: new Date().toISOString().split('T')[0],
            placeholder: { type: "plain_text", text: `Select date` }
          }
        });
      }
    });

    return dynamicBlocks;
  },

  /**
   * Helper to execute the Slack views.update API call
   */
  async _executeUpdateView(teamId: string, viewId: string, viewHash: string, blocks: any[], titleObj: any, submitObj: any, privateMeta: string) {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
    const connection = await slackCollection.findOne({ slackTeamId: teamId });
    if (!connection) return;

    const client = new WebClient(connection.slackAccessToken);

    try {
      await client.views.update({
        view_id: viewId,
        hash: viewHash,
        view: {
          type: "modal",
          callback_id: "save_to_books_modal",
          title: titleObj,
          submit: submitObj,
          blocks: blocks,
          private_metadata: privateMeta
        }
      });
      console.log(`[Slack Service] Modal updated successfully with ${blocks.length} blocks`);
    } catch (error) {
      console.error("[Slack Service] Failed to update views block:", error);
    }
  },

  /**
   * Open a modal in Slack to create a new note (from slash command)
   */
  async openCreateNoteModal({ trigger_id, teamId, pageType }: { trigger_id: string; teamId: string; pageType: "public" | "private" }) {
    // 1. Get client
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
    const connection = await slackCollection.findOne({ slackTeamId: teamId });
    if (!connection) return;

    // 2. Fetch workspace name for context
    const workspacesColl = metadataDb.collection("workspaces");
    const workspace = await workspacesColl.findOne({
      _id: new ObjectId(connection.workspaceId)
    });
    const workspaceName = workspace?.name || "Unknown Workspace";

    const client = new WebClient(connection.slackAccessToken);
    // Slack has a 24-character limit for modal titles
    const title = pageType === "public" ? "Create Public Note" : "Create Private Note";

    // 3. Open Modal
    await client.views.open({
      trigger_id,
      view: {
        type: "modal",
        callback_id: "create_note_modal",
        title: { type: "plain_text", text: title },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Creating in workspace: *${workspaceName}*`
            }
          },
          {
            type: "input",
            block_id: "note_title",
            label: { type: "plain_text", text: "Title" },
            element: {
              type: "plain_text_input",
              action_id: "title_input",
              placeholder: { type: "plain_text", text: "Enter note title..." }
            }
          },
          {
            type: "input",
            block_id: "note_content",
            label: { type: "plain_text", text: "Content" },
            element: {
              type: "plain_text_input",
              action_id: "content_input",
              multiline: true,
              placeholder: { type: "plain_text", text: "Enter note content..." }
            }
          }
        ],
        submit: { type: "plain_text", text: "Create" },
        private_metadata: JSON.stringify({ pageType })
      }
    });
  },

  /**
   * Open workspace switcher modal to select active workspace
   */
  async openWorkspaceSwitcherModal({ trigger_id, userId, teamId }: { trigger_id: string; userId: string; teamId: string }) {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();

    // Get current connection
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
    const currentConnection = await slackCollection.findOne({ slackUserId: userId, slackTeamId: teamId });

    if (!currentConnection) {
      console.warn("[Slack Service] No connection found");
      return;
    }

    // Get all workspaces where user is a member
    const workspacesColl = metadataDb.collection("workspaces");
    const userWorkspaces = await workspacesColl.find({
      "members.userId": new ObjectId(currentConnection.userId)
    }).toArray();

    if (userWorkspaces.length === 0) {
      console.warn("[Slack Service] User has no workspaces");
      return;
    }

    // Create options for dropdown
    const options = userWorkspaces.map((ws: any) => {
      const isCurrent = String(ws._id) === String(currentConnection.workspaceId);
      return {
        text: {
          type: "plain_text" as const,
          text: isCurrent ? `${ws.name} ✓ (current)` : ws.name
        },
        value: String(ws._id)
      };
    });

    // Find initial option (current workspace)
    const initialOption = options.find(opt => opt.value === String(currentConnection.workspaceId));

    const client = new WebClient(currentConnection.slackAccessToken);

    await client.views.open({
      trigger_id,
      view: {
        type: "modal",
        callback_id: "workspace_switcher",
        title: { type: "plain_text", text: "Switch Workspace" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Select which workspace to use for Slack commands:"
            }
          },
          {
            type: "input",
            block_id: "workspace_select",
            label: { type: "plain_text", text: "Workspace" },
            element: {
              type: "static_select",
              action_id: "workspace_dropdown",
              options: options,
              initial_option: initialOption
            }
          }
        ],
        submit: { type: "plain_text", text: "Switch" }
      }
    });
  },

  /**
   * Handle the final submission of note modals (save_to_books or create_note)
   */
  async handleModalSubmission(payload: any) {
    const { view, user, team } = payload;
    const callback_id = view.callback_id;

    // Handle workspace switcher
    if (callback_id === "workspace_switcher") {
      const values = view.state.values;
      const selectedWorkspaceId = values.workspace_select.workspace_dropdown.selected_option.value;

      const metadataClient = await clusterManager.getMetadataClient();
      const metadataDb = metadataClient.db();
      const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

      // Update connection
      await slackCollection.updateOne(
        { slackUserId: user.id, slackTeamId: team.id },
        { $set: { workspaceId: selectedWorkspaceId, updatedAt: new Date() } }
      );

      // Get workspace name for confirmation
      const workspacesColl = metadataDb.collection("workspaces");
      const workspace = await workspacesColl.findOne({ _id: new ObjectId(selectedWorkspaceId) });
      const workspaceName = workspace?.name || "Unknown";

      console.log(`[Slack Service] ✅ Switched to workspace: ${workspaceName} for user ${user.id}`);

      // Send confirmation message
      const connection = await slackCollection.findOne({ slackUserId: user.id, slackTeamId: team.id });
      if (connection) {
        const client = new WebClient(connection.slackAccessToken);
        await client.chat.postEphemeral({
          channel: user.id,
          user: user.id,
          text: `✅ Switched to workspace: *${workspaceName}*\n\nAll future commands will use this workspace.`
        });
      }

      return;
    }

    // Handle note creation modals
    const values = view.state.values;
    const title = values.note_title.title_input.value;
    const content = values.note_content.content_input.value;

    console.log(`[Slack Service] Receiving modal submission. Private Metadata string:`, view.private_metadata);
    let metadata: any = {};
    try {
      metadata = JSON.parse(view.private_metadata || "{}");
    } catch (e) {
      console.error("[Slack Service] Failed to parse private_metadata:", view.private_metadata);
    }

    console.log(`[Slack Service] Parsed Metadata:`, metadata);

    const pageType = metadata.pageType || "private";
    if (pageType !== "public" && pageType !== "private") {
      throw new Error(`Invalid pageType: ${pageType}`);
    }
    // 1. Get user's connection
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
    const connection = await slackCollection.findOne({ slackUserId: user.id, slackTeamId: team.id });
    if (!connection || !connection.userId || !connection.workspaceId) {
      console.warn("[Slack Service] Active connection not found for user integration.");
      return;
    }
    console.log(`[Slack Service] PageType: ${pageType}, Thread target: ${metadata.message_ts || 'None'}`);
    // 2. Prepare Page Creation
    const newNoteId = new ObjectId();
    const userName = connection.userEmail?.split('@')[0] || "Slack User";

    let selectedDatabaseId = "standard_page";
    if (values.database_select && values.database_select.database_dropdown) {
      selectedDatabaseId = values.database_select.database_dropdown.selected_option.value;
    }

    const isDatabaseItem = selectedDatabaseId !== "standard_page";

    // Parse Dynamic Properties
    const databaseProperties: Record<string, any> = {};
    if (isDatabaseItem) {
      Object.keys(values).forEach((blockId) => {
        if (blockId.startsWith("prop_")) {
          const propId = blockId.split("prop_")[1] as string;
          if (!propId) return;

          const actionObj = (values[blockId] as any)[`action_${propId}`];
          if (!actionObj) return;

          if (actionObj.type === "static_select" && actionObj.selected_option) {
            databaseProperties[propId] = actionObj.selected_option.value;
          } else if (actionObj.type === "multi_static_select" && actionObj.selected_options) {
            databaseProperties[propId] = actionObj.selected_options.map((opt: any) => opt.value);
          } else if (actionObj.type === "users_select" && actionObj.selected_user) {
            databaseProperties[propId] = [actionObj.selected_user]; // Assuming user field is array format
          } else if (actionObj.type === "datepicker" && actionObj.selected_date) {
            databaseProperties[propId] = actionObj.selected_date;
          }
        }
      });
    }

    const pageBlock: BlockCreateInput = {
      _id: String(newNoteId),
      blockType: "page",
      value: {
        title: title,
        userId: connection.userId!,
        userEmail: connection.userEmail!,
        icon: isDatabaseItem ? "📋" : "📝",
        coverURL: null,
        pageType: pageType,
        ...(isDatabaseItem ? { databaseProperties } : {})
      } as any
    };

    // 3. Prepare Content Block Creation
    const contentBlockId = new ObjectId();
    const contentBlock: BlockCreateInput = {
      _id: String(contentBlockId),
      blockType: "content",
      value: {
        type: "paragraph",
        attrs: {
          blockId: String(contentBlockId),
          backgroundColor: null
        },
        content: [
          {
            type: "text",
            text: content
          }
        ]
      }
    };

    // Determine Target Parent
    const parentTable: ParentTable = isDatabaseItem ? "collection" : "workspace";
    const targetParentId = isDatabaseItem ? selectedDatabaseId : String(connection.workspaceId);

    // 4. Execute Batch Creation
    // Call 1: Create the Page (Parent is either Workspace or Database Source)
    await BlockService.batchCreateBlocks({
      userId: connection.userId!,
      parentId: targetParentId,
      workspaceId: String(connection.workspaceId),
      blocks: [pageBlock],
      parentTable: parentTable,
      userName: userName,
      userEmail: connection.userEmail!,
    });

    // Call 2: Create the Content (Parent is the new Page)
    await BlockService.batchCreateBlocks({
      userId: connection.userId!,
      parentId: String(newNoteId),
      workspaceId: String(connection.workspaceId),
      blocks: [contentBlock],
      parentTable: "page",
      userName: userName,
      userEmail: connection.userEmail!,
    });
    // 5. Notify the user in Slack
    const client = new WebClient(connection.slackAccessToken);
    const domain = process.env.DOMAIN || `https://${process.env.NEXT_PUBLIC_APP_URL}`;

    // Attempt to get channel from metadata (for save_to_books) or use the user's DM
    const channel = metadata.channel || user.id;

    try {
      const userInfo = await client.users.info({ user: user.id });
      const slackUserName = userInfo.user?.real_name || "A user";

      // ALWAYS post a brand new message confirming the issue creation
      console.log(`[Slack Service] Sending creation confirmation to channel: ${channel}`);
      const response = await client.chat.postMessage({
        channel: channel,
        text: `✅ Note created in Closot! <${domain}/notes/${newNoteId}|View Note>`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*<${domain}/notes/${newNoteId}|${title}>*\n\n${slackUserName} created this issue in Closot.`
            }
          }
        ]
      });
      console.log(`[Slack Service] Confirmation sent! Message TS: ${response.ts}`);
      if (response.ts) {
        // Send a threaded reply actually into Slack to force the thread to initialize
        const targetTs = String(response.ts);
        console.log(`[Slack Service] Attempting to attach explicitly to thread_ts: ${targetTs}`);
        const threadReply = await client.chat.postMessage({
          channel: channel,
          thread_ts: targetTs,
          text: `Thread attached! Replies here will sync directly to Closot.`
        });
        console.log(`[Slack Service] Thread Initialization API Response:`, JSON.stringify({ ok: threadReply.ok, ts: threadReply.ts, message_ts: threadReply.message?.ts }));

        console.log(`[Slack Service] Initializing thread attachment via SlackCommentService...`);
        // Send a threaded reply to initialize the sync thread
        const { SlackCommentService } = require("@/services/slackCommentService");
        try {
          await SlackCommentService.addSlackSyncComment({
            commenterName: userName,
            commenterEmail: connection.userEmail!,
            text: "Thread attached! Replies here will sync directly to Books.",
            blockIds: [String(newNoteId)],
            commentId: new ObjectId().toString(),
            slackChannelId: channel,
            slackThreadTs: response.ts
          });
          console.log(`[Slack Service] Attached NEW thread ${response.ts} to Note ${newNoteId}`);
        } catch (syncError) {
          console.error(`[Slack Service] Failed to attach sync comment thread:`, syncError);
        }
      }
    } catch (e: any) {
      if (e.data?.error === 'not_in_channel' || e.data?.error === 'channel_not_found') {
        // Fallback: Bot is not in the channel, send a DM directly instead
        const fallbackResponse = await client.chat.postMessage({
          channel: user.id,
          text: `✅ Note created in Closot! <${domain}/notes/${newNoteId}|View Note>`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*<${domain}/notes/${newNoteId}|${title}>*\n\n(Sent via DM because I'm not in the channel)`
              }
            }
          ]
        });

        if (fallbackResponse.ts) {
          // Send a threaded reply actually into Slack to force the thread to initialize
          await client.chat.postMessage({
            channel: user.id,
            thread_ts: fallbackResponse.ts,
            text: `Thread attached! Replies here will sync directly to Closot.`
          });

          const { SlackCommentService } = require("@/services/slackCommentService");
          try {
            await SlackCommentService.addSlackSyncComment({
              commenterName: userName,
              commenterEmail: connection.userEmail!,
              text: "Thread attached! Replies here will sync directly to Books.",
              blockIds: [String(newNoteId)],
              commentId: new ObjectId().toString(),
              slackChannelId: user.id, // Thread lives in the DM channel
              slackThreadTs: fallbackResponse.ts
            });
          } catch (dmSyncError) {
            console.error(`[Slack Service] Failed to attach sync comment thread to fallback DM:`, dmSyncError);
          }
        }
      } else {
        console.error(`[Slack Service] Error posting confirmation message:`, e);
      }
    }
  },

  /**
   * Handle the /books search slash cowmmand
   */
  async handleSlashCommand(payload: any) {
    const { text, user_id, team_id, trigger_id } = payload;
    const textLower = (text || "").toLowerCase().trim();

    // Route subcommands
    if (textLower === "createpublicpage") {
      await this.openCreateNoteModal({ trigger_id, teamId: team_id, pageType: "public" });
      return { response_type: "ephemeral", text: "Opening creation modal..." };
    }

    if (textLower === "createprivatepage") {
      await this.openCreateNoteModal({ trigger_id, teamId: team_id, pageType: "private" });
      return { response_type: "ephemeral", text: "Opening creation modal..." };
    }

    // Workspace switcher - show modal to select workspace
    if (textLower === "workspaces") {
      await this.openWorkspaceSwitcherModal({ trigger_id, userId: user_id, teamId: team_id });
      return { response_type: "ephemeral", text: "Opening workspace selector..." };
    }

    // Info command - show connected workspace
    if (textLower === "info" || textLower === "help") {
      const metadataClient = await clusterManager.getMetadataClient();
      const metadataDb = metadataClient.db();
      const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
      const connection = await slackCollection.findOne({ slackUserId: user_id, slackTeamId: team_id });

      if (!connection) {
        return {
          response_type: "ephemeral",
          text: "❌ You need to connect Books in your settings first!"
        };
      }

      // Get workspace name
      const workspacesColl = metadataDb.collection("workspaces");
      const workspace = await workspacesColl.findOne({ _id: new ObjectId(connection.workspaceId) });
      const workspaceName = workspace?.name || "Unknown Workspace";

      return {
        response_type: "ephemeral",
        text: `📚 *Books Slack Integration*\n\n*Connected Workspace:* ${workspaceName}\n\n*Available Commands:*\n• \`/books createPublicPage\` - Create public note\n• \`/books createPrivatePage\` - Create private note\n• \`/books search <query>\` - Search notes\n• \`/books info\` - Show this info\n\n_All commands will create/search notes in: *${workspaceName}*_`
      };
    }

    // Search — must explicitly start with "search <query>"
    if (textLower.startsWith("search ")) {
      const query = textLower.slice("search ".length).trim();

      if (!query) {
        return {
          response_type: "ephemeral",
          text: "Please provide a search query. Usage: `/books search <query>`"
        };
      }

      // 1. Get user's connection
      const metadataClient = await clusterManager.getMetadataClient();
      const metadataDb = metadataClient.db();
      const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");
      const connection = await slackCollection.findOne({ slackUserId: user_id, slackTeamId: team_id });

      if (!connection || !connection.workspaceId) {
        console.warn(`[Slack Service] No connection found for user ${user_id} in team ${team_id}`);
        return {
          response_type: "ephemeral",
          text: "❌ You need to connect Books in your settings first!"
        };
      }

      console.log(`[Slack Service] Searching for "${query}" in workspace ${connection.workspaceId}`);

      // 2. Search for notes (Broad fetch, filtering by Auth below)
      const blocksColl = metadataDb.collection<IBlock>("blocks");
      const rawResults = await blocksColl.find({
        workspaceId: String(connection.workspaceId),
        blockType: "page",
        status: "alive",
        "value.title": { $regex: query, $options: "i" }
      } as any).toArray();

      console.log(`[Slack Service] Found ${rawResults.length} raw results for query "${query}"`);

      if (rawResults.length === 0) {
        return {
          response_type: "ephemeral",
          text: `🔍 No notes found matching "${query}"`
        };
      }

      // 3. Format context-aware results & enforce permissions
      const domain = process.env.DOMAIN || `https://${process.env.NEXT_PUBLIC_APP_URL}`;
      const resultBlocks: any[] = [];
      let authorizedCount = 0;

      for (const note of rawResults) {
        if (authorizedCount >= 5) break;

        // A. Authorization check
        const hasAccess = await PermissionService.checkAccess({
          userId: connection.userId || "",
          blockId: String(note._id),
          requiredRole: "viewer",
          workspaceId: String(connection.workspaceId)
        });

        if (!hasAccess) continue;
        authorizedCount++;

        const title = (note.value as IPage).title || "Untitled";
        const icon = (note.value as IPage).icon || "📄";
        const url = `${domain}/notes/${note._id}`;

        // B. Context Check: Standard Page vs Database Item
        const isDatabaseItem = (note.value as IPage & { databaseProperties?: any }).databaseProperties !== undefined;

        if (isDatabaseItem) {
          // --- DATABASE ITEM UI (Linear Style) ---
          const dbProps = (note.value as any).databaseProperties || {};
          const fields: any[] = [];

          // Fetch the Data Source schema to map IDs to Names
          const dataSourceColl = metadataDb.collection("databaseSources");
          const dataSource = await dataSourceColl.findOne({
            blockIds: String(note._id)
          });

          if (dataSource && dataSource.properties) {
            let statusField: any = null;
            let priorityField: any = null;
            let assigneeField: any = null;

            const props = Object.entries(dataSource.properties).map(([id, p]: any) => ({ id, ...p }));

            // Priority
            const prioProp = props.find(p => p.name?.toLowerCase().includes("priority"));
            if (prioProp) {
              const val = dbProps[prioProp.id];
              if (val != null) priorityField = { type: "mrkdwn", text: `*Priority*\n${val}` };
            }

            // Status
            const statProp = props.find(p => p.type === "status" && p.name?.toLowerCase() !== "priority");
            if (statProp) {
              let val = dbProps[statProp.id];
              if (val != null) {
                if (statProp.options) {
                  const opt = statProp.options.find((o: any) => o.id === val);
                  if (opt) val = opt.name;
                }
                statusField = { type: "mrkdwn", text: `*Status*\n${val}` };
              }
            }

            // Assignee
            const personProp = props.find(p => p.type === "person" || p.name?.toLowerCase().includes("assignee"));
            if (personProp) {
              const val = dbProps[personProp.id];
              if (val != null) {
                let display = String(val);
                if (Array.isArray(val)) display = `${val.length} assigned`;
                assigneeField = { type: "mrkdwn", text: `*Assignee*\n${display}` };
              }
            }

            // Push non-null fields
            [statusField, priorityField, assigneeField].forEach(f => {
              if (f) fields.push(f);
            });
          }

          const blockUI: any = {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${icon} *<${url}|${title}>*\n_Database Row_`
            }
          };

          if (fields.length > 0) {
            blockUI.fields = fields;
          }

          resultBlocks.push(blockUI);
        } else {
          // --- STANDARD PAGE UI ---
          resultBlocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${icon} *<${url}|${title}>*\n_Standard Page_`
            }
          });
        }
      }

      if (resultBlocks.length === 0) {
        return {
          response_type: "ephemeral",
          text: `🔍 Found matching items, but you do not have permission to view them.`
        };
      }

      return {
        response_type: "ephemeral",
        text: `🔎 Results for "${query}":`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `🔎 Top Results for *${query}*:` } },
          { type: "divider" },
          ...resultBlocks
        ]
      };
    }

    // Unknown command — show help
    return {
      response_type: "ephemeral",
      text: `❓ Unknown command. Available commands:\n• \`/books createPublicPage\` - Create public note\n• \`/books createPrivatePage\` - Create private note\n• \`/books search <query>\` - Search notes\n• \`/books workspaces\` - Switch workspace\n• \`/books info\` - Show connected workspace`
    };
  },

  /**
   * Handle /books workspace command for managing workspace selection
   */
};
