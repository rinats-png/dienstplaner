/* ==========================================================================
   PROVISIONIERUNG — ein Mensch bekommt seinen Betrieb

   Fünf Dinge entstehen zusammen: Raum, Leitungsperson, Mitgliedschaft,
   Raumindex und der Vermerk, dass der kostenlose Testbetrieb verbraucht ist.
   Geprüft wird beides — dass sie zusammen entstehen, und dass nach einem
   Fehler kein halber Betrieb liegen bleibt.

   Der Weg zum Account führt über die echte Registrierung: Adresse, Link,
   Bestätigung, Passwort. Kein von Hand zusammengesetzter Datensatz, wo der
   echte Weg zur Verfügung steht.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, P, A, R, aufraeumen;

const TAG = 86400000;
/* Jede Provisionierung legt einen echten Betrieb an, und jeder Account
   entsteht über den echten Registrierungsweg mit scrypt. Mehrere Vorgänge
   samt Rücknahme in einem Test überschreiten die Vorgabe von fünf Sekunden
   deutlich — die Tests werden davon nicht schwächer, nur geduldiger. */
const LIMIT = 30000;
const GUT = "Nordwind und Sonne 1846";
const PROFIL = { vorname: "Rina", nachname: "Schmitt",
  betriebsname: "Wachdienst Nordlicht" };
const PW_ABLAGE = "s1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-provisionierung-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.RESEND_API_KEY;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  P = await import("../server/lib/provisionierung.mjs");
  A = await import("../server/lib/accounts.mjs");
  R = await import("../server/lib/registrierung.mjs");
  aufraeumen = await import("../server/lib/aufraeumen.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

let zaehler = 0;
let laden, sitzungen;
const neuerSpeicher = () => {
  const n = ++zaehler;
  laden = getStore({ name: `prov${n}`, consistency: "strong" });
  sitzungen = getStore({ name: `prov${n}-sitzungen`, consistency: "strong" });
  return laden;
};

/** Ein Postfach, das mitschreibt. */
function postfach() {
  const briefe = [];
  const versand = async (an, betreff, text) => {
    briefe.push({ an, betreff, text });
    return { ok: true, trocken: true };
  };
  return { briefe, versand, letzter: () => briefe[briefe.length - 1] };
}

const tokenAus = (text) => {
  const t = /#token=([A-Za-z0-9_-]+)/.exec(String(text));
  return t ? t[1] : null;
};

/** Der vollständige Registrierungsweg — Adresse, Link, Bestätigung, Passwort. */
async function fertigerAccount(s, email = "rina@example.org", profil = PROFIL) {
  const pf = postfach();
  const start = await R.registrierungStarten(s, { ...profil, email, versand: pf.versand });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const v = await R.emailVerifizieren(s, { token: tokenAus(pf.letzter().text) });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  const p = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
  expect(p.ok, `Passwort: ${p.grund}`).toBe(true);
  return await A.accountLesenPerId(s, v.accountId);
}

/** Ein Speicher, der beim Schreiben bestimmter Schlüssel scheitert. */
const mitSchreibfehler = (echt, trifft, text = "Platte voll") => new Proxy(echt, {
  get(ziel, name) {
    if (name !== "setJSON" && name !== "set") return Reflect.get(ziel, name);
    return (key, ...rest) => (trifft(key)
      ? Promise.reject(new Error(`${text} bei ${key}`))
      : Reflect.get(ziel, name).call(ziel, key, ...rest));
  },
});

/** Ein Speicher, der beim Löschen bestimmter Schlüssel scheitert. */
const mitLoeschfehler = (echt, trifft) => new Proxy(echt, {
  get(ziel, name) {
    if (name !== "delete") return Reflect.get(ziel, name);
    return (key) => (trifft(key)
      ? Promise.reject(new Error(`Zugriff verweigert bei ${key}`))
      : ziel.delete(key));
  },
});

const anlegen = (s, accountId, o = {}) =>
  P.testbetriebFuerAccountAnlegen(s, sitzungen, { accountId, ...o });

/* ==========================================================================
   WER NICHT DARF
   ========================================================================== */

describe("Ohne offenen Anspruch entsteht kein Betrieb", () => {
  const nichts = async (s) => {
    for (const praefix of ["kern:", "bestand:", "mitglied:", "raummitglied:", "konto:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
  };

  it("weist eine unbekannte Kennung ab", async () => {
    const s = neuerSpeicher();
    for (const id of ["a_gibtesnicht", "", null, undefined, 42, {}]) {
      const e = await anlegen(s, id);
      expect(e.ok, String(id)).toBe(false);
      expect(e.grund).toBe("konto");
    }
    await nichts(s);
  });

  it("weist einen eingeladenen Account ohne Vorgang ab", async () => {
    const s = neuerSpeicher();
    const konto = (await A.accountAnlegen(s, { email: "geladen@example.org" })).account;
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("kein-vorgang");
    await nichts(s);
  });

  it("weist einen aktiven historischen Account ohne Vorgang ab", async () => {
    const s = neuerSpeicher();
    const konto = (await A.accountAnlegen(s, { email: "historisch@example.org",
      status: "aktiv", passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString() })).account;
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("kein-vorgang");
    await nichts(s);
  });

  it("weist einen unbestätigten und einen passwortlosen Account ab", async () => {
    const s = neuerSpeicher();
    const pf = postfach();
    /* Vorgang offen, Adresse aber noch nicht bestätigt. */
    await R.registrierungStarten(s, { ...PROFIL, email: "offen@example.org",
      versand: pf.versand });
    const roh = await A.accountLesenPerMail(s, "offen@example.org");
    expect(roh.testbetriebOffenSeit).toBeTruthy();
    const e1 = await anlegen(s, roh.id);
    expect(e1.ok).toBe(false);
    expect(e1.grund).toBe("nicht-aktiv");

    /* Adresse bestätigt, Passwort fehlt noch. */
    const v = await R.emailVerifizieren(s, { token: tokenAus(pf.letzter().text) });
    const e2 = await anlegen(s, v.accountId);
    expect(e2.ok).toBe(false);
    expect(e2.grund).toBe("nicht-aktiv");
    await nichts(s);
  });

  it("weist einen gesperrten Account ab", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "gesperrt@example.org");
    await A.accountSperren(s, konto.id);
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("nicht-aktiv");
    await nichts(s);
  });

  it("weist einen Account ab, der seinen Test schon verbraucht hat", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "verbraucht@example.org");
    await A.testbetriebVerbrauchen(s, konto.id);
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("verbraucht");
    await nichts(s);
  });

  it("weist einen Account mit unbrauchbarem Profil ab", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "profil@example.org");
    /* Am Modul vorbei verfälscht — so, wie es ein Fehler in einer anderen
       Schicht hinterlassen könnte. */
    const roh = await s.get(A.accountSchluessel("profil@example.org"), { type: "json" });
    await s.setJSON(A.accountSchluessel("profil@example.org"),
      { ...roh, profil: { vorname: "Rina", nachname: "Schmitt", betriebsname: "ab" } });
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("profil:betriebsname");
    await nichts(s);

    /* Und ohne Profil überhaupt. */
    await s.setJSON(A.accountSchluessel("profil@example.org"), { ...roh, profil: null });
    const e2 = await anlegen(s, konto.id);
    expect(e2.ok).toBe(false);
    expect(e2.grund).toBe("profil:profil");
    await nichts(s);
  });
});

/* ==========================================================================
   DER ERFOLGSFALL
   ========================================================================== */

describe("Ein vollständiger Selbsteintritt bekommt seinen Betrieb", () => {
  it("legt Raum, Person, Mitgliedschaft, Index und Verbrauch an", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s);
    const vorher = Date.now();
    const e = await anlegen(s, konto.id);
    const nachher = Date.now();
    expect(e.ok, e.grund).toBe(true);

    /* Genau ein Raum, aus dem Betriebsnamen gebildet. */
    expect(e.raum).toMatch(/^t-wachdienst-nordlicht-[acdefghjkmnpqrtuvwxy34679]{5}$/);
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);

    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    const gelesen = await bestandLesen(s, e.raum);
    const m = gelesen.bestand.mandanten[0];
    expect(m.status).toBe("test");
    expect(m.selbstAngelegt).toBe(true);
    expect(m.name).toBe(PROFIL.betriebsname);
    expect(gelesen.durch).toBe("Selbstregistrierung");

    /* Dreißig Tage, wie im Legacy-Weg. */
    const ab = new Date(m.laeuftAb).getTime();
    expect(ab).toBeGreaterThanOrEqual(vorher + aufraeumen.TESTTAGE * TAG);
    expect(ab).toBeLessThanOrEqual(nachher + aufraeumen.TESTTAGE * TAG);
    /* Und kein eigenes Aufbewahrungsfeld — wie im Legacy-Weg. */
    for (const feld of ["aufbewahrenBis", "testBis"]) {
      expect(Object.prototype.hasOwnProperty.call(m, feld), feld).toBe(false);
    }

    /* Eine echte Leitungsperson. */
    expect(m.personen.length).toBe(1);
    const person = m.personen[0];
    expect(person.vorname).toBe("Rina");
    expect(person.nachname).toBe("Schmitt");
    expect(person.rolle).toBe("leitung");
    expect(person.funktion).toBe("Organisationsleitung");
    expect(person.bereich).toBe("ALLE");
    expect(person.status).toBe("aktiv");
    expect(person.id).toMatch(/^p_[0-9a-f]{7}$/);
    /* Die Person ist der Einheit des Betriebs zugeordnet. */
    expect(person.zugehoerigkeit[0].einheitId).toBe(m.einheiten[0].id);
    /* Keine Adresse in der Personalliste — die Identität bleibt am Account. */
    expect(person.email).toBe("");
    expect(JSON.stringify(person)).not.toContain("rina@example.org");
    expect(person.id).not.toBe(konto.id);

    /* Die Mitgliedschaft. */
    const mit = await A.mitgliedschaftLesen(s, konto.id, e.raum);
    expect(mit).not.toBe(null);
    expect(mit.rolle).toBe("leitung");
    expect(mit.rolle).not.toBe("betreiber");
    expect(mit.status).toBe("aktiv");
    expect(mit.person).toBe(person.id);
    expect(mit.person).not.toBe(null);
    expect(mit.betrieb).toBe(0);
    expect(mit.mandantId).toBe(m.id);
    expect(mit.mandantId).toBe(e.raum);

    /* Der Raumindex. */
    const index = await s.get(A.raummitgliedSchluessel(e.raum, konto.id), { type: "json" });
    expect(index).toEqual({ accountId: konto.id, raum: e.raum });

    /* Der Verbrauch — und der Vorgang ist zu. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.testbetriebVerbrauchtAm).toBeTruthy();
    expect(nach.testbetriebOffenSeit).toBe(null);
    expect(nach.testbetriebRaum).toBe(e.raum);
    expect(A.testbetriebOffen(nach).grund).toBe("verbraucht");

    /* Kein Zugangscode, keine Sitzung. */
    expect((await s.list({ prefix: "konto:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "t:" })).blobs.length).toBe(0);
    expect((await sitzungen.list({ prefix: "t:" })).blobs.length).toBe(0);
    /* Und der Account trägt weiterhin keine Rolle und keine Person. */
    for (const feld of ["rolle", "person", "raum", "betrieb", "mandantId"]) {
      expect(Object.prototype.hasOwnProperty.call(nach, feld), feld).toBe(false);
    }
  }, LIMIT);

  it("macht die Leitung für die Rechteprüfung wirksam", async () => {
    /* Der Zweck der ganzen Person: `wirksameRolle` liest die Rolle aus dem
       Personendatensatz. Eine Mitgliedschaft ohne passende Person wäre in
       der Rechteprüfung wirkungslos. */
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "rechte@example.org");
    const e = await anlegen(s, konto.id);
    const { wirksameRolle } = await import("../server/lib/rechte.mjs");
    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    const bestand = (await bestandLesen(s, e.raum)).bestand;
    const sitzung = { bestand: e.raum, rolle: "mitarbeiter", person: e.person, betrieb: 0 };
    expect(wirksameRolle(sitzung, bestand)).toBe("leitung");
  }, LIMIT);

  it("gibt beim zweiten Aufruf keinen zweiten Betrieb", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "zweimal@example.org");
    const erste = await anlegen(s, konto.id);
    expect(erste.ok).toBe(true);

    const zweite = await anlegen(s, konto.id);
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("verbraucht");
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);
    expect((await A.mitgliedschaftenDesAccounts(s, konto.id)).length).toBe(1);
  }, LIMIT);

  it("gibt bei acht gleichzeitigen Aufrufen genau einen Betrieb", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "parallel@example.org");
    const alle = await Promise.all(Array.from({ length: 8 }, () => anlegen(s, konto.id)));
    const gelungen = alle.filter((x) => x.ok);
    expect(gelungen.length).toBe(1);
    /* Die anderen sieben sagen, dass der Anspruch weg ist — keiner legt an. */
    for (const x of alle.filter((y) => !y.ok)) {
      expect(["verbraucht", "belegt", "kein-vorgang"]).toContain(x.grund);
    }
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(1);
    expect((await s.list({ prefix: "raummitglied:" })).blobs.length).toBe(1);
    expect((await s.list({ prefix: "konto:" })).blobs.length).toBe(0);
  }, LIMIT);

  it("gibt zwei Accounts zwei getrennte Betriebe", async () => {
    const s = neuerSpeicher();
    const eins = await fertigerAccount(s, "eins@example.org",
      { ...PROFIL, vorname: "Ada", betriebsname: "Wachdienst Eins" });
    const zwei = await fertigerAccount(s, "zwei@example.org",
      { ...PROFIL, vorname: "Bo", betriebsname: "Wachdienst Zwei" });

    const a = await anlegen(s, eins.id);
    const b = await anlegen(s, zwei.id);
    expect(a.ok && b.ok).toBe(true);
    expect(a.raum).not.toBe(b.raum);
    expect(a.person).not.toBe(b.person);

    /* Jeder sieht nur seinen Betrieb — in beide Richtungen. */
    expect((await A.mitgliedschaftenDesAccounts(s, eins.id)).map((m) => m.raum)).toEqual([a.raum]);
    expect((await A.mitgliedschaftenDesAccounts(s, zwei.id)).map((m) => m.raum)).toEqual([b.raum]);
    expect(await A.mitgliedschaftLesen(s, eins.id, b.raum)).toBe(null);
    expect(await A.mitgliedschaftLesen(s, zwei.id, a.raum)).toBe(null);
    /* Und die Leitungsperson des einen steht nicht im Betrieb des anderen. */
    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    const inB = (await bestandLesen(s, b.raum)).bestand.mandanten[0];
    expect(inB.personen.map((p) => p.id)).toEqual([b.person]);
    expect(inB.personen[0].vorname).toBe("Bo");
  }, LIMIT);

  it("gibt einem eingeladenen Account nach ausdrücklicher Öffnung einen Betrieb", async () => {
    const s = neuerSpeicher();
    /* So sieht ein eingeladener Mensch aus: Account aktiv, kein Vorgang. */
    const konto = (await A.accountAnlegen(s, { email: "spaeter@example.org",
      status: "aktiv", passwort: PW_ABLAGE,
      emailVerifiziertAm: new Date().toISOString(),
      profil: { ...PROFIL, betriebsname: "Eigener Betrieb" } })).account;
    expect((await anlegen(s, konto.id)).grund).toBe("kein-vorgang");

    /* Der ausdrückliche Vorgang — kein Endpunkt, eine Funktion. */
    expect((await A.testbetriebOeffnen(s, konto.id)).ok).toBe(true);
    const e = await anlegen(s, konto.id);
    expect(e.ok, e.grund).toBe(true);
    expect(e.raum).toMatch(/^t-eigener-betrieb-/);
    expect((await A.mitgliedschaftLesen(s, konto.id, e.raum)).rolle).toBe("leitung");
    /* Und danach ist auch sein Anspruch verbraucht. */
    expect((await anlegen(s, konto.id)).grund).toBe("verbraucht");
  }, LIMIT);
});

/* ==========================================================================
   FEHLER UND RÜCKNAHME
   ========================================================================== */

describe("Scheitert etwas, bleibt kein halber Betrieb", () => {
  it("lässt nach einem Fehler beim Bestand nichts zurück", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "bestandfehler@example.org");
    const stur = mitSchreibfehler(s, (k) => k.startsWith("kern:"));

    const e = await P.testbetriebFuerAccountAnlegen(stur, sitzungen,
      { accountId: konto.id });
    expect(e.ok).toBe(false);
    expect(e.grund).toMatch(/bestand/);

    /* Kein Raum, keine Mitgliedschaft — und der Anspruch ist noch offen. */
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(0);
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.testbetriebVerbrauchtAm).toBe(null);
    expect(nach.testbetriebOffenSeit).toBeTruthy();
    expect(nach.testbetriebRaum).toBe(null);

    /* Ein zweiter Versuch gelingt danach. */
    const zweiter = await anlegen(s, konto.id);
    expect(zweiter.ok, zweiter.grund).toBe(true);
  }, LIMIT);

  it("rollt den Raum zurück, wenn die Mitgliedschaft scheitert", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "mitgliedfehler@example.org");
    const vorher = JSON.stringify(await A.accountLesenPerId(s, konto.id));
    const stur = mitSchreibfehler(s, (k) => k.startsWith("mitglied:"));

    const e = await P.testbetriebFuerAccountAnlegen(stur, sitzungen,
      { accountId: konto.id });
    expect(e.ok).toBe(false);
    expect(e.grund).toMatch(/mitgliedschaft/);
    expect(e.rollback).toBeUndefined();

    /* Der Raum ist weg. */
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "bestand:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "raummitglied:" })).blobs.length).toBe(0);

    /* Der Mensch ist unangetastet: Kennung, Passwort, Bestätigung, Status. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.id).toBe(konto.id);
    expect(nach.passwort).toBe(konto.passwort);
    expect(nach.emailVerifiziertAm).toBe(konto.emailVerifiziertAm);
    expect(nach.status).toBe("aktiv");
    expect(await s.get(A.kontoIdSchluessel(konto.id), { type: "json" })).toBeTruthy();
    /* Nur der Vermerk hat sich bewegt — und er steht wieder auf null. */
    expect(nach.testbetriebRaum).toBe(null);
    expect(nach.testbetriebVerbrauchtAm).toBe(null);
    expect(JSON.parse(vorher).testbetriebOffenSeit).toBe(nach.testbetriebOffenSeit);
  }, LIMIT);

  it("rollt den Raum zurück, wenn der Raumindex scheitert", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "indexfehler@example.org");
    const stur = mitSchreibfehler(s, (k) => k.startsWith("raummitglied:"));

    const e = await P.testbetriebFuerAccountAnlegen(stur, sitzungen,
      { accountId: konto.id });
    expect(e.ok).toBe(false);
    /* accounts.mjs nimmt die Mitgliedschaft selbst zurück, wenn ihr Index
       nicht geschrieben werden kann — und wirft. */
    expect(e.grund).toMatch(/mitgliedschaft|raummitglied/);
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);
    expect((await s.list({ prefix: "mitglied:" })).blobs.length).toBe(0);
    expect((await A.accountLesenPerId(s, konto.id)).testbetriebVerbrauchtAm).toBe(null);
  }, LIMIT);

  it("rollt alles zurück, wenn der Verbrauch scheitert", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "verbrauchfehler@example.org");
    /* Der Verbrauch schreibt den Account — genau dieser Schlüssel scheitert.
       Vorher muss die Provisionierung ihn aber vermerken können, sonst
       käme sie nie bis hierher: Deshalb erst nach dem Vermerk sperren. */
    let vermerkt = false;
    const kontoKey = A.accountSchluessel("verbrauchfehler@example.org");
    const stur = new Proxy(s, {
      get(ziel, name) {
        if (name !== "setJSON") return Reflect.get(ziel, name);
        return (key, ...rest) => {
          if (key === kontoKey) {
            if (vermerkt) return Promise.reject(new Error("Platte voll beim Konto"));
            vermerkt = true;
          }
          return ziel.setJSON(key, ...rest);
        };
      },
    });

    const e = await P.testbetriebFuerAccountAnlegen(stur, sitzungen,
      { accountId: konto.id });
    expect(e.ok).toBe(false);
    expect(e.grund).toMatch(/verbrauch/);

    /* Raum, Person, Mitgliedschaft und Index sind wieder weg. */
    for (const praefix of ["kern:", "bestand:", "mitglied:", "raummitglied:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
    /* Der Anspruch bleibt offen — ein abgebrochener Vorgang kostet ihn nicht. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.testbetriebVerbrauchtAm).toBe(null);
    expect(nach.testbetriebOffenSeit).toBeTruthy();
  }, LIMIT);

  it("macht einen fehlgeschlagenen Rollback sichtbar, statt Erfolg zu behaupten", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "rollbackfehler@example.org");
    /* Die Mitgliedschaft scheitert — und der Kern lässt sich nicht löschen. */
    const kaputt = mitLoeschfehler(
      mitSchreibfehler(s, (k) => k.startsWith("mitglied:")),
      (k) => k.startsWith("kern:"));

    const e = await P.testbetriebFuerAccountAnlegen(kaputt, sitzungen,
      { accountId: konto.id });
    expect(e.ok).toBe(false);
    expect(e.grund).toMatch(/mitgliedschaft/);
    /* Kein stilles „alles gut": Der Rollbackfehler steht im Ergebnis. */
    expect(typeof e.rollback).toBe("string");
    expect(e.rollback).toMatch(/kern:/);

    /* Der Raum steht noch — und der Vermerk auch, damit der nächste Versuch
       ihn wiederfindet. */
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.testbetriebRaum).toBeTruthy();
    expect(nach.testbetriebVerbrauchtAm).toBe(null);
  }, LIMIT);

  it("legt nach einem fehlgeschlagenen Rollback keinen zweiten Raum an", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "keinzweiter@example.org");
    const kaputt = mitLoeschfehler(
      mitSchreibfehler(s, (k) => k.startsWith("mitglied:")),
      (k) => k.startsWith("kern:"));
    const erste = await P.testbetriebFuerAccountAnlegen(kaputt, sitzungen,
      { accountId: konto.id });
    expect(erste.ok).toBe(false);
    const liegen = (await s.list({ prefix: "kern:" })).blobs.map((b) => b.key);
    expect(liegen.length).toBe(1);

    /* Der nächste Versuch findet den Vorgang über den Vermerk wieder: Er
       räumt ihn ab, statt einen zweiten Raum anzulegen. */
    const zweite = await anlegen(s, konto.id);
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("vorgang-unvollstaendig");
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);

    /* Und danach beginnt ein Versuch sauber neu. */
    const dritte = await anlegen(s, konto.id);
    expect(dritte.ok, dritte.grund).toBe(true);
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);
  }, LIMIT);

  it("zieht einen fehlenden Verbrauch bei der Wiederaufnahme nach", async () => {
    /* Der andere Ausgang derselben Lage: Raum, Person, Mitgliedschaft und
       Index stehen vollständig, nur der Verbrauch fehlt. Dann wird der
       Vorgang zu Ende gebracht — nicht abgeräumt. */
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "nachziehen@example.org");
    const e = await anlegen(s, konto.id);
    expect(e.ok).toBe(true);
    /* Den Verbrauch künstlich zurücknehmen — so sähe ein Abbruch genau vor
       dem letzten Schritt aus. */
    await A.accountAendern(s, konto.id,
      { testbetriebVerbrauchtAm: null, testbetriebOffenSeit: new Date().toISOString() });

    const wieder = await anlegen(s, konto.id);
    expect(wieder.ok, wieder.grund).toBe(true);
    expect(wieder.wiederaufgenommen).toBe(true);
    expect(wieder.raum).toBe(e.raum);
    /* Kein zweiter Raum, und der Verbrauch steht jetzt. */
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(1);
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach.testbetriebVerbrauchtAm).toBeTruthy();
    expect(nach.testbetriebOffenSeit).toBe(null);
  }, LIMIT);

  it("räumt einen Vermerk ab, dessen Raum nie entstand", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "geist@example.org");
    await A.accountAendern(s, konto.id, { testbetriebRaum: "t-nie-entstanden-abcde" });
    const e = await anlegen(s, konto.id);
    expect(e.ok, e.grund).toBe(true);
    expect(e.raum).not.toBe("t-nie-entstanden-abcde");
    expect((await A.accountLesenPerId(s, konto.id)).testbetriebRaum).toBe(e.raum);
  }, LIMIT);
});

/* ==========================================================================
   DER LEBENSZYKLUS
   ========================================================================== */

describe("Ein Account-Testbetrieb im Löschlauf", () => {
  it("bleibt vor Testende und innerhalb der Aufbewahrung stehen", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "frist@example.org");
    const e = await anlegen(s, konto.id);
    const kern = await s.get(`kern:${e.raum}`, { type: "json" });
    const ablauf = new Date(e.laeuftAb).getTime();
    const kerne = [{ raum: e.raum, kern }];

    /* Ohne einen einzigen Zugangscode — genau der Fall, für den die dritte
       Bestätigung in aufraeumen.mjs gebaut wurde. */
    expect((await s.list({ prefix: "konto:" })).blobs.length).toBe(0);
    const o = { konten: [] };
    expect(aufraeumen.zuLoeschendeTestraeume(kerne, ablauf - TAG, o)).toEqual([]);
    expect(aufraeumen.zuLoeschendeTestraeume(kerne, ablauf + TAG, o)).toEqual([]);
    expect(aufraeumen.zuLoeschendeTestraeume(kerne, ablauf + 89 * TAG, o)).toEqual([]);
    expect(aufraeumen.zuLoeschendeTestraeume(kerne, ablauf + 90 * TAG, o)).toEqual([e.raum]);
  }, LIMIT);

  it("wird nach 30 plus 90 Tagen gelöscht — der Mensch bleibt", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "zyklus@example.org");
    const e = await anlegen(s, konto.id);
    const ablauf = new Date(e.laeuftAb).getTime();

    /* Der echte Lauf, mit eingespeister Zeit. */
    const v = await aufraeumen.testbetriebeAufraeumen(s, sitzungen,
      { jetzt: ablauf + 90 * TAG });
    expect(v.geloescht).toContain(e.raum);
    expect(v.fehler.filter((f) => f.raum === e.raum)).toEqual([]);

    /* Raum, Mitgliedschaft und Index sind weg. */
    for (const praefix of ["kern:", "bestand:", "mitglied:", "raummitglied:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
    expect(await A.mitgliedschaftLesen(s, konto.id, e.raum)).toBe(null);

    /* Der Mensch bleibt — mit Kennung, Adresse, Passwort und Verbrauch. */
    const nach = await A.accountLesenPerId(s, konto.id);
    expect(nach).not.toBe(null);
    expect(nach.passwort).toBe(konto.passwort);
    expect(await s.get(A.kontoIdSchluessel(konto.id), { type: "json" })).toBeTruthy();
    expect(nach.testbetriebVerbrauchtAm).toBeTruthy();

    /* Und er bekommt keinen zweiten kostenlosen Betrieb. */
    const wieder = await anlegen(s, konto.id);
    expect(wieder.ok).toBe(false);
    expect(wieder.grund).toBe("verbraucht");
    expect((await s.list({ prefix: "kern:" })).blobs.length).toBe(0);
  }, LIMIT);

  it("lässt einen fremden Account-Testbetrieb beim Löschen unberührt", async () => {
    const s = neuerSpeicher();
    const eins = await fertigerAccount(s, "loeschA@example.org",
      { ...PROFIL, betriebsname: "Betrieb Alpha" });
    const zwei = await fertigerAccount(s, "loeschB@example.org",
      { ...PROFIL, betriebsname: "Betrieb Beta" });
    const a = await anlegen(s, eins.id);
    const b = await anlegen(s, zwei.id);

    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    expect((await raumLoeschen(s, sitzungen, a.raum)).vollstaendig).toBe(true);

    expect(await A.mitgliedschaftLesen(s, eins.id, a.raum)).toBe(null);
    expect((await A.mitgliedschaftLesen(s, zwei.id, b.raum)).rolle).toBe("leitung");
    expect((await A.accountLesenPerId(s, eins.id)).testbetriebVerbrauchtAm).toBeTruthy();
    expect((await A.accountLesenPerId(s, zwei.id)).testbetriebVerbrauchtAm).toBeTruthy();
  }, LIMIT);
});

/* ==========================================================================
   DER GEMEINSAME KERN UND DIE GRENZEN
   ========================================================================== */

describe("Der gemeinsame Kern", () => {
  it("baut für den Legacy-Weg weiterhin einen Betrieb ohne Person", async () => {
    const s = neuerSpeicher();
    const e = await P.testbetriebAnlegen(s, { name: "Ohne Person",
      branche: "pflege", email: "a@b.de", land: "BY", durch: "Selbststart" });
    expect(e.ok).toBe(true);
    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    const m = (await bestandLesen(s, e.raum)).bestand.mandanten[0];
    expect(m.personen).toEqual([]);
    expect(m.branche).toBe("pflege");
    expect(m.bundesland).toBe("BY");
    expect(e.betrieb).toBe(0);
    expect(e.mandantId).toBe(e.raum);
  });

  it("überschreibt einen belegten Raum nicht", async () => {
    const s = neuerSpeicher();
    const erste = await P.testbetriebAnlegen(s, { name: "Belegt", branche: "sonstige" });
    expect(erste.ok).toBe(true);
    /* Dieselbe Kennung ein zweites Mal: abgewiesen, nicht überschrieben. */
    const zweite = await P.testbetriebAnlegen(s, { name: "Belegt", branche: "sonstige",
      raum: erste.raum });
    expect(zweite.ok).toBe(false);
    expect(zweite.grund).toBe("belegt");
    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    expect((await bestandLesen(s, erste.raum)).bestand.mandanten[0].name).toBe("Belegt");
  });

  it("erzeugt Raumkennungen, die nicht aus Adresse oder Kennung stammen", async () => {
    const s = neuerSpeicher();
    const konto = await fertigerAccount(s, "kennung@example.org");
    const e = await anlegen(s, konto.id);
    expect(e.raum).not.toContain("kennung");
    expect(e.raum).not.toContain(konto.id.slice(2, 10));
    expect(e.raum).not.toContain("rina");
    expect(e.raum).not.toContain("schmitt");
    /* Zwei Betriebe gleichen Namens bekommen verschiedene Kennungen. */
    const a = P.raumKennung("Gleicher Name");
    const b = P.raumKennung("Gleicher Name");
    expect(a).not.toBe(b);
    expect(a.slice(0, -5)).toBe(b.slice(0, -5));
  });

  it("kennt keine HTTP-Schicht und keine Sitzung", async () => {
    const { readFile } = await import("node:fs/promises");
    const quelle = await readFile(
      new URL("../server/lib/provisionierung.mjs", import.meta.url), "utf8");
    for (const muster of [/from\s+["']node:http["']/, /new Response\(/,
      /from\s+["'][^"']*sitzungen\.mjs["']/, /sitzungAnlegen/, /kontoSchreiben/,
      /ablageSchluessel/]) {
      expect(muster.test(quelle), String(muster)).toBe(false);
    }
    expect(quelle).not.toMatch(/\bconsole\s*\./);
  });

  it("wird von keinem öffentlichen Endpunkt für den Accountweg aufgerufen", async () => {
    const { readFile } = await import("node:fs/promises");
    /* Erlaubt ist genau eine Produktionsnutzung: der Legacy-Selbststart mit
       der gemeinsamen Betriebserstellung. */
    const legacy = await readFile(
      new URL("../server/funktionen/starten.mjs", import.meta.url), "utf8");
    expect(legacy).toContain("testbetriebAnlegen");
    expect(legacy).not.toContain("testbetriebFuerAccountAnlegen");

    for (const d of ["../server.mjs", "../server/funktionen/daten.mjs",
      "../server/funktionen/zustellung.mjs"]) {
      const text = await readFile(new URL(d, import.meta.url), "utf8");
      expect(text, d).not.toContain("provisionierung.mjs");
      expect(text, d).not.toContain("testbetriebFuerAccountAnlegen");
    }
  });
});
