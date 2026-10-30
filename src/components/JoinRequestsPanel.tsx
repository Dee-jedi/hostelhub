"use client";

import { Check, Link2, Loader2, MessageCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { JoinOverview } from "@/app/api/join/manage/route";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

/*
 * The join link, for managers: share it in the tenants' WhatsApp group, then approve each
 * tenant who adds themselves (or turn away anyone who doesn't live there). Shown in sign-up's
 * last step and on the dashboard while the link is open.
 */

type Request = JoinOverview["requests"][number];

async function manage<T>(body: object): Promise<T> {
  await auth.authStateReady();
  const res = await fetch("/api/join/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

const monthYear = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function JoinRequestsPanel({ hostelId, hostelName, hostelOrigin, onApproved, className }: { hostelId: string; hostelName: string; hostelOrigin: string; onApproved?: () => void; className?: string }) {
  const [data, setData] = useState<JoinOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (action: "overview" | "newLink" = "overview") =>
      manage<JoinOverview>({ hostelId, action }).then(
        (d) => (setData(d), setProblem(null)),
        (err: Error) => setProblem(err.message),
      ),
    [hostelId],
  );

  // Requests arrive while the manager waits: check again whenever they come back to the page
  // (only while the link is open, so closed hostels cost one call per visit, not one per focus)
  const open = data?.open;
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, load]);

  const link = data?.code ? `${hostelOrigin}/join/${data.code}` : "";
  const message = `Hello everyone 👋 ${hostelName} now uses HostelHub for our rooms, receipts and rent reminders. Please add yourself here (3 minutes, nothing to pay): ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is on screen
    }
  };

  const decide = async (q: Request, action: "approve" | "reject") => {
    setDeciding(q.uid);
    setProblem(null);
    try {
      await manage({ hostelId, action, uid: q.uid });
      setData((d) => d && { ...d, requests: d.requests.filter((x) => x.uid !== q.uid) });
      if (action === "approve") onApproved?.();
    } catch (err) {
      setProblem(`${q.info.fullName}: ${err instanceof Error ? err.message : "couldn't update."}`);
    } finally {
      setDeciding(null);
    }
  };

  if (!data) {
    return (
      <div className={className}>
        {problem ? <p className="text-sm text-rose-600">{problem}</p> : <p className="flex items-center gap-2 text-sm text-heading-6"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
      </div>
    );
  }
  if (!data.open) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-brand-950">
          <Link2 className="size-4" /> Let tenants add themselves
        </p>
        <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
          Post this link in your tenants&apos; WhatsApp group. Each one fills in their own details and room; you approve them here. Free
          {data.openUntil ? ` until ${shortDate(data.openUntil)}` : " until 30 days after you go live"}.
        </p>
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-medium break-all text-grey-950 ring-1 ring-brand-100">{link.replace(/^https?:\/\//, "")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1f7a4d] px-4 text-sm font-semibold text-white hover:bg-[#19663f]"
          >
            <MessageCircle className="size-4" /> Share on WhatsApp
          </a>
          <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100">
            {copied && <Check className="size-4" strokeWidth={3} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => void load("newLink")}
            className="ml-auto text-xs font-medium text-brand-800/70 underline-offset-4 hover:underline"
            title="Turns the old link off, if it was shared outside your hostel"
          >
            Make a new link
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-grey-950">
            Waiting for you{data.requests.length ? ` (${data.requests.length})` : ""}
          </p>
          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Check again
          </button>
        </div>
        {data.requests.length === 0 ? (
          <p className="mt-2 text-sm text-heading-6">No one yet. Tenants who use the link show up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-grey-100 rounded-2xl ring-1 ring-grey-100">
            {data.requests.map((q) => (
              <li key={q.uid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {q.info.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tenant's passport photo
                  <img src={q.info.photoUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="size-11 shrink-0 rounded-xl bg-grey-50" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-grey-950">{q.info.fullName}</p>
                  <p className="text-sm text-heading-6">
                    {q.roomLabel} · moved in {monthYear(q.movedIn)} · paid until {shortDate(q.paidUntil)}
                  </p>
                  <p className="text-xs text-heading-6">{q.info.phone}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={deciding === q.uid}
                    onClick={() => decide(q, "reject")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-heading-5 ring-1 ring-grey-150 hover:bg-grey-50 disabled:opacity-50"
                  >
                    <X className="size-4" /> Not my tenant
                  </button>
                  <button
                    type="button"
                    disabled={deciding === q.uid}
                    onClick={() => decide(q, "approve")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
                  >
                    {deciding === q.uid ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {problem && <p className="mt-2 text-sm text-rose-600">{problem}</p>}
      </div>
    </div>
  );
}
