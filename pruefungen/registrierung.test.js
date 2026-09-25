/* ==========================================================================
   REGISTRIERUNG — vier Schritte, und keine Abkürzung

   Geprüft wird die Reihenfolge, nicht nur das Ergebnis: Ein Passwort vor
   der Bestätigung, eine Bestätigung ohne Token, ein Token eines fremden
   Kontos, ein zweiter Klick auf denselben Link — jeder dieser Wege muss
   ins Leere laufen.

   Der Versand wird eingespeist, statt ihn nachzubauen: Der Test bekommt
   denselben Text, den ein Mensch bekäme, und liest das Token daraus. So
   wird mitgeprüft, was in der Mail steht — und was nicht.

   Die Uhr wird eingespeist, nicht gewartet: Fristen von 24 Stunden prüft
   man nicht, indem man 24 Stunden wartet.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, R, A, P;

const STUNDE = 60 * 60 * 1000;
const GUT = "Nordwind und Sonne 1846";   // 23 Zeichen, keine Sperrliste

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-registrierung-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_BASIS = "https://app.centric-dienstplanung.de";
  /* Der Versand läuft trocken: kein Schlüssel hinterlegt. */
  delete process.env.RESEND_API_KEY;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  R = await import("../server/lib/registrierung.mjs");
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

let zaehler = 0;
const laden = () => getStore({ name: `reg${++zaehler}`, consistency: "strong" });

/** Ein Postfach, das mitschreibt — und auf Wunsch scheitert. */
function postfach({ scheitert = false } = {}) {
  const briefe = [];
  const versand = async (an, betreff, text) => {
    briefe.push({ an, betreff, text });
    return scheitert ? { ok: false, fehler: "Empfänger abgelehnt" } : { ok: true, trocken: true };
  };
  return { briefe, versand, letzter: () => briefe[briefe.length - 1] };
}

/** Das Token aus dem Mailtext — so, wie es ein Mensch aus dem Link holt. */
const tokenAus = (text) => {
  const t = /#token=([A-Za-z0-9_-]+)/.exec(String(text));
  return t ? t[1] : null;
};

/** Eine feste Uhr. */
const uhr = (ms) => () => ms;
const T0 = new Date("2026-09-01T08:00:00.000Z").getTime();

/** Der ganze Weg bis zum gesetzten Passwort. */
async function durchlaufen(s, email = "neu@example.org", passwort = GUT) {
  const pf = postfach();
  const start = await R.registrierungStarten(s, { email, versand: pf.versand, jetzt: uhr(T0) });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const token = tokenAus(pf.letzter().text);
  const v = await R.emailVerifizieren(s, { token, jetzt: uhr(T0 + STUNDE) });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  const p = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort });
  return { pf, start, token, v, p, accountId: v.accountId };
}

/* ==========================================================================
   START
   ========================================================================== */

describe("Eine Registrierung beginnen", () => {
  it("legt genau einen Account an und schickt genau eine Mail", async () => {
    const s = laden();
    const pf = postfach();
    const e = await R.registrierungStarten(s, { email: "eins@example.org", versand: pf.versand });
    expect(e.ok).toBe(true);
    expect(e.protokoll.fall).toBe("neu");
    expect(pf.briefe.length).toBe(1);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
    const konto = await A.accountLesenPerMail(s, "eins@example.org");
    expect(konto.status).toBe("eingeladen");
    expect(konto.passwort).toBe(null);
    expect(konto.emailVerifiziertAm).toBe(null);
    expect(konto.tokenNr).toEqual({ einladung: 0, verifizierung: 1, zuruecksetzen: 0 });
  });

  it("normalisiert die Adresse und erzeugt keine zweite Identität", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "  Test@Example.org ", versand: pf.versand });
    const konto = await A.accountLesenPerMail(s, "test@example.org");
    expect(konto).not.toBe(null);
    expect(konto.emailNorm).toBe("test@example.org");
    /* Die Anzeigeform bleibt, wie sie eingegeben wurde — nur getrimmt. */
    expect(konto.email).toBe("Test@Example.org");

    /* Zweiter Versuch in anderer Schreibweise: derselbe Account. */
    const zweite = await R.registrierungStarten(s, { email: "TEST@EXAMPLE.ORG", versand: pf.versand });
    expect(zweite.protokoll.fall).toBe("erneut");
    expect(zweite.protokoll.accountId).toBe(konto.id);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
  });

  it("behandelt eine Plus-Kennzeichnung als eigene Adresse", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "max@example.org", versand: pf.versand });
    await R.registrierungStarten(s, { email: "max+dienst@example.org", versand: pf.versand });
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(2);
  });

  it("weist eine unbrauchbare Adresse ab, ohne etwas anzulegen", async () => {
    const s = laden();
    const pf = postfach();
    for (const email of ["", "   ", "kein-at", "a@b", null, undefined, 42, {}]) {
      const e = await R.registrierungStarten(s, { email, versand: pf.versand });
      expect(e.ok, String(email)).toBe(false);
      expect(e.grund).toBe("adresse");
    }
    expect(pf.briefe.length).toBe(0);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(0);
  });

  it("lässt ein aktives Konto unangetastet und verrät es nicht", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "aktiv@example.org");
    const vorher = JSON.stringify(await A.accountLesenPerId(s, accountId));

    const pf = postfach();
    const e = await R.registrierungStarten(s, { email: "aktiv@example.org", versand: pf.versand });
    expect(e.ok).toBe(true);
    expect(e.hinweis).toBe(R.HINWEIS_GENERISCH);
    /* Kein zweites Konto, keine Mail, kein angetasteter Datensatz. */
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
    expect(pf.briefe.length).toBe(0);
    expect(JSON.stringify(await A.accountLesenPerId(s, accountId))).toBe(vorher);
  });

  it("lässt ein gesperrtes Konto unangetastet und verrät es nicht", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "gesperrt@example.org");
    await A.accountSperren(s, accountId);
    const vorher = await A.accountLesenPerId(s, accountId);

    const pf = postfach();
    const e = await R.registrierungStarten(s, { email: "gesperrt@example.org", versand: pf.versand });
    expect(e.ok).toBe(true);
    expect(e.hinweis).toBe(R.HINWEIS_GENERISCH);
    expect(pf.briefe.length).toBe(0);
    const nachher = await A.accountLesenPerId(s, accountId);
    /* Keine Statussenkung, kein neues Passwort, kein neuer Zähler. */
    expect(nachher.status).toBe("gesperrt");
    expect(nachher.passwort).toBe(vorher.passwort);
    expect(nachher.tokenNr).toEqual(vorher.tokenNr);
  });

  it("überschreibt ein wartendes Konto nicht, sondern schickt einen neuen Link", async () => {
    const s = laden();
    const pf = postfach();
    const erste = await R.registrierungStarten(s, { email: "warte@example.org", versand: pf.versand });
    const konto1 = await A.accountLesenPerMail(s, "warte@example.org");

    const zweite = await R.registrierungStarten(s, { email: "warte@example.org", versand: pf.versand });
    const konto2 = await A.accountLesenPerMail(s, "warte@example.org");

    expect(zweite.ok).toBe(true);
    expect(zweite.protokoll.fall).toBe("erneut");
    /* Dieselbe Kennung, derselbe Erstellungszeitpunkt: nichts neu angelegt. */
    expect(konto2.id).toBe(konto1.id);
    expect(konto2.erstellt).toBe(konto1.erstellt);
    expect(konto2.status).toBe("eingeladen");
    expect(konto2.passwort).toBe(null);
    /* Nur der Zähler des Zwecks ist weitergelaufen. */
    expect(konto2.tokenNr).toEqual({ einladung: 0, verifizierung: 2, zuruecksetzen: 0 });
    expect(pf.briefe.length).toBe(2);
    expect(erste.protokoll.fall).toBe("neu");
  });

  it("gibt für neue, aktive und gesperrte Adresse denselben Hinweis", async () => {
    const s = laden();
    const pf = postfach();
    const { accountId } = await durchlaufen(s, "a-aktiv@example.org");
    const { accountId: gesperrt } = await durchlaufen(s, "a-gesperrt@example.org");
    await A.accountSperren(s, gesperrt);
    expect(accountId).not.toBe(gesperrt);

    const antworten = [];
    for (const email of ["a-neu@example.org", "a-aktiv@example.org", "a-gesperrt@example.org"]) {
      const e = await R.registrierungStarten(s, { email, versand: pf.versand });
      antworten.push(JSON.stringify({ ok: e.ok, hinweis: e.hinweis }));
    }
    expect(new Set(antworten).size).toBe(1);
    /* Und der Hinweis nennt keine Adresse und keinen Zustand. */
    expect(R.HINWEIS_GENERISCH).not.toMatch(/vergeben|existiert|gesperrt|bereits registriert/i);
  });

  it("legt bei zwölf gleichzeitigen Versuchen genau ein Konto an", async () => {
    const s = laden();
    const pf = postfach();
    /* `allSettled`, nicht `all`: Ein Ablagefehler ist hier ein zulässiger
       Ausgang. Zwölf Versuche schreiben nacheinander in dieselbe Datei
       (Laufnummer je Versuch), und auf Windows lässt sich ein `rename` auf
       eine gerade geschriebene Datei gelegentlich nicht ausführen — dieselbe
       Eigenheit, die auch die Ablageprüfung dort zeigt. Was hier zugesagt
       wird, ist nicht „zwölf Erfolgsmeldungen", sondern die Eindeutigkeit:
       ein Konto, eine Anlage, kein zweites unter anderer Kennung. Ein
       gescheiterter Versuch meldet den Fehler und lässt nichts Halbes
       zurück. */
    const alle = await Promise.allSettled(Array.from({ length: 12 }, () =>
      R.registrierungStarten(s, { email: "viele@example.org", versand: pf.versand })));
    const werte = alle.filter((x) => x.status === "fulfilled").map((x) => x.value);

    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
    expect((await s.list({ prefix: "kontoId:" })).blobs.length).toBe(1);
    /* Höchstens einer meldet eine Anlage. Nicht „genau einer": Der Versuch,
       der das Konto angelegt hat, kann danach am Zähler oder am Versand
       gescheitert sein — dann steht das Konto, aber sein Ergebnis ist ein
       Fehler. Genau deshalb ist die Eindeutigkeit oben an der Ablage
       geprüft und nicht an den Rückgaben. */
    expect(werte.filter((e) => e.protokoll.fall === "neu").length).toBeLessThanOrEqual(1);
    /* Kein Ergebnis nennt einen anderen Account als den einen. */
    const konto = await A.accountLesenPerMail(s, "viele@example.org");
    expect(konto).not.toBe(null);
    for (const e of werte) {
      if (e.protokoll.accountId) expect(e.protokoll.accountId).toBe(konto.id);
    }
    /* Und wer scheiterte, scheiterte an der Ablage — nicht an einer
       doppelten Identität. */
    for (const x of alle.filter((y) => y.status === "rejected")) {
      expect(String(x.reason && x.reason.name)).toBe("AblageFehler");
    }
  });
});

/* ==========================================================================
   DAS TOKEN
   ========================================================================== */

describe("Das Bestätigungstoken", () => {
  it("läuft unter dem Zweck verifizierung und gilt 24 Stunden", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "zweck@example.org", versand: pf.versand,
      jetzt: uhr(T0) });
    expect(R.ZWECK).toBe("verifizierung");
    expect(R.FRIST_STUNDEN).toBe(24);
    const { blobs } = await s.list({ prefix: "token:" });
    expect(blobs.length).toBe(1);
    const eintrag = await s.get(blobs[0].key, { type: "json" });
    expect(eintrag.zweck).toBe("verifizierung");
    expect(eintrag.bis - T0).toBe(24 * STUNDE);
  });

  it("liegt nur als Prüfsumme in der Ablage — nie im Klartext", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "hash@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    expect(token.length).toBeGreaterThan(30);

    /* Der Schlüssel ist eine Prüfsumme, nicht das Token. */
    const { blobs } = await s.list({ prefix: "token:" });
    expect(blobs[0].key).not.toContain(token);
    /* Und in keinem einzigen Eintrag der ganzen Ablage steht es. */
    const alle = await s.list({});
    for (const b of alle.blobs) {
      const roh = await s.get(b.key).catch(() => null);
      expect(String(roh || ""), b.key).not.toContain(token);
    }
  });

  it("steht nicht im Account und in keiner Mitgliedschaft", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "nichtdrin@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    const konto = await A.accountLesenPerMail(s, "nichtdrin@example.org");
    expect(JSON.stringify(konto)).not.toContain(token);
    /* Es gibt ohnehin keine Mitgliedschaft — und erst recht keine mit Token. */
    expect(await A.mitgliedschaftenDesAccounts(s, konto.id)).toEqual([]);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(0);
  });

  it("ist an genau dieses Konto gebunden — ein Token von A bestätigt B nicht", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "bind-a@example.org", versand: pf.versand });
    const tokenA = tokenAus(pf.letzter().text);
    await R.registrierungStarten(s, { email: "bind-b@example.org", versand: pf.versand });
    const tokenB = tokenAus(pf.letzter().text);
    expect(tokenA).not.toBe(tokenB);

    const a = await A.accountLesenPerMail(s, "bind-a@example.org");
    const b = await A.accountLesenPerMail(s, "bind-b@example.org");

    const e = await R.emailVerifizieren(s, { token: tokenA });
    expect(e.ok).toBe(true);
    expect(e.accountId).toBe(a.id);
    /* B ist unberührt: Das Token von A hat dessen Adresse bestätigt. */
    expect((await A.accountLesenPerId(s, b.id)).emailVerifiziertAm).toBe(null);
  });

  it("verwirft einen Eintrag, dessen Konto und Adresse nicht zusammenpassen", async () => {
    /* Hier wird am Modul vorbei geschrieben: ein Token, das an A ausgestellt
       wurde, dessen Eintrag aber auf B zeigt. Ohne die Bindung bestätigte
       ein Link für eine Adresse das Konto einer anderen. */
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "eintrag-a@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    await R.registrierungStarten(s, { email: "eintrag-b@example.org", versand: pf.versand });
    const a = await A.accountLesenPerMail(s, "eintrag-a@example.org");
    const b = await A.accountLesenPerMail(s, "eintrag-b@example.org");

    /* Den Eintrag genau dieses Tokens finden: Er nennt A. */
    let meiner = null;
    for (const blob of (await s.list({ prefix: "token:" })).blobs) {
      const e = await s.get(blob.key, { type: "json" });
      if (e && e.accountId === a.id) meiner = { key: blob.key, eintrag: e };
    }
    expect(meiner).not.toBe(null);

    /* Kennung auf B umgebogen, Adresse bleibt die von A. */
    await s.setJSON(meiner.key, { ...meiner.eintrag, accountId: b.id });
    const fremd = await R.emailVerifizieren(s, { token });
    expect(fremd.ok).toBe(false);
    expect(fremd.grund).toBe("adresse-fremd");
    /* Keine der beiden Adressen ist bestätigt. */
    expect((await A.accountLesenPerId(s, a.id)).emailVerifiziertAm).toBe(null);
    expect((await A.accountLesenPerId(s, b.id)).emailVerifiziertAm).toBe(null);
  });

  it("verwirft einen Eintrag ohne oder mit erfundener Kennung", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "ohne-id@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    const [blob] = (await s.list({ prefix: "token:" })).blobs;
    const eintrag = await s.get(blob.key, { type: "json" });

    /* Ohne Kennung: Es gibt niemanden zu bestätigen. */
    const ohne = { ...eintrag };
    delete ohne.accountId;
    await s.setJSON(blob.key, ohne);
    const e1 = await R.emailVerifizieren(s, { token });
    expect(e1.ok).toBe(false);
    expect(e1.grund).toBe("ohne-konto");

    /* Mit erfundener Kennung: Der Zeiger führt nirgendwohin. */
    await s.setJSON(blob.key, { ...eintrag, accountId: "a_frei_erfunden" });
    const e2 = await R.emailVerifizieren(s, { token });
    expect(e2.ok).toBe(false);
    expect(e2.grund).toBe("konto-fehlt");
    expect((await A.accountLesenPerMail(s, "ohne-id@example.org")).emailVerifiziertAm)
      .toBe(null);
  });

  it("verliert seine Geltung, sobald ein neues ausgestellt wird", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "zwei@example.org", versand: pf.versand });
    const erstes = tokenAus(pf.letzter().text);
    await R.verifizierungErneutSenden(s, { email: "zwei@example.org", versand: pf.versand });
    const zweites = tokenAus(pf.letzter().text);
    expect(zweites).not.toBe(erstes);

    const alt = await R.emailVerifizieren(s, { token: erstes });
    expect(alt.ok).toBe(false);
    const neu = await R.emailVerifizieren(s, { token: zweites });
    expect(neu.ok).toBe(true);
  });

  it("lässt die Zähler der anderen Zwecke unberührt", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "zaehler@example.org", versand: pf.versand });
    const konto = await A.accountLesenPerMail(s, "zaehler@example.org");
    /* Ein laufender Rücksetzvorgang und eine Einladung existieren gedanklich
       parallel — eine neue Bestätigung darf sie nicht abschneiden. */
    await A.tokenNrErhoehen(s, konto.id, "zuruecksetzen");
    await A.tokenNrErhoehen(s, konto.id, "einladung");
    await R.verifizierungErneutSenden(s, { email: "zaehler@example.org", versand: pf.versand });
    expect((await A.accountLesenPerId(s, konto.id)).tokenNr)
      .toEqual({ einladung: 1, verifizierung: 2, zuruecksetzen: 1 });
  });

  it("gilt bis einschließlich der Frist und danach nicht mehr", async () => {
    const s = laden();
    /* Die bestehende Semantik aus token.mjs: abgelaufen ist ein Eintrag,
       wenn `bis < jetzt` — der Zeitpunkt `bis` selbst gilt noch. Hier wird
       diese Grenze festgeschrieben, nicht verschoben: Eine Millisekunde in
       der Auslegung ist keine Sicherheitsfrage, eine stillschweigend
       geänderte Frist wäre eine. */
    for (const [name, versatz, erwartet] of [
      ["23 h 59 min", 24 * STUNDE - 60_000, true],
      ["24 h minus 1 ms", 24 * STUNDE - 1, true],
      ["genau 24 h", 24 * STUNDE, true],
      ["24 h plus 1 ms", 24 * STUNDE + 1, false],
      ["24 h 1 min", 24 * STUNDE + 60_000, false],
    ]) {
      const pf = postfach();
      const email = `frist-${versatz}@example.org`;
      await R.registrierungStarten(s, { email, versand: pf.versand, jetzt: uhr(T0) });
      const token = tokenAus(pf.letzter().text);
      const e = await R.emailVerifizieren(s, { token, jetzt: uhr(T0 + versatz) });
      expect(e.ok, name).toBe(erwartet);
    }
  });

  it("weist falsche, zweckfremde und formlose Token ab", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "falsch@example.org", versand: pf.versand });
    const echt = tokenAus(pf.letzter().text);
    const konto = await A.accountLesenPerMail(s, "falsch@example.org");

    for (const token of ["", "   ", "zu-kurz", null, undefined, 42, {},
      `${echt}x`, echt.slice(0, -1)]) {
      const e = await R.emailVerifizieren(s, { token });
      expect(e.ok, String(token)).toBe(false);
      expect(e.hinweis).toMatch(/nicht mehr gültig/);
    }

    /* Ein Token mit dem falschen Zweck: richtig geformt, richtiges Konto,
       aber es gehört zum Zurücksetzen. */
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    const fremd = await tokenAusstellen(s, { zweck: "zuruecksetzen", nr: 1,
      inhalt: { accountId: konto.id, emailNorm: konto.emailNorm } });
    const e = await R.emailVerifizieren(s, { token: fremd.token });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("zweck");
    /* Und das echte Token ist davon unberührt. */
    expect((await R.emailVerifizieren(s, { token: echt })).ok).toBe(true);
  });

  it("weist ein Token ab, dessen Konto gesperrt wurde", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "sperre-token@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    const konto = await A.accountLesenPerMail(s, "sperre-token@example.org");
    await A.accountSperren(s, konto.id);

    const e = await R.emailVerifizieren(s, { token });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("gesperrt");
    expect((await A.accountLesenPerId(s, konto.id)).emailVerifiziertAm).toBe(null);
  });

  it("wirkt genau einmal — auch bei zwei gleichzeitigen Versuchen", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "einmal@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);

    /* Zuerst nebeneinander: Die Reihe in token.mjs stellt sie hintereinander. */
    const acht = await Promise.all(Array.from({ length: 8 }, () =>
      R.emailVerifizieren(s, { token })));
    expect(acht.filter((e) => e.ok).length).toBe(1);

    /* Und danach ist der Link auch einzeln wertlos. */
    expect((await R.emailVerifizieren(s, { token })).ok).toBe(false);
    expect((await s.list({ prefix: "token:" })).blobs.length).toBe(0);
  });
});

/* ==========================================================================
   BESTÄTIGEN — und nichts weiter
   ========================================================================== */

describe("Die Bestätigung tut genau eine Sache", () => {
  it("setzt den Zeitpunkt und sonst nichts", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "nur-datum@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    const vorher = await A.accountLesenPerMail(s, "nur-datum@example.org");

    const e = await R.emailVerifizieren(s, { token });
    expect(e.ok).toBe(true);
    const nachher = await A.accountLesenPerId(s, vorher.id);

    expect(nachher.emailVerifiziertAm).toBeTruthy();
    /* Kein Passwort, keine Aktivierung, keine neue Epoche. */
    expect(nachher.passwort).toBe(null);
    expect(nachher.status).toBe("eingeladen");
    expect(nachher.epoche).toBe(vorher.epoche);
    expect(nachher.passwortGeaendert).toBe(null);
    expect(nachher.letzteAnmeldung).toBe(null);
    /* Keine Mitgliedschaft, kein Raum, keine Sitzung. */
    expect(await A.mitgliedschaftenDesAccounts(s, vorher.id)).toEqual([]);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "raummitglied:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "t:" })).blobs.length).toBe(0);
    /* Und es sagt der nächsten Stufe, dass noch ein Passwort fehlt. */
    expect(e.passwortFehlt).toBe(true);
  });
});

/* ==========================================================================
   PASSWORT
   ========================================================================== */

describe("Das erste Passwort", () => {
  it("wird vor der Bestätigung abgewiesen", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "zu-frueh@example.org", versand: pf.versand });
    const konto = await A.accountLesenPerMail(s, "zu-frueh@example.org");

    const e = await R.registrierungPasswortSetzen(s, { accountId: konto.id, passwort: GUT });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("unbestaetigt");
    const nachher = await A.accountLesenPerId(s, konto.id);
    expect(nachher.passwort).toBe(null);
    expect(nachher.status).toBe("eingeladen");
  });

  it("wird für ein gesperrtes Konto abgewiesen", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "sperre-pw@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    const v = await R.emailVerifizieren(s, { token });
    await A.accountSperren(s, v.accountId);

    const e = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("gesperrt");
    const nachher = await A.accountLesenPerId(s, v.accountId);
    expect(nachher.passwort).toBe(null);
    expect(nachher.status).toBe("gesperrt");
  });

  it("wird für eine unbekannte Kennung abgewiesen", async () => {
    const s = laden();
    for (const id of ["a_gibtesnicht", "", null, undefined, 42, {}]) {
      const e = await R.registrierungPasswortSetzen(s, { accountId: id, passwort: GUT });
      expect(e.ok, String(id)).toBe(false);
      expect(e.grund).toBe("konto");
    }
  });

  it("richtet sich nach der Regel aus passwoerter.mjs, ohne sie zu wiederholen", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "regel@example.org", versand: pf.versand });
    const v = await R.emailVerifizieren(s, { token: tokenAus(pf.letzter().text) });

    for (const schwach of ["kurz", "elfzeichen", "passwort1234", "centric-dienstplan",
      "regel@example.org", 12345, {}, null]) {
      const e = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: schwach });
      expect(e.ok, String(schwach)).toBe(false);
      expect(e.grund).toBe("regel");
      /* Der Hinweis ist derselbe, den passwoerter.mjs formuliert. */
      expect(e.hinweis).toBe(P.pruefeRegel(schwach, ["regel@example.org", "regel"]).grund);
    }
    expect((await A.accountLesenPerId(s, v.accountId)).passwort).toBe(null);
  });

  it("wird angenommen, macht den Account aktiv und speichert keinen Klartext", async () => {
    const s = laden();
    const { accountId, p } = await durchlaufen(s, "fertig@example.org");
    expect(p.ok).toBe(true);

    const konto = await A.accountLesenPerId(s, accountId);
    expect(konto.status).toBe("aktiv");
    expect(konto.emailVerifiziertAm).toBeTruthy();
    expect(konto.passwortGeaendert).toBeTruthy();
    /* Abgelegt ist der scrypt-Prüfwert, nicht das Passwort. */
    expect(konto.passwort.startsWith("s1$")).toBe(true);
    expect(konto.passwort).not.toContain(GUT);
    expect(await P.passwortPruefen(GUT, konto.passwort)).toBe(true);
    expect(await P.passwortPruefen("etwas anderes 12345", konto.passwort)).toBe(false);

    /* Und nirgends in der ganzen Ablage steht das Passwort im Klartext. */
    const alle = await s.list({});
    for (const b of alle.blobs) {
      const roh = await s.get(b.key).catch(() => null);
      expect(String(roh || ""), b.key).not.toContain(GUT);
    }
  });

  it("zählt die Epoche hoch — einmal", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "epoche@example.org");
    /* Angelegt mit 1, mit dem ersten Passwort auf 2. */
    expect((await A.accountLesenPerId(s, accountId)).epoche).toBe(2);
  });

  it("ändert kein bestehendes Passwort — das ist der Rücksetzweg", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "schon-da@example.org");
    const vorher = await A.accountLesenPerId(s, accountId);

    const e = await R.registrierungPasswortSetzen(s, { accountId, passwort: "Ein ganz anderes 99" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("vorhanden");
    const nachher = await A.accountLesenPerId(s, accountId);
    expect(nachher.passwort).toBe(vorher.passwort);
    expect(nachher.epoche).toBe(vorher.epoche);
    expect(await P.passwortPruefen(GUT, nachher.passwort)).toBe(true);
  });

  it("erzeugt keine Mitgliedschaft, keinen Raum und keine Sitzung", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "leer@example.org");
    expect(await A.mitgliedschaftenDesAccounts(s, accountId)).toEqual([]);
    for (const praefix of ["mitglied:", "raummitglied:", "kern:", "bestand:", "scherbe:",
      "konto:", "t:", "sk:", "push:", "loeschung:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
    /* Am Ende steht: ein aktiver Account, null Mitgliedschaften. */
    const konto = await A.accountLesenPerId(s, accountId);
    expect(konto.status).toBe("aktiv");
  });
});

/* ==========================================================================
   MAILVERSAND
   ========================================================================== */

describe("Die Mail", () => {
  it("führt den Link im Fragment, nicht im Abfragestring", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "link@example.org", versand: pf.versand });
    const text = pf.letzter().text;
    const token = tokenAus(text);

    expect(text).toContain(`https://app.centric-dienstplanung.de/verifizieren#token=${token}`);
    expect(text).not.toContain("?token=");
    expect(text).not.toContain("&token=");
    expect(R.verifizierungsLink("XYZ")).toBe(
      "https://app.centric-dienstplanung.de/verifizieren#token=XYZ");
    /* Und er zeigt auf die Anwendung, nicht auf die Website. */
    expect(text).not.toContain("https://centric-dienstplanung.de/verifizieren");
  });

  it("nennt die Frist, keine Werbung und kein Passwort", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { email: "inhalt@example.org", versand: pf.versand });
    const { an, betreff, text } = pf.letzter();
    expect(an).toBe("inhalt@example.org");
    expect(betreff).toMatch(/bestätige deine E-Mail-Adresse/i);
    expect(text).toMatch(/24 Stunden/);
    expect(text).toMatch(/ignoriere diese E-Mail/i);
    expect(text).not.toMatch(/passwort/i);
    expect(text).not.toMatch(/jetzt kaufen|kostenlos testen|Angebot/i);
  });

  it("lässt den Account bestehen, wenn der Versand scheitert", async () => {
    const s = laden();
    const pf = postfach({ scheitert: true });
    const e = await R.registrierungStarten(s, { email: "kaputt@example.org", versand: pf.versand });

    /* Der Fehler ist sichtbar — und der Account ist da. */
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("versand");
    const konto = await A.accountLesenPerMail(s, "kaputt@example.org");
    expect(konto).not.toBe(null);
    expect(konto.status).toBe("eingeladen");
    expect(konto.passwort).toBe(null);
    expect(konto.emailVerifiziertAm).toBe(null);
  });

  it("lässt nach einem Versandfehler einen neuen Versuch zu", async () => {
    const s = laden();
    const kaputt = postfach({ scheitert: true });
    await R.registrierungStarten(s, { email: "zweiter@example.org", versand: kaputt.versand });
    const altesToken = tokenAus(kaputt.letzter().text);

    const gut = postfach();
    const e = await R.verifizierungErneutSenden(s, { email: "zweiter@example.org",
      versand: gut.versand });
    expect(e.ok).toBe(true);
    const neuesToken = tokenAus(gut.letzter().text);
    expect(neuesToken).not.toBe(altesToken);

    /* Das Token aus dem gescheiterten Versand ist entwertet. */
    expect((await R.emailVerifizieren(s, { token: altesToken })).ok).toBe(false);
    expect((await R.emailVerifizieren(s, { token: neuesToken })).ok).toBe(true);
    /* Immer noch genau ein Konto. */
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
  });

  it("schickt einem aktiven oder gesperrten Konto nichts und verrät nichts", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "erneut-aktiv@example.org");
    const { accountId: gesperrt } = await durchlaufen(s, "erneut-sperre@example.org");
    await A.accountSperren(s, gesperrt);

    const pf = postfach();
    const eins = await R.verifizierungErneutSenden(s, { email: "erneut-aktiv@example.org",
      versand: pf.versand });
    const zwei = await R.verifizierungErneutSenden(s, { email: "erneut-sperre@example.org",
      versand: pf.versand });
    const drei = await R.verifizierungErneutSenden(s, { email: "gibt-es-nicht@example.org",
      versand: pf.versand });

    expect(pf.briefe.length).toBe(0);
    for (const e of [eins, zwei, drei]) {
      expect(e.ok).toBe(true);
      expect(e.hinweis).toBe(R.HINWEIS_GENERISCH);
    }
    /* Alle drei Antworten sind nach außen nicht unterscheidbar. */
    expect(new Set([eins, zwei, drei].map((e) =>
      JSON.stringify({ ok: e.ok, hinweis: e.hinweis }))).size).toBe(1);
    /* Und die bestehenden Konten sind unberührt. */
    expect((await A.accountLesenPerId(s, accountId)).status).toBe("aktiv");
    expect((await A.accountLesenPerId(s, gesperrt)).status).toBe("gesperrt");
  });
});

/* ==========================================================================
   WAS DAS MODUL NICHT TUT
   ========================================================================== */

describe("Die Grenzen des Moduls", () => {
  let quelle;
  beforeAll(async () => {
    quelle = await readFile(new URL("../server/lib/registrierung.mjs", import.meta.url), "utf8");
  });

  it("schreibt kein Token und kein Passwort in ein Protokoll", () => {
    /* Kein console.* im Modul: Ein Token in einer Logzeile ist ein Token in
       einer Logdatei, und die liest jemand. */
    expect(quelle).not.toMatch(/\bconsole\s*\./);
    expect(quelle).not.toMatch(/\blogger\b/);
  });

  it("gibt kein Token in einem Fehlerobjekt zurück", async () => {
    const s = laden();
    const pf = postfach({ scheitert: true });
    const e = await R.registrierungStarten(s, { email: "fehlerobjekt@example.org",
      versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    expect(e.ok).toBe(false);
    expect(JSON.stringify(e)).not.toContain(token);

    /* Auch die Absage einer Bestätigung nennt das Token nicht. */
    const abgelehnt = await R.emailVerifizieren(s, { token: `${token}x` });
    expect(JSON.stringify(abgelehnt)).not.toContain(token);
  });

  it("gibt das Token nur zurück, wenn die Prüfschranke ausdrücklich offen ist", async () => {
    const s = laden();
    const pf = postfach();
    /* Standard in dieser Prüfung: Schranke zu (CENTRIC_PRUEFLINK nicht gesetzt). */
    delete process.env.CENTRIC_PRUEFLINK;
    const zu = await R.registrierungStarten(s, { email: "schranke-zu@example.org",
      versand: pf.versand });
    expect(zu.pruefToken).toBeUndefined();
    expect(JSON.stringify(zu)).not.toContain(tokenAus(pf.letzter().text));

    process.env.CENTRIC_PRUEFLINK = "ja";
    const offen = await R.registrierungStarten(s, { email: "schranke-auf@example.org",
      versand: pf.versand });
    expect(offen.pruefToken).toBe(tokenAus(pf.letzter().text));
    delete process.env.CENTRIC_PRUEFLINK;
  });

  it("kennt keine HTTP-Schicht und keine Raumoperationen", () => {
    /* Geschäftslogik heißt: kein Request, keine Antwort, kein Statuscode —
       und nichts, was einen Betrieb anlegen könnte. */
    const nichtImport = [
      /from\s+["']node:http["']/, /from\s+["'][^"']*\/daten\.mjs["']/,
      /from\s+["'][^"']*bestand\.mjs["']/, /from\s+["'][^"']*scherben\.mjs["']/,
      /from\s+["'][^"']*leerbetrieb\.mjs["']/, /from\s+["'][^"']*sitzungen\.mjs["']/,
      /from\s+["'][^"']*rechte\.mjs["']/,
    ];
    for (const m of nichtImport) expect(m.test(quelle), String(m)).toBe(false);
    /* Und es ruft keine der Funktionen auf, die Berechtigungen erzeugen. */
    for (const name of ["mitgliedschaftAnlegen", "mitgliedschaftAktivieren",
      "bestandSchreiben", "sitzungAnlegen", "raumLoeschen"]) {
      expect(quelle.includes(name), name).toBe(false);
    }
  });

  it("wird von keinem Produktionsmodul eingebunden", async () => {
    const einbindung = (datei) =>
      /(?:^|[^*\s])\s*(?:import[^;]*from\s*["'][^"']*(?:registrierung|accounts)\.mjs|import\s*\(\s*["'][^"']*(?:registrierung|accounts)\.mjs|require\s*\(\s*["'][^"']*(?:registrierung|accounts)\.mjs)/m
        .test(datei);
    for (const d of ["../server.mjs", "../server/funktionen/daten.mjs",
      "../server/funktionen/starten.mjs", "../server/funktionen/zustellung.mjs",
      "../server/lib/rechte.mjs", "../server/lib/sitzungen.mjs",
      "../server/lib/raumloeschung.mjs", "../server/lib/aufraeumen.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(einbindung(text), d).toBe(false);
    }
  });

  it("verlangt von der Endpunktschicht ausdrücklich eine Bremse", () => {
    /* Die Anforderung steht im Modul, damit sie nicht in einem Bericht
       verschwindet, den später niemand liest. */
    expect(quelle).toMatch(/Bremse je Herkunft UND je Adresse/);
    expect(quelle).toMatch(/Kein\s+öffentlicher Endpunkt ohne Bremse/);
  });
});
