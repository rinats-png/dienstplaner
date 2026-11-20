/* ==========================================================================
   P2-21 — /api/wiederherstellen MIT FACHPRÜFUNG (Empfehlung B: warnen und protokollieren)

   Bis hierher spielte die Leitung eine Sicherung ohne jede Fachprüfung zurück: Einteilungen, die heute beim
   Speichern gesperrt würden (Ruhezeit § 5 ArbZG, Schutzregeln, Qualifikation, Mindestbesetzung), kamen ohne
   403/409 und ohne jeden Vermerk zurück. Jetzt rechnet der Server dieselbe Prüfung wie beim Speichern
   (wiederherstellungsPruefung, server/lib/schutzdurchsetzung.mjs) — als Bericht, nicht als Sperre:
     - Datenrettung bleibt möglich: zurückgespielt wird auch mit sperrenden Befunden (200).
     - Auditierbar: Anzahl neuer Befunde je Regel in der Antwort (`fachpruefung`), im Eintrag „wiederhergestellt"
       des Betriebsprotokolls und im Serverprotokoll (Ausgang „pruefung", vor dem Tausch) — ohne Person, Tag, Merkmal.
     - Wirkung auf Daten unverändert: Abweichungen (auch vergangene), Bestätigungsprotokoll und übriger Stand sind
       genau die der Sicherung bzw. des jetzigen Stands; nichts wird automatisch bestätigt oder entfernt.
     - Fail-closed: Rechnet die Prüfung nicht zu Ende (Zeitbudget, Fehler), wird NICHTS zurückgespielt (503), auch
       keine Sicherung „vor Wiederherstellung" geschrieben.

   Über den echten Handler (server/funktionen/daten.mjs) mit Dateiablage im Temp-Ordner.
   Aufruf: npx vitest run pruefungen/p2-21-wiederherstellen-fachpruefung.test.js --maxWorkers=1
   ========================================================================== */
// zeit-ok: Der Handler rechnet mit dem heutigen Tag in Berlin (heuteBerlin); alle Testtage sind relativ dazu (tagePlus), der reine Teil nimmt einen festen Tag.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Steuerung für den Fail-closed-Teil: die Prüfung bricht ab (Zeitbudget) oder wirft. */
const steuer = vi.hoisted(() => {
  /** @type {{ modus: null | "zeitbudget" | "fehler" | "halten", halt: Promise<any>, gestartet: Promise<any>, start: () => void }} */
  const s = { modus: null, halt: Promise.resolve(), gestartet: Promise.resolve(), start: () => {} };
  return s;
});
vi.mock("../server/lib/schutzdurchsetzung.mjs", async (importOriginal) => {
  /** @type {any} */
  const o = await importOriginal();
  return { ...o, wiederherstellungsPruefung: async (...a) => {
    if (steuer.modus === "zeitbudget") return { zeitbudget: true };
    if (steuer.modus === "fehler") throw new Error("Prüfung kaputt");
    if (steuer.modus === "halten") { steuer.start(); await steuer.halt; }
    return o.wiederherstellungsPruefung(...a);
  } };
});

const WIRT = "127.0.0.1:3000";
const RAUM = "p221raum";
let wurzel, laden, daten, B, S, HEUTE, tagePlus, SD;
let nr = 0, markeNr = 0;
const T = {};

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.221.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `Name${id}`, rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [], ...extra });
const tag = (n) => tagePlus(HEUTE, n);
const betrieb = (abweichungen = {}) => ({
  id: "m-a", name: "A", status: "aktiv", einstellungen: { ruhezeit: 11, maxFolge: 6 },
  einheiten: [{ id: "e1" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
    { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 }],
  zyklus: { tage: ["-", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05",
  qualifikationen: [],
  personen: [person("l1", "leitung", { bereich: "ALLE" }), person("a1", "mitarbeiter"), person("a2", "mitarbeiter")],
  abweichungen, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [], bestaetigungen: [], protokoll: [],
});
/** Sicherung ablegen (wie /api/sicherung), Marke zurück. */
async function sicherungAblegen(m) {
  markeNr += 1;
  const marke = `2026-10-0${markeNr}-08-00-00`;
  await laden().setJSON(`sicherung:${RAUM}:${marke}`, { centric: "sicherung", fassung: 2, umfang: "betrieb", mandantId: "m-a",
    erzeugt: "2026-10-01T08:00:00.000Z", mandant: m }, { metadata: { zeit: "2026-10-01T08:00:00.000Z", durch: "Test" } });
  return marke;
}
const sicherungen = async () => (await laden().list({ prefix: `sicherung:${RAUM}:` })).blobs.length;
async function wiederherstellen(marke) {
  const r = await anfrage("/api/bestand", { methode: "GET", token: T.l1 });
  return anfrage("/api/wiederherstellen", { token: T.l1, rumpf: { marke, etag: r.etag } });
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-p221-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-p221-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  S = schutz;
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  SD = await import("../server/lib/schutzdurchsetzung.mjs");
  const Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  tagePlus = Z.tagePlus;
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [betrieb()] }, { durch: "Pruefung" });
  const code = "P221-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "l1", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  T.l1 = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(T.l1).toBeTruthy();
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("P2-21: Wiederherstellen prüft und berichtet, sperrt aber nicht", () => {
  it("Sicherung ohne neue Befunde: 200, Bericht leer, Protokoll „keine neuen Befunde“", async () => {
    const marke = await sicherungAblegen(betrieb({ [`a1|${tag(5)}`]: "F" }));
    const w = await wiederherstellen(marke);
    expect(w.status, w.roh).toBe(200);
    expect(w.fachpruefung).toMatchObject({ einteilungen: 0, sperrend: 0, befunde: {} });
    const m = await gespeichert();
    expect(m.abweichungen[`a1|${tag(5)}`]).toBe("F");
    expect(m.protokoll[0].text).toMatch(/Fachprüfung: keine neuen Befunde/);
  });

  it("Ruhezeit unter 11 Stunden (§ 5 ArbZG) in der Sicherung: zurückgespielt (Datenrettung), Befund gezählt und protokolliert", async () => {
    steuer.modus = null;
    const vorBest = (await gespeichert()).bestaetigungen;
    const abw = { [`a1|${tag(8)}`]: "S", [`a1|${tag(9)}`]: "F", [`a2|${tag(-3)}`]: "F" };
    const marke = await sicherungAblegen(betrieb(abw));
    const w = await wiederherstellen(marke);
    expect(w.status, w.roh).toBe(200);
    /* Bericht: nur Regelschlüssel und Anzahlen. */
    expect(w.fachpruefung.befunde.ruhezeitGesetz).toBeGreaterThanOrEqual(1);
    expect(w.fachpruefung.sperrend).toBeGreaterThanOrEqual(1);
    expect(w.fachpruefung.einteilungen).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(w.fachpruefung)).not.toMatch(/a1|a2|Namea|Va1|MuSchG|Mutter|\d{4}-\d{2}-\d{2}/);
    /* Wirkung auf Daten unverändert: genau die Abweichungen der Sicherung (auch die vergangene), keine Bestätigung erzeugt. */
    const m = await gespeichert();
    expect(m.abweichungen).toEqual(abw);
    expect(m.bestaetigungen).toEqual(vorBest);
    /* Sichtbar im Betriebsprotokoll (neuer Eintrag „wiederhergestellt"), ohne Person. */
    expect(m.protokoll[0].id).toBe(`w-${marke}`);
    expect(m.protokoll[0].text).toMatch(/wiederhergestellt · Fachprüfung: \d+ Einteilungen mit neuem Befund/);
    expect(m.protokoll[0].text).toMatch(/ruhezeitGesetz \d+/);
    expect(m.protokoll[0].text).not.toMatch(/Namea|Va1/);
    /* Serverprotokoll: Prüfzeile (vor dem Tausch) und Erfolgszeile tragen den Bericht. */
    const spur = await S.spurLesen(1);
    const pruef = spur.filter((z) => z.art === "schreiben" && z.ausgang === "pruefung" && String(z.zusatz).includes(marke));
    expect(pruef.length).toBe(1);
    expect(pruef[0].zusatz).toMatch(/ruhezeitGesetz \d+/);
    expect(pruef[0].zusatz).not.toMatch(/Namea|Va1/);
    const erfolg = spur.filter((z) => z.art === "schreiben" && z.ausgang === "erfolg" && String(z.zusatz).includes(`wiederhergestellt aus ${marke}`));
    expect(erfolg.length).toBe(1);
    expect(erfolg[0].zusatz).toMatch(/Fachprüfung: /);
  });

  it("gezählt wird nur, was gegenüber dem jetzigen Stand NEU ist (derselbe Stand noch einmal: keine Befunde)", async () => {
    const jetzt = await gespeichert();
    const marke = await sicherungAblegen(betrieb(jetzt.abweichungen));
    const w = await wiederherstellen(marke);
    expect(w.status, w.roh).toBe(200);
    expect(w.fachpruefung.einteilungen).toBe(0);
  });
});

describe("P2-21: fail-closed — ohne abgeschlossene Prüfung wird nichts zurückgespielt", () => {
  for (const modus of /** @type {const} */ (["zeitbudget", "fehler"])) {
    it(`Prüfung ${modus === "zeitbudget" ? "über dem Zeitbudget" : "wirft"}: 503, Stand und Sicherungen unverändert`, async () => {
      const vorher = await gespeichert();
      const marke = await sicherungAblegen(betrieb({ [`a2|${tag(20)}`]: "S", [`a2|${tag(21)}`]: "F" }));
      const anzahl = await sicherungen();
      steuer.modus = modus;
      try {
        const w = await wiederherstellen(marke);
        expect(w.status, w.roh).toBe(503);
        expect(w.code).toBe("FACHPRUEFUNG_OFFEN");
        /* Review #419 (Auflage 1c): kein „gleich noch einmal“ — der Versuch zählt zur Bremse, Notweg über den Betreiber. */
        expect(w.text).toMatch(/fünf Wiederherstellungen je Stunde/);
        expect(w.text).toMatch(/Betreiber/);
        expect(w.text).not.toMatch(/in einigen Sekunden/);
        expect(w.roh).not.toMatch(/Prüfung kaputt/);                     // H3: kein Fehlertext nach außen
      } finally { steuer.modus = null; }
      expect(await gespeichert()).toEqual(vorher);
      expect(await sicherungen()).toBe(anzahl);                         // auch keine Sicherung „vor Wiederherstellung"
      const spur = await S.spurLesen(1);
      expect(spur.some((z) => z.ausgang === "abgewiesen" && String(z.zusatz).includes(`${marke}: Fachprüfung nicht abgeschlossen`))).toBe(true);
      /* H3: auch im Protokoll fester Text statt der Ausnahmemeldung. */
      expect(spur.some((z) => String(z.zusatz || "").includes("Prüfung kaputt"))).toBe(false);
    });
  }
});

describe("P2-21: Die Prüfung hält die Raumsperre nicht (Review #419, Auflage 1)", () => {
  it("während die Prüfung rechnet, speichert ein anderer Schreiber; danach 409, nichts zurückgespielt", async () => {
    const marke = await sicherungAblegen(betrieb({ [`a1|${tag(30)}`]: "S", [`a1|${tag(31)}`]: "F" }));
    let freigeben = () => {};
    steuer.halt = new Promise((ok) => { freigeben = ok; });
    steuer.gestartet = new Promise((ok) => { steuer.start = ok; });
    steuer.modus = "halten";
    try {
      const r = await anfrage("/api/bestand", { methode: "GET", token: T.l1 });
      const laeuft = anfrage("/api/wiederherstellen", { token: T.l1, rumpf: { marke, etag: r.etag } });
      await steuer.gestartet;
      /* Ein Speichern desselben Raums kommt durch, obwohl die Prüfung noch rechnet (keine Raumsperre). */
      const b = JSON.parse(JSON.stringify(r.bestand));
      b.mandanten[0].abweichungen[`a2|${tag(40)}`] = "F";
      const put = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
      expect(put.status, put.roh).toBe(200);
      freigeben();
      const w = await laeuft;
      expect(w.status, w.roh).toBe(409);
      expect((await gespeichert()).abweichungen[`a2|${tag(40)}`]).toBe("F");
      expect((await gespeichert()).abweichungen[`a1|${tag(30)}`]).toBeUndefined();
    } finally { steuer.modus = null; freigeben(); }
  });
});

describe("wiederherstellungsPruefung (rein, fester Tag)", () => {
  const H = "2026-11-18";
  const m = (abw, extra = {}) => ({ ...betrieb(abw), ...extra });
  it("zählt sperrende Befunde ohne Absage und ohne Person/Tag", async () => {
    const r = await SD.wiederherstellungsPruefung(m({}), m({ "a1|2026-11-20": "S", "a1|2026-11-21": "F" }), H);
    /* Beide Einteilungen des Paars (Spät vor, Früh nach der zu kurzen Ruhezeit) tragen den Befund. */
    expect("bericht" in r && r.bericht).toEqual({ einteilungen: 2, sperrend: 2, vergangen: 0, befunde: { ruhezeitGesetz: 2 },
      dienstartUnbekannt: 0, begrenzt: false, konflikte: 0 });
    expect(SD.wiederherstellungsBerichtZeile("bericht" in r ? r.bericht : null)).toBe(
      "Fachprüfung: 2 Einteilungen mit neuem Befund (sperrend 2, vor heute 0) · ruhezeitGesetz 2 · nicht gesperrt (P2-21, Empfehlung B)");
  });
  it("H2: Regeln mit Schutzbezug (keine Nacht u. a.) erscheinen nur zusammengefasst als „schutz“", async () => {
    const mitNacht = (abw) => {
      const b = m(abw);
      b.dienstarten = [...b.dienstarten, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }];
      b.personen = b.personen.map((p) => (p.id === "a1" ? { ...p, einschraenkungen: { keineNacht: true } } : p));
      return b;
    };
    const r = await SD.wiederherstellungsPruefung(mitNacht({}), mitNacht({ "a1|2026-11-20": "N" }), H);
    const b = "bericht" in r ? r.bericht : null;
    expect(b && b.befunde.schutz).toBe(1);
    expect(Object.keys((b && b.befunde) || {}).filter((k) => /keineNacht|keinAlleindienst|maxDiensteWoche/.test(k))).toEqual([]);
    expect(SD.wiederherstellungsBerichtZeile(b)).not.toMatch(/keineNacht/);
  });
  it("eine unbekannte Dienstart wird gezählt statt abzusagen", async () => {
    const r = await SD.wiederherstellungsPruefung(m({}), m({ "a1|2026-11-20": "X" }), H);
    expect("bericht" in r && r.bericht.dienstartUnbekannt).toBe(1);
  });
  it("ohne Änderung: leerer Bericht", async () => {
    const r = await SD.wiederherstellungsPruefung(m({}), m({}), H);
    expect("bericht" in r && r.bericht).toMatchObject({ einteilungen: 0, sperrend: 0, befunde: {} });
    expect(SD.wiederherstellungsBerichtZeile("bericht" in r ? r.bericht : null)).toBe("Fachprüfung: keine neuen Befunde");
  });
  it("Zeitbudget überschritten: { zeitbudget: true } (der Handler spielt dann nichts zurück)", async () => {
    const mit = (abw) => m(abw, { dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30,
      mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } }] });
    const r = await SD.wiederherstellungsPruefung(mit({}), mit({ "a1|2026-11-20": "F" }), H, { budgetMs: 1e-9 });
    expect(r).toEqual({ zeitbudget: true });
  });
  it("der Speicherweg bleibt unverändert: dieselbe Übermittlung sperrt dort weiter (403-Grund)", () => {
    const r = SD.fachpruefungUebermittlung(m({}), m({ "a1|2026-11-20": "S", "a1|2026-11-21": "F" }), H);
    expect(r && r.sperre).toMatch(/Ruhezeit/);
  });
});
