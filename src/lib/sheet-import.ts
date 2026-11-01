/*
 * Reading a hostel's tenant spreadsheet (Excel or CSV): which column is which, dates in the
 * forms people actually type (day first, as in Nigeria), sex, and which room each row means.
 * No browser or server code here, so it's tested on its own (sheet-import.test.ts).
 */

export type Cell = string | number | boolean | Date | null | undefined;

export type Field = "name" | "firstName" | "lastName" | "phone" | "sex" | "room" | "block" | "paidUntil";

export const FIELD_LABELS: Record<Field, string> = {
  name: "Full name",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  sex: "Sex",
  room: "Room",
  block: "Block",
  paidUntil: "Rent paid until",
};

/** Column headers people use for each field (compared without case, spaces or punctuation). */
const HEADER_WORDS: Record<Field, string[]> = {
  name: ["fullname", "name", "tenantname", "tenant", "studentname", "student", "occupant", "names"],
  firstName: ["firstname", "first", "givenname", "forename"],
  lastName: ["lastname", "surname", "last", "familyname"],
  phone: ["phone", "phonenumber", "phoneno", "mobile", "mobilenumber", "tel", "telephone", "whatsapp", "whatsappnumber", "gsm", "contact", "number"],
  sex: ["sex", "gender", "mf"],
  room: ["room", "roomno", "roomnumber", "roomname", "space", "bedspace", "flat", "unit"],
  block: ["block", "wing", "building", "hall", "floor"],
  paidUntil: ["paiduntil", "rentpaiduntil", "rentends", "rentend", "expiry", "expirydate", "expires", "enddate", "end", "duedate", "due", "nextdue", "renewal", "renewaldate", "leaseend", "validtill", "validuntil", "paidtill"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which column holds which field, guessed from the header row. -1 when there's no such column. */
export function guessColumns(headers: string[]): Record<Field, number> {
  const keys = headers.map((h) => squash(String(h ?? "")));
  const found = {} as Record<Field, number>;
  const taken = new Set<number>();
  // Exact header words first, then headers that merely contain one (e.g. "Tenant's phone no")
  for (const exact of [true, false]) {
    for (const field of Object.keys(HEADER_WORDS) as Field[]) {
      if (found[field] !== undefined && found[field] >= 0) continue;
      const i = keys.findIndex((k, idx) => !taken.has(idx) && k && HEADER_WORDS[field].some((w) => (exact ? k === w : k.includes(w))));
      if (i >= 0) {
        found[field] = i;
        taken.add(i);
      } else found[field] = -1;
    }
  }
  // A full name column wins over first/last; without one, first and last are joined
  if (found.name >= 0) found.firstName = found.lastName = -1;
  return found;
}

/** A CSV file's rows. Handles quotes, commas or semicolons, Windows line endings and Excel's BOM. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * A date as yyyy-mm-dd, from an Excel date, an Excel serial number, or text: 2027-07-31,
 * 31/07/2027 (day first, as written in Nigeria), 31-7-27, 31 July 2027, July 31 2027. Null if
 * it can't be read.
 */
export function parseDate(cell: Cell): string | null {
  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return null;
    // Spreadsheet dates have no time zone: whichever zone produced this one (midnight UTC, or
    // local midnight an hour either side), the nearest whole day is the day that was typed
    const day = new Date(cell.getTime() + 12 * 3_600_000);
    return iso(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
  }
  if (typeof cell === "number") {
    // Excel stores dates as days since 30 Dec 1899
    if (cell < 20000 || cell > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(cell ?? "").trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return iso(fullYear(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,})[\s-]+(\d{2,4})$/);
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return iso(fullYear(+m[3]), MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]);
  m = s.match(/^([a-z]{3,})[\s-]+(\d{1,2})[\s-]+(\d{2,4})$/);
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return iso(fullYear(+m[3]), MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]);
  return null;
}

/** "M", "male", "boy" → Male; "F", "female", "girl" → Female; anything else → null. */
export function parseSex(cell: Cell): "Male" | "Female" | null {
  const s = squash(String(cell ?? ""));
  if (["m", "male", "boy", "man"].includes(s)) return "Male";
  if (["f", "female", "girl", "woman", "lady"].includes(s)) return "Female";
  return null;
}

/** Text from a cell; numbers that lost their leading zero (phone 8031234567) get it back. */
export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return parseDate(cell) ?? "";
  if (typeof cell === "number" && Number.isInteger(cell) && String(cell).length === 10 && /^[789]/.test(String(cell))) return `0${cell}`;
  return String(cell).trim();
}

export interface RoomRef {
  id: string;
  label: string;
  block: string;
}

/**
 * The room a sheet means: matched by its name ("A3", "Ruby 2", "room 12"), using the block
 * column when two blocks have rooms with the same name. Null when there's no single match.
 */
export function matchRoom(roomText: string, blockText: string, rooms: RoomRef[]): RoomRef | null {
  const wanted = squash(roomText).replace(/^(room|rm|no)/, "");
  if (!wanted) return null;
  const block = squash(blockText).replace(/^block/, "");
  const byName = rooms.filter((r) => squash(r.label) === wanted || squash(r.label).replace(/^(room|rm)/, "") === wanted);
  const pick = (list: RoomRef[]) => (list.length === 1 ? list[0] : block ? (list.filter((r) => squash(r.block).replace(/^block/, "") === block)[0] ?? null) : null);
  if (byName.length) return pick(byName);
  // "Ruby 2" written as block + number, or "A3" for block A, room 3
  const joined = rooms.filter((r) => squash(r.block).replace(/^block/, "") + squash(r.label).replace(/^\D+/, "") === wanted || squash(`${r.block}${r.label}`) === wanted);
  return pick(joined);
}
