"use client";

import { CheckCircle2, Info } from "lucide-react";
import { useSyncExternalStore } from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "info";
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  listeners.forEach((l) => l());
}

export function toast(message: string, tone: ToastItem["tone"] = "success") {
  const id = ++counter;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3500);
}

const empty: ToastItem[] = [];

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => empty,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6 lg:bottom-4">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg animate-[toast-in_.2s_ease-out]">
          {t.tone === "success" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-400" /> : <Info className="size-4 shrink-0 text-sky-400" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
