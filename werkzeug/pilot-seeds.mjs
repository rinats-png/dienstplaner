#!/usr/bin/env node
/* ==========================================================================
   PILOT-SEEDS — synthetische Testdatensätze SD-P (Pflege) und SD-S (Sicherheitsdienst)

   WP-PILOT Teil. Definition der Sätze: docs/acc45/PILOT-TESTSZENARIEN.md (Teil A und B).
   Beschreibung, Aufruf, Schutz, Rückbau: docs/acc45/PILOT-SEEDS.md.

   Was das Werkzeug tut
   - erzeugeSatz(): baut einen Betrieb ohne Zufall außerhalb eines festen Seeds (mulberry32) — gleiche Eingabe,
     gleicher Bestand. Grundlage ist der echte Leerbetrieb des Produkts (lib/leerbetrieb.mjs), keine eigene Gestalt.
   - Laden und Entfernen: nur in Testumgebungen, nur für zwei fest benannte Räume. Das Werkzeug kennt keine
     Muster, keine Suche und keine anderen Räume.

   Was es nie tut
   - keine Echtdaten: Namen „Testperson/Testkonto", Personalnummern mit dem Vorsatz SEED-, Adressen @example.invalid;
     keine Gesundheitsangaben (Ausfälle sind einfache Abwesenheiten ohne Grund, Art „sonst");
   - keinen Raum anfassen, der kein gekennzeichneter Seed-Betrieb ist (Exit 3, nichts geschrieben);
   - nicht gegen eine Produktionsablage oder einen Produktionshost laufen (siehe zielPruefen);
   - keine Zugänge/Codes anlegen, keine Mails, keine Deployments.

   Aufruf (der Server ist vorher zu stoppen — die Ablage gehört immer nur einem Prozess):
     CENTRIC_DATEN=/pfad/zu/data CENTRIC_BASIS=https://staging.example.org \
       node werkzeug/pilot-seeds.mjs --satz SD-P|SD-S|beide [--start JJJJ-MM-TT] [--groesse N] --ja
     … --entfernen --ja        entfernt genau die Seed-Räume
     … --trocken               prüft Schutz und Erzeugung, schreibt nichts
   Ausgang: 0 = ok, 1 = Fehler, 2 = Aufruf, 3 = Schutz hat abgelehnt, nichts geschrieben.
   ========================================================================== */
import path from "node:path";
import { existsSync, statSync, realpathSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(WURZEL, p)).href);

/* ------------------------------ Festlegungen ------------------------------ */
export const SEED_MARKE = "SEED-PILOT";
export const SEED_VERSION = 1;
export const SAETZE = Object.freeze({
  "SD-P": Object.freeze({ raum: "pilot-seed-p", mandant: "pilot-seed-p-m", branche: "pflege", name: `${SEED_MARKE} Einrichtung P (synthetisch)`,
    kontakt: "seed-p@example.invalid", nummer: "SEED-P", groesse: 40, kern: 24 }),
  "SD-S": Object.freeze({ raum: "pilot-seed-s", mandant: "pilot-seed-s-m", branche: "sicherheit", name: `${SEED_MARKE} Unternehmen S (synthetisch)`,
    kontakt: "seed-s@example.invalid", nummer: "SEED-S", groesse: 60, kern: 16 }),
});
export const SEED_RAEUME = Object.freeze(Object.values(SAETZE).map((s) => s.raum));
export const TESTUMGEBUNG_MARKE = ".centric-test-umgebung";
const TAGE = 28;
const FESTER_SEED = 20261212;
const EINTRITT = "2024-01-01";

/* ------------------------------ Hilfsfunktionen --------------------------- */
function mulberry32(a) {
  return function zufall() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tagPlus = (tag, n) => { const d = new Date(`${tag}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wochentag = (tag) => (new Date(`${tag}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Montag
const istTag = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && tagPlus(s, 0) === s;
const nn = (i) => String(i).padStart(2, "0");
const hm = (s) => { const [h, m] = s.split(":").map(Number); return h + m / 60; };

/** Montag der Woche, in der `tag` liegt. */
export const montagVon = (tag) => tagPlus(tag, -wochentag(tag));

/** Ruhezeit in Stunden zwischen einem Dienst am Tag t und einem Dienst am Tag t+1. */
export function ruheStunden(vor, nach) {
  const start = hm(vor.start), ende = hm(vor.ende);
  const endeAbs = ende <= start ? 24 + ende : ende;
  return 24 + hm(nach.start) - endeAbs;
}

/* ------------------------------ Planer (gemeinsam) ------------------------ */
/**
 * Teilt Schichten fair und regelkonform zu (Ruhezeit, Folgetage, Wochenmaximum). Rein und deterministisch.
 * @param {{ tage: string[], personen: any[], dienstarten: any[], bedarf: (i: number, tag: string) => any[],
 *   gesperrt: (pid: string, tag: string) => boolean, rnd: () => number,
 *   maxFolge: number, maxNachtFolge: number, maxWoche: number, nachtDienste: string[] }} o
 * @returns {{ zuteilung: Map<string, {dienst: string, slot: any}>, offen: any[] }}
 */
function planen(o) {
  const dz = Object.fromEntries(o.dienstarten.map((d) => [d.id, d]));
  const reihe = o.personen.map((p) => ({ p, k: o.rnd() })).sort((a, b) => a.k - b.k).map((x) => x.p);
  const zust = new Map(reihe.map((p, i) => [p.id, { i, summe: 0, folge: 0, nachtFolge: 0, woche: new Map(), letzter: null }]));
  const zuteilung = new Map();
  const offen = [];
  o.tage.forEach((tag, di) => {
    const heute = new Set();
    const wo = Math.floor(di / 7);
    const geeignet = (p, slot) => {
      const z = zust.get(p.id);
      if (heute.has(p.id) || o.gesperrt(p.id, tag)) return false;
      if (slot.erlaubt && !slot.erlaubt(p)) return false;
      const gestern = z.letzter && z.letzter.di === di - 1 ? z.letzter.dienst : null;
      if (gestern && ruheStunden(dz[gestern], dz[slot.dienst]) < 11) return false;
      if (gestern && z.folge >= o.maxFolge) return false;
      if (o.nachtDienste.includes(slot.dienst) && gestern && o.nachtDienste.includes(gestern) && z.nachtFolge >= o.maxNachtFolge) return false;
      if ((z.woche.get(wo) || 0) >= o.maxWoche) return false;
      return true;
    };
    const slots = [...o.bedarf(di, tag)].sort((a, b) => (b.prio || 0) - (a.prio || 0));
    for (const slot of slots) {
      const stufen = slot.stufen || [() => true];
      let wahl = null;
      for (const stufe of stufen) {
        const kand = reihe.filter((p) => stufe(p) && geeignet(p, slot));
        if (!kand.length) continue;
        kand.sort((a, b) => {
          const za = zust.get(a.id), zb = zust.get(b.id);
          const fa = slot.bevorzugt ? (slot.bevorzugt(a) ? 0 : 1) : 0, fb = slot.bevorzugt ? (slot.bevorzugt(b) ? 0 : 1) : 0;
          return fa - fb || za.summe - zb.summe || za.i - zb.i;
        });
        wahl = kand[0]; break;
      }
      if (!wahl) { offen.push({ tag, ...slot, erlaubt: undefined, stufen: undefined, bevorzugt: undefined }); continue; }
      const z = zust.get(wahl.id);
      const gestern = z.letzter && z.letzter.di === di - 1 ? z.letzter.dienst : null;
      z.folge = gestern ? z.folge + 1 : 1;
      z.nachtFolge = o.nachtDienste.includes(slot.dienst) ? (gestern && o.nachtDienste.includes(gestern) ? z.nachtFolge + 1 : 1) : 0;
      z.summe += 1; z.woche.set(wo, (z.woche.get(wo) || 0) + 1); z.letzter = { di, dienst: slot.dienst };
      heute.add(wahl.id);
      zuteilung.set(`${wahl.id}|${tag}`, { dienst: slot.dienst, slot: { einheit: slot.einheit, posten: slot.posten } });
    }
  });
  return { zuteilung, offen };
}

/** Setzt feste Einteilungen (Szenarioanker) und räumt Nachbartage auf, die die Ruhezeit der Anker verletzen würden. */
function anker(zuteilung, dz, tage, festlegungen) {
  const geschuetzt = new Set();
  for (const f of festlegungen) {
    if (f.ersetzen) for (const [k, v] of [...zuteilung]) if (k.endsWith(`|${f.tag}`) && v.dienst === f.dienst && (f.posten ? v.slot.posten === f.posten : v.slot.einheit === f.einheit)) zuteilung.delete(k);
    if (f.alleLoeschen) for (const k of [...zuteilung.keys()]) if (k.endsWith(`|${f.tag}`) && zuteilung.get(k).dienst === f.dienst) zuteilung.delete(k);
    for (const pid of f.personen) { zuteilung.set(`${pid}|${f.tag}`, { dienst: f.dienst, slot: { einheit: f.einheit, posten: f.posten } }); geschuetzt.add(`${pid}|${f.tag}`); }
  }
  for (const k of [...geschuetzt]) {
    const [pid, tag] = k.split("|");
    const a = zuteilung.get(k);
    const vor = zuteilung.get(`${pid}|${tagPlus(tag, -1)}`), nach = zuteilung.get(`${pid}|${tagPlus(tag, 1)}`);
    if (vor && !geschuetzt.has(`${pid}|${tagPlus(tag, -1)}`) && ruheStunden(dz[vor.dienst], dz[a.dienst]) < 11) zuteilung.delete(`${pid}|${tagPlus(tag, -1)}`);
    if (nach && !geschuetzt.has(`${pid}|${tagPlus(tag, 1)}`) && ruheStunden(dz[a.dienst], dz[nach.dienst]) < 11) zuteilung.delete(`${pid}|${tagPlus(tag, 1)}`);
  }
  void tage;
}

/* ------------------------------ Personen --------------------------------- */
function personBauen(satz, o) {
  const s = SAETZE[satz];
  return {
    id: o.id, vorname: o.rolle === "mitarbeiter" ? "Testperson" : "Testkonto", nachname: o.anzeige,
    funktion: o.funktion || "Fachkraft", email: `${o.id.toLowerCase()}@example.invalid`, personalnummer: `${s.nummer}${o.nr}`,
    zugehoerigkeit: [{ ab: EINTRITT, einheitId: o.einheit }], eintritt: EINTRITT, austritt: null,
    wochenstunden: 40, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
    qualifikationen: o.quals, qualNachweise: o.nachweise,
    einschraenkungen: { keineNacht: false, keinAlleindienst: false, maxDiensteWoche: null, wiedereingliederung: null },
    teilzeit: null, geburtstag: "1990-01-01", springer: !!o.springer, rolle: o.rolle, bereich: o.bereich,
    verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) }, nachweise: [], kontrastmodus: false,
    einfuehrung: { erledigt: true, schritt: 0 }, notiz: "", einarbeitung: null,
    benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" }, rolleSeit: EINTRITT, status: "aktiv",
    imSchichtdienst: o.imSchichtdienst !== false,
  };
}

/* ------------------------------ SD-P ------------------------------------- */
const P_FK = new Set([1, 2, 4, 6, 8, 10, 13, 16, 19, 20]);
const P_BK = new Set([15, 18, 23, 24]);
const P_PRAX = new Set([2, 6]);
const P_EINHEIT = (i) => (i <= 6 ? "WB-A" : i <= 12 ? "WB-B" : i <= 18 ? "WB-C" : i === 19 ? "WB-A" : i <= 22 ? "SP" : i === 23 ? "WB-B" : "WB-C");

function satzP(opt) {
  const { start, groesse, rnd } = opt;
  const s = SAETZE["SD-P"];
  const basis = baueLeerenBetrieb({ name: s.name, branche: s.branche, email: s.kontakt, raum: s.mandant });
  const m = basis.mandanten[0];
  const q = Object.fromEntries(m.qualifikationen.map((x) => [x.kurz, x.id]));
  m.qualifikationen.push({ id: `q${m.qualifikationen.length + 1}`, name: "Praxisanleitung (Testwert)", kurz: "PRX", ebene: "betrieb", bezug: "person",
    gueltigMonate: null, nachweisPflicht: false, fachkraft: false, grundlage: "Synthetischer Testwert, keine Rechtsaussage" });
  for (const x of m.qualifikationen) if (x.ebene === "land") x.laender = [m.bundesland];
  const qPrx = m.qualifikationen[m.qualifikationen.length - 1].id;
  const tage = Array.from({ length: TAGE }, (_, i) => tagPlus(start, i));

  m.einheiten = [{ id: "WB-A", name: "Wohnbereich A", farbe: "#017070", versatz: 0, pool: false, standortId: "st1" },
    { id: "WB-B", name: "Wohnbereich B", farbe: "#3C7C8C", versatz: 0, pool: false, standortId: "st1" },
    { id: "WB-C", name: "Wohnbereich C", farbe: "#43507E", versatz: 0, pool: false, standortId: "st1" },
    { id: "SP", name: "Springerpool", farbe: "#878C93", versatz: 0, pool: true, standortId: "st1" }];
  const da = (id, name, a, e, pause, farbe, mind) => ({ id, name, kurz: id, start: a, ende: e, pause, farbe, ort: "", faktor: 1, posten: false, quelle: null,
    ruhezeitNeutral: false, rufbereitschaft: false, mindest: mind, mindestQual: {} });
  m.dienstarten = [
    { ...da("F", "Frühdienst", "06:00", "14:30", 30, "#3C7C8C", { mo_do: 9, fr: 9, sa: 6, so: 6 }), mindestQual: { [q.PFK]: 3 } },
    { ...da("S", "Spätdienst", "13:30", "22:00", 30, "#A8621B", { mo_do: 9, fr: 9, sa: 6, so: 6 }), mindestQual: { [q.PFK]: 3 } },
    { ...da("N", "Nachtdienst", "21:30", "06:30", 45, "#43507E", { mo_do: 3, fr: 3, sa: 3, so: 3 }), mindestQual: { [q.PFK]: 2 } },
  ];
  /* Testparameter, Status provisional — keine geltende Quote, keine Rechtsaussage. */
  Object.assign(m.einstellungen, { ruhezeit: 11, maxFolge: 5, maxNachtFolge: 3, quote: { tag: 0.5, nacht: 0.5 } });

  const personen = [];
  const hyg = (i) => ({ qualId: q.HYG, ablauf: i === 9 ? tagPlus(start, -1) : tagPlus(start, 40 + Math.floor(rnd() * 290)), datei: null });
  const kernNr = (i) => `MA-P${nn(i)}`;
  for (let i = 1; i <= 24; i++) {
    const fk = P_FK.has(i), bk = P_BK.has(i);
    const quals = [fk ? q.PFK : bk ? q.BK : q.PA, q.HYG, ...(P_PRAX.has(i) ? [qPrx] : [])];
    const nach = [{ qualId: fk ? q.PFK : bk ? q.BK : q.PA, ablauf: null, datei: null }, hyg(i), ...(P_PRAX.has(i) ? [{ qualId: qPrx, ablauf: null, datei: null }] : [])];
    const einheit = P_EINHEIT(i);
    personen.push(personBauen("SD-P", { id: kernNr(i), anzeige: `P${nn(i)}`, nr: nn(i), rolle: "mitarbeiter", einheit, bereich: einheit,
      quals, nachweise: nach, springer: einheit === "SP", funktion: einheit === "SP" ? "Springer" : fk ? "Fachkraft" : bk ? "Betreuungskraft" : "Assistenz" }));
  }
  /* Funktionskonten: Leitung, Planung, Betriebsrat arbeiten nicht im Schichtplan; Schichtverantwortung je Wohnbereich arbeitet mit. */
  const konto = (id, anzeige, nr, rolle, einheit, bereich, extra = {}) => personen.push(personBauen("SD-P", { id, anzeige, nr, rolle, einheit, bereich,
    quals: extra.fk ? [q.PFK, q.HYG] : [], nachweise: extra.fk ? [{ qualId: q.PFK, ablauf: null, datei: null }, hyg(0)] : [], ...extra }));
  konto("LEI-P01", "Leitung P", "L01", "leitung", "WB-A", "ALLE", { imSchichtdienst: false, funktion: "Leitung" });
  konto("PLA-P01", "Planung P", "L02", "planer", "WB-A", "ALLE", { imSchichtdienst: false, funktion: "Dienstplanung" });
  konto("BR-P01", "Betriebsrat P", "L03", "betriebsrat", "WB-A", "ALLE", { imSchichtdienst: false, funktion: "Betriebsrat" });
  ["A", "B", "C"].forEach((x) => konto(`SV-P${x}`, `Schichtverantwortung ${x}`, `V${x}`, "subplaner", `WB-${x}`, `WB-${x}`, { fk: true, funktion: "Schichtverantwortung" }));
  /* Auffüllen auf die gewünschte Größe: weitere Testpersonen, Mischung aus Fachkraft, Assistenz, Betreuung. */
  for (let i = 25; personen.length < groesse; i++) {
    const einheit = ["WB-A", "WB-B", "WB-C"][i % 3];
    const art = i % 5 === 0 ? q.BK : i % 5 <= 2 ? q.PFK : q.PA;
    personen.push(personBauen("SD-P", { id: kernNr(i), anzeige: `P${nn(i)}`, nr: nn(i), rolle: "mitarbeiter", einheit, bereich: einheit,
      quals: [art, q.HYG], nachweise: [{ qualId: art, ablauf: null, datei: null }, hyg(i)], funktion: art === q.PFK ? "Fachkraft" : art === q.BK ? "Betreuungskraft" : "Assistenz" }));
  }
  m.personen = personen;

  /* Abwesenheiten: einfache Abwesenheiten ohne Grund. Urlaub MA-P05 (Tag 3 bis 5, genehmigt), wenige Ausfälle als „sonst". */
  const abw = (nr, id, art, von, bis) => ({ id: `abw-${nr}`, personId: id, art, von: tagPlus(start, von), bis: tagPlus(start, bis), notiz: "" });
  m.abwesenheiten = [abw(1, "MA-P05", "urlaub", 2, 4), abw(2, "MA-P12", "sonst", 9, 10), abw(3, "MA-P16", "sonst", 14, 14),
    abw(4, "MA-P22", "sonst", 19, 20), abw(5, "MA-P07", "schulung", 21, 21)];
  const gesperrtTage = new Map();
  for (const a of m.abwesenheiten) for (let d = a.von; d <= a.bis; d = tagPlus(d, 1)) gesperrtTage.set(`${a.personId}|${d}`, true);
  gesperrtTage.set(`MA-P08|${tagPlus(start, 5)}`, true); // Wunschfrei Tag 6

  const istFk = (p) => p.qualifikationen.includes(q.PFK);
  const schichtleute = personen.filter((p) => p.imSchichtdienst !== false);
  const heimat = (p, e) => p.zugehoerigkeit[0].einheitId === e && !p.springer;
  const bedarf = (di, tag) => {
    const we = wochentag(tag) >= 5;
    const slots = [];
    for (const e of ["WB-A", "WB-B", "WB-C"]) {
      const stufen = [(p) => heimat(p, e), (p) => p.springer];
      const fkStufen = [(p) => heimat(p, e) && istFk(p), (p) => p.springer && istFk(p), (p) => istFk(p), ...stufen];
      if (e !== "WB-C") slots.push({ dienst: "N", einheit: e, prio: 3, stufen: fkStufen }); else slots.push({ dienst: "N", einheit: e, prio: 1, stufen });
      slots.push({ dienst: "F", einheit: e, prio: 2, stufen: fkStufen });
      slots.push({ dienst: "S", einheit: e, prio: 2, stufen: fkStufen });
      for (let k = 0; k < (we ? 1 : 2); k++) { slots.push({ dienst: "F", einheit: e, stufen }); slots.push({ dienst: "S", einheit: e, stufen }); }
    }
    void di;
    return slots;
  };
  const { zuteilung } = planen({ tage, personen: schichtleute, dienstarten: m.dienstarten, bedarf, gesperrt: (pid, tag) => gesperrtTage.has(`${pid}|${tag}`), rnd,
    maxFolge: 5, maxNachtFolge: 3, maxWoche: 5, nachtDienste: ["N"] });

  const dz = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const t = (i) => tagPlus(start, i - 1); // Tag 1 = Montag der Referenzwoche
  anker(zuteilung, dz, tage, [
    { tag: t(3), dienst: "F", einheit: "WB-A", ersetzen: true, personen: ["MA-P01", "MA-P02", "MA-P03"] },     // PS-P-02: Frühdienst voll besetzt
    { tag: t(2), dienst: "S", einheit: "SP", personen: ["MA-P20"] },                                              // PS-P-02: Springer mit Ruhezeitkonflikt
    { tag: t(4), dienst: "S", einheit: "WB-B", ersetzen: true, personen: ["MA-P10", "MA-P11"] },                  // PS-P-01: Unterbesetzung (Soll 3)
    { tag: t(2), dienst: "N", alleLoeschen: true, personen: ["MA-P13", "MA-P14", "MA-P15"] },                      // PS-P-03: Nacht, je Bereich eine Person
    { tag: t(5), dienst: "F", alleLoeschen: true, personen: ["MA-P01", "MA-P02", "MA-P07", "MA-P08", "MA-P13", "MA-P14"] },
  ]);
  for (const k of [`MA-P21|${t(3)}`, `MA-P22|${t(3)}`]) zuteilung.delete(k);

  m.abweichungen = {};
  for (const [k, v] of [...zuteilung].sort((a, b) => (a[0] < b[0] ? -1 : 1))) m.abweichungen[k] = v.dienst;
  /* Planfreigabe ist monatsweise: freigegeben werden nur Monate, die ausschließlich Tage der Wochen 1 und 2 enthalten. */
  m.freigaben = freigabeMonate(tage);
  m.anker = start;
  return basis;
}

/** Freigegebene Monate: nur Monate, in denen kein Tag der Wochen 3 und 4 liegt (Entwurf), aber ein Tag der Wochen 1 und 2. */
export function freigabeMonate(tage) {
  const frei = new Set(tage.slice(0, 14).map((d) => d.slice(0, 7)));
  for (const d of tage.slice(14)) frei.delete(d.slice(0, 7));
  return Object.fromEntries([...frei].map((ym) => [ym, { zeit: `${ym}-01T00:00:00.000Z`, durch: SEED_MARKE }]));
}

/* ------------------------------ SD-S ------------------------------------- */
function satzS(opt) {
  const { start, groesse, rnd } = opt;
  const s = SAETZE["SD-S"];
  const basis = baueLeerenBetrieb({ name: s.name, branche: s.branche, email: s.kontakt, raum: s.mandant });
  const m = basis.mandanten[0];
  const q = Object.fromEntries(m.qualifikationen.map((x) => [x.kurz, x.id]));
  m.qualifikationen.push({ id: `q${m.qualifikationen.length + 1}`, name: "Brandschutzhelfer (Testwert)", kurz: "BSH", ebene: "betrieb", bezug: "person",
    gueltigMonate: null, nachweisPflicht: false, fachkraft: false, grundlage: "Synthetischer Testwert, keine Rechtsaussage" });
  const qBsh = m.qualifikationen[m.qualifikationen.length - 1].id;
  const QS1 = q.UNT, QS2 = q.SK, ER = q.EH;
  const tage = Array.from({ length: TAGE }, (_, i) => tagPlus(start, i));
  const t = (i) => tagPlus(start, i - 1);

  m.einheiten = [1, 2, 3, 4].map((i) => ({ id: `SG-${i}`, name: `Schichtgruppe ${i}`, farbe: "#017070", versatz: 0, pool: false, standortId: "st1" }))
    .concat([{ id: "RES", name: "Reservepool", farbe: "#878C93", versatz: 0, pool: true, standortId: "st1" }]);

  /* Objekte und Posten: Kern OBJ-1 bis OBJ-3 laut Szenariendokument, weitere Testobjekte je nach Größe. */
  const kapazitaet = ((groesse - 5) * 3.2) / 7;
  const weitere = Math.max(0, Math.floor((kapazitaet - 3) / 4));
  const objekte = [
    { id: "OBJ-1", name: "Objekt 1 Handel (Testobjekt)", posten: [
      { id: "P1-Eingang", name: "Posten Eingang", soll: { T: 1 }, qualifikationen: [QS1] },
      { id: "P1-Streife", name: "Posten Streife", soll: { T: 1 }, qualifikationen: [QS1] }] },
    { id: "OBJ-2", name: "Objekt 2 Baustelle (Testobjekt)", posten: [
      { id: "P2-Tor", name: "Posten Tor, nachts, Alleinarbeit", soll: { N: 1 }, qualifikationen: [QS1] }] },
    { id: "OBJ-3", name: "Objekt 3 Veranstaltung (Testobjekt, einmalig)", posten: ["A", "B", "C", "D", "E", "F"].map((x) => (
      { id: `P3-${x}`, name: `Posten ${x}`, soll: { V: 1 }, qualifikationen: x === "A" ? [QS2] : [QS1] })) },
  ];
  for (let k = 0; k < weitere; k++) {
    const nr = 4 + k;
    objekte.push({ id: `OBJ-${nr}`, name: `Objekt ${nr} (Testobjekt)`, posten: [
      { id: `P${nr}-T1`, name: "Posten Tag 1", soll: { T: 1 }, qualifikationen: [QS1] },
      { id: `P${nr}-T2`, name: "Posten Tag 2", soll: { T: 1 }, qualifikationen: [QS1] },
      { id: `P${nr}-N1`, name: "Posten Nacht 1", soll: { N: 1 }, qualifikationen: [QS1] },
      { id: `P${nr}-N2`, name: "Posten Nacht 2", soll: { N: 1 }, qualifikationen: [QS1] }] });
  }
  m.objekte = objekte;
  const nT = objekte.flatMap((o) => o.posten).filter((p) => p.soll.T).length, nN = objekte.flatMap((o) => o.posten).filter((p) => p.soll.N).length;

  const da = (id, name, a, e, farbe, mind, mq) => ({ id, name, kurz: id, start: a, ende: e, pause: 45, farbe, ort: "", faktor: 1, posten: false, quelle: null,
    ruhezeitNeutral: false, rufbereitschaft: false, mindest: mind, mindestQual: mq });
  m.dienstarten = [
    da("T", "Tagdienst 12 h", "07:00", "19:00", "#3C7C8C", { mo_do: nT, fr: nT, sa: nT, so: nT }, { [QS1]: nT }),
    da("N", "Nachtdienst 12 h", "19:00", "07:00", "#43507E", { mo_do: nN, fr: nN, sa: nN, so: nN }, { [QS1]: nN }),
    da("V", "Veranstaltungsdienst 12 h", "16:00", "02:00", "#A8621B", { mo_do: 0, fr: 0, sa: 0, so: 0 }, {}),
  ];
  /* Testparameter für 12-h-Dienste, keine Rechtsaussage. */
  Object.assign(m.einstellungen, { ruhezeit: 11, maxFolge: 4, maxNachtFolge: 3, maxTagesstunden: 12, quote: null });

  const personen = [];
  const mk = (i) => `MA-S${nn(i)}`;
  const ohneQs1 = new Set([12]);
  const qs2 = new Set([2, 5, 9, 16, 11]);
  const er = new Set([1, 3, 6, 7, 10, 13]);
  const bs = new Set([2, 4, 8, 14]);
  const gruppe = (i) => (i >= 14 && i <= 16 ? "RES" : `SG-${((i - 1) % 4) + 1}`);
  const kernPerson = (i) => {
    const quals = [...(ohneQs1.has(i) ? [] : [QS1]), ...(qs2.has(i) ? [QS2] : []), ...(er.has(i) ? [ER] : []), ...(bs.has(i) ? [qBsh] : [])];
    const nach = quals.map((qid) => ({ qualId: qid, ablauf: qid === ER ? (i === 7 ? tagPlus(start, -3) : tagPlus(start, 60 + Math.floor(rnd() * 600))) : null, datei: null }));
    return personBauen("SD-S", { id: mk(i), anzeige: `S${nn(i)}`, nr: nn(i), rolle: "mitarbeiter", einheit: gruppe(i), bereich: gruppe(i), quals, nachweise: nach,
      springer: i >= 14 && i <= 16, funktion: i >= 14 && i <= 16 ? "Reserve" : ohneQs1.has(i) ? "Einarbeitung" : "Sicherheitskraft" });
  };
  for (let i = 1; i <= 16; i++) personen.push(kernPerson(i));
  const konto = (id, anzeige, nr, rolle, einheit, bereich, extra = {}) => personen.push(personBauen("SD-S", { id, anzeige, nr, rolle, einheit, bereich,
    quals: extra.sv ? [QS1] : [], nachweise: extra.sv ? [{ qualId: QS1, ablauf: null, datei: null }] : [], ...extra }));
  konto("LEI-S01", "Leitung S", "L01", "leitung", "SG-1", "ALLE", { imSchichtdienst: false, funktion: "Leitung" });
  konto("PLA-S01", "Disposition S", "L02", "planer", "SG-1", "ALLE", { imSchichtdienst: false, funktion: "Disposition" });
  konto("BR-S01", "Betriebsrat S", "L03", "betriebsrat", "SG-1", "ALLE", { imSchichtdienst: false, funktion: "Betriebsrat" });
  ["1", "2"].forEach((x) => konto(`SV-S${x}`, `Schichtverantwortung ${x}`, `V${x}`, "subplaner", `SG-${x}`, `SG-${x}`, { sv: true, funktion: "Schichtverantwortung" }));
  for (let i = 17; personen.length < groesse; i++) {
    const quals = [QS1, ...(i % 7 === 0 ? [QS2] : []), ...(i % 4 === 0 ? [ER] : [])];
    personen.push(personBauen("SD-S", { id: mk(i), anzeige: `S${nn(i)}`, nr: nn(i), rolle: "mitarbeiter", einheit: gruppe(i), bereich: gruppe(i), quals,
      nachweise: quals.map((qid) => ({ qualId: qid, ablauf: qid === ER ? tagPlus(start, 90 + Math.floor(rnd() * 500)) : null, datei: null })), funktion: "Sicherheitskraft" }));
  }
  m.personen = personen;

  const abw = (nr, id, art, von, bis) => ({ id: `abw-${nr}`, personId: id, art, von: tagPlus(start, von), bis: tagPlus(start, bis), notiz: "" });
  m.abwesenheiten = [abw(1, "MA-S04", "urlaub", 7, 11), abw(2, "MA-S08", "sonst", 3, 3), abw(3, "MA-S13", "sonst", 16, 17), abw(4, "MA-S10", "schulung", 21, 21)];
  const gesperrt = new Set();
  for (const a of m.abwesenheiten) for (let d = a.von; d <= a.bis; d = tagPlus(d, 1)) gesperrt.add(`${a.personId}|${d}`);

  const hat = (qid) => (p) => p.qualifikationen.includes(qid);
  const schichtleute = personen.filter((p) => p.imSchichtdienst !== false);
  const stufenFuer = (qid) => [(p) => !p.springer && hat(qid)(p), (p) => p.springer && hat(qid)(p)];
  const posten = objekte.flatMap((o) => o.posten.map((p) => ({ o, p })));
  const bedarf = (di) => {
    const slots = [];
    for (const { o, p } of posten) {
      if (p.soll.V) { if (di === 12) slots.push({ dienst: "V", einheit: o.id, posten: p.id, prio: 4, stufen: stufenFuer(p.qualifikationen[0]) }); continue; }
      const dienst = p.soll.T ? "T" : "N";
      slots.push({ dienst, einheit: o.id, posten: p.id, prio: dienst === "N" ? 3 : 2, stufen: stufenFuer(p.qualifikationen[0]) });
    }
    return slots;
  };
  const { zuteilung } = planen({ tage, personen: schichtleute, dienstarten: m.dienstarten, bedarf, gesperrt: (pid, tag) => gesperrt.has(`${pid}|${tag}`), rnd,
    maxFolge: 4, maxNachtFolge: 3, maxWoche: 4, nachtDienste: ["N", "V"] });

  const dz = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  anker(zuteilung, dz, tage, [
    { tag: t(2), dienst: "T", einheit: "OBJ-1", posten: "P1-Streife", ersetzen: true, personen: ["MA-S12"] },       // PS-S-02: Posten ohne Mindestqualifikation
    { tag: t(3), dienst: "N", einheit: "OBJ-2", posten: "P2-Tor", ersetzen: true, personen: ["MA-S03"] },          // PS-S-03: Nachtposten, Ersatz gesucht
    { tag: t(3), dienst: "T", einheit: "OBJ-1", posten: "P1-Eingang", ersetzen: true, personen: ["MA-S14"] },                      // PS-S-03: Reserve mit Ruhezeitkonflikt
    { tag: t(1), dienst: "N", einheit: "OBJ-2", posten: "P2-Tor", ersetzen: true, personen: ["MA-S02"] },          // PS-S-05
    { tag: t(4), dienst: "N", einheit: "OBJ-2", posten: "P2-Tor", ersetzen: true, personen: ["MA-S09"] },          // PS-S-11
    { tag: t(4), dienst: "T", einheit: "OBJ-1", posten: "P1-Eingang", ersetzen: true, personen: ["MA-S05"] },
  ]);
  for (const k of [`MA-S15|${t(3)}`, `MA-S16|${t(3)}`, `MA-S15|${t(2)}`, `MA-S16|${t(2)}`]) zuteilung.delete(k);

  m.abweichungen = {}; m.postenPlan = {};
  for (const [k, v] of [...zuteilung].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    m.abweichungen[k] = v.dienst;
    if (v.slot.posten) m.postenPlan[k] = v.slot.posten;
  }
  m.freigaben = freigabeMonate(tage);
  m.anker = start;
  return basis;
}

/* ------------------------------ Öffentliche Erzeugung --------------------- */
/**
 * Erzeugt einen Satz als vollständigen Bestand (ein Raum, ein Betrieb). Deterministisch.
 * @param {"SD-P"|"SD-S"} satz
 * @param {{ start?: string, groesse?: number, seed?: number }} [opt]
 */
export function erzeugeSatz(satz, opt = {}) {
  if (!SAETZE[satz]) throw new Error(`Unbekannter Satz: ${String(satz)}`);
  const start = opt.start || "2026-12-07";
  if (!istTag(start) || wochentag(start) !== 0) throw new Error("--start muss ein Montag sein (JJJJ-MM-TT).");
  const groesse = opt.groesse === undefined ? SAETZE[satz].groesse : opt.groesse;
  if (!Number.isInteger(groesse) || groesse < SAETZE[satz].kern + 6 || groesse > 200) throw new Error(`Größe: ganze Zahl von ${SAETZE[satz].kern + 6} bis 200.`);
  const rnd = mulberry32((opt.seed === undefined ? FESTER_SEED : opt.seed) + (satz === "SD-P" ? 1 : 2));
  const bestand = (satz === "SD-P" ? satzP : satzS)({ start, groesse, rnd });
  const m = bestand.mandanten[0];
  /* Festes Stempelfeld statt Uhr: Der Leerbetrieb setzt die Betriebskennung aus dem Raum, Seit/Stichtag aus der Uhr. */
  m.seit = "2026-01-01"; m.stichtag = null; m.laeuftAb = null; m.selbstAngelegt = false;
  m.seedMarke = { satz, version: SEED_VERSION, synthetisch: true, namensraum: SEED_MARKE, start };
  m.protokoll = []; m.dienstbuch = [];
  return bestand;
}

/** Alle Sätze, die das Werkzeug kennt. */
export const alleSaetze = (opt = {}) => Object.fromEntries(Object.keys(SAETZE).map((k) => [k, erzeugeSatz(k, opt)]));

/** Ist dieser Betrieb ein vom Werkzeug angelegter, gekennzeichneter Seed-Betrieb dieses Satzes? */
export function istSeedBetrieb(m, satz) {
  const s = SAETZE[satz];
  return !!(s && m && typeof m === "object" && m.id === s.mandant && typeof m.name === "string" && m.name.startsWith(SEED_MARKE)
    && typeof m.kontakt === "string" && m.kontakt.endsWith("@example.invalid")
    && !!m.seedMarke && m.seedMarke.synthetisch === true && m.seedMarke.namensraum === SEED_MARKE && m.seedMarke.satz === satz);
}

/* ------------------------------ Schutz ------------------------------------ */
/* Teilzeichenfolge, nicht ganzer Ordnername: "centric-prod", "produktiv", "live-data" sind Produktion. Fail-closed. */
const PROD_SEGMENT = /(prod|prd|live|kunde|customer)/i;
/** Einzige erlaubte Werte von CENTRIC_UMGEBUNG (Allowlist); ungesetzt ist erlaubt, dann entscheidet die Markendatei. */
export const TEST_UMGEBUNGEN = Object.freeze(["staging", "test", "ci", "lokal"]);
/** Der Standardhost des Produkts (post.mjs) und seine Hauptdomäne sind nie ein Testziel, auch nicht über die Markendatei. */
const PROD_HOST = /(^|\.)centric-dienstplanung\.de$/;
const TEST_LABEL = /^(staging|stage|test|qa|dev)$|-(staging|stage|test|qa|dev)$/;

/**
 * Darf das Werkzeug gegen dieses Ziel laufen? Fail-closed: erlaubt ist nur, was ausdrücklich als Testumgebung erkennbar ist.
 * Alle Bedingungen müssen gelten:
 *  1. CENTRIC_DATEN gesetzt, Ordner vorhanden, kein Pfadteil prod/production/live/…;
 *  2. im Ordner liegt die Markendatei `.centric-test-umgebung` (legt der Betreiber bewusst an);
 *  3. CENTRIC_UMGEBUNG ist ungesetzt oder genau eines von staging, test, ci, lokal (Allowlist);
 *  4. CENTRIC_BASIS (der öffentliche Host) ist ausdrücklich gesetzt, nie der Produktionshost, und entweder steht er in der
 *     Markendatei (enthält sie Hostnamen, eine je Zeile, ist nur das erlaubt) oder — bei Markendatei ohne Hostnamen — er ist
 *     localhost, 127.0.0.1, *.invalid oder sein ERSTES Label ist staging/stage/test/qa/dev (ganz) bzw. endet auf -staging usw.
 *     Ohne Angabe gilt der Standardhost des Produkts — das ist Produktion, also Ablehnung.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, gruende: string[] }}
 */
export function zielPruefen(env) {
  const gruende = [];
  /** @type {string[]} */
  let erlaubteHosts = [];
  const daten = env.CENTRIC_DATEN;
  if (!daten) gruende.push("CENTRIC_DATEN fehlt (Pfad des Datenordners).");
  else {
    const abs = path.resolve(daten);
    let echt = abs;
    try { echt = realpathSync.native(abs); } catch { /* existiert nicht: unten gemeldet */ }
    /* Beide Fassungen prüfen: eingegebener und aufgelöster Pfad (Verknüpfungen, 8.3-Kurznamen, UNC). */
    if ([abs, echt].some((p) => p.split(/[\\/]+/).some((seg) => PROD_SEGMENT.test(seg)))) gruende.push("Der Datenpfad sieht nach Produktion aus (Pfadteil enthält prod/live/kunde/customer).");
    if (!existsSync(abs) || !statSync(abs).isDirectory()) gruende.push("Der Datenordner existiert nicht.");
    else if (!existsSync(path.join(abs, TESTUMGEBUNG_MARKE))) gruende.push(`Im Datenordner fehlt die Markendatei ${TESTUMGEBUNG_MARKE} (Testumgebung nicht ausdrücklich gekennzeichnet).`);
    else erlaubteHosts = readFileSync(path.join(abs, TESTUMGEBUNG_MARKE), "utf8").split(/\r?\n/).map((z) => z.trim().toLowerCase())
      .filter((z) => z && !z.startsWith("#") && /^[a-z0-9.-]+$/.test(z) && z.includes("."));
  }
  const umgebung = String(env.CENTRIC_UMGEBUNG || "").trim().toLowerCase();
  if (umgebung && !TEST_UMGEBUNGEN.includes(umgebung)) gruende.push(`CENTRIC_UMGEBUNG "${umgebung}" ist keine erlaubte Testumgebung (erlaubt: ${TEST_UMGEBUNGEN.join(", ")} oder ungesetzt).`);
  const basis = String(env.CENTRIC_BASIS || "").trim();
  if (!basis) gruende.push("CENTRIC_BASIS ist nicht gesetzt (Standardhost des Produkts gilt als Produktion).");
  else {
    let host = "";
    try { host = new URL(basis).hostname.toLowerCase(); } catch { gruende.push("CENTRIC_BASIS ist keine gültige Adresse."); }
    if (host) {
      if (PROD_HOST.test(host)) gruende.push(`Der Host ${host} ist der Produktionshost.`);
      else if (erlaubteHosts.length) { if (!erlaubteHosts.includes(host)) gruende.push(`Der Host ${host} steht nicht in der Markendatei ${TESTUMGEBUNG_MARKE}.`); }
      else {
        const erstes = host.split(".")[0];
        const test = host === "localhost" || host === "127.0.0.1" || /\.invalid$/.test(host) || (host.includes(".") && TEST_LABEL.test(erstes));
        if (!test) gruende.push(`Der Host ${host} ist nicht als Test-/Staging-Host erkennbar (erstes Label staging, stage, test, qa, dev oder ...-staging).`);
      }
    }
  }
  return { ok: gruende.length === 0, gruende };
}

/* ------------------------------ Laden und Entfernen ----------------------- */
function wert(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length && !String(argv[i + 1]).startsWith("--") ? String(argv[i + 1]) : null;
}

/**
 * Das Werkzeug als Funktion (für die Prüfung). Schreibt nichts selbst aus; die Ausgabe steht im Ergebnis.
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<{ ok: boolean, code: number, text: string, geschrieben: string[] }>}
 */
export async function ausfuehren(argv, env = process.env) {
  const ende = (code, text, geschrieben = []) => ({ ok: code === 0, code, text: `${code === 0 ? "" : "FEHLER: "}${text}\n`, geschrieben });
  const bekannt = new Set(["--satz", "--start", "--groesse", "--ja", "--entfernen", "--trocken"]);
  const falsch = argv.find((a) => a.startsWith("--") && !bekannt.has(a));
  if (falsch) return ende(2, `Unbekannter Schalter ${falsch}.`);
  const entfernen = argv.includes("--entfernen"), trocken = argv.includes("--trocken");
  if (!trocken && !argv.includes("--ja")) return ende(2, "Zur Sicherheit ist --ja nötig (oder --trocken). Lies den Kopf dieser Datei.");
  const wahl = wert(argv, "--satz") || "beide";
  if (!["SD-P", "SD-S", "beide"].includes(wahl)) return ende(2, "--satz: SD-P, SD-S oder beide.");
  const saetze = wahl === "beide" ? Object.keys(SAETZE) : [wahl];
  const groesseRoh = wert(argv, "--groesse");
  if (groesseRoh !== null && saetze.length !== 1) return ende(2, "--groesse nur zusammen mit einem einzelnen --satz.");
  const groesse = groesseRoh === null ? undefined : Number(groesseRoh);

  const ziel = zielPruefen(env);
  if (!ziel.ok) return ende(3, `Schutz hat abgelehnt, nichts geschrieben.\n  - ${ziel.gruende.join("\n  - ")}`);

  let bestaende;
  try { bestaende = Object.fromEntries(saetze.map((k) => [k, erzeugeSatz(k, { start: wert(argv, "--start") || montagVon(new Date().toISOString().slice(0, 10)), groesse })])); }
  catch (e) { return ende(2, String((e && e.message) || e)); }

  const { ablageWurzel, getStore } = await imp("server/lib/ablage.mjs");
  if (path.resolve(ablageWurzel()) !== path.resolve(String(env.CENTRIC_DATEN))) return ende(3, "Ablage und geprüfter Datenordner sind nicht derselbe Ordner. Nichts geschrieben.");
  const { ablageBelegen } = await imp("server/lib/prozesssperre.mjs");
  const sperre = await ablageBelegen(env.CENTRIC_DATEN, { puls: false, wartenMs: 0 });
  if (!sperre.ok) return ende(1, `${sperre.grund} Den Server zuerst stoppen.`);
  try {
    const store = getStore({ name: "centric", consistency: "strong" });
    const { bestandLesen, bestandSchreiben, raumBelegt } = await imp("server/lib/bestand.mjs");
    const { alleKonten } = await imp("server/lib/konten.mjs");

    /* Erst alles prüfen, dann schreiben: Ein Raum, der kein Seed ist, stoppt den ganzen Lauf. Nur diese Prüfphase ist
       alles-oder-nichts; die Schreibphase läuft Raum für Raum (bricht sie ab, ist ein Raum evtl. schon geschrieben). */
    const vorhanden = {}, altlast = {};
    for (const k of saetze) {
      const raum = SAETZE[k].raum;
      /* Zugangsspuren auf diesen Raum: Mitgliedschaften (Index und Quelle) und Zugänge. Sie würden den neuen Seed zugänglich
         machen. Mitgliedschaften gibt es bei einem Seed nie: jede vorhandene stoppt den Lauf. Zugänge nur mit SEED-PILOT-Namen. */
      const rl = raum.toLowerCase();
      const spuren = [...(await store.list({ prefix: `raummitglied:${rl}:` })).blobs,
        ...(await store.list({ prefix: "mitglied:" })).blobs.filter((b) => b.key.toLowerCase().endsWith(`:${rl}`))];
      if (spuren.length) return ende(3, `Auf den Raum ${raum} verweisen ${spuren.length} Mitgliedschaft(en) von Konten. Nichts geschrieben, nichts gelöscht.`);
      const konten = Object.values(await alleKonten(store)).filter((c) => c && String(c.bestand || "").toLowerCase() === rl);
      const fremd = konten.filter((c) => !String(c.name || "").startsWith(SEED_MARKE));
      if (fremd.length) return ende(3, `Im Raum ${raum} gibt es ${fremd.length} Zugang/Zugänge ohne Kennzeichnung ${SEED_MARKE}. Nichts geschrieben, nichts gelöscht.`);
      altlast[k] = konten.length > 0;
      if (!(await raumBelegt(store, raum))) { vorhanden[k] = false; continue; }
      let gelesen = null;
      try { gelesen = await bestandLesen(store, raum); } catch { gelesen = null; }
      const ms = gelesen && gelesen.bestand && Array.isArray(gelesen.bestand.mandanten) ? gelesen.bestand.mandanten : null;
      if (!ms || ms.length !== 1 || !istSeedBetrieb(ms[0], k))
        return ende(3, `Der Raum ${raum} existiert, ist aber kein gekennzeichneter Seed-Betrieb. Nichts geschrieben, nichts gelöscht.`);
      vorhanden[k] = true;
    }
    if (trocken) return ende(0, `Trockenlauf: Schutz bestanden, ${saetze.length} Satz/Sätze erzeugt, nichts geschrieben.`);

    const { raumLoeschen } = await imp("server/lib/raumloeschung.mjs");
    const { erstleitungRegimeVermerken } = await imp("server/lib/erstleitung.mjs");
    const { sitzungsSpeicher } = await imp("server/lib/sitzungen.mjs");
    const geschrieben = [];
    const zeilen = [];
    for (const k of saetze) {
      const raum = SAETZE[k].raum;
      if (vorhanden[k] || altlast[k]) {
        const r = await raumLoeschen(store, sitzungsSpeicher(), raum);
        if (!r.vollstaendig) return ende(1, `Löschen des Seed-Raums ${raum} unvollständig (${r.fehler.length} Fehler).`, geschrieben);
        zeilen.push(vorhanden[k] ? `${k}: Seed-Raum ${raum} entfernt.` : `${k}: Zugangsreste mit Kennzeichnung ${SEED_MARKE} entfernt.`);
      }
      if (entfernen) continue;
      /* Regime-Marke (E-D1/F-0) vor dem Bestand, wie jeder Serverweg: ein Seed-Raum soll von Anfang an streng sein, auch bei
         ungesetztem Schalter. Raum löschen entfernt die Marke mit — daher je Lauf neu. */
      await erstleitungRegimeVermerken(store, raum, bestaende[k].mandanten[0].id, { durch: SEED_MARKE });
      await bestandSchreiben(store, raum, bestaende[k], { durch: SEED_MARKE });
      geschrieben.push(raum);
      const m = bestaende[k].mandanten[0];
      zeilen.push(`${k}: Raum ${raum} angelegt (${m.personen.length} Personen, ${Object.keys(m.abweichungen).length} Einteilungen, ${m.einheiten.length} Einheiten).`);
    }
    return ende(0, zeilen.join("\n"), geschrieben);
  } finally { await sperre.freigeben(); }
}

const direkt = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direkt) {
  ausfuehren(process.argv.slice(2)).then((r) => {
    (r.ok ? process.stdout : process.stderr).write(r.text);
    process.exit(r.code);
  }).catch((e) => { process.stderr.write(`FEHLER: ${String((e && e.message) || e)}\n`); process.exit(1); });
}
