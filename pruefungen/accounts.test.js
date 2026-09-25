/* ==========================================================================
   ACCOUNTS UND MITGLIEDSCHAFTEN

   Geprüft wird gegen die echte Dateiablage, nicht gegen eine Nachbildung:
   Die Eindeutigkeit einer Adresse hängt daran, dass ein Schreibvorgang
   wirklich schreibt und ein Löschvorgang wirklich löscht.

   Zwei Eigenschaften stehen über allen anderen, und beide sind
   Datenschutz, nicht Bequemlichkeit:

     Ein Account hat keine Rolle. Rollen gehören Mitgliedschaften.

     Wer nach Raum Y fragt und nur in Raum X Mitglied ist, bekommt nichts.
     Kein Rückfall, kein „es gibt ja nur einen".
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, A;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-accounts-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  /* Mit Pfeffer, wie in der Auslieferung: Dann steht keine Adresse als
     ungesalzene Prüfsumme im Schlüssel. */
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  A = await import("../server/lib/accounts.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

let zaehler = 0;
/** Jeder Test bekommt seinen eigenen Speicher. */
const laden = () => getStore({ name: `konten${++zaehler}`, consistency: "strong" });

/** Ein Speicher, der bei bestimmten Schlüsseln beim Schreiben scheitert. */
const mitFehler = (echt, trifft) => ({
  ...echt,
  get: (k, o) => echt.get(k, o),
  list: (o) => echt.list(o),
  delete: (k) => echt.delete(k),
  setJSON: async (k, v, o) => {
    if (trifft(k)) throw new Error(`Platte voll bei ${k}`);
    return echt.setJSON(k, v, o);
  },
});

const PW = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

/* ==========================================================================
   ACCOUNT
   ========================================================================== */

describe("Account anlegen", () => {
  it("normalisiert die Adresse und behält die Anzeigeform", async () => {
    const s = laden();
    const e = await A.accountAnlegen(s, { email: "  Max.Mueller@Example.DE " });
    expect(e.ok).toBe(true);
    expect(e.account.emailNorm).toBe("max.mueller@example.de");
    expect(e.account.email).toBe("Max.Mueller@Example.DE");
  });

  it("weist unbrauchbare Adressen ab", async () => {
    const s = laden();
    for (const email of ["", "   ", undefined, null, "max", "max@", "@example.org",
      "max@localhost", "ma x@example.org", "a".repeat(250) + "@example.org"]) {
      const e = await A.accountAnlegen(s, { email });
      expect(e.ok, String(email)).toBe(false);
      expect(e.grund).toBe("adresse");
    }
  });

  it("legt einen vollständigen Datensatz mit den vereinbarten Feldern an", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "a@example.org" });
    expect(Object.keys(account).sort()).toEqual([
      "aktualisiert", "email", "emailNorm", "emailVerifiziertAm", "epoche",
      "erstellt", "id", "letzteAnmeldung", "passwort", "passwortGeaendert",
      "profil", "status", "testbetriebOffenSeit", "testbetriebVerbrauchtAm",
      "tokenNr",
    ]);
    expect(account.status).toBe("eingeladen");
    expect(account.passwort).toBe(null);
    expect(account.emailVerifiziertAm).toBe(null);
    expect(account.epoche).toBe(1);
    expect(account.tokenNr).toEqual({ einladung: 0, verifizierung: 0, zuruecksetzen: 0 });
    expect(account.letzteAnmeldung).toBe(null);
    /* Ohne ausdrückliche Angabe: kein Registrierungsprofil, kein
       Neukundenvorgang, kein verbrauchter Testbetrieb. Ein Account, den eine
       Einladung anlegt, sieht genau so aus. */
    expect(account.profil).toBe(null);
    expect(account.testbetriebOffenSeit).toBe(null);
    expect(account.testbetriebVerbrauchtAm).toBe(null);
  });

  it("nimmt Registrierungsdaten und den Neukundenvorgang nur auf Verlangen an", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "profil@example.org",
      profil: { vorname: "  Rina ", nachname: "Schmitt", betriebsname: "Wachdienst Nord" },
      selbstbedienung: true });
    expect(Object.keys(account.profil).sort())
      .toEqual(["betriebsname", "erfasstAm", "nachname", "vorname"]);
    expect(account.profil.vorname).toBe("Rina");
    expect(account.testbetriebOffenSeit).toBeTruthy();
    expect(account.testbetriebVerbrauchtAm).toBe(null);
    /* Ein unbrauchbares Profil verhindert die Anlage — kein halber Account. */
    const e = await A.accountAnlegen(s, { email: "halb@example.org",
      profil: { vorname: "A", nachname: "B" } });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("betriebsname");
    expect(await A.accountLesenPerMail(s, "halb@example.org")).toBe(null);
  });

  it("gibt jedem Account eine stabile, zufällige Kennung", async () => {
    const s = laden();
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      const { account } = await A.accountAnlegen(s, { email: `konto${i}@example.org` });
      expect(account.id).toMatch(/^a_[A-Za-z0-9_-]{20,}$/);
      ids.add(account.id);
    }
    expect(ids.size).toBe(20);
  });

  it("leitet die Kennung nicht aus der Adresse ab", async () => {
    /* Der Beweis ist nicht, dass zufällig kein Buchstabe der Adresse
       vorkommt — bei vierundzwanzig Zufallszeichen kommt fast jedes
       Zweierpaar vor. Der Beweis ist: Dieselbe Adresse ergibt in zwei
       Speichern zwei verschiedene Kennungen. Wäre sie abgeleitet, wären
       sie gleich. */
    const a1 = await A.accountAnlegen(laden(), { email: "gleich@example.org" });
    const a2 = await A.accountAnlegen(laden(), { email: "gleich@example.org" });
    expect(a1.ok && a2.ok).toBe(true);
    expect(a1.account.id).not.toBe(a2.account.id);
    /* Und der örtliche Teil steht nicht darin. */
    expect(a1.account.id).not.toContain("gleich");
    expect(a1.account.id).not.toContain("example");
  });

  it("schreibt die Adresse niemals im Klartext in einen Schlüssel", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "geheim.person@example.org" });
    const { blobs } = await s.list({});
    expect(blobs.length).toBeGreaterThan(0);
    for (const b of blobs) {
      expect(b.key).not.toContain("geheim.person");
      expect(b.key).not.toContain("example.org");
    }
    /* Mit Pfeffer trägt der Schlüssel die Kennung p1: und nicht die
       nackte Prüfsumme. */
    expect(A.accountSchluessel("geheim.person@example.org")).toContain("account:p1:");
    /* Die Kennung selbst darf im Zeigerschlüssel stehen — sie ist Zufall
       und verrät niemanden. */
    expect(blobs.some((b) => b.key === `kontoId:${account.id}`)).toBe(true);
  });

  it("findet den Account über die Adresse, in jeder Schreibweise", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "Max@Example.org" });
    for (const frage of ["max@example.org", "MAX@EXAMPLE.ORG", "  Max@Example.org  "]) {
      const a = await A.accountLesenPerMail(s, frage);
      expect(a, frage).toBeTruthy();
      expect(a.id).toBe(account.id);
    }
  });

  it("findet den Account über die Kennung — über den Zeiger, nicht per Suche", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "b@example.org" });
    const a = await A.accountLesenPerId(s, account.id);
    expect(a.id).toBe(account.id);
    expect(a.emailNorm).toBe("b@example.org");
    /* Der Zeiger enthält nur den Weg, keine Kopie. */
    const zeiger = await s.get(`kontoId:${account.id}`, { type: "json" });
    expect(Object.keys(zeiger)).toEqual(["schluessel"]);
    expect(zeiger.schluessel).toBe(A.accountSchluessel("b@example.org"));
  });

  it("gibt für eine unbekannte Kennung nichts zurück", async () => {
    const s = laden();
    await A.accountAnlegen(s, { email: "c@example.org" });
    for (const id of ["a_gibtesnicht", "", null, undefined, 42, {}]) {
      expect(await A.accountLesenPerId(s, id), String(id)).toBe(null);
    }
  });

  it("gibt nichts zurück, wenn ein Zeiger auf einen fremden Account zeigt", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "d@example.org" });
    /* Ein überholter Zeiger aus einem abgebrochenen Anlageversuch. */
    await s.setJSON("kontoId:a_ueberholt", { schluessel: A.accountSchluessel("d@example.org") });
    expect(await A.accountLesenPerId(s, "a_ueberholt")).toBe(null);
    expect((await A.accountLesenPerId(s, account.id)).id).toBe(account.id);
  });
});

describe("Eine Adresse, ein Account", () => {
  it("weist dieselbe Adresse beim zweiten Mal ab", async () => {
    const s = laden();
    expect((await A.accountAnlegen(s, { email: "e@example.org" })).ok).toBe(true);
    const zweite = await A.accountAnlegen(s, { email: "e@example.org" });
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("belegt");
  });

  it("erzeugt aus anderer Schreibweise keinen zweiten Account", async () => {
    const s = laden();
    const erste = await A.accountAnlegen(s, { email: "Max.Mueller@Example.DE" });
    for (const gleich of ["max.mueller@example.de", "MAX.MUELLER@EXAMPLE.DE",
      " max.mueller@example.de "]) {
      const e = await A.accountAnlegen(s, { email: gleich });
      expect(e.ok, gleich).toBe(false);
    }
    expect((await A.accountLesenPerMail(s, "max.mueller@example.de")).id).toBe(erste.account.id);
  });

  it("behandelt eine Plus-Kennzeichnung als eigene Adresse", async () => {
    const s = laden();
    expect((await A.accountAnlegen(s, { email: "max@example.org" })).ok).toBe(true);
    /* Phase-1-Normalisierung: kein Abschneiden von +Tags, kein Entfernen
       von Punkten — beides wären fremde Anbieterregeln. */
    expect((await A.accountAnlegen(s, { email: "max+centric@example.org" })).ok).toBe(true);
    expect((await A.accountAnlegen(s, { email: "m.ax@example.org" })).ok).toBe(true);
  });

  it("lässt bei zwölf gleichzeitigen Versuchen genau einen Account entstehen", async () => {
    const s = laden();
    const ergebnisse = await Promise.all(Array.from({ length: 12 },
      () => A.accountAnlegen(s, { email: "gleichzeitig@example.org" })));
    expect(ergebnisse.filter((e) => e.ok).length).toBe(1);
    expect(ergebnisse.filter((e) => !e.ok && e.grund === "belegt").length).toBe(11);
    const { blobs } = await s.list({ prefix: "account:" });
    expect(blobs.length).toBe(1);
    const { blobs: zeiger } = await s.list({ prefix: "kontoId:" });
    expect(zeiger.length).toBe(1);
  });

  it("lässt verschiedene Adressen nebeneinander laufen", async () => {
    const s = laden();
    const ergebnisse = await Promise.all(Array.from({ length: 8 },
      (_, i) => A.accountAnlegen(s, { email: `p${i}@example.org` })));
    expect(ergebnisse.every((e) => e.ok)).toBe(true);
    expect(new Set(ergebnisse.map((e) => e.account.id)).size).toBe(8);
  });
});

describe("Der Account trägt keine betriebliche Rolle", () => {
  it("hat kein Rollenfeld — in keinem Zustand", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "f@example.org" });
    for (const feld of ["rolle", "rollen", "betrieb", "raum", "person", "bestand",
      "einheit", "mandantId"]) {
      expect(Object.prototype.hasOwnProperty.call(account, feld), feld).toBe(false);
    }
    const gelesen = await A.accountLesenPerId(s, account.id);
    expect(Object.prototype.hasOwnProperty.call(gelesen, "rolle")).toBe(false);
  });

  it("bietet keine Funktion, die aus Mitgliedschaften eine höchste Rolle rechnet", () => {
    const namen = Object.keys(A).join(" ").toLowerCase();
    for (const v of ["hoechsterolle", "globalerolle", "besterolle", "maxrolle", "rollevon"]) {
      expect(namen.includes(v), v).toBe(false);
    }
  });

  it("nimmt eine Rolle beim Anlegen nicht an", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s,
      /* @ts-expect-error absichtlich ein Feld, das es nicht gibt */
      { email: "g@example.org", rolle: "leitung" });
    expect(Object.prototype.hasOwnProperty.call(account, "rolle")).toBe(false);
  });
});

describe("Account ändern — begrenzt und ausdrücklich", () => {
  it("ändert erlaubte Felder und schreibt `aktualisiert` mit", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "h@example.org" });
    await new Promise((r) => setTimeout(r, 5));
    const e = await A.accountAendern(s, account.id, { status: "aktiv" });
    expect(e.ok).toBe(true);
    expect(e.account.status).toBe("aktiv");
    expect(e.account.aktualisiert >= account.aktualisiert).toBe(true);
    expect((await A.accountLesenPerId(s, account.id)).status).toBe("aktiv");
  });

  it("überschreibt die Kennung nicht", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "i@example.org" });
    const e = await A.accountAendern(s, account.id, { id: "a_fremd" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("feld:id");
    expect((await A.accountLesenPerId(s, account.id)).id).toBe(account.id);
  });

  it("überschreibt `erstellt` nicht", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "j@example.org" });
    const e = await A.accountAendern(s, account.id, { erstellt: "2000-01-01T00:00:00.000Z" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("feld:erstellt");
    expect((await A.accountLesenPerId(s, account.id)).erstellt).toBe(account.erstellt);
  });

  it("ändert die Adresse nicht beiläufig — das ist ein eigener Vorgang", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "k@example.org" });
    for (const feld of ["email", "emailNorm"]) {
      const e = await A.accountAendern(s, account.id, { [feld]: "fremd@example.org" });
      expect(e.ok, feld).toBe(false);
      expect(e.grund).toBe(`feld:${feld}`);
    }
    expect((await A.accountLesenPerMail(s, "k@example.org")).id).toBe(account.id);
    expect(await A.accountLesenPerMail(s, "fremd@example.org")).toBe(null);
  });

  it("weist unbekannte Felder und unmögliche Werte ab", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "l@example.org" });
    expect((await A.accountAendern(s, account.id, { irgendwas: 1 })).grund).toBe("feld:irgendwas");
    expect((await A.accountAendern(s, account.id, { status: "wasauchimmer" })).grund).toBe("status");
    expect((await A.accountAendern(s, account.id, { epoche: 0 })).grund).toBe("epoche");
    expect((await A.accountAendern(s, account.id, { passwort: "klartext" })).grund)
      .toBe("passwortform");
    expect((await A.accountAendern(s, account.id, { tokenNr: { unbekannt: 1 } })).grund)
      .toBe("tokenNr:unbekannt");
    expect((await A.accountAendern(s, "a_gibtesnicht", { status: "aktiv" })).grund)
      .toBe("unbekannt");
  });

  it("setzt ein Passwort, erhöht die Epoche und aktiviert den Zugang", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "m@example.org" });
    expect(account.epoche).toBe(1);
    const e = await A.passwortSetzen(s, account.id, PW);
    expect(e.ok).toBe(true);
    expect(e.account.passwort).toBe(PW);
    expect(e.account.epoche).toBe(2);
    expect(e.account.status).toBe("aktiv");
    expect(e.account.passwortGeaendert).toBeTruthy();
  });

  it("bestätigt die Adresse genau einmal", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "n@example.org" });
    const erste = await A.emailBestaetigen(s, account.id);
    expect(erste.account.emailVerifiziertAm).toBeTruthy();
    const zweite = await A.emailBestaetigen(s, account.id);
    expect(zweite.account.emailVerifiziertAm).toBe(erste.account.emailVerifiziertAm);
  });

  it("zählt Token-Laufnummern je Zweck getrennt", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "o@example.org" });
    const a = await A.tokenNrErhoehen(s, account.id, "einladung");
    const b = await A.tokenNrErhoehen(s, account.id, "einladung");
    const c = await A.tokenNrErhoehen(s, account.id, "zuruecksetzen");
    expect([a.nr, b.nr, c.nr]).toEqual([1, 2, 1]);
    const stand = await A.accountLesenPerId(s, account.id);
    expect(stand.tokenNr).toEqual({ einladung: 2, verifizierung: 0, zuruecksetzen: 1 });
    expect((await A.tokenNrErhoehen(s, account.id, "unsinn")).grund).toBe("zweck");
  });

  it("sperrt, erhöht die Epoche und vermerkt die Anmeldung", async () => {
    const s = laden();
    const { account } = await A.accountAnlegen(s, { email: "q@example.org" });
    expect((await A.epocheErhoehen(s, account.id)).account.epoche).toBe(2);
    expect((await A.anmeldungVermerken(s, account.id)).account.letzteAnmeldung).toBeTruthy();
    expect((await A.accountSperren(s, account.id)).account.status).toBe("gesperrt");
  });
});

/* ==========================================================================
   MITGLIEDSCHAFT
   ========================================================================== */

/** Ein Account, auf den sich Mitgliedschaften beziehen können. */
async function mitAccount(s, email = "chef@example.org") {
  const e = await A.accountAnlegen(s, { email });
  return e.account;
}

describe("Mitgliedschaft anlegen", () => {
  it("legt sie mit allen vereinbarten Feldern an", async () => {
    const s = laden(); const a = await mitAccount(s);
    const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-alpha-abc",
      betrieb: 0, mandantId: "m4711", person: "p17", rolle: "leitung", einheit: "e1" });
    expect(e.ok).toBe(true);
    expect(Object.keys(e.mitgliedschaft).sort()).toEqual([
      "accountId", "aktiviertAm", "betrieb", "eingeladenAm", "eingeladenVon",
      "einheit", "entzogenAm", "mandantId", "person", "raum", "rolle", "status",
    ]);
    expect(e.mitgliedschaft.status).toBe("eingeladen");
    expect(e.mitgliedschaft.aktiviertAm).toBe(null);
    expect(e.mitgliedschaft.entzogenAm).toBe(null);
  });

  it("speichert Betriebsindex und Mandantenkennung beide", async () => {
    const s = laden(); const a = await mitAccount(s);
    const { mitgliedschaft } = await A.mitgliedschaftAnlegen(s, { accountId: a.id,
      raum: "t-beta-abc", betrieb: 2, mandantId: "m0815", rolle: "planer" });
    expect(mitgliedschaft.betrieb).toBe(2);
    expect(mitgliedschaft.mandantId).toBe("m0815");
  });

  it("weist einen unbekannten Account ab", async () => {
    const s = laden();
    const e = await A.mitgliedschaftAnlegen(s, { accountId: "a_gibtesnicht",
      raum: "t-gamma-abc", mandantId: "m1", rolle: "leitung" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("unbekannterAccount");
  });

  it("weist Demoräume ab", async () => {
    const s = laden(); const a = await mitAccount(s);
    for (const raum of ["demo-schau", "demo-etwas", "DEMO-Schau"]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum,
        mandantId: "m1", rolle: "leitung" });
      expect(e.ok, raum).toBe(false);
      expect(e.grund).toBe("demoraum");
    }
    expect(A.raumErlaubt("demo-schau")).toBe(false);
    expect(A.raumErlaubt("t-echter-betrieb")).toBe(true);
  });

  it("weist unbrauchbare Raumnamen ab", async () => {
    const s = laden(); const a = await mitAccount(s);
    for (const raum of ["", "ab", undefined, null, "mit leerzeichen", "../fremd", 42]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum,
        mandantId: "m1", rolle: "leitung" });
      expect(e.ok, String(raum)).toBe(false);
      expect(e.grund).toBe("raum");
    }
  });

  it("weist eine zweite Mitgliedschaft im selben Raum ab", async () => {
    const s = laden(); const a = await mitAccount(s);
    const erste = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-delta-abc",
      mandantId: "m1", rolle: "leitung" });
    expect(erste.ok).toBe(true);
    const zweite = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-delta-abc",
      mandantId: "m1", rolle: "mitarbeiter" });
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("vorhanden");
    /* Die erste ist unverändert. */
    expect((await A.mitgliedschaftLesen(s, a.id, "t-delta-abc")).rolle).toBe("leitung");
  });

  it("lässt bei zehn gleichzeitigen Versuchen genau eine entstehen", async () => {
    const s = laden(); const a = await mitAccount(s);
    const ergebnisse = await Promise.all(Array.from({ length: 10 },
      (_, i) => A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-race-abc",
        mandantId: "m1", rolle: i % 2 ? "planer" : "leitung" })));
    expect(ergebnisse.filter((e) => e.ok).length).toBe(1);
    const { blobs } = await s.list({ prefix: `mitglied:${a.id}:` });
    expect(blobs.length).toBe(1);
  });

  it("verlangt einen Betriebsindex als nichtnegative ganze Zahl", async () => {
    const s = laden(); const a = await mitAccount(s);
    for (const betrieb of [-1, 1.5, "0", null, NaN, Infinity]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id,
        raum: `t-b-${String(betrieb).replace(/[^a-z0-9]/gi, "x")}`,
        betrieb, mandantId: "m1", rolle: "leitung" });
      expect(e.ok, String(betrieb)).toBe(false);
      expect(e.grund).toBe("betrieb");
    }
    expect((await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-b-null",
      betrieb: 0, mandantId: "m1", rolle: "leitung" })).ok).toBe(true);
  });

  it("verlangt eine brauchbare Mandantenkennung", async () => {
    const s = laden(); const a = await mitAccount(s);
    for (const mandantId of ["", "   ", null, undefined, 42, {}, "x".repeat(81)]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-m-abc",
        mandantId, rolle: "leitung" });
      expect(e.ok, String(mandantId)).toBe(false);
      expect(e.grund).toBe("mandantId");
    }
  });

  it("nimmt nur Rollen an, die es im Betrieb gibt — und nie den Betreiber", async () => {
    const s = laden(); const a = await mitAccount(s);
    expect(A.MITGLIED_ROLLEN).toEqual(["leitung", "planer", "subplaner",
      "mitarbeiter", "betriebsrat"]);
    for (const rolle of A.MITGLIED_ROLLEN) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: `t-r-${rolle}`,
        mandantId: "m1", rolle });
      expect(e.ok, rolle).toBe(true);
    }
    for (const rolle of ["betreiber", "kunde", "admin", "", null, undefined, "LEITUNG"]) {
      const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-r-fremd",
        mandantId: "m1", rolle });
      expect(e.ok, String(rolle)).toBe(false);
      expect(e.grund).toBe("rolle");
    }
  });

  it("nimmt 'entzogen' nicht als Anfangszustand", async () => {
    const s = laden(); const a = await mitAccount(s);
    const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-st-abc",
      mandantId: "m1", rolle: "leitung", status: "entzogen" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("status");
  });
});

describe("Ein Account, mehrere Betriebe", () => {
  it("trägt in zwei Räumen zwei Rollen und zwei Personen", async () => {
    const s = laden(); const a = await mitAccount(s, "max@example.org");
    const A1 = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-raum-a",
      betrieb: 0, mandantId: "mA", person: "p17", rolle: "leitung", status: "aktiv" });
    const B1 = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-raum-b",
      betrieb: 0, mandantId: "mB", person: "p83", rolle: "mitarbeiter", status: "aktiv" });
    expect(A1.ok && B1.ok).toBe(true);

    const inA = await A.mitgliedschaftLesen(s, a.id, "t-raum-a");
    const inB = await A.mitgliedschaftLesen(s, a.id, "t-raum-b");
    expect([inA.rolle, inA.person]).toEqual(["leitung", "p17"]);
    expect([inB.rolle, inB.person]).toEqual(["mitarbeiter", "p83"]);
    /* Und der Account selbst weiß von keiner Rolle. */
    const konto = await A.accountLesenPerId(s, a.id);
    expect(Object.prototype.hasOwnProperty.call(konto, "rolle")).toBe(false);
  });

  it("listet die Mitgliedschaften eines Accounts", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-l-eins",
      mandantId: "m1", rolle: "leitung", status: "aktiv" });
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-l-zwei",
      mandantId: "m2", rolle: "planer" });
    const alle = await A.mitgliedschaftenDesAccounts(s, a.id);
    expect(alle.map((m) => m.raum)).toEqual(["t-l-eins", "t-l-zwei"]);
    const aktive = await A.mitgliedschaftenDesAccounts(s, a.id, { nurAktive: true });
    expect(aktive.map((m) => m.raum)).toEqual(["t-l-eins"]);
    expect(await A.mitgliedschaftenDesAccounts(s, "a_gibtesnicht")).toEqual([]);
  });

  it("listet die Mitgliedschaften eines Raums über den Raumzeiger", async () => {
    const s = laden();
    const chef = await mitAccount(s, "chef2@example.org");
    const kraft = await mitAccount(s, "kraft@example.org");
    await A.mitgliedschaftAnlegen(s, { accountId: chef.id, raum: "t-team-abc",
      mandantId: "m1", rolle: "leitung", status: "aktiv" });
    await A.mitgliedschaftAnlegen(s, { accountId: kraft.id, raum: "t-team-abc",
      mandantId: "m1", rolle: "mitarbeiter" });
    /* Und eine Mitgliedschaft in einem anderen Raum, die nicht auftauchen darf. */
    await A.mitgliedschaftAnlegen(s, { accountId: chef.id, raum: "t-anderer-abc",
      mandantId: "m2", rolle: "leitung" });

    const imTeam = await A.mitgliedschaftenDesRaums(s, "t-team-abc");
    expect(imTeam.length).toBe(2);
    expect(imTeam.every((m) => m.raum === "t-team-abc")).toBe(true);
    expect(new Set(imTeam.map((m) => m.accountId))).toEqual(new Set([chef.id, kraft.id]));
    expect((await A.mitgliedschaftenDesRaums(s, "t-team-abc", { nurAktive: true })).length).toBe(1);
  });

  it("überspringt einen Raumzeiger, dem keine Mitgliedschaft entspricht", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-idx-abc",
      mandantId: "m1", rolle: "leitung" });
    /* Ein Zeiger ohne Datensatz — der Index erzählt keine zweite Wahrheit. */
    await s.setJSON("raummitglied:t-idx-abc:a_verwaist", { accountId: "a_verwaist",
      raum: "t-idx-abc" });
    const liste = await A.mitgliedschaftenDesRaums(s, "t-idx-abc");
    expect(liste.length).toBe(1);
    expect(liste[0].accountId).toBe(a.id);
  });

  it("legt den Raumzeiger als reinen Wegweiser ab, ohne Accountdaten", async () => {
    const s = laden(); const a = await mitAccount(s, "zeiger@example.org");
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-z-abc",
      mandantId: "m1", person: "p9", rolle: "planer" });
    const z = await s.get(A.raummitgliedSchluessel("t-z-abc", a.id), { type: "json" });
    expect(Object.keys(z).sort()).toEqual(["accountId", "raum"]);
    expect(JSON.stringify(z)).not.toContain("zeiger@");
    expect(JSON.stringify(z)).not.toContain("planer");
  });
});

describe("Kein Rückfall zwischen Betrieben", () => {
  it("gibt für einen fremden Raum nichts zurück — auch wenn es nur einen gibt", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-nur-einer",
      mandantId: "m1", rolle: "leitung", status: "aktiv" });
    expect(await A.mitgliedschaftLesen(s, a.id, "t-fremder-raum")).toBe(null);
    expect(await A.mitgliedschaftLesen(s, a.id, "t-nur-eine")).toBe(null);   // fast gleich
    expect((await A.mitgliedschaftLesen(s, a.id, "t-nur-einer")).rolle).toBe("leitung");
  });

  it("gibt für einen fremden Account nichts zurück", async () => {
    const s = laden();
    const eigen = await mitAccount(s, "eigen@example.org");
    const fremd = await mitAccount(s, "fremd@example.org");
    await A.mitgliedschaftAnlegen(s, { accountId: eigen.id, raum: "t-iso-abc",
      mandantId: "m1", rolle: "leitung", status: "aktiv" });
    expect(await A.mitgliedschaftLesen(s, fremd.id, "t-iso-abc")).toBe(null);
    expect(await A.mitgliedschaftenDesAccounts(s, fremd.id)).toEqual([]);
  });

  it("gibt bei leeren oder unsinnigen Fragen nichts zurück, statt zu werfen", async () => {
    const s = laden(); const a = await mitAccount(s);
    for (const [id, raum] of [[null, "t-a"], [a.id, null], ["", ""], [42, 42], [{}, []]]) {
      expect(await A.mitgliedschaftLesen(s, id, raum)).toBe(null);
    }
    expect(await A.mitgliedschaftenDesRaums(s, "")).toEqual([]);
  });
});

describe("Zustände einer Mitgliedschaft", () => {
  it("geht von eingeladen nach aktiv und vermerkt den Zeitpunkt", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-akt-abc",
      mandantId: "m1", rolle: "planer" });
    const e = await A.mitgliedschaftAktivieren(s, a.id, "t-akt-abc");
    expect(e.ok).toBe(true);
    expect(e.mitgliedschaft.status).toBe("aktiv");
    expect(e.mitgliedschaft.aktiviertAm).toBeTruthy();
  });

  it("geht von aktiv nach entzogen und lässt den Datensatz stehen", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-ent-abc",
      mandantId: "m1", rolle: "planer", status: "aktiv" });
    const e = await A.mitgliedschaftEntziehen(s, a.id, "t-ent-abc");
    expect(e.mitgliedschaft.status).toBe("entzogen");
    expect(e.mitgliedschaft.entzogenAm).toBeTruthy();
    /* Grabstein: lesbar, aber nicht aktiv. */
    const nach = await A.mitgliedschaftLesen(s, a.id, "t-ent-abc");
    expect(nach.status).toBe("entzogen");
    expect(nach.rolle).toBe("planer");
    expect((await A.mitgliedschaftenDesAccounts(s, a.id, { nurAktive: true })).length).toBe(0);
  });

  it("geht auch von eingeladen direkt nach entzogen", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-ee-abc",
      mandantId: "m1", rolle: "mitarbeiter" });
    expect((await A.mitgliedschaftEntziehen(s, a.id, "t-ee-abc")).mitgliedschaft.status)
      .toBe("entzogen");
  });

  it("lässt aus 'entzogen' keinen Weg zurück", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-zu-abc",
      mandantId: "m1", rolle: "planer", status: "aktiv" });
    await A.mitgliedschaftEntziehen(s, a.id, "t-zu-abc");
    const e = await A.mitgliedschaftAktivieren(s, a.id, "t-zu-abc");
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("uebergang:entzogen->aktiv");
    expect((await A.mitgliedschaftLesen(s, a.id, "t-zu-abc")).status).toBe("entzogen");
  });

  it("verhindert, dass eine entzogene Mitgliedschaft neu angelegt wird", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-neu-abc",
      mandantId: "m1", rolle: "planer", status: "aktiv" });
    await A.mitgliedschaftEntziehen(s, a.id, "t-neu-abc");
    const e = await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-neu-abc",
      mandantId: "m1", rolle: "leitung" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("vorhanden");
    /* Der Grabstein bleibt unberührt — eine Wiederaufnahme ist ein
       eigener Vorgang und überschreibt ihn nicht stillschweigend. */
    expect((await A.mitgliedschaftLesen(s, a.id, "t-neu-abc")).rolle).toBe("planer");
  });

  it("meldet einen unveränderten Zustand als solchen", async () => {
    const s = laden(); const a = await mitAccount(s);
    await A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-un-abc",
      mandantId: "m1", rolle: "planer", status: "aktiv" });
    const e = await A.mitgliedschaftAktivieren(s, a.id, "t-un-abc");
    expect(e.ok).toBe(true);
    expect(e.unveraendert).toBe(true);
  });

  it("weist einen Zustandswechsel für eine unbekannte Mitgliedschaft ab", async () => {
    const s = laden(); const a = await mitAccount(s);
    expect((await A.mitgliedschaftAktivieren(s, a.id, "t-gibtesnicht")).grund).toBe("unbekannt");
    expect((await A.mitgliedschaftEntziehen(s, a.id, "t-gibtesnicht")).grund).toBe("unbekannt");
  });
});

/* ==========================================================================
   WENN DIE PLATTE NICHT MITSPIELT

   Zwei Schreibvorgänge ohne Transaktion: Was dabei schiefgeht, muss
   sichtbar bleiben. Ein stilles `.catch(() => {})` wäre hier das
   Schlimmste — es meldete Erfolg und hinterließe die Hälfte.
   ========================================================================== */

describe("Fehler beim Schreiben", () => {
  it("meldet einen Fehler am Account und legt nichts an", async () => {
    const echt = laden();
    const s = mitFehler(echt, (k) => k.startsWith("account:"));
    await expect(A.accountAnlegen(s, { email: "r@example.org" })).rejects.toThrow(/Account/);
    const { blobs } = await echt.list({});
    expect(blobs.length).toBe(0);
  });

  it("nimmt den Account zurück, wenn der Kennungszeiger scheitert", async () => {
    const echt = laden();
    const s = mitFehler(echt, (k) => k.startsWith("kontoId:"));
    await expect(A.accountAnlegen(s, { email: "s@example.org" }))
      .rejects.toThrow(/Kennungszeiger.*zurückgenommen/s);
    /* Nichts Halbes: Die Adresse ist wieder frei, und über den echten
       Speicher lässt sie sich anschließend anlegen. */
    expect(await A.accountLesenPerMail(echt, "s@example.org")).toBe(null);
    const { blobs } = await echt.list({});
    expect(blobs.length).toBe(0);
    expect((await A.accountAnlegen(echt, { email: "s@example.org" })).ok).toBe(true);
  });

  it("sagt es, wenn auch die Rücknahme scheitert", async () => {
    const echt = laden();
    const s = {
      ...mitFehler(echt, (k) => k.startsWith("kontoId:")),
      delete: async () => { throw new Error("auch das Löschen scheitert"); },
    };
    await expect(A.accountAnlegen(s, { email: "t@example.org" }))
      .rejects.toThrow(/NICHT zurückgenommen/);
    /* Der Datensatz steht — und die Meldung hat genau das gesagt. */
    expect(await A.accountLesenPerMail(echt, "t@example.org")).toBeTruthy();
  });

  it("meldet einen Fehler an der Mitgliedschaft und legt nichts an", async () => {
    const echt = laden(); const a = await mitAccount(echt);
    const s = mitFehler(echt, (k) => k.startsWith("mitglied:"));
    await expect(A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-f1-abc",
      mandantId: "m1", rolle: "leitung" })).rejects.toThrow(/Mitgliedschaft/);
    expect(await A.mitgliedschaftLesen(echt, a.id, "t-f1-abc")).toBe(null);
    expect((await echt.list({ prefix: "raummitglied:" })).blobs.length).toBe(0);
  });

  it("nimmt die Mitgliedschaft zurück, wenn der Raumzeiger scheitert", async () => {
    const echt = laden(); const a = await mitAccount(echt);
    const s = mitFehler(echt, (k) => k.startsWith("raummitglied:"));
    await expect(A.mitgliedschaftAnlegen(s, { accountId: a.id, raum: "t-f2-abc",
      mandantId: "m1", rolle: "leitung" })).rejects.toThrow(/Raumzeiger.*zurückgenommen/s);
    expect(await A.mitgliedschaftLesen(echt, a.id, "t-f2-abc")).toBe(null);
    expect((await A.mitgliedschaftenDesRaums(echt, "t-f2-abc")).length).toBe(0);
    /* Danach geht es über den echten Speicher. */
    expect((await A.mitgliedschaftAnlegen(echt, { accountId: a.id, raum: "t-f2-abc",
      mandantId: "m1", rolle: "leitung" })).ok).toBe(true);
  });

  it("meldet einen Fehler beim Zustandswechsel, statt Erfolg vorzugeben", async () => {
    const echt = laden(); const a = await mitAccount(echt);
    await A.mitgliedschaftAnlegen(echt, { accountId: a.id, raum: "t-f3-abc",
      mandantId: "m1", rolle: "planer" });
    const s = mitFehler(echt, (k) => k.startsWith("mitglied:"));
    await expect(A.mitgliedschaftAktivieren(s, a.id, "t-f3-abc"))
      .rejects.toThrow(/Zustand/);
    expect((await A.mitgliedschaftLesen(echt, a.id, "t-f3-abc")).status).toBe("eingeladen");
  });

  it("meldet einen Fehler beim Ändern eines Accounts", async () => {
    const echt = laden(); const a = await mitAccount(echt, "u@example.org");
    const s = mitFehler(echt, (k) => k.startsWith("account:"));
    await expect(A.accountAendern(s, a.id, { status: "aktiv" }))
      .rejects.toThrow(/geändert werden/);
    expect((await A.accountLesenPerId(echt, a.id)).status).toBe("eingeladen");
  });
});
