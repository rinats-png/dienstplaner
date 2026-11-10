/* NODE_ENV=development: unter production verlangt der Server fuer Betreibercodes den zweiten Faktor; diese Probe meldet sich als Betreiber an. */
/* global document, window, getComputedStyle */
/* WP-21 Geraetematrix (lokal, manuell, Wegwerfdaten): misst je Rolle, Kernaufgabe und Viewport
     1. Seite ohne Querscrollen (documentElement/body.scrollWidth <= innerWidth) und Zahl der Innenscroll-Bereiche,
     2. Zielgroesse interaktiver Elemente >= 24 x 24 CSS-px (WCAG 2.5.8; Ausnahme "Abstand": ein kleines Ziel gilt als
        erfuellt, wenn sein 24-px-Kreis kein anderes Ziel beruehrt),
     3. Hauptnavigation erreichbar (Telefonansicht: Leiste unten; Rechneransicht: Menuetaste -> Seitenleiste, Leiste unten).
   Der Server laeuft nur auf 127.0.0.1, mit Zufallsschluessel und frischem Datenordner; es gibt keine echten Personendaten
   (Demo-Bestand mit erfundenen Namen) und nie die Passwortdatei der Staging-Umgebung.
   Aufruf:  npx vite build ; node pruefungen/browser/geraete-wp21.mjs
   Umgebung (optional): WP21_ROLLEN=mitarbeiter,planer  WP21_VIEWPORTS=360x740,390x844  WP21_JSON=<Pfad>  WP21_BILDER=<Ordner>  WP21_KANAL=msedge
   Browser: gebuendeltes Playwright-Chromium (playwright-core); mit WP21_KANAL=msedge der installierte Edge. Kein CI-Bestandteil. */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GERAETE_VIEWPORTS, ZIEL_MINDEST } from "../../src/ui/geraete.js";
import { messeSeite } from "./geraete-messung.mjs";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3221), BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-wp21";
const VIEWPORTS = process.env.WP21_VIEWPORTS
  ? process.env.WP21_VIEWPORTS.split(",").map((s) => s.split("x").map(Number)).map(([w, h]) => ({ w, h }))
  : GERAETE_VIEWPORTS.map(({ w, h }) => ({ w, h }));
/* Kernaufgaben je Rolle. Telefonansicht (Beschaeftigte im Schichtdienst): Reiter unten; sonst Ansicht ueber die Navigation. */
const AUFGABEN = {
  mitarbeiter: { schale: "mobil", aufgaben: [
    ["Heute: stempeln", { tab: "Heute", sieht: /Stempel|Schicht|Heute|Dienst/i }],
    ["Mein Plan", { tab: "Mein Plan" }],
    ["Anliegen: Abwesenheit, Tausch, Wunsch", { tab: "Anliegen" }],
    ["Antrag stellen (Blatt)", { tab: "Anliegen", knopf: /Frei beantragen/ }],
    ["Mehr: Konto, Einstellungen", { tab: "Mehr" }] ] },
  subplaner: { schale: "rechner", aufgaben: [
    ["Meine Schichten", { ansicht: "Meine Schichten" }], ["Lagebild", { ansicht: "Lagebild" }],
    ["Anträge entscheiden", { ansicht: "Anträge" }], ["Personaleinsatz lesen", { ansicht: "Personaleinsatz" }],
    ["Tauschbörse", { ansicht: "Tauschbörse" }] ] },
  planer: { schale: "rechner", aufgaben: [
    ["Monatsplan (planen, freigeben)", { ansicht: "Monatsplan" }], ["Personaleinsatz", { ansicht: "Personaleinsatz" }],
    ["Anträge", { ansicht: "Anträge" }], ["Prüfung", { ansicht: "Prüfung" }], ["Personal", { ansicht: "Personal" }] ] },
  leitung: { schale: "rechner", aufgaben: [
    ["Monatsplan (planen, freigeben)", { ansicht: "Monatsplan" }], ["Anträge", { ansicht: "Anträge" }],
    ["Personal", { ansicht: "Personal" }], ["Abrechnungsdaten", { ansicht: "Abrechnungsdaten" }],
    ["Betrieb", { ansicht: "Betrieb" }] ] },
  betriebsrat: { schale: "rechner", aufgaben: [
    ["Monatsplan lesen", { ansicht: "Monatsplan" }], ["Prüfung", { ansicht: "Prüfung" }],
    ["Auswertung (Betriebsrat)", { ansicht: "Auswertung (Betriebsrat)" }], ["Hilfe", { ansicht: "Hilfe" }] ] },
  betreiber: { schale: "rechner", aufgaben: [
    ["Mandanten", { ansicht: "Mandanten" }], ["Rechnungen", { ansicht: "Rechnungen" }], ["Tarife", { ansicht: "Tarife" }] ] },
};
const ROLLEN = (process.env.WP21_ROLLEN || Object.keys(AUFGABEN).join(",")).split(",").filter((r) => AUFGABEN[r]);

/* ---------------- Server und Daten ---------------- */
const daten = await mkdtemp(path.join(tmpdir(), "centric-wp21-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
let xz = 0;
const j = async (p, bd, t) => { const a = await fetch(BASE + p, { method: bd ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: bd ? JSON.stringify(bd) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* Server startet noch */ } await new Promise((r) => setTimeout(r, 200)); }

const zeilen = [];
let b = null;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const codes = { betreiber: e.d.zugangscode };
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  b = await chromium.launch(process.env.WP21_KANAL ? { channel: process.env.WP21_KANAL } : {});
  { const cx = await b.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block" }); const pg = await cx.newPage();
    await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(codes.betreiber);
    await pg.getByRole("button", { name: /anmelden/i }).first().click();
    await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 15000 });
    await pg.waitForTimeout(4000); await cx.close(); }
  const mm = (((await j("/api/bestand", null, bt)).d.bestand || {}).mandanten || [])[0] || {};
  const personen = mm.personen || [];
  const vonRolle = (r) => personen.find((x) => x.rolle === r && x.status !== "inaktiv" && (r !== "mitarbeiter" || x.imSchichtdienst !== false));
  const eintr = []; const wer = {};
  for (const r of ROLLEN) if (r !== "betreiber") { const p = vonRolle(r); if (p) { wer[r] = p; eintr.push({ rolle: r, personId: p.id, name: "WP21 " + r }); } }
  if (eintr.length) { const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege: eintr }, bt); eintr.forEach((x, i) => { codes[x.rolle] = zz.d.zugaenge[i].code; }); }
  console.log(`Demo-Betrieb: ${personen.length} erfundene Personen; Rollen mit Zugang: ${Object.keys(codes).join(", ")}`);

  for (const r of ROLLEN) {
    if (!codes[r]) { zeilen.push({ rolle: r, aufgabe: "-", vp: "-", status: "KEIN ZUGANG (Rolle im Demo-Betrieb nicht vorhanden)" }); continue; }
    for (const vp of VIEWPORTS) {
      const cx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, serviceWorkers: "block", hasTouch: vp.w < 1000, isMobile: false });
      const pg = await cx.newPage(); const fehler = [];
      pg.on("pageerror", (x) => fehler.push(String(x).slice(0, 100)));
      await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(codes[r]);
      await pg.getByRole("button", { name: /anmelden/i }).first().click(); await pg.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 }).catch(async () => { console.log("WARNUNG Anmeldung ohne Oberfläche:", ((await pg.evaluate(() => document.body.innerText)) || "").replace(/\s+/g, " ").slice(0, 160)); }); await pg.waitForTimeout(800);
      for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) { const t = pg.locator(zu).first(); if (await t.count()) await t.click().catch(() => {}); }
      await pg.waitForTimeout(300);
      /* Hauptnavigation */
      const mobil = AUFGABEN[r].schale === "mobil";
      let nav = { ok: false, info: "" };
      if (mobil) {
        const n = pg.locator(".m-tabs button:visible"); const k = await n.count();
        const fenster = await pg.evaluate(() => window.innerWidth);
        const boxen = []; for (let i = 0; i < k; i++) boxen.push(await n.nth(i).boundingBox());
        nav = { ok: k >= 4 && boxen.every((x) => x && x.x >= 0 && x.x + x.width <= fenster + 1 && x.width >= 24 && x.height >= 24), info: `Leiste unten: ${k} Reiter, kleinste ${Math.round(Math.min(...boxen.map((x) => x.width)))}x${Math.round(Math.min(...boxen.map((x) => x.height)))}` };
      } else {
        const menue = pg.locator(".kopf-menue:visible").first();
        if (vp.w <= 1024) {
          if (await menue.count()) { await menue.click().catch(() => {}); await pg.waitForTimeout(350);
            const k = await pg.locator(".seitenleiste .slink:visible").count();
            /* schliessbar ohne Auswahl eines Eintrags? Menuetaste noch oben auf, Abdunkelung zum Antippen oder Escape */
            const taste = await menue.evaluate((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); });
            const abdunkelung = (await pg.locator(".seiten-abdunkelung:visible").count()) > 0;
            await pg.keyboard.press("Escape"); await pg.waitForTimeout(350);
            const escZu = (await pg.locator(".seitenleiste.offen").count()) === 0;
            const zu = taste || abdunkelung || escZu;
            if (!escZu) { if (abdunkelung) await pg.locator(".seiten-abdunkelung").first().click().catch(() => {}); else if (taste) await menue.click().catch(() => {}); await pg.waitForTimeout(300);
              if ((await pg.locator(".seitenleiste.offen").count()) > 0) await pg.locator(".seitenleiste .slink:visible").first().click().catch(() => {}); }
            await pg.waitForTimeout(300);
            nav = { ok: k >= 3 && zu, info: `Menütaste öffnet Seitenleiste: ${k} Einträge sichtbar; ohne Auswahl schließbar: ${zu ? "ja" : "NEIN"} (Taste frei ${taste}, Abdunkelung ${abdunkelung}, Escape ${escZu})` }; }
          else nav = { ok: false, info: "keine Menütaste sichtbar" };
        } else nav = { ok: (await pg.locator(".seitenleiste .slink:visible").count()) >= 3, info: "Seitenleiste dauerhaft" };
      }
      zeilen.push({ rolle: r, aufgabe: "Hauptnavigation", vp: `${vp.w}x${vp.h}`, nav });
      for (const [titel, a] of AUFGABEN[r].aufgaben) {
        const z = { rolle: r, aufgabe: titel, vp: `${vp.w}x${vp.h}` };
        try {
          if (a.tab) {
            await pg.locator(`.m-tabs button:has-text("${a.tab}")`).first().click({ timeout: 4000 }); await pg.waitForTimeout(600);
            if (a.knopf) { await pg.getByRole("button", { name: a.knopf }).locator("visible=true").first().click({ timeout: 4000 }); await pg.waitForTimeout(600); }
          } else {
            if (vp.w <= 1024) { const m = pg.locator(".kopf-menue:visible").first(); if (await m.count() && (await pg.locator(".seitenleiste.offen").count()) === 0) { await m.click({ timeout: 3000 }); await pg.waitForTimeout(300); } }
            const l = pg.locator(".seitenleiste .slink", { hasText: a.ansicht }).filter({ hasText: new RegExp("^\\s*" + a.ansicht.replace(/[()]/g, "\\$&") + "\\s*\\d*\\s*$") }).first();
            if (!(await l.count())) { z.status = "NICHT ERREICHBAR (Ansicht fehlt in der Navigation dieser Rolle)"; zeilen.push(z); continue; }
            await l.click({ timeout: 4000 }); await pg.waitForTimeout(900);
          }
          z.m = await pg.evaluate(messeSeite, ZIEL_MINDEST);
          if (process.env.WP21_BILDER) await pg.screenshot({ path: `${process.env.WP21_BILDER}/${r}-${vp.w}-${titel.replace(/[^a-zA-Z]+/g, "_")}.png` }).catch(() => {});
          if (a.knopf) await pg.keyboard.press("Escape").catch(() => {});
        } catch (x) { if (process.env.WP21_SHOT) await pg.screenshot({ path: process.env.WP21_SHOT + "/" + r + "-" + vp.w + ".png" }).catch(() => {}); z.status = "FEHLER " + String(x.message).split("\n")[0].slice(0, 90); }
        zeilen.push(z);
      }
      if (fehler.length) zeilen.push({ rolle: r, aufgabe: "Seitenfehler", vp: `${vp.w}x${vp.h}`, status: fehler.join("|") });
      await cx.close();
    }
  }
  /* Regression Rechneransicht 1280x800: Bereichsleiste oben, keine Abdunkelung, kein Querscroll-Hinweis, keine Seitenueberbreite. */
  for (const r of ["planer", "leitung"].filter((x) => codes[x] && ROLLEN.includes(x))) {
    const cx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" }); const pg = await cx.newPage();
    await pg.goto(BASE + "/", { waitUntil: "networkidle" }); await pg.locator("input").first().fill(codes[r]);
    await pg.getByRole("button", { name: /anmelden/i }).first().click(); await pg.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 }).catch(async () => { console.log("WARNUNG Anmeldung ohne Oberfläche:", ((await pg.evaluate(() => document.body.innerText)) || "").replace(/\s+/g, " ").slice(0, 160)); }); await pg.waitForTimeout(800);
    const t = pg.locator('[aria-label="Tour schließen"], button:has-text("Später")').first(); if (await t.count()) await t.click().catch(() => {});
    /* Rechneransicht: Navigation ueber die Bereichsleiste oben (.bpille) und die Reiter darunter (.utab); die Seitenleiste ist dort nicht im Spiel. */
    for (const [gruppe, ansicht] of [["Planen", "Monatsplan"], ["Planen", "Personaleinsatz"], ["Wer mitfährt", "Personal"], ["Zu entscheiden", "Anträge"]]) {
      try { await pg.locator(".bpille:visible", { hasText: gruppe }).first().click({ timeout: 6000 });
        await pg.locator(".utab:visible", { hasText: new RegExp("^" + ansicht) }).first().click({ timeout: 6000 }); } catch (x) { if (process.env.WP21_SHOT) await pg.screenshot({ path: process.env.WP21_SHOT + "/regress-" + r + ".png" }).catch(() => {}); zeilen.push({ rolle: r, aufgabe: "Rechner-Regression " + ansicht, vp: "1280x800", status: "FEHLER " + String(x.message).replace(/\s+/g, " ").slice(0, 220) }); continue; } await pg.waitForTimeout(800);
      const d = await pg.evaluate(() => ({ pillen: [...document.querySelectorAll(".bpille")].filter((e) => e.getBoundingClientRect().width > 0).length,
        abdunkelung: document.querySelectorAll(".seiten-abdunkelung").length, hinweis: [...document.querySelectorAll(".scrollhinweis")].filter((e) => getComputedStyle(e).display !== "none").length, doc: document.documentElement.scrollWidth, fenster: window.innerWidth }));
      zeilen.push({ rolle: r, aufgabe: "Rechner-Regression " + ansicht, vp: "1280x800", regress: d });
    }
    await cx.close();
  }
} catch (x) { console.log("FEHLER", x && x.message); process.exitCode = 1; }
finally { if (b) await b.close(); srv.kill(); }

/* ---------------- Auswertung ---------------- */
let schlecht = 0;
const kurz = (z) => {
  if (z.nav) return `${z.nav.ok ? "OK  " : "FEHL"} ${z.rolle} ${z.vp} Hauptnavigation: ${z.nav.info}`;
  if (z.regress) { const d = z.regress; const ok = d.pillen >= 5 && d.abdunkelung === 0 && d.hinweis === 0 && d.doc <= d.fenster; return `${ok ? "OK  " : "FEHL"} ${z.rolle} ${z.vp} ${z.aufgabe}: Bereichsleiste ${d.pillen} Bereiche, Abdunkelung ${d.abdunkelung}, Scrollhinweise ${d.hinweis}, Seite ${d.doc}<=${d.fenster}`; }
  if (z.status) return `FEHL ${z.rolle} ${z.vp} ${z.aufgabe}: ${z.status}`;
  const m = z.m; const seiteOk = m.doc <= m.fenster && m.body <= m.fenster;
  return `${seiteOk ? "OK  " : "FEHL"} ${z.rolle} ${z.vp} ${z.aufgabe}: Seite ${m.doc}/${m.body}<=${m.fenster}; Innenscroll ${m.innen.length}; Ziele<24: ${m.zuKlein}/${m.ziele} (kleinstes ${m.kleinsteBreite}x${m.kleinsteHoehe})`
    + (m.hinweis ? "; HINWEIS Tablet/Rechner" : "") + (seiteOk ? "" : `; ragt: ${m.ragtOben.join(",")}`)
    + (m.innen.length ? `; innen: ${m.innen.slice(0, 2).join(",")}` : "") + (m.zuKlein ? `; klein: ${m.zuKleinListe.slice(0, 4).join(",")}` : "");
};
for (const z of zeilen) { const s = kurz(z); if (s.startsWith("FEHL")) schlecht++; console.log(s); }
console.log(`\n${zeilen.length - schlecht}/${zeilen.length} Zeilen ohne Befund (Seitenbreite, Navigation); Zielgroessen und Innenscroll sind je Zeile ausgewiesen`);
const zielProbleme = zeilen.filter((z) => z.m && z.m.zuKlein > 0).length, innenProbleme = zeilen.filter((z) => z.m && z.m.innen.length > 0).length;
console.log(`Zeilen mit Zielen unter 24 px: ${zielProbleme}; Zeilen mit Innenscroll-Bereichen: ${innenProbleme}`);
if (process.env.WP21_JSON) await writeFile(process.env.WP21_JSON, JSON.stringify(zeilen, null, 1));
process.exit(schlecht ? 1 : 0);
