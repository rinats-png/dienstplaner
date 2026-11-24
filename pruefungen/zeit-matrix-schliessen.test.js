/* ==========================================================================
   ZEIT-Matrix schließen: T-DST-F2, T-UHR-P1/-M1/-T1, T-PAUSE-1 (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.1, § 13.3)

   Nur Tests, keine Änderung an server/ oder src/. Geprüft wird gegen die Serverfunktion (daten()) mit vorgegebener
   Serverzeit (vi.setSystemTime, nur Date) wie pruefungen/serverdatum.test.js; die Zeitbasis ist fest, keine freie Uhr.
   Die Prozesszone (TZ) spielt keine Rolle: Die Tests laufen unter UTC und den Zusatzzonen von
   pruefungen/zeit-f-zonen.mjs mit gleichem Ergebnis.

   T-DST-F2  Nachtdienst Sa 28.03. 22:00 → So 29.03.2026 06:00 (Frühjahrsnacht, 23-Stunden-Tag): wirkliche Dauer 7 h,
             Nachtzuschlag 7 h bei Nachtfenster 22–06, Schichttag 28.03. (Beginn), Ende-Kalendertag 29.03.
   T-UHR-*   Geräteuhr +1 h, −1 h, +1 Tag, online: Der Server bestimmt Tag und Uhrzeit; das Gerätedatum wird nur
             verglichen, GERAETEDATUM_ABWEICHEND steht nur, wenn der Gerätetag vom Betriebstag abweicht.
   T-PAUSE-1 Pause über Mitternacht und in beiden Umstellungsnächten (Frühjahr 28.→29.03., Herbst 24.→25.10.). Die Lage einer Pause wird nicht gespeichert (nur Minuten): geprüft ist Nachtdienst über Mitternacht mit Pause.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { istZeitFuer } from "../src/istdaten.js";
import * as IE from "../server/lib/isteinfrieren.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, sitzungAnlegen, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id) => ({ id, vorname: "V", nachname: id, rolle: "mitarbeiter", bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const DIENSTE = [
  { id: "F", name: "Früh", start: "06:00", ende: "14:00" },
  { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 0 },
  { id: "N30", name: "Nacht mit Pause", start: "22:00", ende: "06:00", pause: 30 },
];
async function raumAnlegen(raum, ids, abweichungen = {}) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: DIENSTE, personen: ids.map(person),
    einstellungen: { nachtVon: "22:00", nachtBis: "06:00" },
    abweichungen, abwesenheiten: [], erfassung: {}, einstempeln: {} }] }, { durch: "Pruefung" });
}
/* Eine frische Sitzung je Schritt: Ein Zeitsprung über Stunden überschritte sonst die Untätigkeitsgrenze. */
const sitzung = async (raum, id) => (await sitzungAnlegen({ bestand: raum, name: id, rolle: "mitarbeiter",
  person: id, betrieb: 0, mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
const stempeln = async (raum, id, rumpf) => anfrage("/api/stempeln", { token: await sitzung(raum, id), rumpf });
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-zeit-matrix-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) {
    await rm(wurzel, { recursive: true, force: true });
    /* Geschwisterordner, den server/lib/schluesselepoche.mjs (zustandsVerzeichnis) neben der Ablage anlegt. */
    await rm(`${wurzel}-zustand`, { recursive: true, force: true });
  }
});

/** Kalendertag, den ein Gerät in Berlin zeigt, dessen Uhr `versatzMs` vor- (+) oder nachgeht (−). */
const geraetetag = (serverIso, versatzMs) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(Date.parse(serverIso) + versatzMs));

describe("T-DST-F2: Nachtdienst Sa 28.03. → So 29.03.2026 (Frühjahrsnacht)", () => {
  it("Stempel: Schichttag 28.03., Ende-Kalendertag 29.03., Wanduhr 22:00/06:00, kein Prüffall, Ist-Dauer 7 h", async () => {
    await raumAnlegen("mx-f2", ["a1"], { "a1|2026-03-28": "N" });
    zeitAuf("2026-03-28T21:00:00Z");                                   // Sa 28.03. 22:00 MEZ
    const s = await stempeln("mx-f2", "a1", { art: "start" });
    expect([s.status, s.datum], JSON.stringify(s)).toEqual([200, "2026-03-28"]);
    zeitAuf("2026-03-29T04:00:00Z");                                   // So 29.03. 06:00 MESZ
    const e = await stempeln("mx-f2", "a1", { art: "ende" });
    expect([e.status, e.datum], JSON.stringify(e)).toEqual([200, "2026-03-28"]);
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-03-29" });
    expect(e.markierungen, "Beginn und Ende sind eindeutig, die Lücke liegt dazwischen").not.toContain("ZEITUMSTELLUNG");
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", bestaetigt: true });
    const m = await mandant("mx-f2");
    expect(m.einstempeln["a1|2026-03-29"], "nichts am Sonntag").toBeUndefined();
    /* Gemessen sind 7 Stunden (Abstand der Zeitpunkte), nicht 8 (Wanduhr). */
    expect((Date.parse(m.einstempeln["a1|2026-03-28"].endeAm) - Date.parse(m.einstempeln["a1|2026-03-28"].startAm)) / 3600000).toBe(7);
    expect(istZeitFuer(m, m.personen[0], "2026-03-28", m.dienstarten.find((x) => x.id === "N")).std).toBe(7);
  });

  it("Zuschläge: Nachtfenster 22–06 = 7 h Nachtzuschlag; Samstag 2 h, Sonntag 5 h; Summe 7 h", () => {
    const m = { bundesland: "BB", einheiten: [], einstellungen: { nachtVon: "22:00", nachtBis: "06:00" } };
    const r = { nacht: 0, sonntag: 0, feiertag: 0, samstag: 0 };
    IE.zuschlagTagAddieren(m, null, "2026-03-28", { start: "22:00", ende: "06:00", pause: 0 }, r);
    expect(r).toEqual({ nacht: 7, sonntag: 5, feiertag: 0, samstag: 2 });
    expect(r.sonntag + r.samstag).toBe(7);
  });
});

describe("T-UHR-P1 / -M1 / -T1: Geräteuhr +1 h, −1 h, +1 Tag, online — die Serverzeit gilt", () => {
  const STUNDE = 3600000, TAG = 24 * STUNDE;
  /* Ein Beginn mit dem Datum, das ein Gerät mit falsch gestellter Uhr schickt. Der Server nimmt es an, ignoriert es und
     markiert nur bei Tagesabweichung — nie eine Absage. `erwartetTag` ist der Berliner Tag der Serverzeit. */
  const fall = async (raum, serverIso, versatzMs, erwartetTag, erwartetZeit, abweichend, toleranz = false) => {
    await raumAnlegen(raum, ["a1"], { [`a1|${erwartetTag}`]: "F" });
    zeitAuf(serverIso);
    const gt = geraetetag(serverIso, versatzMs);
    const s = await stempeln(raum, "a1", { art: "start", datum: gt });
    expect(s.status, JSON.stringify(s)).toBe(200);
    expect(s.datum, "Tag kommt vom Server").toBe(erwartetTag);
    expect(s.eintrag.start, "Uhrzeit kommt vom Server").toBe(erwartetZeit);
    expect(s.eintrag.startAm).toBe(new Date(serverIso).toISOString());
    expect(s.markierungen.includes("GERAETEDATUM_ABWEICHEND"), `Gerätetag ${gt}, Betriebstag ${erwartetTag}`).toBe(abweichend);
    if (!toleranz) expect(gt === erwartetTag, "Vorbedingung: Markierung genau bei Tagesabweichung").toBe(!abweichend);
    else expect(gt !== erwartetTag, "Vorbedingung: Gerätetag weicht ab (Toleranz um Mitternacht)").toBe(true);
    const m = await mandant(raum);
    expect(Object.keys(m.einstempeln)).toEqual([`a1|${erwartetTag}`]);
    expect((m.einstempeln[`a1|${erwartetTag}`].markierungen || []).includes("GERAETEDATUM_ABWEICHEND")).toBe(abweichend);
    return s;
  };

  it("P1 (+1 h): mittags derselbe Tag — keine Markierung, Serverzeit 10:00 (nicht 11:00)", async () => {
    await fall("mx-p1-mittag", "2026-11-02T09:00:00Z", +STUNDE, "2026-11-02", "10:00", false);
  });
  it("P1 (+1 h): 22:30 Berlin noch derselbe Tag; 23:30 Berlin zeigt das Gerät schon den Folgetag — dann markiert, gestempelt auf den Betriebstag", async () => {
    await fall("mx-p1-2230", "2026-11-02T21:30:00Z", +STUNDE, "2026-11-02", "22:30", false);
    await fall("mx-p1-2330", "2026-11-02T22:30:00Z", +STUNDE, "2026-11-02", "23:30", true);
  });
  it("Uhr um Minuten falsch um Mitternacht: Toleranz GERAETE_TOLERANZ_MS = 2 min an der SERVERzeit; genau 2 min nicht markiert, mehr als 2 min markiert", async () => {
    await fall("mx-tol-nah", "2026-11-02T22:59:30Z", 60000, "2026-11-02", "23:59", false, true);      // Server 23:59:30, Gerät 00:00:30 (Folgetag)
    await fall("mx-tol-fern", "2026-11-02T22:57:00Z", 180000, "2026-11-02", "23:57", true, true);     // Server 23:57:00, Gerät 00:00:00 (Folgetag)
  });
  it("Grenzfälle der Toleranz (Regel: Gerätetag = Berliner Tag von Serverzeit −2 min oder +2 min → nicht markiert)", async () => {
    const TAG = 24 * 3600000;
    /* Server kurz vor Mitternacht, Gerät schon im Folgetag: 23:58:00 liegt genau 2 min davor (+2 min = 00:00:00 = Folgetag). */
    await fall("mx-g-2358-00", "2026-11-02T22:58:00Z", TAG, "2026-11-02", "23:58", false, true);
    await fall("mx-g-2357-59", "2026-11-02T22:57:59Z", TAG, "2026-11-02", "23:57", true, true);
    /* Gegenseite: Server kurz nach Mitternacht, Gerät noch im Vortag: 00:01:59 −2 min = 23:59:59 Vortag; 00:02:00 −2 min = 00:00:00 selber Tag. */
    await fall("mx-g-0001-59", "2026-11-02T23:01:59Z", -TAG, "2026-11-03", "00:01", false, true);
    await fall("mx-g-0002-00", "2026-11-02T23:02:00Z", -TAG, "2026-11-03", "00:02", true, true);
  });
  it("M1 (−1 h): mittags derselbe Tag — keine Markierung; 01:30 Berlin noch derselbe Tag; 00:30 Berlin zeigt das Gerät den Vortag — dann markiert", async () => {
    await fall("mx-m1-mittag", "2026-11-02T09:00:00Z", -STUNDE, "2026-11-02", "10:00", false);
    await fall("mx-m1-0130", "2026-11-02T00:30:00Z", -STUNDE, "2026-11-02", "01:30", false);
    await fall("mx-m1-0030", "2026-11-01T23:30:00Z", -STUNDE, "2026-11-02", "00:30", true);
  });
  it("T1 (+1 Tag): immer markiert, nie abgelehnt; Beginn und Ende auf Serverzeit und Serverdatum", async () => {
    await fall("mx-t1", "2026-11-02T09:00:00Z", +TAG, "2026-11-02", "10:00", true);
    zeitAuf("2026-11-02T13:00:00Z");
    const e = await stempeln("mx-t1", "a1", { art: "ende", datum: geraetetag("2026-11-02T13:00:00Z", +TAG) });
    expect([e.status, e.datum], JSON.stringify(e)).toEqual([200, "2026-11-02"]);
    expect(e.eintrag).toMatchObject({ start: "10:00", ende: "14:00" });
    expect(e.markierungen).toContain("GERAETEDATUM_ABWEICHEND");
  });
  it("in den Umstellungsnächten gilt dieselbe Regel (Frühjahr 03:30 MESZ mit +1 Tag; Herbst 02:30 MEZ mit −1 h)", async () => {
    await fall("mx-dst-fruehjahr", "2026-03-29T01:30:00Z", +TAG, "2026-03-29", "03:30", true);
    await fall("mx-dst-herbst", "2026-10-25T01:30:00Z", -STUNDE, "2026-10-25", "02:30", false);
  });
});

describe("T-PAUSE-1: Pause über Mitternacht und in beiden Umstellungsnächten", () => {
  /* Nachtdienst 22:00 → 06:00 mit 30 min Pause (zwei Stunden nach Beginn bis nach Mitternacht liegt die Pause im Dienst).
     Die Pause gehört zum Ende-Stempel; gespeichert werden nur die Minuten, nicht ihre Lage. Geprüft wird also „Nachtdienst über
     Mitternacht mit Pause“, nicht eine Pause an der Mitternacht. istZeitFuer rechnet mit dauerAm (Wanduhr plus uhrversatz,
     server/lib/istdaten.mjs), nicht mit startAm/endeAm; in den Umstellungsnächten ergibt das die wirkliche Dauer. */
  const nacht = async (raum, tag, startZ, endeZ, pause) => {
    await raumAnlegen(raum, ["a1"], { [`a1|${tag}`]: "N30" });
    zeitAuf(startZ);
    const s = await stempeln(raum, "a1", { art: "start" });
    expect([s.status, s.datum], JSON.stringify(s)).toEqual([200, tag]);
    zeitAuf(endeZ);
    const e = await stempeln(raum, "a1", { art: "ende", pause });
    expect([e.status, e.datum], JSON.stringify(e)).toEqual([200, tag]);
    const m = await mandant(raum);
    return { e, m, ist: istZeitFuer(m, m.personen[0], tag, m.dienstarten.find((x) => x.id === "N30")) };
  };

  it("gewöhnliche Nacht 01.→02.11.: Pause 30 min über Mitternacht, Anwesenheit 8 h, Ist 7,5 h", async () => {
    const { e, ist } = await nacht("mx-pa-normal", "2026-11-01", "2026-11-01T21:00:00Z", "2026-11-02T05:00:00Z", 30);
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-11-02", pause: 30 });
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", pause: 30, bestaetigt: true });
    expect(e.markierungen).not.toContain("PAUSE_ZU_KURZ");
    expect(e.markierungen).not.toContain("PAUSE_UNGUELTIG");
    expect(ist.std).toBe(7.5);
  });

  it("Frühjahrsnacht 28.→29.03.: Anwesenheit 7 h, Pause 30 min, Ist 6,5 h (nicht 7,5 h der Wanduhr)", async () => {
    const { e, ist } = await nacht("mx-pa-fruehjahr", "2026-03-28", "2026-03-28T21:00:00Z", "2026-03-29T04:00:00Z", 30);
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-03-29", pause: 30 });
    expect(e.erfassung).toMatchObject({ pause: 30, bestaetigt: true });
    expect(e.markierungen).not.toContain("PAUSE_ZU_KURZ");
    expect(e.markierungen).not.toContain("PAUSE_UNGUELTIG");
    expect(ist.std).toBe(6.5);
  });

  it("Herbstnacht 24.→25.10.: Anwesenheit 9 h, Pause 30 min, Ist 8,5 h (nicht 7,5 h der Wanduhr)", async () => {
    const { e, ist } = await nacht("mx-pa-herbst", "2026-10-24", "2026-10-24T20:00:00Z", "2026-10-25T05:00:00Z", 30);
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-10-25", pause: 30 });
    expect(e.erfassung).toMatchObject({ pause: 30, bestaetigt: true });
    expect(e.markierungen).not.toContain("PAUSE_ZU_KURZ");
    expect(e.markierungen).not.toContain("PAUSE_UNGUELTIG");
    expect(ist.std).toBe(8.5);
  });

  it("Pause ohne Angabe bei Nachtdienst über Mitternacht: Planpause der Dienstart (30 min) zählt, Ist 7,5 h", async () => {
    const { e, ist } = await nacht("mx-pa-plan", "2026-11-01", "2026-11-01T21:00:00Z", "2026-11-02T05:00:00Z", undefined);
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", bestaetigt: true });
    expect(ist.std).toBe(7.5);
  });
});
