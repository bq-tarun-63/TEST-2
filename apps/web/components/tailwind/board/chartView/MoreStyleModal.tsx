"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  DropdownMenu, 
  DropdownMenuSectionHeading,
  DropdownMenuToggle,
  DropdownMenuIcons
} from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Toggle component that renders as a div (not a button) to avoid nested buttons
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onChange(!checked);
        }
      }}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer",
        checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </div>
  );
}

interface MoreStyleSettings {
  height?: "small" | "medium" | "large";
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
}

interface MoreStyleModalProps {
  settings: MoreStyleSettings;
  chartType?: "vertical_bar" | "horizontal_bar" | "line" | "donut";
  onSettingsChange: (settings: MoreStyleSettings) => void;
  onClose: () => void;
}

export default function MoreStyleModal({
  settings,
  chartType = "vertical_bar",
  onSettingsChange,
  onClose,
}: MoreStyleModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [localSettings, setLocalSettings] = useState<MoreStyleSettings>(settings);
  const localRef = useRef<MoreStyleSettings>(settings);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const heightDropdownRef = useRef<HTMLDivElement>(null);
  const gridLinesDropdownRef = useRef<HTMLDivElement>(null);
  const axisNameDropdownRef = useRef<HTMLDivElement>(null);
  const donutDataLabelDropdownRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalSettings(settings);
    localRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (openDropdown) {
          setOpenDropdown(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, openDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modalRef.current && !modalRef.current.contains(target)) {
        if (openDropdown) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        } else {
          onClose();
        }
      }
      // Also close dropdown if clicking on another menu item
      if (openDropdown && menuContainerRef.current?.contains(target)) {
        const clickedButton = (target as HTMLElement).closest('button[data-menu-item-id]');
        if (clickedButton && clickedButton.getAttribute('data-menu-item-id') !== openDropdown) {
          setOpenDropdown(null);
          setDropdownPosition(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, openDropdown]);

  const saveChanges = useCallback(() => {
    onSettingsChange(localRef.current);
  }, [onSettingsChange]);

  const updateSetting = useCallback(<K extends keyof MoreStyleSettings>(
    key: K,
    value: MoreStyleSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    localRef.current = newSettings;
    onSettingsChange(newSettings);
  }, [localSettings, onSettingsChange]);

  const updateCaption = useCallback((caption: string) => {
    const newSettings = { ...localSettings, caption };
    setLocalSettings(newSettings);
    localRef.current = newSettings;
  }, [localSettings]);

  const heightOptions: Array<{ value: "small" | "medium" | "large"; label: string }> = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ];

  const gridLineOptions: Array<{ value: "none" | "horizontal" | "vertical" | "both"; label: string }> = [
    { value: "none", label: "None" },
    { value: "horizontal", label: "Horizontal" },
    { value: "vertical", label: "Vertical" },
    { value: "both", label: "Both" },
  ];

  const axisNameOptions: Array<{ value: "both" | "x-axis" | "y-axis"; label: string }> = [
    { value: "both", label: "Both" },
    { value: "x-axis", label: "X-axis" },
    { value: "y-axis", label: "Y-axis" },
  ];

  const donutDataLabelOptions: Array<{ value: "none" | "value" | "name" | "nameAndValue"; label: string }> = [
    { value: "none", label: "None" },
    { value: "value", label: "Value" },
    { value: "name", label: "Name" },
    { value: "nameAndValue", label: "Name and value" },
  ];

  const currentHeight = localSettings.height || "medium";
  const currentGridLines = localSettings.gridLines || "none";
  const currentAxisName = localSettings.axisName || "both";
  const currentDonutDataLabel = localSettings.donutDataLabel || "none";
  const isLineChart = chartType === "line";
  const isDonutChart = chartType === "donut";

  const handleDropdownToggle = useCallback((dropdownId: string, event?: React.MouseEvent) => {
    if (openDropdown === dropdownId) {
      setOpenDropdown(null);
      setDropdownPosition(null);
      return;
    }

    // Calculate position relative to the clicked menu item
    if (event?.currentTarget && menuContainerRef.current) {
      const button = event.currentTarget as HTMLElement;
      const containerRect = menuContainerRef.current.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      setDropdownPosition({
        top: buttonRect.bottom - containerRect.top + 4, // 4px gap
        left: buttonRect.left - containerRect.left,
      });
    } else {
      setDropdownPosition(null);
    }
    
    setOpenDropdown(dropdownId);
  }, [openDropdown]);

  const menuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];

    // Height (always shown)
    items.push({
      id: 'height',
      label: "Height",
      icon: <DropdownMenuIcons.Sort />,
      onClick: (e) => handleDropdownToggle("height", e),
      hasChevron: true,
      count: heightOptions.find(opt => opt.value === currentHeight)?.label || "Medium",
    });

    // Grid lines (only for line and bar charts, not donut)
    if (!isDonutChart) {
      items.push({
        id: 'grid-lines',
        label: "Grid line",
        icon: <DropdownMenuIcons.Grid2x2 />,
        onClick: (e) => handleDropdownToggle("gridLines", e),
        hasChevron: true,
        count: gridLineOptions.find(opt => opt.value === currentGridLines)?.label || "None",
      });

      // Axis name (only for line and bar charts, not donut)
      items.push({
        id: 'axis-name',
        label: "Axis name",
        icon: <DropdownMenuIcons.Alphabet />,
        onClick: (e) => handleDropdownToggle("axisName", e),
        hasChevron: true,
        count: axisNameOptions.find(opt => opt.value === currentAxisName)?.label || "Both",
      });
    }

    // Line chart specific options
    if (isLineChart) {
      // Smooth line
      items.push({
        id: 'smooth-line',
        label: "Smooth line",
        icon: <DropdownMenuIcons.ChartSpline />,
        onClick: () => {}, // Toggle handles its own click
        rightElement: (
          <ToggleSwitch
            checked={localSettings.smoothLine ?? false}
            onChange={(checked) => updateSetting("smoothLine", checked)}
          />
        ),
      });

      // Gradient area
      items.push({
        id: 'gradient-area',
        label: "Gradient area",
        icon: <DropdownMenuIcons.ChartArea />,
        onClick: () => {}, // Toggle handles its own click
        rightElement: (
          <ToggleSwitch
            checked={localSettings.gradientArea ?? false}
            onChange={(checked) => updateSetting("gradientArea", checked)}
          />
        ),
      });
    }

    // Legend (for line and donut charts only)
    if (isLineChart || isDonutChart) {
      items.push({
        id: 'legend',
        label: "Legend",
        icon: <DropdownMenuIcons.List />,
        onClick: () => {}, // Toggle handles its own click
        rightElement: (
          <ToggleSwitch
            checked={localSettings.legend ?? false}
            onChange={(checked) => updateSetting("legend", checked)}
          />
        ),
      });
    }

    // Data labels (for line and bar charts)
    if (!isDonutChart) {
      items.push({
        id: 'data-labels',
        label: "Data labels",
        icon: <DropdownMenuIcons.Count />,
        onClick: () => {}, // Toggle handles its own click
        rightElement: (
          <ToggleSwitch
            checked={localSettings.dataLabels ?? false}
            onChange={(checked) => updateSetting("dataLabels", checked)}
          />
        ),
      });
    }

    // Donut chart specific options
    if (isDonutChart) {
      // Show value in center
      items.push({
        id: 'show-value-in-center',
        label: "Show value in center",
        icon: <DropdownMenuIcons.Count />,
        onClick: () => {}, // Toggle handles its own click
        rightElement: (
          <ToggleSwitch
            checked={localSettings.showValueInCenter ?? false}
            onChange={(checked) => updateSetting("showValueInCenter", checked)}
          />
        ),
      });

      // Donut data label
      items.push({
        id: 'donut-data-label',
        label: "Data label",
        icon: <DropdownMenuIcons.Count />,
        onClick: (e) => handleDropdownToggle("donutDataLabel", e),
        hasChevron: true,
        count: donutDataLabelOptions.find(opt => opt.value === currentDonutDataLabel)?.label || "None",
      });
    }

    // Caption toggle (always shown)
    items.push({
      id: 'caption',
      label: "Caption",
      icon: <DropdownMenuIcons.AlignLeft />,
      onClick: () => {}, // Toggle handles its own click
      rightElement: (
        <ToggleSwitch
          checked={localSettings.showCaption ?? false}
          onChange={(checked) => updateSetting("showCaption", checked)}
        />
      ),
    });

    return items;
  }, [
    currentHeight,
    currentGridLines,
    currentAxisName,
    currentDonutDataLabel,
    isLineChart,
    isDonutChart,
    localSettings.dataLabels,
    localSettings.showCaption,
    localSettings.smoothLine,
    localSettings.gradientArea,
    localSettings.legend,
    localSettings.showValueInCenter,
    openDropdown,
    updateSetting,
    handleDropdownToggle,
  ]);

  const handleCaptionBlur = useCallback(() => {
    if (localSettings.caption !== localRef.current.caption) {
      saveChanges();
    }
  }, [localSettings.caption, saveChanges]);

  const handleCaptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Get the current value from the textarea
      const currentValue = e.currentTarget.value;
      // Update local ref with current value
      const newSettings = { ...localSettings, caption: currentValue };
      localRef.current = newSettings;
      setLocalSettings(newSettings);
      // Blur and save
      e.currentTarget.blur();
      saveChanges();
    }
    // Shift+Enter allows normal textarea behavior (new line)
  }, [localSettings, saveChanges]);

  return (
    <div 
      ref={modalRef}
      className="flex flex-col min-w-[280px] max-w-[calc(-24px+100vw)] bg-background border border-border rounded-md shadow-lg overflow-hidden relative z-[1000]"
    >
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-1 relative" ref={menuContainerRef}>
          <DropdownMenu items={menuItems} />
          
          {/* Height dropdown */}
          {openDropdown === "height" && dropdownPosition && (
            <div 
              ref={heightDropdownRef}
              className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[120px]"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
            >
              {heightOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateSetting("height", option.value);
                    setOpenDropdown(null);
                    setDropdownPosition(null);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                    currentHeight === option.value && "bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Grid lines dropdown */}
          {openDropdown === "gridLines" && dropdownPosition && (
            <div 
              ref={gridLinesDropdownRef}
              className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[120px]"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
            >
              {gridLineOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateSetting("gridLines", option.value);
                    setOpenDropdown(null);
                    setDropdownPosition(null);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                    currentGridLines === option.value && "bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Axis name dropdown */}
          {openDropdown === "axisName" && dropdownPosition && (
            <div 
              ref={axisNameDropdownRef}
              className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[120px]"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
            >
              {axisNameOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateSetting("axisName", option.value);
                    setOpenDropdown(null);
                    setDropdownPosition(null);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                    currentAxisName === option.value && "bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Donut data label dropdown */}
          {openDropdown === "donutDataLabel" && dropdownPosition && (
            <div 
              ref={donutDataLabelDropdownRef}
              className="absolute bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50 min-w-[180px]"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
            >
              {donutDataLabelOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateSetting("donutDataLabel", option.value);
                    setOpenDropdown(null);
                    setDropdownPosition(null);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors border-none cursor-pointer text-foreground",
                    currentDonutDataLabel === option.value && "bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Caption textarea (always visible) */}
        <div className="px-4 py-2">
          <div className="flex items-center w-full text-sm relative rounded-md border border-border bg-background cursor-text px-2.5 py-1.5">
            <textarea
              placeholder="Caption"
              maxLength={1000}
              rows={3}
              className="w-full text-sm border-none bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
              value={localSettings.caption || ""}
              onChange={(e) => updateCaption(e.target.value)}
              onBlur={handleCaptionBlur}
              onKeyDown={handleCaptionKeyDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
