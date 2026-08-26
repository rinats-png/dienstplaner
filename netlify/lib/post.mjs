/* ==========================================================================
   POST — eine Nachricht hinaus

   Herausgezogen aus zustellung.mjs, unverändert im Verhalten: Bisher war
   der Versand dort eine örtliche Funktion, und nur die Zustellung konnte
   Nachrichten senden. Einladungen und das Zurücksetzen von Passwörtern
   brauchen denselben Weg — und ein zweiter Versandpfad wäre der Anfang
   von zwei Wahrheiten über denselben Vorgang.

   Ohne hinterlegten Schlüssel arbeitet der Versand im Trockenlauf: Er
   meldet Erfolg und kennzeichnet ihn als trocken. So lässt sich jede
   Kette prüfen, bevor ein Vertrag mit dem Versanddienst nötig wird.
   ========================================================================== */

export async function sendeMail(an, betreff, text) {
  const schluessel = process.env.RESEND_API_KEY;
  const absender = process.env.CENTRIC_ABSENDER || "CENTRIC <kein-absender@example.invalid>";
  if (!schluessel) {
    // Trockenlauf: nichts geht hinaus, aber der Ablauf ist prüfbar
    return { ok: true, trocken: true, an, betreff };
  }
  const a = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
    body: JSON.stringify({ from: absender, to: [an], subject: betreff, text }),
  });
  if (!a.ok) {
    const fehler = await a.text();
    return { ok: false, fehler: fehler.slice(0, 200) };
  }
  const d = await a.json();
  return { ok: true, id: d.id };
}

/** Die Adresse, unter der die Anwendung erreichbar ist — für Links in
    Nachrichten. Im Trockenlauf und örtlich genügt die Vorgabe. */
export const anwendungsAdresse = () =>
  process.env.CENTRIC_BASIS || "https://centric-dienstplanung.netlify.app";
