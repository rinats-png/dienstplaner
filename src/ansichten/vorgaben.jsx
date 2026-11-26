/* ==========================================================================
   INTERNE VORGABEN — Verwaltung (WP-I4, Block K)

   Verwaltung → Betrieb → Interne Vorgaben. Die Leitung legt betriebliche Regeln
   an, testet sie und aktiviert sie; die Planung liest sie nur (Entscheidung 2026-11-25); Schichtverantwortung, Beschäftigte und
   Betriebsrat bekommen den Abschnitt nicht. Aktive Vorgaben werden deaktiviert, nicht gelöscht. Ohne KI: Jede Regelart
   des Regelbaukastens hat Auswahlfelder. Der Server prüft Form, Recht (org.edit)
   und Stufengrenze und setzt Wann/Wer; hier steht nur die Bedienung.

   Eine aktive Vorgabe wirkt, wo ihre Regelart im Plan gerechnet wird (WP-I5, server/lib/vorgabenwirkung.mjs); die Liste sagt je Vorgabe, wo nicht.
   ========================================================================== */
import { useState } from "react";
import { C } from "../farben.js";
import { darf } from "../lib/berechtigung.js";
import { Pill, Btn, Card, CardHead, Field, Inp, Sel, Leer } from "../ui/bausteine.jsx";
import {
  VORGABEN_REGELARTEN, VORGABEN_STAERKEN, VORGABEN_GRUNDLAGEN, VORGABEN_BEZUEGE, VORGABEN_GELTUNG, VORGABEN_GRENZEN_FELD, PARAMETER_FELDER,
  pruefeVorgabe, vorgabeTestlauf, vorgabenGrenze, aktiveVorgaben, felderAusParametern, parameterAusFeldern,
} from "../../server/lib/vorgaben.mjs";
import { vorgabePlanwirkung } from "../../server/lib/vorgabenwirkung.mjs";

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
const GELTUNG_TEXT = { betrieb: "ganzer Betrieb", einheit: "Einheit(en)", gruppe: "Qualifikationsgruppe(n)", personen: "einzelne Personen" };
const STATUS_TEXT = { entwurf: "Entwurf", aktiv: "aktiv", inaktiv: "inaktiv" };
const WAHL_TEXT = { hoechstens: "höchstens", mindestens: "mindestens", kalendermonat: "Kalendermonat", kalenderjahr: "Kalenderjahr", rollierend: "rollierend",
  tage: "Tage", wochen: "Wochen", monate: "Monate", anzahl: "Personen insgesamt", anzahlMit: "Personen mit Merkmal", quoteMit: "Anteil mit Merkmal (0 bis 1)",
  verbotenFolge: "Verbotene Folge", hoechstensFolge: "Höchstens in Folge", frei: "Der Tag ist frei", dienstart: "Eine bestimmte Dienstart", keineDienstart: "Keine bestimmte Dienstart" };

const neueId = () => `vg-${Math.random().toString(36).slice(2, 9)}`;
const leer = () => ({ id: neueId(), name: "", beschreibung: "", regelart: "zaehlregel", parameter: {}, geltung: { art: "betrieb" }, bezug: "monat",
  staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel", fundstelle: "" }, ausnahmen: { personen: [], teilzeitAnteilig: false }, status: "entwurf" });

/** Einheiten und Personen, die es im Betrieb nicht mehr gibt (gelöscht), fallen beim Speichern heraus; der Server nimmt nur eigene Kennungen. */
export function bezuegeBereinigen(v, m) {
  const kennung = (l) => new Set((l || []).map((x) => String(x.id)));
  const eh = kennung(m.einheiten), pe = kennung(m.personen);
  const nur = (l, menge) => (Array.isArray(l) ? l.filter((x) => menge.has(String(x))) : l);
  const g = v.geltung || {};
  const geltung = { ...g, ...(g.einheiten !== undefined ? { einheiten: nur(g.einheiten, eh) } : {}), ...(g.personen !== undefined ? { personen: nur(g.personen, pe) } : {}) };
  const a = v.ausnahmen;
  return { ...v, geltung, ...(a ? { ausnahmen: { ...a, ...(a.personen !== undefined ? { personen: nur(a.personen, pe) } : {}) } } : {}) };
}

/** Aus dem Formularstand die Vorgabe, wie sie gespeichert wird (verwaiste Bezüge entfernt, leere Felder weg). */
export function formularZuVorgabe(v, werte, m) {
  const w = bezuegeBereinigen(v, m);
  const g = w.geltung || { art: "betrieb" };
  const geltung = { art: g.art, ...(g.art === "einheit" ? { einheiten: g.einheiten || [] } : {}), ...(g.art === "gruppe" ? { gruppen: g.gruppen || [] } : {}),
    ...(g.art === "personen" ? { personen: g.personen || [] } : {}) };
  const a = w.ausnahmen || {};
  const ausnahmen = { ...(a.personen && a.personen.length ? { personen: a.personen } : {}), ...(a.zeitraeume && a.zeitraeume.length ? { zeitraeume: a.zeitraeume } : {}),
    ...(a.teilzeitAnteilig ? { teilzeitAnteilig: true } : {}) };
  const grundlage = { art: w.grundlage.art, ...(w.grundlage.fundstelle ? { fundstelle: w.grundlage.fundstelle } : {}) };
  const aus = { id: w.id, name: w.name.trim(), regelart: w.regelart, parameter: parameterAusFeldern(w.regelart, werte), geltung, bezug: w.bezug,
    staerke: w.staerke, prioritaet: Number(w.prioritaet), grundlage, status: w.status };
  if (w.beschreibung && w.beschreibung.trim()) aus.beschreibung = w.beschreibung.trim();
  if (w.gueltigAb) aus.gueltigAb = w.gueltigAb;
  if (w.gueltigBis) aus.gueltigBis = w.gueltigBis;
  if (Object.keys(ausnahmen).length) aus.ausnahmen = ausnahmen;
  return aus;
}

/** Das Formular ist ein Entwurf der Vorgabe plus die Texte der Parameterfelder. */
export function Formular({ m, start, onSpeichern, onAbbruch }) {
  const [v, setV] = useState(start);
  const [werte, setWerte] = useState(() => felderAusParametern(start.regelart, start.parameter));
  const setz = (k, w) => setV((x) => ({ ...x, [k]: w }));
  const bereinigt = () => formularZuVorgabe(v, werte, m);
  const fehler = pruefeVorgabe(bereinigt());
  const liste = (k, id) => { const g = v.geltung[k] || []; setz("geltung", { ...v.geltung, [k]: g.includes(id) ? g.filter((x) => x !== id) : [...g, id] }); };
  const ausnahmePerson = (id) => { const p = (v.ausnahmen && v.ausnahmen.personen) || []; setz("ausnahmen", { ...v.ausnahmen, personen: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] }); };
  const zeitraeume = (v.ausnahmen && v.ausnahmen.zeitraeume) || [];
  const zeitraumSetzen = (i, k, w) => setz("ausnahmen", { ...v.ausnahmen, zeitraeume: zeitraeume.map((z, j) => j === i ? { ...z, [k]: w } : z) });
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
        <Field label="Qualifikationsgruppen" hint="Gilt für Personen mit der gewählten Qualifikation (keine allgemeine Gruppierung). Ohne die Qualifikation gilt die Vorgabe für die Person nicht."><div style={box}>{(m.qualifikationen || []).map((q) => (
          <label key={q.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 24 }}>
            <input type="checkbox" checked={(v.geltung.gruppen || []).includes(q.id)} onChange={() => liste("gruppen", q.id)} />{q.name || q.kurz || q.id}</label>))}</div></Field>)}
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
          <Field label="Ausnahmezeiträume" hint="In diesen Zeiträumen gilt die Vorgabe nicht, z. B. über die Feiertage.">
            <div style={{ display: "grid", gap: 8 }}>
              {zeitraeume.map((z, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Inp type="date" aria-label="Ausnahmezeitraum von" value={z.von || ""} onChange={(e) => zeitraumSetzen(i, "von", e.target.value)} />
                  <Inp type="date" aria-label="Ausnahmezeitraum bis" value={z.bis || ""} onChange={(e) => zeitraumSetzen(i, "bis", e.target.value)} />
                  <Btn size="sm" onClick={() => setz("ausnahmen", { ...v.ausnahmen, zeitraeume: zeitraeume.filter((_, j) => j !== i) })}>Entfernen</Btn>
                </div>))}
              {zeitraeume.length < VORGABEN_GRENZEN_FELD.zeitraeume
                && <div><Btn size="sm" onClick={() => setz("ausnahmen", { ...v.ausnahmen, zeitraeume: [...zeitraeume, { von: "", bis: "" }] })}>Zeitraum hinzufügen</Btn></div>}
            </div>
          </Field>
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
 * org.edit (Leitung, Kundenrolle): verwalten. Planung (staff.edit, ohne org.edit): nur lesen, und nur wenn der Server das Feld liefert.
 * Für alle anderen Rollen entsteht nichts (der Server liefert ihnen das Feld ohnehin nicht). Die Hooks stehen in der inneren Komponente.
 */
export function InterneVorgaben({ sitz, akt }) {
  if (!sitz || !sitz.mandant) return null;
  if (darf(sitz, "org.edit")) return <VorgabenInnen sitz={sitz} akt={akt} lesend={false} />;
  if (darf(sitz, "staff.edit") && Array.isArray(sitz.mandant.vorgaben)) return <VorgabenInnen sitz={sitz} akt={akt} lesend />;
  return null;
}

/** Nur ein Entwurf, der nie aktiv war, lässt sich löschen; alles Übrige wird deaktiviert (Nachweis der Änderungen, Server erzwingt es). */
const loeschbar = (v) => v.status === "entwurf" && !v.aktiviertAm;

function VorgabenInnen({ sitz, akt, lesend }) {
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
          Betriebliche Regeln, die CENTRIC zusätzlich zu Gesetz und Tarif prüfen kann, etwa „zwei freie Wochenenden im Monat“. {lesend
            ? "Sie können die Vorgaben einsehen; anlegen, testen, aktivieren und ändern darf nur die Leitung. "
            : "Eine Vorgabe wird angelegt, getestet und erst dann aktiviert; eine aktive Vorgabe wird deaktiviert, nicht gelöscht. "}Sie ersetzt nie ein Gesetz. Aktive Vorgaben gelten im Planungsassistenten, in der Ersatzsuche und in der Selbstplanung: Ein Muss ist eine Achtung mit Bestätigung, ein Soll ein Hinweis; gesperrt wird nie.
          Der Test rechnet Beispielfälle durch, nicht den echten Plan.
          {Number.isFinite(grenze) && ` In dieser Preisstufe sind bis zu ${grenze} aktive Vorgaben möglich.`}
        </div>
        {liste.length === 0 && !bearbeite && <Leer titel="Noch keine Vorgaben" text={lesend ? "Die Leitung hat noch keine interne Vorgabe angelegt." : "Legen Sie die erste interne Vorgabe an."} />}
        {liste.map((v) => {
          const t = test[v.id];
          if (!lesend && bearbeite && bearbeite.id === v.id) return <Formular key={v.id} m={m} start={bearbeite} onSpeichern={speichern} onAbbruch={() => setBearbeite(null)} />;
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
              {v.status === "aktiv" && v.staerke === "wunsch" && <div style={{ fontSize: 12.5, color: C.dim }}>Wirkt im Plan noch nicht: Ein Wunsch wird erst vom Planer berücksichtigt.</div>}
              {v.status === "aktiv" && v.staerke !== "wunsch" && !vorgabePlanwirkung(v).wirkt && <div style={{ fontSize: 12.5, color: C.dim }}>Wirkt im Plan noch nicht: {vorgabePlanwirkung(v).grund}</div>}
              {t && (
                <div role="status" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  {t.fehler ? t.fehler : <>
                    <div>{t.ok ? "Test bestanden: die Vorgabe rechnet wie gemeint." : "Test nicht bestanden: die Vorgabe rechnet anders als gemeint."}</div>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{t.ergebnisse.map((e) => (
                      <li key={e.id}>{e.erwartet === "erfuellt" ? "Beispiel, das die Vorgabe erfüllt" : "Beispiel, das sie verletzt"}: {e.status === "erfuellt" ? "erfüllt" : e.status === "verletzt" ? "verletzt" : e.status}
                        {e.stimmt === false ? " (nicht wie erwartet)" : ""}</li>))}</ul></>}
                </div>)}
              {!lesend && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn size="sm" onClick={() => setBearbeite({ ...v, parameter: v.parameter || {} })}>Bearbeiten</Btn>
                  <Btn size="sm" onClick={() => testen(v)}>Testen</Btn>
                  {v.status === "aktiv"
                    ? <Btn size="sm" onClick={() => akt.vorgabeStatus(v.id, "inaktiv")}>Deaktivieren</Btn>
                    : <Btn size="sm" kind="primary" disabled={!darfAktivieren} onClick={() => akt.vorgabeStatus(v.id, "aktiv")}
                      title={!t ? "Zuerst testen." : !t.ok ? "Der Test ist nicht bestanden." : voll ? "Die Grenze der Preisstufe ist erreicht." : undefined}>Aktivieren</Btn>}
                  <span style={{ flex: 1 }} />
                  {loeschbar(v) && <Btn size="sm" kind="danger" onClick={() => akt.vorgabeLoeschen(v.id)}>Löschen</Btn>}
              </div>}
            </div>);
        })}
        {!lesend && bearbeite && !liste.some((x) => x.id === bearbeite.id)
          ? <Formular m={m} start={bearbeite} onSpeichern={speichern} onAbbruch={() => setBearbeite(null)} />
          : !lesend && !bearbeite && <div><Btn kind="primary" onClick={() => setBearbeite(leer())}>Neue Vorgabe</Btn></div>}
      </div>
    </Card>);
}
