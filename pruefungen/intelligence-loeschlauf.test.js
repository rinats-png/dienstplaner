/* ==========================================================================
   INTELLIGENCE — LÖSCHLAUF FÜR ki:*-SCHLÜSSEL (WP-I14, Lücke zum Gateway-Stand)

   Raumlöschung und Datenschutzlauf bereinigen die ki:*-Schlüssel eines Raums; eine begonnene Löschung
   wird nach Neustart nachgeholt (Vormerkung). Fehler werden gezählt, nicht verschluckt; fremde Räume bleiben.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { kiRaumBereinigen, kiLoeschungNachholen, kiDatenschutzlauf, VORMERKUNG_PRAEFIX } from "../server/lib/intelligence/gateway/loeschlauf.mjs";
import { erzeugeErgebnisSpeicher, ergebnisSchluessel, kontextSchluessel } from "../server/lib/intelligence/gateway/ergebnis.mjs";
import { raumLoeschen } from "../server/lib/raumloeschung.mjs";
const haken = (ki) => ({ kiBereinigen: (raum) => kiRaumBereinigen(ki, raum) });

const TAG = 86400_000;
function speicherStore() {
  const m = new Map();
  return {
    m, ausfallDelete: new Set(), ausfallList: false,
    async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { if (this.ausfallDelete.has(k)) throw new Error("Platte"); m.delete(k); },
    async list({ prefix = "" } = {}) { if (this.ausfallList) throw new Error("Platte"); return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), directories: [] }; },
  };
}
const FP = (c) => c.repeat(64);
function fuellen(st) {
  for (const raum of ["raum-a", "raum-b"]) {
    st.m.set(ergebnisSchluessel(raum, FP("a")), { art: "erg", raum, ablauf: Date.now() + TAG });
    st.m.set(kontextSchluessel(raum, "ctx-00000001"), { art: "ktx", raum, ablauf: Date.now() + TAG });
  }
  st.m.set("ki:fremd:x", { x: 1 });
}

describe("kiRaumBereinigen", () => {
  it("löscht nur ki:erg/ki:ktx des Raums, lässt andere Räume und fremde ki:-Schlüssel stehen", async () => {
    const st = speicherStore(); fuellen(st);
    const r = await kiRaumBereinigen(st, "raum-a");
    expect(r).toMatchObject({ raum: "raum-a", geloescht: 2, vollstaendig: true, fehler: [] });
    expect([...st.m.keys()].some((k) => k.includes("raum-a"))).toBe(false);
    expect(st.m.has(ergebnisSchluessel("raum-b", FP("a")))).toBe(true);
    expect(st.m.has("ki:fremd:x")).toBe(true);
  });
  it("Vormerkung steht vor dem Löschen und geht nur bei Vollständigkeit", async () => {
    const st = speicherStore(); fuellen(st);
    st.ausfallDelete.add(kontextSchluessel("raum-a", "ctx-00000001"));
    const r = await kiRaumBereinigen(st, "raum-a");
    expect(r.vollstaendig).toBe(false);
    expect(r.fehler).toHaveLength(1);
    expect(st.m.has(VORMERKUNG_PRAEFIX + encodeURIComponent("raum-a"))).toBe(true);
    expect(st.m.has(ergebnisSchluessel("raum-a", FP("a")))).toBe(false); // ein Fehler stoppt die übrigen nicht
  });
  it("Listenfehler zählt als Fehler (unlesbar ist nicht leer)", async () => {
    const st = speicherStore(); fuellen(st); st.ausfallList = true;
    const r = await kiRaumBereinigen(st, "raum-a");
    expect(r.vollstaendig).toBe(false);
    expect(r.fehler.length).toBeGreaterThan(0);
  });
  it("ungültiger Raum: nichts gelöscht, nicht vollständig, keine Vormerkung", async () => {
    const st = speicherStore(); fuellen(st);
    for (const raum of ["", null, undefined, 5]) {
      const r = await kiRaumBereinigen(st, raum);
      expect(r).toMatchObject({ geloescht: 0, vollstaendig: false });
    }
    expect([...st.m.keys()].some((k) => k.startsWith(VORMERKUNG_PRAEFIX))).toBe(false);
    expect(st.m.size).toBe(5);
  });
  it("zweiter Aufruf auf bereinigten Raum ist folgenlos und vollständig", async () => {
    const st = speicherStore(); fuellen(st);
    await kiRaumBereinigen(st, "raum-a");
    expect(await kiRaumBereinigen(st, "raum-a")).toMatchObject({ geloescht: 0, vollstaendig: true });
  });
  it("Sonderzeichen im Raumnamen treffen keinen Nachbarraum (raum:a/b)", async () => {
    const st = speicherStore();
    st.m.set(ergebnisSchluessel("raum:a/b", FP("b")), { art: "erg" });
    st.m.set(ergebnisSchluessel("raum", FP("b")), { art: "erg" });
    await kiRaumBereinigen(st, "raum");
    expect(st.m.has(ergebnisSchluessel("raum:a/b", FP("b")))).toBe(true);
  });
});

describe("kiLoeschungNachholen (nach Neustart)", () => {
  it("führt vorgemerkte Löschungen zu Ende und räumt die Vormerkung ab", async () => {
    const st = speicherStore(); fuellen(st);
    st.ausfallDelete.add(kontextSchluessel("raum-a", "ctx-00000001"));
    await kiRaumBereinigen(st, "raum-a");
    st.ausfallDelete.clear();
    const n = await kiLoeschungNachholen(st);
    expect(n).toMatchObject({ geprueft: 1, vollstaendig: 1, offen: 0 });
    expect([...st.m.keys()].some((k) => k.includes("raum-a"))).toBe(false);
    expect(st.m.has(ergebnisSchluessel("raum-b", FP("a")))).toBe(true);
  });
  it("bleibt offen, solange Löschen scheitert", async () => {
    const st = speicherStore(); fuellen(st);
    st.ausfallDelete.add(kontextSchluessel("raum-a", "ctx-00000001"));
    await kiRaumBereinigen(st, "raum-a");
    expect(await kiLoeschungNachholen(st)).toMatchObject({ geprueft: 1, vollstaendig: 0, offen: 1 });
  });
  it("Listenfehler wird gemeldet, wirft nicht", async () => {
    const st = speicherStore(); st.ausfallList = true;
    expect(await kiLoeschungNachholen(st)).toMatchObject({ geprueft: 0, offen: 0, fehler: 1 });
  });
  it("ohne Vormerkung: nichts zu tun", async () => {
    expect(await kiLoeschungNachholen(speicherStore())).toMatchObject({ geprueft: 0, vollstaendig: 0, offen: 0, fehler: 0 });
  });
});

describe("kiDatenschutzlauf", () => {
  it("fällige Einträge weg (Speicher), dann Nachholen; liefert beide Berichte", async () => {
    const st = speicherStore();
    const t = Date.now();
    const sp = erzeugeErgebnisSpeicher({ store: st, jetzt: () => t });
    st.m.set(ergebnisSchluessel("raum-a", FP("c")), { art: "erg", raum: "raum-a", ablauf: t - 1 });
    st.m.set(ergebnisSchluessel("raum-a", FP("d")), { art: "erg", raum: "raum-a", ablauf: t + TAG });
    const b = await kiDatenschutzlauf(sp, st);
    expect(b.aufraeumen).toMatchObject({ modus: "an", faellig: 1, geloescht: 1 });
    expect(b.nachholen).toMatchObject({ geprueft: 0, offen: 0 });
    expect(st.m.has(ergebnisSchluessel("raum-a", FP("d")))).toBe(true);
  });
  it("wirft nie, auch wenn der Speicher bricht", async () => {
    const st = speicherStore(); st.ausfallList = true;
    const sp = erzeugeErgebnisSpeicher({ store: st });
    const b = await kiDatenschutzlauf(sp, st);
    expect(b.aufraeumen.fehler).toBeGreaterThan(0);
  });
});

describe("Kopplung an die Raumlöschung (raumloeschung.mjs)", () => {
  const leer = () => ({ async get() { return null; }, async setJSON() {}, async delete() {}, async list() { return { blobs: [], directories: [] }; } });
  it("räumt mit übergebenem ki-Store die ki:*-Schlüssel des Raums mit ab", async () => {
    const ki = speicherStore(); fuellen(ki);
    const r = await raumLoeschen(leer(), leer(), "raum-a", haken(ki));
    expect(r.vollstaendig).toBe(true);
    expect([...ki.m.keys()].some((k) => k.includes("raum-a"))).toBe(false);
    expect(ki.m.has(ergebnisSchluessel("raum-b", FP("a")))).toBe(true);
  });
  it("Fehler im ki-Store macht die Löschung unvollständig (Kern bleibt als Marker)", async () => {
    const ki = speicherStore(); fuellen(ki); ki.ausfallDelete.add(kontextSchluessel("raum-a", "ctx-00000001"));
    const kern = []; const store = { ...leer(), async delete(k) { kern.push(k); } };
    const r = await raumLoeschen(store, leer(), "raum-a", haken(ki));
    expect(r.vollstaendig).toBe(false);
    expect(kern).not.toContain("kern:raum-a");
  });
  it("ohne ki-Store unverändert (rückwärtskompatibel)", async () => {
    expect((await raumLoeschen(leer(), leer(), "raum-a")).vollstaendig).toBe(true);
  });
});
