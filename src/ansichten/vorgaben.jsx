/* ==========================================================================
   INTERNE VORGABEN — Verwaltung (WP-I4, Block K)

   Verwaltung → Betrieb → Interne Vorgaben. Die Leitung legt betriebliche Regeln
   an, testet sie und aktiviert sie; Planung liest nur. Ohne KI: Jede Regelart
   des Regelbaukastens hat Auswahlfelder. Der Server prüft Form, Recht (org.edit)
   und Stufengrenze und setzt Wann/Wer; hier steht nur die Bedienung.

   Eine aktive Vorgabe wirkt noch nicht im Plan (WP-I5) — der Text sagt das.
   ========================================================================== */
import { useState } from "react";
import { C } from "../farben.js";
import { darf } from "../lib/berechtigung.js";
import { Pill, Btn, Card, CardHead, Field, Inp, Sel, Leer } from "../ui/bausteine.jsx";
import {
  VORGABEN_REGELARTEN, VORGABEN_STAERKEN, VORGABEN_GRUNDLAGEN, VORGABEN_BEZUEGE, VORGABEN_GELTUNG, PARAMETER_FELDER,
  pruefeVorgabe, vorgabeTestlauf, vorgabenGrenze, aktiveVorgaben, felderAusParametern, parameterAusFeldern,
} from "../../server/lib/vorgaben.mjs";

export const REGELART_TEXT = {
  zaehlregel: "Zählregel (Ereignisse im Zeitraum zählen)", grenzregel: "Grenzregel (Wert gegen Ober-/Untergrenze)",
  besetzungsregel: "Besetzungsregel (Anzahl, Qualifikation, Quote)", paarregel: "Paarregel (A nur zusammen mit B)",
  musterregel: "Musterregel (Folgen von Diensten)", blockregel: "Blockregel (zusammengehörige Tage)",
  verteilungsregel: "Verteilungsregel (gleichmäßig verteilen)", wunschregel: "Wunschregel (wenn möglich)",
};
const STAERKE_TEXT = { muss: "Muss", soll: "Soll", wunsch: "Wunsch" };
const STAERKE_HILFE = { muss: "Ein Verstoß ist eine Achtung und braucht eine Bestätigung.", soll: "Ziel beim Planen; eine Abweichung ist ein Hinweis.", wunsch: "Wird nur berücksichtigt, wenn es geht." };
const GRUNDLAGE_TEXT = { hausregel: "Hausregel", betriebsvereinbarung: "Betriebsvereinbarung", tarif: "Tarifvertrag" };
const BEZUG_TEXT = { woche: "Woche", monat: "Monat", quartal: "Quartal", rotation: "Schichtrotation" };
const GELTUNG_TEXT = { betrieb: "ganzer Betrieb", einheit: "Einheit(en)", gruppe: "Personengruppe(n)", personen: "einzelne Personen" };
const STATUS_TEXT = { entwurf: "Entwurf", aktiv: "aktiv", inaktiv: "inaktiv" };
const WAHL_TEXT = { hoechstens: "höchstens", mindestens: "mindestens", kalendermonat: "Kalendermonat", kalenderjahr: "Kalenderjahr", rollierend: "rollierend",
  tage: "Tage", wochen: "Wochen", monate: "Monate", anzahl: "Personen insgesamt", anzahlMit: "Personen mit Merkmal", quoteMit: "Anteil mit Merkmal (0 bis 1)",
  verbotenFolge: "Verbotene Folge", hoechstensFolge: "Höchstens in Folge", frei: "Der Tag ist frei", dienstart: "Eine bestimmte Dienstart", keineDienstart: "Keine bestimmte Dienstart" };

const neueId = () => `vg-${Math.random().toString(36).slice(2, 9)}`;
const leer = () => ({ id: neueId(), name: "", beschreibung: "", regelart: "zaehlregel", parameter: {}, geltung: { art: "betrieb" }, bezug: "monat",
  staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel", fundstelle: "" }, ausnahmen: { personen: [], teilzeitAnteilig: false }, status: "entwurf" });

/** Das Formular ist ein Entwurf der Vorgabe plus die Texte der Parameterfelder. */
function Formular({ m, start, onSpeichern, onAbbruch }) {
  const [v, setV] = useState(start);
  const [werte, setWerte] = useState(() => felderAusParametern(start.regelart, start.parameter));
  const setz = (k, w) => setV((x) => ({ ...x, [k]: w }));
  const bereinigt = () => {
    const g = v.geltung || { art: "betrieb" };
    const geltung = { art: g.art, ...(g.art === "einheit" ? { einheiten: g.einheiten || [] } : {}), ...(g.art === "gruppe" ? { gruppen: g.gruppen || [] } : {}),
      ...(g.art === "personen" ? { personen: g.personen || [] } : {}) };
    const a = v.ausnahmen || {};
    const ausnahmen = { ...(a.personen && a.personen.length ? { personen: a.personen } : {}), ...(a.zeitraeume && a.zeitraeume.length ? { zeitraeume: a.zeitraeume } : {}),
      ...(a.teilzeitAnteilig ? { teilzeitAnteilig: true } : {}) };
    const grundlage = { art: v.grundlage.art, ...(v.grundlage.fundstelle ? { fundstelle: v.grundlage.fundstelle } : {}) };
    const aus = { id: v.id, name: v.name.trim(), regelart: v.regelart, parameter: parameterAusFeldern(v.regelart, werte), geltung, bezug: v.bezug,
      staerke: v.staerke, prioritaet: Number(v.prioritaet), grundlage, status: v.status };
    if (v.beschreibung && v.beschreibung.trim()) aus.beschreibung = v.beschreibung.trim();
    if (v.gueltigAb) aus.gueltigAb = v.gueltigAb;
    if (v.gueltigBis) aus.gueltigBis = v.gueltigBis;
    if (Object.keys(ausnahmen).length) aus.ausnahmen = ausnahmen;
    return aus;
  };
  const fehler = pruefeVorgabe(bereinigt());
  const liste = (k, id) => { const g = v.geltung[k] || []; setz("geltung", { ...v.geltung, [k]: g.includes(id) ? g.filter((x) => x !== id) : [...g, id] }); };
  const ausnahmePerson = (id) => { const p = (v.ausnahmen && v.ausnahmen.personen) || []; setz("ausnahmen", { ...v.ausnahmen, personen: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] }); };
  const personen = (m.personen || []).filter((p) => p.status !== "ausgetreten");
  const box = { maxHeight: 150, overflow: "auto", display: "grid", gap: 4, padding: 8, border: `1px solid ${C.lineSoft}`, borderRadius: "var(--r)" };
  return (
    <div className="karte-still" style={{ borderRadius: "var(--r)", padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <Field label="Name" hint="Bitte keinen Personennamen und keine Personenmerkmale (Gesundheit, Leistung, Verhalten) nennen.">
          <Inp value={v.name} maxLength={80} onChange={(e) => setz("name", e.target.value)} placeholder="Wochenend-Rotation" /></Field>
        <Field label="Regelart"><Sel value={v.regelart} onChange={(e) => { setz("regelart", e.target.value); setWerte({}); }}>
          {VORGABEN_REGELARTEN.map((a) => <option key={a} value={a}>{REGELART_TEXT[a]}</option>)}</Sel></Field>
      </div>
      <Field label="Beschreibung (in normaler Sprache)"><Inp value={v.beschreibung || ""} maxLength={500} onChange={(e) => setz("beschreibung", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        {PARAMETER_FELDER[v.regelart].map((f) => (
          <Field key={`${v.regelart}-${f.pfad}`} label={f.label}>
            {f.typ === "wahl"
              ? <Sel value={werte[f.pfad] || ""} onChange={(e) => setWerte({ ...werte, [f.pfad]: e.target.value })}>
                <option value="">{f.optional ? "—" : "bitte wählen"}</option>
                {f.optionen.map((o) => <option key={o} value={o}>{WAHL_TEXT[o] || o}</option>)}</Sel>
              : <Inp value={werte[f.pfad] || ""} inputMode={f.typ === "zahl" ? "decimal" : undefined}
                onChange={(e) => setWerte({ ...werte, [f.pfad]: e.target.value })} />}
          </Field>))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Field label="Stärke" hint={STAERKE_HILFE[v.staerke]}><Sel value={v.staerke} onChange={(e) => setz("staerke", e.target.value)}>
          {VORGABEN_STAERKEN.map((s) => <option key={s} value={s}>{STAERKE_TEXT[s]}</option>)}</Sel></Field>
        <Field label="Priorität (1 = wichtigste)" hint="Reihenfolge, wenn sich Vorgaben widersprechen."><Inp type="number" min={1} max={99} value={v.prioritaet}
          onChange={(e) => setz("prioritaet", e.target.value)} /></Field>
        <Field label="Bezugszeitraum"><Sel value={v.bezug} onChange={(e) => setz("bezug", e.target.value)}>
          {VORGABEN_BEZUEGE.map((b) => <option key={b} value={b}>{BEZUG_TEXT[b]}</option>)}</Sel></Field>
        <Field label="Gültig ab"><Inp type="date" value={v.gueltigAb || ""} onChange={(e) => setz("gueltigAb", e.target.value)} /></Field>
        <Field label="Gültig bis"><Inp type="date" value={v.gueltigBis || ""} onChange={(e) => setz("gueltigBis", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <Field label="Geltung"><Sel value={v.geltung.art} onChange={(e) => setz("geltung", { art: e.target.value })}>
          {VORGABEN_GELTUNG.map((g) => <option key={g} value={g}>{GELTUNG_TEXT[g]}</option>)}</Sel></Field>
        <Field label="Grundlage"><Sel value={v.grundlage.art} onChange={(e) => setz("grundlage", { ...v.grundlage, art: e.target.value })}>
          {VORGABEN_GRUNDLAGEN.map((g) => <option key={g} value={g}>{GRUNDLAGE_TEXT[g]}</option>)}</Sel></Field>
        <Field label="Fundstelle oder Dokument" hint="Etwa „BV Dienstplanung § 4“."><Inp value={v.grundlage.fundstelle || ""} maxLength={120}
          onChange={(e) => setz("grundlage", { ...v.grundlage, fundstelle: e.target.value })} /></Field>
      </div>
      {v.geltung.art === "einheit" && (
        <Field label="Einheiten"><div style={box}>{(m.einheiten || []).map((e) => (
          <label key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 24 }}>
            <input type="checkbox" checked={(v.geltung.einheiten || []).includes(e.id)} onChange={() => liste("einheiten", e.id)} />{e.name || e.id}</label>))}</div></Field>)}
      {v.geltung.art === "gruppe" && (
        <Field label="Personengruppen" hint="Mit Komma trennen, z. B. Vollzeit, Fachkräfte."><Inp value={(v.geltung.gruppen || []).join(", ")}
          onChange={(e) => setz("geltung", { ...v.geltung, gruppen: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>)}
      {v.geltung.art === "personen" && (
        <Field label="Personen"><div style={box}>{personen.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 24 }}>
            <input type="checkbox" checked={(v.geltung.personen || []).includes(p.id)} onChange={() => liste("personen", p.id)} />{p.vorname} {p.nachname}</label>))}</div></Field>)}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>Ausnahmen</summary>
        <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 24 }}>
            <input type="checkbox" checked={!!(v.ausnahmen && v.ausnahmen.teilzeitAnteilig)} onChange={(e) => setz("ausnahmen", { ...v.ausnahmen, teilzeitAnteilig: e.target.checked })} />
            Teilzeit anteilig berücksichtigen</label>
          <Field label="Ausgenommene Personen"><div style={box}>{personen.map((p) => (
            <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 24 }}>
              <input type="checkbox" checked={((v.ausnahmen && v.ausnahmen.personen) || []).includes(p.id)} onChange={() => ausnahmePerson(p.id)} />{p.vorname} {p.nachname}</label>))}</div></Field>
        </div>
      </details>
      <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>Hinweis: Regeln zur Verteilung der Arbeitszeit sind meist mitbestimmungspflichtig
        (§ 87 Abs. 1 Nr. 2 BetrVG). Bitte die Grundlage angeben und vor der Einführung die Beteiligung klären.</div>
      {fehler && <div role="alert" id="vorgabe-fehler" style={{ fontSize: 13.5, color: C.dim }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn kind="primary" disabled={!!fehler} aria-describedby={fehler ? "vorgabe-fehler" : undefined} onClick={() => onSpeichern(bereinigt())}>Speichern</Btn>
        <Btn onClick={onAbbruch}>Abbrechen</Btn>
      </div>
    </div>);
}

/**
 * @param {{ sitz: any, akt: any }} props
 * Nur für org.edit (Leitung, Kundenrolle): für alle anderen Rollen entsteht nichts (der Server liefert ihnen das Feld
 * ohnehin nicht). Die Hooks stehen in der inneren Komponente.
 */
export function InterneVorgaben({ sitz, akt }) {
  if (!sitz || !sitz.mandant || !darf(sitz, "org.edit")) return null;
  return <VorgabenInnen sitz={sitz} akt={akt} />;
}

function VorgabenInnen({ sitz, akt }) {
  const m = sitz.mandant;
  const liste = Array.isArray(m.vorgaben) ? m.vorgaben : [];
  const grenze = vorgabenGrenze(m.tarif);
  const aktiv = aktiveVorgaben(liste).length;
  const [bearbeite, setBearbeite] = useState(null);
  const [test, setTest] = useState({});
  const voll = aktiv >= grenze;
  const grenzeText = Number.isFinite(grenze) ? `${aktiv} von ${grenze} aktiv` : `${aktiv} aktiv`;

  const testen = (v) => setTest((t) => ({ ...t, [v.id]: vorgabeTestlauf(v) }));
  const speichern = (v) => {
    const vorher = liste.find((x) => x.id === v.id);
    /* Eine geänderte Vorgabe muss erneut getestet werden, bevor sie wieder aktiv wird. */
    const neu = vorher && vorher.status === "aktiv" ? { ...v, status: "inaktiv" } : v;
    akt.vorgabeSpeichern(neu);
    setTest((t) => { const k = { ...t }; delete k[v.id]; return k; });
    setBearbeite(null);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={voll ? "accent" : undefined}>{grenzeText}</Pill>}>Interne Vorgaben</CardHead>
      <div style={{ padding: 22, display: "grid", gap: 14 }}>
        <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
          Betriebliche Regeln, die CENTRIC zusätzlich zu Gesetz und Tarif prüfen kann, etwa „zwei freie Wochenenden im Monat“. Eine Vorgabe wird angelegt,
          getestet und erst dann aktiviert. Sie ersetzt nie ein Gesetz. Aktive Vorgaben sind gespeichert und rechenbar; ihre Wirkung im Planungsassistenten,
          in der Ersatzsuche und in der Selbstplanung folgt in einem eigenen Schritt. Der Test rechnet Beispielfälle durch, nicht den echten Plan.
          {Number.isFinite(grenze) && ` In dieser Preisstufe sind bis zu ${grenze} aktive Vorgaben möglich.`}
        </div>
        {liste.length === 0 && !bearbeite && <Leer titel="Noch keine Vorgaben" text="Legen Sie die erste interne Vorgabe an." />}
        {liste.map((v) => {
          const t = test[v.id];
          if (bearbeite && bearbeite.id === v.id) return <Formular key={v.id} m={m} start={bearbeite} onSpeichern={speichern} onAbbruch={() => setBearbeite(null)} />;
          const darfAktivieren = !!t && t.ok && !(voll && v.status !== "aktiv");
          return (
            <div key={v.id} className="karte-still" style={{ borderRadius: "var(--r)", padding: 16, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{v.name}</strong>
                <Pill size="sm" tone={v.status === "aktiv" ? "ok" : undefined}>{STATUS_TEXT[v.status]}</Pill>
                <Pill size="sm">{STAERKE_TEXT[v.staerke]}</Pill>
                <Pill size="sm">Priorität {v.prioritaet}</Pill>
                <span style={{ fontSize: 12.5, color: C.dim }}>{REGELART_TEXT[v.regelart]} · {BEZUG_TEXT[v.bezug]} · {GELTUNG_TEXT[v.geltung && v.geltung.art]} · {GRUNDLAGE_TEXT[v.grundlage && v.grundlage.art]}</span>
              </div>
              {v.beschreibung && <div style={{ fontSize: 13.5 }}>{v.beschreibung}</div>}
              {t && (
                <div role="status" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  {t.fehler ? t.fehler : <>
                    <div>{t.ok ? "Test bestanden: die Vorgabe rechnet wie gemeint." : "Test nicht bestanden: die Vorgabe rechnet anders als gemeint."}</div>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{t.ergebnisse.map((e) => (
                      <li key={e.id}>{e.erwartet === "erfuellt" ? "Beispiel, das die Vorgabe erfüllt" : "Beispiel, das sie verletzt"}: {e.status === "erfuellt" ? "erfüllt" : e.status === "verletzt" ? "verletzt" : e.status}
                        {e.stimmt === false ? " (nicht wie erwartet)" : ""}</li>))}</ul></>}
                </div>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn size="sm" onClick={() => setBearbeite({ ...v, parameter: v.parameter || {} })}>Bearbeiten</Btn>
                  <Btn size="sm" onClick={() => testen(v)}>Testen</Btn>
                  {v.status === "aktiv"
                    ? <Btn size="sm" onClick={() => akt.vorgabeStatus(v.id, "inaktiv")}>Deaktivieren</Btn>
                    : <Btn size="sm" kind="primary" disabled={!darfAktivieren} onClick={() => akt.vorgabeStatus(v.id, "aktiv")}
                      title={!t ? "Zuerst testen." : !t.ok ? "Der Test ist nicht bestanden." : voll ? "Die Grenze der Preisstufe ist erreicht." : undefined}>Aktivieren</Btn>}
                  <span style={{ flex: 1 }} />
                  <Btn size="sm" kind="danger" onClick={() => akt.vorgabeLoeschen(v.id)}>Löschen</Btn>
              </div>
            </div>);
        })}
        {bearbeite && !liste.some((x) => x.id === bearbeite.id)
          ? <Formular m={m} start={bearbeite} onSpeichern={speichern} onAbbruch={() => setBearbeite(null)} />
          : !bearbeite && <div><Btn kind="primary" onClick={() => setBearbeite(leer())}>Neue Vorgabe</Btn></div>}
      </div>
    </Card>);
}
