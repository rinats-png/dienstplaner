/* ==========================================================================
   WP-I12b — Paketliste und Merkmalpruefung serverseitig (Frage 1 aus docs/acc45/wp-i12-fragen.md)

   Geprueft:
   - die Paketliste (PAKETE) und kannMerkmal stehen in server/lib/paketliste.mjs als gemeinsame Quelle;
     src/stufen.js und src/paketlogik.js reichen nur weiter (gleiche Objekte, keine zweite Kopie);
   - der Rechenkern wertet "Merkmal gebucht und nutzbar" ohne src/ aus: fachkraftLage ohne Haken liefert
     dieselbe Aussage wie der Client.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import * as Befunde from "../server/lib/engine/befunde.mjs";
import { FEST } from "./engine-golden.fixture.mjs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const server = () => import("../server/lib/paketliste.mjs");

/** Ein Pflegebetrieb mit Fachkraftquote, ohne Oberflaeche aufgebaut. */
function betrieb(pakete) {
  const m = baueLeerenBetrieb({ name: "Testbetrieb", branche: "pflege", email: "x@example.org", land: "HE", raum: "m-pl" }).mandanten[0];
  m.pakete = pakete;
  if (!m.qualifikationen.some((q) => q.fachkraft)) m.qualifikationen.push({ id: "q-fk", name: "Fachkraft", fachkraft: true });
  m.dienstarten[0].fachkraftQuote = 0.5;
  return m;
}

beforeAll(() => { vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

describe("WP-I12b: Paketliste als gemeinsame Quelle", () => {
  it("Server-Paketliste ist gleich der Client-Paketliste (gleiche Objekte, keine zweite Kopie)", async () => {
    const S = await server();
    const C = await import("../src/stufen.js");
    expect(S.PAKETE.length).toBeGreaterThan(1);
    expect(C.PAKETE).toEqual(S.PAKETE);
    expect(C.PAKETE).toBe(S.PAKETE);
    expect(C.paketVon("pflege")).toBe(S.paketVon("pflege"));
    expect(S.PAKETE.map((p) => p.id)).toEqual(["kern", "sicherheit", "pflege", "klinik", "industrie"]);
  });
  it("Paketinhalte unveraendert (Merkmale, Preise)", async () => {
    const S = await server();
    expect(Object.fromEntries(S.PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis])))
      .toEqual({ sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 });
    expect(S.PAKETE.find((p) => p.id === "pflege").merkmale).toEqual(["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"]);
  });
  it("kannMerkmal des Clients ist die des Servers", async () => {
    const S = await server();
    const L = await import("../src/paketlogik.js");
    expect(L.kannMerkmal).toBe(S.kannMerkmal);
  });
  it("kannMerkmal: gebucht UND nutzbar; Kern immer; ungebucht, unbekannt, kaputte Liste nie", async () => {
    const S = await server();
    expect(S.kannMerkmal({ pakete: ["pflege"] }, "fachkraftquote")).toBe(true);
    expect(S.kannMerkmal({ pakete: [] }, "fachkraftquote")).toBe(false);
    expect(S.kannMerkmal({ pakete: "pflege" }, "fachkraftquote")).toBe(false);
    expect(S.kannMerkmal({ pakete: ["pflege"] }, "geofence")).toBe(false);
    expect(S.kannMerkmal({ pakete: [] }, "plan")).toBe(true);
    expect(S.kannMerkmal(null, "nichts")).toBe(false);
  });
});

describe("WP-I12b: Fachkraftquote serverseitig, ohne src/", () => {
  it("ohne Haken rechnet der Server die Fachkraftquote mit Merkmal (gleiche Aussage wie der Client)", async () => {
    const m = betrieb(["pflege"]);
    const da = m.dienstarten[0].id;
    const serverseitig = Befunde.fachkraftLage(m, "2026-11-03", da);      // vor dem Laden der Oberflaeche
    expect(serverseitig).not.toBeNull();
    const F = await import("../src/lib/fachlogik.js");
    expect(F.fachkraftLage(m, "2026-11-03", da)).toEqual(serverseitig);
  });
  it("ohne gebuchtes Paket keine Fachkraftquote (Server wie Client)", async () => {
    const m = betrieb([]);
    const da = m.dienstarten[0].id;
    expect(Befunde.fachkraftLage(m, "2026-11-03", da)).toBeNull();
    const F = await import("../src/lib/fachlogik.js");
    expect(F.fachkraftLage(m, "2026-11-03", da)).toBeNull();
  });
  it("der Rechenkern haengt nicht von src/ ab; fachlogik setzt keinen eigenen Haken mehr", () => {
    expect(lies("server/lib/engine/befunde.mjs")).not.toMatch(/from "\.\.\/\.\.\/\.\.\/src\//);
    expect(lies("server/lib/paketliste.mjs")).not.toMatch(/from "\.\.\/\.\.\/src\//);
    expect(lies("src/lib/fachlogik.js")).not.toMatch(/^merkmalPruefungSetzen\(/m);
  });
});
