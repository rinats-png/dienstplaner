/* ==========================================================================
   DAS ERSTE PASSWORT ÜBER HTTP

   Der Vorgang hat genau ein Schloss: den Fortsetzungsnachweis aus der
   Adressbestätigung. Geprüft wird deshalb vor allem, was ihn NICHT ersetzt —
   eine Kontokennung, eine Adresse, ein abgelaufener oder verbrauchter
   Nachweis, ein Nachweis für einen anderen Zweck.

   Und die Reihenfolge: Ein falsches Passwort darf den Nachweis nicht
   verbrennen, ein richtiges muss ihn endgültig verbrauchen.

   Aufgerufen wird der echte Handler — derselbe Standardexport, den
   server.mjs unter /api/registrierung/passwort einhängt.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, handler, A, R, P, T;

const LIMIT = 30000;
const GUT = "Nordwind und Sonne 1846";
const PROFIL = { vorname: "Rina", nachname: "Schmitt",
  betriebsname: "Wachdienst Nordlicht" };
const PW_ABLAGE = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";
const PFAD = "/api/registrierung/passwort";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-pw-http-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_BASIS = "https://app.centric-dienstplanung.de";
  delete process.env.RESEND_API_KEY;
  delete process.env.CENTRIC_PRUEFLINK;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  handler = (await import("../server/funktionen/registrierung.mjs")).default;
  A = await import("../server/lib/accounts.mjs");
  R = await import("../server/lib/registrierung.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  T = await import("../server/lib/token.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });

/* Der Gesamtzähler der Bremse lebt in der Ablage und würde spätere Tests
   bremsen; die Zählung je Herkunft lebt zusätzlich im Prozessspeicher, dagegen
   hilft nur eine eigene Absenderadresse je Test. */
beforeEach(async () => {
  const s = getStore({ name: "centric-takt", consistency: "strong" });
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let zaehler = 0;
const eigeneHerkunft = () =>
  `10.2.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

async function anfrage(rumpf = {}, {
  methode = "POST", pfad = PFAD, herkunft = null, origin = null, rohRumpf = null,
} = {}) {
  const kopf = { "content-type": "application/json",
    "x-forwarded-for": herkunft || eigeneHerkunft() };
  if (origin) kopf.origin = origin;
  const req = new Request(`http://127.0.0.1:3000${pfad}`, {
    method: methode,
    headers: kopf,
    ...(methode === "GET" || methode === "HEAD"
      ? {}
      : { body: rohRumpf !== null ? rohRumpf : JSON.stringify(rumpf) }),
  });
  const antwort = await handler(req);
  let daten = null;
  try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { antwort, status: antwort.status, daten, text: JSON.stringify(daten) };
}

/** Ein Konto bis zur bestätigten Adresse — mit Nachweis in der Hand. */
async function bereit(email, profil = PROFIL) {
  const s = laden();
  const briefe = [];
  const versand = async (an, betreff, text) => { briefe.push({ text }); return { ok: true, trocken: true }; };
  const start = await R.registrierungStarten(s, { ...profil, email, versand });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const link = /#token=([A-Za-z0-9_-]+)/.exec(briefe[0].text)[1];
  const v = await R.emailVerifizieren(s, { token: link });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  expect(v.fortsetzung).toBeTruthy();
  return { konto: await A.accountLesenPerId(s, v.accountId), nachweis: v.fortsetzung,
    neuerLink: async () => {
      await R.verifizierungErneutSenden(s, { email, versand });
      const l = /#token=([A-Za-z0-9_-]+)/.exec(briefe[briefe.length - 1].text)[1];
      const w = await R.emailVerifizieren(s, { token: l });
      return w.fortsetzung;
    } };
}

/** Wie viele gültige Nachweise liegen für dieses Konto? */
async function nachweise(accountId) {
  const s = laden();
  let n = 0;
  for (const b of (await s.list({ prefix: "token:" })).blobs) {
    const e = await s.get(b.key, { type: "json" }).catch(() => null);
    if (e && e.zweck === "einrichten" && e.accountId === accountId) n++;
  }
  return n;
}

async function keineNebenwirkungen() {
  const s = laden();
  for (const praefix of ["kern:", "bestand:", "mitglied:", "raummitglied:",
    "konto:", "t:", "sk:", "push:"]) {
    expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
  }
}

/* ==========================================================================
   DER ERFOLGSFALL
   ========================================================================== */

describe("POST /api/registrierung/passwort", () => {
  it("setzt das erste Passwort und macht den Zugang nutzbar", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("rina@example.org");
    const e = await anfrage({ fortsetzung: nachweis, passwort: GUT });

    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true });
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");
    expect(e.antwort.headers.get("x-content-type-options")).toBe("nosniff");

    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.status).toBe("aktiv");
    /* Der Prüfwert, nicht das Passwort. */
    expect(nach.passwort.startsWith("s1$")).toBe(true);
    expect(nach.passwort).not.toContain(GUT);
    expect(await P.passwortPruefen(GUT, nach.passwort)).toBe(true);
    expect(await P.passwortPruefen("etwas anderes 12345", nach.passwort)).toBe(false);
    expect(nach.passwortGeaendert).toBeTruthy();
    expect(nach.epoche).toBe(2);

    /* Was bleiben muss. */
    expect(nach.emailVerifiziertAm).toBe(konto.emailVerifiziertAm);
    expect(nach.profil).toEqual(konto.profil);
    expect(nach.testbetriebOffenSeit).toBe(konto.testbetriebOffenSeit);
    expect(nach.testbetriebVerbrauchtAm).toBe(null);
    expect(nach.testbetriebRaum).toBe(null);

    /* Der Nachweis ist verbraucht, und nichts weiter ist entstanden. */
    expect(await nachweise(konto.id)).toBe(0);
    await keineNebenwirkungen();

    /* Nirgends in der Ablage steht das Passwort im Klartext. */
    for (const b of (await s.list({})).blobs) {
      const roh = await s.get(b.key).catch(() => null);
      expect(String(roh || ""), b.key).not.toContain(GUT);
    }
    /* Und die Antwort nennt weder Passwort noch Prüfwert noch Kennung. */
    expect(e.text).not.toContain(GUT);
    expect(e.text).not.toContain("s1$");
    expect(e.text).not.toContain(konto.id);
    expect(e.text).not.toContain(nachweis);
  }, LIMIT);

  it("lässt den Nachweis unberührt, wenn das Passwort die Regel verletzt", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("regel@example.org");

    for (const schwach of ["kurz", "elfzeichen", "passwort1234", "centric-dienstplan",
      "x".repeat(201), 12345, null, {}]) {
      const e = await anfrage({ fortsetzung: nachweis, passwort: schwach });
      expect(e.status, String(schwach).slice(0, 12)).toBe(400);
      expect(e.daten.fehler).toBe("passwort");
      /* Der Hinweis kommt wörtlich aus passwoerter.mjs. */
      expect(typeof e.daten.hinweis).toBe("string");
      /* Kein Prüfwert, kein Schlüssel, kein Nachweis in der Antwort. */
      expect(e.text).not.toContain(nachweis);
      expect(e.text).not.toMatch(/account:|token:|s1\$/);
    }

    /* Nach acht Fehlversuchen ist der Nachweis noch da — und funktioniert. */
    expect(await nachweise(konto.id)).toBe(1);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    const gut = await anfrage({ fortsetzung: nachweis, passwort: GUT });
    expect(gut.status).toBe(200);
    expect((await A.accountLesenPerId(s, konto.id)).status).toBe("aktiv");
  }, LIMIT);

  it("lässt den Nachweis auch bei einem Verstoß gegen die Kontextregel stehen", async () => {
    /* Der Fall, für den die nicht verbrauchende Vorprüfung gebaut wurde: Die
       Kontextregel braucht die Adresse des Kontos — und darf den Nachweis
       trotzdem nicht kosten. */
    const s = laden();
    const { konto, nachweis } = await bereit("kontext@example.org");
    const e = await anfrage({ fortsetzung: nachweis,
      passwort: "kontext@example.org und mehr" });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("passwort");
    expect(e.daten.hinweis).toMatch(/Name oder Adresse/);

    expect(await nachweise(konto.id)).toBe(1);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    /* Ein anderes Passwort geht danach durch. */
    expect((await anfrage({ fortsetzung: nachweis, passwort: GUT })).status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   WAS DEN NACHWEIS NICHT ERSETZT
   ========================================================================== */

describe("Der Nachweis lässt sich nicht umgehen", () => {
  it("weist einen fehlenden, formlosen oder unbekannten Nachweis ab", async () => {
    const s = laden();
    const { konto } = await bereit("fehlt@example.org");
    const antworten = [];
    for (const fortsetzung of [undefined, null, "", "  ", "kurz", 42, {},
      "x".repeat(43), "A".repeat(60)]) {
      const e = await anfrage({ fortsetzung, passwort: GUT });
      antworten.push(`${e.status} ${e.text}`);
      expect(e.status, String(fortsetzung).slice(0, 10)).toBe(400);
      expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    }
    /* Alle Absagen sind nach außen nicht unterscheidbar. */
    expect(new Set(antworten).size).toBe(1);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
  }, LIMIT);

  it("nimmt weder Kontokennung noch Adresse als Berechtigung", async () => {
    const s = laden();
    const { konto } = await bereit("kennung@example.org");
    /* Genau der Angriff, den es vor 32A gab: Wer die Kennung kennt, darf
       nichts. Auch nicht mit der Adresse. */
    for (const rumpf of [
      { accountId: konto.id, passwort: GUT },
      { email: "kennung@example.org", passwort: GUT },
      { fortsetzung: konto.id, passwort: GUT },
      { fortsetzung: konto.emailNorm, passwort: GUT },
      { accountId: konto.id, fortsetzung: konto.id, passwort: GUT },
    ]) {
      const e = await anfrage(rumpf);
      expect(e.status, JSON.stringify(rumpf).slice(0, 40)).toBe(400);
      expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    }
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    expect((await A.accountLesenPerId(s, konto.id)).status).toBe("eingeladen");
  }, LIMIT);

  it("weist einen Nachweis mit falschem Zweck ab", async () => {
    const s = laden();
    const { konto } = await bereit("zweck@example.org");
    const nr = (await A.accountLesenPerId(s, konto.id)).tokenNr;
    /* Richtig geformt, auf dieses Konto ausgestellt, passende Laufnummer —
       allein der Zweck ist falsch. */
    for (const zweck of ["verifizierung", "zuruecksetzen", "einladung"]) {
      const fremd = await T.tokenAusstellen(s, { zweck, nr: nr[zweck],
        inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
      const e = await anfrage({ fortsetzung: fremd.token, passwort: GUT });
      expect(e.status, zweck).toBe(400);
      expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    }
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
  }, LIMIT);

  it("weist einen abgelaufenen Nachweis ab", async () => {
    /* Über die Geschäftslogik mit eingespeister Uhr — der Handler hat keine. */
    const s = laden();
    const T0 = new Date("2026-09-26T08:00:00.000Z").getTime();
    const uhr = (ms) => () => ms;
    const briefe = [];
    const versand = async (an, b, text) => { briefe.push({ text }); return { ok: true, trocken: true }; };
    await R.registrierungStarten(s, { ...PROFIL, email: "frist@example.org",
      versand, jetzt: uhr(T0) });
    const link = /#token=([A-Za-z0-9_-]+)/.exec(briefe[0].text)[1];
    const v = await R.emailVerifizieren(s, { token: link, jetzt: uhr(T0) });

    /* Eine Minute vor Ablauf: angenommen. Erst prüfen, dass es zu spät nicht
       geht — mit einem zweiten Nachweis. */
    const spaet = await R.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung,
      passwort: GUT, jetzt: uhr(T0 + 15 * 60 * 1000 + 1) });
    expect(spaet.ok).toBe(false);
    expect(spaet.grund).toBe("nachweis");
    expect((await A.accountLesenPerId(s, v.accountId)).passwort).toBe(null);
    /* Der abgelaufene Nachweis bleibt wirkungslos, auch danach. */
    const nochmal = await R.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung,
      passwort: GUT, jetzt: uhr(T0 + 16 * 60 * 1000) });
    expect(nochmal.ok).toBe(false);

    /* Innerhalb der Frist geht es. */
    const rechtzeitig = await R.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung,
      passwort: GUT, jetzt: uhr(T0 + 14 * 60 * 1000) });
    expect(rechtzeitig.ok, rechtzeitig.grund).toBe(true);
  }, LIMIT);

  it("weist einen verbrauchten Nachweis ab und setzt kein zweites Passwort", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("verbraucht@example.org");
    expect((await anfrage({ fortsetzung: nachweis, passwort: GUT })).status).toBe(200);
    const nachErstem = await A.accountLesenPerId(s, konto.id);

    /* Derselbe Nachweis ein zweites Mal. */
    const zweite = await anfrage({ fortsetzung: nachweis,
      passwort: "Ein ganz anderes 99" });
    expect(zweite.status).toBe(400);
    expect(zweite.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    /* Das Passwort ist unverändert. */
    const nachZweitem = await A.accountLesenPerId(s, konto.id);
    expect(nachZweitem.passwort).toBe(nachErstem.passwort);
    expect(nachZweitem.epoche).toBe(nachErstem.epoche);
    expect(await P.passwortPruefen(GUT, nachZweitem.passwort)).toBe(true);
  }, LIMIT);

  it("weist einen älteren Nachweis ab, wenn ein neuerer ausgestellt wurde", async () => {
    const s = laden();
    const { konto, nachweis, neuerLink } = await bereit("zwei@example.org");
    const zweiter = await neuerLink();
    expect(zweiter).toBeTruthy();
    expect(zweiter).not.toBe(nachweis);

    const alt = await anfrage({ fortsetzung: nachweis, passwort: GUT });
    expect(alt.status).toBe(400);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);

    const neu = await anfrage({ fortsetzung: zweiter, passwort: GUT });
    expect(neu.status).toBe(200);
    expect((await A.accountLesenPerId(s, konto.id)).status).toBe("aktiv");
  }, LIMIT);

  it("weist ein Konto ohne bestätigte Adresse ab", async () => {
    const s = laden();
    /* Ein Nachweis, der auf ein unbestätigtes Konto zeigt — von Hand
       ausgestellt, wie ihn kein Weg der Anwendung erzeugt. */
    const konto = (await A.accountAnlegen(s, { email: "unbestaetigt@example.org",
      profil: PROFIL, selbstbedienung: true })).account;
    const gezaehlt = await A.tokenNrErhoehen(s, konto.id, "einrichten");
    const nachweis = await T.tokenAusstellen(s, { zweck: "einrichten", nr: gezaehlt.nr,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });

    const e = await anfrage({ fortsetzung: nachweis.token, passwort: GUT });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    /* Und der Nachweis ist dabei nicht verbraucht worden — der Zustand des
       Kontos wird vor dem Einlösen geprüft. */
    expect(await nachweise(konto.id)).toBe(1);
  }, LIMIT);

  it("weist ein gesperrtes Konto ab", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("gesperrt@example.org");
    await A.accountSperren(s, konto.id);
    const e = await anfrage({ fortsetzung: nachweis, passwort: GUT });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    /* Die Absage ist dieselbe wie bei einem unbekannten Nachweis — eine
       Sperre ist keine Auskunft. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.passwort).toBe(null);
    expect(nach.status).toBe("gesperrt");
  }, LIMIT);

  it("weist ein Konto ab, das schon ein Passwort hat", async () => {
    const s = laden();
    const konto = (await A.accountAnlegen(s, { email: "hatpw@example.org",
      profil: PROFIL, selbstbedienung: true, passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString() })).account;
    const gezaehlt = await A.tokenNrErhoehen(s, konto.id, "einrichten");
    const nachweis = await T.tokenAusstellen(s, { zweck: "einrichten", nr: gezaehlt.nr,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });

    const e = await anfrage({ fortsetzung: nachweis.token, passwort: GUT });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(PW_ABLAGE);
  }, LIMIT);

  it("weist einen Nachweis ab, dessen Adresse nicht zum Konto passt", async () => {
    const s = laden();
    const { konto } = await bereit("bindung-a@example.org");
    const gezaehlt = await A.tokenNrErhoehen(s, konto.id, "einrichten");
    /* Kennung von A, Adresse von irgendwo — die Inhaltsbindung greift. */
    const krumm = await T.tokenAusstellen(s, { zweck: "einrichten", nr: gezaehlt.nr,
      inhalt: { accountId: konto.id, emailNorm: "fremd@example.org" } });
    const e = await anfrage({ fortsetzung: krumm.token, passwort: GUT });
    expect(e.status).toBe(400);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
  }, LIMIT);
});

/* ==========================================================================
   PARALLELITÄT UND FEHLER
   ========================================================================== */

describe("Parallele Aufrufe und Fehler beim Schreiben", () => {
  it("setzt bei acht gleichzeitigen Aufrufen mit demselben Nachweis genau einmal", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("parallel@example.org");
    const acht = await Promise.all(Array.from({ length: 8 }, () =>
      anfrage({ fortsetzung: nachweis, passwort: GUT })));
    const gelungen = acht.filter((x) => x.status === 200);
    expect(gelungen.length).toBe(1);
    for (const x of acht.filter((y) => y.status !== 200)) {
      expect(x.daten.fehler).toBe("ungueltiger-oder-abgelaufener-vorgang");
    }
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.status).toBe("aktiv");
    /* Genau eine Passwortsetzung: die Epoche ist einmal gestiegen. */
    expect(nach.epoche).toBe(2);
    expect(await nachweise(konto.id)).toBe(0);
    await keineNebenwirkungen();
  }, LIMIT);

  it("setzt bei parallelen Aufrufen mit verschiedenen Nachweisen genau einmal", async () => {
    /* Zwei Bestätigungen ergeben zwei Nachweise, von denen nur der neueste
       gilt — aber beide werden gleichzeitig eingereicht. */
    const s = laden();
    const { konto, nachweis, neuerLink } = await bereit("zweiparallel@example.org");
    const zweiter = await neuerLink();
    const beide = await Promise.all([
      anfrage({ fortsetzung: nachweis, passwort: GUT }),
      anfrage({ fortsetzung: zweiter, passwort: "Sonne und Nordwind 1846" }),
      anfrage({ fortsetzung: nachweis, passwort: GUT }),
      anfrage({ fortsetzung: zweiter, passwort: "Sonne und Nordwind 1846" }),
    ]);
    expect(beide.filter((x) => x.status === 200).length).toBe(1);
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.status).toBe("aktiv");
    expect(nach.epoche).toBe(2);
    /* Und zwar mit dem Passwort des neueren Nachweises. */
    expect(await P.passwortPruefen("Sonne und Nordwind 1846", nach.passwort)).toBe(true);
    expect(await P.passwortPruefen(GUT, nach.passwort)).toBe(false);
  }, LIMIT);

  it("belebt den Nachweis nicht wieder, wenn das Schreiben scheitert", async () => {
    /* Der Rest, der ohne Transaktion bleibt: Der Nachweis ist eingelöst, das
       Passwort nicht geschrieben. Er wird NICHT wiederbelebt — der Weg zurück
       ist ein neuer Bestätigungslink. */
    const s = laden();
    const { konto, nachweis, neuerLink } = await bereit("klemmt@example.org");
    const kontoKey = A.accountSchluessel("klemmt@example.org");
    const stur = new Proxy(s, {
      get(ziel, name) {
        if (name !== "setJSON") return Reflect.get(ziel, name);
        return (key, ...rest) => (key === kontoKey
          ? Promise.reject(new Error("Platte voll beim Konto"))
          : ziel.setJSON(key, ...rest));
      },
    });

    const e = await R.passwortMitNachweisSetzen(stur, { fortsetzung: nachweis,
      passwort: GUT });
    expect(e.ok).toBe(false);
    expect(e.hinweis).toMatch(/neuen Bestätigungslink/);

    /* Kein Passwort, Konto unverändert — und der Nachweis ist weg. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.passwort).toBe(null);
    expect(nach.status).toBe("eingeladen");
    expect(nach.emailVerifiziertAm).toBeTruthy();
    expect(await nachweise(konto.id)).toBe(0);
    /* Ein zweiter Versuch mit demselben Nachweis läuft ins Leere. */
    expect((await anfrage({ fortsetzung: nachweis, passwort: GUT })).status).toBe(400);

    /* Der dokumentierte Weg zurück: neuer Link, neuer Nachweis, fertig. */
    const dritter = await neuerLink();
    expect((await anfrage({ fortsetzung: dritter, passwort: GUT })).status).toBe(200);
    expect((await A.accountLesenPerId(s, konto.id)).status).toBe("aktiv");
  }, LIMIT);
});

/* ==========================================================================
   HTTP-SCHUTZ
   ========================================================================== */

describe("Der Schutz des Endpunkts", () => {
  it("lässt nur POST zu", async () => {
    const { nachweis } = await bereit("methode@example.org");
    for (const methode of ["GET", "PUT", "DELETE", "PATCH"]) {
      const e = await anfrage({ fortsetzung: nachweis, passwort: GUT }, { methode });
      expect(e.status, methode).toBe(405);
      expect(e.daten.fehler).toBe("nur-post");
    }
  }, LIMIT);

  it("weist fremde Herkunft ab und lässt die eigene durch", async () => {
    const s = laden();
    const { konto, nachweis } = await bereit("herkunft@example.org");
    const fremd = await anfrage({ fortsetzung: nachweis, passwort: GUT },
      { origin: "https://beispiel.invalid" });
    expect(fremd.status).toBe(403);
    expect(fremd.daten.fehler).toBe("fremde-herkunft");
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    /* Der Nachweis ist dabei nicht verbraucht. */
    expect(await nachweise(konto.id)).toBe(1);

    const eigen = await anfrage({ fortsetzung: nachweis, passwort: GUT },
      { origin: "http://127.0.0.1:3000" });
    expect(eigen.status).toBe(200);
  }, LIMIT);

  it("beantwortet kaputtes JSON und einen zu großen Rumpf als Eingabefehler", async () => {
    const kaputt = await anfrage({}, { rohRumpf: "{kein json" });
    expect(kaputt.status).toBe(400);
    expect(kaputt.daten.fehler).toBe("kaputtes-json");

    const liste = await anfrage({}, { rohRumpf: "[1,2]" });
    expect(liste.status).toBe(400);
    expect(liste.daten.fehler).toBe("kein-objekt");

    const gross = await anfrage({}, {
      rohRumpf: JSON.stringify({ passwort: "x".repeat(20000) }) });
    expect(gross.status).toBe(413);
    expect(gross.daten.fehler).toBe("zu-gross");
    for (const e of [kaputt, liste, gross]) {
      expect(e.text).not.toMatch(/at Object|\.mjs|SyntaxError/);
    }
  }, LIMIT);

  it("bremst zu viele Versuche je Herkunft", async () => {
    const herkunft = "203.0.113.200";
    const { nachweis } = await bereit("bremse@example.org");
    let gebremst = 0;
    /* Zehn Versuche sind frei, der elfte nicht. Gezählt wird jeder Versuch,
       auch ein abgelehnter — sonst wäre die Bremse mit falschen Passwörtern
       zu umgehen. */
    for (let n = 0; n < 12; n++) {
      const e = await anfrage({ fortsetzung: nachweis, passwort: "zu kurz" },
        { herkunft });
      if (e.status === 429) {
        gebremst++;
        expect(Number(e.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(e.antwort.headers.get("cache-control")).toBe("no-store");
      }
    }
    expect(gebremst).toBeGreaterThan(0);
    /* Eine andere Herkunft ist unberührt. */
    const andere = await anfrage({ fortsetzung: nachweis, passwort: GUT },
      { herkunft: "203.0.113.201" });
    expect(andere.status).toBe(200);
  }, LIMIT);

  it("nennt weder Nachweis noch Passwort im Protokoll", async () => {
    const spur = getStore({ name: "centric-spur" });
    const { nachweis } = await bereit("protokoll@example.org");
    await anfrage({ fortsetzung: nachweis, passwort: GUT });

    const tag = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${tag}/passwort-setzen/` });
    expect(blobs.length).toBeGreaterThan(0);
    let text = "";
    for (const b of blobs) {
      const z = await spur.get(b.key, { type: "json" }).catch(() => null);
      if (z) text += JSON.stringify(z);
    }
    expect(text).not.toContain(nachweis);
    expect(text).not.toContain(GUT);
    expect(text).not.toContain("protokoll@example.org");
    expect(text).toContain("passwort-setzen");
  }, LIMIT);

  it("kennt den Pfad genau und nichts daneben", async () => {
    const { nachweis } = await bereit("pfad@example.org");
    for (const pfad of ["/api/registrierung/passwort/", "/api/registrierung/passwortx",
      "/api/registrierung/passwort/neu"]) {
      const e = await anfrage({ fortsetzung: nachweis, passwort: GUT }, { pfad });
      /* Der abschließende Schrägstrich wird abgeschnitten — alles andere ist
         ein unbekannter Pfad. */
      if (pfad.endsWith("/")) expect(e.status, pfad).toBe(200);
      else expect(e.status, pfad).toBe(404);
    }
  }, LIMIT);
});

/* ==========================================================================
   DIE ANDEREN WEGE BLEIBEN, WIE SIE WAREN
   ========================================================================== */

describe("Einladung und Zurücksetzen bleiben unberührt", () => {
  it("lässt die Fristen und Zwecke der anderen Token unverändert", async () => {
    expect(T.ZWECKE).toEqual(["einladung", "verifizierung", "zuruecksetzen", "einrichten"]);
    expect(T.FRISTEN.einladung).toBe(7 * 24 * 60);
    expect(T.FRISTEN.verifizierung).toBe(24 * 60);
    expect(T.FRISTEN.zuruecksetzen).toBe(30);
    expect(T.FRISTEN.einrichten).toBe(15);
  }, LIMIT);

  it("setzt mit einem Einladungs- oder Rücksetztoken kein Passwort", async () => {
    const s = laden();
    const { konto } = await bereit("andere@example.org");
    for (const zweck of ["einladung", "zuruecksetzen"]) {
      const gezaehlt = await A.tokenNrErhoehen(s, konto.id, zweck);
      const fremd = await T.tokenAusstellen(s, { zweck, nr: gezaehlt.nr,
        inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
      const e = await anfrage({ fortsetzung: fremd.token, passwort: GUT });
      expect(e.status, zweck).toBe(400);
      /* Und das fremde Token ist dabei nicht verbraucht worden: Der Blick
         verbraucht nichts. */
      const gesehen = await T.tokenAnsehen(s, fremd.token, { zweck });
      expect(gesehen.eintrag, zweck).not.toBe(null);
    }
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
  }, LIMIT);

  it("bindet den Blick an nichts — er erlaubt allein gar nichts", async () => {
    /* tokenAnsehen darf beliebig oft aufgerufen werden und verändert nichts.
       Es ist ausdrücklich keine Berechtigung. */
    const s = laden();
    const { konto, nachweis } = await bereit("blick@example.org");
    for (let n = 0; n < 5; n++) {
      const gesehen = await T.tokenAnsehen(s, nachweis, { zweck: "einrichten" });
      expect(gesehen.eintrag.accountId).toBe(konto.id);
    }
    expect(await nachweise(konto.id)).toBe(1);
    expect((await A.accountLesenPerId(s, konto.id)).passwort).toBe(null);
    /* Erst das Einlösen wirkt. */
    expect((await anfrage({ fortsetzung: nachweis, passwort: GUT })).status).toBe(200);
    expect((await T.tokenAnsehen(s, nachweis, { zweck: "einrichten" })).eintrag).toBe(null);
  }, LIMIT);

  it("hängt unter dem erwarteten Pfad im Server", async () => {
    const modul = await import("../server/funktionen/registrierung.mjs");
    expect(modul.config.path).toContain("/api/registrierung/passwort");
    const quelle = await readFile(
      new URL("../server/funktionen/registrierung.mjs", import.meta.url), "utf8");
    /* Kein eigenes scrypt, keine eigene Regel, keine Sitzung. */
    for (const name of ["passwortAblegen", "pruefeRegel", "passwortSetzen",
      "sitzungAnlegen", "tokenEinloesen", "tokenAnsehen"]) {
      expect(new RegExp(String.raw`\b${name}\s*\(`).test(quelle), name).toBe(false);
    }
    expect(quelle).not.toMatch(/node:crypto/);
    expect(quelle).not.toMatch(/\bconsole\s*\./);
  }, LIMIT);
});
