/* NODE_ENV=development: unter production verlangt der Server fuer Betreibercodes den zweiten Faktor; diese Probe meldet sich als Betreiber an. */
/* global document, window, getComputedStyle */
/* WP-21 Teil 2 (lokal, manuell, Wegwerfdaten): Bedienablaeufe statt Bildschirme.
   Fuehrt je Rolle und Viewport die Kernaufgaben tatsaechlich aus (tippen, ausfuellen, absenden) und meldet je Aufgabe
   bestanden oder nicht mit Zahlen: Taps, kleinstes getipptes Ziel, verdeckte oder nicht erreichbare Ziele, Seitenbreite,
   Ziele unter 24 px, Innenscroll-Bereiche, Hinweis "Fuer Tablet und Rechner ausgelegt".
   Viewports: die fuenf der Matrix (Hochformat, Tablet) und die drei Querformate der Telefone (740x360, 844x390, 932x430).
   Dazu eine Tastatur- und Vorlesesoftware-Probe (Fokus, Rollen, Namen, Escape) fuer Seitenleiste, Scrollbereiche und Blaetter.
   Der Server laeuft nur auf 127.0.0.1, mit Zufallsschluessel und frischem Datenordner; es gibt keine echten Personendaten
   (Demo-Bestand mit erfundenen Namen) und nie die Passwortdatei der Staging-Umgebung.
   Aufruf:  npx vite build ; node pruefungen/browser/geraete-wp21-ablaeufe.mjs
   Umgebung (optional): WP21_DIST=<Ordner mit dem Bauergebnis>  WP21_ROLLEN=mitarbeiter,planer  WP21_VIEWPORTS=360x740,740x360  WP21_AUFGABEN=stempeln,plan
                        WP21_JSON=<Pfad>  WP21_BILDER=<Ordner>  WP21_KANAL=msedge  WP21_SONDEN=0 (Tastaturprobe auslassen)
   Kein CI-Bestandteil. */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER, ZIEL_MINDEST } from "../../src/ui/geraete.js";
import { messeSeite } from "./geraete-messung.mjs";
import { personTag, demobestand } from "../../src/lib/fachlogik.js";
import { heute } from "../../src/lib/datum.js";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3222), BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-wp21-abl";
const ALLE_VP = [...GERAETE_VIEWPORTS, ...GERAETE_VIEWPORTS_QUER].map(({ w, h }) => ({ w, h }));
const VIEWPORTS = process.env.WP21_VIEWPORTS
  ? process.env.WP21_VIEWPORTS.split(",").map((s) => s.split("x").map(Number)).map(([w, h]) => ({ w, h })) : ALLE_VP;
const NUR_AUFGABEN = process.env.WP21_AUFGABEN ? process.env.WP21_AUFGABEN.split(",") : null;
const ROLLEN_ALLE = ["mitarbeiter", "subplaner", "planer", "leitung", "betriebsrat", "betreiber", "subplanerP", "planerP"];
const ROLLEN = (process.env.WP21_ROLLEN || ROLLEN_ALLE.join(",")).split(",").filter((r) => ROLLEN_ALLE.includes(r));
const addTage = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HEUTE = heute();

/* ---------------- Server ---------------- */
const daten = await mkdtemp(path.join(tmpdir(), "centric-wp21-abl-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: process.env.WP21_DIST || WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
let xz = 0;
const j = async (p, bd, t) => { const a = await fetch(BASE + p, { method: bd ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.1.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: bd ? JSON.stringify(bd) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* Server startet noch */ } await new Promise((r) => setTimeout(r, 200)); }

/* ---------------- Werkzeuge ---------------- */
const zeilen = [];
const kurzText = (x) => String(x && x.message ? x.message : x).split("\n")[0].replace(/\s+/g, " ").slice(0, 110);

/** Stand eines Zielelements nach dem Scrollen: Groesse, im Bild, nicht von einem anderen Element verdeckt. */
function zielStand(el) {
  const r = el.getBoundingClientRect(), fw = window.innerWidth, fh = window.innerHeight;
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), fw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), fh - 1);
  const oben = document.elementFromPoint(cx, cy);
  const bedeckt = !oben || !(oben === el || el.contains(oben) || oben.contains(el));
  const wer = oben ? (oben.tagName.toLowerCase() + (typeof oben.className === "string" && oben.className ? "." + oben.className.trim().split(/\s+/)[0] : "")) : "nichts";
  return { w: Math.round(r.width), h: Math.round(r.height), imBild: r.left >= -1 && r.right <= fw + 1 && r.top >= -1 && r.bottom <= fh + 1, bedeckt, wer };
}

class Lauf {
  constructor(pg, rolle, vp, schale) { Object.assign(this, { pg, rolle, vp, schale, dialoge: [] }); this.neu(); }
  neu() { this.taps = 0; this.hind = []; this.mess = []; this.klein = [Infinity, Infinity]; this.notiz = []; }
  /** Ein Ziel antippen: erreichbar (scrollbar, nicht verdeckt), mindestens 24 px, dann klicken. */
  async tippe(loc, name, opt = {}) {
    const el = loc.first();
    await el.waitFor({ state: "visible", timeout: opt.warte || 6000 });
    await el.scrollIntoViewIfNeeded();
    let g = await el.evaluate(zielStand);
    if (g.bedeckt || !g.imBild) { await el.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" })); g = await el.evaluate(zielStand); }
    if (g.bedeckt) this.hind.push(`${name}: verdeckt von ${g.wer}`);
    else if (!g.imBild && !opt.breitOk) this.hind.push(`${name}: nicht ganz im Bild (${g.w}x${g.h})`);
    if (g.w < ZIEL_MINDEST - 0.5 || g.h < ZIEL_MINDEST - 0.5) this.hind.push(`${name}: Ziel ${g.w}x${g.h} unter ${ZIEL_MINDEST} px`);
    this.klein = [Math.min(this.klein[0], g.w), Math.min(this.klein[1], g.h)];
    this.taps++;
    await el.click({ timeout: 5000 });
    return g;
  }
  async messe(was) { const m = await this.pg.evaluate(messeSeite, ZIEL_MINDEST); this.mess.push({ was, ...m }); return m; }
  async sicht(text, opt = {}) { await this.pg.getByText(text, { exact: false }).locator("visible=true").first().waitFor({ state: "visible", timeout: opt.warte || 7000 }); }
  /** Text sichtbar und im Bild (Fehlertexte muessen ohne Scrollen lesbar sein). */
  async textImBild(text, opt = {}) {
    const el = this.pg.getByText(text, { exact: false }).locator("visible=true").first();
    await el.waitFor({ state: "visible", timeout: opt.warte || 7000 });
    const g = await el.evaluate(zielStand);
    return { ...g, region: await el.evaluate((e) => !!e.closest('[role="status"], [role="alert"], [aria-live]')) };
  }
}

async function aufgabe(c, id, titel, fn, { hart = true } = {}) {
  if (NUR_AUFGABEN && !NUR_AUFGABEN.includes(id)) return;
  c.neu();
  const z = { rolle: c.rolle, vp: `${c.vp.w}x${c.vp.h}`, id, titel };
  try { await fn(c); z.ok = true; } catch (x) { z.ok = false; z.fehler = kurzText(x); if (process.env.WP21_BILDER) await c.pg.screenshot({ path: `${process.env.WP21_BILDER}/FEHL-${c.rolle}-${c.vp.w}x${c.vp.h}-${id}.png` }).catch(() => {}); }
  z.taps = c.taps; z.hind = c.hind.slice(0, 5); z.notiz = c.notiz.slice(0, 5);
  z.klein = Number.isFinite(c.klein[0]) ? `${c.klein[0]}x${c.klein[1]}` : "-";
  z.quer = c.mess.some((m) => m.doc > m.fenster || m.body > m.fenster);
  z.zuKlein = Math.max(0, ...c.mess.map((m) => m.zuKlein));
  z.innen = Math.max(0, ...c.mess.map((m) => m.innen.length));
  z.hinweisH = c.mess.some((m) => m.hinweis);
  z.zuKleinListe = c.mess.flatMap((m) => m.zuKleinListe).slice(0, 4);
  if (z.ok && (c.hind.length || z.quer || (hart && z.zuKlein > 0))) z.ok = false;
  zeilen.push(z);
}

async function tourZu(pg) {
  for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) { const t = pg.locator(zu).first(); if (await t.count()) await t.click().catch(() => {}); }
  await pg.waitForTimeout(250);
}
async function anmelden(b, vp, code, rolle) {
  const cx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, serviceWorkers: "block", hasTouch: vp.w < 1000, isMobile: false });
  const pg = await cx.newPage(); const fehler = [];
  pg.on("pageerror", (x) => fehler.push(kurzText(x)));
  await pg.goto(BASE + "/", { waitUntil: "load", timeout: 60000 }); await pg.locator("input").first().fill(code, { timeout: 30000 });
  await pg.getByRole("button", { name: /anmelden/i }).first().click();
  await pg.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 }).catch(() => {});
  await pg.waitForTimeout(700); await tourZu(pg);
  const c = new Lauf(pg, rolle, vp, rolle === "mitarbeiter" ? "mobil" : "rechner");
  pg.on("dialog", (d) => { c.dialoge.push(d.message().slice(0, 80)); d.accept().catch(() => {}); });
  c.cx = cx; c.fehler = fehler; return c;
}
/** Eine Aufgabe in frischer Sitzung: Anmeldung hoechstens dreimal versucht; scheitert sie, steht die Aufgabe als nicht bestanden da,
    der Lauf geht weiter (ein Haenger der Wegwerf-Oberflaeche beendet nicht die ganze Messung). */
async function frisch(b, vp, code, r, vi, id, titel, fn) {
  let c = null, letzter = null;
  for (let v = 0; v < 3 && !c; v++) { try { c = await anmelden(b, vp, code, r); } catch (x) { letzter = x; } }
  if (!c) { zeilen.push({ rolle: r, vp: `${vp.w}x${vp.h}`, id, titel, ok: false, fehler: "ANMELDUNG NICHT MOEGLICH: " + kurzText(letzter), taps: 0, hind: [], notiz: [], klein: "-" }); return; }
  c.vi = vi;
  try {
    await aufgabe(c, id, titel, fn);
    if (c.fehler.length) zeilen.push({ rolle: r, vp: `${vp.w}x${vp.h}`, id: "seitenfehler", titel: "Seitenfehler", ok: false, fehler: c.fehler.join("|"), taps: 0, hind: [], notiz: [], klein: "-" });
  } finally { await c.cx.close().catch(() => {}); }
}
/** Ansicht der Rechneransicht oeffnen: bis 1024 px ueber Menuetaste und Seitenleiste. */
async function geheZu(c, ansicht) {
  const { pg } = c;
  const m = pg.locator(".kopf-menue:visible").first();
  if (await m.count() && (await pg.locator(".seitenleiste.offen").count()) === 0) await c.tippe(m, "Menütaste");
  await pg.waitForTimeout(250);
  const l = pg.locator(".seitenleiste .slink").filter({ hasText: new RegExp("^\\s*" + ansicht.replace(/[()]/g, "\\$&") + "\\s*\\d*\\s*$") }).first();
  if (!(await l.count())) throw new Error(`Ansicht „${ansicht}“ fehlt in der Navigation dieser Rolle`);
  await c.tippe(l, `Navigation „${ansicht}“`);
  await pg.waitForTimeout(700);
}
const knopf = (pg, name) => pg.getByRole("button", { name }).locator("visible=true");

/* ---------------- Aufgaben ---------------- */
const MITARBEITER = {
  async stempeln(c) {
    const { pg } = c;
    await c.tippe(knopf(pg, /^Einstempeln$/), "Einstempeln");
    await c.sicht("Eingestempelt"); await c.messe("eingestempelt");
    await c.tippe(knopf(pg, /^Ausstempeln$/), "Ausstempeln");
    await c.sicht("Dienst erfasst"); await c.messe("ausgestempelt");
  },
  async stempelFehler(c) {
    const { pg } = c;
    await pg.route("**/api/stempeln", (r) => r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, code: "TEST", fehler: "Testfall: Stempel abgelehnt (Wegwerfdaten)" }) }));
    await c.tippe(knopf(pg, /^Einstempeln$/), "Einstempeln");
    const t = await c.textImBild(/^Stempel abgelehnt:/);
    c.notiz.push(`Fehlertext im Bild ${t.imBild ? "ja" : "NEIN"}, verdeckt ${t.bedeckt ? "JA" : "nein"}, Live-Region ${t.region ? "ja" : "NEIN"}`);
    if (!t.imBild) c.hind.push("Fehlertext nicht ganz im Bild");
    if (t.bedeckt) c.hind.push(`Fehlertext verdeckt von ${t.wer}`);
    if (!t.region) c.hind.push("Fehlertext ohne Live-Region (Vorlesesoftware meldet ihn nicht)");
    await c.sicht("Erneut senden"); await c.messe("abgelehnt");
    await c.tippe(knopf(pg, /^Zur Kenntnis$/), "Zur Kenntnis");
    await pg.waitForTimeout(500);
    if (await knopf(pg, /^Erneut senden$/).count()) throw new Error("abgelehnter Stempel bleibt nach „Zur Kenntnis“ stehen");
    await pg.unroute("**/api/stempeln");
  },
  async plan(c) {
    const { pg } = c;
    await c.tippe(pg.locator(".m-tabs button", { hasText: "Mein Plan" }), "Reiter Mein Plan");
    await pg.waitForTimeout(500);
    const filter = await pg.evaluate(() => { const row = document.querySelector("main .reiterreihe"); if (!row) return null;
      const fw = window.innerWidth; const bt = [...row.querySelectorAll("button")]; const r = row.getBoundingClientRect();
      return { n: bt.length, imBild: bt.filter((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= fw + 1; }).length, scroll: row.scrollWidth, breit: row.clientWidth, links: Math.round(r.left), rechts: Math.round(r.right) }; });
    if (filter) c.notiz.push(`Schnellfilter ${filter.imBild} von ${filter.n} ohne Wischen im Bild (${filter.scroll} in ${filter.breit} px)`);
    if (filter && filter.imBild < filter.n) c.hind.push(`Schnellfilter: nur ${filter.imBild} von ${filter.n} ohne Wischen erreichbar (${filter.scroll} in ${filter.breit} px)`);
    const tage = await pg.locator('main [role="button"]').filter({ hasText: /\d{2}:\d{2}\s*–\s*\d{2}:\d{2}/ }).count();
    c.notiz.push(`${tage} Dienste in der Liste`);
    if (tage < 1) throw new Error("keine Dienste in der Plan-Liste");
    await c.messe("plan");
    await c.tippe(pg.locator('main [role="button"]').filter({ hasText: /\d{2}:\d{2}\s*–\s*\d{2}:\d{2}/ }), "Tag öffnen");
    const blatt = pg.locator(".m-blatt").first(); await blatt.waitFor({ state: "visible", timeout: 4000 });
    const bl = await blatt.evaluate((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), fh: window.innerHeight, scroll: e.scrollHeight > e.clientHeight + 1 }; });
    c.notiz.push(`Blatt ${bl.h} von ${bl.fh} px Höhe${bl.scroll ? ", scrollt" : ""}`);
    await c.tippe(pg.locator(".m-blatt button", { hasText: "Tausch für diesen Tag suchen" }), "Tausch für diesen Tag suchen");
    await c.sicht("Tauschgesuch eingestellt", { warte: 4000 });
    await c.messe("tausch");
  },
  async antrag(c) {
    const { pg } = c;
    await c.tippe(pg.locator(".m-tabs button", { hasText: "Anliegen" }), "Reiter Anliegen");
    await c.tippe(knopf(pg, /^Frei beantragen$/), "Frei beantragen");
    const blatt = pg.locator(".m-blatt").first(); await blatt.waitFor({ state: "visible", timeout: 4000 });
    const tag = addTage(HEUTE, 20 + c.vp.w % 17 + Math.round(c.vp.h / 100));
    const felder = blatt.locator('input[type="date"]');
    await felder.nth(0).fill(tag); await felder.nth(1).fill(tag);
    await blatt.locator("input:not([type=date])").first().fill("Wegwerfdaten WP-21");
    await c.messe("antrag-blatt");
    await c.tippe(pg.locator(".m-blatt button", { hasText: "Antrag stellen" }), "Antrag stellen");
    await c.sicht("Antrag abgesendet", { warte: 4000 });
    await c.sicht("Meine Anträge");
    await c.messe("antrag-gestellt");
  },
  async antragFehler(c) {
    const { pg } = c;
    await c.tippe(pg.locator(".m-tabs button", { hasText: "Anliegen" }), "Reiter Anliegen");
    await c.tippe(knopf(pg, /^Frei beantragen$/), "Frei beantragen");
    const blatt = pg.locator(".m-blatt").first(); await blatt.waitFor({ state: "visible", timeout: 4000 });
    const felder = blatt.locator('input[type="date"]');
    await felder.nth(0).fill(addTage(HEUTE, 40)); await felder.nth(1).fill(addTage(HEUTE, 35));
    const vorher = await pg.evaluate(() => document.body.innerText.length);
    await c.tippe(pg.locator(".m-blatt button", { hasText: "Antrag stellen" }), "Antrag stellen (Ende vor Beginn)");
    await pg.waitForTimeout(600);
    const meldung = await pg.evaluate(() => /Ende|liegt vor|vor dem Beginn|ungültig/i.test([...document.querySelectorAll('[role="alert"], [role="status"], .m-blatt')].map((e) => e.textContent).join(" ")));
    const blattNoch = (await pg.locator(".m-blatt").count()) > 0;
    c.notiz.push(`Ende vor Beginn: Blatt ${blattNoch ? "bleibt offen" : "schließt"}, Fehlertext ${meldung ? "ja" : "NEIN"} (Seitenlänge ${vorher})`);
    if (!blattNoch || !meldung) throw new Error("Ende vor Beginn wird ohne Fehlertext angenommen");
    await pg.keyboard.press("Escape");
  },
  async krank(c) {
    const { pg } = c;
    await c.tippe(pg.locator(".m-tabs button", { hasText: "Anliegen" }), "Reiter Anliegen");
    await c.tippe(knopf(pg, /^Krank melden$/), "Krank melden (Anliegen)");
    const dlg = pg.getByRole("dialog", { name: "Krankmeldung" }); await dlg.waitFor({ state: "visible", timeout: 4000 });
    const tag = addTage(HEUTE, 3 + (c.vp.w % 11) + Math.round(c.vp.h / 200));
    const felder = dlg.locator('input[type="date"]'); await felder.nth(0).fill(tag); await felder.nth(1).fill(tag);
    await c.messe("krank-blatt");
    await c.tippe(dlg.getByRole("button", { name: /^Krank melden$/ }), "Krank melden (Blatt)");
    await c.sicht("Krankmeldung erfasst", { warte: 5000 });
    await c.tippe(dlg.getByRole("button", { name: /^Schließen$/ }), "Schließen");
  },
  async mehr(c) {
    const { pg } = c;
    await c.tippe(pg.locator(".m-tabs button", { hasText: "Mehr" }), "Reiter Mehr");
    await pg.waitForTimeout(400); await c.messe("mehr");
  },
};

/* Aufgaben der Rechneransicht (Planung, Leitung, Schichtverantwortung, Betriebsrat, Betreiber) */
async function tagOeffnen(c) {
  const { pg } = c;
  if (c.rolle === "subplaner") {
    /* Die Schichtverantwortung hat keinen Monatsplan (plan.view.all fehlt); den Tag oeffnet sie im Lagebild. */
    await geheZu(c, "Lagebild"); await c.messe("lagebild");
    await c.tippe(knopf(pg, /^Tag öffnen$/), "Tag öffnen");
  } else {
    await geheZu(c, "Monatsplan");
    await c.messe("monatsplan");
    const tag = pg.getByRole("button", { name: /^(Tag · |\d+\. )/ }).locator("visible=true");
    const n = await tag.count(); c.notiz.push(`${n} Tage bedienbar`);
    if (!n) throw new Error("kein Tag im Monatsplan bedienbar");
    /* der heutige Tag, sonst der erste */
    const heut = pg.getByRole("button", { name: /heute/ }).locator("visible=true");
    await c.tippe((await heut.count()) ? heut : tag, "Tag öffnen");
  }
  const dlg = pg.getByRole("dialog").first(); await dlg.waitFor({ state: "visible", timeout: 4000 });
  const st = await dlg.evaluate((e) => { const r = e.getBoundingClientRect(); const back = e.closest(".sheet-back"); return { h: Math.round(r.height), fh: window.innerHeight, rollt: !!back && back.scrollHeight > back.clientHeight + 1, imFenster: r.left >= -1 && r.right <= window.innerWidth + 1 }; });
  c.notiz.push(`Tagesblatt ${st.h} von ${st.fh} px${st.rollt ? ", scrollt" : ""}`);
  if (!st.imFenster) c.hind.push("Tagesblatt ragt seitlich aus dem Fenster");
  await c.messe("tag-offen");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
  if (await pg.getByRole("dialog").count()) throw new Error("Tagesblatt lässt sich nicht mit Escape schließen");
}
async function planFreigeben(c) {
  const { pg } = c;
  await geheZu(c, "Monatsplan");
  await pg.waitForTimeout(500);
  if (!(await knopf(pg, /^(Plan freigeben|Erneut freigeben)$/).count()))
    throw new Error("NICHT AUSFÜHRBAR: die Schaltfläche „Plan freigeben“ wird dieser Rolle nicht angeboten (Recht plan.publish steht in keiner Rolle der Rechtematrix)");
  await c.tippe(knopf(pg, /^(Plan freigeben|Erneut freigeben)$/), "Plan freigeben");
  await pg.waitForTimeout(600);
  if (c.dialoge.length) c.notiz.push(`Rückfrage: ${c.dialoge[c.dialoge.length - 1]}`);
  await c.sicht("Freigegeben"); await c.messe("freigegeben");
}
async function antragEntscheiden(c) {
  const { pg } = c;
  await geheZu(c, "Anträge"); await c.messe("antraege");
  const gen = knopf(pg, /^(Genehmigen|Mitzeichnen)$/);
  const n = await gen.count(); c.notiz.push(`${n} offene Anträge entscheidbar`);
  if (!n) throw new Error("keine entscheidbaren Anträge vorhanden (Demo)");
  await c.tippe(gen, "Genehmigen");
  await c.sicht("Antrag genehmigt", { warte: 4000 }).catch(() => c.sicht("Mitgezeichnet", { warte: 2000 }));
  await c.tippe(knopf(pg, /^Ablehnen$/), "Ablehnen").then(() => c.sicht("Antrag abgelehnt", { warte: 4000 })).catch(() => c.notiz.push("kein zweiter Antrag zum Ablehnen"));
  await c.messe("entschieden");
}
async function uebergabe(c) {
  const { pg } = c;
  await geheZu(c, "Übergabe"); await c.messe("uebergabe");
  await pg.locator("main input[type=date]").first().fill(addTage(HEUTE, -1 - (c.vi || 0))); await pg.waitForTimeout(400);
  const feld = pg.locator("main textarea:not([disabled])").first();
  await feld.waitFor({ state: "visible", timeout: 4000 }).catch(() => { throw new Error("keine offene Übergabe zum Ausfüllen"); });
  await feld.fill("Wegwerfdaten WP-21: Lage ruhig.");
  await c.tippe(knopf(pg, /^Übergabe abschließen$/), "Übergabe abschließen");
  await c.sicht("erfasst", { warte: 5000 }); await c.messe("uebergabe-erfasst");
}
async function krankPlanung(c) {
  const { pg } = c;
  await c.tippe(pg.locator(".tabbar button", { hasText: "Krank" }), "Krank (Leiste unten)");
  const dlg = pg.getByRole("dialog", { name: "Krankmeldung" }); await dlg.waitFor({ state: "visible", timeout: 4000 });
  const tag = addTage(HEUTE, 4 + (c.vp.w % 13) + Math.round(c.vp.h / 150));
  const felder = dlg.locator('input[type="date"]'); await felder.nth(0).fill(tag); await felder.nth(1).fill(tag);
  await c.messe("krank-blatt");
  await c.tippe(dlg.getByRole("button", { name: /^Krank melden$/ }), "Krank melden (Blatt)");
  await dlg.getByText(/Krankmeldung erfasst|Lücke \d+ von/).first().waitFor({ state: "visible", timeout: 5000 });
  for (let i = 0; i < 6 && !(await dlg.getByText("Krankmeldung erfasst").count()); i++) {
    const w = dlg.getByRole("button", { name: /^(Fertig|Überspringen)/ }).locator("visible=true");
    if (!(await w.count())) break; await c.tippe(w, "Lücke überspringen");
  }
  await c.sicht("Krankmeldung erfasst", { warte: 4000 });
  await c.tippe(dlg.getByRole("button", { name: /^Schließen$/ }), "Schließen");
}
async function tauschboerse(c) {
  const { pg } = c;
  await geheZu(c, "Tauschbörse"); await c.messe("boerse");
  const ue = knopf(pg, /^Ich übernehme$/);
  if (await ue.count()) { await c.tippe(ue, "Ich übernehme"); await pg.waitForTimeout(500); c.notiz.push("Gesuch übernommen"); }
  else c.notiz.push("keine fremden Gesuche in der Liste");
  await c.tippe(knopf(pg, /^Gesuch einstellen$/), "Gesuch einstellen");
  const dlg = pg.getByRole("dialog").first(); await dlg.waitFor({ state: "visible", timeout: 4000 });
  await c.messe("gesuch-blatt");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
}
const lesen = (name, optional) => async (c) => { await geheZu(c, name); await c.pg.waitForTimeout(300); await c.messe(name); if (optional) await optional(c); };

const AUFG = {
  subplaner: [["schichten", "Meine Schichten", lesen("Meine Schichten")], ["lage", "Lagebild lesen", lesen("Lagebild")], ["antraege", "Anträge entscheiden", antragEntscheiden],
    ["tagoeffnen", "Tag öffnen", tagOeffnen], ["krank", "Krankmeldung (Leiste unten)", krankPlanung], ["boerse", "Tauschbörse", tauschboerse]],
  planer: [["tagoeffnen", "Tag öffnen", tagOeffnen], ["antraege", "Anträge entscheiden", antragEntscheiden],
    ["krank", "Krankmeldung (Leiste unten)", krankPlanung], ["boerse", "Tauschbörse lesen", lesen("Tauschbörse")],
    ["pruefung", "Prüfung lesen", lesen("Prüfung")], ["einsatz", "Personaleinsatz lesen", lesen("Personaleinsatz")], ["personal", "Personal lesen", lesen("Personal")]],
  leitung: [["freigeben", "Plan freigeben", planFreigeben], ["antraege", "Anträge entscheiden", antragEntscheiden], ["tagoeffnen", "Tag öffnen", tagOeffnen],
    ["krank", "Krankmeldung (Leiste unten)", krankPlanung], ["boerse", "Tauschbörse lesen", lesen("Tauschbörse")],
    ["abrechnung", "Abrechnungsdaten lesen", lesen("Abrechnungsdaten")],
    ["betrieb", "Betrieb: Rollen und Rechte", lesen("Betrieb", async (c) => {
      const r = c.pg.getByText("Rollen und Rechte").locator("visible=true").first();
      if (await r.count()) { await r.scrollIntoViewIfNeeded(); c.notiz.push("Rollen und Rechte erreichbar"); await c.messe("rollen-und-rechte"); } else c.notiz.push("Abschnitt Rollen und Rechte nicht gefunden"); })]],
  betriebsrat: [["tagoeffnen", "Monatsplan lesen, Tag öffnen", tagOeffnen], ["pruefung", "Prüfung lesen", lesen("Prüfung")],
    ["auswertung", "Auswertung (Betriebsrat) lesen", lesen("Auswertung (Betriebsrat)")], ["hilfe", "Hilfe lesen", lesen("Hilfe")]],
  /* Pflege (Seniorenzentrum Lindenhof): dort ist das Paket Übergabe gebucht; Nordwacht (Sicherheit) hat keine Übergabe. */
  subplanerP: [["uebergabe", "Schichtübergabe (Pflege)", uebergabe]],
  planerP: [["uebergabe", "Schichtübergabe (Pflege)", uebergabe]],
  betreiber: [["mandanten", "Mandanten ansehen", async (c) => { await geheZu(c, "Mandanten"); await c.messe("liste");
      const z = c.pg.locator("main").getByRole("button").filter({ hasText: /Demo|WP|Betrieb|Mandant|Öffnen|Details/i }).locator("visible=true"); if (await z.count()) { await c.tippe(z, "Mandant öffnen"); await c.pg.waitForTimeout(700); await c.messe("detail"); } else c.notiz.push("kein Mandant zum Öffnen"); }],
    ["rechnungen", "Rechnungen ansehen", lesen("Rechnungen")], ["tarife", "Tarife ansehen", lesen("Tarife")]],
};
const AUFG_MITARBEITER = [["stempeln", "Stempeln (Einstempeln, Ausstempeln)", MITARBEITER.stempeln], ["stempelFehler", "Stempeln: Fehlertext bei Absage", MITARBEITER.stempelFehler],
  ["plan", "Eigenen Plan sehen, Tausch suchen", MITARBEITER.plan], ["antrag", "Abwesenheit beantragen", MITARBEITER.antrag], ["antragFehler", "Antrag mit Ende vor Beginn", MITARBEITER.antragFehler],
  ["krank", "Krankmeldung", MITARBEITER.krank], ["mehr", "Mehr: Konto", MITARBEITER.mehr]];

/* ---------------- Tastatur- und Vorlesesoftware-Probe ---------------- */
const sonden = [];
const sonde = (vp, name, ok, info) => sonden.push({ vp, name, ok, info });
async function tastaturProbe(b, code, vp) {
  const c = await anmelden(b, vp, code, "planer"); const { pg } = c; const V = `${vp.w}x${vp.h}`;
  /* Seitenleiste: zu = nicht fokussierbar; auf = Fokus hinein; Escape = Fokus zurueck auf die Menuetaste; aria */
  const menue = pg.locator(".kopf-menue:visible").first();
  if (await menue.count()) {
    const attr = await menue.evaluate((e) => ({ exp: e.getAttribute("aria-expanded"), ctl: e.getAttribute("aria-controls"), label: e.getAttribute("aria-label") }));
    sonde(V, "Menütaste: aria-expanded=false, aria-controls", attr.exp === "false" && !!attr.ctl, `expanded=${attr.exp}, controls=${attr.ctl}`);
    await menue.focus();
    for (let i = 0; i < 4; i++) await pg.keyboard.press("Tab");
    const imZu = await pg.evaluate(() => !!document.activeElement && !!document.activeElement.closest(".seitenleiste"));
    sonde(V, "geschlossen: Tab erreicht keine Eintraege der Seitenleiste", !imZu, imZu ? "Fokus liegt in der geschlossenen Seitenleiste" : "ok");
    await menue.focus(); await pg.keyboard.press("Enter"); await pg.waitForTimeout(400);
    const imAuf = await pg.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest(".seitenleiste"); });
    sonde(V, "geöffnet: Fokus liegt in der Seitenleiste", imAuf, imAuf ? "ok" : `Fokus auf ${await pg.evaluate(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + "." + (a.className || "") : "-"; })}`);
    const rolle = await pg.evaluate(() => { const a = document.querySelector("aside.seitenleiste"); return { label: a && a.getAttribute("aria-label"), expanded: document.querySelector(".kopf-menue") && document.querySelector(".kopf-menue").getAttribute("aria-expanded") }; });
    sonde(V, "geöffnet: Seitenleiste benannt, aria-expanded=true", rolle.label === "Hauptnavigation" && rolle.expanded === "true", JSON.stringify(rolle));
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
    const zu = (await pg.locator(".seitenleiste.offen").count()) === 0;
    const zurueck = await menue.evaluate((e) => document.activeElement === e);
    sonde(V, "Escape schließt die Seitenleiste", zu, zu ? "ok" : "bleibt offen");
    sonde(V, "Escape: Fokus kehrt zur Menütaste zurück", zurueck, zurueck ? "ok" : `Fokus auf ${await pg.evaluate(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + "." + (a.className || "") : "-"; })}`);
  }
  /* Scrollbereich (Personaleinsatz, bei Ueberstand): Region mit Namen, Tabstopp, Pfeiltaste scrollt, Fokusrahmen sichtbar */
  await geheZu(c, "Personaleinsatz"); await pg.waitForTimeout(500);
  const sb = pg.locator(".scrollbereich[role=region]").first();
  if (await sb.count()) {
    const a = await sb.evaluate((e) => ({ name: e.getAttribute("aria-label"), tab: e.tabIndex }));
    sonde(V, "Scrollbereich: Region mit Namen und Tabstopp", !!a.name && a.tab === 0, `name=${a.name}, tabindex=${a.tab}`);
    await sb.focus(); await pg.keyboard.press("Tab"); await pg.keyboard.press("Shift+Tab");
    const st = await sb.evaluate((e) => { const cs = getComputedStyle(e); return { fokus: document.activeElement === e, rahmen: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2, links: e.scrollLeft }; });
    await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowRight"); await pg.waitForTimeout(250);
    const nach = await sb.evaluate((e) => e.scrollLeft);
    sonde(V, "Scrollbereich: fokussierbar, Fokusrahmen >= 2 px", st.fokus && st.rahmen, JSON.stringify(st));
    sonde(V, "Scrollbereich: Pfeiltaste scrollt", nach > st.links, `scrollLeft ${st.links} -> ${nach}`);
    const hinweis = await pg.locator(".scrollhinweis:visible").count();
    sonde(V, "Scrollbereich: sichtbarer Hinweis (bis 1024 px)", vp.w <= 1024 ? hinweis > 0 : hinweis === 0, `${hinweis} sichtbar`);
  } else sonde(V, "Scrollbereich: Personaleinsatz ragt nicht über", true, "kein Scrollbereich nötig");
  /* Tagesblatt: Rolle dialog, aria-modal, Name, Escape, Fokus zurueck */
  await geheZu(c, "Monatsplan");
  const tag = pg.getByRole("button", { name: /^(Tag · |\d+\. )/ }).locator("visible=true").first();
  if (await tag.count()) {
    await tag.focus(); await pg.keyboard.press("Enter"); await pg.waitForTimeout(500);
    const d = await pg.evaluate(() => { const e = document.querySelector('[role="dialog"]'); return e ? { modal: e.getAttribute("aria-modal"), name: e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"), innen: e.contains(document.activeElement) } : null; });
    sonde(V, "Tagesblatt: dialog, aria-modal, Name, Fokus darin", !!d && d.modal === "true" && !!d.name && d.innen, JSON.stringify(d));
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
    const zurueck = await pg.evaluate(() => !document.querySelector('[role="dialog"]'));
    sonde(V, "Tagesblatt: Escape schließt", zurueck, zurueck ? "ok" : "bleibt offen");
  }
  await c.cx.close();
}
async function tastaturProbeMobil(b, code, vp) {
  const c = await anmelden(b, vp, code, "mitarbeiter"); const { pg } = c; const V = `${vp.w}x${vp.h}`;
  const nav = await pg.evaluate(() => { const n = document.querySelector("nav.m-tabs"); return n ? { label: n.getAttribute("aria-label"), aktuell: n.querySelectorAll('[aria-current="page"]').length } : null; });
  sonde(V, "Telefon: Reiterleiste benannt, ein Reiter aria-current", !!nav && !!nav.label && nav.aktuell === 1, JSON.stringify(nav));
  await pg.locator(".m-tabs button", { hasText: "Anliegen" }).click(); await pg.waitForTimeout(300);
  await pg.getByRole("button", { name: /^Frei beantragen$/ }).locator("visible=true").first().focus(); await pg.keyboard.press("Enter"); await pg.waitForTimeout(400);
  const d = await pg.evaluate(() => { const e = document.querySelector('.m-blattrahmen[role="dialog"]'); return e ? { modal: e.getAttribute("aria-modal"), name: e.getAttribute("aria-label"), innen: e.contains(document.activeElement) } : null; });
  sonde(V, "Telefon-Blatt: dialog, aria-modal, Name, Fokus darin", !!d && d.modal === "true" && !!d.name && d.innen, JSON.stringify(d));
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
  const zu = (await pg.locator(".m-blattrahmen").count()) === 0;
  const zurueck = await pg.evaluate(() => !!document.activeElement && document.activeElement.textContent.trim() === "Frei beantragen");
  sonde(V, "Telefon-Blatt: Escape schließt, Fokus zurück auf den Auslöser", zu && zurueck, `geschlossen=${zu}, Fokus zurück=${zurueck}`);
  /* Meldungen: Live-Region muss vor dem Text im Dokument stehen */
  const live = await pg.evaluate(() => document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').length);
  sonde(V, "Telefon: Live-Region für Meldungen vorhanden (vor der Meldung)", live > 0, `${live} Live-Regionen im Ruhezustand`);
  await c.cx.close();
}

/* ---------------- Ablauf ---------------- */
let b = null;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const codes = { betreiber: e.d.zugangscode };
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  b = await chromium.launch(process.env.WP21_KANAL ? { channel: process.env.WP21_KANAL } : {});
  /* Demo-Bestand (erfundene Namen) lokal erzeugen und dem Wegwerf-Server geben; so ist bekannt, wer heute Dienst hat
     (die Betreibersicht enthaelt keinen Dienstplan), und ein bestehender Betrieb nimmt vom Betreiber nur einmal
     (hoechstens 20) Zugaenge an. */
  const demo = demobestand();
  const an = await j("/api/bestand-anlegen", { bestand: null, inhalt: demo, vorlage: "demo" }, bt);
  if (an.s >= 300) throw new Error("Demo-Bestand nicht angelegt: " + an.s + " " + JSON.stringify(an.d).slice(0, 160));
  const mm = demo.mandanten[0];
  const personen = mm.personen || [];
  const aktiv = (x) => x.status !== "inaktiv";
  const vonRolle = (r) => personen.find((x) => x.rolle === r && aktiv(x) && (r !== "mitarbeiter" || x.imSchichtdienst !== false));
  const mitDienst = personen.filter((x) => x.rolle === "mitarbeiter" && aktiv(x) && x.imSchichtdienst !== false && (() => { try { return !!personTag(mm, x, HEUTE).dienstId; } catch { return false; } })());
  const ZUG = {}; const wunsch = [];
  for (const r of ROLLEN.filter((x) => !["mitarbeiter", "betreiber", "subplanerP", "planerP"].includes(x))) { const p = vonRolle(r); if (p) wunsch.push({ tag: r, rolle: r, personId: p.id, name: "WP21 " + r }); }
  const pflege = (demo.mandanten[1] || {}).personen || [];
  for (const [tag, rolle] of [["subplanerP", "subplaner"], ["planerP", "planer"]]) { const p = pflege.find((x) => x.rolle === rolle && aktiv(x) && x.imSchichtdienst !== false) || pflege.find((x) => x.rolle === rolle && aktiv(x));
    if (ROLLEN.includes(tag) && p) wunsch.push({ tag, rolle, personId: p.id, name: "WP21 " + tag }); }
  if (ROLLEN.includes("mitarbeiter")) {
    /* Stempeln mit Erfolg verbraucht den Tag der Person: je Viewport eine eigene Person. Die Absage erreicht den Server nie
       und die uebrigen Aufgaben legen Anfragen mit je Viewport eigenen Tagen an: dafuer genuegt je eine Person. */
    VIEWPORTS.forEach((_, i) => { if (mitDienst[i]) wunsch.push({ tag: "ok" + i, rolle: "mitarbeiter", personId: mitDienst[i].id, name: "WP21 ok" + i }); });
    const rest = mitDienst.slice(VIEWPORTS.length);
    if (rest[0]) wunsch.push({ tag: "fehl", rolle: "mitarbeiter", personId: rest[0].id, name: "WP21 fehl" });
    if (rest[1]) wunsch.push({ tag: "sonst", rolle: "mitarbeiter", personId: rest[1].id, name: "WP21 sonst" });
  }
  const z1 = await j("/api/zugaenge", { bestand: RAUM, eintraege: wunsch.map(({ rolle, personId, name }) => ({ rolle, personId, name })) }, bt);
  if (!z1.d.zugaenge) throw new Error("Zugänge nicht angelegt: " + z1.s + " " + JSON.stringify(z1.d).slice(0, 200));
  wunsch.forEach((x, i) => { ZUG[x.tag] = z1.d.zugaenge[i].code; });
  console.log(`Demo-Betrieb: ${personen.length} erfundene Personen, ${mitDienst.length} Beschäftigte mit Dienst heute (${HEUTE}); Zugänge: ${Object.keys(ZUG).length}`);

  for (const [vi, vp] of VIEWPORTS.entries()) {
    for (const r of ROLLEN) {
      const liste = r === "mitarbeiter" ? AUFG_MITARBEITER : AUFG[r];
      if (!liste) continue;
      if (r === "mitarbeiter") {
        for (const [id, titel, fn] of liste) {
          const tag = id === "stempeln" ? `ok${vi}` : id === "stempelFehler" ? "fehl" : "sonst";
          if (!ZUG[tag]) { zeilen.push({ rolle: r, vp: `${vp.w}x${vp.h}`, id, titel, ok: false, fehler: "KEIN ZUGANG (zu wenige Beschäftigte mit Dienst heute im Demo-Bestand)", taps: 0, hind: [], notiz: [], klein: "-" }); continue; }
          if (NUR_AUFGABEN && !NUR_AUFGABEN.includes(id)) continue;
          await frisch(b, vp, ZUG[tag], r, vi, id, titel, fn);
        }
        continue;
      }
      const code = r === "betreiber" ? codes.betreiber : ZUG[r];
      if (!code) { zeilen.push({ rolle: r, vp: `${vp.w}x${vp.h}`, id: "zugang", titel: "-", ok: false, fehler: "KEIN ZUGANG (Rolle im Demo-Bestand nicht vorhanden)", taps: 0, hind: [], notiz: [], klein: "-" }); continue; }
      /* je Aufgabe eine frische Sitzung: ein Fehler in einer Aufgabe verfaelscht die naechste nicht */
      for (const [id, titel, fn] of liste) {
        if (NUR_AUFGABEN && !NUR_AUFGABEN.includes(id)) continue;
        await frisch(b, vp, code, r, vi, id, titel, fn);
      }
    }
  }
  if (process.env.WP21_SONDEN !== "0" && ZUG.planer) {
    for (const vp of [{ w: 390, h: 844 }, { w: 1024, h: 768 }]) await tastaturProbe(b, ZUG.planer, vp);
    if (ZUG.sonst) await tastaturProbeMobil(b, ZUG.sonst, { w: 390, h: 844 });
  }
} catch (x) { console.log("FEHLER", x && x.message); process.exitCode = 1; }
finally { if (b) await b.close(); srv.kill(); }

/* ---------------- Auswertung ---------------- */
let schlecht = 0;
for (const z of zeilen) {
  const kopf = z.ok ? "OK  " : "FEHL";
  if (!z.ok) schlecht++;
  console.log(`${kopf} ${z.rolle} ${z.vp} ${z.titel}: ${z.fehler ? z.fehler + "; " : ""}Taps ${z.taps}; kleinstes getipptes Ziel ${z.klein}; Seite quer ${z.quer ? "JA" : "nein"}; Ziele<24 ${z.zuKlein ?? 0}; Innenscroll ${z.innen ?? 0}${z.hinweisH ? "; HINWEIS Tablet/Rechner" : ""}`
    + ((z.hind && z.hind.length) ? `; Hindernisse: ${z.hind.join(" | ")}` : "") + ((z.zuKleinListe && z.zuKleinListe.length) ? `; klein: ${z.zuKleinListe.join(",")}` : "")
    + ((z.notiz && z.notiz.length) ? `; ${z.notiz.join("; ")}` : ""));
}
console.log(`\nAufgaben: ${zeilen.length - schlecht} von ${zeilen.length} bestanden`);
const je = {}; for (const z of zeilen) { const k = `${z.rolle}|${z.id}`; (je[k] = je[k] || { ok: 0, n: 0 }); je[k].n++; if (z.ok) je[k].ok++; }
for (const [k, v] of Object.entries(je)) console.log(`  ${k}: ${v.ok}/${v.n}`);
if (sonden.length) {
  console.log("\nTastatur- und Vorlesesoftware-Probe");
  for (const s of sonden) console.log(`${s.ok ? "OK  " : "FEHL"} ${s.vp} ${s.name}: ${s.info}`);
  console.log(`Sonden: ${sonden.filter((s) => s.ok).length} von ${sonden.length} bestanden`);
}
if (process.env.WP21_JSON) await writeFile(process.env.WP21_JSON, JSON.stringify({ zeilen, sonden }, null, 1));
process.exit(schlecht || sonden.some((s) => !s.ok) ? 1 : 0);
