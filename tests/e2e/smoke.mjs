// Read-only smoke test of the deployed app: logs in as staff, visits each screen, screenshots it,
// and reports console errors, failed requests and anything that looks like an error state.
import { BASE as DEFAULT_BASE, launch } from "./lib.mjs";

const BASE = process.argv[2] ?? DEFAULT_BASE;
const OUT = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const [email, password] = [process.env.HH_EMAIL, process.env.HH_PASSWORD];

const browser = await launch();
const results = [];

async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`));

  const shot = async (name) => page.screenshot({ path: `${OUT}${label}-${name}.png`, fullPage: false });
  const visit = async (path, waitFor) => {
    const t = Date.now();
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => !document.body.innerText.includes("Loading hostel data"), null, { timeout: 30000 });
      if (waitFor) await page.getByText(waitFor, { exact: false }).first().waitFor({ timeout: 20000 });
    } catch (e) {
      problems.push(`${path}: timed out waiting (${e.message.split("\n")[0]})`);
    }
    await page.waitForTimeout(800);
    const text = await page.innerText("body");
    const bad = ["Couldn't load", "Something went wrong", "Application error", "404", "This page could not be found"].filter((s) => text.includes(s));
    results.push({ label, path, ms: Date.now() - t, url: page.url().replace(BASE, ""), flags: bad });
    await shot(path === "/" ? "dashboard" : path.slice(1).replaceAll("/", "_"));
  };

  // Public pages
  await visit("/book", "Passport photograph");
  // Staff login
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[placeholder="Your password"]', password);
  const t = Date.now();
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading hostel data"), null, { timeout: 30000 });
    results.push({ label, path: "login → dashboard", ms: Date.now() - t, url: page.url().replace(BASE, ""), flags: [] });
  } catch {
    results.push({ label, path: "login", ms: Date.now() - t, url: page.url(), flags: ["login failed: " + (await page.innerText("form")).slice(0, 200)] });
  }
  await shot("after-login");
  for (const p of ["/", "/residents", "/rooms", "/renewals", "/payments", "/bookings", "/maintenance", "/messages", "/notifications", "/settings", "/profile"]) await visit(p);

  results.push({ label, path: "problems", flags: [...new Set(problems)] });
  await ctx.close();
}

await run("desktop", { width: 1366, height: 860 });
await run("phone", { width: 390, height: 844 });
await browser.close();
console.log(JSON.stringify(results, null, 1));
