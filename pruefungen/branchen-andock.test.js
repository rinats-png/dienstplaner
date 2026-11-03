/* ==========================================================================
   BRANCHENMODULE — Andockpunkte A1 bis A3 nach WP-22 (WP-19)

   A1  Befundart „branche" im Befundkatalog: Hinweis, sperrt nie.
   A2  einteilungsBefunde hängt die Befunde aktiver Branchenmodule an —
       nur, wenn der Aufrufer die Besetzung des Dienstes kennt
       (k.branchen.personenImDienst; die Oberfläche). Der Server rechnet in
       seiner Nachrechnung (Häppchen) keine Branchenbefunde: Sie sperren
       nicht und warnen nicht bestätigungspflichtig, er setzt sie also nicht
       durch.
   A3  Der Regelbaukasten ist serverfähig (server/lib/regelbaukasten.mjs) —
       eine Rechnung für Oberfläche und Server, wie regelwerk.mjs in WP-22.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { BEFUND_KATALOG, sperrtBefund } from "../server/lib/bestaetigungen.mjs";
import { SPERR_REGELN, stufeRang } from "../src/warnstufen.js";
import { SERVER_REGELN } from "../server/lib/schutzdurchsetzung.mjs";
import { einteilungsBefunde } from "../server/lib/fachpruefung.mjs";
import { BRANCHEN_BEFUNDART, REGELN_BRANCHEN } from "../server/lib/branchenkatalog.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { branchenBefunde } from "../server/lib/branchenbefunde.mjs";
import * as SERVER_BAUKASTEN from "../server/lib/regelbaukasten.mjs";
import * as SRC_BAUKASTEN from "../src/regelbaukasten.js";
import { STUFE_RANG, stufeRangRegel } from "../server/lib/regelgeltung.mjs";
import { begrenzeStufe, gilt, wirkung, PRUEFSTATUS, FOLGEN } from "../src/regelregister.js";
import { branchenbestand } from "./hilfen/branchenbetrieb.mjs";

const MO = "2026-11-02";
const PRESSE = { id: "bm1", art: "anlage", name: "Presse 1", personId: null, mindestBesetzung: { F: 2 },
  laufzeit: { wochentage: [true, true, true, true, true, false, false] } };
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" || x.id === "maschinenqual" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = (module = { anlagen: { an: true } }) => ({ ...branchenbestand({ pakete: ["industrie"], branchenmodule: module }).mandanten[0],
  betriebsmittel: [PRESSE] });
const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
const k = (m, extra = {}) => ({ dienstAm: () => null, alleinOhnePartner: () => false, heute: MO, ...extra });
const nurBranche = (liste) => liste.filter((b) => b.regel === "branche");

describe("A1 — Befundkatalog", () => {
  it("„branche“ steht im Katalog: Hinweis, sperrt nicht — auch in der Oberfläche", () => {
    expect(BEFUND_KATALOG.branche).toEqual(BRANCHEN_BEFUNDART.branche);
    expect(sperrtBefund("branche")).toBe(false);
    expect(SPERR_REGELN.branche).toBe(false);
  });
  it("der Server setzt Branchenbefunde nicht durch", () => {
    expect(SERVER_REGELN).not.toContain("branche");
  });
});

describe("A2 — einteilungsBefunde", () => {
  it("aktives Modul, Besetzung bekannt: Branchenbefund als Hinweis, sperrt nie", () => {
    const m = betrieb();
    const p = m.personen[4];
    const b = nurBranche(einteilungsBefunde(m, p, F, MO, k(m, { branchen: { personenImDienst: () => [p], module: AKTIV } })));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "branche", regelId: "ANLAGEN-BESETZUNG-01", stufe: "hinweis", art: "branche" });
    for (const x of b) expect(sperrtBefund(x.regel)).toBe(false);
  });
  it("inaktives Modul erzeugt keine Befunde — geplant (Registry), ausgeschaltet, ohne Paket", () => {
    const p = betrieb().personen[4];
    const ohne = (m, module) => nurBranche(einteilungsBefunde(m, p, F, MO, k(m, { branchen: { personenImDienst: () => [p], module } })));
    expect(ohne(betrieb(), undefined)).toEqual([]);                                  // echte Registry: geplant
    expect(ohne(betrieb({}), AKTIV)).toEqual([]);                                    // ausgeschaltet
    expect(ohne({ ...betrieb(), pakete: [] }, AKTIV)).toEqual([]);                   // Paket fehlt
  });
  it("ohne Besetzung des Dienstes (Nachrechnung des Servers): keine Branchenbefunde, sonst unverändert", () => {
    const m = betrieb();
    const p = m.personen[4];
    const mit = einteilungsBefunde(m, p, F, MO, k(m));
    expect(nurBranche(mit)).toEqual([]);
    const ohneBranchenfeld = einteilungsBefunde({ ...m, betriebsmittel: [] }, p, F, MO, k(m));
    expect(mit).toEqual(ohneBranchenfeld);
  });
  it("branchenBefunde sammelt die Module und bleibt bei Hinweis", () => {
    const m = betrieb({ anlagen: { an: true }, maschinenqual: { an: true } });
    const p = m.personen[4];
    const b = branchenBefunde(m, F, MO, { personenImDienst: () => [p], heute: MO, module: AKTIV });
    expect(b.map((x) => x.regelId).sort()).toEqual(["ANLAGEN-BESETZUNG-01", "MASCHQUAL-BESETZUNG-01"]);
    for (const x of b) expect(x.stufe).toBe("hinweis");
  });
});

describe("A3 — Regelbaukasten serverfähig", () => {
  const regel = REGELN_BRANCHEN.find((r) => r.id === "ANLAGEN-BESETZUNG-01");
  const fall = { personen: [{ id: "a", merkmale: [] }], datum: MO };
  it("Server und Oberfläche rechnen mit derselben Fassung und kommen zum selben Ergebnis", () => {
    const r = { ...regel, parameter: { anforderungen: [{ art: "anzahl", min: 2 }] } };
    expect(SERVER_BAUKASTEN.pruefeRegel(r, fall)).toEqual(SRC_BAUKASTEN.pruefeRegel(r, fall));
    expect(SERVER_BAUKASTEN.pruefeRegel(r, fall).befund.stufe).toBe("hinweis");
  });
  it("der Server findet Branchenregeln über ihre Kennung; Unbekanntes wirft", () => {
    expect(SERVER_BAUKASTEN.pruefeRegel("ANLAGEN-BESETZUNG-01", fall).status).toBe("erfuellt");
    expect(() => SERVER_BAUKASTEN.pruefeRegel("GIBTS-NICHT-01", fall)).toThrow(/nicht im Register/);
  });
  it("Geltung, Wirkung, Prüfstatus und Folgen gibt es nur einmal (Register liest aus dem Server)", () => {
    expect(PRUEFSTATUS.provisional.wirkung).toBe("hinweis");
    expect(FOLGEN).toContain("bestaetigung");
    expect(wirkung({ pruefstatus: "watchlist" })).toBe("keine");
    expect(gilt({ gueltigAb: "2027-01-01" }, MO)).toBe(false);
    expect(begrenzeStufe(regel, "recht")).toBe("hinweis");
  });
  it("Stufenrang im Server wie in den Warnstufen", () => {
    for (const s of ["hinweis", "achtung", "recht", "unbekannt", null]) expect(stufeRangRegel(s)).toBe(stufeRang(s));
    expect(Object.keys(STUFE_RANG)).toEqual(["hinweis", "achtung", "recht"]);
  });
});
