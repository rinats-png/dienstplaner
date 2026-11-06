/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { heute, fLang, DOW, fKurz } from "../lib/datum.js";
import { useMemo } from "react";
import { besetzung, befundeFuer, pruefen, simulation, aktive, abwesenheitAm, kontoSichtbar, stundenkonto, darfEinheit, personTag } from "../lib/fachlogik.js";
import { addDays, dow, pad, pISO } from "../regelwerk.js";
import { zeitraumBisMonat, istVerfuegbar, ISTDATEN_TEXT } from "../istdaten.js";
import { einheitAm, einheitDienst } from "../../server/lib/fachpruefung.mjs";
import { H1, Btn, klickbar, Pill, Avatar, Card, CardHead } from "../ui/bausteine.jsx";
import { Abschnittskopf, Leitraster, Seitenkarte, Namenschip, Punkt, Kennzahlen } from "../gestalt/ansichten.jsx";
import { Zelle, Balken } from "../ui/leisten.jsx";
import { NUM, lesbar } from "../ui/thema.js";
import { C } from "../farben.js";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { mehrzahl } from "../lib/rollen.js";
import { n2, n1 } from "../lib/format.js";
import { darf } from "../lib/berechtigung.js";

/* ============================== LAGEBILD ================================= */
export function Lagebild({ sitz, oeffneTag, akt }) {
  const m = sitz.mandant;
  const d0 = heute();
  const bes = useMemo(() => besetzung(m, d0), [m]);
  const kommend = useMemo(() => befundeFuer(sitz, pruefen(m, d0, addDays(d0, 13))), [m, sitz]);
  const sim = useMemo(() => simulation(m), [m]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const aktiv = aktive(m, d0);
  const abwesend = aktiv.filter((p) => abwesenheitAm(m, p.id, d0)).length;
  const kritisch = kommend.filter((b) => b.schwere === "danger").length;
  const offen = m.anfragen.filter((a) => a.status === "offen").length;
  /* Ohne Ist-Daten (Rollenschutz, src/istdaten.js) gibt es keine Konten — „0 über der Grenze" wäre falsch.
     Gezählt wird weiterhin nur, wessen Konto die Rolle sehen darf (kontoSichtbar). */
  /* WP-43 (N1): Konten, die für den Kontozeitraum nicht verfügbar sind (etwa nach
     einer Versetzung in diesem Jahr), werden ausgeklammert und genannt, statt die
     ganze Zahl zu verwerfen. Ist kein Konto verfügbar, bleibt es bei „–". */
  const kontenZeitraum = zeitraumBisMonat(d0.slice(0, 7));
  const kontenMit = aktiv.filter((p) => kontoSichtbar(sitz, p));
  const kontenOhneIst = kontenMit.filter((p) => !istVerfuegbar(m, p, kontenZeitraum)).length;
  const kontenHoch = kontenMit.length && kontenOhneIst === kontenMit.length ? null
    /* stundenkonto ist für nicht verfügbare Konten null und zählt damit nicht mit. */
    : aktiv.filter((p) => kontoSichtbar(sitz, p) && stundenkonto(m, p, d0.slice(0, 7)) > (m.einstellungen.ausgleichGrenze || 40)).length;
  const woche = Array.from({ length: 14 }, (_, i) => addDays(d0, i));
  const darfBesetzen = darfEinheit(sitz, sitz.person.bereich);

  /* Wer heute eingeteilt ist, nach Einheit. Dieselbe Antwort wie im Plan
     (personTag), nur nach Einheiten gruppiert; eine Uhrzeit wird nicht
     unterstellt — „im Dienst" heißt hier: für heute eingeteilt. */
  const imDienstHeute = useMemo(() => {
    const je = m.einheiten.map((e) => ({ einheit: e, personen: [] }));
    for (const p of aktive(m, d0)) {
      if (p.imSchichtdienst === false) continue;
      const t = personTag(m, p, d0);
      if (!t.dienstId || t.abwesenheit) continue;
      const g = je.find((x) => x.einheit.id === einheitAm(p, d0));
      if (g) g.personen.push({ person: p, da: map[t.dienstId] });
    }
    for (const g of je) g.personen.sort((a, b) => a.person.nachname.localeCompare(b.person.nachname, "de"));
    return je.filter((g) => g.personen.length);
  }, [m]);
  const summeImDienst = imDienstHeute.reduce((a, g) => a + g.personen.length, 0);

  return (
    <div>
      <H1 sub={fLang(d0)} right={darfEinheit(sitz, sitz.person.bereich) &&
        <Btn kind="danger" onClick={() => akt.oeffneKrankmeldung(null)}>Krankmeldung erfassen</Btn>}>Lagebild</H1>

      <Abschnittskopf titel="Besetzung heute"
        rechts={<Btn size="sm" onClick={() => oeffneTag(d0)}>Tag öffnen</Btn>} />
      <div className="schichtreihe">
        {m.dienstarten.map((d) => {
          const b = bes[d.id];
          const e = m.einheiten.find((x) => einheitDienst(m, x.id, d0) === (d.posten ? d.quelle : d.id));
          const luecke = b.diff < 0 || b.qualFehlt;
          return (
            <div key={d.id} className={`karte schichtkarte${luecke ? " luecke" : ""}`}
              {...klickbar(() => (luecke) && darfBesetzen
                ? akt.oeffneSchnellbesetzung(d0, d.id) : oeffneTag(d0))}>
              <div className="kopf">
                <Zelle da={d} size={24} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="name">{d.name}</div>
                  <div className="zeit" style={NUM}>{d.start}–{d.ende}</div>
                </div>
                {b.soll > 0 && (b.diff < 0
                  ? <Pill size="sm" tone={b.status === "danger" ? "danger" : "warn"}>{Math.abs(b.diff)} offen</Pill>
                  : <Pill size="sm" tone="ok">vollständig</Pill>)}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 14 }}>
                <span style={{ fontSize: 32, fontWeight: 450, letterSpacing: "-.035em",
                  color: b.diff < 0 ? C.danger : C.text, ...NUM }}>{b.anzahl}</span>
                <span style={{ fontSize: 14, color: C.dim, ...NUM }}>/ {b.soll}</span></div>
              <div style={{ marginTop: 10 }}><Balken ist={b.anzahl} soll={b.soll} tone={b.status} /></div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>{e ? `${e.name} im Regeldienst` : "aus Abweichungen besetzt"}</div>
              {b.qualFehlt && <div style={{ marginTop: 9 }}><Pill size="sm" tone="danger">Qualifikation fehlt</Pill></div>}
              {luecke && darfBesetzen && (
                <div style={{ marginTop: 11 }}>
                  <Btn size="sm" kind="primary" onClick={(ev) => { if (ev) ev.stopPropagation();
                    akt.oeffneSchnellbesetzung(d0, d.id); }}>Besetzen oder anfragen</Btn>
                </div>)}
            </div>);
        })}
      </div>

      <Leitraster seiteBreite={380}
        haupt={<>
          {imDienstHeute.length > 0 && (
            <Seitenkarte titel="Heute im Dienst"
              rechts={<span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{summeImDienst} Personen</span>}>
              <div className="dienstliste">
                {imDienstHeute.map((g) => (
                  <div key={g.einheit.id} className="zeile">
                    <div className="einheit">
                      <div className="n">{g.einheit.name}</div>
                      <div className="s">{g.personen.length} im Dienst</div>
                    </div>
                    <div className="chips">
                      {g.personen.map(({ person: p, da }) => (
                        <Namenschip key={p.id} title={da ? `${da.name} ${da.start}–${da.ende}` : undefined}
                          avatar={<Avatar person={p} size="sm" style={{ width: 24, height: 24, fontSize: 10 }} />}
                          rechts={da ? <span className="kurz">{da.kurz}</span> : null}>
                          {p.nachname}, {(p.vorname || " ").slice(0, 1)}.</Namenschip>))}
                    </div>
                  </div>))}
              </div>
            </Seitenkarte>)}

          <Card>
            <CardHead>Schichtfolge der kommenden zwei Wochen</CardHead>
            <div style={{ padding: 22, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <thead><tr><th />{woche.map((d) => (
                  <th key={d} style={{ padding: "0 4px 11px", minWidth: 40 }}>
                    <div style={{ fontSize: 10.5, color: feiertag(d, m.bundesland) ? C.danger : C.dim }}>{DOW[dow(d)]}</div>
                    <div style={{ fontSize: 12, color: d === d0 ? C.accent : C.dim, fontWeight: 500, ...NUM }}>{pad(pISO(d).getDate())}</div>
                  </th>))}</tr></thead>
                <tbody>{m.einheiten.map((e) => (
                  <tr key={e.id}><td style={{ paddingRight: 18, whiteSpace: "nowrap", fontSize: 13.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: lesbar(e.farbe, 3), display: "inline-block", marginRight: 9 }} />{e.name}</td>
                    {woche.map((d) => <td key={d} style={{ padding: 3, textAlign: "center" }}>
                      <div style={{ display: "flex", justifyContent: "center" }}><Zelle da={map[einheitDienst(m, e.id, d)]} size={25} /></div></td>)}
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>
        </>}
        seite={
          <Seitenkarte titel="Nächste 14 Tage"
            rechts={<Pill size="sm" tone={kritisch ? "danger" : kommend.length ? "warn" : "ok"}>{kommend.length} Befunde</Pill>}
            className="achtung">
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {kommend.length === 0 && <div style={{ padding: "4px 0 8px", fontSize: 13.5, color: C.ok }}>
                Keine Befunde. Besetzung, Qualifikationen, Ruhezeiten und Urlaubsgrenzen sind eingehalten.</div>}
              {kommend.slice(0, 40).map((b, i) => (
                <div key={b.id + i} className="achtungszeile"
                  {...klickbar(() => (b.art === "besetzung" || b.art === "qualifikation") && b.ref && darfEinheit(sitz, sitz.person.bereich)
                    ? akt.oeffneSchnellbesetzung(b.datum, String(b.ref).split("|")[0]) : oeffneTag(b.datum),
                    `${fKurz(b.datum)}: ${b.titel}`)}>
                  <Punkt ton={b.schwere === "danger" ? "danger" : "warn"} />
                  <span className="t">{b.titel}</span>
                  <span className="d" style={NUM}>{fKurz(b.datum)}</span>
                </div>))}
            </div>
          </Seitenkarte>} />

      <Kennzahlen style={{ marginTop: 16, marginBottom: 0 }} min={170} kacheln={[
        { label: "Personalstärke", wert: aktiv.length, ton: "accent", sub: `${m.einheiten.length} ${mehrzahl(m.einheitLabel)}` },
        { label: "Heute abwesend", wert: abwesend, ton: abwesend > aktiv.length * .2 ? "warn" : "ok" },
        { label: "Wochenarbeitszeit", wert: n2(sim.wochenstunden), einheit: "h", sub: "aus dem Modell" },
        /* Beide Zahlen rechnen mit fremden Anträgen bzw. Stundenkonten — die
           liefert der Server nur Rollen, die sie bearbeiten (sicht.mjs). */
        darf(sitz, "req.approve.unit") && { label: "Offene Anträge", wert: offen, ton: offen ? "warn" : "ok" },
        darf(sitz, "account.view.all") && { label: "Konten über Grenze", wert: kontenHoch === null ? "–" : kontenHoch,
          ton: kontenHoch === null ? undefined : kontenHoch ? "warn" : "ok",
          sub: kontenHoch === null ? ISTDATEN_TEXT : `ab ${n1(m.einstellungen.ausgleichGrenze || 40)} h · Freizeitausgleich`
            + (kontenOhneIst ? ` · ohne ${kontenOhneIst} ${kontenOhneIst === 1 ? "Konto" : "Konten"} (Ist-Daten nicht verfügbar)` : "") }]} />
    </div>);
}
