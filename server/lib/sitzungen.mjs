/* ==========================================================================
   SITZUNGEN

   Herausgezogen aus server/funktionen/daten.mjs, unverändert im Verhalten.
   Der Anlass: Künftig legen mehrere Endpunkte Sitzungen an — Anmeldung,
   Einladung, Passwort-Reset. Eine zweite Kopie dieser Logik wäre der
   Anfang von zwei Wahrheiten über denselben Vorgang.

   Was eine Sitzung ist: ein zufälliges Merkmal beim Klienten, im Speicher
   nur seine Prüfsumme, daran der Betrieb, die Rolle, die Person und der
   Ablageschlüssel des Kontos.

     Frist          12 Stunden, Betreiber 2
     Untätigkeit    30 Minuten
     Verlängerung   `zuletzt` höchstens einmal je Minute

   Die Fristen sind keine Zahl aus der Luft. Zwölf Stunden sind für ein
   eigenes Telefon richtig und für den Stationsrechner, den sich eine ganze
   Schicht teilt, zu lang — deshalb die Untätigkeitsgrenze daneben: Wer eine
   halbe Stunde nichts tut, ist weg; wer arbeitet, bleibt, weil jeder
   Zugriff die Uhr neu stellt. Eine Betreibersitzung läuft kürzer, weil sie
   Datenräume anlegen kann.

   Ein Sicherungsschlüssel (`sk:`) ist keine Sitzung: Er läuft nicht ab,
   weil jemand eine halbe Stunde nichts tut, und er wird nirgends
   verlängert. Er darf ausschließlich lesen — das setzt der Aufrufer über
   die Positivliste durch, nicht diese Datei.

   Diese Datei kennt keine Rolle, kein Recht und keinen Endpunkt. Sie
   beantwortet eine Frage: Zu welchem Merkmal gehört welche Sitzung, und
   gilt sie noch.
   ========================================================================== */

import { getStore } from "./ablage.mjs";
import { createHash, randomBytes } from "node:crypto";

/** Die Ablage der Sitzungen. Auch für die Aufrufer, die `sk:`-Schlüssel
    auflisten oder einen ganzen Raum leerräumen. */
export const sitzungsSpeicher = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Zwölf Stunden für alle, zwei für den Betreiber. */
export const DAUER_STANDARD = 1000 * 60 * 60 * 12;
export const DAUER_BETREIBER = 1000 * 60 * 60 * 2;
/** Untätigkeit beendet die Sitzung, nicht erst die Frist. */
export const RUHE = 30 * 60 * 1000;
/** Ein Planer klickt sich durch einen Monat — das wären hunderte
    Schreibvorgänge. Einmal je Minute genügt. */
const VERLAENGERN_AB = 60 * 1000;

/** Das Merkmal aus dem Kopf `authorization`, oder null. */
export function merkmalAus(req) {
  const kopf = (req && req.headers && req.headers.get("authorization")) || "";
  return kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
}

/** Die Dauer, die zu einer Rolle gehört. */
export const dauerFuer = (rolle) =>
  rolle === "betreiber" ? DAUER_BETREIBER : DAUER_STANDARD;

/**
 * Prüft das Merkmal aus dem Kopf und gibt die Sitzung zurück.
 *
 * @param {Request} req
 * @param {{jetzt?: () => number}} [o]
 * @returns {Promise<object|null>}
 */
export async function sitzungLesen(req, { jetzt = Date.now } = {}) {
  const token = merkmalAus(req);
  if (!token) return null;
  const sitzungen = sitzungsSpeicher();

  /* Ein Sicherungsschlüssel ist keine Sitzung: Er läuft nicht ab, weil
     jemand eine halbe Stunde nichts tut, und er wird nirgends verlängert.
     Er darf ausschließlich lesen — das prüft der Endpunkt selbst über
     nurSicherung. */
  const sk = await sitzungen.get(`sk:${hash(token)}`, { type: "json" }).catch(() => null);
  if (sk) {
    if (sk.bis < jetzt()) { await sitzungen.delete(`sk:${hash(token)}`); return null; }
    return { ...sk, nurSicherung: true };
  }

  const s = await sitzungen.get(`t:${hash(token)}`, { type: "json" });
  if (!s) return null;
  const nun = jetzt();
  if (s.bis < nun) { await sitzungen.delete(`t:${hash(token)}`); return null; }

  if (s.zuletzt && nun - s.zuletzt > RUHE) {
    await sitzungen.delete(`t:${hash(token)}`);
    return null;
  }
  if (!s.zuletzt || nun - s.zuletzt > VERLAENGERN_AB) {
    sitzungen.setJSON(`t:${hash(token)}`, { ...s, zuletzt: nun }).catch(() => {});
  }
  return s;
}

/**
 * Legt eine Sitzung an und gibt das Merkmal zurück — die einzige Stelle,
 * an der es im Klartext existiert.
 *
 * `felder` trägt, was der Aufrufer mitgibt: bestand, name, rolle, person,
 * betrieb, konto, einheit, demo. Die Zeiten setzt diese Funktion.
 *
 * @param {object} felder
 * @param {number} [dauerMs]  ohne Angabe die Dauer zur Rolle in `felder`
 * @param {{jetzt?: () => number}} [o]
 * @returns {Promise<{token: string, gueltigBis: number}>}
 */
export async function sitzungAnlegen(felder, dauerMs, { jetzt = Date.now } = {}) {
  const token = randomBytes(32).toString("base64url");
  const dauer = Number(dauerMs) > 0 ? Number(dauerMs) : dauerFuer(felder && felder.rolle);
  const nun = jetzt();
  const gueltigBis = nun + dauer;
  await sitzungsSpeicher().setJSON(`t:${hash(token)}`, {
    ...felder, seit: nun, zuletzt: nun, bis: gueltigBis,
  });
  return { token, gueltigBis };
}

/**
 * Beendet genau diese Sitzung. Ein unbekanntes Merkmal ist kein Fehler —
 * abmelden soll immer gelingen.
 * @param {string|null} token
 */
export async function sitzungBeenden(token) {
  if (!token) return false;
  try {
    await sitzungsSpeicher().delete(`t:${hash(token)}`);
    return true;
  } catch { return false; }
}

/** Der Ablageschlüssel einer Sitzung — für Aufrufer, die selbst listen. */
export const sitzungsSchluessel = (token) => `t:${hash(token)}`;
export const sicherungsSchluessel = (roh) => `sk:${hash(roh)}`;
