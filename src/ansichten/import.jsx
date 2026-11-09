/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { C } from "../farben.js";
import { Card, Lab, Btn, Sel, Kpi, KpiRow, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { n1 } from "../lib/format.js";
import { Icon } from "../gestalt/icons.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { importParsen, importZuordnen, importPruefen, IMPORT_BEISPIEL } from "../lib/fachlogik.js";
import { rolle } from "../lib/rollen.js";


/* ===================== ABRECHNUNGSDATEN: ZUSCHLÄGE UND KONTEN ============ */
/**
 * Stempelbefunde eines Monats für die Leitung: je Stempel Start, Ende,
 * Geo-Befund, gerundete Entfernung, Genauigkeit, Referenzstandort und
 * Kennzeichen. Keine Karte, keine Koordinate, kein Verlauf.
 */
export function Import({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [text, setText] = useState("");
  const [pruef, setPruef] = useState(null);
  const [anlegen, setAnlegen] = useState(true);
  /* IMP-1 Review: Die Rollenprüfung rechnet mit der Rolle des Anwenders, nicht mit der Vorgabe „planer“
     (sonst wäre eine Leitung fälschlich gesperrt). sitz.rolle ist hier stets „kunde“ (Mandantensitzung);
     maßgeblich ist die Rolle der angemeldeten Person. */
  const optionen = { vergeber: sitz.person && sitz.person.rolle };

  const analysieren = () => {
    const { kopf, daten } = importParsen(text);
    if (!daten.length) return;
    const { zu, herkunft } = importZuordnen(kopf, daten);
    setPruef({ ...importPruefen(m, kopf, daten, zu, {}, optionen), kopf, zu, herkunft, daten });
  };

  /* Zuordnung von Hand ändern — die Erkennung ist gut, aber nicht unfehlbar. */
  const setzeSpalte = (feld, idx) => {
    const zu = { ...pruef.zu };
    if (idx === "") delete zu[feld]; else zu[feld] = Number(idx);
    setPruef({ ...importPruefen(m, pruef.kopf, pruef.daten, zu, {}, optionen), kopf: pruef.kopf,
      zu, herkunft: { ...pruef.herkunft, [feld]: "hand" }, daten: pruef.daten });
  };

  return (
    <Sheet open onClose={onClose} titel="Personal importieren" width={860}>
      {!pruef && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
            Inhalt aus einer Tabelle einfügen — Semikolon, Tabulator oder Komma als Trenner.
            Die erste Zeile muss die Überschriften enthalten; sie werden automatisch zugeordnet.
            Erkannt werden Nachname, Vorname, Einheit, Funktion, Wochenstunden, Urlaub, Eintritt,
            Zugangsart, Qualifikationen und Teilzeit.
          </div>
          <textarea className="inp" rows={11} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={IMPORT_BEISPIEL} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Btn kind="quiet" onClick={() => setText(IMPORT_BEISPIEL)}>Beispiel einfügen</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" disabled={!text.trim()} onClick={analysieren}>Prüfen</Btn>
            </div>
          </div>
        </div>)}

      {pruef && (<>
        <Card style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <Lab>Erkannte Spalten</Lab>
            <span style={{ fontSize: 12.5, color: C.dim }}>
              {Object.keys(pruef.zu).length} von {pruef.kopf.length} Spalten zugeordnet</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12 }}>
            {[["nachname", "Nachname", true], ["vorname", "Vorname"], ["personalnummer", "Personalnummer"],
              ["einheit", m.einheitLabel], ["funktion", "Funktion"], ["wochenstunden", "Wochenstunden"],
              ["urlaubsanspruch", "Urlaubsanspruch"], ["eintritt", "Eintritt"], ["email", "E-Mail"],
              ["qualifikationen", "Qualifikationen"], ["rolle", "Zugangsart"]].map(([feld, label, pflicht]) => {
              const idx = pruef.zu[feld];
              const h = pruef.herkunft[feld];
              const ton = h === "genau" || h === "hand" ? "ok" : h === "aehnlich" ? "accent"
                : h === "inhalt" ? "warn" : null;
              return (
                <div key={feld}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.dim }}>
                      {label}{pflicht ? " *" : ""}</span>
                    {ton && <Pill size="sm" tone={ton}>
                      {h === "genau" ? "sicher" : h === "hand" ? "von Hand"
                        : h === "aehnlich" ? "ähnlich" : "aus dem Inhalt"}</Pill>}
                  </div>
                  <Sel value={idx === undefined ? "" : idx}
                    onChange={(e) => setzeSpalte(feld, e.target.value)}
                    style={{ borderColor: pflicht && idx === undefined ? C.danger : undefined }}>
                    <option value="">— nicht vorhanden —</option>
                    {pruef.kopf.map((h2, i) => (
                      <option key={i} value={i}>{h2 || `Spalte ${i + 1}`}</option>))}</Sel>
                </div>);
            })}
          </div>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 14, lineHeight: 1.55 }}>
            Die Zuordnung entsteht aus der Überschrift und, wo die nicht eindeutig ist, aus dem
            Inhalt der Spalte. „Aus dem Inhalt" heißt: geraten anhand der Werte — bitte prüfen.
          </div>
        </Card>
      </>)}

      {pruef && (<div>
        <KpiRow min={150}>
          <Kpi label="Übernehmbar" value={pruef.gut} tone="ok" />
          <Kpi label="Fehlerhaft" value={pruef.fehlerhaft} tone={pruef.fehlerhaft ? "danger" : "ok"} />
          <Kpi label="Bereits vorhanden" value={pruef.doppelt} tone={pruef.doppelt ? "warn" : "ok"} />
          <Kpi label="Neue Einheiten" value={pruef.neueEinheiten.length} />
        </KpiRow>

        {(pruef.neueEinheiten.length > 0 || pruef.neueQuals.length > 0) && (
          <div className="karte" style={{ padding: 16, marginTop: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={anlegen} onChange={(e) => setAnlegen(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Fehlende Einheiten und Qualifikationen mit anlegen</span>
            </label>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8, lineHeight: 1.5 }}>
              {pruef.neueEinheiten.length > 0 && <>Einheiten: {pruef.neueEinheiten.join(", ")}<br /></>}
              {pruef.neueQuals.length > 0 && <>Qualifikationen: {pruef.neueQuals.join(", ")}</>}
            </div>
          </div>)}

        <Card style={{ marginTop: 18, overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead><tr>{["", "Person", "Einheit", "Std.", "Zugang", "Qualifikationen", "Hinweis"].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`,
                position: "sticky", top: 0, background: C.flaeche }}><Lab>{h}</Lab></th>))}</tr></thead>
            <tbody>{pruef.zeilen.map((z) => (
              <tr key={z.nr} className="row">
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 700,
                    background: z.ok ? "rgba(46,107,79,.14)" : "rgba(179,38,30,.12)",
                    color: z.ok ? C.ok : C.danger }}>{z.ok ? <><Icon n="haken" size={13} strokeWidth={2.4} /><span className="nurLeser">ja</span></> : <><Icon n="x" size={13} strokeWidth={2.4} /><span className="nurLeser">nein</span></>}</span></td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                  {z.nachname}, {z.vorname}{z.teilzeit && <Pill size="sm" style={{ marginLeft: 6 }}>TZ</Pill>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5,
                  color: z.einheitId ? C.dim : C.warn }}>{z.einheitName || "—"}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5, ...NUM }}>{n1(z.wochenstunden)}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5 }}>{rolle(z.rolle).kurz}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12 }}>
                  {z.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(" ")}
                  {z.fehlendeQuals.length > 0 && <span style={{ color: C.warn }}> +{z.fehlendeQuals.join(" ")}</span>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12,
                  color: z.fehler.length ? C.danger : z.doppelt ? C.warn : C.dimmer }}>
                  {[...z.fehler, z.dublettenGrund].filter(Boolean).join(", ")}</td>
              </tr>))}</tbody>
          </table>
        </Card>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn kind="quiet" onClick={() => setPruef(null)}>Zurück</Btn>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" disabled={!pruef.gut}
            onClick={() => { akt.importieren(pruef.zeilen.filter((z) => z.ok), anlegen); onClose(); }}>
            {pruef.gut} Personen übernehmen</Btn>
        </div>
      </div>)}
    </Sheet>);
}
