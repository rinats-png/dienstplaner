/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { darfEntscheiden, hindernisse, personTag } from "../lib/fachlogik.js";
import { einheitAm, imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays } from "../regelwerk.js";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { H1, Btn, Card, CardHead, Pill, Leer, Lab, Field, Sel, Inp } from "../ui/bausteine.jsx";
import { darf } from "../lib/berechtigung.js";
import { Leitraster } from "../gestalt/ansichten.jsx";
import { C } from "../farben.js";
import { Zelle, Sheet } from "../ui/leisten.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { NUM } from "../ui/thema.js";

/* ==========================================================================
   TAUSCHBÖRSE — offene Gesuche ohne festen Partner
   ========================================================================== */
export function Tauschboerse({ sitz, akt }) {
  const m = sitz.mandant;
  const ich = sitz.person;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ datum: "", partnerId: "", text: "" });
  const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && !a.partnerId);
  /* Wer über Anträge der Einheit entscheiden darf, sieht auch deren
     Tauschvorgänge — nicht nur die eigenen (Entscheidung C7). Es ist eine
     Frage der Anzeige: m.anfragen liefert der Server allen Rollen ohnehin
     vollständig aus (bestandFuerRolle filtert Personen und Abwesenheiten,
     nicht die Anfragen), und die Anträge-Ansicht filtert genauso. Alle
     anderen sehen weiter nur ihre eigenen. */
  const imUmfang = (a) => {
    if (a.personId === ich.id) return true;
    const pp = m.personen.find((x) => x.id === a.personId);
    return !!pp && darfEntscheiden(sitz, einheitAm(pp, a.von));
  };
  const meine = m.anfragen.filter((a) => a.typ === "tausch" && imUmfang(a))
    .sort((a, b) => (a.von < b.von ? 1 : a.von > b.von ? -1 : 0));
  const fremde = meine.some((a) => a.personId !== ich.id);
  const eigeneDienste = Array.from({ length: 45 }, (_, i) => addDays(heute(), i))
    .filter((d) => personTag(m, ich, d).dienstId);

  return (
    <div>
      <H1 sub="Wer keinen festen Tauschpartner hat, stellt ein offenes Gesuch ein. Alle im Betrieb sehen es und können sich melden. Erst danach entscheidet die Planung."
        right={darf(sitz, "req.create") && ich.imSchichtdienst !== false &&
          <Btn kind="primary" onClick={() => setNeu(true)}>Gesuch einstellen</Btn>}>Tauschbörse</H1>

      <Leitraster seiteBreite={360}
        haupt={<>
      <Card>
        <CardHead right={<Pill tone={boerse.length ? "accent" : "neutral"}>{boerse.length} offen</Pill>}>
          Offene Gesuche</CardHead>
        {boerse.length === 0
          ? <Leer titel="Keine offenen Gesuche" text="Sobald jemand einen Dienst zum Tausch anbietet, erscheint er hier für alle sichtbar." />
          : boerse.map((a, i) => {
            const p = m.personen.find((x) => x.id === a.personId);
            const t = p ? personTag(m, p, a.von) : null;
            const da = t && map[t.dienstId];
            const eigen = a.personId === ich.id;
            const schonGemeldet = (a.interessenten || []).includes(ich.id);
            const eigenerDienst = personTag(m, ich, a.von);
            return (
              <div key={a.id} className="row" style={{ display: "flex", gap: 15, padding: "16px 22px", alignItems: "flex-start",
                borderBottom: i < boerse.length - 1 ? `1px solid ${C.lineSoft}` : "none", flexWrap: "wrap" }}>
                <Zelle da={da} size={38} />
                <div style={{ flex: 1, minWidth: 210 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {fLang(a.von)}{da ? ` · ${da.name}` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                    {p ? `${p.vorname} ${p.nachname}` : "?"} sucht Tausch
                    {da ? ` · ${da.start}–${da.ende}` : ""}
                  </div>
                  {a.text && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 4 }}>„{a.text}"</div>}
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4 }}>
                    eingestellt {a.erstellt}
                    {(a.interessenten || []).length > 0 && ` · ${a.interessenten.length} Meldung${a.interessenten.length > 1 ? "en" : ""}`}
                  </div>
                  {(a.interessenten || []).length > 0 && darfEntscheiden(sitz, einheitAm(p, a.von)) && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
                      {a.interessenten.map((iid) => {
                        const ip = m.personen.find((x) => x.id === iid);
                        if (!ip) return null;
                        const konflikt = da ? hindernisse(m, ip, a.von, da).length > 0 : false;
                        return (
                          <Btn key={iid} size="sm" kind={konflikt ? "danger" : "ok"}
                            title={konflikt ? "Einteilung würde Vorgaben verletzen" : "Tausch mit dieser Person bestätigen"}
                            onClick={() => akt.mitWarnung(m, { titel: "Tausch bestätigen",
                              eintraege: [...(t && t.dienstId ? [{ personId: iid, datum: a.von, dienstId: t.dienstId }] : []),
                                ...(() => { const t2 = personTag(m, ip, a.von);
                                  return t2 && t2.dienstId && m.dienstarten.some((x) => x.id === t2.dienstId)
                                    ? [{ personId: a.personId, datum: a.von, dienstId: t2.dienstId }] : []; })()],
                              knopf: "Tausch bestätigen", immerZeigen: false,
                              ausfuehren: (best) => akt.tauschZuteilen(a.id, iid, best) })}>
                            {konflikt ? <Icon n="warnung" size={14} /> : <Icon n="haken" size={14} />}{ip.nachname}
                          </Btn>);
                      })}
                    </div>)}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {eigen
                    ? <Btn size="sm" kind="quiet" onClick={() => akt.zieheAntragZurueck(a.id)}>Zurückziehen</Btn>
                    : ich.imSchichtdienst !== false && (
                      schonGemeldet
                        ? <Btn size="sm" kind="quiet" onClick={() => akt.tauschAbmelden(a.id)}>Meldung zurücknehmen</Btn>
                        : <Btn size="sm" kind="primary" onClick={() => akt.tauschMelden(a.id)}>Ich übernehme</Btn>)}
                </div>
                {!eigen && eigenerDienst.dienstId && (
                  <div style={{ width: "100%", fontSize: 12, color: C.warn }}>
                    Du hast an diesem Tag bereits {(map[eigenerDienst.dienstId] || {}).name} — bei einer
                    Meldung würden die Dienste getauscht.
                  </div>)}
              </div>);
          })}
      </Card>

        </>}
        seite={<>
      {meine.length > 0 && (
        <Card>
          <CardHead right={fremde ? <Lab>Stand der Entscheidung</Lab> : undefined}>
            {fremde ? "Tauschvorgänge" : "Meine Tauschvorgänge"}</CardHead>
          {meine.map((a) => {
            const wer = a.personId === ich.id ? null : m.personen.find((x) => x.id === a.personId);
            return (
              <div key={a.id} className="listenzeile" style={{ padding: "13px 22px", flexWrap: "wrap" }}>
                <Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>{a.status}</Pill>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 160, ...NUM }}>
                  {fKurz(a.von)}{a.partnerId ? ` · mit ${(m.personen.find((x) => x.id === a.partnerId) || {}).nachname}` : " · offenes Gesuch"}
                  {wer && <span style={{ color: C.dim }}> · {wer.vorname} {wer.nachname}</span>}
                </span>
                {a.antwort && <span style={{ fontSize: 12.5, color: C.dim }}>{a.antwort}</span>}
              </div>);
          })}
        </Card>)}

        </>} />

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Tauschgesuch einstellen" width={560}>
        <div style={{ display: "grid", gap: 15 }}>
          <Field label="Dienst, den du abgeben möchtest">
            <Sel value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })}>
              <option value="">— wählen —</option>
              {eigeneDienste.map((d) => {
                const da = map[personTag(m, ich, d).dienstId];
                return <option key={d} value={d}>{fLang(d)} — {da ? da.name : ""}</option>; })}
            </Sel></Field>
          <Field label="Tauschpartner" hint="Ohne Auswahl wird das Gesuch für alle sichtbar eingestellt.">
            <Sel value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>
              <option value="">— offenes Gesuch für alle —</option>
              {m.personen.filter((p) => p.id !== ich.id && imDienst(p, heute()) && p.imSchichtdienst !== false)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}
            </Sel></Field>
          <Field label="Anmerkung"><Inp value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })}
            placeholder="z. B. Familienfeier, tausche gern gegen einen Spätdienst" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.datum} onClick={() => {
              akt.stelleAntrag({ typ: "tausch", von: f.datum, bis: f.datum,
                partnerId: f.partnerId || null, text: f.text, interessenten: [] });
              setF({ datum: "", partnerId: "", text: "" }); setNeu(false); }}>Einstellen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
