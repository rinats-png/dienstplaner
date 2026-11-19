/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { pad, dim_ } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Inp, Sel, Field, Seg, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { MON, fKurz } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Sparkline, Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Kennzahlen, Leitraster, Seitenkarte, Legende } from "../gestalt/ansichten.jsx";
import { BEREICHE as PPUGV_BEREICHE, bereichVon as ppugvBereich, monatslage as ppugvMonatslage } from "../ppugv.js";
import { darf } from "../lib/berechtigung.js";
import { ppugvZeilen } from "../lib/planhilfen.js";
import { Therapieminuten } from "./therapieminuten.jsx";


export function Untergrenzen({ sitz, akt, ym }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "plan.edit.unit");
  const einheiten = (m.einheiten || []).filter((e) => !e.pool);
  const [einheitId, setEinheitId] = useState((einheiten[0] || {}).id || "");
  const einheit = einheiten.find((e) => e.id === einheitId) || null;
  /* Zwei Vorgaben, eine Ansicht: die PpUGV rechnet je Schicht, die PPP-RL je
     Woche. Welche gilt, hängt am Bereich der Einheit — beide anzubieten ist
     ehrlicher, als eine zu verstecken. */
  const [reiter, setReiter] = useState("ppugv");
  const tage = useMemo(() => {
    const [y, mo] = ym.split("-").map(Number);
    return Array.from({ length: dim_(y, mo - 1) }, (_, i) => `${ym}-${pad(i + 1)}`);
  }, [ym]);

  const zeilen = useMemo(() => ppugvZeilen(m, einheit, tage), [m, einheit, tage]);
  const lage = useMemo(() => ppugvMonatslage(zeilen), [zeilen]);
  const bereich = einheit && einheit.ppugvBereich ? ppugvBereich(einheit.ppugvBereich) : null;

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Die Pflegepersonaluntergrenzen gelten je Schicht, nicht im Monatsmittel. Geprüft wird gegen die Ist-Belegung — ohne sie steht „nicht bewertbar“, nie „eingehalten“.">
        Untergrenzen · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          <Field label={m.einheitLabel || "Einheit"}>
            <Sel value={einheitId} onChange={(e) => setEinheitId(e.target.value)}>
              {einheiten.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Sel></Field>
          <Field label="Pflegesensitiver Bereich"
            hint="Ohne Bereich gilt keine Untergrenze — und es lässt sich keine prüfen.">
            <Sel value={(einheit || {}).ppugvBereich || ""} disabled={!einheit || !darf(sitz, "org.edit")}
              onChange={(e) => akt.setzeEinheitBereich(einheit.id, e.target.value || null)}>
              <option value="">— kein pflegesensitiver Bereich —</option>
              {PPUGV_BEREICHE.map((b) => (
                <option key={b.id} value={b.id}>{b.name} · {b.paragraf}</option>))}</Sel></Field>
        </div>
      </Card>

      <div className="reiterreihe" style={{ margin: "0 0 16px" }}>
        <Seg value={reiter} onChange={setReiter}
          options={[{ id: "ppugv", label: "Pflegepersonaluntergrenzen" }, { id: "ppprl", label: "PPP-RL Psychiatrie" }]} />
      </div>

      {reiter === "ppprl" && (einheit
        ? <Therapieminuten sitz={sitz} akt={akt} einheit={einheit} />
        : <Card><Leer titel="Keine Einheit gewählt" text="Wähle oben eine Einheit." /></Card>)}

      {reiter === "ppugv" && (!bereich ? (
        <Card><Leer titel="Kein pflegesensitiver Bereich hinterlegt"
          text="Die PpUGV gilt für bestimmte Krankenhausbereiche — Intensivmedizin, Geriatrie, Kardiologie und weitere. Wähle oben den Bereich dieser Einheit, dann wird geprüft." /></Card>
      ) : (<>
        <Kennzahlen kacheln={[
          { label: "Eingehalten", wert: lage.gruen, ton: "ok", sub: `von ${zahl(lage.gesamt)} Schichten` },
          { label: "Unterschritten", wert: lage.rot, ton: lage.rot ? "danger" : "ok",
            hervor: lage.rot ? "danger" : undefined, sub: "meldepflichtig gegenüber den Kassen" },
          { label: "Nicht bewertbar", wert: lage.grau, ton: "neutral", sub: "Belegung fehlt" },
          { label: "Schlüssel", wert: `${(bereich.name || "").slice(0, 18)}`, sub: bereich.paragraf }]} />

        <Leitraster seiteBreite={340}
          haupt={
            <Card>
              <CardHead right={<Lab>Belegung eintragen, auch nachträglich</Lab>}>
                {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</CardHead>
              <div style={{ overflowX: "auto" }}>
                <table className="raster" style={{ minWidth: 640 }}>
                  <thead><tr>
                    {["Tag", "Schicht", "Patienten", "Fachkräfte", "Hilfskräfte", "Nötig", "Urteil"].map((h) => (
                      <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <tr key={`${z.datum}|${z.schicht}`}
                        style={z.urteil === "rot" ? { background: C.dangerLight } : undefined}>
                        <td style={{ whiteSpace: "nowrap", ...NUM }}>{fKurz(z.datum)}</td>
                        <td>{z.schicht === "nacht" ? "Nacht" : "Tag"}</td>
                        <td>
                          <Inp type="number" min="0" style={{ width: 82, padding: "6px 8px", minHeight: 34 }}
                            disabled={!darfPflegen}
                            value={(m.belegung || {})[`${einheit.id}|${z.datum}|${z.schicht}`]?.patienten ?? ""}
                            onChange={(e) => akt.setzeBelegung(einheit.id, z.datum, z.schicht, e.target.value)}
                            aria-label={`Patienten am ${z.datum}, ${z.schicht === "nacht" ? "Nacht" : "Tag"}`} />
                        </td>
                        <td style={NUM}>{z.fachkraefte ?? "—"}</td>
                        <td style={NUM}>
                          {z.hilfskraefte ?? "—"}
                          {z.hilfskraefteNichtAngerechnet > 0 && (
                            <span style={{ color: C.warn, fontSize: 11.5 }}>
                              {" "}(−{z.hilfskraefteNichtAngerechnet})</span>)}
                        </td>
                        <td style={NUM}>{z.noetig ?? "—"}</td>
                        <td>
                          {/* Nicht bewertbar ist ein eigener Zustand: grau, kein Verstoß und keine Einhaltung. */}
                          <span title={z.text} style={{ display: "inline-flex" }}>
                            <Pill size="sm" ton={z.urteil === "rot" ? "danger" : z.urteil === "grau" ? "neutral" : "ok"}>
                              {z.urteil === "rot" ? `unterschritten um ${z.fehlend}`
                                : z.urteil === "grau" ? "nicht bewertbar" : "eingehalten"}</Pill></span>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>}
          seite={<>
            <Seitenkarte titel="Schichten im Monat"
              sub={`${zahl(zeilen.length)} Schichten, Tag und Nacht`}>
              <Sparkline art="punkte" hoehe={60}
                daten={zeilen.map((z) => (z.urteil === "gruen" ? "ok" : z.urteil === "rot" ? "danger" : ""))}
                beschriftung={`${lage.gruen} Schichten eingehalten, ${lage.rot} unterschritten, ${lage.grau} nicht bewertbar`} />
              <Legende style={{ marginTop: 12 }} punkte={[
                { ton: "ok", label: "eingehalten" }, { ton: "danger", label: "unterschritten" },
                { ton: "neutral", label: "nicht bewertbar", farbig: false }]} />
            </Seitenkarte>
            <Erklaerkasten>
              <b style={{ color: C.text }}>Wonach gerechnet wird.</b>{" "}
              {bereich.paragraf}: höchstens {(zeilen[0] || {}).grenze?.patientenJeKraft ?? "—"} Patienten
              je Pflegekraft in der Tagschicht, in der Nacht entsprechend weniger.
              Pflegehilfskräfte zählen nur bis zu
              {" "}{Math.round(((zeilen[0] || {}).grenze?.hilfskraftAnteil ?? 0) * 100)} Prozent
              des Personals mit. Aufgerundet wird immer zur nächsten ganzen Kraft.
              <div style={{ marginTop: 10 }}>
                Die Fassung ist datiert hinterlegt: {(zeilen[0] || {}).grenze?.fassung || "—"}.
                Ändert sich die Verordnung, kommt ein neuer Satz dazu — der alte bleibt
                stehen, damit vergangene Monate nach dem Recht ihrer Zeit beurteilt werden.
              </div>
            </Erklaerkasten>
          </>} />
      </>))}
    </div>);
}
