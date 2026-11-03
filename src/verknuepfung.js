/* ==========================================================================
   VERKNÜPFUNGEN (WP-37)

   Das Manifest bietet auf dem Startbildschirm zwei Verknüpfungen an:
     /?ansicht=meine   Meine Schichten
     /?ansicht=krank   Krank melden

   Diese Funktion macht aus der Adresszeile ein Ziel — oder nichts. Es gibt
   eine feste Liste; alles andere (andere Ansichten, doppelte Angaben,
   Groß-/Kleinschreibung, Fremdes) wird ignoriert. Welche Ansicht die Person
   tatsächlich sehen darf, entscheidet weiterhin die Oberfläche anhand ihrer
   Navigation und ihrer Rechte — hier wird kein Recht vergeben.
   ========================================================================== */
const ANSICHTEN = new Set(["meine"]);

export function verknuepfungsZiel(suche) {
  let p;
  try { p = new URLSearchParams(String(suche || "")); } catch { return null; }
  const alle = p.getAll("ansicht");
  if (alle.length !== 1) return null;
  const a = alle[0];
  if (a === "krank") return { art: "krank" };
  if (ANSICHTEN.has(a)) return { art: "ansicht", id: a };
  return null;
}
