"use client";

import type { Passport } from "@/components/PhotoPicker";

/*
 * Keeps a half-filled form (and its passport photo) while the person leaves the page to sign in
 * with Google, so they come back to it filled in. Kept for this tab only, and read once.
 */

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export async function saveDraft<T>(key: string, data: T, photo: Passport | null) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, photo: photo ? await blobToDataUrl(photo.blob) : null }));
  } catch {
    // storage full or blocked: they'll just fill it in again
  }
}

/** The saved form, removed as it's read; null when there's none. */
export async function takeDraft<T>(key: string): Promise<{ data: T; photo: Passport | null } | null> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const saved = JSON.parse(raw) as { data: T; photo: string | null };
    if (!saved.photo) return { data: saved.data, photo: null };
    const blob = await (await fetch(saved.photo)).blob();
    return { data: saved.data, photo: { blob, url: URL.createObjectURL(blob) } };
  } catch {
    return null;
  }
}

/** This page's address with ?resume=1, to come back to after Google. */
export function resumeUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("resume", "1");
  return url.toString();
}

/** True (once) when the page was opened by coming back from Google; tidies the address. */
export function isResuming() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("resume") !== "1") return false;
  url.searchParams.delete("resume");
  window.history.replaceState(window.history.state, "", url.toString());
  return true;
}
