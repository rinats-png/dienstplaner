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

   Vorrang vor allem anderen (Review SI-P6, Befunde 1, 3, 4, 5) — jeweils
   „kundenraum“, nie „neu“:
     - eine begonnene, nicht abgeschlossene Raumlöschung (Marke
       loeschung:<raum>, raumloeschung.mjs/aufraeumen.mjs): Ein Teilabbruch
       nimmt Konten, Mitgliedschaften und Vermerk womöglich schon mit, Kern
       und Personal bleiben — der Raum ist dann nicht neu;
     - Selbststart-Räume: Raumkennung „t-…“ (nur /starten bildet sie), ein
       Betrieb mit selbstAngelegt im Kern oder ein Eintrag in der
       Nachfassliste „selbststarts“. Ihre Zugänge legt die Provisionierung
       selbst an; zwischen Kern und Mitgliedschaft (provisionierung.mjs) darf
       der Betreiber keinen Code einschieben;
     - jede Mitgliedschaft, gefunden über den Raumindex raummitglied:<raum>:*
       UND über mitglied:<account>:<raum> (eine Mitgliedschaft ohne Index
       zählt ebenso);
     - im Fenster: eine Sitzung einer Kundin oder eines Kunden für diesen
       Raum (kein Betreiber, kein Demozugang). Wer sich angemeldet hat, nutzt
       den Raum — ab dann ist das Fenster zu.
   Demoräume „demo-…“ sind nie „neu“: Sie nehmen nur Demozugänge auf, und
   nur solange es dort keinen anderen Kundenzugang gibt.

   Fail-closed: Die Leser hier werfen bei jedem Lesefehler (die allgemeinen
   Sammelleser alleKonten/mitgliedschaftenDesRaums schlucken Fehler und
   ergäben fälschlich „neu“). Ein unlesbarer oder unverständlicher Vermerk
   ist nie „offen“.
   ========================================================================== */

import { raummitgliedSchluessel } from "./accounts.mjs";
import { sitzungsSpeicher } from "./sitzungen.mjs";

const KONTO = "konto:";
const SAMMEL = "konten";
const VERMERK = "ersteinrichtung:";
const LOESCHMARKE = "loeschung:";
const MITGLIED = "mitglied:";

const istSelbststartKennung = (raum) => raum.startsWith("t-");
const istDemoKennung = (raum) => /^demo-/i.test(raum);

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

/** Irgendeine Mitgliedschaft (jeder Zustand) — über den Raumindex UND über die Mitgliedschaft selbst. Wirft bei Lesefehlern. */
async function mitgliedschaftVorhanden(store, raum) {
  const { blobs: index } = await store.list({ prefix: raummitgliedSchluessel(raum, "") });
  if (index.length > 0) return true;
  /* mitglied:<account>:<raum> — der Raum steht hinten, die Ablage kennt nur Präfixe. Großzügig auf das Ende geprüft:
     Ein Treffer zu viel sperrt nur, einer zu wenig öffnete. */
  const { blobs } = await store.list({ prefix: MITGLIED });
  return blobs.some((b) => typeof b.key === "string" && b.key.endsWith(`:${raum}`));
}

/** Ein Selbststart: ein Betrieb mit selbstAngelegt im Kern oder ein Eintrag in der Nachfassliste. Wirft bei Lesefehlern. */
async function selbststartVermerkt(store, raum) {
  const kern = await store.get(`kern:${raum}`, { type: "json" });
  if (kern && typeof kern === "object" && Array.isArray(kern.mandanten)
    && kern.mandanten.some((m) => m && typeof m === "object" && m.selbstAngelegt === true)) return true;
  const liste = await store.get("selbststarts", { type: "json" });
  return Array.isArray(liste) && liste.some((x) => x && typeof x === "object" && x.raum === raum);
}

/** Eine Sitzung aus einem Kundenzugang dieses Raums (kein Betreiber, kein Demozugang), auch eine abgelaufene. Wirft bei Lesefehlern. */
async function kundensitzungVorhanden(sitzungen, raum) {
  const { blobs } = await sitzungen.list({ prefix: "t:" });
  for (const b of blobs) {
    const sx = await sitzungen.get(b.key, { type: "json" });
    if (sx && typeof sx === "object" && sx.bestand === raum && sx.rolle !== "betreiber" && sx.demo !== true) return true;
  }
  return false;
}

/**
 * Wie steht dieser Raum zur Neuanlage von Zugängen?
 * @param {any} store
 * @param {string} raum
 * @param {number} [jetzt]
 * @param {any} [sitzungen]  Ablage der Sitzungen (Vorgabe: centric-sitzungen)
 * @returns {Promise<{art: "neu"|"fenster"|"demo"|"kundenraum", grund?: string}>}
 * @throws wenn die Ablage nicht (vollständig) lesbar ist
 */
export async function raumLage(store, raum, jetzt = Date.now(), sitzungen = null) {
  if (typeof raum !== "string" || !raum) throw new Error("Raum fehlt");
  /* Eine begonnene Löschung zuerst: Danach ist womöglich nichts mehr da, woran ein Kundenraum zu erkennen wäre. */
  if ((await store.get(LOESCHMARKE + raum, { type: "json" })) != null) return { art: "kundenraum", grund: "loeschung_begonnen" };
  if (istSelbststartKennung(raum)) return { art: "kundenraum", grund: "selbststart" };
  if (await selbststartVermerkt(store, raum)) return { art: "kundenraum", grund: "selbststart" };
  if (await mitgliedschaftVorhanden(store, raum)) return { art: "kundenraum", grund: "mitgliedschaften" };
  const zugaenge = await zugaengeDesRaums(store, raum);
  const vermerk = await store.get(VERMERK + raum, { type: "json" });

  /* Demoraum: nur Demozugänge, nie eine Ersteinrichtung mit Kundenzugängen. */
  if (istDemoKennung(raum)) {
    return zugaenge.every((k) => k.demo === true) ? { art: "demo" } : { art: "kundenraum", grund: "zugaenge" };
  }
  const offen = !!vermerk && typeof vermerk === "object" && Number.isFinite(vermerk.bis) && vermerk.bis > jetzt;
  if (offen) {
    if (await kundensitzungVorhanden(sitzungen || sitzungsSpeicher(), raum)) return { art: "kundenraum", grund: "kundensitzung" };
    return { art: "fenster" };
  }
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
