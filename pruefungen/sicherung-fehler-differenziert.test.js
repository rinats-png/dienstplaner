/* ==========================================================================
   SICHERUNGSFEHLER DIFFERENZIERT (Betreiberentscheidung 2026-11-26, WP-26 Nachtrag)

   Ein Sicherungsfehler wird nicht überall gleich behandelt:
     (ii)  manuelle Sicherung (/api/sicherung): Fehler sichtbar an den Aufrufer (503, kein „ok“), Bestand unverändert.
     (iii) Sicherung als Rückweg vor einer potenziell destruktiven Änderung — PUT mit auffälligem Verlust
           (Schwelle SICHERUNGSSCHWELLE), Wiederherstellen, Datenschutzlauf „an“, Übernahme eines Altbestands
           (vor-zerlegung): Scheitert die Sicherung, wird die Änderung NICHT durchgeführt (Platte byte-gleich),
           Protokoll „Sicherung fehlgeschlagen, Änderung nicht durchgeführt“, nie „gesichert“.
     Normales Speichern ohne auffälligen Verlust legt keine Sicherung an und bleibt von Ablagefehlern der
     Sicherung unberührt.
   Dazu vor-zerlegung: ein vorhandener Sicherungspunkt wird bei erneuter Übernahme nie überschrieben.

   Über die echten Handler (server/funktionen/daten.mjs) mit Dateiablage im Temp-Ordner. Der Sicherungsfehler
   wird über einen Beobachter an sicherungAnlegen erzeugt: „erschoepft“ ruft das echte sicherungAnlegen mit
   einer Ablage, die jede Marke als belegt meldet (echte Meldung „… belegt (nichts überschrieben)“), „ablage“
   wirft wie eine volle Platte (ENOSPC).
   Aufruf: npx vitest run pruefungen/sicherung-fehler-differenziert.test.js --maxWorkers=1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const steuer = vi.hoisted(() => ({
  /** @type {null | "erschoepft" | "ablage"} */ modus: null,
  /** @type {Array<{ raum: string, durch: any, standBeimAnlegen: any }>} */ aufrufe: [],
  /** @type {null | ((raum: string) => Promise<any>)} */ standLesen: null,
  /** So viele der nächsten Aufrufe scheitern (Ablage), danach wieder normal. */ einmal: 0,
}));
vi.mock("../server/lib/sicherungen.mjs", async (importOriginal) => {
  /** @type {any} */
  const o = await importOriginal();
  return { ...o, sicherungAnlegen: async (store, raum, daten, opt = {}) => {
    steuer.aufrufe.push({ raum, durch: opt.metadata ? opt.metadata.durch : null,
      standBeimAnlegen: steuer.standLesen ? await steuer.standLesen(raum) : null });
    if (steuer.einmal > 0) { steuer.einmal -= 1; throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }); }
    if (steuer.modus === "erschoepft") return o.sicherungAnlegen({ setJSONWennNeu: async () => false }, raum, daten, opt);
    if (steuer.modus === "ablage") throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
    return o.sicherungAnlegen(store, raum, daten, opt);
  } };
});

const WIRT = "127.0.0.1:3000";
const RAUM = "sfdraum";
let wurzel, laden, daten, B, D, token;
let nr = 0;

const anfrage = async (pfad, { methode = "POST", rumpf } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const abw = () => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`a1|2026-12-${String(i + 1).padStart(2, "0")}`, "F"]));
const grundstand = () => ({ version: 9, mandanten: [{
  id: "m-a", name: "A", status: "aktiv",
  einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
  abweichungen: abw(), einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
}] });
const neuStart = async () => { await B.bestandSchreiben(laden(), RAUM, grundstand(), { durch: "Pruefung" }); };
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
/** Unfall: acht von zehn Abweichungen weg (Verlust ≥ 34 %). */
const unfall = (m) => { for (const k of Object.keys(m.abweichungen).slice(0, 8)) delete m.abweichungen[k]; };
const putMit = async (aendern) => {
  const r = await anfrage("/api/bestand", { methode: "GET" });
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
};
const wiederherstellen = async (marke) => {
  const stand = (await B.bestandLesen(laden(), RAUM)).stand;
  return anfrage("/api/wiederherstellen", { rumpf: { marke, etag: stand } });
};
const sicherungsMarken = async (raum = RAUM) => (await laden().list({ prefix: `sicherung:${raum}:` })).blobs
  .map((x) => x.key.slice(`sicherung:${raum}:`.length)).sort();

/** Abdruck aller Bestands- und Sicherungsdateien eines Raums auf der Platte (Kern, Scherben, Stand, Journal,
    Altbestand, Sicherungen) — Dateiname und Bytes. */
async function platte(raum = RAUM) {
  const dir = path.join(wurzel, "centric");
  const praefixe = ["kern", "scherbe", "stand", "journal", "bestand", "sicherung"].map((p) => `${p}%3A${raum}`);
  const namen = (await readdir(dir)).filter((n) => praefixe.some((p) => n.startsWith(p))).sort();
  const aus = {};
  for (const n of namen) aus[n] = createHash("sha256").update(await readFile(path.join(dir, n))).digest("hex");
  return aus;
}
/** Alle Protokollzeilen (alle Arten, auch „loeschlauf“), neueste zuletzt. */
async function zeilen() {
  const spur = (await import("../server/lib/ablage.mjs")).getStore({ name: "centric-spur" });
  const { blobs } = await spur.list({ prefix: "" });
  const z = [];
  for (const b of blobs) { const x = await spur.get(b.key, { type: "json" }); if (x && x.zeit) z.push(x); }
  return z.sort((a, b) => a.zeit.localeCompare(b.zeit));
}
const neueZeilen = async (vorher) => (await zeilen()).slice(vorher);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-sfd-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-sfd-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  D = await import("../server/lib/datenschutzlauf.mjs");
  steuer.standLesen = async (raum) => { try { return (await B.bestandLesen(laden(), raum))?.stand ?? null; } catch { return "unlesbar"; } };
  await neuStart();
  const code = "SFD0-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "l1", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  token = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(token).toBeTruthy();
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(() => { steuer.modus = null; steuer.aufrufe = []; steuer.einmal = 0; });

describe("(iii) PUT mit auffälligem Verlust: Sicherung ist der Rückweg", () => {
  for (const modus of /** @type {const} */ (["erschoepft", "ablage"])) {
    it(`Sicherung scheitert (${modus}): 503, nichts gespeichert (Platte byte-gleich), Protokoll „nicht durchgeführt“, nie „gesichert“`, async () => {
      await neuStart();
      const vorher = await platte();
      const nZ = (await zeilen()).length;
      steuer.modus = modus;
      const w = await putMit(unfall);
      expect(w.status, w.roh).toBe(503);
      expect(w.code).toBe("SICHERUNG_FEHLGESCHLAGEN");
      expect(w.text).toMatch(/nichts gespeichert/);
      expect(steuer.aufrufe).toHaveLength(1);
      expect(String(steuer.aufrufe[0].durch)).toMatch(/vor Verlust/);
      expect(await platte()).toEqual(vorher);
      expect(Object.keys((await gespeichert()).abweichungen)).toHaveLength(10);
      const neu = await neueZeilen(nZ);
      expect(neu.some((z) => z.art === "schreiben" && z.ausgang === "abgewiesen"
        && /Sicherung fehlgeschlagen, Änderung nicht durchgeführt/.test(z.zusatz || ""))).toBe(true);
      expect(neu.some((z) => z.ausgang === "gesichert")).toBe(false);
      expect(neu.some((z) => z.art === "schreiben" && z.ausgang === "erfolg")).toBe(false);
      /* Datenschutz: im Protokoll nur Zahlen/Kennungen, kein Name, kein Tag. */
      expect(JSON.stringify(neu)).not.toMatch(/Va1|Na1|2026-12-0/);
    }, 120000);
  }

  it("Erfolgsfall unverändert: erst die Sicherung (alter Stand), dann der Tausch; 200, Protokoll „gesichert“ und „erfolg“", async () => {
    await neuStart();
    const standVorher = (await B.bestandLesen(laden(), RAUM)).stand;
    const markenVorher = await sicherungsMarken();
    const nZ = (await zeilen()).length;
    const w = await putMit(unfall);
    expect(w.status, w.roh).toBe(200);
    expect(steuer.aufrufe).toHaveLength(1);
    expect(steuer.aufrufe[0].standBeimAnlegen).toBe(standVorher);                 // Reihenfolge: Sicherung VOR dem Schreiben
    const neu = (await sicherungsMarken()).filter((m) => !markenVorher.includes(m));
    expect(neu).toHaveLength(1);
    const inhalt = await laden().get(`sicherung:${RAUM}:${neu[0]}`, { type: "json" });
    expect(Object.keys(inhalt.mandanten[0].abweichungen)).toHaveLength(10);
    expect(Object.keys((await gespeichert()).abweichungen)).toHaveLength(2);
    const z = await neueZeilen(nZ);
    const iG = z.findIndex((x) => x.ausgang === "gesichert");
    const iE = z.findIndex((x) => x.art === "schreiben" && x.ausgang === "erfolg");
    expect(iG).toBeGreaterThanOrEqual(0);
    expect(iE).toBeGreaterThan(iG);
  }, 120000);

  it("normales Speichern (kein auffälliger Verlust) legt keine Sicherung an und bleibt von Sicherungsfehlern unberührt", async () => {
    await neuStart();
    steuer.modus = "ablage";
    const w = await putMit((m) => { delete m.abweichungen["a1|2026-12-01"]; });
    expect(w.status, w.roh).toBe(200);
    expect(steuer.aufrufe).toHaveLength(0);
    expect(Object.keys((await gespeichert()).abweichungen)).toHaveLength(9);
  }, 120000);

  it("parallel: zwei gleichzeitige Verlust-PUTs auf demselben Stand — einer gewinnt mit genau einer Sicherung des alten Stands", async () => {
    await neuStart();
    const markenVorher = await sicherungsMarken();
    const r = await anfrage("/api/bestand", { methode: "GET" });
    const b = JSON.parse(JSON.stringify(r.bestand));
    unfall(b.mandanten[0]);
    const [x, y] = await Promise.all([1, 2].map(() =>
      anfrage("/api/bestand", { methode: "PUT", rumpf: { bestand: b, etag: r.etag, durch: "Test" } })));
    const status = [x.status, y.status].sort();
    expect(status[0], `${x.roh} ${y.roh}`).toBe(200);
    expect([200, 409]).toContain(status[1]);
    const neu = (await sicherungsMarken()).filter((m) => !markenVorher.includes(m));
    expect(neu.length).toBeGreaterThanOrEqual(1);
    for (const m of neu) {
      const s = await laden().get(`sicherung:${RAUM}:${m}`, { type: "json" });
      expect(Object.keys(s.mandanten[0].abweichungen)).toHaveLength(10);         // jede Sicherung: ganzer alter Stand
    }
    expect(Object.keys((await gespeichert()).abweichungen)).toHaveLength(2);
  }, 120000);

  it("parallel mit Fehler: die erste Sicherung scheitert, ein gleichzeitiger zweiter Versuch schreibt nur mit eigener Sicherung", async () => {
    await neuStart();
    const markenVorher = await sicherungsMarken();
    steuer.einmal = 1;                                   // der erste Aufruf scheitert (Ablage), weitere gelingen
    try {
      const r = await anfrage("/api/bestand", { methode: "GET" });
      const b = JSON.parse(JSON.stringify(r.bestand));
      unfall(b.mandanten[0]);
      const ergebnisse = await Promise.all([1, 2].map(() =>
        anfrage("/api/bestand", { methode: "PUT", rumpf: { bestand: b, etag: r.etag, durch: "Test" } })));
      const st = ergebnisse.map((e) => e.status).sort();
      expect(st, ergebnisse.map((e) => e.roh).join(" ")).toEqual([200, 503]);
      expect(steuer.aufrufe).toHaveLength(2);
      /* Wer geschrieben hat, hat vorher eine Sicherung des vollen Stands angelegt — genau eine. */
      const neu = (await sicherungsMarken()).filter((m) => !markenVorher.includes(m));
      expect(neu).toHaveLength(1);
      const s = await laden().get(`sicherung:${RAUM}:${neu[0]}`, { type: "json" });
      expect(Object.keys(s.mandanten[0].abweichungen)).toHaveLength(10);
      expect(Object.keys((await gespeichert()).abweichungen)).toHaveLength(2);
    } finally { steuer.einmal = 0; }
  }, 120000);
});

describe("(iii) Wiederherstellen: Sicherung „vor Wiederherstellung“ ist der Rückweg", () => {
  /** Eine Sicherung mit anderem Inhalt ablegen (wie /api/sicherung), Marke zurück. */
  const ablegen = async () => {
    const m = grundstand().mandanten[0];
    m.abweichungen = { "a1|2026-12-20": "F" };
    const marke = "2026-10-01-08-00-00-0001";
    await laden().setJSON(`sicherung:${RAUM}:${marke}`, { centric: "sicherung", fassung: 2, umfang: "betrieb", mandantId: "m-a",
      erzeugt: "2026-10-01T08:00:00.000Z", mandant: m }, { metadata: { zeit: "2026-10-01T08:00:00.000Z", durch: "Test", mandantId: "m-a" } });
    return marke;
  };

  for (const modus of /** @type {const} */ (["erschoepft", "ablage"])) {
    it(`Sicherung scheitert (${modus}): 503, nichts zurückgespielt (Platte byte-gleich), Protokoll „nicht durchgeführt“`, async () => {
      await neuStart();
      const marke = await ablegen();
      const vorher = await platte();
      const nZ = (await zeilen()).length;
      steuer.modus = modus;
      const w = await wiederherstellen(marke);
      expect(w.status, w.roh).toBe(503);
      expect(w.code).toBe("SICHERUNG_FEHLGESCHLAGEN");
      expect(w.text).toMatch(/nichts zurückgespielt/);
      expect(steuer.aufrufe.map((a) => String(a.durch))).toEqual([`automatisch vor Wiederherstellung von ${marke}`]);
      expect(await platte()).toEqual(vorher);
      const neu = await neueZeilen(nZ);
      expect(neu.some((z) => z.ausgang === "abgewiesen"
        && /Sicherung fehlgeschlagen, Änderung nicht durchgeführt/.test(z.zusatz || ""))).toBe(true);
      expect(neu.some((z) => z.art === "schreiben" && z.ausgang === "erfolg")).toBe(false);
    }, 120000);
  }

  it("Erfolgsfall unverändert: erst Sicherung des jetzigen Stands, dann Tausch; 200", async () => {
    await neuStart();
    const marke = await ablegen();
    const standVorher = (await B.bestandLesen(laden(), RAUM)).stand;
    const markenVorher = await sicherungsMarken();
    const w = await wiederherstellen(marke);
    expect(w.status, w.roh).toBe(200);
    expect(steuer.aufrufe).toHaveLength(1);
    expect(steuer.aufrufe[0].standBeimAnlegen).toBe(standVorher);
    const neu = (await sicherungsMarken()).filter((m) => !markenVorher.includes(m));
    expect(neu).toHaveLength(1);
    const s = await laden().get(`sicherung:${RAUM}:${neu[0]}`, { type: "json" });
    expect(Object.keys(s.mandanten[0].abweichungen)).toHaveLength(10);
    expect(Object.keys((await gespeichert()).abweichungen)).toEqual(["a1|2026-12-20"]);
  }, 120000);
});

describe("(ii) manuelle Sicherung: Fehler sichtbar", () => {
  for (const modus of /** @type {const} */ (["erschoepft", "ablage"])) {
    it(`Sicherung scheitert (${modus}): 503 mit Fehlertext, kein „ok“, keine Marke; Bestand unverändert; Protokoll „fehler“`, async () => {
      await neuStart();
      const vorher = await platte();
      const nZ = (await zeilen()).length;
      steuer.modus = modus;
      const w = await anfrage("/api/sicherung", { rumpf: {} });
      expect(w.status, w.roh).toBe(503);
      expect(w.ok).toBeUndefined();
      expect(w.marke).toBeUndefined();
      expect(w.code).toBe("SICHERUNG_FEHLGESCHLAGEN");
      expect(w.fehler).toMatch(/Sicherung/);
      expect(await platte()).toEqual(vorher);
      const neu = await neueZeilen(nZ);
      expect(neu.some((z) => z.art === "sicherung" && z.ausgang === "fehler")).toBe(true);
      expect(neu.some((z) => z.art === "sicherung" && z.ausgang === "erfolg")).toBe(false);
    }, 120000);
  }
  it("Erfolgsfall unverändert: 200 mit Marke", async () => {
    const w = await anfrage("/api/sicherung", { rumpf: {} });
    expect(w.status, w.roh).toBe(200);
    expect(w.ok).toBe(true);
    expect((await sicherungsMarken())).toContain(w.marke);
  }, 120000);
});

describe("(iii) Datenschutzlauf „an“: Schutzsicherung vor dem Löschen", () => {
  const R = "sfd-dsl";
  const JETZT = new Date("2026-11-02T03:00:00Z");
  const alt = () => ({ version: 9, mandanten: [{ id: "m1", name: "B1", einheiten: [{ id: "e1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], personen: [person("p1", "mitarbeiter")],
    abweichungen: { "p1|2024-09-01": "F", "p1|2026-10-01": "F" }, abwesenheiten: [], erfassung: {},
    einstempeln: { "p1|2024-09-01": { start: "06:00", ende: "14:00" } }, anfragen: [], aenderungen: [], nachrichten: [] }] });

  it("Sicherung scheitert: dieser Raum bleibt byte-gleich, Fehler im Vermerk und im Protokoll (Betreiberweg „fehler“), Lauf geht weiter", async () => {
    await B.bestandSchreiben(laden(), R, alt(), { durch: "Pruefung" });
    const vorher = await platte(R);
    const nZ = (await zeilen()).length;
    steuer.modus = "erschoepft";
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(v.uebersprungen).toBe(false);
    expect(await platte(R)).toEqual(vorher);
    expect(v.geaendert.filter((x) => x.raum === R)).toEqual([]);
    const f = v.fehler.filter((x) => x.raum === R);
    expect(f).toHaveLength(1);
    expect(f[0].grund).toMatch(/Sicherung fehlgeschlagen, Änderung nicht durchgeführt/);
    const neu = await neueZeilen(nZ);
    expect(neu.some((z) => z.art === "loeschlauf" && z.ausgang === "fehler" && z.zusatz.startsWith(`${R}: Sicherung fehlgeschlagen`))).toBe(true);
    expect(neu.some((z) => z.art === "fehler" && /Sicherung fehlgeschlagen, Änderung nicht durchgeführt/.test(z.zusatz || "")
      && String(z.zusatz).includes(R))).toBe(true);
    expect(JSON.stringify(neu)).not.toMatch(/Vp1|Np1/);
  }, 120000);

  it("Erfolgsfall unverändert: Sicherung, dann Löschen", async () => {
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(v.fehler.filter((x) => x.raum === R)).toEqual([]);
    expect(v.geaendert.map((x) => x.raum)).toContain(R);
    expect(Object.keys((await B.bestandLesen(laden(), R)).bestand.mandanten[0].abweichungen)).toEqual(["p1|2026-10-01"]);
    expect(await sicherungsMarken(R)).toHaveLength(1);
  }, 120000);
});

describe("(iii) Übernahme eines Altbestands: sicherung:<raum>:vor-zerlegung", () => {
  const altbestand = (name) => ({ version: 9, mandanten: [{ id: "m-z", name, personen: [person("z1", "leitung")],
    einheiten: [{ id: "e1" }], dienstarten: [], abweichungen: {} }] });
  /** Raum ohne Kern, aber mit liegenden Sicherungen: Kern, Scherben, Stand weg; Sicherungen bleiben. */
  const kernWeg = async (raum) => {
    for (const p of [`kern:${raum}`, `scherbe:${raum}:`, `stand:${raum}:`]) {
      const { blobs } = await laden().list({ prefix: p });
      for (const b of blobs) await laden().delete(b.key);
    }
  };

  it("erste Übernahme: Sicherungspunkt vor-zerlegung mit dem Altbestand, Altbestand danach entfernt", async () => {
    const R = "sfd-z1";
    await laden().setJSON(`bestand:${R}`, altbestand("Erster"));
    await B.bestandSchreiben(laden(), R, altbestand("Erster neu"), { durch: "Pruefung" });
    expect((await laden().get(`sicherung:${R}:vor-zerlegung`, { type: "json" })).mandanten[0].name).toBe("Erster");
    expect((await laden().getMetadata(`sicherung:${R}:vor-zerlegung`)).metadata.durch).toBe("automatisch vor der Zerlegung");
    expect(await laden().get(`bestand:${R}`, { type: "json" })).toBeNull();
  }, 120000);

  it("zweite Übernahme (Reviewer-Szenario #582): der erste Sicherungspunkt bleibt, der zweite Altbestand bekommt eine eigene Marke", async () => {
    const R = "sfd-z2";
    await laden().setJSON(`bestand:${R}`, altbestand("Erster"));
    await B.bestandSchreiben(laden(), R, altbestand("Erster neu"), { durch: "Pruefung" });
    const ersterAbdruck = (await platte(R))[`sicherung%3A${R}%3Avor-zerlegung.json`];
    expect(ersterAbdruck).toBeTruthy();
    await kernWeg(R);
    await laden().setJSON(`bestand:${R}`, altbestand("Zweiter"));
    await B.bestandSchreiben(laden(), R, altbestand("Zweiter neu"), { durch: "Pruefung" });
    expect((await platte(R))[`sicherung%3A${R}%3Avor-zerlegung.json`]).toBe(ersterAbdruck);       // byte-gleich
    expect((await laden().get(`sicherung:${R}:vor-zerlegung`, { type: "json" })).mandanten[0].name).toBe("Erster");
    const { MARKE } = await import("../server/lib/sicherungen.mjs");
    const weitere = (await sicherungsMarken(R)).filter((m) => m !== "vor-zerlegung");
    expect(weitere).toHaveLength(1);
    expect(MARKE.test(weitere[0])).toBe(true);
    expect((await laden().get(`sicherung:${R}:${weitere[0]}`, { type: "json" })).mandanten[0].name).toBe("Zweiter");
    const md = (await laden().getMetadata(`sicherung:${R}:${weitere[0]}`)).metadata;
    expect(md.automatisch).toBe("ja");
    expect(md.durch).toMatch(/vor der Zerlegung/);
    expect(await laden().get(`bestand:${R}`, { type: "json" })).toBeNull();
  }, 120000);

  it("Sicherung scheitert: der Altbestand bleibt liegen (kein stiller Verlust des Rückwegs); der Kern gilt", async () => {
    const R = "sfd-z3";
    await laden().setJSON(`bestand:${R}`, altbestand("Erster"));
    const echt = laden();
    const kaputt = new Proxy(echt, { get(t, k) {
      if (k === "setJSONWennNeu") return async (s, ...rest) => {
        if (String(s).startsWith(`sicherung:${R}:`)) throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
        return t.setJSONWennNeu(s, ...rest);
      };
      const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const erg = await B.bestandSchreiben(kaputt, R, altbestand("Erster neu"), { durch: "Pruefung" });
      expect(erg.ok).toBe(true);
      expect(fehler.mock.calls.some((c) => /Altbestand.*nicht gesichert.*nicht entfernt/.test(c.join(" ")))).toBe(true);
    } finally { fehler.mockRestore(); }
    expect((await laden().get(`bestand:${R}`, { type: "json" })).mandanten[0].name).toBe("Erster");
    expect(await sicherungsMarken(R)).toEqual([]);
    expect((await B.bestandLesen(laden(), R)).bestand.mandanten[0].name).toBe("Erster neu");
  }, 120000);

  it("zweite Übernahme, Ausweich-Sicherung erschöpft: Altbestand bleibt, erster Sicherungspunkt unverändert", async () => {
    const R = "sfd-z4";
    await laden().setJSON(`bestand:${R}`, altbestand("Erster"));
    await B.bestandSchreiben(laden(), R, altbestand("Erster neu"), { durch: "Pruefung" });
    const erster = (await platte(R))[`sicherung%3A${R}%3Avor-zerlegung.json`];
    await kernWeg(R);
    await laden().setJSON(`bestand:${R}`, altbestand("Zweiter"));
    steuer.modus = "erschoepft";
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await B.bestandSchreiben(laden(), R, altbestand("Zweiter neu"), { durch: "Pruefung" })).ok).toBe(true);
    } finally { fehler.mockRestore(); }
    expect((await platte(R))[`sicherung%3A${R}%3Avor-zerlegung.json`]).toBe(erster);
    expect((await laden().get(`bestand:${R}`, { type: "json" })).mandanten[0].name).toBe("Zweiter");
    expect(await sicherungsMarken(R)).toEqual(["vor-zerlegung"]);
  }, 120000);
});
