/* ==========================================================================
   FREMDE KENNUNG MIT EIGENER PERSON — Kapern und Existenzorakel (Prüfung zu Review #356)

   B1 (mittel): Beschäftigte schickten einen Antrag mit der Kennung eines
      FREMDEN, für sie verborgenen Antrags und der eigenen personId — der
      fremde Antrag (etwa ein genehmigter Urlaub) wurde ersetzt, der neue
      „eigene" übernahm Antwort, Entscheidung und Entscheider der Leitung,
      und beim nächsten Abruf las die Person die Antwort an die andere.
      Jetzt: Der fremde Antrag bleibt, wie er war; der Vorgang wird still
      übergangen (200). Kein neuer Antrag unter anderer Kennung.
   B2 (gering): Die Schichtverantwortung bekam für einen verborgenen Antrag
      (anderer Bereich) 403-Texte, für eine unbekannte Kennung 200 —
      Existenzorakel. Jetzt: dieselbe Antwort wie für eine unbekannte Kennung,
      der gespeicherte Antrag bleibt unverändert.
   B3 (gering): Wunsch/Einsprung/Urlaubsrundenwunsch mit fremder Kennung
      entstand als zweiter Eintrag mit derselben Kennung. Jetzt übergangen.

   Geprüft über den echten Handler (PUT /api/bestand, Zustände byte-gleich,
   gleiche Antwort für „fremd verborgen" und „nicht vorhanden") und mit
   einem Differenztest alt/neu (die alten Fassungen wörtlich, Zufallsbestände
   mit festem Startwert, Rollen Beschäftigte und Schichtverantwortung).

   Aufruf: npx vitest run pruefungen/antrag-kapern-orakel.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eigenesZusammen, einheitZusammen, einheitAm, eigeneEinheit } from "../server/lib/rechte.mjs";

/* Feste Uhr für die ganze Datei: Handler, Sitzungen, Sichtfenster und Zeitstempel rechnen mit ihr. */
const JETZT = new Date("2026-11-18T10:00:00.000Z");
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(JETZT);
const T = "2026-11-23";

/* ---------- 1. Über den echten Handler ---------- */
const WIRT = "127.0.0.1:3000";
const RAUM = "antrag-kapern";
let wurzel, laden, daten, B, sitzungAnlegen;
const tok = {};
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.63.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const ANTRAG_A2 = { id: "an-a2", personId: "a2", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "genehmigt",
  text: "Begruendung-a2", antwort: "ANTWORT-AN-A2", entschieden: "1.11.2026", durch: "Leitung" };
const ANTRAG_B1 = { id: "an-b1", personId: "b1", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "genehmigt",
  text: "Begruendung-b1", antwort: "ANTWORT-AN-B1", entschieden: "1.11.2026", durch: "Leitung" };
const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
  einheiten: [{ id: "eA", name: "A" }, { id: "eB", name: "B" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
  personen: [person("l1", "leitung", "eA"), person("s1", "subplaner", "eA"), person("a1", "mitarbeiter", "eA"),
    person("a2", "mitarbeiter", "eA"), person("b1", "mitarbeiter", "eB")],
  abweichungen: {}, einstempeln: {}, erfassung: {}, abwesenheiten: [], nachrichten: [],
  anfragen: [
    { id: "an-a1", personId: "a1", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "offen", text: "eigen" },
    ANTRAG_A2, ANTRAG_B1,
    { id: "an-a2o", personId: "a2", typ: "abwesenheit", art: "urlaub", von: "2026-11-24", bis: "2026-11-24", status: "offen", text: "offen-a2" },
    { id: "an-b1t", personId: "b1", typ: "tausch", von: T, bis: T, status: "offen", text: "Tausch", interessenten: [] },
  ],
  wuensche: [{ id: "w-a2", personId: "a2", datum: T, art: "frei" }],
  einspruenge: [{ id: "e-b1", personId: "b1", datum: T, dienstId: "F", zeit: "x" }] }] });

const roh = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const holen = async (wer) => {
  const g = await anfrage("/api/bestand", { methode: "GET", token: tok[wer] });
  expect(g.status).toBe(200);
  return g;
};
const schreiben = async (wer, aendern) => {
  const g = await holen(wer);
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: tok[wer], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
};
/** Was eine Antwort verrät: Status, Schlüssel und alles außer dem neuen Stand. */
const antwortBild = (w) => { const { etag: _e, ...rest } = w; return JSON.stringify({ ...rest, schluessel: Object.keys(w).sort() }); };
const neuerAntrag = (id, personId, extra = {}) => ({ id, personId, typ: "abwesenheit", art: "urlaub", von: "2026-08-03", bis: "2026-08-04",
  status: "offen", text: "neu", ...extra });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-kapern-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  for (const [wer, rolle] of [["l1", "leitung"], ["s1", "subplaner"], ["a1", "mitarbeiter"]])
    tok[wer] = (await sitzungAnlegen({ bestand: RAUM, name: `V${wer}`, rolle, person: wer, betrieb: 0, mandantId: "m-a", einheit: null },
      2 * 3600 * 1000)).token;
});
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
/** Frischer Bestand, einmal unverändert durch `wer` gespeichert — danach ist die gespeicherte Form die,
    die jeder weitere Speichervorgang ohne Änderung wieder ergibt (Vergleich byte-gleich). */
const frisch = async (wer) => {
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  if (wer) expect((await schreiben(wer, () => {})).status).toBe(200);
};

describe("B1 Handler: Beschäftigte mit fremder Kennung und eigener personId", () => {
  for (const [titel, id] of [["verborgener genehmigter Urlaub (gleicher Bereich)", "an-a2"], ["verborgener Urlaub (anderer Bereich)", "an-b1"],
    ["sichtbares Tauschgesuch", "an-b1t"]]) {
    it(`${titel}: 200, Zustand byte-gleich, keine fremde Antwort in der Sicht`, async () => {
      await frisch("a1");
      const vorher = JSON.stringify((await roh()).mandanten[0]);
      const w = await schreiben("a1", (m) => { m.anfragen =[...m.anfragen.filter((x) => x.id !== id), neuerAntrag(id, "a1")]; });
      expect(w.status, JSON.stringify(w)).toBe(200);
      expect(JSON.stringify((await roh()).mandanten[0])).toBe(vorher);
      const sicht = JSON.stringify((await holen("a1")).bestand);
      expect(sicht).not.toContain("ANTWORT-AN-A2");
      expect(sicht).not.toContain("ANTWORT-AN-B1");
      expect(sicht).not.toContain("Begruendung-a2");
    });
  }
  it("gleiche Antwort für fremde verborgene und nicht vorhandene Kennung; die unbekannte wird ein eigener Antrag (wie bisher)", async () => {
    await frisch("a1");
    const fremd = await schreiben("a1", (m) => { m.anfragen.push(neuerAntrag("an-a2", "a1")); });
    await frisch("a1");
    const neu = await schreiben("a1", (m) => { m.anfragen.push(neuerAntrag("gibt-es-nicht", "a1")); });
    expect(antwortBild(fremd)).toBe(antwortBild(neu));
    const s = (await roh()).mandanten[0].anfragen.find((x) => x.id === "gibt-es-nicht");
    expect(s).toMatchObject({ personId: "a1", status: "offen", von: "2026-08-03" });
    expect(s.antwort).toBeUndefined();
  });
});

describe("B2 Handler: Schichtverantwortung, verborgener Antrag aus einem anderen Bereich", () => {
  const faelle = [
    ["eigene personId, offen", (id) => neuerAntrag(id, "s1"), 200],
    ["fremde personId (anderer Bereich)", (id) => neuerAntrag(id, "b1"), 403],
    ["eigene personId, nicht offen", (id) => neuerAntrag(id, "s1", { status: "genehmigt" }), 403],
    ["Interessenmeldung am verborgenen Antrag", (id) => ({ ...ANTRAG_B1, id, interessenten: ["s1"] }), 403],
    ["Antwort setzen am verborgenen Antrag", (id) => ({ ...ANTRAG_B1, id, status: "abgelehnt", antwort: "X" }), 403],
  ];
  for (const [titel, eintrag, status] of faelle) {
    it(`${titel}: Antwort wie bei unbekannter Kennung (${status}), Zustand byte-gleich`, async () => {
      await frisch("s1");
      const vorher = JSON.stringify((await roh()).mandanten[0]);
      const fremd = await schreiben("s1", (m) => { m.anfragen.push(eintrag("an-b1")); });
      expect(fremd.status, JSON.stringify(fremd)).toBe(status);
      expect(JSON.stringify((await roh()).mandanten[0])).toBe(vorher);
      await frisch("s1");
      const neu = await schreiben("s1", (m) => { m.anfragen.push(eintrag("gibt-es-nicht")); });
      expect(antwortBild(fremd)).toBe(antwortBild(neu));
      expect(JSON.stringify(fremd)).not.toContain("umschreiben");
      expect(JSON.stringify(fremd)).not.toContain("Sache der Leitung");
    });
  }
});

describe("B3 Handler: Wunsch und Einsprung unter fremder Kennung", () => {
  for (const [feld, eintrag] of [["wuensche", { id: "w-a2", personId: "a1", datum: T, art: "moechte" }],
    ["einspruenge", { id: "e-b1", personId: "a1", datum: T, dienstId: "F", zeit: "y" }]]) {
    it(`${feld}: 200, kein zweiter Eintrag mit derselben Kennung, Zustand byte-gleich`, async () => {
      await frisch("a1");
      const vorher = JSON.stringify((await roh()).mandanten[0]);
      const w = await schreiben("a1", (m) => { m[feld] = [...(m[feld] || []), eintrag]; });
      expect(w.status, JSON.stringify(w)).toBe(200);
      expect(JSON.stringify((await roh()).mandanten[0])).toBe(vorher);
    });
  }
});

describe("Legitime Wege bleiben (Handler)", () => {
  it("Beschäftigte: eigenen Antrag anlegen, ändern, zurückziehen, löschen; Interesse am sichtbaren Tauschgesuch", async () => {
    await frisch();
    expect((await schreiben("a1", (m) => { m.anfragen.push(neuerAntrag("an-neu", "a1")); })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-neu")).toMatchObject({ personId: "a1", status: "offen" });
    expect((await schreiben("a1", (m) => { m.anfragen.find((x) => x.id === "an-neu").text = "geändert"; })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-neu").text).toBe("geändert");
    expect((await schreiben("a1", (m) => { m.anfragen.find((x) => x.id === "an-a1").status = "zurueckgezogen"; })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-a1").status).toBe("zurueckgezogen");
    expect((await schreiben("a1", (m) => { m.anfragen = m.anfragen.filter((x) => x.id !== "an-neu"); })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.some((x) => x.id === "an-neu")).toBe(false);
    expect((await schreiben("a1", (m) => {
      const t = m.anfragen.find((x) => x.id === "an-b1t"); t.interessenten = [...t.interessenten, "a1"]; })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-b1t").interessenten).toContain("a1");
    expect((await schreiben("a1", (m) => { m.wuensche = [...(m.wuensche || []), { id: "w-a1", personId: "a1", datum: T, art: "moechte" }]; })).status).toBe(200);
    expect((await roh()).mandanten[0].wuensche.map((x) => x.id).sort()).toEqual(["w-a1", "w-a2"]);
  });
  it("Schichtverantwortung: Antrag aus dem Bereich entscheiden, eigenen anlegen; Leitung entscheidet jeden", async () => {
    await frisch();
    const w = await schreiben("s1", (m) => { const a = m.anfragen.find((x) => x.id === "an-a2o"); a.status = "abgelehnt"; a.antwort = "nein"; });
    expect(w.status, JSON.stringify(w)).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-a2o")).toMatchObject({ status: "abgelehnt", antwort: "nein", durch: "Vs1 Ns1" });
    expect((await schreiben("s1", (m) => { m.anfragen.push(neuerAntrag("an-s1", "s1")); })).status).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-s1")).toMatchObject({ personId: "s1", status: "offen" });
    const l = await schreiben("l1", (m) => { const a = m.anfragen.find((x) => x.id === "an-b1"); a.antwort = "Leitung"; });
    expect(l.status, JSON.stringify(l)).toBe(200);
    expect((await roh()).mandanten[0].anfragen.find((x) => x.id === "an-b1").antwort).toBe("Leitung");
  });
});

/* ---------- 2. Differenztest alt/neu: die alten Fassungen wörtlich (Stand vor dieser Prüfung) ---------- */
const kennungGueltig = (id) => (typeof id === "string" && id.length > 0 && id.length <= 100) || (typeof id === "number" && Number.isFinite(id));
const eigenerEintrag = (e, ich) => e && String(e.personId) === String(ich);
const ANTRAGSTATUS_SELBST = ["offen", "zurueckgezogen"];
function altEigeneEintraege(alt, neu, ich) {
  const fremde = (Array.isArray(alt) ? alt : []).filter((e) => !eigenerEintrag(e, ich));
  const eigene = (Array.isArray(neu) ? neu : []).filter((e) => eigenerEintrag(e, ich));
  return [...fremde, ...eigene];
}
function altAnfragenZusammen(alt, neu, ich) {
  const alteNachId = new Map((Array.isArray(alt) ? alt : []).filter(Boolean).map((a) => [a.id, a]));
  const neueNachId = new Map((Array.isArray(neu) ? neu : []).filter(Boolean).map((a) => [a.id, a]));
  const aus = [];
  for (const a of neueNachId.values()) {
    const vorher = alteNachId.get(a.id);
    if (eigenerEintrag(a, ich)) {
      const status = ANTRAGSTATUS_SELBST.includes(a.status) ? a.status
        : (vorher ? vorher.status : "offen");
      aus.push(vorher
        ? { ...a, status, freigaben: vorher.freigaben, entschieden: vorher.entschieden,
            durch: vorher.durch, antwort: vorher.antwort }
        : { ...a, status, freigaben: undefined, entschieden: undefined, durch: undefined, antwort: undefined });
    } else if (vorher) {
      const alteI = (vorher.interessenten || []).filter((x) => String(x) !== String(ich));
      const meineI = (a.interessenten || []).filter((x) => String(x) === String(ich));
      aus.push({ ...vorher, interessenten: [...alteI, ...meineI] });
    }
  }
  for (const v of alteNachId.values())
    if (!neueNachId.has(v.id) && !eigenerEintrag(v, ich)) aus.push(v);
  return aus;
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ohne = (o, felder) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !felder.includes(k)));
const ANTRAG_KERN = ["personId", "typ", "art", "von", "bis", "dienstId", "partnerId"];
const ANTRAG_STATUS = ["offen", "genehmigt", "abgelehnt", "zurueckgezogen"];
/** Der alte Zweig `anfragen` aus einheitZusammen, wörtlich; ctx liefert dieselben Hilfen wie dort. */
function altSchichtAnfragen(a, n, { eigen, imBereich, fremdText, ichId, meinName, jetztText }) {
  const nein = (grund) => ({ ok: false, grund });
  const TEXT_MAX = 500;
  const altL = (Array.isArray(a) ? a : []).filter(Boolean);
  if (n !== undefined && !Array.isArray(n)) return nein("anfragen: ungültige Form.");
  const neuL = (Array.isArray(n) ? n : []).filter(Boolean);
  const altNachId = new Map(altL.map((x) => [String(x.id), x]));
  const gesehen = new Set();
  const ergebnis = [];
  for (const x of neuL) {
    if (!kennungGueltig(x.id)) return nein("anfragen: Eintrag ohne Kennung.");
    const id = String(x.id);
    if (gesehen.has(id)) return nein("anfragen: doppelte Kennung.");
    gesehen.add(id);
    const vorher = altNachId.get(id);
    if (!vorher) {
      if (!eigen(x.personId) && !imBereich(x.personId, x.von)) return nein(fremdText(x.personId, x.von));
      if ((x.status || "offen") !== "offen")
        return nein("Ein neuer Antrag ist offen — entschieden wird er danach.");
      ergebnis.push({ ...x, status: "offen", freigaben: undefined, entschieden: undefined, durch: undefined });
      continue;
    }
    if (gleich(vorher, x)) { ergebnis.push(vorher); continue; }
    for (const f of ANTRAG_KERN)
      if (!gleich(vorher[f], x[f]) && !(eigen(vorher.personId) && f !== "personId" && f !== "typ"))
        return nein("Ein bestehender Antrag lässt sich nicht auf eine andere Person, Art oder Zeit umschreiben.");
    if (eigen(vorher.personId)) {
      if (!ANTRAGSTATUS_SELBST.includes(x.status) && x.status !== vorher.status)
        return nein("Den eigenen Antrag entscheidet die Leitung oder eine andere zuständige Person.");
      ergebnis.push({ ...x, status: ANTRAGSTATUS_SELBST.includes(x.status) ? x.status : vorher.status,
        freigaben: vorher.freigaben, entschieden: vorher.entschieden, durch: vorher.durch, antwort: vorher.antwort });
      continue;
    }
    const ohneMich = (l) => (l || []).filter((y) => String(y) !== ichId).map(String);
    const nurInteresse = gleich(ohne(vorher, ["interessenten"]), ohne(x, ["interessenten"]))
      && gleich(ohneMich(vorher.interessenten), ohneMich(x.interessenten));
    if (nurInteresse) { ergebnis.push(x); continue; }
    if (!imBereich(vorher.personId, vorher.von))
      return nein(`${fremdText(vorher.personId, vorher.von)} Der Antrag ist Sache der Leitung.`);
    if (!ANTRAG_STATUS.includes(x.status)) return nein("anfragen: unbekannter Status.");
    const fV = Array.isArray(vorher.freigaben) ? vorher.freigaben : [];
    const fN = Array.isArray(x.freigaben) ? x.freigaben : [];
    if (!gleich(fN.slice(0, fV.length), fV) || fN.length > fV.length + 1)
      return nein("Bestehende Freigaben eines Antrags sind nicht änderbar.");
    const freigaben = fN.length > fV.length ? [...fV, { von: meinName, zeit: jetztText() }] : fV;
    const entschieden = x.status !== vorher.status && x.status !== "offen";
    ergebnis.push({ ...vorher, status: x.status, freigaben,
      antwort: typeof x.antwort === "string" && x.antwort.length <= TEXT_MAX ? x.antwort : vorher.antwort,
      interessenten: x.interessenten ?? vorher.interessenten,
      entschieden: entschieden ? jetztText() : vorher.entschieden,
      durch: entschieden ? meinName : vorher.durch });
  }
  for (const v of altL) {
    if (gesehen.has(String(v.id))) continue;
    if (!eigen(v.personId)) return nein("Fremde Anträge lassen sich nicht löschen.");
  }
  return { ok: true, anfragen: ergebnis };
}

/** Fester Startwert (mulberry32) — wiederholbar. */
function zufall(start) {
  let a = start >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PERSONEN = ["s1", "a1", "a2", "b1", "b2"];
const TAGE = ["2026-11-20", "2026-11-23", "2026-12-01", "2027-01-04"];
function zufallsAntrag(z, id) {
  const w = (l) => l[Math.floor(z() * l.length)];
  const a = { id, personId: w(PERSONEN), typ: w(["abwesenheit", "tausch", "einsatz"]), art: w(["urlaub", "sonder", undefined]),
    von: w(TAGE), bis: w(TAGE), status: w(["offen", "offen", "genehmigt", "abgelehnt", "zurueckgezogen"]), text: `t${Math.floor(z() * 5)}` };
  if (z() < 0.3) a.partnerId = w(PERSONEN);
  if (z() < 0.5) a.interessenten = PERSONEN.filter(() => z() < 0.3);
  if (z() < 0.4) { a.antwort = `ANTWORT-${id}`; a.entschieden = "1.11.2026"; a.durch = "Leitung"; }
  if (z() < 0.2) a.freigaben = [{ von: "X", zeit: "1.11.2026" }];
  return a;
}
/** Eine zufällige Änderung an einer Kopie — legitime wie unzulässige, auch fremde Kennungen mit eigener Person. */
function veraendern(z, liste, ich, idsFremd) {
  const w = (l) => l[Math.floor(z() * l.length)];
  const l = JSON.parse(JSON.stringify(liste));
  const art = Math.floor(z() * 9);
  const i = Math.floor(z() * l.length);
  if (art === 0 && l.length) l.splice(i, 1);
  else if (art === 1) l.push(zufallsAntrag(z, `neu${Math.floor(z() * 1000)}`));
  else if (art === 2) l.push({ ...zufallsAntrag(z, `neu${Math.floor(z() * 1000)}`), personId: ich, status: "offen" });
  else if (art === 3 && idsFremd.length) l.push({ ...zufallsAntrag(z, w(idsFremd)), personId: ich });       // Kapern-Versuch
  else if (art === 4 && l.length) l[i] = { ...l[i], status: w(ANTRAG_STATUS), antwort: "geändert" };
  else if (art === 5 && l.length) l[i] = { ...l[i], interessenten: [...(l[i].interessenten || []), ich] };
  else if (art === 6 && l.length) l[i] = { ...l[i], interessenten: (l[i].interessenten || []).filter((x) => x !== ich) };
  else if (art === 7 && l.length) l[i] = { ...l[i], personId: ich };
  else if (art === 8 && l.length) l[i] = { ...l[i], text: "anders", freigaben: [...(l[i].freigaben || []), { von: "?", zeit: "?" }] };
  return l;
}

describe("Differenztest alt/neu: Beschäftigte (eigenesZusammen)", () => {
  it("2000 Zufallsbestände: gleich, außer bei fremder Kennung mit eigener Person — dort bleibt der fremde Eintrag byte-gleich", () => {
    const z = zufall(20261118);
    let abweichend = 0, kapernFaelle = 0;
    for (let lauf = 0; lauf < 2000; lauf++) {
      const ich = PERSONEN[1 + Math.floor(z() * 4)];
      const alt = Array.from({ length: 1 + Math.floor(z() * 6) }, (_, k) => zufallsAntrag(z, `an${k}`));
      if (z() < 0.15 && alt.length > 1) alt[1] = { ...alt[1], id: alt[0].id };           // Altbestand mit doppelter Kennung
      const idsFremd = alt.filter((a) => !eigenerEintrag(a, ich)).map((a) => a.id);
      let neu = alt.map((a) => ({ ...a }));
      for (let k = 0; k < 1 + Math.floor(z() * 3); k++) neu = veraendern(z, neu, ich, idsFremd);
      const wAlt = alt.map((a, k) => ({ id: `w${k % 3}`, personId: a.personId, datum: a.von, art: "frei" }));
      const wNeu = veraendern(z, wAlt, ich, wAlt.filter((x) => !eigenerEintrag(x, ich)).map((x) => x.id))
        .map((x) => ({ id: x.id, personId: x.personId, datum: x.von || x.datum, art: "frei" }));
      const gespeichert = { anfragen: alt, wuensche: wAlt, einspruenge: wAlt, urlaubsrunde: { frist: "x", wuensche: wAlt } };
      const geschickt = { anfragen: neu, wuensche: wNeu, einspruenge: wNeu, urlaubsrunde: { frist: "x", wuensche: wNeu } };
      const n = eigenesZusammen(gespeichert, geschickt, ich);
      const a = { anfragen: altAnfragenZusammen(alt, neu, ich), wuensche: altEigeneEintraege(wAlt, wNeu, ich) };

      /* Kapern-Fälle: ein „eigener" Eintrag unter einer gespeicherten fremden Kennung, ohne eigenen gleicher Kennung. */
      const kapern = (gesp, gesch) => gesch.filter((x) => x && eigenerEintrag(x, ich)
        && gesp.some((g) => g && g.id === x.id && !eigenerEintrag(g, ich)) && !gesp.some((g) => g && g.id === x.id && eigenerEintrag(g, ich)));
      /* Anträge: es zählt je Kennung der letzte übermittelte Eintrag (wie die Map in anfragenZusammen). */
      const letzte = [...new Map(neu.map((x) => [x.id, x])).values()];
      const kA = kapern(alt, letzte), kW = kapern(wAlt, wNeu);
      if (kA.length + kW.length) kapernFaelle++;
      if (!kA.length) expect(gleich(n.anfragen, a.anfragen), `Lauf ${lauf}`).toBe(true);
      else {
        /* genau wie alt, wenn diese Kennungen gar nicht übermittelt wären (auch die Reihenfolge); der fremde Antrag byte-gleich */
        const kIds = new Set(kA.map((x) => x.id));
        expect(gleich(n.anfragen, altAnfragenZusammen(alt, neu.filter((x) => !kIds.has(x.id)), ich)), `Lauf ${lauf}`).toBe(true);
        for (const id of kIds) {
          const fremd = alt.filter((g) => g.id === id);
          expect(n.anfragen.filter((g) => g.id === id), `Lauf ${lauf}`).toEqual([fremd[fremd.length - 1]]);
        }
        abweichend++;
      }
      if (!kW.length) {
        expect(gleich(n.wuensche, a.wuensche), `Lauf ${lauf}`).toBe(true);
        expect(gleich(n.einspruenge, a.wuensche)).toBe(true);
        expect(gleich(n.urlaubsrunde.wuensche, a.wuensche)).toBe(true);
      } else {
        expect(gleich(n.wuensche, altEigeneEintraege(wAlt, wNeu.filter((x) => !kW.includes(x)), ich)), `Lauf ${lauf}`).toBe(true);
        expect(gleich(n.urlaubsrunde.wuensche, n.wuensche)).toBe(true);
      }
    }
    /* Die Zufallsbestände treffen beide Arten wirklich. */
    expect(kapernFaelle).toBeGreaterThan(100);
    expect(abweichend).toBeGreaterThan(50);
  });
});

describe("Differenztest alt/neu: Schichtverantwortung (einheitZusammen, anfragen)", () => {
  const person2 = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }, ...(id === "a2" ? [{ ab: "2026-12-01", einheitId: "eB" }] : [])] });
  const betrieb = (anfragen) => ({ id: "m1", einheiten: [{ id: "eA" }, { id: "eB" }],
    personen: [person2("s1", "subplaner", "eA"), person2("a1", "mitarbeiter", "eA"), person2("a2", "mitarbeiter", "eA"),
      person2("b1", "mitarbeiter", "eB"), person2("b2", "mitarbeiter", "eB")], anfragen });
  const sitzung = { rolle: "subplaner", person: "s1", betrieb: 0 };
  const hilfen = (altM) => {
    const personen = new Map(altM.personen.map((p) => [String(p.id), p]));
    const ich = personen.get("s1");
    const eigene = eigeneEinheit(altM, ich);
    const imBereich = (pid, tag) => { const p = personen.get(String(pid)); return !!p && einheitAm(p, tag) === eigene; };
    const ohneEinheit = (pid, tag) => { const p = personen.get(String(pid)); return !!p && typeof tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tag) && einheitAm(p, tag) === null; };
    const fremdText = (pid, tag) => (ohneEinheit(pid, tag) ? "Person ist an diesem Tag keiner Einheit zugeordnet – Zugehörigkeit prüfen."
      : `${(personen.get(String(pid)) || {}).nachname || "Diese Person"} gehört nicht zu deinem Bereich.`);
    return { eigen: (pid) => String(pid) === "s1", imBereich, fremdText, ichId: "s1", meinName: "Vs1 Ns1",
      jetztText: () => new Date().toLocaleString("de-DE") };
  };
  const verborgen = (h, v) => !h.eigen(v.personId) && !h.imBereich(v.personId, v.von)
    && !(v.typ === "tausch" && v.status === "offen" && !v.partnerId);
  const urteil = (e) => (e.ok ? { ok: true, anfragen: e.mandant ? e.mandant.anfragen : e.anfragen } : { ok: false, grund: e.grund });

  it("3000 Zufallsbestände: gleich, außer bei geänderten verborgenen Anträgen — dort Antwort wie unbekannte Kennung, Antrag byte-gleich", () => {
    const z = zufall(4711);
    let verborgenFaelle = 0, gleichFaelle = 0, mehrfach = 0;
    for (let lauf = 0; lauf < 3000; lauf++) {
      const alt = Array.from({ length: 1 + Math.floor(z() * 6) }, (_, k) => zufallsAntrag(z, `an${k}`));
      const altM = betrieb(alt);
      const h = hilfen(altM);
      let neu = alt.map((a) => ({ ...a }));
      for (let k = 0; k < 1 + Math.floor(z() * 2); k++) neu = veraendern(z, neu, "s1", alt.filter((a) => !h.eigen(a.personId)).map((a) => a.id));
      const neuM = { ...altM, anfragen: neu };
      const n = urteil(einheitZusammen(altM, neuM, sitzung));
      const altNach = new Map(alt.map((x) => [String(x.id), x]));
      const betroffen = neu.filter((x) => { const v = altNach.get(String(x.id)); return v && !gleich(v, x) && verborgen(h, v); });
      if (!betroffen.length) {
        expect(n, `Lauf ${lauf}`).toEqual(urteil(altSchichtAnfragen(alt, neu, h)));
        gleichFaelle++;
        continue;
      }
      /* Dieselbe verborgene Kennung mehrfach übermittelt (auch unverändert): kein Orakelfall — wer den Inhalt
         mitschickt, kennt den Antrag schon. */
      const bIds = new Set(betroffen.map((x) => String(x.id)));
      if (neu.filter((x) => bIds.has(String(x.id))).length !== betroffen.length) { mehrfach++; continue; }
      verborgenFaelle++;
      /* Orakelfreiheit: dieselbe Antwort, wenn die verborgenen Kennungen gar nicht existierten.
         Die gespeicherten verborgenen Anträge füllt im echten Weg die Rückfüllung wieder ein (schichtRueckfuellen). */
      const umbenannt = [...neu.map((x) => (betroffen.includes(x) ? { ...x, id: `${x.id}-unbekannt` } : x)),
        ...[...bIds].map((id) => altNach.get(id))];
      const v = urteil(einheitZusammen(altM, { ...altM, anfragen: umbenannt }, sitzung));
      expect({ ok: n.ok, grund: n.grund }, `Lauf ${lauf}`).toEqual({ ok: v.ok, grund: v.grund });
      /* Integrität: ein verborgener Antrag bleibt byte-gleich, keine Rechte gelockert. */
      if (n.ok) for (const x of betroffen) expect(n.anfragen.filter((y) => String(y.id) === String(x.id)), `Lauf ${lauf}`).toEqual([altNach.get(String(x.id))]);
    }
    expect(verborgenFaelle).toBeGreaterThan(200);
    expect(mehrfach).toBeLessThan(verborgenFaelle);
    expect(gleichFaelle).toBeGreaterThan(1000);
  });
});
