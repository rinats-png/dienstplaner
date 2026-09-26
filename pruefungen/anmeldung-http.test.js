/* ==========================================================================
   ACCOUNT-ZUGANG ÜBER HTTP

   Drei Endpunkte, ein Cookie, und eine Frage, die über allem steht: Was
   dieses Cookie NICHT kann. Es belegt eine Identität — es öffnet keinen
   Betrieb, es ersetzt keinen Zugangscode, und die Endpunkte der Anwendung
   kennen es nicht.

   Geprüft wird der echte Handler, derselbe Standardexport, den server.mjs
   unter den drei Pfaden einhängt.

   Zur Herkunft: Dieser Handler verlangt für POST einen eigenen `Origin` —
   anders als die Endpunkte mit `authorization`-Kopf. Deshalb schickt die
   Hilfsfunktion ihn standardmäßig mit; die Tests, die sein Fehlen prüfen,
   schalten ihn ausdrücklich ab.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, getStore, handler, KEKS, A, P, S, AN, AS, SCH;

const LIMIT = 40000;
const GUT = "Nordwind und Sonne 1846";
const ANDERS = "Sieben Raben auf dem Dach";
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const P_AN = "/api/account/anmelden";
const P_SITZ = "/api/account/sitzung";
const P_AB = "/api/account/abmelden";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-anm-http-"));
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
  AN = await import("../server/lib/accountanmeldung.mjs");
  AS = await import("../server/lib/accountsitzungen.mjs");
  SCH = await import("../server/lib/schutz.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzAblage = () =>
  getStore({ name: "centric-accountsitzungen", consistency: "strong" });
const legacyAblage = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });
const spur = () => getStore({ name: "centric-spur" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/* Der Gesamtzähler der Bremse lebt in der Ablage und würde spätere Tests
   bremsen; die Zählung je Herkunft lebt zusätzlich im Prozessspeicher —
   dagegen hilft nur eine eigene Absenderadresse je Anfrage. */
beforeEach(async () => {
  const s = getStore({ name: "centric-takt", consistency: "strong" });
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let zaehler = 0;
const eigeneHerkunft = () =>
  `10.7.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;
const adresse = (was) => `${was}-${++zaehler}@example.org`;

/**
 * Eine Anfrage an den echten Handler.
 *
 * `origin` ist standardmäßig der eigene Wirt; `origin: false` lässt den Kopf
 * weg. `keks` setzt den Cookie-Kopf, `rohKeks` überschreibt ihn vollständig.
 */
async function anfrage({ pfad = P_AN, methode = "POST", rumpf = undefined,
  rohRumpf = null, keks = null, rohKeks = null, origin = EIGEN, ziel = null,
  herkunft = null, laengeVorspiegeln = null } = {}) {
  const kopf = { "x-forwarded-for": herkunft || eigeneHerkunft(), host: WIRT };
  if (methode !== "GET" && methode !== "HEAD") kopf["content-type"] = "application/json";
  if (origin) kopf.origin = origin;
  if (ziel) kopf["sec-fetch-site"] = ziel;
  if (rohKeks !== null) kopf.cookie = rohKeks;
  else if (keks) kopf.cookie = `${KEKS}=${keks}`;
  if (laengeVorspiegeln) kopf["content-length"] = String(laengeVorspiegeln);

  const koerper = methode === "GET" || methode === "HEAD" ? undefined
    : (rohRumpf !== null ? rohRumpf : JSON.stringify(rumpf ?? {}));
  const req = new Request(`http://${WIRT}${pfad}`, {
    method: methode, headers: kopf, ...(koerper === undefined ? {} : { body: koerper }),
  });
  const antwort = await handler(req);
  let daten = null;
  try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { antwort, status: antwort.status, daten, text: JSON.stringify(daten),
    keks: antwort.headers.get("set-cookie") };
}

/** Ein anmeldefähiges Konto: Adresse bestätigt, Passwort gesetzt, aktiv. */
async function konto(email, passwort = GUT) {
  const s = laden();
  const e = await A.accountAnlegen(s, { email });
  if (!e.ok) throw new Error(`Account nicht angelegt: ${e.grund}`);
  await A.emailBestaetigen(s, e.account.id);
  const g = await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(passwort));
  if (!g.ok) throw new Error("Passwort nicht gesetzt");
  return g.account;
}

/** Der Wert des eigenen Cookies aus einem Set-Cookie-Kopf. */
const keksWert = (kopf) => {
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
  return m ? m[1] : null;
};

/** Anmelden und das Merkmal in der Hand behalten. */
async function angemeldet(email, passwort = GUT, rest = {}) {
  const e = await anfrage({ rumpf: { email, passwort }, ...rest });
  expect(e.status, `Anmeldung: ${e.text}`).toBe(200);
  const merkmal = keksWert(e.keks);
  expect(merkmal, "Merkmal im Cookie").toBeTruthy();
  return { ...e, merkmal };
}

/** Der abgelegte Sitzungsdatensatz zu einem Merkmal. */
const sitzung = (merkmal) =>
  sitzAblage().get(`as:${hash(merkmal)}`, { type: "json" });

/* ==========================================================================
   ANMELDEN — DER ERFOLGSFALL
   ========================================================================== */

describe("POST /api/account/anmelden", () => {
  it("meldet an und gibt ausschließlich ein Cookie aus", async () => {
    const k = await konto(adresse("gut"));
    const e = await anfrage({ rumpf: { email: k.email, passwort: GUT } });

    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true, angemeldet: true });
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");
    expect(e.antwort.headers.get("x-content-type-options")).toBe("nosniff");

    /* Kein Merkmal in der Antwort — es steht nur im Cookie. */
    const merkmal = keksWert(e.keks);
    expect(merkmal).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(e.text).not.toContain(merkmal);
    expect(e.text).not.toContain("accountId");
    expect(e.text).not.toContain("token");

    /* Und die Sitzung liegt in der eigenen Ablage, nur als Prüfwert. */
    const roh = await sitzung(merkmal);
    expect(roh).toBeTruthy();
    expect(roh.accountId).toBe(k.id);
    expect(roh.art).toBe("konto");
  }, LIMIT);

  it("setzt das Cookie mit allen Sicherheitsmerkmalen", async () => {
    const k = await konto(adresse("keks"));
    const e = await angemeldet(k.email);
    const kopf = String(e.keks);

    /* Das Präfix verpflichtet den Browser: Secure, Path=/, keine Domain. */
    expect(kopf.startsWith("__Host-")).toBe(true);
    expect(KEKS).toBe("__Host-centric_konto");
    expect(kopf).toContain("HttpOnly");
    expect(kopf).toContain("Secure");
    expect(kopf).toContain("SameSite=Strict");
    /* Genau „/" und nichts darunter: Ein Pfad wie „/api" erfüllt ein
       toContain("Path=/") ebenfalls und wäre trotzdem falsch — ein
       __Host-Cookie verlangt genau die Wurzel. */
    expect(kopf).toMatch(/;\s*Path=\/(?:;|$)/);
    /* Und genau EIN Pfad im Kopf: Ein zweiter würde den ersten
       überstimmen, denn ein Browser nimmt den letzten. */
    expect((String(kopf).match(/Path=/gi) || []).length).toBe(1);
    expect(kopf).toContain(`Max-Age=${Math.floor(AS.DAUER / 1000)}`);
    /* Keine Domain — sonst nimmt ein Browser ein __Host-Cookie nicht an. */
    expect(kopf.toLowerCase()).not.toContain("domain=");
    expect(kopf.toLowerCase()).not.toContain("expires=");
  }, LIMIT);

  it("setzt Secure unabhängig davon, was ein Kopf behauptet", async () => {
    /* Das Merkmal darf nicht über eine ungesicherte Verbindung gehen, und
       ob eine Verbindung gesichert war, darf kein mitgeschickter Kopf
       entscheiden. */
    const k = await konto(adresse("secure"));
    const e = await anfrage({ rumpf: { email: k.email, passwort: GUT } });
    expect(String(e.keks)).toContain("Secure");
  }, LIMIT);

  it("normalisiert die Adresse", async () => {
    const k = await konto(adresse("norm"));
    const e = await angemeldet(`  ${k.email.toUpperCase()} `);
    const roh = await sitzung(e.merkmal);
    expect(roh.accountId).toBe(k.id);
  }, LIMIT);

  it("schreibt weder Merkmal noch Passwort in die Spur", async () => {
    const k = await konto(adresse("spur"));
    const e = await angemeldet(k.email);
    let text = "";
    for (const b of (await spur().list({})).blobs) {
      text += JSON.stringify(await spur().get(b.key, { type: "json" }));
    }
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(e.merkmal);
    expect(text).not.toContain(GUT);
    expect(text).not.toContain(k.email);
    expect(text).not.toContain(k.id);
  }, LIMIT);

  it("führt kein Merkmal in einer Adresse", async () => {
    /* Weder Weiterleitung noch Rückgabe tragen eine Sitzungskennung: Ein
       Merkmal in einer Adresse landet in Protokollen und im Verlauf. */
    const k = await konto(adresse("url"));
    const e = await angemeldet(k.email);
    expect(e.antwort.headers.get("location")).toBe(null);
    const quelle = await readFile(new URL("../server/funktionen/anmeldung.mjs",
      import.meta.url), "utf8");
    expect(quelle).not.toContain("searchParams.set");
    expect(quelle).not.toContain("?token=");
  }, LIMIT);

  it("ersetzt eine vorhandene Sitzung dieses Geräts und lässt andere stehen",
    async () => {
      const k = await konto(adresse("ersetzen"));
      const erste = await angemeldet(k.email);
      const anderesGeraet = await angemeldet(k.email);

      /* Zweite Anmeldung mit dem Cookie der ersten im Gepäck. */
      const zweite = await angemeldet(k.email, GUT, { keks: erste.merkmal });
      expect(zweite.merkmal).not.toBe(erste.merkmal);

      /* Das alte Merkmal ist widerrufen … */
      expect(await sitzung(erste.merkmal)).toBe(null);
      const alt = await anfrage({ pfad: P_SITZ, methode: "GET", keks: erste.merkmal });
      expect(alt.status).toBe(401);
      /* … das neue gilt … */
      const neu = await anfrage({ pfad: P_SITZ, methode: "GET", keks: zweite.merkmal });
      expect(neu.status).toBe(200);
      /* … und das andere Gerät bleibt angemeldet. */
      const fremdesGeraet = await anfrage({ pfad: P_SITZ, methode: "GET",
        keks: anderesGeraet.merkmal });
      expect(fremdesGeraet.status).toBe(200);
    }, LIMIT);

  it("legt weder Betrieb noch Mitgliedschaft noch Arbeitssitzung an", async () => {
    const k = await konto(adresse("nebenwirkung"));
    await angemeldet(k.email);
    const s = laden();
    for (const praefix of ["kern:", "bestand:", "mitglied:", "raummitglied:",
      "konto:", "stand:", "push:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
    for (const praefix of ["t:", "sk:"]) {
      expect((await legacyAblage().list({ prefix: praefix })).blobs.length, praefix)
        .toBe(0);
    }
  }, LIMIT);
});

/* ==========================================================================
   ANMELDEN — JEDE ABSAGE SIEHT GLEICH AUS
   ========================================================================== */

describe("Eine fehlgeschlagene Anmeldung verrät nichts", () => {
  const faelle = [];

  it("weist ein falsches Passwort ab", async () => {
    const k = await konto(adresse("falsch"));
    const e = await anfrage({ rumpf: { email: k.email, passwort: ANDERS } });
    expect(e.status).toBe(401);
    expect(e.daten.ok).toBe(false);
    expect(e.daten.fehler).toBe("zugangsdaten");
    expect(keksWert(e.keks)).toBe("");
    faelle.push(e.daten.fehler);
  }, LIMIT);

  it("weist eine unbekannte Adresse ab", async () => {
    const e = await anfrage({ rumpf: { email: adresse("niemand"), passwort: GUT } });
    expect(e.status).toBe(401);
    expect(e.daten.fehler).toBe("zugangsdaten");
    faelle.push(e.daten.fehler);
  }, LIMIT);

  it("weist ein Konto ohne Passwort ab", async () => {
    const s = laden();
    const e = await A.accountAnlegen(s, { email: adresse("ohnepw") });
    await A.emailBestaetigen(s, e.account.id);
    const a = await anfrage({ rumpf: { email: e.account.email, passwort: GUT } });
    expect(a.status).toBe(401);
    expect(a.daten.fehler).toBe("zugangsdaten");
    faelle.push(a.daten.fehler);
  }, LIMIT);

  it("weist ein Konto mit unbestätigter Adresse ab", async () => {
    const s = laden();
    const e = await A.accountAnlegen(s, { email: adresse("unbest") });
    await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
    const a = await anfrage({ rumpf: { email: e.account.email, passwort: GUT } });
    expect(a.status).toBe(401);
    expect(a.daten.fehler).toBe("zugangsdaten");
    faelle.push(a.daten.fehler);
  }, LIMIT);

  it("weist ein gesperrtes Konto ab", async () => {
    const k = await konto(adresse("gesperrt"));
    await A.accountSperren(laden(), k.id);
    const a = await anfrage({ rumpf: { email: k.email, passwort: GUT } });
    expect(a.status).toBe(401);
    expect(a.daten.fehler).toBe("zugangsdaten");
    /* Keine Sitzung entstanden. */
    expect((await sitzAblage().list({ prefix: "as:" })).blobs.length)
      .toBeGreaterThanOrEqual(0);
    faelle.push(a.daten.fehler);
  }, LIMIT);

  it("weist unbrauchbare Eingaben ab", async () => {
    for (const rumpf of [{}, { email: "keineadresse", passwort: GUT },
      { email: null, passwort: GUT }, { email: 42, passwort: GUT },
      { email: adresse("leer"), passwort: "" },
      { email: adresse("objekt"), passwort: { a: 1 } }]) {
      const e = await anfrage({ rumpf });
      expect(e.status, JSON.stringify(rumpf)).toBe(401);
      expect(e.daten.fehler).toBe("zugangsdaten");
    }
  }, LIMIT);

  it("antwortet in allen Fällen mit demselben Satz und ohne Merkmal", async () => {
    const s = laden();
    const gut = await konto(adresse("satz-gut"));
    const gesperrt = await konto(adresse("satz-sperr"));
    await A.accountSperren(s, gesperrt.id);
    const ohne = await A.accountAnlegen(s, { email: adresse("satz-ohne") });
    await A.emailBestaetigen(s, ohne.account.id);
    const unbest = await A.accountAnlegen(s, { email: adresse("satz-unbest") });
    await A.passwortSetzen(s, unbest.account.id, await P.passwortAblegen(GUT));

    const hinweise = new Set();
    const koepfe = new Set();
    for (const rumpf of [
      { email: gut.email, passwort: ANDERS },
      { email: adresse("satz-fremd"), passwort: GUT },
      { email: gesperrt.email, passwort: GUT },
      { email: ohne.account.email, passwort: GUT },
      { email: unbest.account.email, passwort: GUT },
      { email: "unsinn", passwort: GUT },
    ]) {
      const e = await anfrage({ rumpf });
      expect(e.status).toBe(401);
      hinweise.add(e.daten.hinweis);
      koepfe.add(keksWert(e.keks));
      expect(e.text).not.toContain("gesperrt");
      expect(e.text).not.toContain("unbestaetigt");
      expect(e.text).not.toContain("ohne-passwort");
      expect(e.text).not.toContain("unbekannt");
    }
    expect([...hinweise]).toEqual([AN.HINWEIS_ANMELDUNG]);
    /* Und jede Absage löscht das Cookie, statt eines auszugeben. */
    expect([...koepfe]).toEqual([""]);
  }, LIMIT);

  it("sagt bei einem Speicherfehler nicht „falsche Zugangsdaten“", async () => {
    /* Die Ablage der Account-Sitzungen wird unbenutzbar gemacht: Wo ein
       Verzeichnis liegen müsste, liegt eine Datei. Das Konto selbst bleibt
       lesbar — es geht genau um den Fall, dass die Anmeldung stimmt und
       danach die Sitzung nicht geschrieben werden kann. */
    const k = await konto(adresse("platte"));
    const ort = path.join(wurzel, "centric-accountsitzungen");
    await rm(ort, { recursive: true, force: true });
    await writeFile(ort, "");
    try {
      const e = await anfrage({ rumpf: { email: k.email, passwort: GUT } });
      expect(e.status).toBe(500);
      expect(e.daten.ok).toBe(false);
      expect(e.daten.fehler).toBe("nicht-moeglich");
      expect(e.daten.hinweis).toBe(AN.HINWEIS_SPEICHERN);
      expect(e.daten.hinweis).not.toBe(AN.HINWEIS_ANMELDUNG);
      expect(keksWert(e.keks)).toBe("");
    } finally {
      await rm(ort, { force: true });
      await mkdir(ort, { recursive: true });
    }
    /* Danach geht es wieder. */
    await angemeldet(k.email);
  }, LIMIT);
});

/* ==========================================================================
   SITZUNG PRÜFEN
   ========================================================================== */

describe("GET /api/account/sitzung", () => {
  it("bestätigt eine gültige Sitzung mit minimaler Auskunft", async () => {
    const k = await konto(adresse("stand"));
    const e = await angemeldet(k.email);
    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });

    expect(p.status).toBe(200);
    expect(Object.keys(p.daten).sort()).toEqual(["angemeldet", "bis", "email", "ok"]);
    expect(p.daten.ok).toBe(true);
    expect(p.daten.angemeldet).toBe(true);
    expect(p.daten.email).toBe(k.email);
    expect(typeof p.daten.bis).toBe("number");
    expect(p.antwort.headers.get("cache-control")).toBe("no-store");
  }, LIMIT);

  it("gibt weder Kennung, Merkmal, Rolle noch Betrieb heraus", async () => {
    const k = await konto(adresse("knapp"));
    const e = await angemeldet(k.email);
    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    for (const wort of [k.id, e.merkmal, "rolle", "raum", "bestand", "mitglied",
      "betrieb", "epoche", "accountId", "s1$"]) {
      expect(p.text, wort).not.toContain(wort);
    }
  }, LIMIT);

  it("weist eine Anfrage ohne Cookie ab", async () => {
    const p = await anfrage({ pfad: P_SITZ, methode: "GET" });
    expect(p.status).toBe(401);
    expect(p.daten).toEqual({ ok: false, angemeldet: false,
      hinweis: AN.HINWEIS_SITZUNG });
    /* Ohne Cookie gibt es auch nichts zu löschen. */
    expect(p.keks).toBe(null);
  }, LIMIT);

  it("weist ein verfälschtes oder erfundenes Cookie ab und räumt es weg", async () => {
    const k = await konto(adresse("faelschung"));
    const e = await angemeldet(k.email);
    const gedreht = e.merkmal.slice(0, -1) + (e.merkmal.endsWith("A") ? "B" : "A");

    for (const wert of [gedreht, e.merkmal + "A", e.merkmal.slice(1),
      hash(e.merkmal), "zu-kurz", "x".repeat(300)]) {
      const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: wert });
      expect(p.status, wert.slice(0, 12)).toBe(401);
      expect(p.daten.angemeldet).toBe(false);
    }
    /* Die echte Sitzung ist dabei unbeschädigt geblieben. */
    const echt = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(echt.status).toBe(200);
  }, LIMIT);

  it("beachtet fremde Cookies nicht und lässt sie stehen", async () => {
    const k = await konto(adresse("fremdkeks"));
    const e = await angemeldet(k.email);
    const p = await anfrage({ pfad: P_SITZ, methode: "GET",
      rohKeks: `andere=1; ${KEKS}=${e.merkmal}; legacy=xyz` });
    expect(p.status).toBe(200);
    /* Gelöscht oder gesetzt wird ausschließlich der eigene Name. */
    const ab = await anfrage({ pfad: P_AB, rohKeks: `andere=1; ${KEKS}=${e.merkmal}` });
    expect(String(ab.keks)).toContain(KEKS);
    expect(String(ab.keks)).not.toContain("andere=");
    expect(String(ab.keks)).not.toContain("legacy=");
  }, LIMIT);

  it("weist eine abgelaufene Sitzung ab", async () => {
    const k = await konto(adresse("abgelaufen"));
    const e = await angemeldet(k.email);
    const schluessel = `as:${hash(e.merkmal)}`;
    const roh = await sitzAblage().get(schluessel, { type: "json" });
    await sitzAblage().setJSON(schluessel,
      { ...roh, bis: Date.now() - 1000, zuletzt: Date.now() });

    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(p.status).toBe(401);
    expect(keksWert(p.keks)).toBe("");
    expect(await sitzAblage().get(schluessel, { type: "json" })).toBe(null);
  }, LIMIT);

  it("weist eine untätige Sitzung ab", async () => {
    const k = await konto(adresse("untaetig"));
    const e = await angemeldet(k.email);
    const schluessel = `as:${hash(e.merkmal)}`;
    const roh = await sitzAblage().get(schluessel, { type: "json" });
    await sitzAblage().setJSON(schluessel,
      { ...roh, zuletzt: Date.now() - (AS.RUHE + 60000) });

    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(p.status).toBe(401);
    expect(await sitzAblage().get(schluessel, { type: "json" })).toBe(null);
  }, LIMIT);

  it("weist eine Sitzung nach einer Passwortänderung ab", async () => {
    const k = await konto(adresse("epoche"));
    const e = await angemeldet(k.email);
    await A.passwortSetzen(laden(), k.id, await P.passwortAblegen(ANDERS));

    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(p.status).toBe(401);
    expect(keksWert(p.keks)).toBe("");
    /* Mit dem neuen Passwort geht es weiter. */
    const neu = await angemeldet(k.email, ANDERS);
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: neu.merkmal })).status)
      .toBe(200);
  }, LIMIT);

  it("weist eine Sitzung nach einer Sperre ab", async () => {
    const k = await konto(adresse("sperre-lauf"));
    const e = await angemeldet(k.email);
    await A.accountSperren(laden(), k.id);

    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(p.status).toBe(401);
    expect(await sitzAblage().get(`as:${hash(e.merkmal)}`, { type: "json" })).toBe(null);
    /* Und sie wird nicht wieder gültig, wenn die Sperre fällt. */
    await A.accountAendern(laden(), k.id, { status: "aktiv" });
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })).status)
      .toBe(401);
  }, LIMIT);

  it("hält zwölf gleichzeitige Abfragen aus", async () => {
    /* `zuletzt` wird ohne await fortgeschrieben. Gleichzeitige Abfragen
       dürfen sich dabei nicht gegenseitig die Sitzung wegschreiben. */
    const k = await konto(adresse("parallel-stand"));
    const e = await angemeldet(k.email);
    const alle = await Promise.all(Array.from({ length: 12 },
      () => anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })));
    for (const p of alle) expect(p.status).toBe(200);

    /* Genau ein Datensatz, und er gilt weiter. */
    const meine = (await sitzAblage().list({ prefix: "as:" })).blobs
      .filter((b) => b.key === `as:${hash(e.merkmal)}`);
    expect(meine.length).toBe(1);
    const spaeter = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(spaeter.status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   ABMELDEN
   ========================================================================== */

describe("POST /api/account/abmelden", () => {
  it("widerruft die Sitzung und löscht das Cookie", async () => {
    const k = await konto(adresse("abmelden"));
    const e = await angemeldet(k.email);

    const ab = await anfrage({ pfad: P_AB, keks: e.merkmal });
    expect(ab.status).toBe(200);
    expect(ab.daten).toEqual({ ok: true, angemeldet: false });
    /* Löschen heißt: derselbe Name, derselbe Pfad, dieselben Merkmale,
       Max-Age 0 — sonst legt der Browser ein zweites daneben. */
    const kopf = String(ab.keks);
    expect(keksWert(kopf)).toBe("");
    expect(kopf).toContain("Max-Age=0");
    /* Derselbe Pfad wie beim Setzen, genau „/" — mit einem anderen Pfad
       löscht der Browser nichts, sondern legt ein zweites daneben. */
    expect(kopf).toMatch(/;\s*Path=\/(?:;|$)/);
    /* Und genau EIN Pfad im Kopf: Ein zweiter würde den ersten
       überstimmen, denn ein Browser nimmt den letzten. */
    expect((String(kopf).match(/Path=/gi) || []).length).toBe(1);
    expect(kopf).toContain("HttpOnly");
    expect(kopf).toContain("Secure");
    expect(kopf).toContain("SameSite=Strict");
    expect(kopf.toLowerCase()).not.toContain("domain=");

    expect(await sitzung(e.merkmal)).toBe(null);
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })).status)
      .toBe(401);
  }, LIMIT);

  it("gelingt auch beim zweiten und dritten Mal", async () => {
    const k = await konto(adresse("zweimal"));
    const e = await angemeldet(k.email);
    for (let i = 0; i < 3; i++) {
      const ab = await anfrage({ pfad: P_AB, keks: e.merkmal });
      expect(ab.status, `Runde ${i}`).toBe(200);
      expect(ab.daten.ok).toBe(true);
    }
  }, LIMIT);

  it("gelingt ohne Cookie, ohne etwas zu verraten", async () => {
    const ab = await anfrage({ pfad: P_AB });
    expect(ab.status).toBe(200);
    expect(ab.daten).toEqual({ ok: true, angemeldet: false });
    expect(keksWert(ab.keks)).toBe("");
  }, LIMIT);

  it("lässt fremde Sitzungen unberührt", async () => {
    const eigen = await konto(adresse("ab-eigen"));
    const fremd = await konto(adresse("ab-fremd"));
    const meine = await angemeldet(eigen.email);
    const zweite = await angemeldet(eigen.email);
    const andere = await angemeldet(fremd.email);

    await anfrage({ pfad: P_AB, keks: meine.merkmal });
    await anfrage({ pfad: P_AB, keks: meine.merkmal });

    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: zweite.merkmal })).status)
      .toBe(200);
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: andere.merkmal })).status)
      .toBe(200);
  }, LIMIT);

  it("behauptet bei einem Speicherfehler keinen vollständigen Logout", async () => {
    /* Der Widerruf wird zum Scheitern gebracht, ohne die Ablage im Ganzen
       zu verbiegen: Dort, wo die Datei der Sitzung liegt, liegt stattdessen
       ein Verzeichnis. `unlink` scheitert daran auf jedem Betriebssystem —
       unter Windows mit EPERM, unter Linux mit EISDIR —, und genau dann
       darf die Antwort kein „abgemeldet" behaupten. */
    const k = await konto(adresse("ab-platte"));
    const e = await angemeldet(k.email);
    const datei = path.join(wurzel, "centric-accountsitzungen",
      `as%3A${hash(e.merkmal)}.json`);
    const inhalt = await readFile(datei, "utf8");
    await rm(datei, { force: true });
    await mkdir(datei, { recursive: true });
    let ab;
    try {
      ab = await anfrage({ pfad: P_AB, keks: e.merkmal });
    } finally {
      await rm(datei, { recursive: true, force: true });
      await writeFile(datei, inhalt);
    }
    expect(ab.status).toBe(500);
    expect(ab.daten.ok).toBe(false);
    expect(ab.daten.fehler).toBe("abmelden-unvollstaendig");
    expect(ab.daten.hinweis).toBeTruthy();
    /* Das Cookie wird trotzdem gelöscht — der Mensch wollte es loswerden. */
    expect(keksWert(ab.keks)).toBe("");

    /* Die Sitzung war nicht widerrufen: Mit heiler Ablage gilt sie weiter … */
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })).status)
      .toBe(200);
    /* … und ein zweiter Versuch beendet sie wirklich. */
    const nochmal = await anfrage({ pfad: P_AB, keks: e.merkmal });
    expect(nochmal.status).toBe(200);
    expect(await sitzung(e.merkmal)).toBe(null);
  }, LIMIT);

  it("rührt keine Arbeitssitzung an", async () => {
    const k = await konto(adresse("ab-legacy"));
    const e = await angemeldet(k.email);
    const legacy = await S.sitzungAnlegen({ bestand: "t-ab-legacy", rolle: "leitung",
      person: "p_1", betrieb: 0 });

    await anfrage({ pfad: P_AB, keks: e.merkmal });

    const anfrageMitKopf = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${legacy.token}` : null) },
    };
    expect(await S.sitzungLesen(/** @type {any} */ (anfrageMitKopf))).toBeTruthy();
  }, LIMIT);
});

/* ==========================================================================
   HERKUNFT UND CSRF
   ========================================================================== */

describe("Herkunft und CSRF", () => {
  it("weist eine Anmeldung von fremder Seite ab", async () => {
    const k = await konto(adresse("csrf-an"));
    for (const origin of ["https://boese.example", "http://localhost:5173",
      `http://evil.${WIRT}`]) {
      const e = await anfrage({ rumpf: { email: k.email, passwort: GUT }, origin });
      expect(e.status, origin).toBe(403);
      expect(e.daten.fehler).toBe("fremde-herkunft");
      expect(e.keks).toBe(null);
    }
  }, LIMIT);

  it("weist eine Anmeldung ohne Origin ab", async () => {
    /* Login-CSRF: Ohne eigenen Origin kann niemand einen fremden Browser in
       ein Konto anmelden, das er kontrolliert. */
    const k = await konto(adresse("csrf-ohne"));
    const e = await anfrage({ rumpf: { email: k.email, passwort: GUT }, origin: false });
    expect(e.status).toBe(403);
    expect(e.daten.fehler).toBe("fremde-herkunft");
  }, LIMIT);

  it("lässt eine Anmeldung ohne Origin mit passender Fetch-Metadata zu", async () => {
    const k = await konto(adresse("csrf-fetch"));
    const e = await anfrage({ rumpf: { email: k.email, passwort: GUT },
      origin: false, ziel: "same-origin" });
    expect(e.status).toBe(200);
  }, LIMIT);

  it("weist cross-site und same-site ab, auch beim Lesen", async () => {
    const k = await konto(adresse("csrf-fetchmeta"));
    const e = await angemeldet(k.email);
    for (const ziel of ["cross-site", "same-site"]) {
      const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal, ziel });
      expect(p.status, ziel).toBe(403);
      const ab = await anfrage({ pfad: P_AB, keks: e.merkmal, ziel });
      expect(ab.status, ziel).toBe(403);
    }
    /* Die Sitzung lebt noch — kein fremdes Blatt hat sie beendet. */
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })).status)
      .toBe(200);
  }, LIMIT);

  it("weist ein Abmelden von fremder Seite ab und lässt die Sitzung leben", async () => {
    const k = await konto(adresse("csrf-ab"));
    const e = await angemeldet(k.email);
    for (const wahl of [{ origin: "https://boese.example" }, { origin: false }]) {
      const ab = await anfrage({ pfad: P_AB, keks: e.merkmal, ...wahl });
      expect(ab.status).toBe(403);
      expect(ab.keks).toBe(null);
    }
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal })).status)
      .toBe(200);
  }, LIMIT);

  it("erkennt den eigenen Wirt auch über x-forwarded-host", async () => {
    const k = await konto(adresse("wirt"));
    const req = new Request("http://intern:3000" + P_AN, {
      method: "POST",
      headers: { "content-type": "application/json", host: "intern:3000",
        "x-forwarded-host": "app.centric-dienstplanung.de",
        origin: "https://app.centric-dienstplanung.de",
        "x-forwarded-for": eigeneHerkunft() },
      body: JSON.stringify({ email: k.email, passwort: GUT }),
    });
    const antwort = await handler(req);
    expect(antwort.status).toBe(200);
  }, LIMIT);

  it("zählt Anfragen fremder Herkunft nicht auf die Bremse", async () => {
    /* Die Herkunftsprüfung steht vor der Bremse: Ein fremdes Blatt soll
       niemanden aussperren können. */
    const k = await konto(adresse("csrf-bremse"));
    const ip = eigeneHerkunft();
    for (let i = 0; i < 20; i++) {
      const e = await anfrage({ rumpf: { email: k.email, passwort: ANDERS },
        origin: "https://boese.example", herkunft: ip });
      expect(e.status).toBe(403);
    }
    const gut = await anfrage({ rumpf: { email: k.email, passwort: GUT },
      herkunft: ip });
    expect(gut.status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   METHODEN, RUMPF, PFADE
   ========================================================================== */

describe("Methoden, Rumpf und Pfade", () => {
  it("nimmt nur POST für Anmelden und Abmelden", async () => {
    for (const pfad of [P_AN, P_AB]) {
      for (const methode of ["GET", "PUT", "DELETE", "PATCH"]) {
        const e = await anfrage({ pfad, methode, rumpf: {} });
        /* GET und HEAD kommen an der Herkunftsprüfung vorbei und scheitern
           an der Methode; die übrigen scheitern schon an der Herkunft —
           beides ist eine Absage. */
        expect([403, 405], `${methode} ${pfad}`).toContain(e.status);
      }
      const post = await anfrage({ pfad, methode: "GET", rumpf: {} });
      if (post.status === 405) expect(post.antwort.headers.get("allow")).toBe("POST");
    }
  }, LIMIT);

  it("nimmt nur GET und HEAD für die Sitzungsabfrage", async () => {
    const k = await konto(adresse("methode-sitz"));
    const e = await angemeldet(k.email);
    const post = await anfrage({ pfad: P_SITZ, methode: "POST", keks: e.merkmal });
    expect(post.status).toBe(405);
    expect(post.antwort.headers.get("allow")).toBe("GET, HEAD");
    const kopf = await anfrage({ pfad: P_SITZ, methode: "HEAD", keks: e.merkmal });
    expect(kopf.status).toBe(200);
  }, LIMIT);

  it("weist kaputtes JSON und Nicht-Objekte ab", async () => {
    const kaputt = await anfrage({ rohRumpf: "{nicht json" });
    expect(kaputt.status).toBe(400);
    expect(kaputt.daten.fehler).toBe("kaputtes-json");
    const feld = await anfrage({ rohRumpf: JSON.stringify(["a", "b"]) });
    expect(feld.status).toBe(400);
    expect(feld.daten.fehler).toBe("kein-objekt");
  }, LIMIT);

  it("weist einen zu großen Rumpf ab", async () => {
    const gross = await anfrage({ rohRumpf: JSON.stringify({ email: "a@b.de",
      passwort: "x".repeat(20000) }) });
    expect(gross.status).toBe(413);
    expect(gross.daten.fehler).toBe("zu-gross");
    /* Auch die vorgespiegelte Länge genügt für die Absage. */
    const behauptet = await anfrage({ rumpf: { email: "a@b.de", passwort: GUT },
      laengeVorspiegeln: 999999 });
    expect(behauptet.status).toBe(413);
  }, LIMIT);

  it("kennt nur seine drei Pfade", async () => {
    for (const pfad of ["/api/account", "/api/account/anmelden/extra",
      "/api/account/unbekannt", "/api/konto/anmelden"]) {
      const e = await anfrage({ pfad, methode: "GET" });
      expect(e.status, pfad).toBe(404);
      expect(e.daten.fehler).toBe("unbekannter-pfad");
    }
    /* Ein Schrägstrich am Ende ist derselbe Pfad. */
    const k = await konto(adresse("schraeg"));
    expect((await anfrage({ pfad: `${P_AN}/`,
      rumpf: { email: k.email, passwort: GUT } })).status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   BREMSE
   ========================================================================== */

describe("Die Bremse", () => {
  it("ist für beide Arten ausdrücklich eingetragen", () => {
    /* Eine unbekannte Bremsart lässt schweigend durch (schutz.mjs). Diese
       Prüfung ist die Versicherung dagegen. */
    expect(SCH.GRENZEN["anmelden-konto"]).toBeTruthy();
    expect(SCH.GRENZEN["anmelden-konto"].versuche).toBe(8);
    expect(SCH.GRENZEN["anmelden-konto"].steigend).toBe(true);
    expect(SCH.GRENZEN["konto-sitzung"]).toBeTruthy();
    expect(SCH.WEITERE["anmelden-konto"].ziel).toBeTruthy();
    expect(SCH.WEITERE["anmelden-konto"].gesamt).toBeTruthy();
  });

  it("sperrt nach acht Fehlversuchen derselben Herkunft", async () => {
    const k = await konto(adresse("bremse"));
    const ip = eigeneHerkunft();
    let gebremst = 0;
    for (let i = 0; i < 9; i++) {
      const e = await anfrage({ rumpf: { email: k.email, passwort: ANDERS },
        herkunft: ip });
      if (e.status === 429) gebremst++;
      else expect(e.status, `Versuch ${i + 1}`).toBe(401);
    }
    expect(gebremst).toBeGreaterThanOrEqual(1);

    /* Auch das richtige Passwort kommt jetzt nicht mehr durch — sonst wäre
       die Sperre keine. */
    const richtig = await anfrage({ rumpf: { email: k.email, passwort: GUT },
      herkunft: ip });
    expect(richtig.status).toBe(429);
    expect(richtig.antwort.headers.get("retry-after")).toBeTruthy();
    expect(Number(richtig.daten.wartet)).toBeGreaterThan(0);

    /* Eine andere Herkunft ist davon unberührt. */
    const andere = await anfrage({ rumpf: { email: k.email, passwort: GUT } });
    expect(andere.status).toBe(200);
  }, LIMIT);

  it("bremst auch den verteilten Angriff auf ein Konto", async () => {
    const k = await konto(adresse("bremse-ziel"));
    const grenze = SCH.WEITERE["anmelden-konto"].ziel.versuche;
    let gebremst = 0;
    /* Jeder Versuch aus einer anderen Herkunft — je Herkunft unauffällig,
       nur das Ziel fällt auf. Gezählt wird über Vermerke in der Ablage, und
       ein verlorener Schreibvorgang darf die Prüfung nicht kippen: Deshalb
       Luft nach oben und Schluss beim ersten Treffer. */
    for (let i = 0; i < grenze * 2 && !gebremst; i++) {
      const e = await anfrage({ rumpf: { email: k.email, passwort: ANDERS } });
      if (e.status === 429) gebremst++;
    }
    expect(gebremst).toBe(1);
  }, LIMIT);

  it("entlastet nach einer gelungenen Anmeldung", async () => {
    const k = await konto(adresse("entlasten"));
    const ip = eigeneHerkunft();
    for (let i = 0; i < 4; i++) {
      await anfrage({ rumpf: { email: k.email, passwort: ANDERS }, herkunft: ip });
    }
    expect((await anfrage({ rumpf: { email: k.email, passwort: GUT },
      herkunft: ip })).status).toBe(200);
    /* Danach stehen wieder alle Versuche offen. */
    for (let i = 0; i < 5; i++) {
      const e = await anfrage({ rumpf: { email: k.email, passwort: ANDERS },
        herkunft: ip });
      expect(e.status, `nach Entlastung ${i}`).toBe(401);
    }
  }, LIMIT);
});

/* ==========================================================================
   ISOLATION IN BEIDE RICHTUNGEN
   ========================================================================== */

describe("Das Account-Cookie öffnet keinen Betrieb", () => {
  it("wird von den Arbeitssitzungen nicht gelesen", async () => {
    const k = await konto(adresse("iso-legacy"));
    const e = await angemeldet(k.email);
    /* Eine Anfrage, die nur das Cookie trägt, ist für sitzungLesen nicht
       angemeldet: Es liest ausschließlich den Kopf `authorization`. */
    const nurKeks = {
      headers: { get: (n) => (n === "cookie" ? `${KEKS}=${e.merkmal}` : null) },
    };
    expect(await S.sitzungLesen(/** @type {any} */ (nurKeks))).toBe(null);

    /* Und der Endpunkt, der den Bestand hält, kennt das Wort „cookie" nicht. */
    const daten = await readFile(new URL("../server/funktionen/daten.mjs",
      import.meta.url), "utf8");
    expect(daten.toLowerCase()).not.toContain("cookie");
    expect(daten).not.toContain("accountanmeldung");
    expect(daten).not.toContain("accountsitzungen");
  }, LIMIT);

  it("nimmt kein Arbeitssitzungs-Merkmal als Cookie an", async () => {
    const legacy = await S.sitzungAnlegen({ bestand: "t-iso-a", rolle: "leitung",
      person: "p_1", betrieb: 0 });
    /* Als Cookie … */
    const alsKeks = await anfrage({ pfad: P_SITZ, methode: "GET", keks: legacy.token });
    expect(alsKeks.status).toBe(401);
    /* … und als Kopf, den dieser Handler gar nicht liest. */
    const req = new Request(`http://${WIRT}${P_SITZ}`, {
      method: "GET",
      headers: { host: WIRT, authorization: `Bearer ${legacy.token}`,
        "x-forwarded-for": eigeneHerkunft() },
    });
    expect((await handler(req)).status).toBe(401);
    /* Die Arbeitssitzung selbst ist unbeschädigt. */
    const mitKopf = {
      headers: { get: (n) => (n === "authorization" ? `Bearer ${legacy.token}` : null) },
    };
    expect(await S.sitzungLesen(/** @type {any} */ (mitKopf))).toBeTruthy();
  }, LIMIT);

  it("verschafft auch mit zwei Mitgliedschaften keinen Betriebszugriff", async () => {
    const s = laden();
    const k = await konto(adresse("iso-zwei"));
    await A.mitgliedschaftAnlegen(s, { accountId: k.id, raum: "t-anmhttp-alpha",
      betrieb: 0, mandantId: "m-alpha", person: "p_a", rolle: "leitung",
      status: "aktiv" });
    await A.mitgliedschaftAnlegen(s, { accountId: k.id, raum: "t-anmhttp-beta",
      betrieb: 0, mandantId: "m-beta", person: "p_b", rolle: "mitarbeiter",
      status: "aktiv" });

    const e = await angemeldet(k.email);
    const p = await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    expect(p.status).toBe(200);
    /* Keine Rolle, kein Raum, keine Mitgliedschaft — auch nicht die höhere. */
    expect(Object.keys(p.daten).sort()).toEqual(["angemeldet", "bis", "email", "ok"]);
    expect(p.text).not.toContain("leitung");
    expect(p.text).not.toContain("t-anmhttp");
    const roh = await sitzung(e.merkmal);
    expect(JSON.stringify(roh)).not.toContain("leitung");
    expect(JSON.stringify(roh)).not.toContain("t-anmhttp");
  }, LIMIT);

  it("legt die Sitzungen in einer eigenen Ablage ab", async () => {
    const k = await konto(adresse("iso-ablage"));
    const e = await angemeldet(k.email);
    await S.sitzungAnlegen({ bestand: "t-iso-b", rolle: "planer", person: "p_2" });

    for (const b of (await legacyAblage().list({})).blobs) {
      expect(b.key.startsWith("as:"), b.key).toBe(false);
    }
    for (const b of (await sitzAblage().list({})).blobs) {
      expect(b.key.startsWith("as:"), b.key).toBe(true);
    }
    expect(await sitzung(e.merkmal)).toBeTruthy();
  }, LIMIT);

  it("erzeugt keinen Zugangscode und keine Betriebsdaten", async () => {
    const k = await konto(adresse("iso-codes"));
    const e = await angemeldet(k.email);
    await anfrage({ pfad: P_SITZ, methode: "GET", keks: e.merkmal });
    await anfrage({ pfad: P_AB, keks: e.merkmal });
    const s = laden();
    for (const praefix of ["konto:", "kern:", "bestand:", "scherbe:", "stand:",
      "sicherung:", "loeschung:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
  }, LIMIT);
});
