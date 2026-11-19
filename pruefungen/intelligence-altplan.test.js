/* ==========================================================================
   INTELLIGENCE — F7A ALTPLAN-ÜBERNAHME, VORSCHAU (WP-I19 Teil 1)

   Über den echten serverseitigen Kern (altplanVorschau): Schalter aus (Vorgabe), Rollenmatrix, Freigabe, Zeilenform und
   Obergrenzen, genaue Zuordnung (Kürzel, Personen), Mehrdeutigkeit, unbekannte Kürzel/Personen, Konflikte (Doppelbelegung,
   Ruhezeit, Qualifikation), Unterschied zum heutigen Plan, Determinismus, nichts geschrieben, keine Protokollierung,
   keine Gesundheits-/Abwesenheitsart in der Ausgabe (mit Gegenprobe), kein Anbieter, anderer Betrieb.
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { altplanVorschau, ALTPLAN_GRENZEN, F7A_TEXT, F7A_HINWEIS, ABWESENHEIT_HINWEIS } from "../server/lib/intelligence/funktionen/altplan.mjs";
import { bestand, S, sitzung } from "./intelligence-gateway-fixture.mjs";
import { deepFreeze } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const HEUTE = "2026-11-02";
const T1 = "2026-11-04", T2 = "2026-11-05";

const P = (id, vn, nn, extra = {}) => ({ id, vorname: vn, nachname: nn, rolle: "mitarbeiter", bereich: "e1", wochenstunden: 38, imSchichtdienst: false,
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
/* a1 hat heute Früh am 4.11.; a2 nichts; a3 und a4 teilen den Namen „Sam Gleich“; a5 ist krank (Abwesenheit mit Grund). */
const betrieb = (id = "m1") => ({
  id, name: "Testheim", einheiten: [{ id: "e1", name: "Station" }], bundesland: "HB",
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  qualifikationen: [{ id: "pfk", name: "Pflegefachkraft" }],
  dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
    { id: "S", kurz: "S", name: "Spät", start: "14:00", ende: "22:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
    { id: "X1", kurz: "Z", name: "Zwischen", start: "09:00", ende: "17:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
    { id: "X2", kurz: "Z", name: "Zweiter", start: "10:00", ende: "18:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
  personen: [P("l1", "Lena", "Brandt", { rolle: "leitung" }), P("pl1", "Piotr", "Kowalski", { rolle: "planer" }),
    P("a1", "Anna", "Alt", { personalnummer: "100001" }), P("a2", "Berta", "Bunt", { personalnummer: "100002", qualifikationen: [] }),
    P("a3", "Sam", "Gleich", { personalnummer: "100003" }), P("a4", "Sam", "Gleich", { personalnummer: "100004" }),
    P("a5", "Kira", "Krank", { personalnummer: "100005" })],
  abweichungen: { [`a1|${T1}`]: "F" },
  abwesenheiten: [{ id: "ab1", personId: "a5", von: T1, bis: T2, art: "krank", grund: "Grippe", anmerkung: "Diagnose J11" }],
  krankmeldungen: [{ id: "km1", personId: "a5", von: T1, bis: T1, status: "eingegangen", verlauf: [], notiz: "Magen-Darm" }],
  notizen: { [`a1|${T1}`]: "Bandscheibe" },
});
const Z = (o) => ({ datum: T1, kuerzel: "F", ...o });
function lauf(o = {}) {
  const ladeBestand = vi.fn(async () => bestand(betrieb()));
  const args = { sitzung: S.leitung, anfrage: { zeilen: [Z({ personalnummer: "100002" })] }, heute: HEUTE, ladeBestand, schalter: AN, funktionenFreigegeben: ["F7A"], ...o };
  return { ladeBestand, ruf: () => altplanVorschau(args) };
}
const mitZeilen = (zeilen, o = {}) => lauf({ anfrage: { zeilen }, ...o });
const fehlerCode = async (p) => { try { await p; } catch (e) { return e.code; } return null; };
const fold = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
const VERBOTEN = ["grippe", "diagnose", "j11", "magen", "bandscheibe", "krank", "attest", "kira", "km1", "urlaub", "notiz", "anmerkung", "grund", "ab1", "\"art\":\"abw"];
const leckt = (ausgabe) => { const s = fold(JSON.stringify(ausgabe)); return VERBOTEN.filter((v) => s.includes(v)); };
const PERSONEN_ROH = ["100001", "100002", "berta", "bunt", "sam gleich", "kira", "krank"];

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
  it("Rollenmatrix: nur Leitung und Planung; Schichtverantwortung, Betriebsrat, Betreiber, Kunde, Beschäftigte, Admin: KI_ROLLE ohne Laden", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const r = await lauf({ sitzung: sitzung(rolle, rolle === "leitung" ? "l1" : "pl1") }).ruf();
      expect(r.zahlen.zugeordnet).toBe(1);
    }
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "admin"]) {
      const l = lauf({ sitzung: { ...S.leitung, rolle } });
      expect(await fehlerCode(l.ruf())).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    for (const [s, code] of [[null, "KI_NICHT_ANGEMELDET"], [{ ...S.leitung, rolle: "" }, "KI_ROLLE"], [{ ...S.leitung, person: "" }, "KI_NICHT_ANGEMELDET"]]) {
      const l = lauf({ sitzung: s });
      expect(await fehlerCode(l.ruf())).toBe(code);
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("ohne Freigabe der Funktion F7A: KI_FUNKTION", async () => {
    expect(await fehlerCode(lauf({ funktionenFreigegeben: ["F3", "F6"] }).ruf())).toBe("KI_FUNKTION");
    expect(await fehlerCode(lauf({ funktionenFreigegeben: undefined }).ruf())).toBe("KI_FUNKTION");
  });
});

describe("Zeilenform und Obergrenzen", () => {
  it("Formfehler und Zusatzfelder werden abgelehnt, ohne zu laden", async () => {
    const schlecht = [undefined, null, [], {}, { zeilen: [] }, { zeilen: "x" }, { zeilen: [Z()], grund: "krank" }, { zeilen: [null] }, { zeilen: [[]] },
      { zeilen: [Z({ grund: "krank" })] }, { zeilen: [Z({ iban: "DE00" })] }, { zeilen: [{ kuerzel: "F" }] }, { zeilen: [{ datum: T1 }] },
      { zeilen: [Z({ datum: "04.11.2026" })] }, { zeilen: [Z({ datum: "2026-02-30" })] }, { zeilen: [Z({ kuerzel: 7 })] },
      { zeilen: [Z({ personalnummer: 5 })] }, { zeilen: [Z({ name: "x".repeat(65) })] }, { zeilen: [Z({ beginn: "25:00" })] }, { zeilen: [Z({ ende: "6" })] }];
    for (const anfrage of schlecht) {
      const l = lauf({ anfrage });
      expect(await fehlerCode(l.ruf()), JSON.stringify(anfrage)).toBe("KI_EINGABE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect(await fehlerCode(lauf({ heute: "morgen" }).ruf())).toBe("KI_EINGABE");
  });
  it("Obergrenzen: 1500 Zeilen, 93 Tage, 400 Personen", async () => {
    expect(ALTPLAN_GRENZEN).toMatchObject({ zeilen: 1500, personen: 400, tage: 93 });
    const viele = (n) => Array.from({ length: n }, (_, i) => Z({ personalnummer: "100002", datum: `2026-11-${String((i % 28) + 1).padStart(2, "0")}` }));
    expect((await mitZeilen(viele(1500)).ruf()).zahlen.gesamt).toBe(1500);
    expect(await fehlerCode(mitZeilen(viele(1501)).ruf())).toBe("KI_EINGABE");
    expect((await mitZeilen([Z({ datum: "2026-11-01" }), Z({ datum: "2027-01-31" })]).ruf()).zeitraum).toEqual({ von: "2026-11-01", bis: "2027-01-31" });
    expect(await fehlerCode(mitZeilen([Z({ datum: "2026-11-01" }), Z({ datum: "2027-02-02" })]).ruf())).toBe("KI_EINGABE");
    const gross = (n) => { const b = betrieb(); b.personen = [...b.personen, ...Array.from({ length: n - b.personen.length }, (_, i) => P(`z${i}`, "Z", `P${i}`))]; return bestand(b); };
    expect((await mitZeilen([Z({ personalnummer: "100002" })], { ladeBestand: async () => gross(ALTPLAN_GRENZEN.personen) }).ruf()).zahlen.zugeordnet).toBe(1);
    expect(await fehlerCode(mitZeilen([Z()], { ladeBestand: async () => gross(ALTPLAN_GRENZEN.personen + 1) }).ruf())).toBe("KI_EINGABE");
  });
});

describe("Zuordnung: Kürzel und Personen", () => {
  it("genau und normalisiert: Kürzel oder Name der Dienstart, Groß-/Kleinschreibung, Umlaute; Personalnummer vor Name", async () => {
    const r = await mitZeilen([
      Z({ personalnummer: " 100002 ", kuerzel: "f" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "SPÄT" }),
      Z({ vorname: "Anna", nachname: "Alt", datum: T2, kuerzel: "Früh" }), Z({ name: "Alt, Anna", datum: "2026-11-06", kuerzel: "S" }),
      Z({ name: "bunt berta", datum: "2026-11-06", kuerzel: "-" }),
    ]).ruf();
    expect(r.zahlen).toEqual({ gesamt: 5, zugeordnet: 5, abwesenheit: 0, unbekanntKuerzel: 0, mehrdeutigKuerzel: 0, unbekanntePerson: 0, mehrdeutigePerson: 0, doppelt: 0 });
    expect(r.unterschied.zeilen.map((x) => [x.zeile, x.personId, x.vorschlag])).toEqual([[1, "a2", "F"], [2, "a2", "S"], [3, "a1", "F"], [4, "a1", "S"], [5, "a2", null]]);
    /* Personalnummer geht vor: stimmt sie nicht, hilft der Name nicht. */
    const u = await mitZeilen([Z({ personalnummer: "999", vorname: "Anna", nachname: "Alt" })]).ruf();
    expect(u.zahlen.unbekanntePerson).toBe(1);
  });
  it("mehrdeutige Person (gleicher Name) und unbekannte Person: gemeldet mit Zeilennummer, nie angelegt, keine Rohdaten in der Ausgabe", async () => {
    const r = await mitZeilen([Z({ vorname: "Sam", nachname: "Gleich" }), Z({ personalnummer: "424242" }), Z({ name: "Nie Gehört" }), Z({ personalnummer: "100003" })]).ruf();
    expect(r.zahlen).toMatchObject({ zugeordnet: 1, mehrdeutigePerson: 1, unbekanntePerson: 2 });
    expect(r.nichtZugeordnet.zeilenPersonMehrdeutig).toEqual([1]);
    expect(r.nichtZugeordnet.zeilenOhnePerson).toEqual([2, 3]);
    const s = fold(JSON.stringify(r));
    for (const roh of ["424242", "nie gehoert", "sam gleich"]) expect(s).not.toContain(roh);
  });
  it("unbekannte und mehrdeutige Kürzel werden gemeldet und nie angelegt (Bestand unverändert)", async () => {
    const b = bestand(betrieb()); const vorher = structuredClone(b); deepFreeze(b);
    const r = await mitZeilen([Z({ personalnummer: "100002", kuerzel: "Zwischendienst X" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "N" }),
      Z({ personalnummer: "100002", datum: "2026-11-06", kuerzel: "N" }), Z({ personalnummer: "100002", datum: "2026-11-07", kuerzel: "Z" })], { ladeBestand: async () => b }).ruf();
    expect(r.zahlen).toMatchObject({ unbekanntKuerzel: 3, mehrdeutigKuerzel: 1, zugeordnet: 0 });
    expect(r.nichtZugeordnet.kuerzelUnbekannt).toEqual([{ index: 1, anzahl: 1, zeilen: [1] }, { index: 2, anzahl: 2, zeilen: [2, 3] }]);
    expect(JSON.stringify(r)).not.toMatch(/zwischendienst/i);
    expect(r.nichtZugeordnet.kuerzelMehrdeutig).toEqual([4]);
    expect(b).toEqual(vorher);
  });
  it("Zeiten im Altplan, die von der Dienstart abweichen: nur ein Hinweis, keine Anpassung", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002", beginn: "06:30", ende: "14:00" }), Z({ personalnummer: "100002", datum: T2, beginn: "06:00", ende: "14:00" })]).ruf();
    expect(r.nichtZugeordnet.zeitAbweichung).toEqual([1]);
    expect(r.zahlen.zugeordnet).toBe(2);
  });
});

describe("Unterschied zum heutigen Plan", () => {
  it("gleich, neu, geändert, entfällt; Zusammenfassung stimmt mit den Zeilen", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100001" }), Z({ personalnummer: "100001", datum: T2, kuerzel: "S" }), Z({ personalnummer: "100001", datum: "2026-11-06", kuerzel: "-" }),
      Z({ personalnummer: "100002" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "-" })]).ruf();
    expect(r.unterschied.zeilen.map((x) => [x.zeile, x.status, x.heute, x.vorschlag])).toEqual([
      [1, "gleich", "F", "F"], [2, "neu", null, "S"], [3, "gleich", null, null], [4, "neu", null, "F"], [5, "gleich", null, null]]);
    expect(r.unterschied.summe).toEqual({ gleich: 3, neu: 2, geaendert: 0, entfaellt: 0, nicht_vergleichbar: 0 });
    const g = await mitZeilen([Z({ personalnummer: "100001", kuerzel: "S" }), Z({ personalnummer: "100001", datum: T2, kuerzel: "-" })]).ruf();
    expect(g.unterschied.summe).toMatchObject({ geaendert: 1 });
    const e = await mitZeilen([Z({ personalnummer: "100001", kuerzel: "-" })]).ruf();
    expect(e.unterschied.zeilen[0]).toMatchObject({ status: "entfaellt", heute: "F", vorschlag: null });
  });
  it("Tag, an dem die Person heute nicht planbar ist: nur „nicht_vergleichbar“, ohne Art und Grund", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100005", kuerzel: "S" })]).ruf();
    expect(r.unterschied.zeilen).toEqual([{ zeile: 1, personId: "a5", datum: T1, status: "nicht_vergleichbar", heute: null, vorschlag: "S" }]);
    expect(leckt(r)).toEqual([]);
  });
});

describe("Konflikte", () => {
  it("Doppelbelegung im Altplan: beide Zeilen werden nicht vorgeschlagen und gemeldet", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002" }), Z({ personalnummer: "100002", kuerzel: "S" }), Z({ personalnummer: "100002", datum: T2 })]).ruf();
    expect(r.zahlen).toMatchObject({ doppelt: 2, zugeordnet: 1 });
    expect(r.nichtZugeordnet.zeilenDoppelt).toEqual([1, 2]);
    expect(r.unterschied.zeilen.map((x) => x.zeile)).toEqual([3]);
  });
  it("Ruhezeit: Spät, dann Früh am Folgetag erzeugt einen neuen Befund über die Engine; ein schon heute bestehender zählt nicht", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002", datum: T1, kuerzel: "S" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "F" })]).ruf();
    expect(r.konflikte).toEqual([{ art: "ruhezeit", datum: T2, personId: "a2", ref: "a2", schwere: "warn" }]);
    /* Bestand hat die Verletzung schon: nicht neu. */
    const b = betrieb(); b.abweichungen = { ...b.abweichungen, [`a2|${T1}`]: "S", [`a2|${T2}`]: "F" };
    const alt = await mitZeilen([Z({ personalnummer: "100002", datum: T1, kuerzel: "S" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "F" })], { ladeBestand: async () => bestand(b) }).ruf();
    expect(alt.konflikte).toEqual([]);
    /* Ohne Verletzung kein Konflikt. */
    expect((await mitZeilen([Z({ personalnummer: "100002", datum: T1, kuerzel: "F" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "S" })]).ruf()).konflikte).toEqual([]);
  });
  it("Qualifikation: Dienstart verlangt Pflegefachkraft; der Altplan nimmt die einzige Pflegefachkraft aus dem Dienst: neuer Befund; bleibt sie, keiner", async () => {
    const b = betrieb();
    b.dienstarten = b.dienstarten.map((d) => (d.id === "F" ? { ...d, mindestQual: { pfk: 1 } } : d));
    b.personen = b.personen.map((p) => (p.id === "a2" ? { ...p, qualifikationen: ["pfk"] } : p));
    b.abweichungen = { ...b.abweichungen, [`a2|${T2}`]: "F" };
    const ohne = await mitZeilen([Z({ personalnummer: "100002", datum: T2, kuerzel: "S" })], { ladeBestand: async () => bestand(b) }).ruf();
    expect(ohne.konflikte).toEqual([{ art: "qualifikation", datum: T2, personId: null, ref: "F|pfk", schwere: "danger" }]);
    const mit = await mitZeilen([Z({ personalnummer: "100002", datum: T2 })], { ladeBestand: async () => bestand(b) }).ruf();
    expect(mit.konflikte).toEqual([]);
  });
  it("Folgegrenze: sieben Dienste in Folge erzeugen den Befund „folge“", async () => {
    const zeilen = Array.from({ length: 7 }, (_, i) => Z({ personalnummer: "100002", datum: `2026-11-${String(9 + i).padStart(2, "0")}` }));
    const r = await mitZeilen(zeilen).ruf();
    expect(r.konflikte.map((k) => [k.art, k.personId])).toEqual([["folge", "a2"]]);
  });
});

describe("Gesundheit und Abwesenheit", () => {
  const ABW = ["krank", "Krank", "K", "AU", "Attest vorgelegt", "krank (Attest)", "Kind krank", "Arbeitsunfähig", "Urlaub", "U", "Magen-Darm krank", "Diagnose J11", "Reha", "Mutterschutz"];
  it("Abwesenheitskürzel (auch mit Gesundheitsbegriff): nur „Abwesenheit (Art nicht übernommen)“, kein Kürzel, kein Grund, keine Zuordnung", async () => {
    const zeilen = ABW.map((k, i) => Z({ personalnummer: "100002", datum: `2026-11-${String(i + 1).padStart(2, "0")}`, kuerzel: k }));
    const r = await mitZeilen(zeilen).ruf();
    expect(r.abwesenheit).toEqual({ hinweis: ABWESENHEIT_HINWEIS, anzahl: ABW.length });
    expect(r.zahlen).toMatchObject({ abwesenheit: ABW.length, zugeordnet: 0, unbekanntKuerzel: 0 });
    expect(r.unterschied.zeilen).toEqual([]);
    expect(r.nichtZugeordnet.kuerzelUnbekannt).toEqual([]);
    expect(leckt(r)).toEqual([]);
    expect(fold(JSON.stringify(r))).not.toMatch(/arbeitsunf|reha|mutterschutz|kind|magen/);
  });
  it("Zeilen mit „krank“/„Attest“ in Namens- oder Zusatzfeldern: kein Echo; unbekannte Kürzel nur kurz und unauffällig", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002", kuerzel: "Attest vom Arzt" }), Z({ name: "Kranke Attest", kuerzel: "F" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "Qx" })]).ruf();
    expect(leckt(r)).toEqual([]);
    expect(r.nichtZugeordnet.kuerzelUnbekannt).toEqual([{ index: 1, anzahl: 1, zeilen: [3] }]);
    expect(JSON.stringify(r)).not.toMatch(/qx/i);
  });
  it("Bestandsabwesenheiten (krank mit Grund und Diagnose) und Krankmeldungsfall tauchen nirgends auf", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100001" }), Z({ personalnummer: "100005", datum: T2 }), Z({ personalnummer: "100002", kuerzel: "S" })]).ruf();
    expect(leckt(r)).toEqual([]);
  });
  it("Gegenprobe: der Prüfer schlägt an, sobald etwas durchrutscht", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100001" })]).ruf();
    for (const dreck of [{ grund: "Grippe" }, { art: "krank" }, { text: "Attest" }, { x: "Kira Krank" }, { x: "Urlaub" }, { x: "Magen" }])
      expect(leckt({ ...r, ...dreck }), JSON.stringify(dreck)).not.toEqual([]);
  });
});

describe("Kürzeltext wird nie ausgegeben", () => {
  const PROBE = ["grippe", "chemo", "covid", "corona", "fieber", "erkältet", "burnout", "psych", "klinik", "kh", "op", "unfall", "quarantäne", "krk", "krnk", "aub",
    "au-bsch", "kr/au", "k-kind", "kind-kr", "bv", "mu", "muschu", "ez", "ku", "sv"];
  /* Wörter bis 3 Zeichen nur als ganzes Wort (sonst Zufallstreffer in Schlüsselnamen), längere auch als Teil. */
  const ohneTreffer = (r, w) => { const t = JSON.stringify(r).toLowerCase(); const x = w.toLowerCase(); return x.length <= 3 ? new RegExp("(^|[^a-z0-9])" + x.replace(/[^a-z0-9]/g, "\const ohneTreffer = (r, w) => JSON.stringify(r).toLowerCase().includes(w.toLowerCase());") + "([^a-z0-9]|$)").test(t) : t.includes(x); };
  it("Probeliste: alle Gesundheits-/Abwesenheitskürzel werden zu „Abwesenheit (Art nicht übernommen)“; kein Kürzeltext in der Ausgabe", async () => {
    const zeilen = PROBE.map((k, i) => Z({ personalnummer: "100002", datum: `2026-11-${String(i + 1).padStart(2, "0")}`, kuerzel: k }));
    const r = await mitZeilen(zeilen).ruf();
    expect(r.abwesenheit).toEqual({ hinweis: ABWESENHEIT_HINWEIS, anzahl: PROBE.length });
    expect(r.zahlen.unbekanntKuerzel).toBe(0);
    for (const w of PROBE) expect(ohneTreffer(r, w), w).toBe(false);
  });
  it("auch ein wirklich unbekanntes Kürzel erscheint nie als Text (nur Index, Anzahl, Zeilen)", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002", kuerzel: "Qx7" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "QX7" }), Z({ personalnummer: "100002", datum: "2026-11-06", kuerzel: "zz" })]).ruf();
    expect(r.nichtZugeordnet.kuerzelUnbekannt).toEqual([{ index: 1, anzahl: 2, zeilen: [1, 2] }, { index: 2, anzahl: 1, zeilen: [3] }]);
    for (const w of ["qx7", "zz"]) expect(ohneTreffer(r, w), w).toBe(false);
  });
  it("Gegenprobe (Mutation): würde ein Kürzeltext ausgegeben, schlägt die Prüfung an", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100002", kuerzel: "Qx7" })]).ruf();
    const mutiert = { ...r, nichtZugeordnet: { ...r.nichtZugeordnet, kuerzelUnbekannt: [{ kuerzel: "qx7", anzahl: 1 }] } };
    expect(ohneTreffer(mutiert, "qx7")).toBe(true);
    expect(ohneTreffer({ ...r, abwesenheit: { hinweis: "grippe", anzahl: 1 } }, "grippe")).toBe(true);
  });
});

describe("Tag nicht vergleichbar: kein gedachter Planüberschreib", () => {
  it("an einem Tag, an dem die Person abwesend ist, wird nichts in den gedachten Plan geschrieben (die Abwesenheit gilt vor dem Altplan: kein Befund aus diesem Tag)", async () => {
    /* a5 ist am 4.11. abwesend; ein Altplan-Dienst S dort darf die Folgetagsprüfung nicht beeinflussen: Früh am 5.11. (ebenfalls abwesend) bliebe sonst Ruhezeit-Befund. */
    const b = betrieb(); b.abwesenheiten = [{ id: "ab1", personId: "a5", von: T1, bis: T1, art: "krank", grund: "Grippe" }];
    const r = await mitZeilen([Z({ personalnummer: "100005", kuerzel: "S" }), Z({ personalnummer: "100005", datum: T2, kuerzel: "F" })], { ladeBestand: async () => bestand(b) }).ruf();
    expect(r.unterschied.zeilen.map((x) => x.status)).toEqual(["nicht_vergleichbar", "neu"]);
    expect(r.konflikte).toEqual([]);
  });
});

describe("Ausgabe, Determinismus, nichts geschrieben, nichts geloggt, kein Anbieter", () => {
  it("genaue Form der Ausgabe; Text der modellgestützten Zuordnung: nicht verfügbar", async () => {
    const r = await mitZeilen([Z({ personalnummer: "100001" })]).ruf();
    expect(r).toEqual({
      funktion: "F7A", quelle: "berechnet", hinweis: F7A_HINWEIS, zeitraum: { von: T1, bis: T1 }, zusammenfassung: { verfuegbar: false, text: F7A_TEXT },
      zahlen: { gesamt: 1, zugeordnet: 1, abwesenheit: 0, unbekanntKuerzel: 0, mehrdeutigKuerzel: 0, unbekanntePerson: 0, mehrdeutigePerson: 0, doppelt: 0 },
      abwesenheit: null,
      nichtZugeordnet: { kuerzelUnbekannt: [], kuerzelMehrdeutig: [], zeilenOhnePerson: [], zeilenPersonMehrdeutig: [], zeilenAbwesenheit: [], zeilenDoppelt: [], zeitAbweichung: [] },
      unterschied: { summe: { gleich: 1, neu: 0, geaendert: 0, entfaellt: 0, nicht_vergleichbar: 0 }, zeilen: [{ zeile: 1, personId: "a1", datum: T1, status: "gleich", heute: "F", vorschlag: "F" }] },
      konflikte: [], konflikteStatus: "ok",
    });
    const s = fold(JSON.stringify(r));
    for (const roh of PERSONEN_ROH) expect(s).not.toContain(roh);
  });
  it("deterministisch: zweimal gleich, unabhängig von der Reihenfolge der Personen im Bestand", async () => {
    const zeilen = [Z({ personalnummer: "100002", kuerzel: "S" }), Z({ personalnummer: "100002", datum: T2 }), Z({ name: "Sam Gleich" }), Z({ personalnummer: "100001", datum: T2, kuerzel: "S" })];
    const r1 = await mitZeilen(zeilen).ruf();
    expect(await mitZeilen(zeilen).ruf()).toEqual(r1);
    const b = betrieb(); b.personen.reverse();
    expect(await mitZeilen(zeilen, { ladeBestand: async () => bestand(b) }).ruf()).toEqual(r1);
  });
  it("nichts geschrieben: der Bestand ist danach gleich (tief eingefroren, strukturgleich)", async () => {
    const b = bestand(betrieb()); const vorher = structuredClone(b); deepFreeze(b);
    const r = await mitZeilen([Z({ personalnummer: "100002", kuerzel: "S" }), Z({ personalnummer: "100002", datum: T2 }), Z({ personalnummer: "100002", datum: T2, kuerzel: "krank" })], { ladeBestand: async () => b }).ruf();
    expect(r.zahlen.zugeordnet).toBe(2);
    expect(b).toEqual(vorher);
  });
  it("keine Protokollierung: weder Konsole noch Prozessausgabe noch Netz während der Vorschau", async () => {
    const spione = ["log", "info", "warn", "error", "debug", "trace"].map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Netz"); });
    await mitZeilen([Z({ personalnummer: "100002" }), Z({ name: "Nie Gehört" }), Z({ personalnummer: "100002", datum: T2, kuerzel: "krank" })]).ruf();
    await fehlerCode(mitZeilen([Z({ datum: "kaputt" })]).ruf());
    for (const s of spione) expect(s).not.toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });
  it("Fehlertexte tragen keine Zeilendaten", async () => {
    try { await mitZeilen([Z({ personalnummer: "geheim-4711", datum: "kaputt" })]).ruf(); } catch (e) { expect(String(e.message) + JSON.stringify(e)).not.toMatch(/geheim|4711|kaputt/); return; }
    throw new Error("sollte fehlschlagen");
  });
  it("kein Gateway-Aufruf, kein Anbietercode, kein Schreiben, kein Datei-/Parserweg im Kern", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/altplan.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const importe = [...q.matchAll(/^import .* from "(.*)";/gm)].map((x) => x[1]);
    expect(importe.filter((x) => /gateway\//.test(x))).toEqual(["../gateway/schalter.mjs", "../gateway/codes.mjs"]);
    expect(importe.filter((x) => /import\//.test(x))).toEqual([]);
    for (const verboten of [/\bfetch\s*\(/, /node:https?/, /node:net/, /node:fs/, /process\.env/, /anbieter/i, /gateway\.mjs/, /router\.mjs/, /writeFile|appendFile|speichern/, /console\./, /protokoll/i]) expect(q).not.toMatch(verboten);
  });
  it("anderer Betrieb: nur der eigene Betrieb aus der Sitzung; falscher Betrieb: KI_NICHT_GEFUNDEN", async () => {
    const zwei = () => bestand(betrieb("m1"), { ...betrieb("m2"), personen: [P("l1", "Lena", "Zwei", { rolle: "leitung" }), P("y9", "Yvonne", "Fremd", { personalnummer: "300001" })], abweichungen: {}, abwesenheiten: [], krankmeldungen: [] });
    const nach = (i, pnr) => mitZeilen([Z({ personalnummer: pnr })], { sitzung: { ...S.leitung, betrieb: i }, ladeBestand: async () => zwei() });
    expect((await nach(0, "100002").ruf()).zahlen.zugeordnet).toBe(1);
    expect((await nach(0, "300001").ruf()).zahlen.unbekanntePerson).toBe(1);
    expect((await nach(1, "300001").ruf()).zahlen.zugeordnet).toBe(1);
    expect((await nach(1, "100002").ruf()).zahlen.unbekanntePerson).toBe(1);
    expect(await fehlerCode(nach(5, "100002").ruf())).toBe("KI_NICHT_GEFUNDEN");
    expect(await fehlerCode(nach(-1, "100002").ruf())).toBe("KI_NICHT_GEFUNDEN");
    expect(await fehlerCode(lauf({ anfrage: { zeilen: [Z()], betrieb: 1 } }).ruf())).toBe("KI_EINGABE");
  });
});
