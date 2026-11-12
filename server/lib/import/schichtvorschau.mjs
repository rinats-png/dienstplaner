/* ==========================================================================
   IMP-6 — Schichtmodelle im Import: Analyse und Vorschau (rein, OHNE Schreiben)

   Verdrahtet die Bibliothek schichtmodelle.mjs in /api/import (art=schichtzyklus) als reines Leseergebnis. Hier wird
   nichts gespeichert, nichts in den Bestand geschrieben, nichts protokolliert. Die Übernahme der Modelle fehlt
   bewusst (Datenmodellentscheidung „mehrere Modelle je Person“ beim Betreiber).

   Datenschutz der Ausgabe (gleiche Regel wie die Altplan-Vorschau, intelligence/funktionen/altplan.mjs):
   - Freitext aus der Datei wird nicht zurückgegeben. Unbekannte Dienstbezeichnungen erscheinen nur als laufender Index
     mit Anzahl und Datenzeilennummern. Abwesenheitsbezeichnungen (krank, Attest, Reha, auch „krank (Grippe)“) erscheinen
     nur als Zahl und Zeilennummern und werden nie einer Dienstart oder Abwesenheit zugeordnet.
   - Modellnamen nur, wenn sie wie ein harmloser Kurzname aussehen (Buchstabe oder Ziffer am Anfang, nur Buchstaben,
     Ziffern, Leerzeichen und . _ / + -, höchstens 40 Zeichen) und keine Abwesenheitsbezeichnung sind; sonst „Modell n“
     ohne Namen (name: null).
   - Personalnummern und Namen der Zuordnungstabelle erscheinen nicht; nur Anzahlen und Zeilennummern.
   - Kürzel erscheinen nur, wenn sie zu einer Dienstart DES BETRIEBS gehören.

   Grenzen: Summe der Zykluslängen aller Modelle höchstens zyklusTageMax (vor dem Lesen geprüft — die Bibliothek legt je
   Modell ein Feld der Länge der höchsten Tagesnummer an; ohne diese Prüfung ließen wenige Zeilen mit Tag 999999 sehr
   viel rechnen). Anzeige höchstens 50 Modelle, je Eintrag höchstens 20 Zeilennummern.
   ========================================================================== */

import { modelleLesen, zuordnungenLesen, MODELL_FELDER, FREI } from "./schichtmodelle.mjs";
import { zellText } from "./personen.mjs";
import { abwesenheitsBezeichnung, bezeichnungNormalisiert } from "../intelligence/funktionen/altplan.mjs";

export const VORSCHAU_GRENZEN = Object.freeze({ zyklusTageMax: 10000, modelleAnzeige: 50, zeilenJeEintrag: 20, unbekanntAnzeige: 50, dienstartenAnzeige: 30 });
export const HINWEIS_NUR_VORSCHAU = "Schichtmodelle werden noch nicht übernommen. Dies ist nur eine Vorschau, es wird nichts gespeichert.";

const G = VORSCHAU_GRENZEN;
const SICHERER_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._/+-]{0,39}$/u;
const kappen = (l, n = G.zeilenJeEintrag) => l.slice(0, n);
const kopfVon = (zeilen) => (Array.isArray(zeilen) && Array.isArray(zeilen[0]) ? zeilen[0] : []);

/** Nur Kopfzeilen prüfen: welche Blätter sehen wie Modell- bzw. Zuordnungstabelle aus. */
export function blaetterErkennen(blaetter) {
  let modell = null, zuordnung = null;
  (Array.isArray(blaetter) ? blaetter : []).forEach((b, i) => {
    const kopf = kopfVon(b && b.zeilen);
    if (!kopf.length) return;
    if (modell === null && (modelleLesen({ zeilen: [kopf], dienstarten: [] }).fehlendePflicht || [1]).length === 0) { modell = i; return; }
    if (zuordnung === null && (zuordnungenLesen({ zeilen: [kopf], personen: [], modelle: [] }).fehlendePflicht || [1]).length === 0) zuordnung = i;
  });
  return { modell, zuordnung };
}

const spaltenAus = (sp) => sp.map((s) => ({ index: s.index, feld: s.feld, kopf: s.feld ? String(s.kopf).slice(0, 60) : "" }));

/** Vorprüfung, bevor die Bibliothek rechnet: Summe der Zykluslängen (höchste Tagesnummer je Modell). */
function laengenSumme(zeilen, zuordnung) {
  const vor = modelleLesen({ zeilen: [kopfVon(zeilen)], zuordnung, dienstarten: [] });
  if (!vor.ok || (vor.fehlendePflicht || []).length) return { vor, summe: 0 };
  const iM = vor.zuordnung.modell, iT = vor.zuordnung.tag;
  const hoechste = new Map();
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (!Array.isArray(z)) continue;
    const name = zellText(z[iM]);
    if (!name || name.length > 100) continue;
    const t = z[iT];
    const tt = typeof t === "number" ? t : /^\d{1,6}$/.test(zellText(t)) ? Number(zellText(t)) : 0;
    if (Number.isInteger(tt) && tt > (hoechste.get(name) || 0)) hoechste.set(name, tt);
  }
  let summe = 0;
  for (const h of hoechste.values()) summe += h;
  return { vor, summe };
}

function dienstartenZaehlung(m) {
  const z = new Map();
  m.kuerzel.forEach((k) => { if (k !== null && k !== FREI) z.set(k, (z.get(k) || 0) + 1); });
  return [...z.entries()].map(([kurz, tage]) => ({ kurz, tage })).slice(0, G.dienstartenAnzeige);
}

function konfliktAus(k) {
  const l = Array.isArray(k.datensaetze) ? k.datensaetze : null;
  return { art: k.art, anzahl: Number.isInteger(k.anzahl) ? k.anzahl : l ? l.length : 1,
    ...(l ? { datensaetze: kappen(l) } : {}),
    ...(Array.isArray(k.tage) ? { tage: kappen(k.tage.filter((x) => Number.isInteger(x))) } : {}) };
}

/**
 * @param {{ mandant: any, modellZeilen: any[][]|null, zuordnungZeilen?: any[][]|null, zuordnung?: any }} e
 * @returns {{ ok: true } & Record<string, any> | { ok: false, code: string, nachricht: string }}
 */
export function schichtVorschau({ mandant, modellZeilen, zuordnungZeilen = null, zuordnung }) {
  const leer = { zyklen: [], zyklenGesamt: 0, zuordnungen: null, unbekannteBezeichnungen: [], abwesenheitsartig: { anzahl: 0, zeilen: [] },
    zaehler: { modelle: 0, pruefbar: 0, datensaetze: 0, fehlerhaft: 0, zuordnungen: 0 }, fehlendePflicht: [], spalten: [], zuordnungSpalten: [] };
  if (!Array.isArray(modellZeilen) || !modellZeilen.length) return { ok: true, ...leer, fehlendePflicht: [...MODELL_FELDER] };
  const dienstarten = (mandant && mandant.dienstarten) || [];

  const { vor, summe } = laengenSumme(modellZeilen, zuordnung);
  if (!vor.ok) return { ok: false, code: vor.code, nachricht: vor.nachricht };
  if (vor.fehlendePflicht.length) return { ok: true, ...leer, fehlendePflicht: vor.fehlendePflicht, spalten: spaltenAus(vor.spalten) };
  if (summe > G.zyklusTageMax)
    return { ok: false, code: "PRUEFUMFANG_ZU_GROSS", nachricht: "Die Zykluslängen sind zusammen zu groß für eine Vorschau. Bitte die Datei teilen." };

  const ml = modelleLesen({ zeilen: modellZeilen, zuordnung, dienstarten });
  if (!ml.ok) return { ok: false, code: ml.code, nachricht: ml.nachricht };

  /* Unbekannte und Abwesenheitsbezeichnungen: nur Index, Zahl und Zeilen, nie der Text. */
  const index = new Map();
  const unbekannt = [];
  const abw = { anzahl: 0, zeilen: [] };
  for (const d of ml.datensaetze) {
    if (!d.konflikte.some((k) => k.art === "dienstart-unbekannt")) continue;
    const n = bezeichnungNormalisiert(d.werte.dienst);
    if (abwesenheitsBezeichnung(n)) { abw.anzahl += 1; abw.zeilen.push(d.datensatz); continue; }
    if (!index.has(n)) { index.set(n, unbekannt.length); unbekannt.push({ index: unbekannt.length + 1, anzahl: 0, zeilen: [] }); }
    const u = unbekannt[index.get(n)];
    u.anzahl += 1; u.zeilen.push(d.datensatz);
  }
  abw.zeilen = kappen(abw.zeilen);
  for (const u of unbekannt) u.zeilen = kappen(u.zeilen);

  const zyklen = ml.modelle.slice(0, G.modelleAnzeige).map((m, i) => {
    const sicher = SICHERER_NAME.test(m.name) && !abwesenheitsBezeichnung(bezeichnungNormalisiert(m.name));
    return { nr: i + 1, name: sicher ? m.name : null, laenge: m.laenge, dienste: m.dienste, freieTage: m.pruefbar ? m.laenge - m.dienste : null,
      pruefbar: m.pruefbar, datensaetze: kappen(m.datensaetze), dienstarten: dienstartenZaehlung(m),
      konflikte: m.konflikte.map(konfliktAus), hinweise: m.hinweise.map((h) => ({ art: h.art })) };
  });

  let zuordnungen = null, zuordnungSpalten = [];
  if (Array.isArray(zuordnungZeilen) && zuordnungZeilen.length) {
    const zl = zuordnungenLesen({ zeilen: zuordnungZeilen, personen: (mandant && mandant.personen) || [], modelle: ml.modelle });
    if (!zl.ok) return { ok: false, code: zl.code, nachricht: zl.nachricht };
    zuordnungSpalten = spaltenAus(zl.spalten);
    if (zl.fehlendePflicht.length) zuordnungen = { gesamt: 0, fehlendePflicht: zl.fehlendePflicht };
    else {
      const nachArt = new Map();
      for (const d of zl.datensaetze) for (const k of d.konflikte) nachArt.set(k.art, [...(nachArt.get(k.art) || []), d.datensatz]);
      const personen = new Set(zl.datensaetze.filter((d) => d.personId).map((d) => d.personId));
      zuordnungen = { gesamt: zl.zaehler.gesamt, uebernehmbar: zl.datensaetze.filter((d) => d.vorgabe === "uebernehmen").length,
        fehlerhaft: zl.zaehler.fehlerhaft, mitKonflikt: zl.zaehler.konflikte, personen: personen.size,
        fehlerhafteZeilen: kappen(zl.datensaetze.filter((d) => d.fehler.length).map((d) => d.datensatz)),
        konflikte: [...nachArt.entries()].map(([art, l]) => ({ art, anzahl: l.length, datensaetze: kappen(l) })) };
    }
  }
  return { ok: true, zyklen, zyklenGesamt: ml.modelle.length, zuordnungen, unbekannteBezeichnungen: unbekannt.slice(0, G.unbekanntAnzeige),
    abwesenheitsartig: abw, zaehler: { ...ml.zaehler, datensaetze: ml.zaehler.gesamt, zuordnungen: zuordnungen ? zuordnungen.gesamt : 0 },
    fehlendePflicht: [], spalten: spaltenAus(ml.spalten), zuordnungSpalten };
}
