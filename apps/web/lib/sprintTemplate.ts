import { ObjectId } from "bson";
import type { ViewType } from "@/models/types/DatabaseSource";
import { BoardProperty, DatabaseSource, View, ViewCollection } from "@/types/board";
import { generateSprintPageAndBoard } from "./createSprintPage";

export interface SprintTemplateOptions {
    workspaceId: string;
    userEmail: string;
    sprintsBlockId: string; // The collection_view block ID for Sprints
    tasksBlockId: string; // The collection_view block ID for Tasks
    sprintBoardBlockId: string; // The collection_view block ID for Sprint Board
}

export function createSprintTemplate({
    workspaceId,
    userEmail,
    sprintsBlockId,
    tasksBlockId,
    sprintBoardBlockId
}: SprintTemplateOptions): {
    sprintsDataSource: DatabaseSource;
    tasksDataSource: DatabaseSource;
    sprintsViewDatabase: ViewCollection;
    tasksViewDatabase: ViewCollection;
    sprintBoardDatabase: ViewCollection;
    sprintsViewType: View;
    tasksViewType: View;
    sprintsPageBlocks: any[];
} {

    // --- ID Generation ---
    // Database IDs
    const sprintsDataSourceId = new ObjectId().toString();
    const tasksDataSourceId = new ObjectId().toString();

    // Tasks Properties
    const assigneePropertyId = `prop_${new ObjectId().toString()}`;
    const createdPropertyId = `prop_${new ObjectId().toString()}`;
    const dueDatePropertyId = `prop_${new ObjectId().toString()}`;
    const statusPropertyId = `prop_${new ObjectId().toString()}`;

    // Status Options for Tasks
    const todoOptionId = `opt_${new ObjectId().toString()}`;
    const inProgressOptionId = `opt_${new ObjectId().toString()}`;
    const doneOptionId = `opt_${new ObjectId().toString()}`;

    // Sprints Properties
    const sprintStatusPropertyId = `prop_${new ObjectId().toString()}`;
    const sprintDatesPropertyId = `prop_${new ObjectId().toString()}`;
    const sprintIdPropertyId = `prop_${new ObjectId().toString()}`;
    const completedTasksRollupId = `prop_${new ObjectId().toString()}`;
    const totalTaskRollupId = `prop_${new ObjectId().toString()}`;

    // Sprint Status option IDs — named so currentStatusOptionId is available for the dynamic filter
    const currentStatusOptionId = `opt_${new ObjectId().toString()}`;
    const nextStatusOptionId = `opt_${new ObjectId().toString()}`;
    const futureStatusOptionId = `opt_${new ObjectId().toString()}`;
    const lastStatusOptionId = `opt_${new ObjectId().toString()}`;
    const pastStatusOptionId = `opt_${new ObjectId().toString()}`;

    // Relation IDs
    const sprintRelationId = `prop_${new ObjectId().toString()}`; // defined in tasks
    const taskRelationId = `prop_${new ObjectId().toString()}`;   // defined in sprints

    // 1. Create Sprints DataSource
    const sprintsDataSource: DatabaseSource = {
        _id: sprintsDataSourceId,
        title: "Sprints",
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        properties: {
            [sprintStatusPropertyId]: {
                name: "Sprint Status",
                type: "status",
                options: [
                    { id: currentStatusOptionId, name: "Current", color: "blue" },
                    { id: nextStatusOptionId, name: "Next", color: "purple" },
                    { id: futureStatusOptionId, name: "Future", color: "gray" },
                    { id: lastStatusOptionId, name: "Last", color: "orange" },
                    { id: pastStatusOptionId, name: "Past", color: "default" }
                ],
                default: true,
                showProperty: true,
                specialProperty: true,
            },
            [sprintDatesPropertyId]: {
                name: "dates",
                type: "date",
                showProperty: true,
                default: true,
                options: [],
                specialProperty: true,
            },
            [taskRelationId]: {
                name: "Task Tracker",
                type: "relation",
                linkedDatabaseId: tasksDataSourceId,
                syncedPropertyId: sprintRelationId,
                syncedPropertyName: "Sprint",
                relationLimit: "multiple",
                showProperty: true,
                twoWayRelation: true,
                default: true,
                options: [],
                specialProperty: true,
            },
            [completedTasksRollupId]: {
                name: "Completed tasks",
                type: "rollup",
                // @ts-ignore
                rollup: {
                    relationPropertyId: taskRelationId,
                    relationDataSourceId: tasksDataSourceId,
                    targetPropertyId: statusPropertyId,
                    calculation: { category: "percent", value: "per_group" },
                    selectedOptions: [doneOptionId]
                },
                showProperty: true,
                default: true,
                options: [],
                numberFormat: "number",
                decimalPlaces: 0,
                showAs: "ring",
                progressColor: "blue",
                progressDivideBy: 100,
                showNumberText: true,
                specialProperty: true,
            },
            [totalTaskRollupId]: {
                name: "Total Task",
                type: "rollup",
                // @ts-ignore
                rollup: {
                    relationPropertyId: taskRelationId,
                    relationDataSourceId: tasksDataSourceId,
                    targetPropertyId: statusPropertyId,
                    calculation: { category: "count", value: "all" },
                    selectedOptions: undefined
                },
                showProperty: true,
                default: false,
                options: [],
                numberFormat: undefined,
                decimalPlaces: undefined,
                showAs: undefined,
                progressColor: undefined,
                progressDivideBy: undefined,
                showNumberText: undefined,
                specialProperty: true,
            },
            [sprintIdPropertyId]: {
                name: "Sprint ID",
                type: "id",
                showProperty: true,
                default: true,
                options: [],
                specialProperty: true,
            }
        },
        settings: {},
        pairedDataSourceId: tasksDataSourceId, // Sprints → Tasks (skip relation traversal)
        workspaceId,
        isSprint: true, // Explicitly false as per user request snippet
        isSprintOn: false,
        lastSprintId: 3, // 3 initial sprint pages are created (Sprint 1, 2, 3)
        blockIds: [],
        mainView: sprintsBlockId,
    };

    // 2. Create Tasks DataSource (Task Tracker)
    const tasksDataSource: DatabaseSource = {
        _id: tasksDataSourceId,
        title: "Task Tracker",
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        properties: {
            [assigneePropertyId]: {
                name: "Assignee",
                type: "person",
                showProperty: true,
                default: true,
                options: [],
                specialProperty: true,
            },
            [createdPropertyId]: {
                name: "created",
                type: "date",
                showProperty: true,
                default: true,
                options: [],
                specialProperty: true,
            },
            [dueDatePropertyId]: {
                name: "Due Date",
                type: "date",
                showProperty: true,
                default: false,
                options: [],
                specialProperty: true,
            },
            [statusPropertyId]: {
                name: "Status",
                type: "status",
                options: [
                    { id: todoOptionId, name: "Todo", color: "blue" },
                    { id: inProgressOptionId, name: "In Progress", color: "green" },
                    { id: doneOptionId, name: "Done", color: "gray" }
                ],
                showProperty: false,
                default: true,
                specialProperty: true,
            },
            [sprintRelationId]: {
                name: "Sprint",
                type: "relation",
                linkedDatabaseId: sprintsDataSourceId,
                relationLimit: "multiple",
                displayProperties: [],
                showProperty: true,
                default: true,
                twoWayRelation: true,
                syncedPropertyId: taskRelationId,
                syncedPropertyName: "Task Tracker",
                options: [],
                specialProperty: true,
            }
        },
        settings: {},
        pairedDataSourceId: sprintsDataSourceId, // Tasks → Sprints (skip relation traversal)
        workspaceId,
        isSprint: false,
        isSprintOn: true,
        blockIds: [],
        mainView: tasksBlockId,
    };

    // 3. Create Sprints View (List View)
    const sprintsViewId = new ObjectId().toString();
    const sprintsViewType: View = {
        _id: sprintsViewId,
        viewType: "list",
        icon: "",
        title: "List View",
        databaseSourceId: sprintsDataSourceId,
        viewDatabaseId: sprintsBlockId,
        settings: {
            propertyVisibility: [
                { propertyId: sprintStatusPropertyId },
                { propertyId: sprintIdPropertyId },
                { propertyId: completedTasksRollupId }
            ],
            filters: [],
            advancedFilters: [],
            group: undefined
        }
    };

    const sprintsViewDatabase: ViewCollection = {
        title: "Sprints",
        icon: "",
        viewsTypes: [sprintsViewType],
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        },
    };

    // 4. Create Tasks View (Board View)
    const tasksViewId = new ObjectId().toString();
    const tasksViewType: View = {
        _id: tasksViewId,
        viewType: "board",
        icon: "",
        title: "Board View",
        databaseSourceId: tasksDataSourceId,
        viewDatabaseId: tasksBlockId,
        settings: {
            propertyVisibility: [
                { propertyId: assigneePropertyId },
                { propertyId: createdPropertyId },
                { propertyId: dueDatePropertyId },
                { propertyId: statusPropertyId },
                { propertyId: sprintRelationId },
            ],
            filters: [],
            advancedFilters: [],
            group: {
                propertyId: statusPropertyId,
            } as any
        }
    };

    const tasksViewDatabase: ViewCollection = {
        title: "Task Tracker",
        icon: "",
        viewsTypes: [tasksViewType],
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        },
    };

    // 5. Create Sprint Board for Task Tracker
    const sprintBoardViewId1 = new ObjectId().toString(); // Current Sprint
    const sprintBoardViewId2 = new ObjectId().toString(); // Sprint planning
    const sprintBoardViewId3 = new ObjectId().toString(); // Backlogs

    const sprintBoardDatabase: ViewCollection = {
        title: "Sprint Board",
        icon: "",
        viewsTypes: [
            {
                _id: sprintBoardViewId1,
                viewType: "board",
                icon: "▶️",
                title: "Current Sprint",
                databaseSourceId: tasksDataSourceId,
                viewDatabaseId: sprintBoardBlockId,
                settings: {
                    filters: [],
                    // Dynamic filter: shows tasks whose linked Sprint has Sprint Status = "Current"
                    // Auto-updates when any Sprint's status changes to "Current"
                    advancedFilters: [{
                        id: `group-current-sprint`,
                        booleanOperator: "AND",
                        rules: [{
                            propertyId: sprintRelationId,
                            nestedPropertyId: sprintStatusPropertyId,
                            operator: "equals",
                            value: currentStatusOptionId
                        } as any],
                        groups: []
                    }],
                    propertyVisibility: [
                        { propertyId: assigneePropertyId },
                        { propertyId: createdPropertyId },
                        { propertyId: dueDatePropertyId },
                        { propertyId: statusPropertyId },
                        { propertyId: sprintRelationId }
                    ],
                    group: {
                        propertyId: statusPropertyId,
                    } as any
                }
            },
            {
                _id: sprintBoardViewId2,
                viewType: "list",
                icon: "⚡",
                title: "Sprint planning",
                databaseSourceId: tasksDataSourceId,
                viewDatabaseId: sprintBoardBlockId,
                settings: {
                    propertyVisibility: [
                        { propertyId: statusPropertyId },
                        { propertyId: assigneePropertyId },
                        { propertyId: dueDatePropertyId },
                        { propertyId: completedTasksRollupId },
                        { propertyId: sprintRelationId },
                        { propertyId: createdPropertyId }
                    ],
                    filters: [
                        {
                            propertyId: statusPropertyId,
                            value: [todoOptionId, inProgressOptionId]
                        }
                    ],
                    advancedFilters: [],
                    group: {
                        propertyId: sprintRelationId,
                        hideEmptyGroups: false,
                        colorColumn: false
                    } as any
                }
            },
            {
                _id: sprintBoardViewId3,
                viewType: "list",
                icon: "⏳",
                title: "Backlogs",
                databaseSourceId: tasksDataSourceId,
                viewDatabaseId: sprintBoardBlockId,
                settings: {
                    propertyVisibility: [
                        { propertyId: statusPropertyId },
                        { propertyId: completedTasksRollupId },
                        { propertyId: sprintRelationId }
                    ],
                    filters: [],
                    advancedFilters: [
                        {
                            id: `group-${Date.now()}`,
                            booleanOperator: "OR",
                            rules: [
                                {
                                    propertyId: sprintRelationId,
                                    operator: "is_empty",
                                    value: "",
                                    booleanOperator: "OR"
                                },
                                {
                                    propertyId: statusPropertyId,
                                    operator: "not_equals",
                                    value: doneOptionId,
                                    booleanOperator: "OR"
                                }
                            ],
                            groups: []
                        }
                    ],
                    group: undefined
                }
            }
        ],
        createdBy: {
            userId: userEmail,
            userName: userEmail,
            userEmail,
        },
    };

    // 5. Generate Initial Spring Pages
    const sprintStatusesArray = [
        { name: "Sprint 1", statusName: "Current" },
        { name: "Sprint 2", statusName: "Next" },
        { name: "Sprint 3", statusName: "Future" }
    ];

    // We need to look up the ID for each status name we created in sprintsDataSource
    const statusOptions = sprintsDataSource.properties?.[sprintStatusPropertyId]?.options || [];

    const sprintsPageBlocks = sprintStatusesArray.map((spt, index) => {
        const matchedStatusObj = statusOptions.find((opt: any) => opt.name === spt.statusName);
        const pageResult = generateSprintPageAndBoard({
            workspaceId,
            userEmail,
            sprintsBlockId,
            sprintsDataSourceId,
            tasksDataSourceId,
            assigneePropertyId,
            dueDatePropertyId,
            statusPropertyId,
            sprintRelationId,
            createdPropertyId,
            sprintName: spt.name,
            sprintStatusPropertyId,
            sprintStatusId: matchedStatusObj ? matchedStatusObj.id : undefined,
            sprintIdPropertyId
        });

        // Inject sequential numeric sprint ID (1-indexed) into initial pages
        if (sprintIdPropertyId) {
            if (!pageResult.pageBlock.value.databaseProperties) {
                pageResult.pageBlock.value.databaseProperties = {};
            }
            pageResult.pageBlock.value.databaseProperties[sprintIdPropertyId] = index + 1;
        }

        return pageResult;
    });

    // Populate the blockIds for the Sprints Data Source so they render initially
    sprintsDataSource.blockIds = sprintsPageBlocks.map(blockSet => blockSet.pageBlock._id);

    return {
        sprintsDataSource,
        tasksDataSource,
        sprintsViewDatabase,
        tasksViewDatabase,
        sprintBoardDatabase,
        sprintsViewType,
        tasksViewType,
        sprintsPageBlocks
    };
}
