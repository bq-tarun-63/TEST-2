import { type Node as CustomNode } from "@/types/note";



export interface SidebarProps {
  onAddEditor: (
    title: string,
    parentId?: string | null,
    isRestrictedPage?: boolean,
    icon?: string | null,
    isPublicNote?: boolean,
    workAreaId?: string | null,
  ) => void;
  onSelectEditor: (id: string) => void;
  selectedEditor: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onShare: (noteId: string) => void;
  isLoadingSidebarData?: boolean;
}

export interface ScrollableContainerProps {
  children: React.ReactNode;
  preserveScroll?: boolean;
  className?: string;
}