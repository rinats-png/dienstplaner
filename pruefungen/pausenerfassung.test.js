/* ==========================================================================
   PAUSENERFASSUNG UND MINDESTPAUSE (WP-16)

   - Beim Ausstempeln lässt sich die genommene Pause angeben (Minuten). Sie
     gehört zum Original des Stempels (WP-06: über das Speichern
     unveränderlich), steht an der Ist-Zeit und zählt in der Ist-Rechnung.
   - Ist sie kürzer als nötig, gibt es einen Hinweis — keine Sperre:
     § 4 ArbZG (mehr als 6 h: 30 min, mehr als 9 h: 45 min), für Jugendliche
     § 11 JArbSchG (mehr als 4,5 h: 30 min, mehr als 6 h: 60 min). Eine Regel,
     eine Rechnung (regelwerk.mjs pausePflicht) für Stempeln, Korrektur,
     Antrag, Selbstauskunft und die Prüfung der Oberfläche.
   - Eine ungültige Pause kostet nie den Stempel: gespeichert ohne Pause,
     gekennzeichnet (PAUSE_UNGUELTIG).
   - Der Offline-Puffer (WP-07) trägt die Pause mit.
   - Die Selbstauskunft nimmt eine Pause an.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pausePflicht, pauseGenuegt } from "../server/lib/regelwerk.mjs";
import { regelHinweise } from "../server/lib/zeitregeln.mjs";
import { istZeitFuer, pruefZeitFuer } from "../src/istdaten.js";
import * as PUF from "../src/stempelpuffer.js";
import { selbstauskunftPruefen } from "../server/lib/zeiterfassung.mjs";
import { BEGINN_GLEICH_ENDE } from "../server/lib/stempelintegritaet.mjs";

describe("Mindestpause: eine Rechnung für Erwachsene und Jugendliche", () => {
  it("§ 4 ArbZG unverändert: bis 6 h keine, über 6 h 30 min, über 9 h 45 min", () => {
    expect([pausePflicht(6), pausePflicht(6.01), pausePflicht(9), pausePflicht(9.01)]).toEqual([0, 30, 30, 45]);
    expect([pausePflicht(6, false), pausePflicht(9.5, false)]).toEqual([0, 45]);
  });
  it("§ 11 JArbSchG: bis 4,5 h keine, über 4,5 h 30 min, über 6 h 60 min", () => {
    expect([pausePflicht(4.5, true), pausePflicht(4.51, true), pausePflicht(6, true), pausePflicht(6.01, true), pausePflicht(9.5, true)])
      .toEqual([0, 30, 30, 60, 60]);
    expect(pauseGenuegt({ start: "06:00", ende: "13:00", pause: 30 }, true)).toBe(false);
    expect(pauseGenuegt({ start: "06:00", ende: "13:00", pause: 30 })).toBe(true);
    expect(pauseGenuegt({ start: "06:00", ende: "13:30", pause: 60 }, true)).toBe(true);
  });
  it("Hinweis zur Ist-Zeit: Jugendliche mit § 11 JArbSchG, Erwachsene mit § 4 ArbZG — an der Schwelle kein Hinweis", () => {
    const m = { personen: [{ id: "j", geburtstag: "2009-06-01" }, { id: "e", geburtstag: "1985-01-01" }], erfassung: {} };
    const pause = (pid, start, ende, p) => regelHinweise(m, pid, "2026-11-10", { start, ende, pause: p }).filter((x) => x.code === "PAUSE");
    expect(pause("j", "06:00", "12:00", 15)).toEqual([expect.objectContaining({ text: expect.stringMatching(/nötig sind 30 min.*§ 11 JArbSchG/) })]);
    expect(pause("e", "06:00", "12:00", 15)).toEqual([]);
    expect(pause("j", "06:00", "13:30", 30)).toEqual([expect.objectContaining({ text: expect.stringMatching(/nötig sind 60 min.*§ 11 JArbSchG/) })]);
    expect(pause("e", "06:00", "12:00", 0)).toEqual([]);                    // genau 6 h: keine Pause nötig
    expect(pause("e", "06:00", "12:01", 0)).toEqual([expect.objectContaining({ text: expect.stringMatching(/nötig sind 30 min.*§ 4 ArbZG/) })]);
    expect(pause("e", "06:00", "15:30", 30)).toEqual([]);                    // netto genau 9 h: 30 min genügen
    expect(pause("e", "06:00", "15:31", 30)).toEqual([expect.objectContaining({ text: expect.stringMatching(/nötig sind 45 min/) })]);
    expect(pause("e", "06:00", "15:46", 45)).toEqual([]);
  });
  it("Prüfung der Oberfläche (pruefZeitFuer) rechnet mit der erfassten Pause, nicht mit der der Dienstart", () => {
    const da = { id: "F", start: "06:00", ende: "14:00", pause: 30 };
    const p = { id: "a1" };
    const m = { personen: [p], dienstarten: [da], erfassung: { "a1|2026-11-09": { start: "06:00", ende: "15:30", bestaetigt: true, pause: 15 } } };
    expect(pruefZeitFuer(m, p, "2026-11-09", da)).toEqual({ start: "06:00", ende: "15:30", pause: 15 });
    expect(istZeitFuer(m, p, "2026-11-09", da).std).toBe(9.25);
  });
});

describe("Selbstauskunft wie Korrektur: Zeitumstellung und Beginn = Ende (Zusammenführung WP-14b, F8)", () => {
  /* Frühjahrsnacht 2026-03-29: 01:00–04:00 sind wirklich zwei Stunden (02:00–03:00 fehlt). Die Pause wird —
     wie bei Korrektur und Antrag (pauseZuLang mit Tag, WP-14b M2) — an der wirklichen Anwesenheit gemessen. */
  const K = { id: "K", name: "Kurz", start: "01:00", ende: "04:00", pause: 0 };
  const N = { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 };
  const X = { id: "X", name: "24 Stunden", start: "08:00", ende: "08:00", pause: 60 };
  const p = { id: "a1" };
  const m = { personen: [p], dienstarten: [K, N, X], abwesenheiten: [],
    abweichungen: { "a1|2026-03-29": "K", "a1|2026-03-22": "K", "a1|2026-03-30": "N", "a1|2026-03-31": "X" } };
  const t = (d, w) => selbstauskunftPruefen(m, p, d, { bestaetigt: true, grund: "", ...w }, "2026-04-02");
  it("Pause gegen die wirkliche Dauer der Frühjahrsnacht: 150 min bei 2 h abgewiesen, 119 min angenommen; gewöhnlicher Tag 150 min bei 3 h angenommen", () => {
    expect(t("2026-03-29", { start: "01:00", ende: "04:00", pause: 150 }).grund).toMatch(/Pause muss kürzer/);
    expect(t("2026-03-29", { start: "01:00", ende: "04:00", pause: 119 }).eintrag).toMatchObject({ pause: 119 });
    expect(t("2026-03-22", { start: "01:00", ende: "04:00", pause: 150 }).eintrag).toMatchObject({ pause: 150 });
    expect(t("2026-03-29", { start: null, ende: null, pause: 150 }).grund).toMatch(/Pause muss kürzer/);       // „wie geplant“ ebenso
    expect(t("2026-03-22", { start: null, ende: null, pause: 150 }).eintrag).toMatchObject({ pause: 150 });
  });
  it("Beginn = Ende über Mitternacht (Nachtdienst geplant) wäre 24 h: abgewiesen wie bei der Korrektur; nur am geplanten 24-h-Dienst erlaubt", () => {
    expect(t("2026-03-30", { start: "22:00", ende: "22:00" }).grund).toBe(BEGINN_GLEICH_ENDE);
    expect(t("2026-03-30", { start: "06:00", ende: "06:00" }).grund).toBe(BEGINN_GLEICH_ENDE);
    expect(t("2026-03-31", { start: "08:00", ende: "08:00" }).eintrag).toEqual({ start: "08:00", ende: "08:00", bestaetigt: true, grund: "" });
    expect(t("2026-03-30", { start: "22:00", ende: "06:00" }).eintrag).toMatchObject({ start: "22:00", ende: "06:00" });
  });
});

describe("Offline-Puffer trägt die Pause (WP-07)", () => {
  it("Ende mit Pause: im Ereignis und im Rumpf; Beginn ohne", async () => {
    const sp = PUF.speicherFluechtig();
    const e = await PUF.erfassen(sp, { art: "ende", inhaber: "x", pause: 30 });
    expect(e.pause).toBe(30);
    expect(PUF.rumpfFuer(e).pause).toBe(30);
    const s = await PUF.erfassen(sp, { art: "start", inhaber: "x", pause: 30 });
    expect(s.pause).toBeNull();
    expect("pause" in PUF.rumpfFuer(s)).toBe(false);
    const ohne = await PUF.erfassen(sp, { art: "ende", inhaber: "x" });
    expect("pause" in PUF.rumpfFuer(ohne)).toBe(false);
  });
});

/* ------------------------- gegen die Serverfunktion ------------------------- */
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen;
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.17.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const token = async (raum, id, rolle = "mitarbeiter") => (await sitzungAnlegen({ bestand: raum, name: id, rolle, person: id, betrieb: 0,
  mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
async function raum(name, personen, extra = {}) {
  await B.bestandSchreiben(laden(), name, { version: 9, mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
    dienstarten: [F], personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, ...extra }] }, { durch: "Pruefung" });
}
/* Je Stempel eine frische Sitzung (wie offline-stempeln.test.js): Zwischen Beginn und Ende liegen Stunden ohne Anfrage. */
const dienst = async (r, pid, endeIso, pause) => {
  zeitAuf("2026-11-10T05:00:00Z");                                          // 06:00 Berlin
  const s = await anfrage("stempeln", { token: await token(r, pid), rumpf: { art: "start" } });
  expect(s.status, s.roh).toBe(200);
  zeitAuf(endeIso);
  return anfrage("stempeln", { token: await token(r, pid), rumpf: { art: "ende", ...(pause === undefined ? {} : { pause }) } });
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-pause-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  zeitAuf("2026-11-10T05:00:00Z");
}, 60000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

describe("Ausstempeln mit Pause", { timeout: 120000 }, () => {
  it("06:00–14:30 mit 30 min: Pause am Original und an der Ist-Zeit, zählt 8 h; kein Hinweis zur Pause", async () => {
    await raum("p-gut", [person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await dienst("p-gut", "a1", "2026-11-10T13:30:00Z", 30);
    expect(r.status, r.roh).toBe(200);
    expect(r.eintrag.pause).toBe(30);
    expect(r.erfassung).toMatchObject({ start: "06:00", ende: "14:30", bestaetigt: true, pause: 30 });
    expect((r.hinweise || []).filter((x) => x.code === "PAUSE")).toEqual([]);
    const m = await mandant("p-gut");
    expect(m.einstempeln["a1|2026-11-10"].pause).toBe(30);
    expect(istZeitFuer(m, m.personen[0], "2026-11-10", F).std).toBe(8);
  });
  it("06:00–15:30 mit 15 min: Hinweis § 4 ArbZG (45 min nötig), Kennzeichen PAUSE_ZU_KURZ — aber gespeichert und bestätigt (keine Sperre)", async () => {
    await raum("p-kurz", [person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await dienst("p-kurz", "a1", "2026-11-10T14:30:00Z", 15);
    expect(r.status, r.roh).toBe(200);
    expect(r.hinweise).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PAUSE", text: expect.stringMatching(/nötig sind 45 min/) })]));
    expect(r.markierungen).toContain("PAUSE_ZU_KURZ");
    expect(r.erfassung).toMatchObject({ bestaetigt: true, pause: 15 });
    expect((await mandant("p-kurz")).erfassung["a1|2026-11-10"]).toMatchObject({ bestaetigt: true, pause: 15 });
  });
  it("Jugendlicher, 06:00–12:00 mit 15 min: Hinweis § 11 JArbSchG (30 min nötig) — für Erwachsene wäre das ausreichend", async () => {
    await raum("p-jung", [person("j1", "mitarbeiter", { geburtstag: "2009-06-01" }), person("e1")],
      { abweichungen: { "j1|2026-11-10": "F", "e1|2026-11-10": "F" } });
    const j = await dienst("p-jung", "j1", "2026-11-10T11:00:00Z", 15);
    expect(j.status, j.roh).toBe(200);
    expect(j.hinweise).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PAUSE", text: expect.stringMatching(/§ 11 JArbSchG/) })]));
    expect(j.markierungen).toContain("PAUSE_ZU_KURZ");
    const e = await dienst("p-jung", "e1", "2026-11-10T11:00:00Z", 15);
    expect((e.hinweise || []).filter((x) => x.code === "PAUSE")).toEqual([]);
    expect(e.markierungen || []).not.toContain("PAUSE_ZU_KURZ");
  });
  it("ohne Angabe: wie bisher (Pause der Dienstart in der Ist-Rechnung), kein Kennzeichen; der Hinweis rechnet mit der Pause der Dienstart", async () => {
    await raum("p-ohne", [person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    const r = await dienst("p-ohne", "a1", "2026-11-10T14:45:00Z");          // 06:00–15:45, mit 30 min netto 9,25 h
    expect(r.status, r.roh).toBe(200);
    expect("pause" in r.eintrag).toBe(false);
    expect("pause" in r.erfassung).toBe(false);
    expect(r.markierungen || []).not.toContain("PAUSE_ZU_KURZ");
    expect(r.hinweise).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PAUSE", text: expect.stringMatching(/Pause 30 min eingetragen, nötig sind 45/) })]));
  });
  it("ungültige Pause (Text, negativ, über 180, länger als die Anwesenheit): der Stempel wird gespeichert, ohne Pause, Kennzeichen PAUSE_UNGUELTIG", async () => {
    for (const [i, p] of ["viel", -5, 400, 600].entries()) {
      const r0 = `p-falsch-${i}`;
      await raum(r0, [person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
      const r = await dienst(r0, "a1", i === 3 ? "2026-11-10T08:00:00Z" : "2026-11-10T13:00:00Z", i === 3 ? 180 : p);   // i = 3: 180 min bei 3 h Anwesenheit
      expect(r.status, `${p} ${r.roh}`).toBe(200);
      expect(r.markierungen, String(p)).toContain("PAUSE_UNGUELTIG");
      expect("pause" in r.eintrag).toBe(false);
      expect(r.erfassung && "pause" in r.erfassung).toBe(false);
      expect((await mandant(r0)).einstempeln["a1|2026-11-10"].ende).toBeTruthy();
    }
  });
  it("die Pause am Original lässt sich über das Speichern nicht ändern (WP-06) — 403 STEMPEL_UNVERAENDERLICH", async () => {
    await raum("p-put", [person("a1"), person("l1", "leitung")], { abweichungen: { "a1|2026-11-10": "F" } });
    await dienst("p-put", "a1", "2026-11-10T13:30:00Z", 30);
    const t = await token("p-put", "l1", "leitung");
    const g = await anfrage("bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].einstempeln["a1|2026-11-10"].pause = 0;
    const r = await anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect([r.status, r.code]).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
    expect((await mandant("p-put")).einstempeln["a1|2026-11-10"].pause).toBe(30);
  });
  it("offline erfasstes Ende aus dem Puffer mit Pause: die Pause kommt an", async () => {
    await raum("p-offline", [person("a1")], { abweichungen: { "a1|2026-11-10": "F" } });
    zeitAuf("2026-11-10T05:00:00Z");
    expect((await anfrage("stempeln", { token: await token("p-offline", "a1"), rumpf: { art: "start" } })).status).toBe(200);
    zeitAuf("2026-11-10T13:30:00Z");
    const t = await token("p-offline", "a1");
    const sp = PUF.speicherFluechtig();
    const ev = await PUF.erfassen(sp, { art: "ende", inhaber: "a1", pause: 30, offline: true, jetzt: new Date("2026-11-10T13:30:00Z") });
    zeitAuf("2026-11-10T13:31:00Z");
    const { inhaber: _i, ...rumpf } = PUF.rumpfFuer(ev, new Date("2026-11-10T13:31:00Z"));
    void _i;
    const r = await anfrage("stempeln", { token: t, rumpf });
    expect(r.status, r.roh).toBe(200);
    expect((await mandant("p-offline")).erfassung["a1|2026-11-10"]).toMatchObject({ ende: "14:30", pause: 30 });
  });
});

describe("Selbstauskunft mit Pause", { timeout: 120000 }, () => {
  it("abweichende Zeit mit Pause: gespeichert, Hinweis bei zu kurzer Pause; ungültige Pause 422", async () => {
    zeitAuf("2026-11-10T09:00:00Z");
    await raum("p-selbst", [person("a1"), person("l1", "leitung")], { abweichungen: { "a1|2026-11-08": "F", "a1|2026-11-09": "F" } });
    const t = await token("p-selbst", "a1");
    const r = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-09", start: "06:00", ende: "16:00", pause: 30, grund: "länger geblieben" } });
    expect(r.status, r.roh).toBe(200);
    /* WP-15: die Selbstauskunft ist ein Antrag; erst die Freigabe macht sie zum Ist (mit den Hinweisen). */
    expect(r.antrag).toMatchObject({ status: "offen", vorschlag: { start: "06:00", ende: "16:00", pause: 30 } });
    expect(r.eintrag).toMatchObject({ bestaetigt: false });
    const frei = await anfrage("selbstauskunft-entscheiden", { token: await token("p-selbst", "l1", "leitung"),
      rumpf: { personId: "a1", datum: "2026-11-09", antragId: r.antrag.id, entscheidung: "genehmigt" } });
    expect(frei.status, frei.roh).toBe(200);
    expect(frei.eintrag).toMatchObject({ start: "06:00", ende: "16:00", pause: 30, bestaetigt: true });
    expect(frei.hinweise).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PAUSE" })]));
    const f = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-08", start: "06:00", ende: "14:00", pause: 999 } });
    expect(f.status, f.roh).toBe(422);
    expect((await mandant("p-selbst")).erfassung["a1|2026-11-08"]).toBeUndefined();
  });
  it("Pause gleich oder länger als die Anwesenheit (innerhalb 0–180 min): 422, nichts gespeichert; eine Minute kürzer: 200 (Review WP-16, M4)", async () => {
    zeitAuf("2026-11-10T09:00:00Z");
    await raum("p-selbst-grenze", [person("a1")], { abweichungen: { "a1|2026-11-07": "F", "a1|2026-11-08": "F", "a1|2026-11-09": "F" } });
    const t = await token("p-selbst-grenze", "a1");
    const gleich = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-08", start: "06:00", ende: "08:00", pause: 120, grund: "früher gegangen" } });
    expect(gleich.status, gleich.roh).toBe(422);
    expect(gleich.fehler).toMatch(/Pause muss kürzer sein als die Anwesenheit/);
    const laenger = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-09", start: "06:00", ende: "08:00", pause: 150, grund: "früher gegangen" } });
    expect(laenger.status, laenger.roh).toBe(422);
    const m = await mandant("p-selbst-grenze");
    expect(m.erfassung["a1|2026-11-08"]).toBeUndefined();
    expect(m.erfassung["a1|2026-11-09"]).toBeUndefined();
    const knapp = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-07", start: "06:00", ende: "08:00", pause: 119, grund: "früher gegangen" } });
    expect(knapp.status, knapp.roh).toBe(200);
    expect(knapp.antrag).toMatchObject({ status: "offen", vorschlag: { start: "06:00", ende: "08:00", pause: 119 } });   // WP-15: Antrag, Ist erst nach der Freigabe
  });
});
