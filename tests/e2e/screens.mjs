// Screenshots of the staff and booking screens for one hostel, for eyeballing UI changes.
// Usage: HH_EMAIL=… HH_PASSWORD=… node tests/e2e/screens.mjs <base url> <name prefix>
const base = process.argv[2] ?? "http://localhost:3100";
const prefix = process.argv[3] ?? "screen";
// lib.mjs reads HH_BASE when it loads, so set it first
process.env.HH_BASE = base;
const { BASE, launch, newPage, shot, staffLogin } = await import("./lib.mjs");
const browser = await launch();
const problems = [];

for (const [label, viewport] of [
  ["desktop", { width: 1366, height: 900 }],
  ["phone", { width: 390, height: 844 }],
]) {
  const { page } = await newPage(browser, viewport);
  const go = async (path, name, ready) => {
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading"), null, { timeout: 30000 }).catch(() => {});
    if (ready) await page.getByText(ready).first().waitFor({ timeout: 20000 }).catch(() => problems.push(`${label} ${path}: no "${ready}"`));
    await page.waitForTimeout(800);
    await shot(page, `${prefix}-${label}-${name}`);
  };
  await go("/book", "book", "Passport photograph");
  await staffLogin(page, process.env.HH_EMAIL, process.env.HH_PASSWORD).catch((e) => problems.push(`${label} login: ${e.message.split("\n")[0]}`));
  await go("/", "dashboard");
  await go("/rooms", "rooms", "Block A");
  await go("/settings", "settings", "Room types");
  problems.push(...page.problems.map((p) => `${label}: ${p}`));
}
await browser.close();
console.log(BASE, problems.length ? problems.join("\n") : "no problems");
