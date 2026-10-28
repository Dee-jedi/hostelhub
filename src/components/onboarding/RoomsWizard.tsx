"use client";

import { BedDouble, Check, Info, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Phone, PHONE_SIZE, Scaled } from "@/components/site/Mockups";
import { Select } from "@/components/ui";
import { checkoutTotal } from "@/lib/fees";
import type { BlockOccupancy, PricingMode, RoomFeature } from "@/lib/model";
import {
  CLASS_PRESETS,
  classProblem,
  defaultPrefix,
  emptySetup,
  FEATURES,
  monthsText,
  newKey,
  optionLength,
  optionProblem,
  regenerateRooms,
  setupProblem,
  summarize,
  type RoomsSetup,
  type SetupBlock,
  type SetupClass,
  type SetupOption,
} from "@/lib/room-setup";
import { MAX_CAPACITY } from "@/lib/spaces";
import { auth } from "@/lib/firebase";
import { cn, naira } from "@/lib/utils";
import { big, Choice, Label, MoneyInput, NavButtons, PreviewSheet, Problem, Question, Stepper, Switch } from "./shell";

/*
 * Sign-up, part two: rooms and prices (docs/ARCHITECTURE-PLAN.md §10.8–10.14). The kinds of
 * room, how tenants pay, prices, the building, extra charges, then a review. Kept in this
 * browser as they go, and saved to the draft hostel at the end (it can be changed again later).
 */

export const ROOM_STEPS = ["classes", "options", "prices", "blocks", "charges", "review"] as const;
export type RoomStep = (typeof ROOM_STEPS)[number];

const storageKey = (hostelId: string) => `hostelhub:rooms:${hostelId}`;
const card = "rounded-3xl bg-white p-5 ring-1 ring-black/5 sm:p-6";

function load(hostelId: string): { setup: RoomsSetup; step: RoomStep } | null {
  try {
    const raw = localStorage.getItem(storageKey(hostelId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** "per bed space" / "per room" */
const perText = (pricing: PricingMode) => (pricing === "per_bed" ? "per bed space" : "per room");

// --------------------------------------------------------------------------- preview

function RoomsPreview({ setup, hostelName, place }: { setup: RoomsSetup; hostelName: string; place: string }) {
  const block = setup.blocks.find((b) => b.rooms.length) ?? null;
  const classes = new Map(setup.classes.map((c) => [c.key, c]));
  const shown = block?.rooms.slice(0, 9) ?? [];
  const picked = shown[1] ?? shown[0];
  const pickedClass = picked ? classes.get(picked.classKey) : undefined;
  const price = pickedClass?.prices[setup.defaultOptionKey] ?? 0;
  return (
    <div className="flex flex-col items-center">
      <Scaled {...PHONE_SIZE} className="[--s:0.92]">
        <Phone>
          <div className="rounded-b-[28px] bg-brand-900 px-5 pt-12 pb-6 text-white">
            <p className="text-[15px] font-semibold tracking-tight">
              hostel<span className="text-brand-300">hub</span>
            </p>
            <p className="mt-4 text-[22px] leading-tight font-semibold break-words">{hostelName}</p>
            {place && (
              <p className="mt-1.5 flex items-center gap-1 text-[12px] text-brand-100/80">
                <MapPin className="size-3.5" /> {place}
              </p>
            )}
          </div>
          <div className="px-5 pt-5">
            <p className="text-[14px] font-semibold text-grey-950">Pick your room</p>
            <p className="text-[11px] text-heading-6">{block ? `${block.name} · ${block.rooms.length} free` : "Your rooms appear here"}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {shown.length
                ? shown.map((r, i) => (
                    <span
                      key={`${r.label}-${i}`}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center rounded-xl border px-1 text-center text-[11px] leading-tight font-semibold",
                        r === picked ? "border-brand-600 bg-brand-600 text-white" : "border-brand-200 text-heading-2",
                      )}
                    >
                      <span className="max-w-full truncate">{r.label}</span>
                      <span className="text-[9px] font-normal">{r === picked ? "Your pick" : "Free"}</span>
                    </span>
                  ))
                : Array.from({ length: 9 }, (_, i) => <span key={i} className="h-12 rounded-xl border border-dashed border-grey-150 bg-grey-10" />)}
            </div>
            {pickedClass && (
              <div className="mt-4 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[11px] text-brand-900">
                {picked!.label} · {pickedClass.name}
                {price > 0 && (
                  <>
                    {" "}
                    · <b>{naira(price)}</b> {perText(pickedClass.pricing)}
                  </>
                )}
              </div>
            )}
          </div>
        </Phone>
      </Scaled>
      <p className="mt-4 text-sm text-heading-6">What tenants will see</p>
    </div>
  );
}

// --------------------------------------------------------------------------- pieces

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-10 shrink-0 items-center justify-center rounded-full text-heading-6 hover:bg-rose-50 hover:text-rose-600">
      <Trash2 className="size-4.5" />
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 text-[15px] font-semibold text-brand-800 transition-colors hover:border-brand-400 hover:bg-white"
    >
      <Plus className="size-5" /> {children}
    </button>
  );
}

function Chip({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] ring-1 transition-colors",
        active ? "bg-brand-950 text-white ring-brand-950" : "bg-white text-brand-900 ring-brand-200 hover:bg-brand-50",
      )}
    >
      {children}
    </button>
  );
}

// --------------------------------------------------------------------------- wizard

export function RoomsWizard({
  hostelId,
  hostelName,
  place,
  onBack,
  onDone,
  onProgress,
}: {
  hostelId: string;
  hostelName: string;
  place: string;
  /** Back from the first question */
  onBack: () => void;
  onDone: () => void;
  /** 0–1 through this part, for the progress bar */
  onProgress: (fraction: number) => void;
}) {
  const [setup, setSetup] = useState<RoomsSetup>(emptySetup);
  const [step, setStep] = useState<RoomStep>("classes");
  const [restored, setRestored] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // This browser's copy first; otherwise whatever was saved to the hostel (another device)
  useEffect(() => {
    const local = load(hostelId);
    if (local) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring once on mount
      setSetup(local.setup);
      setStep(local.step);
      setRestored(true);
      return;
    }
    let live = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/onboarding/rooms?hostelId=${encodeURIComponent(hostelId)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { setup?: RoomsSetup | null };
        if (live && data.setup) setSetup(data.setup);
      } catch {
        // Start fresh; nothing is lost that was saved
      } finally {
        if (live) setRestored(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [hostelId]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(storageKey(hostelId), JSON.stringify({ setup, step }));
    } catch {
      // Private browsing: fine, it just won't survive a refresh
    }
  }, [restored, hostelId, setup, step]);

  const index = ROOM_STEPS.indexOf(step);
  useEffect(() => onProgress((index + 1) / (ROOM_STEPS.length + 1)), [index, onProgress]);

  const update = (patch: Partial<RoomsSetup>) => {
    setProblem(null);
    setSetup((s) => ({ ...s, ...patch }));
  };
  const setClass = (key: string, patch: Partial<SetupClass>) => update({ classes: setup.classes.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const setOption = (key: string, patch: Partial<SetupOption>) => update({ options: setup.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) });
  const setBlock = (key: string, patch: Partial<SetupBlock>, recount?: number) =>
    update({
      blocks: setup.blocks.map((b) => {
        if (b.key !== key) return b;
        const next = { ...b, ...patch };
        return { ...next, rooms: regenerateRooms(next, recount ?? b.rooms.length, setup.classes[0]?.key ?? "") };
      }),
    });

  const go = (to: RoomStep) => {
    setProblem(null);
    // A kind of room removed after blocks were set up: its rooms fall back to the first kind
    const keys = new Set(setup.classes.map((c) => c.key));
    const first = setup.classes[0]?.key;
    if (first && setup.blocks.some((b) => (b.classKey !== "mixed" && !keys.has(b.classKey)) || b.rooms.some((r) => !keys.has(r.classKey))))
      setSetup((s) => ({
        ...s,
        blocks: s.blocks.map((b) => ({
          ...b,
          classKey: b.classKey === "mixed" || keys.has(b.classKey) ? b.classKey : first,
          rooms: b.rooms.map((r) => (keys.has(r.classKey) ? r : { ...r, classKey: first })),
        })),
      }));
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const back = () => (index === 0 ? onBack() : go(ROOM_STEPS[index - 1]));

  const next = async (e: FormEvent) => {
    e.preventDefault();
    const check: Record<RoomStep, () => string | null> = {
      classes: () => (setup.classes.length ? (setup.classes.map(classProblem).find(Boolean) ?? null) : "Pick at least one kind of room."),
      options: () => setup.options.map(optionProblem).find(Boolean) ?? (setup.options.some((o) => o.online) ? null : "Let students pick at least one way of paying online."),
      prices: () => {
        for (const c of setup.classes) for (const o of setup.options) if (!(c.prices[o.key] > 0)) return `Enter the price of "${c.name}" ${o.name.toLowerCase()}.`;
        return null;
      },
      blocks: () => {
        if (!setup.blocks.length) return "Add at least one block.";
        const p = setupProblem({ ...setup, charges: [] });
        return p && /block|room/i.test(p) ? p : null;
      },
      charges: () => setup.charges.map((c) => (!c.name.trim() ? "Give each extra charge a name." : c.amount > 0 ? null : `Enter how much "${c.name}" is.`)).find(Boolean) ?? null,
      review: () => setupProblem(setup),
    };
    const p = check[step]();
    if (p) return setProblem(p);
    if (step !== "review") return go(ROOM_STEPS[index + 1]);

    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/onboarding/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hostelId, setup }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(res.status === 401 ? "Please log in again to save." : (data.error ?? "Couldn't save. Please try again."));
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => summarize(setup), [setup]);
  const defaultOption = setup.options.find((o) => o.key === setup.defaultOptionKey) ?? setup.options[0];

  if (!restored) return null;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
      <form onSubmit={next} noValidate className="mx-auto w-full max-w-xl lg:mx-0">
        <p className="mb-4 text-sm font-medium text-brand-700">
          Question {index + 1} of {ROOM_STEPS.length}
        </p>

        {step === "classes" && (
          <Question title="What kinds of rooms do you have?" hint="Tap every kind your hostel has. Rename them the way you call them, or add your own.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {CLASS_PRESETS.map((p) => {
                const key = `preset-${p.id}`;
                const on = setup.classes.some((c) => c.key === key);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        classes: on
                          ? setup.classes.filter((c) => c.key !== key)
                          : [...setup.classes, { key, name: p.name, capacity: p.capacity, pricing: p.pricing, features: p.features, prices: {} }],
                      })
                    }
                    className={cn(
                      "relative flex min-h-24 flex-col items-start justify-between rounded-2xl p-4 text-left ring-1 transition-all",
                      on ? "bg-brand-950 text-white ring-brand-950" : "bg-white text-grey-950 ring-black/5 hover:ring-brand-300",
                    )}
                  >
                    {on && <Check className="absolute top-3 right-3 size-4 text-brand-300" strokeWidth={3} />}
                    <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      <BedDouble className={cn("size-4", on ? "text-brand-300" : "text-brand-600")} /> {p.capacity}
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold">{p.name}</span>
                      <span className={cn("block text-xs", on ? "text-brand-100/80" : "text-heading-6")}>{p.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {setup.classes.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-[15px] font-semibold text-heading-2">Your kinds of room</p>
                {setup.classes.map((c) => (
                  <div key={c.key} className={card}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={`name-${c.key}`}>Name</Label>
                        <input id={`name-${c.key}`} className={cn(big, "h-12 text-base")} value={c.name} placeholder="e.g. Executive 2-man" onChange={(e) => setClass(c.key, { name: e.target.value })} />
                      </div>
                      <RemoveButton label={`Remove ${c.name}`} onClick={() => update({ classes: setup.classes.filter((x) => x.key !== c.key) })} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>People per room</Label>
                        <Stepper
                          label={`People per room, ${c.name}`}
                          value={c.capacity}
                          min={1}
                          max={MAX_CAPACITY}
                          onChange={(capacity) => setClass(c.key, { capacity, pricing: capacity === 1 ? "per_room" : c.pricing })}
                        />
                      </div>
                      {c.capacity > 1 && (
                        <div>
                          <Label>You charge</Label>
                          <Choice
                            label={`How ${c.name} is charged`}
                            value={c.pricing}
                            onChange={(pricing) => setClass(c.key, { pricing })}
                            options={[
                              { value: "per_bed", label: "Per bed space" },
                              { value: "per_room", label: "Whole room" },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {FEATURES.map((f) => {
                        const on = c.features.includes(f.id);
                        return (
                          <Chip key={f.id} active={on} onClick={() => setClass(c.key, { features: on ? c.features.filter((x) => x !== f.id) : [...c.features, f.id as RoomFeature] })}>
                            {on && <Check className="size-3.5" strokeWidth={3} />} {f.label}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <AddButton onClick={() => update({ classes: [...setup.classes, { key: newKey("c"), name: "", capacity: 2, pricing: "per_bed", features: [], prices: {} }] })}>Add a different kind</AddButton>
          </Question>
        )}

        {step === "options" && (
          <Question title="How do tenants pay?" hint="Add every length of stay you offer. Students only see the ones you let them pick online; the rest are for tenants you add yourself.">
            {setup.options.map((o) => {
              const len = optionLength(o);
              return (
                <div key={o.key} className={card}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`opt-${o.key}`}>Name</Label>
                      <input id={`opt-${o.key}`} className={cn(big, "h-12 text-base")} value={o.name} placeholder="e.g. Per session" onChange={(e) => setOption(o.key, { name: e.target.value })} />
                    </div>
                    {setup.options.length > 1 && (
                      <RemoveButton
                        label={`Remove ${o.name}`}
                        onClick={() => {
                          const options = setup.options.filter((x) => x.key !== o.key);
                          update({ options, defaultOptionKey: setup.defaultOptionKey === o.key ? options[0].key : setup.defaultOptionKey });
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-4">
                    <Choice
                      label={`How long ${o.name} lasts`}
                      value={o.kind}
                      onChange={(kind) => setOption(o.key, kind === "rolling" ? { kind, months: o.months ?? 12 } : { kind, start: o.start ?? setup.options[0].start, end: o.end ?? setup.options[0].end })}
                      options={[
                        { value: "session", label: "Fixed dates" },
                        { value: "rolling", label: "Months from move-in" },
                      ]}
                    />
                  </div>
                  {o.kind === "session" ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`start-${o.key}`}>Starts</Label>
                        <input id={`start-${o.key}`} type="date" className={cn(big, "h-12 text-base")} value={o.start ?? ""} onChange={(e) => setOption(o.key, { start: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`end-${o.key}`}>Ends</Label>
                        <input id={`end-${o.key}`} type="date" className={cn(big, "h-12 text-base")} value={o.end ?? ""} onChange={(e) => setOption(o.key, { end: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <Stepper label={`Months, ${o.name}`} value={o.months ?? 12} min={1} max={24} onChange={(months) => setOption(o.key, { months })} suffix={(n) => (n === 1 ? "month" : "months")} />
                    </div>
                  )}
                  <p className="mt-3 text-sm text-heading-6">
                    {len > 0 ? (o.kind === "session" ? `${monthsText(len)}. Everyone on this option leaves on the end date.` : `${monthsText(len)} from the day each tenant moves in.`) : "Enter the dates to see how long it is."}
                  </p>
                  <div className="mt-4 space-y-3 border-t border-grey-100 pt-4">
                    <Switch checked={o.online} onChange={(online) => setOption(o.key, { online })}>
                      Students can pick this on your booking page
                    </Switch>
                    <label className="flex items-center gap-3 text-[15px] text-heading-2">
                      <input type="radio" name="defaultOption" className="size-5 accent-brand-600" checked={setup.defaultOptionKey === o.key} onChange={() => update({ defaultOptionKey: o.key })} />
                      This is the usual one
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Chip onClick={() => update({ options: [...setup.options, { key: newKey("o"), name: "Per year", kind: "rolling", months: 12, online: true }] })}>
                <Plus className="size-4" /> Per year
              </Chip>
              <Chip onClick={() => update({ options: [...setup.options, { key: newKey("o"), name: "6 months", kind: "rolling", months: 6, online: false }] })}>
                <Plus className="size-4" /> 6 months
              </Chip>
              <Chip onClick={() => update({ options: [...setup.options, { key: newKey("o"), name: "Per semester", kind: "session", start: setup.options[0]?.start, end: "", online: true }] })}>
                <Plus className="size-4" /> Per semester
              </Chip>
              <Chip onClick={() => update({ options: [...setup.options, { key: newKey("o"), name: "", kind: "rolling", months: 3, online: false }] })}>
                <Plus className="size-4" /> Something else
              </Chip>
            </div>
          </Question>
        )}

        {step === "prices" && (
          <Question title="What does each room cost?" hint={`Enter what you charge. ${setup.options.length > 1 ? "Each way of paying can have its own price." : ""}`}>
            <div className="flex gap-3 rounded-2xl bg-brand-50 p-4 text-[15px] leading-relaxed text-brand-900">
              <Info className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <p>
                <b>How HostelHub stays free for you:</b> when students pay online, they pay a small service fee on top (2%, at least ₦2,500). You always receive your full price.
              </p>
            </div>
            {setup.classes.map((c) => (
              <div key={c.key} className={card}>
                <p className="text-lg font-semibold text-grey-950">{c.name}</p>
                <p className="text-sm text-heading-6">
                  {c.capacity} {c.capacity === 1 ? "person" : "people"} · priced {perText(c.pricing)}
                </p>
                <div className="mt-4 space-y-4">
                  {setup.options.map((o) => {
                    const price = c.prices[o.key] ?? 0;
                    const t = checkoutTotal([{ label: "Rent", amount: price }]);
                    return (
                      <div key={o.key}>
                        <Label htmlFor={`price-${c.key}-${o.key}`}>
                          {o.name}, {perText(c.pricing)}
                        </Label>
                        <MoneyInput id={`price-${c.key}-${o.key}`} value={price} onChange={(n) => setClass(c.key, { prices: { ...c.prices, [o.key]: n } })} />
                        {price > 0 && (
                          <p className="mt-2 text-sm text-heading-5">
                            Students pay <b className="text-grey-950">{naira(t.total)}</b> online ({naira(price)} + {naira(t.fee)} service fee). You receive <b className="text-brand-800">{naira(price)}</b>.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Question>
        )}

        {step === "blocks" && (
          <Question title="How is your building arranged?" hint="Add each block, wing or row, named the way you call it: Block A, Ruby, Annex, anything.">
            {setup.blocks.map((b) => (
              <BlockCard
                key={b.key}
                block={b}
                setup={setup}
                onChange={(patch, recount) => setBlock(b.key, patch, recount)}
                onRooms={(rooms) => update({ blocks: setup.blocks.map((x) => (x.key === b.key ? { ...x, rooms } : x)) })}
                onRemove={() => update({ blocks: setup.blocks.filter((x) => x.key !== b.key) })}
              />
            ))}
            <AddButton
              onClick={() => {
                const name = setup.blocks.length ? "" : "Block A";
                const block: SetupBlock = { key: newKey("b"), name, who: "any", classKey: setup.classes[0]?.key ?? "mixed", prefix: defaultPrefix(name), start: 1, rooms: [] };
                update({ blocks: [...setup.blocks, { ...block, rooms: regenerateRooms(block, 10, setup.classes[0]?.key ?? "") }] });
              }}
            >
              {setup.blocks.length ? "Add another block" : "Add your first block"}
            </AddButton>
            {summary.rooms > 0 && (
              <p className="text-[15px] text-heading-5">
                So far: <b className="text-grey-950">{summary.rooms}</b> rooms, <b className="text-grey-950">{summary.people}</b> people.
              </p>
            )}
          </Question>
        )}

        {step === "charges" && (
          <Question title="Any other charges?" hint="Things like a utility fee or a caution deposit. If you don't have any, just continue.">
            {setup.charges.map((ch) => (
              <div key={ch.key} className={card}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`ch-${ch.key}`}>Name</Label>
                    <input
                      id={`ch-${ch.key}`}
                      className={cn(big, "h-12 text-base")}
                      value={ch.name}
                      placeholder="e.g. Utility fee"
                      onChange={(e) => update({ charges: setup.charges.map((x) => (x.key === ch.key ? { ...x, name: e.target.value } : x)) })}
                    />
                  </div>
                  <RemoveButton label={`Remove ${ch.name}`} onClick={() => update({ charges: setup.charges.filter((x) => x.key !== ch.key) })} />
                </div>
                <div className="mt-4">
                  <Label htmlFor={`amt-${ch.key}`}>Amount</Label>
                  <MoneyInput id={`amt-${ch.key}`} value={ch.amount} onChange={(amount) => update({ charges: setup.charges.map((x) => (x.key === ch.key ? { ...x, amount } : x)) })} />
                </div>
                <div className="mt-4">
                  <Label>When is it paid?</Label>
                  <Choice
                    label={`When ${ch.name} is paid`}
                    value={ch.when}
                    onChange={(when) => update({ charges: setup.charges.map((x) => (x.key === ch.key ? { ...x, when } : x)) })}
                    options={[
                      { value: "once", label: "Once, at move-in" },
                      { value: "every", label: "Every rent payment" },
                    ]}
                  />
                </div>
                <div className="mt-4">
                  <Switch checked={ch.refundable} onChange={(refundable) => update({ charges: setup.charges.map((x) => (x.key === ch.key ? { ...x, refundable } : x)) })}>
                    Refundable: given back when they move out
                  </Switch>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Chip onClick={() => update({ charges: [...setup.charges, { key: newKey("x"), name: "Caution deposit", amount: 0, when: "once", refundable: true }] })}>
                <Plus className="size-4" /> Caution deposit
              </Chip>
              <Chip onClick={() => update({ charges: [...setup.charges, { key: newKey("x"), name: "Utility fee", amount: 0, when: "once", refundable: false }] })}>
                <Plus className="size-4" /> Utility fee
              </Chip>
              <Chip onClick={() => update({ charges: [...setup.charges, { key: newKey("x"), name: "Form fee", amount: 0, when: "once", refundable: false }] })}>
                <Plus className="size-4" /> Form fee
              </Chip>
              <Chip onClick={() => update({ charges: [...setup.charges, { key: newKey("x"), name: "", amount: 0, when: "once", refundable: false }] })}>
                <Plus className="size-4" /> Something else
              </Chip>
            </div>
          </Question>
        )}

        {step === "review" && (
          <Question title="Check it over" hint="This is what you've set up. You can change any of it later from your dashboard.">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                [summary.rooms, "rooms"],
                [summary.people, "people"],
                [summary.spaces, "spaces to let"],
              ].map(([n, label]) => (
                <div key={label as string} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-2xl font-semibold tracking-tight text-brand-950 tabular-nums">{n}</p>
                  <p className="text-sm text-heading-6">{label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-brand-950 p-5 text-white">
              <p className="text-sm text-brand-200">If every space is let {defaultOption ? defaultOption.name.toLowerCase() : ""}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{naira(summary.fullRent)}</p>
              <p className="mt-1 text-sm text-brand-100/70">paid to your bank, before any extra charges</p>
            </div>
            {setup.classes.map((c) => {
              // The first payment carries every charge: one-off ones and those on every payment
              const firstPaymentCharges = setup.charges;
              return (
                <div key={c.key} className={card}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-lg font-semibold text-grey-950">{c.name}</p>
                    <p className="text-sm text-heading-6">{perText(c.pricing)}</p>
                  </div>
                  {setup.options.map((o) => {
                    const lines = [{ label: `Rent, ${o.name.toLowerCase()}`, amount: c.prices[o.key] ?? 0 }, ...firstPaymentCharges.map((ch) => ({ label: ch.name, amount: ch.amount, refundable: ch.refundable }))];
                    const t = checkoutTotal(lines);
                    return (
                      <div key={o.key} className="mt-4 rounded-2xl bg-grey-10 p-4 ring-1 ring-grey-100">
                        <p className="text-sm font-medium text-heading-4">
                          {o.name}
                          {!o.online && " · added by you only"}
                        </p>
                        <dl className="mt-2 space-y-1 text-[15px]">
                          {lines.map((l) => (
                            <div key={l.label} className="flex justify-between gap-3">
                              <dt className="text-heading-5">
                                {l.label}
                                {"refundable" in l && l.refundable ? " (refundable)" : ""}
                              </dt>
                              <dd className="tabular-nums">{naira(l.amount)}</dd>
                            </div>
                          ))}
                          <div className="flex justify-between gap-3">
                            <dt className="text-heading-5">HostelHub service fee</dt>
                            <dd className="tabular-nums">{naira(t.fee)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 border-t border-grey-150 pt-1.5 font-semibold">
                            <dt>Student pays online, first payment</dt>
                            <dd className="tabular-nums">{naira(t.total)}</dd>
                          </div>
                          <div className="flex justify-between gap-3 font-semibold text-brand-800">
                            <dt>You receive</dt>
                            <dd className="tabular-nums">{naira(t.toHostel)}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {setup.charges.some((ch) => ch.when === "once") && (
              <p className="text-sm text-heading-6">One-off charges are only on the first payment. When a tenant renews, they pay rent and any &quot;every payment&quot; charges.</p>
            )}
          </Question>
        )}

        {problem && (
          <div className="mt-6">
            <Problem>{problem}</Problem>
          </div>
        )}
        <NavButtons onBack={back} busy={busy} busyLabel="Saving your rooms…" label={step === "review" ? "Save rooms & prices" : step === "charges" && !setup.charges.length ? "No extra charges" : "Continue"} />
      </form>

      <aside className="hidden lg:block" aria-label="Preview of your booking page">
        <div className="sticky top-32">
          <RoomsPreview setup={setup} hostelName={hostelName} place={place} />
        </div>
      </aside>
      <PreviewSheet>
        <RoomsPreview setup={setup} hostelName={hostelName} place={place} />
      </PreviewSheet>
    </div>
  );
}

// --------------------------------------------------------------------------- one block

function BlockCard({
  block,
  setup,
  onChange,
  onRooms,
  onRemove,
}: {
  block: SetupBlock;
  setup: RoomsSetup;
  /** Changes to name, who, class or naming; `recount` sets a new number of rooms */
  onChange: (patch: Partial<SetupBlock>, recount?: number) => void;
  onRooms: (rooms: SetupBlock["rooms"]) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const count = block.rooms.length;
  const sample = block.rooms.slice(0, 3).map((r) => r.label);
  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`block-${block.key}`}>Block name</Label>
          <input
            id={`block-${block.key}`}
            className={cn(big, "h-12 text-base")}
            value={block.name}
            placeholder="e.g. Block A, Ruby, Annex"
            onChange={(e) => {
              const name = e.target.value;
              // Room names follow the block's name until they're changed by hand
              const followsName = block.prefix === defaultPrefix(block.name);
              onChange({ name, ...(followsName ? { prefix: defaultPrefix(name) } : {}) });
            }}
          />
        </div>
        <RemoveButton label={`Remove ${block.name || "block"}`} onClick={onRemove} />
      </div>

      <div className="mt-4">
        <Label>Who can stay here?</Label>
        <Choice<BlockOccupancy>
          label={`Who can stay in ${block.name}`}
          value={block.who}
          onChange={(who) => onChange({ who })}
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "any", label: "Anyone" },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`kind-${block.key}`}>Kind of room</Label>
          <Select id={`kind-${block.key}`} value={block.classKey} onChange={(e) => onChange({ classKey: e.target.value })} className="h-12 rounded-2xl px-4 text-base">
            {setup.classes.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
            {setup.classes.length > 1 && <option value="mixed">Mixed (choose per room)</option>}
          </Select>
        </div>
        <div>
          <Label>Number of rooms</Label>
          <Stepper label={`Rooms in ${block.name}`} value={count} min={1} max={500} onChange={(n) => onChange({}, n)} />
        </div>
      </div>

      <div className="mt-4">
        <Label>Room names</Label>
        <div className="flex flex-wrap gap-2">
          {[
            { prefix: defaultPrefix(block.name), start: 1 },
            { prefix: "", start: 101 },
            { prefix: "Room ", start: 1 },
          ]
            .filter((o, i, all) => all.findIndex((x) => x.prefix === o.prefix && x.start === o.start) === i)
            .map((o) => (
              <Chip key={`${o.prefix}|${o.start}`} active={block.prefix === o.prefix && block.start === o.start} onClick={() => onChange(o)}>
                {`${o.prefix}${o.start}, ${o.prefix}${o.start + 1}…`}
              </Chip>
            ))}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <Label htmlFor={`prefix-${block.key}`}>Starts with</Label>
            <input id={`prefix-${block.key}`} className={cn(big, "h-12 text-base")} value={block.prefix} placeholder="Nothing" onChange={(e) => onChange({ prefix: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={`start-${block.key}`}>First number</Label>
            <input
              id={`start-${block.key}`}
              inputMode="numeric"
              className={cn(big, "h-12 w-28 text-base tabular-nums")}
              value={block.start}
              onChange={(e) => onChange({ start: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })}
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-heading-6">
          {sample.join(", ")}
          {count === 4 && `, ${block.rooms[3].label}`}
          {count > 4 && ` … ${block.rooms.at(-1)?.label}`}
        </p>
      </div>

      <div className="mt-4 border-t border-grey-100 pt-4">
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="flex items-center gap-2 text-[15px] font-semibold text-brand-800">
          <Pencil className="size-4" /> {editing ? "Done editing rooms" : block.classKey === "mixed" ? "Choose each room's kind, or rename rooms" : "Rename rooms one by one"}
        </button>
        {editing && (
          <ul className="mt-3 max-h-80 space-y-2 overflow-x-hidden overflow-y-auto p-1">
            {block.rooms.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                {/* The fixed width lives on a wrapper: `big` makes inputs full width */}
                <div className="w-32 shrink-0">
                  <input
                    aria-label={`Room ${i + 1} name`}
                    className={cn(big, "h-11 text-base")}
                    value={r.label}
                    onChange={(e) => onRooms(block.rooms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                </div>
                {block.classKey === "mixed" ? (
                  <Select
                    aria-label={`Kind of room for ${r.label}`}
                    value={r.classKey}
                    onChange={(e) => onRooms(block.rooms.map((x, j) => (j === i ? { ...x, classKey: e.target.value } : x)))}
                    wrapperClassName="min-w-0 flex-1"
                    className="h-11 rounded-2xl px-3 text-[15px]"
                  >
                    {setup.classes.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="truncate text-sm text-heading-6">{setup.classes.find((c) => c.key === r.classKey)?.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
