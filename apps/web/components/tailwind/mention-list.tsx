import React, { useEffect, useState, useImperativeHandle, forwardRef, useMemo } from "react";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useNoteContext } from "@/contexts/NoteContext";
import { useParams } from "next/navigation";
import { Members } from "@/types/workspace";

interface MentionListProps {
  query: string;
  command: (item: { id: string; label: string }) => void;
  onMention?: (item: { id: string; label: string }, workspaceId: any) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef(({ query, command, onMention }: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { workspaceMembers, currentWorkspace } = useWorkspaceContext();
  const { editorTitle } = useNoteContext();
  const params = useParams();

  const noteId = params?.noteId as string;

  // Date shortcuts logic memoized once per minute/render
  const { today, tomorrow, yesterday } = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const tom = new Date(d);
    tom.setDate(d.getDate() + 1);
    tom.setHours(9, 0, 0, 0);
    const yes = new Date(d);
    yes.setDate(d.getDate() - 1);
    return { today: d, tomorrow: tom, yesterday: yes };
  }, []);

  const dateShortcuts = useMemo(() => [
    { id: 'today', label: 'Today', type: 'date', date: today.toISOString(), icon: 'clock' },
    { id: 'tomorrow', label: 'Tomorrow', type: 'date', date: tomorrow.toISOString(), icon: 'clock' },
    { id: 'yesterday', label: 'Yesterday', type: 'date', date: yesterday.toISOString(), icon: 'clock' },
    { id: 'reminder', label: 'Remind me', type: 'reminder', date: tomorrow.toISOString(), secondaryLabel: 'Tomorrow 9am', icon: 'alarm', reminder: '1_day', includeTime: true },
  ], [today, tomorrow, yesterday]);


  const userItems = useMemo(() => workspaceMembers.map((member) => ({
    id: member.userId,
    label: member.userName,
    userId: member.userId,
    userEmail: member.userEmail,
    userName: member.userName,
    noteTitle: editorTitle,
    noteId,
    type: 'user',
    role: member.role
  })), [workspaceMembers, editorTitle, noteId]);

  // Combined and filtered items for selection logic
  const sections = useMemo(() => {
    const q = query.toLowerCase();

    const filteredDates = dateShortcuts.filter(item => {
      const label = item.label.toLowerCase();
      const isMatch = label.includes(q);
      if (!isMatch) return false;

      // If query is empty, only show prioritized shortcuts (Today, Remind me)
      if (q === "") {
        return item.id === 'today' || item.id === 'reminder';
      }
      return true;
    });

    const filteredUsers = userItems.filter(item => item.label.toLowerCase().includes(q));

    const result: { title: string; items: any[] }[] = [];
    if (filteredDates.length > 0) result.push({ title: 'Date', items: filteredDates });
    if (filteredUsers.length > 0) result.push({ title: 'People', items: filteredUsers });
    return result;

  }, [query, dateShortcuts, userItems]);


  const flatItems = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectItem = (index: number) => {
    const item = flatItems[index];
    if (!item) return;

    command({
      id: item.id,
      label: item.label,
      type: (item as any).type || 'user',
      date: (item as any).date,
      reminder: (item as any).reminder || 'none',
      includeTime: (item as any).includeTime || false
    } as any);

    if (item.type === 'user') {
      onMention?.(item as any, currentWorkspace?._id);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (props: { event: KeyboardEvent }) => {
      const e = props.event;
      if (e.key === "ArrowUp") {
        setSelectedIndex(index => (index + flatItems.length - 1) % flatItems.length);
        e.preventDefault();
        return true;
      }
      if (e.key === "ArrowDown") {
        setSelectedIndex(index => (index + 1) % flatItems.length);
        e.preventDefault();
        return true;
      }
      if (e.key === "Enter") {
        selectItem(selectedIndex);
        e.preventDefault();
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return true;
      }
      return false;
    },
  }));

  const ClockIcon = () => (
    <svg aria-hidden="true" role="graphics-symbol" viewBox="0 0 20 20" className="w-[20px] h-[20px] fill-current">
      <path d="M10.625 5.725a.625.625 0 1 0-1.25 0v3.65H6.4a.625.625 0 1 0 0 1.25H10c.345 0 .625-.28.625-.625z"></path>
      <path d="M10 2.375a7.625 7.625 0 1 0 0 15.25 7.625 7.625 0 0 0 0-15.25M3.625 10a6.375 6.375 0 1 1 12.75 0 6.375 6.375 0 0 1-12.75 0"></path>
    </svg>
  );

  const AlarmIcon = () => (
    <svg aria-hidden="true" role="graphics-symbol" viewBox="0 0 20 20" className="w-[20px] h-[20px] fill-current">
      <path d="M5.791 1.886a.625.625 0 1 0-.801-.96L2.138 3.31a.625.625 0 1 0 .802.96zm4.834 3.839a.625.625 0 1 0-1.25 0v3.65H6.4a.625.625 0 0 0 0 1.25H10c.345 0 .625-.28.625-.625z"></path>
      <path d="M10 2.375a7.625 7.625 0 1 0 0 15.25 7.625 7.625 0 0 0 0-15.25M3.625 10a6.375 7.375 0 1 1 12.75 0 6.375 6.375 0 0 1-12.75 0M14.13 1.006a.625.625 0 0 0 .079.88l2.851 2.383a.625.625 0 1 0 .802-.96L15.01.927a.625.625 0 0 0-.88.079"></path>
    </svg>
  );

  let flatIndexCounter = 0;

  return (
    <div className="bg-background dark:bg-background rounded-[10px] border border-muted shadow-md overflow-hidden min-w-[280px] p-1">
      {sections.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {sections.map((section, sIndex) => (
            <div key={section.title} className={sIndex > 0 ? "mt-1.5 pt-1.5 relative" : ""}>
              {sIndex > 0 && <div className="absolute top-0 left-3 right-3 h-[1px] bg-muted/60" />}
              <div className="px-3 pt-1 mb-1 text-xs font-medium text-muted-foreground/70 select-none">
                {section.title}
              </div>
              <div className="flex flex-col gap-[1px]">
                {section.items.map((item: any) => {
                  const itemIndex = flatIndexCounter++;
                  const isSelected = itemIndex === selectedIndex;

                  if (item.type === 'user') {
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-2 cursor-pointer transition-all duration-200 ease-in-out border-radius-[6px] rounded-[6px]
                          ${isSelected ? "bg-accent dark:bg-accent/50" : "hover:bg-accent/30"}
                        `}
                        onClick={() => selectItem(itemIndex)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-md border border-muted bg-background dark:bg-background text-black dark:text-white shrink-0">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {item.label}
                            </span>
                            {item.role && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-400">
                                {item.role}
                              </span>
                            )}
                          </div>
                          {item.userEmail && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 mb-0">
                              {item.userEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Date/Reminder layout (compact Notion-style)
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors duration-20 border-radius-[6px] rounded-[6px] min-h-[28px]
                        ${isSelected ? "bg-accent dark:bg-accent/50" : "hover:bg-accent/30"}
                      `}
                      onClick={() => selectItem(itemIndex)}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div className="flex items-center justify-center min-w-[20px] min-height-[20px] text-muted-foreground shrink-0">
                        {item.icon === 'clock' && <ClockIcon />}
                        {item.icon === 'alarm' && <AlarmIcon />}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="text-[14px] leading-[120%] truncate">
                          {item.label}
                        </span>
                        {item.secondaryLabel && (
                          <div className="flex items-center text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden">
                            <span className="mx-1 opacity-50">—</span>
                            <span className="truncate">{item.secondaryLabel}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No matches found
        </div>
      )}
    </div>
  );
});

MentionList.displayName = "MentionList";

export default MentionList;
