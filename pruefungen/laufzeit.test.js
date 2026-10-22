/* ==========================================================================
   PRÜFSTATUS DER QUELLE ≠ LAUFZEIT EINES BESTANDSRECHNERS

   Fahrzeit, PPP-RL und Tarifvorlagen stehen als „provisional" im Register,
   weil ihre Quellen noch nicht im Regelstand geprüft sind. Das darf die
   Bewertung dessen, was diese Module längst rechnen, nicht ändern. Die Regel
   „provisional bremst auf Hinweis" gilt für neu eingeführte Regeln.

   Geprüft wird: (1) die Module kennen das Register nicht und können von ihm
   nicht beeinflusst werden, (2) ihre Urteile sind festgehalten, (3) das
   Register stuft ihre Regeln nicht herab.

   Aufruf: npm run pruefung:laufzeit
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pruefeTag, pruefeWoche as fahrWoche } from "../src/fahrzeit.js";
import { pruefeWoche as pppWoche, richtwerte, BERUFSGRUPPEN } from "../src/ppprl.js";
import { TARIFWERKE, anwenden } from "../src/tarifwerke.js";
import { REGELN, begrenzeStufe, regel } from "../src/regelregister.js";
import { pruefeRegel } from "../src/regelbaukasten.js";

const lies = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const MODULE_REGELN = REGELN.filter((r) => r.laufzeit === "bestand");

describe("Die Rechner kennen das Register nicht", () => {
  it.each(["fahrzeit.js", "ppprl.js", "tarifwerke.js"])("%s importiert weder Register noch Baukasten", (datei) => {
    const quelle = lies(datei).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(quelle).not.toMatch(/regelregister|regelbaukasten|begrenzeStufe/);
  });
});

describe("Urteile vor und nach der Registeranbindung sind gleich", () => {
  it("PPP-RL: grün, gelb, rot, grau", () => {
    const heute = "2026-09-09";
    const basis = { bereich: "psych_erwachsene", art: "vollstationaer", datum: heute };
    const soll = richtwerte(basis.bereich, basis.art, heute, null).werte;
    const volles = (pat, f = 1) => Object.fromEntries(BERUFSGRUPPEN.map((g) => [g.id, Math.round(soll[g.id] * pat * f)]));
    expect(pppWoche({ ...basis, patienten: 20, minuten: volles(20) }).urteil).toBe("gruen");
    expect(pppWoche({ ...basis, patienten: 20, minuten: volles(20, 0.95) }).urteil).toBe("gelb");
    expect(pppWoche({ ...basis, patienten: 20, minuten: volles(20, 0.8) }).urteil).toBe("rot");
    expect(pppWoche({ ...basis, patienten: null, minuten: volles(20) }).urteil).toBe("grau");
  });

  it("Fahrzeit: Verlängerung ist Info, Überschreitung ist hart, fehlende Zeit ist grau", () => {
    const hart = (r) => r.befunde.filter((b) => b.schwere === "danger");
    expect(pruefeTag({ datum: "2026-09-09", lenkzeit: 9 * 60, unterbrechungen: [45] }).urteil).toBe("gruen");
    const ver = pruefeTag({ datum: "2026-09-09", lenkzeit: 10 * 60, unterbrechungen: [45] }, 0);
    expect(ver.verlaengerung).toBe(true);
    expect(hart(ver)).toEqual([]);
    const zuviel = pruefeTag({ datum: "2026-09-09", lenkzeit: 11 * 60, unterbrechungen: [45] }, 0);
    expect(hart(zuviel).length).toBeGreaterThan(0);
    expect(pruefeTag({ datum: "2026-09-09", lenkzeit: null }).urteil).toBe("grau");
    expect(typeof fahrWoche).toBe("function");
  });

  it("Tarif: eine Vorlage setzt genau ihre Werte und vermerkt Quelle und Stand am Betrieb", () => {
    const t = TARIFWERKE[0];
    const m = { einstellungen: {}, zuschlaege: [] };
    const r = anwenden(m, t.id, "2026-10-22");
    expect(r.mandant.einstellungen.wochenstunden).toBe(t.einstellungen.wochenstunden);
    expect(r.mandant.einstellungen.ruhezeit).toBe(t.einstellungen.ruhezeit);
    expect(r.mandant.tarifwerk).toMatchObject({ id: t.id, stand: t.stand, quelle: t.quelle, angewendet: "2026-10-22" });
    expect(r.geaendert.length).toBeGreaterThan(0);
  });
});

describe("Das Register stuft Bestandsrechner nicht herab", () => {
  it("es gibt Registerzeilen für alle drei Gruppen", () => {
    expect(MODULE_REGELN.some((r) => r.id.startsWith("FAHRZEIT-"))).toBe(true);
    expect(MODULE_REGELN.some((r) => r.id.startsWith("PPPRL-"))).toBe(true);
    expect(MODULE_REGELN.some((r) => r.id.startsWith("TARIF-"))).toBe(true);
  });

  it("trotz Prüfstatus provisional: jede Stufe bleibt, wie sie ist", () => {
    for (const r of MODULE_REGELN) {
      expect(r.pruefstatus, r.id).toBe("provisional");
      for (const s of ["hinweis", "achtung", "recht"]) expect(begrenzeStufe(r, s), `${r.id} ${s}`).toBe(s);
      expect(begrenzeStufe(r.id, "recht"), r.id).toBe("recht");
    }
  });

  it("der Baukasten rechnet sie nicht (kein zweiter Rechner)", () => {
    for (const r of MODULE_REGELN) expect(() => pruefeRegel(r, {}), r.id).toThrow(/Bestandsregel/);
  });

  it("neu eingeführte vorläufige Regeln bleiben gebremst", () => {
    for (const id of ["BESCH-WERKSTUDENT-01", "BESCH-KURZFRISTIG-01", "QUOTE-BRANDSCHUTZ-01", "KOPPLUNG-EUP-EFK-01"]) {
      expect(regel(id).laufzeit, id).toBeUndefined();
      expect(begrenzeStufe(id, "recht"), id).toBe("hinweis");
    }
  });

  it("watchlist und deprecated wirken auch bei einem Bestandsrechner nicht", () => {
    expect(begrenzeStufe({ ...MODULE_REGELN[0], pruefstatus: "watchlist" }, "recht")).toBeNull();
    expect(begrenzeStufe({ ...MODULE_REGELN[0], pruefstatus: "deprecated" }, "recht")).toBeNull();
  });
});
