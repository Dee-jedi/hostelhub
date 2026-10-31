"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Camera, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { prepareImage } from "@/components/PhotoPicker";
import { KIND } from "@/components/RequestStatus";
import { RoomPicker } from "@/components/RoomPicker";
import { toast } from "@/components/toast";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { listingPath } from "@/lib/current-hostel";
import { db } from "@/lib/firebase";
import { createRequest, roomName, useTenant } from "@/lib/tenant-store";
import type { PublicBookingDoc, RequestKind, TicketCategory } from "@/lib/types";
import { cn, isBookable, isOpenTicket } from "@/lib/utils";

const REPAIR_CATEGORIES: TicketCategory[] = ["Plumbing", "Electrical", "Furniture", "Cleaning", "Security", "Other"];

const COPY: Record<RequestKind, { blurb: string; titleLabel: string; placeholder: string; detailsLabel: string; detailsHint: string }> = {
  repair: {
    blurb: "Something in your room is broken or not working.",
    titleLabel: "What's wrong?",
    placeholder: "e.g. Bathroom tap is leaking",
    detailsLabel: "More details",
    detailsHint: "Where exactly, since when, anything that helps the repair person",
  },
  complaint: {
    blurb: "Noise, cleanliness, security, a neighbour, anything bothering you.",
    titleLabel: "Subject",
    placeholder: "e.g. Loud music from room B7 every night",
    detailsLabel: "Tell us what's happening",
    detailsHint: "Management will treat it confidentially",
  },
  room_change: {
    blurb: "Pick a free room you'd like to move to. The manager approves it.",
    titleLabel: "",
    placeholder: "",
    detailsLabel: "Why do you want to move?",
    detailsHint: "e.g. closer to a friend, quieter side, ground floor",
  },
};

function PhotoAttach({ value, onChange }: { value: { blob: Blob; url: string } | null; onChange: (v: { blob: Blob; url: string } | null) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  return value ? (
    <div className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
      <img src={value.url} alt="Attached photo" className="h-32 rounded-xl border border-grey-100 object-cover" />
      <button
        type="button"
        onClick={() => {
          URL.revokeObjectURL(value.url);
          onChange(null);
        }}
        aria-label="Remove photo"
        className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-grey-950 text-white shadow"
      >
        <X className="size-4" />
      </button>
    </div>
  ) : (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-grey-150 p-3 text-sm text-heading-5 hover:border-brand-300 hover:bg-brand-50/40">
      <span className="flex size-9 items-center justify-center rounded-lg bg-grey-50 text-heading-4">
        {busy ? <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> : <Camera className="size-4.5" />}
      </span>
      <span>
        <span className="block font-medium text-heading-3">Add a photo</span>
        <span className="block text-xs text-heading-6">Optional, but it helps a lot</span>
      </span>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const blob = await prepareImage(file);
            onChange({ blob, url: URL.createObjectURL(blob) });
          } catch {
            toast("Couldn't read that photo. Try a JPG or PNG.", "info");
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

export default function NewRequestPage() {
  const router = useRouter();
  const t = useTenant();
  const r = t.resident!;
  // This page only renders in the browser (inside the portal shell), so the URL can be read directly
  const [kind, setKind] = useState<RequestKind>(() => {
    const k = new URLSearchParams(window.location.search).get("kind");
    return k === "complaint" || k === "room_change" ? k : "repair";
  });
  const [category, setCategory] = useState<TicketCategory>("Plumbing");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [roomId, setRoomId] = useState("");
  const [pub, setPub] = useState<PublicBookingDoc | null>(null);
  const [now, setNow] = useState(0);
  const [sending, setSending] = useState(false);
  const pendingMove = t.requests.find((q) => q.kind === "room_change" && isOpenTicket(q));

  // Room changes need live availability: one document, one read per change
  useEffect(() => {
    if (kind !== "room_change") return;
    return onSnapshot(doc(db, listingPath()), (snap) => {
      setPub(snap.data() as PublicBookingDoc);
      setNow(Date.now());
    });
  }, [kind]);

  const submit = async () => {
    if (kind === "room_change") {
      if (pendingMove) return toast("You already have a room change waiting for the manager", "info");
      if (!roomId) return toast("Pick the room you'd like to move to", "info");
      if (pub && !isBookable(pub, roomId, Date.now())) return toast(`Room ${roomId} was just taken. Pick another.`, "info");
      if (!details.trim()) return toast("Tell the manager why you want to move", "info");
    } else {
      if (title.trim().length < 4) return toast(kind === "repair" ? "Say briefly what's wrong" : "Add a short subject", "info");
      if (kind === "complaint" && !details.trim()) return toast("Tell us a bit more about the complaint", "info");
    }
    setSending(true);
    try {
      const id = await createRequest({
        kind,
        title: kind === "room_change" ? `Move from ${roomName(t, r.roomId)} to ${roomName(t, roomId)}` : title,
        category: kind === "repair" ? category : "Other",
        description: details,
        photo: kind === "room_change" ? null : photo?.blob,
        requestedRoomId: kind === "room_change" ? roomId : undefined,
      });
      toast("Request sent. You'll be notified when there's an update.");
      router.replace(`/portal/requests/${id}`);
    } catch (err) {
      console.error(err);
      toast("Couldn't send your request. Check your connection and try again.", "info");
      setSending(false);
    }
  };

  const copy = COPY[kind];

  return (
    <div>
      <Link href="/portal/requests" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-heading-5 hover:text-heading-2">
        <ArrowLeft className="size-4" /> Requests
      </Link>
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-grey-950">New request</h1>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(Object.keys(KIND) as RequestKind[]).map((k) => {
          const { label, icon: Icon, tint } = KIND[k];
          const on = k === kind;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={on}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border bg-white px-2 py-3 text-xs font-medium transition-all",
                on ? "border-brand-500 text-brand-800 ring-3 ring-brand-100" : "border-grey-100 text-heading-4 hover:border-grey-150",
              )}
            >
              <span className={cn("flex size-9 items-center justify-center rounded-xl", tint)}>
                <Icon className="size-4.5" strokeWidth={1.8} />
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <section className="space-y-5 rounded-2xl border border-grey-100 bg-white p-4 sm:p-5">
        <p className="text-sm text-heading-6">{copy.blurb}</p>

        {kind === "repair" && (
          <div>
            <p className="mb-2 text-xs font-medium text-heading-4">Type of problem</p>
            <div className="flex flex-wrap gap-1.5">
              {REPAIR_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    c === category ? "border-brand-500 bg-brand-50 text-brand-800" : "border-grey-150 text-heading-5 hover:bg-grey-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind !== "room_change" && (
          <Field label={copy.titleLabel} required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={copy.placeholder} maxLength={90} />
          </Field>
        )}

        {kind === "room_change" &&
          (pendingMove ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              You already asked to move ({pendingMove.title}). Wait for the manager&apos;s answer before asking again.{" "}
              <Link href={`/portal/requests/${pendingMove.id}`} className="font-medium underline">
                View it
              </Link>
            </p>
          ) : pub ? (
            <div>
              <p className="mb-2 text-xs font-medium text-heading-4">
                You&apos;re in room <span className="font-semibold text-grey-950">{roomName(t, r.roomId)}</span>. Pick the room you want:
              </p>
              <RoomPicker doc={pub} now={now} value={roomId} onChange={setRoomId} />
            </div>
          ) : (
            <p className="text-sm text-heading-6">Loading rooms…</p>
          ))}

        <Field label={copy.detailsLabel} required={kind !== "repair"} hint={copy.detailsHint}>
          <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        </Field>

        {kind !== "room_change" && <PhotoAttach value={photo} onChange={setPhoto} />}

        <Button className="h-12 w-full rounded-xl text-[15px]" onClick={submit} disabled={sending || (kind === "room_change" && !!pendingMove)}>
          <Send className="size-4" /> {sending ? "Sending…" : "Send request"}
        </Button>
      </section>
    </div>
  );
}
