/* ==========================================================================
   WP-27 — AUSWERTUNG FÜR DEN BETRIEBSRAT: nur Aggregate, Mindestgruppe 3

   Der Betriebsrat (audit.view) bekommt aus dem vollständigen Bestand Summen je
   Monat und Einheit: Dienste, Nachtdienste, Sonntagsdienste, lange Dienste,
   Ruhezeit unter 11 Stunden, bestätigte Ist-Stunden. Unter drei Personen keine
   Zahlen; ist eine Einheit gesperrt, auch die Gesamtzeile des Monats.
   Personen werden nie genannt. Andere Rollen bekommen das Feld nicht; mitgeschickt
   wird es nie gespeichert.

   Aufruf: npx vitest run pruefungen/br-auswertung.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren, MATRIX } from "../server/lib/rechte.mjs";
import { betriebsratAuswertung, auswertungHolen, auswertungenVergessen, auswertungStatistik, istSchluessel, BR_MINDESTGRUPPE, BR_HAEPPCHEN_MS, BR_NEUBERECHNUNG_MS, BR_MAX_GLEICHZEITIG } from "../server/lib/br-auswertung.mjs";
import { median, urteil } from "./laufzeitmessung.mjs";
import { aufbauen } from "./hilfen/szenario.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { istZeitFuer } from "../src/istdaten.js";
import { csvFeld, csvText } from "../src/csvfeld.js";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `NAME-${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({ version: 1, stand: 7, mandanten: [{ id: "m1", name: "Haus",
  einheiten: [{ id: "gross", versatzTage: 0 }, { id: "klein", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 },
    { id: "L", name: "Lang", start: "07:00", ende: "19:00", pause: 30 }],
  zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: { ruhezeit: 11 },
  personen: [person("g1", "mitarbeiter", "gross"), person("g2", "mitarbeiter", "gross"), person("g3", "mitarbeiter", "gross"),
    person("k1", "mitarbeiter", "klein"), person("k2", "mitarbeiter", "klein"),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
  abweichungen: { [`g1|${tag(-3)}`]: "N", [`g2|${tag(-3)}`]: "L", [`g3|${tag(-10)}`]: "F" },
  erfassung: { [`g3|${tag(-10)}`]: { start: "06:00", ende: "15:00", bestaetigt: true } },
  nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] });
const SITZ = { BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 }, MA: { rolle: "mitarbeiter", person: "g1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "g1", betrieb: 0 } };

/** Eine Ablage im Speicher wie server/lib/ablage.mjs (get/setJSON/setJSONWennNeu atomar/list/delete), mit Zählern;
    `raeume`: Räume, deren Kern (kern:<raum>) besteht. */
const testAblage = (raeume = []) => {
  const daten = new Map(raeume.map((r) => [`kern:${r}`, { raum: r }]));
  const zaehler = { list: 0, delete: 0, schreiben: 0 };
  const kopie = (v) => JSON.parse(JSON.stringify(v));
  return { daten, zaehler,
    get: async (k) => (daten.has(k) ? kopie(daten.get(k)) : null),
    setJSON: async (k, v) => { zaehler.schreiben++; daten.set(k, kopie(v)); },
    setJSONWennNeu: async (k, v) => { zaehler.schreiben++; if (daten.has(k)) return false; daten.set(k, kopie(v)); return true; },
    list: async ({ prefix }) => { zaehler.list++; return { blobs: [...daten.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    delete: async (k) => { zaehler.delete++; daten.delete(k); } };
};

describe("die Auswertung selbst", () => {
  const a = betriebsratAuswertung(bestand().mandanten[0], HEUTE);
  const zeile = (monat, eid) => a.zeilen.find((z) => z.monat === monat && z.einheitId === eid);
  it("Mindestgruppe: die Einheit mit zwei Personen ohne Zahlen", () => {
    const z = zeile(HEUTE.slice(0, 7), "klein");
    expect(z).toEqual({ monat: HEUTE.slice(0, 7), einheitId: "klein", personen: `<${BR_MINDESTGRUPPE}`, gesperrt: true });
  });
  it("Zweitsperre: ist eine Einheit gesperrt, fehlt auch die Gesamtzeile des Monats", () => {
    expect(zeile(HEUTE.slice(0, 7), null)).toMatchObject({ gesperrt: true });
    expect(zeile(HEUTE.slice(0, 7), null).dienste).toBeUndefined();
  });
  it("die große Einheit: Summen, Nacht und lange Dienste aus dem Plan; das Ist einer einzelnen Person bleibt verborgen", () => {
    const monat = tag(-3).slice(0, 7);
    const z = zeile(monat, "gross");
    expect(z.gesperrt).toBe(false);
    expect(z.personen).toBe(3);
    expect(z.nachtdienste).toBeGreaterThanOrEqual(1);
    expect(z.langeDienste).toBeGreaterThanOrEqual(1);
    expect(z.istErfasst).toBeNull();
    expect(z.istStunden).toBeNull();
  });
  it("keine Person, kein Name, keine Kennung", () => {
    expect(JSON.stringify(a)).not.toMatch(/NAME-|"g1"|"k1"|"r1"/);
  });
});

/* Review F1: Das Ist zählt nur, wer bestätigt hat — eine eigene Mindestgruppe, eine Wartezeit, eine Zweitsperre. */
describe("Ist-Zeiten: Mindestgruppe der Beitragenden, Wartezeit, Zweitsperre (F1)", () => {
  const TAG = "2026-05-12";                                                // ein Dienstag im Mai 2026
  const SPAET = "2026-06-20";                                              // Frist zum Nachbestätigen (14 Tage) nach Monatsende vorbei
  const FRUEH = "2026-06-05";                                              // Monat vorbei, Frist läuft noch
  const mit = (bestaetigt, { zweiteEinheit = 0, zweiteBestaetigt = 0 } = {}) => {
    const personen = [], erfassung = {};
    const neu = (pre, n, b, einheit) => {
      for (let i = 0; i < n; i++) {
        personen.push(person(`${pre}${i}`, "mitarbeiter", einheit));
        if (i < b) erfassung[`${pre}${i}|${TAG}`] = { start: "06:00", ende: "15:00", bestaetigt: true };
      }
    };
    neu("a", 4, bestaetigt, "A");
    if (zweiteEinheit) neu("b", zweiteEinheit, zweiteBestaetigt, "B");
    return { id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }, { id: "B", versatzTage: 0 }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {},
      personen, abweichungen: {}, erfassung, abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  const z = (m, heute, eid) => betriebsratAuswertung(m, heute).zeilen.find((r) => r.monat === "2026-05" && r.einheitId === eid);

  it("eine Einheit mit 4 Personen, nur eine bestätigt: kein Ist (vorher: 8,5 Stunden einer Person)", () => {
    const r = z(mit(1), SPAET, "A");
    expect(r.personen).toBe(4);
    expect(r.gesperrt).toBe(false);
    expect(r.istStunden).toBeNull();
    expect(r.istErfasst).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/8\.5|8,5/);
  });
  it("zwei bestätigt: weiter kein Ist; drei: die Summe", () => {
    expect(z(mit(2), SPAET, "A").istStunden).toBeNull();
    const r = z(mit(3), SPAET, "A");
    expect(r.istErfasst).toBe(3);
    expect(r.istStunden).toBe(25.5);
  });
  it("vor Ablauf der Frist zum Nachbestätigen: kein Ist, auch mit drei Beitragenden", () => {
    expect(z(mit(3), FRUEH, "A").istStunden).toBeNull();
    expect(z(mit(3), "2026-05-20", "A").istStunden).toBeNull();            // Monat noch nicht abgeschlossen
    expect(z(mit(3), SPAET, "A").istStunden).toBe(25.5);
  });
  it("Differenzbildung: zwei Stände vor Ablauf der Frist (vorher drei, nachher vier Bestätigungen) ergeben dieselbe Ausgabe", () => {
    const a = JSON.stringify(betriebsratAuswertung(mit(3), FRUEH));
    const b = JSON.stringify(betriebsratAuswertung(mit(4), FRUEH));
    expect(b).toBe(a);                                                     // die vierte Person ist nicht als Unterschied sichtbar
  });
  it("Zweitsperre für das Ist: trägt eine Einheit mit 1–2 Personen bei, fällt auch das Ist der Gesamtzeile weg", () => {
    const m = mit(3, { zweiteEinheit: 3, zweiteBestaetigt: 2 });
    expect(z(m, SPAET, "A").istStunden).toBe(25.5);
    expect(z(m, SPAET, "B").istStunden).toBeNull();
    const gesamt = z(m, SPAET, null);
    expect(gesamt.gesperrt).toBe(false);
    expect(gesamt.istStunden).toBeNull();                                  // sonst Gesamt minus A = B
    expect(gesamt.istErfasst).toBeNull();
  });
  it("beide Einheiten mit je drei Beitragenden: die Gesamtzeile zeigt die Summe", () => {
    const m = mit(3, { zweiteEinheit: 3, zweiteBestaetigt: 3 });
    expect(z(m, SPAET, null).istStunden).toBe(51);
  });
  it("eine Einheit ganz ohne Ist sperrt die Gesamtzeile nicht", () => {
    const m = mit(3, { zweiteEinheit: 3, zweiteBestaetigt: 0 });
    expect(z(m, SPAET, null).istStunden).toBe(25.5);
  });
});

/* Review F2 + N1: Schlüssel Raum + Tag; im Mindestabstand neu; unter Schreiblast fertig. */
describe("Hintergrundrechnung: Raum + Tag, Mindestabstand, Schreiblast (F2, N1)", () => {
  const warte = async (a) => {
    for (let i = 0; i < 400; i++) {
      const r = auswertungHolen(a);
      if (r.fertig) return r;
      await new Promise((w) => setTimeout(w, 5));
    }
    throw new Error("nicht fertig");
  };
  const mandant = (namen) => { const b = bestand().mandanten[0]; b.personen = b.personen.filter((p) => !namen.includes(p.id)); return b; };
  beforeEach(() => auswertungenVergessen());

  it("der erste Abruf blockiert nicht: noch nicht fertig, dann fertig, mit Zeitstempel", async () => {
    const a = { raum: "raum-a", heute: HEUTE, mandant: bestand().mandanten[0] };
    expect(auswertungHolen(a).fertig).toBe(false);
    const r = await warte(a);
    expect(r.wert.zeilen.length).toBeGreaterThan(0);
    expect(new Date(r.berechnetUm).getTime()).toBeGreaterThan(Date.now() - 60000);
  });
  it("zwei Räume mit gleicher Betriebskennung und gleichem Tag teilen nie ein Ergebnis", async () => {
    const voll = { raum: "raum-1", heute: HEUTE, mandant: bestand().mandanten[0] };
    const anders = { raum: "raum-2", heute: HEUTE, mandant: mandant(["g1", "g2", "g3"]) };   // gleiche id „m1“, andere Leute
    const a = (await warte(voll)).wert;
    const b = (await warte(anders)).wert;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(a.zeilen.some((z) => z.einheitId === "gross" && !z.gesperrt)).toBe(true);
    expect(b.zeilen.some((z) => z.einheitId === "gross" && !z.gesperrt)).toBe(false);
    expect(auswertungHolen(voll)).toMatchObject({ fertig: true });          // jeder Raum behält seins
  });
  it("innerhalb des Mindestabstands liefert ein anderer Stand das letzte Ergebnis — kein neuer Lauf", async () => {
    const t0 = Date.now();
    const alt = { raum: "raum-3", heute: HEUTE, mandant: bestand().mandanten[0], jetzt: t0 };
    const a = (await warte(alt)).wert;
    const gestartet = auswertungStatistik().gestartet;
    const neu = { raum: "raum-3", heute: HEUTE, mandant: mandant(["g1", "g2", "g3"]), jetzt: t0 + BR_NEUBERECHNUNG_MS - 1000 };
    const r = auswertungHolen(neu);
    expect(r.fertig).toBe(true);
    expect(JSON.stringify(r.wert)).toBe(JSON.stringify(a));
    expect(auswertungStatistik().gestartet).toBe(gestartet);
  });
  it("nach dem Mindestabstand wird neu gerechnet; bis dahin gilt das letzte Ergebnis (nie „wird berechnet“)", async () => {
    const alt = { raum: "raum-4", heute: HEUTE, mandant: bestand().mandanten[0] };
    const a = (await warte(alt)).wert;
    const spaeter = { raum: "raum-4", heute: HEUTE, mandant: mandant(["g1", "g2", "g3"]), jetzt: Date.now() + BR_NEUBERECHNUNG_MS + 1000 };
    const r1 = auswertungHolen(spaeter);
    expect(r1.fertig).toBe(true);                                           // das alte Ergebnis, sofort
    expect(JSON.stringify(r1.wert)).toBe(JSON.stringify(a));
    for (let i = 0; i < 400 && auswertungHolen(spaeter).berechnetUm === r1.berechnetUm; i++) await new Promise((w) => setTimeout(w, 5));
    expect(auswertungHolen(spaeter).berechnetUm).not.toBe(r1.berechnetUm);
    expect(JSON.stringify(auswertungHolen(spaeter).wert)).not.toBe(JSON.stringify(a));
  });
  it("ein anderer Tag ist ein neuer Eintrag, der Vortag desselben Raums wird verworfen", async () => {
    const m = bestand().mandanten[0];
    await warte({ raum: "raum-5", heute: HEUTE, mandant: m });
    const morgen = { raum: "raum-5", heute: tag(1), mandant: m };
    expect(auswertungHolen(morgen).fertig).toBe(false);
    await warte(morgen);
    expect(auswertungHolen({ raum: "raum-5", heute: HEUTE, mandant: m, jetzt: 0 }).fertig).toBe(false);
  });
  it("ohne Raum wird nichts gemerkt", () => {
    expect(auswertungHolen({ raum: "", heute: HEUTE, mandant: bestand().mandanten[0] }).fertig).toBe(false);
  });
  it("Quelltext: kein Schlüssel aus Betriebskennung und m.stand, der Stand der Ablage ist kein Schlüssel", () => {
    const q = readFileSync(path.join(process.cwd(), "server/lib/br-auswertung.mjs"), "utf8");
    expect(q).not.toMatch(/m\.stand|m && m\.stand/);
    expect(q).toMatch(/const schluesselVon = \(raum, betrieb, tag\)/);        // K1: der Betrieb steht im Schlüssel
  });

  /* Review N1: Schreiblast. Der Stand wechselt bei jedem Abruf (jeder Schreibvorgang macht einen neuen). */
  it("unter Schreiblast: trotz Standwechsel bei jedem Abruf wird das Ergebnis fertig — mit genau einem Lauf", async () => {
    const personen = [];
    for (let i = 0; i < 600; i++) personen.push(person(`w${i}`, "mitarbeiter", `e${i % 6}`));
    const m = { ...bestand().mandanten[0], einheiten: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, versatzTage: 0 })), personen };
    let stand = 0, fertig = null, abrufe = 0;
    const t0 = performance.now();
    while (!fertig && performance.now() - t0 < 60000) {
      stand++; abrufe++;
      const r = auswertungHolen({ raum: "last", stand, heute: HEUTE, mandant: { ...m } });   // jeder Abruf: neuer Stand, neues Objekt
      if (r.fertig) fertig = r;
      else await new Promise((w) => setTimeout(w, 10));
    }
    expect(fertig, `nach ${abrufe} Abrufen nicht fertig`).toBeTruthy();
    expect(auswertungStatistik().gestartet).toBe(1);                       // nicht je Stand ein Lauf (CPU-Bindung)
    expect(abrufe).toBeGreaterThan(5);
  }, 90000);
  it("viele Räume gleichzeitig: höchstens BR_MAX_GLEICHZEITIG Rechnungen laufen", async () => {
    /* ein Betrieb, dessen Rechnung länger dauert als die Schleife (sonst wären kleine Läufe schon fertig) */
    const personen = [];
    for (let i = 0; i < 600; i++) personen.push(person(`v${i}`, "mitarbeiter", `e${i % 6}`));
    const m = { ...bestand().mandanten[0], einheiten: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, versatzTage: 0 })), personen };
    for (let i = 0; i < 12; i++) auswertungHolen({ raum: `viele-${i}`, heute: HEUTE, mandant: m });
    expect(auswertungStatistik().laeuft).toBeLessThanOrEqual(BR_MAX_GLEICHZEITIG);
    expect(auswertungStatistik().gestartet).toBeLessThanOrEqual(BR_MAX_GLEICHZEITIG);
    for (let i = 0; i < 2000 && auswertungStatistik().laeuft > 0; i++) await new Promise((w) => setTimeout(w, 5));   // nichts in den nächsten Test mitnehmen
  }, 90000);
});

/* Restpunkt N1(3): Ist nach Fristende einfrieren — keine Differenz aus zwei Ausgaben. */
describe("Ist nach der Frist: eingefroren, Korrekturen nur ausgewiesen", () => {
  const SPAET = "2026-06-20";
  const mitErfassung = (stunden) => {
    const personen = [], erfassung = {};
    for (let i = 0; i < 4; i++) {
      personen.push(person(`a${i}`, "mitarbeiter", "A"));
      if (i < 3) erfassung[`a${i}|2026-05-12`] = { start: "06:00", ende: i === 0 ? stunden : "15:00", bestaetigt: true };
    }
    return { id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung,
      abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  const warte = async (a) => { for (let i = 0; i < 400; i++) { const r = auswertungHolen(a); if (r.fertig) return r; await new Promise((w) => setTimeout(w, 5)); } throw new Error("nicht fertig"); };
  const zeile = (w) => w.zeilen.find((r) => r.monat === "2026-05" && r.einheitId === "A");
  beforeEach(() => auswertungenVergessen());

  it("die Planung korrigiert eine bestätigte Zeit nach der Frist: die Ausgabe bleibt, mit Hinweis ohne Zahl", async () => {
    const jetzt = Date.now();
    const erste = zeile((await warte({ raum: "frost", heute: SPAET, mandant: mitErfassung("15:00"), jetzt })).wert);
    expect(erste.istStunden).toBe(25.5);
    const spaeter = { raum: "frost", heute: SPAET, mandant: mitErfassung("17:00"), jetzt: jetzt + BR_NEUBERECHNUNG_MS + 1000 };
    const zweite = auswertungHolen(spaeter);
    for (let i = 0; i < 400 && auswertungHolen({ ...spaeter, jetzt }).berechnetUm === zweite.berechnetUm; i++) await new Promise((w) => setTimeout(w, 5));
    const z2 = zeile(auswertungHolen({ ...spaeter, jetzt }).wert);
    expect(zweite.fertig).toBe(true);
    expect(z2.istStunden).toBe(25.5);                                      // nicht 27,5: keine Differenz von 2 Stunden
    expect(z2.istErfasst).toBe(3);
    expect(z2.istKorrigiert).toBe(true);
    expect(erste.istKorrigiert).toBeUndefined();
  });
  it("ohne Korrektur kein Hinweis", async () => {
    const jetzt = Date.now();
    await warte({ raum: "ruhig", heute: SPAET, mandant: mitErfassung("15:00"), jetzt });
    const erst = auswertungHolen({ raum: "ruhig", heute: SPAET, mandant: mitErfassung("15:00"), jetzt: jetzt + BR_NEUBERECHNUNG_MS + 1000 });
    for (let i = 0; i < 400 && auswertungHolen({ raum: "ruhig", heute: SPAET, mandant: mitErfassung("15:00"), jetzt }).berechnetUm === erst.berechnetUm; i++) await new Promise((w) => setTimeout(w, 5));
    expect(zeile(auswertungHolen({ raum: "ruhig", heute: SPAET, mandant: mitErfassung("15:00") }).wert).istKorrigiert).toBeUndefined();
  });
});

/* Review K1: ein Raum, zwei Betriebe — jedes Ergebnis gehört genau einem Betrieb. */
describe("Mandantentrennung im Zwischenspeicher: zwei Betriebe in einem Raum (K1)", () => {
  const betriebMit = (id, n, einheit) => {
    const personen = [];
    for (let i = 0; i < n; i++) personen.push(person(`${id}-${i}`, "mitarbeiter", einheit));
    return { id, name: `Betrieb ${id}`, einheiten: [{ id: einheit, versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung: {},
      abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  const warte = async (a) => { for (let i = 0; i < 600; i++) { const r = auswertungHolen(a); if (r.fertig) return r; await new Promise((w) => setTimeout(w, 5)); } throw new Error("nicht fertig"); };
  beforeEach(() => auswertungenVergessen());

  it("Betrieb A (60 Personen) und B (30) im selben Raum und am selben Tag: je eigene Zahlen, nie dasselbe Objekt", async () => {
    const mA = betriebMit("mA", 60, "eA"), mB = betriebMit("mB", 30, "eB");
    const a = await warte({ raum: "gemeinsam", heute: HEUTE, mandant: mA });
    const b = await warte({ raum: "gemeinsam", heute: HEUTE, mandant: mB });
    expect(a.wert).not.toBe(b.wert);
    const gesamt = (w) => w.zeilen.filter((z) => z.einheitId === null && !z.gesperrt).map((z) => z.personen);
    expect(new Set(gesamt(a.wert))).toEqual(new Set([60]));
    expect(new Set(gesamt(b.wert))).toEqual(new Set([30]));
    expect(JSON.stringify(b.wert)).not.toContain("eA");
    expect(JSON.stringify(a.wert)).not.toContain("eB");
    /* und beim zweiten Abruf von A kommt weiter A */
    expect(new Set(gesamt(auswertungHolen({ raum: "gemeinsam", heute: HEUTE, mandant: mA }).wert))).toEqual(new Set([60]));
  });
  it("ein Abruf des anderen Betriebs während der Rechnung startet einen eigenen Lauf (nicht „läuft schon“)", async () => {
    const mA = betriebMit("mA", 400, "eA"), mB = betriebMit("mB", 30, "eB");
    expect(auswertungHolen({ raum: "parallel", heute: HEUTE, mandant: mA }).fertig).toBe(false);
    expect(auswertungHolen({ raum: "parallel", heute: HEUTE, mandant: mB }).fertig).toBe(false);
    expect(auswertungStatistik().gestartet).toBe(2);
    const b = await warte({ raum: "parallel", heute: HEUTE, mandant: mB });
    expect(b.wert.zeilen.find((z) => z.einheitId === null && !z.gesperrt).personen).toBe(30);
    await warte({ raum: "parallel", heute: HEUTE, mandant: mA });
  });
  it("ein Betrieb ohne Kennung bekommt nichts", () => {
    expect(auswertungHolen({ raum: "r", heute: HEUTE, mandant: { ...betriebMit("x", 3, "e"), id: undefined } }).fertig).toBe(false);
    expect(auswertungStatistik().gestartet).toBe(0);
  });
  it("das Eingefrorene gehört ebenfalls zum Betrieb", async () => {
    const SPAET = "2026-06-20";
    const mit = (id, stunden) => {
      const m = betriebMit(id, 4, "A");
      for (let i = 0; i < 3; i++) m.erfassung[`${id}-${i}|2026-05-12`] = { start: "06:00", ende: i === 0 ? stunden : "15:00", bestaetigt: true };
      return m;
    };
    const a = await warte({ raum: "frost2", heute: SPAET, mandant: mit("mA", "15:00") });
    const b = await warte({ raum: "frost2", heute: SPAET, mandant: mit("mB", "17:00") });
    const z = (w) => w.zeilen.find((r) => r.monat === "2026-05" && r.einheitId === "A");
    expect(z(a.wert).istStunden).toBe(25.5);
    expect(z(b.wert).istStunden).toBe(27.5);                              // nicht das eingefrorene Ist des anderen Betriebs
    expect(z(b.wert).istKorrigiert).toBeUndefined();
  });
});

/* Review F1-Rest: Das Eingefrorene überlebt einen Neustart (dauerhaft in der Ablage). */
describe("Ist eingefroren: dauerhaft, ein Neustart ändert die Ausgabe nicht", () => {
  const SPAET = "2026-06-20";
  /* Der Raum besteht (kern:<raum>) — ohne Kern schreibt die Auswertung nichts mehr (Nachtrag B2). */
  const ablageNeu = () => testAblage(["neustart", "laufend", "defekt", "voll", "aufraeumen"]);
  const mitErfassung = (stunden, id = "m1") => {
    const personen = [], erfassung = {};
    for (let i = 0; i < 4; i++) {
      personen.push(person(`a${i}`, "mitarbeiter", "A"));
      if (i < 3) erfassung[`a${i}|2026-05-12`] = { start: "06:00", ende: i === 0 ? stunden : "15:00", bestaetigt: true };
    }
    return { id, name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung,
      abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  const warte = async (a) => { for (let i = 0; i < 600; i++) { const r = auswertungHolen(a); if (r.fertig) return r; await new Promise((w) => setTimeout(w, 5)); } throw new Error("nicht fertig"); };
  const zeile = (w) => w.zeilen.find((r) => r.monat === "2026-05" && r.einheitId === "A");
  beforeEach(() => auswertungenVergessen());

  it("Neustart zwischen den Ausgaben: 24 Stunden vorher, 26 Stunden nachher (Korrektur der Einzelperson) — dieselbe Zahl, Hinweis", async () => {
    const ablage = ablageNeu();
    const vorher = zeile((await warte({ raum: "neustart", heute: SPAET, mandant: mitErfassung("15:00"), ablage })).wert);
    expect(vorher.istStunden).toBe(25.5);
    auswertungenVergessen();                                              // der Prozess startet neu: der Speicher ist leer, die Ablage bleibt
    const nachher = zeile((await warte({ raum: "neustart", heute: SPAET, mandant: mitErfassung("17:00"), ablage })).wert);
    expect(nachher.istStunden).toBe(25.5);                                // nicht 27,5
    expect(nachher.istErfasst).toBe(3);
    expect(nachher.istKorrigiert).toBe(true);
    expect(vorher.istKorrigiert).toBeUndefined();
  });
  it("ohne Neustart ebenso (Speicher und Ablage stimmen überein)", async () => {
    const ablage = ablageNeu();
    const t = Date.now();
    await warte({ raum: "laufend", heute: SPAET, mandant: mitErfassung("15:00"), ablage, jetzt: t });
    const spaeter = { raum: "laufend", heute: SPAET, mandant: mitErfassung("17:00"), ablage, jetzt: t + BR_NEUBERECHNUNG_MS + 1000 };
    const erst = auswertungHolen(spaeter);
    for (let i = 0; i < 600 && auswertungHolen({ ...spaeter, jetzt: t }).berechnetUm === erst.berechnetUm; i++) await new Promise((w) => setTimeout(w, 5));
    expect(zeile(auswertungHolen({ ...spaeter, jetzt: t }).wert).istStunden).toBe(25.5);
  });
  it("Ablage nicht lesbar: das Ist der Zeile wird nicht ausgegeben (fail-closed), nichts wird geraten", async () => {
    const kaputt = { ...ablageNeu(), get: async () => { throw new Error("Ablage nicht erreichbar"); } };
    const w = (await warte({ raum: "defekt", heute: SPAET, mandant: mitErfassung("15:00"), ablage: kaputt })).wert;
    expect(zeile(w).istStunden).toBeNull();
    expect(zeile(w).istErfasst).toBeNull();
    expect(zeile(w).personen).toBe(4);                                     // Plan-Zahlen bleiben
  });
  it("Ablage nicht beschreibbar: ebenfalls kein Ist (nichts ausgeben, was nicht gesichert ist)", async () => {
    const schreibsperre = { ...ablageNeu(), setJSON: async () => { throw new Error("voll"); }, setJSONWennNeu: async () => { throw new Error("voll"); } };
    expect(zeile((await warte({ raum: "voll", heute: SPAET, mandant: mitErfassung("15:00"), ablage: schreibsperre })).wert).istStunden).toBeNull();
  });
  it("Aufräumen: Monate vor dem Auswertungszeitraum verschwinden, aktuelle bleiben; fremde Betriebe bleiben unberührt", async () => {
    const ablage = ablageNeu();
    await ablage.setJSON(istSchluessel("aufraeumen", "m1", "2025-01"), { zeilen: { A: { istStunden: 1, istErfasst: 1 } } });
    await ablage.setJSON(istSchluessel("aufraeumen", "m2", "2025-01"), { zeilen: { A: { istStunden: 2, istErfasst: 1 } } });
    await warte({ raum: "aufraeumen", heute: SPAET, mandant: mitErfassung("15:00"), ablage });
    expect(await ablage.get(istSchluessel("aufraeumen", "m1", "2025-01"))).toBeNull();
    expect(await ablage.get(istSchluessel("aufraeumen", "m1", "2026-05"))).toBeTruthy();
    expect(await ablage.get(istSchluessel("aufraeumen", "m2", "2025-01"))).toBeTruthy();
  });
});

/* ==========================================================================
   NACHTRAG WP-27b (Opus-Nachprüfung)
   ========================================================================== */
const B_TAG = "2026-05-12";                                                  // Dienstag
const B_SPAET = "2026-06-20";                                                // Monat Mai frei (Frist vorbei)
const B_F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
const bBetrieb = (personen, erfassung, extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }, { id: "B", versatzTage: 0 }],
  dienstarten: [B_F], zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung,
  abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [], ...extra });
/** Einheit A: 4 Personen, a0–a2 bestätigt (a0 nach der Korrektur bis 17 Uhr). Einheit B: 3 Personen, b0/b1 bestätigt, b2 langer Dienst in Prüfung (oder bestätigt). */
const zweiEinheiten = ({ korrektur = false, b2 = false } = {}) => {
  const personen = [], erfassung = {};
  for (let i = 0; i < 4; i++) {
    personen.push(person(`a${i}`, "mitarbeiter", "A"));
    if (i < 3) erfassung[`a${i}|${B_TAG}`] = { start: "06:00", ende: i === 0 && korrektur ? "17:00" : "15:00", bestaetigt: true };
  }
  for (let i = 0; i < 3; i++) {
    personen.push(person(`b${i}`, "mitarbeiter", "B"));
    erfassung[`b${i}|${B_TAG}`] = i < 2 || b2 ? { start: "06:00", ende: "15:00", bestaetigt: true }
      : { start: "06:00", ende: "17:30", bestaetigt: false, grund: "LANGER_DIENST" };
  }
  return bBetrieb(personen, erfassung);
};
/** Nur Einheit A mit 4 Personen, drei bestätigt. */
const nurA = (korrektur = false) => {
  const personen = [], erfassung = {};
  for (let i = 0; i < 4; i++) {
    personen.push(person(`a${i}`, "mitarbeiter", "A"));
    if (i < 3) erfassung[`a${i}|${B_TAG}`] = { start: "06:00", ende: i === 0 && korrektur ? "17:00" : "15:00", bestaetigt: true };
  }
  return bBetrieb(personen, erfassung, { einheiten: [{ id: "A", versatzTage: 0 }] });
};
/** Einen neuen Lauf erzwingen (nach dem Mindestabstand) und sein Ergebnis holen. */
const neuRechnen = async (a) => {
  const vorher = auswertungStatistik().fertig;
  auswertungHolen({ ...a, jetzt: Date.now() + 2 * BR_NEUBERECHNUNG_MS });
  for (let i = 0; i < 1200 && auswertungStatistik().fertig === vorher; i++) await new Promise((w) => setTimeout(w, 5));
  expect(auswertungStatistik().fertig, "Lauf nicht fertig").toBeGreaterThan(vorher);
  return auswertungHolen({ ...a, jetzt: 0 }).wert;
};
const zeileVon = (w, eid, monat = "2026-05") => w.zeilen.find((r) => r.monat === monat && r.einheitId === eid);
/** Gesamt minus alle Einheiten mit Ist — muss null sein, sonst ergibt die Differenz Zeiten, die keine Zeile zeigt. */
const differenz = (w, monat = "2026-05") => {
  const zs = w.zeilen.filter((z) => z.monat === monat && !z.gesperrt);
  const g = zs.find((z) => z.einheitId === null);
  if (!g || typeof g.istStunden !== "number") return 0;
  return Math.round((g.istStunden - zs.filter((z) => z.einheitId !== null && typeof z.istStunden === "number").reduce((s, z) => s + z.istStunden, 0)) * 10) / 10;
};

describe("Nachtrag WP-27b B1/B3: das Ist eines Monats atomar eingefroren", () => {
  beforeEach(() => auswertungenVergessen());

  for (const mitAblage of [true, false]) {
    it(`Sonde P1 (${mitAblage ? "Ablage" : "ohne Ablage"}): Korrektur + späte Bestätigung — Gesamt − B − A ergibt nie die Korrektur einer Einzelperson`, async () => {
      const ablage = mitAblage ? testAblage(["p1"]) : null;
      const erste = await neuRechnen({ raum: "p1", heute: B_SPAET, mandant: zweiEinheiten(), ablage });
      expect(zeileVon(erste, "A").istStunden).toBe(25.5);
      expect(zeileVon(erste, "B").istStunden).toBeNull();                 // 2 Beitragende
      expect(zeileVon(erste, null).istStunden).toBeNull();                // Zweitsperre
      /* Danach: die Leitung korrigiert a0 um +2 h und bestätigt den offenen Dienst von b2. */
      const zweite = await neuRechnen({ raum: "p1", heute: B_SPAET, mandant: zweiEinheiten({ korrektur: true, b2: true }), ablage });
      expect(zeileVon(zweite, "A")).toMatchObject({ istStunden: 25.5, istErfasst: 3, istKorrigiert: true });
      expect(zeileVon(zweite, "B")).toMatchObject({ istStunden: null, istErfasst: null, istNichtVerfuegbar: true });
      expect(zeileVon(zweite, null)).toMatchObject({ istStunden: null, istErfasst: null, istNichtVerfuegbar: true });
      for (const w of [erste, zweite]) expect(differenz(w)).toBe(0);
    });
  }
  it("Sonde P2: vorübergehender Ablagefehler beim ersten Einfrieren — der ganze Monat ohne Ist, danach ein Rahmen aus einem Guss", async () => {
    const ablage = testAblage(["p2"]);
    let kaputt = true;
    const wennNeu = ablage.setJSONWennNeu, setz = ablage.setJSON;
    ablage.setJSONWennNeu = async (k, v) => { if (k.startsWith("brist:") && kaputt) { kaputt = false; throw new Error("Ablage kurz weg"); } return wennNeu(k, v); };
    ablage.setJSON = async (k, v) => { if (k.startsWith("brist:") && kaputt) { kaputt = false; throw new Error("Ablage kurz weg"); } return setz(k, v); };
    const erste = await neuRechnen({ raum: "p2", heute: B_SPAET, mandant: zweiEinheiten({ b2: true }), ablage });
    for (const eid of ["A", "B", null]) expect(zeileVon(erste, eid).istStunden, String(eid)).toBeNull();
    const zweite = await neuRechnen({ raum: "p2", heute: B_SPAET, mandant: zweiEinheiten({ korrektur: true, b2: true }), ablage });
    expect(zeileVon(zweite, "A").istStunden).toBe(27.5);
    expect(zeileVon(zweite, "B").istStunden).toBe(25.5);
    expect(zeileVon(zweite, null).istStunden).toBe(53);
    for (const w of [erste, zweite]) expect(differenz(w)).toBe(0);
  });
  it("ein Schlüssel je Monat (brist:<raum>:<betrieb>:<monat>), keine Schlüssel je Einheit", async () => {
    const ablage = testAblage(["schluessel"]);
    await neuRechnen({ raum: "schluessel", heute: B_SPAET, mandant: zweiEinheiten({ b2: true }), ablage });
    const brist = [...ablage.daten.keys()].filter((k) => k.startsWith("brist:"));
    expect(brist).toEqual([istSchluessel("schluessel", "m1", "2026-05")]);
    expect(ablage.daten.get(brist[0]).zeilen).toEqual({ A: { istStunden: 25.5, istErfasst: 3 }, B: { istStunden: 25.5, istErfasst: 3 }, "*": { istStunden: 51, istErfasst: 6 } });
  });
  it("B3: ein anderer Lauf hat den Monat zwischen Lesen und Schreiben eingefroren — ausgegeben wird der gespeicherte Rahmen, nicht der eigene", async () => {
    const ablage = testAblage(["rennen"]);
    const k = istSchluessel("rennen", "m1", "2026-05");
    ablage.daten.set(k, { am: "x", zeilen: { A: { istStunden: 24, istErfasst: 3 }, "*": { istStunden: 24, istErfasst: 3 } } });
    const lies = ablage.get;
    let erstesLesen = true;
    ablage.get = async (kk, o) => { if (kk === k && erstesLesen) { erstesLesen = false; return null; } return lies(kk, o); };
    const w = await neuRechnen({ raum: "rennen", heute: B_SPAET, mandant: nurA(), ablage });
    expect(zeileVon(w, "A")).toMatchObject({ istStunden: 24, istErfasst: 3, istKorrigiert: true });
    expect(zeileVon(w, null)).toMatchObject({ istStunden: 24, istErfasst: 3 });
    expect(ablage.daten.get(k).zeilen.A.istStunden).toBe(24);             // nicht überschrieben
  });
  it("ein unlesbarer Rahmen (kein Objekt mit zeilen) gibt kein Ist aus", async () => {
    const ablage = testAblage(["schrott"]);
    ablage.daten.set(istSchluessel("schrott", "m1", "2026-05"), { istStunden: 25.5, istErfasst: 3 });   // Form der Vorgängerfassung
    const w = await neuRechnen({ raum: "schrott", heute: B_SPAET, mandant: nurA(), ablage });
    expect(zeileVon(w, "A").istStunden).toBeNull();
  });
});

describe("Nachtrag WP-27b B2/B4: keine Waisen nach der Raumlöschung, Aufräumen ohne Listen", () => {
  beforeEach(() => auswertungenVergessen());
  const brist = (a) => [...a.daten.keys()].filter((k) => k.startsWith("brist:"));

  it("B2: Raum ohne Kern (gelöscht) — die Rechnung schreibt nichts und gibt kein Ist aus", async () => {
    const ablage = testAblage([]);
    const w = await neuRechnen({ raum: "weg", heute: B_SPAET, mandant: nurA(), ablage });
    expect(brist(ablage)).toEqual([]);
    expect(zeileVon(w, "A").istStunden).toBeNull();
  });
  it("B2: raumLoeschen während der laufenden Rechnung — danach keine brist-Schlüssel", async () => {
    const ablage = testAblage(["mitten"]);
    const vorher = auswertungStatistik().fertig;
    auswertungHolen({ raum: "mitten", heute: B_SPAET, mandant: nurA(), ablage });
    ablage.daten.delete("kern:mitten");                                    // die Löschung läuft, während gerechnet wird
    for (let i = 0; i < 1200 && auswertungStatistik().fertig === vorher; i++) await new Promise((w) => setTimeout(w, 5));
    expect(brist(ablage)).toEqual([]);
  });
  it("B2: geschrieben wird unter der Raumsperre (wie raumLoeschen) und nur mit Kern (Quelltext)", () => {
    const q = readFileSync(path.join(process.cwd(), "server/lib/br-auswertung.mjs"), "utf8");
    expect(q).toMatch(/unterRaumsperre\(raum,/);
    expect(q).toMatch(/kernSchluessel\(raum\)/);
  });
  it("B4: Aufräumen liest die Ablage nie ganz (kein list) und löscht nur einmal je Monat", async () => {
    const ablage = testAblage(["takt"]);
    const alt = istSchluessel("takt", "m1", "2025-11");                    // vor dem Auswertungszeitraum (ab 2025-12)
    const fremd = istSchluessel("takt", "m2", "2025-11");
    ablage.daten.set(alt, { zeilen: {} });
    ablage.daten.set(fremd, { zeilen: {} });
    await neuRechnen({ raum: "takt", heute: B_SPAET, mandant: nurA(), ablage });
    expect(ablage.daten.has(alt)).toBe(false);
    expect(ablage.daten.has(fremd)).toBe(true);
    const geloescht = ablage.zaehler.delete;
    ablage.daten.set(alt, { zeilen: {} });
    await neuRechnen({ raum: "takt", heute: B_SPAET, mandant: nurA(), ablage });   // derselbe Monat: nichts
    expect(ablage.zaehler.delete).toBe(geloescht);
    expect(ablage.daten.has(alt)).toBe(true);
    await neuRechnen({ raum: "takt", heute: "2026-07-20", mandant: nurA(), ablage });   // Monatswechsel
    expect(ablage.daten.has(alt)).toBe(false);
    expect(ablage.daten.has(fremd)).toBe(true);
    expect(ablage.zaehler.list).toBe(0);
  });
});

describe("Nachtrag WP-27b B5: Ist wie im Stundenkonto, Rufbereitschaft wie in der Fachprüfung", () => {
  const SA = "2026-05-16";                                                   // Samstag: kein Plan
  const vier = (erf = () => null, extra = {}) => {
    const personen = [], erfassung = {};
    for (let i = 0; i < 4; i++) {
      personen.push(person(`a${i}`, "mitarbeiter", "A"));
      const e = erf(i);
      if (e) Object.assign(erfassung, e);
    }
    return bBetrieb(personen, erfassung, { einheiten: [{ id: "A", versatzTage: 0 }], ...extra });
  };
  const bestaetigt = (i, e = {}) => ({ [`a${i}|${B_TAG}`]: { start: "06:00", ende: "15:00", bestaetigt: true, ...e } });
  const zeileA = (m) => zeileVon(betriebsratAuswertung(m, B_SPAET), "A");

  it("(a) WP-13: bestätigte ungeplante Dienste zählen im Ist und bei den Beitragenden (6 statt 3); an einem Abwesenheitstag nicht", () => {
    const m = vier((i) => ({ ...(i < 3 ? bestaetigt(i) : {}),
      [`a${i}|${SA}`]: { start: "08:00", ende: "12:00", bestaetigt: true, ungeplant: true } }),
    { abwesenheiten: [{ personId: "a3", von: SA, bis: SA, art: "krank" }] });
    const z = zeileA(m);
    expect(z.istErfasst).toBe(6);
    expect(z.istStunden).toBe(37.5);                                       // 3 × 8,5 + 3 × 4
    expect(z.dienste).toBe(zeileA(vier((i) => (i < 3 ? bestaetigt(i) : null))).dienste);   // der Plan bleibt der Plan
  });
  it("(a) nur bestätigte ungeplante Dienste: drei Beitragende allein aus ungeplanten Diensten geben das Ist frei", () => {
    const z = zeileA(vier((i) => (i < 3 ? { [`a${i}|${SA}`]: { start: "08:00", ende: "12:00", bestaetigt: true, ungeplant: true } } : null)));
    expect(z.istErfasst).toBe(3);
    expect(z.istStunden).toBe(12);
    const offen = zeileA(vier((i) => (i < 3 ? { [`a${i}|${SA}`]: { start: "08:00", ende: "12:00", bestaetigt: false, ungeplant: true } } : null)));
    expect(offen.istStunden).toBeNull();                                   // unbestätigt zählt nicht
  });
  it("(b) WP-14: die bei der Korrektur genannte Pause gilt (26 statt 25,5) — dieselbe Rechnung wie das Konto (istZeitFuer)", () => {
    const m = vier((i) => (i < 3 ? bestaetigt(i, i === 0 ? { pause: 0 } : {}) : null));
    const z = zeileA(m);
    expect(z.istStunden).toBe(26);
    const konto = m.personen.slice(0, 3).reduce((s, p) => s + istZeitFuer(m, p, B_TAG, B_F).std, 0);
    expect(z.istStunden).toBe(Math.round(konto * 10) / 10);
  });
  for (const merker of [{ rufbereitschaft: true }, { ruhezeitNeutral: true }, { form: "ruf" }]) {
    it(`(c) Rufbereitschaft mit ${JSON.stringify(merker)}: kein langer Dienst, kein Ruhezeitverstoß (0 statt 3)`, () => {
      const R = { id: "R", name: "Ruf", start: "16:00", ende: "06:00", ...merker };
      const m = vier(() => null, { dienstarten: [B_F, R], abweichungen: { [`a0|${B_TAG}`]: "R", [`a1|${B_TAG}`]: "R", [`a2|${B_TAG}`]: "R" } });
      const z = zeileA(m);
      expect(z.gesperrt).toBe(false);
      expect(z.langeDienste).toBe(0);
      expect(z.ruhezeitUnter11).toBe(0);
    });
  }
  it("(c) Quelltext: dieselbe Merkerfunktion wie die Fachprüfung, keine eigene form-Abfrage", () => {
    const q = readFileSync(path.join(process.cwd(), "server/lib/br-auswertung.mjs"), "utf8");
    expect(q).toMatch(/import \{[^}]*\brufbereitschaft\b[^}]*\} from "\.\/fachpruefung\.mjs"/);
    expect(q).not.toMatch(/form !== "ruf"|form === "ruf"/);
    expect(q).toMatch(/import \{[^}]*\bistZeitFuer\b[^}]*\} from "\.\/istdaten\.mjs"/);
  });
});

describe("Nachtrag WP-27b B6: Betrieb ohne Kennung, CSV, Doku", () => {
  beforeEach(() => auswertungenVergessen());
  it("ein Betrieb ohne Kennung: klarer Fehler (ungueltig), kein endloses „wird berechnet“", () => {
    const r = auswertungHolen({ raum: "r", heute: HEUTE, mandant: { ...nurA(), id: undefined } });
    expect(r).toEqual({ fertig: false, ungueltig: true });
    expect(auswertungStatistik().gestartet).toBe(0);
  });
  it("CSV: Freitext gegen Formel-Injection geschützt, Trennzeichen und Anführungszeichen maskiert; Zahlen unverändert", () => {
    for (const [ein, aus] of [["=SUMME(A1:A9)", "'=SUMME(A1:A9)"], ["+49 30", "'+49 30"], ["-1", "'-1"], ["@heute", "'@heute"], ["\tWohnbereich", "\"'\tWohnbereich\""],
      [" =1+1", "' =1+1"], ["Station; Nord", '"Station; Nord"'], ['Haus "A"', '"Haus ""A"""'], ["=a;b", "\"'=a;b\""], ["Wohnbereich 1", "Wohnbereich 1"]])
      expect(csvText(ein), JSON.stringify(ein)).toBe(aus);
    expect(csvFeld("-2,50")).toBe("-2,50");
    expect(csvFeld("a;b")).toBe('"a;b"');
  });
  it("CSV der Auswertung: Einheitsnamen über csvText, Zellen über csvFeld", () => {
    const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    const f = app.slice(app.indexOf("function BetriebsratAuswertung"), app.indexOf("/* ================================ ANWENDUNG"));
    expect(f).toContain("csvText(einheit(z.einheitId))");
    expect(f).toMatch(/SPALTEN\.map\(\(\[k\]\) => csvFeld\(zelle\(z, k\)\)\)/);
    expect(app).toMatch(/import \{[^}]*csvFeld[^}]*csvText[^}]*\} from "\.\/csvfeld\.js"/);
  });
  it("Doku: kein „nie gespeichert“, kein „Stand der Ablage“ mehr; brist mit Betrieb und Monat", () => {
    const lies = (d) => readFileSync(path.join(process.cwd(), d), "utf8");
    const zeile = lies("RECHTEMATRIX.md").split("\n").find((l) => l.includes("`GET /api/br-auswertung`"));
    expect(zeile).not.toMatch(/nie gespeichert|je Raum und Tag/);
    expect(zeile).toContain("brist:<raum>:<betrieb>:<monat>");
    expect(lies("docs/acc45/wp27-nachweis.md")).not.toContain("Nichts davon wird gespeichert");
    expect(lies("docs/acc45/wp27-nachweis.md")).toContain("Nachtrag Opus-Nachprüfung");
    expect(lies("server/lib/br-auswertung.mjs")).not.toMatch(/Stand der\s+Ablage und Tag/);
  });
});

/* Review F3: 2000 Personen blockieren den gemeinsamen Prozess nicht. */
describe("Event-Loop: 2000 Personen, kein Block über 50 ms (F3)", () => {
  const gross = (n) => {
    const personen = [];
    for (let i = 0; i < n; i++) personen.push(person(`x${i}`, "mitarbeiter", `e${i % 20}`));
    return { id: "m1", name: "Haus", einheiten: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, versatzTage: i % 7 })),
      dienstarten: [{ id: "F", name: "F", start: "06:00", ende: "14:00", pause: 30 }, { id: "S", name: "S", start: "12:00", ende: "19:00" }, { id: "N", name: "N", start: "22:00", ende: "06:00" }],
      zyklus: { tage: ["F", "F", "S", "S", "N", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung: {},
      abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  it("im Hintergrund in Häppchen: gleiche Zahlen wie am Stück, längster Block unter 50 ms (Median)", async () => {
    const { monitorEventLoopDelay } = await import("node:perf_hooks");
    const m = gross(2000);
    const stueck = betriebsratAuswertung(m, HEUTE);                       // am Stück (Vergleich)
    let nr = 0;
    const messen = async () => {
      const h = monitorEventLoopDelay({ resolution: 5 });
      h.enable();
      await new Promise((w) => setTimeout(w, 30));                       // erst ein Messtakt als Bezug — sonst fällt ein Block davor aus der Messung
      const a = { raum: `gross-${++nr}`, heute: HEUTE, mandant: m };
      let r = auswertungHolen(a);
      const t0 = performance.now();
      while (!r.fertig) { await new Promise((w) => setTimeout(w, 2)); r = auswertungHolen(a); if (performance.now() - t0 > 120000) throw new Error("zu langsam"); }
      h.disable();
      return { wert: r.wert, block: h.max / 1e6 };
    };
    await messen();                                                       // aufwärmen
    const laeufe = [await messen(), await messen(), await messen()];
    expect(JSON.stringify(laeufe[0].wert)).toBe(JSON.stringify(stueck));
    const med = median(laeufe.map((l) => l.block));
    console.log(`Auswertung 2000 Personen: Event-Loop-Verzögerung ${laeufe.map((l) => l.block.toFixed(1)).join(" / ")} ms`);
    const u = urteil(med, 50, BR_HAEPPCHEN_MS);
    if (u.warnung) console.warn(u.warnung);
    /* Lokal (belastete Maschine, Speicherbereinigung von 25–60 ms) nur eine Warnung bis 150 ms; in CI bleibt 50 ms hart. */
    if (!process.env.CI && !u.ok && med < 150) console.warn(`WARNUNG: Median ${med.toFixed(1)} ms (in CI wäre ab 50 ms rot)`);
    else expect(u.ok, `Median Event-Loop-Verzögerung ${med.toFixed(1)} ms`).toBe(true);
  }, 300000);
});

describe("nur der Betriebsrat, nie gespeichert, nicht im Bestand", () => {
  it("die Auswertung steht in keiner Sicht auf den Bestand (eigener Weg, F3)", () => {
    for (const k of ["BR", "PL", "LT", "MA", "SV"]) expect(bestandFuerRolle(bestand(), SITZ[k]).mandanten[0].auswertungBetriebsrat, k).toBeUndefined();
  });
  it("mitgeschickt: nie gespeichert", () => {
    const g = bestand();
    const s = JSON.parse(JSON.stringify(bestandFuerRolle(g, SITZ.PL)));
    s.mandanten[0].auswertungBetriebsrat = { zeilen: [{ monat: "x" }] };
    const e = zusammenfuehren(g, s, SITZ.PL);
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].auswertungBetriebsrat).toBeUndefined();
  });
});

/* Review F4: der Weg selbst, je Rolle; die Serverprüfung ist belegt (Mutanten). */
describe("GET /api/br-auswertung je Rolle (F4)", () => {
  let Z;
  const LIMIT = 90000;
  beforeAll(async () => { Z = await aufbauen("brauswertung"); }, LIMIT);
  afterAll(async () => { await Z.abbauen(); });
  beforeEach(async () => { await Z.taktLeeren(); });
  const hole = (token) => Z.bearer(Z.daten, "/api/br-auswertung", token);
  const bis = async (token) => {
    for (let i = 0; i < 200; i++) {
      const r = await hole(token);
      if (r.status !== 202) return r;
      await new Promise((w) => setTimeout(w, 20));
    }
    throw new Error("nicht fertig");
  };
  const fuerRolle = async (rolle) => {
    const ich = await Z.arbeitsbereich(`br-${rolle}`, { rolle });
    return ich.token;
  };
  it("Betriebsrat mit audit.view: erst „berechnet“ oder gleich fertig, am Ende die Aggregate ohne Personenbezug", async () => {
    const t = await fuerRolle("betriebsrat");
    const r = await bis(t);
    expect(r.status).toBe(200);
    expect(r.daten.status).toBe("fertig");
    expect(Array.isArray(r.daten.auswertung.zeilen)).toBe(true);
    expect(r.daten.auswertung.mindestgruppe).toBe(BR_MINDESTGRUPPE);
    expect(JSON.stringify(r.daten)).not.toMatch(/Rina|Schmitt|Weber|p_1|p_2/);
  }, LIMIT);
  it("der Betriebsrat bekommt die Auswertung auch in GET /api/bestand nicht", async () => {
    const t = await fuerRolle("betriebsrat");
    const b = await Z.bearer(Z.daten, "/api/bestand", t);
    expect(b.status).toBe(200);
    expect(JSON.stringify(b.daten)).not.toContain("auswertungBetriebsrat");
  }, LIMIT);
  it.each(["leitung", "planer", "subplaner", "mitarbeiter"])("%s: 403", async (rolle) => {
    const t = await fuerRolle(rolle);
    const r = await hole(t);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.daten)).not.toContain("zeilen");
  }, LIMIT);
  it("raumLoeschen räumt das eingefrorene Ist (brist:) des Raums, nicht das anderer Räume", async () => {
    const RL = await import("../server/lib/raumloeschung.mjs");
    const raum = Z.raum("brist"), fremd = Z.raum("brist-fremd");
    await Z.laden().setJSON(istSchluessel(raum, "m1", "2026-05"), { zeilen: { A: { istStunden: 1, istErfasst: 1 } } });
    await Z.laden().setJSON(istSchluessel(fremd, "m1", "2026-05"), { zeilen: { A: { istStunden: 1, istErfasst: 1 } } });
    const r = await RL.raumLoeschen(Z.laden(), Z.ablageArbeit(), raum);
    expect(r.vollstaendig, JSON.stringify(r.fehler)).toBe(true);
    expect(await Z.laden().get(istSchluessel(raum, "m1", "2026-05"), { type: "json" })).toBeNull();
    expect(await Z.laden().get(istSchluessel(fremd, "m1", "2026-05"), { type: "json" })).toBeTruthy();
  }, LIMIT);
  it("ohne Anmeldung: 401", async () => {
    expect((await hole(null)).status).toBe(401);
  }, LIMIT);
  /* Nachtrag WP-27b B6: Kundenrolle und Betreiber haben audit.view bzw. keine Betriebsrolle — trotzdem 403. */
  it.each(["kunde", "betreiber"])("%s: 403 am Endpunkt", async (rolle) => {
    const raum = Z.raum(`br6-${rolle}`);
    await Z.betriebAnlegen(raum);
    const { token } = await Z.legacySitzung(raum, { rolle, person: rolle === "betreiber" ? null : "p_1" });
    const r = await hole(token);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.daten)).not.toContain("zeilen");
  }, LIMIT);
  /* Nachtrag WP-27b B6: zwei Betriebe in einem Raum — am Endpunkt bekommt der Betriebsrat von Betrieb 2 nur Betrieb 2. */
  it("zwei Betriebe in einem Raum: der Betriebsrat des zweiten Betriebs bekommt nur dessen Zahlen", async () => {
    const raum = Z.raum("br6-zwei");
    const leute = (pre, n, einheit) => Array.from({ length: n }, (_, i) => ({ id: `${pre}${i}`, vorname: "V", nachname: `NAME-${pre}${i}`, rolle: "mitarbeiter",
      status: "aktiv", bereich: einheit, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] }));
    const betrieb = (id, einheit, personen) => ({ id, name: `Haus ${id}`, einheiten: [{ id: einheit, name: `Bereich ${einheit}` }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] },
      anker: "2026-01-05", personen });
    const e = await Z.B.bestandSchreiben(Z.laden(), raum, { version: 5, mandanten: [
      betrieb("m1", "e1", [...leute("x", 5, "e1"), { id: "p_1", vorname: "Rina", nachname: "Schmitt", rolle: "leitung", status: "aktiv", bereich: "ALLE", imSchichtdienst: false }]),
      betrieb("m2", "e2", [...leute("y", 3, "e2"), { id: "r2", vorname: "Rat", nachname: "Zwei", rolle: "betriebsrat", status: "aktiv", bereich: "ALLE", imSchichtdienst: false }]),
    ] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    const k = await Z.kontoAnlegen(`br6-zwei-${Date.now()}@example.org`);
    const mg = await Z.A.mitgliedschaftAnlegen(Z.laden(), { accountId: k.id, raum, betrieb: 1, mandantId: "m2", person: "r2", rolle: "betriebsrat", status: "aktiv" });
    expect(mg.ok, JSON.stringify(mg)).toBe(true);
    const a = await Z.anmelden(k.email);
    const w = await Z.betriebOeffnen(a.keks, raum);
    expect(w.status, JSON.stringify(w.daten)).toBe(200);
    const r = await bis(w.token);
    expect(r.status).toBe(200);
    const zeilen = r.daten.auswertung.zeilen;
    expect(zeilen.length).toBeGreaterThan(0);
    expect(new Set(zeilen.map((z) => z.einheitId))).toEqual(new Set(["e2", null]));
    expect(zeilen.filter((z) => z.einheitId === null).every((z) => z.personen === 3)).toBe(true);
    expect(JSON.stringify(r.daten)).not.toMatch(/"e1"|NAME-|Rina/);
  }, LIMIT);
  /* Nachtrag WP-27b B6: ein Betrieb ohne Kennung — klarer Fehler statt endlos 202. */
  it("Betrieb ohne Kennung: 409 mit Text, nicht endlos „wird berechnet“", async () => {
    const raum = Z.raum("br6-ohneid");
    const e = await Z.B.bestandSchreiben(Z.laden(), raum, { version: 5, mandanten: [{ name: "Ohne Kennung", einheiten: [{ id: "e1", name: "W" }],
      personen: [{ id: "p_1", vorname: "Rat", nachname: "Eins", rolle: "betriebsrat", status: "aktiv", bereich: "ALLE" }] }] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    const { token } = await Z.legacySitzung(raum, { rolle: "betriebsrat", person: "p_1" });
    const r = await hole(token);
    expect(r.status).toBe(409);
    expect(r.daten.fehler).toBeTruthy();
  }, LIMIT);
  it("Betriebsrat OHNE audit.view: 403 (die Serverprüfung wirkt)", async () => {
    const t = await fuerRolle("betriebsrat");
    const alt = [...MATRIX.betriebsrat];
    MATRIX.betriebsrat = alt.filter((r) => r !== "audit.view");
    try {
      const r = await hole(t);
      expect(r.status).toBe(403);
    } finally { MATRIX.betriebsrat = alt; }
    expect((await bis(t)).status).toBe(200);
  }, LIMIT);
});

describe("Oberfläche: Auswertung für den Betriebsrat, falsche Ansichten gesperrt (Quelltext)", () => {
  const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
  it("audit.view öffnet die Auswertung, export.data den CSV-Export — nur Aggregate", () => {
    expect(app).toContain('["brauswertung", "Auswertung (Betriebsrat)", "BR:audit.view"]');
    expect(app).toMatch(/darf\(sitz, "export\.data"\) && <Btn onClick=\{csv\}>/);
  });
  it("die Ansicht holt die Auswertung vom eigenen Weg und wiederholt bei „wird berechnet“", () => {
    expect(app).toContain("SP.brAuswertung()");
    expect(app).toContain('r.status === "berechnet"');
    expect(app).toContain("Die Auswertung wird berechnet");
  });
  it("Leistungsnachweis (ohne Übergaben falsch) und leere Ansichten sind für den Betriebsrat gesperrt", () => {
    for (const v of ['["nachweis", "Leistungsnachweis", "OHNE_BR:', '["sonder", "Sondereinsätze", "OHNE_BR:', '["mittel", "Betriebsmittel", "OHNE_BR:', '["lenkzeiten", "Lenkzeiten", "OHNE_BR:'])
      expect(app, v).toContain(v);
  });
  it("Ausgleichszeitraum ohne Ist-Daten: „nicht bewertbar“ statt „eingehalten“; Urlaub ohne Konto kein NaN; Abwesenheit „abwesend“", () => {
    expect(app).toContain('ohneIstAusgleich ? "nicht bewertbar"');
    expect(app).toContain('typeof p.urlaubsanspruch === "number"');
    expect(app).toContain('id === "abwesend" ? ABW_NEUTRAL');
  });
});
