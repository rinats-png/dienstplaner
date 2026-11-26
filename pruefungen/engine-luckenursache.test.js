/* ==========================================================================
   WP-I8 (Teil: Konflikte mit Ursache) — Lücken-Ursache im Rechenkern

   Geprüft:
   U1  Rechnung gegen eine unabhängige Rechnung (hindernisBefunde je Person): Zählwerte je hindernder Regel,
       direkte Kandidaten, kleinste Ursache (kleinste Regelmenge) und Wege.
   U2  Ehrlichkeit: besetzter Dienst ⇒ keine Ursache; unbekannter Dienst/Datum ⇒ Fehler, nie geraten.
   U3  Aufwandsbudget je äußerem Einstieg: ein Budget für alle Lücken, nicht je Lücke; erschöpft ⇒ unvollständig,
       keine Ursache behauptet (fail closed).
   U4  Parametergrenzen (Zeitraum, Lückenzahl, ungültige Eingaben).
   U5  Datenschutz: nur Kennungen und Zahlen — keine Personenkennung, kein Befundtext, kein Abwesenheitsgrund.
   U6  Rein: gleiche Eingabe ⇒ gleiches Ergebnis, eingefrorene Eingabe, keine Uhr/kein Zufall im Quelltext,
       keine Importe aus src/ oder intelligence/.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";
import * as Einsatz from "../server/lib/engine/einsatz.mjs";
import * as L from "../server/lib/engine/luckenursache.mjs";
import { aktive, besetzung, personTag } from "../server/lib/engine/plan.mjs";
import { neuesVorgabenBudget } from "../server/lib/vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE } from "../server/lib/vorgaben.mjs";

vi.setConfig({ testTimeout: 280000 });
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]); } return o; };

let F, B;
const D = "2026-11-17";
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  vi.spyOn(Math, "random").mockImplementation(zufall(20261126));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Geburtsdaten setzen: ohne sie ist die Schutzprüfung „nicht bewertbar“ (schutzOffen) und hindert jede Person (Review #570). */
const mitGeburt = (m) => { m.personen.forEach((p, i) => { p.geburtstag = `19${70 + (i % 25)}-05-05`; }); return m; };
const HINDERT = (b) => Einsatz.stufeRang(b.stufe) >= 2 || /Offen$/.test(b.regel);

/** Demobetrieb mit einer Lücke im Frühdienst: hoher Bedarf, sechs freie Personen mit Spätdienst am Vortag
    (Ruhezeit 6,5 h), zwei freie Personen abwesend. */
function mitLuecke() {
  const m = mitGeburt(structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]));
  const fr = m.dienstarten.find((x) => x.id === "F"), sp = m.dienstarten.find((x) => x.id === "S");
  fr.mindest = { mo_do: 40, fr: 40, sa: 40, so: 40 };
  const frei = aktive(m, D).filter((p) => !personTag(m, p, D).dienstId);
  frei.slice(0, 6).forEach((p) => { m.abweichungen[`${p.id}|2026-11-16`] = sp.id; });
  frei.slice(6, 8).forEach((p) => m.abwesenheiten.push({ id: `abw-test-${p.id}`, personId: p.id, von: D, bis: D, art: "krank" }));
  /* Alle übrigen freien Personen im Urlaub (keine direkten Kandidaten), eine davon mit Spätdienst am Vortag (zwei Hindernisse). */
  frei.slice(8).forEach((p) => m.abwesenheiten.push({ id: `abw-test-${p.id}`, personId: p.id, von: D, bis: D, art: "urlaub" }));
  m.abwesenheiten.push({ id: `abw-test-${frei[0].id}`, personId: frei[0].id, von: D, bis: D, art: "urlaub" });
  /* Frischer Bestand: die Zwischenspeicher der Planrechnung kennen die Änderungen sonst nicht. */
  return { m: structuredClone(m), frei };
}
/** Unabhängige Rechnung: je freie Person die Regelmenge ab „Achtung“. */
function referenz(m, d, dienstId) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const je = [];
  for (const p of aktive(m, d)) {
    if (personTag(m, p, d).dienstId) continue;
    je.push([...new Set(Einsatz.hindernisBefunde(m, p, d, da).filter(HINDERT).map((b) => b.regel))].sort());
  }
  return je;
}

describe("U1: Rechnung gegen eine unabhängige Rechnung", () => {
  it("Zählwerte je Regel, direkte Kandidaten, kleinste Ursache und Wege stimmen", () => {
    const { m } = mitLuecke();
    const r = L.lueckenUrsache(m, D, "F");
    const je = referenz(m, D, "F");
    expect(r.geprueft).toBe(je.length);
    expect(r.direkt).toBe(je.filter((s) => s.length === 0).length);
    const zaehl = {};
    for (const s of je) for (const k of s) zaehl[k] = (zaehl[k] || 0) + 1;
    expect(Object.fromEntries(r.hindernisse.map((h) => [h.regel, h.personen]))).toEqual(zaehl);
    expect(r.hindernisse.map((h) => h.personen)).toEqual([...r.hindernisse.map((h) => h.personen)].sort((a, b) => b - a));
    const mitHindernis = je.filter((s) => s.length > 0);
    const klein = Math.min(...mitHindernis.map((s) => s.length));
    expect(r.kleinste.regeln.length).toBe(klein);
    expect(r.wege.length).toBeGreaterThan(0);
    expect(r.wege.length).toBeLessThanOrEqual(L.WEGE_MAX);
    expect(r.wege[0].regeln).toEqual(r.kleinste.regeln);
    for (const w of r.wege) {
      const gleich = mitHindernis.filter((s) => s.join("|") === w.regeln.join("|")).length;
      expect(w.personen, w.regeln.join()).toBe(gleich);
      expect(w.deckt).toBe(Math.min(r.fehlt, r.direkt + w.personen));
    }
    for (let i = 1; i < r.wege.length; i++) expect(r.wege[i].regeln.length).toBeGreaterThanOrEqual(r.wege[i - 1].regeln.length);
    expect(r.hindernisse.some((h) => h.regel === "abwesend" && h.personen >= 2)).toBe(true);
    expect(r.hindernisse.some((h) => h.regel === "ruhezeitGesetz" && h.personen >= 6)).toBe(true);
  });
  it("fehlt entspricht Soll minus Ist der Besetzung; ursache benennt die Lage", () => {
    const { m } = mitLuecke();
    const b = besetzung(m, D).F;
    const r = L.lueckenUrsache(m, D, "F");
    expect(r.fehlt).toBe(b.soll - b.anzahl);
    expect(r.fehlt).toBeGreaterThan(0);
    expect(r.ursache).toBe("hindernisse");
    expect(r.unvollstaendig).toBe(false);
  });
  it("direkte Kandidaten vorhanden: Ursache 'direktMoeglich', keine Wege, keine kleinste Ursache", () => {
    const m = structuredClone(mitLuecke().m);
    m.abwesenheiten = [];
    m.abweichungen = {};
    const ist = besetzung(structuredClone(m), D).F.anzahl;
    m.dienstarten.find((x) => x.id === "F").mindest = { mo_do: ist + 1, fr: ist + 1, sa: ist + 1, so: ist + 1 };
    const r = L.lueckenUrsache(structuredClone(m), D, "F");
    expect(r.fehlt).toBeGreaterThan(0);
    expect(r.direkt).toBeGreaterThan(0);
    expect(r.ursache).toBe("direktMoeglich");
    expect(r.kleinste).toBeNull();
    expect(r.wege).toEqual([]);
  });
  it("niemand frei: Ursache 'keinPersonal'", () => {
    const m = structuredClone(mitLuecke().m);
    m.personen = [];
    const r = L.lueckenUrsache(m, D, "F");
    expect(r.geprueft).toBe(0);
    expect(r.ursache).toBe("keinPersonal");
    expect(r.wege).toEqual([]);
  });
});

describe("U2: Ehrlichkeit", () => {
  it("besetzter Dienst: keine Lücke, keine Ursache", () => {
    const { m } = mitLuecke();
    m.dienstarten.find((x) => x.id === "F").mindest = { mo_do: 0, fr: 0, sa: 0, so: 0 };
    const r = L.lueckenUrsache(m, D, "F");
    expect(r.fehlt).toBe(0);
    expect(r.ursache).toBe("besetzt");
    expect(r.wege).toEqual([]);
    expect(r.geprueft).toBe(0);
  });
  it("unbekannter Dienst, ungültiges Datum: Fehlerobjekt statt Raten", () => {
    const { m } = mitLuecke();
    expect(L.lueckenUrsache(m, D, "gibt-es-nicht")).toEqual({ ok: false, grund: "dienstUnbekannt" });
    expect(L.lueckenUrsache(m, "2026-13-40", "F")).toEqual({ ok: false, grund: "datumUngueltig" });
    expect(L.lueckenUrsache(m, "morgen", "F")).toEqual({ ok: false, grund: "datumUngueltig" });
    expect(L.lueckenUrsache(null, D, "F")).toEqual({ ok: false, grund: "betriebUngueltig" });
  });
});

describe("U3: Aufwandsbudget je äußerem Einstieg", () => {
  it("erschöpftes Budget: unvollständig, keine Ursache, keine Wege behauptet", () => {
    const { m } = mitLuecke();
    const r = L.lueckenUrsache(m, D, "F", { budget: L.budgetNeu(3) });
    expect(r.unvollstaendig).toBe(true);
    expect(r.geprueft).toBe(3);
    expect(r.ursache).toBe("unvollstaendig");
    expect(r.kleinste).toBeNull();
    expect(r.wege).toEqual([]);
  });
  it("ein Budget für alle Lücken: Gesamtzahl der Personenprüfungen bleibt unter dem Budget", () => {
    const { m } = mitLuecke();
    const budget = L.budgetNeu(40);
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-22", { budget });
    expect(r.ok).toBe(true);
    const summe = r.luecken.reduce((a, l) => a + l.geprueft, 0);
    expect(summe).toBeLessThanOrEqual(40);
    expect(summe).toBe(40 - budget.rest);
    expect(r.luecken.some((l) => l.unvollstaendig)).toBe(true);
    expect(r.unvollstaendig).toBe(true);
  });
  it("ohne übergebenes Budget bekommt jeder äußere Aufruf ein eigenes mit der Obergrenze", () => {
    const { m } = mitLuecke();
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-22");
    const summe = r.luecken.reduce((a, l) => a + l.geprueft, 0);
    expect(summe).toBeLessThanOrEqual(L.PERSONEN_PRUEFUNGEN_MAX);
  });
  it("Budget mit ungültigem Rest zählt als erschöpft (kein Überlauf, keine NaN-Umgehung)", () => {
    const { m } = mitLuecke();
    for (const rest of [NaN, -5, "viel", undefined, Infinity]) {
      const r = L.lueckenUrsache(m, D, "F", { budget: { rest } });
      expect(r.geprueft, String(rest)).toBe(0);
      expect(r.unvollstaendig, String(rest)).toBe(true);
    }
  });
});

describe("U4: Parametergrenzen", () => {
  it("Zeitraum höchstens 62 Tage, von <= bis, gültige Daten", () => {
    const { m } = mitLuecke();
    expect(L.konflikteMitUrsache(m, "2026-11-01", "2026-12-31").ok).toBe(true);        // genau 61 Tage
    expect(L.konflikteMitUrsache(m, "2026-11-01", "2027-01-02")).toEqual({ ok: false, grund: "zeitraumZuGross" });   // 63 Tage
    expect(L.konflikteMitUrsache(m, "2026-11-10", "2026-11-09")).toEqual({ ok: false, grund: "zeitraumUmgekehrt" });
    expect(L.konflikteMitUrsache(m, "2026-02-30", "2026-03-02")).toEqual({ ok: false, grund: "datumUngueltig" });
    expect(L.konflikteMitUrsache(m, undefined, "2026-03-02")).toEqual({ ok: false, grund: "datumUngueltig" });
  });
  it("Lückenzahl begrenzt: weitere Lücken werden gezählt, nicht untersucht", () => {
    const { m } = mitLuecke();
    const r = L.konflikteMitUrsache(m, "2026-11-01", "2026-12-31", { luckenMax: 3 });
    expect(r.luecken.length).toBeLessThanOrEqual(3);
    expect(r.luckenGesamt).toBeGreaterThan(3);
    expect(r.abgeschnitten).toBe(true);
    const r2 = L.konflikteMitUrsache(m, "2026-11-01", "2026-12-31", { luckenMax: 10 ** 9 });
    expect(r2.luecken.length).toBeLessThanOrEqual(L.LUECKEN_MAX);
  });
  it("Lücken sind nach Datum und Dienstreihenfolge geordnet; jede hat fehlt > 0", () => {
    const { m } = mitLuecke();
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-22");
    const reihe = r.luecken.map((l) => `${l.datum}|${m.dienstarten.findIndex((x) => x.id === l.dienst)}`);
    expect(reihe).toEqual([...reihe].sort((a, b) => (a.split("|")[0] < b.split("|")[0] ? -1 : a.split("|")[0] > b.split("|")[0] ? 1 : Number(a.split("|")[1]) - Number(b.split("|")[1]))));
    for (const l of r.luecken) expect(l.fehlt).toBeGreaterThan(0);
  });
});

describe("U5: Datenschutz — nur Kennungen und Zahlen", () => {
  it("keine Personenkennung, kein Name, kein Befund- oder Abwesenheitstext im Ergebnis", () => {
    const { m } = mitLuecke();
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-18");
    const s = JSON.stringify(r);
    for (const p of m.personen) {
      expect(s.includes(String(p.id)), `Id ${p.id}`).toBe(false);
      for (const teil of String(p.name || "").split(/\s+/).filter((t) => t.length > 3)) expect(s.includes(teil), `Name ${teil}`).toBe(false);
    }
    for (const w of ["Krank", "krank", "Urlaub", "Schutzvorschrift", "abwesend (", "Ruhezeit nach"]) expect(s.includes(w), w).toBe(false);
    const erlaubt = new Set(["ok", "von", "bis", "luecken", "luckenGesamt", "abgeschnitten", "unvollstaendig", "datum", "dienst", "fehlt", "geprueft", "direkt",
      "hindernisse", "regel", "personen", "kleinste", "regeln", "wege", "deckt", "ursache", "qualFehlt", "qid", "noetig", "ist", "ohneQualifikation", "vorgabenUnvollstaendig"]);
    const keys = (o, acc = new Set()) => { if (Array.isArray(o)) o.forEach((x) => keys(x, acc)); else if (o && typeof o === "object") for (const k of Object.keys(o)) { acc.add(k); keys(o[k], acc); } return acc; };
    for (const k of keys(r)) expect(erlaubt.has(k), `Schlüssel ${k}`).toBe(true);
  });
  it("Regelkennungen sind Kennungen aus dem Befundkatalog (keine Freitexte)", () => {
    const { m } = mitLuecke();
    const r = L.lueckenUrsache(m, D, "F");
    for (const h of r.hindernisse) expect(h.regel).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });
});

describe("U6: rein und ohne Seiteneffekt", () => {
  it("gleiche Eingabe ⇒ gleiches Ergebnis; eingefrorene Eingabe wird nicht verändert", () => {
    const { m } = mitLuecke();
    const a = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-19");
    const m2 = deepFreeze(structuredClone(m));
    const b = L.konflikteMitUrsache(m2, "2026-11-16", "2026-11-19");
    expect(b).toEqual(a);
  });
  it("Quelltext: keine Uhr, kein Zufall, keine Importe aus src/ oder intelligence/", () => {
    const q = lies("server/lib/engine/luckenursache.mjs");
    expect(q).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|await |async /);
    expect(q).not.toMatch(/from\s+["'][^"']*(\/src\/|\.\.\/\.\.\/src|intelligence\/)/);
  });
});

describe("U7 (Review #570): nicht bewertbar ist nie 'direkt'", () => {
  /** Nachtdienst am Tag, hoher Bedarf, bei allen Personen das Geburtsdatum entfernt (JArbSchG nicht bewertbar). */
  function nachtOhneGeburt() {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const n = m.dienstarten.find((x) => x.id === "N");
    n.mindest = { mo_do: 60, fr: 60, sa: 60, so: 60 };
    for (const p of m.personen) { delete p.geburtstag; delete p.geburtsdatum; }
    return m;
  }
  it("Befunde der Art 'Offen' (Stufe Hinweis) zählen als Hindernis, nicht als direkter Kandidat", () => {
    const m = nachtOhneGeburt();
    const da = m.dienstarten.find((x) => x.id === "N");
    const offen = aktive(m, D).filter((p) => !personTag(m, p, D).dienstId
      && Einsatz.hindernisBefunde(m, p, D, da).some((b) => /Offen$/.test(b.regel) && b.stufe === "hinweis"));
    expect(offen.length).toBeGreaterThan(0);                       // Voraussetzung des Falls
    const r = L.lueckenUrsache(structuredClone(m), D, "N");
    const ohneAnderes = aktive(m, D).filter((p) => !personTag(m, p, D).dienstId
      && Einsatz.hindernisBefunde(m, p, D, da).filter((b) => Einsatz.stufeRang(b.stufe) >= 2).length === 0
      && !Einsatz.hindernisBefunde(m, p, D, da).some((b) => /Offen$/.test(b.regel))).length;
    expect(r.direkt).toBe(ohneAnderes);
    expect(r.hindernisse.some((h) => h.regel === "schutzOffen")).toBe(true);
    if (ohneAnderes === 0) expect(r.ursache).not.toBe("direktMoeglich");
  });
});

describe("U8 (Review #570): Qualifikationslücke zählt nur Personen mit der Qualifikation", () => {
  function mitQualLuecke(vergeben) {
    const m = mitGeburt(structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]));
    m.qualifikationen.push({ id: "qx-neu", name: "Testqualifikation", kurz: "QX" });
    const fr = m.dienstarten.find((x) => x.id === "F");
    fr.mindest = { mo_do: 0, fr: 0, sa: 0, so: 0 };
    fr.mindestQual = { "qx-neu": 1 };
    if (vergeben) for (const p of aktive(m, D).filter((x) => !personTag(m, x, D).dienstId).slice(0, vergeben)) p.qualifikationen = [...(p.qualifikationen || []), "qx-neu"];
    return structuredClone(m);
  }
  it("niemand hat die Qualifikation: keine direkten Kandidaten, Ursache benennt die Qualifikation", () => {
    const r = L.lueckenUrsache(mitQualLuecke(0), D, "F");
    expect(r.qualFehlt.length).toBe(1);
    expect(r.direkt).toBe(0);
    expect(r.ursache).toBe("qualifikationFehlt");
    expect(r.ohneQualifikation).toBeGreaterThan(0);
    expect(r.wege).toEqual([]);
  });
  it("zwei Personen haben sie: nur diese zählen als direkt", () => {
    const m = mitQualLuecke(2);
    const r = L.lueckenUrsache(m, D, "F");
    expect(r.direkt).toBeLessThanOrEqual(2);
    expect(r.direkt).toBeGreaterThan(0);
    expect(r.ursache).toBe("direktMoeglich");
  });
});

describe("U9 (Review #570): Budget-Umgehung und unvollständige Betriebe", () => {
  it("riesige endliche Budgets werden auf die Obergrenze gedeckelt", () => {
    const { m } = mitLuecke();
    for (const rest of [1e9, Number.MAX_SAFE_INTEGER]) {
      const budget = { rest };
      const r = L.konflikteMitUrsache(structuredClone(m), "2026-11-01", "2026-12-15", { budget });
      const summe = r.luecken.reduce((a, l) => a + l.geprueft, 0);
      expect(summe, String(rest)).toBeLessThanOrEqual(L.PERSONEN_PRUEFUNGEN_MAX);
      expect(budget.rest).toBeLessThanOrEqual(L.PERSONEN_PRUEFUNGEN_MAX);
    }
  });
  it("fehlende Felder: Fehlerobjekt statt TypeError", () => {
    const { m } = mitLuecke();
    const a = structuredClone(m); delete a.einstellungen;
    expect(L.lueckenUrsache(a, D, "F")).toEqual({ ok: false, grund: "betriebUngueltig" });
    const b = structuredClone(m); delete b.personen[0].id;
    expect(L.lueckenUrsache(b, D, "F")).toEqual({ ok: false, grund: "betriebUngueltig" });
    const c = structuredClone(m); delete c.abwesenheiten;
    expect(L.konflikteMitUrsache(c, "2026-11-16", "2026-11-17")).toEqual({ ok: false, grund: "betriebUngueltig" });
  });
});

/* ------------------------------------------------------------------------ */
describe("U10 (#566): internes Vorgaben-Budget je Einstieg, automatisch, Laufzeit", () => {
  const MUSS = (id) => ({ id, name: `Vorgabe ${id}`, regelart: "musterregel", parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] },
    geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv" });
  const FREI = (id) => ({ ...MUSS(id), regelart: "zaehlregel", parameter: { ereignis: "frei", fenster: { art: "rollierend", einheit: "tage", laenge: 28 }, richtung: "mindestens", grenze: 8 } });
  const mitVorgaben = (liste) => { const { m } = mitLuecke(); m.vorgaben = liste; return structuredClone(m); };

  it("EIN Vorgaben-Budget je Einstieg: dasselbe Objekt wird von allen Lücken und Personen verbraucht", () => {
    const m = mitVorgaben([MUSS("a"), FREI("b")]);
    const vb = neuesVorgabenBudget();
    const start = vb.rest;
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-20", { vorgabenBudget: vb });
    expect(r.luecken.length).toBeGreaterThan(1);
    expect(vb.rest).toBeLessThan(start);
    const kosten1 = start - vb.rest;
    const vb2 = neuesVorgabenBudget();
    L.lueckenUrsache(structuredClone(m), "2026-11-16", "F", { vorgabenBudget: vb2 });
    expect(kosten1).toBeGreaterThan(start - vb2.rest);      // mehrere Lücken kosten mehr als eine
  });
  it("kleines Vorgaben-Budget: unvollständig, keine Ursache behauptet, nie 'direkt'", () => {
    const m = mitVorgaben([MUSS("a"), FREI("b")]);
    const r = L.konflikteMitUrsache(m, "2026-11-16", "2026-11-20", { vorgabenBudget: neuesVorgabenBudget(1) });
    expect(r.vorgabenUnvollstaendig).toBe(true);
    expect(r.unvollstaendig).toBe(true);
    for (const l of r.luecken) {
      expect(l.vorgabenUnvollstaendig).toBe(true);
      expect(l.unvollstaendig).toBe(true);
      expect(l.ursache).toBe("unvollstaendig");
      expect(l.kleinste).toBeNull();
      expect(l.wege).toEqual([]);
    }
  });
  it("ohne übergebenes Vorgaben-Budget legt der äußere Aufruf genau eines an (Voreinstellung reicht für wenige Vorgaben)", () => {
    const r = L.konflikteMitUrsache(mitVorgaben([MUSS("a")]), "2026-11-16", "2026-11-18");
    expect(r.vorgabenUnvollstaendig).toBe(false);
  });
  it("Vorgaben-Budget mit falscher Form oder riesigem Rest: kein Wurf, Obergrenze gilt", () => {
    const m = mitVorgaben([MUSS("a")]);
    for (const vb of [{}, { rest: 5 }, null, "x", { rest: 1e12, cache: new WeakMap(), vorbereitet: new WeakMap(), ausgeschoepft: false }]) {
      const r = L.lueckenUrsache(structuredClone(m), "2026-11-17", "F", { vorgabenBudget: vb });
      expect(r.ok === false, JSON.stringify(vb)).toBe(false);
      if (vb && vb.rest === 1e12) expect(vb.rest).toBeLessThanOrEqual(VORGABEN_WIRKUNG_GRENZE.aufwand);
    }
  });
  it("Einsatzprüfung läuft automatisch (ungeprüfte Muss-Vorgabe gilt als Achtung): Quelltext reicht beides durch", () => {
    const q = lies("server/lib/engine/luckenursache.mjs");
    expect(q).toMatch(/vorgabenAutomatisch: true/);
    expect(q).toMatch(/vorgabenBudget/);
  });
  it("Messung: 300 Personen, 62 Tage, 50 Muss-Vorgaben rollierend — Laufzeit mit Vorgaben bleibt gedeckelt", () => {
    const basis = mitLuecke().m;
    const viele = (vorgaben) => {
      const m = structuredClone(basis);
      const vorlage = m.personen.slice();
      let i = 0;
      while (m.personen.length < 300) { const q = structuredClone(vorlage[i % vorlage.length]); q.id = `kopie-${i++}`; m.personen.push(q); }
      m.vorgaben = vorgaben;
      return m;
    };
    const lauf = (m) => { const t = process.hrtime.bigint(); const r = L.konflikteMitUrsache(m, "2026-11-01", "2026-12-31"); return { r, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };
    const ohne = lauf(viele([]));
    const mit = lauf(viele(Array.from({ length: 50 }, (_, i) => FREI(`v${i}`))));
    expect(ohne.r.ok).toBe(true);
    expect(mit.r.ok).toBe(true);
    const summe = mit.r.luecken.reduce((a, l) => a + l.geprueft, 0);
    expect(summe).toBeLessThanOrEqual(L.PERSONEN_PRUEFUNGEN_MAX);
    console.log("MESSUNG ohne", Math.round(ohne.ms), "ms, mit", Math.round(mit.ms), "ms, Prüfungen", summe);
    expect(mit.ms).toBeLessThan(Math.max(10 * ohne.ms, 5000));
  });
});
