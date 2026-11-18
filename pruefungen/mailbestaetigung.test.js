/* ==========================================================================
   E-9 — BESTÄTIGUNG DER PERSONENADRESSE (lib/mailbestaetigung.mjs,
   /zustellung/mailbestaetigung*, Versandregel in lib/versand.mjs)

   Befund docs/acc45/BEFUND-VERSAND-UNVERIFIZIERTE-EMAIL.md §4:
   - Schalter CENTRIC_MAILBESTAETIGUNG: aus (Vorgabe, 404, Versand wie bisher),
     angebot (Weg da, Versand wie bisher), pflicht (Mail nur an bestätigte).
   - Anfordern nur für die eigene, gespeicherte Adresse; fester Inhalt ohne
     Betriebs- und Personennamen; der Code steht nie in einer Antwort.
   - Code einmalig, an Person und Adresse gebunden, Frist, Fehlversuche,
     Kontingente je Person/Adresse/Betrieb, Test-/Demoräume nur mit Freigabe.
   - Eine geänderte Adresse ist unbestätigt; Entfernen der Person räumt.
   - Wächter: Zugangs-/Wiederherstellungsmails nie an `person.email`.
   ========================================================================== */
// zeit-ok: Die Handlerwege laufen auf der echten Uhr (Sitzungen, Alter der Mitteilungen); Fristen und Tagesgrenzen werden über die Bibliothek mit festem `jetzt` geprüft (FEST).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const post = vi.hoisted(() => ({ mails: [] }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text) => { post.mails.push({ an, betreff, text }); return { ok: true, trocken: true }; },
}));

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIRT = "127.0.0.1:3000";
const FEST = Date.parse("2026-11-18T09:00:00.000Z");
let wurzel, laden, daten, zustellung, kontoSchreiben, ablageSchluessel, B, V, MB;
let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.9.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
const stand = (t) => anfrage(zustellung, "/zustellung/mailbestaetigung", { methode: "GET", token: t });
const anfordern = (t, rumpf) => anfrage(zustellung, "/zustellung/mailbestaetigung/anfordern", { token: t, rumpf });
const einloesen = (t, code) => anfrage(zustellung, "/zustellung/mailbestaetigung/bestaetigen", { token: t, rumpf: { code } });
const codeAus = (mail) => (/Bestätigungscode: ([A-Z0-9-]+)/.exec(mail.text) || [])[1];
const betrieb = async (raum, id) => {
  const g = await B.bestandLesen(laden(), raum);
  return { bestand: g.bestand, m: g.bestand.mandanten.find((x) => x.id === id) };
};
const person = (id, rolle, extra = {}) => ({ id, vorname: `Vorname-${id}`, nachname: `Nachname-${id}`, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], email: `${id}@kunde.example`, ...extra });
async function schreibe(t, aendern) {
  const r = await anfrage(daten, "/api/bestand", { methode: "GET", token: t });
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0], b);
  return anfrage(daten, "/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
}
const T = {};
async function sitzung(code, rolle, personId, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${personId}`, bestand: "mb", rolle, person: personId,
    betrieb: 0, ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-mailbest-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ZUSTELL_BACKOFF = "0,0";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/versand.mjs");
  MB = await import("../server/lib/mailbestaetigung.mjs");
  await B.bestandSchreiben(laden(), "mb", { version: 9, mandanten: [
    { id: "m-a", name: "Haus-GEHEIM", einheiten: [{ id: "e1" }], personen: [
      person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("a3", "mitarbeiter"), person("ohne", "mitarbeiter", { email: null }),
      person("p1", "planer", { bereich: "ALLE" }), person("l1", "leitung", { bereich: "ALLE" })],
    abweichungen: {}, notrufe: [], anfragen: [], nachrichten: [] },
  ] }, { durch: "Pruefung" });
  T.a1 = await sitzung("MBA1-AAAA-0001", "mitarbeiter", "a1", "m-a");
  T.a2 = await sitzung("MBA2-AAAA-0002", "mitarbeiter", "a2", "m-a");
  T.ohne = await sitzung("MBA3-AAAA-0003", "mitarbeiter", "ohne", "m-a");
  T.p1 = await sitzung("MBP1-PPPP-0004", "planer", "p1", "m-a");
  T.l1 = await sitzung("MBL1-LLLL-0005", "leitung", "l1", "m-a");
  T.betr = await sitzung("MBB1-BTRB-0006", "betreiber", null, null);
});
afterAll(async () => { delete process.env.CENTRIC_MAILBESTAETIGUNG; await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => { post.mails.length = 0; process.env.CENTRIC_MAILBESTAETIGUNG = "angebot"; });

describe("Schalter", () => {
  it("Vorgabe aus: alle drei Wege 404, nichts verschickt", async () => {
    for (const w of [undefined, "", "ja", "an"]) {
      if (w === undefined) delete process.env.CENTRIC_MAILBESTAETIGUNG; else process.env.CENTRIC_MAILBESTAETIGUNG = w;
      expect(MB.mailbestaetigungModus()).toBe("aus");
      expect((await stand(T.a1)).status).toBe(404);
      expect((await anfordern(T.a1)).status).toBe(404);
      expect((await einloesen(T.a1, "ABCD-EFGH-JKLM")).status).toBe(404);
    }
    expect(post.mails).toEqual([]);
  });
  it("ohne Sitzung 401, Betreiber ohne Person 400, falsches Verfahren 404", async () => {
    expect((await stand(null)).status).toBe(401);
    expect((await anfordern(null)).status).toBe(401);
    expect((await stand(T.betr)).status).toBe(400);
    expect((await anfordern(T.betr)).status).toBe(400);
    expect((await anfrage(zustellung, "/zustellung/mailbestaetigung", { token: T.a1 })).status).toBe(404);
    expect((await anfrage(zustellung, "/zustellung/mailbestaetigung/anfordern", { methode: "GET", token: T.a1 })).status).toBe(404);
  });
});

describe("Anfordern und Einlösen über die Handler", () => {
  it("Stand: nur ja/nein, nie die Adresse", async () => {
    const r = await stand(T.a1);
    expect(r.status, r.text).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ modus: "angebot", adresse: true, bestaetigt: false, ausstehend: false });
    expect(r.text).not.toContain("kunde.example");
    expect((await stand(T.ohne))).toMatchObject({ adresse: false });
    expect((await anfordern(T.ohne)).status).toBe(400);
  });
  it("der Rumpf bestimmt weder Adresse noch Inhalt; fester Text ohne Namen; der Code steht nicht in der Antwort", async () => {
    const r = await anfordern(T.a1, { email: "opfer@fremd.example", an: "opfer@fremd.example", text: "Klick hier", betreff: "X", person: "a2" });
    expect(r.status, r.text).toBe(200);
    expect(post.mails).toHaveLength(1);
    const [m] = post.mails;
    expect(m.an).toBe("a1@kunde.example");
    const code = codeAus(m);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const v of ["Haus-GEHEIM", "Vorname-a1", "Nachname-a1", "Klick hier", "fremd.example", "http://", "#", "="]) expect(m.text + m.betreff, v).not.toContain(v);
    expect(r.text).not.toContain(code);
    expect(r.text).not.toContain(code.replace(/-/g, ""));
    expect(await stand(T.a1)).toMatchObject({ ausstehend: true, bestaetigt: false });
    /* Ablage: nur der Hash, nie der Code oder die Adresse im Klartext. */
    const roh = JSON.stringify(await laden().get(MB.codeSchluessel("mb", "m-a", "a1"), { type: "json" }));
    expect(roh).not.toContain(code.replace(/-/g, ""));
    expect(roh).not.toContain("kunde.example");
    T.code_a1 = code;
  });
  it("ein neuer Code frühestens nach 60 Sekunden: 429", async () => {
    const r = await anfordern(T.a1);
    expect(r.status).toBe(429);
    expect(post.mails).toEqual([]);
  });
  it("falscher Code 400; eine andere Person kann den Code nicht einlösen", async () => {
    expect((await einloesen(T.a1, "AAAA-BBBB-CCCC")).status).toBe(400);
    expect((await einloesen(T.a2, T.code_a1)).status).toBe(400);
    expect((await einloesen(T.l1, T.code_a1)).status).toBe(400);
    expect(await stand(T.a2)).toMatchObject({ bestaetigt: false });
  });
  it("richtiger Code (auch klein, ohne Striche): bestätigt; ein zweites Einlösen 400 (einmalig)", async () => {
    const r = await einloesen(T.a1, T.code_a1.replace(/-/g, "").toLowerCase());
    expect(r.status, r.text).toBe(200);
    expect(await stand(T.a1)).toMatchObject({ bestaetigt: true, ausstehend: false });
    expect((await einloesen(T.a1, T.code_a1)).status).toBe(400);
    expect((await anfordern(T.a1)).status).toBe(409);                   // schon bestätigt: keine Mail
    expect(post.mails).toEqual([]);
  });
  it("die Bestätigung steht nicht im Bestand und lässt sich über ihn nicht setzen", async () => {
    const w = await schreibe(T.l1, (m) => { const p = m.personen.find((x) => x.id === "a2");
      Object.assign(p, { emailBestaetigtAm: "2026-01-01T00:00:00.000Z", mailBestaetigt: true }); });
    expect(w.status, w.text).toBe(200);
    expect(await stand(T.a2)).toMatchObject({ bestaetigt: false });
    expect(JSON.stringify((await betrieb("mb", "m-a")).m)).not.toMatch(/mailbest/);
  });
  it("eine geänderte Adresse ist unbestätigt; die alte Bestätigung gilt für die neue nicht", async () => {
    let w = await schreibe(T.a1, (m) => { m.personen.find((x) => x.id === "a1").email = "a1-neu@kunde.example"; });
    expect(w.status, w.text).toBe(200);
    expect(await stand(T.a1)).toMatchObject({ bestaetigt: false });
    w = await schreibe(T.a1, (m) => { m.personen.find((x) => x.id === "a1").email = "A1@Kunde.Example"; });   // zurück (Groß/klein egal)
    expect(w.status, w.text).toBe(200);
    expect(await stand(T.a1)).toMatchObject({ bestaetigt: true });
  });
  it("fünf Fehlversuche verbrauchen den Code", async () => {
    expect((await anfordern(T.a2)).status).toBe(200);
    const code = codeAus(post.mails[0]);
    for (let i = 0; i < 5; i++) expect((await einloesen(T.a2, "ZZZZ-ZZZZ-ZZZZ")).status).toBe(400);
    expect((await einloesen(T.a2, code)).status).toBe(400);
    expect(await stand(T.a2)).toMatchObject({ bestaetigt: false, ausstehend: false });
  });
});

describe("Bibliothek mit fester Uhr: Frist, Tagesgrenzen, Test-/Demoräume", () => {
  const MAILS = () => post.mails.length;
  it("ein Code verfällt nach 30 Minuten; eine Adressänderung dazwischen verbraucht ihn", async () => {
    const { m } = await betrieb("mb", "m-a");
    const p = m.personen.find((x) => x.id === "a3");
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m, p, jetzt: FEST })).toEqual({ ok: true, trocken: true });
    const code = codeAus(post.mails.at(-1));
    expect(await MB.bestaetigen(laden(), { raum: "mb", m, p, code, jetzt: FEST + MB.CODE_FRIST_MS + 1 })).toEqual({ ok: false, grund: "ungueltig" });
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m, p, jetzt: FEST + 120_000 })).toMatchObject({ ok: true });
    const code2 = codeAus(post.mails.at(-1));
    expect(await MB.bestaetigen(laden(), { raum: "mb", m, p: { ...p, email: "anders@kunde.example" }, code: code2, jetzt: FEST + 130_000 }))
      .toEqual({ ok: false, grund: "ungueltig" });
    expect(await MB.bestaetigen(laden(), { raum: "mb", m, p, code: code2, jetzt: FEST + 140_000 })).toEqual({ ok: false, grund: "ungueltig" });
  });
  it("je Person höchstens 3 am Tag (danach „kontingent“, keine Mail)", async () => {
    const { m } = await betrieb("mb", "m-a");
    const p = m.personen.find((x) => x.id === "a3");
    // a3 hat heute (FEST) schon 2 angefordert
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m, p, jetzt: FEST + 300_000 })).toMatchObject({ ok: true });
    const vorher = MAILS();
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m, p, jetzt: FEST + 400_000 })).toEqual({ ok: false, grund: "kontingent" });
    expect(MAILS()).toBe(vorher);
    /* am nächsten Tag wieder */
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m, p, jetzt: FEST + 24 * 3600_000 })).toMatchObject({ ok: true });
  });
  it("je Adresse höchstens 3 am Tag — über Personen und Betriebe hinweg (kein Mail-Bombing einer fremden Adresse)", async () => {
    const opfer = "opfer@fremd.example";
    const tag = FEST + 3 * 24 * 3600_000;
    const ms = ["x1", "x2"].map((id) => ({ id, name: id, personen: [] }));
    const ergebnisse = [];
    for (let i = 0; i < 5; i++) {
      const m = ms[i % 2];
      ergebnisse.push(await MB.bestaetigungAnfordern(laden(), { raum: `r${i}`, m, p: { id: `q${i}`, email: opfer }, jetzt: tag + i * 1000 }));
    }
    expect(ergebnisse.filter((r) => r.ok)).toHaveLength(MB.TAG_JE_ADRESSE);
    expect(ergebnisse.slice(MB.TAG_JE_ADRESSE).every((r) => r.grund === "kontingent")).toBe(true);
  });
  it("je Betrieb höchstens 30 am Tag", async () => {
    const tag = FEST + 5 * 24 * 3600_000;
    const m = { id: "m-gross", name: "G", personen: [] };
    let ok = 0, nein = 0;
    for (let i = 0; i < MB.TAG_JE_BETRIEB + 2; i++) {
      const r = await MB.bestaetigungAnfordern(laden(), { raum: "rg", m, p: { id: `g${i}`, email: `g${i}@kunde.example` }, jetzt: tag });
      if (r.ok) ok += 1; else if (r.grund === "kontingent") nein += 1;
    }
    expect([ok, nein]).toEqual([MB.TAG_JE_BETRIEB, 2]);
  }, 60_000);
  it("Test- und Demoräume: ohne Freigabe keine Mail; mit Freigabe innerhalb der Testraumgrenze", async () => {
    const m = { id: "m-t", name: "T", personen: [] };
    const p = { id: "t1", email: "t1@kunde.example" };
    for (const raum of ["t-abc", "demo-x"])
      expect(await MB.bestaetigungAnfordern(laden(), { raum, m, p, jetzt: FEST })).toEqual({ ok: false, grund: "testraum" });
    expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb2", m: { ...m, selbstAngelegt: true }, p, jetzt: FEST })).toEqual({ ok: false, grund: "testraum" });
    process.env.CENTRIC_TESTRAUM_MAIL = "ja"; process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX = "1";
    try {
      expect(await MB.bestaetigungAnfordern(laden(), { raum: "t-abc", m, p, jetzt: FEST })).toMatchObject({ ok: true });
      expect(await MB.bestaetigungAnfordern(laden(), { raum: "t-abc", m, p: { id: "t2", email: "t2@kunde.example" }, jetzt: FEST }))
        .toEqual({ ok: false, grund: "kontingent" });
    } finally { delete process.env.CENTRIC_TESTRAUM_MAIL; delete process.env.CENTRIC_TESTRAUM_MAIL_TAG_MAX; }
  });
  it("in der Auslieferung ohne Pfeffer lässt sich nichts bestätigen (fail-closed)", async () => {
    const pf = process.env.CENTRIC_PFEFFER, env = process.env.NODE_ENV;
    delete process.env.CENTRIC_PFEFFER; process.env.NODE_ENV = "production";
    try {
      expect(MB.adressWert("a@b.example")).toBeNull();
      expect(await MB.bestaetigungAnfordern(laden(), { raum: "mb", m: { id: "m-a" }, p: { id: "a3", email: "a3@kunde.example" }, jetzt: FEST }))
        .toEqual({ ok: false, grund: "nichtEingerichtet" });
    } finally {
      process.env.CENTRIC_PFEFFER = pf;
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    }
  });
});

describe("Versand: pflicht nur an bestätigte Adressen; angebot und aus wie bisher (Übergang)", () => {
  const neueMitteilung = async (id, personId) => {
    const w = await schreibe(T.p1, (m) => { m.nachrichten.unshift({ id, personId, art: "planFreigegeben", titel: "T", text: "X", ziel: "meine",
      zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: false }); });
    expect(w.status, w.text).toBe(200);
  };
  const status = (id) => laden().get(V.statusSchluessel("mb", "m-a", id, "mail"), { type: "json" });
  it("aus und angebot: auch die unbestätigte Adresse bekommt die Mail", async () => {
    for (const [modus, id] of [["aus", "n-aus"], ["angebot", "n-angebot"]]) {
      process.env.CENTRIC_MAILBESTAETIGUNG = modus;
      await neueMitteilung(id, "a2");
      post.mails.length = 0;
      expect((await anfrage(zustellung, "/zustellung/senden", { token: T.p1, rumpf: { nachrichten: [id] } })).status).toBe(200);
      expect(post.mails.map((x) => x.an), modus).toEqual(["a2@kunde.example"]);
      expect(await status(id)).toMatchObject({ status: "gesendet" });
    }
  });
  it("pflicht: unbestätigt → übersprungen (Grund „unbestaetigt“), bestätigt → gesendet", async () => {
    process.env.CENTRIC_MAILBESTAETIGUNG = "pflicht";
    await neueMitteilung("n-pf-a2", "a2");
    await neueMitteilung("n-pf-a1", "a1");
    post.mails.length = 0;
    expect((await anfrage(zustellung, "/zustellung/senden", { token: T.p1, rumpf: { nachrichten: ["n-pf-a2", "n-pf-a1"] } })).status).toBe(200);
    expect(post.mails.map((x) => x.an)).toEqual(["A1@Kunde.Example"]);
    expect(await status("n-pf-a2")).toMatchObject({ status: "uebersprungen", grund: "unbestaetigt" });
    expect(await status("n-pf-a1")).toMatchObject({ status: "gesendet" });
    const s = await anfrage(zustellung, "/zustellung/status", { methode: "GET", token: T.a2 });
    expect(s.stand.find((x) => x.nachricht === "n-pf-a2" && x.kanal === "mail")).toMatchObject({ stand: "uebersprungen", grund: "unbestaetigt" });
  });
  it("Auflage M2: „pflicht“ ohne Pfeffer in der Auslieferung wirkt als „angebot“ — Versand wie bisher, mit Warnung", async () => {
    const pf = process.env.CENTRIC_PFEFFER, env = process.env.NODE_ENV;
    process.env.CENTRIC_MAILBESTAETIGUNG = "pflicht";
    expect(MB.mailbestaetigungWarnung()).toBeNull();                       // mit Pfeffer: alles in Ordnung
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.CENTRIC_PFEFFER; process.env.NODE_ENV = "production";
    try {
      expect(MB.mailbestaetigungModus()).toBe("angebot");
      expect(MB.mailbestaetigungWarnung()).toMatch(/CENTRIC_PFEFFER fehlt.*angebot/);
      process.env.CENTRIC_MAILBESTAETIGUNG = "angebot";
      expect(MB.mailbestaetigungWarnung()).toMatch(/CENTRIC_PFEFFER fehlt/);
      process.env.CENTRIC_MAILBESTAETIGUNG = "pflicht";
      const { bestand, m } = await betrieb("mb", "m-a");
      const n = { id: "n-m2", personId: "a2", art: "planFreigegeben", titel: "T", text: "X", ziel: "meine", zeit: "x",
        erstellt: new Date().toISOString(), gelesen: false, dringend: false };
      post.mails.length = 0;
      await V.zustellen(laden(), { raum: "mb", bestand, m: { ...m, nachrichten: [n] }, ids: ["n-m2"] });
      expect(post.mails.map((x) => x.an)).toEqual(["a2@kunde.example"]);
    } finally {
      fehler.mockRestore();
      process.env.CENTRIC_PFEFFER = pf;
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    }
    expect(MB.mailbestaetigungModus()).toBe("pflicht");
  });
});

describe("Auflage M3: Quote für Leitung und Planung (nur Zähler)", () => {
  it("Leitung und Planung sehen {mitAdresse, unbestaetigt}, Beschäftigte nicht; keine Adressen", async () => {
    const { m } = await betrieb("mb", "m-a");
    const erwartet = await MB.bestaetigungsQuote(laden(), { raum: "mb", m });
    expect(erwartet.mitAdresse).toBe(m.personen.filter((p) => p.email).length);
    expect(erwartet.unbestaetigt).toBe(erwartet.mitAdresse - 1);           // nur a1 ist bestätigt
    for (const t of [T.l1, T.p1]) {
      const r = await stand(t);
      expect(r.status, r.text).toBe(200);
      expect(r.quote).toEqual(erwartet);
      expect(r.text).not.toContain("kunde.example");
    }
    expect((await stand(T.a2)).quote).toBeUndefined();
  });
  it("Folgepunkt L3: blockweise gelesen und kurz gemerkt — gleiche Zähler, neue Adressen sofort, Bestätigen verwirft", async () => {
    MB.quoteVergessen();
    const viele = { id: "m-viel", personen: Array.from({ length: MB.QUOTE_BLOCK * 2 + 7 }, (_, i) =>
      ({ id: `v${i}`, email: i % 9 === 0 ? null : `v${i}@viel.example`, ...(i === 5 ? { anonym: true } : {}) })) };
    const erwartetMit = viele.personen.filter((p) => p.email && !p.anonym).length;
    for (const p of viele.personen.filter((x) => x.email && Number(x.id.slice(1)) % 4 === 0))
      await laden().setJSON(MB.bestaetigtSchluessel("mbq", "m-viel", p.id), { adresse: MB.adressWert(p.email), am: "x" });
    const bestaetigtSoll = viele.personen.filter((p) => p.email && !p.anonym && Number(p.id.slice(1)) % 4 === 0).length;
    const q1 = await MB.bestaetigungsQuote(laden(), { raum: "mbq", m: viele, jetzt: FEST });
    expect(q1).toEqual({ mitAdresse: erwartetMit, unbestaetigt: erwartetMit - bestaetigtSoll });
    /* Ein Eintrag an den Wegen vorbei: innerhalb der Frist unverändert, danach neu gerechnet */
    await laden().setJSON(MB.bestaetigtSchluessel("mbq", "m-viel", "v1"), { adresse: MB.adressWert("v1@viel.example"), am: "x" });
    expect(await MB.bestaetigungsQuote(laden(), { raum: "mbq", m: viele, jetzt: FEST + 1000 })).toEqual(q1);
    const q2 = await MB.bestaetigungsQuote(laden(), { raum: "mbq", m: viele, jetzt: FEST + MB.QUOTE_FRIST_MS + 1 });
    expect(q2).toEqual({ mitAdresse: erwartetMit, unbestaetigt: q1.unbestaetigt - 1 });
    /* Geänderte Adresse: sofort neu (Fingerabdruck), ohne Adresse im Merker */
    const geaendert = { ...viele, personen: viele.personen.map((p) => (p.id === "v1" ? { ...p, email: "anders@viel.example" } : p)) };
    expect(await MB.bestaetigungsQuote(laden(), { raum: "mbq", m: geaendert, jetzt: FEST + MB.QUOTE_FRIST_MS + 2 }))
      .toEqual({ mitAdresse: erwartetMit, unbestaetigt: q1.unbestaetigt });
    /* Entfernen verwirft den Merker des Betriebs */
    await MB.bestaetigungEntfernen(laden(), "mbq", "m-viel", "v4");
    expect(await MB.bestaetigungsQuote(laden(), { raum: "mbq", m: geaendert, jetzt: FEST + MB.QUOTE_FRIST_MS + 3 }))
      .toEqual({ mitAdresse: erwartetMit, unbestaetigt: q1.unbestaetigt + 1 });
  });
});

describe("Auflage N1/N4: Adressbremse normalisiert; Auskunft nennt den Bestätigungszeitpunkt", () => {
  it("bremsAdresse: +tag, Groß/klein, IDN zählen zusammen", () => {
    expect(MB.bremsAdresse("Opfer+eins@Fremd.Example")).toBe("opfer@fremd.example");
    expect(MB.bremsAdresse("opfer@fremd.example")).toBe("opfer@fremd.example");
    expect(MB.bremsAdresse("x@bücher.example")).toBe("x@xn--bcher-kva.example");
  });
  it("Tagesgrenze je Adresse gilt über +tag-Varianten hinweg", async () => {
    const tag = FEST + 7 * 24 * 3600_000;
    const varianten = ["ziel@fremd.example", "ziel+a@fremd.example", "Ziel+b@FREMD.example", "ziel+c@fremd.example"];
    const r = [];
    for (const [i, email] of varianten.entries())
      r.push(await MB.bestaetigungAnfordern(laden(), { raum: `rn${i}`, m: { id: `mn${i}` }, p: { id: `n${i}`, email }, jetzt: tag }));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r[3]).toEqual({ ok: false, grund: "kontingent" });
  });
  it("Auskunft nach Art. 15 (selbst): emailBestaetigtAm der aktuellen Adresse; unbestätigt null", async () => {
    const a1 = await anfrage(daten, "/api/auskunft", { methode: "GET", token: T.a1 });
    expect(a1.status, a1.text).toBe(200);
    expect(a1.emailBestaetigtAm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const a2 = await anfrage(daten, "/api/auskunft", { methode: "GET", token: T.a2 });
    expect(a2.emailBestaetigtAm).toBeNull();
    const durchLeitung = await anfrage(daten, "/api/auskunft?person=a1", { methode: "GET", token: T.l1 });
    expect(durchLeitung.emailBestaetigtAm).toBeUndefined();
  });
});

describe("Person entfernt: Bestätigung und offener Code weg (Art. 17); Aufräumen räumt Waisen und abgelaufene Codes", () => {
  it("personBereinigen und zustellungAufraeumen", async () => {
    await laden().setJSON(MB.codeSchluessel("mb", "m-a", "a1"), { hash: "x", adresse: "y", ablauf: "2000-01-01T00:00:00.000Z" });
    expect(await laden().getMetadata(MB.bestaetigtSchluessel("mb", "m-a", "a1"))).not.toBeNull();
    await V.personBereinigen(laden(), "mb", "m-a", "a1");
    expect(await laden().getMetadata(MB.bestaetigtSchluessel("mb", "m-a", "a1"))).toBeNull();
    expect(await laden().getMetadata(MB.codeSchluessel("mb", "m-a", "a1"))).toBeNull();
    /* Waise: Person gibt es nicht; abgelaufener Code einer vorhandenen Person */
    await laden().setJSON(MB.bestaetigtSchluessel("mb", "m-a", "gibtsnicht"), { adresse: "x", am: "x" });
    await laden().setJSON(MB.codeSchluessel("mb", "m-a", "a2"), { hash: "x", adresse: "y", ablauf: "2000-01-01T00:00:00.000Z" });
    await laden().setJSON(MB.codeSchluessel("mb", "m-a", "p1"), { hash: "x", adresse: "y", ablauf: "2999-01-01T00:00:00.000Z" });
    await V.zustellungAufraeumen(laden(), { jetzt: FEST });
    expect(await laden().getMetadata(MB.bestaetigtSchluessel("mb", "m-a", "gibtsnicht"))).toBeNull();
    expect(await laden().getMetadata(MB.codeSchluessel("mb", "m-a", "a2"))).toBeNull();
    expect(await laden().getMetadata(MB.codeSchluessel("mb", "m-a", "p1"))).not.toBeNull();
  });
});

describe("Folgepunkt N4: Anonymisieren räumt die Bestätigung sofort", () => {
  it("PUT mit anonymisierter Person: mailbest/mailbestcode weg, andere Personen unberührt", async () => {
    await laden().setJSON(MB.bestaetigtSchluessel("mb", "m-a", "a3"), { adresse: "x", am: "x" });
    await laden().setJSON(MB.codeSchluessel("mb", "m-a", "a3"), { hash: "x", adresse: "y", ablauf: "2999-01-01T00:00:00.000Z" });
    await laden().setJSON(MB.bestaetigtSchluessel("mb", "m-a", "a2"), { adresse: "x", am: "x" });
    const r = await schreibe(T.l1, (m) => {
      const i = m.personen.findIndex((p) => p.id === "a3");
      m.personen[i] = { ...m.personen[i], vorname: "", nachname: "Ausgeschieden a3", email: "", anonym: true };
    });
    expect(r.status, r.text).toBe(200);
    expect(await laden().getMetadata(MB.bestaetigtSchluessel("mb", "m-a", "a3"))).toBeNull();
    expect(await laden().getMetadata(MB.codeSchluessel("mb", "m-a", "a3"))).toBeNull();
    expect(await laden().getMetadata(MB.bestaetigtSchluessel("mb", "m-a", "a2"))).not.toBeNull();
  });
});

describe("Wächter (Befund §4.1): Zugangs- und Wiederherstellungsinformationen nie an person.email", () => {
  it("nur registrierung.mjs (Konto-Adresse), versand.mjs (Hinweis ohne Geheimnis) und mailbestaetigung.mjs verschicken Mail", async () => {
    const dateien = [];
    const sammeln = async (dir) => {
      for (const e of await readdir(path.join(WURZEL, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) await sammeln(p); else if (e.name.endsWith(".mjs")) dateien.push(p);
      }
    };
    await sammeln("server");
    const nutzer = [];
    for (const d of dateien) {
      const t = await readFile(path.join(WURZEL, d), "utf8");
      if (/import\s*\{[^}]*\bsendeMail\b[^}]*\}\s*from\s*["'][^"']*post\.mjs["']/.test(t) || /\bsendeSmtp\b/.test(t) && !d.endsWith("post.mjs") && !d.endsWith("post-smtp.mjs"))
        nutzer.push(d);
    }
    expect(nutzer.sort()).toEqual(["server/lib/mailbestaetigung.mjs", "server/lib/registrierung.mjs", "server/lib/versand.mjs"]);
    const reg = await readFile(path.join(WURZEL, "server/lib/registrierung.mjs"), "utf8");
    expect(reg).not.toMatch(/\bpersonen\b|\bperson\.email\b|\bp\.email\b/);
    const mb = await readFile(path.join(WURZEL, "server/lib/mailbestaetigung.mjs"), "utf8");
    expect([...mb.matchAll(/sendeMail\(\s*([A-Za-z_]+)/g)].map((x) => x[1])).toEqual(["an"]);
    expect(mb).toMatch(/const an = personAdresse\(p\);/);
  });
});
