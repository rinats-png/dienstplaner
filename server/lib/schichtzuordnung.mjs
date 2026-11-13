/* ==========================================================================
   IMP-6 Teil 2 — MEHRERE SCHICHTMODELLE JE PERSON (serverseitig, ohne Aktivierung)

   Betreiberentscheidung 2026-11-13 (verbindlich): Eine Person kann mehrere
   Schichtmodelle tragen. Jedes Modell hat eine eindeutige Kennung, jede
   Zuordnung einen Gültigkeitszeitraum; der Server prüft beides. Für jeden Tag
   ist das anzuwendende Modell eindeutig bestimmbar — oder die Antwort sagt
   ausdrücklich „keine“ bzw. „mehrdeutig“. Es gibt keinen stillen Vorrang
   (kein „das letzte gewinnt“, kein „das spätere gewinnt“).

   Datenmodell (additiv, keine Migration):
   - m.schichtmodelle = [{ id, name, tage: string[], geaendertAm, geaendertVon, version }]
     tage: je Zyklustag eine Dienstart-Kennung des Betriebs oder "-" (frei).
   - person.schichtmodellZuordnungen = [{ id, modellId, gueltigAb, gueltigBis, versatz?,
     geaendertAm, geaendertVon, version }]
     gueltigAb/gueltigBis: JJJJ-MM-TT, beide einschließlich; null = offen.
     Am Tag gueltigAb arbeitet die Person Zyklustag versatz + 1 (wie der Import, IMP-6 §Format).
   - Das bisherige EINE Modell des Betriebs (m.zyklus, m.anker, Versatz der
     Einheit) heißt hier BETRIEB_MODELL ("betrieb"). Fehlt das Feld an der
     Person oder ist die Liste leer, gilt es als implizite, unbefristete
     Zuordnung — Altbestand bleibt gültig und UNVERÄNDERT, nichts wird
     umgeschrieben (Rundweg ohne Änderung).

   Die Zuordnung wirkt in diesem Paket NICHT auf die Planrechnung (dienstAm,
   Oberfläche) — das Einschalten ist eine eigene Entscheidung. Sie wird
   gespeichert, geprüft, gegen Rückwirkung geschützt und protokolliert, und
   die Importvorschau zeigt Modellwechsel an.

   Rein: keine Ablage, keine Uhr (heute wird übergeben). Kein node:-Modul —
   die Datei erreicht über rechte.mjs auch das Oberflächenbündel.
   ========================================================================== */
import { einheitAm, einheitDienst } from "./fachpruefung.mjs";
import { abgeschlosseneMonate, monatText } from "./monatsabschluss.mjs";

/** Kennung des bisherigen Betriebsmodells (m.zyklus); reserviert, nie Kennung eines eigenen Modells. */
export const BETRIEB_MODELL = "betrieb";
export const ZUORDNUNG_FELD = "schichtmodellZuordnungen";
export const MODELLE_FELD = "schichtmodelle";

/** Technische Grenzen (keine Geschäftsregel): gegen unsinnige oder teure Eingaben. */
export const SCHICHTMODELL_GRENZEN = Object.freeze({ modelle: 50, tage: 1000, nameLaenge: 80, zuordnungenJePerson: 50,
  kennungLaenge: 40, protokollZeilen: 50 });
/** Felder, die nur der Server setzt; mitgeschickt wirkungslos. */
export const SERVERFELDER = Object.freeze(["geaendertAm", "geaendertVon", "version"]);
const ZUORDNUNG_FELDER = Object.freeze(["id", "modellId", "gueltigAb", "gueltigBis", "versatz", ...SERVERFELDER]);
const MODELL_FELDER_ERLAUBT = Object.freeze(["id", "name", "tage", ...SERVERFELDER]);

const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const KENNUNG = /^[A-Za-z0-9_-]{1,40}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, f) => !!o && Object.prototype.hasOwnProperty.call(o, f);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Ein wirkliches Kalenderdatum JJJJ-MM-TT? */
export function gueltigesDatum(s) {
  const t = typeof s === "string" ? TAG.exec(s) : null;
  if (!t) return false;
  const d = new Date(Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3])));
  return d.toISOString().slice(0, 10) === s;
}
const tagMs = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
/** Tage zwischen zwei Daten, ohne Zeitzone (Zeitumstellung spielt für Kalendertage keine Rolle). */
const zwischen = (a, b) => Math.round((tagMs(b) - tagMs(a)) / 86400000);
/** Datum + n Tage, ohne Zeitzone. */
export const plusTage = (s, n) => new Date(tagMs(s) + n * 86400000).toISOString().slice(0, 10);
const mod = (a, n) => ((a % n) + n) % n;

/** Die Modelle des Betriebs als Verzeichnis (nur wohlgeformte Einträge). */
export function modellVerzeichnis(m) {
  const aus = new Map();
  for (const x of (m && Array.isArray(m[MODELLE_FELD]) ? m[MODELLE_FELD] : []))
    if (istObjekt(x) && typeof x.id === "string" && x.id !== BETRIEB_MODELL && Array.isArray(x.tage) && x.tage.length) aus.set(x.id, x);
  return aus;
}

/** Die implizite Zuordnung des Altbestands: das Betriebsmodell, unbefristet. */
export const IMPLIZIT = Object.freeze({ id: null, modellId: BETRIEB_MODELL, gueltigAb: null, gueltigBis: null });

/** Die Zuordnungen einer Person — ohne Feld oder mit leerer Liste die implizite. */
export function zuordnungenVon(p) {
  const l = p && Array.isArray(p[ZUORDNUNG_FELD]) ? p[ZUORDNUNG_FELD] : null;
  return l && l.length ? l : [IMPLIZIT];
}

const deckt = (z, d) => (z.gueltigAb === null || z.gueltigAb === undefined || z.gueltigAb <= d)
  && (z.gueltigBis === null || z.gueltigBis === undefined || d <= z.gueltigBis);

/**
 * Das an einem Tag anzuwendende Schichtmodell einer Person. Genau ein Ergebnis:
 * - { art: "modell", modellId, zuordnungId, versatz, anker, quelle: "zuordnung" | "betrieb" }
 * - { art: "keine" }                       — kein Modell gilt an diesem Tag (Klärung nötig)
 * - { art: "mehrdeutig", zuordnungIds }    — mehrere gelten (Klärung nötig, nie still entschieden)
 * - { art: "ungueltig", grund }            — Datum oder gespeicherte Zuordnung fehlerhaft (Klärung nötig)
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} datum JJJJ-MM-TT
 */
export function anzuwendendesModell(m, p, datum) {
  if (!gueltigesDatum(datum)) return { art: "ungueltig", grund: "datum" };
  const treffer = [];
  for (const z of zuordnungenVon(p)) {
    if (!istObjekt(z)) return { art: "ungueltig", grund: "zuordnung" };
    for (const f of ["gueltigAb", "gueltigBis"])
      if (z[f] !== null && z[f] !== undefined && !gueltigesDatum(z[f])) return { art: "ungueltig", grund: "zuordnung" };
    if (deckt(z, datum)) treffer.push(z);
  }
  if (!treffer.length) return { art: "keine" };
  if (treffer.length > 1) return { art: "mehrdeutig", zuordnungIds: treffer.map((z) => (z.id === undefined ? null : z.id)) };
  const z = treffer[0];
  if (z.modellId === BETRIEB_MODELL)
    return { art: "modell", modellId: BETRIEB_MODELL, zuordnungId: z.id ?? null, versatz: null, anker: null, quelle: "betrieb" };
  const modell = modellVerzeichnis(m).get(z.modellId);
  if (!modell) return { art: "ungueltig", grund: "modell-unbekannt" };
  if (!z.gueltigAb) return { art: "ungueltig", grund: "anker" };
  return { art: "modell", modellId: z.modellId, zuordnungId: z.id ?? null, versatz: Number.isInteger(z.versatz) ? z.versatz : 0,
    anker: z.gueltigAb, quelle: "zuordnung" };
}

/**
 * Der Dienst der Schichtfolge einer Person an einem Tag nach dem anzuwendenden Modell (ohne Abweichungen,
 * Abwesenheiten, Teilzeit — das bleibt der Planrechnung). Ohne eindeutiges Modell die Klärung, nie ein Dienst.
 * @returns {{ art: string } & Record<string, any>} art "dienst" (modellId, dienstId oder null = frei) oder die Klärung wie anzuwendendesModell
 */
export function modellDienstAm(m, p, datum) {
  const r = anzuwendendesModell(m, p, datum);
  if (r.art !== "modell") return r;
  if (r.quelle === "betrieb") {
    const eid = einheitAm(p, datum);
    return { art: "dienst", modellId: BETRIEB_MODELL, dienstId: eid ? einheitDienst(m, eid, datum) : null };
  }
  const tage = /** @type {any} */ (modellVerzeichnis(m).get(r.modellId)).tage;
  const id = tage[mod(zwischen(/** @type {string} */ (r.anker), datum) + r.versatz, tage.length)];
  return { art: "dienst", modellId: r.modellId, dienstId: id && id !== "-" ? id : null };
}

/* --------------------------------------------------------------------------
   PRÜFUNG EINER ZUORDNUNGSLISTE (blockiert statt aufzulösen)
   -------------------------------------------------------------------------- */

/**
 * Prüft die ganze Zuordnungsliste einer Person: Form, Kennungen, Modelle, Daten, Versatz, Überschneidung, Lücke.
 * Eine leere Liste ist gültig (implizites Betriebsmodell). Liefert den ersten Befund oder null.
 * @param {any} liste
 * @param {Map<string, any>} modelle Verzeichnis der Modelle des Betriebs (modellVerzeichnis)
 * @returns {null | { code: string, text: string }}
 */
export function pruefeZuordnungen(liste, modelle) {
  const G = SCHICHTMODELL_GRENZEN;
  const f = (code, text) => ({ code, text });
  if (!Array.isArray(liste)) return f("FORM", "Erwartet wird eine Liste von Zuordnungen.");
  if (liste.length > G.zuordnungenJePerson) return f("ZU_VIELE", `Höchstens ${G.zuordnungenJePerson} Zuordnungen je Person.`);
  const ids = new Set();
  for (const z of liste) {
    if (!istObjekt(z)) return f("FORM", "Eine Zuordnung ist kein Datensatz.");
    for (const k of Object.keys(z)) if (!ZUORDNUNG_FELDER.includes(k)) return f("FORM", `Unbekanntes Feld an einer Zuordnung.`);
    if (typeof z.id !== "string" || !KENNUNG.test(z.id)) return f("KENNUNG", "Jede Zuordnung braucht eine Kennung (Buchstaben, Ziffern, - und _, höchstens 40 Zeichen).");
    if (ids.has(z.id)) return f("DOPPELT", `Die Kennung ${z.id} kommt doppelt vor.`);
    ids.add(z.id);
    if (typeof z.modellId !== "string") return f("MODELL_UNBEKANNT", `Zuordnung ${z.id}: Schichtmodell fehlt.`);
    if (z.modellId !== BETRIEB_MODELL && !modelle.has(z.modellId)) return f("MODELL_UNBEKANNT", `Zuordnung ${z.id}: Das Schichtmodell ${kennung(z.modellId)} gibt es im Betrieb nicht.`);
    for (const k of ["gueltigAb", "gueltigBis"])
      if (!hat(z, k) || (z[k] !== null && !gueltigesDatum(z[k]))) return f("DATUM", `Zuordnung ${z.id}: ${k === "gueltigAb" ? "Gültig ab" : "Gültig bis"} ist kein gültiges Datum (JJJJ-MM-TT oder leer).`);
    if (z.gueltigAb !== null && z.gueltigBis !== null && z.gueltigBis < z.gueltigAb) return f("REIHENFOLGE", `Zuordnung ${z.id}: „Gültig bis“ liegt vor „Gültig ab“.`);
    if (z.modellId === BETRIEB_MODELL) {
      if (hat(z, "versatz") && z.versatz !== null) return f("VERSATZ", `Zuordnung ${z.id}: Beim Betriebsmodell kommt der Versatz aus der Einheit.`);
    } else {
      if (z.gueltigAb === null) return f("ANKER", `Zuordnung ${z.id}: Ein eigenes Schichtmodell braucht „Gültig ab“ (dort beginnt der Zyklus).`);
      const len = modelle.get(z.modellId).tage.length;
      if (hat(z, "versatz") && z.versatz !== null && (!Number.isInteger(z.versatz) || z.versatz < 0 || z.versatz >= len))
        return f("VERSATZ", `Zuordnung ${z.id}: Versatz muss eine ganze Zahl von 0 bis ${len - 1} sein.`);
    }
  }
  /* Überschneidung und Lücke: nach Beginn geordnet (offen = ganz vorn). Nie still entscheiden. */
  const geordnet = [...liste].sort((a, b) => (a.gueltigAb === null ? -1 : b.gueltigAb === null ? 1 : a.gueltigAb < b.gueltigAb ? -1 : a.gueltigAb > b.gueltigAb ? 1 : 0));
  for (let i = 1; i < geordnet.length; i++) {
    const v = geordnet[i - 1], z = geordnet[i];
    if (v.gueltigBis === null || z.gueltigAb === null || z.gueltigAb <= v.gueltigBis)
      return f("UEBERSCHNEIDUNG", `Die Zuordnungen ${v.id} und ${z.id} überschneiden sich. Für jeden Tag muss genau ein Schichtmodell gelten — bitte die Zeiträume klären.`);
    if (plusTage(v.gueltigBis, 1) !== z.gueltigAb)
      return f("LUECKE", `Zwischen den Zuordnungen ${v.id} und ${z.id} gilt kein Schichtmodell (ab ${plusTage(v.gueltigBis, 1)}). Bitte die Lücke schließen oder die Zeiträume klären.`);
  }
  return null;
}

/**
 * Prüft die Modellliste des Betriebs: Form, Kennung (eindeutig, nicht "betrieb"), Name, Tage (Dienstarten des Betriebs).
 * @returns {null | { code: string, text: string }}
 */
export function pruefeModelle(liste, dienstarten) {
  const G = SCHICHTMODELL_GRENZEN;
  const f = (code, text) => ({ code, text });
  if (!Array.isArray(liste)) return f("FORM", "Schichtmodelle: erwartet wird eine Liste.");
  if (liste.length > G.modelle) return f("ZU_VIELE", `Höchstens ${G.modelle} Schichtmodelle je Betrieb.`);
  const bekannt = new Set((Array.isArray(dienstarten) ? dienstarten : []).filter(istObjekt).map((d) => String(d.id)));
  const ids = new Set();
  for (const x of liste) {
    if (!istObjekt(x)) return f("FORM", "Ein Schichtmodell ist kein Datensatz.");
    for (const k of Object.keys(x)) if (!MODELL_FELDER_ERLAUBT.includes(k)) return f("FORM", `Unbekanntes Feld an einem Schichtmodell.`);
    if (typeof x.id !== "string" || !KENNUNG.test(x.id)) return f("KENNUNG", "Jedes Schichtmodell braucht eine Kennung (Buchstaben, Ziffern, - und _, höchstens 40 Zeichen).");
    if (x.id === BETRIEB_MODELL) return f("KENNUNG", `Die Kennung ${BETRIEB_MODELL} ist für die bisherige Schichtfolge des Betriebs reserviert.`);
    if (ids.has(x.id)) return f("DOPPELT", `Die Kennung ${x.id} kommt doppelt vor.`);
    ids.add(x.id);
    if (typeof x.name !== "string" || !x.name.trim() || x.name.length > G.nameLaenge) return f("NAME", `Schichtmodell ${x.id}: Name fehlt oder ist länger als ${G.nameLaenge} Zeichen.`);
    if (!Array.isArray(x.tage) || !x.tage.length || x.tage.length > G.tage) return f("TAGE", `Schichtmodell ${x.id}: 1 bis ${G.tage} Zyklustage.`);
    for (const t of x.tage)
      if (typeof t !== "string" || (t !== "-" && !bekannt.has(t))) return f("DIENSTART", `Schichtmodell ${x.id}: Jeder Zyklustag ist eine Dienstart des Betriebs oder „-“ (frei).`);
  }
  return null;
}

/* --------------------------------------------------------------------------
   RÜCKWIRKUNG: welche Tage ändert eine neue Liste?
   -------------------------------------------------------------------------- */

/** Was an einem Tag gilt, als Vergleichsschlüssel (Modell, Versatz, Anker — die Zykluslage). */
const schluessel = (m, p, d) => { const r = anzuwendendesModell(m, p, d); return JSON.stringify([r.art, r.modellId ?? null, r.versatz ?? null, r.anker ?? null]); };

/**
 * Die Zeiträume, in denen sich das anzuwendende Modell durch die neue Liste ändert. Zwischen zwei Grenzen
 * (Beginn oder Tag nach dem Ende einer Zuordnung, alt oder neu) ist das Ergebnis konstant; verglichen wird je Abschnitt.
 * Auch eine geänderte Modelldefinition (Tage) zählt für jeden Abschnitt, in dem das Modell gilt.
 * @returns {{ von: string | null, bis: string | null }[]} von null = seit jeher, bis null = unbefristet
 */
export function geaenderteZeitraeume(altM, altP, neuM, neuP, geaenderteModelle = new Set()) {
  const punkte = new Set();
  for (const z of [...zuordnungenVon(altP), ...zuordnungenVon(neuP)]) {
    if (!istObjekt(z)) continue;
    if (gueltigesDatum(z.gueltigAb)) punkte.add(z.gueltigAb);
    if (gueltigesDatum(z.gueltigBis)) punkte.add(plusTage(z.gueltigBis, 1));
  }
  const p = [...punkte].sort();
  const abschnitte = [];
  abschnitte.push({ von: null, bis: p.length ? plusTage(p[0], -1) : null, probe: p.length ? plusTage(p[0], -1) : "2000-01-01" });
  p.forEach((x, i) => abschnitte.push({ von: x, bis: i + 1 < p.length ? plusTage(p[i + 1], -1) : null, probe: x }));
  const aus = [];
  for (const a of abschnitte) {
    const alt = anzuwendendesModell(altM, altP, a.probe), neu = anzuwendendesModell(neuM, neuP, a.probe);
    const geaendert = schluessel(altM, altP, a.probe) !== schluessel(neuM, neuP, a.probe)
      || (neu.art === "modell" && geaenderteModelle.has(neu.modellId)) || (alt.art === "modell" && geaenderteModelle.has(alt.modellId));
    if (geaendert) aus.push({ von: a.von, bis: a.bis });
  }
  return aus;
}

/** Monatsgrenzen: erster und letzter Tag. */
const monatErster = (mon) => `${mon}-01`;
const monatLetzter = (mon) => new Date(Date.UTC(Number(mon.slice(0, 4)), Number(mon.slice(5, 7)), 0)).toISOString().slice(0, 10);
const schneidet = (z, mon) => (z.von === null || z.von <= monatLetzter(mon)) && (z.bis === null || z.bis >= monatErster(mon));

/** Die freigegebenen (veröffentlichten) Monate des Betriebs. */
export function freigegebeneMonate(m) {
  const f = m && istObjekt(m.freigaben) ? m.freigaben : {};
  return Object.keys(f).filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && !!f[k]).sort();
}

/**
 * Historischer Schutz: Ändert die neue Liste Tage, die schon geschehen sind (bis einschließlich heute), in einem
 * abgeschlossenen Monat (Monatsabschluss) oder in einem freigegebenen (veröffentlichten) Monat liegen? Dann Absage —
 * vergangene oder dokumentierte Pläne ändern sich nie durch eine spätere Modelländerung.
 * @param {any} m gespeicherter Betrieb (Abschluss und Freigaben aus dem gespeicherten Stand)
 * @param {{ von: string | null, bis: string | null }[]} zeitraeume aus geaenderteZeitraeume
 * @param {string} heute JJJJ-MM-TT (Europe/Berlin)
 * @returns {null | { code: string, text: string }}
 */
export function historischeSperre(m, zeitraeume, heute) {
  for (const z of zeitraeume)
    if (z.von === null || z.von <= heute)
      return { code: "RUECKWIRKEND", text: `Die Änderung wirkt auf vergangene Tage (${z.von === null ? "seit jeher" : `ab ${z.von}`}). Schichtmodelle werden nur ab morgen geändert; vergangene Pläne bleiben, wie sie sind.` };
  for (const mon of abgeschlosseneMonate(m))
    for (const z of zeitraeume) if (schneidet(z, mon))
      return { code: "MONAT_ABGESCHLOSSEN", text: `Die Änderung wirkt auf den abgeschlossenen Monat ${monatText(mon)}. Er ändert sich erst nach dem Wiederöffnen durch die Leitung.` };
  for (const mon of freigegebeneMonate(m))
    for (const z of zeitraeume) if (schneidet(z, mon))
      return { code: "MONAT_FREIGEGEBEN", text: `Die Änderung wirkt auf den freigegebenen Plan ${monatText(mon)}. Bitte die Zuordnung erst ab dem Folgemonat ändern oder die Freigabe vorher zurücknehmen (Leitung).` };
  return null;
}

/* --------------------------------------------------------------------------
   SCHREIBWEG (PUT /api/bestand und Teilweg — eine Kette in rechte.mjs)
   -------------------------------------------------------------------------- */

const ohneStempel = (x) => { if (!istObjekt(x)) return x; const k = { ...x }; for (const f of SERVERFELDER) delete k[f]; return k; };
const stempeln = (neu, vorher, wer, jetzt) => ({ ...ohneStempel(neu), geaendertAm: jetzt, geaendertVon: wer,
  version: vorher && Number.isInteger(vorher.version) && vorher.version >= 1 ? vorher.version + 1 : 1 });
/** Die Liste mit Stempeln: Unverändertes behält den gespeicherten Datensatz, Neues/Geändertes bekommt Wann/Wer/Version vom Server. */
function gestempelt(neu, alt, wer, jetzt) {
  const altMap = new Map((Array.isArray(alt) ? alt : []).filter(istObjekt).map((x) => [x.id, x]));
  return neu.map((x) => { const v = altMap.get(x.id); return v && gleich(ohneStempel(v), ohneStempel(x)) ? v : stempeln(x, v, wer, jetzt); });
}
const listenGleich = (a, b) => gleich((Array.isArray(a) ? a : []).map(ohneStempel), (Array.isArray(b) ? b : []).map(ohneStempel));

/**
 * Schichtmodelle und Zuordnungen beim Speichern zusammenführen (nur Rollen mit Vollschreibrecht rufen das auf).
 * - Ohne Recht (darf=false): beide Felder wirkungslos — der gespeicherte Stand gilt (kein 403, wie Vorgaben).
 * - Fehlt das Feld in der Übermittlung (veraltete Kopie), gilt der gespeicherte Stand.
 * - Unverändert (ohne Serverfelder) zurückgeschickt: gespeicherter Stand, gefälschte Stempel verfallen.
 * - Neu oder geändert: geprüft (Form, Überschneidung, Lücke, Modell), dann historischer Schutz; Wann/Wer/Version vom Server.
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb (nach der Rückfüllung)
 * @param {{ darf: boolean, person: any, jetzt: string, heute: string }} ktx
 * @returns {{ grund?: string, code?: string, mandant?: any }}
 */
export function schichtzuordnungZusammen(altM, neuM, { darf, person, jetzt, heute }) {
  if (!istObjekt(neuM) || !istObjekt(altM)) return { mandant: neuM };
  const wer = person === undefined || person === null ? null : String(person);
  const altPersonen = new Map((Array.isArray(altM.personen) ? altM.personen : []).filter(istObjekt).map((p) => [String(p.id), p]));

  /* 1. Modelle des Betriebs. */
  let aus = neuM;
  const altModelle = Array.isArray(altM[MODELLE_FELD]) ? altM[MODELLE_FELD] : [];
  const feldZurueck = (obj, quelle, feld) => {
    const r = {};
    for (const [k, v] of Object.entries(obj)) if (k !== feld) r[k] = v; else if (hat(quelle, feld)) r[k] = quelle[feld];
    if (hat(quelle, feld) && !hat(obj, feld)) r[feld] = quelle[feld];
    return r;
  };
  if (darf && hat(neuM, MODELLE_FELD) && !Array.isArray(neuM[MODELLE_FELD])) return { grund: "Schichtmodelle: erwartet wird eine Liste.", code: "FORM" };
  const modelleGeaendert = darf && hat(neuM, MODELLE_FELD) && !listenGleich(neuM[MODELLE_FELD], altModelle)
    && !(!hat(altM, MODELLE_FELD) && Array.isArray(neuM[MODELLE_FELD]) && neuM[MODELLE_FELD].length === 0);
  if (!modelleGeaendert) aus = feldZurueck(aus, altM, MODELLE_FELD);
  else {
    const fehler = pruefeModelle(neuM[MODELLE_FELD], neuM.dienstarten);
    if (fehler) return { grund: `Schichtmodelle: ${fehler.text}`, code: fehler.code };
    aus = { ...aus, [MODELLE_FELD]: gestempelt(neuM[MODELLE_FELD], altModelle, wer, jetzt) };
  }
  const modelleNeu = modellVerzeichnis(aus);
  /* Welche Modelle haben andere Tage bekommen (die Zykluslage aller Personen mit diesem Modell ändert sich)? */
  const altVerz = modellVerzeichnis(altM);
  const tageGeaendert = new Set([...altVerz.keys()].filter((id) => modelleNeu.has(id) && !gleich(altVerz.get(id).tage, modelleNeu.get(id).tage)));

  /* 2. Zuordnungen je Person. */
  if (Array.isArray(aus.personen)) {
    const personen = [];
    for (const p of aus.personen) {
      if (!istObjekt(p)) { personen.push(p); continue; }
      const vorher = altPersonen.get(String(p.id));
      const altListe = vorher && Array.isArray(vorher[ZUORDNUNG_FELD]) ? vorher[ZUORDNUNG_FELD] : [];
      const name = `Person ${kennung(p.id)}`;
      if (darf && hat(p, ZUORDNUNG_FELD) && !Array.isArray(p[ZUORDNUNG_FELD]))
        return { grund: `Schichtmodell-Zuordnung (${name}): Erwartet wird eine Liste von Zuordnungen.`, code: "FORM" };
      const geaendert = darf && hat(p, ZUORDNUNG_FELD) && !listenGleich(p[ZUORDNUNG_FELD], altListe)
        && !(!(vorher && hat(vorher, ZUORDNUNG_FELD)) && Array.isArray(p[ZUORDNUNG_FELD]) && p[ZUORDNUNG_FELD].length === 0);
      if (!geaendert) {
        /* Nichts geändert, kein Recht oder veraltete Kopie ohne Feld: der gespeicherte Stand (eine neue Person ohne Recht: keines). */
        const behalten = vorher ? feldZurueck(p, vorher, ZUORDNUNG_FELD) : feldZurueck(p, {}, ZUORDNUNG_FELD);
        /* Ein entferntes Modell, das eine gespeicherte Zuordnung noch nennt: nie still auf „keines“ fallen. */
        const verwaist = (Array.isArray(behalten[ZUORDNUNG_FELD]) ? behalten[ZUORDNUNG_FELD] : [])
          .find((z) => istObjekt(z) && z.modellId !== BETRIEB_MODELL && !modelleNeu.has(z.modellId));
        if (verwaist) return { grund: `Schichtmodelle: Das Schichtmodell ${kennung(verwaist.modellId)} ist noch ${name} zugeordnet. Bitte zuerst die Zuordnung ändern.`, code: "MODELL_VERWENDET" };
        personen.push(behalten);
        continue;
      }
      const fehler = pruefeZuordnungen(p[ZUORDNUNG_FELD], modelleNeu);
      if (fehler) return { grund: `Schichtmodell-Zuordnung (${name}): ${fehler.text}`, code: fehler.code };
      personen.push({ ...p, [ZUORDNUNG_FELD]: gestempelt(p[ZUORDNUNG_FELD], altListe, wer, jetzt) });
    }
    aus = { ...aus, personen };
  }

  /* 3. Historischer Schutz für jede Person, deren anzuwendendes Modell sich ändert — auch mittelbar über geänderte
        Modelltage. Eine neue Person vergleicht mit dem impliziten Betriebsmodell (so käme sie heute in den Plan):
        eine eigene Zuordnung für sie gilt ebenfalls nur ab morgen und außerhalb freigegebener/abgeschlossener Monate. */
  for (const p of Array.isArray(aus.personen) ? aus.personen : []) {
    if (!istObjekt(p)) continue;
    const vorher = altPersonen.get(String(p.id));
    const neuL = p[ZUORDNUNG_FELD], altL = vorher ? vorher[ZUORDNUNG_FELD] : undefined;
    if (!tageGeaendert.size && (neuL === altL || listenGleich(neuL, altL))) continue;
    const sperre = historischeSperre(altM, geaenderteZeitraeume(altM, vorher || {}, aus, p, tageGeaendert), heute);
    if (sperre) {
      const name = `Person ${kennung(p.id)}`;
      return { grund: `Schichtmodell-Zuordnung (${name}): ${sperre.text}`, code: sperre.code };
    }
  }
  return { mandant: aus };
}

/* --------------------------------------------------------------------------
   PROTOKOLL (nur Kennungen, keine Namen, keine Zeiträume)
   -------------------------------------------------------------------------- */
const kennung = (x) => String(x ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);

/**
 * Zeilen für das Betriebsprotokoll des Servers: je angelegtem, geändertem oder entferntem Schichtmodell und je
 * Zuordnungsänderung eine Zeile mit Kennungen (Modell, Person, Zuordnung) — keine Namen, keine Modellnamen,
 * keine Zeiträume. Höchstens protokollZeilen Zeilen, der Rest als Anzahl.
 * @returns {string[]}
 */
export function schichtzuordnungProtokollZeilen(altB, neuB) {
  const betriebe = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter(istObjekt);
  const altNach = new Map(betriebe(altB).map((m) => [m.id, m]));
  const zeilen = [];
  const vergleiche = (alt, neu, text) => {
    const a = new Map((Array.isArray(alt) ? alt : []).filter(istObjekt).map((x) => [x.id, x]));
    const n = new Map((Array.isArray(neu) ? neu : []).filter(istObjekt).map((x) => [x.id, x]));
    for (const [id, x] of n) {
      const v = a.get(id);
      if (!v) zeilen.push(text("angelegt", id, x));
      else if (!gleich(v, x)) zeilen.push(text("geändert", id, x));
    }
    for (const [id, v] of a) if (!n.has(id)) zeilen.push(text("entfernt", id, v));
  };
  for (const m of betriebe(neuB)) {
    const alt = altNach.get(m.id);
    if (!alt) continue;                                                       // neuer Betrieb: kein Wechsel
    vergleiche(alt[MODELLE_FELD], m[MODELLE_FELD], (art, id) => `Schichtmodell ${kennung(id)} ${art}`);
    const altP = new Map((Array.isArray(alt.personen) ? alt.personen : []).filter(istObjekt).map((p) => [String(p.id), p]));
    for (const p of (Array.isArray(m.personen) ? m.personen : []).filter(istObjekt)) {
      const v = altP.get(String(p.id));
      vergleiche(v ? v[ZUORDNUNG_FELD] : [], p[ZUORDNUNG_FELD], (art, id, x) =>
        `Schichtmodell-Zuordnung ${kennung(id)} ${art}: Person ${kennung(p.id)}, Modell ${kennung(x && x.modellId)}`);
    }
  }
  const G = SCHICHTMODELL_GRENZEN.protokollZeilen;
  return zeilen.length > G ? [...zeilen.slice(0, G), `Schichtmodelle: ${zeilen.length - G} weitere Änderungen`] : zeilen;
}
