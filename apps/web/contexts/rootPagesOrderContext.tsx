"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Types
export interface RootPagesOrder {
  private: string[];
  public: string[];
  workArea: Record<string, string[]>; // Dictionary of workAreaId -> pageIds[]
  shared: string[]; // Added shared pages
  sidebar: string[];
}

export interface RootPagesOrderContextValue {
  // State
  privatePagesOrder: string[];
  publicPagesOrder: string[];
  workAreaPagesOrder: Record<string, string[]>; // Dictionary of workAreaId -> pageIds[]
  sharedPagesOrder: string[]; // Added shared pages
  templatePagesOrder: string[]; // Added template pages
  sidebarOrder: string[];

  // Private pages actions
  addPrivatePage: (pageId: string, position?: number) => void;
  removePrivatePage: (pageId: string) => void;
  reorderPrivate: (newOrder: string[]) => void;

  // Public pages actions
  addPublicPage: (pageId: string, position?: number) => void;
  removePublicPage: (pageId: string) => void;
  reorderPublic: (newOrder: string[]) => void;

  // Work area pages actions (dictionary-based - grouped by workAreaId)
  addWorkAreaPage: (workAreaId: string, pageId: string, position?: number) => void;
  removeWorkAreaPage: (pageId: string) => void;
  reorderWorkArea: (newOrder: Record<string, string[]>) => void;

  // Shared pages actions (new)
  addSharedPage: (pageId: string, position?: number) => void;
  removeSharedPage: (pageId: string) => void;
  reorderShared: (newOrder: string[]) => void;

  // Templates pages actions (new)
  addTemplatePage: (pageId: string, position?: number) => void;
  removeTemplatePage: (pageId: string) => void;
  reorderTemplates: (newOrder: string[]) => void;

  // Sidebar Order
  setSidebarOrder: (order: string[]) => void;

  // General actions
  removePage: (pageId: string) => void; // Remove from all lists
  movePageToPrivate: (pageId: string, position?: number) => void;
  movePageToPublic: (pageId: string, position?: number) => void;
  movePageToWorkArea: (workAreaId: string, pageId: string, position?: number) => void;
  movePageToShared: (pageId: string, position?: number) => void;
}

// Context
const RootPagesOrderContext = createContext<RootPagesOrderContextValue | null>(null);

// Hook
export function useRootPagesOrder() {
  const ctx = useContext(RootPagesOrderContext);
  if (!ctx) {
    throw new Error("useRootPagesOrder must be used within RootPagesOrderProvider");
  }
  return ctx;
}

// Constants
const STORAGE_KEY = "rootPagesOrder";
const STORAGE_DEBOUNCE_MS = 500;

// Helper: Load from localStorage
// const loadFromStorage = (): RootPagesOrder => {
//   if (typeof window === "undefined") {
//     return { private: [], public: [], workArea: {}, shared: [], sidebar: [] };
//   }

//   try {
//     const stored = localStorage.getItem(STORAGE_KEY);
//     if (stored) {
//       const parsed = JSON.parse(stored) as RootPagesOrder;
//       return {
//         private: parsed.private || [],
//         public: parsed.public || [],
//         workArea: parsed.workArea || {},
//         shared: parsed.shared || [],
//         sidebar: parsed.sidebar || [],
//       };
//     }
//   } catch (error) {
//     console.error("Failed to load root pages order from storage:", error);
//   }

//   return { private: [], public: [], workArea: {}, shared: [], sidebar: [] };
// };

// Helper: Save to localStorage
// const saveToStorage = (order: RootPagesOrder) => {
//   if (typeof window === "undefined") return;

//   try {
//     localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
//   } catch (error) {
//     console.error("Failed to save root pages order to storage:", error);
//   }
// };

// Provider
export const RootPagesOrderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [privatePagesOrder, setPrivatePagesOrder] = useState<string[]>([]);
  const [publicPagesOrder, setPublicPagesOrder] = useState<string[]>([]);
  const [workAreaPagesOrder, setWorkAreaPagesOrder] = useState<Record<string, string[]>>({});
  const [sharedPagesOrder, setSharedPagesOrder] = useState<string[]>([]);
  const [templatePagesOrder, setTemplatePagesOrder] = useState<string[]>([]);
  const [sidebarOrder, setSidebarOrderState] = useState<string[]>([]);

  const orderRef = useRef({ privatePagesOrder, publicPagesOrder, workAreaPagesOrder, sharedPagesOrder, templatePagesOrder });
  orderRef.current = { privatePagesOrder, publicPagesOrder, workAreaPagesOrder, sharedPagesOrder, templatePagesOrder };

  // // Load from localStorage on mount
  // useEffect(() => {
  //   const loaded = loadFromStorage();
  //   setPrivatePagesOrder(loaded.private);
  //   setPublicPagesOrder(loaded.public);
  //   setWorkAreaPagesOrder(loaded.workArea);
  //   setSharedPagesOrder(loaded.shared);
  //   setSidebarOrderState(loaded.sidebar);
  // }, []);

  // // Save to localStorage on changes (debounced)
  // useEffect(() => {
  //   const timeoutId = setTimeout(() => {
  //     saveToStorage({
  //       private: privatePagesOrder,
  //       public: publicPagesOrder,
  //       workArea: workAreaPagesOrder,
  //       shared: sharedPagesOrder,
  //       sidebar: sidebarOrder,
  //     });
  //   }, STORAGE_DEBOUNCE_MS);

  //   return () => clearTimeout(timeoutId);
  // }, [privatePagesOrder, publicPagesOrder, workAreaPagesOrder, sharedPagesOrder, sidebarOrder]);

  // Private pages actions
  const addPrivatePage = useCallback((pageId: string, position?: number) => {
    setPrivatePagesOrder((prev) => {
      if (prev.includes(pageId)) return prev; // Already exists
      const copy = prev.slice();
      if (position !== undefined && position >= 0 && position <= copy.length) {
        copy.splice(position, 0, pageId);
      } else {
        copy.push(pageId); // Add to end by default
      }
      console.log("Added private page:", pageId, "at position:", position ?? "end");
      return copy;
    });
  }, []);

  const removePrivatePage = useCallback((pageId: string) => {
    setPrivatePagesOrder((prev) => {
      const filtered = prev.filter((id) => id !== pageId);
      if (filtered.length !== prev.length) {
        console.log("Removed private page:", pageId);
      }
      return filtered;
    });
  }, []);

  const reorderPrivate = useCallback((newOrder: string[]) => {
    console.log("Reordered private pages:", newOrder);
    setPrivatePagesOrder(newOrder.slice());
  }, []);

  // Public pages actions
  const addPublicPage = useCallback((pageId: string, position?: number) => {
    setPublicPagesOrder((prev) => {
      if (prev.includes(pageId)) return prev;
      const copy = prev.slice();
      if (position !== undefined && position >= 0 && position <= copy.length) {
        copy.splice(position, 0, pageId);
      } else {
        copy.push(pageId);
      }
      console.log("Added public page:", pageId, "at position:", position ?? "end");
      return copy;
    });
  }, []);

  const removePublicPage = useCallback((pageId: string) => {
    setPublicPagesOrder((prev) => {
      const filtered = prev.filter((id) => id !== pageId);
      if (filtered.length !== prev.length) {
        console.log("Removed public page:", pageId);
      }
      return filtered;
    });
  }, []);

  const reorderPublic = useCallback((newOrder: string[]) => {
    console.log("Reordered public pages:", newOrder);
    setPublicPagesOrder(newOrder.slice());
  }, []);

  // Work area pages actions (dictionary-based - grouped by workAreaId)
  const addWorkAreaPage = useCallback((workAreaId: string, pageId: string, position?: number) => {
    setWorkAreaPagesOrder((prev) => {
      const workAreaPages = prev[workAreaId] || [];
      if (workAreaPages.includes(pageId)) return prev; // Already exists

      const copy = workAreaPages.slice();
      if (position !== undefined && position >= 0 && position <= copy.length) {
        copy.splice(position, 0, pageId);
      } else {
        copy.push(pageId);
      }

      console.log("Added work area page:", pageId, "to work area:", workAreaId, "at position:", position ?? "end");
      return { ...prev, [workAreaId]: copy };
    });
  }, []);

  const removeWorkAreaPage = useCallback((pageId: string) => {
    setWorkAreaPagesOrder((prev) => {
      const newOrder = { ...prev };
      let removed = false;

      // Find and remove the page from whichever workArea it's in
      Object.keys(newOrder).forEach((workAreaId) => {
        const pages = newOrder[workAreaId];
        if (!pages) return;

        const filtered = pages.filter((id: string) => id !== pageId);
        if (filtered.length !== pages.length) {
          newOrder[workAreaId] = filtered;
          removed = true;
          console.log("Removed work area page:", pageId, "from work area:", workAreaId);
        }
      });

      return removed ? newOrder : prev;
    });
  }, []);

  const reorderWorkArea = useCallback((newOrder: Record<string, string[]>) => {
    console.log("Reordered work area pages:", newOrder);
    setWorkAreaPagesOrder({ ...newOrder });
  }, []);

  // Shared pages actions (new)
  const addSharedPage = useCallback((pageId: string, position?: number) => {
    setSharedPagesOrder((prev) => {
      if (prev.includes(pageId)) return prev;
      const copy = prev.slice();
      if (position !== undefined && position >= 0 && position <= copy.length) {
        copy.splice(position, 0, pageId);
      } else {
        copy.push(pageId);
      }
      console.log("Added shared page:", pageId, "at position:", position ?? "end");
      return copy;
    });
  }, []);

  const removeSharedPage = useCallback((pageId: string) => {
    setSharedPagesOrder((prev) => {
      const filtered = prev.filter((id) => id !== pageId);
      if (filtered.length !== prev.length) {
        console.log("Removed shared page:", pageId);
      }
      return filtered;
    });
  }, []);

  const reorderShared = useCallback((newOrder: string[]) => {
    console.log("Reordered shared pages:", newOrder);
    setSharedPagesOrder(newOrder.slice());
  }, []);

  // Templates pages actions 
  const addTemplatePage = useCallback((pageId: string, position?: number) => {
    setTemplatePagesOrder((prev) => {
      if (prev.includes(pageId)) return prev;
      const copy = prev.slice();
      if (position !== undefined && position >= 0 && position <= copy.length) {
        copy.splice(position, 0, pageId);
      } else {
        copy.push(pageId);
      }
      console.log("Added template page:", pageId, "at position:", position ?? "end");
      return copy;
    });
  }, []);

  const removeTemplatePage = useCallback((pageId: string) => {
    setTemplatePagesOrder((prev) => {
      const filtered = prev.filter((id) => id !== pageId);
      if (filtered.length !== prev.length) {
        console.log("Removed template page:", pageId);
      }
      return filtered;
    });
  }, []);

  const reorderTemplates = useCallback((newOrder: string[]) => {
    console.log("Reordered template pages:", newOrder);
    setTemplatePagesOrder(newOrder.slice() || []);
  }, []);

  // Sidebar actions
  const setSidebarOrder = useCallback((order: string[]) => {
    console.log("Setting sidebar order:", order);
    setSidebarOrderState(order);
  }, []);

  // General actions
  const removePage = useCallback((pageId: string) => {
    console.log("Removing page from all lists:", pageId);
    removePrivatePage(pageId);
    removePublicPage(pageId);
    removeWorkAreaPage(pageId);
    removeSharedPage(pageId);
  }, [removePrivatePage, removePublicPage, removeWorkAreaPage, removeSharedPage]);

  const movePageToPrivate = useCallback((pageId: string, position?: number) => {
    console.log("Moving page to private:", pageId);
    removePage(pageId);
    addPrivatePage(pageId, position);
  }, [removePage, addPrivatePage]);

  const movePageToPublic = useCallback((pageId: string, position?: number) => {
    console.log("Moving page to public:", pageId);
    removePage(pageId);
    addPublicPage(pageId, position);
  }, [removePage, addPublicPage]);

  const movePageToWorkArea = useCallback((workAreaId: string, pageId: string, position?: number) => {
    console.log("Moving page to work area:", pageId, "in work area:", workAreaId);
    removePage(pageId);
    addWorkAreaPage(workAreaId, pageId, position);
  }, [removePage, addWorkAreaPage]);

  const movePageToShared = useCallback((pageId: string, position?: number) => {
    console.log("Moving page to shared:", pageId);
    removePage(pageId);
    addSharedPage(pageId, position);
  }, [removePage, addSharedPage]);

  const value: RootPagesOrderContextValue = {
    privatePagesOrder,
    publicPagesOrder,
    workAreaPagesOrder,
    sharedPagesOrder,
    sidebarOrder,
    addPrivatePage,
    removePrivatePage,
    reorderPrivate,
    addPublicPage,
    removePublicPage,
    reorderPublic,
    addWorkAreaPage,
    removeWorkAreaPage,
    reorderWorkArea,
    addSharedPage,
    removeSharedPage,
    reorderShared,
    templatePagesOrder,
    addTemplatePage,
    removeTemplatePage,
    reorderTemplates,
    removePage,
    movePageToPrivate,
    movePageToPublic,
    movePageToWorkArea,
    movePageToShared,
    setSidebarOrder,
  };

  return (
    <RootPagesOrderContext.Provider value={value}>
      {children}
    </RootPagesOrderContext.Provider>
  );
};
