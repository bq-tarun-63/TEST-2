"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { debounce } from "lodash";
import { LayoutGrid, Calendar, Clock, Plus, MoreHorizontal, Filter as FilterIcon, Eye as EyeIcon, ListFilter, SlidersHorizontal, List, ArrowUpDown, Settings2, Eye, FileText, Zap, ArrowUpRight, Share2, BarChart3, Images, ChevronDown, Lock, Search, SortAsc, Settings } from "lucide-react";
import BoardSettingsDropdown from "./boardSettingDropdown ";
import { View, ViewCollection } from "@/types/board";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { deleteWithAuth } from "@/lib/api-helpers";
import { updateCollectionViewBlock } from "@/lib/collectionViewHelpers";
import FilterPropertiesModal from "./filterPropertiesModal";
import SortModal from "./sortPropertiesModel";
import { updateSorts } from "@/services-frontend/boardServices/databaseSettingsService";
import { toast } from "sonner";
import { useEditor } from "novel";
import ViewOptionsModal from "./viewOptionsModal";
import DeleteConfirmationModal from "@/components/tailwind/ui/deleteConfirmationModal";
import CardPropertiesEditor from "./boardView/cardPropertiesEditor";
import FormPreviewModal from "@/components/tailwind/board/formView/FormPreviewModal";
import FormShareModal from "@/components/tailwind/board/formView/FormShareModal";
import { Block } from "@/types/block";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/tailwind/ui/popover";
import { DropdownMenu } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
interface BoardToolbarProps {
  readonly currentView: string;
  readonly onChangeView: (view: string) => void;
  readonly onAddView?: () => void;
  readonly children?: React.ReactNode;
  readonly boardViewsTypes: View[];
  readonly board: Block;
}

export default function BoardToolbar({
  currentView: currentViewProp,
  onChangeView,
  onAddView,
  children,
  boardViewsTypes,
  board,
}: BoardToolbarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [showFormShare, setShowFormShare] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showGroupByModal, setShowGroupByModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [showViewOptions, setShowViewOptions] = useState<string | null>(null);
  const [confirmDeleteView, setConfirmDeleteView] = useState<{ id: string; label: string } | null>(null);
  const [isDeletingView, setIsDeletingView] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const propertiesTriggerRef = useRef<HTMLButtonElement>(null);
  const shareFormTriggerRef = useRef<HTMLButtonElement>(null);
  const addViewBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isCompressed, setIsCompressed] = useState(false);

  useEffect(() => {
    if (!toolbarRef.current) return;

    // Use debounced update to avoid flickering during active drag/resize
    const debouncedUpdate = debounce((width: number) => {
      setIsCompressed((prev) => {
        // Hysteresis: Buffer zone to prevent rapid toggling
        // Enter compressed mode at 580px
        if (width < 580) return true;
        // Exit compressed mode at 630px
        if (width > 630) return false;
        // Keep current state if in the buffer zone
        return prev;
      });
    }, 150);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        debouncedUpdate(entry.contentRect.width);
      }
    });

    observer.observe(toolbarRef.current);

    return () => {
      observer.disconnect();
      debouncedUpdate.cancel();
    };
  }, []);

  const { groupBy, setGroupBy, filters, setBoardFilters, searchQuery, setSearchQuery, currentView, getCurrentDataSourceProperties, getFilters, getSortBy, setBoardSortBy, getPropertyVisibility, setAdvancedFilters, setChartSettings } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();

  // Get currentView from context (has both id and type)
  const currentViewData = currentView[board._id];

  // Get current viewTypeId
  const getCurrentViewTypeId = (): string | null => {
    if (!board || !currentViewData) return null;
    let view;
    if (currentViewData.id) {
      view = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData.type) {
      view = board.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }
    return view?._id || null;
  };

  const viewTypeId = getCurrentViewTypeId();

  // Clear search when switching to another board/page or view
  useEffect(() => {
    setSearchValue("");
    setSearchQuery(board._id, "");
    setShowSearchInput(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board._id, viewTypeId]);

  const selectedGroupByProperty = groupBy[board._id];

  // Get current filters, sorts, and property visibility for the current view
  const currentFilters = getFilters(board._id);
  const currentSorts = getSortBy(board._id);
  const currentPropertyVisibility = getPropertyVisibility(board._id) || [];
  const hasFilters = currentFilters && Object.keys(currentFilters).length > 0;
  const hasSorts = currentSorts && currentSorts.length > 0;
  const hasPropertyVisibility = currentPropertyVisibility.length > 0;
  const isFormsView = currentViewData?.type === "forms";

  const editorContext = useEditor();
  const editorInstance = editorContext?.editor;

  // Map view types directly to tabs from boardViewsTypes
  const tabsToRender = boardViewsTypes.map((viewType, index) => {

    const viewId = viewType._id || `${viewType.viewType}-${index}`;

    const displayTitle = viewType.title && viewType.title.trim().length > 0
      ? viewType.title
      : viewType.viewType.charAt(0).toUpperCase() + viewType.viewType.slice(1);

    const getDefaultIcon = () => {
      switch (viewType.viewType) {
        case "board": return <LayoutGrid className="h-4 w-4" />;
        case "list": return <List className="h-4 w-4" />;
        case "calendar": return <Calendar className="h-4 w-4" />;
        case "timeline": return <Clock className="h-4 w-4" />;
        case "forms": return <FileText className="h-4 w-4" />;
        case "chart": return <BarChart3 className="h-4 w-4" />;
        case "gallery": return <Images className="h-4 w-4" />;
        default: return <LayoutGrid className="h-4 w-4" />;
      }
    };
    const displayIcon = viewType.icon
      ? (<span className="text-base" aria-hidden>{viewType.icon}</span>)
      : getDefaultIcon();

    return {
      id: viewId,
      key: viewId || `${viewType.viewType}-${index}`,
      label: displayTitle,
      title: displayTitle,
      icon: displayIcon,
      viewType: viewType.viewType,
    };
  });

  // Helper to check if a tab is active
  const isTabActive = (tabId: string, tabViewType: string) => {
    if (!currentViewData) return false;
    const currentViewId = currentViewData.id ? String(currentViewData.id) : null;
    const normalizedTabId = tabId ? String(tabId) : null;

    if (currentViewId && normalizedTabId && currentViewId === normalizedTabId) {
      return true;
    }
    if ((!currentViewId || !normalizedTabId) && currentViewData.type && tabViewType === currentViewData.type) {
      return true;
    }
    return false;
  };

  const activeTab = tabsToRender.find(tab => isTabActive(tab.id, tab.viewType)) || tabsToRender[0];
  const otherTabs = tabsToRender.filter(tab => tab.id !== activeTab?.id);

  const dropdownItems: DropdownMenuItemProps[] = otherTabs.map(tab => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    onClick: () => handleViewButtonClick(tab.id),
  }));

  const handleFilter = () => {
    setShowFilterModal((prev) => !prev);
  };

  const handleSort = () => {
    setShowSortModal((prev) => !prev);
  };

  const handleProperties = () => {
    setShowPropertiesModal((prev) => !prev);
  };

  const handleSearchToggle = () => {
    setShowSearchInput(!showSearchInput);
  };

  useEffect(() => {
    if (showSearchInput && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [showSearchInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        if (!searchValue) {
          setShowSearchInput(false);
        }
      }
    };

    if (showSearchInput) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSearchInput, searchValue]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchValue(query);
    setSearchQuery(board._id, query);
  };

  const handleViewButtonClick = (viewId: string) => {
    // Find the view that matches this viewId
    const clickedView = boardViewsTypes.find(v => {
      return v._id === viewId || v.viewType === viewId;
    });

    if (!clickedView) {
      onChangeView(viewId);
      return;
    }

    // Get the proper ID for the clicked view
    const clickedViewId = clickedView._id || viewId;

    // Check if clicked view is the current view by comparing both id and type from context
    const isCurrentView = currentViewData && (
      // Match by id if both exist and match
      (clickedViewId && currentViewData.id && clickedViewId === currentViewData.id) ||
      // Match by type if types match and either no id or ids match
      (clickedView.viewType === currentViewData.type && (
        !clickedViewId || !currentViewData.id || clickedViewId === currentViewData.id
      ))
    );

    if (isCurrentView) {
      setShowViewOptions((prev) => (prev === clickedViewId ? null : clickedViewId));
    } else {
      onChangeView(clickedViewId);
      setShowViewOptions(null);
    }
  };

  const handlePreviewForm = () => {
    if (!isFormsView) {
      toast.info("Preview is available on form views only");
      return;
    }
    setShowFormPreview(true);
  };

  const handleShareForm = () => {
    if (!isFormsView) {
      return;
    }
    setShowFormShare((prev) => !prev);
  };

  const handleOpenFullForm = () => {
    toast.info("Open full form coming soon");
  };

  const handleFormAutomations = () => {
    toast.info("Automations coming soon");
  };

  useEffect(() => {
    console.log("showViewOptions changed:", showViewOptions);
    console.log("currentViewData:", currentViewData);
  }, [showViewOptions, currentViewData]);

  useEffect(() => {
    setShowFilterModal(false);
    setShowSortModal(false);
    // setShowPropertiesModal(false);
  }, [board]);

  // Helper: delete a view type and update board
  const deleteViewType = async (viewIdToDelete: string) => {
    console.log("..........Deleting view type:", viewIdToDelete);

    const isCurrentView = currentViewData?.id === viewIdToDelete;
    // Optimistically remove view from viewsTypes
    const updatedViewsTypes = board.value.viewsTypes?.filter(v => v._id !== viewTypeId) || [];

    const updatedValue: ViewCollection = {
      ...board.value,
      viewsTypes: updatedViewsTypes,
    };

    // Optimistically update the block immediately
    updateBlock(board._id, {
      ...board,
      value: updatedValue,
    });

    // Switch to next view if deleted view was current (optimistic)
    if (isCurrentView && updatedViewsTypes.length > 0) {
      const nextView = updatedViewsTypes[0];
      if (nextView) {
        onChangeView(nextView._id || nextView.viewType);
      }
    }

    // Run API call in background
    (async () => {
      try {
        await updateCollectionViewBlock({
          blockId: board._id,
          updatedValue,
          apiCall: async () => {
            const res = await deleteWithAuth("/api/database/deleteVeiwType", {
              method: "DELETE",
              body: JSON.stringify({ blockId: board._id, viewTypeToDelete: viewIdToDelete }),
            });
          },
          globalBlocks: { getBlock, updateBlock },
        });
      } catch (error) {
        toast.error("Failed to delete view");
      }
    })();
  };

  return (
    <>
      <div ref={toolbarRef} className="flex items-center justify-between mb-2">
        {/* Views Tabs */}
        <div className="flex items-center gap-1">
          <div className="flex gap-2 px-1">
            {!isCompressed ? (
              tabsToRender.map((tab) => (
                <div key={tab.key} className="relative">
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => handleViewButtonClick(tab.id)}
                    className={`flex relative items-center gap-1.5 px-3 py-1.5 text-sm transition ${isTabActive(tab.id, tab.viewType)
                      ? "bg-accent text-accent-foreground rounded-xl"
                      : "text-muted-foreground hover:bg-accent/50 rounded-xl"
                      }`}
                  >
                    {tab.icon}
                    {tab.title || tab.label}
                  </button>

                  {/* View Options Modal - Positioned relative to button */}
                  {showViewOptions === tab.id && (
                    <div className="absolute top-full left-0 mt-2 z-100"
                      style={{ zIndex: 1000 }}
                    >
                      <ViewOptionsModal
                        isOpen={true}
                        onClose={() => setShowViewOptions(null)}
                        onEditView={() => {
                          setShowViewOptions(null);
                          setShowDropdown(true);
                        }}
                        onDelete={() => {
                          setShowViewOptions(null);
                          setConfirmDeleteView({ id: tab.id, label: tab.label });
                        }}
                        onCopyLink={() => {
                          setShowViewOptions(null);
                        }}
                        onOpenFullPage={() => {
                          setShowViewOptions(null);
                        }}
                        onShowDataSource={() => {
                          setShowViewOptions(null);
                        }}
                        viewName={board.value.title || "My Board"}
                        viewType={tab.viewType}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex items-center gap-1">
                {activeTab && (
                  <div className="relative">
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => handleViewButtonClick(activeTab.id)}
                      className="flex relative items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-xl transition"
                    >
                      {activeTab.icon}
                      {activeTab.title || activeTab.label}
                    </button>

                    {/* View Options Modal for Active Tab in Compressed Mode */}
                    {showViewOptions === activeTab.id && (
                      <div className="absolute top-full left-0 mt-2 z-100"
                        style={{ zIndex: 1000 }}
                      >
                        <ViewOptionsModal
                          isOpen={true}
                          onClose={() => setShowViewOptions(null)}
                          onEditView={() => {
                            setShowViewOptions(null);
                            setShowDropdown(true);
                          }}
                          onDelete={() => {
                            setShowViewOptions(null);
                            setConfirmDeleteView({ id: activeTab.id, label: activeTab.label });
                          }}
                          onCopyLink={() => {
                            setShowViewOptions(null);
                          }}
                          onOpenFullPage={() => {
                            setShowViewOptions(null);
                          }}
                          onShowDataSource={() => {
                            setShowViewOptions(null);
                          }}
                          viewName={board.value.title || "My Board"}
                          viewType={activeTab.viewType}
                        />
                      </div>
                    )}
                  </div>
                )}

                {otherTabs.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="p-1 px-2 rounded-xl hover:bg-accent/50 text-muted-foreground transition flex items-center gap-1">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="text-xs font-medium">{otherTabs.length}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-48 p-0 border border-border shadow-sm">
                      <DropdownMenu items={dropdownItems} />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              ref={addViewBtnRef}
              onClick={onAddView}
              className="p-1.5 rounded-md hover:bg-accent transition"
              title="Add views"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Dialog positioned below and centered */}
            {children && (
              <div className="absolute top-full mt-2 z-20">
                {React.isValidElement(children)
                  ? React.cloneElement(children as React.ReactElement<{ triggerRef?: React.RefObject<HTMLElement> }>, { triggerRef: addViewBtnRef })
                  : children}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Always show menu items, change color when applied */}
          {currentViewData?.type !== "forms" && (
            <div className="flex items-center gap-1">
              {/* Sort Button */}
              <div className="relative">
                <button
                  ref={sortTriggerRef}
                  onClick={handleSort}
                  className="p-1 rounded hover:bg-accent text-sm"
                  title="Sort cards"
                >
                  <ArrowUpDown className={`h-4 w-4 ${hasSorts ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
                </button>

                {/* Sort Modal */}
                {showSortModal && (
                  <div className="absolute top-full right-0 mt-1 z-50">
                    <SortModal
                      board={board}
                      boardProperties={getCurrentDataSourceProperties(board._id)}
                      sorts={currentSorts}
                      triggerRef={sortTriggerRef}
                      onClose={() => setShowSortModal(false)}
                      onApply={async (sorts) => {
                        if (!viewTypeId) {
                          toast.error("View type ID not found");
                          return;
                        }
                        try {
                          // updateSorts handles optimistic update and rollback internally
                          await updateSorts(
                            viewTypeId,
                            sorts,
                            board._id,
                            setBoardSortBy,
                            getSortBy,
                            getBlock,
                            updateBlock,
                          );
                        } catch (err) {
                          console.error("Failed to update sorts:", err);
                          // Rollback is handled by updateSorts
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Filter Button */}
              <div className="relative">
                <button
                  ref={filterTriggerRef}
                  onClick={handleFilter}
                  className="p-1 rounded hover:bg-accent text-sm"
                  title="Filter cards"
                >
                  <ListFilter className={`h-4 w-4 ${hasFilters ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
                </button>

                {/* Filter Modal */}
                {showFilterModal && (
                  <div className="absolute top-full right-0 mt-1 z-50">
                    <FilterPropertiesModal
                      board={board}
                      boardProperties={getCurrentDataSourceProperties(board._id)}
                      triggerRef={filterTriggerRef}
                      onClose={() => setShowFilterModal(false)}
                      onApply={(selectedFilters) => {
                        console.log("Applied Filters ----->", selectedFilters);
                        if (viewTypeId) {
                          setBoardFilters(viewTypeId, selectedFilters);
                        }
                        setShowFilterModal(false);
                      }}
                      filters={currentFilters || {}}
                    />
                  </div>
                )}
              </div>

              {/* Properties Button */}
              <div className="relative">
                <button
                  ref={propertiesTriggerRef}
                  onClick={handleProperties}
                  className="p-1 rounded hover:bg-accent text-sm"
                  title="Properties"
                >
                  <Eye className={`h-4 w-4 ${hasPropertyVisibility ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
                </button>

                {/* Properties Modal */}
                {showPropertiesModal && (
                  <div className="absolute top-full right-0 mt-1 z-50">
                    <CardPropertiesEditor
                      board={board}
                      boardProperties={getCurrentDataSourceProperties(board._id)}
                      triggerRef={propertiesTriggerRef}
                      onClose={() => setShowPropertiesModal(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Button */}
          {currentViewData?.type !== "forms" && (
            <div ref={searchContainerRef} className="relative flex items-center">
              <button
                onClick={handleSearchToggle}
                className={`p-1 rounded hover:bg-accent transition ${searchValue ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                  }`}
                title="Search"
              >
                <svg
                  aria-hidden="true"
                  role="graphics-symbol"
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M7.1 1.975a5.125 5.125 0 1 0 3.155 9.164l3.107 3.107a.625.625 0 1 0 .884-.884l-3.107-3.107A5.125 5.125 0 0 0 7.1 1.975M3.225 7.1a3.875 3.875 0 1 1 7.75 0 3.875 3.875 0 0 1-7.75 0" />
                </svg>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${showSearchInput ? "w-36 opacity-100" : "w-0 opacity-0"
                  }`}
              >
                <div className="flex items-center">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchValue}
                    onChange={handleSearchChange}
                    placeholder="Type to search..."
                    className="w-full px-2 py-1 text-sm border-none bg-transparent focus:outline-none text-gray-600 dark:text-gray-400 placeholder:text-muted-foreground/70"
                  />
                  {searchValue && (
                    <button
                      onClick={() => {
                        setSearchValue("");
                        setSearchQuery(board._id, "");
                      }}
                      className="flex-shrink-0 p-1 rounded-full hover:bg-accent/50 transition text-muted-foreground"
                      title="Clear"
                    >
                      <svg
                        aria-hidden="true"
                        role="graphics-symbol"
                        viewBox="0 0 16 16"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
                        <path d="M7.993 15.528a7.273 7.273 0 01-2.923-.593A7.633 7.633 0 012.653 13.3a7.797 7.797 0 01-1.633-2.417 7.273 7.273 0 01-.593-2.922c0-1.035.198-2.01.593-2.922A7.758 7.758 0 015.063.99 7.273 7.273 0 017.985.395a7.29 7.29 0 012.93.593 7.733 7.733 0 012.417 1.64 7.647 7.647 0 011.64 2.41c.396.914.594 1.888.594 2.923 0 1.035-.198 2.01-.593 2.922a7.735 7.735 0 01-4.058 4.05 7.272 7.272 0 01-2.922.594zM5.59 11.06c.2 0 .371-.066.513-.198L8 8.951l1.904 1.911a.675.675 0 00.498.198.667.667 0 00.491-.198.67.67 0 00.205-.49.64.64 0 00-.205-.491L8.981 7.969l1.92-1.911a.686.686 0 00.204-.491.646.646 0 00-.205-.484.646.646 0 00-.483-.205.67.67 0 00-.49.205L8 6.995 6.081 5.083a.696.696 0 00-.49-.19.682.682 0 00-.491.198.651.651 0 00-.198.49c0 .181.068.342.205.484l1.912 1.904-1.912 1.92a.646.646 0 00-.205.483c0 .19.066.354.198.49.136.132.3.198.49.198z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isFormsView && (
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={handleFormAutomations}
                  className="p-1 rounded hover:bg-accent text-sm"
                  title="Automations"
                >
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}

          <div className="relative">
            <button
              ref={settingsTriggerRef}
              onClick={() => setShowDropdown((prev) => !prev)}
              className="p-1 rounded-full hover:bg-accent transition"
            >
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>

            {showDropdown && board && (
              <div className="absolute top-full right-0 mt-2 z-50">
                <BoardSettingsDropdown
                  board={board}
                  boardProperties={getCurrentDataSourceProperties(board._id)}
                  triggerRef={settingsTriggerRef}
                  onClose={() => setShowDropdown(false)}
                  editor={editorInstance}
                />
              </div>
            )}
          </div>

          {isFormsView && (
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  onClick={handlePreviewForm}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
              </div>

              <div className="relative">
                <button
                  ref={shareFormTriggerRef}
                  onClick={handleShareForm}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 px-2 py-1 text-sm font-medium text-primary-foreground"
                >
                  <Share2 className="h-4 w-4" />
                  Share form
                </button>

                {showFormShare && (
                  <div className="absolute top-full right-0 mt-2 z-50">
                    <FormShareModal
                      board={board}
                      viewTypeId={viewTypeId}
                      triggerRef={shareFormTriggerRef}
                      onClose={() => setShowFormShare(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete View Modal (reusing existing component) */}
      {confirmDeleteView && (
        <DeleteConfirmationModal
          header="Delete View"
          title={confirmDeleteView.label}
          entity="view"
          isOpen={!!confirmDeleteView}
          isDeleting={false}
          onCancel={() => setConfirmDeleteView(null)}
          onConfirm={async () => {
            const viewIdToDelete = confirmDeleteView.id;
            setConfirmDeleteView(null);
            deleteViewType(viewIdToDelete);
          }}
        />
      )}

      {showFormPreview && (
        <FormPreviewModal
          board={board}
          onClose={() => setShowFormPreview(false)}
        />
      )}
    </>
  );
}
