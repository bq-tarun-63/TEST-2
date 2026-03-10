import { ObjectId } from "bson";

export interface CreateSprintPageOptions {
    workspaceId: string;
    userEmail: string;
    sprintsBlockId: string;
    tasksDataSourceId: string;

    // Task properties for the views
    assigneePropertyId?: string;
    dueDatePropertyId?: string;
    statusPropertyId?: string;
    sprintRelationId: string;
    createdPropertyId?: string;

    // Sprint properties to set on the page
    sprintName: string;
    sprintsDataSourceId: string;
    sprintStatusPropertyId?: string;
    sprintStatusId?: string;
    sprintIdPropertyId?: string;

    // Override pageId if you are attaching to an existing page
    pageId?: string;
}

export function generateSprintPageAndBoard(options: CreateSprintPageOptions) {
    const {
        workspaceId, userEmail, sprintsBlockId, tasksDataSourceId, sprintsDataSourceId,
        assigneePropertyId, dueDatePropertyId, statusPropertyId, sprintRelationId, createdPropertyId,
        sprintName, sprintStatusPropertyId, sprintStatusId, sprintIdPropertyId
    } = options;

    const pageId = options.pageId || new ObjectId().toString();
    const pageBoardBlockId = new ObjectId().toString();
    const pageBoardViewId1 = new ObjectId().toString();
    const pageBoardViewId2 = new ObjectId().toString();

    const sprintDbProperties: any = {};

    if (sprintStatusPropertyId && sprintStatusId) {
        sprintDbProperties[sprintStatusPropertyId] = sprintStatusId;
    }
    if (sprintIdPropertyId) {
        sprintDbProperties[sprintIdPropertyId] = pageId;
    }

    const pageBoardData = {
        title: "Task Board",
        icon: "",
        viewsTypes: [
            {
                _id: pageBoardViewId1,
                viewType: "board",
                icon: "",
                title: "By status",
                databaseSourceId: tasksDataSourceId,
                viewDatabaseId: pageBoardBlockId,
                settings: {
                    propertyVisibility: [
                        { propertyId: assigneePropertyId },
                        { propertyId: dueDatePropertyId }
                    ].filter(p => !!p.propertyId) as any,
                    filters: [
                        {
                            propertyId: sprintRelationId,
                            value: [pageId]
                        }
                    ],
                    advancedFilters: [],
                    group: statusPropertyId ? {
                        propertyId: statusPropertyId,
                    } as any : undefined
                }
            },
            {
                _id: pageBoardViewId2,
                viewType: "list",
                icon: "",
                title: "By assignee",
                databaseSourceId: tasksDataSourceId,
                viewDatabaseId: pageBoardBlockId,
                settings: {
                    propertyVisibility: [
                        { propertyId: assigneePropertyId },
                        { propertyId: createdPropertyId },
                        { propertyId: dueDatePropertyId },
                        { propertyId: statusPropertyId },
                        { propertyId: sprintRelationId }
                    ].filter(p => !!p.propertyId) as any,
                    filters: [
                        {
                            propertyId: sprintRelationId,
                            value: [pageId]
                        }
                    ],
                    advancedFilters: [],
                    group: assigneePropertyId ? {
                        propertyId: assigneePropertyId,
                    } as any : undefined
                }
            }
        ],
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        }
    };

    return {
        pageBlock: {
            _id: pageId,
            blockType: "page" as const,
            workspaceId,
            parentId: sprintsDataSourceId, // They belong directly to the sprints database
            parentType: "collection" as const,
            value: {
                title: sprintName,
                userId: userEmail,
                userEmail: userEmail,
                icon: "",
                coverURL: null,
                pageType: "Viewdatabase_Note",
                isTemplate: false,
                databaseProperties: sprintDbProperties
            },
            workareaId: null,
            blockIds: [pageBoardBlockId],
            status: "alive" as const
        },
        boardBlock: {
            _id: pageBoardBlockId,
            blockType: "collection_view" as const,
            workspaceId,
            parentId: pageId,
            parentType: "page" as const,
            value: pageBoardData,
            workareaId: null,
            blockIds: [],
            status: "alive" as const
        }
    };
}
