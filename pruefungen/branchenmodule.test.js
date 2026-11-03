/* ==========================================================================
   BRANCHENMODULE — gemeinsamer Kern (WP-19, Phase 2)

   Vertragstest für die Modul-Registry, die Aktivierung je Betrieb und den
   Katalog-Erweiterungspunkt. Was hier festgehalten ist, gilt für jedes der
   zwölf Module; ein Modul bringt zusätzlich eigene Prüfungen mit
   (pruefungen/modul-<id>.test.js).

   Fachliche Regeln stehen hier nicht. Bis zur Nutzerentscheidung ist jedes
   Modul „geplant", lässt sich nicht einschalten, und jede Branchenregel ist
   vorläufig — höchstens ein Hinweis, nie eine Sperre.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  BRANCHENMODULE, MODUL_STATUS, PARAMETER_TYPEN, modulVon, modulGebucht, modulEinstellung, modulAktiv,
  modulParameter, pruefeModulEinstellung, pruefeModulRegistry, branchenmoduleZusammen,
} from "../server/lib/branchenmodule.mjs";
import {
  REGELN_BRANCHEN, BRANCHEN_BEFUNDART, branchenregel, pruefeBranchenkatalog, stufeFuerBranchenregel,
  alsEinteilungsBefund,
} from "../server/lib/branchenkatalog.mjs";
import { PAKETE } from "../src/stufen.js";
import { REGELN, pruefeRegister, begrenzeStufe } from "../src/regelregister.js";
import { BEFUND_KATALOG, sperrtBefund } from "../server/lib/bestaetigungen.mjs";
import { branchenbestand, schreibeAls } from "./hilfen/branchenbetrieb.mjs";

/* Die zwölf verkauften Module (Leistungsbeschreibung der Pakete in src/stufen.js). */
const ZWOELF = ["posten", "wachbuch", "objektbericht", "bereichsplan", "pflegequal", "bereitschaftsdienst",
  "geteilterdienst", "funktionsdienst", "rotation", "anlagen", "maschinenqual", "kontimodelle"];

/** Ein Testmodul, das sich einschalten lässt — die echten sind bis zur Entscheidung „geplant". */
const TESTMODUL = Object.freeze({
  id: "testmodul", merkmal: "testmodul", name: "Testmodul", pakete: ["sicherheit"], status: "vorlaeufig",
  abhaengigVon: [], mitbestimmung: false, datenfelder: [], regelIds: [],
  parameter: {
    intervallMinuten: { typ: "zahl", standard: 120, min: 15, max: 720, vorlaeufig: true },
    modus: { typ: "auswahl", standard: "hinweis", werte: ["hinweis", "aus"], vorlaeufig: true },
    mitFoto: { typ: "boolean", standard: false, vorlaeufig: true },
    bezeichnung: { typ: "text", standard: "", maxLaenge: 40, vorlaeufig: false },
  },
});
const MIT_TEST = [...BRANCHENMODULE, TESTMODUL];

describe("Modul-Registry", () => {
  it("führt genau die zwölf verkauften Module, je einmal", () => {
    expect(BRANCHENMODULE.map((x) => x.id).sort()).toEqual([...ZWOELF].sort());
  });

  it("jedes Modul hängt an den Paketen, die sein Merkmal verkaufen (src/stufen.js) — keine zweite Liste, die driftet", () => {
    for (const mod of BRANCHENMODULE) {
      const verkauft = PAKETE.filter((p) => !p.pflicht && p.merkmale.includes(mod.merkmal)).map((p) => p.id).sort();
      expect(verkauft.length, mod.id).toBeGreaterThan(0);
      expect([...mod.pakete].sort(), mod.id).toEqual(verkauft);
    }
  });

  it("die Registry ist in sich stimmig (Vertrag)", () => {
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeModulRegistry(MIT_TEST)).toEqual([]);
  });

  it("der Vertragsprüfer findet typische Fehler", () => {
    const kaputt = [
      { ...TESTMODUL, id: "a", merkmal: "a", status: "fertig" },
      { ...TESTMODUL, id: "b", merkmal: "b", abhaengigVon: ["gibtsnicht"] },
      { ...TESTMODUL, id: "c", merkmal: "c", parameter: { x: { typ: "farbe", standard: 1 } } },
      { ...TESTMODUL, id: "d", merkmal: "d", parameter: { x: { typ: "zahl", standard: 5, min: 10, max: 20 } } },
      { ...TESTMODUL, id: "e", merkmal: "e", pakete: [] },
      { ...TESTMODUL, id: "e", merkmal: "e2" },
      { ...TESTMODUL, id: "f", merkmal: "f", regelIds: ["NICHT-DA-01"] },
    ];
    const m = pruefeModulRegistry(kaputt).join("\n");
    for (const teil of ["a: Status", "b: Abhängigkeit", "c: Parameter x", "d: Parameter x", "e: kein Paket", "e: Kennung doppelt", "f: Regel NICHT-DA-01"])
      expect(m).toContain(teil);
  });

  it("Status und Parametertypen sind abschließend", () => {
    expect(MODUL_STATUS).toEqual(["geplant", "vorlaeufig", "freigegeben"]);
    expect(PARAMETER_TYPEN).toEqual(["boolean", "zahl", "text", "auswahl"]);
  });

  it("bis zur Nutzerentscheidung ist kein Modul freigegeben", () => {
    for (const mod of BRANCHENMODULE) expect(mod.status, mod.id).not.toBe("freigegeben");
  });

  it("modulVon kennt jedes Modul und sonst nichts", () => {
    expect(modulVon("posten").name).toBeTruthy();
    expect(modulVon("gibtsnicht")).toBeNull();
    expect(modulVon("__proto__")).toBeNull();
  });
});

describe("Aktivierung je Betrieb", () => {
  const betrieb = (pakete, branchenmodule) => branchenbestand({ pakete, branchenmodule }).mandanten[0];

  it("gebucht ist ein Modul nur über ein Paket, das es verkauft", () => {
    expect(modulGebucht(betrieb(["sicherheit"]), "wachbuch")).toBe(true);
    expect(modulGebucht(betrieb(["pflege"]), "wachbuch")).toBe(false);
    expect(modulGebucht(betrieb([]), "wachbuch")).toBe(false);
    expect(modulGebucht({}, "wachbuch")).toBe(false);
    expect(modulGebucht(betrieb(["sicherheit"]), "gibtsnicht")).toBe(false);
  });

  it("aktiv ist ein Modul nur, wenn es gebucht, nicht mehr geplant und vom Betrieb eingeschaltet ist", () => {
    const an = { testmodul: { an: true } };
    expect(modulAktiv(betrieb(["sicherheit"], an), "testmodul", MIT_TEST)).toBe(true);
    expect(modulAktiv(betrieb(["sicherheit"], {}), "testmodul", MIT_TEST)).toBe(false);          // Vorgabe: aus
    expect(modulAktiv(betrieb([], an), "testmodul", MIT_TEST)).toBe(false);                      // Paket abbestellt
    expect(modulAktiv(betrieb(["sicherheit"], { testmodul: { an: "ja" } }), "testmodul", MIT_TEST)).toBe(false);
    /* Ein geplantes Modul wirkt nie, auch wenn ein Schalter gespeichert ist. */
    expect(modulAktiv(betrieb(["sicherheit"], { posten: { an: true } }), "posten")).toBe(false);
  });

  it("Parameter: Vorgaben aus der Registry, gültige gespeicherte Werte gewinnen, ungültige fallen zurück", () => {
    const m = betrieb(["sicherheit"], { testmodul: { an: true, parameter: { intervallMinuten: 60, modus: "kaputt" } } });
    expect(modulParameter(m, "testmodul", MIT_TEST)).toEqual({ intervallMinuten: 60, modus: "hinweis", mitFoto: false, bezeichnung: "" });
    expect(modulParameter(betrieb([]), "testmodul", MIT_TEST)).toEqual({ intervallMinuten: 120, modus: "hinweis", mitFoto: false, bezeichnung: "" });
    expect(modulParameter(betrieb([]), "gibtsnicht")).toEqual({});
    expect(modulEinstellung(betrieb([]), "testmodul")).toBeNull();
  });

  it("die Form einer Moduleinstellung wird streng geprüft", () => {
    const ok = (w) => expect(pruefeModulEinstellung("testmodul", w, MIT_TEST), JSON.stringify(w)).toBeNull();
    const nein = (w) => expect(pruefeModulEinstellung("testmodul", w, MIT_TEST), JSON.stringify(w)).toBeTruthy();
    ok({ an: true }); ok({ an: false, parameter: { intervallMinuten: 15 } }); ok({ an: true, parameter: { bezeichnung: "Nord" } });
    nein(null); nein([]); nein({}); nein({ an: "ja" }); nein({ an: true, x: 1 });
    nein({ an: true, parameter: { unbekannt: 1 } }); nein({ an: true, parameter: { intervallMinuten: 5 } });
    nein({ an: true, parameter: { intervallMinuten: 30.5 } }); nein({ an: true, parameter: { modus: "sperren" } });
    nein({ an: true, parameter: { mitFoto: 1 } }); nein({ an: true, parameter: { bezeichnung: "x".repeat(41) } });
    nein({ an: true, parameter: [] });
    expect(pruefeModulEinstellung("gibtsnicht", { an: true })).toMatch(/unbekannt/);
  });
});

describe("Schreiben der Moduleinstellungen (Server, RECHTEMATRIX)", () => {
  /* Die Funktion direkt: darfOrgEdit ist das Recht der Rolle. */
  const alt = (bm) => branchenbestand({ pakete: ["sicherheit"], branchenmodule: bm }).mandanten[0];
  const neu = (m, bm) => ({ ...m, einstellungen: { ...m.einstellungen, branchenmodule: bm } });
  const SITZ = { person: "l1" };

  it("org.edit schaltet ein; Wann und Wer setzt der Server", () => {
    const a = alt(undefined);
    const r = branchenmoduleZusammen(a, neu(a, { testmodul: { an: true, geaendertVon: "x", geaendertAm: "1999" } }), SITZ, true, MIT_TEST);
    expect(r.grund).toBeUndefined();
    const e = r.mandant.einstellungen.branchenmodule.testmodul;
    expect(e).toMatchObject({ an: true, geaendertVon: "l1" });
    expect(e.geaendertAm).not.toBe("1999");
  });

  it("ohne org.edit bleibt der gespeicherte Stand — auch beim Versuch, ihn zu löschen", () => {
    const a = alt({ testmodul: { an: true, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "l1" } });
    const r = branchenmoduleZusammen(a, neu(a, { testmodul: { an: false } }), SITZ, false, MIT_TEST);
    expect(r.mandant.einstellungen.branchenmodule).toEqual(a.einstellungen.branchenmodule);
    const weg = { ...a, einstellungen: { ruhezeit: 11 } };
    expect(branchenmoduleZusammen(a, weg, SITZ, false, MIT_TEST).mandant.einstellungen.branchenmodule).toEqual(a.einstellungen.branchenmodule);
  });

  it("fehlt das Feld in der Übermittlung, bleibt der gespeicherte Stand (ältere Oberfläche)", () => {
    const a = alt({ testmodul: { an: true, geaendertAm: "t", geaendertVon: "l1" } });
    const r = branchenmoduleZusammen(a, { ...a, einstellungen: { ruhezeit: 11 } }, SITZ, true, MIT_TEST);
    expect(r.mandant.einstellungen.branchenmodule).toEqual(a.einstellungen.branchenmodule);
  });

  it("unbekannte Module, falsche Form, ungebuchte und geplante Module weist der Server ab", () => {
    const a = alt(undefined);
    expect(branchenmoduleZusammen(a, neu(a, { gibtsnicht: { an: true } }), SITZ, true, MIT_TEST).grund).toMatch(/unbekannt/);
    expect(branchenmoduleZusammen(a, neu(a, { testmodul: { an: "ja" } }), SITZ, true, MIT_TEST).grund).toMatch(/Branchenmodul/);
    expect(branchenmoduleZusammen(a, neu(a, ["x"]), SITZ, true, MIT_TEST).grund).toMatch(/Branchenmodul/);
    const ohnePaket = { ...a, pakete: [] };
    expect(branchenmoduleZusammen(ohnePaket, neu(ohnePaket, { testmodul: { an: true } }), SITZ, true, MIT_TEST).grund).toMatch(/nicht gebucht/);
    expect(branchenmoduleZusammen(a, neu(a, { posten: { an: true } }), SITZ, true).grund).toMatch(/noch nicht verfügbar/);
  });

  it("Ausschalten geht immer — auch nach Abbestellen des Pakets", () => {
    const a = { ...alt({ testmodul: { an: true, geaendertAm: "t", geaendertVon: "l1" } }), pakete: [] };
    const r = branchenmoduleZusammen(a, neu(a, { testmodul: { an: false } }), SITZ, true, MIT_TEST);
    expect(r.grund).toBeUndefined();
    expect(r.mandant.einstellungen.branchenmodule.testmodul).toMatchObject({ an: false, geaendertVon: "l1" });
  });

  it("ein unveränderter Eintrag behält Wann und Wer; ein anderer Eintrag ändert ihn nicht", () => {
    const a = alt({ testmodul: { an: true, geaendertAm: "t0", geaendertVon: "l0" } });
    const r = branchenmoduleZusammen(a, neu(a, { testmodul: { an: true } }), SITZ, true, MIT_TEST);
    expect(r.mandant.einstellungen.branchenmodule.testmodul).toEqual({ an: true, geaendertAm: "t0", geaendertVon: "l0" });
  });

  it("über den Schreibweg des Servers: Leitung und Kundenrolle schalten, Planung und Schichtverantwortung nicht", () => {
    /* Die echten Module sind geplant: Einschalten wird abgewiesen — für jede Rolle mit org.edit. */
    const g = branchenbestand({ pakete: ["sicherheit"] });
    for (const r of ["LT", "KD"]) {
      const v = schreibeAls(g, r, (m) => { m.einstellungen.branchenmodule = { wachbuch: { an: true } }; });
      expect(v.verweigert, r).toMatch(/noch nicht verfügbar/);
    }
    /* Planung: kein org.edit — der gespeicherte Stand bleibt, nichts wird eingeschaltet. */
    const pl = schreibeAls(g, "PL", (m) => { m.einstellungen.branchenmodule = { wachbuch: { an: true } }; });
    expect(pl.verweigert).toBeFalsy();
    expect((pl.mandanten[0].einstellungen || {}).branchenmodule).toBeUndefined();
    /* Gespeicherter Stand bleibt für die Planung unverändert. */
    const g2 = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { wachbuch: { an: false, geaendertAm: "t", geaendertVon: "l1" } } });
    const pl2 = schreibeAls(g2, "PL", (m) => { m.einstellungen.branchenmodule = { wachbuch: { an: true } }; });
    expect(pl2.mandanten[0].einstellungen.branchenmodule).toEqual({ wachbuch: { an: false, geaendertAm: "t", geaendertVon: "l1" } });
    /* Leitung: Ausschalten (Rundweg mit an:false) ist erlaubt und bekommt Wer/Wann vom Server. */
    const lt = schreibeAls(g2, "LT", (m) => { m.einstellungen.branchenmodule = { wachbuch: { an: false } }; });
    expect(lt.verweigert).toBeFalsy();
    expect(lt.mandanten[0].einstellungen.branchenmodule.wachbuch).toEqual({ an: false, geaendertAm: "t", geaendertVon: "l1" });
  });

  it("die Pakete selbst bleiben Vertragsfeld: die Leitung bucht kein Paket dazu", () => {
    const g = branchenbestand({ pakete: [] });
    const lt = schreibeAls(g, "LT", (m) => { m.pakete = ["sicherheit"]; });
    if (!lt.verweigert) expect(lt.mandanten[0].pakete).toEqual([]);
  });
});

describe("Katalog-Erweiterungspunkt (Regelregister)", () => {
  it("die Branchenregeln stehen im einen Regelregister — keine zweite Liste", () => {
    for (const r of REGELN_BRANCHEN) expect(REGELN.some((x) => x.id === r.id), r.id).toBe(true);
    expect(pruefeRegister()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
  });

  it("branchenregel() erzeugt nur vorläufige Einträge mit Modul, Branchenbereich und Hinweis-Deckel", () => {
    const r = branchenregel({ id: "WACHBUCH-TEST-01", modul: "wachbuch", typ: "zaehlregel", bezeichnung: "Test",
      ebene: "betrieb", hoechsteStufe: "recht", scope: { branche: ["sicherheit"] },
      parameter: { ereignis: "x", fenster: { art: "kalendermonat" }, richtung: "mindestens", grenze: 1 },
      pruefhinweis: "nur Test", pruefstatus: "verified", regelstand: "2026.09" });
    expect(r.pruefstatus).toBe("provisional");
    expect(r.regelstand).toBeNull();
    expect(r.hoechsteStufe).toBe("hinweis");
    expect(r.scope).toEqual({ branche: ["sicherheit"], bundesland: null, beschaeftigungsmodell: null });
    expect(pruefeRegister([r])).toEqual([]);
    expect(pruefeBranchenkatalog([r])).toEqual([]);
    /* Das Register selbst deckelt sie ebenfalls (begrenzeStufe). */
    expect(begrenzeStufe(r, "recht")).toBe("hinweis");
  });

  it("der Katalogprüfer verlangt ein bekanntes Modul, einen Branchenbereich und einen Prüfhinweis", () => {
    const basis = { id: "X-TEST-01", typ: "grenzregel", bezeichnung: "x", ebene: "betrieb",
      parameter: { groesse: "a", hoechstens: 1 }, pruefhinweis: "p", scope: { branche: ["pflege"] } };
    const m = pruefeBranchenkatalog([
      branchenregel({ ...basis, id: "A-TEST-01", modul: "gibtsnicht" }),
      branchenregel({ ...basis, id: "B-TEST-01", modul: "wachbuch", scope: {} }),
      { ...branchenregel({ ...basis, id: "C-TEST-01", modul: "wachbuch" }), pruefstatus: "verified" },
      { ...branchenregel({ ...basis, id: "D-TEST-01", modul: "wachbuch" }), laufzeit: "bestand" },
    ]).join("\n");
    for (const teil of ["A-TEST-01: Modul", "B-TEST-01: Branchenbereich", "C-TEST-01: vorläufig", "D-TEST-01: laufzeit"])
      expect(m).toContain(teil);
  });

  it("Stufe einer Branchenregel: vorläufig höchstens Hinweis, beobachtet und abgelöst nie", () => {
    const r = branchenregel({ id: "Y-TEST-01", modul: "posten", typ: "grenzregel", bezeichnung: "y", ebene: "betrieb",
      parameter: { groesse: "a", hoechstens: 1 }, pruefhinweis: "p", scope: { branche: ["sicherheit"] } });
    expect(stufeFuerBranchenregel(r, "recht")).toBe("hinweis");
    expect(stufeFuerBranchenregel(r, "achtung")).toBe("hinweis");
    expect(stufeFuerBranchenregel(r, "hinweis")).toBe("hinweis");
    expect(stufeFuerBranchenregel(r, null)).toBeNull();
    expect(stufeFuerBranchenregel({ ...r, pruefstatus: "watchlist" }, "hinweis")).toBeNull();
    expect(stufeFuerBranchenregel({ ...r, pruefstatus: "deprecated" }, "hinweis")).toBeNull();
    expect(stufeFuerBranchenregel(null, "hinweis")).toBeNull();
  });

  it("Befunde aus Branchenregeln haben die Form von einteilungsBefunde und sperren nie", () => {
    const r = branchenregel({ id: "Z-TEST-01", modul: "posten", typ: "grenzregel", bezeichnung: "Postenregel", ebene: "betrieb",
      parameter: { groesse: "a", hoechstens: 1 }, pruefhinweis: "p", scope: { branche: ["sicherheit"] } });
    const b = alsEinteilungsBefund(r, { zustand: "verletzt", stufe: "recht", text: "zu viel" });
    expect(b).toEqual({ regel: "branche", regelId: "Z-TEST-01", modul: "posten", stufe: "hinweis", text: "zu viel",
      quelle: "Vorgabe des Betriebs (vorläufig)", art: "branche" });
    expect(alsEinteilungsBefund(r, { zustand: "erfuellt", stufe: null })).toBeNull();
    expect(alsEinteilungsBefund(r, { zustand: "nicht_anwendbar" })).toBeNull();
    const offen = alsEinteilungsBefund(r, { zustand: "offen", text: "Daten fehlen" });
    expect(offen).toMatchObject({ stufe: "hinweis", offen: true });
    expect(alsEinteilungsBefund({ ...r, pruefstatus: "watchlist" }, { zustand: "verletzt", stufe: "hinweis", text: "x" })).toBeNull();
    /* Die Befundart für den Befundkatalog: Hinweis, sperrt nicht. */
    expect(BRANCHEN_BEFUNDART).toEqual({ branche: { text: expect.any(String), quelle: expect.any(String), stufe: "hinweis", sperrt: false } });
  });

  it("Andockpunkt: der Befundkatalog sperrt Unbekanntes — „branche“ darf erst mit eigenem, nicht sperrendem Eintrag angedockt werden", () => {
    if (Object.prototype.hasOwnProperty.call(BEFUND_KATALOG, "branche")) {
      expect(BEFUND_KATALOG.branche.sperrt).toBe(false);
      expect(BEFUND_KATALOG.branche.stufe).toBe("hinweis");
    } else {
      /* Heute: noch nicht angedockt. Wer branchenBefunde in einteilungsBefunde einhängt,
         muss zuerst BRANCHEN_BEFUNDART in BEFUND_KATALOG übernehmen — sonst sperrt jeder Befund. */
      expect(sperrtBefund("branche")).toBe(true);
    }
  });
});
