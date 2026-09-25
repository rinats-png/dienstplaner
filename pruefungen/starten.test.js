/* ==========================================================================
   SELBSTSTART — was der Endpunkt HEUTE tut

   Diese Datei verbessert nichts. Sie schreibt fest, wie sich POST /starten
   im Augenblick verhält, damit ein späterer Umbau daran gemessen werden
   kann: Jede Abweichung, die dann entsteht, wird hier rot — auch eine, die
   sich wie eine Verbesserung anfühlt.

   Deshalb stehen hier auch Zusagen, die man so nicht neu bauen würde: Der
   Endpunkt liefert die Zugangscodes im Klartext in der Antwort, er räumt
   nach einem Teilfehler nichts auf, und der Raumname enthält den
   Betriebsnamen. Das ist der Bestand, nicht die Empfehlung.

   Geprüft wird der echte Handler — derselbe Standardexport, den server.mjs
   unter /starten einhängt. Kein Nachbau, keine Attrappe.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore, starten, bestandLesen, raumBelegt, TESTTAGE;

const TAG = 86400000;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-starten-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  ({ bestandLesen, raumBelegt } = await import("../server/lib/bestand.mjs"));
  ({ TESTTAGE } = await import("../server/lib/aufraeumen.mjs"));
  /* Der echte Handler, wie server.mjs ihn lädt: der Standardexport. */
  starten = (await import("../server/funktionen/starten.mjs")).default;
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const taktSpeicher = () => getStore({ name: "centric-takt", consistency: "strong" });

/* Die Bremse zählt je Herkunft UND ein Gesamtaufkommen (60 je Stunde,
   schutz.mjs). Ohne Aufräumen würde der Gesamtzähler die späteren Tests
   dieser Datei bremsen — deshalb vor jedem Test leeren. Die Zählung je
   Herkunft lebt zusätzlich im Prozessspeicher; sie wird dadurch NICHT
   zurückgesetzt. Isoliert wird sie über eine eigene Absenderadresse je
   Test. */
beforeEach(async () => {
  const s = taktSpeicher();
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

let herkunftZaehler = 0;
/** Eine Adresse, die kein anderer Test benutzt. */
const eigeneHerkunft = () => `10.0.${Math.floor(++herkunftZaehler / 250) + 1}.${(herkunftZaehler % 250) + 1}`;

/**
 * Ein Aufruf des echten Handlers.
 * @param {object} [rumpf]  wird als JSON gesendet; `rohRumpf` ersetzt ihn
 */
async function anfrage(rumpf = {}, {
  methode = "POST", pfad = "/starten", herkunft = null, origin = null,
  rohRumpf = null,
} = {}) {
  const kopf = { "content-type": "application/json" };
  kopf["x-forwarded-for"] = herkunft || eigeneHerkunft();
  if (origin) kopf.origin = origin;
  const req = new Request(`http://127.0.0.1:3000${pfad}`, {
    method: methode,
    headers: kopf,
    ...(methode === "GET" || methode === "HEAD"
      ? {}
      : { body: rohRumpf !== null ? rohRumpf : JSON.stringify(rumpf) }),
  });
  const antwort = await starten(req);
  let daten = null;
  try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { antwort, status: antwort.status, daten };
}

/** Die gültigen Mindestangaben nach heutigem Code. */
const GUELTIG = { name: "Wachdienst Nordlicht", branche: "sicherheit",
  email: "leitung@example.org", land: "NW" };

/** Ein erfolgreicher Start, mit Prüfung, dass er erfolgreich war. */
async function gestartet(zusatz = {}, o = {}) {
  const e = await anfrage({ ...GUELTIG, ...zusatz }, o);
  expect(e.status, JSON.stringify(e.daten)).toBe(200);
  return e;
}

/** Alle Zugangskonten eines Raums, wie sie in der Ablage liegen. */
async function kontenVon(raum) {
  const s = laden();
  const aus = [];
  const { blobs } = await s.list({ prefix: "konto:" });
  for (const b of blobs) {
    const k = await s.get(b.key, { type: "json" }).catch(() => null);
    if (k && k.bestand === raum) aus.push({ schluessel: b.key, ...k });
  }
  return aus;
}

/* ==========================================================================
   DER ERFOLGSFALL
   ========================================================================== */

describe("Ein gültiger Selbststart", () => {
  it("antwortet mit 200 und der heutigen Antwortform", async () => {
    const { antwort, daten } = await gestartet();
    expect(antwort.headers.get("content-type")).toContain("application/json");
    expect(antwort.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(daten).sort())
      .toEqual(["branche", "laeuftAb", "ok", "raum", "testtage", "zugaenge"]);
    expect(daten.ok).toBe(true);
    expect(daten.branche).toBe("sicherheit");
    expect(daten.testtage).toBe(TESTTAGE);
    expect(TESTTAGE).toBe(30);
    expect(typeof daten.laeuftAb).toBe("string");
  });

  it("erzeugt einen Raum mit dem heutigen Namensaufbau", async () => {
    const { daten } = await gestartet({ name: "Wach & Schutz Süd GmbH" });
    /* t- + Namensteil + Trennstrich + fünf Zeichen aus dem verwechslungsarmen
       Alphabet. Der Zufallsteil selbst wird nicht festgenagelt. */
    expect(daten.raum).toMatch(/^t-wach-schutz-sued-gmbh-[acdefghjkmnpqrtuvwxy34679]{5}$/);
    /* Und der Raum ist danach wirklich da. */
    expect(await raumBelegt(laden(), daten.raum)).toBe(true);
  });

  it("kürzt einen langen Namen im Raumnamen und fällt nie auf leer zurück", async () => {
    const lang = await gestartet({ name: "A".repeat(80) });
    const teil = lang.daten.raum.slice(2, -6);
    expect(teil.length).toBeLessThanOrEqual(28);
    /* Ein Name ohne verwendbare Zeichen ergibt „betrieb". */
    const zeichen = await gestartet({ name: "!!!" });
    expect(zeichen.daten.raum).toMatch(/^t-betrieb-[acdefghjkmnpqrtuvwxy34679]{5}$/);
  });

  it("schreibt den Betrieb mit den heutigen Vertragsfeldern", async () => {
    const vorher = Date.now();
    const { daten } = await gestartet();
    const nachher = Date.now();

    const gelesen = await bestandLesen(laden(), daten.raum);
    expect(gelesen).not.toBe(null);
    const m = gelesen.bestand.mandanten[0];
    expect(m.status).toBe("test");
    expect(m.selbstAngelegt).toBe(true);
    expect(m.name).toBe(GUELTIG.name);
    expect(m.branche).toBe("sicherheit");
    expect(m.bundesland).toBe("NW");
    expect(m.kontakt).toBe(GUELTIG.email);
    expect(m.laeuftAb).toBe(daten.laeuftAb);
    /* Der Vermerk, wer geschrieben hat. */
    expect(gelesen.durch).toBe("Selbststart");

    /* Dreißig Tage, gemessen im Fenster um die Anfrage — die Uhr im Handler
       ist nicht einspeisbar, und dafür wird kein Produktionscode geändert. */
    const ab = new Date(m.laeuftAb).getTime();
    expect(ab).toBeGreaterThanOrEqual(vorher + TESTTAGE * TAG);
    expect(ab).toBeLessThanOrEqual(nachher + TESTTAGE * TAG);
  });

  it("legt keinen Aufbewahrungszeitpunkt an — die 90 Tage rechnet erst der Löschlauf", async () => {
    const { daten } = await gestartet();
    const gelesen = await bestandLesen(laden(), daten.raum);
    const m = gelesen.bestand.mandanten[0];
    for (const feld of ["aufbewahrenBis", "aufbewahrungBis", "testBis", "geloeschtAm"]) {
      expect(Object.prototype.hasOwnProperty.call(m, feld), feld).toBe(false);
    }
    /* Was es gibt, ist die Aufbewahrungsvorgabe in Monaten für die
       Datenräumung — nicht ein Zeitpunkt für die Raumlöschung. */
    expect(m.aufbewahrung).toBeTruthy();
    expect(typeof m.aufbewahrung.plandatenMonate).toBe("number");
  });

  it("legt einen leeren Betrieb an: keine Person, aber Einheit und Standort", async () => {
    const { daten } = await gestartet();
    const m = (await bestandLesen(laden(), daten.raum)).bestand.mandanten[0];
    expect(m.personen).toEqual([]);
    expect(m.abwesenheiten).toEqual([]);
    expect(m.anfragen).toEqual([]);
    expect(m.einheiten.length).toBe(1);
    expect(m.einheiten[0].id).toBeTruthy();
    expect(m.standorte.length).toBe(1);
    expect(m.standorte[0].id).toBe("st1");
    /* Branchenkataloge sind gefüllt — der Betrieb ist leer, nicht nackt. */
    expect(m.qualifikationen.length).toBeGreaterThan(0);
    expect(m.dienstarten.length).toBeGreaterThan(0);
  });
});

/* ==========================================================================
   DIE ZUGÄNGE
   ========================================================================== */

describe("Die Zugangscodes", () => {
  it("legt ohne Zusatzwunsch genau Leitung und Planung an", async () => {
    const { daten } = await gestartet();
    expect(daten.zugaenge.map((z) => z.rolle)).toEqual(["leitung", "planer"]);
    const konten = await kontenVon(daten.raum);
    expect(konten.length).toBe(2);
    expect(new Set(konten.map((k) => k.rolle))).toEqual(new Set(["leitung", "planer"]));
  });

  it("nimmt bis zu drei zulässige Zusatzrollen an", async () => {
    const eine = await gestartet({ rollen: ["mitarbeiter"] });
    expect(eine.daten.zugaenge.map((z) => z.rolle))
      .toEqual(["leitung", "planer", "mitarbeiter"]);

    const drei = await gestartet({ rollen: ["subplaner", "mitarbeiter", "betriebsrat"] });
    expect(drei.daten.zugaenge.map((z) => z.rolle))
      .toEqual(["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]);
    expect((await kontenVon(drei.daten.raum)).length).toBe(5);
  });

  it("verwirft unzulässige Rollen stillschweigend, statt abzuweisen", async () => {
    /* Heutiges Verhalten: filtern, nicht ablehnen. Kein 400. */
    const e = await gestartet({ rollen: ["betreiber", "leitung", "quatsch", null, 42] });
    expect(e.status).toBe(200);
    expect(e.daten.zugaenge.map((z) => z.rolle)).toEqual(["leitung", "planer"]);
    const konten = await kontenVon(e.daten.raum);
    expect(konten.some((k) => k.rolle === "betreiber")).toBe(false);
    expect(konten.length).toBe(2);
  });

  it("nimmt höchstens drei Zusatzrollen, auch wenn mehr kommen", async () => {
    const e = await gestartet({
      rollen: ["subplaner", "mitarbeiter", "betriebsrat", "subplaner", "mitarbeiter"],
    });
    /* Abgeschnitten nach drei — Doppelungen werden nicht zusammengefasst. */
    expect(e.daten.zugaenge.length).toBe(5);
    expect(e.daten.zugaenge.map((z) => z.rolle))
      .toEqual(["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]);
  });

  it("nimmt auch einen unbrauchbaren Rollenwert an, ohne zu scheitern", async () => {
    for (const rollen of ["mitarbeiter", 42, {}, null]) {
      const e = await gestartet({ rollen });
      expect(e.daten.zugaenge.map((z) => z.rolle)).toEqual(["leitung", "planer"]);
    }
  });

  it("liefert die Codes im Klartext in der Antwort — und legt nur Prüfwerte ab", async () => {
    /* Heutiges Verhalten, ausdrücklich festgehalten: Die Codes stehen in der
       HTTP-Antwort. Abgelegt wird nur ihr Prüfwert im Schlüssel. */
    const { daten } = await gestartet();
    for (const z of daten.zugaenge) {
      expect(z.code).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY34679]{4}(-[ACDEFGHJKLMNPQRTUVWXY34679]{4}){2}$/);
    }
    const s = laden();
    const { blobs } = await s.list({});
    for (const b of blobs) {
      const roh = await s.get(b.key).catch(() => null);
      for (const z of daten.zugaenge) {
        expect(b.key, `Code im Schlüssel ${b.key}`).not.toContain(z.code);
        expect(String(roh || ""), `Code im Inhalt von ${b.key}`).not.toContain(z.code);
      }
    }
  });

  it("schreibt in jedes Konto die heutigen Felder", async () => {
    const { daten } = await gestartet();
    for (const k of await kontenVon(daten.raum)) {
      expect(k.bestand).toBe(daten.raum);
      expect(k.demo).toBe(false);
      expect(k.selbstAngelegt).toBe(true);
      expect(k.person).toBe(null);
      expect(k.betrieb).toBe(0);
      expect(k.gruppe).toBe(null);
      expect(k.hinweis).toBe(null);
      expect(k.name).toBe(GUELTIG.name);
      expect(k.laeuftAb).toBe(daten.laeuftAb);
      expect(typeof k.angelegt).toBe("string");
      /* Kein Account, keine Mitgliedschaft: Der Legacy-Weg kennt beides nicht. */
      expect(k.accountId).toBeUndefined();
    }
    expect((await laden().list({ prefix: "mitglied:" })).blobs.length).toBe(0);
    expect((await laden().list({ prefix: "account:" })).blobs.length).toBe(0);
  });
});

/* ==========================================================================
   DIE EINGABEPRÜFUNG
   ========================================================================== */

describe("Die Eingabeprüfung", () => {
  it("verlangt einen Namen mit mindestens drei Zeichen", async () => {
    for (const name of ["", " ", "ab", " a ", null, undefined]) {
      const e = await anfrage({ ...GUELTIG, name });
      expect(e.status, JSON.stringify(name)).toBe(400);
      expect(e.daten.fehler).toMatch(/mindestens drei Zeichen/);
    }
    expect((await anfrage({ ...GUELTIG, name: "abc" })).status).toBe(200);
  });

  it("nimmt 80 Zeichen an und weist 81 ab", async () => {
    expect((await anfrage({ ...GUELTIG, name: "N".repeat(80) })).status).toBe(200);
    const zuLang = await anfrage({ ...GUELTIG, name: "N".repeat(81) });
    expect(zuLang.status).toBe(400);
    expect(zuLang.daten.fehler).toMatch(/zu lang/);
  });

  it("faellt bei unbekannter Branche auf sonstige zurueck", async () => {
    for (const branche of ["quatsch", "", null, 42, "SICHERHEIT"]) {
      const e = await gestartet({ branche });
      expect(e.daten.branche, JSON.stringify(branche)).toBe("sonstige");
    }
    /* Die fünf bekannten Branchen bleiben erhalten. */
    for (const branche of ["sicherheit", "pflege", "klinik", "industrie", "sonstige"]) {
      expect((await gestartet({ branche })).daten.branche).toBe(branche);
    }
  });

  it("fällt bei unbekanntem Bundesland auf Hessen zurück", async () => {
    for (const land of ["XX", "", null, "nw", 42]) {
      const e = await gestartet({ land });
      const m = (await bestandLesen(laden(), e.daten.raum)).bestand.mandanten[0];
      expect(m.bundesland, JSON.stringify(land)).toBe("HE");
    }
    const gross = await gestartet({ land: "BY" });
    expect((await bestandLesen(laden(), gross.daten.raum)).bestand.mandanten[0].bundesland)
      .toBe("BY");
  });

  it("prüft die E-Mail nur auf ein Klammeraffenzeichen", async () => {
    const ohne = await anfrage({ ...GUELTIG, email: "keine-adresse" });
    expect(ohne.status).toBe(400);
    expect(ohne.daten.fehler).toMatch(/E-Mail-Adresse/);

    /* Ohne Angabe geht es durch, und der Kontakt bleibt leer. */
    const leer = await gestartet({ email: undefined });
    const m = (await bestandLesen(laden(), leer.daten.raum)).bestand.mandanten[0];
    expect(m.kontakt).toBe("");

    /* Alles mit einem @ genügt heute — auch was keine Adresse ist. */
    const krumm = await gestartet({ email: "a@b" });
    expect((await bestandLesen(laden(), krumm.daten.raum)).bestand.mandanten[0].kontakt)
      .toBe("a@b");
  });

  it("antwortet auf einen unlesbaren Rumpf mit 500", async () => {
    /* Heutiges Verhalten: Das Auspacken wirft, und der Sammelfang meldet
       einen Serverfehler — nicht 400. */
    const e = await anfrage({}, { rohRumpf: "{kein json" });
    expect(e.status).toBe(500);
    expect(e.daten.fehler).toMatch(/nicht geklappt/);
  });
});

/* ==========================================================================
   METHODEN, PFADE, HERKUNFT
   ========================================================================== */

describe("Methode, Pfad und Herkunft", () => {
  it("lässt nur POST zu", async () => {
    for (const methode of ["GET", "PUT", "DELETE", "PATCH"]) {
      const e = await anfrage({}, { methode });
      expect(e.status, methode).toBe(405);
      expect(e.daten.fehler).toBe("Nur POST.");
    }
  });

  it("kennt /starten und /starten/neu, sonst nichts", async () => {
    expect((await anfrage(GUELTIG, { pfad: "/starten/neu" })).status).toBe(200);
    const fremd = await anfrage(GUELTIG, { pfad: "/starten/irgendwas" });
    expect(fremd.status).toBe(404);
    expect(fremd.daten.fehler).toBe("Unbekannter Pfad.");
  });

  it("weist eine Anfrage von fremder Herkunft ab", async () => {
    const fremd = await anfrage(GUELTIG, { origin: "https://beispiel.invalid" });
    expect(fremd.status).toBe(403);
    expect(fremd.daten.fehler).toMatch(/nicht von der Anwendung/);
    /* Die eigene Herkunft geht durch — und keine Angabe auch. */
    expect((await anfrage(GUELTIG, { origin: "http://127.0.0.1:3000" })).status).toBe(200);
    expect((await anfrage(GUELTIG)).status).toBe(200);
  });

  it("prüft die Herkunft vor Pfad und Rumpf — aber nur bei schreibenden Methoden", async () => {
    /* Bei einer schreibenden Anfrage entscheidet die Herkunft zuerst: Selbst
       ein unbekannter Pfad und ein unlesbarer Rumpf enden bei 403. */
    const p = await anfrage(GUELTIG, { pfad: "/starten/xx", origin: "https://beispiel.invalid" });
    expect(p.status).toBe(403);
    const r = await anfrage({}, { rohRumpf: "{kaputt", origin: "https://beispiel.invalid" });
    expect(r.status).toBe(403);

    /* Ein GET dagegen gilt als lesend und läuft an der Herkunftsprüfung
       vorbei (herkunftErlaubt in schutz.mjs lässt GET, HEAD und OPTIONS
       durch) — es endet deshalb bei 405, nicht bei 403. */
    const g = await anfrage({}, { methode: "GET", origin: "https://beispiel.invalid" });
    expect(g.status).toBe(405);
  });
});

/* ==========================================================================
   DIE BREMSE
   ========================================================================== */

describe("Die Bremse", () => {
  it("lässt drei Betriebe je Herkunft zu und sperrt den vierten", async () => {
    const herkunft = "203.0.113.77";
    for (let n = 1; n <= 3; n++) {
      const e = await anfrage({ ...GUELTIG, name: `Betrieb ${n}` }, { herkunft });
      expect(e.status, `Versuch ${n}`).toBe(200);
    }
    const vierter = await anfrage({ ...GUELTIG, name: "Betrieb 4" }, { herkunft });
    expect(vierter.status).toBe(429);
    expect(vierter.daten.fehler).toBe("zu viele Anfragen");
    expect(Number(vierter.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(vierter.daten.wartet).toBeGreaterThan(0);

    /* Eine andere Herkunft ist davon unberührt. */
    const andere = await anfrage({ ...GUELTIG, name: "Andere Herkunft" },
      { herkunft: "203.0.113.78" });
    expect(andere.status).toBe(200);
  });

  it("bremst, bevor irgendetwas angelegt wird", async () => {
    const herkunft = "203.0.113.90";
    const vorher = (await laden().list({ prefix: "kern:" })).blobs.length;
    for (let n = 1; n <= 3; n++) {
      await anfrage({ ...GUELTIG, name: `Vorlauf ${n}` }, { herkunft });
    }
    const gebremst = await anfrage({ ...GUELTIG, name: "Wird gebremst" }, { herkunft });
    expect(gebremst.status).toBe(429);
    /* Drei Räume mehr, nicht vier. */
    expect((await laden().list({ prefix: "kern:" })).blobs.length).toBe(vorher + 3);
  });
});

/* ==========================================================================
   VERMERKE
   ========================================================================== */

describe("Vermerke für den Betreiber", () => {
  it("führt den neuen Betrieb in der Nachfassliste", async () => {
    const { daten } = await gestartet({ name: "Nachfass Nord" });
    const liste = await laden().get("selbststarts", { type: "json" });
    const eintrag = liste.find((x) => x.raum === daten.raum);
    expect(eintrag).toBeTruthy();
    expect(eintrag.name).toBe("Nachfass Nord");
    expect(eintrag.branche).toBe("sicherheit");
    expect(eintrag.email).toBe(GUELTIG.email);
    expect(eintrag.zugaenge).toBe(2);
    expect(eintrag.laeuftAb).toBe(daten.laeuftAb);
    expect(typeof eintrag.angelegt).toBe("string");
    expect(typeof eintrag.herkunft).toBe("string");
    /* Der neueste Eintrag steht vorn — und kein Zugangscode steht darin. */
    expect(liste[0].raum).toBe(daten.raum);
    expect(JSON.stringify(eintrag)).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  });

  it("hinterlässt eine Spur im Protokoll", async () => {
    const spur = getStore({ name: "centric-spur" });
    const { daten } = await gestartet({ name: "Protokoll Probe" });
    const tag = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${tag}/starten/` });
    const zeilen = [];
    for (const b of blobs) {
      const z = await spur.get(b.key, { type: "json" }).catch(() => null);
      if (z) zeilen.push(z);
    }
    const erfolg = zeilen.filter((z) => z.ausgang === "erfolg");
    expect(erfolg.length).toBeGreaterThan(0);
    const meiner = erfolg.find((z) => String(z.zusatz || "").includes("2 Zugänge"));
    expect(meiner).toBeTruthy();
    expect(meiner.art).toBe("starten");
    /* Kein Code und kein Raumname im Protokoll — nur Branche und Anzahl. */
    expect(JSON.stringify(meiner)).not.toContain(daten.raum);
    for (const z of daten.zugaenge) {
      expect(JSON.stringify(meiner)).not.toContain(z.code);
    }
  });

  it("vermerkt auch eine Bremsung im Protokoll", async () => {
    const spur = getStore({ name: "centric-spur" });
    const herkunft = "203.0.113.120";
    for (let n = 1; n <= 3; n++) {
      await anfrage({ ...GUELTIG, name: `Spur ${n}` }, { herkunft });
    }
    expect((await anfrage({ ...GUELTIG, name: "Spur 4" }, { herkunft })).status).toBe(429);
    const tag = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${tag}/starten/` });
    let gebremst = 0;
    for (const b of blobs) {
      const z = await spur.get(b.key, { type: "json" }).catch(() => null);
      if (z && z.ausgang === "gebremst") gebremst++;
    }
    expect(gebremst).toBeGreaterThan(0);
  });
});

/* ==========================================================================
   WAS DER LEGACY-WEG NICHT TUT

   Diese Zusagen sind die eigentliche Absicherung für einen späteren Umbau:
   Sie halten fest, was heute NICHT geschieht — damit eine gemeinsame
   Provisionierung es auch morgen nicht beiläufig tut.
   ========================================================================== */

describe("Die Grenzen des Legacy-Wegs", () => {
  it("erzeugt weder Account noch Mitgliedschaft noch Person noch Sitzung", async () => {
    const { daten } = await gestartet({ name: "Grenzen Probe" });
    const s = laden();
    for (const praefix of ["account:", "kontoId:", "mitglied:", "raummitglied:", "push:"]) {
      expect((await s.list({ prefix: praefix })).blobs.length, praefix).toBe(0);
    }
    const m = (await bestandLesen(s, daten.raum)).bestand.mandanten[0];
    expect(m.personen).toEqual([]);
  });

  it("wird vom Aufräumlauf als abgelaufener Testbetrieb erkannt", async () => {
    /* Die Verbindung zum Löschlauf: Was hier entsteht, muss dort nach Ablauf
       und Aufbewahrung als Kandidat erscheinen — sonst bliebe jeder
       Selbststart für immer liegen. */
    const { zuLoeschendeTestraeume } = await import("../server/lib/aufraeumen.mjs");
    const { daten } = await gestartet({ name: "Ablauf Probe" });
    const kern = await laden().get(`kern:${daten.raum}`, { type: "json" });
    const konten = (await kontenVon(daten.raum)).map((k) => ({ ...k }));
    const ablauf = new Date(daten.laeuftAb).getTime();

    const kerne = [{ raum: daten.raum, kern }];
    expect(zuLoeschendeTestraeume(kerne, ablauf + 89 * TAG, { konten })).toEqual([]);
    expect(zuLoeschendeTestraeume(kerne, ablauf + 90 * TAG, { konten }))
      .toEqual([daten.raum]);
  });

  it("liefert bei jedem Start einen neuen Raum und neue Codes", async () => {
    const eins = await gestartet({ name: "Doppelt Nord" });
    const zwei = await gestartet({ name: "Doppelt Nord" });
    expect(eins.daten.raum).not.toBe(zwei.daten.raum);
    const codesEins = eins.daten.zugaenge.map((z) => z.code);
    const codesZwei = zwei.daten.zugaenge.map((z) => z.code);
    for (const c of codesZwei) expect(codesEins).not.toContain(c);
    /* Zwei Betriebe mit demselben Namen stehen unabhängig nebeneinander. */
    expect(await raumBelegt(laden(), eins.daten.raum)).toBe(true);
    expect(await raumBelegt(laden(), zwei.daten.raum)).toBe(true);
  });
});
