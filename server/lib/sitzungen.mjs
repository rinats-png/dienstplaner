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

   ---------------------------------------------------------------------------
   Autorität und Aktivität sind getrennt (Phase A.1, Befund F4)

   `t:<Prüfsumme>` ist die Autorität. Es wird genau einmal geschrieben, in
   `sitzungAnlegen`, und danach nie wieder. Die Verlängerung einer Sitzung aus
   einem Zugangscode schreibt in einen eigenen Schlüssel, `ta:<Prüfsumme>` mit
   `{ zuletzt }`.

   Vorher schrieb sie den ganzen Datensatz zurück, ohne darauf zu warten. Löschte
   in der Zwischenzeit eine Sperre (zugang-sperren) oder eine Raumlöschung die
   Sitzung, legte der verspätete Schreibvorgang sie wieder an — und eine Sitzung
   aus einem Zugangscode wird nicht gegen den Code geprüft, sie galt dann wieder
   bis zu zwölf Stunden. Jetzt kann der verspätete Schreibvorgang nur ein `ta:`
   anlegen, und ein `ta:` ohne `t:` erlaubt nichts: Gelesen wird zuerst die
   Autorität. Eine Aktivität kann verlängern, nie berechtigen.

   Eine Sitzung mit Herkunftsanker (aus einem Konto) hat gar keine eigene
   Aktivität: Ihr Login-Kontext lebt, solange in ihm gearbeitet wird; wie das
   geschieht, steht bei der Prüfung der Arbeitssitzung (arbeitssitzung.mjs). Diese
   Datei kennt davon nur das Wort „Herkunft".

   Ein Sicherungsschlüssel (`sk:`) ist keine Sitzung: Er läuft nicht ab,
   weil jemand eine halbe Stunde nichts tut, und er wird nirgends
   verlängert. Er darf ausschließlich lesen — das setzt der Aufrufer über
   die Positivliste durch, nicht diese Datei.

   Diese Datei kennt keine Rolle, kein Recht und keinen Endpunkt. Sie
   beantwortet eine Frage: Zu welchem Merkmal gehört welche Sitzung, und
   gilt sie noch.
   ========================================================================== */

import { getStore } from "./ablage.mjs";
import { ablaufUrteil, verlaengernFaellig } from "./lebendigkeit.mjs";
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

  const id = hash(token);
  const s = await sitzungen.get(`t:${id}`, { type: "json" });
  if (!s) return null;
  const nun = jetzt();
  /* Die Regel, wann eine Sitzung abgelaufen ist, steht in lebendigkeit.mjs —
     einmal, für jeden, der sie braucht. Die lockere Lesart ist die alte:
     ein Datensatz ohne Ende läuft nicht ab. */
  /* Eine Sitzung mit Herkunftsanker (aus einem Konto) hat keine eigene
     Untätigkeitsgrenze: Ihr Login-Kontext lebt, solange in ihm gearbeitet wird,
     und die Prüfung dort (arbeitssitzung.mjs) verlängert und beendet ihn. Nur
     die absolute Frist gilt hier. */
  const gebunden = Object.prototype.hasOwnProperty.call(s, "herkunft");

  /* Die Aktivität einer Sitzung aus einem Zugangscode, daneben. Lässt sie sich
     nicht lesen, bleibt die Tür zu: Eine Sitzung, deren Untätigkeit sich nicht
     beurteilen lässt, gilt nicht — und gelöscht wird dabei nichts. */
  let aktiv = null;
  if (!gebunden) {
    try { aktiv = await sitzungen.get(`ta:${id}`, { type: "json" }); }
    catch { return null; }
  }

  const urteil = ablaufUrteil(s, nun,
    { streng: false, ruhe: gebunden ? Infinity : RUHE, aktivitaet: aktiv });
  if (urteil.grund === "frist" || urteil.grund === "untaetig") {
    await sitzungWeg(sitzungen, id);
    return null;
  }
  /* Ein Planer klickt sich durch einen Monat — das wären hunderte
     Schreibvorgänge. Einmal je Minute genügt. Und in den EIGENEN Schlüssel:
     Käme dieser Schreibvorgang nach einer Sperre an, legte er höchstens ein
     `ta:` an, das nichts erlaubt — nie die Sitzung selbst. */
  if (!gebunden && verlaengernFaellig(s, aktiv, nun)) {
    sitzungen.setJSON(`ta:${id}`, { zuletzt: nun }).catch(() => {});
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
    /* Die Autorität ist weg — das ist der Widerruf. Die Aktivität räumt der
       Rest nach; bleibt sie liegen, ist sie eine Waise, die nichts erlaubt. */
    await sitzungsSpeicher().delete(`ta:${hash(token)}`).catch(() => {});
    return true;
  } catch { return false; }
}

/** Autorität zuerst, dann Aktivität; Fehler stören den Aufrufer nicht. */
async function sitzungWeg(speicher, id) {
  try { await speicher.delete(`t:${id}`); } catch { /* bleibt liegen, läuft ab */ }
  try { await speicher.delete(`ta:${id}`); } catch { /* Waise, harmlos */ }
}

/**
 * Beendet alle Arbeitssitzungen, für die `passt` wahr ist — der Weg, wenn ein
 * Zugang gesperrt wird: Eine Sitzung, die nach der Sperre noch zwölf Stunden
 * läuft, ist keine Sperre. `passt` bekommt den gelesenen Datensatz.
 *
 * Fehler bei einzelnen Dateien stoppen den Lauf nicht; sie werden gezählt.
 *
 * @param {(satz: any) => boolean} passt
 * @returns {Promise<{beendet: number, fehler: number}>}
 */
export async function sitzungenBeendenWenn(passt) {
  const speicher = sitzungsSpeicher();
  let beendet = 0, fehler = 0;
  let blobs;
  try { ({ blobs } = await speicher.list({ prefix: "t:" })); }
  catch { return { beendet: 0, fehler: 1 }; }
  for (const b of blobs) {
    let satz = null;
    try { satz = await speicher.get(b.key, { type: "json" }); }
    catch { fehler++; continue; }
    if (!satz || typeof satz !== "object" || !passt(satz)) continue;
    try {
      await speicher.delete(b.key);
      beendet++;
      await speicher.delete(`ta:${b.key.slice(2)}`).catch(() => {});
    } catch { fehler++; }
  }
  return { beendet, fehler };
}

/**
 * Beendet eine Sitzung über ihre Kennung (die Prüfsumme des Merkmals), ohne das
 * Merkmal zu kennen — der Weg des Logouts, der die Arbeitssitzungen seines
 * Login-Kontexts aus den Markern kennt. Nur eine Prüfsumme kommt in die Ablage.
 * @param {unknown} id  64 Hexzeichen
 * @returns {Promise<boolean>}  wahr, wenn die Sitzung nach dem Aufruf nicht mehr existiert
 */
export async function sitzungBeendenPerId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) return false;
  try {
    await sitzungsSpeicher().delete(`t:${id}`);
    await sitzungsSpeicher().delete(`ta:${id}`).catch(() => {});
    return true;
  } catch { return false; }
}

/** Der Ablageschlüssel einer Sitzung — für Aufrufer, die selbst listen. */
export const sitzungsSchluessel = (token) => `t:${hash(token)}`;
export const sicherungsSchluessel = (roh) => `sk:${hash(roh)}`;
