import { BASE, launch, newPage, staffLogin } from "./lib.mjs";
const NAME = "Segun Ogunleye";
const b = await launch();
async function prep() {
  const { page } = await newPage(b);
  await staffLogin(page, process.env.HH_EMAIL, process.env.HH_PASSWORD);
  await page.goto(BASE + "/residents", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder^="Search name"]').fill(NAME);
  await page.locator(`text="${NAME}" >> visible=true`).first().click();
  await page.getByRole("button", { name: /Renew \/ Pay/ }).click();
  await page.locator("label", { hasText: "Renew rent for" }).locator("input").uncheck();
  page.texts = [];
  page.poll = setInterval(async () => { try { for (const m of (await page.locator("body").innerText()).match(/Couldn't[^\n]*|Payment of[^\n]*recorded/g) ?? []) if (!page.texts.includes(m)) page.texts.push(m); } catch {} }, 100);
  return page;
}
const pages = await Promise.all([prep(), prep(), prep()]);
const go = (p) => p.getByRole("button", { name: /Record payment/ }).click().then(async () => {
  const d = p.locator('[role="dialog"]', { hasText: "Received from" }).last();
  await d.waitFor({ timeout: 30000 }).catch(() => {});
  return (await d.innerText().catch(() => "")).match(/RCP-\d+/)?.[0] ?? "no receipt";
});
const got = await Promise.all(pages.map(go));
await new Promise((r) => setTimeout(r, 1500));
pages.forEach((p, i) => { clearInterval(p.poll); console.log(`staff ${i + 1}:`, got[i], p.texts, p.problems.filter((x) => !x.startsWith("console"))); });
console.log(new Set(got).size === got.length && !got.includes("no receipt") ? "ALL DISTINCT AND SAVED" : "PROBLEM");
await b.close();
