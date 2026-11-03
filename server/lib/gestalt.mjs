/* ==========================================================================
   GESTALTPRÜFUNG

   Die Rechteprüfung schützt vor fremdem Zugriff. Sie schützt nicht vor der
   eigenen fehlerhaften Anwendung: Bis hierher war die einzige Bedingung vor
   dem Schreiben `typeof bestand !== "object"`. Ein Fehler in der Oberfläche,
   der ein halbes Objekt schickt, wurde angenommen und ersetzte den Betrieb.

   Diese Datei prüft die Form — nicht den Inhalt. Sie soll niemals einen
   gültigen Schreibvorgang verhindern, und sie soll grobe Verstümmelung
   auffangen. Im Zweifel lässt sie durch.

   Dazu ein zweiter Schutz: Schrumpft der Bestand auffällig, wird vor dem
   Schreiben eine Sicherung angelegt. Nicht abgelehnt — es gibt legitime
   Gründe, viel zu löschen — aber rückholbar gemacht.
   ========================================================================== */

import { aufbewahrungFehler, aufbewahrungGeaendert } from "./aufbewahrung.mjs";

/** Felder, die ein Bestand haben muss, um überhaupt einer zu sein. */
const PFLICHT = ["mandanten"];

/** Listen je Betrieb, die ein Array sein müssen, wenn sie vorhanden sind. */
const LISTEN = ["personen", "einheiten", "dienstarten", "abwesenheiten",
  "anfragen", "qualifikationen", "standorte", "uebergaben"];

/**
 * Altform angleichen (Commit C2): Über die Betreiberkonsole angelegte
 * Betriebe trugen `uebergaben: {}` statt einer Liste. Inhalt konnte darin
 * nie stehen — das Speichern einer Übergabe scheiterte daran schon im
 * Browser. Ein leeres Objekt wird zur leeren Liste, bevor die Gestalt
 * geprüft wird; alles andere bleibt, wie es ist (und fällt dann auf).
 * @param {any} bestand
 */
export function uebergabenAngleichen(bestand) {
  if (!bestand || typeof bestand !== "object" || !Array.isArray(bestand.mandanten)) return bestand;
  const leer = (u) => !!u && typeof u === "object" && !Array.isArray(u) && Object.keys(u).length === 0;
  if (!bestand.mandanten.some((m) => m && leer(m.uebergaben))) return bestand;
  return { ...bestand, mandanten: bestand.mandanten.map((m) => (m && leer(m.uebergaben) ? { ...m, uebergaben: [] } : m)) };
}

/* --------------------------------------------------------------------------
   PERSONEN: qualifikationen

   Die Oberfläche liest `person.qualifikationen` an vielen Stellen als Liste
   (Tagesaufgaben, Nachweise, Personal). Fehlte das Feld — eine über die
   Schnittstelle angelegte Person —, stürzte die Startseite jeder Rolle ab
   („reading 'map'"). Die Gestaltprüfung sah es nicht: Sie prüft die Listen
   eines Betriebs, nicht die Felder einer Person.

   Zwei Fälle, bewusst getrennt:
   - fehlt oder null: eine fehlende optionale Liste → []. Das ist keine
     Aussage, die verloren ginge.
   - ein anderer Typ in einer Eingabe (Text, Zahl, Objekt): ein Fehler des
     Absenders. Er wird abgewiesen (personenFehler), nicht still zu []
     gemacht — sonst verschwänden Angaben, ohne dass es jemand merkt.
   Ein schon gespeicherter Altbestand mit falschem Typ ist keine Eingabe:
   Beim Lesen und beim Zusammenführen wird er zu [], damit er weder die
   Oberfläche abstürzen lässt noch jeden künftigen Schreibvorgang sperrt.
   -------------------------------------------------------------------------- */

/** Ist das eine Person, deren Liste angeglichen werden muss? */
const qualAngleichen = (p) => !!p && typeof p === "object" && !Array.isArray(p.qualifikationen);

/**
 * Setzt bei jeder Person ohne gültige Liste `qualifikationen: []`.
 * Gültige Listen und alle anderen Felder bleiben unverändert; ohne Bedarf
 * kommt dasselbe Objekt zurück (nichts wird verändert, nichts kopiert).
 * @param {any} bestand
 */
export function personenAngleichen(bestand) {
  if (!bestand || typeof bestand !== "object" || !Array.isArray(bestand.mandanten)) return bestand;
  const braucht = (m) => !!m && Array.isArray(m.personen) && m.personen.some(qualAngleichen);
  if (!bestand.mandanten.some(braucht)) return bestand;
  return { ...bestand, mandanten: bestand.mandanten.map((m) => (braucht(m)
    ? { ...m, personen: m.personen.map((p) => (qualAngleichen(p) ? { ...p, qualifikationen: [] } : p)) }
    : m)) };
}

/**
 * Prüft eine übermittelte Eingabe: `qualifikationen` darf fehlen, null oder
 * eine Liste sein — jeder andere Typ ist ein Fehler des Absenders.
 * Gibt null oder { grund, feld } zurück.
 * @param {any} bestand
 */
export function personenFehler(bestand) {
  if (!bestand || typeof bestand !== "object" || !Array.isArray(bestand.mandanten)) return null;
  for (const [i, m] of bestand.mandanten.entries()) {
    if (!m || !Array.isArray(m.personen)) continue;
    for (const [j, p] of m.personen.entries()) {
      if (!p || typeof p !== "object") continue;
      const q = p.qualifikationen;
      if (q !== undefined && q !== null && !Array.isArray(q))
        return { grund: `Bei Person ${p.id ?? j} ist qualifikationen keine Liste.`, feld: `mandanten[${i}].personen[${j}].qualifikationen` };
    }
  }
  return null;
}

/**
 * Prüft die Form eines Bestands.
 * Gibt { ok: true } oder { ok: false, grund, feld } zurück.
 * @param {any} bestand
 * @param {{ vorher?: any }} [o]  der gespeicherte Stand: Aufbewahrungsfristen
 *   werden dann nur bei Betrieben geprüft, die sie ändern oder neu sind.
 */
export function pruefeGestalt(bestand, { vorher = null } = {}) {
  if (!bestand || typeof bestand !== "object" || Array.isArray(bestand))
    return { ok: false, grund: "Kein Bestandsobjekt." };

  for (const feld of PFLICHT) {
    if (!(feld in bestand))
      return { ok: false, grund: `Das Feld ${feld} fehlt.`, feld };
  }
  if (!Array.isArray(bestand.mandanten))
    return { ok: false, grund: "mandanten ist keine Liste.", feld: "mandanten" };

  /* Ein Bestand ohne Betriebe ist keine gültige Form. Wer wirklich alles
     löschen will, tut das über die Betriebsverwaltung, nicht über einen
     leeren Schreibvorgang. */
  if (!bestand.mandanten.length)
    return { ok: false, grund: "Ein Bestand ohne Betrieb wird nicht gespeichert.", feld: "mandanten" };

  const ids = mandantenKennungenGeprueft(bestand.mandanten);
  if (ids) return ids;
  const geaendert = aufbewahrungGeaendert(vorher);

  for (const m of bestand.mandanten) {
    for (const liste of LISTEN) {
      if (liste in m && !Array.isArray(m[liste]))
        return { ok: false, grund: `${m.id}.${liste} ist keine Liste.`, feld: liste };
    }
    if (Array.isArray(m.personen)) {
      for (const person of m.personen) {
        if (!person || typeof person !== "object")
          return { ok: false, grund: "Eine Person ist kein Objekt.", feld: "personen" };
        if (person.id === undefined || person.id === null)
          return { ok: false, grund: "Einer Person fehlt die Kennung.", feld: "personen[].id" };
      }
      /* Doppelte Kennungen brechen jede Zuordnung — Plan, Anträge, Zeiten. */
      const ids = m.personen.map((x) => String(x.id));
      if (new Set(ids).size !== ids.length)
        return { ok: false, grund: "Zwei Personen tragen dieselbe Kennung.", feld: "personen[].id" };
    }

    const zuViel = mengeGeprueft(m);
    if (zuViel) return zuViel;
    /* Aufbewahrungsfristen (WP-26, H1): ganze Zahlen in festen Grenzen.
       Bis November 2026 ungeprüft — „Infinity" ließ den Datenschutzlauf
       ewig rechnen und hielt damit den ganzen Server an. */
    /* Nur geänderte oder neue Betriebe streng (N-1): Ein ungültiger Altwert
       in einem anderen Betrieb desselben Raums (z. B. 1.5 aus der früheren
       Oberfläche) sperrte sonst das Speichern für alle. Der Datenschutzlauf
       überspringt und meldet ihn. */
    const frist = geaendert(m) ? aufbewahrungFehler(m.aufbewahrung) : null;
    if (frist) return { ok: false, grund: `${m.id}: ${frist}`, feld: "aufbewahrung" };
  }

  const uferlos = laengeGeprueft(bestand);
  if (uferlos) return uferlos;

  return { ok: true };
}

/* --------------------------------------------------------------------------
   KENNUNGEN DER BETRIEBE

   Zwei Betriebe mit derselben Kennung hielt bis Oktober 2026 nichts auf.
   Genau das ließ sich ausnutzen: Neben dem eigenen Betrieb ein zweites
   Exemplar mit derselben Kennung mitschicken — die Einheitsprüfung sah nur
   das erste, beim Zerlegen in Monatsscherben verschmolzen beide, und die
   Änderungen am zweiten standen danach im echten Betrieb.

   Kennungen sind im ganzen Produkt Zeichenketten (uid, Raumname, „m-…").
   Alles andere wird abgewiesen, ebenso leere. Verglichen wird ohne
   Leerraum am Rand, damit „A" und „ A " nicht als zwei Betriebe
   durchgehen. Die Kennung selbst wird nicht verändert.
   -------------------------------------------------------------------------- */
export function mandantenKennungenGeprueft(mandanten) {
  if (!Array.isArray(mandanten)) return null;
  const gesehen = new Set();
  for (const m of mandanten) {
    if (!m || typeof m !== "object" || Array.isArray(m))
      return { ok: false, grund: "Ein Betrieb ist kein Objekt.", feld: "mandanten" };
    if (typeof m.id !== "string" || !m.id.trim())
      return { ok: false, grund: "Einem Betrieb fehlt eine gültige Kennung.", feld: "mandanten[].id" };
    const vergleich = m.id.trim();
    if (gesehen.has(vergleich))
      return { ok: false, grund: "Zwei Betriebe tragen dieselbe Kennung.", feld: "mandanten[].id" };
    gesehen.add(vergleich);
  }
  return null;
}

/* --------------------------------------------------------------------------
   OBERGRENZEN

   Bis hierher prüfte diese Datei nur die Form, nicht das Maß. Der Rumpf
   einer Anfrage ist auf sechs Megabyte begrenzt — darunter passt aber immer
   noch ein einzelnes Notizfeld mit fünf Millionen Zeichen, oder eine
   Personenliste mit hunderttausend Einträgen. Beides bricht keine Regel und
   macht den Betrieb trotzdem unbrauchbar: Jede Auswertung rechnet darüber,
   und jeder folgende Schreibvorgang trägt es wieder mit.

   Die Grenzen sind bewusst weit. Sie sollen nichts verhindern, was ein
   echter Betrieb tut — der größte denkbare Kunde hat einige tausend
   Beschäftigte, nicht hunderttausend —, und alles auffangen, was offenbar
   kein Betrieb mehr ist.
   -------------------------------------------------------------------------- */

/** Wie lang darf eine einzelne Zeichenkette im Bestand sein? */
const TEXT_MAX = 100_000;

/** Wie viele Einträge darf eine Liste je Betrieb tragen? */
const MENGEN = {
  personen: 20_000, einheiten: 2_000, dienstarten: 500, standorte: 500,
  qualifikationen: 500, kompetenzen: 5_000, aufgaben: 500, betriebsmittel: 50_000, objekte: 500,
  abwesenheiten: 200_000, anfragen: 100_000,
  nachrichten: 100_000, wuensche: 200_000, ausschreibungen: 20_000,
  uebergaben: 100_000, protokoll: 50_000, aenderungen: 100_000,
};

function mengeGeprueft(m) {
  for (const [feld, grenze] of Object.entries(MENGEN)) {
    const liste = m[feld];
    if (Array.isArray(liste) && liste.length > grenze)
      return { ok: false, feld,
        grund: `${feld} trägt ${liste.length} Einträge — mehr als ${grenze} nimmt der Server nicht an.` };
  }
  return null;
}

/**
 * Sucht die erste uferlose Zeichenkette. Läuft über den ganzen Bestand,
 * mit begrenzter Tiefe: Ein zyklisch verschachteltes Objekt darf diese
 * Prüfung nicht in eine Endlosschleife schicken.
 */
function laengeGeprueft(wert, tiefe = 0, pfad = "") {
  if (tiefe > 12) return null;
  if (typeof wert === "string")
    return wert.length > TEXT_MAX
      ? { ok: false, feld: pfad || "text",
          grund: `Ein Feld trägt ${wert.length} Zeichen — höchstens ${TEXT_MAX} sind vorgesehen.` }
      : null;
  if (Array.isArray(wert)) {
    /* Nur die ersten Tausend je Liste — die Prüfung darf nicht teurer
       werden als das Schreiben selbst. */
    for (let i = 0; i < Math.min(wert.length, 1000); i++) {
      const f = laengeGeprueft(wert[i], tiefe + 1, `${pfad}[${i}]`);
      if (f) return f;
    }
    return null;
  }
  if (wert && typeof wert === "object") {
    for (const [k, v] of Object.entries(wert)) {
      const f = laengeGeprueft(v, tiefe + 1, pfad ? `${pfad}.${k}` : k);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Wie stark schrumpft der Bestand? Gibt den Anteil zurück, der wegfällt.
 *
 * Gezählt wird nicht in Bytes, sondern in Datensätzen: Ein umformatiertes
 * JSON ändert die Byteanzahl, ohne dass jemand etwas verliert.
 */
export function schrumpfung(alt, neu) {
  const zaehle = (b) => {
    if (!b || !Array.isArray(b.mandanten)) return 0;
    let n = 0;
    for (const m of b.mandanten) {
      if (!m) continue;
      for (const liste of LISTEN) if (Array.isArray(m[liste])) n += m[liste].length;
      if (m.abweichungen && typeof m.abweichungen === "object")
        n += Object.keys(m.abweichungen).length;
    }
    return n;
  };
  const a = zaehle(alt);
  const b = zaehle(neu);
  if (a === 0) return { anteil: 0, vorher: a, nachher: b };
  return { anteil: Math.max(0, (a - b) / a), vorher: a, nachher: b };
}

/* Ab welchem Verlust wird vorsorglich gesichert? Ein Drittel ist mehr, als
   bei normaler Pflege wegfällt, und weniger als ein Unfall. */
export const SICHERUNGSSCHWELLE = 0.34;
