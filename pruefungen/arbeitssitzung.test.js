/* ==========================================================================
   DIE BINDUNG EINER ACCOUNT-ARBEITSSITZUNG

   Eine Arbeitssitzung, die aus einem Konto entstand, trägt einen Anker:

     herkunft: { art: "account", accountId, epoche, generation }

   Diese Prüfung hält fest, was daran hängt: Ein Entzug, eine Löschung, eine
   Kontosperre, ein Epochenwechsel, ein Personenwechsel — alles wirkt beim
   NÄCHSTEN Zugriff, nicht erst nach dreißig Minuten oder zwölf Stunden. Und
   was NICHT daran hängt: eine Rollenänderung. Die ändert Rechte, nicht
   Gültigkeit.

   Geprüft werden alle vier produktiven Zugriffspfade mit demselben Merkmal
   — daten, kalender, lage, zustellung — und die Gegenprobe: Eine Sitzung
   aus einem Zugangscode verursacht dabei null Zugriffe auf Account,
   Mitgliedschaft oder Generationslauf.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, getStore, A, P, S, B, R, AS, AC, konten;
let daten, kalender, lage, zustellung;

const LIMIT = 40000;
const GUT = "Nordwind und Sonne 1846";
const WIRT = "127.0.0.1:3000";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-arbeitssitzung-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  S = await import("../server/lib/sitzungen.mjs");
  B = await import("../server/lib/bestand.mjs");
  R = await import("../server/lib/rechte.mjs");
  AS = await import("../server/lib/arbeitssitzung.mjs");
  AC = await import("../server/lib/accountsitzungen.mjs");
  konten = await import("../server/lib/betriebsauswahl.mjs");
  daten = (await import("../server/funktionen/daten.mjs")).default;
  kalender = (await import("../server/funktionen/kalender.mjs")).default;
  lage = (await import("../server/funktionen/lage.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const arbeitAblage = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/* Die Bremse lebt in der Ablage und im Prozessspeicher. */
beforeEach(async () => {
  const s = getStore({ name: "centric-takt", consistency: "strong" });
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let zaehler = 0;
const adresse = (was) => `${was}-${++zaehler}@example.org`;
const raumName = (was) => `t-arb-${was}-${++zaehler}`;
const eigeneHerkunft = () =>
  `10.9.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

/** Eine Anfrage an einen der vier Pfade, mit Arbeitsmerkmal im Kopf. */
async function anfrage(handler, pfad, { token = null, methode = "GET",
  rumpf = null } = {}) {
  const kopf = { host: WIRT, "x-forwarded-for": eigeneHerkunft() };
  if (token) kopf.authorization = `Bearer ${token}`;
  if (methode !== "GET" && methode !== "HEAD") kopf["content-type"] = "application/json";
  const req = new Request(`http://${WIRT}${pfad}`, {
    method: methode, headers: kopf,
    ...(methode === "GET" || methode === "HEAD" ? {} : { body: JSON.stringify(rumpf || {}) }),
  });
  const antwort = await handler(req, {});
  let daten2 = null;
  try { daten2 = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { status: antwort.status, daten: daten2 };
}

const person = (id, vorname, nachname, rolle) => ({
  id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE",
});

async function betrieb(raum, { mandantId = "m1", name = "Haus Probe",
  personen = [], weitere = [] } = {}) {
  const mandanten = [{ id: mandantId, name, personen,
    einheiten: [{ id: "e1", name: "Wohnbereich 1" }] }, ...weitere];
  const e = await B.bestandSchreiben(laden(), raum, { version: 5, mandanten },
    { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

async function konto(email) {
  const e = await A.accountAnlegen(laden(), { email });
  expect(e.ok).toBe(true);
  await A.emailBestaetigen(laden(), e.account.id);
  const g = await A.passwortSetzen(laden(), e.account.id, await P.passwortAblegen(GUT));
  expect(g.ok).toBe(true);
  return g.account;
}

/** Die Anmeldung, an der eine Arbeitssitzung hängt: eine echte Account-Sitzung. */
async function kontoSitzung(accountId) {
  const konto = await A.accountLesenPerId(laden(), accountId);
  const s = await AC.accountSitzungAnlegen({ accountId, epoche: konto.epoche });
  if (!s.ok) throw new Error("Account-Sitzung nicht angelegt");
  return { id: AC.accountSitzungsId(s.token), bis: s.gueltigBis, token: s.token };
}

/** Einen Betrieb wählen wie der Handler: mit der Anmeldung, an der die Arbeit hängt. */
const waehle = async (accountId, raum, extra = {}) =>
  konten.betriebWaehlen(laden(), { accountId, raum,
    kontoSitzung: await kontoSitzung(accountId), ...extra });

/** Konto, Raum, Person, Mitgliedschaft, Auswahl — und das Arbeitsmerkmal. */
async function arbeitsbereich(was, { rolle = "leitung", email = null,
  accountId = null, mandantId = "m1" } = {}) {
  const k = accountId ? { id: accountId } : await konto(email || adresse(was));
  const raum = raumName(was);
  await betrieb(raum, { mandantId, personen: [person("p_1", "Rina", "Schmitt", rolle)] });
  const m = await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum, betrieb: 0,
    mandantId, person: "p_1", rolle, status: "aktiv" });
  expect(m.ok, JSON.stringify(m)).toBe(true);
  const wahl = await waehle(k.id, raum);
  expect(wahl.ok, JSON.stringify(wahl)).toBe(true);
  if (!wahl.ok) throw new Error("Auswahl gescheitert");
  return { konto: k, raum, token: wahl.token, rolle: wahl.rolle };
}

/** Eine Sitzung der alten Art: Zugangscode, kein Anker. */
const legacySitzung = (raum = "t-arb-legacy") =>
  S.sitzungAnlegen({ bestand: raum, rolle: "leitung", person: "p_1", betrieb: 0,
    konto: "konto:abc", name: "Alt" });

/** Der abgelegte Datensatz zu einem Arbeitsmerkmal. */
const satz = (token) => arbeitAblage().get(`t:${hash(token)}`, { type: "json" });

/** Die vier produktiven Pfade, jeder mit einem Aufruf, der eine gültige
    Sitzung braucht. Erwartet wird: vorher nicht 401, nachher 401. */
const PFADE = [
  { name: "daten", ruf: (t) => anfrage(daten, "/api/bestand", { token: t }) },
  { name: "kalender", ruf: (t) => anfrage(kalender, "/kalender/einrichten",
    { token: t, methode: "POST", rumpf: { personId: "p_1" } }) },
  { name: "lage", ruf: (t) => anfrage(lage, "/lage", { token: t }) },
  { name: "zustellung", ruf: (t) => anfrage(zustellung, "/zustellung/anmelden",
    { token: t, methode: "POST", rumpf: { endpunkt: "https://example.org/p" } }) },
];

/* ==========================================================================
   DER ANKER UND SEINE FORM
   ========================================================================== */

describe("Der Herkunftsanker", () => {
  it("entsteht bei der Auswahl mit genau vier serverseitigen Werten", async () => {
    const { konto: k, token } = await arbeitsbereich("anker");
    const roh = await satz(token);
    expect(Object.keys(roh.herkunft).sort())
      .toEqual(["accountId", "art", "epoche", "generation", "sitzung"]);
    /* Die Anmeldung, an der die Arbeit hängt: eine Prüfsumme, nie ein Merkmal. */
    expect(roh.herkunft.sitzung).toMatch(/^[0-9a-f]{64}$/);
    expect(roh.herkunft.art).toBe("account");
    expect(roh.herkunft.accountId).toBe(k.id);
    expect(roh.herkunft.generation).toBe(1);
    expect(roh.herkunft.epoche).toBe((await A.accountLesenPerId(laden(), k.id)).epoche);
    /* Keine Rolle im Anker — sie ist kein Widerrufsanker. */
    expect(JSON.stringify(roh.herkunft)).not.toContain("leitung");
    expect(Object.keys(roh.herkunft)).not.toContain("rolle");
  }, LIMIT);

  it("erklärt eine gültige Bindung für gültig", async () => {
    const { token } = await arbeitsbereich("gueltig");
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e).toEqual({ ok: true, art: "account" });
  }, LIMIT);

  it("lässt eine Sitzung ohne Anker durch", async () => {
    const { token } = await legacySitzung();
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e).toEqual({ ok: true, art: "legacy" });
  }, LIMIT);

  it("weist jede unbrauchbare Herkunft ab, statt sie für alt zu nehmen",
    async () => {
      const { konto: k, raum } = await arbeitsbereich("kaputt");
      const gut = { art: "account", accountId: k.id, epoche: 2, generation: 1 };
      for (const h of [null, {}, { art: "irgendwas" }, "account", 42, [],
        { ...gut, art: "sonstwas" }, { ...gut, art: undefined },
        { ...gut, accountId: "" }, { ...gut, accountId: 7 },
        { ...gut, epoche: undefined }, { ...gut, epoche: 0 }, { ...gut, epoche: "2" },
        { ...gut, generation: undefined }, { ...gut, generation: 0 },
        { ...gut, generation: 1.5 }]) {
        const e = await AS.arbeitssitzungPruefen(laden(),
          { bestand: raum, person: "p_1", betrieb: 0, herkunft: h });
        expect(e.ok, JSON.stringify(h)).toBe(false);
        if (!e.ok) expect(e.grund).toBe("herkunft");
      }
    }, LIMIT);

  it("weist eine Herkunft mit fremder Kontokennung ab", async () => {
    const { raum } = await arbeitsbereich("fremdekennung");
    /* Mit einer echten Anmeldung, aber einer Kontokennung, die es nicht gibt:
       Die Anmeldung gehört einem anderen Konto — abgewiesen, noch bevor der
       Account gelesen wird. */
    const echt = await kontoSitzung((await konto(adresse("fremdekennung-a"))).id);
    const e = await AS.arbeitssitzungPruefen(laden(), { bestand: raum, person: "p_1",
      betrieb: 0, herkunft: { art: "account", accountId: "a_gibtesnicht",
        epoche: 2, generation: 1, sitzung: echt.id } });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("konto-sitzung");

    /* Und ohne Anmeldung im Anker: keine gültige Form, nicht „alt". */
    const ohne = await AS.arbeitssitzungPruefen(laden(), { bestand: raum, person: "p_1",
      betrieb: 0, herkunft: { art: "account", accountId: "a_gibtesnicht",
        epoche: 2, generation: 1 } });
    expect(ohne.ok).toBe(false);
    if (!ohne.ok) expect(ohne.grund).toBe("herkunft");
  }, LIMIT);

  it("weist eine Sitzung ohne Raum oder ohne Person ab", async () => {
    const { konto: k } = await arbeitsbereich("ohneraum");
    const anker = { art: "account", accountId: k.id, epoche: 2, generation: 1 };
    const ohneRaum = await AS.arbeitssitzungPruefen(laden(),
      { person: "p_1", betrieb: 0, herkunft: anker });
    expect(ohneRaum.ok).toBe(false);
    const ohnePerson = await AS.arbeitssitzungPruefen(laden(),
      { bestand: "t-arb-irgendwas", betrieb: 0, herkunft: anker });
    expect(ohnePerson.ok).toBe(false);
  }, LIMIT);
});

/* ==========================================================================
   WIDERRUF
   ========================================================================== */

describe("Ein Entzug wirkt sofort", () => {
  it("macht die bestehende Sitzung beim nächsten Zugriff unbrauchbar", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("entzug");
    /* Vorher gültig … */
    expect((await AS.arbeitssitzungPruefen(laden(), await satz(token))).ok).toBe(true);

    await A.mitgliedschaftEntziehen(laden(), k.id, raum);

    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token),
      { merkmal: token });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("mitglied-status");
  }, LIMIT);

  it("macht eine gelöschte Mitgliedschaft unbrauchbar", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("geloescht");
    await laden().delete(A.mitgliedSchluessel(k.id, raum));
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("mitglied-fehlt");
  }, LIMIT);

  it("lässt T1 nach einer Wiederaufnahme ungültig und T2 gelten", async () => {
    /* Der zentrale Beweis für 38B und 38C zusammen. */
    const { konto: k, raum, token: T1 } = await arbeitsbereich("wiederaufnahme");
    const satz1 = await satz(T1);
    expect(satz1.herkunft.generation).toBe(1);

    await A.mitgliedschaftEntziehen(laden(), k.id, raum);
    await laden().delete(A.mitgliedSchluessel(k.id, raum));
    const neu = await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum,
      betrieb: 0, mandantId: "m1", person: "p_1", rolle: "leitung", status: "aktiv" });
    expect(neu.ok).toBe(true);
    if (!neu.ok) return;
    expect(neu.mitgliedschaft.generation).toBe(2);

    const wahl = await waehle(k.id, raum);
    expect(wahl.ok).toBe(true);
    if (!wahl.ok) return;
    const T2 = wahl.token;
    expect((await satz(T2)).herkunft.generation).toBe(2);

    /* T1 bleibt tot — obwohl es die Mitgliedschaft wieder gibt. */
    const alt = await AS.arbeitssitzungPruefen(laden(), satz1);
    expect(alt.ok).toBe(false);
    if (!alt.ok) expect(alt.grund).toBe("generation-sitzung");
    /* T2 gilt. */
    expect((await AS.arbeitssitzungPruefen(laden(), await satz(T2))).ok).toBe(true);
  }, LIMIT);

  it("macht eine Sitzung bei gesperrtem Account unbrauchbar", async () => {
    const { konto: k, token } = await arbeitsbereich("sperre");
    await A.accountSperren(laden(), k.id);
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("account-status");
  }, LIMIT);

  it("macht eine Sitzung bei neuer Account-Epoche unbrauchbar", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("epoche");
    const vorher = (await A.accountLesenPerId(laden(), k.id)).epoche;
    expect((await satz(token)).herkunft.epoche).toBe(vorher);

    await A.epocheErhoehen(laden(), k.id);

    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("epoche");
    /* Eine neue Auswahl bindet die neue Epoche und gilt. */
    const wahl = await waehle(k.id, raum);
    expect(wahl.ok).toBe(true);
    if (!wahl.ok) return;
    expect((await satz(wahl.token)).herkunft.epoche).toBe(vorher + 1);
    expect((await AS.arbeitssitzungPruefen(laden(), await satz(wahl.token))).ok)
      .toBe(true);
  }, LIMIT);

  it("widerruft nur den betroffenen Arbeitsbereich", async () => {
    const k = await konto(adresse("zweiraeume"));
    const alpha = await arbeitsbereich("zwei-alpha", { accountId: k.id });
    const beta = await arbeitsbereich("zwei-beta", { accountId: k.id });

    await A.mitgliedschaftEntziehen(laden(), k.id, alpha.raum);

    expect((await AS.arbeitssitzungPruefen(laden(), await satz(alpha.token))).ok)
      .toBe(false);
    expect((await AS.arbeitssitzungPruefen(laden(), await satz(beta.token))).ok)
      .toBe(true);
  }, LIMIT);

  it("widerruft mit der Kontosperre beide Arbeitsbereiche", async () => {
    const k = await konto(adresse("sperre-zwei"));
    const alpha = await arbeitsbereich("sperre-alpha", { accountId: k.id });
    const beta = await arbeitsbereich("sperre-beta", { accountId: k.id });

    await A.accountSperren(laden(), k.id);

    expect((await AS.arbeitssitzungPruefen(laden(), await satz(alpha.token))).ok)
      .toBe(false);
    expect((await AS.arbeitssitzungPruefen(laden(), await satz(beta.token))).ok)
      .toBe(false);
  }, LIMIT);

  it("räumt eine widerrufene Sitzung weg, hängt die Absage aber nicht daran",
    async () => {
      const { konto: k, raum, token } = await arbeitsbereich("wegraeumen");
      await A.mitgliedschaftEntziehen(laden(), k.id, raum);
      expect(await satz(token)).toBeTruthy();

      const e = await AS.arbeitssitzungPruefen(laden(), await satz(token),
        { merkmal: token });
      expect(e.ok).toBe(false);
      /* Serverseitig weg — der zweite Zugriff findet schon technisch nichts. */
      expect(await satz(token)).toBe(null);

      /* Ohne Merkmal bleibt der Datensatz liegen, und die Absage ist
         dieselbe: Die Gültigkeit hängt nicht am Löschen. */
      const zweite = await arbeitsbereich("wegraeumen2");
      await A.mitgliedschaftEntziehen(laden(), zweite.konto.id, zweite.raum);
      const ohne = await AS.arbeitssitzungPruefen(laden(), await satz(zweite.token));
      expect(ohne.ok).toBe(false);
      expect(await satz(zweite.token)).toBeTruthy();
    }, LIMIT);
});

/* ==========================================================================
   GENERATION, PERSON, MANDANT
   ========================================================================== */

describe("Generation, Person und Mandant", () => {
  it("weist eine Sitzung ohne lesbaren Lauf ab", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("lauf-weg");
    await laden().delete(A.mitgliedlaufSchluessel(k.id, raum));
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("lauf");
  }, LIMIT);

  it("weist einen kaputten Lauf ab", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("lauf-kaputt");
    await laden().setJSON(A.mitgliedlaufSchluessel(k.id, raum),
      { accountId: k.id, raum, generation: "unsinn" });
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("lauf");
  }, LIMIT);

  it("weist eine Mitgliedschaft ohne Generation ab", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("ohne-generation");
    const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
    const ohne = { ...m };
    delete ohne.generation;
    await laden().setJSON(A.mitgliedSchluessel(k.id, raum), ohne);
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("generation-mitglied");
  }, LIMIT);

  it("weist eine Sitzung mit veralteter Generation im Anker ab", async () => {
    const { konto: k, raum, token } = await arbeitsbereich("alte-generation");
    /* Die Beziehung geht weiter, die Sitzung bleibt bei 1. */
    const roh = await satz(token);
    await arbeitAblage().setJSON(`t:${hash(token)}`,
      { ...roh, herkunft: { ...roh.herkunft, generation: 99 } });
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("generation-sitzung");
    expect((await A.mitgliedlaufLesen(laden(), k.id, raum)).ok).toBe(true);
  }, LIMIT);

  it("weist eine Sitzung ab, wenn die Mitgliedschaft auf eine andere Person zeigt",
    async () => {
      const { konto: k, raum, token } = await arbeitsbereich("person-wechsel");
      const m = await A.mitgliedschaftLesen(laden(), k.id, raum);
      await laden().setJSON(A.mitgliedSchluessel(k.id, raum), { ...m, person: "p_2" });
      const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
      expect(e.ok).toBe(false);
      if (!e.ok) expect(e.grund).toBe("person-gewechselt");
    }, LIMIT);

  it("weist eine Sitzung ab, wenn die Person aus dem Bestand verschwindet",
    async () => {
      const { raum, token } = await arbeitsbereich("person-weg");
      await betrieb(raum, { personen: [] });
      const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
      expect(e.ok).toBe(false);
      if (!e.ok) expect(e.grund).toBe("person-fehlt");
    }, LIMIT);

  it("lässt eine Rollenänderung die Sitzung gelten und die Rechte wandern",
    async () => {
      /* Die Trennung, auf die es ankommt: Identität und Berechtigung binden
         die Sitzung, die Rolle bestimmt die Rechte. */
      const { raum, token } = await arbeitsbereich("rollenwechsel",
        { rolle: "leitung" });
      const vorher = await B.bestandLesen(laden(), raum);
      expect(R.wirksameRolle(await satz(token), vorher.bestand)).toBe("leitung");

      await betrieb(raum, { personen: [person("p_1", "Rina", "Schmitt", "mitarbeiter")] });

      /* Gültig bleibt sie … */
      expect((await AS.arbeitssitzungPruefen(laden(), await satz(token))).ok).toBe(true);
      /* … aber die Rechte sind die der neuen Rolle. */
      const nachher = await B.bestandLesen(laden(), raum);
      expect(R.wirksameRolle(await satz(token), nachher.bestand)).toBe("mitarbeiter");
      expect(R.schreibumfang(R.wirksameRolle(await satz(token), nachher.bestand)))
        .toBe(R.SCHREIBEN_EIGENES);
    }, LIMIT);

  it("weist eine Sitzung ab, wenn der Mandantenindex auf einen anderen zeigt",
    async () => {
      const { konto: k, raum, token } = await arbeitsbereich("mandant-verschoben");
      /* Ein zweiter Mandant wird vorangestellt: Der Index 0 der Sitzung zeigt
         jetzt auf ein fremdes Haus. */
      await B.bestandSchreiben(laden(), raum, {
        version: 5,
        mandanten: [
          { id: "m-fremd", name: "Fremdes Haus", personen: [person("p_1", "X", "Y", "leitung")],
            einheiten: [] },
          { id: "m1", name: "Haus Probe", personen: [person("p_1", "Rina", "Schmitt", "leitung")],
            einheiten: [{ id: "e1", name: "WB1" }] },
        ],
      }, { durch: "Pruefung" });

      const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
      expect(e.ok).toBe(false);
      if (!e.ok) expect(e.grund).toBe("mandant-verschoben");
      expect((await A.mitgliedschaftLesen(laden(), k.id, raum)).mandantId).toBe("m1");
    }, LIMIT);

  it("weist eine Sitzung ohne lesbaren Bestand ab", async () => {
    const { raum, token } = await arbeitsbereich("bestand-weg");
    for (const b of (await laden().list({ prefix: `kern:${raum}` })).blobs) {
      await laden().delete(b.key);
    }
    for (const b of (await laden().list({ prefix: `scherbe:${raum}:` })).blobs) {
      await laden().delete(b.key);
    }
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("bestand-fehlt");
  }, LIMIT);
});

/* ==========================================================================
   FEHLER SCHLIESSEN DIE TÜR
   ========================================================================== */

describe("Speicherfehler", () => {
  /** Eine Ablage, deren Lesen für bestimmte Schlüssel wirft. */
  const blind = (muster) => {
    const echt = laden();
    return {
      get: async (schluessel, opts) => {
        if (muster.test(String(schluessel))) throw new Error("Platte kaputt");
        return echt.get(schluessel, opts);
      },
      getWithMetadata: async (schluessel, opts) => {
        if (muster.test(String(schluessel))) throw new Error("Platte kaputt");
        return echt.getWithMetadata(schluessel, opts);
      },
      list: (...a) => echt.list(...a),
      delete: (...a) => echt.delete(...a),
      setJSON: (...a) => echt.setJSON(...a),
    };
  };

  it("weist ab, wenn der Account nicht lesbar ist", async () => {
    const { token } = await arbeitsbereich("fehler-account");
    const e = await AS.arbeitssitzungPruefen(/** @type {any} */ (blind(/^kontoId:/)),
      await satz(token));
    expect(e.ok).toBe(false);
    /* `accountLesenPerId` gibt bei einem Lesefehler null zurück (es fängt
       selbst) — die tragende Zeile ist deshalb die Prüfung auf „kein Konto",
       nicht ein catch. Genau die wird hier festgehalten. */
    if (!e.ok) expect(e.grund).toBe("account-fehlt");
  }, LIMIT);

  it("weist ab, wenn die Mitgliedschaft nicht lesbar ist", async () => {
    const { token } = await arbeitsbereich("fehler-mitglied");
    const e = await AS.arbeitssitzungPruefen(/** @type {any} */ (blind(/^mitglied:/)),
      await satz(token));
    expect(e.ok).toBe(false);
    /* Auch `mitgliedschaftLesen` fängt selbst und gibt null zurück. */
    if (!e.ok) expect(e.grund).toBe("mitglied-fehlt");
  }, LIMIT);

  it("weist ab, wenn der Lauf nicht lesbar ist", async () => {
    const { token } = await arbeitsbereich("fehler-lauf");
    const e = await AS.arbeitssitzungPruefen(/** @type {any} */ (blind(/^mitgliedlauf:/)),
      await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("lauf");
  }, LIMIT);

  it("weist ab, wenn der Bestand nicht lesbar ist", async () => {
    const { token } = await arbeitsbereich("fehler-bestand");
    const e = await AS.arbeitssitzungPruefen(/** @type {any} */ (blind(/^kern:/)),
      await satz(token));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("bestand-fehlt");
  }, LIMIT);

  it("verweigert bei einem Fehler im durchgegebenen Bestandslader", async () => {
    const { token } = await arbeitsbereich("fehler-lader");
    const e = await AS.arbeitssitzungPruefen(laden(), await satz(token),
      { bestandLader: async () => { throw new Error("kaputt"); } });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("bestand-fehler");
  }, LIMIT);
});

/* ==========================================================================
   ALLE VIER PRODUKTIVEN PFADE
   ========================================================================== */

describe("Jeder produktive Zugriffspfad prüft mit", () => {
  it("verweigert nach einem Entzug an allen vier Pfaden", async () => {
    /* JEDER Pfad bekommt sein eigenes Merkmal. Sonst räumt der erste Pfad
       die Sitzung weg, und die übrigen weisen nur deshalb ab, weil es sie
       technisch nicht mehr gibt — die Prüfung hätte dann nichts bewiesen. */
    const { konto: k, raum } = await arbeitsbereich("pfade");
    const merkmale = {};
    for (const p of PFADE) {
      const wahl = await waehle(k.id, raum);
      expect(wahl.ok).toBe(true);
      if (!wahl.ok) return;
      merkmale[p.name] = wahl.token;
      expect((await p.ruf(wahl.token)).status, `${p.name} vorher`).not.toBe(401);
    }

    await A.mitgliedschaftEntziehen(laden(), k.id, raum);

    for (const p of PFADE) {
      const nach = await p.ruf(merkmale[p.name]);
      expect(nach.status, `${p.name} nach dem Entzug`).toBe(401);
      /* Und die Sitzung ist dabei weggeräumt worden. */
      expect(await satz(merkmale[p.name]), p.name).toBe(null);
    }
  }, LIMIT);

  it("verweigert nach einer Kontosperre an allen vier Pfaden", async () => {
    const { konto: k, raum } = await arbeitsbereich("pfade-sperre");
    const merkmale = {};
    for (const p of PFADE) {
      const wahl = await waehle(k.id, raum);
      if (!wahl.ok) throw new Error("Auswahl gescheitert");
      merkmale[p.name] = wahl.token;
      expect((await p.ruf(wahl.token)).status, `${p.name} vorher`).not.toBe(401);
    }
    await A.accountSperren(laden(), k.id);
    for (const p of PFADE) {
      expect((await p.ruf(merkmale[p.name])).status, p.name).toBe(401);
    }
  }, LIMIT);

  it("verweigert nach einem Epochenwechsel an allen vier Pfaden", async () => {
    const { konto: k, raum } = await arbeitsbereich("pfade-epoche");
    const merkmale = {};
    for (const p of PFADE) {
      const wahl = await waehle(k.id, raum);
      if (!wahl.ok) throw new Error("Auswahl gescheitert");
      merkmale[p.name] = wahl.token;
      expect((await p.ruf(wahl.token)).status, `${p.name} vorher`).not.toBe(401);
    }
    await A.epocheErhoehen(laden(), k.id);
    for (const p of PFADE) {
      expect((await p.ruf(merkmale[p.name])).status, p.name).toBe(401);
    }
  }, LIMIT);

  it("bindet jeden Pfad an dieselbe Primitive", async () => {
    /* Kein Pfad darf eine eigene Fassung der Prüfung bekommen, und es darf
       kein fünfter Nebeneingang entstehen, der sie vergisst. Seit Phase A.1
       gibt es EINEN Weg, eine Arbeitssitzung aus einer Anfrage zu lesen
       (arbeitssitzungLesen: technisch lesen UND fachlich prüfen). Deshalb wird
       hier festgehalten, welche produktiven Dateien ihn benutzen — und dass
       keine Datei eine Sitzung auf dem alten Weg liest. Die genaue Aufstellung
       aller Lesestellen steht in sitzungsinventar.test.js. */
    const verzeichnis = new URL("../server/funktionen/", import.meta.url);
    const { readdir } = await import("node:fs/promises");
    const dateien = (await readdir(verzeichnis)).filter((d) => d.endsWith(".mjs"));
    const leser = [];
    const roh = [];
    for (const d of dateien) {
      const text = await readFile(new URL(d, verzeichnis), "utf8");
      if (/arbeitssitzungLesen/.test(text)) leser.push(d);
      /* Die zwei alten Wege: über sitzungLesen oder direkt über den Schlüssel
         `t:`. Beide sind den Endpunkten verschlossen. */
      if (/sitzungLesen/.test(text) || /`t:\$\{/.test(text)) roh.push(d);
    }
    expect(leser.sort()).toEqual(["daten.mjs", "kalender.mjs", "lage.mjs",
      "zustellung.mjs"]);
    expect(roh, "Dateien, die eine Sitzung auf dem alten Weg lesen").toEqual([]);
    /* Und die Primitive gibt es genau einmal. */
    const modul = await readFile(new URL("../server/lib/arbeitssitzung.mjs",
      import.meta.url), "utf8");
    expect(modul.includes("export async function arbeitssitzungPruefen")).toBe(true);
    expect(modul.includes("export async function arbeitssitzungLesen")).toBe(true);
    /* sitzungen.mjs bleibt frei von Accountwissen. */
    const sitzungen = await readFile(new URL("../server/lib/sitzungen.mjs",
      import.meta.url), "utf8");
    expect(sitzungen.includes("accounts.mjs")).toBe(false);
    expect(sitzungen.includes("mitglied")).toBe(false);
  }, LIMIT);
});

/* ==========================================================================
   DIE ALTEN ZUGÄNGE
   ========================================================================== */

describe("Sitzungen aus Zugangscodes bleiben unberührt", () => {
  it("verursacht keinen einzigen Zugriff auf Account, Mitgliedschaft oder Lauf",
    async () => {
      const echt = laden();
      const gesehen = [];
      const beobachtet = {
        get: (schluessel, opts) => { gesehen.push(String(schluessel)); return echt.get(schluessel, opts); },
        getWithMetadata: (schluessel, opts) => {
          gesehen.push(String(schluessel)); return echt.getWithMetadata(schluessel, opts);
        },
        list: (...a) => { gesehen.push(`list:${JSON.stringify(a[0] || {})}`); return echt.list(...a); },
        delete: (...a) => echt.delete(...a),
        setJSON: (...a) => echt.setJSON(...a),
      };
      const { token } = await legacySitzung();
      const e = await AS.arbeitssitzungPruefen(/** @type {any} */ (beobachtet),
        await satz(token));
      expect(e).toEqual({ ok: true, art: "legacy" });
      expect(gesehen).toEqual([]);
      for (const praefix of ["account:", "kontoId:", "mitglied:", "mitgliedlauf:",
        "kern:", "raummitglied:"]) {
        expect(gesehen.filter((g) => g.includes(praefix)), praefix).toEqual([]);
      }
    }, LIMIT);

  it("führt eine Zugangscode-Sitzung unverändert durch die Pfade", async () => {
    /* Ein vollständiger Betrieb, eine Sitzung der alten Art — und keine
       Mitgliedschaft, kein Account, kein Lauf. */
    const raum = raumName("legacy-pfade");
    await betrieb(raum, { personen: [person("p_1", "Alt", "Zugang", "leitung")] });
    const { token } = await S.sitzungAnlegen({ bestand: raum, rolle: "leitung",
      person: "p_1", betrieb: 0, konto: "konto:abc", name: "Alt Zugang" });

    for (const p of PFADE) {
      const e = await p.ruf(token);
      expect(e.status, p.name).not.toBe(401);
    }
    /* Und die Sitzung liegt ohne Anker in der Ablage. */
    const roh = await satz(token);
    expect(Object.prototype.hasOwnProperty.call(roh, "herkunft")).toBe(false);
    expect(roh.konto).toBe("konto:abc");
  }, LIMIT);

  it("lässt einen Sicherungsschlüssel unberührt", async () => {
    /* `sk:`-Schlüssel tragen keinen Anker und dürfen keinen brauchen. */
    const e = await AS.arbeitssitzungPruefen(laden(),
      { bestand: "t-arb-sk", nurSicherung: true, bis: Date.now() + 3600000 });
    expect(e).toEqual({ ok: true, art: "legacy" });
  }, LIMIT);

  it("lässt die Account-Sitzung selbst unverändert", async () => {
    /* Die Identitätssitzung bekommt weder Raum noch Rolle noch Generation. */
    const { konto: k } = await arbeitsbereich("kontositzung");
    const kontoAblage = getStore({ name: "centric-accountsitzungen",
      consistency: "strong" });
    const { blobs } = await kontoAblage.list({ prefix: "as:" });
    for (const b of blobs) {
      const roh = await kontoAblage.get(b.key, { type: "json" });
      expect(Object.keys(roh).sort())
        .toEqual(["accountId", "art", "bis", "epoche", "seit", "zuletzt"]);
    }
    expect(k.id).toBeTruthy();
  }, LIMIT);
});

/* ==========================================================================
   DIE AUSWAHL PRÜFT DIE GENERATION SCHON VORHER
   ========================================================================== */

describe("Die Auswahl selbst", () => {
  it("verweigert eine Mitgliedschaft ohne Generation", async () => {
    const k = await konto(adresse("auswahl-ohne-gen"));
    const raum = raumName("auswahl-ohne-gen");
    await betrieb(raum, { personen: [person("p_1", "A", "B", "leitung")] });
    const m = await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum,
      betrieb: 0, mandantId: "m1", person: "p_1", rolle: "leitung", status: "aktiv" });
    if (!m.ok) throw new Error("Anlage gescheitert");
    const ohne = { ...m.mitgliedschaft };
    delete ohne.generation;
    await laden().setJSON(A.mitgliedSchluessel(k.id, raum), ohne);

    const e = await waehle(k.id, raum);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("generation");
  }, LIMIT);

  it("verweigert ohne lesbaren Lauf", async () => {
    const k = await konto(adresse("auswahl-ohne-lauf"));
    const raum = raumName("auswahl-ohne-lauf");
    await betrieb(raum, { personen: [person("p_1", "A", "B", "leitung")] });
    await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum, betrieb: 0,
      mandantId: "m1", person: "p_1", rolle: "leitung", status: "aktiv" });
    await laden().delete(A.mitgliedlaufSchluessel(k.id, raum));
    const e = await waehle(k.id, raum);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("lauf");
  }, LIMIT);

  it("verweigert bei gesperrtem Account", async () => {
    const k = await konto(adresse("auswahl-gesperrt"));
    const raum = raumName("auswahl-gesperrt");
    await betrieb(raum, { personen: [person("p_1", "A", "B", "leitung")] });
    await A.mitgliedschaftAnlegen(laden(), { accountId: k.id, raum, betrieb: 0,
      mandantId: "m1", person: "p_1", rolle: "leitung", status: "aktiv" });
    await A.accountSperren(laden(), k.id);
    const e = await waehle(k.id, raum);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("konto-status");
  }, LIMIT);
});
