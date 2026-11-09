/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { C } from "../farben.js";
import { Leer, Card, Lab, Btn, Inp, Sel, Field, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { heute, fKurz } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { Kennzahlen } from "../gestalt/ansichten.jsx";
import { Ziehbar, Ablage } from "../ui/ziehen.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { darf } from "../lib/berechtigung.js";


export const MITTEL_ARTEN = [["schluessel", "Schlüssel"], ["fahrzeug", "Fahrzeug"], ["geraet", "Gerät"],
  ["kleidung", "Dienstkleidung"], ["sonstiges", "Sonstiges"]];

export function Betriebsmittel({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ art: "schluessel", name: "", kennung: "", personId: "" });
  const liste = m.betriebsmittel || [];
  const darfPflegen = darf(sitz, "staff.edit") || darf(sitz, "org.edit");
  const jeArt = Object.fromEntries(MITTEL_ARTEN.map(([id]) => [id, liste.filter((x) => x.art === id).length]));
  const ausgegeben = liste.filter((x) => x.personId).length;

  return (
    <div>
      <H1 rubrik="Betrieb" sub="Schlüssel, Fahrzeuge, Geräte und Dienstkleidung — wer hat was, seit wann."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(true)}>Betriebsmittel anlegen</Btn>}>
        Betriebsmittel</H1>

      <Kennzahlen min={160} kacheln={[
        { label: "Erfasst", wert: liste.length },
        { label: "Ausgegeben", wert: ausgegeben, ton: ausgegeben ? "accent" : undefined,
          sub: `${liste.length - ausgegeben} im Bestand` },
        ...MITTEL_ARTEN.slice(0, 3).map(([id, l]) => ({ label: l, wert: jeArt[id] || 0 }))]} />

      <Card>
        {liste.length === 0
          ? <Leer titel="Noch nichts erfasst" text="Lege Schlüssel, Fahrzeuge oder Geräte an und weise sie Personen zu." />
          : liste.map((x, i) => {
            const p = x.personId && m.personen.find((y) => y.id === x.personId);
            return (
              <Ziehbar key={x.id} className="row" aktiv={darfPflegen}
                nutzlast={{ art: "mittel", mittelId: x.id, beschriftung: x.name, farbe: C.accentDeep }}
                style={{ display: "flex", alignItems: "center", gap: 16,
                padding: "14px 22px", borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                flexWrap: "wrap" }}>
                <Pill size="sm">{(MITTEL_ARTEN.find(([id]) => id === x.art) || [])[1]}</Pill>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{x.name}</div>
                  {x.kennung && <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{x.kennung}</div>}
                </div>
                {darfPflegen
                  ? <Sel value={x.personId || ""} style={{ width: 220 }}
                      onChange={(e) => akt.setzeMittel(x.id, "personId", e.target.value || null)}>
                      <option value="">— im Bestand —</option>
                      {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                        <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}
                    </Sel>
                  : <Pill size="sm" tone={p ? "accent" : "neutral"}>{p ? `${p.nachname}` : "im Bestand"}</Pill>}
                {x.seit && <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>seit {fKurz(x.seit)}</span>}
                {darfPflegen && <Btn size="sm" kind="danger" onClick={() => akt.loescheMittel(x.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}
              </Ziehbar>);
          })}
      </Card>

      {darfPflegen && (<>
        <Lab style={{ margin: "24px 0 11px" }}>Ausgabe per Ziehen</Lab>
        <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
          Ein Betriebsmittel aus der Liste oben auf eine Person ziehen gibt es aus.
          Auf „Zurück in den Bestand" ziehen nimmt es zurück.
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Ablage id="mittel:bestand" nimmt={(l) => l.art === "mittel"}
            ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", null)} style={{ borderRadius: 14 }}>
            <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5, color: C.dim }}>
              Zurück in den Bestand</div>
          </Ablage>
          {m.personen.filter((p) => imDienst(p, heute())).slice(0, 24).map((p) => (
            <Ablage key={p.id} id={`mittel:p:${p.id}`} nimmt={(l) => l.art === "mittel"}
              ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", p.id)} style={{ borderRadius: 14 }}>
              <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5 }}>
                {p.nachname}, {p.vorname.slice(0, 1)}.
                <span style={{ color: C.dimmer, marginLeft: 7, ...NUM }}>
                  {liste.filter((x) => x.personId === p.id).length || ""}</span>
              </div>
            </Ablage>))}
        </div>
      </>)}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Betriebsmittel anlegen" width={520}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Art"><Sel value={f.art} onChange={(e) => setF({ ...f, art: e.target.value })}>
              {MITTEL_ARTEN.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Sel></Field>
            <Field label="Kennung" hint="Nummer, Kennzeichen oder Barcode.">
              <Inp value={f.kennung} onChange={(e) => setF({ ...f, kennung: e.target.value })} /></Field>
          </div>
          <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="z. B. Generalschlüssel Haupthaus" /></Field>
          <Field label="Ausgegeben an" hint="Kann später jederzeit geändert werden.">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— im Bestand —</option>
              {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}</Sel></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.name.trim()} onClick={() => {
              akt.neuesMittel(f); setF({ art: "schluessel", name: "", kennung: "", personId: "" }); setNeu(false); }}>
              Anlegen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
