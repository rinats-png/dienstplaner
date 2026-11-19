/* ==========================================================================
   WP-40 BROWSER-ABNAHME — reine Bewertungsfunktionen (ohne Browser)

   Ergänzt abnahme-kern.mjs (Reflow, Zielgröße mit Abstandsausnahme, Fehlertext)
   um zwei Bewertungen, die das Skript wcag-wp40.mjs braucht:
     - 2.4.11 Fokus nicht verdeckt: ist das fokussierte Element durch feste oder
       klebende Leisten (Kopfleiste, untere Leiste, Meldungsstreifen) ganz verdeckt?
     - 3.3.1 Fehlertext am Formular: Text vorhanden, sichtbar, und mit dem Feld
       verbunden (aria-describedby auf die Kennung der Meldung).
   Dazu die Ziel-Aufbereitung: Rollbereiche (Datentabellen) mit dokumentiertem
   Rollcontainer sind beim Reflow zulässig (1.4.10, Ausnahme „Datentabellen“).
   Geprüft in pruefungen/wcag-wp40.test.js.
   ========================================================================== */
import { fehlertextOk } from "./abnahme-kern.mjs";

/** Das Rechteck {l,t,r,b} ganz in der Vereinigung der Überlagerungen? Raster 7x7 über das sichtbare Stück. */
export function verdecktDurchFest(rect, ueberlagerungen, fenster) {
  if (!rect || !Array.isArray(ueberlagerungen) || !ueberlagerungen.length) return false;
  const l = Math.max(rect.l, 0), t = Math.max(rect.t, 0);
  const r = Math.min(rect.r, fenster ? fenster.w : Infinity), b = Math.min(rect.b, fenster ? fenster.h : Infinity);
  if (!(r > l && b > t)) return false;                       // außerhalb des Fensters: gehört zu „draußen“, nicht zu „verdeckt“
  const N = 7;
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x = l + ((r - l) * (i + 0.5)) / N, y = t + ((b - t) * (k + 0.5)) / N;
    if (!ueberlagerungen.some((u) => x >= u.l && x <= u.r && y >= u.t && y <= u.b)) return false;
  }
  return true;
}

/** Anteil (0..1) der Fläche, die von Überlagerungen bedeckt ist (Hinweis auf teilweise Verdeckung, 2.4.12 AAA). */
export function verdecktAnteil(rect, ueberlagerungen) {
  if (!rect || !Array.isArray(ueberlagerungen)) return 0;
  const N = 10; let treffer = 0;
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x = rect.l + ((rect.r - rect.l) * (i + 0.5)) / N, y = rect.t + ((rect.b - rect.t) * (k + 0.5)) / N;
    if (ueberlagerungen.some((u) => x >= u.l && x <= u.r && y >= u.t && y <= u.b)) treffer++;
  }
  return treffer / (N * N);
}

/**
 * 3.3.1 am Formular. alarme: [{ id, text }] sichtbare role=alert-Meldungen; felder: [{ id, beschreibt, ungueltig }].
 * Ergebnis: { ok, art } mit art in "kein-text" | "keine-kennung" | "nicht-verbunden" | "ok".
 *  - kein-text:       es gibt keine sichtbare Meldung mit Wortlaut (Farbe oder Symbol allein genügt nicht)
 *  - keine-kennung:   die Meldung hat keine id, kann also nicht verbunden werden
 *  - nicht-verbunden: kein Feld verweist per aria-describedby auf die Meldung
 */
export function fehlerAmFormular(alarme, felder) {
  const liste = Array.isArray(alarme) ? alarme : [];
  if (!fehlertextOk(liste.map((a) => a.text))) return { ok: false, art: "kein-text" };
  const mitText = liste.filter((a) => fehlertextOk([a.text]));
  const mitId = mitText.filter((a) => a.id);
  if (!mitId.length) return { ok: false, art: "keine-kennung" };
  const verbunden = mitId.some((a) => (Array.isArray(felder) ? felder : []).some((f) => String(f.beschreibt || "").split(/\s+/).includes(a.id)));
  return verbunden ? { ok: true, art: "ok" } : { ok: false, art: "nicht-verbunden" };
}

/** Beschreibung der Rollbereiche, die beim Reflow zulässig sind: Datentabellen mit eigenem Rollcontainer (overflow-x auto/scroll). */
export function zulaessigerRollbereich(b) {
  return !!b && /^(auto|scroll)$/.test(b.overflowX || "") && b.scrollBreite > b.klientBreite && b.klientBreite <= b.fensterBreite + 1;
}
