/* ==========================================================================
   SICHERUNGSSCHLÜSSEL: WIDERRUF, VERMERK, GRENZEN (SI-P1, Betreiberentscheidung 2026-11-07)

   Drei Dinge, die zusammengehören:

   1. ENDGÜLTIGER WIDERRUF. Ein Sicherungsschlüssel (`sk:<hash>`) gilt nur, solange sein Ersteller die Leitung
      seines Betriebs ist (arbeitssitzung.mjs, sicherungsschluesselPruefen). Wird er aus einem Grund widerrufen, der
      an einem Zustand der Welt hängt (Passwort geändert, Sicherheitsreset, Konto oder Zugang gesperrt, Ersteller
      ausgetreten oder herabgestuft), schreibt dieses Modul zuerst einen WIDERRUFSVERMERK (`skw:<hash>`) und löscht
      dann den Schlüssel. Der Vermerk bleibt bis zum ursprünglichen Ablauf des Schlüssels liegen. Er ist der Grund, warum
      ein widerrufener Schlüssel nie wieder aufleben kann, auch wenn der Zugang entsperrt, die Personalliste oder ein
      früherer Kontostand zurückgespielt oder ein gelöschter Datensatz wieder angelegt wird: Wer einen Schlüssel
      vorlegt, für den ein Vermerk besteht, wird abgewiesen, gleichgültig, was der Schlüsseldatensatz sagt.

   2. ERKENNBARER FEHLER. Eine Sicherungsautomatisierung, deren Schlüssel widerrufen wurde, bekommt eine eindeutige
      Antwort (401 mit Grund), nicht das stumme „nicht angemeldet" eines unbekannten Tokens. Der Vermerk enthält nur
      Grund, Zeit und Ablauf, nie den Schlüssel selbst. Er ist nur mit dem richtigen Schlüssel auffindbar (Hashwert),
      verrät also einem Außenstehenden nichts. Die Liste der Leitung zeigt widerrufene Schlüssel mit Grund.

   3. GRENZEN. Standardlaufzeit 90 Tage, Höchstlaufzeit 365 Tage, höchstens fünf gleichzeitig aktive Schlüssel je Betrieb.

   Diese Datei kennt keine Rolle und keinen Endpunkt. Sie ist ohne Abhängigkeit von accounts.mjs, damit accounts.mjs sie
   einbinden kann (kein Importkreis, wie bei feedwiderruf.mjs).
   ========================================================================== */

import { createHash } from "node:crypto";
import { sitzungsSpeicher } from "./sitzungen.mjs";

export const SK_STANDARD_TAGE = 90;
export const SK_HOECHST_TAGE = 365;
export const SK_HOECHSTZAHL = 5;
/** Ein Vermerk überlebt den Schlüssel um nichts; sicherheitshalber ein Tag Zuschlag gegen Uhrabweichungen. */
const VERMERK_ZUSCHLAG = 24 * 3600 * 1000;

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Der Raumindex: Welche Schlüssel gehören zu einem Raum? Damit sucht der Abgleich nach einer Änderung nicht in allen
    Räumen (`sk:` ist global). Der Wert trägt den Raum, damit die Raumlöschung ihn mitnimmt. */
export const raumIndex = (raum, hashHex) => `skraum:${raum}:${hashHex}`;

/** Die verständliche Warnung, die vor einer Passwortänderung oder einem Sicherheitsreset erscheinen muss. */
export const SK_WARNUNG_PASSWORT =
  "Wenn du dein Passwort änderst oder die Sicherheit deines Kontos zurücksetzt, enden alle Sicherungsschlüssel, "
  + "die du angelegt hast, dauerhaft. Automatische Sicherungen, die so einen Schlüssel benutzen, fallen dann aus, "
  + "bis du einen neuen Schlüssel einrichtest. Alte Schlüssel werden nie wieder gültig.";

/** Verständliche Texte zu den Gründen, wie sie in Liste und Antwort erscheinen. */
const GRUND_TEXT = {
  "passwort-geaendert": "Das Passwort des Erstellers wurde geändert.",
  "sicherheitsreset": "Die Sicherheit des Kontos des Erstellers wurde zurückgesetzt.",
  "konto-gesperrt": "Das Konto des Erstellers wurde gesperrt.",
  "zugang-gesperrt": "Der Zugang des Erstellers wurde gesperrt.",
  "von-der-leitung-widerrufen": "Die Leitung hat den Schlüssel widerrufen.",
  "ersteller-berechtigung": "Der Ersteller ist nicht mehr Leitung dieses Betriebs.",
};
export const widerrufText = (grund) =>
  GRUND_TEXT[String(grund)] || "Der Ersteller darf den Schlüssel nicht mehr haben.";

/** Gründe, die die Prüfung (sicherungsschluesselPruefen) liefert, auf einen der festen Texte abgebildet. */
export function grundAusPruefung(g) {
  const s = String(g || "");
  if (s === "sk-epoche") return "passwort-geaendert";
  if (s === "sk-account-status") return "konto-gesperrt";
  if (s === "sk-zugang-gesperrt") return "zugang-gesperrt";
  return "ersteller-berechtigung";
}

/**
 * Einen Schlüsseldatensatz widerrufen: erst der Vermerk, dann das Löschen. Scheitert das Löschen, schützt der Vermerk
 * trotzdem. Scheitert der Vermerk, wird nicht gelöscht (sonst wäre der Widerruf ohne Spur und ohne Schutz).
 * @param {string} schluessel  der Ablageschlüssel `sk:<hash>`
 * @param {any} sk  der Datensatz
 * @param {string} grund
 * @param {{ablage?: any, jetzt?: () => number}} [o]
 * @returns {Promise<false|"voll"|"ohne-vermerk">}  `"voll"`: Vermerk steht (und der Schlüssel ist gelöscht oder durch den Vermerk gesperrt);
 *   `"ohne-vermerk"`: gelöscht, aber der Vermerk konnte nicht geschrieben werden; `false`: weder noch
 */
export async function schluesselWiderrufen(schluessel, sk, grund, { ablage = null, jetzt = Date.now } = {}) {
  if (typeof schluessel !== "string" || !schluessel.startsWith("sk:")) return false;
  const a = ablage || sitzungsSpeicher();
  const bis = Number(sk && sk.bis);
  const vermerk = {
    bestand: sk && typeof sk.bestand === "string" ? sk.bestand : null,
    mandantId: sk && typeof sk.mandantId === "string" ? sk.mandantId : null,
    grund: String(grund || "ersteller-berechtigung").slice(0, 40),
    am: new Date(jetzt()).toISOString(),
    angelegt: sk && typeof sk.angelegt === "string" ? sk.angelegt : null,
    ersteller: sk && sk.ersteller && typeof sk.ersteller.name === "string" ? sk.ersteller.name.slice(0, 80) : null,
    /* Bis dahin ist der Vermerk nötig; danach wäre auch ein wieder aufgetauchter Schlüssel abgelaufen. */
    bis: Number.isFinite(bis) ? bis + VERMERK_ZUSCHLAG : jetzt() + (SK_HOECHST_TAGE + 1) * 86400000,
  };
  let vermerkt = true;
  try {
    await a.setJSON(`skw:${schluessel.slice(3)}`, vermerk);
  } catch { vermerkt = false; }
  /* Gelöscht wird auch ohne Vermerk: Schon das Löschen schützt vor dem Hauptweg der Wiederbelebung (zurückgespielter
     Zustand ohne den Schlüsseldatensatz). Fehlt der Vermerk, wird das als Fehler gemeldet. */
  const weg = await a.delete(schluessel).then(() => true, () => false);
  if (sk && typeof sk.bestand === "string") await a.delete(raumIndex(sk.bestand, schluessel.slice(3))).catch(() => {});
  if (!weg && !vermerkt) return false;
  return vermerkt ? "voll" : "ohne-vermerk";
}

/**
 * Den Vermerk zu einem vorgelegten Schlüssel (dem Rohwert, wie ihn der Aufrufer hat) lesen.
 * @param {string} roh
 * @param {{ablage?: any, jetzt?: () => number}} [o]
 * @returns {Promise<{grund: string, am: string, text: string}|null>}
 *   `null`: kein Vermerk (oder abgelaufen oder nicht lesbar: dann gilt, was der Schlüsseldatensatz sagt).
 */
export async function widerrufsVermerk(roh, { ablage = null, jetzt = Date.now } = {}) {
  if (!roh || typeof roh !== "string") return null;
  const a = ablage || sitzungsSpeicher();
  const v = await a.get(`skw:${hash(roh)}`, { type: "json" }).catch(() => null);
  if (!v || typeof v !== "object") return null;
  if (Number.isFinite(v.bis) && v.bis < jetzt()) return null;
  return { grund: String(v.grund || ""), am: String(v.am || ""), text: widerrufText(v.grund) };
}

/**
 * Alle Schlüssel widerrufen, auf die das Prädikat passt. Findet sie über die Liste `sk:` (die Schlüssel sind wenige).
 * Fehler stören den Aufrufer nicht (die Prüfung beim Gebrauch widerruft ohnehin), werden aber gezählt.
 * @param {(sk: any) => (boolean|Promise<boolean>)} passt
 * @param {string} grund
 * @param {{ablage?: any, jetzt?: () => number}} [o]
 * @returns {Promise<{widerrufen: number, fehler: number}>}
 */
export async function schluesselWiderrufenWenn(passt, grund, { ablage = null, jetzt = Date.now } = {}) {
  const a = ablage || sitzungsSpeicher();
  let widerrufen = 0;
  let fehler = 0;
  let blobs;
  try {
    ({ blobs } = await a.list({ prefix: "sk:" }));
  } catch { return { widerrufen, fehler: 1 }; }
  for (const b of blobs) {
    try {
      const sk = await a.get(b.key, { type: "json" });
      if (!sk || !(await passt(sk))) continue;
      const r = await schluesselWiderrufen(b.key, sk, grund, { ablage: a, jetzt });
      if (r) widerrufen++;
      if (r !== "voll") fehler++;
    } catch { fehler++; }
  }
  return { widerrufen, fehler };
}

/** Die Schlüssel, die ein Konto angelegt hat (Ersteller-Art „konto"). */
export const schluesselDesKontos = (accountId) => (sk) =>
  !!sk && !!sk.ersteller && sk.ersteller.art === "konto" && sk.ersteller.accountId === accountId;

/** Die Schlüssel, die diese Zugänge (Prüfsummen) angelegt haben (Ersteller-Art „code"). */
export const schluesselDerZugaenge = (konten) => (sk) =>
  !!sk && !!sk.ersteller && sk.ersteller.art === "code" && konten.has(sk.ersteller.konto);

/**
 * Wie viele aktive Schlüssel hat das Konto? Für die Warnung vor einer Passwortänderung. Gezählt wird, was ein
 * Schlüssel des Kontos ist und noch nicht abgelaufen; ob der Ersteller gerade noch Leitung ist, prüft der Gebrauch.
 * @param {string} accountId
 * @param {{ablage?: any, jetzt?: () => number}} [o]
 * @returns {Promise<{anzahl: number, warnung: string|null}>}
 */
export async function schluesselDesKontosZaehlen(accountId, { ablage = null, jetzt = Date.now } = {}) {
  const a = ablage || sitzungsSpeicher();
  let anzahl = 0;
  const gehoert = schluesselDesKontos(accountId);
  try {
    const { blobs } = await a.list({ prefix: "sk:" });
    for (const b of blobs) {
      const sk = await a.get(b.key, { type: "json" }).catch(() => null);
      if (gehoert(sk) && Number(sk.bis) >= jetzt()) anzahl++;
    }
  } catch { /* nicht zählbar: die Warnung erscheint trotzdem */ }
  return { anzahl, warnung: SK_WARNUNG_PASSWORT };
}
