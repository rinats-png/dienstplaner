/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { H1, Card, CardHead, klickbar, Pill, Schalter, Btn, Rubrik } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { paketVon, PAKETE, paketZustand, pilotAktiv, merkmalNutzbar, PAKET_ZUSTAENDE, paketAnzeige } from "../stufen.js";
import { NUM } from "../ui/thema.js";
import { eur0 } from "../lib/format.js";
import { mandantPaketkosten, folgemonatsanfang, paketTag, paketAufpreisSumme } from "../paketlogik.js";

/** Welche Pakete schlägt eine Branche vor? */
const paketeFuerBranche = (b) => ({
  sicherheit: ["sicherheit"], pflege: ["pflege"], klinik: ["klinik"],
  produktion: ["industrie"], logistik: ["industrie"], rettung: ["klinik"],
}[b] || []);

/* ==========================================================================
   PAKETVERWALTUNG (Betreiber)
   ========================================================================== */
export function Pakete({ db, akt }) {
  const [gewaehlt, setGewaehlt] = useState(db.mandanten[0] ? db.mandanten[0].id : null);
  const m = db.mandanten.find((x) => x.id === gewaehlt);

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Ein Kern, mehrere Branchen. Was ein Betrieb braucht, wird als Paket freigeschaltet — der Rechenkern bleibt für alle derselbe.">
        Branchenpakete</H1>

      <div className="zweispaltig" style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <Card>
          <CardHead>Betriebe</CardHead>
          {db.mandanten.map((x) => (
            <div key={x.id} aria-pressed={x.id === gewaehlt} {...klickbar(() => setGewaehlt(x.id), x.name)}
              style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}`,
                background: x.id === gewaehlt ? C.accentLight : "transparent",
                borderLeft: x.id === gewaehlt ? `3px solid ${C.accent}` : "3px solid transparent" }}>
              <div style={{ fontSize: 13.5, fontWeight: 550 }}>{x.name}</div>
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
                {(x.pakete || []).length ? (x.pakete || []).map((p) => paketVon(p).name).join(", ") : "nur Kern"}
              </div>
            </div>))}
        </Card>

        {m && (
          <div style={{ display: "grid", gap: 14 }}>
            {PAKETE.map((p) => {
              const an = p.pflicht || (m.pakete || []).includes(p.id);
              /* G9: nur Zustand 5 (buchbar und abrechenbar) wird empfohlen, gebucht
                 und berechnet. */
              const zustand = p.pflicht ? 5 : paketZustand(p.id);
              const nutzbar = zustand === 5;
              const pilot = pilotAktiv(m);
              const empfohlen = nutzbar && paketeFuerBranche(m.branche).includes(p.id);
              return (
                <Card key={p.id} style={{ padding: 20, borderColor: an ? C.accent : C.line }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
                    alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16, fontWeight: 650 }}>{p.name}</span>
                        {p.pflicht && <Pill size="sm">immer enthalten</Pill>}
                        {empfohlen && !an && <Pill size="sm" tone="accent">für diese Branche empfohlen</Pill>}
                      </div>
                      <div style={{ fontSize: 13.5, color: C.dim, marginTop: 7, lineHeight: 1.55 }}>
                        {p.beschreibung}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
                        {p.merkmale.map((x) => <Pill key={x} size="sm">
                          {merkmalNutzbar(x) ? x : `${x} (in Vorbereitung)`}</Pill>)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 130 }}>
                      {!nutzbar
                        ? <div style={{ fontSize: 13, color: C.dim }}>In Vorbereitung – Zustand {zustand}:
                            {" "}{PAKET_ZUSTAENDE[zustand]}. Nicht buchbar, wird nicht berechnet.
                            {an && pilot && <div>{paketAnzeige(p.id, { pilot: true })}</div>}</div>
                        : p.aufpreis
                        ? <div style={{ fontSize: 19, fontWeight: 650, ...NUM }}>+{eur0(p.aufpreis)}
                            <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}> /Monat</span></div>
                        : <div style={{ fontSize: 13, color: C.dim }}>im Grundpreis</div>}
                      {/* Unter Zustand 5 lässt sich ein Paket nur im Pilot zubuchen („freigeschaltet, nicht berechnet");
                          ein gebuchtes lässt sich immer abschalten (der Bestand bleibt). */}
                      {!p.pflicht && (nutzbar || an || pilot) && (
                        <div style={{ marginTop: 12 }}>
                          <Schalter an={an} label={`Paket ${p.name}`}
                            onChange={() => akt.setzePaket(m.id, p.id, !an)} />
                        </div>)}
                      {/* Zustand 5, gebucht, aber ohne Abrechnungsgrund: nicht berechnet, bis der Kunde
                          ausdrücklich zugestimmt hat oder eine vertragliche Grundlage dokumentiert ist. */}
                      {!p.pflicht && an && nutzbar && !pilot && mandantPaketkosten(m, 0, undefined, undefined, folgemonatsanfang(paketTag())).ohneGrund.some((x) => x.id === p.id) && (
                        <div style={{ marginTop: 10, fontSize: 12.5, color: C.dim }}>
                          Zustimmung erforderlich – nicht berechnet.
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                            <Btn size="sm" onClick={() => akt.erfasseZustimmung(m.id, p.id)}>Zustimmung festhalten</Btn>
                            <Btn size="sm" onClick={() => akt.setzeGrundlage(m.id, p.id)}>Vertragsgrundlage festhalten</Btn>
                          </div>
                        </div>)}
                    </div>
                  </div>
                </Card>);
            })}

            <Card style={{ padding: 20 }}>
              <Rubrik style={{ marginBottom: 10 }}>Monatlicher Aufpreis</Rubrik>
              <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-.03em", ...NUM }}>
                {eur0(paketAufpreisSumme(m))}
              </div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 1.55 }}>
                Zusätzlich zur Grundgebühr und den Zugängen. Pakete lassen sich jederzeit zu- und
                abschalten — abgerechnet wird tagesgenau. Pakete unter Zustand 5 werden nie berechnet.
              </div>
            </Card>

            {/* Pilot: kostenlos, eingeschränkter Umfang; nur der Betreiber setzt ihn (Protokoll),
                keine Rechnungspositionen, kein Anschein des vollen Funktionsumfangs. */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <div>
                  <Rubrik style={{ marginBottom: 6 }}>Pilotbetrieb</Rubrik>
                  <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
                    Branchenpakete werden im Pilot nicht berechnet; alle übrigen Positionen laufen laut
                    Vertrag weiter (Grundgebühr, Planer, Standorte — außer Status, Sonderpreis oder
                    Aussetzung greifen). Gebuchte Pakete erscheinen als „Pilot – freigeschaltet, nicht
                    berechnet“ mit nutzbaren und noch nicht nutzbaren Funktionen; im Pilot darf der
                    Betreiber Pakete auch unter Zustand 5 zubuchen.
                    {pilotAktiv(m) && ` Aktiv seit ${m.preisgestaltung.pilot.seit}.`}
                  </div>
                </div>
                <Schalter an={pilotAktiv(m)} label="Pilotbetrieb" onChange={() => akt.setzePilot(m.id, !pilotAktiv(m))} />
              </div>
            </Card>
          </div>)}
      </div>
    </div>);
}
