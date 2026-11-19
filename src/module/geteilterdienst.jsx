/* ==========================================================================
   GETEILTE DIENSTE — Anzeige der Abschnitte (WP-19, Strang B)

   Zeigt beide Abschnitte einer geteilten Dienstart mit Arbeitszeit, Lücke
   und Spanne in Worten. Gepflegt wird der zweite Abschnitt im
   Dienstarten-Editor (nur mit org.edit oder pattern.edit); diese Anzeige
   hängt dort ein, wenn das Modul „vorläufig" ist
   (server/lib/branchenmodule.mjs). Keine feste Breite (360 px).
   ========================================================================== */
import { geteilteZeiten, istGeteilt, pruefeGeteiltenDienst } from "../../server/lib/modul-geteilterdienst.mjs";

const zahl = (x) => Number(x).toLocaleString("de-DE", { maximumFractionDigits: 2 });

/** @param {{ da: any }} props */
export function AbschnittsAnzeige({ da }) {
  if (!istGeteilt(da)) return null;
  const fehler = pruefeGeteiltenDienst(da);
  if (fehler) return <p role="alert">{fehler}</p>;
  const z = geteilteZeiten(da);
  return (
    <dl aria-label={`Abschnitte von ${da.name}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", margin: 0 }}>
      <dt>Erster Abschnitt</dt><dd style={{ margin: 0 }}>{da.start}–{da.ende}</dd>
      <dt>Zweiter Abschnitt</dt><dd style={{ margin: 0 }}>{da.zweiterAbschnitt.start}–{da.zweiterAbschnitt.ende}</dd>
      <dt>Arbeitszeit</dt><dd style={{ margin: 0 }}>{zahl(z.arbeitH)} Std.</dd>
      <dt>Lücke (keine Arbeitszeit)</dt><dd style={{ margin: 0 }}>{zahl(z.lueckeH)} Std.</dd>
      <dt>Spanne</dt><dd style={{ margin: 0 }}>{zahl(z.spanneH)} Std.</dd>
    </dl>);
}
