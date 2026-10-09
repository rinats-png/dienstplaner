/* ==========================================================================
   RENNEN UM DIE VERLÄNGERUNG — EIN VERSPÄTETER SCHREIBVORGANG DARF NIE
   EINE WIDERRUFENE SITZUNG WIEDERBELEBEN

   Phase A.1, TEST-FIRST.

   Der Befund (R1, F4): Eine Anfrage liest eine Sitzung, will deren Zeitstempel
   verlängern und schreibt den GANZEN Datensatz zurück — ohne abzuwarten. Löscht
   in der Zwischenzeit ein Logout (as:), eine Sperre oder eine Raumlöschung
   (t:) den Datensatz, legt der verspätete Schreibvorgang ihn wieder an.

   Die Prüfungen fixieren die Reihenfolge, statt auf Glück zu hoffen:

     1. Zeit vor: Die Verlängerung ist fällig.
     2. Die Anfrage läuft; ihr Schreibvorgang wird ANGEHALTEN (Schreibtor).
        Die Antwort kommt, weil der Aufrufer nicht auf ihn wartet.
     3. Der Widerruf läuft vollständig durch.
     4. Der angehaltene Schreibvorgang wird freigegeben und landet.
     5. Erwartung: Der Datensatz existiert NICHT wieder, und die nächste
        Anfrage wird abgewiesen.

   Dieselbe Reihenfolge läuft gegen jede Umsetzung — auch gegen eine, die die
   Aktivität in einen eigenen Schlüssel schreibt. Ob dann ein Waisen-Datensatz
   übrig bleibt, ist gleichgültig; er darf nur nichts erlauben.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { aufbauen, uhr, MINUTE, asSchluessel, tSchluessel } from "./hilfen/szenario.mjs";
import { tor } from "./hilfen/schreibtor.mjs";

vi.mock("../server/lib/ablage.mjs", async (orig) => {
  const echt = await orig();
  const { umhuellen } = await import("./hilfen/schreibtor.mjs");
  return { ...echt, getStore: (a) => umhuellen(echt.getStore(a),
    typeof a === "string" ? a : a.name) };
});

let Z;
const LIMIT = 60000;
const KONTO = "centric-accountsitzungen";
const ARBEIT = "centric-sitzungen";

beforeAll(async () => { Z = await aufbauen("rennen"); }, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { tor.zuruecksetzen(); await Z.taktLeeren(); });
afterEach(async () => { tor.zuruecksetzen(); await tor.leer(); uhr.ende(); });

/* ==========================================================================
   R1: DIE ACCOUNT-SITZUNG (as:)
   ========================================================================== */

describe("R1: eine widerrufene Account-Sitzung bleibt widerrufen", () => {
  it("Verlängerung über einen Konto-Aufruf: Logout dazwischen, as: bleibt weg", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("r1-konto");
    const schluessel = asSchluessel(b.keks);
    await tor.leer();
    uhr.vor(2 * MINUTE); // Verlängerung fällig, Untätigkeit noch nicht erreicht

    const regel = tor.halten({ store: KONTO, praefixe: ["as:", "az:"] });
    const r = await Z.sitzungsstand(b.keks);
    expect(r.status, "Anfrage selbst").toBe(200);
    expect(regel.gehalten.length, "Vorbedingung: der Verlängerungsschreibvorgang wurde ausgelöst")
      .toBeGreaterThanOrEqual(1);

    const aus = await Z.abmelden(b.keks);
    expect(aus.status, "Logout").toBe(200);
    expect(await Z.ablageKonto().get(schluessel, { type: "json" }),
      "Vorbedingung: der Logout hat as: gelöscht").toBeNull();

    regel.freigeben();
    await regel.abwarten();

    expect.soft(await Z.ablageKonto().get(schluessel, { type: "json" }),
      "as: darf nach dem verspäteten Schreibvorgang nicht wieder existieren").toBeNull();
    expect.soft((await Z.sitzungsstand(b.keks)).status,
      "Konto-Sitzung nach dem Rennen").toBe(401);
    expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status,
      "Arbeitsmerkmal nach dem Rennen").toBe(401);
  }, LIMIT);

  it("Verlängerung über eine Arbeitsanfrage: Logout dazwischen, as: bleibt weg", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("r1-arbeit");
    const schluessel = asSchluessel(b.keks);
    await tor.leer();
    uhr.vor(2 * MINUTE);

    const regel = tor.halten({ store: KONTO, praefixe: ["as:", "az:"] });
    const r = await Z.HAUPTPFADE[0].ruf(b.token);
    expect(r.status, "Anfrage selbst").not.toBe(401);
    /* Spezifikation: Arbeit verlängert den Login-Kontext. Heute tut sie das
       nicht — dann ist dieser Test aus einem anderen Grund rot. */
    expect.soft(regel.gehalten.length,
      "Spezifikation: die Arbeitsanfrage verlängert den Login-Kontext").toBeGreaterThanOrEqual(1);

    expect((await Z.abmelden(b.keks)).status).toBe(200);
    regel.freigeben();
    await regel.abwarten();

    expect.soft(await Z.ablageKonto().get(schluessel, { type: "json" }),
      "as: darf nicht wieder existieren").toBeNull();
    expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeitsmerkmal danach").toBe(401);
  }, LIMIT);

  it("ein Waisen-Aktivitätsdatensatz allein erlaubt nichts", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("r1-waise");
    expect((await Z.abmelden(b.keks)).status).toBe(200);
    /* Selbst wenn jemand (oder ein verspäteter Schreibvorgang) einen
       Aktivitätsdatensatz anlegt: ohne Autorität gilt nichts. */
    const jetzt = Date.now();
    const h = asSchluessel(b.keks).slice(3);
    await Z.ablageKonto().setJSON(`az:${h}`, { zuletzt: jetzt });
    await Z.ablageKonto().setJSON(`ab:${h}:${"0".repeat(64)}`, { seit: jetzt, bis: jetzt + 3600000 });
    expect((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung").toBe(401);
    expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeitsmerkmal").toBe(401);
  }, LIMIT);
});

describe("S3: Logout parallel zum Öffnen eines Betriebs", () => {
  it("das Öffnen liefert kein lebendes Merkmal und hinterlässt keine Arbeitssitzung", async () => {
    const k = await Z.kontoAnlegen(`s3-${Date.now()}@example.org`);
    const raum = Z.raum("s3");
    await Z.betriebAnlegen(raum);
    await Z.mitgliedAnlegen(k.id, raum, "leitung");
    const a = await Z.anmelden(k.email);
    expect(a.status).toBe(200);
    await tor.leer();

    /* Das Anlegen der Arbeitssitzung wird angehalten: Die Anfrage hat die
       Konto-Sitzung schon geprüft, die Arbeitssitzung ist noch nicht da. */
    const regel = tor.halten({ store: ARBEIT, praefixe: ["t:"] });
    const offen = Z.betriebOeffnen(a.keks, raum);
    await vi.waitFor(() => expect(regel.gehalten.length).toBe(1), { timeout: 10000 });

    expect((await Z.abmelden(a.keks)).status, "Logout dazwischen").toBe(200);
    regel.freigeben();
    const w = await offen;
    await regel.abwarten();

    if (w.status === 200) {
      expect.soft((await Z.HAUPTPFADE[0].ruf(w.token)).status,
        "ein ausgegebenes Merkmal darf nicht gelten").toBe(401);
    }
    /* Und nichts bleibt liegen, das später wieder gültig werden könnte. */
    const { blobs } = await Z.ablageArbeit().list({ prefix: "t:" });
    let uebrig = 0;
    for (const x of blobs) {
      const s = await Z.ablageArbeit().get(x.key, { type: "json" }).catch(() => null);
      if (s && s.bestand === raum) uebrig++;
    }
    expect.soft(uebrig, "übrig gebliebene Arbeitssitzungen des Raums").toBe(0);
  }, LIMIT);
});

describe("Der Logout bleibt endgültig, auch wenn das Aufräumen scheitert", () => {
  it("scheitert das Löschen der Arbeitssitzung, antwortet der Logout trotzdem und die Arbeit ist tot", async () => {
    const b = await Z.arbeitsbereich("aufraeumen-scheitert");
    await tor.leer();
    expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "vorher").not.toBe(401);

    const f = tor.fehlerBei({ store: ARBEIT, praefixe: ["t:"], op: "delete" });
    const aus = await Z.abmelden(b.keks);
    expect(aus.status, "Logout").toBe(200);
    expect(aus.daten.angemeldet).toBe(false);
    expect(f.ausgeloest.length, "Vorbedingung: das Löschen wurde versucht und scheiterte")
      .toBeGreaterThanOrEqual(1);

    /* Die Datei liegt noch da — aber sie berechtigt zu nichts: Ihre Anmeldung ist weg. */
    expect(await Z.ablageArbeit().get(tSchluessel(b.token), { type: "json" })).toBeTruthy();
    expect((await Z.sitzungsstand(b.keks)).status, "Konto").toBe(401);
    expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeit nach dem Logout").toBe(401);
    /* Und der Marker bleibt, damit der Aufräumlauf sie findet. */
    expect.soft((await Z.ablageKonto().list({ prefix: `ab:${asSchluessel(b.keks).slice(3)}:` })).blobs.length,
      "Marker bleibt liegen").toBe(1);
  }, LIMIT);
});

describe("Ein Lesefehler schließt die Tür, ohne etwas zu löschen", () => {
  for (const [name, praefix] of [["die Account-Sitzung (as:)", "as:"], ["ihre Aktivität (az:)", "az:"]]) {
    it(`${name} lässt sich nicht lesen: Konto und Arbeit sind zu, nichts geht verloren`, async () => {
      const b = await Z.arbeitsbereich(`lesefehler-${praefix.slice(0, 2)}`);
      await tor.leer();
      expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "vorher").not.toBe(401);

      const f = tor.fehlerBei({ store: KONTO, praefixe: [praefix], op: "get" });
      expect((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung bei Lesefehler").toBe(401);
      expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeit bei Lesefehler").toBe(401);
      expect((await Z.VORABPFADE(b.raum)[3].ruf(b.token)).status, "Vorab-Pfad bei Lesefehler").toBe(401);
      expect(f.ausgeloest.length, "Vorbedingung: der Lesefehler wurde ausgelöst").toBeGreaterThanOrEqual(2);

      f.beenden();
      /* Nichts wurde gelöscht: weder die Anmeldung noch die Arbeitssitzung. */
      expect.soft(await Z.ablageKonto().get(asSchluessel(b.keks), { type: "json" }),
        "as: ist noch da").toBeTruthy();
      expect.soft(await Z.ablageArbeit().get(tSchluessel(b.token), { type: "json" }),
        "t: ist noch da").toBeTruthy();
      expect.soft((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung danach").toBe(200);
      expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeit danach").not.toBe(401);
    }, LIMIT);
  }

  it("die Aktivität einer alten Sitzung (ta:) lässt sich nicht lesen: zu, nichts geht verloren", async () => {
    const raum = Z.raum("lesefehler-ta");
    await Z.betriebAnlegen(raum);
    const s = await Z.legacySitzung(raum);
    await tor.leer();
    const f = tor.fehlerBei({ store: ARBEIT, praefixe: ["ta:"], op: "get" });
    expect((await Z.HAUPTPFADE[0].ruf(s.token)).status, "bei Lesefehler").toBe(401);
    expect(f.ausgeloest.length).toBeGreaterThanOrEqual(1);
    f.beenden();
    expect(await Z.ablageArbeit().get(tSchluessel(s.token), { type: "json" }), "t: ist noch da").toBeTruthy();
    expect((await Z.HAUPTPFADE[0].ruf(s.token)).status, "danach").not.toBe(401);
  }, LIMIT);
});

describe("Schreiber der Autoritätsdatensätze", () => {
  it("as: und t: werden nach dem Anlegen nie wieder geschrieben", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("schreiber");
    await tor.leer();
    /* Fünf Verlängerungen: Zeit vor, Konto-Aufruf und Arbeitsanfrage, jedes Mal fällig. */
    for (let i = 0; i < 5; i++) {
      uhr.vor(2 * MINUTE);
      await Z.sitzungsstand(b.keks);
      await Z.HAUPTPFADE[0].ruf(b.token);
      await tor.leer();
    }
    const alsAs = tor.schreibungen(KONTO, asSchluessel(b.keks));
    const alsT = tor.schreibungen(ARBEIT, tSchluessel(b.token));
    expect.soft(alsAs.length, "Schreibvorgänge auf as:<Merkmal> (erlaubt: genau der eine beim Anlegen)").toBe(1);
    expect.soft(alsT.length, "Schreibvorgänge auf t:<Merkmal> (erlaubt: genau der eine beim Anlegen)").toBe(1);
  }, LIMIT);
});

/* ==========================================================================
   F4: DIE ALTE ARBEITSSITZUNG (t:, ZUGANGSCODE)
   ========================================================================== */

describe("F4: eine gesperrte Zugangscode-Sitzung bleibt gesperrt", () => {
  async function aufstellen(was) {
    const raum = Z.raum(was);
    await Z.betriebAnlegen(raum);
    const opfer = await Z.zugangskonto(raum, { rolle: "leitung", person: "p_1" });
    const sitzungOpfer = await Z.legacySitzung(raum, { rolle: "leitung", person: "p_1", konto: opfer });
    const verwalter = await Z.zugangskonto(raum, { rolle: "leitung", person: "p_2" });
    const sitzungVerwalter = await Z.legacySitzung(raum, { rolle: "leitung", person: "p_2", konto: verwalter });
    return { raum, opfer, sitzungOpfer, verwalter, sitzungVerwalter };
  }

  it("Sperre dazwischen: t: bleibt weg, der gesperrte Code kommt nicht wieder hinein", async () => {
    uhr.start();
    const s = await aufstellen("f4-sperre");
    const schluessel = tSchluessel(s.sitzungOpfer.token);
    await tor.leer();
    uhr.vor(2 * MINUTE);

    const regel = tor.halten({ store: ARBEIT, praefixe: ["t:", "ta:"] });
    const r = await Z.HAUPTPFADE[0].ruf(s.sitzungOpfer.token);
    expect(r.status, "Anfrage des Opfers vor der Sperre").not.toBe(401);
    expect(regel.gehalten.length, "Vorbedingung: der Verlängerungsschreibvorgang wurde ausgelöst")
      .toBeGreaterThanOrEqual(1);

    /* Die Leitung zieht den Code zurück — der echte Endpunkt, der laufende
       Sitzungen des Codes beendet. */
    const e = await Z.bearer(Z.daten, "/api/zugang-sperren", s.sitzungVerwalter.token,
      { methode: "POST", rumpf: { pruefsumme: s.opfer } });
    expect(e.status, `Sperre: ${JSON.stringify(e.daten)}`).toBe(200);
    expect(e.daten.sitzungenBeendet, "Vorbedingung: die Sitzung des Opfers wurde beendet")
      .toBeGreaterThanOrEqual(1);
    expect(await Z.ablageArbeit().get(schluessel, { type: "json" }),
      "Vorbedingung: t: ist gelöscht").toBeNull();

    regel.freigeben();
    await regel.abwarten();

    expect.soft(await Z.ablageArbeit().get(schluessel, { type: "json" }),
      "t: darf nach dem verspäteten Schreibvorgang nicht wieder existieren").toBeNull();
    expect.soft((await Z.HAUPTPFADE[0].ruf(s.sitzungOpfer.token)).status,
      "Zugriff mit dem Merkmal des gesperrten Codes").toBe(401);
  }, LIMIT);

  it("Löschung dazwischen (Raumlöschung beendet die Sitzungen des Raums)", async () => {
    uhr.start();
    const s = await aufstellen("f4-loeschung");
    const schluessel = tSchluessel(s.sitzungOpfer.token);
    await tor.leer();
    uhr.vor(2 * MINUTE);

    const regel = tor.halten({ store: ARBEIT, praefixe: ["t:", "ta:"] });
    expect((await Z.HAUPTPFADE[0].ruf(s.sitzungOpfer.token)).status).not.toBe(401);
    expect(regel.gehalten.length, "Vorbedingung: Schreibvorgang unterwegs").toBeGreaterThanOrEqual(1);

    /* Dieselbe Primitive, die der Betreiber beim Löschen eines Raums und die
       Anmeldung beim Widerruf benutzt. */
    expect(await Z.S.sitzungBeenden(s.sitzungOpfer.token)).toBe(true);
    expect(await Z.ablageArbeit().get(schluessel, { type: "json" })).toBeNull();

    regel.freigeben();
    await regel.abwarten();

    expect.soft(await Z.ablageArbeit().get(schluessel, { type: "json" }),
      "t: darf nicht wieder existieren").toBeNull();
    expect.soft((await Z.HAUPTPFADE[0].ruf(s.sitzungOpfer.token)).status, "Zugriff danach").toBe(401);
  }, LIMIT);

  it("t: einer alten Sitzung wird nach dem Anlegen nie wieder geschrieben", async () => {
    uhr.start();
    const s = await aufstellen("f4-schreiber");
    await tor.leer();
    for (let i = 0; i < 5; i++) {
      uhr.vor(2 * MINUTE);
      await Z.HAUPTPFADE[0].ruf(s.sitzungOpfer.token);
      await tor.leer();
    }
    expect.soft(tor.schreibungen(ARBEIT, tSchluessel(s.sitzungOpfer.token)).length,
      "Schreibvorgänge auf t:<Merkmal> (erlaubt: der eine beim Anlegen)").toBe(1);
  }, LIMIT);
});
