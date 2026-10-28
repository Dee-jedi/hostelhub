"use client";

import { BedDouble, BedSingle, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { RoomType } from "@/lib/model";
import { MAX_CAPACITY } from "@/lib/spaces";
import { deleteRoomType, saveRoomType, setRentalModel, useHostel } from "@/lib/store";
import { activeResidents, cn, naira } from "@/lib/utils";
import { toast } from "./toast";
import { Button, Field, Input, Modal, Panel, Select } from "./ui";

type Draft = { id?: string; name: string; capacity: number; price: string };

const nameFor = (capacity: number) => (capacity === 1 ? "Single room" : `${capacity}-person room`);

/**
 * Settings › Room types: the room sizes this hostel has and what each costs, plus whether it
 * rents whole rooms or single beds. Rooms get their size on the Rooms page ("Set size").
 */
export function RoomTypesPanel() {
  const s = useHostel();
  const perBed = s.rentalModel === "per_bed";
  const types = s.roomTypes ?? [];
  const roomsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of s.rooms) if (r.typeId) m.set(r.typeId, (m.get(r.typeId) ?? 0) + 1);
    return m;
  }, [s.rooms]);
  const someoneLivesHere = activeResidents(s).length > 0;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<RoomType | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft) return;
    const price = Number(draft.price.replace(/\D/g, ""));
    setBusy(true);
    const err = await saveRoomType({ id: draft.id, name: draft.name, capacity: draft.capacity, price });
    setBusy(false);
    if (err) return toast(err, "info");
    toast(draft.id ? "Room type updated" : "Room type added");
    setDraft(null);
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const err = await deleteRoomType(deleting.id);
    setBusy(false);
    if (err) return toast(err, "info");
    toast(`${deleting.name} removed`);
    setDeleting(null);
  };

  const switchModel = async (model: "per_room" | "per_bed") => {
    if ((model === "per_bed") === perBed) return;
    const err = await setRentalModel(model);
    toast(err ?? (model === "per_bed" ? "Now renting by the bed" : "Now renting whole rooms"), err ? "info" : "success");
  };

  return (
    <Panel
      className="lg:col-span-2"
      title="Room types"
      description="The room sizes you have and what each one costs. Give rooms their size on the Rooms page."
      action={
        <Button size="sm" onClick={() => setDraft({ name: nameFor(2), capacity: 2, price: "" })}>
          <Plus className="size-3.5" /> Add room type
        </Button>
      }
    >
      <div className="border-b border-grey-100 p-5">
        <p className="mb-2 text-xs font-medium text-heading-6">How you charge</p>
        <div className="grid max-w-md grid-cols-2 gap-1 rounded-xl border border-grey-100 bg-grey-10 p-1" role="radiogroup" aria-label="How you charge">
          {(
            [
              ["per_room", "Per room", "One tenant pays; others share", BedDouble],
              ["per_bed", "Per bed", "Everyone pays for their own bed", BedSingle],
            ] as const
          ).map(([value, label, hint, Icon]) => {
            const on = (value === "per_bed") === perBed;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={on}
                disabled={!on && someoneLivesHere}
                onClick={() => switchModel(value)}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  on ? "bg-white shadow-sm" : "hover:bg-white/60",
                )}
              >
                <Icon className={cn("mt-0.5 size-4", on ? "text-brand-600" : "text-heading-6")} />
                <span>
                  <span className={cn("block text-sm font-medium", on ? "text-grey-950" : "text-heading-5")}>{label}</span>
                  <span className="block text-xs text-heading-6">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {someoneLivesHere && <p className="mt-2 text-xs text-heading-6">You can switch only before tenants move in.</p>}
      </div>

      {types.length === 0 ? (
        <p className="p-5 text-sm text-heading-6">No room types yet. Add one to start.</p>
      ) : (
        <ul className="divide-y divide-grey-100">
          {types.map((t) => {
            const rooms = roomsOf.get(t.id) ?? 0;
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">{t.capacity}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-grey-950">{t.name}</p>
                  <p className="text-xs text-heading-6">
                    {t.capacity} {t.capacity === 1 ? "person" : "people"} · {rooms} room{rooms === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-right text-sm font-medium text-grey-950 tabular-nums">
                  {naira(t.price)}
                  <span className="block text-xs font-normal text-heading-6">per {t.pricingMode === "per_bed" ? "bed" : "room"}</span>
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setDraft({ id: t.id, name: t.name, capacity: t.capacity, price: String(t.price) })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${t.name}`} className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(t)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit room type" : "Add a room type"}
        description={perBed ? "Each bed is rented on its own at this price." : "One tenant pays this for the whole room; anyone sharing is recorded with them."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="People per room" required>
              <Select
                value={String(draft.capacity)}
                onChange={(e) => {
                  const capacity = Number(e.target.value);
                  // Keep a custom name; refresh the suggested one
                  setDraft({ ...draft, capacity, name: draft.name === nameFor(draft.capacity) ? nameFor(capacity) : draft.name });
                }}
              >
                {Array.from({ length: MAX_CAPACITY }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "person" : "people"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Rent per ${perBed ? "bed" : "room"} (₦)`} required hint={Number(draft.price) ? `${naira(Number(draft.price))} per session` : "What a student pays per session"}>
              <Input inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 350000" />
            </Field>
            <Field label="Name" required className="sm:col-span-2" hint="What students and staff see, e.g. “2-person room” or “Self-contain”">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name ?? "room type"}?`}
        description="Only room types no room uses can be removed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-heading-5">Students won&apos;t see this option any more. Existing payments keep their amounts.</p>
      </Modal>
    </Panel>
  );
}
