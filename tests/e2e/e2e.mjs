// Full end-to-end run against the live demo. Every step is recorded as pass/fail and the run
// carries on after a failure, so one broken screen doesn't hide the rest.
import { BASE, choose, combo, jpeg, launch, newPage, shot, staffLogin } from "./lib.mjs";

const STAFF = { email: process.env.HH_EMAIL, password: process.env.HH_PASSWORD };
const stamp = Date.now().toString(36);
const tenant = { name: `Test Student ${stamp}`, email: `e2e.${stamp}@example.com`, password: "test1234" };
const results = [];
const receipts = [];
const ctxShared = {};

async function step(name, page, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ ok: true, name, ms: Date.now() - t, note });
    console.log("PASS", name, note ?? "");
  } catch (e) {
    results.push({ ok: false, name, ms: Date.now() - t, note: e.message.split("\n")[0].slice(0, 300) });
    console.log("FAIL", name, e.message.split("\n")[0]);
    await shot(page, `fail-${name.replace(/\W+/g, "_")}`).catch(() => {});
  }
}

const receiptsIn = (text) => [...text.matchAll(/RCP-(\d+)/g)].map((m) => Number(m[1]));

async function paystackSuccess(page) {
  const el = await page.waitForSelector('iframe[src*="paystack"]', { timeout: 30000 });
  const frame = await el.contentFrame();
  await frame.getByText("Success", { exact: true }).click({ timeout: 30000 });
  await frame.getByRole("button", { name: /Pay NGN/ }).click();
}

const browser = await launch();
const T = await newPage(browser, { width: 390, height: 844 }); // the student uses a phone
const S = await newPage(browser); // staff on a laptop
const tp = T.page;
const sp = S.page;

// ------------------------------------------------------------ student books and pays
await step("book: details form", tp, async () => {
  await tp.goto(BASE + "/book?agent=e2e", { waitUntil: "domcontentloaded" });
  await tp.getByText("Passport photograph").waitFor();
  await tp.locator('input[type="file"]').first().setInputFiles(await jpeg(tp));
  await tp.waitForTimeout(1500);
  await tp.fill('input[placeholder="e.g. Chioma Okafor"]', tenant.name);
  await tp.locator('input[placeholder="08031234567"]').nth(0).fill("08031234567");
  await choose(tp, "Faculty");
  await choose(tp, "Course of study");
  await choose(tp, "Level");
  await tp.fill('input[placeholder="e.g. 22/ENG/045"]', `E2E/${stamp}`);
  await tp.locator(`xpath=//legend[contains(translate(., "NEXTOFKIN", "nextofkin"), "next of kin")]/following::input[1]`).fill("Parent Tester");
  await tp.locator('input[placeholder="08031234567"]').last().fill("08098765432");
  await tp.getByRole("button", { name: /Choose a room/ }).click();
  await tp.locator('button[aria-label$=": Free"]:visible').first().waitFor({ timeout: 15000 });
});

await step("book: pick a free room", tp, async () => {
  const free = tp.locator('button[aria-label$=": Free"]:visible').first();
  ctxShared.room = (await free.getAttribute("aria-label")).match(/Room (\S+):/)[1];
  await free.click();
  await tp.getByRole("button", { name: /Continue|Next|Review|pay/i }).last().click();
  await tp.getByText("Create your tenant login").waitFor();
  return `room ${ctxShared.room}`;
});

await step("book: pay with Paystack test card", tp, async () => {
  await tp.locator('input[type="email"]').last().fill(tenant.email);
  const pw = tp.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill(tenant.password);
  await pw.nth(1).fill(tenant.password);
  await tp.locator('input[type="checkbox"]').last().check();
  await tp.getByRole("button", { name: /Pay/ }).last().click();
  await paystackSuccess(tp);
  await tp.getByText(`Room ${ctxShared.room} is yours!`).waitFor({ timeout: 60000 });
  const r = receiptsIn(await tp.innerText("body"));
  receipts.push(...r);
  await shot(tp, "e2e-1-booked");
  return `receipt RCP-${r[0]}`;
});

// ------------------------------------------------------------ tenant portal
await step("portal: home", tp, async () => {
  await tp.getByRole("link", { name: /portal/i }).first().click();
  await tp.waitForURL(/\/portal/, { timeout: 30000 });
  await tp.getByText(ctxShared.room, { exact: false }).first().waitFor({ timeout: 30000 });
  await shot(tp, "e2e-2-portal");
});

await step("portal: payments shows the booking receipt", tp, async () => {
  await tp.goto(BASE + "/portal/payments", { waitUntil: "domcontentloaded" });
  await tp.getByText(`RCP-${receipts[0]}`).first().waitFor({ timeout: 30000 });
  await tp.getByText(`RCP-${receipts[0]}`).first().click();
  await tp.waitForURL(/\/portal\/payments\/.+/, { timeout: 15000 });
  await shot(tp, "e2e-3-receipt");
});

await step("portal: renew rent online", tp, async () => {
  await tp.goto(BASE + "/portal/payments", { waitUntil: "domcontentloaded" });
  await tp.getByRole("button", { name: /Renew early|Pay ₦/ }).click({ timeout: 30000 });
  await paystackSuccess(tp);
  await tp.waitForFunction((known) => [...document.body.innerText.matchAll(/RCP-(\d+)/g)].some((m) => !known.includes(Number(m[1]))), receipts, { timeout: 60000 });
  const fresh = receiptsIn(await tp.innerText("body")).filter((n) => !receipts.includes(n));
  receipts.push(...new Set(fresh));
  await shot(tp, "e2e-4-renewed");
  return `receipt RCP-${fresh[0]}`;
});

await step("portal: digital ID and gate check", tp, async () => {
  const token = tp.waitForResponse((r) => r.url().includes("/api/id/token"), { timeout: 30000 });
  await tp.goto(BASE + "/portal/id", { waitUntil: "domcontentloaded" });
  const { token: t } = await (await token).json();
  await tp.locator('svg[height="168"]:visible').first().waitFor({ timeout: 30000 });
  const v = await (await fetch(`${BASE}/api/id/verify?t=${encodeURIComponent(t)}`)).json();
  if (!v.valid || v.roomId !== ctxShared.room) throw new Error("verify said " + JSON.stringify(v));
  const forged = await (await fetch(`${BASE}/api/id/verify?t=${encodeURIComponent(t.slice(0, -2) + "xx")}`)).json();
  if (forged.valid) throw new Error("a tampered QR passed");
  await shot(tp, "e2e-5-id");
  return "valid card accepted, tampered card rejected";
});

await step("portal: send a repair request", tp, async () => {
  await tp.goto(BASE + "/portal/requests/new", { waitUntil: "domcontentloaded" });
  await tp.fill('input[placeholder="e.g. Bathroom tap is leaking"]', `E2E tap leaking ${stamp}`);
  await tp.getByRole("button", { name: /Send|Submit/ }).last().click();
  await tp.waitForURL(/\/portal\/requests\/(?!new).+/, { timeout: 30000 });
  ctxShared.requestUrl = tp.url();
  await shot(tp, "e2e-6-request");
});

// ------------------------------------------------------------ staff side
await step("staff: login", sp, () => staffLogin(sp, STAFF.email, STAFF.password));

await step("staff: new deploy is live (Load older on payments)", sp, async () => {
  await sp.goto(BASE + "/payments", { waitUntil: "domcontentloaded" });
  await sp.getByText("Showing the last 12 months").waitFor({ timeout: 30000 });
  const before = (await sp.innerText("body")).match(/(\d+) payments match/)?.[1];
  await sp.getByRole("button", { name: "Load older payments" }).click();
  await sp.getByText("Showing the last 12 months").waitFor({ state: "detached", timeout: 30000 });
  await sp.waitForTimeout(1500);
  const after = (await sp.innerText("body")).match(/(\d+) payments match/)?.[1];
  return `payments loaded: ${before} → ${after}`;
});

await step("staff: booking appears", sp, async () => {
  await sp.goto(BASE + "/bookings", { waitUntil: "domcontentloaded" });
  await sp.getByText(tenant.name).first().waitFor({ timeout: 30000 });
});

await step("staff: request appears, reply and start work", sp, async () => {
  await sp.goto(BASE + "/maintenance", { waitUntil: "domcontentloaded" });
  await sp.getByText(`E2E tap leaking ${stamp}`).first().click({ timeout: 30000 });
  await sp.locator("textarea").last().fill("Plumber is coming tomorrow at 10am.");
  await sp.getByRole("button", { name: "Start work" }).click();
  await sp.waitForTimeout(1500);
  await shot(sp, "e2e-7-staff-reply");
  await sp.keyboard.press("Escape");
});

async function openTenant(page) {
  await page.goto(BASE + "/residents", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder^="Search name"]').fill(tenant.name);
  await page.locator(`text="${tenant.name}" >> visible=true`).first().click({ timeout: 30000 });
  await page.getByRole("button", { name: /Renew \/ Pay/ }).waitFor();
}

await step("staff: tenant profile shows both online receipts", sp, async () => {
  await openTenant(sp);
  await sp.waitForTimeout(1500);
  const seen = receiptsIn(await sp.innerText("body"));
  const missing = receipts.filter((r) => !seen.includes(r));
  if (missing.length) throw new Error("missing receipts " + missing.join(", "));
  return `RCP-${receipts.join(", RCP-")}`;
});

async function recordCash(page) {
  await page.getByRole("button", { name: /Renew \/ Pay/ }).click();
  await page.getByRole("button", { name: /Record payment/ }).waitFor();
  await page.locator("label", { hasText: "Renew rent for" }).locator("input").uncheck();
  return async () => {
    await page.getByRole("button", { name: /Record payment/ }).click();
    await page.getByText(/RCP-\d+/).first().waitFor({ timeout: 30000 });
    const receipt = page.locator('[role="dialog"]', { hasText: "Received from" }).last();
    const n = receiptsIn(await receipt.innerText());
    await receipt.getByRole("button", { name: "Close", exact: true }).last().click();
    return n[0];
  };
}

await step("staff: two cash payments at the same moment get different receipts", sp, async () => {
  const S2 = await newPage(browser);
  await staffLogin(S2.page, STAFF.email, STAFF.password);
  await openTenant(S2.page);
  await openTenant(sp);
  const [go1, go2] = [await recordCash(sp), await recordCash(S2.page)];
  const [a, b] = await Promise.all([go1(), go2()]);
  await S2.ctx.close();
  if (!a || !b || a === b) throw new Error(`receipts were RCP-${a} and RCP-${b}`);
  if (receipts.includes(a) || receipts.includes(b)) throw new Error("reused an online receipt number");
  receipts.push(a, b);
  return `RCP-${a} and RCP-${b}`;
});

await step("staff: message the tenant", sp, async () => {
  await openTenant(sp);
  await sp.getByRole("button", { name: /^Message$/ }).click();
  await sp.getByRole("button", { name: /Send to 1/ }).click();
  await sp.getByText("Message sent").waitFor({ timeout: 15000 });
  await sp.getByRole("button", { name: "Done" }).click();
});

await step("staff: add a tenant by hand with a payment", sp, async () => {
  await sp.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await sp.getByRole("button", { name: /Add tenant/ }).first().click();
  const dlg = sp.locator('[role="dialog"]').last();
  await dlg.locator('input[placeholder="e.g. Chioma Okafor"]').fill(`Walkin Tenant ${stamp}`);
  await dlg.locator('input[placeholder="08031234567"]').first().fill("08031112222");
  await choose(sp, "Faculty");
  await choose(sp, "Course of study");
  await choose(sp, "Level");
  await dlg.locator(`xpath=.//legend[contains(translate(., "NEXTOFKIN", "nextofkin"), "next of kin")]/following::input[1]`).fill("Walkin Kin");
  await dlg.locator('input[placeholder="08031234567"]').last().fill("08033334444");
  await combo(dlg, "Room").click();
  await sp.getByRole("listbox").last().getByRole("option").nth(1).click();
  await dlg.getByRole("button", { name: "Save tenant" }).click();
  // The window only closes once the tenant and receipt are saved on the server
  await sp.getByText(`Walkin Tenant ${stamp} added to room`).waitFor({ timeout: 30000 });
  await sp.goto(BASE + "/residents", { waitUntil: "domcontentloaded" });
  await sp.locator('input[placeholder^="Search name"]').fill(`Walkin Tenant ${stamp}`);
  await sp.locator(`text="Walkin Tenant ${stamp}" >> visible=true`).first().click({ timeout: 30000 });
  await sp.getByText(/RCP-\d+/).first().waitFor({ timeout: 30000 });
  const n = receiptsIn(await sp.locator('[role="dialog"], aside').last().innerText())[0];
  if (receipts.includes(n)) throw new Error(`reused receipt RCP-${n}`);
  receipts.push(n);
  return `RCP-${n}`;
});

await step("staff: dashboard and every screen still load", sp, async () => {
  for (const p of ["/", "/rooms", "/renewals", "/messages", "/notifications", "/settings", "/profile"]) {
    await sp.goto(BASE + p, { waitUntil: "domcontentloaded" });
    await sp.waitForFunction(() => !document.body.innerText.includes("Loading hostel data"), null, { timeout: 30000 });
  }
});

// ------------------------------------------------------------ back to the tenant
await step("portal: sees the staff reply and status", tp, async () => {
  await tp.goto(ctxShared.requestUrl, { waitUntil: "domcontentloaded" });
  await tp.getByText("Plumber is coming tomorrow at 10am.").waitFor({ timeout: 30000 });
  await shot(tp, "e2e-8-tenant-sees-reply");
});

await step("portal: notifications list the reply and the message", tp, async () => {
  await tp.goto(BASE + "/portal/notifications", { waitUntil: "domcontentloaded" });
  await tp.getByText(/reply|in progress/i).first().waitFor({ timeout: 30000 });
  await shot(tp, "e2e-9-notifications");
});

await step("portal: payments show the cash receipts too", tp, async () => {
  await tp.goto(BASE + "/portal/payments", { waitUntil: "domcontentloaded" });
  await tp.waitForTimeout(2000);
  const seen = receiptsIn(await tp.innerText("body"));
  const mine = receipts.slice(0, 4);
  const missing = mine.filter((r) => !seen.includes(r));
  if (missing.length) throw new Error("missing " + missing.join(", "));
});

await step("unique receipts overall", sp, async () => {
  if (new Set(receipts).size !== receipts.length) throw new Error("duplicates in " + receipts.join(", "));
  return receipts.map((r) => `RCP-${r}`).join(", ");
});

// ------------------------------------------------------------ clean up
await step("staff: reset demo data", sp, async () => {
  if (process.env.HH_NO_RESET) return "skipped";
  await sp.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
  await sp.getByRole("button", { name: /Reset demo data/ }).click();
  const dlg = sp.locator('[role="dialog"]', { hasText: "Reset to demo data?" });
  await dlg.getByRole("button", { name: "Yes, continue" }).click();
  await sp.getByText("Done", { exact: true }).waitFor({ timeout: 120000 });
  await sp.goto(BASE + "/residents", { waitUntil: "domcontentloaded" });
  await sp.locator('input[placeholder^="Search name"]').fill(tenant.name);
  await sp.getByText("No residents found").waitFor({ timeout: 30000 });
  return "demo restored; test tenants gone";
});

console.log("\nproblems (tenant):", JSON.stringify([...new Set(tp.problems)], null, 1));
console.log("problems (staff):", JSON.stringify([...new Set(sp.problems)], null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
