/* ==========================================================================
   SCHALTER DER ÖFFENTLICHEN SELBSTREGISTRIERUNG

   Die drei Pfade unter /api/registrierung sind öffentlich erreichbar, aber
   bis zum Account-Onboarding abgeschaltet. An sind sie nur bei genau
   CENTRIC_PUBLIC_REGISTRATION=true.

   Geprüft wird nicht nur die Antwort, sondern das, worauf es ankommt: Bei
   abgeschaltetem Schalter entsteht unter CENTRIC_DATEN keine einzige Datei
   — kein Konto, kein Token, kein Zählerstand der Bremse, kein
   Protokolleintrag — und es geht keine Mail hinaus (auch nicht mit
   gesetztem Versandschlüssel).

   Geprüft wird der echte Handler, derselbe Standardexport, den server.mjs
   unter den drei Pfaden einhängt.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, handler, A, schalterAn;

const PFADE = ["/api/registrierung", "/api/registrierung/verifizieren", "/api/registrierung/passwort"];
const ADRESSE = "schalter@example.org";
const RUMPF = { email: ADRESSE, vorname: "Rina", nachname: "Schmitt", betriebsname: "Wachdienst Nordlicht",
  token: "a".repeat(43), fortsetzung: "b".repeat(43), passwort: "Nordwind und Sonne 1846" };

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-reg-schalter-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_BASIS = "https://app.centric-dienstplanung.de";
  delete process.env.CENTRIC_PRUEFLINK;
  const modul = await import("../server/funktionen/registrierung.mjs");
  handler = modul.default;
  schalterAn = modul.oeffentlicheRegistrierungAn;
  A = await import("../server/lib/accounts.mjs");
});

afterAll(async () => {
  delete process.env.CENTRIC_PUBLIC_REGISTRATION;
  delete process.env.RESEND_API_KEY;
  await rm(wurzel, { recursive: true, force: true });
});

/* Ein Versandschlüssel ist gesetzt und fetch beobachtet: Ginge eine Mail
   hinaus, sähe man den Aufruf. Er wird nie wirklich ausgeführt. */
let fetchSpion;
beforeEach(() => {
  process.env.RESEND_API_KEY = "re_nur_zum_pruefen_kein_echter_schluessel";
  fetchSpion = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ id: "pruefung" }), { status: 200 }));
});
afterEach(() => {
  fetchSpion.mockRestore();
  delete process.env.RESEND_API_KEY;
});

/** Alle Dateien unter CENTRIC_DATEN, rekursiv. */
async function dateien(ordner = wurzel) {
  const aus = [];
  for (const e of await readdir(ordner, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) aus.push(...await dateien(p));
    else aus.push(path.relative(wurzel, p));
  }
  return aus.sort();
}

let zaehler = 0;
async function anfrage(pfad, rumpf = RUMPF, { methode = "POST" } = {}) {
  const req = new Request(`http://127.0.0.1:3000${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++zaehler % 250 + 1}` },
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf) }),
  });
  const antwort = await handler(req);
  return { status: antwort.status, text: await antwort.text(), kopf: antwort.headers };
}

/** Alle drei Pfade, je zwei Methoden, und ein kaputter Rumpf: alles abgesagt, nichts geschrieben. */
async function erwarteAbgeschaltet({ ohneKonto = true } = {}) {
  const vorher = await dateien();
  for (const pfad of PFADE) {
    for (const [methode, rumpf] of [["POST", RUMPF], ["GET", null], ["POST", "{kaputt"]]) {
      const e = await anfrage(pfad, rumpf, { methode });
      expect(e.status, `${methode} ${pfad}`).toBe(404);
      expect(JSON.parse(e.text)).toEqual({ ok: false, fehler: "nicht-verfuegbar",
        hinweis: "Die Registrierung ist derzeit nicht verfügbar." });
      expect(e.kopf.get("cache-control")).toBe("no-store");
      /* Nichts aus dem Rumpf, kein Pfad, kein Schlüssel in der Antwort. */
      expect(e.text).not.toMatch(/schalter@|Nordlicht|aaaa|bbbb|Nordwind|CENTRIC|RESEND|\/data|account:/);
    }
  }
  /* Viele Versuche hintereinander: Auch die Bremse zählt nichts mit. */
  for (let i = 0; i < 25; i++) expect((await anfrage(PFADE[0])).status).toBe(404);
  expect(await dateien()).toEqual(vorher);
  if (ohneKonto) expect(await A.accountLesenPerMail((await import("../server/lib/ablage.mjs")).getStore({ name: "centric", consistency: "strong" }), ADRESSE)).toBe(null);
  expect(fetchSpion).not.toHaveBeenCalled();
}

describe("Schalter aus", () => {
  it("nicht gesetzt: abgesagt, keine Datei, keine Mail", async () => {
    delete process.env.CENTRIC_PUBLIC_REGISTRATION;
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
    expect(await dateien()).toEqual([]);
  });

  it("=false: gleiches Verhalten", async () => {
    process.env.CENTRIC_PUBLIC_REGISTRATION = "false";
    expect(schalterAn()).toBe(false);
    await erwarteAbgeschaltet();
  });

  it.each(["TRUE", "True", "1", "yes", "ja", "on", " true", "true ", "", "true\n"])(
    "ungültiger Wert %j bleibt aus", async (wert) => {
      process.env.CENTRIC_PUBLIC_REGISTRATION = wert;
      expect(schalterAn()).toBe(false);
      await erwarteAbgeschaltet();
    });
});

describe("Schalter an (=true)", () => {
  it("der bestehende Weg funktioniert: Konto entsteht, Mail geht an den Versand", async () => {
    process.env.CENTRIC_PUBLIC_REGISTRATION = "true";
    expect(schalterAn()).toBe(true);
    const e = await anfrage(PFADE[0], { email: ADRESSE, vorname: "Rina", nachname: "Schmitt", betriebsname: "Wachdienst Nordlicht" });
    expect(e.status, e.text).toBe(200);
    expect(JSON.parse(e.text).ok).toBe(true);
    const konto = await A.accountLesenPerMail((await import("../server/lib/ablage.mjs")).getStore({ name: "centric", consistency: "strong" }), ADRESSE);
    expect(konto && konto.status).toBe("eingeladen");
    expect(fetchSpion).toHaveBeenCalled();
    /* Der Versandschlüssel steht nirgends in einer Datei. */
    for (const d of await dateien()) {
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(path.join(wurzel, d), "utf8")).not.toContain("re_nur_zum_pruefen");
    }
  });

  it("an und wieder aus: ab sofort abgesagt, nichts kommt hinzu", async () => {
    process.env.CENTRIC_PUBLIC_REGISTRATION = "false";
    /* Das Konto aus dem Fall davor bleibt stehen; es kommt nur nichts hinzu. */
    await erwarteAbgeschaltet({ ohneKonto: false });
  });
});
