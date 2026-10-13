"use client";

import { useSyncExternalStore } from "react";

/** Shell-level UI state shared between the top bar, sidebar and pages. */
interface UIState {
  sidebarCollapsed: boolean;
  /** Resident profile drawer, openable from anywhere (e.g. global search) */
  residentId: string | null;
  /** Room detail modal on the Rooms page */
  roomId: string | null;
}

const COLLAPSE_KEY = "hostelhub:sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

let ui: UIState | null = null;
const listeners = new Set<() => void>();
const serverUI: UIState = { sidebarCollapsed: false, residentId: null, roomId: null };

function get() {
  if (!ui) ui = { ...serverUI, sidebarCollapsed: readCollapsed() };
  return ui;
}

function set(patch: Partial<UIState>) {
  ui = { ...get(), ...patch };
  listeners.forEach((l) => l());
}

export function useUI() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get,
    () => serverUI,
  );
}

export function toggleSidebar() {
  const next = !get().sidebarCollapsed;
  try {
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    // preference just won't persist
  }
  set({ sidebarCollapsed: next });
}

export const openResident = (id: string | null) => set({ residentId: id });
export const openRoom = (id: string | null) => set({ roomId: id });
