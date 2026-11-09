/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Btn, Inp, H1, Pill } from "../ui/bausteine.jsx";
import { heute, fLang } from "../lib/datum.js";
import { Leitraster, Seitenkarte, Balkenzeile, Punkt } from "../gestalt/ansichten.jsx";
import { EinheitWahl } from "./einheitwahl.jsx";
import { waehltEinheit, einheitName } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";


/* ================================ DIENSTBUCH ============================ */
export function Dienstbuch({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [text, setText] = useState("");
  const [art, setArt] = useState("uebergabe");
  const arten = [["uebergabe", "Übergabe"], ["vorkommnis", "Vorkommnis"], ["hinweis", "Hinweis"]];
  const eintraege = (m.dienstbuch || []).filter((e) => e.datum === datum);
  const darfSchreiben = darf(sitz, "plan.view.unit");
  const [einheitId, setEinheitId] = useState(null);

  return (
    <div>
      <H1 sub="Was die nächste Schicht wissen muss. Ersetzt den Zettel am Wachtisch und bleibt nachvollziehbar."
        right={<Inp type="date" value={datum} aria-label="Tag des Dienstbuchs"
          onChange={(e) => setDatum(e.target.value)} style={{ width: 180 }} />}>
        Dienstbuch</H1>

      {darfSchreiben && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead>Eintrag für {fLang(datum)}</CardHead>
          <div style={{ padding: 22, display: "grid", gap: 13 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {arten.map(([id, l]) => (
                <button key={id} onClick={() => setArt(id)} className="btn btn-sm" aria-pressed={art === id}
                  style={{ background: art === id ? C.accentLight : C.flaeche,
                    borderColor: art === id ? C.accent : undefined,
                    color: art === id ? C.accent : C.dim, fontWeight: 600 }}>{l}</button>))}
            </div>
            <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)}
              aria-label="Eintrag ins Dienstbuch"
              placeholder="Kurz und sachlich. Keine Gesundheitsdaten, keine Bewertungen von Personen." />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {waehltEinheit(sitz) && <EinheitWahl m={m} wert={einheitId} setWert={setEinheitId} style={{ marginRight: "auto" }} />}
              <Btn kind="primary" disabled={!text.trim()}
                onClick={() => { akt.dienstbuchEintrag(datum, art, text, einheitId); setText(""); }}>Eintragen</Btn>
            </div>
          </div>
        </Card>)}

      <Leitraster seiteBreite={340}
        haupt={<>
      <Card>
        <CardHead right={<Lab>{eintraege.length} Einträge</Lab>}>{fLang(datum)}</CardHead>
        {eintraege.length === 0
          ? <Leer titel="Kein Eintrag" text="Für diesen Tag wurde nichts vermerkt." />
          : eintraege.map((e, i) => (
            <div key={e.id} style={{ display: "flex", gap: 15, padding: "15px 22px",
              borderBottom: i < eintraege.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <span style={{ paddingTop: 6 }}><Punkt gross ton={e.art === "vorkommnis" ? "danger" : e.art === "hinweis" ? "warn" : "accent"} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <Pill size="sm" tone={e.art === "vorkommnis" ? "danger" : e.art === "hinweis" ? "warn" : "accent"}>
                    {(arten.find((a) => a[0] === e.art) || [])[1]}</Pill>
                  <span style={{ fontSize: 12.5, color: C.dimmer }}>{e.zeit} · {e.durch}{waehltEinheit(sitz) ? ` · ${einheitName(m, e.einheitId)}` : ""}</span>
                </div>
                <div style={{ fontSize: 14, color: C.text, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.text}</div>
              </div>
            </div>))}
      </Card>
        </>}
        seite={eintraege.length > 0 ? (
          <Seitenkarte titel="Einträge nach Art" sub={fLang(datum)}>
            {arten.map(([id, l]) => {
              const n = eintraege.filter((x) => x.art === id).length;
              return <Balkenzeile key={id} label={l} wert={n} anteil={(n / eintraege.length) * 100}
                ton={id === "vorkommnis" ? "danger" : id === "hinweis" ? "warn" : "accent"} punkt />;
            })}
          </Seitenkarte>) : null} />
    </div>);
}
