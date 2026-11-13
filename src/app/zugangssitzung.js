/* ==========================================================================
   SITZUNG AUS DEM ZUGANG — welche Person ein Zugangscode in der Oberfläche ist

   Bis November 2026 stand diese Auflösung inline im Ladevorgang von App.jsx.
   Herausgelöst, damit sie ohne Browser prüfbar ist (Abnahme V4, A-3).

   Der Code in der Hand entscheidet, nicht der Rückstand im Speicher. Die
   Rechte bestimmt weiterhin allein der Server (Rolle des Tokens); hier geht
   es nur darum, als welche Person die Oberfläche startet — oder warum sie
   es nicht kann.

   A-3: Ein Code OHNE Person in einem Betrieb, der Personen, aber keine
   aktive Person der Rolle des Codes hat (etwa: die einzige Leitung ist
   ausgeschieden), ergab keine Sitzung. Die Oberfläche fiel dann auf die
   Anmeldung zurück — und die zeigt für einen Bestand ohne Sitzung den
   Rollenwähler der Vorführfassung („Vorführfassung — du bist bereits
   angemeldet", „Zur Betreiberkonsole", „Als Planer anmelden …"), obwohl
   der Zugang kein Demozugang ist. Jetzt: eine klare Meldung, keine Sitzung,
   keine angelegte Person, kein Rollenwechsel. Nur ein Betrieb ganz ohne
   Personen legt — wie bisher — die erste Person aus dem Code an.
   ========================================================================== */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { aktivePerson } from "../../server/lib/personengueltig.mjs";
import { heute as heuteBerlin } from "../lib/datum.js";
import { uid } from "../lib/format.js";
import { ROLLENBEZEICHNUNG } from "../lib/rollen.js";

/** Meldung, wenn ein Code ohne Person auf keine aktive Person seiner Rolle trifft. */
export const OHNE_PERSON_TITEL = "Ihr Zugang ist keiner Person zugeordnet.";
export const ohnePersonText = (betrieb, rolle) =>
  `In „${betrieb}" gibt es keine aktive Person mit der Rolle ${ROLLENBEZEICHNUNG[rolle] || rolle}, `
  + "der dieser Zugangscode zugeordnet werden kann. Bitte wenden Sie sich an den Betreiber oder die Verwaltung "
  + "Ihres Betriebs: Er kann den Code einer Person zuordnen oder einen personengebundenen Code ausstellen.";

/** Die erste Person eines Betriebs ohne Personen: wer den Code in der Hand hält. */
function erstePerson(mand, rolle, tag) {
  const ersteEinheit = (mand.einheiten || [])[0];
  return {
    id: uid("p"),
    vorname: "",
    nachname: ROLLENBEZEICHNUNG[rolle] || "Leitung",
    funktion: ROLLENBEZEICHNUNG[rolle] || "Leitung",
    email: mand.kontakt || "",
    zugehoerigkeit: ersteEinheit
      ? [{ ab: mand.seit || tag, einheitId: ersteEinheit.id }] : [],
    eintritt: mand.seit || tag,
    austritt: null,
    wochenstunden: (mand.einstellungen || {}).wochenstunden || 40,
    urlaubsanspruch: (mand.einstellungen || {}).urlaubsanspruch || 30,
    urlaubsuebertrag: 0,
    stundenuebertrag: 0,
    qualifikationen: [],
    teilzeit: null,
    springer: false,
    einschraenkungen: {},
    rolle,
    rolleSeit: tag,
    rolleVerlauf: [],
    /* Alle Einheiten: Wer den Betrieb einrichtet, muss überall hinsehen können. */
    bereich: "ALLE",
    status: "aktiv",
    /* Die Leitung fährt nicht zwangsläufig selbst Schicht — das entscheidet sie später unter Personal. */
    imSchichtdienst: false,
  };
}

/**
 * Löst den Zugang zu einer Sitzung der Oberfläche auf.
 * @param {any} b       der geladene (migrierte) Bestand
 * @param {any} zugang  was der Server zur Sitzung meldet (rolle, person, betrieb, demo)
 * @param {string} [tag] heutiges Datum (Berlin)
 * @returns {{ bestand: any, fehler: null | string | { titel: string, text: string } }}
 *   `bestand` mit gesetzter `session` (oder unverändert), `fehler` für den Ladefehler-Bildschirm.
 */
export function sitzungAusZugang(b, zugang, tag = heuteBerlin()) {
  /* Demo (Betreiberentscheidung D.2): Der Rollenwähler hängt am Merkmal demo des Zugangs, nicht an der Rolle
     „kunde". Er ändert nur die Ansicht; Rechte und Daten bestimmt weiter die Rolle des Tokens, und
     Verwaltungswege sind für Demo-Sitzungen serverseitig gesperrt. „kunde" bleibt als Altbestand gleich
     behandelt, bis die Umstellung gelaufen ist. */
  if (!zugang || !zugang.rolle || zugang.rolle === "kunde" || zugang.demo === true) return { bestand: b, fehler: null };
  if (zugang.rolle === "betreiber") return { bestand: { ...b, session: { rolle: "betreiber" } }, fehler: null };
  const mand = b.mandanten[zugang.betrieb || 0] || b.mandanten[0];
  if (!mand) return { bestand: b, fehler: null };
  const personen = Array.isArray(mand.personen) ? mand.personen : [];
  /* Kandidaten: im Dienst und im Betrieb gültig (nicht deaktiviert, nicht anonymisiert — dieselbe Regel wie die
     Code-Sitzung des Servers, personengueltig.mjs). Eine inaktive Leitung ist keine Leitung, als die man startet. */
  const kand = personen.filter((p) => p && p.rolle === zugang.rolle && imDienst(p, tag) && aktivePerson(mand, p.id, tag));
  /* `zugang.person` war früher ein Array-Index, die Betreiberkonsole hinterlegt die Kennung („p1").
     Aufgelöst wird zuerst über die Kennung, dann über den Index. Ein gesetzter Wert, der auf niemanden
     passt, fällt nicht auf den ersten Kandidaten zurück — das meldete jemanden als eine andere Person an. */
  let p = null;
  let fehler = null;
  if (zugang.person == null) {
    p = kand[0] || null;
    /* A-3: Personen da, aber keine aktive der Rolle — Meldung statt Rollenwähler der Vorführfassung. */
    if (!p && personen.length) fehler = { titel: OHNE_PERSON_TITEL, text: ohnePersonText(mand.name, zugang.rolle) };
  } else {
    p = personen.find((x) => x.id === zugang.person)
      || (Number.isInteger(zugang.person) ? personen[zugang.person] : null)
      || null;
    if (!p && personen.length)
      fehler = `Der Zugangscode gehört zu einer Person, die es in „${mand.name}" nicht mehr gibt. `
        + "Bitte einen neuen Code ausstellen lassen.";
  }
  /* Ein frisch angelegter Betrieb hat noch keine Person — ohne Person gäbe es keinen Weg hinein. Die erste
     Person ist die, die den Zugangscode in der Hand hält (Rolle aus dem Code, alle Einheiten). */
  let bestand = b;
  if (!p && !personen.length) {
    p = erstePerson(mand, zugang.rolle, tag);
    bestand = { ...bestand, mandanten: bestand.mandanten.map((x) => (x.id === mand.id ? { ...mand, personen: [p] } : x)) };
  }
  if (p) return { bestand: { ...bestand, session: { rolle: "kunde", mandantId: mand.id, personId: p.id } }, fehler };
  /* Keine Person: auch keine im Bestand mitgebrachte Sitzung übernehmen — sie gehörte jemand anderem. */
  return { bestand: { ...bestand, session: null }, fehler };
}
