import { ObjectId } from "bson";
import type { ViewType } from "@/models/types/DatabaseSource";
import { BoardProperty, DatabaseSource, View, ViewCollection } from "@/types/board";
import { generateSprintPageAndBoard } from "./createSprintPage";

export interface ConvertSprintCoreOptions {
    workspaceId: string;
    userEmail: string;
    sprintsBlockId: string;
    sprintsDataSourceId: string;
    tasksDataSourceId: string; // Needed to set pairedDataSourceId at creation time
}

export function generateSprintsDatabaseCore({
    workspaceId,
    userEmail,
    sprintsBlockId,
    sprintsDataSourceId,
    tasksDataSourceId,
}: ConvertSprintCoreOptions): {
    sprintsDataSource: DatabaseSource;
    sprintsViewDatabase: ViewCollection;
    sprintsViewType: View;
    sprintStatusPropertyId: string;
    sprintDatesPropertyId: string;
    sprintIdPropertyId: string;
    completedTasksRollupId: string;
    totalTaskRollupId: string;
    currentStatusOptionId: string;
} {
    // Sprints Properties
    const sprintStatusPropertyId = `prop_${new ObjectId().toString()}`;
    const sprintDatesPropertyId = `prop_${new ObjectId().toString()}`;
    const sprintIdPropertyId = `prop_${new ObjectId().toString()}`;
    const completedTasksRollupId = `prop_${new ObjectId().toString()}`;
    const totalTaskRollupId = `prop_${new ObjectId().toString()}`;
    // Store the "Current" option ID so the dynamic filter can reference it at creation time
    const currentStatusOptionId = `opt_${new ObjectId().toString()}`;
    const nextStatusOptionId = `opt_${new ObjectId().toString()}`;
    const futureStatusOptionId = `opt_${new ObjectId().toString()}`;
    const lastStatusOptionId = `opt_${new ObjectId().toString()}`;
    const pastStatusOptionId = `opt_${new ObjectId().toString()}`;

    // 1. Create Sprints DataSource (Core Properties Only)
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
        pairedDataSourceId: tasksDataSourceId, // Sprints → Tasks (set at creation, no post-update needed)
        workspaceId,
        isSprint: true,
        isSprintOn: false,
        lastSprintId: 3, // 3 initial sprint pages are created (Sprint 1, 2, 3)
        blockIds: [],
        mainView: sprintsBlockId,
    };

    // 2. Create Sprints View (List View)
    const sprintsViewId = new ObjectId().toString();
    const sprintsViewType: View = {
        _id: sprintsViewId,
        viewType: "list",
        icon: "",
        title: "Sprints",
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

    return {
        sprintsDataSource,
        sprintsViewDatabase,
        sprintsViewType,
        sprintStatusPropertyId,
        sprintDatesPropertyId,
        sprintIdPropertyId,
        completedTasksRollupId,
        totalTaskRollupId,
        currentStatusOptionId
    };
}


export interface ConvertSprintBoardOptions {
    workspaceId: string;
    userEmail: string;
    sprintsBlockId: string;
    sprintsDataSource: DatabaseSource; // Hydrated with active relation
    tasksBlockId: string; // The existing Board view ID
    sprintBoardBlockId: string; // The collection_view block ID for Sprint Board
    existingTasksDataSource: DatabaseSource; // Mandatory for conversion
    sprintRelationId: string; // Mandatory injected relation mapped on tasks Data Source
    reverseTaskRelationId: string; // The relation ID mapped on the Sprints Data Source by the backend
    sprintStatusPropertyId: string;
    taskAssigneePropertyId?: string;
    taskDueDatePropertyId?: string;
    taskCreatedPropertyId?: string;
    taskStatusPropertyId?: string;
    taskStatusOptions?: any[];
    completedTasksRollupId: string;
    totalTaskRollupId: string;
    currentStatusOptionId: string;
    sprintIdPropertyId: string;
}

export function generateSprintBoardAndPages({
    workspaceId,
    userEmail,
    sprintsBlockId,
    sprintsDataSource,
    tasksBlockId,
    sprintBoardBlockId,
    existingTasksDataSource,
    sprintRelationId,
    reverseTaskRelationId,
    sprintStatusPropertyId,
    taskAssigneePropertyId,
    taskDueDatePropertyId,
    taskCreatedPropertyId,
    taskStatusPropertyId,
    taskStatusOptions,
    completedTasksRollupId,
    totalTaskRollupId,
    currentStatusOptionId,
    sprintIdPropertyId
}: ConvertSprintBoardOptions): {
    sprintBoardDatabase: ViewCollection;
    sprintsPageBlocks: any[];
} {
    const tasksDataSourceId = existingTasksDataSource._id;
    const sprintsDataSourceId = sprintsDataSource._id;

    // Helper to find prop IDs
    const extPropsEntries = Object.entries(existingTasksDataSource.properties || {}) as [string, any][];

    // Tasks Properties
    const assigneePropertyId = taskAssigneePropertyId || extPropsEntries.find(([_, p]) => p.type === "person")?.[0];
    const createdPropertyId = taskCreatedPropertyId || extPropsEntries.find(([_, p]) => p.type === "date" && p.name.toLowerCase().includes("created"))?.[0];
    const dueDatePropertyId = taskDueDatePropertyId || extPropsEntries.find(([_, p]) => p.type === "date" && p.name.toLowerCase().includes("due"))?.[0];
    const statusPropertyId = taskStatusPropertyId || extPropsEntries.find(([_, p]) => p.type === "status")?.[0];

    // Status Options for Tasks
    const existingStatusProp = statusPropertyId ? existingTasksDataSource.properties?.[statusPropertyId] : undefined;
    const opts = (taskStatusOptions && taskStatusOptions.length > 0) ? taskStatusOptions : (existingStatusProp?.options || []);
    const todoOptionId = opts[0]?.id || `opt_${new ObjectId().toString()}`;
    const inProgressOptionId = opts.length > 1 ? opts[1]?.id || `opt_${new ObjectId().toString()}` : `opt_${new ObjectId().toString()}`;

    // Find the option indicating completion, or default to the last one
    let doneOpt = opts.find((o: any) => o.name?.toLowerCase().includes("done") || o.name?.toLowerCase().includes("complet"));
    if (!doneOpt && opts.length > 0) {
        doneOpt = opts[opts.length - 1]; // Assume last option is "Done"
    }
    const doneOptionId = doneOpt?.id || `opt_${new ObjectId().toString()}`;

    // Inject the Rollups into the active Sprint Data Source Schema
    sprintsDataSource.properties![completedTasksRollupId] = {
        name: "Completed tasks",
        type: "rollup",
        rollup: {
            relationPropertyId: reverseTaskRelationId,
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
    } as any;

    sprintsDataSource.properties![totalTaskRollupId] = {
        name: "Total Task",
        type: "rollup",
        rollup: {
            relationPropertyId: reverseTaskRelationId,
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
    } as any;


    // 3. Create Sprint Board for Task Tracker
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
                    propertyVisibility: [
                        { propertyId: assigneePropertyId },
                        { propertyId: createdPropertyId },
                        { propertyId: dueDatePropertyId },
                        { propertyId: statusPropertyId },
                        { propertyId: sprintRelationId }
                    ].filter(p => !!p.propertyId) as any,
                    filters: [],
                    // Dynamic filter: shows tasks whose linked Sprint has Sprint Status = "Current"
                    // This automatically updates when any Sprint's status is changed to "Current"
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
                        { propertyId: sprintRelationId },
                        { propertyId: createdPropertyId }
                    ].filter(p => !!p.propertyId) as any,
                    filters: statusPropertyId
                        ? [
                            {
                                propertyId: statusPropertyId,
                                value: [todoOptionId, inProgressOptionId]
                            }
                        ]
                        : [],
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
                        { propertyId: sprintRelationId }
                    ].filter(p => !!p.propertyId) as any,
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
                                statusPropertyId ? {
                                    propertyId: statusPropertyId,
                                    operator: "not_equals",
                                    value: doneOptionId,
                                    booleanOperator: "OR"
                                } : null
                            ].filter(Boolean) as any,
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

    // 4. Generate Initial Sprints
    const sprintsPageBlocks: any[] = [];
    const sprintNames = ["Sprint 1", "Sprint 2", "Sprint 3"];

    sprintNames.forEach((sprintName, index) => {
        const result = generateSprintPageAndBoard({
            sprintName,
            sprintsDataSourceId,
            tasksDataSourceId,
            sprintsBlockId,
            sprintStatusId: sprintsDataSource.properties![sprintStatusPropertyId]!.options![index]!.id,
            sprintStatusPropertyId,
            sprintIdPropertyId,
            // Tasks linking configs
            assigneePropertyId,
            dueDatePropertyId,
            createdPropertyId,
            statusPropertyId,
            sprintRelationId,
            workspaceId,
            userEmail
        });

        // Inject sequential numeric sprint ID (1-indexed)
        if (sprintIdPropertyId) {
            if (!result.pageBlock.value.databaseProperties) {
                result.pageBlock.value.databaseProperties = {};
            }
            result.pageBlock.value.databaseProperties[sprintIdPropertyId] = index + 1;
        }

        sprintsPageBlocks.push(result);
        sprintsDataSource.blockIds?.push(result.pageBlock._id);
    });

    // Link dynamic first-sprint to the Current Sprint Board view 
    if (sprintsPageBlocks.length > 0) {
        const filters = sprintBoardDatabase.viewsTypes?.[0]?.settings?.filters;
        if (filters && filters.length > 0) {
            filters[0] = {
                propertyId: sprintRelationId,
                value: [sprintsPageBlocks[0]!.pageBlock._id]
            };
        }
    }

    return {
        sprintBoardDatabase,
        sprintsPageBlocks
    };
}
