/* ==========================================================================
   G9 — Nachtrag 3 (zweites unabhängiges Delta-Review zu WP-19.0b): N-A bis N-F, R1

   N-A  normales Speichern verschiebt keine Zustimmung nach vorn (Datum bleibt, Rückdatieren bleibt aus);
        der Client übernimmt die Vertragsfelder aus der Serverantwort
   N-B  preisgestaltung null/[]/"x"/0 löscht weder Pilot noch Pilot-Historie
   N-C  Grenztage von pilotImZeitraum (bis === stichtag, seit === Folgemonatsanfang)
   N-D  Vorlage „demo“ umgeht die Paketregel nicht
   N-E  Zubuchen/Abschalten und Änderungen an Zustimmung/Grundlage/Pilot sind protokolliert
   N-F  Leitung/Kundenrolle bekommen vom Pilot nur seit und bis (Grund und Betreiberkennung nicht)
   R1   nur gespeicherte Einträge zu bereits gebuchten Paketen gelten als „unverändert“ (Altdaten)
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pilotImZeitraum, pilotNachServerregel, pilotAktiv, paketTag, paketAenderungen, vertragsstandVon,
  preisgestaltungFuerKunde, zustimmungenBereinigen } from "../server/lib/paketstand.mjs";
import { vertragsstandUebernehmen } from "../src/paketlogik.js";
import { appQuelle } from "./app-quelle.js";
import { demoOhneVertrag } from "../server/lib/erstbefuellung.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ZIEL = { sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 };
const Z = (paket, datum = "2026-12-20", preis = ZIEL[paket]) => ({ paket, datum, preis, intervall: "monatlich", von: "Kunde" });
const G = (paket, datum = "2026-12-01", preis = ZIEL[paket]) =>
  ({ paket, datum, preis, intervall: "monatlich", von: "Betreiber", notiz: "Rahmenvertrag § 3" });
const PILOT = { seit: "2026-11-03", von: "Betreiber", grund: "Pilotkunde" };
const H = { seit: "2026-05-01", bis: "2026-06-30", von: "Betreiber", grund: "Erster Pilot" };
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

describe("N-A: normales Speichern verschiebt keine Zustimmung nach vorn", () => {
  it("P12: gespeichert 01.12., Client schickt 30.11., Speichern heute: das gespeicherte Datum bleibt", () => {
    const alt = bestand({ pakete: ["industrie"], paketZustimmungen: [Z("industrie", "2026-12-01")],
      paketGrundlage: [G("industrie", "2026-12-02")] });
    const m = put(alt, (x) => { x.paketZustimmungen = [Z("industrie", "2026-11-30")]; x.paketGrundlage = [G("industrie", "2026-11-29")]; });
    expect(m.paketZustimmungen).toEqual([Z("industrie", "2026-12-01")]);
    expect(m.paketGrundlage).toEqual([G("industrie", "2026-12-02")]);
  });

  it("Rückdatieren bleibt ausgeschlossen: ein neuer Eintrag bekommt weiter den Servertag", () => {
    const alt = bestand({ pakete: ["industrie", "pflege"], paketZustimmungen: [Z("industrie", "2026-12-01")] });
    const m = put(alt, (x) => { x.paketZustimmungen = [Z("industrie", "2026-12-01"), Z("pflege", "2020-01-01")]; });
    expect(m.paketZustimmungen).toEqual([Z("industrie", "2026-12-01"), Z("pflege", paketTag())]);
  });

  it("zustimmungenBereinigen: gleicher Inhalt mit anderem Datum liefert den gespeicherten Eintrag", () => {
    const r = zustimmungenBereinigen([Z("industrie", "2030-01-01")], { alt: [Z("industrie", "2026-12-01")], pakete: ["industrie"], heute: "2027-01-05" });
    expect(r).toEqual([Z("industrie", "2026-12-01")]);
  });

  it("Serverstand: vertragsstandVon liefert je Betrieb nur die Vertragsfelder", () => {
    const b = bestand({ pakete: ["pflege"], paketZustimmungen: [Z("pflege")], paketGrundlage: [G("pflege")],
      preisgestaltung: { pilot: PILOT, pilotHistorie: [H] }, name: "Haus", notiz: "intern" });
    expect(vertragsstandVon(b)).toEqual([{ id: "m1", pakete: ["pflege"], paketZustimmungen: [Z("pflege")],
      paketGrundlage: [G("pflege")], preisgestaltung: { pilot: PILOT, pilotHistorie: [H] } }]);
    expect(vertragsstandVon(null)).toEqual([]);
  });

  it("Client: vertragsstandUebernehmen setzt die Vertragsfelder, ändert sonst nichts und gibt bei Gleichheit dasselbe Objekt", () => {
    const db = { stand: 3, mandanten: [{ id: "m1", name: "Haus", pakete: ["pflege"], paketZustimmungen: [Z("pflege", "2026-11-30")], preisgestaltung: {} }] };
    const stand = [{ id: "m1", pakete: ["pflege"], paketZustimmungen: [Z("pflege", "2026-12-01")], paketGrundlage: [], preisgestaltung: { pilot: PILOT } }];
    const neu = vertragsstandUebernehmen(db, stand);
    expect(neu.mandanten[0].paketZustimmungen).toEqual([Z("pflege", "2026-12-01")]);
    expect(neu.mandanten[0].preisgestaltung).toEqual({ pilot: PILOT });
    expect(neu.mandanten[0].name).toBe("Haus");
    expect(neu.stand).toBe(3);
    expect(vertragsstandUebernehmen(neu, stand)).toBe(neu);
    expect(vertragsstandUebernehmen(db, undefined)).toBe(db);
    expect(vertragsstandUebernehmen(db, [{ id: "fremd", pakete: ["klinik"] }])).toBe(db);
  });

  it("Quelltext: PUT-Antwort des Betreibers trägt den Vertragsstand, speicher.js reicht ihn an die Anwendung, App.jsx übernimmt ihn", () => {
    const d = quelle("../server/funktionen/daten.mjs");
    expect(d).toMatch(/vertragsstand:\s*s\.rolle === "betreiber" \? vertragsstandVon\(zuSchreiben\)/);
    expect(quelle("../src/speicher.js")).toMatch(/\n\s*if \(auftrag\.onServerstand && daten\.vertragsstand\) \{ try \{ auftrag\.onServerstand\(daten\.vertragsstand\)/);
    expect(quelle("../src/App.jsx")).toMatch(/onServerstand:[\s\S]{0,200}vertragsstandUebernehmen/);
  });
});

describe("N-B: preisgestaltung null/[]/Text/0 löscht Pilot und Historie nicht", () => {
  const heute = paketTag();
  for (const v of [null, [], "x", 0]) {
    it(`Betreiber-PUT mit preisgestaltung = ${JSON.stringify(v)}: Historie bleibt, laufender Pilot endet mit Servertag`, () => {
      const alt = bestand({ preisgestaltung: { pilot: PILOT, pilotHistorie: [H] } });
      const m = put(alt, (x) => { x.preisgestaltung = v; });
      expect(m.preisgestaltung.pilot).toBeUndefined();
      expect(m.preisgestaltung.pilotHistorie).toEqual([H, { ...PILOT, bis: heute }]);
    });
    it(`pilotNachServerregel(${JSON.stringify(v)}): immer ein Objekt, Historie bleibt`, () => {
      const r = pilotNachServerregel(v, { pilotHistorie: [H] }, "2026-11-03");
      expect(Array.isArray(r) || r === null || typeof r !== "object").toBe(false);
      expect(r.pilotHistorie).toEqual([H]);
    });
  }
  it("ohne Pilot und ohne Historie bleibt ein leeres Objekt", () => {
    expect(pilotNachServerregel(null, undefined, "2026-11-03")).toEqual({});
  });
});

describe("N-C: Grenztage des Pilotzeitraums (zugunsten des Kunden)", () => {
  it("Pilot endet am 01.: der ganze Berührungsmonat ist frei; Pilot beginnt am letzten Tag: ebenso", () => {
    const ende01 = { preisgestaltung: { pilotHistorie: [{ seit: "2026-11-15", bis: "2026-12-01", von: "B", grund: "g" }] } };
    expect(pilotImZeitraum(ende01, "2026-12-01")).toBe(true);        // bis === stichtag
    expect(pilotImZeitraum(ende01, "2027-01-01")).toBe(false);
    const beginnEnde = { preisgestaltung: { pilotHistorie: [{ seit: "2026-11-30", bis: "2026-12-10", von: "B", grund: "g" }] } };
    expect(pilotImZeitraum(beginnEnde, "2026-11-01")).toBe(true);    // letzter Monatstag berührt den November
  });
  it("seit === Folgemonatsanfang berührt den Monat davor nicht", () => {
    const ab01 = { preisgestaltung: { pilotHistorie: [{ seit: "2026-12-01", bis: "2026-12-20", von: "B", grund: "g" }] } };
    expect(pilotImZeitraum(ab01, "2026-11-01")).toBe(false);
    expect(pilotImZeitraum({ preisgestaltung: { pilot: { ...PILOT, seit: "2026-12-01" } } }, "2026-11-01")).toBe(false);
    expect(pilotImZeitraum({ preisgestaltung: { pilot: { ...PILOT, seit: "2026-11-30" } } }, "2026-11-01")).toBe(true);
  });
});

describe("N-D: Vorlage „demo“ umgeht die Paketregel nicht", () => {
  const demo = () => ({ mandanten: [
    { id: "a", name: "Demo A", pakete: ["pflege"], paketZustimmungen: [Z("pflege")], paketGrundlage: [G("pflege")],
      preisgestaltung: { sonderpreis: 5, pilot: PILOT, pilotHistorie: [H] } },
    { id: "b", name: "Demo B" }, null] });
  it("demoOhneVertrag entfernt Zustimmungen, Grundlagen, Pilot und Pilot-Historie, behält den Rest", () => {
    const r = demoOhneVertrag(demo());
    expect(r.mandanten[0].paketZustimmungen).toBeUndefined();
    expect(r.mandanten[0].paketGrundlage).toBeUndefined();
    expect(r.mandanten[0].preisgestaltung).toEqual({ sonderpreis: 5 });
    expect(r.mandanten[0].pakete).toEqual(["pflege"]);
    expect(r.mandanten[0].name).toBe("Demo A");
    expect(r.mandanten[1]).toEqual({ id: "b", name: "Demo B" });
    expect(pilotAktiv(r.mandanten[0])).toBe(false);
  });
  it("ohne Betriebsliste keine Ausnahme", () => {
    expect(demoOhneVertrag({})).toEqual({});
    expect(demoOhneVertrag(null)).toBe(null);
  });
  it("Quelltext: /api/bestand-anlegen wendet es bei der Vorlage „demo“ an", () => {
    expect(quelle("../server/funktionen/daten.mjs")).toMatch(/vorlage === "demo"[\s\S]{0,200}demoOhneVertrag\(/);
  });
});

describe("N-E: Paketänderungen sind protokolliert", () => {
  it("paketAenderungen nennt Zubuchen, Abschalten, Zustimmung, Grundlage und Pilot je Betrieb (ohne Freitexte)", () => {
    const alt = bestand({ pakete: ["pflege"], paketZustimmungen: [Z("pflege")], preisgestaltung: { pilot: PILOT } });
    const neu = bestand({ pakete: ["klinik"], paketGrundlage: [G("klinik")], preisgestaltung: { pilotHistorie: [{ ...PILOT, bis: "2026-11-05" }] } });
    const t = paketAenderungen(alt, neu).join("\n");
    expect(t).toMatch(/m1.*Paket klinik zugebucht/);
    expect(t).toMatch(/m1.*Paket pflege abgeschaltet/);
    expect(t).toMatch(/m1.*Zustimmung.*pflege.*entfernt/);
    expect(t).toMatch(/m1.*Grundlage.*klinik.*festgehalten/);
    expect(t).toMatch(/m1.*Pilot beendet/);
    expect(t).not.toMatch(/Pilotkunde|Rahmenvertrag/);
    expect(paketAenderungen(alt, alt)).toEqual([]);
    expect(paketAenderungen(null, neu).join("\n")).toMatch(/Paket klinik zugebucht/);
  });
  it("Quelltext: setzePaket schreibt ins Betreiberprotokoll, der Server protokolliert Änderungen", () => {
    const app = appQuelle();   // WP-39: Aktionen in src/app/aktionen/, gelesen samt App.jsx
    const i = app.indexOf("setzePaket: (mid, paket, an)");
    expect(i).toBeGreaterThan(0);
    expect(app.slice(i, i + 900)).toMatch(/bLog\(/);
    expect(quelle("../server/funktionen/daten.mjs")).toMatch(/paketAenderungen\(/);
  });
});

describe("N-F: Leitung und Kundenrolle bekommen vom Pilot nur seit und bis", () => {
  const SITZ = { leitung: { rolle: "leitung", person: "l1", betrieb: 0 }, kunde: { rolle: "kunde", person: "l1", betrieb: 0 } };
  const b = bestand({ preisgestaltung: { sonderpreis: 5, pilot: { ...PILOT, von: "Kennung-X" }, pilotHistorie: [{ ...H, von: "Kennung-Y" }] } });
  for (const [name, sitz] of Object.entries(SITZ)) {
    it(`${name}: weder Grund noch Betreiberkennung, der Pilot bleibt als Zeitraum erkennbar`, () => {
      const m = bestandFuerRolle(b, sitz).mandanten[0];
      const j = JSON.stringify(m.preisgestaltung);
      expect(j).not.toMatch(/Pilotkunde|Erster Pilot|Kennung-/);
      expect(m.preisgestaltung.pilot.seit).toBe(PILOT.seit);
      expect(m.preisgestaltung.pilotHistorie.map((h) => [h.seit, h.bis])).toEqual([[H.seit, H.bis]]);
      expect(m.preisgestaltung.sonderpreis).toBe(5);
      expect(pilotAktiv(m)).toBe(true);
      expect(pilotImZeitraum(m, "2026-05-01")).toBe(true);
    });
  }
  it("preisgestaltungFuerKunde: ohne Pilot unverändert, kein Objekt bleibt kein Objekt", () => {
    expect(preisgestaltungFuerKunde({ sonderpreis: 5 })).toEqual({ sonderpreis: 5 });
    expect(preisgestaltungFuerKunde(null)).toBe(null);
  });
  it("der Betreiber sieht alles", () => {
    expect(bestandFuerRolle(b, BETREIBER).mandanten[0].preisgestaltung.pilot).toEqual({ ...PILOT, von: "Kennung-X" });
  });
});

describe("R1: nur gespeicherte Einträge zu gebuchten Paketen gelten als unverändert (Altdaten, P5)", () => {
  it("Altdaten: Zustimmung zu einem nicht gebuchten Paket, Paket wird zugebucht → Servertag, nicht das alte Datum", () => {
    const alt = bestand({ pakete: [], paketZustimmungen: [Z("industrie", "2026-11-01")] });
    const m = put(alt, (x) => { x.pakete = ["industrie"]; x.preisgestaltung = { pilot: PILOT }; });
    expect(m.pakete).toEqual(["industrie"]);
    expect(m.paketZustimmungen).toEqual([Z("industrie", paketTag())]);
  });
  it("gebuchtes Paket: der gespeicherte Eintrag bleibt", () => {
    const alt = bestand({ pakete: ["industrie"], paketZustimmungen: [Z("industrie", "2026-11-01")] });
    expect(put(alt, (x) => { x.name = "Haus 2"; }).paketZustimmungen).toEqual([Z("industrie", "2026-11-01")]);
  });
});

describe("Doku und Texte", () => {
  it("RECHTEMATRIX.md führt paketZustimmungen/paketGrundlage (nur Betreiber)", () => {
    expect(quelle("../RECHTEMATRIX.md")).toMatch(/Billing: Zustimmungen und Grundlagen zu Paketen \(`paketZustimmungen`, `paketGrundlage`\)/);
  });
  it("Selbststart Pflege und Klinik: „im Pilot nach Freischaltung durch den Betreiber“", () => {
    const zeilen = quelle("../src/main.jsx").split("\n").filter((x) => /^\s*\["(pflege|klinik)", "/.test(x));
    expect(zeilen).toHaveLength(2);
    for (const z of zeilen) expect(z).toMatch(/im Pilot nach Freischaltung durch den Betreiber/);
  });
  it("Nachweis §7.6 dokumentiert N-A bis N-F, die Grenzregel und dass nur der Betreiber-Client rechnet", () => {
    const d = quelle("../docs/acc45/wp19-0b-nachweis.md");
    expect(d).toMatch(/### 7\.6 Nachtrag 3/);
    expect(d).toMatch(/Abrechnung läuft nur im Betreiber-Client/);
    expect(d).toMatch(/Server rechnet nicht nach/);
    expect(d).toMatch(/am 01\. eines Monats endet/);
  });
});
