/* ==========================================================================
   UNBEKANNTE ROLLEN AN DEN EINTRITTSPUNKTEN (Commit D1e)

   D1d sperrte /api für Sitzungen mit unbekannter Rolle. Entstehen konnte
   eine solche Sitzung aber weiterhin — über die Anmeldung mit Code, den
   Demozugang und die Kontoanmeldung —, und Kalender und Zustellung prüften
   die Rolle nicht. Über wirksameRolle galt zudem die Rolle der gebundenen
   Person: Ein Konto „gast" für eine Beschäftigte konnte Zustellungen
   anstoßen und /api nutzen.

   Invariante: unbekannte Rolle — keine Sitzung; eine schon bestehende
   bekommt außer Abmelden nichts, auch keinen Kalender und keine Zustellung.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [] }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text) => { post.mails.push({ an, betreff, text }); return { ok: true }; },
}));
vi.mock("../server/lib/webpush.mjs", () => ({
  sendePush: async (anmeldung, titel) => { post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel }); return { ok: true }; },
}));

const WIRT = "127.0.0.1:3000";
const RAUM = "eintritt";
const DEMO = "demo-eintritt";
let wurzel, laden, daten, kalender, zustellung, anmeldung, KEKS;
let kontoSchreiben, kontoLesen, ablageSchluessel, B, S, A, P, V;
let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token, keks } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.13.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, kopf: a.headers, ...d };
};
const sitzungsAblage = () => laden("centric-sitzungen");
const sitzungenZahl = async () => (await sitzungsAblage().list({ prefix: "t:" })).blobs.length;

const person = (id, rolle, einheit = "e1") => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", email: `${id}@example.test`, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const NID = "n-eintritt-1";
const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", einheiten: [{ id: "e1" }], standorte: [],
  dienstarten: [{ id: "F", name: "F" }], personen: [person("al", "leitung", "ALLE"), person("am", "mitarbeiter"), person("am2", "mitarbeiter")],
  abweichungen: {}, anfragen: [], notrufe: [], abwesenheiten: [],
  nachrichten: [{ id: NID, personId: "am2", art: "planGeaendert", titel: "T", text: "X", ziel: "meine", zeit: "x",
    erstellt: new Date().toISOString(), gelesen: false, dringend: true, quelle: { von: "am" } }] }] });

const code = (n) => `EIN${n}-AAAA-000${n}`;
async function konto(n, rolle, person, extra = {}) {
  await kontoSchreiben(laden(), ablageSchluessel(code(n)), { name: `Konto ${n}`, bestand: RAUM, rolle, person,
    betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z", ...extra });
}
const anmelden = (n) => anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code(n) } });
/** Eine Sitzung, wie sie vor D1e über die Anmeldung entstehen konnte. */
const altsitzung = async (rolle, person) => (await S.sitzungAnlegen({ bestand: RAUM, name: "Alt", rolle, person,
  betrieb: 0, mandantId: "m-a" }, S.DAUER_STANDARD)).token;

const UNBEKANNT = ["gast", "irgendwas", "", "Leitung"];
const T = {};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-rollen-eintritt-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = (name = "centric") => getStore({ name, consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  kalender = (await import("../server/funktionen/kalender.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
  const am = await import("../server/funktionen/anmeldung.mjs");
  anmeldung = am.default; KEKS = am.COOKIE;
  ({ kontoSchreiben, kontoLesen } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/sitzungen.mjs");
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  V = await import("../server/lib/versand.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  await B.bestandSchreiben(laden(), DEMO, { ...bestand(), mandanten: [{ ...bestand().mandanten[0], id: "m-d" }] }, { durch: "Pruefung" });
  await konto(1, "leitung", "al");
  await konto(2, "mitarbeiter", "am");
  for (const [i, r] of UNBEKANNT.entries()) await konto(3 + i, r, "am");
  T.leitung = (await anmelden(1)).token;
  T.mitarbeiter = (await anmelden(2)).token;
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => { post.mails.length = 0; post.pushes.length = 0; });

describe("Anmeldung mit Zugangscode", () => {
  it("bekannte Rollen: 200 mit Token", async () => {
    expect(T.leitung).toBeTruthy();
    expect(T.mitarbeiter).toBeTruthy();
  });
  for (const [i, r] of UNBEKANNT.entries()) {
    it(`Rolle ${JSON.stringify(r)}: 403, kein Token, keine Sitzung, Konto unverändert, Rolle nicht genannt`, async () => {
      const kontoVorher = JSON.stringify(await kontoLesen(laden(), ablageSchluessel(code(3 + i))));
      const vorher = await sitzungenZahl();
      const a = await anmelden(3 + i);
      expect(a.status, a.roh).toBe(403);
      expect(a.token).toBeUndefined();
      expect(a.roh).not.toMatch(/token|gueltigBis/i);
      if (r) expect(a.roh).not.toContain(r);
      expect(a.roh).not.toMatch(/rolle/i);
      expect(await sitzungenZahl()).toBe(vorher);
      expect(JSON.stringify(await kontoLesen(laden(), ablageSchluessel(code(3 + i))))).toBe(kontoVorher);
    });
  }
});

describe("Demozugang", () => {
  it("unbekannte Rolle: 403, keine Sitzung; bekannte Rolle weiter 200", async () => {
    await kontoSchreiben(laden(), ablageSchluessel("DEMO-GAST-0001"), { name: "Demo gast", bestand: DEMO, rolle: "gast",
      person: "am", betrieb: 0, mandantId: "m-d", demo: true, id: "demo-gast", angelegt: "2026-01-01T00:00:00.000Z" });
    await kontoSchreiben(laden(), ablageSchluessel("DEMO-MITA-0002"), { name: "Demo MA", bestand: DEMO, rolle: "mitarbeiter",
      person: "am", betrieb: 0, mandantId: "m-d", demo: true, id: "demo-ma", angelegt: "2026-01-01T00:00:00.000Z" });
    const vorher = await sitzungenZahl();
    const a = await anfrage(daten, "/api/demo", { rumpf: { id: "demo-gast" } });
    expect(a.status, a.roh).toBe(403);
    expect(a.token).toBeUndefined();
    expect(await sitzungenZahl()).toBe(vorher);
    const b = await anfrage(daten, "/api/demo", { rumpf: { id: "demo-ma" } });
    expect(b.status, b.roh).toBe(200);
    expect(b.token).toBeTruthy();
  });
});

describe("Kontoanmeldung (Arbeitsbereich wählen)", () => {
  const GUT = "Nordwind und Sonne 1846";
  async function angemeldetMit(rolleGespeichert, mail) {
    const s = laden();
    const e = await A.accountAnlegen(s, { email: mail });
    await A.emailBestaetigen(s, e.account.id);
    await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
    const mg = await A.mitgliedschaftAnlegen(s, { accountId: e.account.id, raum: RAUM, betrieb: 0, mandantId: "m-a",
      person: "am", rolle: "mitarbeiter", einheit: null, status: "aktiv" });
    expect(mg.ok, JSON.stringify(mg)).toBe(true);
    if (rolleGespeichert !== "mitarbeiter") {
      /* Altbestand: eine Mitgliedschaft mit einer Rolle, die es nicht gibt. */
      const k = A.mitgliedSchluessel(e.account.id, RAUM);
      await s.setJSON(k, { ...(await s.get(k, { type: "json" })), rolle: rolleGespeichert });
    }
    const an = await anfrage(anmeldung, "/api/account/anmelden", { rumpf: { email: mail, passwort: GUT } });
    expect(an.status, an.roh).toBe(200);
    const m = new RegExp(`${KEKS}=([^;]*)`).exec(String(an.kopf.get("set-cookie") || ""));
    return m[1];
  }
  it("Mitgliedschaft mit unbekannter Rolle: 403, keine Arbeitssitzung; bekannte Rolle 200", async () => {
    const keks = await angemeldetMit("gast", "gast-konto@example.test");
    const vorher = await sitzungenZahl();
    const w = await anfrage(anmeldung, "/api/account/betrieb", { rumpf: { raum: RAUM }, keks });
    expect(w.status, w.roh).toBe(403);
    expect(w.roh).not.toContain("gast");
    expect(await sitzungenZahl()).toBe(vorher);
    const keks2 = await angemeldetMit("mitarbeiter", "ma-konto@example.test");
    const w2 = await anfrage(anmeldung, "/api/account/betrieb", { rumpf: { raum: RAUM }, keks: keks2 });
    expect(w2.status, w2.roh).toBe(200);
  });
});

describe("Bestehende Sitzung mit unbekannter Rolle", () => {
  it("auch mit gebundener Person: /api 403 (nicht die Rolle der Person), Abmelden 200", async () => {
    for (const r of UNBEKANNT) {
      const t = await altsitzung(r, "am");
      const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: t });
      expect(g.status, `${JSON.stringify(r)} ${g.roh}`).toBe(403);
      expect(g.bestand).toBeUndefined();
      expect((await anfrage(daten, "/api/abmelden", { token: t })).status).toBe(200);
      expect((await anfrage(daten, "/api/bestand", { methode: "GET", token: t })).status).toBe(401);
    }
  });
  it("Kalender: einrichten, daten, löschen 403; bekannte Rolle unverändert", async () => {
    const ok = await anfrage(kalender, "/kalender/einrichten", { token: T.mitarbeiter, rumpf: {} });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.geheim).toBeTruthy();
    const dt = await anfrage(kalender, "/kalender/daten", { token: T.mitarbeiter, rumpf: { geheim: ok.geheim, name: "N", betrieb: "A",
      termine: [{ id: "d-t1", datum: "2026-12-01", von: "06:00", endDatum: "2026-12-01", bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }] } });
    expect(dt.status, dt.roh).toBe(200);
    for (const r of UNBEKANNT) {
      const t = await altsitzung(r, "am");
      for (const [pfad, rumpf] of [["/kalender/einrichten", {}], ["/kalender/daten", { geheim: ok.geheim, termine: [] }],
        ["/kalender/loeschen", {}]]) {
        const x = await anfrage(kalender, pfad, { token: t, rumpf });
        expect(x.status, `${JSON.stringify(r)} ${pfad} ${x.roh}`).toBe(403);
        expect(x.geheim).toBeUndefined();
      }
    }
    /* der Feed der Person besteht weiter — die Absagen haben nichts gelöscht */
    const f = await anfrage(kalender, `/kalender/feed/${ok.geheim}.ics`, { methode: "GET" });
    expect(f.status).toBe(200);
  });
  it("Zustellung: kein Versand, keine Mail, kein Push, kein Status; Gerät anmelden 403, abmelden 200", async () => {
    for (const r of UNBEKANNT) {
      const t = await altsitzung(r, "am");
      const s = await anfrage(zustellung, "/zustellung/senden", { token: t, rumpf: { nachrichten: [NID] } });
      expect(s.status, `${JSON.stringify(r)} ${s.roh}`).toBe(403);
      expect(post.mails).toEqual([]);
      expect(post.pushes).toEqual([]);
      for (const kanal of ["mail", "push"])
        expect(await laden().get(V.statusSchluessel(RAUM, "m-a", NID, kanal), { type: "json" }).catch(() => null)).toBeNull();
      const an = await anfrage(zustellung, "/zustellung/anmelden", { token: t,
        rumpf: { anmeldung: { endpoint: "https://push.example/gast", keys: { p256dh: "k", auth: "a" } } } });
      expect(an.status, an.roh).toBe(403);
      expect((await anfrage(zustellung, "/zustellung/abmelden", { token: t })).status).toBe(200);
    }
    /* Gegenstück: dieselbe Mitteilung stößt die Person selbst (eigener Vorgang) an */
    const ich = await anfrage(zustellung, "/zustellung/senden", { token: T.mitarbeiter, rumpf: { nachrichten: [NID] } });
    expect(ich.status, ich.roh).toBe(200);
    expect(post.mails.length).toBeGreaterThan(0);
  });
});
