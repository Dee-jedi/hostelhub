# HostelHub — Hostel Management System

Replaces paper registration forms and manual rent tracking for student hostels.
Built with Next.js 16, TypeScript and Tailwind CSS v4.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

The app ships with realistic demo data (8 blocks × 15 rooms × 3 beds, ~250 residents),
stored in the browser's localStorage — no database or setup needed. Reset it from **Settings → Reset demo data**.

## What it does

| Page | Purpose |
| --- | --- |
| **Dashboard** | Occupancy, vacant beds, rents expiring this month, overdue amount, revenue chart, occupancy by block |
| **Rooms** | Visual room map; each bed is coloured by rent status. Filter empty / free-bed / full / maintenance rooms |
| **Residents** | Searchable digital register (name, dept, level, sex, phone, next of kin…), CSV export |
| **Rent & Renewals** | Expired / expiring this month / next 30 / 31–60 days, bulk reminders, one-click renewals |
| **Payments** | Every payment with a printable receipt; filters & export |
| **Messages** | Broadcast to everyone, a block, a level, or residents with expiring rent; templates with placeholders |
| **Applications** | Students self-register at `/register` (link or printable QR code); management approves & allocates a room |
| **Maintenance** | Log and track repairs per room |
| **Settings** | Hostel info, rent amount, rent period, blocks (male/female/mixed), rooms per block, reminder schedule |

**Automatic reminders:** residents are messaged 30, 14, 7 and 1 day(s) before expiry (configurable) and once after
expiry. Each reminder is sent only once per lease.

## Code layout

```
src/lib/types.ts       data model
src/lib/store.ts       all reads/writes (localStorage today — swap for API calls later)
src/lib/seed.ts        demo data generator
src/lib/utils.ts       dates, rent status, money, WhatsApp links, CSV
src/components/        UI kit, modals, resident drawer, student form
src/app/(admin)/       management screens
src/app/(public)/register   student self-registration form
```

## Production roadmap

1. **Database + auth** — PostgreSQL (Supabase/Neon) with Prisma or Drizzle; staff logins with roles (owner, manager, porter).
2. **Notifications** — push notifications (Firebase Cloud Messaging) on top of the in-app list; a daily Firebase scheduled function for rent reminders.
3. **Online payments** — Paystack/Flutterwave checkout link in reminders; webhook auto-renews the lease and issues the receipt.
4. **Student portal** — residents log in to see rent status, download receipts, and report maintenance issues.
5. **Extras** — visitor log, check-in/out inventory (bed, mattress, keys), damage deposits, multi-hostel support.

## Deploying to Firebase App Hosting

Settings are in `apphosting.yaml`. The project must be on the Blaze plan. Steps, once:

1. **Secrets.** With the Firebase CLI logged in (`npx firebase-tools login`), create each one and paste its value when asked:
   ```sh
   npx firebase-tools apphosting:secrets:set paystackPublicKey
   npx firebase-tools apphosting:secrets:set paystackSecretKey
   npx firebase-tools apphosting:secrets:set idCardSecret
   ```
2. **Backend.** In the Firebase console, open App Hosting, choose *Create backend*, connect this GitHub repo and pick the live branch. For the region, choose the one nearest the Firestore database. (Africa isn't offered; `europe-west4` is the closest.) Every push to that branch deploys.
3. **Permissions.** The server runs as `firebase-app-hosting-compute@hostelhub-b51cc.iam.gserviceaccount.com`. If `/api/health` shows a permission error, give that account the *Firebase Admin SDK Administrator Service Agent* role in Google Cloud IAM, which covers Firestore, Auth and Storage.
4. **Grant the backend the secrets** if step 1 didn't offer to: `npx firebase-tools apphosting:secrets:grantaccess paystackSecretKey --backend <backend-id>` (repeat for each).
5. **Check it.** Open `https://<backend-url>/api/health`. Everything should be `true` and `firebase` should be `ok`.

Connecting a domain (e.g. one bought from DomainKing):

1. App Hosting, then your backend, then *Settings*, then *Domains*, then *Add custom domain*.
2. Add the DNS records Firebase shows (an A record, plus a TXT or CNAME for verification) in DomainKing's DNS manager. HTTPS is set up automatically once they're live, usually within a few hours.
3. Add the domain under Authentication, then *Settings*, then *Authorized domains*, or sign-in fails on it.
4. Change the Paystack webhook to `https://<domain>/api/paystack/webhook`.
# hostelhub
