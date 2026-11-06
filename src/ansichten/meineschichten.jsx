/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute, fKurz, fLang, DOW } from "../lib/datum.js";
import { istStunden, sollStunden, urlaubskonto, stundenkonto, offeneErfassung, freigabeStand, abwArt, kontoVerlauf, personTag, ABW } from "../lib/fachlogik.js";
import { addDays, dauer, dow } from "../regelwerk.js";
import { einheitAm, nachtAnteil, imDienst } from "../../server/lib/fachpruefung.mjs";
import { H1, Btn, Card, CardHead, Pill, Lab, Field, Inp, Sel } from "../ui/bausteine.jsx";
import { rolle } from "../lib/rollen.js";
import { darf } from "../lib/berechtigung.js";
import { Kennzahlen, Fehlerband } from "../gestalt/ansichten.jsx";
import { n1Ist, n1, sgn, sgnIst } from "../lib/format.js";
import { ISTDATEN_TEXT, pruefHinweis, pruefFallText, vormonateMitPruefung } from "../istdaten.js";
import { C } from "../farben.js";
import { Zelle, Sheet } from "../ui/leisten.jsx";
import { NUM } from "../ui/thema.js";
import { LinienDiagramm } from "../ui/diagramme.jsx";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { nachtschwelle } from "../../server/lib/fachpruefung.mjs";

/* ==========================================================================
   MEINE SCHICHTEN — die Sicht der Mitarbeiterrolle
   ========================================================================== */
export function MeineSchichten({ sitz, akt, ym }) {
  const { mandant: m, person: ich } = sitz;
  const [antrag, setAntrag] = useState(null);
  const [form, setForm] = useState({ art: "urlaub", von: heute(), bis: heute(), text: "" });
  const [tausch, setTausch] = useState({ datum: "", partnerId: "", text: "" });
  const [fehler, setFehler] = useState(null);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const ist = istStunden(m, ich, ym), soll = sollStunden(m, ich, ym);
  const url = urlaubskonto(m, ich, Number(ym.slice(0, 4)));
  const kto = stundenkonto(m, ich, ym);
  const tage = Array.from({ length: 28 }, (_, i) => addDays(heute(), i));
  const meine = m.anfragen.filter((a) => a.personId === ich.id).sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const offen = offeneErfassung(m, ich, addDays(heute(), -1));
  const einsatz = m.anfragen.filter((a) => a.personId === ich.id && a.typ === "einsatz" && a.status === "offen");
  const [korrektur, setKorrektur] = useState(null);
  const frei = freigabeStand(m, ym);
  const einheit = m.einheiten.find((e) => e.id === einheitAm(ich, heute()));

  const sendeUrlaub = () => {
    setFehler(null);
    if (form.bis < form.von) return setFehler("Das Ende liegt vor dem Beginn.");
    const k = m.abwesenheiten.find((a) => a.personId === ich.id && a.von <= form.bis && form.von <= a.bis);
    if (k) return setFehler(`Überschneidet sich mit ${abwArt(k.art).label} vom ${fKurz(k.von)} bis ${fKurz(k.bis)}.`);
    akt.stelleAntrag({ typ: "abwesenheit", art: form.art, von: form.von, bis: form.bis, text: form.text });
    setAntrag(null); setForm({ art: "urlaub", von: heute(), bis: heute(), text: "" });
  };
  const sendeTausch = () => {
    setFehler(null);
    if (!tausch.datum || !tausch.partnerId) return setFehler("Datum und Tauschpartner werden benötigt.");
    akt.stelleAntrag({ typ: "tausch", von: tausch.datum, bis: tausch.datum, partnerId: tausch.partnerId, text: tausch.text });
    setAntrag(null); setTausch({ datum: "", partnerId: "", text: "" });
  };

  return (
    <div>
      <H1 sub={`${ich.vorname} ${ich.nachname} · ${einheit ? einheit.name : "ohne Zuordnung"} · ${rolle(ich.rolle).label}`}
        right={<div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Btn onClick={() => akt.oeffneWunsch(ich.id)}>Wunschdienste</Btn>
          <Btn onClick={() => akt.oeffneVerfuegbarkeit(ich.id)}>Verfügbarkeit</Btn>
          <Btn kind="danger" onClick={() => akt.oeffneKrankmeldung(ich.id)}>Krank melden</Btn>
          {darf(sitz, "req.create") && <>
            <Btn kind="primary" onClick={() => setAntrag("abwesenheit")}>Antrag stellen</Btn>
            <Btn onClick={() => setAntrag("tausch")}>Tausch anfragen</Btn></>}
          <Btn kind="quiet" onClick={() => akt.kalenderAbo(ich.id)}>Kalender</Btn>
        </div>}>Meine Schichten</H1>

      {/* Ohne Ist-Daten (Betriebsrat, E1) steht „–" und der Grund — keine 0. */}
      <Kennzahlen min={200} kacheln={[
        { label: "Stunden im Monat", wert: n1Ist(ist.gesamt), einheit: "h",
          sub: ist.nichtVerfuegbar ? `Soll ${n1(soll)} h · ${ISTDATEN_TEXT}` : `Soll ${n1(soll)} h · ${sgn(ist.gesamt - soll)} h`,
          ton: ist.nichtVerfuegbar ? undefined : Math.abs(ist.gesamt - soll) < 7 ? "ok" : "warn" },
        { label: "Stundenkonto", wert: sgnIst(kto), einheit: "h", ton: kto === null ? undefined : Math.abs(kto) < 18 ? "ok" : "warn",
          sub: kto === null ? ISTDATEN_TEXT : "kumuliert seit Jahresbeginn" },
        { label: "Resturlaub", wert: url.rest, einheit: "Tage", ton: url.rest < 5 ? "warn" : "ok", sub: `von ${url.anspruch} Tagen` },
        { label: "Nachtstunden", wert: n1Ist(ist.nacht), einheit: "h",
          sub: ist.nichtVerfuegbar ? ISTDATEN_TEXT : `${ist.naechte} Nachtdienste im Monat` }]} />

      {einsatz.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: C.danger, borderWidth: 2 }}>
          <CardHead right={<Pill tone="danger">{einsatz.length}</Pill>}>Einsatzanfragen</CardHead>
          {einsatz.map((a) => {
            const da = map[a.dienstId];
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px",
                borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <Zelle da={da} size={32} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{fLang(a.von)}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                    {da ? `${da.name} · ${da.start}–${da.ende} · ${n1(dauer(da))} h` : a.dienstId}</div>
                </div>
                <Btn size="sm" kind="ok" onClick={() => akt.beantworteEinsatz(a.id, true)}>Zusagen</Btn>
                <Btn size="sm" kind="quiet" onClick={() => akt.beantworteEinsatz(a.id, false)}>Absagen</Btn>
              </div>); })}
        </Card>)}

      <Card style={{ marginBottom: 16 }}>
        <CardHead right={<Lab>zwölf Monate</Lab>}>Mein Stundenkonto</CardHead>
        <div style={{ padding: "22px 24px 18px" }}>
          {kto !== null && (() => { const h = pruefHinweis(m, ym, ich.id); return h && (
            <div style={{ fontSize: 13, color: C.warn, marginBottom: 12, lineHeight: 1.5 }}>
              {h.faelle.map((f) => `${fKurz(f.datum)} (${pruefFallText(f.art)})`).join(", ")} — die Leitung prüft die gestempelte Zeit.
            </div>); })()}
          {kto !== null && (() => { const v = vormonateMitPruefung(m, ym, ich.id); return v.length > 0 && (
            <div style={{ fontSize: 13, color: C.warn, marginBottom: 12, lineHeight: 1.5 }}>
              Vormonate mit offenen Prüffällen: {v.map((x) => `${x.monat} (${x.anzahl})`).join(", ")} — dort zählt vorläufig die Planzeit.
            </div>); })()}
          {kto === null
            ? <div style={{ fontSize: 13.5, color: C.dim }}>{ISTDATEN_TEXT}</div>
            : <LinienDiagramm daten={kontoVerlauf(m, ich, ym, 12)} wert="kto" label="label" einheit=" h"
                hoehe={140} farbe={kto > 0 ? C.warn : C.ok} />}
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
            Steigt die Linie über Monate, steht Freizeitausgleich an. Sprich das mit der Planung ab.
          </div>
        </div>
      </Card>

      {offen.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHead right={<Pill tone="warn">{offen.length}</Pill>}>Zeiten bestätigen</CardHead>
          <div style={{ padding: "14px 22px 6px", fontSize: 13, color: C.dim, lineHeight: 1.5 }}>
            Solange die tatsächliche Zeit nicht bestätigt ist, bleibt das Stundenkonto eine Hochrechnung.
          </div>
          {offen.slice(0, 6).map((d) => {
            const t = personTag(m, ich, d), da = map[t.dienstId];
            return (
              <div key={d} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "12px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <Zelle da={da} size={30} />
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, ...NUM }}>{fKurz(d)} · {da.name}</div>
                  <div style={{ fontSize: 12, color: C.dimmer, ...NUM }}>geplant {da.start}–{da.ende} · {n1(dauer(da))} h</div>
                </div>
                <Btn size="sm" kind="ok" onClick={() => akt.bestaetigeZeit(ich.id, d, null, null, "")}>Wie geplant</Btn>
                <Btn size="sm" onClick={() => setKorrektur({ datum: d, start: da.start, ende: da.ende, grund: "" })}>Abweichend</Btn>
              </div>); })}
        </Card>)}

      {meine.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHead>Meine Anträge</CardHead>
          <div>{meine.slice(0, 6).map((a) => (
            <div key={a.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>
                {a.status === "offen" ? "offen" : a.status === "genehmigt" ? "genehmigt" : "abgelehnt"}</Pill>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>
                  {a.typ === "tausch" ? "Tauschanfrage" : abwArt(a.art).label}
                  <span style={{ color: C.dimmer, ...NUM }}> · {fKurz(a.von)}{a.bis !== a.von ? ` – ${fKurz(a.bis)}` : ""}</span>
                </div>
                {a.text && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 2 }}>{a.text}</div>}
                {a.antwort && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Antwort: {a.antwort}</div>}
              </div>
              {a.status === "offen" && <Btn size="sm" kind="quiet" onClick={() => akt.zieheAntragZurueck(a.id)}>Zurückziehen</Btn>}
            </div>))}</div>
        </Card>)}

      <Card>
        <CardHead right={<Pill size="sm" tone={frei ? "ok" : "warn"}>{frei ? "freigegeben" : "Entwurf"}</Pill>}>
          Kommende Dienste</CardHead>
        <div>{tage.map((d) => {
          const t = personTag(m, ich, d), da = map[t.dienstId], fei = feiertag(d, m.bundesland);
          return (
            /* flexWrap: Bei 320 px passten Datum, Dienst und die Marken
               „Nacht" und „geändert" nicht in eine Zeile und schoben die
               Seite in die Breite. Umgebrochen wird nur, wenn es eng wird. */
            <div key={d} className="row" style={{ display: "flex", alignItems: "center", gap: 18, rowGap: 8, flexWrap: "wrap", padding: "14px 22px",
              borderBottom: `1px solid ${C.lineSoft}`, background: d === heute() ? C.accentLight : "transparent" }}>
              <div style={{ width: 104, flexShrink: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: d === heute() ? 650 : 500, ...NUM }}>{fKurz(d)}</div>
                <div style={{ fontSize: 11.5, color: fei ? C.danger : C.dimmer }}>{DOW[dow(d)]}{fei ? " · Feiertag" : ""}</div>
              </div>
              <Zelle da={da} abw={t.abwesenheit} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: t.quelle === "entwurf" && !t.abwesenheit ? C.dimmer : undefined }}>
                  {t.abwesenheit ? abwArt(t.abwesenheit.art).label
                    : t.quelle === "entwurf" ? "noch nicht veröffentlicht" : da ? da.name : "frei"}</div>
                {da && <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{da.start}–{da.ende} · {n1(dauer(da))} h · {da.ort}</div>}
              </div>
              {da && nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen)
                && <Pill size="sm" tone="violet">Nacht</Pill>}
              {t.quelle === "abweichung" && <Pill size="sm" tone="warn">geändert</Pill>}
            </div>);
        })}</div>
      </Card>

      <Sheet open={!!korrektur} onClose={() => setKorrektur(null)} titel="Tatsächliche Zeit" width={520}>
        {korrektur && (<div style={{ display: "grid", gap: 15 }}>
          <div style={{ fontSize: 13.5, color: C.dim }}>{fLang(korrektur.datum)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Beginn"><Inp type="time" value={korrektur.start}
              onChange={(e) => setKorrektur({ ...korrektur, start: e.target.value })} /></Field>
            <Field label="Ende"><Inp type="time" value={korrektur.ende}
              onChange={(e) => setKorrektur({ ...korrektur, ende: e.target.value })} /></Field>
          </div>
          <Field label="Grund" hint="Zum Beispiel verlängerte Übergabe oder Einsatz über die Schicht hinaus.">
            <Inp value={korrektur.grund} onChange={(e) => setKorrektur({ ...korrektur, grund: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setKorrektur(null)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={() => { akt.bestaetigeZeit(ich.id, korrektur.datum, korrektur.start, korrektur.ende, korrektur.grund); setKorrektur(null); }}>
              Bestätigen</Btn>
          </div>
        </div>)}
      </Sheet>

      <Sheet open={!!antrag} onClose={() => { setAntrag(null); setFehler(null); }}
        titel={antrag === "tausch" ? "Tausch anfragen" : "Antrag stellen"} width={560}>
        {antrag === "abwesenheit" ? (
          <div style={{ display: "grid", gap: 15 }}>
            <Field label="Art"><Sel value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
              {ABW.filter((a) => a.id !== "krank" && a.selbst !== false).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Von"><Inp type="date" value={form.von} onChange={(e) => setForm({ ...form, von: e.target.value })} /></Field>
              <Field label="Bis"><Inp type="date" value={form.bis} onChange={(e) => setForm({ ...form, bis: e.target.value })} /></Field>
            </div>
            <Field label="Anmerkung"><Inp value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="freiwillig" /></Field>
            {fehler && <Fehlerband>{fehler}</Fehlerband>}
            <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Beim Urlaub werden nur Tage angerechnet, an denen laut Schichtfolge Dienst gewesen wäre.
              Der Antrag geht an die Planung der eigenen Einheit.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setAntrag(null)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={sendeUrlaub}>Absenden</Btn></div>
          </div>) : (
          <div style={{ display: "grid", gap: 15 }}>
            <Field label="Dienst am" hint="Nur Tage, an denen du eingeteilt bist.">
              <Sel value={tausch.datum} onChange={(e) => setTausch({ ...tausch, datum: e.target.value })}>
                <option value="">— wählen —</option>
                {tage.filter((d) => personTag(m, ich, d).dienstId).map((d) => {
                  const da = map[personTag(m, ich, d).dienstId];
                  return <option key={d} value={d}>{fLang(d)} — {da.name}</option>; })}</Sel></Field>
            <Field label="Tauschpartner">
              <Sel value={tausch.partnerId} onChange={(e) => setTausch({ ...tausch, partnerId: e.target.value })}>
                <option value="">— wählen —</option>
                {m.personen.filter((p) => p.id !== ich.id && imDienst(p, heute()))
                  .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel></Field>
            <Field label="Anmerkung"><Inp value={tausch.text} onChange={(e) => setTausch({ ...tausch, text: e.target.value })} /></Field>
            {fehler && <Fehlerband>{fehler}</Fehlerband>}
            <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Bei Genehmigung werden beide Dienste getauscht. Ruhezeit und Besetzung werden dabei geprüft.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setAntrag(null)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={sendeTausch}>Absenden</Btn></div>
          </div>)}
      </Sheet>
    </div>);
}
