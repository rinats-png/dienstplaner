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

let AS;

const LIMIT = 60000;
let Z;

beforeAll(async () => {
  Z = await aufbauen("skersteller");
  AS = await import("../server/lib/arbeitssitzung.mjs");
}, LIMIT);
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

/* ==========================================================================
   Nachtrag aus dem unabhängigen Review (Befunde 1–6 und überlebende Mutanten)
   ========================================================================== */

/** Die Ablage mit gezielten Störungen: "wirft" (Lesefehler) oder "leer" (gibt es nicht). */
const mitStoerung = (regel) => new Proxy(Z.laden(), {
  get(ziel, name) {
    const wert = ziel[name];
    if (typeof wert !== "function") return wert;
    return (...a) => {
      const r = regel(String(name), String(a[0]));
      if (r === "wirft") return Promise.reject(Object.assign(new Error("EIO: gestört"), { code: "EIO" }));
      if (r === "leer") return Promise.resolve(null);
      return wert.apply(ziel, a);
    };
  },
});
const satz = (roh) => Z.ablageArbeit().get(`sk:${hash(roh)}`, { type: "json" });

describe("Review-Befund 1: ein widerrufener Schlüssel lebt nicht wieder auf", () => {
  it("Konto gesperrt, später wieder aktiviert: der Schlüssel bleibt tot und der Datensatz ist entfernt", async () => {
    const b = await kontoMitSchluessel("sk-wieder-konto");
    await Z.A.accountSperren(Z.laden(), b.k.id);
    expect((await vollausgabe(b.sk)).status).toBe(401);
    expect(await satz(b.sk), "Datensatz nach der eindeutigen Absage entfernt").toBeNull();
    await Z.A.accountAendern(Z.laden(), b.k.id, { status: "aktiv" });
    expect((await vollausgabe(b.sk)).status, "nach der Entsperrung").toBe(401);
  }, LIMIT);

  it("Person herabgestuft und wieder zur Leitung gemacht (etwa durch eine zurückgespielte Sicherung): der Schlüssel bleibt tot", async () => {
    const b = await kontoMitSchluessel("sk-wieder-rolle");
    await bestandAendern(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; });
    expect((await vollausgabe(b.sk)).status).toBe(401);
    await bestandAendern(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "leitung"; });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Person entfernt und mit derselben Kennung wieder eingetragen: der Schlüssel bleibt tot", async () => {
    const b = await kontoMitSchluessel("sk-wieder-person");
    let alt;
    await bestandAendern(b.raum, (n) => { alt = n.mandanten[0].personen.find((p) => p.id === "p_1"); n.mandanten[0].personen = n.mandanten[0].personen.filter((p) => p.id !== "p_1"); });
    expect((await vollausgabe(b.sk)).status).toBe(401);
    await bestandAendern(b.raum, (n) => { n.mandanten[0].personen.push(alt); });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Zugang gesperrt und wieder entsperrt: der Schlüssel bleibt tot", async () => {
    const b = await Z.arbeitsbereich("sk-wieder-code");
    const c = await codeLeitung(b.raum);
    const sk = (await anlegen(c.token)).daten.schluessel;
    const k = await Z.K.kontoLesen(Z.laden(), c.konto);
    await Z.K.kontoSchreiben(Z.laden(), c.konto, { ...k, gesperrt: new Date().toISOString() });
    expect((await vollausgabe(sk)).status).toBe(401);
    await Z.K.kontoSchreiben(Z.laden(), c.konto, { ...k });
    expect((await vollausgabe(sk)).status).toBe(401);
  }, LIMIT);

  it("ein Lesefehler ist keine Absage: der Schlüssel bleibt liegen und gilt wieder, sobald die Ablage antwortet", async () => {
    const b = await kontoMitSchluessel("sk-lesefehler");
    const sk = await satz(b.sk);
    const kaputt = await AS.sicherungsschluesselPruefen(mitStoerung((m, k) => (k.startsWith("mitglied:") ? "wirft" : null)), sk);
    expect(kaputt.ok).toBe(false);
    expect(kaputt.endgueltig, "Lesefehler: nicht endgültig").toBe(false);
    const lauf = await AS.sicherungsschluesselPruefen(mitStoerung((m, k) => (k.startsWith("mitgliedlauf:") ? "wirft" : null)), sk);
    expect(lauf.ok).toBe(false);
    expect(lauf.endgueltig).toBe(false);
    expect((await vollausgabe(b.sk)).status, "ohne Störung").toBe(200);
  }, LIMIT);

  it("ein fehlender Mitgliedslauf ist eine endgültige Absage; ein fehlendes Konto oder eine fehlende Mitgliedschaft nicht (von einem Lesefehler nicht zu trennen)", async () => {
    const b = await kontoMitSchluessel("sk-lauf-fehlt");
    const sk = await satz(b.sk);
    const ohneLauf = await AS.sicherungsschluesselPruefen(mitStoerung((m, k) => (k.startsWith("mitgliedlauf:") ? "leer" : null)), sk);
    expect(ohneLauf).toMatchObject({ ok: false, endgueltig: true, grund: "sk-lauf" });
    const ohneKonto = await AS.sicherungsschluesselPruefen(mitStoerung((m, k) => (/^(account|kontoId):/.test(k) ? "leer" : null)), sk);
    expect(ohneKonto).toMatchObject({ ok: false, endgueltig: false, grund: "sk-account-fehlt" });
    const ohneMitglied = await AS.sicherungsschluesselPruefen(mitStoerung((m, k) => (k.startsWith("mitglied:") ? "leer" : null)), sk);
    expect(ohneMitglied).toMatchObject({ ok: false, endgueltig: false, grund: "sk-mitglied-fehlt" });
  }, LIMIT);

  it("die Liste schreibt nichts: ein verwaister Schlüssel bleibt dort sichtbar, bis er benutzt oder gelöscht wird", async () => {
    const b = await kontoMitSchluessel("sk-liste-liest");
    const c = await codeLeitung(b.raum);
    await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);
    expect((await liste(c.token)).daten.schluessel[0].verwaist).toBe(true);
    expect(await satz(b.sk), "Liste hat nichts entfernt").not.toBeNull();
    expect((await vollausgabe(b.sk)).status).toBe(401);
    expect(await satz(b.sk), "Benutzen entfernt ihn").toBeNull();
  }, LIMIT);
});

describe("Review-Befunde 2–6", () => {
  async function codeMitSchluessel(was, eintragAendern = null) {
    const b = await Z.arbeitsbereich(was);
    const c = await codeLeitung(b.raum);
    const sk = (await anlegen(c.token)).daten.schluessel;
    return { ...b, code: c, sk };
  }
  const zugangAendern = async (schluessel, aendern) => {
    const k = await Z.K.kontoLesen(Z.laden(), schluessel);
    await Z.K.kontoSchreiben(Z.laden(), schluessel, aendern(k));
  };

  it("Befund 2: ein abgelaufener Testzeitraum des Zugangs beendet den Schlüssel", async () => {
    const b = await codeMitSchluessel("skc-ablauf");
    await zugangAendern(b.code.konto, (k) => ({ ...k, laeuftAb: new Date(Date.now() - 86400000).toISOString() }));
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Befund 2: ein noch laufender Testzeitraum stört nicht", async () => {
    const b = await codeMitSchluessel("skc-ablauf-ok");
    await zugangAendern(b.code.konto, (k) => ({ ...k, laeuftAb: new Date(Date.now() + 86400000).toISOString() }));
    expect((await vollausgabe(b.sk)).status).toBe(200);
  }, LIMIT);

  it("ein Demozugang ist keine Leitung für Schlüssel", async () => {
    const b = await codeMitSchluessel("skc-demo");
    await zugangAendern(b.code.konto, (k) => ({ ...k, demo: true }));
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Befund 3: die Kette der Ersetzungen wird verfolgt (A → B → C, nur C gesperrt)", async () => {
    const b = await codeMitSchluessel("skc-kette");
    const B = await Z.zugangskonto(b.raum, { rolle: "leitung", person: null });
    const C = await Z.zugangskonto(b.raum, { rolle: "leitung", person: null });
    await zugangAendern(b.code.konto, (k) => ({ ...k, ersetztDurch: B }));
    await zugangAendern(B, (k) => ({ ...k, ersetztDurch: C }));
    expect((await vollausgabe(b.sk)).status, "Kette ungesperrt").toBe(200);
    await zugangAendern(C, (k) => ({ ...k, gesperrt: new Date().toISOString() }));
    expect((await vollausgabe(b.sk)).status, "Ende der Kette gesperrt").toBe(401);
  }, LIMIT);

  it("Befund 3: ein Zyklus hängt nicht und sperrt nicht; ein fehlendes Kettenglied gilt als gesperrt; zu lange Ketten gelten nicht", async () => {
    const b = await codeMitSchluessel("skc-zyklus");
    await zugangAendern(b.code.konto, (k) => ({ ...k, ersetztDurch: b.code.konto }));
    expect((await vollausgabe(b.sk)).status, "Selbstverweis").toBe(200);
    await zugangAendern(b.code.konto, (k) => ({ ...k, ersetztDurch: "gibt-es-nicht-0123456789" }));
    expect((await vollausgabe(b.sk)).status, "Kettenglied fehlt").toBe(401);

    const b2 = await codeMitSchluessel("skc-lang");
    let vorher = b2.code.konto;
    for (let i = 0; i < 7; i++) {
      const naechster = await Z.zugangskonto(b2.raum, { rolle: "leitung", person: null });
      await zugangAendern(vorher, (k) => ({ ...k, ersetztDurch: naechster }));
      vorher = naechster;
    }
    expect((await vollausgabe(b2.sk)).status, "Kette länger als fünf").toBe(401);
  }, LIMIT);

  it("Befund 4: bei einem Lesefehler am Einzelkonto gilt der ungesperrte Sammelblob nicht als Ersatz", async () => {
    const b = await codeMitSchluessel("skc-sammel");
    const sk = await satz(b.sk);
    const k = await Z.K.kontoLesen(Z.laden(), b.code.konto);
    // Einzelkonto gesperrt; im Sammelblob steht noch die ungesperrte Fassung (Altbestand).
    await Z.K.kontoSchreiben(Z.laden(), b.code.konto, { ...k, gesperrt: new Date().toISOString() });
    await Z.laden().setJSON("konten", { [b.code.konto]: { ...k } });
    const normal = await AS.sicherungsschluesselPruefen(Z.laden(), sk);
    expect(normal).toMatchObject({ ok: false, grund: "sk-zugang-gesperrt" });
    const gestoert = await AS.sicherungsschluesselPruefen(mitStoerung((m, key) => (key === `konto:${b.code.konto}` ? "wirft" : null)), sk);
    expect(gestoert.ok, "fail-open bei Lesefehler").toBe(false);
    expect(gestoert.endgueltig).toBe(false);
    await Z.laden().delete("konten");
  }, LIMIT);

  it("Befund 5: ein Zugang ohne Betriebskennung bleibt an seinen Betriebsindex gebunden", async () => {
    const raum = Z.raum("skc-index");
    const e = await Z.B.bestandSchreiben(Z.laden(), raum, { version: 5, mandanten: [
      { id: "m1", name: "Haus Eins", einheiten: [{ id: "e1", name: "WB" }], personen: [] },
      { id: "m2", name: "Haus Zwei", einheiten: [{ id: "e2", name: "WB" }], personen: [] }] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    const konto = await Z.zugangskonto(raum, { rolle: "leitung", person: null });
    await zugangAendern(konto, (k) => ({ ...k, betrieb: 1 }));
    const s = await Z.S.sitzungAnlegen({ bestand: raum, rolle: "leitung", person: null, betrieb: 1, konto, name: "Leitung Haus Zwei" });
    const a = await anlegen(s.token);
    expect(a.status, JSON.stringify(a.daten)).toBe(200);
    expect((await vollausgabe(a.daten.schluessel)).daten.mandantId).toBe("m2");
    await zugangAendern(konto, (k) => ({ ...k, betrieb: 0 }));
    expect((await vollausgabe(a.daten.schluessel)).status).toBe(401);
  }, LIMIT);

  it("Befund 6: ein Planungszugang, dessen Person im Betrieb Leitung ist, bekommt gar keinen Schlüssel", async () => {
    const b = await Z.arbeitsbereich("skc-planer");
    const konto = await Z.zugangskonto(b.raum, { rolle: "planer", person: "p_1" });
    const s = await Z.legacySitzung(b.raum, { rolle: "planer", person: "p_1", konto });
    const a = await anlegen(s.token);
    expect(a.status, JSON.stringify(a.daten)).toBe(403);
    expect(a.daten.schluessel).toBeFalsy();
    const { blobs } = await Z.ablageArbeit().list({ prefix: "sk:" });
    for (const k of blobs) {
      const roh = await Z.ablageArbeit().get(k.key, { type: "json" });
      expect(roh.ersteller && roh.ersteller.konto, "kein Datensatz für diesen Zugang").not.toBe(konto);
    }
  }, LIMIT);

  it("ein Passwortwechsel des Kontos beendet seine Schlüssel (Epoche; bewusst, siehe Nachweis)", async () => {
    const b = await kontoMitSchluessel("sk-passwort");
    const g = await Z.A.passwortSetzen(Z.laden(), b.k.id, await Z.P.passwortAblegen("Ein ganz neues Passwort 2026"));
    expect(g.ok).toBe(true);
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);
});

describe("Überlebende Mutanten: weitere Ersteller und Verschiebungen", () => {
  it("ein Konto mit einer anderen Person als p_1: Herabstufung dieser Person beendet nur ihre Schlüssel", async () => {
    const a = await kontoMitSchluessel("sk-p3");
    await bestandAendern(a.raum, (n) => {
      const kopie = JSON.parse(JSON.stringify(n.mandanten[0].personen.find((p) => p.id === "p_1")));
      n.mandanten[0].personen.push({ ...kopie, id: "p_3", vorname: "Mia", nachname: "Koch" });
    });
    const k2 = await Z.kontoAnlegen(`zweite-${Date.now()}@example.org`);
    await Z.mitgliedAnlegen(k2.id, a.raum, "leitung", "p_3");
    const an = await Z.anmelden(k2.email);
    const w = await Z.betriebOeffnen(an.keks, a.raum);
    const sk3 = (await anlegen(w.token)).daten.schluessel;
    expect((await vollausgabe(sk3)).status, "Schlüssel von p_3").toBe(200);
    expect((await satz(sk3)).ersteller.person).toBe("p_3");
    await bestandAendern(a.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_3").rolle = "mitarbeiter"; });
    expect((await vollausgabe(sk3)).status, "p_3 herabgestuft").toBe(401);
    expect((await vollausgabe(a.sk)).status, "Schlüssel von p_1 unberührt").toBe(200);
  }, LIMIT);

  it("Zugang in einen anderen Raum, Betrieb oder an eine andere Person gelegt: der Schlüssel gilt nicht", async () => {
    const b = await Z.arbeitsbereich("skc-verlegt");
    for (const [was, aendern] of [
      ["Raum", (k) => ({ ...k, bestand: "ein-anderer-raum" })],
      ["Betrieb", (k) => ({ ...k, mandantId: "m-fremd" })],
      ["Person", (k) => ({ ...k, person: "p_2" })],
    ]) {
      const c = await codeLeitung(b.raum, { person: "p_1" });
      const sk = (await anlegen(c.token)).daten.schluessel;
      expect((await vollausgabe(sk)).status, `${was}: vorher`).toBe(200);
      const k = await Z.K.kontoLesen(Z.laden(), c.konto);
      await Z.K.kontoSchreiben(Z.laden(), c.konto, aendern(k));
      expect((await vollausgabe(sk)).status, `${was}: nachher`).toBe(401);
    }
  }, LIMIT);

  it("die Mitgliedschaft zeigt auf eine andere Person oder einen anderen Betrieb: der Schlüssel gilt nicht", async () => {
    for (const [was, feld, wert] of [["Person", "person", "p_2"], ["Betrieb", "mandantId", "m-andere"]]) {
      const b = await kontoMitSchluessel("sk-mitglied");
      expect((await vollausgabe(b.sk)).status, `${was}: vorher`).toBe(200);
      const { blobs } = await Z.laden().list({ prefix: "mitglied:" });
      let geaendert = 0;
      for (const bl of blobs) {
        const m = await Z.laden().get(bl.key, { type: "json" });
        if (m && m.accountId === b.k.id && m.raum === b.raum) { await Z.laden().setJSON(bl.key, { ...m, [feld]: wert }); geaendert++; }
      }
      expect(geaendert, `${was}: Mitgliedschaft gefunden`).toBe(1);
      expect((await vollausgabe(b.sk)).status, `${was}: nachher`).toBe(401);
    }
  }, LIMIT);

  it("der Bestand ist weg oder der Betrieb wurde verschoben: der Schlüssel gilt nicht", async () => {
    const b = await kontoMitSchluessel("sk-bestand");
    const sk = await satz(b.sk);
    const ohneBestand = await AS.sicherungsschluesselPruefen(Z.laden(), sk, { bestandLader: async () => ({ bestand: null }) });
    expect(ohneBestand).toMatchObject({ ok: false, grund: "sk-bestand-fehlt" });
    await bestandAendern(b.raum, (n) => { n.mandanten.unshift({ id: "m0", name: "Neues Haus", einheiten: [], personen: [] }); });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);
});
