/* ==========================================================================
   BREMSE — der prozesslokale Zähler und entlasten()

   bremse() zählt Versuche an drei Stellen: in der Ablage, optional atomar
   im Fremddienst und in einer Karte im Speicher des Prozesses. entlasten()
   nimmt nach einem Erfolg alle drei zurück — der Speicher wurde dabei
   lange übersehen, was auf kurzlebigen Funktionsinstanzen nicht auffiel.
   Auf einem dauerhaften Server hätte es nach acht Anmeldungen hinter
   derselben Adresse auch die richtigen ausgesperrt. Das darf nicht wieder
   passieren.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Gezielte Störungen der Ablage. Die echte Ablage bleibt darunter; nur wenn
   `stoerung` für eine Methode und einen Schlüssel ja sagt, wirft der Aufruf
   wie ein Plattenfehler (EIO). `haelt` liefert für einen Aufruf optional ein
   Versprechen, auf das er vor der echten Ablage wartet (gleichzeitige Anfragen
   in der Schwebe halten). */
const { stoerung } = vi.hoisted(() => ({ stoerung: { wirft: null, haelt: null } }));
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = await original();
  return {
    ...echt,
    getStore: (angabe) => {
      const s = echt.getStore(angabe);
      const ablage = typeof angabe === "string" ? angabe : angabe && angabe.name;
      return new Proxy(s, {
        get(ziel, name) {
          const wert = ziel[name];
          if (typeof wert !== "function") return wert;
          return (...args) => {
            const key = typeof args[0] === "string" ? args[0]
              : args[0] && args[0].prefix !== undefined ? args[0].prefix : "";
            if (stoerung.wirft && stoerung.wirft(String(name), key, ablage)) {
              const e = new Error(`EIO: gestört (${String(name)} ${key})`);
              /** @type {any} */ (e).code = "EIO";
              return Promise.reject(e);
            }
            const halt = stoerung.haelt && stoerung.haelt(String(name), key, ablage);
            if (halt) return halt.then(() => wert.apply(ziel, args));
            return wert.apply(ziel, args);
          };
        },
      });
    },
  };
});

let wurzel, bremse, entlasten, GRENZEN, WEITERE, notbremse, NOTGRENZEN;

/* Jeder Bremsaufruf geht mehrfach auf die Platte; auf einem belasteten
   Rechner dauert eine Reihe von hundert Aufrufen mehr als fünf Sekunden. */
vi.setConfig({ testTimeout: 30000 });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-bremse-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  delete process.env.REDIS_REST_URL;
  ({ bremse, entlasten, GRENZEN, WEITERE, notbremse, NOTGRENZEN } = await import("../server/lib/schutz.mjs"));
});

afterEach(() => {
  stoerung.wirft = null;
  stoerung.haelt = null;
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

/** Ein Zeitpunkt `vorMs` vor einer vollen Fenstergrenze von `fenster` Sekunden. */
function vorGrenze(fenster, vorMs) {
  const p = fenster * 1000;
  const grenze = Math.ceil((Date.now() + 10 * p) / p) * p;
  return grenze - vorMs;
}

/** Index (1-basiert) des ersten gebremsten Versuchs, sonst null. */
const ersteSperre = (liste) => { const i = liste.findIndex((b) => b.frei === false); return i < 0 ? null : i + 1; };

describe("Die Bremse für das Anmelden", () => {
  it("lässt so viele Fehlversuche zu, wie die Grenze nennt, und dann keinen mehr", async () => {
    const k = "a:fehlversuche";
    for (let i = 1; i <= GRENZEN.anmelden.versuche; i++)
      expect((await bremse("anmelden", k)).frei, `Versuch ${i}`).toBe(true);
    const zuViel = await bremse("anmelden", k);
    expect(zuViel.frei).toBe(false);
    expect(zuViel.wartet).toBeGreaterThan(0);
  });

  it("hält die Sperre auch über den lokalen Zähler hinaus", async () => {
    /* Einmal gesperrt, bleibt gesperrt — unabhängig davon, welcher der
       drei Zähler die Grenze gerissen hat. */
    expect((await bremse("anmelden", "a:fehlversuche")).frei).toBe(false);
  });

  it("zählt erfolgreiche Anmeldungen nicht gegen die Adresse", async () => {
    /* Das Bild aus dem Betrieb: eine Station, ein Anschluss, ein Dutzend
       Personen, die sich nacheinander mit richtigem Code anmelden. */
    const k = "a:station";
    for (let i = 1; i <= GRENZEN.anmelden.versuche * 2; i++) {
      const b = await bremse("anmelden", k);
      expect(b.frei, `Anmeldung ${i}`).toBe(true);
      await entlasten("anmelden", k);
    }
  });

  it("setzt nach einem Erfolg auch den Speicherzähler zurück", async () => {
    const k = "a:vertippt";
    const fast = GRENZEN.anmelden.versuche - 1;
    for (let i = 0; i < fast; i++) expect((await bremse("anmelden", k)).frei).toBe(true);
    await entlasten("anmelden", k);                       // richtig eingegeben
    for (let i = 0; i < fast; i++)                        // wieder vertippt — von vorn gezählt
      expect((await bremse("anmelden", k)).frei, `nach Erfolg, Versuch ${i + 1}`).toBe(true);
  });

  it("entlastet nur die genannte Kennung", async () => {
    const k1 = "a:eins", k2 = "a:zwei";
    for (let i = 0; i < GRENZEN.anmelden.versuche; i++) { await bremse("anmelden", k1); await bremse("anmelden", k2); }
    await entlasten("anmelden", k1);
    expect((await bremse("anmelden", k1)).frei).toBe(true);
    expect((await bremse("anmelden", k2)).frei).toBe(false);
  });
});

/* ==========================================================================
   FENSTERGRENZE (WP-46)

   Das Zählfenster war fest: An jeder vollen Fünf-Minuten-Grenze begannen alle
   Zähler bei null. Lag die Grenze mitten in einer Versuchsreihe, kamen bis zu
   zweimal acht Fehlversuche durch — belegt im CI-Lauf 41493388310 (14 × 401,
   gesperrt ab „nie“). Jetzt zählt das vorige Fenster anteilig mit.
   ========================================================================== */
describe("Die Bremse an der Fenstergrenze", () => {
  it("sperrt spätestens beim neunten Versuch, auch wenn eine Grenze mitten in der Reihe liegt (CI-Bild)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = vorGrenze(GRENZEN.anmelden.fenster, 1800);
    const stati = [];
    for (let i = 0; i < 14; i++) {
      vi.setSystemTime(start + i * 250);
      stati.push(await bremse("anmelden", "a:grenze-ci"));
    }
    const ab = ersteSperre(stati);
    expect(ab, JSON.stringify(stati.map((b) => b.frei))).not.toBeNull();
    expect(ab).toBeLessThanOrEqual(GRENZEN.anmelden.versuche + 1);
    expect(stati.slice(ab - 1).every((b) => b.frei === false)).toBe(true);
  });

  it("hält die Grenze für jede Lage der Grenze innerhalb der Reihe", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = GRENZEN.anmelden;
    for (let vorher = 1; vorher <= g.versuche; vorher++) {
      const k = `a:grenze-lage-${vorher}`;
      /* `vorher` Versuche kurz vor der Grenze, der Rest kurz danach. */
      const basis = vorGrenze(g.fenster, vorher * 100 - 50);
      const stati = [];
      for (let i = 0; i < g.versuche + 4; i++) {
        vi.setSystemTime(basis + i * 100);
        stati.push(await bremse("anmelden", k));
      }
      const ab = ersteSperre(stati);
      expect(ab, `Grenze nach ${vorher} Versuchen: ${JSON.stringify(stati.map((b) => b.frei))}`)
        .not.toBeNull();
      expect(ab).toBeLessThanOrEqual(g.versuche + 1);
    }
  });

  it("vergisst alte Versuche: ein volles Fenster später ist wieder alles frei", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = GRENZEN.anmelden;
    const start = vorGrenze(g.fenster, 1000);
    for (let i = 0; i < g.versuche; i++) {
      vi.setSystemTime(start + i * 10);
      expect((await bremse("anmelden", "a:vergessen")).frei).toBe(true);
    }
    const spaeter = start + 1000 + g.fenster * 1000 + 1000;
    for (let i = 0; i < g.versuche; i++) {
      vi.setSystemTime(spaeter + i * 10);
      expect((await bremse("anmelden", "a:vergessen")).frei, `Versuch ${i + 1}`).toBe(true);
    }
  });

  it("entlastet nach einem Erfolg auch das vorige Fenster", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = GRENZEN.anmelden;
    const start = vorGrenze(g.fenster, 500);
    for (let i = 0; i < g.versuche - 1; i++) {                 // vertippt, kurz vor der Grenze
      vi.setSystemTime(start + i * 10);
      expect((await bremse("anmelden", "a:ueber-grenze")).frei).toBe(true);
    }
    vi.setSystemTime(start + 1000);                            // nach der Grenze: richtig
    await entlasten("anmelden", "a:ueber-grenze");
    for (let i = 0; i < g.versuche - 1; i++) {
      vi.setSystemTime(start + 1000 + i * 10);
      expect((await bremse("anmelden", "a:ueber-grenze")).frei, `nach Erfolg, Versuch ${i + 1}`).toBe(true);
    }
  });

  it("nach Ablauf der Sperre ist der erste Versuch frei — erneuter Missbrauch steigert weiter", async () => {
    /* Review N1: Das vorige Fenster zählte nach der Sperre gewichtet weiter.
       Wer Retry-After befolgte, wurde sofort wieder gesperrt, doppelt so
       lange. Die Sperre trägt die Strafe, der Zählstand wird beim Sperren
       geleert. */
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = GRENZEN.anmelden;
    const k = "a:retry-after";
    const p = g.fenster * 1000;
    const start = Math.ceil((Date.now() + 10 * p) / p) * p + 10000;   // 10 s nach Fensterbeginn
    let b;
    for (let i = 0; i <= g.versuche; i++) {
      vi.setSystemTime(start + i * 100);
      b = await bremse("anmelden", k);
    }
    expect(b.frei).toBe(false);
    expect(b.wartet).toBe(g.sperre);
    const nach = start + g.versuche * 100 + (b.wartet + 1) * 1000;
    vi.setSystemTime(nach);
    const erster = await bremse("anmelden", k);
    expect(erster.frei, JSON.stringify(erster)).toBe(true);
    /* Wer danach wieder anrennt, wird wieder gesperrt — mit doppelter Dauer. */
    let zweite = erster, n = 1;
    while (zweite.frei && n < 3 * g.versuche) {
      vi.setSystemTime(nach + n * 100);
      zweite = await bremse("anmelden", k);
      n++;
    }
    expect(zweite.frei).toBe(false);
    expect(n).toBe(g.versuche + 1);
    expect(zweite.wartet).toBe(g.sperre * 2);
  });

  it("entlastet auch den atomaren Zähler (laufendes und voriges Fenster)", async () => {
    /* Review N3: entlasten() ließ die Redis-Schlüssel stehen. */
    const aufrufe = [];
    vi.stubGlobal("fetch", async (url, init) => {
      aufrufe.push({ url: String(url), rumpf: JSON.parse(init.body) });
      return new Response(JSON.stringify([{ result: 1 }, { result: 1 }, { result: null }]),
        { status: 200, headers: { "content-type": "application/json" } });
    });
    process.env.REDIS_REST_URL = "https://redis.invalid";
    process.env.REDIS_REST_TOKEN = "nur-pruefung";
    try {
      await entlasten("anmelden", "a:redis");
    } finally {
      delete process.env.REDIS_REST_URL;
      delete process.env.REDIS_REST_TOKEN;
      vi.unstubAllGlobals();
    }
    const f = Math.floor(Date.now() / 1000 / GRENZEN.anmelden.fenster);
    const geloescht = aufrufe.flatMap((a) => a.rumpf).filter((c) => c[0] === "DEL").map((c) => c[1]);
    expect(geloescht).toContain(encodeURIComponent(`centric:takt:anmelden:a:redis:${f}`));
    expect(geloescht).toContain(encodeURIComponent(`centric:takt:anmelden:a:redis:${f - 1}`));
  });

  it("gilt auch für die Notbremse", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const n = NOTGRENZEN["anmelden-konto"];
    const start = vorGrenze(n.fenster, 1000);
    const stati = [];
    for (let i = 0; i < 2 * n.versuche - 2; i++) {             // je knapp unter der Grenze je Fenster
      vi.setSystemTime(start + Math.floor(i * 2000 / (2 * n.versuche - 2)));
      stati.push(notbremse("anmelden-konto", "a:not-grenze"));
    }
    const ab = ersteSperre(stati);
    expect(ab, JSON.stringify(stati.map((b) => b.frei))).not.toBeNull();
    expect(ab).toBeLessThanOrEqual(n.versuche + 1);
  });
});

/* ==========================================================================
   FAIL-CLOSED (WP-46)

   Vorher gab bremse() bei jeder Ausnahme der Ablage `{frei: true}` zurück —
   und der Speicherzähler lief erst nach den Ablagezugriffen, eine frühe
   Ausnahme übersprang ihn also mit. Ein beschädigter Sperreintrag öffnete
   die Bremse damit dauerhaft. Jetzt: Ablagefehler → weiterzählen im
   Prozessspeicher; unlesbarer Sperreintrag → gesperrt.
   ========================================================================== */
describe("Die Bremse bei kaputter Ablage", () => {
  it("bleibt gesperrt, wenn der Sperreintrag beschädigt ist", async () => {
    const k = "a:kaputte-sperre";
    for (let i = 0; i <= GRENZEN.anmelden.versuche; i++) await bremse("anmelden", k);
    expect((await bremse("anmelden", k)).frei).toBe(false);
    const ort = path.join(wurzel, "centric-takt");
    const datei = (await readdir(ort)).find((n) => n.startsWith("sperre%3Aanmelden%3Aa%3Akaputte-sperre"));
    expect(datei).toBeTruthy();
    await writeFile(path.join(ort, datei), "{kaputt");
    const danach = [];
    for (let i = 0; i < 20; i++) danach.push(await bremse("anmelden", k));
    expect(danach.every((b) => b.frei === false), JSON.stringify(danach[0])).toBe(true);
    expect(danach[0].wartet).toBeGreaterThan(0);
  });

  it("lässt nichts durch, wenn sich die Sperre nicht schreiben lässt", async () => {
    const k = "a:sperre-unschreibbar";
    stoerung.wirft = (methode, key) => methode === "setJSON" && key.startsWith("sperre:");
    const stati = [];
    for (let i = 0; i < GRENZEN.anmelden.versuche + 6; i++) stati.push(await bremse("anmelden", k));
    expect(stati.slice(0, GRENZEN.anmelden.versuche).every((b) => b.frei)).toBe(true);
    expect(stati.slice(GRENZEN.anmelden.versuche).every((b) => b.frei === false),
      JSON.stringify(stati.slice(GRENZEN.anmelden.versuche))).toBe(true);
  });

  it("zählt bei Schreib- und Listenausfall im Prozessspeicher weiter", async () => {
    const k = "a:ablage-weg";
    stoerung.wirft = (methode) => methode !== "get";
    const stati = [];
    for (let i = 0; i < GRENZEN.anmelden.versuche + 6; i++) stati.push(await bremse("anmelden", k));
    expect(stati.slice(0, GRENZEN.anmelden.versuche).every((b) => b.frei)).toBe(true);
    expect(stati.slice(GRENZEN.anmelden.versuche).every((b) => b.frei === false)).toBe(true);
    /* Der Ausfall bleibt nicht stumm. */
    expect(stati.every((b) => typeof b.fehler === "string" && b.fehler.length > 0)).toBe(true);
  });

  it("lässt nichts durch, wenn sich der Sperreintrag nicht lesen lässt (Plattenfehler)", async () => {
    /* Eine Langzeitsperre aus einem früheren Prozess: Im Speicher ist von
       ihr nichts bekannt. Ein Lesefehler darf sie nicht übergehen. */
    const k = "a:sperre-unlesbar-eio";
    const { getStore } = await import("../server/lib/ablage.mjs");
    const jetzt = Math.floor(Date.now() / 1000);
    await getStore({ name: "centric-takt" }).setJSON(`sperre:anmelden:${k}`, { bis: jetzt + 7200, seit: jetzt, stufe: 4 });
    stoerung.wirft = (methode, key) => methode === "get" && key.startsWith("sperre:");
    const stati = [];
    for (let i = 0; i < 5; i++) stati.push(await bremse("anmelden", k));
    expect(stati.every((b) => b.frei === false), JSON.stringify(stati[0])).toBe(true);
    expect(stati.every((b) => typeof b.fehler === "string")).toBe(true);
    /* Ist die Ablage wieder da, gilt die gespeicherte Sperre — sie wurde
       nicht durch eine kürzere ersetzt. */
    stoerung.wirft = null;
    const b = await bremse("anmelden", k);
    expect(b.frei).toBe(false);
    expect(b.wartet).toBeGreaterThan(GRENZEN.anmelden.sperre);
  });

  it("Plattenfehler am Sperreintrag: lesen bleibt frei (gezählt), anmelden gesperrt", async () => {
    /* Nur sicherheitskritische Arten (failClosed) sperren bei einem
       Lesefehler der Sperre. Lesen, Schreiben und Co. zählen degradiert im
       Speicher weiter — ein Plattenfehler im Zählerstore soll nicht die
       ganze Anwendung lahmlegen. */
    stoerung.wirft = (methode, key) => methode === "get" && key.startsWith("sperre:");
    const lesen = [];
    for (let i = 0; i < 5; i++) lesen.push(await bremse("lesen", "s:platte-lesen"));
    expect(lesen.every((b) => b.frei === true), JSON.stringify(lesen[0])).toBe(true);
    expect(lesen.every((b) => typeof b.fehler === "string")).toBe(true);
    /* Gezählt wird trotzdem: über der Grenze ist auch Lesen zu. */
    let b = lesen[4], n = 5;
    while (b.frei && n < GRENZEN.lesen.versuche + 5) { b = await bremse("lesen", "s:platte-lesen"); n++; }
    expect(b.frei).toBe(false);
    expect(n).toBe(GRENZEN.lesen.versuche + 1);

    const anm = await bremse("anmelden", "a:platte-anmelden");
    expect(anm.frei).toBe(false);
    expect(typeof anm.fehler).toBe("string");
    for (const art of ["anmelden", "anmelden-konto", "registrierung", "starten", "einrichten", "zugaenge", "demo"])
      expect(GRENZEN[art].failClosed, art).toBe(true);
    for (const art of ["lesen", "schreiben", "zustellen", "sicherung", "wiederherstellen"])
      expect(GRENZEN[art].failClosed, art).toBeFalsy();
  });

  it("zählt Versuche vor dem Ausfall mit", async () => {
    const k = "a:ablage-faellt-aus";
    const stati = [];
    for (let i = 0; i < 5; i++) stati.push(await bremse("anmelden", k));
    stoerung.wirft = () => true;
    for (let i = 0; i < GRENZEN.anmelden.versuche; i++) stati.push(await bremse("anmelden", k));
    const ab = ersteSperre(stati);
    expect(ab).not.toBeNull();
    expect(ab).toBeLessThanOrEqual(GRENZEN.anmelden.versuche + 1);
  });

  it("gibt dem Zugangscode-Anmelden eine Notbremse", () => {
    const n = NOTGRENZEN.anmelden;
    expect(n).toBeTruthy();
    expect(n.fenster).toBe(GRENZEN.anmelden.fenster);
    let b = { frei: true }, i = 0;
    while (b.frei && i < 100) { b = notbremse("anmelden", "a:not-code"); i++; }
    expect(b.frei).toBe(false);
    expect(i).toBe(n.versuche + 1);
  });
});

/* ==========================================================================
   ÜBER DEN ECHTEN ENDPUNKT: /api/anmelden (daten.mjs, WP-46)

   Der Zugangscode-Weg hatte als einziger Anmeldeweg keine Notbremse, und ein
   Ausfall der Zählerablage blieb ohne Protokoll. Mit der alten fail-open-
   Bremse hieß das: kaputte Ablage → unbegrenzt viele Versuche, unbemerkt
   (vorher gemessen: 12 × 401, kein 429). Am Ende der Datei, weil die
   Notbremse hier bis zur Gesamtgrenze gefüllt wird.
   ========================================================================== */
describe("/api/anmelden", () => {
  const WIRT = "127.0.0.1:3000";
  let daten, spurLesen;
  beforeAll(async () => {
    process.env.CENTRIC_PFEFFER = process.env.CENTRIC_PFEFFER || "pfeffer-nur-zum-pruefen-0123456789";
    daten = (await import("../server/funktionen/daten.mjs")).default;
    ({ spurLesen } = await import("../server/lib/schutz.mjs"));
  });

  const anmelden = async (code, herkunft) => {
    const a = await daten(new Request(`http://${WIRT}/api/anmelden`, {
      method: "POST",
      headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
        "x-forwarded-for": herkunft },
      body: JSON.stringify({ zugangscode: code }),
    }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };

  it("sperrt bei kaputter Zählerablage spätestens beim neunten Fehlversuch und protokolliert den Ausfall", async () => {
    /* Nur die Zählerablage fällt aus; Konten und Protokoll bleiben heil. */
    stoerung.wirft = (methode, key, ablage) => ablage === "centric-takt";
    const stati = [];
    for (let i = 0; i < GRENZEN.anmelden.versuche + 4; i++)
      stati.push((await anmelden(`XXXX-XXXX-${String(i).padStart(4, "0")}`, "10.46.0.1")).status);
    stoerung.wirft = null;
    const ab = stati.indexOf(429) + 1;
    expect(ab, JSON.stringify(stati)).toBeGreaterThan(0);
    expect(ab).toBeLessThanOrEqual(GRENZEN.anmelden.versuche + 1);
    expect(stati.slice(ab - 1).every((s) => s === 429)).toBe(true);
    const spur = await spurLesen(1);
    expect(spur.some((z) => z.art === "anmelden" && z.ausgang === "bremse-ausfall")).toBe(true);
  }, 60000);

  it("hat eine Notbremse: erschöpftes Gesamtaufkommen weist auch eine unbelastete Herkunft ab", async () => {
    let n = { frei: true }, i = 0;
    while (n.frei && i < 2000) { n = notbremse("anmelden", `a:fuellung${i}`); i++; }
    expect(n.dimension).toBe("gesamt");
    const e = await anmelden("XXXX-XXXX-9999", "10.46.9.9");
    expect(e.status, JSON.stringify(e)).toBe(429);
    expect(Number(e.wartet)).toBeGreaterThan(0);
  }, 60000);
});

/* ==========================================================================
   GLEICHZEITIGE ANFRAGEN: die wirksame Grenze ist die eingestellte (CI zu #277)

   Die Mitzählung schwebender Anfragen (A-2 globale Grenze, Parallelprüfung) galt
   zuerst für JEDE Art mit Ziel- oder Gesamtgrenze. Sie zählt im Zweifel doppelt —
   bei der Anmeldung griff die Bremse dann schon bei etwa der Hälfte der Grenze, und
   ein Bündel von Fehlversuchen wurde abgewiesen, bevor es ausgewertet war
   (anmeldesperre I7b). Jetzt nur noch für einladung-nachweis. Für alle anderen gilt:
   genau so viele gleichzeitige Versuche wie die Grenze nennt kommen durch, der
   nächste nicht.
   ========================================================================== */
describe("Gleichzeitige Anfragen: keine vorzeitige Sperre", () => {
  /** Ein frischer Zeitpunkt kurz nach einer vollen Stunde, `tage` Tage voraus — leere Fenster für Ziel und Gesamt. */
  const frisch = (tage) => {
    const p = 3600 * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Math.ceil((Date.now() + tage * 86400 * 1000) / p) * p + 1000);
  };

  for (const [art, tage] of [["anmelden", 40], ["anmelden-konto", 41], ["registrierung", 42]]) {
    it(`${art}: so viele gleichzeitige Versuche einer Kennung, wie die Grenze nennt, kommen alle durch; der nächste nicht`, async () => {
      frisch(tage);
      const n = GRENZEN[art].versuche;
      const k = `a:gleichzeitig-kennung-${art}`;
      const erg = await Promise.all(Array.from({ length: n }, (_, i) => bremse(art, k, `z-kennung-${art}-${i}`)));
      expect(erg.map((b) => b.frei), JSON.stringify(erg)).toEqual(Array(n).fill(true));
      expect((await bremse(art, k, `z-kennung-${art}-x`)).frei).toBe(false);
    });

    it(`${art}: so viele gleichzeitige Versuche auf ein Ziel, wie dessen Grenze nennt, kommen alle durch; der nächste nicht`, async () => {
      frisch(tage + 10);
      const n = WEITERE[art].ziel.versuche;
      const ziel = `z-gleichzeitig-${art}`;
      const erg = await Promise.all(Array.from({ length: n }, (_, i) => bremse(art, `a:gleichzeitig-ziel-${art}-${i}`, ziel)));
      expect(erg.map((b) => b.frei), JSON.stringify(erg)).toEqual(Array(n).fill(true));
      const danach = await bremse(art, `a:gleichzeitig-ziel-${art}-x`, ziel);
      expect(danach.frei).toBe(false);
      expect(danach.dimension).toBe("ziel");
    });
  }

  for (const [art, tage] of [["anmelden", 70], ["anmelden-konto", 71], ["registrierung", 72]]) {
    it(`${art}: gestaffelt — während die ersten Versuche noch laufen, kommen die übrigen bis zur Grenze durch (kein Doppeltzählen)`, async () => {
      frisch(tage);
      const n = GRENZEN[art].versuche;
      const erste = Math.floor(n / 2);
      const k = `a:gestaffelt-${art}`;
      /* Die erste Welle hält beim Vermerk ihres eigenen Versuchs an — gezählt (im Speicher), aber noch nicht fertig. */
      let loslassen, gehalten = 0;
      const tor = new Promise((r) => { loslassen = r; });
      stoerung.haelt = (methode, key) => {
        if (methode === "setJSON" && key.startsWith(`v:${art}:${k}:`) && gehalten < erste) { gehalten++; return tor; }
        return null;
      };
      const welle1 = Array.from({ length: erste }, (_, i) => bremse(art, k, `z-gestaffelt-${art}-${i}`));
      for (let i = 0; i < 2000 && gehalten < erste; i++) await new Promise((r) => setTimeout(r, 5));
      expect(gehalten, "erste Welle in der Schwebe").toBe(erste);
      const welle2 = Array.from({ length: n - erste }, (_, i) => bremse(art, k, `z-gestaffelt-${art}-b${i}`));
      /* Die zweite Welle läuft bis zu ihrem eigenen Vermerk durch, dann darf auch die erste weiter. */
      await new Promise((r) => setTimeout(r, 50));
      loslassen();
      const erg = await Promise.all([...welle1, ...welle2]);
      expect(erg.map((b) => b.frei), JSON.stringify(erg)).toEqual(Array(n).fill(true));
      expect((await bremse(art, k, `z-gestaffelt-${art}-x`)).frei, "der nächste nicht").toBe(false);
    });
  }

  it("einladung-nachweis bleibt dicht: 100 gleichzeitige Versuche einer Person → höchstens die Grenze kommt durch", async () => {
    frisch(60);
    const erg = await Promise.all(Array.from({ length: 100 }, () => bremse("einladung-nachweis", "a:gleichzeitig-nachweis", "b:raum")));
    expect(erg.filter((b) => b.frei).length).toBeLessThanOrEqual(GRENZEN["einladung-nachweis"].versuche);
  });
});
