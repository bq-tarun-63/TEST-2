"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useBoard } from "@/contexts/boardContext";
import type { BoardProperty } from "@/types/board";
import { updateChartSettings } from "@/services-frontend/boardServices/databaseSettingsService";
import { toast } from "sonner";
import { 
  DropdownMenu, 
  DropdownMenuSectionHeading,
  DropdownMenuIcons
} from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import { PropertyPicker } from "../sortDropdowns";
import { ArrowDownRight, ArrowUpDown, ArrowUpLeft, BarChart3, LineChart, PieChart, BarChartHorizontal, GripVertical, Minus, Palette, MoreHorizontal, CornerDownRight, CornerLeftUp, Paintbrush } from "lucide-react";
import ReferenceLinesModal from "./ReferenceLinesModal";
import MoreStyleModal from "./MoreStyleModal";
import type { IChartSettings } from "@/models/types/ViewTypes";
import { cn } from "@/lib/utils";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";

interface ChartSettingsModalProps {
  board: Block;
  boardProperties: Record<string, BoardProperty>;
  viewTypeId: string;
  currentSettings?: IChartSettings;
  onClose: () => void;
}

export default function ChartSettingsModal({
  board,
  boardProperties,
  viewTypeId,
  currentSettings,
  onClose,
}: ChartSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { setChartSettings, getChartSettings } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();

  const latestBoard = getBlock(board._id) || board;

  // Convert IChartType (camelCase) to snake_case format used in state
  const convertChartTypeToState = (type?: string): "vertical_bar" | "horizontal_bar" | "line" | "donut" => {
    if (!type) return "vertical_bar";
    if (type === "verticalBar") return "vertical_bar";
    if (type === "horizontalBar") return "horizontal_bar";
    if (type === "line" || type === "donut") return type;
    return "vertical_bar";
  };

  // Convert snake_case format to IChartType (camelCase)
  const convertChartTypeToIChartType = (type: "vertical_bar" | "horizontal_bar" | "line" | "donut"): "verticalBar" | "horizontalBar" | "donut" | "line" => {
    if (type === "vertical_bar") return "verticalBar";
    if (type === "horizontal_bar") return "horizontalBar";
    return type;
  };

  const [chartType, setChartType] = useState<"vertical_bar" | "horizontal_bar" | "line" | "donut">(
    convertChartTypeToState(currentSettings?.chartType)
  );
  const [xAxisPropertyId, setXAxisPropertyId] = useState<string | undefined>(currentSettings?.xAxis?.propertyId);
  const [xAxisSortDirection, setXAxisSortDirection] = useState<"ascending" | "descending" | "high_to_low" | "low_to_high" | undefined>(
    currentSettings?.xAxis?.sortDirection || "ascending"
  );
  const [xAxisOmitZeroValues, setXAxisOmitZeroValues] = useState<boolean>(currentSettings?.xAxis?.omitZeroValues ?? false);
  const [referenceLines, setReferenceLines] = useState<Array<{
    value: number;
    label?: string;
    style?: "solid" | "dashed";
    color?: string;
  }>>(currentSettings?.yAxis?.referenceLines || []);
  const [showReferenceLinesModal, setShowReferenceLinesModal] = useState(false);
  const [showSortDirectionDropdown, setShowSortDirectionDropdown] = useState(false);
  const [sortDirectionDropdownPosition, setSortDirectionDropdownPosition] = useState<{ top: number; left: number; section: 'x-axis' | 'y-axis' | 'donut' } | null>(null);
  const sortDirectionDropdownRef = useRef<HTMLDivElement>(null);
  
  const [yAxisWhatToShow, setYAxisWhatToShow] = useState<"count" | string>(currentSettings?.yAxis?.whatToShow || "count");
  const [yAxisGroupBy, setYAxisGroupBy] = useState<string | undefined>(currentSettings?.yAxis?.groupBy);
  
  const [styleColor, setStyleColor] = useState<string | undefined>(currentSettings?.style?.color);
  const [styleHeight, setStyleHeight] = useState<"small" | "medium" | "large">(
    currentSettings?.style?.height || "medium"
  );
  const [styleGridLines, setStyleGridLines] = useState<"none" | "horizontal" | "vertical" | "both">(
    currentSettings?.style?.gridLines || "none"
  );
  const [styleAxisName, setStyleAxisName] = useState<"both" | "x-axis" | "y-axis">(
    currentSettings?.style?.axisName || "both"
  );
  const [styleDataLabels, setStyleDataLabels] = useState<boolean>(currentSettings?.style?.dataLabels ?? false);
  const [styleCaption, setStyleCaption] = useState<string | undefined>(currentSettings?.style?.caption);
  const [styleShowCaption, setStyleShowCaption] = useState<boolean>(currentSettings?.style?.showCaption ?? false);
  
  // Line chart specific settings
  const [styleSmoothLine, setStyleSmoothLine] = useState<boolean>(currentSettings?.style?.smoothLine ?? false);
  const [styleGradientArea, setStyleGradientArea] = useState<boolean>(currentSettings?.style?.gradientArea ?? false);
  const [styleLegend, setStyleLegend] = useState<boolean>(currentSettings?.style?.legend ?? false);
  
  // Donut chart specific settings
  const [styleShowValueInCenter, setStyleShowValueInCenter] = useState<boolean>(currentSettings?.style?.showValueInCenter ?? false);
  const [styleDonutDataLabel, setStyleDonutDataLabel] = useState<"none" | "value" | "name" | "nameAndValue">(
    currentSettings?.style?.donutDataLabel || "none"
  );

  const [showXAxisPropertyPicker, setShowXAxisPropertyPicker] = useState(false);
  const [showYAxisPropertyPicker, setShowYAxisPropertyPicker] = useState(false);
  const [showYAxisGroupByPicker, setShowYAxisGroupByPicker] = useState(false);
  const [showDonutWhatToShowPicker, setShowDonutWhatToShowPicker] = useState(false);
  const [showDonutSliceRepresentsPicker, setShowDonutSliceRepresentsPicker] = useState(false);
  const [showMoreStyleModal, setShowMoreStyleModal] = useState(false);

  // Local inline toggle to avoid nested <button> inside DropdownMenuItem
  const InlineToggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <div
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
        checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600",
        "cursor-pointer"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </div>
  );

  // Handle click outside for sort direction dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showSortDirectionDropdown && sortDirectionDropdownRef.current && !sortDirectionDropdownRef.current.contains(target)) {
        // Check if clicking on a sort menu item - don't close if clicking on another sort item
        const clickedButton = (target as HTMLElement).closest('button[data-menu-item-id]');
        const isSortMenuItem = clickedButton && (
          clickedButton.getAttribute('data-menu-item-id') === 'x-axis-sort' ||
          clickedButton.getAttribute('data-menu-item-id') === 'y-axis-sort' ||
          clickedButton.getAttribute('data-menu-item-id') === 'donut-sort'
        );
        
        if (!isSortMenuItem) {
          // Clicking outside or on a different menu item - close dropdown
          setShowSortDirectionDropdown(false);
          setSortDirectionDropdownPosition(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSortDirectionDropdown]);

  // Build chart settings object from current state
  const buildChartSettings = useCallback((): IChartSettings => {
    return {
      chartType: convertChartTypeToIChartType(chartType),
      xAxis: {
        propertyId: xAxisPropertyId,
        sortDirection: xAxisSortDirection,
        omitZeroValues: xAxisOmitZeroValues,
      },
      yAxis: {
        whatToShow: yAxisWhatToShow,
        groupBy: yAxisGroupBy,
        referenceLines: referenceLines.length > 0 ? referenceLines : undefined,
      },
      style: {
        color: styleColor,
        height: styleHeight,
        gridLines: styleGridLines,
        axisName: styleAxisName,
        dataLabels: styleDataLabels,
        caption: styleCaption,
        showCaption: styleShowCaption,
        smoothLine: styleSmoothLine,
        gradientArea: styleGradientArea,
        legend: styleLegend,
        showValueInCenter: styleShowValueInCenter,
        donutDataLabel: styleDonutDataLabel,
      },
      // Donut settings are now derived from X/Y axis in the chart view,
      // so we don't need to store separate donut-specific variables here.
    };
  }, [chartType, xAxisPropertyId, xAxisSortDirection, xAxisOmitZeroValues, yAxisWhatToShow, yAxisGroupBy, styleColor, styleHeight, styleGridLines, styleAxisName, styleDataLabels, styleCaption, styleShowCaption, styleSmoothLine, styleGradientArea, styleLegend, styleShowValueInCenter, styleDonutDataLabel, referenceLines]);

  const saveChartSettings = useCallback(async (newSettings: IChartSettings) => {
      if (!viewTypeId) {
        toast.error("View type ID not found");
        return;
      }

      // updateChartSettings handles optimistic update and rollback internally
      await updateChartSettings(
        viewTypeId,
        newSettings,
        board._id,
        setChartSettings,
        getChartSettings,
        getBlock,
        updateBlock,
      );
    }, [viewTypeId, board._id, setChartSettings, getChartSettings, getBlock, updateBlock]);

  // Get property name for display
  const getPropertyName = (propertyId?: string) => {
    if (!propertyId) return undefined;
    const prop = boardProperties[propertyId];
    if (!prop) return undefined;
    return prop.name.charAt(0).toUpperCase() + prop.name.slice(1);
  };

  // Get sort direction label
  const getSortDirectionLabel = (direction?: "ascending" | "descending" | "high_to_low" | "low_to_high", whatToShow?: string | "count") => {
    if (!direction) return undefined;
    const isCount = whatToShow === "count";
    const valueLabel = isCount ? "Count" : getPropertyName(whatToShow);
    switch (direction) {
      case "ascending":
        return "Ascending";
      case "descending":
        return "Descending";
      case "high_to_low":
        return isCount ? "Count High → Low" : `${valueLabel} High → Low`;
      case "low_to_high":
        return isCount ? "Count Low → High" : `${valueLabel} Low → High`;
      default:
        return undefined;
    }
  };

  const isHorizontal = chartType === "horizontal_bar";

  // Computed values: In horizontal mode, X/Y sections are swapped
  // X-axis section controls: horizontal ? Y-axis values : X-axis categories
  // Y-axis section controls: horizontal ? X-axis categories : Y-axis values
  const xAxisSectionControls = useMemo(() => ({
    whatToShow: isHorizontal ? yAxisWhatToShow : xAxisPropertyId,
    whatToShowLabel: isHorizontal 
      ? (yAxisWhatToShow === "count" ? "Count" : getPropertyName(yAxisWhatToShow))
      : getPropertyName(xAxisPropertyId),
    groupBy: isHorizontal ? yAxisGroupBy : undefined,
    sortDirection: isHorizontal ? undefined : xAxisSortDirection,
    omitZeroValues: isHorizontal ? undefined : xAxisOmitZeroValues,
    showGroupBy: isHorizontal ? (yAxisWhatToShow !== "count") : false,
  }), [isHorizontal, xAxisPropertyId, yAxisWhatToShow, yAxisGroupBy, xAxisSortDirection, xAxisOmitZeroValues]);

  const yAxisSectionControls = useMemo(() => ({
    whatToShow: isHorizontal ? xAxisPropertyId : yAxisWhatToShow,
    whatToShowLabel: isHorizontal 
      ? getPropertyName(xAxisPropertyId)
      : (yAxisWhatToShow === "count" ? "Count" : getPropertyName(yAxisWhatToShow)),
    groupBy: isHorizontal ? undefined : yAxisGroupBy,
    sortDirection: isHorizontal ? xAxisSortDirection : undefined,
    showGroupBy: isHorizontal ? false : (yAxisWhatToShow !== "count"),
  }), [isHorizontal, xAxisPropertyId, yAxisWhatToShow, yAxisGroupBy, xAxisSortDirection]);

  // Helper to filter out already-selected properties
  const getFilteredProperties = useCallback((excludePropertyIds: string[]) => {
    const filtered: Record<string, BoardProperty> = { ...boardProperties };
    excludePropertyIds.forEach(id => {
      if (id && id !== "count") {
        delete filtered[id];
      }
    });
    return filtered;
  }, [boardProperties]);

  // Properties for X-axis picker: exclude Y-axis selected property
  const xAxisPickerProperties = useMemo(() => {
    const excludeIds: string[] = [];
    if (isHorizontal) {
      // In horizontal: X-axis section controls Y-axis values, so exclude Y-axis whatToShow (if it's a property)
      if (yAxisWhatToShow && yAxisWhatToShow !== "count") {
        excludeIds.push(yAxisWhatToShow);
      }
      // Also exclude groupBy if set
      if (yAxisGroupBy) {
        excludeIds.push(yAxisGroupBy);
      }
    } else {
      // In vertical/line: X-axis section controls X-axis categories
      // Exclude Y-axis whatToShow (if it's a property) and groupBy
      if (yAxisWhatToShow && yAxisWhatToShow !== "count") {
        excludeIds.push(yAxisWhatToShow);
      }
      if (yAxisGroupBy) {
        excludeIds.push(yAxisGroupBy);
      }
    }
    return getFilteredProperties(excludeIds);
  }, [isHorizontal, yAxisWhatToShow, yAxisGroupBy, getFilteredProperties]);

  // Properties for Y-axis picker: exclude X-axis selected property
  const yAxisPickerProperties = useMemo(() => {
    const excludeIds: string[] = [];
    if (isHorizontal) {
      // In horizontal: Y-axis section controls X-axis categories, so exclude X-axis property
      if (xAxisPropertyId) {
        excludeIds.push(xAxisPropertyId);
      }
    } else {
      // In vertical/line: Y-axis section controls Y-axis values, exclude X-axis property
      if (xAxisPropertyId) {
        excludeIds.push(xAxisPropertyId);
      }
    }
    return getFilteredProperties(excludeIds);
  }, [isHorizontal, xAxisPropertyId, getFilteredProperties]);

  // Properties for Group By picker: show all properties (no exclusions)
  const groupByPickerProperties = useMemo(() => {
    return boardProperties;
  }, [boardProperties]);

  // Handle chart type change
  const handleChartTypeChange = useCallback(
    (newType: "vertical_bar" | "horizontal_bar" | "line" | "donut") => {
      setChartType(newType);

      // Build settings with the new chart type
      const currentSettings = buildChartSettings();
      const newSettings: IChartSettings = {
        ...currentSettings,
        chartType: convertChartTypeToIChartType(newType),
      };

      saveChartSettings(newSettings).catch((err) => {
        console.error("Failed to save chart settings:", err);
      });
    },
    [buildChartSettings, saveChartSettings],
  );

  // Handle X axis property change
  const handleXAxisPropertyChange = useCallback(async (propertyId: string) => {
    // Prevent "count" from being set as X-axis property (it's only for Y-axis)
    if (propertyId === "count") {
      return;
    }
    setXAxisPropertyId(propertyId);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      xAxis: {
        ...currentSettings.xAxis,
        propertyId,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle X axis sort direction change
  const handleXAxisSortDirectionChange = useCallback(async (newDirection: "ascending" | "descending" | "high_to_low" | "low_to_high") => {
    setXAxisSortDirection(newDirection);
    setShowSortDirectionDropdown(false);
    setSortDirectionDropdownPosition(null);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      xAxis: {
        ...currentSettings.xAxis,
        sortDirection: newDirection,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle sort direction dropdown toggle
  const handleSortDirectionDropdownToggle = useCallback((event?: React.MouseEvent, section?: 'x-axis' | 'y-axis' | 'donut') => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    if (showSortDirectionDropdown && sortDirectionDropdownPosition?.section === section) {
      setShowSortDirectionDropdown(false);
      setSortDirectionDropdownPosition(null);
      return;
    }

    // Calculate position relative to the clicked menu item
    if (event?.currentTarget && section) {
      const button = event.currentTarget as HTMLElement;
      // Find the closest menu container (could be X-axis, Y-axis, or donut section)
      const menuContainer = button.closest('.px-1.relative') as HTMLElement;
      if (menuContainer) {
        const containerRect = menuContainer.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        
        setSortDirectionDropdownPosition({
          top: buttonRect.bottom - containerRect.top + 4, // 4px gap
          left: buttonRect.left - containerRect.left,
          section: section,
        });
        setShowSortDirectionDropdown(true);
      } else {
        setSortDirectionDropdownPosition(null);
        setShowSortDirectionDropdown(false);
      }
    } else {
      setSortDirectionDropdownPosition(null);
      setShowSortDirectionDropdown(false);
    }
  }, [showSortDirectionDropdown, sortDirectionDropdownPosition]);

  // Handle X axis omit zero values change
  const handleXAxisOmitZeroValuesChange = useCallback(async (checked: boolean) => {
    setXAxisOmitZeroValues(checked);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      xAxis: {
        ...currentSettings.xAxis,
        omitZeroValues: checked,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle reference lines change
  const handleReferenceLinesChange = useCallback(async (newReferenceLines: Array<{
    value: number;
    label?: string;
    style?: "solid" | "dashed";
    color?: string;
  }>) => {
    setReferenceLines(newReferenceLines);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      yAxis: {
        ...currentSettings.yAxis,
        referenceLines: newReferenceLines.length > 0 ? newReferenceLines : undefined,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle Y axis what to show change
  const handleYAxisWhatToShowChange = useCallback(async (whatToShow: "count" | string) => {
    setYAxisWhatToShow(whatToShow);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      yAxis: {
        ...currentSettings.yAxis,
        whatToShow,
        groupBy: whatToShow === "count" ? undefined : currentSettings.yAxis?.groupBy,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle Y axis group by change
  const handleYAxisGroupByChange = useCallback(async (propertyId: string) => {
    setYAxisGroupBy(propertyId);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      yAxis: {
        ...currentSettings.yAxis,
        groupBy: propertyId,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);


  // Handle style color change
  const handleStyleColorChange = useCallback(async (color: string) => {
    setStyleColor(color);
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      style: {
        ...currentSettings.style,
        color,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Handle more style settings change
  const handleMoreStyleChange = useCallback(async (settings: {
    height?: "small" | "medium" | "large";
    gridLines?: "none" | "horizontal" | "vertical" | "both";
    axisName?: "both" | "x-axis" | "y-axis";
    dataLabels?: boolean;
    caption?: string;
    showCaption?: boolean;
    smoothLine?: boolean;
    gradientArea?: boolean;
    legend?: boolean;
    showValueInCenter?: boolean;
    donutDataLabel?: "none" | "value" | "name" | "nameAndValue";
  }) => {
    if (settings.height !== undefined) setStyleHeight(settings.height);
    if (settings.gridLines !== undefined) setStyleGridLines(settings.gridLines);
    if (settings.axisName !== undefined) setStyleAxisName(settings.axisName);
    if (settings.dataLabels !== undefined) setStyleDataLabels(settings.dataLabels);
    if (settings.caption !== undefined) setStyleCaption(settings.caption);
    if (settings.showCaption !== undefined) setStyleShowCaption(settings.showCaption);
    if (settings.smoothLine !== undefined) setStyleSmoothLine(settings.smoothLine);
    if (settings.gradientArea !== undefined) setStyleGradientArea(settings.gradientArea);
    if (settings.legend !== undefined) setStyleLegend(settings.legend);
    if (settings.showValueInCenter !== undefined) setStyleShowValueInCenter(settings.showValueInCenter);
    if (settings.donutDataLabel !== undefined) setStyleDonutDataLabel(settings.donutDataLabel);
    
    const currentSettings = buildChartSettings();
    const newSettings: IChartSettings = {
      ...currentSettings,
      style: {
        ...currentSettings.style,
        ...settings,
      },
    };
    await saveChartSettings(newSettings);
  }, [buildChartSettings, saveChartSettings]);

  // Donut-specific handlers are no longer needed; donut config is derived from X/Y axis settings in the chart view.

  // Build menu items for X axis
  const xAxisMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];
    const controls = xAxisSectionControls;
    
    items.push({
      id: 'x-axis-what-to-show',
      label: "What to show",
      icon: <CornerDownRight className="h-4 w-4 text-muted-foreground" />,
      onClick: () => setShowXAxisPropertyPicker(true),
      hasChevron: true,
      count: controls.whatToShowLabel,
    });

    if (controls.showGroupBy) {
      items.push({
        id: 'x-axis-group-by',
        label: "Group by",
        icon: <DropdownMenuIcons.Group />,
        onClick: () => setShowYAxisGroupByPicker(true),
        hasChevron: true,
        count: getPropertyName(controls.groupBy) || "None",
      });
    }

    if (controls.sortDirection !== undefined) {
      items.push({
        id: 'x-axis-sort',
        label: "Sort by",
        icon: <ArrowUpDown className="h-4 w-4 text-muted-foreground" style={{ transform: "rotate(-90deg)" }} />,
        onClick: (e) => handleSortDirectionDropdownToggle(e, 'x-axis'),
        hasChevron: true,
        count: getSortDirectionLabel(controls.sortDirection, yAxisWhatToShow),
      });
    }

    // Omit zero values option (only for X-axis, not horizontal)
    if (!isHorizontal && controls.omitZeroValues !== undefined) {
      items.push({
        id: 'x-axis-omit-zero',
        label: "Omit zero values",
        icon: <DropdownMenuIcons.Hide />,
        onClick: () => {},
        rightElement: (
          <InlineToggle
            checked={controls.omitZeroValues}
            onChange={handleXAxisOmitZeroValuesChange}
          />
        ),
      });
    }

    // Reference lines option for horizontal charts (value axis is X-axis in horizontal)
    if (isHorizontal) {
      items.push({
        id: 'x-axis-reference-lines',
        label: "Reference lines",
        icon: <MoreHorizontal className="h-4 w-4 text-muted-foreground" />,
        onClick: () => setShowReferenceLinesModal(!showReferenceLinesModal),
        hasChevron: true,
        count: referenceLines.length > 0 ? `${referenceLines.length} line${referenceLines.length !== 1 ? 's' : ''}` : undefined,
      });
    }

    return items;
  }, [xAxisSectionControls, isHorizontal, yAxisWhatToShow, chartType, referenceLines, handleXAxisSortDirectionChange, handleXAxisOmitZeroValuesChange]);

  // Build menu items for Y axis
  const yAxisMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];
    const controls = yAxisSectionControls;
    
    items.push({
      id: 'y-axis-what-to-show',
      label: "What to show",
      icon: <CornerLeftUp className="h-4 w-4 text-muted-foreground" />,
      onClick: () => setShowYAxisPropertyPicker(true),
      hasChevron: true,
      count: controls.whatToShowLabel,
    });

    if (controls.showGroupBy) {
      items.push({
        id: 'y-axis-group-by',
        label: "Group by",
        icon: <DropdownMenuIcons.Group />,
        onClick: () => setShowYAxisGroupByPicker(true),
        hasChevron: true,
        count: getPropertyName(controls.groupBy) || "None",
      });
    }

    if (controls.sortDirection !== undefined) {
      items.push({
        id: 'y-axis-sort',
        label: "Sort by",
        icon: <ArrowUpDown className="h-4 w-4 text-muted-foreground" style={{ transform: "rotate(-90deg)" }} />,
        onClick: (e) => handleSortDirectionDropdownToggle(e, 'y-axis'),
        hasChevron: true,
        count: getSortDirectionLabel(controls.sortDirection, yAxisWhatToShow),
      });
    }

    // Reference lines option for vertical/line charts (value axis is Y-axis in vertical/line)
    if (!isHorizontal && chartType !== "donut") {
      items.push({
        id: 'y-axis-reference-lines',
        label: "Reference lines",
        icon: <MoreHorizontal className="h-4 w-4 text-muted-foreground" />,
        onClick: () => setShowReferenceLinesModal(!showReferenceLinesModal),
        hasChevron: true,
        count: referenceLines.length > 0 ? `${referenceLines.length} line${referenceLines.length !== 1 ? 's' : ''}` : undefined,
      });
    }

    return items;
  }, [yAxisSectionControls, isHorizontal, yAxisWhatToShow, chartType, referenceLines, handleXAxisSortDirectionChange]);

  // Build menu items for donut chart
  // Donut settings use X-axis property for "what to show" and Y-axis property for "each slice represents"
  const donutMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];
    
    items.push({
      id: 'donut-what-to-show',
      label: "What to show",
      icon: <PieChart className="h-4 w-4 text-muted-foreground" />,
      onClick: () => setShowDonutWhatToShowPicker(true),
      hasChevron: true,
      count: getPropertyName(xAxisPropertyId) || "None",
    });

    items.push({
      id: 'donut-slice-represents',
      label: "Each slice represents",
      icon: <PieChart className="h-4 w-4 text-muted-foreground" />,
      onClick: () => setShowDonutSliceRepresentsPicker(true),
      hasChevron: true,
      count: (yAxisWhatToShow === "count" ? "Count" : getPropertyName(yAxisWhatToShow)) || "None",
    });

    if (xAxisPropertyId) {
      items.push({
        id: 'donut-sort',
        label: "Sort by",
        icon: <ArrowUpDown className="h-4 w-4 text-muted-foreground" style={{ transform: "rotate(-90deg)" }} />,
        onClick: (e) => handleSortDirectionDropdownToggle(e, 'donut'),
        hasChevron: true,
        count: getSortDirectionLabel(xAxisSortDirection, yAxisWhatToShow),
      });
    }

    return items;
  }, [xAxisPropertyId, yAxisWhatToShow, xAxisSortDirection, handleXAxisSortDirectionChange, getPropertyName]);

  // Build style menu items
  const styleMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];
    
    items.push({
      id: 'style-color',
      label: "Color",
      icon: <Palette className="h-4 w-4 text-muted-foreground" />,
      onClick: () => {
        // TODO: Open color picker
      },
      hasChevron: true,
      count: styleColor || "Default",
    });

    items.push({
      id: 'style-more',
      label: "More style",
      icon: <Paintbrush className="h-4 w-4 text-muted-foreground" />,
      onClick: () => setShowMoreStyleModal(!showMoreStyleModal),
      hasChevron: true,
    });

    return items;
  }, [styleColor, showMoreStyleModal]);

  // Chart type icons for visual selection
  const ChartTypeSelector = () => {
    const types: Array<{ type: "vertical_bar" | "horizontal_bar" | "line" | "donut"; label: string; Icon: any }> = [
      { type: "vertical_bar", label: "Vertical bar", Icon: BarChart3 },
      { type: "horizontal_bar", label: "Horizontal bar", Icon: BarChartHorizontal },
      { type: "line", label: "Line", Icon: LineChart },
      { type: "donut", label: "Donut", Icon: PieChart },
    ];

    return (
      <div className="flex gap-2 mx-2 pb-1">
        {types.map(({ type, label, Icon }) => {
          const isSelected = chartType === type;
          return (
            <button
              key={type}
              type="button"
              aria-label={label}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleChartTypeChange(type);
              }}
              className={cn(
                "flex items-center justify-center flex-grow rounded-lg p-1.5 h-10 transition-all pointer-events-auto",
                isSelected
                  ? "bg-blue-50 dark:bg-blue-950 border-2 border-blue-600 dark:border-blue-500"
                  : "border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  isSelected
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
              />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div
        ref={modalRef}
        className="flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="flex-1">
          {/* Chart Type */}
          <div className="px-4 pt-2 pb-1">
            <DropdownMenuSectionHeading>Chart type</DropdownMenuSectionHeading>
          </div>
          <div className="p-1">
            <ChartTypeSelector />
          </div>

          {chartType !== "donut" ? (
            <>
              {/* Axes */}
              {/* X Axis */}
              <div className="relative">
                <div className="px-4 pt-2">
                  <DropdownMenuSectionHeading>X axis</DropdownMenuSectionHeading>
                </div>
                <div className="px-1 relative">
                  <DropdownMenu items={xAxisMenuItems} />
                  {/* Sort direction dropdown - only render if this is the active section */}
                  {showSortDirectionDropdown && sortDirectionDropdownPosition && sortDirectionDropdownPosition.section === 'x-axis' && (
                    <div 
                      ref={sortDirectionDropdownRef}
                      className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[180px]"
                      style={{
                        top: `${sortDirectionDropdownPosition.top}px`,
                        left: `${sortDirectionDropdownPosition.left}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[
                        { value: "ascending" as const, label: "Ascending" },
                        { value: "descending" as const, label: "Descending" },
                        { value: "high_to_low" as const, label: getSortDirectionLabel("high_to_low", yAxisWhatToShow) || "High → Low" },
                        { value: "low_to_high" as const, label: getSortDirectionLabel("low_to_high", yAxisWhatToShow) || "Low → High" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleXAxisSortDirectionChange(option.value);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                            xAxisSortDirection === option.value && "bg-muted"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {showXAxisPropertyPicker && (
                  <div className="absolute border rounded-md -translate-x-1/2 top-0 mt-10 z-50">
                    <PropertyPicker
                      properties={xAxisPickerProperties}
                      existingSorts={[]}
                      showCount={isHorizontal} // In horizontal, X-axis section controls Y-axis values (show count)
                      onSelect={async (id) => {
                        if (isHorizontal) {
                          await handleYAxisWhatToShowChange(id as "count" | string);
                        } else {
                          await handleXAxisPropertyChange(id);
                        }
                        setShowXAxisPropertyPicker(false);
                      }}
                      onClose={() => setShowXAxisPropertyPicker(false)}
                      title={isHorizontal ? "Select property for X axis (value)" : "Select property for X axis"}
                      showHeader={true}
                    />
                  </div>
                )}
                {/* Reference lines modal for horizontal charts (X-axis section) */}
                {isHorizontal && showReferenceLinesModal && (
                  <div className="absolute left-0 top-full mt-2 z-[1000]">
                    <ReferenceLinesModal
                      referenceLines={referenceLines}
                      onReferenceLinesChange={handleReferenceLinesChange}
                      onClose={() => setShowReferenceLinesModal(false)}
                    />
                  </div>
                )}
              </div>

              {/* Y Axis */}
              <div className="relative">
                <div className="px-4 pt-2">
                  <DropdownMenuSectionHeading>Y axis</DropdownMenuSectionHeading>
                </div>
                <div className="px-1 relative">
                  <DropdownMenu items={yAxisMenuItems} />
                  {/* Sort direction dropdown - only render if this is the active section */}
                  {showSortDirectionDropdown && sortDirectionDropdownPosition && sortDirectionDropdownPosition.section === 'y-axis' && (
                    <div 
                      ref={sortDirectionDropdownRef}
                      className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[180px]"
                      style={{
                        top: `${sortDirectionDropdownPosition.top}px`,
                        left: `${sortDirectionDropdownPosition.left}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[
                        { value: "ascending" as const, label: "Ascending" },
                        { value: "descending" as const, label: "Descending" },
                        { value: "high_to_low" as const, label: getSortDirectionLabel("high_to_low", yAxisWhatToShow) || "High → Low" },
                        { value: "low_to_high" as const, label: getSortDirectionLabel("low_to_high", yAxisWhatToShow) || "Low → High" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleXAxisSortDirectionChange(option.value);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                            xAxisSortDirection === option.value && "bg-muted"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {showYAxisPropertyPicker && (
                  <div className="absolute border rounded-md -translate-x-1/2 top-0 mt-10 z-50">
                    <PropertyPicker
                      properties={yAxisPickerProperties}
                      existingSorts={[]}
                      showCount={!isHorizontal} // In horizontal, Y-axis section controls X-axis categories (no count)
                      onSelect={async (id) => {
                        if (isHorizontal) {
                          await handleXAxisPropertyChange(id);
                        } else {
                          await handleYAxisWhatToShowChange(id as "count" | string);
                        }
                        setShowYAxisPropertyPicker(false);
                      }}
                      onClose={() => setShowYAxisPropertyPicker(false)}
                      title={isHorizontal ? "Select property for Y axis (categories)" : "Select property for Y axis"}
                      showHeader={true}
                    />
                  </div>
                )}
                {showYAxisGroupByPicker && (
                  <div className="absolute border rounded-md -translate-x-1/2 top-0 mt-10 z-50">
                    <PropertyPicker
                      properties={groupByPickerProperties}
                      existingSorts={[]}
                      onSelect={async (id) => {
                        await handleYAxisGroupByChange(id);
                        setShowYAxisGroupByPicker(false);
                      }}
                      onClose={() => setShowYAxisGroupByPicker(false)}
                      title="Select property to group by"
                      showHeader={true}
                    />
                  </div>
                )}
                {/* Reference lines modal for vertical/line charts (Y-axis section) */}
                {!isHorizontal && showReferenceLinesModal && (
                  <div className="absolute left-0 top-full mt-2 z-[1000]">
                    <ReferenceLinesModal
                      referenceLines={referenceLines}
                      onReferenceLinesChange={handleReferenceLinesChange}
                      onClose={() => setShowReferenceLinesModal(false)}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Donut Chart Settings */}
              <div className="relative">
                <div className="px-1 relative">
                  <DropdownMenu items={donutMenuItems} />
                  {/* Sort direction dropdown - only render if this is the active section */}
                  {showSortDirectionDropdown && sortDirectionDropdownPosition && sortDirectionDropdownPosition.section === 'donut' && (
                    <div 
                      ref={sortDirectionDropdownRef}
                      className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[180px]"
                      style={{
                        top: `${sortDirectionDropdownPosition.top}px`,
                        left: `${sortDirectionDropdownPosition.left}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[
                        { value: "ascending" as const, label: "Ascending" },
                        { value: "descending" as const, label: "Descending" },
                        { value: "high_to_low" as const, label: getSortDirectionLabel("high_to_low", yAxisWhatToShow) || "High → Low" },
                        { value: "low_to_high" as const, label: getSortDirectionLabel("low_to_high", yAxisWhatToShow) || "Low → High" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleXAxisSortDirectionChange(option.value);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                            xAxisSortDirection === option.value && "bg-muted"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {showDonutWhatToShowPicker && (
                  <div className="absolute border rounded-md -translate-x-1/2 top-0 mt-10 z-50">
                    <PropertyPicker
                      properties={xAxisPickerProperties}
                      existingSorts={[]}
                      showCount={false}
                      onSelect={async (id) => {
                        await handleXAxisPropertyChange(id);
                        setShowDonutWhatToShowPicker(false);
                      }}
                      onClose={() => setShowDonutWhatToShowPicker(false)}
                      title="Select property for what to show"
                      showHeader={true}
                    />
                  </div>
                )}
                {showDonutSliceRepresentsPicker && (
                  <div className="absolute border rounded-md -translate-x-1/2 top-0 mt-10 z-50">
                    <PropertyPicker
                      properties={yAxisPickerProperties}
                      existingSorts={[]}
                      showCount={true}
                      onSelect={async (id) => {
                        await handleYAxisWhatToShowChange(id as "count" | string);
                        setShowDonutSliceRepresentsPicker(false);
                      }}
                      onClose={() => setShowDonutSliceRepresentsPicker(false)}
                      title="Select property for each slice represents"
                      showHeader={true}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Style */}
          <div className="relative">
            <div className="px-4 pt-2">
              <DropdownMenuSectionHeading>Style</DropdownMenuSectionHeading>
            </div>
            <div className="px-1">
              <DropdownMenu items={styleMenuItems} />
            </div>
            {/* More style modal */}
            {showMoreStyleModal && (
              <div className="absolute left-0 top-full mt-2 z-[1000]">
                <MoreStyleModal
                  chartType={chartType}
                  settings={{
                    height: styleHeight,
                    gridLines: styleGridLines,
                    axisName: styleAxisName,
                    dataLabels: styleDataLabels,
                    caption: styleCaption,
                    showCaption: styleShowCaption,
                    smoothLine: styleSmoothLine,
                    gradientArea: styleGradientArea,
                    legend: styleLegend,
                    showValueInCenter: styleShowValueInCenter,
                    donutDataLabel: styleDonutDataLabel,
                  }}
                  onSettingsChange={handleMoreStyleChange}
                  onClose={() => setShowMoreStyleModal(false)}
                />
              </div>
            )}
          </div>
        </div>       
      </div>

    </>
  );
}
