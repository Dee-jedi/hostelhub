"use client";

import { Plus, Trash2 } from "lucide-react";
import { DEPARTMENTS, LEVELS, STATES } from "@/lib/seed";
import { useHostel } from "@/lib/store";
import type { Occupant, StudentInfo } from "@/lib/types";
import { Field, Input, Select } from "./ui";

export const EMPTY_STUDENT: StudentInfo = {
  fullName: "",
  sex: "Male",
  phone: "",
  email: "",
  matricNo: "",
  department: "",
  faculty: "",
  level: "100",
  stateOfOrigin: "",
  homeAddress: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  nextOfKinRelationship: "",
  occupants: [],
};

const EMPTY_OCCUPANT: Occupant = { fullName: "", phone: "", department: "", level: "100" };

export function validateStudent(s: StudentInfo): string | null {
  if (s.fullName.trim().split(/\s+/).length < 2) return "Please enter your full name (first and last name).";
  if (!/^\+?\d{10,14}$/.test(s.phone.replace(/[\s-]/g, ""))) return "Enter a valid phone number, e.g. 08031234567.";
  if (!s.department) return "Select a department.";
  if (!s.nextOfKinName.trim()) return "Next of kin name is required.";
  if (!/^\+?\d{10,14}$/.test(s.nextOfKinPhone.replace(/[\s-]/g, ""))) return "Enter a valid next of kin phone number.";
  for (const [i, o] of s.occupants.entries()) {
    if (o.fullName.trim().split(/\s+/).length < 2) return `Enter the full name of occupant ${i + 1}.`;
    if (!/^\+?\d{10,14}$/.test(o.phone.replace(/[\s-]/g, ""))) return `Enter a valid phone number for occupant ${i + 1}.`;
  }
  return null;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-heading-6">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function OccupantsEditor({ value, onChange }: { value: Occupant[]; onChange: (v: Occupant[]) => void }) {
  const max = Math.max(0, useHostel().settings.maxOccupants - 1);
  const update = (i: number, patch: Partial<Occupant>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-3">
      {value.map((o, i) => (
        <div key={i} className="rounded-xl border border-grey-100 bg-grey-10 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-heading-4">Occupant {i + 1}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="rounded-lg p-1 text-heading-6 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Remove occupant ${i + 1}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={o.fullName} onChange={(e) => update(i, { fullName: e.target.value })} />
            </Field>
            <Field label="Phone number" required>
              <Input value={o.phone} onChange={(e) => update(i, { phone: e.target.value })} inputMode="tel" placeholder="08031234567" />
            </Field>
            <Field label="Department">
              <Select value={o.department} onChange={(e) => update(i, { department: e.target.value })}>
                <option value="">Select department</option>
                {DEPARTMENTS.map((f) => (
                  <optgroup key={f.faculty} label={f.faculty}>
                    {f.departments.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="Level">
              <Select value={o.level} onChange={(e) => update(i, { level: e.target.value })}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} Level
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      ))}
      {value.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...value, { ...EMPTY_OCCUPANT }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-grey-150 py-2.5 text-sm font-medium text-heading-5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          <Plus className="size-4" /> Add occupant
        </button>
      ) : (
        <p className="text-xs text-heading-6">Maximum of {max + 1} people per room.</p>
      )}
    </div>
  );
}

export function StudentForm({ value, onChange }: { value: StudentInfo; onChange: (v: StudentInfo) => void }) {
  const set = <K extends keyof StudentInfo>(key: K, v: StudentInfo[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-7">
      <Section title="Personal details">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Chioma Okafor" autoComplete="name" />
        </Field>
        <Field label="Sex" required>
          <Select value={value.sex} onChange={(e) => set("sex", e.target.value as StudentInfo["sex"])}>
            <option>Male</option>
            <option>Female</option>
          </Select>
        </Field>
        <Field label="Phone number" required hint="WhatsApp number preferred — reminders are sent here">
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08031234567" inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label="Email">
          <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </Field>
        <Field label="State of origin">
          <Select value={value.stateOfOrigin} onChange={(e) => set("stateOfOrigin", e.target.value)}>
            <option value="">Select state</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Home address" className="sm:col-span-2">
          <Input value={value.homeAddress} onChange={(e) => set("homeAddress", e.target.value)} placeholder="House number, street, city" />
        </Field>
      </Section>

      <Section title="Academic details">
        <Field label="Department" required>
          <Select
            value={value.department}
            onChange={(e) => {
              const dept = e.target.value;
              const faculty = DEPARTMENTS.find((f) => f.departments.includes(dept))?.faculty ?? "";
              onChange({ ...value, department: dept, faculty });
            }}
          >
            <option value="">Select department</option>
            {DEPARTMENTS.map((f) => (
              <optgroup key={f.faculty} label={f.faculty}>
                {f.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Level" required>
          <Select value={value.level} onChange={(e) => set("level", e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} Level
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Matric / Reg. number">
          <Input value={value.matricNo} onChange={(e) => set("matricNo", e.target.value)} placeholder="e.g. 22/ENG/045" />
        </Field>
      </Section>

      <Section title="Next of kin">
        <Field label="Full name" required>
          <Input value={value.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} />
        </Field>
        <Field label="Relationship">
          <Select value={value.nextOfKinRelationship} onChange={(e) => set("nextOfKinRelationship", e.target.value)}>
            <option value="">Select</option>
            {["Father", "Mother", "Guardian", "Brother", "Sister", "Uncle", "Aunt", "Spouse", "Other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Phone number" required>
          <Input value={value.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} inputMode="tel" placeholder="08031234567" />
        </Field>
      </Section>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase">Room occupants</legend>
        <p className="mb-3 text-xs text-heading-6">Anyone who will stay in the room with the tenant. For record keeping only — rent is per room.</p>
        <OccupantsEditor value={value.occupants ?? []} onChange={(occupants) => set("occupants", occupants)} />
      </fieldset>
    </div>
  );
}
