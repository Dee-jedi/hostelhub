"use client";

import { ArrowLeft, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { bedOf } from "@/lib/spaces";
import { useTenant } from "@/lib/tenant-store";
import { academicLine, daysLeft, formatDate, initials } from "@/lib/utils";

export default function TenantIdPage() {
  const t = useTenant();
  const r = t.resident!;
  const [qr, setQr] = useState("");
  const current = daysLeft(r) >= 0;

  // The QR holds a signed link; the signature can only be made on the server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/id/token", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!cancelled && data.token) setQr(`${window.location.origin}/verify?t=${encodeURIComponent(data.token)}`);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-sm">
      <Link href="/portal" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-heading-5 hover:text-heading-2">
        <ArrowLeft className="size-4" /> Home
      </Link>

      <article className="overflow-hidden rounded-[28px] bg-white shadow-[0_20px_50px_-20px_rgba(16,16,16,0.35)] ring-1 ring-grey-100">
        <header className="relative overflow-hidden bg-brand-900 px-5 pt-5 pb-14 text-white">
          <div className="pointer-events-none absolute -top-12 -right-10 size-44 rounded-full bg-brand-500/30 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <span className="text-sm font-semibold">{t.info?.hostelName}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] ring-1 ring-white/15">TENANT ID</span>
          </div>
        </header>

        <div className="relative -mt-11 px-5 pb-5 text-center">
          <div className="mx-auto w-fit rounded-3xl bg-white p-1.5 shadow-sm">
            {r.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small Storage image
              <img src={r.photoUrl} alt={r.fullName} className="size-24 rounded-[20px] object-cover" />
            ) : (
              <span className="flex size-24 items-center justify-center rounded-[20px] bg-brand-50 text-3xl font-semibold text-brand-700">{initials(r.fullName)}</span>
            )}
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-grey-950">{r.fullName}</h1>
          <p className="text-sm text-heading-6">{academicLine(r)}</p>

          <dl className="mt-4 grid grid-cols-3 divide-x divide-grey-100 rounded-2xl bg-grey-10 py-3 text-center">
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-heading-6 uppercase">{bedOf(r.spaceId, r.roomId) ? "Room · bed" : "Room"}</dt>
              <dd className="text-base font-semibold text-grey-950">
                {r.roomId}
                {bedOf(r.spaceId, r.roomId) ? ` · ${bedOf(r.spaceId, r.roomId)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-heading-6 uppercase">{r.isStudent === false ? "Since" : "Matric"}</dt>
              <dd className="truncate px-1 text-sm font-semibold text-grey-950">{r.isStudent === false ? formatDate(r.checkInDate) : r.matricNo || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-heading-6 uppercase">Valid until</dt>
              <dd className="text-sm font-semibold text-grey-950">{formatDate(r.leaseEnd)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col items-center">
            <div className="rounded-2xl border border-grey-100 bg-white p-3">
              {qr ? <QRCodeSVG value={qr} size={168} level="M" /> : <div className="size-[168px] animate-pulse rounded-lg bg-grey-50" />}
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-heading-5">
              <ShieldCheck className="size-3.5 text-brand-600" /> Security scans this to confirm you live here
            </p>
          </div>

          <div className={current ? "mt-4 rounded-xl bg-emerald-50 py-2 text-sm font-semibold text-emerald-700" : "mt-4 rounded-xl bg-rose-50 py-2 text-sm font-semibold text-rose-700"}>
            {current ? "Active tenant" : "Rent expired: renew to keep your ID valid"}
          </div>
        </div>
      </article>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-heading-6">
        <Sun className="size-3.5" /> Turn your screen brightness up if the scanner struggles.
      </p>
    </div>
  );
}
