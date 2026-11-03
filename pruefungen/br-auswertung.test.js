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
import { betriebsratAuswertung, auswertungHolen, auswertungenVergessen, auswertungStatistik, BR_MINDESTGRUPPE, BR_HAEPPCHEN_MS, BR_NEUBERECHNUNG_MS, BR_MAX_GLEICHZEITIG } from "../server/lib/br-auswertung.mjs";
import { median, urteil } from "./laufzeitmessung.mjs";
import { aufbauen } from "./hilfen/szenario.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

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
    expect(q).toMatch(/const schluesselVon = \(raum, tag\)/);
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
  it("ohne Anmeldung: 401", async () => {
    expect((await hole(null)).status).toBe(401);
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
