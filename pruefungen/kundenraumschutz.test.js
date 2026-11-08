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
