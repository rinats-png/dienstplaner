/* ==========================================================================
   INTELLIGENCE — NACHTRAG ZUM SICHERHEITSREVIEW WP-I11 (F1–F10)

   Jeder Block hält einen Befund des unabhängigen Reviews fest und ist vor
   dem Fix rot gelaufen (Nachweis: docs/acc45/wp-i11-nachweis.md, Abschnitt
   „Nachtrag"). Dazu je ein zweiter, unabhängiger Test für die Mutanten, die
   im ersten Lauf nur von genau einem Test getötet wurden (M5a, M7b, M12,
   M13).

   F1  bezug.schichtId war ein ungeprüfter Freitext-Kanal.
   F2  Homoglyphen und nicht-lateinische Schrift waren für die Sperrliste
       unsichtbar; leere Sperrlisteneinträge schützten nichts.
   F3  Umlaut-Normalisierung asymmetrisch (NFD, „Schafer" statt „Schäfer").
   F4  Rohe {{person:…}}-Platzhalter aus der Modellausgabe gingen durch.
   F5  Abwesenheitskürzel (K, KK, BV) als Dienstart-Kennung im Paket;
       Schutzbefund an die Person gekoppelt.
   F6  Kurznamen (2–3 Zeichen) nur als ganzes Wort.
   F7  Musterlücken (Gesundheit, Datum TT.MM.JJJJ, Dezimalkomma-Koordinaten,
       F7A ohne serverseitige Maskierung, Dritte mit Anrede).
   F8  Rückübersetzung prüfte den Index statt der Betriebskennung; Karte aus
       dem Lauf-Store ohne Integritätsschutz.
   F9  E-Mail-Muster mit quadratischer Laufzeit.
   F10 __proto__ in der Modellausgabe; Schema-Schlüsselwörter nur geprüft,
       wo ein Wert sie erreicht.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { faktenpaketBilden } from "../server/lib/intelligence/faktenpaket.mjs";
import { sperrlisteBilden, leckPruefen, textPruefen, normalisieren } from "../server/lib/intelligence/leckpruefung.mjs";
import { AliasKarte, rueckuebersetzen } from "../server/lib/intelligence/alias.mjs";
import * as schemas from "../server/lib/intelligence/schemas.mjs";
import * as positivliste from "../server/lib/intelligence/positivliste.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";

const { SCHEMATA, FUNKTIONEN_IDS } = schemas;
const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
const MAC = Buffer.from("9a4c1e7b2d0f58a3c6e9b1d4f7a0c3e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3", "hex");
const VERSIONEN = { engine: "0.0.0-attrappe", regelstand: "r-2026-11", tarifstand: "t-2026" };
const ZR = { von: "2026-11-01", bis: "2026-11-30" };
const DIENST_ALIAS = /^D_[BCDFGHJKLMNPQRSTVWXZ]{8}$/;

const betrieb = () => ({
  id: "m1", name: "Seniorenheim Sonnenhof", tarif: "basis", rabattGrund: "Treuerabatt Sonnenhof",
  einheiten: [{ id: "e1", name: "Wohnbereich Lindenhof" }],
  dienstarten: [{ id: "F", start: "06:00", ende: "14:00" }, { id: "K", name: "Krank", start: "00:00", ende: "23:59" },
    { id: "KK", name: "Kind krank", start: "00:00", ende: "23:59" }, { id: "BV", name: "Beschäftigungsverbot", start: "00:00", ende: "23:59" }],
  zyklus: { tage: ["F", "K", "-"] },
  qualifikationen: [{ id: "q1" }],
  personen: [
    { id: "l1", vorname: "Lena", nachname: "Brandt", rolle: "leitung", bereich: "e1", wochenstunden: 40 },
    { id: "pl1", vorname: "Piotr", nachname: "Kowalski", rolle: "planer", bereich: "e1", wochenstunden: 38.5 },
    { id: "a1", vorname: "Tim", nachname: "Weberknecht", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 30, geburtsdatum: "1990-05-12",
      kalenderGeheim: "a3f1c9e07b2d4a6e8f0c1b3d5e7f9a1c", pushSchluessel: { endpoint: "https://push.example/abc" } },
    { id: "a2", vorname: "Ute", nachname: `Mu${String.fromCodePoint(0x308)}ller`, rolle: "mitarbeiter", bereich: "e1", wochenstunden: 20,
      schwerbehindert: { grad: 60 }, geburtsdatum: "1971-03-14" },
    { id: "a3", vorname: "Светлана", nachname: "Иванова", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 20 },
    { id: "a4", vorname: "Jörg", nachname: "Schäfer", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 20 },
  ],
  abweichungen: { "a1|2026-11-03": "K", "a2|2026-11-04": "KK", "a4|2026-11-05": "BV", "a3|2026-11-06": "F" },
  abwesenheiten: [],
});
const bestand = (...m) => ({ version: 1, stand: 1, mandanten: m.length ? m : [betrieb()] });
const sitzung = (rolle, person, o = {}) => ({ rolle, person, bestand: "raum-a", betrieb: 0, ...o });
const LEITUNG = sitzung("leitung", "l1");
const bilden = (o = {}) => faktenpaketBilden({ sitzung: LEITUNG, ladeBestand: () => bestand(), funktion: "F3",
  eingabe: { zeitraum: ZR }, kontext: "auftrag-1", aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN, ...o });
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };
const codeSync = (f) => { try { f(); return "ok"; } catch (e) { return e.code || String(e); } };
const SP = sperrlisteBilden(betrieb(), { raum: "raum-a" });
const kat = (text) => textPruefen(text, SP).befunde.map((b) => b.kategorie);

/* ------------------------------------------------------------------------ */
describe("F1: bezug.schichtId ist kein Freitext-Kanal", () => {
  it("nur eine Dienstart der Sicht; Freitext, Namen, Gesundheit → KI_NICHT_GEFUNDEN", async () => {
    for (const funktion of ["F3", "F4", "F1"]) {
      for (const sid of ["Frau_Siebert_Insulin_8IE", "Bewohner.Lehmann:Demenz+Sturz", "Svetlana_schwanger", "Q", "f"]) {
        expect(await code(bilden({ funktion, bezug: { schichtId: sid } })), `${funktion} ${sid}`).toBe("KI_NICHT_GEFUNDEN");
      }
    }
  });
  it("eine Dienstart der Sicht geht als opaker Dienst-Alias hinein, nie als Kennung", async () => {
    const { paket, aliasKarte } = await bilden({ bezug: { schichtId: "F", datum: "2026-11-03" } });
    expect(paket.bezug.ref).toMatch(DIENST_ALIAS);
    expect(paket.bezug.ref).toBe(aliasKarte.alias("dienst", "F"));
    expect(paket.bezug.datum).toBe("2026-11-03");
  });
  it("Funktionen ohne Felder (F5, F9): jeder Bezug → KI_EINGABE", async () => {
    for (const [funktion, s] of [["F5", LEITUNG], ["F9", LEITUNG], ["F9", sitzung("mitarbeiter", "a1")]]) {
      for (const bezug of [{ schichtId: "F" }, { einheitId: "e1" }, { datum: "2026-11-03" }, {}]) {
        expect(await code(bilden({ sitzung: s, funktion, eingabe: {}, bezug })), `${funktion} ${JSON.stringify(bezug)}`).toBe("KI_EINGABE");
      }
    }
  });
});

describe("F5: Dienst-Kennungen sind paketweit opak, Schutzbefunde extern ohne Person", () => {
  it("Abwesenheitskürzel (K, KK, BV) und alle Dienstarten erscheinen nur als Dienst-Alias", async () => {
    for (const funktion of ["F1", "F3", "F8", "F13"]) {
      const { paket, aliasKarte } = await bilden({ funktion });
      const s = JSON.stringify(paket);
      expect(s, funktion).not.toMatch(/"(K|KK|BV|F)"/);
      for (const f of paket.fakten) {
        if (f.feld === "schicht.dienst" || f.feld === "zyklus.tag") expect(f.wert, `${funktion} ${f.feld}`).toMatch(DIENST_ALIAS);
        if (f.feld.startsWith("dienstart.")) expect(f.ref, `${funktion} ${f.feld}`).toMatch(DIENST_ALIAS);
      }
      if (funktion === "F3") {
        const dienste = paket.fakten.filter((f) => f.feld === "schicht.dienst").map((f) => f.wert).sort();
        expect(dienste).toEqual(["F", "K", "KK", "BV"].map((d) => aliasKarte.alias("dienst", d)).sort());
      }
    }
  });
  it("berechnete Fakten: Dienst-Bezug wird Alias; ein Dienst, den die Sicht nicht kennt, wird verworfen", async () => {
    const ereignisse = [];
    const { paket, aliasKarte } = await bilden({ funktion: "F10", audit: (e) => ereignisse.push(e), faktenquelle: () => [
      { feld: "besetzung.ist", einheit: "e1", wert: 3, datum: "2026-11-03", ref: "F" },
      { feld: "besetzung.soll", einheit: "e1", wert: 4, datum: "2026-11-03", ref: "KK" },
      { feld: "besetzung.soll", einheit: "e1", wert: 4, datum: "2026-11-03", ref: "XY" },
      { feld: "kennzahl.wert", wert: 0.9, ref: "besetzung.quote" },
    ] });
    const b = paket.fakten.filter((f) => f.feld.startsWith("besetzung.")).map((f) => f.ref).sort();
    expect(b).toEqual([aliasKarte.alias("dienst", "F"), aliasKarte.alias("dienst", "KK")].sort());
    expect(paket.fakten.find((f) => f.feld === "kennzahl.wert").ref).toBe("besetzung.quote");
    expect(ereignisse.at(-1)).toMatchObject({ art: "ki.faktenpaket.gebildet", verworfen: 1 });
  });
  it("Schutzbefund bei externem Modell (Vorgabe): ohne Person; Hinderung „schutz“ entfällt — lokal gekoppelt", async () => {
    const quelle = () => [
      { feld: "befund.regel", person: "a1", wert: "keineNacht", datum: "2026-11-03", regel: { regelId: "keineNacht", pruefstatus: "geprueft" } },
      { feld: "kandidat.hinderung", person: "a2", wert: "R_MUSCHG_5" },
      { feld: "befund.regel", person: "a4", wert: "ruhezeitGesetz", datum: "2026-11-03" },
      { feld: "kandidat.hinderung", person: "a4", wert: "ruhezeitBetrieb" },
    ];
    for (const modellOrt of [undefined, "extern"]) {
      const { paket, aliasKarte } = await bilden({ faktenquelle: quelle, modellOrt });
      const schutz = paket.fakten.filter((f) => f.wert === "schutz");
      expect(schutz.length, String(modellOrt)).toBe(1);
      expect(schutz[0].feld).toBe("befund.regel");
      expect(schutz[0].alias, String(modellOrt)).toBeUndefined();
      /* andere Befunde bleiben an der Person */
      expect(paket.fakten.find((f) => f.wert === "ruhezeitGesetz").alias).toBe(aliasKarte.alias("person", "a4"));
      expect(paket.fakten.find((f) => f.wert === "ruhezeitBetrieb").alias).toBe(aliasKarte.alias("person", "a4"));
    }
    const lokal = await bilden({ faktenquelle: quelle, modellOrt: "lokal" });
    const s = lokal.paket.fakten.filter((f) => f.wert === "schutz");
    expect(s.length).toBe(2);
    for (const f of s) expect(f.alias).toMatch(/^P_/);
    expect(await code(bilden({ modellOrt: "anthropic" }))).toBe("KI_EINGABE");
    expect(await code(bilden({ modellOrt: "" }))).toBe("KI_EINGABE");
  });
  it("Rückübersetzung: Dienst-Alias → {{dienst:<kennung>}}", () => {
    const k = new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" });
    const d = k.alias("dienst", "KK");
    expect(d).toMatch(DIENST_ALIAS);
    expect(rueckuebersetzen({ ergebnis: `Dienst ${d} und {{dienst:${d}}}`, karte: k, sitzung: LEITUNG, funktion: "F8",
      bestand: bestand() })).toBe("Dienst {{dienst:KK}} und {{dienst:KK}}");
  });
});

describe("F2: Homoglyphen, fremde Schrift, leere Sperrlisteneinträge", () => {
  it("kyrillische und griechische Doppelgänger werden auf das lateinische Skelett gebracht", () => {
    /* Ausdrücklich als Codepunkt geschrieben — im Quelltext sähe man den Unterschied nicht. */
    const kyrE = String.fromCodePoint(0x435); const kyrA = String.fromCodePoint(0x430); const grB = String.fromCodePoint(0x392);
    const vollM = String.fromCodePoint(0xff2d); const vollL = String.fromCodePoint(0xff4c);
    expect(normalisieren(`W${kyrE}berknecht`)).toBe("weberknecht");
    expect(normalisieren(`Br${kyrA}ndt`)).toBe("brandt");
    expect(normalisieren(`${grB}randt`)).toBe("brandt");
    expect(normalisieren(`${vollM}ü${vollL}${vollL}er`)).toBe("mueller");
    for (const t of [`W${kyrE}berknecht hat frei`, `Br${kyrA}ndt`, `${grB}randt`]) expect(kat(t), t).toContain("KLARNAME");
  });
  it("Text und Kennungen mit Zeichen außerhalb Latin/Latin-1 → SCHRIFT (fail closed)", () => {
    for (const t of ["Светлана Иванова hat morgen frei", "早班", `Dienst ${String.fromCodePoint(0xff26)}`, `${String.fromCodePoint(0x1d40c)}eyer`,
      "ΑΒΓ", `Dienst ${String.fromCodePoint(0x1f600)}`]) {
      const r = textPruefen(t, SP);
      expect(r.ok, t).toBe(false);
      expect(r.befunde.map((b) => b.kategorie), t).toContain("SCHRIFT");
    }
    expect(leckPruefen({ fakten: [{ ref: "Нх" }] }, SP).befunde.map((b) => b.kategorie)).toContain("SCHRIFT");
    /* Gegenprobe: deutsche Typografie geht durch */
    expect(textPruefen("Teamtreffen „Montag“ – 14:00 … 5 € · Spät/Früh, § 5", SP)).toEqual({ ok: true, befunde: [] });
  });
  it("die Sperrliste behält nicht-lateinische Namen (\\p{L}) statt sie zu leeren", () => {
    expect([...SP.namen].some((n) => n.includes(String.fromCodePoint(0x438)))).toBe(true);   // и aus Иванова
    expect(kat("Иванова")).toContain("KLARNAME");
  });
  it("ein Name, der nach der Normalisierung leer ist, macht die Sperrliste lückenhaft → Verdacht", () => {
    const b = betrieb(); b.personen.push({ id: "a9", vorname: String.fromCodePoint(0x263a), nachname: String.fromCodePoint(0x2014) });
    const sp = sperrlisteBilden(b, { raum: "raum-a" });
    const r = leckPruefen({ fakten: [{ id: "f.0", feld: "person.vorhanden", art: "wahr", wert: true }] }, sp);
    expect(r.ok).toBe(false);
    expect(r.befunde.map((x) => x.kategorie)).toContain("SPERRLISTE_LUECKE");
  });
});

describe("F3: Umlaute symmetrisch (NFC zuerst, beide Schreibweisen gesperrt)", () => {
  it("NFD gespeicherter Name wird wie NFC behandelt", () => {
    const nfd = `Mu${String.fromCodePoint(0x308)}ller`;
    expect(nfd.normalize("NFC")).not.toBe(nfd);
    expect(normalisieren(nfd)).toBe("mueller");
    expect(normalisieren(nfd)).toBe(normalisieren(nfd.normalize("NFC")));
    for (const t of ["Müller", "Mueller", "Muller", "MÜLLER"]) expect(kat(`${t} hat frei`), t).toContain("KLARNAME");
  });
  it("„Schafer“ (ohne Umlaut) trifft „Schäfer“", () => {
    for (const t of ["Schafer", "Schaefer", "Schäfer", "Jorg", "Joerg"]) expect(kat(`${t} hat frei`), t).toContain("KLARNAME");
  });
});

describe("F4: Platzhalter nur aus Alias", () => {
  const karte = () => new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" });
  it("rohe {{person:<kennung>}} und jede andere {{…}}-Folge in der Modellausgabe → KI_PRUEFER", () => {
    const k = karte(); const a = k.alias("person", "a1");
    for (const [funktion, text] of [["F4", "{{person:a2}} ist schwanger"], ["F3", "{{person:a2}}"], ["F3", "{{einheit:e1}}"],
      ["F3", "{{x}}"], ["F3", `{{person:${a}}} und {{person:a2}}`], ["F3", "{ {person:a2} }"], ["F3", `{${a}}`], ["F3", `{{{person:${a}}}}`]]) {
      expect(codeSync(() => rueckuebersetzen({ ergebnis: { text }, karte: k, sitzung: LEITUNG, funktion, bestand: bestand() })), text)
        .toBe("KI_PRUEFER");
    }
    expect(rueckuebersetzen({ ergebnis: { text: `{{person:${a}}} und ${a}` }, karte: k, sitzung: LEITUNG, funktion: "F3", bestand: bestand() }))
      .toEqual({ text: "{{person:a1}} und {{person:a1}}" });
  });
});

describe("F6: Kurznamen (2–3 Zeichen) auch mit angehängten Buchstaben", () => {
  it("„Tims“, „Utes“, „TimF“ → KLARNAME; „Tim“ weiter; lange Wörter nicht", () => {
    for (const t of ["Tims Dienst morgen tauschen", "Utes Dienst", "TimF", "Tim morgen frei", "Timo"]) expect(kat(t), t).toContain("KLARNAME");
    for (const t of ["Timeline morgen", "Utensilien bestellen"]) expect(kat(t), t).not.toContain("KLARNAME");
  });
});

describe("F7: Musterlücken", () => {
  it("Gesundheit: Krankenhaus, Krebs, Reha, Klinik, Insulin, Chemotherapie, Dialyse, Demenz", () => {
    for (const t of ["liegt im Krankenhaus", "Reha nach Krebs", "Klinik", "Insulin 8 IE", "Chemotherapie", "Dialyse dienstags",
      "Demenz", "Krankenkasse", "Kur"]) expect(kat(t), t).toContain("GESUNDHEIT");
    /* Berufsbezeichnungen bleiben zulässig */
    for (const t of ["Gesundheits- und Krankenpfleger", "Kinderkrankenpflegerin"]) expect(kat(t), t).not.toContain("GESUNDHEIT");
  });
  it("Geburtsdatum auch als TT.MM.JJ(JJ)", () => {
    for (const t of ["geboren 12.05.1990", "geb. 12.5.90", "14.03.1971", "14/03/1971"]) expect(kat(t), t).toContain("GEBURTSDATUM");
    expect(kat("Treffen am 13.05.1990")).not.toContain("GEBURTSDATUM");
  });
  it("Koordinaten mit Dezimalkomma", () => {
    for (const t of ["53,07516 / 8,80777", "53,07516; 8,80777", "-53,07516 8,80777"]) expect(kat(t), t).toContain("GEO");
  });
  it("Dritte mit Anrede und Namen im Fremdtext → DRITTE", () => {
    for (const t of ["Bewohnerin Frau Siebert gestürzt", "Herr Lehmann bekommt Besuch", "Hr. Kaiser anrufen", "Patientin Özdemir"])
      expect(kat(t), t).toContain("DRITTE");
    expect(kat("Frau und Herr der Lage bleiben")).not.toContain("DRITTE");
  });
  it("F7A: Fremdtext ist ohne serverseitige Maskierung nicht freischaltbar", async () => {
    expect(positivliste.FREISCHALTUNG_GESPERRT && positivliste.FREISCHALTUNG_GESPERRT.F7A).toBeTruthy();
    expect(await code(bilden({ funktion: "F7A", eingabe: { zeitraum: ZR, fremdtext: ["Spalte Früh"] } }))).toBe("KI_FUNKTION");
  });
});

describe("F8: Rückübersetzung an die Betriebskennung gebunden; Lauf-Store-Karte mit MAC", () => {
  const karte = (betriebId = "m1") => new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId, betriebIndex: 0, kontext: "k" });
  it("Karte eines anderen Betriebs am selben Index → KI_NICHT_GEFUNDEN; ohne Bestand → KI_NICHT_GEFUNDEN", () => {
    const k = karte("mANDERER"); const a = k.alias("person", "x9");
    expect(codeSync(() => rueckuebersetzen({ ergebnis: a, karte: k, sitzung: LEITUNG, funktion: "F1", bestand: bestand() }))).toBe("KI_NICHT_GEFUNDEN");
    const k2 = karte(); const a2 = k2.alias("person", "a1");
    expect(codeSync(() => rueckuebersetzen({ ergebnis: a2, karte: k2, sitzung: LEITUNG, funktion: "F1" }))).toBe("KI_NICHT_GEFUNDEN");
    expect(rueckuebersetzen({ ergebnis: a2, karte: k2, sitzung: LEITUNG, funktion: "F1", bestand: bestand() })).toBe("{{person:a1}}");
  });
  it("Lauf-Store: nur mit MAC-Schlüssel; Manipulation, falscher oder fehlender Schlüssel → abgelehnt", () => {
    const k = karte(); k.alias("person", "a1"); k.alias("person", "a2");
    expect(codeSync(() => k.fuerServerSpeicher())).toBe("KI_ALIAS_SCHLUESSEL");
    const d = k.fuerServerSpeicher(MAC);
    expect(AliasKarte.ausServerSpeicher(JSON.parse(JSON.stringify(d)), MAC).groesse).toBe(2);
    const getauscht = JSON.parse(JSON.stringify(d));
    getauscht.eintraege[0][2] = "a2"; getauscht.eintraege[1][2] = "a1";
    expect(codeSync(() => AliasKarte.ausServerSpeicher(getauscht, MAC))).toBe("KI_NICHT_GEFUNDEN");
    expect(codeSync(() => AliasKarte.ausServerSpeicher({ ...d, betriebId: "m2" }, MAC))).toBe("KI_NICHT_GEFUNDEN");
    expect(codeSync(() => AliasKarte.ausServerSpeicher(d, SCHLUESSEL))).toBe("KI_NICHT_GEFUNDEN");
    expect(codeSync(() => AliasKarte.ausServerSpeicher(d))).toBe("KI_ALIAS_SCHLUESSEL");
    expect(codeSync(() => AliasKarte.ausServerSpeicher({ ...d, mac: undefined }, MAC))).toBe("KI_NICHT_GEFUNDEN");
  });
});

describe("F9: Leck-Prüfung ohne quadratische Laufzeit", () => {
  it("20 × 4000 Zeichen mit „@“ in der Mitte: unter 500 ms", () => {
    const block = "a".repeat(1999) + "@" + "b".repeat(1999);
    const fremdtext = Array.from({ length: 20 }, (_, i) => ({ kapselId: `k${i}`, text: block + String.fromCharCode(97 + i) }));
    const t0 = performance.now();
    leckPruefen({ fremdtext }, SP);
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it("auch lange Ziffern-, Punkt-, Komma- und @-Läufe (Nachmessung: Muster GRAD war quadratisch): je unter 500 ms", () => {
    for (const lauf of ["1".repeat(3998) + "x", "@" + "a".repeat(3997) + "@", "1.".repeat(1999), "1,234 ".repeat(660), "-1".repeat(1999)]) {
      const fremdtext = Array.from({ length: 20 }, (_, i) => ({ kapselId: `k${i}`, text: lauf.slice(0, 3999) + String.fromCharCode(97 + i) }));
      const t0 = performance.now();
      leckPruefen({ fremdtext }, SP);
      expect(performance.now() - t0, lauf.slice(0, 6)).toBeLessThan(500);
    }
  });
  it("E-Mail wird weiter erkannt (zerlegt statt Rückverfolgung)", () => {
    for (const t of ["Mail an lena.brandt@sonnenhof.example", "x@y.de", "(a@b.co)"]) expect(kat(t), t).toContain("KONTAKT");
    for (const t of ["@sonnenhof", "a@b", "Treffen @ 14 Uhr"]) expect(kat(t), t).not.toContain("KONTAKT");
  });
});

describe("F10: __proto__ und Schema-Schlüsselwörter", () => {
  it("__proto__ in der Modellausgabe wird eigenes Feld, nie Prototyp", () => {
    const k = new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" });
    const a = k.alias("person", "a1");
    const r = rueckuebersetzen({ ergebnis: JSON.parse(`{"__proto__": {"x": "${a}"}}`), karte: k, sitzung: LEITUNG, funktion: "F1",
      bestand: bestand() });
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
    expect(Object.keys(r)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(r, "__proto__").value).toEqual({ x: "{{person:a1}}" });
    expect(/** @type {any} */ ({}).x).toBeUndefined();
  });
  it("jedes Schlüsselwort in jedem Schema ist dem Prüfer bekannt (statisch, auch in nie erreichten Zweigen)", () => {
    const bekannt = schemas.SCHEMA_SCHLUESSELWOERTER;
    expect(bekannt instanceof Set || Array.isArray(bekannt)).toBe(true);
    const menge = new Set(bekannt);
    const unbekannt = [];
    const lauf = (s, pfad) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) return;
      for (const k of Object.keys(s)) if (!menge.has(k)) unbekannt.push(`${pfad}.${k}`);
      for (const [k, v] of Object.entries(s.properties || {})) lauf(v, `${pfad}.properties.${k}`);
      if (s.items) lauf(s.items, `${pfad}.items`);
    };
    for (const [n, s] of Object.entries(SCHEMATA)) lauf(s, n);
    expect(unbekannt).toEqual([]);
    expect(typeof schemas.schemaPruefen).toBe("function");
    expect(() => schemas.schemaPruefen({ type: "object", additionalProperties: false, properties: { a: { type: "string", maxLength: 1, oneOf: [] } } }))
      .toThrow(/unbekanntes Schlüsselwort/);
  });
});

/* ------------------------------------------------------------------------
   Zweite, unabhängige Tests für Mutanten mit nur einem tötenden Test
   ------------------------------------------------------------------------ */
describe("zweite Tests (M5a, M7b, M12, M13)", () => {
  it("M12: Rolle mit eingeschränkter Sicht — was nur im Rohbestand steht, erreicht auch die Faktenquelle nicht", async () => {
    let gesehen = null;
    await bilden({ sitzung: sitzung("mitarbeiter", "a1"), funktion: "F9", eingabe: {}, faktenquelle: ({ sicht }) => { gesehen = sicht; return []; } });
    const ute = gesehen.personen.find((p) => p.id === "a2");
    expect(ute.schwerbehindert).toBeUndefined();
    expect(ute.geburtsdatum).toBeUndefined();
    gesehen = null;
    await bilden({ sitzung: sitzung("planer", "pl1"), faktenquelle: ({ sicht }) => { gesehen = sicht; return []; } });
    expect(gesehen.tarif).toBeUndefined();
    expect(gesehen.rabattGrund).toBeUndefined();
    const tim = gesehen.personen.find((p) => p.id === "a1");
    expect(tim.kalenderGeheim).toBeUndefined();
    expect(tim.pushSchluessel).toBeUndefined();
    /* Gegenprobe: im Rohbestand stehen die Felder */
    expect(betrieb().personen.find((p) => p.id === "a1").kalenderGeheim).toBeDefined();
    expect(bestandFuerRolle(bestand(), sitzung("planer", "pl1")).mandanten[0].tarif).toBeUndefined();
  });
  it("M13: Kopie, Spread oder Einträge der Karte liefern nichts von ihrem Inhalt", () => {
    const k = new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" });
    k.alias("person", "geheim-4711");
    const kopie = structuredClone(k);
    expect(JSON.stringify(Object.entries(kopie))).not.toContain("geheim-4711");
    expect({ ...k }).toEqual({});
    expect(Object.entries(k)).toEqual([]);
    expect(() => JSON.stringify([k])).toThrow();
    expect(() => JSON.stringify({ a: { b: k } })).toThrow();
  });
  it("M7b: Index der Sitzung ohne Rückfall — auch in der Rückübersetzung", () => {
    const k = new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" });
    const a = k.alias("person", "a1");
    const zwei = bestand(betrieb(), { ...betrieb(), id: "m2" });
    for (const betriebX of [undefined, null, -1, 2, 0.5, "x"]) {
      expect(codeSync(() => rueckuebersetzen({ ergebnis: a, karte: k, sitzung: { ...LEITUNG, betrieb: betriebX }, funktion: "F1", bestand: zwei })),
        String(betriebX)).toBe("KI_NICHT_GEFUNDEN");
    }
  });
  it("M7b: Bildner mit negativem, gebrochenem oder zu großem Index → KI_NICHT_GEFUNDEN, kein Audit „gebildet“", async () => {
    const zwei = () => bestand(betrieb(), { ...betrieb(), id: "m2" });
    for (const betriebX of [-1, 0.5, 2, "1x"]) {
      const ereignisse = [];
      expect(await code(bilden({ sitzung: { ...LEITUNG, betrieb: betriebX }, ladeBestand: zwei, audit: (e) => ereignisse.push(e) })), String(betriebX))
        .toBe("KI_NICHT_GEFUNDEN");
      expect(ereignisse).toEqual([]);
    }
  });
  it("M5a: Fremdtext an eine Funktion ohne Zulassung — kein Paket, kein Audit, Ablehnung vor jeder Leck-Prüfung", async () => {
    for (const f of FUNKTIONEN_IDS.filter((x) => !positivliste.FUNKTIONEN[x].fremdtext)) {
      const ereignisse = [];
      expect(await code(bilden({ funktion: f, eingabe: { zeitraum: ZR, fremdtext: ["Weberknecht ist krank"] }, audit: (e) => ereignisse.push(e) })), f)
        .toBe("KI_EINGABE");
      expect(ereignisse, f).toEqual([]);
    }
  });
});
