/* ==========================================================================
   G9 — Nachtrag 2 (unabhängiges Review zu WP-19.0b): Befunde M1–M5, N1–N6

   M1  Wieder-Zubuchen nutzt keine alte Zustimmung (Abschalten entzieht den Grund)
   M2  Vertragsgrundlage je Paket mit Preis, nicht pauschal; Pilot-Ende läuft nicht
       nahtlos in eine Berechnung ohne gültigen Grund
   M3  Zustimmung/Grundlage zählt nur bei preis === aktuellem Aufpreis
   M4  Server setzt das Datum neuer Einträge selbst (Servertag); echte Kalenderprüfung
   M5  Pilot als Zeitraum { seit, bis } mit Historie, gegen den Rechnungsmonat geprüft
   N1  Prototyp-Schlüssel (constructor, toString, __proto__) sind keine Pakete
   N2  Längengrenzen für notiz/von/grund
   N3  Array-Prüfungen; die Paketregel gilt auch bei /api/bestand-anlegen mit eigenem Inhalt
   N4  ein Stichtag (Monatsanfang), ein Datumsformat
   N5  Selbststart-Text Sicherheit „nach Freischaltung“
   N6  Nachweis §7.1: fünf kann-Aufrufer
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { kannMerkmal, mandantPaketkosten, paketAufpreisSumme, paketSchalten, pilotSetzen, zustimmungErfassen,
  grundlageErfassen, grundEntziehen, monatsanfang, folgemonatsanfang } from "../src/paketlogik.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { abrechnungsGrund, zustimmungGueltig, grundlageGueltig, zustimmungenBereinigen, grundlageBereinigen,
  pilotAktiv, pilotImZeitraum, pilotNachServerregel, paketfelderGeprueft, paketTag, tagGueltig,
  paketZubuchenErlaubt, paketeNachServerregel, pruefePaketFreigaben, merkmaleInVorbereitung, paketNutzbar,
  paketZustand, TEXT_GRENZE } from "../server/lib/paketstand.mjs";
import { zusammenfuehren } from "../server/lib/rechte.mjs";

const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ABNAHME = { datum: "2026-12-01", nachweis: "docs/acc45/abnahme-test.md" };
const ZIEL = { sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 };
const FG = (stufe) => ({ stufe, datum: "2026-12-15", von: "Betreiber", nachweis: "docs/acc45/freigabe-test.md" });
const lage = (abgenommen = []) => BRANCHENMODULE.map((m) =>
  (m.pakete.some((p) => abgenommen.includes(p)) ? { ...m, status: "vorlaeufig", abnahme: ABNAHME } : m));
const z5 = (id) => ({ liste: lage([id]), freigaben: { [id]: FG("buchbar") } });
const Z = (paket, datum = "2026-12-20", preis = ZIEL[paket]) => ({ paket, datum, preis, intervall: "monatlich", von: "Kunde" });
const G = (paket, datum = "2026-12-01", preis = ZIEL[paket]) =>
  ({ paket, datum, preis, intervall: "monatlich", von: "Betreiber", notiz: "Rahmenvertrag § 3" });
const PILOT = { seit: "2026-11-03", von: "Betreiber", grund: "Pilotkunde" };
const ST = "2027-01-01";

const BETREIBER = { rolle: "betreiber", person: null, betrieb: 0 };
const bestand = (m = {}) => ({ version: 9, stand: 1, session: null, betreiber: {}, tarife: [], rechnungen: [], protokoll: [],
  pakete: [], adressaenderungen: [], selbststarts: [],
  mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [{ id: "l1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE",
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "ALLE" }], email: "l@x.de" }],
    abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [], status: "aktiv", tarif: "pro",
    preisgestaltung: {}, pakete: [], selbstAngelegt: false, ...m }] });
const put = (alt, aendern) => {
  const u = JSON.parse(JSON.stringify(alt));
  aendern(u.mandanten[0]);
  return zusammenfuehren(alt, u, BETREIBER).mandanten[0];
};

afterEach(() => { vi.useRealTimers(); });

/* ------------------------------ M1 ------------------------------------- */
describe("M1: Wieder-Zubuchen nutzt keine alte Zustimmung", () => {
  it("Abschalten entzieht Zustimmung und Grundlage dieses Pakets (nur dieses)", () => {
    const m = { pakete: ["klinik", "pflege"], paketZustimmungen: [Z("klinik"), Z("pflege")], paketGrundlage: [G("klinik"), G("pflege")] };
    const r = grundEntziehen(m, "klinik");
    expect(r.paketZustimmungen).toEqual([Z("pflege")]);
    expect(r.paketGrundlage).toEqual([G("pflege")]);
    expect(m.paketZustimmungen).toHaveLength(2);   // Eingabe unverändert
    expect(grundEntziehen({}, "klinik")).toEqual({ paketZustimmungen: [], paketGrundlage: [] });
  });

  it("aus → wieder an: ohne neue Zustimmung nicht berechnet", () => {
    const { liste, freigaben } = z5("klinik");
    const m0 = { pakete: ["klinik"], paketZustimmungen: [Z("klinik")] };
    expect(mandantPaketkosten(m0, 0, liste, freigaben, ST).summe).toBe(129);
    const aus = { ...m0, pakete: paketSchalten(m0, "klinik", false).pakete, ...grundEntziehen(m0, "klinik") };
    const wieder = { ...aus, pakete: paketSchalten(aus, "klinik", true, liste, freigaben).pakete };
    expect(wieder.pakete).toEqual(["klinik"]);
    const k = mandantPaketkosten(wieder, 0, liste, freigaben, ST);
    expect(k.summe).toBe(0);
    expect(k.ohneGrund.map((p) => p.id)).toEqual(["klinik"]);
  });

  it("Server: Abschalten widerruft die gespeicherte Zustimmung, auch wenn der Client sie weiter mitschickt", () => {
    const alt = bestand({ pakete: ["industrie"], paketZustimmungen: [Z("industrie")], paketGrundlage: [G("industrie")] });
    const m = put(alt, (x) => { x.pakete = []; });
    expect(m.pakete).toEqual([]);
    expect(m.paketZustimmungen).toEqual([]);
    expect(m.paketGrundlage).toBeUndefined();
  });

  it("Server: ein veralteter Client, der Paket und alte Zustimmung zurückschickt, bekommt keine Rückdatierung", () => {
    const heute = paketTag();
    const alt = bestand({ pakete: [], preisgestaltung: { pilot: PILOT } });
    const m = put(alt, (x) => { x.pakete = ["industrie"]; x.paketZustimmungen = [Z("industrie", "2026-01-05")]; });
    expect(m.pakete).toEqual(["industrie"]);
    expect(m.paketZustimmungen.map((z) => z.datum)).toEqual([heute]);
  });

  it("Server: Zustimmungen zu nicht gebuchten Paketen bleiben nicht stehen", () => {
    expect(zustimmungenBereinigen([Z("pflege"), Z("klinik")], { pakete: ["klinik"] })).toEqual([Z("klinik")]);
  });
});

/* ------------------------------ M2 ------------------------------------- */
describe("M2: Vertragsgrundlage je Paket mit Preis", () => {
  it("die pauschale Grundlage { datum, von, notiz } zählt für kein Paket mehr", () => {
    const { liste, freigaben } = z5("klinik");
    const pauschal = { datum: "2026-12-01", von: "Betreiber", notiz: "AGB § 4 Abs. 4" };
    expect(grundlageGueltig(pauschal, "klinik")).toBe(false);
    expect(abrechnungsGrund({ pakete: ["klinik"], paketGrundlage: pauschal }, "klinik", ST, 129)).toBeNull();
    expect(mandantPaketkosten({ pakete: ["klinik"], paketGrundlage: pauschal }, 0, liste, freigaben, ST).summe).toBe(0);
    expect(grundlageBereinigen(pauschal)).toEqual([]);
  });

  it("die Grundlage gilt nur für das genannte Paket", () => {
    const { liste, freigaben } = z5("klinik");
    expect(mandantPaketkosten({ pakete: ["klinik"], paketGrundlage: [G("klinik")] }, 0, liste, freigaben, ST).summe).toBe(129);
    expect(mandantPaketkosten({ pakete: ["klinik"], paketGrundlage: [G("pflege")] }, 0, liste, freigaben, ST).summe).toBe(0);
    expect(abrechnungsGrund({ paketGrundlage: [G("klinik")] }, "klinik", ST, 129)).toBe("vertrag");
  });

  it("grundlageErfassen: nur für gebuchtes Zustand-5-Paket, mit Preis, Intervall und Pflichtnotiz", () => {
    const { liste, freigaben } = z5("klinik");
    const r = grundlageErfassen({ pakete: ["klinik"] }, "klinik", "2026-12-01", " Rahmenvertrag § 3 ", "Betreiber", liste, freigaben);
    expect(r).toEqual({ ok: true, eintrag: { paket: "klinik", datum: "2026-12-01", preis: 129, intervall: "monatlich",
      von: "Betreiber", notiz: "Rahmenvertrag § 3" } });
    expect(grundlageGueltig(r.eintrag, "klinik")).toBe(true);
    expect(grundlageErfassen({ pakete: ["klinik"] }, "klinik", "2026-12-01", "", "Betreiber", liste, freigaben).ok).toBe(false);
    expect(grundlageErfassen({ pakete: [] }, "klinik", "2026-12-01", "n", "Betreiber", liste, freigaben).ok).toBe(false);
    expect(grundlageErfassen({ pakete: ["pflege"] }, "pflege", "2026-12-01", "n", "Betreiber", liste, freigaben).ok).toBe(false);
  });

  it("Pilot endet, Paket hat Zustand 5: der Folgemonat wird ohne gültigen Grund nicht berechnet", () => {
    const { liste, freigaben } = z5("pflege");
    const pg = pilotSetzen({ preisgestaltung: { pilot: PILOT } }, false, "2027-01-15");
    const m = { pakete: ["pflege"], preisgestaltung: pg };
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2027-02-01").summe).toBe(0);
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2027-02-01").ohneGrund.map((p) => p.id)).toEqual(["pflege"]);
    const pauschal = { ...m, paketGrundlage: { datum: "2026-10-01", von: "B", notiz: "AGB" } };
    expect(mandantPaketkosten(pauschal, 0, liste, freigaben, "2027-02-01").summe).toBe(0);
    const anderes = { ...m, paketGrundlage: [G("klinik", "2026-10-01")] };
    expect(mandantPaketkosten(anderes, 0, liste, freigaben, "2027-02-01").summe).toBe(0);
    const mitGrund = { ...m, paketZustimmungen: [Z("pflege", "2027-01-20")] };
    expect(mandantPaketkosten(mitGrund, 0, liste, freigaben, "2027-02-01").summe).toBe(89);
  });
});

/* ------------------------------ M3 ------------------------------------- */
describe("M3: zugestimmter Preis wird geprüft", () => {
  it("Zustimmung zu einem anderen Preis zählt nicht: „Zustimmung erforderlich“", () => {
    const { liste, freigaben } = z5("klinik");
    for (const preis of [79, 128.99, 130, 1]) {
      const m = { pakete: ["klinik"], paketZustimmungen: [Z("klinik", "2026-12-20", preis)] };
      const k = mandantPaketkosten(m, 0, liste, freigaben, ST);
      expect(k.summe, String(preis)).toBe(0);
      expect(k.ohneGrund.map((p) => p.id)).toEqual(["klinik"]);
      expect(abrechnungsGrund(m, "klinik", ST, 129)).toBeNull();
      expect(paketAufpreisSumme(m, liste, freigaben, ST)).toBe(0);
    }
    const passt = { pakete: ["klinik"], paketZustimmungen: [Z("klinik")] };
    expect(abrechnungsGrund(passt, "klinik", ST, 129)).toBe("zustimmung");
  });

  it("Grundlage zu einem anderen Preis zählt nicht", () => {
    expect(abrechnungsGrund({ paketGrundlage: [G("klinik", "2026-12-01", 99)] }, "klinik", ST, 129)).toBeNull();
  });

  it("ohne aktuellen Preis gibt es keinen Grund", () => {
    const m = { paketZustimmungen: [Z("klinik")] };
    for (const p of [undefined, null, 0, -129, "129", NaN]) expect(abrechnungsGrund(m, "klinik", ST, p), String(p)).toBeNull();
  });
});

/* ------------------------------ M4 ------------------------------------- */
describe("M4: Datum — Servertag für neue Einträge, echte Kalenderprüfung", () => {
  it("tagGueltig: nur echte Kalendertage", () => {
    for (const s of ["2026-99-99", "0000-01-01", "9999-99-99", "2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31",
      "2027-02-29", "26-01-01", "2026-1-1", "", null, 20260101])
      expect(tagGueltig(s), String(s)).toBe(false);
    for (const s of ["2026-11-03", "2028-02-29", "2026-12-31", "2026-01-01"]) expect(tagGueltig(s), s).toBe(true);
  });

  it("Zustimmung, Grundlage, Pilot und Freigabe mit unechtem Datum zählen nicht", () => {
    for (const d of ["2026-99-99", "0000-01-01", "9999-99-99", "2026-02-30"]) {
      expect(zustimmungGueltig(Z("klinik", d), "klinik"), d).toBe(false);
      expect(grundlageGueltig(G("klinik", d), "klinik"), d).toBe(false);
      expect(pilotAktiv({ preisgestaltung: { pilot: { ...PILOT, seit: d } } }), d).toBe(false);
      expect(pruefePaketFreigaben({ pflege: { ...FG("buchbar"), datum: d } }, lage(["pflege"])), d).toHaveLength(1);
    }
  });

  it("Server: neue Zustimmungen und Grundlagen bekommen den Servertag, gespeicherte bleiben unverändert", () => {
    const heute = paketTag();
    const alt = bestand({ pakete: ["industrie", "pflege"], paketZustimmungen: [Z("industrie", "2026-11-01")] });
    const m = put(alt, (x) => {
      x.paketZustimmungen = [Z("industrie", "2026-11-01"), Z("pflege", "2020-01-01")];
      x.paketGrundlage = [G("pflege", "2019-05-05")];
    });
    expect(m.paketZustimmungen).toEqual([Z("industrie", "2026-11-01"), Z("pflege", heute)]);
    expect(m.paketGrundlage).toEqual([G("pflege", heute)]);
  });

  it("Server: ein geänderter Preis an einer gespeicherten Zustimmung ist ein neuer Eintrag (Servertag)", () => {
    const heute = paketTag();
    const alt = bestand({ pakete: ["industrie"], paketZustimmungen: [Z("industrie", "2026-11-01")] });
    const m = put(alt, (x) => { x.paketZustimmungen = [Z("industrie", "2026-11-01", 99)]; });
    expect(m.paketZustimmungen).toEqual([Z("industrie", heute, 99)]);
  });

  it("Server: ein neuer Pilot beginnt am Servertag, ein laufender lässt sich nicht zurückdatieren", () => {
    const heute = paketTag();
    expect(put(bestand(), (x) => { x.preisgestaltung = { pilot: { ...PILOT, seit: "2020-01-01" } }; }).preisgestaltung.pilot)
      .toEqual({ ...PILOT, seit: heute });
    expect(put(bestand({ preisgestaltung: { pilot: PILOT } }), (x) => { x.preisgestaltung.pilot.seit = "2020-01-01"; })
      .preisgestaltung.pilot).toEqual(PILOT);
  });

  it("paketTag ist der Kalendertag in Europe/Berlin (ein Format für Server, paketlogik.js und App.jsx)", () => {
    expect(paketTag(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(paketTag(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(tagGueltig(paketTag())).toBe(true);
  });
});

/* ------------------------------ M5 ------------------------------------- */
describe("M5: Pilot als Zeitraum mit Historie, geprüft gegen den Rechnungsmonat", () => {
  const { liste, freigaben } = z5("pflege");
  const grund = { pakete: ["pflege"], paketZustimmungen: [Z("pflege", "2026-10-01")] };

  it("pilotSetzen: Beenden schreibt den Zeitraum { seit, bis } in die Historie; erneut setzen hängt nicht an", () => {
    const an = pilotSetzen({ preisgestaltung: { sonderpreis: 99 } }, true, "2026-11-04", "Pilotkunde");
    const aus = pilotSetzen({ preisgestaltung: an }, false, "2026-12-10");
    expect(aus).toEqual({ sonderpreis: 99,
      pilotHistorie: [{ seit: "2026-11-04", bis: "2026-12-10", von: "Betreiber", grund: "Pilotkunde" }] });
    expect(pilotAktiv({ preisgestaltung: aus })).toBe(false);
    const wieder = pilotSetzen({ preisgestaltung: aus }, true, "2027-03-01", "Zweiter Pilot");
    expect(wieder.pilotHistorie).toHaveLength(1);
    expect(wieder.pilot.seit).toBe("2027-03-01");
    expect(pilotSetzen({ preisgestaltung: an }, true, "2026-11-20", "anders")).toEqual(an);   // läuft schon
    expect(pilotSetzen({ preisgestaltung: {} }, false, "2026-11-20")).toEqual({});   // keiner lief
  });

  it("ein beendeter Pilot deckt nur seine Monate: davor und danach wird berechnet, im Zeitraum nicht", () => {
    const pg = pilotSetzen({ preisgestaltung: { pilot: { ...PILOT, seit: "2026-11-15" } } }, false, "2027-01-10");
    const m = { ...grund, preisgestaltung: pg };
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2026-10-01").summe).toBe(0);   // vor dem Grund (01.10. selbst)
    expect(mandantPaketkosten({ ...m, paketZustimmungen: [Z("pflege", "2026-09-01")] }, 0, liste, freigaben, "2026-10-01").summe)
      .toBe(89);   // Oktober: vor dem Pilot
    for (const s of ["2026-11-01", "2026-12-01", "2027-01-01"]) expect(mandantPaketkosten(m, 0, liste, freigaben, s).summe, s).toBe(0);
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2027-02-01").summe).toBe(89);
  });

  it("ein laufender Pilot deckt nicht die Monate vor seinem Beginn", () => {
    const m = { ...grund, preisgestaltung: { pilot: { ...PILOT, seit: "2026-12-15" } } };
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2026-11-01").summe).toBe(89);
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2026-12-01").summe).toBe(0);
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2027-06-01").summe).toBe(0);
  });

  it("pilotImZeitraum: Grenzen tagesgenau, Historie mit kaputten Einträgen zählt nicht", () => {
    const pg = { pilotHistorie: [{ seit: "2026-11-15", bis: "2026-11-30", von: "B", grund: "g" }] };
    expect(pilotImZeitraum({ preisgestaltung: pg }, "2026-11-01")).toBe(true);
    expect(pilotImZeitraum({ preisgestaltung: pg }, "2026-12-01")).toBe(false);
    expect(pilotImZeitraum({ preisgestaltung: pg }, "2026-10-01")).toBe(false);
    for (const h of [{ seit: "2026-11-15", bis: "2026-11-01", von: "B", grund: "g" }, { seit: "2026-11-15", von: "B", grund: "g" },
      { seit: "2026-11-15", bis: "2026-11-30", von: "B" }, { seit: "2026-99-99", bis: "2026-11-30", von: "B", grund: "g" }])
      expect(pilotImZeitraum({ preisgestaltung: { pilotHistorie: [h] } }, "2026-11-01"), JSON.stringify(h)).toBe(false);
    expect(pilotImZeitraum({ preisgestaltung: { pilotHistorie: "x" } }, "2026-11-01")).toBe(false);
  });

  it("Server: Historie ist nur anhängbar; das Beenden schreibt der Server mit dem Servertag", () => {
    const heute = paketTag();
    const H = { seit: "2026-05-01", bis: "2026-06-30", von: "Betreiber", grund: "Erster Pilot" };
    const alt = bestand({ preisgestaltung: { pilot: PILOT, pilotHistorie: [H] } });
    const geloescht = put(alt, (x) => { x.preisgestaltung.pilotHistorie = []; });
    expect(geloescht.preisgestaltung.pilotHistorie).toEqual([H]);
    const erfunden = put(alt, (x) => { x.preisgestaltung.pilotHistorie.push({ ...H, seit: "2025-01-01", bis: "2025-12-31" }); });
    expect(erfunden.preisgestaltung.pilotHistorie).toEqual([H]);
    const beendet = put(alt, (x) => { delete x.preisgestaltung.pilot; });
    expect(beendet.preisgestaltung.pilot).toBeUndefined();
    expect(beendet.preisgestaltung.pilotHistorie).toEqual([H, { ...PILOT, bis: heute }]);
  });

  it("pilotNachServerregel lässt übrige Preisgestaltung unverändert", () => {
    expect(pilotNachServerregel({ sonderpreis: 50 }, { sonderpreis: 40 }, "2026-11-03")).toEqual({ sonderpreis: 50 });
  });
});

/* ------------------------------ N1 ------------------------------------- */
describe("N1: Prototyp-Schlüssel sind keine Pakete", () => {
  const BOESE = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
  it("weder zubuchbar noch Zustimmung, Grundlage, Freigabe; keine Ausnahme", () => {
    for (const id of BOESE) {
      expect(paketZubuchenErlaubt(id, true), id).toBe(false);
      expect(paketeNachServerregel([], [id], true), id).toEqual([]);
      expect(zustimmungGueltig({ ...Z("pflege"), paket: id }, id), id).toBe(false);
      expect(grundlageGueltig({ ...G("pflege"), paket: id }, id), id).toBe(false);
      expect(merkmaleInVorbereitung(id), id).toEqual([]);
      expect(paketNutzbar(id), id).toBe(false);
      expect(paketZustand(id, BRANCHENMODULE, { [id]: FG("buchbar") }), id).toBe(1);
      expect(paketSchalten({ preisgestaltung: { pilot: PILOT } }, id, true).ok, id).toBe(false);
    }
    const fr = JSON.parse('{"constructor":{"stufe":"buchbar","datum":"2026-12-15","von":"B","nachweis":"n"},'
      + '"__proto__":{"stufe":"buchbar","datum":"2026-12-15","von":"B","nachweis":"n"}}');
    expect(pruefePaketFreigaben(fr).length).toBe(2);
    expect(paketZustand("pflege", lage(["pflege"]), Object.create({ pflege: FG("buchbar") }))).toBe(3);   // geerbt zählt nicht
  });
});

/* ------------------------------ N2 ------------------------------------- */
describe("N2: Längengrenzen", () => {
  const lang = "x".repeat(TEXT_GRENZE + 1);
  const genau = "x".repeat(TEXT_GRENZE);
  it("von/notiz/grund über der Grenze zählen nicht", () => {
    expect(TEXT_GRENZE).toBe(500);
    expect(zustimmungGueltig({ ...Z("pflege"), von: lang }, "pflege")).toBe(false);
    expect(zustimmungGueltig({ ...Z("pflege"), von: genau }, "pflege")).toBe(true);
    expect(grundlageGueltig({ ...G("pflege"), notiz: lang }, "pflege")).toBe(false);
    expect(grundlageGueltig({ ...G("pflege"), von: lang }, "pflege")).toBe(false);
    expect(grundlageGueltig({ ...G("pflege"), notiz: genau }, "pflege")).toBe(true);
    expect(pilotAktiv({ preisgestaltung: { pilot: { ...PILOT, grund: lang } } })).toBe(false);
    expect(pilotAktiv({ preisgestaltung: { pilot: { ...PILOT, von: lang } } })).toBe(false);
    expect(pilotSetzen({}, true, "2026-11-04", lang)).toBeNull();
    expect(pruefePaketFreigaben({ pflege: { ...FG("buchbar"), nachweis: lang } }, lage(["pflege"]))).toHaveLength(1);
    const { liste, freigaben } = z5("pflege");
    expect(zustimmungErfassen({ pakete: ["pflege"] }, "pflege", "2026-12-01", lang, liste, freigaben).ok).toBe(false);
    expect(grundlageErfassen({ pakete: ["pflege"] }, "pflege", "2026-12-01", lang, "B", liste, freigaben).ok).toBe(false);
  });
});

/* ------------------------------ N3 ------------------------------------- */
describe("N3: Array-Prüfungen und die Paketregel bei /api/bestand-anlegen", () => {
  it("Zeichenkette oder Objekt statt Liste: nichts freigeschaltet, nichts berechnet, keine Ausnahme", () => {
    const { liste, freigaben } = z5("pflege");
    for (const pakete of ["pflege", "pflegeklinik", { 0: "pflege", length: 1 }, 5, null]) {
      const m = { pakete, paketZustimmungen: { 0: Z("pflege") }, paketGrundlage: "x" };
      expect(kannMerkmal(m, "fachkraftquote"), JSON.stringify(pakete)).toBe(false);
      expect(kannMerkmal(m, "plan")).toBe(true);
      expect(mandantPaketkosten(m, 0, liste, freigaben, ST).summe).toBe(0);
      expect(mandantPaketkosten(m, 0, liste, freigaben, ST).gewaehlt).toEqual([]);
      expect(abrechnungsGrund(m, "pflege", ST, 89)).toBeNull();
      expect(paketSchalten(m, "pflege", false)).toEqual({ ok: true, pakete: [] });
    }
    expect(paketfelderGeprueft({ pakete: "pflege", paketZustimmungen: "x", paketGrundlage: 5 }, null))
      .toEqual({ pakete: [], paketZustimmungen: [] });
    expect(paketfelderGeprueft(null, null)).toBeNull();
    expect(paketfelderGeprueft([], null)).toEqual([]);
  });

  it("paketfelderGeprueft für einen neuen Betrieb: Pakete unter Zustand 5 nur mit Pilot, Daten vom Server", () => {
    const heute = paketTag();
    const m = paketfelderGeprueft({ id: "n", pakete: ["pflege", "klinik"], paketZustimmungen: [Z("pflege", "2020-01-01")],
      preisgestaltung: { pilotHistorie: [{ seit: "2020-01-01", bis: "2020-02-01", von: "B", grund: "g" }] } }, null);
    expect(m.pakete).toEqual([]);
    expect(m.paketZustimmungen).toEqual([]);
    expect(m.preisgestaltung).toEqual({});
    const p = paketfelderGeprueft({ id: "n", pakete: ["pflege"], preisgestaltung: { pilot: { ...PILOT, seit: "2020-01-01" } } }, null);
    expect(p.pakete).toEqual(["pflege"]);
    expect(p.preisgestaltung.pilot.seit).toBe(heute);
  });

  it("/api/bestand-anlegen prüft die Paketfelder jedes Betriebs bei eigenem Inhalt (Quelltext)", () => {
    const d = quelle("../server/funktionen/daten.mjs");
    expect(d).toMatch(/import \{ paketfelderGeprueft \} from "\.\.\/lib\/paketstand\.mjs";/);
    expect(d).toMatch(/vorlage === undefined && Array\.isArray\(neuerBestand\.mandanten\)\)\s*\n\s*neuerBestand\.mandanten = neuerBestand\.mandanten\.map\(\(m\) => paketfelderGeprueft\(m, null\)\);/);
  });

  it("rechte.mjs: der Betreiber-PUT nutzt dieselbe Regel (Quelltext; Neuanlage und Änderung)", () => {
    const r = quelle("../server/lib/rechte.mjs");
    expect(r).toMatch(/const paketeGeprueft = \(m0, altM\) => paketfelderGeprueft\(m0, altM\);/);
    expect(r).toMatch(/return paketeGeprueft\(zusammen, alt\);/);
  });
});

/* ------------------------------ N4 ------------------------------------- */
describe("N4: ein Stichtag (Monatsanfang), ein Datumsformat", () => {
  it("Vorgabe-Stichtag ist der Monatsanfang: eine Zustimmung von gestern berechnet den laufenden Monat nicht", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-15T10:00:00Z"));
    const { liste, freigaben } = z5("pflege");
    const m = { pakete: ["pflege"], paketZustimmungen: [Z("pflege", "2027-03-14")] };
    expect(mandantPaketkosten(m, 0, liste, freigaben).summe).toBe(0);
    expect(paketAufpreisSumme(m, liste, freigaben)).toBe(0);
    const vorher = { pakete: ["pflege"], paketZustimmungen: [Z("pflege", "2027-02-28")] };
    expect(mandantPaketkosten(vorher, 0, liste, freigaben).summe).toBe(89);
  });

  it("monatsanfang/folgemonatsanfang", () => {
    expect(monatsanfang("2027-03-15")).toBe("2027-03-01");
    expect(folgemonatsanfang("2027-03-15")).toBe("2027-04-01");
    expect(folgemonatsanfang("2027-12-31")).toBe("2028-01-01");
  });

  it("App.jsx: Paketdaten und Stichtag über paketTag/monatsanfang; preis() ohne Monat rechnet ab Monatsanfang", () => {
    const app = quelle("../src/App.jsx");
    expect(app).toMatch(/const paketkosten_ = mandantPaketkosten\(m, gewaehlt\.paketeFrei \|\| 0, undefined, undefined, ym \? `\$\{ym\}-01` : monatsanfang\(paketTag\(\)\)\);/);
    expect(app).toMatch(/const pilot = paketkosten_\.pilot;/);
    expect(app).toMatch(/pilotSetzen\(m, an, paketTag\(\), grund\)/);
    expect(app).toMatch(/zustimmungErfassen\(m0, paket, paketTag\(\), /);
    expect(app).toMatch(/grundlageErfassen\(m0, paket, paketTag\(\), notiz, "Betreiber"\)/);
    expect(app).toMatch(/mandantPaketkosten\(m, 0, undefined, undefined, folgemonatsanfang\(paketTag\(\)\)\)\.ohneGrund/);
    expect(app).toMatch(/\.\.\.\(an \? \{\} : grundEntziehen\(x, paket\)\)/);
    const pl = quelle("../src/paketlogik.js");
    expect(pl).not.toMatch(/toISOString\(\)/);
    expect(pl).toMatch(/stichtag = monatsanfang\(paketTag\(\)\)/);
  });
});

/* ------------------------------ N5/N6 ---------------------------------- */
describe("N5/N6: Texte und Nachweis", () => {
  it("N5: Selbststart Sicherheit bewirbt Nutzbares „nach Freischaltung“ wie Pflege und Klinik", () => {
    const z = quelle("../src/main.jsx").split("\n").find((x) => /^\s*\["sicherheit", "/.test(x));
    expect(z).toMatch(/nach Freischaltung/);
    expect(z).toMatch(/in Vorbereitung/);
  });

  it("N6: Nachweis §7.1 nennt fünf kann-Aufrufer, nicht „die einzigen zwei“", () => {
    const d = quelle("../docs/acc45/wp19-0b-nachweis.md");
    expect(d).not.toMatch(/die einzigen zwei `kann`-Aufrufer/);
    expect(d).toMatch(/fünf `kann`-Aufrufer/);
    const app = quelle("../src/App.jsx");
    expect((app.match(/\bkann\(/g) || []).length).toBe(5);
  });
});
