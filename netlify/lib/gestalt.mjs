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

/** Felder, die ein Bestand haben muss, um überhaupt einer zu sein. */
const PFLICHT = ["mandanten"];

/** Listen je Betrieb, die ein Array sein müssen, wenn sie vorhanden sind. */
const LISTEN = ["personen", "einheiten", "dienstarten", "abwesenheiten",
  "anfragen", "qualifikationen", "standorte"];

/**
 * Prüft die Form eines Bestands.
 * Gibt { ok: true } oder { ok: false, grund, feld } zurück.
 */
export function pruefeGestalt(bestand) {
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

  for (const m of bestand.mandanten) {
    if (!m || typeof m !== "object")
      return { ok: false, grund: "Ein Betrieb ist kein Objekt.", feld: "mandanten" };
    if (!m.id)
      return { ok: false, grund: "Einem Betrieb fehlt die Kennung.", feld: "mandanten[].id" };
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
  }
  return { ok: true };
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
