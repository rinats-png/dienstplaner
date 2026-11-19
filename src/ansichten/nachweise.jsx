/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo, useState } from "react";
import { nachweisLage, nachweisStand } from "../lib/fachlogik.js";
import { imDienst, NACHWEIS_VORLAUF } from "../../server/lib/fachpruefung.mjs";
import { heute, fKurz } from "../lib/datum.js";
import { H1, Seg, Card, Leer, Pill, Btn } from "../ui/bausteine.jsx";
import { Kennzahlen } from "../gestalt/ansichten.jsx";
import { C } from "../farben.js";
import { darf } from "../lib/berechtigung.js";

/* =============================== NACHWEISE ============================== */
export function Nachweise({ sitz, akt }) {
  const m = sitz.mandant;
  const nl = useMemo(() => nachweisLage(m), [m]);
  const [f, setF] = useState("alle");
  const alleZeilen = useMemo(() => m.personen.filter((p) => imDienst(p, heute()))
    .flatMap((p) => p.qualifikationen.map((q) => ({ person: p, ...nachweisStand(m, p, q) })))
    .filter((x) => x.qual), [m]);
  const gezeigt = alleZeilen.filter((x) => f === "alle" ? true
    : f === "kritisch" ? (x.stand === "abgelaufen" || x.stand === "fehlt")
    : f === "bald" ? x.stand === "laeuft_ab" : x.stand === "gueltig")
    .sort((a, b) => (a.tage === undefined ? 9e9 : a.tage) - (b.tage === undefined ? 9e9 : b.tage));

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Sachkunde, Erste Hilfe, Führungszeugnis und Fahrerlaubnis laufen ab. Ein abgelaufener Nachweis zählt für die Besetzung nicht mehr mit — die Prüfung schlägt an, bevor jemand ohne gültige Qualifikation im Dienst steht.">
        Nachweise</H1>

      <Kennzahlen min={190} kacheln={[
        { label: "Abgelaufen", wert: nl.abgelaufen.length, ton: nl.abgelaufen.length ? "danger" : "ok",
          hervor: nl.abgelaufen.length ? "danger" : undefined, sub: "zählen nicht mehr für die Besetzung" },
        { label: "Laufen bald ab", wert: nl.bald.length, ton: nl.bald.length ? "warn" : "ok",
          sub: `in den nächsten ${NACHWEIS_VORLAUF} Tagen` },
        { label: "Fehlen", wert: nl.fehlt.length, ton: nl.fehlt.length ? "warn" : "ok", sub: "pflichtig, aber nicht hinterlegt" },
        { label: "Gültig", wert: alleZeilen.filter((x) => x.stand === "gueltig").length, ton: "ok" }]} />

      <div style={{ margin: "0 0 14px" }}>
        <Seg value={f} onChange={setF} options={[{ id: "alle", label: "Alle" },
          { id: "kritisch", label: `Kritisch · ${nl.abgelaufen.length + nl.fehlt.length}` },
          { id: "bald", label: `Bald · ${nl.bald.length}` }, { id: "gueltig", label: "Gültig" }]} />
      </div>

      <Card>
        {gezeigt.length === 0
          ? <Leer titel="Nichts in dieser Kategorie" text="Wechsle den Filter, um andere Nachweise zu sehen." />
          : gezeigt.slice(0, 60).map((x, i) => {
            const tone = x.stand === "abgelaufen" ? "danger" : x.stand === "laeuft_ab" ? "warn"
              : x.stand === "fehlt" ? "warn" : "ok";
            return (
              <div key={i} className="row" style={{ display: "flex", alignItems: "center", gap: 16,
                padding: "14px 22px", borderBottom: i < gezeigt.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                flexWrap: "wrap" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0,
                  background: tone === "danger" ? C.danger : tone === "warn" ? C.warn : "transparent" }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{x.person.nachname}, {x.person.vorname}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer }}>{x.qual.name}</div>
                </div>
                <Pill size="sm" tone={tone}>
                  {x.stand === "abgelaufen" ? `abgelaufen ${fKurz(x.ablauf)}`
                    : x.stand === "laeuft_ab" ? `noch ${x.tage} Tage`
                    : x.stand === "fehlt" ? (x.nurStatus ? "nicht bestätigt" : "nicht hinterlegt")
                    : x.nurStatus ? "liegt vor"
                    : x.unbefristet ? "unbefristet" : `bis ${fKurz(x.ablauf)}`}</Pill>
                {x.datei && <Pill size="sm">Datei hinterlegt</Pill>}
                {x.nurStatus && <Pill size="sm">nur Status</Pill>}
                {darf(sitz, "staff.edit") && (
                  <Btn size="sm" onClick={() => akt.oeffneNachweis(x.person.id, x.qual.id)}>
                    {x.nurStatus ? (x.stand === "gueltig" ? "Ändern" : "Bestätigen")
                      : x.stand === "gueltig" && x.unbefristet ? "Ansehen" : "Erneuern"}</Btn>)}
              </div>);
          })}
      </Card>
    </div>);
}
