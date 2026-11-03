/* ==========================================================================
   G9 — Nichts verkaufen, was nicht abgenommen und freigegeben ist (WP-19.0b)

   Betreiberentscheidung G9 (2026-11-03): Die Zielpreise bleiben (79/89/129/59),
   aber ein Branchenpaket ist erst regulär buchbar und abrechenbar, wenn der
   angebotene Funktionsumfang tatsächlich verfügbar und technisch abgenommen
   ist. Fünf Paketzustände:
     1 geplant · 2 technisch implementiert · 3 getestet und abgenommen ·
     4 für Kunden freigegeben · 5 buchbar und abrechenbar.
   Nur Zustand 5 darf beworben, gewählt, gebucht und berechnet werden.
   Ausdrücklich erlaubt: kostenloser Pilot (Betriebsmerkmal, nur Betreiber).

   G10: ein bereits gebuchtes Paket wird nie gelöscht; ein Bestandsbetrieb
   verliert keine bestehende Funktion. Preisliste (src/preisgestaltung.js) und
   Paketpreise bleiben unberührt. Zahlung/Checkout ist ausgenommen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STUFEN, stufeVon, PAKETE, paketkosten, preisFuer, paketeAngebot, buchbareAuswahl,
  paketNutzbar, merkmalNutzbar, paketZustand, paketBuchbar, paketAnzeige, pilotAktiv } from "../src/stufen.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { PAKET_MERKMALE, PAKET_FREIGABEN, PAKET_ZUSTAENDE, paketFuerNeubuchung, merkmaleInVorbereitung,
  pruefePaketFreigaben } from "../server/lib/paketstand.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { BRANCHEN } from "../server/lib/branchen.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ABNAHME = { datum: "2026-12-01", nachweis: "docs/acc45/abnahme-test.md" };
const PAKET_IDS = ["sicherheit", "pflege", "klinik", "industrie"];
const ZIELPREISE = { sicherheit: 79, pflege: 89, klinik: 129, industrie: 59 };

/** Registry, in der die Module der genannten Pakete (oder die genannten Module) so weit sind. */
const lage = ({ impl = [], abgenommen = [] } = {}) => BRANCHENMODULE.map((m) => {
  if (m.pakete.some((p) => abgenommen.includes(p))) return { ...m, status: "vorlaeufig", abnahme: ABNAHME };
  if (m.pakete.some((p) => impl.includes(p))) return { ...m, status: "vorlaeufig" };   // ohne Abnahmenachweis
  return m;
});
const FG = (stufe) => ({ stufe, datum: "2026-12-15", von: "Betreiber", nachweis: "docs/acc45/freigabe-test.md" });
/** Die fünf Zustände für ein Paket: [Registry-Lage, Freigaben, erwarteter Zustand]. */
const ZUSTAND = (id) => ({
  1: [lage(), {}],
  2: [lage({ impl: [id] }), {}],
  3: [lage({ abgenommen: [id] }), {}],
  4: [lage({ abgenommen: [id] }), { [id]: FG("kunden") }],
  5: [lage({ abgenommen: [id] }), { [id]: FG("buchbar") }],
});

describe("Zustandsmodell: fünf getrennte Paketzustände aus Registry und Betreiberfreigabe", () => {
  it("heute stehen alle vier Pakete auf Zustand 1 (alle zwölf Module geplant, keine Freigabe)", () => {
    expect(BRANCHENMODULE.length).toBe(12);
    expect(BRANCHENMODULE.every((m) => m.status === "geplant")).toBe(true);
    expect(PAKET_FREIGABEN).toEqual({});
    for (const id of PAKET_IDS) expect(paketZustand(id), id).toBe(1);
    expect(Object.values(PAKET_ZUSTAENDE)).toEqual(["geplant", "technisch implementiert",
      "getestet und abgenommen", "für Kunden freigegeben", "buchbar und abrechenbar"]);
  });

  it("jedes Paket durchläuft 1–5 genau in dieser Reihenfolge", () => {
    for (const id of PAKET_IDS) for (const z of [1, 2, 3, 4, 5]) {
      const [liste, freigaben] = ZUSTAND(id)[z];
      expect(paketZustand(id, liste, freigaben), `${id} → ${z}`).toBe(z);
      expect(paketBuchbar(id, liste, freigaben)).toBe(z === 5);
    }
  });

  it("eine Freigabe hebt ein Paket nie über seinen Registry-Zustand", () => {
    for (const id of PAKET_IDS) {
      expect(paketZustand(id, lage(), { [id]: FG("buchbar") })).toBe(1);
      expect(paketZustand(id, lage({ impl: [id] }), { [id]: FG("buchbar") })).toBe(2);
    }
    expect(pruefePaketFreigaben({ industrie: FG("buchbar") })).toEqual([expect.stringMatching(/über dem Registry-Zustand/)]);
    expect(pruefePaketFreigaben({ industrie: FG("buchbar") }, lage({ abgenommen: ["industrie"] }))).toEqual([]);
  });

  it("eine unvollständige Freigabe (ohne Datum, Person oder Nachweis) zählt nicht", () => {
    const liste = lage({ abgenommen: ["industrie"] });
    for (const kaputt of [{ ...FG("buchbar"), datum: "" }, { ...FG("buchbar"), von: " " },
      { ...FG("buchbar"), nachweis: undefined }, { ...FG("buchbar"), stufe: "alle" }, "buchbar", true])
      expect(paketZustand("industrie", liste, { industrie: kaputt })).toBe(3);
  });

  it("die Merkmale der Pakete in stufen.js sind die der Paketstand-Liste; Merkmalsstand je Merkmal", () => {
    for (const p of PAKETE) expect([...p.merkmale], p.id).toEqual([...PAKET_MERKMALE[p.id]]);
    expect(paketNutzbar("industrie")).toBe(false);
    expect(merkmaleInVorbereitung("industrie")).toEqual(["anlagen", "maschinenqual", "kontimodelle"]);
    expect(merkmalNutzbar("geofence")).toBe(true);
    expect(merkmalNutzbar("wachbuch")).toBe(false);
  });

  it("die Zielpreise bleiben unverändert (keine Preissenkung)", () => {
    expect(Object.fromEntries(PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis]))).toEqual(ZIELPREISE);
  });
});

describe("Preis > 0 € nur in Zustand 5 — Rechner und Summen", () => {
  it("alle Stufen, alle Pakete, alle Zustände: Preis genau dann, wenn Zustand 5", () => {
    for (const id of PAKET_IDS) for (const z of [1, 2, 3, 4, 5]) {
      const [liste, freigaben] = ZUSTAND(id)[z];
      for (const s of STUFEN) {
        const mit = preisFuer(stufeVon(s.id), 1, [10], [id], liste, freigaben);
        const ohne = preisFuer(stufeVon(s.id), 1, [10], [], liste, freigaben);
        const erwartet = z === 5 && !s.paketeFrei ? ZIELPREISE[id] : 0;
        expect(mit.summePakete, `${id} ${z} ${s.id}`).toBe(erwartet);
        expect(mit.gesamt - ohne.gesamt, `${id} ${z} ${s.id}`).toBeCloseTo(erwartet, 5);
      }
      const a = paketeAngebot(liste, freigaben).find((p) => p.id === id);
      expect(a.buchbar).toBe(z === 5);
      expect(a.aufpreis).toBe(z === 5 ? ZIELPREISE[id] : null);
      expect(buchbareAuswahl([id], liste, freigaben)).toEqual(z === 5 ? [id] : []);
    }
  });

  it("Rechner heute: kein Paket wählbar, kein Preis, auch nicht per erzwungener Auswahl", () => {
    for (const a of paketeAngebot()) expect(a, a.id).toMatchObject({ buchbar: false, aufpreis: null, zustand: 1 });
    expect(buchbareAuswahl(["industrie", "pflege", "klinik", "sicherheit", "kern", "x"])).toEqual([]);
    for (const s of STUFEN) {
      const mit = preisFuer(s, 1, [10], PAKET_IDS);
      expect(mit.summePakete).toBe(0);
      expect(mit.gesamt).toBe(preisFuer(s, 1, [10], []).gesamt);
    }
  });

  it("Zustand 5 rechnet den Rechenweg weiter: teuerste frei in Enterprise, kein Platz für Unfertiges", () => {
    const liste = lage({ abgenommen: ["pflege", "klinik"] });
    const fg = { pflege: FG("buchbar"), klinik: FG("buchbar") };
    const k = paketkosten(["industrie", "pflege", "klinik"], 2, liste, fg);
    expect(k.frei.map((p) => p.id)).toEqual(["klinik", "pflege"]);
    expect(k.summe).toBe(0);
    const k1 = paketkosten(["industrie", "pflege"], 1, liste, fg);
    expect(k1.frei.map((p) => p.id)).toEqual(["pflege"]);
    expect(k1.nichtBerechnet.map((p) => p.id)).toEqual(["industrie"]);
    expect(paketkosten(["pflege", "klinik"], 0, liste, fg).summe).toBe(89 + 129);
  });

  it("teilweise geplante Pakete zeigen „In Vorbereitung“ je Merkmal", () => {
    const an = Object.fromEntries(paketeAngebot().map((p) => [p.id, p]));
    expect(an.sicherheit.inVorbereitung).toEqual(expect.arrayContaining(["Wachbuch"]));
    expect(an.klinik.inVorbereitung.length).toBe(4);
    expect(an.pflege.inVorbereitung.length).toBe(2);
    const [werbung, vorb] = PAKETE.find((p) => p.id === "industrie").beschreibung.split("In Vorbereitung:");
    expect(werbung).not.toMatch(/Anlage|Kontischicht|Maschinen/);
    expect(vorb).toMatch(/Anlagenbindung/);
  });
});

describe("Selbststart und automatische Buchung: nur Zustand 5", () => {
  const betrieb = (branche) => baueLeerenBetrieb({ name: "Test GmbH", branche, email: "a@b.de", land: "HE", raum: "r1" })
    .mandanten[0].einstellungen;

  it("heute bucht kein Selbststart irgendein Paket zu — für jede Branche", () => {
    for (const b of BRANCHEN) expect(betrieb(b.id).pakete, b.id).toEqual([]);
    for (const b of ["industrie", "produktion", "logistik", "sicherheit", "pflege", "klinik", "rettung"])
      expect(betrieb(b).pakete, b).toEqual([]);
  });

  it("paketFuerNeubuchung: je Zustand 1–5 nur bei 5 das Paket, sonst null", () => {
    for (const id of PAKET_IDS) for (const z of [1, 2, 3, 4, 5]) {
      const [liste, freigaben] = ZUSTAND(id)[z];
      expect(paketFuerNeubuchung(id, liste, freigaben), `${id} ${z}`).toBe(z === 5 ? id : null);
    }
    expect(paketFuerNeubuchung(null)).toBeNull();
  });
});

describe("Pilot: kostenlos, eingeschränkter Umfang, keine Rechnungspositionen", () => {
  const pilotBetrieb = { preisgestaltung: { pilot: { seit: "2026-11-03", von: "Betreiber" } } };

  it("pilotAktiv verlangt Datum und Betreiber; Freitext oder Wahrheitswert genügt nicht", () => {
    expect(pilotAktiv(pilotBetrieb)).toBe(true);
    for (const x of [{}, { preisgestaltung: {} }, { preisgestaltung: { pilot: true } },
      { preisgestaltung: { pilot: { seit: "gestern", von: "x" } } }, { preisgestaltung: { pilot: { seit: "2026-11-03" } } }, null])
      expect(pilotAktiv(x)).toBe(false);
  });

  it("im Pilot wird kein Paket berechnet, auch nicht in Zustand 5; alle bleiben gebucht", () => {
    for (const id of PAKET_IDS) for (const z of [1, 2, 3, 4, 5]) {
      const [liste, freigaben] = ZUSTAND(id)[z];
      const k = paketkosten([id], 0, liste, freigaben, true);
      expect(k.summe, `${id} ${z}`).toBe(0);
      expect(k.zahlend).toEqual([]);
      expect(k.nichtBerechnet.map((p) => p.id)).toEqual([id]);
      expect(k.gewaehlt.map((p) => p.id)).toEqual([id]);
      expect(preisFuer(stufeVon("basis"), 1, [10], [id], liste, freigaben, true).summePakete).toBe(0);
    }
  });

  it("die Pilotanzeige nennt nutzbare und nicht nutzbare Funktionen und suggeriert keinen vollen Umfang", () => {
    const t = paketAnzeige("klinik", { pilot: true });
    expect(t).toMatch(/^Pilot – eingeschränkter Umfang: nutzbar: .*fachkraftquote.*; in Vorbereitung: .*Bereitschaftsdienst/);
    expect(paketAnzeige("industrie", { pilot: true })).toMatch(/nutzbar: nichts; in Vorbereitung: .*Anlagenbindung/);
    expect(paketAnzeige("industrie")).toBe("In Vorbereitung (Zustand 1: geplant).");
    expect(paketAnzeige("kern")).toBe("");
  });

  it("nur der Betreiber setzt den Pilot: Leitung, Planung, Kundenrolle, Schichtverantwortung, Beschäftigte wirkungslos", () => {
    const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], email: `${id}@x.de` });
    const g = () => ({ version: 9, stand: 1, session: null, betreiber: {}, tarife: [], rechnungen: [], protokoll: [],
      pakete: [], adressaenderungen: [], selbststarts: [],
      mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1" }],
        dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
        personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "e1"),
          person("a1", "mitarbeiter", "e1")],
        abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [], status: "aktiv", tarif: "pro",
        preisgestaltung: {}, pakete: ["industrie"], selbstAngelegt: false }] });
    const PILOT = { seit: "2026-11-03", von: "Betreiber" };
    for (const [name, sitz] of [["Leitung", { rolle: "leitung", person: "l1", betrieb: 0 }],
      ["Planung", { rolle: "planer", person: "p1", betrieb: 0 }], ["Kundenrolle", { rolle: "kunde", person: "l1", betrieb: 0 }],
      ["Schichtverantwortung", { rolle: "subplaner", person: "s1", betrieb: 0 }],
      ["Beschäftigte", { rolle: "mitarbeiter", person: "a1", betrieb: 0 }]]) {
      const bestand = g();
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(bestand, sitz)));
      gelesen.mandanten[0].preisgestaltung = { pilot: PILOT };
      gelesen.mandanten[0].pakete = ["industrie", "pflege"];
      gelesen.pakete = [{ id: "pflege", zustand: 5, freigabe: "buchbar" }];
      const e = zusammenfuehren(bestand, gelesen, sitz);
      expect(pilotAktiv(e.mandanten[0]), name).toBe(false);
      expect(e.mandanten[0].pakete, name).toEqual(["industrie"]);
      expect(e.pakete, name).toEqual([]);
    }
    const bestand = g();
    const u = JSON.parse(JSON.stringify(bestand));
    u.mandanten[0].preisgestaltung = { pilot: PILOT };
    const e = zusammenfuehren(bestand, u, { rolle: "betreiber", person: null, betrieb: 0 });
    expect(pilotAktiv(e.mandanten[0])).toBe(true);
  });
});

describe("Negativtests: der Client kann Zustand, Preis und Freigabe nicht setzen", () => {
  it("ein Betrieb mit mitgeschickten Zustands- und Preisfeldern ändert nichts an der Berechnung", () => {
    const m = { pakete: ["industrie"], zustand: 5, freigabe: "buchbar", aufpreis: 59,
      paketzustaende: { industrie: 5 }, preisgestaltung: { zustand: 5 } };
    const k = paketkosten(m.pakete, 0);
    expect(k.summe).toBe(0);
    expect(k.nichtBerechnet.map((p) => p.id)).toEqual(["industrie"]);
    expect(paketZustand("industrie")).toBe(1);
  });

  it("eine in der Registry als „freigegeben“ behauptete Zeile ohne Abnahme hebt den Zustand nicht über 2", () => {
    const liste = BRANCHENMODULE.map((m) => (m.pakete.includes("industrie") ? { ...m, status: "freigegeben" } : m));
    expect(paketZustand("industrie", liste, { industrie: FG("buchbar") })).toBe(2);
  });

  it("Betreiberfreigaben liegen nicht in Betriebsdaten und nicht in der Übermittlung (nur im Code)", () => {
    expect(Object.isFrozen(PAKET_FREIGABEN)).toBe(true);
    const server = quelle("../server/lib/paketstand.mjs");
    expect(server).toMatch(/export const PAKET_FREIGABEN = Object\.freeze\(\{\}\);/);
  });
});

describe("G10: Bestand bleibt erhalten", () => {
  it("ein gebuchtes Paket bleibt in der Auswahl und wird nicht gelöscht, nur nicht berechnet", () => {
    const k = paketkosten(["industrie", "pflege"], 0);
    expect(k.gewaehlt.map((p) => p.id).sort()).toEqual(["industrie", "pflege"]);
    expect(k.nichtBerechnet.map((p) => p.id).sort()).toEqual(["industrie", "pflege"]);
    expect(k.summe).toBe(0);
  });

  it("Merkmalsprüfung `kann` bleibt unverändert: kein bestehendes Merkmal wird gesperrt", () => {
    const app = quelle("../src/App.jsx");
    expect(app).toMatch(/const kann = \(m, merkmal\) => \{\s*const aktiv = \["kern", \.\.\.\(m\.pakete \|\| \[\]\)\];\s*return PAKETE\.filter\(\(p\) => aktiv\.includes\(p\.id\)\)\.some\(\(p\) => p\.merkmale\.includes\(merkmal\)\);/);
  });

  it("Preisliste preisgestaltung.js kennt weder Paketstand noch Pilot", () => {
    expect(quelle("../src/preisgestaltung.js")).not.toMatch(/paketstand|pilot|paketBuchbar/);
  });
});

describe("Pfadliste: jede Stelle prüft den Zustand (Quelltext)", () => {
  const app = quelle("../src/App.jsx");
  const main = quelle("../src/main.jsx");
  const pruef = quelle("../src/pruefung.jsx");
  const leer = quelle("../server/lib/leerbetrieb.mjs");

  it("Website-Rechner: Auswahl aus paketeAngebot, Berechnung nur über buchbare Auswahl", () => {
    expect(main).toMatch(/paketeAngebot\(\)\.map/);
    expect(main).toMatch(/preisFuer\(s, planer, standorte, buchbareAuswahl\(pakete\)\)/);
    expect(main).toMatch(/disabled=\{!p\.buchbar\}/);
    expect(main).toMatch(/in Vorbereitung – nicht buchbar/);
  });

  it("Selbststart-Texte bewerben kein Geplantes als verfügbar", () => {
    const zeilen = main.split("\n").filter((z) => /^\s*\["(sicherheit|pflege|klinik|industrie|sonstige)", "/.test(z));
    expect(zeilen.length).toBe(5);
    const [sich, , kli, ind] = zeilen;
    expect(sich).toMatch(/Wachbuch in Vorbereitung/);
    expect(kli).toMatch(/Bereitschaft, Rufbereitschaft, geteilte Dienste in Vorbereitung/);
    expect(ind).toMatch(/in Vorbereitung/);
  });

  it("Selbststart (leerbetrieb) bucht nur über paketFuerNeubuchung", () => {
    expect(leer).toMatch(/paketFuerNeubuchung\(paketFuer\(br\)\)/);
    expect(leer).not.toMatch(/pakete: paketFuer\(br\) \?/);
  });

  it("Betreiberkonsole: Zustand statt Nutzbarkeit, kein Schalter zum Zubuchen, keine Summe, Pilot nur dort", () => {
    expect(app).toMatch(/const zustand = p\.pflicht \? 5 : paketZustand\(p\.id\);/);
    expect(app).toMatch(/const empfohlen = nutzbar && paketeFuerBranche/);
    expect(app).toMatch(/\{!p\.pflicht && \(nutzbar \|\| an\) && \(/);
    expect(app).toMatch(/!pilotAktiv\(m\) && \(m\.pakete \|\| \[\]\)\.includes\(p\.id\) && paketBuchbar\(p\.id\)\)/);
    expect(app).toMatch(/\(an && !paketBuchbar\(paket\)\)/);
    expect(app).toMatch(/setzePilot: \(mid, an\)/);
    expect(app).toMatch(/merkmalNutzbar\(x\) \? x : `\$\{x\} \(in Vorbereitung\)`/);
  });

  it("Rechnung: keine Position für nicht berechnete Pakete; Vertragsübersicht: 0 € mit Zustandsanzeige", () => {
    expect(app).toMatch(/const pilot = pilotAktiv\(m\);\s*const paketkosten_ = paketkosten\(m\.pakete \|\| \[\], gewaehlt\.paketeFrei \|\| 0, undefined, undefined, pilot\);/);
    expect(app).toMatch(/if \(\(p\.paketeNichtBerechnet \|\| \[\]\)\.some\(\(x\) => x\.id === pk\.id\)\) continue;/);
    expect(app).toMatch(/paketAnzeige\(pk\.id, \{ pilot: p\.pilot \}\)/);
    expect(app).toMatch(/\.some\(\(x\) => x\.id === pk\.id\) \? eur\(0\) : eur\(pk\.aufpreis\)/);
  });

  it("Prüfanzeige (pruefung.jsx): eine Paketliste, Summe nur Zustand 5", () => {
    expect(pruef).not.toMatch(/^const PAKETE = \[/m);
    expect(pruef).toMatch(/import \{ PAKETE, paketBuchbar \} from "\.\/stufen\.js"/);
    expect(pruef).toMatch(/filter\(\(p\) => paketBuchbar\(p\.id\)\)\.reduce/);
  });
});
