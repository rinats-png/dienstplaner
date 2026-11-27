/* ==========================================================================
   K4-P2: Heuristik-Zähler Z-2 — Tests (L3: Migration/Backup/Restore). Nur synthetische Daten und Lockvogel-Namen.

   Prüft: Klassifikation (Mail, Raum, Person), exakte Zahlen gegen den Plan des synthetischen Altbestands (K4-P3,
   geschrieben vom Code des Stands 274bfa0) mit der Leseschicht von 274bfa0 UND der des heutigen Stands, den Ausgabetest
   „kein Wert" (Lockvogel-Namen, -Domänen, -Pfade dürfen nie in die Ausgabe), fail-closed (nie 0 oder sauber, wenn etwas
   nicht gelesen oder eingeordnet werden konnte), nichts geschrieben (Baum-Prüfsumme gleich, Schreibaufrufe werfen,
   kein Schreib-/Netz-Aufruf im Quelltext) und die Grenzen.
   Aufruf: npx vitest run pruefungen/k4-heuristik-zaehler.test.js --maxWorkers=1 --testTimeout=180000
   Voraussetzung: der Produktionsstand 274bfa0 ist als Objekt vorhanden (sonst holt K4-P3 ihn mit git fetch).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dateiname } from "../server/lib/ablage.mjs";
import { REF_PRODUKTION, baumHash, erzeugen, planBauen } from "../werkzeug/synthetischer-altbestand.mjs";
import {
  ALT_SYNTH_RAEUME, GRENZEN, GRUENDE, SEED_RAEUME, TREFFER_KLASSEN, ZAHLEN_KLASSEN, berichtZeilen, lesehuelle, mailKlasse,
  nichtBewertbar, nurZahlen, personMuster, raumMuster, zaehlen, zaehleBetrieb,
} from "../werkzeug/k4-heuristik-zaehler.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(WURZEL, "werkzeug", "k4-heuristik-zaehler.mjs");
const QUELLE = readFileSync(CLI, "utf8");
const KLEIN = { saat: 4711, groesse: 24, tage: 14 };

let T;            // Wegwerfwurzel
let ALT;          // Ablage aus K4-P3 (Code von 274bfa0 geschrieben)
let LAYER_ALT;    // server/lib von 274bfa0
let plan;

const leer = () => Object.fromEntries(ZAHLEN_KLASSEN.map((k) => [k, 0]));
const cli = (/** @type {string[]} */ args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, TZ: "UTC" }, timeout: 120000 });
const json = (/** @type {string} */ stdout) => JSON.parse(stdout.trim().split("\n").pop() || "{}");
const neuerOrdner = (/** @type {string} */ n) => { const d = path.join(T, n); mkdirSync(path.join(d, "centric"), { recursive: true }); return d; };
const ablegen = (/** @type {string} */ wurzel, /** @type {string} */ key, /** @type {any} */ daten, metadata = {}) =>
  writeFileSync(path.join(wurzel, "centric", dateiname(key)), JSON.stringify({ fassung: 1, etag: "e", typ: "json", metadata, daten }));
const altform = (/** @type {string} */ wurzel, /** @type {string} */ raum, /** @type {any[]} */ mandanten) =>
  ablegen(wurzel, `bestand:${raum}`, { version: 9, stand: 0, tarife: [], rechnungen: [], protokoll: [], mandanten });
const person = (/** @type {any} */ o = {}) => ({ id: "p1", vorname: "Testperson", nachname: "X", email: "a@example.invalid", personalnummer: "SEED-1", ...o });
const betrieb = (/** @type {any} */ o = {}) => ({ id: "m1", name: "B", personen: [person()], abwesenheiten: [], abweichungen: {}, erfassung: {}, einstempeln: {}, ...o });
/** Eine Ablage mit einem sauberen Testraum (t-…), Konto mit reservierter Domäne. */
const sauber = (/** @type {string} */ n) => {
  const d = neuerOrdner(n);
  altform(d, "t-sauber", [betrieb()]);
  ablegen(d, "account:h1", { id: "a1", email: "konto@example.invalid", emailNorm: "konto@example.invalid" });
  return d;
};
const grundCodes = (/** @type {any} */ b) => b.gruende.map((/** @type {any} */ g) => g.code);

beforeAll(async () => {
  T = mkdtempSync(path.join(tmpdir(), "k4p2-test-"));
  ALT = path.join(T, "alt");
  await erzeugen({ ausgabe: ALT, ...KLEIN });
  plan = planBauen(KLEIN);
  LAYER_ALT = path.join(T, "layer-alt");
  mkdirSync(LAYER_ALT);
  const git = (/** @type {string[]} */ a) => spawnSync("git", a, { cwd: WURZEL, maxBuffer: 1 << 30, timeout: 120000 });
  if (git(["cat-file", "-e", `${REF_PRODUKTION}^{commit}`]).status !== 0) git(["fetch", "--no-tags", "--depth", "1", "origin", REF_PRODUKTION]);
  const a = git(["archive", "--format=tar", REF_PRODUKTION, "server/lib"]);
  if (a.status !== 0) throw new Error("git archive des Stands 274bfa0 fehlgeschlagen");
  const x = spawnSync("tar", ["-xf", "-"], { cwd: LAYER_ALT, input: a.stdout, maxBuffer: 1 << 30, timeout: 120000 });
  if (x.status !== 0) throw new Error("tar fehlgeschlagen");
}, 600000);

afterAll(() => { if (T) rmSync(T, { recursive: true, force: true }); });

describe("Klassifikation", () => {
  it("Mailklasse: reserviert nur für RFC-2606-Domänen, alles Zweifelhafte ist sonstige", () => {
    for (const m of ["a@example.invalid", "A@Example.INVALID", "x@foo.test", "x@host.localhost", "x@a.b.example", "x@example.com", "x@Example.Org", "x@sub.example.net", " x@example.invalid ", "x@example.invalid."])
      expect(mailKlasse(m), m).toBe("reserviert");
    for (const m of ["a@firma.de", "a@example.de", "a@example.com.evil.de", "a@notexample.com", "a@xexample.org", "a@gmail.com", "kein-at", "a@", "@b.invalid", "a@@b.invalid", "a@b@c.invalid", "a@.invalid", "a@b..invalid", 42, {}, []])
      expect(mailKlasse(m), String(m)).toBe("sonstige");
    for (const m of [undefined, null, "", "   "]) expect(mailKlasse(m)).toBe("keine");
  });
  it("Raummuster: t-, demo-, Seed und die festen Namen des synthetischen Altbestands", () => {
    expect(raumMuster("t-abc")).toEqual({ t: true, demo: false, seed: false, altSynth: false });
    expect(raumMuster("Demo-x").demo).toBe(true);
    expect(raumMuster("pilot-seed-p").seed).toBe(true);
    for (const r of ALT_SYNTH_RAEUME) expect(raumMuster(r).altSynth).toBe(true);
    expect(SEED_RAEUME).toEqual(["pilot-seed-p", "pilot-seed-s"]);
    for (const r of ["firma-x", "alt-pflege-2", "xt-abc", "demo", "pilot-seed-x", "T-abc"]) expect(Object.values(raumMuster(r)).some(Boolean), r).toBe(false);
  });
  it("Personenmuster: Vorname Testperson/Testkonto oder Personalnummer SEED-/SYN-", () => {
    expect(personMuster({ vorname: "Testperson" })).toBe(true);
    expect(personMuster({ vorname: "Testkonto" })).toBe(true);
    expect(personMuster({ vorname: "Erika", personalnummer: "SYN-0001" })).toBe(true);
    expect(personMuster({ vorname: "Erika", personalnummer: "SEED-P1" })).toBe(true);
    expect(personMuster({ vorname: "Erika", personalnummer: "4711" })).toBe(false);
    expect(personMuster({ vorname: "Erika", personalnummer: 123 })).toBe(false);
    expect(personMuster({})).toBe(false);
  });
});

describe("zaehleBetrieb (rein)", () => {
  it("zählt je Klasse und trennt krank von übrigen Abwesenheiten", () => {
    const z = leer();
    zaehleBetrieb(betrieb({
      selbstAngelegt: true,
      personen: [person(), person({ vorname: "Erika", personalnummer: "77", email: "e@firma.de" }), person({ email: undefined })],
      abwesenheiten: [{ art: "krank" }, { art: "urlaub" }, { art: "krank" }],
      krankmeldungen: [{}, {}],
      erfassung: { a: 1, b: 2 }, einstempeln: { a: 1 }, abweichungen: { a: 1, b: 2, c: 3 },
    }), z);
    expect(z).toMatchObject({ betriebe: 1, betriebeSelbstAngelegt: 1, personen: 3, personenSeedMuster: 2, personenOhneMuster: 1,
      personenMailReserviert: 1, personenMailSonstige: 1, personenOhneMail: 1, abwesenheiten: 3, abwesenheitenKrank: 2,
      krankmeldungenFaelle: 2, erfassungstage: 2, stempel: 1, einteilungen: 3 });
  });
  it("fehlende Felder gelten als leer, falsche Formen werfen FORM (nie still 0)", () => {
    const z = leer();
    zaehleBetrieb({}, z);
    expect(z.betriebe).toBe(1);
    for (const kaputt of [null, "x", 5, [], { personen: "x" }, { personen: [null] }, { personen: ["x"] }, { abwesenheiten: {} }, { abwesenheiten: [3] },
      { erfassung: [] }, { einstempeln: "a" }, { abweichungen: 1 }, { krankmeldungen: {} }])
      expect(() => zaehleBetrieb(kaputt, leer()), JSON.stringify(kaputt)).toThrow("FORM");
  });
});

describe("Ausgabeprüfung nurZahlen („kein Wert“)", () => {
  const gut = () => ({ werkzeug: "k4-heuristik-zaehler", fassung: 1, bewertbar: true, ergebnis: "KEINE_TREFFER", lesemodus: "streng", gruende: [], treffer: 0, zahlen: leer() });
  it("lässt den festen Bericht und den Bericht „nicht bewertbar“ durch", () => {
    expect(nurZahlen(gut())).toBe(true);
    expect(nurZahlen(nichtBewertbar([{ code: "RAUM_UNLESBAR", anzahl: 2 }]))).toBe(true);
    for (const g of GRUENDE) expect(nurZahlen(nichtBewertbar([{ code: g, anzahl: 1 }])), g).toBe(true);
  });
  it("weist jeden Wert ab: Namen, Pfade, Domänen, Kennungen, Gleitkomma, negativ, zusätzliche Felder", () => {
    const mut = (/** @type {(b: any) => void} */ f) => { const b = gut(); f(b); return b; };
    for (const b of [
      mut((x) => { x.zahlen.raeume = "Lockvogel-Raum"; }),
      mut((x) => { x.zahlen.personen = 1.5; }),
      mut((x) => { x.zahlen.personen = -1; }),
      mut((x) => { x.zahlen.personen = 2e9; }),
      mut((x) => { x.zahlen.personen = null; }),
      mut((x) => { x.zahlen.extra = 1; }),
      mut((x) => { delete x.zahlen.raeume; }),
      mut((x) => { x.name = "Erika"; }),
      mut((x) => { x.ergebnis = "sauber"; }),
      mut((x) => { x.ergebnis = "C:/Users/privat"; }),
      mut((x) => { x.lesemodus = "firma.de"; }),
      mut((x) => { x.gruende = [{ code: "RAUM_UNLESBAR", anzahl: 1, raum: "x" }]; }),
      mut((x) => { x.gruende = [{ code: "Raum Erika", anzahl: 1 }]; }),
      mut((x) => { x.treffer = "0"; }),
      mut((x) => { x.bewertbar = "ja"; }),
      null, "text", [], 5,
    ]) expect(nurZahlen(b), JSON.stringify(b)).toBe(false);
  });
  it("berichtZeilen ersetzt einen unzulässigen Bericht durch NICHT_BEWERTBAR ohne den Wert", () => {
    const b = gut(); b.zahlen.raeume = /** @type {any} */ ("Lockvogel-Raum");
    const text = berichtZeilen(b).join("\n");
    expect(text).not.toContain("Lockvogel");
    expect(text).toContain("NICHT_BEWERTBAR");
    expect(text).toContain("AUSGABE_UNZULAESSIG");
  });
  it("Bericht „nicht bewertbar“: alle Zahlen null, treffer null, nie 0", () => {
    const b = nichtBewertbar([{ code: "ABLAGE_LEER", anzahl: 1 }]);
    expect(b).toMatchObject({ bewertbar: false, ergebnis: "NICHT_BEWERTBAR", zahlen: null, treffer: null });
    const text = berichtZeilen(b).join("\n");
    expect(text).not.toMatch(/KEINE_TREFFER/);
    expect(text).not.toMatch(/: 0\b/);
  });
});

describe("Zahlen gegen den Plan des synthetischen Altbestands (Stand 274bfa0), beide Leseschichten", () => {
  const erwartet = () => {
    const bs = plan.raeume.flatMap((/** @type {any} */ r) => r.betriebe);
    const abw = bs.flatMap((/** @type {any} */ b) => b.abwesenheiten);
    return { raeume: plan.raeume.length, betriebe: bs.length, personen: bs.reduce((s, b) => s + b.personen.length, 0), abwesenheiten: abw.length,
      abwesenheitenKrank: abw.filter((/** @type {any} */ a) => a.art === "krank").length, stempel: bs.reduce((s, b) => s + Object.keys(b.einstempeln).length, 0),
      erfassungstage: bs.reduce((s, b) => s + Object.keys(b.erfassung).length, 0), einteilungen: bs.reduce((s, b) => s + b.einteilungen.length, 0),
      konten: plan.konten.length, schluesselZugangscode: plan.codes.length, schluesselKonto: plan.konten.length,
      raeumeAltform: plan.raeume.filter((/** @type {any} */ r) => r.form === "alt").length };
  };
  it("mit der Leseschicht von 274bfa0 (nur bestandLesen): lesemodus einfach, Zahlen stimmen", async () => {
    const b = await zaehlen({ ablage: ALT, leseschicht: LAYER_ALT });
    expect(b.bewertbar, JSON.stringify(b.gruende)).toBe(true);
    expect(b.lesemodus).toBe("einfach");
    expect(b.zahlen).toMatchObject(erwartet());
    expect(b.zahlen).toMatchObject({ raeumeAltSynth: 6, raeumeOhneMuster: 0, personenOhneMuster: 0, personenMailSonstige: 0, kontenMailSonstige: 0,
      personenSeedMuster: erwartet().personen, personenMailReserviert: erwartet().personen, kontenMailReserviert: plan.konten.length });
    expect(nurZahlen(b)).toBe(true);
  });
  it("mit der Leseschicht des heutigen Stands (bestandLesenStreng): gleiche Zahlen", async () => {
    const a = await zaehlen({ ablage: ALT, leseschicht: LAYER_ALT });
    const h = await zaehlen({ ablage: ALT });
    expect(h.lesemodus).toBe("streng");
    expect(h.zahlen).toEqual(a.zahlen);
    expect(h.treffer).toBe(a.treffer);
  });
  it("krank ist ein Treffer (Entwurf S1): TREFFER, treffer = Summe der Trefferklassen", async () => {
    const b = await zaehlen({ ablage: ALT });
    expect(b.ergebnis).toBe("TREFFER");
    expect(b.treffer).toBe(TREFFER_KLASSEN.reduce((s, k) => s + b.zahlen[k], 0));
    expect(b.zahlen.abwesenheitenKrank).toBeGreaterThan(0);
  });
  it("Kommandozeile: Exit 0, feste Zeilenform, JSON-Zeile gleich dem Bericht, wiederholbar (gleiche Ausgabe)", async () => {
    const r1 = cli(["zaehlen", ALT, "--leseschicht", LAYER_ALT]);
    const r2 = cli(["zaehlen", ALT, "--leseschicht", LAYER_ALT]);
    expect(r1.status, r1.stderr).toBe(0);
    expect(r1.stdout).toBe(r2.stdout);
    expect(r1.stderr).toBe("");
    expect(r1.stdout.split("\n").length).toBeLessThanOrEqual(60);
    expect(Buffer.byteLength(r1.stdout)).toBeLessThanOrEqual(GRENZEN.maxAusgabeBytes);
    expect(json(r1.stdout)).toEqual(JSON.parse(JSON.stringify(await zaehlen({ ablage: ALT, leseschicht: LAYER_ALT }))));
    expect(r1.stdout).not.toContain(ALT.replace(/\\/g, "/"));
    expect(r1.stdout).not.toContain("Ablage: Dateien unter");
  });
});

describe("Ausgabetest „kein Wert“: Lockvogel in Daten und Pfad kommt nie in die Ausgabe", () => {
  it("Namen, Domänen, Mails, Personalnummern, Notizen, Raumnamen, Ablagepfad", () => {
    const d = neuerOrdner("lockvogel-pfad-QQQ");
    altform(d, "Lockvogel-Raum-Mustermann", [betrieb({
      id: "LockvogelBetriebId", name: "Lockvogel GmbH Musterstadt", kontakt: "chef@lockvogel-firma.de",
      personen: [person({ vorname: "Erika", nachname: "Lockvogelfrau", email: "erika.lockvogel@firma-lockvogel.example.de", personalnummer: "9988776655" }),
        person({ vorname: "Hans", nachname: "Lockvogelmann", email: "hans@lockvogel.de", personalnummer: "55443322" })],
      abwesenheiten: [{ id: "abw-Lockvogel", personId: "p1", art: "krank", von: "2026-01-01", bis: "2026-01-02", notiz: "Lockvogel-Diagnose Grippe" }],
      krankmeldungen: [{ id: "km-Lockvogel", notiz: "Lockvogel-Notiz" }],
      erfassung: { "p1|2026-01-01": { start: "06:00" } }, einstempeln: { "Lockvogel-Schluessel": {} }, abweichungen: { "Lockvogel-Tag": "F" },
    })]);
    ablegen(d, "account:lockvogelhash", { id: "LockvogelAccount", email: "Max.Lockvogel@kunde-lockvogel.de", emailNorm: "max.lockvogel@kunde-lockvogel.de" });
    ablegen(d, "konto:p1:lockvogelcode", { name: "Lockvogel Name", rolle: "leitung" });
    ablegen(d, "protokoll:Lockvogel", { text: "Lockvogel-Protokoll" });
    const r = cli(["zaehlen", d]);
    expect(r.status, r.stderr).toBe(0);
    const alles = r.stdout + r.stderr;
    for (const w of ["ockvogel", "Erika", "Hans", "Mustermann", "firma", "kunde", "9988776655", "55443322", "Grippe", "Diagnose", "QQQ", "tmp", "Temp", "k4p2-test", "@", "\\", "C:/"])
      expect(alles, w).not.toContain(w);
    const b = json(r.stdout);
    expect(b).toMatchObject({ bewertbar: true, ergebnis: "TREFFER" });
    expect(b.zahlen).toMatchObject({ raeume: 1, raeumeOhneMuster: 1, personen: 2, personenOhneMuster: 2, personenSeedMuster: 0, personenMailSonstige: 2, betriebeMailSonstige: 1,
      abwesenheiten: 1, abwesenheitenKrank: 1, krankmeldungenFaelle: 1, erfassungstage: 1, stempel: 1, einteilungen: 1,
      konten: 1, kontenMailSonstige: 1, schluesselZugangscode: 1, schluesselUebrige: 1 });
    expect(nurZahlen(b)).toBe(true);
  });
  it("Fehlerfall: auch dann kein Pfad, keine Fehlermeldung im Wortlaut", () => {
    const d = neuerOrdner("fehler-pfad-QQQ");
    writeFileSync(path.join(d, "centric", dateiname("bestand:Lockvogel-Raum")), "{ Lockvogel kaputt");
    const r = cli(["zaehlen", d]);
    const alles = r.stdout + r.stderr;
    expect(r.status).toBe(1);
    for (const w of ["ockvogel", "QQQ", "k4p2-test", "Umschlag", "beschädigt", "JSON", "C:/", "\\"]) expect(alles, w).not.toContain(w);
    expect(grundCodes(json(r.stdout))).toContain("RAUM_UNLESBAR");
  });
  it("Aufrufdruck zeigt nur die feste Kurzhilfe (kein Echo der Argumente)", () => {
    const r = cli(["zaehlen", "--Lockvogel"]);
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).not.toContain("Lockvogel");
  });
});

describe("KEINE_TREFFER nur, wenn alles lesbar und ohne Hinweis", () => {
  it("sauberer Testraum: bewertbar, KEINE_TREFFER, treffer 0, mit dem Hinweis, dass das kein Nachweis ist", () => {
    const r = cli(["zaehlen", sauber("sauber")]);
    expect(r.status, r.stderr).toBe(0);
    const b = json(r.stdout);
    expect(b).toMatchObject({ bewertbar: true, ergebnis: "KEINE_TREFFER", treffer: 0 });
    expect(b.zahlen).toMatchObject({ raeume: 1, raeumeT: 1, raeumeOhneMuster: 0, personen: 1, konten: 1, kontenMailReserviert: 1 });
    expect(r.stdout).toContain("KEIN Nachweis");
  });
  it.each([
    ["Raum ohne Testmuster", (/** @type {string} */ d) => altform(d, "firma-x", [betrieb()])],
    ["Person ohne Testmuster", (/** @type {string} */ d) => altform(d, "t-b", [betrieb({ personen: [person({ vorname: "Erika", personalnummer: "17" })] })])],
    ["Person mit sonstiger Mail", (/** @type {string} */ d) => altform(d, "t-b", [betrieb({ personen: [person({ email: "x@firma.de" })] })])],
    ["Konto mit sonstiger Mail", (/** @type {string} */ d) => ablegen(d, "account:h2", { email: "x@firma.de", emailNorm: "x@firma.de" })],
    ["Konto: nur emailNorm sonstige", (/** @type {string} */ d) => ablegen(d, "account:h2", { email: "x@example.invalid", emailNorm: "x@firma.de" })],
    ["krank", (/** @type {string} */ d) => altform(d, "t-b", [betrieb({ abwesenheiten: [{ art: "krank" }] })])],
    ["Krankmeldungsfall", (/** @type {string} */ d) => altform(d, "t-b", [betrieb({ krankmeldungen: [{}] })])],
  ])("%s → TREFFER", (_n, aendern) => {
    const d = sauber("treffer");
    aendern(d);
    const b = json(cli(["zaehlen", d]).stdout);
    expect(b).toMatchObject({ bewertbar: true, ergebnis: "TREFFER" });
    expect(b.treffer).toBeGreaterThan(0);
  });
  it("demo- und t-Räume werden nur gezählt (Entwurf F5), selbst ohne Treffer", async () => {
    const d = sauber("demo");
    altform(d, "demo-x", [betrieb()]);
    const b = await zaehlen({ ablage: d });
    expect(b).toMatchObject({ ergebnis: "KEINE_TREFFER" });
    expect(b.zahlen).toMatchObject({ raeume: 2, raeumeT: 1, raeumeDemo: 1 });
  });
});

describe("fail-closed: NICHT_BEWERTBAR, nie 0 oder sauber", () => {
  const nicht = (/** @type {any} */ b, /** @type {string} */ code) => {
    expect(b.bewertbar).toBe(false);
    expect(b.ergebnis).toBe("NICHT_BEWERTBAR");
    expect(b.zahlen).toBeNull();
    expect(b.treffer).toBeNull();
    expect(grundCodes(b)).toContain(code);
    expect(nurZahlen(b)).toBe(true);
  };
  it("Ablage fehlt, ist kein Ordner oder hat keinen Store", async () => {
    nicht(await zaehlen({ ablage: path.join(T, "gibt-es-nicht") }), "ABLAGE_FEHLT");
    nicht(await zaehlen({ ablage: path.join(T, "alt", "centric", readdirSync(path.join(ALT, "centric"))[0]) }), "ABLAGE_FEHLT");
    const ohne = path.join(T, "ohne-store"); mkdirSync(ohne);
    nicht(await zaehlen({ ablage: ohne }), "ABLAGE_FEHLT");
    nicht(await zaehlen({ ablage: /** @type {any} */ (undefined) }), "ABLAGE_FEHLT");
    nicht(await zaehlen({ ablage: "" }), "ABLAGE_FEHLT");
  });
  it("leerer Store (falscher Pfad sähe genauso aus): ABLAGE_LEER, nicht 0", async () => {
    nicht(await zaehlen({ ablage: neuerOrdner("leer") }), "ABLAGE_LEER");
  });
  it("Exit 1 und kein Zahlenblock in der Kommandozeile", () => {
    const r = cli(["zaehlen", neuerOrdner("leer2")]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("NICHT_BEWERTBAR");
    expect(r.stdout).not.toContain("KEINE_TREFFER");
    expect(r.stdout).not.toMatch(/^\s+raeume: /m);
  });
  it("unlesbare Scherbe: die einfache Leseschicht von 274bfa0 übergeht sie still, Z-2 nicht", async () => {
    const d = path.join(T, "scherbe-kaputt");
    cpSync(ALT, d, { recursive: true });
    const scherbe = readdirSync(path.join(d, "centric")).find((n) => n.startsWith("scherbe%3A"));
    writeFileSync(path.join(d, "centric", scherbe), "{ kaputt");
    nicht(await zaehlen({ ablage: d, leseschicht: LAYER_ALT }), "RAUM_UNLESBAR");
    nicht(await zaehlen({ ablage: d }), "RAUM_UNLESBAR");
  });
  it("unlesbarer Kern: nicht „Raum gibt es nicht“", async () => {
    const d = path.join(T, "kern-kaputt");
    cpSync(ALT, d, { recursive: true });
    const kern = readdirSync(path.join(d, "centric")).find((n) => n.startsWith("kern%3Aalt-pflege"));
    writeFileSync(path.join(d, "centric", kern), "{ kaputt");
    nicht(await zaehlen({ ablage: d, leseschicht: LAYER_ALT }), "RAUM_UNLESBAR");
  });
  it("Scherbe ohne Kern, Kern und Altform zugleich, offenes Journal, unlesbares Konto, falsche Schlüsselform", async () => {
    let d = path.join(T, "scherbe-ohne-kern");
    cpSync(ALT, d, { recursive: true });
    unlinkSync(path.join(d, "centric", readdirSync(path.join(d, "centric")).find((n) => n.startsWith("kern%3Aalt-pflege"))));
    nicht(await zaehlen({ ablage: d }), "SCHERBE_OHNE_KERN");

    d = path.join(T, "doppelt");
    cpSync(ALT, d, { recursive: true });
    altform(d, "alt-pflege", [betrieb()]);
    nicht(await zaehlen({ ablage: d }), "RAUM_DOPPELT");

    d = sauber("journal");
    ablegen(d, "journal:t-sauber", { id: "j" });
    nicht(await zaehlen({ ablage: d }), "JOURNAL_OFFEN");

    d = sauber("konto-kaputt");
    writeFileSync(path.join(d, "centric", dateiname("account:h9")), "kein json");
    nicht(await zaehlen({ ablage: d }), "KONTO_UNLESBAR");

    d = sauber("konto-kein-objekt");
    ablegen(d, "account:h9", "text");
    nicht(await zaehlen({ ablage: d }), "KONTO_UNLESBAR");

    d = sauber("schluesselform");
    ablegen(d, "scherbe:t-sauber:nur-zwei", {});
    nicht(await zaehlen({ ablage: d }), "SCHLUESSEL_FORM");
  });
  it("unerwartete Form im Bestand: mandanten fehlt, falscher Typ, kaputter Betrieb", async () => {
    let d = neuerOrdner("form1");
    ablegen(d, "bestand:t-a", { version: 9 });
    nicht(await zaehlen({ ablage: d }), "RAUM_FORM_UNERWARTET");
    d = neuerOrdner("form2");
    ablegen(d, "bestand:t-a", { version: 9, mandanten: "x" });
    nicht(await zaehlen({ ablage: d }), "RAUM_FORM_UNERWARTET");
    d = neuerOrdner("form3");
    altform(d, "t-a", [betrieb({ personen: "viele" })]);
    nicht(await zaehlen({ ablage: d }), "RAUM_FORM_UNERWARTET");
    d = neuerOrdner("form4");
    ablegen(d, "bestand:t-a", null);
    nicht(await zaehlen({ ablage: d }), "RAUM_UNLESBAR");
  });
  it("Ein schlechter Raum macht alles nicht bewertbar, auch wenn die anderen lesbar sind", async () => {
    const d = sauber("gemischt");
    altform(d, "t-gut2", [betrieb()]);
    writeFileSync(path.join(d, "centric", dateiname("bestand:t-schlecht")), "x");
    const b = await zaehlen({ ablage: d });
    nicht(b, "RAUM_UNLESBAR");
    expect(b.gruende.find((/** @type {any} */ g) => g.code === "RAUM_UNLESBAR").anzahl).toBe(1);
  });
  it("Leseschicht fehlt oder ist unbrauchbar", async () => {
    nicht(await zaehlen({ ablage: sauber("ls1"), leseschicht: path.join(T, "gibt-es-nicht") }), "LESESCHICHT_FEHLT");
    const fake = path.join(T, "fake-leer"); mkdirSync(path.join(fake, "server", "lib"), { recursive: true });
    writeFileSync(path.join(fake, "server", "lib", "ablage.mjs"), "export const nichts = 1;\n");
    writeFileSync(path.join(fake, "server", "lib", "bestand.mjs"), "export const nichts = 1;\n");
    nicht(await zaehlen({ ablage: sauber("ls2"), leseschicht: fake }), "LESESCHICHT_UNBRAUCHBAR");
    const fake2 = path.join(T, "fake-wirft"); mkdirSync(path.join(fake2, "server", "lib"), { recursive: true });
    writeFileSync(path.join(fake2, "server", "lib", "ablage.mjs"), "export const getStore = () => { throw new Error('Lockvogel'); };\n");
    writeFileSync(path.join(fake2, "server", "lib", "bestand.mjs"), "export const bestandLesen = async () => null;\n");
    nicht(await zaehlen({ ablage: sauber("ls3"), leseschicht: fake2 }), "LESESCHICHT_UNBRAUCHBAR");
  });
  it("Grenzen: zu viele Schlüssel, zu viele Räume, Zeitgrenze, hängender Lesevorgang", async () => {
    nicht(await zaehlen({ ablage: sauber("g1"), grenzen: { maxSchluessel: 1 } }), "ZU_VIELE_SCHLUESSEL");
    nicht(await zaehlen({ ablage: sauber("g2"), grenzen: { maxRaeume: 0 } }), "ZU_VIELE_RAEUME");
    nicht(await zaehlen({ ablage: sauber("g3"), grenzen: { zeitMs: 0 } }), "ZEITGRENZE");
    const fake = path.join(T, "fake-haengt"); mkdirSync(path.join(fake, "server", "lib"), { recursive: true });
    writeFileSync(path.join(fake, "server", "lib", "ablage.mjs"),
      "export const getStore = () => ({ list: async () => ({ blobs: [{ key: 'bestand:t-x' }] }), getWithMetadata: async () => ({ data: {}, metadata: {} }), get: async () => ({}), getMetadata: async () => null });\n");
    writeFileSync(path.join(fake, "server", "lib", "bestand.mjs"), "export const bestandLesen = () => new Promise(() => {});\n");
    nicht(await zaehlen({ ablage: sauber("g4"), leseschicht: fake, grenzen: { leseMs: 50 } }), "RAUM_UNLESBAR");
  });
  it("Aufruf: ohne Befehl, ohne Ablage, unbekannte Option, doppelte Option → Exit 2", () => {
    for (const a of [[], ["zaehlen"], ["zaehlen", "--leseschicht"], ["zaehlen", ALT, "--x"], ["zaehlen", ALT, "--leseschicht"], ["zaehlen", ALT, "--leseschicht", "a", "b"],
      ["anders", ALT], ["zaehlen", ALT, "--leseschicht", "--x"]])
      expect(cli(a).status, a.join(" ")).toBe(2);
  });
});

describe("nur lesend, kein Netz, keine Löschung", () => {
  it("Baum-Prüfsumme und Dateiliste der Ablage vor und nach dem Zählen gleich (beide Leseschichten, auch bei Fehler)", async () => {
    const liste = (/** @type {string} */ d) => readdirSync(path.join(d, "centric")).map((n) => `${n}:${statSync(path.join(d, "centric", n)).mtimeMs}`).join("|");
    const vorher = baumHash(ALT), l0 = liste(ALT);
    await zaehlen({ ablage: ALT, leseschicht: LAYER_ALT });
    await zaehlen({ ablage: ALT });
    cli(["zaehlen", ALT]);
    expect(baumHash(ALT)).toBe(vorher);
    expect(liste(ALT)).toBe(l0);
    const d = path.join(T, "ro-kaputt");
    cpSync(ALT, d, { recursive: true });
    const kern = readdirSync(path.join(d, "centric")).find((n) => n.startsWith("kern%3Aalt-pflege"));
    writeFileSync(path.join(d, "centric", kern), "{ kaputt");
    const v2 = baumHash(d), l2 = liste(d);
    await zaehlen({ ablage: d });
    expect(baumHash(d)).toBe(v2);
    expect(liste(d)).toBe(l2);
    expect(existsSync(path.join(d, "centric", kern))).toBe(true);
  });
  it("Schreibaufrufe der Leseschicht werfen; nichts erreicht den darunterliegenden Store", async () => {
    const marke = path.join(T, "SCHREIBVERSUCH");
    const fake = path.join(T, "fake-schreibt"); mkdirSync(path.join(fake, "server", "lib"), { recursive: true });
    writeFileSync(path.join(fake, "server", "lib", "ablage.mjs"), [
      "import { writeFileSync } from 'node:fs';",
      `const m = ${JSON.stringify(marke)};`,
      "const schreib = async () => { writeFileSync(m, 'x'); };",
      "export const getStore = () => ({ list: async () => ({ blobs: [{ key: 'bestand:t-x' }] }), getWithMetadata: async () => ({ data: { mandanten: [] }, metadata: {} }),",
      "  get: async () => ({}), getMetadata: async () => null, set: schreib, setJSON: schreib, delete: schreib });",
    ].join("\n"));
    writeFileSync(path.join(fake, "server", "lib", "bestand.mjs"), [
      "export const bestandLesen = async (store) => { await store.setJSON('x', {}); return { bestand: { mandanten: [] } }; };",
    ].join("\n"));
    const b = await zaehlen({ ablage: sauber("schreibt"), leseschicht: fake });
    expect(b.bewertbar).toBe(false);
    expect(grundCodes(b)).toContain("RAUM_UNLESBAR");
    expect(existsSync(marke)).toBe(false);
    for (const f of ["set", "setJSON", "delete"]) expect(() => lesehuelle({}) [f]()).toThrow("SCHREIBEN_VERBOTEN");
    expect(Object.keys(lesehuelle({})).sort()).toEqual(["delete", "get", "getMetadata", "getWithMetadata", "list", "set", "setJSON"]);
  });
  it("die Umgebung wird nach dem Lauf zurückgenommen", async () => {
    const vorher = { d: process.env.CENTRIC_DATEN, a: process.env.CENTRIC_ABLAGE, l: console.log };
    await zaehlen({ ablage: ALT });
    await zaehlen({ ablage: path.join(T, "gibt-es-nicht") });
    expect(process.env.CENTRIC_DATEN).toBe(vorher.d);
    expect(process.env.CENTRIC_ABLAGE).toBe(vorher.a);
    expect(console.log).toBe(vorher.l);
  });
  it("Quelltext: keine Schreib-, Lösch-, Prozess- oder Netzfunktion, kein Zugriff auf Store-Schreibmethoden", () => {
    const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const muster of [/writeFile/, /appendFile/, /unlink/, /\brmSync\b|\brm\(/, /\bmkdir/, /\brename/, /copyFile/, /createWriteStream/, /truncate/, /\bchmod/, /symlink/,
      /child_process/, /\bspawn|(^|[^.\w])exec(File)?\(|\bfork\(/, /node:(http|https|net|tls|dgram|dns|worker_threads|cluster)/, /\bfetch\(/, /WebSocket|XMLHttpRequest/,
      /store\.(set|setJSON|delete)\b/, /process\.exit\(\s*[^a-z1]/i])
      expect(code, String(muster)).not.toMatch(muster);
    expect(code).toMatch(/import \{ lstatSync \} from "node:fs";/);
    expect(code).not.toMatch(/readFile|readdir|createReadStream/);
  });
});

describe("Selbststart (/starten): echter Betrieb im t--Raum ist nie KEINE_TREFFER (Review B-1)", () => {
  const NAME = "Muellermann Pflegedienst GmbH", MAIL = "inhaber@muellermann-pflege.de";
  /** Legt mit der Provisionierung der gegebenen Schicht einen Selbststart an (t--Raum, Betriebsname, Inhaber-Mail, keine Personen). */
  const selbststart = async (/** @type {string} */ schicht, /** @type {string} */ n, /** @type {string} */ mail, /** @type {boolean} */ liste) => {
    const d = neuerOrdner(n);
    const vorher = { d: process.env.CENTRIC_DATEN, a: process.env.CENTRIC_ABLAGE };
    process.env.CENTRIC_DATEN = d; process.env.CENTRIC_ABLAGE = "dateien";
    try {
      const imp = (/** @type {string} */ p) => import(pathToFileURL(path.join(schicht, p)).href);
      const { getStore } = await imp("server/lib/ablage.mjs");
      const { testbetriebAnlegen } = await imp("server/lib/provisionierung.mjs");
      const store = getStore({ name: "centric", consistency: "strong" });
      const r = await testbetriebAnlegen(store, { name: NAME, branche: "pflege", email: mail, land: "HE", durch: "Selbststart" });
      expect(r.ok).toBe(true);
      expect(r.raum.startsWith("t-")).toBe(true);
      if (liste) await store.setJSON("selbststarts", [{ raum: r.raum, name: NAME, email: mail, zugaenge: 4 }]);
    } finally {
      if (vorher.d === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = vorher.d;
      if (vorher.a === undefined) delete process.env.CENTRIC_ABLAGE; else process.env.CENTRIC_ABLAGE = vorher.a;
    }
    return d;
  };
  for (const [titel, schicht, kz] of [["Schicht von 274bfa0", () => LAYER_ALT, "a"], ["Schicht des Kopfes", () => WURZEL, "k"]]) {
    it(`${titel}: echte Kontaktmail → TREFFER (mit und ohne Liste selbststarts), nie Name oder Mail in der Ausgabe`, async () => {
      for (const liste of [false, true]) {
        const d = await selbststart(schicht(), `selbst-${kz}-${liste}`, MAIL, liste);
        for (const lese of [LAYER_ALT, WURZEL]) {
          const b = await zaehlen({ ablage: d, leseschicht: lese });
          expect(b.bewertbar, JSON.stringify(b.gruende)).toBe(true);
          expect(b.ergebnis).toBe("TREFFER");
          expect(b.zahlen).toMatchObject({ raeume: 1, raeumeT: 1, raeumeTAuffaellig: 1, betriebe: 1, betriebeMailSonstige: 1, personen: 0, selbststartEintraege: liste ? 1 : 0 });
        }
        const r = cli(["zaehlen", d]);
        expect(r.status).toBe(0);
        for (const w of ["uellermann", "inhaber", "pflege.de", "@"]) expect(r.stdout + r.stderr, w).not.toContain(w);
      }
    });
    it(`${titel}: reservierte Kontaktmail ohne Liste → KEINE_TREFFER; mit Eintrag in selbststarts → TREFFER`, async () => {
      const d = await selbststart(schicht(), `selbst-res-${kz}`, "inhaber@example.invalid", false);
      expect(await zaehlen({ ablage: d })).toMatchObject({ ergebnis: "KEINE_TREFFER", zahlen: { raeumeT: 1, raeumeTAuffaellig: 0, betriebeMailReserviert: 1, selbststartEintraege: 0 } });
      const e = await selbststart(schicht(), `selbst-res2-${kz}`, "inhaber@example.invalid", true);
      expect(await zaehlen({ ablage: e })).toMatchObject({ ergebnis: "TREFFER", zahlen: { raeumeTAuffaellig: 0, selbststartEintraege: 1 } });
    });
  }
  it("Betriebsfeld email zählt wie kontakt; fehlende Adresse ist keine; Rückgabe von zaehleBetrieb", () => {
    expect(zaehleBetrieb(betrieb({ kontakt: "a@example.invalid" }), leer())).toBe("reserviert");
    expect(zaehleBetrieb(betrieb({ kontakt: "a@example.invalid", email: "b@firma.de" }), leer())).toBe("sonstige");
    expect(zaehleBetrieb(betrieb({ kontakt: "" }), leer())).toBe("keine");
    expect(zaehleBetrieb(betrieb({ kontakt: 5 }), leer())).toBe("sonstige");
  });
  it("selbststarts unlesbar oder keine Liste → NICHT_BEWERTBAR", async () => {
    let d = sauber("ss1");
    writeFileSync(path.join(d, "centric", dateiname("selbststarts")), "kein json");
    expect(grundCodes(await zaehlen({ ablage: d }))).toContain("SELBSTSTARTS_UNLESBAR");
    d = sauber("ss2");
    ablegen(d, "selbststarts", { raum: "x" });
    expect(grundCodes(await zaehlen({ ablage: d }))).toContain("SELBSTSTARTS_UNLESBAR");
  });
});

describe("Meldungen der fremden Leseschicht (Review C-1)", () => {
  it("Lesefrist unter den 30 s der Raumsperre", () => { expect(GRENZEN.leseMs).toBeLessThan(30000); });
  it("console.error/warn/info/debug der Schicht und ein später Fehler gelangen nie in die Ausgabe", () => {
    const fake = path.join(T, "fake-laut"); mkdirSync(path.join(fake, "server", "lib"), { recursive: true });
    writeFileSync(path.join(fake, "server", "lib", "ablage.mjs"), [
      "export const getStore = () => { console.error('Lockvogel-Raum err'); console.warn('Lockvogel warn'); console.info('Lockvogel info'); console.debug('Lockvogel dbg');",
      "  return { list: async () => ({ blobs: [{ key: 'bestand:t-x' }] }), getWithMetadata: async () => ({ data: {}, metadata: {} }), get: async () => ({}), getMetadata: async () => null }; };",
    ].join("\n"));
    writeFileSync(path.join(fake, "server", "lib", "bestand.mjs"), [
      "export const bestandLesen = async () => { console.error('Lockvogel-Raum gesperrt'); setTimeout(() => { throw new Error('Lockvogel-Stack'); }, 10);",
      "  await new Promise((r) => setTimeout(r, 400)); return { bestand: { mandanten: [] } }; };",
    ].join("\n"));
    const r = cli(["zaehlen", sauber("laut"), "--leseschicht", fake]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("LESEFEHLER");
    expect(r.stdout + r.stderr).not.toContain("Lockvogel");
    expect(r.stderr).toBe("");
  });
});
