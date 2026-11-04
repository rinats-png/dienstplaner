/* ==========================================================================
   SCHALTER DES ÖFFENTLICHEN DEMOZUGANGS (POST /api/demo, GET /api/demos)

   Der Demozugang öffnet ohne Code eine 12-Stunden-Sitzung, und die Liste
   nennt die Zugänge öffentlich. Im internen Piloten soll es diesen Weg nicht
   geben. An ist er nur bei genau CENTRIC_DEMO=true; alles andere bleibt aus.

   Geprüft wird der echte Handler (Standardexport von daten.mjs):
   - aus: POST /api/demo -> 403 vor Bremse, Konten und Sitzung; keine Datei
     entsteht; GET /api/demos -> leere Liste, no-store, auch wenn Demokonten
     vorhanden sind (sie werden nicht einmal gelesen);
   - an: das bisherige Verhalten (Sitzung, gefüllte Liste, public max-age=60);
   - unabhängig von CENTRIC_SELBSTSTART und CENTRIC_PUBLIC_REGISTRATION;
   - die Oberfläche kommt mit leerer Liste ohne Beispielbetriebe aus.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, handler, schalterAn;

const MELDUNG = "Der Demozugang ist derzeit nicht freigeschaltet.";
const HERKUNFT = "10.77.0.2";
const DEMO_ID = "d-schalter-test-1";

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-demo-schalter-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  delete process.env.CENTRIC_DEMO;
  const { getStore } = await import("../server/lib/ablage.mjs");
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const modul = await import("../server/funktionen/daten.mjs");
  handler = modul.default;
  schalterAn = (await import("../server/lib/schalter.mjs")).demoAn;
  const store = getStore({ name: "centric", consistency: "strong" });
  await kontoSchreiben(store, "pruefsumme-demo-1", {
    name: "Demo Leitung", bestand: "demo-schau", rolle: "leitung", person: null,
    betrieb: 0, demo: true, id: DEMO_ID, gruppe: "Prüfung", hinweis: null,
    angelegt: new Date().toISOString() });
});

afterAll(async () => {
  delete process.env.CENTRIC_DEMO;
  await rm(wurzel, { recursive: true, force: true });
});

async function dateien(ordner = wurzel) {
  const aus = [];
  for (const e of await readdir(ordner, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) aus.push(...await dateien(p));
    else aus.push(path.relative(wurzel, p));
  }
  return aus.sort();
}

async function anfrage(pfad, { methode = "GET", rumpf = null, herkunft = HERKUNFT } = {}) {
  const req = new Request(`http://127.0.0.1:3000${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": herkunft },
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf ?? {}) }),
  });
  const antwort = await handler(req, {});
  const text = await antwort.text();
  return { status: antwort.status, text, kopf: antwort.headers };
}

async function erwarteAbgeschaltet() {
  const vorher = await dateien();
  for (const rumpf of [{ id: DEMO_ID }, {}, { id: "gibt-es-nicht" }]) {
    const e = await anfrage("/api/demo", { methode: "POST", rumpf });
    expect(e.status).toBe(403);
    expect(JSON.parse(e.text)).toEqual({ ok: false, fehler: MELDUNG });
    expect(e.kopf.get("cache-control")).toBe("no-store");
    expect(e.text).not.toMatch(/token|demo-schau|Demo Leitung/);
  }
  /* Weit mehr Versuche, als die Bremse je Zeitraum erlaubt. */
  for (let i = 0; i < 40; i++)
    expect((await anfrage("/api/demo", { methode: "POST", rumpf: { id: DEMO_ID } })).status).toBe(403);
  const l = await anfrage("/api/demos");
  expect(l.status).toBe(200);
  expect(JSON.parse(l.text)).toEqual({ demos: [] });
  expect(l.kopf.get("cache-control")).toBe("no-store");
  expect(l.text).not.toMatch(new RegExp(`${DEMO_ID}|demo-schau|Demo Leitung`));
  for (let i = 0; i < 40; i++) expect((await anfrage("/api/demos")).status).toBe(200);
  /* Keine Datei dazu: keine Sitzung, kein Bremsenzähler, kein Protokoll. */
  expect(await dateien()).toEqual(vorher);
}

describe("Schalter aus", () => {
  it("nicht gesetzt: abgesagt, Liste leer, keinerlei Schreibwirkung", async () => {
    delete process.env.CENTRIC_DEMO;
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
  });

  it("=false: gleiches Verhalten", async () => {
    process.env.CENTRIC_DEMO = "false";
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
  });

  it.each(["TRUE", "True", "1", "yes", "ja", "on", " true", "true ", "", "true\n"])(
    "ungültiger Wert %j bleibt aus", async (wert) => {
      process.env.CENTRIC_DEMO = wert;
      expect(schalterAn()).toBe(false);
      await erwarteAbgeschaltet();
    });

  it("unabhängig von CENTRIC_SELBSTSTART und CENTRIC_PUBLIC_REGISTRATION", async () => {
    process.env.CENTRIC_SELBSTSTART = "true";
    process.env.CENTRIC_PUBLIC_REGISTRATION = "true";
    try {
      delete process.env.CENTRIC_DEMO;
      expect(schalterAn()).toBe(false);
      await erwarteAbgeschaltet();
    } finally {
      delete process.env.CENTRIC_SELBSTSTART;
      delete process.env.CENTRIC_PUBLIC_REGISTRATION;
    }
  });
});

describe("Schalter an (=true)", () => {
  it("die Liste ist gefüllt und wie bisher zwischenspeicherbar", async () => {
    process.env.CENTRIC_DEMO = "true";
    expect(schalterAn()).toBe(true);
    const l = await anfrage("/api/demos");
    expect(l.status).toBe(200);
    const d = JSON.parse(l.text);
    expect(d.demos.map((x) => x.id)).toEqual([DEMO_ID]);
    expect(l.kopf.get("cache-control")).toBe("public, max-age=60");
    expect(l.text).not.toMatch(/pruefsumme|zugangscode/i);
  });

  it("ein vorhandener Demozugang öffnet eine Sitzung", async () => {
    process.env.CENTRIC_DEMO = "true";
    const e = await anfrage("/api/demo", { methode: "POST", rumpf: { id: DEMO_ID } });
    expect(e.status, e.text).toBe(200);
    const d = JSON.parse(e.text);
    expect(d.token).toBeTruthy();
    expect(d.rolle).toBe("leitung");
  });

  it("ein unbekannter Demozugang: 404 wie bisher", async () => {
    process.env.CENTRIC_DEMO = "true";
    const e = await anfrage("/api/demo", { methode: "POST", rumpf: { id: "gibt-es-nicht" } });
    expect(e.status).toBe(404);
  });

  it("unabhängig von den anderen Schaltern: auch mit Selbststart aus", async () => {
    process.env.CENTRIC_DEMO = "true";
    delete process.env.CENTRIC_SELBSTSTART;
    delete process.env.CENTRIC_PUBLIC_REGISTRATION;
    expect((await anfrage("/api/demos")).status).toBe(200);
  });

  it("wieder aus: ab sofort abgesagt, die Liste leer", async () => {
    process.env.CENTRIC_DEMO = "false";
    await erwarteAbgeschaltet();
  });
});

describe("Oberfläche", () => {
  it("kommt mit leerer Demoliste ohne Beispielbetriebe aus (Codefeld statt Liste)", async () => {
    const quelle = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
    /* Die Beispielliste erscheint nur bei nicht leerer Liste; sonst das Codefeld. */
    expect(quelle).toMatch(/\) : demos\.length > 0 && !mitCode \? \(<>/);
    expect(quelle).toMatch(/for \(const d of demos \|\| \[\]\)/);
    const speicher = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(speicher).toMatch(/if \(!a\.ok\) return \[\];/);
    expect(speicher).toMatch(/\.demos \|\| \[\]/);
  });
});
