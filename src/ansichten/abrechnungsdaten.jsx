/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { imDienst, einheitAm } from "../../server/lib/fachpruefung.mjs";
import { kontoSichtbar, zuschlagWert, ausgleichBedarf, istStunden, darfEinheit } from "../lib/fachlogik.js";
import { pruefHinweis, ZUR_PRUEFUNG_TEXT } from "../istdaten.js";
import { H1, Seg, Btn, Card, CardHead, Lab, Avatar, Inp, Sel, Leer, Pill } from "../ui/bausteine.jsx";
import { MON, heute } from "../lib/datum.js";
import { Hinweisband, Kennzahlen, Leitraster } from "../gestalt/ansichten.jsx";
import { n1, n1Ist, sgn } from "../lib/format.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { darf } from "../lib/berechtigung.js";
import { Icon } from "../gestalt/icons.jsx";
import { vormonateMitPruefung } from "../istdaten.js";
import { UNGEPLANT_PRUEFUNG_TEXT } from "../istdaten.js";
import { Lohnausgabe } from "./lohnausgabe.jsx";
import { StempelBefunde } from "./korrekturen.jsx";

export function Abrechnungsdaten({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const [reiter, setReiter] = useState("zuschlaege");
  /* Nur Personen, deren Kontodaten die Sicht enthält (kontoSichtbar) — für
     andere Bereiche fehlt der Schichtverantwortung die Erfassung seit 1e.2. */
  const zeilen = useMemo(() => m.personen.filter((p) => imDienst(p, `${ym}-28`) && kontoSichtbar(sitz, p))
    .map((p) => ({ p, z: zuschlagWert(m, p, ym), a: ausgleichBedarf(m, p, ym), ist: istStunden(m, p, ym) })), [m, ym, sitz]);
  const summe = (f) => zeilen.reduce((a, z) => a + z.z.std[f], 0);
  const faellig = zeilen.filter((z) => z.a.faellig);
  const pruefOffen = useMemo(() => pruefHinweis(m, ym), [m, ym]);
  const pruefVor = useMemo(() => vormonateMitPruefung(m, ym), [m, ym]);

  return (
    <div>
      <H1 sub="Was die Lohnstelle braucht — und was das Stundenkonto verlangt. Entgelte bleiben bewusst außerhalb: Löhne gehören in die Lohnabrechnung, nicht in die Dienstplanung."
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <Seg value={reiter} onChange={setReiter} options={[{ id: "zuschlaege", label: "Zuschläge" },
            { id: "ausgleich", label: "Freizeitausgleich" }, { id: "lohn", label: "Lohnausgabe" },
            { id: "stempel", label: "Stempelbefunde" }]} />
          <Btn onClick={() => akt.exportZuschlaege(ym)}>Export</Btn></div>}>
        Abrechnungsdaten · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>

      {!pruefOffen && pruefVor.length > 0 && reiter !== "stempel" && (
        <Hinweisband ton="warn" titel="Vormonate mit offenen Prüffällen" style={{ marginBottom: 18 }}
          aktion={<Btn size="sm" onClick={() => setReiter("stempel")}>Zur Prüfliste</Btn>}>
          {pruefVor.map((v) => `${v.monat} (${v.anzahl})`).join(", ")}. Dort zählt im Stundenkonto vorläufig die Planzeit.
        </Hinweisband>)}
      {pruefOffen && reiter !== "stempel" && (
        <Hinweisband ton="warn" titel={`${pruefOffen.anzahl} Ist-Zeit${pruefOffen.anzahl === 1 ? "" : "en"} zur Prüfung · ${pruefOffen.monat}`}
          style={{ marginBottom: 18 }}
          aktion={<Btn size="sm" onClick={() => setReiter("stempel")}>Zur Prüfliste</Btn>}>
          {pruefOffen.text} Betroffene Tage sind in der Lohnausgabe gekennzeichnet („{ZUR_PRUEFUNG_TEXT}" bzw. „{UNGEPLANT_PRUEFUNG_TEXT}").
          Der Export (Zuschläge) und die Lohnausgabe fragen vor dem Download nach.
        </Hinweisband>)}

      {reiter === "zuschlaege" && (<>
        <Kennzahlen min={170} kacheln={[
          { label: "Nachtstunden", wert: n1(summe("nacht")), einheit: "h", ton: "accent", sub: "23 bis 6 Uhr" },
          { label: "Sonntagsstunden", wert: n1(summe("sonntag")), einheit: "h", ton: "violet" },
          { label: "Feiertagsstunden", wert: n1(summe("feiertag")), einheit: "h", ton: "warn" },
          { label: "Samstagsstunden", wert: n1(summe("samstag")), einheit: "h" }]} />

        <Leitraster seiteBreite={480}
          haupt={<>
        <Card style={{ overflowX: "auto" }}>
          <CardHead right={<Lab>Zuschlagswert in Stunden</Lab>}>Je Person</CardHead>
          <table className="raster" style={{ minWidth: 760 }}>
            <thead><tr>{["Person", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag", "Zuschlagswert"].map((h, i) => (
              <th key={i} style={{ textAlign: i ? "right" : "left" }}>{h}</th>))}</tr></thead>
            <tbody>{zeilen.map(({ p, z }) => (
              <tr key={p.id}>
                <td style={{ fontSize: 13.5 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <Avatar person={p} size="sm" style={{ width: 26, height: 26, fontSize: 10 }} />
                    {p.nachname}, {p.vorname}</span></td>
                {["gesamt", "nacht", "sonntag", "feiertag", "samstag"].map((f) => (
                  <td key={f} style={{ textAlign: "right", fontSize: 13,
                    color: z.std[f] ? C.text : C.dim, ...NUM }}>{n1Ist(z.std[f])}</td>))}
                <td style={{ textAlign: "right", fontSize: 14, fontWeight: 600, ...NUM }}>{n1Ist(z.summe)} h</td>
              </tr>))}</tbody>
          </table>
        </Card>
          </>}
          seite={<>
        <Card>
          <CardHead right={darf(sitz, "org.edit") && <Btn size="sm" onClick={akt.neueZuschlagsregel}>Regel hinzufügen</Btn>}>
            Zuschlagsregeln</CardHead>
          <div style={{ padding: 22 }}>
            {(m.zuschlaege || []).map((z) => (
              <div key={z.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 11, flexWrap: "wrap" }}>
                {/* Vier Felder nebeneinander, ohne eine einzige Beschriftung:
                    Für das Auge trägt die Zeile ihren Namen im ersten Feld,
                    einer Vorlesesoftware sagt sie nur „Kontrollkästchen,
                    Eingabefeld, Auswahlfeld, Zahlenfeld". Jedes Feld nennt
                    deshalb die Regel, zu der es gehört. */}
                <input type="checkbox" checked={z.aktiv} disabled={!darf(sitz, "org.edit")}
                  aria-label={`Zuschlag ${z.name} berücksichtigen`}
                  onChange={(e) => akt.setzeZuschlag(z.id, "aktiv", e.target.checked)} />
                <Inp value={z.name} disabled={!darf(sitz, "org.edit")} style={{ flex: 1, minWidth: 160 }}
                  aria-label={`Bezeichnung des Zuschlags (${z.name})`}
                  onChange={(e) => akt.setzeZuschlag(z.id, "name", e.target.value)} />
                <Sel value={z.art} disabled={!darf(sitz, "org.edit")} style={{ width: 150 }}
                  aria-label={`Anlass des Zuschlags ${z.name}`}
                  onChange={(e) => akt.setzeZuschlag(z.id, "art", e.target.value)}>
                  {[["nacht", "Nachtarbeit"], ["sonntag", "Sonntag"], ["feiertag", "Feiertag"], ["samstag", "Samstag"]]
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
                <Inp type="number" value={z.prozent} disabled={!darf(sitz, "org.edit")} style={{ width: 96 }}
                  aria-label={`Zuschlag ${z.name} in Prozent`}
                  onChange={(e) => akt.setzeZuschlag(z.id, "prozent", Number(e.target.value))} />
                <span style={{ fontSize: 13, color: C.dimmer }}>%</span>
                {darf(sitz, "org.edit") && <Btn size="sm" kind="danger" onClick={() => akt.loescheZuschlag(z.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}
              </div>))}
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
              Der Zuschlagswert wird in Stunden ausgegeben: geleistete Stunden mal Prozentsatz. Die Umrechnung
              in Entgelt erfolgt in der Lohnabrechnung mit dem dort hinterlegten Stundensatz.
            </div>
          </div>
        </Card>
          </>} />
      </>)}

      {reiter === "lohn" && <Lohnausgabe sitz={sitz} ym={ym} akt={akt} />}
      {reiter === "stempel" && <StempelBefunde sitz={sitz} ym={ym} akt={akt} />}
      {reiter === "ausgleich" && (<>
        <Kennzahlen min={190} kacheln={[
          { label: "Über der Ausgleichsgrenze", wert: faellig.length, ton: faellig.length ? "warn" : "ok",
            hervor: faellig.length ? "warn" : undefined, sub: `Grenze ${n1(m.einstellungen.ausgleichGrenze || 40)} h` },
          { label: "Summe Überhang", wert: n1(faellig.reduce((a, z) => a + z.a.ueber, 0)), einheit: "h" },
          { label: "Entspricht Freischichten", wert: faellig.reduce((a, z) => a + Math.ceil(z.a.ueber / (z.a.mittel || 8)), 0) }]} />
        <Card>
          <CardHead>Konten mit Ausgleichsbedarf</CardHead>
          {faellig.length === 0
            ? <Leer titel="Alle Konten im Rahmen" text="Kein Stundenkonto liegt über der eingestellten Ausgleichsgrenze." />
            : faellig.map(({ p, a }) => (
              <div key={p.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13.5 }}>{p.nachname}, {p.vorname}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                    {sgn(a.kto)} h · {a.ueber > 0 ? `${n1(a.ueber)} h über der Grenze` : "im Rahmen"}</div>
                </div>
                <Pill tone={a.kto > (a.grenze * 1.5) ? "danger" : "warn"}>{Math.ceil(a.ueber / (a.mittel || 8))} Freischichten</Pill>
                {darfEinheit(sitz, einheitAm(p, heute())) &&
                  <Btn size="sm" kind="primary" onClick={() => akt.oeffneAusgleich(p.id)}>Freischicht planen</Btn>}
              </div>))}
        </Card>
      </>)}
    </div>);
}
