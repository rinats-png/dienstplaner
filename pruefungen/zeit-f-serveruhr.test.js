/* ==========================================================================
   ZEIT-F Rest, T-SRV-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2, § 13.3): der ECHTE Serverprozess mit
   verschobener Serveruhr und fremder Prozesszeitzone, über HTTP.

   pruefungen/zeit-f-zonen.mjs fährt Prüfdateien je Prozesszone; die Handler laufen dort im Testprozess. Hier läuft
   server.mjs als eigener Prozess (Wegwerfablage, 127.0.0.1) mit
   - TZ = UTC, Pacific/Kiritimati (UTC+14) oder Etc/GMT+12 (UTC−12): das Paar an der Datumsgrenze, dazwischen 26 Stunden;
   - einer Uhr, die e2e/uhr-vorlauf.mjs (nur Testserver, bricht unter NODE_ENV=production ab) auf einen festen
     Zeitpunkt versetzt. Jeder Abschnitt startet den Server neu auf DERSELBEN Ablage mit einem anderen Versatz — so
     liegen Beginn und Ende eines Dienstes auf beiden Seiten der Berliner Mitternacht bzw. eines Uhrsprungs.

   Fälle (Betriebstag = Berliner Kalendertag, E1):
     M   Mitternacht Winter: Beginn 23:58 am 14.11., Ende 00:01 am 15.11. → Schichttag 14.11., Ende-Kalendertag 15.11.;
         ein Beginn um 00:01 gehört zum 15.11. (T-MN-1/2).
     F   Frühjahr 29.03.2026: Beginn 01:58 MEZ, Ende 03:01 MESZ → 3 Minuten, Wanduhr 01:58/03:01, kein
         ZEITUMSTELLUNG-Prüffall (T-DST-F1).
     H   Herbst 25.10.2026: Beginn 02:58 MESZ, Ende 02:01 MEZ (dieselbe Wanduhrstunde zweimal) → Schichttag 25.10.,
         Prüffall ZEITUMSTELLUNG (T-DST-H2).
     A   Monatsabschluss und Raumanlage (Z56-Umfeld, § 13.2 P3): um 23:59 am 30.11. Berlin lässt sich der November nicht
         abschließen, ein leerer Betrieb trägt `seit` 30.11.; um 00:01 am 01.12. Berlin schließt der November, `seit`
         01.12. In Kiritimati ist um 23:59 Berlin schon der 01.12., in UTC und Etc/GMT+12 um
         00:01 Berlin noch der 30.11. — ein Server mit Prozesstag fiele hier auf.

   Nicht hier: Qualifikationsgültigkeit (engine/plan.mjs) und Eintritt der Leitungsperson (provisionierung.mjs, nur
   über die Selbstregistrierung erreichbar) — beide in den Prüfdateien je Prozesszone (zeit-f-zonen.mjs,
   zeit-c-e-rest-betriebstag.test.js).

   Synthetische Personen, keine echten Daten. Zugangscodes werden nicht ausgegeben.
   Aufruf: npx vitest run pruefungen/zeit-f-serveruhr.test.js --maxWorkers=1 --testTimeout=60000
   Andere Zonen: ZEIT_F_SERVERZONEN="Asia/Tokyo,America/New_York" … (Vorgabe: die drei oben).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";
import { UHR_VERSATZ_VAR } from "../e2e/zeitbasis.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VORLAUF = pathToFileURL(path.join(WURZEL, "e2e", "uhr-vorlauf.mjs")).href;
const ADMIN = "zeitf-admin-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const PFEFFER = "zeitf-pfeffer-nur-zum-pruefen-" + Math.random().toString(36).slice(2);

export const SERVERZONEN = Object.freeze(["UTC", "Pacific/Kiritimati", "Etc/GMT+12"]);
const zonen = process.env.ZEIT_F_SERVERZONEN
  ? process.env.ZEIT_F_SERVERZONEN.split(",").map((s) => s.trim()).filter(Boolean) : SERVERZONEN;

/** Kalendertag eines Zeitpunkts in einer Zone (so läse ihn ein Prozess mit dieser TZ). */
const tagIn = (iso, zone) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(iso));

const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } };
const N = { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } };
const person = (id, rolle) => ({ id, vorname: "Synth", nachname: id, rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", eintritt: "2020-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const inhalt = () => ({ version: 9, stand: 1, mandanten: [{ id: "m1", name: "Synthetischer Betrieb ZEIT-F", bundesland: "HE",
  einheiten: [{ id: "e1", name: "Wache" }], dienstarten: [F, N],
  personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("p1", "planer")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [] }] });

/** Ein Server auf einer Wegwerfablage; `uhr(iso, tz)` startet ihn (neu) mit Uhr ab `iso` und Prozesszone `tz`. */
function ablage(name) {
  const z = { daten: "", statik: "", kind: null, basis: "", log: () => "", xff: 0 };
  z.anlegen = async () => {
    z.daten = await mkdtemp(path.join(tmpdir(), `centric-zeitf-${name}-`));
    z.statik = await mkdtemp(path.join(tmpdir(), `centric-zeitf-statik-`));
    await writeFile(path.join(z.statik, "index.html"), "<!doctype html><title>ZEIT-F</title>");
  };
  z.anhalten = async () => {
    const k = z.kind; z.kind = null;
    if (!k || k.exitCode !== null || k.signalCode !== null) return;
    await new Promise((r) => { const n = setTimeout(() => k.kill("SIGKILL"), 3000); k.once("exit", () => { clearTimeout(n); r(undefined); }); k.kill("SIGTERM"); });
  };
  z.uhr = async (iso, tz) => {
    await z.anhalten();
    // zeit-ok: Die echte Uhr dient nur der Berechnung des Versatzes; der Server läuft danach ab dem festen Zeitpunkt `iso`.
    const versatz = Date.parse(iso) - Date.now();
    const st = await serverStarten({ cwd: WURZEL, wartenMs: 60_000, env: {
      TZ: tz, NODE_OPTIONS: `--import ${VORLAUF}`, [UHR_VERSATZ_VAR]: String(versatz),
      CENTRIC_STATIK: z.statik, CENTRIC_DATEN: z.daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: PFEFFER,
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
      CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_REGISTRIERUNG: undefined, CENTRIC_IMPORT_AKTIV: undefined,
      CENTRIC_ZEITMODELL: undefined, CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined } });
    z.kind = st.kind; z.basis = st.basis; z.log = st.log;
  };
  z.anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
    z.xff += 1;
    const kopf = { "content-type": "application/json", "x-forwarded-for": `10.77.${Math.floor(z.xff / 250) % 250}.${(z.xff % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const a = await fetch(z.basis + pfad, { method: methode, headers: kopf, ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
    const roh = await a.text();
    let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
    return { status: a.status, roh, d };
  };
  /** Betreiber für `raum` einrichten und frisch anmelden; gibt das Token zurück. */
  z.betreiber = async (raum) => {
    const e = await z.anfrage("/einrichten", { rumpf: { verwaltung: ADMIN, name: "Betreiber", bestand: raum, rolle: "betreiber", person: null, betrieb: 0 } });
    expect(e.d.zugangscode, `Einrichtung ${raum}: ${e.status} ${e.roh.slice(0, 160)}`).toBeTruthy();
    const a = await z.anfrage("/api/anmelden", { rumpf: { zugangscode: e.d.zugangscode } });
    expect(a.d.token, `Betreiberanmeldung ${raum}: ${a.status}`).toBeTruthy();
    return a.d.token;
  };
  /** Raum mit synthetischen Personen und je einem Zugang; gibt Tokens je Person zurück. */
  z.betrieb = async (raum) => {
    const bt = await z.betreiber(raum);
    const an = await z.anfrage("/api/bestand-anlegen", { token: bt, rumpf: { inhalt: inhalt() } });
    expect(an.status, `Raumanlage: ${an.roh.slice(0, 200)}`).toBe(200);
    const ids = ["a1", "a2", "p1"];
    const zz = await z.anfrage("/api/zugaenge", { token: bt, rumpf: { bestand: raum,
      eintraege: ids.map((id) => ({ rolle: id === "p1" ? "planer" : "mitarbeiter", personId: id, name: `Synth ${id}` })) } });
    expect(Array.isArray(zz.d.zugaenge) && zz.d.zugaenge.length, `Zugänge: ${zz.status} ${zz.roh.slice(0, 200)}`).toBe(ids.length);
    const codes = Object.fromEntries(ids.map((id, i) => [id, zz.d.zugaenge[i].code]));
    return { codes };
  };
  z.anmelden = async (code) => {
    const a = await z.anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
    expect(a.d.token, `Anmeldung: ${a.status} ${a.roh.slice(0, 120)}`).toBeTruthy();
    return a.d.token;
  };
  z.stempeln = (token, art) => z.anfrage("/api/stempeln", { token, rumpf: { art } });
  z.mandant = async (token) => {
    const g = await z.anfrage("/api/bestand", { methode: "GET", token });
    expect(g.status, g.roh.slice(0, 160)).toBe(200);
    return g.d.bestand.mandanten[0];
  };
  z.abbauen = async () => {
    await z.anhalten();
    for (const d of [z.daten, z.daten && `${z.daten}-zustand`, z.statik]) if (d) await rm(d, { recursive: true, force: true }).catch(() => {});
  };
  return z;
}

describe("Prüfdaten: das Zonenpaar trennt den Prozesstag vom Berliner Tag an den gewählten Zeitpunkten", () => {
  it("Kiritimati ist um 23:59 Berlin schon im Folgetag, UTC und Etc/GMT+12 um 00:01 Berlin noch im Vortag", () => {
    expect(tagIn("2026-11-30T22:59:00Z", "Europe/Berlin")).toBe("2026-11-30");
    expect(tagIn("2026-11-30T22:59:00Z", "Pacific/Kiritimati")).toBe("2026-12-01");
    expect(tagIn("2026-11-30T23:01:00Z", "Europe/Berlin")).toBe("2026-12-01");
    for (const z of ["UTC", "Etc/GMT+12"]) expect(tagIn("2026-11-30T23:01:00Z", z), z).toBe("2026-11-30");
    expect(tagIn("2026-11-14T22:58:00Z", "Pacific/Kiritimati")).toBe("2026-11-15");
    expect(tagIn("2026-11-14T23:01:00Z", "Etc/GMT+12")).toBe("2026-11-14");
  });
});

for (const tz of zonen) {
  describe(`Serverprozess TZ=${tz} mit verschobener Serveruhr`, { timeout: 180_000 }, () => {
    const z = ablage(tz.replace(/[^A-Za-z0-9]/g, "_"));
    beforeAll(async () => { await z.anlegen(); }, 60_000);
    afterAll(async () => { await z.abbauen(); }, 60_000);

    it("M: Beginn 23:58 und Ende 00:01 Berlin → Schichttag des Beginns; Beginn 00:01 → neuer Tag", async () => {
      await z.uhr("2026-11-14T22:58:00.000Z", tz);                                  // Sa 14.11. 23:58 Berlin
      const { codes } = await z.betrieb("zeitf-m");
      const a1 = await z.anmelden(codes.a1), a2 = await z.anmelden(codes.a2);
      const b = await z.stempeln(a1, "start");
      expect(b.status, b.roh.slice(0, 200)).toBe(200);
      expect(b.d.datum).toBe("2026-11-14");

      await z.uhr("2026-11-14T23:01:00.000Z", tz);                                  // So 15.11. 00:01 Berlin, gleiche Ablage
      const e = await z.stempeln(a1, "ende");
      expect(e.status, e.roh.slice(0, 200)).toBe(200);
      expect(e.d.datum, "Ende gehört zum Schichttag des Beginns").toBe("2026-11-14");
      const b2 = await z.stempeln(a2, "start");
      expect(b2.status, b2.roh.slice(0, 200)).toBe(200);
      expect(b2.d.datum, "Beginn nach Berliner Mitternacht: neuer Betriebstag").toBe("2026-11-15");

      const m = await z.mandant(a1);
      const st = m.einstempeln["a1|2026-11-14"];
      expect(st).toMatchObject({ start: "23:58", ende: "00:01", endeDatum: "2026-11-15" });
      expect(st.startAm.slice(0, 16), "Ereigniszeitpunkt in UTC").toBe("2026-11-14T22:58");
      expect(st.endeAm.slice(0, 16)).toBe("2026-11-14T23:01");
      expect(m.einstempeln["a1|2026-11-15"]).toBeUndefined();
      const ma2 = await z.mandant(a2);
      expect(Object.keys(ma2.einstempeln || {}).filter((k) => k.startsWith("a2|"))).toEqual(["a2|2026-11-15"]);
      expect(ma2.einstempeln["a2|2026-11-15"].start).toBe("00:01");
    });

    it("F: Frühjahrssprung — Beginn 01:58 MEZ, Ende 03:01 MESZ: drei Minuten, kein Prüffall ZEITUMSTELLUNG", async () => {
      await z.uhr("2026-03-29T00:58:00.000Z", tz);                                  // 01:58 MEZ
      const { codes } = await z.betrieb("zeitf-f");
      const a1 = await z.anmelden(codes.a1);
      const b = await z.stempeln(a1, "start");
      expect([b.status, b.d.datum], b.roh.slice(0, 200)).toEqual([200, "2026-03-29"]);
      await z.uhr("2026-03-29T01:01:00.000Z", tz);                                  // 03:01 MESZ
      const e = await z.stempeln(a1, "ende");
      expect([e.status, e.d.datum], e.roh.slice(0, 200)).toEqual([200, "2026-03-29"]);
      const st = (await z.mandant(a1)).einstempeln["a1|2026-03-29"];
      expect(st).toMatchObject({ start: "01:58", ende: "03:01" });
      expect(st.endeDatum, "kein Kalendertagwechsel").toBeUndefined();
      expect(st.markierungen || [], "kein ZEITUMSTELLUNG-Prüffall (T-DST-F1)").not.toContain("ZEITUMSTELLUNG");
    });

    it("H: Herbstsprung — Beginn 02:58 MESZ, Ende 02:01 MEZ: Schichttag 25.10., Prüffall ZEITUMSTELLUNG", async () => {
      await z.uhr("2026-10-25T00:58:00.000Z", tz);                                  // 02:58 MESZ
      const { codes } = await z.betrieb("zeitf-h");
      const a1 = await z.anmelden(codes.a1);
      const b = await z.stempeln(a1, "start");
      expect([b.status, b.d.datum], b.roh.slice(0, 200)).toEqual([200, "2026-10-25"]);
      await z.uhr("2026-10-25T01:01:00.000Z", tz);                                  // 02:01 MEZ (zweite 02-Uhr-Stunde)
      const e = await z.stempeln(a1, "ende");
      expect([e.status, e.d.datum], e.roh.slice(0, 200)).toEqual([200, "2026-10-25"]);
      const st = (await z.mandant(a1)).einstempeln["a1|2026-10-25"];
      expect(st).toMatchObject({ start: "02:58", ende: "02:01" });
      expect(st.markierungen || [], "Wanduhr mehrdeutig → Prüffall (T-DST-H2)").toContain("ZEITUMSTELLUNG");
    });

    it("A: Monatsabschluss und Raumanlage folgen dem Berliner Tag (23:59 am 30.11. / 00:01 am 01.12.)", async () => {
      await z.uhr("2026-11-30T22:59:00.000Z", tz);                                  // Mo 30.11. 23:59 Berlin
      const { codes } = await z.betrieb("zeitf-a");
      const p1 = await z.anmelden(codes.p1);
      const frueh = await z.anfrage("/api/monatsabschluss", { token: p1, rumpf: { aktion: "abschliessen", monat: "2026-11", trotzPrueffaellen: true } });
      expect(frueh.status, `November vor Berliner Monatsende: ${frueh.roh.slice(0, 200)}`).toBe(422);
      const leerVor = await z.betreiber("zeitf-leer-vor");
      expect((await z.anfrage("/api/bestand-anlegen", { token: leerVor, rumpf: { vorlage: "leer", name: "Leer vor" } })).status).toBe(200);
      const mv = await z.mandant(leerVor);
      expect(mv.seit, "leerer Betrieb um 23:59 Berlin: seit").toBe("2026-11-30");

      await z.uhr("2026-11-30T23:01:00.000Z", tz);                                  // Di 01.12. 00:01 Berlin
      const p1b = await z.anmelden(codes.p1);
      const spaet = await z.anfrage("/api/monatsabschluss", { token: p1b, rumpf: { aktion: "abschliessen", monat: "2026-11", trotzPrueffaellen: true } });
      expect(spaet.status, `November nach Berliner Monatsende: ${spaet.roh.slice(0, 200)}`).toBe(200);
      expect(((await z.mandant(p1b)).monatsabschluss || {})["2026-11"]).toMatchObject({ abgeschlossen: true });
      const dez = await z.anfrage("/api/monatsabschluss", { token: p1b, rumpf: { aktion: "abschliessen", monat: "2026-12", trotzPrueffaellen: true } });
      expect(dez.status, "laufender Monat (Dezember) bleibt offen").toBe(422);
      const leerNach = await z.betreiber("zeitf-leer-nach");
      expect((await z.anfrage("/api/bestand-anlegen", { token: leerNach, rumpf: { vorlage: "leer", name: "Leer nach" } })).status).toBe(200);
      const mn = await z.mandant(leerNach);
      expect(mn.seit, "leerer Betrieb um 00:01 Berlin: seit").toBe("2026-12-01");
    });
  });
}
