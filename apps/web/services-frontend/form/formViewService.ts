import { toast } from "sonner";
import type { BoardProperty, BoardPropertyOption } from "@/types/board";
import { ObjectId } from "bson";
import { updatePropertySchema as updateFormPropertySchema } from "@/services-frontend/boardServices/propertySchemaService";

/**
 * Shared helper functions for basic form view actions.
 */

export const handleSubmitScreen = () => {
  toast.info("Submit screen customization coming soon");
};

export const handleDuplicateQuestion = () => {
  toast.info("Duplicate functionality to be implemented");
};

type GetCurrentDataSourceId = () => string | null;
type GetDataSource = (dataSourceId: string) => any;
type SetDataSource = (dataSourceId: string, dataSource: any) => void;
type UpdateDataSource = (dataSourceId: string, updates: any) => void;

interface PropertyServiceBase {
  boardId: string;
  propertyId: string;
  boardProperties: Record<string, BoardProperty>;
  getCurrentDataSourceId: GetCurrentDataSourceId;
  getDataSource?: GetDataSource;
  setDataSource: SetDataSource;
  updateDataSource?: UpdateDataSource;
}

// Update property schema (options or formMetaData)
export const updatePropertySchema = async ({
  boardId,
  propertyId,
  boardProperties,
  getCurrentDataSourceId,
  getDataSource,
  setDataSource,
  updateDataSource,
  updates,
}: PropertyServiceBase & {
  updates: {
    options?: BoardPropertyOption[];
    formMetaData?: BoardProperty["formMetaData"];
  };
}) => {

  const property = boardProperties[propertyId];
  if (!property) {
    toast.error("Property not found");
    return false;
  }

  const dataSourceId = getCurrentDataSourceId();
  if (!dataSourceId) {
    toast.error("Data source not found for current view!");
    return false;
  }

  try {
    const result = await updateFormPropertySchema(
      {
        dataSourceId,
        blockId: boardId,
        propertyId,
        newName: property.name,
        type: property.type,
        options: updates.options !== undefined ? updates.options : property.options,
        showProperty: property.showProperty,
        ...(updates.formMetaData && { formMetaData: updates.formMetaData }),
      },
      getDataSource,
      updateDataSource,
      setDataSource,
    );

    return result.success || false;
  } catch (err) {
    console.error(err);
    toast.error("Failed to update property");
    return false;
  }
};


// Add a new option to a select/multi-select property
export const addPropertyOption = async ({
  boardId,
  propertyId,
  boardProperties,
  getCurrentDataSourceId,
  getDataSource,
  setDataSource,
  updateDataSource,
  optionName,
}: PropertyServiceBase & { optionName: string }) => {
  const property = boardProperties[propertyId];
  if (!property) {
    toast.error("Property not found");
    return;
  }

  const dataSourceId = getCurrentDataSourceId();
  if (!dataSourceId) {
    toast.error("Data source not found for current view!");
    return;
  }

  const newOptionId = `opt_${new ObjectId()}`;
  const newOption: BoardPropertyOption = {
    id: newOptionId,
    name: optionName.trim(),
    color: "default",
  };

  const updatedOptions = [...(property.options || []), newOption];

  try {
    const result = await updateFormPropertySchema(
      {
        dataSourceId,
        blockId: boardId,
        propertyId,
        newName: property.name,
        type: property.type,
        options: updatedOptions,
        showProperty: property.showProperty,
      },
      getDataSource,
      updateDataSource,
      setDataSource,
    );

    if (result.success) {
      toast.success("Option added");
    }
  } catch (err) {
    console.error(err);
    toast.error("Failed to add option");
  }
};

// Delete an option from a select/multi-select property
export const deletePropertyOption = async ({
  boardId,
  propertyId,
  boardProperties,
  getCurrentDataSourceId,
  getDataSource,
  setDataSource,
  updateDataSource,
  optionId,
}: PropertyServiceBase & { optionId: string }) => {
  const property = boardProperties[propertyId];
  if (!property) {
    toast.error("Property not found");
    return;
  }

  const dataSourceId = getCurrentDataSourceId();
  if (!dataSourceId) {
    toast.error("Data source not found for current view!");
    return;
  }

  const updatedOptions = (property.options || []).filter((opt) => opt.id !== optionId);

  try {
    const result = await updateFormPropertySchema(
      {
        dataSourceId,
        blockId: boardId,
        propertyId,
        newName: property.name,
        type: property.type,
        options: updatedOptions,
        showProperty: property.showProperty,
      },
      getDataSource,
      updateDataSource,
      setDataSource,
    );

    if (result.success) {
      toast.success("Option deleted");
    }
  } catch (err) {
    console.error(err);
    toast.error("Failed to delete option");
  }
};

// Reorder options in a select/multi-select property
export const reorderPropertyOptions = async ({
  boardId,
  propertyId,
  boardProperties,
  getCurrentDataSourceId,
  getDataSource,
  setDataSource,
  updateDataSource,
  optionIds,
}: PropertyServiceBase & { optionIds: string[] }) => {
  const property = boardProperties[propertyId];
  if (!property) {
    toast.error("Property not found");
    return;
  }

  const dataSourceId = getCurrentDataSourceId();
  if (!dataSourceId) {
    toast.error("Data source not found for current view!");
    return;
  }

  const currentOptions = property.options || [];
  const reorderedOptions = optionIds
    .map((id) => currentOptions.find((opt) => opt.id === id))
    .filter((opt): opt is BoardPropertyOption => Boolean(opt));

  const missingOptions = currentOptions.filter((opt) => !optionIds.includes(opt.id));
  const updatedOptions = [...reorderedOptions, ...missingOptions];

  try {
    await updateFormPropertySchema(
      {
        dataSourceId,
        blockId: boardId,
        propertyId,
        newName: property.name,
        type: property.type,
        options: updatedOptions,
        showProperty: property.showProperty,
      },
      getDataSource,
      updateDataSource,
      setDataSource,
    );
  } catch (err) {
    console.error(err);
    toast.error("Failed to reorder options");
  }
};

