/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { dim_, pISO, pad, dow } from "../regelwerk.js";
import { heute, MON, DOW_LANG } from "../lib/datum.js";
import { useState, useEffect } from "react";
import { Btn, Card, klickbar, Pill } from "../ui/bausteine.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { Zelle } from "../ui/leisten.jsx";

/* --------------------------------------------------------------------------
   WOCHENLISTE — der Monatsplan auf dem Telefon

   Das Raster hat eine Mindestbreite von 1040 Pixeln. Auf 390 Pixeln bleibt
   davon ein Ausschnitt von drei Tagen, und mit einunddreißig Spalten lässt
   sich daran nichts retten — es braucht eine andere Form, keine kleinere.

   Deshalb eine Liste: sieben Tage untereinander, je Tag die Dienste mit
   ihrem Besetzungsstand. Dieselben Zahlen wie im Raster, dieselbe Prüfung,
   nur senkrecht statt waagerecht. Antippen öffnet den Tag.
   -------------------------------------------------------------------------- */
export function Wochenliste({ sitz, ym, oeffneTag, bes, lage }) {
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const d0 = heute();
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));

  /* Die Woche, die den heutigen Tag enthält — sonst die erste des Monats. */
  const startTag = d0.slice(0, 7) === ym ? Math.max(1, pISO(d0).getDate() - 3) : 1;
  const [ab, setAb] = useState(startTag);
  useEffect(() => { setAb(d0.slice(0, 7) === ym ? Math.max(1, pISO(d0).getDate() - 3) : 1); }, [ym]);

  const tage = [];
  for (let i = ab; i < ab + 7 && i <= n; i++) tage.push(`${ym}-${pad(i)}`);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, marginBottom: 12 }}>
        <Btn size="sm" onClick={() => setAb(Math.max(1, ab - 7))} disabled={ab <= 1}><Icon n="chevron-links" size={14} /> davor</Btn>
        <span style={{ fontSize: 13, color: C.dim, ...NUM }}>
          {pISO(tage[0]).getDate()}. – {pISO(tage[tage.length - 1]).getDate()}. {MON[mo - 1]}</span>
        <Btn size="sm" onClick={() => setAb(Math.min(n - 6 > 0 ? n - 6 : 1, ab + 7))}
          disabled={ab + 7 > n}>danach <Icon n="chevron-rechts" size={14} /></Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tage.map((d) => {
          const fei = feiertag(d, m.bundesland);
          const we = dow(d) >= 5;
          const t = lage.tage.find((x) => x.datum === d);
          const istHeute = d === d0;
          return (
            <Card key={d} {...klickbar(() => oeffneTag(d),
              `${pISO(d).getDate()}. ${DOW_LANG[dow(d)]}${istHeute ? ", heute" : ""}${t ? `, ${t.text}` : ""}`)}
              style={{ padding: 0, overflow: "hidden", cursor: "pointer",
                borderLeft: `3px solid ${t ? (t.stufe === 2 ? C.danger : C.warn) : istHeute ? C.accent : "transparent"}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "11px 14px 8px",
                background: istHeute ? C.accentLight : (fei || we) ? C.flaecheStill : "transparent" }}>
                <span style={{ fontSize: 19, fontWeight: 700, ...NUM,
                  color: istHeute ? C.accent : C.text }}>{pISO(d).getDate()}.</span>
                <span style={{ fontSize: 13.5, color: C.dim }}>{DOW_LANG[dow(d)]}</span>
                {fei && <Pill size="sm" tone="warn">{fei}</Pill>}
                {istHeute && <Pill size="sm" tone="accent">heute</Pill>}
                <span style={{ flex: 1 }} />
                {t && <span style={{ fontSize: 12, fontWeight: 700,
                  color: t.stufe === 2 ? C.danger : C.warn }}>{t.text}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {m.dienstarten.map((da) => {
                  const b = (bes[d] || {})[da.id];
                  if (!b) return null;
                  const anteil = Math.min(100, Math.round((b.anzahl / Math.max(1, b.soll)) * 100));
                  const col = b.status === "ok" ? C.dim : b.status === "warn" ? C.warn : C.danger;
                  return (
                    <div key={da.id} style={{ display: "flex", alignItems: "center", gap: 11,
                      padding: "9px 14px", borderTop: `1px solid ${C.lineSoft}`, minHeight: 44 }}>
                      <Zelle da={da} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5 }}>{da.name}</div>
                        <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{da.start}–{da.ende}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 62 }}>
                        <div style={{ fontSize: 14, ...NUM }}>
                          <span style={{ color: col, fontWeight: b.status === "ok" ? 500 : 700 }}>{b.anzahl}</span>
                          <span style={{ color: C.dimmer, fontSize: 11.5 }}>/{b.soll}</span></div>
                        <div style={{ width: 58, height: 3, borderRadius: 2, background: C.lineSoft,
                          overflow: "hidden", marginLeft: "auto", marginTop: 3 }}>
                          <div style={{ width: `${anteil}%`, height: "100%",
                            background: b.status === "ok" ? C.ok : b.status === "warn" ? C.warn : C.danger }} /></div>
                      </div>
                      {b.qualFehlt && <span title="Fachkraftquote nicht erfüllt"
                        style={{ width: 7, height: 7, borderRadius: 4, background: C.danger, flexShrink: 0 }} />}
                    </div>);
                })}
              </div>
            </Card>);
        })}
      </div>
    </div>);
}
