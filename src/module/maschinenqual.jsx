/* ==========================================================================
   MASCHINENQUALIFIKATIONEN — Matrix Person × Anlage (WP-19, Strang C)

   Liest die bestehenden Kompetenzen und Nachweise; schreibt nichts.
   Stände in Worten, nicht nur in Farbe. Breite Tabellen scrollen in ihrem
   eigenen Rahmen, nie die Seite (360 px). Eingehängt wird die Ansicht, wenn
   das Modul „vorläufig" ist (server/lib/branchenmodule.mjs), vorgesehen für
   Planung und Leitung; gerechnet wird nur aus dem, was die Rolle ohnehin
   ausgeliefert bekommt.
   ========================================================================== */
import { qualifikationsMatrix } from "../../server/lib/modul-maschinenqual.mjs";

const WORT = { gueltig: "gültig", laeuft_ab: "läuft ab", abgelaufen: "abgelaufen", fehlt: "fehlt", unbekannt: "nicht bewertbar" };
const datumKurz = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");

/** @param {{ m: any, datum: string, stand: (k: any, n: any, d: string) => { stand: string, bis?: string|null } }} props */
export function QualifikationsMatrix({ m, datum, stand }) {
  const mx = qualifikationsMatrix(m, datum, stand);
  if (!mx.anlagen.length) return <p>Noch keine Anlagen erfasst.</p>;
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
        <caption style={{ textAlign: "left", paddingBottom: 6 }}>Qualifikationen je Anlage am {datumKurz(datum)}</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", padding: "4px 8px" }}>Person</th>
            {mx.anlagen.map((a) => <th key={a.id} scope="col" style={{ textAlign: "left", padding: "4px 8px" }}>{a.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {mx.zeilen.map((z) => (
            <tr key={z.personId}>
              <th scope="row" style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>{z.name}</th>
              {mx.anlagen.map((a) => {
                const c = z.zellen[a.id];
                return (
                  <td key={a.id} style={{ padding: "4px 8px" }}>
                    {c ? <>{WORT[c.stand] || c.stand}{c.bis && c.stand !== "fehlt" ? ` (bis ${datumKurz(c.bis)})` : ""}</>
                      : "nicht hinterlegt"}
                  </td>);
              })}
            </tr>))}
        </tbody>
      </table>
    </div>);
}
