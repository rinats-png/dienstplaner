/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute } from "../lib/datum.js";
import { darf, krankRolle } from "../lib/berechtigung.js";
import { darfEinheit, personTag } from "../lib/fachlogik.js";
import { addDays } from "../regelwerk.js";
import { Sheet } from "../ui/leisten.jsx";
import { Field, Sel, Inp, Btn, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { Icon } from "../gestalt/icons.jsx";
import { Ersatzliste } from "../ansichten/ersatzliste.jsx";
import { anzahlWort } from "../lib/rollen.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { krankSchrittErlaubt } from "../../server/lib/krankmeldung.mjs";

export function Krankmeldung({ sitz, akt, onClose, vorauswahl }) {
  const m = sitz.mandant;
  const [schritt, setSchritt] = useState(vorauswahl ? 2 : 1);
  const [f, setF] = useState({ personId: vorauswahl || "", von: heute(), bis: heute(), notiz: "" });
  const [luecken, setLuecken] = useState([]);
  const [idx, setIdx] = useState(0);
  const eigene = sitz.person && !darf(sitz, "staff.edit") && !darfEinheit(sitz, sitz.person.bereich);
  /* RB-2: Ohne Recht zur endgültigen Bestätigung (Beschäftigte, Schichtverantwortung) ist die Meldung nur
     eingegangen — keine Lücke, keine Ersatzsuche, bis Planung oder Leitung sie endgültig bestätigt. */
  const vorlaeufig = !krankSchrittErlaubt(krankRolle(sitz), "endgueltig");
  const [fehler, setFehler] = useState(null);

  const melden = async () => {
    const p = m.personen.find((x) => x.id === f.personId);
    setFehler(null);
    if (!p) return;
    if (f.bis < f.von) { setFehler("„Voraussichtlich bis“ liegt vor „Von“. Bitte den Zeitraum prüfen."); return; }
    const offen = [];
    if (!vorlaeufig) for (let d = f.von; d <= f.bis; d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (t.dienstId) offen.push({ datum: d, dienstId: t.dienstId });
    }
    const ok = await akt.krankmelden(f.personId, f.von, f.bis, f.notiz);
    if (vorlaeufig && ok === false) { setFehler("Die Krankmeldung wurde nicht gespeichert. Die Meldung oben nennt den Grund."); return; }
    /* Wer nur die eigene Abwesenheit melden darf, teilt keinen Ersatz ein —
       das ist Sache der Planung, und der Server nähme es ohnehin nicht an. */
    setLuecken(offen); setIdx(0); setSchritt(offen.length && !eigene ? 3 : 4);
  };

  const kandidaten = m.personen.filter((p) => imDienst(p, heute()) &&
    (darf(sitz, "staff.edit") || darfEinheit(sitz, einheitAm(p, heute())) || p.id === sitz.person.id));

  return (
    <Sheet open onClose={onClose} titel="Krankmeldung" width={720}>
      {schritt <= 2 && (
        <div style={{ display: "grid", gap: 15 }}>
          <Field label="Person">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— wählen —</option>
              {kandidaten.map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Von"><Inp type="date" value={f.von} aria-describedby={fehler ? "krank-fehler" : undefined} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
            <Field label="Voraussichtlich bis"><Inp type="date" value={f.bis} aria-invalid={fehler ? "true" : undefined} aria-describedby={fehler ? "krank-fehler" : undefined} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
          </div>
          <Field label="Anmerkung" hint="Kein Grund, keine Diagnose — nur was für die Planung nötig ist.">
            <Inp value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} /></Field>
          <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
            {vorlaeufig
              ? "Die Meldung geht an Planung und Leitung. Wirksam wird sie mit deren endgültiger Bestätigung; bis dahin bleibt der Plan unverändert."
              : eigene
              ? "Die Meldung wirkt sofort. Betroffene Dienste erscheinen für die Planung in der Prüfung."
              : "Die Meldung wirkt sofort. Anschließend zeigt die App jede entstandene Lücke und schlägt Ersatz vor."}
          </div>
          {fehler && <div id="krank-fehler" role="alert" style={{ fontSize: 13, color: C.danger }}>{fehler}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.personId} onClick={melden}>Krank melden</Btn>
          </div>
        </div>)}

      {schritt === 3 && luecken[idx] && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <Pill tone="danger">Lücke {idx + 1} von {luecken.length}</Pill>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn size="sm" kind="quiet" disabled={idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
              <Btn size="sm" kind="quiet" onClick={() => (idx + 1 < luecken.length ? setIdx(idx + 1) : setSchritt(4))}>
                {idx + 1 < luecken.length ? <>Überspringen <Icon n="chevron-rechts" size={14} /></> : "Fertig"}</Btn>
            </div>
          </div>
          <Ersatzliste sitz={sitz} datum={luecken[idx].datum} dienstId={luecken[idx].dienstId} akt={akt}
            onFertig={() => (idx + 1 < luecken.length ? setIdx(idx + 1) : setSchritt(4))} />
        </div>)}

      {schritt === 4 && (
        <div style={{ textAlign: "center", padding: "26px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{vorlaeufig ? "Krankmeldung eingegangen" : "Krankmeldung erfasst"}</div>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 20, lineHeight: 1.5 }}>
            {vorlaeufig
              ? "Status: eingegangen. Endgültig bestätigen Planung oder Leitung; erst dann steht die Abwesenheit im Plan."
              : luecken.length === 0
              ? "Es waren keine Dienste betroffen."
              : `${anzahlWort(luecken.length, "Dienst")} betroffen. Verbliebene Lücken erscheinen in der Prüfung.`}
          </div>
          <Btn kind="primary" onClick={onClose}>Schließen</Btn>
        </div>)}
    </Sheet>);
}
