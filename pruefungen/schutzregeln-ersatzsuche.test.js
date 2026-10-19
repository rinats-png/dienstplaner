/* ==========================================================================
   SCHUTZREGELN IN DER ERSATZSUCHE (Commit S2)

   hindernisse() in App.jsx entscheidet, wen Ersatzsuche, Vergabe einer
   offenen Schicht, Übernahme eines Vorschlags und Selbstplanung als
   „möglich" anbieten. Bis Commit S2 prüfte es keine Schutzregel: Eine
   Person im Mutterschutz erschien für den Nachtdienst als geeignet, eine
   minderjährige für den Zwölfstundendienst. Die Wochenstundengrenze las es
   nur aus den Rohdaten — für die Schichtverantwortung (seit S1 ohne
   Rohdaten) also gar nicht mehr.

   Jetzt fragt hindernisse() einsatzSchutz (src/regelwerk.js): dieselbe
   Prüfung wie die Planprüfung (schutzBefundeFuer) auf Rohdaten oder
   Einsatzregeln; harte Befunde sperren, weiche sind Hinweise; fehlen die
   Einsatzregeln, sperrt sie. Die Wochenstundengrenze sperrt wie vor S1.

   hindernisse() selbst steckt in der Oberfläche; geprüft werden hier die
   reine Funktion, die es aufruft, und dass es sie aufruft.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import * as RW from "../src/regelwerk.js";

const tagPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* 18 in 30 Tagen — der Werktag unten liegt davor. */
const GEB = (() => { const d = new Date(`${tagPlus(30)}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 18); return d.toISOString().slice(0, 10); })();
const WIEDER = { von: tagPlus(-10), bis: tagPlus(60), maxStundenWoche: 20 };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "ePool", pool: true }], dienstarten: [],
    personen: [person("s1", "subplaner", "e1"),
      person("mu", "mitarbeiter", "e1", { mutterschutz: true }),
      person("sb", "mitarbeiter", "e1", { schwerbehindert: true }),
      person("ju", "mitarbeiter", "e1", { geburtstag: GEB }),
      person("we", "mitarbeiter", "e1", { einschraenkungen: { wiedereingliederung: { ...WIEDER } } }),
      person("oh", "mitarbeiter", "e1"),
      person("po", "mitarbeiter", "ePool", { mutterschutz: true }),
      person("pl", "planer", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
  }],
});
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const PL = { rolle: "planer", person: "pl", betrieb: 0 };
const roh = (id) => bestand().mandanten[0].personen.find((p) => p.id === id);
const sv = (id) => bestandFuerRolle(bestand(), SUB).mandanten[0].personen.find((p) => p.id === id);
const pl = (id) => bestandFuerRolle(bestand(), PL).mandanten[0].personen.find((p) => p.id === id);

const DIENST = {
  frueh: { start: "06:00", ende: "14:00", pause: 30 }, vor6: { start: "05:30", ende: "13:30", pause: 30 },
  spaet: { start: "14:00", ende: "22:00", pause: 30 }, nacht: { start: "22:00", ende: "06:00", pause: 30 },
  kurz: { start: "08:00", ende: "12:00", pause: 0 }, lang: { start: "07:00", ende: "19:00", pause: 45 },
};
/* Wochentag, Samstag und Sonntag in den nächsten Tagen (vor dem 18. Geburtstag). */
const naechster = (wt) => { for (let i = 1; i < 9; i++) { const t = tagPlus(i); if (RW.dow(t) === wt) return t; } return null; };
const WERKTAG = naechster(2), SAMSTAG = naechster(5), SONNTAG = naechster(6);
const VERBOTEN = ["Mutterschutz", "MuSchG", "Schwerbehind", "SGB", "JArbSchG", "Jugend", "Wiedereingliederung", "Schwanger"];
const schutz = (p, da, tag, std = 0) => (RW.einsatzSchutz ? RW.einsatzSchutz(p, da, tag, std) : { hindernisse: [], hinweise: [], grenze: null });
const sperrt = (p, da, tag, std = 0) => { const s = schutz(p, da, tag, std); return s.hindernisse.length > 0 || !!s.grenze; };

describe("Pflichtfälle — Sicht der Schichtverantwortung (planungsregeln)", () => {
  it("Mutterschutz + Nachtdienst: nicht vorgeschlagen", () => {
    expect(sperrt(sv("mu"), DIENST.nacht, WERKTAG)).toBe(true);
    expect(sperrt(sv("po"), DIENST.nacht, WERKTAG)).toBe(true);
  });
  it("Mutterschutz + Sonntag: nicht vorgeschlagen (hart wie in der Planprüfung)", () => {
    expect(sperrt(sv("mu"), DIENST.frueh, SONNTAG)).toBe(true);
  });
  it("unter 18 + langer Dienst, unter 18 + Beginn vor 6 Uhr: nicht vorgeschlagen", () => {
    expect(sperrt(sv("ju"), DIENST.lang, WERKTAG)).toBe(true);
    expect(sperrt(sv("ju"), DIENST.vor6, WERKTAG)).toBe(true);
  });
  it("ohne Konflikt: vorgeschlagen", () => {
    for (const id of ["oh", "mu", "sb", "ju"]) expect(sperrt(sv(id), DIENST.frueh, WERKTAG), id).toBe(false);
  });
  it("planungsregeln fehlt unerwartet: nicht vorgeschlagen", () => {
    for (const id of ["oh", "po"]) {
      const p = { ...sv(id) };
      delete p.planungsregeln;
      const s = schutz(p, DIENST.frueh, WERKTAG);
      expect(s.hindernisse.length, id).toBeGreaterThan(0);
      expect(s.hindernisse.join(" ")).toContain("Einsatzregeln");
    }
  });
  it("weiche Regeln sperren nicht, stehen als Hinweis", () => {
    const sb = schutz(sv("sb"), DIENST.lang, WERKTAG);
    expect(sb.hindernisse).toEqual([]);
    expect(sb.hinweise.length).toBe(1);
    const ju = schutz(sv("ju"), DIENST.kurz, SAMSTAG);
    expect(ju.hindernisse).toEqual([]);
    expect(ju.hinweise.length).toBe(1);
  });
  it("Texte neutral: keine Diagnose, kein Gesetz", () => {
    const texte = JSON.stringify(["mu", "sb", "ju", "we", "po"].flatMap((id) =>
      Object.values(DIENST).map((da) => schutz(sv(id), da, SONNTAG, 40))));
    for (const s of VERBOTEN) expect(texte, s).not.toContain(s);
  });
});

describe("Planung und Leitung (Rohdaten): dieselben Ergebnisse", () => {
  it("Mutterschutz/Nacht, unter 18/lang gesperrt; ohne Konflikt frei; weiche nur Hinweis", () => {
    expect(sperrt(pl("mu"), DIENST.nacht, WERKTAG)).toBe(true);
    expect(sperrt(pl("ju"), DIENST.lang, WERKTAG)).toBe(true);
    expect(sperrt(pl("oh"), DIENST.nacht, WERKTAG)).toBe(false);
    expect(schutz(pl("sb"), DIENST.lang, WERKTAG)).toMatchObject({ hindernisse: [], hinweise: [expect.any(String)] });
  });
  it("Planung behält die Fundstelle im Text", () => {
    expect(schutz(pl("mu"), DIENST.nacht, WERKTAG).hindernisse.join(" ")).toContain("MuSchG");
  });
});

describe("Gleichwertigkeit: Rohdaten und planungsregeln treffen dieselbe Entscheidung", () => {
  for (const id of ["mu", "sb", "ju", "we", "oh", "po"]) {
    it(`${id}: für alle Dienste, Tage und Wochenstunden`, () => {
      for (const [dn, da] of Object.entries(DIENST)) for (const tag of [WERKTAG, SAMSTAG, SONNTAG]) for (const std of [0, 12, 30]) {
        const r = schutz(roh(id), da, tag, std), d = schutz(sv(id), da, tag, std);
        const k = `${id} ${dn} ${tag} ${std}`;
        expect(d.hindernisse.length > 0 || !!d.grenze, k).toBe(r.hindernisse.length > 0 || !!r.grenze);
        expect(d.hindernisse.length, k).toBe(r.hindernisse.length);
        expect(d.hinweise.length, k).toBe(r.hinweise.length);
      }
    });
  }
});

describe("Wochenstundengrenze", () => {
  it("Planung (Rohdaten): sperrt wie vor S1 — Text Wiedereingliederung", () => {
    expect(schutz(pl("we"), DIENST.frueh, WERKTAG, 13).grenze).toEqual({ maxStundenWoche: 20, neutral: false });
    expect(schutz(pl("we"), DIENST.frueh, WERKTAG, 10).grenze).toBeNull();               // 10 + 7,5 ≤ 20
  });
  it("Schichtverantwortung (planungsregeln): dieselbe Grenze, neutral", () => {
    expect(schutz(sv("we"), DIENST.frueh, WERKTAG, 13).grenze).toEqual({ maxStundenWoche: 20, neutral: true });
    expect(schutz(sv("we"), DIENST.frueh, WERKTAG, 10).grenze).toBeNull();
    expect(schutz(sv("we"), DIENST.frueh, tagPlus(80), 30).grenze).toBeNull();           // außerhalb des Zeitraums
  });
  it("Wochenstunden als Funktion: nur gerechnet, wenn die Grenze gilt", () => {
    let gerufen = 0;
    schutz(sv("oh"), DIENST.frueh, WERKTAG, () => { gerufen += 1; return 99; });
    expect(gerufen).toBe(0);
  });
});

describe("hindernisse() in der Oberfläche fragt einsatzSchutz", () => {
  const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
  const start = app.indexOf("function hindernisse(m, p, d, da) {");
  const block = app.slice(start, app.indexOf("\n}\n", start));
  it("Schutz, Wochenstundengrenze und Alleindienst stehen in hindernisse()", () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("einsatzSchutz(p, da, d,");
    expect(block).toContain("g.push(...schutz.hindernisse)");
    expect(block).toContain("e.keinAlleindienst");
    expect(block).not.toContain("e.wiedereingliederung");                // nicht mehr nur aus den Rohdaten
  });
  it("weiche Schutzregeln erscheinen als Hinweis in der Ersatzsuche", () => {
    expect(app).toContain("for (const h of einsatzSchutz(p, da, d).hinweise) gruende.push(`Hinweis: ${h}`);");
  });
});
