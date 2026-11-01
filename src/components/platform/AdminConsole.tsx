"use client";

import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { BedDouble, Building2, CheckCircle2, ExternalLink, Landmark, Rocket } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { OverviewHostel, PlatformTask } from "@/app/api/platform/overview/route";
import { Wordmark } from "@/components/site/brand";
import { Badge, Button, Field, Input, PasswordInput, StatCard } from "@/components/ui";
import { authMessage } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { PLATFORM_HOST } from "@/lib/platform";
import { BrandLoader } from "@/components/BrandLoader";

/*
 * HostelHub's own console (admin.hostelhub.africa): how many hostels have signed up and gone
 * live, their tenants, and the jobs waiting on us, such as verifying a new payout account on
 * Paystack before its first payout. Only logins with the platform admin role get data.
 */

const PAYSTACK_SUBACCOUNTS = "https://dashboard.paystack.com/#/subaccounts";

function hostelUrl(id: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${id}.${PLATFORM_HOST}${port ? `:${port}` : ""}`;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

type Data = { hostels: OverviewHostel[]; tasks: PlatformTask[] };

async function api<T>(user: User, init?: RequestInit): Promise<T> {
  const res = await fetch("/api/platform/overview", { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn't load. Try again.");
  return body;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const forgot = async () => {
    setProblem(null);
    setSent(false);
    if (!email.trim()) return setProblem("Enter your email first, then tap Forgot password.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      setProblem(authMessage(err));
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setProblem(authMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mx-auto mt-16 w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 ring-1 ring-black/5">
      <p className="text-lg font-semibold text-grey-950">HostelHub admin</p>
      <Field label="Email">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {problem && <p className="text-sm text-rose-600">{problem}</p>}
      {sent && <p className="text-sm text-brand-700">Reset link sent to {email.trim()}. Check the inbox (and spam).</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <button type="button" onClick={forgot} className="w-full text-center text-xs font-medium text-brand-700 hover:underline">
        Forgot password?
      </button>
    </form>
  );
}

export function AdminConsole() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // A fresh token first, so an admin role given since the last sign-in counts
  const load = useCallback((u: User) => u.getIdToken(true).then(() => api<Data>(u)).then(setData, (err: Error) => setProblem(err.message)), []);
  useEffect(() => {
    if (user) void load(user);
  }, [user, load]);

  const markVerified = async (task: PlatformTask) => {
    if (!user) return;
    setResolving(task.id);
    try {
      await api(user, { method: "POST", body: JSON.stringify({ taskId: task.id }) });
      setData((d) => d && { ...d, tasks: d.tasks.filter((t) => t.id !== task.id) });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't update.");
    } finally {
      setResolving(null);
    }
  };

  const live = data?.hostels.filter((h) => h.status === "live") ?? [];
  const drafts = data?.hostels.filter((h) => h.status === "draft") ?? [];
  const tenants = data?.hostels.reduce((n, h) => n + h.tenants, 0) ?? 0;
  const booked = data?.hostels.reduce((n, h) => n + h.onlineBookings, 0) ?? 0;

  return (
    <div className="min-h-dvh bg-[#f6f8f7]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <Wordmark />
            <Badge tone="brand">Admin</Badge>
          </div>
          {user && (
            <div className="flex items-center gap-3 text-sm text-heading-6">
              <span className="hidden sm:inline">{user.email}</span>
              <Button variant="ghost" size="sm" onClick={() => signOut(auth)}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {user === undefined ? (
          <BrandLoader fullScreen={false} />
        ) : !user ? (
          <SignIn />
        ) : problem && !data ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{problem === "You don't have access to this." ? `${user.email} isn't a HostelHub admin.` : problem}</p>
        ) : !data ? (
          <BrandLoader label="Loading hostels…" fullScreen={false} />
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Live hostels" value={live.length} sub={`${data.hostels.length} signed up in all`} icon={<Rocket />} />
              <StatCard label="Still signing up" value={drafts.length} sub="Drafts not live yet" icon={<Building2 />} tone="amber" />
              <StatCard label="Tenants" value={tenants.toLocaleString()} sub="Active, across all hostels" icon={<BedDouble />} tone="blue" />
              <StatCard label="Online bookings" value={booked.toLocaleString()} sub="Paid through HostelHub" icon={<Landmark />} tone="violet" />
            </div>

            <section>
              <h2 className="text-lg font-semibold text-grey-950">Payout accounts to verify</h2>
              <p className="mt-1 text-sm text-heading-6">
                Paystack holds a new hostel&apos;s first payout until its subaccount is verified. Open Paystack, tick the subaccount, click <b>Verify subaccounts</b>, then mark it here.
              </p>
              {data.tasks.length === 0 ? (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-heading-5 ring-1 ring-black/5">
                  <CheckCircle2 className="size-4 text-brand-600" /> Nothing waiting.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-grey-100 rounded-xl bg-white ring-1 ring-black/5">
                  {data.tasks.map((t) => (
                    // Stacked on phones (details, then the two actions side by side); one row on wider screens
                    <li key={t.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-grey-950">
                          {t.hostelName} {t.mode === "test" && <Badge tone="amber">Test</Badge>}
                        </p>
                        <p className="text-sm break-all text-heading-6">{t.subaccountCode}</p>
                        <p className="text-xs text-heading-6">Went live {day(t.createdAt)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                        <a
                          href={PAYSTACK_SUBACCOUNTS}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                        >
                          Open Paystack <ExternalLink className="size-3.5" />
                        </a>
                        <Button className="h-9" onClick={() => markVerified(t)} disabled={resolving === t.id}>
                          {resolving === t.id ? "Saving…" : "Mark verified"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-grey-950">Hostels</h2>
              {/* Phones: a card per hostel. Wider screens: the table below. */}
              <ul className="mt-4 space-y-3 sm:hidden">
                {data.hostels.map((h) => (
                  <li key={h.id} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a href={`${hostelUrl(h.id)}/book`} target="_blank" rel="noreferrer" className="block truncate font-semibold text-grey-950 hover:underline">
                          {h.name}
                        </a>
                        <p className="truncate text-xs text-heading-6">
                          {h.id}
                          {h.city ? ` · ${h.city}` : ""}
                        </p>
                      </div>
                      <Badge tone={h.status === "live" ? "brand" : h.status === "draft" ? "amber" : "slate"}>{h.status === "draft" ? "Signing up" : h.status === "live" ? "Live" : "Suspended"}</Badge>
                    </div>
                    {h.ownerEmail && <p className="mt-2 truncate text-sm text-heading-5">{h.ownerEmail}</p>}
                    {h.status === "live" && !h.payout && <p className="mt-1 text-xs text-amber-700">No payout account</p>}
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-grey-100 pt-3 text-center">
                      <div>
                        <dt className="text-[11px] text-heading-6">Tenants</dt>
                        <dd className="font-semibold text-grey-950 tabular-nums">{h.tenants}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-heading-6">Online bookings</dt>
                        <dd className="font-semibold text-grey-950 tabular-nums">{h.onlineBookings}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-heading-6">Signed up</dt>
                        <dd className="text-sm font-medium text-grey-950">{day(h.createdAt)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="mt-4 hidden overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 sm:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-grey-100 text-xs text-heading-6">
                    <tr>
                      <th className="px-4 py-3 font-medium">Hostel</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Owner</th>
                      <th className="px-4 py-3 text-right font-medium">Tenants</th>
                      <th className="px-4 py-3 text-right font-medium">Online bookings</th>
                      <th className="px-4 py-3 font-medium">Signed up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grey-100">
                    {data.hostels.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-3">
                          <a href={`${hostelUrl(h.id)}/book`} target="_blank" rel="noreferrer" className="font-medium text-grey-950 hover:underline">
                            {h.name}
                          </a>
                          <p className="text-xs text-heading-6">
                            {h.id}
                            {h.city ? ` · ${h.city}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={h.status === "live" ? "brand" : h.status === "draft" ? "amber" : "slate"}>{h.status === "draft" ? "Signing up" : h.status === "live" ? "Live" : "Suspended"}</Badge>
                          {h.status === "live" && !h.payout && <p className="mt-1 text-xs text-heading-6">No payout account</p>}
                        </td>
                        <td className="px-4 py-3 text-heading-5">{h.ownerEmail ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{h.tenants}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{h.onlineBookings}</td>
                        <td className="px-4 py-3 text-heading-5">{day(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
