"use client";

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { ChevronRight, KeyRound, LogOut, MessageCircle, Pencil, Phone, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "@/components/toast";
import { Avatar, Button, Field, Input, PasswordInput, Select } from "@/components/ui";
import { authMessage, signOut } from "@/lib/auth";
import { hostelPath } from "@/lib/current-hostel";
import { auth, db } from "@/lib/firebase";
import { resolveFaculty } from "@/lib/academics";
import { roomName, useTenant } from "@/lib/tenant-store";
import type { Resident } from "@/lib/types";
import { academicLine, cn, formatDate, whatsappLink } from "@/lib/utils";

const PHONE = /^\+?\d{10,14}$/;

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-grey-100 bg-white">
      <header className="flex items-center justify-between px-4 pt-4 pb-1">
        <h2 className="text-sm font-semibold text-grey-950">{title}</h2>
        {action}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-grey-100 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-heading-6">{label}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-grey-950">{value || <span className="font-normal text-grey-400">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
      <Pencil className="size-3.5" /> Edit
    </button>
  );
}

/** Saves only the fields a tenant is allowed to change (see firestore.rules). */
async function saveOwn(id: string, patch: Partial<Pick<Resident, "phone" | "homeAddress" | "nextOfKinName" | "nextOfKinPhone" | "nextOfKinRelationship">>) {
  await updateDoc(doc(db, hostelPath(`residents/${id}`)), patch);
}

function ContactSection({ r }: { r: Resident }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(r.phone);
  const [address, setAddress] = useState(r.homeAddress);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!PHONE.test(phone.replace(/[\s-]/g, ""))) return toast("Enter a valid phone number", "info");
    setBusy(true);
    try {
      await saveOwn(r.id, { phone: phone.trim(), homeAddress: address.trim() });
      toast("Contact details updated");
      setEditing(false);
    } catch {
      toast("Couldn't save. Please try again.", "info");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Personal details" action={!editing && <EditButton onClick={() => setEditing(true)} />}>
      {editing ? (
        <div className="space-y-3 pt-2">
          <Field label="Phone number" hint="WhatsApp number preferred">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Home address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <Rows
          rows={[
            ["Phone", r.phone],
            ["Email", r.email],
            ["Sex", r.sex],
            ["State of origin", r.stateOfOrigin],
            ["Home address", r.homeAddress],
          ]}
        />
      )}
    </Section>
  );
}

function KinSection({ r }: { r: Resident }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.nextOfKinName);
  const [phone, setPhone] = useState(r.nextOfKinPhone);
  const [relationship, setRelationship] = useState(r.nextOfKinRelationship);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast("Enter your next of kin's name", "info");
    if (!PHONE.test(phone.replace(/[\s-]/g, ""))) return toast("Enter a valid phone number", "info");
    setBusy(true);
    try {
      await saveOwn(r.id, { nextOfKinName: name.trim(), nextOfKinPhone: phone.trim(), nextOfKinRelationship: relationship });
      toast("Next of kin updated");
      setEditing(false);
    } catch {
      toast("Couldn't save. Please try again.", "info");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Next of kin" action={!editing && <EditButton onClick={() => setEditing(true)} />}>
      {editing ? (
        <div className="space-y-3 pt-2">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Relationship">
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="">Select</option>
                {["Father", "Mother", "Guardian", "Brother", "Sister", "Uncle", "Aunt", "Spouse", "Other"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <Rows
          rows={[
            ["Name", r.nextOfKinName],
            ["Relationship", r.nextOfKinRelationship],
            ["Phone", r.nextOfKinPhone],
          ]}
        />
      )}
    </Section>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const user = auth.currentUser;
    if (!user?.email) return;
    if (next.length < 6) return toast("Use a new password of at least 6 characters", "info");
    setBusy(true);
    try {
      // Firebase asks for the current password again before changing it
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      toast("Password changed");
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch (err) {
      toast(authMessage(err), "info");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 py-3 text-left">
        <ActionIcon icon={KeyRound} />
        <span className="flex-1 text-sm font-medium text-grey-950">Change password</span>
        <ChevronRight className={cn("size-4 text-heading-6 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-3 pb-3">
          <Field label="Current password">
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 6 characters">
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button className="w-full" onClick={save} disabled={busy || !current || !next}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActionIcon({ icon: Icon, tint = "bg-grey-50 text-heading-4" }: { icon: LucideIcon; tint?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tint)}>
      <Icon className="size-4.5" strokeWidth={1.8} />
    </span>
  );
}

function LinkRow({ href, icon, tint, label, hint }: { href: string; icon: LucideIcon; tint?: string; label: string; hint?: string }) {
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 py-3">
      <ActionIcon icon={icon} tint={tint} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-grey-950">{label}</span>
        {hint && <span className="block truncate text-xs text-heading-6">{hint}</span>}
      </span>
      <ChevronRight className="size-4 text-heading-6" />
    </a>
  );
}

export default function ProfilePage() {
  const t = useTenant();
  const r = t.resident!;
  const info = t.info;
  const student = r.isStudent !== false;

  return (
    <div className="space-y-4">
      <section className="flex flex-col items-center rounded-2xl border border-grey-100 bg-white px-4 py-6 text-center">
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small Storage image
          <img src={r.photoUrl} alt={r.fullName} className="size-24 rounded-3xl object-cover ring-4 ring-brand-50" />
        ) : (
          <Avatar name={r.fullName} size="lg" />
        )}
        <h1 className="mt-3 text-lg font-semibold text-grey-950">{r.fullName}</h1>
        <p className="text-sm text-heading-6">{academicLine(r)}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">Room {roomName(t, r.roomId)}</span>
          <span className="rounded-full bg-grey-50 px-2.5 py-1 font-medium text-heading-4">Since {formatDate(r.checkInDate)}</span>
        </div>
      </section>

      <ContactSection r={r} />

      {student && (
        <Section title="Academic details">
          <Rows
            rows={[
              ["Faculty", resolveFaculty(r.faculty, r.department)],
              ["Course", r.department],
              ["Level", r.level ? `${r.level} Level` : ""],
              ["Matric no.", r.matricNo],
            ]}
          />
        </Section>
      )}

      <KinSection r={r} />

      <Section title="Roommates">
        {r.occupants.length === 0 ? (
          <p className="py-2 text-sm text-heading-6">You live alone. Ask the manager if someone is joining you.</p>
        ) : (
          <ul className="divide-y divide-grey-100">
            {r.occupants.map((o) => (
              <li key={o.fullName} className="flex items-center gap-3 py-2.5">
                <Avatar name={o.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-grey-950">{o.fullName}</span>
                  <span className="block text-xs text-heading-6">
                    {o.phone} · {academicLine(o, true)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Hostel">
        <div className="divide-y divide-grey-100">
          {info?.managerPhone && (
            <>
              <LinkRow href={`tel:${info.managerPhone}`} icon={Phone} tint="bg-brand-50 text-brand-600" label={`Call ${info.managerName || "the manager"}`} hint={info.managerPhone} />
              <LinkRow
                href={whatsappLink(info.managerPhone, `Hello, this is ${r.fullName} in room ${roomName(t, r.roomId)}.`)}
                icon={MessageCircle}
                tint="bg-emerald-50 text-emerald-700"
                label="WhatsApp the manager"
              />
            </>
          )}
          {info?.whatsappGroupLink && <LinkRow href={info.whatsappGroupLink} icon={Users} tint="bg-emerald-50 text-emerald-700" label="Hostel WhatsApp group" />}
        </div>
      </Section>

      <Section title="Account">
        <div className="divide-y divide-grey-100">
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="text-heading-6">Login email</span>
            <span className="truncate font-medium text-grey-950">{auth.currentUser?.email}</span>
          </div>
          <PasswordSection />
        </div>
      </Section>

      <button
        onClick={() => signOut()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-grey-100 bg-white text-sm font-medium text-rose-600 hover:bg-rose-50"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
