/* ==========================================================================
   OBERFLÄCHENVERGLEICH

   Hält fest, WAS die Anwendung zeigt und rechnet — nicht, wie sie aussieht.
   Vor dem optischen Umbau von src/App.jsx wird ein Auszug jeder Ansicht als
   Basis abgelegt; nach dem Umbau zeigt der Vergleich, welcher Text, welcher
   Knopf, welches Eingabefeld, welche Tabellenspalte oder welche Zahl
   verloren ging oder hinzukam. Ein Pixelvergleich taugt dafür nicht: Er
   schlägt bei jedem Umbau an und sagt nichts darüber, ob etwas fehlt.

   Je Ansicht (und je geöffnetem Blatt) werden erfasst:
     text     sichtbarer Text von main#inhalt (innerText, Leerraum normalisiert,
              je Zeile/Tabellenzelle ein Eintrag mit Häufigkeit)
     knoepfe  Beschriftungen aller Knöpfe und Verweise (aria-label, sonst Text)
     felder   Eingabefelder: Art | Beschriftung | Platzhalter
     kopf     Tabellenköpfe
   Dazu je Rolle die Zähler an den Navigationseinträgen.
   Die Reihenfolge zählt nicht (ein Umbau ordnet um), die Häufigkeit schon.

   Abgedeckt: alle Ansichten aus BEREICHE (Organisationsleitung und
   Betriebsrat), die Telefonschale der Beschäftigten (390×844: Tabs Heute,
   Mein Plan, Anliegen, Mehr) und die Betreiberkonsole. Dazu Blätter, die
   sich ohne Datenänderung öffnen lassen (siehe BLATT_*).

   AUFRUF (Dev-Server läuft, wie bei pruefungen/rechte.mjs):
     CENTRIC_ADMIN=vergleich-geheim npx vite --port 5173 &
     export NODE_PATH=<Ordner mit node_modules/playwright-core>
     npm run pruefung:vergleich -- --basis            # Basis neu schreiben
     npm run pruefung:vergleich                       # Stand gegen Basis
     npm run pruefung:vergleich -- --bilder=/tmp/png  # zusätzlich PNG je Ansicht
   Weitere Optionen: --rolle=leitung,betriebsrat,mitarbeiter,betreiber
                     --nur=plan,jahr   (nur diese Ansichten)
                     --ohne-blaetter   (Dialoge auslassen)
                     --nav-klick       (Ansichten nur per Navigationsknopf ansteuern)
                     --laut            (jede Ansicht/jeden Klick melden)
   Mit --nur/--rolle schreibt --basis in die vorhandene Basis hinein, statt sie
   zu ersetzen; Blätter werden dann nicht verglichen.
   Umgebung: CENTRIC_BASIS (http://localhost:5173), CENTRIC_ADMIN,
             CENTRIC_HERKUNFT (Absenderkennung für die Bremse).
   Playwright: `npm i --no-save playwright-core` (Version passend zum
   vorhandenen Chromium; PLAYWRIGHT_BROWSERS_PATH gesetzt, KEIN `install`).
   Das Skript fügt keine Abhängigkeit zu package.json hinzu und hängt bewusst
   NICHT in `npm run pruefung`, weil es einen Browser braucht.

   DETERMINISMUS
   Uhr fest auf Di, 29.9.2026 09:00 Uhr Europe/Berlin (page.clock), Math.random
   und crypto.randomUUID aus einer gesäten Folge (mulberry32), die vor jeder
   Ansicht neu gesät wird — so hängt die Kennung eines Eintrags nicht davon
   ab, welche Ansichten vorher geöffnet wurden. Animationen aus. Jeder Lauf
   legt über POST /einrichten einen frischen Datenraum an; der Beispielbetrieb
   entsteht beim ersten Öffnen im Browser aus den gesäten Zufallszahlen.
   Zeitstempel vom Server lassen sich nicht fixieren und werden maskiert
   (siehe MASKEN).

   WIE DIE NAVIGATION ANGEPASST WIRD
   Die gesamte Zielauswahl steckt in EINER Funktion: geheZu(page, id, ziel).
   Sie versucht nacheinander (1) die Suchpalette (Strg K, Ansicht anhand der
   Beschriftung wählen), (2) den Klick auf einen Navigationsknopf (.slink,
   Text = Beschriftung) und prüft danach, ob main#inhalt die Ansicht trägt
   (aria-label "Ansicht <id>"). Nach dem Umbau (Kopfnavigation mit Bereichs-
   Pillen und Unterleiste) genügt es meist, NAV_KNOEPFE anzupassen oder in
   geheZu einen Schritt zu ergänzen (z. B. URL/Zustand). Die Ansichts-IDs
   liest das Skript aus `const BEREICHE` in src/App.jsx; bleibt das Feld
   bestehen, ändert sich an der Liste nichts. Ebenfalls anpassbar:
   NAV_ZAEHLER (wo die Zähler stehen), INHALT (Wurzel des Auszugs), BLATT
   (Erkennung geöffneter Dialoge) und `anmelden` (Token wird direkt
   gesetzt, damit ein neues Anmeldeformular nichts ändert).

   BESTAND UND ZUGÄNGE
   Je Lauf ein neuer Datenraum („vergleich-<zeit>"). Die Leitung öffnet ihn
   (dabei entsteht der Beispielbetrieb, 86 Personen), danach werden über die
   Schnittstelle vorbereitet: Leitung fährt Schicht (sonst fehlen „Meine
   Schichten" und „Wunschdienste"), Paket „pflege" gebucht (sonst fehlt
   „Übergabe"), Geführte Tour aus (sie läge über jeder Ansicht). Die Codes
   für Betriebsrat, Beschäftigte (erste Person im Schichtdienst) und Betreiber
   entstehen über POST /einrichten. Personenkennungen, die in der Oberfläche
   stehen könnten, sind durch die gesäte Zufallsfolge stabil.

   BLÄTTER
   Phase 2 lädt neu und weist jeden Schreibzugriff auf /api/ ab. Geöffnet wird
   nur, was BLATT_OEFFNER trifft und BLATT_SPERRE nicht; dazu die Blätter der
   Suchpalette (Krankmeldung, Verfügbarkeit, Assistent, Tag, Person) und der
   Kopfleiste. Schlüssel des Eintrags: "<ansicht>›<Knopf>" bzw. "suche›…".

   Exitcode: 0 gleich, 1 Unterschiede, 2 Aufruf-/Laufzeitfehler.
   ========================================================================== */

/* Die Funktionen in page.evaluate laufen im Browser, nicht in Node. */
/* global document, window, getComputedStyle, sessionStorage */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, "..");
const BASIS_URL = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "vergleich-geheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.9.7.7";
const BASISDATEI = join(HIER, "basis", "vergleich.json");

/* ------------------------------ Aufruf ---------------------------------- */
const arg = (n) => { const a = process.argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`));
  return a === undefined ? null : (a.includes("=") ? a.slice(a.indexOf("=") + 1) : true); };
const MODUS_BASIS = !!arg("basis");
const BILDER = typeof arg("bilder") === "string" ? arg("bilder") : null;
const NUR_ROLLEN = typeof arg("rolle") === "string" ? arg("rolle").split(",") : null;
const NUR_ANSICHTEN = typeof arg("nur") === "string" ? arg("nur").split(",") : null;
const OHNE_BLAETTER = !!arg("ohne-blaetter");
const LAUT = !!arg("laut");
const NAV_KLICK = !!arg("nav-klick");   // Suchpalette überspringen, nur Navigationsknöpfe (Test des Rückfallwegs)

/* import() beachtet NODE_PATH nicht, require() schon — deshalb über createRequire. */
const holen = createRequire(import.meta.url);
let playwright;
for (const n of ["playwright-core", "playwright"]) {
  try { playwright = holen(n); break; } catch { /* nächster */ }
  try { playwright = await import(n); break; } catch { /* nächster */ }
}
if (!playwright) {
  console.error("playwright-core fehlt. Bitte `npm i --no-save playwright-core` "
    + "(Version passend zum Chromium unter PLAYWRIGHT_BROWSERS_PATH) und NODE_PATH auf "
    + "dessen node_modules setzen.");
  process.exit(2);
}
const { chromium } = playwright.chromium ? playwright : playwright.default;

/* --------------------------- Festlegungen ------------------------------- */
const FESTZEIT = "2026-09-29T09:00:00+02:00";     // Dienstag, 29. September 2026, Ortszeit Berlin
const DESKTOP = { width: 1440, height: 900 };
const TELEFON = { width: 390, height: 844 };

/* Selektoren, die ein Umbau berühren kann. */
const INHALT = "main#inhalt, main";               // Wurzel des Auszugs
const NAV_KNOEPFE = ".slink";                     // Navigationseinträge (Desktop)
const NAV_ZAEHLER = ".slink .zahl";               // Zähler darin
const TELEFON_TABS = "nav button";                // Tabs der Telefonschale
const BLATT = ".blatt, [role=dialog]";            // geöffnete Blätter (Desktop)

/* Serverseitige Zeitstempel und ähnliches, das sich nicht fixieren lässt. Wird
   im Auszug durch <Maske> ersetzt und im Lauf gezählt. */
const MASKEN = [
  [/\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\b/g, "<ZEITSTEMPEL>"],
];

/* ------------------------ Ansichten aus dem Quelltext -------------------- */
function ansichtenLesen() {
  const q = readFileSync(join(WURZEL, "src", "App.jsx"), "utf8");
  const teil = (von, bis) => { const a = q.indexOf(von); const b = q.indexOf(bis, a);
    if (a < 0 || b < 0) throw new Error(`Im Quelltext fehlt ${von}`); return q.slice(a, b); };
  const paare = (t) => [...t.matchAll(/\["([a-z0-9]+)",\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
  const kunde = paare(teil("const BEREICHE = [", "const NAV_KUNDE"));
  const betreiber = paare(teil("const NAV_BETREIBER = [", "const BEREICHE"));
  const tabs = [...teil("const M_TABS = [", "];").matchAll(/id:\s*"(\w+)",\s*label:\s*"([^"]+)"/g)]
    .map((m) => [m[1], m[2]]);
  if (kunde.length < 10 || !betreiber.length || !tabs.length)
    throw new Error("Ansichtenliste im Quelltext nicht lesbar");
  return { kunde, betreiber, tabs };
}

/* ------------------------------ Bestand --------------------------------- */
const kopf = { "content-type": "application/json", "x-forwarded-for": HERKUNFT };
async function zugangAnlegen(raum, rolle, person) {
  const a = await fetch(`${BASIS_URL}/einrichten`, { method: "POST", headers: kopf,
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Vergleichsbetrieb", bestand: raum,
      rolle, person: person ?? null, betrieb: 0 }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}
async function tokenHolen(code) {
  const a = await fetch(`${BASIS_URL}/api/anmelden`, { method: "POST", headers: kopf,
    body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json();
  if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: ${JSON.stringify(d)}`);
  return d.token;
}
async function bestandLesen(token) {
  const a = await fetch(`${BASIS_URL}/api/bestand`, { headers: { authorization: `Bearer ${token}` } });
  return a.ok ? a.json() : null;
}

/* ------------------------ Skripte für die Seite -------------------------- */
const FESTLEGUNG = `(() => {
  /* gesäte Zufallszahlen: mulberry32 */
  let s = 20260929;
  const roh = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = roh;
  window.__vglSaat = (n) => { s = n | 0; };
  const hex = (n) => Array.from({ length: n }, () => Math.floor(roh() * 16).toString(16)).join("");
  const uuid = () => hex(8) + "-" + hex(4) + "-4" + hex(3) + "-a" + hex(3) + "-" + hex(12);
  try { if (window.crypto) window.crypto.randomUUID = uuid; } catch {}
  try { window.crypto.getRandomValues = new Proxy(window.crypto.getRandomValues, { apply(z, th, a) {
    const arr = a[0]; for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(roh() * 256); return arr; } }); } catch {}
  const st = document.createElement("style");
  st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}";
  const dran = () => document.head && document.head.appendChild(st);
  if (document.head) dran(); else document.addEventListener("DOMContentLoaded", dran);
})();`;

/* Läuft in der Seite. `wurzel` ist der Knoten, dessen Inhalt erfasst wird. */
function auszugInSeite(wurzel) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const sichtbar = (e) => { if (!e.getClientRects().length) return false;
    const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none"; };
  const zaehlen = (liste) => { const o = {}; for (const x of liste) if (x) o[x] = (o[x] || 0) + 1;
    return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))); };
  const roh = wurzel.innerText || "";
  const text = roh.split(/[\n\t]+/).map(norm);
  const knoepfe = [...wurzel.querySelectorAll("button, [role=button], a[href], summary, input[type=button], input[type=submit]")]
    .filter(sichtbar).map((e) => norm(e.getAttribute("aria-label") || e.innerText || e.value || e.title));
  const name = (e) => {
    const l = e.labels && e.labels.length ? [...e.labels].map((x) => x.innerText).join(" ") : "";
    const by = e.getAttribute("aria-labelledby");
    const lb = by ? by.split(/\s+/).map((i) => (document.getElementById(i) || {}).innerText || "").join(" ") : "";
    return norm(e.getAttribute("aria-label") || lb || l || (e.closest("label") || {}).innerText || "");
  };
  const felder = [...wurzel.querySelectorAll("input:not([type=hidden]), select, textarea")]
    .filter(sichtbar).map((e) =>
      `${e.tagName.toLowerCase()}${e.type && e.tagName === "INPUT" ? ":" + e.type : ""} | ${name(e)} | ${norm(e.getAttribute("placeholder"))}`);
  const kopf = [...wurzel.querySelectorAll("th, [role=columnheader]")].filter(sichtbar).map((e) => norm(e.innerText));
  return { text: zaehlen(text), knoepfe: zaehlen(knoepfe), felder: zaehlen(felder), kopf: zaehlen(kopf) };
}

/* ------------------------------ Hilfen ---------------------------------- */
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
let maskiert = {};
let gesperrt = 0;   // in der Blattphase abgewiesene Schreibzugriffe
function maskieren(a) {
  const neu = {};
  for (const k of ["text", "knoepfe", "felder", "kopf"]) {
    const o = {};
    for (const [z, n] of Object.entries(a[k])) {
      let t = z;
      for (const [re, ers] of MASKEN) { if (re.test(t)) { maskiert[ers] = (maskiert[ers] || 0) + n; } re.lastIndex = 0; t = t.replace(re, ers); }
      o[t] = (o[t] || 0) + n;
    }
    neu[k] = Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  }
  return neu;
}

/** Wartet, bis sich der Text der Wurzel nicht mehr ändert. */
async function beruhigt(page, sel = INHALT) {
  let vorher = null, gleich = 0;
  for (let i = 0; i < 60 && gleich < 3; i++) {
    const jetzt = await page.evaluate((s) => { const e = document.querySelector(s);
      return e ? e.innerText.length + ":" + e.querySelectorAll("*").length : null; }, sel).catch(() => null);
    if (jetzt !== null && jetzt === vorher) gleich++; else gleich = 0;
    vorher = jetzt; await warte(120);
  }
}

const saat = (page, s) => page.evaluate((n) => window.__vglSaat && window.__vglSaat(n), hash(s));

async function neueSeite(browser, token, viewport) {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport, locale: "de-DE", timezoneId: "Europe/Berlin",
    reducedMotion: "reduce", colorScheme: "light", deviceScaleFactor: 1,
    extraHTTPHeaders: { "x-forwarded-for": HERKUNFT } });
  await ctx.clock.setFixedTime(new Date(FESTZEIT));
  await ctx.addInitScript(FESTLEGUNG);
  /* Anmeldung: Der Token wird wie nach dem Absenden des Anmeldeformulars in
     der Sitzung abgelegt (src/speicher.js). Das hält den Vergleich frei vom
     Aussehen der Anmeldeseite. */
  await ctx.addInitScript((t) => { try { sessionStorage.setItem("centric:token", t); } catch {} }, token);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  ! Seitenfehler: ${e.message.slice(0, 160)}`));
  return { ctx, page };
}

async function laden(page) {
  await page.goto(BASIS_URL + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(INHALT.split(",")[0].trim() + ", " + INHALT.split(",")[1].trim(), { timeout: 60000 });
  await beruhigt(page);
}

/* ==========================================================================
   geheZu — die EINZIGE Stelle, die weiß, wie man zu einer Ansicht kommt.
   ========================================================================== */
async function geheZu(page, id, ziel) {
  /* Telefonschale: Tabs am unteren Rand, kein main#inhalt. */
  if (ziel.telefon) {
    await page.locator(TELEFON_TABS).filter({ hasText: ziel.label }).first().click({ timeout: 3000 });
    await warte(150);
    return true;
  }
  const ist = async () => page.evaluate((i) => {
    const m = document.querySelector("main#inhalt");
    return !!m && m.getAttribute("aria-label") === `Ansicht ${i}`; }, id);
  if (await ist()) return true;

  /* 1. Suchpalette (Strg K): Beschriftung eintippen, Treffer „Ansicht öffnen". */
  if (!NAV_KLICK) try {
    if (!(await page.$("input[role=combobox]"))) await page.keyboard.press("Control+k");
    const feld = await page.waitForSelector("input[role=combobox]", { timeout: 1500 });
    await feld.fill(ziel.label);
    const treffer = page.locator("[role=option]").filter({ hasText: "Ansicht öffnen" })
      .filter({ has: page.locator(`text="${ziel.label}"`) }).first();
    if (await treffer.count()) {
      await treffer.click({ timeout: 1500 });
      await warte(150);
      if (await ist()) return true;
    }
    await page.keyboard.press("Escape");
  } catch { await page.keyboard.press("Escape").catch(() => {}); }

  /* 2. Navigationsknopf mit genau dieser Beschriftung. */
  try {
    const knopf = page.locator(NAV_KNOEPFE).filter({ hasText: new RegExp(`^\\s*${ziel.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\d*\\s*$`) }).first();
    if (await knopf.count()) { await knopf.click({ timeout: 3000 }); await warte(150); if (await ist()) return true; }
  } catch { /* nicht erreichbar */ }
  return false;
}


/* ==========================================================================
   Erfassen
   ========================================================================== */
async function erfassen(page, wurzelSel = INHALT) {
  const h = await page.evaluateHandle((s) => document.querySelector(s.split(",")[0].trim())
    || document.querySelector(s.split(",")[1].trim()), wurzelSel);
  const roh = await page.evaluate(auszugInSeite, h);
  return maskieren(roh);
}

const zaehlerLesen = (page) => page.evaluate((sel) => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const o = {};
  for (const z of document.querySelectorAll(sel)) {
    const knopf = z.closest("button, a");
    if (!knopf) continue;
    const c = knopf.cloneNode(true); c.querySelectorAll(".zahl").forEach((x) => x.remove());
    o[norm(c.textContent) || "?"] = norm(z.textContent);
  }
  return o;
}, NAV_ZAEHLER);

async function bild(page, rolle, id) {
  if (!BILDER) return;
  mkdirSync(BILDER, { recursive: true });
  await page.screenshot({ path: join(BILDER, `${rolle}-${id}.png`), animations: "disabled" }).catch(() => {});
}

/* ==========================================================================
   Blätter (Dialoge), die sich ohne Datenänderung öffnen lassen

   Sicherheitsnetz: Während dieser Phase verwirft eine Route jedes PUT auf
   /api/bestand — selbst ein versehentlicher Klick auf „Speichern" ändert
   also nichts am Bestand. Geklickt wird trotzdem nur, was nach Öffnen
   aussieht (BLATT_OEFFNER); alles mit Löschen/Freigeben/Speichern ist
   ausgeschlossen (BLATT_SPERRE).
   ========================================================================== */
const BLATT_OEFFNER = /(anlegen|hinzufügen|bearbeiten|verfassen|erfassen|einrichten|ansehen|stellen|anfragen|melden|vorschlag|import|mehrfach|gesuch|wunschdienste|verfügbarkeit|abwesenheit|einsatz|eintragen|vorschau|ändern|planen|regel)/i;
const BLATT_SPERRE = /(lösch|entfern|freigeb|genehmig|ablehn|speicher|senden|abmeld|zurücksetz|sperr|widerruf|veröffentlich|stempel|bestätig|beenden|kündig|archiv|rückgängig|feldmodus|kompakt|fokus|komfortabel|schlüssel|erneuer|herunterlad|erzeug|kopier|e-mail schreiben|csv|pdf|sicherung|drucken|export|runde|mitzeichn|erledigt|abschließen|übernehm|nächstes|vorheriges|kalender abonnieren|rundgang|rechneransicht|telefonansicht|neu laden|jetzt)/i;
/* Kopfzeile außerhalb von main: Blätter, die von dort aufgehen. */
const KOPF_BLAETTER = [["Mitteilungen", 'button[aria-label^="Mitteilungen"]']];

const blattHandle = (page) => page.evaluateHandle((sel) => {
  const b = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length).pop();
  if (b) return b;
  /* Telefonschale: das Blatt ist ein festes Feld ohne Klasse (Ebene 80). */
  const f = [...document.querySelectorAll("body div")].filter((e) => {
    const cs = getComputedStyle(e); return cs.position === "fixed" && cs.zIndex === "80" && e.children.length; });
  return f.length ? f[f.length - 1] : null;
}, BLATT).then((h) => (h.asElement() ? h.asElement() : null));

async function blattSchliessen(page, telefon) {
  for (let i = 0; i < 3; i++) {
    if (!(await blattHandle(page))) return true;
    if (telefon) await page.mouse.click(8, 8); else await page.keyboard.press("Escape");
    await warte(200);
  }
  return !(await blattHandle(page));
}

async function blattErfassen(page, schluessel, blaetter, rolle) {
  const b = await blattHandle(page);
  if (!b) return false;
  await beruhigt(page, "body");
  const roh = await page.evaluate(auszugInSeite, b);
  const titel = await page.evaluate((e) => (e.getAttribute("aria-label")
    || (e.innerText || "").split("\n")[0] || "").replace(/\s+/g, " ").trim(), b);
  blaetter[schluessel] = { titel, ...maskieren(roh) };
  await bild(page, rolle, "blatt-" + schluessel.replace(/[^a-z0-9äöüß]+/gi, "_"));
  return true;
}

/** Öffnet die Blätter, die die Suchpalette anbietet (Aktionen, Tag, Person). */
async function paletteBlaetter(page, rolle, blaetter) {
  const anfragen = ["Krankmeldung", "Verfügbarkeit", "Planungsassistent", "Schichtplanung einrichten",
    "heute", "Aushangplan"];
  for (const q of anfragen) {
    try {
      await saat(page, `palette:${q}`);
      if (!(await page.$("input[role=combobox]"))) await page.keyboard.press("Control+k");
      const feld = await page.waitForSelector("input[role=combobox]", { timeout: 1500 });
      await feld.fill(q);
      const opt = page.locator("[role=option]").first();
      if (!(await opt.count())) { await page.keyboard.press("Escape"); continue; }
      const art = await opt.innerText();
      if (/Aushangplan/.test(art)) { await page.keyboard.press("Escape"); continue; }   // erzeugt ein Dokument
      await opt.click({ timeout: 1500 });
      await warte(250);
      if (await blattErfassen(page, `suche›${q}`, blaetter, rolle)) await blattSchliessen(page, false);
    } catch { await page.keyboard.press("Escape").catch(() => {}); }
  }
  /* Person: erste Treffer für einen Buchstaben. */
  try {
    await saat(page, "palette:person");
    await page.keyboard.press("Control+k");
    const feld = await page.waitForSelector("input[role=combobox]", { timeout: 1500 });
    await feld.fill("ba");
    const opt = page.locator("[role=option]").filter({ hasText: /,/ }).first();
    if (await opt.count()) { await opt.click({ timeout: 1500 }); await warte(300);
      if (await blattErfassen(page, "suche›Person", blaetter, rolle)) await blattSchliessen(page, false); }
    else await page.keyboard.press("Escape");
  } catch { await page.keyboard.press("Escape").catch(() => {}); }
}

/** Öffnet in der aktuellen Ansicht jeden „öffnenden" Knopf einmal. */
async function ansichtBlaetter(page, id, rolle, blaetter, telefon, zurueck) {
  /* Kandidaten mit ihrer Stelle in der Knopfliste — Klick über den Index, weil
     Playwrights Textsuche Zeilenumbrüche anders behandelt als innerText. */
  const kandidaten = await page.evaluate((s) => {
    const w = document.querySelector(s.split(",")[0].trim()) || document.querySelector(s.split(",")[1].trim());
    const norm = (x) => (x || "").replace(/\s+/g, " ").trim();
    const gesehen = new Set(), aus = [];
    [...w.querySelectorAll("button, [role=button]")].forEach((e, i) => {
      if (!e.getClientRects().length) return;
      const l = norm(e.getAttribute("aria-label") || e.innerText || e.title);
      if (!gesehen.has(l)) { gesehen.add(l); aus.push([i, l]); }
    });
    return aus;
  }, INHALT);
  let n = 0, tagZeile = false;
  for (const [index, label] of kandidaten) {
    if (LAUT) console.log(`    ? ${id}: ${label.slice(0, 50)}`);
    if (!label || label.length > (telefon ? 90 : 60) || BLATT_SPERRE.test(label)) continue;
    if (telefon && /^(Liste|Monat|Woche|Alle|Nur |Nachtdienste|Wochenende|Frühdienste|Spätdienste|Heute)/.test(label)) continue;   // Filter, keine Blätter
    if (telefon && /^(MO|DI|MI|DO|FR|SA|SO) \d/.test(label)) { if (tagZeile) continue; tagZeile = true; }   // nur die erste Tageszeile
    if (!telefon && (!BLATT_OEFFNER.test(label) || / öffnen$/.test(label))) continue;
    if (n >= (telefon ? 14 : 8)) break;
    try {
      const wurzel = page.locator(INHALT).first();
      const loc = wurzel.locator("button, [role=button]").nth(index);
      if (!(await loc.count())) { if (LAUT) console.log(`    (Knopf nicht gefunden: ${label.slice(0, 40)})`); continue; }
      await saat(page, `${rolle}:${id}:${label}`);
      await loc.click({ timeout: 1500 });
      await warte(250);
      if (LAUT) console.log(`    > geklickt: ${label.slice(0, 40)}`);
      if (await blattErfassen(page, `${id}›${label}`, blaetter, rolle)) {
        n++;
        if (!(await blattSchliessen(page, telefon))) { await laden(page); await zurueck(); }
      } else await zurueck();   // der Klick hat kein Blatt geöffnet, vielleicht die Ansicht gewechselt
    } catch (e) { if (LAUT) console.log(`    (kein Blatt: ${label.slice(0, 40)} — ${String(e.message).split("\n")[0].slice(0, 90)})`); }
  }
}

/* ==========================================================================
   Ablauf je Rolle
   ========================================================================== */
async function rolleErfassen(browser, name, token, viewport, ziele, optionen) {
  const t0 = Date.now();
  const { ctx, page } = await neueSeite(browser, token, viewport);
  const ergebnis = { ansichten: {}, blaetter: {}, navigation: {} };
  try {
    await laden(page);
    for (const [id, label] of ziele) {
      if (NUR_ANSICHTEN && !NUR_ANSICHTEN.includes(id)) continue;
      await saat(page, `${name}:${id}`);
      const da = await geheZu(page, id, { label, telefon: optionen.telefon });
      if (!da) { ergebnis.ansichten[id] = { nicht_erreichbar: true }; if (LAUT) console.log(`  - ${name}/${id}: nicht erreichbar`); continue; }
      await beruhigt(page);
      ergebnis.ansichten[id] = { label, ...(await erfassen(page)) };
      if (Object.keys(ergebnis.navigation).length === 0) ergebnis.navigation = await zaehlerLesen(page);
      await bild(page, name, id);
      if (LAUT) console.log(`  + ${name}/${id}`);
    }
    if (optionen.detail && (!NUR_ANSICHTEN || NUR_ANSICHTEN.includes("mandanten"))) {
      /* Betreiberkonsole: die Einzelansicht eines Mandanten liegt hinter „Details". */
      await saat(page, `${name}:detail`);
      if (await geheZu(page, "mandanten", { label: "Mandanten" })) {
        const d = page.locator(INHALT.split(",")[0].trim()).getByRole("button", { name: "Details" }).first();
        if (await d.count()) {
          await d.click(); await beruhigt(page);
          ergebnis.ansichten["mandanten›Details"] = { label: "Mandant, Einzelansicht", ...(await erfassen(page)) };
          await bild(page, name, "mandanten-details");
        }
      }
    }
    if (!optionen.telefon) ergebnis.navigation = { ...ergebnis.navigation, ...(await zaehlerLesen(page)) };
    if (!OHNE_BLAETTER) {
      /* Zweite Phase, auf frisch geladener Seite: jeder Schreibzugriff auf
         die Schnittstelle (PUT, POST, DELETE) wird abgewiesen. */
      await page.route("**/api/**", (r) => (r.request().method() === "GET" ? r.continue() : (gesperrt++, r.abort())));
      await laden(page);
      if (!optionen.telefon && optionen.palette) await paletteBlaetter(page, name, ergebnis.blaetter);
      if (optionen.telefon) {
        /* Kopfzeile der Telefonschale: Postfach (Umschlag, ohne Beschriftung). */
        await saat(page, `${name}:postfach`);
        const post = page.locator("header button").first();
        if (await post.count()) { await post.click({ timeout: 1500 }).catch(() => {});
          await warte(250); if (await blattErfassen(page, "kopf›Mitteilungen", ergebnis.blaetter, name)) await blattSchliessen(page, true); }
      } else if (optionen.palette) {
        for (const [bn, sel] of KOPF_BLAETTER) {
          await saat(page, `${name}:kopf:${bn}`);
          const k = page.locator(sel).first();
          if (await k.count()) { await k.click({ timeout: 1500 }).catch(() => {}); await warte(250);
            if (await blattErfassen(page, `kopf›${bn}`, ergebnis.blaetter, name)) await blattSchliessen(page, false); }
        }
      }
      for (const [id, label] of ziele) {
        if (NUR_ANSICHTEN && !NUR_ANSICHTEN.includes(id)) continue;
        if (!ergebnis.ansichten[id] || ergebnis.ansichten[id].nicht_erreichbar) continue;
        if (!(await geheZu(page, id, { label, telefon: optionen.telefon }))) continue;
        await beruhigt(page);
        await ansichtBlaetter(page, id, name, ergebnis.blaetter, !!optionen.telefon,
          () => geheZu(page, id, { label, telefon: optionen.telefon }));
      }
    }
  } finally { await ctx.close(); }
  console.log(`  ${name}: ${Object.keys(ergebnis.ansichten).length} Ansichten, ${Object.keys(ergebnis.blaetter).length} Blätter, ${gesperrt} Schreibzugriffe abgewiesen, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  gesperrt = 0;
  return ergebnis;
}

async function erzeugen() {
  const ans = ansichtenLesen();
  const raum = `vergleich-${Date.now().toString(36)}`;
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
  const alle = {};
  try {
    /* 1. Die Leitung öffnet den leeren Raum; dabei entsteht der Beispielbetrieb. */
    const codeL = await zugangAnlegen(raum, "leitung", null);
    const tokenL = await tokenHolen(codeL);
    {
      const { ctx, page } = await neueSeite(browser, tokenL, DESKTOP);
      await laden(page);
      let b = null;
      for (let i = 0; i < 60 && !(b && b.bestand); i++) { await warte(500); b = await bestandLesen(tokenL); }
      await ctx.close();
      if (!b || !b.bestand) throw new Error("Der Beispielbetrieb wurde nicht gespeichert.");
      var personen = b.bestand.mandanten[0].personen;
    }
    /* Vorbereitung über die Schnittstelle: Die Leitung des Beispielbetriebs
       fährt keine Schicht und das Paket mit der Übergabe ist nicht gebucht —
       drei Ansichten (uebergabe, meine, wuensche) wären für sie unsichtbar.
       Beides wird gesetzt, damit alle 43 Ansichten erreichbar sind. */
    {
      const schreiben = async (token, aendern) => {
        const b = await bestandLesen(token);
        aendern(b.bestand.mandanten[0]);
        const a = await fetch(`${BASIS_URL}/api/bestand`, { method: "PUT",
          headers: { ...kopf, authorization: `Bearer ${token}` },
          body: JSON.stringify({ bestand: b.bestand, etag: b.etag, durch: "Vergleich" }) });
        if (!a.ok) throw new Error(`Vorbereitung nicht gespeichert: ${a.status} ${await a.text()}`);
      };
      await schreiben(tokenL, (m) => {
        m.personen.find((p) => p.rolle === "leitung").imSchichtdienst = true;
        /* Die Geführte Tour startet von selbst und läge als Karte über jeder
           Ansicht. Sie wird ausgeschaltet; ihr Inhalt wird als Blatt erfasst
           (Suchpalette → „Schichtplanung einrichten"). */
        for (const p of m.personen) {
          p.tour = { ...(p.tour || {}), nichtMehr: true, zurueckgestellt: true, offen: false };
          if (p.einfuehrung) p.einfuehrung = { ...p.einfuehrung, erledigt: true };
        }
      });
      /* Buchungen gehören dem Betreiber (netlify/lib/rechte.mjs: KAUFMAENNISCHE_FELDER). */
      const tokenB = await tokenHolen(await zugangAnlegen(raum, "betreiber", null));
      await schreiben(tokenB, (m) => { m.pakete = [...new Set([...(m.pakete || []), "pflege"])]; });
      const chk = (await bestandLesen(tokenL)).bestand.mandanten[0];
      if (!chk.pakete.includes("pflege") || !chk.personen.find((p) => p.rolle === "leitung").imSchichtdienst)
        throw new Error("Vorbereitung wirkt nicht (Paket/Schichtdienst).");
    }
    const ma = personen.find((p) => p.rolle === "mitarbeiter" && p.status === "aktiv" && p.imSchichtdienst !== false);
    if (!ma) throw new Error("Im Beispielbetrieb gibt es keine Beschäftigte im Schichtdienst.");
    console.log(`Raum ${raum}: ${personen.length} Personen`);

    const rollen = {
      leitung: { token: tokenL, vp: DESKTOP, ziele: ans.kunde, opt: { palette: true } },
      betriebsrat: { code: () => zugangAnlegen(raum, "betriebsrat", null), vp: DESKTOP, ziele: ans.kunde, opt: { palette: true } },
      mitarbeiter: { code: () => zugangAnlegen(raum, "mitarbeiter", ma.id), vp: TELEFON, ziele: ans.tabs, opt: { telefon: true } },
      betreiber: { code: () => zugangAnlegen(raum, "betreiber", null), vp: DESKTOP, ziele: ans.betreiber, opt: { detail: true } },
    };
    for (const [name, r] of Object.entries(rollen)) {
      if (NUR_ROLLEN && !NUR_ROLLEN.includes(name)) continue;
      const token = r.token || await tokenHolen(await r.code());
      alle[name] = await rolleErfassen(browser, name, token, r.vp, r.ziele, r.opt);
    }
  } finally { await browser.close(); }
  return { format: 1, festzeit: FESTZEIT, viewport: { desktop: DESKTOP, telefon: TELEFON }, rollen: alle };
}

/* ==========================================================================
   Vergleich
   ========================================================================== */
const skelett = (t) => t.replace(/\d+(?:[.,]\d+)*/g, "#");

/** Unterschiede zweier Häufigkeitstabellen. */
function vergleichTabelle(alt, neu) {
  const fehlt = [], neuer = [], zahl = [];
  const a = {}, n = {};
  for (const [k, c] of Object.entries(alt || {})) { const d = c - ((neu || {})[k] || 0); if (d > 0) a[k] = d; }
  for (const [k, c] of Object.entries(neu || {})) { const d = c - ((alt || {})[k] || 0); if (d > 0) n[k] = d; }
  /* Gleiches Gerüst, andere Zahl → „Zahl anders" statt fehlt+neu. */
  const nach = {};
  for (const k of Object.keys(n)) (nach[skelett(k)] ||= []).push(k);
  for (const k of Object.keys(a)) {
    const kand = /\d/.test(k) ? nach[skelett(k)] : null;
    while (a[k] > 0 && kand && kand.length) {
      const m = kand.find((x) => n[x] > 0); if (!m) break;
      zahl.push(`${k}  →  ${m}`); a[k]--; n[m]--;
    }
  }
  for (const [k, c] of Object.entries(a)) if (c > 0) fehlt.push(c > 1 ? `${k}  (×${c})` : k);
  for (const [k, c] of Object.entries(n)) if (c > 0) neuer.push(c > 1 ? `${k}  (×${c})` : k);
  return { fehlt, neuer, zahl };
}

function vergleichEintrag(alt, neu) {
  const teile = [];
  if (!alt && neu) return ["+ neu (nicht in der Basis)"];
  if (alt && !neu) return ["- fehlt im aktuellen Stand"];
  if (alt.nicht_erreichbar !== neu.nicht_erreichbar)
    return [alt.nicht_erreichbar ? "+ jetzt erreichbar (in der Basis nicht)" : "- nicht mehr erreichbar"];
  const namen = { text: "Text", knoepfe: "Knopf", felder: "Feld", kopf: "Tabellenkopf" };
  for (const k of Object.keys(namen)) {
    const d = vergleichTabelle(alt[k], neu[k]);
    for (const x of d.fehlt) teile.push(`- ${namen[k]} fehlt: ${x}`);
    for (const x of d.zahl) teile.push(`~ ${namen[k]}, Zahl anders: ${x}`);
    for (const x of d.neuer) teile.push(`+ ${namen[k]} neu: ${x}`);
  }
  return teile;
}

function vergleichen(basis, aktuell) {
  let anzahl = 0, geprueft = 0;
  const ausgabe = [];
  for (const rolle of Object.keys(aktuell.rollen)) {
    const b = basis.rollen[rolle], a = aktuell.rollen[rolle];
    if (!b) { ausgabe.push(`Rolle ${rolle}: nicht in der Basis`); anzahl++; continue; }
    const gruppen = [["ansichten", "Ansicht"], ...(OHNE_BLAETTER || NUR_ANSICHTEN ? [] : [["blaetter", "Blatt"]])];
    for (const [feld, wort] of gruppen) {
      const ids = new Set([...Object.keys(b[feld] || {}), ...Object.keys(a[feld] || {})]);
      for (const id of [...ids].sort()) {
        if (NUR_ANSICHTEN && feld === "ansichten" && !NUR_ANSICHTEN.includes(id)) continue;
        geprueft++;
        const d = vergleichEintrag((b[feld] || {})[id], (a[feld] || {})[id]);
        if (d.length) { anzahl++; ausgabe.push(`\n[${rolle}] ${wort} ${id}`, ...d.map((x) => "  " + x)); }
      }
    }
    const nav = vergleichTabelle(
      Object.fromEntries(Object.entries(b.navigation || {}).map(([k, v]) => [`${k}: ${v}`, 1])),
      Object.fromEntries(Object.entries(a.navigation || {}).map(([k, v]) => [`${k}: ${v}`, 1])));
    if (nav.fehlt.length || nav.neuer.length || nav.zahl.length) {
      anzahl++;
      ausgabe.push(`\n[${rolle}] Zähler in der Navigation`,
        ...nav.fehlt.map((x) => `  - fehlt: ${x}`), ...nav.zahl.map((x) => `  ~ Zahl anders: ${x}`),
        ...nav.neuer.map((x) => `  + neu: ${x}`));
    }
  }
  return { anzahl, geprueft, ausgabe };
}

/* ==========================================================================
   Los
   ========================================================================== */
const t0 = Date.now();
try {
  const erg = await erzeugen();
  const json = JSON.stringify(erg, null, 1);
  if (Object.keys(maskiert).length)
    console.log("Maskiert:", Object.entries(maskiert).map(([k, v]) => `${k} ×${v}`).join(", "));
  if (MODUS_BASIS) {
    mkdirSync(dirname(BASISDATEI), { recursive: true });
    let ziel = erg;
    if (NUR_ROLLEN || NUR_ANSICHTEN) {
      /* Teilaufnahme: in die vorhandene Basis einmischen. */
      ziel = existsSync(BASISDATEI) ? JSON.parse(readFileSync(BASISDATEI, "utf8")) : { ...erg, rollen: {} };
      for (const [r, v] of Object.entries(erg.rollen))
        ziel.rollen[r] = NUR_ANSICHTEN ? { ...(ziel.rollen[r] || { ansichten: {}, blaetter: {}, navigation: {} }),
          ansichten: { ...(ziel.rollen[r]?.ansichten || {}), ...v.ansichten } } : v;
    }
    writeFileSync(BASISDATEI, JSON.stringify(ziel, null, 1) + "\n");
    const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
    console.log(`Basis geschrieben: ${BASISDATEI} (${kb} KB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    process.exit(0);
  }
  if (!existsSync(BASISDATEI)) { console.error(`Keine Basis: ${BASISDATEI} — erst mit --basis erzeugen.`); process.exit(2); }
  const basis = JSON.parse(readFileSync(BASISDATEI, "utf8"));
  const v = vergleichen(basis, erg);
  console.log(v.ausgabe.join("\n"));
  console.log(`\n${v.geprueft} Ansichten/Blätter geprüft, ${v.anzahl} mit Unterschieden (${((Date.now() - t0) / 1000).toFixed(0)} s).`);
  process.exit(v.anzahl ? 1 : 0);
} catch (e) {
  console.error("Fehler:", e && e.stack || e);
  process.exit(2);
}
