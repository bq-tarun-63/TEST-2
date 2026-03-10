"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";

import { useNoteContext } from "@/contexts/NoteContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useWorkAreaContext } from "@/contexts/workAreaContext";
import { useMarketplace } from "@/contexts/marketplaceContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";

import { useAuth } from "@/hooks/use-auth";
import useRenderPublishNode from "@/hooks/renderpublishPage";
import { Block } from "@/types/block";
import { SidebarNode } from "./SidebarNode";

import NoteModal from "@/components/tailwind/ui/updateModal";
import DeleteConfirmationModal from "@/components/tailwind/ui/deleteConfirmationModal";
import MoveToPublicModal from "@/components/tailwind/ui/moveToPublicModal";
import { AddIcon } from "@/components/tailwind/ui/icons/AddIcon";

import { ScrollableContainerProps, SidebarProps } from "@/types/sidebar";
import { type Node as CustomNode } from "@/types/note";

import { isOwner } from "@/services-frontend/user/userServices";
import { postWithAuth, putWithAuth } from "@/lib/api-helpers";
import { defaultEditorContent } from "@/lib/content";
import clsx from "clsx";
import { Skeleton } from "@/components/tailwind/ui/skeleton";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Plus,
  Trash,
  ChevronsLeftRight,
  Home as HomeIcon,
  FileText,
  Store,
} from "lucide-react";
import { DropdownMenu, DropdownMenuIcons, DropdownMenuHeader, DropdownMenuDivider } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import InviteButton from "./button/inviteButton";
import { toast } from "sonner";
import SettingsButton from "../settings/settings";
import WorkAreasSidebar from "../sidebar/WorkAreasSidebar";
import TemplatesSidebar from "../sidebar/TemplatesSidebar";
import { createTemplateBlocks, instantiateTemplateBlocks } from "@/services-frontend/template/templateServices";
import { ObjectId } from "bson";


// // Dropdown Tooltip component (positions below the button)
// const DropdownTooltip = ({
//   children,
//   content,
//   disabled = false,
// }: { children: React.ReactNode; content: string; disabled?: boolean }) => {

//   const [isVisible, setIsVisible] = useState<boolean>(false);
//   const [position, setPosition] = useState({ top: 0, left: 0 });
//   const triggerRef = useRef<HTMLDivElement>(null);

//   if (disabled) return <>{children}</>;

//   const handleMouseEnter = () => {
//     if (triggerRef.current) {
//       const rect = triggerRef.current.getBoundingClientRect();
//       setPosition({
//         top: rect.bottom + 4,
//         left: rect.left + rect.width / 2,
//       });
//     }
//     setIsVisible(true);
//   };

//   const handleMouseLeave = () => {
//     setIsVisible(false);
//   };

//   return (
//     <div className="relative block w-full">
//       <div ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
//         {children}
//       </div>
//       {isVisible &&
//         typeof window !== "undefined" &&
//         createPortal(
//           <div
//             className="fixed px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap z-[9999] pointer-events-none"
//             style={{
//               top: position.top,
//               left: position.left,
//               transform: "translateX(-50%)",
//             }}
//           >
//             {content}
//             <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
//           </div>,
//           document.body,
//         )}
//     </div>
//   );
// };



const ScrollableContainer = React.forwardRef<HTMLDivElement, ScrollableContainerProps>(
  ({ children, preserveScroll = true, className }, ref) => {
    return (
      <div
        ref={ref}
        className={`overflow-y-auto ${className || ""}`}
        style={{
          maxHeight: "300px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          scrollBehavior: preserveScroll ? "smooth" : "auto",
        }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {children}
      </div>
    );
  },
);
ScrollableContainer.displayName = "ScrollableContainer";

type TemplateTarget = "private" | "public" | "restricted";



export function Sidebar({
  onAddEditor,
  onSelectEditor,
  selectedEditor,
  // cachedChildNodes, // Removed
  // setCachedChildNodes, // Removed
  // fetchAndCacheChildren, // Removed
  // fetchAndCacheChildrenForNode, // Removed
  isOpen,
  onClose,
  onOpen,
  onShare,
  isLoadingSidebarData = false,
}: SidebarProps) {

  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { notes, updateNote, deleteNote, moveNote, setNotes } = useNoteContext();
  const { workspaceMembers, currentWorkspace, setCurrentWorkspace } = useWorkspaceContext();
  const { workAreas } = useWorkAreaContext();
  const { fetchProfile } = useMarketplace();

  // New Context Hooks - READ DIRECTLY FROM BLOCKS, NO CONVERSION!
  const { blocks, getBlock, addBlock } = useGlobalBlocks();
  const {
    privatePagesOrder,
    publicPagesOrder,
    sharedPagesOrder,
    sidebarOrder,
    workAreaPagesOrder,
    templatePagesOrder,
    reorderPrivate,
    reorderPublic,
    reorderShared,
    addPrivatePage,
    addPublicPage,
  } = useRootPagesOrder();

  const [newEditorTitle, setNewEditorTitle] = useState<string>("");
  const [selectedEmoji, setSelectedEmoji] = useState<string>("");
  const [confirmDeleteTitle, setConfirmDeleteTitle] = useState<string>("");
  const [parentIdForNewPage, setParentIdForNewPage] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [movePageId, setMovePageId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dropdownOpen, setdropdownOpen] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [publishedPageisOpen, setPublishedPageisOpen] = useState<boolean>(false);
  const [reviewPageisOpen, setReviewPageisOpen] = useState<boolean>(false);
  const [sharedPageisOpen, setSharedPageisOpen] = useState<boolean>(false);
  const [isPublicPage, setIsPublicPage] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isRestrictedPage, setIsRestrictedPage] = useState<boolean>(false);
  const [movePageLoading, setMovePageLoading] = useState<boolean>(false);
  const [templateMenuOpenId, setTemplateMenuOpenId] = useState<string | null>(null);
  const [templateActionLoading, setTemplateActionLoading] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState<boolean>(false);
  const [templateAddSubmenuOpen, setTemplateAddSubmenuOpen] = useState<boolean>(false);
  const [workspaceDropDownOpen, setworkspaceDropDownOpen] = useState<boolean>(false);

  const [editData, setEditData] = useState<Record<string, unknown> | null>(null);
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [sidebarScrollPosition, setSidebarScrollPosition] = useState(0);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);


  const [pages, setPages] = useState([]);
  const expandTimeoutRef = useRef<number | null>(null);
  // Track if we've already expanded the path for this selected editor
  const expandedPathsRef = useRef<Set<string>>(new Set());

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        workspaceDropdownRef.current &&
        !workspaceDropdownRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.workspace-trigger')
      ) {
        setworkspaceDropDownOpen(false);
      }
    };

    if (workspaceDropDownOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [workspaceDropDownOpen]);


  // Restore scroll position after operations
  const preserveScrollPosition = useCallback((callback: () => void) => {
    const currentScroll = sidebarRef.current?.scrollTop || 0;
    callback();
    // Use requestAnimationFrame for smoother scroll restoration
    requestAnimationFrame(() => {
      if (sidebarRef.current && sidebarRef.current.scrollTop !== currentScroll) {
        sidebarRef.current.scrollTop = currentScroll;
      }
    });
  }, []);

  useEffect(() => {
    const adminEmailsEnv = process.env.ADMINS || "";
    const adminEmails = adminEmailsEnv.split(",").map((email) => email.trim().toLowerCase());

    try {
      const userString = window.localStorage.getItem("auth_user");
      const user = userString ? JSON.parse(userString) : null;
      const email = user?.email;
      if (email) {
        // Store the current user's email in localStorage
        localStorage.setItem("currentUserEmail", email);
        if (email && adminEmails.includes(email)) {
          setIsAdmin(true);
        }
      }
    } catch (error) {
      console.error("Failed to parse user-auth from localStorage", error);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setdropdownOpen(false);
        setEditData(null);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Lock sidebar scroll when dropdown is open
      if (sidebarRef.current) {
        sidebarRef.current.style.overflow = "hidden";
      }
    } else {
      // Restore sidebar scroll when dropdown closes
      if (sidebarRef.current) {
        sidebarRef.current.style.overflow = "auto";
      }
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      // Ensure scroll is restored on unmount
      if (sidebarRef.current) {
        sidebarRef.current.style.overflow = "auto";
      }
    };
  }, [dropdownOpen]);

  // Close submenu when dropdown closes
  useEffect(() => {
    if (!dropdownOpen) {
      setTemplateAddSubmenuOpen(false);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (!templateMenuOpenId) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-template-menu]")) {
        setTemplateMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [templateMenuOpenId]);

  // function to handle dropdown toggle
  const handleDropdownToggle = useCallback(
    (e: React.MouseEvent, nodeId: Block | null) => {
      e.stopPropagation();
      if (sidebarRef.current) {
        setSidebarScrollPosition(sidebarRef.current.scrollTop);
      }
      setdropdownOpen(true);
      if (nodeId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropdownHeight = 200;
        const windowHeight = window.innerHeight;
        const positionBelow = rect.bottom + dropdownHeight <= windowHeight;

        setDropdownPosition({
          top: positionBelow ? rect.bottom : rect.top - dropdownHeight,
          left: rect.left,
        });
        setEditData(nodeId as unknown as Record<string, unknown>);
      }
    },
    [editData],
  );

  // function to handle Dropdown Action
  const handleDropdownAction = useCallback(
    (action: string, Data: Record<string, unknown> | null) => {
      preserveScrollPosition(() => {
        setdropdownOpen(false);
        setTemplateAddSubmenuOpen(false); // Close submenu when dropdown closes

        if (!Data) return;

        // Normalize Data (Block vs Node/CachedNode)
        const rawData = Data as any;
        const dataValue = rawData.value || rawData;

        const id = rawData._id || rawData.id;
        const title = dataValue.title || "New page";
        const parentId = rawData.parentId || dataValue.parentId; // Block might have parentId on top level
        const icon = dataValue.icon || "";
        const isPublicNote = dataValue.pageType === "public" || dataValue.isPublicNote === true;

        if (action === "rename") {
          setEditData(Data);
          setParentIdForNewPage(parentId);
          setUpdateId(id);
          setNewEditorTitle(title);
          setSelectedEmoji(icon);
          setShowModal(true);
        }
        if (action === "share") {
          onShare(id);
          setEditData(null);
        }
        if (action === "duplicate") {
          setEditData(null);
        }
        if (action === "deletion") {
          setConfirmDeleteId(id);
          setConfirmDeleteTitle(title);
        }
        if (action === "movePage") {
          setMovePageId(id);
          setNewEditorTitle(title);
          setIsPublicPage(isPublicNote);
        }
      });
    },
    [onShare],
  );

  const handleTemplateMenuToggle = useCallback((templateId: string) => {
    setTemplateMenuOpenId((prev) => (prev === templateId ? null : templateId));
  }, []);

  const handleTemplateInstantiate = useCallback(
    async (template: Block, target: TemplateTarget) => {
      console.log("Template **********-->", template, target);
      const identifier = `${template._id}-${target}`;
      setTemplateActionLoading(identifier);
      try {
        if (!currentWorkspace?._id) {
          toast.error("Workspace not found");
          return;
        }

        const response = await instantiateTemplateBlocks({
          templateBlockId: template._id,
          targetParentId: currentWorkspace._id,
          workspaceId: currentWorkspace._id,
          targetType: target,
        });

        if (response && response.newBlock) {
          const newBlock = response.newBlock as Block;
          const newNoteId = response.newBlockId;

          // Optimistic UI update - add the new block
          addBlock(newBlock);

          // Update page order context based on target
          if (target === "private") {
            addPrivatePage(newNoteId);
          } else if (target === "public") {
            addPublicPage(newNoteId);
          } else if (target === "restricted") {
            // Check if there's an addRestrictedPage, if not use private or check implementation
            // The context has movePageToRestricted? No, let's check useRootPagesOrder again.
            // It has addPrivatePage, addPublicPage, addWorkAreaPage, addSharedPage.
            // RESTRICTED page usually goes into private but with different metadata.
            addPublicPage(newNoteId);
          }

          toast.success(`Template added to ${target} pages`);
          router.push(`/notes/${newNoteId}`);
        } else {
          toast.error("Failed to create page from template");
        }
      } catch (error) {
        console.error("Failed to instantiate template:", error);
        toast.error("Failed to create page from template");
      } finally {
        setTemplateActionLoading(null);
        setTemplateMenuOpenId(null);
      }
    },
    [router, currentWorkspace, addBlock, addPrivatePage, addPublicPage],
  );

  const handleCreateTemplate = useCallback(async () => {
    if (isCreatingTemplate) return;
    setTemplateMenuOpenId(null);
    setIsCreatingTemplate(true);
    try {
      if (!currentWorkspace?._id) {
        toast.error("Workspace not found");
        return;
      }

      const { templateId, templateBlock } = await createTemplateBlocks({
        workspaceId: currentWorkspace._id,
        userEmail: user?.email || "",
      });

      console.log("Printing the template ++ ", templateBlock);

      // Optimistic UI update
      addBlock(templateBlock as Block);

      // let offlineTemplateContent = defaultEditorContent;
      // if (created.content) {
      //   try {
      //     const rawTemplateContent =
      //       typeof created.content === "string" ? JSON.parse(created.content) : created.content;
      //     offlineTemplateContent = rawTemplateContent?.online_content ?? rawTemplateContent ?? defaultEditorContent;
      //   } catch (error) {
      //     console.error("Failed to parse template content:", error);
      //     offlineTemplateContent = defaultEditorContent;
      //   }
      // }

      // const templateContentSerialized = JSON.stringify(offlineTemplateContent);
      // const nowIso = new Date().toISOString();

      // window.localStorage.setItem(`novel-content-${templateId}`, templateContentSerialized);
      // window.localStorage.setItem(`offline_content_time-${templateId}`, JSON.stringify(nowIso));
      // window.localStorage.setItem(`last_content_update_time-${templateId}`, JSON.stringify(nowIso));
      // window.localStorage.setItem(`content-loaded-${templateId}`, "true");
      // window.localStorage.removeItem(`pending-title-${templateId}`);

      // const normalizedTemplate: CustomNode = {
      //   id: templateId,
      //   title: (templateBlock.value as any).title || "Untitled template",
      //   parentId: templateBlock.parentId ?? null,
      //   gitPath: "",
      //   contentPath: "",
      //   commitSha: "",
      //   createdAt: nowIso,
      //   updatedAt: nowIso,
      //   content: undefined,
      //   icon: (templateBlock.value as any).icon || "",
      //   children: [],
      //   userId: user?.email || "",
      //   userEmail: user?.email || "",
      //   isPublicNote: false,
      //   isPublish: false,
      //   approvalStatus: "Publish",
      //   isRestrictedPage: false,
      //   noteType: "original",
      //   isTemplate: true,
      //   workAreaId: "",
      // };

      // setNotes((prev) => {
      //   const filtered = prev.filter((node) => node.id !== normalizedTemplate.id);
      //   return [...filtered, normalizedTemplate];
      // });

      // const storedRootNodes = window.localStorage.getItem("rootNodes");
      // if (storedRootNodes) {
      //   try {
      //     const parsed = JSON.parse(storedRootNodes) as CustomNode[];
      //     const filtered = parsed.filter((node) => node.id !== normalizedTemplate.id);
      //     window.localStorage.setItem("rootNodes", JSON.stringify([...filtered, normalizedTemplate]));
      //   } catch (error) {
      //     console.error("Failed to update rootNodes cache after creating template:", error);
      //   }
      // } else {
      //   window.localStorage.setItem("rootNodes", JSON.stringify([normalizedTemplate]));
      // }

      toast.success("Template created");
      router.push(`/notes/${templateId}`);
    } catch (error) {
      console.error("Failed to create template:", error);
      toast.error("Failed to create template");
    } finally {
      setIsCreatingTemplate(false);
    }
  }, [isCreatingTemplate, router, currentWorkspace]);

  const handleupdate = () => {
    if (newEditorTitle.trim() && updateId) {
      preserveScrollPosition(() => {
        setIsLoading(true);
        try {
          updateNote(updateId, newEditorTitle.trim(), parentIdForNewPage, selectedEmoji);
        } finally {
          setTimeout(() => {
            setIsLoading(false);
            setNewEditorTitle("");
            setSelectedEmoji("");
            setShowModal(false);
            setParentIdForNewPage(null);
            setEditData(null);
          }, 800);
        }
      });
    }
  };


  // useEffect(() => {

  //   setChildrenNotes(cachedChildNodes);

  // }, [cachedChildNodes])

  // Function to find the path from a node to root
  const findPathToRoot = useCallback(
    async (nodeId: string, path: Set<string> = new Set()): Promise<Set<string>> => {
      path.add(nodeId);

      // Check blocks context to find parent
      const parentBlock = Array.from(blocks.values()).find((block) => {
        // Check blockIds from block architecture
        if (block.blockIds && block.blockIds.includes(nodeId)) {
          return true;
        }
        // Fallback or Legacy children check (optional, can remove if fully migrated)
        const val = block.value as any;
        if (val.children && Array.isArray(val.children)) {
          return val.children.some((child: any) => child._id === nodeId);
        }
        return false;
      });

      if (parentBlock) {
        return findPathToRoot(parentBlock._id, path);
      }
      // If we can't find parent in context, we might need to fetch the node to see its parentId?
      // But we are looking for the *parent*.
      // If the parent isn't loaded, we can't know it has this child easily unless we query API.
      // For now, assuming standard flow where we navigate down or have context.
      // If deep linking, `use-fetchRootData` or `use-fetchChild` might populate context.

      return path;
    },
    [blocks],
  );

  const handleAdd = (
    parentIdForNewPage: string | null,
    newEditorTitle: string,
    isRestrictedPage: boolean,
    isPublicPage: boolean,
    editData: Record<string, unknown> | null,
    workAreaId: string | null = null,
  ) => {
    setShowModal(false);
    const title = newEditorTitle.trim() || "";
    // Allow empty titles for pages to support placeholders
    if (true) {
      preserveScrollPosition(() => {
        setIsLoading(true);
        try {
          onAddEditor(title.trim(), parentIdForNewPage, isRestrictedPage, selectedEmoji, isPublicPage, workAreaId);
        } finally {
          // Allow a slight delay for a better UX
          setTimeout(() => {
            setIsLoading(false);
            setNewEditorTitle("");
            setSelectedEmoji("");
            setIsPublicPage(false);
            setIsRestrictedPage(false);
          }, 800);
        }
      });
    }
  };

  const handleModalSubmit = () => {
    handleAdd(parentIdForNewPage, newEditorTitle, isRestrictedPage, isPublicPage, editData);
  };

  const toggleNode = useCallback(
    (id: string) => {
      preserveScrollPosition(() => {
        setOpenNodeIds((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
            // // If opening and not in cache, fetch children
            // // For work areas, children are already in the node, so we cache them directly
            // if (id.startsWith("workarea-")) {
            //   // Find the work area node from blocks and cache its children
            //   const workAreaBlock = getBlock(id);
            //   if (workAreaBlock && workAreaBlock.value) {
            //     const children = (workAreaBlock.value as any).children || [];
            //     if (children.length > 0 && !cachedChildNodes[id]) {
            //       const childrenAsCached = children.map((child: any) => ({
            //         id: child._id,
            //         title: child.title,
            //         parentId: id,
            //         icon: child.icon || "",
            //         children: [],
            //         hasChildren: false,
            //         userId: child.userId,
            //         userEmail: child.userEmail,
            //       }));
            //       setCachedChildNodes((prev) => ({
            //         ...prev,
            //         [id]: childrenAsCached,
            //       }));
            //     }
            //   }
            // } else if (!cachedChildNodes[id]) {
            //   fetchAndCacheChildren(id);
            // }
          }
          return newSet;
        });
      });
    },
    [preserveScrollPosition],
  );

  // Wrap onSelectEditor to handle work area IDs
  // Work areas should toggle expand/collapse instead of navigating
  const handleSelectEditor = useCallback((id: string) => {
    if (id.startsWith("workarea-")) {
      toggleNode(id);
    } else {
      onSelectEditor(id);
    }
  }, [onSelectEditor, toggleNode]);

  const selectedworkspace = currentWorkspace?.name;

  // Get all pages as Block[]
  const allPagesAsBlocks = useMemo(() => {
    return Array.from(blocks.values());
  }, [blocks]);

  // Define filtered pages using BlockContext and RootPagesOrderContext - ALL AS BLOCK[]
  // Templates: Filter blocks where value.isTemplate is true
  const templatePages = Array.from(blocks.values())
    .filter(block => block.value && (block.value as any).isTemplate === true);

  const privatePages = privatePagesOrder
    .map(id => getBlock(id))
    .filter((b): b is Block => b !== undefined);

  // Use sharedPagesOrder from context
  const sharedPages = sharedPagesOrder
    .map(id => getBlock(id))
    .filter((b): b is Block => b !== undefined);

  // In Review Pages: Filter blocks where value.isPublish=true, approvalStatus=pending, NOT templates
  const inReviewPages = Array.from(blocks.values())
    .filter(block => {
      const value = block.value as any;
      return !value.isTemplate && value.isPublish === true && value.approvalStatus === "pending";
    });

  // Published Pages: Filter blocks where value.isPublish=true, approvalStatus=accepted, NOT templates
  const publishedPages = Array.from(blocks.values())
    .filter(block => {
      const value = block.value as any;
      return !value.isTemplate && value.isPublish === true && value.approvalStatus === "accepted";
    });

  const publicPages = publicPagesOrder
    .map(id => getBlock(id))
    .filter((b): b is Block => b !== undefined);

  // Initial fetching of top-level nodes' children
  // useEffect(() => {
  //   // Use blocks from GlobalBlockContext
  //   const sourceNodes = Array.from(blocks.values());

  //   sourceNodes.forEach((block) => {
  //     const value = block.value as any;
  //     if (value.children && value.children.length > 0 && !cachedChildNodes[block._id]) {
  //       // Pre-cache children for root nodes
  //       const children = value.children.map((child: any) => ({
  //         id: child._id,
  //         title: child.title,
  //         parentId: block._id,
  //         icon: child.icon || "",
  //         children: [],
  //         userId: child.userId,
  //         userEmail: child.userEmail,
  //       }));

  //       setCachedChildNodes((prev) => ({
  //         ...prev,
  //         [block._id]: children,
  //       }));
  //     }
  //   });
  // }, [blocks, cachedChildNodes, setCachedChildNodes]);


  const toggleDropdownForSharedPage = async () => {
    const nextOpen = !sharedPageisOpen;
    preserveScrollPosition(() => {
      setSharedPageisOpen(nextOpen);
      // Reload data **only when opening**
      if (nextOpen) {
        const data: any = sharedPages;
        setPages(data);
      }
    });
  };

  const toggleDropdownForReviewPage = async () => {
    const nextOpen = !reviewPageisOpen;
    setReviewPageisOpen(nextOpen);
    // Reload data **only when opening**
    if (nextOpen) {
      const data: any = inReviewPages;
      setPages(data);
    }
  };

  const toggleDropdownForPublishedPage = async () => {
    const nextOpen = !publishedPageisOpen;
    setPublishedPageisOpen(nextOpen);
    // Reload data **only when opening**
    if (nextOpen) {
      const data: any = publishedPages;
      setPages(data);
    }
  };

  const handleReorderRoot = async (ids: string[], section: "private" | "public" | "shared" = "private") => {
    // try {
    //   if (!currentWorkspace?._id) {
    //     console.error("Workspace not found");
    //     toast.error("Workspace not found");
    //     return;
    //   }

    //   const workspaceId = currentWorkspace._id;

    //   // Store original order for rollback
    //   let originalOrder: string[] = [];
    //   if (section === "private") {
    //     originalOrder = [...privatePagesOrder];
    //   } else if (section === "public") {
    //     originalOrder = [...publicPagesOrder];
    //   } else if (section === "shared") {
    //     originalOrder = [...sharedPagesOrder];
    //   }

    //   // Optimistically update the context
    //   if (section === "private") {
    //     reorderPrivate(ids);
    //   } else if (section === "public") {
    //     reorderPublic(ids);
    //   } else if (section === "shared") {
    //     reorderShared(ids);
    //   }

    //   // Call the API to persist the change
    //   const response = await postWithAuth("/api/note/block/drag-and-drop", {
    //     dragAndDropinputfieldArray: [
    //       {
    //         parentId: workspaceId,
    //         workspaceId: workspaceId,
    //         blockIdArray: ids,
    //         typeofChild: section === "private" ? "private" : section === "public" ? "public" : "workarea",
    //       }
    //     ]
    //   });

    //   if ("error" in response) {
    //     console.error("Error reordering pages:", response.error);
    //     toast.error("Failed to reorder pages");

    //     // Rollback on error
    //     if (section === "private") {
    //       reorderPrivate(originalOrder);
    //     } else if (section === "public") {
    //       reorderPublic(originalOrder);
    //     } else if (section === "shared") {
    //       reorderShared(originalOrder);
    //     }
    //     return;
    //   }

    //   console.log(`Successfully reordered ${section} pages`);
    // } catch (err) {
    //   console.error("reorder failed", err);
    //   toast.error("Failed to reorder pages");
    // }
  };

  const NodeRenderer = ({
    nodes,
    onReorder,
    isPublic,
  }: {
    nodes: Block[];
    onReorder: (ids: string[]) => void;
    isPublic?: boolean;
  }) => {
    const [ordered, setOrdered] = useState<Block[]>(nodes);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

    useEffect(() => {
      setOrdered(nodes);
    }, [nodes]);

    const handleDragStart = (e: React.DragEvent, index: number) => {
      const node = ordered[index];

      // Only owner can drag their notes
      const userOwnsNote = node && isOwner(node.value?.userEmail, true, user);
      if (!userOwnsNote) {
        e.preventDefault();
        toast.error("Only the owner can move this page");
        return;
      }

      dragItem.current = index;
      setDraggingIdx(index);
      if (node) {
        e.dataTransfer.setData("text/plain", node._id);
      }

      (e.currentTarget as HTMLElement).style.opacity = "0.5";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      dragOverItem.current = index;
    };

    const handleDragEnd = (e: React.DragEvent) => {
      (e.currentTarget as HTMLElement).style.opacity = "1";

      if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
        const newOrder = [...ordered];
        const [moved] = newOrder.splice(dragItem.current, 1);
        if (moved) {
          newOrder.splice(dragOverItem.current, 0, moved);

          setOrdered(newOrder);

          onReorder(newOrder.map((n) => n._id));
        }
      }

      dragItem.current = null;
      dragOverItem.current = null;
      setDraggingIdx(null);
    };


    return (
      <>
        {ordered.map((node, index) => {
          if (!node) return null;

          const userOwnsNote = node && isOwner(node.value?.userEmail, true, user);

          return (
            <div
              key={node._id}
              draggable={userOwnsNote}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => { }}
              className={clsx(draggingIdx === index && "opacity-50")}
            >
              <SidebarNode
                nodeId={node._id}
                depth={0} // Root level in this renderer
                onSelectEditor={handleSelectEditor}
                onAddEditor={(parentId) => {
                  setParentIdForNewPage(parentId);
                  isPublic ? setIsPublicPage(true) : setIsPublicPage(false);
                  // Check if parentId is a work area by checking against workAreas list
                  const isWorkArea = workAreas.some(
                    (wa) => String(wa._id) === parentId
                  );

                  let workAreaId: string | null = null;
                  let actualParentId: string | null = null;

                  if (isWorkArea) {
                    // Creating a root page in a work area: parentId = null, workAreaId = workAreaId
                    workAreaId = parentId;
                    actualParentId = null;
                  } else {
                    // Creating a child page
                    actualParentId = parentId; // Use the actual parent page ID
                  }

                  setShowModal(isPublic ? true : false);
                  if (isPublic) {
                    setShowModal(true);
                  } else {
                    handleAdd(actualParentId, "", false, isPublic as boolean, null, workAreaId);
                  }
                }}
                onDropdownToggle={handleDropdownToggle}
                openNodeIds={openNodeIds}
                toggleNode={toggleNode}
                selectedEditor={selectedEditor}
              />
            </div>
          );
        })}
      </>
    );
  };

  const PublishNodeRenderer = ({ nodes }: { nodes: Block[] }) => {
    const renderedNodes = useRenderPublishNode({
      editorTitles: nodes,
      openNodeIds,
      selectedEditor,
      onSelectEditor: handleSelectEditor,
      toggleNode,
    });
    return <>{renderedNodes}</>;
  };

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    if (dropdownOpen) {
      sidebar.style.overflowY = "scroll";
      sidebar.style.pointerEvents = "none";
      sidebar.scrollTop = sidebarScrollPosition;
    } else {
      sidebar.style.overflowY = "auto";
      sidebar.style.pointerEvents = "auto";
      sidebar.scrollTop = sidebarScrollPosition;
    }
  }, [dropdownOpen, sidebarScrollPosition]);

  // Expand the path to the selected node when it changes
  useEffect(() => {
    if (selectedEditor && selectedEditor !== "notes") {
      // Skip expansion if the selected note is from review/published sections
      // const isReviewNote = inReviewPages.some(note => note._id === selectedEditor);
      // const isPublishedNote = publishedPages.some(note => note._id === selectedEditor);

      // if (isReviewNote || isPublishedNote) {
      //   return; // Don't expand private hierarchy for review/published notes
      // }

      // Skip if we've already expanded this path recently
      // But only if we have a record that the content is already loaded
      // const hasLoadedContent = window.localStorage.getItem(`content-loaded-${selectedEditor}`);
      // if (expandedPathsRef.current.has(selectedEditor) && hasLoadedContent) {
      //   console.log(`Path for ${selectedEditor} already expanded, skipping redundant expansion`);
      //   return;
      // }


      const expandPath = async () => {
        // Add to expanded paths set to prevent redundant expansions
        expandedPathsRef.current.add(selectedEditor);

        // After 5 seconds, allow this path to be expanded again if needed
        expandTimeoutRef.current = window.setTimeout(() => {
          expandedPathsRef.current.delete(selectedEditor);
        }, 5000);

        // First, ensure we have the children of all root nodes
        // But only fetch if we don't already have them cached
        // const rootNodes = Array.from(blocks.values());

        // const rootNodePromises = rootNodes
        //   .filter((block) => {
        //     const val = block.value as any;
        //     return val.children && val.children.length > 0 && !cachedChildNodes[block._id];
        //   })
        //   .map((block) => fetchAndCacheChildren(block._id));

        // if (rootNodePromises.length > 0) {
        //   await Promise.all(rootNodePromises);
        // }

        // Get the path to root
        const pathToRoot = await findPathToRoot(selectedEditor);

        // Update open node IDs
        setOpenNodeIds((prev) => {
          const newSet = new Set(prev); // Preserve ALL existing nodes
          pathToRoot.forEach((id) => {
            if (id !== selectedEditor) {
              newSet.add(id); // Only ADD ancestors
            }
          });
          return newSet; // Return new Set (React will do shallow comparison)
        });



        // Ensure we fetch any missing nodes in the path
        // But only if they're not already cached
        // const missingNodes = Array.from(pathToRoot).filter((id) => id && id !== "notes" && !cachedChildNodes[id]);

        // if (missingNodes.length > 0) {
        //   await Promise.all(missingNodes.map((id) => fetchAndCacheChildren(id)));
        // }
      };

      expandPath();
    }
    return () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    }
  }, [selectedEditor, findPathToRoot]);


  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 lg:hidden"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          role="button"
          tabIndex={0}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 bottom-0 z-50 w-60 bg-[#f8f8f7] shadow-[inset_-1px_0_0_0_#eeeeec] dark:bg-[#202020] dark:sidebar-shadow transition-transform transform",
          {
            "-translate-x-full": !isOpen,
            "translate-x-0": isOpen,
          },
        )}
        style={{ width: "250px" }}
      >
        <div ref={sidebarRef} className="absolute inset-0 z-10 overflow-auto pr-2 pb-10">
          <div className="flex justify-between p-4 pr-0 pl-2">
            <div className="flex items-center gap-2 w-full justify-stretch">
              {currentWorkspace ? (
                <>
                  <div className="w-8 h-8 rounded-md bg-gray-200 dark:bg-zinc-600 flex items-center justify-center">
                    <span className="text-md font-medium">
                      {currentWorkspace?.icon || selectedworkspace?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <h1 className="text-xl font-semibold text-gray-700/70 dark:text-[#9B9B9B] truncate txt-eclips pl-1">
                    {selectedworkspace}
                  </h1>
                </>
              ) : (
                <>
                  <Skeleton className="w-8 h-8 rounded-md" />
                  <Skeleton className="h-6 w-32 rounded" />
                </>
              )}
              <button
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setworkspaceDropDownOpen(!workspaceDropDownOpen)}
              >
                <ChevronDown className="w-4 h-4 text-gray-800 dark:text-gray-200" />
              </button>
            </div>
            <button
              type="button"
              className=" p-2 mr-1 border  border-gray-200 dark:border-gray-600 rounded-lg"
              onClick={onClose}
            >
              <ChevronsLeft className="w-5 h-5 text-gray-800 dark:text-gray-200" />
            </button>
          </div>

          {/* Home Link */}
          <div className="pl-2 pb-2">
            <button
              onClick={() => {
                onSelectEditor("home");
                router.push("/notes/home");
              }}
              className={clsx(
                "w-full group flex gap-2 pl-1 pr-2 items-center justify-between p-1 rounded-lg transition-all duration-200 cursor-pointer",
                "hover:bg-gray-100 hover:dark:bg-[#2c2c2c]",
                (selectedEditor === "home" || pathname === "/notes/home") && "font-bold bg-gray-100 dark:bg-[#2c2c2c]"
              )}
            >
              <div className="flex gap-2 pl-1 items-center relative flex-1 min-w-0">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <HomeIcon className="w-4 h-4" />
                </div>
                <span
                  className={clsx(
                    "ml-2 truncate txt-eclips min-w-0 text-sm",
                    (selectedEditor === "home" || pathname === "/notes/home")
                      ? "text-[#5F5E5B] dark:text-white"
                      : "text-[#5F5E5B] dark:text-[#9B9B9B]"
                  )}
                >
                  Home
                </span>
              </div>
            </button>
          </div>

          {/* Marketplace Link */}
          <div className="pl-2 pb-2">
            <button
              onClick={async () => {
                // Fetch profile when navigating to marketplace
                await fetchProfile();
                router.push("/marketplace");
              }}
              className={clsx(
                "w-full group flex gap-2 pl-1 pr-2 items-center justify-between p-1 rounded-lg transition-all duration-200 cursor-pointer",
                "hover:bg-gray-100 hover:dark:bg-[#2c2c2c]",
                (pathname === "/profile" || pathname === "/marketplace" || pathname?.startsWith("/marketplace/")) && "font-bold bg-gray-100 dark:bg-[#2c2c2c]"
              )}
            >
              <div className="flex gap-2 pl-1 items-center relative flex-1 min-w-0">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <span
                  className={clsx(
                    "ml-2 truncate txt-eclips min-w-0 text-sm",
                    (pathname === "/profile" || pathname === "/marketplace" || pathname?.startsWith("/marketplace/"))
                      ? "text-[#5F5E5B] dark:text-white"
                      : "text-[#5F5E5B] dark:text-[#9B9B9B]"
                  )}
                >
                  Marketplace
                </span>
              </div>
            </button>
          </div>
          {/* Dynamic Sidebar Rendering */}
          {isLoadingSidebarData ? (
            // Skeleton Loading UI
            <>
              {/* Private Pages Skeleton */}
              <div className="relative text-sm leading-5 mb-8">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24 ml-4" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <div className="pl-2 space-y-2 mt-2">
                  <Skeleton className="h-8 w-full rounded" />
                  <Skeleton className="h-8 w-full rounded" />
                  <Skeleton className="h-8 w-full rounded" />
                </div>
              </div>

              {/* Public Pages Skeleton */}
              <div className="relative text-sm leading-5 mb-8">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24 ml-4" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <div className="pl-2 space-y-2 mt-2">
                  <Skeleton className="h-8 w-full rounded" />
                  <Skeleton className="h-8 w-full rounded" />
                </div>
              </div>

              {/* Shared Pages Skeleton */}
              <div className="relative text-sm leading-5 mb-8">
                <div className="flex items-center justify-between ml-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              </div>
            </>
          ) : (
            sidebarOrder.map((sectionId) => {
              if (sectionId === "workarea") {
                return (
                  <WorkAreasSidebar
                    key="workarea"
                    NodeRenderer={NodeRenderer}
                    ScrollableContainer={ScrollableContainer}
                    openNodeIds={openNodeIds}
                    toggleNode={toggleNode}
                    editorTitles={allPagesAsBlocks}
                    onReorder={handleReorderRoot}
                    onAddPage={(workAreaId) => {
                      handleAdd(null, "", false, false, null, workAreaId);
                    }}
                  />
                );
              }

              if (sectionId === "public") {
                return (
                  <div key="public" className="relative text-sm leading-5 mb-8 ">
                    <div className="flex items-center justify-between ">
                      <span className="pl-4 text-xs text-[#5F5E5B] dark:text-[#9B9B9B] f-500">Public Pages</span>
                      <button
                        type="button"
                        className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded sidebar-add-button"
                        onClick={() => {
                          setParentIdForNewPage(null);
                          setShowModal(true);
                          setIsPublicPage(true);
                          setNewEditorTitle("");
                          setEditData(null);
                        }}
                      >
                        <AddIcon className="w-6 h-6" />
                      </button>
                    </div>
                    <ScrollableContainer>
                      <ul className="pl-2 space-y-1" id="navigation-items">
                        <NodeRenderer
                          nodes={publicPages}
                          onReorder={(ids) => handleReorderRoot(ids, "public")}
                          isPublic={true}
                        />
                      </ul>
                    </ScrollableContainer>
                  </div>
                );
              }

              if (sectionId === "private") {
                return (
                  <div key="private" className="relative text-sm leading-5 mb-8 ">
                    <div className="flex items-center justify-between ">
                      <span className="pl-4 text-xs text-[#5F5E5B] dark:text-[#9B9B9B] f-500">Private Pages</span>
                      <button
                        type="button"
                        className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded sidebar-add-button"
                        onClick={() => {
                          handleAdd(null, "", false, false, null);
                        }}
                      >
                        <AddIcon className="w-6 h-6" />
                      </button>
                    </div>
                    <ScrollableContainer>
                      <ul className="pl-2 space-y-1" id="navigation-items">
                        <NodeRenderer
                          nodes={privatePages}
                          onReorder={(ids) => handleReorderRoot(ids, "private")}
                        />
                      </ul>
                    </ScrollableContainer>
                  </div>
                );
              }

              if (sectionId === "shared") {
                return (
                  <div key="shared" className="relative text-sm leading-5 mb-8">
                    <div
                      className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/30 py-2 px-2 ml-2 rounded-md"
                      onClick={toggleDropdownForSharedPage}
                    >
                      <span className="text-xs text-[#5F5E5B] dark:text-[#9B9B9B]">Shared pages</span>
                      <ChevronsRight
                        className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${sharedPageisOpen ? "rotate-90" : ""
                          }`}
                      />
                    </div>

                    {sharedPageisOpen && (
                      <>
                        <ScrollableContainer>
                          <ul className="pl-2 space-y-1" id="navigation-items">
                            <NodeRenderer
                              nodes={sharedPages}
                              onReorder={(ids) => handleReorderRoot(ids, "shared")}
                            />
                          </ul>
                        </ScrollableContainer>
                      </>
                    )}
                  </div>
                );
              }

              return null;
            })
          )}


          {/*Render Template Pages */}
          {isLoadingSidebarData ? (
            // Templates Skeleton
            <div className="relative text-sm leading-5 mb-8">
              <div className="flex items-center justify-between ml-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            </div>
          ) : (
            <TemplatesSidebar
              NodeRenderer={NodeRenderer}
              ScrollableContainer={ScrollableContainer}
              openNodeIds={openNodeIds}
              toggleNode={toggleNode}
              editorTitles={templatePages}
              selectedEditor={selectedEditor}
              onSelectEditor={onSelectEditor}
              onTemplateInstantiate={handleTemplateInstantiate}
              onCreateTemplate={handleCreateTemplate}
              isCreatingTemplate={isCreatingTemplate}
              templateMenuOpenId={templateMenuOpenId}
              templateActionLoading={templateActionLoading}
              onTemplateMenuToggle={handleTemplateMenuToggle}
            />
          )}

          {/*Render inReview Pages */}
          {isAdmin && (
            isLoadingSidebarData ? (
              // Review Pages Skeleton
              <div className="relative text-sm leading-5 mb-8">
                <div className="flex items-center justify-between ml-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              </div>
            ) : (
              <div className="relative text-sm leading-5 mb-8">
                <div
                  className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/30 py-2 px-2 ml-2 rounded-md"
                  onClick={toggleDropdownForReviewPage}
                >
                  <span className="text-xs text-[#5F5E5B] dark:text-[#9B9B9B]">Review pages</span>
                  <ChevronsRight
                    className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${reviewPageisOpen ? "rotate-90" : ""
                      }`}
                  />
                </div>

                {reviewPageisOpen && (
                  <>
                    <ScrollableContainer>
                      <ul className="pl-2 space-y-1" id="navigation-items">
                        <PublishNodeRenderer nodes={inReviewPages} />
                      </ul>
                    </ScrollableContainer>
                  </>
                )}
              </div>
            )
          )}

          {/*Render published Pages */}
          {isAdmin && (
            isLoadingSidebarData ? (
              // Published Pages Skeleton
              <div className="relative text-sm leading-5 mb-8">
                <div className="flex items-center justify-between ml-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              </div>
            ) : (
              <div className="relative text-sm leading-5 mb-8">
                <div
                  className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/30 py-2 px-2 ml-2 rounded-md"
                  onClick={toggleDropdownForPublishedPage}
                >
                  <span className="text-xs text-[#5F5E5B] dark:text-[#9B9B9B]">Published pages</span>
                  <ChevronsRight
                    className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${publishedPageisOpen ? "rotate-90" : ""
                      }`}
                  />
                </div>

                {publishedPageisOpen && (
                  <>
                    <ScrollableContainer>
                      <ul className="pl-2 space-y-1" id="navigation-items">
                        <PublishNodeRenderer nodes={publishedPages} />
                      </ul>
                    </ScrollableContainer>
                  </>
                )}
              </div>
            )
          )}
        </div>
      </aside>

      {/* Modal */}
      {showModal && (
        <NoteModal
          isLoading={isLoading}
          title={newEditorTitle}
          setTitle={setNewEditorTitle}
          selectedEmoji={selectedEmoji}
          setSelectedEmoji={setSelectedEmoji}
          showEmojiPicker={showEmojiPicker}
          setShowEmojiPicker={setShowEmojiPicker}
          setIsRestrictedPage={setIsRestrictedPage}
          isRestrictedPage={isRestrictedPage}
          isPublicPage={isPublicPage}
          onClose={() => {
            setShowModal(false);
            setEditData(null);
            setNewEditorTitle("");
            setSelectedEmoji("");
            setParentIdForNewPage(null);
            setIsPublicPage(false);
            setIsRestrictedPage(false);
          }}
          onSubmit={editData ? handleupdate : handleModalSubmit}
          isEdit={!!editData}
        />
      )}

      {/*Deletion Modal */}
      {confirmDeleteId && (
        <DeleteConfirmationModal
          header="Delete Note"
          title={confirmDeleteTitle}
          entity="note"
          isOpen={!!confirmDeleteId}
          isDeleting={isDeleting}
          onCancel={() => {
            setConfirmDeleteId(null);
            setConfirmDeleteTitle("");
          }}
          onConfirm={async () => {
            if (deleteNote && confirmDeleteId) {
              setConfirmDeleteId(null);
              setConfirmDeleteTitle("");
              setIsDeleting(true);
              try {
                await deleteNote(confirmDeleteId);
              } catch (err) {
                console.error("Error deleting editor:", err);
              } finally {
                setIsDeleting(false);
                setConfirmDeleteId(null);
                setConfirmDeleteTitle("");
              }
            }
          }}
        />
      )}

      {/* Move Page Modal */}
      {movePageId && (
        <MoveToPublicModal
          isLoading={movePageLoading}
          editorTitle={newEditorTitle}
          isPublicPage={isPublicPage}
          onCancel={() => {
            setMovePageId(null);
            setIsRestrictedPage(false);
            setNewEditorTitle("");
          }}
          onConfirm={async () => {
            try {
              setMovePageId(null);
              setMovePageLoading(true);
              await moveNote(movePageId, isPublicPage, isRestrictedPage);
            } catch (err) {
              console.error("error in moving Note", err);
            } finally {
              setMovePageId(null);
              setIsRestrictedPage(false);
              setNewEditorTitle("");
              setMovePageLoading(false);
            }
          }}
          isRestrictedPage={isRestrictedPage}
          setIsRestrictedPage={setIsRestrictedPage}
        />
      )}

      {/*dropdown model */}
      {dropdownOpen && editData && (() => {
        // Normalize data access: Check if it's a Block (has .value) or a direct object (CachedNode)
        const rawData = editData as any;
        const dataValue = rawData.value || rawData;

        const userEmail = dataValue.userEmail as string;
        // Check both pageType (Block) and isPublicNote (Node/CachedNode)
        const isPublicNote = dataValue.pageType === "public" || dataValue.isPublicNote === true;
        const title = dataValue.title || "New page";
        const isTemplate = dataValue.isTemplate === true;

        const userOwnsNote = isOwner(userEmail, false, user);

        // Build menu items array with conditional logic
        const menuItems: DropdownMenuItemProps[] = [];

        // Rename - always shown, disabled if !userOwnsNote
        menuItems.push({
          id: 'rename',
          label: "Rename",
          icon: <DropdownMenuIcons.Rename />,
          onClick: () => {
            if (userOwnsNote) {
              handleDropdownAction("rename", editData);
            }
          },
          disabled: !userOwnsNote,
        });

        // Share - only if !isPublicNote, disabled if !userOwnsNote
        if (!isPublicNote) {
          menuItems.push({
            id: 'share',
            label: "Share",
            icon: <DropdownMenuIcons.Share />,
            onClick: () => {
              if (userOwnsNote) {
                handleDropdownAction("share", editData);
              }
            },
            disabled: !userOwnsNote,
          });
        }

        // Move to Private/Public - always shown, text changes based on isPublicNote, disabled if !userOwnsNote
        menuItems.push({
          id: 'move-page',
          label: `Move to ${isPublicNote ? "Private" : "Public"} Pages`,
          icon: <DropdownMenuIcons.Move />,
          onClick: () => {
            if (userOwnsNote) {
              handleDropdownAction("movePage", editData);
            }
          },
          disabled: !userOwnsNote,
        });

        // Delete - always shown, disabled if !userOwnsNote, destructive variant
        menuItems.push({
          id: 'delete',
          label: "Delete",
          icon: <DropdownMenuIcons.Delete />,
          variant: 'destructive',
          onClick: () => {
            if (userOwnsNote) {
              handleDropdownAction("deletion", editData);
            }
          },
          disabled: !userOwnsNote,
        });

        return (
          <div
            ref={dropdownRef}
            className="fixed w-55 bg-white dark:bg-zinc-800 rounded-md shadow-lg z-50 border border-gray-200 dark:border-zinc-700"
            style={{
              top: `${Math.max(0, dropdownPosition.top)}px`,
              left: `${dropdownPosition.left}px`,
              maxHeight: "calc(100vh - 20px)",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setdropdownOpen(false);
                setTemplateAddSubmenuOpen(false);
              }
            }}
            role="menu"
            tabIndex={-1}
          >
            <div className="py-2">
              {/* Title header using DropdownMenuHeader */}
              <DropdownMenuHeader
                title={title}
                onClose={() => {
                  setdropdownOpen(false);
                  setTemplateAddSubmenuOpen(false);
                }}
                showBack={false}
                showClose={true}
              />

              {/* Horizontal divider */}
              <DropdownMenuDivider />

              {/* Template Add button - keep separate as it has submenu */}
              {isTemplate && (
                <>
                  <div className="w-full relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTemplateAddSubmenuOpen(!templateAddSubmenuOpen);
                      }}
                      className="flex items-center justify-between gap-4 w-full text-left px-4 py-2 text-sm transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <Plus className="h-4 w-4" />
                        Add
                      </div>
                      <ChevronRight className={`h-4 w-4 transition-transform ${templateAddSubmenuOpen ? "rotate-90" : ""}`} />
                    </button>

                    {/* Submenu for Add options */}
                    {templateAddSubmenuOpen && (
                      <div className="ml-2">
                        {(["private", "public", "restricted"] as TemplateTarget[]).map((option) => {
                          const template = editData as unknown as Block;
                          const isBusy = templateActionLoading?.startsWith(`${template._id}-${option}`);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setTemplateAddSubmenuOpen(false);
                                setdropdownOpen(false);
                                await handleTemplateInstantiate(template, option);
                              }}
                              disabled={!!isBusy}
                              className="flex items-center gap-4 w-full text-left px-4 py-2 text-sm transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <div className="w-4 h-4" />
                              )}
                              Add to {option.charAt(0).toUpperCase() + option.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <DropdownMenuDivider />
                </>
              )}

              {/* Menu items using generic component */}
              <DropdownMenu items={menuItems} />
            </div>
          </div>
        );
      })()}
      {/* Loader overlay for deletion */}
      {(isDeleting || movePageLoading) && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[9999]">
          <div className="flex items-center gap-2 text-white text-lg">
            <Loader2 className="w-6 h-6 animate-spin" />
            {isDeleting ? "Deleting page..." : movePageLoading ? "Moving Page..." : "Loading..."}
          </div>
        </div>
      )}
      {/* switch workspace model */}
      {workspaceDropDownOpen && (
        <div
          ref={workspaceDropdownRef}
          className={clsx(
            "fixed z-[9999] w-60 bg-[#f8f8f7] dark:bg-zinc-800 shadow-lg border border-gray-200 dark:border-zinc-700 rounded-md",
            {
              "left-[250px]": isOpen,
              "left-0": !isOpen,
            }
          )}
          style={{
            top: '50px',  // Fixed 50px from top
            left: '5px',
          }}
        >
          <div className="p-3 border-b border-gray-200 dark:border-zinc-700">
            <div className="flex items-start gap-2">
              {currentWorkspace ? (
                <>
                  <div className="w-8 h-8 rounded-md bg-gray-300 dark:bg-zinc-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium">
                      {currentWorkspace?.icon || selectedworkspace?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedworkspace}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">reventlabs.com <span className="pl-2">{workspaceMembers.length} members</span></p>
                  </div>
                </>
              ) : (
                <>
                  <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
                  <div>
                    <Skeleton className="h-4 w-24 rounded mb-2" />
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="border-b">
            <InviteButton />
          </div>
          <div className="border-b">
            <SettingsButton />
          </div>
          <div className="">
            <button
              onClick={() => {
                setNotes([]);
                router.push("/organization/workspace");
                setworkspaceDropDownOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 fill-current" />
              Switch Workspace
            </button>
          </div>
        </div>
      )}
    </>
  );
}
