/* ==========================================================================
   WP-19 B4 — modulAktiv nur für Status auf der Allowlist (fail-closed)

   Befund B4 (a), docs/acc45/WP-19-MODULABNAHME.md: modulAktiv prüfte nur
   „nicht geplant“ — ein unbekannter, fehlender oder unsinniger Status galt als
   wirkend (fail-open), während die Registerwache der fünf älteren Module
   (modul-altwege.mjs) geschlossen blieb. Jetzt gibt es EINE Allowlist
   (WIRKSAME_STATUS / statusWirksam in server/lib/branchenmodule.mjs), die
   modulAktiv und die Registerwache gemeinsam nutzen.

   Geprüft (Registry-Kopien nur im Test; die echte Registry bleibt „geplant“):
     A  Alle zwölf Module × unsinniger Status (unbekannt, fehlend, null,
        „AKTIV“, „aktiv “, {}, Prototyp-Namen …): modulAktiv falsch — auch
        wenn nur eine Abhängigkeit einen solchen Status trägt.
     B  Gültige Status unverändert: „vorlaeufig“ und „freigegeben“ wirken,
        „geplant“ nicht; ohne Paket, Schalter oder Bestätigung weiter aus.
     C  Die fünf älteren Module: Registerwache und modulAktiv antworten gleich.
     E  Dieselbe Allowlist in Zustand, Nur-Lesen (G3) und Einschalten:
        unsinniger Status verhält sich wie „geplant“ (in Vorbereitung,
        nicht einschaltbar, ohne Wirkung).
     D  Eine Stelle: modul-altwege.mjs führt keine eigene Statusliste.

   Offen und NICHT Gegenstand: Berichtigung nach Art. 16 bei ausgeschaltetem
   Modul (neuere Module 403, ältere geprüft durch) — Betreiber-/Datenschutz-
   entscheidung, Verhalten unverändert.
   Aufruf: npm run pruefung:modulaktiv
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BRANCHENMODULE, MODUL_STATUS, WIRKSAME_STATUS, statusWirksam, modulAktiv, modulZustand, modulNurLesen,
  branchenmoduleZusammen,
} from "../server/lib/branchenmodule.mjs";
import { altmodulWache } from "../server/lib/modul-altwege.mjs";

const ALT = ["posten", "bereichsplan", "geteilterdienst", "anlagen", "maschinenqual"];
const NEU = ["wachbuch", "objektbericht", "pflegequal", "bereitschaftsdienst", "funktionsdienst", "rotation", "kontimodelle"];
const ALLE = BRANCHENMODULE.map((x) => x.id);
const FEHLT = Symbol("fehlt");

const UNSINN = [
  ["unbekannt", "unbekannt"], ["fehlend", FEHLT], ["undefined", undefined], ["null", null], ["leer", ""],
  ["AKTIV", "AKTIV"], ["aktiv mit Leerzeichen", "aktiv "], ["aktiv", "aktiv"], ["Objekt", {}], ["Array", ["vorlaeufig"]],
  ["Zahl", 1], ["wahr", true], ["VORLAEUFIG", "VORLAEUFIG"], ["vorlaeufig mit Leerzeichen", " vorlaeufig"],
  ["Freigegeben groß", "Freigegeben"], ["vorläufig mit Umlaut", "vorläufig"],
  ["Prototyp constructor", "constructor"], ["Prototyp __proto__", "__proto__"], ["Prototyp toString", "toString"],
  ["Prototyp hasOwnProperty", "hasOwnProperty"], ["String-Objekt", new String("vorlaeufig")],
];

/** Registry-Kopie: alle Module „vorlaeufig“, `id` mit `status` (FEHLT: ohne Feld). */
function register(id, status) {
  return BRANCHENMODULE.map((x) => {
    const k = { ...x, status: "vorlaeufig" };
    if (x.id === id) { if (status === FEHLT) delete k.status; else k.status = status; }
    return Object.freeze(k);
  });
}

/** Betrieb: alle Pakete gebucht, alle Module an, Mitbestimmung bestätigt. */
function betrieb() {
  const bm = {};
  for (const x of BRANCHENMODULE)
    bm[x.id] = { an: true, eingeschaltetAm: "2026-11-01T08:00:00.000Z", mitbestimmung: { grundlage: "BV 1/2026", bestaetigtAm: "2026-11-01T08:00:00.000Z" } };
  return { pakete: [...new Set(BRANCHENMODULE.flatMap((x) => x.pakete))], einstellungen: { branchenmodule: bm } };
}

describe("WP-19 B4 — Allowlist", () => {
  it("die Allowlist ist genau MODUL_STATUS ohne „geplant“", () => {
    expect([...WIRKSAME_STATUS]).toEqual(["vorlaeufig", "freigegeben"]);
    expect([...WIRKSAME_STATUS]).toEqual(MODUL_STATUS.filter((s) => s !== "geplant"));
    expect(Object.isFrozen(WIRKSAME_STATUS)).toBe(true);
  });
  it("statusWirksam: nur exakte Einträge", () => {
    expect(statusWirksam("vorlaeufig")).toBe(true);
    expect(statusWirksam("freigegeben")).toBe(true);
    expect(statusWirksam("geplant")).toBe(false);
    for (const [, s] of UNSINN) expect(statusWirksam(s === FEHLT ? undefined : s)).toBe(false);
  });
  it("die zwölf Module sind die erwarteten (sieben neuere, fünf ältere)", () => {
    expect([...ALLE].sort()).toEqual([...NEU, ...ALT].sort());
  });
  it("die echte Registry bleibt „geplant“ — kein Modul wirkt", () => {
    const m = betrieb();
    for (const id of ALLE) {
      expect(BRANCHENMODULE.find((x) => x.id === id)?.status).toBe("geplant");
      expect(modulAktiv(m, id)).toBe(false);
    }
  });
});

describe("A — unsinniger Status: geschlossen für alle zwölf Module", () => {
  for (const id of ALLE) {
    for (const [name, s] of UNSINN) {
      it(`${id}: Status ${name} → wirkt nicht`, () => {
        const reg = register(id, s);
        const m = betrieb();
        expect(modulAktiv(m, id, reg)).toBe(false);
        expect(modulZustand(m, id, reg)).not.toBe("an");
      });
    }
  }
  /* Abhängigkeit mit unsinnigem Status: das abhängige Modul wirkt ebenfalls nicht. */
  for (const x of BRANCHENMODULE.filter((y) => y.abhaengigVon.length)) {
    for (const a of x.abhaengigVon) {
      for (const [name, s] of UNSINN) {
        it(`${x.id}: Abhängigkeit ${a} mit Status ${name} → wirkt nicht`, () => {
          expect(modulAktiv(betrieb(), x.id, register(a, s))).toBe(false);
        });
      }
    }
  }
});

describe("B — gültige Status unverändert", () => {
  for (const id of ALLE) {
    it(`${id}: vorlaeufig und freigegeben wirken, geplant nicht`, () => {
      const m = betrieb();
      expect(modulAktiv(m, id, register(id, "vorlaeufig"))).toBe(true);
      expect(modulAktiv(m, id, register(id, "freigegeben"))).toBe(true);
      expect(modulZustand(m, id, register(id, "freigegeben"))).toBe("an");
      expect(modulAktiv(m, id, register(id, "geplant"))).toBe(false);
      expect(modulZustand(m, id, register(id, "geplant"))).toBe("in-vorbereitung");
    });
    it(`${id}: ohne Paket oder ausgeschaltet weiter aus`, () => {
      const reg = register(id, "freigegeben");
      expect(modulAktiv({ ...betrieb(), pakete: [] }, id, reg)).toBe(false);
      const aus = betrieb();
      aus.einstellungen.branchenmodule[id] = { an: false };
      expect(modulAktiv(aus, id, reg)).toBe(false);
    });
  }
  it("Mitbestimmungsmodule ohne Bestätigung weiter aus", () => {
    for (const x of BRANCHENMODULE.filter((y) => y.mitbestimmung)) {
      const m = betrieb();
      m.einstellungen.branchenmodule[x.id] = { an: true };
      expect(modulAktiv(m, x.id, register(x.id, "freigegeben"))).toBe(false);
    }
  });
});

describe("C — fünf ältere Module: Registerwache und modulAktiv gleich", () => {
  /* Eine Änderung an Moduldaten, die jede der fünf Wachen sieht. */
  const AENDERUNG = {
    posten: (m) => ({ ...m, objekte: [{ id: "o1", name: "Objekt" }] }),
    bereichsplan: (m) => ({ ...m, bereichsPlan: { e1: { b: 1 } } }),
    geteilterdienst: (m) => ({ ...m, dienstarten: [{ id: "d1", zweiterAbschnitt: { von: "16:00", bis: "20:00" } }] }),
    anlagen: (m) => ({ ...m, betriebsmittel: [{ id: "a1", art: "anlage", name: "Presse" }] }),
    maschinenqual: (m) => ({ ...m, kompetenzen: [{ id: "k1", befaehigtePerson: "p1" }] }),
  };
  for (const id of ALT) {
    for (const [name, s] of [...UNSINN, ["vorlaeufig", "vorlaeufig"], ["freigegeben", "freigegeben"], ["geplant", "geplant"]]) {
      it(`${id}: Status ${name} — Wache und modulAktiv stimmen überein`, () => {
        const reg = register(id, s);
        const alt = betrieb();
        const neu = AENDERUNG[id](alt);
        const wirkt = modulAktiv(neu, id, reg);
        const wache = altmodulWache(alt, neu, { liste: reg });
        expect(wache === null).toBe(wirkt);
        expect(wirkt).toBe(s === "vorlaeufig" || s === "freigegeben");
      });
    }
  }
});

describe("E — Zustand, Nur-Lesen und Einschalten wie „geplant“", () => {
  const SITZ = { person: { id: "l1", name: "Leitung" } };
  for (const id of ALLE) {
    for (const [name, s] of [...UNSINN, ["geplant", "geplant"]]) {
      it(`${id}: Status ${name} → in Vorbereitung, nicht einschaltbar, nur lesbar nur nach Aus`, () => {
        const reg = register(id, s);
        const m = betrieb();
        expect(modulZustand(m, id, reg)).toBe("in-vorbereitung");
        expect(modulNurLesen(m, id, reg)).toBe(false);
        const aus = betrieb();
        aus.einstellungen.branchenmodule[id] = { an: false, eingeschaltetAm: "2026-11-01T08:00:00.000Z" };
        expect(modulNurLesen(aus, id, reg)).toBe(true);
        const alt = { ...betrieb(), einstellungen: { branchenmodule: {} } };
        const neu = { ...alt, einstellungen: { branchenmodule: { [id]: { an: true, mitbestimmung: { bestaetigt: true, grundlage: "BV 1/2026" } } } } };
        expect(branchenmoduleZusammen(alt, neu, SITZ, true, reg).grund).toMatch(/noch nicht verfügbar/);
      });
    }
    it(`${id}: gültiger Status unverändert (Zustand an, nicht nur lesbar, einschaltbar)`, () => {
      for (const s of ["vorlaeufig", "freigegeben"]) {
        const reg = register(id, s);
        expect(modulZustand(betrieb(), id, reg)).toBe("an");
        expect(modulNurLesen(betrieb(), id, reg)).toBe(false);
        const alt = { ...betrieb(), einstellungen: { branchenmodule: {} } };
        const neu = { ...alt, einstellungen: { branchenmodule: { [id]: { an: true, mitbestimmung: { bestaetigt: true, grundlage: "BV 1/2026" } } } } };
        const r = branchenmoduleZusammen(alt, neu, SITZ, true, reg);
        expect(r.grund ?? "").not.toMatch(/noch nicht verfügbar/);
      }
    });
  }
});

describe("D — eine Stelle", () => {
  it("modul-altwege.mjs nutzt statusWirksam aus branchenmodule.mjs und führt keine eigene Statusliste", () => {
    const q = readFileSync(new URL("../server/lib/modul-altwege.mjs", import.meta.url), "utf8");
    expect(q).toMatch(/import \{[^}]*\bstatusWirksam\b[^}]*\} from "\.\/branchenmodule\.mjs"/);
    const code = q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/["']vorlaeufig["']/);
    expect(code).not.toMatch(/["']freigegeben["']/);
  });
  it("modulAktiv fragt die Allowlist, nicht „geplant“", () => {
    const q = readFileSync(new URL("../server/lib/branchenmodule.mjs", import.meta.url), "utf8");
    const rumpf = q.slice(q.indexOf("export function modulAktiv("), q.indexOf("/** Ist ein Wert für das Schema gültig?"));
    expect(rumpf).toMatch(/!statusWirksam\(mod\.status\)/);
    expect(rumpf).not.toMatch(/=== "geplant"/);
  });
  it("Zustand, Nur-Lesen und Einschalten fragen ebenfalls die Allowlist", () => {
    const q = readFileSync(new URL("../server/lib/branchenmodule.mjs", import.meta.url), "utf8");
    const code = q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/mod\.status (===|!==) "geplant"/);
  });
});
