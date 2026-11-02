/* ==========================================================================
   TESTDATEN DER E2E-SUITE

   Erfunden. Ein Betrieb, zwei Bereiche, eine Person je Rolle, ein
   Dienstplan für heute und gestern. Zwei Personen tragen auffällige
   Stammdaten (Anschrift, Notfallkontakt, Krankheitsgrund) — die Suite
   prüft, dass sie bei Beschäftigten und Betriebsrat NICHT im DOM landen.
   ========================================================================== */

import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

export const RAUM = "e2e-probe";
export const BETRIEB = "Haus Lindenhof (E2E)";

/** Heute in Europa/Berlin — dieselbe Zeitzone, die die Browser der Suite haben. */
export const ZEITZONE = "Europe/Berlin";
export const heute = () => new Intl.DateTimeFormat("sv-SE", { timeZone: ZEITZONE }).format(new Date());
const tag = (n) => new Date(new Date(`${heute()}T00:00:00Z`).getTime() + n * 86400000)
  .toISOString().slice(0, 10);

/** Fremde, schützenswerte Werte. Kein Beschäftigten- oder Betriebsratsbildschirm darf sie zeigen. */
export const FREMD = {
  anschrift: "Kastanienweg 47",
  notfallkontakt: "Schwester 0171-5550199",
  geburtstag: "1990-11-17",
  geburtstagAnzeige: "17.11.1990",
  krankheitsgrund: "Bandscheibenvorfall",
  nachweis: "AU vom Hausarzt",
};

/** Personen-ID je Rolle. Die Zugänge werden auf genau diese Personen ausgestellt. */
export const PERSON = {
  leitung: "l1",
  planer: "p1",
  subplaner: "s1",
  mitarbeiter: "a1",
  /* eigene Person für das Offline-Stempeln: deren Stempel bleibt unberührt */
  mitarbeiterOffline: "a3",
  betriebsrat: "b1",
};

const person = (id, vorname, nachname, rolle, einheit, extra = {}) => ({
  id, vorname, nachname, funktion: rolle, email: `${id}@e2e.invalid`,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], eintritt: "2020-01-01", austritt: null,
  wochenstunden: 38.5, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
  qualifikationen: [], qualNachweise: [], teilzeit: null, springer: false,
  einschraenkungen: {}, verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) },
  nachweise: [], kontrastmodus: false, notiz: "", einarbeitung: null,
  benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
  /* keine Tour, keine Einführung — die Suite prüft Ansichten, nicht das Onboarding */
  einfuehrung: { erledigt: true, schritt: 0 }, tour: { nichtMehr: true },
  rolle, rolleSeit: "2020-01-01", status: "aktiv",
  bereich: ["leitung", "planer", "betriebsrat"].includes(rolle) ? "ALLE" : einheit,
  ...extra,
});

/** Ein Betrieb wie aus dem Selbststart (server/lib/leerbetrieb.mjs), dazu Personal und Plan. */
export function startbestand() {
  const b = baueLeerenBetrieb({ name: BETRIEB, branche: "pflege", email: "", land: "HE", raum: "e2e-m1" });
  const m = b.mandanten[0];
  m.status = "aktiv"; m.selbstAngelegt = false; m.laeuftAb = null;
  m.einheiten = [
    { ...m.einheiten[0], id: "e1", name: "Wohnbereich Nord" },
    { ...m.einheiten[0], id: "e2", name: "Wohnbereich Süd", farbe: "#7a4a00" },
  ];
  const dienste = m.dienstarten.map((d) => d.id);
  if (!["F", "S"].every((d) => dienste.includes(d))) throw new Error("Branche pflege ohne F/S");
  m.personen = [
    person("l1", "Lea", "Leitwerk", "leitung", "e1", { imSchichtdienst: false }),
    person("p1", "Paul", "Planbach", "planer", "e1"),
    person("s1", "Sina", "Schichtholz", "subplaner", "e1"),
    person("a1", "Andrea", "Kernbach", "mitarbeiter", "e1",
      { anschrift: "Musterweg 1", notfallkontakt: "Ehemann 0170-5550100" }),
    person("a2", "Miriam", "Vogtland", "mitarbeiter", "e2",
      { anschrift: FREMD.anschrift, notfallkontakt: FREMD.notfallkontakt, geburtstag: FREMD.geburtstag }),
    person("a3", "Ole", "Offenbach", "mitarbeiter", "e1"),
    person("b1", "Britta", "Ratmann", "betriebsrat", "e1"),
  ];
  for (const pid of ["a1", "a2", "a3", "s1", "p1", "b1"]) {
    m.abweichungen[`${pid}|${heute()}`] = pid === "a2" ? "-" : "F";
    m.abweichungen[`${pid}|${tag(-1)}`] = "S";
    m.abweichungen[`${pid}|${tag(1)}`] = "F";
  }
  m.abwesenheiten = [
    { id: "ab1", personId: "a2", art: "krank", von: tag(-2), bis: tag(2),
      grund: FREMD.krankheitsgrund, nachweis: FREMD.nachweis },
  ];
  return b;
}
