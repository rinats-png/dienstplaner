/* ==========================================================================
   KUNDENRAUMSCHUTZ (SI-P6, Betreiberentscheidung 2026-11-07, Freigabepaket G.2)

   Der Betreiber darf für BESTEHENDE Kundenräume ohne nachweisbare
   Kundenzustimmung keine neuen Zugänge erzeugen — auf allen Wegen, die
   Zugangscodes anlegen (POST /api/zugaenge, POST /einrichten), für jede Rolle.
   Frische Anmeldung und zweiter Faktor ersetzen keine Kundenzustimmung, und
   das Fehlen eines wirksamen Leitungszugangs ist keine Zustimmung.

   Erlaubt bleibt die kontrollierte Ersteinrichtung eines NEUEN Betriebs.
   Weil /einrichten je Aufruf nur einen Code anlegt und die Einrichtung eines
   Betriebs aus mehreren Codes besteht, gilt ein Raum so lange als in
   Ersteinrichtung, wie ein serverseitig vermerktes Fenster offen ist:

     neu        kein Zugang (Betreibercodes zählen nicht), keine Mitgliedschaft
                und kein Vermerk → erlaubt; der erste Vorgang vermerkt das
                Fenster (FENSTER_MS), bevor irgendein Code entsteht
     fenster    der Vermerk ist noch offen und es gibt keine Mitgliedschaft
                → erlaubt (weitere Codes der Einrichtung)
     demo       nur Demozugänge (auch gesperrte), mindestens einer, kein
                offener Vermerk → erlaubt, aber nur für Demozugänge
     kundenraum alles andere → gesperrt: jeder Zugang (auch gesperrt,
                abgelaufen), jede Mitgliedschaft (auch entzogen), ein
                abgelaufener Vermerk. Ein abgelaufenes Fenster öffnet sich nie
                wieder.

   Fail-closed: Die Leser hier werfen bei jedem Lesefehler (die allgemeinen
   Sammelleser alleKonten/mitgliedschaftenDesRaums schlucken Fehler und
   ergäben fälschlich „neu“). Ein unlesbarer oder unverständlicher Vermerk
   ist nie „offen“.
   ========================================================================== */

import { raummitgliedSchluessel } from "./accounts.mjs";

const KONTO = "konto:";
const SAMMEL = "konten";
const VERMERK = "ersteinrichtung:";

/** Dauer des Fensters der Ersteinrichtung eines neuen Betriebs. */
export const FENSTER_MS = 15 * 60 * 1000;

/** Alle Zugänge dieses Raums in jedem Zustand, außer Betreibercodes. Jeder Lesefehler wirft. */
async function zugaengeDesRaums(store, raum) {
  const gefunden = [];
  const sammel = (await store.get(SAMMEL, { type: "json" })) || {};
  for (const k of Object.values(sammel)) if (k && typeof k === "object" && k.bestand === raum && k.rolle !== "betreiber") gefunden.push(k);
  const { blobs } = await store.list({ prefix: KONTO });
  for (const b of blobs) {
    const k = await store.get(b.key, { type: "json" });
    if (k && typeof k === "object" && k.bestand === raum && k.rolle !== "betreiber") gefunden.push(k);
  }
  return gefunden;
}

/**
 * Wie steht dieser Raum zur Neuanlage von Zugängen?
 * @param {any} store
 * @param {string} raum
 * @param {number} [jetzt]
 * @returns {Promise<{art: "neu"|"fenster"|"demo"|"kundenraum", grund?: string}>}
 * @throws wenn die Ablage nicht (vollständig) lesbar ist
 */
export async function raumLage(store, raum, jetzt = Date.now()) {
  if (typeof raum !== "string" || !raum) throw new Error("Raum fehlt");
  const zugaenge = await zugaengeDesRaums(store, raum);
  const vorsatz = raummitgliedSchluessel(raum, "");
  const { blobs: mitgliedschaften } = await store.list({ prefix: vorsatz });
  const vermerk = await store.get(VERMERK + raum, { type: "json" });

  if (mitgliedschaften.length > 0) return { art: "kundenraum", grund: "mitgliedschaften" };
  const offen = !!vermerk && typeof vermerk === "object" && Number.isFinite(vermerk.bis) && vermerk.bis > jetzt;
  if (offen) return { art: "fenster" };
  /* Nur Demozugänge (auch gesperrte): Demoraum, unabhängig von einem abgelaufenen Vermerk — das Bereitstellungsskript
     legt Demozugänge später wieder an. Nur ein Raum mit mindestens einem Zugang kann so heißen. */
  if (zugaenge.length > 0 && zugaenge.every((k) => k.demo === true)) return { art: "demo" };
  if (vermerk) return { art: "kundenraum", grund: "fenster_abgelaufen" };
  if (zugaenge.length === 0) return { art: "neu" };
  return { art: "kundenraum", grund: "zugaenge" };
}

/**
 * Vermerkt den Beginn der Ersteinrichtung (nur wenn es noch keinen Vermerk gibt; ein vorhandener, auch
 * abgelaufener, wird nie überschrieben). Vor dem ersten Code aufrufen; wirft, wenn nicht geschrieben werden kann.
 * @param {any} store
 * @param {string} raum
 * @param {number} [jetzt]
 */
export async function ersteinrichtungVermerken(store, raum, jetzt = Date.now()) {
  await store.setJSONWennNeu(VERMERK + raum, { raum, seit: jetzt, bis: jetzt + FENSTER_MS });
}

/**
 * Darf der Betreiberweg jetzt Zugänge für diesen Raum anlegen?
 * @param {{art: string}} lage
 * @param {boolean} nurDemo  alle anzulegenden Zugänge sind Demozugänge
 */
export const neueZugaengeErlaubt = (lage, nurDemo) =>
  lage.art === "neu" || lage.art === "fenster" || (lage.art === "demo" && nurDemo === true);

/** Antwort-Text, einheitlich für beide Wege. */
export const KUNDENRAUM_TEXT = "Für einen bestehenden Betrieb legt der Betreiber keine neuen Zugänge an. "
  + "Das ist nur mit nachweisbarer Zustimmung des Kunden möglich.";
