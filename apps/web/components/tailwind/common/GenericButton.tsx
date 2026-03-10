"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const VARIANT_STYLES: Record<string, string> = {
  primary:
    "border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 shadow-sm",
  secondary:
    "border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 shadow-sm",
  blue:
    "bg-[#2383E2] hover:bg-[#1a6db3] text-white border-none shadow-sm",
  preview:
    "bg-[#EBF5FF] hover:bg-[#D6EAFF] text-[#2383E2] border-none shadow-sm",
  outline:
    "border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 bg-transparent",
  ghost:
    "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-0 bg-transparent",
};

const SIZE_STYLES: Record<string, string> = {
  sm: "h-7 px-2 text-sm",
  md: "h-8 px-3 text-sm",
  lg: "h-9 px-4 text-sm",
};

export interface GenericButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  variant?: keyof typeof VARIANT_STYLES;
  size?: keyof typeof SIZE_STYLES;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
}

export function GenericButton({
  label,
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  isLoading = false,
  className,
  disabled,
  ...props
}: GenericButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium rounded-md transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed",
        SIZE_STYLES[size],
        VARIANT_STYLES[variant],
        fullWidth && "w-full",
        !label && "px-0 w-8 h-8", // Adjusted for icon-only
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {leadingIcon && <span className={cn(label && "mr-2", "flex items-center")}>{leadingIcon}</span>}
          {label && <span>{label}</span>}
          {trailingIcon && <span className={cn(label && "ml-2", "flex items-center")}>{trailingIcon}</span>}
        </>
      )}
    </button>
  );
}

