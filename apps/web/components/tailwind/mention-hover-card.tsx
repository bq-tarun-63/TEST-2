"use client";

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface MentionHoverCardProps {
  userId: string;
  userName: string;
  userEmail?: string;
  children: React.ReactNode;
}

export const MentionHoverCard: React.FC<MentionHoverCardProps> = ({
  userId,
  userName,
  userEmail,
  children,
}) => {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Cancel any pending hide
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: rect.left,
      y: rect.bottom + 8,
    });
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    // Small delay to allow moving to card
    timeoutRef.current = setTimeout(() => setIsHovered(false), 150);
  };

  const handleCardEnter = () => {
    // Cancel hide when entering card
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleCardLeave = () => {
    setIsHovered(false);
  };

  const currentTimestamp = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return (
    <>
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
      >
        {children}
      </span>

      {isHovered && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 bg-background border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-w-[400px] min-w-[280px] p-3 cursor-pointer"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
          onClick={() => router.push(`/userprofile/${userId}`)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-row">
              <div className="flex items-center gap-3 overflow-hidden">
                {/* Avatar */}
                <div className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center select-none bg-background text-gray-600 dark:text-gray-400 text-2xl outline outline-1 outline-black/10 -outline-offset-1">
                  {userName.charAt(0).toUpperCase()}
                </div>

                {/* User Info */}
                <div className="flex flex-col gap-[3px] overflow-hidden w-full">
                  {/* Name */}
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis">
                    {userName}
                  </div>

                  {/* Email */}
                  {userEmail && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                      {userEmail}
                    </div>
                  )}

                  {/* Local Time */}
                  <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                    {currentTimestamp} local time
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
