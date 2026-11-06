/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { darf } from "../lib/berechtigung.js";
import { useState, useMemo } from "react";
import { montag, addDays, dow } from "../regelwerk.js";
import { heute, fKurz, DOW } from "../lib/datum.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { wochentage as fahrWochentage, pruefeWoche as fahrzeitWoche, GRENZEN as FAHR_GRENZEN } from "../fahrzeit.js";
import { H1, Btn, Card, Field, Sel, Leer, CardHead, Lab, Inp, Pill } from "../ui/bausteine.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { Kennzahlen, Leitraster } from "../gestalt/ansichten.jsx";
import { n1 } from "../lib/format.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";

/* ==========================================================================
   PFLEGEPERSONALUNTERGRENZEN

   Die Verordnung verlangt einen schichtbezogenen Abgleich: Wie viele
   Patientinnen und Patienten lagen auf der Station, wie viele Pflegekräfte
   waren da, und wie viel davon durfte Hilfskraft sein. Die Rechnung steht
   in ppugv.js und ist dort geprüft; hier wird erfasst und gezeigt.

   Drei Entscheidungen, die man der Ansicht ansehen soll:

   Sie blockiert nicht. Eine unterschrittene Untergrenze hat Folgen für die
   Vergütung und die Meldung — sie ist kein Grund, eine Schicht ungeplant zu
   lassen.

   Sie meldet nicht grün, wenn sie nichts weiß. Ohne Patientenzahl steht
   „nicht bewertbar", und das ist kein Makel der Anwendung, sondern eine
   Aussage über den Betrieb.

   Und sie nennt bei jedem Urteil den Paragrafen und die Fassung. Wer eine
   Meldung abgibt, muss sagen können, wonach gerechnet wurde.
   ========================================================================== */
/* ==========================================================================
   LENK- UND RUHEZEITEN

   Für Fahrpersonal gilt eine zweite, strengere Ordnung als das
   Arbeitszeitgesetz. Die Rechnung steht in fahrzeit.js und ist dort
   geprüft; hier wird erfasst und gezeigt.

   Was diese Ansicht bewusst nicht tut: aus dem Dienstplan eine Lenkzeit
   ableiten. Der Tachograf zeichnet auf, was gefahren wurde; ein Dienst von
   acht Stunden sagt nichts darüber, wie viel davon am Steuer war. Wo nichts
   erfasst ist, steht „nicht erfasst" — nicht „null Stunden".
   ========================================================================== */
export function Lenkzeiten({ sitz, akt }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "plan.edit.unit");
  const [woche, setWoche] = useState(montag(heute()));
  /* Fremde Lenkzeiten bekommt nur, wer sie pflegt — Beschäftigte sehen die
     eigenen (sicht.mjs), alle anderen Einträge wären leer. */
  const fahrer = useMemo(() => m.personen.filter((p) => imDienst(p, woche)
    && (darfPflegen || (sitz.person && p.id === sitz.person.id))), [m, woche, darfPflegen, sitz.person]);
  const [personId, setPersonId] = useState((fahrer[0] || {}).id || "");
  const person = fahrer.find((p) => p.id === personId) || fahrer[0] || null;
  const tage = useMemo(() => fahrWochentage(woche), [woche]);

  const eintrag = (d) => (m.fahrzeiten || {})[`${person ? person.id : ""}|${d}`] || {};

  const lage = useMemo(() => {
    if (!person) return null;
    const vorwoche = fahrWochentage(addDays(woche, -7))
      .map((d) => Number(((m.fahrzeiten || {})[`${person.id}|${d}`] || {}).lenkzeit))
      .filter((x) => Number.isFinite(x));
    return fahrzeitWoche(
      tage.map((d) => ({ datum: d, ...eintrag(d) })),
      vorwoche.length ? vorwoche.reduce((a, b) => a + b, 0) : null);
  }, [m, person, woche, tage]);

  const setz = (d, feld, wert) => akt.setzeFahrzeit(person.id, d, feld, wert);

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Lenkzeit, Unterbrechung und Ruhezeit nach der Verordnung (EG) 561/2006 und der FPersV. Erfasst wird, was der Tachograf aufgezeichnet hat — aus dem Dienstplan lässt sich keine Lenkzeit ableiten."
        right={(<div style={{ display: "flex", gap: 9 }} className="noprint">
          <Btn onClick={() => setWoche(addDays(woche, -7))} aria-label="Woche zurück"><Icon n="chevron-links" size={16} /></Btn>
          <Btn onClick={() => setWoche(montag(heute()))}>Diese Woche</Btn>
          <Btn onClick={() => setWoche(addDays(woche, 7))} aria-label="Woche vor"><Icon n="chevron-rechts" size={16} /></Btn>
        </div>)}>
        Lenkzeiten · {fKurz(woche)} bis {fKurz(addDays(woche, 6))}</H1>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ padding: "20px var(--pad-x)", maxWidth: 420 }}>
          <Field label="Fahrerin oder Fahrer">
            <Sel value={person ? person.id : ""} onChange={(e) => setPersonId(e.target.value)}>
              {fahrer.map((p) => (
                <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>))}</Sel></Field>
        </div>
      </Card>

      {!person ? (
        <Card><Leer titel="Niemand im Bestand"
          text="Für diese Woche ist keine Person im Dienst." /></Card>
      ) : (<>
        <Kennzahlen kacheln={[
          { label: "Lenkzeit der Woche", wert: `${n1(lage.summe / 60)} h`,
            ton: lage.summe > FAHR_GRENZEN.wocheLenkzeit ? "danger" : "ok",
            hervor: lage.summe > FAHR_GRENZEN.wocheLenkzeit ? "danger" : undefined,
            sub: `höchstens ${FAHR_GRENZEN.wocheLenkzeit / 60} h` },
          { label: "Verlängerte Tage", wert: lage.verlaengerungen,
            ton: lage.verlaengerungen > FAHR_GRENZEN.tagVerlaengerungenJeWoche ? "danger" : "ok",
            sub: `höchstens ${FAHR_GRENZEN.tagVerlaengerungenJeWoche} auf zehn Stunden` },
          { label: "Verkürzte Ruhezeiten", wert: lage.verkuerzungen,
            ton: lage.verkuerzungen > FAHR_GRENZEN.verkuerzungenJeWoche ? "danger" : "ok",
            sub: `höchstens ${FAHR_GRENZEN.verkuerzungenJeWoche} auf neun Stunden` },
          { label: "Nicht erfasst", wert: lage.fehlend, ton: lage.fehlend ? "warn" : "ok",
            hervor: lage.fehlend ? "warn" : undefined, sub: "Tage ohne Aufzeichnung" }]} />

        <Leitraster seiteBreite={340}
          haupt={<>
            {lage.befunde.length > 0 && (
              <Card style={{ borderColor: C.danger }}>
                <CardHead>Wochenbefunde</CardHead>
                {lage.befunde.map((b, i) => (
                  <div key={i} style={{ padding: "12px 22px", borderTop: i ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ fontSize: 13.5, color: b.schwere === "danger" ? C.danger : C.dim,
                      lineHeight: 1.55 }}>{b.text}</div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 4 }}>{b.regel}</div>
                  </div>))}
              </Card>)}

            <Card>
              <CardHead right={<Lab>Minuten, wie vom Kontrollgerät gelesen</Lab>}>Die Woche</CardHead>
              <div style={{ overflowX: "auto" }}>
                <table className="raster" style={{ minWidth: 820 }}>
                  <thead><tr>
                    {["Tag", "Kennzeichen", "Lenkzeit", "Unterbrechungen", "Ruhe davor", "Urteil"].map((h) => (
                      <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {tage.map((d, i) => {
                      const e = eintrag(d);
                      const r = lage.tage[i];
                      return (
                        <tr key={d} style={r.urteil === "rot" ? { background: C.dangerLight } : undefined}>
                          <td style={{ whiteSpace: "nowrap", ...NUM }}>
                            {DOW[dow(d)]} {fKurz(d)}</td>
                          <td>
                            <Inp style={{ width: 110, padding: "6px 8px", minHeight: 34 }} disabled={!darfPflegen}
                              value={e.kennzeichen || ""} placeholder="—"
                              onChange={(ev) => setz(d, "kennzeichen", ev.target.value)}
                              aria-label={`Kennzeichen am ${d}`} /></td>
                          <td>
                            <Inp type="number" min="0" step="5" style={{ width: 84, padding: "6px 8px", minHeight: 34 }}
                              disabled={!darfPflegen}
                              value={e.lenkzeit ?? ""} placeholder="—"
                              onChange={(ev) => setz(d, "lenkzeit", ev.target.value)}
                              aria-label={`Lenkzeit in Minuten am ${d}`} /></td>
                          <td>
                            <Inp style={{ width: 120, padding: "6px 8px", minHeight: 34 }} disabled={!darfPflegen}
                              value={(e.unterbrechungen || []).join(", ")} placeholder="45 oder 15, 30"
                              onChange={(ev) => setz(d, "unterbrechungen", ev.target.value)}
                              aria-label={`Unterbrechungen in Minuten am ${d}`} /></td>
                          <td>
                            <Inp type="number" min="0" step="15" style={{ width: 84, padding: "6px 8px", minHeight: 34 }}
                              disabled={!darfPflegen}
                              value={e.ruhezeitDavor ?? ""} placeholder="—"
                              onChange={(ev) => setz(d, "ruhezeitDavor", ev.target.value)}
                              aria-label={`Ruhezeit vor dem Dienst am ${d}`} /></td>
                          <td style={{ minWidth: 240, height: "auto", padding: "10px var(--pad-x)" }}>
                            <Pill size="sm" tone={r.urteil === "rot" ? "danger" : r.urteil === "grau" ? "neutral" : "ok"}>
                              {r.urteil === "rot" ? "unzulässig"
                                : r.urteil === "grau" ? "nicht erfasst" : "zulässig"}</Pill>
                            {r.befunde.map((b, j) => (
                              <div key={j} style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45,
                                color: b.schwere === "danger" ? C.danger : C.dim }}>{b.text}</div>))}
                          </td>
                        </tr>);
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>}
          seite={
            <Erklaerkasten>
              <b style={{ color: C.text }}>Wonach gerechnet wird.</b>{" "}
              Täglich neun Stunden am Steuer, höchstens zweimal je Woche zehn (Art. 6 Abs. 1).
              56 Stunden je Woche, 90 in zwei aufeinanderfolgenden Wochen (Art. 6 Abs. 2, 3).
              Nach viereinhalb Stunden 45 Minuten Unterbrechung — teilbar in 15 und danach
              30 Minuten, nicht umgekehrt (Art. 7). Elf Stunden tägliche Ruhe, dreimal
              zwischen zwei Wochenruhezeiten neun (Art. 8).
              <div style={{ marginTop: 10 }}>
                Diese Ansicht ersetzt kein Kontrollgerät. Sie plant und dokumentiert; im
                Streitfall gilt die Aufzeichnung des Tachografen.
              </div>
            </Erklaerkasten>} />
      </>)}
    </div>);
}
