"use client";

import { postWithAuth } from "@/lib/api-helpers";
import { BoardProperty, BoardPropertyOption, DatabaseSource, ViewCollection } from "@/types/board";
import { toast } from "sonner";
import { useBoard } from "@/contexts/boardContext";
import { Block } from "@/types/block";

/**
 * Reorder status property options (used in drag and drop column reordering)
 */
export const handleReorderPropertyOptions = async (
  board: Block,
  propertyId: string,
  newName: string,
  newOptions: BoardPropertyOption[],
  getCurrentDataSource: (boardId : string) => DatabaseSource | undefined
) => {
  try {
    console.log("Printing from HandleReorder Property Option ++ ", board, propertyId, newName, newOptions)
    // const property = board.properties[propertyId];
    // if (!property) {
    //   console.error("Property not found:", propertyId);
    //   return;
    // }


    let dataSourceId: string | null = null;
    const dataSource = getCurrentDataSource(board._id);
    if(dataSource){
      dataSourceId = dataSource._id;
    } 

    if (!dataSource) {
      toast.error("Data source not found for current view!");
      return null;
    }

    const property = dataSource.properties[propertyId] as BoardProperty;

    console.log("Reordering property options:", {
      propertyId,
      newName,
      newOptions,
      dataSourceId,
      property
    });

    const res = await postWithAuth(`/api/database/updatePropertySchema`, {
      dataSourceId: dataSourceId,
      blockId: board._id, // Optional for audit
      propertyId,
      newName,
      type: property.type,
      options: newOptions,
    });

    if (!res.success) {
      toast.error("Failed to reorder property options!");
      return null;
    }

    toast.success("Property options reordered successfully!");
    // Return both properties and dataSource for the caller to update context
    return {
      // properties: res.view?.properties || board.properties,
      dataSource: res.dataSource as DatabaseSource,
    };
  } catch (err) {
    console.error("Error reordering property options:", err);
    toast.error("Could not reorder property options!");
    return null;
  }
};
