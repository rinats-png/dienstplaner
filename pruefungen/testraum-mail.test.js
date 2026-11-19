/* ==========================================================================
   SI-P3 — KEIN MAILVERSAND AUS TEST- UND DEMORÄUMEN OHNE FREIGABE

   Befund P3 (docs/acc45/SICHERHEIT-INTERN-2026-11.md): In einem selbst
   angelegten Testbetrieb ließen sich Personen-E-Mails frei setzen und
   Mitteilungen über den Betreiberabsender verschicken (Relay, Phishing).

   Geprüft:
   - Erkennung (lib/testraum.mjs): t-…, demo-…, selbstAngelegt; nicht status
     „test“ allein (Pilotkunden starten so) und nicht ein gewöhnlicher Raum.
   - Zustellkette (lib/versand.mjs) mit echter Ablage: ohne Freigabe keine
     Mail aus Test-/Demoraum (Grund „testraum“, endgültig), Push bleibt;
     gewöhnlicher Raum unverändert; mit CENTRIC_TESTRAUM_MAIL=ja höchstens
     CENTRIC_TESTRAUM_MAIL_TAG_MAX je Raum und Tag, auch über zwei Betriebe
     des Raums; Wiederholung derselben Mitteilung belegt keinen zweiten Platz.
   - HTTP-Sonde über den echten Handler /zustellung/senden: Planung eines
     Testraums setzt eine fremde Adresse und stößt an — nichts geht hinaus.
   Mail und Push sind ersetzt; es geht nichts hinaus.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [], antwort: null }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text) => {
    post.mails.push({ an, betreff, text });
    return post.antwort ? post.antwort() : { ok: true };
  },
}));
vi.mock("../server/lib/webpush.mjs", async (original) => ({
  ...(await original()),
  sendePush: async (anmeldung, titel) => { post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel }); return { ok: true }; },
}));

const JETZT = Date.parse("2026-12-10T10:00:00.000Z");
const WIRT = "127.0.0.1:3000";
let wurzel, store, V, T, B, daten, zustellung, kontoSchreiben, ablageSchluessel;
let lauf = 0;

const person = (id, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle: "mitarbeiter",
  email: `opfer-${id}@fremd.example`, ...extra });
const mitteilung = (id, an) => ({ id, personId: an, art: "planGeaendert", titel: "Freier Text", text: "Bitte hier klicken",
  ziel: "meine", zeit: "x", erstellt: new Date(JETZT).toISOString(), gelesen: false, dringend: true });
const betrieb = (mid, nachrichten, extra = {}) => ({ id: mid, name: `Betrieb ${mid}`, einheiten: [{ id: "e1" }],
  personen: [person("a1"), person("a2"), person("a3")], nachrichten, abweichungen: {}, anfragen: [], notrufe: [], ...extra });

/** Je Prüfung ein frischer Raum: kein Kontingent oder Status aus der vorigen. */
async function raum(praefix, mandanten) {
  lauf += 1;
  const r = `${praefix}${lauf}`;
  const bestand = { version: 1, mandanten };
  await B.bestandSchreiben(store, r, bestand, { durch: "Pruefung" });
  for (const m of mandanten) for (const p of m.personen)
    await store.setJSON(V.pushSchluessel(r, m.id, p.id), { endpoint: `https://push.example/${r}-${p.id}`, keys: {} });
  return { r, bestand };
}
const status = (r, mid, nid, kanal) => store.get(V.statusSchluessel(r, mid, nid, kanal), { type: "json" });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-testraum-mail-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ZUSTELL_BACKOFF = "0,0";
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["zustellen", "schreiben", "anmelden"]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  V = await import("../server/lib/versand.mjs");
  T = await import("../server/lib/testraum.mjs");
  B = await import("../server/lib/bestand.mjs");
  daten = (await import("../server/funktionen/daten.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => {
  post.mails.length = 0; post.pushes.length = 0; post.antwort = null;
  delete process.env.CENTRIC_TESTRAUM_MAIL; delete process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX;
  V.kontingentCacheLeeren();
});
afterEach(() => { delete process.env.CENTRIC_TESTRAUM_MAIL; delete process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX; });

describe("Erkennung eines Test- oder Demoraums", () => {
  it("t-… und demo-… (Raumkennung) sowie selbstAngelegt gelten als Testraum", () => {
    expect(T.istTestOderDemoraum("t-pflege-ab12", {})).toBe(true);
    expect(T.istTestOderDemoraum("demo-pflege", {})).toBe(true);
    expect(T.istTestOderDemoraum("Demo-x", null)).toBe(true);
    expect(T.istTestOderDemoraum("kunde1", { selbstAngelegt: true })).toBe(true);
  });
  it("gewöhnlicher Raum, auch mit status „test“ (Pilotkunde), ist kein Testraum", () => {
    expect(T.istTestOderDemoraum("kunde1", { status: "test" })).toBe(false);
    expect(T.istTestOderDemoraum("kunde1", { selbstAngelegt: "true" })).toBe(false);
    expect(T.istTestOderDemoraum("test-kunde", {})).toBe(false);
    expect(T.istTestOderDemoraum(undefined, undefined)).toBe(false);
  });
  it("Freigabe nur mit „ja“; Obergrenze 1 bis 1000, sonst 20", () => {
    expect(T.testraumMailFrei()).toBe(false);
    for (const w of ["true", "1", "an", "nein", ""]) { process.env.CENTRIC_TESTRAUM_MAIL = w; expect(T.testraumMailFrei()).toBe(false); }
    process.env.CENTRIC_TESTRAUM_MAIL = " JA "; expect(T.testraumMailFrei()).toBe(true);
    expect(T.testraumMailTagMax()).toBe(20);
    for (const w of ["0", "-1", "1001", "2.5", "x"]) { process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = w; expect(T.testraumMailTagMax()).toBe(20); }
    process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = "3"; expect(T.testraumMailTagMax()).toBe(3);
  });
});

describe("Zustellkette: ohne Freigabe keine Mail aus Test- und Demoräumen", { timeout: 30000 }, () => {
  for (const [name, praefix, extra] of [["t-Raum", "t-p3-", {}], ["Demoraum", "demo-p3-", {}],
    ["selbst angelegter Betrieb", "kunde-p3-", { selbstAngelegt: true }]]) {
    it(`${name}: keine Mail (übersprungen, testraum), Push geht`, async () => {
      const m = betrieb("m-a", [mitteilung("n1", "a1")], extra);
      const { r, bestand } = await raum(praefix, [m]);
      const erg = await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: JETZT });
      expect(erg.get("n1")).toBe("erledigt");
      expect(post.mails).toEqual([]);
      expect(post.pushes).toHaveLength(1);
      expect(await status(r, "m-a", "n1", "mail")).toMatchObject({ status: "uebersprungen", grund: "testraum" });
      expect(await status(r, "m-a", "n1", "push")).toMatchObject({ status: "gesendet" });
    });
  }
  it("Altbestand bleibt endgültig übersprungen, auch über nachfassen()", async () => {
    const m = betrieb("m-a", [mitteilung("n1", "a1")]);
    const { r, bestand } = await raum("t-p3n-", [m]);
    await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: JETZT });
    await V.nachfassen(store, { jetzt: JETZT + 3600000 });
    expect(post.mails).toEqual([]);
  });
  it("gewöhnlicher Raum (auch status „test“): Mail geht wie bisher", async () => {
    const m = betrieb("m-a", [mitteilung("n1", "a1")], { status: "test" });
    const { r, bestand } = await raum("kunde-p3g-", [m]);
    await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: JETZT });
    expect(post.mails.map((x) => x.an)).toEqual(["opfer-a1@fremd.example"]);
  });
});

describe("Mit Freigabe: Tagesobergrenze je Raum", { timeout: 30000 }, () => {
  it("höchstens CENTRIC_TESTRAUM_MAIL_TAG_MAX Mails je Raum und Tag — über alle Betriebe des Raums", async () => {
    process.env.CENTRIC_TESTRAUM_MAIL = "ja";
    process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = "2";
    const ma = betrieb("m-a", [mitteilung("n1", "a1"), mitteilung("n2", "a2")]);
    const mb = betrieb("m-b", [mitteilung("n3", "a1"), mitteilung("n4", "a3")]);
    const { r, bestand } = await raum("t-p3f-", [ma, mb]);
    await V.zustellen(store, { raum: r, bestand, m: ma, ids: ["n1", "n2"], jetzt: JETZT });
    await V.zustellen(store, { raum: r, bestand, m: mb, ids: ["n3", "n4"], jetzt: JETZT });
    expect(post.mails).toHaveLength(2);
    expect(await status(r, "m-b", "n3", "mail")).toMatchObject({ status: "uebersprungen", grund: "testraum-grenze" });
    expect(await status(r, "m-b", "n4", "mail")).toMatchObject({ status: "uebersprungen", grund: "testraum-grenze" });
    expect(post.pushes).toHaveLength(4);
  });
  it("am nächsten Tag wieder frei; eine Wiederholung nach Anbieterfehler belegt keinen zweiten Platz", async () => {
    process.env.CENTRIC_TESTRAUM_MAIL = "ja";
    process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = "1";
    const m = betrieb("m-a", [mitteilung("n1", "a1"), mitteilung("n2", "a2")]);
    const { r, bestand } = await raum("t-p3w-", [m]);
    let erst = true;
    post.antwort = () => { if (erst) { erst = false; return { ok: false, klasse: "temporaer", status: 503 }; } return { ok: true }; };
    await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: JETZT });
    await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: JETZT + 1000 });
    expect(post.mails).toHaveLength(2);
    expect(await status(r, "m-a", "n1", "mail")).toMatchObject({ status: "gesendet" });
    await V.zustellen(store, { raum: r, bestand, m, ids: ["n2"], jetzt: JETZT + 2000 });
    expect(await status(r, "m-a", "n2", "mail")).toMatchObject({ grund: "testraum-grenze" });
    const m2 = betrieb("m-a", [{ ...mitteilung("n5", "a3"), erstellt: new Date(JETZT + 86400000).toISOString() }]);
    await V.zustellen(store, { raum: r, bestand: { version: 1, mandanten: [m2] }, m: m2, ids: ["n5"], jetzt: JETZT + 86400000 });
    expect(await status(r, "m-a", "n5", "mail")).toMatchObject({ status: "gesendet" });
  });
  it("Raumplatz wird freigegeben, wenn die Betriebsgrenze zurückstellt (kein Verbrauch ohne Versand)", async () => {
    process.env.CENTRIC_TESTRAUM_MAIL = "ja";
    process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = "2";
    process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL = "1";
    try {
      const tag = JETZT + 20 * 86400000;
      const mit = (id, an) => ({ ...mitteilung(id, an), erstellt: new Date(tag).toISOString() });
      const ma = betrieb("m-a", [mit("n1", "a1"), mit("n2", "a2")]);
      const mb = betrieb("m-b", [mit("n3", "a1")]);
      const { r, bestand } = await raum("t-p3z-", [ma, mb]);
      await V.zustellen(store, { raum: r, bestand, m: ma, ids: ["n1", "n2"], jetzt: tag });
      expect(await status(r, "m-a", "n2", "mail")).toMatchObject({ status: "fehler", grund: "kontingent" });
      await V.zustellen(store, { raum: r, bestand, m: mb, ids: ["n3"], jetzt: tag });
      expect(await status(r, "m-b", "n3", "mail")).toMatchObject({ status: "gesendet" });
      expect(post.mails).toHaveLength(2);
    } finally { delete process.env.CENTRIC_ZUSTELL_BETRIEB_MAIL; }
  });
  it("Gesamtgrenze über alle Test-/Demoräume (CENTRIC_TESTRAUM_MAIL_GESAMT_MAX)", async () => {
    process.env.CENTRIC_TESTRAUM_MAIL = "ja";
    process.env.CENTRIC_TESTRAUM_MAIL_GESAMT_MAX = "2";
    try {
      const tag = JETZT + 30 * 86400000;
      const mit = (id, an) => ({ ...mitteilung(id, an), erstellt: new Date(tag).toISOString() });
      const ergebnisse = [];
      for (const praefix of ["t-p3g-", "demo-p3g-", "t-p3g-"]) {
        const m = betrieb("m-a", [mit("n1", "a1")]);
        const { r, bestand } = await raum(praefix, [m]);
        await V.zustellen(store, { raum: r, bestand, m, ids: ["n1"], jetzt: tag });
        ergebnisse.push(await status(r, "m-a", "n1", "mail"));
      }
      expect(post.mails).toHaveLength(2);
      expect(ergebnisse[2]).toMatchObject({ status: "uebersprungen", grund: "testraum-grenze" });
      expect(T.testraumMailGesamtMax()).toBe(2);
      process.env.CENTRIC_TESTRAUM_MAIL_GESAMT_MAX = "0"; expect(T.testraumMailGesamtMax()).toBe(200);
    } finally { delete process.env.CENTRIC_TESTRAUM_MAIL_GESAMT_MAX; }
  });
});

describe("Betreiber-Vorlagen sind keine Testräume (Review WICHTIG 1)", { timeout: 30000 }, () => {
  it("Vorlage „leer“ und „test“: selbstAngelegt false, Mail geht; Selbstanlegeweg setzt true", async () => {
    const { vorlageBestand } = await import("../server/lib/erstbefuellung.mjs");
    const { baueLeerenBetrieb } = await import("../server/lib/leerbetrieb.mjs");
    expect(baueLeerenBetrieb({ name: "X", branche: "pflege", raum: "kunde-x" }).mandanten[0].selbstAngelegt).toBe(false);
    expect(baueLeerenBetrieb({ name: "X", branche: "pflege", raum: "t-x", selbstAngelegt: true }).mandanten[0].selbstAngelegt).toBe(true);
    for (const vorlage of ["leer", "test"]) {
      post.mails.length = 0;
      lauf += 1;
      const r = `pilot-p3v-${vorlage}-${lauf}`;
      const b = vorlageBestand(vorlage, { raum: r, name: "Pilot" });
      const m = b.mandanten[0];
      expect(m.selbstAngelegt).toBe(false);
      expect(m.status).toBe("test");
      m.personen = [person("a1")];
      m.nachrichten = [mitteilung("n1", "a1")];
      await B.bestandSchreiben(store, r, b, { durch: "Pruefung" });
      await V.zustellen(store, { raum: r, bestand: b, m, ids: ["n1"], jetzt: JETZT });
      expect(post.mails.map((x) => x.an), vorlage).toEqual(["opfer-a1@fremd.example"]);
    }
  });
});

describe("HTTP-Sonde: /zustellung/senden aus einem Testraum", { timeout: 30000 }, () => {
  let nr = 0;
  const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.33.${Math.floor(nr / 250)}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    const text = await a.text();
    let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
    return { status: a.status, text, ...d };
  };
  async function sitzung(r, code, rolle, personId) {
    await kontoSchreiben(store, ablageSchluessel(code), { name: `${rolle} ${personId}`, bestand: r, rolle, person: personId,
      betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
    expect(a.token, JSON.stringify(a)).toBeTruthy();
    return a.token;
  }
  const aufbauen = async (praefix, code) => {
    const m = betrieb("m-a", [{ ...mitteilung("n-h1", "a1"), erstellt: new Date().toISOString() }]);
    m.personen.push({ id: "p1", vorname: "P", nachname: "L", rolle: "planer", bereich: "ALLE", email: "planung@fremd.example" });
    const { r } = await raum(praefix, [m]);
    return { r, token: await sitzung(r, code, "planer", "p1") };
  };
  it("Planung eines t-Raums stößt eine Mitteilung an eine frei gesetzte Adresse an: 200, aber keine Mail", async () => {
    const { r, token } = await aufbauen("t-p3h-", "P3HA-TTTT-0001");
    const a = await anfrage(zustellung, "/zustellung/senden", { token, rumpf: { nachrichten: ["n-h1"] } });
    expect(a.status, a.text).toBe(200);
    expect(a.ergebnis).toEqual([{ id: "n-h1", stand: "erledigt" }]);
    expect(post.mails).toEqual([]);
    expect(await status(r, "m-a", "n-h1", "mail")).toMatchObject({ status: "uebersprungen", grund: "testraum" });
  });
  it("Client-PUT kann selbstAngelegt weder setzen noch löschen", async () => {
    for (const [praefix, code, vorher] of [["kunde-p3s-", "P3SA-LLLL-0003", true], ["kunde-p3s-", "P3SB-LLLL-0004", false]]) {
      const m = betrieb("m-a", [], { selbstAngelegt: vorher, status: "test" });
      m.personen.push({ id: "l1", vorname: "L", nachname: "L", rolle: "leitung", bereich: "ALLE", email: "l@fremd.example" });
      const { r } = await raum(praefix, [m]);
      const token = await sitzung(r, code, "leitung", "l1");
      const g = await anfrage(daten, "/api/bestand", { methode: "GET", token });
      expect(g.status, g.text).toBe(200);
      const b = JSON.parse(JSON.stringify(g.bestand));
      b.mandanten[0].selbstAngelegt = !vorher;
      b.mandanten[0].name = `geändert-${code}`;
      const p = await anfrage(daten, "/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Test" } });
      expect(p.status, p.text).toBe(200);
      const nachher = (await B.bestandLesen(store, r)).bestand.mandanten[0];
      expect(nachher.name).toBe(`geändert-${code}`);
      expect(nachher.selbstAngelegt).toBe(vorher);
    }
  });
  it("Gegenprobe gewöhnlicher Raum: derselbe Anstoß verschickt die Mail", async () => {
    const { token } = await aufbauen("kunde-p3h-", "P3HB-KKKK-0002");
    const a = await anfrage(zustellung, "/zustellung/senden", { token, rumpf: { nachrichten: ["n-h1"] } });
    expect(a.status, a.text).toBe(200);
    expect(post.mails.map((x) => x.an)).toEqual(["opfer-a1@fremd.example"]);
  });
});
