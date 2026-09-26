/* ==========================================================================
   REGISTRIERUNG ÜBER HTTP — die erste öffentliche Tür zum neuen Konto

   Zwei Endpunkte, und beide dürfen nichts verraten: nicht, ob eine Adresse
   schon vergeben ist, nicht, wie ein Konto heißt, nicht, woran ein
   Bestätigungslink scheiterte. Geprüft wird deshalb weniger, was ankommt,
   als was NICHT in der Antwort steht.

   Aufgerufen wird der echte Handler — derselbe Standardexport, den
   server.mjs unter /api/registrierung einhängt.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, handler, A, R;

const LIMIT = 30000;
const PROFIL = { vorname: "Rina", nachname: "Schmitt",
  betriebsname: "Wachdienst Nordlicht" };
const PW_ABLAGE = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-reg-http-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_BASIS = "https://app.centric-dienstplanung.de";
  /* Der Versand läuft trocken — kein Schlüssel, keine Post nach draußen. */
  delete process.env.RESEND_API_KEY;
  delete process.env.CENTRIC_PRUEFLINK;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  handler = (await import("../server/funktionen/registrierung.mjs")).default;
  A = await import("../server/lib/accounts.mjs");
  R = await import("../server/lib/registrierung.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const taktSpeicher = () => getStore({ name: "centric-takt", consistency: "strong" });

/* Die Bremse zählt drei Dimensionen, zwei davon in der Ablage (Adresse und
   Gesamtaufkommen). Ohne Aufräumen bremst der Gesamtzähler die späteren
   Tests. Die Zählung je Herkunft lebt zusätzlich im Prozessspeicher — dagegen
   hilft nur eine eigene Absenderadresse je Test. */
beforeEach(async () => {
  const s = taktSpeicher();
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let zaehler = 0;
const eigeneHerkunft = () =>
  `10.1.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

/** Ein Aufruf des echten Handlers. */
async function anfrage(rumpf = {}, {
  methode = "POST", pfad = "/api/registrierung", herkunft = null, origin = null,
  rohRumpf = null, kopfExtra = {},
} = {}) {
  const kopf = { "content-type": "application/json",
    "x-forwarded-for": herkunft || eigeneHerkunft(), ...kopfExtra };
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

const starten = (zusatz = {}, o = {}) =>
  anfrage({ ...PROFIL, email: "rina@example.org", ...zusatz }, o);

/** Das Token, das der Versand tatsächlich verschickt hat. */
async function tokenAusMail(email) {
  /* Kein Postfach im Test: Gelesen wird der Eintrag, den token.mjs anlegt —
     und der enthält nur die Prüfsumme. Für die Endpunktprüfungen wird der
     Klartext deshalb über die Prüfschranke aus post.mjs geholt, die genau
     dafür gebaut ist. */
  process.env.CENTRIC_PRUEFLINK = "ja";
  const pf = [];
  const e = await R.registrierungStarten(laden(), {
    ...PROFIL, email,
    versand: async (an, betreff, text) => { pf.push({ an, betreff, text }); return { ok: true, trocken: true }; },
  });
  delete process.env.CENTRIC_PRUEFLINK;
  expect(e.ok, `Start: ${e.grund}`).toBe(true);
  const t = /#token=([A-Za-z0-9_-]+)/.exec(pf[pf.length - 1].text);
  return t ? t[1] : null;
}

/** Alle Schlüssel mit diesem Präfix. */
const anzahl = async (praefix) => (await laden().list({ prefix: praefix })).blobs.length;

/* Der Handler holt seinen Speicher selbst (`centric`), also teilen alle Tests
   ihn: Zugesagt wird nicht „null Konten", sondern dass die abgewiesene Adresse
   keines bekommt — das ist die Aussage, um die es geht. */

/** Nach beiden Endpunkten darf es nichts davon geben. */
async function keineNebenwirkungen() {
  for (const praefix of ["kern:", "bestand:", "scherbe:", "mitglied:", "raummitglied:",
    "konto:", "t:", "sk:", "push:", "loeschung:"]) {
    expect(await anzahl(praefix), praefix).toBe(0);
  }
}

/* ==========================================================================
   REGISTRIERUNG STARTEN
   ========================================================================== */

describe("POST /api/registrierung", () => {
  it("nimmt eine gültige Registrierung an und antwortet unspeicherbar", async () => {
    const e = await starten({ email: "eins@example.org" });
    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true, hinweis: R.HINWEIS_GENERISCH });
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");
    expect(e.antwort.headers.get("content-type")).toContain("application/json");
    expect(e.antwort.headers.get("x-content-type-options")).toBe("nosniff");
  }, LIMIT);

  it("legt über den echten Dienst genau einen Account mit Profil an", async () => {
    const e = await starten({ email: "zwei@example.org" });
    expect(e.status).toBe(200);
    const konto = await A.accountLesenPerMail(laden(), "zwei@example.org");
    expect(konto).not.toBe(null);
    expect(konto.status).toBe("eingeladen");
    expect(konto.profil.vorname).toBe("Rina");
    expect(konto.profil.nachname).toBe("Schmitt");
    expect(konto.profil.betriebsname).toBe("Wachdienst Nordlicht");
    /* Der Anspruch auf einen Testbetrieb ist geöffnet, aber nichts verbraucht. */
    expect(konto.testbetriebOffenSeit).toBeTruthy();
    expect(konto.testbetriebVerbrauchtAm).toBe(null);
    expect(konto.testbetriebRaum).toBe(null);
    /* Kein Passwort, keine Bestätigung. */
    expect(konto.passwort).toBe(null);
    expect(konto.emailVerifiziertAm).toBe(null);
    await keineNebenwirkungen();
  }, LIMIT);

  it("verrät in der Antwort keine Kennung, keinen Zustand und kein Token", async () => {
    const e = await starten({ email: "still@example.org" });
    const konto = await A.accountLesenPerMail(laden(), "still@example.org");
    expect(e.text).not.toContain(konto.id);
    expect(e.text).not.toContain("still@example.org");
    expect(e.text).not.toContain("eingeladen");
    for (const wort of ["accountId", "emailNorm", "token", "tokenNr", "protokoll",
      "testbetrieb", "passwort", "raum", "mitglied"]) {
      expect(e.text.toLowerCase(), wort).not.toContain(wort.toLowerCase());
    }
    /* Und in der Ablage steht kein Klartexttoken. */
    const s = laden();
    const { blobs } = await s.list({ prefix: "token:" });
    expect(blobs.length).toBeGreaterThan(0);
    for (const b of blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      expect(eintrag.zweck).toBe("verifizierung");
      /* Der Schlüssel ist eine Prüfsumme, der Eintrag nennt kein Token. */
      expect(JSON.stringify(eintrag)).not.toMatch(/#token=/);
    }
  }, LIMIT);

  it("schickt die Mail über die bestehende Abstraktion mit Link im Fragment", async () => {
    /* Der Handler ruft keinen Versanddienst selbst — er hat keinen Schlüssel
       und keinen Anbietercode. Geprüft wird das strukturell und am Ergebnis:
       Ohne hinterlegten Schlüssel läuft der Versand trocken und der Link
       trägt das Token im Fragment. */
    const quelle = await readFile(
      new URL("../server/funktionen/registrierung.mjs", import.meta.url), "utf8");
    for (const muster of [/resend/i, /RESEND_API_KEY/, /smtp/i, /api\.resend\.com/,
      /fetch\(/, /sendeMail/]) {
      expect(muster.test(quelle), String(muster)).toBe(false);
    }
    expect(R.verifizierungsLink("XYZ"))
      .toBe("https://app.centric-dienstplanung.de/verifizieren#token=XYZ");
    expect(R.verifizierungsMail("XYZ").text).toContain("#token=XYZ");
    expect(R.verifizierungsMail("XYZ").text).not.toContain("?token=");
  }, LIMIT);

  it("antwortet für neue, aktive, wartende und gesperrte Adresse identisch", async () => {
    const s = laden();
    /* Ein aktives Konto — über den echten Weg fertig registriert. */
    const aktiv = (await A.accountAnlegen(s, { email: "aktiv-e@example.org",
      status: "aktiv", passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString(), profil: PROFIL,
      selbstbedienung: true })).account;
    /* Ein gesperrtes. */
    const gesperrt = (await A.accountAnlegen(s, { email: "sperre-e@example.org",
      status: "gesperrt", passwort: PW_ABLAGE })).account;
    /* Ein wartendes. */
    await starten({ email: "wartet-e@example.org" });
    const wartetVorher = JSON.stringify(
      await A.accountLesenPerMail(s, "wartet-e@example.org"));
    const aktivVorher = JSON.stringify(await A.accountLesenPerId(s, aktiv.id));
    const gesperrtVorher = JSON.stringify(await A.accountLesenPerId(s, gesperrt.id));

    const antworten = [];
    for (const email of ["neu-e@example.org", "aktiv-e@example.org",
      "sperre-e@example.org", "wartet-e@example.org"]) {
      const e = await starten({ email });
      antworten.push(`${e.status} ${e.text}`);
    }
    /* Vier Fälle, eine Antwort. */
    expect(new Set(antworten).size).toBe(1);
    expect(antworten[0]).toContain('"ok":true');

    /* Und die bestehenden Konten sind unangetastet: kein neues Passwort,
       kein gesenkter Status, kein neuer Zähler. */
    expect(JSON.stringify(await A.accountLesenPerId(s, aktiv.id))).toBe(aktivVorher);
    expect(JSON.stringify(await A.accountLesenPerId(s, gesperrt.id))).toBe(gesperrtVorher);
    /* Das wartende bekommt nur einen neuen Link — Profil und Kennung bleiben. */
    const wartetNachher = await A.accountLesenPerMail(s, "wartet-e@example.org");
    expect(wartetNachher.id).toBe(JSON.parse(wartetVorher).id);
    expect(wartetNachher.profil).toEqual(JSON.parse(wartetVorher).profil);
    expect(wartetNachher.tokenNr.verifizierung).toBe(2);
  }, LIMIT);

  it("weist unbrauchbare Angaben mit brauchbarem Hinweis ab", async () => {
    const faelle = [
      [{ email: "kein-at" }, "adresse"],
      [{ email: "" }, "adresse"],
      [{ email: "a@b" }, "adresse"],
      [{ vorname: "" }, "vorname"],
      [{ vorname: "x".repeat(81) }, "vorname"],
      [{ vorname: 42 }, "vorname"],
      [{ nachname: "   " }, "nachname"],
      [{ nachname: "y".repeat(81) }, "nachname"],
      [{ betriebsname: "ab" }, "betriebsname"],
      [{ betriebsname: "z".repeat(81) }, "betriebsname"],
    ];
    for (const [zusatz, grund] of faelle) {
      const e = await starten({ email: `grund-${grund}@example.org`, ...zusatz });
      expect(e.status, JSON.stringify(zusatz)).toBe(400);
      expect(e.daten.ok).toBe(false);
      expect(e.daten.fehler, JSON.stringify(zusatz)).toBe(grund);
      expect(typeof e.daten.hinweis).toBe("string");
      /* Kein Speicherschlüssel, kein Stapelabbild, keine interne Kennung. */
      expect(e.text).not.toMatch(/account:|kontoId:|mitglied:|at Object|\.mjs/);
    }
    await keineNebenwirkungen();
  }, LIMIT);

  it("weist Steuerzeichen in den Namen ab", async () => {
    for (const zusatz of [{ vorname: "Ri\nna" }, { nachname: "Schm\ti tt" },
      { betriebsname: "Wach\ndienst" }]) {
      const e = await starten({ email: "steuer@example.org", ...zusatz });
      expect(e.status, JSON.stringify(zusatz)).toBe(400);
      expect(["vorname", "nachname", "betriebsname"]).toContain(e.daten.fehler);
    }
  }, LIMIT);

  it("beantwortet kaputtes JSON und einen zu großen Rumpf als Eingabefehler", async () => {
    const kaputt = await anfrage({}, { rohRumpf: "{kein json" });
    expect(kaputt.status).toBe(400);
    expect(kaputt.daten.fehler).toBe("kaputtes-json");

    const liste = await anfrage({}, { rohRumpf: "[1,2,3]" });
    expect(liste.status).toBe(400);
    expect(liste.daten.fehler).toBe("kein-objekt");

    const gross = await anfrage({}, { rohRumpf: JSON.stringify({ a: "x".repeat(20000) }) });
    expect(gross.status).toBe(413);
    expect(gross.daten.fehler).toBe("zu-gross");

    /* Kein 500, kein Stapelabbild, nichts angelegt. */
    for (const e of [kaputt, liste, gross]) {
      expect(e.text).not.toMatch(/at Object|\.mjs|SyntaxError/);
    }
  }, LIMIT);

  it("lässt nur POST zu", async () => {
    for (const methode of ["GET", "PUT", "DELETE", "PATCH"]) {
      const e = await anfrage(PROFIL, { methode });
      expect(e.status, methode).toBe(405);
      expect(e.daten.fehler).toBe("nur-post");
    }
  }, LIMIT);

  it("weist fremde Herkunft ab und lässt die eigene durch", async () => {
    const fremd = await starten({ email: "fremd@example.org" },
      { origin: "https://beispiel.invalid" });
    expect(fremd.status).toBe(403);
    expect(fremd.daten.fehler).toBe("fremde-herkunft");
    /* Und die abgewiesene Adresse hat kein Konto bekommen. */
    expect(await A.accountLesenPerMail(laden(), "fremd@example.org")).toBe(null);

    /* Eigene Herkunft und keine Angabe — beides wie im übrigen Server. */
    expect((await starten({ email: "eigen@example.org" },
      { origin: "http://127.0.0.1:3000" })).status).toBe(200);
    expect((await starten({ email: "ohne@example.org" })).status).toBe(200);
  }, LIMIT);

  it("bremst nach fünf Versuchen je Herkunft, ohne etwas zu verraten", async () => {
    const herkunft = "203.0.113.10";
    for (let n = 1; n <= 5; n++) {
      const e = await anfrage({ ...PROFIL, email: `br${n}@example.org` }, { herkunft });
      expect(e.status, `Versuch ${n}`).toBe(200);
    }
    const sechster = await anfrage({ ...PROFIL, email: "br6@example.org" }, { herkunft });
    expect(sechster.status).toBe(429);
    expect(Number(sechster.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(sechster.antwort.headers.get("cache-control")).toBe("no-store");
    /* Die Bremsantwort sagt nichts über Konten. */
    expect(sechster.text).not.toMatch(/existiert|vergeben|bekannt|accountId/);
    /* Und der sechste Account ist nicht entstanden. */
    expect(await A.accountLesenPerMail(laden(), "br6@example.org")).toBe(null);

    /* Eine andere Herkunft ist unberührt. */
    const andere = await anfrage({ ...PROFIL, email: "br7@example.org" },
      { herkunft: "203.0.113.11" });
    expect(andere.status).toBe(200);
  }, LIMIT);

  it("bremst dieselbe Adresse auch aus wechselnden Herkünften", async () => {
    /* Sonst wäre der Endpunkt ein Werkzeug, um ein einzelnes fremdes Postfach
       zuzuschütten: fünf Versuche je Herkunft, aber beliebig viele Herkünfte. */
    const email = "opfer@example.org";
    let gebremst = 0;
    for (let n = 0; n < 8; n++) {
      const e = await anfrage({ ...PROFIL, email }, { herkunft: `198.51.100.${n + 1}` });
      if (e.status === 429) gebremst++;
    }
    expect(gebremst).toBeGreaterThan(0);
  }, LIMIT);

  it("lässt bei einem Versandfehler das Konto stehen und erzeugt nichts weiter", async () => {
    /* Der Versand scheitert, wenn ein Schlüssel hinterlegt ist und der
       Anbieter nicht antwortet — hier über eine unerreichbare Basis. */
    process.env.RESEND_API_KEY = "nur-zum-pruefen";
    try {
      const e = await starten({ email: "versand@example.org" });
      expect(e.status).toBe(500);
      expect(e.daten.fehler).toBe("nicht-moeglich");
      /* Kein interner Grund nach außen. */
      expect(e.text).not.toContain("versand");
      const konto = await A.accountLesenPerMail(laden(), "versand@example.org");
      expect(konto).not.toBe(null);
      expect(konto.passwort).toBe(null);
      expect(konto.emailVerifiziertAm).toBe(null);
      await keineNebenwirkungen();
    } finally {
      delete process.env.RESEND_API_KEY;
    }
  }, LIMIT);
});

/* ==========================================================================
   BESTÄTIGEN
   ========================================================================== */

describe("POST /api/registrierung/verifizieren", () => {
  const pfad = "/api/registrierung/verifizieren";

  it("bestätigt die Adresse und gibt den Nachweis für das erste Passwort", async () => {
    const token = await tokenAusMail("bestaetigt@example.org");
    const e = await anfrage({ token }, { pfad });
    expect(e.status).toBe(200);
    expect(Object.keys(e.daten).sort()).toEqual(["fortsetzung", "ok", "passwortFehlt"]);
    expect(e.daten.ok).toBe(true);
    expect(e.daten.passwortFehlt).toBe(true);
    /* 256 Bit, base64url — dieselbe Form wie jedes andere Token. */
    expect(e.daten.fortsetzung).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(e.antwort.headers.get("cache-control")).toBe("no-store");

    const konto = await A.accountLesenPerMail(laden(), "bestaetigt@example.org");
    expect(konto.emailVerifiziertAm).toBeTruthy();
    /* Und sonst nichts: kein Passwort, kein aktiver Zustand, kein Betrieb. */
    expect(konto.passwort).toBe(null);
    expect(konto.status).toBe("eingeladen");
    expect(konto.testbetriebOffenSeit).toBeTruthy();
    expect(konto.testbetriebVerbrauchtAm).toBe(null);
    await keineNebenwirkungen();

    /* Keine Kennung und kein Bestätigungstoken in der Antwort. */
    expect(e.text).not.toContain(konto.id);
    expect(e.text).not.toContain(token);

    /* Der Nachweis liegt nur als Prüfsumme in der Ablage, mit dem Zweck
       „einrichten" und einer Frist von fünfzehn Minuten. */
    const s = laden();
    let gefunden = null;
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.zweck !== "einrichten") continue;
      if (eintrag.accountId !== konto.id) continue;
      gefunden = { key: b.key, eintrag };
    }
    expect(gefunden).not.toBe(null);
    expect(gefunden.key).not.toContain(e.daten.fortsetzung);
    expect(JSON.stringify(gefunden.eintrag)).not.toContain(e.daten.fortsetzung);
    expect(gefunden.eintrag.bis - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(gefunden.eintrag.bis - Date.now()).toBeGreaterThan(13 * 60 * 1000);
    /* Und in der ganzen Ablage steht er nirgends im Klartext. */
    for (const b of (await s.list({})).blobs) {
      const roh = await s.get(b.key).catch(() => null);
      expect(String(roh || ""), b.key).not.toContain(e.daten.fortsetzung);
    }
  }, LIMIT);

  it("gibt für jeden unbrauchbaren Link dieselbe Absage", async () => {
    const echt = await tokenAusMail("einmal@example.org");
    const antworten = [];

    /* Erst einlösen — danach ist derselbe Link wertlos. */
    expect((await anfrage({ token: echt }, { pfad })).status).toBe(200);
    for (const token of [echt, "gibtesnicht-aber-lang-genug-xxxxxxxx", "", "  ",
      null, undefined, 42, {}, `${echt}x`, echt.slice(0, -1)]) {
      const e = await anfrage({ token }, { pfad });
      antworten.push(`${e.status} ${e.text}`);
      expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-link");
      /* Kein Grund, kein Token, keine Kennung. */
      expect(e.text).not.toMatch(/abgelaufen"|entwertet|zweck|unbekannt|konto-/);
      if (typeof token === "string" && token.length > 10) {
        expect(e.text).not.toContain(token);
      }
    }
    /* Alle Absagen sind nach außen nicht unterscheidbar. */
    expect(new Set(antworten).size).toBe(1);
  }, LIMIT);

  it("weist ein Token mit falschem Zweck genauso ab", async () => {
    const s = laden();
    const konto = (await A.accountAnlegen(s, { email: "zweck@example.org",
      profil: PROFIL, selbstbedienung: true })).account;
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    const fremd = await tokenAusstellen(s, { zweck: "zuruecksetzen", nr: 1,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
    const e = await anfrage({ token: fremd.token }, { pfad });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-link");
    expect((await A.accountLesenPerId(s, konto.id)).emailVerifiziertAm).toBe(null);
  }, LIMIT);

  it("lässt nur POST zu und weist fremde Herkunft ab", async () => {
    for (const methode of ["GET", "PUT", "DELETE"]) {
      const e = await anfrage({}, { pfad, methode });
      expect(e.status, methode).toBe(405);
    }
    const fremd = await anfrage({ token: "x".repeat(40) },
      { pfad, origin: "https://beispiel.invalid" });
    expect(fremd.status).toBe(403);
    expect((await anfrage({ token: "x".repeat(40) },
      { pfad, origin: "http://127.0.0.1:3000" })).status).toBe(400);
  }, LIMIT);

  it("beantwortet kaputtes JSON als Eingabefehler", async () => {
    const e = await anfrage({}, { pfad, rohRumpf: "{kaputt" });
    expect(e.status).toBe(400);
    expect(e.daten.fehler).toBe("kaputtes-json");
  }, LIMIT);

  it("bremst zu viele Versuche", async () => {
    const herkunft = "203.0.113.30";
    let gebremst = 0;
    for (let n = 0; n < 32; n++) {
      const e = await anfrage({ token: `versuch-${n}-aber-lang-genug` }, { pfad, herkunft });
      if (e.status === 429) gebremst++;
    }
    expect(gebremst).toBeGreaterThan(0);
  }, LIMIT);
});

/* ==========================================================================
   ROUTING, PROTOKOLL UND GRENZEN
   ========================================================================== */

describe("Routing und Protokoll", () => {
  it("kennt genau die zwei Pfade", async () => {
    expect((await starten({ email: "pfad1@example.org" })).status).toBe(200);
    expect((await anfrage({ token: "x".repeat(40) },
      { pfad: "/api/registrierung/verifizieren" })).status).toBe(400);
    for (const pfad of ["/api/registrierung/irgendwas", "/api/registrierungx",
      "/api/registrierung/verifizieren/noch"]) {
      const e = await anfrage(PROFIL, { pfad });
      expect(e.status, pfad).toBe(404);
      expect(e.daten.fehler).toBe("unbekannter-pfad");
    }
  }, LIMIT);

  it("hängt unter genau diesen Pfaden im Server", async () => {
    const modul = await import("../server/funktionen/registrierung.mjs");
    expect(modul.config.path).toEqual([
      "/api/registrierung", "/api/registrierung/verifizieren"]);
    /* Und der Server wählt genaue Pfade vor Präfixen — sonst finge
       daten.mjs mit `/api/*` diese Routen ab. */
    const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
    expect(server).toMatch(/for \(const r of routen\) if \(r\.exakt/);
  }, LIMIT);

  it("schreibt weder Token noch Adresse noch Namen ins Protokoll", async () => {
    const spur = getStore({ name: "centric-spur" });
    const token = await tokenAusMail("spur@example.org");
    await anfrage({ token }, { pfad: "/api/registrierung/verifizieren" });
    await starten({ email: "spur2@example.org" });

    const tag = new Date().toISOString().slice(0, 10);
    const zeilen = [];
    for (const art of ["registrierung", "verifizieren"]) {
      const { blobs } = await spur.list({ prefix: `${tag}/${art}/` });
      for (const b of blobs) {
        const z = await spur.get(b.key, { type: "json" }).catch(() => null);
        if (z) zeilen.push(z);
      }
    }
    expect(zeilen.length).toBeGreaterThan(0);
    const text = JSON.stringify(zeilen);
    expect(text).not.toContain(token);
    expect(text).not.toContain("spur@example.org");
    expect(text).not.toContain("spur2@example.org");
    expect(text).not.toContain("Rina");
    expect(text).not.toContain("Wachdienst");
    /* Was drinsteht: Art, Ausgang und ein knapper Vermerk. */
    expect(zeilen.some((z) => z.art === "registrierung" && z.ausgang === "erfolg")).toBe(true);
    expect(zeilen.some((z) => z.art === "verifizieren" && z.ausgang === "erfolg")).toBe(true);
  }, LIMIT);

  it("enthält keine eigene Registrierungslogik", async () => {
    const quelle = await readFile(
      new URL("../server/funktionen/registrierung.mjs", import.meta.url), "utf8");
    /* Der Handler prüft keine Adresse, hasht nichts, stellt kein Token aus
       und legt keinen Account an — das alles liegt in lib/. */
    for (const name of ["mailBrauchbar", "profilPruefen", "accountAnlegen",
      "tokenAusstellen", "tokenEinloesen", "passwortAblegen", "scrypt",
      "createHash", "randomBytes", "mitgliedschaftAnlegen",
      "testbetriebFuerAccountAnlegen", "sitzungAnlegen"]) {
      expect(quelle.includes(name), name).toBe(false);
    }
    expect(quelle).not.toMatch(/\bconsole\s*\./);
    /* Und keine Aufweichung der Herkunftsprüfung. */
    expect(quelle).not.toMatch(/Access-Control-Allow-Origin/);
  }, LIMIT);

  it("lässt den Legacy-Selbststart unberührt", async () => {
    const legacy = (await import("../server/funktionen/starten.mjs")).default;
    const req = new Request("http://127.0.0.1:3000/starten", {
      method: "GET", headers: { "x-forwarded-for": eigeneHerkunft() },
    });
    const a = await legacy(req);
    /* Unverändertes Verhalten: GET bleibt 405. */
    expect(a.status).toBe(405);
  }, LIMIT);
});

/* ==========================================================================
   DER NACHWEIS FÜR DAS ERSTE PASSWORT

   Wer seine Adresse bestätigt hat, bekommt dabei ein zweites, kurzlebiges
   Token. Geprüft wird, wer ihn bekommt — und vor allem, wer nicht: ein
   eingeladenes Konto, ein Konto mit Passwort, ein verbrauchter Link, ein
   fremder Zweck.
   ========================================================================== */

describe("Der Fortsetzungsnachweis", () => {
  const pfad = "/api/registrierung/verifizieren";

  it("geht nur an einen Selbstbedienungsvorgang ohne Passwort", async () => {
    const s = laden();
    /* Ein eingeladenes Konto: angelegt ohne Selbstbedienung, also ohne
       geöffneten Testbetriebsanspruch. Sein Weg zum Passwort führt über die
       Einladung, nicht über diesen Nachweis. */
    const geladen = (await A.accountAnlegen(s, { email: "geladen-n@example.org" })).account;
    expect(geladen.testbetriebOffenSeit).toBe(null);
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    const link = await tokenAusstellen(s, { zweck: "verifizierung", nr: 1,
      inhalt: { accountId: geladen.id, emailNorm: geladen.emailNorm } });
    await A.tokenNrErhoehen(s, geladen.id, "verifizierung");

    const e = await anfrage({ token: link.token }, { pfad });
    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true, passwortFehlt: true });
    expect(e.daten.fortsetzung).toBeUndefined();
    /* Die Adresse ist trotzdem bestätigt — die bisherige Semantik bleibt. */
    expect((await A.accountLesenPerId(s, geladen.id)).emailVerifiziertAm).toBeTruthy();
    /* Und es liegt kein Nachweis für ihn in der Ablage. */
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.zweck === "einrichten") expect(eintrag.accountId).not.toBe(geladen.id);
    }
  }, LIMIT);

  it("geht nicht an ein Konto, das schon ein Passwort hat", async () => {
    const s = laden();
    const konto = (await A.accountAnlegen(s, { email: "hatpw@example.org",
      profil: PROFIL, selbstbedienung: true, passwort: PW_ABLAGE })).account;
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    const link = await tokenAusstellen(s, { zweck: "verifizierung", nr: 1,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
    await A.tokenNrErhoehen(s, konto.id, "verifizierung");

    const e = await anfrage({ token: link.token }, { pfad });
    expect(e.status).toBe(200);
    expect(e.daten).toEqual({ ok: true, passwortFehlt: false });
    expect(e.daten.fortsetzung).toBeUndefined();
  }, LIMIT);

  it("entsteht nicht aus einem verbrauchten Bestätigungslink", async () => {
    const token = await tokenAusMail("verbraucht-n@example.org");
    const erste = await anfrage({ token }, { pfad });
    expect(erste.daten.fortsetzung).toBeTruthy();

    /* Derselbe Link ein zweites Mal: keine Bestätigung, kein Nachweis. */
    const zweite = await anfrage({ token }, { pfad });
    expect(zweite.status).toBe(400);
    expect(zweite.daten.fehler).toBe("ungueltiger-oder-abgelaufener-link");
    expect(zweite.daten.fortsetzung).toBeUndefined();

    /* Und es gibt genau einen Nachweis für dieses Konto, nicht zwei. */
    const s = laden();
    const konto = await A.accountLesenPerMail(s, "verbraucht-n@example.org");
    let nachweise = 0;
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.zweck === "einrichten" && eintrag.accountId === konto.id) nachweise++;
    }
    expect(nachweise).toBe(1);
  }, LIMIT);

  it("entsteht nicht aus einem unbekannten, verfälschten oder zweckfremden Token", async () => {
    const s = laden();
    const konto = (await A.accountAnlegen(s, { email: "fremd-n@example.org",
      profil: PROFIL, selbstbedienung: true })).account;
    await A.emailBestaetigen(s, konto.id);
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    /* Die Laufnummer wird passend gesetzt, damit allein der ZWECK über die
       Absage entscheidet — sonst fiele der Fall schon an der Entwertung
       heraus und die Zweckprüfung bliebe ungeprüft. */
    await A.tokenNrErhoehen(s, konto.id, "verifizierung");
    const nr = (await A.accountLesenPerId(s, konto.id)).tokenNr.verifizierung;
    const reset = await tokenAusstellen(s, { zweck: "zuruecksetzen", nr,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
    const einrichten = await tokenAusstellen(s, { zweck: "einrichten", nr,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });

    for (const token of [reset.token, einrichten.token, "x".repeat(43),
      "kurz", `${reset.token}x`]) {
      const e = await anfrage({ token }, { pfad });
      expect(e.status, String(token).slice(0, 12)).toBe(400);
      expect(e.daten.fehler).toBe("ungueltiger-oder-abgelaufener-link");
      expect(e.daten.fortsetzung).toBeUndefined();
    }
  }, LIMIT);

  it("gilt fünfzehn Minuten und danach nicht mehr", async () => {
    /* Geprüft über die Geschäftslogik mit eingespeister Uhr: Der Handler hat
       keine Uhr, und dafür wird keine eingebaut. */
    const s = laden();
    const T0 = new Date("2026-09-26T08:00:00.000Z").getTime();
    const uhr = (ms) => () => ms;
    const pf = [];
    const start = await R.registrierungStarten(s, { ...PROFIL, email: "frist-n@example.org",
      versand: async (an, betreff, text) => { pf.push({ text }); return { ok: true, trocken: true }; },
      jetzt: uhr(T0) });
    expect(start.ok).toBe(true);
    const link = /#token=([A-Za-z0-9_-]+)/.exec(pf[0].text)[1];
    const v = await R.emailVerifizieren(s, { token: link, jetzt: uhr(T0) });
    expect(v.ok).toBe(true);
    expect(v.fortsetzung).toBeTruthy();
    expect(v.fortsetzungBis - T0).toBe(15 * 60 * 1000);

    const { tokenEinloesen } = await import("../server/lib/token.mjs");
    /* Eine Minute vor Ablauf gilt er. */
    const frueh = await tokenEinloesen(s, v.fortsetzung,
      { zweck: "einrichten", jetzt: uhr(T0 + 14 * 60 * 1000) });
    expect(frueh.eintrag).not.toBe(null);
    expect(frueh.eintrag.accountId).toBe(v.accountId);

    /* Ein zweiter Nachweis, diesmal über die Frist hinaus geprüft. */
    const v2 = await R.emailVerifizieren(s, { token: link, jetzt: uhr(T0) });
    expect(v2.ok).toBe(false);          // der Link ist verbraucht
    const zweiter = await R.verifizierungErneutSenden(s, { email: "frist-n@example.org",
      versand: async (an, betreff, text) => { pf.push({ text }); return { ok: true, trocken: true }; },
      jetzt: uhr(T0) });
    expect(zweiter.ok).toBe(true);
    const link2 = /#token=([A-Za-z0-9_-]+)/.exec(pf[pf.length - 1].text)[1];
    const v3 = await R.emailVerifizieren(s, { token: link2, jetzt: uhr(T0) });
    expect(v3.fortsetzung).toBeTruthy();
    const spaet = await tokenEinloesen(s, v3.fortsetzung,
      { zweck: "einrichten", jetzt: uhr(T0 + 15 * 60 * 1000 + 1) });
    expect(spaet.eintrag).toBe(null);
    expect(spaet.grund).toBe("abgelaufen");
  }, LIMIT);

  it("wirkt genau einmal", async () => {
    const s = laden();
    const token = await tokenAusMail("einmalig-n@example.org");
    const e = await anfrage({ token }, { pfad });
    const nachweis = e.daten.fortsetzung;
    expect(nachweis).toBeTruthy();

    const { tokenEinloesen } = await import("../server/lib/token.mjs");
    /* Acht gleichzeitige Einlösungen: genau eine gewinnt (Reihe in token.mjs). */
    const acht = await Promise.all(Array.from({ length: 8 }, () =>
      tokenEinloesen(s, nachweis, { zweck: "einrichten" })));
    expect(acht.filter((x) => x.eintrag).length).toBe(1);
    /* Und danach ist er auch einzeln wertlos. */
    expect((await tokenEinloesen(s, nachweis, { zweck: "einrichten" })).eintrag).toBe(null);
  }, LIMIT);

  it("entwertet einen älteren Nachweis, wenn ein neuer entsteht", async () => {
    /* Zwei Bestätigungen hintereinander sollen nicht zwei gültige Nachweise
       ergeben — dafür führt der Account eine Laufnummer je Zweck. */
    const s = laden();
    const pf = [];
    const versand = async (an, betreff, text) => { pf.push({ text }); return { ok: true, trocken: true }; };
    await R.registrierungStarten(s, { ...PROFIL, email: "zwei-n@example.org", versand });
    const ersterLink = /#token=([A-Za-z0-9_-]+)/.exec(pf[0].text)[1];
    const eins = await R.emailVerifizieren(s, { token: ersterLink });
    expect(eins.fortsetzung).toBeTruthy();

    await R.verifizierungErneutSenden(s, { email: "zwei-n@example.org", versand });
    const zweiterLink = /#token=([A-Za-z0-9_-]+)/.exec(pf[pf.length - 1].text)[1];
    const zwei = await R.emailVerifizieren(s, { token: zweiterLink });
    expect(zwei.fortsetzung).toBeTruthy();
    expect(zwei.fortsetzung).not.toBe(eins.fortsetzung);

    const konto = await A.accountLesenPerMail(s, "zwei-n@example.org");
    expect(konto.tokenNr.einrichten).toBe(2);

    /* Der erste Nachweis ist entwertet: Er wird eingelöst, aber die
       Laufnummer passt nicht mehr. */
    const { tokenEinloesen } = await import("../server/lib/token.mjs");
    const alt = await tokenEinloesen(s, eins.fortsetzung,
      { zweck: "einrichten", nummern: konto.tokenNr });
    expect(alt.eintrag).toBe(null);
    expect(alt.grund).toBe("entwertet");
    /* Der neue gilt. */
    const neu = await tokenEinloesen(s, zwei.fortsetzung,
      { zweck: "einrichten", nummern: konto.tokenNr });
    expect(neu.eintrag).not.toBe(null);
    expect(neu.eintrag.accountId).toBe(konto.id);
  }, LIMIT);

  it("lässt bei acht gleichzeitigen Bestätigungen höchstens einen Nachweis entstehen", async () => {
    const s = laden();
    const token = await tokenAusMail("parallel-n@example.org");
    const acht = await Promise.all(Array.from({ length: 8 }, () =>
      anfrage({ token }, { pfad })));
    const gelungen = acht.filter((x) => x.status === 200);
    expect(gelungen.length).toBe(1);
    expect(gelungen[0].daten.fortsetzung).toBeTruthy();
    for (const x of acht.filter((y) => y.status !== 200)) {
      expect(x.daten.fehler).toBe("ungueltiger-oder-abgelaufener-link");
      expect(x.daten.fortsetzung).toBeUndefined();
    }
    const konto = await A.accountLesenPerMail(s, "parallel-n@example.org");
    let nachweise = 0;
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.zweck === "einrichten" && eintrag.accountId === konto.id) nachweise++;
    }
    expect(nachweise).toBe(1);
  }, LIMIT);

  it("bestätigt die Adresse auch dann, wenn die Ausstellung scheitert — ohne Nachweis", async () => {
    /* Der Fehlerfall zwischen Bestätigung und Nachweis: Die Adresse ist
       bestätigt, ein Passwort lässt sich nicht setzen, und der Weg zurück
       führt über einen neuen Bestätigungslink. Kein ungesicherter Zugang. */
    const s = laden();
    const pf = [];
    const versand = async (an, betreff, text) => { pf.push({ text }); return { ok: true, trocken: true }; };
    await R.registrierungStarten(s, { ...PROFIL, email: "klemmt-n@example.org", versand });
    const link = /#token=([A-Za-z0-9_-]+)/.exec(pf[0].text)[1];

    /* Ein Speicher, der das Ausstellen des Nachweises verweigert: Der
       Schlüssel des neuen Tokens ist noch nicht bekannt, also scheitert jedes
       Schreiben unter `token:` nach der Bestätigung. */
    let bestaetigt = false;
    const stur = new Proxy(s, {
      get(ziel, name) {
        if (name !== "setJSON") return Reflect.get(ziel, name);
        return (key, ...rest) => {
          if (key.startsWith("account:")) bestaetigt = true;
          if (key.startsWith("token:") && bestaetigt) {
            return Promise.reject(new Error("Platte voll beim Nachweis"));
          }
          return ziel.setJSON(key, ...rest);
        };
      },
    });

    const e = await R.emailVerifizieren(stur, { token: link });
    expect(e.ok).toBe(true);
    expect(e.fortsetzung).toBeUndefined();
    expect(typeof e.ohneNachweis).toBe("string");

    /* Die Adresse ist bestätigt, das Konto hat kein Passwort — und kein
       Nachweis liegt herum. */
    const konto = await A.accountLesenPerMail(s, "klemmt-n@example.org");
    expect(konto.emailVerifiziertAm).toBeTruthy();
    expect(konto.passwort).toBe(null);
    expect(konto.status).toBe("eingeladen");
    /* Für dieses Konto liegt kein Nachweis — andere Konten dieses
       geteilten Speichers haben ihre eigenen. */
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.accountId !== konto.id) continue;
      expect(eintrag.zweck).not.toBe("einrichten");
    }

    /* Der Weg zurück: ein neuer Bestätigungslink, derselbe Besitznachweis. */
    const nochmal = await R.verifizierungErneutSenden(s,
      { email: "klemmt-n@example.org", versand });
    expect(nochmal.ok).toBe(true);
    const link2 = /#token=([A-Za-z0-9_-]+)/.exec(pf[pf.length - 1].text)[1];
    const zweite = await R.emailVerifizieren(s, { token: link2 });
    expect(zweite.ok).toBe(true);
    expect(zweite.fortsetzung).toBeTruthy();
  }, LIMIT);

  it("verrät den Nachweis weder im Protokoll noch in einer Adresszeile", async () => {
    const spur = getStore({ name: "centric-spur" });
    const token = await tokenAusMail("protokoll-n@example.org");
    const e = await anfrage({ token }, { pfad });
    const nachweis = e.daten.fortsetzung;
    expect(nachweis).toBeTruthy();

    const tag = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${tag}/verifizieren/` });
    let text = "";
    for (const b of blobs) {
      const z = await spur.get(b.key, { type: "json" }).catch(() => null);
      if (z) text += JSON.stringify(z);
    }
    expect(blobs.length).toBeGreaterThan(0);
    expect(text).not.toContain(nachweis);
    expect(text).not.toContain(token);
    expect(text).not.toContain("protokoll-n@example.org");

    /* Und der Handler baut keine Adresszeile mit dem Nachweis. */
    const quelle = await readFile(
      new URL("../server/funktionen/registrierung.mjs", import.meta.url), "utf8");
    expect(quelle).not.toMatch(/fortsetzung=|\?token=|&token=/);
    expect(quelle).not.toMatch(/\bconsole\s*\./);
  }, LIMIT);

  it("wird von keiner öffentlichen Neuausstellung per Adresse erzeugt", async () => {
    /* Eine Adresse allein darf keinen Nachweis auslösen — sonst wäre der
       Besitz der Mail überflüssig. Der Registrierungsstart schickt einen
       Link, nichts weiter. */
    const e = await starten({ email: "keinweg-n@example.org" });
    expect(e.status).toBe(200);
    expect(e.daten.fortsetzung).toBeUndefined();
    expect(e.text).not.toContain("fortsetzung");

    const s = laden();
    const konto = await A.accountLesenPerMail(s, "keinweg-n@example.org");
    for (const b of (await s.list({ prefix: "token:" })).blobs) {
      const eintrag = await s.get(b.key, { type: "json" });
      if (eintrag.accountId === konto.id) expect(eintrag.zweck).toBe("verifizierung");
    }
    expect(konto.tokenNr.einrichten).toBe(0);
  }, LIMIT);
});
