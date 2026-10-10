/* ==========================================================================
   KALENDER-FEED: TERMINE PRÜFEN, FEHLER PROTOKOLLIEREN

   Zwei Altbefunde aus der Staging-Prüfung von Phase A.1:

   - /kalender/daten speicherte jede Liste, die ein Array war. Ein kaputter
     Termin fiel erst beim Abruf des Feeds auf — als 500.
   - Der Kalender-Handler antwortete bei einem Fehler mit 500 und
     protokollierte nichts.

   Geprüft wird der echte Handler, derselbe Standardexport, den server.mjs
   unter /kalender/* einhängt.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { aufbauen, hash, WIRT } from "./hilfen/szenario.mjs";
import { terminFehler } from "../server/funktionen/kalender.mjs";

let Z, ich;
const LIMIT = 60000;

beforeAll(async () => {
  Z = await aufbauen("kalender");
  ich = await Z.arbeitsbereich("kalender");
}, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });

const dienst = (x = {}) => ({ id: "d-p_1-2026-11-02", datum: "2026-11-02", von: "06:00",
  endDatum: "2026-11-02", bisZeit: "14:00", ganztags: false, titel: "Frühdienst",
  text: "8 Stunden · 30 Min Pause", ort: "Wohnbereich Süd", ...x });
const nacht = (x = {}) => dienst({ id: "d-p_1-2026-11-03", datum: "2026-11-03", von: "21:30",
  endDatum: "2026-11-04", bisZeit: "06:30", titel: "Nachtdienst", ...x });
const urlaub = (x = {}) => ({ id: "abw-a_1-2026-11-05", datum: "2026-11-05", bis: "2026-11-06",
  ganztags: true, titel: "Urlaub", text: "", ...x });

const einrichten = async () => {
  const e = await Z.bearer(Z.kalender, "/kalender/einrichten", ich.token,
    { methode: "POST", rumpf: { personId: "p_1" } });
  expect(e.status).toBe(200);
  return e.daten.geheim;
};
const senden = (geheim, termine, x = {}) => Z.bearer(Z.kalender, "/kalender/daten", ich.token,
  { methode: "POST", rumpf: { geheim, name: "Jürgen Größ", betrieb: "Haus Ä", termine, ...x } });
const feed = async (geheim) => {
  const antwort = await Z.kalender(new Request(`http://${WIRT}/kalender/feed/${geheim}.ics`,
    { headers: { host: WIRT, "x-forwarded-for": "198.51.100.7" } }), {});
  return { status: antwort.status, text: await antwort.text() };
};
const roh = async (pfad, text) => {
  const antwort = await Z.kalender(new Request(`http://${WIRT}${pfad}`, { method: "POST",
    headers: { host: WIRT, "x-forwarded-for": "198.51.100.8", authorization: `Bearer ${ich.token}`,
      "content-type": "application/json" }, body: text }), {});
  return { status: antwort.status, daten: await antwort.json().catch(() => null) };
};

describe("Termine: die Form, die die Anwendung baut", () => {
  it("Dienst, Nachtdienst, ganztägig und Dienstende 24:00 sind gültig", () => {
    expect(terminFehler(dienst())).toBe(null);
    expect(terminFehler(nacht())).toBe(null);
    expect(terminFehler(urlaub())).toBe(null);
    expect(terminFehler(dienst({ von: "16:00", bisZeit: "24:00" }))).toBe(null);
    expect(terminFehler(dienst({ text: undefined, ort: undefined }))).toBe(null);
  });

  it.each([
    ["kein Objekt", "x", "termin"],
    ["Array", [], "termin"],
    ["Kennung fehlt", dienst({ id: undefined }), "id"],
    ["Kennung mit Zeilenumbruch", dienst({ id: "d-1\r\nATTENDEE:x" }), "id"],
    ["Datum fehlt", dienst({ datum: undefined }), "datum"],
    ["Datum ohne Kalendertag", dienst({ datum: "2026-02-30", endDatum: "2026-02-30" }), "datum"],
    ["Monat 13", dienst({ datum: "2026-13-01" }), "datum"],
    ["Datum als Wort", dienst({ datum: "heute" }), "datum"],
    ["Titel fehlt", dienst({ titel: undefined }), "titel"],
    ["Titel leer", dienst({ titel: "" }), "titel"],
    ["Titel zu lang", dienst({ titel: "x".repeat(201) }), "titel"],
    ["Text keine Zeichenkette", dienst({ text: 5 }), "text"],
    ["Beginn fehlt", dienst({ von: undefined }), "von"],
    ["Stunde 25", dienst({ von: "25:00" }), "von"],
    ["Stunde einstellig", dienst({ von: "6:00" }), "von"],
    ["Minute 60", dienst({ von: "12:60" }), "von"],
    ["Beginn 24:00", dienst({ von: "24:00" }), "von"],
    ["Ende fehlt", dienst({ bisZeit: undefined }), "bisZeit"],
    ["Ende vor Beginn am selben Tag", dienst({ bisZeit: "05:00" }), "bisZeit"],
    ["Enddatum fehlt", dienst({ endDatum: undefined }), "endDatum"],
    ["Enddatum zwei Tage später", dienst({ endDatum: "2026-11-04" }), "endDatum"],
    ["Enddatum davor", dienst({ endDatum: "2026-11-01" }), "endDatum"],
    ["ganztags ohne bis", urlaub({ bis: undefined }), "bis"],
    ["ganztags bis = datum", urlaub({ bis: "2026-11-05" }), "bis"],
    ["ganztags als Text", dienst({ ganztags: "ja" }), "ganztags"],
  ])("%s → %s", (_, t, feld) => {
    expect(terminFehler(t)).toBe(feld);
  });
});

describe("POST /kalender/daten", () => {
  it("gültige Termine: 200, Feed als ICS mit Umlauten, 24:00 als Mitternacht des Folgetags", async () => {
    const geheim = await einrichten();
    const s = await senden(geheim, [dienst(), nacht(), urlaub(), dienst({ id: "d-p_1-2026-11-07",
      datum: "2026-11-07", endDatum: "2026-11-07", von: "16:00", bisZeit: "24:00", titel: "Spätdienst" })]);
    expect(s.status, JSON.stringify(s.daten)).toBe(200);
    expect(s.daten.termine).toBe(4);
    const f = await feed(geheim);
    expect(f.status).toBe(200);
    expect(f.text).toContain("BEGIN:VCALENDAR");
    expect(f.text).toContain("SUMMARY:Frühdienst");
    expect(f.text).toContain("DTSTART;TZID=Europe/Berlin:20261103T213000");
    expect(f.text).toContain("DTEND;TZID=Europe/Berlin:20261104T063000");
    expect(f.text).toContain("DTEND;TZID=Europe/Berlin:20261108T000000");
    expect(f.text).not.toContain("T240000");
    expect(f.text).toContain("DTSTART;VALUE=DATE:20261105");
  });

  it("ungültiger Termin: 400 mit Feld und Stelle, gespeichert wird nichts", async () => {
    const geheim = await einrichten();
    expect((await senden(geheim, [dienst()])).status).toBe(200);
    const vorher = await Z.laden().get(`feeddaten:${hash(geheim)}`, { type: "json" });

    for (const [t, feld] of [[dienst({ von: "25:00" }), "von"], [dienst({ datum: "2026-02-30" }), "datum"],
      [dienst({ titel: undefined }), "titel"], [{ datum: "2026-11-02" }, "id"]]) {
      const s = await senden(geheim, [dienst(), t]);
      expect(s.status).toBe(400);
      expect(s.daten).toMatchObject({ fehler: "Ungültiger Termin.", termin: 1, feld });
    }
    const nachher = await Z.laden().get(`feeddaten:${hash(geheim)}`, { type: "json" });
    expect(nachher).toEqual(vorher);
  });

  it("fehlende Pflichtangaben, falsche Typen, zu viele Termine", async () => {
    const geheim = await einrichten();
    expect((await senden(geheim, "keine Liste")).status).toBe(400);
    expect((await senden(undefined, [dienst()])).status).toBe(400);
    expect((await senden(geheim, [dienst()], { name: "x".repeat(201) })).status).toBe(400);
    expect((await senden(geheim, [dienst()], { betrieb: { a: 1 } })).status).toBe(400);
    expect((await senden(geheim, Array.from({ length: 801 }, () => dienst()))).status).toBe(400);
  });

  it("kaputtes JSON und ein Array als Rumpf: 400 statt 500", async () => {
    expect((await roh("/kalender/daten", "{kaputt")).status).toBe(400);
    expect((await roh("/kalender/daten", "[1,2]")).status).toBe(400);
    expect((await roh("/kalender/einrichten", "{kaputt")).status).toBe(400);
    expect((await roh("/kalender/loeschen", "{kaputt")).status).toBe(400);
  });

  it("Zeilenumbrüche in Texten werden maskiert, nicht zu neuen ICS-Zeilen", async () => {
    const geheim = await einrichten();
    const s = await senden(geheim, [dienst({ text: "a\rATTENDEE:mailto:x@example.org\nb", ort: "c\r\nORGANIZER:y" })]);
    expect(s.status).toBe(200);
    const zeilen = (await feed(geheim)).text.split("\r\n");
    expect(zeilen.some((z) => z.includes("\r") || z.includes("\n"))).toBe(false);
    expect(zeilen.some((z) => /^(ATTENDEE|ORGANIZER)/.test(z))).toBe(false);
  });
});

describe("Feed-Abruf mit Altdaten", () => {
  it("ungültige Termine aus der Zeit vor der Prüfung fehlen im Feed, statt ihn scheitern zu lassen", async () => {
    const geheim = await einrichten();
    await Z.laden().setJSON(`feeddaten:${hash(geheim)}`, { name: "Alt", betrieb: "Haus",
      termine: [dienst(), { id: "kaputt", datum: "2026-11-09", titel: "ohne Zeiten" }, null] });
    const f = await feed(geheim);
    expect(f.status).toBe(200);
    expect(f.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(f.text).toContain("SUMMARY:Frühdienst");
  });
});

describe("Fehler im Handler", () => {
  it("500 nach außen ohne Interna, Ursache im Protokoll, Geheimnis nicht", async () => {
    const geheim = await einrichten();
    expect((await senden(geheim, [dienst()])).status).toBe(200);
    /* Die Datei des Feeds unlesbar machen: kein gültiges JSON mehr. */
    const datei = path.join(Z.wurzel, "centric", `${encodeURIComponent(`feed:${hash(geheim)}`)}.json`);
    await writeFile(datei, "{kaputt");

    const spur = Z.ablageSpur();
    const vorher = new Set((await spur.list({})).blobs.map((b) => b.key));
    const f = await feed(geheim);
    expect(f.status).toBe(500);
    const daten = JSON.parse(f.text);
    expect(daten).toEqual({ fehler: "Serverfehler", text: "Das hat nicht geklappt. Versuch es noch einmal." });
    expect(f.text).not.toMatch(/JSON|Unexpected|centric|feed:|\//);

    const neu = (await spur.list({})).blobs.map((b) => b.key).filter((k) => !vorher.has(k) && k.includes("/fehler/"));
    expect(neu).toHaveLength(1);
    const eintrag = await spur.get(neu[0], { type: "json" });
    expect(eintrag).toMatchObject({ art: "fehler", ausgang: "kalender/feed" });
    expect(String(eintrag.zusatz)).toMatch(/Umschlag|JSON/);
    expect(JSON.stringify(eintrag)).not.toContain(geheim);
  });
});
