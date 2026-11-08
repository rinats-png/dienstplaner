/* ==========================================================================
   SI-P6 — Kundenräume: keine neuen Zugänge durch den Betreiber ohne
   Kundenzustimmung (Betreiberentscheidung 2026-11-07, Freigabepaket G.2)

   Verbot, fail-closed, auf ALLEN Wegen, die Zugangscodes anlegen:
     POST /api/zugaenge   (Betreibersitzung, frisch, zweiter Faktor)
     POST /einrichten     (Verwalterschlüssel)
   für JEDE Rolle (leitung, planer, subplaner, mitarbeiter, betriebsrat) und
   gleich, ob ein Leitungszugang fehlt, gesperrt oder abgelaufen ist: Das
   Fehlen einer Leitung ist keine Zustimmung.

   Erlaubt bleibt die kontrollierte Ersteinrichtung eines NEUEN Betriebs:
     - ein Raum ohne jeden Zugang (Betreibercodes zählen nicht) und ohne
       jede Mitgliedschaft ist neu; der erste Vorgang vermerkt ein Fenster
       von 15 Minuten, in dem die Einrichtung weitergeht (mehrere Aufrufe);
     - nach dem Fenster ist der Raum Kundenraum;
     - ein Raum, der nur Demozugänge hat, nimmt nur Demozugänge auf.
   Alles andere ist Kundenraum: 409 `kundenraum_gesperrt`, nichts entsteht.
   Lässt sich der Raum nicht lesen: 503, nichts entsteht.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Viele Tests starten Server-Handler mit echter Ablage und brauchen 3–4 s; die Standardgrenze von 5 s ließ die Datei in der CI sporadisch rot werden. */
vi.setConfig({ testTimeout: 60000 });

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 7, 9, 0, 15);
const ADMIN = "kundenraum-verwaltung-0123456789";
const OP = "KRAU-BTRB-0001";
const ROLLEN = [
  ["leitung", "p1"], ["planer", null], ["subplaner", "s1"], ["mitarbeiter", "m1"], ["betriebsrat", "b1"],
];
let wurzel, laden, daten, einrichten, konten, accounts, ablageSchluesselFn, schutz;
let jetzt = T0;
let nr = 0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };

const person = (id, rolle) => ({ id, vorname: id, nachname: "N", rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const bestandFuer = (id) => ({ version: 9, mandanten: [{ id, name: id, einheiten: [{ id: "e1" }],
  personen: [person("p1", "leitung"), person("s1", "subplaner"), person("m1", "mitarbeiter"), person("b1", "betriebsrat")],
  nachrichten: [], notrufe: [], anfragen: [] }] });

const rufen = async (handler, pfad, rumpf, token) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
    "x-forwarded-for": `10.71.${Math.floor(nr / 250)}.${nr % 250}` };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf) }), {});
  const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
/* Je Aufruf frisch angemeldet: Die Zeitsprünge der Prüfungen (Fenster der Ersteinrichtung) ließen eine gemeinsame Sitzung veralten. */
const viaZugaenge = async (raum, eintraege) => {
  const l = await rufen(daten, "/api/anmelden", { zugangscode: OP });
  return rufen(daten, "/api/zugaenge", { bestand: raum, eintraege }, l.token);
};
const viaEinrichten = (raum, rolle, person, demo = false) => rufen(einrichten, "/einrichten",
  { verwaltung: ADMIN, name: `${rolle} ${raum}`, bestand: raum, rolle, person, demo, ...(demo ? { gruppe: "g" } : {}) });
const anzahlKonten = async (raum) => (await konten.raumUebersicht(laden(), raum)).zugaenge.length;

async function raumAnlegen(raum) {
  const B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), raum, bestandFuer(`m-${raum}`), { durch: "Pruefung" });
}
/** Ein Zugang, wie er vor dieser Änderung entstand (ohne Vermerk der Ersteinrichtung). */
async function altKonto(raum, rolle, extra = {}) {
  const c = `KR${rolle.slice(0, 2).toUpperCase()}-${raum.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)}-${String(++nr).padStart(4, "0")}`;
  await konten.kontoSchreiben(laden(), ablageSchluesselFn(c), { name: `${rolle} ${raum}`, bestand: raum, rolle,
    person: rolle === "leitung" ? "p1" : null, betrieb: 0, mandantId: `m-${raum}`, demo: false,
    angelegt: "2026-01-01T00:00:00.000Z", ...extra });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-kundenraum-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-kundenraum-0123456789";
  process.env.CENTRIC_ADMIN = ADMIN;
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  for (const n of ["anmelden", "zugaenge", "einrichten"]) {
    schutz.GRENZEN[n] = { ...schutz.GRENZEN[n], versuche: 100000 };
    if (schutz.WEITERE[n]) schutz.WEITERE[n] = { gesamt: { versuche: 100000, fenster: 600 }, ziel: { versuche: 100000, fenster: 600 } };
    if (schutz.NOTGRENZEN[n]) schutz.NOTGRENZEN[n] = { versuche: 100000, fenster: 600, gesamt: 100000 };
  }
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
  konten = await import("../server/lib/konten.mjs");
  accounts = await import("../server/lib/accounts.mjs");
  ablageSchluesselFn = (await import("../server/lib/codes.mjs")).ablageSchluessel;
  await konten.kontoSchreiben(laden(), ablageSchluesselFn(OP), { name: "Betreiber", bestand: "kr-betreiber", rolle: "betreiber",
    person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
}, 120000);
afterAll(async () => { vi.useRealTimers(); await rm(wurzel, { recursive: true, force: true }); });

const ALLE_ROLLEN = ROLLEN.map(([rolle, personId]) => ({ rolle, ...(personId ? { personId } : {}) }));

describe("Kundenraumschutz über POST /api/zugaenge", () => {
  it("Raumname wird wie bei bestand-anlegen geprüft (Review-Befund 8): ungültige Namen → 400, nichts entsteht", async () => {
    for (const ziel of ["ab", "Kunde Eins", "../kr-alt", "kr alt", "-kr-alt", "x".repeat(81), "kr:alt"]) {
      const r = await viaZugaenge(ziel, [{ rolle: "leitung" }]);
      expect(r.status, ziel).toBe(400);
      expect(r.zugaenge, ziel).toBeUndefined();
    }
  });
  it("bestehender Kundenraum (Altbestand, Zugang ohne Vermerk): JEDE Rolle → 409, nichts entsteht", async () => {
    await raumAnlegen("kr-alt");
    await altKonto("kr-alt", "leitung");
    const vorher = await anzahlKonten("kr-alt");
    for (const e of ALLE_ROLLEN) {
      const r = await viaZugaenge("kr-alt", [e]);
      expect(r.status, e.rolle).toBe(409);
      expect(r.grund, e.rolle).toBe("kundenraum_gesperrt");
      expect(r.zugaenge, e.rolle).toBeUndefined();
    }
    expect(await anzahlKonten("kr-alt")).toBe(vorher);
  });

  it("das Fehlen einer wirksamen Leitung ist KEINE Zustimmung: nur Beschäftigte, gesperrte Leitung, abgelaufener Selbststart → 409", async () => {
    await raumAnlegen("kr-ohne-leitung");
    await altKonto("kr-ohne-leitung", "mitarbeiter");
    await raumAnlegen("kr-gesperrt");
    await altKonto("kr-gesperrt", "leitung", { gesperrt: true });
    await raumAnlegen("kr-abgelaufen");
    await altKonto("kr-abgelaufen", "leitung", { selbstAngelegt: true, laeuftAb: "2026-01-02T00:00:00.000Z" });
    for (const raum of ["kr-ohne-leitung", "kr-gesperrt", "kr-abgelaufen"]) {
      const vorher = await anzahlKonten(raum);
      for (const rolle of ["leitung", "planer"]) {
        const r = await viaZugaenge(raum, [{ rolle }]);
        expect(r.status, `${raum} ${rolle}`).toBe(409);
      }
      expect(await anzahlKonten(raum)).toBe(vorher);
    }
  });

  it("Codes anderer Rolle, gebunden an die Person der Leitung, entstehen im Kundenraum ebenso nicht", async () => {
    for (const rolle of ["mitarbeiter", "planer", "subplaner", "betriebsrat"]) {
      const r = await viaZugaenge("kr-alt", [{ rolle, personId: "p1" }]);
      expect(r.status, rolle).toBe(409);
    }
  });

  it("Altbestand im Sammelblob „konten“ zählt als bestehender Kundenraum", async () => {
    await raumAnlegen("kr-sammel");
    const s = laden();
    const alt = (await s.get("konten", { type: "json" })) || {};
    alt["kr-sammel-schluessel"] = { name: "alt", bestand: "kr-sammel", rolle: "mitarbeiter", person: "m1", betrieb: 0, mandantId: "m-kr-sammel" };
    await s.setJSON("konten", alt);
    try { expect((await viaZugaenge("kr-sammel", [{ rolle: "planer" }])).status).toBe(409); }
    finally { delete alt["kr-sammel-schluessel"]; await s.setJSON("konten", alt); }
  });

  it("Mitgliedschaft in jedem Zustand (auch entzogen) macht den Raum zum Kundenraum", async () => {
    for (const [raum, status] of [["kr-mit-aktiv", "aktiv"], ["kr-mit-eingeladen", "eingeladen"], ["kr-mit-entzogen", "aktiv"]]) {
      await raumAnlegen(raum);
      const a = await accounts.accountAnlegen(laden(), { email: `${raum}@kundenraum.example`, status: "aktiv" });
      expect(a.ok).toBe(true);
      const m = await accounts.mitgliedschaftAnlegen(laden(), { accountId: a.account.id, raum, betrieb: 0,
        mandantId: `m-${raum}`, rolle: "planer", status });
      expect(m.ok, raum).toBe(true);
      if (raum === "kr-mit-entzogen") await accounts.mitgliedschaftEntziehen(laden(), a.account.id, raum);
      expect((await viaZugaenge(raum, [{ rolle: "planer" }])).status, raum).toBe(409);
    }
  });

  it("ein Raum nur mit Demozugängen nimmt über diesen Weg nichts auf (er legt nie Demozugänge an)", async () => {
    await raumAnlegen("kr-demo-only");
    await altKonto("kr-demo-only", "leitung", { demo: true });
    expect((await viaZugaenge("kr-demo-only", [{ rolle: "leitung" }])).status).toBe(409);
  });

  it("Betreibercodes zählen nicht als Kundenzugang: ein Raum nur mit Betreibercode ist neu", async () => {
    await raumAnlegen("kr-betreiber-raum");
    await altKonto("kr-betreiber-raum", "betreiber");
    expect((await viaZugaenge("kr-betreiber-raum", [{ rolle: "leitung" }])).status).toBe(200);
  });

  it("Ersteinrichtung: neuer Raum, mehrere Rollen in einem Zug und weitere Aufrufe im Fenster → 200; nach dem Fenster → 409 für jede Rolle", async () => {
    await raumAnlegen("kr-neu");
    const erster = await viaZugaenge("kr-neu", [{ rolle: "leitung" }, { rolle: "planer" }]);
    expect(erster.status, erster.text).toBe(200);
    expect(erster.zugaenge.map((z) => z.rolle)).toEqual(["leitung", "planer"]);
    uhr(jetzt + 14 * 60_000);
    const zweiter = await viaZugaenge("kr-neu", [{ rolle: "mitarbeiter", personId: "m1" }]);
    expect(zweiter.status, zweiter.text).toBe(200);
    uhr(jetzt + 2 * 60_000);                                  // 16 Minuten nach dem ersten Vorgang
    const vorher = await anzahlKonten("kr-neu");
    for (const e of ALLE_ROLLEN) {
      const r = await viaZugaenge("kr-neu", [e]);
      expect(r.status, e.rolle).toBe(409);
      expect(r.grund).toBe("kundenraum_gesperrt");
    }
    expect(await anzahlKonten("kr-neu")).toBe(vorher);
  });

  it("ein abgelaufenes Fenster öffnet sich nicht wieder, auch wenn inzwischen jeder Zugang gesperrt ist", async () => {
    await raumAnlegen("kr-fenster");
    expect((await viaZugaenge("kr-fenster", [{ rolle: "leitung" }])).status).toBe(200);
    uhr(jetzt + 20 * 60_000);
    const { zugaenge } = await konten.raumUebersicht(laden(), "kr-fenster");
    expect(zugaenge.length).toBeGreaterThan(0);
    expect((await viaZugaenge("kr-fenster", [{ rolle: "leitung" }])).status).toBe(409);
  });

  it("Lesefehler (unlesbarer Konto-Eintrag) → 503, nichts entsteht", async () => {
    await raumAnlegen("kr-lesefehler");
    const datei = path.join(wurzel, "centric", "konto%3Azzz-kaputt.json");
    await writeFile(datei, "{ das ist kein json");
    try {
      const r = await viaZugaenge("kr-lesefehler", [{ rolle: "leitung" }]);
      expect(r.status).toBe(503);
      expect(r.zugaenge).toBeUndefined();
    } finally { await rm(datei, { force: true }); }
    expect(await anzahlKonten("kr-lesefehler")).toBe(0);
  });

  it("unlesbarer Vermerk der Ersteinrichtung → 503 (nie als „offen“ gelesen)", async () => {
    await raumAnlegen("kr-vermerk");
    const datei = path.join(wurzel, "centric", "ersteinrichtung%3Akr-vermerk.json");
    await writeFile(datei, "{ kein json");
    try {
      const r = await viaZugaenge("kr-vermerk", [{ rolle: "leitung" }]);
      expect(r.status).toBe(503);
    } finally { await rm(datei, { force: true }); }
    expect(await anzahlKonten("kr-vermerk")).toBe(0);
  });
});

describe("Kundenraumschutz über POST /einrichten (Verwalterschlüssel)", () => {
  it("bestehender Kundenraum: JEDE Rolle, auch Demozugang → 409, kein Code", async () => {
    await raumAnlegen("kre-alt");
    await altKonto("kre-alt", "leitung");
    const vorher = await anzahlKonten("kre-alt");
    for (const [rolle, personId] of ROLLEN) {
      for (const demo of [false, true]) {
        const r = await viaEinrichten("kre-alt", rolle, personId, demo);
        expect(r.status, `${rolle} demo=${demo} ${r.text}`).toBe(409);
        expect(r.grund).toBe("kundenraum_gesperrt");
        expect(r.zugangscode).toBeUndefined();
      }
    }
    expect(await anzahlKonten("kre-alt")).toBe(vorher);
  });

  it("das Fehlen der Leitung öffnet auch hier nichts (nur Beschäftigte, gesperrte Leitung)", async () => {
    await raumAnlegen("kre-ohne");
    await altKonto("kre-ohne", "mitarbeiter");
    await raumAnlegen("kre-gesperrt");
    await altKonto("kre-gesperrt", "leitung", { gesperrt: true });
    for (const raum of ["kre-ohne", "kre-gesperrt"])
      for (const rolle of ["leitung", "planer"])
        expect((await viaEinrichten(raum, rolle, null)).status, `${raum} ${rolle}`).toBe(409);
  });

  it("Ersteinrichtung eines neuen Betriebs: mehrere Codes nacheinander im Fenster → 200; danach 409 für jede Rolle", async () => {
    await raumAnlegen("kre-neu");
    for (const [rolle, personId] of ROLLEN) {
      const r = await viaEinrichten("kre-neu", rolle, personId);
      expect(r.status, `${rolle} ${r.text}`).toBe(200);
      expect(r.zugangscode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
    uhr(jetzt + 16 * 60_000);
    const vorher = await anzahlKonten("kre-neu");
    for (const [rolle, personId] of ROLLEN)
      expect((await viaEinrichten("kre-neu", rolle, personId)).status, rolle).toBe(409);
    expect(await anzahlKonten("kre-neu")).toBe(vorher);
  });

  it("Demoraum: nur Demozugänge sind dort erlaubt; ein Zugang ohne demo → 409", async () => {
    await raumAnlegen("kre-demo");
    expect((await viaEinrichten("kre-demo", "leitung", "p1", true)).status).toBe(200);
    uhr(jetzt + 20 * 60_000);                                 // Fenster vorbei: der Raum besteht nur aus Demozugängen
    expect((await viaEinrichten("kre-demo", "planer", null, true)).status).toBe(200);
    expect((await viaEinrichten("kre-demo", "planer", null, false)).status).toBe(409);
    expect((await viaEinrichten("kre-demo", "leitung", "p1", false)).status).toBe(409);
  });

  it("der Betreibercode des Bereitstellungsskripts (gleicher Raumname) bleibt möglich und macht den Raum nicht zum Kundenraum", async () => {
    await raumAnlegen("kre-skript");
    expect((await viaEinrichten("kre-skript", "betreiber", null)).status).toBe(200);
    expect((await viaEinrichten("kre-skript", "leitung", "p1", true)).status).toBe(200);
    uhr(jetzt + 20 * 60_000);
    expect((await viaEinrichten("kre-skript", "planer", null, true)).status).toBe(200);
  });

  it("Review-Befund B1 (hoch): ein Betreibercode für einen BESTEHENDEN Kundenraum entsteht nicht — jede Kundenrolle als Bestand, 409, kein Konto", async () => {
    for (const rolle of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]) {
      const raum = `kre-b1-${rolle}`;
      await raumAnlegen(raum);
      await altKonto(raum, rolle);
      const vorher = await anzahlKonten(raum);
      const r = await viaEinrichten(raum, "betreiber", null);
      expect(r.status, rolle).toBe(409);
      expect(r.grund, rolle).toBe("kundenraum_gesperrt");
      expect(r.code, rolle).toBeUndefined();
      expect(await anzahlKonten(raum), rolle).toBe(vorher);
    }
  });

  it("B1: ein Betreibercode für einen Raum nach der Ersteinrichtung (Kunde angelegt, Fenster vorbei) → 409; vorher und im eigenen Raum → 200", async () => {
    await raumAnlegen("kre-b1-fenster");
    expect((await viaEinrichten("kre-b1-fenster", "betreiber", null)).status).toBe(200);
    expect((await viaEinrichten("kre-b1-fenster", "leitung", "p1")).status).toBe(200);
    uhr(jetzt + 20 * 60_000);
    expect((await viaEinrichten("kre-b1-fenster", "betreiber", null)).status).toBe(409);
  });

  it("B1 (N2): Betreibercode im reinen Demoraum → 200; im Fenster neben einem Kundencode ebenfalls (dokumentierte Restlücke M1, Betreiberentscheidung offen)", async () => {
    expect((await viaEinrichten("demo-kr-b1", "betreiber", null)).status).toBe(200);
    await raumAnlegen("kre-b1-rest");
    expect((await viaEinrichten("kre-b1-rest", "leitung", "p1")).status).toBe(200);
    /* Restlücke M1 (SI-P6-NACHWEIS §9): Im Fenster der Ersteinrichtung ist ein Betreibercode noch erlaubt; die Betreiber-LESEsicht auf
       einen Kundenraum ist (noch) nicht gesperrt — Entscheidung des Betreibers, siehe FREIGABEPAKET G.2. Schlägt dieser Test später
       fehl, weil die Lesesperre kam, ist er bewusst auf 409 umzustellen. */
    expect((await viaEinrichten("kre-b1-rest", "betreiber", null)).status).toBe(200);
  });

  it("B1: Lesefehler beim Betreibercode → 503, kein Code", async () => {
    await raumAnlegen("kre-b1-lese");
    const datei = path.join(wurzel, "centric", "konto%3Azzz-kaputt3.json");
    await writeFile(datei, "{ kein json");
    try {
      const r = await viaEinrichten("kre-b1-lese", "betreiber", null);
      expect(r.status).toBe(503);
      expect(r.code).toBeUndefined();
    } finally { await rm(datei, { force: true }); }
  });

  it("Lesefehler → 503, kein Code", async () => {
    await raumAnlegen("kre-lesefehler");
    const datei = path.join(wurzel, "centric", "konto%3Azzz-kaputt2.json");
    await writeFile(datei, "{ kein json");
    try {
      const r = await viaEinrichten("kre-lesefehler", "leitung", "p1");
      expect(r.status).toBe(503);
      expect(r.zugangscode).toBeUndefined();
    } finally { await rm(datei, { force: true }); }
    expect(await anzahlKonten("kre-lesefehler")).toBe(0);
  });
});

describe("Löschen und Neuanlage unter demselben Namen", () => {
  it("ein gelöschter Raum nimmt Zugänge und Vermerk mit; ein neu angelegter Betrieb gleichen Namens ist wieder neu (und der alte bleibt gesperrt, solange er besteht)", async () => {
    await raumAnlegen("kr-loeschen");
    expect((await viaZugaenge("kr-loeschen", [{ rolle: "leitung" }])).status).toBe(200);
    uhr(jetzt + 20 * 60_000);
    expect((await viaZugaenge("kr-loeschen", [{ rolle: "planer" }])).status).toBe(409);       // besteht: gesperrt
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
    const erg = await raumLoeschen(laden(), sitzungsSpeicher(), "kr-loeschen");
    expect(erg.fehler ?? [], JSON.stringify(erg)).toEqual([]);
    expect(await anzahlKonten("kr-loeschen")).toBe(0);
    await raumAnlegen("kr-loeschen");                                                          // neuer Betrieb, gleicher Name
    expect((await viaZugaenge("kr-loeschen", [{ rolle: "leitung" }])).status).toBe(200);
  });
});

describe("beide Wege teilen den Vermerk der Ersteinrichtung", () => {
  it("ein Raum, der über /einrichten eingerichtet wurde, ist nach dem Fenster auch für /api/zugaenge Kundenraum — und umgekehrt", async () => {
    await raumAnlegen("kr-beide-a");
    expect((await viaEinrichten("kr-beide-a", "leitung", "p1")).status).toBe(200);
    expect((await viaZugaenge("kr-beide-a", [{ rolle: "planer" }])).status).toBe(200);     // noch im Fenster
    await raumAnlegen("kr-beide-b");
    expect((await viaZugaenge("kr-beide-b", [{ rolle: "leitung" }])).status).toBe(200);
    expect((await viaEinrichten("kr-beide-b", "planer", null)).status).toBe(200);          // noch im Fenster
    uhr(jetzt + 16 * 60_000);
    expect((await viaZugaenge("kr-beide-a", [{ rolle: "planer" }])).status).toBe(409);
    expect((await viaEinrichten("kr-beide-b", "planer", null)).status).toBe(409);
  });
});

/* ==========================================================================
   Review SI-P6 (unabhängiger Opus-Review): Lücken, durch die ein bestehender
   Kundenraum wieder als „neu“ erschien. Jede Prüfung war vor der Korrektur rot.
   ========================================================================== */

/** Sitzungsablage, deren Auflistung scheitert: Die Raumlöschung bricht nach Konten, Mitgliedschaften und Vermerk ab. */
const klemmendeSitzungen = (echt) => new Proxy(echt, { get(ziel, name) {
  if (name === "list") return async () => { throw new Error("Sitzungsablage klemmt"); };
  return Reflect.get(ziel, name);
} });

describe("Befund 1: abgebrochene Raumlöschung macht den Kundenraum nicht wieder „neu“", () => {
  it("Teilabbruch nach Konten und Mitgliedschaften (Raum mit Vermerk): Kern und Personal bleiben → 409 auf beiden Wegen; nach vollständiger Löschung wieder neu", async () => {
    const raum = "kr-teil-a";
    await raumAnlegen(raum);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(200);
    uhr(jetzt + 20 * 60_000);
    const a = await accounts.accountAnlegen(laden(), { email: `${raum}@kundenraum.example`, status: "aktiv" });
    expect((await accounts.mitgliedschaftAnlegen(laden(), { accountId: a.account.id, raum, betrieb: 0,
      mandantId: `m-${raum}`, rolle: "planer", status: "aktiv" })).ok).toBe(true);
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
    const erg = await raumLoeschen(laden(), klemmendeSitzungen(sitzungsSpeicher()), raum);
    expect(erg.vollstaendig).toBe(false);
    expect(await laden().get(`kern:${raum}`, { type: "json" })).not.toBeNull();       // Kundendaten noch da
    expect(await anzahlKonten(raum)).toBe(0);                                          // Zugänge schon weg
    expect((await laden().list({ prefix: accounts.raummitgliedSchluessel(raum, "") })).blobs).toEqual([]);
    for (const e of ALLE_ROLLEN) {
      const r = await viaZugaenge(raum, [e]);
      expect(r.status, `zugaenge ${e.rolle} ${r.text}`).toBe(409);
      expect(r.grund).toBe("kundenraum_gesperrt");
    }
    for (const [rolle, personId] of ROLLEN)
      expect((await viaEinrichten(raum, rolle, personId)).status, `einrichten ${rolle}`).toBe(409);
    expect(await anzahlKonten(raum)).toBe(0);
    /* Zu Ende gelöscht: Marke und Vermerk sind weg, ein neuer Betrieb gleichen Namens ist wieder neu. */
    const fertig = await raumLoeschen(laden(), sitzungsSpeicher(), raum);
    expect(fertig.fehler, JSON.stringify(fertig)).toEqual([]);
    expect(await laden().get(`loeschung:${raum}`, { type: "json" })).toBeNull();
    expect(await laden().get(`ersteinrichtung:${raum}`, { type: "json" })).toBeNull();
    await raumAnlegen(raum);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(200);
  });

  it("Teilabbruch bei einem Altbestand ohne Vermerk: die Löschmarke allein hält den Raum gesperrt", async () => {
    const raum = "kr-teil-b";
    await raumAnlegen(raum);
    await altKonto(raum, "leitung");
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
    const erg = await raumLoeschen(laden(), klemmendeSitzungen(sitzungsSpeicher()), raum);
    expect(erg.vollstaendig).toBe(false);
    expect(await anzahlKonten(raum)).toBe(0);
    expect(await laden().get(`loeschung:${raum}`, { type: "json" })).not.toBeNull();
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(409);
    expect((await viaEinrichten(raum, "leitung", "p1")).status).toBe(409);
    expect(await anzahlKonten(raum)).toBe(0);
    await raumLoeschen(laden(), sitzungsSpeicher(), raum);
  });

  it("die Marke des Löschlaufs (aufraeumen.mjs) sperrt ebenso; eine unlesbare Marke → 503", async () => {
    await raumAnlegen("kr-marke");
    await laden().setJSON("loeschung:kr-marke", { begonnen: new Date(jetzt).toISOString() });
    try { expect((await viaZugaenge("kr-marke", [{ rolle: "leitung" }])).status).toBe(409); }
    finally { await laden().delete("loeschung:kr-marke"); }
    const datei = path.join(wurzel, "centric", "loeschung%3Akr-marke.json");
    await writeFile(datei, "{ kein json");
    try { expect((await viaEinrichten("kr-marke", "leitung", "p1")).status).toBe(503); }
    finally { await rm(datei, { force: true }); }
    expect(await anzahlKonten("kr-marke")).toBe(0);
  });
});

describe("Befund 3: eine Mitgliedschaft ohne Raumindex zählt", () => {
  it("mitglied:<account>:<raum> ohne raummitglied:-Eintrag → 409 auf beiden Wegen", async () => {
    const raum = "kr-ohne-index";
    await raumAnlegen(raum);
    const a = await accounts.accountAnlegen(laden(), { email: `${raum}@kundenraum.example`, status: "aktiv" });
    expect((await accounts.mitgliedschaftAnlegen(laden(), { accountId: a.account.id, raum, betrieb: 0,
      mandantId: `m-${raum}`, rolle: "planer", status: "aktiv" })).ok).toBe(true);
    await laden().delete(accounts.raummitgliedSchluessel(raum, a.account.id));
    expect((await laden().list({ prefix: accounts.raummitgliedSchluessel(raum, "") })).blobs).toEqual([]);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(409);
    expect((await viaEinrichten(raum, "leitung", "p1")).status).toBe(409);
    expect(await anzahlKonten(raum)).toBe(0);
  });
});

describe("Befund 4: Selbststart-Räume sind nie „neu“ für einen Betreibercode; Demoräume nur für Demozugänge", () => {
  it("Raumkennung t-… (Rennfenster der Provisionierung) → 409 auf beiden Wegen, auch ohne jeden Zugang", async () => {
    await raumAnlegen("t-kr-selbst");
    expect((await viaZugaenge("t-kr-selbst", [{ rolle: "leitung" }])).status).toBe(409);
    expect((await viaEinrichten("t-kr-selbst", "leitung", "p1")).status).toBe(409);
    expect((await viaEinrichten("t-kr-selbst", "leitung", "p1", true)).status).toBe(409);
    expect(await anzahlKonten("t-kr-selbst")).toBe(0);
  });

  it("Betrieb mit selbstAngelegt im Kern oder Eintrag in „selbststarts“ → 409", async () => {
    const B = await import("../server/lib/bestand.mjs");
    const selbst = bestandFuer("m-kr-selbst-kern");
    selbst.mandanten[0].selbstAngelegt = true;
    await B.bestandSchreiben(laden(), "kr-selbst-kern", selbst, { durch: "Pruefung" });
    expect((await laden().get("kern:kr-selbst-kern", { type: "json" })).mandanten[0].selbstAngelegt).toBe(true);
    expect((await viaZugaenge("kr-selbst-kern", [{ rolle: "leitung" }])).status).toBe(409);
    await raumAnlegen("kr-selbst-liste");
    const alt = (await laden().get("selbststarts", { type: "json" })) || [];
    await laden().setJSON("selbststarts", [...alt, { raum: "kr-selbst-liste", angelegt: new Date(jetzt).toISOString() }]);
    try { expect((await viaEinrichten("kr-selbst-liste", "leitung", "p1")).status).toBe(409); }
    finally { await laden().setJSON("selbststarts", alt); }
    expect(await anzahlKonten("kr-selbst-kern") + await anzahlKonten("kr-selbst-liste")).toBe(0);
  });

  it("Demoraum demo-…: die Bereitstellung (Betreibercode, Demozugänge) bleibt möglich, ein Kundenzugang nie", async () => {
    await raumAnlegen("demo-kr-schau");
    expect((await viaZugaenge("demo-kr-schau", [{ rolle: "leitung" }])).status).toBe(409);
    expect((await viaEinrichten("demo-kr-schau", "leitung", "p1")).status).toBe(409);
    expect((await viaEinrichten("demo-kr-schau", "betreiber", null)).status).toBe(200);
    expect((await viaEinrichten("demo-kr-schau", "leitung", "p1", true)).status).toBe(200);
    expect((await viaEinrichten("demo-kr-schau", "planer", null, true)).status).toBe(200);
    expect((await viaEinrichten("demo-kr-schau", "planer", null, false)).status).toBe(409);
  });
});

describe("Befund 5: das Fenster schließt sich mit der ersten Kundenanmeldung", () => {
  it("nach der Anmeldung mit einem Code des Raums → 409 auf beiden Wegen, obwohl das Fenster noch offen wäre", async () => {
    await raumAnlegen("kr-angemeldet");
    const erster = await viaZugaenge("kr-angemeldet", [{ rolle: "leitung" }]);
    expect(erster.status, erster.text).toBe(200);
    expect((await viaZugaenge("kr-angemeldet", [{ rolle: "planer" }])).status).toBe(200);   // Fenster offen, niemand angemeldet
    const an = await rufen(daten, "/api/anmelden", { zugangscode: erster.zugaenge[0].code });
    expect(an.status, an.text).toBe(200);
    const vorher = await anzahlKonten("kr-angemeldet");
    expect((await viaZugaenge("kr-angemeldet", [{ rolle: "planer" }])).status).toBe(409);
    expect((await viaEinrichten("kr-angemeldet", "planer", null)).status).toBe(409);
    expect(await anzahlKonten("kr-angemeldet")).toBe(vorher);
  });
});

/* ==========================================================================
   Zweiter Review (45312df): N5 — Lesefehler der Sitzungsablage im Fenster,
   Marke ohne Kern und die Reihenfolge am Ende der Raumlöschung.
   ========================================================================== */

describe("Review 2, N5: Sitzungsablage im offenen Fenster nicht lesbar", () => {
  it("unlesbare Sitzung im offenen Fenster → 503 auf beiden Wegen, nichts entsteht", async () => {
    const raum = "kr-sitzung-kaputt";
    await raumAnlegen(raum);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(200);      // Fenster offen
    const vorher = await anzahlKonten(raum);
    const datei = path.join(wurzel, "centric-sitzungen", "t%3Azzz-kaputt.json");
    await writeFile(datei, "{ keine sitzung");
    try {
      const r = await viaZugaenge(raum, [{ rolle: "planer" }]);
      expect(r.status, r.text).toBe(503);
      expect(r.zugaenge).toBeUndefined();
      const e = await viaEinrichten(raum, "planer", null);
      expect(e.status, e.text).toBe(503);
      expect(e.zugangscode).toBeUndefined();
    } finally { await rm(datei, { force: true }); }
    expect(await anzahlKonten(raum)).toBe(vorher);
  });
});

describe("Review 2, M1/N5: Ende der Raumlöschung", () => {
  /** Ablage, in der genau ein Schlüssel nicht gelöscht werden kann. */
  const klemmt = (echt, schluessel) => new Proxy(echt, { get(ziel, name) {
    if (name === "delete") return async (key) => {
      if (key === schluessel) throw new Error("klemmt");
      return ziel.delete(key);
    };
    return Reflect.get(ziel, name);
  } });

  it("scheitert der Vermerk der Ersteinrichtung, bleibt der Kern stehen (der nächste Lauf findet den Raum) und der Raum gesperrt", async () => {
    const raum = "kr-ende-vermerk";
    await raumAnlegen(raum);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(200);
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
    const erg = await raumLoeschen(klemmt(laden(), `ersteinrichtung:${raum}`), sitzungsSpeicher(), raum);
    expect(erg.vollstaendig).toBe(false);
    expect(await laden().get(`kern:${raum}`, { type: "json" })).not.toBeNull();
    expect(await laden().get(`loeschung:${raum}`, { type: "json" })).not.toBeNull();
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(409);
    const fertig = await raumLoeschen(laden(), sitzungsSpeicher(), raum);
    expect(fertig.fehler).toEqual([]);
  });

  it("Marke ohne Kern: ein erneuter Aufruf von /api/raum-loeschen räumt sie ab und gibt den Raumnamen wieder frei", async () => {
    const raum = "kr-ende-marke";
    await raumAnlegen(raum);
    await altKonto(raum, "leitung");
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
    const erg = await raumLoeschen(klemmt(laden(), `loeschung:${raum}`), sitzungsSpeicher(), raum);
    expect(erg.vollstaendig).toBe(false);
    expect(await laden().get(`kern:${raum}`, { type: "json" })).toBeNull();
    expect(await laden().get(`loeschung:${raum}`, { type: "json" })).not.toBeNull();
    await raumAnlegen(raum);                                                // neuer Betrieb, gleicher Name: noch gesperrt
    const gesperrt = await viaZugaenge(raum, [{ rolle: "leitung" }]);
    expect(gesperrt.status).toBe(409);
    /* Wiederholung über die Betreiberkonsole (idempotent, auch ohne Kern). */
    const l = await rufen(daten, "/api/anmelden", { zugangscode: OP });
    const w = await rufen(daten, "/api/raum-loeschen", { bestand: raum, bestaetigung: raum }, l.token);
    expect(w.status, w.text).toBe(200);
    expect(await laden().get(`loeschung:${raum}`, { type: "json" })).toBeNull();
    await raumAnlegen(raum);
    expect((await viaZugaenge(raum, [{ rolle: "leitung" }])).status).toBe(200);
  });
});
