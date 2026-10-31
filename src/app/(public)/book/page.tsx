"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { ArrowLeft, ArrowRight, BedDouble, Check, CheckCircle2, Clock, KeyRound, Lock, MessageCircle, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookingWaiting } from "@/components/BookingWaiting";
import { GoogleButton, GoogleG, OrDivider, SigningIn } from "@/components/GoogleButton";
import { type Passport, PhotoPicker } from "@/components/PhotoPicker";
import { BrandLayout } from "@/components/BrandLayout";
import { RoomPicker } from "@/components/RoomPicker";
import { EMPTY_STUDENT, StudentForm, validateStudent } from "@/components/StudentForm";
import { toast } from "@/components/toast";
import { Button, Field, Input, PasswordInput } from "@/components/ui";
import { authMessage } from "@/lib/auth";
import { firstPayment, leaseFor, mayStay, optionRent, stayLength } from "@/lib/checkout";
import { listingPath } from "@/lib/current-hostel";
import { isResuming, resumeUrl, saveDraft, takeDraft } from "@/lib/form-draft";
import { useGoogleReturning } from "@/lib/google-auth";
import { bedOf, spaceLabel } from "@/lib/spaces";
import { auth, db, storage } from "@/lib/firebase";
import type { PublicBookingDoc, StudentInfo } from "@/lib/types";
import { addMonths, cn, formatDate, isBookable, naira, todayISO } from "@/lib/utils";

const STEPS = ["Your details", "Pick a room", "Pay"] as const;
/** The half-filled booking, kept while the student signs in with Google */
const draftKey = "hostelhub:book-draft";
/** Paystack test keys: hostels still signing up can be tried here with test payments. */
const TEST_SITE = !!process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.startsWith("pk_test_");

interface Result {
  status: "paid" | "needs_attention" | "pending" | "resolved" | "failed";
  /** For a pending booking: Paystack may still complete it, or the student never paid */
  payment?: "processing" | "not_paid";
  reference?: string;
  roomId?: string;
  roomLabel?: string;
  spaceId?: string;
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
  if (!res.ok) throw new Error(data.error ?? `The server couldn't process this (error ${res.status}). Please try again shortly.`);
  return data as T;
}

/** Asks the server to confirm with Paystack; retries briefly because confirmation can lag a few seconds. */
async function confirmPayment(reference: string): Promise<Result> {
  // After a Paystack redirect the login is still being restored; verify only answers its owner
  await auth.authStateReady();
  let last: Result = { status: "pending", payment: "processing", reference };
  for (let attempt = 0; attempt < 5; attempt++) {
    last = await postJSON<Result>("/api/bookings/verify", { reference }, await auth.currentUser?.getIdToken());
    if (last.status !== "pending" || last.payment === "not_paid") return last;
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  return { ...last, reference };
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
      try {
        return await (await signInWithEmailAndPassword(auth, email, password)).user.getIdToken();
      } catch {
        // Different password: the email belongs to an existing account
        throw new Error("This email already has a HostelHub account. Use a different email, or enter that account's password. Forgot it? Reset it from the login page.");
      }
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
  /** The stay picked (a rent option id); empty = the hostel's usual one */
  const [periodId, setPeriodId] = useState("");
  // Rooms and blocks by the names tenants know ("Ruby 2", "Ruby"); older hostels' ids are their names
  const roomLabel = (id: string) => pub?.rooms[id]?.label || id;
  const blockLabel = (id: string | undefined) => (id ? (pub?.info.blockNames?.[id] ?? `Block ${id}`) : "");
  // The stays students can pick, and the one picked (or the hostel's usual one)
  const options = pub?.info.options ?? [];
  const option = options.find((o) => o.id === periodId) ?? options.find((o) => o.id === pub?.info.defaultOptionId) ?? options[0] ?? null;
  const [agent, setAgent] = useState("");
  // Back from Google sign-in: the form as they left it, at the step where they were
  useEffect(() => {
    if (!isResuming()) return;
    takeDraft<{ info: StudentInfo; roomId: string; periodId: string; agent: string }>(draftKey).then((draft) => {
      if (!draft) return;
      setInfo(draft.data.info);
      setRoomId(draft.data.roomId);
      setPeriodId(draft.data.periodId);
      setAgent(draft.data.agent);
      setPhoto(draft.photo);
      setStep(2);
    });
  }, []);

  /** Signed in on this hostel's address (with Google, or from an earlier booking) */
  const [me, setMe] = useState<User | null>(null);
  const googleReturning = useGoogleReturning();
  const viaGoogle = !!me?.providerData.some((p) => p.providerId === "google.com");
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setMe(u);
        // Google gives us their name: one less thing to type
        if (u?.displayName) setInfo((i) => (i.fullName ? i : { ...i, fullName: u.displayName! }));
      }),
    [],
  );

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
      doc(db, listingPath()),
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
    const type = pub?.info.roomTypes?.find((t) => t.id === pub.rooms[roomId]?.typeId);
    if (type?.pricingMode === "per_room" && info.occupants.length + 1 > type.capacity) {
      return toast(`Room ${roomLabel(roomId)} is a ${type.name.toLowerCase()}: up to ${type.capacity} people including you. Remove someone from "Room occupants" or pick a bigger room.`, "info");
    }
    if (pub && !isBookable(pub, roomId, Date.now(), auth.currentUser?.uid)) {
      toast(`Room ${roomLabel(roomId)} was just taken. Please pick another.`, "info");
      return setRoomId("");
    }
    goTo(2);
  };

  const pay = async () => {
    // Signed in already (Google): that login is the tenant's; otherwise they make one here
    if (!me) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast("Enter a valid email address", "info");
      if (password.length < 6) return toast("Use a password of at least 6 characters", "info");
      if (password !== password2) return toast("The passwords don't match", "info");
    }
    if (!agree) return toast("Please accept the hostel rules", "info");
    const loginEmail = me?.email ?? email.trim();

    setPaying(true);
    try {
      const token = me ? await me.getIdToken() : await tenantToken(loginEmail, password);
      // The photo goes into this tenant's own Storage folder; only the link is saved with the booking
      const photoRef = storageRef(storage, `passports/${auth.currentUser!.uid}/passport.jpg`);
      await uploadBytes(photoRef, photo!.blob, { contentType: "image/jpeg" });
      const photoUrl = await getDownloadURL(photoRef);
      const start = await postJSON<{ reference: string; accessCode: string }>(
        "/api/bookings/start",
        { info: { ...info, email: loginEmail, photoUrl }, roomId, periodId: option?.id, agent: agent || undefined },
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
        onCancel: () => toast(`Payment not completed. Room ${roomLabel(roomId)} stays reserved for you for 15 minutes.`, "info"),
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

  // Prices come from each room's type and the stay picked; per-bed hostels show beds instead of rooms
  const types = pub?.info.roomTypes ?? [];
  const perBed = types.some((t) => t.pricingMode === "per_bed");
  const unit = perBed ? "bed" : "room";
  const chosenType = pub && roomId ? (types.find((t) => t.id === pub.rooms[roomId]?.typeId) ?? null) : null;
  const rentOf = (t: (typeof types)[number]) => optionRent(t, option?.id);
  // What they pay: rent, the hostel's extra charges, and the service fee when the hostel takes payouts
  const payment = chosenType ? firstPayment(chosenType, option?.id, pub?.info.charges ?? [], !!pub?.info.serviceFee) : null;
  const price = payment?.total ?? pub?.info.rentAmount ?? 0;
  const prices = [...new Set(types.map(rentOf))];
  const priceLine = !pub ? "" : prices.length > 1 ? `From ${naira(Math.min(...prices))} per ${unit}` : `${naira(prices[0] ?? pub.info.rentAmount)} per ${unit}`;

  // Only once the room data has loaded in the browser (the page is prerendered without a clock)
  const leaseStart = pub ? todayISO() : "";
  const lease = option && leaseStart ? leaseFor(option, leaseStart) : null;
  const leaseEnd = lease?.end ?? (pub ? addMonths(leaseStart, pub.info.leaseMonths) : leaseStart);
  const stayText = !pub ? "" : option ? stayLength(option) : `${pub.info.leaseMonths} months`;

  return (
    <BrandLayout
      phoneIllustration={false}
      title={pub ? `Book your room at ${pub.info.hostelName}` : "Book your room"}
      subtitle={pub ? `${priceLine} · ${stayText} · Pay securely online` : undefined}
      action={{ href: "/login", label: "Log in" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {!result && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-grey-950">{pub?.info.hostelName ?? "Book a room"}</h1>
            <p className="mt-1 text-sm text-heading-6">{pub ? `${priceLine} · ${stayText}` : "Loading rooms…"}</p>
          </div>
        )}
        {result ? (
          <Done result={result} managerPhone={pub?.info.managerPhone} />
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
        ) : pub.info.open === false && !TEST_SITE ? (
          <section className={cn(CARD, "p-10 text-center")}>
            <p className="text-lg font-semibold text-grey-950">Opening soon</p>
            <p className="mt-2 text-sm text-heading-6">
              {pub.info.hostelName} isn&apos;t taking bookings online yet.{pub.info.managerPhone ? ` To ask about a room, call ${pub.info.managerPhone}.` : ""}
            </p>
          </section>
        ) : (
          <>
            {pub.info.open === false && (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <b>Preview.</b> This hostel isn&apos;t live yet. On this test site you can try a booking with Paystack&apos;s test payments.
              </p>
            )}
            <Stepper step={step} onStep={goTo} />

            {step === 0 && (
              <div className="space-y-6">
                {me && (
                  <p className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-950">
                    {viaGoogle && <GoogleG className="size-4" />} Booking as <b>{me.email}</b>
                    <button type="button" onClick={() => void auth.signOut()} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
                      Not you?
                    </button>
                  </p>
                )}
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
                  <StudentForm value={info} onChange={setInfo} maxOccupants={perBed ? 1 : pub.info.maxOccupants} hideEmail requireMatric />
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
                  description={
                    perBed
                      ? "Choose the room you were shown. Rent is per bed; you'll get the next free bed in that room."
                      : `Choose the room you were shown. Rent is per room, for up to ${pub.info.maxOccupants} people.`
                  }
                >
                  {options.length > 1 && (
                    <div className="mb-5" role="radiogroup" aria-label="How long are you staying?">
                      <p className="mb-2 text-sm font-medium text-heading-2">How long are you staying?</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {options.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={o.id === option?.id}
                            onClick={() => setPeriodId(o.id)}
                            className={cn("rounded-xl border p-3 text-left transition-colors", o.id === option?.id ? "border-brand-600 bg-brand-50" : "border-grey-150 hover:border-brand-300")}
                          >
                            <span className="block text-sm font-semibold text-grey-950">{o.name}</span>
                            <span className="block text-xs text-heading-6">{stayLength(o)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <RoomPicker
                    doc={pub}
                    now={now}
                    value={roomId}
                    onChange={setRoomId}
                    uid={auth.currentUser?.uid}
                    // Only blocks this person may stay in (female-only, male-only…)
                    allowBlock={(b) => mayStay(pub.info.blockWho?.[b], info.sex)}
                  />
                  {chosenType && (
                    <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
                      Room {roomLabel(roomId)} · {chosenType.name} · <span className="font-semibold">{naira(rentOf(chosenType))}</span> per {chosenType.pricingMode === "per_bed" ? "bed" : "room"}
                    </p>
                  )}
                </FormCard>
                <StepActions>
                  <Button variant="secondary" className="h-12 rounded-xl" onClick={() => goTo(0)} aria-label="Back">
                    <ArrowLeft className="size-4" /> <span className="max-sm:hidden">Back</span>
                  </Button>
                  <Button className="h-12 flex-1 rounded-xl text-[15px]" onClick={nextFromRoom} disabled={!roomId}>
                    {roomId ? `Continue with room ${roomLabel(roomId)}` : "Select a room"} <ArrowRight className="size-4" />
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
                    <Row label="Room" value={`${roomLabel(roomId)} · ${blockLabel(pub.rooms[roomId]?.block)}${chosenType ? ` · ${chosenType.name}` : ""}`} />
                    {perBed && <Row label="Bed" value="The next free bed, confirmed after payment" />}
                    <Row label="Rent period" value={`${formatDate(leaseStart)} – ${formatDate(leaseEnd)}`} />
                    {info.occupants.length > 0 && <Row label="Sharing with" value={info.occupants.map((o) => o.fullName).join(", ")} />}
                    {payment && (payment.lines.length > 1 || payment.fee > 0) && (
                      <div className="space-y-1.5 py-3">
                        {payment.lines.map((l) => (
                          <div key={l.label} className="flex justify-between gap-3">
                            <dt className="text-heading-6">
                              {l.label === "Rent" && option ? `Rent, ${option.name.toLowerCase()}` : l.label}
                              {l.refundable && " (refundable)"}
                            </dt>
                            <dd className="text-heading-2 tabular-nums">{naira(l.amount)}</dd>
                          </div>
                        ))}
                        {payment.fee > 0 && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-heading-6">Service fee</dt>
                            <dd className="text-heading-2 tabular-nums">{naira(payment.fee)}</dd>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-3">
                      <dt className="font-medium text-grey-950">Total</dt>
                      <dd className="text-lg font-semibold text-grey-950">{naira(price)}</dd>
                    </div>
                  </dl>
                  {heldUntil > 0 && (
                    <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Clock className="size-3.5 shrink-0" /> Room {roomId} is reserved for you until{" "}
                      {new Date(heldUntil).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}.
                    </p>
                  )}
                </FormCard>

                <FormCard
                  icon={KeyRound}
                  title={me ? "Your tenant login" : "Create your tenant login"}
                  description="You'll use this to log in to your portal for receipts, repairs and renewals."
                >
                  {googleReturning ? (
                    <SigningIn />
                  ) : me ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-grey-10 p-3 text-sm">
                      {viaGoogle && <GoogleG className="size-5" />}
                      <span className="min-w-0 flex-1 truncate">
                        Signed in as <b>{me.email}</b>
                      </span>
                      <button type="button" onClick={() => void auth.signOut()} className="text-xs font-medium text-brand-700 hover:underline">
                        Not you?
                      </button>
                    </div>
                  ) : (
                  <>
                  {/* Google first: no password to make up or forget. The form is kept while they're away. */}
                  <GoogleButton returnTo={resumeUrl()} beforeLeave={() => saveDraft(draftKey, { info, roomId, periodId, agent }, photo)} />
                  <OrDivider label="or use your email" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email" required className="sm:col-span-2" hint="You log in with this, and a password reset link comes here. Use one you can open.">
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
                  </>
                  )}
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
                    <Lock className="size-4" /> {paying ? "Opening payment…" : `Pay ${naira(price)}`}
                  </Button>
                </StepActions>
                <p className="flex items-center justify-center gap-1.5 text-xs text-heading-6">
                  <ShieldCheck className="size-3.5" /> Secured by Paystack. Card, transfer, OPay or USSD.
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

function Done({ result, managerPhone }: { result: Result; managerPhone?: string }) {
  if (result.status === "paid" || result.status === "resolved") {
    return (
      <section className={cn(CARD, "p-6 sm:p-8")}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h2 className="mt-4 text-xl font-medium text-grey-950">
            {bedOf(result.spaceId, result.roomId) ? `Bed ${bedOf(result.spaceId, result.roomId)} in room ${result.roomLabel ?? result.roomId} is yours!` : `Room ${result.roomLabel ?? result.roomId} is yours!`}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">
            Payment confirmed. Welcome, {result.fullName?.split(" ")[0]}. You&apos;re now registered as a tenant.
          </p>
        </div>
        <dl className="mt-6 divide-y divide-grey-100 rounded-xl border border-grey-100 px-4 text-sm">
          <Row label="Receipt" value={result.receiptNo} />
          <Row label="Amount paid" value={naira(result.amount ?? 0)} />
          <Row label="Room" value={spaceLabel(result.roomLabel ?? result.roomId, result.spaceId && result.roomLabel ? result.spaceId.replace(result.roomId ?? "", result.roomLabel) : result.spaceId).replace(/^Room /, "")} />
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
    return <BookingWaiting kind="received" reference={result.reference} managerPhone={managerPhone} className={cn(CARD, "p-8")} />;
  }
  if (result.status === "failed" || result.payment === "not_paid") {
    return (
      <section className={cn(CARD, "p-8 text-center")}>
        <Clock className="mx-auto size-14 text-heading-6" />
        <h2 className="mt-4 text-xl font-medium text-grey-950">Payment didn&apos;t go through</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-heading-6">No money was taken. You can go back and try again.</p>
        {/* Full reload to clear the form state */}
        <a href="/book" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Start again
        </a>
      </section>
    );
  }
  return (
    <BookingWaiting kind="processing" reference={result.reference} managerPhone={managerPhone} className={cn(CARD, "p-8")}>
      <div>
        <Link href="/portal" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Check from my portal
        </Link>
      </div>
    </BookingWaiting>
  );
}
