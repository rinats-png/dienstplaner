/* ==========================================================================
   KONTOWIEDERHERSTELLUNG — reine Logik der Oberfläche (WR-6)

   Alles, was ohne Browser prüfbar ist: Anfragen bauen, Eingaben prüfen,
   Antworten des Servers deuten. Die Aufrufe gehen an den bestehenden Weg
   /api/anmelden mit `zweifaktorAktion` (server/lib/kontowiederherstellung-zugang.mjs,
   docs/acc45/WR-3-NACHWEIS.md); es gibt keinen neuen Endpunkt und nie eine Sitzung.

   Grundsätze dieser Datei:
   - Nichts wird gespeichert (kein localStorage, kein sessionStorage, keine
     Adresse, kein Protokoll). Zugangscode, Code aus der App, Fallnummer,
     Personalnummer, Abschlusstoken, Geheimnis und Wiederherstellungscodes
     leben nur in den Händen des Aufrufers und werden nach dem Absenden dort
     gelöscht.
   - Die Fehlertexte kommen, wo der Server sie neutral formuliert, unverändert
     vom Server. Ein Nein des Servers wird nie näher erklärt (kein Orakel).
   - Der Schalter CENTRIC_KONTOWIEDERHERSTELLUNG ist ausgeliefert aus: Antwortet
     der Server auf eine Verlust-Aktion mit 403 (außer dem allgemeinen „nein"
     einer Freigabe), gilt der Weg als nicht verfügbar. Die Oberfläche nimmt
     nie an, dass er an ist.
   ========================================================================== */

/** Die Aktionen (zweifaktorAktion) dieses Wegs. */
export const AKTION = Object.freeze({
  melden: "verlust-melden",
  zurueckziehen: "verlust-zurueckziehen",
  freigeben: "verlust-freigeben",
  ablehnen: "verlust-ablehnen",
  einloesen: "verlust-einloesen",
  bestaetigen: "bestaetigen",   // bestehende Aktion: neue Einrichtung mit dem ersten Code bestätigen
});

/** Verfahren der Identitätsprüfung — wie in server/lib/kontowiederherstellung.mjs (VERFAHREN). */
export const VERFAHREN = Object.freeze([
  { wert: "persoenlich", text: "Persönlich, mit Ausweis" },
  { wert: "rueckruf", text: "Rückruf an die hinterlegte Nummer" },
  { wert: "schriftlich", text: "Schriftlich nachgewiesen" },
]);

/** Gründe einer Ablehnung — wie ABLEHNUNGSGRUENDE im Server (feste Liste, kein Freitext). */
export const ABLEHNUNGSGRUENDE = Object.freeze([
  { wert: "identitaet-zweifelhaft", text: "Identität nicht sicher festgestellt" },
  { wert: "nicht-veranlasst", text: "Antrag nicht veranlasst" },
  { wert: "sonstiges", text: "Sonstiges" },
]);

/** Form einer Fallkennung: F- und 16 Zeichen aus dem Alphabet der Wiederherstellungscodes. */
export const FALL_MUSTER = /^F-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/;
/** Aktenzeichen: wie AKTENZEICHEN_MUSTER im Server. */
export const AKTENZEICHEN_MUSTER = /^[A-Za-z0-9._/-]{1,40}$/;
/** Höchstlänge der Personalnummer (wie PN_MAX im Server). */
export const PERSONALNUMMER_MAX = 40;
/** Form des Abschlusstokens: 32 Byte als base64url (Groß-/Kleinschreibung zählt). */
export const TOKEN_MUSTER = /^[A-Za-z0-9_-]{43}$/;

/** Wie lange ein Antrag offen ist und wie lange das Abschlusstoken gilt (Anzeige; maßgeblich ist der Server). */
export const ANTRAG_STUNDEN = 24;
export const TOKEN_MINUTEN = 15;

/** Der neutrale Text, wenn der Weg nicht verfügbar ist. Er sagt nicht, warum. */
export const TEXT_NICHT_VERFUEGBAR = "Dieser Weg steht derzeit nicht zur Verfügung. Bitte wende dich an die Organisationsleitung.";
const TEXT_KEINE_VERBINDUNG = "Keine Verbindung zum Server.";
const TEXT_ALLGEMEIN = "Das hat nicht geklappt. Bitte später erneut versuchen.";

const leer = (v) => v === null || v === undefined || String(v).trim() === "";

/** Zugangscode wie in der Anmeldemaske: getrimmt und in Großbuchstaben. */
export const zugangscodeNormiert = (v) => String(v ?? "").trim().toUpperCase();
/** Code aus der App: Leerzeichen weg; gültig sind genau sechs Ziffern. */
export const codeNormiert = (v) => String(v ?? "").replace(/\s/g, "");
/** Fallkennung normieren; ungültige Form: null. */
export const fallNormiert = (v) => { const s = String(v ?? "").trim().toUpperCase(); return FALL_MUSTER.test(s) ? s : null; };

const FEHLER = Object.freeze({
  zugangscode: "Bitte den Zugangscode eingeben.",
  code: "Bitte den aktuellen Code aus der App eingeben (sechs Ziffern).",
  fall: "Bitte die Fallnummer eingeben (F- und 16 Zeichen).",
  verfahren: "Bitte das Verfahren der Identitätsprüfung wählen.",
  aktenzeichen: "Das Aktenzeichen darf nur Buchstaben, Ziffern und . _ / - enthalten (höchstens 40 Zeichen).",
  personalnummer: "Bitte die Personalnummer der geprüften Person eingeben.",
  grund: "Bitte einen Grund wählen.",
  token: "Bitte das Abschlusstoken so eingeben, wie du es erhalten hast (43 Zeichen).",
});

/**
 * Anfrage an /api/anmelden bauen und die Eingaben prüfen. Nur die Form wird geprüft — ob ein Fall, eine Nummer oder ein
 * Code stimmt, sagt allein der Server.
 * @param {string} aktion  ein Wert aus AKTION
 * @param {Record<string, any>} f  zugangscode, code, fall, verfahren, aktenzeichen, personalnummer, grund, token
 * @returns {{ok: true, koerper: Record<string, string>} | {ok: false, feld: string, fehler: string}}
 */
export function verlustAnfrage(aktion, f = {}) {
  const nein = (feld) => ({ ok: /** @type {const} */ (false), feld, fehler: FEHLER[feld] });
  if (!Object.values(AKTION).includes(aktion)) return { ok: false, feld: "aktion", fehler: TEXT_ALLGEMEIN };
  const zugangscode = zugangscodeNormiert(f.zugangscode);
  if (!zugangscode) return nein("zugangscode");
  const koerper = { zugangscode, zweifaktorAktion: aktion };
  if (aktion === AKTION.melden || aktion === AKTION.zurueckziehen) return { ok: true, koerper };
  if (aktion === AKTION.einloesen) {
    const token = String(f.token ?? "").trim();
    if (!TOKEN_MUSTER.test(token)) return nein("token");
    return { ok: true, koerper: { ...koerper, freigabe: token } };
  }
  const code = codeNormiert(f.code);
  if (!/^\d{6}$/.test(code)) return nein("code");
  if (aktion === AKTION.bestaetigen) return { ok: true, koerper: { ...koerper, zweifaktor: code } };
  /* Freigabe und Ablehnung */
  const fall = fallNormiert(f.fall);
  if (!fall) return nein("fall");
  const personalnummer = String(f.personalnummer ?? "").trim();
  if (!personalnummer || personalnummer.length > PERSONALNUMMER_MAX) return nein("personalnummer");
  const ziel = { ...koerper, zweifaktor: code, fall, personalnummer };
  if (aktion === AKTION.ablehnen) {
    if (!ABLEHNUNGSGRUENDE.some((g) => g.wert === f.grund)) return nein("grund");
    return { ok: true, koerper: { ...ziel, grund: f.grund } };
  }
  if (!VERFAHREN.some((v) => v.wert === f.verfahren)) return nein("verfahren");
  const aktenzeichen = leer(f.aktenzeichen) ? null : String(f.aktenzeichen).trim();
  if (aktenzeichen !== null && !AKTENZEICHEN_MUSTER.test(aktenzeichen)) return nein("aktenzeichen");
  return { ok: true, koerper: { ...ziel, verfahren: f.verfahren, ...(aktenzeichen ? { aktenzeichen } : {}) } };
}

/** Nur diese drei Angaben zur Person zeigt die Oberfläche, und nur, wenn der Server sie nach Erfolg liefert. */
function traegerAnzeige(t) {
  if (!t || typeof t !== "object") return null;
  const s = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
  const a = { vorname: s(t.vorname), nachname: s(t.nachname), einheit: s(t.einheit) };
  return a.vorname || a.nachname || a.einheit ? a : null;
}

/**
 * Antwort des Servers deuten. Gibt nur die Felder weiter, die die Oberfläche braucht.
 * Arten: ok · nicht-verfuegbar · bremse · fehler.
 * @param {string} aktion @param {number} status @param {any} d  JSON-Rumpf (oder {})
 * @returns {{art: "ok"|"nicht-verfuegbar"|"bremse"|"fehler", text?: string, daten?: any}}
 */
export function verlustAntwort(aktion, status, d) {
  const r = d && typeof d === "object" ? d : {};
  const neutral = (s) => (typeof s === "string" && s.trim() ? s.trim() : TEXT_ALLGEMEIN);
  if (status === 200 && r.ok === true) {
    if (aktion === AKTION.melden)
      return { art: "ok", daten: { stufe: "gemeldet", fall: typeof r.fall === "string" ? r.fall : null,
        gueltigBis: typeof r.gueltigBis === "string" ? r.gueltigBis : null } };
    if (aktion === AKTION.zurueckziehen) return { art: "ok", daten: { stufe: "zurueckgezogen" } };
    if (aktion === AKTION.ablehnen) return { art: "ok", daten: { stufe: "abgelehnt", traeger: traegerAnzeige(r.traeger) } };
    if (aktion === AKTION.freigeben) {
      if (r.stand === "freigegeben" && typeof r.freigabe === "string" && r.freigabe)
        return { art: "ok", daten: { stufe: "freigegeben", traeger: traegerAnzeige(r.traeger), freigabe: r.freigabe,
          gueltigBis: typeof r.gueltigBis === "string" ? r.gueltigBis : null } };
      return { art: "ok", daten: { stufe: "teilfreigegeben", traeger: traegerAnzeige(r.traeger) } };
    }
    if (aktion === AKTION.einloesen) {
      if (typeof r.geheimnis !== "string" || !r.geheimnis) return { art: "fehler", text: TEXT_ALLGEMEIN };
      return { art: "ok", daten: { stufe: "eingeloest", geheimnis: r.geheimnis,
        otpauth: typeof r.otpauth === "string" ? r.otpauth : null } };
    }
  }
  if (status === 200 && aktion === AKTION.bestaetigen && Array.isArray(r.wiederherstellung))
    return { art: "ok", daten: { stufe: "bestaetigt", wiederherstellung: r.wiederherstellung.filter((x) => typeof x === "string") } };
  /* Verlust-Weg ausgeschaltet oder für diesen Zugang gesperrt: 403 ohne das allgemeine „nein" einer Freigabe. */
  if (status === 403 && aktion !== AKTION.bestaetigen && r.verlust !== "nein")
    return { art: "nicht-verfuegbar", text: TEXT_NICHT_VERFUEGBAR };
  if (status === 429) return { art: "bremse", text: neutral(r.text) };
  if (status === 0) return { art: "fehler", text: TEXT_KEINE_VERBINDUNG };
  /* Neutrale Serverantwort unverändert (400, 401, 403 „nein", 409, 503); ohne Text ein allgemeiner. */
  return { art: "fehler", text: neutral(r.fehler) };
}

/**
 * Eine Verlust-Aktion absenden. Wirft nie; schreibt nichts in den Browser und nichts ins Protokoll.
 * @param {string} aktion @param {Record<string, any>} felder
 * @param {typeof fetch} [holen]  Ersatz für fetch (Prüfungen)
 */
export async function verlustSenden(aktion, felder, holen = (typeof fetch === "function" ? fetch : undefined)) {
  const a = verlustAnfrage(aktion, felder);
  if (!a.ok) return { art: /** @type {const} */ ("eingabe"), feld: a.feld, text: a.fehler };
  try {
    if (!holen) return verlustAntwort(aktion, 0, {});
    const r = await holen("/api/anmelden", { method: "POST", cache: "no-store", credentials: "omit",
      headers: { "content-type": "application/json" }, body: JSON.stringify(a.koerper) });
    let d = {};
    try { d = await r.json(); } catch { /* leerer oder kein JSON-Rumpf */ }
    return verlustAntwort(aktion, r.status, d);
  } catch {
    return verlustAntwort(aktion, 0, {});
  }
}

/** Zeitpunkt für Menschen: „11.11.2026, 14:30 Uhr" (Betriebsdatum Europe/Berlin). Unlesbar: leerer Text. */
export function zeitText(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute} Uhr`;
}

/** Name der geprüften Person aus der Serverantwort (nur Vor-/Nachname), für die Kontrollzeile. */
export function traegerZeile(t) {
  const a = traegerAnzeige(t);
  if (!a) return "";
  const name = [a.vorname, a.nachname].filter(Boolean).join(" ");
  return [name, a.einheit ? `Einheit ${a.einheit}` : ""].filter(Boolean).join(" · ");
}
