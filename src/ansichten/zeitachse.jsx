/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { heute, fLang, fDatum, fKurz, DOW } from "../lib/datum.js";
import { addDays, montag, pad, toMin, dow } from "../regelwerk.js";
import { tagesband, aktive, personTag, abwArt } from "../lib/fachlogik.js";

import { klickbar, H1, Seg, Card, Lab, Leer, Avatar, Filterleiste, Schalter, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { lesbar, NUM } from "../ui/thema.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { Zeitwahl } from "../gestalt/ansichten.jsx";
import { feiertag } from "../../server/lib/feiertage.mjs";



/* =========================== TAGES- UND WOCHENBAND ====================== */
export function Zeitachse({ sitz, oeffneTag, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [modus, setModus] = useState("woche");
  const [suche, setSuche] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);
  const woche = Array.from({ length: 7 }, (_, i) => addDays(montag(datum), i));
  const VON = 0, BIS = 24;                      // dargestellter Zeitraum
  const STD = Array.from({ length: BIS - VON + 1 }, (_, i) => VON + i);
  const ZH = 30;                                // Höhe einer Stunde in Pixeln

  const spuren = useMemo(() => {
    const roh = modus === "tag" ? [{ d: datum, b: tagesband(m, datum) }]
      : woche.map((d) => ({ d, b: tagesband(m, d) }));
    const s2 = suche.trim().toLowerCase();
    if (!s2) return roh;
    return roh.map((x) => ({ ...x, b: x.b.filter((y) =>
      y.da.name.toLowerCase().includes(s2) || y.da.kurz.toLowerCase().includes(s2)
      || y.personen.some((p) => `${p.vorname} ${p.nachname}`.toLowerCase().includes(s2))) }));
  }, [m, datum, modus, suche]);

  /** Ein Dienst als senkrechter Balken auf der Stundenachse. */
  const Balken = ({ s, spalten, index, tag }) => {
    const oben = ((s.von / 60) - VON) * ZH;
    const hoehe = Math.max(20, ((Math.min(s.bis, BIS * 60) - s.von) / 60) * ZH);
    const breite = 100 / Math.max(1, spalten);
    const namen = s.personen.slice(0, 3).map((p) => p.nachname).join(", ");
    return (
      <div {...klickbar(() => oeffneTag(tag),
        `${s.da.name} ${s.da.start}–${s.da.ende}, ${s.anzahl} von ${s.soll} besetzt${namen ? ` · ${namen}` : ""}`)}
        title={`${s.da.name} ${s.da.start}–${s.da.ende} · ${s.anzahl} von ${s.soll}${namen ? ` · ${namen}` : ""}`}
        style={{ position: "absolute", top: oben, height: hoehe,
          left: `calc(${index * breite}% + 2px)`, width: `calc(${breite}% - 4px)`,
          background: `${s.da.farbe}1C`, borderLeft: `3px solid ${s.da.farbe}`,
          borderRadius: 8, padding: "5px 7px", overflow: "hidden", cursor: "pointer",
          outline: s.status === "danger" ? `2px solid ${C.danger}` : s.status === "warn" ? `2px solid ${C.warn}` : "none" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: lesbar(s.da.farbe), lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.da.kurz}</div>
        {hoehe > 40 && (
          <div style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.25,
            color: s.status === "ok" ? C.dim : s.status === "warn" ? C.warn : C.danger, ...NUM }}>
            {s.anzahl}/{s.soll}</div>)}
        {hoehe > 62 && namen && (
          <div style={{ fontSize: 10, color: C.dimmer, marginTop: 2, lineHeight: 1.25,
            overflow: "hidden" }}>{namen}</div>)}
      </div>);
  };

  const spalten = modus === "tag" ? 1 : 7;
  const knapp = (b) => b.some((x) => x.status !== "ok");

  /* Waagerechte Belegung eines Tages: eine Zeile je Person, Balken über die
     Stundenachse. Zeigt Überschneidungen und Übergaben unmittelbar. */
  const zeilen = useMemo(() => {
    if (modus !== "personen") return [];
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    const s2 = suche.trim().toLowerCase();
    return aktive(m, datum)
      .filter((p) => p.imSchichtdienst !== false)
      .map((p) => {
        const t = personTag(m, p, datum);
        const da = t.dienstId && map[t.dienstId];
        const e = m.einheiten.find((x) => x.id === einheitAm(p, datum));
        return { p, da, e, abw: t.abwesenheit };
      })
      .filter((z) => z.da || z.abw)
      .filter((z) => !s2 || `${z.p.vorname} ${z.p.nachname} ${z.da ? z.da.name : ""}`
        .toLowerCase().includes(s2))
      .sort((a, b) => {
        if (!!a.da !== !!b.da) return a.da ? -1 : 1;
        if (a.da && b.da && a.da.start !== b.da.start) return a.da.start < b.da.start ? -1 : 1;
        return a.p.nachname < b.p.nachname ? -1 : 1;
      });
  }, [m, datum, modus, suche]);

  return (
    <div>
      <H1 rubrik="Belegung"
        sub="Wann gearbeitet wird, nicht nur ob. Die Stundenachse steht links — dadurch lassen sich die Tage untereinander vergleichen und Übergaben werden sichtbar."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={modus} onChange={setModus} options={[{ id: "tag", label: "Tag" },
            { id: "woche", label: "Woche" }, { id: "personen", label: "Personen" }]} />
          <Zeitwahl onZurueck={() => setDatum(addDays(datum, modus === "tag" ? -1 : -7))}
            onHeute={() => setDatum(heute())}
            onWeiter={() => setDatum(addDays(datum, modus === "tag" ? 1 : 7))} />
        </div>}>
        {modus === "tag" ? fLang(datum) : `Woche ab ${fDatum(montag(datum))}`}</H1>

      {modus === "personen" ? (
        <Card style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 940 }}>
            {/* Stundenleiste */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 2,
              background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 210, flexShrink: 0, padding: "10px 16px" }}>
                <Lab>{zeilen.length} Personen</Lab></div>
              <div style={{ flex: 1, display: "flex" }}>
                {Array.from({ length: 12 }, (_, i) => i * 2).map((h) => (
                  <div key={h} style={{ flex: 1, padding: "10px 0 10px 6px", fontSize: 11,
                    color: C.dim, borderLeft: `1px solid ${C.line}`, ...NUM }}>
                    {pad(h)}:00</div>))}
              </div>
            </div>
            {zeilen.length === 0
              ? <Leer titel="Niemand im Dienst" text="An diesem Tag ist keine Person eingeteilt." />
              : zeilen.map((z, i) => {
                const von = z.da ? toMin(z.da.start) : 0;
                let bis = z.da ? toMin(z.da.ende) : 0;
                if (z.da && bis <= von) bis += 1440;
                const links = (von / 1440) * 100;
                const breite = z.da ? Math.min(100 - links, ((bis - von) / 1440) * 100) : 0;
                const ueber = z.da && bis > 1440;      // läuft über Mitternacht
                return (
                  <div key={z.p.id} className="zeile-hover"
                    style={{ display: "flex", alignItems: "center", minHeight: "var(--zeile)",
                      borderBottom: i < zeilen.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ width: 210, flexShrink: 0, padding: "0 16px", minWidth: 0,
                      display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar person={z.p} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 550, whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis" }}>
                          {z.p.nachname}, {z.p.vorname.slice(0, 1)}.</div>
                        <div style={{ fontSize: 11.5, color: C.dim }}>{z.e ? z.e.name : ""}</div>
                      </div>
                    </div>
                    <div style={{ flex: 1, position: "relative", height: "var(--zeile)" }}>
                      {/* Stundenraster */}
                      {Array.from({ length: 12 }, (_, k) => (
                        <div key={k} style={{ position: "absolute", left: `${(k / 12) * 100}%`,
                          top: 0, bottom: 0, width: 1, background: C.lineSoft }} />))}
                      {z.da ? (
                        <div {...klickbar(() => oeffneTag(datum),
                          `${fKurz(datum)}: ${z.da.name} ${z.da.start}–${z.da.ende}`)}
                          title={`${z.da.name} ${z.da.start}–${z.da.ende}`}
                          style={{ position: "absolute", left: `${links}%`, width: `${breite}%`,
                            top: 6, bottom: 6, borderRadius: 9, cursor: "pointer",
                            background: `${z.da.farbe}14`, borderLeft: `3px solid ${z.da.farbe}`,
                            display: "flex", alignItems: "center", padding: "0 10px", overflow: "hidden" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 650, color: lesbar(z.da.farbe),
                            whiteSpace: "nowrap" }}>{z.da.kurz}</span>
                          <span style={{ fontSize: 11, color: C.dim, marginLeft: 8,
                            whiteSpace: "nowrap", ...NUM }}>{z.da.start}–{z.da.ende}</span>
                        </div>
                      ) : (
                        <div style={{ position: "absolute", left: 0, right: 0, top: 12, bottom: 12,
                          borderRadius: 6, background: `${abwArt(z.abw.art).farbe}12`,
                          display: "flex", alignItems: "center", padding: "0 10px" }}>
                          <span style={{ fontSize: 11.5, color: abwArt(z.abw.art).farbe }}>
                            {abwArt(z.abw.art).label}</span>
                        </div>)}
                      {ueber && (
                        <div style={{ position: "absolute", left: 0, width: `${((bis - 1440) / 1440) * 100}%`,
                          top: 7, bottom: 7, borderRadius: 7, background: `${z.da.farbe}18`,
                          borderLeft: `3px solid ${z.da.farbe}`, opacity: .65 }} />)}
                    </div>
                  </div>);
              })}
          </div>
        </Card>
      ) : null}

      {modus !== "personen" && <Filterleiste suche={suche} setSuche={setSuche} platzhalter="Dienstart oder Person …"
        rechts={<>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <Schalter an={nurKnapp} onChange={() => setNurKnapp(!nurKnapp)} />
            <span style={{ fontSize: 13, color: C.dim }}>nur knappe Tage</span>
          </label>
          <Btn size="sm" kind="quiet" onClick={() => { setSuche(""); setNurKnapp(false); }}>Zurücksetzen</Btn>
        </>} />}

      {modus !== "personen" && (
      <Card style={{ padding: "20px 20px 14px", overflowX: "auto" }}>
        <div style={{ minWidth: modus === "woche" ? 820 : 340 }}>
          {/* Kopfzeile mit den Tagen */}
          <div style={{ display: "flex", marginBottom: 10 }}>
            <div style={{ width: 58, flexShrink: 0 }} />
            {(modus === "tag" ? [datum] : woche).map((d) => {
              const fei = feiertag(d, m.bundesland);
              const eintrag = spuren.find((x) => x.d === d);
              const eng = eintrag && knapp(eintrag.b);
              const aus = nurKnapp && !eng;
              return (
                <div key={d} {...klickbar(() => oeffneTag(d), `${fKurz(d)} öffnen`)}
                  style={{ flex: 1, textAlign: "center",
                  cursor: "pointer", opacity: aus ? .3 : 1, padding: "0 3px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: dow(d) >= 5 ? C.dim : C.text }}>
                    {DOW[dow(d)]}</div>
                  <div style={{ fontSize: 15, fontWeight: d === heute() ? 700 : 400, ...NUM,
                    color: d === heute() ? C.accent : fei ? C.danger : C.text, marginTop: 2 }}>
                    {Number(d.slice(8))}</div>
                  {fei && <div style={{ fontSize: 10, color: C.danger }}>Feiertag</div>}
                  {eng && <div style={{ fontSize: 10, color: C.warn }}>knapp</div>}
                </div>);
            })}
          </div>

          {/* Stundenachse links, Tagesspalten rechts */}
          <div style={{ display: "flex", position: "relative" }}>
            <div style={{ width: 58, flexShrink: 0, position: "relative", height: (BIS - VON) * ZH }}>
              {STD.map((h) => (
                <div key={h} style={{ position: "absolute", top: (h - VON) * ZH - 7, right: 11,
                  fontSize: 11, color: h % 6 === 0 ? C.dim : C.dimmer, fontWeight: h % 6 === 0 ? 600 : 400, ...NUM }}>
                  {h < 24 ? `${pad(h)}:00` : ""}</div>))}
            </div>
            <div style={{ flex: 1, display: "flex", gap: 5, position: "relative", height: (BIS - VON) * ZH }}>
              {/* Waagerechte Stundenlinien über die ganze Breite */}
              {STD.map((h) => (
                <div key={h} style={{ position: "absolute", left: 0, right: 0, top: (h - VON) * ZH,
                  height: 1, background: h % 6 === 0 ? C.lineStark : C.bg,
                  pointerEvents: "none" }} />))}
              {(modus === "tag" ? [datum] : woche).map((d) => {
                const eintrag = spuren.find((x) => x.d === d) || { b: [] };
                const eng = knapp(eintrag.b);
                const aus = nurKnapp && !eng;
                // Überlappende Dienste nebeneinander legen
                const sortiert = [...eintrag.b].sort((a, b) => a.von - b.von);
                const lagen = [];
                for (const sp of sortiert) {
                  let l = 0;
                  while (lagen[l] && lagen[l].some((o) => sp.von < o.bis && o.von < sp.bis)) l++;
                  (lagen[l] = lagen[l] || []).push(sp);
                }
                const anzahlLagen = Math.max(1, lagen.length);
                return (
                  <div key={d} style={{ flex: 1, position: "relative", opacity: aus ? .22 : 1,
                    background: d === heute() ? C.flaecheStill : "transparent", borderRadius: 8 }}>
                    {lagen.map((lage, li) => lage.map((sp) => (
                      <Balken key={`${d}${sp.da.id}`} s={sp} spalten={anzahlLagen} index={li} tag={d} />)))}
                  </div>);
              })}
            </div>
          </div>
        </div>
      </Card>)}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 18 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 14, height: 14, borderRadius: 5, background: `${d.farbe}2A`,
              borderLeft: `3px solid ${d.farbe}` }} />
            <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{d.name} · {d.start}–{d.ende}</span>
          </div>))}
        <span style={{ fontSize: 12.5, color: C.dimmer, marginLeft: "auto" }}>
          Dienste über Mitternacht enden an der unteren Kante und beginnen am Folgetag oben.
        </span>
      </div>
    </div>);
}
