/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */



/* ==========================================================================
   TASTATURBEDIENUNG FÜR RASTER

   Die Zellen des Monatsplans waren <td onClick>. Mit der Maus einwandfrei,
   mit der Tastatur überhaupt nicht: kein Tabulatorziel, kein Name für die
   Sprachausgabe, keine Möglichkeit, einen Tag zu öffnen, ohne zu zeigen.

   Das trifft nicht nur Menschen mit Behinderung. Wer einen Monat
   durchgeht, ist mit den Pfeiltasten schneller als mit dem Zeiger — und in
   der Leitstelle liegt oft gar keine Maus.

   Die Umsetzung folgt dem üblichen Muster für Raster: Genau eine Zelle
   liegt im Tabulatorlauf, die Pfeiltasten bewegen den Fokus, Pos1 und Ende
   springen an den Rand der Zeile, Bild auf und ab an den Rand der Spalte.
   Damit kostet das Raster einen Tabulatorschritt statt dreihundert.

   Bewusst über die Tabellenstruktur des Browsers gelöst statt über einen
   Zustand in React: Die Zeilen werden an mehreren Stellen aus
   verschiedenen Quellen erzeugt, und jede Zählung nebenher wäre eine
   zweite Wahrheit, die irgendwann von der ersten abweicht.
   ========================================================================== */

/** Alle bedienbaren Zellen eines Rasters in Dokumentreihenfolge. */
export const rasterZellen = (el) => (el ? Array.from(el.querySelectorAll("[data-zelle]")) : []);

/** Position einer Zelle: Zeile und Spalte aus der Tabelle des Browsers. */
export function zellenOrt(zelle) {
  const zeile = zelle.closest("tr");
  if (!zeile) return null;
  const tabelle = zeile.closest("table");
  if (!tabelle) return null;
  const zeilen = Array.from(tabelle.querySelectorAll("tr"))
    .filter((r) => r.querySelector("[data-zelle]"));
  const zi = zeilen.indexOf(zeile);
  const spalten = Array.from(zeile.querySelectorAll("[data-zelle]"));
  return { zeilen, zi, spalten, si: spalten.indexOf(zelle) };
}

/** Verschiebt den Fokus im Raster. Gibt zurück, ob die Taste verbraucht wurde. */
export function rasterTaste(e) {
  const zelle = e.target.closest("[data-zelle]");
  if (!zelle) return false;
  const ort = zellenOrt(zelle);
  if (!ort) return false;

  const springe = (el) => {
    if (!el) return;
    /* Genau eine Zelle bleibt im Tabulatorlauf — die zuletzt besuchte. */
    for (const z of rasterZellen(el.closest("table"))) z.tabIndex = -1;
    el.tabIndex = 0;
    el.focus();
    e.preventDefault();
  };
  const inZeile = (zi, si) => {
    const z = ort.zeilen[zi];
    if (!z) return null;
    const sp = Array.from(z.querySelectorAll("[data-zelle]"));
    return sp[Math.min(si, sp.length - 1)] || null;
  };

  switch (e.key) {
    case "ArrowRight": springe(ort.spalten[ort.si + 1]); return true;
    case "ArrowLeft": springe(ort.spalten[ort.si - 1]); return true;
    case "ArrowDown": springe(inZeile(ort.zi + 1, ort.si)); return true;
    case "ArrowUp": springe(inZeile(ort.zi - 1, ort.si)); return true;
    case "Home": springe(ort.spalten[0]); return true;
    case "End": springe(ort.spalten[ort.spalten.length - 1]); return true;
    case "PageUp": springe(inZeile(0, ort.si)); return true;
    case "PageDown": springe(inZeile(ort.zeilen.length - 1, ort.si)); return true;
    default: return false;
  }
}

/**
 * Die Eigenschaften einer bedienbaren Rasterzelle.
 *
 * @param aufAuswahl Was beim Öffnen geschieht — Klick, Eingabetaste, Leertaste
 * @param name       Was die Sprachausgabe vorliest
 * @param ersteZelle Nur die erste Zelle liegt anfangs im Tabulatorlauf
 */
export function zelleBedienbar(aufAuswahl, name, ersteZelle = false) {
  return {
    "data-zelle": "ja",
    role: "gridcell",
    tabIndex: ersteZelle ? 0 : -1,
    "aria-label": name,
    title: name,
    onClick: aufAuswahl,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aufAuswahl(); return; }
      rasterTaste(e);
    },
  };
}
