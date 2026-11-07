/* ==========================================================================
   SI-P1 — Der Sicherungsschlüssel überlebt seinen Ersteller nicht

   Befund P1 (interne Sicherheitsprüfung 2026-11, docs/acc45/SICHERHEIT-INTERN-2026-11.md):
   Ein Schlüssel `sk:` gilt bis zu 365 Tage für GET /api/vollausgabe, also für den
   ganzen Betrieb samt Personalakten, und war nur an den Betrieb gebunden. Sperre,
   Entzug der Mitgliedschaft und Herabstufung ließen ihn bestehen: Wer als Leitung
   ausschied, konnte ein Jahr lang weiter exportieren.

   Jetzt trägt der Schlüssel seinen Ersteller (Konto oder Zugangscode). Bei jedem
   Lesen wird geprüft, ob der Ersteller noch das ist, was er beim Anlegen war:
   die Leitung dieses Betriebs.

   Gearbeitet wird wie im Betrieb (hilfen/szenario.mjs): Schlüssel anlegen über
   POST /api/sicherungsschluessel, benutzen über GET /api/vollausgabe.
   Nichts hier setzt eine bestimmte Umsetzung voraus; „widerrufen" heißt:
   die Vollausgabe antwortet mit 401, wie bei jedem abgelaufenen Schlüssel.

   Aufruf: npx vitest run pruefungen/sicherungsschluessel-ersteller.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { aufbauen, hash } from "./hilfen/szenario.mjs";

const LIMIT = 60000;
let Z;

beforeAll(async () => { Z = await aufbauen("skersteller"); }, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });

const anlegen = (token, tage = 30) => Z.bearer(Z.daten, "/api/sicherungsschluessel", token, { methode: "POST", rumpf: { tage } });
const liste = (token) => Z.bearer(Z.daten, "/api/sicherungsschluessel", token);
const vollausgabe = (roh) => Z.bearer(Z.daten, "/api/vollausgabe", roh);

/** Konto mit Leitung in einem frischen Betrieb, dazu ein angelegter Schlüssel. */
async function kontoMitSchluessel(was) {
  const b = await Z.arbeitsbereich(was);
  const a = await anlegen(b.token);
  expect(a.status, JSON.stringify(a.daten)).toBe(200);
  expect(a.daten.schluessel).toBeTruthy();
  return { ...b, sk: a.daten.schluessel };
}

/** Ein Zugangscode „leitung" (ohne Person) mit Sitzung, im Raum eines Kontos. */
async function codeLeitung(raum, { person = null } = {}) {
  const konto = await Z.zugangskonto(raum, { rolle: "leitung", person });
  const s = await Z.legacySitzung(raum, { rolle: "leitung", person, konto });
  return { konto, token: s.token };
}

/** Eine Person im Bestand umstellen (Herabstufung, Entfernung). */
async function bestandAendern(raum, aendern) {
  const g = await Z.B.bestandLesen(Z.laden(), raum);
  const neu = JSON.parse(JSON.stringify(g.bestand));
  aendern(neu);
  const e = await Z.B.bestandSchreiben(Z.laden(), raum, neu, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

describe("SI-P1: Schlüssel eines Kontos", () => {
  it("gilt nach dem Anlegen, und er trägt seinen Ersteller", async () => {
    const b = await kontoMitSchluessel("sk-gilt");
    const v = await vollausgabe(b.sk);
    expect(v.status, JSON.stringify(v.daten)).toBe(200);
    const roh = await Z.ablageArbeit().get(`sk:${hash(b.sk)}`, { type: "json" });
    expect(roh.ersteller, "Ersteller im Datensatz").toBeTruthy();
    expect(roh.ersteller.art).toBe("konto");
    expect(roh.ersteller.accountId).toBe(b.k.id);
  }, LIMIT);

  it("überlebt das Abmelden des Erstellers (Sicherungsskripte laufen ohne ihn weiter)", async () => {
    const b = await kontoMitSchluessel("sk-logout");
    expect((await Z.abmelden(b.keks)).status).toBe(200);
    expect((await vollausgabe(b.sk)).status).toBe(200);
  }, LIMIT);

  const URSACHEN = [
    { name: "Entzug der Mitgliedschaft", wirke: (Zz, b) => Zz.A.mitgliedschaftEntziehen(Zz.laden(), b.k.id, b.raum) },
    { name: "Sperre des Kontos", wirke: (Zz, b) => Zz.A.accountSperren(Zz.laden(), b.k.id) },
    { name: "Epochenwechsel (Passwort zurückgesetzt, alle Sitzungen entwertet)", wirke: (Zz, b) => Zz.A.epocheErhoehen(Zz.laden(), b.k.id) },
    { name: "Herabstufung zum Mitarbeiter", wirke: (Zz, b) => bestandAendern(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; }) },
    { name: "Entfernen der Person aus dem Betrieb", wirke: (Zz, b) => bestandAendern(b.raum, (n) => { n.mandanten[0].personen = n.mandanten[0].personen.filter((p) => p.id !== "p_1"); }) },
  ];
  it.each(URSACHEN)("widerruft den Schlüssel: $name", async (ursache) => {
    const b = await kontoMitSchluessel("sk-ursache");
    expect((await vollausgabe(b.sk)).status, "vorher").toBe(200);
    await ursache.wirke(Z, b);
    const v = await vollausgabe(b.sk);
    expect(v.status, `nach „${ursache.name}": ${JSON.stringify(v.daten)}`).toBe(401);
  }, LIMIT);

  it("widerruft alle Schlüssel des Erstellers, nicht nur den letzten", async () => {
    const b = await kontoMitSchluessel("sk-alle");
    const zweiter = (await anlegen(b.token, 90)).daten.schluessel;
    await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);
    expect((await vollausgabe(b.sk)).status).toBe(401);
    expect((await vollausgabe(zweiter)).status).toBe(401);
  }, LIMIT);

  it("der Entzug eines anderen Kontos berührt den Schlüssel nicht", async () => {
    const a = await kontoMitSchluessel("sk-a");
    const b = await kontoMitSchluessel("sk-b");
    await Z.A.mitgliedschaftEntziehen(Z.laden(), a.k.id, a.raum);
    expect((await vollausgabe(a.sk)).status).toBe(401);
    expect((await vollausgabe(b.sk)).status, "Schlüssel eines anderen Betriebs").toBe(200);
  }, LIMIT);
});

describe("SI-P1: Schlüssel eines Zugangscodes", () => {
  async function codeMitSchluessel(was) {
    const b = await Z.arbeitsbereich(was);      // Raum und Betrieb; der Code liegt im selben Raum
    const c = await codeLeitung(b.raum);
    const a = await anlegen(c.token);
    expect(a.status, JSON.stringify(a.daten)).toBe(200);
    return { ...b, code: c, sk: a.daten.schluessel };
  }

  it("gilt nach dem Anlegen, und er trägt seinen Ersteller", async () => {
    const b = await codeMitSchluessel("skc-gilt");
    expect((await vollausgabe(b.sk)).status).toBe(200);
    const roh = await Z.ablageArbeit().get(`sk:${hash(b.sk)}`, { type: "json" });
    expect(roh.ersteller.art).toBe("code");
    expect(roh.ersteller.konto).toBe(b.code.konto);
  }, LIMIT);

  it("widerruft den Schlüssel, wenn der Zugang gesperrt wird", async () => {
    const b = await codeMitSchluessel("skc-sperre");
    const k = await Z.K.kontoLesen(Z.laden(), b.code.konto);
    await Z.K.kontoSchreiben(Z.laden(), b.code.konto, { ...k, gesperrt: new Date().toISOString() });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("widerruft den Schlüssel, wenn der Zugang gar nicht mehr existiert", async () => {
    const b = await codeMitSchluessel("skc-weg");
    await Z.laden().delete(`konto:${b.code.konto}`);
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("widerruft den Schlüssel, wenn die Rolle des Zugangs herabgesetzt wird", async () => {
    const b = await codeMitSchluessel("skc-rolle");
    const k = await Z.K.kontoLesen(Z.laden(), b.code.konto);
    await Z.K.kontoSchreiben(Z.laden(), b.code.konto, { ...k, rolle: "mitarbeiter" });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Code mit Person: die Herabstufung der Person im Betrieb widerruft den Schlüssel", async () => {
    const b = await Z.arbeitsbereich("skc-person");
    const c = await codeLeitung(b.raum, { person: "p_1" });
    const sk = (await anlegen(c.token)).daten.schluessel;
    expect((await vollausgabe(sk)).status, "vorher").toBe(200);
    await bestandAendern(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; });
    expect((await vollausgabe(sk)).status).toBe(401);
  }, LIMIT);

  it("Sperre eines anderen Zugangs berührt den Schlüssel nicht", async () => {
    const b = await codeMitSchluessel("skc-andere");
    const anderer = await Z.zugangskonto(b.raum, { rolle: "leitung", person: null });
    const k = await Z.K.kontoLesen(Z.laden(), anderer);
    await Z.K.kontoSchreiben(Z.laden(), anderer, { ...k, gesperrt: new Date().toISOString() });
    expect((await vollausgabe(b.sk)).status).toBe(200);
  }, LIMIT);
});

describe("SI-P1: Altschlüssel und Randfälle", () => {
  it("ein Schlüssel ohne Ersteller (aus der Zeit vor dieser Änderung) gilt nicht mehr: nicht prüfbar heißt nein", async () => {
    const b = await Z.arbeitsbereich("sk-alt");
    const roh = "alter-sicherungsschluessel-ohne-ersteller-0123456789";
    await Z.ablageArbeit().setJSON(`sk:${hash(roh)}`, {
      bestand: b.raum, rolle: "leitung", nurSicherung: true, betrieb: 0, mandantId: "m1",
      name: "Sicherungsschlüssel (Leitung)", angelegt: new Date().toISOString(), bis: Date.now() + 24 * 3600 * 1000,
    });
    expect((await vollausgabe(roh)).status).toBe(401);
  }, LIMIT);

  it("ein Schlüssel mit unbrauchbarem Ersteller gilt nicht (Art fehlt, Art unbekannt, Felder leer)", async () => {
    const b = await Z.arbeitsbereich("sk-kaputt");
    const basis = { bestand: b.raum, rolle: "leitung", nurSicherung: true, betrieb: 0, mandantId: "m1",
      name: "Sicherungsschlüssel (Leitung)", angelegt: new Date().toISOString(), bis: Date.now() + 24 * 3600 * 1000 };
    const faelle = [{}, { art: "wolke" }, { art: "konto" }, { art: "konto", accountId: "", epoche: 1, generation: 1, person: "p_1" },
      { art: "code" }, { art: "code", konto: "" }, "text", null, []];
    for (const [i, ersteller] of faelle.entries()) {
      const roh = `kaputter-ersteller-${i}-0123456789abcdef`;
      await Z.ablageArbeit().setJSON(`sk:${hash(roh)}`, { ...basis, ersteller });
      expect((await vollausgabe(roh)).status, JSON.stringify(ersteller)).toBe(401);
    }
  }, LIMIT);

  it("ein Betreiber legt keinen Schlüssel an (unverändert)", async () => {
    const s = await Z.S.sitzungAnlegen({ bestand: Z.raum("sk-betreiber"), rolle: "betreiber", person: null, betrieb: 0, name: "Betreiber" });
    expect((await anlegen(s.token)).status).toBe(403);
  }, LIMIT);

  it("eine Leitungssitzung ohne erkennbaren Ersteller (weder Konto noch Zugang) legt keinen Schlüssel an", async () => {
    const b = await Z.arbeitsbereich("sk-ohne");
    const s = await Z.S.sitzungAnlegen({ bestand: b.raum, rolle: "leitung", person: null, betrieb: 0, name: "Unbekannt" });
    const a = await anlegen(s.token);
    expect(a.status, JSON.stringify(a.daten)).not.toBe(200);
    expect(a.daten && a.daten.schluessel).toBeFalsy();
  }, LIMIT);
});

describe("SI-P1: Liste", () => {
  it("zeigt den Ersteller und markiert einen Schlüssel, dessen Ersteller nicht mehr gilt", async () => {
    const b = await kontoMitSchluessel("sk-liste");
    const c = await codeLeitung(b.raum);      // eine zweite Leitung (Code ohne Person) im selben Betrieb
    const vorher = await liste(c.token);
    expect(vorher.status, JSON.stringify(vorher.daten)).toBe(200);
    expect(vorher.daten.schluessel).toHaveLength(1);
    expect(vorher.daten.schluessel[0].ersteller).toBeTruthy();
    expect(vorher.daten.schluessel[0].verwaist).toBe(false);
    expect(JSON.stringify(vorher.daten), "kein Klartext, kein Hashwert in der Liste").not.toContain(b.sk);

    await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);
    const nachher = await liste(c.token);
    expect(nachher.daten.schluessel[0].verwaist, "Ersteller nicht mehr gültig").toBe(true);
  }, LIMIT);

  it("der Widerruf per DELETE funktioniert weiter", async () => {
    const b = await kontoMitSchluessel("sk-delete");
    const l = await liste(b.token);
    const kennung = l.daten.schluessel[0].kennung;
    const d = await Z.bearer(Z.daten, "/api/sicherungsschluessel", b.token, { methode: "DELETE", rumpf: { kennung } });
    expect(d.status).toBe(200);
    expect(d.daten.widerrufen).toBe(1);
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);
});
