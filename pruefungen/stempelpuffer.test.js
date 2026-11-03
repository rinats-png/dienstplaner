/* ==========================================================================
   STEMPELPUFFER IM BROWSER (WP-07) — ohne Browser geprüft

   Playwright ist im Repository nicht vorhanden. Geprüft wird deshalb die
   Logik des Puffers (src/stempelpuffer.js) mit nachgebildeten Speichern
   (localStorage, eine kleine IndexedDB-Nachbildung) und — für die
   Abnahme „Flugmodus → Stempel → Neustart → Netz: genau ein Stempel" —
   gegen die echte Serverfunktion. Der Dienstarbeiter (public/sw.js) wird in
   einer VM mit nachgebildetem `self` geladen: /api/stempeln darf er nie
   beantworten.

   Was nur auf einem Gerät prüfbar ist (echte IndexedDB, Flugmodus, Neustart
   der installierten Anwendung, iOS ohne Background Sync), steht im Nachweis
   docs/acc45/wp07-nachweis.md als offene Abnahme.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import * as PUF from "../src/stempelpuffer.js";
import { stempelVorgang, mitVorlaeufigen, pufferZustandText } from "../src/stempelvorgang.js";

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** localStorage-Nachbildung: überlebt den „Neustart", wenn dasselbe Objekt weitergegeben wird. */
const lokalerSpeicher = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null),
  setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k),
  key: (i) => [...d.keys()][i] ?? null, get length() { return d.size; } }; };

/** Kleine IndexedDB-Nachbildung — genug für open/put/getAll/delete mit Transaktionen. */
function idbNachbildung() {
  const dbs = new Map();
  const spaeter = (f) => setTimeout(f, 0);
  return { open(name) {
    const r = {};
    spaeter(() => {
      let db = dbs.get(name);
      const neu = !db;
      if (neu) { db = { stores: new Map(), objectStoreNames: { contains: (n) => db.stores.has(n) },
        createObjectStore: (n, { keyPath }) => { db.stores.set(n, { keyPath, d: new Map() }); },
        transaction: (n) => {
          const st = db.stores.get(n); const t = {};
          let offen = 0;
          const fertig = () => spaeter(() => { if (offen === 0 && t.oncomplete) t.oncomplete(); });
          const anf = (wert) => { const q = {}; offen++; spaeter(() => { q.result = wert(); offen--; if (q.onsuccess) q.onsuccess(); fertig(); }); return q; };
          t.objectStore = () => ({ getAll: () => anf(() => [...st.d.values()].map((x) => structuredClone(x))),
            put: (v) => anf(() => { st.d.set(v[st.keyPath], structuredClone(v)); return v[st.keyPath]; }),
            delete: (k) => anf(() => { st.d.delete(k); }) });
          return t;
        } };
        dbs.set(name, db); }
      r.result = db;
      if (neu && r.onupgradeneeded) r.onupgradeneeded();
      if (r.onsuccess) r.onsuccess();
    });
    return r;
  } };
}

const ok = (art, extra = {}) => ({ status: 200, daten: { ok: true, art, datum: "2026-11-06", zeit: "06:00", markierungen: [], ...extra } });

describe("Ereignis: Kennung und Ablage", () => {
  it("UUID v4 aus kryptografischem Zufall — auch ohne randomUUID, nie Math.random", () => {
    expect(PUF.neueKennung()).toMatch(UUID4);
    const zufall = vi.spyOn(Math, "random");
    const nurBytes = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } };
    expect(PUF.neueKennung(nurBytes)).toMatch(UUID4);
    expect(zufall).not.toHaveBeenCalled();
    zufall.mockRestore();
    expect(() => PUF.neueKennung({})).toThrow();
    const viele = new Set(Array.from({ length: 500 }, () => PUF.neueKennung()));
    expect(viele.size).toBe(500);
  });

  it("ohne Inhaber wird nichts abgelegt; Standort nur, wenn übergeben (Geo-Modus)", async () => {
    const sp = PUF.speicherFluechtig();
    await expect(PUF.erfassen(sp, { art: "start", inhaber: null })).rejects.toThrow();
    const ev = await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
    expect(ev.koord).toBeNull();
    expect(PUF.rumpfFuer(ev)).toMatchObject({ lat: null, lon: null, accuracy: null, clientEventId: ev.id, inhaber: "i1" });
  });

  it("Neustart: der Puffer in localStorage überlebt; ein neuer Speicher sieht dasselbe Ereignis", async () => {
    const ls = lokalerSpeicher();
    const ev = await PUF.erfassen(PUF.speicherLokal(ls), { art: "start", inhaber: "i1", jetzt: new Date("2026-11-06T05:00:00Z") });
    const nachNeustart = await PUF.ereignisseVon(PUF.speicherLokal(ls), "i1");
    expect(nachNeustart).toHaveLength(1);
    expect(nachNeustart[0]).toMatchObject({ id: ev.id, zustand: "wartet", erfasstAm: "2026-11-06T05:00:00.000Z" });
  });

  it("zwei Reiter legen gleichzeitig ab (localStorage-Rückfall): kein Ereignis überschreibt das andere", async () => {
    const ls = lokalerSpeicher();
    const [a, b] = await Promise.all([PUF.erfassen(PUF.speicherLokal(ls), { art: "start", inhaber: "i1" }),
      PUF.erfassen(PUF.speicherLokal(ls), { art: "ende", inhaber: "i1" })]);
    expect((await PUF.ereignisseVon(PUF.speicherLokal(ls), "i1")).map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("IndexedDB-Ablage (Nachbildung): ablegen, nach „Neustart“ lesen, entfernen", async () => {
    const idb = idbNachbildung();
    const a = await PUF.speicherIndexedDB(idb);
    const ev = await PUF.erfassen(a, { art: "ende", inhaber: "i1" });
    const b = await PUF.speicherIndexedDB(idb);
    expect((await b.alle()).map((e) => e.id)).toEqual([ev.id]);
    await b.entfernen(ev.id);
    expect(await a.alle()).toEqual([]);
  });

  it("Speicherwahl: IndexedDB, sonst localStorage, sonst flüchtig (dann meldet dauerhaft false)", async () => {
    expect((await PUF.speicherWaehlen({ indexedDB: idbNachbildung() })).art).toBe("indexeddb");
    const kaputt = { open: () => { throw new Error("gesperrt"); } };
    expect((await PUF.speicherWaehlen({ indexedDB: kaputt, localStorage: lokalerSpeicher() })).art).toBe("lokal");
    const nichts = await PUF.speicherWaehlen({});
    expect([nichts.art, nichts.dauerhaft]).toEqual(["fluechtig", false]);
  });
});

describe("Senden: Reihenfolge, Wiederholung, Quittung", () => {
  it("Beginn vor Ende: gesendet in Erfassungsreihenfolge, auch wenn die Ablage anders sortiert", async () => {
    const sp = PUF.speicherFluechtig();
    const s = await PUF.erfassen(sp, { art: "start", inhaber: "i1", jetzt: new Date("2026-11-06T05:00:00Z") });
    const e = await PUF.erfassen(sp, { art: "ende", inhaber: "i1", jetzt: new Date("2026-11-06T13:00:00Z") });
    /* Ablage in umgekehrter Reihenfolge (IndexedDB liefert nach Schlüssel, nicht nach Zeit). */
    const umgedreht = { ...sp, alle: async () => (await sp.alle()).reverse() };
    const reihe = [];
    await PUF.abarbeiten(umgedreht, "i1", async (ev) => { reihe.push(ev.art); return ok(ev.art); });
    expect(reihe).toEqual(["start", "ende"]);
    expect((await sp.alle()).map((x) => [x.id, x.zustand])).toEqual([[s.id, "bestaetigt"], [e.id, "bestaetigt"]]);
  });

  it("vorübergehender Fehler hält die Reihe an: kein Ende vor seinem Beginn, Kennung bleibt bei der Wiederholung", async () => {
    const sp = PUF.speicherFluechtig();
    const s = await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
    await PUF.erfassen(sp, { art: "ende", inhaber: "i1" });
    let t = 1_000_000;
    const gesehen = [];
    const netzWeg = async (ev) => { gesehen.push([ev.art, ev.id, ev.versuche]); throw new TypeError("Failed to fetch"); };
    const r1 = await PUF.abarbeiten(sp, "i1", netzWeg, { jetzt: () => t });
    expect(gesehen).toEqual([["start", s.id, 1]]);
    expect(r1.angehalten).toBe("voruebergehend");
    const nach1 = (await sp.alle()).find((x) => x.id === s.id);
    expect(nach1).toMatchObject({ zustand: "wartet", versuche: 1, offline: true, naechsterVersuchAm: t + 2000 });
    /* Vor Ablauf der Wartezeit: nichts. */
    await PUF.abarbeiten(sp, "i1", netzWeg, { jetzt: () => t + 1000 });
    expect(gesehen).toHaveLength(1);
    t += 2000;
    const rumpf = [];
    await PUF.abarbeiten(sp, "i1", async (ev) => { rumpf.push(PUF.rumpfFuer(ev)); return ok(ev.art); }, { jetzt: () => t });
    expect(rumpf.map((r) => [r.art, r.offline])).toEqual([["start", true], ["ende", false]]);
    expect(rumpf[0].clientEventId).toBe(s.id);
  });

  it("429 mit Retry-After (Bremse): wartet genau so lange, nichts geht verloren", async () => {
    const sp = PUF.speicherFluechtig();
    await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
    const t = 5_000_000;
    await PUF.abarbeiten(sp, "i1", async () => ({ status: 429, daten: { fehler: "zu viele Anfragen" }, warteMs: PUF.retryAfterMs("30") }), { jetzt: () => t });
    const [ev] = await sp.alle();
    expect([ev.zustand, ev.naechsterVersuchAm]).toEqual(["wartet", t + 30000]);
    for (const status of [503, 500, 502, 0]) {
      await sp.setzen({ ...ev, naechsterVersuchAm: 0 });
      await PUF.abarbeiten(sp, "i1", async () => ({ status, daten: null }), { jetzt: () => t });
      expect((await sp.alle())[0].zustand).toBe("wartet");
    }
    expect(PUF.retryAfterMs("Wed, 04 Nov 2026 10:00:30 GMT", Date.parse("2026-11-04T10:00:00Z"))).toBe(30000);
    expect(PUF.retryAfterMs(null)).toBeNull();
  });

  it("STEMPEL_KONFLIKT ist vorübergehend; eine endgültige Absage bleibt sichtbar mit Grund und hält das Ende nicht fest", async () => {
    expect(PUF.antwortArt(409, { code: "STEMPEL_KONFLIKT" })).toBe("voruebergehend");
    const sp = PUF.speicherFluechtig();
    const s = await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
    const e = await PUF.erfassen(sp, { art: "ende", inhaber: "i1" });
    const r = await PUF.abarbeiten(sp, "i1", async (ev) => ev.art === "start"
      ? { status: 409, daten: { fehler: "Für diesen Tag ist schon eingestempelt.", code: "STEMPEL_SCHON_EINGESTEMPELT" } }
      : ok("ende"));
    expect(r.ergebnisse[s.id]).toEqual({ art: "abgelehnt", grund: "Für diesen Tag ist schon eingestempelt." });
    expect(r.ergebnisse[e.id].art).toBe("ok");
    const abg = (await sp.alle()).find((x) => x.id === s.id);
    expect(abg.zustand).toBe("abgelehnt");
    expect(pufferZustandText(abg)).toBe("abgelehnt: Für diesen Tag ist schon eingestempelt.");
    /* Nicht still weg: verwerfen nur ausdrücklich, erneut senden möglich. */
    expect(await PUF.erneutSenden(sp, s.id, "i1")).toBe(true);
    expect((await sp.alle()).find((x) => x.id === s.id).zustand).toBe("wartet");
    expect(await PUF.verwerfen(sp, s.id, "i1")).toBe(false);          // wartend: nie
  });

  it("abgemeldet (401) oder fremde Sitzung: liegen lassen, nichts weiter senden, kein Fehlversuch", async () => {
    for (const r of [{ status: 401, daten: null }, { status: 409, daten: { code: "STEMPEL_FREMDE_SITZUNG" } }]) {
      const sp = PUF.speicherFluechtig();
      await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
      await PUF.erfassen(sp, { art: "ende", inhaber: "i1" });
      let n = 0;
      await PUF.abarbeiten(sp, "i1", async () => { n++; return r; });
      expect(n).toBe(1);
      expect((await sp.alle()).every((x) => x.zustand === "wartet" && x.versuche === 0)).toBe(true);
    }
  });

  it("Warteschlange je Person: Ereignisse eines anderen Inhabers werden weder gezeigt noch gesendet", async () => {
    const sp = PUF.speicherFluechtig();
    await PUF.erfassen(sp, { art: "start", inhaber: "anna" });
    expect(await PUF.ereignisseVon(sp, "bert")).toEqual([]);
    expect(await PUF.ereignisseVon(sp, null)).toEqual([]);
    const gesendet = [];
    await PUF.abarbeiten(sp, "bert", async (ev) => { gesendet.push(ev); return ok("start"); });
    await PUF.abarbeiten(sp, null, async (ev) => { gesendet.push(ev); return ok("start"); });
    expect(gesendet).toEqual([]);
    expect((await sp.alle())[0].zustand).toBe("wartet");
    expect(await PUF.verwerfen(sp, (await sp.alle())[0].id, "bert")).toBe(false);
  });

  it("bestätigt: nach einem Tag aufgeräumt; wartend nie", async () => {
    const sp = PUF.speicherFluechtig();
    await PUF.erfassen(sp, { art: "start", inhaber: "i1" });
    const t = Date.parse("2026-11-06T06:00:00Z");
    await PUF.abarbeiten(sp, "i1", async () => ok("start"), { jetzt: () => t });
    expect((await sp.alle())[0].zustand).toBe("bestaetigt");
    expect(pufferZustandText((await sp.alle())[0])).toBe("bestätigt");
    await PUF.erfassen(sp, { art: "ende", inhaber: "i1" });
    await PUF.abarbeiten(sp, "i1", async () => ({ status: 0, daten: null }), { jetzt: () => t + PUF.BESTAETIGT_HALTEN_MS + 1 });
    expect((await sp.alle()).map((x) => x.zustand)).toEqual(["wartet"]);
  });
});

describe("Anzeige: vorläufig bis zur Quittung", () => {
  const m = { einstempeln: {}, dienstarten: [], personen: [] };
  const p = { id: "a1" };
  it("wartender Beginn: Stempeluhr zeigt offen und vorläufig — nicht noch einmal „Einstempeln“", () => {
    const ev = [{ id: "x", art: "start", zustand: "wartet", erfasstAm: "2026-11-06T05:02:00.000Z", datum: "2026-11-06" }];
    const v = stempelVorgang(m, p, "2026-11-06", new Date("2026-11-06T07:00:00Z"), ev);
    expect(v.offen).toBe(true);
    expect(v.st).toMatchObject({ start: "06:02", vorlaeufig: true });
    expect(pufferZustandText(ev[0])).toBe("vorläufig (offline gespeichert)");
    const mitEnde = [...ev, { id: "y", art: "ende", zustand: "wartet", erfasstAm: "2026-11-06T13:00:00.000Z", datum: "2026-11-06" }];
    expect(stempelVorgang(m, p, "2026-11-06", new Date("2026-11-06T14:00:00Z"), mitEnde).st)
      .toMatchObject({ start: "06:02", ende: "14:00", vorlaeufig: true });
  });
  it("bestätigt oder abgelehnt: keine vorläufige Ergänzung; der Bestand selbst bleibt unberührt", () => {
    const tab = { "a1|2026-11-06": { start: "06:00" } };
    const ev = [{ id: "x", art: "start", zustand: "bestaetigt", erfasstAm: "2026-11-06T05:02:00.000Z" },
      { id: "y", art: "ende", zustand: "abgelehnt", erfasstAm: "2026-11-06T13:00:00.000Z" }];
    expect(mitVorlaeufigen(tab, "a1", ev)).toEqual(tab);
    const w = mitVorlaeufigen(tab, "a1", [{ id: "z", art: "ende", zustand: "wartet", erfasstAm: "2026-11-06T13:00:00.000Z", datum: "2026-11-06" }]);
    expect(w["a1|2026-11-06"].vorlaeufig).toBe(true);
    expect(tab["a1|2026-11-06"]).toEqual({ start: "06:00" });
  });
});

describe("Dienstarbeiter: /api/stempeln nie aus dem Speicher", () => {
  it("POST und GET /api/stempeln werden nicht abgefangen; /api/bestand schon", async () => {
    const quelle = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    const hoerer = {};
    const self = { addEventListener: (n, f) => { hoerer[n] = f; }, location: { origin: "https://beispiel.invalid" },
      registration: {}, clients: {}, skipWaiting: () => {} };
    const caches = { open: async () => ({ put: async () => {}, match: async () => null }) };
    vm.runInNewContext(quelle, { self, caches, fetch: () => { throw new Error("kein Netz"); }, URL, Response, Headers });
    const antwortet = (method, pfad) => {
      let gerufen = false;
      hoerer.fetch({ request: { method, url: `https://beispiel.invalid${pfad}`, mode: "cors" }, respondWith: (p) => { gerufen = true; Promise.resolve(p).catch(() => {}); } });
      return gerufen;
    };
    expect(antwortet("POST", "/api/stempeln")).toBe(false);
    expect(antwortet("GET", "/api/stempeln")).toBe(false);
    expect(antwortet("POST", "/api/bestand")).toBe(false);
    expect(antwortet("GET", "/api/bestand")).toBe(true);
    expect(quelle).not.toMatch(/addEventListener\(\s*["']sync["']/);   // keine Background-Sync-Abhängigkeit
  });
});

/* ------------------- Abnahme gegen die echte Serverfunktion ------------------- */
describe("Abnahme: Flugmodus → Stempel → Neustart → Netz: genau ein Stempel, offline gekennzeichnet", () => {
  const WIRT = "127.0.0.1:3000";
  let wurzel, laden, daten, sitzungAnlegen, B;
  let nr = 0;
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-puffer-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    B = await import("../server/lib/bestand.mjs");
  });
  afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

  const anfrage = async (pfad, methode, token, rumpf) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.8.0.${nr % 250}`, authorization: `Bearer ${token}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf) }) }), {});
    let d = null; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, daten: d, warteMs: PUF.retryAfterMs(a.headers.get("retry-after")) };
  };

  it("zwei Ereignisse offline, Neustart, Netz zurück, zwei Reiter senden gleichzeitig", async () => {
    const raum = "puffer-abnahme";
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
      dienstarten: [], personen: [{ id: "a1", vorname: "V", nachname: "a1", rolle: "mitarbeiter", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }],
      abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} }] }, { durch: "Pruefung" });
    const token = (await sitzungAnlegen({ bestand: raum, name: "a1", rolle: "mitarbeiter", person: "a1", betrieb: 0,
      mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
    const { inhaber } = (await anfrage("/api/bestand", "GET", token)).daten;
    expect(inhaber).toMatch(/^[0-9a-f]{32}$/);

    /* Flugmodus: Beginn vor 3 Stunden, gesendet → kein Netz. */
    const ls = lokalerSpeicher();
    const vorher = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const ev = await PUF.erfassen(PUF.speicherLokal(ls), { art: "start", inhaber, jetzt: vorher, offline: true });
    const netzWeg = async () => { throw new TypeError("Failed to fetch"); };
    await PUF.abarbeiten(PUF.speicherLokal(ls), inhaber, netzWeg);

    /* Neustart: zwei Reiter öffnen denselben Puffer, Netz ist zurück — beide senden zugleich. */
    const senden = (e) => anfrage("/api/stempeln", "POST", token, PUF.rumpfFuer(e));
    const tabA = PUF.speicherLokal(ls), tabB = PUF.speicherLokal(ls);
    await tabA.setzen({ ...(await tabA.alle())[0], naechsterVersuchAm: 0 });
    const [ra, rb] = await Promise.all([PUF.abarbeiten(tabA, inhaber, senden), PUF.abarbeiten(tabB, inhaber, senden)]);
    expect(ra.ergebnisse[ev.id].art).toBe("ok");
    expect(rb.ergebnisse[ev.id].art).toBe("ok");

    const m = (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
    const stempel = Object.entries(m.einstempeln).filter(([k]) => k.startsWith("a1|"));
    expect(stempel).toHaveLength(1);
    const [, st] = stempel[0];
    expect(st.ereignisStart).toBe(ev.id);
    expect(st.offlineStart.offline).toBe(true);
    expect(st.markierungen).toContain("OFFLINE_ERFASST");
    expect(st.startAm).toBe(new Date(Math.floor(vorher.getTime())).toISOString());
    const [q] = await PUF.ereignisseVon(PUF.speicherLokal(ls), inhaber);
    expect(q.zustand).toBe("bestaetigt");
    expect(q.quittung.offline).toBe(true);

    /* Eine dritte Wiederholung (z. B. verlorene Quittung): weiterhin genau ein Stempel. */
    const nochmal = await senden({ ...ev, versuche: 3 });
    expect([nochmal.status, nochmal.daten.wiederholt]).toEqual([200, true]);
    expect(Object.keys((await B.bestandLesen(laden(), raum)).bestand.mandanten[0].einstempeln)).toHaveLength(1);
  });
});
