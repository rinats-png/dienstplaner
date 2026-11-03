/* ==========================================================================
   VERKNÜPFUNGEN (WP-37)

   Das Manifest bietet auf dem Startbildschirm zwei Verknüpfungen an:
     /?ansicht=meine   Meine Schichten
     /?ansicht=krank   Krank melden

   verknuepfungsZiel macht aus der Adresszeile ein Ziel — oder nichts. Es gibt
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

/**
 * Was passiert mit einem Ziel für diese Person? Reine Funktion; die Liste der
 * erlaubten Ansichten (Navigation samt Rechten) liefert die Oberfläche.
 *   { art: "ansicht", id, mobilTab } | { art: "krank", personId } | null
 * - Eine Ansicht nur, wenn sie in der Navigation der Person steht.
 * - Krank melden nie für den Betreiber (er hat keine Person im Betrieb).
 * - Auf dem Telefon (reine Mitarbeitende) gibt es keine Ansichten, sondern
 *   Reiter: „meine“ ist dort der Reiter „plan“.
 */
export function verknuepfungAnwenden({ betreiber, navIds, personId, mobil }, ziel) {
  if (!ziel) return null;
  if (ziel.art === "ansicht") {
    if (!Array.isArray(navIds) || !navIds.includes(ziel.id)) return null;
    return { art: "ansicht", id: ziel.id, mobilTab: mobil && ziel.id === "meine" ? "plan" : null };
  }
  if (ziel.art === "krank") return betreiber || !personId ? null : { art: "krank", personId };
  return null;
}

/** Adresse ohne den Verknüpfungsparameter (Pfad, übrige Angaben und Anker bleiben). */
export function ohneVerknuepfung(href) {
  const u = new URL(href);
  u.searchParams.delete("ansicht");
  return u.pathname + u.search + u.hash;
}
