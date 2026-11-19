/* ==========================================================================
   Befund B-L4 — nach dem Sitzungsende beim Server erscheint die Anmeldung

   Lokale E2E-Abnahme 2026-11-19 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md §4, e2e L4a): Sitzung beim Server
   beendet, Seite neu geladen → dauerhaft das Ladegerüst „CENTRIC wird geladen", erst ein zweites Neuladen zeigte die
   Anmeldung. Ursache: src/speicher.js ruf() räumte bei 401 nur das Merkmal (abmelden(true)) und sagte der Oberfläche
   nichts; src/App.jsx verschluckt „nicht-angemeldet" (db bleibt leer → Ladegerüst); src/main.jsx blieb bei „an".

     N  Neuladen mit toter Sitzung: 401 beim Laden → Hörer → Neuladen mit Hinweis-Merker; kein Merkmal, kein Zugang
        mehr im Speicher; nach dem Neuladen genau einmal der Hinweis (Anmeldung mit Code).
     O  Sitzung endet bei offener Seite mit ausstehender Eingabe: KEIN Neuladen (die Eingabe liegt nur im Reiter);
        der Schreibvorgang scheitert mit Lage „abgemeldet", der Auftrag bleibt (ausstehenderBestand), die Leiste
        „nicht gespeichert" bietet Anmeldung mit Code in diesem Reiter und „Als Datei sichern". Auf dem Server ändert
        sich nichts.
     K  Kein Kreislauf: Eine weitere 401 ohne Merkmal meldet nichts mehr.
     F  Entscheidungstafel sitzungsendeFolge.
     Q  Quelltext-Verträge (speicher.js, main.jsx, App.jsx).

   Echter Client (src/speicher.js, eigene Modulinstanz je Laden) gegen den echten Handler (fetch auf daten()
   umgeleitet, Dateiablage); das Sitzungsende ist echt (server/lib/sitzungen.mjs sitzungBeenden, wie Abmelden an
   anderer Stelle oder Ablauf). Kein Browser nötig; L4a/L4b in e2e/lokale-abnahme-luecken.spec.mjs prüfen dasselbe im Browser.
   Aufruf: npx vitest run pruefungen/sitzungsende-anmeldung.test.js --maxWorkers=1
   ========================================================================== */
// zeit-ok: keine Uhr der Prüfung; der echte Handler setzt Sitzungs- und Speicherzeiten selbst.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, S;
let raumNr = 0, RAUM = "", nr = 0, TOKEN = "";

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: rolle === "mitarbeiter" ? "e1" : "ALLE",
  status: "aktiv", geburtstag: "1980-01-01", eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] });
const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", branche: "produktion",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("a1", "mitarbeiter"), person("l1", "leitung")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

let PUTS = [];
async function neuerRaum() {
  RAUM = `sitzungsende-${++raumNr}`;
  PUTS = [];
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  TOKEN = (await S.sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), m }; };

/** Ein Laden der Seite: eigene Modulinstanz von speicher.js (+ sitzungsende.js), Merkmal im Reiter, fetch → Handler. */
async function seite({ ablage } = {}) {
  vi.resetModules();
  const sitzung = ablage || speicherAttrappe({ "centric:token": TOKEN });
  vi.stubGlobal("sessionStorage", sitzung);
  vi.stubGlobal("localStorage", speicherAttrappe());
  vi.stubGlobal("window", { addEventListener: () => {} });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {} });
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.52.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    const methode = opt.method || "GET";
    if (methode === "PUT") PUTS.push(JSON.parse(opt.body));
    return daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
  });
  const SP = await import("../src/speicher.js");
  const E = await import("../src/app/sitzungsende.js");
  const r = { SP, E, sitzung, neuGeladen: 0, fehler: [], gespeichert: [] };
  r.ab = E.sitzungsendeBeobachten({ neuLaden: () => { r.neuGeladen += 1; }, ablage: sitzung });
  return r;
}
const opt = (r) => ({ durch: "Pruefung", onKonflikt: () => {}, onFehler: (l) => r.fehler.push(l), onGespeichert: (b) => r.gespeichert.push(b) });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-sitzungsende-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/sitzungen.mjs");
}, 120000);
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("N Neuladen mit toter Sitzung", { timeout: 120000 }, () => {
  it("401 beim Laden → Neuladen mit Hinweis; kein Merkmal, kein Zugang; danach genau einmal der Hinweis", async () => {
    await neuerRaum();
    expect(await S.sitzungBeenden(TOKEN), "Sitzung beim Server beendet").toBe(true);
    const r = await seite();
    expect(r.SP.angemeldet(), "Start: Merkmal aus dem Reiter").toBe(true);
    /* Was App.jsx beim Laden tut: SP.lies(). */
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen, "kontrolliert in den abgemeldeten Zustand (Neuladen wie beim Abmelden)").toBe(1);
    expect(r.SP.angemeldet()).toBe(false);
    expect(r.sitzung.getItem("centric:token"), "Merkmal geräumt").toBeNull();
    expect([r.SP.zugangsdaten(), r.SP.betriebsname()], "kein Zugang/Betrieb mehr im Speicher").toEqual([null, null]);
    expect(r.sitzung.getItem(r.E.SITZUNGSENDE_MERKER)).toBe("ja");
    expect(PUTS, "nichts gesendet").toEqual([]);

    /* Nach dem Neuladen: ohne Merkmal → main.jsx zeigt die Anmeldung (an = false) mit dem Hinweis, genau einmal. */
    const danach = await seite({ ablage: r.sitzung });
    expect(danach.SP.angemeldet(), "ohne Merkmal: Anmeldung statt Ladegerüst").toBe(false);
    expect(danach.E.sitzungsendeHinweisAbholen(r.sitzung)).toBe(danach.E.SITZUNGSENDE_HINWEIS);
    expect(danach.E.sitzungsendeHinweisAbholen(r.sitzung), "nur einmal").toBeNull();
  });
});

describe("O Sitzung endet bei offener Seite mit ausstehender Eingabe", { timeout: 120000 }, () => {
  it("Eingabe wartet, Sitzung endet, eine Anfrage bekommt 401: kein Neuladen, Eingabe bleibt, Leiste mit Anmeldung", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    expect(r.neuGeladen).toBe(0);
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    const neu = { ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) };
    r.SP.schreib(neu, opt(r));                       // wartet im Zeitgeber (noch nicht gesendet)
    expect(r.SP.schreibenAusstehend()).toBe(true);
    await S.sitzungBeenden(TOKEN);                    // Ablauf / Abmelden an anderer Stelle
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen, "mit Ausstehendem kein Neuladen — die Eingabe liegt nur in diesem Reiter").toBe(0);
    expect(r.sitzung.getItem(r.E.SITZUNGSENDE_MERKER)).toBeNull();
    expect(r.SP.angemeldet()).toBe(false);

    await r.SP.schreibenAbschliessen();               // wie der Zeitgeber
    expect(r.fehler.map((l) => l.art), "Leiste „nicht gespeichert“, Lage abgemeldet").toEqual(["abgemeldet"]);
    expect(r.SP.ausstehend().art).toBe("abgemeldet");
    expect(r.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit, "Eingabe nicht still verworfen").toBe(13);
    expect(r.SP.schreibenAusstehend(), "beforeunload fragt weiter").toBe(false);
    expect(r.neuGeladen, "die 401 des Schreibens (ohne Merkmal) meldet nichts mehr").toBe(0);
    expect((await gespeichert()).einstellungen.ruhezeit, "auf dem Server unverändert").toBe(11);
    expect(r.gespeichert).toEqual([]);

    /* Die Leiste zur Lage: Anmeldung mit Code in diesem Reiter und der Ausweg „Als Datei sichern". */
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    expect(SPEICHERLAGE.abgemeldet.neuAnmelden).toBe(true);
    const html = renderToStaticMarkup(h(NichtGespeichert, { lage: r.SP.ausstehend(), melde: () => {}, aufGeloest: () => {} }));
    expect(html).toContain('aria-label="Zugangscode"');
    expect(html).toContain("Anmelden und senden");
    expect(html).toContain("Als Datei sichern");
  });

  it("401 direkt auf das Senden: kein Neuladen, Auftrag bleibt ausstehend", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    await S.sitzungBeenden(TOKEN);
    const neu = { ...db, mandanten: db.mandanten.map((m) => ({ ...m, name: "Haus neu" })) };
    await r.SP.schreib(neu, { ...opt(r), sofort: true });
    expect(r.neuGeladen).toBe(0);
    expect(r.fehler.map((l) => l.art)).toEqual(["abgemeldet"]);
    expect(r.SP.ausstehenderBestand().mandanten[0].name).toBe("Haus neu");
    expect((await gespeichert()).name).toBe("Haus");
  });

  it("ohne Ausstehendes bei offener Seite: 401 → Neuladen (kein Bestand bleibt angezeigt)", async () => {
    await neuerRaum();
    const r = await seite();
    await r.SP.lies();
    await S.sitzungBeenden(TOKEN);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen).toBe(1);
    expect(r.SP.zugangsdaten()).toBeNull();
  });
});

describe("K kein Kreislauf", { timeout: 120000 }, () => {
  it("eine weitere 401 ohne Merkmal meldet nichts; abgemeldete Hörer hören nichts", async () => {
    await neuerRaum();
    await S.sitzungBeenden(TOKEN);
    const r = await seite();
    let zweiter = 0;
    const ab = r.SP.beiSitzungsende(() => { zweiter += 1; });
    ab();
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect([r.neuGeladen, zweiter]).toEqual([1, 0]);
  });
});

describe("F Entscheidungstafel", () => {
  it("nur ohne Ausstehendes zur Anmeldung", async () => {
    const { sitzungsendeFolge, sitzungsendeBehandeln } = await import("../src/app/sitzungsende.js");
    expect(sitzungsendeFolge({ schreibenAusstehend: false, ausstehend: false })).toBe("anmeldung");
    expect(sitzungsendeFolge({ schreibenAusstehend: true, ausstehend: false })).toBe("halten");
    expect(sitzungsendeFolge({ schreibenAusstehend: false, ausstehend: true })).toBe("halten");
    let n = 0;
    const sp = (s, a) => ({ schreibenAusstehend: () => s, ausstehend: () => (a ? { art: "netz" } : null) });
    expect(sitzungsendeBehandeln({ sp: sp(false, true), neuLaden: () => { n += 1; }, ablage: null })).toBe("halten");
    expect(n, "gescheiterter Auftrag (z. B. Netz) hält die Seite").toBe(0);
  });
});

describe("Q Quelltext-Verträge", () => {
  const lies = async (p) => (await readFile(new URL(p, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  it("speicher.js meldet das Ende bei 401; main.jsx beobachtet und zeigt die Anmeldung mit Hinweis", async () => {
    const sp = await lies("../src/speicher.js");
    expect(sp).toMatch(/if \(a\.status === 401\) \{ sitzungEndet\(\); throw new Error\("nicht-angemeldet"\); \}/);
    expect(sp).toMatch(/const warAngemeldet = !!token;\n  abmelden\(true\);\n  if \(!warAngemeldet\) return;/);
    const main = await lies("../src/main.jsx");
    expect(main).toMatch(/\nsitzungsendeBeobachten\(\);\n/);
    expect(main).toMatch(/const SITZUNGSENDE_BEIM_START = sitzungsendeHinweisAbholen\(\);/);
    expect(main).toMatch(/useState\(!!SITZUNGSENDE_BEIM_START\)/);
    expect(main).toMatch(/role="status"[^>]*>\n\s*\{SITZUNGSENDE_BEIM_START\}/);
    /* App.jsx: Ladefehler „nicht-angemeldet" bleibt still — die Anmeldung kommt über das Neuladen, nicht über die Fehlerseite. */
    const app = await lies("../src/App.jsx");
    expect(app).toContain('if (lebt && String(e.message) !== "nicht-angemeldet") setLadefehler(String(e.message));');
  });
});
