/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { vollExport } from "../lib/fachlogik.js";
import { H1, Btn, Card, CardHead, Lab, Haken } from "../ui/bausteine.jsx";
import { Leitraster, Seitenkarte } from "../gestalt/ansichten.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { zahl } from "../lib/format.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { SicherungAusserHaus } from "./sicherungausserhaus.jsx";

export function Datenmitnahme({ sitz, akt }) {
  const m = sitz.mandant;
  const tabellen = useMemo(() => vollExport(m), [m]);
  const namen = { personen: "Personalstamm", dienstplan: "Dienstplan des laufenden Jahres",
    abwesenheiten: "Abwesenheiten", erfassung: "Erfasste Zeiten", anfragen: "Anträge und Entscheidungen",
    qualifikationen: "Qualifikationen und Nachweise", protokoll: "Änderungsprotokoll" };
  const erklaerung = {
    dienstplan: "Ausgeschrieben Tag für Tag. In CENTRIC wird der Plan aus Zyklus und Versatz gerechnet — für andere Systeme muss er als Liste vorliegen.",
    protokoll: "Wer hat wann was geändert. Für Prüfungen und den Betriebsrat.",
  };

  return (
    <div>
      <H1 rubrik="Verwaltung"
        sub="Alle Daten dieses Betriebs, jederzeit vollständig und in offenem Format. Keine Sperre, keine Gebühr, kein Antrag — das gehört zum Vertrauen, das eine Dienstplanung braucht."
        right={<Btn kind="primary" onClick={akt.exportAlles}>Alles herunterladen</Btn>}>
        Datenmitnahme</H1>

      <Leitraster seiteBreite={420}
        haupt={<>
      <Card>
        <CardHead right={<Lab>{Object.values(tabellen).reduce((a, t) => a + t.length, 0)} Zeilen insgesamt</Lab>}>
          Was ausgegeben wird</CardHead>
        {Object.entries(tabellen).map(([k, t], i) => (
          <div key={k} className="listenzeile" style={{ flexWrap: "wrap", padding: "15px var(--pad-x)" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{namen[k] || k}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>
                {erklaerung[k] || (t.length ? Object.keys(t[0]).slice(0, 6).join(" · ") : "keine Daten")}
              </div>
            </div>
            <span style={{ fontSize: 13.5, color: C.dim, minWidth: 90, textAlign: "right", ...NUM }}>
              {zahl(t.length)} Zeilen</span>
            <Btn size="sm" disabled={!t.length} onClick={() => akt.exportTabelle(k, t)}>Einzeln</Btn>
          </div>))}
      </Card>

      <Seitenkarte titel="Was das bedeutet">
        <Haken punkte={[
          "Alle Dateien sind CSV mit Semikolon und Byte-Reihenfolge-Markierung — Excel öffnet sie ohne Nachfrage.",
          "Der Dienstplan ist Tag für Tag ausgeschrieben, nicht als Regel. Er lässt sich in jedes andere System einlesen.",
          "Personalnummern bleiben erhalten, damit die Zuordnung zur Lohnabrechnung nicht verloren geht.",
          "Die Ausgabe ist jederzeit möglich, ohne Ankündigung und ohne zusätzliche Kosten.",
        ]} />
        <Erklaerkasten style={{ marginTop: 14, maxWidth: 740 }}>
          Eine Dienstplanung ist betriebskritisch. Die Frage, wie man wieder herauskommt, gehört
          deshalb an den Anfang eines Vertragsgesprächs und nicht an dessen Ende. Wer sie nicht
          beantworten kann, sollte kein betriebskritisches System verkaufen.
        </Erklaerkasten>
      </Seitenkarte>
        </>}
        seite={<SicherungAusserHaus sitz={sitz} melde={akt.melde} />} />
    </div>);
}
