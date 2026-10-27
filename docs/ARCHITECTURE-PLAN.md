# HostelHub: multi-hostel architecture plan

Status: draft for review · 2026-10-18

## 1. Goal

Any hostel owner can sign up, describe how their hostel works, and have the whole system
(dashboard, booking page, tenant portal, payments, reminders) behave that way without any
code changes. One owner can run several hostels and see them together; each manager sees
only their own hostel.

Today the app is built around one hostel (Mowarid): one settings document, rooms generated
from "blocks × rooms per block", one price, one payer per room, and 12-month leases. All of
that becomes configuration.

## 2. How hostels differ (what the model must handle)

| Dimension | Options we must support | Today |
|---|---|---|
| **What is rented** | Whole room (one payer, others recorded) · Per bed (each person pays) · Mixed in one hostel (e.g. self-contained rooms per room, 4-man rooms per bed) | Whole room only |
| **People per room** | 1 to 6+, different per room type | One number for the whole hostel |
| **Price** | Different per room type (single, 2-man, 4-man, self-contained); can change per session | One price |
| **Rent period** | Rolling (12 or 6 months from move-in) · Academic session (fixed dates, e.g. Sept 2026 to Aug 2027, everyone ends together) · Semester | Rolling 12 months |
| **Extra charges** | Caution deposit (refundable), utility/electricity, service charge, late fee, discounts | None |
| **How they pay** | Full payment · Instalments with a balance owed · Online (Paystack) and offline (cash, transfer, POS) | Full or "part payment" without a balance |
| **Who can live where** | Mixed · Blocks or floors restricted by sex | Mixed only |
| **Structure** | Blocks, floors, rooms with any numbering (A1, 101, "Room 7") | Letters × numbers |
| **Ownership** | One hostel · One owner with several hostels and a manager each | One hostel |

### Flows you didn't mention that hostels will ask for

These came out of the brainstorm. I'd design for all of them now, even the ones we build later:

1. **Room types with different prices** in the same hostel, e.g. "Standard 2-man ₦350k per room" and "Shared 4-man ₦120k per bed".
2. **Caution deposit and move-out:** the deposit is held, then refunded minus damages at checkout. It needs a move-out checklist (keys, furniture, damages).
3. **Balances owed:** "Paid ₦200k of ₦350k, ₦150k due by 30 Nov". This means separating *what is owed* (charges) from *what was paid* (payments).
4. **Renewal priority:** current tenants get first chance to renew before rooms open to new students for next session.
5. **Waitlist** when the hostel is full.
6. **Agents/referrers:** the `?agent=` link exists. Some hostels pay agents a commission per booking.
7. **Staff roles (later):** a porter can log repairs and check visitors, but can't see money. An accountant sees money but can't change rooms. At launch every staff login is a manager (§6).
8. **Audit log:** who recorded that cash payment, who moved that tenant.
9. **Importing existing tenants** from paper or Excel (CSV upload). This is the main hurdle when a hostel first switches over.
10. **Platform admin (you):** a list of every hostel, their status and their plan, with a support view.
11. **Data protection:** consent on the booking form, and export or delete on request. This is required by the Nigerian data protection law (NDPA 2023).
12. **How HostelHub itself gets paid:** a monthly fee per hostel, per bed, or a cut of online payments. This is a business decision, covered in §10.

## 3. Core concepts

The key change is to separate the **building** (rooms) from **what is sold** (spaces) and from **who lives there and owes what** (tenancies and charges).

```
Organization (an owner's business)
 └── Hostel (one property: name, address, terms, payout account)
      ├── Block / Floor          physical layout; may be restricted by sex
      ├── Room type              capacity, pricing mode (per room | per bed), price per rent period
      ├── Room                   belongs to a block and has a room type; can be under maintenance
      │    └── Space             what is actually rented: the room itself, or each bed in it
      ├── Rent period            "2026/2027 session" (fixed dates) or "12 months from move-in"
      ├── Resident               a person (bio, next of kin, photo); one per person per hostel
      │    └── Tenancy           resident × space × rent period: dates, status, co-occupants
      │         ├── Charge       rent, deposit, utility, late fee, discount (what is owed)
      │         └── Payment      money received, applied to charges (what was paid)
      ├── Booking                online checkout (hold → paid → tenancy)
      ├── Request                repairs, complaints, room changes (today's tickets)
      ├── Message / Notification
      └── Counters, stats        receipt numbers, occupancy totals (kept by the server)
```

### Spaces explain everything about vacancy

- **Per-room type**, capacity 2 (Mowarid): each room has **1 space** that holds up to 2 people. One person pays, and the co-occupant is recorded on the tenancy. Vacancy counts rooms.
- **Per-bed type**, capacity 4: each room has **4 spaces** (Bed A–D). Each bed has its own tenancy and payer. Vacancy counts beds, and the dashboard can still say "Room 7: 3 of 4 beds taken".
- **Mixed hostel:** each room type decides for itself, so the dashboard shows "12 rooms + 37 beds free".

The booking page, the dashboard and the owner view all count **spaces**, so they don't need special cases for each mode.

### Tenancy replaces "lease dates on the resident"

Today a resident has `roomId`, `leaseStart` and `leaseEnd`. Instead, a **tenancy** holds those, plus a status (`reserved → active → ending → ended`). That gives us:
- **History:** the same student across three sessions, or moving rooms halfway through.
- **Renewals:** a new tenancy for the next period, created early, which is how renewal priority works.
- **Room changes:** the old tenancy ends and a new one starts, and the money moves with it.

### Charges and payments give real balances

When a tenancy starts, the system creates its charges from the room type's price list: rent, plus deposit and any fees. Payments are applied to charges. A tenant's balance is charges minus payments. "Rent status" becomes:

- **paid** (balance 0)
- **part-paid**
- **overdue** (a charge is past its due date)
- **expiring** (the tenancy ends soon)

Instalments are just several charges with due dates.

## 4. Data model in Firestore

Everything a hostel owns lives **under that hostel's document**, so access rules, billing, export and deletion all work hostel by hostel.

```
organizations/{orgId}                name, ownerUid, plan, billing status
  members/{uid}                      role in the org (owner | admin)

hostels/{hostelId}                   orgId, name, slug, address, contacts, branding,
                                     currency, timezone, status (draft | live | suspended),
                                     settings (see §5), payout (Paystack subaccount code)
  blocks/{blockId}                   name, order, allowedSex?
  roomTypes/{typeId}                 name, capacity, pricingMode, prices[periodId], fees[]
  rooms/{roomId}                     label, blockId, floor, typeId, maintenance{…}
  rentPeriods/{periodId}             kind (fixed | rolling), name, start, end | months, bookingOpensAt
  residents/{residentId}             person details (today's StudentInfo), uid?
  tenancies/{tenancyId}              residentId, roomId, spaceId, periodId, start, end, status,
                                     occupants[], renewalOf?
  charges/{chargeId}                 tenancyId, kind, amount, dueDate, paid, status
  payments/{paymentId}               tenancyId, amount, method, reference, receiptNo, allocations[]
  bookings/{bookingId}               today's Booking + spaceId, periodId
  requests/{requestId}               today's Ticket
  messages/{messageId}               broadcasts and reminders (as today)
  members/{uid}                      role in this hostel (manager at launch; accountant | porter later)
  audit/{eventId}                    who did what, when (server-written)
  counters/receipts                  next receipt number (transaction only)
  stats/current                      occupancy, collected, outstanding (server-maintained)
  stats/{yyyy-mm}                    monthly roll-ups for charts

listings/{hostelId}                  the booking page doc: hostel info + space availability + holds
                                     (no personal data; same idea as today's public/booking)

users/{uid}                          name, email, phone, fcmTokens[], memberships summary
```

Why sub-collections (`hostels/{id}/payments`) rather than one big `payments` collection with a `hostelId` field:

- **Rules:** access is decided from the path, so one rule covers a hostel's whole tree.
- **Deletion and export:** taking out one hostel's data is a single operation.
- **Queries across hostels:** collection-group queries still work when the owner or platform needs a view across several hostels.

**Size check.** A big hostel has 500 rooms × 4 beds = 2,000 spaces. In `listings/{hostelId}` that's about 200 KB, well under Firestore's 1 MiB limit per document. If someone ever outgrows that, we split it by block.

## 5. Hostel settings (what onboarding collects)

```ts
settings: {
  rentalModel: "per_room" | "per_bed" | "mixed",  // a default; each room type sets its own
  periodKind: "rolling" | "session" | "semester",
  allowPartPayment: boolean, minFirstPayment?: number,
  deposit?: { amount: number, refundable: true },
  fees: { name: string, amount: number, per: "tenancy" | "month" }[],
  sexPolicy: "mixed" | "by_block" | "by_floor",
  onlineBooking: { enabled: boolean, holdMinutes: number, requirePhoto: boolean, requireMatric: boolean },
  renewals: { priorityDays: number },              // current tenants get N days before rooms open to the public
  reminders: { daysBefore: number[], channels: ("push" | "email" | "in_app")[] },
  tenantTypes: { students: boolean, workers: boolean },
  features: { requests: boolean, idCards: boolean, visitorLog: boolean },
}
```

## 6. Accounts, roles and permissions

**For launch there are three roles.** A manager signs the hostel up, and owners with several hostels are set up by you.

| Role | Scope | Can |
|---|---|---|
| **Platform admin** (you) | Everything | See all hostels, suspend, support view, platform billing, **link hostels to an owner** |
| **Manager** | One or more hostels | Everything in that hostel. A hostel can have **several manager logins**, all with full access. The manager who signs up can invite more |
| **Tenant** | Their own tenancy | Portal: pay, receipts, requests, ID card, notifications |
| **Owner** (granted by you) | The hostels you link | Combined dashboard across those hostels, plus each hostel's normal dashboard |

**Later, if hostels ask:** accountant (money only) and porter (requests and visitors, no money). The role is stored on every membership from day one, so adding them later means new screens, not a data migration.

**Addresses:** roles don't get their own subdomains. Each hostel has one address, and the login decides what you see:

| Address | Serves |
|---|---|
| `<domain>` | Marketing page and hostel sign-up |
| `{slug}.<domain>` | That hostel's booking page (what the QR opens) |
| `{slug}.<domain>/portal` | Tenant portal |
| `{slug}.<domain>/manage` | Manager dashboard |
| `admin.<domain>` | Platform admin console, including the owner view |

Signing in on the wrong hostel's address sends you to the right one.

**Firebase Auth custom claims** say what each login can access, and the database rules check them.

Example claim:

```json
{ "p": "admin" }
```

or

```json
{ "o": { "org123": "owner" }, "h": { "mowarid": "manager", "hostel2": "manager" }, "t": "mowarid" }
```

- Claims are limited to 1,000 bytes, which is plenty for one person's memberships.
- The server sets them when someone is invited or removed, and the app refreshes the login token straight away.
- The rules then read like: `allow read: if request.auth.token.h[hostelId] != null`.

There's no extra database read per check, so it stays cheap.

A person can be a tenant in one hostel and staff in another, because the claims hold both.

## 7. Where the logic runs

Today the staff browser writes most data directly. With money, many hostels and many roles, the business rules need to live in one trusted place:

| Layer | What runs there |
|---|---|
| **Browser** | Reads with listeners (kept, with the limits added in this session), forms and UI. Writes only low-risk things directly: replies, marking a request seen, profile edits |
| **Server API (Next.js route handlers on App Hosting, Admin SDK)** | Every command that touches money, occupancy or roles: create tenancy, record payment, change room, start/finish booking, renew, refund deposit, invite staff, onboarding steps. Each command checks permissions, runs in a transaction, and writes an audit entry |
| **Cloud Functions: triggers** | Keep `stats/current` and the monthly stats up to date when tenancies, charges or payments change; update `listings/{hostelId}`; send push notifications |
| **Cloud Functions: scheduled** | Daily reminders (per hostel, in its timezone); expire holds; mark overdue charges; end finished tenancies; nightly backup export |
| **Paystack** | One **subaccount per hostel**, so rent goes straight to the hostel's bank. With the subscription model the platform split is 0%. The webhook finds the hostel from the transaction metadata. The owner's subscription is a separate Paystack payment to the platform account |

That makes the browser a thin client and makes the rules simple ("tenants read their own, staff read their hostel, the server writes money"). The same API would also serve a mobile app later.

## 8. Main flows

### 8.1 Owner onboarding (self-serve)
1. **Sign up:** email and password, verify email, and create the organization.
2. **Hostel basics:** name (shown on the dashboard, booking page, portal and receipts), address, manager name and phone, logo, currency and timezone.
3. **How you charge:** per room or per bed, with a preview of how the dashboard and booking page will look for each. Then **which room sizes you have**: ☑ 2-person ☑ 3-person ☑ 4-person (any mix; 4 is the maximum). Each ticked size becomes a room type.
4. **Rent:** a rent for each room size (per room or per bed, as chosen), and the current session's dates. A plain note explains the student's service fee at checkout (§10.6). Deposit, fees and part payments are optional and can be changed later.
5. **Layout:** add blocks (and floors), then **generate rooms** ("Block A, rooms 1–15, 2-person") with editable labels, and change any single room's size afterwards.
   - **Live quote:** shown as rooms are added, banded per room size. For example: "40 two-person rooms × ₦4,000 + 30 three-person rooms × ₦2,500 = ₦235,000 per session. Free for 60 days."
6. **Payments:** bank details become a Paystack subaccount (the account name is verified through Paystack). Offline methods accepted.
7. **Rules:** sex policy, online booking on or off, photo and matric required, renewal priority window.
8. **Team:** invite other managers by email (optional).
9. **Existing tenants:** CSV import with a column-mapping screen, or add them one by one.
10. **Go live:** real payments switch on. The hostel gets its booking address `{slug}.<domain>` (the slug is picked in step 2 and checked to be unique), a printable QR poster, and a checklist. Before this, the booking page takes Paystack test payments only (§10.6).

Each step saves as a draft, so the owner can stop and come back later. The hostel stays `draft` until they press **Go live**.

### 8.2 Student booking (per bed or per room)
Open `{slug}.<domain>`, fill in details, pick a **space** (the floor plan shows rooms with free beds per room), pick the rent period if more than one is open, then **see the charges** (rent + deposit + fees) and pay in full or the minimum first payment through Paystack.

The server then creates the resident, tenancy, charges, payment and receipt in one transaction, and the student lands in the portal. Holds and race safety work as today, per space.

**Paying offline instead:** the student books, then sees the hostel's bank details and uploads proof of transfer. The space is held for the hostel's chosen time, e.g. 48 hours. Staff approve the proof (which creates the payment and receipt) or reject it (which releases the space). The approval goes in the audit log.

### 8.3 Renewal and next session
- **Before a session ends:** current tenants get "Reserve your space for 2027/2028" during the priority window. That creates a `reserved` tenancy for the next period and its charges.
- **After the window:** unreserved spaces open on the public booking page.
- **Rolling hostels:** renewal simply creates the next tenancy back to back.

### 8.4 Payments, balances and receipts
- **Money in, from anywhere:** staff record cash, transfer or POS; tenants pay online. Every payment applies to the oldest unpaid charges first, unless staff choose otherwise.
- **Receipts:** each hostel numbers its own receipts with its own prefix (`MWD-1042`), in a transaction (as fixed in this session).
- **Balances** show for each tenant and in total on the dashboard.

### 8.5 Move-out
Staff start move-out, tick the checklist (keys returned, damages noted), and the deposit refund is worked out as deposit minus damages. Then the tenancy ends, the space becomes vacant, and the refund is recorded.

### 8.6 Owner with several hostels
- **Setup:** not self-serve at launch. The owner contacts you, and in the admin console you create the organization, link their hostels to it, and invite the owner's login.
- **Owner home:** one card per hostel (occupancy %, beds/rooms free, collected this month, outstanding, open requests), plus combined totals and a hostel switcher.
- **Detail view:** clicking a card opens that hostel's normal dashboard.
- **Cost:** it reads one `stats/current` per hostel, so 3 hostels cost 3 reads, however big they are.

### 8.7 Notifications
- **Push:** Firebase Cloud Messaging on web, plus an in-app list, as you decided. Each user's device tokens are stored in `users/{uid}`.
- **iPhones:** web push only works after the user adds the site to their home screen. The portal needs an "Install the app" prompt.
- **Triggers:** reminders, request updates, payment confirmations and notices are all written to a notification record and pushed.

## 9. Scale and cost

| Item | Approach |
|---|---|
| **Staff app reads** | As now: recent and open records only, scoped to one hostel |
| **Owner dashboard** | Pre-computed stats docs, never raw collections |
| **Booking page** | One public doc per hostel. Add App Check against bots |
| **Hot documents** | Receipt counter and public doc, each per hostel. Each document takes about 1 write per second sustained, which a single hostel won't reach |
| **Indexes** | Defined in `firestore.indexes.json` (e.g. tenancies by status+end, charges by status+dueDate) |
| **Cost** | Grows with hostels × activity, not with history. About ₦0–5k a month in Firebase until roughly 50 hostels. Recheck at 20 hostels |
| **Backups** | Nightly Firestore export to Cloud Storage (scheduled function) |
| **Environments** | Separate Firebase projects for `staging` and `production`. Today everything runs on one project, including the demo |

## 10. Decisions

### Made (2026-10-18)

1. **Each hostel gets a subdomain:** `mowarid.<domain>`, `hostel2.<domain>`.
   - **Hosting:** one deployment serves every hostel. Whether App Hosting accepts a wildcard custom domain (`*.<domain>`) must be verified before buying the domain; if not, add each hostel's domain through the API at Go live, or put Cloudflare in front.
   - **Routing:** the app reads the request's host (`X-Forwarded-Host`) and looks up the hostel by its `slug`. Unknown or reserved subdomains (`www`, `app`, `admin`, `api`) go to the platform pages.
   - **Platform pages:** the bare domain hosts the marketing page, owner sign-up and login.
   - **DNS:** needs a wildcard record. If the registrar can't do that, use Cloudflare DNS (free).
2. **Rent is priced per session** (Nigerian academic session, about 8 months). The default period kind is `session`, with fixed start and end dates set per hostel. Rolling months stay available for off-campus hostels.
3. **One login per person across hostels.** Firebase Auth allows one account per email anyway. The user account belongs to the person, and each hostel holds its own resident record and tenancies. The portal shows a hostel switcher only when the person has tenancies in more than one hostel.

4. **Sessions are confirmed, not re-entered.**
   - **Onboarding:** the hostel enters the current session's start and end once.
   - **Near the end:** the system proposes the next session (same length, starting where this one ends). The manager taps Confirm or adjusts the dates. A reminder repeats until it's confirmed.
   - **Strikes and delays:** an **Extend session** action moves the end date of the session and all its active tenancies, and tells tenants.
5. **Onboarding asks for the model up front:** per room or per bed, and the room size (2, 3 or 4 per room; 4 is the maximum we support). For per-room hostels the size is the occupant limit; for per-bed hostels it's the number of beds. Then the rent per space, which is what students see (plus the service fee at checkout, §10.6).

### Made (2026-10-28)

6. **How HostelHub earns money: a service fee on online payments, paid by the student.** Free for hostels.
   - **Online booking or renewal:** the student pays rent + a **2% service fee (minimum ₦2,500)**, shown as its own line at checkout. Paystack's split sends the full rent to the hostel's subaccount and the fee to HostelHub; HostelHub bears Paystack's charge (1.5% + ₦100, capped at ₦2,000). Example: ₦350,000 rent → student pays ₦357,000, hostel gets ₦350,000, HostelHub keeps ₦7,000 − ₦2,000 = ₦5,000. The rate, minimum and caps are settings, not code.
   - **Tenants added by hand:** free when imported **before Go live** (existing tenants; capped at the hostel's capacity, and free only until their current lease ends). After Go live, each tenant added or renewed by hand carries a small flat fee per session (around ₦1,500), billed to the manager. Online is then the cheapest route for the manager, so it isn't a loophole. Hand-added tenants are flagged; the platform admin sees each hostel's online vs by-hand split.
   - **Setup mode can't run a hostel:** before Go live the booking page takes Paystack test payments only and the student portal is off, with a time limit to Go live (e.g. 30 days).
   - **Trying it:** `demo.<domain>` is a fictional hostel anyone can click through; a manager can also book their own draft hostel with a Paystack test card and watch it reach the dashboard.
   - **Marketing says "free for hostels"**; the student fee is disclosed at checkout and in the manager's onboarding and terms, not on the landing page.
   - **Country:** Nigeria (₦) only at launch. Hostels carry `country`/`currency` so other Paystack countries (Ghana, Kenya, South Africa, Côte d'Ivoire) can be added later; each needs its own HostelHub Paystack business there.
   - **Replaces** the per-space subscription considered on 2026-10-18 (dropped: a manager-paid bill is the main barrier to trying the product, and the hand-add fee covers the bypass worry that motivated it).
7. **Platform domain:** `hostelhub.africa`, if available with that exact spelling (matches the brand), else rebrand to match `hostelshub.ng`. Avoid `.name.ng`.

### Still open

8. **Do hostels price by length of stay?** For example, a cheaper semester-only stay next to the session price. The model supports it (price per rent period), but onboarding gets more complex. Default: session only.
### Settled since (2026-10-18)

- **Mixed room sizes:** 2-, 3- and 4-person rooms sit side by side in one hostel, so the size is set **per room** (via its room type), not per block.
- **Who signs up:** the manager. Owners with several hostels get their combined dashboard from the platform admin (§8.6), so there's no ownership hand-over flow at launch.
- **Roles at launch:** manager and tenant only (§6). Accountant and porter come later if hostels ask for them.
- **Trial:** a flat 60 days.

## 11. Migration from today's app

A one-off script (Admin SDK, run against staging first) does the following:
- Creates the `organizations/mowarid-org` and `hostels/mowarid` documents from `config/settings`.
- Turns today's blocks into block docs and adds one room type, "Standard (2 people)": per room, capacity 2, ₦350k, rolling 12 months.
- Generates rooms, with **one space per room**, so Mowarid behaves exactly as it does now.
- Turns each resident into a resident plus a tenancy (from `leaseStart`, `leaseEnd`, `roomId` and `occupants`), and each payment into a payment plus a matching paid charge.
- Moves bookings, tickets, messages and the receipt counter under the hostel, and builds `public/mowarid` from today's `public/booking`.
- Sets the admin login's claims to `{ o: { "mowarid-org": "owner" }, h: { mowarid: "manager" } }`.

The demo reset (`seed-firestore.ts`) gets rewritten to seed two demo hostels: Mowarid (per room) and a per-bed example. That way you can show managers both models.

## 12. Build plan (phases)

Each phase ends deployable, with the end-to-end browser test from this session extended to cover it.

| Phase | Delivers | Main changes |
|---|---|---|
| **0. Foundations** | Staging project, `hostels/{id}` structure, claims, new rules, server command layer, test suite in the repo | `lib/server/*` gains commands; the rules are rewritten; Playwright moves into the repo |
| **1. Model + migration** | Blocks, room types, rooms, spaces, tenancies, charges. Mowarid migrated and looking the same as today | `types.ts`, the store split per hostel, dashboard counts spaces |
| **2. Per-bed and room types** | Per-bed rooms, mixed hostels, floor plan with beds, bed-level vacancy | Room picker, rooms page, dashboard, booking API |
| **3. Rent periods and balances** | Session/semester periods, deposits, fees, instalments, balances, overdue | Payments screens, portal payments, reminders |
| **4. Self-serve onboarding** | Sign-up, wizard (§8.1), CSV import, go-live checklist, booking slug | New `(onboarding)` route group, Paystack subaccounts |
| **5. Organizations** | Owner home with several hostels, hostel switcher, invites, roles (§6), audit log | Claims management, `stats` triggers |
| **6. Operations** | Renewal priority window, move-out and deposit refunds, waitlist, scheduled jobs | Cloud Functions (scheduled) |
| **7. Notifications** | FCM push, install prompt, notification centre | Service worker, `users/{uid}.fcmTokens` |
| **8. Platform** | Your admin console, platform billing, data export/delete, App Check, backups | Admin route group |

Phases 1–3 are the big ones. Once they're done, the app handles any hostel's setup, and the rest is screens and automation built on top of that.

## 13. What stays the same

- **Stack:** Next.js on Firebase App Hosting, Firestore, Firebase Auth, Storage, and Paystack.
- **Cost approach:** bounded listeners, one public doc per booking page, and receipts numbered in a transaction.
- **Look and feel:** the UI kit, the mobile layout, the tenant portal design, and the request flow.
- **Demo:** the reset still works, now with two sample hostels.
