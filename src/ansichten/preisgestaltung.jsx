/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { gestaltung, monateZwischen, lagetext } from "../preisgestaltung.js";
import { useState } from "react";
import { Card, CardHead, Lab, Field, Inp, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { eur } from "../lib/format.js";
import { heute } from "../lib/datum.js";
import { ROLLEN, ROLLEN_VORGABE } from "../lib/rollen.js";

/* ==========================================================================
   PREISGESTALTUNG — was jenseits der drei Tarifstufen vereinbart wurde

   Drei Dinge, die verschieden genug sind, um getrennt zu bleiben: ein
   fester Betrag statt der Tarifrechnung, eine befristet kostenlose Zeit,
   und einzelne Monate, in denen nicht abgerechnet wird.

   Alle drei greifen sofort und wirken auf jede künftige Rechnung. Deshalb
   steht neben jedem Feld, was es bedeutet — und deshalb zeigt der Kopf
   dieser Karte immer, was der Tarif ergeben hätte.
   ========================================================================== */
/**
 * Der Monatsletzte, n Monate nach dem angegebenen Tag.
 *
 * „Ein Monat kostenlos" endet nicht am 14. September, sondern am 30. Ein
 * halber Abrechnungsmonat ist eine Rechnung, die niemand erklären kann.
 */
function monatsende(isoTag, n) {
  const [j, mo] = String(isoTag).slice(0, 10).split("-").map(Number);
  const ziel = new Date(Date.UTC(j, mo - 1 + n + 1, 0));   // Tag 0 = letzter des Vormonats
  return ziel.toISOString().slice(0, 10);
}

export function Preisgestaltung({ m, p, akt }) {
  const g = gestaltung(m);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [grund, setGrund] = useState("");

  const sonder = !!g.sonderpreis;

  return (
    <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
      <Card>
        <CardHead right={<Lab>{p.gestaltung.herkunft === "sonderpreis" ? "individuell" : "nach Tarif"}</Lab>}>
          Preisgestaltung</CardHead>
        <div style={{ padding: 22, display: "grid", gap: 18 }}>

          {/* ---------------------------- Sonderpreis ------------------- */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={sonder}
                onChange={(e) => akt.setzeGestaltung(m.id, "sonderpreis",
                  e.target.checked ? { betrag: p.tarifwert, bezeichnung: "" } : null)} />
              <span style={{ fontSize: 14, fontWeight: 550 }}>Fester Monatspreis statt Tarifrechnung</span>
            </label>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 6, marginLeft: 26 }}>
              Ersetzt Standortpreise, Mengenstaffel und Pakete. Der Tarifwert
              bleibt zum Vergleich sichtbar.
            </div>
            {sonder && (
              <div style={{ marginLeft: 26, marginTop: 12, display: "grid", gap: 11 }}>
                <Field label="Netto je Monat in Euro">
                  <Inp type="number" min={0} step="0.01" value={g.sonderpreis.betrag}
                    onChange={(e) => akt.setzeGestaltung(m.id, "sonderpreis",
                      { ...g.sonderpreis, betrag: Math.max(0, Number(e.target.value)) })} /></Field>
                <Field label="Bezeichnung auf der Rechnung"
                  hint="Erscheint als Positionstext. Leer lassen für die Vorgabe.">
                  <Inp value={g.sonderpreis.bezeichnung === "Individuelle Vereinbarung" ? "" : g.sonderpreis.bezeichnung}
                    placeholder="Rahmenvertrag 2026"
                    onChange={(e) => akt.setzeGestaltung(m.id, "sonderpreis",
                      { ...g.sonderpreis, bezeichnung: e.target.value })} /></Field>
                <div style={{ fontSize: 12.5, color: p.gestaltung.abweichung < 0 ? C.ok : C.warn, ...NUM }}>
                  {p.gestaltung.abweichung === 0 ? "Entspricht dem Tarif."
                    : p.gestaltung.abweichung < 0
                      ? `${eur(Math.abs(p.gestaltung.abweichung))} günstiger als der Tarif.`
                      : `${eur(p.gestaltung.abweichung)} über dem Tarif.`}
                </div>
              </div>)}
          </div>

          {/* ------------------------------ Rabatt ---------------------- */}
          <div style={{ paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
            <Field label="Nachlass in Prozent"
              hint="Wirkt auf den Sonderpreis, wenn einer gesetzt ist — sonst auf die Tarifrechnung.">
              <Inp type="number" min={0} max={100} value={Math.round((m.rabattGrund || 0) * 100)}
                onChange={(e) => akt.setzeMandantFeld(m.id, "rabattGrund",
                  Math.min(100, Math.max(0, Number(e.target.value))) / 100)} /></Field>
          </div>

          {/* -------------------------- Kostenlose Zeit ----------------- */}
          <div style={{ paddingTop: 16, borderTop: `1px solid ${C.lineSoft}`, display: "grid", gap: 11 }}>
            <Field label="Kostenlos bis einschließlich"
              hint="Frei wählbar. Bis dahin entsteht keine Rechnung; danach gilt wieder, was oben steht.">
              <Inp type="date" value={g.freiBis || ""}
                onChange={(e) => akt.setzeGestaltung(m.id, "freiBis", e.target.value || null)} /></Field>
            {g.freiBis && (<>
              <Field label="Grund">
                <Inp value={g.freiGrund} placeholder="Einführungsphase"
                  onChange={(e) => akt.setzeGestaltung(m.id, "freiGrund", e.target.value)} /></Field>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 3, 6].map((n) => (
                  <Btn key={n} size="sm" onClick={() => akt.setzeGestaltung(m.id, "freiBis",
                    monatsende(heute(), n))}>{n} {n === 1 ? "Monat" : "Monate"} ab heute</Btn>))}
                <Btn size="sm" kind="danger" onClick={() => akt.setzeGestaltung(m.id, "freiBis", null)}>
                  Aufheben</Btn>
              </div>
            </>)}
            {!g.freiBis && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 3, 6].map((n) => (
                  <Btn key={n} size="sm" onClick={() => akt.setzeGestaltung(m.id, "freiBis",
                    monatsende(heute(), n))}>{n} {n === 1 ? "Monat" : "Monate"} kostenlos</Btn>))}
              </div>)}
          </div>

          {/* ---------------------------- Aussetzungen ------------------ */}
          <div style={{ paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
            <Lab style={{ marginBottom: 10 }}>Zahlung aussetzen</Lab>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12 }}>
              Ganze Monate, in denen nicht abgerechnet wird. Der Vertrag läuft
              weiter — der Betrieb bleibt nutzbar, es entsteht nur keine Rechnung.
            </div>
            {g.aussetzungen.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                {g.aussetzungen.map((a, i) => (
                  <div key={`${a.von}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10,
                    background: C.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 13, ...NUM }}>
                      {a.von}{a.bis !== a.von ? ` – ${a.bis}` : ""}</span>
                    <span style={{ fontSize: 12, color: C.dimmer }}>
                      {monateZwischen(a.von, a.bis)} {monateZwischen(a.von, a.bis) === 1 ? "Monat" : "Monate"}
                      {a.grund ? ` · ${a.grund}` : ""}</span>
                    <span style={{ flex: 1 }} />
                    <Btn size="sm" kind="danger" onClick={() => akt.aussetzungWeg(m.id, i)}>Zurücknehmen</Btn>
                  </div>))}
              </div>)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Von (JJJJ-MM)">
                <Inp type="month" value={von} onChange={(e) => setVon(e.target.value)} /></Field>
              <Field label="Bis (leer = ein Monat)">
                <Inp type="month" value={bis} onChange={(e) => setBis(e.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end" }}>
              <Field label="Grund" style={{ flex: 1 }}>
                <Inp value={grund} placeholder="Umbau, Saisonpause …"
                  onChange={(e) => setGrund(e.target.value)} /></Field>
              <Btn kind="primary" disabled={!von}
                onClick={() => { akt.aussetzungHinzu(m.id, von, bis, grund);
                  setVon(""); setBis(""); setGrund(""); }}>Aussetzen</Btn>
            </div>
          </div>

          <div style={{ paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`,
            fontSize: 12.5, color: C.dim }}>{lagetext(m, heute())}</div>
        </div>
      </Card>

      {/* ---------------------- Rollenbezeichnungen ----------------------
          Beim Einrichten eines Hauses weiß der Betreiber, ob dort
          Stationsleitung oder Wohnbereichsleitung gesagt wird. Später
          pflegt der Betrieb es selbst.                                    */}
      <Card>
        <CardHead right={Object.keys(m.rollennamen || {}).length > 0
          ? <Btn size="sm" onClick={() => akt.setzeMandantFeld(m.id, "rollennamen", undefined)}>
            Auf Vorgabe</Btn>
          : null}>Rollenbezeichnungen</CardHead>
        <div style={{ padding: "14px 22px 0", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
          Nur die Anzeige im Betrieb. Rechte, Vergaberang und Preisberechnung
          hängen an der Kennung darunter und bleiben unberührt.
        </div>
        <div style={{ padding: 22, display: "grid", gap: 12 }}>
          {ROLLEN.filter((r) => !r.extern).map((r) => (
            <Field key={r.id} label={ROLLEN_VORGABE[r.id]} hint={r.id}>
              <Inp value={(m.rollennamen || {})[r.id] || ""} placeholder={ROLLEN_VORGABE[r.id]}
                onChange={(e) => {
                  const wert = e.target.value.trim();
                  const alt = { ...(m.rollennamen || {}) };
                  if (wert) alt[r.id] = wert; else delete alt[r.id];
                  akt.setzeMandantFeld(m.id, "rollennamen", alt);
                }} /></Field>))}
        </div>
      </Card>
    </div>);
}
