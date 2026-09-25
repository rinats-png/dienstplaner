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

/* Die Angaben, die ein Selbsteintritt künftig mitbringt. Aus ihnen entsteht
   später eine Leitungsperson und ein Betrieb — in diesem Schritt werden sie
   nur erfasst. */
/* Ein gueltig geformter Pruefwert fuer Faelle, in denen ein Account direkt
   angelegt wird — die Kryptographie prueft passwoerter.mjs. */
const PW_ABLAGE = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

const PROFIL = { vorname: "Rina", nachname: "Schmitt",
  betriebsname: "Wachdienst Nordlicht" };

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
async function durchlaufen(s, email = "neu@example.org", passwort = GUT, profil = PROFIL) {
  const pf = postfach();
  const start = await R.registrierungStarten(s, { ...profil, email, versand: pf.versand, jetzt: uhr(T0) });
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
    const e = await R.registrierungStarten(s, { ...PROFIL, email: "eins@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "  Test@Example.org ", versand: pf.versand });
    const konto = await A.accountLesenPerMail(s, "test@example.org");
    expect(konto).not.toBe(null);
    expect(konto.emailNorm).toBe("test@example.org");
    /* Die Anzeigeform bleibt, wie sie eingegeben wurde — nur getrimmt. */
    expect(konto.email).toBe("Test@Example.org");

    /* Zweiter Versuch in anderer Schreibweise: derselbe Account. */
    const zweite = await R.registrierungStarten(s, { ...PROFIL, email: "TEST@EXAMPLE.ORG", versand: pf.versand });
    expect(zweite.protokoll.fall).toBe("erneut");
    expect(zweite.protokoll.accountId).toBe(konto.id);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(1);
  });

  it("behandelt eine Plus-Kennzeichnung als eigene Adresse", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { ...PROFIL, email: "max@example.org", versand: pf.versand });
    await R.registrierungStarten(s, { ...PROFIL, email: "max+dienst@example.org", versand: pf.versand });
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(2);
  });

  it("weist eine unbrauchbare Adresse ab, ohne etwas anzulegen", async () => {
    const s = laden();
    const pf = postfach();
    for (const email of ["", "   ", "kein-at", "a@b", null, undefined, 42, {}]) {
      const e = await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand });
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
    const e = await R.registrierungStarten(s, { ...PROFIL, email: "aktiv@example.org", versand: pf.versand });
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
    const e = await R.registrierungStarten(s, { ...PROFIL, email: "gesperrt@example.org", versand: pf.versand });
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
    const erste = await R.registrierungStarten(s, { ...PROFIL, email: "warte@example.org", versand: pf.versand });
    const konto1 = await A.accountLesenPerMail(s, "warte@example.org");

    const zweite = await R.registrierungStarten(s, { ...PROFIL, email: "warte@example.org", versand: pf.versand });
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
      const e = await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand });
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
      R.registrierungStarten(s, { ...PROFIL, email: "viele@example.org", versand: pf.versand })));
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
    await R.registrierungStarten(s, { ...PROFIL, email: "zweck@example.org", versand: pf.versand,
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
    await R.registrierungStarten(s, { ...PROFIL, email: "hash@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "nichtdrin@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "bind-a@example.org", versand: pf.versand });
    const tokenA = tokenAus(pf.letzter().text);
    await R.registrierungStarten(s, { ...PROFIL, email: "bind-b@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "eintrag-a@example.org", versand: pf.versand });
    const token = tokenAus(pf.letzter().text);
    await R.registrierungStarten(s, { ...PROFIL, email: "eintrag-b@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "ohne-id@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "zwei@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "zaehler@example.org", versand: pf.versand });
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
      await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand, jetzt: uhr(T0) });
      const token = tokenAus(pf.letzter().text);
      const e = await R.emailVerifizieren(s, { token, jetzt: uhr(T0 + versatz) });
      expect(e.ok, name).toBe(erwartet);
    }
  });

  it("weist falsche, zweckfremde und formlose Token ab", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, { ...PROFIL, email: "falsch@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "sperre-token@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "einmal@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "nur-datum@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "zu-frueh@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "sperre-pw@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "regel@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "link@example.org", versand: pf.versand });
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
    await R.registrierungStarten(s, { ...PROFIL, email: "inhalt@example.org", versand: pf.versand });
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
    const e = await R.registrierungStarten(s, { ...PROFIL, email: "kaputt@example.org", versand: pf.versand });

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
    await R.registrierungStarten(s, { ...PROFIL, email: "zweiter@example.org", versand: kaputt.versand });
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
    const e = await R.registrierungStarten(s, { ...PROFIL, email: "fehlerobjekt@example.org",
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
    const zu = await R.registrierungStarten(s, { ...PROFIL, email: "schranke-zu@example.org",
      versand: pf.versand });
    expect(zu.pruefToken).toBeUndefined();
    expect(JSON.stringify(zu)).not.toContain(tokenAus(pf.letzter().text));

    process.env.CENTRIC_PRUEFLINK = "ja";
    const offen = await R.registrierungStarten(s, { ...PROFIL, email: "schranke-auf@example.org",
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

/* ==========================================================================
   DAS REGISTRIERUNGSPROFIL

   Vorname, Nachname und Betriebsname sind das, woraus später eine
   Leitungsperson und ein Betrieb entstehen. Hier werden sie nur erfasst —
   geprüft wird, dass sie erfasst werden müssen, dass sie nichts anderes
   mitbringen (keine Rolle, keine Person, keinen Raum) und dass ein zweiter
   Versuch sie nicht überschreibt.
   ========================================================================== */

describe("Das Registrierungsprofil", () => {
  const ohne = (feld) => {
    const p = { ...PROFIL };
    delete p[feld];
    return p;
  };

  it("verlangt Vorname, Nachname und Betriebsname", async () => {
    const s = laden();
    const pf = postfach();
    for (const feld of ["vorname", "nachname", "betriebsname"]) {
      const e = await R.registrierungStarten(s,
        { ...ohne(feld), email: `fehlt-${feld}@example.org`, versand: pf.versand });
      expect(e.ok, feld).toBe(false);
      expect(e.grund, feld).toBe(feld);
      expect(e.hinweis).toBe(R.HINWEISE_PROFIL[feld]);
    }
    /* Nichts angelegt, nichts verschickt. */
    expect(pf.briefe.length).toBe(0);
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(0);
  });

  it("weist leere, zu lange und unsichtbare Angaben ab", async () => {
    const s = laden();
    const pf = postfach();
    const lang = "x".repeat(81);
    const faelle = [
      ["vorname", ""], ["vorname", "   "], ["vorname", lang], ["vorname", 42],
      ["vorname", null], ["vorname", "Ri\nna"], ["vorname", "Ri\tna"],
      ["nachname", ""], ["nachname", "  "], ["nachname", lang], ["nachname", {}],
      ["betriebsname", ""], ["betriebsname", "ab"], ["betriebsname", "  ab  "],
      ["betriebsname", lang], ["betriebsname", "Wach\ndienst"],
    ];
    for (const [feld, wert] of faelle) {
      const e = await R.registrierungStarten(s,
        { ...PROFIL, [feld]: wert, email: "grenzen@example.org", versand: pf.versand });
      expect(e.ok, `${feld}=${JSON.stringify(wert)}`).toBe(false);
      expect(e.grund, `${feld}=${JSON.stringify(wert)}`).toBe(feld);
    }
    expect((await s.list({ prefix: "account:" })).blobs.length).toBe(0);
  });

  it("nimmt genau die Grenzwerte an", async () => {
    const s = laden();
    const pf = postfach();
    const e = await R.registrierungStarten(s, {
      vorname: "A", nachname: "B", betriebsname: "abc",
      email: "grenzwert@example.org", versand: pf.versand,
    });
    expect(e.ok).toBe(true);
    const lang = "y".repeat(80);
    const e2 = await R.registrierungStarten(s, {
      vorname: lang, nachname: lang, betriebsname: lang,
      email: "grenzwert2@example.org", versand: pf.versand,
    });
    expect(e2.ok).toBe(true);
    expect((await A.accountLesenPerMail(s, "grenzwert2@example.org")).profil.vorname)
      .toBe(lang);
  });

  it("trimmt die Angaben, ohne sie zu verändern", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, {
      vorname: "  Rina  ", nachname: "\tSchmitt ", betriebsname: "  Wachdienst Nord  ",
      email: "trim@example.org", versand: pf.versand,
    });
    const konto = await A.accountLesenPerMail(s, "trim@example.org");
    expect(konto.profil.vorname).toBe("Rina");
    expect(konto.profil.nachname).toBe("Schmitt");
    expect(konto.profil.betriebsname).toBe("Wachdienst Nord");
  });

  it("lässt Namen aus aller Welt zu", async () => {
    const s = laden();
    const pf = postfach();
    const faelle = [
      ["Þórunn", "Guðmundsdóttir", "Öryggisþjónusta Norður"],
      ["مريم", "الأحمد", "خدمة الأمن"],
      ["李", "娜", "北方安保有限公司"],
      ["Jean-Luc", "O'Brien-Müller", "Sécurité & Co. (Süd)"],
      ["Ana", "Ruiz", "Seguridad 24·7"],
    ];
    let n = 0;
    for (const [vorname, nachname, betriebsname] of faelle) {
      const email = `welt${++n}@example.org`;
      const e = await R.registrierungStarten(s,
        { vorname, nachname, betriebsname, email, versand: pf.versand });
      expect(e.ok, vorname).toBe(true);
      const konto = await A.accountLesenPerMail(s, email);
      expect([konto.profil.vorname, konto.profil.nachname, konto.profil.betriebsname])
        .toEqual([vorname, nachname, betriebsname]);
    }
  });

  it("speichert im Profil nichts als die drei Angaben", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s, {
      ...PROFIL, email: "sauber@example.org", versand: pf.versand,
      /* Alles, was ein Aufrufer noch mitschicken könnte: */
      rolle: "betreiber", person: "p17", personId: "p17", raum: "t-eigener",
      betrieb: 0, mandantId: "m1", passwort: GUT, email2: "zweit@example.org",
    });
    const konto = await A.accountLesenPerMail(s, "sauber@example.org");
    expect(Object.keys(konto.profil).sort())
      .toEqual(["betriebsname", "erfasstAm", "nachname", "vorname"]);
    const text = JSON.stringify(konto.profil);
    /* Keine Rolle, keine Person, kein Raum, kein Betrieb. */
    for (const wort of ["betreiber", "p17", "t-eigener", "mandant", "leitung"]) {
      expect(text.toLowerCase(), wort).not.toContain(wort.toLowerCase());
    }
    /* Keine zweite Adresse und kein Passwort im Profil. */
    expect(text).not.toContain("@");
    expect(text).not.toContain(GUT);
    expect(text).not.toContain("s1$");
    /* Die Adresse bleibt allein in den Accountfeldern. */
    expect(konto.emailNorm).toBe("sauber@example.org");
  });

  it("überschreibt die Angaben bei einem zweiten Startversuch nicht", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s,
      { ...PROFIL, email: "erst@example.org", versand: pf.versand });
    const erst = (await A.accountLesenPerMail(s, "erst@example.org")).profil;

    const e = await R.registrierungStarten(s, {
      vorname: "Fremd", nachname: "Fremder", betriebsname: "Fremder Betrieb",
      email: "erst@example.org", versand: pf.versand,
    });
    expect(e.ok).toBe(true);
    expect(e.protokoll.fall).toBe("erneut");
    const nachher = (await A.accountLesenPerMail(s, "erst@example.org")).profil;
    expect(nachher).toEqual(erst);
    expect(nachher.vorname).toBe("Rina");
    /* Ein neuer Link ist trotzdem unterwegs. */
    expect(pf.briefe.length).toBe(2);
  });

  it("bleibt durch Bestätigung und Passwortsetzung unverändert", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s,
      { ...PROFIL, email: "unberuehrt@example.org", versand: pf.versand });
    const nachStart = JSON.stringify(
      (await A.accountLesenPerMail(s, "unberuehrt@example.org")).profil);

    const v = await R.emailVerifizieren(s, { token: tokenAus(pf.letzter().text) });
    expect(JSON.stringify((await A.accountLesenPerId(s, v.accountId)).profil))
      .toBe(nachStart);

    await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
    const konto = await A.accountLesenPerId(s, v.accountId);
    expect(JSON.stringify(konto.profil)).toBe(nachStart);
    /* Und nach der Aktivierung sind die Angaben für die Provisionierung da. */
    expect(konto.status).toBe("aktiv");
    expect(konto.profil.vorname).toBe("Rina");
    expect(konto.profil.nachname).toBe("Schmitt");
    expect(konto.profil.betriebsname).toBe("Wachdienst Nordlicht");
  });
});

/* ==========================================================================
   DER ANSPRUCH AUF EINEN TESTBETRIEB

   Eine Frage, die ohne Mitgliedschaften beantwortet werden muss: Darf aus
   diesem Account ein kostenloser Testbetrieb entstehen? Vier Lagen sind zu
   unterscheiden, und keine davon hängt daran, ob irgendwo eine
   Mitgliedschaft liegt.
   ========================================================================== */

describe("Der Anspruch auf einen kostenlosen Testbetrieb", () => {
  it("ist für einen fertigen Selbsteintritt offen", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "offen@example.org");
    const konto = await A.accountLesenPerId(s, accountId);
    expect(konto.testbetriebOffenSeit).toBeTruthy();
    expect(konto.testbetriebVerbrauchtAm).toBe(null);
    expect(A.testbetriebOffen(konto)).toEqual({ ok: true, grund: "offen" });
    /* Und das, obwohl es keine einzige Mitgliedschaft gibt. */
    expect(await A.mitgliedschaftenDesAccounts(s, accountId)).toEqual([]);
  });

  it("ist während der Registrierung noch nicht offen", async () => {
    const s = laden();
    const pf = postfach();
    await R.registrierungStarten(s,
      { ...PROFIL, email: "nochnicht@example.org", versand: pf.versand });
    const roh = await A.accountLesenPerMail(s, "nochnicht@example.org");
    /* Der Vorgang läuft, aber Adresse und Passwort fehlen noch. */
    expect(roh.testbetriebOffenSeit).toBeTruthy();
    expect(A.testbetriebOffen(roh)).toEqual({ ok: false, grund: "nicht-aktiv" });

    const v = await R.emailVerifizieren(s, { token: tokenAus(pf.letzter().text) });
    const nachMail = await A.accountLesenPerId(s, v.accountId);
    expect(A.testbetriebOffen(nachMail).ok).toBe(false);
    expect(A.testbetriebOffen(nachMail).grund).toBe("nicht-aktiv");

    await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
    expect(A.testbetriebOffen(await A.accountLesenPerId(s, v.accountId)).ok).toBe(true);
  });

  it("ist für einen aktiven Account ohne Vorgang NICHT offen", async () => {
    /* Der historische Fall: ein Account aus der späteren Codemigration oder
       aus einer Einladung. Aktiv, bestätigt, mit Passwort — und trotzdem kein
       Anspruch, denn niemand hat einen Neukundenvorgang begonnen. */
    const s = laden();
    const angelegt = await A.accountAnlegen(s, { email: "historisch@example.org",
      status: "aktiv", passwort: PW_ABLAGE, emailVerifiziertAm: new Date().toISOString() });
    const konto = angelegt.account;
    expect(konto.testbetriebOffenSeit).toBe(null);
    expect(konto.testbetriebVerbrauchtAm).toBe(null);
    expect(A.testbetriebOffen(konto)).toEqual({ ok: false, grund: "kein-vorgang" });
  });

  it("wird einem eingeladenen Account nicht beiläufig gegeben", async () => {
    const s = laden();
    /* So legt der Einladungsweg an: ohne Selbstbedienung, ohne Profil. */
    const eingeladen = (await A.accountAnlegen(s, { email: "geladen@example.org" })).account;
    expect(eingeladen.testbetriebOffenSeit).toBe(null);
    expect(eingeladen.profil).toBe(null);
    await A.mitgliedschaftAnlegen(s, { accountId: eingeladen.id, raum: "t-fremder-betrieb",
      betrieb: 0, mandantId: "m1", rolle: "mitarbeiter", status: "aktiv", person: "p9" });

    /* Auch ein Registrierungsversuch auf dieselbe Adresse öffnet nichts: Das
       wartende Konto bekommt nur einen neuen Link. */
    const pf = postfach();
    const e = await R.registrierungStarten(s,
      { ...PROFIL, email: "geladen@example.org", versand: pf.versand });
    expect(e.ok).toBe(true);
    expect(e.protokoll.fall).toBe("erneut");
    const nachher = await A.accountLesenPerId(s, eingeladen.id);
    expect(nachher.testbetriebOffenSeit).toBe(null);
    expect(nachher.profil).toBe(null);
    expect(A.testbetriebOffen(nachher).grund).toBe("kein-vorgang");
    /* Seine Mitgliedschaft ist unberührt. */
    expect((await A.mitgliedschaftLesen(s, eingeladen.id, "t-fremder-betrieb")).rolle)
      .toBe("mitarbeiter");
  });

  it("kann für einen eingeladenen Account ausdrücklich geöffnet werden", async () => {
    /* Der Weg, den ein späterer Schritt nutzen wird: Wer als Beschäftigte
       eingeladen wurde, darf morgen ihren eigenen Betrieb führen wollen. Die
       Herkunft ist keine Sperre auf Lebenszeit — der Verbrauch ist es. */
    const s = laden();
    const konto = (await A.accountAnlegen(s, { email: "spaeter@example.org",
      status: "aktiv", passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString() })).account;
    expect(A.testbetriebOffen(konto).ok).toBe(false);

    const e = await A.testbetriebOeffnen(s, konto.id);
    expect(e.ok).toBe(true);
    expect(A.testbetriebOffen(await A.accountLesenPerId(s, konto.id)).ok).toBe(true);
    /* Zweimal öffnen ändert nichts. */
    const zwei = await A.testbetriebOeffnen(s, konto.id);
    expect(zwei.ok).toBe(true);
    expect(zwei.unveraendert).toBe(true);
  });

  it("ist nach dem Verbrauch für immer zu — auch ohne Raum und Mitgliedschaft", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "verbraucht@example.org");
    /* So wird die Provisionierung es später vermerken. */
    const e = await A.testbetriebVerbrauchen(s, accountId);
    expect(e.ok).toBe(true);

    const konto = await A.accountLesenPerId(s, accountId);
    expect(konto.testbetriebVerbrauchtAm).toBeTruthy();
    expect(konto.testbetriebOffenSeit).toBe(null);
    expect(A.testbetriebOffen(konto)).toEqual({ ok: false, grund: "verbraucht" });

    /* Und er lässt sich nicht wiederbeleben: weder über die Registrierung
       noch über das ausdrückliche Öffnen. */
    const pf = postfach();
    await R.registrierungStarten(s,
      { ...PROFIL, email: "verbraucht@example.org", versand: pf.versand });
    expect((await A.accountLesenPerId(s, accountId)).testbetriebOffenSeit).toBe(null);
    const wieder = await A.testbetriebOeffnen(s, accountId);
    expect(wieder.ok).toBe(false);
    expect(wieder.grund).toBe("verbraucht");
    expect(A.testbetriebOffen(await A.accountLesenPerId(s, accountId)).grund)
      .toBe("verbraucht");
  });

  it("bleibt verbraucht, wenn Raum und Mitgliedschaft später verschwinden", async () => {
    /* Der Fall, an dem „hat keine Mitgliedschaft" scheitern würde: Nach
       dreißig Tagen Test und neunzig Tagen Aufbewahrung ist der Betrieb weg —
       und mit ihm jede Mitgliedschaft. Der Anspruch bleibt verbraucht. */
    const s = laden();
    const { accountId } = await durchlaufen(s, "spurlos@example.org");
    await A.mitgliedschaftAnlegen(s, { accountId, raum: "t-spurlos-raum", betrieb: 0,
      mandantId: "m1", rolle: "leitung", status: "aktiv", person: "p1" });
    await A.testbetriebVerbrauchen(s, accountId);

    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const sitzungen = getStore({ name: `sitz${zaehler}`, consistency: "strong" });
    const weg = await raumLoeschen(s, sitzungen, "t-spurlos-raum");
    expect(weg.vollstaendig).toBe(true);

    const konto = await A.accountLesenPerId(s, accountId);
    expect(await A.mitgliedschaftenDesAccounts(s, accountId)).toEqual([]);
    expect(konto.testbetriebVerbrauchtAm).toBeTruthy();
    expect(A.testbetriebOffen(konto).grund).toBe("verbraucht");
  });

  it("hängt an keiner Mitgliedschaft — in beide Richtungen", async () => {
    const s = laden();
    /* Offener Anspruch, aber schon Mitglied in einem fremden Betrieb: Das
       nimmt ihm den eigenen Test nicht. */
    const { accountId } = await durchlaufen(s, "beides@example.org");
    await A.mitgliedschaftAnlegen(s, { accountId, raum: "t-fremd-beides", betrieb: 0,
      mandantId: "m1", rolle: "mitarbeiter", status: "aktiv", person: "p3" });
    expect(A.testbetriebOffen(await A.accountLesenPerId(s, accountId)).ok).toBe(true);

    /* Kein Anspruch, aber auch keine Mitgliedschaft: Das gibt ihm keinen. */
    const leer = (await A.accountAnlegen(s, { email: "leer-ohne@example.org",
      status: "aktiv", passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString() })).account;
    expect(await A.mitgliedschaftenDesAccounts(s, leer.id)).toEqual([]);
    expect(A.testbetriebOffen(leer).ok).toBe(false);
  });

  it("ist für einen gesperrten Account zu", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "gesperrt-anspruch@example.org");
    await A.accountSperren(s, accountId);
    const konto = await A.accountLesenPerId(s, accountId);
    expect(A.testbetriebOffen(konto)).toEqual({ ok: false, grund: "nicht-aktiv" });
    /* Der Vorgang bleibt vermerkt — gesperrt ist nicht verbraucht. */
    expect(konto.testbetriebOffenSeit).toBeTruthy();
    expect(konto.testbetriebVerbrauchtAm).toBe(null);
  });

  it("nimmt einen Verbrauch bei zwei gleichzeitig gesetzten Marken ernst", async () => {
    /* Ein Zustand, der nicht entstehen soll — und wenn doch, entscheidet er
       gegen den kostenlosen Betrieb. Im Zweifel kein Betrieb. */
    const s = laden();
    const { accountId } = await durchlaufen(s, "beide-marken@example.org");
    const e = await A.accountAendern(s, accountId,
      { testbetriebVerbrauchtAm: new Date().toISOString() });
    expect(e.ok).toBe(true);
    const konto = await A.accountLesenPerId(s, accountId);
    expect(konto.testbetriebOffenSeit).toBeTruthy();
    expect(konto.testbetriebVerbrauchtAm).toBeTruthy();
    expect(A.testbetriebOffen(konto)).toEqual({ ok: false, grund: "verbraucht" });
  });

  it("liest einen alten Account ohne die neuen Felder", async () => {
    /* Bestandsdatensätze aus der Zeit vor diesem Schritt: Sie kennen weder
       Profil noch Marken. Lesen muss gehen, und der Anspruch ist zu. */
    const s = laden();
    const alt = {
      id: "a_altbestand", email: "alt@example.org", emailNorm: "alt@example.org",
      emailVerifiziertAm: "2026-01-01T00:00:00.000Z", passwort: PW_ABLAGE,
      status: "aktiv", tokenNr: { einladung: 0, verifizierung: 1, zuruecksetzen: 0 },
      epoche: 2, erstellt: "2026-01-01T00:00:00.000Z",
      aktualisiert: "2026-01-01T00:00:00.000Z",
      passwortGeaendert: "2026-01-01T00:00:00.000Z", letzteAnmeldung: null,
    };
    await s.setJSON(A.accountSchluessel("alt@example.org"), alt);
    await s.setJSON(A.kontoIdSchluessel("a_altbestand"),
      { schluessel: A.accountSchluessel("alt@example.org") });

    const gelesen = await A.accountLesenPerId(s, "a_altbestand");
    expect(gelesen.id).toBe("a_altbestand");
    expect(gelesen.profil).toBeUndefined();
    expect(gelesen.testbetriebVerbrauchtAm).toBeUndefined();
    /* Kein Anspruch — ein fehlender Verbrauchsvermerk ist keine Erlaubnis. */
    expect(A.testbetriebOffen(gelesen)).toEqual({ ok: false, grund: "kein-vorgang" });
    /* Und er bleibt änderbar wie jeder andere. */
    expect((await A.anmeldungVermerken(s, "a_altbestand")).ok).toBe(true);
  });

  it("weist unbrauchbare Werte für Profil und Marken ab", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "werte@example.org");
    for (const [feld, wert] of [
      ["testbetriebOffenSeit", 42], ["testbetriebOffenSeit", ""],
      ["testbetriebVerbrauchtAm", true], ["testbetriebVerbrauchtAm", {}],
    ]) {
      const e = await A.accountAendern(s, accountId, { [feld]: wert });
      expect(e.ok, `${feld}=${JSON.stringify(wert)}`).toBe(false);
      expect(e.grund).toBe(feld);
    }
    const e = await A.accountAendern(s, accountId, { profil: { vorname: "A" } });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("profil:nachname");
    /* null bleibt erlaubt: So räumt die Provisionierung den Vorgang ab. */
    expect((await A.accountAendern(s, accountId, { testbetriebOffenSeit: null })).ok)
      .toBe(true);
  });

  it("erzeugt bis hierher weiterhin keinen Betrieb, keine Rolle, keine Sitzung", async () => {
    const s = laden();
    const { accountId } = await durchlaufen(s, "grenze@example.org");
    const konto = await A.accountLesenPerId(s, accountId);
    /* Der Account trägt Profildaten — aber keine Rolle und keinen Raum. */
    for (const feld of ["rolle", "raum", "betrieb", "mandantId", "person", "einheit"]) {
      expect(Object.prototype.hasOwnProperty.call(konto, feld), feld).toBe(false);
    }
    for (const praefix of ["mitglied:", "raummitglied:", "kern:", "bestand:",
      "scherbe:", "konto:", "t:", "sk:", "push:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
  });
});
