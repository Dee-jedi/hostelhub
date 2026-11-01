"use client";

import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ImportRoom } from "@/app/api/tenants/import/route";
import { Button, Modal } from "@/components/ui";
import { auth } from "@/lib/firebase";
import { isNigerianPhone, normalizePhone } from "@/lib/onboarding";
import { type Cell, type Field, FIELD_LABELS, cellText, guessColumns, matchRoom, parseCsv, parseDate, parseSex } from "@/lib/sheet-import";
import type { Sex } from "@/lib/types";
import { addMonths, cn, todayISO } from "@/lib/utils";

/*
 * Adding the tenants a hostel already has from its spreadsheet: pick an Excel or CSV file, check
 * which column is which (guessed from the headers), review every row (problems flagged, fixable
 * in place), then add them all. Free on the same terms as the join link.
 */

type Stage = "pick" | "columns" | "review" | "done";

interface Entry {
  include: boolean;
  fullName: string;
  phone: string;
  sex: Sex;
  roomId: string;
  paidUntil: string;
  /** What the sheet said, for rows that couldn't be matched */
  roomText: string;
  dateText: string;
  error?: string;
}

const COLUMN_FIELDS: Field[] = ["name", "firstName", "lastName", "phone", "room", "block", "paidUntil", "sex"];
const REQUIRED: Field[] = ["phone", "room", "paidUntil"];
const BATCH = 50;

const TEMPLATE = "Full name,Phone,Sex,Room,Rent paid until\nChidi Okeke,08031234567,Male,A1,31/07/2027\nAmaka Eze,08039876543,Female,A2,30/06/2027\n";

async function api<T>(body: object): Promise<T> {
  await auth.authStateReady();
  const res = await fetch("/api/tenants/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

/** The sheet's rows: Excel through read-excel-file (loaded only now), CSV read here. */
async function readFile(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(await file.text());
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as Cell[][];
}

/** Problems with a row, worded for the manager; empty when it's ready to add. */
function problemsOf(e: Entry, rooms: ImportRoom[], wanted: Map<string, number>): string[] {
  const out: string[] = [];
  const today = todayISO();
  if (e.fullName.trim().split(/\s+/).length < 2) out.push("Needs first and last name");
  if (!isNigerianPhone(e.phone)) out.push("Phone number isn't valid");
  const room = rooms.find((r) => r.id === e.roomId);
  if (!room) out.push(e.roomText ? `No room called “${e.roomText}”` : "Pick a room");
  else {
    if ((wanted.get(room.id) ?? 0) > room.free) out.push(`${room.label} hasn't space for everyone listed in it`);
    if (room.who !== "any" && room.who !== e.sex.toLowerCase()) out.push(`${room.block} is for ${room.who} tenants`);
  }
  if (!e.paidUntil) out.push(e.dateText ? `Can't read the date “${e.dateText}”` : "Add the date rent is paid until");
  else if (e.paidUntil <= today) out.push("Rent date has passed");
  else if (e.paidUntil > addMonths(today, 36)) out.push("Rent date is more than 3 years away");
  return out;
}

export function ImportTenants({ hostelId, open, onClose, onAdded }: { hostelId: string; open: boolean; onClose: () => void; onAdded?: (count: number) => void }) {
  const [stage, setStage] = useState<Stage>("pick");
  const [rooms, setRooms] = useState<ImportRoom[] | null>(null);
  const [free, setFree] = useState(true);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Cell[][]>([]);
  const [columns, setColumns] = useState<Record<Field, number> | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

  // The rooms to match against, fresh each time the window opens
  useEffect(() => {
    if (!open) return;
    api<{ rooms: ImportRoom[]; open: boolean }>({ hostelId, action: "rooms" }).then(
      (d) => (setRooms(d.rooms), setFree(d.open)),
      (err: Error) => setProblem(err.message),
    );
  }, [open, hostelId]);

  const reset = () => {
    setStage("pick");
    setSheet([]);
    setColumns(null);
    setEntries([]);
    setProblem(null);
    setAdded(0);
    setFileName("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      const rows = (await readFile(file)).filter((r) => r.some((c) => cellText(c)));
      if (rows.length < 2) throw new Error("That file has no tenants in it: the first row should be the column names, then one tenant per row.");
      setFileName(file.name);
      setSheet(rows);
      setColumns(guessColumns(rows[0].map((c) => cellText(c))));
      setStage("columns");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't read that file. Save it as .xlsx or .csv and try again.");
    } finally {
      setBusy(false);
    }
  };

  const headers = sheet[0]?.map((c) => cellText(c)) ?? [];
  const hasName = !!columns && (columns.name >= 0 || columns.firstName >= 0);
  const missing = columns ? REQUIRED.filter((f) => columns[f] < 0) : [];

  // Columns chosen: every row becomes an entry, matched to a room and checked
  const toReview = () => {
    if (!columns || !rooms) return;
    const at = (row: Cell[], f: Field) => (columns[f] >= 0 ? row[columns[f]] : null);
    setEntries(
      sheet.slice(1).map((row) => {
        const name = columns.name >= 0 ? cellText(at(row, "name")) : [cellText(at(row, "firstName")), cellText(at(row, "lastName"))].filter(Boolean).join(" ");
        const roomText = cellText(at(row, "room"));
        const room = matchRoom(roomText, cellText(at(row, "block")), rooms);
        const who = rooms.find((r) => r.id === room?.id)?.who;
        return {
          include: true,
          fullName: name,
          phone: normalizePhone(cellText(at(row, "phone"))),
          // From the sheet, else from the block (a female-only block), else male to start with
          sex: parseSex(at(row, "sex")) ?? (who === "female" ? "Female" : "Male"),
          roomId: room?.id ?? "",
          paidUntil: parseDate(at(row, "paidUntil")) ?? "",
          roomText,
          dateText: cellText(at(row, "paidUntil")),
        };
      }),
    );
    setStage("review");
  };

  const wanted = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e) => e.include && e.roomId && m.set(e.roomId, (m.get(e.roomId) ?? 0) + 1));
    return m;
  }, [entries]);
  const checked = entries.map((e) => (rooms ? problemsOf(e, rooms, wanted) : []));
  const ready = entries.filter((e, i) => e.include && !checked[i].length);
  const flagged = entries.filter((e, i) => e.include && checked[i].length).length;

  const edit = (i: number, patch: Partial<Entry>) => setEntries((list) => list.map((e, j) => (j === i ? { ...e, ...patch, error: undefined } : e)));

  const addAll = async () => {
    setBusy(true);
    setProblem(null);
    let count = 0;
    const left: Entry[] = [];
    try {
      const sendable = entries.map((e, i) => ({ e, ok: e.include && !checked[i].length }));
      const queue = sendable.filter((s) => s.ok).map((s) => s.e);
      for (let i = 0; i < queue.length; i += BATCH) {
        const part = queue.slice(i, i + BATCH);
        const { results } = await api<{ results: { ok: boolean; error?: string }[] }>({
          hostelId,
          action: "import",
          rows: part.map((e) => ({ fullName: e.fullName, phone: e.phone, sex: e.sex, roomId: e.roomId, paidUntil: e.paidUntil })),
        });
        results.forEach((r, j) => (r.ok ? count++ : left.push({ ...part[j], error: r.error })));
      }
      // What's left: rows the server turned down, plus the ones that weren't ready
      left.push(...sendable.filter((s) => !s.ok && s.e.include).map((s) => s.e));
      setAdded((n) => n + count);
      onAdded?.(count);
      if (left.length) {
        setEntries(left);
        setProblem(`${count} added. ${left.length} still need${left.length === 1 ? "s" : ""} fixing below.`);
      } else setStage("done");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't add them. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "hostelhub-tenants.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const field = "h-9 w-full rounded-lg border border-grey-150 bg-white px-2 text-sm text-grey-950 outline-none focus:border-brand-500";

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Import tenants from a spreadsheet"
      description={stage === "pick" ? "Excel (.xlsx) or CSV. One tenant per row." : fileName}
      footer={
        stage === "columns" ? (
          <>
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button onClick={toReview} disabled={!hasName || missing.length > 0 || !rooms}>
              Check the rows
            </Button>
          </>
        ) : stage === "review" ? (
          <>
            <Button variant="secondary" onClick={() => setStage("columns")} disabled={busy}>
              Back
            </Button>
            <Button onClick={addAll} disabled={busy || !ready.length}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Adding…" : `Add ${ready.length} tenant${ready.length === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : stage === "done" ? (
          <Button onClick={close}>Done</Button>
        ) : undefined
      }
    >
      {!free ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Free importing has closed for this hostel. Add tenants one by one from Residents.</p>
      ) : stage === "pick" ? (
        <div className="space-y-4">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-grey-150 bg-grey-10 px-6 py-10 text-center hover:border-brand-300 hover:bg-brand-50/40",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? <Loader2 className="size-8 animate-spin text-brand-600" /> : <FileSpreadsheet className="size-8 text-brand-600" />}
            <span className="text-[15px] font-semibold text-grey-950">{busy ? "Reading your file…" : "Choose your tenant list"}</span>
            <span className="text-sm text-heading-6">From Excel, Google Sheets (download as .xlsx or .csv) or any spreadsheet app</span>
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white">
              <Upload className="size-4" /> Choose file
            </span>
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => (void pickFile(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
          <div className="rounded-xl bg-white p-4 text-sm text-heading-5 ring-1 ring-grey-100">
            <p className="font-medium text-grey-950">What the sheet needs</p>
            <p className="mt-1">A header row, then one tenant per row with their <b>name</b>, <b>phone</b>, <b>room</b> and the date their <b>rent is paid until</b>. Sex is optional.</p>
            <button type="button" onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
              <Download className="size-4" /> Download a template
            </button>
          </div>
          {problem && <p className="text-sm text-rose-600">{problem}</p>}
        </div>
      ) : stage === "columns" && columns ? (
        <div className="space-y-4">
          <p className="text-sm text-heading-5">We matched your columns. Check each one, and change any we got wrong.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLUMN_FIELDS.filter((f) => !(columns.name >= 0 && (f === "firstName" || f === "lastName"))).map((f) => (
              <label key={f} className="text-xs font-medium text-heading-4">
                {FIELD_LABELS[f]}
                {REQUIRED.includes(f) || f === "name" ? " *" : " (optional)"}
                <select className={cn(field, "mt-1")} value={columns[f]} onChange={(e) => setColumns({ ...columns, [f]: Number(e.target.value) })}>
                  <option value={-1}>Not in my sheet</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {(!hasName || missing.length > 0) && (
            <p className="text-sm text-rose-600">Choose the column for {[!hasName && "the name", ...missing.map((f) => FIELD_LABELS[f].toLowerCase())].filter(Boolean).join(", ")}.</p>
          )}
          <p className="text-xs text-heading-6">{sheet.length - 1} tenants in this file.</p>
        </div>
      ) : stage === "review" && rooms ? (
        <div className="space-y-3">
          <p className="text-sm text-heading-5">
            <b className="text-grey-950">{ready.length}</b> ready to add
            {flagged ? (
              <>
                {" "}
                · <b className="text-rose-700">{flagged}</b> need a fix (change it below, or untick to skip)
              </>
            ) : null}
          </p>
          {problem && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{problem}</p>}
          <ul className="divide-y divide-grey-100 rounded-xl ring-1 ring-grey-100">
            {entries.map((e, i) => {
              const issues = [...(e.error ? [e.error] : []), ...checked[i]];
              return (
                <li key={i} className={cn("grid gap-2 p-3 sm:grid-cols-[auto_1.4fr_1fr_1fr_1fr_auto] sm:items-center", !e.include && "opacity-50")}>
                  <input type="checkbox" checked={e.include} onChange={(ev) => edit(i, { include: ev.target.checked })} className="size-4 accent-brand-700" aria-label={`Add ${e.fullName}`} />
                  <input className={field} value={e.fullName} onChange={(ev) => edit(i, { fullName: ev.target.value })} aria-label="Full name" placeholder="Full name" />
                  <input className={field} value={e.phone} onChange={(ev) => edit(i, { phone: ev.target.value })} aria-label="Phone" placeholder="Phone" inputMode="tel" />
                  <select className={field} value={e.roomId} onChange={(ev) => edit(i, { roomId: ev.target.value })} aria-label="Room">
                    <option value="">{e.roomText ? `“${e.roomText}”?` : "Room"}</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} · {r.block}
                        {r.free === 0 ? " (full)" : ""}
                      </option>
                    ))}
                  </select>
                  <input className={field} type="date" value={e.paidUntil} onChange={(ev) => edit(i, { paidUntil: ev.target.value })} aria-label="Rent paid until" />
                  <select className={cn(field, "sm:w-24")} value={e.sex} onChange={(ev) => edit(i, { sex: ev.target.value as Sex })} aria-label="Sex">
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                  {e.include && (
                    <p className={cn("flex items-start gap-1.5 text-xs sm:col-span-6 sm:pl-7", issues.length ? "text-rose-700" : "text-brand-700")}>
                      {issues.length ? <CircleAlert className="mt-px size-3.5 shrink-0" /> : <CheckCircle2 className="mt-px size-3.5 shrink-0" />}
                      {issues.length ? issues.join(" · ") : "Ready"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : stage === "done" ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-brand-600" />
          <p className="mt-3 text-lg font-semibold text-grey-950">
            {added} tenant{added === 1 ? "" : "s"} added
          </p>
          <p className="mt-1 text-sm text-heading-6">They&apos;re in their rooms now, with their rent dates, on your dashboard.</p>
        </div>
      ) : (
        <p className="flex items-center gap-2 py-8 text-sm text-heading-6">
          <Loader2 className="size-4 animate-spin" /> Loading your rooms…
        </p>
      )}
    </Modal>
  );
}
