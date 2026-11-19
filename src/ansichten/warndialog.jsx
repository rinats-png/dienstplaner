/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { C } from "../farben.js";
import { Lab, Btn, Inp, Sel, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { fLang, fKurz } from "../lib/datum.js";
import { WARNSTUFEN, stufeRang, hoechsteStufe, ABWEICHUNG_GRUENDE } from "../warnstufen.js";
import { Sheet } from "../ui/leisten.jsx";
import { ersatzVorschlaege } from "../lib/fachlogik.js";
import { folgenPruefen } from "../lib/planhilfen.js";


/* ==========================================================================
   WARNDIALOG — warnen statt sperren (E-19)

   Ein Dialog für alle Stellen, an denen eine Einteilung gegen eine Regel
   verstoßen würde. Er zeigt Was, Wo, Warum, Grundlage, Folgen und andere
   Wege. Entscheiden tut der Mensch: ändern oder dennoch fortfahren.
   Bei einem Rechtsverstoß ist „gelesen" anzukreuzen; der Grund ist
   freiwillig und lässt sich überspringen.
   ========================================================================== */
export function Warndialog({ sitz, vorgang, onClose }) {
  const m = sitz.mandant;
  const eintraege = vorgang.geprueft;
  const mehrere = eintraege.length > 1;
  const ernst = (e) => e.technisch || e.befunde.some((b) => stufeRang(b.stufe) >= 2);
  const [auswahl, setAuswahl] = useState(() => new Set(eintraege
    .map((e, i) => i).filter((i) => !mehrere || !ernst(eintraege[i]))));
  const [gelesen, setGelesen] = useState(false);
  const [grundArt, setGrundArt] = useState("");
  const [grundText, setGrundText] = useState("");
  const [uebersprungen, setUebersprungen] = useState(false);

  const gewaehlt = eintraege.filter((_, i) => auswahl.has(i));
  const alleBefunde = gewaehlt.flatMap((e) => e.befunde);
  const stufe = hoechsteStufe(alleBefunde);
  const technisch = gewaehlt.filter((e) => e.technisch || e.befunde.some((b) => b.art === "bestand"));
  /* Harte Schutzbefunde (Kette B) lassen sich nicht wegbestätigen. */
  const geschuetzt = gewaehlt.filter((e) => e.befunde.some((b) => b.sperrt));
  const abwesend = gewaehlt.some((e) => e.befunde.some((b) => b.art === "abwesend"));
  const recht = stufe === "recht";
  /* Rechte bleiben (E-19, Grenzen): Eine Abwesenheit hebt nur auf, wer
     Abwesenheiten pflegen darf — die Schichtverantwortung nicht. */
  const abwesenheitGesperrt = abwesend && sitz.rolle === "subplaner";
  const kann = gewaehlt.length > 0 && !technisch.length && !geschuetzt.length && !abwesenheitGesperrt && (!recht || gelesen);
  const knopf = recht ? "Dennoch fortfahren" : stufe === "achtung" ? "Dennoch übernehmen" : (vorgang.knopf || "Übernehmen");
  const grund = ABWEICHUNG_GRUENDE.find((g) => g.id === grundArt);
  const einzel = !mehrere ? eintraege[0] : null;
  const folgen = einzel && einzel.person && einzel.da ? folgenPruefen(m, einzel.person, einzel.datum, einzel.dienstId).hinweise : [];
  const andere = einzel && vorgang.alternative && einzel.da
    ? ersatzVorschlaege(m, einzel.datum, einzel.dienstId).filter((x) => x.moeglich && x.person.id !== einzel.personId).slice(0, 3) : [];

  const umschalten = (i) => setAuswahl((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const ausfuehren = () => {
    vorgang.ausfuehren({
      eintraege: gewaehlt.map((e) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, idx: e.idx, befunde: e.befunde })),
      indizes: gewaehlt.map((e) => e.idx).filter((x) => x !== undefined),
      gelesen, grundArt: uebersprungen ? null : (grundArt || null), grundText: uebersprungen ? "" : grundText.trim(),
      abwesenheitAufheben: abwesend,
    });
    onClose();
  };
  const name = (e) => e.person ? `${e.person.vorname} ${e.person.nachname}` : "Unbekannte Person";
  const farbe = (s) => s === "recht" ? C.danger : s === "achtung" ? C.warn : C.dim;

  const Befund = ({ b }) => (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 8 }}>
      <Pill size="sm" tone={(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).ton}>{(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).label}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: farbe(b.stufe), lineHeight: 1.45 }}>{b.text}</div>
        {b.quelle && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 2 }}>Grundlage: {b.quelle}</div>}
      </div>
    </div>);

  return (
    <Sheet open onClose={onClose} titel={vorgang.titel || "Bitte prüfen"} width={720}>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 16 }}>
        {mehrere
          ? `${eintraege.filter((e) => !ernst(e)).length} von ${eintraege.length} Einträgen sind regelkonform und vorausgewählt. Einträge mit Befund kannst du einzeln dazunehmen.`
          : "CENTRIC sperrt nicht. Lies, was gegen die Einteilung spricht, und entscheide: ändern oder dennoch fortfahren."}
      </div>

      {eintraege.map((e, i) => (!mehrere || ernst(e) || e.befunde.length > 0) && (
        <div key={i} className="karte" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: e.befunde.length ? 10 : 0 }}>
            {mehrere && (
              <input type="checkbox" checked={auswahl.has(i)} onChange={() => umschalten(i)}
                aria-label={`${name(e)} am ${fKurz(e.datum)} übernehmen`} />)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name(e)}</div>
              <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                {fLang(e.datum)} · {e.da ? `${e.da.name} ${e.da.start}–${e.da.ende}` : e.dienstId}</div>
            </div>
          </div>
          {e.technisch && <div style={{ fontSize: 13, color: C.danger }}>{e.technisch}</div>}
          {e.befunde.map((b, k) => <Befund key={k} b={b} />)}
        </div>))}

      {mehrere && eintraege.every((e) => !ernst(e) && !e.befunde.length) && (
        <div style={{ fontSize: 13.5, color: C.ok, marginBottom: 12 }}>Alle Einträge sind regelkonform.</div>)}

      {folgen.length > 0 && (
        <div style={{ margin: "6px 0 14px" }}>
          <Lab style={{ marginBottom: 8 }}>Folgen</Lab>
          {folgen.map((h, k) => (
            <div key={k} style={{ fontSize: 13, marginBottom: 5,
              color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dim }}>{h.text}</div>))}
        </div>)}

      {andere.length > 0 && stufe && stufeRang(stufe) >= 2 && (
        <div style={{ margin: "6px 0 14px" }}>
          <Lab style={{ marginBottom: 8 }}>Andere Wege ohne Befund</Lab>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {andere.map((x) => (
              <Btn key={x.person.id} size="sm" onClick={() => { vorgang.alternative(x.person.id); onClose(); }}>
                {x.person.vorname} {x.person.nachname} einteilen</Btn>))}
          </div>
        </div>)}

      {abwesend && (
        <div style={{ fontSize: 13, color: abwesenheitGesperrt ? C.danger : C.dim, background: C.bg, borderRadius: 10, padding: "10px 12px", margin: "6px 0 14px", lineHeight: 1.5 }}>
          {abwesenheitGesperrt
            ? "Eine Abwesenheit kann nur die Planung oder die Leitung aufheben. Bitte dort melden oder einen anderen Weg wählen."
            : "Die Abwesenheit wird für diesen Tag aufgehoben und die Person benachrichtigt. Der übrige Zeitraum bleibt bestehen."}
        </div>)}

      {technisch.length > 0 && (
        <div style={{ fontSize: 13, color: C.danger, margin: "6px 0 14px", lineHeight: 1.5 }}>
          Das geht technisch nicht: Die Person ist an diesem Tag nicht beschäftigt. Prüfe Eintritt und Austritt unter Personal.
        </div>)}

      {geschuetzt.length > 0 && !technisch.length && (
        <div style={{ fontSize: 13, color: C.danger, margin: "6px 0 14px", lineHeight: 1.5 }}>
          Für diese Einteilung gilt eine sperrende Regel (Schutz, Einschränkung, gesetzliche Qualifikation,
          Einweisung oder Ruhezeit unter 11 Stunden). Sie lässt sich nicht bestätigen — bitte einen anderen Weg wählen.
        </div>)}

      {recht && !technisch.length && !geschuetzt.length && (
        <div className="karte" style={{ padding: 14, margin: "6px 0 14px" }}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" checked={gelesen} onChange={(e) => setGelesen(e.target.checked)} />
            Ich habe den Hinweis gelesen. Die Einteilung verstößt gegen eine gesetzliche Vorgabe; die Verantwortung liegt beim Arbeitgeber.
          </label>
          {!uebersprungen && (
            <div style={{ marginTop: 12 }}>
              <Lab style={{ marginBottom: 6 }}>Grund (freiwillig)</Lab>
              <Sel value={grundArt} onChange={(e) => setGrundArt(e.target.value)} aria-label="Grund für die Abweichung">
                <option value="">Grund wählen …</option>
                {ABWEICHUNG_GRUENDE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Sel>
              {grund && <Inp value={grundText} onChange={(e) => setGrundText(e.target.value)}
                placeholder={grund.feld} aria-label={grund.feld} style={{ marginTop: 8 }} />}
            </div>)}
          <div style={{ marginTop: 10 }}>
            <Btn size="sm" kind="quiet" onClick={() => setUebersprungen(!uebersprungen)}>
              {uebersprungen ? "Doch einen Grund angeben" : "Überspringen"}</Btn>
          </div>
        </div>)}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <Btn kind="quiet" onClick={onClose}>Ändern</Btn>
        <Btn kind={recht ? "danger" : stufe === "achtung" ? "warn" : "primary"} disabled={!kann} onClick={ausfuehren}>
          {mehrere ? `${knopf} (${gewaehlt.length})` : knopf}</Btn>
      </div>
      {vorgang.fussnote && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>{vorgang.fussnote}</div>}
    </Sheet>);
}
