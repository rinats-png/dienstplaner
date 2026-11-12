/* global document, window, getComputedStyle */
/* ==========================================================================
   WP-40 BROWSER-ABNAHME WCAG 2.2 AA (lokal, manuell, Wegwerfdaten)

   Misst je Rolle (mitarbeiter, planer, leitung, subplaner) und Breite (320, 360, 390, 768 CSS-px) auf den Kernansichten:
     reflow   1.4.10  kein Querscrollen der Seite; Rollbereiche (Datentabellen mit overflow-x) werden namentlich ausgewiesen
     ziele    2.5.8   jedes bedienbare Ziel mindestens 24 x 24 CSS-px (Ausnahme "Abstand" wie in abnahme-kern.mjs); jedes Ziel einzeln genannt
     fokus    2.4.11  Tab-Folge durch die Hauptbedienelemente: das fokussierte Element darf nicht ganz unter einer festen
                      oder klebenden Leiste (Kopf, untere Leiste, Meldungsstreifen) liegen
     fehler   3.3.1   Formulare Stempel (Absage), Korrektur, Krankmeldung, Antrag, Person hinzufuegen: Fehler als sichtbarer Text
                      (role=alert / Live-Region) und mit dem Feld per aria-describedby verbunden
   Die Bewertung steht in abnahme-kern.mjs und wcag-kern.mjs (ohne Browser geprueft in pruefungen/wcag-wp40.test.js).
   Kein CI-Bestandteil, wie die uebrigen Browserproben. Ziel ist nur 127.0.0.1; der Server laeuft mit frischem Datenordner,
   Zufallsschluessel und erfundenem Demo-Bestand, nie mit der Staging- oder Produktionsumgebung.

   Aufruf:  node pruefungen/browser/wcag-wp40.mjs        (oder npm run pruefung:wcag-wp40-browser)
   Umgebung (alles optional):
     WCAG_ROLLEN=mitarbeiter,planer,leitung,subplaner   WCAG_BREITEN=320,360,390,768   WCAG_KRITERIEN=reflow,ziele,fokus,fehler
     WCAG_ANSICHTEN=<Text>  nur Ansichten, deren Name den Text enthaelt      WCAG_TABS=18  Tab-Schritte je Ansicht
     WCAG_DIST=<Ordner>  fertigen Bau verwenden (sonst vite build in ein Temp-Verzeichnis)      PORT=3223
     WCAG_KANAL=msedge  installierten Edge statt des gebuendelten Chromium      WCAG_JSON=<Pfad>  Bericht als JSON
   Exit 0: keine Befunde · 1: Befunde · 2: Aufruf/Umgebung · 3: Aufbau oder Server gescheitert
   ========================================================================== */
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { istLoopback, reflowOk, zielgroessenBefunde, fehlertextOk, zaehleBefunde } from "./abnahme-kern.mjs";
import { verdecktDurchFest, verdecktAnteil, fehlerAmFormular } from "./wcag-kern.mjs";
import { messeSeite } from "./geraete-messung.mjs";
import { ZIEL_MINDEST } from "../../src/ui/geraete.js";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3223), BASE = `http://127.0.0.1:${PORT}`;
if (!istLoopback(BASE)) { console.error("ABBRUCH: Ziel ist nicht die eigene Maschine."); process.exit(2); }
const ALLE_KRIT = ["reflow", "ziele", "fokus", "fehler"], ALLE_ROLLEN = ["mitarbeiter", "planer", "leitung", "subplaner"];
const KRIT = (process.env.WCAG_KRITERIEN || ALLE_KRIT.join(",")).split(",").map((s) => s.trim());
const ROLLEN = (process.env.WCAG_ROLLEN || ALLE_ROLLEN.join(",")).split(",").map((s) => s.trim());
const BREITEN = (process.env.WCAG_BREITEN || "320,360,390,768").split(",").map(Number);
const TABS = Number(process.env.WCAG_TABS || 18);
if (KRIT.some((k) => !ALLE_KRIT.includes(k)) || ROLLEN.some((r) => !ALLE_ROLLEN.includes(r)) || BREITEN.some((w) => !(w >= 200 && w <= 2000))) {
  console.error(`ABBRUCH: WCAG_KRITERIEN aus ${ALLE_KRIT.join(",")}; WCAG_ROLLEN aus ${ALLE_ROLLEN.join(",")}; WCAG_BREITEN in CSS-px.`); process.exit(2);
}
const hoehe = (w) => (w >= 700 ? 1024 : w >= 390 ? 844 : 740);

/* Kernansichten je Rolle (wie die Geraetematrix WP-21, pruefungen/browser/geraete-wp21.mjs) */
const ANSICHTEN = {
  mitarbeiter: ["Heute", "Mein Plan", "Anliegen", "Mehr"],
  subplaner: ["Meine Schichten", "Lagebild", "Anträge", "Personaleinsatz", "Tauschbörse"],
  planer: ["Monatsplan", "Personaleinsatz", "Anträge", "Prüfung", "Personal"],
  leitung: ["Monatsplan", "Anträge", "Personal", "Abrechnungsdaten", "Betrieb"],
};

/* ---------------------------------------------------------------- Befunde */
const befunde = [], hinweise = [], belege = [], offen = [];
const melde = (k, t) => { befunde.push({ k, text: t }); console.log(`BEFUND [${k}] ${t}`); };
const hinweis = (k, t) => { hinweise.push({ k, text: t }); console.log(`HINWEIS [${k}] ${t}`); };
const beleg = (k, t) => { belege.push({ k, text: t }); console.log(`OK     [${k}] ${t}`); };
const nichtGeprueft = (t) => { offen.push(t); console.log(`NICHT GEPRUEFT ${t}`); };
const kurz = (x) => String(x && x.message ? x.message : x).split("\n")[0].replace(/\s+/g, " ").slice(0, 120);

/* ---------------------------------------------------------------- Bau + Server */
const aufraeumen = []; let srv = null, browser = null;
async function ende(code) {
  try { if (browser) await browser.close(); } catch { /* weg */ }
  try { if (srv) srv.kill(); } catch { /* weg */ }
  for (const d of aufraeumen) await rm(d, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => ende(130));
let dist = process.env.WCAG_DIST ? path.resolve(process.env.WCAG_DIST) : null;
if (!dist) {
  dist = await mkdtemp(path.join(tmpdir(), "centric-wcag-bau-")); aufraeumen.push(dist);
  try { execFileSync(process.execPath, [path.join(WT, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: WT, stdio: "ignore" }); }
  catch { console.error("ABBRUCH: vite build ist gescheitert (npm ci gelaufen?)."); await ende(3); }
}
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-wcag";
const daten = await mkdtemp(path.join(tmpdir(), "centric-wcag-daten-")); aufraeumen.push(daten);
srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: dist, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
    CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development", CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
let xz = 0;
const j = async (p, bd, t) => {
  const a = await fetch(BASE + p, { method: bd ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.2.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: bd ? JSON.stringify(bd) : undefined });
  return { s: a.status, d: await a.json().catch(() => ({})) };
};
let da = false;
for (let i = 0; i < 60 && !da; i++) { try { da = (await fetch(BASE + "/gesund")).ok; } catch { await new Promise((r) => setTimeout(r, 200)); } }
if (!da) { console.error("ABBRUCH: lokaler Server startet nicht."); await ende(3); }

try { browser = await chromium.launch(process.env.WCAG_KANAL ? { channel: process.env.WCAG_KANAL } : {}); }
catch (x) {
  try { browser = await chromium.launch({ channel: "msedge" }); console.log("Hinweis: gebuendeltes Chromium fehlt, installierter Edge wird verwendet."); }
  catch (y) { console.error("ABBRUCH: kein Browser (Chromium/Edge) startbar: " + kurz(x) + " | " + kurz(y)); await ende(3); }
}

/* ---------------------------------------------------------------- Demo-Bestand und Zugaenge */
const codes = {}; const mitarbeiterCodes = [];
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  const cx = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block" }); const pg = await cx.newPage();
  await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(e.d.zugangscode);
  await pg.getByRole("button", { name: /anmelden/i }).first().click();
  await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 20000 });
  await pg.waitForTimeout(4000); await cx.close();
  const personen = ((((await j("/api/bestand", null, bt)).d.bestand || {}).mandanten || [])[0] || {}).personen || [];
  const aktiv = (r) => personen.filter((x) => x.rolle === r && x.status !== "inaktiv" && (r !== "mitarbeiter" || x.imSchichtdienst !== false));
  const eintr = [];
  for (const r of ROLLEN) {
    if (r === "mitarbeiter") continue;
    const p = aktiv(r)[0];
    if (p) eintr.push({ rolle: r, personId: p.id, name: "WCAG " + r }); else nichtGeprueft(`Rolle ${r}: im Demo-Bestand keine Person`);
  }
  const ms = ROLLEN.includes("mitarbeiter") ? aktiv("mitarbeiter").slice(0, BREITEN.length) : [];
  for (const p of ms) eintr.push({ rolle: "mitarbeiter", personId: p.id, name: "WCAG Mitarbeit " + p.id });
  const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege: eintr }, bt);
  if (!zz.d.zugaenge) throw new Error("Zugaenge nicht angelegt (Status " + zz.s + ")");
  eintr.forEach((x, i) => { if (x.rolle === "mitarbeiter") mitarbeiterCodes.push(zz.d.zugaenge[i].code); else codes[x.rolle] = zz.d.zugaenge[i].code; });
  console.log(`Demo-Betrieb: ${personen.length} erfundene Personen; Zugänge: ${Object.keys(codes).join(", ")}${mitarbeiterCodes.length ? `, mitarbeiter x${mitarbeiterCodes.length}` : ""}`);
} catch (x) { console.error("ABBRUCH: Einrichtung gescheitert: " + kurz(x)); await ende(3); }

/* ---------------------------------------------------------------- Anmeldung und Navigation */
async function tourZu(pg) {
  for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) { const t = pg.locator(zu).first(); if (await t.count()) await t.click().catch(() => {}); }
  await pg.waitForTimeout(250);
}
async function anmelden(rolle, w, code) {
  const cx = await browser.newContext({ viewport: { width: w, height: hoehe(w) }, serviceWorkers: "block", hasTouch: w < 1000 });
  const pg = await cx.newPage(); pg.setDefaultTimeout(8000);
  pg.on("dialog", (d) => d.accept().catch(() => {}));
  await pg.goto(BASE + "/", { waitUntil: "load", timeout: 60000 }); await pg.locator("input").first().fill(code, { timeout: 30000 });
  await pg.getByRole("button", { name: /anmelden/i }).first().click();
  await pg.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
  await pg.waitForTimeout(700); await tourZu(pg);
  return { cx, pg };
}
/** In die Ansicht wechseln: Reiter unten (Telefonansicht) oder Menuetaste und Seitenleiste. Liefert false, wenn nicht erreichbar. */
async function geheZu(pg, name) {
  if (await pg.locator(".m-tabs button:visible").count()) {
    const t = pg.locator(".m-tabs button", { hasText: name }).first();
    if (!(await t.count())) return false;
    await t.click(); await pg.waitForTimeout(700); return true;
  }
  const menue = pg.locator(".kopf-menue:visible").first();
  if (await menue.count() && !(await pg.locator(".seitenleiste.offen").count())) { await menue.click(); await pg.waitForTimeout(300); }
  const re = new RegExp("^\\s*" + name.replace(/[()]/g, "\\$&") + "\\s*\\d*\\s*$");
  const l = pg.locator(".seitenleiste .slink", { hasText: name }).filter({ hasText: re }).first();
  if (!(await l.count())) return false;
  await l.click(); await pg.waitForTimeout(900); return true;
}

/* ---------------------------------------------------------------- Messung im Browser */
function messeZiele() {
  const sichtbar = (el) => { const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem], [tabindex="0"]';
  const ziele = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("[inert], [aria-hidden=true]") || el.disabled) continue;
    let ref = el;
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) { const l = el.closest("label") || (el.id && document.querySelector(`label[for="${el.id}"]`)); if (l) ref = l; }
    if (!sichtbar(ref)) continue;
    const r = ref.getBoundingClientRect();
    if (r.right <= 0 || r.left >= window.innerWidth) continue;
    if (el.classList.contains("sprung") || el.classList.contains("nurLeser")) continue;
    const cs = getComputedStyle(el);
    const inline = el.tagName === "A" && cs.display === "inline" && !!el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 12;
    const name = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "")
      + "[" + (el.getAttribute("aria-label") || el.textContent || el.value || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 26) + "]";
    ziele.push({ id: name, x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, inline });
  }
  return ziele;
}
function messeFokus() {
  const e = document.activeElement;
  if (!e || e === document.body || e === document.documentElement) return null;
  const r = e.getBoundingClientRect();
  const name = (x) => x.tagName.toLowerCase() + (typeof x.className === "string" && x.className.trim() ? "." + x.className.trim().split(/\s+/)[0] : "")
    + "[" + (x.getAttribute("aria-label") || x.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22) + "]";
  const fest = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    if (el.contains(e) || e.contains(el) || el.classList.contains("sprung")) continue;
    const q = el.getBoundingClientRect(); if (q.width <= 0 || q.height <= 0) continue;
    /* Nur Ueberlagerungen, die dort auch obenauf liegen (Stapelreihenfolge): der Treffer in der Mitte der Schnittflaeche gehoert zur Ueberlagerung. */
    const l = Math.max(q.left, r.left), t = Math.max(q.top, r.top), rr = Math.min(q.right, r.right), bb = Math.min(q.bottom, r.bottom);
    if (!(rr > l && bb > t)) continue;
    const px = Math.min(Math.max((l + rr) / 2, 0), window.innerWidth - 1), py = Math.min(Math.max((t + bb) / 2, 0), window.innerHeight - 1);
    const treffer = document.elementFromPoint(px, py);
    if (!treffer || !(treffer === el || el.contains(treffer))) continue;
    fest.push({ l: q.left, t: q.top, r: q.right, b: q.bottom, n: name(el) });
  }
  return { n: name(e), rect: { l: r.left, t: r.top, r: r.right, b: r.bottom }, fest, w: window.innerWidth, h: window.innerHeight };
}
function messeFormular(wurzel) {
  const root = (wurzel && document.querySelector(wurzel)) || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const alarme = [...document.querySelectorAll('[role="alert"], [role="status"]')].filter(vis).map((e) => ({ id: e.id || "", text: (e.innerText || "").trim(),
    imBild: e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().right <= window.innerWidth + 1, rolle: e.getAttribute("role") }));
  const felder = [...root.querySelectorAll("input, select, textarea")].filter(vis).map((e) => ({ id: e.id || "", beschreibt: e.getAttribute("aria-describedby") || "", ungueltig: e.getAttribute("aria-invalid") === "true" }));
  return { alarme, felder };
}

/* ---------------------------------------------------------------- Pruefungen je Ansicht */
async function pruefeAnsicht(pg, marke) {
  if (KRIT.includes("reflow") || KRIT.includes("ziele")) {
    const m = await pg.evaluate(messeSeite, ZIEL_MINDEST);
    if (KRIT.includes("reflow")) {
      const gesamt = Math.max(m.doc, m.body);
      if (!reflowOk(gesamt, m.fenster)) melde("reflow", `${marke}: Seite ${gesamt - m.fenster}px breiter als ${m.fenster}px (ragt: ${m.ragtOben.join(", ") || "-"})`);
      if (m.innen.length) hinweis("reflow-rollbereich", `${marke}: ${m.innen.length} Rollbereich(e) mit overflow-x (zulässig nur für Datentabellen): ${m.innen.slice(0, 3).join("; ")}`);
    }
    if (KRIT.includes("ziele")) {
      const ziele = await pg.evaluate(messeZiele);
      const z = zielgroessenBefunde(ziele, ZIEL_MINDEST);
      for (const x of z) melde("zielgroesse", `${marke}: ${x.id} ${Math.round(x.w)}x${Math.round(x.h)} px (< ${ZIEL_MINDEST}, ohne Abstandsausnahme)`);
      if (!z.length) beleg("zielgroesse", `${marke}: ${ziele.length} Ziele, alle >= ${ZIEL_MINDEST} px oder durch Abstand ausgenommen`);
    }
  }
  if (KRIT.includes("fokus")) {
    await pg.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    let n = 0, voll = 0, teil = 0; const bsp = [];
    for (let i = 0; i < TABS; i++) {
      await pg.keyboard.press("Tab"); await pg.waitForTimeout(90);
      const f = await pg.evaluate(messeFokus); if (!f) continue;
      n++;
      if (verdecktDurchFest(f.rect, f.fest, { w: f.w, h: f.h })) {
        voll++; const u = f.fest.find((q) => verdecktAnteil(f.rect, [q]) > 0.5);
        if (bsp.length < 5) bsp.push(`${f.n} unter ${u ? u.n : "festen Leisten"}`);
      } else if (verdecktAnteil(f.rect, f.fest) >= 0.5) teil++;
    }
    if (n < 3) hinweis("fokus", `${marke}: nur ${n} Tab-Stopps erreicht`);
    if (voll) melde("fokus-verdeckt", `${marke}: ${voll} von ${n} fokussierten Elementen ganz verdeckt (${bsp.join("; ")})`);
    else beleg("fokus", `${marke}: ${n} Tab-Stopps, keines ganz verdeckt${teil ? ` (${teil} zu mindestens der Hälfte, nur 2.4.12 AAA)` : ""}`);
  }
}

/* ---------------------------------------------------------------- Formulare (3.3.1) */
async function bewerteFormular(pg, marke, wurzel, erwartet) {
  const m = await pg.evaluate(messeFormular, wurzel);
  if (erwartet === "status") {                   // Stempel: Absage steht als Text in der Live-Region, kein Feld
    const t = m.alarme.filter((a) => /Stempel abgelehnt/.test(a.text));
    if (!t.length || !fehlertextOk(t.map((a) => a.text))) melde("fehlertext", `${marke}: Absage des Stempels nicht als sichtbarer Text in der Live-Region`);
    else if (t.some((a) => !a.imBild)) melde("fehlertext", `${marke}: Absagetext ragt aus dem Fenster`);
    else beleg("fehlertext", `${marke}: Absage als Text in der Live-Region ("${t[0].text.replace(/\s+/g, " ").slice(0, 60)}")`);
    return;
  }
  const r = fehlerAmFormular(m.alarme.filter((a) => a.rolle === "alert"), m.felder);
  if (r.art === "kein-text") melde("fehlertext", `${marke}: kein sichtbarer Fehlertext (role=alert) nach ungültiger Eingabe`);
  else if (r.art === "keine-kennung") melde("fehler-verbindung", `${marke}: Fehlermeldung ohne id, mit keinem Feld verbindbar`);
  else if (r.art === "nicht-verbunden") melde("fehler-verbindung", `${marke}: kein Feld verweist per aria-describedby auf die Meldung`);
  else beleg("fehlertext", `${marke}: Fehlertext sichtbar und per aria-describedby mit dem Feld verbunden`);
}
const knopf = (pg, re) => pg.getByRole("button", { name: re }).locator("visible=true").first();

async function formulareMitarbeiter(pg, marke) {
  /* Stempel: Absage */
  try {
    await geheZu(pg, "Heute");
    await pg.route("**/api/stempeln", (r) => r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, code: "TEST", fehler: "Testfall: Stempel abgelehnt (Wegwerfdaten)" }) }));
    await knopf(pg, /^Einstempeln$/).click();
    await pg.getByText(/^Stempel abgelehnt:/).first().waitFor({ state: "visible", timeout: 6000 });
    await bewerteFormular(pg, `${marke} Stempel (Absage)`, null, "status");
    const k = knopf(pg, /^Zur Kenntnis$/); if (await k.count()) await k.click();
    await pg.unroute("**/api/stempeln");
  } catch (x) { await pg.unroute("**/api/stempeln").catch(() => {}); nichtGeprueft(`${marke} Stempel (Absage): ${kurz(x)}`); }
  /* Krankmeldung: Ende vor Beginn */
  try {
    await geheZu(pg, "Anliegen");
    await knopf(pg, /^Krank melden$/).click();
    const dlg = pg.getByRole("dialog", { name: "Krankmeldung" }); await dlg.waitFor({ state: "visible", timeout: 5000 });
    const f = dlg.locator('input[type="date"]'); await f.nth(0).fill("2030-06-20"); await f.nth(1).fill("2030-06-10");
    await dlg.getByRole("button", { name: /^Krank melden$/ }).click(); await pg.waitForTimeout(500);
    await bewerteFormular(pg, `${marke} Krankmeldung`, '[role="dialog"]');
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  } catch (x) { nichtGeprueft(`${marke} Krankmeldung: ${kurz(x)}`); await pg.keyboard.press("Escape").catch(() => {}); }
  /* Antrag: Ende vor Beginn */
  try {
    await geheZu(pg, "Anliegen");
    await knopf(pg, /^Frei beantragen$/).click();
    const blatt = pg.locator(".m-blatt").first(); await blatt.waitFor({ state: "visible", timeout: 5000 });
    const f = blatt.locator('input[type="date"]'); await f.nth(0).fill("2030-07-20"); await f.nth(1).fill("2030-07-10");
    await pg.locator(".m-blatt button", { hasText: "Antrag stellen" }).first().click(); await pg.waitForTimeout(500);
    await bewerteFormular(pg, `${marke} Antrag`, ".m-blatt");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  } catch (x) { nichtGeprueft(`${marke} Antrag: ${kurz(x)}`); await pg.keyboard.press("Escape").catch(() => {}); }
  /* Korrektur: Stempel erfassen, Korrektur beantragen, zu kurzen Grund lassen */
  try {
    await geheZu(pg, "Heute");
    await knopf(pg, /^Einstempeln$/).click(); await pg.getByText("Eingestempelt").first().waitFor({ state: "visible", timeout: 20000 });
    const kb = knopf(pg, /^Korrektur beantragen$/); await kb.scrollIntoViewIfNeeded(); await kb.click();
    const grund = pg.locator('input[aria-label="Grund"]').first(); await grund.waitFor({ state: "visible", timeout: 4000 });
    await grund.fill("zu kurz");
    const senden = pg.getByRole("button", { name: /^Antrag stellen$/ }).locator("visible=true").first();
    const gesperrt = await senden.isDisabled();
    const hilfe = await pg.evaluate(() => [...document.querySelectorAll('[role="alert"], [aria-live]')].map((e) => (e.innerText || "").trim()).filter(Boolean).join(" | "));
    if (gesperrt && !/mindestens|Grund/i.test(hilfe)) hinweis("korrektur-ohne-text", `${marke} Korrektur: Eingabe ungültig (Grund unter 10 Zeichen), Schaltfläche deaktiviert, aber kein Fehlertext und keine Verbindung zum Feld (siehe docs/acc45/WP-40-BEFUNDE.md)`);
    else if (!gesperrt) hinweis("korrektur", `${marke} Korrektur: Schaltfläche trotz ungültigem Grund nicht deaktiviert`);
    else beleg("fehlertext", `${marke} Korrektur: ungültige Eingabe wird mit Text erklärt`);
  } catch (x) { nichtGeprueft(`${marke} Korrektur: ${kurz(x)}`); }
}
async function formulareRechner(pg, rolle, marke) {
  /* Krankmeldung: Person waehlen, Ende vor Beginn */
  try {
    const k = pg.locator(".tabbar button", { hasText: "Krank" }).first();
    if (!(await k.count())) throw new Error('keine Schaltfläche "Krank" in der Leiste unten');
    await k.click();
    const dlg = pg.getByRole("dialog", { name: "Krankmeldung" }); await dlg.waitFor({ state: "visible", timeout: 5000 });
    const sel = dlg.locator("select").first();
    if (await sel.count()) { const v = await sel.locator("option").evaluateAll((o) => (o.find((x) => x.value) || {}).value); if (v) await sel.selectOption(v); }
    const f = dlg.locator('input[type="date"]'); await f.nth(0).fill("2030-06-20"); await f.nth(1).fill("2030-06-10");
    await dlg.getByRole("button", { name: /^Krank melden$/ }).click(); await pg.waitForTimeout(500);
    await bewerteFormular(pg, `${marke} Krankmeldung`, '[role="dialog"]');
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  } catch (x) { nichtGeprueft(`${marke} Krankmeldung: ${kurz(x)}`); await pg.keyboard.press("Escape").catch(() => {}); }
  /* Person hinzufuegen: leer absenden */
  if (rolle === "planer" || rolle === "leitung") {
    try {
      if (!(await geheZu(pg, "Personal"))) throw new Error("Ansicht Personal nicht erreichbar");
      const b = knopf(pg, /^Person hinzufügen$/); await b.scrollIntoViewIfNeeded(); await b.click();
      const dlg = pg.getByRole("dialog", { name: "Person hinzufügen" }); await dlg.waitFor({ state: "visible", timeout: 5000 });
      await dlg.getByRole("button", { name: /^Hinzufügen$/ }).click(); await pg.waitForTimeout(400);
      await bewerteFormular(pg, `${marke} Person hinzufügen`, '[role="dialog"]');
      await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    } catch (x) { nichtGeprueft(`${marke} Person hinzufügen: ${kurz(x)}`); await pg.keyboard.press("Escape").catch(() => {}); }
  }
}

/* ---------------------------------------------------------------- Lauf */
let gemessen = 0;
for (const rolle of ROLLEN) {
  for (let bi = 0; bi < BREITEN.length; bi++) {
    const w = BREITEN[bi]; const marke = `${rolle}@${w}`;
    const code = rolle === "mitarbeiter" ? mitarbeiterCodes[bi] : codes[rolle];
    if (!code) { nichtGeprueft(`${marke}: kein Zugang`); continue; }
    let s = null;
    try {
      s = await anmelden(rolle, w, code);
      if (KRIT.some((k) => k !== "fehler")) {
        for (const a of ANSICHTEN[rolle]) {
          if (process.env.WCAG_ANSICHTEN && !a.includes(process.env.WCAG_ANSICHTEN)) continue;
          try {
            if (!(await geheZu(s.pg, a))) { nichtGeprueft(`${marke} ${a}: in der Navigation nicht erreichbar`); continue; }
            gemessen++; await pruefeAnsicht(s.pg, `${marke} ${a}`);
          } catch (x) { nichtGeprueft(`${marke} ${a}: ${kurz(x)}`); }
        }
      }
      if (KRIT.includes("fehler")) { if (rolle === "mitarbeiter") await formulareMitarbeiter(s.pg, marke); else await formulareRechner(s.pg, rolle, marke); }
    } catch (x) { nichtGeprueft(`${marke}: Anmeldung oder Lauf gescheitert: ${kurz(x)}`); }
    finally { if (s) await s.cx.close().catch(() => {}); }
  }
}

/* ---------------------------------------------------------------- Abschluss */
const zaehl = zaehleBefunde(befunde);
console.log(`\n${gemessen} Ansichten gemessen; Befunde: ${befunde.length} ${JSON.stringify(zaehl)}; Hinweise: ${hinweise.length}; nicht geprüft: ${offen.length}`);
if (process.env.WCAG_JSON) await writeFile(process.env.WCAG_JSON, JSON.stringify({ befunde, hinweise, belege, nichtGeprueft: offen, gemessen }, null, 1));
await ende(befunde.length ? 1 : 0);
