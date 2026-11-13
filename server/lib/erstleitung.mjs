/* ==========================================================================
   ERSTANMELDUNG DER LEITUNG — die erste Leitungsperson eines leeren Betriebs
   entsteht auf dem Server, atomar und dauerhaft (Abnahme V4, A-3;
   Betreiberentscheidung 2026-11-13)

   Bis November 2026 legte die OBERFLÄCHE die erste Person eines Betriebs ohne
   Personen an — nur im Arbeitsspeicher des Browsers (src/App.jsx). Gespeichert
   wurde sie erst mit dem nächsten Schreibvorgang, und auch nur, wenn bis dahin
   niemand sonst Personen angelegt hatte. Ein Leitungscode ohne Person konnte
   so in einem Betrieb mit Personen stranden (Befund A-3). Und JEDER Code ohne
   Person in einem leeren Betrieb erzeugte eine Person — auch ein gewöhnlicher.

   Jetzt:
     - Auslöser ist allein ein ausdrücklich so ausgestellter Erstanmeldecode:
       ein Leitungscode ohne Person, ausgestellt für einen Betrieb OHNE
       Personen im Fenster der Ersteinrichtung (kundenraumschutz.mjs: „neu“
       oder „fenster“) bzw. vom Selbststart für den eben angelegten Betrieb.
       Er trägt den Vermerk `erstleitung: { mandantId, angelegt }`. Kein
       anderer Code legt je eine Person an — kein Demozugang, kein Code einer
       anderen Rolle, kein gewöhnlicher Leitungscode, kein Code mit Person.
     - Der Vermerk ist an Raum UND Betrieb gebunden (Kennung, Position) und
       wird genau einmal eingelöst. Danach ist der Code ein gewöhnlicher,
       personengebundener Leitungscode — derselbe Weg wie jeder andere.
     - Unter der Sperre des Raums (raumsperre.mjs) und in drei Schritten, die
       jeder für sich atomar geschrieben werden (ablage.mjs: Zwischendatei,
       umbenennen; bestand.mjs: Journal):
         1  Vormerken: die künftige Personenkennung am Zugang
            (`erstleitung.personId`). Noch keine Person, keine Sitzung.
         2  Person in den Betrieb schreiben — nur, wenn er noch leer ist
            (oder genau diese vorgemerkte Person schon trägt: Wiederanlauf).
         3  Zugang binden: `person` gesetzt, Vermerk weg, an seiner Stelle
            `erstleitungVerbraucht: { am, grund, mandantId, personId }`.
       Erst danach entsteht die Sitzung (Aufrufer). Bricht der Vorgang
       zwischen zwei Schritten ab (Schreibfehler, Prozessende), gibt es keine
       Sitzung; der nächste Versuch mit demselben Code findet die Vormerkung
       und schreibt zu Ende — nie eine zweite Person. Kein halber Datensatz:
       Die Person entsteht in einem Schreibvorgang vollständig oder gar nicht.
     - Trägt der Betrieb inzwischen fremde Personen (ein zweiter
       Erstanmeldecode war schneller, Personen wurden eingespielt), wird
       nichts angelegt: Der Code ist verbraucht (`grund: "belegt"`) und gilt
       für die Anmeldung nicht mehr — keine stille Zuordnung zu einer
       fremden Person, keine Rechteausweitung.
   Bestehende Zugänge und Betriebe bleiben unverändert: Ein Zugang ohne
   Vermerk wird nie umgeschrieben, kein gespeicherter Bestand wird migriert.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { kontoLesenStreng, kontoSchreiben } from "./konten.mjs";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "./bestand.mjs";

/** Bezeichnung der ersten Person (wie bisher in der Oberfläche: Rolle als Nachname, Vorname leer). */
const BEZEICHNUNG = "Organisationsleitung";

const heuteBerlin = (jetzt = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(jetzt));

/** Personenkennung aus dem Zufallsgenerator des Betriebssystems (Muster wie provisionierung.mjs). */
const neuePersonId = () => `p_${randomBytes(5).toString("hex").slice(0, 7)}`;

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ohnePerson = (p) => p === null || p === undefined || p === "";

/** Trägt der Zugang einen offenen Erstanmeldevermerk? Jeder Zweifel ist Nein. */
export function erstleitungOffen(eintrag) {
  if (!istObjekt(eintrag) || !istObjekt(eintrag.erstleitung)) return false;
  if (eintrag.erstleitungVerbraucht) return false;
  if (eintrag.rolle !== "leitung" || eintrag.demo === true || eintrag.gesperrt) return false;
  const z = eintrag.erstleitung;
  if (typeof z.mandantId !== "string" || !z.mandantId || z.mandantId !== eintrag.mandantId) return false;
  if (typeof eintrag.bestand !== "string" || !eintrag.bestand) return false;
  return true;
}

/** Wurde der Zugang als Erstanmeldecode ausgestellt (offen oder eingelöst)? */
export const erstleitungsZugang = (eintrag) =>
  istObjekt(eintrag) && (istObjekt(eintrag.erstleitung) || istObjekt(eintrag.erstleitungVerbraucht));

/** Ein verbrauchter Erstanmeldecode ohne Person (belegt): gilt nicht mehr für die Anmeldung. */
export const erstleitungUngueltig = (eintrag) =>
  erstleitungsZugang(eintrag) && !erstleitungOffen(eintrag) && ohnePerson(eintrag.person);

/**
 * Bekommt ein neuer Code den Erstanmeldevermerk? Nur ein Leitungscode ohne Person, kein Demozugang, für einen Betrieb
 * ohne Personen, ausgestellt im Fenster der Ersteinrichtung (`lage`: kundenraumschutz.mjs, „neu“ oder „fenster“).
 * @param {{rolle?: unknown, person?: unknown, demo?: unknown, mandant?: any, lage?: {art?: string}|null}} o
 */
export function erstleitungAusstellen({ rolle, person, demo, mandant, lage }) {
  if (rolle !== "leitung" || !ohnePerson(person) || demo === true || demo === "true") return false;
  if (!lage || (lage.art !== "neu" && lage.art !== "fenster")) return false;
  if (!istObjekt(mandant) || typeof mandant.id !== "string" || !mandant.id) return false;
  return Array.isArray(mandant.personen) && mandant.personen.length === 0;
}

/** Der Vermerk am neuen Code: Kennung des Betriebs und Zeitpunkt, sonst nichts. */
export const erstleitungVermerk = (mandantId, jetzt = Date.now()) =>
  ({ mandantId: String(mandantId), angelegt: new Date(jetzt).toISOString() });

/**
 * Die erste Leitungsperson. Feldsatz wie bisher in der Oberfläche (src/app/zugangssitzung.js bis 2026-11) bzw. wie
 * provisionierung.mjs (leitungsperson): alle Einheiten, aktiv, nicht im Schichtdienst. Keine personenbezogenen
 * Angaben — kein Name, keine Adresse; die Leitung trägt sie unter „Personal“ selbst ein.
 * @param {any} mandant
 * @param {string} id
 * @param {string} tag
 */
export function erstleitungPerson(mandant, id, tag) {
  const ersteEinheit = (Array.isArray(mandant.einheiten) ? mandant.einheiten : [])[0];
  const e = istObjekt(mandant.einstellungen) ? mandant.einstellungen : {};
  const ab = typeof mandant.seit === "string" && mandant.seit <= tag ? mandant.seit : tag;
  return {
    id,
    vorname: "",
    nachname: BEZEICHNUNG,
    funktion: BEZEICHNUNG,
    email: "",
    zugehoerigkeit: ersteEinheit && ersteEinheit.id ? [{ ab, einheitId: ersteEinheit.id }] : [],
    eintritt: ab,
    austritt: null,
    wochenstunden: Number.isFinite(e.wochenstunden) ? e.wochenstunden : 40,
    urlaubsanspruch: Number.isFinite(e.urlaubsanspruch) ? e.urlaubsanspruch : 30,
    urlaubsuebertrag: 0,
    stundenuebertrag: 0,
    qualifikationen: [],
    teilzeit: null,
    springer: false,
    einschraenkungen: {},
    rolle: "leitung",
    rolleSeit: ab,
    rolleVerlauf: [],
    bereich: "ALLE",
    status: "aktiv",
    imSchichtdienst: false,
  };
}

/**
 * Löst einen Erstanmeldecode ein: legt die erste Leitungsperson an und bindet den Code an sie — oder tut nichts.
 * Unter der Sperre des Raums; alle Lesevorgänge streng (ein Lesefehler ist nie „leer“).
 *
 * Ergebnis:
 *   { ok: true, eintrag, angelegt }   eintrag = der frisch gelesene Zugang (mit Person, wenn eingelöst);
 *                                      angelegt = true nur, wenn DIESER Aufruf die Person geschrieben hat
 *   { ok: false, grund }              keine Sitzung: "lesen" | "schreiben" | "betrieb" | "belegt" | "konflikt"
 *
 * @param {any} store  Ablage „centric“
 * @param {{schluessel: string, jetzt?: number, durch?: string}} o
 */
export function erstleitungEinloesen(store, { schluessel, jetzt = Date.now(), durch = "Erstanmeldung Leitung" }) {
  return (async () => {
    let vorab;
    try { vorab = await kontoLesenStreng(store, schluessel); } catch { return { ok: false, grund: "lesen" }; }
    if (!erstleitungOffen(vorab)) return { ok: true, eintrag: vorab, angelegt: false };
    const raum = vorab.bestand;
    try {
      return await unterRaumsperre(raum, () => einloesenGesperrt(store, schluessel, raum, jetzt, durch));
    } catch { return { ok: false, grund: "schreiben" }; }
  })();
}

async function einloesenGesperrt(store, schluessel, raum, jetzt, durch) {
  /* Frisch lesen: Ein gleichzeitiger Versuch mit demselben Code kann schon eingelöst haben. */
  let e;
  try { e = await kontoLesenStreng(store, schluessel); } catch { return { ok: false, grund: "lesen" }; }
  if (!erstleitungOffen(e)) {
    if (erstleitungUngueltig(e)) return { ok: false, grund: "belegt" };
    return { ok: true, eintrag: e, angelegt: false };
  }
  if (e.bestand !== raum) return { ok: false, grund: "betrieb" };

  let gelesen;
  try { gelesen = await bestandLesenStreng(store, raum); } catch { return { ok: false, grund: "lesen" }; }
  const bestand = gelesen && gelesen.bestand;
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : null;
  const pos = Number.isInteger(e.betrieb) ? e.betrieb : 0;
  const m = liste ? liste[pos] : null;
  /* Mandantenbindung: Position UND Kennung des Codes müssen auf denselben Betrieb zeigen wie der Vermerk. */
  if (!istObjekt(m) || m.id !== e.mandantId || m.id !== e.erstleitung.mandantId
    || liste.filter((x) => x && x.id === m.id).length !== 1) return { ok: false, grund: "betrieb" };

  /* Schritt 1: vormerken. */
  let personId = typeof e.erstleitung.personId === "string" && /^p_[0-9a-f]{7}$/.test(e.erstleitung.personId)
    ? e.erstleitung.personId : null;
  if (!personId) {
    personId = neuePersonId();
    e = { ...e, erstleitung: { ...e.erstleitung, personId } };
    try { await kontoSchreiben(store, schluessel, e); } catch { return { ok: false, grund: "schreiben" }; }
  }

  /* Schritt 2: Person — nur in einen leeren Betrieb, oder sie steht schon da (Wiederanlauf). */
  const personen = Array.isArray(m.personen) ? m.personen : [];
  const schonDa = personen.some((p) => p && String(p.id) === personId);
  let angelegt = false;
  if (!schonDa) {
    if (personen.length > 0) {
      /* Der Betrieb ist nicht mehr leer — nichts anlegen, den Code verbrauchen (fail-closed). */
      try { await verbrauchen(store, schluessel, e, "belegt", null, jetzt); } catch { /* bleibt offen, wird erneut abgewiesen */ }
      return { ok: false, grund: "belegt" };
    }
    const person = erstleitungPerson(m, personId, heuteBerlin(jetzt));
    const neu = { ...bestand, mandanten: liste.map((x, i) => (i === pos ? { ...m, personen: [person] } : x)) };
    let erg;
    try { erg = await bestandSchreiben(store, raum, neu, { erwarteterStand: gelesen.stand, durch }); }
    catch { return { ok: false, grund: "schreiben" }; }
    if (!erg || erg.ok !== true) return { ok: false, grund: erg && erg.grund === "konflikt" ? "konflikt" : "schreiben" };
    angelegt = true;
  }

  /* Schritt 3: Zugang binden. Scheitert das, bleibt die Vormerkung — der nächste Versuch schreibt nur noch diesen Schritt. */
  let gebunden;
  try { gebunden = await verbrauchen(store, schluessel, e, "angelegt", personId, jetzt); }
  catch { return { ok: false, grund: "schreiben" }; }
  return { ok: true, eintrag: gebunden, angelegt, personId };
}

async function verbrauchen(store, schluessel, e, grund, personId, jetzt) {
  const { erstleitung, ...rest } = e;
  const neu = { ...rest, ...(personId ? { person: personId } : {}),
    erstleitungVerbraucht: { am: new Date(jetzt).toISOString(), grund, mandantId: erstleitung.mandantId,
      ...(personId ? { personId } : {}) } };
  await kontoSchreiben(store, schluessel, neu);
  return neu;
}
