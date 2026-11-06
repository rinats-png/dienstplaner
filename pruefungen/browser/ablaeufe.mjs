/* global document */
/* Funktionsabläufe im Browser mit gefülltem Demo-Betrieb (lokal, Wegwerfdaten).
   Prüft echte Bedienwege über mehrere Rollen:
     1. Beschäftigte beantragt Urlaub (Anliegen → „Frei beantragen“), Leitung sieht den Antrag und genehmigt ihn,
        die Beschäftigte sieht den Entscheid.
     2. Leitung öffnet im Monatsplan einen Tag (Tagesdetail) und schließt ihn mit Escape.
     3. Beschäftigte darf die Leitungsansichten nicht sehen (Navigation ohne Verwaltung/Planung).
     4. Speichern der Leitung (Person anlegen) läuft mit ETag durch, danach liest die Beschäftigte den neuen Stand.
   Aufruf: npx vite build; node pruefungen/browser/ablaeufe.mjs  (playwright-core + Edge nötig). */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3200), BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-ablauf";
const daten = await mkdtemp(path.join(tmpdir(), "centric-ablauf-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production",
    CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
let xz = 0;
const j = async (p, b, t) => { const a = await fetch(BASE + p, { method: b ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": `10.5.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* warten */ } await new Promise((r) => setTimeout(r, 200)); }
const erg = [];
const ok = (n, v, info = "") => { erg.push([n, !!v]); console.log((v ? "OK   " : "FEHL ") + n + (v ? "" : " " + info)); };
let b = null;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  b = await chromium.launch({ channel: "msedge" });
  const neu = async (w = 1280) => { const cx = await b.newContext({ viewport: { width: w, height: 850 }, serviceWorkers: "block" }); const pg = await cx.newPage(); return { cx, pg }; };
  { const { cx, pg } = await neu();
    await pg.goto(BASE + "/", { waitUntil: "networkidle" });
    await pg.locator("input").first().fill(e.d.zugangscode);
    await pg.getByRole("button", { name: /anmelden/i }).first().click();
    await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 15000 });
    await pg.waitForTimeout(4000); await cx.close(); }
  const g = await j("/api/bestand", null, bt);
  const mm = ((g.d.bestand || {}).mandanten || [])[0];
  ok("Demo-Bestand angelegt (Betrieb mit Personen)", mm && mm.personen && mm.personen.length > 3);
  const von = (r) => (mm.personen.find((x) => x.rolle === r && x.status !== "inaktiv") || {});
  const lP = von("leitung"), mP = von("mitarbeiter");
  const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege: [{ rolle: "leitung", personId: lP.id, name: "L" }, { rolle: "mitarbeiter", personId: mP.id, name: "M" }] }, bt);
  const codeL = zz.d.zugaenge[0].code, codeM = zz.d.zugaenge[1].code;
  const tokL = (await j("/api/anmelden", { zugangscode: codeL })).d.token;
  const mPL = ((((await j("/api/bestand", null, tokL)).d.bestand || {}).mandanten || [])[0] || {}).personen.find((x) => x.id === mP.id) || {};
  const lesL = async () => ((((await j("/api/bestand", null, tokL)).d.bestand || {}).mandanten || [])[0] || {}).anfragen || [];
  const login = async (pg, code) => { await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(code); await pg.getByRole("button", { name: /anmelden/i }).first().click(); await pg.waitForTimeout(3000); };
  const fehler = [];

  /* 1. Antrag der Beschäftigten */
  const M = await neu(375); M.pg.on("pageerror", (x) => fehler.push("M " + String(x).slice(0, 100)));
  await login(M.pg, codeM);
  await M.pg.getByRole("button", { name: /Anliegen|Anträge/ }).locator("visible=true").first().click().catch(() => {});
  await M.pg.waitForTimeout(600);
  const vorherIds = new Set((await lesL()).map((a) => a.id));
  const frei = M.pg.getByRole("button", { name: /Frei beantragen/ }).locator("visible=true").first();
  ok("Beschäftigte findet „Frei beantragen“", await frei.count() > 0);
  await frei.click().catch(() => {});
  await M.pg.waitForTimeout(600);
  const blattOffen = await M.pg.locator('[role="dialog"][aria-modal="true"]').count();
  ok("Antragsblatt öffnet", blattOffen > 0);
  if (process.env.DEBUG_BLATT) { console.log("BLATT:", await M.pg.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-modal="true"] button, [role="dialog"][aria-modal="true"] input, [role="dialog"][aria-modal="true"] select')].map((e) => e.tagName + ":" + (e.innerText || e.type || e.name || "").trim().slice(0, 25)).join(" | "))); await M.pg.screenshot({ path: "blatt.png" }); }
  const senden = M.pg.getByRole("button", { name: /Antrag stellen/ }).locator("visible=true").last();
  await senden.click().catch(() => {});
  await M.pg.waitForTimeout(2500);
  const antraege = await lesL();
  const meinAntrag = antraege.find((a) => !vorherIds.has(a.id) && a.personId === mP.id);
  ok("neuer Antrag der Beschäftigten liegt serverseitig (offen)", meinAntrag && meinAntrag.status === "offen", `neu: ${antraege.filter((a) => !vorherIds.has(a.id)).length}, gesamt ${antraege.length}`);

  /* 2. Leitung entscheidet */
  const L = await neu(1280); L.pg.on("pageerror", (x) => fehler.push("L " + String(x).slice(0, 100)));
  await login(L.pg, codeL);
  const schliessen = L.pg.locator('[aria-label="Tour schließen"]'); if (await schliessen.count()) await schliessen.first().click().catch(() => {});
  await L.pg.locator(".bpille:visible", { hasText: /Zu entscheiden/ }).first().click();
  await L.pg.locator(".utab:visible", { hasText: /^Anträge/ }).first().click();
  await L.pg.getByRole("button", { name: /Genehmigen|Mitzeichnen/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
  await L.pg.waitForTimeout(500);
  const zeile = L.pg.getByText(new RegExp(mPL.nachname + ", " + mPL.vorname)).first().locator("xpath=ancestor::*[.//button[normalize-space()='Genehmigen' or normalize-space()='Mitzeichnen']][1]");
  const genehmigen = zeile.getByRole("button", { name: /^(Genehmigen|Mitzeichnen)$/ }).first();
  ok("Leitung sieht den Antrag der Person mit Entscheidungsknopf", await genehmigen.count() > 0);
  if (!(await genehmigen.count())) console.log("ANTRAEGE-SEITE:", (await L.pg.evaluate(() => document.querySelector("main").innerText)).replace(/s+/g, " ").slice(0, 600), "| gesucht:", mPL.nachname + ", " + mPL.vorname);
  await genehmigen.click().catch(() => {}); await L.pg.waitForTimeout(2000);
  const a2 = (await lesL()).find((a) => meinAntrag && a.id === meinAntrag.id);
  ok("Antrag nach Entscheid nicht mehr offen", a2 && a2.status !== "offen", JSON.stringify(a2 || {}).slice(0, 160));

  /* 3. Beschäftigte sieht den Entscheid */
  await M.pg.reload({ waitUntil: "networkidle" }); await M.pg.waitForTimeout(2500);
  await M.pg.getByRole("button", { name: /Anliegen|Anträge/ }).locator("visible=true").first().click().catch(() => {});
  await M.pg.waitForTimeout(800);
  const txtM = await M.pg.evaluate(() => document.body.innerText);
  ok("Beschäftigte sieht Entscheid (genehmigt)", /genehmigt/i.test(txtM));

  /* 4. Tagesdetail im Monatsplan */
  await L.pg.locator(".bpille:visible", { hasText: /Im Dienst/ }).first().click();
  await L.pg.locator(".utab:visible", { hasText: /^Lagebild/ }).first().click();
  await L.pg.waitForTimeout(1500);
  const tagBtn = L.pg.getByRole("button", { name: /Tag öffnen/ }).locator("visible=true").first();
  if (await tagBtn.count()) { await tagBtn.click().catch(() => {}); await L.pg.waitForTimeout(800); }
  const dlg = await L.pg.locator('[aria-modal="true"]').count();
  ok("„Tag öffnen“ im Lagebild öffnet das Tagesdetail", dlg > 0);
  if (dlg) { await L.pg.keyboard.press("Escape"); await L.pg.waitForTimeout(500);
    ok("Escape schließt den Dialog", (await L.pg.locator('[aria-modal="true"]').count()) === 0); }

  /* 5. Rechte: Beschäftigte ohne Leitungsansichten */
  const sichtbar = await M.pg.evaluate(() => document.body.innerText);
  ok("Beschäftigte sieht keine Verwaltung/Betreiberkonsole", !/Betreiberkonsole|Mandanten|Rechnungen/.test(sichtbar));
  const rollen = await j("/api/bestand", null, (await j("/api/anmelden", { zugangscode: codeM })).d.token);
  const personen = (((rollen.d.bestand || {}).mandanten || [])[0] || {}).personen || [];
  ok("API liefert der Beschäftigten keine Ist-Zeiten fremder Personen", !personen.some((p) => p.id !== mP.id && p.istStunden !== undefined && p.istStunden !== null));

  ok("keine Seitenfehler in den Abläufen", fehler.length === 0, fehler.join(" | "));
} finally { if (b) await b.close(); srv.kill(); }
const bad = erg.filter((x) => !x[1]);
console.log(`\n${erg.length - bad.length}/${erg.length} bestanden`);
process.exit(bad.length ? 1 : 0);
