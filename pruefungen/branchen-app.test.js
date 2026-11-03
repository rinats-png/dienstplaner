/* ==========================================================================
   BRANCHENMODULE — Verkabelung in der Oberfläche (WP-19, Review-Auflage 3)

   hindernisBefunde (src/App.jsx) reicht der Fachprüfung die Besetzung des
   Dienstes herein (`branchen.personenImDienst`); die Fachprüfung ruft die
   Branchenbefunde nur, wenn sie diese Besetzung bekommt. Beides prüft diese
   Datei mit einem Spion statt mit Quelltextsuche:
     - Oberfläche: der Hinweis aus einem Modul kommt als Befund der Art
       „branche" (Hinweis, sperrt nicht) im Dialog an, mit Regelkennung; die
       hereingereichte Besetzung enthält die geprüfte Person.
     - Server: ohne `branchen` (Nachrechnung in Häppchen) wird kein Modul
       gerufen (Mutant: Guard k.branchen entfernt → rot).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";

const aufrufe = [];
vi.mock("../server/lib/branchenbefunde.mjs", () => ({
  branchenBefunde: (m, da, d, o) => {
    aufrufe.push({ da: da.id, d, personen: o.personenImDienst ? o.personenImDienst(d, da.id) : null, person: o.person && o.person.id });
    return [{ regel: "branche", regelId: "ANLAGEN-BESETZUNG-01", modul: "anlagen", stufe: "hinweis", text: "Spion-Hinweis", quelle: "Test", art: "branche" }];
  },
}));

const HEUTE = "2026-11-04";
let A, E;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
  E = await import("../server/lib/fachpruefung.mjs");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

function betrieb() {
  const m = A.leererMandant("Branchen-App", "produktion");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "mitarbeiter"].map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "V", nachname: rolle }));
  return m;
}

describe("Oberfläche → Fachprüfung → Module", () => {
  it("hindernisBefunde reicht die Besetzung mit der geprüften Person herein und gibt den Branchenhinweis als Hinweis weiter", () => {
    const m = betrieb();
    const p = m.personen[1];
    const da = m.dienstarten[0];
    aufrufe.length = 0;
    const b = A.hindernisBefunde(m, p, HEUTE, da);
    const x = b.find((y) => y.regelId === "ANLAGEN-BESETZUNG-01");
    expect(x).toMatchObject({ stufe: "hinweis", art: "branche", regel: "branche", sperrt: false });
    expect(aufrufe.length).toBeGreaterThan(0);
    const a = aufrufe[0];
    expect(a).toMatchObject({ da: da.id, d: HEUTE, person: p.id });
    expect(a.personen.map((y) => y.id)).toContain(p.id);
  });
  it("ein Branchenhinweis allein sperrt nichts und verlangt keine Bestätigung", () => {
    const m = betrieb();
    const p = m.personen[1];
    expect(A.schutzSperre(m, p, HEUTE, m.dienstarten[0])).toBeNull();
    expect(A.hindernisse(m, p, HEUTE, m.dienstarten[0])).toEqual([]);
  });
});

describe("Server-Nachrechnung ohne Besetzung", () => {
  it("einteilungsBefunde ruft ohne k.branchen kein Modul (Mutant: Guard entfernt → rot)", () => {
    const m = betrieb();
    aufrufe.length = 0;
    const k = { dienstAm: () => null, alleinOhnePartner: () => false, heute: HEUTE };
    E.einteilungsBefunde(m, m.personen[1], m.dienstarten[0], HEUTE, k);
    expect(aufrufe).toEqual([]);
    E.einteilungsBefunde(m, m.personen[1], m.dienstarten[0], HEUTE, { ...k, branchen: { personenImDienst: () => [] } });
    expect(aufrufe).toHaveLength(1);
  });
});
