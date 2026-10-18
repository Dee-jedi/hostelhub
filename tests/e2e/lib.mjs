import { chromium } from "playwright-core";

// Staging by default: the full test resets the demo data at the end
export const BASE = process.env.HH_BASE ?? "https://hostelhub-1--hostelhub-b51cc.us-central1.hosted.app";
export const SHOTS = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

export async function launch() {
  return chromium.launch({ executablePath: process.env.HH_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: !process.env.HH_HEADED });
}

/** A page that records console errors, page errors and failed requests. */
export async function newPage(browser, viewport = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.problems = [];
  page.on("console", (m) => m.type() === "error" && page.problems.push(`console: ${m.text().slice(0, 240)}`));
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.slice(0, 240)}`));
  page.on("response", (r) => r.status() >= 400 && page.problems.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`));
  return { ctx, page };
}

export const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png` });

/** The custom dropdown under a field label. */
export function combo(scope, label) {
  return scope
    .locator(`xpath=//*[normalize-space(text())="${label}"]/ancestor::*[.//button[@role="combobox"]][1]//button[@role="combobox"]`)
    .first();
}

export async function choose(page, label, option) {
  await combo(page, label).click();
  const list = page.getByRole("listbox").last();
  const search = page.locator('input[aria-controls]').last();
  if (option && (await search.isVisible().catch(() => false))) await search.fill(option);
  const opt = option ? list.getByRole("option", { name: option, exact: false }).first() : list.getByRole("option").nth(1);
  await opt.click();
}

/** A real JPEG drawn in the browser, for the passport photo input. */
export async function jpeg(page) {
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 360;
    const g = c.getContext("2d");
    g.fillStyle = "#dfe7e4";
    g.fillRect(0, 0, 300, 360);
    g.fillStyle = "#2a6b5f";
    g.beginPath();
    g.arc(150, 140, 70, 0, Math.PI * 2);
    g.fill();
    g.fillRect(60, 240, 180, 120);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return { name: "passport.jpg", mimeType: "image/jpeg", buffer: Buffer.from(data, "base64") };
}

export async function toastText(page) {
  return page.locator("[role=status], [role=alert]").allInnerTexts().catch(() => []);
}

export async function staffLogin(page, email, password) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  // The button stays disabled until Firebase has restored the session, i.e. the page is hydrated
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[placeholder="Your password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading hostel data"), null, { timeout: 30000 });
}
