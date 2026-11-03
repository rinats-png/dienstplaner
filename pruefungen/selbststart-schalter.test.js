/* ==========================================================================
   SCHALTER DES ÖFFENTLICHEN SELBSTSTARTS (/starten, /starten/neu)

   Der Selbststart legt ohne Anmeldung einen Betrieb samt Zugangscodes an.
   Während eines internen Piloten darf das niemand von außen auslösen. An ist
   der Selbststart nur bei genau CENTRIC_SELBSTSTART=true; fehlt der Wert oder
   steht etwas anderes da („1", „yes", „TRUE" …), bleibt er aus.

   Geprüft wird das, worauf es ankommt: Bei ausgeschaltetem Schalter entsteht
   unter CENTRIC_DATEN keine einzige Datei — kein Raum, kein Konto, kein
   Zählerstand der Bremse, kein Protokolleintrag, keine Nachfassliste. Der
   Zähler der Bremse bleibt unberührt: Nach vielen abgewiesenen Anfragen
   gelingt der erste echte Start nach dem Einschalten sofort.

   Geprüft wird der echte Handler, derselbe Standardexport, den server.mjs
   unter /starten einhängt. Außerdem: Die Oberfläche (src/main.jsx) zeigt die
   Absage des Servers an, statt „Das hat nicht geklappt" zu behaupten.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, handler, schalterAn;

const MELDUNG = "Der Selbststart ist derzeit nicht freigeschaltet. Zugang nur mit Zugangscode.";
const GUELTIG = { name: "Wachdienst Nordlicht", branche: "sicherheit",
  email: "leitung@example.org", land: "NW" };
const PFADE = ["/starten", "/starten/neu"];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-selbststart-schalter-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  const modul = await import("../server/funktionen/starten.mjs");
  handler = modul.default;
  schalterAn = modul.selbststartAn;
});

afterAll(async () => {
  delete process.env.CENTRIC_SELBSTSTART;
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

/* Eine feste Herkunft für alle Anfragen: Die Bremse (drei Betriebe je Stunde
   und Herkunft) würde sonst zählen, und genau das soll sich zeigen. */
const HERKUNFT = "10.77.0.1";
async function anfrage(pfad, rumpf = GUELTIG, { methode = "POST", roh = null } = {}) {
  const req = new Request(`http://127.0.0.1:3000${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": HERKUNFT },
    ...(methode === "GET" ? {} : { body: roh !== null ? roh : JSON.stringify(rumpf) }),
  });
  const antwort = await handler(req);
  const text = await antwort.text();
  return { status: antwort.status, text, kopf: antwort.headers };
}

async function erwarteAbgeschaltet() {
  const vorher = await dateien();
  for (const pfad of PFADE) {
    for (const [rumpf, roh] of [[GUELTIG, null], [{}, null], [null, "{kaputt"]]) {
      const e = await anfrage(pfad, rumpf, { roh });
      expect([403, 404], `POST ${pfad}`).toContain(e.status);
      expect(JSON.parse(e.text)).toEqual({ ok: false, fehler: MELDUNG });
      expect(e.kopf.get("cache-control")).toBe("no-store");
      /* Nichts aus dem Rumpf kommt zurück, kein Code, kein Raum. */
      expect(e.text).not.toMatch(/Nordlicht|leitung@|zugaenge|"raum"/);
    }
  }
  /* Weit mehr Versuche, als die Bremse je Stunde erlaubt (drei). */
  for (let i = 0; i < 12; i++) expect((await anfrage(PFADE[0])).status).toBe(403);
  /* Keine Datei: kein Raum, kein Konto, kein Bremsenzähler, kein Protokoll. */
  expect(await dateien()).toEqual(vorher);
}

describe("Schalter aus", () => {
  it("nicht gesetzt: abgesagt, keinerlei Schreibwirkung", async () => {
    delete process.env.CENTRIC_SELBSTSTART;
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
    expect(await dateien()).toEqual([]);
  });

  it("=false: gleiches Verhalten", async () => {
    process.env.CENTRIC_SELBSTSTART = "false";
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
  });

  it.each(["TRUE", "True", "1", "yes", "ja", "on", " true", "true ", "", "true\n"])(
    "ungültiger Wert %j bleibt aus", async (wert) => {
      process.env.CENTRIC_SELBSTSTART = wert;
      expect(schalterAn()).toBe(false);
      await erwarteAbgeschaltet();
    });

  it("andere Methoden und Pfade verhalten sich wie bisher (405 / 404)", async () => {
    delete process.env.CENTRIC_SELBSTSTART;
    expect((await anfrage("/starten", null, { methode: "GET" })).status).toBe(405);
    expect((await anfrage("/starten/irgendwas")).status).toBe(404);
  });

  it("der Schalter ist unabhängig von CENTRIC_PUBLIC_REGISTRATION", async () => {
    process.env.CENTRIC_PUBLIC_REGISTRATION = "true";
    try {
      delete process.env.CENTRIC_SELBSTSTART;
      expect(schalterAn()).toBe(false);
      await erwarteAbgeschaltet();
    } finally { delete process.env.CENTRIC_PUBLIC_REGISTRATION; }
  });
});

describe("Schalter an (=true)", () => {
  it("der bestehende Weg läuft; die Bremse hat vorher nichts gezählt", async () => {
    process.env.CENTRIC_SELBSTSTART = "true";
    expect(schalterAn()).toBe(true);
    /* Drei Starts je Stunde und Herkunft sind erlaubt — nach all den
       abgewiesenen Versuchen davor muss der erste sofort gelingen. */
    for (const pfad of ["/starten", "/starten/neu", "/starten"]) {
      const e = await anfrage(pfad);
      expect(e.status, e.text).toBe(200);
      const d = JSON.parse(e.text);
      expect(d.ok).toBe(true);
      expect(d.zugaenge.length).toBeGreaterThanOrEqual(2);
      expect(d.raum).toMatch(/^t-/);
    }
    expect((await dateien()).length).toBeGreaterThan(0);
  });

  it("die Bremse greift weiterhin (vierter Start in der Stunde: 429)", async () => {
    process.env.CENTRIC_SELBSTSTART = "true";
    expect((await anfrage("/starten")).status).toBe(429);
  });

  it("wieder aus: ab sofort abgesagt, nichts kommt hinzu", async () => {
    process.env.CENTRIC_SELBSTSTART = "false";
    const vorher = await dateien();
    const e = await anfrage("/starten");
    expect(e.status).toBe(403);
    expect(await dateien()).toEqual(vorher);
  });
});

describe("Oberfläche", () => {
  it("zeigt die Serverabsage an (fehler aus der Antwort), nicht einen Pauschaltext", async () => {
    const quelle = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
    const i = quelle.indexOf('fetch("/starten"');
    expect(i).toBeGreaterThan(0);
    const block = quelle.slice(i, i + 700);
    expect(block).toMatch(/if \(!a\.ok\) throw new Error\(d\.text \|\| d\.fehler/);
    expect(block).toMatch(/setFehler\(e\.message\)/);
  });
});
