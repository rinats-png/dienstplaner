/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { nachtFenster, nachtAnteil } from "../../server/lib/fachpruefung.mjs";
import { dauer, brutto } from "../regelwerk.js";
import { C } from "../farben.js";
import { Card, Lab, Btn, Inp, Sel, Field, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { n1 } from "../lib/format.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { DIENSTFORMEN, dienstform } from "../../server/lib/lohnrechnung.mjs";
import { Zelle, Sheet } from "../ui/leisten.jsx";
import { PALETTE, AUFENTHALT, aufenthaltVon, bereitschaftHinweise, mindestWerte, mindestVorhanden, mindestLuecken } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { Farbwahl } from "../ui/farbwahl.jsx";


/* ========================= DIENSTARTEN — frei gestaltbar ================== */
/* Mindestbesetzung (A-4, Betreiberentscheidung 2026-11-13): Pflicht beim Anlegen, nur ganze Zahlen 0..999 —
   0 heißt ausdrücklich „keine Mindestbesetzung". Nichts wird still ergänzt; der Server weist dasselbe mit 422 ab
   (server/lib/gestalt.mjs, docs/acc45/ABNAHME-V4-A4-MINDEST.md). */
export const MINDEST_TAGE = [["mo_do", "Mo – Do"], ["fr", "Freitag"], ["sa", "Samstag"], ["so", "So / Feiertag"]];
const leerFeld = (v) => v === undefined || v === null || String(v).trim() === "";

/** Fehlertext für eine Eingabe der Mindestbesetzung, oder null. Leer ist nur dann erlaubt, wenn `leerOk`. */
export function mindestEingabeFehler(v, leerOk = false) {
  if (leerFeld(v)) return leerOk ? null : "Pflichtfeld: bitte eine ganze Zahl ab 0 eingeben (0 = keine Mindestbesetzung).";
  const t = String(v).trim();
  if (!/^\d+$/.test(t) || Number(t) > 999) return "Bitte eine ganze Zahl von 0 bis 999 eingeben — ohne Komma, nicht negativ.";
  return null;
}

/** Die Werte, mit denen der Dialog eine gespeicherte Dienstart öffnet: Zahlen bleiben, eine ganze Zahl als Text
    ("2") öffnet als 2, alles andere so, wie es gespeichert ist (der Dialog zeigt dann den Fehler) — fehlende Felder
    bleiben leer (Pflicht). Nie ein erfundenes 0. */
export function mindestFuerDialog(d) {
  const roh = mindestVorhanden(d) ? d.mindest : {};
  return Object.fromEntries(MINDEST_TAGE.map(([k]) => {
    const v = roh[k];
    if (leerFeld(v)) return [k, ""];
    if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) return [k, Number(v.trim())];
    return [k, v];
  }));
}

/** Darf die Mindestbesetzung im Dialog ganz leer bleiben? Nur bei einem Altstand ohne Angabe — dann bleibt sie offen. */
export const mindestLeerErlaubt = (werte, { neu, ohneMindest }) =>
  !neu && !!ohneMindest && MINDEST_TAGE.every(([k]) => leerFeld(werte && werte[k]));

/**
 * Was „Speichern" mit der Mindestbesetzung tut: { fehler } (nichts speichern), { weglassen: true } (Altstand ohne
 * Angabe bleibt ohne) oder { mindest } mit vier ganzen Zahlen.
 */
export function mindestZumSpeichern(werte, { neu, ohneMindest }) {
  const leerOk = mindestLeerErlaubt(werte, { neu, ohneMindest });
  const fehler = Object.fromEntries(MINDEST_TAGE.map(([k]) => [k, mindestEingabeFehler(werte && werte[k], leerOk)]).filter(([, t]) => t));
  if (Object.keys(fehler).length) return { fehler };
  if (leerOk) return { weglassen: true };
  return { mindest: Object.fromEntries(MINDEST_TAGE.map(([k]) => [k, Number(String(werte[k]).trim())])) };
}

/** Die vier Eingabefelder der Mindestbesetzung mit Fehlertext je Feld (zugänglicher Name über Field/label). */
export function MindestFelder({ werte, onChange, neu, ohneMindest, versucht }) {
  const leerOk = mindestLeerErlaubt(werte, { neu, ohneMindest });
  return (
    <div>
      {ohneMindest && !neu && (
        <div role="note" data-befund="mindest-fehlt" style={{ fontSize: 12.5, color: C.warn, marginBottom: 10 }}>
          Mindestbesetzung fehlt. Bitte für jeden Tag eine ganze Zahl eintragen (0 = keine Mindestbesetzung) —
          bleiben alle vier Felder leer, bleibt sie weiter offen.</div>)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 11 }}>
        {MINDEST_TAGE.map(([k, l]) => {
          const v = werte ? werte[k] : "";
          const roh = mindestEingabeFehler(v, leerOk);
          /* Ein leeres Pflichtfeld meldet sich erst beim Speichern, eine falsche Eingabe sofort. */
          const fe = roh && (versucht || !leerFeld(v)) ? roh : null;
          const fehlerId = `mindest-${k}-fehler`;
          return (
            <div key={k}>
              <Field label={l}><Inp type="number" inputMode="numeric" step={1} min={0} max={999}
                required={!leerOk} aria-required={!leerOk} aria-invalid={fe ? true : undefined}
                aria-describedby={fe ? fehlerId : undefined} style={{ minHeight: 24 }}
                value={v ?? ""} onChange={(e) => onChange(k, e.target.value)} /></Field>
              {fe && <div id={fehlerId} role="alert" style={{ fontSize: 12, color: C.danger, marginTop: 4 }}>{fe}</div>}
            </div>);
        })}
      </div>
    </div>);
}

export function Dienstarten({ sitz, akt }) {
  const m = sitz.mandant;
  const [bearbeitet, setBearbeitet] = useState(null);
  /* WP-22: Dienstarten ändern Leitung und Planung (org.edit oder pattern.edit,
     Nutzerentscheidung); der Server weist alle anderen Rollen ab. */
  const editierbar = darf(sitz, "shift.edit") && (darf(sitz, "org.edit") || darf(sitz, "pattern.edit"));
  const leer = { name: "", kurz: "", start: "08:00", ende: "16:00", pause: 0, farbe: PALETTE[0], ort: "",
    posten: false, quelle: null, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
    aufenthalt: null, abrufMinuten: null, einsatzAnteil: null,
    mindest: { mo_do: "", fr: "", sa: "", so: "" }, mindestQual: {} };
  const [f, setF] = useState(leer);
  /* Altstand ohne Mindestbesetzung (A-4): Der Dialog öffnet mit leeren Feldern und dem Hinweis „fehlt" — kein
     stilles 0. Ein Altwert als Text ("2") öffnet als Zahl und wird erst mit diesem Speichern als Zahl geschrieben. */
  const [ohneMindest, setOhneMindest] = useState(false);
  const [versucht, setVersucht] = useState(false);
  const oeffnen = (d) => {
    setBearbeitet(d ? d.id : "neu"); setVersucht(false);
    setOhneMindest(!!d && !mindestVorhanden(d));
    setF(d ? { ...JSON.parse(JSON.stringify(d)), mindest: mindestFuerDialog(d) } : { ...leer, kurz: "" });
  };
  const speichern = () => {
    if (!f.name.trim() || !f.kurz.trim()) return;
    const neu = bearbeitet === "neu";
    const md = mindestZumSpeichern(f.mindest, { neu, ohneMindest });
    if (md.fehler) { setVersucht(true); return; }
    const g = { ...f };
    if (md.weglassen) delete g.mindest; else g.mindest = md.mindest;
    if (neu) akt.neueDienstart(g); else akt.aendereDienstart(bearbeitet, g);
    setBearbeitet(null);
  };

  return (
    <div>
      <H1 sub="Dienstarten sind vollständig frei gestaltbar: Zeiten, Pause, Farbe, Ort, Mindestbesetzung je Wochentag und geforderte Qualifikationen. Ein Außenposten wird automatisch aus der Einheit besetzt, die den Quelldienst fährt."
        right={editierbar && <Btn kind="primary" onClick={() => oeffnen(null)}>Dienstart anlegen</Btn>}>Dienstarten</H1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
        {m.dienstarten.map((d) => {
          const verwendet = m.zyklus.tage.filter((t) => t === d.id).length
            + Object.values(m.abweichungen).filter((v) => v === d.id).length;
          return (
            <Card key={d.id} hover style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <Zelle da={d} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 620 }}>{d.name}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                    {d.start}–{d.ende} · {n1(dauer(d))} h{d.pause ? ` · ${d.pause} min Pause` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                    {n1(nachtAnteil(d, m.einstellungen))} h Nachtanteil · {d.ort || "ohne Ort"}</div>
                </div>
                {d.posten && <Pill size="sm" tone="ok">Posten</Pill>}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 16 }}>
                {mindestVorhanden(d) ? (() => {
                  /* Vorhandene Werte wie gelesen; ein fehlendes Feld heißt „fehlt", nie still 0 (A-4). */
                  const w = mindestWerte(d), lk = mindestLuecken(d);
                  return [...[["mo_do", "Mo–Do"], ["fr", "Fr"], ["sa", "Sa"], ["so", "So/Feiertag"]].map(([k, l]) => (
                    <Pill key={k} size="sm" tone={lk.includes(k) ? "warn" : undefined}>{l} {lk.includes(k) ? "fehlt" : w[k]}</Pill>)),
                    lk.length > 0 && <span key="befund" data-befund="mindest-unvollstaendig"><Pill size="sm" tone="warn">Mindestbesetzung unvollständig — bitte ergänzen</Pill></span>];
                })()
                  : <span data-befund="mindest-fehlt"><Pill size="sm" tone="warn">Mindestbesetzung fehlt — bitte festlegen</Pill></span>}
              </div>
              {Object.entries(d.mindestQual || {}).filter(([, n]) => n > 0).length > 0 && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
                  {Object.entries(d.mindestQual).filter(([, n]) => n > 0).map(([qid, n]) => {
                    const q = m.qualifikationen.find((x) => x.id === qid);
                    return <Pill key={qid} size="sm" tone="accent">davon {n} × {q ? q.kurz : qid}</Pill>; })}</div>)}
              <div style={{ display: "flex", gap: 9, marginTop: 18, alignItems: "center" }}>
                {editierbar && <Btn size="sm" onClick={() => oeffnen(d)}>Bearbeiten</Btn>}
                {editierbar && <Btn size="sm" kind="danger" onClick={() => akt.loescheDienstart(d.id)}>Löschen</Btn>}
                <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
                  {verwendet > 0 ? `${verwendet}× verwendet` : "nicht verwendet"}</span>
              </div>
            </Card>);
        })}
      </div>

      <Sheet open={!!bearbeitet} onClose={() => setBearbeitet(null)}
        titel={bearbeitet === "neu" ? "Neue Dienstart" : "Dienstart bearbeiten"} width={640}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Zwischendienst" /></Field>
            <Field label="Kürzel" hint="Erscheint im Plan."><Inp value={f.kurz} maxLength={3}
              onChange={(e) => setF({ ...f, kurz: e.target.value.toUpperCase() })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
            <Field label="Beginn"><Inp type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Ende" hint="Früher als der Beginn bedeutet Folgetag."><Inp type="time" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} /></Field>
            <Field label="Pause in Minuten"><Inp type="number" min={0} value={f.pause || 0} onChange={(e) => setF({ ...f, pause: Number(e.target.value) })} /></Field>
          </div>
          <div className="karte-still" style={{ padding: 14, display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center", borderRadius: "var(--r)" }}>
            <div><Lab>Dauer</Lab><div style={{ fontSize: 19, fontWeight: 650, ...NUM }}>{n1(dauer(f))} h</div></div>
            <div><Lab>Brutto</Lab><div style={{ fontSize: 19, fontWeight: 650, color: C.dim, ...NUM }}>{n1(brutto(f))} h</div></div>
            <div><Lab>Nachtanteil {nachtFenster(m.einstellungen).von.slice(0, 2)}–{nachtFenster(m.einstellungen).bis.slice(0, 2)} Uhr</Lab>
              <div style={{ fontSize: 19, fontWeight: 650,
                color: nachtAnteil(f, m.einstellungen) > 0 ? C.violet : C.dimmer, ...NUM }}>
                {n1(nachtAnteil(f, m.einstellungen))} h</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Bewertung auf das Stundenkonto"
              hint="1,0 ist volle Arbeitszeit. Rufbereitschaft wird üblicherweise mit 0,125 bis 0,25 gewertet.">
              <Inp type="number" step="0.025" min={0} max={1} value={f.faktor === undefined ? 1 : f.faktor}
                onChange={(e) => setF({ ...f, faktor: Number(e.target.value) })} /></Field>
            {(m.standorte || []).length > 1 && (
              <Field label="Standort" hint="Bestimmt die Feiertage für die Mindestbesetzung.">
                <Sel value={f.standortId || ""} onChange={(e) => setF({ ...f, standortId: e.target.value })}>
                  <option value="">Betriebsvorgabe</option>
                  {(m.standorte || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</Sel></Field>)}
          </div>

          {/* Die Dienstform stand im Quelltext, aber in keiner Maske.

              DIENSTFORMEN kennt seit jeher Bereitschaftsdienst,
              Rufbereitschaft und geteilten Dienst mit ihrer je eigenen
              Anrechnung — nur ließ sich keine davon einstellen. Die Formen
              entstanden allein beim Aufbau der Vorführdaten; ein echter
              Betrieb konnte eine Rufbereitschaft anlegen, sie aber nicht als
              solche kennzeichnen, und rechnete sie damit voll auf die
              Konten. */}
          <Field label="Art des Dienstes"
            hint={dienstform(f.form).hinweis}>
            <Sel value={f.form || "regel"} onChange={(e) => setF({ ...f, form: e.target.value,
              /* Die Vorschläge der Form übernehmen, solange nichts Eigenes
                 eingetragen ist. */
              faktor: f.faktor === undefined || f.faktor === null || f.faktor === dienstform(f.form).faktor
                ? dienstform(e.target.value).faktor : f.faktor,
              ruhezeitNeutral: dienstform(e.target.value).ruhezeitNeutral,
              rufbereitschaft: e.target.value === "ruf",
              aufenthalt: f.aufenthalt || dienstform(e.target.value).aufenthalt || null })}>
              {DIENSTFORMEN.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>

          {/* --- Bereitschaft: wie eng bindet sie? ---

              Ob eine Bereitschaft als Arbeitszeit zählt, entscheidet nicht
              ihr Name, sondern die Bindung. Diese drei Angaben sind die,
              nach denen im Streitfall gefragt wird. */}
          {(f.form === "ruf" || f.form === "bereitschaft") && (
            <div className="karte-still" style={{ padding: 16, borderRadius: "var(--r)" }}>
              <Lab style={{ marginBottom: 12 }}>Ausgestaltung der Bereitschaft</Lab>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
                <Field label="Aufenthalt" hint={aufenthaltVon(f.aufenthalt).text}>
                  <Sel value={f.aufenthalt || dienstform(f.form).aufenthalt || "frei"}
                    onChange={(e) => setF({ ...f, aufenthalt: e.target.value })}>
                    {AUFENTHALT.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel></Field>
                <Field label="Abrufzeit in Minuten"
                  hint="In welcher Zeit muss jemand am Einsatzort sein?">
                  <Inp type="number" min={0} step={5}
                    value={f.abrufMinuten === undefined || f.abrufMinuten === null ? "" : f.abrufMinuten}
                    onChange={(e) => setF({ ...f,
                      abrufMinuten: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label="Einsatzanteil"
                  hint="Wie viel der Bereitschaft ist erfahrungsgemäß tatsächlich Einsatz? 0,2 sind 20 Prozent.">
                  <Inp type="number" min={0} max={1} step="0.05"
                    value={f.einsatzAnteil === undefined || f.einsatzAnteil === null ? "" : f.einsatzAnteil}
                    onChange={(e) => setF({ ...f,
                      einsatzAnteil: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              </div>
              {bereitschaftHinweise(f).map((h, i) => (
                <div key={i} style={{ marginTop: 11, fontSize: 12.5, lineHeight: 1.55,
                  color: h.schwere === "warn" ? C.warn : C.dim }}>{h.text}</div>))}
              <Erklaerkasten style={{ marginTop: 12 }}>
                Die Anwendung stuft nicht selbst ein — sie kennt weder den Tarifvertrag noch
                die tatsächliche Belastung. Sie hält fest, was für die Einstufung zählt, und
                sagt, wo die Angaben in eine andere Richtung zeigen als die gewählte Form.
              </Erklaerkasten>
            </div>)}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Ort oder Objekt"><Inp value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></Field>
            <Field label="Farbe">
              <Farbwahl wert={f.farbe} onChange={(c) => setF({ ...f, farbe: c })} /></Field>
          </div>
          {/* WP-20: Worauf sich die Standortprüfung beim Stempeln dieser Dienstart bezieht. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Standortprüfung bezieht sich auf"
              hint="Wirkt nur, wenn die Standortprüfung im Betrieb eingeschaltet ist.">
              <Sel value={f.ortModus || "standort"}
                onChange={(e) => { const { einsatzortId, ...rest } = f; setF(e.target.value === "standort" ? { ...rest, ortModus: undefined }
                  : e.target.value === "einsatzort" ? { ...rest, ortModus: "einsatzort", einsatzortId: einsatzortId || "" } : { ...rest, ortModus: e.target.value }); }}>
                <option value="standort">Standort der Einheit</option>
                <option value="einsatzort">Einsatzort</option>
                <option value="aussendienst">Außendienst (kein fester Ort)</option></Sel></Field>
            {f.ortModus === "einsatzort" && (
              <Field label="Einsatzort" hint={(m.einsatzorte || []).length ? undefined : "Zuerst unter Betrieb einen Einsatzort anlegen."}>
                <Sel value={f.einsatzortId || ""} onChange={(e) => setF({ ...f, einsatzortId: e.target.value })}>
                  <option value="">— wählen —</option>
                  {(m.einsatzorte || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Sel></Field>)}
          </div>
          <div className="karte-still" style={{ padding: 16, borderRadius: "var(--r)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={!!f.posten} onChange={(e) => setF({ ...f, posten: e.target.checked, quelle: e.target.checked ? (f.quelle || m.dienstarten[0].id) : null })} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Außenposten — wird automatisch besetzt</span>
            </label>
            {f.posten && (<div style={{ marginTop: 13 }}>
              <Field label="Wird besetzt aus der Einheit im Dienst" hint="Die Besatzung wird rollierend gewählt und der Mindestbesetzung des Quelldienstes entnommen.">
                <Sel value={f.quelle || ""} onChange={(e) => setF({ ...f, quelle: e.target.value })}>
                  {m.dienstarten.filter((d) => !d.posten).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
            </div>)}
          </div>
          <div>
            <Lab style={{ marginBottom: 10 }}>Mindestbesetzung</Lab>
            <MindestFelder werte={f.mindest} onChange={(k, v) => setF({ ...f, mindest: { ...f.mindest, [k]: v } })}
              neu={bearbeitet === "neu"} ohneMindest={ohneMindest} versucht={versucht} />
            <div style={{ fontSize: 12, color: C.dimmer, marginTop: 8 }}>Pflichtangabe, ganze Zahlen ab 0. Ein Feiertag hebt die Vorgabe an, senkt sie nie.</div>
          </div>
          {m.qualifikationen.length > 0 && (<div>
            <Lab style={{ marginBottom: 10 }}>Davon mit Qualifikation</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
              {m.qualifikationen.map((q) => (
                <Field key={q.id} label={q.name}><Inp type="number" min={0} value={(f.mindestQual || {})[q.id] || 0}
                  onChange={(e) => setF({ ...f, mindestQual: { ...(f.mindestQual || {}), [q.id]: Number(e.target.value) } })} /></Field>))}
            </div>
          </div>)}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn kind="quiet" onClick={() => setBearbeitet(null)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={speichern}>Speichern</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
