"use client";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { ArrowLeft, ArrowRight, BedDouble, Check, CheckCircle2, Clock, KeyRound, Lock, MessageCircle, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Passport, PhotoPicker } from "@/components/PhotoPicker";
import { BrandLayout } from "@/components/BrandLayout";
import { RoomPicker } from "@/components/RoomPicker";
import { EMPTY_STUDENT, StudentForm, validateStudent } from "@/components/StudentForm";
import { toast } from "@/components/toast";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { authMessage } from "@/lib/auth";
import { auth, db, storage } from "@/lib/firebase";
import type { PublicBookingDoc, StudentInfo } from "@/lib/types";
import { addMonths, cn, formatDate, isBookable, naira, todayISO } from "@/lib/utils";

const STEPS = ["Your details", "Pick a room", "Pay"] as const;

interface Result {
  status: "paid" | "needs_attention" | "pending" | "resolved" | "failed";
  roomId?: string;
  fullName?: string;
  amount?: number;
  receiptNo?: string;
  leaseStart?: string;
  leaseEnd?: string;
  whatsappGroupLink?: string;
}

async function postJSON<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

/** Asks the server to confirm with Paystack; retries briefly because confirmation can lag a few seconds. */
async function confirmPayment(reference: string): Promise<Result> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await postJSON<Result>("/api/bookings/verify", { reference });
    if (r.status !== "pending") return r;
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  return { status: "pending" };
}

/** Signs in as the tenant, creating the account on first use. Returns an ID token for the API. */
async function tenantToken(email: string, password: string) {
  const current = auth.currentUser;
  if (current?.email?.toLowerCase() === email.toLowerCase()) return current.getIdToken();
  try {
    return await (await createUserWithEmailAndPassword(auth, email, password)).user.getIdToken();
  } catch (err) {
    // Came back after an abandoned checkout: same email, so sign in with the same password
    if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
      return await (await signInWithEmailAndPassword(auth, email, password)).user.getIdToken();
    }
    throw err;
  }
}

export default function BookPage() {
  const [pub, setPub] = useState<PublicBookingDoc | null>(null);
  /** Clock for expiring holds: moves on each update and every 30s */
  const [now, setNow] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<StudentInfo>(EMPTY_STUDENT);
  const [photo, setPhoto] = useState<Passport | null>(null);
  const [photoMissing, setPhotoMissing] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agree, setAgree] = useState(false);
  const [agent, setAgent] = useState("");

  const [paying, setPaying] = useState(false);
  const [heldUntil, setHeldUntil] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Latest step/room for the listener below, which outlives individual renders
  const picking = useRef({ step, roomId });
  useEffect(() => {
    picking.current = { step, roomId };
  }, [step, roomId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL on mount
    setAgent(params.get("agent")?.trim().toLowerCase() ?? "");
    // Paystack's redirect fallback returns here with ?reference=
    const reference = params.get("reference") ?? params.get("trxref");
    if (reference) {
      setConfirming(true);
      confirmPayment(reference)
        .then(setResult)
        .catch((err) => toast(err.message, "info"))
        .finally(() => setConfirming(false));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  /*
   * Live availability from ONE document: a read when the page opens, then one read each time
   * any room changes. Rooms turn "taken" in front of the student without refreshing.
   */
  useEffect(() => {
    if (result) return;
    const unsubscribe = onSnapshot(
      doc(db, "public/booking"),
      (snap) => {
        if (!snap.exists()) return setLoadError(true);
        const data = snap.data() as PublicBookingDoc;
        const t = Date.now();
        setPub(data);
        setNow(t);
        setLoadError(false);
        const { step, roomId } = picking.current;
        if (step === 1 && roomId && !isBookable(data, roomId, t, auth.currentUser?.uid)) {
          toast(`Someone just booked room ${roomId}. Please pick another.`, "info");
          setRoomId("");
        }
      },
      () => setLoadError(true),
    );
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      unsubscribe();
      clearInterval(tick);
    };
  }, [result]);

  const goTo = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const nextFromDetails = () => {
    if (!photo) {
      setPhotoMissing(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return toast("Add your passport photograph", "info");
    }
    const err = validateStudent(info, { requireMatric: true });
    if (err) return toast(err, "info");
    goTo(1);
  };

  const nextFromRoom = () => {
    if (!roomId) return toast("Tap a room to select it", "info");
    if (pub && !isBookable(pub, roomId, Date.now(), auth.currentUser?.uid)) {
      toast(`Room ${roomId} was just taken. Please pick another.`, "info");
      return setRoomId("");
    }
    goTo(2);
  };

  const pay = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast("Enter a valid email address", "info");
    if (password.length < 6) return toast("Use a password of at least 6 characters", "info");
    if (password !== password2) return toast("The passwords don't match", "info");
    if (!agree) return toast("Please accept the hostel rules", "info");

    setPaying(true);
    try {
      const token = await tenantToken(email.trim(), password);
      // The photo goes into this tenant's own Storage folder; only the link is saved with the booking
      const photoRef = storageRef(storage, `passports/${auth.currentUser!.uid}/passport.jpg`);
      await uploadBytes(photoRef, photo!.blob, { contentType: "image/jpeg" });
      const photoUrl = await getDownloadURL(photoRef);
      const start = await postJSON<{ reference: string; accessCode: string }>(
        "/api/bookings/start",
        { info: { ...info, email: email.trim(), photoUrl }, roomId, agent: agent || undefined },
        token,
      );
      setHeldUntil(Date.now() + 15 * 60_000);

      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(start.accessCode, {
        onSuccess: async (tx) => {
          setConfirming(true);
          try {
            setResult(await confirmPayment(tx.reference));
          } catch (err) {
            toast(err instanceof Error ? err.message : "Couldn't confirm payment", "info");
          } finally {
            setConfirming(false);
          }
        },
        onCancel: () => toast(`Payment not completed. Room ${roomId} stays reserved for you for 15 minutes.`, "info"),
        onError: (e) => toast(e.message || "Couldn't open the payment window", "info"),
      });
    } catch (err) {
      const message = err instanceof FirebaseError ? authMessage(err) : err instanceof Error ? err.message : "Something went wrong";
      toast(message, "info");
      if (/taken/i.test(message)) {
        setRoomId("");
        goTo(1);
      }
    } finally {
      setPaying(false);
    }
  };

  // Only once the room data has loaded in the browser (the page is prerendered without a clock)
  const leaseStart = pub ? todayISO() : "";
  const leaseEnd = pub ? addMonths(leaseStart, pub.info.leaseMonths) : leaseStart;

  return (
    <BrandLayout
      phoneIllustration={false}
      title={pub ? `Book your room at ${pub.info.hostelName}` : "Book your room"}
      subtitle={pub ? `${naira(pub.info.rentAmount)} per room for ${pub.info.leaseMonths} months · Pay securely online` : undefined}
      action={{ href: "/login", label: "Log in" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {!result && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-grey-950">{pub?.info.hostelName ?? "Book a room"}</h1>
            <p className="mt-1 text-sm text-heading-6">{pub ? `${naira(pub.info.rentAmount)} per room · ${pub.info.leaseMonths} months` : "Loading rooms…"}</p>
          </div>
        )}
        {result ? (
          <Done result={result} />
        ) : confirming ? (
          <section className={cn(CARD, "p-10 text-center")}>
            <span className="mx-auto block size-8 animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent" />
            <p className="mt-4 font-medium text-grey-950">Confirming your payment…</p>
            <p className="mt-1 text-sm text-heading-6">This takes a few seconds. Please don&apos;t close this page.</p>
          </section>
        ) : !pub ? (
          <section className={cn(CARD, "p-10 text-center text-sm text-heading-6")}>
            {loadError ? (
              <>
                Couldn&apos;t load available rooms. Check your connection; this page will update once you&apos;re back online.
              </>
            ) : (
              "Loading…"
            )}
          </section>
        ) : (
          <>
            <Stepper step={step} onStep={goTo} />

            {step === 0 && (
              <div className="space-y-6">
                <FormCard>
                  <div className="mb-7">
                    <PhotoPicker
                      value={photo}
                      error={photoMissing && !photo}
                      onChange={(p) => {
                        setPhoto(p);
                        setPhotoMissing(false);
                      }}
                    />
                  </div>
                  <StudentForm value={info} onChange={setInfo} maxOccupants={pub.info.maxOccupants} hideEmail requireMatric />
                </FormCard>
                <StepActions>
                  <Button className="h-12 flex-1 rounded-xl text-[15px]" onClick={nextFromDetails}>
                    Choose a room <ArrowRight className="size-4" />
                  </Button>
                </StepActions>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <FormCard
                  icon={BedDouble}
                  title="Pick your room"
                  description={`Choose the room you were shown. Rent is per room, for up to ${pub.info.maxOccupants} people.`}
                >
                  <RoomPicker doc={pub} now={now} value={roomId} onChange={setRoomId} />
                </FormCard>
                <StepActions>
                  <Button variant="secondary" className="h-12 rounded-xl" onClick={() => goTo(0)} aria-label="Back">
                    <ArrowLeft className="size-4" /> <span className="max-sm:hidden">Back</span>
                  </Button>
                  <Button className="h-12 flex-1 rounded-xl text-[15px]" onClick={nextFromRoom} disabled={!roomId}>
                    {roomId ? `Continue with room ${roomId}` : "Select a room"} <ArrowRight className="size-4" />
                  </Button>
                </StepActions>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <FormCard icon={ReceiptText} title="Booking summary">
                  <div className="mb-4 flex items-center gap-3 rounded-xl bg-grey-10 p-3">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- local preview
                      <img src={photo.url} alt="" className="size-12 rounded-xl object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-grey-950">{info.fullName}</p>
                      <p className="truncate text-xs text-heading-6">{info.isStudent === false ? info.phone : `${info.matricNo} · ${info.department}`}</p>
                    </div>
                  </div>
                  <dl className="divide-y divide-grey-100 text-sm">
                    <Row label="Room" value={`${roomId} · Block ${pub.rooms[roomId]?.block}`} />
                    <Row label="Rent period" value={`${formatDate(leaseStart)} – ${formatDate(leaseEnd)}`} />
                    {info.occupants.length > 0 && <Row label="Sharing with" value={info.occupants.map((o) => o.fullName).join(", ")} />}
                    <div className="flex items-center justify-between pt-3">
                      <dt className="font-medium text-grey-950">Total</dt>
                      <dd className="text-lg font-semibold text-grey-950">{naira(pub.info.rentAmount)}</dd>
                    </div>
                  </dl>
                  {heldUntil > 0 && (
                    <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Clock className="size-3.5 shrink-0" /> Room {roomId} is reserved for you until{" "}
                      {new Date(heldUntil).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}.
                    </p>
                  )}
                </FormCard>

                <FormCard icon={KeyRound} title="Create your tenant login" description="You'll use this to log in to your portal for receipts, repairs and renewals.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email" required className="sm:col-span-2" hint="Your receipt is sent here">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                    </Field>
                    <Field label="Password" required hint="At least 6 characters">
                      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                    </Field>
                    <Field label="Confirm password" required>
                      <PasswordInput value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
                      {password2 && (
                        <span className={cn("mt-1 flex items-center gap-1 text-xs", password2 === password ? "text-emerald-700" : "text-heading-6")}>
                          {password2 === password ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                          {password2 === password ? "Passwords match" : "Doesn't match yet"}
                        </span>
                      )}
                    </Field>
                  </div>
                  <label className="mt-5 flex items-start gap-3 text-sm text-slate-700">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                    I confirm my details are correct and I agree to abide by the hostel rules and regulations.
                  </label>
                </FormCard>

                <StepActions>
                  <Button variant="secondary" className="h-12 rounded-xl" onClick={() => goTo(1)} disabled={paying} aria-label="Back">
                    <ArrowLeft className="size-4" /> <span className="max-sm:hidden">Back</span>
                  </Button>
                  <Button className="h-12 flex-1 rounded-xl text-[15px]" onClick={pay} disabled={paying}>
                    <Lock className="size-4" /> {paying ? "Opening payment…" : `Pay ${naira(pub.info.rentAmount)}`}
                  </Button>
                </StepActions>
                <p className="flex items-center justify-center gap-1.5 text-xs text-heading-6">
                  <ShieldCheck className="size-3.5" /> Secured by Paystack. Card, bank transfer or USSD.
                </p>
              </div>
            )}
          </>
        )}
        {agent && !result && <p className="mt-6 text-center text-xs text-heading-6">Referred by <span className="capitalize">{agent}</span></p>}
        <p className="mt-8 text-center text-xs text-heading-6">Powered by HostelHub</p>
      </div>
    </BrandLayout>
  );
}

// Timings for the progress animation: the line fills, then the next circle fills in.
const LINE_MS = 450;
const CIRCLE_MS = 280;

function Stepper({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  // Which way we last moved decides the order: forward = line then circle, back = circle then line
  const [prev, setPrev] = useState(step);
  const [forward, setForward] = useState(true);
  if (step !== prev) {
    setForward(step > prev);
    setPrev(step);
  }

  return (
    <nav aria-label="Booking progress" className="mb-8">
      <ol className="flex items-center">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          const filled = done || current;
          // Forward: the newly reached circle waits for its line to arrive. Back: circles empty first.
          const circleDelay = forward && current && i > 0 ? LINE_MS - 40 : 0;
          const lineDelay = forward ? 0 : CIRCLE_MS - 60;
          return (
            <li key={label} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              {/* Finished steps can be tapped to go back and edit */}
              <button
                type="button"
                disabled={!done}
                onClick={() => onStep(i)}
                aria-current={current ? "step" : undefined}
                className="group flex items-center gap-2.5 rounded-full disabled:cursor-default"
              >
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-grey-150 bg-white text-sm font-semibold tabular-nums">
                  {/* soft ring around the current step */}
                  <span
                    className={cn(
                      "absolute -inset-[5px] rounded-full bg-brand-100 transition-[opacity,transform] ease-out motion-reduce:transition-none",
                      current ? "scale-100 opacity-100" : "scale-75 opacity-0",
                    )}
                    style={{ transitionDuration: `${CIRCLE_MS}ms`, transitionDelay: `${current ? circleDelay + 80 : 0}ms` }}
                  />
                  {/* the fill grows out from the centre */}
                  <span
                    className={cn(
                      "absolute -inset-px rounded-full bg-brand-600 transition-transform ease-out group-hover:bg-brand-700 motion-reduce:transition-none",
                      filled ? "scale-100" : "scale-0",
                    )}
                    style={{ transitionDuration: `${CIRCLE_MS}ms`, transitionDelay: `${circleDelay}ms` }}
                  />
                  <span
                    className={cn("relative transition-colors", filled ? "text-white" : "text-heading-6")}
                    style={{ transitionDuration: `${CIRCLE_MS}ms`, transitionDelay: `${circleDelay}ms` }}
                  >
                    {done ? <Check className="size-4 animate-[pop-in_.2s_ease-out]" strokeWidth={3} /> : i + 1}
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium whitespace-nowrap transition-colors sm:block",
                    current ? "text-grey-950" : done ? "text-heading-4 group-hover:text-brand-700" : "text-heading-6",
                  )}
                  style={{ transitionDelay: `${circleDelay}ms` }}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-grey-100">
                  <span
                    className={cn("block h-full origin-left rounded-full bg-brand-600 transition-transform ease-in-out motion-reduce:transition-none", done ? "scale-x-100" : "scale-x-0")}
                    style={{ transitionDuration: `${LINE_MS}ms`, transitionDelay: `${lineDelay}ms` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-heading-6 sm:hidden">
        Step {step + 1} of {STEPS.length} · <span className="font-medium text-grey-950">{STEPS[step]}</span>
      </p>
    </nav>
  );
}

const CARD = "rounded-2xl border border-grey-100 bg-white shadow-[0_1px_3px_rgba(16,16,16,0.04)]";

function FormCard({ icon: Icon, title, description, children }: { icon?: LucideIcon; title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className={cn(CARD, "p-5 sm:p-6")}>
      {title && (
        <header className="mb-5 flex items-start gap-3">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="size-4.5" strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-grey-950">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-heading-6">{description}</p>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

/** Back / Continue buttons: pinned to the bottom of the screen on phones so they're always in reach. */
function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 flex gap-3 border-t border-grey-100 bg-white/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-heading-6">{label}</dt>
      <dd className="text-right font-medium text-grey-950">{value}</dd>
    </div>
  );
}

function Done({ result }: { result: Result }) {
  if (result.status === "paid" || result.status === "resolved") {
    return (
      <section className={cn(CARD, "p-6 sm:p-8")}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h2 className="mt-4 text-xl font-medium text-grey-950">Room {result.roomId} is yours!</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">
            Payment confirmed. Welcome, {result.fullName?.split(" ")[0]}. You&apos;re now registered as a tenant.
          </p>
        </div>
        <dl className="mt-6 divide-y divide-grey-100 rounded-xl border border-grey-100 px-4 text-sm">
          <Row label="Receipt" value={result.receiptNo} />
          <Row label="Amount paid" value={naira(result.amount ?? 0)} />
          <Row label="Room" value={result.roomId} />
          <Row label="Rent period" value={`${formatDate(result.leaseStart)} – ${formatDate(result.leaseEnd)}`} />
        </dl>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/portal"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-btn-primary hover:bg-brand-700"
          >
            Go to my portal <ArrowRight className="size-4" />
          </Link>
          {result.whatsappGroupLink && (
            <a
              href={result.whatsappGroupLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-grey-150 bg-white px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              <MessageCircle className="size-4" /> Join the hostel WhatsApp group
            </a>
          )}
        </div>
      </section>
    );
  }
  if (result.status === "needs_attention") {
    return (
      <section className={cn(CARD, "p-8 text-center")}>
        <CheckCircle2 className="mx-auto size-14 text-amber-500" />
        <h2 className="mt-4 text-xl font-medium text-grey-950">Payment received</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">
          Room {result.roomId} was taken just before your payment went through. Your money is safe: the hostel manager has been notified and will allocate you
          another room shortly.
        </p>
      </section>
    );
  }
  return (
    <section className={cn(CARD, "p-8 text-center")}>
      <Clock className="mx-auto size-14 text-heading-6" />
      <h2 className="mt-4 text-xl font-medium text-grey-950">{result.status === "failed" ? "Payment didn't go through" : "Still confirming your payment"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">
        {result.status === "failed"
          ? "No money was taken. You can go back and try again."
          : "This can take a minute. If you were debited, your room will be confirmed automatically. Log in to your portal later to check."}
      </p>
      {result.status === "failed" ? (
        // Full reload to clear the form state
        <a href="/book" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Start again
        </a>
      ) : (
        <Link href="/portal" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Go to my portal
        </Link>
      )}
    </section>
  );
}
