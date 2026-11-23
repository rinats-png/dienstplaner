/* ==========================================================================
   WP-19.5 NACHTRAG — TIEFENDECKEL AN ALLEN ÜBRIGEN RUMPFLESERN (Review #505, Auflage A1)

   #505 hat den Tiefendeckel nur in rumpfLesen (daten.mjs) eingebaut. Die übrigen Leser parsten ohne Deckel.
   Gemessen (lokaler server.mjs, Wegwerfdaten, docs/acc45/TIEFENDECKEL-RUMPFLESER.md): 500 statt 400 bei
   /api/import/analyse (JSON.stringify in eingabeHash), /api/account/anmelden (ohne Anmeldung) und /starten.
   Jetzt prüft jeder Leser die Tiefe direkt nach dem Parsen (zuTief, rumpftiefe.mjs) und antwortet einheitlich
   mit 400 und zuTiefRumpf(). Alles über die echten Handler; Reihenfolge der Sitzungsprüfungen unverändert.

   Tiefe 5000 als Liste (2 Byte je Ebene), damit der Rumpf unter der Größengrenze des Lesers bleibt
   (anmeldung/registrierung 16 KB). Leser mit 4 KB Grenze (einladung, hilfe): 2000 Ebenen, mehr passt nicht hinein.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mappe } from "./import-parser-hilfen.mjs";
import { RUMPF_TIEFE_MAX, zuTiefRumpf } from "../server/lib/rumpftiefe.mjs";

const WIRT = "127.0.0.1:3000";
const RAUM = "tiefeleserraum";
const ADMIN = "verwaltung-nur-zum-pruefen-tiefe";
const TIEF_TEXT = "Der Rumpf ist zu tief verschachtelt.";
let wurzel, H, LT, MA, vorgang;
let nr = 0;

const tiefListe = (n) => "[".repeat(n) + "]".repeat(n);
/** Rumpf als Text; `"__TIEF__"` wird durch n verschachtelte Listen ersetzt. */
const roh = (wert, n) => JSON.stringify(wert).replace('"__TIEF__"', tiefListe(n));
const kopf = (token, typ = "application/json") => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "content-type": typ, "x-forwarded-for": `10.62.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}) };
};
async function senden(handler, weg, text, token) {
  const a = await H[handler](new Request(`http://${WIRT}${weg}`, { method: "POST", headers: kopf(token), body: text }), {});
  const t = await a.text();
  let d = {}; try { d = JSON.parse(t); } catch { /* leer */ }
  return { status: a.status, roh: t.slice(0, 300), ...d };
}

const person = (id, rolle, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...mehr });

/* Je Leser ein Weg, der den Rumpf wirklich liest (Schalter an, Sitzung passend). `t`: Tiefe des Angriffs. */
const FAELLE = () => [
  { leser: "import.mjs jsonLesen", h: "imp", weg: "/api/import/analyse", wert: { vorgang, zuordnung: "__TIEF__" }, token: LT, t: 5000 },
  { leser: "import.mjs jsonLesen", h: "imp", weg: "/api/import/vorschau", wert: { vorgang, zuordnung: "__TIEF__" }, token: LT, t: 5000 },
  { leser: "kalender.mjs rumpfLesen", h: "kal", weg: "/kalender/daten", wert: { geheim: "g", termine: ["__TIEF__"] }, token: MA, t: 5000 },
  { leser: "kalender.mjs rumpfLesen", h: "kal", weg: "/kalender/loeschen", wert: { geheim: "__TIEF__" }, token: MA, t: 5000 },
  { leser: "einladung.mjs rumpfLesen", h: "ein", weg: "/api/einladung", wert: { personId: "__TIEF__", rolle: "mitarbeiter" }, token: LT, t: 2000 },
  { leser: "einladung.mjs rumpfLesen", h: "ein", weg: "/api/einladung/annehmen", wert: { einladung: "__TIEF__" }, token: null, t: 2000 },
  { leser: "anmeldung.mjs rumpfLesen", h: "anm", weg: "/api/account/anmelden", wert: { email: "__TIEF__", passwort: "x" }, token: null, t: 5000 },
  { leser: "anmeldung.mjs rumpfLesen", h: "anm", weg: "/api/account/betrieb", wert: { raum: "__TIEF__" }, token: null, t: 5000 },
  { leser: "registrierung.mjs rumpfLesen", h: "reg", weg: "/api/registrierung", wert: { email: "a@example.invalid", vorname: "__TIEF__", nachname: "N", betriebsname: "Testbetrieb" }, token: null, t: 5000 },
  { leser: "registrierung.mjs rumpfLesen", h: "reg", weg: "/api/registrierung/verifizieren", wert: { token: "__TIEF__" }, token: null, t: 5000 },
  { leser: "zustellung.mjs senden", h: "zus", weg: "/zustellung/senden", wert: { nachrichten: "__TIEF__" }, token: LT, t: 5000 },
  { leser: "zustellung.mjs anmelden", h: "zus", weg: "/zustellung/anmelden", wert: { anmeldung: "__TIEF__" }, token: MA, t: 5000 },
  { leser: "zustellung.mjs abmelden", h: "zus", weg: "/zustellung/abmelden", wert: { geraet: "__TIEF__" }, token: MA, t: 5000 },
  { leser: "zustellung.mjs mailbestaetigung", h: "zus", weg: "/zustellung/mailbestaetigung/bestaetigen", wert: { code: "__TIEF__" }, token: MA, t: 5000 },
  { leser: "hilfe.mjs frage", h: "hil", weg: "/api/hilfe/frage", wert: { frage: "__TIEF__" }, token: MA, t: 2000 },
  { leser: "einrichten.mjs", h: "eri", weg: "/einrichten", wert: { verwaltung: ADMIN, name: "Z", bestand: RAUM, rolle: "mitarbeiter", hinweis: "__TIEF__" }, token: null, t: 5000 },
  { leser: "starten.mjs", h: "sta", weg: "/starten", wert: { name: "__TIEF__", branche: "pflege" }, token: null, t: 5000 },
];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-tiefeleser-"));
  Object.assign(process.env, { CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "pfeffer-nur-zum-pruefen-0123456789",
    CENTRIC_ADMIN: ADMIN, CENTRIC_IMPORT_AKTIV: "true", CENTRIC_SELBSTSTART: "true", CENTRIC_PUBLIC_REGISTRATION: "true",
    CENTRIC_HILFE_ASSISTENT: "suche", CENTRIC_MAILBESTAETIGUNG: "angebot" });
  const { getStore } = await import("../server/lib/ablage.mjs");
  const laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const B = await import("../server/lib/bestand.mjs");
  const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB1" }], standorte: [], dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l1", "leitung"), person("a1", "mitarbeiter", { personalnummer: "1001", email: "a1@example.invalid" })],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [] }] }, { durch: "Prüfung" });
  LT = (await sitzungAnlegen({ bestand: RAUM, name: "L", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" }, 3600e3)).token;
  MA = (await sitzungAnlegen({ bestand: RAUM, name: "M", rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" }, 3600e3)).token;
  H = {
    imp: (await import("../server/funktionen/import.mjs")).default,
    kal: (await import("../server/funktionen/kalender.mjs")).default,
    ein: (await import("../server/funktionen/einladung.mjs")).default,
    anm: (await import("../server/funktionen/anmeldung.mjs")).default,
    reg: (await import("../server/funktionen/registrierung.mjs")).default,
    zus: (await import("../server/funktionen/zustellung.mjs")).default,
    hil: (await import("../server/funktionen/hilfe.mjs")).default,
    eri: (await import("../server/funktionen/einrichten.mjs")).default,
    sta: (await import("../server/funktionen/starten.mjs")).default,
  };
  /* Ein Importvorgang (Schichtmodelle) mit erfolgreicher Analyse: so läuft die Vorschau bis zu eingabeHash. */
  const datei = mappe({ Modelle: [["Modell", "Tag", "Dienst"], ["Zweier", 1, "F"], ["Zweier", 2, "-"]],
    Zuordnungen: [["Personalnummer", "Modell", "Beginn", "Versatz"], ["1001", "Zweier", "2026-06-01", 0]] });
  const up = await H.imp(new Request(`http://${WIRT}/api/import/upload?art=schichtzyklus`, { method: "POST",
    headers: { ...kopf(LT, "application/octet-stream"), "x-dateiname": "m.xlsx" }, body: datei }), {});
  vorgang = (await up.json()).vorgang;
  expect(vorgang).toBeTruthy();
  const an = await senden("imp", "/api/import/analyse", JSON.stringify({ vorgang }), LT);
  expect(an.status, an.roh).toBe(200);
}, 120000);
afterAll(async () => {
  for (const k of ["CENTRIC_IMPORT_AKTIV", "CENTRIC_SELBSTSTART", "CENTRIC_PUBLIC_REGISTRATION", "CENTRIC_HILFE_ASSISTENT", "CENTRIC_MAILBESTAETIGUNG", "CENTRIC_ADMIN"])
    delete process.env[k];
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* H1 (Review #505): zuTief ohne Zwischenlisten. Bezug ist die Fassung aus #505, hier wörtlich. */
function zuTiefAlt(wert, grenze = RUMPF_TIEFE_MAX) {
  if (!wert || typeof wert !== "object") return false;
  const stapel = [[wert, 1]];
  while (stapel.length) {
    const [x, t] = stapel.pop();
    if (t > grenze) return true;
    const kinder = Array.isArray(x) ? x : Object.values(x);
    for (const k of kinder) if (k && typeof k === "object") stapel.push([k, t + 1]);
  }
  return false;
}
/** Zufälliger JSON-Wert (deterministisch über einen einfachen LCG). */
function zufallsWert(zufall, tiefe) {
  const r = zufall();
  if (tiefe <= 0 || r < 0.25) return [null, 1, "x", true, 0, ""][Math.floor(zufall() * 6)];
  const n = Math.floor(zufall() * 4);
  if (r < 0.6) return Array.from({ length: n }, () => zufallsWert(zufall, tiefe - 1));
  const o = {};
  for (let i = 0; i < n; i++) o[["a", "b", "__proto__", "constructor", "1"][Math.floor(zufall() * 5)] + i] = zufallsWert(zufall, tiefe - 1);
  return o;
}

describe("H1: schnellere Messung, gleiches Ergebnis wie die Fassung aus #505", () => {
  it("3000 zufällige JSON-Werte je Grenze 1..12 und 64: identisch; auch mit eigenem Schlüssel __proto__ aus JSON.parse", async () => {
    const { zuTief } = await import("../server/lib/rumpftiefe.mjs");
    let s = 12345;
    const zufall = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let i = 0; i < 3000; i++) {
      const v = JSON.parse(JSON.stringify(zufallsWert(zufall, 14)));
      for (const g of [1, 2, 3, 4, 6, 8, 12, 64]) expect(zuTief(v, g), `${i}/${g}`).toBe(zuTiefAlt(v, g));
    }
    const proto = JSON.parse('{"__proto__":{"a":{"b":{}}}}');
    for (const g of [1, 2, 3, 4]) expect(zuTief(proto, g)).toBe(zuTiefAlt(proto, g));
    expect(zuTief(proto, 3)).toBe(true);
  });
});

describe("Einheitlicher Antwortrumpf", () => {
  it("zuTiefRumpf: deutscher Text und die Grenze 64", () => {
    expect(zuTiefRumpf()).toEqual({ fehler: TIEF_TEXT, text: `Höchstens ${RUMPF_TIEFE_MAX} Ebenen sind vorgesehen.` });
    expect(RUMPF_TIEFE_MAX).toBe(64);
  });
});

describe("Jeder Rumpfleser: zu tiefer Rumpf → 400 (nie 500), Grenze 64/65", { timeout: 120000 }, () => {
  it.each(FAELLE().map((f, i) => [`${f.leser} · ${f.weg}`, i]))("%s: tiefer Angriff → 400 mit einheitlichem Rumpf", async (_n, i) => {
    const f = FAELLE()[i];
    const a = await senden(f.h, f.weg, roh(f.wert, f.t), f.token);
    expect(a.status, a.roh).toBe(400);
    expect(a.fehler, a.roh).toBe(TIEF_TEXT);
    expect(a.text).toBe(`Höchstens ${RUMPF_TIEFE_MAX} Ebenen sind vorgesehen.`);
  });

  it.each(FAELLE().map((f, i) => [`${f.leser} · ${f.weg}`, i]))("%s: 64 Ebenen gesamt → keine Tiefenabweisung; 65 → 400", async (_n, i) => {
    const f = FAELLE()[i];
    /* Feld `polster` auf oberster Ebene: Rumpf mit 1 + 63 = 64 Ebenen bzw. 1 + 64 = 65. Kein Leser liest `polster`. */
    const ohne = { ...f.wert }; for (const k of Object.keys(ohne)) if (ohne[k] === "__TIEF__" || (Array.isArray(ohne[k]) && ohne[k][0] === "__TIEF__")) ohne[k] = "x";
    const a64 = await senden(f.h, f.weg, roh({ polster: "__TIEF__", ...ohne }, 63), f.token);
    expect(a64.fehler, a64.roh).not.toBe(TIEF_TEXT);
    expect(a64.status, a64.roh).not.toBe(500);
    const a65 = await senden(f.h, f.weg, roh({ polster: "__TIEF__", ...ohne }, 64), f.token);
    expect(a65.status, a65.roh).toBe(400);
    expect(a65.fehler, a65.roh).toBe(TIEF_TEXT);
  });
});

describe("Realistische Rümpfe wie bisher", { timeout: 120000 }, () => {
  it("Import: Analyse und Vorschau mit echter Spaltenzuordnung → 200", async () => {
    const an = await senden("imp", "/api/import/analyse", JSON.stringify({ vorgang }), LT);
    expect(an.status, an.roh).toBe(200);
    const vs = await senden("imp", "/api/import/vorschau", JSON.stringify({ vorgang }), LT);
    expect(vs.status, vs.roh).toBe(200);
  });
  it("Selbststart mit gültigem Rumpf → 200 (Zugänge entstehen)", async () => {
    const a = await senden("sta", "/starten", JSON.stringify({ name: "Testbetrieb Tiefe", branche: "pflege", rollen: ["mitarbeiter"] }), null);
    expect(a.status, a.roh).toBe(200);
    expect(Array.isArray(a.zugaenge)).toBe(true);
  });
  it("Kontoanmeldung mit unbekannter Adresse → die übliche Absage, kein 400 der Tiefe", async () => {
    const a = await senden("anm", "/api/account/anmelden", JSON.stringify({ email: "niemand@example.invalid", passwort: "falsch-falsch" }), null);
    expect(a.fehler).not.toBe(TIEF_TEXT);
    expect(a.status).not.toBe(500);
  });
  it("Zustellung: abmelden ohne Rumpf → 200 wie bisher", async () => {
    const a = await H.zus(new Request(`http://${WIRT}/zustellung/abmelden`, { method: "POST", headers: kopf(MA) }), {});
    expect(a.status).toBe(200);
  });
});
