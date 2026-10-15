"use client";

import { BadgeCheck, CircleAlert, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, formatDate } from "@/lib/utils";

interface Result {
  valid: boolean;
  reason?: string;
  hostelName?: string;
  fullName?: string;
  photoUrl?: string | null;
  roomId?: string | null;
  leaseEnd?: string;
  isStudent?: boolean;
  matricNo?: string;
}

/** What security sees after scanning a tenant's ID card QR code. */
export default function VerifyPage() {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    fetch(`/api/id/verify?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ valid: false, reason: "Couldn't check this ID. Check your connection and scan again." }));
  }, []);

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-grey-10 text-sm text-heading-6">
        <span className="flex items-center gap-3">
          <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Checking ID…
        </span>
      </div>
    );
  }

  const known = !!result.fullName;
  return (
    <div className={cn("flex min-h-dvh flex-col items-center px-5 py-10", result.valid ? "bg-emerald-600" : known ? "bg-amber-500" : "bg-rose-600")}>
      <div className="flex flex-col items-center text-center text-white">
        {result.valid ? <BadgeCheck className="size-16" strokeWidth={1.6} /> : known ? <CircleAlert className="size-16" strokeWidth={1.6} /> : <ShieldX className="size-16" strokeWidth={1.6} />}
        <h1 className="mt-3 text-2xl font-semibold">{result.valid ? "Verified tenant" : known ? "Not currently valid" : "Not verified"}</h1>
        <p className="mt-1 text-sm text-white/85">{result.valid ? `Lives at ${result.hostelName}` : result.reason}</p>
      </div>

      {known && (
        <div className="mt-8 w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
          {result.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small Storage image
            <img src={result.photoUrl} alt={result.fullName} className="mx-auto size-32 rounded-3xl object-cover" />
          ) : (
            <div className="mx-auto flex size-32 items-center justify-center rounded-3xl bg-grey-50 text-sm text-heading-6">No photo</div>
          )}
          <p className="mt-4 text-xl font-semibold text-grey-950">{result.fullName}</p>
          {result.matricNo && <p className="text-sm text-heading-6">{result.matricNo}</p>}
          <dl className="mt-5 grid grid-cols-2 divide-x divide-grey-100 rounded-2xl bg-grey-10 py-3">
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-heading-6 uppercase">Room</dt>
              <dd className="text-lg font-semibold text-grey-950">{result.roomId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-heading-6 uppercase">Rent valid until</dt>
              <dd className="text-sm font-semibold text-grey-950">{formatDate(result.leaseEnd)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-heading-6">Compare the photo with the person in front of you.</p>
        </div>
      )}
      <p className="mt-auto pt-10 text-xs text-white/70">Checked by HostelHub</p>
    </div>
  );
}
