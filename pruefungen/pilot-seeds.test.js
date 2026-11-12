/* ==========================================================================
   WP-PILOT Teil — synthetische Seeds SD-P (Pflege) und SD-S (Sicherheitsdienst)

   Geprüft:
   S1  Erzeugung ist deterministisch (gleiche Eingabe, gleicher Bestand; andere Eingabe, anderer Bestand).
   S2  Umfang und Rollen: 40 bzw. 60 Personen, vier Wochen Plan, alle Rollen, Kernpersonen und Anker des Szenariendokuments.
   S3  Gestalt gegen die echten Prüfer (pruefeGestalt, Personen, Objekte, Postenplan) und über den echten Handler
       (Lesen je Rolle, unveränderter Schreibweg der Leitung mit Rechte-Zusammenführung).
   S4  Nichts Echtes: nur Testnamen, Prefixe, example.invalid, keine Kontakt-/Bankfelder, keine Gesundheitswörter,
       Abwesenheiten ohne Grund.
   S5  Der Schutz des Laders: lehnt Produktions-Ziele (Pfad, Host, Marke, Umgebung) und Räume ohne Seed-Kennzeichnung ab;
       fasst fremde Räume nie an; Entfernen löscht nur die Seed-Räume.
   S6  Mutation: ohne Schutz (Ziel-Prüfung, Seed-Prüfung) würden die Schutzprüfungen rot.
   S7  Rechenkern über den Seeds: kein Absturz, nichts nicht Berechenbares, plausible Deckung, keine Ruhezeitverletzung.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as W from "../werkzeug/pilot-seeds.mjs";
import { pruefeGestalt, personenFehler } from "../server/lib/gestalt.mjs";
import { pruefeObjekte, pruefePostenPlan } from "../server/lib/modul-posten.mjs";
import { rechnen } from "../server/lib/engine/rechenkern.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START = "2027-01-18"; // Montag; Monatsgrenze zwischen Woche 2 und 3 -> Wochen 1 und 2 freigegeben
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const P = () => W.erzeugeSatz("SD-P", { start: START }).mandanten[0];
const S = () => W.erzeugeSatz("SD-S", { start: START }).mandanten[0];
const tagPlus = (tag, n) => { const d = new Date(`${tag}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe("S1 Determinismus", () => {
  it("gleiche Eingabe gibt bit-gleichen Bestand, andere Eingabe einen anderen", () => {
    for (const k of ["SD-P", "SD-S"]) {
      const a = W.erzeugeSatz(k, { start: START }), b = W.erzeugeSatz(k, { start: START });
      expect(sha(a)).toBe(sha(b));
      expect(sha(W.erzeugeSatz(k, { start: "2027-01-25" }))).not.toBe(sha(a));
      expect(sha(W.erzeugeSatz(k, { start: START, seed: 7 }))).not.toBe(sha(a));
    }
  });
  it("kein Uhr- und kein Math.random-Zugriff im Erzeugungspfad", async () => {
    const q = await readFile(path.join(REPO, "werkzeug/pilot-seeds.mjs"), "utf8");
    expect(q).not.toMatch(/Math\.random/);
    const orig = Math.random; let n = 0; Math.random = () => { n++; return 0.5; };
    try { W.erzeugeSatz("SD-P", { start: START }); W.erzeugeSatz("SD-S", { start: START }); } finally { Math.random = orig; }
    expect(n).toBe(0);
  });
  it("Eingaben werden geprüft: Start ist ein Montag, Größe in Grenzen", () => {
    expect(() => W.erzeugeSatz("SD-P", { start: "2027-01-19" })).toThrow(/Montag/);
    expect(() => W.erzeugeSatz("SD-P", { start: START, groesse: 3 })).toThrow(/Größe/);
    expect(() => W.erzeugeSatz("SD-X")).toThrow(/Unbekannt/);
  });
});

describe("S2 Umfang, Rollen, Szenarioanker", () => {
  it("Größen und vier Wochen Plan", () => {
    const p = P(), s = S();
    expect(p.personen.length).toBe(40);
    expect(s.personen.length).toBe(60);
    for (const m of [p, s]) {
      const tage = new Set(Object.keys(m.abweichungen).map((k) => k.split("|")[1]));
      expect(Math.min(...[...tage].map((t) => t >= START ? 0 : 1))).toBe(0);
      expect([...tage].every((t) => t >= START && t <= tagPlus(START, 27))).toBe(true);
      expect(tage.size).toBe(28);
    }
    expect(W.erzeugeSatz("SD-P", { start: START, groesse: 60 }).mandanten[0].personen.length).toBe(60);
  });
  it("alle Rollen sind vorhanden, keine Kundenrolle als Person", () => {
    for (const m of [P(), S()]) {
      const r = (x) => m.personen.filter((q) => q.rolle === x).length;
      expect(r("leitung")).toBe(1); expect(r("planer")).toBe(1); expect(r("betriebsrat")).toBe(1);
      expect(r("subplaner")).toBeGreaterThanOrEqual(2); expect(r("mitarbeiter")).toBeGreaterThan(15);
      expect(m.personen.some((q) => q.rolle === "kunde")).toBe(false);
      expect(new Set(m.personen.map((q) => q.id)).size).toBe(m.personen.length);
      expect(new Set(m.personen.map((q) => q.personalnummer)).size).toBe(m.personen.length);
    }
  });
  it("SD-P: Kernpersonen, Qualifikationen, Dienstarten, Mindestbesetzung, Ruhezeit", () => {
    const m = P();
    const q = Object.fromEntries(m.qualifikationen.map((x) => [x.kurz, x.id]));
    const kern = m.personen.filter((x) => /^MA-P(0[1-9]|1\d|2[0-4])$/.test(x.id));
    expect(kern.length).toBe(24);
    expect(kern.filter((x) => x.qualifikationen.includes(q.PFK)).length).toBe(10);
    expect(kern.filter((x) => x.qualifikationen.includes(q.BK)).length).toBe(4);
    expect(kern.filter((x) => x.qualifikationen.includes(q.PRX)).length).toBe(2);
    expect(m.einheiten.filter((e) => !e.pool).map((e) => e.id)).toEqual(["WB-A", "WB-B", "WB-C"]);
    expect(m.dienstarten.map((d) => [d.id, d.start, d.ende, d.pause])).toEqual([["F", "06:00", "14:30", 30], ["S", "13:30", "22:00", 30], ["N", "21:30", "06:30", 45]]);
    expect(m.dienstarten[0].mindest.mo_do).toBe(9); expect(m.dienstarten[2].mindest.mo_do).toBe(3);
    expect(m.dienstarten[0].mindest.sa).toBeLessThan(m.dienstarten[0].mindest.mo_do);
    expect(m.einstellungen.ruhezeit).toBe(11);
    expect(["MA-P20", "MA-P21", "MA-P22"].every((id) => m.personen.find((x) => x.id === id).springer)).toBe(true);
    const hyg = m.personen.find((x) => x.id === "MA-P09").qualNachweise.find((n) => n.qualId === q.HYG);
    expect(hyg.ablauf < START).toBe(true);
  });
  it("SD-P: Anker (Unterbesetzung Tag 4, Springer-Ruhezeit Tag 2/3, Nacht Tag 2, Urlaub Tag 3 bis 5, Wunschfrei Tag 6)", () => {
    const m = P(), t = (i) => tagPlus(START, i - 1);
    const dienst = (id, i) => m.abweichungen[`${id}|${t(i)}`];
    expect(["MA-P01", "MA-P02", "MA-P03"].map((id) => dienst(id, 3))).toEqual(["F", "F", "F"]);
    expect(dienst("MA-P10", 4)).toBe("S"); expect(dienst("MA-P11", 4)).toBe("S");
    const wbBS = m.personen.filter((p) => p.zugehoerigkeit[0].einheitId === "WB-B" && !p.springer && dienst(p.id, 4) === "S");
    expect(wbBS.map((p) => p.id).sort()).toEqual(["MA-P10", "MA-P11"]);
    expect(dienst("MA-P20", 2)).toBe("S");
    const nacht = Object.entries(m.abweichungen).filter(([k, v]) => v === "N" && k.endsWith(`|${t(2)}`)).map(([k]) => k.split("|")[0]).sort();
    expect(nacht).toEqual(["MA-P13", "MA-P14", "MA-P15"]);
    for (const i of [3, 4, 5]) expect(dienst("MA-P05", i)).toBeUndefined();
    expect(m.abwesenheiten.find((a) => a.personId === "MA-P05")).toMatchObject({ art: "urlaub", von: t(3), bis: t(5) });
    expect(dienst("MA-P08", 6)).toBeUndefined();
  });
  it("SD-S: Objekte, Posten, 12-h-Dienste, Qualifikationen, Anker", () => {
    const m = S(), t = (i) => tagPlus(START, i - 1);
    const q = Object.fromEntries(m.qualifikationen.map((x) => [x.kurz, x.id]));
    expect(m.objekte.slice(0, 3).map((o) => o.id)).toEqual(["OBJ-1", "OBJ-2", "OBJ-3"]);
    expect(m.objekte[0].posten.map((p) => p.id)).toEqual(["P1-Eingang", "P1-Streife"]);
    expect(m.objekte[2].posten.length).toBe(6);
    expect(m.objekte[2].posten[0].qualifikationen).toEqual([q.SK]);
    expect(m.objekte.length).toBeGreaterThan(3);
    expect(m.dienstarten.map((d) => [d.id, d.start, d.ende])).toEqual([["T", "07:00", "19:00"], ["N", "19:00", "07:00"], ["V", "16:00", "02:00"]]);
    const kern = m.personen.filter((x) => /^MA-S(0[1-9]|1[0-6])$/.test(x.id));
    expect(kern.length).toBe(16);
    expect(kern.filter((x) => x.qualifikationen.includes(q.UNT)).length).toBe(15);
    expect(m.personen.find((x) => x.id === "MA-S12").qualifikationen).not.toContain(q.UNT);
    const er7 = m.personen.find((x) => x.id === "MA-S07").qualNachweise.find((n) => n.qualId === q.EH);
    expect(er7.ablauf < START).toBe(true);
    expect(m.postenPlan[`MA-S12|${t(2)}`]).toBe("P1-Streife");
    expect(m.postenPlan[`MA-S03|${t(3)}`]).toBe("P2-Tor");
    expect(m.postenPlan[`MA-S02|${t(1)}`]).toBe("P2-Tor");
    const veranst = Object.entries(m.postenPlan).filter(([k]) => k.endsWith(`|${t(13)}`)).map(([, v]) => v).filter((v) => v.startsWith("P3-")).sort();
    expect(veranst.length).toBeGreaterThanOrEqual(5);
    expect(Object.entries(m.abweichungen).every(([k, v]) => !k.endsWith(`|${t(13)}`) || ["T", "N", "V"].includes(v))).toBe(true);
  });
  it("Planfreigabe ist monatsweise: freigegeben nur, was nur Wochen 1 und 2 enthält", () => {
    const tage = Array.from({ length: 28 }, (_, i) => tagPlus(START, i));
    expect(Object.keys(W.freigabeMonate(tage))).toEqual(["2027-01"]);
    expect(Object.keys(P().freigaben)).toEqual(["2027-01"]);
    expect(Object.keys(W.freigabeMonate(Array.from({ length: 28 }, (_, i) => tagPlus("2026-12-07", i))))).toEqual([]);
  });
  it("keine Wohnbereichs-/Posten-Schlüssel außerhalb der Bestände (Posten und Einheiten verweisen ins Leere nicht)", () => {
    const s = S(); const ids = new Set(s.objekte.flatMap((o) => o.posten.map((p) => p.id)));
    for (const v of Object.values(s.postenPlan)) expect(ids.has(v)).toBe(true);
    const p = P(); const einh = new Set(p.einheiten.map((e) => e.id));
    for (const x of p.personen) expect(einh.has(x.zugehoerigkeit[0].einheitId)).toBe(true);
  });
});

describe("S4 nichts Echtes", () => {
  const alleStrings = (x, aus = []) => { if (typeof x === "string") aus.push(x); else if (Array.isArray(x)) x.forEach((y) => alleStrings(y, aus)); else if (x && typeof x === "object") Object.values(x).forEach((y) => alleStrings(y, aus)); return aus; };
  const ohneKatalog = (m) => ({ ...m, qualifikationen: undefined });
  it("Namen, Nummern, Adressen: nur Testkennzeichen", () => {
    for (const m of [P(), S()]) {
      expect(m.name.startsWith(W.SEED_MARKE)).toBe(true);
      expect(m.kontakt.endsWith("@example.invalid")).toBe(true);
      for (const p of m.personen) {
        expect(["Testperson", "Testkonto"]).toContain(p.vorname);
        expect(p.nachname).toMatch(/^(P|S)[0-9][0-9]$|^(Leitung|Planung|Disposition|Betriebsrat) (P|S)$|^Schichtverantwortung [A-C1-2]$/);
        expect(p.personalnummer.startsWith("SEED-")).toBe(true);
        expect(p.email.endsWith("@example.invalid")).toBe(true);
      }
      const verboten = ["telefon", "handy", "mobil", "adresse", "strasse", "iban", "steuer", "notfallkontakt", "sozial", "foto"];
      const schluessel = JSON.stringify(m).match(/"([A-Za-zäöüÄÖÜß]+)":/g).map((x) => x.slice(1, -2).toLowerCase());
      for (const v of verboten) expect(schluessel.filter((k) => k.includes(v)), v).toEqual([]);
      for (const str of alleStrings(ohneKatalog(m))) {
        if (str.includes("@")) expect(str.endsWith("@example.invalid"), str).toBe(true);
        expect(str).not.toMatch(/https?:\/\//);
        expect(str.replace(/\d{4}-\d\d-\d\d(T[\d:.Z]+)?/g, "")).not.toMatch(/\+?\d[\d ()/-]{8,}\d/);
        expect(str).not.toMatch(/\b[A-Z]{2}\d{2}[ ]?\d{4}/);
      }
    }
  });
  it("keine Gesundheitsangaben: Abwesenheiten ohne Grund, keine Gesundheitswörter in Personen, Plan, Objekten", () => {
    const wort = /krank|diagnos|erkrank|attest|arzt|ärzt|medik|therap|schwanger|behinder|reha|psych|sucht|unfall|verletz|\bAU\b|gelbe/i;
    for (const m of [P(), S()]) {
      expect(m.abwesenheiten.length).toBeGreaterThan(2);
      for (const a of m.abwesenheiten) {
        expect(["urlaub", "sonst", "schulung"]).toContain(a.art);
        expect(a.notiz).toBe(""); expect(a.grund).toBeUndefined();
      }
      for (const p of m.personen) { expect(p.notiz).toBe(""); expect(p.einschraenkungen.wiedereingliederung).toBeNull(); }
      const teile = { personen: m.personen, abwesenheiten: m.abwesenheiten, abweichungen: m.abweichungen, objekte: m.objekte || [], postenPlan: m.postenPlan || {}, name: m.name, einheiten: m.einheiten, dienstarten: m.dienstarten };
      expect(JSON.stringify(teile)).not.toMatch(wort);
      /* Der Quellcode des Werkzeugs nutzt für Ausfälle nie die Abwesenheitsart „krank“. */
      expect(m.abwesenheiten.some((a) => a.art === "krank")).toBe(false);
    }
  });
  it("Seed ist als solcher gekennzeichnet", () => {
    expect(P().seedMarke).toMatchObject({ satz: "SD-P", synthetisch: true, namensraum: "SEED-PILOT" });
    expect(S().seedMarke).toMatchObject({ satz: "SD-S", synthetisch: true });
    expect(W.istSeedBetrieb(P(), "SD-P")).toBe(true);
    expect(W.istSeedBetrieb(P(), "SD-S")).toBe(false);
    expect(W.istSeedBetrieb({ ...P(), name: "Echter Betrieb" }, "SD-P")).toBe(false);
    expect(W.istSeedBetrieb({ ...P(), kontakt: "leitung@echt.de" }, "SD-P")).toBe(false);
    expect(W.istSeedBetrieb({ ...P(), id: "m-123" }, "SD-P")).toBe(false);
    expect(W.istSeedBetrieb(null, "SD-P")).toBe(false);
  });
});

describe("S7 Rechenkern über den Seeds", () => {
  const lauf = (m) => rechnen(m, { zeitraum: { von: START, bis: tagPlus(START, 27) }, heute: START, merkmale: [] });
  const kz = (r, ref) => r.fakten.find((f) => f.feld === "kennzahl.wert" && f.ref === ref).wert;
  it.each([["SD-P", P, 500, 84], ["SD-S", S, 600, 56]])("%s: kein Absturz, alles berechenbar, plausible Deckung", (_n, bau, mindestDienste, dienstTage) => {
    const m = bau();
    const r = lauf(m), r2 = lauf(m);
    expect(sha(r)).toBe(sha(r2));
    expect(r.nichtBerechenbar).toEqual([]);
    for (const ref of ["plan.befunde", "plan.schwer", "plan.unterbesetzt", "plan.ueberbesetzt", "plan.dienste", "plan.stunden"]) expect(Number.isFinite(kz(r, ref)), ref).toBe(true);
    expect(kz(r, "plan.dienste")).toBeGreaterThanOrEqual(mindestDienste);
    expect(kz(r, "plan.unterbesetzt")).toBeLessThanOrEqual(Math.ceil(dienstTage * 0.12));
    expect(kz(r, "plan.ueberbesetzt")).toBe(0);
    expect(kz(r, "plan.schwer")).toBeLessThanOrEqual(15);
    expect(kz(r, "plan.stunden")).toBeGreaterThan(0);
    /* Die gewollten Ausgangslagen der Szenarien erscheinen als Befund (nicht verborgen). */
    expect(kz(r, "plan.unterbesetzt")).toBeGreaterThanOrEqual(1);
  });
  it("keine Ruhezeitverletzung im Plan (11 h), Springer-Szenario ausgenommen nur dort, wo es bewusst gesetzt ist", () => {
    for (const bau of [P, S]) {
      const m = bau(); const dz = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
      let verstoesse = 0;
      for (const [k, v] of Object.entries(m.abweichungen)) {
        const [pid, tag] = k.split("|"); const n = m.abweichungen[`${pid}|${tagPlus(tag, 1)}`];
        if (n && W.ruheStunden(dz[v], dz[n]) < 11) verstoesse++;
      }
      expect(verstoesse).toBe(0);
    }
  });
});

describe("S3 Gestalt gegen die echten Prüfer", () => {
  it("pruefeGestalt, Personen, Objekte und Postenplan sind in Ordnung", () => {
    for (const k of ["SD-P", "SD-S"]) {
      const b = W.erzeugeSatz(k, { start: START });
      expect(pruefeGestalt(b)).toEqual({ ok: true });
      expect(personenFehler(b)).toBeNull();
      const m = b.mandanten[0];
      expect(pruefeObjekte(m.objekte)).toBeNull();
      expect(pruefePostenPlan(m.postenPlan)).toBeNull();
    }
  });
});

/* ======================= Lader, Schutz, Handler ============================ */
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const STAGING = { CENTRIC_BASIS: "https://staging.example.org" };
const env = (extra = {}) => ({ CENTRIC_DATEN: wurzel, ...STAGING, ...extra });
const sortiert = (x) => (Array.isArray(x) ? x.map(sortiert) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortiert(x[k])])) : x);
const kern = (m) => sha(sortiert([m.id, m.name, m.personen, m.abweichungen, m.abwesenheiten, m.objekte || null, m.postenPlan || null, m.dienstarten, m.einheiten, m.freigaben]));
const raeumen = async () => {
  const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs"); const { sitzungsSpeicher } = await import("../server/lib/sitzungen.mjs");
  for (const raum of ["pilot-seed-p", "pilot-seed-s"]) {
    await raumLoeschen(laden(), sitzungsSpeicher(), raum);
  }
};
const raumLeer = async (raum) => !(await B.raumBelegt(laden(), raum));
const lesen = async (raum) => (await B.bestandLesen(laden(), raum));

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.30.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-pilot-seeds-"));
  await writeFile(path.join(wurzel, W.TESTUMGEBUNG_MARKE), "test\n");
  process.env.CENTRIC_DATEN = wurzel; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("S5 Schutz des Laders", () => {
  beforeEach(raeumen);
  afterAll(raeumen);
  it("lehnt ab, wenn --ja fehlt oder der Aufruf unbekannt ist", async () => {
    expect((await W.ausfuehren(["--satz", "SD-P"], env())).code).toBe(2);
    expect((await W.ausfuehren(["--ja", "--wild"], env())).code).toBe(2);
    expect((await W.ausfuehren(["--ja", "--satz", "SD-X"], env())).code).toBe(2);
    expect((await W.ausfuehren(["--ja", "--start", "2027-01-19"], env())).code).toBe(2);
    expect((await W.ausfuehren(["--ja", "--groesse", "50"], env())).code).toBe(2);
    expect(await raumLeer("pilot-seed-p")).toBe(true);
  });
  it("zielPruefen: Produktionsziele werden abgelehnt, ein Testziel nicht", async () => {
    const ok = W.zielPruefen(env());
    expect(ok).toEqual({ ok: true, gruende: [] });
    const nein = (e, text) => { const r = W.zielPruefen(e); expect(r.ok, text).toBe(false); expect(r.gruende.join(" "), text).toMatch(text); };
    nein(env({ CENTRIC_BASIS: undefined }), /CENTRIC_BASIS ist nicht gesetzt/);
    nein(env({ CENTRIC_BASIS: "https://app.centric-dienstplanung.de" }), /nicht als Test/);
    nein(env({ CENTRIC_BASIS: "https://www.example.org" }), /nicht als Test/);
    nein(env({ CENTRIC_BASIS: "kein host" }), /gültige Adresse/);
    nein(env({ CENTRIC_UMGEBUNG: "Production" }), /Produktion/);
    nein({ ...STAGING }, /CENTRIC_DATEN fehlt/);
    nein(env({ CENTRIC_DATEN: path.join(wurzel, "gibtesnicht") }), /existiert nicht/);
    const ohneMarke = await mkdtemp(path.join(tmpdir(), "centric-pilot-ohne-"));
    try { nein(env({ CENTRIC_DATEN: ohneMarke }), /Markendatei/); } finally { await rm(ohneMarke, { recursive: true, force: true }); }
    for (const seg of ["prod", "production", "live"]) {
      const d = path.join(wurzel, "unter", seg, "data"); await mkdir(d, { recursive: true }); await writeFile(path.join(d, W.TESTUMGEBUNG_MARKE), "x");
      nein(env({ CENTRIC_DATEN: d }), /Produktion aus/);
    }
    for (const h of ["http://localhost:3000", "http://127.0.0.1", "https://x.staging.example.org", "https://teststand.example.org", "https://a.invalid"])
      expect(W.zielPruefen(env({ CENTRIC_BASIS: h })).ok, h).toBe(true);
  });
  it("Produktionsziel: nichts wird geschrieben (Exit 3), auch nicht im Trockenlauf-Pfad", async () => {
    const r = await W.ausfuehren(["--ja"], env({ CENTRIC_BASIS: "https://app.centric-dienstplanung.de" }));
    expect(r.code).toBe(3); expect(r.text).toMatch(/Schutz hat abgelehnt/); expect(r.geschrieben).toEqual([]);
    expect(await raumLeer("pilot-seed-p")).toBe(true); expect(await raumLeer("pilot-seed-s")).toBe(true);
    const r2 = await W.ausfuehren(["--ja", "--entfernen"], { ...env(), CENTRIC_BASIS: undefined });
    expect(r2.code).toBe(3);
  });
  it("Ablage und geprüfter Ordner müssen derselbe sein", async () => {
    const anders = await mkdtemp(path.join(tmpdir(), "centric-pilot-anders-")); await writeFile(path.join(anders, W.TESTUMGEBUNG_MARKE), "x");
    try { const r = await W.ausfuehren(["--ja"], env({ CENTRIC_DATEN: anders })); expect(r.code).toBe(3); expect(r.text).toMatch(/nicht derselbe/); }
    finally { await rm(anders, { recursive: true, force: true }); }
    expect(await raumLeer("pilot-seed-p")).toBe(true);
  });
  it("Trockenlauf schreibt nichts", async () => {
    const r = await W.ausfuehren(["--trocken", "--start", START], env());
    expect(r.code, r.text).toBe(0); expect(r.text).toMatch(/Trockenlauf/);
    expect(await raumLeer("pilot-seed-p")).toBe(true); expect(await raumLeer("pilot-seed-s")).toBe(true);
  });
  it("Laden, erneut Laden (ersetzt nur Seed-Räume), Fremdraum bleibt unberührt, Entfernen löscht genau die Seed-Räume", async () => {
    await B.bestandSchreiben(laden(), "andere-raum", { version: 9, mandanten: [{ id: "m-fremd", name: "Fremder Betrieb", status: "aktiv", einheiten: [], personen: [], abweichungen: {}, einstempeln: {}, erfassung: {} }] }, { durch: "Pruefung" });
    const vorher = sha(await lesen("andere-raum"));
    const a = await W.ausfuehren(["--ja", "--start", START], env());
    expect(a.code, a.text).toBe(0); expect(a.geschrieben).toEqual(["pilot-seed-p", "pilot-seed-s"]);
    const gp = (await lesen("pilot-seed-p")).bestand.mandanten[0], gs = (await lesen("pilot-seed-s")).bestand.mandanten[0];
    expect(gp.personen.length).toBe(40); expect(gs.personen.length).toBe(60);
    expect(kern(gp)).toBe(kern(P())); /* gespeichert = erzeugt */
    const b = await W.ausfuehren(["--ja", "--start", START, "--satz", "SD-P"], env());
    expect(b.code, b.text).toBe(0); expect(b.text).toMatch(/entfernt/);
    expect(kern((await lesen("pilot-seed-p")).bestand.mandanten[0])).toBe(kern(P()));
    const c = await W.ausfuehren(["--ja", "--entfernen"], env());
    expect(c.code, c.text).toBe(0);
    expect(await raumLeer("pilot-seed-p")).toBe(true); expect(await raumLeer("pilot-seed-s")).toBe(true);
    expect(sha(await lesen("andere-raum"))).toBe(vorher);
    expect(await raumLeer("andere-raum")).toBe(false);
  });
  it("Raum mit gleichem Namen, aber ohne Seed-Kennzeichnung: abgelehnt, unverändert (Laden und Entfernen)", async () => {
    const fremd = { version: 9, mandanten: [{ id: "m-echt", name: "Echter Betrieb GmbH", kontakt: "leitung@echt.example", status: "aktiv", einheiten: [], personen: [], abweichungen: {}, einstempeln: {}, erfassung: {} }] };
    await B.bestandSchreiben(laden(), "pilot-seed-s", fremd, { durch: "Pruefung" });
    const vorher = sha(await lesen("pilot-seed-s"));
    for (const argv of [["--ja"], ["--ja", "--satz", "SD-S"], ["--ja", "--entfernen"], ["--trocken"]]) {
      const r = await W.ausfuehren(argv, env());
      expect(r.code, argv.join(" ")).toBe(3); expect(r.text).toMatch(/kein gekennzeichneter Seed-Betrieb/);
    }
    expect(sha(await lesen("pilot-seed-s"))).toBe(vorher);
    expect(await raumLeer("pilot-seed-p")).toBe(true); /* auch der gesunde Satz wurde nicht geschrieben (alles oder nichts) */
    /* Seed-Name, aber falsche Kennung/Kontakt: ebenfalls kein Seed */
    const halb = { version: 9, mandanten: [{ ...P(), id: "m-andere", kontakt: "x@example.invalid" }] };
    const raumLoeschen = (await import("../server/lib/raumloeschung.mjs")).raumLoeschen, sp = (await import("../server/lib/sitzungen.mjs")).sitzungsSpeicher;
    await raumLoeschen(laden(), sp(), "pilot-seed-s");
    await B.bestandSchreiben(laden(), "pilot-seed-s", halb, { durch: "Pruefung" });
    expect((await W.ausfuehren(["--ja", "--entfernen"], env())).code).toBe(3);
    expect(await raumLeer("pilot-seed-s")).toBe(false);
    await raumLoeschen(laden(), sp(), "pilot-seed-s");
  });
  it("Zugang ohne Seed-Kennzeichnung im Seed-Raum: abgelehnt", async () => {
    expect((await W.ausfuehren(["--ja", "--start", START, "--satz", "SD-P"], env())).code).toBe(0);
    await kontoSchreiben(laden(), ablageSchluessel("FREMD-AAAA-0001"), { name: "Echte Person", bestand: "pilot-seed-p", rolle: "leitung", person: "LEI-P01", betrieb: 0, mandantId: "pilot-seed-p-m", angelegt: "2026-01-01T00:00:00.000Z" });
    const r = await W.ausfuehren(["--ja", "--entfernen", "--satz", "SD-P"], env());
    expect(r.code, r.text).toBe(3); expect(r.text).toMatch(/ohne Kennzeichnung/);
    expect(await raumLeer("pilot-seed-p")).toBe(false);
    await raeumen(); /* raumLoeschen entfernt auch die Zugänge des Raums */
    expect(await raumLeer("pilot-seed-p")).toBe(true);
  });
});

describe("S3b echter Handler über den geladenen Seeds", () => {
  const T = {};
  beforeAll(async () => {
    const r = await W.ausfuehren(["--ja", "--start", START], env());
    expect(r.code, r.text).toBe(0);
    let c = 0;
    for (const [raum, satz, mid] of [["pilot-seed-p", "SD-P", "pilot-seed-p-m"], ["pilot-seed-s", "SD-S", "pilot-seed-s-m"]]) {
      const m = (await lesen(raum)).bestand.mandanten[0];
      for (const rolle of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]) {
        const person = m.personen.find((p) => p.rolle === rolle);
        c += 1; const code = `SDP${c}-AAAA-${String(c).padStart(4, "0")}`;
        await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${W.SEED_MARKE} ${satz} ${rolle}`, bestand: raum, rolle, person: person.id, betrieb: 0, mandantId: mid, angelegt: "2026-01-01T00:00:00.000Z" });
        T[`${satz}-${rolle}`] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
        expect(T[`${satz}-${rolle}`], `${satz} ${rolle}`).toBeTruthy();
      }
    }
  }, 180000);
  afterAll(async () => { await W.ausfuehren(["--ja", "--entfernen"], env()); });

  it("jede Rolle kann den Bestand lesen; Leitung und Planung sehen den vollen Plan, der Betrieb ist der Seed-Betrieb", async () => {
    for (const satz of ["SD-P", "SD-S"]) for (const rolle of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]) {
      const l = await anfrage("/api/bestand", { methode: "GET", token: T[`${satz}-${rolle}`] });
      expect(l.status, `${satz} ${rolle}: ${l.roh.slice(0, 200)}`).toBe(200);
      expect(l.bestand.mandanten.length).toBe(1);
      expect(l.bestand.mandanten[0].name.startsWith(W.SEED_MARKE)).toBe(true);
      if (rolle === "leitung") expect(l.bestand.mandanten[0].personen.length).toBe(satz === "SD-P" ? 40 : 60);
    }
  }, 120000);
  it("unveränderter Schreibweg der Leitung (echte Prüfung, Rechte-Zusammenführung): 200, nichts geht verloren", async () => {
    for (const satz of ["SD-P", "SD-S"]) {
      const tok = T[`${satz}-leitung`];
      const r = await anfrage("/api/bestand", { methode: "GET", token: tok });
      const b = JSON.parse(JSON.stringify(r.bestand));
      const w = await anfrage("/api/bestand", { methode: "PUT", token: tok, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
      expect(w.status, `${satz}: ${w.roh.slice(0, 300)}`).toBe(200);
      const roh = (await lesen(satz === "SD-P" ? "pilot-seed-p" : "pilot-seed-s")).bestand.mandanten[0];
      const soll = satz === "SD-P" ? P() : S();
      expect(roh.personen.length).toBe(soll.personen.length);
      expect(Object.keys(roh.abweichungen).length).toBe(Object.keys(soll.abweichungen).length);
      expect(roh.abwesenheiten.length).toBe(soll.abwesenheiten.length);
      if (satz === "SD-S") { expect(roh.objekte.length).toBe(soll.objekte.length); expect(Object.keys(roh.postenPlan).length).toBe(Object.keys(soll.postenPlan).length); }
      expect(W.istSeedBetrieb(roh, satz)).toBe(true);
    }
  }, 120000);
});

/* ======================= Mutation: Schutz entfernt -> Prüfung rot ============ */
describe("S6 Mutation: ohne Schutz würden die Schutzprüfungen rot", () => {
  let verz;
  beforeEach(raeumen);
  afterAll(raeumen);
  const mutant = async (ersetze) => {
    let q = await readFile(path.join(REPO, "werkzeug/pilot-seeds.mjs"), "utf8");
    q = q.replace(`from "../server/lib/leerbetrieb.mjs"`, `from "${pathToFileURL(path.join(REPO, "server/lib/leerbetrieb.mjs")).href}"`);
    q = q.replace(/const WURZEL = .*;/, `const WURZEL = ${JSON.stringify(REPO)};`);
    for (const [alt, neu] of ersetze) { expect(q, `Mutationsziel fehlt: ${alt}`).toContain(alt); q = q.replace(alt, neu); }
    const datei = path.join(verz, `mutant-${createHash("sha1").update(q).digest("hex").slice(0, 8)}.mjs`);
    await writeFile(datei, q);
    return import(pathToFileURL(datei).href);
  };
  beforeAll(async () => { verz = await mkdtemp(path.join(tmpdir(), "centric-pilot-mutant-")); });
  afterAll(async () => { await rm(verz, { recursive: true, force: true }); });

  /* Die Schutzprüfungen als Funktion, die gegen jedes Modul laufen kann: wahr = der Schutz hält. */
  const zielSchutzHaelt = async (M) => {
    const r = await M.ausfuehren(["--ja", "--start", START, "--satz", "SD-P"], env({ CENTRIC_BASIS: "https://app.centric-dienstplanung.de" }));
    const geschrieben = !(await raumLeer("pilot-seed-p"));
    if (geschrieben) await W.ausfuehren(["--ja", "--entfernen", "--satz", "SD-P"], env());
    return r.code === 3 && !geschrieben;
  };
  const seedSchutzHaelt = async (M) => {
    const fremd = { version: 9, mandanten: [{ id: "m-echt", name: "Echter Betrieb GmbH", kontakt: "l@echt.example", status: "aktiv", einheiten: [], personen: [], abweichungen: {}, einstempeln: {}, erfassung: {} }] };
    await B.bestandSchreiben(laden(), "pilot-seed-p", fremd, { durch: "Pruefung" });
    const vorher = sha(await lesen("pilot-seed-p"));
    const r = await M.ausfuehren(["--ja", "--start", START, "--satz", "SD-P"], env());
    const unveraendert = sha(await lesen("pilot-seed-p")) === vorher;
    const raumLoeschen = (await import("../server/lib/raumloeschung.mjs")).raumLoeschen, sp = (await import("../server/lib/sitzungen.mjs")).sitzungsSpeicher;
    await raumLoeschen(laden(), sp(), "pilot-seed-p");
    return r.code === 3 && unveraendert;
  };

  it("das echte Werkzeug hält beide Schutzprüfungen", async () => {
    expect(await zielSchutzHaelt(W)).toBe(true);
    expect(await seedSchutzHaelt(W)).toBe(true);
  }, 60000);
  it("Mutant ohne Ziel-Prüfung: Produktionsziel wird beschrieben -> Schutzprüfung rot", async () => {
    const M = await mutant([["const ziel = zielPruefen(env);", "const ziel = { ok: true, gruende: [] };"]]);
    expect(await zielSchutzHaelt(M)).toBe(false);
  }, 60000);
  it("Mutant ohne Markendatei-Pflicht: Ziel ohne Kennzeichnung wird akzeptiert -> Ziel-Prüfung rot", async () => {
    const M = await mutant([["else if (!existsSync(path.join(abs, TESTUMGEBUNG_MARKE)))", "else if (false)"]]);
    const ohne = await mkdtemp(path.join(tmpdir(), "centric-pilot-ohnemarke-"));
    try { expect(M.zielPruefen({ CENTRIC_DATEN: ohne, ...STAGING }).ok).toBe(true); expect(W.zielPruefen({ CENTRIC_DATEN: ohne, ...STAGING }).ok).toBe(false); }
    finally { await rm(ohne, { recursive: true, force: true }); }
  });
  it("Mutant ohne Seed-Kennzeichnungsprüfung: fremder Betrieb im Seed-Raum wird überschrieben -> Schutzprüfung rot", async () => {
    const M = await mutant([["if (!ms || ms.length !== 1 || !istSeedBetrieb(ms[0], k))", "if (false)"]]);
    expect(await seedSchutzHaelt(M)).toBe(false);
  }, 60000);
  it("Mutant ohne Produktions-Pfadregel: prod-Pfad wird akzeptiert", async () => {
    const M = await mutant([["abs.split(/[\\\\/]+/).some((seg) => PROD_SEGMENT.test(seg))", "false"]]);
    const d = path.join(wurzel, "mut", "prod"); await mkdir(d, { recursive: true }); await writeFile(path.join(d, W.TESTUMGEBUNG_MARKE), "x");
    expect(M.zielPruefen({ CENTRIC_DATEN: d, ...STAGING }).ok).toBe(true);
    expect(W.zielPruefen({ CENTRIC_DATEN: d, ...STAGING }).ok).toBe(false);
  });
  it("Mutant ohne Host-Regel: Standardhost der Produktion wird akzeptiert", async () => {
    const M = await mutant([["if (!test) gruende.push(", "if (false) gruende.push("]]);
    const e = { CENTRIC_DATEN: wurzel, CENTRIC_BASIS: "https://app.centric-dienstplanung.de" };
    expect(M.zielPruefen(e).ok).toBe(true);
    expect(W.zielPruefen(e).ok).toBe(false);
  });
});
