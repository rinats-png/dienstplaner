/* ==========================================================================
   WP-30 — PUSH-ANMELDUNGEN, STATUS, ABMELDEN, LÖSCHUNG, AUSKUNFT (Handler)

   Über die echten Handler (daten.mjs, zustellung.mjs); Mail und Push sind
   ersetzt. Ein Raum, zwei Betriebe.

   - Anmelden: nur mit Sitzung, nur für die eigene Person (der Rumpf kann
     weder Person noch Betrieb bestimmen), Endpunkt nur von Push-Diensten
     (kein SSRF), Schlüssel in Form und Größe, Grenze je Betrieb, eine
     Anmeldung je Person.
   - Zustellstatus nur der eigenen Person, ohne Inhalt und Adresse.
   - Abmelden (Logout) räumt die Anmeldung der Sitzungsperson, nicht die anderer.
   - Wer aus dem Betrieb entfernt wird, verliert Anmeldung und Zustellstatus.
   - Auskunft nach Art. 15 enthält das eigene Zustellprotokoll.
   - Einstellungen (Sammelschalter): nur an der eigenen Person.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const post = vi.hoisted(() => ({ mails: [], pushes: [] }));
vi.mock("../server/lib/post.mjs", async (original) => ({
  ...(await original()),
  sendeMail: async (an, betreff, text) => { post.mails.push({ an, betreff, text }); return { ok: false, klasse: "temporaer", status: 503 }; },
}));
vi.mock("../server/lib/webpush.mjs", async (original) => ({
  ...(await original()),
  sendePush: async (anmeldung, titel, text, ziel) => { post.pushes.push({ endpoint: anmeldung && anmeldung.endpoint, titel, text, ziel }); return { ok: true }; },
}));

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, zustellung, kontoSchreiben, ablageSchluessel, B, V;
let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.7.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
const lies = (t) => anfrage(daten, "/api/bestand", { methode: "GET", token: t });
async function schreibe(t, aendern) {
  const r = await lies(t);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0], b);
  return anfrage(daten, "/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
}
const betrieb = async (id) => (await B.bestandLesen(laden(), "mph")).bestand.mandanten.find((m) => m.id === id);
const ANM = (e, extra = {}) => ({ anmeldung: { endpoint: `https://push.example/${e}`, keys: { p256dh: "BAbc_-12=", auth: "xy_-9" }, ...extra } });
const anmelden = (t, rumpf) => anfrage(zustellung, "/zustellung/anmelden", { token: t, rumpf });
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], email: `${id}@kunde.example`, ...extra });

const T = {};
async function sitzung(code, rolle, personId, betriebNr, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${personId}`, bestand: "mph", rolle, person: personId,
    betrieb: betriebNr, ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-mailpush-handler-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ZUSTELL_BACKOFF = "0,0";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["zustellen", "schreiben", "auskunft"]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  zustellung = (await import("../server/funktionen/zustellung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/versand.mjs");
  await B.bestandSchreiben(laden(), "mph", { version: 9, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }], personen: [
      person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("ausz", "mitarbeiter"), person("p1", "planer", { bereich: "ALLE" }),
      person("l1", "leitung", { bereich: "ALLE" })],
    abweichungen: {}, notrufe: [], anfragen: [],
    nachrichten: [{ id: "n-ausz", personId: "ausz", art: "planFreigegeben", titel: "T", text: "X", ziel: "meine", zeit: "x",
      erstellt: new Date().toISOString(), gelesen: false, dringend: false }] },
    { id: "m-b", name: "B", einheiten: [{ id: "e1" }], personen: [person("b1", "mitarbeiter")], abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [] },
  ] }, { durch: "Pruefung" });
  T.a1 = await sitzung("MPH1-AAAA-0001", "mitarbeiter", "a1", 0, "m-a");
  T.a2 = await sitzung("MPH2-AAAA-0002", "mitarbeiter", "a2", 0, "m-a");
  T.ausz = await sitzung("MPH3-AAAA-0003", "mitarbeiter", "ausz", 0, "m-a");
  T.p1 = await sitzung("MPH4-PPPP-0004", "planer", "p1", 0, "m-a");
  T.l1 = await sitzung("MPH5-LLLL-0005", "leitung", "l1", 0, "m-a");
  T.b1 = await sitzung("MPH6-BBBB-0006", "mitarbeiter", "b1", 1, "m-b");
  T.betr = await sitzung("MPH7-BTRB-0007", "betreiber", null, 0, null);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => { post.mails.length = 0; post.pushes.length = 0; });

describe("Anmelden: nur mit Sitzung, nur eigene Person", () => {
  it("ohne Sitzung: 401, nichts gespeichert", async () => {
    expect((await anmelden(null, ANM("x"))).status).toBe(401);
    expect((await anfrage(zustellung, "/zustellung/status", { methode: "GET" })).status).toBe(401);
  });
  it("Betreiber (keine Person): 400", async () => {
    expect((await anmelden(T.betr, ANM("betr"))).status).toBe(400);
  });
  it("Person und Betrieb im Rumpf bestimmen nichts: gespeichert wird unter der Person der Sitzung", async () => {
    const r = await anmelden(T.a1, { personId: "a2", person: "a2", mandantId: "m-b", betrieb: 1, ...ANM("a1-geraet") });
    expect(r.status, r.text).toBe(200);
    expect(await laden().get("push:mph:m-a:a1", { type: "json" })).toMatchObject({ endpoint: "https://push.example/a1-geraet" });
    expect(await laden().get("push:mph:m-a:a2", { type: "json" })).toBeNull();
    expect(await laden().get("push:mph:m-b:a2", { type: "json" })).toBeNull();
    expect(await laden().get("push:mph:m-b:a1", { type: "json" })).toBeNull();
  });
  it("je Person genau eine Anmeldung: die neue ersetzt die alte", async () => {
    await anmelden(T.a2, ANM("a2-alt"));
    await anmelden(T.a2, ANM("a2-neu"));
    expect(await laden().get("push:mph:m-a:a2", { type: "json" })).toMatchObject({ endpoint: "https://push.example/a2-neu" });
    expect((await laden().list({ prefix: "push:mph:m-a:a2" })).blobs).toHaveLength(1);
  });
  it("gespeichert wird nur endpoint, expirationTime und die Schlüssel — Zusatzfelder des Clients fallen weg", async () => {
    await anmelden(T.p1, ANM("p1", { rolle: "leitung", zusatz: "x", keys: { p256dh: "abc", auth: "def", evil: "x" } }));
    expect(await laden().get("push:mph:m-a:p1", { type: "json" })).toEqual({ endpoint: "https://push.example/p1", expirationTime: null, keys: { p256dh: "abc", auth: "def" } });
  });
  it("Endpunkte interner und fremder Ziele: 400 (der Server sendet später dorthin)", async () => {
    for (const e of ["http://push.example/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://evil.com/x",
      "https://localhost:8080/", "https://user:pw@fcm.googleapis.com/x", "file:///etc/passwd"]) {
      const r = await anmelden(T.l1, { anmeldung: { endpoint: e, keys: {} } });
      expect(r.status, e).toBe(400);
    }
    expect(await laden().get("push:mph:m-a:l1", { type: "json" })).toBeNull();
  });
  it("Schlüssel mit fremden Zeichen oder zu lang, falsche Typen, zu großer Rumpf: 400", async () => {
    for (const a of [ANM("k1", { keys: { p256dh: "<script>", auth: "a" } }).anmeldung, ANM("k2", { keys: { p256dh: "a".repeat(200), auth: "a" } }).anmeldung,
      ANM("k3", { keys: { p256dh: 5, auth: "a" } }).anmeldung, ANM("k4", { expirationTime: "morgen" }).anmeldung,
      ANM("k5", { keys: { p256dh: "a", auth: "a" }, zusatz: "x".repeat(5000) }).anmeldung])
      expect((await anmelden(T.l1, { anmeldung: a })).status, JSON.stringify(a).slice(0, 60)).toBe(400);
    expect((await anmelden(T.l1, { anmeldung: "https://push.example/x" })).status).toBe(400);
    expect((await anmelden(T.l1, {})).status).toBe(400);
  });
  it("Grenze je Betrieb: bei Erreichen 409, bereits angemeldete Personen können ihr Gerät weiter wechseln", async () => {
    const jetzt = (await laden().list({ prefix: "push:mph:m-a:" })).blobs.length;
    process.env.CENTRIC_PUSH_JE_BETRIEB_MAX = String(jetzt);
    try {
      expect((await anmelden(T.l1, ANM("l1-neu"))).status).toBe(409);
      expect((await anmelden(T.a1, ANM("a1-gewechselt"))).status).toBe(200);
    } finally { delete process.env.CENTRIC_PUSH_JE_BETRIEB_MAX; }
    expect((await anmelden(T.l1, ANM("l1"))).status).toBe(200);
  });
});

describe("Zustellstatus der eigenen Person", () => {
  it("jede Person sieht nur die Stati der eigenen Mitteilungen, ohne Inhalt, Adresse und Anbietertext", async () => {
    await schreibe(T.p1, (m) => { m.nachrichten.unshift(
      { id: "n-st-a1", personId: "a1", art: "planFreigegeben", titel: "GEHEIM-T", text: "GEHEIM-X", ziel: "meine", zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: false },
      { id: "n-st-a2", personId: "a2", art: "planFreigegeben", titel: "GEHEIM-T2", text: "GEHEIM-X2", ziel: "meine", zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: false }); });
    const z = await anfrage(zustellung, "/zustellung/senden", { token: T.p1, rumpf: { nachrichten: ["n-st-a1", "n-st-a2"] } });
    expect(z.status, z.text).toBe(200);
    const s1 = await anfrage(zustellung, "/zustellung/status", { methode: "GET", token: T.a1 });
    expect(s1.status).toBe(200);
    expect(s1.stand.every((x) => x.nachricht === "n-st-a1")).toBe(true);
    expect(s1.stand.find((x) => x.kanal === "mail")).toMatchObject({ stand: "zurueckgestellt", versuche: 1 });
    for (const v of ["GEHEIM", "kunde.example", "push.example", "http-503", "naechster"]) expect(s1.text).not.toContain(v);
    const s2 = await anfrage(zustellung, "/zustellung/status", { methode: "GET", token: T.a2 });
    expect(s2.stand.every((x) => x.nachricht === "n-st-a2")).toBe(true);
    const sb = await anfrage(zustellung, "/zustellung/status", { methode: "GET", token: T.b1 });
    expect(sb.stand).toEqual([]);
    expect((await anfrage(zustellung, "/zustellung/status", { methode: "GET", token: T.betr })).status).toBe(400);
  });
});

describe("Abmelden räumt die Anmeldung der Sitzungsperson", () => {
  it("Logout entfernt die eigene Anmeldung und nur diese; ein erneutes Anmelden ist möglich", async () => {
    await anmelden(T.a1, ANM("a1-logout")); await anmelden(T.a2, ANM("a2-bleibt"));
    expect((await anfrage(daten, "/api/abmelden", { token: T.a1 })).status).toBe(200);
    expect(await laden().get("push:mph:m-a:a1", { type: "json" })).toBeNull();
    expect(await laden().get("push:mph:m-a:a2", { type: "json" })).not.toBeNull();
    T.a1 = await sitzung("MPH1-AAAA-0101", "mitarbeiter", "a1", 0, "m-a");
    expect((await anmelden(T.a1, ANM("a1-neu-nach-login"))).status).toBe(200);
  });
});

describe("Person aus dem Betrieb entfernt: Anmeldung und Zustellstatus weg (Art. 17)", () => {
  it("die Leitung entfernt eine Person: Push-Anmeldung, Adresssperre und Status ihrer Mitteilungen werden gelöscht", async () => {
    await anmelden(T.ausz, ANM("ausz"));
    await anfrage(zustellung, "/zustellung/senden", { token: T.p1, rumpf: { nachrichten: ["n-ausz"] } });
    expect(await laden().getMetadata(V.statusSchluessel("mph", "m-a", "n-ausz", "mail"))).not.toBeNull();
    expect(await laden().getMetadata(V.pushSchluessel("mph", "m-a", "ausz"))).not.toBeNull();
    await laden().setJSON(V.sperrSchluessel("mph", "m-a", "ausz"), { adresse: "x", zeit: "x" });
    const w = await schreibe(T.l1, (m) => { m.personen = m.personen.filter((p) => p.id !== "ausz"); });
    expect(w.status, w.text).toBe(200);
    expect((await betrieb("m-a")).personen.some((p) => p.id === "ausz")).toBe(false);
    expect(await laden().getMetadata(V.pushSchluessel("mph", "m-a", "ausz"))).toBeNull();
    expect(await laden().getMetadata(V.sperrSchluessel("mph", "m-a", "ausz"))).toBeNull();
    expect(await laden().getMetadata(V.statusSchluessel("mph", "m-a", "n-ausz", "mail"))).toBeNull();
    expect(await laden().getMetadata(V.pushSchluessel("mph", "m-a", "a2"))).not.toBeNull();      // andere bleiben
  });
});

describe("Auskunft nach Art. 15 enthält das eigene Zustellprotokoll", () => {
  it("nur die eigene Person, ohne Inhalt, Adresse, Anbietertext", async () => {
    const r = await anfrage(daten, "/api/auskunft", { methode: "GET", token: T.a1 });
    expect(r.status, r.text).toBe(200);
    expect(Array.isArray(r.zustellprotokoll)).toBe(true);
    expect(r.zustellprotokoll.length).toBeGreaterThan(0);
    expect(r.zustellprotokoll.every((x) => x.nachricht === "n-st-a1")).toBe(true);
    for (const v of ["push.example/a2", "n-st-a2", "http-503"]) expect(JSON.stringify(r.zustellprotokoll)).not.toContain(v);
  });
  it("die Leitung erhält die Auskunft über andere ohne Zustellprotokoll (wie ohne Protokoll und Push-Angaben)", async () => {
    const r = await anfrage(daten, "/api/auskunft?person=a1", { methode: "GET", token: T.l1 });
    expect(r.status, r.text).toBe(200);
    expect(r.zustellprotokoll).toBeUndefined();
  });
});

describe("Einstellungen (Sammelschalter je Kanal): nur an der eigenen Person", () => {
  it("die Person schaltet ihre Kanäle ab; die Einstellung einer anderen Person ändert sie nicht", async () => {
    const w = await schreibe(T.a1, (m) => {
      m.personen.find((p) => p.id === "a1").zustellung = { kanal: { mail: false } };
      m.personen.find((p) => p.id === "a2").zustellung = { kanal: { mail: false, push: false } };
    });
    expect(w.status, w.text).toBe(200);
    const m = await betrieb("m-a");
    expect(m.personen.find((p) => p.id === "a1").zustellung).toEqual({ kanal: { mail: false } });
    expect(m.personen.find((p) => p.id === "a2").zustellung).toBeUndefined();
  });
  it("die Sammelschalter wirken auf den Versand: nichts geht an die abgeschaltete Person hinaus", async () => {
    await schreibe(T.p1, (m) => { m.nachrichten.unshift({ id: "n-aus-a1", personId: "a1", art: "planFreigegeben", titel: "T", text: "X", ziel: "meine",
      zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: false }); });
    post.mails.length = 0;
    await anfrage(zustellung, "/zustellung/senden", { token: T.p1, rumpf: { nachrichten: ["n-aus-a1"] } });
    expect(post.mails.filter((x) => x.an === "a1@kunde.example")).toEqual([]);
  });
  it("die Leitung sieht die Einstellungen anderer nicht (Sicht)", async () => {
    const m = (await lies(T.l1)).bestand.mandanten[0];
    expect(m.personen.find((p) => p.id === "a1").zustellung).toBeUndefined();
  });
});

describe("Mitteilung mit Tag (Entwurfsregel): der Client kann den Tag setzen, der Server hält sich daran", () => {
  it("Planung legt eine Mitteilung mit tag an; der Tag bleibt erhalten", async () => {
    const w = await schreibe(T.p1, (m) => { m.nachrichten.unshift({ id: "n-tag", personId: "a2", art: "planGeaendert", titel: "T", text: "X", ziel: "meine",
      zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: true, tag: "2099-03-04" }); });
    expect(w.status, w.text).toBe(200);
    expect((await betrieb("m-a")).nachrichten.find((n) => n.id === "n-tag").tag).toBe("2099-03-04");
  });
});
