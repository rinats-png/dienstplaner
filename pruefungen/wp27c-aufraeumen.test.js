/* ==========================================================================
   WP-27c Punkt 1 — Aufräumen der eingefrorenen Monate (Betriebsrat-Auswertung)

   Die Auslegung von „Aufräumen von −2“ ist offen (docs/acc45/wp-kleinpakete-fragen.md, Frage 6).
   Festgehalten wird die Grenze, die unabhängig von der Auslegung gelten muss:
   Aufgeräumt wird ausschließlich VOR dem Auswertungszeitraum; jeder Monat im Zeitraum
   (auch die Monate, die noch nachträglich bestätigt werden können) bleibt unberührt.

   Aufruf: npx vitest run pruefungen/wp27c-aufraeumen.test.js
   ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { auswertungHolen, auswertungenVergessen, istSchluessel, BR_AUFRAEUMEN_MONATE } from "../server/lib/br-auswertung.mjs";

const SPAET = "2026-06-20";

const person = (id) => ({
  id, vorname: "V", nachname: `N-${id}`, rolle: "mitarbeiter", bereich: "A", status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "A" }],
});
function mandant() {
  const personen = [], erfassung = {};
  for (let i = 0; i < 3; i++) { personen.push(person(`a${i}`)); erfassung[`a${i}|2026-05-12`] = { start: "06:00", ende: "15:00", bestaetigt: true }; }
  return { id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {},
    personen, abweichungen: {}, erfassung, abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
}
const ablageNeu = () => {
  const daten = new Map([["kern:wp27c", { raum: "wp27c" }]]);
  const kopie = (v) => JSON.parse(JSON.stringify(v));
  return { daten,
    get: async (k) => (daten.has(k) ? kopie(daten.get(k)) : null),
    setJSON: async (k, v) => { daten.set(k, kopie(v)); },
    setJSONWennNeu: async (k, v) => { if (daten.has(k)) return false; daten.set(k, kopie(v)); return true; },
    delete: async (k) => { daten.delete(k); } };
};
const monatPlus = (m, n) => { const [j, mo] = m.split("-").map(Number); const x = j * 12 + (mo - 1) + n; return `${Math.floor(x / 12)}-${String((x % 12) + 1).padStart(2, "0")}`; };
const warte = async (a) => { for (let i = 0; i < 600; i++) { const r = auswertungHolen(a); if (r.fertig) return r; await new Promise((w) => setTimeout(w, 5)); } throw new Error("nicht fertig"); };

describe("WP-27c Punkt 1: Aufräumen nur vor dem Auswertungszeitraum", () => {
  beforeEach(() => auswertungenVergessen());

  it("Monate im Zeitraum bleiben, die zwölf davor werden gelöscht, ältere bleiben", async () => {
    const a = ablageNeu();
    const w = await warte({ raum: "wp27c", heute: SPAET, mandant: mandant(), ablage: a });
    const von = [...new Set(w.wert.zeilen.map((r) => r.monat))].sort()[0];
    for (let i = -BR_AUFRAEUMEN_MONATE - 1; i <= 2; i++) await a.setJSON(istSchluessel("wp27c", "m1", monatPlus(von, i)), { zeilen: {} });
    auswertungenVergessen();                                               // neuer Monatswechsel im Prozess
    await warte({ raum: "wp27c", heute: SPAET, mandant: mandant(), ablage: a });
    const da = async (i) => (await a.get(istSchluessel("wp27c", "m1", monatPlus(von, i)))) !== null;
    expect(await da(-1)).toBe(false);                                      // unmittelbar vor dem Zeitraum: weg
    expect(await da(-BR_AUFRAEUMEN_MONATE)).toBe(false);
    expect(await da(-BR_AUFRAEUMEN_MONATE - 1)).toBe(true);                // ältere: erst die Raumlöschung
    expect(await da(0)).toBe(true);                                        // erster Monat des Zeitraums bleibt
    expect(await da(1)).toBe(true);
    expect(await da(2)).toBe(true);
  });
});
