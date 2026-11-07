/* ==========================================================================
   SI-P1 — Betreiberentscheidungen vom 2026-11-07

   1. Eine Passwortänderung und ein Sicherheitsreset widerrufen die Sicherungsschlüssel des Kontos dauerhaft.
      Vor der Änderung steht eine verständliche Warnung, ein Ersatzschlüssel lässt sich kontrolliert einrichten,
      und alte Schlüssel werden nie wieder gültig (Widerrufsvermerk `skw:`).
   2. Standardlaufzeit 90 Tage, Höchstlaufzeit 365 Tage, längere Laufzeit nur ausdrücklich; bestehende Schlüssel
      werden nicht verkürzt.
   3. Höchstens fünf gleichzeitig aktive Schlüssel je Betrieb; widerrufene und abgelaufene zählen nicht; bei Erreichen
      wird serverseitig abgelehnt, ohne etwas zu löschen.
   Dazu: Ein widerrufener Schlüssel bekommt eine erkennbare Absage (Sicherungsautomatisierungen fallen nicht stumm aus),
   und nirgends steht ein Schlüssel im Klartext.

   Aufruf: npx vitest run pruefungen/sicherungsschluessel-betreiberentscheid.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { aufbauen, hash } from "./hilfen/szenario.mjs";

const LIMIT = 60000;
const TAG = 86400000;
let Z;
let SK;

beforeAll(async () => {
  Z = await aufbauen("skbetreiber");
  SK = await import("../server/lib/sicherungsschluessel.mjs");
}, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });

const anlegen = (token, tage) => Z.bearer(Z.daten, "/api/sicherungsschluessel", token,
  { methode: "POST", rumpf: tage === undefined ? {} : { tage } });
const liste = (token) => Z.bearer(Z.daten, "/api/sicherungsschluessel", token);
const vollausgabe = (roh) => Z.bearer(Z.daten, "/api/vollausgabe", roh);
const satz = (roh) => Z.ablageArbeit().get(`sk:${hash(roh)}`, { type: "json" });
const vermerk = (roh) => Z.ablageArbeit().get(`skw:${hash(roh)}`, { type: "json" });
const neuesPasswort = async () => Z.P.passwortAblegen("Ein ganz neues Passwort 2026 für den Test");

async function kontoMitSchluessel(was) {
  const b = await Z.arbeitsbereich(was);
  const a = await anlegen(b.token);
  expect(a.status, JSON.stringify(a.daten)).toBe(200);
  return { ...b, sk: a.daten.schluessel };
}
async function codeLeitung(raum) {
  const konto = await Z.zugangskonto(raum, { rolle: "leitung", person: null });
  const s = await Z.legacySitzung(raum, { rolle: "leitung", person: null, konto });
  return { konto, token: s.token };
}

describe("Entscheidung 1: Passwortänderung und Sicherheitsreset", () => {
  it("eine Passwortänderung widerruft den Schlüssel sofort und dauerhaft, mit Vermerk", async () => {
    const b = await kontoMitSchluessel("e1-passwort");
    expect((await vollausgabe(b.sk)).status, "vorher").toBe(200);
    const alt = await Z.A.accountLesenPerId(Z.laden(), b.k.id);
    expect(alt.passwort, "das Konto hat schon ein Passwort").toBeTruthy();
    const g = await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    expect(g.ok).toBe(true);
    expect(g.sicherungsschluessel).toMatchObject({ widerrufen: 1, fehler: 0 });
    expect(await satz(b.sk), "Datensatz entfernt").toBeNull();
    expect(await vermerk(b.sk), "Widerrufsvermerk").toMatchObject({ grund: "passwort-geaendert" });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("ein Sicherheitsreset (Epoche erhöht, Passwort bleibt) widerruft ebenso", async () => {
    const b = await kontoMitSchluessel("e1-reset");
    const e = await Z.A.epocheErhoehen(Z.laden(), b.k.id);
    expect(e.sicherungsschluessel).toMatchObject({ widerrufen: 1 });
    expect((await vollausgabe(b.sk)).status).toBe(401);
    expect(await vermerk(b.sk)).toMatchObject({ grund: "sicherheitsreset" });
  }, LIMIT);

  it("das erste Passwort eines Kontos ohne Passwort widerruft nichts (es gibt noch keine Schlüssel)", async () => {
    const b = await kontoMitSchluessel("e1-erstes");
    await Z.A.accountAendern(Z.laden(), b.k.id, { passwort: null });
    const g = await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    expect(g.ok).toBe(true);
    expect(g.sicherungsschluessel, "kein Widerruf beim ersten Passwort").toBeUndefined();
    expect(await satz(b.sk)).not.toBeNull();
  }, LIMIT);

  it("der Schlüssel eines anderen Kontos bleibt unberührt", async () => {
    const a = await kontoMitSchluessel("e1-a");
    const b = await kontoMitSchluessel("e1-b");
    await Z.A.passwortSetzen(Z.laden(), a.k.id, await neuesPasswort());
    expect((await vollausgabe(a.sk)).status).toBe(401);
    expect((await vollausgabe(b.sk)).status).toBe(200);
  }, LIMIT);

  it("kein Wiederaufleben: Datensatz wieder angelegt, Epoche zurückgesetzt, Konto in früheren Stand versetzt", async () => {
    const b = await kontoMitSchluessel("e1-revival");
    const rohSatz = await satz(b.sk);
    const altKonto = await Z.A.accountLesenPerId(Z.laden(), b.k.id);
    await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    expect((await vollausgabe(b.sk)).status).toBe(401);
    // „Wiederherstellung eines früheren Kontostands": alter Datensatz, alte Epoche, altes Passwort, alter Status.
    await Z.ablageArbeit().setJSON(`sk:${hash(b.sk)}`, rohSatz);
    await Z.A.accountAendern(Z.laden(), b.k.id, { epoche: altKonto.epoche, passwort: altKonto.passwort, status: altKonto.status });
    const v = await vollausgabe(b.sk);
    expect(v.status).toBe(401);
    expect(v.daten.widerrufen, "erkennbar widerrufen, nicht nur unbekannt").toBe(true);
  }, LIMIT);

  it("kein Wiederaufleben bei Sperre und späterer Entsperrung eines Kontos, auch ohne Gebrauch dazwischen", async () => {
    const b = await kontoMitSchluessel("e1-sperre");
    await Z.A.accountSperren(Z.laden(), b.k.id);
    await Z.A.accountAendern(Z.laden(), b.k.id, { status: "aktiv" });
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("kein Wiederaufleben bei Zugangscode: gesperrt, dann entsperrt", async () => {
    const b = await Z.arbeitsbereich("e1-zugang");
    const a = await codeLeitung(b.raum);
    const sk = (await anlegen(a.token)).daten.schluessel;
    const k = await Z.K.kontoLesen(Z.laden(), a.konto);
    await Z.K.kontoSchreiben(Z.laden(), a.konto, { ...k, gesperrt: true });
    expect((await vollausgabe(sk)).status).toBe(401);       // erster Gebrauch nach der Sperre widerruft endgültig
    const { gesperrt, ...frei } = k;
    await Z.K.kontoSchreiben(Z.laden(), a.konto, frei);
    expect((await vollausgabe(sk)).status).toBe(401);
    expect(await vermerk(sk)).toMatchObject({ grund: "zugang-gesperrt" });
  }, LIMIT);

  it("ein Mitgliedschaftsentzug widerruft sofort (ohne ersten Gebrauch), nur für diesen Raum", async () => {
    const b = await kontoMitSchluessel("e1-mitglied");
    await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);
    expect(await satz(b.sk)).toBeNull();
    expect(await vermerk(b.sk)).toMatchObject({ grund: "ersteller-berechtigung" });
  }, LIMIT);

  it("die Warnung ist vorhanden, verständlich und nennt die Folge für automatische Sicherungen", async () => {
    const b = await kontoMitSchluessel("e1-warnung");
    const z = await SK.schluesselDesKontosZaehlen(b.k.id);
    expect(z.anzahl).toBe(1);
    expect(z.warnung).toMatch(/Automatische Sicherungen/);
    expect(z.warnung).toMatch(/dauerhaft/);
    expect(z.warnung).toMatch(/neuen Schlüssel/);
    expect((await liste(b.token)).daten.warnung).toBe(SK.SK_WARNUNG_PASSWORT);
  }, LIMIT);

  it("ein Ersatzschlüssel lässt sich nach dem Widerruf kontrolliert einrichten (frische Anmeldung der Leitung), der alte bleibt tot", async () => {
    const b = await kontoMitSchluessel("e1-ersatz");
    const l = await codeLeitung(b.raum);                     // eine weitere Leitung im Betrieb
    await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    const neu = await anlegen(l.token);
    expect(neu.status, JSON.stringify(neu.daten)).toBe(200);
    expect((await vollausgabe(neu.daten.schluessel)).status).toBe(200);
    expect((await vollausgabe(b.sk)).status, "der alte bleibt tot").toBe(401);
  }, LIMIT);
});

describe("Erkennbarer Fehler statt stillem Ausfall", () => {
  it("ein widerrufener Schlüssel bekommt 401 mit Grund und Hinweis auf einen neuen Schlüssel", async () => {
    const b = await kontoMitSchluessel("fehler-erkennbar");
    await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    const v = await vollausgabe(b.sk);
    expect(v.status).toBe(401);
    expect(v.daten).toMatchObject({ widerrufen: true, grund: "passwort-geaendert" });
    expect(v.daten.text).toMatch(/neuen Sicherungsschlüssel/);
    expect(JSON.stringify(v.daten), "nie der Schlüssel selbst").not.toContain(b.sk);
  }, LIMIT);

  it("die Raumlöschung nimmt auch den Widerrufsvermerk mit (er trägt Raum und Namen des Erstellers)", async () => {
    const b = await kontoMitSchluessel("fehler-raumloeschung");
    await Z.A.epocheErhoehen(Z.laden(), b.k.id);
    expect(await vermerk(b.sk)).not.toBeNull();
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    await raumLoeschen(Z.laden(), Z.ablageArbeit(), b.raum);
    expect(await vermerk(b.sk)).toBeNull();
  }, LIMIT);

  it("ein unbekannter Schlüssel bekommt weiter nur „Nicht angemeldet“ (der Vermerk verrät Außenstehenden nichts)", async () => {
    const v = await vollausgabe("gibt-es-nicht-0123456789abcdef0123456789");
    expect(v.status).toBe(401);
    expect(v.daten.widerrufen).toBeUndefined();
    expect(v.daten.fehler).toBe("Nicht angemeldet.");
  }, LIMIT);

  it("die Liste der Leitung zeigt den widerrufenen Schlüssel mit Grund und Zeit, ohne Klartext", async () => {
    const b = await kontoMitSchluessel("fehler-liste");
    const l = await codeLeitung(b.raum);
    await Z.A.passwortSetzen(Z.laden(), b.k.id, await neuesPasswort());
    const li = await liste(l.token);
    expect(li.daten.schluessel).toHaveLength(0);
    expect(li.daten.widerrufen).toHaveLength(1);
    expect(li.daten.widerrufen[0]).toMatchObject({ grund: "passwort-geaendert" });
    expect(li.daten.widerrufen[0].text).toMatch(/Passwort/);
    expect(li.daten.widerrufen[0].am).toBeTruthy();
    expect(JSON.stringify(li.daten)).not.toContain(b.sk);
    expect(JSON.stringify(li.daten)).not.toContain(hash(b.sk));
  }, LIMIT);

  it("der Vermerk enthält den Schlüssel nicht im Klartext", async () => {
    const b = await kontoMitSchluessel("fehler-vermerk");
    await Z.A.epocheErhoehen(Z.laden(), b.k.id);
    expect(JSON.stringify(await vermerk(b.sk))).not.toContain(b.sk);
  }, LIMIT);
});

describe("Entscheidung 2: Laufzeit", () => {
  it("ohne Angabe 90 Tage", async () => {
    const b = await Z.arbeitsbereich("e2-standard");
    const a = await anlegen(b.token);
    expect(a.daten.tage).toBe(90);
    expect(a.daten.standardTage).toBe(90);
    expect(a.daten.hoechstTage).toBe(365);
    const bis = new Date(a.daten.gueltigBis).getTime();
    expect(Math.abs(bis - (Date.now() + 90 * TAG))).toBeLessThan(60000);
  }, LIMIT);

  it("eine längere Laufzeit gilt nur, wenn sie ausdrücklich gewählt wird; höchstens 365 Tage", async () => {
    const b = await Z.arbeitsbereich("e2-lang");
    expect((await anlegen(b.token, 120)).daten.tage).toBe(120);
    expect((await anlegen(b.token, 365)).daten.tage).toBe(365);
    expect((await anlegen(b.token, 1000)).daten.tage).toBe(365);
    expect((await anlegen(b.token, "viel")).daten.tage, "unbrauchbar → Standard, nicht Höchstwert").toBe(90);
    expect((await anlegen(b.token, -5)).daten.tage).toBe(1);
  }, LIMIT);

  it("bestehende Schlüssel werden nicht verkürzt (auch nicht durch Auflisten)", async () => {
    const b = await Z.arbeitsbereich("e2-bestand");
    const a = await anlegen(b.token, 365);
    const vorher = await satz(a.daten.schluessel);
    await liste(b.token);
    await anlegen(b.token);
    const nachher = await satz(a.daten.schluessel);
    expect(nachher.bis).toBe(vorher.bis);
    expect(nachher.bis - Date.now()).toBeGreaterThan(364 * TAG);
    expect((await vollausgabe(a.daten.schluessel)).status).toBe(200);
  }, LIMIT);
});

describe("Entscheidung 3: höchstens fünf aktive Schlüssel je Betrieb", () => {
  it("der sechste wird serverseitig abgelehnt, und nichts wird gelöscht", async () => {
    const b = await Z.arbeitsbereich("e3-grenze");
    const roh = [];
    for (let i = 0; i < 5; i++) {
      const a = await anlegen(b.token, 30);
      expect(a.status, `Nr. ${i + 1}: ${JSON.stringify(a.daten)}`).toBe(200);
      roh.push(a.daten.schluessel);
    }
    const sechs = await anlegen(b.token, 30);
    expect(sechs.status).toBe(409);
    expect(sechs.daten).toMatchObject({ grenze: 5, aktiv: 5 });
    expect(sechs.daten.text).toMatch(/nichts automatisch gelöscht/);
    for (const r of roh) expect((await vollausgabe(r)).status, "bestehende bleiben gültig").toBe(200);
    expect((await liste(b.token)).daten.schluessel).toHaveLength(5);
  }, LIMIT);

  it("ein widerrufener (DELETE) oder abgelaufener Schlüssel zählt nicht mit", async () => {
    const b = await Z.arbeitsbereich("e3-zaehlt");
    const roh = [];
    for (let i = 0; i < 5; i++) roh.push((await anlegen(b.token, 30)).daten.schluessel);
    expect((await anlegen(b.token)).status).toBe(409);
    // einen widerrufen
    const l = await liste(b.token);
    const kennung = hash(roh[0]).slice(0, 8);
    expect(l.daten.schluessel.some((e) => e.kennung === kennung)).toBe(true);
    expect((await Z.bearer(Z.daten, "/api/sicherungsschluessel", b.token, { methode: "DELETE", rumpf: { kennung } })).daten.widerrufen).toBe(1);
    expect((await anlegen(b.token, 30)).status, "nach dem Widerruf wieder Platz").toBe(200);
    expect((await anlegen(b.token)).status).toBe(409);
    // einen ablaufen lassen
    const s1 = await satz(roh[1]);
    await Z.ablageArbeit().setJSON(`sk:${hash(roh[1])}`, { ...s1, bis: Date.now() - 1000 });
    expect((await anlegen(b.token, 30)).status, "nach dem Ablauf wieder Platz").toBe(200);
  }, LIMIT);

  it("ein Schlüssel, dessen Ersteller nicht mehr gilt, zählt nicht mit", async () => {
    const b = await Z.arbeitsbereich("e3-verwaist");
    const l = await codeLeitung(b.raum);
    for (let i = 0; i < 4; i++) expect((await anlegen(b.token, 30)).status).toBe(200);
    const fremd = (await anlegen(l.token, 30)).daten.schluessel;           // fünfter, von der Code-Leitung
    expect((await anlegen(b.token, 30)).status).toBe(409);
    const k = await Z.K.kontoLesen(Z.laden(), l.konto);
    await Z.K.kontoSchreiben(Z.laden(), l.konto, { ...k, gesperrt: true });
    expect((await anlegen(b.token, 30)).status, "der gesperrte Ersteller zählt nicht mehr").toBe(200);
    expect((await vollausgabe(fremd)).status).toBe(401);
  }, LIMIT);

  it("die Grenze gilt je Betrieb: ein anderer Betrieb hat seine eigenen fünf", async () => {
    const a = await Z.arbeitsbereich("e3-a");
    const c = await Z.arbeitsbereich("e3-c");
    for (let i = 0; i < 5; i++) expect((await anlegen(a.token, 30)).status).toBe(200);
    expect((await anlegen(a.token, 30)).status).toBe(409);
    expect((await anlegen(c.token, 30)).status, "anderer Betrieb").toBe(200);
  }, LIMIT);

  it("gleichzeitige Anfragen überschreiten die Grenze nicht", async () => {
    const b = await Z.arbeitsbereich("e3-parallel");
    const erg = await Promise.all(Array.from({ length: 9 }, () => anlegen(b.token, 30)));
    const ok = erg.filter((e) => e.status === 200).length;
    expect(ok).toBe(5);
    expect(erg.filter((e) => e.status === 409).length).toBe(4);
    expect((await liste(b.token)).daten.schluessel).toHaveLength(5);
  }, LIMIT);
});

describe("Review-Nachträge", () => {
  /* Wege, die über den Server laufen (PUT /api/bestand), damit der Abgleich nach dem Schreiben greift. */
  const bestandPut = async (b, aendern) => {
    const g = await Z.bearer(Z.daten, "/api/bestand", b.token);
    const neu = JSON.parse(JSON.stringify(g.daten.bestand));
    aendern(neu);
    const e = await Z.bearer(Z.daten, "/api/bestand", b.token, { methode: "PUT", rumpf: { bestand: neu, etag: g.daten.etag } });
    return e;
  };

  it("Befund 1: Herabstufung ohne Gebrauch dazwischen; der nächste Schreibvorgang im Raum widerruft, ein Zurückspielen belebt nichts", async () => {
    const b = await Z.arbeitsbereich("n-herab");
    const l = await codeLeitung(b.raum);                       // zweite Leitung, die irgendetwas im Raum ändert
    const sk = (await anlegen(b.token)).daten.schluessel;       // Schlüssel des Kontos (Person p_1), nie benutzt
    const alt = JSON.parse(JSON.stringify((await Z.B.bestandLesen(Z.laden(), b.raum)).bestand));
    // Herabstufung auf einem Weg, der den Abgleich nicht auslöst (Bibliothek, Werkzeug, Migration).
    await bestandAendernLib(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; });
    expect(await vermerk(sk), "noch nicht bemerkt").toBeNull();
    // Irgendein erfolgreicher Schreibvorgang über den Server im selben Raum gleicht ab.
    const g = await Z.bearer(Z.daten, "/api/bestand", l.token);
    const neu = JSON.parse(JSON.stringify(g.daten.bestand));
    neu.mandanten[0].name = `${neu.mandanten[0].name} `;
    const e = await Z.bearer(Z.daten, "/api/bestand", l.token, { methode: "PUT", rumpf: { bestand: neu, etag: g.daten.etag } });
    expect(e.status, JSON.stringify(e.daten).slice(0, 200)).toBeLessThan(300);
    expect(await vermerk(sk), "jetzt widerrufen, ohne Gebrauch dazwischen").toMatchObject({ grund: "ersteller-berechtigung" });
    // Zurückspielen des alten Standes (etwa einer Sicherung): der Schlüssel lebt nicht auf.
    await Z.B.bestandSchreiben(Z.laden(), b.raum, alt, { durch: "Pruefung" });
    expect((await vollausgabe(sk)).status).toBe(401);
  }, LIMIT);

  it("Befund 1: ein anderer Raum wird vom Abgleich nicht berührt", async () => {
    const a = await kontoMitSchluessel("n-raum-a");
    const c = await kontoMitSchluessel("n-raum-c");
    await bestandPut(a, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; });
    expect((await vollausgabe(c.sk)).status).toBe(200);
  }, LIMIT);

  it("DELETE: der von der Leitung widerrufene Schlüssel bekommt die erkennbare 401, und der Fehlerfall wird nicht als Erfolg gemeldet", async () => {
    const b = await kontoMitSchluessel("n-delete");
    const l = await liste(b.token);
    const kennung = l.daten.schluessel[0].kennung;
    const d = await Z.bearer(Z.daten, "/api/sicherungsschluessel", b.token, { methode: "DELETE", rumpf: { kennung } });
    expect(d.daten.widerrufen).toBe(1);
    const v = await vollausgabe(b.sk);
    expect(v.status).toBe(401);
    expect(v.daten).toMatchObject({ widerrufen: true, grund: "von-der-leitung-widerrufen" });
  }, LIMIT);

  it("Befund 6/7: Altschlüssel ohne Ersteller werden beim Anlegen nicht gelöscht und zählen nicht; GET und POST zählen gleich", async () => {
    const b = await Z.arbeitsbereich("n-zaehlen");
    for (let i = 0; i < 3; i++) {
      await Z.ablageArbeit().setJSON(`sk:${hash(`alt-ohne-ersteller-${i}-0123456789abcdef`)}`, { bestand: b.raum, rolle: "leitung",
        nurSicherung: true, betrieb: 0, mandantId: "m1", name: "alt", angelegt: new Date().toISOString(), bis: Date.now() + TAG });
    }
    for (let i = 0; i < 4; i++) expect((await anlegen(b.token, 30)).status).toBe(200);
    const l = await liste(b.token);
    expect(l.daten.aktiv, "Altschlüssel zählen nicht").toBe(4);
    expect((await anlegen(b.token, 30)).status).toBe(200);
    expect((await anlegen(b.token, 30)).status).toBe(409);
    expect((await liste(b.token)).daten.aktiv).toBe(5);
    expect(await satz("alt-ohne-ersteller-0-0123456789abcdef"), "nicht automatisch gelöscht").not.toBeNull();
  }, LIMIT);

  it("Befund 8: ein beim Auflisten widerrufener Schlüssel steht nur unter den widerrufenen", async () => {
    const b = await Z.arbeitsbereich("n-doppelt");
    const l = await codeLeitung(b.raum);
    await anlegen(b.token, 30);
    await bestandAendernLib(b.raum, (n) => { n.mandanten[0].personen.find((p) => p.id === "p_1").rolle = "mitarbeiter"; });
    const li = await liste(l.token);
    expect(li.daten.schluessel).toHaveLength(0);
    expect(li.daten.widerrufen).toHaveLength(1);
  }, LIMIT);

  it("Befund 9: wird der NEUE Schlüssel eines umgeschlüsselten Zugangs gesperrt, endet auch der Schlüssel unter dem alten sofort", async () => {
    const b = await Z.arbeitsbereich("n-kette");
    const a = await codeLeitung(b.raum);
    const sk = (await anlegen(a.token)).daten.schluessel;
    const alt = await Z.K.kontoLesen(Z.laden(), a.konto);
    const neuK = `${a.konto}-neu`;
    await Z.K.kontoSchreiben(Z.laden(), neuK, { ...alt });
    await Z.K.kontoSchreiben(Z.laden(), a.konto, { ...alt, ersetztDurch: neuK });
    const sperr = await codeLeitung(b.raum);
    const s = await Z.bearer(Z.daten, "/api/zugang-sperren", sperr.token, { methode: "POST", rumpf: { pruefsumme: neuK } });
    expect(s.status, JSON.stringify(s.daten)).toBe(200);
    expect(s.daten.schluesselBeendet).toBe(1);
    expect(await vermerk(sk)).toMatchObject({ grund: "zugang-gesperrt" });
  }, LIMIT);

  it("Befund 10: die Haken melden ihr Ergebnis in der Antwort (Sperre, Entzug)", async () => {
    const a = await kontoMitSchluessel("n-hook-a");
    const g = await Z.A.accountSperren(Z.laden(), a.k.id);
    expect(g.sicherungsschluessel).toMatchObject({ widerrufen: 1, fehler: 0 });
    const b = await kontoMitSchluessel("n-hook-b");
    const m = await Z.A.mitgliedschaftEntziehen(Z.laden(), b.k.id, b.raum);
    expect(m.sicherungsschluessel).toMatchObject({ widerrufen: 1, fehler: 0 });
  }, LIMIT);

  it("Befund 8 (M8): der Entzug einer Mitgliedschaft widerruft nur die Schlüssel dieses Raums", async () => {
    const x = await kontoMitSchluessel("n-raumfilter");
    const andererRaum = Z.raum("n-raumfilter-zwei");
    // Ein zweiter Schlüssel desselben Kontos, aber für einen anderen Raum (Datensatz von Hand angelegt).
    const roh = "zweiter-raum-0123456789abcdef0123456789";
    const satzX = await satz(x.sk);
    await Z.ablageArbeit().setJSON(`sk:${hash(roh)}`, { ...satzX, bestand: andererRaum });
    await Z.A.mitgliedschaftEntziehen(Z.laden(), x.k.id, x.raum);
    expect(await satz(x.sk)).toBeNull();
    expect(await satz(roh), "Schlüssel des anderen Raums bleibt").not.toBeNull();
  }, LIMIT);

  it("M13: eine Dezimalzahl wird abgerundet, 0 und Text gelten als nicht angegeben (Standard)", async () => {
    const b = await Z.arbeitsbereich("n-tage");
    expect((await anlegen(b.token, 45.9)).daten.tage).toBe(45);
    expect((await anlegen(b.token, 0)).daten.tage).toBe(90);
  }, LIMIT);
});

async function bestandAendernLib(raum, aendern) {
  const g = await Z.B.bestandLesen(Z.laden(), raum);
  const neu = JSON.parse(JSON.stringify(g.bestand));
  aendern(neu);
  const e = await Z.B.bestandSchreiben(Z.laden(), raum, neu, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

describe("Review-Nachträge: Fehlerpfade des Widerrufs (gestörte Ablage)", () => {
  const ablage = ({ setWirft = false, loeschWirft = false } = {}) => {
    const daten = new Map([["sk:abc", { bestand: "r", mandantId: "m1", bis: Date.now() + TAG, ersteller: { art: "konto", name: "L" } }]]);
    return {
      daten,
      get: async (k) => daten.get(k) ?? null,
      setJSON: async (k, v) => { if (setWirft) throw new Error("EIO"); daten.set(k, v); },
      delete: async (k) => { if (loeschWirft) throw new Error("EIO"); daten.delete(k); },
      list: async ({ prefix }) => ({ blobs: [...daten.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    };
  };

  it("Vermerk und Löschen gelingen: voll", async () => {
    const a = ablage();
    expect(await SK.schluesselWiderrufen("sk:abc", a.daten.get("sk:abc"), "sicherheitsreset", { ablage: a })).toBe("voll");
    expect(a.daten.has("sk:abc")).toBe(false);
    expect(a.daten.get("skw:abc")).toMatchObject({ grund: "sicherheitsreset" });
  });

  it("der Vermerk misslingt: der Schlüssel wird trotzdem gelöscht, und das wird als Fehler gemeldet", async () => {
    const a = ablage({ setWirft: true });
    expect(await SK.schluesselWiderrufen("sk:abc", a.daten.get("sk:abc"), "sicherheitsreset", { ablage: a })).toBe("ohne-vermerk");
    expect(a.daten.has("sk:abc")).toBe(false);
    const b = ablage({ setWirft: true });
    const r = await SK.schluesselWiderrufenWenn(() => true, "sicherheitsreset", { ablage: b });
    expect(r).toEqual({ widerrufen: 1, fehler: 1 });
  });

  it("weder Vermerk noch Löschen gelingt: false (der Schlüssel gilt weiter, der Aufrufer muss es melden)", async () => {
    const a = ablage({ setWirft: true, loeschWirft: true });
    expect(await SK.schluesselWiderrufen("sk:abc", a.daten.get("sk:abc"), "x", { ablage: a })).toBe(false);
    expect(a.daten.has("sk:abc")).toBe(true);
    const r = await SK.schluesselWiderrufenWenn(() => true, "x", { ablage: a });
    expect(r).toEqual({ widerrufen: 0, fehler: 1 });
  });

  it("der Vermerk misslingt, das Löschen gelingt nicht, aber der Vermerk steht: voll (er sperrt den Schlüssel)", async () => {
    const a = ablage({ loeschWirft: true });
    expect(await SK.schluesselWiderrufen("sk:abc", a.daten.get("sk:abc"), "x", { ablage: a })).toBe("voll");
    expect(a.daten.has("skw:abc")).toBe(true);
  });
});
