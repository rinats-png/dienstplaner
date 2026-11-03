/* ==========================================================================
   WP-19.0 — GEMEINSAMER KERN DER ZWÖLF BRANCHENMODULE (Server)

   Akzeptanzkriterien aus docs/acc45/WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md
   (G1–G10) und dem Modulplan, Abschnitt 13. Je Kriterium ein Block; die
   Zuordnung Kriterium ↔ Test steht in docs/acc45/wp19-0-nachweis.md.

     G1  Modul nach Buchung verfügbar, zunächst aus; Leitung schaltet ein.
     G2  Schalten nur mit org.edit, serverseitig; Wann/Wer vom Server;
         Aktivierung, fachliche Konfiguration (Parameter, Regelwerte) und
         operative Nutzung (Moduldaten) getrennt.
     G3  Abschalten: keine Löschung, kein Einfluss, Daten nur lesbar.
     G4  Betrieblicher Regelwert mit Quelle hebt „Hinweis" auf „Achtung" —
         nie auf „recht", nie ohne geprüfte Quelle, nie als Sperre.
     G5  Kein Modul führt eine Planungssperre ein.
     G6  Mitbestimmungsbestätigung beim Einschalten, protokolliert.
     G8  Status ehrlich: Der Kern hebt kein Modul über „geplant".

   Die echten Module sind „geplant" und lassen sich nicht einschalten. Für
   Fälle, die ein einschaltbares Modul brauchen, nimmt der Test dieselbe
   Registry mit zwei Testmodulen (die Funktionen des Kerns nehmen die Liste
   als letzten Parameter). Über den Schreibweg des Servers (zusammenfuehren)
   laufen alle Rollen- und Umgehungsfälle mit den echten Modulen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import * as BM from "../server/lib/branchenmodule.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN } from "../server/lib/branchenkatalog.mjs";
import { branchenBefunde } from "../server/lib/branchenbefunde.mjs";
import { BEFUND_KATALOG } from "../server/lib/bestaetigungen.mjs";
import { ANLAGE_ART } from "../server/lib/modul-anlagen.mjs";
import { MATRIX, darf, schreibumfang, bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

/* Neue Datei des Kerns — fehlt sie (Stand vor WP-19.0), ist jeder Fall damit rot, nicht die ganze Datei. */
const MS = await import("../server/lib/modulschreibwege.mjs").catch(() => ({}));

const ZWOELF = ["posten", "wachbuch", "objektbericht", "bereichsplan", "pflegequal", "bereitschaftsdienst",
  "geteilterdienst", "funktionsdienst", "rotation", "anlagen", "maschinenqual", "kontimodelle"];

/* Zwei einschaltbare Testmodule: ohne und mit Mitbestimmungsbestätigung, je mit einem Datenfeld. */
const TM = Object.freeze({ id: "testmodul", merkmal: "testmodul", name: "Testmodul", pakete: ["sicherheit"], status: "vorlaeufig",
  abhaengigVon: [], mitbestimmung: false, datenfelder: ["testDaten"], regelIds: [],
  parameter: { intervall: { typ: "zahl", standard: 120, min: 15, max: 720, vorlaeufig: true } } });
const TMB = Object.freeze({ ...TM, id: "testwache", merkmal: "testwache", name: "Testwache", mitbestimmung: true, datenfelder: ["testWache"], parameter: {} });
const LISTE = [...BRANCHENMODULE, TM, TMB];

const kopie = (x) => JSON.parse(JSON.stringify(x));
const SITZ = { person: "l1" };
const betrieb = (bm, extra = {}) => ({ ...branchenbestand({ pakete: ["sicherheit"], branchenmodule: bm }).mandanten[0], ...extra });
const mitE = (m, e) => ({ ...m, einstellungen: { ...m.einstellungen, ...e } });
const zus = (alt, neu, darfOrg = true, liste = LISTE) => BM.branchenmoduleZusammen(alt, neu, SITZ, darfOrg, liste);
const GRUNDLAGE = "Betriebsvereinbarung Wachdokumentation vom 01.10.2026, § 3";
const BEST = { bestaetigt: true, grundlage: GRUNDLAGE };

/* ------------------------------------------------------------------------ */
describe("G8 — Status ehrlich: der Kern hebt kein Modul über „geplant“", () => {
  it("alle zwölf Module bleiben Lieferumfang, keines gestrichen, keines durch den Kern einschaltbar", () => {
    expect(BRANCHENMODULE.map((x) => x.id).sort()).toEqual([...ZWOELF].sort());
    for (const mod of BRANCHENMODULE) expect(mod.status, mod.id).toBe("geplant");
  });
  it("„vorläufig“ oder „freigegeben“ nur mit Abnahmenachweis (19.13) — der Vertragsprüfer verlangt ihn", () => {
    expect(typeof BM.pruefeModulStatus).toBe("function");
    expect(BM.pruefeModulStatus()).toEqual([]);
    const ohne = BM.pruefeModulStatus([{ ...TM }]).join("\n");
    expect(ohne).toMatch(/testmodul: .*Abnahme/);
    expect(BM.pruefeModulStatus([{ ...TM, abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } }])).toEqual([]);
    expect(BM.pruefeModulStatus([{ ...TM, status: "freigegeben", abnahme: { datum: "2026-12-01" } }]).join("\n")).toMatch(/Abnahme/);
  });
  it("Zustand je Modul für die Oberfläche: in Vorbereitung, nicht gebucht, aus, an", () => {
    expect(typeof BM.modulZustand).toBe("function");
    const m = betrieb(undefined);
    for (const id of ZWOELF) expect(BM.modulZustand(m, id), id).toBe("in-vorbereitung");
    expect(BM.modulZustand(m, "testmodul", LISTE)).toBe("aus");
    expect(BM.modulZustand({ ...m, pakete: [] }, "testmodul", LISTE)).toBe("nicht-gebucht");
    expect(BM.modulZustand(betrieb({ testmodul: { an: true } }), "testmodul", LISTE)).toBe("an");
    expect(BM.modulZustand(betrieb({ testwache: { an: true } }), "testwache", LISTE)).toBe("mitbestimmung-offen");
    expect(BM.modulZustand(m, "gibtsnicht")).toBe("unbekannt");
  });
});

/* ------------------------------------------------------------------------ */
describe("G1 — nach Buchung verfügbar, zunächst aus", () => {
  it("ein neu angelegter Betrieb (Leerbetrieb) hat kein Modul an, keine Regelwerte, kein Modulprotokoll", () => {
    for (const branche of ["sicherheit", "pflege", "klinik", "produktion"]) {
      const b = baueLeerenBetrieb({ name: "Neu", branche, email: "x@y.de", land: "HE", raum: "r" });
      const m = b.mandanten[0];
      for (const id of ZWOELF) expect(BM.modulAktiv(m, id), `${branche}/${id}`).toBe(false);
      expect(m.einstellungen.branchenmodule, branche).toBeUndefined();
      expect(m.einstellungen.regelwerte, branche).toBeUndefined();
      expect(m.einstellungen.modulprotokoll, branche).toBeUndefined();
    }
  });
  it("gebucht, aber nicht eingeschaltet: wirkt nicht; die Leitung schaltet ein (Wann/Wer vom Server, Protokoll)", () => {
    const a = betrieb(undefined);
    expect(BM.modulAktiv(a, "testmodul", LISTE)).toBe(false);
    const r = zus(a, mitE(a, { branchenmodule: { testmodul: { an: true } } }));
    expect(r.grund).toBeUndefined();
    const e = r.mandant.einstellungen;
    expect(e.branchenmodule.testmodul).toMatchObject({ an: true, geaendertVon: "l1" });
    expect(BM.modulAktiv(r.mandant, "testmodul", LISTE)).toBe(true);
    expect(e.modulprotokoll).toEqual([{ art: "eingeschaltet", modul: "testmodul", am: e.branchenmodule.testmodul.geaendertAm, von: "l1" }]);
  });
});

/* ------------------------------------------------------------------------ */
describe("G2 — nur org.edit schaltet, serverseitig erzwungen", () => {
  const gespeichert = { wachbuch: { an: false, geaendertAm: "2026-11-01T08:00:00.000Z", geaendertVon: "l1" } };
  const RW = { quelle: "Betriebsvereinbarung", fundstelle: "§ 4", version: "2026-10", gueltigAb: "2026-01-01", gueltigBis: null,
    pruefstatus: "verified", stufe: "achtung" };

  it("Beschäftigte, Betriebsrat und Planung: der gespeicherte Stand bleibt — Schalter, Regelwerte und Protokoll", () => {
    const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: gespeichert });
    const vorher = kopie(g.mandanten[0].einstellungen);
    for (const r of ["MA", "BR", "PL"]) {
      const v = schreibeAls(g, r, (m) => {
        m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: { wachbuch: { an: true, mitbestimmung: BEST } },
          regelwerte: { "POSTEN-QUAL-01": RW }, modulprotokoll: [] };
      });
      if (v === null || (v && v.verweigert)) continue;                    // Betriebsrat schreibt gar nicht
      const e = v.mandanten[0].einstellungen;
      expect(e.branchenmodule, r).toEqual(vorher.branchenmodule);
      expect(e.regelwerte, r).toBeUndefined();
      expect(e.modulprotokoll, r).toBeUndefined();
    }
  });
  it("Schichtverantwortung: Änderung an Schaltern oder Regelwerten wird abgewiesen (403-Weg)", () => {
    const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: gespeichert });
    const v1 = schreibeAls(g, "SV", (m) => { m.einstellungen.branchenmodule = { wachbuch: { an: true } }; });
    expect(v1 && v1.verweigert).toMatch(/Leitung vorbehalten/);
    const v2 = schreibeAls(g, "SV", (m) => { m.einstellungen.regelwerte = { "POSTEN-QUAL-01": RW }; });
    expect(v2 && v2.verweigert).toMatch(/Leitung vorbehalten/);
    /* Unverändert zurückgeschickt (Rundweg ihrer gekürzten Sicht) geht durch und ändert nichts. */
    const rund = schreibeAls(g, "SV", () => {});
    expect(rund.verweigert).toBeFalsy();
    expect(rund.mandanten[0].einstellungen.branchenmodule).toEqual(gespeichert);
  });
  it("Leitung und Kundenrolle: Regelwert über den Schreibweg des Servers, Wann/Wer vom Server", () => {
    for (const r of ["LT", "KD"]) {
      const g = branchenbestand({ pakete: ["sicherheit"] });
      const v = schreibeAls(g, r, (m) => {
        m.einstellungen.regelwerte = { "POSTEN-QUAL-01": { ...RW, geprueftVon: "gefaelscht", geprueftAm: "1999-01-01", geaendertVon: "x" } };
      });
      expect(v.verweigert, r).toBeFalsy();
      const w = v.mandanten[0].einstellungen.regelwerte["POSTEN-QUAL-01"];
      expect(w, r).toMatchObject({ ...RW, geprueftVon: SITZUNGEN[r].person, geaendertVon: SITZUNGEN[r].person });
      expect(w.geprueftAm, r).not.toBe("1999-01-01");
      expect(v.mandanten[0].einstellungen.modulprotokoll, r).toEqual([
        { art: "regelwert", regelId: "POSTEN-QUAL-01", am: w.geaendertAm, von: SITZUNGEN[r].person, stufe: "achtung", pruefstatus: "verified" }]);
    }
  });
  it("PUT-Umgehung: mitgeschicktes Wann/Wer, Bestätigungsvermerk und Protokoll zählen nicht", () => {
    const a = betrieb(undefined);
    const r = zus(a, mitE(a, { branchenmodule: { testwache: { an: true, geaendertVon: "x", geaendertAm: "1999",
      mitbestimmung: { ...BEST, bestaetigtVon: "x", bestaetigtAm: "1999" } } },
    modulprotokoll: [{ art: "eingeschaltet", modul: "testwache", am: "1999", von: "x" }] }));
    expect(r.grund).toBeUndefined();
    const e = r.mandant.einstellungen;
    expect(e.branchenmodule.testwache.geaendertVon).toBe("l1");
    expect(e.branchenmodule.testwache.mitbestimmung).toMatchObject({ grundlage: GRUNDLAGE, bestaetigtVon: "l1" });
    expect(e.branchenmodule.testwache.mitbestimmung.bestaetigtAm).not.toBe("1999");
    expect(e.modulprotokoll).toHaveLength(1);
    expect(e.modulprotokoll[0]).toMatchObject({ art: "eingeschaltet", modul: "testwache", von: "l1", grundlage: GRUNDLAGE });
    /* Das Protokoll lässt sich weder kürzen noch fälschen: der Server baut es aus dem gespeicherten Stand. */
    const weiter = zus(r.mandant, mitE(r.mandant, { modulprotokoll: [] }));
    expect(weiter.mandant.einstellungen.modulprotokoll).toEqual(e.modulprotokoll);
    const ohneOrg = zus(r.mandant, mitE(r.mandant, { modulprotokoll: [{ art: "x" }] }), false);
    expect(ohneOrg.mandant.einstellungen.modulprotokoll).toEqual(e.modulprotokoll);
  });
  it("Mandantentrennung: die Leitung von Betrieb A ändert die Module von B nicht", () => {
    const g = branchenbestand({ pakete: ["sicherheit"] });
    const b = { ...kopie(g.mandanten[0]), id: "m2", name: "Fremd", personen: [{ id: "f1", rolle: "leitung", vorname: "F", nachname: "F", bereich: "ALLE", status: "aktiv" }],
      einstellungen: { ruhezeit: 11, branchenmodule: { wachbuch: { an: false, geaendertAm: "t", geaendertVon: "f1" } } } };
    g.mandanten.push(b);
    const s = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    s.mandanten.push({ ...kopie(b), einstellungen: { ...b.einstellungen, branchenmodule: { wachbuch: { an: true } } } });
    const v = zusammenfuehren(g, s, SITZUNGEN.LT);
    expect(v && v.verweigert).toBeTruthy();
    expect(g.mandanten[1].einstellungen.branchenmodule.wachbuch.an).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
describe("Fehlende oder ungültige Felder ändern nichts still (Lehre aus WP-23b)", () => {
  const an = () => betrieb({ testmodul: { an: true, parameter: { intervall: 60 }, geaendertAm: "t0", geaendertVon: "l0" },
    testwache: { an: true, geaendertAm: "t0", geaendertVon: "l0", mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: "t0", bestaetigtVon: "l0" } } },
  { });
  it("Eintrag ohne `parameter`: die gespeicherten Parameter bleiben", () => {
    const a = an();
    const r = zus(a, mitE(a, { branchenmodule: { testmodul: { an: true } } }));
    expect(r.mandant.einstellungen.branchenmodule.testmodul).toEqual(a.einstellungen.branchenmodule.testmodul);
    /* Ausdrücklich leer gesetzt: zurück auf die Vorgabe, mit Wann/Wer. */
    const leer = zus(a, mitE(a, { branchenmodule: { testmodul: { an: true, parameter: {} } } }));
    expect(leer.mandant.einstellungen.branchenmodule.testmodul.parameter).toBeUndefined();
    expect(leer.mandant.einstellungen.branchenmodule.testmodul.geaendertVon).toBe("l1");
  });
  it("Eintrag ohne `mitbestimmung` bei eingeschaltetem Modul: die Bestätigung bleibt", () => {
    const a = an();
    const r = zus(a, mitE(a, { branchenmodule: { testwache: { an: true } } }));
    expect(r.mandant.einstellungen.branchenmodule.testwache).toEqual(a.einstellungen.branchenmodule.testwache);
    expect(BM.modulAktiv(r.mandant, "testwache", LISTE)).toBe(true);
  });
  it("ohne `branchenmodule`, `regelwerte`, `modulprotokoll` oder ganz ohne `einstellungen`: gespeicherter Stand", () => {
    const a = mitE(an(), { regelwerte: { "POSTEN-QUAL-01": { quelle: "q", fundstelle: "f", version: "1", gueltigAb: "2026-01-01", gueltigBis: null,
      pruefstatus: "verified", stufe: "achtung", geprueftAm: "t", geprueftVon: "l0", geaendertAm: "t", geaendertVon: "l0" } },
    modulprotokoll: [{ art: "eingeschaltet", modul: "testmodul", am: "t0", von: "l0" }] });
    for (const neu of [{ ...a, einstellungen: { ruhezeit: 11 } }, { ...a, einstellungen: { ...a.einstellungen, branchenmodule: undefined } }]) {
      const e = { ...neu.einstellungen };
      if (e.branchenmodule === undefined) delete e.branchenmodule;
      const r = zus(a, { ...neu, einstellungen: e });
      for (const k of ["branchenmodule", "regelwerte", "modulprotokoll"]) expect(r.mandant.einstellungen[k], k).toEqual(a.einstellungen[k]);
    }
  });
  it("ungültige Form: abgewiesen, nichts geschrieben", () => {
    const a = an();
    const nein = (e, muster) => {
      const r = zus(a, mitE(a, e));
      expect(r.grund, JSON.stringify(e).slice(0, 120)).toMatch(muster);
      expect(r.mandant).toBeUndefined();
    };
    nein({ branchenmodule: "an" }, /Branchenmodul/);
    nein({ branchenmodule: { testmodul: { an: true, parameter: { intervall: 5 } } } }, /intervall/);
    nein({ regelwerte: [] }, /Regelwert/);
    nein({ regelwerte: { "GIBT-ES-NICHT-01": { pruefstatus: "provisional", stufe: "hinweis" } } }, /unbekannt/);
    nein({ regelwerte: { "POSTEN-QUAL-01": "achtung" } }, /Regelwert/);
  });
});

/* ------------------------------------------------------------------------ */
describe("G6 — Mitbestimmungsbestätigung beim Einschalten", () => {
  it("die Registry führt Wachbuch und Objektbericht als mitbestimmungsrelevant", () => {
    expect(BRANCHENMODULE.filter((x) => x.mitbestimmung).map((x) => x.id).sort()).toEqual(["objektbericht", "wachbuch"]);
  });
  it("ohne Bestätigung, mit bestaetigt≠true oder ohne Grundlage: abgewiesen", () => {
    const a = betrieb(undefined);
    for (const wert of [{ an: true }, { an: true, mitbestimmung: { grundlage: GRUNDLAGE } },
      { an: true, mitbestimmung: { bestaetigt: "ja", grundlage: GRUNDLAGE } }, { an: true, mitbestimmung: { bestaetigt: true, grundlage: "   " } },
      { an: true, mitbestimmung: { bestaetigt: true } }, { an: true, mitbestimmung: { bestaetigt: true, grundlage: "x".repeat(1001) } },
      { an: true, mitbestimmung: { bestaetigt: true, grundlage: GRUNDLAGE, extra: 1 } }, { an: true, mitbestimmung: "ja" }]) {
      const r = zus(a, mitE(a, { branchenmodule: { testwache: wert } }));
      expect(r.grund, JSON.stringify(wert)).toMatch(/Mitbestimmung|Branchenmodul/);
    }
  });
  it("mit Bestätigung: Zeit, Person, Modul und Grundlage protokolliert; Text sagt, dass sie keine Mitbestimmung ersetzt", () => {
    const a = betrieb(undefined);
    const r = zus(a, mitE(a, { branchenmodule: { testwache: { an: true, mitbestimmung: BEST } } }));
    const e = r.mandant.einstellungen;
    expect(e.branchenmodule.testwache.mitbestimmung).toEqual({ grundlage: GRUNDLAGE, bestaetigtAm: e.branchenmodule.testwache.geaendertAm, bestaetigtVon: "l1" });
    expect(e.modulprotokoll).toEqual([{ art: "eingeschaltet", modul: "testwache", am: e.branchenmodule.testwache.geaendertAm, von: "l1", grundlage: GRUNDLAGE }]);
    expect(BM.MITBESTIMMUNG_HINWEIS).toMatch(/ersetzt keine Mitbestimmung/);
    expect(BM.MITBESTIMMUNG_HINWEIS).toMatch(/§ 87/);
  });
  it("ohne gespeicherte Bestätigung wirkt ein mitbestimmungsrelevantes Modul nie (eingespielt, wiederhergestellt …)", () => {
    expect(BM.modulAktiv(betrieb({ testwache: { an: true } }), "testwache", LISTE)).toBe(false);
    expect(BM.modulAktiv(betrieb({ testwache: { an: true, mitbestimmung: { grundlage: GRUNDLAGE } } }), "testwache", LISTE)).toBe(false);
    expect(BM.modulAktiv(betrieb({ testwache: { an: true, mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: "t", bestaetigtVon: "l1" } } }), "testwache", LISTE)).toBe(true);
  });
  it("nach dem Ausschalten verlangt erneutes Einschalten eine neue Bestätigung", () => {
    const a = betrieb({ testwache: { an: false, geaendertAm: "t1", geaendertVon: "l1", mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: "t0", bestaetigtVon: "l1" } } });
    expect(zus(a, mitE(a, { branchenmodule: { testwache: { an: true } } })).grund).toMatch(/Mitbestimmung/);
    expect(zus(a, mitE(a, { branchenmodule: { testwache: { an: true, mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: "t0", bestaetigtVon: "l1" } } } })).grund).toMatch(/Mitbestimmung/);
    const ok = zus(a, mitE(a, { branchenmodule: { testwache: { an: true, mitbestimmung: BEST } } }));
    expect(ok.grund).toBeUndefined();
    expect(ok.mandant.einstellungen.branchenmodule.testwache.mitbestimmung.bestaetigtAm).not.toBe("t0");
  });
  it("neue Grundlage bei eingeschaltetem Modul: neue Bestätigung mit eigenem Protokolleintrag", () => {
    const a = betrieb({ testwache: { an: true, geaendertAm: "t0", geaendertVon: "l0", mitbestimmung: { grundlage: "alt", bestaetigtAm: "t0", bestaetigtVon: "l0" } } });
    const r = zus(a, mitE(a, { branchenmodule: { testwache: { an: true, mitbestimmung: BEST } } }));
    expect(r.mandant.einstellungen.branchenmodule.testwache.mitbestimmung).toMatchObject({ grundlage: GRUNDLAGE, bestaetigtVon: "l1" });
    expect(r.mandant.einstellungen.modulprotokoll).toEqual([expect.objectContaining({ art: "mitbestimmung", modul: "testwache", von: "l1", grundlage: GRUNDLAGE })]);
  });
});

/* ------------------------------------------------------------------------ */
describe("G3 — Abschalten: keine Löschung, kein Einfluss, nur lesbar", () => {
  const PRESSE = { id: "bm1", art: ANLAGE_ART, name: "Presse", personId: null, mindestBesetzung: { F: 2 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false] } };
  const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" ? { ...x, status: "vorlaeufig" } : x));
  const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
  const MO = "2026-11-02";
  const anlagenBetrieb = (bm, pakete = ["industrie"]) => ({ ...branchenbestand({ pakete, branchenmodule: bm }).mandanten[0], betriebsmittel: [PRESSE] });
  const befunde = (m) => branchenBefunde(m, F, MO, { personenImDienst: () => [], module: AKTIV });

  it("eingeschaltet: Hinweis; ausgeschaltet oder abbestellt: kein Befund, Daten unverändert", () => {
    expect(befunde(anlagenBetrieb({ anlagen: { an: true } })).map((b) => b.regelId)).toEqual(["ANLAGEN-BESETZUNG-01"]);
    const aus = anlagenBetrieb({ anlagen: { an: true } });
    const r = BM.branchenmoduleZusammen(aus, mitE(aus, { branchenmodule: { anlagen: { an: false } } }), SITZ, true, AKTIV);
    expect(r.grund).toBeUndefined();
    expect(befunde(r.mandant)).toEqual([]);
    expect(r.mandant.betriebsmittel).toEqual([PRESSE]);
    expect(befunde(anlagenBetrieb({ anlagen: { an: true } }, []))).toEqual([]);
  });
  it("nur lesbar nach dem Ausschalten oder Abbestellen — nicht vorher, nicht für geplante Module ohne Schalter", () => {
    expect(typeof BM.modulNurLesen).toBe("function");
    expect(BM.modulNurLesen(betrieb({ testmodul: { an: false } }), "testmodul", LISTE)).toBe(true);
    expect(BM.modulNurLesen({ ...betrieb({ testmodul: { an: true } }), pakete: [] }, "testmodul", LISTE)).toBe(true);
    expect(BM.modulNurLesen(betrieb({ testmodul: { an: true } }), "testmodul", LISTE)).toBe(false);
    expect(BM.modulNurLesen(betrieb(undefined), "testmodul", LISTE)).toBe(false);
    expect(BM.modulNurLesen(betrieb({ posten: { an: true } }), "posten")).toBe(false);          // geplant, Entwicklungsstand
    expect(BM.modulNurLesen(betrieb({ posten: { an: false } }), "posten")).toBe(true);
  });
  it("Moduldaten eines ausgeschalteten Moduls: Ändern und Löschen abgewiesen, Fehlen füllt der Server auf", () => {
    expect(typeof MS.moduldatenZusammen).toBe("function");
    const alt = betrieb({ testmodul: { an: false, geaendertAm: "t", geaendertVon: "l1" } }, { testDaten: [{ id: "d1", text: "x" }] });
    expect(MS.moduldatenZusammen(alt, { ...alt, testDaten: [] }, LISTE).grund).toMatch(/Testmodul.*nur lesbar/);
    expect(MS.moduldatenZusammen(alt, { ...alt, testDaten: [{ id: "d1", text: "y" }] }, LISTE).grund).toMatch(/nur lesbar/);
    const fehlt = { ...alt }; delete fehlt.testDaten;
    expect(MS.moduldatenZusammen(alt, fehlt, LISTE).mandant.testDaten).toEqual(alt.testDaten);
    expect(MS.moduldatenZusammen(alt, kopie(alt), LISTE).grund).toBeUndefined();
    /* Eingeschaltet: frei (die Form prüft der Schreibweg des Moduls). */
    const an = betrieb({ testmodul: { an: true } }, { testDaten: [] });
    expect(MS.moduldatenZusammen(an, { ...an, testDaten: [{ id: "d2" }] }, LISTE).grund).toBeUndefined();
    /* Ausschalten und Ändern in einer Übermittlung: es zählt der neue Schalterstand. */
    expect(MS.moduldatenZusammen(an, { ...betrieb({ testmodul: { an: false } }), testDaten: [{ id: "d2" }] }, LISTE).grund).toMatch(/nur lesbar/);
  });
  it("über den Schreibweg des Servers: ausgeschalteter Posten — Objekte nicht änderbar, auch nicht für die Leitung", () => {
    const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: { an: false, geaendertAm: "t", geaendertVon: "l1" } } });
    g.mandanten[0].objekte = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }] }];
    for (const r of ["LT", "PL"]) {
      const v = schreibeAls(g, r, (m) => { m.objekte = []; });
      expect(v && v.verweigert, r).toMatch(/nur lesbar/);
    }
    const rund = schreibeAls(g, "PL", () => {});
    expect(rund.verweigert).toBeFalsy();
    expect(rund.mandanten[0].objekte).toEqual(g.mandanten[0].objekte);
  });
  it("Einhängepunkt für Schreibwege künftiger Module (MODUL_SCHREIBWEGE): Form mit Grund, Rundweg unverändert", () => {
    expect(Array.isArray(MS.MODUL_SCHREIBWEGE)).toBe(true);
    expect(MS.pruefeModulSchreibwege()).toEqual([]);
    const weg = { modul: "testmodul", felder: ["testDaten"], zusammen: (alt, neu) => (Array.isArray(neu.testDaten) ? { mandant: neu } : { grund: "testDaten: Liste erwartet" }) };
    const alt = betrieb({ testmodul: { an: true } }, { testDaten: [] });
    expect(MS.modulSchreibwegeAnwenden(alt, { ...alt, testDaten: "x" }, { wege: [weg], liste: LISTE }).grund).toMatch(/Liste erwartet/);
    expect(MS.modulSchreibwegeAnwenden(alt, { ...alt, testDaten: [{ id: 1 }] }, { wege: [weg], liste: LISTE }).mandant.testDaten).toEqual([{ id: 1 }]);
    expect(MS.pruefeModulSchreibwege([{ modul: "gibtsnicht", felder: ["x"], zusammen: () => ({}) }]).join()).toMatch(/gibtsnicht/);
    expect(MS.pruefeModulSchreibwege([{ modul: "posten", felder: ["nichtImModul"], zusammen: () => ({}) }], BRANCHENMODULE).join()).toMatch(/nichtImModul/);
  });
});

/* ------------------------------------------------------------------------ */
describe("G4 — betrieblicher Regelwert: Aufwertung nur mit geprüfter Quelle, höchstens „Achtung“", () => {
  const PRESSE = { id: "bm1", art: ANLAGE_ART, name: "Presse", personId: null, mindestBesetzung: { F: 2 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false] } };
  const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" ? { ...x, status: "vorlaeufig" } : x));
  const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
  const MO = "2026-11-02";
  const RW = { quelle: "Gefährdungsbeurteilung Presse", fundstelle: "Abschnitt 4.2", version: "2026-10", gueltigAb: "2026-01-01", gueltigBis: "2026-12-31",
    pruefstatus: "verified", stufe: "achtung", geprueftAm: "2026-10-01T00:00:00.000Z", geprueftVon: "l1", geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1" };
  const mit = (rw) => ({ ...branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true } } }).mandanten[0],
    betriebsmittel: [PRESSE], einstellungen: { ruhezeit: 11, branchenmodule: { anlagen: { an: true } }, ...(rw ? { regelwerte: { "ANLAGEN-BESETZUNG-01": rw } } : {}) } });
  const stufe = (m, d = MO) => branchenBefunde(m, F, d, { personenImDienst: () => [], module: AKTIV }).map((b) => b.stufe);

  it("ohne Regelwert: Hinweis (provisional, Registerdeckel)", () => { expect(stufe(mit(null))).toEqual(["hinweis"]); });
  it("geprüft, mit Quelle, Fundstelle, Version, gültig: Achtung — mit Quelle des Betriebs im Befund", () => {
    const b = branchenBefunde(mit(RW), F, MO, { personenImDienst: () => [], module: AKTIV });
    expect(b.map((x) => x.stufe)).toEqual(["achtung"]);
    expect(b[0].quelle).toMatch(/Gefährdungsbeurteilung Presse.*Abschnitt 4\.2/);
    expect(b[0].quelle).not.toMatch(/Rechtsverstoß|verboten|unzulässig/);
  });
  it("ungeprüft, ohne Prüfvermerk, außerhalb der Gültigkeit oder mit ungültiger Form: Hinweis", () => {
    expect(stufe(mit({ ...RW, pruefstatus: "provisional" }))).toEqual(["hinweis"]);
    const ohneVermerk = { ...RW }; delete ohneVermerk.geprueftAm;
    expect(stufe(mit(ohneVermerk))).toEqual(["hinweis"]);
    expect(stufe(mit({ ...RW, gueltigAb: "2026-11-03" }))).toEqual(["hinweis"]);
    expect(stufe(mit({ ...RW, gueltigBis: "2026-11-01" }))).toEqual(["hinweis"]);
    expect(stufe(mit({ ...RW, quelle: "" }))).toEqual(["hinweis"]);
  });
  it("nie „recht“ — auch nicht, wenn ein Bestand es enthält", () => {
    expect(stufe(mit({ ...RW, stufe: "recht" }))).toEqual(["hinweis"]);
  });
  it("Formprüfung beim Schreiben: Stufe, Prüfstatus, Quelle, Gültigkeit, Kennung", () => {
    const ok = (w) => expect(BM.pruefeRegelwert("ANLAGEN-BESETZUNG-01", w), JSON.stringify(w)).toBeNull();
    const nein = (w, muster) => expect(BM.pruefeRegelwert("ANLAGEN-BESETZUNG-01", w), JSON.stringify(w)).toMatch(muster);
    ok({ pruefstatus: "provisional", stufe: "hinweis" });
    ok({ pruefstatus: "provisional", stufe: "hinweis", quelle: "Tarif", wert: 2 });
    ok({ quelle: "q", fundstelle: "f", version: "1", gueltigAb: "2026-01-01", gueltigBis: null, pruefstatus: "verified", stufe: "achtung" });
    nein({ pruefstatus: "provisional", stufe: "recht" }, /recht/);
    nein({ pruefstatus: "provisional", stufe: "achtung", quelle: "q", fundstelle: "f" }, /geprüft/);
    nein({ pruefstatus: "verified", stufe: "achtung", fundstelle: "f", version: "1", gueltigAb: "2026-01-01" }, /Quelle/);
    nein({ pruefstatus: "verified", stufe: "achtung", quelle: "q", version: "1", gueltigAb: "2026-01-01" }, /Fundstelle/);
    nein({ pruefstatus: "verified", stufe: "achtung", quelle: "q", fundstelle: "f", gueltigAb: "2026-01-01" }, /Version/);
    nein({ pruefstatus: "verified", stufe: "achtung", quelle: "q", fundstelle: "f", version: "1" }, /gültig/i);
    nein({ pruefstatus: "geprueft", stufe: "hinweis" }, /Prüfstatus/);
    nein({ pruefstatus: "provisional", stufe: "hinweis", gueltigAb: "2026-13-01" }, /gültig/i);
    nein({ pruefstatus: "provisional", stufe: "hinweis", gueltigAb: "2026-05-01", gueltigBis: "2026-04-01" }, /gültig/i);
    nein({ pruefstatus: "provisional", stufe: "hinweis", sperrt: true }, /unbekannt/);
    nein({ pruefstatus: "provisional", stufe: "hinweis", wert: { x: 1 } }, /Wert/);
    nein({ pruefstatus: "provisional", stufe: "hinweis", quelle: "x".repeat(201) }, /Quelle/);
    expect(BM.pruefeRegelwert("NICHT-DA-01", { pruefstatus: "provisional", stufe: "hinweis" })).toMatch(/unbekannt/);
    /* Nur Regeln der Branchenmodule — ein betrieblicher Wert hebt keine Gesetzesregel des Kerns an. */
    expect(BM.pruefeRegelwert("ARBZG-RUHE-01", { pruefstatus: "provisional", stufe: "hinweis" })).toMatch(/unbekannt/);
  });
  it("Zurückstufen auf ungeprüft löscht den Prüfvermerk; Entfernen mit null; beides protokolliert", () => {
    const a = mit({ ...RW });
    const r = zus(a, mitE(a, { regelwerte: { "ANLAGEN-BESETZUNG-01": { ...RW, pruefstatus: "provisional", stufe: "hinweis" } } }));
    const w = r.mandant.einstellungen.regelwerte["ANLAGEN-BESETZUNG-01"];
    expect(w.geprueftAm).toBeUndefined();
    expect(w.geprueftVon).toBeUndefined();
    const weg = zus(r.mandant, mitE(r.mandant, { regelwerte: { "ANLAGEN-BESETZUNG-01": null } }));
    expect(weg.mandant.einstellungen.regelwerte).toEqual({});
    expect(weg.mandant.einstellungen.modulprotokoll.map((x) => x.art)).toEqual(["regelwert", "regelwert-entfernt"]);
  });
  it("Regelwerte, die beim Schreiben fehlen, bleiben; unverändert zurückgeschickt behalten sie Wann/Wer", () => {
    const a = mit({ ...RW });
    const r = zus(a, mitE(a, { regelwerte: { "ANLAGEN-BESETZUNG-01": { ...RW } } }));
    expect(r.mandant.einstellungen.regelwerte["ANLAGEN-BESETZUNG-01"]).toEqual(RW);
    expect(r.mandant.einstellungen.modulprotokoll).toBeUndefined();
    const leer = zus(a, mitE(a, { regelwerte: {} }));
    expect(leer.mandant.einstellungen.regelwerte["ANLAGEN-BESETZUNG-01"]).toEqual(RW);
  });
});

/* ------------------------------------------------------------------------ */
describe("G5 — keine Planungssperre aus Branchenmodulen", () => {
  it("die Befundart „branche“ sperrt nicht, auch mit Stufe „Achtung“", () => {
    expect(BEFUND_KATALOG.branche).toMatchObject({ sperrt: false });
  });
  it("Regelwerte kennen keine Sperre: höchste zulässige Stufe ist „achtung“", () => {
    expect(BM.REGELWERT_STUFEN).toEqual(["hinweis", "achtung"]);
    for (const r of REGELN_BRANCHEN) expect(r.hoechsteStufe, r.id).toBe("hinweis");
  });
});

/* ------------------------------------------------------------------------ */
describe("Rechte-Invariante: Modulaktivierung erweitert kein Rollenrecht", () => {
  it("Rechtematrix, darf und Schreibumfang sind mit und ohne eingeschaltete Module gleich", () => {
    const vorher = kopie(MATRIX);
    const g = branchenbestand({ pakete: ["sicherheit", "pflege", "klinik", "industrie"],
      branchenmodule: Object.fromEntries(ZWOELF.map((id) => [id, { an: true }])) });
    void bestandFuerRolle(g, SITZUNGEN.LT);
    expect(MATRIX).toEqual(vorher);
    expect(Object.fromEntries(Object.keys(MATRIX).map((r) => [r, schreibumfang(r)]))).toEqual({
      leitung: "voll", planer: "voll", subplaner: "einheit", mitarbeiter: "eigenes", betriebsrat: "nein", kunde: "voll" });
    for (const rolle of Object.keys(MATRIX)) {
      for (const recht of MATRIX.leitung) expect(darf(rolle, recht), `${rolle}/${recht}`).toBe(MATRIX[rolle].includes(recht) && !(rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)));
    }
  });
  it("die Sicht jeder Rolle unterscheidet sich mit und ohne Schalter nur in den Einstellungen", () => {
    const aus = branchenbestand({ pakete: ["sicherheit"] });
    const an = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: { an: true }, wachbuch: { an: true } } });
    for (const r of Object.keys(SITZUNGEN)) {
      const ohne = kopie(bestandFuerRolle(aus, SITZUNGEN[r])), mitM = kopie(bestandFuerRolle(an, SITZUNGEN[r]));
      delete ohne.mandanten[0].einstellungen; delete mitM.mandanten[0].einstellungen;
      expect(mitM, r).toEqual(ohne);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("Sicht: nur, was die Rolle braucht", () => {
  const g = () => branchenbestand({ pakete: ["sicherheit"], branchenmodule: {
    wachbuch: { an: false, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "l1",
      mitbestimmung: { grundlage: "BV-GEHEIM-GRUNDLAGE", bestaetigtAm: "2026-10-01T00:00:00.000Z", bestaetigtVon: "l1" } } } });
  const mitRegel = () => {
    const x = g();
    x.mandanten[0].einstellungen.regelwerte = { "POSTEN-QUAL-01": { quelle: "q", fundstelle: "f", version: "1", gueltigAb: "2026-01-01", gueltigBis: null,
      pruefstatus: "verified", stufe: "achtung", geprueftAm: "t", geprueftVon: "l1", geaendertAm: "t", geaendertVon: "l1" } };
    x.mandanten[0].einstellungen.modulprotokoll = [{ art: "eingeschaltet", modul: "wachbuch", am: "t", von: "l1", grundlage: "BV-GEHEIM-GRUNDLAGE" }];
    return x;
  };
  it("Beschäftigte und Schichtverantwortung: Schalter, Zeitpunkte und Regelwerte — ohne Wer, ohne Grundlage, ohne Protokoll", () => {
    for (const r of ["MA", "SV"]) {
      const e = bestandFuerRolle(mitRegel(), SITZUNGEN[r]).mandanten[0].einstellungen;
      expect(e.branchenmodule.wachbuch, r).toEqual({ an: false, geaendertAm: "2026-11-01T00:00:00.000Z",
        mitbestimmung: { bestaetigtAm: "2026-10-01T00:00:00.000Z" } });
      expect(e.modulprotokoll, r).toBeUndefined();
      expect(e.regelwerte["POSTEN-QUAL-01"], r).toEqual({ quelle: "q", fundstelle: "f", version: "1", gueltigAb: "2026-01-01", gueltigBis: null,
        pruefstatus: "verified", stufe: "achtung", geprueftAm: "t", geaendertAm: "t" });
      expect(JSON.stringify(e), r).not.toMatch(/BV-GEHEIM-GRUNDLAGE|"l1"/);
      expect(e.ruhezeit, r).toBe(11);                    // übrige Einstellungen unverändert
    }
  });
  it("Betriebsrat: Aktivierungsstand und Mitbestimmungsbestätigung samt Protokoll", () => {
    const e = bestandFuerRolle(mitRegel(), SITZUNGEN.BR).mandanten[0].einstellungen;
    expect(e.branchenmodule).toEqual(mitRegel().mandanten[0].einstellungen.branchenmodule);
    expect(e.modulprotokoll).toEqual(mitRegel().mandanten[0].einstellungen.modulprotokoll);
  });
  it("Planung, Leitung, Kundenrolle: alles", () => {
    for (const r of ["PL", "LT", "KD"])
      expect(bestandFuerRolle(mitRegel(), SITZUNGEN[r]).mandanten[0].einstellungen, r).toEqual(mitRegel().mandanten[0].einstellungen);
  });
  it("Rundweg der gekürzten Sicht verliert nichts (Planung schreibt, Beschäftigte schreiben eigenes)", () => {
    for (const r of ["PL", "MA", "SV"]) {
      const v = schreibeAls(mitRegel(), r, () => {});
      expect(v.verweigert, r).toBeFalsy();
      expect(v.mandanten[0].einstellungen, r).toEqual(mitRegel().mandanten[0].einstellungen);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("Wiederherstellen, Auskunft und Betriebsprotokoll", () => {
  it("Wiederherstellen: Schalter, Bestätigungen, Regelwerte und Protokoll bleiben, wie sie heute sind", () => {
    const heute = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { wachbuch: { an: false, geaendertAm: "t2", geaendertVon: "l1" } } });
    heute.mandanten[0].einstellungen.modulprotokoll = [{ art: "ausgeschaltet", modul: "wachbuch", am: "t2", von: "l1" }];
    const sicherung = kopie(heute);
    sicherung.mandanten[0].einstellungen.branchenmodule = { wachbuch: { an: true, geaendertAm: "t1", geaendertVon: "l1" } };
    sicherung.mandanten[0].einstellungen.regelwerte = { "POSTEN-QUAL-01": { pruefstatus: "verified", stufe: "achtung", quelle: "q", fundstelle: "f", version: "1", gueltigAb: "2026-01-01", geprueftAm: "t" } };
    sicherung.mandanten[0].einstellungen.modulprotokoll = [];
    sicherung.mandanten[0].einstellungen.ruhezeit = 12;
    const w = betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT, { marke: "m1" });
    expect(w.verweigert).toBeUndefined();
    const e = w.bestand.mandanten[0].einstellungen;
    expect(e.ruhezeit).toBe(12);                                     // übrige Einstellungen aus der Sicherung
    expect(e.branchenmodule).toEqual(heute.mandanten[0].einstellungen.branchenmodule);
    expect(e.regelwerte).toBeUndefined();
    expect(e.modulprotokoll).toEqual(heute.mandanten[0].einstellungen.modulprotokoll);
  });
  it("Auskunft (Art. 15): eigene Handlungen im Modulprotokoll", () => {
    const m = betrieb({ wachbuch: { an: false } });
    m.einstellungen.modulprotokoll = [{ art: "eingeschaltet", modul: "wachbuch", am: "t1", von: "l1", grundlage: "BV" },
      { art: "ausgeschaltet", modul: "wachbuch", am: "t2", von: "k1" }];
    const a = auskunftBauen(m, m.personen[0], { raum: "r", erstellt: "2026-11-03T10:00:00.000Z", umfang: "selbst" });
    expect(a.modulhandlungen).toEqual([m.einstellungen.modulprotokoll[0]]);
    const ohne = auskunftBauen(m, m.personen[4], { raum: "r", erstellt: "2026-11-03T10:00:00.000Z", umfang: "selbst" });
    expect(ohne.modulhandlungen).toBeUndefined();
  });
  it("Zeilen fürs Betriebsprotokoll: Modul und Art — ohne Person, Grundlage, Person|Tag oder Schutzmerkmal", () => {
    expect(typeof BM.modulProtokollZeilen).toBe("function");
    const alt = branchenbestand({ pakete: ["sicherheit"] });
    const neu = kopie(alt);
    neu.mandanten[0].einstellungen.modulprotokoll = [
      { art: "eingeschaltet", modul: "wachbuch", am: "2026-11-03T10:00:00.000Z", von: "l1", grundlage: "BV MUTTERSCHUTZ a1|2026-11-03" },
      { art: "regelwert", regelId: "POSTEN-QUAL-01", am: "2026-11-03T10:00:00.000Z", von: "l1", stufe: "achtung", pruefstatus: "verified" }];
    const z = BM.modulProtokollZeilen(alt, neu);
    expect(z).toEqual(["Branchenmodul wachbuch eingeschaltet (Mitbestimmung bestätigt)", "Regelwert POSTEN-QUAL-01: achtung, verified"]);
    for (const x of z) expect(x).not.toMatch(/l1|\||MUTTERSCHUTZ|JUGENDSCHUTZ|BV|\d{2}:\d{2}/);
    expect(BM.modulProtokollZeilen(neu, neu)).toEqual([]);
    expect(BM.modulProtokollZeilen(null, null)).toEqual([]);
  });
  it("das Modulprotokoll hat eine Grenze; Ausschalten geht auch an der Grenze", () => {
    const voll = Array.from({ length: BM.MODULPROTOKOLL_GRENZE }, (_, i) => ({ art: "parameter", modul: "testmodul", am: String(i), von: "l1" }));
    const a = mitE(betrieb({ testmodul: { an: true, geaendertAm: "t", geaendertVon: "l1" } }), { modulprotokoll: voll });
    expect(zus(a, mitE(a, { branchenmodule: { testmodul: { an: true, parameter: { intervall: 30 } } } })).grund).toMatch(/Grenze/);
    const r = zus(a, mitE(a, { branchenmodule: { testmodul: { an: false } } }));
    expect(r.grund).toBeUndefined();
    expect(r.mandant.einstellungen.modulprotokoll).toHaveLength(BM.MODULPROTOKOLL_GRENZE + 1);
  });
});
