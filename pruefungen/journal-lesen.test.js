/* ==========================================================================
   JOURNAL BEIM LESEN, LESEFEHLER, WERKZEUG (WP-45, Review-Auflagen N1–N3)

   N1  Das milde Lesen machte aus einem unlesbaren Journal „kein Journal".
       Nach einem Abbruch mitten im Schreiben (Journal, Kern und eine
       Scherbe geschrieben) und einem beschädigten Journal zeigte GET den
       neuen Kern mit einem Eintrag im März UND im April. Jetzt: neuer
       Versuch, dann BESTAND_UNLESBAR → 503 — auch für GET.
   N2  Ein beschädigtes Journal sperrt den Raum. Aufheben kann das nur ein
       Mensch: werkzeug/journal-pruefen.mjs (Trockenlauf, --beiseitelegen).
   N3  „Gerade nicht lesbar" oder „gerade gesperrt" ist nicht „gibt es
       nicht". Aufrufer, die mit .catch(() => null) daraus „kein Bestand"
       machten, antworteten „nicht deine Person" (Kalender) oder räumten
       eine gültige Sitzung weg (Arbeitssitzung).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/* Vorübergehende Lesefehler: die nächsten `anzahl` Lesezugriffe auf
   Schlüssel, die mit `praefix` beginnen, scheitern mit EMFILE. */
const haken = { praefix: null, anzahl: 0 };
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = await original();
  const vielleicht = (k) => {
    if (haken.praefix && String(k).startsWith(haken.praefix) && haken.anzahl > 0) {
      haken.anzahl -= 1;
      const e = /** @type {any} */ (new Error("EMFILE: too many open files (Prüfhaken)"));
      e.code = "EMFILE";
      throw e;
    }
  };
  return { ...echt,
    getStore: (angabe) => {
      const s = echt.getStore(angabe);
      return { ...s,
        get: async (k, o) => { vielleicht(k); return s.get(k, o); },
        getWithMetadata: async (k, o) => { vielleicht(k); return s.getWithMetadata(k, o); },
        getMetadata: async (k) => { vielleicht(k); return s.getMetadata(k); },
      };
    } };
});

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIRT = "127.0.0.1:3000";
let wurzel, store, B, daten, kalender, sitzungAnlegen, AS, dateiname;

let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.5.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const ALT = () => ({ version: 9, mandanten: [{ id: "m1", name: "Haus alt",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [{ id: "a1", vorname: "V", nachname: "a1", rolle: "mitarbeiter", bereich: "e1",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }],
  abweichungen: { "a1|2025-03-10": "F", "a1|2025-04-02": "N" }, abwesenheiten: [], erfassung: {}, einstempeln: {} }] });
const NEU = () => {
  const b = ALT();
  b.mandanten[0].name = "Haus neu";
  delete b.mandanten[0].abweichungen["a1|2025-03-10"];
  b.mandanten[0].abweichungen["a1|2025-04-10"] = "F";
  return b;
};

/** Abbruch vor der n-ten verändernden Operation (1 = Journal, 2 = Kern, 3 = erste Scherbe …). */
function absturzAblage(n) {
  let z = 0;
  const vorher = () => { z += 1; if (z === n) throw new Error(`Absturz vor Teilschreibung ${n}`); };
  return { ...store,
    setJSON: async (k, v, o) => { vorher(); return store.setJSON(k, v, o); },
    delete: async (k) => { vorher(); return store.delete(k); } };
}

/** Raum anlegen, Schreibvorgang nach Journal + Kern + einer Scherbe abbrechen. */
async function halbGeschrieben(raum) {
  await B.bestandSchreiben(store, raum, ALT(), { durch: "Pruefung" });
  const g = await B.bestandLesen(store, raum);
  await expect(B.bestandSchreiben(absturzAblage(4), raum, NEU(), { erwarteterStand: g.stand, durch: "Pruefung" }))
    .rejects.toThrow("Absturz");
}
const journalDatei = (raum) => path.join(wurzel, "centric", dateiname(`journal:${raum}`));

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-journal-lesen-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const A = await import("../server/lib/ablage.mjs");
  store = A.getStore({ name: "centric", consistency: "strong" });
  dateiname = A.dateiname;
  B = await import("../server/lib/bestand.mjs");
  daten = (await import("../server/funktionen/daten.mjs")).default;
  kalender = (await import("../server/funktionen/kalender.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  AS = await import("../server/lib/arbeitssitzung.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

const sitzungFuer = async (raum) => (await sitzungAnlegen({ bestand: raum, name: "a1", rolle: "mitarbeiter",
  person: "a1", betrieb: 0, einheit: null }, 60 * 60 * 1000)).token;

describe("N1 — beschädigtes Journal nach einem Abbruch", () => {
  it("bestandLesen wirft BESTAND_UNLESBAR, GET /api/bestand antwortet 503 — nie ein Mischstand", async () => {
    const RAUM = "n1-kaputt";
    await halbGeschrieben(RAUM);
    await writeFile(journalDatei(RAUM), "{kaputt");
    await expect(B.bestandLesen(store, RAUM)).rejects.toMatchObject({ code: "BESTAND_UNLESBAR" });
    const t = await sitzungFuer(RAUM);
    const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: t });
    expect(g.status, JSON.stringify(g).slice(0, 300)).toBe(503);
    expect(g.bestand).toBeUndefined();
  });

  it("vorübergehender Lesefehler am Journal (EMFILE, zweimal): neuer Versuch, vollständiger neuer Stand", async () => {
    const RAUM = "n1-emfile";
    await halbGeschrieben(RAUM);
    haken.praefix = `journal:${RAUM}`; haken.anzahl = 2;
    let r;
    try { r = await B.bestandLesen(store, RAUM); } finally { haken.praefix = null; }
    const ab = r.bestand.mandanten[0].abweichungen;
    expect(r.bestand.mandanten[0].name).toBe("Haus neu");
    expect(Object.keys(ab).filter((k) => k.startsWith("a1|2025-03-10") || k.startsWith("a1|2025-04-10"))).toEqual(["a1|2025-04-10"]);
  });

  it("anhaltender Lesefehler am Journal: BESTAND_UNLESBAR (→ 503), nie „kein Journal“", async () => {
    const RAUM = "n1-emfile-dauer";
    await halbGeschrieben(RAUM);
    haken.praefix = `journal:${RAUM}`; haken.anzahl = 1000;
    try {
      await expect(B.bestandLesen(store, RAUM)).rejects.toMatchObject({ code: "BESTAND_UNLESBAR" });
      const t = await sitzungFuer(RAUM);
      haken.anzahl = 1000;
      expect((await anfrage(daten, "/api/bestand", { methode: "GET", token: t })).status).toBe(503);
    } finally { haken.praefix = null; haken.anzahl = 0; }
  });
});

describe("N2 — werkzeug/journal-pruefen.mjs", () => {
  const werkzeug = (...arg) => new Promise((fertig) => {
    const k = spawn(process.execPath, ["werkzeug/journal-pruefen.mjs", "--daten", wurzel, ...arg],
      { cwd: WURZEL, env: { ...process.env, CENTRIC_ABLAGE: "dateien" }, stdio: ["ignore", "pipe", "pipe"] });
    let aus = "";
    k.stdout.on("data", (d) => { aus += d; });
    k.stderr.on("data", (d) => { aus += d; });
    k.on("exit", (code) => fertig({ code, aus }));
  });

  it("Trockenlauf meldet, verändert nichts; --beiseitelegen hebt die Sperre auf, löscht nichts", async () => {
    const RAUM = "n2-werkzeug";
    await halbGeschrieben(RAUM);
    await writeFile(journalDatei(RAUM), "{kaputt");

    const trocken = await werkzeug();
    expect(trocken.code, trocken.aus).toBe(1);
    expect(trocken.aus).toMatch(new RegExp(`${RAUM}: Journal beschädigt`));
    expect(await readFile(journalDatei(RAUM), "utf8")).toBe("{kaputt");

    const weg = await werkzeug("--beiseitelegen", RAUM);
    expect(weg.code, weg.aus).toBe(0);
    await expect(readFile(journalDatei(RAUM), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const { blobs } = await store.list({ prefix: `journal-beiseite:${RAUM}:` });
    expect(blobs).toHaveLength(1);

    /* Lesbar wieder — es gilt der Stand auf der Platte —, und der nächste
       Schreibvorgang gleicht Zeiger und Vermerk an. */
    const g = await B.bestandLesen(store, RAUM);
    const e = await B.bestandSchreiben(store, RAUM, g.bestand, { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(e.ok).toBe(true);
  }, 30000);

  it("verweigert die Arbeit, solange ein lebender Prozess die Ablage hält", async () => {
    const { hostname } = await import("node:os");
    await writeFile(path.join(wurzel, ".prozess"),
      JSON.stringify({ pid: process.pid, start: new Date().toISOString(), rechner: hostname() }));
    try {
      const r = await werkzeug();
      expect(r.code, r.aus).toBe(2);
      expect(r.aus).toMatch(/belegt/);
    } finally { await rm(path.join(wurzel, ".prozess"), { force: true }); }
  }, 30000);
});

describe("N3 — „gerade nicht lesbar“ ist nicht „gibt es nicht“", () => {
  it("Kalender: unlesbarer Kern → 503, nicht „nur für die eigene Person“ (403)", async () => {
    const RAUM = "n3-kalender";
    await B.bestandSchreiben(store, RAUM, ALT(), { durch: "Pruefung" });
    const t = await sitzungFuer(RAUM);
    await writeFile(path.join(wurzel, "centric", dateiname(`kern:${RAUM}`)), "{kaputt");
    const r = await anfrage(kalender, "/kalender/einrichten", { token: t, rumpf: {} });
    expect(r.status, JSON.stringify(r)).toBe(503);
  });

  it("Arbeitssitzung: Sperrfehler beim Laden des Bestands wird weitergereicht, keine Absage", async () => {
    const sitzung = { bestand: "n3-sitzung", rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" };
    for (const code of ["RAUMSPERRE_ZEITGRENZE", "RAUMSPERRE_GESTOPPT", "BESTAND_UNLESBAR"]) {
      const fehler = Object.assign(new Error(code), { code });
      await expect(AS.arbeitssitzungPruefen(store, sitzung, { bestandLader: async () => { throw fehler; } }))
        .rejects.toMatchObject({ code });
    }
    /* Ein gewöhnlicher Fehler bleibt eine Absage — die Tür bleibt zu. */
    const e = await AS.arbeitssitzungPruefen(store, sitzung, { bestandLader: async () => { throw new Error("kaputt"); } });
    expect(e).toEqual({ ok: false, grund: "bestand-fehler" });
  });

  it("voruebergehend erkennt genau die drei vorübergehenden Fehlerarten", () => {
    expect(["BESTAND_UNLESBAR", "RAUMSPERRE_ZEITGRENZE", "RAUMSPERRE_GESTOPPT"]
      .map((code) => B.voruebergehend({ code }))).toEqual([true, true, true]);
    expect(B.voruebergehend(new Error("x"))).toBe(false);
    expect(B.voruebergehend(null)).toBe(false);
  });
});
