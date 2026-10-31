"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { ArrowRight, BedDouble, Check, Loader2, MapPin, MessageCircle, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Wordmark } from "@/components/site/brand";
import { Phone, PHONE_SIZE, Scaled } from "@/components/site/Mockups";
import { PasswordInput, Select } from "@/components/ui";
import { STATES } from "@/lib/academics";
import { authMessage } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { BASICS_CHECKS, EMPTY_BASICS, normalizePhone, suggestSlugs, type HostelBasics } from "@/lib/onboarding";
import { PLATFORM_HOST, whatsappHref } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { GoLiveStep } from "./GoLiveStep";
import { PaymentsStep } from "./PaymentsStep";
import { RoomsWizard } from "./RoomsWizard";
import { big, Label, NavButtons, PreviewSheet, Problem, Question } from "./shell";

/*
 * Owner sign-up, part one: who and where the hostel is, then a login. One question per screen,
 * answers kept in this browser until the account exists (a refresh or lost signal loses nothing),
 * and a preview of the hostel's booking page that fills in as they type.
 */

type StepId = "welcome" | "name" | "slug" | "location" | "manager" | "account" | "saved" | "rooms" | "roomsSaved" | "payments" | "paymentsSaved" | "golive" | "live";
const QUESTIONS: StepId[] = ["name", "slug", "location", "manager", "account"];

/** The whole sign-up, so people see how far they are; only "Your hostel" exists so far. */
const SECTIONS = ["Your hostel", "Rooms & prices", "Payments", "Go live"];

const STORAGE_KEY = "hostelhub:start";

interface Saved {
  step: StepId;
  basics: HostelBasics;
  slugTouched: boolean;
  hostelId?: string;
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function store(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private browsing: the wizard still works, it just won't survive a refresh
  }
}

/** "https://sunrise.hostelhub.africa" here, or "http://sunrise.localhost:3000" in development. */
function hostelUrl(slug: string) {
  if (typeof window === "undefined") return `https://${slug}.${PLATFORM_HOST}`;
  const { protocol, port } = window.location;
  return `${protocol}//${slug}.${PLATFORM_HOST}${port ? `:${port}` : ""}`;
}

type SlugState = { status: "idle" | "checking" | "available" | "taken" | "error"; message?: string; yours?: boolean };

/**
 * Asks the server whether the address is free, a moment after typing stops. Their own saved
 * hostel's address is theirs, not "taken" (they came back to change an answer).
 */
function useSlugCheck(slug: string, enabled: boolean, savedId?: string): SlugState {
  const [state, setState] = useState<SlugState>({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    const problem = BASICS_CHECKS.slug({ ...EMPTY_BASICS, slug });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the address just typed
    if (problem) return setState({ status: "taken", message: slug ? problem : undefined });
    if (slug === savedId) return setState({ status: "available", yours: true });
    setState({ status: "checking" });
    let live = true;
    const timer = setTimeout(async () => {
      try {
        // Signed in from an earlier visit: the server can tell their own unfinished hostel apart
        const token = await auth.currentUser?.getIdToken().catch(() => undefined);
        const res = await fetch(`/api/onboarding/hostel?slug=${encodeURIComponent(slug)}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        const data = (await res.json()) as { available?: boolean; yours?: boolean; problem?: string | null; error?: string };
        if (!live) return;
        if (!res.ok) setState({ status: "error", message: data.error });
        else setState(data.available ? { status: "available", yours: data.yours } : { status: "taken", message: data.problem ?? undefined });
      } catch {
        if (live) setState({ status: "error", message: "Couldn't check that address. Check your connection." });
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug, enabled, savedId]);
  return state;
}

type EmailState = { status: "idle" | "checking" | "done"; exists?: boolean };

/** Whether the email typed already has a login, so the screen asks to log in or to pick a password. */
function useEmailCheck(email: string, enabled: boolean): EmailState & { exists: boolean } {
  const [state, setState] = useState<EmailState & { email?: string }>({ status: "idle" });
  const clean = email.trim().toLowerCase();
  const valid = /^\S+@\S+\.\S+$/.test(clean);
  useEffect(() => {
    if (!enabled || !valid) return;
    let live = true;
    // Only once typing pauses: one request per email, not per key
    const timer = setTimeout(async () => {
      setState({ status: "checking", email: clean });
      try {
        const res = await fetch(`/api/onboarding/login?email=${encodeURIComponent(clean)}`);
        const data = (await res.json()) as { exists?: boolean };
        if (live) setState(res.ok ? { status: "done", exists: !!data.exists, email: clean } : { status: "idle" });
      } catch {
        if (live) setState({ status: "idle" });
      }
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clean, valid, enabled]);
  // An answer about an email they've since changed doesn't count
  const current = valid && state.email === clean;
  return { status: current ? state.status : "idle", exists: current && !!state.exists };
}

/** Rooms answers saved in this browser follow the hostel to its new address. */
function moveRoomsDraft(from: string, to: string) {
  try {
    const saved = localStorage.getItem(`hostelhub:rooms:${from}`);
    if (saved) localStorage.setItem(`hostelhub:rooms:${to}`, saved);
    localStorage.removeItem(`hostelhub:rooms:${from}`);
  } catch {
    // storage blocked: the rooms are saved on the server too
  }
}

// --------------------------------------------------------------------------- preview

/** The hostel's booking page as it will look, filled in from the answers so far. */
function BookingPreview({ basics }: { basics: HostelBasics }) {
  const name = basics.name.trim() || "Your hostel";
  const place = [basics.city.trim(), basics.state].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col items-center">
      <p className="mb-4 max-w-full truncate rounded-full bg-white px-4 py-1.5 text-sm text-heading-5 shadow-[0_6px_20px_-10px_rgba(11,35,34,0.3)] ring-1 ring-black/5">
        <span className="font-semibold text-brand-800">{basics.slug || "yourhostel"}</span>.{PLATFORM_HOST}
      </p>
      <Scaled {...PHONE_SIZE} className="[--s:0.92]">
        <Phone>
          <div className="rounded-b-[28px] bg-brand-900 px-5 pt-12 pb-6 text-white">
            <p className="text-[15px] font-semibold tracking-tight">
              hostel<span className="text-brand-300">hub</span>
            </p>
            <p className={cn("mt-4 text-[22px] leading-tight font-semibold break-words", !basics.name.trim() && "text-white/40")}>{name}</p>
            {place ? (
              <p className="mt-1.5 flex items-center gap-1 text-[12px] text-brand-100/80">
                <MapPin className="size-3.5" /> {place}
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-brand-100/40">Town, state</p>
            )}
          </div>
          <div className="px-5 pt-5">
            <p className="text-[14px] font-semibold text-grey-950">Pick your room</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="h-12 rounded-xl border border-dashed border-grey-150 bg-grey-10" />
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-heading-6">
              <BedDouble className="size-3.5" /> Your rooms appear here in the next part
            </p>
            {basics.managerPhone && (
              <p className="mt-4 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[11px] text-brand-900">
                Questions? Call {basics.managerName.trim().split(/\s+/)[0] || "the manager"} on {normalizePhone(basics.managerPhone)}
              </p>
            )}
          </div>
        </Phone>
      </Scaled>
      <p className="mt-4 text-sm text-heading-6">What tenants will see</p>
    </div>
  );
}

// --------------------------------------------------------------------------- wizard

export function StartWizard() {
  const [step, setStep] = useState<StepId>("welcome");
  const [basics, setBasics] = useState<HostelBasics>(EMPTY_BASICS);
  const [slugTouched, setSlugTouched] = useState(false);
  const [hostelId, setHostelId] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** Saving starts only once the saved answers are back, so blank first-render state never overwrites them */
  const [restored, setRestored] = useState(false);
  /** How far through the rooms part (0–1), reported by RoomsWizard for the progress bar */
  const [roomsProgress, setRoomsProgress] = useState(0);

  // Pick up where this browser left off
  useEffect(() => {
    const saved = load();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring once from storage on mount
      setBasics({ ...EMPTY_BASICS, ...saved.basics });
      setSlugTouched(saved.slugTouched);
      setHostelId(saved.hostelId);
      setStep(saved.step);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) store({ step, basics, slugTouched, hostelId });
  }, [restored, step, basics, slugTouched, hostelId]);

  // A new answer clears the last complaint, so the screen never shows an error that's been fixed
  const set = (patch: Partial<HostelBasics>) => {
    setProblem(null);
    setBasics((b) => {
      const next = { ...b, ...patch };
      // The address follows the name until they choose their own (or it's saved, and fixed)
      if (patch.name !== undefined && !slugTouched && !hostelId) next.slug = suggestSlugs(next.name)[0] ?? "";
      return next;
    });
  };
  const chooseSlug = (slug: string) => {
    setSlugTouched(true);
    setProblem(null);
    setBasics((b) => ({ ...b, slug }));
  };

  const slugCheck = useSlugCheck(basics.slug, step === "slug", hostelId);
  const emailCheck = useEmailCheck(email, step === "account");
  const [owner, setOwner] = useState<User | null>(null);
  useEffect(() => onAuthStateChanged(auth, setOwner), []);
  /** Back to change an answer on a hostel already saved, still logged in: the last question saves it */
  const editing = !!hostelId && !!owner;
  const index = QUESTIONS.indexOf(step);
  const go = (to: StepId) => {
    setProblem(null);
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const back = () => go(index <= 0 ? "welcome" : QUESTIONS[index - 1]);

  /** Checks this screen's answers, then moves on. */
  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    const checks: Partial<Record<StepId, (keyof HostelBasics)[]>> = {
      name: ["name"],
      slug: ["slug"],
      location: ["street", "city", "state"],
      manager: ["managerName", "managerPhone"],
    };
    for (const field of checks[step] ?? []) {
      const p = BASICS_CHECKS[field](basics);
      if (p) return setProblem(p);
    }
    if (step === "slug") {
      if (slugCheck.status === "checking") return setProblem("Checking that address. One moment…");
      // The reason is already shown under the field; only say something if it isn't
      if (slugCheck.status !== "available") return slugCheck.message ? document.getElementById("slug")?.focus() : setProblem("Pick an address that's free.");
    }
    if (step === "account") return createHostel();
    // Already saved and still logged in (they came back to change an answer): save, no login again
    if (step === "manager" && editing) return createHostel(owner!);
    go(QUESTIONS[index + 1]);
  };

  /** Signs in (creating the login on first use), then saves the hostel as a draft. */
  const createHostel = async (signedIn?: User) => {
    setBusy(true);
    setProblem(null);
    try {
      let user = signedIn;
      if (!user) {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter a valid email address.");
        if (password.length < 8 && !emailCheck.exists) throw new Error("Use a password of at least 8 characters.");
        // Always the owner's own login: whoever this browser was logged in as (a demo or staff
        // account, someone else's) is signed out first, so a hostel never lands on the wrong login
        if (auth.currentUser) await signOut(auth);
        // Someone who already uses HostelHub (e.g. a second hostel) logs in with the same email and password
        if (emailCheck.exists) user = (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
        else {
          try {
            user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
          } catch (err) {
            if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") user = (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
            else throw err;
          }
        }
      }
      const res = await fetch("/api/onboarding/hostel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ ...basics, from: hostelId }),
      });
      const data = (await res.json().catch(() => ({}))) as { hostelId?: string; error?: string };
      if (!res.ok || !data.hostelId) {
        if (res.status === 409 && /web address/.test(data.error ?? "")) {
          setStep("slug");
          setSlugTouched(true);
        }
        throw new Error(data.error ?? "Couldn't save your hostel. Please try again.");
      }
      // The login is now this hostel's manager; refresh it so the next screens can open its records
      await user.getIdToken(true);
      if (hostelId && data.hostelId !== hostelId) moveRoomsDraft(hostelId, data.hostelId);
      setHostelId(data.hostelId);
      go("saved");
    } catch (err) {
      setProblem(err instanceof FirebaseError ? (err.code === "auth/invalid-credential" ? "This email already has a HostelHub account, and that isn't its password." : authMessage(err)) : err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Which of the four parts the progress bar is in, and how far through it
  const section = ["paymentsSaved", "golive", "live"].includes(step) ? 3 : step === "roomsSaved" || step === "payments" ? 2 : step === "saved" || step === "rooms" ? 1 : 0;
  const partDone =
    step === "live"
      ? 1
      : step === "rooms"
        ? roomsProgress
        : step === "payments" || step === "golive"
          ? 0.5
          : ["saved", "roomsSaved", "paymentsSaved"].includes(step)
            ? 0
            : (index + 1) / (QUESTIONS.length + 1);
  const showPreview = QUESTIONS.includes(step);

  // Until this browser's saved answers are read, show the frame only (no flash of the welcome screen)
  if (!restored) return <div className="min-h-dvh bg-[#f6f8f7]" />;

  return (
    <div className="min-h-dvh bg-[#f6f8f7]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f6f8f7]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="HostelHub home">
            <Wordmark />
          </Link>
          <a href={whatsappHref("Hi HostelHub, I need help setting up my hostel.")} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-heading-4 hover:bg-white">
            <MessageCircle className="size-4 text-[#1f7a4d]" /> <span className="hidden sm:inline">Need help?</span> Chat with us
          </a>
        </div>
        {step !== "welcome" && (
          <div className="mx-auto max-w-6xl px-5 pb-3 sm:px-8">
            <ol className="grid grid-cols-4 gap-1.5" aria-label="Sign-up progress">
              {SECTIONS.map((s, i) => {
                const part = i < section ? 1 : i > section ? 0 : partDone;
                return (
                  <li key={s} aria-current={i === section ? "step" : undefined}>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-brand-100">
                      <span className="block h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.round(part * 100)}%` }} />
                    </span>
                    <span className={cn("mt-1.5 hidden text-xs sm:block", i === section ? "font-semibold text-brand-900" : "text-heading-6")}>{s}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-1.5 text-xs font-medium text-brand-900 sm:hidden">{SECTIONS[section]}</p>
          </div>
        )}
      </header>

      <main className={cn("mx-auto grid max-w-6xl gap-12 px-5 pt-10 pb-28 sm:px-8 sm:pt-14 lg:pb-16", showPreview && "lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20")}>
        {step === "golive" && hostelId ? (
          <GoLiveStep hostelId={hostelId} hostelName={basics.name || "Your hostel"} bookingUrl={`${hostelUrl(hostelId)}/book`} onBack={() => go("paymentsSaved")} onDone={() => go("live")} />
        ) : step === "payments" && hostelId ? (
          <PaymentsStep hostelId={hostelId} hostelName={basics.name || "Your hostel"} onBack={() => go("roomsSaved")} onDone={() => go("paymentsSaved")} />
        ) : step === "rooms" && hostelId ? (
          <RoomsWizard
            hostelId={hostelId}
            hostelName={basics.name || "Your hostel"}
            place={[basics.city.trim(), basics.state].filter(Boolean).join(", ")}
            onBack={() => go("saved")}
            onDone={() => go("roomsSaved")}
            onProgress={setRoomsProgress}
          />
        ) : (
        <div className="mx-auto w-full max-w-xl lg:mx-0">
          {step === "welcome" && (
            <div className="motion-safe:animate-[rise_0.4s_ease-out]">
              <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Free for hostels</p>
              <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.4rem)] leading-[1.02] font-bold tracking-[-0.04em] text-brand-950">Let&apos;s get your hostel online.</h1>
              <p className="mt-5 text-lg leading-relaxed text-heading-5">
                A few simple questions, one at a time. Your answers save as you go, so you can stop and come back. Nothing goes live until you say so.
              </p>
              <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Your hostel", "3 min"],
                  ["Rooms & prices", "10 min"],
                  ["Payments", "1 min"],
                  ["Go live", "2 min"],
                ].map(([part, time], i) => (
                  <li key={part} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                    <p className="text-xs font-medium text-brand-700">{i + 1}</p>
                    <p className="text-[15px] font-semibold text-grey-950">{part}</p>
                    <p className="text-sm text-heading-6">{time}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-black/5">
                <p className="font-semibold text-grey-950">Have these to hand</p>
                <ul className="mt-4 space-y-3 text-[15px] text-heading-4">
                  {["Your hostel's name and address", "Your room sizes and what each one costs", "The bank account rent should go to"].map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => go("name")}
                className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-950 px-8 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)] hover:bg-brand-800 sm:w-auto"
              >
                Let&apos;s start <ArrowRight className="size-5 text-brand-300" />
              </button>
              <p className="mt-6 text-[15px] text-heading-5">
                Already set up?{" "}
                <Link href="/login" className="font-semibold text-brand-800 underline-offset-4 hover:underline">
                  Log in
                </Link>
              </p>
            </div>
          )}

          {/* Only part one's questions; the in-between screens ("saved"…) have their own buttons */}
          {QUESTIONS.includes(step) && (
            <form onSubmit={next} noValidate>
              <p className="mb-4 text-sm font-medium text-brand-700">
                Question {index + 1} of {QUESTIONS.length}
              </p>

              {step === "name" && (
                <Question title="What's your hostel called?" hint="Tenants see this on your booking page, their receipts and their ID cards.">
                  <div>
                    <Label htmlFor="name">Hostel name</Label>
                    <input id="name" autoFocus className={cn(big, "h-14")} placeholder="e.g. Sunrise Hostel" value={basics.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} />
                  </div>
                </Question>
              )}

              {step === "slug" && (
                <Question title="Pick your web address" hint="This is your booking page. Share it with agents, on WhatsApp and on your poster.">
                  <div>
                    <Label htmlFor="slug">Web address</Label>
                    <div className="flex h-14 items-center rounded-2xl border border-grey-150 bg-white pr-4 transition-colors focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
                      <input
                        id="slug"
                        autoFocus
                        className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent pl-4 text-lg font-semibold text-grey-950 outline-none"
                        value={basics.slug}
                        onChange={(e) => chooseSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <span className="shrink-0 text-lg text-heading-6">.{PLATFORM_HOST}</span>
                    </div>
                    <p className="mt-2.5 flex min-h-6 items-center gap-2 text-[15px]" aria-live="polite">
                      {slugCheck.status === "checking" && (
                        <span className="flex items-center gap-2 text-heading-6">
                          <Loader2 className="size-4 animate-spin" /> Checking…
                        </span>
                      )}
                      {slugCheck.status === "available" && (
                        <span className="flex items-center gap-2 font-medium text-brand-700">
                          <Check className="size-4" strokeWidth={3} /> {slugCheck.yours ? "This one's already yours" : "It's yours if you want it"}
                        </span>
                      )}
                      {(slugCheck.status === "taken" || slugCheck.status === "error") && slugCheck.message && <span className="text-rose-600">{slugCheck.message}</span>}
                    </p>
                  </div>
                  {hostelId && basics.slug !== hostelId && (
                    <p className="text-[15px] leading-relaxed text-heading-5">
                      Your hostel moves to this address when you save, and <span className="font-semibold">{hostelId}</span> is freed.{" "}
                      <button type="button" onClick={() => chooseSlug(hostelId)} className="font-semibold text-brand-800 underline-offset-4 hover:underline">
                        Keep {hostelId}
                      </button>
                    </p>
                  )}
                  {suggestSlugs(basics.name, basics.city).filter((s) => s !== basics.slug).length > 0 && (
                    <div>
                      <p className="mb-2 text-sm text-heading-6">Or try</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestSlugs(basics.name, basics.city)
                          .filter((s) => s !== basics.slug)
                          .map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                chooseSlug(s);
                                // Back to the field, so Enter continues rather than re-clicking the chip
                                document.getElementById("slug")?.focus();
                              }}
                              className="rounded-full bg-white px-4 py-2 text-[15px] text-brand-900 ring-1 ring-brand-200 hover:bg-brand-50"
                            >
                              {s}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </Question>
              )}

              {step === "location" && (
                <Question title="Where is it?" hint="So tenants and agents can find you. It's shown on your booking page and receipts.">
                  <div>
                    <Label htmlFor="street">Street address</Label>
                    <input id="street" autoFocus className={cn(big, "h-14")} placeholder="e.g. 12 University Road" value={basics.street} onChange={(e) => set({ street: e.target.value })} />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="city">Town or city</Label>
                      <input id="city" className={cn(big, "h-14")} placeholder="e.g. Nsukka" value={basics.city} onChange={(e) => set({ city: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Select id="state" value={basics.state} onChange={(e) => set({ state: e.target.value })} searchable searchPlaceholder="Search states…" className="h-14 rounded-2xl px-4 text-lg!">
                        <option value="">Pick a state</option>
                        {STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </Question>
              )}

              {step === "manager" && (
                <Question title="Who manages it?" hint="Tenants can call this number from your booking page.">
                  <div>
                    <Label htmlFor="managerName">Your full name</Label>
                    <input id="managerName" autoFocus autoComplete="name" className={cn(big, "h-14")} placeholder="e.g. Grace Adeyemi" value={basics.managerName} onChange={(e) => set({ managerName: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="managerPhone">Phone number</Label>
                    <input
                      id="managerPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      className={cn(big, "h-14")}
                      placeholder="08031234567"
                      value={basics.managerPhone}
                      onChange={(e) => set({ managerPhone: e.target.value })}
                    />
                    <p className="mt-2 text-sm text-heading-6">A WhatsApp number is best.</p>
                  </div>
                </Question>
              )}

              {step === "account" && (
                <Question
                  title={emailCheck.exists ? "Welcome back" : "Create your login"}
                  hint={
                    emailCheck.exists
                      ? "This email already has a HostelHub login. Enter its password and this hostel joins it."
                      : "The login for your dashboard. Google is quickest: nothing to remember."
                  }
                >
                  <div>
                    {/* Saves the hostel as soon as they pick their Google account */}
                    <GoogleButton label={busy ? "Saving your hostel…" : "Continue with Google"} onUser={(u) => void createHostel(u)} />
                    <OrDivider label="or use an email and password" />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <input
                      id="email"
                      type="email"
                      autoFocus
                      autoComplete="email"
                      className={cn(big, "h-14")}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoCapitalize="none"
                    />
                    <p className="mt-2 flex min-h-5 items-center gap-2 text-sm text-heading-6" aria-live="polite">
                      {emailCheck.status === "checking" ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" /> Checking…
                        </>
                      ) : emailCheck.status === "done" && !emailCheck.exists ? (
                        <span className="flex items-center gap-1.5 font-medium text-brand-700">
                          <Check className="size-3.5" strokeWidth={3} /> New login. Password resets come to this email.
                        </span>
                      ) : emailCheck.exists ? (
                        <span className="flex items-center gap-1.5 font-medium text-brand-700">
                          <Check className="size-3.5" strokeWidth={3} /> You already have a login
                        </span>
                      ) : (
                        "Use one you can open: password resets come here."
                      )}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="password">{emailCheck.exists ? "Your password" : "Choose a password"}</Label>
                    <PasswordInput
                      id="password"
                      autoComplete={emailCheck.exists ? "current-password" : "new-password"}
                      className="h-14 rounded-2xl px-4 text-lg"
                      placeholder={emailCheck.exists ? "Your HostelHub password" : "At least 8 characters"} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </Question>
              )}

              {problem && (
                <div className="mt-6">
                  <Problem>{problem}</Problem>
                </div>
              )}

              <NavButtons onBack={back} busy={busy} busyLabel="Saving your hostel…" label={step === "account" ? (emailCheck.exists ? "Log in and save" : "Save my hostel") : step === "manager" && editing ? "Save changes" : "Continue"} />
            </form>
          )}

          {step === "saved" && hostelId && (
            <div className="motion-safe:animate-[rise_0.4s_ease-out]">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
                <PartyPopper className="size-7" />
              </span>
              <h1 className="mt-6 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.04em] text-brand-950">{basics.name} is saved.</h1>
              <p className="mt-4 text-lg leading-relaxed text-heading-5">
                Your web address <span className="font-semibold text-brand-900">{hostelId}.{PLATFORM_HOST}</span> is held for you. It stays private until you go live.
              </p>
              <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-black/5">
                <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Next: rooms & prices</p>
                <p className="mt-2 text-[15px] leading-relaxed text-heading-4">
                  The kinds of room you have, how tenants pay, what each costs and how your building is arranged. About 10 minutes.
                </p>
              </div>
              <button type="button" onClick={() => go("rooms")} className={nextButton}>
                Set up rooms & prices <ArrowRight className="size-5 text-brand-300" />
              </button>
              <button type="button" onClick={() => go("name")} className="mt-6 block text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                Change name, address or web address
              </button>
            </div>
          )}

          {step === "roomsSaved" && hostelId && (
            <div className="motion-safe:animate-[rise_0.4s_ease-out]">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
                <Check className="size-7" strokeWidth={2.5} />
              </span>
              <h1 className="mt-6 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.04em] text-brand-950">Rooms & prices are saved.</h1>
              <p className="mt-4 text-lg leading-relaxed text-heading-5">Two parts left: where your rent should go, then going live.</p>
              <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-black/5">
                <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Next: payments · 1 minute</p>
                <p className="mt-2 text-[15px] leading-relaxed text-heading-4">The bank account your rent goes to. Just your bank and account number: we check the name for you.</p>
              </div>
              <button type="button" onClick={() => go("payments")} className={nextButton}>
                Set up payments <ArrowRight className="size-5 text-brand-300" />
              </button>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <button type="button" onClick={() => go("rooms")} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                  Change rooms & prices
                </button>
                <a href={hostelUrl(hostelId)} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                  Open {hostelId}.{PLATFORM_HOST}
                </a>
              </div>
            </div>
          )}

          {step === "paymentsSaved" && hostelId && (
            <div className="motion-safe:animate-[rise_0.4s_ease-out]">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
                <Check className="size-7" strokeWidth={2.5} />
              </span>
              <h1 className="mt-6 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.04em] text-brand-950">Payouts are set up.</h1>
              <p className="mt-4 text-lg leading-relaxed text-heading-5">Rent paid online now has somewhere to go. One last part and you&apos;re live.</p>
              <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-black/5">
                <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Last: go live · 2 minutes</p>
                <p className="mt-2 text-[15px] leading-relaxed text-heading-4">
                  Add the tenants already living with you (free), look over your booking page, then open for bookings.
                </p>
              </div>
              <button type="button" onClick={() => go("golive")} className={nextButton}>
                Go live <ArrowRight className="size-5 text-brand-300" />
              </button>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <button type="button" onClick={() => go("payments")} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                  Change the payout account
                </button>
                <a href={hostelUrl(hostelId)} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
                  Open {hostelId}.{PLATFORM_HOST}
                </a>
              </div>
            </div>
          )}

          {step === "live" && hostelId && <LiveScreen hostelId={hostelId} hostelName={basics.name} />}
        </div>
        )}

        {showPreview && (
          <aside className="hidden lg:block" aria-label="Preview of your booking page">
            <div className="sticky top-32">
              <BookingPreview basics={basics} />
            </div>
          </aside>
        )}
      </main>

      {/* Phones: the preview is a tap away instead of beside the questions */}
      {showPreview && (
        <PreviewSheet>
          <BookingPreview basics={basics} />
        </PreviewSheet>
      )}
    </div>
  );
}

const nextButton =
  "mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-950 px-8 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)] hover:bg-brand-800 sm:w-auto";

/** The end of sign-up: the link to share, and where to go next. */
function LiveScreen({ hostelId, hostelName }: { hostelId: string; hostelName: string }) {
  const [copied, setCopied] = useState(false);
  const bookingLink = `${hostelUrl(hostelId)}/book`;
  const shareText = `Book a room at ${hostelName} and pay online: ${bookingLink}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is on screen to copy by hand
    }
  };
  const startAnother = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage blocked: nothing saved to clear
    }
    window.location.reload();
  };
  const link = "text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline";
  return (
    <div className="motion-safe:animate-[rise_0.4s_ease-out]">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
        <PartyPopper className="size-7" />
      </span>
      <h1 className="mt-6 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.04em] text-brand-950">{hostelName} is live.</h1>
      <p className="mt-4 text-lg leading-relaxed text-heading-5">Tenants can now book and pay online. Share your booking page everywhere tenants look for rooms.</p>
      <div className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-black/5">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Your booking page</p>
        <p className="mt-2 text-lg font-semibold break-all text-brand-950">{bookingLink.replace(/^https?:\/\//, "")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={copy} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-100 px-5 text-[15px] font-semibold text-brand-900 hover:bg-brand-200">
            {copied ? <Check className="size-4" strokeWidth={3} /> : null}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#e7f6ee] px-5 text-[15px] font-semibold text-[#1f7a4d] hover:bg-[#d5efe1]"
          >
            <MessageCircle className="size-4" /> Share on WhatsApp
          </a>
        </div>
      </div>
      <p className="mt-6 text-[15px] leading-relaxed text-heading-5">
        Your first payout can take a working day longer while Paystack confirms your account. After that, rent arrives the next working day.
      </p>
      <a href={`${hostelUrl(hostelId)}/login`} className={nextButton}>
        Open my dashboard <ArrowRight className="size-5 text-brand-300" />
      </a>
      <div className="mt-6">
        <button type="button" onClick={startAnother} className={link}>
          Set up another hostel
        </button>
      </div>
    </div>
  );
}
