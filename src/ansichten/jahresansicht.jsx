/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { aktive, istStunden, sollStunden, teilzeitProfil, personTag } from "../lib/fachlogik.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { H1, Seg, Card, klickbar, Pill } from "../ui/bausteine.jsx";
import { Zeitwahl, Legende } from "../gestalt/ansichten.jsx";
import { istVerfuegbar, zeitraumJahr, ISTDATEN_TEXT } from "../istdaten.js";
import { pad } from "../regelwerk.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { n1, sgn } from "../lib/format.js";
import { MON } from "../lib/datum.js";
import { urlaubskonto } from "../lib/fachlogik.js";
import { dim_ } from "../regelwerk.js";

/* =============================== JAHRESANSICHT ========================== */
export function Jahresansicht({ sitz, ym, oeffnePerson }) {
  const m = sitz.mandant;
  const [jahr, setJahr] = useState(Number(ym.slice(0, 4)));
  const [eid, setEid] = useState(sitz.person.bereich !== "ALLE" ? sitz.person.bereich : m.einheiten[0].id);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const leute = aktive(m, `${jahr}-06-15`).filter((p) => einheitAm(p, `${jahr}-06-15`) === eid);
  const monate = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div>
      <H1 sub="Zwölf Monate auf einen Blick — für Urlaubsgespräche, Belastungsvergleiche und die Jahresplanung."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={eid} onChange={setEid}
            options={m.einheiten.map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name }))} />
          <Zeitwahl mitte={String(jahr)} onZurueck={() => setJahr(jahr - 1)} onWeiter={() => setJahr(jahr + 1)} />
        </div>}>Jahresansicht</H1>

      <Card style={{ overflowX: "auto" }}>
        <div style={{ padding: 20, display: "grid", gap: "22px 40px",
          gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,540px),1fr))" }}>
          {leute.map((p) => {
            const ohneIst = !istVerfuegbar(m, p, zeitraumJahr(jahr));
            const jahresIst = ohneIst ? null : monate.reduce((a, i) => a + istStunden(m, p, `${jahr}-${pad(i + 1)}`).gesamt, 0);
            /* Ein Monat ohne verfügbares Soll (abgeschlossen, Eintrag nicht sichtbar — Nachtrag dritter Review N-e):
               keine Jahressumme statt einer zu kleinen. */
            const sollJe = monate.map((i) => sollStunden(m, p, `${jahr}-${pad(i + 1)}`));
            const jahresSoll = sollJe.some((x) => x === null || x === undefined) ? null : sollJe.reduce((a, x) => a + x, 0);
            const url = urlaubskonto(m, p, jahr);
            return (
              <div key={p.id} style={{ minWidth: 0 }}>
                <div {...klickbar(() => oeffnePerson(p.id), `${p.nachname}, ${p.vorname} öffnen`)}
                  style={{ display: "flex", alignItems: "baseline",
                  gap: 12, marginBottom: 7, cursor: "pointer", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.nachname}, {p.vorname}</span>
                  {p.teilzeit && p.teilzeit.aktiv && <Pill size="sm">Teilzeit {Math.round(teilzeitProfil(m, p).quote * 100)} %</Pill>}
                  {p.springer && <Pill size="sm" tone="violet">Springer</Pill>}
                  <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>
                    {ohneIst ? `Ist nicht verfügbar · Soll ${jahresSoll === null ? "nicht verfügbar" : `${n1(jahresSoll)} h`}`
                      : jahresSoll === null ? `${n1(jahresIst)} h · Soll nicht verfügbar` : `${n1(jahresIst)} von ${n1(jahresSoll)} h · ${sgn(jahresIst - jahresSoll)} h`}{url.anspruch === null ? "" : ` · Urlaub ${url.genommen}/${url.anspruch}`}</span>
                </div>
                {/* Zwölf Blöcke statt 365 Härchen.

                    Vorher wurde je Tag ein Balken von fünf Pixeln gezeichnet,
                    und der Unterschied zwischen Dienst und Abwesenheit lief
                    allein über die Deckkraft — der schwächste Kanal, den es
                    gibt, und bei dieser Breite praktisch unsichtbar.

                    Die Überschrift verspricht Belastungsvergleiche. Vergleichen
                    heißt: zwischen Personen. Dafür braucht es eine Größe je
                    Monat, die man quer lesen kann, kein Tagesdetail. Das
                    Tagesdetail steht weiterhin im Titel jedes Blocks. */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {monate.map((mo) => {
                    const ymm = `${jahr}-${pad(mo + 1)}`;
                    const ist = istStunden(m, p, ymm).gesamt;
                    const soll = sollStunden(m, p, ymm);
                    /* Ohne Ist-Daten kein Ausschlag — weder Mehrarbeit noch Unterdeckung. */
                    const quote = ist === null ? 1 : soll > 0 ? ist / soll : 0;
                    const tage = dim_(jahr, mo);
                    let abwTage = 0, urlaubTage = 0;
                    for (let i = 1; i <= tage; i++) {
                      const t = personTag(m, p, `${jahr}-${pad(mo + 1)}-${pad(i)}`);
                      if (t.abwesenheit) { abwTage++; if (t.abwesenheit.art === "urlaub") urlaubTage++; }
                    }
                    /* Gezeigt wird die Abweichung vom Soll, nicht die
                       Auslastung selbst.

                       Der erste Entwurf füllte den Block proportional zur
                       Auslastung — bei Werten um hundert Prozent sahen dann
                       alle Monate gleich aus, und genau der Unterschied
                       zwischen 98 und 106 Prozent ist die Information, um
                       die es geht. Jetzt liegt die Nulllinie in der Mitte:
                       nach oben Mehrarbeit, nach unten Unterdeckung. Ein
                       Ausschlag von fünf Prozent ist damit sichtbar. */
                    const abw = quote - 1;
                    const ueber = abw >= 0;
                    /* Zwanzig Prozent Abweichung füllen die halbe Höhe aus. */
                    const balken = soll > 0
                      ? Math.max(2, Math.min(16, Math.round(Math.abs(abw) / 0.2 * 16))) : 0;
                    const ton = abw > 0.15 ? C.danger : abw > 0.08 ? C.warn
                      : abw < -0.15 ? C.violet : C.accent;
                    const prozent = soll > 0 ? Math.round(quote * 100) : 0;
                    return (
                      <div key={mo} title={(ist === null ? `${MON[mo]} ${jahr} · Soll ${n1(soll)} h · ${ISTDATEN_TEXT}`
                        : `${MON[mo]} ${jahr} · ${n1(ist)} von ${n1(soll)} h`
                        + (soll > 0 ? ` (${prozent} %, ${sgn(Math.round(ist - soll))} h)` : " (kein Soll)"))
                        + (abwTage ? ` · ${abwTage} Tage abwesend${urlaubTage ? `, davon ${urlaubTage} Urlaub` : ""}` : "")}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                        <div style={{ width: 40, height: 36, background: C.flaecheStill, borderRadius: 6,
                          position: "relative", overflow: "hidden" }}>
                          {/* Die Nulllinie: hundert Prozent des Monatssolls */}
                          <span style={{ position: "absolute", left: 0, right: 0, top: 18, height: 1,
                            background: C.lineStark, opacity: .8 }} />
                          {soll > 0 && ist !== null && (
                            <span style={{ position: "absolute", left: 4, right: 4,
                              ...(ueber ? { bottom: 18 } : { top: 19 }),
                              height: balken, background: ton,
                              opacity: ton === C.accent ? .6 : .95, borderRadius: 1 }} />)}
                          {abwTage > 0 && (
                            <span title={`${abwTage} Tage abwesend`} style={{ position: "absolute", top: 0, left: 0,
                              height: 3, width: `${Math.min(100, Math.round(abwTage / tage * 100))}%`,
                              background: C.ok }} />)}
                        </div>
                        <span style={{ fontSize: 9, color: C.dimmer, ...NUM }}>{MON[mo].slice(0, 3)}</span>
                      </div>);
                  })}
                </div>
              </div>);
          })}
        </div>
      </Card>
      <Legende style={{ marginTop: 16 }} punkte={[
        { ton: "accent", label: "im Rahmen", farbig: false },
        { ton: "warn", label: "über Soll", farbig: false },
        { ton: "danger", label: "deutlich über Soll", farbig: false },
        { ton: "violet", label: "unter Soll", farbig: false },
        { ton: "ok", label: "Abwesenheit", farbig: false }]} />
      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8 }}>
        Die Mittellinie ist das Monatssoll. Nach oben Mehrarbeit, nach unten Unterdeckung.</div>
    </div>);
}
