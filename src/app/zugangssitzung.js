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
   keine angelegte Person, kein Rollenwechsel.

   Die erste Leitungsperson eines leeren Betriebs legt seit November 2026
   der SERVER an — atomar, dauerhaft, nur für einen ausdrücklich so
   ausgestellten Erstanmeldecode (server/lib/erstleitung.mjs). Die Anmeldung
   meldet ihre Kennung zurück (zugang.person); hier wird sie nur noch
   aufgelöst. Die Oberfläche legt keine Person mehr an, auch nicht im
   Arbeitsspeicher: Ein Code ohne Person in einem Betrieb ohne Personen
   (gewöhnlicher Code, kein Erstanmeldecode) bekommt dieselbe Meldung.

   NUR WENN DER SERVER „STRENG“ MELDET (Delta-Review e8b9b93d, Punkt 3):
   Ob für den Betrieb der Sitzung das strenge Regime gilt, entscheidet der
   Server (server/lib/erstleitung.mjs, erstleitungStreng: neuer Betrieb,
   festgelegte Erstanmeldung oder Schalter CENTRIC_ERSTLEITUNG_STRENG) und
   meldet es mit GET /api/bestand (`erstleitungStreng`, ein Wahrheitswert).
   Nicht streng — ein Bestandsbetrieb bei ausgeschaltetem Schalter, oder die
   Angabe fehlt (älterer Server, zwischengespeicherte Antwort): der
   BISHERIGE Ablauf unverändert (sitzungAltweg): Kandidaten nur nach Rolle
   und Dienst, die erste Person eines leeren Betriebs im Arbeitsspeicher.
   Einzige Abweichung, Betreiberentscheidung E-Mail (2026-11-13): Diese
   Person übernimmt die Kontaktadresse des Betriebs nicht (email leer).
   ========================================================================== */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { aktivePerson } from "../../server/lib/personengueltig.mjs";
import { heute as heuteBerlin } from "../lib/datum.js";
import { ROLLENBEZEICHNUNG } from "../lib/rollen.js";
import { uid } from "../lib/format.js";

/**
 * Der bisherige Ablauf (bis 2026-11 inline in src/App.jsx) — für Betriebe, für die der Server nicht „streng“ meldet.
 * Rückgabe wie sitzungAusZugang.
 * @param {any} b
 * @param {any} zugang
 * @param {string} tag
 * @param {() => string} neueId
 */
export function sitzungAltweg(b, zugang, tag, neueId = () => uid("p")) {
  let fehler = null;
  const mand = b.mandanten[zugang.betrieb || 0] || b.mandanten[0];
  if (mand) {
    const kand = mand.personen.filter((p) => p.rolle === zugang.rolle && imDienst(p, tag));
    let p = null;
    if (zugang.person == null) p = kand[0];
    else {
      p = mand.personen.find((x) => x.id === zugang.person)
        || (Number.isInteger(zugang.person) ? mand.personen[zugang.person] : null)
        || null;
      if (!p && mand.personen.length)
        fehler = `Der Zugangscode gehört zu einer Person, die es in „${mand.name}" nicht mehr gibt. `
          + "Bitte einen neuen Code ausstellen lassen.";
    }
    /* Ein frisch angelegter Betrieb ohne Person: die Person, die den Code in der Hand hält, im Arbeitsspeicher —
       mit der Rolle aus dem Code und Zugriff auf alle Einheiten (wie bisher). */
    if (!p && !mand.personen.length) {
      const ersteEinheit = (mand.einheiten || [])[0];
      p = {
        id: neueId(),
        vorname: "",
        nachname: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
        funktion: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
        /* Betreiberentscheidung E-Mail (2026-11-13): nie die Kontaktadresse des Betriebs. */
        email: "",
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
        rolle: zugang.rolle,
        rolleSeit: tag,
        rolleVerlauf: [],
        bereich: "ALLE",
        status: "aktiv",
        imSchichtdienst: false,
      };
      const mitPerson = { ...mand, personen: [p] };
      b = { ...b, mandanten: b.mandanten.map((x) => x.id === mand.id ? mitPerson : x) };
    }
    if (p) b = { ...b, session: { rolle: "kunde", mandantId: mand.id, personId: p.id } };
  }
  return { bestand: b, fehler };
}

/** Meldung, wenn ein Code ohne Person auf keine aktive Person seiner Rolle trifft. */
export const OHNE_PERSON_TITEL = "Ihr Zugang ist keiner Person zugeordnet.";
export const ohnePersonText = (betrieb, rolle) =>
  `In „${betrieb}" gibt es keine aktive Person mit der Rolle ${ROLLENBEZEICHNUNG[rolle] || rolle}, `
  + "der dieser Zugangscode zugeordnet werden kann. Bitte wenden Sie sich an den Betreiber oder die Verwaltung "
  + "Ihres Betriebs: Er kann den Code einer Person zuordnen oder einen personengebundenen Code ausstellen.";

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
  /* Nur wenn der Server für diesen Betrieb „streng“ meldet, gilt das Folgende; sonst der bisherige Ablauf. */
  if (zugang.erstleitungStreng !== true) return sitzungAltweg(b, zugang, tag);
  const mand =b.mandanten[zugang.betrieb || 0] || b.mandanten[0];
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
    /* A-3: keine aktive Person der Rolle (auch: Betrieb noch ganz ohne Personen) — Meldung statt Rollenwähler der
       Vorführfassung. Die Oberfläche legt keine Person an; das tut allein der Server für einen Erstanmeldecode. */
    if (!p) fehler = { titel: OHNE_PERSON_TITEL, text: ohnePersonText(mand.name, zugang.rolle) };
  } else {
    p = personen.find((x) => x.id === zugang.person)
      || (Number.isInteger(zugang.person) ? personen[zugang.person] : null)
      || null;
    if (!p)
      fehler = `Der Zugangscode gehört zu einer Person, die es in „${mand.name}" nicht mehr gibt. `
        + "Bitte einen neuen Code ausstellen lassen.";
  }
  const bestand = b;
  if (p) return { bestand: { ...bestand, session: { rolle: "kunde", mandantId: mand.id, personId: p.id } }, fehler };
  /* Keine Person: auch keine im Bestand mitgebrachte Sitzung übernehmen — sie gehörte jemand anderem. */
  return { bestand: { ...bestand, session: null }, fehler };
}
