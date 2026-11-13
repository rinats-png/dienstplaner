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
import { personenAngleichen, personenFehler, pruefeGestalt, mindestFehler, dienstartenFehler, dienstartenAngleichen } from "../server/lib/gestalt.mjs";

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
