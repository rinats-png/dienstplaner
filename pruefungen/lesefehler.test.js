/* ==========================================================================
   LESEFEHLER, ABBRUCH, MOMENTAUFNAHME (WP-02, Auflagen aus dem Review)

   1  Unlesbare Scherbe oder unlesbares Verzeichnis: Bis November 2026
      überging bestandLesen den Fehler, jeder Schreibweg baute aus dem
      lückenhaften Stand einen neuen — und die Waisenbereinigung in
      schreibeAlles löschte die beschädigte Scherbe. Jetzt: 503, nichts
      geschrieben, Datei unverändert.
   4  Abbruch zwischen Kern und Standzeiger: Kern auf N+1, Zeiger auf N,
      Vermerk N+1 fehlt. Danach endete jeder Stempel in 409. Jetzt wird der
      Stand beim nächsten Schreiben aus dem Gespeicherten angeglichen.
   9  Sicherung anlegen: Die Momentaufnahme fiel mitten in einen
      Schreibvorgang und bildete einen Stand ab, den es nie gab.

   Der Eingriff sitzt in der Ablage (vi.mock unten): Ein Verzeichnis kann
   einen Lesefehler melden, ein Schreibvorgang kann vorher warten oder
   scheitern.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const haken = { listFehler: null, setVorher: null };

vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = await original();
  return { ...echt,
    getStore: (angabe) => {
      const s = echt.getStore(angabe);
      return { ...s,
        list: async (o) => {
          const p = String((o && o.prefix) || "");
          if (haken.listFehler && p.startsWith(haken.listFehler)) throw new Error("EIO: Prüfhaken Verzeichnis");
          return s.list(o);
        },
        setJSON: async (k, v, o) => {
          if (haken.setVorher) await haken.setVorher(k);
          return s.setJSON(k, v, o);
        },
      };
    } };
});

const WIRT = "127.0.0.1:3000";
const berlin = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const HEUTE = berlin(new Date());
const GESTERN = berlin(new Date(Date.now() - 24 * 3600 * 1000));
/* Ein Monat, der weder heute noch gestern ist — dort liegt die Scherbe,
   die beschädigt wird. */
const FREMD = "2025-03";
let wurzel, laden, daten, sitzungAnlegen, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`,
    "x-forwarded-for": `10.6.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

async function raumAnlegen(raum) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l1", "leitung"), person("a1"), person("a2"), person("b1")],
    abweichungen: { [`a1|${FREMD}-10`]: "F", [`b1|${FREMD}-11`]: "F", [`a1|${GESTERN}`]: "F" },
    abwesenheiten: [], erfassung: {},
    einstempeln: { [`b1|${FREMD}-11`]: { start: "06:00", ende: "14:00" } } }] }, { durch: "Pruefung" });
}
async function sitzungFuer(raum, personId, rolle = "mitarbeiter") {
  const { token } = await sitzungAnlegen({ bestand: raum, name: `Probe ${personId}`, rolle,
    person: personId, betrieb: 0, mandantId: "m1", einheit: null }, 60 * 60 * 1000);
  return token;
}

/** Der Dateiname, unter dem die Ablage einen Schlüssel ablegt (ablage.mjs, dateiname). */
const dateiVon = (schluessel) => path.join(wurzel, "centric",
  `${schluessel.replace(/[^A-Za-z0-9_-]/g, (z) => `%${z.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)}.json`);
const scherbenDatei = (raum, monat) => dateiVon(`scherbe:${raum}:m1:${monat}`);

async function beschaedigen(raum) {
  const datei = scherbenDatei(raum, FREMD);
  await readFile(datei);                         // muss es geben
  await writeFile(datei, "{kaputt");
  return datei;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-lesefehler-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("1 — beschädigte Scherbe: kein Schreibweg löscht sie", () => {
  it("Stempeln → 503, Datei unverändert vorhanden, kein Stempel", async () => {
    const RAUM = "lese-stempel";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "a2");
    const datei = await beschaedigen(RAUM);
    const a = await anfrage("/api/stempeln", { token: t, rumpf: { datum: HEUTE, art: "start" } });
    expect(a.status, JSON.stringify(a)).toBe(503);
    expect(a.ok).not.toBe(true);
    expect(await readFile(datei, "utf8")).toBe("{kaputt");
  });

  it("PUT der Leitung → 503, Datei unverändert vorhanden", async () => {
    const RAUM = "lese-put";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "l1", "leitung");
    const g = await anfrage("/api/bestand", { methode: "GET", token: t });
    const datei = await beschaedigen(RAUM);
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].abweichungen[`a2|${HEUTE}`] = "F";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(503);
    expect(await readFile(datei, "utf8")).toBe("{kaputt");
  });

  it("Zeit bestätigen → 503, Datei unverändert vorhanden", async () => {
    const RAUM = "lese-zeit";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "a1");
    const datei = await beschaedigen(RAUM);
    const z = await anfrage("/api/zeit-bestaetigen", { token: t, rumpf: { datum: GESTERN } });
    expect(z.status, JSON.stringify(z)).toBe(503);
    expect(await readFile(datei, "utf8")).toBe("{kaputt");
  });
});

describe("1 — Verzeichnis der Scherben nicht lesbar", () => {
  it("Stempeln → 503; die Stempel desselben Monats bleiben", async () => {
    const RAUM = "lese-liste";
    await raumAnlegen(RAUM);
    const tB = await sitzungFuer(RAUM, "b1");
    const tA = await sitzungFuer(RAUM, "a2");
    const erster = await anfrage("/api/stempeln", { token: tB, rumpf: { datum: HEUTE, art: "start" } });
    expect(erster.status).toBe(200);

    haken.listFehler = `scherbe:${RAUM}:`;
    let a;
    try { a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "start" } }); }
    finally { haken.listFehler = null; }
    expect(a.status, JSON.stringify(a)).toBe(503);
    expect(a.ok).not.toBe(true);

    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(m.einstempeln[`b1|${HEUTE}`]).toEqual(erster.eintrag);      // nichts verloren
    expect(m.einstempeln[`b1|${FREMD}-11`]).toBeTruthy();
    expect(m.einstempeln[`a2|${HEUTE}`]).toBeUndefined();
  });

  it("PUT → 503, nichts überschrieben", async () => {
    const RAUM = "lese-liste-put";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "l1", "leitung");
    const g = await anfrage("/api/bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].abweichungen[`a2|${HEUTE}`] = "F";
    haken.listFehler = `scherbe:${RAUM}:`;
    let w;
    try { w = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } }); }
    finally { haken.listFehler = null; }
    expect(w.status).toBe(503);
    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(m.abweichungen[`a2|${HEUTE}`]).toBeUndefined();
    expect(m.einstempeln[`b1|${FREMD}-11`]).toBeTruthy();
  });
});

describe("H1 — GET mit beschädigter Scherbe gibt keinen Bestand mit Lücke heraus", () => {
  it("GET 503; nach der Reparatur speichert die Oberfläche, und der Monat ist noch da", async () => {
    const RAUM = "lese-get-luecke";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "l1", "leitung");
    const datei = scherbenDatei(RAUM, FREMD);
    const heil = await readFile(datei, "utf8");
    await writeFile(datei, "{kaputt");

    /* Die Oberfläche lädt, während die Scherbe unlesbar ist. */
    const g1 = await anfrage("/api/bestand", { methode: "GET", token: t });
    const status = g1.status;

    /* Die Scherbe wird repariert; die Oberfläche speichert eine Änderung
       im laufenden Monat — mit dem, was sie zuletzt bekommen hat. */
    await writeFile(datei, heil);
    const basis = status === 200 ? g1 : await anfrage("/api/bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(basis.bestand));
    b.mandanten[0].abweichungen[`a2|${HEUTE}`] = "F";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: basis.etag } });
    expect(w.status, JSON.stringify(w).slice(0, 200)).toBe(200);

    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(m.abweichungen[`a1|${FREMD}-10`], "Monat mit der beschädigten Scherbe verloren").toBe("F");
    expect(m.einstempeln[`b1|${FREMD}-11`]).toBeTruthy();
    expect(m.abweichungen[`a2|${HEUTE}`]).toBe("F");
    expect(status, "GET lieferte einen Bestand mit Lücke").toBe(503);
  });
});

describe("4 — Abbruch zwischen Kern und Standzeiger", () => {
  it("nächster Stempel 200, nichts verloren — weder vorher Gespeichertes noch der halbe Schreibvorgang", async () => {
    const RAUM = "lese-abbruch";
    await raumAnlegen(RAUM);
    const tB = await sitzungFuer(RAUM, "b1");
    const tA = await sitzungFuer(RAUM, "a2");
    const erster = await anfrage("/api/stempeln", { token: tB, rumpf: { datum: HEUTE, art: "start" } });
    expect(erster.status).toBe(200);

    /* Die Leitung schreibt — und der Prozess „stirbt", nachdem Kern und
       Scherben stehen, bevor Vermerk und Zeiger geschrieben sind. */
    const g = await B.bestandLesen(laden(), RAUM);
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].abweichungen[`a1|${HEUTE}`] = "F";
    const naechster = Number(g.stand) + 1;
    haken.setVorher = async (k) => {
      if (k === `stand:${RAUM}:${naechster}`) throw new Error("Abbruch: Prozess beendet");
    };
    try {
      await expect(B.bestandSchreiben(laden(), RAUM, b, { erwarteterStand: g.stand, durch: "Leitung" }))
        .rejects.toThrow("Abbruch");
    } finally { haken.setVorher = null; }

    const a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "start" } });
    expect(a.status, JSON.stringify(a)).toBe(200);
    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(m.einstempeln[`a2|${HEUTE}`]).toEqual(a.eintrag);
    expect(m.einstempeln[`b1|${HEUTE}`]).toEqual(erster.eintrag);
    expect(m.abweichungen[`a1|${HEUTE}`]).toBe("F");
    expect(m.einstempeln[`b1|${FREMD}-11`]).toBeTruthy();

    /* Und danach bleibt es heil: noch ein Stempel, wieder 200. */
    const c = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "ende" } });
    expect(c.status, JSON.stringify(c)).toBe(200);
  });
});

describe("9 — Sicherung anlegen: konsistente Momentaufnahme", () => {
  it("eine Sicherung während eines Schreibvorgangs enthält beide Monate neu oder beide alt", async () => {
    const RAUM = "lese-sicherung";
    await raumAnlegen(RAUM);
    const t = await sitzungFuer(RAUM, "l1", "leitung");
    const g = await anfrage("/api/bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    /* Seit WP-11 (Review F2) weist der Server eine unbekannte Dienstart ab
       (fail-closed) — die Marker sind deshalb die Schlüssel der beiden
       Einteilungen, der Wert eine bekannte Dienstart. */
    const KEY_A = `a2|${HEUTE}`, KEY_B = `a2|${FREMD}-20`;
    b.mandanten[0].abweichungen[KEY_A] = "F";
    b.mandanten[0].abweichungen[KEY_B] = "F";

    /* Der PUT hält an, bevor er die zweite der beiden Scherben schreibt. */
    let imSchreiben;
    const angehalten = new Promise((r) => { imSchreiben = r; });
    let geschrieben = 0;
    haken.setVorher = async (k) => {
      if (!k.startsWith(`scherbe:${RAUM}:`)) return;
      geschrieben += 1;
      if (geschrieben === 2) { imSchreiben(); await new Promise((r) => setTimeout(r, 400)); }
    };
    let put, sich;
    try {
      const putLauf = anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
      await angehalten;
      sich = await anfrage("/api/sicherung", { token: t, rumpf: {} });
      put = await putLauf;
    } finally { haken.setVorher = null; }
    expect(put.status).toBe(200);
    expect(sich.status, JSON.stringify(sich)).toBe(200);

    const namen = await readdir(path.join(wurzel, "centric"));
    const datei = namen.find((n) => decodeURIComponent(n) === `sicherung:${RAUM}:${sich.marke}.json`);
    expect(datei).toBeTruthy();
    const inhalt = await readFile(path.join(wurzel, "centric", datei), "utf8");
    const a = inhalt.includes(JSON.stringify(KEY_A)), bb = inhalt.includes(JSON.stringify(KEY_B));
    expect({ a, b: bb }, "Momentaufnahme mitten im Schreibvorgang").toEqual({ a, b: a });
  });
});
