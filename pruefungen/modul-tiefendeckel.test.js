/* ==========================================================================
   WP-19.5 — TIEFENDECKEL AM EINGANG (Review #502 H1)

   `gleich`/`stabil` (branchenmodule.mjs) und JSON.stringify sind rekursiv. Ein Rumpf mit einigen tausend
   Verschachtelungsebenen warf dort RangeError: nur diese Anfrage, kein Datenschaden, aber ein Serverfehler
   statt eines Fehlers des Aufrufers. Jetzt prüft rumpfLesen (daten.mjs) die Tiefe iterativ (rumpftiefe.mjs)
   und weist mit 400 ab, bevor eine rekursive Funktion läuft. Alles über die echten Handler.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zuTief, rumpfTiefe, RUMPF_TIEFE_MAX } from "../server/lib/rumpftiefe.mjs";

/* Posten steht in einer Registry-Kopie nur dieses Tests auf „vorlaeufig“ und ist eingeschaltet: seine Daten sind dann schreibbar
   (wie modul-kern-nachtrag5-handler.test.js). So läuft ein realistischer Modul-Schreibweg bis zu `gleich`. */
vi.mock("../server/lib/branchenmodule.mjs", async (echt) => {
  const e = /** @type {any} */ (await echt());
  return { ...e, BRANCHENMODULE: Object.freeze(e.BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x))) };
});

const WIRT = "127.0.0.1:3000";
const RAUM = "tiefendeckelraum";
const EIN = "2026-10-01T08:00:00.000Z";
const TIEF_TEXT = "Der Rumpf ist zu tief verschachtelt.";
let wurzel, laden, daten, B, token;
let nr = 0;

const pause = (ms = 8) => new Promise((r) => setTimeout(r, ms));
/** Verschachteltes JSON als Text (JSON.stringify selbst würde bei dieser Tiefe werfen). n Ebenen, innen {}. */
const tiefText = (n) => '{"a":'.repeat(n - 1) + "{}" + "}".repeat(n - 1);
const tiefListe = (n) => "[".repeat(n) + "]".repeat(n);
/** Rumpf als Text; `"__TIEF__"` im JSON wird durch den tiefen Text ersetzt. */
const roh = (wert, tief) => JSON.stringify(wert).replace('"__TIEF__"', tief);
const anfrage = async (pfad, { methode = "POST", rumpf, text, ohneToken = false } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.61.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token && !ohneToken) kopf.authorization = `Bearer ${token}`;
  const body = methode === "GET" ? undefined : (text ?? JSON.stringify(rumpf || {}));
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf, ...(body === undefined ? {} : { body }) }), {});
  const t = await a.text();
  let d = {}; try { d = JSON.parse(t); } catch { /* leer */ }
  return { status: a.status, roh: t, ...d };
};
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const grundstand = () => ({ version: 9, mandanten: [{
  id: "m-a", name: "A", status: "aktiv", pakete: ["sicherheit"],
  einstellungen: { branchenmodule: { posten: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" } } },
  einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  objekte: [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }] }],
  postenPlan: { "a1|2026-11-02": "po1" },
  personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
  abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
}] });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM));
/** GET, dann der übermittelte Bestand mit einer Änderung (Platzhalter "__TIEF__" erlaubt). */
const vorbereiten = async (aendern) => {
  const r = await anfrage("/api/bestand", { methode: "GET" });
  expect(r.status, r.roh).toBe(200);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0]);
  return { bestand: b, etag: r.etag, durch: "Test" };
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-tiefe-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, grundstand(), { durch: "Pruefung" });
  await pause();
  const code = "TIEF-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "l1", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  token = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(token).toBeTruthy();
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("rumpftiefe: iterative Tiefenmessung", () => {
  it("zählt Objekte und Listen je eine Ebene; Werte ohne Schachtel haben 0", () => {
    expect(rumpfTiefe(null)).toBe(0);
    expect(rumpfTiefe("x")).toBe(0);
    expect(rumpfTiefe({})).toBe(1);
    expect(rumpfTiefe([])).toBe(1);
    expect(rumpfTiefe({ a: [1, { b: "c" }], d: 2 })).toBe(3);
    expect(rumpfTiefe(JSON.parse(tiefText(64)))).toBe(64);
  });
  it("Grenze 64: genau 64 Ebenen sind erlaubt, 65 zu tief; auch in Listen und in einem späteren Zweig", () => {
    expect(RUMPF_TIEFE_MAX).toBe(64);
    expect(zuTief(JSON.parse(tiefText(64)))).toBe(false);
    expect(zuTief(JSON.parse(tiefText(65)))).toBe(true);
    expect(zuTief(JSON.parse(tiefListe(65)))).toBe(true);
    expect(zuTief({ a: 1, b: [{}], z: JSON.parse(tiefText(64)) })).toBe(true);   // 1 + 64
    expect(zuTief("text")).toBe(false);
    expect(zuTief(null)).toBe(false);
  });
  it("5000 und 200000 Ebenen: keine Ausnahme (keine Rekursion), Ergebnis zu tief", () => {
    for (const n of [5000, 200000]) {
      const v = JSON.parse(tiefListe(n));
      expect(() => zuTief(v)).not.toThrow();
      expect(zuTief(v)).toBe(true);
      expect(rumpfTiefe(v)).toBe(n);
    }
  });
});

describe("PUT /api/bestand: zu tiefer Rumpf → 400 vor jeder rekursiven Funktion; realistische Tiefe wie bisher", () => {
  it("5000 Ebenen in den Modulparametern (einstellungen.branchenmodule.posten.parameter) → 400 mit deutschem Text, Bestand unverändert", async () => {
    const vorher = await gespeichert();
    const r0 = await vorbereiten((m) => { m.einstellungen.branchenmodule.posten.parameter = "__TIEF__"; });
    const a = await anfrage("/api/bestand", { methode: "PUT", text: roh(r0, tiefText(5000)) });
    expect(a.status, a.roh).toBe(400);
    expect(a.fehler).toBe(TIEF_TEXT);
    expect(a.text).toContain(String(RUMPF_TIEFE_MAX));
    const nachher = await gespeichert();
    expect(nachher.stand).toBe(vorher.stand);
  });

  it("5000 Ebenen in Moduldaten (postenPlan) und als Liste → 400, kein Serverfehler", async () => {
    for (const tief of [tiefText(5000), tiefListe(5000)]) {
      const r0 = await vorbereiten((m) => { m.postenPlan = { "a1|2026-11-03": "__TIEF__" }; });
      const a = await anfrage("/api/bestand", { methode: "PUT", text: roh(r0, tief) });
      expect(a.status, a.roh).toBe(400);
      expect(a.fehler).toBe(TIEF_TEXT);
    }
  });

  it("Grenze am Handler: Rumpf mit genau 64 Ebenen wird gespeichert (200), mit 65 abgewiesen (400)", async () => {
    /* Rumpf { polster: <63 Ebenen>, bestand, etag, durch } hat 64 Ebenen; unbekannte Felder des Rumpfs liest der Weg nicht. */
    const r64 = await vorbereiten((m) => { m.postenPlan["a1|2026-11-04"] = "po1"; });
    const a64 = await anfrage("/api/bestand", { methode: "PUT", text: roh({ polster: "__TIEF__", ...r64 }, tiefText(63)) });
    expect(a64.status, a64.roh).toBe(200);
    await pause();
    const r65 = await vorbereiten((m) => { m.postenPlan["a1|2026-11-05"] = "po1"; });
    const a65 = await anfrage("/api/bestand", { methode: "PUT", text: roh({ polster: "__TIEF__", ...r65 }, tiefText(64)) });
    expect(a65.status, a65.roh).toBe(400);
    expect(a65.fehler).toBe(TIEF_TEXT);
    expect((await gespeichert()).bestand.mandanten[0].postenPlan["a1|2026-11-05"]).toBeUndefined();
  });

  it("realistische Moduldaten (Schalter mit Parametern, Postenplan) werden wie bisher gespeichert", async () => {
    const r0 = await vorbereiten((m) => {
      m.postenPlan["a1|2026-11-06"] = "po1";
      m.objekte[0].posten.push({ id: "po2", name: "Halle", soll: { F: 1 } });
    });
    const a = await anfrage("/api/bestand", { methode: "PUT", rumpf: r0 });
    expect(a.status, a.roh).toBe(200);
    await pause();
    const m = (await gespeichert()).bestand.mandanten[0];
    expect(m.postenPlan["a1|2026-11-06"]).toBe("po1");
    expect(m.objekte[0].posten.map((p) => p.id)).toEqual(["po1", "po2"]);
  });
});

describe("Andere Wege desselben Eingangs", () => {
  it("POST /api/stempeln mit 5000 Ebenen → 400 (kein Serverfehler)", async () => {
    const a = await anfrage("/api/stempeln", { text: roh({ art: "start", extra: "__TIEF__" }, tiefText(5000)) });
    expect(a.status, a.roh).toBe(400);
    expect(a.fehler).toBe(TIEF_TEXT);
  });
  it("ohne Anmeldung: dieselbe Abweisung wie bei kaputtem JSON (Rumpfprüfung vor der Sitzungsprüfung, Reihenfolge unverändert)", async () => {
    const kaputt = await anfrage("/api/bestand", { methode: "PUT", text: "{", ohneToken: true });
    expect(kaputt.status).toBe(400);
    const a = await anfrage("/api/bestand", { methode: "PUT", text: tiefText(5000), ohneToken: true });
    expect(a.status, a.roh).toBe(400);
    expect(a.fehler).toBe(TIEF_TEXT);
  });
});
