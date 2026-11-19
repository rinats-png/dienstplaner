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
   Abschalten und kein Zurücksetzen (Verlustfall ist WR-3 bis WR-9). Neu
   erzeugen lassen sich nur die Wiederherstellungscodes (WR-2), mit frischem
   Code aus der App.
   ========================================================================== */

import { createHash } from "node:crypto";
import {
  zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigenVorpruefen,
  zweifaktorBestaetigen, zweifaktorPruefen, wiederherstellungNeu,
} from "./zweifaktor.mjs";
import { kontoFaktorPflichtVermerken, whCodeImBuch, whCodeVerbrauchVermerken } from "./kontowiderrufbuch.mjs";

/* BE-2 A1 (Betreiberentscheidung 2026-11-14; kontowiderrufbuch.mjs, docs/acc45/ABNAHME-V4-BE2-A1-ZWEITER-FAKTOR.md):
   Ein einmal AKTIVIERTER Konto-Faktor bleibt Pflicht, und ein eingelöster Wiederherstellungscode bleibt verbraucht —
   auch nach einem Rücksprung der Ablage. Reihenfolge wie BE-1/E-M6: ZUERST die Ablage (Aktivierung bzw. Verbrauch),
   DANN das Konto-Widerrufbuch; scheitert das Buch, Nachtrag in der Ablage (einsammelbar beim nächsten Schreiben oder
   Start), /gesund warnt. Das Buch trägt nie ein Geheimnis und nie einen Code — nur HMAC-Kennungen. */

/** Die Kennung, unter der der zweite Faktor eines Kontos liegt. Eigener Vorsatz,
    getrennt von Betreiber- („betreiber-code:") und Rollencodes („rollen-code:"). */
export const kontoFaktorId = (accountId) =>
  createHash("sha256").update(`konto-account:${String(accountId)}`).digest("hex");

const brauchbar = (accountId) => typeof accountId === "string" && /^a_[A-Za-z0-9_-]{8,}$/.test(accountId);

/**
 * Hat das Konto einen aktiven Faktor? Für die Prüfung, ob eine Sitzung OHNE bestandenen Faktor noch gelten darf
 * (OPT-1-F, Befund 3): Ist der Faktor aktiv, gilt keine solche Sitzung mehr — gleich, ob das Abmelden nach der
 * Aktivierung gelang. Wirft bei einem Lesefehler (der Aufrufer weist dann ab). Eine Kennung, die keinen Faktor tragen
 * kann, hat keinen.
 * @param {any} store
 * @param {string} accountId
 * @returns {Promise<boolean>}
 */
export async function kontoFaktorAktiv(store, accountId) {
  if (!brauchbar(accountId)) return false;
  return (await kontoFaktorStand(store, accountId)).aktiv === true;
}

/**
 * Stand des Faktors. Wirft bei einem Lesefehler — der Aufrufer muss dann
 * abweisen, nicht durchlassen.
 * @param {any} store  Ablage „centric"
 * @param {string} accountId
 * `ruecksprungSperre` (BE-2 A1): der gesperrte Platzhalter eines nach einem Rücksprung fehlenden Pflicht-Faktors.
 * @returns {Promise<{aktiv: boolean, ausstehend: boolean, ruecksprungSperre: boolean}>}
 */
export async function kontoFaktorStand(store, accountId) {
  if (!brauchbar(accountId)) throw new Error("kontokennung");
  const s = await zweifaktorStand(store, kontoFaktorId(accountId));
  return { aktiv: s.aktiv === true, ausstehend: s.ausstehend === true, ruecksprungSperre: s.ruecksprungSperre === true };
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
  /* Die Vorprüfung oben bleibt; entscheidend ist die zweite Prüfung unter der
     Sperre in zweifaktorBeginnen — erst sie schließt zwei gleichzeitige Aufrufe aus. */
  const e = await zweifaktorBeginnen(store, kontoFaktorId(accountId), "Konto", { laufendeSchuetzen: true });
  if (e.fehler === "pfeffer") return { ok: false, grund: "pfeffer" };
  if (e.fehler === "ausstehend") return { ok: false, grund: "ausstehend" };
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
 * BE-2 A1: Nach der Aktivierung (Ablage) „Faktor ist Pflicht“ ins Konto-Widerrufbuch. Scheitert das, bleibt der Faktor
 * aktiv und die Codes gehen trotzdem an den Inhaber (sie erscheinen nur hier); `kontobuch.geschrieben: false`, Nachtrag
 * in der Ablage, der nächste Schreibvorgang oder Start holt nach (einsammeln: aktiver Faktor).
 * @returns {Promise<{ok: true, wiederherstellung: string[], kontobuch: {geschrieben: boolean}}|{ok: false, grund: string}>}
 */
export async function kontoFaktorBestaetigen(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const e = await zweifaktorBestaetigen(store, kontoFaktorId(accountId), String(code || ""));
  if (e.fehler) return { ok: false, grund: e.fehler };
  const kontobuch = await kontoFaktorPflichtVermerken(store, accountId);
  return { ok: true, wiederherstellung: e.wiederherstellung, kontobuch };
}

/**
 * Den Faktor bei der Anmeldung prüfen: Code aus der App (einmal je Schritt)
 * oder Wiederherstellungscode (einmal). Nie ein Nachweis.
 * BE-2 A1: Ein Wiederherstellungscode, der im Konto-Widerrufbuch als verbraucht steht, gilt nicht (auch wenn die
 * Ablage ihn nach einem Rücksprung als unverbraucht zeigt); ist das Buch nicht prüfbar, wirft es (der Aufrufer weist
 * ab, 503). Nach dem Einlösen (Ablage) kommt seine Stelle ins Buch; scheitert das, gilt die Prüfung als nicht bestanden
 * (`grund: "buch"`, fail-closed — der Code ist in der Ablage verbraucht, der Nachtrag hält ihn fest).
 * @returns {Promise<{ok: boolean, art?: string, grund?: string}>}
 */
export async function kontoFaktorPruefen(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const c = typeof code === "string" ? code.trim() : "";
  if (!c) return { ok: false, grund: "fehlt" };
  const r = await zweifaktorPruefen(store, kontoFaktorId(accountId), { code: c, nachweisErlaubt: false,
    whBuch: (stelle) => whCodeImBuch(store, accountId, stelle) });
  if (!r.ok || !r.stelle) return r.ok ? { ok: true, art: r.art } : { ok: false, grund: r.grund };
  const v = await whCodeVerbrauchVermerken(store, accountId, r.stelle);
  if (!v.geschrieben) return { ok: false, grund: "buch" };
  return { ok: true, art: r.art };
}

/**
 * WR-2: Wiederherstellungscodes des Kontos neu erzeugen. Nur mit einem frischen Code aus der App (sechs Ziffern, ein
 * noch nicht angenommener Zeitschritt) — kein Wiederherstellungscode, kein Nachweis (Entscheidungen 8 und 9: keine
 * Änderung am Faktor allein über einen online eingegebenen Wiederherstellungscode). Den ersten Faktor (Adresse und
 * Passwort) prüft der Aufrufer (accountanmeldung.mjs). Prüfen, Erzeugen und Ersetzen laufen in zweifaktor.mjs unter
 * einer Sperre; danach gilt keiner der bisherigen Codes.
 * @returns {Promise<{ok: true, wiederherstellung: string[]}|{ok: false, grund: string}>}
 */
export async function kontoWiederherstellungNeu(store, accountId, code) {
  if (!brauchbar(accountId)) return { ok: false, grund: "kontokennung" };
  const c = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(c)) return { ok: false, grund: "nur-totp" };
  const r = await wiederherstellungNeu(store, kontoFaktorId(accountId), c);
  if (!r.ok) return { ok: false, grund: r.fehler || "code" };
  return { ok: true, wiederherstellung: /** @type {string[]} */ (r.wiederherstellung) };
}
