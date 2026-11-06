/* ==========================================================================
   G9 — Nachtrag Review (WP-19.0b): Auflagen F1–F7

   F1  Pilot-Zubuchen („freigeschaltet, nicht berechnet"), kann() nur für nutzbare Merkmale,
       Selbststart bucht nie still zu, serverseitige Paketregel im Betreiber-PUT
   F2  Werbung folgt dem Zustand
   F3  Entscheidungslogik als reine Funktionen (src/paketlogik.js), Verhaltenstests
   F4  Prüfanzeige (pruefung.jsx) nutzt dieselbe Logik
   F6  Pilot-Wortlaut
   F7  echte PAKET_FREIGABEN sind gültig
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { appQuelle } from "./app-quelle.js";
import { STUFEN, PAKETE, paketeAngebot, buchbareAuswahl, paketkosten, preisFuer, stufeVon, branchenpaketeZeile, branchenpaketeHinweis,
  leistungenAnzeige, paketZustand } from "../src/stufen.js";
import { kannMerkmal, mandantPaketkosten, paketAufpreisSumme, paketPositionen, paketSchalten, pilotSetzen }
  from "../src/paketlogik.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { PAKET_MERKMALE, PAKET_FREIGABEN, SELBSTSTART_BUCHT_PAKET, merkmalNutzbar, paketeNachServerregel,
  paketZubuchenErlaubt, pruefePaketFreigaben, pilotAktiv, paketFuerNeubuchung } from "../server/lib/paketstand.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { BRANCHEN } from "../server/lib/branchen.mjs";
import { zusammenfuehren } from "../server/lib/rechte.mjs";

const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ABNAHME = { datum: "2026-12-01", nachweis: "docs/acc45/abnahme-test.md" };
const PAKET_IDS = ["sicherheit", "pflege", "klinik", "industrie"];
const PILOT = { seit: "2026-11-03", von: "Betreiber", grund: "Pilotkunde, Kernfunktionen kostenlos" };
const ST = "2027-01-01";   // Beginn des berechneten Zeitraums
const ZIEL = { sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 };
/** Zustimmungen des Kunden (vor dem Stichtag) zu den genannten Paketen. */
const zust = (ids, datum = "2026-12-20") => ({ paketZustimmungen: ids.map((paket) => ({ paket, datum, preis: ZIEL[paket], intervall: "monatlich", von: "Kunde" })) });
const FG = (stufe) => ({ stufe, datum: "2026-12-15", von: "Betreiber", nachweis: "docs/acc45/freigabe-test.md" });
const lage = (abgenommen = []) => BRANCHENMODULE.map((m) =>
  (m.pakete.some((p) => abgenommen.includes(p)) ? { ...m, status: "vorlaeufig", abnahme: ABNAHME, ausnahmeUi: true } : m));
const z5 = (id) => ({ liste: lage([id]), freigaben: { [id]: FG("buchbar") } });

/* ------------------------------ F1 ------------------------------------- */
describe("F1: heute nutzbare Merkmale (G10) — genaue Liste", () => {
  it("nutzbar sind genau diese Merkmale; alle zwölf Registry-Merkmale sind noch geplant", () => {
    const alle = [...new Set(Object.values(PAKET_MERKMALE).flat())];
    const nutzbar = alle.filter((m) => merkmalNutzbar(m));
    expect(nutzbar.filter((m) => !PAKET_MERKMALE.kern.includes(m)).sort())
      .toEqual(["fachkraftquote", "geofence", "sperreEigen", "uebergabe"]);
    expect(PAKET_MERKMALE.kern.every((m) => merkmalNutzbar(m))).toBe(true);
    const geplant = alle.filter((m) => !merkmalNutzbar(m)).sort();
    expect(geplant).toEqual(BRANCHENMODULE.map((m) => m.merkmal).sort());
    expect(geplant.length).toBe(12);
  });
});

describe("F1: Neukunde ohne Pilot — keine Buchung, keine Berechnung", () => {
  const mandant = (branche) => baueLeerenBetrieb({ name: "Test GmbH", branche, email: "a@b.de", land: "HE", raum: "r1" }).mandanten[0];

  it("Selbststart bucht unter Zustand 5 nichts zu — für jede Branche; die Konstante ist aus", () => {
    expect(SELBSTSTART_BUCHT_PAKET).toBe(false);
    for (const b of [...BRANCHEN.map((x) => x.id), "pflege", "klinik", "sicherheit", "industrie"]) {
      const m = mandant(b);
      expect(m.einstellungen.pakete, b).toEqual([]);
      expect(m.pakete, b).toBeUndefined();
      expect(mandantPaketkosten(m, 0).summe, b).toBe(0);
      expect(mandantPaketkosten(m, 0).zahlend, b).toEqual([]);
    }
  });

  it("auch bei Zustand 5 bucht der Selbststart nicht still zu (kein Verschenken, keine versteckte Buchung)", () => {
    for (const id of PAKET_IDS) {
      const { liste, freigaben } = z5(id);
      expect(paketeNachServerregel([], [], false, liste, freigaben)).toEqual([]);
    }
    expect(quelle("../server/lib/leerbetrieb.mjs")).toMatch(/paketFuerNeubuchung\(paketFuer\(br\)\)/);
  });

  it("ohne Buchung sind die Paketmerkmale nicht freigeschaltet; die Kernmerkmale immer", () => {
    for (const b of ["pflege", "klinik", "sicherheit", "industrie"]) {
      const m = mandant(b);
      for (const x of ["fachkraftquote", "uebergabe", "geofence", "wachbuch", "anlagen"]) expect(kannMerkmal(m, x), `${b} ${x}`).toBe(false);
      for (const x of PAKET_MERKMALE.kern) expect(kannMerkmal(m, x), `${b} ${x}`).toBe(true);
    }
  });
});

describe("F1: kann() — nutzbar bei gebuchtem Paket, geplant nie", () => {
  it("gebuchtes Paket schaltet seine NUTZBAREN Merkmale frei, geplante nie", () => {
    const pflege = { pakete: ["pflege"] };
    expect(kannMerkmal(pflege, "fachkraftquote")).toBe(true);
    expect(kannMerkmal(pflege, "uebergabe")).toBe(true);
    expect(kannMerkmal(pflege, "bereichsplan")).toBe(false);
    expect(kannMerkmal(pflege, "pflegequal")).toBe(false);
    const klinik = { pakete: ["klinik"] };
    expect(kannMerkmal(klinik, "uebergabe")).toBe(true);
    for (const x of ["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation"]) expect(kannMerkmal(klinik, x), x).toBe(false);
    const sich = { pakete: ["sicherheit"] };
    expect(kannMerkmal(sich, "geofence")).toBe(true);
    expect(kannMerkmal(sich, "sperreEigen")).toBe(true);
    for (const x of ["posten", "wachbuch", "objektbericht"]) expect(kannMerkmal(sich, x), x).toBe(false);
    for (const x of PAKET_MERKMALE.industrie) expect(kannMerkmal({ pakete: ["industrie"] }, x), x).toBe(false);
  });

  it("ein Merkmal eines anderen Pakets wird nicht frei (Sicherheit hat keine Fachkraftquote)", () => {
    expect(kannMerkmal({ pakete: ["sicherheit"] }, "fachkraftquote")).toBe(false);
    expect(kannMerkmal({ pakete: ["industrie"] }, "uebergabe")).toBe(false);
    expect(kannMerkmal({}, "plan")).toBe(true);
    expect(kannMerkmal(null, "plan")).toBe(true);
  });

  it("ein abgenommenes Modul wird mit gebuchtem Paket nutzbar, ohne Buchung nicht", () => {
    const liste = lage(["pflege"]);
    expect(kannMerkmal({ pakete: ["pflege"] }, "bereichsplan", liste)).toBe(true);
    expect(kannMerkmal({ pakete: [] }, "bereichsplan", liste)).toBe(false);
    expect(kannMerkmal({ pakete: ["klinik"] }, "bereichsplan", liste)).toBe(false);
  });

  it("App.jsx und die Prüfanzeige benutzen genau diese Funktion", () => {
    expect(appQuelle()).toMatch(/const kann = kannMerkmal;/);
    expect(quelle("../src/pruefung.jsx")).toMatch(/const kann = kannMerkmal;/);
  });
});

describe("F1: Pilot — Zubuchen unter Zustand 5, nichts wird berechnet", () => {
  const ohne = { pakete: [], preisgestaltung: {} };
  const pilot = { pakete: [], preisgestaltung: { pilot: PILOT } };

  it("ohne Pilot: Zubuchen unter Zustand 5 verweigert (mit Grund), für jedes Paket und jeden Zustand 1–4", () => {
    for (const id of PAKET_IDS) {
      const r = paketSchalten(ohne, id, true);
      expect(r.ok, id).toBe(false);
      expect(r.grund).toMatch(/Pilotbetrieb/);
      expect(paketZubuchenErlaubt(id, false)).toBe(false);
    }
  });

  it("ohne Pilot: ab Zustand 5 ist Zubuchen erlaubt", () => {
    for (const id of PAKET_IDS) {
      const { liste, freigaben } = z5(id);
      expect(paketSchalten(ohne, id, true, liste, freigaben)).toEqual({ ok: true, pakete: [id] });
    }
  });

  it("im Pilot: Zubuchen jedes Pakets möglich, Abschalten und Wiederzubuchen (versehentlich abgeschaltet)", () => {
    for (const id of PAKET_IDS) {
      const an = paketSchalten(pilot, id, true);
      expect(an, id).toEqual({ ok: true, pakete: [id] });
      const aus = paketSchalten({ ...pilot, pakete: an.pakete }, id, false);
      expect(aus).toEqual({ ok: true, pakete: [] });
      expect(paketSchalten({ ...pilot, pakete: aus.pakete }, id, true)).toEqual({ ok: true, pakete: [id] });
    }
  });

  it("Zubuchen doppelt ändert nichts; Kernplattform und Unbekanntes lassen sich nie zubuchen — auch nicht im Pilot", () => {
    expect(paketSchalten({ ...pilot, pakete: ["pflege"] }, "pflege", true).pakete).toEqual(["pflege"]);
    for (const x of ["kern", "unbekannt", "", undefined]) expect(paketSchalten(pilot, x, true).ok, String(x)).toBe(false);
  });

  it("Abschalten geht immer, auch ohne Pilot und unter Zustand 5; andere Pakete bleiben", () => {
    expect(paketSchalten({ pakete: ["pflege", "klinik"] }, "pflege", false)).toEqual({ ok: true, pakete: ["klinik"] });
    expect(paketSchalten({ pakete: [] }, "pflege", false)).toEqual({ ok: true, pakete: [] });
  });

  it("im Pilot gebucht heißt nutzbare Merkmale aktiv, geplante nie, und nichts wird berechnet", () => {
    for (const id of PAKET_IDS) {
      const m = { ...pilot, pakete: [id] };
      for (const x of PAKET_MERKMALE[id]) expect(kannMerkmal(m, x), `${id} ${x}`).toBe(merkmalNutzbar(x));
      for (const s of STUFEN) {
        const k = mandantPaketkosten(m, s.paketeFrei);
        expect(k.summe, `${id} ${s.id}`).toBe(0);
        expect(k.zahlend).toEqual([]);
        expect(k.nichtBerechnet.map((p) => p.id)).toEqual([id]);
        expect(k.gewaehlt.map((p) => p.id)).toEqual([id]);
      }
      expect(paketAufpreisSumme(m)).toBe(0);
    }
  });

  it("im Pilot wird auch ein Paket auf Zustand 5 nicht berechnet; ohne Pilot schon", () => {
    for (const id of PAKET_IDS) {
      const { liste, freigaben } = z5(id);
      const imPilot = mandantPaketkosten({ ...pilot, pakete: [id], ...zust([id]) }, 0, liste, freigaben, ST);
      expect(imPilot.summe).toBe(0);
      expect(imPilot.nichtBerechnet.map((p) => p.id)).toEqual([id]);
      const regulaer = mandantPaketkosten({ ...ohne, pakete: [id], ...zust([id]) }, 0, liste, freigaben, ST);
      expect(regulaer.summe).toBe(ZIEL[id]);
      expect(paketAufpreisSumme({ ...pilot, pakete: [id], ...zust([id]) }, liste, freigaben, ST)).toBe(0);
      expect(paketAufpreisSumme({ ...ohne, pakete: [id], ...zust([id]) }, liste, freigaben, ST)).toBe(regulaer.summe);
    }
  });

  it("pilotSetzen: Betreiber und Datum, Beenden entfernt es; übrige Preisgestaltung bleibt", () => {
    const m = { preisgestaltung: { sonderpreis: 99 } };
    const an = pilotSetzen(m, true, "2026-11-04", " Pilotkunde ");
    expect(an).toEqual({ sonderpreis: 99, pilot: { seit: "2026-11-04", von: "Betreiber", grund: "Pilotkunde" } });
    expect(pilotAktiv({ preisgestaltung: an })).toBe(true);
    const aus = pilotSetzen({ preisgestaltung: an }, false, "2026-11-05");
    /* Nachtrag 2 (M5): Beenden entfernt den laufenden Pilot und hält den Zeitraum in der Historie fest. */
    expect(aus).toEqual({ sonderpreis: 99,
      pilotHistorie: [{ seit: "2026-11-04", bis: "2026-11-05", von: "Betreiber", grund: "Pilotkunde" }] });
    expect(pilotAktiv({ preisgestaltung: aus })).toBe(false);
    expect(m.preisgestaltung).toEqual({ sonderpreis: 99 });   // Eingabe unverändert
    expect(pilotSetzen({}, true, "2026-11-04", "x").pilot.seit).toBe("2026-11-04");
    for (const g of [undefined, "", "  ", 5]) expect(pilotSetzen({}, true, "2026-11-04", g), String(g)).toBeNull();   // Pflichtgrund
  });
});

/* ------------------------------ F3 ------------------------------------- */
describe("F3: Rechnung und Preis — Verhalten statt Quelltext", () => {
  const rechnung = (m0, paketeFrei, liste, freigaben) => {
    const m = m0.ohneZustimmung ? m0 : { ...zust(m0.pakete || []), ...m0 };
    const k = mandantPaketkosten(m, paketeFrei, liste, freigaben, ST);
    return paketPositionen({ pakete: k.gewaehlt, paketeFrei: k.frei, paketeNichtBerechnet: k.nichtBerechnet, anteil: 1 },
      (x) => `${x} €`);
  };

  it("ein nicht berechnetes Paket (Zustand < 5) erzeugt keine Rechnungsposition", () => {
    for (const id of PAKET_IDS) expect(rechnung({ pakete: [id] }, 0), id).toEqual([]);
  });

  it("im Pilot erzeugt auch ein Paket auf Zustand 5 keine Position", () => {
    for (const id of PAKET_IDS) {
      const { liste, freigaben } = z5(id);
      expect(rechnung({ pakete: [id], preisgestaltung: { pilot: PILOT } }, 0, liste, freigaben), id).toEqual([]);
    }
  });

  it("Zustand 5 ohne Pilot: eine Position mit Zielpreis; anteilig gerechnet", () => {
    const { liste, freigaben } = z5("pflege");
    expect(rechnung({ pakete: ["pflege"] }, 0, liste, freigaben)).toEqual([
      { text: "Branchenpaket Pflege und Rettungsdienst", menge: "", einzel: "89 €", betrag: "89 €" }]);
    const k = mandantPaketkosten({ pakete: ["pflege"], ...zust(["pflege"]) }, 0, liste, freigaben, ST);
    const halb = paketPositionen({ pakete: k.gewaehlt, paketeFrei: k.frei, paketeNichtBerechnet: k.nichtBerechnet, anteil: 0.5 }, (x) => x);
    expect(halb[0]).toMatchObject({ einzel: 89, betrag: 44.5 });
  });

  it("Enterprise-Freiplätze: die zwei teuersten sind frei (Position mit null), der Rest zahlt; ein unfertiges belegt keinen Platz", () => {
    const liste = lage(["pflege", "klinik", "sicherheit"]);
    const freigaben = { pflege: FG("buchbar"), klinik: FG("buchbar"), sicherheit: FG("buchbar") };
    const m = { pakete: ["industrie", "sicherheit", "pflege", "klinik"] };
    const pos = rechnung(m, 2, liste, freigaben);
    expect(pos.map((p) => p.text)).toEqual(["Branchenpaket Klinik (in der Stufe enthalten)",
      "Branchenpaket Pflege und Rettungsdienst (in der Stufe enthalten)", "Branchenpaket Sicherheitsdienst"]);
    expect(pos.map((p) => p.betrag)).toEqual(["0 €", "0 €", "79 €"]);
    const mz = { ...m, ...zust(m.pakete) };
    expect(mandantPaketkosten(mz, 2, liste, freigaben, ST).summe).toBe(79);
    // Industrie (Zustand 1) bleibt gebucht, kostet nichts und steht nicht auf der Rechnung
    expect(mandantPaketkosten(mz, 2, liste, freigaben, ST).gewaehlt.map((p) => p.id)).toContain("industrie");
  });

  it("Rechenwege und Zielpreise unverändert (Gesamtpreis über preisFuer)", () => {
    const { liste, freigaben } = z5("klinik");
    expect(preisFuer(stufeVon("pro"), 1, [10], ["klinik"], liste, freigaben).summePakete).toBe(129);
    expect(preisFuer(stufeVon("pro"), 1, [10], ["klinik"], liste, freigaben, true).summePakete).toBe(0);
    expect(preisFuer(stufeVon("enterprise"), 1, [10], ["klinik"], liste, freigaben).summePakete).toBe(0);
    expect(Object.fromEntries(PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis])))
      .toEqual({ sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 });
  });
});

/* ------------------------------ Server --------------------------------- */
describe("F1: serverseitige Paketregel im Betreiber-PUT", () => {
  it("paketeNachServerregel: Entfernen immer; Zubuchen nur Zustand 5 oder Pilot; Unbekanntes nie; Altbestand bleibt", () => {
    expect(paketeNachServerregel(["industrie"], ["industrie", "pflege"], false)).toEqual(["industrie"]);
    expect(paketeNachServerregel(["industrie"], ["industrie", "pflege"], true)).toEqual(["industrie", "pflege"]);
    expect(paketeNachServerregel(["industrie", "pflege"], ["pflege"], false)).toEqual(["pflege"]);
    expect(paketeNachServerregel(["industrie"], [], false)).toEqual([]);
    expect(paketeNachServerregel([], ["kern", "x", 5, null], true)).toEqual([]);
    expect(paketeNachServerregel(["industrie"], "pflege", true)).toEqual(["industrie"]);
    expect(paketeNachServerregel(undefined, ["pflege"], false)).toEqual([]);
    const { liste, freigaben } = z5("pflege");
    expect(paketeNachServerregel([], ["pflege", "klinik"], false, liste, freigaben)).toEqual(["pflege"]);
  });

  const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], email: `${id}@x.de` });
  const bestand = (m = {}) => ({ version: 9, stand: 1, session: null, betreiber: {}, tarife: [], rechnungen: [], protokoll: [],
    pakete: [], adressaenderungen: [], selbststarts: [],
    mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
      personen: [person("l1", "leitung", "ALLE")],
      abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [], status: "aktiv", tarif: "pro",
      preisgestaltung: {}, pakete: ["industrie"], selbstAngelegt: false, ...m }] });
  const BETREIBER = { rolle: "betreiber", person: null, betrieb: 0 };
  const put = (alt, aendern) => {
    const u = JSON.parse(JSON.stringify(alt));
    aendern(u.mandanten[0]);
    return zusammenfuehren(alt, u, BETREIBER).mandanten[0];
  };

  it("ohne Pilot bleibt der gespeicherte Stand; ein Zubuchen unter Zustand 5 wird nicht übernommen", () => {
    const m = put(bestand(), (x) => { x.pakete = ["industrie", "pflege", "klinik"]; });
    expect(m.pakete).toEqual(["industrie"]);
  });

  it("mit gespeichertem Pilot wird das Zubuchen übernommen (Betreiber-Aktion)", () => {
    const m = put(bestand({ preisgestaltung: { pilot: PILOT } }), (x) => { x.pakete = ["industrie", "pflege"]; });
    expect(m.pakete).toEqual(["industrie", "pflege"]);
  });

  it("Pilot und Zubuchen im selben PUT gelten; Pilot beenden und Zubuchen im selben PUT nicht", () => {
    expect(put(bestand(), (x) => { x.preisgestaltung = { pilot: PILOT }; x.pakete = ["industrie", "klinik"]; }).pakete)
      .toEqual(["industrie", "klinik"]);
    expect(put(bestand({ preisgestaltung: { pilot: PILOT } }), (x) => { x.preisgestaltung = {}; x.pakete = ["industrie", "klinik"]; }).pakete)
      .toEqual(["industrie"]);
  });

  it("Abschalten geht ohne Pilot; ein versehentlich abgeschaltetes Paket lässt sich nur im Pilot wieder zubuchen", () => {
    expect(put(bestand(), (x) => { x.pakete = []; }).pakete).toEqual([]);
    const ohneSchalter = bestand({ pakete: [] });
    expect(put(ohneSchalter, (x) => { x.pakete = ["industrie"]; }).pakete).toEqual([]);
    expect(put(bestand({ pakete: [], preisgestaltung: { pilot: PILOT } }), (x) => { x.pakete = ["industrie"]; }).pakete)
      .toEqual(["industrie"]);
  });

  it("ein neu angelegter Betrieb kommt ohne Pilot nicht mit Paketen an", () => {
    const alt = bestand();
    const u = JSON.parse(JSON.stringify(alt));
    u.mandanten.push({ id: "m2", name: "Neu", pakete: ["pflege", "klinik"], preisgestaltung: {} });
    const e = zusammenfuehren(alt, u, BETREIBER);
    expect(e.mandanten[1].pakete).toEqual([]);
    u.mandanten[1].preisgestaltung = { pilot: PILOT };
    expect(zusammenfuehren(alt, u, BETREIBER).mandanten[1].pakete).toEqual(["pflege", "klinik"]);
  });

  it("rechte.mjs ruft die Regel im Betreiberpfad auf (Quelltext)", () => {
    const r = quelle("../server/lib/rechte.mjs");
    /* Nachtrag 2: die Regel steht in paketstand.mjs (paketfelderGeprueft), rechte.mjs ruft sie auf. */
    expect(quelle("../server/lib/paketstand.mjs")).toMatch(/paketeNachServerregel\(altM \? altM\.pakete : \[\], m\.pakete, pilotAktiv\(m\)\)/);
    expect(r).toMatch(/const paketeGeprueft = \(m0, altM\) => paketfelderGeprueft\(m0, altM\);/);
    expect(r).toMatch(/return paketeGeprueft\(zusammen, alt\);/);
  });
});

/* ------------------------------ F2 ------------------------------------- */
describe("F2: Werbung folgt dem Zustand — kein „enthalten“ unter Zustand 5", () => {
  it("heute (alle Pakete Zustand 1): Leistungszeile und Hinweis sagen „sobald verfügbar“, nicht „enthalten“", () => {
    for (const id of PAKET_IDS) expect(paketZustand(id)).toBe(1);
    const ent = STUFEN.find((s) => s.id === "enterprise");
    expect(ent.leistungen.join(" | ")).not.toMatch(/enthalten/);
    expect(ent.leistungen).toContain("Zwei Branchenpakete – sobald verfügbar");
    expect(branchenpaketeZeile()).toBe("Zwei Branchenpakete – sobald verfügbar");
    expect(branchenpaketeHinweis()).not.toMatch(/enthalten/);
    expect(branchenpaketeHinweis()).toMatch(/in Vorbereitung/);
    for (const s of STUFEN) expect(s.leistungen.join(" | "), s.id).not.toMatch(/Branchenpakete? enthalten/);
  });

  it("ein älterer gespeicherter Tariftext wird bei der Anzeige angeglichen", () => {
    const alt = ["Alles aus Business", "Zwei Branchenpakete enthalten", "Bevorzugter Rückruf"];
    expect(leistungenAnzeige(alt)).toEqual(["Alles aus Business", "Zwei Branchenpakete – sobald verfügbar", "Bevorzugter Rückruf"]);
    expect(leistungenAnzeige(undefined)).toEqual([]);
  });

  it("sobald ein Paket Zustand 5 hat, steht es wie bisher da", () => {
    const { liste, freigaben } = z5("pflege");
    expect(branchenpaketeZeile(liste, freigaben)).toBe("Zwei Branchenpakete enthalten");
    expect(branchenpaketeHinweis(liste, freigaben)).toMatch(/In Enterprise sind zwei Pakete enthalten/);
    expect(leistungenAnzeige(["Zwei Branchenpakete – sobald verfügbar"], liste, freigaben)).toEqual(["Zwei Branchenpakete enthalten"]);
  });

  it("die Oberflächen rendern die Zeile über die Anzeigefunktion; kein fester „enthalten“-Text mehr in main.jsx/App.jsx", () => {
    const main = quelle("../src/main.jsx");
    const app = appQuelle();
    expect(main).not.toMatch(/In Enterprise sind zwei/);
    expect(main).toMatch(/branchenpaketeHinweis\(\)/);
    expect(main).toMatch(/leistungenAnzeige\(a\.stufe\.leistungen\)/);
    expect(app).toMatch(/leistungenAnzeige\(a\.stufe\.leistungen\)/);
    expect(app).toMatch(/leistungenAnzeige\(p\.t\.leistungen\)/);
    expect(app).toMatch(/leistungenAnzeige\(t\.leistungen\)/);
    expect(main + app).not.toMatch(/Zwei Branchenpakete enthalten/);
    expect(quelle("../src/pruefung.jsx")).not.toMatch(/"Zwei Branchenpakete enthalten"/);
  });

  it("Selbststart-Texte: Pflege und Klinik bewerben nur Nutzbares, Geplantes steht „in Vorbereitung“", () => {
    const zeilen = quelle("../src/main.jsx").split("\n").filter((z) => /^\s*\["(sicherheit|pflege|klinik|industrie|sonstige)", "/.test(z));
    const pflege = zeilen.find((z) => /"pflege"/.test(z));
    expect(pflege).toMatch(/Wohnbereichsplanung in Vorbereitung/);
    expect(pflege).not.toMatch(/Wohnbereiche"/);
    expect(pflege).toMatch(/Fachkraftquote/);
    expect(zeilen.find((z) => /"klinik"/.test(z))).toMatch(/Bereitschaft, Rufbereitschaft, geteilte Dienste in Vorbereitung/);
  });
});

/* ------------------------------ F4 ------------------------------------- */
describe("F4: Prüfanzeige (pruefung.jsx) — dieselbe Logik", () => {
  const pruef = quelle("../src/pruefung.jsx");
  it("preis() kennt Pilot und Freiplätze über mandantPaketkosten; Rechnung ohne nicht berechnete Pakete", () => {
    expect(pruef).toMatch(/import \{ kannMerkmal, mandantPaketkosten, paketPositionen \} from "\.\/paketlogik\.js"/);
    expect(pruef).toMatch(/const pk = mandantPaketkosten\(m, \(t && t\.paketeFrei\) \|\| 0\);/);
    expect(pruef).toMatch(/paketeFrei: pk\.frei, paketeNichtBerechnet: pk\.nichtBerechnet/);
    expect(pruef).toMatch(/positionen\.push\(\.\.\.paketPositionen\(p, eur\)\);/);
    expect(pruef).not.toMatch(/for \(const pk of p\.pakete\)\s*positionen/);
    expect(pruef).not.toMatch(/paketBuchbar/);
  });
});

/* ------------------------------ F6 ------------------------------------- */
describe("F6: Pilot-Wortlaut — Pilot ist ein Paket-Nullsatz, keine Gesamtkostenlosigkeit", () => {
  it("die Konsole sagt, dass übrige Positionen laut Vertrag weiterlaufen; kein „Kostenlos, mit eingeschränktem Umfang“", () => {
    const app = appQuelle().replace(/\s+/g, " ");
    expect(app).not.toMatch(/Kostenlos, mit eingeschränktem Umfang/);
    expect(app).toMatch(/Branchenpakete werden im Pilot nicht berechnet; alle übrigen Positionen laufen laut Vertrag weiter/);
    expect(app).toMatch(/Grundgebühr, Planer, Standorte/);
    expect(app).toMatch(/Pilot – freigeschaltet, nicht berechnet/);
  });

  it("Pilot ändert die Grundgebühr nicht: Gesamtpreis nur um die Paketsumme niedriger", () => {
    const { liste, freigaben } = z5("klinik");
    const regulaer = preisFuer(stufeVon("basis"), 2, [20], ["klinik"], liste, freigaben);
    const imPilot = preisFuer(stufeVon("basis"), 2, [20], ["klinik"], liste, freigaben, true);
    expect(imPilot.gesamt).toBe(regulaer.gesamt - 129);
    expect(imPilot.stufe.grund).toBe(89);
  });
});

/* ------------------------------ F7 ------------------------------------- */
describe("F7: die echten PAKET_FREIGABEN sind gültig", () => {
  it("pruefePaketFreigaben mit den echten Konstanten und der echten Registry meldet nichts", () => {
    expect(pruefePaketFreigaben(PAKET_FREIGABEN, BRANCHENMODULE)).toEqual([]);
    expect(pruefePaketFreigaben()).toEqual([]);
    for (const [id, f] of Object.entries(PAKET_FREIGABEN)) {
      expect(PAKET_MERKMALE[id], id).toBeDefined();
      expect(["kunden", "buchbar"]).toContain(f.stufe);
    }
  });

  it("die Prüfung schlägt bei einer ungültigen Freigabe an (die Prüfung prüft wirklich)", () => {
    expect(pruefePaketFreigaben({ pflege: FG("buchbar") }, BRANCHENMODULE)).toHaveLength(1);
    expect(pruefePaketFreigaben({ kern: FG("buchbar") }, BRANCHENMODULE)).toHaveLength(1);
    expect(pruefePaketFreigaben({ pflege: { stufe: "buchbar" } }, lage(["pflege"]))).toHaveLength(1);
  });
});

/* ===== Betreiberentscheidungen 2026-11-03: Abrechnungsgrund, Pilot mit Grund, eine Freigabequelle ===== */
import { abrechnungsGrund, zustimmungGueltig, grundlageGueltig, zustimmungenBereinigen, grundlageBereinigen,
  paketAnzeige } from "../server/lib/paketstand.mjs";
import { zustimmungErfassen } from "../src/paketlogik.js";

describe("Abrechnung nur mit Zustand 5 UND Abrechnungsgrund (Zustimmung oder Vertragsgrundlage)", () => {
  /* Nachtrag 2 (M2): die Vertragsgrundlage steht je Paket mit Preis und Intervall. */
  const GRUNDLAGE = { paket: "klinik", datum: "2026-12-01", preis: 129, intervall: "monatlich", von: "Betreiber",
    notiz: "AGB § 4 Abs. 4, Prüfvermerk 2026-12-01" };

  it("Zustand 5, gebucht, ohne Grund: nicht berechnet, Hinweis „Zustimmung erforderlich“, keine Position", () => {
    for (const id of PAKET_IDS) {
      const { liste, freigaben } = z5(id);
      const k = mandantPaketkosten({ pakete: [id] }, 0, liste, freigaben, ST);
      expect(k.summe, id).toBe(0);
      expect(k.zahlend).toEqual([]);
      expect(k.ohneGrund.map((p) => p.id)).toEqual([id]);
      expect(k.nichtBerechnet.map((p) => p.id)).toEqual([id]);
      expect(paketPositionen({ pakete: k.gewaehlt, paketeFrei: k.frei, paketeNichtBerechnet: k.nichtBerechnet, anteil: 1 })).toEqual([]);
      expect(paketAufpreisSumme({ pakete: [id] }, liste, freigaben, ST)).toBe(0);
      expect(paketAnzeige(id, { zustimmungFehlt: true, liste, freigaben })).toBe("Zustimmung erforderlich – nicht berechnet.");
    }
  });

  it("Zustimmung (a) ODER Vertragsgrundlage (b) öffnet die Berechnung; ein anderes Paket bleibt zu", () => {
    const { liste, freigaben } = z5("klinik");
    expect(mandantPaketkosten({ pakete: ["klinik"], ...zust(["klinik"]) }, 0, liste, freigaben, ST).summe).toBe(129);
    expect(mandantPaketkosten({ pakete: ["klinik"], paketGrundlage: [GRUNDLAGE] }, 0, liste, freigaben, ST).summe).toBe(129);
    expect(abrechnungsGrund({ paketGrundlage: [GRUNDLAGE] }, "klinik", ST, 129)).toBe("vertrag");
    expect(abrechnungsGrund({ ...zust(["klinik"]) }, "klinik", ST, 129)).toBe("zustimmung");
    expect(abrechnungsGrund({ ...zust(["pflege"]) }, "klinik", ST, 129)).toBeNull();
    expect(mandantPaketkosten({ pakete: ["klinik"], ...zust(["pflege"]) }, 0, liste, freigaben, ST).summe).toBe(0);
  });

  it("Bestandsbetriebe ohne Grund werden auch bei Zustand 5 nicht berechnet; im Pilot nichts, auch mit Grund", () => {
    const { liste, freigaben } = z5("pflege");
    const bestand = { pakete: ["pflege", "klinik"], preisgestaltung: {} };
    expect(mandantPaketkosten(bestand, 0, liste, freigaben, ST).summe).toBe(0);
    const imPilot = { ...bestand, preisgestaltung: { pilot: PILOT }, ...zust(["pflege"]) };
    const k = mandantPaketkosten(imPilot, 0, liste, freigaben, ST);
    expect(k.summe).toBe(0);
    expect(k.ohneGrund).toEqual([]);
  });

  it("keine rückwirkende Berechnung: der Grund zählt nur für Zeiträume NACH seinem Datum", () => {
    const { liste, freigaben } = z5("pflege");
    const m = { pakete: ["pflege"], ...zust(["pflege"], "2026-12-20") };
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2026-12-01").summe).toBe(0);   // Monat vor der Zustimmung
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2026-12-20").summe).toBe(0);   // am Tag selbst noch nicht
    expect(mandantPaketkosten(m, 0, liste, freigaben, "2027-01-01").summe).toBe(89);
    expect(abrechnungsGrund({ paketGrundlage: [{ ...GRUNDLAGE, paket: "pflege", preis: 89, datum: "2027-02-01" }] }, "pflege", "2027-01-01", 89)).toBeNull();
    expect(abrechnungsGrund({ paketGrundlage: [{ ...GRUNDLAGE, paket: "pflege", preis: 89, datum: "2026-12-31" }] }, "pflege", "2027-01-01", 89)).toBe("vertrag");
    expect(abrechnungsGrund(m, "pflege", undefined, 89)).toBeNull();
  });

  it("Formprüfung: unvollständige Zustimmungen und Grundlagen zählen nicht", () => {
    const gut = { paket: "pflege", datum: "2026-12-20", preis: 89, intervall: "monatlich", von: "Kunde" };
    expect(zustimmungGueltig(gut, "pflege")).toBe(true);
    for (const k of [{ ...gut, datum: "morgen" }, { ...gut, preis: 0 }, { ...gut, preis: "89" }, { ...gut, intervall: "" },
      { ...gut, intervall: "einmalig" }, { ...gut, von: " " }, { ...gut, paket: "kern" }, null, "ja"])
      expect(zustimmungGueltig(k, k && k.paket === "kern" ? "kern" : "pflege"), JSON.stringify(k)).toBe(false);
    expect(zustimmungGueltig(gut, "klinik")).toBe(false);
    expect(grundlageGueltig(GRUNDLAGE, "klinik")).toBe(true);
    expect(grundlageGueltig(GRUNDLAGE, "pflege")).toBe(false);
    for (const g of [{ ...GRUNDLAGE, notiz: "" }, { ...GRUNDLAGE, von: "" }, { ...GRUNDLAGE, datum: "x" }, { ...GRUNDLAGE, preis: 0 },
      { ...GRUNDLAGE, intervall: "einmalig" }, true, null])
      expect(grundlageGueltig(g, "klinik"), JSON.stringify(g)).toBe(false);
  });

  it("zustimmungErfassen: Paket, Preis, Intervall, Datum, Bestätiger; nur für gebuchtes Zustand-5-Paket", () => {
    const { liste, freigaben } = z5("klinik");
    const r = zustimmungErfassen({ pakete: ["klinik"] }, "klinik", "2026-12-20", " Betreiber ", liste, freigaben);
    expect(r).toEqual({ ok: true, eintrag: { paket: "klinik", datum: "2026-12-20", preis: 129, intervall: "monatlich", von: "Betreiber" } });
    expect(zustimmungGueltig(r.eintrag, "klinik")).toBe(true);
    expect(zustimmungErfassen({ pakete: [] }, "klinik", "2026-12-20", "B", liste, freigaben).ok).toBe(false);
    expect(zustimmungErfassen({ pakete: ["klinik"] }, "klinik", "2026-12-20", "", liste, freigaben).ok).toBe(false);
    expect(zustimmungErfassen({ pakete: ["pflege"] }, "pflege", "2026-12-20", "B", liste, freigaben).ok).toBe(false);   // Zustand 1
    expect(zustimmungErfassen({ pakete: ["kern"] }, "kern", "2026-12-20", "B").ok).toBe(false);
  });

  it("Server: der Betreiber-PUT behält nur formgültige Zustimmungen/Grundlagen; Betriebsrollen schreiben sie nie", () => {
    const gut = { paket: "pflege", datum: "2026-12-20", preis: 89, intervall: "monatlich", von: "Kunde", extra: "x" };
    expect(zustimmungenBereinigen([gut, { ...gut, preis: 0 }, { ...gut, paket: "klinik", preis: 129 }, { ...gut }]))
      .toEqual([{ paket: "pflege", datum: "2026-12-20", preis: 89, intervall: "monatlich", von: "Kunde" },
        { paket: "klinik", datum: "2026-12-20", preis: 129, intervall: "monatlich", von: "Kunde" }]);
    expect(zustimmungenBereinigen("x")).toEqual([]);
    expect(grundlageBereinigen([{ ...GRUNDLAGE, x: 1 }])).toEqual([GRUNDLAGE]);
    expect(grundlageBereinigen([{ datum: "x" }])).toEqual([]);
    expect(grundlageBereinigen({ ...GRUNDLAGE })).toEqual([]);   // keine Liste
    const alt = { version: 9, stand: 1, session: null, betreiber: {}, tarife: [], rechnungen: [], protokoll: [], pakete: [],
      adressaenderungen: [], selbststarts: [],
      mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1" }], dienstarten: [], personen: [{ id: "l1", vorname: "V", nachname: "N",
        rolle: "leitung", bereich: "ALLE", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "ALLE" }], email: "l@x.de" }],
        abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [], status: "aktiv", tarif: "pro", preisgestaltung: {}, pakete: ["pflege"],
        selbstAngelegt: false }] };   // Nachtrag 2 (M1): Zustimmungen zählen nur für gebuchte Pakete
    const u = JSON.parse(JSON.stringify(alt));
    u.mandanten[0].paketZustimmungen = [gut, { paket: "pflege" }];
    u.mandanten[0].paketGrundlage = { datum: "2026-12-01", von: "B" };
    const b = zusammenfuehren(alt, u, { rolle: "betreiber", person: null, betrieb: 0 }).mandanten[0];
    expect(b.paketZustimmungen).toHaveLength(1);
    expect(b.paketZustimmungen[0].extra).toBeUndefined();
    expect(b.paketGrundlage).toBeUndefined();
    const l = zusammenfuehren(alt, u, { rolle: "leitung", person: "l1", betrieb: 0 }).mandanten[0];
    expect(l.paketZustimmungen).toBeUndefined();
    expect(l.paketGrundlage).toBeUndefined();
  });

  it("Rechnungslogik: nirgends wird ein Paket ohne den gemeinsamen Weg berechnet (Quelltext)", () => {
    const app = appQuelle();
    expect(app).not.toMatch(/\bpaketkosten\(/);
    expect(app).not.toMatch(/paketBuchbar\(p\.id\)\)\s*\.reduce/);
    expect(quelle("../src/pruefung.jsx")).not.toMatch(/\bpaketkosten\(/);
    expect(quelle("../src/paketlogik.js")).toMatch(/\(id\) => abrechnungsGrund\(m, id, stichtag, aufpreisVon\(id\)\) !== null/);
  });
});

describe("Pilot: gesonderte Betreiberentscheidung je Betrieb mit Pflichtgrund", () => {
  it("kein Standard- und kein Migrationspfad setzt einen Pilot", () => {
    for (const b of [...BRANCHEN.map((x) => x.id), "pflege", "klinik"]) {
      const m = baueLeerenBetrieb({ name: "T GmbH", branche: b, email: "a@b.de", land: "HE", raum: "r" }).mandanten[0];
      expect(pilotAktiv(m), b).toBe(false);
      expect(m.preisgestaltung && m.preisgestaltung.pilot, b).toBeUndefined();
    }
    for (const f of ["../src/migration.js", "../server/lib/leerbetrieb.mjs", "../server/lib/erstbefuellung.mjs"])
      expect(quelle(f), f).not.toMatch(/pilot/i);
    const app = appQuelle();
    expect(app).toMatch(/Grund für den Pilotbetrieb \(Pflicht, wird protokolliert\)/);
    expect(app).toMatch(/Ohne Grund kein Pilotbetrieb/);
  });
});

describe("Eine verbindliche Freigabequelle für alle Pfade (PAKET_FREIGABEN, server/lib/paketstand.mjs)", () => {
  const PFADE = { "server/lib/rechte.mjs": "../server/lib/rechte.mjs", "server/lib/leerbetrieb.mjs": "../server/lib/leerbetrieb.mjs",
    "src/stufen.js": "../src/stufen.js", "src/paketlogik.js": "../src/paketlogik.js", "src/App.jsx": "../src/App.jsx",
    "src/main.jsx": "../src/main.jsx", "src/pruefung.jsx": "../src/pruefung.jsx" };

  it("die Freigabekonstante und Zustandsableitung stehen nur in paketstand.mjs; kein Pfad hat eine eigene Kopie", () => {
    for (const [name, p] of Object.entries(PFADE)) {
      const q = quelle(p);
      expect(q, name).not.toMatch(/(const|let|var)\s+PAKET_FREIGABEN\s*=/);
      expect(q, name).not.toMatch(/stufe:\s*"(buchbar|kunden)"/);
      expect(q, name).not.toMatch(/(const|let|var|function)\s+(paketZustand|paketBuchbar|pilotAktiv|abrechnungsGrund)\b/);
    }
    expect(quelle("../server/lib/paketstand.mjs")).toMatch(/export const PAKET_FREIGABEN = Object\.freeze\(\{\}\);/);
  });

  it("jeder Pfad liest den Stand über dasselbe Modul (Import oder die Module, die es importieren)", () => {
    expect(quelle("../server/lib/rechte.mjs")).toMatch(/from "\.\/paketstand\.mjs"/);
    expect(quelle("../server/lib/leerbetrieb.mjs")).toMatch(/paketFuerNeubuchung/);
    expect(quelle("../src/stufen.js")).toMatch(/from "\.\.\/server\/lib\/paketstand\.mjs"/);
    expect(quelle("../src/paketlogik.js")).toMatch(/from "\.\.\/server\/lib\/paketstand\.mjs"/);
    expect(appQuelle()).toMatch(/from "\.\/stufen\.js"/);
    expect(appQuelle()).toMatch(/from "\.\/paketlogik\.js"/);
    expect(quelle("../src/main.jsx")).toMatch(/paketeAngebot[\s\S]*from "\.\/stufen\.js"/);
    expect(quelle("../src/pruefung.jsx")).toMatch(/from "\.\/paketlogik\.js"/);
  });

  it("Verhalten: eine injizierte Freigabe wirkt in Angebot, Auswahl, Kosten, Zubuchen und Serverregel gleich", () => {
    const { liste, freigaben } = z5("pflege");
    const m = { pakete: [], ...zust(["pflege"]) };
    expect(paketeAngebot(liste, freigaben).find((p) => p.id === "pflege")).toMatchObject({ buchbar: true, aufpreis: 89 });
    expect(buchbareAuswahl(["pflege", "klinik"], liste, freigaben)).toEqual(["pflege"]);
    expect(paketSchalten(m, "pflege", true, liste, freigaben).ok).toBe(true);
    expect(paketSchalten(m, "klinik", true, liste, freigaben).ok).toBe(false);
    expect(paketeNachServerregel([], ["pflege", "klinik"], false, liste, freigaben)).toEqual(["pflege"]);
    expect(mandantPaketkosten({ ...m, pakete: ["pflege"] }, 0, liste, freigaben, ST).summe).toBe(89);
    expect(paketFuerNeubuchung("pflege", liste, freigaben)).toBeNull();   // Selbststart bucht nie still zu
  });
});
