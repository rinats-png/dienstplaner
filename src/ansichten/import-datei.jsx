/* IMP-4: Personalimport aus Datei (xlsx, xls, csv, tsv) mit Vorschau und Dublettenwahl.
   Läuft ausschließlich über den Import-Endpunkt (IMP-3, Schnittstelle: src/lib/import-schnittstelle.js).
   Die Regeln (keine automatische Überschreibung, Namenstreffer nur als Vorschlag) stehen in
   src/lib/import-ablauf.js; diese Datei zeigt nur an. */
import { useEffect, useMemo, useState } from "react";
import { C } from "../farben.js";
import { Card, Lab, Btn, Sel, Kpi, KpiRow, Pill } from "../ui/bausteine.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { IMPORT_ENDUNGEN_ANGEBOT } from "../../server/lib/import/formate.mjs";
import { erzeugeAblauf, aktionenFuer, AKTION_TEXT, dublettenText, istNamensVorschlag, unbestaetigteAktualisierungen, qualifikationenText } from "../lib/import-ablauf.js";

/** Dateidialog: genau die Formate, die der Parser liest (server/lib/import/formate.mjs). */
export const IMPORT_ACCEPT = IMPORT_ENDUNGEN_ANGEBOT.map((e) => "." + e).join(",");

const FELDER = [["nachname", "Nachname", true], ["vorname", "Vorname", true], ["einheit", "Einheit", true],
  ["personalnummer", "Personalnummer"], ["email", "E-Mail"], ["funktion", "Funktion"], ["wochenstunden", "Wochenstunden"],
  ["urlaubsanspruch", "Urlaubsanspruch"], ["eintritt", "Eintritt"], ["standort", "Standort"], ["qualifikationen", "Qualifikationen"]];
const HERKUNFT = { genau: ["sicher", "ok"], hand: ["von Hand", "ok"], manuell: ["von Hand", "ok"], aehnlich: ["ähnlich", "accent"], inhalt: ["aus dem Inhalt", "warn"] };
const FELD_NAME = Object.fromEntries(FELDER.map(([f, l]) => [f, l]));
const wert = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
const zelle = { padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5, verticalAlign: "top" };

function Meldung({ z }) {
  if (!z.fehler) return null;
  return <div role="alert" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13.5,
    background: "rgba(179,38,30,.10)", color: C.danger }}>{z.fehler}</div>;
}

function Wahl({ z, a }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Meldung z={z} />
      <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
        Excel-Datei (.xlsx, .xls) oder CSV/TSV-Datei auswählen (höchstens 10 MB). Die Datei wird nur zum Lesen an den Server gesendet
        und nicht gespeichert; die Inhalte werden nach der Übernahme, beim Abbrechen oder nach 30 Minuten ohne Aktivität gelöscht.
        Nichts wird übernommen, bevor Sie die Vorschau ausdrücklich bestätigt haben.
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <Lab>Datei</Lab>
        <input type="file" accept={IMPORT_ACCEPT} disabled={z.laeuft} aria-label="Datei für den Personalimport"
          onChange={(e) => { const d = e.target.files && e.target.files[0]; if (d) a.hochladen(d); }} />
      </label>
      {z.laeuft && <div style={{ fontSize: 13, color: C.dim }}>Datei wird gelesen …</div>}
    </div>);
}

function Spalten({ z, a }) {
  return (
    <Card style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <Lab>Erkannte Spalten</Lab>
        {z.blaetter.length > 1 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.dim }}>Blatt
            <Sel value={z.blatt} disabled={z.laeuft} onChange={(e) => a.blattWaehlen(Number(e.target.value))}>
              {z.blaetter.map((b) => <option key={b.index} value={b.index}>{b.name || `Blatt ${b.index + 1}`} ({b.datenzeilen} Zeilen)</option>)}
            </Sel></label>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {FELDER.map(([feld, label, pflicht]) => {
          const idx = z.zuordnung[feld];
          const sp = z.spalten.find((s) => s.index === idx);
          const h = sp && HERKUNFT[sp.herkunft];
          return (
            <div key={feld}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.dim }}>{label}{pflicht ? " *" : ""}</span>
                {h && <Pill size="sm" tone={h[1]}>{h[0]}</Pill>}
              </div>
              <Sel value={idx === undefined ? "" : idx} disabled={z.laeuft} aria-label={`Spalte für ${label}`}
                onChange={(e) => a.zuordnen(feld, e.target.value)}
                style={{ borderColor: pflicht && idx === undefined ? C.danger : undefined }}>
                <option value="">— nicht vorhanden —</option>
                {z.spalten.map((s) => <option key={s.index} value={s.index}>{s.kopf || `Spalte ${s.index + 1}`}</option>)}
              </Sel>
            </div>);
        })}
      </div>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 14, lineHeight: 1.55 }}>
        „Aus dem Inhalt" heißt: geraten anhand der Werte — bitte prüfen. Nach einer Änderung der Zuordnung werden die Wahlen unten neu vorbelegt.
      </div>
    </Card>);
}

function Datensatz({ d, z, a }) {
  const nr = String(d.datensatz);
  const aktionen = aktionenFuer(d);
  const aktion = z.entscheidungen[nr];
  const w = d.werte || {};
  const grund = dublettenText(d);
  return (
    <tr className="row">
      <td style={zelle}>{d.datensatz}</td>
      <td style={zelle}>
        <div style={{ fontSize: 13 }}>{wert(w.nachname)}, {wert(w.vorname)}</div>
        <div style={{ color: C.dim }}>{w.personalnummer ? `Nr. ${w.personalnummer}` : "ohne Personalnummer"} · {wert(w.einheit)}</div>
        {(d.qualifikationen || []).length > 0 && <div style={{ color: (d.qualifikationen || []).some((q) => q.fachkraft || q.nachweisPflicht || q.harteSperre) ? C.warn : C.dim }}>
          Qualifikationen: {qualifikationenText(d.qualifikationen)}</div>}
      </td>
      <td style={{ ...zelle, color: C.dim, maxWidth: 300 }}>
        {(d.fehler || []).length > 0 && <div style={{ color: C.danger }}>{d.fehler.join(", ")}</div>}
        {grund && <div style={{ color: istNamensVorschlag(d) ? C.dim : C.warn }}>{grund}</div>}
        {(d.konflikte || []).length > 0 && <div style={{ color: C.warn }}>
          {d.konflikte.map((k) => k.art === "einheit-unbekannt" ? "Einheit gibt es noch nicht" : k.art === "standort-unbekannt" ? "Standort gibt es noch nicht"
            : k.art === "qualifikation-unbekannt" ? "Qualifikation gibt es noch nicht" : k.art === "qualifikation-mehrdeutig" ? "Qualifikation ist nicht eindeutig" : k.art).join(", ")}</div>}
        {(d.hinweise || []).length > 0 && <div>{d.hinweise.map((h) => (typeof h === "string" ? h : h.nachricht || h.code)).join(", ")}</div>}
      </td>
      <td style={zelle}>
        <Sel value={aktion} disabled={z.laeuft} aria-label={`Wahl für Datensatz ${d.datensatz}`}
          onChange={(e) => a.entscheiden(d.datensatz, e.target.value)}>
          {aktionen.map((x) => <option key={x} value={x}>{AKTION_TEXT[x]}</option>)}
        </Sel>
        {aktion === "aktualisieren" && (
          <label style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={z.bestaetigungen[nr] === true} disabled={z.laeuft}
              onChange={(e) => a.bestaetigenAktualisierung(d.datensatz, e.target.checked)} />
            <span>Ja, die vorhandene Person darf mit den Werten aus der Datei aktualisiert werden.
              Leere Zellen überschreiben nichts.</span>
          </label>)}
      </td>
    </tr>);
}

function Pruefen({ z, a }) {
  const offen = unbestaetigteAktualisierungen(z.entscheidungen, z.bestaetigungen);
  const klaeren = Object.values(z.entscheidungen).filter((x) => x === "klaeren").length;
  const mehrEinheiten = z.datensaetze.some((d) => (d.konflikte || []).some((k) => k.art === "einheit-unbekannt" || k.art === "standort-unbekannt" || k.art === "qualifikation-unbekannt"));
  const pflichtFehlt = z.fehlendePflicht.length > 0;
  return (<>
    <Meldung z={z} />
    <Spalten z={z} a={a} />
    {pflichtFehlt && <div role="alert" style={{ color: C.danger, fontSize: 13.5, marginBottom: 12 }}>
      Es fehlt eine Zuordnung: {z.fehlendePflicht.map((f) => FELD_NAME[f] || f).join(", ")}.</div>}
    {z.zaehler && <KpiRow min={150}>
      <Kpi label="Datensätze" value={z.zaehler.gesamt ?? z.datensaetze.length} />
      <Kpi label="Dubletten" value={z.zaehler.dubletten ?? 0} tone={z.zaehler.dubletten ? "warn" : "ok"} />
      <Kpi label="Konflikte" value={z.zaehler.konflikte ?? 0} tone={z.zaehler.konflikte ? "warn" : "ok"} />
    </KpiRow>}
    {mehrEinheiten && (
      <div className="karte" style={{ padding: 16, marginTop: 18 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
          <input type="checkbox" checked={z.einheitenAnlegen} disabled={z.laeuft} onChange={(e) => a.einheitenAnlegen(e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Fehlende Einheiten, Standorte und Qualifikationen mit anlegen (nur Leitung)</span>
        </label>
      </div>)}
    <Card style={{ marginTop: 18, overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
        <thead><tr>{["Nr.", "Person", "Befund", "Wahl"].map((h) => (
          <th key={h} style={{ textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`,
            position: "sticky", top: 0, background: C.flaeche }}><Lab>{h}</Lab></th>))}</tr></thead>
        <tbody>{z.datensaetze.map((d) => <Datensatz key={d.datensatz} d={d} z={z} a={a} />)}</tbody>
      </table>
    </Card>
    {klaeren > 0 && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 10 }}>
      {klaeren} Datensätze stehen auf „Noch klären“ und werden nicht übernommen.</div>}
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
      <Btn kind="primary" disabled={z.laeuft || pflichtFehlt || offen.length > 0} onClick={() => a.vorschauErstellen()}>Vorschau erstellen</Btn>
    </div>
    {offen.length > 0 && <div style={{ fontSize: 12.5, color: C.warn, textAlign: "right", marginTop: 8 }}>
      Zum Aktualisieren bitte jede betroffene Person ausdrücklich bestätigen (Datensatz {offen.join(", ")}).</div>}
  </>);
}

function Vorschau({ z, a }) {
  const v = z.vorschau || {};
  const neu = v.neu || [], akt = v.aktualisieren || [];
  const nummer = (n) => { const d = z.datensaetze.find((x) => x.datensatz === n); return d && d.werte ? `${wert(d.werte.nachname)}, ${wert(d.werte.vorname)}` : `Datensatz ${n}`; };
  return (<>
    <Meldung z={z} />
    <KpiRow min={150}>
      <Kpi label="Neu" value={neu.length} tone="ok" />
      <Kpi label="Aktualisiert" value={akt.length} tone={akt.length ? "warn" : "ok"} />
      <Kpi label="Übersprungen" value={Array.isArray(v.uebersprungen) ? v.uebersprungen.length : (v.uebersprungen || 0)} />
      <Kpi label="Noch offen" value={(v.offen || []).length} tone={(v.offen || []).length ? "warn" : "ok"} />
    </KpiRow>
    {((v.neueEinheiten || []).length > 0 || (v.neueStandorte || []).length > 0 || (v.neueQualifikationen || []).length > 0) && (
      <div style={{ fontSize: 13, color: C.dim, marginTop: 14 }}>
        {(v.neueEinheiten || []).length > 0 && <>Neue Einheiten: {v.neueEinheiten.join(", ")}<br /></>}
        {(v.neueStandorte || []).length > 0 && <>Neue Standorte: {v.neueStandorte.join(", ")}<br /></>}
        {(v.neueQualifikationen || []).length > 0 && <>Neue Qualifikationen: {v.neueQualifikationen.join(", ")}</>}
      </div>)}
    <Card style={{ marginTop: 18, padding: 16 }}>
      <Lab>Wird neu angelegt</Lab>
      {neu.length === 0 ? <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>Keine.</div> : (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>{neu.map((n) => (
          <li key={n.datensatz}>{wert(n.nachname)}, {wert(n.vorname)} · {wert(n.einheit)} · {n.personalnummer ? `Nr. ${n.personalnummer}` : "ohne Personalnummer"}
            {(n.qualifikationen || []).length > 0 && <div style={{ color: n.qualifikationen.some((q) => q.fachkraft || q.nachweisPflicht || q.harteSperre) ? C.warn : C.dim }}>
              Qualifikationen: {qualifikationenText(n.qualifikationen)}</div>}</li>))}</ul>)}
    </Card>
    <Card style={{ marginTop: 14, padding: 16 }}>
      <Lab>Wird aktualisiert (alt → neu)</Lab>
      {akt.length === 0 ? <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>Keine.</div> : akt.map((x) => (
        <div key={x.datensatz} style={{ marginTop: 10, fontSize: 13 }}>
          <strong>{nummer(x.datensatz)}</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{(x.aenderungen || []).map((c, i) => (
            <li key={i}>{FELD_NAME[c.feld] || c.feld}: {wert(c.alt)} → {wert(c.neu)}</li>))}</ul>
        </div>))}
    </Card>
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 20, cursor: "pointer" }}>
      <input type="checkbox" checked={z.bestaetigt} disabled={z.laeuft || !z.bereit} onChange={(e) => a.bestaetigtSetzen(e.target.checked)} />
      <span style={{ fontSize: 13.5 }}>Ich habe die Vorschau geprüft und möchte genau diese Änderungen jetzt übernehmen.</span>
    </label>
    {!z.bereit && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 8 }}>Es gibt nichts zu übernehmen. Bitte zurückgehen und Wahlen ändern.</div>}
    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
      <Btn kind="quiet" disabled={z.laeuft} onClick={() => a.zurueck()}>Zurück</Btn>
      <Btn kind="primary" disabled={z.laeuft || !z.bereit || !z.bestaetigt} onClick={() => a.uebernehmen()}>Jetzt übernehmen</Btn>
    </div>
  </>);
}

function Fertig({ z, nachUebernahme, onClose }) {
  const e = z.ergebnis || {};
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div role="status" style={{ fontSize: 15 }}>Der Import ist abgeschlossen: {e.neu || 0} neu angelegt, {e.aktualisiert || 0} aktualisiert, {e.uebersprungen || 0} übersprungen.</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn kind="primary" onClick={() => { if (nachUebernahme) nachUebernahme(e); onClose(); }}>Fertig</Btn>
      </div>
    </div>);
}

/** Reine Anzeige zu einem Zustand des Ablaufs (auch ohne React-Zustand renderbar). */
export function ImportDateiAnsicht({ z, a, onClose, nachUebernahme }) {
  return (<>
    {z.schritt === "wahl" && <Wahl z={z} a={a} />}
    {z.schritt === "pruefen" && <Pruefen z={z} a={a} />}
    {z.schritt === "vorschau" && <Vorschau z={z} a={a} />}
    {z.schritt === "fertig" && <Fertig z={z} nachUebernahme={nachUebernahme} onClose={onClose} />}
  </>);
}

/** Blatt mit Ablauf. `schnittstelle` kommt aus erzeugeImportSchnittstelle() (im Test: Testdouble). */
export function ImportDatei({ schnittstelle, onClose, nachUebernahme }) {
  const a = useMemo(() => erzeugeAblauf(schnittstelle), [schnittstelle]);
  const [z, setZ] = useState(a.zustand());
  useEffect(() => a.abonnieren(setZ), [a]);
  const schliessen = () => { a.verwerfen(); onClose(); };
  return (
    <Sheet open onClose={schliessen} titel="Personal aus Datei importieren" width={900}>
      <ImportDateiAnsicht z={z} a={a} onClose={onClose} nachUebernahme={nachUebernahme} />
      {z.schritt !== "fertig" && <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 16 }}>
        <Btn kind="quiet" onClick={schliessen}>Abbrechen</Btn></div>}
    </Sheet>);
}
