"use client";

import { Camera, RefreshCw, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

const MAX_SIDE = 600;

/**
 * Crops to a centred square and shrinks to 600px JPEG in the browser. A phone photo goes from
 * ~4 MB to ~80 KB, so uploads are quick on mobile data and Storage costs stay negligible.
 */
export function preparePassport(file: File): Promise<Blob> {
  return prepareImage(file, { maxSide: MAX_SIDE, square: true });
}

/** Shrinks any photo in the browser before upload (optionally cropping to a centred square). */
export async function prepareImage(file: File, { maxSide = 1280, square = false } = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const sw = square ? Math.min(bitmap.width, bitmap.height) : bitmap.width;
  const sh = square ? sw : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.82));
}

export interface Passport {
  blob: Blob;
  /** Object URL for the preview */
  url: string;
}

/** Passport photograph field. Holds the resized image locally; the booking form uploads it at payment. */
export function PhotoPicker({ value, onChange, error }: { value: Passport | null; onChange: (photo: Passport) => void; error?: boolean }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const preview = value?.url;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose a photo (JPG or PNG)", "info");
    setBusy(true);
    try {
      const blob = await preparePassport(file);
      if (value) URL.revokeObjectURL(value.url);
      onChange({ blob, url: URL.createObjectURL(blob) });
    } catch {
      toast("Couldn't read that photo. Try a JPG or PNG.", "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-4 rounded-xl border border-dashed p-4", error ? "border-rose-300 bg-rose-50/50" : "border-grey-150 bg-grey-10")}>
      <label htmlFor={id} className="relative block size-24 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-grey-100 bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="Your passport photograph" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-grey-400">
            <UserRound className="size-10" strokeWidth={1.2} />
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="size-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </span>
        )}
      </label>
      <div className="min-w-0">
        <p className="text-sm font-medium text-heading-2">
          Passport photograph <span className="text-rose-500">*</span>
        </p>
        <p className="mt-0.5 text-xs text-heading-6">A clear photo of your face on a plain background.</p>
        <label
          htmlFor={id}
          className="mt-2.5 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg whitespace-nowrap border border-grey-150 bg-white px-3 text-sm font-medium text-heading-4 hover:bg-grey-50"
        >
          {value ? <RefreshCw className="size-4" /> : <Camera className="size-4" />}
          {value ? "Change photo" : "Add photo"}
        </label>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      </div>
    </div>
  );
}
