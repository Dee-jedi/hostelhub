# Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:unit` | Pure logic (hostel from address, access claims) | Nothing |
| `npm run test:rules` | The multi-hostel Firestore rules, on the **staging** database, with throwaway logins and hostels it cleans up | `.env.local` and the service account file |
| `npm run test:api` | The server command layer (`/api/me`, `/api/platform/access`) and every manager action (`/api/manage/*`, checked in the database, then the demo is reset) on a running site (`HH_BASE`, default staging) | Same |
| `npm run test:e2e` / `test:smoke` | The whole app in a browser (below) | Staff login |

## Browser tests

These drive Microsoft Edge (set `HH_BROWSER` for another Chromium browser) against a deployed
site. By default they target **staging** (`hostelhub-1`, staging database).

```sh
# Full end-to-end run: booking + Paystack test payment, tenant portal, staff actions,
# receipt numbering, then "Reset demo data" at the end.
HH_EMAIL=admin@hostelhub.app HH_PASSWORD=admin1234 npm run test:e2e

# Read-only check that every staff screen loads, desktop and phone
HH_EMAIL=admin@hostelhub.app HH_PASSWORD=admin1234 npm run test:smoke

# Three staff saving payments at the same instant must get different receipt numbers
HH_EMAIL=admin@hostelhub.app HH_PASSWORD=admin1234 node tests/e2e/race.mjs
```

- `HH_BASE` sets another site, e.g. `http://localhost:3100` for a local `next start`. **Running `test:e2e` against live resets the live demo.**
- `HH_NO_RESET=1` skips the reset at the end.
- `HH_HEADED=1` shows the browser.
- Screenshots go to `tests/e2e/shots/`. Every failing step saves one.
- The full run books one room and adds one tenant by hand. If the hostel is full, the room steps fail, and a reset frees the rooms again.
