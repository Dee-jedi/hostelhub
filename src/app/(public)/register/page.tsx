"use client";

import { Building2, CheckCircle2, Landmark, MessageCircle } from "lucide-react";
import { useState } from "react";
import { EMPTY_STUDENT, StudentForm, validateStudent } from "@/components/StudentForm";
import { toast } from "@/components/toast";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { submitApplication, useHostel, useIsClient } from "@/lib/store";
import type { StudentInfo } from "@/lib/types";
import { availableRooms, naira } from "@/lib/utils";

function RegisterForm() {
  const s = useHostel();
  const [info, setInfo] = useState<StudentInfo>(EMPTY_STUDENT);
  const [preferredBlock, setPreferredBlock] = useState("");
  const [reference, setReference] = useState("");
  const [agree, setAgree] = useState(false);
  const [done, setDone] = useState(false);

  const free = availableRooms(s);
  const blocks = s.settings.blocks;
  const vacantIn = (block: string) => free.filter((r) => r.block === block).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStudent(info);
    if (err) return toast(err, "info");
    if (!agree) return toast("Please accept the hostel rules", "info");
    submitApplication(info, preferredBlock, reference.trim());
    setDone(true);
    window.scrollTo({ top: 0 });
  };

  if (done) {
    return (
      <Card bodyClassName="p-8 text-center">
        <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
        <h2 className="mt-4 text-xl font-medium text-slate-900">Registration received!</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Thank you, {info.fullName.split(" ")[0]}. The hostel management will confirm your payment and allocate your room. You&apos;ll get an SMS once it&apos;s done.
        </p>
        {s.settings.whatsappGroupLink && (
          <a
            href={s.settings.whatsappGroupLink}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <MessageCircle className="size-4" /> Join the hostel WhatsApp group
          </a>
        )}
        <div className="mt-4">
          <button
            onClick={() => {
              setInfo(EMPTY_STUDENT);
              setReference("");
              setAgree(false);
              setDone(false);
            }}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Register another student
          </button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card bodyClassName="p-5 sm:p-6">
        <StudentForm value={info} onChange={setInfo} />
      </Card>

      <Card bodyClassName="p-5 sm:p-6">
        <p className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Room preference & payment</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred block" hint="Subject to availability">
            <Select value={preferredBlock} onChange={(e) => setPreferredBlock(e.target.value)}>
              <option value="">No preference</option>
              {blocks.map((b) => (
                <option key={b.name} value={b.name} disabled={vacantIn(b.name) === 0}>
                  Block {b.name} {vacantIn(b.name) === 0 ? "(full)" : `(${vacantIn(b.name)} vacant rooms)`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment reference" hint="Transaction ID or teller number, if you have paid">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
          <Landmark className="mt-0.5 size-4 shrink-0" />
          <div>
            Rent is <span className="font-semibold">{naira(s.settings.rentAmount)}</span> per room for {s.settings.leaseMonths} months. Pay to{" "}
            <span className="font-semibold">
              {s.settings.bankName} · {s.settings.accountNumber}
            </span>{" "}
            ({s.settings.accountName}).
          </div>
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
          I confirm the information above is correct and I agree to abide by the hostel rules and regulations.
        </label>
      </Card>

      <Button type="submit" className="w-full py-3 text-base">
        Submit registration
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  const isClient = useIsClient();
  const s = useHostel();
  return (
    <div className="min-h-screen bg-grey-10">
      <header className="flex h-14 items-center border-b border-grey-100 bg-white px-4 sm:px-6">
        <span className="inline-flex items-start text-[17px] leading-none font-semibold tracking-tight text-grey-950">
          hostel<span className="text-brand-600">hub</span>
        </span>
      </header>
      <div className="border-b border-grey-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600">
            <Building2 className="size-5" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-medium text-grey-950">{isClient ? s.settings.hostelName : "Hostel"} Registration</h1>
            <p className="text-sm text-heading-6">Fill this form to secure a room. It takes about 2 minutes.</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-6">
        {isClient ? <RegisterForm /> : <Card bodyClassName="p-10 text-center text-sm text-slate-500">Loading form…</Card>}
        <p className="mt-8 text-center text-xs text-heading-6">Powered by HostelHub</p>
      </div>
    </div>
  );
}
