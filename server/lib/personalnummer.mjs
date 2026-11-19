/* ==========================================================================
   Personalnummer — serverseitige Eindeutigkeit je Betrieb
   (Auflage C aus dem Datenreview PR #130)

   Die Oberfläche prüfte nur gegen ihren lokalen Stand. Der Server weist beim
   Speichern des Bestands eine Personalnummer ab, die eine ANDERE Person
   desselben Betriebs schon trägt (Vergleich nach trim, Groß-/Kleinschreibung
   egal). Bewusst nur NEUE Doppelungen:
   - Bestehende Doppelungen im gespeicherten Bestand bleiben unverändert und
     blockieren das Speichern anderer Personen nicht (keine automatische
     Bereinigung, Entscheidung 2026-11-09).
   - Eine Person, deren Nummer (normalisiert) gleich bleibt, ist kein Konflikt.
   - Geprüft wird nur innerhalb eines Betriebs (Mandantentrennung).
   ========================================================================== */

const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Vergleichsform: getrimmt, Kleinbuchstaben; leer/fehlend → "" (nie ein Konflikt). */
export function personalnummerNorm(x) {
  if (x === null || x === undefined) return "";
  if (typeof x !== "string" && typeof x !== "number") return "";
  return String(x).trim().toLowerCase();
}

/**
 * Die erste NEUE Doppelung einer Personalnummer, sonst null.
 * @param {any} altBestand gespeicherter Bestand (null bei Erstanlage)
 * @param {any} neuBestand zu schreibender Bestand
 * @returns {{mandantId: any, personId: any, personalnummer: string} | null}
 */
export function personalnummerKonflikt(altBestand, neuBestand) {
  const altMd = new Map((objekt(altBestand) && Array.isArray(altBestand.mandanten) ? altBestand.mandanten : [])
    .filter(objekt).map((m) => [m.id, m]));
  for (const m of (objekt(neuBestand) && Array.isArray(neuBestand.mandanten) ? neuBestand.mandanten : [])) {
    if (!objekt(m) || !Array.isArray(m.personen)) continue;
    const alt = altMd.get(m.id);
    const altNr = new Map((alt && Array.isArray(alt.personen) ? alt.personen : [])
      .filter(objekt).map((p) => [String(p.id), personalnummerNorm(p.personalnummer)]));
    const personen = m.personen.filter(objekt);
    const je = new Map();
    for (const p of personen) {
      const n = personalnummerNorm(p.personalnummer);
      if (!n) continue;
      if (!je.has(n)) je.set(n, []);
      je.get(n).push(String(p.id));
    }
    for (const p of personen) {
      const n = personalnummerNorm(p.personalnummer);
      if (!n) continue;
      if (altNr.has(String(p.id)) && altNr.get(String(p.id)) === n) continue;   // eigene Nummer unverändert
      if (je.get(n).some((id) => id !== String(p.id)))
        return { mandantId: m.id, personId: p.id, personalnummer: String(p.personalnummer).trim() };
    }
  }
  return null;
}

/** Verständliche Meldung — ohne Namen der anderen Person (die Rolle sieht sie womöglich nicht). */
export const personalnummerText = (k) => `Die Personalnummer „${k.personalnummer}" ist in diesem Betrieb schon an eine andere Person vergeben. `
  + "Bitte eine andere Nummer wählen. Es wurde nichts geändert.";
