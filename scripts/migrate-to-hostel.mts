/**
 * Copies the single-hostel data (root collections) into one hostel of the multi-hostel model,
 * then reads it back and checks nothing was lost. The old collections are left as they are.
 *
 *   npm run migrate -- --staging --dry-run     show what would be written
 *   npm run migrate -- --staging               migrate the staging database into hostels/mowarid
 *   npm run migrate -- --staging --force       replace an existing hostels/mowarid
 *   npm run migrate -- --live                  migrate the LIVE database
 *   --hostel <id>                              another hostel id (default: mowarid)
 *
 * Also marks every current tenant's login as a tenant of the hostel and the demo staff login
 * as its manager (claims are shared by live and staging; the live app ignores the new ones).
 */
process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
if (args.includes("--staging")) process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = "staging";
// .env.local points local development at staging; --live targets the live database explicitly
if (args.includes("--live")) process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = "(default)";
const hostelId = args.includes("--hostel") ? args[args.indexOf("--hostel") + 1] : "mowarid";
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const { FIRESTORE_DATABASE } = await import("../src/lib/env");
const { adminAuth, adminDb } = await import("../src/lib/server/admin");
const { setHostelRole, setTenantOf } = await import("../src/lib/server/claims");
const { isValidSlug } = await import("../src/lib/hostel-host");
const { documentsOf, fromLegacy } = await import("../src/lib/migrate/from-legacy");
const { toLegacy } = await import("../src/lib/migrate/to-legacy");
const { buildRooms, createEmptyState } = await import("../src/lib/seed");
const { ADMIN_EMAIL } = await import("../src/lib/server/seed-firestore");
type HostelState = import("../src/lib/types").HostelState;
type PublicBookingDoc = import("../src/lib/types").PublicBookingDoc;

if (!isValidSlug(hostelId)) throw new Error(`"${hostelId}" isn't a valid hostel id`);
console.log(`Database: ${FIRESTORE_DATABASE} → hostels/${hostelId}${dryRun ? " (dry run)" : ""}`);

// ------------------------------------------------------------ read the single-hostel data
const all = async <T,>(name: string) => (await adminDb.collection(name).get()).docs.map((d) => ({ ...d.data(), id: d.id }) as T);
const [settingsSnap, metaSnap, pubSnap] = await adminDb.getAll(adminDb.doc("config/settings"), adminDb.doc("config/meta"), adminDb.doc("public/booking"));
if (!settingsSnap.exists) throw new Error("No config/settings in this database: nothing to migrate");
const settings = settingsSnap.data() as HostelState["settings"];
const pub = pubSnap.data() as PublicBookingDoc | undefined;
const meta = metaSnap.data() ?? {};
const rooms = buildRooms(settings).map((r) => {
  const p = pub?.rooms[r.id];
  return p?.status === "maintenance" ? { ...r, underMaintenance: true, ...(p.note ? { note: p.note } : {}) } : r;
});
const state: HostelState = {
  ...createEmptyState(),
  settings,
  rooms,
  residents: await all("residents"),
  payments: await all("payments"),
  messages: await all("messages"),
  tickets: await all("tickets"),
  bookings: await all("bookings"),
  sentReminderKeys: (meta.sentReminderKeys as string[] | undefined) ?? [],
};
const renewals = await all<Record<string, unknown>>("renewals");

// Which resident ids are logins (getUsers takes 100 at a time)
const loginUids = new Set<string>();
const ids = state.residents.map((r) => r.id);
for (let i = 0; i < ids.length; i += 100) {
  const res = await adminAuth.getUsers(ids.slice(i, i + 100).map((uid) => ({ uid })));
  for (const u of res.users) loginUids.add(u.uid);
}

const docs = fromLegacy({ hostelId, state, receiptSeq: (meta.receiptSeq as number | undefined) ?? 1000, renewals, loginUids });
const writes = documentsOf(docs);
console.log(
  `Read: ${state.residents.length} residents (${loginUids.size} with logins), ${state.payments.length} payments, ${state.messages.length} messages, ` +
    `${state.tickets.length} requests, ${state.bookings.length} bookings, ${renewals.length} renewals, ${rooms.length} rooms`,
);
console.log(`Will write ${writes.length} documents and mark ${docs.tenantUids.length} logins as tenants`);
if (dryRun) process.exit(0);

// ------------------------------------------------------------ write
const existing = await adminDb.doc(`hostels/${hostelId}`).get();
if (existing.exists && !force) throw new Error(`hostels/${hostelId} already exists. Use --force to replace it.`);
if (existing.exists) {
  await adminDb.recursiveDelete(adminDb.doc(`hostels/${hostelId}`));
  await adminDb.doc(`listings/${hostelId}`).delete();
  console.log("✓ Removed the previous copy");
}
const writer = adminDb.bulkWriter();
for (const [path, data] of writes) void writer.set(adminDb.doc(path), data);
await writer.close();
console.log(`✓ Wrote ${writes.length} documents`);

// ------------------------------------------------------------ access
for (const uid of docs.tenantUids) await setTenantOf(uid, hostelId, true);
const staff = await adminAuth.getUserByEmail(ADMIN_EMAIL).catch(() => null);
if (staff) await setHostelRole(staff.uid, hostelId, "manager");
console.log(`✓ ${docs.tenantUids.length} tenant logins and ${staff ? ADMIN_EMAIL : "no staff login"} given access`);

// ------------------------------------------------------------ verify by reading it back
const h = `hostels/${hostelId}`;
const back = async <T,>(coll: string) => (await adminDb.collection(`${h}/${coll}`).get()).docs.map((d) => d.data() as T);
const [hostelDoc, reminders] = await Promise.all([adminDb.doc(h).get(), adminDb.doc(`${h}/counters/reminders`).get()]);
const view = {
  hostel: hostelDoc.data() as never,
  blocks: await back<never>("blocks"),
  roomTypes: await back<never>("roomTypes"),
  rooms: await back<never>("rooms"),
  rentPeriods: await back<never>("rentPeriods"),
  residents: await back<never>("residents"),
  tenancies: await back<never>("tenancies"),
  payments: await back<never>("payments"),
  messages: await back<never>("messages"),
  requests: await back<never>("requests"),
  bookings: await back<never>("bookings"),
  sentReminderKeys: (reminders.data()?.sentKeys as string[] | undefined) ?? [],
};
// Compare as data: field order and undefined-vs-missing don't matter, array order of records doesn't either
const differences: string[] = [];
function compare(a: unknown, b: unknown, path: string) {
  if (differences.length >= 10) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = a.every((x) => x && typeof x === "object" && "id" in x);
    if (keyed) {
      const other = new Map(b.map((x) => [(x as { id: string }).id, x]));
      if (a.length !== b.length) differences.push(`${path}: ${a.length} → ${b.length} items`);
      for (const x of a) compare(x, other.get((x as { id: string }).id), `${path}[${(x as { id: string }).id}]`);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) differences.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  if (a !== b) differences.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
compare(plain(state), plain(toLegacy(view)), "state");
if (differences.length) {
  console.error("✗ Read-back differs from the source data (the old collections are untouched):\n  " + differences.join("\n  "));
  process.exit(1);
}
console.log("✓ Read back and converted to the old view: identical to the source");
process.exit(0);
