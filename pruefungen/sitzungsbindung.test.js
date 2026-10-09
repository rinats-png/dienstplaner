/* ==========================================================================
   DIE BINDUNG DER ARBEITSSITZUNG AN IHREN LOGIN-KONTEXT

   Phase A.1, TEST-FIRST. Diese Datei beschreibt, was gelten muss, und sie
   läuft zuerst gegen den Stand VOR dem Fix. Rot heißt dort: Der Befund ist
   reproduziert. Grün heißt: Das Verhalten stimmt schon und muss nach dem
   Fix so bleiben.

     F1   Der Logout widerruft ein zuvor ausgestelltes Betriebsmerkmal nicht.
     F3   Fünf Pfade in daten.mjs lesen die Sitzung roh und umgehen die
          fachliche Prüfung (Entzug, Sperre, Epoche, Logout).
     ZG   Zwei Geräte: Der Logout des einen beendet das andere NICHT.
     AK   Aktivität: Arbeit hält den Login-Kontext am Leben, echte
          Untätigkeit beendet ihn.

   Gearbeitet wird wie im Betrieb: anmelden (Cookie), Betrieb öffnen
   (Arbeitsmerkmal), Anfragen mit `authorization: Bearer …`. Nichts hier
   setzt eine bestimmte Umsetzung voraus.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { aufbauen, uhr, MINUTE, asSchluessel, tSchluessel, hash, adresse } from "./hilfen/szenario.mjs";

let Z;
const LIMIT = 60000;

beforeAll(async () => { Z = await aufbauen("bindung"); }, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });
afterEach(() => { uhr.ende(); });

/** Wie gesagt: vor der Aktion darf kein Pfad „Nicht angemeldet" sagen. */
async function vorherNichtAbgewiesen(pfade, token) {
  for (const p of pfade) {
    expect((await p.ruf(token)).status, `${p.name} vorher`).not.toBe(401);
  }
}

/**
 * Ein eigenes Arbeitsmerkmal je Pfad, alle aus demselben Login.
 *
 * Warum nicht eines für alle: Die Hauptpfade räumen eine widerrufene Sitzung
 * beim ersten Zugriff weg (arbeitssitzungPruefen → sitzungBeenden). Wer
 * danach die fünf Vorab-Pfade mit demselben Merkmal fragt, sieht „Nicht
 * angemeldet" — weil die Datei weg ist, nicht weil die Pfade prüfen. Genau
 * so würde die Lücke F3 von einer Prüfung verdeckt, die zuerst einen
 * Hauptpfad trifft. Ein Angreifer trifft zuerst einen Vorab-Pfad.
 */
async function merkmaleJePfad(keks, raum, pfade) {
  const aus = {};
  for (const p of pfade) {
    const w = await Z.betriebOeffnen(keks, raum);
    expect(w.status, `Betrieb öffnen für ${p.name}`).toBe(200);
    aus[p.name] = w.token;
  }
  return aus;
}

/* ==========================================================================
   F1 + F3: JEDE WIDERRUFSURSACHE WIRKT AN ALLEN NEUN PFADEN
   ========================================================================== */

const URSACHEN = [
  { name: "Logout (F1)", wirke: (Zz, b) => Zz.abmelden(b.keks) },
  { name: "Mitgliedschaftsentzug", wirke: (Zz, b) => Zz.A.mitgliedschaftEntziehen(Zz.laden(), b.k.id, b.raum) },
  { name: "Kontosperre", wirke: (Zz, b) => Zz.A.accountSperren(Zz.laden(), b.k.id) },
  { name: "Epochenwechsel", wirke: (Zz, b) => Zz.A.epocheErhoehen(Zz.laden(), b.k.id) },
];

describe.each(URSACHEN)("Nach $name verweigern alle Pfade das Arbeitsmerkmal", (ursache) => {
  let b;
  let vorab;
  let token;

  beforeAll(async () => {
    await Z.taktLeeren();
    b = await Z.arbeitsbereich(`ursache-${ursache.name.slice(0, 4)}`);
    vorab = Z.VORABPFADE(b.raum);
    token = await merkmaleJePfad(b.keks, b.raum, [...Z.HAUPTPFADE, ...vorab]);
    /* Ausgangslage: jedes Merkmal gilt an seinem Pfad. */
    for (const p of [...Z.HAUPTPFADE, ...vorab]) {
      expect((await p.ruf(token[p.name])).status, `${p.name} vorher`).not.toBe(401);
    }
    await ursache.wirke(Z, b);
  }, LIMIT);

  for (const name of ["daten", "kalender", "lage", "zustellung"]) {
    it(`Hauptpfad ${name}: 401`, async () => {
      const p = Z.HAUPTPFADE.find((x) => x.name === name);
      expect((await p.ruf(token[name])).status).toBe(401);
    }, LIMIT);
  }

  for (const name of ["zugaenge", "raum-loeschen", "zugaenge-uebersicht",
    "zugang-sperren", "bestand-anlegen"]) {
    it(`Vorab-Pfad ${name}: 401 (F3)`, async () => {
      const p = vorab.find((x) => x.name === name);
      expect((await p.ruf(token[name])).status).toBe(401);
    }, LIMIT);
  }
});

describe("F3: Was die Lücke tatsächlich erlaubt", () => {
  it("eine entzogene Leitung kann Zugangscodes des Hauses nicht mehr sperren", async () => {
    const b = await Z.arbeitsbereich("sperr-nach-entzug");
    const schluessel = await Z.zugangskonto(b.raum, { rolle: "mitarbeiter", person: "p_2" });
    expect((await Z.K.kontoLesen(Z.laden(), schluessel)).gesperrt).toBeFalsy();

    await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);

    const e = await Z.bearer(Z.daten, "/api/zugang-sperren", b.token,
      { methode: "POST", rumpf: { pruefsumme: schluessel } });
    expect.soft(e.status, "Antwort der entzogenen Leitung").toBe(401);
    expect.soft((await Z.K.kontoLesen(Z.laden(), schluessel)).gesperrt,
      "Der Zugangscode wurde trotz Entzug gesperrt").toBeFalsy();
  }, LIMIT);
});

/* ==========================================================================
   ZG: ZWEI GERÄTE
   ========================================================================== */

describe("Zwei Geräte desselben Kontos", () => {
  let a, b, k, raum, vorab, tokenA;

  beforeAll(async () => {
    await Z.taktLeeren();
    const erst = await Z.arbeitsbereich("zwei-geraete");
    k = erst.k; raum = erst.raum;
    a = { keks: erst.keks, token: erst.token };
    b = await Z.zweitesGeraet(k, raum);
    vorab = Z.VORABPFADE(raum);
    expect(a.keks).not.toBe(b.keks);
    expect(a.token).not.toBe(b.token);
    /* Ein eigenes Merkmal je Pfad für Gerät A (siehe merkmaleJePfad). */
    tokenA = await merkmaleJePfad(a.keks, raum, [...Z.HAUPTPFADE, ...vorab]);
    for (const p of [...Z.HAUPTPFADE, ...vorab]) {
      expect((await p.ruf(tokenA[p.name])).status, `A ${p.name} vorher`).not.toBe(401);
    }
    await vorherNichtAbgewiesen(Z.HAUPTPFADE, b.token);

    expect((await Z.abmelden(a.keks)).status).toBe(200);
  }, LIMIT);

  /* Steht bewusst vor allen anderen: Die Pfade räumen widerrufene Sitzungen
     beim ersten Zugriff selbst weg. Hier soll sichtbar werden, dass schon der
     Logout aufgeräumt hat — und nur bei Gerät A. */
  it("der Logout räumt die Arbeitssitzungsdateien von Gerät A weg, nicht die von Gerät B", async () => {
    for (const [name, t] of Object.entries(tokenA)) {
      expect.soft(await Z.ablageArbeit().get(tSchluessel(t), { type: "json" }),
        `t: von A (${name})`).toBeNull();
    }
    expect(await Z.ablageArbeit().get(tSchluessel(b.token), { type: "json" }),
      "t: von B bleibt").toBeTruthy();
  }, LIMIT);

  it("Gerät A: das Arbeitsmerkmal ist an den vier Hauptpfaden tot (F1)", async () => {
    for (const p of Z.HAUPTPFADE) {
      expect.soft((await p.ruf(tokenA[p.name])).status, p.name).toBe(401);
    }
  }, LIMIT);

  it("Gerät A: das Arbeitsmerkmal ist an den fünf Vorab-Pfaden tot (F1 + F3)", async () => {
    for (const p of vorab) {
      expect.soft((await p.ruf(tokenA[p.name])).status, p.name).toBe(401);
    }
  }, LIMIT);

  it("Gerät A: das Konto-Cookie ist tot", async () => {
    expect((await Z.sitzungsstand(a.keks)).status).toBe(401);
  }, LIMIT);

  it("Gerät B: die Konto-Sitzung gilt weiter (200)", async () => {
    expect((await Z.sitzungsstand(b.keks)).status).toBe(200);
  }, LIMIT);

  it("Gerät B: das Arbeitsmerkmal gilt an allen vier Hauptpfaden weiter", async () => {
    for (const p of Z.HAUPTPFADE) {
      expect.soft((await p.ruf(b.token)).status, p.name).not.toBe(401);
    }
  }, LIMIT);

  it("Gerät B: ein weiterer Betrieb lässt sich noch öffnen", async () => {
    const zweiter = Z.raum("zweiter");
    await Z.betriebAnlegen(zweiter);
    await Z.mitgliedAnlegen(k.id, zweiter, "leitung");
    const w = await Z.betriebOeffnen(b.keks, zweiter);
    expect(w.status).toBe(200);
  }, LIMIT);
});

/* ==========================================================================
   ÜBERALL ABMELDEN
   ========================================================================== */

describe("Überall abmelden", () => {
  it("beendet die Arbeit aller Geräte dieses Kontos, nicht die eines anderen Kontos", async () => {
    const eins = await Z.arbeitsbereich("ueberall");
    const zwei = await Z.zweitesGeraet(eins.k, eins.raum);
    const fremd = await Z.arbeitsbereich("ueberall-fremd");
    await vorherNichtAbgewiesen([Z.HAUPTPFADE[0]], eins.token);
    await vorherNichtAbgewiesen([Z.HAUPTPFADE[0]], zwei.token);

    const e = await Z.AN.ueberallAbmelden(eins.k.id);
    expect(e.ok).toBe(true);
    expect(e.beendet, "beendete Account-Sitzungen").toBe(2);

    expect((await Z.sitzungsstand(eins.keks)).status, "Gerät 1, Konto").toBe(401);
    expect((await Z.sitzungsstand(zwei.keks)).status, "Gerät 2, Konto").toBe(401);
    for (const [name, t] of [["Gerät 1", eins.token], ["Gerät 2", zwei.token]]) {
      expect.soft(await Z.ablageArbeit().get(tSchluessel(t), { type: "json" }),
        `t: von ${name} ist aufgeräumt`).toBeNull();
      expect.soft((await Z.HAUPTPFADE[0].ruf(t)).status, `${name}, Arbeit`).toBe(401);
    }
    /* Ein anderes Konto merkt nichts. */
    expect((await Z.sitzungsstand(fremd.keks)).status).toBe(200);
    expect((await Z.HAUPTPFADE[0].ruf(fremd.token)).status).not.toBe(401);
  }, LIMIT);

  it("die Marker des beendeten Geräts sind weg, die des anderen bleiben", async () => {
    const a = await Z.arbeitsbereich("marker-weg");
    const b = await Z.zweitesGeraet(a.k, a.raum);
    await Z.abmelden(a.keks);
    const praefixA = `ab:${hash(a.keks)}:`;
    const praefixB = `ab:${hash(b.keks)}:`;
    expect((await Z.ablageKonto().list({ prefix: praefixA })).blobs, "Marker von A").toEqual([]);
    expect((await Z.ablageKonto().list({ prefix: praefixB })).blobs.length, "Marker von B").toBe(1);
  }, LIMIT);
});

/* ==========================================================================
   BINDUNG: FEHLENDE ODER FALSCHE BINDUNG IST 401 — KEIN FALLBACK
   ========================================================================== */

describe("Die Bindung selbst (Spezifikation)", () => {
  /** Den abgelegten Datensatz einer Arbeitssitzung verändern (nur in Prüfungen). */
  async function umschreiben(token, aendere) {
    const k = tSchluessel(token);
    const s = await Z.ablageArbeit().get(k, { type: "json" });
    await Z.ablageArbeit().setJSON(k, aendere(structuredClone(s)));
  }

  const FAELLE = [
    { name: "ohne `sitzung` im Anker (Sitzung aus der Zeit vor dem Fix)",
      aendere: (s) => { delete s.herkunft.sitzung; return s; } },
    { name: "`sitzung` zeigt auf eine Account-Sitzung, die es nicht gibt",
      aendere: (s) => { s.herkunft.sitzung = "f".repeat(64); return s; } },
    { name: "`sitzung` ist keine Prüfsumme (Zahl)",
      aendere: (s) => { s.herkunft.sitzung = 12345; return s; } },
    { name: "`sitzung` ist ein Pfad statt einer Prüfsumme",
      aendere: (s) => { s.herkunft.sitzung = "../as:abc"; return s; } },
    { name: "`sitzung` ist leer",
      aendere: (s) => { s.herkunft.sitzung = ""; return s; } },
  ];

  for (const fall of FAELLE) {
    it(`401 an Haupt- und Vorab-Pfad: ${fall.name}`, async () => {
      const b = await Z.arbeitsbereich("bindung-form");
      const zweites = await Z.betriebOeffnen(b.keks, b.raum);
      await vorherNichtAbgewiesen([Z.HAUPTPFADE[0]], b.token);
      await umschreiben(b.token, fall.aendere);
      await umschreiben(zweites.token, fall.aendere);
      expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status, "daten").toBe(401);
      const vorab = Z.VORABPFADE(b.raum).find((p) => p.name === "zugang-sperren");
      expect.soft((await vorab.ruf(zweites.token)).status, "zugang-sperren").toBe(401);
    }, LIMIT);
  }

  it("401, wenn `sitzung` auf die Account-Sitzung eines ANDEREN Kontos zeigt", async () => {
    const b = await Z.arbeitsbereich("bindung-fremd-a");
    const fremd = await Z.arbeitsbereich("bindung-fremd-b");
    await umschreiben(b.token, (s) => {
      s.herkunft.sitzung = hash(fremd.keks);
      return s;
    });
    expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status, "fremde Sitzung eingesetzt").toBe(401);
    expect.soft((await Z.HAUPTPFADE[0].ruf(fremd.token)).status, "das andere Konto bleibt unberührt")
      .not.toBe(401);
  }, LIMIT);

  it("ein Marker ab:<Konto-Sitzung>:<Arbeitssitzung> verbindet beide", async () => {
    const b = await Z.arbeitsbereich("bindung-marker");
    const { blobs } = await Z.ablageKonto().list({ prefix: `ab:${hash(b.keks)}:` });
    expect.soft(blobs.map((x) => x.key.split(":")[2]),
      "Marker der Konto-Sitzung").toEqual([hash(b.token)]);
  }, LIMIT);

  it("die Arbeitssitzung überlebt ihre Anmeldung nicht: gueltigBis ist gekappt", async () => {
    uhr.start();
    const k = await Z.kontoAnlegen(adresse("kappung"));
    const a = await Z.anmelden(k.email);
    expect(a.status).toBe(200);
    const raum = Z.raum("kappung");
    await Z.betriebAnlegen(raum);
    await Z.mitgliedAnlegen(k.id, raum, "leitung");
    const asBis = (await Z.ablageKonto().get(asSchluessel(a.keks), { type: "json" })).bis;
    /* Elf Stunden Betrieb im Konto-Kontext, in Schritten unter der Untätigkeitsgrenze. */
    for (let i = 0; i < 23; i++) {
      uhr.vor(28 * MINUTE);
      expect((await Z.sitzungsstand(a.keks)).status, `Schritt ${i}`).toBe(200);
    }
    const w = await Z.betriebOeffnen(a.keks, raum);
    expect(w.status).toBe(200);
    expect.soft(w.daten.gueltigBis, "gueltigBis der Arbeitssitzung").toBeLessThanOrEqual(asBis);
    expect.soft((await Z.ablageArbeit().get(tSchluessel(w.token), { type: "json" })).bis,
      "bis im Datensatz").toBeLessThanOrEqual(asBis);
  }, LIMIT);
});

/* ==========================================================================
   SICHERUNGSSCHLÜSSEL SIND NUR IM HAUPTPFAD SITZUNGEN
   ========================================================================== */

describe("Sicherungsschlüssel (sk:)", () => {
  it("sind an keinem der anderen Pfade eine Sitzung; im Hauptpfad dürfen sie nur lesen", async () => {
    const raum = Z.raum("sk");
    await Z.betriebAnlegen(raum);
    const roh = `sicherungsschluessel-fuer-die-pruefung-${raum}`;
    await Z.ablageArbeit().setJSON(Z.S.sicherungsSchluessel(roh), {
      bestand: raum, rolle: "leitung", nurSicherung: true,
      name: "Sicherungsschlüssel (Leitung)", angelegt: new Date().toISOString(),
      bis: Date.now() + 24 * 3600 * 1000,
    });
    for (const p of [Z.HAUPTPFADE[1], Z.HAUPTPFADE[2], Z.HAUPTPFADE[3], ...Z.VORABPFADE(raum)]) {
      expect.soft((await p.ruf(roh)).status, `${p.name}: Sicherungsschlüssel`).toBe(401);
    }
    /* Der Hauptpfad nimmt ihn an, aber nur für die Vollausgabe. */
    expect((await Z.bearer(Z.daten, "/api/vollausgabe", roh)).status, "Vollausgabe").not.toBe(401);
    expect((await Z.bearer(Z.daten, "/api/bestand", roh, { methode: "PUT", rumpf: {} })).status,
      "Schreiben mit dem Sicherungsschlüssel").toBe(403);
    expect((await Z.bearer(Z.daten, "/api/bestand", roh)).status, "Lesen über /bestand").toBe(403);
  }, LIMIT);
});

/* ==========================================================================
   AK: AKTIVITÄT HÄLT DEN LOGIN-KONTEXT AM LEBEN
   ========================================================================== */

describe("Aktivität und Untätigkeit des Login-Kontexts", () => {
  it("31 Minuten nur Arbeitsanfragen halten denselben Login-Kontext aktiv", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("aktiv");
    /* Vier Zehn-Minuten-Schritte, jedes Mal nur eine Arbeitsanfrage — nie ein
       Aufruf an die Account-Endpunkte. */
    for (let i = 1; i <= 4; i++) {
      uhr.vor(10 * MINUTE);
      const r = await Z.HAUPTPFADE[0].ruf(b.token);
      expect(r.status, `Arbeitsanfrage nach ${i * 10} Minuten`).not.toBe(401);
    }
    /* Vierzig Minuten nach der Anmeldung, nie an den Account-Endpunkten
       gewesen: Der Kontext lebt, weil in ihm gearbeitet wurde. */
    expect.soft((await Z.sitzungsstand(b.keks)).status,
      "Konto-Sitzung nach 40 Minuten Arbeit").toBe(200);
    expect.soft((await Z.HAUPTPFADE[0].ruf(b.token)).status,
      "Arbeitsmerkmal danach").not.toBe(401);
  }, LIMIT);

  it("31 Minuten echte Untätigkeit machen den Kontext ungültig", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("untaetig");
    uhr.vor(31 * MINUTE);
    expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeitsmerkmal").toBe(401);
    expect((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung").toBe(401);
  }, LIMIT);

  it("29 Minuten Pause beenden nichts", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("pause");
    uhr.vor(29 * MINUTE);
    expect((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung").toBe(200);
    expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeitsmerkmal").not.toBe(401);
  }, LIMIT);

  it("die absolute Frist bleibt: zwölf Stunden Dauerbetrieb enden", async () => {
    uhr.start();
    const b = await Z.arbeitsbereich("frist");
    for (let i = 0; i < 25; i++) {
      uhr.vor(29 * MINUTE);
      await Z.HAUPTPFADE[0].ruf(b.token);
    }
    /* 25 × 29 Minuten = 12 h 05: Dauerbetrieb verlängert die Untätigkeit,
       nie die Gesamtdauer. */
    expect((await Z.HAUPTPFADE[0].ruf(b.token)).status, "Arbeitsmerkmal").toBe(401);
    expect((await Z.sitzungsstand(b.keks)).status, "Konto-Sitzung").toBe(401);
  }, LIMIT);
});

/* ==========================================================================
   Der Ablageschlüssel taucht in dieser Datei nur auf, wo er etwas beweist.
   ========================================================================== */

describe("Hygiene", () => {
  it("Klartext-Merkmale stehen nirgends in der Ablage", async () => {
    const b = await Z.arbeitsbereich("klartext");
    for (const [store, praefix] of [[Z.ablageArbeit(), "t:"], [Z.ablageKonto(), "as:"]]) {
      const { blobs } = await store.list({ prefix: praefix });
      for (const x of blobs) {
        const text = JSON.stringify(await store.get(x.key, { type: "json" }));
        expect(text).not.toContain(b.token);
        expect(text).not.toContain(b.keks);
      }
    }
    expect(await Z.ablageArbeit().get(tSchluessel(b.token), { type: "json" })).toBeTruthy();
    expect(await Z.ablageKonto().get(asSchluessel(b.keks), { type: "json" })).toBeTruthy();
  }, LIMIT);
});
