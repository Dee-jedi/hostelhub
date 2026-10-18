"use client";

import { HISTORY_WINDOW, loadHistory, useHistoryLoaded, type HistoryKey } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Footer for lists that start with recent records only: says so, and loads the rest on request. */
export function OlderRecords({ name, what, className }: { name: HistoryKey; what: string; className?: string }) {
  const loaded = useHistoryLoaded(name);
  if (loaded) return null;
  return (
    <p className={cn("border-t border-grey-100 px-4 py-3 text-center text-xs text-heading-6 sm:px-5", className)}>
      Showing {HISTORY_WINDOW[name]}.{" "}
      <button onClick={() => loadHistory(name)} className="font-medium text-brand-700 hover:underline">
        Load older {what}
      </button>
    </p>
  );
}
