/* ==========================================================================
   LÖSCHEN UND ANLEGEN UNTER DER RAUMSPERRE (WP-02, Auflagen aus dem Review)

   2  Der Löschlauf für abgelaufene Testbetriebe (aufraeumen.mjs) löschte
      ohne Raumsperre. Lief gerade ein Schreiber, legte er nach dem Löschen
      wieder Standvermerke ab — Waisen ohne Kern, die kein späterer Lauf
      mehr findet.
   3  Die Provisionierung prüfte „Raum frei?" und legte an, ohne Sperre:
      Zwei gleichzeitige Anlagen derselben Kennung meldeten beide Erfolg,
      die zweite überschrieb die erste. Der Rückbau (zurueckrollen) löschte
      ungesperrt wie der Löschlauf.
   9  Der Sammelblob „konten" gehört allen Räumen. Zwei gleichzeitige
      Löschungen lasen beide den alten Blob, und die zweite schrieb die
      Codes der ersten zurück.

   Gleichzeitigkeit wird hier erzwungen, nicht erhofft: Der Schreiber
   bekommt eine Ablage, die vor dem Standvermerk anhält, bis die Löschung
   gelaufen ist (oder nach einer Frist, falls die Sperre die Löschung gar
   nicht erst hereinlässt).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, store, sitzungen, B, aufraeumen, P, L;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-loeschsperre-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
  B = await import("../server/lib/bestand.mjs");
  aufraeumen = await import("../server/lib/aufraeumen.mjs");
  P = await import("../server/lib/provisionierung.mjs");
  L = await import("../server/lib/raumloeschung.mjs");
});
afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
  /* Das Widerrufbuch (E-M6) liegt ohne CENTRIC_ZUSTAND neben der Ablage (schluesselepoche.mjs, zustandsVerzeichnis). */
  await rm(`${wurzel}-zustand`, { recursive: true, force: true });
});

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/* Zeitgrenze je Prüfung: 30 s statt der Vorgabe von 5 s. Der Löschlauf geht
   alle Testräume, Konten, Mitgliedschaften und Sitzungen der Ablage durch
   und wartet hier zusätzlich auf einen gebremsten Schreiber; unter Windows
   mit Virenscanner und parallelen Prüfläufen dauerte das einmal über fünf
   Sekunden. Die Grenzen der Anwendung (Raumsperre 15 s) bleiben unberührt —
   gemessen wird hier Richtigkeit, nicht Geschwindigkeit. */
const LAST_GRENZE = 30_000;

/** Ein abgelaufener, selbst angelegter Testbetrieb ohne Zugangscodes. */
const testbetrieb = (raum, monat = "2026-01") => ({ version: 9, mandanten: [{ id: raum, name: raum,
  selbstAngelegt: true, status: "test", laeuftAb: "2026-01-01T00:00:00.000Z",
  einheiten: [], dienstarten: [], personen: [],
  abweichungen: { [`p1|${monat}-05`]: "F" }, abwesenheiten: [], erfassung: {}, einstempeln: {} }] });

/**
 * Eine Ablage, die vor dem Schreiben eines Standvermerks des Raums anhält:
 * meldet `drin`, wartet dann auf `weiter` (höchstens `frist` ms).
 */
function bremsendeAblage(raum, frist = 600) {
  let drin, weiter;
  const signale = { drin: new Promise((r) => { drin = r; }), weiter: () => weiter && weiter() };
  const freigabe = new Promise((r) => { weiter = r; });
  let einmal = false;
  const ablage = { ...store,
    setJSON: async (k, v, o) => {
      if (!einmal && k.startsWith(`stand:${raum}:`) && k !== `stand:${raum}:aktuell`) {
        einmal = true;
        drin();
        await Promise.race([freigabe, warte(frist)]);
      }
      return store.setJSON(k, v, o);
    } };
  return { ablage, signale };
}

/** Alles, was zu einem Raum im Store „centric" liegt. */
async function reste(raum) {
  const aus = [];
  for (const p of [`kern:${raum}`, `scherbe:${raum}:`, `stand:${raum}:`]) {
    const { blobs } = await store.list({ prefix: p });
    aus.push(...blobs.map((b) => b.key).filter((k) => k === `kern:${raum}` || k.startsWith(p)));
  }
  return aus;
}

describe("2 — Löschlauf parallel zu einem Schreiber", () => {
  it("hinterlässt keine Waisen", async () => {
    const RAUM = "t-loeschlauf";
    await B.bestandSchreiben(store, RAUM, testbetrieb(RAUM), { durch: "Pruefung" });
    const g = await B.bestandLesen(store, RAUM);
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].abweichungen["p1|2026-02-05"] = "F";

    const { ablage, signale } = bremsendeAblage(RAUM);
    const schreiben = B.bestandSchreiben(ablage, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    await signale.drin;
    const lauf = aufraeumen.testbetriebeAufraeumen(store, sitzungen, { jetzt: new Date("2027-06-01T00:00:00Z") })
      .then((v) => { signale.weiter(); return v; });
    const [, vermerk] = await Promise.all([schreiben.catch((e) => e), lauf]);

    expect(vermerk.geloescht).toContain(RAUM);
    expect(await reste(RAUM), "Waisen nach dem Löschlauf").toEqual([]);
  }, LAST_GRENZE);
});

describe("3 — Provisionierung unter der Raumsperre", () => {
  it("zwei gleichzeitige Anlagen derselben Kennung: genau eine gelingt, die andere „belegt“", async () => {
    const raum = "t-doppelt";
    const [a, b] = await Promise.all([
      P.testbetriebAnlegen(store, { name: "Erster", branche: "sonstige", raum }),
      P.testbetriebAnlegen(store, { name: "Zweiter", branche: "sonstige", raum }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const verlierer = a.ok ? b : a;
    expect(verlierer.grund).toBe("belegt");
    const gewinnerName = a.ok ? "Erster" : "Zweiter";
    expect((await B.bestandLesen(store, raum)).bestand.mandanten[0].name).toBe(gewinnerName);
  }, LAST_GRENZE);

  it("Rückbau parallel zu einem Schreiber hinterlässt keine Waisen", async () => {
    const RAUM = "t-rueckbau";
    await B.bestandSchreiben(store, RAUM, testbetrieb(RAUM), { durch: "Pruefung" });
    const g = await B.bestandLesen(store, RAUM);
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].abweichungen["p1|2026-03-05"] = "F";

    const { ablage, signale } = bremsendeAblage(RAUM);
    const schreiben = B.bestandSchreiben(ablage, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    await signale.drin;
    const rueckbau = P.zurueckrollen(store, sitzungen, "a-gibt-es-nicht", RAUM)
      .then((v) => { signale.weiter(); return v; });
    await Promise.all([schreiben.catch((e) => e), rueckbau]);

    expect(await reste(RAUM), "Waisen nach dem Rückbau").toEqual([]);
  }, LAST_GRENZE);
});

describe("9 — Sammelblob „konten“ bei gleichzeitigen Löschungen", () => {
  it("zwei Räume gleichzeitig gelöscht: die Codes beider sind weg, fremde bleiben", async () => {
    await store.setJSON("konten", {
      c1: { bestand: "t-sammel-a", name: "A" }, c2: { bestand: "t-sammel-b", name: "B" },
      c3: { bestand: "fremd", name: "C" } });
    /* Jede Löschung liest den Blob und wartet dann kurz — ohne Sperre lesen
       damit beide den alten Stand, bevor einer zurückschreibt. */
    const langsam = { ...store,
      get: async (k, o) => {
        const v = await store.get(k, o);
        if (k === "konten") await warte(150);
        return v;
      } };
    await Promise.all([
      L.raumLoeschen(langsam, sitzungen, "t-sammel-a"),
      L.raumLoeschen(langsam, sitzungen, "t-sammel-b"),
    ]);
    expect(Object.keys(await store.get("konten", { type: "json" })).sort()).toEqual(["c3"]);
  }, LAST_GRENZE);
});

describe("WP-45/2 — Anmeldung während der Raumlöschung", () => {
  it("kontoVereinzeln legt kein Einzelkonto für einen gerade gelöschten Raum an", async () => {
    const { kontoVereinzeln } = await import("../server/lib/konten.mjs");
    await store.setJSON("konten", { x1: { bestand: "t-anmeldung", name: "X" }, x2: { bestand: "fremd", name: "Y" } });
    /* Die Löschung hält an, sobald sie den Sammelblob liest — genau dann
       meldet sich jemand mit dem Code x1 an. */
    let lesend;
    const angehalten = new Promise((r) => { lesend = r; });
    let einmal = false;
    const langsam = { ...store,
      get: async (k, o) => {
        if (k === "konten" && !einmal) {
          einmal = true;
          lesend();
          await warte(150);
        }
        return store.get(k, o);
      } };
    const loeschen = L.raumLoeschen(langsam, sitzungen, "t-anmeldung");
    await angehalten;
    /* Aus dem Prüfablauf selbst, nicht aus der Löschung heraus — eine
       eigene Anfrage, die die Sperren der Löschung nicht hält. */
    const anmeldung = kontoVereinzeln(store, "x1");
    await Promise.all([loeschen, anmeldung]);
    expect(await store.get("konto:x1", { type: "json" }), "Code zeigt auf gelöschten Raum").toBeNull();
    expect(Object.keys(await store.get("konten", { type: "json" }))).toEqual(["x2"]);
  }, LAST_GRENZE);
});

/* E-M6 (PR #292, widerrufbuch.mjs): Die Löschung trägt die Codes des Raums ins Widerrufbuch ein (außerhalb der
   gesicherten Ablage) — und löscht sie trotzdem immer, auch wenn das Buch fehlt oder unlesbar ist. Dann bleibt ein
   Nachtrag (widerrufbuch:nachtrag), den der nächste Serverstart einträgt. Schlüssel hier in echter Gestalt (64 hex),
   sonst trägt das Buch sie nicht ein. */
describe("E-M6 — Raumlöschung und Widerrufbuch", () => {
  const h = (z) => z.repeat(64);
  const verz = () => `${wurzel}-zustand`;
  const buchDatei = () => path.join(verz(), "zugang-widerrufe.json");
  const gleichzeitig = async (sammel, raeume) => {
    await store.setJSON("konten", sammel);
    const langsam = { ...store,
      get: async (k, o) => {
        const v = await store.get(k, o);
        if (k === "konten") await warte(150);
        return v;
      } };
    return Promise.all(raeume.map((r) => L.raumLoeschen(langsam, sitzungen, r)));
  };

  it("Buch fehlt (Vorgabe der Prüfumgebung) bzw. ist da: zwei gleichzeitige Löschungen — Codes weg, im Buch", async () => {
    const W = await import("../server/lib/widerrufbuch.mjs");
    W.widerrufbuchVergessen();
    await rm(verz(), { recursive: true, force: true });
    await store.delete(W.ANKER_SCHLUESSEL);
    const erg = await gleichzeitig({ [h("a")]: { bestand: "t-buch-a", name: "A" }, [h("b")]: { bestand: "t-buch-b", name: "B" },
      [h("c")]: { bestand: "fremd", name: "C" } }, ["t-buch-a", "t-buch-b"]);
    for (const e of erg) expect(e.fehler).toEqual([]);
    expect(Object.keys(await store.get("konten", { type: "json" }))).toEqual([h("c")]);
    expect(await W.istWiderrufen(store, [h("a")])).toBe(true);
    expect(await W.istWiderrufen(store, [h("b")])).toBe(true);
    expect(await W.istWiderrufen(store, [h("c")])).toBe(false);
    expect(await store.get(W.NACHTRAG_SCHLUESSEL, { type: "json" })).toBeNull();
    /* Buch jetzt vorhanden: noch einmal zwei gleichzeitig. */
    const erg2 = await gleichzeitig({ [h("d")]: { bestand: "t-buch-d", name: "D" }, [h("e")]: { bestand: "t-buch-e", name: "E" },
      [h("c")]: { bestand: "fremd", name: "C" } }, ["t-buch-d", "t-buch-e"]);
    for (const e of erg2) expect(e.fehler).toEqual([]);
    expect(Object.keys(await store.get("konten", { type: "json" }))).toEqual([h("c")]);
    expect(await W.istWiderrufen(store, [h("d")])).toBe(true);
    expect(await W.istWiderrufen(store, [h("e")])).toBe(true);
  }, LAST_GRENZE);

  it("Löschung, dann ältere Sicherung zurück: die Codes bleiben ungültig (Buch)", async () => {
    const W = await import("../server/lib/widerrufbuch.mjs");
    const alt = { [h("f")]: { bestand: "t-buch-f", name: "F" }, [h("c")]: { bestand: "fremd", name: "C" } };
    await store.setJSON("konten", alt);
    const erg = await L.raumLoeschen(store, sitzungen, "t-buch-f");
    expect(erg.fehler).toEqual([]);
    expect(await store.get("konten", { type: "json" })).toEqual({ [h("c")]: alt[h("c")] });
    /* Rücksprung der Ablage (ältere Sicherung) samt Serverstart. */
    await store.setJSON("konten", alt);
    W.widerrufbuchVergessen();
    await W.widerrufbuchStart(store);
    const konten = await store.get("konten", { type: "json" });
    const einzeln = await store.get(`konto:${h("f")}`, { type: "json" });
    expect((einzeln || konten[h("f")]).gesperrt).toBe(true);
    expect(await W.istWiderrufen(store, [h("f")])).toBe(true);
  }, LAST_GRENZE);

  it("Buch unlesbar: zwei gleichzeitige Löschungen — Codes trotzdem weg, Nachtrag; Serverstart trägt ihn ein", async () => {
    const W = await import("../server/lib/widerrufbuch.mjs");
    const { readFile, writeFile } = await import("node:fs/promises");
    const gut = await readFile(buchDatei(), "utf8");
    await writeFile(buchDatei(), "{ kaputt");
    W.widerrufbuchVergessen();
    try {
      const erg = await gleichzeitig({ [h("1")]: { bestand: "t-kaputt-a", name: "A" }, [h("2")]: { bestand: "t-kaputt-b", name: "B" },
        [h("c")]: { bestand: "fremd", name: "C" } }, ["t-kaputt-a", "t-kaputt-b"]);
      for (const e of erg) {
        expect(e.vollstaendig).toBe(false);
        expect(e.fehler.map((f) => f.schluessel)).toContain("widerrufbuch");
      }
      /* Gelöscht, nicht nur gesperrt — im Sammelblob wie als Einzelkonto. */
      expect(Object.keys(await store.get("konten", { type: "json" }))).toEqual([h("c")]);
      expect(await store.get(`konto:${h("1")}`, { type: "json" })).toBeNull();
      expect(await store.get(`konto:${h("2")}`, { type: "json" })).toBeNull();
      /* Beide im Nachtrag (keiner überschreibt den anderen), und solange das Buch unlesbar ist, gilt kein Code. */
      expect(W.nachtragSchluessel(await store.get(W.NACHTRAG_SCHLUESSEL, { type: "json" })).sort()).toEqual([h("1"), h("2")]);
      expect(W.widerrufbuchLage().stufe).toBe("warnung");
      await expect(W.istWiderrufen(store, [h("c")])).rejects.toThrow();
    } finally {
      await writeFile(buchDatei(), gut);
    }
    /* Buch zurück (Kopie, BEREITSTELLUNG.md §5.4), ältere Sicherung mit den Codes zurück, Serverstart. */
    await store.setJSON("konten", { [h("1")]: { bestand: "t-kaputt-a", name: "A" }, [h("c")]: { bestand: "fremd", name: "C" } });
    W.widerrufbuchVergessen();
    await W.widerrufbuchStart(store);
    expect(await W.istWiderrufen(store, [h("1")])).toBe(true);
    expect(await W.istWiderrufen(store, [h("2")])).toBe(true);
    expect(await store.get(W.NACHTRAG_SCHLUESSEL, { type: "json" })).toBeNull();
    const k1 = (await store.get(`konto:${h("1")}`, { type: "json" })) || (await store.get("konten", { type: "json" }))[h("1")];
    expect(k1.gesperrt).toBe(true);
  }, LAST_GRENZE);

  /* Rot mit a8d614cf: Die Marke „Erstanmeldung festgelegt“ blieb nach der Löschung in der Ablage liegen. Der Abschluss
     im Widerrufbuch bleibt dagegen bewusst (nur fortgeschrieben, nie gekürzt): Ein Rücksprung auf ein älteres Bild mit
     dem Raum öffnet die Ersteinrichtung nicht wieder. */
  it("Marken der Ersteinrichtung gehen mit dem Raum — nur mit diesem; Abschluss bleibt im Buch; Rücksprung zieht die Marke nach", async () => {
    const W = await import("../server/lib/widerrufbuch.mjs");
    W.widerrufbuchVergessen();
    const ERSTE = "p_e0000a1";
    const verbraucht = (raum) => ({ bestand: raum, name: "Erste", person: ERSTE,
      erstleitungVerbraucht: { grund: "angelegt", mandantId: "m1", personId: ERSTE } });
    await store.setJSON("konten", { [h("7")]: verbraucht("t-marke"), [h("8")]: verbraucht("t-marke-x"),
      [h("c")]: { bestand: "fremd", name: "C" } });
    for (const r of ["t-marke", "t-marke-x"]) {
      await store.setJSON(W.markeSchluessel(r, "m1"), { personId: ERSTE, am: "2026-11-13T00:00:00.000Z" });
      await W.ersteinrichtungAbschliessen(store, r, "m1", ERSTE);
      expect(await W.ersteinrichtungAbgeschlossen(store, r, "m1")).toBe(true);
    }
    const erg = await L.raumLoeschen(store, sitzungen, "t-marke");
    expect(erg.fehler).toEqual([]);
    expect(erg.vollstaendig).toBe(true);
    /* Weg: die Marke von t-marke. Unberührt: der namensähnliche Raum t-marke-x mit demselben Betrieb. */
    expect(await store.get(W.markeSchluessel("t-marke", "m1"), { type: "json" })).toBeNull();
    expect(await store.get(W.markeSchluessel("t-marke-x", "m1"), { type: "json" })).not.toBeNull();
    /* Das Buch bleibt: Abschluss und Widerruf des gelöschten Raums stehen weiter darin. */
    expect(await W.ersteinrichtungAbgeschlossen(store, "t-marke", "m1")).toBe(true);
    expect(await W.ersteinrichtungAbgeschlossen(store, "t-marke-x", "m1")).toBe(true);
    expect(await W.istWiderrufen(store, [h("7")])).toBe(true);
    expect(await W.istWiderrufen(store, [h("8")])).toBe(false);
    /* Rücksprung auf ein älteres Bild mit dem Raum und einem noch OFFENEN Erstanmeldecode, ohne Marke: Der Serverstart
       sperrt den Code (Widerruf) und zieht die Marke aus dem Buch nach — die Ersteinrichtung öffnet sich nicht. */
    await store.setJSON("konten", { [h("7")]: { bestand: "t-marke", name: "Erste", erstleitung: { mandantId: "m1" } },
      [h("8")]: verbraucht("t-marke-x"), [h("c")]: { bestand: "fremd", name: "C" } });
    W.widerrufbuchVergessen();
    await W.widerrufbuchStart(store);
    expect(await W.istWiderrufen(store, [h("7")])).toBe(true);
    const k7 = (await store.get(`konto:${h("7")}`, { type: "json" })) || (await store.get("konten", { type: "json" }))[h("7")];
    expect(k7.gesperrt).toBe(true);
    expect(await store.get(W.markeSchluessel("t-marke", "m1"), { type: "json" })).toMatchObject({ personId: ERSTE });
  }, LAST_GRENZE);

  /* Review PR #281 (LOW, widerrufbuch.mjs ablageStand): Rot vorher — ein einziger beschädigter Bestand (kern:/bestand:)
     ließ widerrufbuchStart ganz scheitern, und der widerrufene Code eines ANDEREN Betriebs blieb nach dem Rücksprung
     ungesperrt in der Ablage. Jetzt: übersprungen mit Warnung (ohne Inhalt), Start gelingt, Code gesperrt. Das Buch
     selbst bleibt streng: beschädigtes Buch → Start scheitert (fail-closed). */
  it("beschädigter Bestand beim Serverstart: übersprungen mit Warnung, widerrufener Code bleibt gesperrt; beschädigtes Buch scheitert", async () => {
    const W = await import("../server/lib/widerrufbuch.mjs");
    const { dateiname } = await import("../server/lib/ablage.mjs");
    const { readFile, writeFile } = await import("node:fs/promises");
    const RAUM_WEG = "t-pr281-widerrufen-anderer-betrieb";
    const RAUM_KAPUTT = "t-pr281-beschaedigter-bestand-blob";
    const INHALT = "{ pr281-beschaedigter-inhalt-darf-nie-ins-protokoll";
    const code = h("4");
    W.widerrufbuchVergessen();
    const alt = { [code]: { bestand: RAUM_WEG, name: "Widerrufen" }, [h("c")]: { bestand: "fremd", name: "C" } };
    await store.setJSON("konten", alt);
    expect((await L.raumLoeschen(store, sitzungen, RAUM_WEG)).fehler).toEqual([]);
    expect(await W.istWiderrufen(store, [code])).toBe(true);
    /* Rücksprung der Ablage (ältere Sicherung mit dem Code) und ein beschädigter Bestand eines anderen Betriebs. */
    await store.setJSON("konten", alt);
    const kaputt = path.join(wurzel, "centric", dateiname(`kern:${RAUM_KAPUTT}`));
    await writeFile(kaputt, INHALT);
    await expect(store.get(`kern:${RAUM_KAPUTT}`, { type: "json" })).rejects.toThrow();
    const warnungen = [];
    const echt = console.warn;
    console.warn = (...a) => { warnungen.push(a.map(String).join(" ")); };
    try {
      W.widerrufbuchVergessen();
      await expect(W.widerrufbuchStart(store)).resolves.toBeTruthy();
    } finally { console.warn = echt; }
    const meldung = warnungen.filter((w) => w.includes(`kern:${RAUM_KAPUTT}`));
    expect(meldung).toHaveLength(1);
    expect(meldung[0]).toContain("übersprungen");
    expect(warnungen.join("\n")).not.toContain("pr281-beschaedigter-inhalt");
    const einzeln = await store.get(`konto:${code}`, { type: "json" });
    expect((einzeln || (await store.get("konten", { type: "json" }))[code]).gesperrt).toBe(true);
    expect(await W.istWiderrufen(store, [code])).toBe(true);

    /* Gegenprobe: das Buch selbst beschädigt → der Start scheitert weiter (fail-closed), und keine Prüfung gilt. */
    const gut = await readFile(buchDatei(), "utf8");
    await writeFile(buchDatei(), "{ pr281-beschaedigtes-widerrufbuch");
    try {
      W.widerrufbuchVergessen();
      await expect(W.widerrufbuchStart(store)).rejects.toThrow(W.WiderrufbuchFehler);
      await expect(W.istWiderrufen(store, [h("c")])).rejects.toThrow();
    } finally {
      await writeFile(buchDatei(), gut);
      await rm(kaputt, { force: true });
      W.widerrufbuchVergessen();
    }
  }, LAST_GRENZE);
});
