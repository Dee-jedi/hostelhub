"use client";

import { Check, Hammer, Phone, Ruler, UserPlus, Users, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { toast } from "@/components/toast";
import { Avatar, Button, Field, Input, Modal, PageHeader, Panel, RentBadge, Select, Tabs } from "@/components/ui";
import type { RoomType } from "@/lib/model";
import { bedOf, spaceIdsOf } from "@/lib/spaces";
import { setRoomMaintenance, setRoomsType, useHostel } from "@/lib/store";
import type { Resident, RentStatus, Room } from "@/lib/types";
import { openResident, openRoom, useUI } from "@/lib/ui-store";
import { academicLine, cn, describeDaysLeft, daysLeft, isPerBed, naira, occupantsByRoom, peopleInRoom, rentStatus, roomTypeOf } from "@/lib/utils";

type Filter = "all" | "occupied" | "full" | "vacant" | "empty" | "expiring" | "expired" | "maintenance";

type TileState = "active" | "expiring" | "expired" | "vacant" | "partial" | "maintenance";

const pill: Record<TileState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring: "bg-amber-50 text-amber-700",
  expired: "bg-rose-50 text-rose-700",
  vacant: "bg-sky-50 text-sky-700",
  partial: "bg-sky-50 text-sky-700",
  maintenance: "bg-grey-100 text-heading-5",
};
const dot: Record<TileState, string> = {
  active: "bg-emerald-500",
  expiring: "bg-amber-400",
  expired: "bg-rose-500",
  vacant: "bg-sky-400",
  partial: "bg-sky-400",
  maintenance: "bg-grey-400",
};
const bedDot: Record<RentStatus, string> = { active: "bg-emerald-500", expiring: "bg-amber-400", expired: "bg-rose-500" };

function StatusPill({ state, children }: { state: TileState; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap", pill[state])}>
      <span className={cn("size-1.5 rounded-full", dot[state])} />
      {children}
    </span>
  );
}

/** Who is in each bed of a per-bed room (null for a free bed), in bed order. */
function beds(room: Room, type: RoomType, occupants: Resident[]) {
  return spaceIdsOf(room.id, type).map((spaceId) => ({ spaceId, bed: bedOf(spaceId, room.id)!, tenant: occupants.find((o) => o.spaceId === spaceId) ?? null }));
}

/** The most urgent rent status among a room's tenants: expired, then expiring, then paid. */
function worst(occupants: Resident[]): RentStatus | null {
  const statuses = occupants.map((o) => rentStatus(o));
  return statuses.includes("expired") ? "expired" : statuses.includes("expiring") ? "expiring" : statuses.length ? "active" : null;
}

function RoomTile({
  room,
  type,
  occupants,
  onClick,
  selecting,
  selected,
}: {
  room: Room;
  type: RoomType;
  occupants: Resident[];
  onClick: () => void;
  selecting: boolean;
  selected: boolean;
}) {
  const perBed = type.pricingMode === "per_bed";
  const tenant = occupants[0];
  const status = worst(occupants);
  const bedList = perBed ? beds(room, type, occupants) : [];
  const free = bedList.filter((b) => !b.tenant).length;
  const state: TileState = room.underMaintenance
    ? "maintenance"
    : perBed
      ? status === "expired" || status === "expiring"
        ? status
        : free === bedList.length
          ? "vacant"
          : free > 0
            ? "partial"
            : "active"
      : tenant
        ? rentStatus(tenant)
        : "vacant";
  const left = tenant ? daysLeft(tenant) : 0;
  const label =
    state === "maintenance"
      ? "Repair"
      : state === "vacant"
        ? "Available"
        : state === "partial"
          ? `${free} free`
          : state === "expired"
            ? "Expired"
            : state === "expiring"
              ? perBed ? "Expiring" : `${left}d left`
              : perBed ? "Full" : "Paid";
  const people = peopleInRoom(tenant);
  return (
    <button
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      title={!perBed && tenant ? `${tenant.fullName} · ${describeDaysLeft(left)}` : undefined}
      className={cn(
        "relative flex min-h-24 flex-col rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-grey-150 hover:shadow-soft",
        state === "vacant" ? "border-dashed border-grey-150 bg-white" : state === "maintenance" ? "border-grey-100 bg-grey-10" : "border-grey-100 bg-white",
        selecting && selected && "border-brand-500 ring-2 ring-brand-500/30",
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-heading-2">
          {selecting && (
            <span className={cn("flex size-4 items-center justify-center rounded border", selected ? "border-brand-600 bg-brand-600 text-white" : "border-grey-200 bg-white")}>
              {selected && <Check className="size-3" strokeWidth={3} />}
            </span>
          )}
          {room.id}
        </span>
        <StatusPill state={state}>{label}</StatusPill>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        {state === "maintenance" ? (
          <p className="flex items-center gap-1 text-xs text-heading-6">
            <Hammer className="size-3 shrink-0" />
            <span className="truncate">{room.note ?? "Under repair"}</span>
          </p>
        ) : perBed ? (
          <>
            <span className="flex gap-1" aria-label={`${bedList.length - free} of ${bedList.length} beds taken`}>
              {bedList.map((b) => (
                <span key={b.bed} className={cn("size-2.5 rounded-full", b.tenant ? bedDot[rentStatus(b.tenant)] : "border border-grey-200 bg-white")} />
              ))}
            </span>
            <p className="mt-1 text-[11px] text-heading-6">
              {bedList.length - free} of {bedList.length} beds
            </p>
          </>
        ) : tenant ? (
          <>
            <p className="truncate text-xs font-medium text-heading-4">{tenant.fullName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-heading-6">
              <Users className="size-3" />
              {people} {people === 1 ? "person" : "people"}
            </p>
          </>
        ) : (
          <p className="text-xs text-heading-6">Vacant</p>
        )}
      </div>
    </button>
  );
}

function TenantRow({ tenant, onOpen, bed }: { tenant: Resident; onOpen: () => void; bed?: string }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border border-grey-100 p-3 text-left hover:bg-grey-10">
      {bed && <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-grey-50 text-xs font-semibold text-heading-5">{bed}</span>}
      <Avatar name={tenant.fullName} src={tenant.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading-2">{tenant.fullName}</p>
        <p className="truncate text-xs text-heading-6">
          {academicLine(tenant)} · {tenant.phone}
        </p>
      </div>
      <RentBadge resident={tenant} showDays />
    </button>
  );
}

export default function RoomsPage() {
  const s = useHostel();
  const occupants = useMemo(() => occupantsByRoom(s), [s]);
  const perBed = isPerBed(s);
  const types = s.roomTypes ?? [];
  const [block, setBlock] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const { roomId: open } = useUI();
  useEffect(() => () => openRoom(null), []);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sizeTo, setSizeTo] = useState("");
  const [applying, setApplying] = useState(false);

  const typeOf = (r: Room) => roomTypeOf(s, r);
  const freeIn = (r: Room) => {
    if (r.underMaintenance) return 0;
    const t = typeOf(r);
    const taken = (occupants.get(r.id) ?? []).length;
    return t.pricingMode === "per_bed" ? Math.max(0, t.capacity - taken) : taken ? 0 : 1;
  };
  const inFilter = (r: Room, f: Filter) => {
    const people = occupants.get(r.id) ?? [];
    if (f === "all") return true;
    if (f === "maintenance") return r.underMaintenance;
    if (f === "occupied") return people.length > 0;
    // Per-bed rooms: full = every bed taken, empty = nobody yet
    if (f === "full") return !r.underMaintenance && people.length > 0 && freeIn(r) === 0;
    if (f === "empty") return !r.underMaintenance && people.length === 0;
    if (f === "vacant") return freeIn(r) > 0;
    return people.some((p) => rentStatus(p) === f);
  };
  const count = (f: Filter) => s.rooms.filter((r) => inFilter(r, f)).length;

  const blocks = s.settings.blocks.filter((b) => block === "all" || b.name === block);
  const room = s.rooms.find((r) => r.id === open);
  const roomType = room ? typeOf(room) : null;
  const inRoom = room ? (occupants.get(room.id) ?? []) : [];
  const tenant = inRoom[0];

  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const applySize = async () => {
    if (!sizeTo || !picked.size) return;
    setApplying(true);
    const err = await setRoomsType([...picked], sizeTo);
    setApplying(false);
    if (err) return toast(err, "info");
    const name = types.find((t) => t.id === sizeTo)?.name ?? "the new size";
    toast(`${picked.size} room${picked.size === 1 ? "" : "s"} set to ${name}`);
    stopSelecting();
  };

  const sizes = types.length > 1 ? `${types.length} room sizes` : `up to ${types[0]?.capacity ?? s.settings.maxOccupants} people per room`;
  const description = `${s.rooms.length} rooms across ${s.settings.blocks.length} blocks · ${perBed ? `${sizes}, rented by the bed` : `one tenant per room, ${sizes}`}`;

  return (
    <>
      <PageHeader
        title="Rooms"
        description={description}
        actions={
          types.length > 0 &&
          (selecting ? (
            <Button variant="secondary" onClick={stopSelecting}>
              <X className="size-4" /> Done
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setSelecting(true)}>
              <Ruler className="size-4" /> Set sizes
            </Button>
          ))
        }
      />

      {selecting && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/90 p-3 backdrop-blur">
          <p className="mr-auto text-sm text-heading-3">
            {picked.size ? (
              <>
                <span className="font-semibold">{picked.size}</span> room{picked.size === 1 ? "" : "s"} selected
              </>
            ) : (
              "Tap rooms to select them, or select a whole block"
            )}
          </p>
          <Select value={sizeTo} onChange={(e) => setSizeTo(e.target.value)} wrapperClassName="w-full sm:w-56" className="h-9 py-1.5 text-xs" aria-label="New room size">
            <option value="">Choose a size…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {naira(t.price)}/{t.pricingMode === "per_bed" ? "bed" : "room"}
              </option>
            ))}
          </Select>
          <Button onClick={applySize} disabled={!sizeTo || !picked.size || applying}>
            {applying ? "Saving…" : "Apply"}
          </Button>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: count("all") },
            ...(perBed
              ? [
                  { value: "full" as const, label: "Full", count: count("full") },
                  { value: "vacant" as const, label: "With free beds", count: count("vacant") },
                  { value: "empty" as const, label: "Empty", count: count("empty") },
                ]
              : [
                  { value: "occupied" as const, label: "Occupied", count: count("occupied") },
                  { value: "vacant" as const, label: "Vacant", count: count("vacant") },
                ]),
            { value: "expiring", label: "Expiring", count: count("expiring") },
            { value: "expired", label: "Expired", count: count("expired") },
            { value: "maintenance", label: "Maintenance", count: count("maintenance") },
          ]}
        />
        <Select value={block} onChange={(e) => setBlock(e.target.value)} wrapperClassName="w-full sm:w-48" className="h-9 py-1.5 text-xs" aria-label="Filter by block">
          <option value="all">All blocks</option>
          {s.settings.blocks.map((b) => (
            <option key={b.name} value={b.name}>
              Block {b.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-heading-5">
        <StatusPill state="active">Paid</StatusPill>
        <StatusPill state="expiring">Expiring ≤30 days</StatusPill>
        <StatusPill state="expired">Expired</StatusPill>
        <StatusPill state="vacant">{perBed ? "Free beds" : "Available"}</StatusPill>
        <StatusPill state="maintenance">Repair</StatusPill>
        {perBed && (
          <span className="flex items-center gap-1.5 text-heading-6">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            <span className="size-2.5 rounded-full border border-grey-200 bg-white" /> one dot per bed
          </span>
        )}
      </div>

      <div className="space-y-4">
        {blocks.map((b) => {
          const all = s.rooms.filter((r) => r.block === b.name);
          const rooms = all.filter((r) => inFilter(r, filter));
          if (!rooms.length) return null;
          const free = all.reduce((n, r) => n + freeIn(r), 0);
          const blockPicked = all.every((r) => picked.has(r.id));
          return (
            <Panel
              key={b.name}
              title={`Block ${b.name}`}
              action={
                selecting ? (
                  <button
                    onClick={() => setPicked((p) => (blockPicked ? new Set([...p].filter((id) => !all.some((r) => r.id === id))) : new Set([...p, ...all.map((r) => r.id)])))}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    {blockPicked ? "Unselect block" : "Select block"}
                  </button>
                ) : (
                  <span className="text-xs text-heading-6">
                    {free} {perBed ? `bed${free === 1 ? "" : "s"} free` : "vacant"}
                  </span>
                )
              }
              bodyClassName="p-3"
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {rooms.map((r) => (
                  <RoomTile
                    key={r.id}
                    room={r}
                    type={typeOf(r)}
                    occupants={occupants.get(r.id) ?? []}
                    selecting={selecting}
                    selected={picked.has(r.id)}
                    onClick={() => (selecting ? toggle(r.id) : openRoom(r.id))}
                  />
                ))}
              </div>
            </Panel>
          );
        })}
      </div>

      {room && roomType && !selecting && (
        <Modal
          open
          onClose={() => openRoom(null)}
          title={`Room ${room.id}`}
          description={`Block ${room.block} · ${roomType.name} · ${naira(roomType.price)} per ${roomType.pricingMode === "per_bed" ? "bed" : "room"}${
            room.underMaintenance ? " · Under maintenance" : roomType.pricingMode === "per_bed" ? ` · ${freeIn(room)} of ${roomType.capacity} beds free` : tenant ? ` · ${peopleInRoom(tenant)} of ${roomType.capacity} people` : " · Vacant"
          }`}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={inRoom.length > 0 && !room.underMaintenance}
                onClick={async () => {
                  const err = await setRoomMaintenance(room.id, !room.underMaintenance, note || "Under repair");
                  if (err) return toast(err, "info");
                  toast(room.underMaintenance ? `${room.id} is available again` : `${room.id} marked under maintenance`);
                  setNote("");
                }}
              >
                <Wrench className="size-4" /> {room.underMaintenance ? "End maintenance" : "Mark under maintenance"}
              </Button>
              {freeIn(room) > 0 && (
                <Button onClick={() => setAdding(room.id)}>
                  <UserPlus className="size-4" /> {roomType.pricingMode === "per_bed" ? "Add tenant to a free bed" : "Add tenant"}
                </Button>
              )}
            </>
          }
        >
          {room.underMaintenance && (
            <div className="mb-4 rounded-lg bg-grey-50 p-3 text-sm text-heading-4">
              <span className="font-medium">Under maintenance:</span> {room.note}
            </div>
          )}

          {roomType.pricingMode === "per_bed" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-heading-6">Beds</p>
              {beds(room, roomType, inRoom).map((b) =>
                b.tenant ? (
                  <TenantRow
                    key={b.bed}
                    bed={b.bed}
                    tenant={b.tenant}
                    onOpen={() => {
                      openRoom(null);
                      openResident(b.tenant!.id);
                    }}
                  />
                ) : (
                  <div key={b.bed} className="flex items-center gap-3 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-sky-700">{b.bed}</span>
                    <p className="text-sm text-heading-5">Free bed</p>
                  </div>
                ),
              )}
            </div>
          ) : tenant ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-heading-6">Tenant (pays rent)</p>
                <TenantRow
                  tenant={tenant}
                  onOpen={() => {
                    openRoom(null);
                    openResident(tenant.id);
                  }}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-heading-6">Also staying in this room</p>
                {tenant.occupants.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-grey-150 p-3 text-center text-sm text-heading-6">No other occupants recorded</p>
                ) : (
                  <ul className="space-y-2">
                    {tenant.occupants.map((o, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-xl border border-grey-100 bg-grey-10 p-3">
                        <Avatar name={o.fullName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-heading-2">{o.fullName}</p>
                          <p className="text-xs text-heading-6">{academicLine(o, true)}</p>
                        </div>
                        <a href={`tel:${o.phone}`} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
                          <Phone className="size-3" /> {o.phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            !room.underMaintenance && (
              <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-6 text-center">
                <p className="text-sm font-medium text-heading-2">This room is vacant</p>
                <p className="mt-1 text-xs text-heading-6">Add a tenant, or share the booking link so someone can book and pay for it.</p>
              </div>
            )
          )}

          {!room.underMaintenance && inRoom.length === 0 && (
            <Field label="Maintenance note (optional)" className="mt-4">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fixing ceiling fan" />
            </Field>
          )}
        </Modal>
      )}

      {adding && (
        <AddResidentModal
          presetRoomId={adding}
          onClose={() => {
            setAdding(null);
            openRoom(null);
          }}
        />
      )}
    </>
  );
}
