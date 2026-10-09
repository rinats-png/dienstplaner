/* ==========================================================================
   ANMELDUNG MIT ACCOUNT — E-Mail, Passwort, Sitzung

   Diese Prüfung hält drei Dinge fest, und das dritte ist das wichtigste:

     1. Nur die richtige Kombination aus Adresse und Passwort meldet an —
        und jede Absage sieht gleich aus.
     2. Eine Sitzung läuft ab, lässt sich beenden und stirbt, wenn das
        Passwort wechselt oder der Zugang gesperrt wird.
     3. Eine gültige Account-Sitzung berechtigt zu NICHTS. Sie nennt keinen
        Betrieb, keine Rolle, keine Person; sie ist keine Arbeitssitzung,
        und die Rechteprüfung leitet aus ihr kein einziges Recht ab.

   Der letzte Punkt ist der Grund, warum es überhaupt eine zweite
   Sitzungsart gibt. Fiele er, wäre eine Anmeldung mit E-Mail-Adresse der
   kürzeste Weg in einen fremden Betrieb.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, getStore, AN, AS, A, P, S, R;

/* scrypt und die echte Dateiablage brauchen mehr als die fünf Sekunden,
   die vitest vorgibt — dieselbe Erhöhung wie in sitzungen.test.js. */
const LIMIT = 30000;

const GUT = "Nordwind und Sonne 1846";
const ANDERS = "Sieben Raben auf dem Dach";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-anmeldung-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  AN = await import("../server/lib/accountanmeldung.mjs");
  AS = await import("../server/lib/accountsitzungen.mjs");
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  S = await import("../server/lib/sitzungen.mjs");
  R = await import("../server/lib/rechte.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzungsAblage = () =>
  getStore({ name: "centric-accountsitzungen", consistency: "strong" });
const legacyAblage = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/* Eine Anfrage ist für die Legacy-Sitzungen nur ihr Kopf. */
const anfrage = (token) => ({
  headers: { get: (n) => (n === "authorization" && token ? `Bearer ${token}` : null) },
});

const uhr = (start = Date.UTC(2026, 9, 1, 8, 0, 0)) => {
  let t = start;
  return { jetzt: () => t, vor: (ms) => { t += ms; }, stand: () => t };
};
const MINUTE = 60 * 1000, STUNDE = 60 * MINUTE;

let zaehler = 0;
const adresse = (was) => `${was}-${++zaehler}@example.org`;

/**
 * Wartet, bis der Zugriffszeitpunkt einer Sitzung in der Ablage steht — und
 * stößt ihn notfalls noch einmal an.
 *
 * `accountSitzungLesen` schreibt `zuletzt` absichtlich ohne await und
 * schluckt einen Fehler dabei (`.catch(() => {})`): Eine Anfrage soll nicht
 * auf vier Dateisystemschritte warten, und ein misslungenes Fortschreiben
 * macht die gerade bestandene Prüfung nicht nachträglich ungültig. Zugesagt
 * ist also nicht, dass EIN Versuch gelingt, sondern dass der Wert
 * fortgeschrieben wird — spätestens beim nächsten Zugriff.
 *
 * Genau das tut diese Hilfe: warten, und wenn der Wert ausbleibt, noch einmal
 * echt zugreifen. Unter Windows ist das nötig, weil das atomare Umbenennen
 * mit EPERM scheitert, solange dieselbe Datei gelesen wird — und diese
 * Prüfung liest sie im Zehn-Millisekunden-Takt. Unter Linux gelingt der
 * erste Versuch.
 *
 * Wichtig ist, was NICHT geschieht: Der erneute Zugriff ist ein echter
 * `sitzungPruefen`-Aufruf mit derselben Uhr. Er verschiebt keine Frist —
 * `accountSitzungLesen` prüft `bis` VOR dem Fortschreiben und schreibt
 * `bis` nie —, und er muss gelingen: Ein verlorener Schreibvorgang darf
 * keine Sitzung entwerten. Bleibt der Wert auch nach mehreren echten
 * Zugriffen aus, ist das ein Fehler und die Prüfung fällt.
 *
 * @param {object} store
 * @param {string} token
 * @param {() => number} jetzt
 * @param {number} ziel
 */
async function warteAufZuletzt(store, token, jetzt, ziel) {
  /* Die Aktivität steht seit Phase A.1 in einem eigenen Schlüssel (az:), nicht
     mehr im Datensatz der Sitzung (as:) — der bleibt nach dem Anlegen
     unverändert, damit ein verspätetes Fortschreiben ihn nach einem Logout nie
     wieder anlegen kann. */
  const stand = () => sitzungsAblage().get(`az:${hash(token)}`, { type: "json" });
  let letzter = null;
  for (let anlauf = 0; anlauf < 12; anlauf++) {
    /* Erst warten, OHNE zu lesen. Das ist der entscheidende Punkt: Unter
       Windows scheitert das atomare Umbenennen, solange irgendjemand
       dieselbe Datei offen hält — eine Leseschleife im
       Zehn-Millisekunden-Takt verhindert das Fortschreiben also selbst,
       und zwar dauerhaft. Deshalb je Anlauf genau ein Lesevorgang. */
    await new Promise((r) => setTimeout(r, 40));
    const roh = await stand();
    letzter = roh && roh.zuletzt;
    if (roh && Number(roh.zuletzt) === ziel) return;
    /* Noch nicht da. Also noch einmal zugreifen — wie im Betrieb die
       nächste Anfrage. Und dabei festhalten, dass der verlorene
       Schreibvorgang die Sitzung nicht beschädigt hat. */
    const p = await AN.sitzungPruefen(store, token, { jetzt });
    expect(p.ok, `erneuter Zugriff nach verlorenem Fortschreiben (Anlauf ${anlauf + 1})`)
      .toBe(true);
  }
  throw new Error(`zuletzt erreichte ${ziel} nicht — zuletzt = ${letzter} `
    + "nach zwölf echten Zugriffen.");
}

/**
 * Ein vollständig angemeldefähiger Account: Adresse bestätigt, Passwort
 * gesetzt, damit Status „aktiv" und Epoche 2.
 */
async function konto(store, email, passwort = GUT) {
  const e = await A.accountAnlegen(store, { email });
  if (!e.ok) throw new Error(`Account nicht angelegt: ${e.grund}`);
  await A.emailBestaetigen(store, e.account.id);
  const gesetzt = await A.passwortSetzen(store, e.account.id,
    await P.passwortAblegen(passwort));
  if (!gesetzt.ok) throw new Error("Passwort nicht gesetzt");
  return gesetzt.account;
}

/* --------------------------------------------------------------------------
   ANMELDEN
   -------------------------------------------------------------------------- */

describe("Eine Anmeldung gelingt genau mit der richtigen Kombination", () => {
  it("meldet mit Adresse und Passwort an und gibt ein Merkmal zurück", async () => {
    const s = laden();
    const u = uhr();
    const k = await konto(s, adresse("gut"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT, jetzt: u.jetzt });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(typeof e.token).toBe("string");
    expect(e.token.length).toBeGreaterThanOrEqual(40);
    expect(e.accountId).toBe(k.id);
    expect(e.epoche).toBe(2);
    expect(e.gueltigBis).toBe(u.stand() + AS.DAUER);
  }, LIMIT);

  it("normalisiert die Adresse — Großschreibung und Rand zählen nicht", async () => {
    const s = laden();
    const k = await konto(s, adresse("norm"));
    const laut = `  ${k.email.toUpperCase()}  `;
    const e = await AN.anmelden(s, { email: laut, passwort: GUT });
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.accountId).toBe(k.id);
  }, LIMIT);

  it("gibt weder Prüfwert noch Kontodatensatz heraus", async () => {
    const s = laden();
    const k = await konto(s, adresse("stumm"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    expect(e.ok).toBe(true);
    const text = JSON.stringify(e);
    expect(text).not.toContain("s1$");
    expect(text).not.toContain(GUT);
    expect(Object.keys(e).sort())
      .toEqual(["accountId", "epoche", "gueltigBis", "ok", "token"]);
  }, LIMIT);

  it("vermerkt den Zeitpunkt der Anmeldung im Account", async () => {
    const s = laden();
    const k = await konto(s, adresse("vermerk"));
    expect(k.letzteAnmeldung).toBe(null);
    await AN.anmelden(s, { email: k.email, passwort: GUT });
    const stand = await A.accountLesenPerId(s, k.id);
    expect(typeof stand.letzteAnmeldung).toBe("string");
    /* Und die Epoche bleibt, wie sie war: Eine Anmeldung beendet keine
       andere Sitzung. */
    expect(stand.epoche).toBe(2);
  }, LIMIT);

  it("erhöht die Epoche nicht und rechnet den Prüfwert nicht neu", async () => {
    const s = laden();
    const k = await konto(s, adresse("stabil"));
    const vorher = (await A.accountLesenPerId(s, k.id)).passwort;
    await AN.anmelden(s, { email: k.email, passwort: GUT });
    const nachher = await A.accountLesenPerId(s, k.id);
    expect(nachher.passwort).toBe(vorher);
    expect(nachher.epoche).toBe(2);
  }, LIMIT);
});

describe("Jede Absage sieht gleich aus", () => {
  it("weist ein falsches Passwort ab", async () => {
    const s = laden();
    const k = await konto(s, adresse("falsch"));
    const e = await AN.anmelden(s, { email: k.email, passwort: ANDERS });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.grund).toBe("passwort");
    expect(e.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
    expect("token" in e).toBe(false);
  }, LIMIT);

  it("weist eine unbekannte Adresse ab", async () => {
    const s = laden();
    const e = await AN.anmelden(s, { email: adresse("niemand"), passwort: GUT });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.grund).toBe("unbekannt");
    expect(e.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
  }, LIMIT);

  it("weist eine unbrauchbare Eingabe ab, ohne zu rechnen", async () => {
    const s = laden();
    for (const email of [null, undefined, "", "keineadresse", "a@", "@b.de",
      "zwei@@example.org", 42, {}]) {
      const e = await AN.anmelden(s, { email, passwort: GUT });
      expect(e.ok).toBe(false);
      if (!e.ok) {
        expect(e.grund).toBe("adresse");
        expect(e.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
      }
    }
  }, LIMIT);

  it("weist einen Account ohne Passwort ab", async () => {
    const s = laden();
    const e = await A.accountAnlegen(s, { email: adresse("ohnepw") });
    await A.emailBestaetigen(s, e.account.id);
    for (const passwort of [GUT, "", null, undefined]) {
      const a = await AN.anmelden(s, { email: e.account.email, passwort });
      expect(a.ok).toBe(false);
      if (!a.ok) {
        expect(a.grund).toBe("ohne-passwort");
        expect(a.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
      }
    }
  }, LIMIT);

  it("weist einen Account mit unbestätigter Adresse ab", async () => {
    const s = laden();
    /* Passwort gesetzt, Adresse nicht bestätigt: Der Status springt dabei
       auf „aktiv", die Bestätigung fehlt trotzdem — und genau das muss die
       Anmeldung sehen. */
    const e = await A.accountAnlegen(s, { email: adresse("unbest") });
    await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
    const a = await AN.anmelden(s, { email: e.account.email, passwort: GUT });
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.grund).toBe("unbestaetigt");
      expect(a.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
    }
  }, LIMIT);

  it("weist einen gesperrten Account ab, auch mit richtigem Passwort", async () => {
    const s = laden();
    const k = await konto(s, adresse("gesperrt"));
    await A.accountSperren(s, k.id);
    const a = await AN.anmelden(s, { email: k.email, passwort: GUT });
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.grund).toBe("gesperrt");
      expect(a.hinweis).toBe(AN.HINWEIS_ANMELDUNG);
    }
  }, LIMIT);

  it("nennt bei einem eingeladenen Account das fehlende Passwort zuerst",
    async () => {
      /* Die Reihenfolge der Prüfungen ist Absicht: Ohne Prüfwert ist die
         Antwort „ohne-passwort", nicht „nicht-aktiv" — der Zustand des
         Kontos wird erst nach dem Passwort betrachtet. */
      const s = laden();
      const e = await A.accountAnlegen(s, { email: adresse("eingeladen") });
      const a = await AN.anmelden(s, { email: e.account.email, passwort: GUT });
      expect(a.ok).toBe(false);
      if (!a.ok) expect(a.grund).toBe("ohne-passwort");
    }, LIMIT);

  it("nennt bei falschem Passwort niemals den Zustand des Kontos", async () => {
    /* Wer das Passwort nicht hat, erfährt nicht, dass ein Konto gesperrt
       oder unbestätigt ist — sonst wäre die Fehlermeldung ein
       Verzeichnisdienst. */
    const s = laden();
    const g = await konto(s, adresse("sperr-falsch"));
    await A.accountSperren(s, g.id);
    const a = await AN.anmelden(s, { email: g.email, passwort: ANDERS });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.grund).toBe("passwort");

    const u = await A.accountAnlegen(s, { email: adresse("unbest-falsch") });
    await A.passwortSetzen(s, u.account.id, await P.passwortAblegen(GUT));
    const b = await AN.anmelden(s, { email: u.account.email, passwort: ANDERS });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.grund).toBe("passwort");
  }, LIMIT);

  it("antwortet in allen Fällen mit demselben Satz", async () => {
    const s = laden();
    const k = await konto(s, adresse("gleich"));
    const g = await konto(s, adresse("gleich-sperr"));
    await A.accountSperren(s, g.id);
    const o = await A.accountAnlegen(s, { email: adresse("gleich-ohne") });
    await A.emailBestaetigen(s, o.account.id);

    const hinweise = new Set();
    for (const versuch of [
      { email: k.email, passwort: ANDERS },
      { email: adresse("gleich-fremd"), passwort: GUT },
      { email: g.email, passwort: GUT },
      { email: o.account.email, passwort: GUT },
      { email: "unsinn", passwort: GUT },
    ]) {
      const e = await AN.anmelden(s, versuch);
      expect(e.ok).toBe(false);
      if (!e.ok) hinweise.add(e.hinweis);
    }
    expect([...hinweise]).toEqual([AN.HINWEIS_ANMELDUNG]);
  }, LIMIT);
});

describe("Eine unbekannte Adresse kostet dieselbe Rechenzeit", () => {
  it("rechnet auch ohne Account gegen einen Blindwert", async () => {
    /* Ohne diesen Blindwert wäre die Antwortzeit ein Verzeichnisdienst:
       „kenne ich nicht" käme in einer Millisekunde, „falsches Passwort"
       erst nach einem scrypt-Durchlauf. Gemessen wird der Medianwert aus
       drei Läufen; verglichen wird großzügig, denn hier geht es um den
       Unterschied zwischen 100 Millisekunden und 1 Millisekunde, nicht um
       ein paar Prozent.

       Der Blindwert wird vorher einmal warmgelaufen — er entsteht erst
       beim ersten Bedarf, und dieser eine Durchlauf würde die erste
       Messung verfälschen. */
    const s = laden();
    const k = await konto(s, adresse("takt"));
    await AN.anmelden(s, { email: adresse("takt-warm"), passwort: GUT });

    const messe = async (versuch) => {
      const zeiten = [];
      for (let i = 0; i < 3; i++) {
        const t0 = process.hrtime.bigint();
        await AN.anmelden(s, versuch());
        zeiten.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      return zeiten.sort((a, b) => a - b)[1];
    };

    const falsch = await messe(() => ({ email: k.email, passwort: ANDERS }));
    const unbekannt = await messe(() => ({ email: adresse("takt-x"), passwort: ANDERS }));
    expect(falsch).toBeGreaterThan(5);
    expect(unbekannt).toBeGreaterThan(falsch * 0.3);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   DIE SITZUNG
   -------------------------------------------------------------------------- */

describe("Die Sitzung entsteht in der eigenen Ablage", () => {
  it("legt genau einen Datensatz an, unter dem Prüfwert des Merkmals", async () => {
    const s = laden();
    const k = await konto(s, adresse("anlage"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    expect(e.ok).toBe(true);
    if (!e.ok) return;

    const sitz = sitzungsAblage();
    const roh = await sitz.get(`as:${hash(e.token)}`, { type: "json" });
    expect(roh).toBeTruthy();
    expect(roh.accountId).toBe(k.id);
    expect(roh.epoche).toBe(2);
    expect(roh.art).toBe("konto");
    /* Der Klartext des Merkmals steht nirgends in der Ablage. */
    const { blobs } = await sitz.list({ prefix: "as:" });
    for (const b of blobs) {
      expect(b.key).not.toContain(e.token);
      const inhalt = JSON.stringify(await sitz.get(b.key, { type: "json" }));
      expect(inhalt).not.toContain(e.token);
    }
  }, LIMIT);

  it("trägt keinen Betrieb, keine Rolle und keine Person", async () => {
    const s = laden();
    const k = await konto(s, adresse("leer"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const roh = await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" });
    expect(Object.keys(roh).sort())
      .toEqual(["accountId", "art", "bis", "epoche", "seit", "zuletzt"]);
    for (const feld of ["bestand", "rolle", "person", "betrieb", "einheit",
      "konto", "demo", "name", "nurSicherung"]) {
      expect(Object.prototype.hasOwnProperty.call(roh, feld), feld).toBe(false);
    }
  }, LIMIT);

  it("nimmt von einem Aufrufer keine zusätzlichen Felder an", async () => {
    /* `accountSitzungAnlegen` hat kein Durchreichen: Wer Rolle oder Raum
       mitgibt, bekommt sie nicht in den Datensatz. */
    const e = await AS.accountSitzungAnlegen(
      /** @type {any} */ ({ accountId: "a_fremd", epoche: 1, rolle: "leitung",
        bestand: "t-fremd", person: "p_1", nurSicherung: true }));
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const roh = await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" });
    expect(Object.keys(roh).sort())
      .toEqual(["accountId", "art", "bis", "epoche", "seit", "zuletzt"]);
  }, LIMIT);

  it("weist eine Anlage ohne Kennung oder mit unsinniger Epoche ab", async () => {
    for (const felder of [{}, { accountId: "" }, { accountId: 7, epoche: 1 },
      { accountId: "a_x" }, { accountId: "a_x", epoche: 0 },
      { accountId: "a_x", epoche: -1 }, { accountId: "a_x", epoche: 1.5 },
      { accountId: "a_x", epoche: "zwei" }]) {
      const e = await AS.accountSitzungAnlegen(/** @type {any} */ (felder));
      expect(e.ok, JSON.stringify(felder)).toBe(false);
    }
  }, LIMIT);

  it("liefert ein Merkmal, das in ein Cookie passt", async () => {
    const s = laden();
    const k = await konto(s, adresse("cookie"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    /* base64url: keine Zeichen, die ein Cookie-Wert quotieren müsste. */
    expect(e.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(e.token.length).toBe(43);
  }, LIMIT);
});

describe("Die Sitzung gilt, bis sie nicht mehr gilt", () => {
  it("bestätigt eine frische Sitzung — und nur die Identität", async () => {
    const s = laden();
    const u = uhr();
    const k = await konto(s, adresse("pruef"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT, jetzt: u.jetzt });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const p = await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.accountId).toBe(k.id);
    expect(p.epoche).toBe(2);
    expect(Object.keys(p).sort()).toEqual(["accountId", "bis", "epoche", "ok", "seit"]);
  }, LIMIT);

  it("endet nach zwölf Stunden", async () => {
    const s = laden();
    const u = uhr();
    const k = await konto(s, adresse("frist"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT, jetzt: u.jetzt });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    /* Kurz vor Schluss, aber in Bewegung: alle 20 Minuten ein Zugriff,
       damit nicht die Untätigkeit zuschlägt. */
    let runden = 0;
    while (u.stand() + 20 * MINUTE < e.gueltigBis) {
      u.vor(20 * MINUTE);
      runden++;
      expect((await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt })).ok,
        `nach ${runden} Zugriffen`).toBe(true);
      /* Auf den fortgeschriebenen Zugriff warten, nicht auf die Uhr:
         `zuletzt` wird ohne await geschrieben. Ohne dieses Warten wäre der
         nächste Durchgang mit einem alten `zuletzt` unterwegs und die
         Sitzung stürbe an der Untätigkeit statt an der Frist. */
      await warteAufZuletzt(s, e.token, u.jetzt, u.stand());
      /* Und das Wichtigste an dieser Runde: Die absolute Frist wandert
         nicht mit. Aus zwölf Stunden darf kein gleitendes Fenster werden —
         weder durch Zugriffe noch durch das Fortschreiben von `zuletzt`. */
      const zwischen = await sitzungsAblage().get(`as:${hash(e.token)}`,
        { type: "json" });
      expect(Number(zwischen.bis), `bis nach ${runden} Zugriffen`)
        .toBe(e.gueltigBis);
      expect((await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt })).ok).toBe(true);
    }
    expect(runden).toBeGreaterThan(30);

    /* Genau auf der Frist gilt sie noch — dieselbe Grenze wie bei den
       Token (token.mjs). */
    u.vor(20 * MINUTE);
    expect(u.stand()).toBe(e.gueltigBis);
    expect((await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt })).ok).toBe(true);
    await warteAufZuletzt(s, e.token, u.jetzt, u.stand());

    /* Eine Millisekunde darüber nicht mehr. */
    u.vor(1);
    const nach = await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt });
    expect(nach.ok).toBe(false);
    if (!nach.ok) {
      expect(nach.grund).toBe("abgelaufen");
      expect(nach.hinweis).toBe(AN.HINWEIS_SITZUNG);
    }
    /* Und der Datensatz ist weg, nicht bloß abgewiesen — samt Aktivität. */
    expect(await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" }))
      .toBe(null);
    expect(await sitzungsAblage().get(`az:${hash(e.token)}`, { type: "json" }))
      .toBe(null);
  }, LIMIT);

  it("endet nach einer halben Stunde Untätigkeit", async () => {
    const s = laden();
    const u = uhr();
    const k = await konto(s, adresse("ruhe"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT, jetzt: u.jetzt });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    u.vor(AS.RUHE + MINUTE);
    const nach = await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt });
    expect(nach.ok).toBe(false);
    if (!nach.ok) expect(nach.grund).toBe("untaetig");
    expect(await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" }))
      .toBe(null);
  }, LIMIT);

  it("bleibt bei Arbeit bestehen und schreibt die Aktivität in einen eigenen Schlüssel fort", async () => {
    const s = laden();
    const u = uhr();
    const k = await konto(s, adresse("arbeit"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT, jetzt: u.jetzt });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const anfang = await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" });
    for (let i = 0; i < 4; i++) {
      u.vor(25 * MINUTE);
      expect((await AN.sitzungPruefen(s, e.token, { jetzt: u.jetzt })).ok).toBe(true);
      await warteAufZuletzt(s, e.token, u.jetzt, u.stand());
      const aktiv = await sitzungsAblage().get(`az:${hash(e.token)}`, { type: "json" });
      expect(Number(aktiv.zuletzt), `Runde ${i}`).toBe(u.stand());
      /* Der Zugriff schreibt die Aktivität fort und sonst nichts: Der Datensatz
         mit der Autorität bleibt Byte für Byte, wie die Anmeldung ihn angelegt
         hat — Frist, Beginn, auch sein erstes `zuletzt`. */
      const roh = await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" });
      expect(roh, `Datensatz in Runde ${i}`).toEqual(anfang);
      expect(Number(roh.bis), `bis in Runde ${i}`).toBe(e.gueltigBis);
    }
  }, LIMIT);

  it("weist ein verfälschtes oder erfundenes Merkmal ab", async () => {
    const s = laden();
    const k = await konto(s, adresse("faelschung"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");

    const gedreht = e.token.slice(0, -1)
      + (e.token.slice(-1) === "A" ? "B" : "A");
    for (const merkmal of [null, undefined, "", "kurz", 42, {},
      gedreht, e.token + "A", e.token.slice(1),
      e.token.toUpperCase() === e.token ? e.token.toLowerCase() : e.token.toUpperCase(),
      hash(e.token), `as:${hash(e.token)}`]) {
      const p = await AN.sitzungPruefen(s, /** @type {any} */ (merkmal));
      expect(p.ok, String(merkmal).slice(0, 20)).toBe(false);
    }
    /* Das echte Merkmal gilt unverändert weiter — keine der Fälschungen
       hat die Sitzung beschädigt. */
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);
  }, LIMIT);

  it("weist einen Datensatz fremder Art ab und räumt ihn weg", async () => {
    /* Selbst wenn jemand eine Arbeitssitzung in die Account-Ablage legt:
       Der Datensatz muss sich als Account-Sitzung ausweisen. */
    const merkmal = "gefaelschtes-merkmal-mit-genug-laenge";
    await sitzungsAblage().setJSON(`as:${hash(merkmal)}`, {
      bestand: "t-fremd", rolle: "leitung", person: "p_1",
      bis: Date.now() + STUNDE, zuletzt: Date.now(), seit: Date.now(),
    });
    const p = await AN.sitzungPruefen(laden(), merkmal);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("art");
    expect(await sitzungsAblage().get(`as:${hash(merkmal)}`, { type: "json" }))
      .toBe(null);
  }, LIMIT);

  it("weist eine Sitzung ab, deren Account verschwunden ist", async () => {
    const merkmal = "sitzung-ohne-konto-aber-lang-genug";
    await sitzungsAblage().setJSON(`as:${hash(merkmal)}`, {
      art: "konto", accountId: "a_gibtesnicht", epoche: 1,
      seit: Date.now(), zuletzt: Date.now(), bis: Date.now() + STUNDE,
    });
    const p = await AN.sitzungPruefen(laden(), merkmal);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("unbekannt");
    expect(await sitzungsAblage().get(`as:${hash(merkmal)}`, { type: "json" }))
      .toBe(null);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   ABMELDEN
   -------------------------------------------------------------------------- */

describe("Abmelden", () => {
  it("beendet die Sitzung und löscht den Datensatz", async () => {
    const s = laden();
    const k = await konto(s, adresse("abmelden"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    expect((await AN.abmelden(e.token)).ok).toBe(true);
    expect(await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" }))
      .toBe(null);
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(false);
  }, LIMIT);

  it("gelingt auch beim zweiten und dritten Mal", async () => {
    const s = laden();
    const k = await konto(s, adresse("zweimal"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    expect((await AN.abmelden(e.token)).ok).toBe(true);
    expect((await AN.abmelden(e.token)).ok).toBe(true);
    expect((await AN.abmelden(e.token)).ok).toBe(true);
  }, LIMIT);

  it("gelingt mit einem Merkmal, das es nie gab", async () => {
    for (const merkmal of [null, "", "unbekanntes-merkmal-lang-genug-xyz", 42]) {
      expect((await AN.abmelden(/** @type {any} */ (merkmal))).ok).toBe(true);
    }
  }, LIMIT);

  it("beendet nur die eigene Sitzung, nicht die des anderen Geräts", async () => {
    const s = laden();
    const k = await konto(s, adresse("zweigeraete"));
    const a = await AN.anmelden(s, { email: k.email, passwort: GUT });
    const b = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!a.ok || !b.ok) throw new Error("Anmeldung gescheitert");
    expect(a.token).not.toBe(b.token);
    await AN.abmelden(a.token);
    expect((await AN.sitzungPruefen(s, a.token)).ok).toBe(false);
    expect((await AN.sitzungPruefen(s, b.token)).ok).toBe(true);
  }, LIMIT);

  it("meldet überall ab — und nur diesen Account", async () => {
    const s = laden();
    const eigen = await konto(s, adresse("ueberall"));
    const fremd = await konto(s, adresse("ueberall-fremd"));
    const eins = await AN.anmelden(s, { email: eigen.email, passwort: GUT });
    const zwei = await AN.anmelden(s, { email: eigen.email, passwort: GUT });
    const anderer = await AN.anmelden(s, { email: fremd.email, passwort: GUT });
    if (!eins.ok || !zwei.ok || !anderer.ok) throw new Error("Anmeldung gescheitert");

    const e = await AN.ueberallAbmelden(eigen.id);
    expect(e.ok).toBe(true);
    expect(e.beendet).toBe(2);
    expect((await AN.sitzungPruefen(s, eins.token)).ok).toBe(false);
    expect((await AN.sitzungPruefen(s, zwei.token)).ok).toBe(false);
    /* Die Sitzung des anderen Menschen ist unberührt. */
    expect((await AN.sitzungPruefen(s, anderer.token)).ok).toBe(true);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   INVALIDIERUNG
   -------------------------------------------------------------------------- */

describe("Eine Passwortänderung beendet die alten Sitzungen", () => {
  it("entwertet jede Sitzung der vorherigen Epoche", async () => {
    const s = laden();
    const k = await konto(s, adresse("epoche"));
    const alt = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!alt.ok) throw new Error("Anmeldung gescheitert");
    expect((await AN.sitzungPruefen(s, alt.token)).ok).toBe(true);

    await A.passwortSetzen(s, k.id, await P.passwortAblegen(ANDERS));

    const p = await AN.sitzungPruefen(s, alt.token);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.grund).toBe("epoche");
      expect(p.hinweis).toBe(AN.HINWEIS_SITZUNG);
    }
    /* Und der Datensatz ist weg. */
    expect(await sitzungsAblage().get(`as:${hash(alt.token)}`, { type: "json" }))
      .toBe(null);

    /* Mit dem neuen Passwort geht es weiter, mit dem alten nicht. */
    expect((await AN.anmelden(s, { email: k.email, passwort: GUT })).ok).toBe(false);
    const neu = await AN.anmelden(s, { email: k.email, passwort: ANDERS });
    expect(neu.ok).toBe(true);
    if (neu.ok) {
      expect(neu.epoche).toBe(3);
      expect((await AN.sitzungPruefen(s, neu.token)).ok).toBe(true);
    }
  }, LIMIT);

  it("entwertet auch ohne Passwortwechsel, sobald die Epoche steigt", async () => {
    const s = laden();
    const k = await konto(s, adresse("epoche-nur"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    await A.epocheErhoehen(s, k.id);
    const p = await AN.sitzungPruefen(s, e.token);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("epoche");
    /* Das Passwort selbst ist unverändert — die Anmeldung gelingt neu. */
    expect((await AN.anmelden(s, { email: k.email, passwort: GUT })).ok).toBe(true);
  }, LIMIT);
});

describe("Eine Sperre wirkt auf laufende Sitzungen", () => {
  it("beendet eine bestehende Sitzung beim nächsten Zugriff", async () => {
    const s = laden();
    const k = await konto(s, adresse("sperre-lauf"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);

    await A.accountSperren(s, k.id);

    const p = await AN.sitzungPruefen(s, e.token);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("gesperrt");
    expect(await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" }))
      .toBe(null);
    /* Und sie wird nicht wieder gültig, wenn die Sperre fällt: Der
       Datensatz ist weg. */
    await A.accountAendern(s, k.id, { status: "aktiv" });
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(false);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   TRENNUNG VON DEN ARBEITSSITZUNGEN
   -------------------------------------------------------------------------- */

describe("Account-Sitzungen und Arbeitssitzungen sind zwei Welten", () => {
  it("erkennt eine Arbeitssitzung nicht als Account-Sitzung", async () => {
    const s = laden();
    const legacy = await S.sitzungAnlegen({ bestand: "t-legacy-a", name: "Leitung",
      rolle: "leitung", person: "p_1", betrieb: 0, konto: "konto:abc" });
    const p = await AN.sitzungPruefen(s, legacy.token);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("unbekannt");
    /* Die Arbeitssitzung ist dabei unbeschädigt geblieben. */
    expect(await S.sitzungLesen(anfrage(legacy.token))).toBeTruthy();
  }, LIMIT);

  it("erkennt eine Account-Sitzung nicht als Arbeitssitzung", async () => {
    const s = laden();
    const k = await konto(s, adresse("keine-arbeit"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    expect(await S.sitzungLesen(anfrage(e.token))).toBe(null);
    /* Und sie gilt danach weiter — der fehlgeschlagene Versuch hat sie
       nicht angetastet. */
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);
  }, LIMIT);

  it("legt in zwei getrennten Ablagen ab", async () => {
    const s = laden();
    const k = await konto(s, adresse("zwei-ablagen"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    await S.sitzungAnlegen({ bestand: "t-legacy-b", rolle: "planer", person: "p_2" });
    if (!e.ok) throw new Error("Anmeldung gescheitert");

    const alt = (await legacyAblage().list({})).blobs.map((b) => b.key);
    const neu = (await sitzungsAblage().list({})).blobs.map((b) => b.key);
    expect(alt.length).toBeGreaterThan(0);
    expect(neu.length).toBeGreaterThan(0);
    for (const kk of alt) expect(kk.startsWith("as:"), kk).toBe(false);
    for (const kk of neu) {
      /* Die Account-Sitzung (as:), ihre Aktivität (az:) und die Marker der
         Arbeitssitzungen, die an ihr hängen (ab:) — nie t: oder sk:. */
      expect(/^(as|az|ab):/.test(kk), kk).toBe(true);
      expect(kk.startsWith("t:"), kk).toBe(false);
      expect(kk.startsWith("sk:"), kk).toBe(false);
    }
  }, LIMIT);

  it("bindet sitzungen.mjs nicht an Accounts", async () => {
    /* Die Trennung soll auch dann halten, wenn jemand später versucht, sie
       bequemer zu machen: sitzungen.mjs kennt keinen Account, und die
       Account-Sitzungen kennen keine Rolle. */
    const alt = await readFile(new URL("../server/lib/sitzungen.mjs",
      import.meta.url), "utf8");
    expect(alt).not.toContain("accounts.mjs");
    expect(alt).not.toContain("accountsitzungen.mjs");
    expect(alt).not.toContain("accountanmeldung.mjs");

    const neu = await readFile(new URL("../server/lib/accountsitzungen.mjs",
      import.meta.url), "utf8");
    /* Keine Einbindung von accounts.mjs oder rechte.mjs: Die Mechanik
       kennt weder Konto noch Recht. */
    const einbindung = (datei) =>
      new RegExp(`import[^;]*from\\s*["'][^"']*${datei}["']`);
    expect(einbindung("accounts\\.mjs").test(neu)).toBe(false);
    expect(einbindung("rechte\\.mjs").test(neu)).toBe(false);
    expect(einbindung("sitzungen\\.mjs").test(neu)).toBe(false);

    /* Und die Anmeldung kennt keine Rechteprüfung. */
    const anm = await readFile(new URL("../server/lib/accountanmeldung.mjs",
      import.meta.url), "utf8");
    expect(einbindung("rechte\\.mjs").test(anm)).toBe(false);
    expect(einbindung("rollenvergabe\\.mjs").test(anm)).toBe(false);
  }, LIMIT);
});

describe("In diesem Schritt hängt noch kein Endpunkt daran", () => {
  it("wird von keiner Route und keinem Endpunkt eingebunden", async () => {
    /* Die Anmeldung ist die innere Grundlage, nicht der Weg hinein. Sobald
       ein Endpunkt sie aufruft, braucht er eine ausdrücklich eingetragene
       Bremsart (schutz.mjs) und eine Antwort, die den inneren `grund` nicht
       herausreicht. Diese Prüfung sagt, wann das ansteht: Sie fällt, sobald
       die Einbindung entsteht. */
    const einbindung = /import[^;]*from\s*["'][^"']*account(?:anmeldung|sitzungen)\.mjs["']/;
    for (const d of ["../server.mjs", "../server/funktionen/daten.mjs",
      "../server/funktionen/registrierung.mjs", "../server/funktionen/starten.mjs",
      "../server/lib/sitzungen.mjs", "../server/lib/registrierung.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(einbindung.test(text), d).toBe(false);
    }
  }, LIMIT);

  it("kennt weder Anfrage noch Antwort noch Cookie", async () => {
    for (const d of ["accountanmeldung.mjs", "accountsitzungen.mjs"]) {
      const text = await readFile(new URL(`../server/lib/${d}`, import.meta.url),
        "utf8");
      /* Gesucht wird der Zugriff, nicht das Wort: Der Kopf `authorization`
         darf in einem Kommentar vorkommen — gelesen werden darf er hier
         nicht. */
      for (const wort of ["set-cookie", "Set-Cookie", "new Response",
        "headers.get", "req.", "SameSite"]) {
        expect(text.includes(wort), `${d}: ${wort}`).toBe(false);
      }
    }
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   IDENTITÄT IST KEINE BERECHTIGUNG
   -------------------------------------------------------------------------- */

describe("Eine Account-Sitzung allein berechtigt zu nichts", () => {
  it("führt in der Rechteprüfung zu keiner Rolle und zu keinem Schreibrecht",
    async () => {
      const s = laden();
      const k = await konto(s, adresse("kein-recht"));
      const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
      if (!e.ok) throw new Error("Anmeldung gescheitert");
      const p = await AN.sitzungPruefen(s, e.token);
      expect(p.ok).toBe(true);
      if (!p.ok) return;

      /* Der geprüfte Zustand, wie er ist, in die Rechteprüfung gegeben:
         Es gibt keine Rolle, und daraus folgt kein Schreibrecht. */
      const bestand = { mandanten: [{ id: "m1", name: "Fremdes Haus",
        personen: [{ id: "p_1", name: "Fremde Leitung", rolle: "leitung" }] }] };
      const rolle = R.wirksameRolle(/** @type {any} */ (p), bestand);
      expect(rolle === null || rolle === undefined).toBe(true);
      expect(R.schreibumfang(rolle)).toBe(R.SCHREIBEN_NEIN);
    }, LIMIT);

  it("verrät nicht, ob und wo es Mitgliedschaften gibt", async () => {
    const s = laden();
    const k = await konto(s, adresse("ohne-mitglied"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const p = await AN.sitzungPruefen(s, e.token);
    const text = JSON.stringify(e) + JSON.stringify(p);
    expect(text).not.toContain("mitglied");
    expect(text).not.toContain("raum");
    expect(text).not.toContain("rolle");
  }, LIMIT);

  it("meldet einen Account ohne jede Mitgliedschaft trotzdem an", async () => {
    /* Anmelden und Berechtigung sind zwei Vorgänge: Wer noch nirgends
       Mitglied ist, ist trotzdem ein Mensch mit einem Zugang. */
    const s = laden();
    const k = await konto(s, adresse("niemandsland"));
    expect(await A.mitgliedschaftenDesAccounts(s, k.id)).toEqual([]);
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    expect(e.ok).toBe(true);
  }, LIMIT);

  it("öffnet mit zwei Mitgliedschaften keinen der beiden Betriebe", async () => {
    const s = laden();
    const k = await konto(s, adresse("zwei-betriebe"));
    await A.mitgliedschaftAnlegen(s, { accountId: k.id, raum: "t-anm-alpha",
      betrieb: 0, mandantId: "m-alpha", person: "p_a", rolle: "leitung",
      status: "aktiv" });
    await A.mitgliedschaftAnlegen(s, { accountId: k.id, raum: "t-anm-beta",
      betrieb: 0, mandantId: "m-beta", person: "p_b", rolle: "mitarbeiter",
      status: "aktiv" });

    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const p = await AN.sitzungPruefen(s, e.token);
    expect(p.ok).toBe(true);
    if (!p.ok) return;

    /* Keine der beiden Rollen steht in der Sitzung — auch nicht die
       höhere. Es gibt keine „höchste Rolle" eines Menschen. */
    expect(Object.keys(p).sort()).toEqual(["accountId", "bis", "epoche", "ok", "seit"]);
    const roh = await sitzungsAblage().get(`as:${hash(e.token)}`, { type: "json" });
    expect(JSON.stringify(roh)).not.toContain("leitung");
    expect(JSON.stringify(roh)).not.toContain("t-anm-");

    /* Der Weg in einen Betrieb führt weiter nur über die Mitgliedschaft,
       und die muss ausdrücklich nach einem Raum gefragt werden. */
    expect(await A.mitgliedschaftLesen(s, p.accountId, "t-anm-alpha")).toBeTruthy();
    expect(await A.mitgliedschaftLesen(s, p.accountId, "t-anm-gamma")).toBe(null);
  }, LIMIT);

  it("öffnet keinen fremden Betrieb, in dem jemand anderes Mitglied ist", async () => {
    const s = laden();
    const eigen = await konto(s, adresse("eigen"));
    const fremd = await konto(s, adresse("fremd"));
    await A.mitgliedschaftAnlegen(s, { accountId: fremd.id, raum: "t-anm-fremdhaus",
      betrieb: 0, mandantId: "m-fremd", person: "p_f", rolle: "leitung",
      status: "aktiv" });

    const e = await AN.anmelden(s, { email: eigen.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const p = await AN.sitzungPruefen(s, e.token);
    if (!p.ok) throw new Error("Sitzung ungültig");
    expect(p.accountId).toBe(eigen.id);
    /* Die eigene Sitzung führt in den fremden Raum nicht hinein. */
    expect(await A.mitgliedschaftLesen(s, p.accountId, "t-anm-fremdhaus")).toBe(null);
    const eigene = await A.mitgliedschaftenDesAccounts(s, p.accountId);
    expect(eigene).toEqual([]);
  }, LIMIT);
});

/* --------------------------------------------------------------------------
   GLEICHZEITIGKEIT UND FEHLER
   -------------------------------------------------------------------------- */

describe("Gleichzeitigkeit", () => {
  it("hält acht gleichzeitige Anmeldungen desselben Menschen auseinander", async () => {
    const s = laden();
    const k = await konto(s, adresse("parallel"));
    const ergebnisse = await Promise.all(Array.from({ length: 8 },
      () => AN.anmelden(s, { email: k.email, passwort: GUT })));
    for (const e of ergebnisse) expect(e.ok).toBe(true);
    const merkmale = new Set(ergebnisse.map((e) => (e.ok ? e.token : null)));
    expect(merkmale.size).toBe(8);
    for (const e of ergebnisse) {
      if (e.ok) expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);
    }
    /* Die Epoche ist dabei nicht gewandert — acht Anmeldungen sind acht
       Sitzungen, nicht acht Passwortänderungen. */
    expect((await A.accountLesenPerId(s, k.id)).epoche).toBe(2);
  }, LIMIT);

  it("hält gleichzeitige Abmeldungen desselben Merkmals aus", async () => {
    const s = laden();
    const k = await konto(s, adresse("parallel-ab"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!e.ok) throw new Error("Anmeldung gescheitert");
    const alle = await Promise.all(Array.from({ length: 6 },
      () => AN.abmelden(e.token)));
    for (const a of alle) expect(a.ok).toBe(true);
    expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(false);
  }, LIMIT);

  it("überlebt Anmelden und Abmelden durcheinander", async () => {
    const s = laden();
    const k = await konto(s, adresse("durcheinander"));
    const erste = await AN.anmelden(s, { email: k.email, passwort: GUT });
    if (!erste.ok) throw new Error("Anmeldung gescheitert");
    const gemischt = await Promise.all([
      AN.anmelden(s, { email: k.email, passwort: GUT }),
      AN.abmelden(erste.token),
      AN.anmelden(s, { email: k.email, passwort: GUT }),
      AN.abmelden(erste.token),
    ]);
    expect(gemischt[0].ok).toBe(true);
    expect(gemischt[2].ok).toBe(true);
    expect((await AN.sitzungPruefen(s, erste.token)).ok).toBe(false);
    for (const i of [0, 2]) {
      const e = gemischt[i];
      if ("token" in e && e.token) {
        expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);
      }
    }
  }, LIMIT);
});

describe("Wenn die Ablage streikt", () => {
  /* Eine Ablage, die beim Schreiben wirft — sonst echt. */
  const kaputt = (fehlerBei) => {
    const echt = sitzungsAblage();
    return {
      get: (...a) => echt.get(...a),
      list: (...a) => echt.list(...a),
      delete: (...a) => echt.delete(...a),
      setJSON: async (...a) => {
        if (fehlerBei === "setJSON") throw new Error("Platte voll");
        return echt.setJSON(...a);
      },
    };
  };

  it("meldet nicht an, wenn die Sitzung nicht geschrieben werden kann", async () => {
    const s = laden();
    const k = await konto(s, adresse("platte"));
    const e = await AN.anmelden(s, { email: k.email, passwort: GUT,
      sitzungsAblage: /** @type {any} */ (kaputt("setJSON")) });
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.grund).toBe("speichern");
    /* Ein eigener Satz: Wer hierher kommt, hatte die richtigen Angaben —
       ihm „Adresse oder Passwort stimmen nicht" zu sagen, wäre eine
       Falschauskunft. Und kein Merkmal im Ergebnis. */
    expect(e.hinweis).toBe(AN.HINWEIS_SPEICHERN);
    expect("token" in e).toBe(false);
  }, LIMIT);

  it("lässt eine Anmeldung nicht an einem Vermerk scheitern", async () => {
    /* `letzteAnmeldung` ist eine Auskunft, keine Bedingung. Bleibt der
       Schreibvorgang aus, ist die Anmeldung trotzdem gelungen. */
    const s = laden();
    const k = await konto(s, adresse("vermerk-weg"));
    const zerlegt = {
      get: (...a) => s.get(...a),
      list: (...a) => s.list(...a),
      delete: (...a) => s.delete(...a),
      setJSON: async (schluessel, wert) => {
        if (String(schluessel).startsWith("account:")) throw new Error("Platte voll");
        return s.setJSON(schluessel, wert);
      },
    };
    const e = await AN.anmelden(/** @type {any} */ (zerlegt),
      { email: k.email, passwort: GUT });
    expect(e.ok).toBe(true);
    if (e.ok) expect((await AN.sitzungPruefen(s, e.token)).ok).toBe(true);
  }, LIMIT);

  it("weist eine Sitzung ab, wenn ihr Datensatz unlesbar ist", async () => {
    const s = laden();
    const echt = sitzungsAblage();
    const blind = {
      get: async () => { throw new Error("kaputt"); },
      list: (...a) => echt.list(...a),
      delete: (...a) => echt.delete(...a),
      setJSON: (...a) => echt.setJSON(...a),
    };
    const p = await AN.sitzungPruefen(s, "irgendein-langes-merkmal-hier",
      { sitzungsAblage: /** @type {any} */ (blind) });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toBe("fehler");
  }, LIMIT);
});
