/* ==========================================================================
   SITZUNGEN — die Extraktion aus daten.mjs

   Diese Prüfung hält das Verhalten fest, das vor der Herausnahme in
   daten.mjs stand. Sie ist der Grund, warum die Extraktion überhaupt
   verantwortbar ist: Ohne sie wäre jede spätere Änderung an den Fristen
   eine Änderung an jeder Anfrage der Anwendung, ohne dass es auffällt.

     Frist          12 Stunden, Betreiber 2
     Untätigkeit     30 Minuten
     Verlängerung    `zuletzt` höchstens einmal je Minute
     sk:             läuft ab, wird nie verlängert, trägt nurSicherung
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, S;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-sitzungen-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  S = await import("../server/lib/sitzungen.mjs");
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
/* Eine Anfrage ist hier nur ihr Kopf. */
const anfrage = (token) => ({
  headers: { get: (n) => (n === "authorization" && token ? `Bearer ${token}` : null) },
});

const uhr = (start = Date.UTC(2026, 8, 24, 8, 0, 0)) => {
  let t = start;
  return { jetzt: () => t, vor: (ms) => { t += ms; }, stand: () => t };
};
const MINUTE = 60 * 1000, STUNDE = 60 * MINUTE;

/* --------------------------------------------------------------------------
   AUF DEN ZUSTAND WARTEN, NICHT AUF DIE UHR

   `sitzungLesen` schreibt `zuletzt` absichtlich ohne await: Eine Anfrage
   soll nicht auf einen Schreibvorgang warten, der sie nichts angeht. Der
   Schreibvorgang läuft danach weiter — durch die Ablage, also Zwischendatei,
   fsync und Umbenennen, vier Dateisystemschritte im Threadpool.

   Diese Prüfung stand deshalb zuerst auf einem festen `setTimeout(25)`. Das
   war keine Synchronisation, sondern eine Hoffnung: Unter Last kam der Wert
   später, der nächste Zugriff sah ein `zuletzt` von vor einer halben Stunde
   und die Sitzung verfiel — nicht weil die Logik falsch war, sondern weil
   die Prüfung schneller war als die Platte. In der Linux-CI ist sie genau
   daran umgefallen (Lauf #112).

   Es gibt keinen richtigen Zeitwert: Für die Dauer eines Schreibvorgangs
   existiert keine Obergrenze. Gewartet wird deshalb auf den Zustand, den
   der Schreibvorgang erzeugen muss. Die Frist darunter ist allein ein
   Sicherheitsnetz gegen eine Endlosschleife — wird sie erreicht, ist etwas
   kaputt, und die Meldung sagt was.
   -------------------------------------------------------------------------- */

/* Echte Millisekunden, nicht die Uhr der Prüfung: Diese Frist begrenzt das
   Warten auf die Platte, nicht die geprüfte Sitzungsdauer. Kleiner als das
   Zeitlimit eines Tests, sonst bricht vitest ab, bevor diese Meldung
   erscheint — und dann steht da „timed out" statt der Ursache. */
const WARTEFRIST = 3000;
/* Wie oft nachgesehen wird. Nicht kleiner: Bei fünf Millisekunden fällt das
   Nachsehen dem Schreibvorgang ins Handwerk — die Ablage schreibt über eine
   Zwischendatei und ein Umbenennen, und unter Windows scheitert das
   Umbenennen, solange die Zieldatei noch offen ist. Der Schreibvorgang
   verschluckt diesen Fehler (`.catch(() => {})`), und das Warten läuft in
   seine Frist. Gemessen: bei 5 ms neun Ausfälle unter vierundzwanzig
   Zugriffen, bei 10 und 25 ms keiner. Fünfundzwanzig kostet im Normalfall
   eine Runde und lässt der Platte Luft. */
const NACHSEHEN = 25;
/* Die Tests mit vielen Zugriffen warten je Zugriff auf die Platte. Auf einem
   ausgelasteten Läufer summiert sich das über die Voreinstellung von fünf
   Sekunden hinaus; gemessen bei vier Prüfläufen nebeneinander. Das Limit ist
   eine Grenze der Umgebung, keine fachliche Zusicherung — die Fristen, um
   die es geht, stehen in der Uhr der Prüfung. */
const LIMIT = 30000;
/* Unterhalb dieses Abstands schreibt sitzungLesen `zuletzt` nicht fort
   (VERLAENGERN_AB im Modul, dort nicht ausgeführt). Steht hier, damit die
   Hilfe nur dort wartet, wo ein Schreibvorgang überhaupt fällig ist. */
const DROSSEL = 60 * 1000;

/**
 * Wartet, bis der Sitzungseintrag den erwarteten `zuletzt`-Wert trägt.
 * Erfolgskriterium ist der Zustand; die Frist ist nur das Sicherheitsnetz.
 */
async function warteAufZuletzt(token, erwartet, was) {
  const speicher = S.sitzungsSpeicher();
  const schluessel = `t:${hash(token)}`;
  const spaetestens = Date.now() + WARTEFRIST;
  let gesehen = "(nie gelesen)";
  /* Erst dem Schreibvorgang Vorsprung lassen, dann nachsehen. Der Grund
     steht bei NACHSEHEN: Ein Lesezugriff, der genau zwischen Zwischendatei
     und Umbenennen fällt, lässt das Umbenennen auf Windows scheitern — und
     der Schreibvorgang wiederholt sich nicht. Wer zuerst nachsieht und dann
     wartet, erzeugt dieses Fenster bei jedem Versuch neu. */
  await new Promise((r) => setTimeout(r, NACHSEHEN));
  for (;;) {
    const e = await speicher.get(schluessel, { type: "json" }).catch(() => null);
    if (e && e.zuletzt === erwartet) return e;
    gesehen = e ? String(e.zuletzt) : "(Eintrag fehlt)";
    if (Date.now() >= spaetestens)
      throw new Error(`${was}: zuletzt=${erwartet} kam binnen ${WARTEFRIST} ms `
        + `nicht in der Ablage an (gesehen: ${gesehen}). Entweder schreibt `
        + `sitzungLesen nicht fort, oder die Ablage antwortet nicht.`);
    /* Kurz abgeben und erneut sehen — kein Teil des Erfolgskriteriums. */
    await new Promise((r) => setTimeout(r, NACHSEHEN));
  }
}

/**
 * Lesen wie die Anwendung — und anschließend abwarten, dass der nachlaufende
 * Schreibvorgang wirklich angekommen ist, sofern einer fällig war.
 */
const lies = async (token, u) => {
  const s = await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
  /* Ohne Sitzung gibt es keinen Eintrag mehr, auf den zu warten wäre; ein
     Sicherungsschlüssel wird nie fortgeschrieben. */
  if (!s || s.nurSicherung) return s;
  const faellig = !s.zuletzt || u.jetzt() - s.zuletzt > DROSSEL;
  if (faellig) await warteAufZuletzt(token, u.jetzt(), "nach einem Zugriff");
  return s;
};

describe("Anlegen", () => {
  it("gibt ein Merkmal aus 256 Bit zurück und legt nur dessen Prüfsumme ab", async () => {
    const u = uhr();
    const { token, gueltigBis } = await S.sitzungAnlegen(
      { bestand: "t-alpha", rolle: "leitung", name: "Alpha" }, undefined, { jetzt: u.jetzt });
    /* 32 Bytes base64url = 43 Zeichen ohne Polster. */
    expect(token).toHaveLength(43);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(gueltigBis).toBe(u.stand() + 12 * STUNDE);

    const speicher = S.sitzungsSpeicher();
    const abgelegt = await speicher.get(`t:${hash(token)}`, { type: "json" });
    expect(abgelegt.bestand).toBe("t-alpha");
    expect(abgelegt.seit).toBe(u.stand());
    expect(abgelegt.zuletzt).toBe(u.stand());
    /* Das Merkmal selbst steht nirgends. */
    const { blobs } = await speicher.list({ prefix: "t:" });
    for (const b of blobs) {
      expect(b.key).not.toContain(token);
      expect(await speicher.get(b.key, { type: "text" })).not.toContain(token);
    }
  });

  it("gibt für zwei Sitzungen zwei verschiedene Merkmale aus", async () => {
    const a = await S.sitzungAnlegen({ bestand: "t-a", rolle: "planer" });
    const b = await S.sitzungAnlegen({ bestand: "t-a", rolle: "planer" });
    expect(a.token).not.toBe(b.token);
  });

  it("nimmt die Dauer zur Rolle, wenn keine angegeben ist", async () => {
    expect(S.dauerFuer("betreiber")).toBe(2 * STUNDE);
    expect(S.dauerFuer("leitung")).toBe(12 * STUNDE);
    expect(S.dauerFuer(undefined)).toBe(12 * STUNDE);

    const u = uhr();
    const b = await S.sitzungAnlegen({ rolle: "betreiber" }, undefined, { jetzt: u.jetzt });
    expect(b.gueltigBis).toBe(u.stand() + 2 * STUNDE);
    const l = await S.sitzungAnlegen({ rolle: "leitung" }, undefined, { jetzt: u.jetzt });
    expect(l.gueltigBis).toBe(u.stand() + 12 * STUNDE);
  });
});

describe("Lesen", () => {
  it("gibt eine gültige Sitzung mit ihren Feldern zurück", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-beta", rolle: "subplaner",
      person: "p7", betrieb: 0, konto: "abc", einheit: "e1" }, undefined, { jetzt: u.jetzt });
    const s = await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    expect(s).toMatchObject({ bestand: "t-beta", rolle: "subplaner",
      person: "p7", konto: "abc", einheit: "e1" });
    expect(s.nurSicherung).toBeUndefined();
  });

  it("gibt ohne Kopf und bei unbekanntem Merkmal null zurück", async () => {
    const u = uhr();
    expect(await S.sitzungLesen(anfrage(null), { jetzt: u.jetzt })).toBe(null);
    expect(await S.sitzungLesen(anfrage(""), { jetzt: u.jetzt })).toBe(null);
    expect(await S.sitzungLesen(anfrage("gibtesnicht"), { jetzt: u.jetzt })).toBe(null);
    /* Kein „Bearer"-Vorsatz: derselbe Fall wie kein Kopf. */
    const ohneVorsatz = { headers: { get: () => "irgendwas" } };
    expect(await S.sitzungLesen(ohneVorsatz, { jetzt: u.jetzt })).toBe(null);
  });

  /* ------------------------------------------------------------------------
     DREI GRENZEN, JEDE FÜR SICH

     Zwei Fristen wirken übereinander: die absolute (12 h, Betreiber 2 h) und
     die Untätigkeit (30 min). Eine Sitzung, die nach dreizehn Stunden ohne
     Zugriff verfällt, beweist keine von beiden — sie hat beide gerissen.
     Jeder der folgenden Tests reißt deshalb genau eine Grenze und lässt die
     andere ausdrücklich intakt.

     Die absolute Frist wird über die Dauer geprüft, die `sitzungAnlegen`
     annimmt, nicht über zwölf Stunden simulierter Arbeit. Das ist dieselbe
     Zusicherung an einer kürzeren Strecke: Der Code vergleicht `bis` gegen
     `jetzt`, und woher `bis` kommt, ist ihm gleich. Dass es aus zwölf bzw.
     zwei Stunden entsteht, prüft „nimmt die Dauer zur Rolle".

     Dass Arbeit die Untätigkeit zurücksetzt, steht in einem eigenen Test —
     mit genau einem Fortschreiben statt vierundzwanzig. Jedes Fortschreiben
     ist ein nachlaufender Schreibvorgang, auf den die Prüfung warten muss;
     wenige davon sind belastbarer als viele.
     ------------------------------------------------------------------------ */

  it("beendet die Sitzung, wenn die absolute Frist reißt — auch ohne Untätigkeit", async () => {
    const u = uhr();
    /* Zwanzig Minuten Frist: kurz genug, dass ein Zugriff nach 25 Minuten
       sie reißt, und lang genug, dass dieselben 25 Minuten die Ruhegrenze
       von 30 Minuten NICHT reißen. Damit kann nur die absolute Frist den
       Verfall erklären. */
    const { token } = await S.sitzungAnlegen({ bestand: "t-gamma", rolle: "leitung" },
      20 * MINUTE, { jetzt: u.jetzt });
    u.vor(19 * MINUTE);
    expect(await lies(token, u), "kurz vor der Frist").toBeTruthy();
    u.vor(6 * MINUTE);             // 25 min: über der Frist, unter der Ruhe
    expect(await lies(token, u), "nach der Frist").toBe(null);
    const weg = await S.sitzungsSpeicher().get(`t:${hash(token)}`, { type: "json" })
      .catch(() => null);
    expect(weg).toBe(null);
  }, LIMIT);

  it("beendet die Sitzung nach dreißig Minuten Untätigkeit — lange vor der Frist", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-delta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    u.vor(29 * MINUTE);
    expect(await lies(token, u)).toBeTruthy();
    /* 31 Minuten Pause reißen die Ruhegrenze; 60 Minuten insgesamt liegen
       weit unter den zwölf Stunden. */
    u.vor(31 * MINUTE);
    expect(await lies(token, u)).toBe(null);
    expect(await S.sitzungsSpeicher().get(`t:${hash(token)}`, { type: "json" })
      .catch(() => null)).toBe(null);
  }, LIMIT);

  it("hält eine Sitzung über die Ruhegrenze hinaus, solange gearbeitet wird", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-theta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    /* Zwei Zugriffe mit 29 Minuten Abstand: Nach dem zweiten liegen 58
       Minuten seit dem Anlegen — fast das Doppelte der Ruhegrenze. Ohne
       Fortschreiben wäre die Sitzung beim zweiten Zugriff verfallen. */
    u.vor(29 * MINUTE);
    expect(await lies(token, u), "erster Zugriff").toBeTruthy();
    u.vor(29 * MINUTE);
    const s = await lies(token, u);
    expect(s, "zweiter Zugriff nach 58 Minuten").toBeTruthy();
    expect(s.seit).toBe(u.stand() - 58 * MINUTE);
  }, LIMIT);

  it("gibt einer Betreibersitzung zwei Stunden statt zwölf", async () => {
    const u = uhr();
    const { token, gueltigBis } = await S.sitzungAnlegen(
      { bestand: "t-eps", rolle: "betreiber" }, undefined, { jetzt: u.jetzt });
    /* Die kürzere Frist steht am Eintrag, nicht nur im Rückgabewert: Wer
       Datenräume anlegen kann, soll nicht zwölf Stunden lang auf einem
       fremden Rechner offen sein. */
    expect(gueltigBis).toBe(u.stand() + 2 * STUNDE);
    const abgelegt = await S.sitzungsSpeicher().get(`t:${hash(token)}`, { type: "json" });
    expect(abgelegt.bis).toBe(u.stand() + 2 * STUNDE);

    /* Und der Verfall greift an dieser Frist — bei einer Pause unter der
       Ruhegrenze, damit nur sie den Verfall erklären kann. Geprüft an einer
       kurzen eigenen Dauer, weil zwei Stunden Arbeit zu simulieren nichts
       hinzufügt: Verglichen wird `bis` gegen `jetzt`, und woher `bis` kommt,
       steht oben. */
    const u2 = uhr();
    const kurz = await S.sitzungAnlegen({ bestand: "t-eps2", rolle: "betreiber" },
      20 * MINUTE, { jetzt: u2.jetzt });
    u2.vor(25 * MINUTE);           // über der Frist, unter der Ruhegrenze
    expect(await lies(kurz.token, u2), "nach der Betreiberfrist").toBe(null);
  }, LIMIT);

  it("stellt die Uhr beim Zugriff neu — wer arbeitet, bleibt", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-zeta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    u.vor(2 * MINUTE);
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    /* Das Fortschreiben läuft ohne await — auf den Zustand warten, nicht
       auf die Uhr. */
    const nach = await warteAufZuletzt(token, u.stand(), "nach zwei Minuten");
    expect(nach.zuletzt).toBe(u.stand());
  }, LIMIT);

  it("schreibt `zuletzt` höchstens einmal je Minute fort", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-eta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    const speicher = S.sitzungsSpeicher();
    const anfang = (await speicher.get(`t:${hash(token)}`, { type: "json" })).zuletzt;

    u.vor(30 * 1000);                       // eine halbe Minute
    const halbeMinute = u.stand();
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    /* Hier ist kein Schreibvorgang fällig, also gibt es keinen Zustand, auf
       den man warten könnte — auf das Ausbleiben eines Ereignisses lässt
       sich nicht warten. Die Prüfung steht trotzdem, und der zweite Teil
       unten entscheidet den Fall eindeutig. */
    expect((await speicher.get(`t:${hash(token)}`, { type: "json" })).zuletzt).toBe(anfang);

    u.vor(31 * 1000);                       // zusammen über eine Minute
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    const nach = await warteAufZuletzt(token, u.stand(), "nach einundsechzig Sekunden");
    expect(nach.zuletzt).toBe(u.stand());
    /* Und damit ist auch das Ausbleiben des ersten Schreibvorgangs belegt:
       Hätte der Zugriff nach dreißig Sekunden fortgeschrieben, stünde
       `zuletzt` auf diesem Zeitpunkt — der zweite Zugriff läge dann nur
       einunddreißig Sekunden dahinter, also unter der Drossel, und hätte
       selbst nicht geschrieben. Der Wert von jetzt wäre nie erschienen. */
    expect(nach.zuletzt).not.toBe(halbeMinute);
  }, LIMIT);
});

describe("Sicherungsschlüssel", () => {
  it("trägt nurSicherung und kennt keine Untätigkeit", async () => {
    const u = uhr();
    const roh = "sicherungsschluessel-zum-pruefen";
    await S.sitzungsSpeicher().setJSON(S.sicherungsSchluessel(roh), {
      bestand: "t-theta", rolle: "leitung", nurSicherung: true,
      name: "Sicherungsschlüssel (Leitung)", bis: u.stand() + 90 * 24 * STUNDE,
    });
    const s = await S.sitzungLesen(anfrage(roh), { jetzt: u.jetzt });
    expect(s.nurSicherung).toBe(true);
    expect(s.bestand).toBe("t-theta");

    /* Tage ohne Zugriff ändern nichts — er wird nicht verlängert und
       verfällt nicht durch Untätigkeit. */
    u.vor(40 * 24 * STUNDE);
    const spaeter = await S.sitzungLesen(anfrage(roh), { jetzt: u.jetzt });
    expect(spaeter.nurSicherung).toBe(true);
  });

  it("verfällt mit seiner Frist und wird dann weggeräumt", async () => {
    const u = uhr();
    const roh = "abgelaufener-sicherungsschluessel";
    const schluessel = S.sicherungsSchluessel(roh);
    await S.sitzungsSpeicher().setJSON(schluessel, {
      bestand: "t-iota", rolle: "leitung", nurSicherung: true, bis: u.stand() + STUNDE,
    });
    u.vor(2 * STUNDE);
    expect(await S.sitzungLesen(anfrage(roh), { jetzt: u.jetzt })).toBe(null);
    expect(await S.sitzungsSpeicher().get(schluessel, { type: "json" })
      .catch(() => null)).toBe(null);
  });
});

describe("Beenden", () => {
  it("entfernt genau diese Sitzung", async () => {
    const u = uhr();
    const a = await S.sitzungAnlegen({ bestand: "t-kappa", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    const b = await S.sitzungAnlegen({ bestand: "t-kappa", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    expect(await S.sitzungBeenden(a.token)).toBe(true);
    expect(await S.sitzungLesen(anfrage(a.token), { jetzt: u.jetzt })).toBe(null);
    expect(await S.sitzungLesen(anfrage(b.token), { jetzt: u.jetzt })).toBeTruthy();
  });

  it("gelingt auch ohne und mit unbekanntem Merkmal, ohne zu werfen", async () => {
    expect(await S.sitzungBeenden(null)).toBe(false);
    expect(await S.sitzungBeenden("")).toBe(false);
    expect(await S.sitzungBeenden("gibtesnicht")).toBe(true);   // löschen ist idempotent
  });
});

describe("Merkmal aus dem Kopf", () => {
  it("liest genau den Bearer-Wert", () => {
    expect(S.merkmalAus(anfrage("abc"))).toBe("abc");
    expect(S.merkmalAus(anfrage(null))).toBe(null);
    expect(S.merkmalAus({ headers: { get: () => "Basic abc" } })).toBe(null);
    expect(S.merkmalAus({})).toBe(null);
  });
});
