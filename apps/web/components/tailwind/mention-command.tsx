import Mention from "@tiptap/extension-mention";
import MentionList, { MentionListRef } from "@/components/tailwind/mention-list"
import { MentionHoverCard } from "@/components/tailwind/mention-hover-card"
import tippy, { type Instance, type Props } from "tippy.js"
import { ReactRenderer, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { postWithAuth } from "@/lib/api-helpers";
import { Notification } from "@/types/notification";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/tailwind/ui/popover";
import { MentionDateCalender } from "./mentionDateCalender";
import { Calendar as CalendarIcon, AlarmClock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/workspaceContext";

const formatRelativeDate = (dateStr: string, includeTime?: boolean, timeFormat?: '12h' | '24h') => {
  const date = new Date(dateStr);
  const now = new Date();

  const d = new Date(date).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const oneDay = 24 * 60 * 60 * 1000;

  const diffDays = Math.round((d - today) / oneDay);
  let baseLabel = "";

  if (diffDays === 0) baseLabel = "Today";
  else if (diffDays === 1) baseLabel = "Tomorrow";
  else if (diffDays === -1) baseLabel = "Yesterday";
  else if (diffDays > 1 && diffDays < 7) {
    baseLabel = date.toLocaleDateString('en-US', { weekday: 'long' });
  } else if (diffDays >= 7 && diffDays < 14) {
    baseLabel = `Next ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  } else if (diffDays < -1 && diffDays > -7) {
    baseLabel = `Last ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  } else {
    // Full date format as requested for dates further away
    baseLabel = date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  if (includeTime) {
    const timeLabel = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat !== '24h'
    }).toLowerCase();
    return `${baseLabel} ${timeLabel}`;
  }

  return baseLabel;
};


const MentionNodeView = ({ node, updateAttributes, editor }: any) => {
  const { id, label, type, date, endDate, includeTime, reminder, timeFormat } = node.attrs;
  const router = useRouter();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { workspaceMembers } = useWorkspaceContext(); // Get workspace members

  if (type === 'date' || type === 'reminder') {
    const startDateLabel = date ? formatRelativeDate(date, includeTime, timeFormat) : "Pick date";
    const endDateLabel = endDate ? formatRelativeDate(endDate, includeTime, timeFormat) : null;

    const isOverdue = date && reminder !== 'none' && new Date(date) < new Date();

    return (
      <NodeViewWrapper as="span" style={{ display: "inline" }}>
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <span
              className={cn(
                "mention bg-accent rounded text-[16px] dark:text-[#9B9B9B] p-[2px] cursor-pointer hover:underline transition-colors inline-flex items-center gap-1",
                isOverdue ? "text-[#eb5757]" : "text-[color-mix(in_srgb,currentColor_60%,transparent)]"
              )}
              data-mention="true"
              data-type={reminder !== 'none' ? 'reminder' : 'date'}
              onClick={(e) => {
                e.preventDefault();
                setIsCalendarOpen(true);
              }}
            >
              @ {startDateLabel}

              {endDateLabel && (
                <>
                  <ArrowRight className="w-3 h-3 mx-0.5" />
                  {endDateLabel}
                </>
              )}

              {reminder !== 'none' && <AlarmClock className={cn("w-4 h-4", isOverdue && "text-[#eb5757]")} />}
            </span>
          </PopoverTrigger>
          <PopoverContent className="p-0 border-none w-auto" side="bottom" align="start">
            <MentionDateCalender
              initialStartDate={date ? new Date(date) : undefined}
              initialEndDate={endDate ? new Date(endDate) : undefined}
              initialIncludeTime={includeTime}
              initialReminder={reminder}
              initialTimeFormat={timeFormat}
              onSelect={(start, end, time, rem, tForm) => {
                if (!start) {
                  updateAttributes({
                    date: null,
                    endDate: null,
                    label: "Pick date",
                    includeTime: false,
                    reminder: 'none',
                    timeFormat: '12h'
                  });
                  return;
                }

                const sLabel = formatRelativeDate(start.toISOString(), time, tForm);
                const eLabel = end ? formatRelativeDate(end.toISOString(), time, tForm) : null;

                updateAttributes({
                  date: start.toISOString(),
                  endDate: end ? end.toISOString() : null,
                  includeTime: !!time,
                  reminder: rem || 'none',
                  timeFormat: tForm || '12h',
                  type: (rem && rem !== 'none') ? 'reminder' : 'date',
                  label: end ? `${sLabel} → ${eLabel}` : sLabel
                });
              }}
            />

          </PopoverContent>
        </Popover>
      </NodeViewWrapper>
    );
  }

  // Find the member
  const member = workspaceMembers.find(m => m.userId === id);
  const userEmail = member?.userEmail || `${label?.toLowerCase().replace(' ', '.')}@example.com`;
  const userName = member?.userName || label || 'unknown';


  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <MentionHoverCard
        userId={id}
        userName={userName}
        userEmail={userEmail}
      >
        <span
          onClick={(e) => {
            e.preventDefault();
            router.push(`/userprofile/${id}`);
          }}
          className="mention bg-accent text-[color-mix(in_srgb,currentColor_60%,transparent)] rounded text-[16px] dark:text-[#9B9B9B] p-[2px] cursor-pointer hover:underline transition-colors"
          data-mention="true"
          data-id={id}
        >
          @{userName || 'unknown'}
        </span>
      </MentionHoverCard>
    </NodeViewWrapper>
  );
};


export const createMentionExtension = (mentionUser: (payload: Notification, noteId: string, noteTitle: string) => void) => {
  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        type: {
          default: 'user',
          parseHTML: element => element.getAttribute('data-type'),
          renderHTML: attributes => {
            if (!attributes.type) return {}
            return { 'data-type': attributes.type }
          },
        },
        date: {
          default: null,
          parseHTML: element => element.getAttribute('data-date'),
          renderHTML: attributes => {
            if (!attributes.date) return {}
            return { 'data-date': attributes.date }
          },
        },
        endDate: {
          default: null,
          parseHTML: element => element.getAttribute('data-end-date'),
          renderHTML: attributes => {
            if (!attributes.endDate) return {}
            return { 'data-end-date': attributes.endDate }
          },
        },
        includeTime: {
          default: false,
          parseHTML: element => element.getAttribute('data-include-time') === 'true',
          renderHTML: attributes => {
            return { 'data-include-time': attributes.includeTime }
          },
        },
        reminder: {
          default: 'none',
          parseHTML: element => element.getAttribute('data-reminder'),
          renderHTML: attributes => {
            return { 'data-reminder': attributes.reminder }
          },
        },
        timeFormat: {
          default: '12h',
          parseHTML: element => element.getAttribute('data-time-format') || '12h',
          renderHTML: attributes => {
            return { 'data-time-format': attributes.timeFormat }
          },
        },
      }

    },
    addNodeView() {
      return ReactNodeViewRenderer(MentionNodeView);
    },
  }).configure({
    HTMLAttributes: {
      class: "bg-accent text-[color-mix(in_srgb,currentColor_60%,transparent)] rounded text-[16px] dark:text-[#9B9B9B] p-[2px]",
    },

    suggestion: {
      char: "@",
      items: () => [], // items handled inside MentionList via context
      render: () => {
        let component: ReactRenderer;
        let popup: Instance<Props>;

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
              props: {
                ...props,
                onMention: async (item, workspaceId) => {
                  try {
                    const response = await postWithAuth("/api/notification/add", {
                      workspaceId,
                      noteId: item.noteId,
                      noteTitle: item.noteTitle,
                      type: "MENTION",
                      sentTo: [
                        {
                          userId: item.userId,
                          userEmail: item.userEmail,
                          userName: item.userName,
                        },
                      ],
                    });

                    if ("error" in response || "message" in response) {
                      return null;
                    }

                    console.log('Printing Mention Notification', response)

                    mentionUser(response.notification, item.noteId, item.noteTitle);
                  } catch (err) {
                    console.error("Failed to send mention notification:", err);
                  }
                },
              },
              editor: props.editor,
            });

            popup = tippy(document.body, {
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
            });
          },

          onUpdate(props) {
            component.updateProps({ ...props });
            popup.setProps({
              getReferenceClientRect: () =>
                props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
            });
          },

          onKeyDown(props) {
            return (component.ref as MentionListRef)?.onKeyDown?.(props) ?? false;
          },

          onExit() {
            popup.destroy();
            component.destroy();
          },
        };
      },
    },
  });
};
