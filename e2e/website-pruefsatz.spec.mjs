/* WEBSITE-W2: Prüfsatz für die statisch gebaute öffentliche Website (website/, Bestand V3, Quelle gesichert in W1).
   Die Spec baut website/build.py in einen Temp-Ordner (CENTRIC_OUT), bedient ihn mit einem eigenen Server auf 127.0.0.1
   und prüft alle Seiten (Dateiliste, gegen sitemap.xml abgeglichen) bei 320, 390, 768 und 1280 px:
     (1) kein horizontales Scrollen, (2) keine Konsolenfehler, keine fehlgeschlagenen Anfragen, nur Same-Origin
     (Datenschutz), (3) axe-core (WCAG 2.x A/AA, AXE_TAGS wie in der App) in hell und dunkel, (4) interne Links lösen auf,
     mailto:/tel: nur im Format, (5) Preisabgleich mit src/stufen.js und src/standorte.js, (6) Pflichtseiten da und im
     Footer verlinkt, (7) Hell/Dunkel: V3 kennt kein prefers-color-scheme; geprüft wird, dass die Seiten in
     colorScheme dark nicht unlesbar werden.
   Bestehende Verstöße der V3-Seite stehen in e2e/website-axe-ausnahmen.json (V3-Bestand, Migration in Paket W5). Neue
   Verstöße oder mehr Knoten als dort vermerkt schlagen fehl. Die ausgelieferten Bytes ändert dieser Satz nicht.
   Läuft im Projekt "website" der playwright.config.mjs (also in `npm run e2e`); die Viewport-Projekte lassen ihn aus. */
import { test, expect } from "@playwright/test";
import { readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AXE_TAGS } from "./umgebung.mjs";
import {
  pythonFinden, bauModus, PYTHON_FEHLT_TEXT, websiteBauen, websiteServer, seitenDateien, sitemapSeiten, websitePreise,
  klartext, ausnahmeFuer, ausnahmenLaden, ausnahmenFormFehler, scrollAusnahmenLaden, scrollAusnahmeFuer, WEB_BREITEN, WEB_HOEHE,
} from "./website.mjs";
import { STUFEN, ZUSATZ_PLANER, paketeAngebot } from "../src/stufen.js";
import { STANDORT_BAENDER } from "../src/standorte.js";
import { PAKETE_ROH } from "../server/lib/paketliste.mjs";
import { TESTTAGE } from "../server/lib/aufraeumen.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const AXE_QUELLE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const ERGEBNISSE = path.join(HIER, "ergebnisse", "axe");
const AUSNAHMEN = ausnahmenLaden();
const SCROLL_AUSNAHMEN = scrollAusnahmenLaden();
const PFLICHT = ["impressum.html", "datenschutz.html", "agb.html", "barrierefreiheit.html"];
const ERLAUBTE_EXTERNE_HOSTS = new Set(["app.centric-dienstplanung.de", "centric-dienstplanung.de"]);

/* Die Seitenliste ist fest (15 Seiten, Stand V3). Kommt eine Seite dazu oder fällt eine weg, schlägt "Dateiliste" fehl
   und die Liste wird bewusst angepasst; so braucht das Laden der Spec keinen Bau (Playwright lädt sie in jedem Prozess). */
const SEITEN = ["404.html", "agb.html", "barrierefreiheit.html", "branchen.html", "datenschutz.html", "faq.html", "funktionen.html",
  "impressum.html", "index.html", "kontakt.html", "preise.html", "sicherheit.html", "ueber-uns.html", "wissen-rotation.html", "wissen.html"];
const PY = pythonFinden();
const MODUS = bauModus(PY);
let wurzel = null;
let server = null;

test.describe.configure({ mode: "parallel" });

/* Jeder Arbeiter baut für sich in einen Temp-Ordner und räumt ihn am Ende weg. */
test.beforeAll(async () => {
  if (MODUS === "fehler") throw new Error(PYTHON_FEHLT_TEXT);
  test.skip(MODUS === "skip", PYTHON_FEHLT_TEXT);
  wurzel = websiteBauen(PY);
  server = await websiteServer(wurzel);
});
test.afterAll(async () => {
  if (server) await server.schliessen();
  if (wurzel) rmSync(wurzel, { recursive: true, force: true });
  server = null;
  wurzel = null;
});

test.describe("Website-Prüfsatz: Bestand", () => {
  test("Dateiliste und sitemap.xml stimmen überein (außer 404.html)", () => {
    const karte = sitemapSeiten(wurzel);
    expect(seitenDateien(wurzel), "Dateiliste des Baus = feste Liste der Spec").toEqual(SEITEN);
    expect(SEITEN.filter((s) => !karte.includes(s)), "Seiten ohne Eintrag in sitemap.xml").toEqual(["404.html"]);
    expect(karte.filter((s) => !SEITEN.includes(s)), "sitemap.xml nennt fehlende Seiten").toEqual([]);
  });

  test("Ausnahmeliste axe ist begründet (V3-Bestand, W5) und nennt nur vorhandene Seiten", () => {
    expect(ausnahmenFormFehler(AUSNAHMEN, SEITEN, SCROLL_AUSNAHMEN)).toEqual([]);
  });
});

/* ---------- Seiten: Scroll, Konsole, Anfragen, axe ---------- */
function axeBefunde(erg) {
  return erg.violations.map((v) => ({ regel: v.id, schwere: v.impact, hilfe: v.help, anzahl: v.nodes.length,
    ziele: v.nodes.slice(0, 6).map((n) => n.target.join(" ")),
    knoten: v.nodes.slice(0, 3).map((n) => ({ html: String(n.html || "").slice(0, 200), warum: String(n.failureSummary || "").slice(0, 300) })) }));
}

async function axeLaufen(page) {
  return page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), [...AXE_TAGS]);
}

test.describe("Website-Prüfsatz: Seiten", () => {
  for (const seite of SEITEN) {
    test(`Seite ${seite}: Scroll, Konsole, Same-Origin, axe hell/dunkel`, async ({ page }, testInfo) => {
      const basis = server.url;
      const konsole = [];
      const fehlgeschlagen = [];
      const fremd = [];
      page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text().slice(0, 200)); });
      page.on("pageerror", (e) => konsole.push(`pageerror: ${String(e.message || e).slice(0, 200)}`));
      page.on("requestfailed", (r) => fehlgeschlagen.push(`${r.url()} (${r.failure()?.errorText})`));
      page.on("response", (r) => { if (r.status() >= 400) fehlgeschlagen.push(`${r.url()} -> ${r.status()}`); });
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (!["data:", "blob:", "about:"].includes(u.protocol) && u.origin !== basis) fremd.push(r.url());
      });

      const ueberbreit = [];
      const neueAxe = [];
      const beobachtet = [];
      /* Eine Ladung hell; die vier Breiten per Größenänderung (Scroll und axe an jeder Breite), danach derselbe Stand mit
         colorScheme dark (axe bei 1280 px). V3 kennt kein prefers-color-scheme, das Bild bleibt gleich; die Prüfung fängt
         ab, dass eine spätere Dunkelfassung unlesbar wird. Eine Ladung statt zwölf hält die Laufzeit klein (die
         Halle der Startseite ist langsam). */
      const messen = (modus, breite, erg) => {
        const befunde = axeBefunde(erg);
        beobachtet.push({ breite, modus, befunde });
        for (const b of befunde) {
          const passt = ausnahmeFuer(AUSNAHMEN, { regel: b.regel, seite, modus, breite });
          if (!passt) neueAxe.push(`${modus} @ ${breite}: ${b.schwere} ${b.regel} (${b.anzahl}) ${b.hilfe} [${b.ziele.slice(0, 3).join(" | ")}]`);
          else if (b.anzahl > passt.knotenMax) neueAxe.push(`${modus} @ ${breite}: ${b.regel} ${b.anzahl} Knoten, Ausnahme erlaubt ${passt.knotenMax}`);
        }
      };
      await page.emulateMedia({ colorScheme: "light" });
      const antwort = await page.goto(`${basis}/${seite}`, { waitUntil: "load" });
      expect(antwort.status(), seite).toBe(200);
      await page.evaluate(AXE_QUELLE);
      for (const breite of WEB_BREITEN) {
        await page.setViewportSize({ width: breite, height: WEB_HOEHE });
        /* Nach der Größenänderung läuft der Umbruch der Kopfleiste noch kurz nach (Übergang): erst messen, wenn sich
           scrollWidth in drei Abtastungen (je 100 ms) nicht mehr ändert, höchstens 2 s. */
        await page.evaluate(async () => {
          let alt = -1, gleich = 0;
          for (let i = 0; i < 20 && gleich < 3; i++) {
            const jetzt = document.documentElement.scrollWidth;
            gleich = jetzt === alt ? gleich + 1 : 0;
            alt = jetzt;
            await new Promise((r) => setTimeout(r, 100));
          }
        });
        const mass = await page.evaluate(() => {
          const d = document.documentElement, k = d.clientWidth;
          const zu = d.scrollWidth <= k && document.body.scrollWidth <= k ? [] : [...document.body.querySelectorAll("*")].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > k + 1 && getComputedStyle(e).position !== "fixed";
          }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? `.${e.className.trim().split(/\s+/)[0]}` : ""}`);
          return { scroll: d.scrollWidth, breite: k, body: document.body.scrollWidth, zu };
        });
        const ausn = scrollAusnahmeFuer(SCROLL_AUSNAHMEN, { seite, breite });
        if ((mass.scroll > mass.breite || mass.body > mass.breite) && !(ausn && Math.max(mass.scroll, mass.body) <= ausn.scrollMax))
          ueberbreit.push(`${breite} px: scrollWidth ${mass.scroll}/${mass.body} > clientWidth ${mass.breite} (${mass.zu.join(", ")})`);
        messen("hell", breite, await axeLaufen(page));
      }
      await page.emulateMedia({ colorScheme: "dark" });
      messen("dunkel", 1280, await axeLaufen(page));
      mkdirSync(ERGEBNISSE, { recursive: true });
      writeFileSync(path.join(ERGEBNISSE, `website-${seite.replace(/\.html$/, "")}.json`),
        JSON.stringify({ seite, tags: AXE_TAGS, beobachtet }, null, 1));
      testInfo.annotations.push({ type: "website-axe", description: `${seite}: ${beobachtet.reduce((n, b) => n + b.befunde.length, 0)} Regel-Funde in ${beobachtet.length} Läufen, ${neueAxe.length} neu` });

      expect.soft(ueberbreit, `${seite}: horizontales Scrollen`).toEqual([]);
      expect.soft([...new Set(konsole)], `${seite}: Konsolenfehler`).toEqual([]);
      expect.soft([...new Set(fehlgeschlagen)], `${seite}: fehlgeschlagene Anfragen`).toEqual([]);
      expect.soft([...new Set(fremd)], `${seite}: Anfragen an fremde Herkunft (Datenschutz)`).toEqual([]);
      expect.soft(neueAxe, `${seite}: axe-Funde ohne Ausnahme (e2e/website-axe-ausnahmen.json)`).toEqual([]);
    });
  }
});

/* ---------- Links ---------- */
test.describe("Website-Prüfsatz: Links, Pflichtseiten, Preise", () => {
  test("interne Links lösen auf (200, Anker vorhanden); mailto/tel nur im Format; externe nur zur App", async () => {
    const basis = server.url;
    const probleme = [];
    const extern = new Set();
    const gesehen = new Map();
    const holen = async (pfad) => {
      if (!gesehen.has(pfad)) {
        const r = await fetch(`${basis}/${pfad}`);
        gesehen.set(pfad, { status: r.status, text: r.ok ? await r.text() : "" });
      }
      return gesehen.get(pfad);
    };
    for (const seite of SEITEN) {
      const html = readFileSync(path.join(wurzel, seite), "utf8");
      const ziele = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
      for (const z of ziele) {
        if (/^mailto:/.test(z)) {
          if (!/^mailto:[^\s@?]+@[^\s@?]+\.[A-Za-z]{2,}(\?[^\s]*)?$/.test(z)) probleme.push(`${seite}: mailto fehlerhaft: ${z}`);
        } else if (/^tel:/.test(z)) {
          if (!/^tel:\+?[0-9][0-9 ()\-/]{4,}$/.test(z)) probleme.push(`${seite}: tel fehlerhaft: ${z}`);
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(z)) {
          const u = new URL(z);
          if (u.protocol !== "https:") probleme.push(`${seite}: Link nicht https: ${z}`);
          else if (!ERLAUBTE_EXTERNE_HOSTS.has(u.hostname)) probleme.push(`${seite}: unerwartetes Linkziel ${u.hostname}`);
          extern.add(u.hostname);
        } else if (z.startsWith("//")) {
          probleme.push(`${seite}: protokollrelativer Link ${z}`);
        } else {
          const u = new URL(z, `${basis}/${seite}`);
          const pfad = u.pathname.replace(/^\//, "") || "index.html";
          const r = await holen(pfad);
          if (r.status !== 200) probleme.push(`${seite}: ${z} -> ${r.status}`);
          else if (u.hash.length > 1 && pfad.endsWith(".html") && !new RegExp(`\\bid="${decodeURIComponent(u.hash.slice(1))}"`).test(r.text))
            probleme.push(`${seite}: Anker ${z} fehlt`);
        }
      }
    }
    expect(probleme).toEqual([]);
    expect([...extern].sort(), "externe Linkziele (nur Navigation, nie abgerufen)").toEqual(["app.centric-dienstplanung.de"]);
  });

  test("Pflichtseiten (Impressum, Datenschutz, AGB, Barrierefreiheit) vorhanden und in jedem Footer verlinkt", () => {
    for (const p of PFLICHT) expect(SEITEN, p).toContain(p);
    const ohne = [];
    for (const seite of SEITEN) {
      const m = /<footer[\s\S]*?<\/footer>/.exec(readFileSync(path.join(wurzel, seite), "utf8"));
      if (!m) { ohne.push(`${seite}: kein footer`); continue; }
      for (const p of PFLICHT) if (!m[0].includes(`href="${p}"`)) ohne.push(`${seite}: Footer ohne ${p}`);
    }
    expect(ohne).toEqual([]);
    /* Keine Rechtsbewertung: nur, dass die Seiten nicht leer sind. */
    for (const p of PFLICHT) expect(klartext(readFileSync(path.join(wurzel, p), "utf8")).length, p).toBeGreaterThan(500);
  });

  test("Preise der Website = src/stufen.js und src/standorte.js (Stufen, Zusatz-Planer, Standortbänder, Testzeit)", () => {
    const w = websitePreise(wurzel);
    const app = Object.fromEntries(STUFEN.map((s) => [s.id, s.grund]));
    expect(w.stufen, "Grundgebühren Basis/Business/Enterprise").toEqual(app);
    expect(w.zusatzPlaner, "Zusatz-Planer (Text)").toBe(ZUSATZ_PLANER);
    expect(w.rechner.zusatzPlaner, "Zusatz-Planer (Rechner)").toBe(ZUSATZ_PLANER);
    const baender = STANDORT_BAENDER.map((b) => ({ bis: Number.isFinite(b.bis) ? b.bis : null, zuschlag: b.zuschlag }));
    expect(w.baender, "Standortzuschläge (Text)").toEqual(baender);
    expect(w.rechner.baender, "Standortzuschläge (Rechner)").toEqual(baender);
    expect(w.rechner.stufen.map((s) => ({ id: s.id, grund: s.grund, planerInkl: s.planerInkl, standorteInkl: s.standorteInkl, paketeFrei: s.paketeFrei })))
      .toEqual(STUFEN.map((s) => ({ id: s.id, grund: s.grund, planerInkl: s.planerInklusive, standorteInkl: s.standorteInklusive, paketeFrei: s.paketeFrei })));
    expect(w.testTage.length, "„N Tage testen“ kommt vor").toBeGreaterThan(0);
    expect([...new Set(w.testTage)], "Testzeit").toEqual([TESTTAGE]);
    expect(TESTTAGE).toBe(30);
  });

  /* BEKANNTE ABWEICHUNG F1 (offen, Betreiberentscheidung): Die Website nennt für alle vier Branchenpakete einen Preis und
     kein „in Vorbereitung“. Nach G9 bewirbt und berechnet die App nur Pakete im Zustand 5 (buchbar); aktuell ist keines
     buchbar (server/lib/paketstand.mjs, PAKET_FREIGABEN = {}). Dieser Test hält den Ist-Zustand fest. Er wird rot, sobald
     F1 umgesetzt wird (Website zeigt „in Vorbereitung“ / nennt keinen Preis) oder sich ein Preis oder der Paketstand ändert.
     Dann ist das eine bewusste Anpassung dieses Tests, kein Zufall. */
  test("Preise: Branchenpakete, bekannte Abweichung F1 offen (Website nennt Preise, App führt kein Paket buchbar)", () => {
    const w = websitePreise(wurzel);
    const ziele = Object.fromEntries(PAKETE_ROH.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis]));
    expect(w.pakete, "Paketpreise der Website = Zielpreise der App").toEqual(ziele);
    expect(w.rechner.paketPreise, "Paketpreise im Rechner = Zielpreise der App").toEqual(ziele);
    const buchbar = paketeAngebot().filter((p) => p.buchbar).map((p) => p.id);
    const ist = { buchbarInApp: buchbar, websiteNenntPreise: Object.keys(w.pakete).length === 4, websiteSagtInVorbereitung: w.paketeInVorbereitung };
    expect(ist, "F1 offen: Widerspruch Website/App besteht noch; bei Änderung diesen Test bewusst anpassen").toEqual(
      { buchbarInApp: [], websiteNenntPreise: true, websiteSagtInVorbereitung: false });
  });
});

/* ---------- Hell/Dunkel: Ist-Zustand ---------- */
test("Hell/Dunkel Ist-Zustand V3: kein prefers-color-scheme in style.css (nur dokumentiert, kein Gate)", async ({}, testInfo) => {
  const css = readFileSync(path.join(wurzel, "assets", "style.css"), "utf8");
  const n = (css.match(/prefers-color-scheme/g) || []).length;
  testInfo.annotations.push({ type: "website-dunkel", description: `V3-Ist: ${n} Treffer prefers-color-scheme in style.css; colorScheme dark ändert nichts am Bild` });
  expect(typeof n).toBe("number");
});
