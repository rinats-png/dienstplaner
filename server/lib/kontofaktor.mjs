/* ==========================================================================
   ZWEITER FAKTOR AM KONTO (OPT-1-F)

   Ein Konto (E-Mail und Passwort, accountanmeldung.mjs) bekommt denselben
   zweiten Faktor wie ein Zugangscode: TOTP aus zweifaktor.mjs, Geheimnis
   verschlüsselt mit einem aus CENTRIC_PFEFFER abgeleiteten Schlüssel,
   Wiederherstellungscodes nur als Prüfwert. Nichts davon ist neu gebaut —
   diese Datei legt nur fest, UNTER WELCHER KENNUNG der Faktor eines Kontos
   liegt, und reicht die Bausteine durch.

   Wozu: Unter CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1 öffnet die Betriebsauswahl
   (betriebsauswahl.mjs) für Leitung, Planung und Kunde nur eine
   Arbeitssitzung, die mit bestandenem zweitem Faktor entstand. Bis OPT-1-F
   kannte ein Konto keinen Faktor; ein über das Konto angelegter Betrieb war
   für seine Leitung unter Pflicht nicht erreichbar.

   Die Kennung hängt an der Kontokennung (`a_…`, zufällig, unveränderlich),
   nicht an der Adresse und nicht am Pfeffer:
     - Eine geänderte Adresse verliert den Faktor nicht.
     - Fehlt der Pfeffer oder wurde er gewechselt, liegt der Faktor weiter
       unter derselben Kennung und gilt als aktiv; nur entschlüsseln lässt er
       sich nicht — die Prüfung scheitert (grund „pfeffer"), es entsteht keine
       Sitzung (fail-closed). Ein Vermerk am Konto wie bei Zugangscodes
       (Review-Auflage N2) ist deshalb nicht nötig.

   Was hier NICHT ist: keine Anfrage, keine Antwort, keine Bremse, kein
   Protokoll (das gehört dem Endpunkt, funktionen/anmeldung.mjs), kein
   Abschalten und kein Zurücksetzen (Wiederherstellung ist WR-2 bis WR-9).
   ========================================================================== */

import { createHash } from "node:crypto";
import {
  zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigenVorpruefen,
  zweifaktorBestaetigen, zweifaktorPruefen,
} from "./zweifaktor.mjs";

/** Die Kennung, unter der der zweite Faktor eines Kontos liegt. Eigener Vorsatz,
    getrennt von Betreiber- („betreiber-code:") und Rollencodes („rollen-code:"). */
export const kontoFaktorId = (accountId) =>
  createHash("sha256").update(`konto-account:${String(accountId)}`).digest("hex");

const brauchbar = (accountId) => typeof accountId === "string" && /^a_[A-Za-z0-9_-]{8,}$/.test(accountId);

/**
 * Stand des Faktors. Wirft bei einem Lesefehler — der Aufrufer muss dann
 * abweisen, nicht durchlassen.
 * @param {any} store  Ablage „centric"
 * @param {string} accountId
 * @returns {Promise<{aktiv: boolean, ausstehend: boolean}>}
 */
export async function kontoFaktorStand(store, accountId) {
  if (!brauchbar(accountId)) throw new Error("kontokennung");
  const s = await zweifaktorStand(store, kontoFaktorId(accountId));
  return { aktiv: s.aktiv === true, ausstehend: s.ausstehend === true };
}

/**
 * Einrichtung beginnen. Weder ein aktiver Faktor noch eine laufende Einrichtung
 * (15 Minuten, zweifaktor.mjs) wird überschrieben — sonst könnte, wer das
 * Passwort kennt, die Einrichtung des Kontoinhabers durch seine eigene ersetzen.
 * Das Geheimnis verlässt den Server genau hier, genau einmal.
 * @param {any} store
 * @param {string} accountId
 * @returns {Promise<{ok: true, geheimnis: string, otpauth: string}
 *   |{ok: false, grund: "aktiv"|"ausstehend"|"pfeffer"}>}
 */
export async function kontoFaktorBeginnen(store, accountId) {
  const st = await kontoFaktorStand(store, accountId);
  if (st.aktiv) return { ok: false, grund: "aktiv" };
  if (st.ausstehend) return { ok: false, grund: "ausstehend" };
  const e = await zweifaktorBeginnen(store, kontoFaktorId(accountId), "Konto");
  if (e.fehler === "pfeffer") return { ok: false, grund: "pfeffer" };
  if (e.fehler) return { ok: false, grund: "aktiv" };
  return { ok: true, geheimnis: e.geheimnis, otpauth: e.otpauth };
}

/**
 * Würde dieser Code die laufende Einrichtung bestätigen? Speichert nichts.
 * @returns {Promise<{ok: boolean, grund?: string}>}
 */
export async function kontoFaktorVorpruefen(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const v = await zweifaktorBestaetigenVorpruefen(store, kontoFaktorId(accountId), String(code || ""));
  return v.ok ? { ok: true } : { ok: false, grund: v.fehler || "code" };
}

/**
 * Einrichtung bestätigen: aktiv, Wiederherstellungscodes genau einmal.
 * @returns {Promise<{ok: true, wiederherstellung: string[]}|{ok: false, grund: string}>}
 */
export async function kontoFaktorBestaetigen(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const e = await zweifaktorBestaetigen(store, kontoFaktorId(accountId), String(code || ""));
  if (e.fehler) return { ok: false, grund: e.fehler };
  return { ok: true, wiederherstellung: e.wiederherstellung };
}

/**
 * Den Faktor bei der Anmeldung prüfen: Code aus der App (einmal je Schritt)
 * oder Wiederherstellungscode (einmal). Nie ein Nachweis.
 * @returns {Promise<{ok: boolean, art?: string, grund?: string}>}
 */
export async function kontoFaktorPruefen(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const c = typeof code === "string" ? code.trim() : "";
  if (!c) return { ok: false, grund: "fehlt" };
  return zweifaktorPruefen(store, kontoFaktorId(accountId), { code: c, nachweisErlaubt: false });
}
