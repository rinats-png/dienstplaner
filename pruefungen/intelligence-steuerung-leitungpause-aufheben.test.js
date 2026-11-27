/* ==========================================================================
   WP-I16 (Fehlerbehebung, Review #595) — Leitung-Pause AUFHEBEN über die Oberfläche, Ende zu Ende

   Kette: Knopf in src/ansichten/ki-steuerung.jsx → src/lib/ki-steuerung-aktionen.js (echte Aktion) → PUT /api/bestand
   (echter Handler, echte Ablage). Nur der Browser-Speicher (src/speicher.js) ist ersetzt: schreib/lies gehen als echte Anfragen
   an den Handler. Geprüft:
   - die Aktion übernimmt `leitungPause` (vorher fiel sie weg: Server sah die aktive Pause unverändert, Oberfläche meldete „geändert“)
   - „geändert“ erscheint nur, wenn der zurückgelesene Serverstand die Änderung zeigt; sonst sichtbarer Hinweis, Stand des Servers
   - ohne Recht (Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Demo) bleibt es wirkungslos
   - Betriebsrat-Pause bleibt getrennt; Leitung-Pause löst keine Betriebsrat-Konten-Sperre aus
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SPM = vi.hoisted(() => ({ schreib: null, lies: null }));
vi.mock("../src/speicher.js", () => ({ schreib: (...a) => SPM.schreib(...a), lies: (...a) => SPM.lies(...a) }));

import { KiSteuerung, KI_STEUERUNG_TEXTE } from "../src/ansichten/ki-steuerung.jsx";
import { kiSteuerungAktionen, kiSteuerungBestaetigt } from "../src/lib/ki-steuerung-aktionen.js";
import { kiSteuerungLesen, kiSteuerungAnwenden } from "../server/lib/ki-steuerung.mjs";

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16aufheben";
const SCHALTER = "CENTRIC_KI_BR_PAUSE";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const T = {};

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.17.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const ki = (m) => (m.einstellungen || {}).kiSteuerung;
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = [["l1", "leitung"], ["p1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["r1", "betriebsrat"]];

/** Die Oberfläche einer Rolle: gelesene Sicht als lokaler Stand (ref), echte Aktionen, die Meldungen werden gesammelt. */
async function oberflaeche(id) {
  const r = await anfrage("/api/bestand", { methode: "GET", token: T[id] });
  expect(r.status, `${id} lesen`).toBe(200);
  const ref = { current: { ...JSON.parse(JSON.stringify(r.bestand)), session: { mandantId: "m-a" } } };
  const o = { ref, etag: r.etag, meldungen: [], rolle: ROLLEN.find((x) => x[0] === id)[1], id, token: T[id] };
  o.akt = kiSteuerungAktionen({ ref, melde: (t) => o.meldungen.push(t), upd: (fn) => { ref.current = fn(ref.current); } });
  o.lokal = () => ki(ref.current.mandanten[0]);
  return o;
}
/** Der Browser-Speicher: PUT mit dem ETag der Sicht (wie speicher.js), Lesen als echte GET-Anfrage. */
let aktuell = null;
SPM.schreib = (bestand, opt) => (async () => {
  const { session: _s, ...rest } = bestand;
  const e = await anfrage("/api/bestand", { methode: "PUT", token: aktuell.token, rumpf: { bestand: rest, etag: aktuell.etag, durch: opt.durch } });
  if (e.status === 200) opt.onGespeichert(bestand); else if (e.status === 409) opt.onKonflikt(e); else opt.onFehler({ status: e.status });
})();
SPM.lies = async () => anfrage("/api/bestand", { methode: "GET", token: aktuell.token });
/** Absicht auslösen und warten, bis die Aktion eine Meldung ausgibt. */
async function ausloesen(o, absicht) {
  aktuell = o;
  const vorher = o.meldungen.length;
  o.akt.setzeKiSteuerung(absicht);
  await vi.waitFor(() => expect(o.meldungen.length).toBeGreaterThan(vorher), { timeout: 20000 });
  return o.meldungen[o.meldungen.length - 1];
}
/** Der Knopf „Pause aufheben“ der echten Oberfläche; liefert die Absicht, die er auslöst. */
function knopfAbsicht(o) {
  const m = o.ref.current.mandanten[0];
  const sitz = { rolle: o.rolle, person: { id: o.id, rolle: o.rolle, vorname: "V", nachname: "N" }, mandant: { id: m.id, einstellungen: m.einstellungen, personen: [] } };
  const aufrufe = [];
  const baum = KiSteuerung({ sitz, akt: { setzeKiSteuerung: (a) => aufrufe.push(a), setzeKiPause: () => {} }, prozess: "an" });
  const finde = (n) => {
    if (!n || typeof n !== "object") return null;
    if (Array.isArray(n)) { for (const x of n) { const r = finde(x); if (r) return r; } return null; }
    if (n.props && n.props.children === KI_STEUERUNG_TEXTE.pauseAufheben && typeof n.props.onClick === "function") return n;
    return n.props ? finde(n.props.children) : null;
  };
  const knopf = finde(baum);
  expect(knopf, "Knopf Pause aufheben").not.toBeNull();
  knopf.props.onClick();
  return aufrufe[0];
}
const GEAENDERT = "Intelligence-Steuerung geändert.";
const NICHT = /nicht übernommen|nicht gespeichert/;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi16auf-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env[SCHALTER] = "true";
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
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: ROLLEN.map(([id, rolle]) => person(id, rolle)),
    abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of ROLLEN) {
    c += 1;
    const code = `WPJ${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { delete process.env[SCHALTER]; await rm(wurzel, { recursive: true, force: true }); });

describe("reine Teile der Aktion", () => {
  it("kiSteuerungBestaetigt: nur wenn der Serverstand die Absicht zeigt; fehlender Stand = nein", () => {
    const st = { leitungPause: { aktiv: false }, pause: { aktiv: true }, betrieb: { an: true }, funktionen: { F3: { an: true } }, betriebsratFrage: { antwort: "nein" } };
    expect(kiSteuerungBestaetigt({ leitungPause: { aktiv: false } }, st)).toBe(true);
    expect(kiSteuerungBestaetigt({ leitungPause: { aktiv: true } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ pause: { aktiv: false } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ betrieb: { an: false } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ funktionen: { F3: { an: false } } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ funktionen: { F4: { an: true } } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ betriebsratFrage: { antwort: "ja" } }, st)).toBe(false);
    expect(kiSteuerungBestaetigt({ leitungPause: { aktiv: false } }, null)).toBe(false);
    expect(kiSteuerungBestaetigt({ leitungPause: { aktiv: false } }, {})).toBe(false);
  });
  it("Demo-Sitzung: Aufheben der Leitung-Pause und der Pause bleibt ohne Wirkung", () => {
    const stand = { kiSteuerung: { betrieb: { an: true, am: "2026-11-10T10:00:00.000Z" },
      leitungPause: { aktiv: true, nr: 1, am: "2026-11-12T08:00:00.000Z", vonRolle: "leitung" },
      pause: { aktiv: true, nr: 2, am: "2026-11-11T08:00:00.000Z", vonRolle: "betriebsrat" } } };
    const r = kiSteuerungAnwenden(kiSteuerungLesen(stand), { leitungPause: { aktiv: false, am: "2026-11-12T08:00:00.000Z", nr: 1 }, pause: { aktiv: false, am: "2026-11-11T08:00:00.000Z", nr: 2 } },
      { rolle: "leitung", demo: true, person: "l1" }, "2026-11-13T08:00:00.000Z");
    expect(r.ereignisse).toEqual([]);
    expect(r.stand.leitungPause.aktiv).toBe(true);
    expect(r.stand.pause.aktiv).toBe(true);
  });
});

describe("Ende zu Ende: Oberfläche → Aktion → PUT /api/bestand", () => {
  let LP;
  it("Leitung beantwortet „ja“: Server setzt die Leitung-Pause, Oberfläche meldet erst nach Bestätigung", async () => {
    expect(await ausloesen(await oberflaeche("l1"), { betriebsratFrage: { antwort: "nein" } })).toBe(GEAENDERT);
    expect(await ausloesen(await oberflaeche("l1"), { betrieb: { an: true } })).toBe(GEAENDERT);
    expect(await ausloesen(await oberflaeche("l1"), { betriebsratFrage: { antwort: "ja" } })).toBe(GEAENDERT);
    LP = ki(await gespeichert()).leitungPause;
    expect(LP).toMatchObject({ aktiv: true, vonRolle: "leitung", vonPerson: "l1" });
    expect(ki(await gespeichert()).pause).toBeUndefined();
  });
  it("Leitung-Pause löst keine Betriebsrat-Konten-Sperre aus: die Leitung legt ein Betriebsrat-Konto an (200)", async () => {
    const r = await anfrage("/api/bestand", { methode: "GET", token: T.l1 });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].personen.push(person("r2", "betriebsrat"));
    const e = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(e.status, e.roh).toBe(200);
    expect((await gespeichert()).personen.some((p) => p.id === "r2")).toBe(true);
  });
  it("ohne Recht wirkungslos: Planung, Schichtverantwortung, Beschäftigte, Betriebsrat heben die Leitung-Pause nicht auf; es steht „nicht übernommen/gespeichert“", async () => {
    for (const id of ["p1", "s1", "a1", "r1"]) {
      const o = await oberflaeche(id);
      const m = await ausloesen(o, { leitungPause: { aktiv: false, am: LP.am, nr: LP.nr } });
      expect(m, id).toMatch(NICHT);
      expect(m, id).not.toBe(GEAENDERT);
      expect(ki(await gespeichert()).leitungPause, id).toEqual(LP);
    }
  });
  it("Betriebsrat setzt seine Pause (getrennt von der Leitung-Pause)", async () => {
    const o = await oberflaeche("r1");
    aktuell = o;
    o.akt.setzeKiPause(true);
    await vi.waitFor(async () => expect(ki(await gespeichert()).pause).toMatchObject({ aktiv: true, vonRolle: "betriebsrat" }), { timeout: 20000 });
    expect(ki(await gespeichert()).leitungPause).toEqual(LP);
  });
  it("Leitung: Knopf „Pause aufheben“ hebt zuerst genau die Leitung-Pause auf — kommt als Änderung beim Server an, meldet erst nach Bestätigung; Betriebsrat-Pause bleibt", async () => {
    const pauseVorher = ki(await gespeichert()).pause;
    const o = await oberflaeche("l1");
    const absicht = knopfAbsicht(o);
    expect(absicht).toEqual({ leitungPause: { aktiv: false, am: LP.am, nr: LP.nr } });
    expect(await ausloesen(o, absicht)).toBe(GEAENDERT);
    const k = ki(await gespeichert());
    expect(k.leitungPause).toMatchObject({ aktiv: false, vonRolle: "leitung", vonPerson: "l1" });
    expect(k.leitungPause.nr).toBe(LP.nr + 1);
    expect(k.pause).toEqual(pauseVorher);
    expect(k.protokoll.map((x) => x.art)).toContain("leitungspause-aufgehoben");
    expect(o.lokal().leitungPause.aktiv).toBe(false);
  });
  it("falscher Stempel (veraltete Sicht): nichts ändert sich, die Oberfläche meldet „nicht übernommen“ und zeigt den Serverstand", async () => {
    const g = ki(await gespeichert());
    const o = await oberflaeche("l1");
    const m = await ausloesen(o, { pause: { aktiv: false, am: g.pause.am, nr: g.pause.nr + 5 } });
    expect(m).toMatch(NICHT);
    expect(ki(await gespeichert()).pause).toEqual(g.pause);
    expect(o.lokal().pause.aktiv).toBe(true);
  });
  it("Leitung hebt die Betriebsrat-Pause mit gesehenem Stempel auf; die Leitung-Pause bleibt aus", async () => {
    const o = await oberflaeche("l1");
    const absicht = knopfAbsicht(o);
    expect(Object.keys(absicht)).toEqual(["pause"]);
    expect(await ausloesen(o, absicht)).toBe(GEAENDERT);
    const k = ki(await gespeichert());
    expect(k.pause.aktiv).toBe(false);
    expect(k.leitungPause.aktiv).toBe(false);
  });
});
