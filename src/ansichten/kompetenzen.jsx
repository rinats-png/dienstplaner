/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { kompetenzStand, kompetenzGilt, kompetenzMaengel, KOMPETENZ_VORLAUF } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, klickbar, Card, CardHead, Lab, Btn, Inp, Sel, Field, H1, Pill } from "../ui/bausteine.jsx";
import { heute, fDatum } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Icon } from "../gestalt/icons.jsx";
import { Kennzahlen } from "../gestalt/ansichten.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { kompetenzNachweis, mittelZuKompetenz, kompetenzLage } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";


/* ======================== QUALIFIKATIONSMATRIX ========================= */
/* ==========================================================================
   KOMPETENZEN

   Was jemand an einer bestimmten Sache darf. Die Ansicht führt drei Dinge
   zusammen, die bisher nebeneinanderlagen: das Betriebsmittel, die
   Einweisung darauf und die Dienstart, für die sie Voraussetzung ist.
   ========================================================================== */
export const KOMPETENZ_ARTEN = [
  ["geraet", "Gerät", "Einweisung auf ein bestimmtes Betriebsmittel — § 4 MPBetreibV, § 12 BetrSichV"],
  ["anlage", "Anlage", "Freigabe für eine Anlage oder Spannungsebene, etwa eine Schaltberechtigung"],
  ["taetigkeit", "Tätigkeit", "Freigabe für eine Verrichtung ohne festes Gerät, etwa Behandlungspflege"],
];

export function Kompetenzen({ sitz, akt }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "staff.edit");
  const [neu, setNeu] = useState(null);
  const [offen, setOffen] = useState(null);
  const [aufgabe, setAufgabe] = useState(null);
  const lage = useMemo(() => kompetenzLage(m), [m]);
  const liste = m.kompetenzen || [];
  const mittel = m.betriebsmittel || [];

  const leer = { name: "", art: "geraet", betriebsmittelId: "", stufe: "",
    freigabeStelle: "", wiederholungMonate: "", grundlage: "", pflichtFuer: [], zugedacht: [] };

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Eine Qualifikation sagt, was jemand ist. Eine Kompetenz sagt, was jemand an einer bestimmten Sache darf — an diesem Gerät, an dieser Anlage. Das Recht verlangt die Einweisung je Gerät, nicht einmal im Leben."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(leer)}>Kompetenz anlegen</Btn>}>
        Kompetenzen</H1>

      <Kennzahlen min={180} kacheln={[
        { label: "Kompetenzen", wert: liste.length },
        { label: "Abgelaufen", wert: lage.abgelaufen.length, ton: lage.abgelaufen.length ? "danger" : "ok",
          hervor: lage.abgelaufen.length ? "danger" : undefined, sub: "Einsatz gesperrt, wo verlangt" },
        { label: "Laufen bald ab", wert: lage.bald.length, ton: lage.bald.length ? "warn" : "ok",
          sub: `in ${KOMPETENZ_VORLAUF} Tagen` },
        { label: "Fehlen", wert: lage.fehlt.length, ton: lage.fehlt.length ? "warn" : "ok",
          sub: "zugedacht, aber nicht erteilt" }]} />

      {liste.length === 0 ? (
        <Card>
          <Leer titel="Noch keine Kompetenz angelegt"
            text="Typische Fälle: die Einweisung auf ein Beatmungsgerät, die Schaltberechtigung für eine Anlage, die Freigabe für eine Tour. Wer eine Kompetenz an eine Dienstart hängt, verhindert die Einteilung ohne sie."
            aktion={darfPflegen && <Btn kind="primary" onClick={() => setNeu(leer)}>Kompetenz anlegen</Btn>} />
        </Card>
      ) : (
        <Card>
          <CardHead right={<Lab>{zahl(liste.length)} angelegt</Lab>}>Übersicht</CardHead>
          {liste.map((k, i) => {
            const bm = mittelZuKompetenz(m, k);
            const maengel = kompetenzMaengel(k);
            const traeger = m.personen.filter((p) => imDienst(p, heute())
              && kompetenzGilt(k, kompetenzNachweis(p, k.id), heute()));
            const auf = offen === k.id;
            return (
              <div key={k.id} style={{ borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div className="row" {...klickbar(() => setOffen(auf ? null : k.id))}
                  aria-expanded={auf}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{k.name || "Ohne Namen"}</div>
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3 }}>
                      {(KOMPETENZ_ARTEN.find((a) => a[0] === k.art) || [])[1] || "Tätigkeit"}
                      {bm ? ` · ${bm.name}${bm.kennung ? ` (${bm.kennung})` : ""}` : ""}
                      {k.freigabeStelle ? ` · Freigabe: ${k.freigabeStelle}` : ""}
                    </div>
                  </div>
                  <Pill size="sm" tone={traeger.length ? "ok" : "warn"}>{zahl(traeger.length)} Personen</Pill>
                  {(k.pflichtFuer || []).length > 0 && (
                    <Pill size="sm" tone="danger">
                      Voraussetzung für {k.pflichtFuer.map((id) =>
                        (m.dienstarten.find((d) => d.id === id) || {}).kurz || id).join(", ")}</Pill>)}
                  {k.wiederholungMonate
                    ? <Pill size="sm">alle {k.wiederholungMonate} Monate</Pill>
                    : <Pill size="sm">ohne Frist</Pill>}
                  {maengel.some((x) => x.schwere === "warn") && <Pill size="sm" tone="warn">unvollständig</Pill>}
                  <span aria-hidden="true" style={{ color: C.dimmer, display: "flex" }}>{auf ? <Icon n="chevron-unten" size={18} /> : <Icon n="chevron-rechts" size={18} />}</span>
                </div>

                {auf && (
                  <div style={{ padding: "0 22px 20px" }}>
                    {k.grundlage && (
                      <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
                        <b style={{ color: C.text }}>Grundlage:</b> {k.grundlage}</div>)}
                    {maengel.map((x, j) => (
                      <div key={j} style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.5,
                        color: x.schwere === "warn" ? C.warn : C.dim }}>{x.text}</div>))}

                    <Lab style={{ margin: "14px 0 8px" }}>Wer sie hat</Lab>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {m.personen.filter((p) => imDienst(p, heute())).map((p) => {
                        const st = kompetenzStand(k, kompetenzNachweis(p, k.id), heute());
                        const ton = st.stand === "gueltig" ? "ok" : st.stand === "laeuft_ab" ? "warn"
                          : st.stand === "abgelaufen" ? "danger" : null;
                        if (!ton && !darfPflegen) return null;
                        const beschriftung = `${p.nachname}, ${p.vorname.slice(0, 1)}.`;
                        if (!darfPflegen) return <Pill key={p.id} size="sm" tone={ton}>{beschriftung}</Pill>;
                        return (
                          <Btn key={p.id} size="sm" kind={ton === "ok" ? "ok" : ton === "danger" ? "danger" : "plain"}
                            title={st.stand === "fehlt" ? "Kompetenz erteilen"
                              : st.bis ? `gültig bis ${fDatum(st.bis)}` : "unbefristet gültig"}
                            onClick={() => akt.setzeKompetenz(p.id, k.id, st.stand === "fehlt")}>
                            {beschriftung}
                            {st.stand === "abgelaufen" ? <><Icon n="x" size={13} strokeWidth={2.2} /><span className="nurLeser"> abgelaufen</span></>
                              : st.stand === "fehlt" ? null
                              : <><Icon n="haken" size={13} strokeWidth={2.2} /><span className="nurLeser"> {st.stand === "laeuft_ab" ? "läuft ab" : "gültig"}</span></>}</Btn>);
                      })}
                    </div>

                    {darfPflegen && (
                      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                        <Btn size="sm" onClick={() => setNeu({ ...k, bearbeiten: true })}>Bearbeiten</Btn>
                        <Btn size="sm" kind="danger" onClick={() => akt.loescheKompetenz(k.id)}>Löschen</Btn>
                      </div>)}
                  </div>)}
              </div>);
          })}
        </Card>)}

      {/* --- Vorbehaltene Aufgaben ---

          Sie stehen hier, weil sie dieselbe Frage beantworten wie eine
          Kompetenz — wer darf was —, nur eine Ebene höher: nicht an einem
          Gerät, sondern kraft Berufserlaubnis. */}
      <Card style={{ marginTop: 16 }}>
        <CardHead right={darfPflegen && !(m.aufgaben || []).length
          ? <Btn size="sm" onClick={akt.legeAufgabenVor}>Die drei aus § 4 PflBG anlegen</Btn>
          : <Lab>{zahl((m.aufgaben || []).length)} angelegt</Lab>}>
          Vorbehaltene Aufgaben</CardHead>
        <div style={{ padding: "0 22px 6px", fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
          Manche Tätigkeiten darf nur ausüben, wer eine bestimmte Berufserlaubnis hat.
          Anders als die Fachkraftquote — ein Anteil — ist das eine Anwesenheit:
          mindestens eine Person im Dienst, die es darf. Eine Schicht kann jede Quote
          erfüllen und trotzdem rechtswidrig sein, weil niemand da ist, der die
          Pflegeplanung verantworten darf.
        </div>
        {!(m.aufgaben || []).length ? (
          <div style={{ padding: "14px 22px 22px", fontSize: 13, color: C.dimmer }}>
            Noch keine hinterlegt.
          </div>
        ) : (m.aufgaben || []).map((a, i) => {
          const q = m.qualifikationen.find((x) => x.id === a.qualifikationId);
          return (
            <div key={a.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
              padding: "13px 22px", flexWrap: "wrap",
              borderTop: `1px solid ${C.lineSoft}`, marginTop: i === 0 ? 10 : 0 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, lineHeight: 1.5 }}>
                  {a.grundlage || "Ohne Grundlage"}</div>
              </div>
              {q ? <Pill size="sm" tone="ok">{q.kurz || q.name}</Pill>
                : <Pill size="sm" tone="warn">keine Qualifikation</Pill>}
              {a.mindestens > 1 && <Pill size="sm">mindestens {a.mindestens}</Pill>}
              <Pill size="sm" tone={(a.dienstarten || []).length ? undefined : "warn"}>
                {(a.dienstarten || []).length
                  ? `geprüft bei ${a.dienstarten.map((id) =>
                      (m.dienstarten.find((d) => d.id === id) || {}).kurz || id).join(", ")}`
                  : "keinem Dienst zugeordnet"}</Pill>
              {darfPflegen && (
                <Btn size="sm" onClick={() => setAufgabe({ ...a })}>Bearbeiten</Btn>)}
            </div>);
        })}
      </Card>

      {aufgabe && (
        <Sheet open onClose={() => setAufgabe(null)} width={600} titel="Vorbehaltene Aufgabe">
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Aufgabe">
              <Inp value={aufgabe.name} onChange={(e) => setAufgabe({ ...aufgabe, name: e.target.value })} /></Field>
            <Field label="Grundlage" hint="Woraus folgt der Vorbehalt?">
              <Inp value={aufgabe.grundlage || ""}
                onChange={(e) => setAufgabe({ ...aufgabe, grundlage: e.target.value })} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
              <Field label="Wer darf sie ausüben?"
                hint="Ohne Qualifikation lässt sich nicht prüfen, ob jemand im Dienst ist, der es darf.">
                <Sel value={aufgabe.qualifikationId || ""}
                  onChange={(e) => setAufgabe({ ...aufgabe, qualifikationId: e.target.value || null })}>
                  <option value="">— keine —</option>
                  {m.qualifikationen.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Sel></Field>
              <Field label="Mindestens" hint="Wie viele müssen im Dienst sein?">
                <Inp type="number" min={1} value={aufgabe.mindestens || 1}
                  onChange={(e) => setAufgabe({ ...aufgabe, mindestens: Number(e.target.value) })} /></Field>
            </div>
            <div>
              <Lab style={{ marginBottom: 9 }}>Bei diesen Diensten geprüft</Lab>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {m.dienstarten.map((d) => {
                  const an = (aufgabe.dienstarten || []).includes(d.id);
                  return (
                    <Btn key={d.id} size="sm" kind={an ? "primary" : "plain"} aria-pressed={an}
                      onClick={() => setAufgabe({ ...aufgabe, dienstarten: an
                        ? aufgabe.dienstarten.filter((x) => x !== d.id)
                        : [...(aufgabe.dienstarten || []), d.id] })}>
                      {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{d.name}</Btn>);
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 6 }}>
              <Btn kind="danger" onClick={() => { akt.loescheAufgabe(aufgabe.id); setAufgabe(null); }}>Löschen</Btn>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn kind="quiet" onClick={() => setAufgabe(null)}>Abbrechen</Btn>
                <Btn kind="primary" onClick={() => { akt.speichereAufgabe(aufgabe); setAufgabe(null); }}>Speichern</Btn>
              </div>
            </div>
          </div>
        </Sheet>)}

      {neu && (
        <Sheet open onClose={() => setNeu(null)} width={620}
          titel={neu.bearbeiten ? "Kompetenz bearbeiten" : "Kompetenz anlegen"}>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Bezeichnung" hint="Woran genau — nicht „Einweisung“, sondern „Beatmung Servo-u“.">
              <Inp value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })}
                placeholder="z. B. Beatmungsgerät Servo-u" autoFocus /></Field>

            <Field label="Art">
              <Sel value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>
                {KOMPETENZ_ARTEN.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Sel>
              <div style={{ fontSize: 12, color: C.dimmer, marginTop: 6, lineHeight: 1.5 }}>
                {(KOMPETENZ_ARTEN.find((a) => a[0] === neu.art) || [])[2]}</div>
            </Field>

            {neu.art === "geraet" && (
              <Field label="Betriebsmittel"
                hint={mittel.length ? "Die Einweisung gehört an das Gerät, auf das sie sich bezieht."
                  : "Es sind noch keine Betriebsmittel erfasst — unter Betriebsmittel anlegen."}>
                <Sel value={neu.betriebsmittelId || ""}
                  onChange={(e) => setNeu({ ...neu, betriebsmittelId: e.target.value })}>
                  <option value="">— keines zugeordnet —</option>
                  {mittel.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}{x.kennung ? ` (${x.kennung})` : ""}</option>))}
                </Sel></Field>)}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Freigebende Stelle" hint="Wer darf sie erteilen?">
                <Inp value={neu.freigabeStelle || ""}
                  onChange={(e) => setNeu({ ...neu, freigabeStelle: e.target.value })}
                  placeholder="z. B. Medizintechnik, Anlagenbetreiber" /></Field>
              <Field label="Wiederholung" hint="Leer heißt: gilt bis zur Rücknahme.">
                <Sel value={neu.wiederholungMonate === null ? "" : (neu.wiederholungMonate || "")}
                  onChange={(e) => setNeu({ ...neu,
                    wiederholungMonate: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">ohne Frist</option>
                  {[6, 12, 24, 36, 60].map((n) => <option key={n} value={n}>alle {n} Monate</option>)}
                </Sel></Field>
            </div>

            <Field label="Grundlage"
              hint="Woraus folgt sie? Ohne Grundlage sperrt sie zwar, lässt sich aber nicht begründen.">
              <Inp value={neu.grundlage || ""} onChange={(e) => setNeu({ ...neu, grundlage: e.target.value })}
                placeholder="z. B. § 4 MPBetreibV — Einweisung je Gerät" /></Field>

            <div>
              <Lab style={{ marginBottom: 9 }}>Voraussetzung für diese Dienste</Lab>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.5 }}>
                Wer für einen dieser Dienste eingeteilt wird und die Kompetenz nicht
                hat, wird abgewiesen — wie bei einer gesetzlich vorbehaltenen Qualifikation.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {m.dienstarten.map((d) => {
                  const an = (neu.pflichtFuer || []).includes(d.id);
                  return (
                    <Btn key={d.id} size="sm" kind={an ? "primary" : "plain"} aria-pressed={an}
                      onClick={() => setNeu({ ...neu, pflichtFuer: an
                        ? neu.pflichtFuer.filter((x) => x !== d.id)
                        : [...(neu.pflichtFuer || []), d.id] })}>
                      {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{d.name}</Btn>);
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn kind="quiet" onClick={() => setNeu(null)}>Abbrechen</Btn>
              <Btn kind="primary" disabled={!String(neu.name || "").trim()}
                onClick={() => { akt.speichereKompetenz(neu); setNeu(null); }}>Speichern</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}
