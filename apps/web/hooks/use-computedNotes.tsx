"use client";

import { useMemo } from "react";
import { Block } from "@/types/block";
import {
    createFormulaRuntime,
    buildFormulaDefinitionsFromSchema,
    FormulaNoteLike
} from "@/lib/formula/evaluator";
import { computeRollupData, getRollupComparableValue } from "@/utils/rollupUtils";
import { DatabaseSource, BoardProperties } from "@/types/board";

/**
 * Hook to recompute rollups and formulas for a set of notes on-the-fly.
 * This follows Notion's approach of derived state rather than persisting results.
 */
export function useComputedNotes(
    notes: Block[],
    properties: Record<string, any>,
    boardId: string,
    getNotesByDataSourceId: (dataSourceId: string) => Block[],
    getDataSource: (dataSourceId: string) => DatabaseSource | undefined
): Block[] {
    return useMemo(() => {
        if (!notes || notes.length === 0 || !properties || Object.keys(properties).length === 0) {
            return notes;
        }

        // 1. Identify formula and rollup properties
        const propertyEntries = Object.entries(properties);
        const rollupProperties = propertyEntries.filter(([_, p]) => p.type === "rollup");
        const hasRollups = rollupProperties.length > 0;

        const definitions = buildFormulaDefinitionsFromSchema(properties);
        const runtime = createFormulaRuntime(definitions);
        
        const hasFormulas = runtime.hasFormulas;

        // If no rollups or formulas exist, just return original notes
        if (!hasRollups && !hasFormulas) {
            return notes;
        }

        // 2. Process each note
        return notes.map((originalNote) => {
            // Start with a clone of the note's properties
            const computedProperties = { ...(originalNote.value.databaseProperties || {}) };
            const formulaErrors = { ...(originalNote.value.formulaErrors || {}) };

            // 3. Compute Rollups first
            if (hasRollups) {
                rollupProperties.forEach(([id, schema]) => {
                    const rollupResult = computeRollupData(
                        originalNote,
                        schema,
                        properties as BoardProperties,
                        getNotesByDataSourceId,
                        getDataSource
                    );

                    const comparableValue = getRollupComparableValue(rollupResult);
                    if (comparableValue !== null) {
                        computedProperties[id] = comparableValue;
                    }
                });
            }

            // 4. Compute Formulas second (so they can use computed rollups)
            if (hasFormulas) {
                const noteLike: FormulaNoteLike = {
                    _id: originalNote._id,
                    title: originalNote.value.title,
                    databaseProperties: computedProperties,
                    formulaErrors: formulaErrors,
                };

                const formulaResults = runtime.recomputeFormulasForNote(noteLike);

                // Merge formula results into computedProperties
                Object.assign(computedProperties, formulaResults.note.databaseProperties);
                Object.assign(formulaErrors, formulaResults.note.formulaErrors);
            }

            return {
                ...originalNote,
                value: {
                    ...originalNote.value,
                    databaseProperties: computedProperties,
                    formulaErrors: formulaErrors,
                }
            };
        });
    }, [notes, properties, boardId, getNotesByDataSourceId, getDataSource]);
}
