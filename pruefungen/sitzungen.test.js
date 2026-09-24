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

/* Lesen und die Uhr im Eintrag nachziehen lassen.

   `sitzungLesen` schreibt `zuletzt` absichtlich ohne await: Eine Anfrage
   soll nicht auf einen Schreibvorgang warten, der sie nichts angeht. Für
   die Prüfung heißt das, dass zwischen zwei Zugriffen ein Atemzug liegen
   muss — sonst prüft sie nicht die Fristen, sondern ein Rennen. */
const lies = async (token, u) => {
  const s = await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
  await new Promise((r) => setTimeout(r, 25));
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

  it("beendet die Sitzung nach zwölf Stunden und räumt sie weg", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-gamma", rolle: "leitung" },
      undefined, { jetzt: u.jetzt });
    /* Kurz davor, aber mit Betrieb dazwischen (sonst greift die Ruhe). */
    for (let i = 0; i < 24; i++) {
      u.vor(29 * MINUTE);
      expect(await lies(token, u), `Zugriff ${i}`).toBeTruthy();
    }
    u.vor(40 * MINUTE);            // jetzt über zwölf Stunden seit `seit`
    expect(await lies(token, u)).toBe(null);
    const weg = await S.sitzungsSpeicher().get(`t:${hash(token)}`, { type: "json" })
      .catch(() => null);
    expect(weg).toBe(null);
  });

  it("beendet die Sitzung nach dreißig Minuten Untätigkeit", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-delta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    u.vor(29 * MINUTE);
    expect(await lies(token, u)).toBeTruthy();
    u.vor(31 * MINUTE);
    expect(await lies(token, u)).toBe(null);
    expect(await S.sitzungsSpeicher().get(`t:${hash(token)}`, { type: "json" })
      .catch(() => null)).toBe(null);
  });

  it("beendet eine Betreibersitzung nach zwei Stunden", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-eps", rolle: "betreiber" },
      undefined, { jetzt: u.jetzt });
    for (let i = 0; i < 4; i++) {
      u.vor(25 * MINUTE);
      expect(await lies(token, u), `Zugriff ${i}`).toBeTruthy();
    }
    u.vor(25 * MINUTE);            // über zwei Stunden
    expect(await lies(token, u)).toBe(null);
  });

  it("stellt die Uhr beim Zugriff neu — wer arbeitet, bleibt", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-zeta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    const speicher = S.sitzungsSpeicher();
    u.vor(2 * MINUTE);
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    /* Das Fortschreiben läuft ohne await — einmal durchatmen. */
    await new Promise((r) => setTimeout(r, 30));
    const nach = await speicher.get(`t:${hash(token)}`, { type: "json" });
    expect(nach.zuletzt).toBe(u.stand());
  });

  it("schreibt `zuletzt` höchstens einmal je Minute fort", async () => {
    const u = uhr();
    const { token } = await S.sitzungAnlegen({ bestand: "t-eta", rolle: "planer" },
      undefined, { jetzt: u.jetzt });
    const speicher = S.sitzungsSpeicher();
    const anfang = (await speicher.get(`t:${hash(token)}`, { type: "json" })).zuletzt;

    u.vor(30 * 1000);                       // eine halbe Minute
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    await new Promise((r) => setTimeout(r, 30));
    expect((await speicher.get(`t:${hash(token)}`, { type: "json" })).zuletzt).toBe(anfang);

    u.vor(31 * 1000);                       // zusammen über eine Minute
    await S.sitzungLesen(anfrage(token), { jetzt: u.jetzt });
    await new Promise((r) => setTimeout(r, 30));
    expect((await speicher.get(`t:${hash(token)}`, { type: "json" })).zuletzt).toBe(u.stand());
  });
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
