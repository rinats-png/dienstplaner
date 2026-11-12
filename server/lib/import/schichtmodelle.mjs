/* ==========================================================================
   IMP-6 — Schichtmodelle und Schichtzyklen: Lesen und Ausrollen (rein)

   Kein I/O, keine Uhrzeit, keine Zufallszahl, keine KI. Eingabe ist der
   Rohinhalt aus dem Parser (IMP-2, docs/acc45/IMPORT-VERTRAG.md §6), Ausgabe
   sind Modelle, Zuordnungen und ausgerollte Schichten. Geschrieben wird hier
   nichts. Die arbeitszeitrechtliche Prüfung steht in schichtpruefung.mjs und
   nutzt die bestehende Planprüfung (engine/befunde.mjs pruefen).

   Tabellen (Freigabe Punkt 5: mehrere Modelle je Betrieb, keine feste
   Zykluslänge; Format docs/acc45/IMP-6-NACHWEIS.md):

   1. Modelle, eine Zeile je Zyklustag („lange" Form, damit jede Länge ohne
      Spaltengrenze geht):  Modell | Tag | Dienst
      - Tag: 1 … n, lückenlos, je Modell genau einmal. Die Zykluslänge n ist
        die höchste Tagesnummer. Es gibt keine feste Länge und keine Vorgabe
        in Wochen.
      - Dienst: Kürzel einer Dienstart DES BETRIEBS (m.dienstarten[].kurz)
        oder „-" für frei. Eine leere Zelle ist eine Lücke (Fehler), nie
        „frei": fehlende Angaben werden nicht ergänzt.
   2. Zuordnungen:  Personalnummer | Modell | Beginn | Versatz
      - Am Tag „Beginn" arbeitet die Person den Zyklustag (Versatz + 1).
        Versatz ist eine ganze Zahl 0 … n−1; ein größerer Wert wird nicht
        still umgerechnet (Modulo), sondern als Fehler gemeldet.
      - Mehrere Zuordnungen einer Person mit verschiedenem Beginn sind ein
        Modellwechsel; jede gilt bis zum Tag vor dem nächsten Beginn.

   Konfliktmodell wie im Personalimport (personen.mjs): je Datensatz `fehler`
   (Feldnamen, nie Werte), `hinweise`, `konflikte: [{ art, … }]`, `erlaubt`
   und `vorgabe`. Ein unbekanntes Kürzel ist ein Zuordnungskonflikt
   („dienstart-unbekannt"), keine stille Freischicht. Ein Modell mit
   Konflikt wird nicht ausgerollt und nicht teilweise übernommen.
   ========================================================================== */

import { zellText, datumAusZelle } from "./personen.mjs";
import { addDays, between, fenster, uhrversatz, dauerAm, pad } from "../regelwerk.mjs";

export const FREI = "-";
export const MODELL_FELDER = Object.freeze(["modell", "tag", "dienst"]);
export const MODELL_PFLICHT = MODELL_FELDER;
export const ZUORDNUNG_FELDER = Object.freeze(["personalnummer", "modell", "beginn", "versatz"]);
/** Versatz ist Pflicht: ein fehlender Versatz würde sonst still 0 (Gruppen lägen übereinander). */
export const ZUORDNUNG_PFLICHT = ZUORDNUNG_FELDER;
export const AKTIONEN = Object.freeze(["uebernehmen", "ueberspringen", "klaeren"]);

/* Überschriften je Feld, normalisiert (Kleinbuchstaben, Umlaute aufgelöst, nur a-z0-9). */
const MUSTER_MODELL = {
  modell: ["modell", "schichtmodell", "schichtzyklus", "zyklus", "rhythmus", "muster"],
  tag: ["tag", "zyklustag", "tagnr", "tagnummer", "position"],
  dienst: ["dienst", "dienstart", "schicht", "kuerzel", "kurz", "code"],
};
const MUSTER_ZUORDNUNG = {
  personalnummer: ["personalnummer", "persnr", "pnr", "personalnr", "mitarbeiternummer", "mitarbeiternr", "maid"],
  modell: MUSTER_MODELL.modell,
  beginn: ["beginn", "ab", "gueltigab", "startdatum", "start", "von"],
  versatz: ["versatz", "verschiebung", "offset", "startversatz"],
};

const norm = (s) => String(s ?? "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]/g, "");
const vergleich = (s) => String(s ?? "").trim().toLowerCase();
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** Obergrenze der Zeilennummern je „zuordnung-doppelt“-Konflikt. */
const DOPPELT_MAX = 20;
const ZEIT = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Vorschlag zur Spaltenzuordnung: erst genaue Treffer, dann Wortanfang (ab 3 Zeichen). */
function spaltenVorschlag(kopf, felder, muster) {
  const zuordnung = Object.create(null);
  const belegt = new Set();
  const n = (Array.isArray(kopf) ? kopf : []).map((h) => norm(zellText(h)));
  for (const stufe of ["genau", "anfang"]) {
    n.forEach((h, i) => {
      if (belegt.has(i) || !h) return;
      for (const feld of felder) {
        if (hat(zuordnung, feld)) continue;
        const treffer = muster[feld].some((x) => (stufe === "genau" ? h === x : h.length >= 3 && (h.startsWith(x) || x.startsWith(h))));
        if (treffer) { zuordnung[feld] = i; belegt.add(i); break; }
      }
    });
  }
  return zuordnung;
}

/** Vom Aufrufer mitgeschickte Zuordnung prüfen: nur bekannte Felder, Spalten im Bereich, keine Spalte doppelt. */
function zuordnungPruefen(roh, felder, spalten) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const zu = Object.create(null);
  const belegt = new Set();
  for (const k of Object.keys(roh)) {
    if (!felder.includes(k)) return null;
    const v = roh[k];
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v >= spalten || belegt.has(v)) return null;
    belegt.add(v);
    zu[k] = v;
  }
  return zu;
}

function tabelle(zeilen, zuordnung, felder, muster, pflicht) {
  const kopf = Array.isArray(zeilen) && zeilen.length && Array.isArray(zeilen[0]) ? zeilen[0] : [];
  const daten = Array.isArray(zeilen) ? zeilen.slice(1).filter(Array.isArray) : [];
  let zu = spaltenVorschlag(kopf, felder, muster);
  if (zuordnung !== undefined && zuordnung !== null) {
    zu = zuordnungPruefen(zuordnung, felder, kopf.length);
    if (!zu) return { ok: false, code: "ZUORDNUNG_UNGUELTIG", nachricht: "Die Spaltenzuordnung ist ungültig." };
  }
  const spalten = kopf.map((h, i) => ({ index: i, kopf: zellText(h), feld: felder.find((f) => zu[f] === i) || null }));
  const fehlendePflicht = pflicht.filter((f) => !hat(zu, f));
  const hol = (f, z) => (hat(zu, f) ? z[zu[f]] : null);
  return { ok: true, daten, spalten, zuordnung: { ...zu }, fehlendePflicht, hol };
}

/** Ganze Zahl aus einer Zelle (Zahl oder Ziffern als Text): `{ wert }`, `{ leer }` oder `{ ungueltig }`. */
function ganzzahl(z, min) {
  if (typeof z === "number") return Number.isInteger(z) && z >= min ? { wert: z } : { ungueltig: true };
  const t = zellText(z);
  if (!t) return { leer: true };
  if (!/^\d{1,6}$/.test(t)) return { ungueltig: true };
  const n = Number(t);
  return n >= min ? { wert: n } : { ungueltig: true };
}

/** Prüft die Zeiten einer Dienstart des Betriebs. Ende ≤ Beginn heißt: endet am Folgetag (wie fenster()). */
export const dienstartZeitenGueltig = (da) => !!da && typeof da.start === "string" && typeof da.ende === "string"
  && ZEIT.test(da.start) && ZEIT.test(da.ende);

/** Kürzel → Dienstart des Betriebs: genau gleich, sonst ohne Groß-/Kleinschreibung; mehrdeutig ist ein Konflikt. */
function kuerzelIndex(dienstarten) {
  const liste = (Array.isArray(dienstarten) ? dienstarten : []).filter((d) => d && typeof d === "object" && d.id !== undefined && d.id !== null);
  return (kurz) => {
    const genau = liste.filter((d) => String(d.kurz ?? "").trim() === kurz);
    if (genau.length === 1) return { da: genau[0] };
    if (genau.length > 1) return { mehrdeutig: true };
    const klein = liste.filter((d) => vergleich(d.kurz) === vergleich(kurz));
    if (klein.length === 1) return { da: klein[0] };
    return klein.length > 1 ? { mehrdeutig: true } : { unbekannt: true };
  };
}

/**
 * Modelltabelle lesen. Mehrere Modelle in einer Tabelle, jede Länge.
 * @param {{ zeilen: any[][], zuordnung?: any, dienstarten: any[] }} e
 */
export function modelleLesen({ zeilen, zuordnung, dienstarten }) {
  const t = tabelle(zeilen, zuordnung, MODELL_FELDER, MUSTER_MODELL, MODELL_PFLICHT);
  if (!t.ok) return t;
  const { daten, spalten, fehlendePflicht, hol } = t;
  if (fehlendePflicht.length) return { ok: true, spalten, zuordnung: t.zuordnung, fehlendePflicht, datensaetze: [], modelle: [] };
  const finde = kuerzelIndex(dienstarten);
  const datensaetze = daten.map((z, i) => {
    const fehler = [], konflikte = [];
    const modell = zellText(hol("modell", z));
    const tagZ = ganzzahl(hol("tag", z), 1);
    const dienst = zellText(hol("dienst", z));
    if (!modell) fehler.push("Modell fehlt");
    else if (modell.length > 100) fehler.push("Modell zu lang");
    if (tagZ.leer) fehler.push("Tag fehlt");
    else if (tagZ.ungueltig) fehler.push("Tag ungültig");
    let dienstId = null;
    let da = null;
    if (!dienst) fehler.push("Dienst fehlt");          // Lücke: nie still „frei"
    else if (dienst.length > 20) fehler.push("Dienst zu lang");
    else if (dienst !== FREI) {
      const f = finde(dienst);
      if (f.da) {
        da = f.da; dienstId = String(f.da.id);
        if (!dienstartZeitenGueltig(f.da)) konflikte.push({ art: "dienstart-zeit-ungueltig" });
      } else konflikte.push({ art: f.mehrdeutig ? "dienstart-mehrdeutig" : "dienstart-unbekannt" });
    }
    return { datensatz: i + 1, werte: { modell, tag: tagZ.wert ?? null, dienst }, dienstId,
      kurz: da ? String(da.kurz ?? "") : dienst === FREI ? FREI : null, fehler, hinweise: [], konflikte };
  });

  /* Modelle in der Reihenfolge ihres ersten Auftretens (deterministisch). Gruppiert wird über den genauen Namen. */
  const reihenfolge = [];
  const nachName = new Map();
  for (const d of datensaetze) {
    if (!d.werte.modell || d.werte.modell.length > 100) continue;
    if (!nachName.has(d.werte.modell)) { nachName.set(d.werte.modell, []); reihenfolge.push(d.werte.modell); }
    nachName.get(d.werte.modell).push(d);
  }
  const modelle = reihenfolge.map((name) => {
    const zeilenM = nachName.get(name);
    const konflikte = [];
    const nachTag = new Map();
    for (const d of zeilenM) if (d.werte.tag !== null) { const l = nachTag.get(d.werte.tag); if (l) l.push(d); else nachTag.set(d.werte.tag, [d]); }
    const laenge = nachTag.size ? Math.max(...nachTag.keys()) : 0;
    const fehlend = [];
    for (let k = 1; k <= laenge; k++) if (!nachTag.has(k)) fehlend.push(k);
    if (!laenge) konflikte.push({ art: "modell-leer" });
    if (fehlend.length) konflikte.push({ art: "tag-fehlt", tage: fehlend.slice(0, 20), anzahl: fehlend.length });
    for (const [tag, l] of [...nachTag.entries()].sort((a, b) => a[0] - b[0]))
      if (l.length > 1) {
        konflikte.push({ art: "tag-doppelt", tag, datensaetze: l.map((d) => d.datensatz) });
        for (const d of l) d.konflikte.push({ art: "tag-doppelt" });
      }
    const fehlerhaft = zeilenM.filter((d) => d.fehler.length).map((d) => d.datensatz);
    if (fehlerhaft.length) konflikte.push({ art: "datensatz-fehlerhaft", datensaetze: fehlerhaft });
    for (const art of ["dienstart-unbekannt", "dienstart-mehrdeutig", "dienstart-zeit-ungueltig"]) {
      const l = zeilenM.filter((d) => d.konflikte.some((k) => k.art === art));
      if (l.length) konflikte.push({ art, datensaetze: l.map((d) => d.datensatz), tage: l.map((d) => d.werte.tag) });
    }
    const pruefbar = konflikte.length === 0;
    const tage = [];
    const kuerzel = [];
    for (let k = 1; k <= laenge; k++) {
      const d = (nachTag.get(k) || [])[0];
      tage.push(pruefbar ? d.dienstId : null);
      kuerzel.push(d ? d.kurz : null);
    }
    const hinweise = [];
    if (pruefbar && tage.every((x) => x === null)) hinweise.push({ art: "keine-dienste" });
    return { name, laenge, tage, kuerzel, dienste: tage.filter((x) => x !== null).length,
      datensaetze: zeilenM.map((d) => d.datensatz), konflikte, hinweise, pruefbar };
  });
  const zaehler = { gesamt: datensaetze.length, fehlerhaft: datensaetze.filter((d) => d.fehler.length).length,
    konflikte: datensaetze.filter((d) => d.konflikte.length).length, modelle: modelle.length,
    pruefbar: modelle.filter((m) => m.pruefbar).length };
  return { ok: true, spalten, zuordnung: t.zuordnung, fehlendePflicht, datensaetze, modelle, zaehler };
}

/**
 * Zuordnungstabelle lesen: Person (über die Personalnummer im eigenen Betrieb) → Modell, Beginn, Versatz.
 * Über den Namen wird nie zugeordnet.
 * @param {{ zeilen: any[][], zuordnung?: any, personen: any[], modelle: any[] }} e
 */
export function zuordnungenLesen({ zeilen, zuordnung, personen, modelle }) {
  const t = tabelle(zeilen, zuordnung, ZUORDNUNG_FELDER, MUSTER_ZUORDNUNG, ZUORDNUNG_PFLICHT);
  if (!t.ok) return t;
  const { daten, spalten, fehlendePflicht, hol } = t;
  if (fehlendePflicht.length) return { ok: true, spalten, zuordnung: t.zuordnung, fehlendePflicht, datensaetze: [] };
  const nachNummer = new Map();
  for (const p of (Array.isArray(personen) ? personen : []).filter((x) => x && typeof x === "object")) {
    const nr = vergleich(p.personalnummer);
    if (nr) { const l = nachNummer.get(nr); if (l) l.push(p); else nachNummer.set(nr, [p]); }
  }
  const nachModell = new Map((Array.isArray(modelle) ? modelle : []).map((m) => [m.name, m]));
  const datensaetze = daten.map((z, i) => {
    const fehler = [], konflikte = [], hinweise = [];
    const werte = { personalnummer: zellText(hol("personalnummer", z)), modell: zellText(hol("modell", z)) };
    if (!werte.personalnummer) fehler.push("Personalnummer fehlt");
    if (!werte.modell) fehler.push("Modell fehlt");
    const b = datumAusZelle(hol("beginn", z));
    if (b.leer) fehler.push("Beginn fehlt");
    else if (b.ungueltig) fehler.push("Beginn ungültig");
    werte.beginn = b.wert ?? null;
    const v = ganzzahl(hol("versatz", z), 0);
    if (v.leer) fehler.push("Versatz fehlt");
    else if (v.ungueltig) fehler.push("Versatz ungültig");
    werte.versatz = v.wert ?? null;
    let personId = null;
    if (werte.personalnummer) {
      const l = nachNummer.get(vergleich(werte.personalnummer)) || [];
      if (l.length === 1) personId = String(l[0].id);
      else konflikte.push({ art: l.length ? "person-mehrdeutig" : "person-unbekannt" });
    }
    const m = werte.modell ? nachModell.get(werte.modell) : null;
    if (werte.modell && !m) konflikte.push({ art: "modell-unbekannt" });
    else if (m && !m.pruefbar) konflikte.push({ art: "modell-mit-konflikt" });
    /* Kein Modulo: ein Versatz außerhalb des Zyklus ist ein Fehler, keine stille Umrechnung. */
    if (m && m.laenge && werte.versatz !== null && werte.versatz >= m.laenge) fehler.push("Versatz ungültig");
    return { datensatz: i + 1, werte, personId, fehler, hinweise, konflikte, erlaubt: [], vorgabe: null };
  });
  /* Dieselbe Person mit demselben Beginn mehrfach: alle Zeilen markieren, keine wählen. */
  const gleich = new Map();
  for (const d of datensaetze) if (d.personId && d.werte.beginn) {
    const k = `${d.personId}|${d.werte.beginn}`;
    const l = gleich.get(k);
    if (l) l.push(d); else gleich.set(k, [d]);
  }
  /* Linear in der Zeilenzahl: je Zeile höchstens DOPPELT_MAX andere Zeilennummern, dazu die Gesamtzahl (nie eine Liste aller anderen). */
  for (const l of gleich.values()) if (l.length > 1) {
    const erste = l.slice(0, DOPPELT_MAX + 1).map((x) => x.datensatz);
    for (const d of l) d.konflikte.push({ art: "zuordnung-doppelt", anzahl: l.length - 1,
      datensaetze: erste.filter((x) => x !== d.datensatz).slice(0, DOPPELT_MAX) });
  }
  for (const d of datensaetze) {
    if (d.fehler.length) { d.erlaubt = ["ueberspringen"]; d.vorgabe = "ueberspringen"; }
    else if (d.konflikte.length) { d.erlaubt = ["ueberspringen", "klaeren"]; d.vorgabe = "klaeren"; }
    else { d.erlaubt = ["uebernehmen", "ueberspringen", "klaeren"]; d.vorgabe = "uebernehmen"; }
  }
  const zaehler = { gesamt: datensaetze.length, fehlerhaft: datensaetze.filter((d) => d.fehler.length).length,
    konflikte: datensaetze.filter((d) => d.konflikte.length).length };
  return { ok: true, spalten, zuordnung: t.zuordnung, fehlendePflicht, datensaetze, zaehler };
}

/** Minuten seit 2000-01-01 00:00 Ortszeit → „JJJJ-MM-TTTHH:MM" (Ortszeit, wie fenster()). */
const ortszeit = (min) => `${addDays("2000-01-01", Math.floor(min / 1440))}T${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`;

/**
 * Lage einer Schicht an einem Tag: Beginn, Ende (Folgetag bei Nachtschicht über Mitternacht) und die wirkliche
 * Dauer mit Zeitumstellung — dieselbe Rechnung wie die Planprüfung (fenster, uhrversatz, dauerAm).
 */
export function schichtLage(datum, da) {
  const [s, e] = fenster(datum, da);
  return { beginn: ortszeit(s), ende: ortszeit(e), ueberMitternacht: Math.floor(e / 1440) !== Math.floor(s / 1440) && e % 1440 !== 0,
    minuten: e - s + uhrversatz(s, e), stunden: dauerAm(datum, da) };
}

/** Index des Zyklustags (0 … n−1) einer Zuordnung an einem Tag. */
export const zyklusIndex = (laenge, beginn, versatz, datum) => (((between(beginn, datum) + versatz) % laenge) + laenge) % laenge;

/**
 * Ein Modell für eine Zuordnung ausrollen: je Tag in [max(von, beginn), bis] (bis ausschließlich `ende`, falls
 * gesetzt) ein Eintrag — Dienst mit Lage oder frei. Nur für prüfbare Modelle.
 * @param {{ modell: any, beginn: string, versatz: number, von: string, bis: string, ende?: string|null, dienstarten: any[] }} e
 */
export function ausrollen({ modell, beginn, versatz, von, bis, ende = null, dienstarten }) {
  if (!modell || !modell.pruefbar || !modell.laenge) return [];
  if (!ISO.test(von) || !ISO.test(bis) || !ISO.test(beginn)) return [];
  const nachId = new Map((Array.isArray(dienstarten) ? dienstarten : []).filter(Boolean).map((d) => [String(d.id), d]));
  const aus = [];
  const start = von > beginn ? von : beginn;
  for (let d = start; d <= bis && (!ende || d < ende); d = addDays(d, 1)) {
    const i = zyklusIndex(modell.laenge, beginn, versatz, d);
    const id = modell.tage[i];
    if (id === null) { aus.push({ datum: d, zyklusTag: i + 1, dienstId: null, kurz: FREI }); continue; }
    const da = nachId.get(id);
    aus.push({ datum: d, zyklusTag: i + 1, dienstId: id, kurz: String(da.kurz ?? ""), ...schichtLage(d, da) });
  }
  return aus;
}
