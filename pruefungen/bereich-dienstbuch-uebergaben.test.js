/* ==========================================================================
   DIENSTBUCH UND ÜBERGABEN — Einheitsbezug (Commit C2)

   Bis Commit C2 bekam die Schichtverantwortung Dienstbuch und Übergaben des
   ganzen Betriebs; schreiben durfte sie beides nicht (403), obwohl ihre
   Oberfläche es anbot. Übergaben waren eindeutig je Tag und Dienstart —
   betriebsweit, eine für alle Einheiten. Ein über die Betreiberkonsole
   angelegter Betrieb trug `uebergaben: {}` statt einer Liste.

   Jetzt tragen beide `einheitId` (bekannte Einheit oder null =
   betriebsweit). Die Schichtverantwortung sieht und schreibt nur ihre
   eigene Einheit; Altbestand ohne einheitId, null, Pool und fremde Einheiten
   bleiben ihr verborgen (fail-closed, nichts abgeleitet). Planung und
   Leitung arbeiten betriebsweit. Eine Übergabe ist eindeutig je Tag,
   Dienstart und Einheit.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { pruefeGestalt, uebergabenAngleichen } from "../server/lib/gestalt.mjs";

const D = "2026-10-15";
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const db = (id, einheitId) => ({ id, datum: D, art: "hinweis", text: `DB-${id}`, zeit: "07:00", durch: "Planung",
  ...(einheitId === undefined ? {} : { einheitId }) });
const ue = (id, dienstId, einheitId) => ({ id, datum: D, dienstId, ...(einheitId === undefined ? {} : { einheitId }),
  lage: `UE-${id}`, offen: "", vorkommnis: `VK-${id}`, material: "", von: "Planung", an: null, zeit: "x", personen: [], ergaenzungen: [] });
const bestand = (ich = person("s1", "subplaner", "eA")) => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "eA", name: "A" }, { id: "eB", name: "B" }, { id: "ePool", name: "Pool", pool: true }],
    dienstarten: [{ id: "F", name: "Früh" }, { id: "S", name: "Spät" }],
    personen: [ich, person("a1", "mitarbeiter", "eA"), person("b1", "mitarbeiter", "eB"), person("p1", "mitarbeiter", "ePool"),
      person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
    dienstbuch: [db("db-A", "eA"), db("db-B", "eB"), db("db-P", "ePool"), db("db-N", null), db("db-L", undefined)],
    uebergaben: [ue("u-A", "F", "eA"), ue("u-B", "F", "eB"), ue("u-P", "F", "ePool"), ue("u-N", "F", null), ue("u-L", "S", undefined)],
  }],
});
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const MA = { rolle: "mitarbeiter", person: "a1", betrieb: 0 };
const BR = { rolle: "betriebsrat", person: "r1", betrieb: 0 };
const PL = { rolle: "planer", person: "pl", betrieb: 0 };
const LT = { rolle: "leitung", person: "l1", betrieb: 0 };

const sicht = (s, g = bestand()) => bestandFuerRolle(g, s).mandanten[0];
const ids = (l) => (l || []).map((e) => e.id);
const finde = (l, id) => (l || []).find((e) => e.id === id);
function schreibe(s, aendern, g = bestand()) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
  aendern(gelesen.mandanten[0]);
  const e = zusammenfuehren(g, gelesen, s);
  return { g, e, m: e && e.mandanten ? e.mandanten[0] : null };
}
const roh = () => bestand().mandanten[0];

describe("Sicht", () => {
  it("Schichtverantwortung A: nur Dienstbuch und Übergabe der Einheit A", () => {
    const m = sicht(SUB);
    expect(ids(m.dienstbuch)).toEqual(["db-A"]);
    expect(ids(m.uebergaben)).toEqual(["u-A"]);
    const text = JSON.stringify(m);
    for (const s of ["DB-db-B", "DB-db-P", "DB-db-N", "DB-db-L", "VK-u-B", "VK-u-P", "VK-u-N", "VK-u-L"]) expect(text).not.toContain(s);
  });
  it("Schichtverantwortung, deren eigene Einheit der Pool ist: nichts gilt als eigen", () => {
    const g = bestand(person("s1", "subplaner", "ePool"));
    const m = sicht(SUB, g);
    expect(m.dienstbuch).toEqual([]);
    expect(m.uebergaben).toEqual([]);
  });
  it("Planung und Leitung: vollständig, auch Altbestand", () => {
    for (const s of [PL, LT]) {
      expect(sicht(s).dienstbuch).toEqual(roh().dienstbuch);
      expect(sicht(s).uebergaben).toEqual(roh().uebergaben);
    }
  });
  it("Beschäftigte und Betriebsrat: unverändert nichts", () => {
    for (const s of [MA, BR]) {
      const m = sicht(s);
      expect((m.dienstbuch || []).length).toBe(0);
      expect((m.uebergaben || []).length).toBe(0);
    }
  });
});

describe("Dienstbuch schreiben", () => {
  it("SV: neuer Eintrag — Einheit, Autor und Zeit vom Server, fremde einheitId aus dem Client zählt nicht", () => {
    const { e, m } = schreibe(SUB, (mm) => {
      mm.dienstbuch.unshift({ id: "db-neu", datum: D, art: "vorkommnis", text: "Sturz im Flur", einheitId: "eB", vonId: "b1", durch: "Fremd", zeit: "99:99" });
    });
    expect(e.verweigert).toBeFalsy();
    expect(finde(m.dienstbuch, "db-neu")).toMatchObject({ einheitId: "eA", vonId: "s1", durch: "Vs1 Ns1", art: "vorkommnis", text: "Sturz im Flur" });
    expect(finde(m.dienstbuch, "db-neu").zeit).not.toBe("99:99");
  });
  it("SV: ungültige Einträge (Art, leerer Text, Tag): abgewiesen", () => {
    for (const x of [{ art: "frei" }, { text: " " }, { datum: "morgen" }])
      expect(schreibe(SUB, (mm) => { mm.dienstbuch.unshift({ id: "db-x", datum: D, art: "hinweis", text: "t", ...x }); }).e.verweigert, JSON.stringify(x)).toBeTruthy();
  });
  it("SV: eigenen Eintrag ändern oder löschen: abgewiesen (nur anhängen)", () => {
    expect(schreibe(SUB, (mm) => { finde(mm.dienstbuch, "db-A").text = "anders"; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.dienstbuch = mm.dienstbuch.filter((x) => x.id !== "db-A"); }).e.verweigert).toBeTruthy();
  });
  it("SV: fremden Eintrag einschleusen/ändern, Altbestand mit einheitId A übernehmen: abgewiesen", () => {
    expect(schreibe(SUB, (mm) => { mm.dienstbuch.push({ ...db("db-B", "eB"), text: "FAKE" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.dienstbuch.push({ ...db("db-L", undefined), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.dienstbuch.push({ ...db("db-N", null), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { finde(mm.dienstbuch, "db-A").einheitId = "eB"; }).e.verweigert).toBeTruthy();
  });
  it("SV mit Pool als eigener Einheit: kein Eintrag", () => {
    const g = bestand(person("s1", "subplaner", "ePool"));
    expect(schreibe(SUB, (mm) => { mm.dienstbuch.unshift({ id: "db-x", datum: D, art: "hinweis", text: "t" }); }, g).e.verweigert).toBeTruthy();
  });
  it("Planung: Einheit B oder betriebsweit — unbekannte Einheit abgewiesen; vonId vom Server", () => {
    const b = schreibe(PL, (mm) => { mm.dienstbuch.unshift({ id: "db-pl", datum: D, art: "hinweis", text: "t", einheitId: "eB", vonId: "s1" }); });
    expect(b.e.verweigert).toBeFalsy();
    expect(finde(b.m.dienstbuch, "db-pl")).toMatchObject({ einheitId: "eB", vonId: "pl" });
    const n = schreibe(LT, (mm) => { mm.dienstbuch.unshift({ id: "db-lt", datum: D, art: "hinweis", text: "t", einheitId: null }); });
    expect(finde(n.m.dienstbuch, "db-lt").einheitId).toBeNull();
    expect(schreibe(PL, (mm) => { mm.dienstbuch.unshift({ id: "db-x", datum: D, art: "hinweis", text: "t", einheitId: "eX" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(PL, (mm) => { finde(mm.dienstbuch, "db-L").einheitId = "eFremd"; }).e.verweigert).toBeTruthy();
  });
});

describe("Übergaben schreiben", () => {
  const neu = (x = {}) => ({ id: "u-neu", datum: D, dienstId: "S", lage: "ruhig", offen: "", vorkommnis: "", material: "", personen: ["a1", "b1", "gibt-es-nicht"], ...x });
  it("SV: neue Übergabe für die eigene Einheit — Einheit, Autor, Zeit vom Server", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.uebergaben.unshift(neu({ einheitId: "eB", von: "Fremd", ergaenzungen: [{ text: "x" }] })); });
    expect(e.verweigert).toBeFalsy();
    expect(finde(m.uebergaben, "u-neu")).toMatchObject({ einheitId: "eA", von: "Vs1 Ns1", lage: "ruhig", ergaenzungen: [], personen: ["a1", "b1"] });
  });
  it("Eindeutigkeit: A, B, Pool und null am selben Tag und Dienst nebeneinander; zweite Übergabe A abgewiesen", () => {
    expect(roh().uebergaben.filter((u) => u.datum === D && u.dienstId === "F")).toHaveLength(4);
    expect(schreibe(SUB, (mm) => { mm.uebergaben.unshift(neu({ id: "u-A2", dienstId: "F" })); }).e.verweigert).toBeTruthy();
    expect(schreibe(PL, (mm) => { mm.uebergaben.unshift({ ...neu({ id: "u-A3", dienstId: "F" }), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(PL, (mm) => { mm.uebergaben.unshift({ ...neu({ id: "u-N2", dienstId: "F" }), einheitId: null }); }).e.verweigert).toBeTruthy();
    /* Altbestand ohne einheitId zählt wie null */
    expect(schreibe(PL, (mm) => { mm.uebergaben.unshift({ ...neu({ id: "u-L2" }), einheitId: null }); }).e.verweigert).toBeTruthy();
    const b = schreibe(PL, (mm) => { mm.uebergaben.unshift({ ...neu({ id: "u-SB" }), einheitId: "eB" }); });
    expect(b.e.verweigert).toBeFalsy();
    expect(finde(b.m.uebergaben, "u-SB").einheitId).toBe("eB");
    expect(schreibe(PL, (mm) => { mm.uebergaben.unshift({ ...neu({ id: "u-X" }), einheitId: "eX" }); }).e.verweigert).toBeTruthy();
  });
  it("SV: eigene Übergabe ergänzen (anhängen) — von und Zeit vom Server", () => {
    const { e, m } = schreibe(SUB, (mm) => { finde(mm.uebergaben, "u-A").ergaenzungen.push({ text: "Nachtrag", von: "Fremd", zeit: "x" }); });
    expect(e.verweigert).toBeFalsy();
    expect(finde(m.uebergaben, "u-A").ergaenzungen).toEqual([{ zeit: expect.any(String), von: "Vs1 Ns1", text: "Nachtrag" }]);
    expect(finde(m.uebergaben, "u-A").ergaenzungen[0].zeit).not.toBe("x");
  });
  it("SV: Ergänzungen sind append-only, der Inhalt ist unveränderlich", () => {
    const g = bestand(); finde(g.mandanten[0].uebergaben, "u-A").ergaenzungen = [{ zeit: "z", von: "Vl1 Nl1", text: "alt" }];
    expect(schreibe(SUB, (mm) => { finde(mm.uebergaben, "u-A").ergaenzungen = []; }, g).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { finde(mm.uebergaben, "u-A").ergaenzungen[0].text = "anders"; }, g).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { finde(mm.uebergaben, "u-A").lage = "anders"; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { finde(mm.uebergaben, "u-A").einheitId = "eB"; }).e.verweigert).toBeTruthy();
  });
  it("SV: Ergänzung an fremde Übergabe, Altbestand/null/Pool übernehmen, fremde löschen: abgewiesen bzw. wirkungslos", () => {
    expect(schreibe(SUB, (mm) => { mm.uebergaben.push({ ...ue("u-B", "F", "eB"), ergaenzungen: [{ text: "FAKE" }] }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.uebergaben.push({ ...ue("u-L", "S", undefined), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.uebergaben.push({ ...ue("u-N", "F", null), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.uebergaben.push({ ...ue("u-P", "F", "ePool"), einheitId: "eA" }); }).e.verweigert).toBeTruthy();
    const weg = schreibe(SUB, (mm) => { mm.uebergaben = mm.uebergaben.filter((u) => u.id === "u-A"); mm.abweichungen[`a1|${D}`] = "F"; });
    expect(weg.e.verweigert).toBeFalsy();
    expect(weg.m.uebergaben).toEqual(roh().uebergaben);
  });
});

describe("Rundweg", () => {
  it("gekürzte Sicht lesen, unverändert zurückschreiben: B, Pool, null und Altbestand exakt gespeichert", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.abweichungen[`a1|${D}`] = "S"; });
    expect(e.verweigert).toBeFalsy();
    expect(m.dienstbuch).toEqual(roh().dienstbuch);
    expect(m.uebergaben).toEqual(roh().uebergaben);
  });
  it("nach neuem eigenem Eintrag: alles Verborgene unverändert", () => {
    const { m } = schreibe(SUB, (mm) => { mm.dienstbuch.unshift({ id: "db-neu", datum: D, art: "hinweis", text: "t" }); });
    expect(m.dienstbuch.slice(1)).toEqual(roh().dienstbuch);
  });
});

describe("Leerer Betrieb: uebergaben ist eine Liste", () => {
  it("leererMandant legt uebergaben als Liste an", async () => {
    const app = (await readFile(path.join(process.cwd(), "src/App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    const start = app.indexOf("function leererMandant(");
    const ende = app.indexOf("\n}\n", start);
    expect(start > 0 && ende > start && ende - start < 5000).toBe(true);
    const block = app.slice(start, ende);
    expect(block).toContain("uebergaben: []");
    expect(block).not.toContain("uebergaben: {}");
  });
  it("die Gestaltprüfung erkennt den falschen Typ; ein leeres Altobjekt wird vorher angeglichen", () => {
    const b = bestand(); b.mandanten[0].uebergaben = { x: 1 };
    expect(pruefeGestalt(b)).toMatchObject({ ok: false, feld: "uebergaben" });
    const alt = bestand(); alt.mandanten[0].uebergaben = {};
    expect(pruefeGestalt(alt).ok).toBe(false);
    const angeglichen = uebergabenAngleichen(alt);
    expect(angeglichen.mandanten[0].uebergaben).toEqual([]);
    expect(pruefeGestalt(angeglichen).ok).toBe(true);
    expect(uebergabenAngleichen(b).mandanten[0].uebergaben).toEqual({ x: 1 });         // Inhalt wird nicht verworfen
  });
});
