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
import { personenAngleichen, personenFehler, pruefeGestalt, mindestFehler, dienstartenFehler, dienstartenAngleichen, mindestGleich } from "../server/lib/gestalt.mjs";

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

/* ==========================================================================
   DIENSTARTEN UND mindest (Abnahme V4, A-4; Betreiberentscheidung 2026-11-13)

   Der Server nahm eine Dienstart ohne `mindest` an; die Oberfläche stürzte
   danach ab („reading 'fr'"). Regel (gestalt.mjs, docs/acc45/ABNAHME-V4-
   A4-MINDEST.md):
   - Eine fehlende Mindestbesetzung wird nie still 0. Eine NEUE Dienstart
     ohne `mindest` (fehlt oder null) ist 422 — nach der Rechteprüfung.
   - `mindest` muss genau mo_do/fr/sa/so als ganze Zahlen 0..999 tragen,
     wenn es neu ist oder sich ändert; 0 ist ausdrücklich erlaubt. Kommazahl,
     negativ, Text (auch "2"), null-Feld, fremdes Feld: 422.
   - Eine GESPEICHERTE Dienstart (Kennung im gespeicherten Stand desselben
     Betriebs, je Vorkommen) ohne Angabe behält ihren Stand — auch das Fehlen
     (byte-gleich). Ein unveränderter oder veralteter Vollstand mit Altstand
     ohne `mindest` wird angenommen.
   ========================================================================== */
describe("A-4: mindestFehler / dienstartenFehler (Einheit)", () => {
  const MD0 = { mo_do: 0, fr: 0, sa: 0, so: 0 };
  const b = (mid, ...da) => ({ mandanten: [{ id: mid, dienstarten: da }] });
  it("gültig: ganze Zahlen 0..999, 0 ausdrücklich erlaubt", () => {
    expect(mindestFehler(MD0)).toBeNull();
    expect(mindestFehler({ mo_do: 999, fr: 1, sa: 0, so: 2 })).toBeNull();
  });
  it("ungültig: fehlt, null, kein Objekt, Liste, fremdes oder fehlendes Feld, Komma, negativ, Text, zu groß", () => {
    for (const md of [undefined, null, 0, "0", [0, 0, 0, 0], { mo_do: 0, fr: 0, sa: 0 }, { ...MD0, feiertag: 1 },
      { ...MD0, fr: 2.5 }, { ...MD0, sa: -1 }, { ...MD0, so: "abc" }, { ...MD0, so: "2" }, { ...MD0, fr: null },
      { ...MD0, mo_do: 1000 }, { ...MD0, mo_do: NaN }, { ...MD0, mo_do: Infinity }, { ...MD0, mo_do: true }])
      expect(mindestFehler(md), JSON.stringify(md)).toEqual(expect.any(String));
    expect(mindestFehler(undefined)).toMatch(/fehlt die Mindestbesetzung.*Pflicht, 0 ist erlaubt/);
  });
  it("neu ohne mindest → Fehler mit Feld; dieselbe Kennung gespeichert → kein Fehler, byte-gleich", () => {
    const alt = b("m-a", { id: "F", name: "Früh" });
    expect(dienstartenFehler(b("m-a", { id: "F", name: "Früh" }), null))
      .toEqual({ grund: expect.stringMatching(/^Bei Dienstart Früh fehlt die Mindestbesetzung/), feld: "mandanten[0].dienstarten[0].mindest" });
    const neu = b("m-a", { id: "F", name: "Früh" });
    const vorher = JSON.stringify(neu);
    expect(dienstartenAngleichen(neu, alt)).toBe(0);
    expect(dienstartenFehler(neu, alt)).toBeNull();
    expect(JSON.stringify(neu)).toBe(vorher);
  });
  it("gefälschte Kennungen: zweite Kopie, Kennung eines anderen Betriebs, anderer Typ (1 statt \"1\") gelten als neu", () => {
    const alt = { mandanten: [{ id: "m-a", dienstarten: [{ id: "F" }, { id: 1 }] }, { id: "m-b", dienstarten: [{ id: "X" }] }] };
    const zweite = { mandanten: [{ id: "m-a", dienstarten: [{ id: "F" }, { id: 1 }, { id: "F", name: "Kopie" }] }, { id: "m-b", dienstarten: [{ id: "X" }] }] };
    expect(dienstartenFehler(zweite, alt)).toMatchObject({ feld: "mandanten[0].dienstarten[2].mindest" });
    const fremd = { mandanten: [{ id: "m-a", dienstarten: [{ id: "F" }, { id: 1 }, { id: "X" }] }, { id: "m-b", dienstarten: [{ id: "X" }] }] };
    expect(dienstartenFehler(fremd, alt)).toMatchObject({ feld: "mandanten[0].dienstarten[2].mindest" });
    const typ = { mandanten: [{ id: "m-a", dienstarten: [{ id: "F" }, { id: "1" }] }, { id: "m-b", dienstarten: [{ id: "X" }] }] };
    expect(dienstartenFehler(typ, alt)).toMatchObject({ feld: "mandanten[0].dienstarten[1].mindest" });
    /* Gespeichert schon doppelt (Altstand): beide Vorkommen sind gespeichert, ein drittes ist neu. */
    const altDoppelt = b("m-a", { id: "F" }, { id: "F" });
    expect(dienstartenFehler(b("m-a", { id: "F" }, { id: "F" }), altDoppelt)).toBeNull();
    expect(dienstartenFehler(b("m-a", { id: "F" }, { id: "F" }, { id: "F" }), altDoppelt)).toMatchObject({ feld: "mandanten[0].dienstarten[2].mindest" });
  });
  it("gespeichert ohne Angabe: fehlt/null übernimmt den gespeicherten Stand; eine aktive Änderung wird geprüft", () => {
    const alt = b("m-a", { id: "S", mindest: { mo_do: 1, fr: 1, sa: 0, so: 0 } }, { id: "T", mindest: { mo_do: "2", fr: "2", sa: "1", so: "1" } });
    const neu = b("m-a", { id: "S" }, { id: "T", mindest: null });
    expect(dienstartenAngleichen(neu, alt)).toBe(2);
    expect(neu.mandanten[0].dienstarten.map((d) => d.mindest)).toEqual(alt.mandanten[0].dienstarten.map((d) => d.mindest));
    expect(dienstartenFehler(neu, alt)).toBeNull();
    /* Altwert als Text bleibt, solange er unverändert ist; wer ihn ändert, muss ganze Zahlen schicken. */
    expect(dienstartenFehler(b("m-a", { id: "S", mindest: { mo_do: 1, fr: 1, sa: 0, so: 0 } }, { id: "T", mindest: { mo_do: "3", fr: "2", sa: "1", so: "1" } }), alt))
      .toMatchObject({ feld: "mandanten[0].dienstarten[1].mindest" });
    expect(dienstartenFehler(b("m-a", { id: "S", mindest: { mo_do: 1, fr: 1, sa: 0, so: 0 } }, { id: "T", mindest: { mo_do: 3, fr: 2, sa: 1, so: 1 } }), alt)).toBeNull();
    expect(dienstartenFehler(b("m-a", { id: "S", mindest: { mo_do: 1, fr: -1, sa: 0, so: 0 } }), alt)).toMatchObject({ feld: "mandanten[0].dienstarten[0].mindest" });
  });
});

describe("A-4: Dienstart und mindest — echter Handler", () => {
  const MD = { mo_do: 1, fr: 1, sa: 0, so: 0 };
  const MD0 = { mo_do: 0, fr: 0, sa: 0, so: 0 };
  const dienstF = async () => JSON.stringify((await roh()).mandanten[0].dienstarten.find((d) => d.id === "F"));
  /* Ein GET für den ganzen Block: Abweisungen ändern den Stand nicht, ein 200 liefert Bestand und ETag mit.
     So bleibt der Block unter der Lesegrenze je Raum (lesen-raum). */
  let stand = null;
  const holen = async () => {
    if (!stand) { stand = await anfrage("/api/bestand", { methode: "GET", token: T.l1 }); expect(stand.status).toBe(200); }
    return stand;
  };
  const putMit = async (aendern, token = T.l1) => {
    const s = await holen();
    const b = JSON.parse(JSON.stringify(s.bestand));
    aendern(b.mandanten[0]);
    const r = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: s.etag, durch: "Pruefung" } });
    if (r.status === 200) stand = r.bestand && r.etag ? { bestand: r.bestand, etag: r.etag } : null;
    return r;
  };
  const neueDA = (extra) => ({ id: "S", name: "Spät", start: "14:00", ende: "22:00", ...extra });

  beforeAll(async () => {
    let c = 10;
    for (const [id, rolle, person] of [["pl", "planer", "l1"], ["ku", "kunde", "l1"], ["sv", "subplaner", "ohne"], ["br", "betriebsrat", "ohne"]]) {
      c += 1;
      const code = `PERS${c}-AAAA-${String(c).padStart(4, "0")}`;
      await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person, betrieb: 0, mandantId: "m-a",
        angelegt: "2026-01-01T00:00:00.000Z" });
      T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
      expect(T[id], id).toBeTruthy();
    }
  });

  it("der gespeicherte Altstand hat F ohne mindest", async () => {
    expect((await roh()).mandanten[0].dienstarten.find((d) => d.id === "F")).not.toHaveProperty("mindest");
  });
  it("PUT: neue Dienstart ohne mindest (fehlt oder null) → 422 mit Text und Feld, nichts geändert", async () => {
    const vorher = JSON.stringify(await roh());
    for (const extra of [{}, { mindest: null }]) {
      const w = await putMit((m) => { m.dienstarten.push(neueDA(extra)); });
      expect(w.status, JSON.stringify(extra)).toBe(422);
      expect(w.feld).toBe("mandanten[0].dienstarten[1].mindest");
      expect(w.text).toMatch(/Bei Dienstart Spät fehlt die Mindestbesetzung .*0 ist erlaubt.*Es wurde nichts geändert\./);
    }
    expect(JSON.stringify(await roh())).toBe(vorher);
  });
  it("PUT: 2.5, -1, \"abc\", null, \"2\", 1000, fremdes Feld, 0 als Zahl, Liste → 422, nichts geändert", async () => {
    const vorher = JSON.stringify(await roh());
    for (const md of [{ ...MD, fr: 2.5 }, { ...MD, sa: -1 }, { ...MD, so: "abc" }, { ...MD, mo_do: null }, { ...MD, so: "2" },
      { mo_do: "2", fr: "2", sa: "2", so: "2" }, { ...MD, mo_do: 1000 }, { ...MD, feiertag: 2 }, 0, [0, 0, 0, 0], "2"]) {
      const w = await putMit((m) => { m.dienstarten.push(neueDA({ mindest: md })); });
      expect(w.status, JSON.stringify(md)).toBe(422);
      expect(w.feld, JSON.stringify(md)).toBe("mandanten[0].dienstarten[1].mindest");
    }
    expect(JSON.stringify(await roh())).toBe(vorher);
  });
  it("PUT: neue Dienstart mit 0 je Tag → 200, gespeichert wie gesendet; F bleibt byte-gleich", async () => {
    const vorF = await dienstF();
    const w = await putMit((m) => { m.dienstarten.push(neueDA({ mindest: { ...MD0 } })); });
    expect(w.status).toBe(200);
    expect((await roh()).mandanten[0].dienstarten.find((d) => d.id === "S").mindest).toEqual(MD0);
    expect(await dienstF()).toBe(vorF);
  });
  it("PUT: gespeicherte Dienstart ändert mindest gültig → 200; ungültig → 422", async () => {
    const ok = await putMit((m) => { m.dienstarten.find((d) => d.id === "S").mindest = { ...MD }; });
    expect(ok.status).toBe(200);
    const vorher = JSON.stringify(await roh());
    for (const md of [{ mo_do: "viele" }, { ...MD, fr: 1.5 }, { ...MD, sa: "2" }]) {
      const w = await putMit((m) => { m.dienstarten.find((d) => d.id === "S").mindest = md; });
      expect(w.status, JSON.stringify(md)).toBe(422);
    }
    /* Auch der Altstand F: wer ihm ein ungültiges mindest gibt, bekommt 422 — ein gültiges wird gespeichert (unten). */
    expect((await putMit((m) => { m.dienstarten[0].mindest = { ...MD, so: -1 }; })).status).toBe(422);
    expect(JSON.stringify(await roh())).toBe(vorher);
  });
  it("PUT: fehlt mindest an einer gespeicherten Dienstart (oder null), bleibt der gespeicherte Stand", async () => {
    for (const weg of [(d) => { delete d.mindest; }, (d) => { d.mindest = null; }]) {
      const w = await putMit((m) => { const s = m.dienstarten.find((d) => d.id === "S"); weg(s); s.ende = "22:15"; });
      expect(w.status).toBe(200);
      const sp = (await roh()).mandanten[0].dienstarten.find((d) => d.id === "S");
      expect(sp.mindest).toEqual(MD);
      expect(sp.ende).toBe("22:15");
    }
  });
  it("PUT: Altstand ohne mindest bleibt schreibbar und byte-gleich (Rundweg und Änderung anderer Felder)", async () => {
    const vorF = await dienstF();
    const w = await putMit((m) => { m.name = "A-4 Rundweg"; });
    expect(w.status).toBe(200);
    expect(await dienstF()).toBe(vorF);
    const w2 = await putMit((m) => { m.dienstarten[0].ende = "14:15"; });
    expect(w2.status).toBe(200);
    const f = JSON.parse(await dienstF());
    expect(f.ende).toBe("14:15");
    expect(f).not.toHaveProperty("mindest");
  });
  it("veraltete Vollkopie mit Altstand ohne mindest: nie 422, F byte-gleich", async () => {
    const alt = JSON.parse(JSON.stringify(await holen()));
    const vorF = await dienstF();
    /* Jemand anderes ändert inzwischen etwas (neuer ETag). */
    expect((await putMit((m) => { m.name = "A-4 inzwischen"; })).status).toBe(200);
    const neuEtag = (await holen()).etag;
    /* Dieselbe alte Kopie: einmal mit dem alten ETag, einmal mit dem neuen. */
    for (const etag of [alt.etag, neuEtag]) {
      const r = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: alt.bestand, etag, durch: "Pruefung" } });
      expect(r.status, `${etag === alt.etag ? "alt" : "neu"}: ${r.text || r.fehler}`).not.toBe(422);
      expect([200, 409], String(r.status)).toContain(r.status);
      expect(await dienstF()).toBe(vorF);
      stand = null;
    }
  });
  it("bestand-anlegen (Betreiber): ohne/null/ungültig → 422; 0 → 200; Vorlage „leer\" trägt ausdrücklich 0", async () => {
    const neu = (d) => ({ version: 9, stand: 1, session: null, mandanten: [{ id: "m-d", name: "Neu", status: "aktiv", einstellungen: {},
      einheiten: [{ id: "e1", name: "E" }], dienstarten: [d], abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], abwesenheiten: [],
      personen: [person("x1", "leitung", { qualifikationen: [] })] }] });
    const da = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
    for (const [i, d] of [da, { ...da, mindest: null }, { ...da, mindest: { mo_do: 1 } }, { ...da, mindest: { ...MD, fr: "2" } }].entries()) {
      const f = await anfrage("/api/bestand-anlegen", { token: T.betr, rumpf: { bestand: `dienstart-neu-a${i}`, inhalt: neu(d) } });
      expect(f.status, JSON.stringify(d)).toBe(422);
      expect(f.feld).toBe("mandanten[0].dienstarten[0].mindest");
      expect(await B.bestandLesen(laden(), `dienstart-neu-a${i}`).catch(() => null)).toBeFalsy();
    }
    const ok = await anfrage("/api/bestand-anlegen", { token: T.betr, rumpf: { bestand: "dienstart-neu-b", inhalt: neu({ ...da, mindest: { ...MD0 } }) } });
    expect(ok.status).toBe(200);
    expect((await roh("dienstart-neu-b")).mandanten[0].dienstarten[0].mindest).toEqual(MD0);
    const leer = await anfrage("/api/bestand-anlegen", { token: T.betr, rumpf: { bestand: "dienstart-neu-leer", vorlage: "leer" } });
    expect(leer.status).toBe(200);
    for (const d of (await roh("dienstart-neu-leer")).mandanten[0].dienstarten) expect(mindestFehler(d.mindest), d.id).toBeNull();
  });
  it("Rechte unverändert: Mitarbeiter, Schichtverantwortung, Betriebsrat ändern keine Dienstarten — auch nicht mit manipuliertem mindest", async () => {
    const dienste = async () => JSON.stringify((await roh()).mandanten[0].dienstarten);
    const vorher = await dienste();
    for (const wer of ["ohne", "sv", "br"]) {
      const g = await anfrage("/api/bestand", { methode: "GET", token: T[wer] });
      expect(g.status, wer).toBe(200);
      for (const aendern of [(m) => m.dienstarten.push(neueDA({ id: "Z" })), (m) => m.dienstarten.push(neueDA({ id: "Z", mindest: { ...MD0 } })),
        (m) => { if (m.dienstarten[0]) m.dienstarten[0].mindest = { ...MD, fr: -5 }; }]) {
        const b = JSON.parse(JSON.stringify(g.bestand));
        aendern(b.mandanten[0]);
        const w = await anfrage("/api/bestand", { methode: "PUT", token: T[wer], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
        /* Blockierte Rollen sehen die Regel nie: Absage aus der Rechteprüfung (403), kein 422. */
        expect(w.status, `${wer}: ${w.text || w.fehler}`).not.toBe(422);
        expect([200, 403, 409], `${wer}: ${w.status}`).toContain(w.status);
        expect(await dienste(), wer).toBe(vorher);
        if (w.etag) g.etag = w.etag;
      }
    }
  });
  it("Rechte unverändert: Leitung, Planung und Kundenrolle dürfen Dienstarten pflegen — und bekommen dieselbe Regel (422 ohne mindest, 200 mit 0)", async () => {
    for (const wer of ["pl", "ku"]) {
      stand = null;
      const g = await anfrage("/api/bestand", { methode: "GET", token: T[wer] });
      expect(g.status, wer).toBe(200);
      const b = JSON.parse(JSON.stringify(g.bestand));
      b.mandanten[0].dienstarten.push(neueDA({ id: `N${wer}` }));
      const w = await anfrage("/api/bestand", { methode: "PUT", token: T[wer], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      expect(w.status, `${wer}: ${w.text || w.fehler}`).toBe(422);
      b.mandanten[0].dienstarten[b.mandanten[0].dienstarten.length - 1].mindest = { ...MD0 };
      const ok = await anfrage("/api/bestand", { methode: "PUT", token: T[wer], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      expect(ok.status, `${wer}: ${ok.text || ok.fehler}`).toBe(200);
      expect((await roh()).mandanten[0].dienstarten.find((d) => d.id === `N${wer}`).mindest).toEqual(MD0);
      expect(await dienstF()).not.toMatch(/mindest/);
    }
  });
});

/* ==========================================================================
   A-4, Nachbesserung nach unabhängiger Prüfung (PR 280)
   - Der Vergleich „mindest unverändert?" geschieht Feld für Feld, nicht über
     JSON.stringify: andere Schlüsselreihenfolge und Zahl/Text desselben
     Werts ("2" = 2) sind bei GESPEICHERTEN (historischen) Werten kein Grund
     für 422. Der gespeicherte Wortlaut bleibt erhalten.
   - Eine Kennung „erschleicht" kein mindest und schreibt keins still: Wer die
     Kennung einer gespeicherten Dienstart ohne mindest wiederverwendet, kann
     die Dienstart vollständig ersetzen (Name, Zeiten) — sie bleibt ohne
     mindest, bleibt als fehlend GEKENNZEICHNET und wird nie still 0.
     (Offene Betreiberfrage, docs/acc45/ABNAHME-V4-A4-MINDEST.md Abschnitt 4.)
   ========================================================================== */
describe("A-4 Nachbesserung: Vergleich feldweise (Einheit)", () => {
  const b = (...da) => ({ mandanten: [{ id: "m-a", dienstarten: da }] });
  const FELDER = ["mo_do", "fr", "sa", "so"];
  const permutationen = (liste) => liste.length <= 1 ? [liste]
    : liste.flatMap((x, i) => permutationen([...liste.slice(0, i), ...liste.slice(i + 1)]).map((r) => [x, ...r]));
  const inReihenfolge = (md, reihenfolge) => Object.fromEntries(reihenfolge.map((k) => [k, md[k]]));

  it("mindestGleich: Reihenfolge der Schlüssel egal, Zahl und Text derselben Zahl gleich, sonst streng", () => {
    const md = { mo_do: 2, fr: 3, sa: 1, so: 0 };
    for (const p of permutationen(FELDER)) expect(mindestGleich(md, inReihenfolge(md, p)), p.join()).toBe(true);
    expect(mindestGleich({ mo_do: "2", fr: "3", sa: " 1 ", so: "0" }, md)).toBe(true);
    expect(mindestGleich(md, { mo_do: "2", fr: 3, sa: 1, so: 0 })).toBe(true);
    expect(mindestGleich(md, { ...md, fr: 4 })).toBe(false);
    expect(mindestGleich(md, { ...md, fr: "4" })).toBe(false);
    expect(mindestGleich(md, { ...md, fr: "abc" })).toBe(false);
    expect(mindestGleich({ ...md, fr: "abc" }, { ...md, fr: "abc" })).toBe(true);
    expect(mindestGleich(md, { mo_do: 2, fr: 3, sa: 1 })).toBe(false);
    expect(mindestGleich(md, { ...md, feiertag: 1 })).toBe(false);
    expect(mindestGleich({ ...md, feiertag: 1 }, { feiertag: 1, ...md })).toBe(true);
    expect(mindestGleich(undefined, undefined)).toBe(true);
    expect(mindestGleich(null, null)).toBe(true);
    expect(mindestGleich(undefined, null)).toBe(false);
    expect(mindestGleich(undefined, md)).toBe(false);
    expect(mindestGleich(md, null)).toBe(false);
    expect(mindestGleich({ ...md, fr: -1 }, { fr: -1, so: 0, sa: 1, mo_do: 2 })).toBe(true);
  });
  it("gespeichert als Text in anderer Reihenfolge: alle Permutationen werden angenommen, der gespeicherte Wortlaut bleibt", () => {
    const text = { mo_do: "2", fr: "3", sa: "1", so: "0" };
    const alt = b({ id: "T", mindest: text });
    for (const p of permutationen(FELDER)) {
      /* Der Rumpf trägt dieselben Werte, nur in anderer Reihenfolge — als Text und als Zahl (veraltete Kopie). */
      for (const werte of [text, { mo_do: 2, fr: 3, sa: 1, so: 0 }]) {
        const neu = b({ id: "T", mindest: inReihenfolge(werte, p) });
        expect(dienstartenFehler(neu, alt), `${p.join()} ${JSON.stringify(werte)}`).toBeNull();
        dienstartenAngleichen(neu, alt);
        expect(JSON.stringify(neu.mandanten[0].dienstarten[0].mindest), p.join()).toBe(JSON.stringify(text));
        expect(dienstartenFehler(neu, alt)).toBeNull();
      }
    }
  });
  it("gespeichert als Zahlen in anderer Reihenfolge (veraltete Kopie): angenommen, gespeicherter Wortlaut bleibt", () => {
    const alt = b({ id: "S", mindest: { mo_do: 1, fr: 1, sa: 0, so: 0 } });
    for (const p of permutationen(FELDER)) {
      const neu = b({ id: "S", name: "veraltet", mindest: inReihenfolge({ mo_do: 1, fr: 1, sa: 0, so: 0 }, p) });
      expect(dienstartenFehler(neu, alt), p.join()).toBeNull();
      dienstartenAngleichen(neu, alt);
      expect(JSON.stringify(neu.mandanten[0].dienstarten[0].mindest)).toBe(JSON.stringify(alt.mandanten[0].dienstarten[0].mindest));
    }
  });
  it("ein anderer Wert bleibt eine Änderung: ungültig 422, gültig angenommen (dann gilt der neue Wert)", () => {
    const alt = b({ id: "T", mindest: { mo_do: "2", fr: "3", sa: "1", so: "0" } });
    for (const md of [{ so: 0, sa: 1, fr: 3, mo_do: "3" }, { so: 0, sa: 1, fr: 2.5, mo_do: 2 }, { so: "0", sa: "1", fr: "x", mo_do: "2" }, { fr: 3, mo_do: 2, sa: 1 }])
      expect(dienstartenFehler(b({ id: "T", mindest: md }), alt), JSON.stringify(md)).toMatchObject({ feld: "mandanten[0].dienstarten[0].mindest" });
    const gueltig = b({ id: "T", mindest: { so: 0, sa: 1, fr: 3, mo_do: 5 } });
    expect(dienstartenFehler(gueltig, alt)).toBeNull();
    dienstartenAngleichen(gueltig, alt);
    expect(gueltig.mandanten[0].dienstarten[0].mindest.mo_do).toBe(5);
  });
  it("gespeichert ungültig (Altstand): dieselbe Angabe in anderer Reihenfolge angenommen, jede Änderung geprüft", () => {
    const alt = b({ id: "K", mindest: { mo_do: -1, fr: 2.5, sa: "abc", so: 0 } });
    expect(dienstartenFehler(b({ id: "K", mindest: { so: 0, sa: "abc", fr: 2.5, mo_do: -1 } }), alt)).toBeNull();
    expect(dienstartenFehler(b({ id: "K", mindest: { so: 0, sa: "abc", fr: 2.5, mo_do: -2 } }), alt)).toMatchObject({ feld: "mandanten[0].dienstarten[0].mindest" });
  });
  it("neue Dienstart (andere Kennung): Reihenfolge hilft nicht, es gelten die strengen Regeln", () => {
    const alt = b({ id: "T", mindest: { mo_do: "2", fr: "3", sa: "1", so: "0" } });
    expect(dienstartenFehler(b({ id: "T", mindest: { mo_do: "2", fr: "3", sa: "1", so: "0" } }, { id: "N", mindest: { so: "0", sa: "1", fr: "3", mo_do: "2" } }), alt))
      .toMatchObject({ feld: "mandanten[0].dienstarten[1].mindest" });
    expect(dienstartenFehler(b({ id: "T", mindest: { mo_do: "2", fr: "3", sa: "1", so: "0" } }, { id: "N", mindest: { so: 0, sa: 1, fr: 3, mo_do: 2 } }), alt)).toBeNull();
  });
  it("gespeichert ohne mindest, Kennung wiederverwendet: bleibt OHNE mindest (nie still 0), auch bei geänderten Feldern", () => {
    const alt = b({ id: "F", name: "Früh", start: "06:00", ende: "14:00" });
    const neu = b({ id: "F", name: "Ersetzt", start: "05:00", ende: "13:00" });
    expect(dienstartenAngleichen(neu, alt)).toBe(0);
    expect(dienstartenFehler(neu, alt)).toBeNull();
    expect(neu.mandanten[0].dienstarten[0]).toEqual({ id: "F", name: "Ersetzt", start: "05:00", ende: "13:00" });
    expect(neu.mandanten[0].dienstarten[0]).not.toHaveProperty("mindest");
    /* Mit ausdrücklichem mindest wird es dagegen geprüft und gespeichert wie bei jeder Änderung. */
    expect(dienstartenFehler(b({ id: "F", mindest: { mo_do: 1, fr: 1, sa: 1, so: -1 } }), alt)).toMatchObject({ feld: "mandanten[0].dienstarten[0].mindest" });
    expect(dienstartenFehler(b({ id: "F", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } }), alt)).toBeNull();
  });
});

describe("A-4 Nachbesserung: echter Handler (Kennung, veraltete Kopie, Rechte)", () => {
  const MD = { mo_do: 1, fr: 1, sa: 0, so: 0 };
  const RAUM_C = "personenraum-c", RAUM_B = "personenraum-b", RAUM_D = "demo-personenraum", RAUM_BETR = "personen-betreiber2";
  const TK = {};
  let demoVorher;
  const konto = async (code, eintrag) => kontoSchreiben(laden(), ablageSchluessel(code), { betrieb: 0, angelegt: "2026-01-01T00:00:00.000Z", ...eintrag });
  const anmelden = async (code) => (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  const lesenPut = async (token, aendern) => {
    const g = await anfrage("/api/bestand", { methode: "GET", token });
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendern(b);
    const w = await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
    return { g, w };
  };

  beforeAll(async () => {
    await B.bestandSchreiben(laden(), RAUM_C, legacy(), { durch: "Pruefung" });
    const lb = legacy(); lb.mandanten[0].id = "m-b"; lb.mandanten[0].name = "B";
    await B.bestandSchreiben(laden(), RAUM_B, lb, { durch: "Pruefung" });
    await B.bestandSchreiben(laden(), RAUM_D, legacy(), { durch: "Pruefung" });
    await B.bestandSchreiben(laden(), RAUM_BETR, legacy(), { durch: "Pruefung" });
    await konto("PERS41-AAAA-0041", { name: "lc", bestand: RAUM_C, rolle: "leitung", person: "l1", mandantId: "m-a" });
    await konto("PERS42-AAAA-0042", { name: "lb", bestand: RAUM_B, rolle: "leitung", person: "l1", mandantId: "m-b" });
    await konto("PERS43-AAAA-0043", { id: "dm-ma", demo: true, name: "dm", bestand: RAUM_D, rolle: "mitarbeiter", person: "ohne", mandantId: "m-a" });
    await konto("PERS44-AAAA-0044", { name: "betr2", bestand: RAUM_BETR, rolle: "betreiber", person: null });
    TK.lc = await anmelden("PERS41-AAAA-0041");
    TK.lb = await anmelden("PERS42-AAAA-0042");
    TK.betr = await anmelden("PERS44-AAAA-0044");
    expect(TK.lc && TK.lb && TK.betr).toBeTruthy();
    demoVorher = process.env.CENTRIC_DEMO;
    process.env.CENTRIC_DEMO = "true";
    TK.dm = (await anfrage("/api/demo", { rumpf: { id: "dm-ma" } })).token;
    expect(TK.dm, "Demozugang").toBeTruthy();
  });
  afterAll(() => { if (demoVorher === undefined) delete process.env.CENTRIC_DEMO; else process.env.CENTRIC_DEMO = demoVorher; });

  it("Kennung einer gespeicherten Dienstart ohne mindest: vollständig ersetzbar, bleibt ohne mindest und bleibt als fehlend gekennzeichnet — nie still 0", async () => {
    const { w } = await lesenPut(TK.lc, (b) => { b.mandanten[0].dienstarten = [{ id: "F", name: "Ersetzt", start: "05:00", ende: "13:00", farbe: "#123456" }]; });
    expect(w.status, w.text || w.fehler).toBe(200);
    const f = (await roh(RAUM_C)).mandanten[0].dienstarten.find((d) => d.id === "F");
    expect(f.name).toBe("Ersetzt");
    expect(f.start).toBe("05:00");
    expect(f).not.toHaveProperty("mindest");
    /* Auch zurückgelesen: weiterhin ohne mindest (kein stilles 0 in der Antwort). */
    const g = await anfrage("/api/bestand", { methode: "GET", token: TK.lc });
    expect(g.bestand.mandanten[0].dienstarten.find((d) => d.id === "F")).not.toHaveProperty("mindest");
    /* Gekennzeichnet: Planungsreife meldet fehlenden Besetzungsbedarf, die Oberflächenprüfung „fehlt". */
    const { planungsreife } = await import("../server/lib/engine/planungsreife.mjs");
    const r = planungsreife((await roh(RAUM_C)).mandanten[0], { von: "2026-12-01", bis: "2026-12-31" });
    const bedarf = r.luecken.find((l) => l.punkt === "bedarf");
    expect(bedarf && bedarf.text).toMatch(/fehlt der Besetzungsbedarf/);
    expect(bedarf.ids).toContain("F");
    const { mindestVorhanden } = await import("../server/lib/isteinfrieren.mjs");
    expect(mindestVorhanden(f)).toBe(false);
  });
  it("dieselbe Kennung mit ausdrücklichem mindest: gültig gespeichert, ungültig 422", async () => {
    const stand = JSON.stringify(await roh(RAUM_C));
    const schlecht = await lesenPut(TK.lc, (b) => { b.mandanten[0].dienstarten[0].mindest = { ...MD, so: "2" }; });
    expect(schlecht.w.status).toBe(422);
    expect(JSON.stringify(await roh(RAUM_C))).toBe(stand);
    const gut = await lesenPut(TK.lc, (b) => { b.mandanten[0].dienstarten[0].mindest = { so: 0, sa: 0, fr: 1, mo_do: 1 }; });
    expect(gut.w.status, gut.w.text || gut.w.fehler).toBe(200);
    expect((await roh(RAUM_C)).mandanten[0].dienstarten[0].mindest).toEqual(MD);
  });
  it("gespeichertes mindest als Text, Rumpf in anderer Reihenfolge: 200 (nie 422), gespeicherter Wortlaut bleibt; aktiv geändert und ungültig 422", async () => {
    const text = { mo_do: "2", fr: "3", sa: "1", so: "0" };
    const l = legacy(); l.mandanten[0].dienstarten[0].mindest = text;
    await B.bestandSchreiben(laden(), RAUM_C, l, { durch: "Pruefung" });
    for (const reihenfolge of [["so", "sa", "fr", "mo_do"], ["fr", "mo_do", "so", "sa"], ["sa", "so", "mo_do", "fr"]]) {
      for (const werte of [text, { mo_do: 2, fr: 3, sa: 1, so: 0 }]) {
        const { w } = await lesenPut(TK.lc, (b) => { b.mandanten[0].dienstarten[0].mindest = Object.fromEntries(reihenfolge.map((k) => [k, werte[k]])); });
        expect(w.status, `${reihenfolge.join()}: ${w.text || w.fehler}`).toBe(200);
        expect(JSON.stringify((await roh(RAUM_C)).mandanten[0].dienstarten[0].mindest), reihenfolge.join()).toBe(JSON.stringify(text));
      }
    }
    const { w } = await lesenPut(TK.lc, (b) => { b.mandanten[0].dienstarten[0].mindest = { so: "0", sa: "1", fr: "3", mo_do: "zwei" }; });
    expect(w.status).toBe(422);
  });
  it("Rechte: Betreiber (manipulierter Rumpf), Demo-Mitarbeiter und eine Leitung eines anderen Betriebs bekommen kein 422 — Absage aus der Rechteprüfung, Dienstarten unverändert", async () => {
    const dienste = async (raum) => JSON.stringify((await roh(raum)).mandanten.map((m) => m.dienstarten));
    const manipuliert = [
      (m) => m.dienstarten.push({ id: "Z", name: "Z", start: "08:00", ende: "12:00" }),
      (m) => m.dienstarten.push({ id: "Z", name: "Z", start: "08:00", ende: "12:00", mindest: { mo_do: 1, fr: -1, sa: 1, so: 1 } }),
      (m) => { m.dienstarten[0].mindest = { mo_do: 2.5, fr: 1, sa: 1, so: 1 }; },
    ];
    for (const [wer, token, raum] of [["betreiber", TK.betr, RAUM_BETR], ["demo-mitarbeiter", TK.dm, RAUM_D]]) {
      const vorher = await dienste(raum);
      for (const [i, aendern] of manipuliert.entries()) {
        const { g, w } = await lesenPut(token, (b) => aendern(b.mandanten[0]));
        expect(g.status, `${wer}: Lesen`).toBe(200);
        expect(w.status, `${wer}/${i}: ${w.text || w.fehler}`).not.toBe(422);
        expect([200, 403, 409], `${wer}/${i}: ${w.status}`).toContain(w.status);
        expect(await dienste(raum), `${wer}/${i}`).toBe(vorher);
      }
    }
    /* Leitung von Betrieb B: schickt zusätzlich einen fremden Betrieb m-a mit manipulierten Dienstarten. */
    const vorC = await dienste(RAUM_C), vorB = await dienste(RAUM_B);
    for (const [i, aendern] of manipuliert.entries()) {
      const { w } = await lesenPut(TK.lb, (b) => {
        const fremd = JSON.parse(JSON.stringify(b.mandanten[0]));
        fremd.id = "m-a"; fremd.name = "Fremd";
        aendern(fremd);
        b.mandanten.push(fremd);
      });
      expect(w.status, `Leitung B/${i}: ${w.text || w.fehler}`).not.toBe(422);
      expect(await dienste(RAUM_C), `Leitung B/${i}: Raum C`).toBe(vorC);
      expect((await roh(RAUM_B)).mandanten.map((m) => m.id), `Leitung B/${i}`).toEqual(["m-b"]);
      expect(await dienste(RAUM_B), `Leitung B/${i}: Raum B`).toBe(vorB);
    }
  });
});
