/* ==========================================================================
   PUSH-ZIEL — welche Push-Endpunkte der Server überhaupt anspricht
   (einzige Quelle der Positivliste; webpush.mjs reicht sie nur weiter)

   Interne Sicherheitsprüfung 2026-11, Befund SI-01 (SSRF): Der Endpunkt
   einer Push-Anmeldung kommt vom Client. Geprüft wurde nur „beginnt mit
   https://“ — damit konnte jede Person mit Push-Recht (auch in einem selbst
   registrierten Testbetrieb) den Server POST-Anfragen an beliebige Hosts,
   Ports und Pfade schicken lassen, auch an interne Adressen
   (127.0.0.1, 10.x, [::1], Metadatendienste). Die Antwort (404/410 vs.
   Fehler) war zudem ein Ein-Bit-Orakel.

   WP-30 (Mail und Push in Produktion) hatte dieselbe Abwehr parallel gebaut;
   beide sind hier zusammengeführt, mit der strengeren Semantik:
   - nur https, nur Standardport, keine Zugangsdaten, keine IP-Literale,
     höchstens 1000 Zeichen;
   - nur Hosts der Push-Dienste der Browser; weitere ausschließlich über
     CENTRIC_PUSH_HOSTS (Komma, Hostname oder *.endung);
   - die nach RFC 2606 nie auflösbaren Namen *.example nur außerhalb der
     Auslieferung (NODE_ENV !== "production"), damit Prüfungen ohne echten
     Anbieter eine Anmeldung bilden können. *.invalid ist nicht zugelassen.

   Review S1 (Parser-Unterschied): Geprüft wurde mit dem WHATWG-Parser
   (new URL), web-push 3.6.x verbindet aber über den alten url.parse. Beide
   lesen manche Adressen verschieden — „https://127.0.0.1;.push.apple.com/x“
   ist für new URL ein Apple-Host, für url.parse 127.0.0.1;
   „https:fcm.googleapis.com/x“ (ohne //) ist für new URL FCM, für
   url.parse ohne Host (Node verbindet dann zu localhost). Deshalb jetzt:
   (1) die Adresse beginnt wörtlich mit „https://“ und enthält nur sichtbare
       ASCII-Zeichen ohne Rückstrich;
   (2) der Hostname besteht nur aus [a-z0-9-]-Labels mit Punkten;
   (3) beide Parser liefern denselben Hostnamen, beide kein Konto in der
       Adresse und beide höchstens Port 443.
   Erst dann zählt die Positivliste.

   Geprüft wird zweimal: beim Anmelden (zustellung.mjs) und unmittelbar vor
   dem Senden (webpush.mjs) — so sind auch früher gespeicherte Anmeldungen
   abgedeckt.
   ========================================================================== */

import { parse as altParse } from "node:url";

/** Hosts der Push-Dienste (Chrome/Edge/Opera über FCM, Firefox,
 *  Safari/iOS, Windows). „*.“ am Anfang gilt nur für Unterdomänen. */
export const PUSH_DIENSTE = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "*.push.services.mozilla.com",
  "web.push.apple.com",
  "*.push.apple.com",
  "*.notify.windows.com",
  "*.wns.windows.com",
];

/** Hostname aus Labels [a-z0-9-], mindestens ein Punkt, Endung ≥ 2 Zeichen. */
export const HOST_FORM = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

const passt = (host, muster) => (muster.startsWith("*.")
  ? host.endsWith(muster.slice(1)) && host.length > muster.length - 1
  : host === muster);

function hostErlaubt(host) {
  const eigene = String(process.env.CENTRIC_PUSH_HOSTS || "").split(",")
    .map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (process.env.NODE_ENV !== "production" && host.endsWith(".example")) return true;
  return [...PUSH_DIENSTE, ...eigene].some((m) => passt(host, m));
}

/** Port leer oder 443 — in beiden Parsern. */
const standardPort = (p) => p === null || p === undefined || p === "" || p === "443";

/**
 * Darf der Server an diesen Endpunkt senden?
 * @param {unknown} endpoint
 * @returns {boolean}
 */
export function pushEndpunktErlaubt(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  /* (1) wörtlich https://, nur sichtbares ASCII, kein Rückstrich */
  if (!endpoint.startsWith("https://") || !/^[\x21-\x7e]+$/.test(endpoint) || endpoint.includes("\\")) return false;
  let neu, alt;
  try { neu = new URL(endpoint); } catch { return false; }
  try { alt = altParse(endpoint); } catch { return false; }
  if (neu.protocol !== "https:" || alt.protocol !== "https:") return false;
  if (neu.username || neu.password || alt.auth) return false;
  if (!standardPort(neu.port) || !standardPort(alt.port)) return false;
  /* (3) beide Parser müssen denselben Host sehen */
  const host = neu.hostname;
  if (typeof alt.hostname !== "string" || alt.hostname !== host) return false;
  /* (2) nur Labels aus [a-z0-9-]; IP-Literale (Endung nur Ziffern) nie */
  if (!HOST_FORM.test(host) || /(^|\.)[0-9]+$/.test(host)) return false;
  return hostErlaubt(host);
}
