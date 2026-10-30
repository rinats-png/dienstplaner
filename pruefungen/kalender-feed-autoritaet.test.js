/* ==========================================================================
   KALENDERFEED: AUTORITÄT BEI JEDEM ABRUF (Commit D1f, Merge-Gate #14)

   Das Feed-Geheimnis ist ein Bearer-Zugang ohne Sitzung. Bis D1f prüfte
   der Abruf nur, ob es das Geheimnis gibt — der Feed lieferte weiter, wenn
   die Person ausgetreten, gesperrt, anonymisiert, aus dem Betrieb entfernt
   war oder der Betrieb nicht mehr bestand. Altfeeds aus der Zeit vor
   Commit 3 (ohne mandantId, Person damals frei wählbar) ebenso.

   Jetzt: Raum, Betrieb, Person in genau diesem Betrieb, nicht anonymisiert,
   nicht gesperrt, nicht ausgetreten, bekannte Rolle — sonst 404 wie bei
   einem unbekannten Geheimnis. Altfeeds: 404 und widerrufen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const WIRT = "127.0.0.1:3000";
const RAUM = "feedraum";
const RAUM2 = "feedraum-weg";
let wurzel, laden, daten, kalender, kontoSchreiben, ablageSchluessel, B, S, K;
let nr = 0;
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.14.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* ICS oder Text */ }
  return { status: a.status, text, form: `${a.status}|${a.headers.get("content-type")}|${a.headers.get("cache-control")}|${text}`, ...d };
};
const feed = (g) => anfrage(kalender, `/kalender/feed/${g}.ics`, { methode: "GET" });

const person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (id, personen) => ({ id, name: `Betrieb ${id}`, status: "aktiv", einheiten: [{ id: "e1" }], standorte: [],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], personen, abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [] });
const IDS = ["ok", "weg", "anon", "gesperrt", "aus", "heute", "rolle", "ohnestatus", "reakt", "lesefehler"];
const start = () => ({ version: 9, mandanten: [
  betrieb("m-a", [person("l1", "leitung"), ...IDS.map((i) => person(i))]),
  betrieb("m-b", [person("b1")]),
] });
const TERMIN = [{ id: "d-t1", datum: "2026-12-01", von: "06:00", endDatum: "2026-12-01", bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }];

const G = {};
async function feedFuer(raum, code, personId, betriebNr, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: personId, bestand: raum, rolle: "mitarbeiter", person: personId,
    betrieb: betriebNr, mandantId, angelegt: "2026-01-01T00:00:00.000Z" });
  const t = (await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(t, personId).toBeTruthy();
  const e = await anfrage(kalender, "/kalender/einrichten", { token: t, rumpf: {} });
  expect(e.status, e.text).toBe(200);
  const dt = await anfrage(kalender, "/kalender/daten", { token: t, rumpf: { geheim: e.geheim, name: personId, betrieb: "B", termine: TERMIN } });
  expect(dt.status, dt.text).toBe(200);
  return { geheim: e.geheim, token: t };
}
/** Den Bestand ändern, wie es Leitung oder Löschlauf tun würden. */
async function aendern(raum, fn) {
  const g = (await B.bestandLesen(laden(), raum)).bestand;
  const neu = JSON.parse(JSON.stringify(g));
  fn(neu);
  const e = await B.bestandSchreiben(laden(), raum, neu, { durch: "Pruefung" });
  expect(e.ok).toBe(true);
}
const ma = (b) => b.mandanten.find((m) => m.id === "m-a");
const pers = (b, id) => ma(b).personen.find((p) => p.id === id);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-feed-autoritaet-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  K = await import("../server/funktionen/kalender.mjs");
  kalender = K.default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/scherben.mjs");
  await B.bestandSchreiben(laden(), RAUM, start(), { durch: "Pruefung" });
  await B.bestandSchreiben(laden(), RAUM2, { version: 9, mandanten: [betrieb("m-x", [person("x1")])] }, { durch: "Pruefung" });
  for (const [i, id] of IDS.entries()) G[id] = await feedFuer(RAUM, `FEED-${String(i).padStart(4, "0")}-AAAA`, id, 0, "m-a");
  G.b1 = await feedFuer(RAUM, "FEED-BBBB-0001", "b1", 1, "m-b");
  G.x1 = await feedFuer(RAUM2, "FEED-XXXX-0001", "x1", 0, "m-x");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("vor jeder Änderung: alle Feeds gültig", () => {
  it("200 mit ICS", async () => {
    for (const k of Object.keys(G)) {
      const f = await feed(G[k].geheim);
      expect(f.status, k).toBe(200);
      expect(f.text).toContain("BEGIN:VCALENDAR");
    }
  });
});

describe("Entzug: jeweils 404", () => {
  beforeAll(async () => {
    const gestern = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const { heuteBerlin } = await import("../server/lib/zeiterfassung.mjs");
    await aendern(RAUM, (b) => {
      ma(b).personen = ma(b).personen.filter((p) => p.id !== "weg");
      Object.assign(pers(b, "anon"), { anonym: true, vorname: "—", nachname: "—" });
      pers(b, "gesperrt").status = "gesperrt";
      pers(b, "aus").austritt = gestern;
      pers(b, "heute").austritt = heuteBerlin();
      pers(b, "rolle").rolle = "gast";
      delete pers(b, "ohnestatus").status;
      b.mandanten = b.mandanten.filter((m) => m.id !== "m-b");
    });
    /* Raum nicht mehr vorhanden */
    await laden().delete(S.kernSchluessel(RAUM2));
  });
  /* Seit D1g endgültig widerrufen: feed:, feeddaten: und der genau zugehörige Index sind danach weg. */
  const weg = async (k, raum, mid) => {
    const h = hash(G[k].geheim);
    expect(await laden().get(`feed:${h}`, { type: "json" }), `feed: ${k}`).toBeNull();
    expect(await laden().get(`feeddaten:${h}`, { type: "json" }), `feeddaten: ${k}`).toBeNull();
    expect(await laden().get(`feedperson:${raum}:${mid}:${k}`, { type: "json" }), `Index ${k}`).toBeNull();
  };
  for (const [k, warum, raum, mid] of [["weg", "Person entfernt", RAUM, "m-a"], ["anon", "Person anonymisiert", RAUM, "m-a"],
    ["gesperrt", "Person deaktiviert", RAUM, "m-a"], ["aus", "Person ausgetreten (gestern)", RAUM, "m-a"],
    ["rolle", "unbekannte Personenrolle", RAUM, "m-a"], ["b1", "Betrieb entfernt", RAUM, "m-b"], ["x1", "Raum nicht mehr vorhanden", RAUM2, "m-x"]]) {
    it(`${warum}: 404 und endgültig widerrufen`, async () => {
      expect(await laden().get(`feed:${hash(G[k].geheim)}`, { type: "json" }), `vorher ${k}`).toBeTruthy();
      const f = await feed(G[k].geheim);
      expect(f.status).toBe(404);
      expect(f.text).not.toContain("BEGIN:VCALENDAR");
      await weg(k, raum, mid);
    });
  }
  it("gültig bleiben: unverändert, Austritt heute (zählt noch), ohne Status", async () => {
    for (const k of ["ok", "heute", "ohnestatus"]) expect((await feed(G[k].geheim)).status, k).toBe(200);
  });
  it("gültig bleiben die Feeds unverändert gültiger Personen auch nach den Widerrufen", async () => {
    for (const k of ["ok", "heute", "ohnestatus"]) expect(await laden().get(`feed:${hash(G[k].geheim)}`, { type: "json" }), k).toBeTruthy();
  });
});

describe("Reaktivierung (D1g): ein widerrufener Verweis wird nie wieder gültig", () => {
  it("aktiv 200 → gesperrt 404, gelöscht → wieder aktiv: alter Verweis 404 → neuer Feed 200", async () => {
    expect((await feed(G.reakt.geheim)).status).toBe(200);
    await aendern(RAUM, (b) => { pers(b, "reakt").status = "gesperrt"; });
    expect((await feed(G.reakt.geheim)).status).toBe(404);
    const h = hash(G.reakt.geheim);
    expect(await laden().get(`feed:${h}`, { type: "json" })).toBeNull();
    expect(await laden().get(`feeddaten:${h}`, { type: "json" })).toBeNull();
    expect(await laden().get("feedperson:feedraum:m-a:reakt", { type: "json" })).toBeNull();
    await aendern(RAUM, (b) => { pers(b, "reakt").status = "aktiv"; });
    expect((await feed(G.reakt.geheim)).status).toBe(404);              // der alte Bearer-Link bleibt tot
    const e = await anfrage(kalender, "/kalender/einrichten", { token: G.reakt.token, rumpf: {} });
    expect(e.status, e.text).toBe(200);
    expect(e.geheim).not.toBe(G.reakt.geheim);
    const dt = await anfrage(kalender, "/kalender/daten", { token: G.reakt.token, rumpf: { geheim: e.geheim, name: "reakt", betrieb: "B", termine: TERMIN } });
    expect(dt.status, dt.text).toBe(200);
    expect((await feed(e.geheim)).status).toBe(200);
    expect((await feed(G.reakt.geheim)).status).toBe(404);
  });
});

describe("Technischer Lesefehler (D1g): kein Widerruf", () => {
  it("beschädigter Bestandskern: 500, der Feed bleibt erhalten und gilt nach der Reparatur wieder", async () => {
    const { ablageWurzel } = await import("../server/lib/ablage.mjs");
    const datei = path.join(ablageWurzel(), "centric", "kern%3Afeedraum.json");
    const vorher = await readFile(datei, "utf8");
    try {
      await writeFile(datei, "{ kaputt");
      const f = await feed(G.lesefehler.geheim);
      expect(f.status).toBe(500);
      expect(f.text).not.toContain("BEGIN:VCALENDAR");
      expect(await laden().get(`feed:${hash(G.lesefehler.geheim)}`, { type: "json" })).toBeTruthy();
      expect(await laden().get(`feeddaten:${hash(G.lesefehler.geheim)}`, { type: "json" })).toBeTruthy();
    } finally {
      await writeFile(datei, vorher);
    }
    expect((await feed(G.lesefehler.geheim)).status).toBe(200);
  });
});

describe("Altfeed ohne mandantId", () => {
  it("404, feed: und feeddaten: entfernt, nur der genau zugehörige Index bereinigt — keine Zuordnung geraten", async () => {
    const geheim = "altfeed-ohne-betrieb-geheimnis-0001";
    const h = hash(geheim);
    /* personId "ok" ist im Raum eindeutig und gültig — trotzdem keine Zuordnung */
    await laden().setJSON(`feed:${h}`, { bestand: RAUM, personId: "ok", seit: "2026-01-01" });
    await laden().setJSON(`feeddaten:${h}`, { name: "Alt", betrieb: "?", termine: TERMIN });
    await laden().setJSON("feedperson:feedraum:m-alt:ok", { hash: h, seit: "2026-01-01" });
    const fremderIndex = await laden().get("feedperson:feedraum:m-a:ok", { type: "json" });
    expect(fremderIndex && fremderIndex.hash).toBeTruthy();

    const f = await feed(geheim);
    expect(f.status).toBe(404);
    expect(await laden().get(`feed:${h}`, { type: "json" }).catch(() => null)).toBeNull();
    expect(await laden().get(`feeddaten:${h}`, { type: "json" }).catch(() => null)).toBeNull();
    expect(await laden().get("feedperson:feedraum:m-alt:ok", { type: "json" }).catch(() => null)).toBeNull();
    expect(await laden().get("feedperson:feedraum:m-a:ok", { type: "json" })).toEqual(fremderIndex);
    expect((await feed(G.ok.geheim)).status).toBe(200);
    expect((await feed(geheim)).status).toBe(404);
  });
});

describe("kein Informationsleck", () => {
  it("unbekannt, widerrufen und entzogen: dieselbe Antwortform", async () => {
    const w = await feedFuer(RAUM, "FEED-WIDR-0001", "l1", 0, "m-a");
    expect((await feed(w.geheim)).status).toBe(200);
    expect((await anfrage(kalender, "/kalender/loeschen", { token: w.token, rumpf: {} })).status).toBe(200);
    const unbekannt = await feed("dieses-geheimnis-gibt-es-nicht-0001");
    const widerrufen = await feed(w.geheim);
    const entzogen = await feed(G.gesperrt.geheim);
    const altfeed = await (async () => {
      const g = "altfeed-form-geheimnis-0002";
      await laden().setJSON(`feed:${hash(g)}`, { bestand: RAUM, personId: "ok", seit: "2026-01-01" });
      return feed(g);
    })();
    expect(unbekannt.status).toBe(404);
    for (const x of [widerrufen, entzogen, altfeed]) expect(x.form).toBe(unbekannt.form);
  });
});

describe("feedPersonGilt", () => {
  const b = () => ({ mandanten: [betrieb("m-a", [person("p")])] });
  const e = { bestand: RAUM, mandantId: "m-a", personId: "p" };
  it("Grundfall und Rollen", () => {
    expect(K.feedPersonGilt(b(), e, "2026-10-29")).toBe(true);
    for (const r of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat", undefined]) {
      const x = b(); x.mandanten[0].personen[0].rolle = r;
      expect(K.feedPersonGilt(x, e, "2026-10-29"), String(r)).toBe(true);
    }
    for (const r of ["betreiber", "kunde", "gast", "", "Leitung", 5]) {
      const x = b(); x.mandanten[0].personen[0].rolle = r;
      expect(K.feedPersonGilt(x, e, "2026-10-29"), String(r)).toBe(false);
    }
  });
  it("mehrdeutig (doppelte Betriebs- oder Personenkennung) gilt nicht", () => {
    const x = b(); x.mandanten.push(betrieb("m-a", [person("p")]));
    expect(K.feedPersonGilt(x, e, "2026-10-29")).toBe(false);
    const y = b(); y.mandanten[0].personen.push(person("p"));
    expect(K.feedPersonGilt(y, e, "2026-10-29")).toBe(false);
  });
  it("Status und Austritt", () => {
    for (const [feld, wert, gilt] of [["status", "gesperrt", false], ["status", "inaktiv", false], ["status", "aktiv", true],
      ["austritt", "2026-10-28", false], ["austritt", "2026-10-29", true], ["austritt", "2026-12-31", true], ["anonym", true, false]]) {
      const x = b(); x.mandanten[0].personen[0][feld] = wert;
      expect(K.feedPersonGilt(x, e, "2026-10-29"), `${feld}=${wert}`).toBe(gilt);
    }
  });
});
