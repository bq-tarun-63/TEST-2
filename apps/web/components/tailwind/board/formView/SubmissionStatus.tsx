"use client";

import { toast } from "sonner";

interface SubmissionStatusProps {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly isPageMode?: boolean;
  readonly onReset?: () => void;
}

export default function SubmissionStatus({
  status,
  message,
  isPageMode = false,
  onReset,
}: SubmissionStatusProps) {
  if (status === "idle" || !message) {
    return null;
  }

  if (isPageMode && status === "success") {

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center rounded-2xl border bg-background px-10 py-12 text-center shadow-lg max-w-lg w-full">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="mb-6 h-14 w-14 text-green-500">
            <path d="M17.12 11.415a.626.626 0 0 1 1.014.733l-4.449 6.156a.625.625 0 0 1-.94.083l-2.966-2.873a.626.626 0 0 1 .87-.899l2.446 2.37z"></path>
            <path d="M13.75 2.375c1.174 0 2.125.951 2.125 2.125v6.506l-1.25 1.73V4.5a.875.875 0 0 0-.875-.875h-7.5a.875.875 0 0 0-.875.875v11c0 .483.392.875.875.875h2.626q.016.019.034.036l1.253 1.214H6.25A2.125 2.125 0 0 1 4.125 15.5v-11c0-1.174.951-2.125 2.125-2.125z"></path>
            <path d="M10.215 8.038a.55.55 0 0 1 0 1.1H7.5a.55.55 0 0 1 0-1.1zm2.285-2.5a.55.55 0 1 1 0 1.1h-5a.55.55 0 0 1 0-1.1z"></path>
          </svg>
          <h2 className="mb-2 text-2xl font-semibold text-foreground">Thank you!</h2>
          <p className="text-muted-foreground">{message}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-black px-4 text-sm font-medium text-white shadow-sm transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                onReset?.();
              }}
            >
              Submit another response
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        status === "success"
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-red-300 bg-red-50 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}

