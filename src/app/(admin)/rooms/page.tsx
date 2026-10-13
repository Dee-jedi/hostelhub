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

const statusStyle = {
  active: { bar: "bg-emerald-500", label: "Paid" },
  expiring: { bar: "bg-amber-400", label: "Expiring" },
  expired: { bar: "bg-rose-500", label: "Expired" },
} as const;

function RoomTile({ room, tenant, onClick }: { room: Room; tenant?: Resident; onClick: () => void }) {
  const status = tenant ? rentStatus(tenant) : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex min-h-[92px] flex-col overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
        room.underMaintenance ? "border-dashed border-grey-150 bg-grey-50" : tenant ? "border-grey-100 bg-white" : "border-dashed border-sky-200 bg-sky-50/50",
      )}
    >
      {status && <span className={cn("absolute inset-y-2.5 left-0 w-[3px] rounded-r-full", statusStyle[status].bar)} />}
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-medium text-heading-2">{room.id}</span>
        {room.underMaintenance ? (
          <Hammer className="size-3.5 text-heading-6" />
        ) : tenant ? (
          <span className="flex items-center gap-0.5 text-[11px] text-heading-6" title={`${peopleInRoom(tenant)} people in this room`}>
            <Users className="size-3" />
            {peopleInRoom(tenant)}
          </span>
        ) : null}
      </div>
      <div className="mt-auto pt-2">
        {room.underMaintenance ? (
          <span className="text-[11px] text-heading-6">Maintenance</span>
        ) : tenant ? (
          <>
            <p className="truncate text-xs text-heading-4">{tenant.fullName}</p>
            <p className={cn("text-[11px]", status === "expired" ? "text-rose-600" : status === "expiring" ? "text-amber-700" : "text-heading-6")}>
              {status === "active" ? "Paid" : describeDaysLeft(daysLeft(tenant))}
            </p>
          </>
        ) : (
          <span className="text-[11px] font-medium text-sky-700">Vacant</span>
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

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-heading-5">
        <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full bg-emerald-500" /> Rent paid</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full bg-amber-400" /> Expiring ≤30 days</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full bg-rose-500" /> Expired</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-dashed border-sky-300 bg-sky-50" /> Vacant</span>
        <span className="flex items-center gap-1.5"><Users className="size-3" /> People in room</span>
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
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
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
