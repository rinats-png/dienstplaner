/* V4-4: Visuelle QA der App-Oberfläche in Hell und Dunkel (Projekt "v4-visuell", playwright.config.mjs).
   Geprüft je Ansicht (Anmeldung, Dienstplan, Mitarbeiter, Abwesenheiten, Einstellungen, Pakete; Beschäftigte: vier Reiter der Telefonschale) bei 375 px (Telefon) und
   1280 px (Desktop), je Hell und Dunkel — mit den erfundenen Testdaten des Testservers (e2e/global-setup.mjs):
     K  axe color-contrast (WCAG 1.4.3), alle Funde gelten, außer als bekannt geführt (VISUELL_BEKANNT, V4-4-BEFUNDE.md)
     L  keine waagerechte Bildlaufleiste der Seite
     A  kein Hauptelement außerhalb der Breite und kein abgeschnittener Text (overflow hidden ohne Auslassungspunkte)
     U  keine Überlappung bedienbarer Elemente (ohne feste Leisten und ohne Elemente in waagerechten Bildlaufflächen)
     F  Fokus sichtbar (Umriss oder Schatten) mit >= 3:1 gegen die Fläche dahinter (WCAG 1.4.11), je Ansicht drei gezielte Elemente (erstes, erstes im Hauptinhalt, letztes)
   Keine Pixelvergleiche und keine Bilder im Repo; Bilder nur zur Ansicht mit V4_VISUELL_BILDER=1 (e2e/ergebnisse, ignoriert).
   Selbsttest: Auf der Anmeldeseite wird je Prüfung ein Fehler absichtlich eingebaut; die Prüfung muss anschlagen (Beweis
   durch Mutation, bei jedem Lauf). Die Token-Nutzung (keine harten Farben im Quelltext) sichern die Wächter
   pruefung:v4-tokens und pruefungen/v4-3b-*.test.js; hier sichert v4-variablen.spec.mjs die Variablen je Thema.
   Laufzeit: je Thema eine Anmeldung der Leitung, eine der Beschäftigten und eine der Betreiberrolle (Bremse „anmelden-code“ 20 je 300 s
   und Code, Pool je Test: anmelden() in hilfen.mjs). Aufruf einzeln: npx playwright test --project=v4-visuell. */
import { mkdirSync } from "node:fs";
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { BETREIBER_VAR } from "./umgebung.mjs";
import { VISUELL_BREITEN, VISUELL_THEMEN, VISUELL_ANSICHTEN, VISUELL_BETREIBER_ANSICHT, VISUELL_BEKANNT, BILDER_ORDNER, VISUELL_BESCHAEFTIGTE_BREITEN, VISUELL_BESCHAEFTIGTE_ANSICHTEN,
  befundeTrennen, ungenutzteEintraege, layoutMessen, fokusMessen, FOKUS_AUSWAHL } from "./v4-visuell.mjs";

/* Parallel: Die Flächen lesen nur; jeder Arbeiter hat seinen eigenen Raum (e2e/umgebung.mjs), zwei Arbeiter halbieren die Laufzeit. */
test.describe.configure({ timeout: 150_000, mode: "parallel" });

async function themaWaehlen(page, { thema, system }) {
  await page.emulateMedia({ colorScheme: system });
  await page.addInitScript((w) => { try { localStorage.setItem("centric.thema", w); } catch { /* ohne Speicher */ } }, thema);
}
/* Die Anwendung setzt data-thema, der Einstieg (Anmeldung) data-v4-thema (src/v4/thema.js). */
const themaGilt = (page, thema, attribut = "data-thema") => expect.poll(() => page.evaluate((a) => document.documentElement.getAttribute(a), attribut),
  { message: `${attribut} = ${thema}` }).toBe(thema);

/** Die Startsequenz (Marke mit Wortmarke, blendet ein und aus) ist ein Übergang, kein Ruhebild: erst danach messen. */
const startbildFertig = (page) => expect(page.locator('[aria-label="CENTRIC wird gestartet"]'), "Startsequenz beendet").toHaveCount(0, { timeout: 30000 });

/** Kontrast-Funde (axe color-contrast) als kurze Texte. Zusätzlich zählt die Messung die bewerteten Knoten (Verstöße + bestanden):
 *  Bewertet axe keinen einzigen Knoten (Ergebnis „incomplete“, z. B. wegen eines Pseudoelements als Hintergrund), ist die
 *  Prüfung blind und der Fund lautet „keine Knoten bewertet“ (sonst wäre ein grünes Ergebnis nichts wert). */
async function kontrastFunde(page) {
  const erg = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations", "passes", "incomplete"] }));
  const zaehle = (liste) => liste.reduce((n, v) => n + v.nodes.length, 0);
  const funde = erg.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${String(n.any[0] && n.any[0].message || v.help).slice(0, 140)}`));
  const bewertet = zaehle(erg.violations) + zaehle(erg.passes);
  if (bewertet === 0) funde.push(`keine Knoten bewertet (axe incomplete ${zaehle(erg.incomplete)})`);
  return funde;
}

/** Alle Prüfungen einer Fläche; liefert die Funde je Prüfung (leer = bestanden). */
/* Übergänge für die Messung aus (zusätzliches Stilelement nur im Test, wie e2e/v4-seitenleiste-kontrast.spec.mjs): Der Umriss
   blendet von currentColor zur Fokusfarbe über; ein Zwischenbild gäbe falsche Werte. */
/* Verlauf aus für die Messung: Die Hintergrundverläufe der Seitenflächen (.inhalt::before, .m-schale::before) sind
   Pseudoelemente; axe kann dann die Hintergrundfarbe nicht bestimmen und bewertet den Knoten nicht („incomplete“). Die App
   hat denselben Zustand als Einstellung (kein-verlauf, Feldmodus). Gemessen wird gegen die Grundfläche, nicht gegen den Verlauf. */
const OHNE_UEBERGANG = "*,*::before,*::after{transition:none !important;animation:none !important;}"
  + ".inhalt::before,.m-schale::before{display:none !important;}";

async function flaechePruefen(page, { mitFokus = true } = {}) {
  if (!(await page.locator("#v4-visuell-ruhe").count())) await page.evaluate((css) => { const st = document.createElement("style"); st.id = "v4-visuell-ruhe"; st.textContent = css; document.head.appendChild(st); }, OHNE_UEBERGANG);
  const funde = { kontrast: await kontrastFunde(page), layout: await page.evaluate(layoutMessen), fokus: [] };
  if (mitFokus) {
    for (const wahl of FOKUS_AUSWAHL) {
      const f = await page.evaluate(fokusMessen, wahl);
      if (!f) break;
      if (!f.fokussiert) funde.fokus.push(`${f.bezeichnung}: erhielt keinen Fokus`);
      else if (!f.art) funde.fokus.push(`${f.bezeichnung}: kein Fokuszeichen (kein Umriss, kein Schatten)`);
      else if (f.kontrast === null || f.kontrast < 3) funde.fokus.push(`${f.bezeichnung}: Fokuszeichen ${f.art} ${f.zeichenFarbe} auf ${f.grundFarbe} = ${f.kontrast}:1 < 3:1`);
    }
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
  }
  return funde;
}

/** Funde → Liste der Verstöße; bekannte Befunde nur als Anmerkung. */
function bewerten(funde, kontext, testInfo) {
  const { flaeche, viewport, thema, genutzt } = kontext;
  const verstoesse = [];
  const sammeln = (regel, liste) => {
    if (!liste.length) return;
    const t = befundeTrennen(regel, flaeche, viewport, thema, liste, VISUELL_BEKANNT);
    for (const { eintrag } of t.bekannt) if (genutzt) genutzt.add(eintrag);
    for (const b of new Set(t.bekannt.map((x) => x.eintrag))) {
      testInfo.annotations.push({ type: "bekannt", description: `${flaeche} ${viewport} ${thema}: ${regel} (${b.befund}): ${t.bekannt.filter((x) => x.eintrag === b).length}` });
    }
    for (const l of t.offen) verstoesse.push(`${regel}: ${l}`);
  };
  sammeln("kontrast", funde.kontrast);
  sammeln("bildlauf", funde.layout.bildlaufX.scrollWidth > funde.layout.bildlaufX.clientWidth + 1
    ? [`Seite ${funde.layout.bildlaufX.scrollWidth} px breit bei ${funde.layout.bildlaufX.clientWidth} px Fenster`] : []);
  sammeln("ausserhalb", funde.layout.ausserhalb);
  sammeln("abgeschnitten", funde.layout.abgeschnitten);
  sammeln("ueberlappung", funde.layout.ueberlappungen);
  sammeln("fokus", funde.fokus);
  return verstoesse;
}

/** Einträge von VISUELL_BEKANNT im Geltungsbereich dieses Tests ohne Treffer: Fehler (behobener Befund, Eintrag entfernen). */
function ungenutztMelden(alle, genutzt, flaechen, viewports, thema) {
  for (const b of ungenutzteEintraege(VISUELL_BEKANNT, genutzt, { flaechen, viewports, thema }))
    alle.push(`ungenutzter Eintrag in VISUELL_BEKANNT (Befund behoben? Eintrag und Doku entfernen): ${b.befund}`);
}

async function bildAblegen(page, name) {
  if (!process.env.V4_VISUELL_BILDER) return;
  mkdirSync(BILDER_ORDNER, { recursive: true });
  await page.screenshot({ path: `${BILDER_ORDNER}/${name}.png`, fullPage: true });
}

async function betreiberAnmelden(page) {
  const code = process.env[BETREIBER_VAR];
  if (!code) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
  await page.goto("/", { waitUntil: "load" });
  await page.locator("input").first().fill(code, { timeout: 30000 });
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await page.waitForSelector(".kopfleiste, .m-tabs, .seitenleiste", { state: "attached", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

/** Ab 1025 px steht die Navigation in der Kopfzeile (Bereiche) mit Unterleiste (Ansichten); darunter Reiter oder Schublade
 *  (geheZu in hilfen.mjs). */
async function ansichtOeffnen(page, ansicht, bereich) {
  const kopfNavigation = page.getByRole("navigation", { name: "Bereiche" });
  if (await kopfNavigation.isVisible()) {
    if (bereich) await kopfNavigation.getByRole("button", { name: new RegExp(`^${bereich}`) }).click();
    await page.getByRole("navigation", { name: /^Ansichten in/ }).getByRole("button", { name: new RegExp(`^${ansicht}(\\s|$)`) }).click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
  } else await geheZu(page, ansicht);
}

/** In die Betreiberansicht wechseln (Unterleiste auf dem Desktop; sonst Menütaste und Schublade). */
async function betreiberAnsicht(page, name) {
  const unterleiste = page.getByRole("navigation", { name: /^Ansichten in/ });
  if (await unterleiste.isVisible()) {
    await unterleiste.getByRole("button", { name, exact: true }).click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
  } else await geheZu(page, name);
}

/** Fenstergröße im laufenden Lauf wechseln (die Anwendung folgt per Medienabfrage): erst weiter, wenn sie gilt und gezeichnet ist. */
async function breiteSetzen(page, b) {
  await page.setViewportSize({ width: b.w, height: b.h });
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth), { message: `Breite ${b.w}` }).toBe(b.w);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* Anmeldeseite: je Breite und Thema ein Lauf ohne Anmeldung. */
for (const b of VISUELL_BREITEN) {
  for (const t of VISUELL_THEMEN) {
    const kopf = `${b.id} ${t.thema}`;
    test.describe(kopf, () => {
      test.use({ viewport: { width: b.w, height: b.h }, hasTouch: b.w < 1000 });
      test(`Anmeldung ${kopf}`, async ({ page }, testInfo) => {
        await themaWaehlen(page, t);
        await page.goto("/", { waitUntil: "load" });
        await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
        await themaGilt(page, t.thema, "data-v4-thema");
        await startbildFertig(page);
        await bildAblegen(page, `anmeldung-${b.id}-${t.thema}`);
        const genutzt = new Set();
        const v = bewerten(await flaechePruefen(page), { flaeche: "anmeldung", viewport: b.id, thema: t.thema, genutzt }, testInfo);
        ungenutztMelden(v, genutzt, ["anmeldung"], [b.id], t.thema);
        expect(v, `Anmeldung ${kopf}`).toEqual([]);
      });
    });
  }
}

/* Angemeldete Flächen: je Thema EINE Anmeldung je Rolle; danach beide Breiten im selben Lauf (spart die langsame Anmeldung).
   Telefon zuerst (Reiter bzw. Schublade), dann Desktop (Kopfzeile mit Unterleiste). */
for (const t of VISUELL_THEMEN) {
  test(`Leitung ${t.thema}: Dienstplan, Mitarbeiter, Abwesenheiten, Einstellungen bei 375 und 1280 px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: VISUELL_BREITEN[0].w, height: VISUELL_BREITEN[0].h });
    await themaWaehlen(page, t);
    await anmelden(page, "leitung");
    await themaGilt(page, t.thema);
    const alle = [];
    const genutzt = new Set();
    for (const b of VISUELL_BREITEN) {
      await breiteSetzen(page, b);
      for (const [flaeche, , ansicht, bereich] of VISUELL_ANSICHTEN) {
        await ansichtOeffnen(page, ansicht, bereich);
        await bildAblegen(page, `${flaeche}-${b.id}-${t.thema}`);
        alle.push(...bewerten(await flaechePruefen(page), { flaeche, viewport: b.id, thema: t.thema, genutzt }, testInfo).map((x) => `[${flaeche} ${b.id}] ${x}`));
      }
    }
    ungenutztMelden(alle, genutzt, VISUELL_ANSICHTEN.map((a) => a[0]), VISUELL_BREITEN.map((b) => b.id), t.thema);
    expect(alle, `Leitung ${t.thema}`).toEqual([]);
  });

  /* Beschäftigte (wichtigster Nutzer, Telefon): Telefonschale mit vier Reitern; 375 und 1024 px im selben Lauf. */
  test(`Beschäftigte ${t.thema}: Heute, Mein Plan, Anliegen, Mehr bei 375 und 1024 px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: VISUELL_BESCHAEFTIGTE_BREITEN[0].w, height: VISUELL_BESCHAEFTIGTE_BREITEN[0].h });
    await themaWaehlen(page, t);
    await anmelden(page, "mitarbeiter");
    await themaGilt(page, t.thema);
    const alle = [];
    const genutzt = new Set();
    for (const b of VISUELL_BESCHAEFTIGTE_BREITEN) {
      await breiteSetzen(page, b);
      for (const [flaeche, reiter] of VISUELL_BESCHAEFTIGTE_ANSICHTEN) {
        await geheZu(page, reiter);
        await bildAblegen(page, `${flaeche}-${b.id}-${t.thema}`);
        alle.push(...bewerten(await flaechePruefen(page), { flaeche, viewport: b.id, thema: t.thema, genutzt }, testInfo).map((x) => `[${flaeche} ${b.id}] ${x}`));
      }
    }
    ungenutztMelden(alle, genutzt, VISUELL_BESCHAEFTIGTE_ANSICHTEN.map((a) => a[0]), VISUELL_BESCHAEFTIGTE_BREITEN.map((b) => b.id), t.thema);
    expect(alle, `Beschäftigte ${t.thema}`).toEqual([]);
  });

  test(`Betreiber ${t.thema}: Pakete bei 375 und 1280 px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: VISUELL_BREITEN[0].w, height: VISUELL_BREITEN[0].h });
    await themaWaehlen(page, t);
    await betreiberAnmelden(page);
    await themaGilt(page, t.thema);
    const alle = [];
    const genutzt = new Set();
    for (const b of VISUELL_BREITEN) {
      await breiteSetzen(page, b);
      await betreiberAnsicht(page, VISUELL_BETREIBER_ANSICHT[2]);
      await bildAblegen(page, `pakete-${b.id}-${t.thema}`);
      alle.push(...bewerten(await flaechePruefen(page), { flaeche: "pakete", viewport: b.id, thema: t.thema, genutzt }, testInfo).map((x) => `[pakete ${b.id}] ${x}`));
    }
    ungenutztMelden(alle, genutzt, ["pakete"], VISUELL_BREITEN.map((b) => b.id), t.thema);
    expect(alle, `Pakete ${t.thema}`).toEqual([]);
  });
}

/* Beweis durch Mutation: Jede Prüfung schlägt auf einer absichtlich fehlerhaften Seite an. Läuft ohne Anmeldung auf der
   Anmeldeseite, einmal je Breite (hell), in Sekunden. Der Fehler wird per Stilelement/Knoten eingebaut und wieder entfernt. */
test.describe("Selbsttest: die Prüfungen erkennen eingebaute Fehler", () => {
  /* Angemeldete Fläche (Beschäftigte, Telefonschale): Auf der Anmeldeseite wäre axe nicht blind, auf angemeldeten Flächen
     war es das ohne Verlaufsausblendung (Pseudoelement als Hintergrund, „incomplete“). Darum hier ein blasser Text auf der
     Schale: die Kontrastprüfung muss echte Knoten bewerten und anschlagen. */
  test("Mutation kontrast auf angemeldeter Fläche (Beschäftigte, 375 px, hell)", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: VISUELL_BREITEN[0].w, height: VISUELL_BREITEN[0].h });
    await themaWaehlen(page, VISUELL_THEMEN[0]);
    await anmelden(page, "mitarbeiter");
    await themaGilt(page, "hell");
    const ctx = { flaeche: "selbsttest-angemeldet", viewport: VISUELL_BREITEN[0].id, thema: "hell" };
    expect(bewerten(await flaechePruefen(page, { mitFokus: false }), ctx, testInfo), "Ausgangslage sauber").toEqual([]);
    await page.addStyleTag({ content: ".m-tabs button, main *{color:#c8c8c8 !important}" });
    const v = bewerten(await flaechePruefen(page, { mitFokus: false }), ctx, testInfo);
    expect(v.some((x) => x.startsWith("kontrast:") && !x.includes("keine Knoten bewertet")), `kontrast (angemeldet): muss mit echten Knoten anschlagen, fand ${JSON.stringify(v.slice(0, 3))}`).toBe(true);
  });

  for (const b of VISUELL_BREITEN) {
    test(`Mutationen ${b.id}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: b.w, height: b.h });
      await themaWaehlen(page, VISUELL_THEMEN[0]);
      await page.goto("/", { waitUntil: "load" });
      await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
      const ctx = { flaeche: "selbsttest", viewport: b.id, thema: "hell" };
      await startbildFertig(page);
      /* Ausgangslage: die Anmeldeseite besteht (sonst wäre ein „Anschlagen“ nichts wert). */
      expect(bewerten(await flaechePruefen(page), ctx, testInfo), "Ausgangslage sauber").toEqual([]);

      const einbauen = (html) => page.evaluate((h) => { const d = document.createElement("div"); d.id = "mutation"; d.innerHTML = h; document.body.appendChild(d); }, html);
      const ausbauen = () => page.evaluate(() => document.getElementById("mutation")?.remove());
      const fall = async (name, html, erwartet) => {
        await einbauen(html);
        const v = bewerten(await flaechePruefen(page, { mitFokus: name === "fokus" }), ctx, testInfo);
        await ausbauen();
        expect(v.some((x) => x.startsWith(erwartet + ":")), `${name}: Prüfung „${erwartet}“ muss anschlagen, fand ${JSON.stringify(v)}`).toBe(true);
      };

      await fall("kontrast", '<p style="position:static;color:#8a8a8a;background:#9a9a9a;font-size:16px;margin:8px">Blasser Text auf Grau</p>', "kontrast");
      await fall("bildlauf", '<div style="width:' + (b.w + 600) + 'px;height:10px;background:#000"></div>', "bildlauf");
      await fall("ausserhalb", '<button style="position:absolute;left:' + (b.w - 20) + 'px;top:0;width:120px">Aus dem Bild</button>', "ausserhalb");
      await fall("abgeschnitten", '<div class="karte" style="width:90px;overflow:hidden;white-space:nowrap">Dieser lange Text wird abgeschnitten, weil die Box schmal ist</div>', "abgeschnitten");
      await fall("ueberlappung", '<div style="position:relative;height:40px"><button style="position:absolute;left:0;top:0;width:100px;height:36px">Eins</button><button style="position:absolute;left:40px;top:4px;width:100px;height:36px">Zwei</button></div>', "ueberlappung");
      /* Fokusauswahl „haupt“ (Verhalten, nicht Text): mit fester Kopfleiste vor einem <main> trifft sie ein Element in main
         und keines in der festen Leiste. */
      await page.evaluate(() => {
        const k = document.createElement("div"); k.id = "mutation-kopf"; k.style.cssText = "position:fixed;top:0;left:0";
        k.innerHTML = "<button>Kopfknopf</button>"; document.body.prepend(k);
        const m = document.createElement("main"); m.id = "mutation-haupt"; m.innerHTML = "<button>Hauptknopf</button>"; document.body.appendChild(m);
      });
      const haupt = await page.evaluate((fn) => { const f = new Function("return " + fn)(); const erg = f("haupt"); return { erg, inMain: !!document.activeElement.closest("main"), inKopf: !!document.activeElement.closest("#mutation-kopf") }; }, String(fokusMessen));
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.getElementById("mutation-kopf")?.remove(); document.getElementById("mutation-haupt")?.remove(); });
      expect(haupt.inMain && !haupt.inKopf, `fokusMessen("haupt") trifft ein Element in main, nicht in der festen Leiste: ${JSON.stringify(haupt)}`).toBe(true);
      /* Fokus: erstes bedienbare Element der Seite verliert Umriss und Schatten. */
      await page.addStyleTag({ content: "*:focus,*:focus-visible{outline:none !important;box-shadow:none !important}" });
      const v = bewerten(await flaechePruefen(page), ctx, testInfo);
      expect(v.some((x) => x.startsWith("fokus:")), `fokus: Prüfung muss anschlagen, fand ${JSON.stringify(v)}`).toBe(true);
    });
  }
});
