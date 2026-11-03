import { kontoIdSchluessel, mitgliedSchluessel, mitgliedlaufSchluessel, generationStimmt } from "./accounts.mjs";

/* ==========================================================================
   WOHER KOMMT DIESER KALENDER-FEED — UND GILT DAS NOCH? (WP-24)

   Das Feed-Geheimnis ist ein Bearer-Zugang ohne Sitzung. Bisher prüfte jeder
   Abruf die Person im Bestand (feedPersonGilt). Offen blieb, was die
   Berechtigung der Person selbst trägt: das Konto, die Mitgliedschaft im
   Betrieb, der Zugangscode. Wurde einer davon gesperrt oder entzogen, lieferte
   der Feed weiter — bis jemand die Person im Bestand sperrte.

   Darum trägt ein neuer Feed seine Herkunft aus der Sitzung, mit der er
   eingerichtet wurde:

     { art: "account", accountId, generation }   Sitzung aus einem Konto
     { art: "code", konto }                      Sitzung aus einem Zugangscode
                                                 (konto = Prüfsumme des Codes)

   Bei jedem Abruf gilt:
     account  Konto aktiv, Mitgliedschaft für genau diesen Raum aktiv, ihre
              Generation und die des Laufs stimmen mit der des Feeds überein.
              Ein Entzug zählt die Generation weiter — ein später neu
              ausgesprochener Zugang macht den alten Verweis nicht wieder
              gültig. Die Epoche (Passwortwechsel) und die Anmeldesitzung
              zählen hier nicht: Ein Kalender kann sich nicht erneut anmelden;
              wer den Verweis zurückziehen will, tut das einzeln (loeschen).
     code     Das Zugangskonto gibt es noch und ist nicht gesperrt.
     ohne     Feeds aus der Zeit vor WP-24: nur die Prüfung der Person.

   Alles außer einem eindeutig negativen Befund ist KEIN Widerruf: Ein
   Lesefehler der Ablage wirft (500/503), der Feed bleibt unangetastet.
   ========================================================================== */

/** Die Herkunft, die ein Feed aus der einrichtenden Sitzung bekommt (oder null). */
export function feedHerkunftAus(sitzung) {
  const h = sitzung && sitzung.herkunft;
  if (h && typeof h === "object" && h.art === "account" && typeof h.accountId === "string" && h.accountId
    && Number.isInteger(h.generation) && h.generation >= 1)
    return { art: "account", accountId: h.accountId, generation: h.generation };
  if (sitzung && typeof sitzung.konto === "string" && sitzung.konto && !h)
    return { art: "code", konto: sitzung.konto };
  return null;
}

/** Strenges Lesen: ein Lesefehler wirft, nur ein fehlender Schlüssel ergibt null. */
const lies = (store, schluessel) => store.get(schluessel, { type: "json" });

/**
 * @param {any} store
 * @param {{ bestand: string, herkunft?: any }} eintrag der Feed-Eintrag
 * @returns {Promise<{ gilt: true } | { gilt: false, grund: string }>}
 */
export async function feedHerkunftGilt(store, eintrag) {
  const h = eintrag && eintrag.herkunft;
  if (h === undefined || h === null) return { gilt: true };            // Altfeed ohne Herkunft
  if (typeof h !== "object") return { gilt: false, grund: "herkunft" };
  const raum = eintrag.bestand;

  if (h.art === "account") {
    if (typeof h.accountId !== "string" || !h.accountId || typeof raum !== "string" || !raum) return { gilt: false, grund: "herkunft" };
    const zeiger = await lies(store, kontoIdSchluessel(h.accountId));
    if (!zeiger || !zeiger.schluessel) return { gilt: false, grund: "konto-fehlt" };
    const konto = await lies(store, zeiger.schluessel);
    if (!konto || konto.id !== h.accountId) return { gilt: false, grund: "konto-fehlt" };
    if (konto.status !== "aktiv") return { gilt: false, grund: "konto-status" };
    const m = await lies(store, mitgliedSchluessel(h.accountId, raum));
    if (!m || m.accountId !== h.accountId || m.raum !== raum) return { gilt: false, grund: "mitglied-fehlt" };
    if (m.status !== "aktiv") return { gilt: false, grund: "mitglied-status" };
    const lauf = await lies(store, mitgliedlaufSchluessel(h.accountId, raum));
    if (!lauf || lauf.accountId !== h.accountId || lauf.raum !== raum || !Number.isInteger(lauf.generation))
      return { gilt: false, grund: "lauf" };
    if (!generationStimmt(m, lauf.generation) || h.generation !== lauf.generation) return { gilt: false, grund: "generation" };
    return { gilt: true };
  }

  if (h.art === "code") {
    if (typeof h.konto !== "string" || !h.konto) return { gilt: false, grund: "herkunft" };
    let k = await lies(store, `konto:${h.konto}`);
    if (!k) {                                                           // Sammelblob aus der Zeit vor den Einzelschlüsseln
      const sammel = (await lies(store, "konten")) || {};
      k = sammel[h.konto] || null;
    }
    if (!k) return { gilt: false, grund: "code-fehlt" };
    if (k.gesperrt) return { gilt: false, grund: "code-gesperrt" };
    return { gilt: true };
  }

  return { gilt: false, grund: "herkunft" };
}
