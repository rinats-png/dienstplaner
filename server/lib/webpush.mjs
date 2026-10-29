/* ==========================================================================
   WEB PUSH — eine Mitteilung an ein Gerät

   Herausgezogen aus zustellung.mjs (Commit 4), unverändert im Verhalten.
   Web Push braucht ein Schlüsselpaar (VAPID). Der öffentliche Teil geht an
   den Browser, der private bleibt hier. Fehlt er, läuft der Versand trocken.
   ========================================================================== */

/**
 * @param {any} anmeldung  die gespeicherte Push-Anmeldung (Push-Register)
 * @param {string} titel
 * @param {string} text
 * @param {string|null} ziel
 * @returns {Promise<{ok: boolean, trocken?: boolean, erloschen?: boolean, fehler?: string}>}
 */
export async function sendePush(anmeldung, titel, text, ziel) {
  const oeff = process.env.VAPID_PUBLIC, priv = process.env.VAPID_PRIVATE;
  if (!oeff || !priv) return { ok: true, trocken: true };
  try {
    const webpush = await import("web-push");
    webpush.default.setVapidDetails(
      process.env.VAPID_KONTAKT || "mailto:kein-kontakt@example.invalid", oeff, priv);
    await webpush.default.sendNotification(anmeldung,
      JSON.stringify({ titel, text, ziel }));
    return { ok: true };
  } catch (e) {
    // 404 und 410 heißen: die Anmeldung ist erloschen, sie darf gelöscht werden
    const weg = e && (e.statusCode === 404 || e.statusCode === 410);
    return { ok: false, erloschen: weg, fehler: String(e && e.message || e).slice(0, 200) };
  }
}
