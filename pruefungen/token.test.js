/* ==========================================================================
   TOKEN — ein Recht, genau einmal, mit Frist

   Geprüft wird gegen die echte Dateiablage, nicht gegen eine Nachbildung:
   Die Einmaligkeit hängt daran, dass ein Löschvorgang wirklich löscht, und
   das ist eine Eigenschaft der Ablage, nicht des Moduls.

   Die Zeit kommt aus einer Funktion, die die Prüfung stellt. So lässt sich
   ein Ablauf von sieben Tagen in einer Millisekunde prüfen, ohne zu warten
   und ohne die Systemuhr anzufassen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, T;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-token-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  T = await import("../server/lib/token.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

let zaehler = 0;
const laden = () => getStore({ name: `token${++zaehler}`, consistency: "strong" });

/* Eine Uhr, die die Prüfung stellt. */
const uhr = (start = Date.UTC(2026, 8, 24, 12, 0, 0)) => {
  let t = start;
  return { jetzt: () => t, vor: (ms) => { t += ms; }, stand: () => t };
};
const MINUTE = 60 * 1000, STUNDE = 60 * MINUTE, TAG = 24 * STUNDE;

describe("Ausstellen und einlösen", () => {
  it("löst ein Token genau einmal ein", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: 1, inhalt: { raum: "t-alpha" }, jetzt: u.jetzt });

    const erste = await T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt });
    expect(erste.eintrag).toBeTruthy();
    expect(erste.eintrag.raum).toBe("t-alpha");
    expect(erste.grund).toBe(null);

    const zweite = await T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt });
    expect(zweite.eintrag).toBe(null);
    expect(zweite.grund).toBe("unbekannt");
  });

  it("legt nur die Prüfsumme ab, nie das Token", async () => {
    const s = laden(), u = uhr();
    const { token, schluessel } = await T.tokenAusstellen(s,
      { zweck: "verifizierung", nr: 1, jetzt: u.jetzt });
    const { blobs } = await s.list({ prefix: "token:" });
    expect(blobs.length).toBe(1);
    expect(blobs[0].key).toBe(schluessel);
    expect(blobs[0].key).not.toContain(token);
    const roh = await s.get(blobs[0].key, { type: "text" });
    expect(roh).not.toContain(token);
  });

  it("weist einen fremden Zweck ab — und verbraucht das Token dabei", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: 1, jetzt: u.jetzt });
    const falsch = await T.tokenEinloesen(s, token,
      { zweck: "zuruecksetzen", jetzt: u.jetzt });
    expect(falsch.eintrag).toBe(null);
    expect(falsch.grund).toBe("zweck");
    /* Verbraucht: Auch mit dem richtigen Zweck ist jetzt nichts mehr da. */
    const danach = await T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt });
    expect(danach.eintrag).toBe(null);
  });

  it("weist Unsinn ab, statt zu werfen", async () => {
    const s = laden(), u = uhr();
    for (const x of [undefined, null, "", "kurz", 12345, {}, []]) {
      const r = await T.tokenEinloesen(s, x, { zweck: "einladung", jetzt: u.jetzt });
      expect(r.eintrag).toBe(null);
    }
  });

  it("kennt nur die drei Zwecke", async () => {
    const s = laden();
    await expect(T.tokenAusstellen(s, { zweck: "irgendwas", nr: 1 })).rejects.toThrow();
    expect(T.ZWECKE).toEqual(["einladung", "verifizierung", "zuruecksetzen"]);
  });
});

describe("Fristen — serverseitig, nicht vom Aufrufer", () => {
  it("hält die vereinbarten Fristen je Zweck", () => {
    expect(T.FRISTEN.einladung).toBe(7 * 24 * 60);
    expect(T.FRISTEN.verifizierung).toBe(24 * 60);
    expect(T.FRISTEN.zuruecksetzen).toBe(30);
  });

  it("setzt die Frist aus dem Zweck, nicht aus einer Angabe von außen", async () => {
    const s = laden(), u = uhr();
    /* Ein Aufrufer, der eine Frist mitschickt, wird ignoriert. */
    const { bis } = await T.tokenAusstellen(s,
      { zweck: "zuruecksetzen", nr: 1, minuten: 99999, jetzt: u.jetzt });
    expect(bis).toBe(u.stand() + 30 * MINUTE);
  });

  it("weist ein abgelaufenes Einladungstoken nach sieben Tagen ab", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: 1, jetzt: u.jetzt });
    u.vor(7 * TAG - MINUTE);
    const knapp = await T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt });
    expect(knapp.eintrag).toBeTruthy();

    const s2 = laden(), u2 = uhr();
    const zweites = await T.tokenAusstellen(s2,
      { zweck: "einladung", nr: 1, jetzt: u2.jetzt });
    u2.vor(7 * TAG + MINUTE);
    const drueber = await T.tokenEinloesen(s2, zweites.token,
      { zweck: "einladung", jetzt: u2.jetzt });
    expect(drueber.eintrag).toBe(null);
    expect(drueber.grund).toBe("abgelaufen");
  });

  it("lässt ein Rücksetztoken nach 30 Minuten verfallen", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "zuruecksetzen", nr: 1, jetzt: u.jetzt });
    u.vor(31 * MINUTE);
    const r = await T.tokenEinloesen(s, token, { zweck: "zuruecksetzen", jetzt: u.jetzt });
    expect(r.grund).toBe("abgelaufen");
  });

  it("lässt ein Verifizierungstoken nach 24 Stunden verfallen", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "verifizierung", nr: 1, jetzt: u.jetzt });
    u.vor(23 * STUNDE);
    expect((await T.tokenEinloesen(s, token,
      { zweck: "verifizierung", jetzt: u.jetzt })).eintrag).toBeTruthy();

    const s2 = laden(), u2 = uhr();
    const zweites = await T.tokenAusstellen(s2,
      { zweck: "verifizierung", nr: 1, jetzt: u2.jetzt });
    u2.vor(25 * STUNDE);
    expect((await T.tokenEinloesen(s2, zweites.token,
      { zweck: "verifizierung", jetzt: u2.jetzt })).grund).toBe("abgelaufen");
  });

  it("räumt abgelaufene Vorgänge weg", async () => {
    const s = laden(), u = uhr();
    await T.tokenAusstellen(s, { zweck: "zuruecksetzen", nr: 1, jetzt: u.jetzt });
    await T.tokenAusstellen(s, { zweck: "einladung", nr: 1, jetzt: u.jetzt });
    u.vor(2 * STUNDE);
    const weg = await T.tokenAufraeumen(s, { jetzt: u.jetzt });
    expect(weg).toBe(1);                       // nur das Rücksetztoken
    const { blobs } = await s.list({ prefix: "token:" });
    expect(blobs.length).toBe(1);
  });
});

describe("Laufnummern — je Zweck getrennt", () => {
  it("zählt je Zweck einzeln hoch", () => {
    let n = {};
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    ({ nummern: n } = T.naechsteLaufnummer(n, "zuruecksetzen"));
    expect(T.laufnummer(n, "einladung")).toBe(2);
    expect(T.laufnummer(n, "zuruecksetzen")).toBe(1);
    expect(T.laufnummer(n, "verifizierung")).toBe(0);
  });

  it("verändert das übergebene Objekt nicht", () => {
    const alt = { einladung: 3 };
    const { nummern } = T.naechsteLaufnummer(alt, "einladung");
    expect(alt.einladung).toBe(3);
    expect(nummern.einladung).toBe(4);
  });

  it("entwertet einen älteren Einladungstoken, wenn neu eingeladen wird", async () => {
    const s = laden(), u = uhr();
    let n = {};
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    const alt = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: T.laufnummer(n, "einladung"), jetzt: u.jetzt });

    /* Erneut einladen: die Laufnummer steigt. */
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    const neu = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: T.laufnummer(n, "einladung"), jetzt: u.jetzt });

    const alterVersuch = await T.tokenEinloesen(s, alt.token,
      { zweck: "einladung", nummern: n, jetzt: u.jetzt });
    expect(alterVersuch.eintrag).toBe(null);
    expect(alterVersuch.grund).toBe("entwertet");

    const neuerVersuch = await T.tokenEinloesen(s, neu.token,
      { zweck: "einladung", nummern: n, jetzt: u.jetzt });
    expect(neuerVersuch.eintrag).toBeTruthy();
  });

  it("entwertet mit einer neuen Einladung KEINEN laufenden Rücksetzvorgang", async () => {
    const s = laden(), u = uhr();
    let n = {};
    ({ nummern: n } = T.naechsteLaufnummer(n, "zuruecksetzen"));
    const reset = await T.tokenAusstellen(s,
      { zweck: "zuruecksetzen", nr: T.laufnummer(n, "zuruecksetzen"), jetzt: u.jetzt });

    /* Zwei neue Einladungen dazwischen — sie zählen ihren eigenen Zähler. */
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    ({ nummern: n } = T.naechsteLaufnummer(n, "einladung"));
    await T.tokenAusstellen(s,
      { zweck: "einladung", nr: T.laufnummer(n, "einladung"), jetzt: u.jetzt });

    const r = await T.tokenEinloesen(s, reset.token,
      { zweck: "zuruecksetzen", nummern: n, jetzt: u.jetzt });
    expect(r.eintrag).toBeTruthy();
    expect(r.grund).toBe(null);
  });
});

describe("Parallele Einlösung", () => {
  it("lässt bei acht gleichzeitigen Versuchen genau einen gewinnen", async () => {
    const s = laden(), u = uhr();
    const { token } = await T.tokenAusstellen(s,
      { zweck: "einladung", nr: 1, jetzt: u.jetzt });
    const ergebnisse = await Promise.all(Array.from({ length: 8 },
      () => T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt })));
    const gewonnen = ergebnisse.filter((r) => r.eintrag).length;
    expect(gewonnen).toBe(1);
  });

  it("lässt auch bei acht gleichzeitigen Codeversuchen genau einen gewinnen", async () => {
    const s = laden(), u = uhr();
    const mail = "gleichzeitig@example.org";
    const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: mail, jetzt: u.jetzt });
    const ergebnisse = await Promise.all(Array.from({ length: 8 },
      () => T.codeEinloesen(s, mail, code, { zweck: "einladung", jetzt: u.jetzt })));
    expect(ergebnisse.filter((r) => r.eintrag).length).toBe(1);
  });

  it("lässt Link und Code nicht beide gewinnen, wenn sie gleichzeitig kommen", async () => {
    /* Der eigentliche Fall: zwei verschiedene Wege in denselben Vorgang.
       Liefen sie in getrennten Reihen, käme eine Einladung zweimal an. */
    for (let runde = 0; runde < 5; runde++) {
      const s = laden(), u = uhr();
      const mail = `beide${runde}@example.org`;
      const { token, code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
        mitCode: true, email: mail, jetzt: u.jetzt });
      const [ueberLink, ueberCode] = await Promise.all([
        T.tokenEinloesen(s, token, { zweck: "einladung", jetzt: u.jetzt }),
        T.codeEinloesen(s, mail, code, { zweck: "einladung", jetzt: u.jetzt }),
      ]);
      const gewonnen = [ueberLink, ueberCode].filter((r) => r.eintrag).length;
      expect(gewonnen, `Runde ${runde}`).toBe(1);
    }
  });
});

describe("Der Aktivierungscode", () => {
  const MAIL = "Max.Mueller@Example.ORG";

  it("hat die Form XXXX-XXXX-XXXX aus verwechslungsarmen Zeichen", async () => {
    const s = laden(), u = uhr();
    for (let i = 0; i < 25; i++) {
      const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
        mitCode: true, email: `a${i}@example.org`, jetzt: u.jetzt });
      expect(code).toMatch(T.CODE_FORM);
      expect(code).toHaveLength(14);
      /* Keine verwechselbaren Zeichen. */
      expect(code).not.toMatch(/[01ILZSB2 58O]/);
    }
  });

  it("funktioniert mit richtiger Adresse und richtigem Code", async () => {
    const s = laden(), u = uhr();
    const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      inhalt: { raum: "t-beta" }, mitCode: true, email: MAIL, jetzt: u.jetzt });
    const r = await T.codeEinloesen(s, MAIL, code, { zweck: "einladung", jetzt: u.jetzt });
    expect(r.eintrag).toBeTruthy();
    expect(r.eintrag.raum).toBe("t-beta");
  });

  it("nimmt den Code unabhängig von Schreibweise und Trennstrichen an", async () => {
    const s = laden(), u = uhr();
    const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: MAIL, jetzt: u.jetzt });
    const anders = code.toLowerCase().replace(/-/g, " ");
    const r = await T.codeEinloesen(s, "  max.mueller@example.org ", anders,
      { zweck: "einladung", jetzt: u.jetzt });
    expect(r.eintrag).toBeTruthy();
  });

  it("funktioniert nicht mit einer anderen Adresse", async () => {
    const s = laden(), u = uhr();
    const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: MAIL, jetzt: u.jetzt });
    const r = await T.codeEinloesen(s, "andere@example.org", code,
      { zweck: "einladung", jetzt: u.jetzt });
    expect(r.eintrag).toBe(null);
    /* Und der richtige Weg bleibt danach offen — ein Fehlversuch mit
       fremder Adresse verbraucht nichts. */
    const richtig = await T.codeEinloesen(s, MAIL, code,
      { zweck: "einladung", jetzt: u.jetzt });
    expect(richtig.eintrag).toBeTruthy();
  });

  it("funktioniert nicht mit einem falschen Code", async () => {
    const s = laden(), u = uhr();
    await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: MAIL, jetzt: u.jetzt });
    for (const falsch of ["AAAA-AAAA-AAAA", "", null, "zu-kurz", "AAAABBBBCCCC"]) {
      const r = await T.codeEinloesen(s, MAIL, falsch,
        { zweck: "einladung", jetzt: u.jetzt });
      expect(r.eintrag, String(falsch)).toBe(null);
    }
  });

  it("legt den Code nicht im Klartext ab", async () => {
    const s = laden(), u = uhr();
    const { code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: MAIL, jetzt: u.jetzt });
    for (const praefix of ["token:", "tokencode:"]) {
      const { blobs } = await s.list({ prefix: praefix });
      for (const b of blobs) {
        expect(b.key).not.toContain(code);
        expect(await s.get(b.key, { type: "text" })).not.toContain(code);
      }
    }
    /* Auch die Adresse steht nirgends im Klartext im Schlüssel. */
    const { blobs } = await s.list({ prefix: "tokencode:" });
    expect(blobs[0].key.toLowerCase()).not.toContain("max.mueller");
  });

  it("verlangt für einen Code eine Adresse", async () => {
    const s = laden();
    await expect(T.tokenAusstellen(s,
      { zweck: "einladung", nr: 1, mitCode: true })).rejects.toThrow();
  });

  it("Link und Code gehören zur gleichen Einladung: der Link entwertet den Code", async () => {
    const s = laden(), u = uhr();
    const { token, code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      inhalt: { raum: "t-gamma" }, mitCode: true, email: MAIL, jetzt: u.jetzt });

    const ueberLink = await T.tokenEinloesen(s, token,
      { zweck: "einladung", jetzt: u.jetzt });
    expect(ueberLink.eintrag.raum).toBe("t-gamma");

    const danachCode = await T.codeEinloesen(s, MAIL, code,
      { zweck: "einladung", jetzt: u.jetzt });
    expect(danachCode.eintrag).toBe(null);
  });

  it("… und der Code entwertet den Link", async () => {
    const s = laden(), u = uhr();
    const { token, code } = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: MAIL, jetzt: u.jetzt });

    expect((await T.codeEinloesen(s, MAIL, code,
      { zweck: "einladung", jetzt: u.jetzt })).eintrag).toBeTruthy();
    expect((await T.tokenEinloesen(s, token,
      { zweck: "einladung", jetzt: u.jetzt })).eintrag).toBe(null);
  });

  it("achtet beim Code auf Frist, Zweck und Laufnummer", async () => {
    const s = laden(), u = uhr();
    const a = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: "a@example.org", jetzt: u.jetzt });
    u.vor(8 * TAG);
    expect((await T.codeEinloesen(s, "a@example.org", a.code,
      { zweck: "einladung", jetzt: u.jetzt })).grund).toBe("abgelaufen");

    const u2 = uhr();
    const b = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: "b@example.org", jetzt: u2.jetzt });
    expect((await T.codeEinloesen(s, "b@example.org", b.code,
      { zweck: "zuruecksetzen", jetzt: u2.jetzt })).grund).toBe("zweck");

    const u3 = uhr();
    const c = await T.tokenAusstellen(s, { zweck: "einladung", nr: 1,
      mitCode: true, email: "c@example.org", jetzt: u3.jetzt });
    expect((await T.codeEinloesen(s, "c@example.org", c.code,
      { zweck: "einladung", nummern: { einladung: 2 }, jetzt: u3.jetzt })).grund)
      .toBe("entwertet");
  });
});
