"use client";

import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { Wordmark } from "@/components/site/brand";
import { Input, PasswordInput } from "@/components/ui";
import { authMessage } from "@/lib/auth";
import { auth, db } from "@/lib/firebase";
import { PLATFORM_HOST } from "@/lib/platform";

/*
 * "Log in" on hostelhub.africa. Everyone signs in here, then goes where they belong: the one
 * hostel they manage or rent in (signed in there too, via api/auth/handoff), a choice when they
 * have several, the admin console, or help when they don't belong to a hostel yet. There's no
 * public list of hostels: people only ever see their own.
 */

interface Place {
  id: string;
  name: string;
  role: "manager" | "tenant";
}

function hostelOrigin(id: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${id}.${PLATFORM_HOST}${port ? `:${port}` : ""}`;
}

/** Into a hostel's own address, still signed in. */
async function goTo(user: User, place: Place) {
  const returnTo = `${hostelOrigin(place.id)}${place.role === "manager" ? "/" : "/portal"}`;
  const res = await fetch("/api/auth/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ action: "start", returnTo }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't open your hostel. Please try again.");
  window.location.assign(data.url);
}

export function PlatformSignIn() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Signed in: where does this login belong? (/api/me reads the login's roles; names from listings)
  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${await user.getIdToken(true)}` } });
        const me = (await res.json()) as { manages?: string[]; tenantOf?: string[]; platformAdmin?: boolean; error?: string };
        if (!res.ok) throw new Error(me.error ?? "Couldn't look up your hostels.");
        const ids = [...(me.manages ?? []).map((id) => ({ id, role: "manager" as const })), ...(me.tenantOf ?? []).filter((id) => !me.manages?.includes(id)).map((id) => ({ id, role: "tenant" as const }))];
        const named = await Promise.all(
          ids.map(async (p) => ({ ...p, name: ((await getDoc(doc(db, `listings/${p.id}`)).catch(() => null))?.data()?.info?.hostelName as string | undefined) ?? p.id })),
        );
        if (!live) return;
        setAdmin(!!me.platformAdmin);
        setPlaces(named);
        // Just one place to be: go straight there
        if (named.length === 1 && !me.platformAdmin) await goTo(user, named[0]);
      } catch (err) {
        if (live) setProblem(err instanceof Error ? err.message : "Something went wrong.");
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);

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

  const forgot = async () => {
    if (!email.trim()) return setProblem("Enter your email first, then tap Forgot password.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setProblem(null);
      alert("Password reset link sent. Check your email.");
    } catch (err) {
      setProblem(authMessage(err));
    }
  };

  const open = async (place: Place) => {
    setBusy(true);
    try {
      await goTo(user!, place);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't open your hostel.");
      setBusy(false);
    }
  };

  const card = "w-full max-w-sm rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-7";

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#f6f8f7] px-4 py-10">
      <Link href="/" aria-label="HostelHub home" className="mb-8">
        <Wordmark />
      </Link>

      {user === undefined || (user && places === null && !problem) ? (
        <p className="mt-10 flex items-center gap-2 text-heading-5">
          <Loader2 className="size-4 animate-spin" /> {user ? "Finding your hostel…" : "Loading…"}
        </p>
      ) : !user ? (
        <div className={card}>
          <h1 className="text-2xl font-semibold tracking-tight text-grey-950">Log in</h1>
          <p className="mt-1.5 text-sm text-heading-6">To your hostel dashboard or tenant portal.</p>
          <GoogleButton className="mt-6" />
          <OrDivider />
          <form onSubmit={submit} className="space-y-4">
            <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl text-[15px]" />
            <PasswordInput autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl text-[15px]" />
            <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-950 text-[15px] font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
              {busy ? "Logging in…" : "Log in"} <ArrowRight className="size-4" />
            </button>
            <button type="button" onClick={forgot} className="w-full text-center text-xs font-medium text-brand-700 hover:underline">
              Forgot password?
            </button>
          </form>
          {problem && <p className="mt-4 text-center text-sm text-rose-600">{problem}</p>}
          <p className="mt-6 text-center text-sm text-heading-6">
            Own a hostel?{" "}
            <Link href="/start" className="font-semibold text-brand-800 hover:underline">
              Set it up free
            </Link>
          </p>
        </div>
      ) : (
        <div className={card}>
          <p className="text-sm text-heading-6">Signed in as</p>
          <p className="font-semibold break-all text-grey-950">{user.email}</p>

          {places && places.length > 0 && (
            <>
              <h1 className="mt-6 text-lg font-semibold text-grey-950">{places.length > 1 ? "Choose a hostel" : "Your hostel"}</h1>
              <ul className="mt-3 space-y-2">
                {places.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => open(p)}
                      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-grey-150 hover:bg-brand-50 hover:ring-brand-300 disabled:opacity-60"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                        <Building2 className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-grey-950">{p.name}</span>
                        <span className="block text-xs text-heading-6">{p.role === "manager" ? "Dashboard" : "Tenant portal"}</span>
                      </span>
                      <ArrowRight className="size-4 text-heading-6" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {admin && (
            <Link href="/admin" className="mt-4 flex h-11 items-center justify-center rounded-xl bg-grey-50 text-sm font-semibold text-grey-950 hover:bg-grey-100">
              Open the HostelHub admin
            </Link>
          )}

          {places?.length === 0 && !admin && (
            <div className="mt-6 text-[15px] leading-relaxed text-heading-5">
              <p className="font-semibold text-grey-950">You&apos;re not part of a hostel yet.</p>
              <p className="mt-2">Looking for a room? Ask your hostel for their HostelHub booking link.</p>
              <Link href="/start" className="mt-4 flex h-11 items-center justify-center rounded-xl bg-brand-950 text-sm font-semibold text-white hover:bg-brand-800">
                Set up your hostel
              </Link>
            </div>
          )}

          {problem && <p className="mt-4 text-sm text-rose-600">{problem}</p>}
          <button type="button" onClick={() => void signOut(auth)} className="mt-6 w-full text-center text-xs font-medium text-heading-6 hover:underline">
            Use another account
          </button>
        </div>
      )}
    </div>
  );
}
