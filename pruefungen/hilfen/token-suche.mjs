/* QS-1: tokenbasierte Suche für "kommt nicht vor"-Prüfungen in Protokollen.
   Ein kurzer Wert wie die Personalnummer 3002 darf nicht als Zufallstreffer in Zeitstempeln
   (".3002Z"), Ids oder Hashes zählen. Ein Treffer zählt nur, wenn der Wert nicht von Buchstaben
   oder Ziffern eingerahmt ist. Randzeichen, die selbst keine Buchstaben/Ziffern sind (".xlsx"),
   brauchen auf dieser Seite keine Grenze. Ein Wert, der über . : _ - fest in ein anderes Token eingebettet ist
   (Zeitstempel 38.3002, Uuid-Gruppe ab12-3002-cd), gilt ebenfalls nicht als Treffer. Die Prüfung wird dadurch nicht schwächer:
   "Personalnummer 3002", "pn=3002" oder "\"3002\"" werden weiterhin gefunden. */
const BUCHSTABE_ZIFFER = /[\p{L}\p{N}]/u;

export function tokenRegex(wert) {
  const s = String(wert);
  if (!s) throw new Error("leeres Token");
  const zahl = /^[0-9]+$/.test(s);   // nur rein numerische Werte: auch in Zeitstempeln/Uuid-Gruppen eingebettet = kein Treffer
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vorn = BUCHSTABE_ZIFFER.test(s[0]) ? (zahl ? "(?<![\\p{L}\\p{N}][.:_-])" : "") + "(?<![\\p{L}\\p{N}])" : "";
  const hinten = BUCHSTABE_ZIFFER.test(s[s.length - 1]) ? (zahl ? "(?![.:_-][\\p{L}\\p{N}])" : "") + "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(vorn + esc + hinten, "u");
}

/** true, wenn der Wert als eigenständiges Token im Text steht. */
export const enthaeltToken = (text, wert) => tokenRegex(wert).test(String(text));
