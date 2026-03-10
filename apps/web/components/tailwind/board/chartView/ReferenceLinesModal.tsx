"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferenceLine {
  value: number;
  label?: string;
  style?: "solid" | "dashed";
  color?: string;
}

interface ReferenceLinesModalProps {
  referenceLines: ReferenceLine[];
  onReferenceLinesChange: (lines: ReferenceLine[]) => void;
  onClose: () => void;
}

const REFERENCE_LINE_COLORS = [
  { name: "Black", value: "#55534E" },
  { name: "Gray", value: "#A6A299" },
  { name: "Brown", value: "#9F6B53" },
  { name: "Orange", value: "#CB912F" },
  { name: "Orange Red", value: "#D9730D" },
  { name: "Green", value: "#448363" },
  { name: "Blue", value: "#337EA9" },
  { name: "Purple", value: "#9065B0" },
  { name: "Pink", value: "#C14C8A" },
  { name: "Red", value: "#D44C47" },
];

function StyleDropdown({
  selectedStyle,
  onStyleChange,
}: {
  selectedStyle: "solid" | "dashed";
  onStyleChange: (style: "solid" | "dashed") => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (styleRef.current && !styleRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const styleOptions: Array<{ value: "solid" | "dashed"; label: string }> = [
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dash" },
  ];

  const selectedLabel = styleOptions.find((opt) => opt.value === selectedStyle)?.label || "Dash";

  return (
    <div className="relative flex" ref={styleRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center transition-colors text-xs font-normal bg-transparent border-none p-0 cursor-pointer text-muted-foreground"
      >
        <span>{selectedLabel}</span>
        <ChevronRight className="h-4 w-4 transition-transform ml-1.5 text-muted-foreground" />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-popover border border-border rounded-md shadow-lg right-0 top-full min-w-[200px]">
          {styleOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onStyleChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                "w-full px-3 py-2 text-sm text-left hover:bg-gray-100 transition-colors border-none cursor-pointer text-foreground",
                selectedStyle === option.value && "bg-gray-100"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorDropdown({
  selectedColor,
  onColorChange,
}: {
  selectedColor: string;
  onColorChange: (color: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const selectedColorName = REFERENCE_LINE_COLORS.find((c) => c.value === selectedColor)?.name || "Black";

  return (
    <div className="relative flex items-center cursor-pointer" ref={colorRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 transition-colors bg-none border-none p-0 cursor-pointer"
      >
        <div
          className="w-4 h-4 rounded"
          style={{ 
            backgroundColor: selectedColor,
          }}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {selectedColorName}
        </span>
        <ChevronRight className="w-4 h-4 block flex-shrink-0 transition-transform -rotate-90 text-muted-foreground" />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 p-2 bg-popover border border-border rounded-md shadow-lg right-0 top-full min-w-[200px]">
          <div className="grid grid-cols-5 gap-2">
            {REFERENCE_LINE_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => {
                  onColorChange(color.value);
                  setIsOpen(false);
                }}
                className="p-1 rounded hover:bg-gray-200 transition-colors bg-transparent border-none cursor-pointer"
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded mx-auto",
                    selectedColor === color.value ? "border-2 border-foreground" : "border border-transparent"
                  )}
                  style={{ backgroundColor: color.value }}
                >
                  {selectedColor === color.value && (
                    <Check className="h-3.5 w-3.5 text-white m-auto" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReferenceLinesModal({
  referenceLines,
  onReferenceLinesChange,
  onClose,
}: ReferenceLinesModalProps) {
  // Local state to track input values without triggering API calls
  const [localReferenceLines, setLocalReferenceLines] = useState<ReferenceLine[]>(referenceLines);

  // Sync local state when referenceLines prop changes
  useEffect(() => {
    setLocalReferenceLines(referenceLines);
  }, [referenceLines]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Save changes to API (called on blur or Enter)
  const saveChanges = useCallback(() => {
    onReferenceLinesChange(localReferenceLines);
  }, [localReferenceLines, onReferenceLinesChange]);

  return (
    <div 
      className="flex flex-col min-w-[280px] max-w-[calc(-24px+100vw)] bg-background border border-border rounded-md shadow-lg overflow-hidden relative max-h-[400px] z-[1000]"
    >
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-muted-foreground text-center">
            Add reference lines to set targets, mark thresholds, and bring clarity to your charts.
          </div>
          
          {localReferenceLines.map((line, index) => (
            <div key={index} className="rounded-lg" style={{ backgroundColor: "#F2F2F2" }}>
              <div role="menu" tabIndex={0} className="rounded-lg">
                <div className="flex flex-col relative p-1 gap-[1px]">
                  {/* Value section */}
                  <div className="flex flex-col px-2 mb-0.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground min-h-[24px] flex items-center justify-center">
                        Value
                      </div>
                      <button
                        onClick={() => {
                          const newLines = localReferenceLines.filter((_, i) => i !== index);
                          setLocalReferenceLines(newLines);
                          onReferenceLinesChange(newLines);
                        }}
                        className="p-0 w-6 h-6 flex items-center justify-center hover:bg-200 rounded-md transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex-grow">
                      <input
                        type="number"
                        placeholder="Value"
                        className="w-full px-2.5 py-1 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring input-hide-arrows"
                        value={line.value || ""}
                        onChange={(e) => {
                          const newLines = [...localReferenceLines];
                          newLines[index] = { ...line, value: parseFloat(e.target.value) || 0 };
                          setLocalReferenceLines(newLines);
                        }}
                        onBlur={saveChanges}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                            saveChanges();
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Label section */}
                  <div className="flex flex-col px-2 mb-0.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground min-h-[24px] flex items-center justify-center">
                        Label
                      </div>
                    </div>
                    <div className="flex-grow">
                      <input
                        type="text"
                        placeholder="Label"
                        maxLength={50}
                        className="w-full px-2.5 py-1 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        value={line.label || ""}
                        onChange={(e) => {
                          const newLines = [...localReferenceLines];
                          newLines[index] = { ...line, label: e.target.value };
                          setLocalReferenceLines(newLines);
                        }}
                        onBlur={saveChanges}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                            saveChanges();
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Style and Color section */}
                  <div data-popup-origin="true" className="contents">
                    <div 
                      role="menuitem" 
                      tabIndex={-1} 
                      aria-expanded="false" 
                      aria-haspopup="dialog" 
                      className="w-full flex rounded-md cursor-pointer transition-colors hover:bg-gray-200 min-h-[28px] px-2 items-center my-1"
                    >
                      <div className="flex items-center w-full gap-2 text-sm text-foreground">
                        <div className="m-0 min-w-0 flex-1">
                          <div>Style</div>
                        </div>
                        <div className="min-w-0 flex-shrink-0 flex items-center text-muted-foreground">
                          <StyleDropdown
                            selectedStyle={line.style || "dashed"}
                            onStyleChange={(style) => {
                              const newLines = [...localReferenceLines];
                              newLines[index] = { ...line, style };
                              setLocalReferenceLines(newLines);
                              onReferenceLinesChange(newLines);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div data-popup-origin="true" className="contents">
                    <div 
                      role="menuitem" 
                      tabIndex={-1} 
                      aria-expanded="false" 
                      aria-haspopup="dialog" 
                      className="w-full flex rounded-md cursor-pointer transition-colors hover:bg-gray-200 min-h-[28px] px-2 items-center"
                    >
                      <div className="flex items-center w-full gap-2 text-sm text-foreground">
                        <div className="m-0 min-w-0 flex-1">
                          <div>Color</div>
                        </div>
                        <div className="min-w-0 flex-shrink-0 flex items-center text-muted-foreground">
                          <ColorDropdown
                            selectedColor={line.color || "#55534E"}
                            onColorChange={(color) => {
                              const newLines = [...localReferenceLines];
                              newLines[index] = { ...line, color };
                              setLocalReferenceLines(newLines);
                              onReferenceLinesChange(newLines);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div id="footer-menu" tabIndex={0} role="menu" className="rounded-lg py-3">
          <div className="gap-[1px] relative">
            <button
              onClick={() => {
                const newLines: ReferenceLine[] = [
                  ...localReferenceLines,
                  { value: 0, label: "", style: "dashed" as const, color: "#55534E" },
                ];
                setLocalReferenceLines(newLines);
                onReferenceLinesChange(newLines);
              }}
              className="w-full flex items-center justify-center gap-2 transition-colors hover:bg-gray-200 h-7 text-sm font-medium px-2 rounded-md bg-gray-100 cursor-pointer border border-border text-foreground"
            >
              <Plus className="h-5 w-5" />
              Add reference line
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}