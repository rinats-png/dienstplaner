/* ==========================================================================
   GILT DIESE PERSON IM BETRIEB NOCH?  (SI-P2)

   Eine Berechtigung, die an eine Person hängt (der Kalenderfeed, die Sitzung aus
   einem Zugangscode), gilt nur, solange die Person im Betrieb steht:

     genau einmal in der Personalliste dieses Betriebs (mehrdeutig gilt nicht),
     nicht anonymisiert,
     nicht deaktiviert (`status` außer „aktiv"; ohne Angabe gilt sie als aktiv),
     nicht ausgetreten (der Austrittstag zählt noch).

   Das war als Regel des Kalenderfeeds geschrieben (kalender.mjs, feedPersonGilt).
   Die Sitzung aus einem Code hatte keine; eine ausgeschiedene Person behielt ihre
   Sitzung. Beide fragen jetzt dieselbe Funktion, damit es nicht zwei Wahrheiten
   über „ausgeschieden" gibt.

   Reine Funktion, ohne Ablage: Der Aufrufer bringt den gelesenen Betrieb mit.
   ========================================================================== */

/**
 * Die Person, wenn sie in diesem Betrieb gilt, sonst `null`.
 * @param {any} mandant  ein Betrieb aus `bestand.mandanten`
 * @param {any} personId
 * @param {string} heute  Tag der Prüfung (JJJJ-MM-TT, Europe/Berlin)
 * @returns {any | null}
 */
export function aktivePerson(mandant, personId, heute) {
  if (!mandant || !Array.isArray(mandant.personen)) return null;
  const treffer = mandant.personen.filter((x) => x && String(x.id) === String(personId));
  if (treffer.length !== 1) return null;
  const person = treffer[0];
  if (person.anonym) return null;
  if (person.status !== undefined && person.status !== null && person.status !== "aktiv") return null;
  if (person.austritt && String(person.austritt) < heute) return null;
  return person;
}
