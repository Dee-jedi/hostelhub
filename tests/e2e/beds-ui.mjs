// Drives the per-bed screens on the per-bed demo hostel ("unity") the way a manager and a
// student would, then resets that hostel. Usage:
//   HH_EMAIL=… HH_PASSWORD=… node tests/e2e/beds-ui.mjs [base url, default http://unity.localhost:3100]
const base = process.argv[2] ?? "http://unity.localhost:3100";
process.env.HH_BASE = base;
const { choose, combo, jpeg, launch, newPage, shot, staffLogin } = await import("./lib.mjs");

const stamp = Date.now().toString(36);
const results = [];
async function step(name, page, fn) {
  try {
    const note = await fn();
    results.push(true);
    console.log("PASS", name, note ?? "");
  } catch (e) {
    results.push(false);
    console.log("FAIL", name, e.message.split("\n")[0]);
    await shot(page, `beds-fail-${name.replace(/\W+/g, "_")}`).catch(() => {});
  }
}
const browser = await launch();
const { page: sp } = await newPage(browser);
const { page: tp } = await newPage(browser, { width: 390, height: 844 });
const ready = (p) => p.waitForFunction(() => !document.body.innerText.includes("Loading"), null, { timeout: 30000 });
const typeName = `Single ${stamp}`;

await step("staff: login on the per-bed hostel", sp, () => staffLogin(sp, process.env.HH_EMAIL, process.env.HH_PASSWORD));

await step("settings: add a room type", sp, async () => {
  await sp.goto(base + "/settings", { waitUntil: "domcontentloaded" });
  await ready(sp);
  await sp.getByRole("button", { name: /Add room type/ }).click();
  const dlg = sp.locator('[role="dialog"]', { hasText: "Add a room type" });
  await combo(dlg, "People per room").click();
  await sp.getByRole("listbox").last().getByRole("option", { name: "1 person" }).click();
  await dlg.locator('input[placeholder="e.g. 350000"]').fill("300000");
  await dlg.locator("input").last().fill(typeName);
  await dlg.getByRole("button", { name: "Save" }).click();
  await sp.getByText(typeName).first().waitFor({ timeout: 20000 });
  await shot(sp, "beds-1-room-type");
});

await step("rooms: set an empty room to the new size", sp, async () => {
  await sp.goto(base + "/rooms", { waitUntil: "domcontentloaded" });
  await ready(sp);
  await sp.getByRole("button", { name: /Set sizes/ }).click();
  await sp.locator('button[aria-pressed]:visible', { hasText: "D10" }).first().click();
  await sp.getByText("1 room selected").waitFor();
  await combo(sp, "Choose a size…").click().catch(async () => sp.getByRole("combobox", { name: "New room size" }).click());
  await sp.getByRole("listbox").last().getByRole("option", { name: new RegExp(typeName) }).click();
  await sp.getByRole("button", { name: "Apply" }).click();
  await sp.getByText(/1 room set to/).waitFor({ timeout: 20000 });
  // Applying ends selection mode by itself
  const tile = sp.locator("button:visible", { hasText: "D10" }).first();
  await sp.waitForTimeout(1500);
  const text = await tile.innerText();
  if (!/of 1 beds?/.test(text)) throw new Error(`D10 tile says: ${text.replace(/\n/g, " ")}`);
  await shot(sp, "beds-2-set-size");
  return text.replace(/\n/g, " ");
});

await step("rooms: add a tenant to a free bed", sp, async () => {
  await sp.locator("button:visible", { hasText: "A10" }).first().click();
  const room = sp.locator('[role="dialog"]', { hasText: "Room A10" });
  await room.getByText("Free bed").first().waitFor();
  await room.getByRole("button", { name: /Add tenant to a free bed/ }).click();
  const dlg = sp.locator('[role="dialog"]', { hasText: "Add tenant" }).last();
  await dlg.locator('input[placeholder="e.g. Chioma Okafor"]').fill(`Bed Walkin ${stamp}`);
  await dlg.locator('input[placeholder="08031234567"]').first().fill("08031112222");
  await choose(sp, "Faculty");
  await choose(sp, "Course of study");
  await choose(sp, "Level");
  await dlg.locator(`xpath=.//legend[contains(translate(., "NEXTOFKIN", "nextofkin"), "next of kin")]/following::input[1]`).fill("Walkin Kin");
  await dlg.locator('input[placeholder="08031234567"]').last().fill("08033334444");
  const amount = await dlg.locator('xpath=.//*[normalize-space(text())="Amount (₦)"]/following::input[1]').inputValue();
  await dlg.getByRole("button", { name: "Save tenant" }).click();
  await sp.getByText(`Bed Walkin ${stamp} added to room A10`).waitFor({ timeout: 30000 });
  await sp.waitForTimeout(1500);
  const tile = await sp.locator("button:visible", { hasText: "A10" }).first().innerText();
  if (!/1 of 4 beds/.test(tile)) throw new Error(`A10 tile says: ${tile.replace(/\n/g, " ")}`);
  return `rent prefilled ₦${amount}; A10 now ${tile.split("\n").pop()}`;
});

await step("tenant profile shows the bed", sp, async () => {
  await sp.goto(base + "/residents", { waitUntil: "domcontentloaded" });
  await ready(sp);
  await sp.locator('input[placeholder^="Search name"]').fill(`Bed Walkin ${stamp}`);
  await sp.locator(`text="Bed Walkin ${stamp}" >> visible=true`).first().click();
  await sp.getByText(/Room A10 · bed A/).first().waitFor({ timeout: 15000 });
  await shot(sp, "beds-3-drawer");
});

await step("student: book a bed and pay", tp, async () => {
  await tp.goto(base + "/book", { waitUntil: "domcontentloaded" });
  await tp.getByText("Passport photograph").waitFor();
  await tp.locator("text=/From ₦150,000 per bed/ >> visible=true").first().waitFor();
  await tp.locator('input[type="file"]').first().setInputFiles(await jpeg(tp));
  await tp.waitForTimeout(1500);
  await tp.fill('input[placeholder="e.g. Chioma Okafor"]', `Bed Student ${stamp}`);
  await tp.locator('input[placeholder="08031234567"]').nth(0).fill("08031234567");
  await choose(tp, "Faculty");
  await choose(tp, "Course of study");
  await choose(tp, "Level");
  await tp.fill('input[placeholder="e.g. 22/ENG/045"]', `B/${stamp}`);
  await tp.locator(`xpath=//legend[contains(translate(., "NEXTOFKIN", "nextofkin"), "next of kin")]/following::input[1]`).fill("Parent Tester");
  await tp.locator('input[placeholder="08031234567"]').last().fill("08098765432");
  await tp.getByRole("button", { name: /Choose a room/ }).click();
  const free = tp.locator('button[aria-label$=": Free"]:visible').first();
  await free.waitFor({ timeout: 15000 });
  const tileText = await free.innerText();
  const room = (await free.getAttribute("aria-label")).match(/Room (\S+):/)[1];
  await free.click();
  await tp.locator("text=/per bed/ >> visible=true").last().waitFor();
  await shot(tp, "beds-4-picked");
  await tp.getByRole("button", { name: /Continue/ }).last().click();
  await tp.getByText("Create your tenant login").waitFor();
  await tp.locator('input[type="email"]').last().fill(`beds.${stamp}@example.com`);
  const pw = tp.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill("test1234");
  await pw.nth(1).fill("test1234");
  await tp.locator('input[type="checkbox"]').last().check();
  await tp.getByRole("button", { name: /Pay ₦/ }).last().click();
  const el = await tp.waitForSelector('iframe[src*="paystack"]', { timeout: 30000 });
  const frame = await el.contentFrame();
  await frame.getByText("Success", { exact: true }).click({ timeout: 30000 });
  await frame.getByRole("button", { name: /Pay NGN/ }).click();
  await tp.getByText(new RegExp(`Bed [A-D] in room ${room} is yours!`)).waitFor({ timeout: 60000 });
  await shot(tp, "beds-5-booked");
  return `${room} (${tileText.replace(/\n/g, " ")}) → ${await tp.locator("h2").first().innerText()}`;
});

await step("student: portal shows the bed", tp, async () => {
  await tp.getByRole("link", { name: /portal/i }).first().click();
  await tp.waitForURL(/\/portal/, { timeout: 30000 });
  await tp.getByText(/^Bed [A-D] · Block/).first().waitFor({ timeout: 30000 });
  await shot(tp, "beds-6-portal");
});

await step("reset the per-bed demo", sp, async () => {
  if (process.env.HH_NO_RESET) return "skipped";
  await sp.goto(base + "/settings", { waitUntil: "domcontentloaded" });
  await ready(sp);
  await sp.getByRole("button", { name: /Reset demo data/ }).click();
  await sp.locator('[role="dialog"]', { hasText: "Reset to demo data?" }).getByRole("button", { name: "Yes, continue" }).click();
  await sp.getByText("Done", { exact: true }).waitFor({ timeout: 120000 });
});

console.log("problems:", JSON.stringify([...new Set([...sp.problems, ...tp.problems])], null, 1));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
