/* ==========================================================================
   WP-19.4 E7 — Archivierung des Änderungsprotokolls der Schichtverantwortung durch die Leitung

   Betreiberentscheidung 2026-11-26: Archivierung durch die Leitung mit Export und nachvollziehbarem Vermerk; keine stille
   Löschung, keine Erhöhung der Grenzen; Fristlauf erst nach Freigabe der Frist (unverändert).
   Invarianten: docs/acc45/WP19-MODULPLAN.md 17.1, A1–A12. Kurz:
     A1/A2  Export der ältesten n Einträge der Art (kanonisch JSON, Bytes, SHA-256) aus der Sicht der Leitung.
     A3     Entfernen nur nach Bestätigung mit Anzahl, Bytes, Prüfsumme gegen den frisch gelesenen Stand; sonst 409/400.
     A4/A5  Vermerk und Entfernen in EINEM Schreiben; jede Absage lässt das Protokoll unverändert.
     A6     zweimal → 409; SV dazwischen → ihr Eintrag bleibt.  A7 nur Leitung, frisch.  A8 nur bei wirkendem Modul.
     A10    Grenzen unverändert; SV ordnet danach wieder zu.  A11 Voll-PUT leert weiter nichts.  A12 Betriebsrat sieht nichts.
   Teil B über den echten Handler (Registry-Kopie „vorlaeufig“ nur im Test).
   ========================================================================== */
// zeit-ok: Der Server stempelt den Vermerk mit der echten Uhr; „frisch angemeldet“ wird mit einer verschobenen Uhr geprüft.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { BRANCHENMODULE, moduleinstellungenSicht, modulprotokollBelegt, MODULPROTOKOLL_GRENZE } from "../server/lib/branchenmodule.mjs";
import { bereichsprotokollAnhaengen, bereichsprotokollEintrag, bereichsprotokollExport, bereichsprotokollPruefsumme, bereichsprotokollArchivieren,
  BEREICH_PROTOKOLL_ART, BEREICH_ARCHIV_ART, BEREICH_PROTOKOLL_GRENZEN } from "../server/lib/modul-bereichsplan.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { branchenbestand, schreibeAls as schreibeAlsEcht } from "./hilfen/branchenbetrieb.mjs";

const MO = "2026-11-02";
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x));
const schreibeAls = (g, r, aendern) => schreibeAlsEcht(g, r, aendern, { liste: AKTIV });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const ALT = Object.freeze({ art: "eingeschaltet", modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: "l1" });
const ANDERS = Object.freeze({ art: "parameter", modul: "bereichsplan", am: "2026-10-02T08:00:00.000Z", von: "l1" });
const zuordnung = (i) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: `2026-10-${String(10 + (i % 18)).padStart(2, "0")}T08:00:00.000Z`,
  von: "s1", einheit: "e1", anzahl: 1, zuordnungen: [{ person: "a1", tag: MO, vorher: i % 2 ? "b1" : null, nachher: i % 2 ? null : "b1" }] });
const fuell = (n, ab = 0) => Array.from({ length: n }, (_, i) => zuordnung(i + ab));
const sha = (t) => createHash("sha256").update(Buffer.from(t, "utf8")).digest("hex");
const AM = "2026-11-26T10:00:00.000Z";

/** Bestätigung zu einem Export (wie die Oberfläche sie aus der Sicht der Leitung baut). */
async function bestaetigung(einstellungen, anzahl) {
  const ex = bereichsprotokollExport(einstellungen, anzahl === undefined ? {} : { anzahl });
  return { anzahl: ex.anzahl, bytes: ex.bytes, pruefsumme: await bereichsprotokollPruefsumme(ex.text), exportGespeichert: true };
}

function bestand({ protokoll = [ALT], an = true } = {}) {
  const g = branchenbestand({ pakete: ["pflege"], branchenmodule: { bereichsplan: { an } } });
  const m = g.mandanten[0];
  m.einheiten = [{ id: "e1", versatzTage: 0, bereiche: [{ id: "b1", name: "Wohnbereich Nord" }, { id: "b2", name: "Wohnbereich Süd" }] }];
  m.bereichsPlan = {};
  m.einstellungen.modulprotokoll = kopie(protokoll);
  return g;
}

describe("Teil A — Export, Prüfsumme, Vermerk (reine Funktionen)", () => {
  it("A1/A2: Export = die Einträge der Art in gespeicherter Reihenfolge, mit Anzahl die ältesten n; andere Arten nie", () => {
    const e = { modulprotokoll: [ALT, ...fuell(3), ANDERS, ...fuell(2, 3)] };
    const alle = bereichsprotokollExport(e);
    expect(alle.anzahl).toBe(5);
    expect(alle.eintraege).toEqual([...fuell(3), ...fuell(2, 3)]);
    expect(alle.text).toBe(JSON.stringify(alle.eintraege));
    expect(alle.bytes).toBe(Buffer.byteLength(alle.text, "utf8"));
    const zwei = bereichsprotokollExport(e, { anzahl: 2 });
    expect(zwei.eintraege).toEqual(fuell(2));
    expect(JSON.stringify(alle)).not.toMatch(/"art":"(eingeschaltet|parameter)"/);
    expect(bereichsprotokollExport({}).anzahl).toBe(0);
  });

  it("A2: Prüfsumme = SHA-256 (hex) der UTF-8-Form — gleich mit node:crypto (Browser und Server rechnen dasselbe)", async () => {
    const t = JSON.stringify([{ ä: "Süd", x: 1 }]);
    expect(await bereichsprotokollPruefsumme(t)).toBe(sha(t));
    expect(await bereichsprotokollPruefsumme("[]")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("A1/A4: passende Bestätigung → älteste n entfernt, Rest und andere Arten byte-gleich an ihrem Platz, Vermerk am Ende ohne Namen", async () => {
    const e = { modulprotokoll: [ALT, ...fuell(3), ANDERS, ...fuell(2, 3)] };
    const vorher = kopie(e);
    const b = await bestaetigung(e, 4);
    const r = await bereichsprotokollArchivieren(e, b, { am: AM, von: "l1" });
    expect(r.grund, r.grund).toBeUndefined();
    expect(e).toEqual(vorher);                                    // Eingabe unverändert
    const p = r.einstellungen.modulprotokoll;
    expect(p.slice(0, -1)).toEqual([ALT, ANDERS, zuordnung(4)]);
    const v = p.at(-1);
    expect(v).toEqual({ art: BEREICH_ARCHIV_ART, modul: "bereichsplan", am: AM, von: "l1", anzahl: 4, bytes: b.bytes, pruefsumme: b.pruefsumme,
      erster: zuordnung(0).am, letzter: zuordnung(3).am });
    expect(r.vermerk).toEqual(v);
    expect(JSON.stringify(v)).not.toMatch(/a1|b1|e1|zuordnungen|Wohnbereich/);
  });

  it("A3/A5: jede Absage lässt das Protokoll unverändert (Form 400, nicht passender Export 409)", async () => {
    const e = { modulprotokoll: [ALT, ...fuell(3)] };
    const vorher = kopie(e);
    const gut = await bestaetigung(e, 2);
    const faelle = [
      [400, { ...gut, exportGespeichert: undefined }], [400, { ...gut, exportGespeichert: "ja" }], [400, { ...gut, anzahl: 0 }],
      [400, { ...gut, anzahl: "2" }], [400, { ...gut, anzahl: -1 }], [400, { ...gut, pruefsumme: "abc" }], [400, { ...gut, bytes: "1" }], [400, null],
      [409, { ...gut, pruefsumme: sha("anders") }], [409, { ...gut, bytes: gut.bytes + 1 }], [409, { ...gut, anzahl: 3 }], [409, { ...gut, anzahl: 4 }],
    ];
    for (const [status, a] of faelle) {
      const r = await bereichsprotokollArchivieren(e, a, { am: AM, von: "l1" });
      expect(r.status, JSON.stringify(a)).toBe(status);
      expect(r.einstellungen, JSON.stringify(a)).toBeUndefined();
      expect(String(r.grund)).toMatch(/\S/);
    }
    expect(e).toEqual(vorher);
    const leer = await bereichsprotokollArchivieren({ modulprotokoll: [ALT] }, { anzahl: 1, bytes: 2, pruefsumme: sha("[]"), exportGespeichert: true }, { am: AM, von: "l1" });
    expect(leer.status).toBe(409);
  });

  it("A6: dieselbe Bestätigung zweimal → beim zweiten Mal 409 (nie doppelt entfernt); neue Einträge hinter dem Export bleiben", async () => {
    const e = { modulprotokoll: [ALT, ...fuell(3)] };
    const b = await bestaetigung(e, 3);
    const neuSV = zuordnung(9);
    const r1 = await bereichsprotokollArchivieren({ modulprotokoll: [...e.modulprotokoll, neuSV] }, b, { am: AM, von: "l1" });
    expect(r1.grund).toBeUndefined();
    expect(r1.einstellungen.modulprotokoll).toEqual([ALT, neuSV, r1.vermerk]);
    const r2 = await bereichsprotokollArchivieren(r1.einstellungen, b, { am: AM, von: "l1" });
    expect(r2.status).toBe(409);
  });

  it("A10: Grenzen unverändert; volle Art → archiviert → SV hängt wieder an; volle gemeinsame Grenze sperrt den Vermerk nicht", async () => {
    expect(BEREICH_PROTOKOLL_GRENZEN).toEqual({ jeSpeichern: 100, eintragBytes: 32 * 1024, eintraege: 2000, gesamtBytes: 1024 * 1024 });
    const andere = Array.from({ length: MODULPROTOKOLL_GRENZE }, (_, i) => ({ ...ANDERS, von: `l${i}` }));
    const e = { modulprotokoll: [...andere, ...fuell(BEREICH_PROTOKOLL_GRENZEN.eintraege)] };
    const eintrag = bereichsprotokollEintrag({}, { [`a1|${MO}`]: "b2" }, { am: AM, von: "s1", einheit: "e1" });
    expect("grund" in bereichsprotokollAnhaengen(e, eintrag)).toBe(true);       // voll
    const r = await bereichsprotokollArchivieren(e, await bestaetigung(e), { am: AM, von: "l1" });
    expect(r.grund).toBeUndefined();
    expect(modulprotokollBelegt(r.einstellungen.modulprotokoll)).toBe(MODULPROTOKOLL_GRENZE + 1);
    const wieder = bereichsprotokollAnhaengen(r.einstellungen, eintrag);
    expect("grund" in wieder, JSON.stringify(wieder).slice(0, 200)).toBe(false);
    expect(wieder.einstellungen.modulprotokoll.at(-1)).toEqual(eintrag);
  });

  it("A11: über den vollen Weg kann die Leitung weder archivieren noch Vermerk oder Einträge entfernen (Server stellt her)", async () => {
    const g = bestand({ protokoll: [ALT, ...fuell(3)] });
    const r = await bereichsprotokollArchivieren(g.mandanten[0].einstellungen, await bestaetigung(g.mandanten[0].einstellungen), { am: AM, von: "l1" });
    g.mandanten[0].einstellungen = r.einstellungen;
    const gespeichert = kopie(g.mandanten[0].einstellungen.modulprotokoll);
    for (const neu of [[], [ALT], gespeichert.slice(0, -1), [...gespeichert, zuordnung(1)]]) {
      const w = schreibeAls(g, "LT", (x) => { x.einstellungen.modulprotokoll = kopie(neu); });
      expect(w.verweigert).toBeFalsy();
      expect(w.mandanten[0].einstellungen.modulprotokoll).toEqual(gespeichert);
    }
  });

  it("A12: Betriebsrat sieht weder Einträge noch Vermerk; Leitung beides; Auskunft der Leitung nur Positivkatalog", async () => {
    const e = { modulprotokoll: [ALT, ...fuell(2)] };
    const r = await bereichsprotokollArchivieren(e, await bestaetigung(e, 1), { am: AM, von: "l1" });
    const br = moduleinstellungenSicht(r.einstellungen, "betriebsrat");
    expect(JSON.stringify(br.modulprotokoll)).not.toMatch(/bereich-zuordnung|pruefsumme|zuordnungen/);
    expect(br.modulprotokoll).toEqual([ALT]);
    for (const rolle of ["subplaner", "mitarbeiter"]) expect(moduleinstellungenSicht(r.einstellungen, rolle).modulprotokoll).toBeUndefined();
    const g = bestand({ protokoll: r.einstellungen.modulprotokoll });
    const m = g.mandanten[0];
    const ausk = auskunftBauen(m, m.personen.find((p) => p.id === "l1"), { raum: "r", erstellt: AM, umfang: "selbst" });
    const meine = JSON.stringify(ausk.modulhandlungen);
    expect(meine).toContain(BEREICH_ARCHIV_ART);
    expect(meine).not.toMatch(/pruefsumme|"erster"|"letzter"/);
  });
});

/* ======================================================================== */
const WIRT = "127.0.0.1:3000";
let wurzel, S, nr = 0, raumNr = 0;

async function server() {
  vi.resetModules();
  vi.doMock("../server/lib/branchenmodule.mjs", async (echt) => {
    const e = /** @type {any} */ (await echt());
    return { ...e, BRANCHENMODULE: Object.freeze(e.BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x))) };
  });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  return { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen,
    Z: await import("../server/lib/zeiterfassung.mjs") };
}
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.79.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const ROLLEN = { LT: { rolle: "leitung", person: "l1" }, PL: { rolle: "planer", person: "p1" }, SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "a1" }, BR: { rolle: "betriebsrat", person: "b1" }, KD: { rolle: "kunde", person: "k1" } };
async function raum(o = {}) {
  const name = `wp194a-${++raumNr}`;
  const g = bestand(o);
  g.version = 9;
  g.mandanten[0].status = "aktiv";
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const t = {};
  for (const k of Object.keys(ROLLEN)) t[k] = (await S.sitzungAnlegen({ bestand: name, name: `V N${ROLLEN[k].person}`, rolle: ROLLEN[k].rolle,
    person: ROLLEN[k].person, betrieb: 0, mandantId: "m1", einheit: ROLLEN[k].einheit || null }, 2 * 3600 * 1000)).token;
  return { name, t };
}
const gespeichert = async (name) => (await S.B.bestandLesenStreng(S.laden(), name)).bestand.mandanten[0];
/** Die Leitung zieht den Export aus ihrer Sicht (GET /api/bestand) und baut die Bestätigung. */
async function exportDerLeitung(r, anzahl) {
  const g = await anfrage("/api/bestand", { token: r.t.LT });
  return bestaetigung(g.bestand.mandanten.find((x) => x && x.id === "m1").einstellungen, anzahl);
}
const archivieren = (r, rumpf, token = r.t.LT) => anfrage("/api/bereichsprotokoll-archivieren", { methode: "POST", token, rumpf });
async function svOrdnetZu(r, tagWert) {
  const g = await anfrage("/api/bestand", { token: r.t.SV });
  const b = kopie(g.bestand);
  const m = b.mandanten.find((x) => x && x.id === "m1");
  m.bereichsPlan = { ...(m.bereichsPlan || {}), [`a1|${tagWert}`]: "b2" };
  return anfrage("/api/bestand", { methode: "PUT", token: r.t.SV, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
}

describe("Teil B — über den echten Handler POST /api/bereichsprotokoll-archivieren", { timeout: 300000 }, () => {
  let tag;
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp194a-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    S = await server();
    const heute = S.Z.heuteBerlin();
    tag = (n) => S.Z.tagePlus(heute, n);
  }, 120000);
  afterAll(async () => {
    vi.doUnmock("../server/lib/branchenmodule.mjs");
    vi.resetModules();
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });

  it("A1–A5/A10: Art voll → SV 403; Leitung exportiert und bestätigt → 200, Einträge weg, Vermerk da, andere gleich; SV ordnet wieder zu", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(BEREICH_PROTOKOLL_GRENZEN.eintraege), ANDERS] });
    expect((await svOrdnetZu(r, tag(2))).status).toBe(403);
    const b = await exportDerLeitung(r);
    expect(b.anzahl).toBe(BEREICH_PROTOKOLL_GRENZEN.eintraege);
    const a = await archivieren(r, b);
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.archiviert).toBe(b.anzahl);
    const m = await gespeichert(r.name);
    expect(m.einstellungen.modulprotokoll.slice(0, 2)).toEqual([ALT, ANDERS]);
    expect(m.einstellungen.modulprotokoll).toHaveLength(3);
    expect(m.einstellungen.modulprotokoll[2]).toMatchObject({ art: BEREICH_ARCHIV_ART, von: "l1", anzahl: b.anzahl, bytes: b.bytes, pruefsumme: b.pruefsumme });
    const sv = await svOrdnetZu(r, tag(2));
    expect(sv.status, JSON.stringify(sv).slice(0, 300)).toBe(200);
    const nach = await gespeichert(r.name);
    expect(nach.einstellungen.modulprotokoll.slice(0, 3)).toEqual(m.einstellungen.modulprotokoll);
    expect(nach.einstellungen.modulprotokoll[3]).toMatchObject({ art: BEREICH_PROTOKOLL_ART, von: "s1" });
    const br = await anfrage("/api/bestand", { token: r.t.BR });
    expect(JSON.stringify(br.bestand.mandanten[0].einstellungen || {})).not.toMatch(/bereich-zuordnung|pruefsumme/);
  }, 120000);

  it("A7: Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Kundenrolle → 403, Platte unverändert", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)] });
    const b = await exportDerLeitung(r);
    const vorher = await gespeichert(r.name);
    for (const k of ["PL", "SV", "MA", "BR", "KD"]) {
      const a = await archivieren(r, b, r.t[k]);
      expect(a.status, k).toBe(403);
    }
    expect(await gespeichert(r.name)).toEqual(vorher);
  }, 120000);

  it("A7: Leitung nicht frisch angemeldet → 403 neu anmelden, Platte unverändert", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)] });
    const b = await exportDerLeitung(r);
    const vorher = await gespeichert(r.name);
    const echt = Date.now();
    const uhr = vi.spyOn(Date, "now").mockReturnValue(echt + 25 * 60 * 1000);
    try {
      const a = await archivieren(r, b);
      expect(a.status).toBe(403);
      expect(a.neuAnmelden).toBe(true);
    } finally { uhr.mockRestore(); }
    expect(await gespeichert(r.name)).toEqual(vorher);
  }, 120000);

  it("A3/A5: falsche Prüfsumme 409, ohne Exportbestätigung 400 — Platte unverändert", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)] });
    const b = await exportDerLeitung(r);
    const vorher = await gespeichert(r.name);
    expect((await archivieren(r, { ...b, pruefsumme: sha("x") })).status).toBe(409);
    expect((await archivieren(r, { ...b, exportGespeichert: false })).status).toBe(400);
    expect(await gespeichert(r.name)).toEqual(vorher);
  }, 120000);

  it("A8: Modul im Betrieb aus → 403, Platte unverändert", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)], an: false });
    const b = await exportDerLeitung(r);
    const vorher = await gespeichert(r.name);
    const a = await archivieren(r, b);
    expect(a.status).toBe(403);
    expect(await gespeichert(r.name)).toEqual(vorher);
  }, 120000);

  it("A6: zweimal derselbe Export → 200, dann 409; gleichzeitig → genau einer 200; SV dazwischen → ihr Eintrag bleibt", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(4)] });
    const b = await exportDerLeitung(r, 2);
    const sv = await svOrdnetZu(r, tag(3));
    expect(sv.status, JSON.stringify(sv).slice(0, 300)).toBe(200);
    expect((await archivieren(r, b)).status).toBe(200);
    expect((await archivieren(r, b)).status).toBe(409);
    const m = await gespeichert(r.name);
    const art = m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART);
    expect(art).toHaveLength(3);
    expect(art[0]).toEqual(zuordnung(2));
    expect(art.at(-1)).toMatchObject({ von: "s1", zuordnungen: [{ person: "a1", tag: tag(3), nachher: "b2" }] });
    expect(m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_ARCHIV_ART)).toHaveLength(1);

    const r2 = await raum({ protokoll: [ALT, ...fuell(4)] });
    const b2 = await exportDerLeitung(r2);
    const st = (await Promise.all([archivieren(r2, b2), archivieren(r2, b2)])).map((x) => x.status).sort();
    expect(st).toEqual([200, 409]);
    const m2 = await gespeichert(r2.name);
    expect(m2.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_ARCHIV_ART)).toHaveLength(1);
    expect(m2.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART)).toHaveLength(0);
  }, 120000);

  it("Nachtrag: Betreiber, Demo-Sitzung der Leitung und unbekannte Rolle → 403, Platte unverändert (wie Wiederherstellen/Vollausgabe)", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)] });
    const b = await exportDerLeitung(r);
    const vorher = await gespeichert(r.name);
    const neu = async (felder) => (await S.sitzungAnlegen({ bestand: r.name, name: "V Nx", person: "x1", betrieb: 0, mandantId: "m1", einheit: null, ...felder }, 2 * 3600 * 1000)).token;
    const faelle = {
      betreiber: await neu({ rolle: "betreiber", zweifaktor: true }),
      demoLeitung: await neu({ rolle: "leitung", person: "l1", demo: true }),
      unbekannt: await neu({ rolle: "gast" }),
    };
    for (const [k, token] of Object.entries(faelle)) {
      const a = await archivieren(r, b, token);
      /* Unbekannte Rolle: schon die Sitzung gilt nicht (401); Betreiber und Demo erreichen den Handler (403). */
      expect(a.status, k).toBe(k === "unbekannt" ? 401 : 403);
      expect(a.archiviert, k).toBeUndefined();
    }
    expect(await gespeichert(r.name)).toEqual(vorher);
    /* Gegenprobe: dieselbe Angabe mit der echten Leitung geht durch. */
    expect((await archivieren(r, b)).status).toBe(200);
  }, 120000);

  it("Nachtrag: Fremdbetrieb-Angabe (mandantId/raum) im Rumpf wird ignoriert — archiviert wird nur der eigene Betrieb, der andere bleibt byte-gleich", async () => {
    const r = await raum({ protokoll: [ALT, ...fuell(3)] });
    const fremd = await raum({ protokoll: [ALT, ...fuell(3)] });
    const b = await exportDerLeitung(r);
    const fremdVorher = JSON.stringify(await gespeichert(fremd.name));
    const a = await archivieren(r, { ...b, mandantId: "m9", raum: fremd.name, bestand: fremd.name, betrieb: 1 });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.archiviert).toBe(b.anzahl);
    expect(JSON.stringify(await gespeichert(fremd.name))).toBe(fremdVorher);
    const m = await gespeichert(r.name);
    expect(m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_ARCHIV_ART)).toHaveLength(1);
    expect(m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART)).toHaveLength(0);
  }, 120000);
});
