"use client";

import { ExternalLink, Loader2, Rocket, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Select } from "@/components/ui";
import { HAND_ADD_FEE, SERVICE_FEE } from "@/lib/fees";
import { auth } from "@/lib/firebase";
import { isNigerianPhone } from "@/lib/onboarding";
import type { Sex } from "@/lib/types";
import { cn, naira, todayISO } from "@/lib/utils";
import { big, Choice, Label, Problem, Question } from "./shell";

/*
 * Sign-up, part four: going live. Add the tenants already living there (free), look over the
 * booking page, accept the fees, and open for bookings.
 */

interface RoomOption {
  id: string;
  label: string;
  block: string;
  free: number;
  perBed: boolean;
}

interface Tenant {
  tenancyId: string;
  name: string;
  phone: string;
  roomLabel: string | null;
  spaceId: string | null;
  paidUntil: string;
  online: boolean;
  /** Shown already, still being saved */
  saving?: boolean;
}

interface State {
  rooms: RoomOption[];
  tenants: Tenant[];
  testMode: boolean;
}

async function call<T>(init?: { body: object }, hostelId?: string): Promise<T> {
  // Straight after a reload the login is still being restored
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  const res = init
    ? await fetch("/api/onboarding/golive", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(init.body) })
    : await fetch(`/api/onboarding/golive?hostelId=${encodeURIComponent(hostelId!)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

const bed = (spaceId: string | null) => spaceId?.match(/-([A-H])$/)?.[1];
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function GoLiveStep({ hostelId, hostelName, bookingUrl, onBack, onDone }: { hostelId: string; hostelName: string; bookingUrl: string; onBack: () => void; onDone: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // The tenant being added; room and date stay filled in, since neighbours often share them
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sex, setSex] = useState<Sex>("Male");
  const [roomId, setRoomId] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [addProblem, setAddProblem] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      call<State>(undefined, hostelId).then(
        (s) => {
          // A list fetched before a save finished mustn't drop tenants still being saved
          setState((prev) => ({ ...s, tenants: [...s.tenants, ...(prev?.tenants.filter((t) => t.saving) ?? [])] }));
          setLoadError(null);
        },
        (err: Error) => setLoadError(err.message),
      ),
    [hostelId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  /** Checked here first, so a tenant shown as added is almost never taken back */
  const tenantProblem = () => {
    if (name.trim().split(/\s+/).length < 2) return "Enter their first and last name.";
    if (!isNigerianPhone(phone)) return "Enter their phone number, like 08031234567.";
    if (!roomId) return "Pick their room.";
    if (!paidUntil || paidUntil <= todayISO()) return "Pick the date their rent is paid until (after today).";
    return null;
  };

  const changeFree = (id: string, by: number) => setState((s) => s && { ...s, rooms: s.rooms.map((r) => (r.id === id ? { ...r, free: r.free + by } : r)) });

  // The tenant shows in the list at once and the form clears for the next one; saving carries on behind
  const addTenant = (e: FormEvent) => {
    e.preventDefault();
    setAddProblem(null);
    const p = tenantProblem();
    if (p) return setAddProblem(p);
    const room = state!.rooms.find((r) => r.id === roomId)!;
    const tempId = `saving-${Date.now()}`;
    const entry = { fullName: name, phone, sex, roomId, paidUntil };
    const shown: Tenant = { tenancyId: tempId, name: name.trim(), phone, roomLabel: room.label, spaceId: null, paidUntil, online: false, saving: true };
    setState((s) => s && { ...s, tenants: [...s.tenants, shown] });
    changeFree(roomId, -1);
    // A full room drops out of the list; the next tenant picks again
    if (room.free <= 1) setRoomId("");
    setName("");
    setPhone("");
    document.getElementById("tenantName")?.focus();
    call<{ tenancyId: string; spaceId: string }>({ body: { hostelId, action: "addTenant", ...entry } }).then(
      (saved) =>
        setState((s) => {
          if (!s) return s;
          const done = { ...shown, tenancyId: saved.tenancyId, spaceId: saved.spaceId, saving: false };
          const others = s.tenants.filter((t) => t.tenancyId !== tempId && t.tenancyId !== saved.tenancyId);
          return { ...s, tenants: [...others, done] };
        }),
      (err: Error) => {
        setState((s) => s && { ...s, tenants: s.tenants.filter((t) => t.tenancyId !== tempId) });
        changeFree(entry.roomId, 1);
        setAddProblem(`${entry.fullName} wasn't added: ${err.message}`);
      },
    );
  };

  const removeTenant = (t: Tenant) => {
    // Gone at once; brought back if the server says no
    setState((s) => s && { ...s, tenants: s.tenants.filter((x) => x.tenancyId !== t.tenancyId) });
    const room = state?.rooms.find((r) => r.label === t.roomLabel);
    if (room) changeFree(room.id, 1);
    call({ body: { hostelId, action: "removeTenant", tenancyId: t.tenancyId } }).catch((err: Error) => {
      setAddProblem(err.message);
      void load();
    });
  };

  const goLive = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!accepted) return setProblem("Tick the box to accept the fees.");
    if (state?.tenants.some((t) => t.saving)) return setProblem("Still saving your tenants. One moment…");
    setBusy(true);
    try {
      await call({ body: { hostelId, action: "goLive", acceptTerms: true } });
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't go live. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const freeRooms = state?.rooms.filter((r) => r.free > 0) ?? [];
  const card = "rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-7";

  return (
    <div className="mx-auto w-full max-w-2xl lg:mx-0">
      <p className="mb-4 text-sm font-medium text-brand-700">Last part</p>
      <Question title="Ready to go live?" hint={`Three quick things, then ${hostelName} is open for bookings.`}>
        {/* 1. Tenants already living there */}
        <section className={card}>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
              <UserPlus className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-grey-950">Who already lives here?</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-heading-5">
                Add them now, <b>free</b>. Their spaces won&apos;t be offered to new tenants, and you&apos;ll see who&apos;s where from day one. No tenants yet? Skip this.
              </p>
            </div>
          </div>

          {!state && loadError ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Problem>{loadError}</Problem>
              <button type="button" onClick={() => void load()} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                Try again
              </button>
            </div>
          ) : !state ? (
            <p className="mt-5 flex items-center gap-2 text-[15px] text-heading-6">
              <Loader2 className="size-4 animate-spin" /> Loading your rooms…
            </p>
          ) : (
            <>
              {state.tenants.length > 0 && (
                <ul className="mt-5 divide-y divide-grey-100 rounded-2xl ring-1 ring-grey-100">
                  {state.tenants.map((t) => (
                    <li key={t.tenancyId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-grey-950">{t.name}</p>
                        <p className="text-sm text-heading-6">
                          {t.roomLabel}
                          {bed(t.spaceId) ? `, bed ${bed(t.spaceId)}` : ""} · paid until {shortDate(t.paidUntil)}
                          {t.online ? " · booked online" : ""}
                        </p>
                      </div>
                      {t.saving ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-heading-6" aria-label="Saving" />
                      ) : !t.online && (
                        <button type="button" onClick={() => removeTenant(t)} aria-label={`Remove ${t.name}`} className="rounded-full p-2 text-heading-6 hover:bg-grey-50 hover:text-rose-600">
                          <X className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {freeRooms.length === 0 ? (
                <p className="mt-5 text-[15px] text-heading-6">Every space is taken.</p>
              ) : (
                <form onSubmit={addTenant} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="tenantName">Full name</Label>
                    <input id="tenantName" className={cn(big, "h-[52px]")} placeholder="e.g. Chidi Okeke" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                  </div>
                  <div>
                    <Label htmlFor="tenantPhone">Phone number</Label>
                    <input id="tenantPhone" type="tel" inputMode="tel" className={cn(big, "h-[52px]")} placeholder="08031234567" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
                  </div>
                  <div>
                    <Label>Sex</Label>
                    <Choice label="Sex" value={sex} onChange={setSex} options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} />
                  </div>
                  <div>
                    <Label htmlFor="tenantRoom">Room</Label>
                    <Select id="tenantRoom" value={roomId} onChange={(e) => setRoomId(e.target.value)} searchable searchPlaceholder="Search rooms…" className="h-[52px] rounded-2xl px-4 text-lg!">
                      <option value="">Pick a room</option>
                      {freeRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label} · {r.block}
                          {r.perBed ? ` (${r.free} ${r.free === 1 ? "bed" : "beds"} free)` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="paidUntil">Rent paid until</Label>
                    <input id="paidUntil" type="date" className={cn(big, "h-[52px]")} value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
                  </div>
                  {addProblem && (
                    <div className="sm:col-span-2">
                      <Problem>{addProblem}</Problem>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-100 px-6 text-[15px] font-semibold text-brand-900 hover:bg-brand-200">
                      <UserPlus className="size-4" />
                      {state.tenants.length ? "Add another tenant" : "Add tenant"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        {/* 2. The booking page */}
        <section className={card}>
          <h2 className="text-lg font-semibold text-grey-950">Look over your booking page</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-heading-5">
            This is what tenants see. {state?.testMode ? "On this test site you can try a booking with Paystack's test payments." : "It opens for bookings when you go live."}
          </p>
          <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
            Open your booking page <ExternalLink className="size-4" />
          </a>
        </section>

        {/* 3. The fees */}
        <form id="golive" onSubmit={goLive} noValidate>
          <section className={card}>
            <h2 className="text-lg font-semibold text-grey-950">The fees</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-heading-4">
              <li>
                <b>Free for {hostelName}.</b> Rent paid online reaches your account in full.
              </li>
              <li>
                Tenants who pay online pay HostelHub a service fee on top: {Math.round(SERVICE_FEE.rate * 100)}% of what they pay you (refundable deposits left out), at least{" "}
                {naira(SERVICE_FEE.minimum)}.
              </li>
              <li>Once you&apos;re live, adding a tenant by hand on your dashboard costs {naira(HAND_ADD_FEE)} each. The tenants you add above are free.</li>
            </ul>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-grey-50 p-4">
              <input type="checkbox" checked={accepted} onChange={(e) => (setProblem(null), setAccepted(e.target.checked))} className="mt-1 size-5 shrink-0 accent-brand-700" />
              <span className="text-[15px] text-grey-950">I understand and accept these fees.</span>
            </label>
          </section>
        </form>
      </Question>

      {problem && (
        <div className="mt-6">
          <Problem>{problem}</Problem>
        </div>
      )}
      <GoLiveButtons onBack={onBack} busy={busy} />
    </div>
  );
}

/** Back, and the big go-live button (it submits the fees form). */
function GoLiveButtons({ onBack, busy }: { onBack: () => void; busy: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="h-14 rounded-full px-6 text-base font-semibold text-heading-4 hover:bg-white">
        Back
      </button>
      <button
        type="submit"
        form="golive"
        disabled={busy}
        className="inline-flex h-14 items-center gap-2 rounded-full bg-brand-950 px-8 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)] hover:bg-brand-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Rocket className="size-5 text-brand-300" />}
        {busy ? "Going live…" : "Go live"}
      </button>
    </div>
  );
}
