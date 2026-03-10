import clsx from "clsx";
import { useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Block, IPage } from "@/types/block";
import { FileText } from "lucide-react";

// interface CachedNode {
//   id: string;
//   title: string;
//   parentId: string;
//   icon?: string;
//   children: { _id: string; title: string; icon?: string; userId?: string; userEmail?: string }[];
//   hasChildren?: boolean;
// }

interface UseRenderPublishNodeProps {
  editorTitles: Block[];
  openNodeIds: Set<string>;
  selectedEditor: string | null;
  onSelectEditor: (id: string) => void;
  toggleNode: (id: string) => void;
}

// Simple Tooltip component
const Tooltip = ({
  children,
  content,
  disabled = false,
}: { children: React.ReactNode; content: string; disabled?: boolean }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  if (disabled) return <>{children}</>;

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <div className="relative block w-full">
      <div ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {children}
      </div>
      {isVisible &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap z-[9999] pointer-events-none"
            style={{
              top: position.top - 12,
              left: position.left,
              transform: "translateY(-50%)",
            }}
          >
            {content}
            <div className="absolute top-1/2 right-full transform -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default function useRenderPublishNode({
  editorTitles,
  selectedEditor,
  onSelectEditor,
}: UseRenderPublishNodeProps) {
  const pathname = usePathname();

  const noteIdFromPath = useMemo(() => {
    if (!pathname) return null;
    const pathParts = pathname.split("/");
    const noteId = pathParts.pop();
    return noteId && noteId !== "notes" ? noteId : null;
  }, [pathname]);

  return editorTitles
    .slice()
    .reverse()
    .map((block) => {
      const value = block.value as IPage;
      return (
        <li
          key={block._id}
          className=" text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
          onClick={() => onSelectEditor(block._id)}
          onKeyUp={(e) => {
            if (e.key === "Enter") {
              onSelectEditor(block._id);
            }
          }}
        >
          <div
            className={clsx(
              "group flex gap-2 pl-1 pr-2 items-center justify-between p-1 rounded-lg",
              noteIdFromPath === block._id && "font-bold dark:bg-[#2c2c2c] bg-gray-100 ",
            )}
          >
            <div className="flex gap-2 pl-1 items-center relative ">
              {value.icon ? <span className="text-lg">{value.icon}</span> : <FileText className="h-5 w-5" />}
              <span
                className={`ml-2 truncate txt-eclips
    text-[#5F5E5B] 
    ${noteIdFromPath === block._id
                    ? 'dark:text-white'
                    : 'dark:text-[#9B9B9B]'
                  }`}
              >
                {value.title}
              </span>            </div>
          </div>
        </li>
      );
    });
}
