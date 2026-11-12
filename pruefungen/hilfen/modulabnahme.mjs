/* ==========================================================================
   MODULABNAHME-MATRIX (WP-19.13, Vorarbeit) — Server-Seite, nur Testhilfe

   Rechnet je Modul, Feld und Rolle aus, was der echte Server tut:
     lesen             was bestandFuerRolle der Rolle vom Modulfeld zeigt (alles, nichts, teilweise)
     schreiben geplant der echte Schreibweg (zusammenfuehren) mit der echten Registry (alle Module „geplant“),
                       Schalter im Betrieb ausdrücklich an: Ergebnis gespeichert, wirkungslos oder abgewiesen
     schreiben Prüfmodus  dieselbe Frage mit einer Registry, in der NUR in dieser Testhilfe das Modul auf
                       „vorlaeufig“ steht (liste-Parameter von modulSchreibwegeAnwenden). Die Registry in
                       server/lib/branchenmodule.mjs wird nie verändert; kein Schalter in Produktionscode.

   Die Matrix steht in docs/acc45/WP-19-MODULABNAHME.md; pruefungen/modul-abnahme.test.js prüft, dass die Tabelle dort
   genau diese Rechnung ist (kein Abweichen). Keine Annahme über Rechte: Wo die Rechtedokumente offen sind
   (wp19-offene-fragen-agent.md, R-x), steht das Ergebnis des strengsten heutigen Verhaltens und der Verweis „offen“.
   ========================================================================== */
import { BRANCHENMODULE } from "../../server/lib/branchenmodule.mjs";
import { modulSchreibwegeAnwenden } from "../../server/lib/modulschreibwege.mjs";
import { bestandFuerRolle, zusammenfuehren, schreibumfang, darf } from "../../server/lib/rechte.mjs";
import { branchenbestand } from "./branchenbetrieb.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
export const TAG = tagPlus(3);

/** Die Spalten der Matrix. `rolle` ist die Serverrolle; demo: true wie bei Demo-Konten; betrieb: Index im Gesamtbestand. */
export const ROLLEN = Object.freeze([
  { k: "LT", rolle: "leitung", person: "l1", betrieb: 0, name: "Leitung" },
  { k: "PL", rolle: "planer", person: "p1", betrieb: 0, name: "Planung" },
  { k: "SV", rolle: "subplaner", person: "s1", betrieb: 0, name: "Schichtverantwortung" },
  { k: "MA", rolle: "mitarbeiter", person: "a1", betrieb: 0, name: "Beschäftigte" },
  { k: "BR", rolle: "betriebsrat", person: "b1", betrieb: 0, name: "Betriebsrat" },
  { k: "KD", rolle: "kunde", person: "k1", betrieb: 0, name: "Kundenrolle (Altrolle)" },
  { k: "BT", rolle: "betreiber", person: null, betrieb: 0, name: "Betreiber" },
  { k: "DL", rolle: "leitung", person: "l1", betrieb: 0, demo: true, name: "Demo-Leitung" },
  { k: "DP", rolle: "planer", person: "p1", betrieb: 0, demo: true, name: "Demo-Planung" },
  { k: "AB", rolle: "leitung", person: "x1", betrieb: 1, name: "Leitung eines anderen Betriebs" },
]);
const sitzungVon = (r) => ({ rolle: r.rolle, person: r.person, betrieb: r.betrieb, ...(r.demo ? { demo: true } : {}) });

const OBJEKTE = [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [
  { id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [] }, { id: "po2", name: "Rundgang", soll: { F: 1 }, qualifikationen: [] }] }];
const STUFEN = [{ id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.25, quelle: "Tarif X § 12 (Fassung 2026)" }];
const NIVEAUS = [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] }];
const FBEREICHE = [{ id: "op", name: "OP", soll: { F: 1 }, qualifikationen: [] }];
const BEREICHE = [{ id: "b1", name: "Bereich 1", soll: { F: 1 }, qualifikationen: [] }, { id: "b2", name: "Bereich 2", soll: { F: 1 }, qualifikationen: [] }];
const PRESSE = { id: "bm1", art: "anlage", name: "Presse 1", personId: null, mindestBesetzung: { F: 1 },
  laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } };
const KOMPETENZ = { id: "k-m1", personId: "a1", betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: true };
const GETEILT = { id: "G", name: "Geteilt", start: "06:00", ende: "10:00", zweiterAbschnitt: { start: "15:00", ende: "19:00" } };
const wachEintrag = (id, vonId, einheitId) => ({ id, datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Tor klemmt", einheitId, vonId, erfasst: "2026-11-02T08:20:00.000Z" });

/** Ausgangsbestand: zwei Einheiten, vier Pakete, alle Module AN geschaltet (der Schalter im Betrieb ist an, die Registry ist es nicht). */
function grund({ mitBestaetigung = true } = {}) {
  const g = branchenbestand({ pakete: ["sicherheit", "pflege", "klinik", "industrie"] });
  const m = g.mandanten[0];
  m.einheiten = [{ id: "e1", versatzTage: 0 }, { id: "e2", versatzTage: 0 }];
  const dazu = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv", geburtstag: "1980-01-01",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
  m.personen.push(dazu("a2", "mitarbeiter", "e1"), dazu("a3", "mitarbeiter", "e2"));
  m.qualifikationen = [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }];
  const an = (extra) => ({ an: true, ...extra });
  m.einstellungen.branchenmodule = Object.fromEntries(BRANCHENMODULE.map((x) => [x.id,
    x.mitbestimmung && mitBestaetigung ? an({ mitbestimmung: { grundlage: "Betriebsvereinbarung Test", bestaetigtAm: "2026-11-01T00:00:00.000Z", bestaetigtVon: "l1" } }) : an()]));
  /* Ein zweiter Betrieb (für die Spalte „anderer Betrieb“): eigene Leitung, keine Moduldaten. */
  g.mandanten.push({ id: "m2", name: "Zweiter Betrieb", branche: "sonstiges", pakete: ["sicherheit", "pflege", "klinik", "industrie"],
    einheiten: [{ id: "f1", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6, branchenmodule: {} },
    personen: [{ ...dazu("x1", "leitung", "f1"), bereich: "ALLE" }], abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] });
  return g;
}

/**
 * Die Beschreibung der Felder: Modul, Feld, Beispielwert (gültig), Vorbedingung am gespeicherten Stand, Datenfüllung für die Lesesicht,
 * ob der Schreibweg das Register kennt (MODUL_SCHREIBWEGE) und wer laut Dokument schreiben darf (R-x).
 * `schreiber`: die Rollenkürzel, die laut den Rechtedokumenten/-tests im Prüfmodus schreiben dürfen — oder null, wo das Dokument offen ist
 * und nur das strengste heutige Verhalten zählt (dann steht „offen“ und die Frage in `offen`).
 */
const bereitschaftWert = { [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } };
export const FELDER = Object.freeze([
  { modul: "posten", feld: "objekte", wert: () => kopie(OBJEKTE), vorab: () => {}, register: false, offen: ["P1", "P3", "FN-09", "FN-10"],
    lese: { objekte: OBJEKTE, postenPlan: { [`a1|${TAG}`]: "po1", [`a2|${TAG}`]: "po2", [`s1|${TAG}`]: "po1" } } },
  { modul: "posten", feld: "postenPlan", wert: () => ({ [`a1|${TAG}`]: "po1" }), vorab: (m) => { m.objekte = kopie(OBJEKTE); }, register: false, offen: ["P1", "P3", "FN-09", "FN-10"] },
  { modul: "wachbuch", feld: "wachbuch", register: true, offen: ["R-2", "R-3", "WB-1", "FN-01", "FN-02", "FN-03", "FN-04", "FN-05"],
    wert: (r) => ({ [`w1|${TAG}`]: { id: "w1", datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Tor klemmt", einheitId: "e1" } }),
    vorab: (m, r) => { m.objekte = kopie(OBJEKTE); if (r.person) m.postenPlan = { [`${r.person}|${TAG}`]: "po1" }; },
    lese: { wachbuch: { [`w1|${TAG}`]: wachEintrag("w1", "a1", "e1"), [`w2|${TAG}`]: wachEintrag("w2", "a2", "e1"), [`w3|${TAG}`]: wachEintrag("w3", "a3", "e2") } } },
  { modul: "objektbericht", feld: null, offen: ["R-5", "OB-2", "FN-05", "FN-06", "FN-07", "FN-08"] },
  { modul: "bereichsplan", feld: "bereichsPlan", wert: () => ({ [`a1|${TAG}`]: "b1" }), vorab: (m) => { m.einheiten[0].bereiche = kopie(BEREICHE); }, register: false, offen: ["R-3", "B2", "FN-31"],
    lese: { bereichsPlan: { [`a1|${TAG}`]: "b1", [`a2|${TAG}`]: "b1", [`a3|${TAG}`]: "b2" }, einheiten: null } },
  { modul: "pflegequal", feld: "pflegeNiveaus", wert: () => kopie(NIVEAUS), vorab: () => {}, register: true, offen: ["R-1", "R-3", "PQ-1", "FN-12", "FN-13", "FN-14"], lese: { pflegeNiveaus: NIVEAUS } },
  { modul: "bereitschaftsdienst", feld: "bereitschaftStufen", wert: () => kopie(STUFEN), vorab: () => {}, register: true, offen: ["R-1", "R-3", "BD-5", "FN-15", "FN-16", "FN-17", "FN-18", "FN-19"], lese: { bereitschaftStufen: STUFEN } },
  { modul: "bereitschaftsdienst", feld: "bereitschaft", wert: () => kopie(bereitschaftWert), vorab: (m) => { m.bereitschaftStufen = kopie(STUFEN); }, register: true,
    offen: ["R-1", "R-3", "BD-5", "FN-15", "FN-16", "FN-17", "FN-18", "FN-19"],
    lese: { bereitschaft: { [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" }, [`a2|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" }, [`a3|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" }, [`s1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } } } },
  { modul: "geteilterdienst", feld: "dienstarten", wert: (r, m) => [...kopie(m.dienstarten), kopie(GETEILT)], vorab: () => {}, register: false, offen: ["T2", "FN-20", "FN-21", "FN-22"],
    nurAenderung: true },
  { modul: "funktionsdienst", feld: "funktionsbereiche", wert: () => kopie(FBEREICHE), vorab: () => {}, register: true, offen: ["R-1", "R-3", "FN-23"], lese: { funktionsbereiche: FBEREICHE } },
  { modul: "funktionsdienst", feld: "funktionsPlan", wert: () => ({ [`a1|${TAG}`]: "op" }), vorab: (m) => { m.funktionsbereiche = kopie(FBEREICHE); }, register: true, offen: ["R-1", "R-3", "FN-23"],
    lese: { funktionsPlan: { [`a1|${TAG}`]: "op", [`a2|${TAG}`]: "op", [`a3|${TAG}`]: "op" } } },
  { modul: "rotation", feld: "rotationen", register: true, offen: ["R-1", "R-3", "RO-3", "R-11", "FN-24", "FN-25"],
    wert: () => ({ [`r1|${TAG}`]: { id: "r1", personId: "a1", art: "einsatz", einheitId: "e1", von: TAG, bis: tagPlus(10) } }), vorab: () => {},
    lese: { rotationen: { [`r1|${TAG}`]: { id: "r1", personId: "a1", art: "einsatz", einheitId: "e1", von: TAG, bis: tagPlus(10) },
      [`r2|${TAG}`]: { id: "r2", personId: "a3", art: "einsatz", einheitId: "e2", von: TAG, bis: tagPlus(10) },
      [`r3|${TAG}`]: { id: "r3", personId: "s1", art: "einsatz", einheitId: "e1", von: TAG, bis: tagPlus(10) } } } },
  { modul: "anlagen", feld: "betriebsmittel", wert: () => [kopie(PRESSE)], vorab: () => {}, register: false, offen: ["A1", "FN-11"] },
  { modul: "maschinenqual", feld: "kompetenzen", wert: () => [kopie(KOMPETENZ)], vorab: (m) => { m.betriebsmittel = [kopie(PRESSE)]; }, register: false, offen: ["M1", "M3", "FN-26", "FN-27"] },
  { modul: "kontimodelle", feld: null, offen: ["K1", "FN-28", "FN-29", "FN-30"] },
]);
/** Was gelesen wird: das Feld mit seiner Befüllung (Lesesicht). Für Felder ohne eigene Füllung zählt die Füllung des Schreibtests. */
const LESE_ZUSAETZLICH = Object.freeze({
  postenPlan: { postenPlan: { [`a1|${TAG}`]: "po1", [`a2|${TAG}`]: "po2", [`s1|${TAG}`]: "po1" }, objekte: OBJEKTE },
  dienstarten: { dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, GETEILT] },
  betriebsmittel: { betriebsmittel: [PRESSE] },
  kompetenzen: { betriebsmittel: [PRESSE], kompetenzen: [KOMPETENZ, { ...KOMPETENZ, id: "k-m2", personId: "a3" }] },
  funktionsbereiche: { funktionsbereiche: FBEREICHE },
  bereichsPlan: { bereichsPlan: { [`a1|${TAG}`]: "b1", [`a2|${TAG}`]: "b1", [`a3|${TAG}`]: "b2" } },
});
/** Eigenheiten des Betriebs 0, die in der Sicht eines anderen Betriebs nie vorkommen dürfen. */
const FREMDMARKEN = Object.freeze(["Testbetrieb", "Objekt Nord", "Tor klemmt", "Presse 1", "Geteilt", "Stufe B", "Pflegefachkraft", "Bereich 1", "Pforte"]);
const zaehle = (feld, w) => {
  if (w === undefined || w === null) return 0;
  if (feld === "objekte") return (Array.isArray(w) ? w : []).reduce((n, o) => n + (o && Array.isArray(o.posten) ? o.posten.length : 0), 0);
  return Array.isArray(w) ? w.length : typeof w === "object" ? Object.keys(w).length : 0;
};

const LISTE_PRUEF = (ids, mitbestimmung) => BRANCHENMODULE.map((x) => (ids.includes(x.id)
  ? { ...x, status: "vorlaeufig", mitbestimmung: mitbestimmung === undefined ? x.mitbestimmung : mitbestimmung } : x));
/** Prüfmodus: alle Module „vorlaeufig“, Mitbestimmung bestätigt (Schalter im Betrieb gespeichert). NUR in der Testhilfe. */
export const PRUEF_LISTE = LISTE_PRUEF(BRANCHENMODULE.map((x) => x.id));

/** Ergebnis eines Schreibversuchs: abgewiesen | wirkungslos | gespeichert. */
function urteil(res, mandantenIndex, f, wert) {
  if (res === null || res === undefined || res.verweigert || res.grund) return "abgewiesen";
  const m = res.mandanten ? res.mandanten[mandantenIndex] : res.mandant;
  return m && angenommen(f, m[f.feld], wert) ? "gespeichert" : "wirkungslos";
}
/** Ist der Wert gespeichert? Wachbuch: Verfasser und Zeit setzt der Server, also zählt, dass der Eintrag da ist. */
const angenommen = (f, gespeichert, wert) => (f.feld === "wachbuch"
  ? !!gespeichert && Object.keys(wert).every((k) => Object.prototype.hasOwnProperty.call(gespeichert, k) && gespeichert[k].text === wert[k].text)
  : gleich(gespeichert, wert));

/** Schreiben über den echten Server (zusammenfuehren) — das, was PUT /api/bestand tut. */
function schreibenEcht(f, r, mitBestaetigung = true) {
  const g = grund({ mitBestaetigung });
  const m = g.mandanten[0];
  f.vorab(m, r);
  const wert = f.wert(r, m);
  const sitz = sitzungVon(r);
  const roh = bestandFuerRolle(g, sitz);
  const s = kopie(roh || { mandanten: [] });
  if (r.betrieb === 1) {
    /* Anderer Betrieb: Es wird der Betrieb 0 mit der Änderung übermittelt (Angriff auf fremden Betrieb). */
    s.mandanten = [kopie(m)]; s.mandanten[0][f.feld] = kopie(wert);
    const res = zusammenfuehren(g, s, sitz);
    return res === null || res.verweigert ? "abgewiesen" : (angenommen(f, res.mandanten[0][f.feld], wert) ? "gespeichert" : "wirkungslos");
  }
  if (!s.mandanten || !s.mandanten[0]) s.mandanten = [{ id: m.id }];
  s.mandanten[0][f.feld] = kopie(wert);
  return urteil(zusammenfuehren(g, s, sitz), 0, f, wert);
}

/** Prüfmodus: das Register steht (nur hier) auf „vorlaeufig“. Wer den Modulweg im echten Ablauf nie erreicht, wird über den echten Weg gerechnet. */
function schreibenPruef(f, r, { mitbestimmungOffen = false } = {}) {
  const umfang = schreibumfang(r.rolle);
  const erreicht = (umfang === "voll" || umfang === "einheit") && r.betrieb === 0;
  if (!f.register || !erreicht) return schreibenEcht(f, r);
  const g = grund({ mitBestaetigung: !mitbestimmungOffen });
  const alt = g.mandanten[0];
  f.vorab(alt, r);
  const wert = f.wert(r, alt);
  const neu = kopie(alt);
  neu[f.feld] = kopie(wert);
  const ktx = { sitzung: sitzungVon(r), rolle: r.rolle, umfang, darfOrgEdit: darf(r.rolle, "org.edit"),
    liste: LISTE_PRUEF(BRANCHENMODULE.map((x) => x.id), mitbestimmungOffen ? undefined : false) };
  const res = modulSchreibwegeAnwenden(alt, neu, ktx);
  return res.grund ? "abgewiesen" : (angenommen(f, res.mandant[f.feld], wert) ? "gespeichert" : "wirkungslos");
}

/** Lesen: was die Rolle vom Feld sieht. */
function lesenVon(f, r) {
  const g = grund();
  const m = g.mandanten[0];
  const voll = { ...(LESE_ZUSAETZLICH[f.feld] || {}), ...(f.lese || {}) };
  delete voll.einheiten;
  if (f.feld === "bereichsPlan") m.einheiten[0].bereiche = kopie(BEREICHE);
  for (const [k, v] of Object.entries(voll)) m[k] = kopie(v);
  const alle = zaehle(f.feld, voll[f.feld]);
  const s = bestandFuerRolle(g, sitzungVon(r));
  const mandanten = s && Array.isArray(s.mandanten) ? s.mandanten : [];
  if (r.betrieb === 1) {
    /* Betrieb 1: sichtbar ist nur der eigene; vom Betrieb 0 darf nichts erscheinen. */
    const text = JSON.stringify(mandanten);
    return !text.includes(`"id":"${m.id}"`) && !FREMDMARKEN.some((t) => text.includes(t)) ? "nichts" : "LECK";
  }
  const mm = mandanten.find((x) => x && x.id === m.id);
  const n = mm ? zaehle(f.feld, mm[f.feld]) : 0;
  return n === 0 ? "nichts" : n === alle ? "alles" : `teilweise ${n}/${alle}`;
}

/** Fälle ohne Betriebsfeld (Objektbericht, Kontimodelle) und deren feste Rechte (zugriff.js), ohne Annahme. */
export async function berichtZugriff(rolle) {
  const { berichtZugriffFuer, wachbuchZugriffFuer } = await import("../../src/module/zugriff.js");
  return { bericht: berichtZugriffFuer(rolle), wachbuch: wachbuchZugriffFuer(rolle) };
}

/**
 * Die Matrix: Liste von Zeilen { modul, feld, art, zellen: { LT: "…", … }, offen }.
 * art: lesen | schreiben-geplant | schreiben-pruef | schreiben-pruef-ohne-bestaetigung (nur Mitbestimmungsmodule)
 */
export function berechneMatrix() {
  const zeilen = [];
  for (const f of FELDER) {
    if (!f.feld) continue;
    const zellen = (fn) => Object.fromEntries(ROLLEN.map((r) => [r.k, fn(r)]));
    zeilen.push({ modul: f.modul, feld: f.feld, art: "lesen", register: f.register, offen: f.offen, zellen: zellen((r) => lesenVon(f, r)) });
    zeilen.push({ modul: f.modul, feld: f.feld, art: "schreiben-geplant", register: f.register, offen: f.offen, zellen: zellen((r) => schreibenEcht(f, r)) });
    zeilen.push({ modul: f.modul, feld: f.feld, art: "schreiben-pruef", register: f.register, offen: f.offen, zellen: zellen((r) => schreibenPruef(f, r)) });
    if (f.modul === "wachbuch")
      zeilen.push({ modul: f.modul, feld: f.feld, art: "schreiben-pruef-ohne-bestaetigung", register: f.register, offen: f.offen,
        zellen: zellen((r) => schreibenPruef(f, r, { mitbestimmungOffen: true })) });
  }
  return zeilen;
}

export const ARTEN = Object.freeze({
  lesen: "lesen (Sicht der Rolle)",
  "schreiben-geplant": "schreiben, Registry „geplant“ (echt)",
  "schreiben-pruef": "schreiben, Prüfmodus „vorlaeufig“ (nur Test)",
  "schreiben-pruef-ohne-bestaetigung": "schreiben, Prüfmodus ohne Mitbestimmungsbestätigung",
});
const KURZ = { abgewiesen: "abgewiesen", wirkungslos: "wirkungslos", gespeichert: "GESPEICHERT", nichts: "nichts", alles: "alles", LECK: "LECK" };

/** Die Tabelle des Dokuments: je Modul ein Abschnitt. Deterministisch. */
export function matrixMarkdown(zeilen = berechneMatrix()) {
  const kopf = `| Feld | Fall | Register | ${ROLLEN.map((r) => r.k).join(" | ")} | offen |`;
  const trenn = `|---|---|---|${ROLLEN.map(() => "---").join("|")}|---|`;
  const aus = [];
  for (const mod of BRANCHENMODULE) {
    const z = zeilen.filter((x) => x.modul === mod.id);
    aus.push(`### ${mod.id} (${mod.name}) — Registry: ${mod.status}`, "");
    if (!z.length) {
      const ohne = FELDER.find((x) => x.modul === mod.id);
      aus.push(`Kein Betriebsfeld und kein Schreibweg des Moduls (siehe Abschnitt „Module ohne Betriebsfeld“). Offen: ${ohne ? ohne.offen.join(", ") : "–"}.`, "");
      continue;
    }
    aus.push(kopf, trenn);
    for (const x of z) {
      aus.push(`| ${x.feld} | ${ARTEN[x.art]} | ${x.register ? "ja" : "nein"} | ${ROLLEN.map((r) => KURZ[x.zellen[r.k]] || x.zellen[r.k]).join(" | ")} | ${x.offen.join(", ")} |`);
    }
    aus.push("");
  }
  return aus.join("\n");
}

/* ------------------------------------------------------------------------ Zugriffsstufen der Ansichten (src/module/zugriff.js) */
import { berichtZugriffFuer, wachbuchZugriffFuer } from "../../src/module/zugriff.js";

/** Zugriffsstufen der Ansichten je Serverrolle (nicht erfunden: die Funktionen der Oberfläche selbst). */
export function zugriffMarkdown() {
  const rollen = ROLLEN.filter((r) => r.betrieb === 0 && !r.demo);
  const aus = [`| Ansicht | ${rollen.map((r) => r.k).join(" | ")} | offen |`, `|---|${rollen.map(() => "---").join("|")}|---|`];
  aus.push(`| Objektbericht (berichtZugriffFuer) | ${rollen.map((r) => berichtZugriffFuer(r.rolle)).join(" | ")} | R-5, OB-2 |`);
  aus.push(`| Wachbuch (wachbuchZugriffFuer) | ${rollen.map((r) => wachbuchZugriffFuer(r.rolle)).join(" | ")} | R-3, R-4, WB-2 |`);
  return aus.join("\n");
}

/* ------------------------------------------------------------------------ Bestand für die Oberflächenprüfung */
/** Betrieb mit allen Modulfeldern gefüllt; `aus`: Schalter aus (Einschalten sichtbar). Dazu Gesundheitsköder (dürfen nie in einer Modulansicht stehen). */
export function betriebMitDaten({ aus = false } = {}) {
  const g = grund();
  const m = g.mandanten[0];
  for (const f of FELDER) {
    if (!f.feld) continue;
    f.vorab(m, ROLLEN[0]);
    const voll = { ...(LESE_ZUSAETZLICH[f.feld] || {}), ...(f.lese || {}) };
    delete voll.einheiten;
    for (const [k, v] of Object.entries(voll)) m[k] = kopie(v);
  }
  m.einheiten[0].bereiche = kopie(BEREICHE);
  m.betriebsmittel = [kopie(PRESSE)];
  m.krankmeldungen = [{ id: "km-1", personId: "a1", von: TAG, bis: TAG, status: "eingegangen", notiz: GESUNDHEITSKOEDER[0], verlauf: [] }];
  m.abwesenheiten = [{ id: "ab-1", personId: "a1", von: TAG, bis: TAG, art: "krank", notiz: GESUNDHEITSKOEDER[1] }];
  if (aus) m.einstellungen.branchenmodule = {};
  return g;
}
export const GESUNDHEITSKOEDER = Object.freeze(["GESUNDHEITSKOEDER-KRANKMELDUNG", "GESUNDHEITSKOEDER-ABWESENHEIT"]);

/** Die Sicht einer Rolle als Oberflächen-Sitzung (wie App.jsx sie baut): Rolle, Person, Betrieb in der Sicht der Rolle. */
export function sitzungFuerOberflaeche(g, r) {
  const s = bestandFuerRolle(g, sitzungVon(r));
  const mandant = s && Array.isArray(s.mandanten) ? s.mandanten.find((x) => x && x.id === "m1") || null : null;
  const person = mandant ? (mandant.personen || []).find((p) => p && p.id === r.person) || null : null;
  return { rolle: r.rolle, person, mandant, demo: !!r.demo };
}
export const darfRolle = (rolle) => (recht) => darf(rolle, recht);

/* ------------------------------------------------------------------------ Dokument: erzeugte Blöcke */
import { readFileSync, writeFileSync } from "node:fs";
export const DOKUMENT = new URL("../../docs/acc45/WP-19-MODULABNAHME.md", import.meta.url);
const markeA = (n) => `<!-- ${n}:BEGIN -->`, markeE = (n) => `<!-- ${n}:END -->`;
const norm = (t) => t.replace(/\r\n/g, "\n");
/** Der Inhalt zwischen den Markierungen oder null. */
export function blockLesen(name, doc = norm(readFileSync(DOKUMENT, "utf8"))) {
  const a = doc.indexOf(markeA(name)), e = doc.indexOf(markeE(name));
  return a < 0 || e < a ? null : doc.slice(a + markeA(name).length, e).replace(/^\n/, "").replace(/\n$/, "");
}
/** Setzt den Block neu (nur mit MODULABNAHME_SCHREIBEN=1 aus dem Test aufgerufen). */
export function blockSchreiben(name, inhalt) {
  const doc = norm(readFileSync(DOKUMENT, "utf8"));
  const a = doc.indexOf(markeA(name)), e = doc.indexOf(markeE(name));
  if (a < 0 || e < a) throw new Error(`Markierung ${name} fehlt in ${DOKUMENT.pathname}`);
  writeFileSync(DOKUMENT, doc.slice(0, a + markeA(name).length) + "\n" + inhalt + "\n" + doc.slice(e), "utf8");
}
/** Stimmt der Block im Dokument mit der Rechnung überein? Mit MODULABNAHME_SCHREIBEN=1 wird er zuvor neu geschrieben. */
export function blockPruefen(name, inhalt) {
  if (process.env.MODULABNAHME_SCHREIBEN === "1") blockSchreiben(name, inhalt);
  return blockLesen(name);
}
