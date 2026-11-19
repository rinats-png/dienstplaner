/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { positionsUebernahme, POSITION_OPTIONEN, koordinatenFelder } from "../stempelvorgang.js";
import { preis, LAENDER } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { jeStandort as aufstellungJeStandort, STANDORT_BAENDER, standortZuschlag } from "../standorte.js";
import { heute } from "../lib/datum.js";
import { Card, CardHead, Pill, Field, Inp, Sel, Btn } from "../ui/bausteine.jsx";
import { eur, zahl } from "../lib/format.js";
import { C } from "../farben.js";
import { standortBundesland, koordinateGueltig, RADIUS_MIN, RADIUS_MAX, radiusGueltig, RADIUS_VORGABE } from "../../server/lib/geo.mjs";
import { NUM } from "../ui/thema.js";
import { mehrzahl, rollenName } from "../lib/rollen.js";
import { GeoZahl } from "./einsatzorte.jsx";
import { KoordinatenStatus } from "./einsatzorte.jsx";

export function Standorte({ sitz, akt }) {
  const m = sitz.mandant;
  const [ortung, setOrtung] = useState(null);
  /* „Aktuelle Position übernehmen": Positionsabfrage nur nach diesem Klick. */
  const positionUebernehmen = (st) => {
    if (!navigator.geolocation) { akt.melde("Dieses Gerät gibt keine Position heraus."); return; }
    setOrtung(st.id);
    navigator.geolocation.getCurrentPosition((pos) => {
      setOrtung(null);
      const u = positionsUebernahme(pos);
      if (!u.ok) { akt.melde(u.meldung); return; }
      akt.setzeStandortFelder(st.id, u.felder);
      akt.melde(u.meldung);
    }, () => { setOrtung(null); akt.melde("Keine Position erhalten — Standortfreigabe prüfen oder Werte eintragen."); },
    POSITION_OPTIONEN);
  };
  const p = preis(sitz.db, m);
  /* Preise nur mit billing.view (B2): Die Planung führt Standorte, die
     Kosten sieht sie nicht — ihr fehlt auch die Preisgrundlage. */
  const preiseSichtbar = darf(sitz, "billing.view");

  const [name, setName] = useState("");
  const [land, setLand] = useState(m.bundesland);

  const liste = m.standorte || [];
  const aufstellung = aufstellungJeStandort(m, heute());
  /* Die größten Standorte sind die kostenlosen — dieselbe Sortierung wie
     in preis(), damit die Seite genau das anzeigt, was die Rechnung meint. */
  const nachGroesse = [...aufstellung].sort((a, b) => b.personen - a.personen);

  const anlegen = () => {
    const n = name.trim();
    if (n.length < 2) return;
    akt.standortAnlegen(n, land);
    setName("");
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHead right={!preiseSichtbar ? null : p.summeStandorte > 0
        ? <Pill tone="warn">+{eur(p.summeStandorte)} / Monat</Pill>
        : <Pill tone="ok">kostenlos enthalten</Pill>}>
        Standorte</CardHead>
      <div style={{ padding: "16px 22px 0", fontSize: 13.5, color: C.dim, lineHeight: 1.5, maxWidth: 720 }}>
        Standorte arbeiten unabhängig: eigene Einheiten, eigene Besetzung, oft
        eigenes Bundesland und damit eigene Feiertage.
        {preiseSichtbar && (<>{" "}Anlegen kostet nichts —
        {" "}{zahl(p.stufe.standorteInklusive)} der größten Standorte sind in der
        Stufe {p.stufe.name} enthalten, unabhängig von ihrer Größe. Ein
        zusätzlicher, kleinerer Standort kostet erst ab {zahl(STANDORT_BAENDER[0].bis + 1)} Personen —
        siehe die Aufstellung unten.</>)}
      </div>

      <div style={{ padding: 22, display: "grid", gap: 10 }}>
        {liste.map((st) => {
          const a = aufstellung.find((x) => x.standort.id === st.id);
          const einheiten = m.einheiten.filter((e) => (e.standortId || liste[0].id) === st.id);
          const rang = nachGroesse.findIndex((x) => x.standort.id === st.id);
          const inklusive = rang > -1 && rang < p.stufe.standorteInklusive;
          const zuschlag = inklusive ? 0 : standortZuschlag(a ? a.personen : 0);
          return (
            <div key={st.id} className="karte-still" style={{ borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
                <Field label="Name">
                  <Inp value={st.name} onChange={(e) => akt.setzeStandort(st.id, "name", e.target.value)} /></Field>
                <Field label="Bundesland" hint="Bestimmt die Feiertage dieses Standorts.">
                  <Sel value={standortBundesland(st) || m.bundesland}
                    onChange={(e) => akt.setzeStandort(st.id, "bundesland", e.target.value)}>
                    {LAENDER.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
              </div>
              {/* Adresse ist Anzeigetext; geprüft wird gegen Koordinate und Umkreis. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 12 }}>
                {[["strasse", "Straße"], ["hausnummer", "Hausnummer"], ["plz", "PLZ"], ["ort", "Ort"]].map(([k, l]) => (
                  <Field key={k} label={l}>
                    <Inp value={(st.adresse || {})[k] || ""}
                      onChange={(e) => akt.setzeStandort(st.id, "adresse", { ...(st.adresse || {}), [k]: e.target.value })} /></Field>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 12 }}>
                <GeoZahl label="Breitengrad" wert={st.lat} hinweis="−90 bis 90, z. B. 50.1109"
                  gueltig={(x) => koordinateGueltig(x, 0)} onCommit={(x) => akt.setzeStandortFelder(st.id, koordinatenFelder("lat", x))} />
                <GeoZahl label="Längengrad" wert={st.lon} hinweis="−180 bis 180, z. B. 8.6821"
                  gueltig={(x) => koordinateGueltig(0, x)} onCommit={(x) => akt.setzeStandortFelder(st.id, koordinatenFelder("lon", x))} />
                <GeoZahl label="Umkreis in Metern" wert={st.radius} hinweis={`${RADIUS_MIN} bis ${RADIUS_MAX}; 200 m sind ein guter Anfang`}
                  gueltig={radiusGueltig} onCommit={(x) => akt.setzeStandort(st.id, "radius", x)} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <Btn size="sm" disabled={ortung === st.id} onClick={() => positionUebernehmen(st)}>
                  {ortung === st.id ? "Position wird ermittelt …" : "Aktuelle Position übernehmen"}</Btn>
                {koordinateGueltig(st.lat, st.lon) && radiusGueltig(st.radius ?? RADIUS_VORGABE)
                  ? <Pill size="sm" tone="ok">Standortprüfung möglich</Pill>
                  : <Pill size="sm">Standortprüfung nicht möglich — Stempel gelten als „nicht bewertbar"</Pill>}
                <KoordinatenStatus ort={st} onBestaetigen={() => akt.setzeStandortFelder(st.id, { koordinatenGeprueftAm: heute() })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                  {zahl(einheiten.length)} {mehrzahl(m.einheitLabel)} · {zahl(a ? a.personen : 0)} Personen
                </span>
                {a && Object.entries(a.rollen).filter(([, n]) => n > 0).map(([r, n]) => (
                  <Pill key={r} size="sm">{n}× {rollenName(m, r)}</Pill>))}
                {preiseSichtbar && (<Pill size="sm" tone={zuschlag > 0 ? "warn" : "ok"}>
                  {inklusive ? "im Kontingent" : zuschlag > 0 ? `+${eur(zuschlag)} / Monat` : "unter der Schwelle"}</Pill>)}
                <span style={{ flex: 1 }} />
                {liste.length > 1 && (
                  <Btn size="sm" kind="danger" onClick={() => akt.loescheStandort(st.id)}>Entfernen</Btn>)}
              </div>
            </div>);
        })}

        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 16, marginTop: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Neuer Standort" style={{ flex: "1 1 220px" }}>
              <Inp value={name} placeholder="Niederlassung Hannover"
                onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Bundesland" style={{ flex: "0 1 190px" }}>
              <Sel value={land} onChange={(e) => setLand(e.target.value)}>
                {LAENDER.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
            <Btn kind="primary" disabled={name.trim().length < 2} onClick={anlegen}>Anlegen</Btn>
          </div>
          {preiseSichtbar && (<div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8 }}>
            Ein neuer Standort ist leer und kostet nichts. Erst wenn Personal
            zugeordnet wird und er über die Schwelle wächst, entsteht ein
            Zuschlag — sichtbar oben an der jeweiligen Karte.
          </div>)}
        </div>
      </div>
    </Card>);
}
