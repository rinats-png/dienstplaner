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
import { fileURLToPath } from "node:url";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { planFreigabeAktiv, istEntwurfstag } from "../server/lib/planfreigabe.mjs";

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
    const ich = await aktiv("geraet", "leitung");
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

  it("Mitgliedschaft entzogen: 404, endgültig widerrufen, der Verweis bleibt tot", async () => {
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
    expect((await feed(g)).status).toBe(404);                                  // der alte Verweis bleibt tot (ein Entzug ist endgültig, es gibt keinen Rückweg zu „aktiv“)
  }, LIMIT);

  it("Status der Mitgliedschaft allein genügt: nicht „aktiv“ bei unveränderter Generation → 404", async () => {
    const ich = await aktiv("mstatus", "leitung");
    const g = await einrichten(ich.token);
    expect((await feed(g)).status).toBe(200);
    const schluessel = Z.A.mitgliedSchluessel(ich.k.id, ich.raum);
    const m = await Z.laden().get(schluessel, { type: "json" });
    await Z.laden().setJSON(schluessel, { ...m, status: "entzogen" });          // ohne den Lauf weiterzuzählen
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
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

/* --------------------------------------------------------------------------
   Auflage A1 (Review WP-24): EINE Entwurfsregel. Der Feed entscheidet mit
   planfreigabe.mjs wie die Sicht (sicht.mjs, bestandFuerRolle) — Tag für Tag,
   je Betriebsform und Rolle gleich. Rolle im Feed: p.rolle, ohne Angabe
   „mitarbeiter" (gleich oder strenger).
   -------------------------------------------------------------------------- */
describe("Entwurfsregel des Feeds = Sicht (planfreigabe.mjs)", () => {
  const monat = (k) => {
    const [j, mo] = HEUTE.slice(0, 7).split("-").map(Number);
    const n = j * 12 + (mo - 1) + k;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  };
  const FORMEN = [
    ["ohne Freigabe, ohne Pflicht", {}],
    ["Pflicht ohne Freigabe", { einstellungen: { planFreigabePflicht: true } }],
    ["Pflicht als Text (zählt nicht)", { einstellungen: { planFreigabePflicht: "true" } }],
    ["laufender Monat frei", { freigaben: { [monat(0)]: true } }],
    ["nächster Monat frei", { freigaben: { [monat(1)]: true } }],
    ["laufender und nächster frei", { freigaben: { [monat(0)]: true, [monat(1)]: { von: "p_9" } } }],
    ["ferner Monat frei (Lücke davor)", { freigaben: { [monat(3)]: true } }],
    ["Freigabe auf false", { freigaben: { [monat(1)]: false } }],
    ["nur ungültige Schlüssel", { freigaben: { "2026-1": true, x: true } }],
    ["Pflicht und nächster frei", { einstellungen: { planFreigabePflicht: true }, freigaben: { [monat(1)]: true } }],
    ["Freigaben kein Objekt", { freigaben: ["2026-01"], einstellungen: { planFreigabePflicht: false } }],
  ];
  const TAGE = 204;                                                           // 205 Tage: heute bis heute + 204
  const ROLLEN = ["mitarbeiter", "betriebsrat", "subplaner", "planer", "leitung", undefined];

  it("Quelle: kalenderfeed.mjs nimmt planFreigabeAktiv/istEntwurfstag aus planfreigabe.mjs und führt keine eigene Fassung", async () => {
    const quelle = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "lib", "kalenderfeed.mjs"), "utf8");
    expect(quelle).toMatch(/import \{[^}]*\bplanFreigabeAktiv\b[^}]*\bistEntwurfstag\b[^}]*\} from "\.\/planfreigabe\.mjs"/);
    expect(quelle.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/freigaben|planFreigabePflicht|MONAT_FORM/);
  });

  for (const [name, extra] of FORMEN) {
    it(`${name}: je Rolle und Tag dieselbe Entscheidung wie bestandFuerRolle`, () => {
      for (const rolle of ROLLEN) {
        const p1 = person("p_1", "Rina", "Schmitt", rolle);
        if (rolle === undefined) delete p1.rolle;
        const b = betrieb([p1, person("p_2", "Jan", "Weber")], JSON.parse(JSON.stringify(extra)));
        const m = b.mandanten[0];
        for (let n = 0; n <= TAGE; n++) m.abweichungen[`p_1|${tag(n)}`] = "F";
        const sitzRolle = rolle === undefined ? "mitarbeiter" : rolle;
        const sicht = bestandFuerRolle(JSON.parse(JSON.stringify(b)), { rolle: sitzRolle, person: "p_1", betrieb: 0 });
        const sichtbar = new Set(Object.keys(sicht.mandanten[0].abweichungen || {})
          .filter((k) => k.startsWith("p_1|")).map((k) => k.slice(4)));
        const termine = feedTermine(m, "p_1", HEUTE, TAGE);
        const imFeed = new Set(termine.filter((t) => !t.ganztags).map((t) => t.datum));
        const verborgen = [];
        for (let n = 0; n <= TAGE; n++) if (!sichtbar.has(tag(n))) verborgen.push(tag(n));
        expect([...imFeed].sort(), `${name} / ${rolle}`).toEqual([...sichtbar].sort());
        /* Je Monat mit verborgenen Tagen genau ein Hinweis, sonst keiner. */
        const hinweise = termine.filter((t) => t.titel === HINWEIS_ENTWURF).map((t) => t.datum.slice(0, 7)).sort();
        expect(hinweise, `${name} / ${rolle}`).toEqual([...new Set(verborgen.map((d) => d.slice(0, 7)))].sort());
        /* Gegenprobe: die Entscheidung je Tag aus planfreigabe.mjs. */
        for (let n = 0; n <= TAGE; n++) {
          const d = tag(n);
          const versteckt = sitzRolle === "mitarbeiter" && planFreigabeAktiv(m) && istEntwurfstag(m, d, HEUTE);
          expect(imFeed.has(d), `${name} / ${rolle} / ${d}`).toBe(!versteckt);
        }
      }
    });
  }
});

/* --------------------------------------------------------------------------
   Auflage A2 (Review WP-24): ROLLEN-SONDE des Feeds über MA, BR, SV, PL, LT.
   Durch den echten Handler: nur die eigenen Dienste, keine fremden Marker,
   und die Entwürfe je Rolle genau wie die Sicht (sicht.mjs): verborgen nur
   für Beschäftigte. RECHTEMATRIX.md (Zeile /kalender/feed) verweist hierauf.
   -------------------------------------------------------------------------- */
describe("Rollen-Sonde Kalender-Feed (MA, BR, SV, PL, LT)", () => {
  const SPALTEN = { MA: "mitarbeiter", BR: "betriebsrat", SV: "subplaner", PL: "planer", LT: "leitung" };
  const ENTWURF_SICHTBAR = { MA: false, BR: true, SV: true, PL: true, LT: true };
  const FREMD = ["FREMD-VORNAME", "FREMD-NACHNAME", "p_2", "FREMD-NOTIZ", "FREMD-GRUND", "FREMD-DIENST", "Spätdienst",
    "EIGEN-GRUND", "EIGEN-NOTIZ", "Krank", "krank", "1999"];
  for (const [spalte, rolle] of Object.entries(SPALTEN)) {
    it(`${spalte}: nur eigene Dienste, keine fremden Marker, Entwurf ${ENTWURF_SICHTBAR[spalte] ? "sichtbar" : "verborgen"} wie in der Sicht`, async () => {
      const ferner = tag(70);
      const personen = [
        person("p_1", "Rina", "Schmitt", rolle, { geburtstag: "1999-01-01", notiz: "EIGEN-NOTIZ" }),
        person("p_2", "FREMD-VORNAME", "FREMD-NACHNAME", "mitarbeiter", { notiz: "FREMD-NOTIZ" }),
      ];
      const extra = {
        dienstarten: [{ id: "F", name: "Frühdienst", start: "06:00", ende: "14:00", pause: 30 },
          { id: "S", name: "Spätdienst", start: "14:00", ende: "22:00" }, { id: "X", name: "FREMD-DIENST", start: "08:00", ende: "09:00" }],
        einstellungen: { planFreigabePflicht: true }, freigaben: { [HEUTE.slice(0, 7)]: true },
        abweichungen: { [`p_2|${tag(1)}`]: "X", [`p_2|${tag(2)}`]: "S", [`p_2|${ferner}`]: "X", [`p_1|${ferner}`]: "F" },
        abwesenheiten: [{ id: "a1", personId: "p_2", von: tag(4), bis: tag(4), art: "krank", grund: "FREMD-GRUND" },
          { id: "a2", personId: "p_1", von: tag(6), bis: tag(6), art: "krank", grund: "EIGEN-GRUND" }],
      };
      const ich = await aktiv(`sonde-${spalte.toLowerCase()}`, rolle, personen, extra);
      const f = await feed(await einrichten(ich.token));
      expect(f.status).toBe(200);
      for (const u of f.text.match(/^UID:.*$/gm) || []) expect(u, u).toMatch(/^UID:(d|abw|entwurf)-p_1-/);
      for (const marker of FREMD) expect(f.text, marker).not.toContain(marker);
      expect(f.text).not.toContain(`DTSTART;TZID=Europe/Berlin:${kurz(tag(1))}T080000`);    // fremde Einteilung
      expect(f.text).toContain(`DTSTART;VALUE=DATE:${kurz(tag(6))}`);                          // eigene Abwesenheit, neutral
      /* Entwürfe: die Erwartung je Rolle UND die Sicht derselben Rolle (bestandFuerRolle) sagen dasselbe. */
      const gelesen = (await Z.B.bestandLesen(Z.laden(), ich.raum)).bestand;
      const sicht = bestandFuerRolle(gelesen, { rolle, person: "p_1", betrieb: 0 });
      const inSicht = Object.prototype.hasOwnProperty.call(sicht.mandanten[0].abweichungen || {}, `p_1|${ferner}`);
      expect(inSicht, "Sicht").toBe(ENTWURF_SICHTBAR[spalte]);
      expect(f.text.includes(`DTSTART;TZID=Europe/Berlin:${kurz(ferner)}T060000`), "Feed").toBe(ENTWURF_SICHTBAR[spalte]);
      expect(entwurf(f.text) > 0, "Hinweis").toBe(!ENTWURF_SICHTBAR[spalte]);
    }, LIMIT);
  }
});

/* --------------------------------------------------------------------------
   Auflage A3 (Review WP-24)
   -------------------------------------------------------------------------- */
describe("Generation und Zwischenspeicher", () => {
  it("Entzug und Neuvergabe ohne Abruf dazwischen: der alte Verweis bleibt tot (404)", async () => {
    const ich = await aktiv("neuvergabe", "leitung");
    const g = await einrichten(ich.token);
    expect((await feed(g)).status).toBe(200);
    const r = await Z.A.mitgliedschaftEntziehen(Z.laden(), ich.k.id, ich.raum);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    /* Neuvergabe: der Grabstein wird entfernt, eine neue Mitgliedschaft ausgesprochen — sie trägt die nächste Generation. */
    await Z.laden().delete(Z.A.mitgliedSchluessel(ich.k.id, ich.raum));
    await Z.mitgliedAnlegen(ich.k.id, ich.raum, "leitung");
    const m = await Z.laden().get(Z.A.mitgliedSchluessel(ich.k.id, ich.raum), { type: "json" });
    expect(m.status).toBe("aktiv");
    const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
    expect(e.herkunft.generation).toBeLessThan(m.generation);
    const f = await feed(g);
    expect(f.status).toBe(404);
    expect(f.text).not.toContain("BEGIN:VCALENDAR");
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
  }, LIMIT);

  it("cache-control ist private (nie ein gemeinsamer Zwischenspeicher)", async () => {
    const ich = await aktiv("cache", "leitung");
    const g = await einrichten(ich.token);
    const antwort = await Z.kalender(new Request(`http://${WIRT}/kalender/feed/${g}.ics`,
      { headers: { host: WIRT, "x-forwarded-for": "198.51.100.251" } }), {});
    expect(antwort.status).toBe(200);
    const cc = String(antwort.headers.get("cache-control") || "");
    expect(cc.split(/\s*,\s*/)).toContain("private");
    expect(cc).not.toMatch(/\bpublic\b/);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   Auflage A4 (Review WP-24) und Folgepunkte (Befunde 3, 7, 9)
   -------------------------------------------------------------------------- */
const codeAnlegen = async (raum, code, felder = {}, schluessel = ablageSchluessel(code)) => {
  await kontoSchreiben(Z.laden(), schluessel, { name: "p_2", bestand: raum, rolle: "mitarbeiter", person: "p_2", betrieb: 0,
    mandantId: "m1", angelegt: "2026-01-01T00:00:00.000Z", ...felder });
};
const mitCode = async (code) => {
  const a = await Z.bearer(daten, "/api/anmelden", null, { methode: "POST", rumpf: { zugangscode: code } });
  expect(a.status, JSON.stringify(a.daten)).toBe(200);
  return a.daten.token;
};
/** Einen frisch eingerichteten Feed zum Altfeed machen (Herkunft entfernen), wie vor WP-24. */
const zumAltfeed = async (g) => {
  const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
  const { herkunft, ...ohne } = e;
  expect(herkunft).toBeTruthy();
  await Z.laden().setJSON(`feed:${hash(g)}`, ohne);
};

describe("A4a: Sperre widerruft herkunftslose Feeds der gebundenen Person", () => {
  it("Kontosperre: Altfeed der eigenen Person widerrufen; Altfeed einer anderen Person bleibt", async () => {
    const ich = await aktiv("alt-kontosperre", "leitung");
    const g = await einrichten(ich.token);
    await zumAltfeed(g);
    const code = "ALTFEED-KOLLEGE-0001";
    await codeAnlegen(ich.raum, code);
    const g2 = await einrichten(await mitCode(code));
    await zumAltfeed(g2);
    expect((await feed(g)).status).toBe(200);
    const r = await Z.A.accountSperren(Z.laden(), ich.k.id);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.account.status).toBe("gesperrt");
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_1`, { type: "json" })).toBeNull();
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g2)}`, { type: "json" })).toBeTruthy();       // fremde Person: unberührt
    expect((await feed(g2)).status).toBe(200);
  }, LIMIT);

  it("Codesperre (/api/zugang-sperren): Altfeed der gebundenen Person widerrufen", async () => {
    const ich = await aktiv("alt-codesperre", "leitung");
    const code = "ALTFEED-CODE-0002";
    await codeAnlegen(ich.raum, code);
    const g = await einrichten(await mitCode(code));
    await zumAltfeed(g);
    const eigen = await einrichten(ich.token);                                          // Feed der Leitung (p_1)
    await zumAltfeed(eigen);
    expect((await feed(g)).status).toBe(200);
    const s = await Z.bearer(daten, "/api/zugang-sperren", ich.token, { methode: "POST", rumpf: { code } });
    expect(s.status, JSON.stringify(s.daten)).toBe(200);
    expect(s.daten.gesperrt).toBe(1);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_2`, { type: "json" })).toBeNull();
    expect((await feed(g)).status).toBe(404);
    expect((await feed(eigen)).status).toBe(200);                                       // andere Person: unberührt
  }, LIMIT);

  it("ein Index, der auf den Feed einer anderen Person oder eines anderen Betriebs zeigt, löscht nichts", async () => {
    const { herkunftsloseFeedsWiderrufen } = await import("../server/lib/feedwiderruf.mjs");
    const st = Z.laden();
    const raum = Z.raum("index-fremd");
    await st.setJSON(`feedperson:${raum}:m1:p_1`, { hash: "h-fremd-person", seit: "2026-01-01" });
    await st.setJSON("feed:h-fremd-person", { bestand: raum, mandantId: "m1", personId: "p_9", seit: "2026-01-01" });
    await st.setJSON(`feedperson:${raum}:m1:p_3`, { hash: "h-fremd-betrieb", seit: "2026-01-01" });
    await st.setJSON("feed:h-fremd-betrieb", { bestand: raum, mandantId: "m2", personId: "p_3", seit: "2026-01-01" });
    await st.setJSON(`feedperson:${raum}:m1:p_4`, { hash: "h-fremd-raum", seit: "2026-01-01" });
    await st.setJSON("feed:h-fremd-raum", { bestand: "anderer-raum", mandantId: "m1", personId: "p_4", seit: "2026-01-01" });
    const r = await herkunftsloseFeedsWiderrufen(st, ["p_1", "p_3", "p_4"].map((personId) => ({ raum, mandantId: "m1", personId })));
    expect(r).toEqual({ widerrufen: 0, fehler: 0 });
    for (const h of ["h-fremd-person", "h-fremd-betrieb", "h-fremd-raum"]) expect(await st.get(`feed:${h}`, { type: "json" }), h).toBeTruthy();
  });

  it("ein Feed MIT Herkunft wird von dieser Bereinigung nicht angefasst (er fällt erst beim Abruf)", async () => {
    const ich = await aktiv("mit-herkunft-sperre", "leitung");
    const g = await einrichten(ich.token);
    await Z.A.accountSperren(Z.laden(), ich.k.id);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeTruthy();
    expect((await feed(g)).status).toBe(404);
  }, LIMIT);
});

describe("A4: alte Geräte-Termine (feeddaten:*) über den Datenschutzlauf", () => {
  it("Vorschau zählt und löscht nichts; „an“ löscht", async () => {
    const DS = await import("../server/lib/datenschutzlauf.mjs");
    const st = Z.laden();
    for (const n of [1, 2, 3]) await st.setJSON(`feeddaten:alt-${n}`, { name: "Alt", betrieb: "x", termine: [{ titel: "Krank" }] });
    const vorher = (await st.list({ prefix: "feeddaten:" })).blobs.length;
    expect(vorher).toBeGreaterThanOrEqual(3);
    const v = await DS.datenschutzLauf(st, { modus: "vorschau", spur: false });
    expect(v.feeddatenFaellig).toBe(vorher);
    expect(v.feeddatenGeloescht).toBe(0);
    expect((await st.list({ prefix: "feeddaten:" })).blobs.length).toBe(vorher);
    const a = await DS.datenschutzLauf(st, { modus: "an", spur: false });
    expect(a.feeddatenGeloescht).toBe(vorher);
    expect((await st.list({ prefix: "feeddaten:" })).blobs).toHaveLength(0);
    const aus = await DS.datenschutzLauf(st, { modus: "aus", spur: false });
    expect(aus.uebersprungen).toBe(true);
  }, LIMIT);
});

describe("Befund 3: Umschlüsselung — der Feed folgt dem Nachfolger des alten Eintrags", () => {
  it("Feed aus einer Sitzung mit altem Schlüssel: Sperre des neuen Eintrags widerruft ihn", async () => {
    const { altHash } = await import("../server/lib/codes.mjs");
    const ich = await aktiv("umschluesseln", "leitung");
    const code = "UMSCHLUESSEL-CODE-0003";
    expect(altHash(code)).not.toBe(ablageSchluessel(code));                            // ein Pfeffer ist gesetzt
    await codeAnlegen(ich.raum, code, {}, altHash(code));
    const g = await einrichten(await mitCode(code));
    const e = await Z.laden().get(`feed:${hash(g)}`, { type: "json" });
    expect(e.herkunft).toEqual({ art: "code", konto: altHash(code) });                  // die Sitzung trägt den alten Schlüssel
    const alt = await Z.K.kontoLesen(Z.laden(), altHash(code));
    expect(alt.ersetztDurch).toBe(ablageSchluessel(code));
    expect((await feed(g)).status).toBe(200);
    const neu = await Z.K.kontoLesen(Z.laden(), ablageSchluessel(code));
    await Z.K.kontoSchreiben(Z.laden(), ablageSchluessel(code), { ...neu, gesperrt: true });
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
  }, LIMIT);

  it("ein fehlender Nachfolger oder ein Kreis gilt nicht", async () => {
    const { feedHerkunftGilt } = await import("../server/lib/feedherkunft.mjs");
    const st = Z.laden();
    await kontoSchreiben(st, "kette-a", { name: "x", bestand: "r", ersetztDurch: "kette-b" });
    expect(await feedHerkunftGilt(st, { bestand: "r", herkunft: { art: "code", konto: "kette-a" } })).toEqual({ gilt: false, grund: "code-fehlt" });
    await kontoSchreiben(st, "kette-b", { name: "x", bestand: "r", ersetztDurch: "kette-a" });
    expect(await feedHerkunftGilt(st, { bestand: "r", herkunft: { art: "code", konto: "kette-a" } })).toEqual({ gilt: false, grund: "code-kette" });
    await kontoSchreiben(st, "kette-b", { name: "x", bestand: "r" });
    expect(await feedHerkunftGilt(st, { bestand: "r", herkunft: { art: "code", konto: "kette-a" } })).toEqual({ gilt: true });
    await kontoSchreiben(st, "kette-a", { name: "x", bestand: "r", ersetztDurch: "kette-b", gesperrt: true });
    expect((await feedHerkunftGilt(st, { bestand: "r", herkunft: { art: "code", konto: "kette-a" } })).gilt).toBe(false);
  });
});

describe("Befund 7: Herkunft fail-closed, Testraum-Code mit Enddatum", () => {
  it("ein neuer Feed ohne ableitbare Herkunft wird nicht eingerichtet (403)", async () => {
    const ich = await aktiv("ohne-herkunft", "leitung");
    const { token } = await Z.S.sitzungAnlegen({ bestand: ich.raum, rolle: "leitung", person: "p_1", betrieb: 0, name: "Ohne Herkunft" });
    const e = await Z.bearer(Z.kalender, "/kalender/einrichten", token, { methode: "POST", rumpf: {} });
    expect(e.status, JSON.stringify(e.daten)).toBe(403);
    expect(e.daten.geheim).toBeUndefined();
    expect(await Z.laden().get(`feedperson:${ich.raum}:m1:p_1`, { type: "json" })).toBeNull();
  }, LIMIT);

  it("Code mit laeuftAb: bis zum Enddatum 200, danach 404 und widerrufen", async () => {
    const ich = await aktiv("laeuftab", "leitung");
    const code = "TESTRAUM-CODE-0004";
    await codeAnlegen(ich.raum, code, { laeuftAb: new Date(Date.now() + 86400000).toISOString() });
    const g = await einrichten(await mitCode(code));
    expect((await feed(g)).status).toBe(200);
    const k = await Z.K.kontoLesen(Z.laden(), ablageSchluessel(code));
    await Z.K.kontoSchreiben(Z.laden(), ablageSchluessel(code), { ...k, laeuftAb: new Date(Date.now() - 1000).toISOString() });
    expect((await feed(g)).status).toBe(404);
    expect(await Z.laden().get(`feed:${hash(g)}`, { type: "json" })).toBeNull();
  }, LIMIT);
});

describe("Befund 9: das Feed-Geheimnis landet nicht in der Konsole", () => {
  it("adresseFuersProtokoll schwärzt den Feed-Pfad und lässt die Abfrage weg", async () => {
    const { adresseFuersProtokoll } = await import("../server/lib/schutz.mjs");
    const geheim = "GEHEIMNIS-0123456789abcdefABCDEF";
    for (const url of [`/kalender/feed/${geheim}.ics`, `/kalender/feed/${geheim}.ics?x=1`, `//kalender//feed/${geheim}.ics`,
      `/KALENDER/FEED/${geheim}`, `/kalender/feed/${geheim}/mehr`])
      expect(adresseFuersProtokoll(url), url).not.toContain("GEHEIMNIS");
    expect(adresseFuersProtokoll(`/kalender/feed/${geheim}.ics`)).toBe("/kalender/feed/[geschwärzt]");
    expect(adresseFuersProtokoll("/api/bestand?token=abc")).toBe("/api/bestand");
    expect(adresseFuersProtokoll("/kalender/einrichten")).toBe("/kalender/einrichten");
  });
  it("server.mjs schreibt bei einer Ausnahme nie die rohe Adresse", async () => {
    const quelle = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs"), "utf8");
    const fehlerzeilen = quelle.split(/\r?\n/).filter((l) => /console\.(error|warn|log)\(/.test(l));
    for (const l of fehlerzeilen) expect(l, l).not.toMatch(/\$\{\s*req\.url\s*\}/);
    expect(quelle).toMatch(/console\.error\(`[^`]*\$\{adresseFuersProtokoll\(req\.url\)\}/);
  });
});
