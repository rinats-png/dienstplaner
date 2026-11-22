/* global document, window, getComputedStyle, innerWidth, innerHeight */
/* ==========================================================================
   BROWSER-ABNAHME DER INTEGRATIONSFASSUNG (lokal, Wegwerfdaten)

   Prüft die Punkte, die die Quelltext-Prüfungen nicht belegen können
   (docs/acc45/V4-STAGING-VORAUSSETZUNGEN.md, Abschnitt 3):

     1  WP-40  Reflow 320 px (1.4.10): kein Querscrollen der Seite, je Ansicht
     2  WP-40  Zielgröße 24 px (2.5.8) auf dem Telefon (390 px)
     3  WP-40  Fokus sichtbar (2.4.7) und nicht verdeckt (2.4.11) per Tab-Taste
     4  WP-40  Fehlertext (3.3.1) bei falschem Zugangscode, 320 px und 1280 px
     5  WP-I2  Schichtfolge: Live-Prüfung ändert sich beim Belegen des Rasters
     6  WP-I17 Intelligence-Antwort: Anzeige je Zustand und Rolle, 320 px

   Was dieses Skript ist: ein Hilfsmittel für Entwicklung und Abnahmevorbereitung.
   Was es nicht ist: eine Abnahme gegen Staging, ein Screenreader-Test, axe oder
   ein Gerätetest. Es berührt weder Staging noch Production: Ziel ist nur der
   eigene Rechner (127.0.0.1), der Server läuft mit frischem Wegwerf-Datenordner
   und einem zufällig erzeugten Verwaltungsschlüssel, der nie ausgegeben wird.

   Aufruf (aus dem Repo-Wurzelverzeichnis):
     node pruefungen/browser/v4-abnahme.mjs [kriterien]
   kriterien: kommagetrennt aus reflow, ziele, fokus, fehler, folge, ki
              (Vorgabe: alle)
   Umgebung (alles optional):
     DIST=<ordner>     fertigen Bau verwenden statt selbst zu bauen
     PORT=3194         Port des lokalen Servers
     BILDER=<ordner>   Bilder und bericht.json (Vorgabe: design/abnahme/v4-staging/,
                       in .gitignore)
     BILDER_ALLE=1     von jeder Ansicht ein Bild
     ROLLEN=leitung,mitarbeiter   BREITEN_REFLOW=320   THEMEN=light,dark
     NUR=<Text>        nur Ansichten, deren Name den Text enthält (reflow, ziele)
     IMPORT_BLATT=1    in der Ansicht Personal zusätzlich das Blatt „Personal importieren“
                       (Eingabe, Vorschau; ohne Übernahme) messen (V4-3b Import)
     TELEFON_BLATT=1   in der Telefonschale (Reiter „Heute“) zusätzlich das Blatt „Mitteilungen“
                       (Postknopf) messen: Reflow, Zielgröße, Radius, Fokus (V4-3b Telefonschale)
     EINSTIEG=1        zusätzlich den Einstieg ohne Anmeldung messen (V4-3b Einstieg): Startseite, Preise,
                       Registrierung (leer, Fehler, fertig), Anmeldung mit Code, zweiter Faktor, Rechtsfenster.
                       Nur Testdaten: GET /api/demos und POST /starten beantwortet der Browser selbst (page.route,
                       erfundene Einträge, kein Serveraufruf); es wird kein Code abgeschickt. Mit ROLLEN= (leer)
                       nur der Einstieg.
     SPEICHERLAGE=1    im Reiter „Heute“ (Rolle mitarbeiter) zusätzlich die Leiste „Keine Verbindung“ messen: Kontext
                       offline, Reflow, Zielgröße, Radius (Stufe mittel), Bild; wieder online, Leiste weg
                       (V4-3b Speicherlage). Es wird nichts geschrieben.
     BRANCHENMODULE=1  in der Ansicht „Betrieb“ (Rolle leitung) zusätzlich den Bereich „Branchenmodule“ messen: Reflow,
                       Zielgröße, Radius der Modulzeilen (Stufe klein), Bild (V4-3b Branchenmodule). Die Registry steht
                       auf „geplant“; sichtbar sind nur die Modulzeilen, keine Moduloberfläche. Es wird nichts geschrieben.
     QUERSCHNITT=1     Bausteine des Querschnitts, Teil 1 (V4-3b): in „Betrieb“ (Rolle leitung) alle Inline-Stufen der
                       Seite (Rechte-Matrix, Farbpunkte, ab 1000 px das Kürzel der Seitenleiste) gegen V4_RADIEN, dazu die
                       Auswahlfläche des ersten Farbpunkts („Farbe von …“) (öffnen, messen, Bild, schließen ohne Wahl); in
                       „Qualifikationen“ das Hinweisfenster des ersten Diagrammbalkens (Maus darüber). Es wird nichts
                       geschrieben.
     QUERSCHNITT=2     wie QUERSCHNITT=1 und zusätzlich Teil 2 (V4-3b): in jeder Ansicht der Leitung jede Inline-Stufe
                       gegen V4_RADIEN; im Handbuch Haken-Knopf und Marken, Bild; dort die Schnellsuche (Strg + K) öffnen,
                       Esc-Taste (Radius, Höhe) und Treffersymbol messen, Bild, mit Escape schließen. Mit Rolle
                       betreiber: „Rechner“ (Ringregler) und „Mandanten“ → „Mandant anlegen“ bis Schritt 3
                       (Schrittleiste, Tageskacheln der ModellVorschau), Bild, Blatt ohne Anlegen schließen. Nur lesend.
   Browser: vorinstalliertes Playwright (playwright-core, playwright im Projekt
   oder global); chromium.launch() ohne Optionen. Es wird nichts installiert.
   Exit 0: keine Befunde · 1: Befunde · 2: Aufruf oder Umgebung · 3: Aufbau gescheitert
   ========================================================================== */
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { istLoopback, reflowOk, zielgroessenBefunde, fokusSichtbar, fokusNichtVerdeckt, fehlertextOk, zaehleBefunde } from "./abnahme-kern.mjs";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PORT || 3194);
const BASE = `http://127.0.0.1:${PORT}`;
if (!istLoopback(BASE)) { console.error("ABBRUCH: Ziel ist nicht die eigene Maschine."); process.exit(2); }

const ALLE = ["reflow", "ziele", "fokus", "fehler", "folge", "ki"];
const KRITERIEN = (process.argv[2] || ALLE.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
if (KRITERIEN.some((k) => !ALLE.includes(k)) || process.argv.length > 3) { console.error(`ABBRUCH: kriterien aus ${ALLE.join(", ")}`); process.exit(2); }
/* ROLLEN= (leer) mit EINSTIEG=1: nur der Einstieg ohne Anmeldung. */
const ROLLEN = (process.env.ROLLEN ?? "leitung,mitarbeiter").split(",").filter(Boolean);
const THEMEN = (process.env.THEMEN || "light,dark").split(",");
const BREITEN_REFLOW = (process.env.BREITEN_REFLOW || "320").split(",").map(Number);
const BILDER = path.resolve(WT, process.env.BILDER || "design/abnahme/v4-staging");
await mkdir(BILDER, { recursive: true });

/* ---------------------------------------------------------------- Playwright */
async function ladePlaywright() {
  const req = createRequire(import.meta.url);
  const wege = ["playwright-core", "playwright"];
  try { const g = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(); wege.push(path.join(g, "playwright"), path.join(g, "playwright-core")); } catch { /* kein npm */ }
  for (const w of wege) { try { const m = req(w); if (m && m.chromium) return m; } catch { /* nächster Weg */ } }
  return null;
}
const pw = await ladePlaywright();
if (!pw) { console.error("ABBRUCH: Playwright nicht gefunden (playwright-core, playwright oder global). Es wird nichts installiert."); process.exit(2); }
const { chromium } = pw;

/* ------------------------------------------------------------------ Befunde */
const befunde = [], hinweise = [], belege = [];
const melde = (k, text) => { befunde.push({ k, text }); console.log(`BEFUND [${k}] ${text}`); };
const hinweis = (k, text) => { hinweise.push({ k, text }); console.log(`HINWEIS [${k}] ${text}`); };
const beleg = (k, text) => { belege.push({ k, text }); console.log(`OK     [${k}] ${text}`); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
let geprueft = 0;

/* -------------------------------------------------------------- Bau + Server */
const aufraeumen = [];
let srv = null, kiServer = null;
async function ende(code) {
  try { if (srv) srv.kill(); } catch { /* weg */ }
  try { if (kiServer) kiServer.close(); } catch { /* weg */ }
  for (const d of aufraeumen) await rm(d, { recursive: true, force: true }).catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => ende(130));

let dist = process.env.DIST ? path.resolve(process.env.DIST) : null;
const braucheApp = KRITERIEN.some((k) => k !== "ki");
if (braucheApp && !dist) {
  dist = await mkdtemp(path.join(tmpdir(), "centric-v4-bau-")); aufraeumen.push(dist);
  try { execFileSync(process.execPath, [path.join(WT, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: WT, stdio: "ignore" }); }
  catch { console.error("ABBRUCH: vite build ist gescheitert (npm ci gelaufen?)."); await ende(3); }
}

const ADMIN = "lokal-" + randomBytes(12).toString("hex");   // nur für diesen Lauf, nie ausgegeben
const RAUM = "lokal-v4";
let xz = 0;
const j = async (p, b, t) => {
  const a = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) });
  return { s: a.status, d: await a.json().catch(() => ({})) };
};

let codes = null;
if (braucheApp) {
  const daten = await mkdtemp(path.join(tmpdir(), "centric-v4-daten-")); aufraeumen.push(daten);
  srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
    env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: dist, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
      CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development" } });
  let da = false;
  for (let i = 0; i < 60 && !da; i++) { try { da = (await fetch(BASE + "/gesund")).ok; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  if (!da) { console.error("ABBRUCH: lokaler Server startet nicht."); await ende(3); }
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  const person = (id, r, vn) => ({ id, vorname: vn, nachname: "Abnahme", rolle: r, bereich: "ALLE", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const { baueLeerenBetrieb } = await import(pathToFileURL(path.join(WT, "server/lib/leerbetrieb.mjs")).href);
  const voll = baueLeerenBetrieb({ name: "Abnahme Betrieb", branche: "pflege", email: null, land: "DE", raum: RAUM, laeuftAb: null });
  voll.mandanten[0].personen = [person("l", "leitung", "Lena"), person("p", "planer", "Paul"), person("m1", "mitarbeiter", "Mia"), person("m2", "mitarbeiter", "Max")];
  await j("/api/bestand-anlegen", { inhalt: voll }, bt);
  const z = await j("/api/zugaenge", { bestand: RAUM, eintraege: [
    { rolle: "leitung", personId: "l", name: "Lena" }, { rolle: "planer", personId: "p", name: "Paul" }, { rolle: "mitarbeiter", personId: "m1", name: "Mia" }] }, bt);
  if (!z.d.zugaenge) { console.error("ABBRUCH: Zugänge konnten nicht angelegt werden."); await ende(3); }
  /* betreiber: Betreiberkonsole (V4-3b); lokal ohne zweiten Faktor (NODE_ENV=development, Faktor nicht eingerichtet). */
  codes = { leitung: z.d.zugaenge[0].code, planer: z.d.zugaenge[1].code, mitarbeiter: z.d.zugaenge[2].code, betreiber: e.d.zugangscode };
}

const browser = await chromium.launch();

/* ---------------------------------------------------- Anmeldung und Navigation */
async function anmelden(rolle, breite, thema) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: breite < 700 ? 800 : 850 }, serviceWorkers: "block", colorScheme: thema, hasTouch: breite < 700 });
  const p = await ctx.newPage();
  const fehler = new Set();
  p.on("pageerror", (x) => fehler.add(`pageerror ${String(x).slice(0, 120)}`));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) fehler.add(`console ${m.text().slice(0, 120)}`); });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.locator("input").first().fill(codes[rolle]);
  await p.getByRole("button", { name: /anmelden/i }).first().click();
  await p.locator(".bpille, .tabbar button, .m-tabs button").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const zu = p.locator('[aria-label="Tour schließen"]');
  if (await zu.count()) await zu.first().click().catch(() => {});
  await p.waitForTimeout(300);
  return { ctx, p, fehler };
}

const texte = (p, sel) => p.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.offsetParent).map((e) => (e.innerText || "").trim().split("\n").filter(Boolean).reverse().join(" ")), sel);

/** Geht alle Ansichten durch und ruft je Ansicht fn(name). Breit: Bereichspillen und Unterreiter; schmal: untere Leiste und Schublade. */
async function alleAnsichten(p, marke, fn) {
  const gruppen = await texte(p, ".bpille");
  if (!gruppen.length) {
    const sel = (await p.locator(".m-tabs button:visible").count()) ? ".m-tabs button" : ".tabbar button";
    const leiste = await texte(p, sel);
    if (!leiste.length) melde("keine-navigation", `${marke}: weder Bereichspillen noch untere Leiste sichtbar`);
    for (let ti = 0; ti < leiste.length; ti++) {
      if (/(Post|Krank)/.test(leiste[ti])) continue;   // öffnen Dialoge
      await p.locator(sel + ":visible").nth(ti).click({ timeout: 4000 }).catch(() => melde("klick", `${marke} ${leiste[ti]}: Klick scheitert`));
      await p.waitForTimeout(900);
      await fn(`${marke} ${leiste[ti]}`);
    }
    const anzahl = await p.evaluate(() => document.querySelectorAll(".seitenleiste .slink").length);
    for (let si = 0; si < anzahl; si++) {
      if (!(await p.locator(".seitenleiste.offen").count())) await p.locator("header button").first().click({ timeout: 3000 }).catch(() => melde("klick", `${marke} Menüknopf: Klick scheitert`));
      await p.waitForTimeout(300);
      const name = await p.evaluate((i) => ((document.querySelectorAll(".seitenleiste .slink")[i] || {}).innerText || "").trim().split("\n")[0], si);
      await p.locator(".seitenleiste .slink").nth(si).click({ timeout: 3000 }).catch(() => melde("klick", `${marke} Schublade/${name}: Klick scheitert`));
      await p.waitForTimeout(900);
      await fn(`${marke} Schublade/${name}`);
    }
    return;
  }
  for (let gi = 0; gi < gruppen.length; gi++) {
    await p.locator(".bpille:visible").nth(gi).click({ timeout: 4000 }).catch(() => melde("klick", `${marke} Gruppe ${gruppen[gi]}: Klick scheitert`));
    await p.waitForTimeout(400);
    const tabs = await texte(p, ".utab");
    for (let ti = 0; ti < tabs.length; ti++) {
      await p.locator(".utab:visible").nth(ti).click({ timeout: 15000 }).catch(() => melde("klick", `${marke} ${gruppen[gi]}/${tabs[ti]}: Klick scheitert`));
      await p.waitForTimeout(900);
      await fn(`${marke} ${gruppen[gi]}/${tabs[ti]}`);
    }
  }
}

async function bild(p, name) {
  await p.screenshot({ path: path.join(BILDER, `${slug(name)}.png`) }).catch(() => {});
}

/* ---------------------------------------------------------- Messung je Ansicht */
const MESSEN = () => {
  const sichtbar = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const dok = document.documentElement;
  const quer = dok.scrollWidth - innerWidth;
  let taeter = "";
  if (quer > 1) {
    const geklemmt = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ov = getComputedStyle(a).overflowX; if (ov === "auto" || ov === "scroll" || ov === "hidden") return true; } return false; };
    const o = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !geklemmt(e); })
      .map((e) => ({ r: Math.round(e.getBoundingClientRect().right), t: `${e.tagName}.${String(e.className || "").slice(0, 24)}[${(e.innerText || "").trim().slice(0, 18).split("\n")[0]}]` }));
    if (!o.length) {   // alles liegt in einem Rollbereich: dann die am weitesten ragenden Elemente nennen
      for (const e of document.querySelectorAll("body *")) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > innerWidth + 1) o.push({ r: Math.round(r.right), t: `(geklemmt) ${e.tagName}.${String(e.className || "").slice(0, 24)}[${(e.innerText || "").trim().slice(0, 18).split("\n")[0]}] pos=${getComputedStyle(e).position}` }); }
    }
    taeter = o.sort((a, b) => b.r - a.r).slice(0, 3).map((x) => `${x.r} ${x.t}`).join(" ; ");
    /* Kette vom breitesten Element nach oben: wer ist selbst breiter als das Fenster, obwohl er rollt oder klemmt? */
    const breit = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().width > innerWidth + 1 && getComputedStyle(e).display !== "none")
      .map((e) => `${e.tagName}.${String(e.className || "").slice(0, 18)} w${Math.round(e.getBoundingClientRect().width)} ov=${getComputedStyle(e).overflowX} disp=${getComputedStyle(e).display}`).slice(0, 4);
    if (breit.length) taeter += " | breiter als Fenster: " + breit.join(" ; ");
  }
  const SEL = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], summary";
  const ziele = [...document.querySelectorAll(SEL)].filter((e) => sichtbar(e) && !e.closest("[inert], [aria-hidden=true]") && !e.disabled).map((e, i) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const fliess = e.tagName === "A" && cs.display === "inline" && [...(e.parentElement ? e.parentElement.childNodes : [])].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    return { id: `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}[${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 20).split("\n")[0]}]#${i}`,
      x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, inline: fliess };
  });
  return { quer, taeter, ziele, breite: innerWidth, gesamt: dok.scrollWidth };
};

/* V4-3b Import (IMPORT_BLATT=1): Das Blatt „Personal importieren“ ist keine Ansicht der Navigation. In der Ansicht
   Personal öffnet das Skript es über „Importieren“ und misst drei Zustände wie eine Ansicht (Reflow, Zielgröße, Bild):
   Eingabe, Vorschau mit dem Beispiel, Vorschau mit „mit anlegen“ (nur ein Haken in der Vorschau; es wird nichts
   übernommen). Dazu Fokus im Blatt per Tab (2.4.7/2.4.11). „Abbrechen“ schließt ohne Übernahme. */
async function importBlatt(p, ansicht, k) {
  const knopf = p.locator("main button:visible", { hasText: /^Importieren$/ }).first();
  if (!(await knopf.count())) { hinweis("import-blatt", `${ansicht}: kein Knopf „Importieren“ (Rolle ohne staff.edit?)`); return; }
  await knopf.click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Importieren scheitert`));
  const blatt = p.locator('[role=dialog][aria-label="Personal importieren"]');
  if (!(await blatt.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false))) { melde("import-blatt", `${ansicht}: Blatt öffnet nicht`); return; }
  const messe = async (zustand) => {
    const name = `${ansicht}/Import ${zustand}`;
    await p.waitForTimeout(400);
    geprueft++;
    const m = await p.evaluate(MESSEN);
    let schlecht = false;
    if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
    if (k.ziele) {
      const z = zielgroessenBefunde(m.ziele, 24);
      if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
    }
    const punkte = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] td > span")].filter((e) => e.style.width === "20px").length);
    if (!schlecht) beleg("import-blatt", `${name}: Reflow${k.ziele ? " und Zielgröße" : ""} ohne Befund${punkte ? `, ${punkte} Prüfpunkte` : ""}`);
    /* Bild mit den Prüfpunkten im Fenster (sie stehen unter der Spaltenzuordnung). */
    if (punkte) await p.evaluate(() => [...document.querySelectorAll("[role=dialog] td > span")].find((e) => e.style.width === "20px").scrollIntoView({ block: "center" }));
    if (schlecht || process.env.BILDER_ALLE) await bild(p, name);
  };
  await messe("Eingabe");
  await blatt.getByRole("button", { name: "Beispiel einfügen" }).click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Beispiel einfügen scheitert`));
  await blatt.getByRole("button", { name: "Prüfen", exact: true }).click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Prüfen scheitert`));
  await messe("Vorschau");
  const haken = blatt.getByRole("checkbox", { name: /mit anlegen/ });
  if (await haken.count()) { await haken.check({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Haken mit anlegen scheitert`)); await messe("Vorschau mit anlegen"); }
  /* Fokus im Blatt: Tab bleibt im Blatt, jeder Stopp sichtbar und nicht verdeckt. */
  let n = 0, ohneRing = 0, verdeckt = 0, draussen = 0;
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press("Tab");
    await p.waitForTimeout(120);
    const f = await p.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const treffer = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]]
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .map(([x, y]) => { const h = document.elementFromPoint(x, y); return { frei: !h || h === e || e.contains(h) || h.contains(e) }; });
      return { imBlatt: !!e.closest("[role=dialog]"), stil: { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow },
        treffer, draussen: r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth };
    });
    if (!f) continue;
    n++;
    if (!f.imBlatt) { melde("fokus", `${ansicht}/Import: Tab verlässt das Blatt`); break; }
    if (!fokusSichtbar(f.stil)) ohneRing++;
    if (f.draussen) draussen++; else if (!fokusNichtVerdeckt(f.treffer)) verdeckt++;
  }
  geprueft++;
  if (ohneRing || verdeckt) melde("fokus", `${ansicht}/Import: ${ohneRing} ohne Ring, ${verdeckt} verdeckt von ${n} Stopps`);
  else beleg("fokus", `${ansicht}/Import: ${n} Tab-Stopps im Blatt, Fokus sichtbar, nichts verdeckt${draussen ? ` (${draussen} außerhalb des Fensters, rollt beim Weiter-Tabben)` : ""}`);
  await blatt.getByRole("button", { name: "Abbrechen" }).click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Abbrechen scheitert`));
  await blatt.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("import-blatt", `${ansicht}: Blatt schließt nicht`));
}

/* V4-3b Telefonschale (TELEFON_BLATT=1): Die Blätter der Telefonschale (MBlatt, .m-blatt mit .m-griff) sind keine
   Ansicht der Navigation; alleAnsichten überspringt den Postknopf. Im Reiter „Heute“ öffnet das Skript das Blatt
   „Mitteilungen“ über den Postknopf der Kopfzeile und misst es wie eine Ansicht (Reflow, Zielgröße, Bild), dazu den
   berechneten Radius von Blatt und Griff und den Fokus per Tab im Blatt. Escape schließt; es wird nichts geändert
   (beim Schließen setzt die Schale Mitteilungen auf gelesen, wie bei jeder Nutzung; Wegwerfdaten). */
async function telefonBlatt(p, ansicht, k) {
  const knopf = p.locator(".m-postknopf:visible").first();
  if (!(await knopf.count())) { hinweis("telefon-blatt", `${ansicht}: kein Postknopf (keine Telefonschale?)`); return; }
  await knopf.click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Postknopf scheitert`));
  const blatt = p.locator('.m-blattrahmen[role=dialog][aria-label="Mitteilungen"]');
  if (!(await blatt.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false))) { melde("telefon-blatt", `${ansicht}: Blatt öffnet nicht`); return; }
  const name = `${ansicht}/Blatt Mitteilungen`;
  await p.waitForTimeout(400);
  geprueft++;
  const m = await p.evaluate(MESSEN);
  let schlecht = false;
  if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
  if (k.ziele) {
    const z = zielgroessenBefunde(m.ziele, 24);
    if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
  }
  const r = await p.evaluate(() => {
    const rad = (s) => { const e = document.querySelector(s); return e ? `${getComputedStyle(e).borderTopLeftRadius}/${getComputedStyle(e).borderBottomLeftRadius}` : null; };
    return { blatt: rad(".m-blatt"), griff: rad(".m-griff") };
  });
  if (!schlecht) beleg("telefon-blatt", `${name}: Reflow${k.ziele ? " und Zielgröße" : ""} ohne Befund; Radius Blatt ${r.blatt}, Griff ${r.griff}`);
  if (schlecht || process.env.BILDER_ALLE) await bild(p, name);
  let n = 0, ohneRing = 0, verdeckt = 0, draussen = 0;
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press("Tab");
    await p.waitForTimeout(120);
    const f = await p.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e), rr = e.getBoundingClientRect();
      const treffer = [[rr.left + rr.width / 2, rr.top + rr.height / 2], [rr.left + 2, rr.top + 2], [rr.right - 2, rr.bottom - 2]]
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
        .map(([x, y]) => { const h = document.elementFromPoint(x, y); return { frei: !h || h === e || e.contains(h) || h.contains(e) }; });
      return { imBlatt: !!e.closest("[role=dialog]"), stil: { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow },
        treffer, draussen: rr.bottom < 0 || rr.top > innerHeight || rr.right < 0 || rr.left > innerWidth, blattSelbst: e.classList.contains("m-blatt") };
    });
    if (!f) continue;
    if (f.blattSelbst) continue;   // Startpunkt des Fokus (tabIndex -1), kein Ziel
    n++;
    if (!f.imBlatt) { melde("fokus", `${name}: Tab verlässt das Blatt`); break; }
    if (!fokusSichtbar(f.stil)) ohneRing++;
    if (f.draussen) draussen++; else if (!fokusNichtVerdeckt(f.treffer)) verdeckt++;
  }
  geprueft++;
  if (ohneRing || verdeckt) melde("fokus", `${name}: ${ohneRing} ohne Ring, ${verdeckt} verdeckt von ${n} Stopps`);
  else if (n === 0) hinweis("fokus", `${name}: kein Tab-Stopp im Blatt`);
  else beleg("fokus", `${name}: ${n} Tab-Stopps im Blatt, Fokus sichtbar, nichts verdeckt${draussen ? ` (${draussen} außerhalb des Fensters)` : ""}`);
  await p.keyboard.press("Escape");
  await blatt.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("telefon-blatt", `${name}: Blatt schließt nicht mit Escape`));
}

/* V4-3b Speicherlage (SPEICHERLAGE=1): Die Leiste „Keine Verbindung“ (Offlineleiste, role=status) erscheint nur ohne
   Netz. Im Reiter „Heute“ schaltet das Skript den Browserkontext offline (Ereignis „offline“), misst die Seite mit der
   Leiste (Reflow, Zielgröße, Bild) und den berechneten Radius der Leiste (Stufe mittel), schaltet wieder online
   (Ereignis „online“) und erwartet, dass die Leiste verschwindet. Es wird nichts geschrieben. */
async function speicherLeiste(p, ansicht, k) {
  const { V4_RADIEN: R } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
  const ctx = p.context();
  const name = `${ansicht}/Leiste Keine Verbindung`;
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event("offline")));
  const leiste = p.getByRole("status").filter({ hasText: "Keine Verbindung" }).first();
  if (!(await leiste.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    melde("speicherlage", `${name}: Leiste erscheint nicht`);
  } else {
    await p.waitForTimeout(400);
    geprueft++;
    const m = await p.evaluate(MESSEN);
    let schlecht = false;
    if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
    if (k.ziele) {
      const z = zielgroessenBefunde(m.ziele, 24);
      if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
    }
    const r = await leiste.evaluate((e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius,
      hoehe: Math.round(e.getBoundingClientRect().height) }));
    if (r.inline !== "var(--v4-r-mittel)" || r.wert !== R.mittel) { schlecht = true; melde("radius", `${name}: Radius ${r.inline} = ${r.wert}, erwartet var(--v4-r-mittel) = ${R.mittel}`); }
    if (!schlecht) beleg("speicherlage", `${name}: Reflow${k.ziele ? " und Zielgröße" : ""} ohne Befund; Radius ${r.inline} = ${r.wert}, Höhe ${r.hoehe} px`);
    if (schlecht || process.env.BILDER_ALLE) { await leiste.scrollIntoViewIfNeeded().catch(() => {}); await bild(p, name); }
  }
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  if (!(await leiste.waitFor({ state: "detached", timeout: 10000 }).then(() => true).catch(() => false))) melde("speicherlage", `${name}: Leiste bleibt nach „online“ stehen`);
}

/* V4-3b Branchenmodule (BRANCHENMODULE=1): In der Ansicht „Betrieb“ der Leitung steht der Bereich „Branchenmodule“
   (src/module/kern.jsx) mit einer Modulzeile (article, Rahmen RAHMEN) je Modul. Die Moduloberflächen erscheinen erst mit
   einem eingeschalteten Modul; die Registry steht auf „geplant“, also nie im Browser. Gemessen werden Reflow, Zielgröße
   und der berechnete Radius aller Modulzeilen (Stufe klein); dazu ein Bild des Bereichs. Es wird nichts geschrieben. */
async function branchenBereich(p, ansicht, k) {
  const { V4_RADIEN: R } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
  const name = `${ansicht}/Branchenmodule`;
  const bereich = p.locator('section[aria-label="Branchenmodule"]').first();
  if (!(await bereich.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false))) {
    melde("branchenmodule", `${name}: Bereich fehlt`);
    return;
  }
  await bereich.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(300);
  geprueft++;
  const m = await p.evaluate(MESSEN);
  let schlecht = false;
  if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
  if (k.ziele) {
    const z = zielgroessenBefunde(m.ziele, 24);
    if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
  }
  const zeilen = await bereich.evaluate((b) => [...b.querySelectorAll("article")].map((e) => ({ inline: e.style.borderRadius,
    wert: getComputedStyle(e).borderTopLeftRadius, hoehe: Math.round(e.getBoundingClientRect().height) })));
  const falsch = zeilen.filter((r) => r.inline !== "var(--v4-r-klein)" || r.wert !== R.klein);
  if (!zeilen.length) { schlecht = true; melde("branchenmodule", `${name}: keine Modulzeile`); }
  if (falsch.length) { schlecht = true; melde("radius", `${name}: ${falsch.length} Modulzeilen nicht var(--v4-r-klein) = ${R.klein} (z. B. ${falsch[0].inline} = ${falsch[0].wert})`); }
  if (!schlecht) beleg("branchenmodule", `${name}: Reflow${k.ziele ? " und Zielgröße" : ""} ohne Befund; ${zeilen.length} Modulzeilen var(--v4-r-klein) = ${R.klein}, Höhe ${Math.min(...zeilen.map((z) => z.hoehe))}–${Math.max(...zeilen.map((z) => z.hoehe))} px`);
  if (schlecht || process.env.BILDER_ALLE) await bild(p, name);
}

/* V4-3b Querschnitt Teil 1 (QUERSCHNITT=1): Bausteine aus App.jsx, ui/farbwahl.jsx und ui/diagramme.jsx tragen jetzt
   Radiusstufen im Inline-Stil. Gemessen wird je Stelle die Stufe gegen den berechneten Radius (V4_RADIEN). Die
   Auswahlfläche eines Farbpunkts und das Hinweisfenster eines Balkens erscheinen erst auf Klick bzw. Maus; das Skript
   öffnet sie, misst, macht ein Bild und schließt (Klick auf den Punkt, Maus weg). Keine Farbe wird gewählt. */
async function querschnittBausteine(p, ansicht, k) {
  const { V4_RADIEN: R } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
  /* Wie STUFEN_MESSEN (weiter unten, beim Ablauf hier noch nicht definiert): Stufe und berechneter Radius je Stelle. */
  const stufenMessen = () => [...document.querySelectorAll('[style*="--v4-r-"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
    const cs = getComputedStyle(e);
    const stufe = (e.getAttribute("style").match(/--v4-r-([a-z]+)/) || [])[1];
    const ecke = /--v4-r-/.test(e.style.borderTopLeftRadius) ? cs.borderTopLeftRadius : cs.borderTopRightRadius;
    return { stufe, wert: ecke, text: (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24).split("\n")[0] };
  });
  const pruefeStufen = async (name, art) => {
    const st = await p.evaluate(stufenMessen);
    const falsch = st.filter((s) => R[s.stufe] !== s.wert);
    if (falsch.length) melde("radius", `${name}: ${falsch.length} Stellen mit falschem Radius (z. B. ${falsch[0].stufe} = ${falsch[0].wert}, ${falsch[0].text})`);
    const je = {};
    for (const s of st) je[s.stufe] = (je[s.stufe] || 0) + 1;
    if (!falsch.length) beleg("querschnitt", `${name}: ${art}${st.length} Inline-Stufen = V4_RADIEN (${Object.entries(je).map(([a, n]) => `${a} ${n}`).join(", ")})`);
    return st;
  };
  if (/Betrieb$/.test(ansicht)) {
    await pruefeStufen(ansicht, "");
    const punkt = p.locator('button[aria-expanded][title^="Farbe von "]:visible').first();
    if (!(await punkt.count())) { hinweis("querschnitt", `${ansicht}: kein Farbpunkt sichtbar`); return; }
    await punkt.scrollIntoViewIfNeeded().catch(() => {});
    await punkt.click({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Farbpunkt scheitert`));
    const gruppe = p.getByRole("group", { name: "Farbe wählen" }).first();
    if (!(await gruppe.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false))) { melde("querschnitt", `${ansicht}: Auswahlfläche öffnet nicht`); return; }
    const name = `${ansicht}/Farbauswahl`;
    await p.waitForTimeout(300);
    geprueft++;
    const m = await p.evaluate(MESSEN);
    if (k.reflow && !reflowOk(m.gesamt, m.breite)) melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`);
    const flaeche = await gruppe.evaluate((g) => { const e = g.parentElement; return { inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius }; });
    if (flaeche.inline !== "var(--v4-r-mittel)" || flaeche.wert !== R.mittel) melde("radius", `${name}: Auswahlfläche ${flaeche.inline} = ${flaeche.wert}`);
    else beleg("querschnitt", `${name}: Auswahlfläche ${flaeche.inline} = ${flaeche.wert}`);
    await pruefeStufen(name, "mit Auswahlfläche ");
    await bild(p, name);
    await punkt.click({ timeout: 4000 }).catch(() => melde("klick", `${name}: Schließen scheitert`));
    await gruppe.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("querschnitt", `${name}: Auswahlfläche schließt nicht`));
  }
  if (/Qualifikationen$/.test(ansicht)) {
    const balken = p.locator('div[style*="5px 5px 2px 2px"]').first();
    if (!(await balken.count())) { hinweis("querschnitt", `${ansicht}: kein Diagrammbalken`); return; }
    await balken.scrollIntoViewIfNeeded().catch(() => {});
    await balken.hover({ timeout: 4000 }).catch(() => melde("klick", `${ansicht}: Maus über Balken scheitert`));
    const fenster = balken.locator('div[style*="--v4-r-klein"]').first();
    if (!(await fenster.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false))) { melde("querschnitt", `${ansicht}: Hinweisfenster erscheint nicht`); return; }
    const name = `${ansicht}/Hinweisfenster Balken`;
    geprueft++;
    const r = await fenster.evaluate((e) => ({ wert: getComputedStyle(e).borderTopLeftRadius, text: e.innerText.trim().slice(0, 30) }));
    const b = await balken.evaluate((e) => ({ oben: getComputedStyle(e).borderTopLeftRadius, unten: getComputedStyle(e).borderBottomLeftRadius }));
    if (r.wert !== R.klein) melde("radius", `${name}: ${r.wert}, erwartet ${R.klein}`);
    else beleg("querschnitt", `${name}: Hinweisfenster var(--v4-r-klein) = ${r.wert} („${r.text}“); Balken bleibt ${b.oben}/${b.unten} (Ausnahme)`);
    await bild(p, name);
    await p.mouse.move(1, 1);
  }
}

/* V4-3b Querschnitt Teil 2 (QUERSCHNITT=2): Bausteine aus handbuch, kommandoleiste, tourleiste, ringregler,
   ui/bausteine, ui/leisten, ui/ziehen und schrittleiste tragen Radiusstufen im Inline-Stil. In jeder Ansicht der Leitung
   wird jede Inline-Stufe gegen V4_RADIEN gemessen (Leerzustand, Balken, wo sie erscheinen). Im Handbuch zusätzlich:
   Haken-Knopf (26×26 klein), Marken (22×22 pille), Bild; dann die Schnellsuche (Strg + K) öffnen, Esc-Taste (klein,
   Höhe) und Treffersymbol (27×27 klein) messen, Bild, mit Escape schließen. Es wird nichts geschrieben. */
async function querschnittTeil2(p, ansicht, k) {
  const { V4_RADIEN: R } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
  const messen = () => [...document.querySelectorAll('[style*="--v4-r-"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
    const stufe = (e.getAttribute("style").match(/--v4-r-([a-z]+)/) || [])[1];
    const cs = getComputedStyle(e);
    return { stufe, wert: /--v4-r-/.test(e.style.borderTopLeftRadius) ? cs.borderTopLeftRadius : cs.borderTopRightRadius };
  });
  const st = await p.evaluate(messen);
  const falsch = st.filter((s) => R[s.stufe] !== s.wert);
  if (falsch.length) melde("radius", `${ansicht}: ${falsch.length} Stellen mit falschem Radius (z. B. ${falsch[0].stufe} = ${falsch[0].wert})`);
  if (!/Handbuch$/.test(ansicht)) return;
  const je = {};
  for (const s of st) je[s.stufe] = (je[s.stufe] || 0) + 1;
  const mass = (e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius,
    b: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) });
  const haken = p.getByRole("button", { name: /^Als (erledigt|ungelesen) markieren$/ }).first();
  if (!(await haken.count())) { melde("querschnitt", `${ansicht}: kein Haken-Knopf`); return; }
  const h = await haken.evaluate(mass);
  const marken = await p.evaluate(() => [...document.querySelectorAll('span[style*="--v4-r-pille"]')]
    .filter((x) => Math.round(x.getBoundingClientRect().width) === 22).map((x) => getComputedStyle(x).borderTopLeftRadius));
  if (h.wert !== R.klein || h.b !== 26 || !marken.length || marken.some((m) => m !== R.pille))
    melde("radius", `${ansicht}: Haken ${h.inline} = ${h.wert} (${h.b}×${h.h}), Marken ${[...new Set(marken)].join("/")}`);
  else beleg("querschnitt2", `${ansicht}: ${st.length} Inline-Stufen = V4_RADIEN (${Object.entries(je).map(([a, n]) => `${a} ${n}`).join(", ")}); Haken 26×26 = ${h.wert}, ${marken.length} Marken 22×22 = ${R.pille}`);
  await bild(p, ansicht);
  await p.keyboard.press("Control+k");
  const dialog = p.getByRole("dialog", { name: "Schnellsuche" });
  if (!(await dialog.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false))) { melde("querschnitt", `${ansicht}: Schnellsuche öffnet nicht`); return; }
  const name = `${ansicht}/Schnellsuche`;
  await p.keyboard.type("Hand");
  await p.waitForTimeout(300);
  geprueft++;
  const m = await p.evaluate(MESSEN);
  if (k.reflow && !reflowOk(m.gesamt, m.breite)) melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`);
  const esc = await dialog.locator("kbd", { hasText: "Esc" }).evaluate(mass);
  const sym = await dialog.getByRole("option").first().locator("span").first().evaluate(mass).catch(() => null);
  if (esc.wert !== R.klein || esc.h <= 16 || !sym || sym.wert !== R.klein || sym.b !== 27)
    melde("radius", `${name}: Esc ${esc.wert} (${esc.b}×${esc.h}), Symbol ${sym ? `${sym.wert} (${sym.b}×${sym.h})` : "fehlt"}`);
  else beleg("querschnitt2", `${name}: Esc ${esc.inline} = ${esc.wert} bei ${esc.b}×${esc.h} px (8 < ${esc.h / 2}); Treffersymbol ${sym.b}×${sym.h} = ${sym.wert}`);
  await bild(p, name);
  await p.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("querschnitt", `${name}: Schnellsuche schließt nicht`));
}

/* QUERSCHNITT=2, Rolle betreiber: „Rechner“ (Ringregler: Ring pille, Tasten 34×34 klein) und „Mandanten“ →
   „Mandant anlegen“ bis Schritt 3 (Schrittleiste: Marken 26×26 pille; ModellVorschau des gewählten Modells: Tageskacheln
   17×17 klein, Review #466 H2). Der Name wird nur im Formular eingetragen; das Blatt wird ohne Anlegen geschlossen
   (Escape). Es wird nichts geschrieben. */
async function querschnittTeil2Betreiber(p, ansicht, k) {
  const { V4_RADIEN: R } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
  const radienVon = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius,
      b: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })), sel);
  const gleich = (liste, inline, wert, b) => liste.length > 0 && liste.every((x) => x.inline === inline && x.wert === wert && (!b || x.b === b));
  if (/Rechner$/.test(ansicht)) {
    const ring = await radienVon('[role="slider"]');
    const tasten = await radienVon('button[title$="verringern"], button[title$="erhöhen"]');
    if (!gleich(ring, "var(--v4-r-pille)", R.pille) || !gleich(tasten, "var(--v4-r-klein)", R.klein, 34))
      melde("radius", `${ansicht}: Ring ${JSON.stringify(ring[0] || null)}, Tasten ${JSON.stringify(tasten[0] || null)}`);
    else beleg("querschnitt2", `${ansicht}: ${ring.length} Ringe = ${R.pille} (${ring[0].b}×${ring[0].h}), ${tasten.length} Tasten 34×34 = ${R.klein}`);
    await bild(p, `${ansicht}/Ringregler`);
    return;
  }
  if (!/Mandanten$/.test(ansicht)) return;
  const knopf = p.getByRole("button", { name: "Mandant anlegen" }).first();
  if (!(await knopf.count())) { hinweis("querschnitt2", `${ansicht}: kein Knopf „Mandant anlegen“`); return; }
  await knopf.click({ timeout: 4000 });
  const blatt = p.getByRole("dialog", { name: /Neuen Mandanten einrichten/ }).first();
  if (!(await blatt.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false))) { melde("querschnitt2", `${ansicht}: Blatt öffnet nicht`); return; }
  await blatt.getByPlaceholder("z. B. Wachdienst Süd GmbH").fill("Abnahme Testbetrieb");
  for (let i = 0; i < 2; i++) { await blatt.getByRole("button", { name: "Weiter" }).first().click({ timeout: 4000 }); await p.waitForTimeout(250); }
  const name = `${ansicht}/Mandant anlegen, Schritt 3`;
  geprueft++;
  const m = await p.evaluate(MESSEN);
  if (k.reflow && !reflowOk(m.gesamt, m.breite)) melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`);
  const marken = (await radienVon('.reiterreihe span[style*="--v4-r-"]')).filter((x) => x.b === 26);
  const kacheln = (await radienVon('div[style*="--v4-r-klein"]')).filter((x) => x.b === 17 && x.h === 17);
  if (!gleich(marken, "var(--v4-r-pille)", R.pille) || !gleich(kacheln, "var(--v4-r-klein)", R.klein))
    melde("radius", `${name}: Marken ${marken.length} ${JSON.stringify(marken[0] || null)}, Tageskacheln ${kacheln.length} ${JSON.stringify(kacheln[0] || null)}`);
  else beleg("querschnitt2", `${name}: ${marken.length} Schrittmarken 26×26 = ${R.pille}; ${kacheln.length} Tageskacheln der ModellVorschau 17×17 = ${R.klein} (Teil 1, H2)`);
  await bild(p, name);
  await p.keyboard.press("Escape");
  await blatt.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("querschnitt2", `${name}: Blatt schließt nicht`));
}

/* ===================================================== 1 + 2  Reflow, Zielgröße */
if (KRITERIEN.includes("reflow") || KRITERIEN.includes("ziele")) {
  const konfig = [];
  if (KRITERIEN.includes("reflow")) for (const w of BREITEN_REFLOW) for (const t of THEMEN) konfig.push({ w, t, reflow: true, ziele: false });
  if (KRITERIEN.includes("ziele")) { const hit = konfig.find((k) => k.w === 390 && k.t === "light"); if (hit) hit.ziele = true; else konfig.push({ w: 390, t: "light", reflow: false, ziele: true }); }
  for (const rolle of ROLLEN) for (const k of konfig) {
    const { ctx, p, fehler } = await anmelden(rolle, k.w, k.t);
    const marke = `${rolle}@${k.w}/${k.t}`;
    let ansichten = 0, zielAnzahl = 0, kleinste = null;
    await alleAnsichten(p, marke, async (name) => {
      if (process.env.NUR && !name.includes(process.env.NUR)) return;
      ansichten++; geprueft++;
      const m = await p.evaluate(MESSEN);
      let schlecht = false;
      zielAnzahl += m.ziele.length;
      for (const z of m.ziele) if (!kleinste || Math.min(z.w, z.h) < Math.min(kleinste.w, kleinste.h)) kleinste = z;
      if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
      if (k.ziele) {
        const z = zielgroessenBefunde(m.ziele, 24);
        if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
      }
      if (schlecht || process.env.BILDER_ALLE) await bild(p, `${name}`);
      if (process.env.IMPORT_BLATT && /Personal$/.test(name)) await importBlatt(p, name, k);
      if (process.env.TELEFON_BLATT && /Heute$/.test(name)) await telefonBlatt(p, name, k);
      if (process.env.SPEICHERLAGE && /Heute$/.test(name)) await speicherLeiste(p, name, k);
      if (process.env.BRANCHENMODULE && rolle === "leitung" && /Betrieb$/.test(name)) await branchenBereich(p, name, k);
      if (process.env.QUERSCHNITT && rolle === "leitung" && /(Betrieb|Qualifikationen)$/.test(name)) await querschnittBausteine(p, name, k);
      if (process.env.QUERSCHNITT === "2" && rolle === "leitung") await querschnittTeil2(p, name, k);
      if (process.env.QUERSCHNITT === "2" && rolle === "betreiber") await querschnittTeil2Betreiber(p, name, k);
    });
    for (const f of fehler) melde("konsole", `${marke}: ${f}`);
    if (ansichten === 0) melde("keine-ansicht", `${marke}: keine Ansicht erreicht`);
    else beleg("ansichten", `${marke}: ${ansichten} Ansichten gemessen${k.ziele ? `, ${zielAnzahl} Ziele, kleinstes ${kleinste ? `${Math.round(kleinste.w)}x${Math.round(kleinste.h)} (${kleinste.id})` : "–"}` : ""}`);
    await ctx.close();
  }
}

/* ======================================== 1b  Einstieg ohne Anmeldung (EINSTIEG=1, V4-3b Einstieg) */
/* Erfundene Testdaten: zwei Demo-Einträge (GET /api/demos) und die Antworten auf „Betrieb anlegen“ (POST /starten:
   erst ein Fehler, dann ein angelegter Testbetrieb mit erfundenen Codes). Der Browser beantwortet beide selbst; der
   Server sieht keine Registrierung. Kein Code wird abgeschickt, kein Demozugang geöffnet. */
const TEST_DEMOS = [
  { id: "abnahme-1", name: "Testbetrieb", rolle: "leitung", gruppe: "Testdaten", bestand: "abnahme", betrieb: 0, hinweis: "Erfundener Testzugang der Abnahme" },
  { id: "abnahme-2", name: "Testbetrieb", rolle: "mitarbeiter", gruppe: "Testdaten", bestand: "abnahme", betrieb: 0, hinweis: "Erfundener Testzugang der Abnahme" },
];
const TEST_START = { zugaenge: [{ rolle: "leitung", code: "TEST-0000-0001" }, { rolle: "mitarbeiter", code: "TEST-0000-0002" }], testtage: 30 };
const rgbaTeile = (s) => (String(s).match(/[\d.]+/g) || []).map(Number);
const gleicheFarbe = (a, b) => { const x = rgbaTeile(a), y = rgbaTeile(b); return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 0.01); };

/** Stellen mit Radiusstufe im Inline-Stil: Stufe und berechneter Radius der ersten gesetzten Ecke. */
const STUFEN_MESSEN = () => [...document.querySelectorAll('[style*="--v4-r-"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
  const cs = getComputedStyle(e);
  const stufe = (e.getAttribute("style").match(/--v4-r-([a-z]+)/) || [])[1];
  const ecke = /--v4-r-/.test(e.style.borderTopLeftRadius) ? cs.borderTopLeftRadius : cs.borderTopRightRadius;
  return { stufe, wert: ecke, text: (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24).split("\n")[0] };
});

async function einstiegSeite(w, t) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 850 }, serviceWorkers: "block", colorScheme: t, hasTouch: w < 700 });
  const p = await ctx.newPage();
  const fehler = new Set();
  p.on("pageerror", (x) => fehler.add(`pageerror ${String(x).slice(0, 120)}`));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) fehler.add(`console ${m.text().slice(0, 120)}`); });
  let starten = 0;
  await p.route("**/api/demos", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ demos: TEST_DEMOS }) }));
  await p.route("**/starten", (r) => {
    if (r.request().method() !== "POST") return r.continue();
    starten++;
    return starten === 1
      ? r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ text: "Testantwort der Abnahme: nicht angelegt." }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_START) });
  });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Selbst starten" }).waitFor({ state: "visible", timeout: 20000 });
  await p.waitForTimeout(2500);   // Startsequenz (Startbild) ausklingen lassen
  return { ctx, p, fehler };
}

async function einstiegZustand(p, name, k) {
  await p.waitForTimeout(450);
  geprueft++;
  const m = await p.evaluate(MESSEN);
  let schlecht = false;
  if (k.reflow && !reflowOk(m.gesamt, m.breite)) { schlecht = true; melde("reflow", `${name}: Seite ${m.gesamt - m.breite}px breiter als ${m.breite}px — ${m.taeter}`); }
  if (k.ziele) {
    const z = zielgroessenBefunde(m.ziele, 24);
    if (z.length) { schlecht = true; melde("zielgroesse", `${name}: ${z.length} Ziele unter 24 px ohne Abstandsausnahme (z. B. ${z.slice(0, 3).map((x) => `${x.id} ${Math.round(x.w)}x${Math.round(x.h)}`).join("; ")})`); }
  }
  const st = await p.evaluate(STUFEN_MESSEN);
  const falsch = st.filter((x) => x.wert !== V4_RADIEN[x.stufe]);
  if (falsch.length) { schlecht = true; melde("radius", `${name}: ${falsch.length} von ${st.length} Stellen nicht im Radius ihrer Stufe (${falsch.slice(0, 3).map((x) => `${x.text} ${x.stufe} ${x.wert}`).join("; ")})`); }
  if (!schlecht) beleg("einstieg", `${name}: Reflow${k.ziele ? " und Zielgröße" : ""} ohne Befund; ${st.length} Stellen mit Radiusstufe, alle gleich V4_RADIEN${k.ziele ? `; ${m.ziele.length} Ziele` : ""}`);
  if (schlecht || process.env.BILDER_ALLE) await bild(p, name);
}

const { V4_RADIEN, V4_UEBERLAGERUNG } = await import(pathToFileURL(path.join(WT, "src", "v4", "tokens.js")).href);
if (process.env.EINSTIEG && (KRITERIEN.includes("reflow") || KRITERIEN.includes("ziele"))) {
  const konfig = [];
  if (KRITERIEN.includes("reflow")) for (const w of BREITEN_REFLOW) for (const t of THEMEN) konfig.push({ w, t, reflow: true, ziele: false });
  if (KRITERIEN.includes("ziele")) { const hit = konfig.find((k) => k.w === 390 && k.t === "light"); if (hit) hit.ziele = true; else konfig.push({ w: 390, t: "light", reflow: false, ziele: true }); }
  for (const k of konfig) {
    const { ctx, p, fehler } = await einstiegSeite(k.w, k.t);
    const marke = `einstieg@${k.w}/${k.t}`;
    const klick = async (loc, was) => { await loc.first().click({ timeout: 5000 }).catch(() => melde("klick", `${marke}: ${was} scheitert`)); };
    await einstiegZustand(p, `${marke} Start`, k);
    await klick(p.getByRole("button", { name: /Was kostet das/ }), "Was kostet das?");
    await einstiegZustand(p, `${marke} Preise`, k);
    await klick(p.getByRole("button", { name: "Zurück", exact: true }), "Zurück (Preise)");
    await klick(p.getByRole("button", { name: "Selbst starten" }), "Selbst starten");
    await einstiegZustand(p, `${marke} Registrierung`, k);
    await p.locator("#betrieb-name").fill("Abnahme Testbetrieb").catch(() => melde("klick", `${marke}: Betriebsname scheitert`));
    await klick(p.locator("button[aria-pressed]", { hasText: "Pflege" }), "Branche Pflege");
    await klick(p.getByRole("button", { name: "Betrieb anlegen", exact: true }), "Betrieb anlegen (Fehler)");
    await p.locator('[role="alert"]').first().waitFor({ state: "visible", timeout: 5000 }).catch(() => melde("einstieg", `${marke}: Fehlermeldung der Registrierung erscheint nicht`));
    await einstiegZustand(p, `${marke} Registrierung Fehler`, k);
    await klick(p.getByRole("button", { name: "Betrieb anlegen", exact: true }), "Betrieb anlegen (fertig)");
    await p.getByText("TEST-0000-0001").waitFor({ state: "visible", timeout: 5000 }).catch(() => melde("einstieg", `${marke}: Registrierung fertig erscheint nicht`));
    await einstiegZustand(p, `${marke} Registrierung fertig`, k);
    await klick(p.getByRole("button", { name: "Mit der Organisationsleitung anmelden" }), "Mit der Organisationsleitung anmelden");
    await p.locator("#code").waitFor({ state: "visible", timeout: 5000 }).catch(() => melde("einstieg", `${marke}: Anmeldung mit Code erscheint nicht`));
    await einstiegZustand(p, `${marke} Anmeldung mit Code`, k);
    await klick(p.getByRole("button", { name: "Zweiten Faktor einrichten oder verwalten" }), "Zweiten Faktor einrichten");
    await einstiegZustand(p, `${marke} Zweiter Faktor`, k);
    await klick(p.getByRole("button", { name: "Impressum", exact: true }), "Impressum");
    const dlg = p.getByRole("dialog", { name: "Rechtliche Angaben" });
    if (await dlg.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) {
      await einstiegZustand(p, `${marke} Rechtsfenster`, k);
      const r = await p.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-label="Rechtliche Angaben"]');
        const codes = [...d.querySelectorAll("code")].map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10);
        return { grund: getComputedStyle(d).backgroundColor, codes, codeRadius: d.querySelector("code") ? getComputedStyle(d.querySelector("code")).borderTopLeftRadius : null };
      });
      const soll = V4_UEBERLAGERUNG[k.t === "dark" ? "dunkel" : "hell"];
      if (!gleicheFarbe(r.grund, soll)) melde("einstieg", `${marke} Rechtsfenster: Überlagerung ${r.grund}, erwartet ${soll}`);
      else beleg("einstieg", `${marke} Rechtsfenster: Überlagerung ${r.grund} (V4_UEBERLAGERUNG); Code-Auszeichnung ${r.codes.length}× Höhe ${r.codes.join("/")} px, Radius ${r.codeRadius} (Ausnahme)`);
      await p.keyboard.press("Escape");
      await dlg.waitFor({ state: "hidden", timeout: 5000 }).catch(() => melde("einstieg", `${marke}: Rechtsfenster schließt nicht mit Escape`));
    } else melde("einstieg", `${marke}: Rechtsfenster öffnet nicht`);
    for (const f of fehler) melde("konsole", `${marke}: ${f}`);
    await ctx.close();
  }
}
if (process.env.EINSTIEG && KRITERIEN.includes("fokus")) {
  for (const w of [1280, 320]) {
    const { ctx, p } = await einstiegSeite(w, "light");
    for (const zustand of ["Start", "Registrierung"]) {
      const marke = `einstieg@${w} ${zustand}`;
      if (zustand === "Registrierung") await p.getByRole("button", { name: "Selbst starten" }).first().click({ timeout: 5000 }).catch(() => melde("klick", `${marke}: Selbst starten scheitert`));
      await p.waitForTimeout(400);
      await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
      let n = 0, ohneRing = 0, verdeckt = 0, draussen = 0; const beisp = [];
      for (let i = 0; i < 30; i++) {
        await p.keyboard.press("Tab");
        await p.waitForTimeout(200);
        const f = await p.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body || e === document.documentElement) return null;
          const cs = getComputedStyle(e), r = e.getBoundingClientRect();
          const treffer = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]]
            .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
            .map(([x, y]) => { const h = document.elementFromPoint(x, y); return { frei: !h || h === e || e.contains(h) || h.contains(e) }; });
          return { name: `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 20).split("\n")[0]}]`,
            stil: { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow },
            treffer, draussen: r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth };
        });
        if (!f) continue;
        n++;
        if (!fokusSichtbar(f.stil)) { ohneRing++; if (beisp.length < 3) beisp.push(f.name); }
        if (f.draussen) draussen++; else if (!fokusNichtVerdeckt(f.treffer)) { verdeckt++; if (beisp.length < 6) beisp.push(`${f.name} verdeckt`); }
      }
      geprueft++;
      if (n < 5) melde("fokus", `${marke}: nur ${n} Tab-Stopps erreicht`);
      if (ohneRing) melde("fokus-sichtbar", `${marke}: ${ohneRing} von ${n} ohne sichtbaren Fokus (z. B. ${beisp.join("; ")})`);
      if (verdeckt) melde("fokus-verdeckt", `${marke}: ${verdeckt} von ${n} verdeckt (z. B. ${beisp.join("; ")})`);
      if (n >= 5 && !ohneRing && !verdeckt) beleg("fokus", `${marke}: ${n} Tab-Stopps, Fokus sichtbar, nichts verdeckt${draussen ? ` (${draussen} außerhalb des Fensters, rollt beim Weiter-Tabben)` : ""}`);
      await bild(p, `fokus-${marke}`);
    }
    await ctx.close();
  }
}

/* ================================================== 3  Fokus sichtbar, nicht verdeckt */
if (KRITERIEN.includes("fokus")) {
  for (const rolle of ROLLEN) for (const w of [1280, 320]) {
    const { ctx, p } = await anmelden(rolle, w, "light");
    const marke = `${rolle}@${w}`;
    await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    let n = 0, ohneRing = 0, verdeckt = 0, draussen = 0; const beisp = [], aussen = [];
    for (let i = 0; i < 45; i++) {
      await p.keyboard.press("Tab");
      await p.waitForTimeout(260);   // Übergänge (z. B. Sprunglink) ausklingen lassen
      const f = await p.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body || e === document.documentElement) return null;
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        const treffer = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
          .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
          .map(([x, y]) => { const h = document.elementFromPoint(x, y); return { frei: !h || h === e || e.contains(h) || h.contains(e) }; });
        return { name: `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 20).split("\n")[0]}]`,
          stil: { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow },
          lage: `(x ${Math.round(r.left)}..${Math.round(r.right)}, y ${Math.round(r.top)}..${Math.round(r.bottom)}, in ${e.closest("[class]") ? String(e.closest("[class]").className).slice(0, 24) : "-"})`,
          treffer, draussen: r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth };
      });
      if (!f) continue;
      n++;
      if (!fokusSichtbar(f.stil)) { ohneRing++; if (beisp.length < 3) beisp.push(f.name); }
      if (f.draussen) { draussen++; if (aussen.length < 4) aussen.push(f.name + " " + f.lage); }
      else if (!fokusNichtVerdeckt(f.treffer)) { verdeckt++; if (beisp.length < 6) beisp.push(`${f.name} verdeckt`); }
    }
    geprueft++;
    if (n < 5) melde("fokus", `${marke}: nur ${n} Tab-Stopps erreicht (Tastaturbedienung der Startansicht prüfen)`);
    if (ohneRing) melde("fokus-sichtbar", `${marke}: ${ohneRing} von ${n} Elementen ohne sichtbaren Fokusindikator (z. B. ${beisp.join("; ")})`);
    if (verdeckt) melde("fokus-verdeckt", `${marke}: ${verdeckt} von ${n} fokussierten Elementen von festen Inhalten verdeckt (z. B. ${beisp.join("; ")})`);
    if (draussen) melde("fokus-draussen", `${marke}: ${draussen} fokussierte Elemente außerhalb des sichtbaren Bereichs (z. B. ${aussen.join("; ")})`);
    if (n >= 5 && !ohneRing && !verdeckt && !draussen) beleg("fokus", `${marke}: ${n} Tab-Stopps, überall sichtbarer Fokus, nichts verdeckt`);
    await bild(p, `fokus-${marke}`);
    await ctx.close();
  }
}

/* ============================================================ 4  Fehlertext 3.3.1 */
if (KRITERIEN.includes("fehler")) {
  for (const w of [320, 1280]) for (const t of THEMEN) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: "block", colorScheme: t });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    const feld = p.locator("input").first();
    await feld.fill("ZZZZ-ZZZZ-ZZZZ");
    await p.getByRole("button", { name: /anmelden/i }).first().click();
    await p.locator('[role="alert"]').first().waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    const m = await p.evaluate(() => {
      const al = [...document.querySelectorAll('[role="alert"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const f = document.querySelector("input");
      const r0 = al[0] ? al[0].getBoundingClientRect() : null;
      return { texte: al.map((e) => e.innerText), imBild: r0 ? r0.left >= 0 && r0.right <= innerWidth + 1 : null,
        invalid: f ? f.getAttribute("aria-invalid") : null, beschreibt: f ? f.getAttribute("aria-describedby") : null, quer: document.documentElement.scrollWidth - innerWidth };
    });
    geprueft++;
    const marke = `Anmeldung@${w}/${t}`;
    if (!fehlertextOk(m.texte)) melde("fehlertext", `${marke}: kein sichtbarer Fehlertext in role=alert nach falschem Zugangscode (${JSON.stringify(m.texte)})`);
    else if (m.imBild === false) melde("fehlertext", `${marke}: Fehlertext ragt aus dem Fenster`);
    else beleg("fehlertext", `${marke}: Fehler als Text in role=alert („${m.texte[0].replace(/\s+/g, " ").slice(0, 70)}“)`);
    if (m.quer > 1) melde("reflow", `${marke}: Seite mit Fehlertext ${m.quer}px breiter als das Fenster`);
    if (!m.invalid && !m.beschreibt) hinweis("fehlertext-verbindung", `${marke}: Feld trägt weder aria-invalid noch aria-describedby (WP-40, Frage 2: bekannt, kein Fehlschlag von 3.3.1)`);
    await bild(p, `fehler-${marke}`);
    await ctx.close();
  }
}

/* ===================================================== 5  Schichtfolge (WP-I2) */
if (KRITERIEN.includes("folge")) {
  const { ctx, p, fehler } = await anmelden("leitung", 1280, "light");
  try {
    await p.locator(".bpille:visible", { hasText: "Planen" }).first().click({ timeout: 5000 });
    await p.waitForTimeout(300);
    await p.locator(".utab:visible", { hasText: "Schichtfolge" }).first().click({ timeout: 5000 });
    await p.waitForTimeout(1000);
    const status = () => p.evaluate(() => { const e = [...document.querySelectorAll('[role="status"]')].find((x) => /Live-Prüfung/.test(x.innerText)); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; });
    const vorher = await status();
    geprueft++;
    if (vorher === null) melde("schichtfolge", "Bereich „Live-Prüfung“ (role=status) fehlt in der Schichtfolge");
    else {
      beleg("schichtfolge", `Live-Prüfung vorhanden: „${vorher.slice(0, 90)}…“`);
      const chips = await p.evaluate(() => [...document.querySelectorAll("button.chip[aria-pressed]")].map((b) => b.innerText.trim()));
      const nacht = chips.find((c) => /^N/i.test(c)), frueh = chips.find((c) => /^F/i.test(c));
      if (!nacht || !frueh) hinweis("schichtfolge", `Dienstkürzel nicht eindeutig (${chips.join(",")}); Ruhezeit-Szenario nicht herstellbar`);
      else {
        /* Ruhezeitverstoß provozieren: Nachtdienst, am Folgetag Frühdienst, in jeder Woche des Rasters. */
        let wochen = await p.evaluate(() => new Set([...document.querySelectorAll('[aria-label^="Woche "]')].map((e) => e.getAttribute("aria-label").split(",")[0])).size);
        for (let w = 1; w <= wochen; w++) {
          await p.locator("button.chip", { hasText: new RegExp("^" + nacht + "$") }).first().click();
          await p.locator(`[aria-label^="Woche ${w}, Mo"]`).first().click();
          await p.locator("button.chip", { hasText: new RegExp("^" + frueh + "$") }).first().click();
          await p.locator(`[aria-label^="Woche ${w}, Di"]`).first().click();
        }
        await p.waitForTimeout(600);
        const nachher = await status();
        const gruppen = nachher && nachher !== vorher;
        if (!gruppen) melde("schichtfolge", `Live-Prüfung ändert sich nicht nach Nacht→Früh in jeder Woche (vorher/nachher gleich: „${(nachher || "").slice(0, 80)}“)`);
        else beleg("schichtfolge", `Live-Prüfung folgt dem Raster: „${nachher.slice(0, 140)}“`);
        if (nachher && /Sperre/.test(nachher) && !/keine Sperre/.test(nachher)) melde("schichtfolge", "Live-Prüfung ist nicht als Hinweis (keine Sperre) gekennzeichnet");
        const speicherKnopfDa = await p.getByRole("button", { name: /speichern/i }).count();
        hinweis("schichtfolge", `Speichern-Knopf in der Ansicht: ${speicherKnopfDa ? "ja" : "nein"} (Prüfung läuft laut Nachweis ohne Speicherschritt)`);
      }
    }
    await bild(p, "schichtfolge-live-1280");
  } catch (x) { melde("schichtfolge", `Ablauf gescheitert: ${String(x).split("\n")[0].slice(0, 160)}`); }
  for (const f of fehler) melde("konsole", `Schichtfolge: ${f}`);
  await ctx.close();
}

/* ================================================= 6  Intelligence-Antwort (WP-I17) */
if (KRITERIEN.includes("ki")) {
  /* KiAntwort ist in der App nicht eingehängt (docs/acc45/wp-i17-nachweis.md). Darum eine kleine Prüfseite
     im ignorierten Ordner: bündelt nur KiAntwort, die Antworten kommen aus der Attrappe des Gateways im Testbestand. */
  const harn = path.join(BILDER, "ki-harness");
  await mkdir(harn, { recursive: true });
  await writeFile(path.join(harn, "index.html"), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KI-Prüfseite</title></head><body><main id="w"></main><script type="module" src="./eintritt.jsx"></script></body></html>`);
  await writeFile(path.join(harn, "eintritt.jsx"), `import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { KiAntwort } from ${JSON.stringify(pathToFileURL(path.join(WT, "src/ansichten/intelligence/KiAntwort.jsx")).pathname)};
const wurzel = createRoot(document.getElementById("w"));
window.__zeige = (props) => { wurzel.render(h(KiAntwort, props)); };
window.__bereit = true;
`);
  let bauOk = true;
  try {
    const { build } = await import(pathToFileURL(path.join(WT, "node_modules/vite/dist/node/index.js")).href);
    const react = (await import(pathToFileURL(path.join(WT, "node_modules/@vitejs/plugin-react/dist/index.js")).href)).default;
    await build({ root: harn, configFile: false, logLevel: "silent", plugins: [react()], base: "./",
      build: { outDir: path.join(harn, "aus"), emptyOutDir: true, sourcemap: false } });
  } catch (x) { bauOk = false; melde("ki", `Prüfseite lässt sich nicht bauen: ${String(x).split("\n")[0].slice(0, 160)}`); }

  if (bauOk) {
    const fix = await import(pathToFileURL(path.join(WT, "pruefungen/intelligence-gateway-fixture.mjs")).href);
    const { erzeugeGateway } = await import(pathToFileURL(path.join(WT, "server/lib/intelligence/gateway/gateway.mjs")).href);
    const { erzeugeAttrappe } = await import(pathToFileURL(path.join(WT, "server/lib/intelligence/gateway/attrappe.mjs")).href);
    const { Limits } = await import(pathToFileURL(path.join(WT, "server/lib/intelligence/gateway/limits.mjs")).href);
    const { erzeugeAudit } = await import(pathToFileURL(path.join(WT, "server/lib/intelligence/gateway/audit.mjs")).href);
    const antwort = (modus) => erzeugeGateway({ anbieter: erzeugeAttrappe({ modus }), ladeBestand: () => fix.bestand(), schluesselbund: fix.schluesselbundTest(), registry: fix.registryTest(), versionen: fix.VERSIONEN,
      limits: new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 }), audit: erzeugeAudit({ senke: () => {} }),
      schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F2"], faktenquelle: fix.vollQuelle,
      zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: () => Promise.resolve() }).ausfuehren(fix.S.leitung, { funktion: "F2", eingabe: { zeitraum: fix.ZR } });
    const ok = await antwort("ok"), rueck = await antwort("fehler"), inj = await antwort("injektion");

    const statisch = async (req, res) => {
      const pfad = path.join(harn, "aus", decodeURIComponent(new URL(req.url, BASE).pathname === "/" ? "/index.html" : new URL(req.url, BASE).pathname));
      if (!pfad.startsWith(path.join(harn, "aus"))) { res.writeHead(403).end(); return; }
      try { const b = await readFile(pfad); res.writeHead(200, { "content-type": pfad.endsWith(".js") ? "text/javascript" : pfad.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }).end(b); }
      catch { res.writeHead(404).end(); }
    };
    kiServer = createServer(statisch);
    const kiPort = PORT + 1;
    await new Promise((r, f) => { kiServer.once("error", f); kiServer.listen(kiPort, "127.0.0.1", r); }).catch(() => melde("ki", "Port der Prüfseite belegt"));
    const KI = `http://127.0.0.1:${kiPort}/`;
    if (!istLoopback(KI)) await ende(2);
    const fälle = [
      { name: "fertig/leitung", props: { rolle: "leitung", antwort: ok }, hat: [/KI-Entwurf/, /Nicht veröffentlicht/], rolleAn: "status-oder-keins" },
      { name: "rueckfall/leitung", props: { rolle: "leitung", antwort: rueck }, hat: [/Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar/], role: "status" },
      { name: "injektion/leitung", props: { rolle: "leitung", antwort: inj }, hat: [/Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar/], nicht: [/KI-Entwurf/], role: "status" },
      { name: "laedt/leitung", props: { rolle: "leitung", laedt: true }, role: "status", busy: true },
      { name: "fehler/leitung", props: { rolle: "leitung", antwort: { status: "fertig" } }, role: "alert" },
      { name: "betriebsrat", props: { rolle: "betriebsrat", antwort: ok }, leer: true },
      { name: "mitarbeiter-ohne-F9", props: { rolle: "mitarbeiter", antwort: ok }, leer: true },
    ];
    /* Zwei Läufe: „roh“ = die Quelle so, wie sie im Browser landet; „mit Buffer-Ersatz“ = dieselbe Seite, nur mit einem
       Buffer.byteLength aus TextEncoder vor dem Laden. Unterscheiden sich beide, liegt es an Buffer, nicht an der Anzeige. */
    for (const ersatz of [false, true]) for (const w of [320, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 700 }, serviceWorkers: "block" });
      if (ersatz) await ctx.addInitScript(() => { window.Buffer = { byteLength: (s) => new TextEncoder().encode(s).length }; });
      const p = await ctx.newPage();
      const fehler = [];
      p.on("pageerror", (x) => fehler.push(String(x).slice(0, 120)));
      p.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) fehler.push(m.text().slice(0, 120)); });
      await p.goto(KI, { waitUntil: "load" });
      if (!ersatz && w === 320) {
        const bufferDa = await p.evaluate(() => typeof Buffer !== "undefined");
        if (!bufferDa) hinweis("ki-buffer", "Im Browser gibt es kein Buffer. server/lib/intelligence/schemas.mjs (strukturPruefen) ruft Buffer.byteLength auf und wird von src/ansichten/intelligence/ki-client.js eingebunden.");
      }
      await p.waitForFunction(() => window.__bereit === true, null, { timeout: 8000 }).catch(() => melde("ki", "Prüfseite wird nicht bereit"));
      for (const f of fälle) {
        geprueft++;
        await p.evaluate((props) => window.__zeige(props), f.props);
        await p.waitForTimeout(150);
        const m = await p.evaluate(() => {
          const s = document.querySelector("section[aria-label=Intelligence]");
          return { da: !!s, text: s ? s.innerText.replace(/\s+/g, " ") : "", busy: s ? s.getAttribute("aria-busy") : null,
            roles: s ? [...s.querySelectorAll("[role]")].map((e) => e.getAttribute("role")) : [], links: document.querySelectorAll("a, script:not([src]), img, iframe").length,
            quer: document.documentElement.scrollWidth - innerWidth, leerHtml: document.getElementById("w").innerHTML.trim() === "" };
        });
        const marke = `KI ${f.name}@${w}${ersatz ? " (mit Buffer-Ersatz)" : ""}`;
        const fehlt = [];
        if (f.leer) { if (!m.leerHtml) fehlt.push("rendert etwas, obwohl die Rolle nichts sehen darf"); }
        else {
          if (!m.da) fehlt.push("Bereich fehlt");
          for (const r of f.hat || []) if (!r.test(m.text)) fehlt.push(`Text ${r} fehlt`);
          for (const r of f.nicht || []) if (r.test(m.text)) fehlt.push(`Text ${r} darf nicht stehen`);
          if (f.role && !m.roles.includes(f.role)) fehlt.push(`role=${f.role} fehlt`);
          if (f.busy && m.busy !== "true") fehlt.push("aria-busy fehlt");
          if (m.links) fehlt.push("Links, Bilder, Inline-Skripte oder Rahmen im Markup");
          if (!reflowOk(m.quer + w, w)) fehlt.push(`Querscroll ${m.quer}px`);
          if (/Anna|Weberknecht|loesche_alles|<script/.test(m.text)) fehlt.push("Rohinhalt sichtbar");
        }
        if (fehlt.length) melde(ersatz ? "ki-mit-ersatz" : "ki", `${marke}: ${fehlt.join("; ")}`);
        else beleg("ki", `${marke}: ${f.leer ? "nichts gerendert" : "„" + m.text.slice(0, 70) + "“"}`);
        if (f.name === "fertig/leitung" || f.name === "rueckfall/leitung") await bild(p, `ki-${f.name}-${w}`);
      }
      for (const f of fehler) melde("konsole", `KI-Prüfseite@${w}: ${f}`);
      await ctx.close();
    }
  }
}

/* ----------------------------------------------------------------- Abschluss */
await browser.close();
const nach = zaehleBefunde(befunde);
const bericht = { stand: new Date().toISOString().slice(0, 10), kriterien: KRITERIEN, rollen: ROLLEN, themen: THEMEN, geprueft, befunde, hinweise, belege: belege.length, nach };
await writeFile(path.join(BILDER, "bericht.json"), JSON.stringify(bericht, null, 2)).catch(() => {});
console.log(`\nGeprüft: ${geprueft}; Belege: ${belege.length}; Hinweise: ${hinweise.length}; Befunde: ${befunde.length} ${JSON.stringify(nach)}\nBilder und bericht.json: ${path.relative(WT, BILDER)}`);
await ende(befunde.length ? 1 : 0);
