/* ==========================================================================
   INTELLIGENCE-GATEWAY — ANBIETER-SCHNITTSTELLE, ATTRAPPE, LIVE-STUMPF (WP-I13)

   Vertrag des Adapters, Fehlerklassen, Fristen und Wiederholungen,
   deterministisches Verhalten der Attrappe, und: der Live-Stumpf spricht
   mit niemandem und wirft „nicht freigegeben“.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { inspect } from "node:util";
import { AnbieterFehler, anbieterPruefen, aufrufen, alsAnbieterFehler, nutzungBereinigen, ANBIETER_FEHLERKLASSEN } from "../server/lib/intelligence/gateway/anbieter.mjs";
import { erzeugeAttrappe, ATTRAPPE_MODI } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { erzeugeLiveAnbieter, LIVE_SCHALTER_NAME, LIVE_SCHLUESSEL_NAME } from "../server/lib/intelligence/gateway/anbieter-live.mjs";

const PAKET = { fakten: [{ id: "f.0", feld: "dienstart.beginn", art: "zeit", wert: "06:00", ref: "D_BCDFGHJK" }] };
const EIN = { funktion: "F2", stufe: 1, schemaVersion: "1.0", paket: PAKET, fremdtext: null };
const KEIN_WARTEN = () => Promise.resolve();
const lauf = (anbieter, o = {}) => aufrufen({ anbieter, eingabe: EIN, zeitJeVersuchMs: 100, maxWiederholungen: 2, deadline: Date.now() + 1000,
  jetzt: Date.now, schlafen: KEIN_WARTEN, ...o });
const klasse = async (p) => { try { await p; return "ok"; } catch (e) { return e.klasse || `?${e}`; } };

describe("Adapter-Vertrag", () => {
  it("verlangt id (Muster), modellOrt lokal|extern und erzeuge()", () => {
    expect(() => anbieterPruefen(erzeugeAttrappe())).not.toThrow();
    for (const schlecht of [null, undefined, {}, "x", { id: "a", modellOrt: "extern" }, { id: "a", modellOrt: "irgendwo", erzeuge() {} },
      { id: "A B", modellOrt: "extern", erzeuge() {} }, { id: "", modellOrt: "extern", erzeuge() {} }, { id: "a", erzeuge() {} }])
      expect(() => anbieterPruefen(schlecht), JSON.stringify(schlecht)).toThrow();
  });
  it("Fehlerklassen sind geschlossen; unbekannt → nicht_verfuegbar; nur begrenzt/nicht_verfuegbar sind wiederholbar", () => {
    expect(new AnbieterFehler("erfunden").klasse).toBe("nicht_verfuegbar");
    const w = ANBIETER_FEHLERKLASSEN.filter((k) => new AnbieterFehler(k).wiederholbar);
    expect(w.sort()).toEqual(["begrenzt", "nicht_verfuegbar"]);
  });
  it("jeder fremde Fehler verliert seinen Text (kein Name, kein Schlüssel verlässt das Gateway)", () => {
    const f = alsAnbieterFehler(new Error("Anna Weberknecht sk-live-123456"));
    expect(f.message).toBe("Anbieterfehler");
    expect(JSON.stringify(f)).not.toMatch(/Anna|sk-live/);
    expect(alsAnbieterFehler(new AnbieterFehler("zeit", "Anna")).message).toBe("Anbieterfehler");
    expect(alsAnbieterFehler("kein Error").klasse).toBe("nicht_verfuegbar");
  });
  it("Nutzungsangaben sind Fremdwerte: nur endliche, nicht negative Zahlen", () => {
    expect(nutzungBereinigen({ eingabeToken: 10.9, ausgabeToken: 5 })).toEqual({ eingabeToken: 10, ausgabeToken: 5 });
    for (const x of [null, undefined, "x", { eingabeToken: -1, ausgabeToken: NaN }, { eingabeToken: Infinity, ausgabeToken: "7" }, { eingabeToken: 1e12 }])
      expect(nutzungBereinigen(x)).toEqual({ eingabeToken: null, ausgabeToken: null });
  });
});

describe("Fristen, Wiederholungen, Abbruch", () => {
  it("Erfolg beim ersten Mal", async () => {
    const r = await lauf(erzeugeAttrappe());
    expect(r.versuche).toBe(1);
    expect(r.ausgabe).toBeTruthy();
  });
  it("wiederholbare Fehler: höchstens maxWiederholungen, dann Fehler; nicht wiederholbare nie", async () => {
    const a = erzeugeAttrappe({ modus: "fehler" });
    expect(await klasse(lauf(a))).toBe("nicht_verfuegbar");
    expect(a.aufrufe.length).toBe(3);
    const b = erzeugeAttrappe({ modus: "begrenzt" });
    expect(await klasse(lauf(b, { maxWiederholungen: 0 }))).toBe("begrenzt");
    expect(b.aufrufe.length).toBe(1);
    for (const k of ["ungueltig", "zu_gross", "nicht_freigegeben", "zeit"]) {
      const c = { id: "t", modellOrt: "extern", n: 0, erzeuge() { this.n++; throw new AnbieterFehler(k); } };
      expect(await klasse(lauf(c))).toBe(k);
      expect(c.n, k).toBe(1);
    }
  });
  it("Wiederholung nur, wenn bis zur Deadline noch minRestMs bleiben", async () => {
    const a = erzeugeAttrappe({ modus: "fehler" });
    expect(await klasse(lauf(a, { minRestMs: 5000 }))).toBe("nicht_verfuegbar");
    expect(a.aufrufe.length).toBe(1);
  });
  it("Zeitüberschreitung: Fehlerklasse zeit, Abbruchsignal gesetzt, rechtzeitig zurück", async () => {
    const a = erzeugeAttrappe({ modus: "zeitueberschreitung" });
    const t0 = Date.now();
    expect(await klasse(lauf(a, { zeitJeVersuchMs: 30 }))).toBe("zeit");
    expect(Date.now() - t0).toBeLessThan(500);
    expect(a.aufrufe[0].signal.aborted).toBe(true);
    expect(a.aufrufe.length).toBe(1);   // nicht wiederholt
  });
  it("Frist je Versuch wird auf die Restzeit bis zur Deadline gekürzt; abgelaufene Deadline → kein Aufruf", async () => {
    const a = erzeugeAttrappe({ modus: "zeitueberschreitung" });
    const t0 = Date.now();
    expect(await klasse(lauf(a, { zeitJeVersuchMs: 5000, deadline: Date.now() + 40 }))).toBe("zeit");
    expect(Date.now() - t0).toBeLessThan(600);
    const b = erzeugeAttrappe();
    expect(await klasse(lauf(b, { deadline: Date.now() - 1 }))).toBe("zeit");
    expect(b.aufrufe.length).toBe(0);
  });
  it("ein Adapter, der synchron wirft oder null/Unsinn liefert, wird zu einer Fehlerklasse", async () => {
    expect(await klasse(lauf({ id: "t", modellOrt: "extern", erzeuge() { throw new Error("sync"); } }, { maxWiederholungen: 0 }))).toBe("nicht_verfuegbar");
    expect(await klasse(lauf({ id: "t", modellOrt: "extern", erzeuge: async () => null }))).toBe("ungueltig");
  });
  it("A1: die Eingabe ist eine eingefrorene Kopie — Verändern wirkt nicht auf das Original", async () => {
    const original = structuredClone(PAKET);
    const a = { id: "t", modellOrt: "extern", erzeuge: async (e) => { try { e.paket.fakten[0].wert = "99:99"; } catch { /* eingefroren */ } return { ausgabe: { text: "x" } }; } };
    await lauf(a, { eingabe: { ...EIN, paket: original } });
    expect(original.fakten[0].wert).toBe("06:00");
  });
});

describe("Attrappe: deterministisch, ohne Netz, jeder Modus bildet ein Verhalten nach", () => {
  it("gleiche Eingabe → gleiche Ausgabe (ok)", async () => {
    const x = await erzeugeAttrappe().erzeuge(EIN);
    const y = await erzeugeAttrappe().erzeuge(EIN);
    expect(x).toEqual(y);
    expect(x.ausgabe.text).toContain("dienstart.beginn 06:00");
  });
  it("unbekannter Modus wirft; alle Modi sind benannt", () => {
    expect(() => erzeugeAttrappe({ modus: "sonstwas" })).toThrow();
    expect(ATTRAPPE_MODI.length).toBeGreaterThanOrEqual(14);
  });
  it("meldet sich als extern (strengster Pfad der Datenminimierung)", () => {
    expect(erzeugeAttrappe().modellOrt).toBe("extern");
  });
  it("Modus skript ohne Skript → ungültig", async () => {
    expect(await klasse(erzeugeAttrappe({ modus: "skript" }).erzeuge(EIN))).toBe("ungueltig");
  });
});

describe("Live-Stumpf: spricht mit niemandem", () => {
  it("ohne Umgebung: wirft nicht freigegeben, Klasse nicht_freigegeben, nicht wiederholbar", async () => {
    const a = erzeugeLiveAnbieter();
    await expect(a.erzeuge(EIN)).rejects.toMatchObject({ klasse: "nicht_freigegeben", message: expect.stringContaining("nicht freigegeben") });
    expect(new AnbieterFehler("nicht_freigegeben").wiederholbar).toBe(false);
  });
  it("nur Schalter ODER nur Schlüssel: nicht freigegeben", async () => {
    for (const env of [{ [LIVE_SCHALTER_NAME]: "ja" }, { [LIVE_SCHLUESSEL_NAME]: "k".repeat(40) }, { [LIVE_SCHALTER_NAME]: "1", [LIVE_SCHLUESSEL_NAME]: "k".repeat(40) },
      { [LIVE_SCHALTER_NAME]: "ja", [LIVE_SCHLUESSEL_NAME]: "kurz" }, { [LIVE_SCHALTER_NAME]: "JA", [LIVE_SCHLUESSEL_NAME]: "k".repeat(40) }])
      await expect(erzeugeLiveAnbieter({ env }).erzeuge(EIN), JSON.stringify(Object.keys(env))).rejects.toMatchObject({ klasse: "nicht_freigegeben" });
  });
  it("auch mit Schalter UND Schlüssel: noch kein Netzcode — wirft weiterhin (WP-I18)", async () => {
    const env = { [LIVE_SCHALTER_NAME]: "ja", [LIVE_SCHLUESSEL_NAME]: "k".repeat(40) };
    await expect(erzeugeLiveAnbieter({ env }).erzeuge(EIN)).rejects.toMatchObject({ klasse: "nicht_freigegeben", message: expect.stringContaining("WP-I18") });
  });
  it("L4: der Schlüssel steht in keiner Eigenschaft, keiner Meldung, keinem JSON, keinem Inspect", async () => {
    const geheim = "sk-geheim-" + "x".repeat(30);
    const a = erzeugeLiveAnbieter({ env: { [LIVE_SCHALTER_NAME]: "ja", [LIVE_SCHLUESSEL_NAME]: geheim } });
    let fehler;
    try { await a.erzeuge(EIN); } catch (e) { fehler = e; }
    const alles = [JSON.stringify(a), String(fehler.message), JSON.stringify(Object.getOwnPropertyNames(a)), JSON.stringify(fehler), fehler.stack, inspect(a, { showHidden: true, depth: 5 })].join("|");
    expect(alles).not.toContain(geheim);
    expect(Object.isFrozen(a)).toBe(true);
  });
  it("passt in den Adaptervertrag (damit das Gateway es überhaupt annimmt) und wird im Gateway zum Rückfall", () => {
    expect(() => anbieterPruefen(erzeugeLiveAnbieter())).not.toThrow();
  });
});
