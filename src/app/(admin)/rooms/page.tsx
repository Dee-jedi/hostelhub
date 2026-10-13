"use client";

import { Hammer, Phone, UserPlus, Users, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { toast } from "@/components/toast";
import { Avatar, Button, Field, Input, Modal, PageHeader, Panel, RentBadge, Select, Tabs } from "@/components/ui";
import { setRoomMaintenance, useHostel } from "@/lib/store";
import type { Resident, Room } from "@/lib/types";
import { openResident, openRoom, useUI } from "@/lib/ui-store";
import { cn, describeDaysLeft, daysLeft, peopleInRoom, rentStatus, tenantsByRoom } from "@/lib/utils";

type Filter = "all" | "occupied" | "vacant" | "expiring" | "expired" | "maintenance";

type TileState = "active" | "expiring" | "expired" | "vacant" | "maintenance";

const pill: Record<TileState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring: "bg-amber-50 text-amber-700",
  expired: "bg-rose-50 text-rose-700",
  vacant: "bg-sky-50 text-sky-700",
  maintenance: "bg-grey-100 text-heading-5",
};
const dot: Record<TileState, string> = {
  active: "bg-emerald-500",
  expiring: "bg-amber-400",
  expired: "bg-rose-500",
  vacant: "bg-sky-400",
  maintenance: "bg-grey-400",
};

function StatusPill({ state, children }: { state: TileState; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap", pill[state])}>
      <span className={cn("size-1.5 rounded-full", dot[state])} />
      {children}
    </span>
  );
}

function RoomTile({ room, tenant, onClick }: { room: Room; tenant?: Resident; onClick: () => void }) {
  const state: TileState = room.underMaintenance ? "maintenance" : tenant ? rentStatus(tenant) : "vacant";
  const left = tenant ? daysLeft(tenant) : 0;
  const label =
    state === "active" ? "Paid" : state === "expiring" ? `${left}d left` : state === "expired" ? "Expired" : state === "vacant" ? "Available" : "Repair";
  const people = peopleInRoom(tenant);
  return (
    <button
      onClick={onClick}
      title={tenant ? `${tenant.fullName} · ${describeDaysLeft(left)}` : undefined}
      className={cn(
        "flex min-h-24 flex-col rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-grey-150 hover:shadow-soft",
        state === "vacant" ? "border-dashed border-grey-150 bg-white" : state === "maintenance" ? "border-grey-100 bg-grey-10" : "border-grey-100 bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-sm font-medium text-heading-2">{room.id}</span>
        <StatusPill state={state}>{label}</StatusPill>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        {tenant ? (
          <>
            <p className="truncate text-xs font-medium text-heading-4">{tenant.fullName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-heading-6">
              <Users className="size-3" />
              {people} {people === 1 ? "person" : "people"}
            </p>
          </>
        ) : state === "maintenance" ? (
          <p className="flex items-center gap-1 text-xs text-heading-6">
            <Hammer className="size-3 shrink-0" />
            <span className="truncate">{room.note ?? "Under repair"}</span>
          </p>
        ) : (
          <p className="text-xs text-heading-6">Vacant</p>
        )}
      </div>
    </button>
  );
}

export default function RoomsPage() {
  const s = useHostel();
  const tenants = useMemo(() => tenantsByRoom(s), [s]);
  const [block, setBlock] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const { roomId: selected } = useUI();
  useEffect(() => () => openRoom(null), []);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const inFilter = (r: Room, f: Filter) => {
    const t = tenants.get(r.id);
    if (f === "all") return true;
    if (f === "maintenance") return r.underMaintenance;
    if (f === "occupied") return !!t;
    if (f === "vacant") return !t && !r.underMaintenance;
    return !!t && rentStatus(t) === f;
  };
  const count = (f: Filter) => s.rooms.filter((r) => inFilter(r, f)).length;

  const blocks = s.settings.blocks.filter((b) => block === "all" || b.name === block);
  const room = s.rooms.find((r) => r.id === selected);
  const tenant = room ? tenants.get(room.id) : undefined;

  return (
    <>
      <PageHeader
        title="Rooms"
        description={`${s.rooms.length} rooms across ${s.settings.blocks.length} blocks · one tenant per room, up to ${s.settings.maxOccupants} people`}
      />

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: count("all") },
            { value: "occupied", label: "Occupied", count: count("occupied") },
            { value: "vacant", label: "Vacant", count: count("vacant") },
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
        <StatusPill state="vacant">Available</StatusPill>
        <StatusPill state="maintenance">Repair</StatusPill>
      </div>

      <div className="space-y-4">
        {blocks.map((b) => {
          const rooms = s.rooms.filter((r) => r.block === b.name && inFilter(r, filter));
          if (!rooms.length) return null;
          const vacant = s.rooms.filter((r) => r.block === b.name && !r.underMaintenance && !tenants.has(r.id)).length;
          return (
            <Panel
              key={b.name}
              title={`Block ${b.name}`}
              action={<span className="text-xs text-heading-6">{vacant} vacant</span>}
              bodyClassName="p-3"
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {rooms.map((r) => (
                  <RoomTile key={r.id} room={r} tenant={tenants.get(r.id)} onClick={() => openRoom(r.id)} />
                ))}
              </div>
            </Panel>
          );
        })}
      </div>

      {room && (
        <Modal
          open
          onClose={() => openRoom(null)}
          title={`Room ${room.id}`}
          description={`Block ${room.block} · ${room.underMaintenance ? "Under maintenance" : tenant ? `${peopleInRoom(tenant)} of ${s.settings.maxOccupants} people` : "Vacant"}`}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={!!tenant && !room.underMaintenance}
                onClick={() => {
                  setRoomMaintenance(room.id, !room.underMaintenance, note || "Under repair");
                  toast(room.underMaintenance ? `${room.id} is available again` : `${room.id} marked under maintenance`);
                  setNote("");
                }}
              >
                <Wrench className="size-4" /> {room.underMaintenance ? "End maintenance" : "Mark under maintenance"}
              </Button>
              {!tenant && (
                <Button disabled={room.underMaintenance} onClick={() => setAdding(room.id)}>
                  <UserPlus className="size-4" /> Add tenant
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

          {tenant ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-heading-6">Tenant (pays rent)</p>
                <button
                  onClick={() => {
                    openRoom(null);
                    openResident(tenant.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-grey-100 p-3 text-left hover:bg-grey-10"
                >
                  <Avatar name={tenant.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-heading-2">{tenant.fullName}</p>
                    <p className="text-xs text-heading-6">
                      {tenant.department} · {tenant.level}L · {tenant.phone}
                    </p>
                  </div>
                  <RentBadge resident={tenant} showDays />
                </button>
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
                          <p className="text-xs text-heading-6">
                            {[o.department, o.level && `${o.level}L`].filter(Boolean).join(" · ") || "—"}
                          </p>
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
                <p className="mt-1 text-xs text-heading-6">Add a tenant, or approve an application into it.</p>
              </div>
            )
          )}

          {!room.underMaintenance && !tenant && (
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
