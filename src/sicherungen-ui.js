/* ==========================================================================
   SICHERUNGEN IN DER OBERFLÄCHE (WP-25) — Texte und Regeln ohne React

   Die Leitung legte Sicherungen schon in der Oberfläche an; zurückspielen
   ging nur über die Schnittstelle (/api/sicherungen, /api/wiederherstellen).
   Hier steht, was die Oberfläche dafür braucht und was sich ohne Browser
   prüfen lässt: wer was darf (dieselben Rollen wie der Server,
   server/lib/sicherungen.mjs), wie ein Listeneintrag heißt und was eine
   Antwort des Servers für die Leitung bedeutet.
   ========================================================================== */

/** Wer Sicherungen sieht und anlegt (RECHTEMATRIX, server/lib/sicherungen.mjs SICHERUNG_ROLLEN). */
export const SICHERUNG_SEHEN = Object.freeze(["leitung", "kunde"]);
/** Wer zurückspielen darf (WIEDERHERSTELLEN_ROLLEN). */
export const ZURUECKSPIELEN = Object.freeze(["leitung"]);

export const darfSicherungenSehen = (rolle) => SICHERUNG_SEHEN.includes(rolle);
export const darfZurueckspielen = (rolle) => ZURUECKSPIELEN.includes(rolle);

const ZWEI = (n) => String(n).padStart(2, "0");
/** „03.11.2026, 14:05“ in Berliner Zeit; ohne Zeit die Marke selbst. */
export function zeitText(zeit, marke) {
  const d = zeit ? new Date(zeit) : null;
  if (!d || Number.isNaN(d.getTime())) return String(marke || "unbekannt");
  const t = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const w = (typ) => (t.find((x) => x.type === typ) || {}).value || "";
  return `${w("day")}.${w("month")}.${w("year")}, ${ZWEI(w("hour"))}:${w("minute")}`;
}

/** Eine Zeile der Liste: wann, welcher Umfang, von wem. */
export function eintragText(e) {
  const umfang = e.umfang === "raum"
    ? "ganzer Raum — zurückgespielt wird nur dieser Betrieb"
    : "dieser Betrieb";
  const wer = e.automatisch
    ? `automatisch${e.durch ? ` (${e.durch})` : ""}`
    : e.durch ? `von ${e.durch}` : "";
  return { titel: zeitText(e.zeit, e.marke), text: [umfang, wer].filter(Boolean).join(" · ") };
}

/** Was vor dem Zurückspielen im Bestätigungsdialog steht. */
export const BESTAETIGUNG_TEXT = [
  "Der eigene Betrieb wird auf den Stand dieser Sicherung zurückgesetzt. Andere Betriebe im selben Raum bleiben, wie sie sind.",
  "Was seitdem eingetragen wurde, fehlt danach in diesem Betrieb. Der jetzige Stand wird vorher automatisch gesichert — er erscheint danach oben in der Liste.",
  "Vertragsangaben, Protokoll, anonymisierte Personen und Zugänge bleiben, wie sie jetzt sind.",
  "Aufbewahrungsfristen gelten auch für zurückgespielte Daten: Ist die Löschung nach Fristen eingeschaltet, wird Fälliges dabei entfernt; sonst wird es nur gemeldet.",
];

/** Der Hinweis zu den Fristen aus der Antwort (WP-26: fristen = { modus, geloescht, faellig, text }). */
export function fristenHinweis(fristen) {
  if (!fristen || typeof fristen !== "object") return null;
  if (fristen.geloescht) return `Nach den Aufbewahrungsfristen entfernt: ${fristen.text}`;
  if (fristen.faellig === null && fristen.text) return fristen.text;          // ungültige Frist: nichts geräumt
  if (fristen.faellig > 0) return fristen.text;                                 // fällig, aber nicht gelöscht
  return null;
}

/** Hinweis bei einem unlesbaren Bestand (503, BESTAND_UNLESBAR). */
export const UNLESBAR_TEXT = "Ein Teil des gespeicherten Bestands ist gerade nicht lesbar. Zurückspielen ist dann auch "
  + "in der Anwendung nicht möglich — mit Absicht: Sonst ginge der unlesbare Teil verloren. Bitte den Betreiber "
  + "verständigen; der Rückweg steht im Betriebshandbuch (BETRIEB-SICHERUNG, Abschnitt 4a „Unlesbare Datei“).";

/**
 * Was eine Antwort von /api/wiederherstellen für die Leitung bedeutet.
 * @param {{ status: number, daten?: any }} a
 * @returns {{ ok: boolean, titel: string, text: string, neuAnmelden?: boolean, neuLaden?: boolean, fristen?: string|null }}
 */
export function ergebnisMeldung({ status, daten } = { status: 0 }) {
  const d = daten || {};
  if (status === 200) {
    return { ok: true, titel: "Zurückgespielt", neuLaden: true, fristen: fristenHinweis(d.fristen),
      text: "Der Betrieb steht jetzt auf dem Stand der Sicherung. Der vorherige Stand ist als Sicherung abgelegt. "
        + "Bitte neu laden, damit alle Ansichten den neuen Stand zeigen." };
  }
  if (status === 403 && d.neuAnmelden)
    return { ok: false, neuAnmelden: true, titel: "Bitte neu anmelden",
      text: "Zum Zurückspielen muss die Anmeldung jünger als zwanzig Minuten sein. Bitte ab- und wieder anmelden und erneut versuchen." };
  if (status === 409)
    return { ok: false, neuLaden: true, titel: "Inzwischen geändert",
      text: d.text || "Der Bestand hat sich seit dem Laden geändert. Bitte neu laden und erneut bestätigen." };
  if (status === 429)
    return { ok: false, titel: "Gerade zu viele Versuche", text: "Bitte in einigen Minuten noch einmal versuchen." };
  if (status === 503 && d.code === "BESTAND_UNLESBAR")
    return { ok: false, titel: "Nicht lesbar", text: UNLESBAR_TEXT };
  if (status === 0)
    return { ok: false, titel: "Nicht zurückgespielt", text: d.fehler || "Keine Verbindung zum Server." };
  return { ok: false, titel: d.fehler || "Nicht zurückgespielt",
    text: d.text || "Es wurde nichts geändert." };
}
