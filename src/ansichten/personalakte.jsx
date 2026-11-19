/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute, fKurz, MON, DOW } from "../lib/datum.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { urlaubskonto, istStunden, sollStunden, stundenkonto, nachtJahr, darfEinheit, kontoSichtbar, abwArt, teilzeitProfil, kontoVerlauf, ABW, eintrittUebernehmen } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { pad, alterAm } from "../regelwerk.js";
import { Sheet } from "../ui/leisten.jsx";
import { Pill, KpiRow, Kpi, Lab, Field, Inp, Sel, Schalter, Card, Btn } from "../ui/bausteine.jsx";
import { rollenName } from "../lib/rollen.js";
import { n1, sgn, sgnIst, n1Ist } from "../lib/format.js";
import { ISTDATEN_TEXT, stundenText, pruefHinweis, pruefFallText, vormonateMitPruefung } from "../istdaten.js";
import { C } from "../farben.js";
import { Icon } from "../gestalt/icons.jsx";
import { BESCHAEFTIGUNGSMODELLE, modellVon } from "../beschaeftigung.js";
import { Einwilligungen } from "../ansichten/einwilligungen.jsx";
import { Hinweisband, Fehlerband } from "../gestalt/ansichten.jsx";
import { NUM, lesbar } from "../ui/thema.js";
import { LinienDiagramm } from "../ui/diagramme.jsx";
import { entgeltHinweis, entgeltZusatz } from "../abwesenheitsarten.js";
import { EinsatzregelListe } from "./einsatzregelliste.jsx";



export function Personalakte({ sitz, personId, ym, onClose, akt }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const [form, setForm] = useState({ art: "urlaub", von: heute(), bis: heute() });
  const [vers, setVers] = useState({ einheitId: "", ab: heute() });
  const [fehler, setFehler] = useState(null);
  const [eintrittRoh, setEintrittRoh] = useState((p && p.eintritt) || "");
  const [eintrittFehler, setEintrittFehler] = useState(null);
  if (!p) return null;
  const jahr = Number(ym.slice(0, 4)), d0 = heute();
  const e = m.einheiten.find((x) => x.id === einheitAm(p, d0));
  const url = urlaubskonto(m, p, jahr), ist = istStunden(m, p, ym), soll = sollStunden(m, p, ym);
  const kto = stundenkonto(m, p, ym), nacht = nachtJahr(m, p, jahr);
  const editierbar = darf(sitz, "staff.edit") || darfEinheit(sitz, einheitAm(p, d0));
  const zeigt = kontoSichtbar(sitz, p);
  const nm = Array.from({ length: 12 }, (_, i) => istStunden(m, p, `${jahr}-${pad(i + 1)}`).nacht);
  const maxN = Math.max(1, ...nm);

  const eintragen = () => {
    setFehler(null);
    if (form.bis < form.von) return setFehler("Das Ende liegt vor dem Beginn.");
    const k = m.abwesenheiten.find((a) => a.personId === p.id && a.von <= form.bis && form.von <= a.bis);
    if (k) return setFehler(`Überschneidet sich mit ${abwArt(k.art).label} vom ${fKurz(k.von)} bis ${fKurz(k.bis)}. Bestehenden Eintrag zuerst kürzen oder löschen.`);
    akt.neueAbwesenheit(p.id, form.art, form.von, form.bis);
  };

  return (
    <Sheet open onClose={onClose} titel={`${p.vorname} ${p.nachname}`} width={800}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
        <Pill tone="accent">{e ? e.name : "ohne Zuordnung"}</Pill>{p.funktion && <Pill>{p.funktion}</Pill>}
        {(p.eintritt === null || p.eintritt === "") && <Pill tone="warn">Eintritt fehlt</Pill>}
        {(m.standorte || []).length > 1 && <Pill>{((m.standorte || []).find((x) => x.id === (e || {}).standortId) || {}).name || "—"}</Pill>}
        {p.springer && <Pill tone="violet">Springer</Pill>}
        {p.teilzeit && p.teilzeit.aktiv && <Pill>Teilzeit {Math.round(teilzeitProfil(m, p).quote * 100)} %</Pill>}
        <Pill tone="violet">{rollenName(m, p.rolle)}</Pill><Pill>{n1(p.wochenstunden)} h/Woche</Pill>
        {p.austritt && <Pill tone="danger">ausgetreten {fKurz(p.austritt)}</Pill>}
      </div>

      {zeigt && (<>
        <KpiRow min={170}>
          <Kpi label="Resturlaub" value={url.rest} unit="Tage" tone={url.rest < 5 ? "warn" : "ok"} sub={`${url.genommen} von ${url.anspruch} genommen`} />
          <Kpi label={`Stunden ${MON[Number(ym.slice(5)) - 1]}`} value={ist.nichtVerfuegbar ? "–" : sgn(ist.gesamt - soll)} unit="h"
            tone={ist.nichtVerfuegbar ? undefined : Math.abs(ist.gesamt - soll) < 7 ? "ok" : "warn"}
            sub={ist.nichtVerfuegbar ? ISTDATEN_TEXT : `${n1(ist.gesamt)} von ${n1(soll)} h`} />
          <Kpi label="Konto kumuliert" value={sgnIst(kto)} unit="h" tone={kto === null ? undefined : Math.abs(kto) < 18 ? "ok" : "warn"} />
          <Kpi label={`Nachtstunden ${jahr}`} value={n1Ist(nacht.stunden)} unit="h" sub={`${stundenText(nacht.anzahl, String)} Nachtdienste`} />
        </KpiRow>
        <div style={{ margin: "24px 0" }}>
          <Lab style={{ marginBottom: 11 }}>Nachtarbeit im Jahresverlauf</Lab>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
            {nm.map((v, i) => (<div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div title={`${MON[i]}: ${n1Ist(v)} h`} style={{ height: Math.max(3, ((v || 0) / maxN) * 56),
                background: i === Number(ym.slice(5)) - 1 ? C.accent : "rgba(43,52,64,.24)", borderRadius: "5px 5px 0 0",
                transition: "height .4s" }} />
              <div style={{ fontSize: 10, color: C.dimmer, marginTop: 5 }}>{MON[i].slice(0, 1)}</div></div>))}
          </div>
        </div>
      </>)}

      <Lab style={{ marginBottom: 11 }}>Qualifikationen</Lab>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {m.qualifikationen.map((q) => { const an = p.qualifikationen.includes(q.id);
          return (<button key={q.id} disabled={!editierbar} onClick={() => akt.toggleQual(p.id, q.id)} className="btn btn-sm"
            style={{ background: an ? `${q.farbe}1C` : C.bg, color: an ? q.farbe : C.dimmer, fontWeight: 600 }}>
            {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{q.name}</button>); })}
      </div>

      {editierbar && (<>
        <Lab style={{ marginBottom: 11 }}>Beschäftigungsform</Lab>
        <div className="karte" style={{ padding: 16, marginBottom: 22 }}>
          <div style={{ display: "grid", gap: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Wochenstunden" hint={`Vollzeit sind ${n1(m.einstellungen.sollWochenstunden)} h.`}>
                <Inp type="number" step="0.5" value={p.wochenstunden}
                  onChange={(e) => akt.setzePerson(p.id, "wochenstunden", Number(e.target.value))} /></Field>
              <Field label="Verteilung">
                <Sel value={p.springer ? "springer" : (p.teilzeit && p.teilzeit.aktiv ? p.teilzeit.modus : "voll")}
                  onChange={(e) => akt.setzeBeschaeftigung(p.id, e.target.value)}>
                  <option value="voll">Volle Rotation</option>
                  <option value="quote">Teilzeit · anteilige Dienste</option>
                  <option value="wochentage">Teilzeit · feste Wochentage</option>
                  <option value="springer">Springerpool · keine Rotation</option>
                </Sel></Field>
            </div>
            {/* Die Rohdaten pflegt, wer Personal bearbeitet (staff.edit). Die
                Schichtverantwortung bekommt sie nicht mehr (Commit S1) und sieht
                stattdessen die neutralen Einsatzregeln. */}
            {!darf(sitz, "staff.edit") ? <EinsatzregelListe regeln={p.planungsregeln} /> : (<>
            {/* Das Modell ist optional. Fehlt es, leitet die Anwendung es aus der
                Verteilung ab (Voll- oder Teilzeit); hinterlegt wird nur, was von
                Regeln gebraucht wird — etwa Werkstudent. Nur mit staff.edit:
                Die Schichtverantwortung bekommt beide Felder nicht
                (RECHTEMATRIX.md ²³). */}
            {/* Datenreview PR #130 (2): Eintrittsdatum bearbeiten. Ein leeres Feld überschreibt kein bestehendes
                Datum, ein gültiges wird übernommen, ein ungültiges ist ein Fehler (eintrittUebernehmen). Ohne
                Eintritt ist die Person an keinem Tag im Dienst (kein Plan, kein Soll, keine Abrechnung). */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <Field label="Eintrittsdatum"
                hint={p.eintritt ? `Bisher ${fKurz(p.eintritt)}. Leer lassen ändert nichts.`
                  : "Eintritt fehlt: Die Person wird erst ab dem Eintrittsdatum geplant und abgerechnet."}>
                <Inp type="date" value={eintrittRoh} aria-invalid={eintrittFehler ? "true" : undefined}
                  onChange={(e) => { setEintrittRoh(e.target.value); setEintrittFehler(null); }} /></Field>
              <Btn onClick={() => {
                const r = eintrittUebernehmen(p, eintrittRoh);
                if (!r.ok) { setEintrittFehler(r.fehler); return; }
                akt.setzeEintritt(p.id, eintrittRoh);
              }}>Übernehmen</Btn>
            </div>
            {eintrittFehler && <div role="alert" style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>{eintrittFehler}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Beschäftigungsmodell"
                hint={p.beschaeftigungsmodell ? "Regeln, die an dieses Modell gebunden sind, wirken auf diese Person."
                  : `Nicht angegeben — gilt als ${(BESCHAEFTIGUNGSMODELLE.find((x) => x.id === modellVon(p)) || {}).label}.`}>
                <Sel value={p.beschaeftigungsmodell || ""}
                  onChange={(e) => akt.setzePerson(p.id, "beschaeftigungsmodell", e.target.value || null)}>
                  <option value="">Nicht angegeben</option>
                  {BESCHAEFTIGUNGSMODELLE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </Sel></Field>
              {(p.beschaeftigungsmodell === "minijob" || p.beschaeftigungsmodell === "midijob") && (
                <Field label="Zulässige Stunden je Monat"
                  hint="Aus der Verdienstgrenze und dem Stundenlohn zu berechnen. CENTRIC kennt keinen Lohn.">
                  <Inp type="number" step="0.5" value={p.stundenGrenzeMonat == null ? "" : p.stundenGrenzeMonat}
                    onChange={(e) => akt.setzePerson(p.id, "stundenGrenzeMonat", e.target.value === "" ? null : Number(e.target.value))} /></Field>)}
            </div>
            {/* --- Schutzvorschriften ---

                Ohne diese drei Angaben kann die Prüfung nicht wissen, dass
                ein Plan für diese Person unzulässig ist. Sie sind bewusst
                sparsam gehalten: Ein Geburtsdatum, zwei Merkmale — mehr
                braucht es nicht, und mehr gehört auch nicht erfasst. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Geburtsdatum"
                hint="Nur für den Jugendarbeitsschutz. Bleibt leer, wenn nicht nötig.">
                <Inp type="date" value={p.geburtstag || ""}
                  onChange={(e) => akt.setzePerson(p.id, "geburtstag", e.target.value || null)} /></Field>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, justifyContent: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <Schalter an={!!p.mutterschutz}
                    onChange={() => akt.setzePerson(p.id, "mutterschutz", !p.mutterschutz)} />
                  <span style={{ fontSize: 13.5 }}>Mutterschutz</span></label>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <Schalter an={!!p.schwerbehindert}
                    onChange={() => akt.setzePerson(p.id, "schwerbehindert", !p.schwerbehindert)} />
                  <span style={{ fontSize: 13.5 }}>Schwerbehinderung</span></label>
              </div>
            </div>
            {(p.mutterschutz || p.schwerbehindert
              || (alterAm(p.geburtstag, heute()) !== null && alterAm(p.geburtstag, heute()) < 18)) && (
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55,
                background: C.accentLight, padding: "10px 13px", borderRadius: 8 }}>
                {alterAm(p.geburtstag, heute()) !== null && alterAm(p.geburtstag, heute()) < 18
                  && "Unter 18: keine Nachtarbeit, höchstens acht Stunden täglich (JArbSchG). "}
                {p.mutterschutz
                  && "Mutterschutz: Nacht- und Sonntagsarbeit nur mit Einwilligung und Genehmigung (MuSchG). "}
                {p.schwerbehindert
                  && "Schwerbehinderung: auf Verlangen von Mehrarbeit über acht Stunden freizustellen (§ 207 SGB IX). "}
                Die Prüfung meldet Verstöße unter „Schutzvorschriften".
              </div>)}
            {p.mutterschutz && <Einwilligungen p={p} akt={akt} />}
            </>)}

            {p.teilzeit && p.teilzeit.aktiv && p.teilzeit.modus === "wochentage" && (
              <div>
                <Lab style={{ marginBottom: 8 }}>Arbeitstage</Lab>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {DOW.map((wt, i) => {
                    const an = (p.teilzeit.wochentage || []).includes(i);
                    return <button key={i} onClick={() => akt.toggleWochentag(p.id, i)} className="btn btn-sm"
                      style={{ background: an ? "rgba(43,52,64,.12)" : C.bg,
                        color: an ? C.text : C.dimmer, fontWeight: 600, minWidth: 44 }}>{wt}</button>; })}
                </div>
              </div>)}
            {(() => { const prof = teilzeitProfil(m, p);
              return (
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
                  {p.springer
                    ? "Springer folgen keiner Schichtfolge. Sie werden gezielt eingeteilt und stehen in der Ersatzsuche ganz oben."
                    : prof.teilzeit
                      ? `Leistet ${prof.dienste} von ${prof.gesamt} Diensten je Zyklus — das entspricht ${Math.round(prof.quote * 100)} Prozent. Die Dienste werden gleichmäßig über den Zyklus verteilt.`
                      : "Volle Rotation nach der Schichtfolge der Einheit."}
                </div>); })()}
          </div>
        </div>

        <Lab style={{ marginBottom: 11 }}>Stundenkonto über zwölf Monate</Lab>
        {zeigt && (() => { const h = pruefHinweis(m, ym, p.id); return h && (
          <Hinweisband ton="warn" titel={`${h.anzahl} Ist-Zeit${h.anzahl === 1 ? "" : "en"} zur Prüfung · ${h.monat}`} style={{ marginBottom: 14 }}>
            {h.faelle.map((f) => `${fKurz(f.datum)} (${pruefFallText(f.art)})`).join(", ")}. Bestätigen unter Abrechnungsdaten · Stempelbefunde.
          </Hinweisband>); })()}
        {zeigt && (() => { const v = vormonateMitPruefung(m, ym, p.id); return v.length > 0 && (
          <Hinweisband ton="warn" titel="Vormonate mit offenen Prüffällen" style={{ marginBottom: 14 }}>
            {v.map((x) => `${x.monat} (${x.anzahl})`).join(", ")} — dort zählt im Stundenkonto vorläufig die Planzeit.
          </Hinweisband>); })()}
      <Card style={{ padding: 22, marginBottom: 22 }}>
        {(() => {
          /* Hier stand kv.punkte[11].konto und kv.richtung — kontoVerlauf()
             liefert aber eine schlichte Liste, und deren Einträge heißen kto,
             nicht konto. Der Zugriff auf das nicht vorhandene punkte warf
             „Cannot read properties of undefined (reading '11')" und riss die
             gesamte Personalakte mit: Die Ansicht ist nie aufgegangen.

             Richtung und Trend werden jetzt aus der Liste gerechnet, statt
             sie von der Funktion zu erwarten. */
          const kv = kontoVerlauf(m, p, ym, 12);
          const g = m.einstellungen.ausgleichGrenze || 40;
          const letzter = kv.length ? kv[kv.length - 1].kto : 0;
          const erster = kv.length ? kv[0].kto : 0;
          const trend = Math.round((letzter - erster) * 10) / 10;
          /* Unterhalb von fünf Stunden über zwölf Monate ist das Rauschen,
             keine Entwicklung. */
          const richtung = Math.abs(trend) < 5 ? "stabil" : trend > 0 ? "steigend" : "fallend";
          return (<>
            <div style={{ display: "flex", gap: 22, marginBottom: 18, flexWrap: "wrap", alignItems: "baseline" }}>
              <div><Lab>Aktuell</Lab><div style={{ fontSize: 26, fontWeight: 650, ...NUM,
                color: Math.abs(letzter) > g ? C.warn : C.text }}>
                {sgn(letzter)} h</div></div>
              <div><Lab>Entwicklung</Lab><div style={{ fontSize: 15, fontWeight: 600, marginTop: 5,
                color: richtung === "stabil" ? C.ok : richtung === "steigend" ? C.warn : C.accent }}>
                {richtung === "stabil" ? "stabil" : richtung === "steigend"
                  ? `steigend, ${sgn(trend)} h in zwölf Monaten`
                  : `fallend, ${sgn(trend)} h in zwölf Monaten`}</div></div>
            </div>
            <LinienDiagramm daten={kv.map((x) => ({ label: x.label, y: x.kto }))}
              farbe={C.accent} einheit=" h" />
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
              Das grüne Band ist der Bereich innerhalb der Ausgleichsgrenze von {n1(g)} h. Die Frage ist
              nicht der aktuelle Stand, sondern ob die Linie zurückläuft.
            </div>
          </>);
        })()}
      </Card>

      <Lab style={{ marginBottom: 11 }}>Notiz zur Planung</Lab>
      <Card style={{ padding: 18, marginBottom: 22 }}>
        <textarea className="inp" rows={2} value={p.notiz || ""} disabled={!editierbar}
          placeholder="z. B. neu im Nachtdienst, ab Mai reduziert, kann Stapler fahren"
          onChange={(e) => akt.setzePersonNotiz(p.id, e.target.value)} />
        <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 9, lineHeight: 1.5 }}>
          Planungswissen, das sonst im Kopf bleibt. Sichtbar für alle mit Personalzugriff, nicht für
          die Person selbst.
        </div>
      </Card>

      <Lab style={{ marginBottom: 11 }}>Einsatzeinschränkungen</Lab>
        <div className="karte" style={{ padding: 16, marginBottom: 22 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {[["keineNacht", "Keine Nachtdienste"], ["keinAlleindienst", "Darf nicht allein eingeteilt werden"]].map(([k, l]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
                <input type="checkbox" checked={!!(p.einschraenkungen || {})[k]}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, k, e.target.checked)} />
                <span style={{ fontSize: 13.5 }}>{l}</span></label>))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Höchstzahl Dienste je Woche" hint="Leer bedeutet keine Begrenzung.">
                <Inp type="number" min={0} value={(p.einschraenkungen || {}).maxDiensteWoche || ""}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "maxDiensteWoche", e.target.value ? Number(e.target.value) : null)} /></Field>
              {darf(sitz, "staff.edit") && <Field label="Wiedereingliederung bis" hint="Leer beendet die Stufenregelung.">
                <Inp type="date" value={((p.einschraenkungen || {}).wiedereingliederung || {}).bis || ""}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "wiedereingliederung", e.target.value
                    ? { von: heute(), bis: e.target.value, maxStundenWoche: ((p.einschraenkungen || {}).wiedereingliederung || {}).maxStundenWoche || 20 }
                    : null)} /></Field>}
            </div>
            {darf(sitz, "staff.edit") && (p.einschraenkungen || {}).wiedereingliederung && (
              <Field label="Zulässige Wochenstunden während der Wiedereingliederung">
                <Inp type="number" step="0.5" value={p.einschraenkungen.wiedereingliederung.maxStundenWoche}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "wiedereingliederung",
                    { ...p.einschraenkungen.wiedereingliederung, maxStundenWoche: Number(e.target.value) })} /></Field>)}
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
            Verstöße erscheinen in der Prüfung und in der Ersatzsuche werden betroffene Personen ausgeschlossen.
          </div>
        </div>
      </>)}

      <Lab style={{ marginBottom: 11 }}>Abwesenheiten {jahr}</Lab>
      {m.abwesenheiten.filter((a) => a.personId === p.id).length === 0 &&
        <div style={{ fontSize: 13, color: C.dimmer, marginBottom: 16 }}>Keine Einträge.</div>}
      {m.abwesenheiten.filter((a) => a.personId === p.id).sort((a, b) => (a.von < b.von ? -1 : 1)).map((a) => {
        const meta = abwArt(a.art), z = url.zeilen.find((r) => r.id === a.id);
        return (<div key={a.id} className="karte" style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "11px 14px", marginBottom: 8 }}>
          <div style={{ fontSize: 13.5 }}>
            <span style={{ color: lesbar(meta.farbe), fontWeight: 600 }}>{meta.label}</span>
            <span style={{ color: C.dim, marginLeft: 11, ...NUM }}>{fKurz(a.von)} – {fKurz(a.bis)}</span>
            {z && z.tage > 0 && <span style={{ color: C.dimmer, marginLeft: 11, ...NUM }}>{z.tage} Urlaubstage</span>}</div>
          {editierbar && <Btn size="sm" kind="danger" onClick={() => akt.loescheAbwesenheit(a.id)}>Löschen</Btn>}
        </div>); })}

      {editierbar && (<>
        <div style={{ paddingTop: 20, marginTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 13 }}>Abwesenheit eintragen</Lab>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 11, alignItems: "end" }}>
            <Field label="Art" hint={entgeltHinweis(abwArt(form.art)) || undefined}><Sel value={form.art} onChange={(e2) => setForm({ ...form, art: e2.target.value })}>
              {ABW.map((a) => <option key={a.id} value={a.id}>{a.label}{entgeltZusatz(a)}</option>)}</Sel></Field>
            <Field label="Von"><Inp type="date" value={form.von} onChange={(e2) => setForm({ ...form, von: e2.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={form.bis} onChange={(e2) => setForm({ ...form, bis: e2.target.value })} /></Field>
            <Btn kind="primary" onClick={eintragen}>Eintragen</Btn>
          </div>
          {fehler && <Fehlerband style={{ marginTop: 11 }}>{fehler}</Fehlerband>}
        </div>
        <div style={{ paddingTop: 20, marginTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 13 }}>Versetzung und Austritt</Lab>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 11, alignItems: "end", marginBottom: 12 }}>
            <Field label={`Neue ${m.einheitLabel}`}><Sel value={vers.einheitId} onChange={(e2) => setVers({ ...vers, einheitId: e2.target.value })}>
              <option value="">— wählen —</option>
              {m.einheiten.filter((x) => x.id !== einheitAm(p, d0)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Sel></Field>
            <Field label="Wirksam ab"><Inp type="date" value={vers.ab} onChange={(e2) => setVers({ ...vers, ab: e2.target.value })} /></Field>
            <Btn onClick={() => vers.einheitId && akt.versetze(p.id, vers.einheitId, vers.ab)}>Versetzen</Btn>
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 14, lineHeight: 1.45 }}>
            Vergangene Monate bleiben unverändert — die Zuordnung gilt erst ab dem Stichtag.</div>
          {p.zugehoerigkeit.length > 1 && <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 14 }}>
            Verlauf: {p.zugehoerigkeit.map((z) => `${fKurz(z.ab)} ${(m.einheiten.find((x) => x.id === z.einheitId) || {}).name || "?"}`).join(" → ")}</div>}
          {!p.austritt
            ? <Btn kind="danger" onClick={() => { const d = window.prompt("Austritt zum (JJJJ-MM-TT):", d0); if (d) akt.setzeAustritt(p.id, d); }}>Austritt eintragen</Btn>
            : <Btn onClick={() => akt.setzeAustritt(p.id, null)}>Austritt zurücknehmen</Btn>}
        </div>
      </>)}
    </Sheet>);
}
