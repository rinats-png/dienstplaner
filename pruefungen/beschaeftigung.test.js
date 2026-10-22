/* ==========================================================================
   BESCHÄFTIGUNGSMODELLE UND ABWESENHEITSARTEN

   Prüft die Datenstruktur, an die sich Regeln binden, ohne dass bestehende
   Daten ungültig werden: Ableitung bei fehlendem Feld, unbekannte Kennungen,
   Bindung vorläufiger Regeln an ein Modell, Datenschutz der neuen Felder und
   die Erweiterung der Abwesenheitsarten.

   Aufruf: npm run pruefung:beschaeftigung
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BESCHAEFTIGUNGSMODELLE, beschaeftigungsmodell, modellVon, modellHinterlegt } from "../src/beschaeftigung.js";
import { ABW_WEITERE, entgeltStatus, entgeltZusatz, entgeltHinweis } from "../src/abwesenheitsarten.js";
import { regelnFuer, REGELN } from "../src/regelregister.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const arten = readFileSync(new URL("../src/abwesenheitsarten.js", import.meta.url), "utf8");
const rechte = readFileSync(new URL("../server/lib/rechte.mjs", import.meta.url), "utf8");

describe("Beschäftigungsmodelle", () => {
  it("alle geforderten Modelle sind da, jedes mit Kennung, Bezeichnung und Hinweis", () => {
    const ids = BESCHAEFTIGUNGSMODELLE.map((m) => m.id);
    for (const id of ["vollzeit", "teilzeit", "minijob", "midijob", "werkstudent", "kurzfristig", "ueberlassung",
      "abruf", "elternteilzeit", "pflegeteilzeit", "altersteilzeit", "entsandt", "beamte"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of BESCHAEFTIGUNGSMODELLE) { expect(m.label).toBeTruthy(); expect(m.hinweis).toBeTruthy(); }
  });
  it("beschaeftigungsmodell(): bekannte Kennung, sonst null", () => {
    expect(beschaeftigungsmodell("minijob").label).toBe("Minijob");
    expect(beschaeftigungsmodell("gibtsnicht")).toBeNull();
  });
});

describe("modellVon: Bestandsdaten bleiben gültig", () => {
  it("ohne Feld und ohne Teilzeit: Vollzeit", () => {
    expect(modellVon({ name: "A" })).toBe("vollzeit");
    expect(modellVon({})).toBe("vollzeit");
    expect(modellVon(null)).toBe("vollzeit");
    expect(modellVon(undefined)).toBe("vollzeit");
  });
  it("ohne Feld mit aktiver Teilzeit: Teilzeit", () => {
    expect(modellVon({ teilzeit: { aktiv: true } })).toBe("teilzeit");
  });
  it("mit inaktiver Teilzeit: Vollzeit", () => {
    expect(modellVon({ teilzeit: { aktiv: false } })).toBe("vollzeit");
  });
  it("eine hinterlegte Kennung gilt vor der Ableitung", () => {
    expect(modellVon({ beschaeftigungsmodell: "werkstudent", teilzeit: { aktiv: true } })).toBe("werkstudent");
  });
  it("eine unbekannte Kennung (neuere Fassung) bricht nichts und führt zur Ableitung", () => {
    expect(modellVon({ beschaeftigungsmodell: "ausserirdisch" })).toBe("vollzeit");
    expect(modellVon({ beschaeftigungsmodell: "ausserirdisch", teilzeit: { aktiv: true } })).toBe("teilzeit");
  });
  it("die Ableitung schreibt nichts in die Person", () => {
    const p = { teilzeit: { aktiv: true } };
    modellVon(p);
    expect(p).toEqual({ teilzeit: { aktiv: true } });
  });
  it("modellHinterlegt unterscheidet Hinterlegtes von Abgeleitetem", () => {
    expect(modellHinterlegt({ beschaeftigungsmodell: "minijob" })).toBe(true);
    expect(modellHinterlegt({ teilzeit: { aktiv: true } })).toBe(false);
    expect(modellHinterlegt({ beschaeftigungsmodell: "x" })).toBe(false);
    expect(modellHinterlegt(null)).toBe(false);
  });
});

describe("Regeln binden sich an das Modell", () => {
  const fuer = (person, datum = "2026-10-22") =>
    regelnFuer({ datum, beschaeftigungsmodell: modellVon(person) }).map((r) => r.id);

  it("die Werkstudentenregeln erreichen nur Werkstudenten", () => {
    expect(fuer({ beschaeftigungsmodell: "werkstudent" })).toContain("BESCH-WERKSTUDENT-01");
    expect(fuer({ teilzeit: { aktiv: true } })).not.toContain("BESCH-WERKSTUDENT-01");
    expect(fuer({})).not.toContain("BESCH-WERKSTUDENT-01");
  });
  it("die Regel zur kurzfristigen Beschäftigung erreicht nur diese", () => {
    expect(fuer({ beschaeftigungsmodell: "kurzfristig" })).toContain("BESCH-KURZFRISTIG-01");
    expect(fuer({ beschaeftigungsmodell: "minijob" })).not.toContain("BESCH-KURZFRISTIG-01");
  });
  it("Bestandsregeln gelten für jedes Modell gleich (kein Verhaltenswechsel durch das Feld)", () => {
    const bestand = (id) => fuer({ beschaeftigungsmodell: id }).filter((x) => REGELN.find((r) => r.id === x).pruefstatus === "legacy_verified");
    const vollzeit = bestand("vollzeit");
    for (const m of BESCHAEFTIGUNGSMODELLE) expect(bestand(m.id), m.id).toEqual(vollzeit);
  });
});

describe("Datenschutz der neuen Personenfelder", () => {
  it("Modell und Stundengrenze gehören zu den privaten Feldern, die anderen nicht erhalten", () => {
    const block = rechte.slice(rechte.indexOf("const PERSON_PRIVAT"), rechte.indexOf("]", rechte.indexOf("const PERSON_PRIVAT")));
    expect(block).toContain('"beschaeftigungsmodell"');
    expect(block).toContain('"stundenGrenzeMonat"');
  });
});

describe("Abwesenheitsarten", () => {
  const zeile = (id) => (arten + "\n" + app).split("\n").find((l) => l.includes(`{ id: "${id}"`) && l.includes("kurz:"));

  it("die bisherigen Arten sind unverändert da", () => {
    for (const id of ["urlaub", "krank", "frei"]) expect(zeile(id), id).toBeTruthy();
  });
  it("die neuen Arten sind angelegt, nicht von Beschäftigten selbst zu beantragen und mit Norm", () => {
    for (const id of ["elternzeit", "pflegezeit", "familienpflegezeit", "arbeitsverhinderung", "mutterschutz",
      "ehrenamt", "personalvertretung", "berufsschule", "atzfreistellung"]) {
      const z = zeile(id);
      expect(z, id).toBeTruthy();
      expect(z, id).toContain("selbst: false");
      expect(z, id).toMatch(/norm: "[^"]+"/);
    }
  });
  it("Kürzel und Farben sind eindeutig", () => {
    const ABW_IDS = ["urlaub", "krank", "frei", "elternzeit", "pflegezeit", "familienpflegezeit", "arbeitsverhinderung",
      "mutterschutz", "ehrenamt", "personalvertretung", "berufsschule", "atzfreistellung"];
    const zeilen = ABW_IDS.map(zeile).filter(Boolean);
    expect(zeilen.length).toBe(ABW_IDS.length);
    const kurz = zeilen.map((l) => l.match(/kurz: "([^"]+)"/)[1]);
    expect(new Set(kurz).size).toBe(kurz.length);
    const farbe = zeilen.map((l) => l.match(/farbe: "([^"]+)"/)[1]);
    expect(new Set(farbe).size).toBe(farbe.length);
  });
  it("App.jsx hängt die weiteren Arten an ABW", () => {
    expect(app).toContain("...ABW_WEITERE");
    expect(app).toContain('from "./abwesenheitsarten.js"');
  });
  it("Anträge der Beschäftigten bieten nur Arten an, die sie selbst beantragen dürfen", () => {
    expect(app.match(/a\.selbst !== false/g).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Entgeltstatus der Abwesenheitsarten", () => {
  it("true und false bleiben bezahlt und unbezahlt", () => {
    expect(entgeltStatus({ bezahlt: true })).toBe("bezahlt");
    expect(entgeltStatus({ bezahlt: false })).toBe("unbezahlt");
  });
  it("alles andere ist ungeklärt und nie unbezahlt", () => {
    for (const a of [{ bezahlt: "ungeklaert" }, { bezahlt: null }, {}, { bezahlt: "ja" }, { bezahlt: 0 }, { bezahlt: 1 }, null, undefined])
      expect(entgeltStatus(a), JSON.stringify(a)).toBe("ungeklaert");
  });
  it("alle neuen Arten sind ungeklärt, bis jemand sie geprüft hat", () => {
    expect(ABW_WEITERE.length).toBe(9);
    for (const a of ABW_WEITERE) expect(entgeltStatus(a), a.id).toBe("ungeklaert");
  });
  it("die bisherigen Arten behalten ihren Status", () => {
    const soll = { urlaub: true, krank: true, schulung: true, frei: false, sonst: true, ausgleich: false };
    for (const [id, b] of Object.entries(soll)) {
      const z = app.split("\n").find((l) => l.includes(`{ id: "${id}", label:`) && l.includes("bezahlt:"));
      expect(z, id).toContain(`bezahlt: ${b},`);
    }
  });
  it("das Stundenkonto prüft den Status, nicht die Wahrheit eines Wertes", () => {
    expect(app).toContain("entgeltStatus(abwArt(");
    expect(app).not.toMatch(/abwArt\([^)]*\)\.bezahlt/);
  });
  it("ungeklärte Tage werden gezählt und in der Prüfansicht gemeldet", () => {
    expect(app).toContain("ungeklaert++");
    expect(app).toContain('art: "entgelt"');
  });
});

describe("Kennzeichnung ungeklärter Arten beim Eintragen", () => {
  it("ungeklärte Arten tragen den Zusatz und lösen den Hinweis aus", () => {
    for (const a of ABW_WEITERE) {
      expect(entgeltZusatz(a), a.id).toContain("Entgelt ungeklärt");
      expect(entgeltHinweis(a), a.id).toContain("nichts gut");
    }
  });
  it("bezahlte und unbezahlte Arten bleiben ohne Zusatz und Hinweis", () => {
    for (const a of [{ bezahlt: true }, { bezahlt: false }]) {
      expect(entgeltZusatz(a)).toBe("");
      expect(entgeltHinweis(a)).toBeNull();
    }
  });
  it("beide Auswahllisten der Leitung zeigen sie", () => {
    expect(app.match(/entgeltZusatz\(a\)/g).length).toBe(2);
    expect(app.match(/entgeltHinweis\(abwArt\(/g).length).toBe(2);
  });
});
