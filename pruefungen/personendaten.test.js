/* ==========================================================================
   PERSONENDATEN — qualifikationen an der Datenmodellgrenze

   Gefunden in der Browser-Abnahme von Kette B: Eine über die Schnittstelle
   angelegte Person ohne `qualifikationen` ließ die Startseite jeder Rolle
   abstürzen („reading 'map'"). Die Gestaltprüfung sah es nicht.

   Regeln (server/lib/gestalt.mjs):
   - fehlt oder null → [] (fehlende optionale Liste)
   - anderer Typ in einer Eingabe → 422, nicht still verschluckt
   - gespeicherter Altbestand mit falschem Typ: beim Lesen nur in der
     Antwort angeglichen, beim nächsten Schreiben gespeichert — er sperrt
     keinen Schreibvorgang und wird nie ungefragt in Masse umgeschrieben.

   Aufruf: npm run pruefung:personendaten
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { personenAngleichen, personenFehler, pruefeGestalt } from "../server/lib/gestalt.mjs";

const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const mit = (...personen) => ({ version: 9, mandanten: [{ id: "m-a", name: "A", personen }] });

describe("personenAngleichen", () => {
  it("fehlend und null werden [], eine vorhandene Liste bleibt — dasselbe Objekt", () => {
    const liste = ["q1"];
    const b = mit(person("a", "mitarbeiter"), person("b", "mitarbeiter", { qualifikationen: null }), person("c", "mitarbeiter", { qualifikationen: liste }));
    const n = personenAngleichen(b);
    expect(n.mandanten[0].personen.map((p) => p.qualifikationen)).toEqual([[], [], ["q1"]]);
    expect(n.mandanten[0].personen[2]).toBe(b.mandanten[0].personen[2]);
    expect(n.mandanten[0].personen[2].qualifikationen).toBe(liste);
  });
  it("verändert die Eingabe nicht und lässt alle anderen Felder gleich", () => {
    const b = mit(person("a", "mitarbeiter", { email: "a@x.de", notiz: "n" }));
    const vorher = JSON.stringify(b);
    const n = personenAngleichen(b);
    expect(JSON.stringify(b)).toBe(vorher);
    const { qualifikationen, ...rest } = n.mandanten[0].personen[0];
    expect(qualifikationen).toEqual([]);
    expect(rest).toEqual(b.mandanten[0].personen[0]);
  });
  it("ohne Bedarf: dasselbe Objekt; idempotent; Unförmiges bleibt unberührt", () => {
    const gut = mit(person("a", "mitarbeiter", { qualifikationen: [] }));
    expect(personenAngleichen(gut)).toBe(gut);
    const einmal = personenAngleichen(mit(person("a", "mitarbeiter")));
    expect(personenAngleichen(einmal)).toBe(einmal);
    for (const x of [null, undefined, 5, "x", {}, { mandanten: null }, { mandanten: [null, { personen: "x" }] }])
      expect(personenAngleichen(x)).toBe(x);
    const mitLuecke = mit(null, 7, person("a", "mitarbeiter"));
    expect(personenAngleichen(mitLuecke).mandanten[0].personen.slice(0, 2)).toEqual([null, 7]);
  });
  it("ein falscher Typ im Altbestand wird [] (Lesen/Zusammenführen)", () => {
    for (const falsch of ["q1", 3, { q1: true }, true])
      expect(personenAngleichen(mit(person("a", "mitarbeiter", { qualifikationen: falsch }))).mandanten[0].personen[0].qualifikationen).toEqual([]);
  });
});

describe("personenFehler", () => {
  it("fehlend, null und Listen sind in Ordnung", () => {
    expect(personenFehler(mit(person("a", "x"), person("b", "x", { qualifikationen: null }), person("c", "x", { qualifikationen: ["q"] })))).toBeNull();
    for (const x of [null, {}, { mandanten: [{ personen: null }] }]) expect(personenFehler(x)).toBeNull();
  });
  it("jeder andere Typ ist ein Fehler — mit Feld und Person", () => {
    for (const falsch of ["q1", 3, { q1: true }, true]) {
      const f = personenFehler(mit(person("ok", "x", { qualifikationen: [] }), person("p7", "x", { qualifikationen: falsch })));
      expect(f).toEqual({ grund: "Bei Person p7 ist qualifikationen keine Liste.", feld: "mandanten[0].personen[1].qualifikationen" });
    }
  });
  it("die Gestaltprüfung selbst bleibt unverändert (sie prüft Betriebslisten, nicht Personenfelder)", () => {
    expect(pruefeGestalt(mit(person("a", "x"))).ok).toBe(true);
  });
});

/* ---------- über den echten Handler ---------- */
const WIRT = "127.0.0.1:3000";
const RAUM = "personenraum";
let wurzel, laden, daten, B, kontoSchreiben, ablageSchluessel;
let nr = 0;
const T = {};
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.16.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const roh = async (raum = RAUM) => (await B.bestandLesen(laden(), raum)).bestand;
const legacy = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
  einheiten: [{ id: "e1", name: "E" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("l1", "leitung", { qualifikationen: [] }), person("ohne", "mitarbeiter"),
    person("kaputt", "mitarbeiter", { qualifikationen: "Pflegefachkraft" })],
  abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], abwesenheiten: [] }] });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-personen-"));
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
  await B.bestandSchreiben(laden(), RAUM, legacy(), { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle, bestand, person] of [["l1", "leitung", RAUM, "l1"], ["ohne", "mitarbeiter", RAUM, "ohne"], ["betr", "betreiber", "personen-betreiber", null]]) {
    c += 1;
    const code = `PERS${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand, rolle, person, betrieb: 0,
      ...(rolle === "betreiber" ? {} : { mandantId: "m-a" }), angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Handler: Lesen eines Altbestands", () => {
  it("GET liefert [] für fehlende und falsch getypte Listen — und schreibt dabei nichts", async () => {
    const vorher = JSON.stringify(await roh());
    for (const wer of ["l1", "ohne"]) {
      const r = await anfrage("/api/bestand", { methode: "GET", token: T[wer] });
      expect(r.status, wer).toBe(200);
      for (const p of r.bestand.mandanten[0].personen) expect(Array.isArray(p.qualifikationen), `${wer}/${p.id}`).toBe(true);
    }
    expect(JSON.stringify(await roh())).toBe(vorher);
    expect((await roh()).mandanten[0].personen.find((p) => p.id === "kaputt").qualifikationen).toBe("Pflegefachkraft");
  });
});

describe("Handler: Schreiben", () => {
  it("PUT mit falschem Typ in der Eingabe: 422 mit Feld, nichts geändert", async () => {
    const vorher = JSON.stringify(await roh());
    const g = await anfrage("/api/bestand", { methode: "GET", token: T.l1 });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].personen.find((p) => p.id === "ohne").qualifikationen = { q1: true };
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
    expect(w.status).toBe(422);
    expect(w.feld).toMatch(/personen\[\d+\]\.qualifikationen$/);
    expect(w.text).toContain("ist qualifikationen keine Liste");
    expect(JSON.stringify(await roh())).toBe(vorher);
  });
  it("PUT mit null: gespeichert als []; ein Altbestand mit falschem Typ sperrt das Schreiben nicht und wird angeglichen", async () => {
    const g = await anfrage("/api/bestand", { methode: "GET", token: T.l1 });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].personen.find((p) => p.id === "ohne").qualifikationen = null;
    b.mandanten[0].name = "A geändert";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
    expect(w.status).toBe(200);
    const s = (await roh()).mandanten[0];
    expect(s.name).toBe("A geändert");
    expect(s.personen.map((p) => [p.id, p.qualifikationen])).toEqual([["l1", []], ["ohne", []], ["kaputt", []]]);
    expect(s.personen.find((p) => p.id === "ohne").email).toBeUndefined();
    expect(s.personen.find((p) => p.id === "ohne").nachname).toBe("Nohne");
  });
  it("bestand-anlegen: fehlende Liste wird [], falscher Typ 422", async () => {
    const neu = (q) => ({ version: 9, stand: 1, session: null, mandanten: [{ id: "m-n", name: "Neu", status: "aktiv", einstellungen: {},
      einheiten: [{ id: "e1", name: "E" }], dienstarten: [], abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], abwesenheiten: [],
      personen: [person("x1", "leitung", q === undefined ? {} : { qualifikationen: q })] }] });
    const f = await anfrage("/api/bestand-anlegen", { token: T.betr, rumpf: { bestand: "personen-neu-a", inhalt: neu("Text") } });
    expect(f.status).toBe(422);
    expect(f.feld).toBe("mandanten[0].personen[0].qualifikationen");
    expect(await B.bestandLesen(laden(), "personen-neu-a").catch(() => null)).toBeFalsy();
    const ok = await anfrage("/api/bestand-anlegen", { token: T.betr, rumpf: { bestand: "personen-neu-b", inhalt: neu(undefined) } });
    expect(ok.status).toBe(200);
    expect((await roh("personen-neu-b")).mandanten[0].personen[0].qualifikationen).toEqual([]);
  });
});
