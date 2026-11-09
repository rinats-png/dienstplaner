/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays } from "../regelwerk.js";
import { heute } from "./datum.js";
import { uid } from "./format.js";
import { abwesenheitAm, personTag } from "./fachlogik.js";


/* ==========================================================================
   CHECKLISTEN
   Was zu einer Schicht gehört, aber nicht im Dienstplan steht: Rundgang um
   22 Uhr, Schlüsselübergabe, Kühlschranktemperatur, Medikamentenschrank
   geprüft.

   Zwei Entscheidungen, die den Unterschied machen:

   Erstens hängt eine Liste an der Dienstart, nicht an der Person. Wer die
   Nachtschicht fährt, bekommt die Nachtliste — unabhängig davon, wer es ist.

   Zweitens ist eine abgehakte Liste unveränderlich. Wer nachträglich einen
   Haken setzt, erzeugt einen zweiten Eintrag mit eigenem Zeitstempel. Eine
   rückwirkend änderbare Dokumentation wäre als Nachweis wertlos — und genau
   dafür wird sie in Pflege und Bewachung gebraucht.
   ========================================================================== */

/** Wann ist ein Punkt fällig? */
export const CHECK_ZEITPUNKTE = {
  beginn: { label: "Zu Dienstbeginn", kurz: "Beginn", rang: 1 },
  waehrend: { label: "Im Dienstverlauf", kurz: "laufend", rang: 2 },
  ende: { label: "Vor Dienstende", kurz: "Ende", rang: 3 },
  uhrzeit: { label: "Zu fester Uhrzeit", kurz: "Uhrzeit", rang: 2 },
};

/** Vorlagen je Branche — als Startpunkt, nicht als Vorschrift. */
export const CHECK_VORLAGEN = {
  sicherheit: [
    { text: "Schlüsselübergabe vollständig", zeitpunkt: "beginn", pflicht: true },
    { text: "Funkgerät geprüft und geladen", zeitpunkt: "beginn", pflicht: true },
    { text: "Meldungen der Vorschicht gelesen", zeitpunkt: "beginn", pflicht: true },
    { text: "Rundgang Außenbereich", zeitpunkt: "uhrzeit", uhrzeit: "22:00", pflicht: true },
    { text: "Rundgang Innenbereich", zeitpunkt: "uhrzeit", uhrzeit: "02:00", pflicht: true },
    { text: "Alle Zugänge verschlossen", zeitpunkt: "ende", pflicht: true },
    { text: "Vorkommnisse eingetragen", zeitpunkt: "ende", pflicht: true },
  ],
  pflege: [
    { text: "Übergabe der Vorschicht entgegengenommen", zeitpunkt: "beginn", pflicht: true },
    { text: "Betäubungsmittelschrank geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Notfallkoffer vollständig", zeitpunkt: "beginn", pflicht: false },
    { text: "Medikamentenstellung kontrolliert", zeitpunkt: "waehrend", pflicht: true },
    { text: "Dokumentation auf dem aktuellen Stand", zeitpunkt: "ende", pflicht: true },
    { text: "Übergabe an die Folgeschicht", zeitpunkt: "ende", pflicht: true },
  ],
  klinik: [
    { text: "Übergabe entgegengenommen", zeitpunkt: "beginn", pflicht: true },
    { text: "Gerätecheck durchgeführt", zeitpunkt: "beginn", pflicht: true },
    { text: "Betäubungsmittelbuch geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Dokumentation vollständig", zeitpunkt: "ende", pflicht: true },
  ],
  industrie: [
    { text: "Anlage auf Betriebsbereitschaft geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Schutzeinrichtungen kontrolliert", zeitpunkt: "beginn", pflicht: true },
    { text: "Schichtbuch gelesen", zeitpunkt: "beginn", pflicht: false },
    { text: "Anlage übergabefähig", zeitpunkt: "ende", pflicht: true },
    { text: "Schichtbuch geschrieben", zeitpunkt: "ende", pflicht: true },
  ],
};

/** Die Liste, die für diesen Dienst an diesem Tag gilt. */
export function checkliste(m, dienstId, datum) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da || !da.checkliste || !da.checkliste.length) return [];
  return da.checkliste
    .filter((c) => !c.nurWochentags || ![0, 6].includes(new Date(datum + "T12:00").getDay()))
    .slice()
    .sort((a, b) => {
      const ra = CHECK_ZEITPUNKTE[a.zeitpunkt] || CHECK_ZEITPUNKTE.waehrend;
      const rb = CHECK_ZEITPUNKTE[b.zeitpunkt] || CHECK_ZEITPUNKTE.waehrend;
      if (ra.rang !== rb.rang) return ra.rang - rb.rang;
      return (a.uhrzeit || "").localeCompare(b.uhrzeit || "");
    });
}

/** Schlüssel für die Erledigungen einer Person an einem Tag. */
export const checkSchluessel = (personId, datum, dienstId) => `${personId}|${datum}|${dienstId}`;

/**
 * Stand einer Liste. Gibt je Punkt zurück, ob und wann er erledigt wurde —
 * und ob nachträglich, was gesondert ausgewiesen wird.
 */
export function checkStand(m, personId, datum, dienstId) {
  const punkte = checkliste(m, dienstId, datum);
  if (!punkte.length) return null;
  const erledigt = (m.checks || {})[checkSchluessel(personId, datum, dienstId)] || {};
  const zeilen = punkte.map((c) => {
    const e = erledigt[c.id];
    return { ...c, erledigt: !!e, zeit: e ? e.zeit : null,
      nachtraeglich: e ? !!e.nachtraeglich : false, notiz: e ? e.notiz || "" : "" };
  });
  const pflicht = zeilen.filter((z) => z.pflicht);
  return {
    zeilen, gesamt: zeilen.length,
    fertig: zeilen.filter((z) => z.erledigt).length,
    pflichtGesamt: pflicht.length,
    pflichtFertig: pflicht.filter((z) => z.erledigt).length,
    vollstaendig: pflicht.every((z) => z.erledigt),
    anteil: zeilen.length ? Math.round((zeilen.filter((z) => z.erledigt).length / zeilen.length) * 100) : 0,
  };
}

/**
 * Offene Pflichtpunkte abgelaufener Dienste. Das ist die Zahl, die eine
 * Leitung interessiert — nicht wer wie viele Haken gesetzt hat, sondern wo
 * eine Dokumentation fehlt.
 */
export function offeneChecks(m, tage) {
  const out = [];
  const n = tage || 3;
  for (let i = 1; i <= n; i++) {
    const d = addDays(heute(), -i);
    for (const p of m.personen) {
      if (!imDienst(p, d)) continue;
      const t = personTag(m, p, d);
      if (!t || !t.dienstId || t.dienstId === "F") continue;
      if (abwesenheitAm(m, p.id, d)) continue;
      const st = checkStand(m, p.id, d, t.dienstId);
      if (st && !st.vollstaendig)
        out.push({ datum: d, person: p, dienstId: t.dienstId, stand: st,
          fehlend: st.pflichtGesamt - st.pflichtFertig });
    }
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Ein Punkt, frisch angelegt. */
export const neuerCheckpunkt = (text, zeitpunkt) => ({
  id: uid("ck"), text: text || "", zeitpunkt: zeitpunkt || "beginn",
  pflicht: true, uhrzeit: null, nurWochentags: false,
});
