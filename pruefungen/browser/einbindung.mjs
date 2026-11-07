/* NODE_ENV=development: Betreibercodes verlangen unter production den zweiten Faktor; die Probe meldet sich als Betreiber an. */
/* global document */
/* Einbindung Monatskorrektur (WP-16c) und Selbstauskunft (WP-15) im Browser (lokal, Wegwerfdaten, Demo-Betrieb).
     1. Beschäftigte beantragt eine abweichende Zeit (Selbstauskunft) — „Meine Schichten“ zeigt den offenen Antrag.
     2. Leitung sieht in Abrechnungsdaten → Stempelbefunde die Freigabe, gibt frei; die Beschäftigte sieht „freigegeben“.
     3. Leitung schließt den Vormonat ab, bestätigt den Lohnexport, die Monatskorrektur erscheint; „Korrektur beginnen“
        (Anlass + Grund) legt Revision 2 an und zeigt die laufende Korrektur.
     4. Die Beschäftigte sieht weder Freigabe noch Monatskorrektur.
   Aufruf: npx vite build; PORT=3205 node pruefungen/browser/einbindung.mjs  (playwright-core + Edge nötig). */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3205), BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-einbindung";
const daten = await mkdtemp(path.join(tmpdir(), "centric-einbindung-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
let xz = 0;
const j = async (p, b, t) => { const a = await fetch(BASE + p, { method: b ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": `10.6.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* warten */ } await new Promise((r) => setTimeout(r, 200)); }
const erg = [];
const ok = (n, v, info = "") => { erg.push([n, !!v]); console.log((v ? "OK   " : "FEHL ") + n + (v ? "" : " " + info)); };
const warten = async (pruefung, ms = 15000) => { const t0 = Date.now(); for (;;) { const r = await pruefung(); if (r || Date.now() - t0 > ms) return r; await new Promise((x) => setTimeout(x, 400)); } };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let b = null;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  b = await chromium.launch({ channel: "msedge" });
  const neu = async (w = 1280) => { const cx = await b.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: "block" }); const pg = await cx.newPage(); pg.setDefaultTimeout(20000); return { cx, pg }; };
  { const { cx, pg } = await neu();
    await pg.goto(BASE + "/", { waitUntil: "networkidle" });
    await pg.locator("input").first().fill(e.d.zugangscode);
    await pg.getByRole("button", { name: /anmelden/i }).first().click();
    await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 15000 });
    await pg.waitForTimeout(4000); await cx.close(); }
  const holeM = async (tok) => (((await j("/api/bestand", null, tok)).d.bestand || {}).mandanten || [])[0] || {};
  const mm = await holeM(bt);
  ok("Demo-Bestand angelegt", mm && mm.personen && mm.personen.length > 3);
  const von = (r) => (mm.personen.find((x) => x.rolle === r && x.status !== "inaktiv") || {});
  const lP = von("leitung"), mP = von("mitarbeiter");
  const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege: [{ rolle: "leitung", personId: lP.id, name: "L" }, { rolle: "mitarbeiter", personId: mP.id, name: "M" }] }, bt);
  const codeL = zz.d.zugaenge[0].code, codeM = zz.d.zugaenge[1].code;
  const tokL = (await j("/api/anmelden", { zugangscode: codeL })).d.token;
  const tokM = (await j("/api/anmelden", { zugangscode: codeM })).d.token;
  const fehler = [];
  const login = async (pg, code) => { await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(code); await pg.getByRole("button", { name: /anmelden/i }).first().click();
    await pg.waitForFunction(() => !/wird geöffnet|wird geladen/.test(document.body.innerText) && document.body.innerText.length > 300, null, { timeout: 90000 }).catch(() => {}); await pg.waitForTimeout(1500);
    const t = pg.locator('[aria-label="Tour schließen"]'); if (await t.count()) await t.first().click().catch(() => {}); };

  /* Ein Tag der letzten Tage im laufenden Monat, für den der Server die Selbstauskunft annimmt (Plan nötig). */
  const heute = new Date(); let tag = null;
  for (let k = 1; k <= 6 && !tag; k++) {
    const ds = iso(new Date(heute.getTime() - k * 86400000));
    if (ds.slice(0, 7) !== iso(heute).slice(0, 7)) break;
    const r = await j("/api/zeit-bestaetigen", { datum: ds, start: "05:30", ende: "15:00", pause: 15, grund: "Übergabe verlängert" }, tokM);
    if (r.s === 200 || r.s === 201) tag = ds;
  }
  if (process.env.DEBUG_EB) console.log("ERFASSUNG-L:", JSON.stringify(((await holeM(tokL)).erfassung || {})).slice(0, 500), "| tag", tag);
  ok("Beschäftigte stellt eine Selbstauskunft (Antrag) über den Server", !!tag, "kein Tag im laufenden Monat bis heute geplant");

  /* 1. Beschäftigte sieht den Antrag in „Meine Schichten“ */
  const M = await neu(375); M.pg.on("pageerror", (x) => fehler.push("M " + String(x).slice(0, 100)));
  await login(M.pg, codeM);
  const zuMeine = async () => { const nav = M.pg.getByRole("button", { name: /Mein Plan/ }).locator("visible=true").first();
    if (await nav.count()) { await nav.click().catch(() => {}); await M.pg.waitForTimeout(800); } };
  await warten(async () => { await zuMeine(); return /Meine Zeiten-Anträge/.test(await M.pg.evaluate(() => document.body.innerText)); }, 40000);
  let txtM = await M.pg.evaluate(() => document.body.innerText);
  if (process.env.DEBUG_EB) { console.log("NAVM:", await M.pg.evaluate(() => [...document.querySelectorAll("button")].filter((x) => x.offsetParent).map((x) => x.innerText.trim().slice(0, 20)).join(" | "))); await M.pg.screenshot({ path: "eb-m.png" }); }
  ok("Beschäftigte: „Meine Zeiten-Anträge“ zeigt den offenen Antrag", /Meine Zeiten-Anträge/.test(txtM) && /zählt noch nicht/.test(txtM), txtM.slice(0, 200).replace(/\s+/g, " "));
  ok("Beschäftigte: „Antrag zurückziehen“ vorhanden", /Antrag zurückziehen/.test(txtM));
  ok("Beschäftigte sieht keine Monatskorrektur/Freigabe", !/Korrektur nach Lohnexport/.test(txtM) && !/Zeiten-Anträge zur Freigabe/.test(txtM));

  /* 2. Leitung: Abrechnungsdaten → Stempelbefunde → Freigeben */
  const L = await neu(1280); L.pg.on("pageerror", (x) => fehler.push("L " + String(x).slice(0, 100)));
  L.pg.on("dialog", (dl) => dl.accept("Grund für das Verwerfen der Korrektur"));
  await login(L.pg, codeL);
  await L.pg.getByRole("button", { name: /^Nachsehen/ }).first().click().catch(() => {});
  await L.pg.getByRole("button", { name: /Abrechnungsdaten/ }).locator("visible=true").first().click().catch(() => {});
  await L.pg.waitForTimeout(800);
  const reiter = async (name) => { await L.pg.getByRole("tab", { name }).locator("visible=true").first().click().catch(() => {}); await L.pg.waitForTimeout(700); };
  await reiter("Stempelbefunde");
  let txtL = await L.pg.evaluate(() => document.body.innerText);
  if (process.env.DEBUG_EB) { console.log("TXTL:", txtL.replace(/s+/g, " ").slice(300, 1500)); await L.pg.screenshot({ path: "eb-l.png" }); }
  const freigeben = L.pg.getByRole("button", { name: /^Freigeben$/ }).locator("visible=true").first();
  ok("Leitung: Stempelbefunde zeigen die offene Selbstauskunft mit „Freigeben“", await freigeben.count() > 0, txtL.slice(0, 300).replace(/\s+/g, " "));
  ok("Leitung sieht Vorschlag 05:30–15:00", /05:30–15:00/.test(txtL));
  await freigeben.click().catch(() => {});
  const frei = await warten(async () => { const x = (await holeM(tokL)).erfassung || {}; const q = x[`${mP.id}|${tag}`]; return q && q.selbstauskunft && q.selbstauskunft.status === "genehmigt"; });
  ok("Freigabe läuft über den Server (Status genehmigt)", frei);
  await L.pg.waitForTimeout(500);
  ok("Leitung: Freigabekarte verschwindet nach der Freigabe", await L.pg.getByRole("button", { name: /^Freigeben$/ }).locator("visible=true").count() === 0);
  await M.pg.reload({ waitUntil: "networkidle" }); await M.pg.waitForTimeout(2500);
  await zuMeine();
  txtM = await M.pg.evaluate(() => document.body.innerText);
  ok("Beschäftigte sieht „freigegeben“", /freigegeben/.test(txtM));

  /* 3. Monatskorrektur: Vormonat abschließen, Lohnexport bestätigen, Korrektur beginnen */
  const vym = iso(new Date(heute.getFullYear(), heute.getMonth() - 1, 1)).slice(0, 7);
  /* Der Monat wird im Monatsplan gewechselt (ym ist Zustand der Anwendung), danach zurück zu den Abrechnungsdaten. */
  await L.pg.getByRole("button", { name: /^Planen/ }).first().click().catch(() => {});
  await L.pg.getByRole("button", { name: /^Monatsplan/ }).locator("visible=true").first().click().catch(() => {});
  await L.pg.waitForTimeout(600);
  await L.pg.locator('[aria-label="Zeitraum wechseln"] button').first().click().catch(() => {});
  await L.pg.waitForTimeout(600);
  await L.pg.getByRole("button", { name: /^Nachsehen/ }).first().click().catch(() => {});
  await L.pg.getByRole("button", { name: /Abrechnungsdaten/ }).locator("visible=true").first().click().catch(() => {});
  await L.pg.waitForTimeout(800);
  await reiter("Stempelbefunde");
  if (process.env.DEBUG_EB) console.log("VM:", (await L.pg.evaluate(() => document.body.innerText)).replace(/s+/g, " ").match(/Abrechnungsdaten · w+ d+/));
  await L.pg.getByRole("button", { name: "Monat abschließen" }).first().click().catch(() => {});
  const zu = await warten(async () => { const e2 = (await holeM(tokL)).monatsabschluss || {}; return e2[vym] && e2[vym].abgeschlossen; });
  ok("Vormonat abgeschlossen (Server)", !!zu, vym);
  await reiter("Lohnausgabe");
  const dl = L.pg.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await L.pg.getByRole("button", { name: "Als CSV ausgeben" }).first().click().catch(() => {});
  const datei = await dl; await L.pg.waitForTimeout(800);
  if (process.env.DEBUG_EB) console.log("DOWNLOAD:", datei ? datei.suggestedFilename() : "keiner", "|", (await L.pg.evaluate(() => document.body.innerText)).replace(/s+/g, " ").slice(200, 700));
  await reiter("Stempelbefunde");
  await L.pg.getByRole("button", { name: "Lohnexport bestätigen" }).first().click().catch(() => {});
  /* Im Demo-Betrieb sind frühere Monate offen: der Export braucht die ausdrückliche Überstimmung (Kategorie + Begründung). */
  const kat = L.pg.getByLabel("Kategorie der Begründung");
  if (await kat.count()) {
    await kat.selectOption({ index: 1 });
    await L.pg.getByLabel("Begründung für den Lohnexport trotz Vormonat").fill("Demo-Bestand: frühere Monate bewusst offen");
    await L.pg.getByRole("button", { name: "Trotz Vormonat bestätigen" }).click().catch(() => {});
  }
  if (process.env.DEBUG_EB) { await L.pg.waitForTimeout(1500); const tx = (await L.pg.evaluate(() => document.body.innerText)).replace(/s+/g, " "); console.log("NACH-BESTAETIGEN:", tx.slice(tx.indexOf("Oktober") > -1 ? tx.indexOf("Oktober") - 20 : 0).slice(0, 900)); await L.pg.screenshot({ path: "eb-l2.png" }); }
  const exp = await warten(async () => { const e2 = (await holeM(tokL)).monatsabschluss || {}; return e2[vym] && e2[vym].lohnexport; });
  ok("Lohnexport bestätigt (Server)", !!exp);
  await L.pg.waitForTimeout(800);
  /* Die Einführungstour liegt unten über dem Block: einklappen. */
  { const tour = L.pg.getByRole("button", { name: "Einklappen" }); if (await tour.count()) await tour.first().click().catch(() => {}); const zu2 = L.pg.locator('[aria-label="Tour schließen"]'); if (await zu2.count()) await zu2.first().click().catch(() => {}); await L.pg.waitForTimeout(400); }
  const korrBtn = L.pg.getByRole("button", { name: "Korrektur beginnen" }).locator("visible=true").first();
  ok("Leitung: „Korrektur nach Lohnexport“ erscheint", await korrBtn.count() > 0);
  await korrBtn.click().catch(() => {});
  await L.pg.getByLabel("Anlass der Korrektur").selectOption({ index: 1 }).catch(() => {});
  await L.pg.getByLabel("Grund der Korrektur").fill("Nachtrag nach Rückmeldung der Lohnstelle").catch(() => {});
  await L.pg.getByRole("button", { name: "Korrektur beginnen" }).last().click().catch(() => {});
  if (process.env.DEBUG_EB) { await L.pg.waitForTimeout(2500); await L.pg.screenshot({ path: "eb-l3.png" }); const mo = (await holeM(tokL)).monatsabschluss || {}; console.log("MA:", JSON.stringify(mo[vym]).slice(0, 600)); }
  const rev2 = await warten(async () => { const e2 = (await holeM(tokL)).monatsabschluss || {}; return e2[vym] && e2[vym].revision === 2 && e2[vym]; });
  ok("Korrektur begonnen: Revision 2 beim Server", !!rev2);
  await L.pg.waitForTimeout(600);
  txtL = await L.pg.evaluate(() => document.body.innerText);
  ok("Leitung sieht „Korrektur läuft“ und „Revision 2“", /Korrektur läuft seit/.test(txtL) && /Revision 2/.test(txtL));
  ok("Leitung sieht „Differenz ansehen / freigeben“ und „Korrektur verwerfen“", /Differenz ansehen \/ freigeben/.test(txtL) && /Korrektur verwerfen/.test(txtL));

  /* 4. Beschäftigte: weiterhin nichts davon */
  await M.pg.reload({ waitUntil: "networkidle" }); await M.pg.waitForTimeout(2000);
  const txtM2 = await M.pg.evaluate(() => document.body.innerText);
  ok("Beschäftigte sieht keine Korrekturrevision", !/Korrektur nach Lohnexport|Revision 2/.test(txtM2));
  ok("keine Seitenfehler", fehler.length === 0, fehler.join(" | "));
} finally { if (b) await b.close(); srv.kill(); }
const bad = erg.filter((x) => !x[1]);
console.log(`\n${erg.length - bad.length}/${erg.length} bestanden`);
process.exit(bad.length ? 1 : 0);
