// WP-ZEIT C/E-Rest (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 10, E1 nur Berlin, E7, E8):
// Betriebstag statt UTC-Tag oder Prozesszone in Server-Fachlogik und in gespeicherten Zeittexten.
//
// Befunde (Opus-Ausgangsanalyse, Stand 3309574c):
//   P2  Schichtverantwortung: eigeneEinheit / imEigenenBereich / einheitZusammen nahmen den UTC-Tag, die Lesesicht
//       den Berliner Tag. In der Stunde nach Mitternacht (Winter 00–01 Uhr, Sommer 00–02 Uhr) galt beim Schreiben
//       der Bereich von D−1, beim Lesen der von D.
//   P3  weitere UTC-Tage: leitungsperson().eintritt / zugehoerigkeit.ab, baueLeerenBetrieb().seit, Notruf ohne
//       Datum, Austritt-Filter der Bestätigungs-Empfänger, Tagesbremse der Bestätigungen.
//   P3  Z57: gespeicherte Zeittexte (toLocaleString("de-DE") ohne Zone) liefen in der Prozesszone.
//   P5  „gestern“ als jetzt − 24 h statt Kalendertag − 1.
//
// Jede Uhr ist fest (vi.useFakeTimers, nur Date); die Prozesszone wird je Fall über process.env.TZ umgestellt
// (Muster aus betriebstag.test.js) und danach wiederhergestellt.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { eigeneEinheit, imEigenenBereich, bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { leitungsperson } from "../server/lib/provisionierung.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { leitungFuerBestaetigung, schutzKonfliktMitteilungen, BEFUND_KATALOG, BESTAETIGUNGEN_JE_TAG } from "../server/lib/bestaetigungen.mjs";
import { servermitteilung } from "../server/lib/mitteilungen.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

/** Dieselbe Mitternachtsstunde in drei Umstellungs- und Normalfällen: [Berliner Tag D, Zeitpunkt 00:30 Berlin am Tag D, erwarteter Zeittext]. */
const UHREN = [
  ["2026-03-29", "2026-03-28T23:30:00Z", "29.3.2026, 00:30:00"], // CET, Tag der Frühjahrsumstellung
  ["2026-10-25", "2026-10-24T22:30:00Z", "25.10.2026, 00:30:00"], // CEST, Tag der Herbstumstellung
  ["2026-11-22", "2026-11-21T23:30:00Z", "22.11.2026, 00:30:00"], // CET, normaler Tag
];
/** Prozesszonen: UTC (Container), Kiritimati (UTC+14), Los Angeles (UTC−8/−7). */
const ZONEN = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"];

const TZ_VORHER = process.env.TZ;
function zurueck() { if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER; }
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); zurueck(); });

/** Läuft `f` für jede Uhr × Prozesszone; `f(D, zeittext, zone)`. */
function fuerAlle(f) {
  for (const [d, utc, text] of UHREN) {
    for (const z of ZONEN) {
      process.env.TZ = z;
      vi.setSystemTime(new Date(utc));
      f(d, text, z);
    }
  }
}

const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: id, rolle, status: "aktiv", qualifikationen: [], ...extra });

describe("P2: Schichtverantwortung — Bereich am Betriebstag (eigeneEinheit, imEigenenBereich)", () => {
  const altM = (d) => ({
    einheiten: [{ id: "e1" }, { id: "e2" }],
    personen: [
      /* SV ohne festes `bereich`; ab D in e2 (davor e1). */
      person("s1", "subplaner", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: d, einheitId: "e2" }] }),
      /* Beschäftigte ab D in e2 (davor e1). */
      person("a1", "mitarbeiter", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: d, einheitId: "e2" }] }),
      person("b1", "mitarbeiter", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }),
    ],
  });

  it("eigeneEinheit: nach Mitternacht Berlin gilt der Bereich von D, in jeder Prozesszone", () => {
    fuerAlle((d, _t, z) => {
      const m = altM(d);
      expect(eigeneEinheit(m, m.personen[0]), `${d} ${z}`).toBe("e2");
    });
  });

  it("imEigenenBereich: die Zugehörigkeit der Zielperson am Betriebstag D, in jeder Prozesszone", () => {
    fuerAlle((d, _t, z) => {
      const m = altM(d);
      expect(imEigenenBereich(m, "s1", "a1"), `${d} ${z} a1`).toBe(true);
      expect(imEigenenBereich(m, "s1", "b1"), `${d} ${z} b1`).toBe(false);
    });
  });

  it("Lesen und Schreiben stimmen überein: Nachricht an eine Person im eigenen Bereich wird übernommen", () => {
    fuerAlle((d, _t, z) => {
      const m0 = { id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }], dienstarten: [{ id: "F", name: "Früh" }],
        /* Die SV hat ein festes `bereich` (e2, geht vor); nur die Zielperson wechselt ab D von e1 nach e2 — so fällt der
           UTC-Tag der Schreibprüfung (einheitZusammen, imBereich) allein ins Gewicht. */
        personen: altM(d).personen.map((p) => (p.id === "s1" ? { ...p, bereich: "e2", email: "s@x.de" } : p)), nachrichten: [] };
      const gespeichert = { version: 9, stand: 1, session: null, mandanten: [m0] };
      const sitz = { rolle: "subplaner", person: "s1", betrieb: 0 };
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, sitz)));
      /* Lesesicht (heuteBerlin): a1 ist sichtbar, b1 nicht. */
      expect(gelesen.mandanten[0].personen.map((p) => p.id), `${d} ${z} Sicht`).toContain("a1");
      gelesen.mandanten[0].nachrichten.unshift({ id: "n-neu", personId: "a1", art: "planGeaendert", titel: "x" });
      const e = zusammenfuehren(gespeichert, gelesen, sitz);
      expect(e && e.verweigert, `${d} ${z} Schreibweg`).toBeFalsy();
      expect(e.mandanten[0].nachrichten[0].id).toBe("n-neu");
    });
  });
});

describe("P3: weitere UTC-Tage", () => {
  it("leitungsperson: eintritt und zugehoerigkeit.ab sind der Berliner Tag", () => {
    fuerAlle((d, _t, z) => {
      const p = leitungsperson({ vorname: "A", nachname: "B" }, "e1");
      expect(p.eintritt, `${d} ${z}`).toBe(d);
      expect(p.zugehoerigkeit, `${d} ${z}`).toEqual([{ ab: d, einheitId: "e1" }]);
    });
  });

  it("baueLeerenBetrieb: seit ist der Berliner Tag", () => {
    fuerAlle((d, _t, z) => {
      const b = baueLeerenBetrieb({ name: "Haus", branche: "pflege", email: "a@b.de", land: "HE", raum: "r1" });
      expect(b.mandanten[0].seit, `${d} ${z}`).toBe(d);
    });
  });

  it("Notruf ohne Datum: das Datum ist der Berliner Tag", () => {
    fuerAlle((d, _t, z) => {
      const m0 = { id: "m1", name: "Haus", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh" }],
        personen: [person("a1", "mitarbeiter", { bereich: "e1", email: "a@x.de" }), person("l1", "leitung", { bereich: "ALLE" })], notrufe: [] };
      const gespeichert = { version: 9, stand: 1, session: null, mandanten: [m0] };
      const sitz = { rolle: "mitarbeiter", person: "a1", betrieb: 0 };
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, sitz)));
      gelesen.mandanten[0].notrufe = [{ id: "nr-1", personId: "a1", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: null }];
      const e = zusammenfuehren(gespeichert, gelesen, sitz);
      expect(e && e.verweigert, `${d} ${z}`).toBeFalsy();
      expect(e.mandanten[0].notrufe[0].datum, `${d} ${z}`).toBe(d);
    });
  });

  it("Austritt am Vortag: nach Mitternacht Berlin keine Mitteilung mehr an die ausgetretene Leitung", () => {
    fuerAlle((d, _t, z) => {
      const gestern = tagePlus(d, -1);
      const personen = [
        person("l1", "leitung", { austritt: gestern }),   // gestern ausgetreten
        person("l2", "leitung", { austritt: d }),         // heute letzter Tag: noch aktiv
        person("l3", "leitung"),
      ];
      expect(leitungFuerBestaetigung(personen, null).map((p) => p.id), `${d} ${z}`).toEqual(["l2", "l3"]);
    });
  });
});

describe("P3: Mitteilungen und Tagesbremse am Betriebstag (Verhalten)", () => {
  it("schutzKonfliktMitteilungen: keine Mitteilung an die gestern ausgetretene Leitung, aber an die heute letzte", () => {
    fuerAlle((d, _t, z) => {
      const personen = [
        person("l1", "leitung", { austritt: tagePlus(d, -1) }),
        person("l2", "leitung", { austritt: d }),
        person("p1", "planer"), person("a1", "mitarbeiter")];
      const neu = schutzKonfliktMitteilungen({ personen }, { personen, nachrichten: [] }, [{ personId: "a1", datum: d }], "p1");
      const an = neu.nachrichten.map((n) => n.personId).sort();
      expect(an, `${d} ${z}`).toEqual(["l2", "p1"]);
    });
  });

  it("Tagesbremse der Bestätigungen: Einträge von gestern (Berlin) zählen nicht zu heute", () => {
    /* Regel ohne Schutzbezug und ohne Sperre, die sich als Einzelbestätigung anhängen lässt. */
    const regel = Object.keys(BEFUND_KATALOG).find((r) => !BEFUND_KATALOG[r].sperrt && !BEFUND_KATALOG[r].schutz
      && ["achtung", "recht"].includes(BEFUND_KATALOG[r].stufe));
    expect(regel).toBeTruthy();
    fuerAlle((d, _t, z) => {
      /* Gestern Mittag UTC = gestern Berlin; um 00:30 Berlin ist der UTC-Tag noch gestern. */
      const gesternMittag = `${tagePlus(d, -1)}T12:00:00.000Z`;
      const alte = Array.from({ length: BESTAETIGUNGEN_JE_TAG }, (_, i) => ({ id: `alt${i}`, art: "sammel", durchId: "l1", zeit: gesternMittag }));
      const m0 = { id: "m1", name: "Haus", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh" }],
        personen: [person("l1", "leitung", { bereich: "ALLE", email: "l@x.de" })], bestaetigungen: alte };
      const gespeichert = { version: 9, stand: 1, session: null, mandanten: [m0] };
      const sitz = { rolle: "leitung", person: "l1", betrieb: 0 };
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, sitz)));
      gelesen.mandanten[0].bestaetigungen = [{ id: "neu1", personId: "l1", datum: d, dienstId: "F", aktion: "plan", befunde: [{ regel }], gelesen: true },
        ...gelesen.mandanten[0].bestaetigungen];
      const e = zusammenfuehren(gespeichert, gelesen, sitz);
      expect(e && e.verweigert, `${d} ${z}`).toBeFalsy();
      expect(e.mandanten[0].bestaetigungen[0].id, `${d} ${z}`).toBe("neu1");
    });
  });
});

describe("Z57: gespeicherte Zeittexte in Europe/Berlin, Format unverändert (Golden)", () => {
  it("servermitteilung.zeit", () => {
    fuerAlle((d, text, z) => {
      const n = servermitteilung({ id: "n1", personId: "p1", art: "planGeaendert", titel: "t", text: "x", ziel: null, quelle: null });
      expect(n.zeit, `${d} ${z}`).toBe(text);
    });
  });

  it("schutzKonfliktMitteilungen.zeit", () => {
    fuerAlle((d, text, z) => {
      const personen = [person("l1", "leitung"), person("p1", "planer"), person("a1", "mitarbeiter")];
      const neu = schutzKonfliktMitteilungen({ personen }, { personen, nachrichten: [] }, [{ personId: "a1", datum: d }], "p1");
      expect(neu.nachrichten.length, `${d} ${z}`).toBeGreaterThan(0);
      for (const n of neu.nachrichten) expect(n.zeit, `${d} ${z}`).toBe(text);
    });
  });
});

describe("P5: gestern ist Kalendertag − 1 (Hinweis: prüft die Rechenregel; der Pfad in daten.mjs ist nur durch den Quellwächter gesichert)", () => {
  it("tagePlus(heuteBerlin(jetzt), -1) trifft auch den Tag nach der Frühjahrsumstellung; jetzt − 24 h verfehlt ihn", () => {
    /* 30.03.2026 00:30 MESZ = 29.03. 22:30 UTC; 24 h davor ist 28.03. 23:30 MEZ → falscher „gestern“-Tag 28.03. */
    const jetzt = new Date("2026-03-29T22:30:00Z");
    expect(heuteBerlin(jetzt)).toBe("2026-03-30");
    expect(tagePlus(heuteBerlin(jetzt), -1)).toBe("2026-03-29");
    expect(heuteBerlin(new Date(jetzt.getTime() - 86400000))).toBe("2026-03-28");
  });
});

/* Quellwächter: die Stellen, die sich nicht ohne großen Aufbau ausführen lassen (Löschlauf, Wiederherstellung,
   Aktionsdateien der Oberfläche, Anzeigen). Ein Zeittext in `de-DE` braucht ausdrücklich Europe/Berlin (E1, E8). */
describe("Quellwächter: Zeittexte ohne Prozess- oder Gerätezone", () => {
  const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const DATEIEN = [
    "../server/lib/rechte.mjs", "../server/lib/bestaetigungen.mjs", "../server/lib/mitteilungen.mjs",
    "../server/lib/sicherungen.mjs", "../server/lib/loeschlauf.mjs", "../server/lib/provisionierung.mjs",
    "../server/lib/leerbetrieb.mjs", "../server/funktionen/daten.mjs",
    "../src/app/aktionen/assistenz.js", "../src/app/aktionen/ausschreibung.js", "../src/app/aktionen/begleitung.js",
    "../src/app/aktionen/branchen.js", "../src/app/aktionen/plan.js", "../src/app/aktionen/stammdaten.js",
    "../src/lib/aushang.js", "../src/lib/zustellung.js",
    "../src/ansichten/notrufe.jsx", "../src/ansichten/korrekturen.jsx", "../src/ansichten/stempelpuffer.jsx",
    "../src/ansichten/einladungen.jsx",
  ];
  /* Zahlenformate (Nachkommastellen, Währung) sind keine Zeittexte. */
  const ZAHL = /minimumFractionDigits|maximumFractionDigits|style:/;
  const AUFRUF = /toLocale(?:Time|Date)?String\(\s*"de-DE"\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;

  it.each(DATEIEN)("%s: jeder Zeittext nennt timeZone", (rel) => {
    const q = lies(rel);
    const ohne = [];
    for (const m of q.matchAll(AUFRUF)) {
      const opt = m[1] || "";
      if (ZAHL.test(opt)) continue;
      if (!/timeZone:\s*"Europe\/Berlin"/.test(opt)) ohne.push(m[0]);
    }
    expect(ohne).toEqual([]);
  });

  it("kein UTC-Tag als „heute“ in rechte, bestaetigungen, provisionierung, leerbetrieb", () => {
    for (const rel of ["../server/lib/rechte.mjs", "../server/lib/bestaetigungen.mjs", "../server/lib/provisionierung.mjs", "../server/lib/leerbetrieb.mjs"]) {
      expect(lies(rel), rel).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/);
    }
  });

  it("daten.mjs: gestern über tagePlus, nicht über 86400000 ms", () => {
    const q = lies("../server/funktionen/daten.mjs");
    expect(q).toMatch(/tagePlus\(heuteBerlin\(jetzt0\), -1\)/);
    expect(q).not.toMatch(/heuteBerlin\(new Date\(jetzt0\.getTime\(\) - 86400000\)\)/);
  });

  it("fachlogik.js: Lohnausgabe „Erstellt:“ mit Europe/Berlin", () => {
    expect(lies("../src/lib/fachlogik.js")).toMatch(/Erstellt: \$\{new Date\(\)\.toLocaleString\("de-DE", \{ timeZone: "Europe\/Berlin" \}\)\}/);
  });
});
