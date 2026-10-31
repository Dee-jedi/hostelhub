"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { CheckCircle2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLayout } from "@/components/BrandLayout";
import { GoogleButton, GoogleG, OrDivider, SigningIn } from "@/components/GoogleButton";
import { type Passport, PhotoPicker } from "@/components/PhotoPicker";
import { EMPTY_STUDENT, StudentForm, validateStudent } from "@/components/StudentForm";
import { Button, Field, Input, PasswordInput, Select } from "@/components/ui";
import { authMessage } from "@/lib/auth";
import { listingPath } from "@/lib/current-hostel";
import { isResuming, resumeUrl, saveDraft, takeDraft } from "@/lib/form-draft";
import { useGoogleReturning } from "@/lib/google-auth";
import { auth, db, storage } from "@/lib/firebase";
import type { PublicBookingDoc, StudentInfo } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";

/*
 * The join link page (/join/{code}): tenants who already live in the hostel add themselves, with no
 * payment. Their manager approves each one; then the room is theirs on HostelHub and they can
 * log in to the portal.
 */

/** The half-filled form, kept while the tenant signs in with Google */
const draftKey = "hostelhub:join-draft";

const CARD ="rounded-2xl border border-grey-100 bg-white p-5 shadow-[0_1px_3px_rgba(16,16,16,0.04)] sm:p-6";

/** Signs in as the tenant, creating the login on first use. */
async function tenantToken(email: string, password: string) {
  if (auth.currentUser?.email?.toLowerCase() === email.toLowerCase()) return auth.currentUser.getIdToken();
  try {
    return await (await createUserWithEmailAndPassword(auth, email, password)).user.getIdToken();
  } catch (err) {
    if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
      try {
        return await (await signInWithEmailAndPassword(auth, email, password)).user.getIdToken();
      } catch {
        throw new Error("This email already has a HostelHub login, and that isn't its password. Use another email, or reset the password from the login page.");
      }
    }
    throw err;
  }
}

export function JoinForm() {
  const { code } = useParams<{ code: string }>();
  const [hostelName, setHostelName] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [pub, setPub] = useState<PublicBookingDoc | null>(null);

  const [info, setInfo] = useState<StudentInfo>(EMPTY_STUDENT);
  const [photo, setPhoto] = useState<Passport | null>(null);
  const [roomId, setRoomId] = useState("");
  const [movedIn, setMovedIn] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  /** Signed in on this hostel's address (with Google, usually) */
  const [me, setMe] = useState<User | null>(null);
  const googleReturning = useGoogleReturning();
  const viaGoogle = !!me?.providerData.some((p) => p.providerId === "google.com");
  const loginEmail = me?.email ?? email.trim();
  // Back from Google sign-in: the form as they left it
  useEffect(() => {
    if (!isResuming()) return;
    takeDraft<{ info: StudentInfo; roomId: string; movedIn: string; paidUntil: string }>(draftKey).then((draft) => {
      if (!draft) return;
      setInfo(draft.data.info);
      setRoomId(draft.data.roomId);
      setMovedIn(draft.data.movedIn);
      setPaidUntil(draft.data.paidUntil);
      setPhoto(draft.photo);
    });
  }, []);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setMe(u);
        if (u?.displayName) setInfo((i) => (i.fullName ? i : { ...i, fullName: u.displayName! }));
      }),
    [],
  );

  // The link and the room list: two reads, once
  useEffect(() => {
    fetch(`/api/join?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = (await res.json()) as { hostelName?: string; error?: string };
        if (!res.ok || !data.hostelName) throw new Error(data.error ?? "This link isn't working.");
        setHostelName(data.hostelName);
      })
      .catch((err: Error) => setLinkProblem(err.message));
    getDoc(doc(db, listingPath())).then(
      (snap) => snap.exists() && setPub(snap.data() as PublicBookingDoc),
      () => setLinkProblem("Couldn't load the rooms. Check your connection and refresh."),
    );
  }, [code]);

  const rooms = pub
    ? Object.entries(pub.rooms)
        .map(([id, r]) => ({ id, label: r.label ?? id, block: pub.info.blockNames?.[r.block] ?? r.block, number: r.number }))
        .sort((a, b) => a.block.localeCompare(b.block) || a.number - b.number)
    : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const p =
      (!photo && "Add a passport photograph.") ||
      validateStudent(info) ||
      (!roomId && "Pick your room.") ||
      (!movedIn && "Pick the month you moved in.") ||
      ((!paidUntil || paidUntil <= todayISO()) && "Pick the date your rent is paid until.") ||
      // Signed in with Google already: that's their login, no email or password to type
      (!me && !/^\S+@\S+\.\S+$/.test(email.trim()) && "Enter your email: you'll log in with it.") ||
      (!me && password.length < 6 && "Choose a password of at least 6 characters.");
    if (p) return setProblem(p);
    setBusy(true);
    try {
      const token = me ? await me.getIdToken() : await tenantToken(email.trim(), password);
      const photoRef = storageRef(storage, `passports/${auth.currentUser!.uid}/passport.jpg`);
      await uploadBytes(photoRef, photo!.blob, { contentType: "image/jpeg" });
      const photoUrl = await getDownloadURL(photoRef);
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, info: { ...info, email: loginEmail, photoUrl }, roomId, movedIn, paidUntil }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't send. Please try again.");
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setProblem(err instanceof FirebaseError ? authMessage(err) : err instanceof Error ? err.message : "Couldn't send. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrandLayout phoneIllustration={false} title={hostelName ? `Join ${hostelName} on HostelHub` : "Join your hostel"} subtitle="For tenants already living here" action={{ href: "/login", label: "Log in" }}>
      <div className="mx-auto w-full max-w-2xl">
        {sent ? (
          <section className={cn(CARD, "text-center")}>
            <CheckCircle2 className="mx-auto size-10 text-brand-600" />
            <h1 className="mt-4 text-xl font-semibold text-grey-950">Sent to your manager</h1>
            <p className="mt-2 text-sm leading-relaxed text-heading-6">
              Once they confirm you live in {hostelName}, log in with <b>{me ? `Google (${loginEmail})` : loginEmail}</b> to see your room, receipts and rent reminders.
            </p>
            <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-brand-700 hover:underline">
              Go to log in
            </Link>
          </section>
        ) : linkProblem ? (
          <section className={cn(CARD, "text-center")}>
            <p className="font-semibold text-grey-950">This link isn&apos;t working</p>
            <p className="mt-2 text-sm text-heading-6">{linkProblem}</p>
          </section>
        ) : !hostelName || !pub ? (
          <section className={cn(CARD, "text-center text-sm text-heading-6")}>Loading…</section>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-grey-950">Join {hostelName}</h1>
              <p className="mt-1 text-sm leading-relaxed text-heading-6">
                Already living here? Add your details so your room, receipts and rent reminders are in one place. There&apos;s nothing to pay: your manager confirms you, then you can log
                in.
              </p>
            </div>

            {me && (
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-950">
                {viaGoogle && <GoogleG className="size-4" />} Joining as <b>{me.email}</b>
                <button type="button" onClick={() => void auth.signOut()} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
                  Not you?
                </button>
              </p>
            )}

            <section className={CARD}>
              <div className="mb-7">
                <PhotoPicker value={photo} onChange={setPhoto} />
              </div>
              <StudentForm value={info} onChange={setInfo} maxOccupants={1} hideEmail />
            </section>

            <section className={cn(CARD, "space-y-5")}>
              <h2 className="text-base font-semibold text-grey-950">Your room and rent</h2>
              <Field label="Your room" required>
                <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} searchable searchPlaceholder="Search rooms…">
                  <option value="">Pick your room</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} · {r.block}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="When did you move in?" required>
                  <Input type="month" max={todayISO().slice(0, 7)} value={movedIn} onChange={(e) => setMovedIn(e.target.value)} />
                </Field>
                <Field label="Rent paid until" hint="The day your current rent runs out" required>
                  <Input type="date" min={todayISO()} value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
                </Field>
              </div>
            </section>

            {googleReturning ? (
              <SigningIn />
            ) : !me && (
              <section className={cn(CARD, "space-y-5")}>
                <h2 className="text-base font-semibold text-grey-950">Your login</h2>
                {/* Google first; what they've filled in is kept while they're away */}
                <GoogleButton returnTo={resumeUrl()} beforeLeave={() => saveDraft(draftKey, { info, roomId, movedIn, paidUntil }, photo)} />
                <OrDivider label="or use your email" />
                <Field label="Email" hint="You log in with this, and password resets come here." required>
                  <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Password" hint="At least 6 characters" required>
                  <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              </section>
            )}

            {problem && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{problem}</p>}
            <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl text-[15px]">
              <UserPlus className="size-4" /> {busy ? "Sending…" : "Send to my manager"}
            </Button>
          </form>
        )}
      </div>
    </BrandLayout>
  );
}
