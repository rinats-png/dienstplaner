/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { darfEntscheiden, abwArt } from "../lib/fachlogik.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { H1, Seg, Card, Leer, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { between } from "../regelwerk.js";
import { personTag } from "../lib/fachlogik.js";
import { Urlaubsrunde } from "./urlaubsrunde.jsx";
import { Kapazitaetsvorschau } from "./kapazitaetsvorschau.jsx";

/* ================================ ANTRÄGE ================================ */
export function Antraege({ sitz, akt }) {
  const m = sitz.mandant;
  const [reiter, setReiter] = useState("einzeln");
  const [f, setF] = useState("offen");
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const alle = m.anfragen.filter((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return p && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(p, heute())));
  });
  const gezeigt = alle.filter((a) => f === "alle" || a.status === f).sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));

  return (
    <div>
      <H1 sub="Urlaubsanträge und Tauschanfragen aus dem eigenen Zuständigkeitsbereich. Bei Genehmigung werden Abwesenheit beziehungsweise Tausch unmittelbar in den Plan übernommen."
        right={<Seg value={reiter} onChange={setReiter}
          options={[{ id: "einzeln", label: "Einzelanträge" }, { id: "runde", label: "Jahresurlaubsrunde" }]} />}>
        Anträge</H1>

      {reiter === "runde" ? <Urlaubsrunde sitz={sitz} akt={akt} /> : (<>
      <Kapazitaetsvorschau sitz={sitz} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Seg value={f} onChange={setF} options={[
          { id: "offen", label: `Offen · ${alle.filter((a) => a.status === "offen").length}` },
          { id: "genehmigt", label: "Genehmigt" }, { id: "abgelehnt", label: "Abgelehnt" }, { id: "alle", label: "Alle" }]} />
      </div>

      <Card>
        {gezeigt.length === 0
          ? <Leer titel="Nichts zu entscheiden" text="In dieser Ansicht liegen derzeit keine Vorgänge." />
          : gezeigt.map((a, i) => {
            const p = m.personen.find((x) => x.id === a.personId);
            const partner = a.partnerId ? m.personen.find((x) => x.id === a.partnerId) : null;
            const eh = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
            const t = a.typ === "tausch" ? personTag(m, p, a.von) : null;
            return (
              <div key={a.id} className="row" style={{ display: "flex", gap: 16, padding: "17px 22px",
                borderBottom: i < gezeigt.length - 1 ? `1px solid ${C.lineSoft}` : "none", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0,
                  background: a.status === "offen" ? C.warn : a.status === "genehmigt" ? C.ok : C.danger }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p.vorname} {p.nachname}</span>
                    <Pill size="sm">{eh ? eh.name : "—"}</Pill>
                    <Pill size="sm" tone={a.typ === "tausch" ? "violet" : "accent"}>
                      {a.typ === "tausch" ? "Tausch" : abwArt(a.art).label}</Pill>
                  </div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 5, ...NUM }}>
                    {a.typ === "tausch"
                      ? `${fLang(a.von)} · ${t && t.dienstId ? (map[t.dienstId] || {}).name : "kein Dienst"} · mit ${partner ? `${partner.vorname} ${partner.nachname}` : "unbekannt"}`
                      : `${fKurz(a.von)} bis ${fKurz(a.bis)} · ${between(a.von, a.bis) + 1} Kalendertage`}
                  </div>
                  {a.text && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 4 }}>„{a.text}"</div>}
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4 }}>gestellt {a.erstellt}</div>
                  {a.antwort && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>Antwort: {a.antwort}</div>}
                </div>
                {a.status === "offen" ? (
                  <div style={{ display: "flex", gap: 9 }}>
                    <Btn size="sm" kind="ok" onClick={() => akt.entscheideAntrag(a.id, true)}>Genehmigen</Btn>
                    <Btn size="sm" kind="danger" onClick={() => akt.entscheideAntrag(a.id, false)}>Ablehnen</Btn>
                  </div>
                ) : <Pill tone={a.status === "genehmigt" ? "ok" : "danger"}>{a.status === "genehmigt" ? "genehmigt" : "abgelehnt"}</Pill>}
              </div>);
          })}
      </Card>
      </>)}
    </div>);
}
