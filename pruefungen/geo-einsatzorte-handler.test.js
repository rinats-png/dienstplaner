/* ==========================================================================
   EINSATZORTE, GEO-MODI, AUSSENDIENST — über den echten Handler (WP-20)

   Schreibwege (Modus nur Leitung, Wann/Wer vom Server, Ortsangaben der
   Dienstarten geprüft), das Stempeln je Dienst (Einsatzort, Außendienst,
   Pflicht → ORT_PRUEFEN, nie eine Ablehnung) und die Datensparsamkeit:
   keine Rohkoordinate in Antwort und Ablage, keine Koordinate eines
   Einsatzorts und kein Stempelergebnis fremder Personen für Beschäftigte,
   Schichtverantwortung und Betriebsrat.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp20raum";
const KUNDE = { lat: 51.2345678, lon: 9.8765432 };
const M_JE_GRAD = (2 * Math.PI * 6371000) / 360;
const nord = (p, meter) => p.lat + meter / M_JE_GRAD;
const ZENTRALE = { lat: 50, lon: 8 };
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, Z, HEUTE;
let nr = 0;
const T = {};

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.20.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const stempeln = (t, rumpf) => anfrage("/api/stempeln", { token: t, rumpf: { datum: HEUTE, ...rumpf } });
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp20-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  const ma = ["a1", "a2", "a3", "a4", "a5", "b1"];
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: { geoPruefung: true },
    einheiten: [{ id: "e1", standortId: "st1" }],
    standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", ...ZENTRALE, radius: 200 }],
    einsatzorte: [{ id: "es1", name: "Kunde Nord", ...KUNDE, radius: 100 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" },
      { id: "E", name: "Kundentermin", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es1" },
      { id: "A", name: "Außendienst", start: "08:00", ende: "16:00", ortModus: "aussendienst" }],
    personen: [person("l1", "leitung", { bereich: "ALLE" }), person("p1", "planer", { bereich: "ALLE" }), person("s1", "subplaner"),
      person("r1", "betriebsrat", { bereich: "ALLE" }), ...ma.map((i) => person(i, "mitarbeiter"))],
    abweichungen: { [`a1|${HEUTE}`]: "E", [`a2|${HEUTE}`]: "A", [`a3|${HEUTE}`]: "F", [`a4|${HEUTE}`]: "E", [`a5|${HEUTE}`]: "E", [`b1|${HEUTE}`]: "F" },
    einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of [["l1", "leitung"], ["p1", "planer"], ["s1", "subplaner"], ["r1", "betriebsrat"], ...ma.map((i) => [i, "mitarbeiter"])]) {
    c += 1;
    const code = `WPZ${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Schreiben: geoModus — nur die Leitung, mit Bestätigung, Wann/Wer vom Server", () => {
  const modus = async (t, wert, extra = {}) => {
    const r = await lies(t);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), ...(wert === undefined ? {} : { geoModus: wert }), ...extra };
    return anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("ohne Angabe gilt hinweis; die Planung kann „pflicht“ nicht setzen (wirkungslos)", async () => {
    const w = await modus(T.p1, "pflicht", { geoPruefungBestaetigt: true });
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).einstellungen.geoModus).toBeUndefined();
  });
  it("Leitung ohne Bestätigung: abgewiesen, nichts gespeichert", async () => {
    const w = await modus(T.l1, "pflicht");
    expect(w.status, w.roh).toBe(403);
    expect(w.roh).toContain("Mitbestimmung");
    expect((await gespeichert()).einstellungen.geoModus).toBeUndefined();
  });
  it("unbekannter Wert und falscher Typ: abgewiesen", async () => {
    for (const falsch of ["streng", 1, true, {}]) {
      const w = await modus(T.l1, falsch, { geoPruefungBestaetigt: true });
      expect(w.status, JSON.stringify(falsch)).toBe(403);
    }
    expect((await gespeichert()).einstellungen.geoModus).toBeUndefined();
  });
  it("Leitung mit Bestätigung: gespeichert; Zeitpunkt und Person vom Server, nie die mitgeschickten; Bestätigung nicht gespeichert", async () => {
    const w = await modus(T.l1, "pflicht", { geoPruefungBestaetigt: true, geoModusGeaendertAm: "1999-01-01", geoModusGeaendertVon: "p1" });
    expect(w.status, w.roh).toBe(200);
    const e = (await gespeichert()).einstellungen;
    expect([e.geoModus, e.geoModusGeaendertVon]).toEqual(["pflicht", "l1"]);
    expect(e.geoModusGeaendertAm.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    expect(e).not.toHaveProperty("geoPruefungBestaetigt");
  });
  it("unverändert: Zeitpunkt und Person bleiben; die Planung kann nicht zurückstellen", async () => {
    const vorher = (await gespeichert()).einstellungen;
    expect((await modus(T.l1, "pflicht")).status).toBe(200);
    await modus(T.p1, "hinweis");
    const e = (await gespeichert()).einstellungen;
    expect([e.geoModus, e.geoModusGeaendertAm, e.geoModusGeaendertVon]).toEqual(["pflicht", vorher.geoModusGeaendertAm, vorher.geoModusGeaendertVon]);
  });
  it("von pflicht auf hinweis braucht keine Bestätigung (wie Ausschalten)", async () => {
    expect((await modus(T.l1, "hinweis")).status).toBe(200);
    expect((await gespeichert()).einstellungen.geoModus).toBe("hinweis");
    expect((await modus(T.l1, "pflicht", { geoPruefungBestaetigt: true })).status).toBe(200);
  });
});

describe("Schreiben: Ortsangaben der Dienstarten", () => {
  const dienst = async (f, token = T.l1) => {
    const r = await lies(token);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].dienstarten = [...b.mandanten[0].dienstarten, { id: "Z", name: "Zusatz", start: "09:00", ende: "17:00", ...f }];
    return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("unbekannter Modus, Einsatzort ohne oder mit unbekanntem Ziel: 422, nichts gespeichert", async () => {
    for (const f of [{ ortModus: "überall" }, { ortModus: "einsatzort" }, { ortModus: "einsatzort", einsatzortId: "nix" }]) {
      const w = await dienst(f);
      expect(w.status, JSON.stringify(f) + w.roh).toBe(422);
    }
    expect((await gespeichert()).dienstarten.some((d) => d.id === "Z")).toBe(false);
  });
  it("gültig: Außendienst und Einsatzort mit vorhandenem Ziel", async () => {
    expect((await dienst({ ortModus: "aussendienst" })).status).toBe(200);
    const g = await gespeichert();
    expect(g.dienstarten.find((d) => d.id === "Z").ortModus).toBe("aussendienst");
  });
  it("ein von einer Dienstart verwendeter Einsatzort lässt sich nicht entfernen", async () => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einsatzorte = b.mandanten[0].einsatzorte.filter((s) => s.id !== "es1");
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(422);
    expect((await gespeichert()).einsatzorte.some((s) => s.id === "es1")).toBe(true);
  });
  it("Beschäftigte schreiben Dienstarten nicht (die Ortsangabe bleibt, wie sie ist)", async () => {
    const r = await lies(T.a1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].dienstarten = b.mandanten[0].dienstarten.map((d) => d.id === "E" ? { ...d, ortModus: "aussendienst" } : d);
    await anfrage("/api/bestand", { methode: "PUT", token: T.a1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect((await gespeichert()).dienstarten.find((d) => d.id === "E").ortModus).toBe("einsatzort");
  });
});

describe("Stempeln je Dienst im Pflichtmodus", () => {
  it("Kundentermin am Einsatzort: innerhalb, keine Markierung, Referenz ist der Einsatzort", async () => {
    const s = await stempeln(T.a1, { art: "start", lat: nord(KUNDE, 30), lon: KUNDE.lon, accuracy: 10 });
    expect(s.status, s.roh).toBe(200);
    expect(s.eintrag.geoStart).toMatchObject({ status: "INNERHALB", abstandsklasse: "innerhalb", entfernungGerundet: null,
      referenz: { art: "einsatzort", id: "es1", name: "Kunde Nord" } });
    expect(s.markierungen).not.toContain("ORT_PRUEFEN");
  });
  it("Kundentermin, aber an der Zentrale: außerhalb — Zeit gespeichert, ORT_PRUEFEN gesetzt, keine Ablehnung", async () => {
    const s = await stempeln(T.a4, { art: "start", lat: nord(ZENTRALE, 5), lon: ZENTRALE.lon, accuracy: 10 });
    expect(s.status, s.roh).toBe(200);
    expect(s.eintrag.start).toBeTruthy();
    expect(s.eintrag.geoStart.status).toBe("AUSSERHALB");
    expect(s.markierungen).toContain("ORT_PRUEFEN");
    expect((await gespeichert()).einstempeln[`a4|${HEUTE}`].markierungen).toContain("ORT_PRUEFEN");
  });
  it("Kundentermin ohne Position (Freigabe verweigert): Zeit gespeichert, ORT_PRUEFEN", async () => {
    const s = await stempeln(T.a5, { art: "start" });
    expect([s.status, s.eintrag.geoStart.grund, s.markierungen]).toEqual([200, "keine_position", ["ORT_PRUEFEN"]]);
  });
  it("Frühdienst am Standort: wie bisher, keine Markierung", async () => {
    const s = await stempeln(T.a3, { art: "start", lat: nord(ZENTRALE, 40), lon: ZENTRALE.lon, accuracy: 10 });
    expect([s.eintrag.geoStart.status, s.eintrag.geoStart.entfernungGerundet, s.markierungen]).toEqual(["INNERHALB", "50", []]);
  });
  it("Außendienst: nicht bewertbar, Grund aussendienst, keine Markierung — die Position ändert nichts", async () => {
    const s = await stempeln(T.a2, { art: "start", lat: 12.3456789, lon: 23.4567891, accuracy: 4 });
    expect(s.status, s.roh).toBe(200);
    expect(s.eintrag.geoStart).toMatchObject({ status: "NICHT_BEWERTBAR", grund: "aussendienst", abstandsklasse: null,
      entfernungGerundet: null, genauigkeitM: null, referenz: { art: "aussendienst" } });
    expect(s.markierungen).not.toContain("ORT_PRUEFEN");
    expect(s.ort).toBe("Außendienst — ohne festen Ort");
  });
  it("Ende desselben Tages: dasselbe Urteil (Referenz bleibt der Einsatzort)", async () => {
    const s = await stempeln(T.a1, { art: "ende", lat: nord(KUNDE, 400), lon: KUNDE.lon, accuracy: 10 });
    expect(s.eintrag.geoEnde).toMatchObject({ status: "AUSSERHALB", abstandsklasse: "bis_1km", referenz: { id: "es1" } });
    expect(s.markierungen).toContain("ORT_PRUEFEN");
  });
});

describe("Datensparsamkeit: keine Rohkoordinate, keine Koordinate des Einsatzorts, kein fremdes Ergebnis", () => {
  it("weder Antwort noch Ablage enthalten die gesendeten Koordinaten", async () => {
    const s = await stempeln(T.b1, { art: "start", lat: 50.0012345, lon: 8.0054321, accuracy: 9 });
    expect(s.status, s.roh).toBe(200);
    for (const roh of [s.roh, JSON.stringify(await gespeichert())]) {
      for (const x of ["50.0012345", "8.0054321", "12.3456789", "23.4567891"]) expect(roh).not.toContain(x);
    }
  });
  it("auch beim Einsatzort-Stempel und bei schlechter Genauigkeit: keine gesendete Koordinate in Antwort, Ablage oder Leitungssicht (M2)", async () => {
    /* Gesendet werden Marken, die sonst nirgends vorkommen. Der Einsatzort-Stempel (a5, Dienst E) liegt im Umkreis,
       der andere (a4, Dienst E) mit Genauigkeit über der Grenze (genauigkeit_zu_schlecht). */
    const marken = [
      { t: T.a5, lat: 51.2345999, lon: 9.8766111, accuracy: 12 },
      { t: T.a4, lat: 51.2347888, lon: 9.8767777, accuracy: 5000 },
    ];
    const antworten = [];
    for (const { t, ...messung } of marken) {
      const s = await stempeln(t, { art: "ende", ...messung });
      expect(s.status, s.roh).toBe(200);
      antworten.push(s.roh);
    }
    const roh = [...antworten, JSON.stringify(await gespeichert()), (await lies(T.l1)).roh, (await lies(T.p1)).roh];
    for (const r of roh) {
      for (const x of ["51.2345999", "9.8766111", "51.2347888", "9.8767777", "2345999", "2347888"]) expect(r).not.toContain(x);
    }
  });
  it("Beschäftigte, Schichtverantwortung und Betriebsrat: nie die Koordinate des Einsatzorts", async () => {
    for (const id of ["a3", "s1", "r1", "b1"]) {
      const r = await lies(T[id]);
      expect(r.status, id).toBe(200);
      expect(r.roh, id).not.toContain("51.2345678");
      expect(r.roh, id).not.toContain("9.8765432");
    }
    const l = await lies(T.l1);
    expect(l.roh).toContain("51.2345678");                         // die Planung braucht sie zum Pflegen
  });
  it("fremde Stempelergebnisse sehen nur Leitung und Planung; Beschäftigte nur die eigenen, Betriebsrat und SV keine", async () => {
    const fremd = (r) => JSON.stringify(r.bestand.mandanten[0].einstempeln || {});
    const b1 = fremd(await lies(T.b1));
    expect(b1).toContain("b1|");
    expect(b1).not.toContain("a1|");
    expect(b1).not.toContain("a2|");
    for (const id of ["s1", "r1"]) {
      const s = fremd(await lies(T[id]));
      expect(s, id).not.toContain("geoStart");
      expect(s, id).not.toContain("aussendienst");
    }
    expect(fremd(await lies(T.l1))).toContain("a2|");
  });
});
