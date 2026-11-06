/* ==========================================================================
   WP-47b — Lesebremse nach Bestandsgröße, eigene Feed-Bremse

   - Die Grenze je Raum für Bestandsabrufe sinkt mit der Dateigröße der
     Antwort (WP-28 Befund 5: Kenngröße ist die Bytezahl, nicht die Anzahl).
     Bei großen Beständen bleibt der gemeinsame Rechenkern unter Sättigung.
     Unbekannte Größe: die strengere Annahme (fail closed).
   - Der Kalender-Feed hat eine eigene Bremse je Geheimnis, 12–30 je Minute,
     fail closed: Ein Plattenfehler am Sperreintrag sperrt das Geheimnis.
   - Die Lesebremse für gewöhnliches Lesen bleibt unverändert nicht
     failClosed (bestehendes Verhalten, siehe bremse-lokal.test.js).

   Geprüft werden die echten Module; die Ablage bleibt darunter. Gezielte
   Störung nur über `stoerung` (wie bremse-lokal.test.js).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { aufbauen, WIRT } from "./hilfen/szenario.mjs";

const { stoerung } = vi.hoisted(() => ({ stoerung: { wirft: null } }));
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = await original();
  return {
    ...echt,
    getStore: (angabe) => {
      const s = echt.getStore(angabe);
      return new Proxy(s, {
        get(ziel, name) {
          const wert = ziel[name];
          if (typeof wert !== "function") return wert;
          return (...args) => {
            const key = typeof args[0] === "string" ? args[0]
              : args[0] && args[0].prefix !== undefined ? args[0].prefix : "";
            if (stoerung.wirft && stoerung.wirft(String(name), key)) {
              const e = new Error(`EIO: gestört (${String(name)} ${key})`);
              /** @type {any} */ (e).code = "EIO";
              return Promise.reject(e);
            }
            return wert.apply(ziel, args);
          };
        },
      });
    },
  };
});

let Z, SCH, LESEN_GROESSE_UNBEKANNT;
let zaehler = 0;
const LIMIT = 60000;

beforeAll(async () => {
  Z = await aufbauen("wp47b-lesebremse");
  SCH = await import("../server/lib/schutz.mjs");
  LESEN_GROESSE_UNBEKANNT = SCH.LESEN_GROESSE_UNBEKANNT;
}, LIMIT);

afterAll(async () => {
  stoerung.wirft = null;
  await Z.abbauen();
});

beforeEach(async () => {
  stoerung.wirft = null;
  await Z.taktLeeren();
});

const neuerKey = (was) => `wp47b-${was}-${++zaehler}-${Date.now()}`;

describe("Lesebremse nach Bestandsgröße (lesenGrenze)", () => {
  it("ein 4,6-MB-Bestand bleibt unter der gemessenen Sättigung (≈ 200 Antworten/min)", () => {
    const n = SCH.lesenGrenze(4_600_000);
    expect(n).toBeLessThanOrEqual(150);
    expect(n).toBeGreaterThanOrEqual(100);
  });

  it("kleine Bestände bekommen die volle Grenze des Lesens", () => {
    expect(SCH.lesenGrenze(50_000)).toBe(SCH.GRENZEN.lesen.versuche);
  });

  it("die Grenze sinkt mit der Größe und steigt nie wieder", () => {
    const groessen = [100_000, 1_000_000, 2_000_000, 4_600_000, 10_000_000, 40_000_000];
    const werte = groessen.map((g) => SCH.lesenGrenze(g));
    for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThanOrEqual(werte[i - 1]);
  });

  it("unbekannte, leere oder ungültige Größe: die strenge Annahme (fail closed)", () => {
    const streng = SCH.lesenGrenze(LESEN_GROESSE_UNBEKANNT);
    for (const v of [undefined, null, 0, -5, NaN])
      expect(SCH.lesenGrenze(v)).toBe(streng);
    expect(streng).toBeLessThanOrEqual(SCH.lesenGrenze(4_600_000));
    expect(streng).toBeGreaterThanOrEqual(1);
  });

  it("nie null, nie 0: die Grenze ist mindestens 1", () => {
    expect(SCH.lesenGrenze(10 ** 12)).toBeGreaterThanOrEqual(1);
  });
});

describe("bremse(): eigene Grenze je Aufruf", () => {
  it("mit versuche: 3 lässt drei durch und bremst den vierten (429-Pfad mit Wartezeit)", async () => {
    const k = neuerKey("opt");
    const stati = [];
    for (let i = 0; i < 4; i++) stati.push(await SCH.bremse("lesen", k, undefined, { versuche: 3 }));
    expect(stati.slice(0, 3).every((b) => b.frei)).toBe(true);
    expect(stati[3].frei).toBe(false);
    expect(stati[3].wartet).toBeGreaterThan(0);
  });

  it("ohne Angabe gilt weiter GRENZEN[art]", async () => {
    const k = neuerKey("ohne");
    const b = await SCH.bremse("lesen", k);
    expect(b.frei).toBe(true);
    expect(b.uebrig).toBe(SCH.GRENZEN.lesen.versuche - 1);
  });
});

describe("Feed-Bremse je Geheimnis", () => {
  it("eigene Grenze: 12–30 je Minute, fail closed", () => {
    const g = SCH.GRENZEN.feed;
    expect(g, "GRENZEN.feed fehlt").toBeTruthy();
    expect(g.versuche).toBeGreaterThanOrEqual(12);
    expect(g.versuche).toBeLessThanOrEqual(30);
    expect(g.fenster).toBe(60);
    expect(g.failClosed).toBe(true);
  });

  it("der 31. Abruf je Geheimnis in einer Minute ist gebremst", async () => {
    const k = neuerKey("feed");
    const stati = [];
    for (let i = 0; i < 31; i++) stati.push(await SCH.bremse("feed", k));
    expect(stati.slice(0, 30).every((b) => b.frei)).toBe(true);
    expect(stati[30].frei).toBe(false);
    expect(stati[30].wartet).toBeGreaterThan(0);
  }, LIMIT);

  it("ein anderes Geheimnis wird davon nicht gebremst", async () => {
    const a = neuerKey("feed-a");
    const b = neuerKey("feed-b");
    for (let i = 0; i < 31; i++) await SCH.bremse("feed", a);
    expect((await SCH.bremse("feed", b)).frei).toBe(true);
  });

  it("Plattenfehler am Sperreintrag sperrt das Geheimnis (fail closed), nie stumm frei", async () => {
    const k = neuerKey("feed-platte");
    stoerung.wirft = (methode, key) => methode === "get" && key.startsWith("sperre:");
    const stati = [];
    for (let i = 0; i < 3; i++) stati.push(await SCH.bremse("feed", k));
    expect(stati.every((b) => b.frei === false), JSON.stringify(stati[0])).toBe(true);
    expect(stati.every((b) => typeof b.fehler === "string" && b.fehler.length > 0)).toBe(true);
  });
});

describe("Kalender-Feed: der 429-Pfad über den echten Handler", () => {
  it("der 31. Abruf eines Geheimnisses bekommt 429 mit Retry-After, ein anderes Geheimnis nicht", async () => {
    const geheim = `geheim-${neuerKey("http")}-${"x".repeat(24)}`;
    const andere = `geheim-${neuerKey("http-b")}-${"y".repeat(24)}`;
    const abruf = (g) => Z.kalender(new Request(`http://${WIRT}/kalender/feed/${g}.ics`,
      { headers: { host: WIRT, "x-forwarded-for": "198.51.100.77" } }), {});
    const stati = [];
    let letzte = null;
    for (let i = 0; i < 31; i++) { letzte = await abruf(geheim); stati.push(letzte.status); }
    expect(stati.slice(0, 30).some((s) => s === 429)).toBe(false);
    expect(stati[30]).toBe(429);
    expect(Number(letzte.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await abruf(andere)).status).not.toBe(429);
  }, LIMIT);
});

describe("Quelltext: die Bremsen sind verdrahtet", () => {
  it("kalender.mjs bremst den Feed mit eigener Art, nicht mit „lesen“", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/kalender.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/bremse\("feed",/);
    expect(quelle).not.toMatch(/bremse\("lesen", `f:/);
  });

  it("daten.mjs setzt die Grenze des Bestandsabrufs nach Größe", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/bremse\("lesen", kennung\(req, s\), undefined,\s*\{ versuche: lesenGrenze\(/);
  });

  it("die Größe je Raum ist je Stand zwischengespeichert: ein neuer Stand widerruft den Eintrag", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/alt\.stand === mit\.stand/);
    expect(quelle).toMatch(/raumBytes\.set\(String\(raum\), \{ stand: mit\.stand, bytes \}\)/);
  });
});
