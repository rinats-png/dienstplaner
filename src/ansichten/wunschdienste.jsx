/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute, MON, DOW, fKurz } from "../lib/datum.js";
import { dim_, dow, pad } from "../regelwerk.js";
import { C } from "../farben.js";
import { Btn, H1, Card, Pill } from "../ui/bausteine.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { wunschAm, WUNSCH_ARTEN, personTag } from "../lib/fachlogik.js";
import { NUM, lesbar } from "../ui/thema.js";
import { Sheet } from "../ui/leisten.jsx";
import { Leitraster, Seitenkarte } from "../gestalt/ansichten.jsx";
import { Fortschritt } from "../gestalt/bausteine.jsx";

/* ============================== WUNSCHDIENSTE ========================= */
export function Wunschdienste({ sitz, akt, personId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === (personId || sitz.person.id));
  const [monat, setMonat] = useState(heute().slice(0, 7));
  if (!p) return null;
  const [y, mo] = monat.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${monat}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [...Array(erster).fill(null), ...Array.from({ length: n }, (_, i) => `${monat}-${pad(i + 1)}`)];
  const meine = (m.wuensche || []).filter((w) => w.personId === p.id && w.datum.startsWith(monat));
  const shift = (d) => { const x = new Date(y, mo - 1 + d, 1); setMonat(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`); };

  /* Zweimal im Einsatz: als Blatt über einer anderen Ansicht — mit
     onClose — und als eigene Navigationsansicht, ohne. In der zweiten Lage
     rendete die Komponente trotzdem ein Blatt, dessen „Fertig" und Escape
     ein undefined riefen. Es ließ sich nicht schließen und verdeckte die
     Seitenleiste; wer den Menüpunkt hatte, saß danach fest. Die Leitung
     bemerkte es nicht, weil sie ihn nicht sieht. Ohne onClose ist es jetzt
     eine Seite. */
  const titel = `Wunschdienste · ${p.vorname} ${p.nachname}`;
  const kern = (<>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
        Tippe einen Tag an: einmal für <b>möchte arbeiten</b>, zweimal für <b>lieber nicht</b>, dreimal zum Löschen.
        Wünsche sind keine Anträge — die Planung berücksichtigt sie, soweit die Besetzung es zulässt.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Btn size="sm" onClick={() => shift(-1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
        <span style={{ fontSize: 16, fontWeight: 620 }}>{MON[mo - 1]} {y}</span>
        <Btn size="sm" onClick={() => shift(1)} aria-label="Weiter"><Icon n="chevron-rechts" size={16} /></Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 8 }}>
        {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600,
          color: i >= 5 ? C.dimmer : C.dim }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {zellen.map((d, i) => {
          if (!d) return <div key={i} />;
          const w = wunschAm(m, p.id, d);
          const art = w ? WUNSCH_ARTEN.find((a) => a.id === w.art) : null;
          const t = personTag(m, p, d);
          const da = t.dienstId && map[t.dienstId];
          const vergangen = d < heute();
          return (
            <button key={d} disabled={vergangen} onClick={() => akt.setzeWunsch(p.id, d)}
               style={{ padding: "8px 4px", borderRadius: 11, border: "none",
                cursor: vergangen ? "default" : "pointer", textAlign: "center", opacity: vergangen ? .38 : 1,
                background: art ? `${art.farbe}1C` : C.bg,
                outline: art ? `1.5px solid ${art.farbe}66` : "none" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: art ? art.farbe : C.dim, ...NUM }}>
                {Number(d.slice(8))}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, color: da ? da.farbe : "transparent", ...NUM }}>
                {da ? da.kurz : "·"}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: art ? art.farbe : "transparent", lineHeight: 1 }}>
                {art ? art.zeichen : "·"}</div>
            </button>);
        })}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
        {WUNSCH_ARTEN.map((a) => (
          <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 17, height: 17, borderRadius: 6, background: `${a.farbe}1C`,
              color: lesbar(a.farbe), fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center",
              justifyContent: "center" }}>{a.zeichen}</span>{a.label}</span>))}
        <span style={{ fontSize: 13, color: C.dimmer, marginLeft: "auto", ...NUM }}>
          {meine.length} Wünsche in diesem Monat</span>
      </div>

      {onClose && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <Btn kind="primary" onClick={onClose}>Fertig</Btn>
        </div>)}
  </>);

  if (onClose) return <Sheet open onClose={onClose} titel={titel} width={640}>{kern}</Sheet>;
  /* Was der Plan aus den Wünschen gemacht hat: Ein „möchte arbeiten" ist
     getroffen, wenn an dem Tag ein Dienst steht, ein „lieber nicht", wenn
     keiner steht. Gezählt wird nur, was im Plan steht — nichts geschätzt. */
  const bilanz = meine.slice().sort((a, b) => (a.datum < b.datum ? -1 : 1)).map((w) => {
    const t = personTag(m, p, w.datum);
    const da = t.dienstId ? map[t.dienstId] : null;
    const art = WUNSCH_ARTEN.find((a) => a.id === w.art);
    const getroffen = w.art === "moechte" ? !!da : !da;
    return { w, da, art, getroffen };
  });
  const treffer = bilanz.filter((x) => x.getroffen).length;
  return (
    <div>
      <H1 sub="Wünsche sind keine Anträge — die Planung berücksichtigt sie, soweit die Besetzung es zulässt.">{titel}</H1>
      <Leitraster seiteBreite={360}
        haupt={<Card style={{ padding: 22 }}>{kern}</Card>}
        seite={bilanz.length > 0 ? (
          <Seitenkarte titel="Wünsche und Plan" rechts={<span style={{ fontSize: 12.5, color: C.dim }}>{MON[mo - 1]} {y}</span>}
            sub={`${treffer} von ${bilanz.length} Wünschen trifft der Plan`}>
            <Fortschritt wert={(treffer / bilanz.length) * 100} hoehe={7} label="Anteil der getroffenen Wünsche" />
            <div style={{ marginTop: 10 }}>
              {bilanz.map(({ w, da, art, getroffen }) => (
                <div key={w.datum} className="listenzeile" style={{ padding: "9px 0", gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                    background: `${art.farbe}1C`, color: lesbar(art.farbe) }}>{art.zeichen}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 550 }}>{fKurz(w.datum)}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>{art.label} · im Plan {da ? da.name : "frei"}</div>
                  </div>
                  <Pill size="sm" tone={getroffen ? "ok" : "warn"}>{getroffen ? "erfüllt" : "nicht erfüllt"}</Pill>
                </div>))}
            </div>
          </Seitenkarte>) : null} />
    </div>);
}
