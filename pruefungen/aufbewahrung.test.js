/* ==========================================================================
   AUFBEWAHRUNG

   Der Löschlauf greift tief: Er entfernt Plandaten unwiderruflich und
   überschreibt Namen. Ein Fehler hier ist nicht rückgängig zu machen — und
   ein zu zaghafter Fehler ist ein Datenschutzverstoß. Beide Richtungen
   werden hier geprüft.

   Aufruf: npm run pruefung:aufbewahrung
   ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  minusMonate, fristen, stichtage, vorschau, raeumen, anonymisiere,
  berichtstext, VORGABE, PLANDATEN_MINDEST,
} from "../src/aufbewahrung.js";

const HEUTE = "2026-08-14";

/** Ein Betrieb mit allem, was der Löschlauf anfassen kann. */
function betrieb(zusatz = {}) {
  return {
    id: "m1",
    personen: [
      { id: "p1", vorname: "Anna", nachname: "Berg", email: "a@b.de",
        personalnummer: "4711", austritt: null },
      /* Vor über sechs Monaten ausgetreten — fällig. */
      { id: "p2", vorname: "Bernd", nachname: "Klar", email: "b@c.de",
        personalnummer: "4712", austritt: "2025-11-30",
        einschraenkungen: { keineNacht: true } },
      /* Erst letzten Monat ausgetreten — noch nicht fällig. */
      { id: "p3", vorname: "Carla", nachname: "Dorn", austritt: "2026-07-31" },
      /* Schon anonymisiert — darf nicht erneut gezählt werden. */
      { id: "p4", vorname: "", nachname: "Ausgeschieden 0004", anonym: true,
        austritt: "2020-01-01" },
    ],
    abweichungen: {
      "p1|2024-01-15": "F",          // älter als 24 Monate → weg
      "p1|2026-08-01": "S",          // aktuell → bleibt
      "p2|2023-06-30": "N",          // weg
      "kaputt": "X",                 // ohne Datum → bleibt
    },
    erfassung: { "p1|2024-02-01": { start: "06:00" }, "p1|2026-07-01": { start: "06:00" } },
    einstempeln: { "p1|2023-12-24": { kommen: "05:58" } },
    aenderungen: [
      { id: "c1", personId: "p1", datum: "2024-01-15", von: "-", nach: "F" },
      { id: "c2", personId: "p1", datum: "2026-08-01", von: "F", nach: "S" },
    ],
    abwesenheiten: [
      /* Vor über drei Monaten beendet, mit Freitext → Text geht */
      { id: "a1", personId: "p1", art: "krank", von: "2026-01-05", bis: "2026-01-12",
        notiz: "Bandscheibenvorfall" },
      /* Vor über drei Monaten beendet, ohne Text → bleibt unberührt */
      { id: "a2", personId: "p1", art: "urlaub", von: "2026-02-01", bis: "2026-02-14", notiz: "" },
      /* Erst letzte Woche → Text bleibt */
      { id: "a3", personId: "p3", art: "krank", von: "2026-08-03", bis: "2026-08-07",
        notiz: "Grippaler Infekt" },
    ],
    aufbewahrung: { plandatenMonate: 24, stammdatenMonate: 6, gruendeMonate: 3,
      zuletztGeraeumt: null },
    ...zusatz,
  };
}

describe("minusMonate", () => {
  it("rechnet einfache Fälle", () => {
    expect(minusMonate("2026-08-14", 3)).toBe("2026-05-14");
    expect(minusMonate("2026-08-14", 24)).toBe("2024-08-14");
  });
  it("springt über den Jahreswechsel", () => {
    expect(minusMonate("2026-02-10", 3)).toBe("2025-11-10");
    expect(minusMonate("2026-01-31", 13)).toBe("2024-12-31");
  });
  it("deckelt auf den letzten Tag des Zielmonats", () => {
    /* Der 31. März minus ein Monat ist der 28. Februar — nicht der 3. März. */
    expect(minusMonate("2026-03-31", 1)).toBe("2026-02-28");
    expect(minusMonate("2024-03-31", 1)).toBe("2024-02-29");   // Schaltjahr
    expect(minusMonate("2026-05-31", 1)).toBe("2026-04-30");
  });
});

describe("fristen", () => {
  it("nimmt die Vorgaben, wenn nichts gesetzt ist", () => {
    const f = fristen({});
    expect(f.plandatenMonate).toBe(VORGABE.plandatenMonate);
    expect(f.stammdatenMonate).toBe(VORGABE.stammdatenMonate);
    expect(f.gruendeMonate).toBe(VORGABE.gruendeMonate);
  });
  it("ignoriert Unsinn und fällt auf die Vorgabe zurück", () => {
    const f = fristen({ aufbewahrung: { plandatenMonate: 0, stammdatenMonate: -3,
      gruendeMonate: "acht" } });
    expect(f.plandatenMonate).toBe(24);
    expect(f.stammdatenMonate).toBe(6);
    expect(f.gruendeMonate).toBe(3);
  });
  it("übernimmt gesetzte Werte", () => {
    expect(fristen({ aufbewahrung: { plandatenMonate: 36 } }).plandatenMonate).toBe(36);
  });
});

describe("stichtage", () => {
  it("rechnet je Frist einen eigenen Stichtag", () => {
    const st = stichtage(betrieb(), HEUTE);
    expect(st.plan).toBe("2024-08-14");
    expect(st.stamm).toBe("2026-02-14");
    expect(st.grund).toBe("2026-05-14");
  });
});

describe("vorschau", () => {
  const v = vorschau(betrieb(), HEUTE);

  it("findet genau die fälligen Personen", () => {
    expect(v.personen.map((p) => p.id)).toEqual(["p2"]);
  });
  it("überspringt bereits Anonymisierte", () => {
    expect(v.personen.some((p) => p.id === "p4")).toBe(false);
  });
  it("zählt alte Plandaten je Feld", () => {
    expect(v.plandaten.abweichungen).toBe(2);
    expect(v.plandaten.erfassung).toBe(1);
    expect(v.plandaten.einstempeln).toBe(1);
    expect(v.planSumme).toBe(4);
  });
  it("zählt Schlüssel ohne Datum nicht mit", () => {
    /* "kaputt" hat kein Datum und darf nicht als fällig gelten. */
    expect(v.plandaten.abweichungen).toBe(2);
  });
  it("zählt alte Änderungsvermerke", () => {
    expect(v.aenderungen).toBe(1);
  });
  it("zählt nur Gründe, die es gibt und deren Abwesenheit vorbei ist", () => {
    expect(v.gruende).toBe(1);
  });
  it("verändert den Betrieb nicht", () => {
    const m = betrieb();
    const vorher = JSON.stringify(m);
    vorschau(m, HEUTE);
    expect(JSON.stringify(m)).toBe(vorher);
  });
  it("warnt nicht bei einer zulässigen Frist", () => {
    expect(v.warnung).toBe(null);
  });
  it("warnt unter der Grenze des § 16 Abs. 2 ArbZG", () => {
    const kurz = vorschau(betrieb({ aufbewahrung: { plandatenMonate: 12 } }), HEUTE);
    expect(kurz.warnung).toMatch(/16 Abs. 2/);
    expect(PLANDATEN_MINDEST).toBe(24);
  });
});

describe("anonymisiere", () => {
  const p = anonymisiere({ id: "p9", vorname: "Dora", nachname: "Eich", email: "d@e.de",
    telefon: "0170", personalnummer: "9", einschraenkungen: { keineNacht: true },
    wochenstunden: 30, rolle: "mitarbeiter" });

  it("behält die Kennung", () => { expect(p.id).toBe("p9"); });
  it("löscht Name und Kontakt", () => {
    expect(p.vorname).toBe("");
    expect(p.email).toBe("");
    expect(p.telefon).toBe("");
    expect(p.personalnummer).toBe("");
    expect(p.nachname).not.toMatch(/Eich/);
  });
  it("löscht die Schutzangaben", () => {
    expect(p.einschraenkungen).toEqual({});
  });
  it("behält, was der Plan noch braucht", () => {
    expect(p.wochenstunden).toBe(30);
    expect(p.rolle).toBe("mitarbeiter");
  });
  it("setzt das Kennzeichen", () => { expect(p.anonym).toBe(true); });
});

describe("raeumen", () => {
  const { mandant: neu, bericht } = raeumen(betrieb(), HEUTE);

  it("anonymisiert die fällige Person und nur sie", () => {
    const p2 = neu.personen.find((p) => p.id === "p2");
    const p3 = neu.personen.find((p) => p.id === "p3");
    expect(p2.anonym).toBe(true);
    expect(p2.anonymSeit).toBe(HEUTE);
    expect(p3.vorname).toBe("Carla");
  });
  it("löscht alte Plandaten", () => {
    expect(neu.abweichungen["p1|2024-01-15"]).toBeUndefined();
    expect(neu.abweichungen["p2|2023-06-30"]).toBeUndefined();
    expect(neu.erfassung["p1|2024-02-01"]).toBeUndefined();
    expect(neu.einstempeln["p1|2023-12-24"]).toBeUndefined();
  });
  it("behält aktuelle Plandaten", () => {
    expect(neu.abweichungen["p1|2026-08-01"]).toBe("S");
    expect(neu.erfassung["p1|2026-07-01"]).toBeTruthy();
  });
  it("behält Schlüssel ohne Datum", () => {
    expect(neu.abweichungen["kaputt"]).toBe("X");
  });
  it("löscht nur den Freitext, nicht die Abwesenheit", () => {
    const a1 = neu.abwesenheiten.find((a) => a.id === "a1");
    expect(a1).toBeTruthy();
    expect(a1.art).toBe("krank");
    expect(a1.von).toBe("2026-01-05");
    expect(a1.notiz).toBe("");
    expect(a1.grundGeloescht).toBe(HEUTE);
  });
  it("lässt junge Gründe stehen", () => {
    expect(neu.abwesenheiten.find((a) => a.id === "a3").notiz).toBe("Grippaler Infekt");
  });
  it("rührt Abwesenheiten ohne Text nicht an", () => {
    const a2 = neu.abwesenheiten.find((a) => a.id === "a2");
    expect(a2.grundGeloescht).toBeUndefined();
  });
  it("vermerkt den Lauf", () => {
    expect(neu.aufbewahrung.zuletztGeraeumt).toBe(HEUTE);
  });
  it("verändert den ursprünglichen Betrieb nicht", () => {
    const m = betrieb();
    const vorher = JSON.stringify(m);
    raeumen(m, HEUTE);
    expect(JSON.stringify(m)).toBe(vorher);
  });
  it("ist wiederholbar — der zweite Lauf findet nichts mehr", () => {
    const zweiter = raeumen(neu, HEUTE);
    expect(zweiter.bericht.gesamt).toBe(0);
  });
  it("vermerkt den Lauf auch, wenn nichts fällig war", () => {
    const leer = raeumen({ personen: [], aufbewahrung: {} }, HEUTE);
    expect(leer.bericht.gesamt).toBe(0);
    expect(leer.mandant.aufbewahrung.zuletztGeraeumt).toBe(HEUTE);
  });
  it("schreibt einen lesbaren Bericht", () => {
    expect(berichtstext(bericht)).toMatch(/1 Person anonymisiert/);
    expect(berichtstext(bericht)).toMatch(/4 Plan- und Zeiteinträge/);
    expect(berichtstext({ gesamt: 0 })).toMatch(/Nichts fällig/);
  });
  it("beugt die Zahlwörter", () => {
    /* „1 Änderungsvermerke gelöscht" stand so in der Rückfrage, die vor
       einem unwiderruflichen Schritt erscheint. */
    expect(berichtstext(bericht)).toMatch(/1 Änderungsvermerk gelöscht/);
    expect(berichtstext(bericht)).toMatch(/1 Abwesenheitsgrund entfernt/);
    expect(berichtstext({ gesamt: 2, personen: [1, 2], planSumme: 0,
      aenderungen: 0, gruende: 0 })).toMatch(/2 Personen anonymisiert/);
  });
});
