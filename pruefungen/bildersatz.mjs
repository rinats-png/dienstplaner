/* ==========================================================================
   BILDERSATZ DER ANWENDUNG

   Erzeugt Bilder der echten Oberfläche — einmal durch sämtliche Funktionen —
   und legt sie als JPEG (Breite 1440, Qualität 82) ab, dazu INDEX.md mit der
   Zuordnung Datei → Ansicht → Rolle → Modus.

   Bestand und Uhr sind wie im Oberflächenvergleich fest: Di, 29.9.2026,
   09:00 Uhr Europe/Berlin, gesäte Zufallsfolge, dieselben Testdaten
   (pruefungen/testdaten.mjs). Läuft nicht in CI (braucht einen Browser).

   AUFRUF (Dev-Server läuft):
     CENTRIC_ADMIN=vergleich-geheim npx vite --port 5173 &
     export NODE_PATH=<Ordner mit node_modules/playwright-core>
     node pruefungen/bildersatz.mjs [--aus=entwuerfe/leitstand/umsetzung]
                                    [--teil=leitung,dunkel,telefon,betreiber,anmeldung,modi,menues,dialoge,breit]
   Ohne --teil entstehen alle Teile. Die Anmeldeseite zeigt Demokacheln, die
   der Dev-Server nicht anbietet; sie werden für das Bild nachgestellt
   (Antwort von /api/demos), sonst nichts.
   ========================================================================== */
/* global document, window, sessionStorage, innerWidth, innerHeight */
import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { beispieleSaeen } from "./testdaten.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, "..");
const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "vergleich-geheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.9.7.6";
const arg = (n) => { const a = process.argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`));
  return a === undefined ? null : (a.includes("=") ? a.slice(a.indexOf("=") + 1) : true); };
const AUS = join(WURZEL, arg("aus") || "entwuerfe/leitstand/umsetzung");
const TEILE = typeof arg("teil") === "string" ? arg("teil").split(",") : null;
const dabei = (t) => !TEILE || TEILE.includes(t);
const QUALITAET = +(arg("qualitaet") || 82);
const MAXHOEHE = 1700;

const holen = createRequire(process.env.NODE_PATH ? join(process.env.NODE_PATH.split(":")[0], "x.js") : import.meta.url);
const { chromium } = holen("playwright-core");
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(AUS, { recursive: true });

const kopf = { "content-type": "application/json", "x-forwarded-for": HERKUNFT };
async function zugang(raum, rolle, person) {
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST", headers: kopf,
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Bilderbetrieb", bestand: raum, rolle, person: person ?? null, betrieb: 0 }) });
  const d = await a.json(); if (!d.zugangscode) throw new Error(JSON.stringify(d)); return d.zugangscode; }
async function token(code) {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST", headers: kopf, body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json(); if (!d.token) throw new Error(JSON.stringify(d)); return d.token; }
const lesen = async (t) => { const a = await fetch(`${BASIS}/api/bestand`, { headers: { authorization: `Bearer ${t}` } }); return a.ok ? a.json() : null; };
async function schreiben(t, f) {
  const b = await lesen(t); f(b.bestand.mandanten[0]);
  const a = await fetch(`${BASIS}/api/bestand`, { method: "PUT", headers: { ...kopf, authorization: `Bearer ${t}` },
    body: JSON.stringify({ bestand: b.bestand, etag: b.etag, durch: "Bildersatz" }) });
  if (!a.ok) throw new Error("PUT " + a.status);
}

const FEST = "2026-09-29T09:00:00+02:00";
const FESTLEGUNG = `(() => { let s = 20260929; const roh = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; Math.random = roh;
  const st = document.createElement("style"); st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
  const dran = () => document.head && document.head.appendChild(st); if (document.head) dran(); else document.addEventListener("DOMContentLoaded", dran); })();`;

async function neueSeite(browser, tok, vp, extra = {}) {
  const ctx = await browser.newContext({ viewport: vp, locale: "de-DE", timezoneId: "Europe/Berlin", reducedMotion: "reduce",
    colorScheme: "light", deviceScaleFactor: 1, extraHTTPHeaders: { "x-forwarded-for": HERKUNFT }, ...extra });
  await ctx.clock.setFixedTime(new Date(FEST));
  await ctx.addInitScript(FESTLEGUNG);
  if (tok) await ctx.addInitScript((t) => { try { sessionStorage.setItem("centric:token", t); } catch {} }, tok);
  const page = await ctx.newPage();
  const meldungen = [];
  page.on("pageerror", (e) => meldungen.push("Seitenfehler: " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) meldungen.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  return { ctx, page, meldungen };
}

/* ------------------------------ Ablage ---------------------------------- */
const index = [];   // { datei, ansicht, rolle, modus }
async function bild(page, datei, ansicht, rolle, modus, opt = {}) {
  await warte(350);
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, innerHeight));
  const w = await page.evaluate(() => innerWidth);
  const voll = opt.voll !== false && w >= 1000;
  const clip = voll ? { x: 0, y: 0, width: w, height: Math.min(h, MAXHOEHE) } : undefined;
  await page.screenshot({ path: join(AUS, datei), type: "jpeg", quality: QUALITAET, fullPage: voll && h > 900, clip: voll && h > 900 ? clip : undefined });
  index.push({ datei, ansicht, rolle, modus });
  const ueber = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ueber > 0) console.log(`  ! waagerechter Überlauf ${ueber}px: ${datei}`);
}

const LABEL = { start: "Start", ablauf: "Ablauf", handbuch: "Handbuch", hilfe: "Hilfe", uebergabe: "Übergabe", meine: "Meine Schichten",
  lage: "Lagebild", zeitachse: "Zeitachse", plan: "Monatsplan", einsatz: "Personaleinsatz", jahr: "Jahresansicht", bereitschaft: "Bereitschaft",
  selbstplan: "Selbstplanung", sonder: "Sondereinsätze", folge: "Schichtfolge", notrufe: "Notrufe", offene: "Offene Schichten",
  antraege: "Anträge", boerse: "Tauschbörse", wuensche: "Wunschdienste", aushang: "Schwarzes Brett", buch: "Dienstbuch",
  personal: "Personal", quals: "Qualifikationen", nachweise: "Nachweise", kompetenzen: "Kompetenzen", einarbeitung: "Einarbeitung",
  verteilung: "Verteilung", mittel: "Betriebsmittel", pruef: "Prüfung", untergrenzen: "Untergrenzen", lenkzeiten: "Lenkzeiten",
  belastung: "Belastung", belastbarkeit: "Belastbarkeit", planstand: "Planstand", nachweis: "Leistungsnachweis",
  abrechnung: "Abrechnungsdaten", betrieb: "Betrieb", dienste: "Dienstarten", einstellungen: "Einstellungen",
  mitnahme: "Datenmitnahme", datenschutz: "Datenschutz", rechtliches: "Rechtliches" };

async function geheZu(page, id) {
  const label = LABEL[id];
  await page.keyboard.press("Control+k");
  const f = await page.waitForSelector("input[role=combobox]", { timeout: 4000 });
  await f.fill(label); await warte(150);
  await page.locator("[role=option]").filter({ hasText: "Ansicht öffnen" }).filter({ has: page.locator(`text="${label}"`) }).first().click({ timeout: 4000 });
  await warte(500);
}
const imMenue = async (page, fn) => {
  await page.locator(".ansichtknopf").click(); await warte(250); await fn(); await page.keyboard.press("Escape"); await warte(300); };
const einstellen = async (page, { dunkel, kompakt, feld, fokus }) => imMenue(page, async () => {
  await page.getByRole("tab", { name: dunkel ? "Dunkel" : "Hell" }).click();
  await page.getByRole("tab", { name: kompakt ? "Kompakt" : "Komfortabel" }).click();
  const s = async (name, an) => { const l = page.getByRole("switch", { name }); if ((await l.getAttribute("aria-checked")) !== String(!!an)) await l.click(); };
  await s("Feldmodus", feld); await s("Fokus", fokus);
});

/* ------------------------------ Aufbau ---------------------------------- */
const raum = `bilder-${Date.now().toString(36)}`;
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
try {
  const tL = await token(await zugang(raum, "leitung", null));
  let personen;
  { const { ctx, page } = await neueSeite(browser, tL, { width: 1440, height: 900 }); await page.goto(BASIS + "/");
    let b = null; for (let i = 0; i < 60 && !(b && b.bestand); i++) { await warte(500); b = await lesen(tL); }
    await ctx.close(); if (!b) throw new Error("Kein Bestand"); personen = b.bestand.mandanten[0].personen; }
  await schreiben(tL, (m) => {
    m.personen.find((p) => p.rolle === "leitung").imSchichtdienst = true;
    for (const p of m.personen) { p.tour = { ...(p.tour || {}), nichtMehr: true, zurueckgestellt: true, offen: false };
      if (p.einfuehrung) p.einfuehrung = { ...p.einfuehrung, erledigt: true }; }
    beispieleSaeen(m); });
  const tB = await token(await zugang(raum, "betreiber", null));
  await schreiben(tB, (m) => { m.pakete = [...new Set([...(m.pakete || []), "pflege"])]; });
  const ma = personen.find((p) => p.rolle === "mitarbeiter" && p.status === "aktiv" && p.imSchichtdienst !== false);
  const tM = await token(await zugang(raum, "mitarbeiter", ma.id));
  const thema = (wert) => schreiben(tL, (m) => { m.personen.find((p) => p.id === ma.id).thema = wert; });
  console.log(`Raum ${raum}, Beschäftigte: ${ma.vorname} ${ma.nachname}`);
  const ALLE = Object.keys(LABEL);

  /* -------- Leitung: alle Ansichten, hell und dunkel, 1440 -------- */
  const durch = async (dunkel, teil) => {
    const { ctx, page, meldungen } = await neueSeite(browser, tL, { width: 1440, height: 900 });
    await page.goto(BASIS + "/"); await page.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(800);
    await einstellen(page, { dunkel });
    for (const id of ALLE) {
      try { await geheZu(page, id); } catch (e) { console.log("  nicht erreichbar:", id, e.message.split("\n")[0]); continue; }
      await bild(page, `leitung-${id}-${dunkel ? "dunkel" : "hell"}.jpg`, LABEL[id], "Organisationsleitung", dunkel ? "1440 dunkel" : "1440 hell");
    }
    if (meldungen.length) console.log(`  Konsole (${teil}):`, [...new Set(meldungen)].slice(0, 6).join(" | "));
    await ctx.close();
  };
  if (dabei("leitung")) { console.log("Leitung hell"); await durch(false, "hell"); }
  if (dabei("dunkel")) { console.log("Leitung dunkel"); await durch(true, "dunkel"); }

  /* -------- Telefonschale (Beschäftigte) -------- */
  if (dabei("telefon")) {
    console.log("Telefon");
    for (const dunkel of [false, true]) {
      await thema(dunkel ? "dunkel" : "hell");
      const { ctx, page, meldungen } = await neueSeite(browser, tM, { width: 390, height: 844 }, { hasTouch: true });
      await page.goto(BASIS + "/"); await page.waitForSelector("nav button", { timeout: 60000 }); await warte(900);
      const modus = dunkel ? "390 dunkel" : "390 hell";
      for (const [id, t] of [["heute", "Heute"], ["plan", "Mein Plan"], ["anliegen", "Anliegen"], ["mehr", "Mehr"]]) {
        await page.locator("nav button", { hasText: t }).first().click(); await warte(500);
        await bild(page, `telefon-${id}-${dunkel ? "dunkel" : "hell"}.jpg`, `Telefonschale, Tab ${t}`, "Beschäftigte", modus, { voll: false });
      }
      if (!dunkel) {
        await page.locator("nav button", { hasText: "Anliegen" }).first().click(); await warte(300);
        await page.getByRole("button", { name: /Krank melden/ }).first().click(); await warte(500);
        await bild(page, "telefon-blatt-krankmeldung-hell.jpg", "Blatt Krankmeldung", "Beschäftigte", modus, { voll: false });
        await page.mouse.click(8, 8); await warte(300);
        await page.getByRole("button", { name: /^Mitteilungen/ }).first().click(); await warte(400);
        await bild(page, "telefon-blatt-mitteilungen-hell.jpg", "Blatt Mitteilungen", "Beschäftigte", modus, { voll: false });
      }
      if (meldungen.length) console.log("  Konsole:", [...new Set(meldungen)].slice(0, 5).join(" | "));
      await ctx.close();
    }
    await thema("hell");
  }

  /* -------- Betreiberkonsole -------- */
  if (dabei("betreiber")) {
    console.log("Betreiber");
    const { ctx, page, meldungen } = await neueSeite(browser, tB, { width: 1440, height: 900 });
    await page.goto(BASIS + "/"); await page.waitForSelector("main", { timeout: 60000 }); await warte(1000);
    for (const [id, l] of [["mandanten", "Mandanten"], ["selbststarts", "Selbststarts"], ["neu", "Neuer Mandant"], ["adressen", "Adressänderungen"],
      ["rechnungen", "Rechnungen"], ["tarife", "Tarife"], ["rechner", "Rechner"], ["pakete", "Pakete"]]) {
      await page.locator("nav[aria-label^='Ansichten'] button", { hasText: new RegExp("^" + l) }).first().click({ timeout: 5000 }); await warte(600);
      await bild(page, `betreiber-${id}-hell.jpg`, `Betreiberkonsole, ${l}`, "Betreiber", "1440 hell");
    }
    if (meldungen.length) console.log("  Konsole:", [...new Set(meldungen)].slice(0, 5).join(" | "));
    await ctx.close();
  }

  /* -------- Anmeldung -------- */
  if (dabei("anmeldung")) {
    console.log("Anmeldung");
    const demos = [
      ["d1", "leitung", "Seniorenzentrum Lindenhof (Pflege)"], ["d2", "planer", "Seniorenzentrum Lindenhof (Pflege)"],
      ["d3", "mitarbeiter", "Seniorenzentrum Lindenhof (Pflege)"], ["d4", "leitung", "Nordwacht Sicherheit"], ["d5", "betriebsrat", "Nordwacht Sicherheit"]]
      .map(([id, rolle, gruppe]) => ({ id, name: "Beispiel", rolle, gruppe, hinweis: null }));
    for (const [tag, vp] of [["desktop", { width: 1440, height: 900 }], ["telefon", { width: 390, height: 844 }]]) {
      const { ctx, page } = await neueSeite(browser, null, vp);
      await page.route("**/api/demos", (r) => r.fulfill({ json: { demos } }));
      await page.goto(BASIS + "/"); await warte(6500);
      await bild(page, `anmeldung-${tag}-start.jpg`, "Anmeldung mit Testzugängen (Kacheln nachgestellt)", "ohne", `${vp.width} hell`, { voll: vp.width >= 1000 });
      for (const [n, txt, titel] of [["preise", "Was kostet das?", "Preisrechner"], ["selbst", "Selbst starten", "Selbst starten"], ["code", "Ich habe einen Zugangscode", "Anmeldung mit Code"]]) {
        try { await page.getByRole("button", { name: txt }).first().click({ timeout: 4000 }); await warte(500);
          await bild(page, `anmeldung-${tag}-${n}.jpg`, titel, "ohne", `${vp.width} hell`);
          await page.goto(BASIS + "/"); await warte(5500);
        } catch (e) { console.log("  Anmeldung", n, e.message.split("\n")[0]); await page.goto(BASIS + "/"); await warte(5500); }
      }
      await ctx.close();
    }
  }

  /* -------- Kompakt und Feldmodus, Menüs, Dialoge, 1024 -------- */
  if (dabei("modi")) {
    console.log("Modi");
    for (const [tag, o, name] of [["kompakt", { kompakt: true }, "Kompakt"], ["feld", { feld: true }, "Feldmodus"], ["fokus", { fokus: true }, "Fokus"]]) {
      const { ctx, page } = await neueSeite(browser, tL, { width: 1440, height: 900 });
      await page.goto(BASIS + "/"); await page.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(700);
      await einstellen(page, o);
      for (const id of tag === "fokus" ? ["start", "plan"] : ["start", "lage", "plan", "personal"]) {
        await geheZu(page, id).catch(async () => { if (tag === "fokus") await page.keyboard.press("Control+k"); });
        await bild(page, `leitung-${id}-${tag}.jpg`, LABEL[id], "Organisationsleitung", `1440 ${name}`);
      }
      await ctx.close();
    }
  }
  if (dabei("menues")) {
    console.log("Menüs");
    const { ctx, page } = await neueSeite(browser, tL, { width: 1440, height: 900 });
    await page.goto(BASIS + "/"); await page.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(700);
    await page.locator(".ansichtknopf").click(); await warte(300);
    await bild(page, "menue-ansicht.jpg", "Ansicht-Menü geöffnet (Dichte, Fokus, Feldmodus, Erscheinungsbild)", "Organisationsleitung", "1440 hell", { voll: false });
    await page.keyboard.press("Escape"); await warte(300);
    const konto = page.locator(".kopfleiste button, .kopfblock button").filter({ hasText: /^[A-ZÄÖÜ]{2}$/ }).last();
    await konto.click(); await warte(300);
    await bild(page, "menue-konto.jpg", "Konto-Menü geöffnet", "Organisationsleitung", "1440 hell", { voll: false });
    await ctx.close();
  }
  if (dabei("dialoge")) {
    console.log("Dialoge");
    const { ctx, page, meldungen } = await neueSeite(browser, tL, { width: 1440, height: 900 });
    await page.goto(BASIS + "/"); await page.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(800);
    await geheZu(page, "plan");
    await page.keyboard.press("Control+k"); await page.waitForSelector("input[role=combobox]"); await warte(300);
    await bild(page, "dialog-suche.jpg", "Suchpalette (Strg K)", "Organisationsleitung", "1440 hell", { voll: false });
    await page.keyboard.press("Escape"); await warte(200);
    const ueber = async (frage, datei, titel) => {
      try {
        await page.keyboard.press("Control+k"); const f = await page.waitForSelector("input[role=combobox]", { timeout: 3000 });
        await f.fill(frage); await warte(200);
        await page.locator("[role=option]").first().click({ timeout: 3000 }); await warte(600);
        await bild(page, datei, titel, "Organisationsleitung", "1440 hell", { voll: false });
        await page.keyboard.press("Escape"); await warte(300);
        if (await page.locator("[role=dialog]").count()) { await page.keyboard.press("Escape"); await warte(300); }
      } catch (e) { console.log("  Dialog", frage, e.message.split("\n")[0]); await page.keyboard.press("Escape").catch(() => {}); }
    };
    await ueber("Krankmeldung", "dialog-krankmeldung.jpg", "Krankmeldung");
    await ueber("Verfügbarkeit", "dialog-verfuegbarkeit.jpg", "Verfügbarkeit");
    await ueber("Planungsassistent", "dialog-planungsassistent.jpg", "Planungsassistent");
    await ueber("Schichtplanung einrichten", "dialog-assistent-einrichten.jpg", "Schichtplanung einrichten (Assistent)");
    await ueber("heute", "dialog-tag.jpg", "Tagesdetail");
    await ueber("Aushangplan", "dialog-aushangplan.jpg", "Aushangplan");
    await ueber("Wunschdienste", "dialog-wunschdienste.jpg", "Wunschdienste eintragen");
    // Blätter, die ein Knopf der Ansicht öffnet
    const knopf = async (ansicht, name, datei, titel) => {
      try { await geheZu(page, ansicht); await page.getByRole("button", { name }).first().click({ timeout: 4000 }); await warte(600);
        await bild(page, datei, titel, "Organisationsleitung", "1440 hell", { voll: false });
        await page.keyboard.press("Escape"); await warte(300);
      } catch (e) { console.log("  Blatt", titel, e.message.split("\n")[0]); }
    };
    await knopf("plan", "Mehrfach ändern", "dialog-mehrfach.jpg", "Mehrfach ändern");
    await knopf("personal", "Importieren", "dialog-import.jpg", "Import");
    await knopf("personal", "Person hinzufügen", "dialog-person-hinzufuegen.jpg", "Person hinzufügen");
    // Postfach über die Kopfzeile
    try { await page.getByRole("button", { name: /^Mitteilungen/ }).first().click({ timeout: 3000 }); await warte(500);
      await bild(page, "dialog-postfach.jpg", "Postfach", "Organisationsleitung", "1440 hell", { voll: false }); await page.keyboard.press("Escape"); await warte(300);
    } catch (e) { console.log("  Postfach", e.message.split("\n")[0]); }
    // Personalakte aus der Personalliste
    try { await geheZu(page, "personal"); await page.getByText("Ahrens, Mehmet").first().click({ timeout: 3000 }); await warte(700);
      await bild(page, "dialog-personalakte.jpg", "Personalakte", "Organisationsleitung", "1440 hell", { voll: false }); await page.keyboard.press("Escape"); await warte(300);
    } catch (e) { console.log("  Personalakte", e.message.split("\n")[0]); }
    // Meldung mit Rückgängig: einen Aushang abnehmen (im Bilderbetrieb; danach ändert sich der Bestand)
    try { await geheZu(page, "aushang"); await warte(300);
      await page.getByRole("button", { name: "Abnehmen" }).first().click({ timeout: 3000 }); await warte(600);
      await bild(page, "dialog-toast-rueckgaengig.jpg", "Meldung mit Rückgängig (Toast)", "Organisationsleitung", "1440 hell", { voll: false });
    } catch (e) { console.log("  Toast", e.message.split("\n")[0]); }
    // Offline-Leiste
    try { await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); await warte(600);
      await bild(page, "dialog-offline.jpg", "Offline-Leiste", "Organisationsleitung", "1440 Feldmodus", { voll: false });
      await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
    } catch (e) { console.log("  Offline", e.message.split("\n")[0]); }
    if (meldungen.length) console.log("  Konsole:", [...new Set(meldungen)].slice(0, 5).join(" | "));
    await ctx.close();
    // Geführte Tour: mit eingeschalteter Tour in einem eigenen Betrieb
    const tour = await token(await zugang(raum + "-tour", "leitung", null));
    { const { ctx: c2, page: p2 } = await neueSeite(browser, tour, { width: 1440, height: 900 });
      await p2.goto(BASIS + "/"); await p2.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(2500);
      await bild(p2, "dialog-tour-oder-einfuehrung.jpg", "Geführte Tour bzw. Einführung im neuen Betrieb (Testablauf-Banner darüber)", "Organisationsleitung", "1440 hell", { voll: false });
      await c2.close(); }
  }
  if (dabei("breit")) {
    console.log("1024");
    const { ctx, page } = await neueSeite(browser, tL, { width: 1024, height: 768 });
    await page.goto(BASIS + "/"); await page.waitForSelector("main#inhalt", { timeout: 60000 }); await warte(700);
    for (const id of ["start", "plan"]) { await geheZu(page, id); await bild(page, `leitung-${id}-1024.jpg`, LABEL[id], "Organisationsleitung", "1024 hell"); }
    await ctx.close();
  }
} finally { await browser.close(); }

/* ------------------------------ INDEX.md -------------------------------- */
index.sort((a, b) => a.datei.localeCompare(b.datei));
let gesamt = 0; for (const f of readdirSync(AUS)) if (f.endsWith(".jpg")) gesamt += statSync(join(AUS, f)).size;
const md = ["# Bildersatz der Anwendung", "",
  "Aufnahmen der echten Oberfläche (Leitstand-Stil) — Stand nach P7/P8. Festgehaltener Bestand: Beispielbetrieb mit den Testdaten aus `pruefungen/testdaten.mjs`,",
  "Uhr fest auf Di, 29.9.2026, 09:00 Uhr. Erzeugt mit `node pruefungen/bildersatz.mjs` (Chromium, JPEG, Qualität " + QUALITAET + ", Breite 1440 bzw. 1024 / 390).",
  "Hohe Seiten sind bei " + MAXHOEHE + " px abgeschnitten. Die Anmeldung zeigt die Testzugänge nachgestellt (der Dev-Server bietet keine an).", "",
  `${index.length} Bilder, ${(gesamt / 1048576).toFixed(1)} MB.`, "",
  "| Datei | Ansicht | Rolle | Modus |", "|---|---|---|---|",
  ...index.map((e) => `| ${e.datei} | ${e.ansicht} | ${e.rolle} | ${e.modus} |`), ""].join("\n");
writeFileSync(join(AUS, "INDEX.md"), md);
console.log(`${index.length} Bilder, ${(gesamt / 1048576).toFixed(1)} MB → ${AUS}`);
