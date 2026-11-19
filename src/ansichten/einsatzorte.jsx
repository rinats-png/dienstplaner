/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { koordinateGueltig, EINSATZORT_ARTEN, RADIUS_MIN, RADIUS_MAX, EINSATZORT_RADIUS_VORGABE, radiusGueltig } from "../../server/lib/geo.mjs";
import { C } from "../farben.js";
import { Pill, Btn, Card, CardHead, Field, Inp, Sel } from "../ui/bausteine.jsx";
import { fDatum, heute } from "../lib/datum.js";
import { useState, useEffect } from "react";
import { koordinatenFelder } from "../stempelvorgang.js";


export const QUELLE_TEXT = { adresse: "Adresse", geraet: "Gerät", karte: "Karte", manuell: "von Hand" };
export const ART_TEXT = { kunde: "Kunde", objekt: "Objekt", patient: "Patient/in", baustelle: "Baustelle", sonstiger: "Sonstiger" };

/** Herkunft und Bestätigung der Koordinate (Spezifikation B2): beschreibt, woher sie kommt, nicht wie gut sie ist. */
export function KoordinatenStatus({ ort, onBestaetigen }) {
  if (!koordinateGueltig(ort.lat, ort.lon)) return null;
  const quelle = QUELLE_TEXT[ort.koordinatenQuelle];
  const am = typeof ort.koordinatenGeprueftAm === "string" ? ort.koordinatenGeprueftAm : null;
  return (<>
    <span style={{ fontSize: 12.5, color: C.dim }}>Quelle: {quelle || "nicht angegeben"}</span>
    {am ? <Pill size="sm" tone="ok">bestätigt am {fDatum(am)}</Pill> : (<>
      <Pill size="sm">noch nicht bestätigt</Pill>
      <Btn size="sm" onClick={onBestaetigen}>Koordinate bestätigen</Btn></>)}
  </>);
}

/**
 * Einsatzorte (WP-20): Orte außerhalb der Standorte — Kunde, Objekt, Baustelle —, auf die sich die
 * Standortprüfung einer Dienstart beziehen kann. Sie haben keinen Einfluss auf Preis oder Feiertage;
 * Koordinate und Umkreis sehen nur Planung und Leitung, der Server entscheidet über den Stempel.
 */
export function Einsatzorte({ sitz, akt }) {
  const m = sitz.mandant;
  const liste = m.einsatzorte || [];
  const [name, setName] = useState("");
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill>{liste.length}</Pill>}>Einsatzorte</CardHead>
      <div style={{ padding: 22, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
          Ein Einsatzort ist ein Ziel für Dienstarten ohne festen Standort der Einheit — etwa ein Kunde oder eine
          Baustelle. Die Dienstart wählt ihn unter „Standortprüfung bezieht sich auf“. Gespeichert wird beim Stempeln
          nur das Ergebnis und eine grobe Abstandsklasse, nie eine Koordinate. Bitte als Bezeichnung keinen
          Personennamen verwenden.
        </div>
        {liste.map((o) => {
          const verwendet = (m.dienstarten || []).filter((d) => d.ortModus === "einsatzort" && d.einsatzortId === o.id);
          return (
            <div key={o.id} className="karte-still" style={{ borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                <Field label="Bezeichnung"><Inp value={o.name} onChange={(e) => akt.setzeEinsatzort(o.id, { name: e.target.value })} /></Field>
                <Field label="Art"><Sel value={o.art || "sonstiger"} onChange={(e) => akt.setzeEinsatzort(o.id, { art: e.target.value })}>
                  {EINSATZORT_ARTEN.map((a) => <option key={a} value={a}>{ART_TEXT[a]}</option>)}</Sel></Field>
                <GeoZahl label="Breitengrad" wert={o.lat} hinweis="−90 bis 90"
                  gueltig={(x) => koordinateGueltig(x, 0)} onCommit={(x) => akt.setzeEinsatzort(o.id, koordinatenFelder("lat", x))} />
                <GeoZahl label="Längengrad" wert={o.lon} hinweis="−180 bis 180"
                  gueltig={(x) => koordinateGueltig(0, x)} onCommit={(x) => akt.setzeEinsatzort(o.id, koordinatenFelder("lon", x))} />
                <GeoZahl label="Umkreis in Metern" wert={o.radius} hinweis={`${RADIUS_MIN} bis ${RADIUS_MAX}; ohne Angabe ${EINSATZORT_RADIUS_VORGABE} m`}
                  gueltig={radiusGueltig} onCommit={(x) => akt.setzeEinsatzort(o.id, { radius: x })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
                  <input type="checkbox" checked={o.aktiv !== false} onChange={(e) => akt.setzeEinsatzort(o.id, { aktiv: e.target.checked })} />
                  <span>Aktiv</span></label>
                <KoordinatenStatus ort={o} onBestaetigen={() => akt.setzeEinsatzort(o.id, { koordinatenGeprueftAm: heute() })} />
                {o.aktiv === false && <Pill size="sm">Stempel gelten als „nicht bewertbar“</Pill>}
                {koordinateGueltig(o.lat, o.lon) && radiusGueltig(o.radius ?? EINSATZORT_RADIUS_VORGABE)
                  ? <Pill size="sm" tone="ok">Prüfung möglich</Pill>
                  : <Pill size="sm">Ohne Koordinate „nicht bewertbar“</Pill>}
                {verwendet.length > 0 && <Pill size="sm">verwendet von {verwendet.map((d) => d.name).join(", ")}</Pill>}
                <span style={{ flex: 1 }} />
                <Btn size="sm" kind="danger" disabled={verwendet.length > 0} onClick={() => akt.loescheEinsatzort(o.id)}>Entfernen</Btn>
              </div>
            </div>);
        })}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Neuer Einsatzort" style={{ flex: "1 1 220px" }}>
            <Inp value={name} placeholder="Baustelle Hafenstraße" onChange={(e) => setName(e.target.value)} /></Field>
          <Btn kind="primary" disabled={name.trim().length < 2} onClick={() => { akt.einsatzortAnlegen(name.trim()); setName(""); }}>Anlegen</Btn>
        </div>
      </div>
    </Card>);
}

/** Zahlenfeld, das nur gültige Werte speichert (beim Verlassen). Leer = nicht gesetzt. */
export function GeoZahl({ label, wert, gueltig, hinweis, onCommit }) {
  const [text, setText] = useState(wert === undefined || wert === null ? "" : String(wert));
  useEffect(() => { setText(wert === undefined || wert === null ? "" : String(wert)); }, [wert]);
  const roh = text.trim().replace(",", ".");
  const zahl = roh === "" ? undefined : Number(roh);
  const ok = zahl === undefined || gueltig(zahl);
  return (
    <Field label={label} hint={ok ? hinweis : "Ungültig — wird nicht gespeichert."}>
      <Inp value={text} inputMode="decimal" onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (ok && zahl !== wert) onCommit(zahl); }}
        style={ok ? undefined : { borderColor: C.danger }} /></Field>);
}

/* --------------------------------------------------------------------------
   REGELWERK

   Fünf Zahlenfelder, und jede davon verschiebt, was die Prüfung als
   Verstoß meldet. Sichtbar war davon nichts: Wer die Mindestruhezeit von
   elf auf zehn Stunden setzte, sah ein Feld mit einer neuen Zahl darin —
   dass damit im laufenden Monat vier Befunde verschwanden, stand nur in
   einer anderen Ansicht, die man dafür aufsuchen musste.

   Deshalb steht unter den Feldern jetzt die Folge: wie viele Befunde die
   Prüfung mit den Werten von vorhin meldete und wie viele mit den
   jetzigen. Es ist dieselbe Rechnung wie in der Prüfungsansicht, nur
   zweimal ausgeführt — einmal mit dem Ausgangsstand.

   Weniger Befunde sind ausdrücklich kein Erfolg: Eine gelockerte Grenze
   beseitigt keinen einzigen Dienst, sie hört nur auf, ihn zu melden. Der
   Ton der Anzeige folgt deshalb der Richtung der Grenze, nicht der
   Richtung der Zahl.
   -------------------------------------------------------------------------- */
