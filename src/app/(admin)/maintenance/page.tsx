"use client";

import { ArrowRight, Camera, ClipboardList, MessageCircle, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { OlderRecords } from "@/components/OlderRecords";
import { KIND, KindIcon, kindOf } from "@/components/RequestStatus";
import { toast } from "@/components/toast";
import { Avatar, Badge, BtnLabel, Button, Card, Drawer, EmptyState, Field, FilterChips, headerBtn, Input, Modal, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { addTicket, approveRoomChange, markTicketSeen, roomUnavailableReason, updateTicket, useHostel } from "@/lib/store";
import { openResident } from "@/lib/ui-store";
import type { RequestKind, Resident, Ticket, TicketCategory } from "@/lib/types";
import { formatDateTime, isOpenTicket, whatsappLink } from "@/lib/utils";

const CATEGORIES: TicketCategory[] = ["Plumbing", "Electrical", "Furniture", "Cleaning", "Security", "Other"];
const statusTone = { open: "red", in_progress: "amber", resolved: "green", declined: "slate" } as const;
const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Resolved", declined: "Declined" };

type Tab = "new" | "open" | "closed" | "all";
const isNew = (t: Ticket) => t.status === "open" && !!t.residentId && !t.seenAt;

function StatusBadge({ t }: { t: Ticket }) {
  if (isNew(t)) return <Badge tone="brand">New</Badge>;
  if (t.status === "resolved" && kindOf(t) === "room_change") return <Badge tone="green">Approved</Badge>;
  return <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>;
}

function RequestDrawer({ ticket, resident, onClose }: { ticket: Ticket; resident?: Resident; onClose: () => void }) {
  const [text, setText] = useState("");
  const open = isOpenTicket(ticket);
  const roomChange = kindOf(ticket) === "room_change";
  const unavailable = roomChange && ticket.requestedRoomId ? roomUnavailableReason(ticket.requestedRoomId, resident?.id) : null;

  const act = async (status?: Ticket["status"], message?: string) => {
    const err = await updateTicket(ticket.id, { status, text: text || message });
    if (err) return toast(err, "info");
    setText("");
    toast(status ? `Marked ${statusLabel[status].toLowerCase()}. The tenant can see it in their portal.` : "Reply sent");
  };

  const approve = async () => {
    const err = await approveRoomChange(ticket.id, text);
    if (err) return toast(err, "info");
    setText("");
    toast(`${resident?.fullName.split(" ")[0] ?? "Tenant"} moved to room ${ticket.requestedRoomId}`);
  };

  const events = [
    { at: ticket.createdAt, who: resident?.fullName.split(" ")[0] ?? "Staff", text: ticket.residentId ? "Sent the request" : "Logged by staff" },
    ...(ticket.seenAt && ticket.residentId ? [{ at: ticket.seenAt, who: "You", text: "Opened it" }] : []),
    ...(ticket.updates ?? []).map((u) => ({
      at: u.at,
      who: u.by === "staff" ? "You" : (resident?.fullName.split(" ")[0] ?? "Tenant"),
      text: [u.status && statusLabel[u.status], u.text].filter(Boolean).join(" · "),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Drawer open onClose={onClose} title={KIND[kindOf(ticket)].label}>
      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge t={ticket} />
            {kindOf(ticket) === "repair" && <Badge>{ticket.category}</Badge>}
            <span className="text-xs text-heading-6">{formatDateTime(ticket.createdAt)}</span>
          </div>
          <h2 className="text-lg leading-snug font-semibold text-grey-950">{ticket.title}</h2>
          {ticket.description && <p className="mt-2 text-sm whitespace-pre-line text-heading-4">{ticket.description}</p>}
          {ticket.photoUrl && (
            <a href={ticket.photoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- resized Storage image */}
              <img src={ticket.photoUrl} alt="Photo from tenant" className="max-h-56 rounded-xl border border-grey-100 object-cover" />
            </a>
          )}
        </div>

        {roomChange && ticket.requestedRoomId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-3 text-sm font-semibold text-amber-950">
              Room {ticket.roomId} <ArrowRight className="size-4" /> Room {ticket.requestedRoomId}
            </div>
            {open && <p className="mt-1 text-xs text-amber-800">{unavailable ?? `Room ${ticket.requestedRoomId} is still free.`}</p>}
          </div>
        )}

        {resident ? (
          <div className="flex items-center gap-3 rounded-xl border border-grey-100 p-3">
            <Avatar name={resident.fullName} src={resident.photoUrl} />
            <button onClick={() => openResident(resident.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-grey-950 hover:underline">{resident.fullName}</span>
              <span className="block text-xs text-heading-6">
                Room {resident.roomId ?? ticket.roomId} · {resident.phone}
              </span>
            </button>
            <a href={`tel:${resident.phone}`} aria-label="Call" className="flex size-9 items-center justify-center rounded-lg text-heading-5 hover:bg-grey-50">
              <Phone className="size-4" />
            </a>
            <a href={whatsappLink(resident.phone, `Hi ${resident.fullName.split(" ")[0]}, about your request "${ticket.title}": `)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex size-9 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50">
              <MessageCircle className="size-4" />
            </a>
          </div>
        ) : (
          <p className="text-sm text-heading-6">Room {ticket.roomId} · logged by staff</p>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-heading-6 uppercase">History</p>
          <ol className="space-y-2.5 border-l border-grey-100 pl-4">
            {events.map((e, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white bg-brand-600" />
                <span className="font-medium text-grey-950">{e.who}</span> <span className="text-heading-4">{e.text}</span>
                <span className="block text-xs text-heading-6">{formatDateTime(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3 border-t border-grey-100 pt-4">
          <Field label={ticket.residentId ? "Message to the tenant" : "Note"} hint={ticket.residentId ? "They see it in their portal with a notification" : undefined}>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={roomChange ? "Optional note, e.g. pick up the new key at the office" : "e.g. The plumber will come tomorrow at 10am"} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {roomChange && open ? (
              <>
                <Button variant="secondary" onClick={() => act("declined", "Sorry, we can't approve this move right now.")}>
                  Decline
                </Button>
                <Button className="flex-1" onClick={approve} disabled={!!unavailable}>
                  Approve &amp; move
                </Button>
              </>
            ) : open ? (
              <>
                {ticket.status === "open" && (
                  <Button variant="secondary" onClick={() => act("in_progress")}>
                    Start work
                  </Button>
                )}
                {kindOf(ticket) === "complaint" && (
                  <Button variant="secondary" onClick={() => act("declined", "We looked into this and are closing it.")}>
                    Close without action
                  </Button>
                )}
                <Button variant="success" className="flex-1" onClick={() => act("resolved")}>
                  Mark resolved
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => act("open", "Reopened")}>
                Reopen
              </Button>
            )}
            {text.trim() && (
              <Button variant="ghost" onClick={() => act()}>
                Send reply only
              </Button>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default function RequestsInboxPage() {
  const s = useHostel();
  const [tab, setTab] = useState<Tab>("open");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Plumbing");

  const residentsById = new Map(s.residents.map((r) => [r.id, r]));
  const inTab = (t: Ticket) => (tab === "new" ? isNew(t) : tab === "open" ? isOpenTicket(t) : tab === "closed" ? !isOpenTicket(t) : true);
  const list = s.tickets.filter((t) => inTab(t) && (kind === "all" || kindOf(t) === kind));
  const viewed = viewing ? s.tickets.find((t) => t.id === viewing) : undefined;

  const view = (t: Ticket) => {
    setViewing(t.id);
    markTicketSeen(t.id);
  };

  const create = async () => {
    if (!roomId || !title.trim()) return toast("Pick a room and describe the issue", "info");
    const err = await addTicket({ roomId, residentId: null, title: title.trim(), category });
    if (err) return toast(err, "info");
    toast("Repair logged");
    setCreating(false);
    setTitle("");
    setRoomId("");
  };

  return (
    <>
      <PageHeader
        title="Requests"
        description="Repairs, complaints and room changes from tenants. Replies show up in their portal."
        actions={
          <Button className={headerBtn} onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            <BtnLabel>Log a repair</BtnLabel>
          </Button>
        }
      />
      <div className="mb-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "new", label: "New", count: s.tickets.filter(isNew).length },
            { value: "open", label: "Open", count: s.tickets.filter(isOpenTicket).length },
            { value: "closed", label: "Closed", count: s.tickets.filter((t) => !isOpenTicket(t)).length },
            { value: "all", label: "All", count: s.tickets.length },
          ]}
        />
      </div>
      <div className="mb-4">
        <FilterChips
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All types" },
            { value: "repair", label: "Repairs" },
            { value: "complaint", label: "Complaints" },
            { value: "room_change", label: "Room changes" },
          ]}
        />
      </div>

      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-6" />} title="Nothing here" description="Requests tenants send from their portal appear here instantly." />
        ) : (
          <ul className="divide-y divide-grey-100">
            {list.map((t) => {
              const r = t.residentId ? residentsById.get(t.residentId) : undefined;
              return (
                <li key={t.id}>
                  <button onClick={() => view(t)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-grey-10 sm:px-5">
                    <KindIcon ticket={t} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={isNew(t) ? "truncate font-semibold text-grey-950" : "truncate font-medium text-grey-950"}>{t.title}</span>
                        {t.photoUrl && <Camera className="size-3.5 shrink-0 text-heading-6" aria-label="Has photo" />}
                      </span>
                      <span className="block truncate text-xs text-heading-6">
                        Room {t.roomId}
                        {r ? ` · ${r.fullName}` : " · staff"} · {formatDateTime(t.createdAt)}
                      </span>
                    </span>
                    <StatusBadge t={t} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {(tab === "closed" || tab === "all") && <OlderRecords name="tickets" what="requests" />}
      </Card>

      {viewed && <RequestDrawer ticket={viewed} resident={viewed.residentId ? residentsById.get(viewed.residentId) : undefined} onClose={() => setViewing(null)} />}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Log a repair"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Log repair</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room" required>
              <Select searchable searchPlaceholder="Search rooms…" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">Select room</option>
                {s.rooms.map((r) => (
                  <option key={r.id}>{r.id}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What's wrong?" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ceiling fan not working" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
