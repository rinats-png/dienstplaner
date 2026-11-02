/* ==========================================================================
   DATENINTEGRITÄT (WP-02) — keine verlorene Änderung bei gleichzeitigem
   Schreiben

   bestandSchreiben liest den Standzeiger, gleicht ab und schreibt den
   nächsten Stand erst nach mehreren Dateizugriffen. Ohne Sperre je Raum
   konnten zwei Schreiber mit demselben erwarteten Stand beide „bestehen":
   Beide sahen Stand N, beide schrieben N+1, und wer zuletzt die
   Monatsscherbe schrieb, löschte die Arbeit des anderen — beide bekamen
   200. Am häufigsten trifft das die Stempeluhr: Schichtbeginn, zwanzig
   Menschen stempeln in derselben Minute, alle in dieselbe Monatsscherbe.

   Geprüft wird hier gegen die Serverfunktion selbst (daten.mjs), mit einer
   Wegwerfablage. Der Eingriff in bestandSchreiben (vi.mock unten) kann
   zweierlei:

     vorher    vor dem Schreiben eine fremde Änderung im selben Monat
               ablegen — so entsteht ein echter Konflikt, wie ihn ein
               Schreiber außerhalb der Sperre (zweiter Prozess, Werkzeug)
               verursachen würde.
     treffen   zwei Schreiber gleichzeitig loslassen, sobald beide da sind
               (oder nach einer kurzen Frist, falls die Sperre den zweiten
               gar nicht erst hereinlässt). Ohne Sperre trifft sich damit
               jedes Paar verlässlich im gefährlichen Fenster.

   R1  50 Personen stempeln gleichzeitig → 50 Stempel gespeichert
   R2  zwei PUTs mit gleichem Stand gleichzeitig → genau ein 200, ein 409
   R3  Stempel parallel zu einem Leitungs-PUT im selben Monat → beide
       gespeichert oder sauberes 409, nie stiller Verlust
   R4  dauerhafter Konflikt beim Stempeln → bis zu drei Wiederholungen,
       dann 409, nie ok: true
   R5  Konflikt im ersten Versuch, Erfolg im zweiten → genau ein Stempel
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const haken = { vorher: null, treffen: null, aufrufe: 0 };

vi.mock("../server/lib/bestand.mjs", async (original) => {
  const echt = await original();
  return { ...echt,
    bestandSchreiben: async (store, raum, bestand, opt) => {
      haken.aufrufe += 1;
      const f = haken.vorher;
      if (f) await f(echt, store, raum);
      if (haken.treffen) await haken.treffen();
      return echt.bestandSchreiben(store, raum, bestand, opt);
    } };
});

/** Lässt `anzahl` Schreiber gemeinsam los — spätestens nach `frist` ms. */
function treffpunkt(anzahl, frist = 400) {
  let da = 0;
  let los;
  const alle = new Promise((r) => { los = r; });
  return async () => {
    da += 1;
    if (da >= anzahl) los();
    await Promise.race([alle, new Promise((r) => setTimeout(r, frist))]);
  };
}

const WIRT = "127.0.0.1:3000";
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
let wurzel, laden, daten, sitzungAnlegen, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`,
    "x-forwarded-for": `10.8.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

/** Ein frischer Raum je Prüfung — keine Prüfung erbt den Zustand einer anderen. */
async function raumAnlegen(raum, personen) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} }] }, { durch: "Pruefung" });
}

/* Sitzungen direkt anlegen statt über /api/anmelden: Fünfzig Anmeldungen in
   einem Raum stießen sonst an die Anmeldebremse je Betrieb — die gehört
   nicht zu dem, was hier geprüft wird. Die Felder sind dieselben wie dort. */
async function sitzungFuer(raum, personId, rolle = "mitarbeiter") {
  const { token } = await sitzungAnlegen({ bestand: raum, name: `Probe ${personId}`, rolle,
    person: personId, betrieb: 0, mandantId: "m1", einheit: null }, 60 * 60 * 1000);
  return token;
}

const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-integritaet-"));
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

describe("R1 — viele Stempel gleichzeitig", () => {
  it("50 Personen stempeln gleichzeitig ein: 50 × 200, 50 Stempel gespeichert, jeder wie gemeldet", async () => {
    const RAUM = "integritaet-r1";
    const ids = Array.from({ length: 50 }, (_, i) => `p${String(i + 1).padStart(2, "0")}`);
    await raumAnlegen(RAUM, ids.map((id) => person(id)));
    const tokens = [];
    for (const id of ids) tokens.push(await sitzungFuer(RAUM, id));

    const antworten = await Promise.all(tokens.map((token) =>
      anfrage("/api/stempeln", { token, rumpf: { datum: HEUTE, art: "start" } })));

    const status = antworten.map((a) => a.status);
    expect(status.filter((s) => s === 200), JSON.stringify(antworten.filter((a) => a.status !== 200)))
      .toHaveLength(50);
    const m = await mandant(RAUM);
    const gespeichert = ids.filter((id) => (m.einstempeln || {})[`${id}|${HEUTE}`]);
    expect(gespeichert, `verloren: ${ids.filter((id) => !gespeichert.includes(id)).join(", ")}`)
      .toHaveLength(50);
    ids.forEach((id, i) => expect(m.einstempeln[`${id}|${HEUTE}`]).toEqual(antworten[i].eintrag));
  }, 60000);
});

describe("R2 — zwei PUTs mit demselben Stand", () => {
  it("genau einer 200, einer 409 — und nur die Änderung des Gewinners steht", async () => {
    const RAUM = "integritaet-r2";
    await raumAnlegen(RAUM, [person("l1", "leitung"), person("l2", "leitung"), person("a1"), person("a2")]);
    const t1 = await sitzungFuer(RAUM, "l1", "leitung");
    const t2 = await sitzungFuer(RAUM, "l2", "leitung");
    const g1 = await anfrage("/api/bestand", { methode: "GET", token: t1 });
    const g2 = await anfrage("/api/bestand", { methode: "GET", token: t2 });
    expect(g1.etag).toBe(g2.etag);

    const b1 = JSON.parse(JSON.stringify(g1.bestand));
    const b2 = JSON.parse(JSON.stringify(g2.bestand));
    b1.mandanten[0].abweichungen[`a1|${HEUTE}`] = "F";
    b2.mandanten[0].abweichungen[`a2|${HEUTE}`] = "F";

    haken.treffen = treffpunkt(2);
    let w1, w2;
    try {
      [w1, w2] = await Promise.all([
        anfrage("/api/bestand", { methode: "PUT", token: t1, rumpf: { bestand: b1, etag: g1.etag } }),
        anfrage("/api/bestand", { methode: "PUT", token: t2, rumpf: { bestand: b2, etag: g2.etag } }),
      ]);
    } finally { haken.treffen = null; }

    expect([w1.status, w2.status].sort()).toEqual([200, 409]);
    const m = await mandant(RAUM);
    const gewinner = w1.status === 200 ? "a1" : "a2";
    const verlierer = gewinner === "a1" ? "a2" : "a1";
    expect(m.abweichungen[`${gewinner}|${HEUTE}`]).toBe("F");
    expect(m.abweichungen[`${verlierer}|${HEUTE}`]).toBeUndefined();
    const absage = w1.status === 409 ? w1 : w2;
    expect(absage.fehler).toBe("konflikt");
    expect(absage.ok).not.toBe(true);
  }, 30000);
});

describe("R3 — Stempel parallel zu einem Leitungs-PUT im selben Monat", () => {
  it("in zehn Runden: jede Erfolgsmeldung ist gespeichert, sonst sauberes 409", async () => {
    const RAUM = "integritaet-r3";
    const ma = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const ziele = Array.from({ length: 10 }, (_, i) => `z${i}`);
    await raumAnlegen(RAUM, [person("l1", "leitung"), ...ma.map((id) => person(id)), ...ziele.map((id) => person(id))]);
    const tL = await sitzungFuer(RAUM, "l1", "leitung");
    const tM = [];
    for (const id of ma) tM.push(await sitzungFuer(RAUM, id));

    const verluste = [];
    for (let r = 0; r < 10; r++) {
      const g = await anfrage("/api/bestand", { methode: "GET", token: tL });
      const b = JSON.parse(JSON.stringify(g.bestand));
      b.mandanten[0].abweichungen[`${ziele[r]}|${HEUTE}`] = "F";
      haken.treffen = treffpunkt(2);
      let st, put;
      try {
        [st, put] = await Promise.all([
          anfrage("/api/stempeln", { token: tM[r], rumpf: { datum: HEUTE, art: "start" } }),
          anfrage("/api/bestand", { methode: "PUT", token: tL, rumpf: { bestand: b, etag: g.etag } }),
        ]);
      } finally { haken.treffen = null; }

      expect([200, 409]).toContain(st.status);
      expect([200, 409]).toContain(put.status);
      const m = await mandant(RAUM);
      const stempel = (m.einstempeln || {})[`${ma[r]}|${HEUTE}`];
      const dienst = m.abweichungen[`${ziele[r]}|${HEUTE}`];
      if (st.status === 200 && JSON.stringify(stempel) !== JSON.stringify(st.eintrag))
        verluste.push(`Runde ${r}: Stempel gemeldet, aber nicht gespeichert`);
      if (st.status !== 200 && stempel) verluste.push(`Runde ${r}: Stempel gespeichert, aber 409 gemeldet`);
      if (put.status === 200 && dienst !== "F") verluste.push(`Runde ${r}: PUT gemeldet, aber nicht gespeichert`);
      if (put.status !== 200 && dienst === "F") verluste.push(`Runde ${r}: PUT gespeichert, aber 409 gemeldet`);
      if (st.status === 409) expect(st.code).toBe("STEMPEL_KONFLIKT");
      if (st.status !== 200) expect(st.ok).not.toBe(true);
    }
    expect(verluste).toEqual([]);
  }, 60000);
});

describe("R4/R5 — Konflikt beim Stempeln", () => {
  /** Die fremde Änderung: eine Leitung trägt im selben Monat einen Dienst ein. */
  const fremdeAenderung = (schluessel) => async (echt, store, raum) => {
    const g = await echt.bestandLesen(store, raum);
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].abweichungen[schluessel] = (b.mandanten[0].abweichungen[schluessel] || "") + "F";
    const e = await echt.bestandSchreiben(store, raum, b, { erwarteterStand: g.stand, durch: "Leitung" });
    expect(e.ok).toBe(true);
  };

  it("R4: dauerhafter Konflikt → vier Versuche (1 + 3 Wiederholungen), dann 409, nie ok: true", async () => {
    const RAUM = "integritaet-r4";
    await raumAnlegen(RAUM, [person("a1"), person("x1")]);
    const t = await sitzungFuer(RAUM, "a1");
    haken.aufrufe = 0;
    haken.vorher = fremdeAenderung(`x1|${HEUTE}`);
    let a;
    try { a = await anfrage("/api/stempeln", { token: t, rumpf: { datum: HEUTE, art: "start" } }); }
    finally { haken.vorher = null; }

    expect(a.ok, "Erfolg gemeldet, obwohl nichts gespeichert wurde").not.toBe(true);
    expect(a.status).toBe(409);
    expect(a.code).toBe("STEMPEL_KONFLIKT");
    expect(haken.aufrufe, "Anzahl der Schreibversuche").toBe(4);
    const m = await mandant(RAUM);
    expect((m.einstempeln || {})[`a1|${HEUTE}`]).toBeUndefined();
    expect(m.abweichungen[`x1|${HEUTE}`]).toBe("FFFF");             // alle vier fremden Änderungen stehen
  }, 30000);

  it("R5: Konflikt im ersten Versuch, Erfolg im zweiten → 200, genau ein Stempel, fremde Änderung bleibt", async () => {
    const RAUM = "integritaet-r5";
    await raumAnlegen(RAUM, [person("a1"), person("x1")]);
    const t = await sitzungFuer(RAUM, "a1");
    haken.aufrufe = 0;
    const einmal = fremdeAenderung(`x1|${HEUTE}`);
    haken.vorher = async (...arg) => { haken.vorher = null; await einmal(...arg); };
    let a;
    try { a = await anfrage("/api/stempeln", { token: t, rumpf: { datum: HEUTE, art: "start" } }); }
    finally { haken.vorher = null; }

    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.ok).toBe(true);
    expect(haken.aufrufe).toBe(2);
    const m = await mandant(RAUM);
    expect(m.abweichungen[`x1|${HEUTE}`]).toBe("F");
    const eigene = Object.keys(m.einstempeln || {}).filter((k) => k.startsWith("a1|"));
    expect(eigene).toEqual([`a1|${HEUTE}`]);
    expect(m.einstempeln[`a1|${HEUTE}`]).toEqual(a.eintrag);
  }, 30000);
});

describe("Raumsperre — Bausteine", () => {
  let R;
  beforeAll(async () => { R = await import("../server/lib/raumsperre.mjs"); });
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  it("nacheinander je Raum, verschiedene Räume parallel", async () => {
    const spur = [];
    const arbeit = (raum, name, ms) => R.unterRaumsperre(raum, async () => {
      spur.push(`${name}+`); await warte(ms); spur.push(`${name}-`);
    });
    await Promise.all([arbeit("a", "a1", 40), arbeit("a", "a2", 10), arbeit("b", "b1", 10)]);
    /* a2 beginnt erst nach dem Ende von a1; b1 läuft neben a1. */
    expect(spur.indexOf("a2+")).toBeGreaterThan(spur.indexOf("a1-"));
    expect(spur.indexOf("b1+")).toBeLessThan(spur.indexOf("a1-"));
  });

  it("verschachtelter Aufruf desselben Raums verklemmt nicht (Wiedereintritt)", async () => {
    const aus = await R.unterRaumsperre("v", async () => {
      expect(R.sperreGehalten("v")).toBe(true);
      return R.unterRaumsperre("v", async () => "innen", { zeitgrenzeMs: 200 });
    });
    expect(aus).toBe("innen");
    expect(R.sperreGehalten("v")).toBe(false);
  });

  it("Zeitgrenze: Fehler statt Hängen — und der Ausschluss bleibt bestehen", async () => {
    const spur = [];
    const lang = R.unterRaumsperre("z", async () => { spur.push("lang+"); await warte(150); spur.push("lang-"); });
    const ungeduldig = R.unterRaumsperre("z", async () => { spur.push("ungeduldig"); }, { zeitgrenzeMs: 30 });
    const danach = R.unterRaumsperre("z", async () => { spur.push("danach"); });
    await expect(ungeduldig).rejects.toMatchObject({ code: R.SPERRE_ZEITGRENZE });
    await Promise.all([lang, danach]);
    expect(spur).toEqual(["lang+", "lang-", "danach"]);   // „ungeduldig" lief nie, „danach" erst nach „lang"
  });

  it("ein Fehler in der Arbeit gibt die Sperre frei", async () => {
    await expect(R.unterRaumsperre("f", async () => { throw new Error("kaputt"); })).rejects.toThrow("kaputt");
    expect(await R.unterRaumsperre("f", async () => "weiter", { zeitgrenzeMs: 200 })).toBe("weiter");
  });

  it("nach getaner Arbeit gilt die Sperre nicht mehr als gehalten — auch nicht in später laufenden Folgen", async () => {
    let spaeter;
    await R.unterRaumsperre("h", async () => {
      spaeter = new Promise((r) => setTimeout(() => r(R.sperreGehalten("h")), 30));
    });
    expect(await spaeter).toBe(false);
  });
});
