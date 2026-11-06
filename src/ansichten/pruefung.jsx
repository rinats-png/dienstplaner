/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { pad, dim_, AUSGLEICH_WOCHEN, addDays, uhrsprung, DURCHSCHNITT_TAG, dow, REGELSTAND } from "../regelwerk.js";
import { useState, useMemo } from "react";
import { befundeFuer, pruefen, ausgleichVerstoesse, rechtsquelle } from "../lib/fachlogik.js";
import { H1, Btn, Card, Pill, CardHead, klickbar, Leer } from "../ui/bausteine.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { heute, MON, fDatum, fKurz, DOW } from "../lib/datum.js";
import { C } from "../farben.js";
import { ISTDATEN_TEXT } from "../istdaten.js";
import { NUM } from "../ui/thema.js";
import { n1 } from "../lib/format.js";
import { darf } from "../lib/berechtigung.js";
import { protokollFuellstand, WARNSTUFEN, befundText, ABWEICHUNG_GRUENDE } from "../warnstufen.js";
import { Hinweisband, Kennzahlen, Leitraster, Punkt, Seitenkarte } from "../gestalt/ansichten.jsx";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";

export function Pruefung({ sitz, ym, setYm, oeffneTag }) {
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const von = `${ym}-01`, bis = `${ym}-${pad(dim_(y, mo - 1))}`;
  const [f, setF] = useState("alle");
  const befunde = useMemo(() => befundeFuer(sitz, pruefen(m, von, bis)), [m, ym, sitz]);
  const arten = [["alle", "Alle"], ["besetzung", "Besetzung"], ["qualifikation", "Qualifikation"], ["ruhezeit", "Ruhezeit"],
    ["aufgabe", "Vorbehaltene Aufgaben"], ["folge", "Dienstfolge"], ["nachtfolge", "Nachtfolge"], ["abwesend", "Abwesenheit"], ["ueberlappung", "Überlappung"], ["urlaub", "Urlaub"], ["schutz", "Schutzvorschriften"]];
  const gez = befunde.filter((b) => f === "alle" || b.art === f);
  const krit = befunde.filter((b) => b.schwere === "danger").length;

  /* § 3 ArbZG wird über den Monat hinaus geprüft — der Ausgleichszeitraum
     ist gleitend und reicht weit zurück. Deshalb steht er über den
     Monatsbefunden, nicht zwischen ihnen. */
  const ausgleich = useMemo(() => ausgleichVerstoesse(m, bis), [m, ym]);
  /* WP-27: Ohne Ist-Daten (Betriebsrat) ist der Ausgleichszeitraum nicht bewertbar — nie „eingehalten". */
  const ohneIstAusgleich = !!(m.sichtIstDaten && m.sichtIstDaten.umfang === "keine");
  const ausgleichWochen = (m.einstellungen || {}).ausgleichWochen || AUSGLEICH_WOCHEN;

  return (
    <div>
      {/* Die Prüfung zeigte einen Monat, ließ ihn aber nicht wechseln — wer
          den nächsten sehen wollte, musste über den Monatsplan gehen. */}
      <H1 sub={`Geprüft werden Mindestbesetzung, Qualifikationen, Ruhezeit (${m.einstellungen.ruhezeit} h), Dienst- und Nachtfolgen, Dienst trotz Abwesenheit, überlappende Abwesenheiten, gleichzeitige Urlaube und die Schutzvorschriften für Jugendliche, Schwangere und schwerbehinderte Menschen.`}
        right={setYm ? (<div style={{ display: "flex", gap: 9 }} className="noprint">
          <Btn onClick={() => { const d = new Date(y, mo - 2, 1);
            setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }} aria-label="Monat zurück"><Icon n="chevron-links" size={16} /></Btn>
          <Btn onClick={() => setYm(heute().slice(0, 7))}>Heute</Btn>
          <Btn onClick={() => { const d = new Date(y, mo, 1);
            setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }} aria-label="Monat vor"><Icon n="chevron-rechts" size={16} /></Btn>
        </div>) : null}>
        Prüfung · {MON[mo - 1]} {y}</H1>

      {/* --- Zeitumstellung ---
          Zwei Tage im Jahr, an denen die gerechneten Stunden von der Uhr
          abweichen. Wer das nicht weiß, sucht den Fehler in der Anwendung. */}
      {(() => {
        const tage = [];
        for (let d = von; d <= bis; d = addDays(d, 1)) if (uhrsprung(d)) tage.push(d);
        if (!tage.length) return null;
        const t = tage[0];
        const rueck = uhrsprung(t) > 0;
        return (
          <Card style={{ marginBottom: 20, borderLeft: `3px solid ${C.violet}` }}>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 14.5, fontWeight: 640, marginBottom: 5 }}>
                Zeitumstellung am {fDatum(t)} — dieser Tag hat {rueck ? 25 : 23} Stunden</div>
              <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, maxWidth: "72ch" }}>
                Die Uhr springt in der Nacht {rueck ? "von drei auf zwei zurück" : "von zwei auf drei vor"}.
                Ein Nachtdienst von {rueck ? "22 bis 6 Uhr dauert in dieser Nacht neun Stunden statt acht"
                  : "22 bis 6 Uhr dauert in dieser Nacht sieben Stunden statt acht"} — so wird er
                auch gerechnet, im Stundenkonto wie in der Ruhezeitprüfung.
                {rueck ? " Zuschläge für Nachtarbeit fallen entsprechend für eine Stunde mehr an."
                  : " Wer knapp über der Ruhezeit geplant ist, reißt sie in dieser Nacht."}
              </div>
            </div>
          </Card>);
      })()}

      {/* --- § 3 Arbeitszeitgesetz --- */}
      <Card style={{ marginBottom: 20, borderLeft: `3px solid ${ohneIstAusgleich ? C.line : ausgleich.length ? C.danger : C.ok}` }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
            gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: 15.5, fontWeight: 650 }}>
              Ausgleichszeitraum nach § 3 Arbeitszeitgesetz</div>
            <Pill tone={ohneIstAusgleich ? undefined : ausgleich.length ? "danger" : "ok"} size="sm">
              {ohneIstAusgleich ? "nicht bewertbar" : ausgleich.length ? `${ausgleich.length} überschritten` : "eingehalten"}</Pill>
          </div>
          <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "68ch" }}>
            Acht Stunden werktäglich, verlängerbar auf zehn — sofern im Durchschnitt
            von {ausgleichWochen} Wochen acht Stunden je Werktag nicht überschritten werden.
            Der Durchschnitt ist der Kern der Vorschrift: Ein Plan kann Woche für Woche
            zulässig aussehen und den Zeitraum trotzdem reißen. Gerechnet wird gleitend
            bis zum {fKurz(bis)}, Sonntage zählen nicht als Werktage.
          </p>
          {ohneIstAusgleich
            ? <div style={{ fontSize: 13.5, color: C.dim }}>{ISTDATEN_TEXT} Der Durchschnitt braucht die tatsächlichen Arbeitszeiten.</div>
            : ausgleich.length === 0
            ? <div style={{ fontSize: 13.5, color: C.dim }}>
                Alle Beschäftigten liegen im Durchschnitt bei höchstens {DURCHSCHNITT_TAG} Stunden
                je Werktag.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {ausgleich.slice(0, 12).map((v) => (
                  <div key={v.person.id} style={{ display: "flex", alignItems: "center", gap: 14,
                    flexWrap: "wrap", padding: "9px 0", borderTop: `1px solid ${C.lineSoft}` }}>
                    <div style={{ minWidth: 170, fontSize: 14 }}>
                      {v.person.nachname}, {v.person.vorname}</div>
                    <div style={{ fontSize: 13, color: C.dim, ...NUM }}>
                      {n1(v.stunden)} von {n1(v.zulaessig)} h auf {v.werktage} Werktage</div>
                    <div style={{ fontSize: 13, ...NUM }}>
                      <b style={{ color: C.danger }}>{n1(v.durchschnitt)} h</b>
                      <span style={{ color: C.dimmer }}> je Werktag</span></div>
                    <span style={{ flex: 1 }} />
                    <Pill tone="danger" size="sm">{n1(v.ueberhang)} h abzubauen</Pill>
                  </div>))}
                {ausgleich.length > 12 && (
                  <div style={{ fontSize: 13, color: C.dim, paddingTop: 8 }}>
                    und {ausgleich.length - 12} weitere.</div>)}
              </div>}
        </div>
      </Card>
      {(() => {
        /* Füllstand des Bestätigungsprotokolls (Nachprüfung WP-10): ab 80 %
           sieht die Leitung (und Planung) eine Warnung; an der Grenze werden
           neue Bestätigungen abgewiesen, alte nie verdrängt. Der Betriebsrat
           bekommt nur Zählwerte und braucht sie nicht. */
        if (sitz.rolle === "betriebsrat" || !darf(sitz, "plan.edit.all")) return null;
        const f = protokollFuellstand((m.bestaetigungen || []).length);
        return f.warnung ? <Hinweisband ton={f.voll ? "danger" : "warn"} titel={f.text} /> : null;
      })()}
      {(() => {
        /* Bewusst bestätigte Abweichungen (E-19): getrennt von den
           unentdeckten Befunden. Sie stehen hier, bis der Monat abgelaufen
           ist — wer bestätigt hat, aus welchem Grund, mit welchem Regelstand. */
        /* Der Betriebsrat bekommt nur den Monat, keinen Tag (Review M1). */
        const best = (m.bestaetigungen || []).filter((x) => x.datum ? x.datum >= von && x.datum <= bis
          : x.monat && x.monat >= von.slice(0, 7) && x.monat <= bis.slice(0, 7));
        if (!best.length) return null;
        /* Der Betriebsrat bekommt nur Zählwerte je Monat, Regel und Stufe
           (Nachprüfung M1-Rest) — keine einzelnen Einträge. */
        if (best.some((x) => x.anzahl !== undefined)) return (
          <Card style={{ marginBottom: 18 }}>
            <CardHead>Bewusst bestätigte Abweichungen (Zählwerte)</CardHead>
            <div style={{ padding: "0 var(--pad-x) 16px" }}>
              {best.map((x, i) => (
                <div key={`${x.monat}|${x.regel}|${x.stufe}|${i}`}
                  style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.lineSoft}`, alignItems: "center", flexWrap: "wrap" }}>
                  <Pill size="sm" tone={(WARNSTUFEN[x.stufe] || WARNSTUFEN.hinweis).ton}>{(WARNSTUFEN[x.stufe] || WARNSTUFEN.hinweis).label}</Pill>
                  <span style={{ minWidth: 80, fontSize: 13.5, ...NUM }}>{x.monat}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{x.regel === "schutz" ? "Schutz- oder Einsatzregel" : befundText(x.regel)}</span>
                  <span style={{ fontSize: 13.5, ...NUM }}>{x.anzahl}</span>
                </div>))}
            </div>
          </Card>);
        const recht = best.filter((x) => x.stufe === "recht");
        const ohneGrund = recht.filter((x) => x.ohneGrund).length;
        return (
          <Card style={{ marginBottom: 18 }}>
            <CardHead right={<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {recht.length > 0 && <Pill size="sm" tone="danger">{recht.length} {recht.length === 1 ? "Rechtsverstoß" : "Rechtsverstöße"}</Pill>}
              {ohneGrund > 0 && <Pill size="sm">{ohneGrund} ohne Grund</Pill>}</div>}>
              Bewusst bestätigte Abweichungen</CardHead>
            <div style={{ padding: "0 var(--pad-x) 16px" }}>
              {best.slice(0, 40).map((x) => {
                const pp = m.personen.find((y) => y.id === x.personId);
                const da = m.dienstarten.find((y) => y.id === x.dienstId);
                const g = ABWEICHUNG_GRUENDE.find((y) => y.id === x.grundArt);
                return (
                  <div key={x.id} className={x.datum ? "klick" : undefined} {...(x.datum ? klickbar(() => oeffneTag(x.datum)) : {})}
                    style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.lineSoft}`, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <Pill size="sm" tone={(WARNSTUFEN[x.stufe] || WARNSTUFEN.hinweis).ton}>{(WARNSTUFEN[x.stufe] || WARNSTUFEN.hinweis).label}</Pill>
                    <div style={{ minWidth: 150, fontSize: 13.5, ...NUM }}>
                      {x.datum ? `${fKurz(x.datum)} · ${da ? da.kurz : x.dienstId}` : (x.monat || "")}
                      <div style={{ fontSize: 12, color: C.dim }}>{pp ? `${pp.nachname}, ${pp.vorname}` : "Person"}</div></div>
                    <div style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45 }}>
                      {(x.befunde || []).map((b) => b.text || befundText(b.regel)).join(" · ")}
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                        bestätigt von {x.durch || "?"}{x.zeit ? ` · ${fKurz(x.zeit.slice(0, 10))}` : ""}
                        {" · "}{g ? `${g.label}${x.grund ? `: ${x.grund}` : ""}` : "ohne Grund"}</div>
                    </div>
                  </div>);
              })}
              {best.length > 40 && <div style={{ fontSize: 12.5, color: C.dim, paddingTop: 8 }}>und {best.length - 40} weitere.</div>}
            </div>
          </Card>);
      })()}
      <Kennzahlen kacheln={[
        { label: "Befunde", wert: befunde.length, ton: befunde.length ? "warn" : "ok" },
        { label: "Kritisch", wert: krit, ton: krit ? "danger" : "ok", hervor: krit ? "danger" : undefined, sub: "sofort klären" },
        { label: "Betroffene Tage", wert: new Set(befunde.map((b) => b.datum)).size, sub: `von ${dim_(y, mo - 1)}` }]} />
      <Leitraster seiteBreite={340}
        haupt={<>
          <div className="seg" role="group" aria-label="Befunde filtern" style={{ flexWrap: "wrap" }}>
            {arten.map(([id, l]) => { const n = id === "alle" ? befunde.length : befunde.filter((b) => b.art === id).length;
              return <button key={id} type="button" className={f === id ? "on" : ""} aria-pressed={f === id}
                onClick={() => setF(id)}>{l}{n > 0 ? ` · ${n}` : ""}</button>; })}
          </div>
          <Card>
            {gez.length === 0
              ? <Leer titel="Keine Befunde" text="Der Monat erfüllt in dieser Kategorie alle hinterlegten Regeln." />
              : gez.map((b, i) => (
                <div key={b.id + i} className="listenzeile klick" {...klickbar(() => oeffneTag(b.datum))}
                  style={{ alignItems: "flex-start", gap: 15 }}>
                  <span style={{ paddingTop: 5 }}><Punkt ton={b.schwere === "danger" ? "danger" : "warn"} gross /></span>
                  <div style={{ minWidth: 84 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, ...NUM }}>{fKurz(b.datum)}</div>
                    <div style={{ fontSize: 11.5, color: C.dim }}>{DOW[dow(b.datum)]}</div></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: b.schwere === "danger" ? C.danger : C.warn, fontWeight: 500 }}>{b.titel}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{b.text}</div>
                    {(() => {
                      /* Woraus folgt das? Ohne diese Zeile ist ein Befund eine
                         Meinung der Software; mit ihr ist er eine Vorschrift. */
                      const q = rechtsquelle(b);
                      if (!q || !q.norm) return null;
                      return (
                        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 5,
                          display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ padding: "1px 7px", borderRadius: 5,
                            background: q.betrieblich ? "transparent" : C.flaecheStill,
                            border: q.betrieblich ? `1px solid ${C.lineSoft}` : "none",
                            color: C.dim, fontWeight: 550, whiteSpace: "nowrap" }}>{q.norm}</span>
                          {q.satz && <span style={{ lineHeight: 1.45 }}>{q.satz}</span>}
                          {q.regelId && <span style={{ fontSize: 10.5, color: C.dimmer, whiteSpace: "nowrap", ...NUM }}
                            title={`Regel ${q.regelId} · Regelstand ${REGELSTAND.version}`}>{q.regelId}</span>}
                        </div>);
                    })()}</div>
                </div>))}
          </Card>
        </>}
        seite={<>
          <Seitenkarte titel="Was geprüft wurde">
            {arten.filter(([id]) => id !== "alle").map(([id, l]) => {
              const n = befunde.filter((b) => b.art === id).length;
              const hart = befunde.some((b) => b.art === id && b.schwere === "danger");
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13.5 }}>
                  <Punkt ton={n ? (hart ? "danger" : "warn") : "ok"} gross />
                  <span style={{ flex: 1 }}>{l}</span>
                  <span style={{ fontSize: 12, color: C.dim }}>{n ? `${n} ${n === 1 ? "Befund" : "Befunde"}` : "geprüft"}</span>
                </div>);
            })}
          </Seitenkarte>
          <Erklaerkasten>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
              <Pill size="sm">Regelstand {REGELSTAND.version}</Pill>
              <span>Geprüft nach {REGELSTAND.quellen.slice(0, 4).join(" · ")}
                {REGELSTAND.quellen.length > 4 ? ` und ${REGELSTAND.quellen.length - 4} weiteren` : ""}.
                Jede Planänderung wird mit diesem Stand festgehalten.</span>
            </div>
          </Erklaerkasten>
        </>} />
    </div>);
}
