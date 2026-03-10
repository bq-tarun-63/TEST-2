"use client";

import type { ReactNode } from "react";
import { GenericButton } from "@/components/tailwind/common/GenericButton";
import { cn } from "@/lib/utils";

export interface GenericPopupModalProps {
  open: boolean;
  title?: string;
  message?: string;
  listItems?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "secondary" | "outline" | "ghost";
  cancelVariant?: "primary" | "secondary" | "outline" | "ghost";
  confirmClassName?: string;
  cancelClassName?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  children?: ReactNode;
  showCancel?: boolean;
  showConfirm?: boolean;
}

export default function GenericPopupModal({
  open,
  title,
  message,
  listItems = [],
  confirmLabel = "Got it",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  cancelVariant = "outline",
  confirmClassName,
  cancelClassName,
  onConfirm,
  onCancel,
  children,
  showCancel = true,
  showConfirm = true,
}: GenericPopupModalProps) {
  if (!open) return null;

  const hasListItems = listItems.length > 0;
  const hasTitle = Boolean(title);
  const hasMessage = Boolean(message);
  const hasContent = hasTitle || hasMessage || hasListItems || children;

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 dark:bg-black/75 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {hasContent && (
          <div>
            {title && (
              <div className="text-base font-semibold text-foreground mb-2">{title}</div>
            )}
            {message && (
              <div className="text-base font-semibold text-foreground">{message}</div>
            )}
            {hasListItems && (
              <div className="mt-4 rounded-lg border border-border text-left text-sm text-muted-foreground divide-y divide-border">
                {listItems.map((item, index) => (
                  <div key={`${item}-${index}`} className="px-4 py-2">
                    {item}
                  </div>
                ))}
              </div>
            )}
            {children && <div className="mt-4">{children}</div>}
          </div>
        )}
        {(showConfirm || showCancel) && (
          <div className="mt-6 flex flex-col gap-2">
            {showConfirm && onConfirm && (
              <GenericButton
                label={confirmLabel}
                variant={confirmVariant}
                className={cn(confirmClassName)}
                onClick={onConfirm}
                fullWidth
              />
            )}
            {showCancel && onCancel && (
              <GenericButton
                label={cancelLabel}
                variant={cancelVariant}
                className={cn(cancelClassName)}
                onClick={onCancel}
                fullWidth
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

