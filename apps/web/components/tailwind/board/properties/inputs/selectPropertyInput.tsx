"use client";

import { useEffect, useRef, useState } from "react";
import { BoardPropertyOption } from "@/types/board";
import EditIcon from "@/components/tailwind/ui/icons/editIcon";
import { getColorStylesAsCss } from "@/utils/colorStyles";

interface SelectPropertyInputProps {
  value: string;
  options: BoardPropertyOption[];
  onChange: (value: string) => void;
  onEditOptions: () => void;
}

export function SelectPropertyInput({
  value,
  options,
  onChange,
  onEditOptions,
}: SelectPropertyInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setHighlightIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search when open
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const list = listRef.current;
      const el = list.children[highlightIndex] as HTMLElement;
      if (el) {
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (top < list.scrollTop) {
          list.scrollTop = top;
        } else if (bottom > list.scrollTop + list.clientHeight) {
          list.scrollTop = bottom - list.clientHeight;
        }
      }
    }
  }, [highlightIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      const selected = filteredOptions[highlightIndex];
      if (selected) {
        onChange(selected.id);
        setOpen(false);
        setSearch("");
        setHighlightIndex(-1);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      setHighlightIndex(-1);
    }
  };

  const selectedOption = options.find(o => String(o.id) === String(value));

  return (
    <div
      ref={containerRef}
      className="relative px-2 py-1.5 flex flex-wrap gap-1.5 items-center w-[250px] hover:bg-gray-200 dark:hover:bg-[#2c2c2c] rounded-sm group cursor-pointer"
      onClick={() => setOpen(!open)}
    >
      {/* Selected value pill */}
      <div
        className={`rounded-md text-sm transition-colors ${value
          ? "px-2 py-0.5 hover:opacity-80"
          : "text-gray-400 dark:text-gray-500"
          }`}
        style={value ? getColorStylesAsCss(selectedOption?.color || "default") : {}}
      >
        {selectedOption?.name || "Select Option"}
      </div>

      {/* Edit button (hover only) */}
      <button
        className="absolute right-1.5 px-1 py-1 flex items-center gap-1 text-xs rounded-sm bg-white dark:bg-[#202020] dark:text-gray-400 dark:hover:bg-[#3c3c3c] invisible group-hover:visible"
        onClick={(e) => {
          e.stopPropagation();
          onEditOptions();
        }}
      >
        <EditIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-0 left-0 bg-white dark:bg-[#242424] rounded-lg shadow-xl border border-gray-200 dark:border-[#343434] w-[250px] max-h-[300px] overflow-hidden z-50"
        >
          {/* Search bar */}
          <div className="border-b border-gray-200 dark:border-[#343434] p-1 bg-gray-100 dark:bg-[#2c2c2c] ">
            <div className="flex flex-wrap items-center gap-2 px-2">
              {value && (
                <div
                  className="inline-flex items-center px-3 py-0.5 rounded-full text-sm"
                  style={getColorStylesAsCss(selectedOption?.color || "default")}
                >
                  <span>{selectedOption?.name}</span>
                </div>
              )}
              <div className="flex-1 min-w-[120px]">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search options..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full h-8 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Options */}
          <div ref={listRef} className="max-h-[240px] overflow-auto p-1 space-y-0.5">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => {
                const isHighlighted = i === highlightIndex;
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                      setSearch("");
                      setHighlightIndex(-1);
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`w-full px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${isHighlighted
                      ? "bg-gray-100 dark:bg-[#2c2c2c]"
                      : "hover:bg-gray-100 dark:hover:bg-[#2c2c2c]"
                      }`}
                  >
                    <span
                      className="px-2 py-0.5 rounded-md"
                      style={getColorStylesAsCss(opt.color || "default")}
                    >
                      {opt.name}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex justify-center items-center text-gray-500 p-4 text-sm">
                {search ? `No options for "${search}"` : "No options"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
