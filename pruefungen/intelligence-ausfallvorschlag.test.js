/* ==========================================================================
   INTELLIGENCE — F3 AUSFALL-VORSCHLAG (WP-I20 Teil 1)

   Geprüft über den echten serverseitigen Kern (ausfallVorschlag): Schalter aus (Vorgabe), Rollenmatrix, Freigabe,
   Anfrageform und Grenzen, kein Anbieteraufruf, keine Gesundheits-/Abwesenheitsangaben in der Ausgabe (mit einer
   Gegenprobe, dass der Prüfer selbst anschlägt), genaue Ausgabe, Determinismus, nichts geschrieben, anderer Betrieb,
   und die EINE Ruhezeit-Rechnung (ruheIst) im Rechenkern und im Vorschlag.
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ausfallVorschlag, F3_TEXT, F3_HINWEIS, AUSFALL_GRENZEN } from "../server/lib/intelligence/funktionen/ausfallvorschlag.mjs";
import { offenePersonenAm } from "../server/lib/klaerung.mjs";
import { ruheIst, ruheZuNachbarn, ersatzKandidaten } from "../server/lib/engine/ersatzfakten.mjs";
import { rechnen } from "../server/lib/engine/rechenkern.mjs";
import { mitTagesdatum } from "../server/lib/engine/zeit.mjs";
import { bestand, S, sitzung } from "./intelligence-gateway-fixture.mjs";
import { deepFreeze } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const HEUTE = "2026-11-02";
const TAG = "2026-11-04";

const P = (id, vn, nn, extra = {}) => ({ id, vorname: vn, nachname: nn, rolle: "mitarbeiter", bereich: "e1", wochenstunden: 38, imSchichtdienst: false,
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
/* x1 fällt aus (Früh am 4.11.). k1 direkt; k2 Near-Miss (Spät am Vortag); k3 krank (Abwesenheit mit Grund und Diagnose);
   k4 offener Krankmeldungsfall ohne Abwesenheit; br1 Betriebsrat; l1/pl1 Leitung/Planung. */
const betrieb = (id = "m1") => ({
  id, name: "Testheim", einheiten: [{ id: "e1", name: "Station" }], bundesland: "HB",
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, qualifikationen: [],
  dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } },
    { id: "S", kurz: "S", name: "Spät", start: "14:00", ende: "22:00", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } }],
  personen: [P("l1", "Lena", "Brandt", { rolle: "leitung" }), P("pl1", "Piotr", "Kowalski", { rolle: "planer" }), P("x1", "Xaver", "Ausfall"),
    P("k1", "Karla", "Direkt"), P("k2", "Kurt", "Nahe"), P("k3", "Kira", "Krank"), P("k4", "Karl", "Offenerfall"),
    P("br1", "Gerda", "Rat", { rolle: "betriebsrat" })],
  abweichungen: { [`x1|${TAG}`]: "F", "k2|2026-11-03": "S" },
  abwesenheiten: [{ id: "ab1", personId: "k3", von: TAG, bis: "2026-11-05", art: "krank", grund: "Grippe", anmerkung: "Diagnose J11" }],
  krankmeldungen: [{ id: "km1", personId: "k4", von: TAG, bis: TAG, status: "eingegangen", verlauf: [], notiz: "Magen-Darm" }],
  klaerung: [{ fallId: "km1", personId: "k4", datum: TAG, dienstId: "F", hinweis: "Besetzung klärungsbedürftig" }],
  notizen: { [`x1|${TAG}`]: "Bandscheibe" },
});
const ZIEL = { personId: "x1", von: TAG };
function lauf(o = {}) {
  const ladeBestand = vi.fn(async () => bestand(betrieb()));
  const args = { ausgeschlossenAm: offenePersonenAm, sitzung: S.leitung, anfrage: { ausfaelle: [ZIEL] }, heute: HEUTE, ladeBestand, schalter: AN, funktionenFreigegeben: ["F3"], ...o };
  return { ladeBestand, ruf: () => ausfallVorschlag(args) };
}
const fehlerCode = async (p) => { try { await p; } catch (e) { return e.code; } return null; };
const fold = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/* Die Prüfung, dass nichts über Gesundheit oder Abwesenheit in der Ausgabe steht. */
const VERBOTEN = ["grippe", "diagnose", "j11", "magen", "bandscheibe", "krank", "kira", "k3", "k4", "offenerfall", "km1", "klaerung",
  "abwesen", "urlaub", "notiz", "anmerkung", "grund", "ab1", "\"art\""];
const leckt = (ausgabe) => { const s = fold(JSON.stringify(ausgabe)); return VERBOTEN.filter((v) => s.includes(v)); };

const ERWARTET = {
  funktion: "F3", quelle: "berechnet", zusammenfassung: { verfuegbar: false, text: F3_TEXT },
  ergebnisse: [{
    personId: "x1", datum: TAG, hinweis: F3_HINWEIS, name: "Xaver Ausfall", status: "ok",
    dienst: { id: "F", kurz: "F", beginn: "06:00", ende: "14:00" },
    direkt: [{ personId: "br1", name: "Gerda Rat", punkte: 8, ruheIstMin: null }, { personId: "k1", name: "Karla Direkt", punkte: 8, ruheIstMin: null }, { personId: "l1", name: "Lena Brandt", punkte: 8, ruheIstMin: null },
      { personId: "pl1", name: "Piotr Kowalski", punkte: 8, ruheIstMin: null }],
    nahe: [{ personId: "k2", name: "Kurt Nahe", punkte: -8, hinderung: "ruhezeitGesetz", spielraumMin: 180, ruheIstMin: 480 }],
  }],
};

afterEach(() => { vi.restoreAllMocks(); });

describe("Schalter, Sitzung, Rolle, Freigabe", () => {
  it("Schalter aus (Vorgabe): KI_AUS, nichts wird geladen; ein einzelner Schalter zählt als aus", async () => {
    for (const schalter of [undefined, { prozess: () => "aus", laufzeit: () => "aus" }, { prozess: () => "an", laufzeit: () => "aus" },
      { prozess: () => "an", laufzeit: () => true }, { prozess: () => { throw new Error("x"); }, laufzeit: () => "an" }]) {
      const l = lauf({ schalter });
      expect(await fehlerCode(l.ruf())).toBe("KI_AUS");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("Rollenmatrix: Leitung und Planung ja; alle anderen KI_ROLLE ohne Laden", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const r = await lauf({ sitzung: sitzung(rolle, rolle === "leitung" ? "l1" : "pl1") }).ruf();
      expect(r.ergebnisse[0].status).toBe("ok");
    }
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "admin"]) {
      const l = lauf({ sitzung: { ...S.leitung, rolle } });
      expect(await fehlerCode(l.ruf())).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    for (const [s, code] of [[null, "KI_NICHT_ANGEMELDET"], [{ ...S.leitung, rolle: "" }, "KI_ROLLE"], [{ ...S.leitung, rolle: undefined }, "KI_NICHT_ANGEMELDET"],
      [{ ...S.leitung, person: "" }, "KI_NICHT_ANGEMELDET"], [{ ...S.leitung, bestand: "" }, "KI_NICHT_ANGEMELDET"]]) {
      const l = lauf({ sitzung: s });
      expect(await fehlerCode(l.ruf())).toBe(code);
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("ohne Freigabe der Funktion F3: KI_FUNKTION", async () => {
    expect(await fehlerCode(lauf({ funktionenFreigegeben: ["F1", "F2", "F15"] }).ruf())).toBe("KI_FUNKTION");
    expect(await fehlerCode(lauf({ funktionenFreigegeben: undefined }).ruf())).toBe("KI_FUNKTION");
  });
});

describe("Anfrage und Grenzen", () => {
  it("nur ausdrücklich genannte Ausfälle: Zusatzschlüssel (Grund, Art, Rolle, Raum, Betrieb) und Formfehler werden abgelehnt", async () => {
    const schlecht = [
      undefined, null, [], {}, { ausfaelle: [] }, { ausfaelle: "x1" }, { ausfaelle: [ZIEL], grund: "krank" }, { ausfaelle: [ZIEL], rolle: "leitung" },
      { ausfaelle: [ZIEL], bestand: "raum-b" }, { ausfaelle: [ZIEL], betrieb: 1 }, { ausfaelle: [{ ...ZIEL, art: "krank" }] },
      { ausfaelle: [{ ...ZIEL, grund: "Grippe" }] }, { ausfaelle: [{ ...ZIEL, notiz: "x" }] }, { ausfaelle: [{ von: TAG }] },
      { ausfaelle: [{ personId: 7, von: TAG }] }, { ausfaelle: [{ personId: "", von: TAG }] }, { ausfaelle: [{ personId: "x".repeat(65), von: TAG }] },
      { ausfaelle: [{ personId: "x1" }] }, { ausfaelle: [{ personId: "x1", von: "04.11.2026" }] }, { ausfaelle: [{ personId: "x1", von: "2026-02-30" }] },
      { ausfaelle: [{ personId: "x1", von: TAG, bis: "2026-11-03" }] }, { ausfaelle: [{ personId: "x1", von: TAG, bis: "morgen" }] },
      { ausfaelle: [null] }, { ausfaelle: [[]] },
    ];
    for (const anfrage of schlecht) {
      const l = lauf({ anfrage });
      expect(await fehlerCode(l.ruf()), JSON.stringify(anfrage)).toBe("KI_EINGABE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect(await fehlerCode(lauf({ heute: "morgen" }).ruf())).toBe("KI_EINGABE");
  });
  it("Obergrenzen: 5 Ausfälle, 7 Tage je Ausfall, 14 Tage zusammen, 400 Personen", async () => {
    expect(AUSFALL_GRENZEN).toEqual({ ausfaelle: 5, tageJeAusfall: 7, tageGesamt: 14, personen: 400 });
    const mehr = (n) => Array.from({ length: n }, () => ZIEL);
    expect((await lauf({ anfrage: { ausfaelle: mehr(5) } }).ruf()).ergebnisse).toHaveLength(5);
    expect(await fehlerCode(lauf({ anfrage: { ausfaelle: mehr(6) } }).ruf())).toBe("KI_EINGABE");
    expect((await lauf({ anfrage: { ausfaelle: [{ personId: "x1", von: "2026-11-02", bis: "2026-11-08" }] } }).ruf()).ergebnisse).toHaveLength(7);
    expect(await fehlerCode(lauf({ anfrage: { ausfaelle: [{ personId: "x1", von: "2026-11-02", bis: "2026-11-09" }] } }).ruf())).toBe("KI_EINGABE");
    const sieben = { personId: "x1", von: "2026-11-02", bis: "2026-11-08" };
    expect((await lauf({ anfrage: { ausfaelle: [sieben, sieben] } }).ruf()).ergebnisse).toHaveLength(14);
    expect(await fehlerCode(lauf({ anfrage: { ausfaelle: [sieben, sieben, ZIEL] } }).ruf())).toBe("KI_EINGABE");
    const gross = (n) => { const b = betrieb(); b.personen = [...b.personen, ...Array.from({ length: n - b.personen.length }, (_, i) => P(`z${i}`, "Z", `P${i}`))]; return bestand(b); };
    expect((await lauf({ ladeBestand: async () => gross(AUSFALL_GRENZEN.personen) }).ruf()).ergebnisse[0].status).toBe("ok");
    expect(await fehlerCode(lauf({ ladeBestand: async () => gross(AUSFALL_GRENZEN.personen + 1) }).ruf())).toBe("KI_EINGABE");
  });
  it("höchstens 10 Kandidaten je Liste", async () => {
    const b = betrieb();
    b.personen = [...b.personen, ...Array.from({ length: 15 }, (_, i) => P(`z${String(i).padStart(2, "0")}`, "Z", `P${i}`))];
    const r = await lauf({ ladeBestand: async () => bestand(b) }).ruf();
    expect(r.ergebnisse[0].direkt).toHaveLength(10);
    expect(r.ergebnisse[0].direkt.map((k) => k.personId)).toEqual(["br1", "k1", "l1", "pl1", "z00", "z01", "z02", "z03", "z04", "z05"]);
  });
});

describe("Ausgabe", () => {
  it("genau die erwartete Ausgabe: Kandidaten, Near-Miss mit Spielraum und Ruhezeit (Minuten); Ausgefallene, Kranke, offener Fall nie Kandidat; Betriebsrat wie in der Engine", async () => {
    const r = await lauf().ruf();
    expect(r).toEqual(ERWARTET);
    const ids = [...r.ergebnisse[0].direkt, ...r.ergebnisse[0].nahe].map((k) => k.personId);
    for (const nie of ["x1", "k3", "k4"]) expect(ids).not.toContain(nie);
  });
  it("keine Gesundheits- oder Abwesenheitsangabe, kein Fall, keine Markierung in der Ausgabe", async () => {
    expect(leckt(await lauf().ruf())).toEqual([]);
    /* Auch dann nicht, wenn die genannte Person selbst krank gemeldet ist (Abwesenheit mit Grund, offener Fall). */
    const b = betrieb();
    b.abwesenheiten = [...b.abwesenheiten, { id: "ab9", personId: "x1", von: TAG, bis: TAG, art: "krank", grund: "Grippe" }];
    b.krankmeldungen = [...b.krankmeldungen, { id: "km9", personId: "x1", von: TAG, bis: TAG, status: "vorlaeufig", verlauf: [], notiz: "Grippe" }];
    const r = await lauf({ ladeBestand: async () => bestand(b) }).ruf();
    expect(r).toEqual(ERWARTET);
    expect(leckt(r)).toEqual([]);
  });
  it("ohne Ausschlussfunktion (offene Fälle): fail closed, nichts geladen, nichts gerechnet", async () => {
    for (const ausgeschlossenAm of [undefined, null, "x"]) {
      const l = lauf({ ausgeschlossenAm });
      expect(await fehlerCode(l.ruf())).toBe("KI_INTERN");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect(await fehlerCode(lauf({ ausgeschlossenAm: () => { throw new Error("x"); } }).ruf())).toBe("KI_INTERN");
  });
  it("Gegenprobe (Mutation der Prüfung): der Prüfer schlägt an, sobald etwas durchrutscht", async () => {
    const r = await lauf().ruf();
    for (const dreck of [{ grund: "Grippe" }, { art: "krank" }, { name: "Kira Krank" }, { personId: "k4" }, { hinweis: "Besetzung klärungsbedürftig" },
      { notiz: "Bandscheibe" }, { anmerkung: "x" }, { text: "abwesend (Urlaub)" }])
      expect(leckt({ ...r, ergebnisse: [{ ...r.ergebnisse[0], ...dreck }] }), JSON.stringify(dreck)).not.toEqual([]);
  });
  it("kein Dienst am genannten Tag und unbekannte Person: neutral, ohne Kandidaten, ohne Begründung", async () => {
    const r = await lauf({ anfrage: { ausfaelle: [{ personId: "x1", von: "2026-11-05" }, { personId: "k3", von: TAG }, { personId: "nie-gehoert", von: TAG }] } }).ruf();
    expect(r.ergebnisse).toEqual([
      { personId: "x1", datum: "2026-11-05", hinweis: F3_HINWEIS, name: "Xaver Ausfall", status: "kein_dienst", dienst: null, direkt: [], nahe: [] },
      { personId: "k3", datum: TAG, hinweis: F3_HINWEIS, name: "Kira Krank", status: "kein_dienst", dienst: null, direkt: [], nahe: [] },
      { personId: "nie-gehoert", datum: TAG, hinweis: F3_HINWEIS, name: null, status: "unbekannt", dienst: null, direkt: [], nahe: [] },
    ]);
  });
  it("Zeitraum: je Tag ein Eintrag in Tagesfolge", async () => {
    const b = betrieb(); b.abweichungen = { ...b.abweichungen, "x1|2026-11-05": "S" };
    const r = await lauf({ ladeBestand: async () => bestand(b), anfrage: { ausfaelle: [{ personId: "x1", von: TAG, bis: "2026-11-05" }] } }).ruf();
    expect(r.ergebnisse.map((e) => [e.datum, e.status, e.dienst && e.dienst.id])).toEqual([[TAG, "ok", "F"], ["2026-11-05", "ok", "S"]]);
  });
  it("deterministisch: zweimal gleich, unabhängig von der Reihenfolge der Personen", async () => {
    const r1 = await lauf().ruf();
    expect(await lauf().ruf()).toEqual(r1);
    const b = betrieb(); b.personen.reverse();
    expect(await lauf({ ladeBestand: async () => bestand(b) }).ruf()).toEqual(r1);
  });
});

describe("kein Anbieter, kein Schreiben, nur der eigene Betrieb", () => {
  it("kein Netzzugriff und kein Gateway-/Anbietercode im Kern", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Netz"); });
    expect((await lauf().ruf()).zusammenfassung.verfuegbar).toBe(false);
    expect(f).not.toHaveBeenCalled();
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/ausfallvorschlag.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const importe = [...q.matchAll(/^import .* from "(.*)";/gm)].map((x) => x[1]);
    expect(importe.filter((x) => /gateway\//.test(x))).toEqual(["../gateway/schalter.mjs", "../gateway/codes.mjs"]);
    for (const verboten of [/\bfetch\s*\(/, /node:https?/, /node:net/, /process\.env/, /anbieter/i, /gateway\.mjs/, /router\.mjs/, /writeFile|appendFile/]) expect(q).not.toMatch(verboten);
  });
  it("nichts geschrieben: der Bestand ist danach gleich (tief eingefroren, strukturgleich)", async () => {
    const b = bestand(betrieb());
    const vorher = structuredClone(b);
    deepFreeze(b);
    const r = await lauf({ ladeBestand: async () => b }).ruf();
    expect(r.ergebnisse[0].status).toBe("ok");
    expect(b).toEqual(vorher);
  });
  it("Raum und Betrieb nur aus der Sitzung: zweiter Betrieb bleibt unberührt; falscher Betrieb: KI_NICHT_GEFUNDEN", async () => {
    const zwei = () => bestand(betrieb("m1"), { ...betrieb("m2"), personen: [P("l1", "Lena", "Zwei", { rolle: "leitung" }), P("y9", "Yvonne", "Fremd")], abweichungen: {}, abwesenheiten: [], krankmeldungen: [] });
    const nach = (betriebIdx) => lauf({ sitzung: { ...S.leitung, betrieb: betriebIdx }, ladeBestand: async () => zwei() });
    expect((await nach(0).ruf()).ergebnisse[0].status).toBe("ok");
    expect(JSON.stringify(await nach(0).ruf())).not.toMatch(/Yvonne|Fremd|Zwei/);
    /* Betrieb 1 (anderer Betrieb): x1 gibt es dort nicht. */
    const r1 = await nach(1).ruf();
    expect(r1.ergebnisse).toEqual([{ personId: "x1", datum: TAG, hinweis: F3_HINWEIS, name: null, status: "unbekannt", dienst: null, direkt: [], nahe: [] }]);
    expect(await fehlerCode(nach(5).ruf())).toBe("KI_NICHT_GEFUNDEN");
    expect(await fehlerCode(nach(-1).ruf())).toBe("KI_NICHT_GEFUNDEN");
    /* Ein Betrieb in der Anfrage ändert nichts: abgelehnt (siehe Anfrage). */
    expect(await fehlerCode(lauf({ anfrage: { ausfaelle: [ZIEL], betrieb: 1 } }).ruf())).toBe("KI_EINGABE");
  });
});

describe("eine Ruhezeit-Rechnung: ruhezeit.ist", () => {
  it("ruheIst ist die Zahl des Near-Miss im Vorschlag und des Ruhezeitfakts im Rechenkern", () => {
    const m = betrieb();
    const k2 = m.personen.find((p) => p.id === "k2");
    const da = m.dienstarten.find((d) => d.id === "F");
    expect(mitTagesdatum(HEUTE, () => ruheIst(m, k2, TAG, da))).toBe(480);
    expect(mitTagesdatum(HEUTE, () => ruheIst(m, k2, "2026-11-20", da))).toBeNull();
    const r = mitTagesdatum(HEUTE, () => rechnen(m, { zeitraum: { von: "2026-11-02", bis: "2026-11-08" }, heute: HEUTE, ausfaelle: [{ datum: TAG, dienst: "F" }] }));
    const ist = r.fakten.filter((f) => f.feld === "ruhezeit.ist" && f.person === "k2");
    expect(ist.map((f) => f.wert)).toEqual([480]);
  });
  /* Golden: das BISHERIGE Verhalten ist festgehalten (keine Änderung am Produkt, WP-I20 Review): Near-Miss, Spielraum und
     RB-5 ohne Zeitumstellung (ist + Spielraum = Grenze), der Ruhezeitbefund der Planprüfung mit Zeitumstellung. */
  const FAELLE = [["gewöhnlicher Tag", "2026-11-04", "2026-11-03", 480, 480], ["Ende der Sommerzeit", "2026-10-25", "2026-10-24", 480, 540],
    ["Beginn der Sommerzeit", "2026-03-29", "2026-03-28", 480, 420]];
  for (const [titel, tag, vortag, ohneZu, mitZu] of FAELLE) {
    it(`${titel} (${tag}): Near-Miss, Spielraum, ruheIst und Befundfakt wie bisher`, () => {
      const m = betrieb();
      m.abweichungen = { [`x1|${tag}`]: "F", [`k2|${vortag}`]: "S" };
      const k2 = m.personen.find((q) => q.id === "k2");
      const da = m.dienstarten.find((q) => q.id === "F");
      const heute = "2026-03-20";
      const kand = mitTagesdatum(heute, () => ersatzKandidaten({ ...m, abwesenheiten: [{ id: "g", personId: "x1", art: "abwesend", von: tag, bis: tag }] }, tag, "F"));
      expect(kand.nahe).toEqual([{ personId: "k2", hinderung: "ruhezeitGesetz", spielraumMin: 180, ruheVorMin: ohneZu, punkte: expect.any(Number) }]);
      expect(kand.nahe[0].ruheVorMin + kand.nahe[0].spielraumMin).toBe(660);
      expect(mitTagesdatum(heute, () => ruheIst(m, k2, tag, da))).toBe(ohneZu);
      expect(mitTagesdatum(heute, () => ruheIst(m, k2, tag, da, { zeitumstellung: true }))).toBe(mitZu);
      expect(mitTagesdatum(heute, () => ruheZuNachbarn(m, k2, tag, da).vor)).toBe(ohneZu);
      /* Befundfakt der Planprüfung (Spät, dann Früh bei derselben Person): mit Zeitumstellung, wie bisher. */
      const m2 = { ...m, abweichungen: { ...m.abweichungen, [`k2|${tag}`]: "F" } };
      const r = mitTagesdatum(heute, () => rechnen(m2, { zeitraum: { von: vortag, bis: tag }, heute, ausfaelle: [] }));
      expect(r.fakten.filter((f) => f.feld === "ruhezeit.ist" && f.person === "k2" && f.datum === tag).map((f) => f.wert)).toEqual([mitZu]);
    });
  }
});
