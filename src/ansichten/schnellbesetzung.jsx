/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { C } from "../farben.js";
import { klickbar, Lab, Btn } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { fLang, fKurz } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { Zelle, Sheet } from "../ui/leisten.jsx";
import { besetzung, ersatzVorschlaege } from "../lib/fachlogik.js";
import { anfrageText, folgenPruefen } from "../lib/planhilfen.js";
import { FONT } from "../ui/schriftart.js";


export function Schnellbesetzung({ sitz, datum, dienstId, akt, onClose }) {
  const m = sitz.mandant;
  const [gewaehlt, setGewaehlt] = useState(null);
  const [text, setText] = useState(null);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const liste = useMemo(() => ersatzVorschlaege(m, datum, dienstId), [m, datum, dienstId]);
  const [mitAbweichung, setMitAbweichung] = useState(false);
  const moeglich = liste.filter((x) => x.moeglich || mitAbweichung);
  const anzahlAbweichung = liste.filter((x) => !x.moeglich).length;
  const folgen = gewaehlt ? folgenPruefen(m, gewaehlt, datum, dienstId) : null;
  const nachricht = anfrageText(m, datum, dienstId, Math.max(0, -b.diff));

  const versenden = (weg) => {
    const t = encodeURIComponent(nachricht);
    const url = weg === "whatsapp" ? `https://wa.me/?text=${t}`
      : weg === "sms" ? `sms:?body=${t}`
      : `mailto:?subject=${encodeURIComponent("Dienstanfrage " + fKurz(datum))}&body=${t}`;
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { setText(nachricht); }
    akt.anfrageVermerken(datum, dienstId, weg);
  };

  return (
    <Sheet open onClose={onClose} titel="Dienst besetzen" width={780}>
      <div className="karte" style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Zelle da={da} size={40} />
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{da.name}</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{fLang(datum)} · {da.start}–{da.ende} · {da.ort}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 650, color: b.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {b.anzahl}<span style={{ fontSize: 14, color: C.dimmer, fontWeight: 500 }}>/{b.soll}</span></div>
          <div style={{ fontSize: 11.5, color: C.dimmer }}>{b.diff < 0 ? `${Math.abs(b.diff)} fehlen` : "gedeckt"}</div>
        </div>
      </div>

      {/* Weg 1: direkt eintragen */}
      <Lab style={{ marginBottom: 10 }}>Direkt eintragen · nach Eignung sortiert</Lab>
      {moeglich.length === 0 && (
        <div style={{ padding: 14, borderRadius: 12, background: C.dangerLight, color: C.danger, fontSize: 13.5, marginBottom: 16 }}>
          Niemand einsetzbar, ohne Ruhezeit oder Einschränkungen zu verletzen. Nutze die Anfrage unten,
          die Eskalation im Tagesdetail oder wähle unten jemanden mit Abweichung.
        </div>)}
      <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 18 }}>
        {moeglich.slice(0, mitAbweichung ? 30 : 8).map((x, i) => {
          const an = gewaehlt && gewaehlt.id === x.person.id;
          return (
            <div key={x.person.id} aria-pressed={an}
              {...klickbar(() => setGewaehlt(an ? null : x.person),
                `${x.person.nachname}, ${x.person.vorname} — Vorschlag ${i + 1}`)}
              className="karte" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
                marginBottom: 7, cursor: "pointer", outline: an ? `2px solid ${C.accent}` : "none" }}>
              <span style={{ width: 25, height: 25, borderRadius: 9, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...NUM,
                background: i === 0 ? C.okLight : C.bg, color: i === 0 ? C.ok : C.dimmer }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{x.person.vorname} {x.person.nachname}</div>
                <div style={{ fontSize: 12, color: x.moeglich ? C.dimmer : C.danger }}>
                  {x.moeglich ? x.gruende.slice(0, 2).join(" · ") : `mit Abweichung: ${x.hindernisse[0]}`}</div>
              </div>
              <span style={{ fontSize: 12, color: C.dimmer }}>{an ? "gewählt" : "prüfen"}</span>
            </div>);
        })}
      </div>

      {folgen && (
        <div className="karte" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>
            Folgen für {gewaehlt.vorname} {gewaehlt.nachname}</div>
          {folgen.hindernisse.length > 0 && folgen.hindernisse.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ color: C.danger, display: "flex", marginTop: 2 }}><Icon n="x" size={14} strokeWidth={2.2} /></span>
              <span style={{ fontSize: 13, color: C.danger }}>{h}</span></div>))}
          {folgen.hinweise.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700,
                color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dimmer }}>
                {h.art === "danger" ? <Icon n="x" size={14} strokeWidth={2.2} /> : h.art === "warn" ? <Icon n="warnung" size={14} /> : "·"}</span>
              <span style={{ fontSize: 13, color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dim }}>{h.text}</span>
            </div>))}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn kind="quiet" onClick={() => setGewaehlt(null)}>Andere wählen</Btn>
            <Btn kind={folgen.hindernisse.length ? "danger" : "primary"}
              onClick={() => akt.mitWarnung(m, { titel: "Dienst besetzen",
                eintraege: [{ personId: gewaehlt.id, datum, dienstId }], knopf: "Eintragen",
                alternative: (pid) => { akt.setzeEinsprung(pid, datum, dienstId); onClose(); },
                ausfuehren: (best) => { akt.setzeEinsprung(gewaehlt.id, datum, dienstId, best); onClose(); } })}>
              {folgen.hindernisse.length ? "Trotzdem eintragen …" : "Eintragen"}</Btn>
          </div>
        </div>)}

      {anzahlAbweichung > 0 && (
        <Btn size="sm" kind="quiet" onClick={() => setMitAbweichung(!mitAbweichung)} style={{ marginTop: -8, marginBottom: 16 }}>
          {mitAbweichung ? "Nur regelkonforme zeigen" : `Auch ${anzahlAbweichung} mit Abweichung zeigen`}</Btn>)}

      {/* Weg 2: offene Anfrage versenden */}
      <div style={{ paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 10 }}>Oder Anfrage versenden</Lab>
        <pre className="karte" style={{ padding: 14, fontSize: 12.5, whiteSpace: "pre-wrap",
          fontFamily: FONT, color: C.dim, margin: "0 0 14px", lineHeight: 1.5 }}>{nachricht}</pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn kind="primary" onClick={() => versenden("whatsapp")}>Über WhatsApp</Btn>
          <Btn onClick={() => versenden("sms")}>Als SMS</Btn>
          <Btn onClick={() => versenden("mail")}>Per E-Mail</Btn>
          <Btn kind="quiet" onClick={() => { try { navigator.clipboard.writeText(nachricht); akt.melden("Text kopiert."); }
            catch (e) { setText(nachricht); } }}>Text kopieren</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
          Die Nachricht wird im gewählten Dienst geöffnet, die Empfänger wählst du dort. Wer zusagt,
          wird anschließend hier eingetragen — die Prüfung läuft dann genauso.
        </div>
        {text && <textarea readOnly value={text} onFocus={(e) => e.target.select()} className="inp"
          style={{ height: 150, marginTop: 12, fontSize: 12.5 }} />}
      </div>
    </Sheet>);
}
