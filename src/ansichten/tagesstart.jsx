/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { heute, fLang } from "../lib/datum.js";
import { stempelVorgang } from "../stempelvorgang.js";
import { useMemo } from "react";
import { tagesaufgaben, einrichtungsstand } from "../lib/fachlogik.js";
import { Rubrik, Card, klickbar, Btn, CardHead, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { darf } from "../lib/berechtigung.js";
import { NUM } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { DienstKarte } from "../ansichten/dienstkarte.jsx";
import { personTag } from "../lib/fachlogik.js";
import { KorrekturKarte } from "./korrekturen.jsx";
import { AufgabeSymbol } from "./stempeluhr.jsx";

export function Tagesstart({ sitz, akt, gehZu, oeffneTag }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const vorgang = p.imSchichtdienst !== false ? stempelVorgang(m, p, d0) : null;
  const aufgaben = useMemo(() => tagesaufgaben(sitz), [m, p.id]);
  const dringend = aufgaben.filter((a) => a.dringend);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meinDienst = p.imSchichtdienst !== false ? personTag(m, p, d0) : null;
  const meineDa = meinDienst && meinDienst.dienstId ? map[meinDienst.dienstId] : null;
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  /* Ohne Vornamen wurde daraus „Guten Morgen, ." — bei einem frisch
     angelegten Betrieb ist der Name noch leer. Dann grüßt es ohne Anrede. */
  const anrede = (p.vorname || "").trim();

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 style={{ fontSize: 38, fontWeight: 300, letterSpacing: "-.04em", margin: "10px 0 0", lineHeight: 1.08 }}>
          {anrede ? <>{gruss}, <b style={{ fontWeight: 700 }}>{anrede}</b>.</> : <>{gruss}.</>}
        </h1>
        <p style={{ fontSize: 16.5, color: C.dim, margin: "12px 0 0", maxWidth: 640, lineHeight: 1.5 }}>
          {aufgaben.length === 0
            ? "Nichts liegt an. Alle Anträge sind entschieden, alle Nachweise gültig, die Besetzung trägt."
            : dringend.length
              ? `${dringend.length} ${dringend.length === 1 ? "Sache braucht" : "Sachen brauchen"} deine Aufmerksamkeit${aufgaben.length > dringend.length ? `, ${aufgaben.length - dringend.length} weitere warten` : ""}.`
              : `${aufgaben.length} ${aufgaben.length === 1 ? "Vorgang wartet" : "Vorgänge warten"} auf dich.`}
        </p>
      </div>

      {(() => {
        const es = einrichtungsstand(m);
        if (es.fertig || !darf(sitz, "org.edit")) return null;
        return (
          <Card style={{ padding: 26, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <Rubrik>Einrichtung</Rubrik>
                <div style={{ fontSize: 21, fontWeight: 300, letterSpacing: "-.03em", marginTop: 8 }}>
                  Noch <b style={{ fontWeight: 700 }}>{es.offen.length} Schritt{es.offen.length === 1 ? "" : "e"}</b> bis zum laufenden Betrieb
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 650, ...NUM }}>{es.anteil} %</div>
                <div style={{ fontSize: 11.5, color: C.dimmer }}>fertig</div>
              </div>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: "hidden",
              marginBottom: 18 }}>
              <div style={{ width: `${es.anteil}%`, height: "100%", background: C.ok, transition: "width .4s" }} />
            </div>
            {es.schritte.map((x) => (
              <div key={x.id} {...klickbar(x.erledigt ? null : () => gehZu(x.ziel))}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                  cursor: x.erledigt ? "default" : "pointer", opacity: x.erledigt ? .5 : 1,
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                  background: x.erledigt ? C.okLight : C.lineSoft,
                  color: x.erledigt ? C.ok : C.dimmer }}>{x.erledigt ? <Icon n="haken" size={14} strokeWidth={2.4} /> : "·"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: x.erledigt ? 400 : 600,
                    textDecoration: x.erledigt ? "line-through" : "none" }}>{x.titel}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 2 }}>{x.text}</div>
                </div>
                {!x.erledigt && <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={19} /></span>}
              </div>))}
          </Card>);
      })()}

      <DienstKarte sitz={sitz} akt={akt} vorgang={vorgang} meineDa={meineDa} style={{ marginBottom: 20 }} />
      <KorrekturKarte sitz={sitz} akt={akt} />

      {aufgaben.length === 0
        ? <Card style={{ padding: 44, textAlign: "center" }}>
            <div style={{ marginBottom: 12, color: C.ok, display: "flex", justifyContent: "center" }}><Icon n="kreis-haken" size={40} /></div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 7 }}>Alles erledigt</div>
            <div style={{ fontSize: 14, color: C.dim, maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
              Nichts erfordert derzeit eine Entscheidung. Über die Navigation kommst du zu allen Ansichten.
            </div>
          </Card>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 14 }}>
            {aufgaben.map((a, i) => (
              <Card key={i} hover {...klickbar(() => gehZu(a.ziel))}
                style={{ padding: 20, cursor: "pointer", position: "relative", overflow: "hidden" }}>
                {a.dringend && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                  background: C.danger }} />}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 13, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700,
                    background: a.dringend ? C.dangerLight : C.bg,
                    color: a.dringend ? C.danger : C.dim }}><AufgabeSymbol art={a.art} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 620, letterSpacing: "-.01em" }}>{a.titel}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{a.text}</div>
                    {a.aktion && <div style={{ marginTop: 12 }}>
                      <span className="btn btn-sm btn-primary">{a.aktion}</span></div>}
                  </div>
                  <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={19} /></span>
                </div>
              </Card>))}
          </div>}

      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <Btn size="sm" kind="quiet" onClick={akt.briefingZeigen}>Briefing als Text</Btn>
        <Btn size="sm" kind="quiet" onClick={akt.briefingPush}>Als Benachrichtigung</Btn>
        <Btn size="sm" kind="quiet" onClick={akt.oeffneKommando}>Suchen · Strg + K</Btn>
      </div>

      {(m.aushang || []).filter((x) => !x.bis || x.bis >= d0).length > 0 && (
        <Card style={{ marginTop: 22 }}>
          <CardHead right={<Btn size="sm" kind="quiet" onClick={() => gehZu("aushang")}>Alle ansehen</Btn>}>
            Am Schwarzen Brett</CardHead>
          {(m.aushang || []).filter((x) => !x.bis || x.bis >= d0).slice(0, 3).map((x) => (
            <div key={x.id} style={{ padding: "14px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {x.wichtig && <Pill size="sm" tone="danger">wichtig</Pill>}
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{x.titel}</span>
                <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>{x.zeit}</span>
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>{x.text}</div>
            </div>))}
        </Card>)}
    </div>);
}
