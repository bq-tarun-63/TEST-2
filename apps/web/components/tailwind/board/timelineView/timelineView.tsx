"use client";

import React, { useRef, useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { ViewCollection } from "@/types/board";
import { Block } from "@/types/block";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import TimelineHeader from "./timelineHeader";
import TimelineGrid from "./timelineGrid";
import RightSidebar from "../rightSidebar";
import CenterPeek from "../centerPeek";
import { JSONContent } from "novel";
import useAddRootPage from "@/hooks/use-addRootPage";
import { toast } from "sonner";
import useNoteActions from "@/hooks/use-updateNode";
import useBoardFunctions from "@/hooks/use-board";
import { ObjectId } from "bson";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { getInitialPropertiesFromFilters } from "@/utils/filterUtils";

interface TimelineViewProps {
  board: Block;
  notes: Block[];
}

export default function TimelineView({ board, notes }: TimelineViewProps) {
  const [selectedTask, setSelectedTask] = useState<Block | null>(null);
  const { getCurrentDataSourceProperties, currentView, currentDataSource, updateDataSource, getLayoutSettings, getFilters, getAdvancedFilters, getNotesByDataSourceId, getDataSource } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();

  // Get current dataSourceId from current view ID (not type)
  // IMPORTANT: Always match by view ID first, only use type as fallback
  const getCurrentDataSourceId = (): string | null => {
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    if (currentViewData?.id) {
      // Prioritize ID match - if currentViewData.id exists, ONLY match by ID
      view = latestBoard.value.viewsTypes?.find((vt) => vt._id === currentViewData.id);
    } else if (currentViewData?.type) {
      // Only fallback to type if no ID is available
      view = latestBoard.value.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }

    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };
  const { UpdateNote } = useNoteActions();
  const { addRootPage } = useAddRootPage();
  const { DeleteNote } = useNoteActions();
  const { user } = useAuth();
  const { currentWorkspace, workspaceMembers } = useWorkspaceContext();

  // Get properties from current data source
  const boardProperties = getCurrentDataSourceProperties(board._id) || board.value.properties || {};

  const LEFT_LABEL_WIDTH = 40; // px — exact pixel value used for both header label & scroller spacer
  const dayWidth = 48; // px
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [rightSidebarContent, setRightSidebarContent] = useState<JSONContent | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const previousCardIdRef = useRef<string | null>(null);


  const {
    handleCardClick,
    handleCloseSidebar,
  } = useBoardFunctions({
    board,
    setSelectedTask,
    setRightSidebarContent,
    setIsClosing,
    previousCardIdRef,
  });

  const datePropertyName = Object.entries(boardProperties).find(
    ([_, prop]) => prop.type === "date"
  )?.[0];

  function formatLocalDate(date: Date | string): string {
    let d: Date;
    if (typeof date === "string") {
      const parts = date.split("-").map(Number);
      const yyyy = parts[0] ?? 1970;
      const mm = parts[1] ?? 1;
      const dd = parts[2] ?? 1;
      console.log("Parts ---->", parts)
      d = new Date(yyyy, mm - 1, dd);
    } else {
      d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Keep a local copy of notes that belong to timeline (filter notes with date property).
  const [localNotes, setLocalNotes] = useState<Block[]>(() =>
    datePropertyName ? notes.filter((n) => !!n.value.databaseProperties?.[datePropertyName]) : []
  );

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;

    // Find the current note data from localNotes
    const foundNote = localNotes.find(note => note._id === selectedTask._id);
    if (foundNote) {
      return foundNote;
    }

    return selectedTask;
  }, [selectedTask, localNotes]);

  // Map notes by date property (local YYYY-MM-DD)
  const timelineNotes: Block[] = useMemo(() => {
    if (!datePropertyName) return [];
    return notes.filter((note) => note.value.databaseProperties?.[datePropertyName]);
  }, [notes, datePropertyName]);

  // sync when incoming notes prop changes (e.g. server updates)
  useEffect(() => {
    if (!datePropertyName) return;
    setLocalNotes(notes.filter((n) => !!n.value.databaseProperties?.[datePropertyName]));
  }, [notes, datePropertyName]);


  // Dates range
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  const daysToRender = 30;
  const dateRange = useMemo(() => {
    const arr: string[] = [];
    for (let i = -daysToRender; i <= daysToRender; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(formatLocalDate(d));
    }
    return arr;
  }, [today]);

  // sync scrollLeft
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const left = scrollRef.current.scrollLeft;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollLeft(left));
  };

  // center today initially
  useEffect(() => {
    if (!scrollRef.current) return;
    const centerIndex = dateRange.findIndex((d) => d === formatLocalDate(today));
    const index = centerIndex >= 0 ? centerIndex : Math.floor(dateRange.length / 2);
    const target = index * dayWidth - (scrollRef.current.clientWidth / 2) + dayWidth / 2;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: Math.max(0, target) });
      setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef.current, dateRange.length]);

  useEffect(() => {
    console.log("Printing local Notes ", localNotes);
  }, [localNotes])

  const currentIndex = Math.max(0, Math.min(dateRange.length - 1, Math.floor(scrollLeft / dayWidth)));
  // total content width for overlays (spacer + days)
  const totalContentWidth = LEFT_LABEL_WIDTH + dateRange.length * dayWidth;


  const handleAddPage = async (dateKey: string) => {
    console.log("Date Property Name ----->", datePropertyName);
    setPendingDate(dateKey); // highlight immediately
    // dateKey is YYYY-MM-DD
    if (!datePropertyName) {
      console.warn("No date property defined on the board");
      return;
    }

    // Get dataSourceId from context (already tracked and synced)
    const dsId = currentDataSource[board._id];
    const dataSourceId: string | undefined = (dsId ? String(dsId) : board._id) as string | undefined;

    // Generate page ID upfront
    const newPageId = new ObjectId().toString();

    // Build databaseProperties object (only if both datePropertyName and dateKey exist)
    const dateProps = datePropertyName && dateKey ? { [datePropertyName]: dateKey } : {};

    // Merge in filter-derived properties (date property won't be overwritten)
    const databaseProperties = getInitialPropertiesFromFilters(
      getFilters(board._id),
      getAdvancedFilters(board._id),
      boardProperties,
      dateProps,
      workspaceMembers,
      getNotesByDataSourceId,
      getDataSource
    );

    const newBlock: Block = {
      _id: newPageId,
      blockType: "page",
      value: {
        title: "",
        pageType: "Viewdatabase_Note",
        databaseProperties: databaseProperties,
        icon: "",
        coverUrl: null,
        userId: user?.email || "",
        userEmail: user?.email || "",
      },
      parentId: dataSourceId || '',
      parentType: "collection",
      workspaceId: currentWorkspace?._id || "",
      workareaId: null,
      status: "alive",
      blockIds: [],
    };

    // Add optimistic note locally with the real ID
    setLocalNotes((prev) => [...prev, newBlock]);
    setPendingDate(null);

    try {
      // addRootPage will add the block to global context optimistically
      await addRootPage(newPageId, newBlock, dataSourceId || '', board._id);

    } catch (error) {
      console.error("Failed to create page:", error);
      // Rollback: remove optimistic note on error
      setLocalNotes((prev) => prev.filter((note) => note._id !== newPageId));
      toast.error("Failed to create Page !!");
      setPendingDate(null);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    let deletedNote: Block | undefined;

    // Optimistically remove locally
    setLocalNotes((prev) => {
      deletedNote = prev.find((n) => n._id === noteId);
      return prev.filter((n) => n._id !== noteId);
    });


    try {
      const res = await DeleteNote(noteId);

      if (res) {
        const currentDsId = getCurrentDataSourceId();
        if (currentDsId) {
          const dataSource = res[currentDsId];
          if (dataSource && dataSource.blockIds) {
            // Filter out the deleted card ID from datasource blockIds
            const updatedBlockIds = dataSource.blockIds.filter((id: string) => id !== noteId);
            updateDataSource(currentDsId, { blockIds: updatedBlockIds });
            console.log("Removed card from datasource blockIds ++ ", updatedBlockIds);
          }
        }
      }

    } catch (err) {
      console.error("Failed to delete note:", err);
      // Rollback if API fails
      toast.error("Error in deleting Note ");
      if (deletedNote) {
        setLocalNotes((prev) => [...prev, deletedNote!]);
      }
    }
  };

  // edit card 
  const handleEditCard = async (noteId: string, newTitle: string) => {

    let prevNotes: Block[] = [];

    //optimistically update the local notes for timeline View
    setLocalNotes((prev) => {
      prevNotes = prev;
      return prev.map((n) => n._id === noteId ? { ...n, value: { ...n.value, title: newTitle } } : n)
    })

    try {
      const res = await UpdateNote(noteId, newTitle, "");

      // const noteToUpdate = getBlock(noteId) || notes.find((note) => note._id === noteId);

      // // update the note in the global block context
      // if (noteToUpdate) {
      //     const updatedNote: Block = { ...noteToUpdate, value: { ...noteToUpdate.value, title: newTitle } };
      //     updateBlock(noteId, updatedNote);
      // }
    } catch (err) {
      console.error("Failed to update task:", err);
      toast.error("Error in updating the Name !")
      setLocalNotes(prevNotes);
    }
  };

  const handleUpdateNote = async (updatedNote: Block) => {

    if (updatedNote.value.title !== selectedTask?.value.title) {
      await handleEditCard(updatedNote._id, updatedNote.value.title);
    }

    setLocalNotes(prevNotes =>
      prevNotes.map(note =>
        note._id === updatedNote._id ? updatedNote : note
      )
    );

    // Update global block context to ensure sync
    updateBlock(updatedNote._id, updatedNote);

    console.log("Updated Task", updatedNote);
    setSelectedTask(updatedNote);
  }

  return (
    <div className="relative w-full">
      <TimelineHeader
        dateRange={dateRange}
        dayWidth={dayWidth}
        scrollLeft={scrollLeft}
        leftLabelWidth={LEFT_LABEL_WIDTH}
        hoveredDate={hoveredDate}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseLeave={() => setHoveredDate(null)}
        className="w-full overflow-x-auto no-scrollbar min-h-32 relative"
        style={{ whiteSpace: "nowrap" }}
      >
        {/* weekend background + spacer — uses same coordinate space as the scrolled content */}
        <div
          className="absolute top-0 left-0 z-0 h-full pointer-events-none flex"
          style={{ width: totalContentWidth }}
        >
          {/* spacer in weekend-bg to align with the fixed left label */}
          <div style={{ minWidth: LEFT_LABEL_WIDTH, width: LEFT_LABEL_WIDTH }} className="flex-shrink-0" />
          {dateRange.map((date) => {
            const parts = date.split("-").map(Number);
            const yyyy = parts[0] ?? 1970;
            const mm = parts[1] ?? 1;
            const dd = parts[2] ?? 1;
            const dow = new Date(yyyy, mm - 1, dd).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isPending = pendingDate === date;
            const isHovered = hoveredDate === date;

            return (
              <div
                key={date}
                style={{ minWidth: dayWidth, width: dayWidth }}
                onMouseEnter={() => {
                  console.log("onMouseEnter  -->", date);
                  setHoveredDate(date)
                }}
                onMouseLeave={() => {
                  console.log("onMouseLeave --->")
                  setHoveredDate(null)
                }}
                onClick={() => handleAddPage(date)}
                className={`h-full flex-shrink-0 cursor-pointer 
                  ${isWeekend ? "bg-gray-100/50" : ""}
                  ${isHovered ? "bg-gray-200/40" : ""}
                  ${isPending ? "bg-gray-300/50 animate-pulse" : ""}`}
              />
            );
          })}
        </div>

        {/* Grid (with an internal spacer to align under the fixed left label) */}
        <TimelineGrid
          notes={localNotes}
          dateRange={dateRange}
          dayWidth={dayWidth}
          board={board}
          leftLabelWidth={LEFT_LABEL_WIDTH}
          scrollerRef={scrollRef}
          onTaskClick={handleCardClick}
          onAddTask={handleAddPage}
          onHoverDate={setHoveredDate}
          onDeleteNote={handleDeleteNote}
          setLocalNotes={setLocalNotes}
        />

      </div>

      {currentSelectedTask &&
        typeof document !== "undefined" &&
        createPortal(
          getLayoutSettings(board._id)?.openPagesIn === "center_peek" ? (
            <CenterPeek
              note={currentSelectedTask}
              initialContent={rightSidebarContent}
              board={board}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={(updatedNote) => {
                setSelectedTask(updatedNote);
                handleUpdateNote(updatedNote);
              }}
            />
          ) : (
            <RightSidebar
              note={currentSelectedTask}
              initialContent={rightSidebarContent}
              board={board}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={(updatedNote) => {
                setSelectedTask(updatedNote);
                handleUpdateNote(updatedNote);
              }}
            />
          ),
          document.body
        )}
    </div>
  );
}
