/* ==========================================================================
   WP-14c — Folgebefunde F2, F4–F8 aus dem WP-14b-Delta-Review

   F2  Pause so lang wie die Anwesenheit ⇒ Prüffall PAUSE_ZU_LANG (nie automatisch bestätigt); Altdaten mit
       negativem Ist bleiben 0 h, aber als Prüffall gekennzeichnet.
   F4  ZEITUMSTELLUNG-Sperre nicht mit verschobenen Minuten umgehbar (Uhrzeiten müssen zur gemessenen Dauer passen).
   F5  gemessene Dauer als Hilfsfunktion (Stempelbefunde zeigen sie).
   F6  (offen, docs/acc45/wp16c-fragen.md) — hier nur festgenagelt: Beginn = Ende wird ohne Plan nie bestätigt.
   F7  Antrag „überholt“: Hilfsfunktion der Oberfläche und Serverabweisung (409).
   F8  Selbstauskunft: Mitternacht und Tagesdatum bei der Pausenprüfung.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { aufbauen } from "./wp16-folge-harness.mjs";
import { istZeitFuer, zurPruefung, gemesseneDauerMin, dauerMinText, antragUeberholt, nurKorrekturGrund, bestaetigungsGrund }
  from "../server/lib/istdaten.mjs";
import { korrekturAnhaengen, zeitumstellungSperre, BEGINN_GLEICH_ENDE } from "../server/lib/stempelintegritaet.mjs";
import { antragStellen, antragEntscheiden } from "../server/lib/korrekturworkflow.mjs";
import { selbstauskunftPruefen } from "../server/lib/zeiterfassung.mjs";

const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
let h;
beforeAll(async () => { h = await aufbauen("wp14c", "2026-11-10T05:00:00Z"); }, 60000);
afterAll(async () => { if (h) await h.abbauen(); });

const stempeln = async (raum, pid, startIso, endeIso, pause) => {
  h.zeitAuf(startIso);
  const s = await h.anfrage("stempeln", { token: await h.token(raum, pid), rumpf: { art: "start" } });
  expect(s.status, s.roh).toBe(200);
  h.zeitAuf(endeIso);
  return h.anfrage("stempeln", { token: await h.token(raum, pid), rumpf: { art: "ende", ...(pause === undefined ? {} : { pause }) } });
};

describe("F2: Pause erreicht die Anwesenheit ⇒ Prüffall statt 0 h bestätigt", { timeout: 120000 }, () => {
  it("06:00–06:20 mit Pause der Dienstart (30 min): nicht bestätigt, PAUSE_ZU_LANG, Prüffall; zählt nicht still 0 h", async () => {
    await h.raum("f2", [h.person("a1"), h.person("l1", "leitung")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await stempeln("f2", "a1", "2026-11-10T05:00:00Z", "2026-11-10T05:20:00Z");
    expect(r.status, r.roh).toBe(200);
    expect(r.erfassung).toMatchObject({ bestaetigt: false });
    expect(r.erfassung.grund).toMatch(/^PAUSE_ZU_LANG/);
    expect(r.markierungen).toContain("PAUSE_ZU_LANG");
    const m = await h.mandant("f2");
    const e = m.erfassung["a1|2026-11-10"];
    expect(zurPruefung(e)).toBe(true);
    expect(nurKorrekturGrund(e.grund)).toBe(true);
    expect(bestaetigungsGrund(e)).toMatch(/zu langer Pause/);
    expect(istZeitFuer(m, m.personen[0], "2026-11-10", F)).toMatchObject({ zurPruefung: true, erfasst: false });
  });
  it("Bestätigung nur über die Korrektur der Leitung: dieselben Zeiten ohne neue Pause ⇒ 422; mit passender Pause 200; Mitarbeiter ⇒ 403", async () => {
    const lt = await h.token("f2", "l1", "leitung");
    const rumpf = { personId: "a1", datum: "2026-11-10", start: "06:00", ende: "06:20", grund: "Kurzer Einsatz geprüft" };
    const nein = await h.anfrage("stempel-korrektur", { token: lt, rumpf });
    expect(nein.status, nein.roh).toBe(422);
    const mit = await h.anfrage("stempel-korrektur", { token: await h.token("f2", "a1"), rumpf: { ...rumpf, pause: 0 } });
    expect(mit.status).toBe(403);
    const ja = await h.anfrage("stempel-korrektur", { token: lt, rumpf: { ...rumpf, pause: 0 } });
    expect(ja.status, ja.roh).toBe(200);
    const m = await h.mandant("f2");
    expect(m.erfassung["a1|2026-11-10"]).toMatchObject({ bestaetigt: true, pause: 0 });
    expect(istZeitFuer(m, m.personen[0], "2026-11-10", F).std).toBeCloseTo(1 / 3, 2);
  });
  it("Kontrolle: 06:00–06:40 mit Pause 30 bleibt bestätigt (keine Verschärfung ohne Anlass)", async () => {
    await h.raum("f2k", [h.person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await stempeln("f2k", "a1", "2026-11-10T05:00:00Z", "2026-11-10T05:40:00Z");
    expect(r.erfassung).toMatchObject({ bestaetigt: true });
    expect(r.markierungen || []).not.toContain("PAUSE_ZU_LANG");
  });
  it("Altdaten mit negativem Ist: 0 h bleibt (wie WP-14b), aber als Prüffall gekennzeichnet", () => {
    const m = { personen: [{ id: "a" }], dienstarten: [F], erfassung: { "a|2026-11-09": { start: "06:00", ende: "06:30", bestaetigt: true, pause: 60, grund: "" } } };
    expect(istZeitFuer(m, m.personen[0], "2026-11-09", F)).toMatchObject({ std: 0, erfasst: true, zurPruefung: true, pauseUeberAnwesenheit: true });
    const ok = { ...m, erfassung: { "a|2026-11-09": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } };
    expect(istZeitFuer(ok, ok.personen[0], "2026-11-09", F).zurPruefung).toBeUndefined();
  });
});

describe("F4: ZEITUMSTELLUNG nicht mit verschobenen Minuten umgehbar", { timeout: 120000 }, () => {
  const DA = { id: "F", start: "06:00", ende: "14:00", pause: 0 };
  const klein = () => ({ id: "m1", personen: [{ id: "a", vorname: "A", nachname: "A", rolle: "mitarbeiter", geburtstag: "1985-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }],
    einheiten: [{ id: "e1", name: "WB" }], dienstarten: [DA], abweichungen: { "a|2026-10-25": "F" }, abwesenheiten: [],
    einstempeln: { "a|2026-10-25": { start: "02:30", startAm: "2026-10-25T00:30:00.000Z", ende: "02:20", endeAm: "2026-10-25T01:20:00.000Z", markierungen: ["ZEITUMSTELLUNG"] } },
    erfassung: { "a|2026-10-25": { start: "02:30", ende: "02:20", bestaetigt: false, grund: "ZEITUMSTELLUNG: 0,8 Stunden gemessen" } } });
  const k = (m, start, ende) => korrekturAnhaengen(m, { personId: "a", datum: "2026-10-25", start, ende, pause: 0, grund: "Herbstnacht geprüft, Zeiten eindeutig" },
    { personId: "l", rolle: "leitung" }, new Date("2026-10-26T08:00:00Z"), "k-1");
  it("02:30–02:21 (eine Minute verschoben) ⇒ 422 mit gemessener Dauer; 02:30–03:20 (= 50 min) geht", () => {
    const m = klein();
    const knapp = k(m, "02:30", "02:21");
    expect(knapp.status).toBe(422);
    expect(knapp.grund).toMatch(/Gestempelt wurden 0:50 h/);
    expect(k(m, "02:30", "02:20").status).toBe(422);                       // wie bisher: dieselben Zeiten
    expect("status" in k(m, "02:30", "03:20")).toBe(false);
  });
  it("derselbe Schutz im Antrag und in der Genehmigung", () => {
    const m = klein();
    const a = antragStellen(m, { personId: "a" }, { datum: "2026-10-25", start: "02:30", ende: "02:21", pause: 0, grund: "Zeiten der Herbstnacht" },
      new Date("2026-10-26T08:00:00Z"), "an-1", "2026-10-26");
    expect(a.status).toBe(422);
    const gut = antragStellen(m, { personId: "a" }, { datum: "2026-10-25", start: "02:30", ende: "03:20", pause: 0, grund: "Zeiten der Herbstnacht" },
      new Date("2026-10-26T08:00:00Z"), "an-2", "2026-10-26");
    expect("status" in gut).toBe(false);
    /* Ein vor dem Fix gestellter Antrag mit den verschobenen Zeiten wird bei der Genehmigung abgewiesen. */
    const alt = { id: "an-alt", von: { personId: "a" }, gestellt: "2026-10-26T07:00:00Z", vorschlag: { start: "02:30", ende: "02:21", pause: 0 }, grund: "alt",
      original: { start: "02:30", ende: "02:20" }, ist: { start: "02:30", ende: "02:20", bestaetigt: false }, status: "offen", entschieden: null };
    const m2 = { ...m, einstempeln: { "a|2026-10-25": { ...m.einstempeln["a|2026-10-25"], antraege: [alt] } } };
    expect(antragEntscheiden(m2, { personId: "a", datum: "2026-10-25", antragId: "an-alt", entscheidung: "genehmigt" }, { personId: "l" }, new Date("2026-10-26T08:00:00Z"), "k-2").status).toBe(422);
  });
  it("HTTP: stempel-korrektur der Leitung mit den verschobenen Zeiten ⇒ 422; ohne Zeitpunkte am Altstempel gilt nur die Sperre gegen dieselben Zeiten", async () => {
    await h.raum("f4", [h.person("a1"), h.person("l1", "leitung")], { abweichungen: { "a1|2026-10-25": "F" },
      einstempeln: { "a1|2026-10-25": klein().einstempeln["a|2026-10-25"] }, erfassung: { "a1|2026-10-25": klein().erfassung["a|2026-10-25"] } });
    h.zeitAuf("2026-10-26T08:00:00Z");
    const lt = await h.token("f4", "l1", "leitung");
    const rumpf = { personId: "a1", datum: "2026-10-25", ende: "02:21", start: "02:30", pause: 0, grund: "Herbstnacht geprüft, Zeiten eindeutig" };
    expect((await h.anfrage("stempel-korrektur", { token: lt, rumpf })).status).toBe(422);
    const alt = { start: "02:30", ende: "02:20" };                          // Altstempel ohne startAm/endeAm
    expect(zeitumstellungSperre({ ...klein().erfassung["a|2026-10-25"] }, "02:30", "02:21", alt, "2026-10-25")).toBeNull();
    expect(zeitumstellungSperre({ ...klein().erfassung["a|2026-10-25"] }, "02:30", "02:20", alt, "2026-10-25")).not.toBeNull();
  });
});

describe("F5: gemessene Dauer", { timeout: 120000 }, () => {
  it("Minuten zwischen den eindeutigen Zeitpunkten; Text; null ohne Zeitpunkte", () => {
    const s = { startAm: "2026-10-25T00:30:00.000Z", endeAm: "2026-10-25T01:20:00.000Z" };
    expect(gemesseneDauerMin(s)).toBe(50);
    expect(dauerMinText(50)).toBe("0:50 h");
    expect(dauerMinText(452)).toBe("7:32 h");
    expect(gemesseneDauerMin({ startAm: s.startAm })).toBeNull();
    expect(gemesseneDauerMin({ startAm: s.endeAm, endeAm: s.startAm })).toBeNull();
    expect(gemesseneDauerMin(null)).toBeNull();
  });
  it("die Stempelbefunde zeigen sie neben den Uhrzeiten", async () => {
    const q = await readFile("src/ansichten/korrekturen.jsx", "utf8");
    expect(q).toContain("gemesseneDauerMin");
    expect(q).toContain("gestempelt {dauerMinText");
  });
});

describe("F6 (Frage offen, wp16c-fragen.md): Beginn = Ende wird ohne geplanten 24-h-Dienst nie bestätigt", { timeout: 120000 }, () => {
  it("Korrektur 06:00–06:00 ⇒ BEGINN_GLEICH_ENDE; ein DAUER_NULL-Fehlstempel lässt sich nicht still als 24 h oder 0 h bestätigen", async () => {
    await h.raum("f6", [h.person("a1"), h.person("l1", "leitung")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await stempeln("f6", "a1", "2026-11-10T05:00:00Z", "2026-11-10T05:00:20Z");
    expect(r.erfassung.grund).toMatch(/^DAUER_NULL/);
    const lt = await h.token("f6", "l1", "leitung");
    const k = await h.anfrage("stempel-korrektur", { token: lt, rumpf: { personId: "a1", datum: "2026-11-10", start: "06:00", ende: "06:00", grund: "Fehlstempel ohne Arbeit" } });
    expect(k.status, k.roh).toBe(422);
    expect(k.roh).toContain("dieselbe Uhrzeit");
    expect(BEGINN_GLEICH_ENDE).toMatch(/dieselbe Uhrzeit/);
    expect(zurPruefung((await h.mandant("f6")).erfassung["a1|2026-11-10"])).toBe(true);
  });
});

describe("F7: Antrag überholt", { timeout: 120000 }, () => {
  it("antragUeberholt: Ist-Zeit seit dem Antrag geändert ⇒ true; unverändert oder entschieden ⇒ false", () => {
    const a = { status: "offen", ist: { start: "06:00", ende: "14:00", bestaetigt: true } };
    expect(antragUeberholt(a, { start: "06:00", ende: "14:00", bestaetigt: true })).toBe(false);
    expect(antragUeberholt(a, { start: "06:00", ende: "14:30", bestaetigt: true, pause: 30 })).toBe(true);
    expect(antragUeberholt({ ...a, ist: null }, undefined)).toBe(false);
    expect(antragUeberholt({ ...a, status: "abgelehnt" }, null)).toBe(false);
  });
  it("die Oberfläche sperrt Genehmigen und zeigt die aktuelle Ist-Zeit", async () => {
    const q = await readFile("src/ansichten/korrekturantraege.jsx", "utf8");
    expect(q).toContain("antragUeberholt(a, aktuell)");
    expect(q).toContain("disabled={ueberholt}");
    expect(q).toContain("(ueberholt ? aktuell : a.ist)");
  });
});

describe("F8: Selbstauskunft — Mitternacht und Tagesdatum der Pausenprüfung", { timeout: 120000 }, () => {
  const N = { id: "N", start: "22:00", ende: "06:00", pause: 30 };
  const X = { id: "X", start: "08:00", ende: "08:00", pause: 60 };
  const m = { personen: [{ id: "a" }], dienstarten: [F, N, X], abwesenheiten: [], einheiten: [],
    abweichungen: { "a|2026-03-29": "F", "a|2026-03-30": "N", "a|2026-03-31": "X" } };
  const t = (d, w) => selbstauskunftPruefen(m, { id: "a" }, d, { bestaetigt: true, grund: "", ...w }, "2026-04-05");
  it("Frühjahrsnacht: 01:00–04:00 sind nur 2 h ⇒ Pause 150 zu lang (mit Datum gerechnet)", () => {
    expect(t("2026-03-29", { start: "01:00", ende: "04:00", pause: 150 }).grund).toMatch(/Pause muss kürzer/);
    expect(t("2026-03-29", { start: "01:00", ende: "04:00", pause: 100 }).eintrag).toBeTruthy();
  });
  it("Beginn = Ende über Mitternacht nur am geplanten 24-h-Dienst", () => {
    expect(t("2026-03-30", { start: "22:00", ende: "22:00" }).grund).toBe(BEGINN_GLEICH_ENDE);
    expect(t("2026-03-31", { start: "08:00", ende: "08:00" }).eintrag).toBeTruthy();
  });
});

describe("F4 (Review): Ausnahme von der Zeitumstellungs-Sperre durch die Leitung mit Pflichtgrund", { timeout: 120000 }, () => {
  const fall = (datum, startAm, endeAm, start, ende) => ({
    einstempeln: { [`a1|${datum}`]: { start, startAm, ende, endeAm, markierungen: ["ZEITUMSTELLUNG"] } },
    erfassung: { [`a1|${datum}`]: { start, ende, bestaetigt: false, grund: "ZEITUMSTELLUNG: gemessen" } } });
  for (const [name, raum, datum, startAm, endeAm, start, ende, wahr] of [
    ["Herbstnacht", "f4-herbst", "2026-10-24", "2026-10-24T20:00:00.000Z", "2026-10-25T04:00:00.000Z", "22:00", "06:30", ["22:00", "06:00"]],
    ["Frühjahrsnacht", "f4-fruehjahr", "2026-03-28", "2026-03-28T21:00:00.000Z", "2026-03-29T05:00:00.000Z", "22:00", "07:30", ["22:00", "06:00"]],
  ]) {
    it(`${name}: verschobene Zeiten ⇒ 422; Planung mit Ausnahme ⇒ 422 (ignoriert); Leitung mit Ausnahme und Grund ⇒ 200, im Ereignis und in der Spur vermerkt`, async () => {
      await h.raum(raum, [h.person("a1"), h.person("l1", "leitung"), h.person("p1", "planer")], fall(datum, startAm, endeAm, start, ende));
      h.zeitAuf("2026-11-10T09:00:00Z");
      const rumpf = { personId: "a1", datum, start: wahr[0], ende: wahr[1], pause: 0, grund: "Nachtdienst über die Zeitumstellung geprüft" };
      const ausn = { zeitumstellungAusnahme: true, zeitumstellungGrund: "Arbeitszeit laut Dienstbuch bestätigt" };
      const lt = await h.token(raum, "l1", "leitung"), pt = await h.token(raum, "p1", "planer");
      const nein = await h.anfrage("stempel-korrektur", { token: lt, rumpf });
      expect([nein.status, /zeitumstellungAusnahme/.test(nein.roh)]).toEqual([422, true]);
      expect((await h.anfrage("stempel-korrektur", { token: pt, rumpf: { ...rumpf, ...ausn } })).status).toBe(422);
      expect((await h.mandant(raum)).erfassung[`a1|${datum}`].bestaetigt).toBe(false);
      /* eigener Pflichtgrund */
      const ohneGrund = await h.anfrage("stempel-korrektur", { token: lt, rumpf: { ...rumpf, zeitumstellungAusnahme: true } });
      expect([ohneGrund.status, /zeitumstellungGrund/.test(ohneGrund.roh)]).toEqual([422, true]);
      expect((await h.anfrage("stempel-korrektur", { token: lt, rumpf: { ...rumpf, zeitumstellungAusnahme: true, zeitumstellungGrund: "kurz" } })).status).toBe(422);
      const ja = await h.anfrage("stempel-korrektur", { token: lt, rumpf: { ...rumpf, ...ausn } });
      expect(ja.status, ja.roh).toBe(200);
      expect(ja.ereignis).toMatchObject({ zeitumstellungAusnahme: true, zeitumstellungGrund: ausn.zeitumstellungGrund });
      expect(ja.ereignis.grund).toMatch(/Zeitumstellung geprüft/);
      expect((await h.mandant(raum)).erfassung[`a1|${datum}`]).toMatchObject({ bestaetigt: true, start: wahr[0], ende: wahr[1] });
      const spur = (await h.spur("2026-11-10")).filter((x) => /Zeitumstellung bestätigt/.test(x.zusatz || ""));
      expect(spur.length).toBeGreaterThanOrEqual(1);
      for (const z of spur) expect(z.zusatz).not.toMatch(/\d{4}-\d{2}-\d{2}|\d\d:\d\d/);
    });
  }
  it("dieselben Uhrzeiten bleiben auch mit Ausnahme gesperrt (sie ergäben die falsche Dauer)", () => {
    const f = { start: "02:30", ende: "02:20", bestaetigt: false, grund: "ZEITUMSTELLUNG: x" };
    const s = zeitumstellungSperre(f, "02:30", "02:20", { startAm: "2026-10-25T00:30:00.000Z", endeAm: "2026-10-25T01:20:00.000Z" }, "2026-10-25");
    expect(s && s.ausnahmeMoeglich).toBeFalsy();
  });
});

describe("F4 (Re-Review): die Ausnahme gilt nicht für die eigene Zeit", { timeout: 120000 }, () => {
  it("Leitung korrigiert ihre eigene Nachtzeit mit Ausnahme ⇒ 422 (Selbstfreigabe gesperrt)", async () => {
    const datum = "2026-10-24";
    await h.raum("f4-selbst", [h.person("l1", "leitung")], {
      einstempeln: { [`l1|${datum}`]: { start: "22:00", startAm: "2026-10-24T20:00:00.000Z", ende: "06:30", endeAm: "2026-10-25T04:00:00.000Z", markierungen: ["ZEITUMSTELLUNG"] } },
      erfassung: { [`l1|${datum}`]: { start: "22:00", ende: "06:30", bestaetigt: false, grund: "ZEITUMSTELLUNG: gemessen" } } });
    h.zeitAuf("2026-11-10T09:00:00Z");
    const r = await h.anfrage("stempel-korrektur", { token: await h.token("f4-selbst", "l1", "leitung"), rumpf: { personId: "l1", datum, start: "22:00", ende: "06:00", pause: 0,
      grund: "Eigene Nachtzeit geprüft", zeitumstellungAusnahme: true, zeitumstellungGrund: "Arbeitszeit laut Dienstbuch bestätigt" } });
    expect([r.status, /eigene Zeit/.test(r.roh)]).toEqual([422, true]);
  });
});
