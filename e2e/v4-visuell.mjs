/* V4-4: Hilfen des Projekts "v4-visuell" (e2e/v4-visuell.spec.mjs): Visuelle QA der App-Oberfläche in Hell und Dunkel.
   Keine Pixelvergleiche (fragil, Binärdateien im öffentlichen Repo): Die Prüfungen messen im Browser Eigenschaften, die
   bei einem Fehler eindeutig rot werden — Kontrast (axe color-contrast), horizontale Bildlaufleiste, Elemente außerhalb
   der Breite, abgeschnittener Text, Überlappung bedienbarer Elemente und sichtbarer Fokus.
   Reine Daten und eine seitenfeste Messfunktion ohne Playwright-Import, damit pruefungen/v4-visuell-qa.test.js die
   Verdrahtung ohne Browser prüft. Messfunktionen laufen per page.evaluate IN der Seite und müssen in sich geschlossen sein. */

/** Die Spec des Projekts: die Viewport- und Zonenprojekte lassen sie aus (playwright.config.mjs). */
export const VISUELL_SPEC = /v4-visuell\.spec\.mjs$/;

/** Prüfbreiten: Telefon (375 px, schmalster verbreiteter Fall) und Desktop. */
export const VISUELL_BREITEN = Object.freeze([
  Object.freeze({ id: "telefon-375", w: 375, h: 812 }),
  Object.freeze({ id: "desktop-1280", w: 1280, h: 800 }),
]);

/** Die beiden Erscheinungsbilder: gemerkte Wahl der App (centric.thema) und Systemthema stimmen überein. */
export const VISUELL_THEMEN = Object.freeze([
  Object.freeze({ thema: "hell", system: "light" }),
  Object.freeze({ thema: "dunkel", system: "dark" }),
]);

/** [Fläche, Rolle, Ansicht, Bereich] — Ansicht und Bereich = Beschriftungen in src/app/navigation.js (BEREICHE; auf dem
 *  Desktop wählt man erst den Bereich in der Kopfzeile, dann die Ansicht in der Unterleiste). Die Planung der
 *  Wochen steht im Monatsplan (Wochenspalten); Abwesenheiten stehen in den Anträgen (Urlaub, Krank, Tausch). */
export const VISUELL_ANSICHTEN = Object.freeze([
  Object.freeze(["dienstplan", "leitung", "Monatsplan", "Planen"]),
  Object.freeze(["mitarbeiter", "leitung", "Personal", "Wer mitfährt"]),
  Object.freeze(["abwesenheiten", "leitung", "Anträge", "Zu entscheiden"]),
  Object.freeze(["einstellungen", "leitung", "Einstellungen", "Verwaltung"]),
]);

/** Beschäftigte im Schichtdienst sehen am Telefon wie am Rechner die Telefonschale (App.jsx zeigeMobil): vier Reiter statt
 *  Navigation in Bereichen. [Fläche, Reiter] — Reiter = Beschriftung in M_TABS (src/ansichten/mobil.jsx): Dienstplan (Mein Plan),
 *  Abwesenheiten und Anträge (Anliegen), Profil und Einstellungen (Mehr). 1024 px = Umbruch der Seitenleiste (UMBRUCH.seitenleiste). */
export const VISUELL_BESCHAEFTIGTE_ANSICHTEN = Object.freeze([
  Object.freeze(["beschaeftigte-heute", "Heute"]),
  Object.freeze(["beschaeftigte-plan", "Mein Plan"]),
  Object.freeze(["beschaeftigte-anliegen", "Anliegen"]),
  Object.freeze(["beschaeftigte-mehr", "Mehr"]),
]);
export const VISUELL_BESCHAEFTIGTE_BREITEN = Object.freeze([
  VISUELL_BREITEN[0],
  Object.freeze({ id: "tablet-1024", w: 1024, h: 768 }),
]);

/** Pakete sind eine Ansicht der Betreiberrolle (NAV_BETREIBER). */
export const VISUELL_BETREIBER_ANSICHT = Object.freeze(["pakete", "betreiber", "Pakete"]);

/** Bilder nur zur Ansicht (nie ein Gate, nie im Repo): nur mit V4_VISUELL_BILDER=1, Ablage unter e2e/ergebnisse (ignoriert). */
export const BILDER_ORDNER = "e2e/ergebnisse/v4-visuell";

/** Bekannte, in docs/acc45/V4-4-BEFUNDE.md geführte Befunde: { regel, flaeche, viewport, thema, muster, befund } ("*" = alle).
 *  muster: Text, den der einzelne Fund enthalten muss (z. B. der Selektor); ohne Muster gilt kein Eintrag (Test). Ein Eintrag
 *  macht genau die passenden Funde sichtbar (Anmerkung), nicht rot; jeder andere Fund derselben Fläche bleibt rot. Ein Eintrag
 *  ohne Treffer in seinem Geltungsbereich (behoben oder falsch) ist ein Fehler (ungenutzteEintraege): eine Reparatur zwingt
 *  dazu, den Eintrag zu entfernen. */
export const VISUELL_BEKANNT = Object.freeze([
  /* B1: Planzellen mit Zusatzzeile (.unten) in Nacht- und Spätdienstfarbe, hell, Desktop: 4,0 bis 4,3:1 (< 4,5:1). */
  Object.freeze({ regel: "kontrast", flaeche: "dienstplan", viewport: "desktop-1280", thema: "hell", muster: ".unten", befund: "B1 Planzelle Zusatzzeile hell" }),
]);

/** Meldung der Kontrastprüfung, wenn axe keinen einzigen Knoten bewertet hat (Spec kontrastFunde). Nie ein bekannter Befund. */
export const KEIN_FUND_BEWERTET = "keine Knoten bewertet";

/** Passt ein Befund auf einen bekannten Eintrag? Rein, ohne Browser. Mit fund (Text): zusätzlich muss er das Muster des
 *  Eintrags enthalten, und „keine Knoten bewertet“ passt nie. Ohne fund: nur Regel, Fläche, Breite und Thema. */
export function bekannterBefund(regel, flaeche, viewportId, thema, liste = VISUELL_BEKANNT, fund = undefined) {
  return liste.find((b) => b.regel === regel && (b.flaeche === flaeche || b.flaeche === "*")
    && (b.viewport === viewportId || b.viewport === "*") && (b.thema === thema || b.thema === "*")
    && (fund === undefined || (!String(fund).includes(KEIN_FUND_BEWERTET) && !!b.muster && String(fund).includes(b.muster)))) || null;
}

/** Trennt Funde einer Regel in bekannte (Eintrag + Fund) und offene. Rein, ohne Browser. */
export function befundeTrennen(regel, flaeche, viewportId, thema, funde, liste = VISUELL_BEKANNT) {
  const bekannt = [], offen = [];
  for (const fund of funde) {
    const eintrag = bekannterBefund(regel, flaeche, viewportId, thema, liste, fund);
    if (eintrag) bekannt.push({ fund, eintrag }); else offen.push(fund);
  }
  return { bekannt, offen };
}

/** Einträge im Geltungsbereich eines Tests (Flächen, Breiten, Thema; nur Einträge ohne Stern), die keinen Fund getroffen
 *  haben. Rein, ohne Browser. genutzt = Menge der getroffenen Einträge. */
export function ungenutzteEintraege(liste, genutzt, bereich) {
  return liste.filter((b) => !genutzt.has(b) && b.flaeche !== "*" && b.viewport !== "*" && b.thema !== "*"
    && bereich.flaechen.includes(b.flaeche) && bereich.viewports.includes(b.viewport) && bereich.thema === b.thema);
}

/** Läuft IN der Seite (page.evaluate): misst Layout-Fehler, ohne etwas zu verändern.
 *  Rückgabe: { bildlaufX, ausserhalb[], abgeschnitten[], ueberlappungen[] } mit kurzen Beschreibungen. */
export function layoutMessen() {
  const breite = document.documentElement.clientWidth;
  const sichtbar = (e) => {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  /* Ein Vorfahr, der waagerecht blättert, ist die beabsichtigte Lösung für breite Inhalte (Plantabelle). */
  const inBildlauf = (e) => {
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === "auto" || o === "scroll" || o === "hidden" || o === "clip") && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const name = (e) => {
    const t = (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30);
    return `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${t ? ` „${t}“` : ""}`;
  };
  const ausserhalb = [];
  const abgeschnitten = [];
  const haupt = document.querySelectorAll("button, a[href], input, select, textarea, h1, h2, h3, .karte, .btn, .slink, .kopfleiste *, .m-tabs *");
  for (const e of haupt) {
    if (!sichtbar(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.right > breite + 1 || r.left < -1) && !inBildlauf(e)) ausserhalb.push(`${name(e)} (${Math.round(r.left)}…${Math.round(r.right)} von ${breite})`);
    const cs = getComputedStyle(e);
    const klemmt = cs.overflowX === "hidden" || cs.overflowX === "clip";
    if (klemmt && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== "ellipsis" && e.clientWidth > 0
      && (e.textContent || "").trim()) abgeschnitten.push(`${name(e)} (Inhalt ${e.scrollWidth} > Box ${e.clientWidth})`);
  }
  /* Überlappung: bedienbare Elemente, die weder ineinander liegen noch durch feste Leisten (Kopf, Reiter, Schublade) bedeckt
     sein sollen. Paare mit einem fixierten oder klebenden Vorfahr zählen nicht (Leiste liegt absichtlich über dem Inhalt). */
  const fixiert = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
  const bedienbar = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")].filter((e) => sichtbar(e) && !fixiert(e) && !inBildlauf(e));
  const ueberlappungen = [];
  for (let i = 0; i < bedienbar.length && ueberlappungen.length < 10; i++) {
    const a = bedienbar[i], ra = a.getBoundingClientRect();
    for (let j = i + 1; j < bedienbar.length; j++) {
      const b = bedienbar[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = b.getBoundingClientRect();
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 2 && y > 2) { ueberlappungen.push(`${name(a)} × ${name(b)} (${Math.round(x)}×${Math.round(y)} px)`); if (ueberlappungen.length >= 10) break; }
    }
  }
  return {
    bildlaufX: { scrollWidth: document.documentElement.scrollWidth, clientWidth: breite },
    ausserhalb: ausserhalb.slice(0, 10), abgeschnitten: abgeschnitten.slice(0, 10), ueberlappungen,
  };
}

/** Läuft IN der Seite: Fokus auf ein gewähltes bedienbares Element; misst, ob ein Fokuszeichen (Umriss oder Schatten)
 *  sichtbar ist und ob sein Kontrast gegen die Fläche dahinter >= 3:1 ist (WCAG 1.4.11).
 *  wahl: "erstes" (erstes der Seite, oft Kopfleiste), "haupt" (erstes im Hauptinhalt, nicht in einer fixierten oder klebenden
 *  Leiste; ohne <main> das erste nicht fixierte) oder "letztes". */
export function fokusMessen(wahl) {
  const ziele = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0 && !e.disabled; });
  const fixiert = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
  const frei = ziele.filter((x) => !fixiert(x));
  const e = wahl === "erstes" ? ziele[0] : wahl === "letztes" ? ziele[ziele.length - 1]
    : (frei.find((x) => x.closest("main")) || frei[0]);
  if (!e) return null;
  e.focus({ focusVisible: true });
  const cs = getComputedStyle(e);
  const lies = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const t = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return { rgb: t.slice(0, 3), a: t.length > 3 ? t[3] : 1 }; };
  const mische = (o, u) => o.rgb.map((x, i) => x * o.a + u[i] * (1 - o.a));
  const kanal = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  const verh = (x, y) => { const [h, d] = [lum(x), lum(y)].sort((p, q) => q - p); return Math.round(((h + 0.05) / (d + 0.05)) * 100) / 100; };
  /* Fläche dahinter: vom Element nach oben die erste deckende Hintergrundfarbe, sonst Seitenfläche. */
  let grund = null;
  for (let p = e.parentElement; p; p = p.parentElement) {
    const c = lies(getComputedStyle(p).backgroundColor);
    if (c && c.a > 0.9) { grund = c.rgb; break; }
  }
  if (!grund) grund = (lies(getComputedStyle(document.body).backgroundColor) || { rgb: [255, 255, 255], a: 1 }).rgb;
  let zeichen = null, art = null;
  if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) { zeichen = lies(cs.outlineColor); art = "umriss"; }
  else if (cs.boxShadow && cs.boxShadow !== "none") {
    const m = cs.boxShadow.match(/rgba?\([^)]+\)/);
    if (m) { zeichen = lies(m[0]); art = "schatten"; }
  }
  const bez = `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : ""} „${(e.getAttribute("aria-label") || e.textContent || e.value || "").replace(/\s+/g, " ").trim().slice(0, 24)}“`;
  return {
    bezeichnung: bez, fokussiert: document.activeElement === e, art,
    kontrast: zeichen && zeichen.a > 0 ? verh(mische(zeichen, grund), grund) : null,
    zeichenFarbe: zeichen ? `rgba(${zeichen.rgb.join(",")},${zeichen.a})` : null, grundFarbe: `rgb(${grund.join(",")})`,
    anzahl: ziele.length,
  };
}

/** Welche Elemente je Ansicht auf Fokus geprüft werden: erstes, erstes im Hauptinhalt (nicht fixiert), letztes. Gezielt statt
 *  fester Indizes (Index 0 ist oft die Kopfleiste); kostet je Ansicht Millisekunden. */
export const FOKUS_AUSWAHL = Object.freeze(["erstes", "haupt", "letztes"]);
