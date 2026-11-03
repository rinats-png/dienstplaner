/* ==========================================================================
   PUSH-ZIEL — welche Push-Endpunkte der Server überhaupt anspricht

   Interne Sicherheitsprüfung 2026-11, Befund SI-01 (SSRF): Der Endpunkt
   einer Push-Anmeldung kommt vom Client. Geprüft wurde nur „beginnt mit
   https://“ — damit konnte jede Person mit Push-Recht (auch in einem selbst
   registrierten Testbetrieb) den Server POST-Anfragen an beliebige Hosts,
   Ports und Pfade schicken lassen, auch an interne Adressen
   (127.0.0.1, 10.x, [::1], Metadatendienste). Die Antwort (404/410 vs.
   Fehler) war zudem ein Ein-Bit-Orakel.

   Jetzt: nur https, nur Port 443 (Standard), keine IP-Literale, keine
   Zugangsdaten in der Adresse und nur Hosts der bekannten Push-Dienste der
   Browser. Zusätzlich zugelassen sind die nach RFC 2606/6761 reservierten
   Namen *.example und *.invalid — sie lösen nie auf, führen also nirgends
   hin, und die Prüfungen verwenden sie als Platzhalter.

   Geprüft wird zweimal: beim Anmelden (zustellung.mjs) und unmittelbar vor
   dem Senden (webpush.mjs) — so sind auch vor dieser Änderung gespeicherte
   Anmeldungen abgedeckt.
   ========================================================================== */

/** Host-Endungen der Push-Dienste (Chrome/Edge/Opera über FCM, Firefox,
 *  Safari/iOS, Windows). Ein Eintrag mit Punkt am Anfang gilt für Unterdomänen. */
export const PUSH_DIENSTE = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  ".push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
  ".wns.windows.com",
];

const RESERVIERT = [".example", ".invalid"];

/**
 * @param {unknown} endpoint
 * @returns {boolean}
 */
export function pushEndpunktErlaubt(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 2000) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.port !== "" && u.port !== "443") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || /^[0-9.]+$/.test(host) || host.includes(":")) return false;   // IP-Literale
  const passt = (e) => e.startsWith(".") ? host.endsWith(e) && host.length > e.length : host === e;
  return PUSH_DIENSTE.some(passt) || RESERVIERT.some(passt);
}
