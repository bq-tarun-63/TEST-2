"use client";

import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import type { BoardProperty } from "@/types/board";
import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Title,
} from "chart.js";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import { applyAdvancedFilters } from "@/utils/advancedFilterUtils";
import { getPropertyValueForGrouping, type ChartGroupingHelpers, processChartData, } from "@/services-frontend/chart/chartService";
import { Block } from "@/types/block";

// Custom plugin to draw value labels on top/end of bars
const valueLabelPlugin = {
  id: "valueLabelPlugin",
  afterDatasetsDraw: (chart: any) => {
    // Check if data labels are enabled
    const showDataLabels = chart.options.plugins?.valueLabels?.enabled ?? false;
    if (!showDataLabels) return;

    const axisNameSetting = chart.options.plugins?.valueLabels?.axisName || "both";
    const indexAxis = chart.options?.indexAxis ?? "x";

    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];

    if (!meta || !dataset || !Array.isArray(dataset.data)) return;

    // Determine which labels to show based on axisName setting
    // For "x-axis": Show category labels (property names) - these are handled by axis titles
    // For "y-axis": Show numeric value labels on bars
    // For "both": Show numeric value labels on bars (category labels are shown via axis titles)
    const showValueLabels = axisNameSetting === "both" || axisNameSetting === "y-axis";

    if (!showValueLabels) return; // Only show numeric values, category labels are shown via axis titles

    ctx.save();
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#37352F";

    meta.data.forEach((element: any, index: number) => {
      const value = dataset.data[index];
      if (value == null) return;

      if (indexAxis === "x") {
        // Vertical bar: label above the bar
        const x = element.x;
        const y = element.y;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(String(value), x, y - 4);
      } else {
        // Horizontal bar: label at the end of the bar
        const x = element.x;
        const y = element.y;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), x + 6, y);
      }
    });

    ctx.restore();
  },
};

// Custom plugin to draw reference lines
const referenceLinesPlugin = {
  id: "referenceLinesPlugin",
  afterDatasetsDraw: (chart: any) => {
    const referenceLines = chart.options.plugins?.referenceLines?.lines || [];
    if (!referenceLines || referenceLines.length === 0) return;

    const { ctx, chartArea, scales } = chart;
    const indexAxis = chart.options?.indexAxis ?? "x";
    const isHorizontal = indexAxis === "y";

    ctx.save();

    referenceLines.forEach((line: { value: number; label?: string; style?: "solid" | "dashed"; color?: string }) => {
      const value = line.value;
      const color = line.color || "#55534E";
      const style = line.style || "dashed";
      const label = line.label;

      // Get the scale (Y-axis for vertical/line charts, X-axis for horizontal charts)
      const scale = isHorizontal ? scales.x : scales.y;
      if (!scale) return;

      // Convert value to pixel position
      const pixelPosition = scale.getPixelForValue(value);
      if (pixelPosition === null || pixelPosition === undefined) return;

      // Set line style
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      if (style === "dashed") {
        ctx.setLineDash([5, 5]);
      } else {
        ctx.setLineDash([]);
      }

      // Draw the line
      ctx.beginPath();
      if (isHorizontal) {
        // Horizontal chart: draw vertical line
        ctx.moveTo(pixelPosition, chartArea.top);
        ctx.lineTo(pixelPosition, chartArea.bottom);
      } else {
        // Vertical/line chart: draw horizontal line
        ctx.moveTo(chartArea.left, pixelPosition);
        ctx.lineTo(chartArea.right, pixelPosition);
      }
      ctx.stroke();

      // Draw label if provided
      if (label) {
        ctx.fillStyle = color;
        ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.textAlign = isHorizontal ? "center" : "right";
        ctx.textBaseline = "middle";

        if (isHorizontal) {
          // Horizontal chart: label above the line
          ctx.fillText(label, pixelPosition, chartArea.top - 8);
        } else {
          // Vertical/line chart: label to the right of the line
          ctx.fillText(label, chartArea.right + 8, pixelPosition);
        }
      }
    });

    ctx.restore();
  },
};

// Custom plugin for donut chart data labels
const donutDataLabelPlugin = {
  id: "donutDataLabelPlugin",
  afterDatasetsDraw: (chart: any) => {
    const donutDataLabel = chart.options.plugins?.donutDataLabel?.mode || "none";
    if (donutDataLabel === "none") return;

    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];
    const labels = chart.data.labels || [];

    if (!meta || !dataset || !Array.isArray(dataset.data)) return;

    ctx.save();
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    meta.data.forEach((element: any, index: number) => {
      const value = dataset.data[index];
      const label = labels[index] || "";
      if (value == null) return;

      const total = (dataset.data as number[]).reduce((sum, val) => sum + (val || 0), 0);
      const percent = total > 0 ? ((value / total) * 100).toFixed(0) : "0";

      let textToShow = "";
      switch (donutDataLabel) {
        case "value":
          textToShow = `${value} (${percent}%)`;
          break;
        case "name":
          textToShow = String(label);
          break;
        case "nameAndValue":
          textToShow = `${label} ${value} (${percent}%)`;
          break;
        default:
          return;
      }

      const { x, y } = element.tooltipPosition();
      ctx.fillStyle = "#37352F";
      ctx.fillText(textToShow, x, y);
    });

    ctx.restore();
  },
};

// Register Chart.js components and plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  ChartTooltip,
  ChartLegend,
  Title,
  valueLabelPlugin,
  referenceLinesPlugin,
  donutDataLabelPlugin
);

interface ChartViewProps {
  readonly board: Block;
  readonly notes: Block[];
}

type ChartType = "vertical_bar" | "horizontal_bar" | "line" | "donut";

interface ChartSettings {
  chartType?: ChartType;
  xAxis?: {
    propertyId?: string;
    sortDirection?: "ascending" | "descending" | "high_to_low" | "low_to_high";
    omitZeroValues?: boolean;
  };
  yAxis?: {
    whatToShow?: "count" | string; // "count" or propertyId
    groupBy?: string; // propertyId to group by
    // Reference lines for Y-axis
    referenceLines?: Array<{
      value: number;
      label?: string;
      style?: "solid" | "dashed";
      color?: string;
    }>;
  };
  style?: {
    color?: string;
    height?: "small" | "medium" | "large" | "extra_large";
    gridLines?: "none" | "horizontal" | "vertical" | "both";
    axisName?: "both" | "x-axis" | "y-axis";
    dataLabels?: boolean;
    caption?: string;
    showCaption?: boolean;
    // Line chart specific
    smoothLine?: boolean;
    gradientArea?: boolean;
    legend?: boolean;
    // Donut chart specific
    showValueInCenter?: boolean;
    donutDataLabel?: "none" | "value" | "name" | "nameAndValue";
  };
}

// books-style colors
const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#00ff00",
  "#0088fe",
  "#00c49f",
  "#ffbb28",
  "#ff8042",
  "#8884d8",
];

const HEIGHT_MAP = {
  small: 300,
  medium: 400,
  large: 500,
  extra_large: 600,
};

export default function ChartView({ board, notes }: ChartViewProps) {
  const {
    getFilters,
    getAdvancedFilters,
    getSortBy,
    getGroupBy,
    getChartSettings,
    getCurrentDataSourceProperties,
    currentView,
    chartSettings: contextChartSettings,
    getNotesByDataSourceId,
    getDataSource,
    getRelationNoteTitle,
    getValidRelationIds,
  } = useBoard();
  const { getBlock } = useGlobalBlocks();

  // Get current view settings and viewTypeId
  const { currentViewData, currentViewTypeId } = useMemo(() => {
    const viewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    let viewTypeId: string | null = null;

    if (viewData?.id) {
      const currentViewId = typeof viewData.id === "string" ? viewData.id : String(viewData.id);
      view = latestBoard.value?.viewsTypes?.find((vt) => {
        const vtId = typeof vt._id === "string" ? vt._id : String(vt._id);
        return vtId === currentViewId;
      });
      viewTypeId = view ? (typeof view._id === "string" ? view._id : String(view._id)) : null;
    } else if (viewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === viewData.type);
      viewTypeId = view ? (typeof view._id === "string" ? view._id : String(view._id)) : null;
    }

    return { currentViewData: view, currentViewTypeId: viewTypeId };
  }, [currentView, board._id, getBlock]);

  // Load chart settings from context (like filters/sorts)
  // This should react to changes in contextChartSettings
  const chartSettings = useMemo<ChartSettings>(() => {
    // First try to get from context state directly (this will update when setChartSettings is called)
    const contextSettings = currentViewTypeId ? contextChartSettings[currentViewTypeId] : undefined;
    // Fallback to view settings if not in context yet
    const savedSettings = contextSettings || currentViewData?.settings?.chart;
    if (savedSettings) {
      return {
        chartType: savedSettings.chartType || "vertical_bar",
        xAxis: savedSettings.xAxis || {},
        yAxis: savedSettings.yAxis || { whatToShow: "count" },
        style: savedSettings.style || { height: "medium", gridLines: "none" },
      };
    }
    // Default settings
    return {
      chartType: "vertical_bar",
      xAxis: {},
      yAxis: { whatToShow: "count" },
      style: { height: "medium", gridLines: "none" },
    };
  }, [currentViewTypeId, contextChartSettings, currentViewData]);

  const boardProperties = getCurrentDataSourceProperties(board._id) || {};

  const groupingHelpers: ChartGroupingHelpers = {
    boardProperties,
    getNotesByDataSourceId,
    getDataSource,
    getRelationNoteTitle,
    getValidRelationIds,
  };

  // Get default property for X-axis (auto-select if no settings)
  const getDefaultXAxisProperty = useMemo(() => {
    // If xAxis property is already set, use it
    if (chartSettings.xAxis?.propertyId && boardProperties[chartSettings.xAxis.propertyId]) {
      return chartSettings.xAxis.propertyId;
    }

    // Try to find a suitable default property (prefer status, select, then any property)
    const propertyEntries = Object.entries(boardProperties);

    // First, try to find status or select property
    const statusOrSelect = propertyEntries.find(([_, prop]) =>
      prop.type === "status" || prop.type === "select" || prop.type === "multi_select"
    );
    if (statusOrSelect) {
      return statusOrSelect[0];
    }

    // Then try date property
    const dateProperty = propertyEntries.find(([_, prop]) => prop.type === "date");
    if (dateProperty) {
      return dateProperty[0];
    }

    // Then try person property
    const personProperty = propertyEntries.find(([_, prop]) => prop.type === "person");
    if (personProperty) {
      return personProperty[0];
    }

    // Finally, use the first available property (excluding formula and rollup)
    const firstProperty = propertyEntries.find(([_, prop]) =>
      prop.type !== "formula" && prop.type !== "rollup"
    );
    if (firstProperty) {
      return firstProperty[0];
    }

    return null;
  }, [boardProperties, chartSettings.xAxis?.propertyId]);

  // Enhanced chart settings with defaults
  // For donut charts, derive donut settings from X/Y axis (computed, not stored)
  type DonutSettings = {
    whatToShow?: string;
    eachSliceRepresents?: "count" | string;
    sortDirection?: "ascending" | "descending" | "high_to_low" | "low_to_high";
  };

  // Compute donut settings from X/Y axis (not stored in types)
  const donutSettings = useMemo<DonutSettings | undefined>(() => {
    const defaultXAxisProperty = getDefaultXAxisProperty;
    const isDonut = chartSettings.chartType === "donut";

    if (!isDonut) return undefined;

    // For donut charts, derive donut settings from X/Y axis
    // Settings UI: "What to show" = X-axis, "Each slice represents" = Y-axis
    // But for rendering: Slices = X-axis (like other charts), Values = Y-axis (like other charts)
    return {
      whatToShow: chartSettings.xAxis?.propertyId || defaultXAxisProperty || undefined,
      eachSliceRepresents: chartSettings.yAxis?.whatToShow === "count"
        ? "count"
        : (chartSettings.yAxis?.whatToShow || defaultXAxisProperty || undefined),
      sortDirection: chartSettings.xAxis?.sortDirection || "ascending",
    };
  }, [chartSettings, getDefaultXAxisProperty]);

  const enhancedChartSettings = useMemo<ChartSettings & { donut?: DonutSettings }>(() => {
    const defaultXAxisProperty = getDefaultXAxisProperty;

    return {
      ...chartSettings,
      xAxis: {
        ...chartSettings.xAxis,
        propertyId: chartSettings.xAxis?.propertyId || defaultXAxisProperty || undefined,
        sortDirection: chartSettings.xAxis?.sortDirection || "ascending",
        omitZeroValues: chartSettings.xAxis?.omitZeroValues ?? false,
      },
      yAxis: {
        whatToShow: chartSettings.yAxis?.whatToShow || "count",
        groupBy: chartSettings.yAxis?.groupBy,
        referenceLines: chartSettings.yAxis?.referenceLines,
      },
      style: {
        height: chartSettings.style?.height || "medium",
        gridLines: chartSettings.style?.gridLines || "none",
        axisName: chartSettings.style?.axisName || "both",
        dataLabels: chartSettings.style?.dataLabels ?? false,
        caption: chartSettings.style?.caption,
        showCaption: chartSettings.style?.showCaption ?? false,
        smoothLine: chartSettings.style?.smoothLine ?? false,
        gradientArea: chartSettings.style?.gradientArea ?? false,
        legend: chartSettings.style?.legend ?? false,
        showValueInCenter: chartSettings.style?.showValueInCenter ?? false,
        donutDataLabel: chartSettings.style?.donutDataLabel || "none",
        color: chartSettings.style?.color,
      },
      donut: donutSettings,
    };
  }, [chartSettings, donutSettings, getDefaultXAxisProperty]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // Apply basic filters
    const filters = getFilters(board._id) || {};
    Object.entries(filters).forEach(([propertyId, filterValues]) => {
      if (!filterValues || filterValues.length === 0) return;

      const propSchema = boardProperties[propertyId];

      filtered = filtered.filter((note) => {
        const value = note.value.databaseProperties?.[propertyId];
        if (value === undefined || value === null) return false;

        if (Array.isArray(value)) {
          return value.some((v: string) => filterValues.includes(v));
        }
        return filterValues.includes(String(value));
      });
    });

    // Apply advanced filters
    const advancedFilters = getAdvancedFilters(board._id) || [];
    if (advancedFilters.length > 0) {
      filtered = applyAdvancedFilters(
        filtered,
        advancedFilters,
        boardProperties,
        getNotesByDataSourceId,
        getDataSource
      );
    }

    return filtered;
  }, [notes, getFilters, getAdvancedFilters, board._id, boardProperties, getNotesByDataSourceId, getDataSource]);

  // Aggregate data for chart using books-style processor
  const chartData = useMemo(() => {
    const groupingHelpers: ChartGroupingHelpers = {
      boardProperties,
      getNotesByDataSourceId,
      getDataSource,
      getRelationNoteTitle,
      getValidRelationIds,
    };

    // Handle donut charts
    if (enhancedChartSettings.chartType === "donut") {
      // books-style mapping (matching other charts):
      // Settings UI stores: "What to show" = X-axis, "Each slice represents" = Y-axis
      // But for rendering (to match other charts): Slices = X-axis, Values = Y-axis
      // So we swap: slices use whatToShow (X-axis), values use eachSliceRepresents (Y-axis)

      // Slices = X-axis property (from "What to show" in settings)
      const slicePropertyId = enhancedChartSettings.donut?.whatToShow;
      if (!slicePropertyId) {
        return [];
      }
      const sliceProperty = boardProperties[slicePropertyId];
      if (!sliceProperty) return [];

      // Values = Y-axis property (from "Each slice represents" in settings)
      const valuePropertyId = enhancedChartSettings.donut?.eachSliceRepresents;
      if (!valuePropertyId) {
        return [];
      }
      // If valuePropertyId is "count", valueProperty should be null
      const valueProperty = valuePropertyId === "count"
        ? null
        : (boardProperties[valuePropertyId] ?? null);

      // Process chart data using books-style processor
      // Pass "count" as string literal if valuePropertyId is "count"
      const result = processChartData(
        filteredNotes,
        slicePropertyId,
        sliceProperty,
        valuePropertyId === "count" ? "count" : valuePropertyId,
        valueProperty,
        groupingHelpers,
      );

      // Convert to chart data format
      let data = result.slices.map((slice) => ({
        name: slice.key,
        value: slice.count,
        percent: slice.percent,
        count: slice.count, // For compatibility
      }));

      // If "omit zero values" is enabled, hide empty options
      if (enhancedChartSettings.xAxis?.omitZeroValues) {
        data = data.filter((item) => item.value !== 0);
      }

      // Sort data by X-axis sort direction
      if (enhancedChartSettings.donut?.sortDirection) {
        data.sort((a, b) => {
          const sortDirection = enhancedChartSettings.donut?.sortDirection;
          switch (sortDirection) {
            case "ascending":
              return a.name.localeCompare(b.name);
            case "descending":
              return b.name.localeCompare(a.name);
            case "high_to_low":
              return b.value - a.value; // Sort by value descending (high to low)
            case "low_to_high":
              return a.value - b.value; // Sort by value ascending (low to high)
            default:
              return 0;
          }
        });
      }

      return data;
    }

    // Handle bar and line charts
    if (!enhancedChartSettings.xAxis?.propertyId) {
      return [];
    }

    const xPropertyId = enhancedChartSettings.xAxis.propertyId;
    const xProperty = boardProperties[xPropertyId];
    if (!xProperty) return [];

    // Determine value property: "count" or property ID
    const valuePropertyId = enhancedChartSettings.yAxis?.whatToShow || "count";
    const valueProperty = valuePropertyId === "count"
      ? null
      : (boardProperties[valuePropertyId] ?? null);

    // Process chart data using books-style processor
    const result = processChartData(
      filteredNotes,
      xPropertyId,
      xProperty,
      valuePropertyId,
      valueProperty,
      groupingHelpers,
    );

    // Convert to chart data format
    let data = result.slices.map((slice) => ({
      name: slice.key,
      value: slice.count,
      count: slice.count, // For compatibility
    }));

    // If "omit zero values" is enabled, hide empty options
    if (enhancedChartSettings.xAxis?.omitZeroValues) {
      data = data.filter((item) => item.value !== 0);
    }

    // Sort data
    if (enhancedChartSettings.xAxis?.sortDirection) {
      data.sort((a, b) => {
        const sortDirection = enhancedChartSettings.xAxis?.sortDirection;
        switch (sortDirection) {
          case "ascending":
            return a.name.localeCompare(b.name);
          case "descending":
            return b.name.localeCompare(a.name);
          case "high_to_low":
            return b.value - a.value; // Sort by value descending (high to low)
          case "low_to_high":
            return a.value - b.value; // Sort by value ascending (low to high)
          default:
            return 0;
        }
      });
    }

    return data;
  }, [filteredNotes, enhancedChartSettings, boardProperties, getDefaultXAxisProperty, getNotesByDataSourceId, getDataSource, getRelationNoteTitle]);

  // Calculate global distinct count for donut charts (used for center text and percentage)
  // This is extracted from chartData for donut charts
  const globalDistinctCount = useMemo(() => {
    if (enhancedChartSettings.chartType !== "donut") return 0;

    // For donut: slices = X-axis (whatToShow in settings), values = Y-axis (eachSliceRepresents in settings)
    const slicePropertyId = enhancedChartSettings.donut?.whatToShow; // X-axis property (from settings UI)
    const valuePropertyId = enhancedChartSettings.donut?.eachSliceRepresents; // Y-axis property (from settings UI)

    // If valuePropertyId is "count" or not set, return 0 (will use total notes instead)
    if (!valuePropertyId || valuePropertyId === "count") return 0;

    if (!slicePropertyId) return 0;

    const sliceProperty = boardProperties[slicePropertyId];
    const valueProperty = boardProperties[valuePropertyId];
    if (!sliceProperty || !valueProperty) return 0;

    const groupingHelpers: ChartGroupingHelpers = {
      boardProperties,
      getNotesByDataSourceId,
      getDataSource,
      getRelationNoteTitle,
      getValidRelationIds,
    };

    const result = processChartData(
      filteredNotes,
      slicePropertyId,
      sliceProperty,
      valuePropertyId,
      valueProperty,
      groupingHelpers,
    );

    return result.totalDistinct;
  }, [enhancedChartSettings.chartType, enhancedChartSettings.donut?.eachSliceRepresents, enhancedChartSettings.donut?.whatToShow, boardProperties, filteredNotes, getNotesByDataSourceId, getDataSource, getRelationNoteTitle]);

  const chartHeight = HEIGHT_MAP[enhancedChartSettings.style?.height || "medium"];

  // Convert chart data to Chart.js format
  const chartJsData = useMemo(() => {
    if (chartData.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    const labels = chartData.map((item) => item.name);
    const values = chartData.map((item) => item.value);
    const backgroundColor = chartData.map((_, index) => COLORS[index % COLORS.length]);

    const isDonut = enhancedChartSettings.chartType === "donut";
    const isLine = enhancedChartSettings.chartType === "line";

    // Label should reflect the property used
    let datasetLabel = "Value";
    if (isDonut && enhancedChartSettings.donut?.whatToShow) {
      const prop = boardProperties[enhancedChartSettings.donut.whatToShow];
      datasetLabel = prop?.name || enhancedChartSettings.donut.whatToShow || "Value";
    } else if (isLine && enhancedChartSettings.xAxis?.propertyId) {
      // For line charts, use x-axis property name
      const xAxisProperty = boardProperties[enhancedChartSettings.xAxis.propertyId];
      datasetLabel = xAxisProperty?.name
        ? `${xAxisProperty.name.charAt(0).toUpperCase() + xAxisProperty.name.slice(1)}`
        : "Value";
    } else if (!isDonut) {
      datasetLabel =
        enhancedChartSettings.yAxis?.whatToShow === "count"
          ? "Count"
          : enhancedChartSettings.yAxis?.whatToShow || "Value";
    }

    return {
      labels,
      datasets: [
        {
          label: datasetLabel,
          data: values,
          backgroundColor: isDonut
            ? backgroundColor
            : enhancedChartSettings.style?.color
              ? backgroundColor.map(() => enhancedChartSettings.style?.color || COLORS[0])
              : backgroundColor,
          borderColor: isDonut
            ? backgroundColor
            : (enhancedChartSettings.style?.color || backgroundColor),
          borderWidth: 1,
        },
      ],
    };
  }, [chartData, enhancedChartSettings]);

  // Calculate step size and max value for Y-axis (books-style 1–2–5 scaling)
  const { stepSize, maxYValue } = useMemo(() => {
    if (chartData.length === 0) {
      return { stepSize: 1, maxYValue: 5 };
    }

    const maxValue = Math.max(...chartData.map((d) => d.value)) || 0;

    // Always show a minimum usable scale even for small values
    if (maxValue === 0) {
      return { stepSize: 1, maxYValue: 5 };
    }

    // 1) Desired number of ticks (books uses ~6–7)
    const TICK_TARGET = 6;

    // 2) Raw step size
    const rawStep = maxValue / TICK_TARGET;

    // 3) Apply 1–2–5 "nice number" rule
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const fraction = rawStep / magnitude;

    let niceStep;
    if (fraction <= 1) niceStep = 1 * magnitude;
    else if (fraction <= 2) niceStep = 2 * magnitude;
    else if (fraction <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    // 4) Nice max with a bit of padding (1 extra step above max)
    // e.g. max=12, step=2 → ticks up to 14 (no extra 15)
    const niceMax = Math.ceil(maxValue / niceStep) * niceStep + niceStep;

    return {
      stepSize: niceStep,
      maxYValue: niceMax,
    };
  }, [chartData]);

  // Chart options
  const getChartOptions = () => {
    const isHorizontal = enhancedChartSettings.chartType === "horizontal_bar";

    // Determine Y-axis label (for value axis)
    const yAxisWhatToShow = enhancedChartSettings.yAxis?.whatToShow;
    let yAxisLabel = "Count";
    if (yAxisWhatToShow && yAxisWhatToShow !== "count") {
      const yAxisProperty = boardProperties[yAxisWhatToShow];
      const propertyName = yAxisProperty?.name || yAxisWhatToShow;
      yAxisLabel = `${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)} (Distinct)`;
    } else {
      yAxisLabel = "Count";
    }

    // Grid configuration based on gridLines setting
    const gridLinesSetting = enhancedChartSettings.style?.gridLines || "none";
    const showHorizontalGrid = gridLinesSetting === "horizontal" || gridLinesSetting === "both";
    const showVerticalGrid = gridLinesSetting === "vertical" || gridLinesSetting === "both";

    const horizontalGridConfig = {
      display: showHorizontalGrid,
      color: "rgba(0, 0, 0, 0.08)",
      lineWidth: 1,
      drawBorder: false,
      borderDash: [2, 2] as [number, number],
    };

    const verticalGridConfig = {
      display: showVerticalGrid,
      color: "rgba(0, 0, 0, 0.08)",
      lineWidth: 1,
      drawBorder: false,
      borderDash: [2, 2] as [number, number],
    };

    // Shared ticks configuration for category axes
    const categoryTicks = {
      font: { size: 12 },
      color: "#37352F",
      padding: 8,
    };

    // Shared ticks configuration for numeric axes
    const numericTicks = {
      font: { size: 12 },
      color: "#37352F",
      padding: 8,
      stepSize: stepSize,
      callback: function (value: any) {
        return Number.isInteger(value) ? value : "";
      },
    };

    // Axis name configuration
    const axisNameSetting = enhancedChartSettings.style?.axisName || "both";
    const showXAxisName = axisNameSetting === "both" || axisNameSetting === "x-axis";
    const showYAxisName = axisNameSetting === "both" || axisNameSetting === "y-axis";

    // Y-axis title configuration (for value axis)
    const yAxisTitle = {
      display: showYAxisName,
      text: yAxisLabel,
      font: { size: 12, weight: "bold" as const },
      color: "#37352F",
      padding: { top: 0, bottom: 0, left: 0, right: 20 }, // Right padding for vertical Y-axis, left padding for horizontal X-axis
    };

    // X-axis title configuration (for category axis)
    // Get the X-axis property name for the title
    const xAxisPropertyId = enhancedChartSettings.xAxis?.propertyId;
    let xAxisLabel = "";
    if (xAxisPropertyId) {
      const xAxisProperty = boardProperties[xAxisPropertyId];
      xAxisLabel = xAxisProperty?.name ? `${xAxisProperty.name.charAt(0).toUpperCase() + xAxisProperty.name.slice(1)}` : "";
    }

    const xAxisTitle = {
      display: showXAxisName && xAxisLabel !== "",
      text: xAxisLabel,
      font: { size: 12, weight: "bold" as const },
      color: "#37352F",
      padding: { top: 20, bottom: 0, left: 0, right: 0 }, // Top padding for X-axis title
    };

    // Legend configuration - only for line and donut charts
    const showLegend = (enhancedChartSettings.chartType === "line" || enhancedChartSettings.chartType === "donut")
      ? (enhancedChartSettings.style?.legend ?? false)
      : false;

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isHorizontal ? ("y" as const) : ("x" as const),
      plugins: {
        legend: {
          display: showLegend,
          position: "bottom" as const,
          labels: {
            usePointStyle: true,
            pointStyle: enhancedChartSettings.chartType === "line" ? "rect" : "circle",
            padding: 12,
            font: {
              size: 12,
            },
            color: "#37352F",
          },
        },
        tooltip: {
          enabled: false,
        },
        // Data labels plugin configuration
        valueLabels: {
          enabled: enhancedChartSettings.style?.dataLabels ?? false,
          axisName: enhancedChartSettings.style?.axisName || "both",
        },
        // Reference lines only for non-donut charts
        ...(enhancedChartSettings.chartType !== "donut" && {
          referenceLines: {
            lines: enhancedChartSettings.yAxis?.referenceLines || [],
          },
        }),
      },
      scales:
        enhancedChartSettings.chartType !== "donut"
          ? isHorizontal
            ? {
              // Horizontal bar: X is numeric (value axis), Y is categories
              x: {
                display: true,
                max: maxYValue,
                grid: horizontalGridConfig, // Horizontal grid lines for horizontal charts
                ticks: numericTicks,
                beginAtZero: true,
                title: {
                  ...yAxisTitle,
                  padding: { top: 0, bottom: 20, left: 0, right: 0 }, // Bottom padding for X-axis title (horizontal charts)
                },
              },
              y: {
                display: true,
                grid: verticalGridConfig, // Vertical grid lines for horizontal charts
                ticks: categoryTicks,
                title: {
                  ...xAxisTitle,
                  padding: { top: 0, bottom: 0, left: 0, right: 20 }, // Right padding for Y-axis title (horizontal charts)
                },
              },
            }
            : {
              // Vertical bar: Y is numeric (value axis), X is categories
              x: {
                display: true,
                grid: verticalGridConfig, // Vertical grid lines for vertical charts
                ticks: categoryTicks,
                title: {
                  ...xAxisTitle,
                  padding: { top: 20, bottom: 0, left: 0, right: 0 }, // Top padding for X-axis title (vertical charts)
                },
              },
              y: {
                display: true,
                max: maxYValue,
                grid: horizontalGridConfig, // Horizontal grid lines for vertical charts
                ticks: numericTicks,
                beginAtZero: true,
                title: {
                  ...yAxisTitle,
                  padding: { top: 0, bottom: 0, left: 20, right: 0 }, // Left padding for Y-axis title (vertical charts)
                },
              },
            }
          : undefined,
    };

    return baseOptions;
  };

  // Render chart based on type
  const renderChart = () => {
    const options = getChartOptions();

    // Use empty data if no chart data, otherwise use actual data
    const dataToUse = chartData.length === 0
      ? {
        labels: [],
        datasets: [{
          label: "Value",
          data: [],
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
        }],
      }
      : chartJsData;

    // Create thinner bar datasets (books-like slim bars)
    const thinBarData = {
      ...dataToUse,
      datasets: dataToUse.datasets.map((dataset) => ({
        ...dataset,
        // Thin bars
        barThickness: 16,
        maxBarThickness: 16,
        borderRadius: 4,
      })),
    };

    switch (enhancedChartSettings.chartType) {
      case "vertical_bar":
        // Vertical bar chart
        return (
          <div style={{ height: `${chartHeight}px` }}>
            <Bar
              key="vertical_bar"
              data={thinBarData}
              options={options}
            />
          </div>
        );

      case "horizontal_bar":
        // Horizontal bar chart (orientation controlled by indexAxis in options)
        return (
          <div style={{ height: `${chartHeight}px` }}>
            <Bar
              key="horizontal_bar"
              data={thinBarData}
              options={options}
            />
          </div>
        );

      case "line":
        // Line chart: add one empty step at the start and end of the X axis
        // so the first/last points do not sit exactly on the chart edges (books-like spacing).
        const smoothLine = enhancedChartSettings.style?.smoothLine ?? false;
        const gradientArea = enhancedChartSettings.style?.gradientArea ?? false;

        const lineChartData = {
          ...chartJsData,
          labels: ["", ...chartJsData.labels, ""],
          datasets: chartJsData.datasets.map((dataset, index) => {
            const baseColor = Array.isArray(dataset.backgroundColor)
              ? dataset.backgroundColor[0]
              : (dataset.backgroundColor || COLORS[index % COLORS.length]);

            return {
              ...dataset,
              // Prepend and append nulls so Chart.js skips drawing points at the edge ticks
              data: [null as any, ...(dataset.data as any[]), null as any],
              // Smooth line configuration
              tension: smoothLine ? 0.4 : 0, // 0.4 for smooth curves, 0 for straight lines
              // Don't use Chart.js built-in fill - we'll use custom plugin for gradient
              fill: false,
              backgroundColor: baseColor,
              borderColor: baseColor,
              borderWidth: 2,
              pointRadius: 0, // Hide points
              pointHoverRadius: 4,
            };
          }),
        };

        // Create a plugin for gradient area fill
        const gradientAreaPlugin = gradientArea ? {
          id: "gradientAreaPlugin",
          afterDatasetsDraw: (chart: any) => {
            const { ctx, chartArea, scales } = chart;
            const dataset = chart.data.datasets[0];
            if (!dataset || !dataset.data || !chartArea) return;

            ctx.save();

            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || meta.data.length === 0) {
              ctx.restore();
              return;
            }

            // Get valid points (skip null values at start and end)
            const validPoints: any[] = [];
            for (let i = 1; i < meta.data.length - 1; i++) {
              const point = meta.data[i];
              if (point && point.x !== undefined && point.y !== undefined) {
                validPoints.push(point);
              }
            }

            if (validPoints.length === 0) {
              ctx.restore();
              return;
            }

            const firstPoint = validPoints[0];
            const lastPoint = validPoints[validPoints.length - 1];

            if (!firstPoint || !lastPoint) {
              ctx.restore();
              return;
            }

            const baseColor = Array.isArray(dataset.backgroundColor)
              ? dataset.backgroundColor[0]
              : (dataset.backgroundColor || COLORS[0]);

            // Get the x-axis position (y=0 on the chart)
            const yScale = scales.y;
            const xAxisY = yScale ? yScale.getPixelForValue(0) : chartArea.bottom;

            // Find the topmost point of the line
            let minY = chartArea.bottom;
            validPoints.forEach((point: any) => {
              if (point.y !== undefined) {
                minY = Math.min(minY, point.y);
              }
            });

            // Create vertical gradient from top of line to x-axis
            const gradient = ctx.createLinearGradient(0, minY, 0, xAxisY);
            gradient.addColorStop(0, baseColor + "CC"); // 80% opacity at top (line level)
            gradient.addColorStop(0.5, baseColor + "66"); // 40% opacity in middle
            gradient.addColorStop(1, baseColor + "00"); // 0% opacity at x-axis

            // Draw filled area below the line
            ctx.beginPath();
            ctx.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < validPoints.length; i++) {
              ctx.lineTo(validPoints[i].x, validPoints[i].y);
            }

            // Close path straight down to x-axis at last point, then back to first point
            ctx.lineTo(lastPoint.x, xAxisY);
            ctx.lineTo(firstPoint.x, xAxisY);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.restore();
          },
        } : null;

        return (
          <div style={{ height: `${chartHeight}px` }}>
            <Line
              key={`line-${gradientArea}-${smoothLine}`}
              data={lineChartData}
              options={options}
              plugins={gradientArea && gradientAreaPlugin ? [gradientAreaPlugin] : undefined}
            />
          </div>
        );

      case "donut":
        // - If Y-axis is "count": show total notes that have the slice property (X-axis property)
        const slicePropertyId = enhancedChartSettings.donut?.whatToShow; // X-axis property (slices)
        const valuePropertyId = enhancedChartSettings.donut?.eachSliceRepresents; // Y-axis property (values)

        // Check if Y-axis is "count" by checking the original yAxis.whatToShow
        const isYAxisCount = enhancedChartSettings.yAxis?.whatToShow === "count";

        let centerValue = 0;
        let centerLabel = "";

        if (isYAxisCount) {
          // Y-axis is "count": show total notes that have the slice property (X-axis)
          if (slicePropertyId) {
            const sliceProperty = boardProperties[slicePropertyId];
            if (sliceProperty) {
              const groupingHelpers: ChartGroupingHelpers = {
                boardProperties,
                getNotesByDataSourceId,
                getDataSource,
                getRelationNoteTitle,
                getValidRelationIds,
              };

              // Count notes that have a value for the slice property (excluding "Unassigned")
              centerValue = filteredNotes.filter((note) => {
                const val = getPropertyValueForGrouping(
                  note,
                  slicePropertyId,
                  sliceProperty,
                  groupingHelpers,
                );
                return val && val !== "Unassigned" && val.trim() !== "";
              }).length;
              centerLabel = "Total";
            } else {
              centerValue = filteredNotes.length;
              centerLabel = "Total";
            }
          } else {
            centerValue = filteredNotes.length;
            centerLabel = "Total";
          }
        } else {
          // Y-axis is a property: show distinct count of that property with "Distinct [property name]" label
          centerValue = globalDistinctCount;
          const valueProperty = valuePropertyId ? boardProperties[valuePropertyId] : null;
          const propertyName = valueProperty?.name || valuePropertyId || "Value";
          centerLabel = `Distinct ${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)}`;
        }

        const showValueInCenter = enhancedChartSettings.style?.showValueInCenter ?? false;
        const donutDataLabel = enhancedChartSettings.style?.donutDataLabel || "none";
        const showLegend = enhancedChartSettings.style?.legend ?? false;

        return (
          <div style={{ height: `${chartHeight}px` }} className="flex items-center justify-center">
            <div style={{ width: "280px", height: "280px", maxWidth: "100%", position: "relative" }}>
              <Doughnut
                data={dataToUse}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  cutout: "85%",
                  plugins: {
                    legend: {
                      display: showLegend,
                      position: "bottom" as const,
                      labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 12,
                        font: {
                          size: 12,
                        },
                        color: "#37352F",
                      },
                    },
                    tooltip: {
                      enabled: true,
                      position: "nearest",
                      yAlign: "bottom",
                      backgroundColor: "#000000",
                      titleColor: "#ffffff",
                      bodyColor: "#ffffff",
                      padding: 12,
                      callbacks: {
                        label: (context: any) => {
                          const label = context.label || "";
                          const value = context.parsed || 0;
                          // Use percent from data (distinctCount / globalDistinctCount * 100)
                          const dataIndex = context.dataIndex;
                          const item = dataIndex >= 0 ? chartData[dataIndex] : null;
                          const percent = item && 'percent' in item && typeof item.percent === 'number'
                            ? item.percent.toFixed(1)
                            : (globalDistinctCount > 0 ? ((value / globalDistinctCount) * 100).toFixed(1) : "0");
                          return `${label}: ${value} (${percent}%)`;
                        },
                      },
                    },
                    // @ts-ignore - Custom plugin option
                    donutDataLabel: {
                      mode: donutDataLabel,
                    },
                  },
                }}
              />
              {/* Center text: distinct count of Y-axis property, or "Total" if count */}
              {showValueInCenter && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                    pointerEvents: "none",
                    zIndex: 0,
                  }}
                >
                  <div style={{ fontSize: "64px", fontWeight: "600", color: "#37352F", lineHeight: "1.2" }}>
                    {centerValue}
                  </div>
                  {centerLabel && centerLabel.trim() !== "" ? (
                    <div style={{ fontSize: "13px", color: "#787774" }}>
                      {centerLabel}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Select a chart type to visualize your data.</p>
          </div>
        );
    }
  };

  // Check if we're using default values (no saved settings)
  const isUsingDefaults = !currentViewData?.settings?.chart;

  return (
    <div className="w-full p-4">
      {/* {isUsingDefaults && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Using default settings:</strong> Chart is displaying with auto-selected properties. 
            Click the settings icon to customize your chart configuration.
          </p>
        </div>
      )} */}
      <div className="bg-background rounded-lg border p-4">
        {renderChart()}
        {/* Caption display */}
        {enhancedChartSettings.style?.showCaption && enhancedChartSettings.style?.caption && (
          <div className="mt-4 text-sm whitespace-pre-wrap text-center">
            {enhancedChartSettings.style.caption}
          </div>
        )}
      </div>
    </div>
  );
}

