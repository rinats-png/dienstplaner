/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { stempelVorgang } from "../stempelvorgang.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { pad, addDays, dim_ } from "../regelwerk.js";
import { C } from "../farben.js";
import { klickbar, Card, Rubrik, Btn, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { Sparkline, Bogen, Fortschritt, Checkliste } from "../gestalt/bausteine.jsx";
import { Kennzahlen, Seitenkarte, Abschnittskopf } from "../gestalt/ansichten.jsx";
import { monatslage as ppugvMonatslage } from "../ppugv.js";
import { AufgabeSymbol } from "./stempeluhr.jsx";
import { KorrekturKarte } from "./korrekturen.jsx";
import { DienstKarte } from "./dienstkarte.jsx";
import { aktive, abwesenheitAm, personTag, besetzung, pruefen, offeneErfassung, useSchutzkonflikte, nachweisLage, tagesaufgaben, besetzungsVerlauf, einrichtungsstand, belastbarkeit } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { mehrzahl } from "../lib/rollen.js";
import { ppugvZeilen } from "../lib/planhilfen.js";


/* ==========================================================================
   HEUTE PRIORISIEREN
   Die Startseite sagt nicht, was alles da ist — sie sagt, was zuerst dran ist.
   Höchstens drei Karten, jede mit einer Zahl, einem Satz und einem Weg.
   Alles Weitere liegt darunter und ist eingeklappt.
   ========================================================================== */
export function Prioritaeten({ sitz, akt, gehZu, oeffneTag }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  /* Nur für Planung und Leitung (dieselbe Bedingung wie die Pflichtaufgabe unten); entprellt, in Häppchen (Nachtrag WP-22b). */
  const schutzkonflikte = useSchutzkonflikte(sitz, darf(sitz, "pattern.edit") || darf(sitz, "org.edit"));
  const [alles, setAlles] = useState(false);
  const aufgaben = useMemo(() => tagesaufgaben(sitz), [m, p.id]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meinDienst = p.imSchichtdienst !== false ? personTag(m, p, d0) : null;
  const meineDa = meinDienst && meinDienst.dienstId ? map[meinDienst.dienstId] : null;
  /* Eigene Zeiterfassung: wie in Tagesstart und MHeute — wer im Schichtdienst steht. */
  const vorgang = p.imSchichtdienst !== false ? stempelVorgang(m, p, d0) : null;
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen"
    : stunde < 18 ? "Guten Tag" : "Guten Abend";
  /* Ohne Vornamen wurde daraus „Guten Tag, ." — bei einem frisch angelegten
     Betrieb steht dort noch nichts. Der Satz ohne Anrede ist der bessere. */
  const anrede = (p.vorname || "").trim();

  /* Die drei wichtigsten Sachen — nach Dringlichkeit und Tragweite geordnet. */
  const oben = useMemo(() => {
    const l = [];
    const bes = besetzung(m, d0);
    const luecken = Object.values(bes).filter((b) => b.soll > 0 && b.diff < 0);
    if (luecken.length && darf(sitz, "plan.edit.unit"))
      l.push({ id: "luecke", zahl: luecken.reduce((a, b) => a + Math.abs(b.diff), 0),
        einheit: "Plätze", titel: "Heute fehlt Besetzung",
        text: luecken.map((b) => `${b.da.name} ${b.anzahl}/${b.soll}`).join(" · "),
        ton: "danger", weg: () => oeffneTag(d0), knopf: "Lücken schließen" });

    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
    if (offen && darf(sitz, "req.approve.unit"))
      l.push({ id: "antraege", zahl: offen, einheit: offen === 1 ? "Antrag" : "Anträge",
        titel: "Warten auf Entscheidung",
        text: "Die Kapazitätsansicht zeigt vor der Entscheidung, welche Wochen dadurch kippen.",
        ton: "warn", weg: () => gehZu("antraege"), knopf: "Anträge ansehen" });

    if (darf(sitz, "staff.view")) {
      const nl = nachweisLage(m);
      if (nl.abgelaufen.length)
        l.push({ id: "nachweise", zahl: nl.abgelaufen.length, einheit: "Nachweise",
          titel: "Sind abgelaufen",
          text: nl.abgelaufen.slice(0, 3).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
          ton: "danger", weg: () => gehZu("nachweise"), knopf: "Nachweise prüfen" });
    }

    if (darf(sitz, "plan.view.unit")) {
      const bl = belastbarkeit(m, 4).filter((w) => w.stufe === "ohne Reserve");
      if (bl.length)
        l.push({ id: "reserve", zahl: bl.length, einheit: bl.length === 1 ? "Woche" : "Wochen",
          titel: "Ohne jede Reserve",
          text: `Ab ${fKurz(bl[0].von)} verträgt ${bl[0].schwaechste ? bl[0].schwaechste.da.name : "ein Dienst"} keinen einzigen Ausfall mehr.`,
          ton: "warn", weg: () => gehZu("belastbarkeit"), knopf: "Belastbarkeit ansehen" });
    }

    if (p.imSchichtdienst !== false) {
      const zeiten = offeneErfassung(m, p, addDays(d0, -1)).length;
      if (zeiten)
        l.push({ id: "zeiten", zahl: zeiten, einheit: "Tage", titel: "Zeiten bestätigen",
          text: "Solange sie offen sind, bleibt dein Stundenkonto eine Hochrechnung.",
          ton: "warn", weg: () => gehZu("meine"), knopf: "Jetzt bestätigen" });
    }

    const es = einrichtungsstand(m);
    if (!es.fertig && darf(sitz, "org.edit"))
      l.push({ id: "einrichtung", zahl: es.offen.length,
        einheit: es.offen.length === 1 ? "Schritt" : "Schritte", titel: "Bis zum laufenden Betrieb",
        text: es.offen[0].titel + " — " + es.offen[0].text,
        ton: "accent", weg: () => gehZu(es.offen[0].ziel), knopf: "Weiter einrichten" });

    /* Offene Schutzkonflikte (A2): eine Pflichtaufgabe für Planung und Leitung,
       bis umgeplant ist — vor allem anderen. */
    if (darf(sitz, "pattern.edit") || darf(sitz, "org.edit")) {
      const sk = [...schutzkonflikte.values()].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      if (sk.length)
        l.unshift({ id: "schutzkonflikt", zahl: sk.length, einheit: sk.length === 1 ? "Einteilung" : "Einteilungen",
          titel: "Widersprechen einer Schutz- oder Einsatzregel",
          text: `${sk.slice(0, 3).map((x) => `${x.person.nachname} · ${fKurz(x.datum)}`).join(" · ")} — bitte umplanen.`,
          ton: "danger", weg: () => oeffneTag(sk[0].datum), knopf: "Umplanen" });
    }
    const rang = { danger: 0, warn: 1, accent: 2 };
    return l.sort((a, b) => rang[a.ton] - rang[b.ton]).slice(0, 3);
  }, [m, p.id, sitz, schutzkonflikte]);

  const rest = aufgaben.filter((a) => !oben.some((o) => o.id === a.art || o.id === a.ziel));
  const ton = (t) => t === "danger" ? C.danger : t === "warn" ? C.warn : C.accent;
  const flaeche = (t) => t === "danger" ? C.dangerLight : t === "warn" ? C.warnLight : C.accentLight;

  return (
    <div>
      {/* --------------------------- Anrede -------------------------- */}
      <div style={{ marginBottom: 40 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 className="titel" style={{ marginTop: 12 }}>
          {anrede ? <>{gruss}, <b>{anrede}</b>.</> : <>{gruss}.</>}
        </h1>
        <p className="untertitel">
          {oben.length === 0
            ? "Nichts braucht heute deine Aufmerksamkeit. Der Plan trägt."
            : oben.length === 1
              ? "Eine Sache steht heute an."
              : `${oben.length} Dinge stehen heute an — das erste zuerst.`}
        </p>
      </div>

      {/* Kennzahlen als einzelne Karten. Jede hat ihre Quelle in einer
          bestehenden Funktion (besetzung, pruefen, ppugv); fehlt die Grundlage
          (kein Soll, keine Untergrenzen-Bereiche), fehlt die Karte. */}
      {darf(sitz, "plan.view.unit") && (() => {
        const bes = besetzung(m, d0);
        const offen = Object.values(bes).filter((b) => b.soll > 0 && b.diff < 0)
          .reduce((a, b) => a + Math.abs(b.diff), 0);
        const frei = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
        const abw = m.personen.filter((x) => imDienst(x, d0) && abwesenheitAm(m, x.id, d0)).length;
        const kommend = (() => { let n = 0;
          for (let i = 1; i <= 7; i++) { const d = addDays(d0, i);
            n += Object.values(besetzung(m, d)).filter((b) => b.soll > 0 && b.diff < 0).length; }
          return n; })();
        const sollHeute = Object.values(bes).reduce((a, b) => a + b.soll, 0);
        const istHeute = Object.values(bes).reduce((a, b) => a + Math.min(b.anzahl, b.soll), 0);
        const verlauf = besetzungsVerlauf(m, addDays(d0, -13), 14).filter((x) => x.soll > 0);
        /* Ruhezeit-Befunde der letzten 28 Tage gegen die 28 davor — beide
           Zeiträume kommen aus derselben Prüfung, sonst gäbe es keinen Trend. */
        const ruheJetzt = pruefen(m, addDays(d0, -27), d0).filter((x) => x.art === "ruhezeit").length;
        const ruheVorher = pruefen(m, addDays(d0, -55), addDays(d0, -28)).filter((x) => x.art === "ruhezeit").length;
        const diff = ruheJetzt - ruheVorher;
        return (
          <Kennzahlen style={{ marginBottom: 40 }} kacheln={[
            sollHeute > 0 && { label: "Besetzung heute", wert: Math.round((istHeute / sollHeute) * 100), einheit: "%",
              ton: istHeute >= sollHeute ? "ok" : "warn", sub: `${istHeute} von ${sollHeute} Plätzen besetzt`,
              bild: verlauf.length > 1 && (
                <Sparkline art="saeulen" daten={verlauf.map((x) => x.quote)} hoehe={34}
                  beschriftung={`Besetzungsgrad der letzten ${verlauf.length} Tage, heute ${verlauf[verlauf.length - 1].quote} Prozent`} />) },
            { label: "Offene Schichten", wert: offen, ton: offen ? "danger" : "ok", hervor: offen ? "danger" : undefined,
              sub: offen ? "Plätze heute" : "alles besetzt" },
            { label: "Freigaben warten", wert: frei, ton: frei ? "warn" : "ok", sub: frei ? "zu entscheiden" : "nichts offen" },
            { label: "Abwesenheiten heute", wert: abw, sub: "Urlaub, krank, Schulung" },
            { label: "Nächste 7 Tage", wert: kommend, ton: kommend ? "warn" : "ok",
              sub: kommend ? "Lücken erwartet" : "durchgehend gedeckt" },
            { label: "Ruhezeit-Befunde", wert: ruheJetzt, ton: ruheJetzt ? "warn" : "ok",
              sub: "letzte 28 Tage, gegen die 28 davor",
              trend: ruheJetzt + ruheVorher === 0 ? undefined
                : { text: diff === 0 ? "wie zuvor" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`,
                  ton: diff > 0 ? "warn" : diff < 0 ? "ok" : "neutral",
                  richtung: diff > 0 ? "auf" : diff < 0 ? "ab" : "gleich" } },
          ]} />);
      })()}

      {/* Einrichtung und Untergrenzen: nur, wo es etwas zu zeigen gibt. */}
      {(() => {
        const es = einrichtungsstand(m);
        const zeigEinr = !es.fertig && darf(sitz, "org.edit");
        const ugEinh = darf(sitz, "plan.view.unit")
          ? (m.einheiten || []).filter((e) => !e.pool && e.ppugvBereich) : [];
        if (!zeigEinr && !ugEinh.length) return null;
        const [y0, mo0] = d0.split("-").map(Number);
        const tageMonat = Array.from({ length: dim_(y0, mo0 - 1) }, (_, i) => `${d0.slice(0, 7)}-${pad(i + 1)}`);
        const ug = ugEinh.map((e) => ({ e, l: ppugvMonatslage(ppugvZeilen(m, e, tageMonat)) }));
        const gesamt = ug.reduce((a, x) => a + x.l.gesamt, 0);
        const gruen = ug.reduce((a, x) => a + x.l.gruen, 0);
        const rot = ug.reduce((a, x) => a + x.l.rot, 0);
        const grau = ug.reduce((a, x) => a + x.l.grau, 0);
        return (
          <div className="startpaar">
            {zeigEinr && (
              <Seitenkarte titel="Einrichtung" sub="Diese Schritte fehlen noch für den vollständigen Betrieb.">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}><Fortschritt wert={es.anteil} hoehe={8} label="Einrichtung" /></div>
                  <b style={{ color: C.accent, fontSize: 13, ...NUM }}>{es.anteil} %</b>
                </div>
                <Checkliste punkte={es.schritte.map((st) => ({
                  text: st.titel, erledigt: st.erledigt, onClick: st.erledigt ? undefined : () => gehZu(st.ziel) }))} />
              </Seitenkarte>)}
            {ug.length > 0 && (
              <Seitenkarte titel="Untergrenzen im Monat" sub="Schichten je Bereich nach PpUGV, Stand dieses Monats.">
                <Bogen segmente={[{ wert: gruen, ton: "ok", label: `${gruen} eingehalten` },
                  { wert: rot, ton: "danger", label: `${rot} unterschritten` },
                  { wert: grau, label: `${grau} nicht bewertbar` }]}
                  zahl={gesamt ? `${Math.round((gruen / gesamt) * 100)} %` : "—"} kopf="Eingehalten"
                  beschriftung={`${gruen} von ${gesamt} Schichten eingehalten, ${rot} unterschritten, ${grau} nicht bewertbar`} />
                <div style={{ marginTop: 14 }}>
                  {ug.map(({ e, l }) => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: 10, padding: "6px 0", fontSize: 13.5 }}>
                      <span>{e.name}</span>
                      <Pill size="sm" tone={l.rot ? "danger" : l.grau ? "neutral" : "ok"}>
                        {l.rot ? `${l.rot} unterschritten` : l.grau ? `${l.grau} nicht bewertbar` : "eingehalten"}</Pill>
                    </div>))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn size="sm" onClick={() => gehZu("untergrenzen")}>Untergrenzen öffnen</Btn></div>
              </Seitenkarte>)}
          </div>);
      })()}

      {/* ------------------------ Die drei Karten -------------------- */}
      {oben.length === 0 ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ color: C.ok, marginBottom: 14, display: "flex", justifyContent: "center" }}><Icon n="kreis-haken" size={38} /></div>
          <div style={{ fontSize: 19, fontWeight: 620, marginBottom: 8 }}>Alles im Lauf</div>
          <div style={{ fontSize: 14.5, color: C.dim, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Keine offenen Entscheidungen, keine Lücken, keine abgelaufenen Nachweise.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <h2 className="abschnitt-titel" style={{ marginBottom: 2 }}>Heute zu erledigen</h2>
          {oben.map((x, i) => (
            <Card key={x.id} className="karte-hover" onClick={x.weg}
              style={{ padding: "30px 32px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 32, flexWrap: "wrap",
                borderLeft: `3px solid ${ton(x.ton)}`,
                background: i === 0 ? flaeche(x.ton) : C.flaeche }}>
              <div style={{ minWidth: 92 }}>
                <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-.05em", lineHeight: 1,
                  color: ton(x.ton), ...NUM }}>{x.zahl}</div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 6 }}>{x.einheit}</div>
              </div>
              <div style={{ flex: 1, minWidth: 250 }}>
                <div style={{ fontSize: 20, fontWeight: 640, letterSpacing: "-.02em", marginBottom: 8 }}>
                  {x.titel}</div>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{x.text}</div>
              </div>
              <Btn kind={i === 0 ? "primary" : "plain"} style={{ flexShrink: 0 }}
                onClick={(e) => { if (e) e.stopPropagation(); x.weg(); }}>{x.knopf}</Btn>
            </Card>))}
        </div>)}

      {/* ------------------------ Mein Dienst ------------------------ */}
      {/* Bisher nur Anzeige und Verweis — am Rechner gab es keine Stempeluhr
          (Tagesstart, die sie trug, ist nicht eingebunden). Jetzt dieselbe
          Karte wie dort: geplanter Dienst oder offener Beginn, mit Stempeluhr. */}
      {(meineDa || (vorgang && vorgang.offen)) && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Mein Dienst heute</h2>
          <p className="abschnitt-sub">Was für dich persönlich ansteht.</p>
          <DienstKarte sitz={sitz} akt={akt} vorgang={vorgang} meineDa={meineDa}>
            <Btn onClick={() => gehZu("meine")}>Meine Schichten</Btn>
          </DienstKarte>
        </div>)}
      {sitz.person && <KorrekturKarte sitz={sitz} akt={akt} />}

      {/* --------------------- Alles Weitere, eingeklappt ------------- */}
      {rest.length > 0 && (
        <div className="abschnitt">
          <button className={`mehr${alles ? " auf" : ""}`} onClick={() => setAlles(!alles)}
            aria-expanded={alles}>
            <span aria-hidden="true" style={{ display: "flex" }}><Icon n="chevron-rechts" size={14} /></span>
            {alles ? "Weniger anzeigen" : `Alles Weitere anzeigen (${rest.length})`}
          </button>
          {alles && (
            <Card style={{ marginTop: 14 }}>
              {rest.map((a, i) => (
                <div key={i} {...klickbar(a.ziel ? () => gehZu(a.ziel) : null)}
                  className="zeile-hover"
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px",
                    cursor: a.ziel ? "pointer" : "default",
                    borderBottom: i < rest.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 14,
                    background: a.dringend ? C.dangerLight : C.bg,
                    color: a.dringend ? C.danger : C.dim }}><AufgabeSymbol art={a.art} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 550 }}>{a.titel}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.5 }}>{a.text}</div>
                  </div>
                  {a.ziel && <span aria-hidden="true" style={{ color: C.dim, display: "flex" }}><Icon n="chevron-rechts" size={18} /></span>}
                </div>))}
            </Card>)}
        </div>)}

      {/* ------------------------ Lage in Zahlen --------------------- */}
      {darf(sitz, "plan.view.unit") && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Die Lage in Zahlen</h2>
          <p className="abschnitt-sub">Stand heute, über alle {mehrzahl(m.einheitLabel)}.</p>
          {(() => {
            const bes = besetzung(m, d0);
            const eingeteilt = Object.values(bes).reduce((a, b) => a + b.anzahl, 0);
            const abw = m.personen.filter((x) => imDienst(x, d0) && abwesenheitAm(m, x.id, d0)).length;
            const bl = belastbarkeit(m, 4);
            const schwach = bl.filter((w) => w.stufe !== "robust").length;
            return (
              <Kennzahlen style={{ marginBottom: 0 }} kacheln={[
                { label: "Heute im Dienst", wert: eingeteilt, ton: "accent", sub: `von ${aktive(m, d0).length} Beschäftigten` },
                { label: "Abwesend", wert: abw, sub: "Urlaub, krank, Schulung" },
                { label: "Wochen ohne Puffer", wert: schwach, ton: schwach ? "warn" : "ok", sub: "in den nächsten vier" }]} />);
          })()}
        </div>)}

      {/* ------------------------ Dienstbuch ------------------------- */}
      {darf(sitz, "plan.view.unit") && (m.dienstbuch || []).length > 0 && (() => {
        const arten = { uebergabe: ["Übergabe", "accent"], vorkommnis: ["Vorkommnis", "danger"], hinweis: ["Hinweis", "warn"] };
        const letzte = [...m.dienstbuch].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0)).slice(0, 5);
        return (
          <div className="abschnitt">
            <Abschnittskopf titel="Dienstbuch" sub="Die letzten Einträge."
              rechts={<Btn size="sm" onClick={() => gehZu("buch")}>Dienstbuch öffnen</Btn>} />
            <Card>
              {letzte.map((e) => (
                <div key={e.id} className="listenzeile" style={{ alignItems: "flex-start" }}>
                  <Pill size="sm" tone={(arten[e.art] || [])[1]}>{(arten[e.art] || [e.art])[0]}</Pill>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5,
                    overflowWrap: "anywhere" }}>{e.text}</div>
                  <span style={{ fontSize: 12, color: C.dim, whiteSpace: "nowrap", ...NUM }}>{fKurz(e.datum)}</span>
                </div>))}
            </Card>
          </div>);
      })()}
    </div>);
}
