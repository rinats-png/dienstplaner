/* ==========================================================================
   KALENDER-FEED LIVE UND GEBUNDEN (WP-24)

   - Der Feed rechnet bei jedem Abruf aus dem AKTUELLEN Bestand (nicht aus
     dem, was ein Gerät beim Einrichten schickte).
   - Nur die eigenen Dienste; keine Gesundheits- oder Schutzangaben, keine
     Kollegen. Abwesenheit nur mit neutralem Wort.
   - DTSTAMP ist der Stand des Bestands — derselbe Bestand, dieselbe Datei.
   - Sperre und Entzug widerrufen den Feed (Konto, Mitgliedschaft,
     Zugangscode); ein Lesefehler widerruft nichts; Altfeeds bleiben gültig.
   - raumLoeschen räumt auch die Indizes feedperson:*.
   - Entwürfe (WP-23): Beschäftigte sehen im Feed keine Einteilung eines nicht
     freigegebenen künftigen Monats, sondern einen Hinweis.

   Geprüft wird der echte Handler (server/funktionen/kalender.mjs).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { aufbauen, hash, WIRT } from "./hilfen/szenario.mjs";
import { baueICS } from "../server/funktionen/kalender.mjs";
import { feedTermine, ABWESENHEIT_OEFFENTLICH, HINWEIS_ENTWURF } from "../server/lib/kalenderfeed.mjs";
import { feedHerkunftAus } from "../server/lib/feedherkunft.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

let Z, RL, kontoSchreiben, ablageSchluessel, daten;
const LIMIT = 60000;
const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const kurz = (d) => d.replace(/-/g, "");

beforeAll(async () => {
  Z = await aufbauen("kalender-live");
  RL = await import("../server/lib/raumloeschung.mjs");
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  daten = Z.daten;
}, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });

const person = (id, vorname, nachname, rolle = "mitarbeiter", extra = {}) => ({ id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE", ...extra });
const betrieb = (personen, extra = {}) => ({ version: 5, mandanten: [{ id: "m1", name: "Haus Ä", einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Frühdienst", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nachtdienst", start: "21:30", ende: "06:30" }],
  zyklus: { tage: ["F"] }, anker: "2026-01-05", personen, abweichungen: {}, abwesenheiten: [], standorte: [], einstellungen: {}, ...extra }] });
const schreiben = async (raum, b) => {
  const e = await Z.B.bestandSchreiben(Z.laden(), raum, b, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
};
const aendern = async (raum, fn) => {
  const g = (await Z.B.bestandLesen(Z.laden(), raum)).bestand;
  const neu = JSON.parse(JSON.stringify(g));
  fn(neu.mandanten[0]);
  await schreiben(raum, neu);
};
const einrichten = async (token) => {
  const e = await Z.bearer(Z.kalender, "/kalender/einrichten", token, { methode: "POST", rumpf: {} });
  expect(e.status, JSON.stringify(e.daten)).toBe(200);
  return e.daten.geheim;
};
let nr = 0;
const feed = async (geheim) => {
  const antwort = await Z.kalender(new Request(`http://${WIRT}/kalender/feed/${geheim}.ics`,
    { headers: { host: WIRT, "x-forwarded-for": `198.51.100.${(++nr % 250) + 1}` } }), {});
  return { status: antwort.status, text: await antwort.text() };
};
const aktiv = async (was, rolle, personen, extra) => {
  const ich = await Z.arbeitsbereich(was, { rolle });
  await schreiben(ich.raum, betrieb(personen || [person("p_1", "Rina", "Schmitt", rolle), person("p_2", "Jan", "Weber")], extra));
  return ich;
};
const entwurf = (text) => (text.match(new RegExp(`SUMMARY:${HINWEIS_ENTWURF}`, "g")) || []).length;

describe("live aus dem aktuellen Bestand", () => {
  it("ein geänderter Plan erreicht den Feed mit dem nächsten Abruf", async () => {
    const ich = await aktiv("live", "leitung");
    const g = await einrichten(ich.token);
    let f = await feed(g);
    expect(f.status).toBe(200);
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(2))}T060000`);
    expect(f.text).toContain("SUMMARY:Frühdienst");

    await aendern(ich.raum, (m) => { m.abweichungen[`p_1|${tag(2)}`] = "N"; });
    f = await feed(g);
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(2))}T213000`);
    expect(f.text).toContain(`DTEND;TZID=Europe/Berlin:${kurz(tag(3))}T063000`);
    expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(2))}T060000`);

    await aendern(ich.raum, (m) => { m.abweichungen[`p_1|${tag(2)}`] = "-"; });
    f = await feed(g);
    expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(2))}T`);
  }, LIMIT);

  it("was ein Gerät an /kalender/daten schickt, erscheint nie im Feed", async () => {
    const ich = await aktiv("gerät", "leitung");
    const g = await einrichten(ich.token);
    const s = await Z.bearer(Z.kalender, "/kalender/daten", ich.token, { methode: "POST", rumpf: { geheim: g, name: "x", betrieb: "y",
      termine: [{ id: "bose-1", datum: tag(1), von: "01:00", endDatum: tag(1), bisZeit: "02:00", ganztags: false, titel: "EINGESCHMUGGELT", text: "Diagnose X", ort: "" }] } });
    expect(s.status).toBe(200);
    expect(s.daten.live).toBe(true);
    expect(await Z.laden().get(`feeddaten:${hash(g)}`, { type: "json" })).toBeNull();
    const f = await feed(g);
    expect(f.text).not.toContain("EINGESCHMUGGELT");
    expect(f.text).not.toContain("Diagnose");
  }, LIMIT);

  it("ein Betrieb ohne Dienstarten/Schichtfolge liefert einen gültigen, leeren Kalender", async () => {
    const ich = await Z.arbeitsbereich("leer", { rolle: "leitung" });
    const g = await einrichten(ich.token);
    const f = await feed(g);
    expect(f.status).toBe(200);
    expect(f.text).toContain("BEGIN:VCALENDAR");
    expect(f.text).not.toContain("BEGIN:VEVENT");
  }, LIMIT);
});

describe("DTSTAMP deterministisch", () => {
  it("baueICS: derselbe Stempel, dieselbe Datei — die Uhr des Aufrufs zählt nicht", () => {
    const t = [{ id: "d-1", datum: "2026-11-02", von: "06:00", endDatum: "2026-11-02", bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }];
    const stand = new Date("2026-03-01T10:20:30Z");
    const a = baueICS("Haus", t, stand);
    expect(a).toContain("DTSTAMP:20260301T102030Z");
    expect(baueICS("Haus", t, stand)).toBe(a);
    expect(baueICS("Haus", t, new Date("2026-03-02T00:00:00Z"))).not.toBe(a);
  });
  it("zwei Abrufe mit Abstand: byte-gleich; DTSTAMP ist der Stand des Bestands", async () => {
    const ich = await aktiv("stempel", "leitung");
    const g = await einrichten(ich.token);
    const a = await feed(g);
    await new Promise((r) => setTimeout(r, 1100));
    const b = await feed(g);
    expect(b.text).toBe(a.text);
    const zeit = (await Z.B.bestandLesen(Z.laden(), ich.raum)).zeit;
    const erwartet = new Date(zeit).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    expect(a.text).toContain(`DTSTAMP:${erwartet}`);
    expect(a.text.match(/DTSTAMP:/g).length).toBeGreaterThan(0);
  }, LIMIT);
});

describe("nur die eigenen Dienste, keine Gesundheits- oder Schutzangaben", () => {
  it("kein Kollege, kein Grund, kein Schutzmerkmal; Abwesenheit neutral", async () => {
    const ich = await aktiv("eigen", "leitung", [
      person("p_1", "Rina", "Schmitt", "leitung", { mutterschutz: true, geburtstag: "2008-05-05", notiz: "GEHEIMNOTIZ", einschraenkungen: { keineNacht: true } }),
      person("p_2", "Jan", "Weber"),
    ], {
      abweichungen: { [`p_2|${tag(1)}`]: "N" },
      abwesenheiten: [
        { id: "a1", personId: "p_1", von: tag(3), bis: tag(3), art: "krank", grund: "CHEMOTHERAPIE" },
        { id: "a2", personId: "p_1", von: tag(5), bis: tag(6), art: "urlaub" },
        { id: "a3", personId: "p_1", von: tag(8), bis: tag(8), art: "mutterschutz" },
        { id: "a4", personId: "p_2", von: tag(10), bis: tag(10), art: "urlaub" },
      ],
    });
    const g = await einrichten(ich.token);
    const f = await feed(g);
    expect(f.status).toBe(200);
    expect(f.text).toContain(`DTSTART;VALUE=DATE:${kurz(tag(5))}`);
    expect(f.text).toContain("SUMMARY:Urlaub");
    expect(f.text.match(/SUMMARY:abwesend/g)).toHaveLength(2);               // krank + mutterschutz
    for (const verboten of ["Krank", "krank", "CHEMO", "Mutterschutz", "mutterschutz", "GEHEIMNOTIZ", "Weber", "Jan", "p_2", "2008", "keineNacht", "Beschäftigungsverbot"])
      expect(f.text, verboten).not.toContain(verboten);
    const uids = f.text.match(/^UID:.*$/gm);
    expect(uids.length).toBeGreaterThan(100);
    for (const u of uids) expect(u, u).toMatch(/^UID:(d|abw)-p_1-/);
    expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(3))}T`);   // krank: kein Dienst an dem Tag
  }, LIMIT);

  it("nur Urlaub, Schulung, Freizeitausgleich und Freistellung nennen ihre Art", () => {
    expect(Object.keys(ABWESENHEIT_OEFFENTLICH).sort()).toEqual(["ausgleich", "frei", "schulung", "urlaub"]);
    const m = betrieb([person("p_1", "A", "B")]).mandanten[0];
    for (const [art, erwartet] of [["krank", "abwesend"], ["sonst", "abwesend"], ["elternzeit", "abwesend"], ["kur", "abwesend"], [undefined, "abwesend"],
      ["urlaub", "Urlaub"], ["schulung", "Schulung"], ["ausgleich", "Freizeitausgleich"], ["frei", "Freistellung"]]) {
      m.abwesenheiten = [{ id: "x", personId: "p_1", von: tag(1), bis: tag(1), art }];
      const t = feedTermine(m, "p_1", HEUTE, 3).find((x) => x.ganztags);
      expect(t.titel, String(art)).toBe(erwartet);
    }
  });

  it("anonymisierte oder unbekannte Person: nichts", () => {
    const m = betrieb([person("p_1", "A", "B", "mitarbeiter", { anonym: true })]).mandanten[0];
    expect(feedTermine(m, "p_1", HEUTE)).toEqual([]);
    expect(feedTermine(m, "gibtEsNicht", HEUTE)).toEqual([]);
  });
});

describe("Sperre und Entzug widerrufen den Feed", () => {
  it("der Feed trägt die Herkunft der einrichtenden Sitzung (Konto)", async () => {
    const ich = await aktiv("herkunft", "leitung");
    const g = await einrichten(ich.token);
    const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
    expect(e.herkunft).toMatchObject({ art: "account", accountId: ich.k.id });
    expect(Number.isInteger(e.herkunft.generation)).toBe(true);
    expect(feedHerkunftAus({ herkunft: { art: "account", accountId: "a", generation: 2 } })).toEqual({ art: "account", accountId: "a", generation: 2 });
    expect(feedHerkunftAus({ konto: "abc" })).toEqual({ art: "code", konto: "abc" });
    expect(feedHerkunftAus({ herkunft: { art: "irgendwas" }, konto: "abc" })).toBeNull();
    expect(feedHerkunftAus({})).toBeNull();
  }, LIMIT);

  it("Mitgliedschaft entzogen: 404, endgültig widerrufen — auch nach neuer Mitgliedschaft", async () => {
    const ich = await aktiv("entzug", "leitung");
    const g = await einrichten(ich.token);
    expect((await feed(g)).status).toBe(200);
    const r = await Z.A.mitgliedschaftEntziehen(Z.laden(), ich.k.id, ich.raum);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const f = await feed(g);
    expect(f.status).toBe(404);
    expect(f.text).not.toContain("BEGIN:VCALENDAR");
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_1`, { type: "json" })).toBeNull();
    const a = await Z.A.mitgliedschaftAktivieren(Z.laden(), ich.k.id, ich.raum);
    expect(a.ok, JSON.stringify(a)).toBe(true);
    expect((await feed(g)).status).toBe(404);                                  // der alte Verweis bleibt tot
  }, LIMIT);

  it("Konto gesperrt: 404 und widerrufen", async () => {
    const ich = await aktiv("kontosperre", "leitung");
    const g = await einrichten(ich.token);
    expect((await feed(g)).status).toBe(200);
    const r = await Z.A.accountAendern(Z.laden(), ich.k.id, { status: "gesperrt" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
  }, LIMIT);

  it("Zugangscode gesperrt: 404 und widerrufen; ungesperrt bleibt gültig", async () => {
    const raum = Z.raum("code");
    await schreiben(raum, betrieb([person("p_1", "Rina", "Schmitt")]));
    const code = "KALENDER-CODE-0001";
    await kontoSchreiben(Z.laden(), ablageSchluessel(code), { name: "p_1", bestand: raum, rolle: "mitarbeiter", person: "p_1", betrieb: 0, mandantId: "m1",
      angelegt: "2026-01-01T00:00:00.000Z" });
    const a = await Z.bearer(daten, "/api/anmelden", null, { methode: "POST", rumpf: { zugangscode: code } });
    expect(a.status, JSON.stringify(a.daten)).toBe(200);
    const g = await einrichten(a.daten.token);
    const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
    expect(e.herkunft.art).toBe("code");
    expect((await feed(g)).status).toBe(200);
    const k = await Z.K.kontoLesen(Z.laden(), e.herkunft.konto);
    expect(k).toBeTruthy();
    await Z.K.kontoSchreiben(Z.laden(), e.herkunft.konto, { ...k, gesperrt: true });
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
  }, LIMIT);

  it("Lesefehler bei der Herkunft: 5xx, nichts widerrufen; nach der Reparatur wieder 200", async () => {
    const ich = await aktiv("lesefehler", "leitung");
    const g = await einrichten(ich.token);
    const datei = path.join(Z.wurzel, "centric", `${encodeURIComponent(`mitglied:${ich.k.id}:${ich.raum}`)}.json`);
    const vorher = await readFile(datei, "utf8");
    try {
      await writeFile(datei, "{ kaputt");
      const f = await feed(g);
      expect(f.status).toBeGreaterThanOrEqual(500);
      expect(f.text).not.toContain("BEGIN:VCALENDAR");
      expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeTruthy();
    } finally { await writeFile(datei, vorher); }
    expect((await feed(g)).status).toBe(200);
  }, LIMIT);

  it("ein Feed ohne Herkunft (vor WP-24 eingerichtet) wird nur über die Person geprüft", async () => {
    const ich = await aktiv("alt", "leitung");
    const g = await einrichten(ich.token);
    const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
    const { herkunft, ...ohne } = e;
    expect(herkunft).toBeTruthy();
    await Z.laden().setJSON(`feed:${hash(g)}`, ohne);
    await Z.A.mitgliedschaftEntziehen(Z.laden(), ich.k.id, ich.raum);
    expect((await feed(g)).status).toBe(200);                                  // dokumentierte Grenze: Person gilt noch
    await aendern(ich.raum, (m) => { m.personen.find((p) => p.id === "p_1").status = "gesperrt"; });
    expect((await feed(g)).status).toBe(404);
  }, LIMIT);
});

describe("raumLoeschen räumt die Indizes", () => {
  it("feed:, feeddaten: und feedperson:* sind danach weg", async () => {
    const ich = await aktiv("loeschen", "leitung");
    const g = await einrichten(ich.token);
    await Z.laden().setJSON(`feeddaten:${hash(g)}`, { name: "Alt", betrieb: "x", termine: [] });
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_1`, { type: "json" })).toBeTruthy();
    const r = await RL.raumLoeschen(Z.laden(), Z.ablageArbeit(), ich.raum);
    expect(r.vollstaendig, JSON.stringify(r.fehler)).toBe(true);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
    expect(await Z.laden().get(`feeddaten:${hash(g)}`, { type: "json" })).toBeNull();
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_1`, { type: "json" })).toBeNull();
    expect((await Z.laden().list({ prefix: `feedperson:${ich.raum}:` })).blobs).toHaveLength(0);
  }, LIMIT);

  it("ein Index eines anderen Raums bleibt", async () => {
    const a = await aktiv("loeschen-a", "leitung");
    const b = await aktiv("loeschen-b", "leitung");
    await einrichten(a.token); await einrichten(b.token);
    await RL.raumLoeschen(Z.laden(), Z.ablageArbeit(), a.raum);
    expect(await Z.laden().get(`feedperson:${b.raum}:m1:p_1`, { type: "json" })).toBeTruthy();
  }, LIMIT);
});

describe("Entwürfe (WP-23): Beschäftigte sehen im Feed nur Freigegebenes", () => {
  const letzterTagMonat = () => HEUTE.slice(0, 7);
  const ferner = tag(35);                                                     // sicher in einem anderen Monat
  it("Betrieb ohne Freigabe und ohne Pflicht: alles sichtbar, kein Hinweis", async () => {
    const ich = await aktiv("entw-keine", "mitarbeiter");
    const f = await feed(await einrichten(ich.token));
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T060000`);
    expect(entwurf(f.text)).toBe(0);
  }, LIMIT);

  it("mit einer Freigabe: künftige nicht freigegebene Monate leer, Hinweis statt leer; heute bleibt", async () => {
    const ich = await aktiv("entw-frei", "mitarbeiter", undefined, { freigaben: { [letzterTagMonat()]: { von: "p_9" } } });
    const f = await feed(await einrichten(ich.token));
    expect(f.status).toBe(200);
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(HEUTE)}T060000`);          // heute: in Kraft
    expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T`);
    expect(entwurf(f.text)).toBeGreaterThanOrEqual(1);
    expect(entwurf(f.text)).toBeLessThanOrEqual(8);
    const monateDavor = new Set(feedTermine(betrieb([person("p_1", "A", "B")], { freigaben: { [letzterTagMonat()]: true } }).mandanten[0], "p_1", HEUTE)
      .filter((t) => t.titel === HINWEIS_ENTWURF).map((t) => t.datum.slice(0, 7)));
    expect(monateDavor.has(letzterTagMonat())).toBe(false);                    // der freigegebene Monat hat keinen Hinweis
  }, LIMIT);

  it("ein später freigegebener Monat erscheint mit dem nächsten Abruf", async () => {
    const ich = await aktiv("entw-spaeter", "mitarbeiter", undefined, { freigaben: { [letzterTagMonat()]: true } });
    const g = await einrichten(ich.token);
    expect((await feed(g)).text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T`);
    await aendern(ich.raum, (m) => { m.freigaben[ferner.slice(0, 7)] = true; });
    expect((await feed(g)).text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T060000`);
  }, LIMIT);

  it("Pflicht zur Freigabe ohne eine Freigabe: nur heute und der Hinweis", async () => {
    const ich = await aktiv("entw-pflicht", "mitarbeiter", undefined, { einstellungen: { planFreigabePflicht: true } });
    const f = await feed(await einrichten(ich.token));
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(HEUTE)}T060000`);
    expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(40))}T`);
    expect(entwurf(f.text)).toBeGreaterThanOrEqual(1);
  }, LIMIT);

  it("Planung und Leitung sehen den Entwurf auch im eigenen Feed", async () => {
    const ich = await aktiv("entw-leitung", "leitung", undefined, { freigaben: { [letzterTagMonat()]: true }, einstellungen: { planFreigabePflicht: true } });
    const f = await feed(await einrichten(ich.token));
    expect(f.text).toContain(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T060000`);
    expect(entwurf(f.text)).toBe(0);
  }, LIMIT);

  it("eine Abwesenheit in einem nicht freigegebenen Monat bleibt (sie ist kein Entwurf des Plans)", async () => {
    const ich = await aktiv("entw-abw", "mitarbeiter", undefined, { freigaben: { [letzterTagMonat()]: true },
      abwesenheiten: [{ id: "u1", personId: "p_1", von: ferner, bis: ferner, art: "urlaub" }] });
    const f = await feed(await einrichten(ich.token));
    expect(f.text).toContain(`DTSTART;VALUE=DATE:${kurz(ferner)}`);
    expect(f.text).toContain("SUMMARY:Urlaub");
  }, LIMIT);
});
