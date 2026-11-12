/* ==========================================================================
   HILFE-SUCHE (WP-I23, F9) — deterministisch, ohne Netz, ohne Modell

   BM25 über den Hilfekorpus (korpus.mjs). Kein Embedding-Dienst, kein
   Zufall, keine Uhr: dieselbe Frage über denselben Korpus gibt immer dieselbe
   Reihenfolge (Gleichstand: nach Kennung). Der Korpus wird VOR dem Suchen auf
   die Rolle gefiltert; die Kennzahlen (Dokumentlängen, Häufigkeiten) stammen
   nur aus den Texten, die die Rolle sehen darf — ein Planung-Text beeinflusst
   die Ergebnisse einer Beschäftigten nicht einmal über die Gewichtung.

   Die Frage ist Eingabe einer Person und kann Personendaten tragen. Dieses
   Modul speichert sie nicht, protokolliert sie nicht und gibt sie nirgends hin;
   `frageBereinigen` entfernt offensichtliche Kontaktdaten und Kontonummern, bevor
   die Frage irgendwo weiterverwendet wird (auch vor dem Gateway).
   ========================================================================== */

import { fremdtextBereinigen } from "../kapsel.mjs";

/** Grenzen der Frage in Zeichen (nach dem Bereinigen gemessen wird die Roheingabe). */
export const FRAGE_MIN = 3;
export const FRAGE_MAX = 300;
/** So viele Texte höchstens als Treffer, und ab welchem Wert überhaupt. */
export const TREFFER_MAX = 3;
const K1 = 1.2;
const B = 0.75;
const GEWICHT_TITEL = 3;
const GEWICHT_SCHLAGWORTE = 2;

const STOPP = new Set(`aber alle als am an auch auf aus bei bin bis bitte da dann das dass dem den der des die dies diese
  dieser doch du ein eine einem einen einer eines er es fuer hab habe haben hat ich ihr im in ist ja kann kein keine man mein
  meine mich mir mit muss nach nicht noch nur oder ob sich sie sind so um und uns unter von vor was wann war wie wir wird wo
  wollen wuerde zu zum zur ueber`.split(/\s+/));

/** Umlaute und ß falten, klein schreiben, nur Buchstaben und Ziffern. */
function falten(s) {
  return String(s).normalize("NFC").toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Grobe Stammbildung für deutsche Beugung und Zusammensetzung: eine Endung weg (wenn mindestens vier Buchstaben
    bleiben), dann höchstens die ersten fünf Buchstaben — so treffen „stemple“ und „stempeln“, „freigeben“ und
    „Freigabe“, „Antrag“ und „Anträge“ aufeinander. Ungenau, aber stabil und ohne Wörterbuch. */
function stamm(w) {
  for (const e of ["ungen", "ung", "ern", "en", "er", "es", "e", "n", "s"])
    if (w.length - e.length >= 4 && w.endsWith(e)) { w = w.slice(0, -e.length); break; }
  return w.slice(0, 5);
}

/** @returns {string[]} Wortstämme ohne Füllwörter. */
export function woerter(text) {
  const aus = [];
  for (const w of falten(text).split(" ")) {
    if (!w || w.length < 2 || STOPP.has(w)) continue;
    aus.push(stamm(w));
  }
  return aus;
}

/* --- Frage bereinigen ----------------------------------------------------- */
const MAIL = /[^\s@<>]{1,64}@[^\s@<>]{1,200}\.[A-Za-z]{2,24}/g;
const IBAN = /\b[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]{4}){3,7}(?:[ ]?[A-Za-z0-9]{1,4})?\b/g;
const TELEFON = /(?:\+|00)?\d[\d ()/.-]{5,24}\d/g;
export const ENTFERNT = "[entfernt]";

/**
 * Entfernt Steuerzeichen, E-Mail-Adressen, IBAN und Telefonnummern.
 * @param {string} roh
 * @returns {{ text: string, entfernt: boolean }}
 */
export function frageBereinigen(roh) {
  /* Steuerzeichen, Tag- und Trennerfolgen raus (derselbe Weg wie für jeden Fremdtext, kapsel.mjs). */
  let t = fremdtextBereinigen(String(roh));
  const vorher = t;
  t = t.replace(MAIL, ENTFERNT).replace(IBAN, ENTFERNT);
  /* Telefon: nur, was nach einer Nummer aussieht (mindestens neun Ziffern, oder mit +/00 und sieben) —
     ein Datum wie 01.12.2026 oder ein Zeitraum bleibt stehen. */
  t = t.replace(TELEFON, (m) => {
    const ziffern = m.replace(/\D/g, "").length;
    return ziffern >= 9 || (/^(\+|00)/.test(m) && ziffern >= 7) ? ENTFERNT : m;
  });
  return { text: t.replace(/\s+/g, " ").trim(), entfernt: t !== vorher };
}

/* --- Suche ---------------------------------------------------------------- */
/**
 * @param {string} frage        bereits bereinigt
 * @param {readonly { id: string, titel: string, text: string, schlagworte: string }[]} korpus   bereits auf die Rolle gefiltert
 * @param {number} [max]
 * @returns {{ id: string, punkte: number }[]}   absteigend nach Punkten, bei Gleichstand nach Kennung
 */
export function suchen(frage, korpus, max = TREFFER_MAX) {
  const q = [...new Set(woerter(frage))];
  if (!q.length || !korpus.length) return [];
  const dokumente = korpus.map((t) => {
    const w = [];
    for (let i = 0; i < GEWICHT_TITEL; i++) w.push(...woerter(t.titel));
    for (let i = 0; i < GEWICHT_SCHLAGWORTE; i++) w.push(...woerter(t.schlagworte));
    w.push(...woerter(t.text));
    const h = new Map();
    for (const x of w) h.set(x, (h.get(x) || 0) + 1);
    return { id: t.id, laenge: w.length, h };
  });
  const mittel = dokumente.reduce((a, d) => a + d.laenge, 0) / dokumente.length || 1;
  const n = dokumente.length;
  const ergebnis = [];
  for (const d of dokumente) {
    let punkte = 0;
    for (const wort of q) {
      const f = d.h.get(wort) || 0;
      if (!f) continue;
      const df = dokumente.filter((x) => x.h.has(wort)).length;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      punkte += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (d.laenge / mittel))));
    }
    if (punkte > 0) ergebnis.push({ id: d.id, punkte: Math.round(punkte * 1e6) / 1e6 });
  }
  ergebnis.sort((a, b) => b.punkte - a.punkte || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ergebnis.slice(0, max);
}
