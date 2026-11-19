/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { datevSaetze, freezeZeilen, ohneZeilenText, KONTOSTAND_TEXT } from "../lib/fachlogik.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { KpiRow, Kpi, Card, CardHead, Btn } from "../ui/bausteine.jsx";
import { MON } from "../lib/datum.js";
import { C } from "../farben.js";
import { zahl, n2 } from "../lib/format.js";

import { NUM } from "../ui/thema.js";
import { mehrarbeitNr } from "../lib/fachlogik.js";



/**
 * Lohnausgabe für die Lohnbuchhaltung. Bewusst als Stunden je Lohnart —
 * Entgelte gehören in die Lohnabrechnung, nicht in die Dienstplanung.
 */
export function Lohnausgabe({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const saetze = useMemo(() => datevSaetze(m, ym), [m, ym]);
  /* Ohne Personalnummer trägt die Ausgabe die interne Kennung — für einen
     Import wertlos, und im Zweifel merkt es erst das Lohnbüro. */
  const ohneNummer = useMemo(() => m.personen.filter((p) => imDienst(p, `${ym}-28`)
    && !p.personalnummer), [m, ym]);
  const nachLohnart = useMemo(() => {
    const g = {};
    for (const z of saetze) {
      if (!g[z.lohnart]) g[z.lohnart] = { nr: z.lohnart, text: z.bezeichnung, stunden: 0, personen: 0 };
      g[z.lohnart].stunden += z.stunden; g[z.lohnart].personen++;
    }
    return Object.values(g).sort((a, b) => (a.nr < b.nr ? -1 : 1));
  }, [saetze]);
  /* Hinweise wie im Blatt zum Gegenlesen (WP-16, Nachtrag vierter Review A-1/A-3/A-4/A-5): Vormonate, Abweichung von der
     bestätigten Ausgabe, Freeze nach Frist gelöscht, Übertrag, Austritt im Monat. Mehrarbeit heißt Kontostand (A-6). */
  const hinweise = useMemo(() => [...freezeZeilen(m, ym), ...ohneZeilenText(m, ym)].filter(Boolean), [m, ym]);
  const maNr = useMemo(() => mehrarbeitNr(m, ym), [m, ym]);

  return (
    <div>
      <KpiRow min={170}>
        <Kpi label="Lohnartensätze" value={saetze.length} sub={`für ${MON[Number(ym.slice(5, 7)) - 1]}`} />
        <Kpi label="Lohnarten" value={nachLohnart.length} />
        <Kpi label="Betroffene Personen" value={new Set(saetze.map((z) => z.personalnummer)).size} />
      </KpiRow>

      {hinweise.length > 0 && (
        <Card style={{ marginTop: 18, borderLeft: `3px solid ${C.warn}` }}>
          <div style={{ padding: "14px 20px", fontSize: 13, lineHeight: 1.55 }}>
            {hinweise.map((t, i) => <div key={i} style={{ color: /^ACHTUNG/.test(t) ? C.warn : /^ {2}/.test(t) ? C.dim : C.text }}>{t}</div>)}
          </div>
        </Card>)}

      {ohneNummer.length > 0 && (
        <Card style={{ marginTop: 18, borderLeft: `3px solid ${C.warn}`, background: C.warnLight }}>
          <div style={{ padding: "16px 20px", fontSize: 13.5, lineHeight: 1.6 }}>
            <b>{zahl(ohneNummer.length)} {ohneNummer.length === 1 ? "Person" : "Personen"} ohne
            Personalnummer.</b>{" "}
            Für sie trägt die Ausgabe die interne Kennung — ein Lohnbüro kann damit nichts
            zuordnen. Die Personalnummer steht in der Personalakte unter Stammdaten.
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7 }}>
              {ohneNummer.slice(0, 8).map((p) => `${p.nachname}, ${p.vorname}`).join(" · ")}
              {ohneNummer.length > 8 ? ` … und ${zahl(ohneNummer.length - 8)} weitere` : ""}
            </div>
          </div>
        </Card>)}

      <Card style={{ marginTop: 18 }}>
        <CardHead right={<div style={{ display: "flex", gap: 9 }}>
          <Btn size="sm" onClick={() => akt.exportLohnBlatt(ym)}>Blatt zum Gegenlesen</Btn>
          <Btn size="sm" kind="primary" onClick={() => akt.exportDATEV(ym)}>Als CSV ausgeben</Btn>
        </div>}>Summen je Lohnart</CardHead>
        {nachLohnart.length === 0 ? (
          <div style={{ padding: "18px 20px", fontSize: 13.5, color: C.dim, lineHeight: 1.6 }}>
            Für diesen Monat fällt nichts an, was auf eine eigene Lohnart gehört. Zuschläge
            entstehen aus Nacht-, Sonntags-, Feiertags- und Samstagsstunden, Mehrarbeit aus
            einem Stundenkonto im Plus. Solange der Monat nicht geplant ist, bleibt die
            Aufstellung leer.
          </div>) : (
          <table className="raster">
            <thead><tr>{["Lohnart", "Bezeichnung", "Personen", "Stunden"].map((h, i) => (
              <th key={i} style={{ textAlign: i >= 2 ? "right" : "left" }}>{h}</th>))}</tr></thead>
            <tbody>
              {nachLohnart.map((l) => (
                <tr key={l.nr}>
                  <td style={NUM}>{l.nr}</td>
                  <td>{l.text}{String(l.nr) === maNr ? " (Kontostand)" : ""}</td>
                  <td style={{ textAlign: "right", ...NUM }}>{l.personen}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, ...NUM }}>{n2(l.stunden)}</td>
                </tr>))}
            </tbody>
            <tfoot><tr>
              <td colSpan={2} style={{ fontWeight: 650 }}>Summe</td>
              <td style={{ textAlign: "right", ...NUM }}>
                {new Set(saetze.map((z) => z.personalnummer)).size}</td>
              <td style={{ textAlign: "right", fontWeight: 700, ...NUM }}>
                {n2(saetze.reduce((a, z) => a + z.stunden, 0))}</td>
            </tr></tfoot>
          </table>)}
        <div style={{ padding: "14px 20px", fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
          <b style={{ color: C.text }}>Die CSV-Datei</b> enthält je Person und Lohnart eine Zeile
          mit Stunden, sortiert nach Personalnummer. Sie ist kein amtliches DATEV-Importformat —
          davon gibt es zwei (LODAS sowie Lohn und Gehalt), beide mit vorgeschriebenem Kopfsatz.
          Diese Datei ist eine klar benannte Spaltenliste, wie sie ein Lohnbüro einliest oder
          übernimmt. Vor dem ersten Lauf einmal mit der Lohnbuchhaltung abstimmen, welche
          Lohnartennummern dort geführt werden — sie lassen sich je Betrieb anpassen.
          <div style={{ marginTop: 8 }}>
            <b style={{ color: C.text }}>Lohnart {maNr}</b>: {KONTOSTAND_TEXT}
          </div>
          <div style={{ marginTop: 8 }}>
            <b style={{ color: C.text }}>Das Blatt zum Gegenlesen</b> enthält dieselben Zahlen als
            lesbare Aufstellung mit Gesamtsumme — gedacht für den Blick darauf, bevor die Datei
            das Haus verlässt.
          </div>
          <div style={{ marginTop: 8 }}>
            Entgelte werden bewusst nicht berechnet: Stundensätze, Tarifgruppen und
            Steuerfreibeträge gehören in die Lohnabrechnung.
          </div>
        </div>
      </Card>
    </div>);
}
