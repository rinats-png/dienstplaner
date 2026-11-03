/* ==========================================================================
   REGELWERTE DER INDUSTRIEMODULE (WP-19.11, 19.12) — Adapter bis WP-19.0

   Geprüft wird: Definitionen ohne erfundene Werte (Sollzeit und Freischicht
   ohne Ausgangswert), Form und Grenzen je Eintrag, wirksamer Wert (Betrieb vor
   Ausgangswert, Gültigkeit, „nicht gesetzt“), Schreibweg (nur org.edit, 422,
   Server setzt Wer und Wann, Kern-Einträge gehen durch) und die Einträge im
   Branchenkatalog (provisional, höchstens Hinweis).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  INDUSTRIE_REGELWERTE, regelwertDef, regelwertEintrag, pruefeRegelwert, regelwertWirksam, industrieRegelwerteZusammen,
} from "../server/lib/modul-regelwerte.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { branchenbestand, schreibeAls } from "./hilfen/branchenbetrieb.mjs";

const ID = "MASCHQUAL-INTERVALL-01";
const E = (x = {}) => ({ wert: 24, quelle: "Betriebsanweisung 7", fundstelle: "Abschnitt 3", version: "2026-1", pruefstatus: "provisional", ...x });
const betrieb = (regelwerte) => ({ einstellungen: regelwerte === undefined ? {} : { regelwerte } });

describe("Definitionen", () => {
  it("fünf Kennungen; Ausgangswerte nur dort, wo es einen ungeprüften Startwert gibt — Sollzeit und Freischicht haben keinen", () => {
    expect(Object.keys(INDUSTRIE_REGELWERTE).sort()).toEqual(
      ["KONTI-ARBEITSZEIT-01", "KONTI-FREISCHICHT-01", "KONTI-RICHTWERT-NACHT-01", "KONTI-RICHTWERT-SERIE-01", "MASCHQUAL-INTERVALL-01"]);
    expect(regelwertDef(ID).ausgangswert).toBe(12);
    expect(regelwertDef("KONTI-RICHTWERT-SERIE-01").ausgangswert).toBe(5);
    expect(regelwertDef("KONTI-RICHTWERT-NACHT-01").ausgangswert).toBe(3);
    expect(regelwertDef("KONTI-ARBEITSZEIT-01").ausgangswert).toBeNull();
    expect(regelwertDef("KONTI-FREISCHICHT-01").ausgangswert).toBeNull();
    expect(regelwertDef("GIBT-ES-NICHT")).toBeNull();
    for (const d of Object.values(INDUSTRIE_REGELWERTE)) { expect(d.fachnachweis).toMatch(/^FN-\d\d$/); expect(d.ausgangswertText).toBeTruthy(); }
  });
  it("Katalog: jede Kennung steht als vorläufige Branchenregel mit Obergrenze „Hinweis“ im Register", () => {
    for (const id of Object.keys(INDUSTRIE_REGELWERTE)) {
      const r = REGELN_BRANCHEN.find((x) => x.id === id);
      expect(r, id).toBeTruthy();
      expect(r).toMatchObject({ pruefstatus: "provisional", hoechsteStufe: "hinweis", regelstand: null, modul: INDUSTRIE_REGELWERTE[id].modul });
      expect(r.pruefhinweis).toContain(INDUSTRIE_REGELWERTE[id].fachnachweis);
    }
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
});

describe("pruefeRegelwert", () => {
  it("gültig: vorläufig mit und ohne Quelle, geprüft mit Quelle und Fundstelle", () => {
    expect(pruefeRegelwert(ID, E())).toBeNull();
    expect(pruefeRegelwert(ID, { wert: 6, pruefstatus: "provisional" })).toBeNull();
    expect(pruefeRegelwert(ID, E({ pruefstatus: "geprueft" }))).toBeNull();
    expect(pruefeRegelwert("KONTI-ARBEITSZEIT-01", { wert: 37.5, pruefstatus: "provisional" })).toBeNull();
  });
  it("ungültig: Kennung, Form, Wert, Grenzen, Ganzzahl, Längen, Tage, Reihenfolge, Prüfstatus, geprüft ohne Beleg", () => {
    const fehler = [
      [{ wert: 1 }, "x"], [ID, null], [ID, []], [ID, E({ extra: 1 })], [ID, E({ wert: "12" })], [ID, E({ wert: NaN })],
      [ID, E({ wert: 0 })], [ID, E({ wert: 121 })], [ID, E({ wert: 12.5 })],
      ["KONTI-ARBEITSZEIT-01", { wert: 0.5, pruefstatus: "provisional" }], ["KONTI-ARBEITSZEIT-01", { wert: 61, pruefstatus: "provisional" }],
      [ID, E({ quelle: "x".repeat(201) })], [ID, E({ fundstelle: "x".repeat(121) })], [ID, E({ version: "x".repeat(41) })], [ID, E({ quelle: 5 })],
      [ID, E({ gueltigAb: "2026-02-30" })], [ID, E({ gueltigBis: "morgen" })], [ID, E({ gueltigAb: "2026-05-01", gueltigBis: "2026-04-01" })],
      [ID, E({ pruefstatus: "verifiziert" })], [ID, E({ pruefstatus: undefined })],
      [ID, E({ pruefstatus: "geprueft", quelle: "" })], [ID, E({ pruefstatus: "geprueft", quelle: "  " })], [ID, E({ pruefstatus: "geprueft", fundstelle: "" })],
    ];
    for (const [id, e] of fehler) expect(pruefeRegelwert(id, e), JSON.stringify([id, e])).toBeTruthy();
  });
});

describe("regelwertWirksam: Betrieb vor Ausgangswert, nie ein stiller Standard", () => {
  it("ohne Eintrag: Ausgangswert als „ungeprüft“ — oder nicht gesetzt, wo es keinen gibt", () => {
    expect(regelwertWirksam(betrieb(), ID)).toMatchObject({ wert: 12, herkunft: "ausgangswert", pruefstatus: "provisional", geprueft: false, fachnachweis: "FN-26" });
    expect(regelwertWirksam(betrieb(), ID).hinweis).toMatch(/zu prüfen/);
    expect(regelwertWirksam(betrieb(), "KONTI-ARBEITSZEIT-01")).toMatchObject({ wert: null, herkunft: "nicht-gesetzt", geprueft: false });
    expect(regelwertWirksam(null, "KONTI-FREISCHICHT-01")).toMatchObject({ wert: null, herkunft: "nicht-gesetzt" });
  });
  it("Eintrag des Betriebs gilt; vorläufig bleibt vorläufig, geprüft braucht auch den Serververmerk", () => {
    expect(regelwertWirksam(betrieb({ [ID]: E() }), ID)).toMatchObject({ wert: 24, herkunft: "betrieb", pruefstatus: "provisional", quelle: "Betriebsanweisung 7", fundstelle: "Abschnitt 3", version: "2026-1" });
    const ohneStempel = regelwertWirksam(betrieb({ [ID]: E({ pruefstatus: "geprueft" }) }), ID);
    expect(ohneStempel.geprueft).toBe(false);                                   // geprueftAm fehlt: nicht vom Server bestätigt
    const mitStempel = regelwertWirksam(betrieb({ [ID]: E({ pruefstatus: "geprueft", geprueftAm: "2026-11-01" }) }), ID);
    expect(mitStempel).toMatchObject({ geprueft: true, pruefstatus: "geprueft", hinweis: null });
  });
  it("Gültigkeit: vor Beginn und nach Ende gilt der Ausgangswert, mit Hinweis", () => {
    const r = betrieb({ [ID]: E({ gueltigAb: "2027-01-01" }) });
    expect(regelwertWirksam(r, ID, "2026-11-03")).toMatchObject({ wert: 12, herkunft: "ausgangswert" });
    expect(regelwertWirksam(r, ID, "2026-11-03").hinweis).toMatch(/ab 2027-01-01/);
    expect(regelwertWirksam(r, ID, "2027-01-01")).toMatchObject({ wert: 24, herkunft: "betrieb" });
    const e = betrieb({ [ID]: E({ gueltigBis: "2026-12-31" }) });
    expect(regelwertWirksam(e, ID, "2026-12-31").wert).toBe(24);
    expect(regelwertWirksam(e, ID, "2027-01-01")).toMatchObject({ wert: 12, herkunft: "ausgangswert" });
    expect(regelwertWirksam(e, "KONTI-ARBEITSZEIT-01", "2027-01-01").wert).toBeNull();
  });
  it("ein ungültig gespeicherter Eintrag bleibt unbeachtet", () => {
    expect(regelwertWirksam(betrieb({ [ID]: { wert: -3, pruefstatus: "provisional" } }), ID)).toMatchObject({ wert: 12, herkunft: "ausgangswert" });
    expect(regelwertEintrag(betrieb({ [ID]: "text" }), ID)).toBeNull();
    expect(() => regelwertWirksam(betrieb(), "GIBT-ES-NICHT")).toThrow();
  });
});

describe("Schreibweg industrieRegelwerteZusammen", () => {
  const alt = (r) => ({ einstellungen: { ruhezeit: 11, ...(r ? { regelwerte: r } : {}) } });
  const neu = (r) => ({ einstellungen: { ruhezeit: 11, regelwerte: r } });
  const S = { person: "l1" };
  it("mit org.edit: gültiger Eintrag wird gespeichert, Wer und Wann setzt der Server, Fremdes wird ignoriert", () => {
    const r = industrieRegelwerteZusammen(alt(), neu({ [ID]: E({ geaendertVon: "fremd", geaendertAm: "2000-01-01", geprueftAm: "2000-01-01" }) }), S, true, "2026-11-03");
    const e = r.mandant.einstellungen.regelwerte[ID];
    expect(e).toMatchObject({ wert: 24, quelle: "Betriebsanweisung 7", pruefstatus: "provisional", geaendertVon: "l1" });
    expect(e.geaendertAm).not.toBe("2000-01-01");
    expect(e).not.toHaveProperty("geprueftAm");
  });
  it("geprüft: Quelle und Fundstelle Pflicht; Geprüft-Am und -Von setzt der Server", () => {
    const r = industrieRegelwerteZusammen(alt(), neu({ [ID]: E({ pruefstatus: "geprueft" }) }), S, true, "2026-11-03");
    expect(r.mandant.einstellungen.regelwerte[ID]).toMatchObject({ pruefstatus: "geprueft", geprueftAm: "2026-11-03", geprueftVon: "l1" });
    const ohne = industrieRegelwerteZusammen(alt(), neu({ [ID]: E({ pruefstatus: "geprueft", fundstelle: "" }) }), S, true);
    expect(ohne).toMatchObject({ status: 422 });
    expect(ohne.grund).toMatch(/Fundstelle/);
  });
  it("Formfehler und unbekannte Kennung mit Industrie-Präfix: 422, nichts gespeichert", () => {
    expect(industrieRegelwerteZusammen(alt(), neu({ [ID]: E({ wert: 500 }) }), S, true)).toMatchObject({ status: 422 });
    expect(industrieRegelwerteZusammen(alt(), neu({ "KONTI-ERFUNDEN-01": E() }), S, true)).toMatchObject({ status: 422 });
    expect(industrieRegelwerteZusammen(alt(), { einstellungen: { regelwerte: [] } }, S, true)).toMatchObject({ status: 422 });
  });
  it("ohne org.edit: der gespeicherte Stand dieser Kennungen bleibt; Löschen und Ändern wirken nicht", () => {
    const gespeichert = { ...E(), geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1" };
    const r1 = industrieRegelwerteZusammen(alt({ [ID]: gespeichert }), neu({ [ID]: E({ wert: 99 }) }), S, false);
    expect(r1.mandant.einstellungen.regelwerte[ID]).toEqual(gespeichert);
    const r2 = industrieRegelwerteZusammen(alt({ [ID]: gespeichert }), { einstellungen: { ruhezeit: 11 } }, S, false);
    expect(r2.mandant.einstellungen.regelwerte[ID]).toEqual(gespeichert);
    const r3 = industrieRegelwerteZusammen(alt(), neu({ [ID]: E() }), S, false);
    expect(r3.mandant.einstellungen.regelwerte).toBeUndefined();
  });
  it("unverändert: Wann und Wer bleiben; entfernt (mit org.edit): zurückgesetzt auf den Ausgangswert", () => {
    const gespeichert = { ...E(), geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1" };
    const gleich = industrieRegelwerteZusammen(alt({ [ID]: gespeichert }), neu({ [ID]: E() }), { person: "k9" }, true);
    expect(gleich.mandant.einstellungen.regelwerte[ID]).toEqual(gespeichert);
    const weg = industrieRegelwerteZusammen(alt({ [ID]: gespeichert }), neu({}), S, true);
    expect(weg.mandant.einstellungen.regelwerte).toBeUndefined();
  });
  it("Einträge des Kerns (WP-19.0) gehen unberührt durch, auch ohne org.edit", () => {
    const kernEintrag = { wert: 3, pruefstatus: "geprueft" };
    const r = industrieRegelwerteZusammen(alt({ "ZZ-ANDERS-01": kernEintrag }), neu({ "ZZ-ANDERS-01": { wert: 4 }, [ID]: E() }), S, false);
    expect(r.mandant.einstellungen.regelwerte["ZZ-ANDERS-01"]).toEqual({ wert: 4 });
    expect(r.mandant.einstellungen.regelwerte[ID]).toBeUndefined();
  });
  it("kein Eintrag, nichts zu tun: Betrieb unverändert zurück", () => {
    const n = { einstellungen: { ruhezeit: 11 } };
    expect(industrieRegelwerteZusammen(alt(), n, S, true).mandant).toBe(n);
    expect(industrieRegelwerteZusammen(alt(), { name: "x" }, S, true).mandant).toEqual({ name: "x" });
  });
});

describe("Über den Serverweg (zusammenfuehren)", () => {
  const g = () => branchenbestand({ pakete: ["industrie"] });
  it("Leitung speichert, Planung nicht; Formfehler 422", () => {
    const lt = schreibeAls(g(), "LT", (m) => { m.einstellungen.regelwerte = { [ID]: E() }; });
    expect(lt.verweigert).toBeFalsy();
    expect(lt.mandanten[0].einstellungen.regelwerte[ID]).toMatchObject({ wert: 24, geaendertVon: "l1" });
    const pl = schreibeAls(g(), "PL", (m) => { m.einstellungen.regelwerte = { [ID]: E() }; });
    expect((pl.verweigert ? g() : pl).mandanten[0].einstellungen.regelwerte).toBeUndefined();
    const schlecht = schreibeAls(g(), "LT", (m) => { m.einstellungen.regelwerte = { [ID]: E({ wert: 0 }) }; });
    expect(schlecht).toMatchObject({ status: 422 });
    expect(schlecht.verweigert).toMatch(/Wert/);
  });
});
