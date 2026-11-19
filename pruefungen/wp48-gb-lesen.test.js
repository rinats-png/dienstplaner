/* ==========================================================================
   WP-48-GB, Nachtrag — Lesen ändert den Stand nicht (Lese- und Ladewege)

   PR #271 hat die beiden Schreibwege beim bloßen Öffnen behoben (Tour-
   Selbststart, Urlaubshinweis-Konflikt; pruefungen/wp48-gb-oeffnen.test.js).
   Diese Prüfung schließt, was dort nicht geprüft war:

     G  GET /api/bestand ist reines Lesen: der gespeicherte Datensatz (Inhalt,
        Stand, Zeit, Urheber, Epoche) und die Dateien des Raums sind nach
        beliebig vielen Lesevorgängen aller Rollen byte-gleich — auch wenn die
        Antwort angeglichen wird (personenAngleichen: nur in der Antwort).
        Die Oberfläche schreibt danach nichts zurück (Abbild = geladenes).
     M  Die Migration beim Laden (Bestand älterer Fassung) ist der einzige
        Schreibvorgang beim Öffnen, den es geben MUSS. Zwei Sitzungen öffnen
        gleichzeitig einen Bestand der Fassung 8:
          M1 Reproduktion (alter Ablauf, ohne Konfliktbehandlung): die zweite
             Migration bekommt 409, speicher.js übernimmt nur den ETag, nicht
             den Inhalt — die nächste Eingabe dieser Sitzung überschreibt
             still eine fremde Änderung (verlorene Änderung, ohne Dialog).
          M2 Neu: der Konflikt einer reinen Migration wird still aufgelöst
             (Stand des Servers übernommen, kein Dialog); die fremde Änderung
             bleibt erhalten, die eigene Eingabe geht danach normal durch.
          M3 Betriebsrat (Schreibumfang „nein") schreibt die Migration nicht
             zurück (vorher: PUT ohne Eingabe, Absage 403).
          M4 Hat die Person zwischen Migration und Absage etwas geändert, bleibt
             es beim Konfliktdialog.
     D  Differenz: eine echte Eingabe nach dem Öffnen speichert wie bisher.
     V  Verdrahtung in App.jsx (Mutanten: Zurückschreiben ohne Rollenprüfung,
        Migration ohne Konfliktbehandlung → rot).

   Aufruf: npx vitest run pruefungen/wp48-gb-lesen.test.js --maxWorkers=1
   ========================================================================== */
// zeit-ok: keine Uhr der Prüfung; der echte Handler setzt Sitzungs- und Speicherzeiten selbst, verglichen wird nur, ob sie sich beim Lesen ändern.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abbildVon, schreibAbbild, migrationZurueckschreiben, migrationKonflikt } from "../src/app/oeffnen.js";
import { migriere } from "../src/migration.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen;
let raumNr = 0, RAUM = "";

let nr = 0;
let puts = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  if (methode === "PUT" && pfad === "/api/bestand") puts += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.15.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit === "ALLE" ? "e1" : einheit }], qualifikationen: [], ...mehr });

const ROLLEN = {
  PL: { rolle: "planer", person: "p1" },
  LT: { rolle: "leitung", person: "l1" },
  BR: { rolle: "betriebsrat", person: "b1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};
const TOKEN = {};

/** Fassung 9 (aktuell) oder 8 (älter: Branchenkennung „industrie" wird beim Laden zu „produktion"). */
const bestand = ({ version = 9, altPerson = false } = {}) => ({ version, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", branche: version < 9 ? "industrie" : "produktion",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1", altPerson ? { qualifikationen: null } : {}),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("b1", "betriebsrat", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum(art) {
  RAUM = `wp48-gb-lesen-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(art), { durch: "Prüfung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
  puts = 0;
}

/** Alle Dateien unter der Datenwurzel (Pfad relativ zur Wurzel, mit „/“), mit Inhalt (byte-genau). */
async function alleDateien() {
  const aus = new Map();
  const gehe = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await gehe(p);
      else aus.set(path.relative(wurzel, p).split(path.sep).join("/"), (await readFile(p)).toString("base64"));
    }
  };
  await gehe(wurzel);
  return aus;
}
/** Die Dateien, deren Pfad UNTER der Wurzel den Raum nennt. Geprüft wird der relative Pfad, nie der absolute:
    Die Wurzel (mkdtemp „centric-wp48-gb-lesen-XXXXXX“) kann den Raumnamen selbst enthalten — Zufallsendung „1…“
    bei Raum „wp48-gb-lesen-1“, CI-Lauf 44526966423 —, dann fiel jede Datei der Ablage in die Auswahl, auch die
    Zählvermerke der Lesebremse (Fehlschlag Map(24) statt Map(7)). Die Wurzel unten erzwingt diesen Fall. */
async function raumDateien() {
  return new Map([...(await alleDateien())].filter(([rel]) => rel.includes(RAUM)));
}
/** Zählvermerke der Lesebremsen des GET (server/lib/schutz.mjs, bremse → versuchVermerken): je Versuch ein eigener
    Schlüssel `v:<art>:<kennung>:<fenster>:<marke>` mit dem Inhalt 1 — Hashkennungen, kein Bestandsinhalt. */
const LESEVERMERK = /^centric-takt\/v%3A(bestandlesen|lesen-raum)%3A[^/]+\.json$/;
const ANKER = "centric/widerrufbuch%3Aanker.json";
const inhalt = (b64) => JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
async function gespeichert() {
  const r = await B.bestandLesen(laden(), RAUM);
  return JSON.stringify(r);
}

/**
 * Laden wie App.jsx: GET, Migration; bei einer Migration (schritte > 0) das Zurückschreiben wie dort
 * (migrationZurueckschreiben, sofort). `alt`: der Ablauf vor dem Nachtrag (immer zurückschreiben, Konflikt nur
 * ETag übernehmen — speicher.js ohne onKonflikt).
 */
async function oeffne(k, { alt = false, ohneMigrationsschreiben = false } = {}) {
  const r = await anfrage("/api/bestand", { token: TOKEN[k] });
  expect(r.status).toBe(200);
  const erg = migriere(r.bestand);
  expect(erg.ok).toBe(true);
  const zugang = { rolle: r.rolle, schreiben: r.schreiben || "voll" };
  const s = { k, etag: r.etag, zugang, db: { ...erg.bestand, session: { rolle: "kunde", mandantId: "m1", personId: ROLLEN[k].person } },
    zuletzt: null, dialog: null, migration: null, erg };
  s.zuletzt = abbildVon(s.db);   // erst.current in App.jsx: der erste Bestand gilt als geschrieben
  s.geladen = s.db;
  if (!ohneMigrationsschreiben && (alt ? erg.schritte > 0 : migrationZurueckschreiben(erg, zugang))) {
    s.migration = erg.bestand;   // wartet auf migrationSenden (zwei Sitzungen laden zuerst beide)
  }
  return s;
}
/** Das sofortige Zurückschreiben der Migration und seine Konfliktbehandlung (App.jsx, Ladeeffekt). */
async function migrationSenden(s, { alt = false } = {}) {
  if (!s.migration) return null;
  const b = s.migration; s.migration = null;
  const geschrieben = abbildVon(b);
  const { session, ...ohne } = b;
  const a = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[s.k], rumpf: { bestand: { ...ohne, session: null }, etag: s.etag, durch: "Migration" } });
  if (a.status === 200) { s.etag = a.etag; return a; }
  if (a.status === 409) {
    s.etag = a.etag;   // speicher.js übernimmt den ETag der Absage
    if (alt) return a;  // vorher: kein onKonflikt — nur der ETag, der Inhalt blieb der eigene
    /* Dieselbe Entscheidung wie App.jsx (migrationKonflikt); `geladen` = der Stand direkt nach dem Laden. */
    const e = migrationKonflikt({ geschrieben, aktuell: s.db, geladen: s.geladen, antwort: a, migriere });
    if (e && e.art === "uebernehmen") {
      s.db = e.bestand;
      s.zuletzt = abbildVon(s.db);
      return a;
    }
    s.dialog = a;
    return a;
  }
  return a;
}
/** Der Speicher-Effekt aus App.jsx (ohne Verzögerung). */
async function speichern(s) {
  const abbild = schreibAbbild(s.db, s.zuletzt);
  if (abbild === null) return null;
  s.zuletzt = abbild;
  const { session, ...ohne } = s.db;
  const a = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[s.k], rumpf: { bestand: { ...ohne, session: null }, etag: s.etag, durch: s.k } });
  if (a.status === 200) { s.etag = a.etag; return a; }
  if (a.status === 409) { s.etag = a.etag; s.dialog = a; return a; }
  throw new Error(`${s.k}: unerwartet ${a.status} ${JSON.stringify(a).slice(0, 200)}`);
}
const mandant = (s) => s.db.mandanten.find((x) => x.id === "m1");
const aendere = (s, fn) => { s.db = { ...s.db, mandanten: s.db.mandanten.map((x) => x.id === "m1" ? fn(x) : x) }; };

beforeAll(async () => {
  /* Absichtlich mit dem Namen des ersten Raums (wp48-gb-lesen-1) im Wurzelpfad: deterministische Wiederholung des
     CI-Zufalls (Lauf 44526966423) — raumDateien muss trotzdem nur die Raumdateien auswählen. */
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-gb-lesen-1-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("WP-48-GB Nachtrag: Lesen ändert den Stand nicht", { timeout: 120000 }, () => {
  it("G GET ist reines Lesen: Datensatz und Raumdateien byte-gleich, auch mit Angleichung in der Antwort", async () => {
    await neuerRaum({ altPerson: true });
    const vorher = await gespeichert();
    expect(wurzel.includes(RAUM), "Wurzelpfad nennt den Raum (Fall des CI-Laufs 44526966423)").toBe(true);
    const dateienVorher = await raumDateien();
    expect(dateienVorher.size, "der Raum liegt in Dateien").toBeGreaterThan(0);
    expect([...dateienVorher.keys()].every((k) => k.startsWith("centric/")), "nur Datensatzdateien des Raums ausgewählt").toBe(true);
    /* Gesamtabbild VOR jedem GET. Der Vorlauf-GET darf genau Folgendes hinzufügen, sonst nichts: einmalig den Anker
       des Widerrufbuchs (server/lib/widerrufbuch.mjs, standJetzt: centric/widerrufbuch:anker — die allererste Anfrage
       an eine frische Ablage richtet ihn ein; kein Raum, kein Lesestand) und je einen Vermerk der beiden Lesebremsen.
       Vorhandenes bleibt byte-gleich, nichts wird entfernt. Ein GET, der bei jedem Aufruf dieselbe fremde Datei
       schreibt, fällt damit schon hier auf (nicht erst im Vergleich danach, wo sie schon im Abbild läge). */
    const alleVorVorlauf = await alleDateien();
    await oeffne("PL");
    const alleVorher = await alleDateien();
    for (const [k, v] of alleVorVorlauf) expect(alleVorher.get(k), `Vorlauf: ${k} unverändert`).toBe(v);
    const neuImVorlauf = [...alleVorher.keys()].filter((k) => !alleVorVorlauf.has(k));
    expect(neuImVorlauf.filter((k) => !LESEVERMERK.test(k)), "Vorlauf: neu nur der Anker des Widerrufbuchs")
      .toEqual(alleVorVorlauf.has(ANKER) ? [] : [ANKER]);
    expect(inhalt(alleVorher.get(ANKER)).daten, "Anker trägt nur die Kennung des Buchs").toEqual({ id: expect.stringMatching(/^[0-9a-f]{32}$/) });
    for (const k of neuImVorlauf.filter((x) => LESEVERMERK.test(x))) expect(inhalt(alleVorher.get(k)).daten).toBe(1);
    expect(neuImVorlauf.filter((k) => k.startsWith("centric-takt/v%3Abestandlesen%3A")).length, "Vorlauf: ein Personenvermerk").toBe(1);
    expect(neuImVorlauf.filter((k) => k.startsWith("centric-takt/v%3Alesen-raum%3A")).length, "Vorlauf: ein Raumvermerk").toBe(1);
    const sitzungen = [];
    for (let i = 0; i < 2; i++) for (const k of Object.keys(ROLLEN)) sitzungen.push(await oeffne(k));
    /* Die Antwort ist angeglichen (qualifikationen: null → []), gespeichert bleibt der Altwert. */
    const a1 = mandant(sitzungen.find((s) => s.k === "PL")).personen.find((p) => p.id === "a1");
    expect(a1.qualifikationen).toEqual([]);
    expect(await gespeichert(), "GET schreibt nichts (Inhalt, Stand, Zeit, Urheber)").toBe(vorher);
    expect(await raumDateien(), "keine Datei des Raums geändert").toEqual(dateienVorher);
    /* Schärfer als nur der Raum: JEDE Datei der Ablage (Datensatz, Stände, Sitzungen, alles außer den Zählvermerken
       der Lesebremse) ist nach dem Lesen vorhanden und byte-gleich, und es kommt keine hinzu. Neu darf nur je GET je
       ein Vermerk der beiden Lesebremsen sein (bestandlesen je Person, lesen-raum je Raum) — Inhalt 1, nach oben
       begrenzt. Ein Vermerk in einer anderen Art, mit anderem Inhalt oder ein Vermerk zu viel → rot. */
    const alleNachher = await alleDateien();
    const nichtVermerk = (m) => new Map([...m].filter(([k]) => !LESEVERMERK.test(k)));
    expect(nichtVermerk(alleNachher), "keine Datei außer Lesevermerken neu, geändert oder entfernt").toEqual(nichtVermerk(alleVorher));
    const neueVermerke = [...alleNachher].filter(([k]) => !alleVorher.has(k));
    for (const [k, v] of neueVermerke) {
      expect(k, "neu nur Lesevermerke").toMatch(LESEVERMERK);
      expect(inhalt(v).daten, `${k}: Vermerk trägt nur die Zahl 1`).toBe(1);
    }
    for (const [k, v] of alleVorher) if (alleNachher.has(k)) expect(alleNachher.get(k), `${k} unverändert`).toBe(v);
    /* Genau ein Vermerk je GET und Art (bremse → versuchVermerken, einmal je Aufruf). Deterministisch: Aufgeräumt
       werden nur Fenster, die mindestens zwei Fenster alt sind (alteFensterRaeumen: f < jetzt - 1), der Test läuft in
       Bruchteilen einer Sekunde. Restrisiko nur bei einem Lauf über 60 s: dann könnte zudem die Sitzungsverlängerung
       (sitzungen.mjs, `ta:` höchstens einmal je Minute) eine Datei anlegen — der Vergleich oben würde das rot melden;
       bewusst nicht ausgenommen, denn bei diesem Tempo wäre es ein Schreibvorgang des GET, der auffallen soll. */
    const zahl = (art) => neueVermerke.filter(([k]) => k.startsWith(`centric-takt/v%3A${art}%3A`)).length;
    expect(zahl("bestandlesen"), "genau ein Personenvermerk je GET").toBe(sitzungen.length);
    expect(zahl("lesen-raum"), "genau ein Raumvermerk je GET").toBe(sitzungen.length);
    /* Kein Zurückschreiben der Oberfläche: das Abbild ist das geladene, keine Migration nötig. */
    for (const s of sitzungen) {
      expect(s.migration).toBeNull();
      expect(await speichern(s)).toBeNull();
    }
    expect(puts, "acht Sitzungen öffnen, keine schreibt").toBe(0);
    expect(new Set(sitzungen.map((s) => s.etag)).size, "alle auf demselben Stand").toBe(1);
    expect(await gespeichert()).toBe(vorher);
  });

  it("M1 Reproduktion: alter Ablauf — zweite Migration 409, nur ETag übernommen, nächste Eingabe überschreibt still", async () => {
    await neuerRaum({ version: 8 });
    const pl = await oeffne("PL", { alt: true }), lt = await oeffne("LT", { alt: true });
    expect(pl.erg.schritte).toBe(1);
    await migrationSenden(pl, { alt: true });
    aendere(pl, (m) => ({ ...m, name: "Haus Planung" }));
    expect((await speichern(pl)).status).toBe(200);
    const a = await migrationSenden(lt, { alt: true });
    expect(a.status, "die Migration der Leitung trifft auf den neueren Stand").toBe(409);
    expect(lt.dialog, "kein Dialog").toBeNull();
    aendere(lt, (m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 12 } }));
    expect((await speichern(lt)).status, "mit dem übernommenen ETag geht die Eingabe durch").toBe(200);
    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(m.einstellungen.ruhezeit).toBe(12);
    expect(m.name, "die Änderung der Planung ist still verloren").toBe("Haus");
  });

  it("M2 reine Migration im Konflikt: still übernommen, kein Dialog, keine verlorene Änderung", async () => {
    await neuerRaum({ version: 8 });
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    expect(pl.migration && lt.migration, "beide Sitzungen müssen die Migration zurückschreiben").toBeTruthy();
    expect((await migrationSenden(pl)).status).toBe(200);
    aendere(pl, (m) => ({ ...m, name: "Haus Planung" }));
    expect((await speichern(pl)).status).toBe(200);
    expect((await migrationSenden(lt)).status).toBe(409);
    expect(lt.dialog, "Leitung: kein „Gleichzeitig bearbeitet“").toBeNull();
    expect(mandant(lt).name, "Stand des Servers übernommen").toBe("Haus Planung");
    expect(lt.etag).toBe(pl.etag);
    expect(abbildVon(lt.db)).toBe(abbildVon(pl.db));
    expect(await speichern(lt), "nach der Übernahme nichts zu schreiben").toBeNull();
    aendere(lt, (m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 12 } }));
    expect((await speichern(lt)).status).toBe(200);
    const m = (await B.bestandLesen(laden(), RAUM)).bestand;
    expect(m.version, "Versionsmarke: der Bestand steht auf der aktuellen Fassung").toBe(9);
    expect(m.mandanten[0].branche).toBe("produktion");
    expect(m.mandanten[0].name, "Änderung der Planung erhalten").toBe("Haus Planung");
    expect(m.mandanten[0].einstellungen.ruhezeit).toBe(12);
    expect(puts).toBe(4);
    /* Ein weiteres Öffnen migriert nicht mehr und schreibt nicht. */
    const lt2 = await oeffne("LT");
    expect(lt2.migration).toBeNull();
    expect(await speichern(lt2)).toBeNull();
    expect(puts).toBe(4);
  });

  it("M3 Betriebsrat schreibt die Migration nicht zurück (vorher: PUT ohne Eingabe, 403)", async () => {
    await neuerRaum({ version: 8 });
    const vorher = await gespeichert();
    const brAlt = await oeffne("BR", { alt: true });
    const a = await migrationSenden(brAlt, { alt: true });
    expect(a && a.status, "Reproduktion: Schreibversuch beim bloßen Öffnen").toBe(403);
    expect(puts).toBe(1);
    puts = 0;
    const br = await oeffne("BR");
    expect(br.zugang.schreiben).toBe("nein");
    expect(br.erg.schritte, "die Oberfläche arbeitet migriert").toBe(1);
    expect(br.migration, "kein Zurückschreiben").toBeNull();
    expect(await speichern(br)).toBeNull();
    expect(puts).toBe(0);
    expect(await gespeichert()).toBe(vorher);
    expect(migrationZurueckschreiben({ ok: true, schritte: 1 }, { schreiben: "voll" })).toBe(true);
    expect(migrationZurueckschreiben({ ok: true, schritte: 1 }, null), "ohne Angabe wie bisher").toBe(true);
    expect(migrationZurueckschreiben({ ok: true, schritte: 0 }, { schreiben: "voll" })).toBe(false);
    expect(migrationZurueckschreiben({ ok: false }, { schreiben: "voll" })).toBe(false);
    expect(migrationZurueckschreiben({ ok: true, schritte: 2 }, { schreiben: "nein" })).toBe(false);
  });

  it("M4 Migration im Konflikt, aber die Person hat inzwischen etwas geändert: Dialog bleibt", async () => {
    await neuerRaum({ version: 8 });
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    await migrationSenden(pl);
    aendere(pl, (m) => ({ ...m, name: "Haus Planung" }));
    expect((await speichern(pl)).status).toBe(200);
    aendere(lt, (m) => ({ ...m, name: "Haus Leitung" }));
    expect((await migrationSenden(lt)).status).toBe(409);
    expect(lt.dialog && lt.dialog.status, "echter Konflikt wird gemeldet").toBe(409);
    expect(mandant(lt).name, "eigene Eingabe nicht still verworfen").toBe("Haus Leitung");
  });

  it("D Differenz: echte Eingabe nach dem Öffnen speichert wie bisher (ein PUT, Inhalt da)", async () => {
    await neuerRaum();
    const pl = await oeffne("PL");
    expect(await speichern(pl)).toBeNull();
    aendere(pl, (m) => ({ ...m, name: "Haus Neu" }));
    const a = await speichern(pl);
    expect(a.status).toBe(200);
    expect(puts).toBe(1);
    expect((await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0].name).toBe("Haus Neu");
    expect(pl.dialog).toBeNull();
  });

  it("V Verdrahtung: App.jsx schreibt die Migration nur über migrationZurueckschreiben und mit Konfliktbehandlung", async () => {
    const app = (await readFile(path.join(HIER, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    const lade = app.slice(app.indexOf("const erg = migriere(bestand);"), app.indexOf("setDb(b);\n    } catch (e)"));
    expect(lade.length).toBeGreaterThan(100);
    /* Mutante „ohne Rollenprüfung": das alte `if (erg.schritte > 0)` vor SP.schreib. */
    expect(lade).not.toMatch(/if \(erg\.schritte > 0\) \{\s*\/\*[^]*?\*\/\s*SP\.schreib/);
    expect(lade).toMatch(/if \(migrationZurueckschreiben\(erg, zugang\)\)/);
    /* Mutante „Migration ohne Konfliktbehandlung": SP.schreib ohne onKonflikt. */
    const schreib = lade.slice(lade.indexOf("SP.schreib(b,"));
    expect(schreib).toMatch(/^SP\.schreib\(b, \{ durch: "Migration", sofort: true,\s*onKonflikt:/);
    /* Die Entscheidung trifft migrationKonflikt (Fall K führt sie aus): aktueller Stand vor dem geladenen, Teilweg. */
    expect(schreib).toMatch(/migrationKonflikt\(\{ geschrieben: migrationsAbbild, aktuell: ref\.current, geladen,\s*antwort: d, migriere, teilwegGenutzt: SP\.teilwegGenutzt\(\) \}\)/);
    /* Folgepaket #365 (umgestellt, nicht gelockert): speicher.js gibt den ETag der Absage erst mit der Entscheidung frei —
       die stille Übernahme ruft deshalb zuerst SP.konfliktLoesen("server") (pruefungen/speicher-409-konfliktsperre.test.js). */
    expect(schreib).toMatch(/if \(e\.art === "uebernehmen"\) \{\s*SP\.konfliktLoesen\("server"\);[^\n]*\n\s*zuletztGeschrieben\.current = abbildVon\(e\.bestand\);\s*setDb\(e\.bestand\);\s*return;\s*\}/);
    expect(schreib).toMatch(/setKonflikt\(\{ \.\.\.d, meiner: e\.meiner, \.\.\.\(SP\.teilwegGenutzt\(\) \? \{ ohneUebernehmen: true,/);
    expect(schreib.slice(0, schreib.indexOf("} });")), "keine eigene Entscheidung mehr im Handler").not.toMatch(/automatikKonfliktLoesen/);
    expect(app).toMatch(/import \{[^}]*migrationZurueckschreiben[^}]*migrationKonflikt[^}]*\} from "\.\/app\/oeffnen\.js"/);
  });

  it("K migrationKonflikt (der Handler-Rumpf aus App.jsx als Funktion): aktueller Stand zählt, Teilweg, ältere Serverfassung", () => {
    const geladen = { ...bestand(), session: { rolle: "kunde", mandantId: "m1", personId: "l1" }, stand: 3 };
    const geschrieben = abbildVon(geladen);
    const server = { ...bestand(), mandanten: bestand().mandanten.map((m) => ({ ...m, name: "Haus Planung" })) };
    const antwort = { bestand: server, etag: "7" };
    /* Rein: still übernommen, Sitzung dieses Reiters, Stand hochgezählt. */
    const a = migrationKonflikt({ geschrieben, aktuell: geladen, geladen, antwort, migriere });
    expect(a.art).toBe("uebernehmen");
    expect(a.bestand.mandanten[0].name).toBe("Haus Planung");
    expect(a.bestand.session).toEqual(geladen.session);
    expect(a.bestand.stand).toBe(4);
    /* Noch nicht gerendert (aktuell fehlt): der geladene Stand gilt. */
    expect(migrationKonflikt({ geschrieben, aktuell: null, geladen, antwort, migriere }).art).toBe("uebernehmen");
    expect(migrationKonflikt({ geschrieben, aktuell: null, geladen: null, antwort, migriere })).toBeNull();
    /* Eigene Eingabe im aktuellen Stand: Dialog mit genau diesem Stand — nie der geladene (Mutante `lokal = geladen`). */
    const aktuell = { ...geladen, mandanten: geladen.mandanten.map((m) => ({ ...m, name: "Haus Leitung" })) };
    const d = migrationKonflikt({ geschrieben, aktuell, geladen, antwort, migriere });
    expect(d.art).toBe("dialog");
    expect(d.meiner).toBe(aktuell);
    /* Teilweg in der Sitzung genutzt: kein Bestand ohne ETag — Dialog. */
    expect(migrationKonflikt({ geschrieben, aktuell: geladen, geladen, antwort, migriere, teilwegGenutzt: true }).art).toBe("dialog");
    /* Server noch auf älterer Fassung (schritte > 0): Dialog statt stiller Übernahme (sicher, wenn auch unnötig). */
    expect(migrationKonflikt({ geschrieben, aktuell: geladen, geladen, antwort: { bestand: bestand({ version: 8 }) }, migriere }).art).toBe("dialog");
  });
});
