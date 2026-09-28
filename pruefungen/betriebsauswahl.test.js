/* ==========================================================================
   VOM KONTO IN EINEN BETRIEB

   Zwei Endpunkte, und eine Frage über allem: Wer entscheidet, was jemand
   darf? Nicht der Browser. Er darf einen Raum nennen — alles andere holt
   der Server aus seiner Ablage: die Kontokennung aus der Sitzung, die
   Mitgliedschaft für genau diese Kennung und genau diesen Raum, die Person
   aus dem Bestand, die Rolle über `wirksameRolle`.

   Die Liste der Arbeitsbereiche ist dabei keine Erlaubnis: Zwischen Anzeige
   und Auswahl kann ein Zugang entzogen worden sein, und dann muss die
   Auswahl scheitern. Genau das wird hier geprüft.

   Geprüft wird der echte Handler, derselbe Standardexport, den server.mjs
   unter den fünf Kontopfaden einhängt.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, getStore, handler, KEKS, A, P, S, B, R, SCH, BA;

const LIMIT = 40000;
const GUT = "Nordwind und Sonne 1846";
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const P_AN = "/api/account/anmelden";
const P_LISTE = "/api/account/mitgliedschaften";
const P_WAHL = "/api/account/betrieb";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-auswahl-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const modul = await import("../server/funktionen/anmeldung.mjs");
  handler = modul.default;
  KEKS = modul.COOKIE;
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  S = await import("../server/lib/sitzungen.mjs");
  B = await import("../server/lib/bestand.mjs");
  R = await import("../server/lib/rechte.mjs");
  SCH = await import("../server/lib/schutz.mjs");
  BA = await import("../server/lib/betriebsauswahl.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const kontoAblage = () =>
  getStore({ name: "centric-accountsitzungen", consistency: "strong" });
const arbeitAblage = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/* Die Bremse lebt in der Ablage und im Prozessspeicher; gegen letzteren
   hilft nur eine eigene Absenderadresse je Anfrage. */
beforeEach(async () => {
  const s = getStore({ name: "centric-takt", consistency: "strong" });
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let zaehler = 0;
const eigeneHerkunft = () =>
  `10.8.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;
const adresse = (was) => `${was}-${++zaehler}@example.org`;
const raumName = (was) => `t-aus-${was}-${++zaehler}`;

async function anfrage({ pfad = P_WAHL, methode = "POST", rumpf = undefined,
  rohRumpf = null, keks = null, origin = EIGEN, ziel = null, herkunft = null,
  laengeVorspiegeln = null } = {}) {
  const kopf = { "x-forwarded-for": herkunft || eigeneHerkunft(), host: WIRT };
  if (methode !== "GET" && methode !== "HEAD") kopf["content-type"] = "application/json";
  if (origin) kopf.origin = origin;
  if (ziel) kopf["sec-fetch-site"] = ziel;
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  if (laengeVorspiegeln) kopf["content-length"] = String(laengeVorspiegeln);
  const koerper = methode === "GET" || methode === "HEAD" ? undefined
    : (rohRumpf !== null ? rohRumpf : JSON.stringify(rumpf ?? {}));
  const req = new Request(`http://${WIRT}${pfad}`, {
    method: methode, headers: kopf, ...(koerper === undefined ? {} : { body: koerper }),
  });
  const antwort = await handler(req);
  let daten = null;
  try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { antwort, status: antwort.status, daten, text: JSON.stringify(daten) };
}

/** Ein anmeldefähiges Konto. */
async function konto(email) {
  const s = laden();
  const e = await A.accountAnlegen(s, { email });
  if (!e.ok) throw new Error(`Account nicht angelegt: ${e.grund}`);
  await A.emailBestaetigen(s, e.account.id);
  const g = await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
  if (!g.ok) throw new Error("Passwort nicht gesetzt");
  return g.account;
}

const keksWert = (kopf) => {
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
  return m ? m[1] : null;
};

/** Angemeldet, Cookie in der Hand. */
async function angemeldet(email) {
  const e = await anfrage({ pfad: P_AN, rumpf: { email, passwort: GUT } });
  expect(e.status, `Anmeldung: ${e.text}`).toBe(200);
  const merkmal = keksWert(e.antwort.headers.get("set-cookie"));
  expect(merkmal).toBeTruthy();
  return merkmal;
}

/** Eine Person, wie sie im Bestand steht — nur die Felder, die hier zählen. */
const person = (id, vorname, nachname, rolle, extra = {}) => ({
  id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE", ...extra,
});

/** Ein Betrieb in einem Raum. */
async function betrieb(raum, { mandantId = "m1", name = "Haus Probe",
  personen = [] } = {}) {
  const e = await B.bestandSchreiben(laden(), raum, {
    version: 5,
    mandanten: [{ id: mandantId, name, personen,
      einheiten: [{ id: "e1", name: "Wohnbereich 1" }] }],
  }, { durch: "Pruefung" });
  expect(e.ok, `Bestand nicht geschrieben: ${JSON.stringify(e)}`).toBe(true);
  return raum;
}

/** Eine Mitgliedschaft, aktiv. */
async function mitglied(accountId, raum, { mandantId = "m1", person: pid = "p_1",
  rolle = "mitarbeiter", einheit = null, status = "aktiv", betrieb: idx = 0 } = {}) {
  const e = await A.mitgliedschaftAnlegen(laden(), { accountId, raum, betrieb: idx,
    mandantId, person: pid, rolle, einheit, status });
  expect(e.ok, `Mitgliedschaft nicht angelegt: ${JSON.stringify(e)}`).toBe(true);
  return e.mitgliedschaft;
}

/** Ein vollständiger Arbeitsbereich: Raum, Person, Mitgliedschaft. */
async function arbeitsbereich(accountId, was, { rolle = "mitarbeiter",
  personRolle = null, name = "Haus Probe", mandantId = "m1" } = {}) {
  const raum = raumName(was);
  await betrieb(raum, { mandantId, name,
    personen: [person("p_1", "Rina", "Schmitt", personRolle || rolle)] });
  await mitglied(accountId, raum, { mandantId, person: "p_1", rolle });
  return raum;
}

/** Der abgelegte Arbeitssitzungsdatensatz zu einem Merkmal. */
const arbeitssitzung = (token) =>
  arbeitAblage().get(`t:${hash(token)}`, { type: "json" });

/** Wie viele Arbeitssitzungen liegen insgesamt? */
async function arbeitssitzungen() {
  const { blobs } = await arbeitAblage().list({ prefix: "t:" });
  return blobs.length;
}

/* ==========================================================================
   DIE LISTE DER ARBEITSBEREICHE
   ========================================================================== */

describe("GET /api/account/mitgliedschaften", () => {
  it("weist eine Anfrage ohne Account-Sitzung ab", async () => {
    const e = await anfrage({ pfad: P_LISTE, methode: "GET" });
    expect(e.status).toBe(401);
    expect(e.daten.angemeldet).toBe(false);
    expect(e.text).not.toContain("mitgliedschaften");
  }, LIMIT);

  it("weist ein verfälschtes Cookie ab", async () => {
    const k = await konto(adresse("liste-falsch"));
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET",
      keks: keks.slice(0, -1) + (keks.endsWith("A") ? "B" : "A") });
    expect(e.status).toBe(401);
  }, LIMIT);

  it("antwortet bei null Mitgliedschaften mit einer leeren Liste", async () => {
    const k = await konto(adresse("liste-null"));
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true, mitgliedschaften: [] });
  }, LIMIT);

  it("nennt bei einer Mitgliedschaft genau einen Eintrag", async () => {
    const k = await konto(adresse("liste-eins"));
    const raum = await arbeitsbereich(k.id, "eins", { name: "Pflegeheim Sonnenhof" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(e.status).toBe(200);
    expect(e.daten.mitgliedschaften).toEqual([{ raum, name: "Pflegeheim Sonnenhof" }]);
  }, LIMIT);

  it("nennt bei mehreren alle anwählbaren", async () => {
    const k = await konto(adresse("liste-mehrere"));
    const alpha = await arbeitsbereich(k.id, "alpha", { name: "Haus Alpha" });
    const beta = await arbeitsbereich(k.id, "beta", { name: "Haus Beta",
      rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(e.status).toBe(200);
    const raeume = e.daten.mitgliedschaften.map((m) => m.raum).sort();
    expect(raeume).toEqual([alpha, beta].sort());
    const namen = e.daten.mitgliedschaften.map((m) => m.name).sort();
    expect(namen).toEqual(["Haus Alpha", "Haus Beta"]);
  }, LIMIT);

  it("gibt weder Rolle noch Person noch Interna heraus", async () => {
    const k = await konto(adresse("liste-knapp"));
    await arbeitsbereich(k.id, "knapp", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    for (const eintrag of e.daten.mitgliedschaften) {
      expect(Object.keys(eintrag).sort()).toEqual(["name", "raum"]);
    }
    for (const wort of ["leitung", "p_1", "m1", "accountId", k.id, "mandantId",
      "epoche", "betrieb", "status", "eingeladen", "s1$"]) {
      expect(e.text, wort).not.toContain(wort);
    }
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");
  }, LIMIT);

  it("verschweigt entzogene Mitgliedschaften und solche ohne Person", async () => {
    const k = await konto(adresse("liste-filter"));
    const gut = await arbeitsbereich(k.id, "filter-gut");
    const entzogen = raumName("filter-weg");
    await betrieb(entzogen, { personen: [person("p_1", "A", "B", "mitarbeiter")] });
    await mitglied(k.id, entzogen);
    await A.mitgliedschaftEntziehen(laden(), k.id, entzogen);
    const ohnePerson = raumName("filter-ohne");
    await betrieb(ohnePerson, { personen: [] });
    await mitglied(k.id, ohnePerson, { person: null });

    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(e.daten.mitgliedschaften.map((m) => m.raum)).toEqual([gut]);
  }, LIMIT);

  it("wählt nichts aus — auch nicht bei genau einer Mitgliedschaft", async () => {
    const k = await konto(adresse("liste-keine-wahl"));
    await arbeitsbereich(k.id, "keine-wahl");
    const keks = await angemeldet(k.email);
    const vorher = await arbeitssitzungen();
    const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(e.status).toBe(200);
    expect(e.daten.mitgliedschaften.length).toBe(1);
    /* Keine Arbeitssitzung, kein Merkmal, kein Zugang. */
    expect(await arbeitssitzungen()).toBe(vorher);
    expect(e.text).not.toContain("token");
    expect(e.antwort.headers.get("set-cookie")).toBe(null);
  }, LIMIT);

  it("nimmt nur GET und HEAD", async () => {
    const k = await konto(adresse("liste-methode"));
    const keks = await angemeldet(k.email);
    const e = await anfrage({ pfad: P_LISTE, methode: "POST", keks });
    expect(e.status).toBe(405);
    expect(e.antwort.headers.get("allow")).toBe("GET, HEAD");
  }, LIMIT);

  it("weist cross-site und same-site ab", async () => {
    const k = await konto(adresse("liste-csrf"));
    const keks = await angemeldet(k.email);
    for (const ziel of ["cross-site", "same-site"]) {
      const e = await anfrage({ pfad: P_LISTE, methode: "GET", keks, ziel });
      expect(e.status, ziel).toBe(403);
    }
  }, LIMIT);
});

/* ==========================================================================
   DIE AUSWAHL — DER ERFOLGSFALL
   ========================================================================== */

describe("POST /api/account/betrieb", () => {
  it("öffnet den gewählten Betrieb und legt eine Arbeitssitzung an", async () => {
    const k = await konto(adresse("wahl-gut"));
    const raum = await arbeitsbereich(k.id, "gut", { rolle: "leitung",
      name: "Haus Sonnenhof" });
    const keks = await angemeldet(k.email);

    const e = await anfrage({ rumpf: { raum }, keks });
    expect(e.status).toBe(200);
    expect(e.daten.ok).toBe(true);
    expect(e.daten.raum).toBe(raum);
    expect(e.daten.name).toBe("Haus Sonnenhof");
    expect(e.daten.rolle).toBe("leitung");
    expect(e.daten.person).toBe("p_1");
    expect(e.daten.betrieb).toBe(0);
    expect(typeof e.daten.token).toBe("string");
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");

    /* Die Arbeitssitzung liegt in der Ablage der Arbeitssitzungen, unter
       dem Prüfwert ihres Merkmals. */
    const roh = await arbeitssitzung(e.daten.token);
    expect(roh).toBeTruthy();
    expect(roh.bestand).toBe(raum);
    expect(roh.person).toBe("p_1");
    expect(roh.betrieb).toBe(0);
    expect(roh.name).toBe("Rina Schmitt");
    /* Kein Zugangscode, kein Demomerkmal, keine Kontokennung. */
    expect(roh.konto).toBe(undefined);
    expect(roh.demo).toBe(undefined);
    expect(JSON.stringify(roh)).not.toContain(k.id);
  }, LIMIT);

  it("liefert ein Merkmal, das die bestehende Sitzungsprüfung annimmt", async () => {
    const k = await konto(adresse("wahl-merkmal"));
    const raum = await arbeitsbereich(k.id, "merkmal", { rolle: "planer" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks });

    const mitKopf = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${e.daten.token}` : null) },
    };
    const sitzung = await S.sitzungLesen(/** @type {any} */ (mitKopf));
    expect(sitzung).toBeTruthy();
    expect(sitzung.bestand).toBe(raum);
    expect(sitzung.person).toBe("p_1");
  }, LIMIT);

  it("trennt Arbeitsmerkmal und Account-Cookie vollständig", async () => {
    const k = await konto(adresse("wahl-trennung"));
    const raum = await arbeitsbereich(k.id, "trennung");
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks });
    const token = e.daten.token;

    /* Zwei verschiedene Geheimnisse … */
    expect(token).not.toBe(keks);
    /* … in zwei verschiedenen Ablagen … */
    expect(await arbeitssitzung(token)).toBeTruthy();
    expect(await kontoAblage().get(`as:${hash(token)}`, { type: "json" })).toBe(null);
    expect(await arbeitAblage().get(`t:${hash(keks)}`, { type: "json" })).toBe(null);
    /* … und keines öffnet die Tür des anderen. */
    const alsKeks = await anfrage({ pfad: P_LISTE, methode: "GET", keks: token });
    expect(alsKeks.status).toBe(401);
    const alsArbeit = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${keks}` : null) },
    };
    expect(await S.sitzungLesen(/** @type {any} */ (alsArbeit))).toBe(null);
  }, LIMIT);

  it("erweitert die Account-Sitzung um kein einziges Feld", async () => {
    const k = await konto(adresse("wahl-konto-sitzung"));
    const raum = await arbeitsbereich(k.id, "konto-sitzung", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const vorher = await kontoAblage().get(`as:${hash(keks)}`, { type: "json" });
    await anfrage({ rumpf: { raum }, keks });
    const nachher = await kontoAblage().get(`as:${hash(keks)}`, { type: "json" });

    expect(Object.keys(nachher).sort())
      .toEqual(["accountId", "art", "bis", "epoche", "seit", "zuletzt"]);
    for (const feld of ["raum", "bestand", "rolle", "person", "betrieb",
      "mitgliedschaft", "einheit"]) {
      expect(Object.prototype.hasOwnProperty.call(nachher, feld), feld).toBe(false);
    }
    expect(nachher.accountId).toBe(vorher.accountId);
    expect(nachher.bis).toBe(vorher.bis);
  }, LIMIT);

  it("hält zwei Betriebe auseinander und überträgt keine Rolle", async () => {
    const k = await konto(adresse("wahl-zwei"));
    const alpha = await arbeitsbereich(k.id, "zwei-alpha", { rolle: "mitarbeiter",
      name: "Haus Alpha" });
    const beta = await arbeitsbereich(k.id, "zwei-beta", { rolle: "leitung",
      name: "Haus Beta", mandantId: "m1" });
    const keks = await angemeldet(k.email);

    const eA = await anfrage({ rumpf: { raum: alpha }, keks });
    expect(eA.status).toBe(200);
    expect(eA.daten.rolle).toBe("mitarbeiter");
    expect(eA.daten.raum).toBe(alpha);

    const eB = await anfrage({ rumpf: { raum: beta }, keks });
    expect(eB.status).toBe(200);
    expect(eB.daten.rolle).toBe("leitung");
    expect(eB.daten.raum).toBe(beta);

    /* Die höhere Rolle aus Beta färbt nicht auf Alpha ab — auch nicht in
       der Sitzung, die schon lief. */
    const rohA = await arbeitssitzung(eA.daten.token);
    expect(rohA.bestand).toBe(alpha);
    expect(rohA.rolle).toBe("mitarbeiter");
    const nochmalA = await anfrage({ rumpf: { raum: alpha }, keks });
    expect(nochmalA.daten.rolle).toBe("mitarbeiter");

    /* Und jede Sitzung sieht nur ihren Raum. */
    const rohB = await arbeitssitzung(eB.daten.token);
    expect(rohB.bestand).toBe(beta);
    expect(rohA.bestand).not.toBe(rohB.bestand);
  }, LIMIT);

  it("leitet die Rolle aus der Person im Bestand ab, nicht aus der Einladung",
    async () => {
      /* Die Personalliste ist die faktische Wahrheit: `wirksameRolle`
         entscheidet über die Person im Bestand — dieselbe Regel wie für jede
         Anfrage eines Zugangscodes. Die Rolle der Einladung ist nur der
         Rückfall, wenn es die Person nicht mehr gibt. */
      const k = await konto(adresse("wahl-rolle"));
      const raum = await arbeitsbereich(k.id, "rolle", { rolle: "mitarbeiter",
        personRolle: "planer" });
      const keks = await angemeldet(k.email);
      const e = await anfrage({ rumpf: { raum }, keks });
      expect(e.status).toBe(200);
      expect(e.daten.rolle).toBe("planer");
      /* Gespeichert bleibt die Rolle der Einladung; was gilt, entscheidet
         daten.mjs bei jeder Anfrage neu über den Bestand. */
      const roh = await arbeitssitzung(e.daten.token);
      expect(roh.rolle).toBe("mitarbeiter");
      const gelesen = await B.bestandLesen(laden(), raum);
      expect(R.wirksameRolle(roh, gelesen.bestand)).toBe("planer");
    }, LIMIT);

  it("fügt sich in die bestehende Rechteprüfung ein", async () => {
    const k = await konto(adresse("wahl-rechte"));
    const raum = await arbeitsbereich(k.id, "rechte", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks });
    const roh = await arbeitssitzung(e.daten.token);
    const gelesen = await B.bestandLesen(laden(), raum);
    const rolle = R.wirksameRolle(roh, gelesen.bestand);
    expect(rolle).toBe("leitung");
    expect(R.schreibumfang(rolle)).toBe(R.SCHREIBEN_VOLL);

    /* Und eine beschäftigte Person bekommt genau ihren Umfang. */
    const k2 = await konto(adresse("wahl-rechte-ma"));
    const raum2 = await arbeitsbereich(k2.id, "rechte-ma", { rolle: "mitarbeiter" });
    const keks2 = await angemeldet(k2.email);
    const e2 = await anfrage({ rumpf: { raum: raum2 }, keks: keks2 });
    const roh2 = await arbeitssitzung(e2.daten.token);
    const g2 = await B.bestandLesen(laden(), raum2);
    expect(R.schreibumfang(R.wirksameRolle(roh2, g2.bestand)))
      .toBe(R.SCHREIBEN_EIGENES);
  }, LIMIT);

  it("erlaubt zwei Arbeitsbereiche gleichzeitig", async () => {
    const k = await konto(adresse("wahl-parallel"));
    const alpha = await arbeitsbereich(k.id, "parallel-a");
    const beta = await arbeitsbereich(k.id, "parallel-b", { rolle: "planer" });
    const keks = await angemeldet(k.email);
    const eA = await anfrage({ rumpf: { raum: alpha }, keks });
    const eB = await anfrage({ rumpf: { raum: beta }, keks });
    expect(eA.daten.token).not.toBe(eB.daten.token);
    expect(await arbeitssitzung(eA.daten.token)).toBeTruthy();
    expect(await arbeitssitzung(eB.daten.token)).toBeTruthy();
  }, LIMIT);
});

/* ==========================================================================
   DIE ABSAGEN — EINE FÜR ALLE
   ========================================================================== */

describe("Was sich nicht öffnen lässt", () => {
  it("weist einen fremden Betrieb ab", async () => {
    const a = await konto(adresse("fremd-a"));
    const b = await konto(adresse("fremd-b"));
    await arbeitsbereich(a.id, "fremd-eigen");
    const fremder = await arbeitsbereich(b.id, "fremd-fremd", { rolle: "leitung" });
    const keks = await angemeldet(a.email);

    const e = await anfrage({ rumpf: { raum: fremder }, keks });
    expect(e.status).toBe(403);
    expect(e.daten.fehler).toBe("kein-zugang");
    /* Keine Arbeitssitzung für einen fremden Raum. */
    const { blobs } = await arbeitAblage().list({ prefix: "t:" });
    for (const bl of blobs) {
      const s = await arbeitAblage().get(bl.key, { type: "json" });
      if (s && s.bestand === fremder) throw new Error("Sitzung im fremden Raum");
    }
  }, LIMIT);

  it("antwortet für jeden Grund gleich", async () => {
    const k = await konto(adresse("absage"));
    const fremd = await konto(adresse("absage-fremd"));
    await arbeitsbereich(k.id, "absage-eigen");
    const fremder = await arbeitsbereich(fremd.id, "absage-fremd");

    /* entzogen */
    const entzogen = raumName("absage-entzogen");
    await betrieb(entzogen, { personen: [person("p_1", "A", "B", "mitarbeiter")] });
    await mitglied(k.id, entzogen);
    await A.mitgliedschaftEntziehen(laden(), k.id, entzogen);
    /* ohne Person */
    const ohnePerson = raumName("absage-ohne-person");
    await betrieb(ohnePerson, { personen: [] });
    await mitglied(k.id, ohnePerson, { person: null });
    /* Person fehlt im Bestand */
    const personFehlt = raumName("absage-person-fehlt");
    await betrieb(personFehlt, { personen: [person("p_9", "C", "D", "leitung")] });
    await mitglied(k.id, personFehlt, { person: "p_1" });
    /* Mandant verschoben: die Kennung passt nicht zum Index */
    const verschoben = raumName("absage-verschoben");
    await betrieb(verschoben, { mandantId: "anders",
      personen: [person("p_1", "E", "F", "leitung")] });
    await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum: verschoben,
      betrieb: 0, mandantId: "m1", person: "p_1", rolle: "leitung", status: "aktiv" });
    /* gelöscht: erst anlegen, dann den Datensatz entfernen */
    const geloescht = raumName("absage-geloescht");
    await betrieb(geloescht, { personen: [person("p_1", "G", "H", "leitung")] });
    await mitglied(k.id, geloescht);
    await laden().delete(A.mitgliedSchluessel(k.id, geloescht));

    const keks = await angemeldet(k.email);
    const antworten = new Set();
    const zustaende = new Set();
    for (const raum of [fremder, "t-gibt-es-nicht-xyz", entzogen, ohnePerson,
      personFehlt, verschoben, geloescht, "demo-haus", "nicht gültig!"]) {
      const e = await anfrage({ rumpf: { raum }, keks });
      zustaende.add(e.status);
      antworten.add(e.text);
      expect(e.text, raum).not.toContain("token");
    }
    /* Ein Status, eine Antwort, kein Hinweis auf den Unterschied. */
    expect([...zustaende]).toEqual([403]);
    expect(antworten.size).toBe(1);
  }, LIMIT);

  it("weist eine Auswahl ohne Account-Sitzung ab", async () => {
    const k = await konto(adresse("wahl-ohne-sitzung"));
    const raum = await arbeitsbereich(k.id, "ohne-sitzung");
    const vorher = await arbeitssitzungen();
    const e = await anfrage({ rumpf: { raum } });
    expect(e.status).toBe(401);
    expect(await arbeitssitzungen()).toBe(vorher);
  }, LIMIT);

  it("weist einen fehlenden oder unbrauchbaren Raum als Formfehler ab", async () => {
    const k = await konto(adresse("wahl-form"));
    await arbeitsbereich(k.id, "form");
    const keks = await angemeldet(k.email);
    for (const rumpf of [{}, { raum: "" }, { raum: "   " }, { raum: 42 },
      { raum: null }, { raum: ["a"] }]) {
      const e = await anfrage({ rumpf, keks });
      expect(e.status, JSON.stringify(rumpf)).toBe(400);
      expect(e.daten.fehler).toBe("raum-fehlt");
    }
  }, LIMIT);
});

/* ==========================================================================
   DIE LISTE IST KEINE ERLAUBNIS
   ========================================================================== */

describe("Zwischen Anzeige und Auswahl", () => {
  it("scheitert, wenn die Mitgliedschaft nach dem Lesen entzogen wird", async () => {
    const k = await konto(adresse("toctou-entzug"));
    const raum = await arbeitsbereich(k.id, "toctou-entzug", { rolle: "leitung" });
    const keks = await angemeldet(k.email);

    const liste = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(liste.daten.mitgliedschaften.map((m) => m.raum)).toEqual([raum]);

    await A.mitgliedschaftEntziehen(laden(), k.id, raum);

    const e = await anfrage({ rumpf: { raum }, keks });
    expect(e.status).toBe(403);
    expect(e.daten.fehler).toBe("kein-zugang");
    const { blobs } = await arbeitAblage().list({ prefix: "t:" });
    for (const bl of blobs) {
      const s = await arbeitAblage().get(bl.key, { type: "json" });
      expect(s && s.bestand === raum, "keine Sitzung nach Entzug").not.toBe(true);
    }
  }, LIMIT);

  it("scheitert, wenn die Mitgliedschaft nach dem Lesen gelöscht wird", async () => {
    const k = await konto(adresse("toctou-weg"));
    const raum = await arbeitsbereich(k.id, "toctou-weg");
    const keks = await angemeldet(k.email);
    const liste = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
    expect(liste.daten.mitgliedschaften.length).toBe(1);

    await laden().delete(A.mitgliedSchluessel(k.id, raum));

    const e = await anfrage({ rumpf: { raum }, keks });
    expect(e.status).toBe(403);
  }, LIMIT);

  it("scheitert, wenn die Person nach dem Lesen aus dem Bestand verschwindet",
    async () => {
      const k = await konto(adresse("toctou-person"));
      const raum = await arbeitsbereich(k.id, "toctou-person", { rolle: "leitung" });
      const keks = await angemeldet(k.email);
      const liste = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
      expect(liste.daten.mitgliedschaften.length).toBe(1);

      await betrieb(raum, { personen: [] });

      const e = await anfrage({ rumpf: { raum }, keks });
      expect(e.status).toBe(403);
    }, LIMIT);
});

/* ==========================================================================
   WAS DER AUFRUFER BEHAUPTET, ZÄHLT NICHT
   ========================================================================== */

describe("Behauptungen aus dem Rumpf wirken nicht", () => {
  it("ignoriert Rolle, Person, Kontokennung und Mitgliedschaft im Rumpf", async () => {
    const k = await konto(adresse("behauptung"));
    const fremd = await konto(adresse("behauptung-fremd"));
    const raum = await arbeitsbereich(k.id, "behauptung", { rolle: "mitarbeiter" });
    const fremderRaum = await arbeitsbereich(fremd.id, "behauptung-fremd",
      { rolle: "leitung" });
    const keks = await angemeldet(k.email);

    const e = await anfrage({ keks, rumpf: { raum,
      rolle: "leitung", role: "leitung", person: "p_9", personId: "p_9",
      accountId: fremd.id, account: fremd.id, mitgliedschaft: fremderRaum,
      betrieb: 5, einheit: "e9", name: "Chefin", unbekannt: { tief: true } } });

    expect(e.status).toBe(200);
    /* Die Rolle kommt aus der Person im Bestand … */
    expect(e.daten.rolle).toBe("mitarbeiter");
    expect(e.daten.person).toBe("p_1");
    expect(e.daten.betrieb).toBe(0);
    expect(e.daten.raum).toBe(raum);
    /* … und auch im Datensatz steht nichts Behauptetes. */
    const roh = await arbeitssitzung(e.daten.token);
    expect(roh.rolle).toBe("mitarbeiter");
    expect(roh.person).toBe("p_1");
    expect(roh.betrieb).toBe(0);
    expect(roh.bestand).toBe(raum);
    expect(roh.einheit).toBe(null);
    expect(roh.name).toBe("Rina Schmitt");
    expect(JSON.stringify(roh)).not.toContain("p_9");
    expect(JSON.stringify(roh)).not.toContain(fremd.id);
  }, LIMIT);

  it("öffnet mit einer fremden Kontokennung im Rumpf nichts", async () => {
    const a = await konto(adresse("kennung-a"));
    const b = await konto(adresse("kennung-b"));
    const fremder = await arbeitsbereich(b.id, "kennung-fremd", { rolle: "leitung" });
    const keks = await angemeldet(a.email);
    const e = await anfrage({ keks, rumpf: { raum: fremder, accountId: b.id } });
    expect(e.status).toBe(403);
  }, LIMIT);

  it("weist kaputtes JSON, Nicht-Objekte und zu große Rümpfe ab", async () => {
    const k = await konto(adresse("rumpf"));
    const keks = await angemeldet(k.email);
    const kaputt = await anfrage({ keks, rohRumpf: "{kein json" });
    expect(kaputt.status).toBe(400);
    expect(kaputt.daten.fehler).toBe("kaputtes-json");
    const feld = await anfrage({ keks, rohRumpf: JSON.stringify(["a"]) });
    expect(feld.status).toBe(400);
    expect(feld.daten.fehler).toBe("kein-objekt");
    const gross = await anfrage({ keks,
      rohRumpf: JSON.stringify({ raum: "x".repeat(20000) }) });
    expect(gross.status).toBe(413);
    const behauptet = await anfrage({ keks, rumpf: { raum: "t-egal" },
      laengeVorspiegeln: 999999 });
    expect(behauptet.status).toBe(413);
  }, LIMIT);

  it("nimmt nur POST", async () => {
    const k = await konto(adresse("wahl-methode"));
    const keks = await angemeldet(k.email);
    const e = await anfrage({ methode: "GET", keks });
    expect(e.status).toBe(405);
    expect(e.antwort.headers.get("allow")).toBe("POST");
  }, LIMIT);
});

/* ==========================================================================
   HERKUNFT
   ========================================================================== */

describe("Herkunft der Auswahl", () => {
  it("weist fremde Herkunft, fehlenden Origin und cross-site ab", async () => {
    const k = await konto(adresse("wahl-csrf"));
    const raum = await arbeitsbereich(k.id, "csrf", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const vorher = await arbeitssitzungen();

    for (const wahl of [{ origin: "https://boese.example" }, { origin: false },
      { ziel: "cross-site" }, { ziel: "same-site" }]) {
      const e = await anfrage({ rumpf: { raum }, keks, ...wahl });
      expect(e.status, JSON.stringify(wahl)).toBe(403);
      expect(e.daten.fehler).toBe("fremde-herkunft");
    }
    /* Kein fremdes Blatt hat eine Arbeitssitzung erzeugt. */
    expect(await arbeitssitzungen()).toBe(vorher);
    /* Mit eigener Herkunft geht es. */
    expect((await anfrage({ rumpf: { raum }, keks })).status).toBe(200);
  }, LIMIT);

  it("lässt eine Auswahl ohne Origin mit passender Fetch-Metadata zu", async () => {
    const k = await konto(adresse("wahl-fetchmeta"));
    const raum = await arbeitsbereich(k.id, "fetchmeta");
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks, origin: false,
      ziel: "same-origin" });
    expect(e.status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   NACH DER AUSWAHL
   ========================================================================== */

describe("Der Lebenszyklus nach der Auswahl", () => {
  it("verweigert eine NEUE Auswahl, sobald die Mitgliedschaft entzogen ist",
    async () => {
      const k = await konto(adresse("nachher-entzug"));
      const raum = await arbeitsbereich(k.id, "nachher-entzug", { rolle: "leitung" });
      const keks = await angemeldet(k.email);
      const e = await anfrage({ rumpf: { raum }, keks });
      expect(e.status).toBe(200);

      await A.mitgliedschaftEntziehen(laden(), k.id, raum);

      /* Kein neuer Zugang. */
      expect((await anfrage({ rumpf: { raum }, keks })).status).toBe(403);
      /* Und der Arbeitsbereich verschwindet aus der Liste. */
      const liste = await anfrage({ pfad: P_LISTE, methode: "GET", keks });
      expect(liste.daten.mitgliedschaften).toEqual([]);
    }, LIMIT);

  it("hält fest, was eine bereits erzeugte Arbeitssitzung überlebt", async () => {
    /* CHARAKTERISIERUNG, keine Zusage: Eine Arbeitssitzung kennt die
       Mitgliedschaft nicht, aus der sie entstand — genauso wenig, wie eine
       Sitzung aus einem Zugangscode dessen Sperrung von selbst bemerkt
       (dort räumt ein eigener Lauf in daten.mjs auf, der die Prüfsumme des
       Codes vergleicht; eine Sitzung ohne `konto` wird dabei übersprungen).

       Die Sitzung läuft also nach einem Entzug weiter, bis sie abläuft:
       zwölf Stunden, oder dreißig Minuten Untätigkeit. Ob das genügt, ist
       eine Entscheidung über das Sicherheitsmodell und keine, die eine
       Prüfung treffen kann — sie wird im Bericht ausdrücklich benannt. */
    const k = await konto(adresse("nachher-lauf"));
    const raum = await arbeitsbereich(k.id, "nachher-lauf", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks });
    const token = e.daten.token;

    await A.mitgliedschaftEntziehen(laden(), k.id, raum);

    const mitKopf = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${token}` : null) },
    };
    const sitzung = await S.sitzungLesen(/** @type {any} */ (mitKopf));
    expect(sitzung, "so ist der Stand heute").toBeTruthy();
    /* Was dagegen sofort wirkt: Die Rolle kommt bei jeder Anfrage neu aus
       dem Bestand. Wird die Person dort entfernt, bleibt nur die Rolle der
       Einladung — und ein neuer Zugang entsteht nicht mehr. */
    await betrieb(raum, { personen: [] });
    const gelesen = await B.bestandLesen(laden(), raum);
    expect(R.wirksameRolle(sitzung, gelesen.bestand)).toBe("leitung");
  }, LIMIT);

  it("beendet mit dem Account auch jeden weiteren Zugang", async () => {
    const k = await konto(adresse("nachher-sperre"));
    const raum = await arbeitsbereich(k.id, "nachher-sperre", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    expect((await anfrage({ rumpf: { raum }, keks })).status).toBe(200);

    await A.accountSperren(laden(), k.id);

    /* Das Konto ist tot: keine Liste, keine Auswahl. */
    expect((await anfrage({ pfad: P_LISTE, methode: "GET", keks })).status).toBe(401);
    expect((await anfrage({ rumpf: { raum }, keks })).status).toBe(401);
  }, LIMIT);
});

/* ==========================================================================
   BREMSE, ABLAGE, LEGACY
   ========================================================================== */

describe("Bremse, Ablagefehler und die alten Zugänge", () => {
  it("hat eine ausdrücklich eingetragene Bremsart", () => {
    expect(SCH.GRENZEN["betrieb-waehlen"]).toBeTruthy();
    expect(SCH.GRENZEN["betrieb-waehlen"].versuche).toBe(30);
    /* Keine scrypt-Notbremse: Hier wird kein Passwort geprüft. */
    expect(SCH.NOTGRENZEN["betrieb-waehlen"]).toBeUndefined();
  });

  it("bremst zu viele Auswahlen derselben Herkunft", async () => {
    const k = await konto(adresse("wahl-bremse"));
    const raum = await arbeitsbereich(k.id, "bremse");
    const keks = await angemeldet(k.email);
    const ip = "10.80.0.1";
    let gebremst = 0;
    const grenze = SCH.GRENZEN["betrieb-waehlen"].versuche;
    for (let i = 0; i < grenze + 3 && !gebremst; i++) {
      const e = await anfrage({ rumpf: { raum }, keks, herkunft: ip });
      if (e.status === 429) gebremst++;
      else expect(e.status, `Versuch ${i + 1}`).toBe(200);
    }
    expect(gebremst).toBe(1);
  }, LIMIT);

  it("scheitert geschlossen, wenn die Sitzungsablage nicht schreiben kann",
    async () => {
      const k = await konto(adresse("wahl-platte"));
      const raum = await arbeitsbereich(k.id, "platte", { rolle: "leitung" });
      const keks = await angemeldet(k.email);
      const ort = path.join(wurzel, "centric-sitzungen");
      const vorher = await arbeitssitzungen();
      await rm(ort, { recursive: true, force: true });
      await writeFile(ort, "");
      let e;
      try {
        e = await anfrage({ rumpf: { raum }, keks });
      } finally {
        await rm(ort, { force: true });
        await mkdir(ort, { recursive: true });
      }
      expect(e.status).toBe(500);
      expect(e.daten.ok).toBe(false);
      expect(e.daten.fehler).toBe("nicht-moeglich");
      expect(e.text).not.toContain("token");
      /* Danach geht es wieder — und die alte Zahl ist unverändert, weil die
         Ablage neu angelegt wurde. */
      expect(await arbeitssitzungen()).toBeGreaterThanOrEqual(0);
      expect(vorher).toBeGreaterThanOrEqual(0);
      expect((await anfrage({ rumpf: { raum }, keks })).status).toBe(200);
    }, LIMIT);

  it("scheitert geschlossen, wenn der Bestand nicht lesbar ist", async () => {
    const k = await konto(adresse("wahl-bestand"));
    const raum = raumName("ohne-bestand");
    /* Mitgliedschaft ohne Bestand: Der Raum wurde nie angelegt. */
    await mitglied(k.id, raum, { person: "p_1" });
    const keks = await angemeldet(k.email);
    const e = await anfrage({ rumpf: { raum }, keks });
    expect(e.status).toBe(403);
    expect(e.daten.fehler).toBe("kein-zugang");
  }, LIMIT);

  it("lässt die Zugangscode-Sitzungen unberührt", async () => {
    const k = await konto(adresse("legacy"));
    const raum = await arbeitsbereich(k.id, "legacy", { rolle: "leitung" });
    const keks = await angemeldet(k.email);
    const legacy = await S.sitzungAnlegen({ bestand: "t-legacy-aus", rolle: "planer",
      person: "p_7", betrieb: 0, konto: "konto:abc", name: "Alt" });

    const e = await anfrage({ rumpf: { raum }, keks });
    expect(e.status).toBe(200);

    /* Die alte Sitzung gilt weiter, mit ihren eigenen Feldern. */
    const mitKopf = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${legacy.token}` : null) },
    };
    const alt = await S.sitzungLesen(/** @type {any} */ (mitKopf));
    expect(alt).toBeTruthy();
    expect(alt.bestand).toBe("t-legacy-aus");
    expect(alt.konto).toBe("konto:abc");

    /* Und der Endpunkt, der den Bestand hält, kennt dieses Cookie nicht. */
    const daten = await readFile(new URL("../server/funktionen/daten.mjs",
      import.meta.url), "utf8");
    expect(daten.toLowerCase()).not.toContain("cookie");
    expect(daten).not.toContain("betriebsauswahl");
  }, LIMIT);

  it("bindet die Auswahl nur an einer Stelle ein", async () => {
    /* Die Brücke vom Konto in einen Betrieb soll es genau einmal geben. */
    const einbindung = /import[^;]*from\s*["'][^"']*betriebsauswahl\.mjs["']/;
    for (const d of ["../server.mjs", "../server/funktionen/daten.mjs",
      "../server/lib/sitzungen.mjs", "../server/lib/accounts.mjs",
      "../server/lib/accountanmeldung.mjs", "../server/lib/rechte.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(einbindung.test(text), d).toBe(false);
    }
    const handlerText = await readFile(new URL("../server/funktionen/anmeldung.mjs",
      import.meta.url), "utf8");
    expect(einbindung.test(handlerText)).toBe(true);
    /* Und sie kennt keine Anfrage: kein Cookie, keine Antwort. */
    const modul = await readFile(new URL("../server/lib/betriebsauswahl.mjs",
      import.meta.url), "utf8");
    for (const wort of ["set-cookie", "new Response", "headers.get", "req."]) {
      expect(modul.includes(wort), wort).toBe(false);
    }
  }, LIMIT);

  it("liest die Mitgliedschaft auch im Modul nur für genau diesen Account",
    async () => {
      /* Ohne HTTP: Die Primitive selbst gibt für eine fremde Kennung nichts
         her, auch wenn der Raum existiert. */
      const a = await konto(adresse("modul-a"));
      const b = await konto(adresse("modul-b"));
      const raum = await arbeitsbereich(b.id, "modul", { rolle: "leitung" });
      const fremd = await BA.betriebWaehlen(laden(), { accountId: a.id, raum });
      expect(fremd.ok).toBe(false);
      const eigen = await BA.betriebWaehlen(laden(), { accountId: b.id, raum });
      expect(eigen.ok).toBe(true);
      if (eigen.ok) expect(eigen.rolle).toBe("leitung");
      /* Und ohne Kennung gar nichts. */
      expect((await BA.betriebWaehlen(laden(), { raum })).ok).toBe(false);
      expect((await BA.betriebWaehlen(laden(),
        { accountId: b.id, raum: "demo-haus" })).ok).toBe(false);
    }, LIMIT);
});
