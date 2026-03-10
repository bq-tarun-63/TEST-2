import { BoardProperty, BoardPropertyOption } from "@/types/board";
import React from "react";
import { useState, useEffect, useRef } from "react";
import EditIcon from "@/components/tailwind/ui/icons/editIcon";
import { getColorStyles } from "@/utils/colorStyles";
import { useSprintStatusConstraints } from "@/hooks/useSprintStatusConstraints";

interface Props {
  value: string;
  propertyId: string;
  property?: BoardProperty;
  onChange: (val: string) => void;
  onEditOptions?: (propertyId: string) => void;
  boardId?: string;
  noteId?: string;
}

export const StatusPropertyInput: React.FC<Props> = ({ value, propertyId, property, onChange, onEditOptions, boardId, noteId }) => {
  const [openDropdown, setOpenDropdown] = useState(false);
  const options = property?.options;

  const selectedOption = options?.find(opt => String(opt.id) === String(value));
  const colorStyles = getColorStyles(selectedOption?.color || "default");

  if (!options || options.length === 0) {
    return <span className="text-sm text-gray-400">Empty</span>;
  }

  const [searchTerm, setSearchTerm] = useState("");
  const [filteredOptions, setFilteredOptions] = useState<BoardPropertyOption[]>(options);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionListRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { getDisabledStatusOptionIds } = useSprintStatusConstraints(boardId);
  const disabledOptions = getDisabledStatusOptionIds(propertyId, noteId || "", options || []);

  // Filter options based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredOptions(options);
      setHighlightedIndex(-1);
      return;
    }

    const filtered = options.filter(option =>
      option.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredOptions(filtered);
    setHighlightedIndex(-1);
  }, [searchTerm, options]);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (highlightedIndex >= 0 && optionListRef.current) {
      const listElement = optionListRef.current;
      const itemElement = listElement.children[highlightedIndex] as HTMLElement;

      if (itemElement) {
        const itemTop = itemElement.offsetTop;
        const itemBottom = itemTop + itemElement.offsetHeight;
        const containerTop = listElement.scrollTop;
        const containerBottom = containerTop + listElement.offsetHeight;

        if (itemTop < containerTop) {
          listElement.scrollTop = itemTop;
        } else if (itemBottom > containerBottom) {
          listElement.scrollTop = itemBottom - listElement.offsetHeight;
        }
      }
    }
  }, [highlightedIndex]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (openDropdown && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [openDropdown]);

  // Handle outside clicks
  useEffect(() => {
    if (!openDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !containerRef.current?.contains(event.target as Node)
      ) {
        setOpenDropdown(false);
        setSearchTerm("");
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const handleOptionSelect = (optionValue: string) => {
    if (disabledOptions.includes(String(optionValue))) return;
    onChange(optionValue);
    setOpenDropdown(false);
    setSearchTerm("");
    setHighlightedIndex(-1);
  };

  const handleEditOptionsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdown(false);
    setShowEditModal(true);
    if (onEditOptions) {
      onEditOptions(propertyId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredOptions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const selectedOption = filteredOptions[highlightedIndex];
          if (selectedOption && !disabledOptions.includes(String(selectedOption.id))) {
            handleOptionSelect(String(selectedOption.id));
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (searchTerm) {
          setSearchTerm("");
          setHighlightedIndex(-1);
        } else {
          setOpenDropdown(false);
        }
        break;
    }
  };

  if (!options || options.length === 0) {
    return <span className="text-sm text-gray-400">Empty</span>;
  }

  return (
    <div
      ref={containerRef}
      className="relative px-2 py-1.5 flex flex-wrap gap-1.5 items-center w-[250px] hover:bg-gray-200 dark:hover:bg-[#2c2c2c] rounded-sm cursor-pointer group"
      onClick={() => setOpenDropdown(!openDropdown)}
    >
      <div
        className={`rounded-md text-sm transition-colors ${value
          ? " px-2 py-0.5"
          : " text-gray-400 dark:text-gray-500"
          }`}
        style={value ? { backgroundColor: colorStyles.bg, color: colorStyles.text } : {}}
      >
        {selectedOption?.name || "Select status"}
      </div>

      {/* Edit button */}
      <button
        className="absolute right-1.5 px-1 py-1 items-center text-xs rounded-sm bg-white dark:bg-[#202020] dark:text-gray-400 dark:hover:bg-[#3c3c3c] invisible group-hover:visible"
        onClick={handleEditOptionsClick}
      >
        <EditIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>

      {/* Dropdown */}
      {openDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-0 left-0 bg-white dark:bg-[#242424] rounded-lg shadow-xl border border-gray-200 dark:border-[#343434] w-[250px] max-h-[300px] overflow-hidden z-50"
        >
          <div className="flex flex-col h-full">
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-[#343434]">
              <div className="">
                <div className="bg-gray-100 dark:bg-[#2c2c2c] px-2 py-1 min-h-[28px] cursor-text">
                  <div className="flex flex-wrap items-center gap-2">
                    {value && (
                      <div
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-sm"
                        style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                      >
                        <span>{selectedOption?.name}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-[120px]">
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search options..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setHighlightedIndex(-1);
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full h-5 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Options List */}
            <div
              ref={optionListRef}
              className="flex-grow min-h-0 overflow-auto"
            >
              <div className="p-1">
                <div className="space-y-0.5">
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option, index) => {
                      const isSelected = value === option.id;
                      const isHighlighted = index === highlightedIndex;
                      const optColorStyles = getColorStyles(option.color || "default");

                      return (
                        <div
                          key={option.id || option.name}
                          onClick={() => handleOptionSelect(String(option.id))}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`w-full px-2 py-1.5 flex items-center justify-between text-left transition-colors cursor-pointer rounded-md ${isHighlighted
                            ? "bg-gray-100 dark:bg-[#2c2c2c]"
                            : "hover:bg-gray-100 dark:hover:bg-[#2c2c2c]"
                            } ${disabledOptions.includes(String(option.id)) ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <span
                            className="text-sm px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: optColorStyles.bg, color: optColorStyles.text }}
                          >
                            {option.name}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex justify-center items-center text-gray-500 p-4 text-sm">
                      {searchTerm ? `No options found for "${searchTerm}"` : "No options"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
