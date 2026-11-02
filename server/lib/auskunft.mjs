/* ==========================================================================
   AUSKUNFT NACH ARTIKEL 15 DSGVO — serverseitig, vollständig, maschinenlesbar

   Bis November 2026 baute die Oberfläche die Auskunft selbst (App.jsx,
   datenauskunft) — aus dem Bestand, den sie gerade in der Hand hatte. Darin
   fehlten die Stempeldaten samt Ortsbefund, die Markierungen, die
   Protokolleinträge zur Person und alles, was gar nicht im Bestand liegt
   (Push-Anmeldung, Kalenderverweis). Und sie war Text, nicht maschinenlesbar.

   Hier entsteht sie auf dem Server, aus dem streng gelesenen Bestand, als
   JSON (Art. 15 Abs. 3 Satz 3: „in einem gängigen elektronischen Format").

   Wer was bekommt — keine Erweiterung der Rechte:

   - Die betroffene Person über sich selbst: alles, was zu ihr gespeichert
     ist (Art. 15 Abs. 1 und 3) — ihr Personendatensatz vollständig, ihre
     Stempel mit Ortsbefund (nie Koordinaten, die werden nicht gespeichert),
     Ist-Zeiten, Planabweichungen, Abwesenheiten mit Anmerkung, Anträge,
     Planänderungen, Mitteilungen, Protokolleinträge, ob eine Push-Anmeldung
     und ein Kalenderverweis bestehen, die Aufbewahrungsfristen.
   - Die Leitung (und „kunde", dieselben Rollen wie bei Sicherungen) für eine
     Person des eigenen Betriebs, auf Anfrage dieser Person: genau das, was
     die Leitung ohnehin sieht (bestandFuerRolle) — nicht mehr. Felder, die
     auch die Leitung nicht sieht (Notfallkontakt, Bank, Steuer …), stehen
     nicht darin; die Antwort sagt das ausdrücklich.
   - Niemand sonst. Der Betreiber nicht, andere Rollen nur für sich selbst.
   ========================================================================== */

import { fristen } from "../../src/aufbewahrung.js";

export const AUSKUNFT_FORMAT = "centric-auskunft";
export const AUSKUNFT_FASSUNG = 1;

/** Rollen, die für eine andere Person des eigenen Betriebs Auskunft erstellen dürfen. */
export const AUSKUNFT_FUER_ANDERE = Object.freeze(["leitung", "kunde"]);

const eigene = (pid) => (k) => String(k).split("|")[0] === String(pid);
const nachTag = (obj, pid) => Object.entries(obj && typeof obj === "object" ? obj : {})
  .filter(([k]) => eigene(pid)(k))
  .map(([k, v]) => ({ datum: String(k).split("|").slice(1).join("|"), ...(v && typeof v === "object" ? v : { wert: v }) }))
  .sort((a, b) => a.datum.localeCompare(b.datum));
const mitPerson = (liste, pid, felder = ["personId"]) => (Array.isArray(liste) ? liste : [])
  .filter((x) => x && felder.some((f) => x[f] !== undefined && String(x[f]) === String(pid)));

/**
 * Baut die Auskunft.
 * @param {object} m  der Betrieb (vollständig oder in der Sicht der anfragenden Rolle)
 * @param {object} person  der Personendatensatz aus m
 * @param {{ raum: string, erstellt: string, umfang: "selbst"|"leitung", protokoll: object[],
 *   push: boolean, kalender: boolean }} o
 */
export function auskunftBauen(m, person, { raum, erstellt, umfang, protokoll, push, kalender }) {
  const pid = person.id;
  const abweichungen = Object.entries(m.abweichungen || {}).filter(([k]) => eigene(pid)(k))
    .map(([k, v]) => ({ datum: String(k).split("|")[1], dienst: v }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const f = fristen(m);
  return {
    format: AUSKUNFT_FORMAT,
    fassung: AUSKUNFT_FASSUNG,
    erstellt,
    rechtsgrundlage: "Art. 15 DSGVO",
    umfang,
    hinweis: umfang === "leitung"
      ? "Erstellt durch die Leitung auf Anfrage der Person. Enthalten ist, was die Leitung einsehen darf; "
        + "Angaben, die nur der Person selbst zugänglich sind (z. B. Notfallkontakt, Bank-, Steuer- und "
        + "Sozialversicherungsdaten), fehlen hier — die Person erhält sie über ihre eigene Auskunft."
      : "Vollständige Auskunft über die zu deiner Person gespeicherten Daten.",
    verantwortlicher: { betrieb: m.name || null, betriebId: m.id || null, raum },
    zwecke: ["Dienstplanung", "Arbeitszeiterfassung (§ 16 Abs. 2 ArbZG, ggf. § 17 MiLoG)",
      "Abwesenheitsverwaltung", "Kommunikation im Betrieb", "Sicherheit und Nachvollziehbarkeit (Protokoll)"],
    empfaenger: "Leitung und Planung des Betriebs im Rahmen ihrer Rechte; keine Übermittlung an Dritte "
      + "außer dem technischen Betreiber (Auftragsverarbeitung).",
    herkunft: "Eingaben der Person, der Leitung und Planung sowie die Stempeluhr (Serverzeit, Ortsbefund).",
    aufbewahrung: {
      plandatenMonate: f.plandatenMonate, stammdatenMonateNachAustritt: f.stammdatenMonate,
      abwesenheitsgruendeMonate: f.gruendeMonate, letzterLoeschlauf: f.zuletztGeraeumt,
      protokollTage: 30,
    },
    person,
    stempel: nachTag(m.einstempeln, pid),
    istZeiten: nachTag(m.erfassung, pid),
    planabweichungen: abweichungen,
    abwesenheiten: mitPerson(m.abwesenheiten, pid),
    antraege: mitPerson(m.anfragen, pid, ["personId", "partnerId", "mitPersonId", "vonPersonId", "anPersonId"]),
    planaenderungen: mitPerson(m.aenderungen, pid),
    mitteilungen: mitPerson(m.nachrichten, pid, ["personId", "anPersonId", "vonPersonId"]),
    pushAnmeldung: !!push,
    kalenderverweis: !!kalender,
    protokoll: (protokoll || []).sort((a, b) => String(a.zeit).localeCompare(String(b.zeit))),
  };
}

/**
 * Protokolleinträge zu einer Person eines Raums aus der Spur (centric-spur).
 * Die Spur kennt den Raum als Kürzel (schutz.mjs, kennung) und die Person
 * als betriebsinterne Kennung; Namen stehen nicht darin.
 */
export async function protokollZurPerson(spurStore, raumKennung, personId) {
  const aus = [];
  const { blobs } = await spurStore.list();
  for (const b of blobs) {
    const z = await spurStore.get(b.key, { type: "json" }).catch(() => null);
    const zeilen = Array.isArray(z) ? z : z ? [z] : [];         // Altbestand: ein Array je Tag und Art
    for (const r of zeilen) {
      if (r && r.kennung === raumKennung && r.person !== undefined && String(r.person) === String(personId)) aus.push(r);
    }
  }
  return aus;
}
