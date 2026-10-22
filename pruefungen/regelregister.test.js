/* ==========================================================================
   REGELREGISTER

   Prüft, dass die Metadaten zu den Regeln stimmig sind, dass die Umstellung
   der Rechtsquellen-Tabelle nichts am Verhalten geändert hat, und dass eine
   noch nicht geprüfte Regel nie mehr als einen Hinweis erzeugen kann.

   Aufruf: npm run pruefung:register
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REGELN, PRUEFSTATUS, REGELARTEN, FOLGEN,
  regel, regelFuerArt, regelIdFuerArt, regelIdFuerSchutz, regelIdFuerBefund,
  rechtsquelleTabelle, gilt, wirkung, begrenzeStufe, regelnFuer, regelnImRegelstand,
  pruefeRegister, regelstandAbdeckung,
} from "../src/regelregister.js";
import { REGELSTAND, schutzBefunde, HOECHST_TAG, FREIE_SONNTAGE_MIN } from "../src/regelwerk.js";
import { RUHEZEIT_GESETZ, bestaetigungsEintraege } from "../src/warnstufen.js";
import { BESCHAEFTIGUNGSMODELLE } from "../src/beschaeftigung.js";

const vorher = JSON.parse(readFileSync(new URL("./hilfen/rechtsquelle-vorher.json", import.meta.url), "utf8"));

const fixture = (o = {}) => ({
  id: "TEST-REGEL-01", typ: "grenzregel", bezeichnung: "Testregel", ebene: "bund",
  quelle: "Testgesetz", fundstelle: "§ 1", gueltigAb: null, gueltigBis: null,
  pruefstatus: "verified", geprueftAm: "2026-10-22", regelstand: "2026.10",
  scope: { branche: null, bundesland: null, beschaeftigungsmodell: null },
  hoechsteStufe: "recht", folge: null, parameter: { groesse: "x", hoechstens: 1 }, ...o,
});

describe("Bestandsregression: die Rechtsquellen-Tabelle", () => {
  it("liefert dieselben Schlüssel und denselben Wortlaut wie vor der Umstellung", () => {
    expect(rechtsquelleTabelle()).toEqual(vorher);
  });

  it("hat zu jeder bisherigen Befundart eine Regel", () => {
    for (const art of Object.keys(vorher)) {
      expect(regelFuerArt(art), art).not.toBeNull();
      expect(regelFuerArt(art).anzeige, art).toEqual(vorher[art]);
    }
  });
});

describe("Metadaten", () => {
  it("das Register ist in sich stimmig", () => {
    expect(pruefeRegister()).toEqual([]);
  });

  it("jede Regel hat Kennung, Bezeichnung, Regelart, Ebene und Prüfstatus", () => {
    expect(REGELN.length).toBeGreaterThan(30);
    for (const r of REGELN) {
      expect(r.id, r.id).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*-\d{2}$/);
      expect(r.bezeichnung, r.id).toBeTruthy();
      expect(REGELARTEN[r.typ], r.id).toBeTruthy();
      expect(["bund", "land", "tarif", "betrieb"], r.id).toContain(r.ebene);
      expect(PRUEFSTATUS[r.pruefstatus], r.id).toBeTruthy();
      expect(r).toHaveProperty("gueltigAb");
      expect(r).toHaveProperty("gueltigBis");
      expect(r.scope, r.id).toHaveProperty("beschaeftigungsmodell");
    }
  });

  it("Regeln auf Bundes- oder Landesebene nennen ihre Quelle", () => {
    for (const r of REGELN.filter((x) => x.ebene !== "betrieb")) expect(r.quelle, r.id).toBeTruthy();
  });

  it("betriebliche Festlegungen behaupten keine Rechtsquelle", () => {
    for (const r of REGELN.filter((x) => x.ebene === "betrieb" && x.pruefstatus === "legacy_verified"))
      expect(r.anzeige ? r.anzeige.betrieblich : true, r.id).toBe(true);
  });

  it("Parameter der Bestandsregeln kommen aus den Konstanten der Prüfung, nicht aus einer zweiten Zahl", () => {
    expect(regel("AZ-RUHE-01").parameter.mindestRuhezeitStunden).toBe(RUHEZEIT_GESETZ);
    expect(regel("AZ-TAG-01").parameter.hoechstStunden).toBe(HOECHST_TAG);
    expect(regel("AZ-SONNTAG-01").parameter.mindestFreieSonntageJahr).toBe(FREIE_SONNTAGE_MIN);
  });

  it("Kennungen und Befundarten sind eindeutig", () => {
    expect(new Set(REGELN.map((r) => r.id)).size).toBe(REGELN.length);
    const arten = REGELN.filter((r) => r.art).map((r) => r.art);
    expect(new Set(arten).size).toBe(arten.length);
  });

  it("pruefeRegister meldet Mängel", () => {
    expect(pruefeRegister([fixture({ id: "falsch" })]).join()).toContain("Kennung");
    expect(pruefeRegister([fixture(), fixture()]).join()).toContain("doppelt");
    expect(pruefeRegister([fixture({ quelle: null })]).join()).toContain("Quelle fehlt");
    expect(pruefeRegister([fixture({ pruefstatus: "unklar" })]).join()).toContain("Prüfstatus");
    expect(pruefeRegister([fixture({ gueltigAb: "2026-05-01", gueltigBis: "2026-01-01" })]).join()).toContain("gueltigBis");
    expect(pruefeRegister([fixture({ pruefstatus: "provisional", regelstand: null })]).join()).toContain("Prüfhinweis");
    expect(pruefeRegister([fixture({ pruefstatus: "provisional", pruefhinweis: "x", regelstand: "2026.10" })]).join())
      .toContain("keinem Regelstand");
    expect(pruefeRegister([fixture({ parameter: null })]).join()).toContain("Parameter");
    expect(pruefeRegister([fixture({ hoechsteStufe: null })]).join()).toContain("höchste Stufe");
  });
});

describe("Zuordnung von Befunden zu Regeln", () => {
  it("Befundarten der Planprüfung finden ihre Regel", () => {
    expect(regelIdFuerArt("ruhezeit")).toBe("AZ-RUHE-01");
    expect(regelIdFuerArt("tagesgrenze")).toBe("AZ-TAG-01");
    expect(regelIdFuerArt("sonntagsfrei")).toBe("AZ-SONNTAG-01");
    expect(regelIdFuerArt("kompetenz")).toBe("KOMP-EINWEISUNG-01");
    expect(regelIdFuerArt("unbekannt")).toBeNull();
  });

  it("jeder Schutzbefund, den schutzBefunde() erzeugt, hat eine Regel im Register", () => {
    const nacht = { start: "22:00", ende: "06:00", pause: 45 };
    const lang = { start: "06:00", ende: "18:30", pause: 45 };
    const jugendlich = { geburtstag: "2010-01-01" };
    const gesehen = new Set();
    const lauf = (person, da, datum) => { for (const b of schutzBefunde(person, da, datum)) gesehen.add(b.regel); };
    lauf(jugendlich, nacht, "2026-10-14");                       // § 14, § 8 nicht
    lauf(jugendlich, lang, "2026-10-17");                        // § 8, §§ 16–17 (Samstag)
    lauf({ mutterschutz: true }, nacht, "2026-10-18");           // § 5, § 6 (Sonntag)
    lauf({ schwerbehindert: true }, lang, "2026-10-14");         // § 207
    expect([...gesehen].sort()).toEqual(["JArbSchG § 14", "JArbSchG § 8", "JArbSchG §§ 16–17",
      "MuSchG § 5", "MuSchG § 6", "SGB IX § 207"].sort());
    for (const text of gesehen) expect(regelIdFuerSchutz(text), text).not.toBeNull();
  });

  it("ein Schutzbefund der Planprüfung findet seine Regel über den Titel", () => {
    expect(regelIdFuerBefund({ art: "schutz", titel: "MuSchG § 5 — Nachtarbeit" })).toBe("MUSCHG-05");
  });

  it("ein Schutzbefund der Einteilungsprüfung findet seine Regel über die Quelle", () => {
    expect(regelIdFuerBefund({ art: "schutz", quelle: "JArbSchG § 14" })).toBe("JARBSCHG-14");
  });

  it("eine ausdrückliche Kennung am Befund hat Vorrang", () => {
    expect(regelIdFuerBefund({ art: "ruhezeit", regelId: "AZ-TAG-01" })).toBe("AZ-TAG-01");
  });

  it("das Bestätigungsprotokoll hält die Kennungen fest, ohne die Befunde zu verändern", () => {
    const best = { gelesen: true, grundArt: null, eintraege: [{ personId: "p1", datum: "2026-11-12", dienstId: "N",
      befunde: [{ stufe: "recht", text: "Ruhezeit 8 h", quelle: "§ 5 ArbZG", art: "ruhezeit", regelId: "AZ-RUHE-01" },
        { stufe: "achtung", text: "x", quelle: "y", art: "regel", regelId: null }] }] };
    const [e] = bestaetigungsEintraege(best, { personId: "s1", name: "S", rolle: "subplaner" },
      "einsprung", { neueId: () => "id", zeit: "2026-10-22T08:00:00.000Z", regelstand: REGELSTAND.version });
    expect(e.regelIds).toEqual(["AZ-RUHE-01"]);
    expect(e.befunde).toEqual([{ stufe: "recht", text: "Ruhezeit 8 h", quelle: "§ 5 ArbZG" },
      { stufe: "achtung", text: "x", quelle: "y" }]);
  });
});

describe("REGELSTAND und Einzelregeln", () => {
  it("REGELSTAND bleibt, was er war", () => {
    expect(REGELSTAND.version).toBe("2026.09");
    expect(Array.isArray(REGELSTAND.quellen)).toBe(true);
  });

  it("alle Bestandsregeln gehören zum aktuellen Regelstand und sind geprüft nach seinem Datum", () => {
    const bestand = REGELN.filter((r) => r.pruefstatus === "legacy_verified");
    expect(bestand.length).toBeGreaterThan(25);
    for (const r of bestand) {
      expect(r.regelstand, r.id).toBe(REGELSTAND.version);
      expect(r.geprueftAm, r.id).toBe(REGELSTAND.stand);
    }
    expect(regelnImRegelstand().map((r) => r.id)).toEqual(bestand.map((r) => r.id));
  });

  it("eine vorläufige Regel gehört zu keinem Regelstand", () => {
    const ids = regelnImRegelstand().map((r) => r.id);
    for (const r of REGELN.filter((x) => x.pruefstatus === "provisional")) {
      expect(r.regelstand, r.id).toBeNull();
      expect(ids).not.toContain(r.id);
    }
  });

  it("jede Quelle einer wirkenden Regel steht im Regelstand (Abdeckung, abgeleitet statt zweite Liste)", () => {
    expect(regelstandAbdeckung().ohneNennungImStand).toEqual([]);
  });

  it("jede Quelle des Regelstands hat eine Regel — außer den dokumentierten Ausnahmen", () => {
    /* GewO § 34a: hängt an den Qualifikationen des Betriebs (Branchenkatalog),
       nicht an einer Befundart der Planung. MiLoG § 17: Aufbewahrung der
       Arbeitszeitaufzeichnung (src/aufbewahrung.js), kein Planbefund.
       Kommt eine Quelle dazu, die keine Regel hat, schlägt dieser Test an. */
    expect(regelstandAbdeckung().ohneRegel).toEqual(["GewO", "MiLoG"]);
  });

  it("vorläufige Regeln und Watchlist zählen nicht in den Regelstand", () => {
    const a = regelstandAbdeckung([...REGELN.filter((r) => r.pruefstatus === "provisional")]);
    expect(a.ohneNennungImStand).toEqual([]);
  });
});

describe("Prüfstatus", () => {
  it("verified und legacy_verified wirken voll, provisional als Hinweis, watchlist und deprecated nie", () => {
    expect(wirkung(fixture({ pruefstatus: "verified" }))).toBe("voll");
    expect(wirkung(fixture({ pruefstatus: "legacy_verified" }))).toBe("voll");
    expect(wirkung(fixture({ pruefstatus: "provisional" }))).toBe("hinweis");
    expect(wirkung(fixture({ pruefstatus: "watchlist" }))).toBe("keine");
    expect(wirkung(fixture({ pruefstatus: "deprecated" }))).toBe("keine");
  });

  it("ein unbekannter Prüfstatus wirkt nicht", () => {
    expect(wirkung(fixture({ pruefstatus: "geraten" }))).toBe("keine");
    expect(wirkung(null)).toBe("keine");
  });
});

describe("Provisional Safety: eine ungeprüfte Regel erzeugt keinen Rechtsverstoß", () => {
  it("begrenzeStufe: vorläufig höchstens Hinweis, auch bei Regelgrenze „recht“", () => {
    const r = fixture({ pruefstatus: "provisional", hoechsteStufe: "recht" });
    expect(begrenzeStufe(r, "recht")).toBe("hinweis");
    expect(begrenzeStufe(r, "achtung")).toBe("hinweis");
    expect(begrenzeStufe(r, "hinweis")).toBe("hinweis");
  });

  it("watchlist und deprecated erzeugen keinen Befund", () => {
    expect(begrenzeStufe(fixture({ pruefstatus: "watchlist" }), "recht")).toBeNull();
    expect(begrenzeStufe(fixture({ pruefstatus: "deprecated" }), "recht")).toBeNull();
  });

  it("eine geprüfte Regel wird auf ihre Regelgrenze begrenzt, nie darüber", () => {
    const r = fixture({ pruefstatus: "verified", hoechsteStufe: "achtung" });
    expect(begrenzeStufe(r, "recht")).toBe("achtung");
    expect(begrenzeStufe(r, "hinweis")).toBe("hinweis");
  });

  it("Bestandsregeln werden nicht heruntergestuft (verhaltensneutral)", () => {
    for (const r of REGELN.filter((x) => x.pruefstatus === "legacy_verified")) {
      expect(begrenzeStufe(r, "recht"), r.id).toBe("recht");
      expect(begrenzeStufe(r, "achtung"), r.id).toBe("achtung");
      expect(begrenzeStufe(r, "hinweis"), r.id).toBe("hinweis");
    }
  });

  it("eine Regel außerhalb des Registers bleibt unberührt", () => {
    expect(begrenzeStufe("GIBT-ES-NICHT-01", "recht")).toBe("recht");
  });

  it("keine vorläufige Regel des Registers kann höher als Hinweis wirken", () => {
    const vorlaeufig = REGELN.filter((r) => r.pruefstatus === "provisional");
    expect(vorlaeufig.length).toBeGreaterThanOrEqual(5);
    for (const r of vorlaeufig) for (const s of ["hinweis", "achtung", "recht"])
      expect(begrenzeStufe(r, s), `${r.id} ${s}`).toBe("hinweis");
  });
});

describe("Gültigkeitszeitraum", () => {
  const r = fixture({ gueltigAb: "2026-01-01", gueltigBis: "2026-12-31" });

  it("gilt innerhalb, einschließlich der Grenzen", () => {
    expect(gilt(r, "2026-01-01")).toBe(true);
    expect(gilt(r, "2026-06-15")).toBe(true);
    expect(gilt(r, "2026-12-31")).toBe(true);
  });

  it("gilt nicht davor und nicht danach", () => {
    expect(gilt(r, "2025-12-31")).toBe(false);
    expect(gilt(r, "2027-01-01")).toBe(false);
  });

  it("offene Enden gelten unbegrenzt", () => {
    expect(gilt(fixture({ gueltigAb: "2026-01-01" }), "2099-01-01")).toBe(true);
    expect(gilt(fixture({ gueltigBis: "2026-01-01" }), "1999-01-01")).toBe(true);
    expect(gilt(fixture(), "2026-06-15")).toBe(true);
  });

  it("ohne Datum gilt nur, was keine Grenzen hat", () => {
    expect(gilt(fixture(), undefined)).toBe(true);
    expect(gilt(r, undefined)).toBe(false);
  });
});

describe("Geltungsbereich", () => {
  it("regelnFuer: eine an das Modell gebundene Regel gilt nur für dieses Modell", () => {
    const ids = (k) => regelnFuer(k).map((r) => r.id);
    expect(ids({ datum: "2026-10-22", beschaeftigungsmodell: "werkstudent" })).toContain("BESCH-WERKSTUDENT-01");
    expect(ids({ datum: "2026-10-22", beschaeftigungsmodell: "vollzeit" })).not.toContain("BESCH-WERKSTUDENT-01");
    expect(ids({ datum: "2026-10-22" })).not.toContain("BESCH-WERKSTUDENT-01");
  });

  it("regelnFuer: Bestandsregeln ohne Bereich gelten für alle", () => {
    expect(regelnFuer({ datum: "2026-10-22", beschaeftigungsmodell: "minijob" }).map((r) => r.id)).toContain("AZ-RUHE-01");
  });

  it("regelnFuer lässt watchlist und abgelöste Regeln weg und beachtet die Gültigkeit", () => {
    const liste = [
      fixture({ id: "T-A-01" }),
      fixture({ id: "T-B-01", pruefstatus: "watchlist" }),
      fixture({ id: "T-C-01", pruefstatus: "deprecated" }),
      fixture({ id: "T-D-01", gueltigAb: "2027-01-01" }),
      fixture({ id: "T-E-01", pruefstatus: "provisional" }),
    ];
    expect(regelnFuer({ datum: "2026-10-22" }, liste).map((r) => r.id)).toEqual(["T-A-01", "T-E-01"]);
    expect(regelnFuer({ datum: "2027-02-01" }, liste).map((r) => r.id)).toEqual(["T-A-01", "T-D-01", "T-E-01"]);
  });

  it("jedes Modell, das eine Regel nennt, gibt es", () => {
    const ids = new Set(BESCHAEFTIGUNGSMODELLE.map((m) => m.id));
    for (const r of REGELN) for (const m of [].concat(r.scope.beschaeftigungsmodell || []))
      expect(ids.has(m), `${r.id}: ${m}`).toBe(true);
  });
});

describe("Bewertung und Folge sind getrennt", () => {
  it("die Folgen sind eine eigene Liste, keine Stufen", () => {
    expect(FOLGEN).toEqual(["keine", "bestaetigung", "nachweis", "berechnung", "bericht", "freigabe"]);
    for (const f of FOLGEN) expect(["hinweis", "achtung", "recht"]).not.toContain(f);
  });
});
