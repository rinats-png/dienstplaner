/* ==========================================================================
   NACHPRÜFUNG WP-11 — F3-Fehlalarm (§ 14 Abs. 2 JArbSchG) und N1

   F3: Ein Spätdienst 13–21 Uhr für eine 17-Jährige wurde hart gesperrt.
   § 14 Abs. 2 Nr. 2 JArbSchG erlaubt Jugendlichen über 16 Jahren im
   mehrschichtigen Betrieb die Beschäftigung bis 23 Uhr — das trifft
   Pflege-Auszubildende. Jetzt:
     unter 16 Jahren          20–6 Uhr hart (unverändert)
     ab 16, 23–6 Uhr          hart (auch Beginn vor 6 Uhr)
     ab 16, 20–23 Uhr         ohne Einstellung „Achtung" (bestätigungspflichtig),
                              mit Einstellung jugendschutz.mehrschichtig ein Hinweis
   Die Einstellung setzt nur, wer org.edit hat; der Server prüft die Form.
   Mutterschutz bleibt unverändert hart.

   N1: Eine Dienstart löschen, die noch verwendet wird, weist der Server
   für alle Personen gleich ab — „wird noch verwendet (Person, Tag)" statt
   „nicht bekannt" nur bei geschützten Personen. Die Nachrechnung rechnet nur,
   wo sich etwas geändert haben kann; Ziel: 300 geschützte bei 2000 Personen
   unter 300 ms.

   Jeder Fall ist auf dem Stand vor der Korrektur (fc7bf0c) rot.

   Aufruf: npx vitest run pruefungen/nachpruefung-wp11.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { schutzBefunde, schutzEinsatz, schutzBefundeFuer, EINSATZREGEL_TEXTE } from "../src/regelwerk.js";
import { planungsregelnAbleiten } from "../server/lib/planungsregeln.mjs";
import * as SD from "../server/lib/schutzdurchsetzung.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const wochentag = (ab, gesucht) => { for (let n = ab; n < ab + 8; n++) { const t = tag(n); if (new Date(`${t}T12:00:00Z`).getUTCDay() === gesucht) return t; } return null; };
const MITTWOCH = wochentag(3, 3);
/** Geburtstag für „genau `jahre` Jahre und einen Monat alt am Mittwoch". */
const geboren = (jahre) => { const d = new Date(`${MITTWOCH}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - jahre); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
const J17 = { geburtstag: geboren(17) }, J15 = { geburtstag: geboren(15) }, J16 = { geburtstag: geboren(16) };
const SPAET = { id: "S", start: "13:00", ende: "21:00", pause: 30 };
const BIS23 = { id: "S2", start: "15:00", ende: "23:00", pause: 30 };
const NACHT = { id: "N", start: "22:00", ende: "06:00", pause: 30 };
const VOR6 = { id: "F0", start: "05:30", ende: "13:30", pause: 30 };
const MEHR = { jugendschutz: { mehrschichtig: true } };
const kopie = (x) => JSON.parse(JSON.stringify(x));

describe("F3: § 14 Abs. 2 JArbSchG — ab 16 Jahren bis 23 Uhr", () => {
  it("13–21 Uhr für eine 17-Jährige sperrt nicht; ohne Einstellung „Achtung\"", () => {
    const b = schutzEinsatz(J17, SPAET, MITTWOCH);
    expect(b.some((x) => x.sperrt)).toBe(false);
    expect(b).toEqual([expect.objectContaining({ regel: "JArbSchG § 14 Abs. 2", stufe: "achtung", sperrt: false })]);
  });
  it("mit Einstellung „mehrschichtig\": nur ein Hinweis, auch bis 23 Uhr", () => {
    for (const da of [SPAET, BIS23]) {
      const b = schutzEinsatz(J17, da, MITTWOCH, MEHR);
      expect(b, da.id).toEqual([expect.objectContaining({ regel: "JArbSchG § 14 Abs. 2", stufe: "hinweis", sperrt: false, hinweis: true })]);
    }
    expect(schutzEinsatz(J16, SPAET, MITTWOCH, MEHR).every((x) => !x.sperrt)).toBe(true);
  });
  it("15-Jährige: 13–21 Uhr bleibt gesperrt — mit und ohne Einstellung", () => {
    for (const einst of [undefined, MEHR]) {
      expect(schutzBefunde(J15, SPAET, MITTWOCH, einst).map((x) => x.regel)).toContain("JArbSchG § 14");
      expect(schutzEinsatz(J15, SPAET, MITTWOCH, einst).some((x) => x.sperrt)).toBe(true);
    }
  });
  it("17-Jährige: 22–06 Uhr und Beginn vor 6 Uhr bleiben gesperrt — mit und ohne Einstellung", () => {
    for (const einst of [undefined, MEHR]) for (const da of [NACHT, VOR6]) {
      expect(schutzEinsatz(J17, da, MITTWOCH, einst).some((x) => x.sperrt), `${da.id} ${!!einst}`).toBe(true);
      expect(schutzBefunde(J17, da, MITTWOCH, einst).map((x) => x.regel)).toEqual(expect.arrayContaining(["JArbSchG § 14"]));
    }
  });
  it("Mutterschutz bleibt unverändert hart, auch mit Einstellung", () => {
    expect(schutzEinsatz({ mutterschutz: true, geburtstag: "1990-01-01" }, SPAET, MITTWOCH, MEHR).some((x) => x.sperrt)).toBe(true);
  });
  it("Sicht der Schichtverantwortung (Einsatzregeln): dieselbe Bewertung, neutral", () => {
    const sv = (p) => ({ planungsregeln: planungsregelnAbleiten(p, { von: HEUTE }) });
    const kurz = (l) => l.map((x) => [x.hart, !!x.hinweis]);
    for (const [p, da, einst] of [[J17, SPAET, undefined], [J17, SPAET, MEHR], [J17, NACHT, MEHR], [J15, SPAET, MEHR], [J16, VOR6, undefined]]) {
      const roh = schutzBefunde(p, da, MITTWOCH, einst).filter((x) => /JArbSchG § 14/.test(x.regel));
      const neutral = schutzBefundeFuer(sv(p), da, MITTWOCH, einst).filter((x) => /^nacht/.test(x.regel));
      expect(kurz(neutral), `${p.geburtstag} ${da.id} ${!!einst}`).toEqual(kurz(roh));
      for (const x of neutral) expect(x.text).not.toMatch(/JArbSchG|Jugend|Alter|16/);
    }
    expect(Object.values(EINSATZREGEL_TEXTE).join(" ")).not.toMatch(/JArbSchG|Jugend/);
  });
});

/* ---------------------------------------------------------------------- */
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const SITZ = { PL: { rolle: "planer", person: "p1", betrieb: 0 }, LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 } };
const g = (einst = {}) => ({ version: 1, stand: 1, mandanten: [{ id: "m1", einheiten: [{ id: "e1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, SPAET, NACHT, { id: "X", name: "Extra", start: "08:00", ende: "12:00" }],
  zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05",
  qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6, ...einst },
  personen: [person("j17", "mitarbeiter", "e1", J17), person("j15", "mitarbeiter", "e1", J15), person("a1", "mitarbeiter", "e1"),
    person("mu", "mitarbeiter", "e1", { mutterschutz: true }),
    person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] });
const schreiben = (gg, r, aendern) => {
  const s = kopie(bestandFuerRolle(gg, SITZ[r]));
  aendern(s.mandanten[0]);
  return zusammenfuehren(gg, s, SITZ[r]);
};

describe("F3 auf dem Server", () => {
  it("Spätdienst 13–21 für die 17-Jährige: angenommen; für die 15-Jährige und nachts: abgewiesen", () => {
    const ok = schreiben(g(), "PL", (m) => { m.abweichungen[`j17|${MITTWOCH}`] = "S"; });
    expect(ok && !ok.verweigert, ok && ok.verweigert).toBe(true);
    expect(schreiben(g(), "PL", (m) => { m.abweichungen[`j15|${MITTWOCH}`] = "S"; }).verweigert).toMatch(/nicht möglich/);
    expect(schreiben(g(MEHR), "PL", (m) => { m.abweichungen[`j17|${MITTWOCH}`] = "N"; }).verweigert).toMatch(/nicht möglich/);
  });
  it("die Einstellung setzt nur, wer org.edit hat; der Server setzt Wann und Wer", () => {
    const pl = schreiben(g(), "PL", (m) => { m.einstellungen.jugendschutz = { mehrschichtig: true }; });
    expect(pl.verweigert).toBeFalsy();
    expect(pl.mandanten[0].einstellungen.jugendschutz).toBeUndefined();
    const lt = schreiben(g(), "LT", (m) => { m.einstellungen.jugendschutz = { mehrschichtig: true, geaendertVon: "x" }; });
    expect(lt.verweigert).toBeFalsy();
    expect(lt.mandanten[0].einstellungen.jugendschutz).toMatchObject({ mehrschichtig: true, geaendertVon: "l1" });
    expect(typeof lt.mandanten[0].einstellungen.jugendschutz.geaendertAm).toBe("string");
    /* Planung kann den gespeicherten Wert nicht zurücknehmen. */
    const zurueck = schreiben(lt, "PL", (m) => { m.einstellungen.jugendschutz = { mehrschichtig: false }; });
    expect(zurueck.mandanten[0].einstellungen.jugendschutz.mehrschichtig).toBe(true);
    /* Ungültige Form: abgewiesen. */
    for (const w of [{ mehrschichtig: "ja" }, { mehrschichtig: true, bis: "23:00" }, ["x"], 5])
      expect(schreiben(g(), "LT", (m) => { m.einstellungen.jugendschutz = w; }).verweigert, JSON.stringify(w)).toMatch(/Jugendarbeitsschutz/);
    /* Ein unveränderter Rundweg ändert nichts. */
    const rund = schreiben(lt, "LT", () => {});
    expect(rund.mandanten[0].einstellungen.jugendschutz).toEqual(lt.mandanten[0].einstellungen.jugendschutz);
  });
});

describe("Review U1: neu angelegte Personen werden nachgerechnet", () => {
  /* Einheit eN mit Nachtschichtfolge (jeden Tag 22–06 Uhr). */
  const gN = () => {
    const gg = g();
    gg.mandanten[0].einheiten.push({ id: "eN", versatzTage: 0 });
    gg.mandanten[0].zyklus = { tage: ["F", "F", "F", "F", "F", "-", "-"] };
    return gg;
  };
  const nachts = (gg) => { gg.mandanten[0].einheiten = [{ id: "e1", versatzTage: 0 }]; gg.mandanten[0].zyklus = { tage: ["N", "N", "N", "N", "N", "N", "N"] }; return gg; };
  it("Mutterschutz in eine Einheit mit Nachtschichtfolge anlegen: abgewiesen", () => {
    const e = schreiben(nachts(g()), "PL", (m) => { m.personen.push(person("neu", "mitarbeiter", "e1", { mutterschutz: true })); });
    expect(e.verweigert).toMatch(/nicht möglich/);
  });
  it("15-Jährige in eine Einheit mit Nachtschichtfolge anlegen: abgewiesen", () => {
    const e = schreiben(nachts(g()), "PL", (m) => { m.personen.push(person("neu", "mitarbeiter", "e1", J15)); });
    expect(e.verweigert).toMatch(/nicht möglich/);
  });
  it("eine Erwachsene ohne Schutzmerkmal anlegen: angenommen", () => {
    const e = schreiben(nachts(g()), "PL", (m) => { m.personen.push(person("neu", "mitarbeiter", "e1")); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
  });
  it("neue Person in einer Einheit ohne Nachtdienst: angenommen", () => {
    const e = schreiben(gN(), "PL", (m) => { m.personen.push(person("neu", "mitarbeiter", "e1", { mutterschutz: true })); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
  });
  it("eine gesperrte Person blockiert eine Änderung der Schichtfolge nicht", () => {
    const gg = g();
    gg.mandanten[0].personen.push(person("alt", "mitarbeiter", "e1", { status: "gesperrt" }));
    const e = schreiben(gg, "LT", (m) => { m.zyklus = { tage: ["F", "F", "F", "F", "-", "-", "-"] }; });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
  });
  it("Wiedereintritt (Status gesperrt → aktiv) in die Nachtschichtfolge: abgewiesen", () => {
    const gg = nachts(g());
    gg.mandanten[0].personen.push(person("alt", "mitarbeiter", "e1", { mutterschutz: true, status: "gesperrt" }));
    const e = schreiben(gg, "PL", (m) => { m.personen.find((p) => p.id === "alt").status = "aktiv"; });
    expect(e.verweigert).toMatch(/nicht möglich/);
  });
});

describe("N1: eine verwendete Dienstart löschen", () => {
  it("für alle Personen gleich: „wird noch verwendet (Person, Tag)\" — geschützt oder nicht", () => {
    for (const pid of ["a1", "mu"]) {
      const gg = g();
      gg.mandanten[0].abweichungen[`${pid}|${tag(5)}`] = "X";
      const e = schreiben(gg, "LT", (m) => { m.dienstarten = m.dienstarten.filter((d) => d.id !== "X"); });
      expect(e.verweigert, pid).toMatch(new RegExp(`„Extra" wird noch verwendet \\(V N${pid}, ${tag(5)}\\)`));
      expect(e.verweigert).not.toMatch(/nicht bekannt|Schutz|Mutter/);
    }
  });
  it("in der Schichtfolge: abgewiesen; nur in der Vergangenheit oder gar nicht verwendet: gelöscht", () => {
    expect(schreiben(g(), "LT", (m) => { m.dienstarten = m.dienstarten.filter((d) => d.id !== "F"); }).verweigert).toMatch(/Schichtfolge/);
    const alt = g();
    alt.mandanten[0].abweichungen[`a1|${tag(-3)}`] = "X";
    const e = schreiben(alt, "LT", (m) => { m.dienstarten = m.dienstarten.filter((d) => d.id !== "X"); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    const frei = schreiben(g(), "LT", (m) => { m.dienstarten = m.dienstarten.filter((d) => d.id !== "X"); });
    expect(frei && !frei.verweigert, frei && frei.verweigert).toBe(true);
  });
});

describe("N1: Laufzeit der Nachrechnung", () => {
  it("300 geschützte bei 2000 Personen, Schichtfolge geändert: unter 300 ms", () => {
    const personen = [];
    for (let i = 0; i < 2000; i++)
      personen.push(person(`x${i}`, "mitarbeiter", `e${i % 20}`, i < 300 ? (i % 2 ? { mutterschutz: true } : J17) : {}));
    const altM = { id: "m1", einheiten: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, versatzTage: i % 7 })),
      dienstarten: [{ id: "F", start: "06:00", ende: "14:00" }, { id: "S", start: "12:00", ende: "19:00" }, { id: "N", start: "22:00", ende: "06:00" }],
      zyklus: { tage: ["F", "F", "S", "S", "-", "-", "-"] }, anker: "2026-01-05", personen, abweichungen: {}, einstellungen: MEHR };
    /* Abweichungen: jede Person an zehn Tagen im Horizont (20 000 Einträge). */
    for (const p of personen) for (let i = 0; i < 120; i += 12) altM.abweichungen[`${p.id}|${tag(i)}`] = i % 24 ? "F" : "-";
    const neuM = { ...altM, abweichungen: { ...altM.abweichungen }, zyklus: { tage: ["F", "S", "S", "F", "-", "-", "-"] } };   // wie vom Client: eine Kopie
    /* Der Server läuft dauerhaft: Maßgeblich ist ein warmer Aufruf — das
       Minimum aus drei, damit parallel laufende Prüfdateien die Messung nicht
       verfälschen. Der erste (kalt, ohne JIT) wird nur ausgegeben. */
    const lauf = () => { const t0 = performance.now(); expect(SD.abweichungenSchutzPruefen(altM, neuM, HEUTE)).toBeNull(); return performance.now() - t0; };
    const kalt = lauf();
    const ms = Math.min(lauf(), lauf(), lauf());
    console.log(`Nachrechnung 2000 Personen / 300 geschützt / 121 Tage / 20 000 Abweichungen: kalt ${kalt.toFixed(1)} ms, warm ${ms.toFixed(1)} ms (${SD.letzteLaufzeit.geprueft} Einteilungen geprüft)`);
    expect(SD.letzteLaufzeit).toMatchObject({ mittelbar: true, personen: 300 });
    expect(ms).toBeLessThan(300);
  });
});
