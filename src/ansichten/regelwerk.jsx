/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo, useRef } from "react";
import { pad, dim_ } from "../regelwerk.js";
import { C } from "../farben.js";
import { Card, CardHead, Lab, Inp, Field } from "../ui/bausteine.jsx";
import { MON, heute } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Sprung } from "../ui/leisten.jsx";
import { pruefen } from "../lib/fachlogik.js";


export const REGELFELDER = [
  ["ruhezeit", "Mindestruhezeit zwischen Diensten in Stunden", "strenger_ist_hoeher"],
  ["maxFolge", "Höchstzahl Dienste in Folge", "strenger_ist_niedriger"],
  ["maxNachtFolge", "Höchstzahl Nachtdienste in Folge", "strenger_ist_niedriger"],
  ["maxUrlaubJeEinheit", null, "strenger_ist_niedriger"],
  ["sollWochenstunden", "Vertragliche Wochenarbeitszeit", null],
];

/** Die Befundarten, die unmittelbar an einer Regelgrenze hängen. */
export const REGELBEFUNDE = ["ruhezeit", "folge", "nachtfolge", "urlaub"];

export function Regelwerk({ m, akt }) {
  const ym = heute().slice(0, 7);
  const [y, mo] = ym.split("-").map(Number);
  const von = `${ym}-01`, bis = `${ym}-${pad(dim_(y, mo - 1))}`;

  /* Der Ausgangsstand wird einmal festgehalten, beim Öffnen der Seite.
     Ihn bei jeder Änderung nachzuziehen hieße, dass der Vergleich immer
     null ergibt — dann zeigte die Anzeige nie etwas an. */
  const ausgang = useRef(m.einstellungen);
  /* Beim laufenden Stand auf dem Mandanten selbst prüfen, nicht auf einer
     Kopie: Die Zwischenergebnisse hängen am Objekt, und eine Kopie wirft
     sie alle weg. Nur der Vergleichsstand braucht eine. */
  const zaehle = (einst) => (einst === m.einstellungen
    ? pruefen(m, von, bis)
    : pruefen({ ...m, einstellungen: einst }, von, bis))
    .filter((b) => REGELBEFUNDE.includes(b.art)).length;

  const jetzt = useMemo(() => zaehle(m.einstellungen), [m, ym]);
  const vorher = useMemo(() => zaehle(ausgang.current), [m, ym]);

  /* Strenger geworden oder lockerer? Nicht an der Zahl der Befunde
     abzulesen, sondern an der Grenze selbst. */
  const richtung = REGELFELDER.reduce((acc, [k, , art]) => {
    if (!art || acc) return acc;
    const a = Number(ausgang.current[k]), b = Number(m.einstellungen[k]);
    if (a === b) return acc;
    const strenger = art === "strenger_ist_hoeher" ? b > a : b < a;
    return strenger ? "strenger" : "lockerer";
  }, null);

  return (
    <Card>
      <CardHead>Regelwerk</CardHead>
      <div style={{ padding: 22, display: "grid", gap: 14 }}>
        {REGELFELDER.map(([k, l]) => (
          <Field key={k} label={l || `Gleichzeitige Urlaube je ${m.einheitLabel}`}>
            <Inp type="number" step="0.5" value={m.einstellungen[k]}
              onChange={(e) => akt.setzeEinstellung(k, Number(e.target.value))} /></Field>))}

        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 16, marginTop: 2 }}>
          <Lab style={{ marginBottom: 9 }}>Was das für {MON[mo - 1]} bedeutet</Lab>
          {jetzt === vorher ? (
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
              {jetzt === 0
                ? "Die Prüfung meldet keinen Verstoß gegen diese Grenzen."
                : `Die Prüfung meldet ${zahl(jetzt)} Befund${jetzt > 1 ? "e" : ""} zu Ruhezeit, Dienst- und Nachtfolgen.`}
            </div>
          ) : (<>
            <Sprung gross={false} vorher={zahl(vorher)} nachher={zahl(jetzt)}
              einheit={`Befund${jetzt === 1 ? "" : "e"}`}
              ton={richtung === "lockerer" ? "warn" : "ok"}
              differenz={`${jetzt > vorher ? "+" : "−"}${zahl(Math.abs(jetzt - vorher))}`} />
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 10, maxWidth: 520 }}>
              {richtung === "lockerer"
                ? "Die Grenze ist gelockert. An den geplanten Diensten ändert das nichts — sie werden nur nicht mehr gemeldet."
                : "Die Grenze ist verschärft. Die zusätzlichen Befunde bestehen seit jeher; sie fielen bisher unter die alte Grenze."}
            </div>
          </>)}
        </div>
      </div>
    </Card>);
}
