/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Btn, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { n1, zahl } from "../lib/format.js";
import { Leitraster, Seitenkarte, Balkenzeile, Grosszahl } from "../gestalt/ansichten.jsx";
import { NOTRUF_ARTEN, offeneNotrufe } from "../lib/notrufe.js";


/* ==========================================================================
   NOTRUFE — Ansicht für Planung und Schichtverantwortung
   Was offen ist, steht oben und bleibt dort, bis jemand bestätigt.
   ========================================================================== */
export function Notrufe({ sitz, akt }) {
  const m = sitz.mandant;
  const offen = offeneNotrufe(m);
  const erledigt = (m.notrufe || []).filter((n) => n.bestaetigt)
    .sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, 30);

  const Zeile = ({ n, offen: istOffen }) => {
    const p = m.personen.find((x) => x.id === n.personId);
    const a = NOTRUF_ARTEN[n.art] || NOTRUF_ARTEN.hilfe;
    const alter = Math.round((Date.now() - new Date(n.zeit).getTime()) / 60000);
    return (
      <div style={{ padding: "18px var(--pad-x)", borderBottom: `1px solid ${C.lineSoft}`,
        background: istOffen && a.dringend ? C.dangerLight : "transparent" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0,
            background: istOffen ? (a.dringend ? C.danger : C.warn) : C.ok }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 640,
              color: istOffen && a.dringend ? C.danger : C.text }}>{a.label}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              {p ? `${p.vorname} ${p.nachname}` : "unbekannt"}
              {n.dienst ? ` · ${n.dienst}` : ""}{n.ort ? ` · ${n.ort}` : ""}</div>
            {n.notiz && <div style={{ fontSize: 13.5, color: C.dim, marginTop: 6,
              lineHeight: 1.5 }}>{n.notiz}</div>}
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, ...NUM }}>
              {new Date(n.zeit).toLocaleString("de-DE")}
              {istOffen ? ` · vor ${alter < 60 ? `${alter} Min` : `${Math.round(alter / 60)} Std`}` : ""}
              {n.bestaetigt ? ` · bestätigt von ${n.durch || "unbekannt"}` : ""}</div>
          </div>
          {istOffen && (
            <Btn size="sm" kind="primary" onClick={() => akt.notrufBestaetigen(n.id)}>
              Übernehme ich</Btn>)}
        </div>
      </div>);
  };

  return (
    <div>
      <H1 rubrik="Heute"
        sub="Notrufe aus Alleindiensten. Was offen ist, bleibt hier stehen, bis jemand bestätigt — auch nach einem Neuladen.">
        Notrufe</H1>

      {offen.length === 0 && erledigt.length === 0 ? (
        <Card><Leer titel="Keine Notrufe"
          text="Beschäftigte im Alleindienst können über die Telefonansicht Hilfe anfordern. Die Meldung geht zuerst an die Schichtverantwortung, dann an die Planung." /></Card>
      ) : (
        <Leitraster seiteBreite={340}
          haupt={<>
            {offen.length > 0 && (
              <Card style={{ borderColor: C.danger, borderWidth: 2 }}>
                <CardHead right={<Pill tone="danger">{zahl(offen.length)} offen</Pill>}>
                  Nicht bestätigt</CardHead>
                {offen.map((n) => <Zeile key={n.id} n={n} offen />)}
              </Card>)}

            {erledigt.length > 0 && (
              <Card>
                <CardHead right={<Lab>letzte {zahl(erledigt.length)}</Lab>}>Bestätigt</CardHead>
                {erledigt.map((n) => <Zeile key={n.id} n={n} offen={false} />)}
              </Card>)}
          </>}
          seite={(() => {
            /* Der Rückblick zählt, was im Bestand steht — sieben Tage,
               nach Art. Die Quittierzeit ist der Abstand zwischen Meldung
               und Bestätigung, wo beides vorliegt. */
            const grenze = Date.now() - 7 * 86400000;
            const woche = (m.notrufe || []).filter((n) => new Date(n.zeit).getTime() >= grenze);
            if (!woche.length) return null;
            const nachArt = Object.entries(NOTRUF_ARTEN).map(([id, a]) => ({ id, a,
              n: woche.filter((n) => (NOTRUF_ARTEN[n.art] ? n.art : "hilfe") === id).length })).filter((x) => x.n > 0);
            const hoechst = Math.max(...nachArt.map((x) => x.n));
            const zeiten = woche.filter((n) => n.bestaetigt).map((n) =>
              (new Date(n.bestaetigt).getTime() - new Date(n.zeit).getTime()) / 1000).filter((x) => x >= 0);
            const mittel = zeiten.length ? zeiten.reduce((x, y) => x + y, 0) / zeiten.length : null;
            const text = (sek) => sek < 90 ? `${Math.round(sek)} s` : sek < 5400 ? `${Math.round(sek / 60)} min`
              : `${n1(sek / 3600)} h`;
            return (<>
              <Seitenkarte titel="Sieben Tage im Rückblick" sub={`${zahl(woche.length)} ${woche.length === 1 ? "Meldung" : "Meldungen"}`}>
                {nachArt.map((x) => (
                  <Balkenzeile key={x.id} label={x.a.label} wert={x.n} anteil={(x.n / hoechst) * 100}
                    ton={x.a.dringend ? "danger" : "warn"} punkt />))}
              </Seitenkarte>
              {mittel !== null && (
                <Seitenkarte titel="Mittlere Quittierzeit" sub={`aus ${zahl(zeiten.length)} bestätigten Meldungen`}>
                  <Grosszahl wert={text(mittel)} />
                </Seitenkarte>)}
            </>);
          })()} />
      )}
    </div>);
}
