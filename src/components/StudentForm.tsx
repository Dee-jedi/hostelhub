"use client";

import { Plus, Trash2 } from "lucide-react";
import { coursesIn, DEPARTMENTS, LEVELS, resolveFaculty, STATES } from "@/lib/academics";
import type { Occupant, StudentInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, Input, Select } from "./ui";

export const EMPTY_STUDENT: StudentInfo = {
  isStudent: true,
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

const EMPTY_OCCUPANT: Occupant = { isStudent: true, fullName: "", phone: "", department: "", level: "100" };

export function validateStudent(s: StudentInfo, opts: { requireMatric?: boolean } = {}): string | null {
  const student = s.isStudent !== false;
  if (s.fullName.trim().split(/\s+/).length < 2) return "Please enter your full name (first and last name).";
  if (!/^\+?\d{10,14}$/.test(s.phone.replace(/[\s-]/g, ""))) return "Enter a valid phone number, e.g. 08031234567.";
  if (student && !resolveFaculty(s.faculty, s.department)) return "Select your faculty.";
  if (student && !s.department) return "Select your course of study.";
  if (student && opts.requireMatric && !s.matricNo.trim()) return "Enter your matric / reg. number.";
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

/**
 * Faculty, then course of study. The course list only shows the chosen faculty's courses,
 * and stays locked until a faculty is picked.
 */
function CourseFields({
  faculty,
  department,
  onChange,
  required,
}: {
  faculty?: string;
  department: string;
  onChange: (patch: { faculty: string; department: string }) => void;
  required?: boolean;
}) {
  const current = resolveFaculty(faculty, department);
  const courses = coursesIn(current);
  return (
    <>
      <Field label="Faculty" required={required}>
        <Select
          searchable
          searchPlaceholder="Search faculties…"
          value={current}
          onChange={(e) => {
            const next = e.target.value;
            const options = coursesIn(next);
            // Keep the course if it still fits; a faculty with a single course picks it automatically
            const keep = options.includes(department) ? department : options.length === 1 ? options[0] : "";
            onChange({ faculty: next, department: keep });
          }}
        >
          <option value="">Select faculty</option>
          {DEPARTMENTS.map((f) => (
            <option key={f.faculty}>{f.faculty}</option>
          ))}
        </Select>
      </Field>
      <Field label="Course of study" required={required}>
        <Select
          key={current}
          searchable
          searchPlaceholder="Search courses…"
          disabled={!current}
          value={department}
          onChange={(e) => onChange({ faculty: current, department: e.target.value })}
        >
          <option value="">{current ? "Select course" : "Pick a faculty first"}</option>
          {courses.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}

function OccupantsEditor({ value, onChange, maxOccupants }: { value: Occupant[]; onChange: (v: Occupant[]) => void; maxOccupants: number }) {
  const max = Math.max(0, maxOccupants - 1);
  const update = (i: number, patch: Partial<Occupant>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-3">
      {value.map((o, i) => (
        <div key={i} className="rounded-xl border border-grey-100 bg-grey-10 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium whitespace-nowrap text-heading-4">Occupant {i + 1}</span>
            <div
              className="ml-auto grid grid-cols-2 gap-0.5 rounded-lg border border-grey-100 bg-white p-0.5"
              role="radiogroup"
              aria-label={`Occupant ${i + 1} type`}
            >
              {[
                { v: true, label: "Student" },
                { v: false, label: "Not a student" },
              ].map((opt) => {
                const on = (o.isStudent !== false) === opt.v;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => update(i, opt.v ? { isStudent: true, level: o.level || "100" } : { isStudent: false, faculty: "", department: "", level: "" })}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap",
                      on ? "bg-brand-50 text-brand-700" : "text-heading-6 hover:text-heading-4",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
            {o.isStudent !== false && (
              <CourseFields faculty={o.faculty} department={o.department} onChange={(patch) => update(i, patch)} />
            )}
            {o.isStudent !== false && (
              <Field label="Level">
                <Select value={o.level} onChange={(e) => update(i, { level: e.target.value })}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l} Level
                    </option>
                  ))}
                </Select>
              </Field>
            )}
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

export function StudentForm({
  value,
  onChange,
  maxOccupants,
  hideEmail,
  requireMatric,
}: {
  value: StudentInfo;
  onChange: (v: StudentInfo) => void;
  /** People allowed per room, including the tenant */
  maxOccupants: number;
  /** The booking form asks for email separately, as the login */
  hideEmail?: boolean;
  requireMatric?: boolean;
}) {
  const set = <K extends keyof StudentInfo>(key: K, v: StudentInfo[K]) => onChange({ ...value, [key]: v });
  const student = value.isStudent !== false;

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-grey-100 bg-grey-10 p-1" role="radiogroup" aria-label="Tenant type">
        {[
          { v: true, label: "I'm a student" },
          { v: false, label: "Not a student" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={student === o.v}
            onClick={() => set("isStudent", o.v)}
            className={
              student === o.v
                ? "rounded-lg bg-white py-2 text-sm font-medium text-brand-700 shadow-sm"
                : "rounded-lg py-2 text-sm font-medium text-heading-6 hover:text-heading-4"
            }
          >
            {o.label}
          </button>
        ))}
      </div>

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
        <Field label="Phone number" required hint="WhatsApp number preferred">
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08031234567" inputMode="tel" autoComplete="tel" />
        </Field>
        {!hideEmail && (
          <Field label="Email">
            <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
        )}
        <Field label="State of origin">
          <Select searchable searchPlaceholder="Search states…" value={value.stateOfOrigin} onChange={(e) => set("stateOfOrigin", e.target.value)}>
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

      {student && (
        <Section title="Academic details">
          <CourseFields faculty={value.faculty} department={value.department} onChange={(patch) => onChange({ ...value, ...patch })} required />
          <Field label="Level" required>
            <Select value={value.level} onChange={(e) => set("level", e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l} Level
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Matric / Reg. number" required={requireMatric}>
            <Input value={value.matricNo} onChange={(e) => set("matricNo", e.target.value)} placeholder="e.g. 22/ENG/045" />
          </Field>
        </Section>
      )}

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
        <p className="mb-3 text-xs text-heading-6">Anyone who will stay in the room with you. For record keeping only — rent is per room.</p>
        <OccupantsEditor value={value.occupants ?? []} onChange={(occupants) => set("occupants", occupants)} maxOccupants={maxOccupants} />
      </fieldset>
    </div>
  );
}
