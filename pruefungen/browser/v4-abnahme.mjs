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
const ROLLEN = (process.env.ROLLEN || "leitung,mitarbeiter").split(",");
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
  codes = { leitung: z.d.zugaenge[0].code, planer: z.d.zugaenge[1].code, mitarbeiter: z.d.zugaenge[2].code };
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
    });
    for (const f of fehler) melde("konsole", `${marke}: ${f}`);
    if (ansichten === 0) melde("keine-ansicht", `${marke}: keine Ansicht erreicht`);
    else beleg("ansichten", `${marke}: ${ansichten} Ansichten gemessen${k.ziele ? `, ${zielAnzahl} Ziele, kleinstes ${kleinste ? `${Math.round(kleinste.w)}x${Math.round(kleinste.h)} (${kleinste.id})` : "–"}` : ""}`);
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
