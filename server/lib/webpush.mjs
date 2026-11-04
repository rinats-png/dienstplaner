/* ==========================================================================
   WEB PUSH — eine Mitteilung an ein Gerät

   Web Push braucht ein Schlüsselpaar (VAPID). Der öffentliche Teil geht an
   den Browser, der private bleibt hier. Fehlt er, läuft der Versand trocken.

   WP-30 (Mail und Push in Produktion):
   - Antwortklassen statt nur „erloschen“: erloschen (404/410: Anmeldung
     löschen), dauerhaft (400/413: dieser Inhalt geht nie), konfiguration
     (401/403: VAPID-Paar passt nicht — Betreiberproblem, später erneut),
     temporaer (429, 5xx, Netz: später erneut). Ohne Klasse gilt temporär.
   - Der Endpunkt, an den der Server sendet, kommt vom Gerät. Ohne
     Einschränkung wäre das ein Weg für Anfragen des Servers an beliebige
     https-Ziele (SSRF). Erlaubt sind die Dienste der Browserhersteller;
     weitere über CENTRIC_PUSH_HOSTS (Komma, Hostname oder *.endung).
   - topic = Kennung der Mitteilung: Ein unzugestelltes Duplikat ersetzt das
     vorige, statt zweimal anzukommen.
   - Inhalt ist die minimale Nutzlast {titel, text, ziel}; nichts davon wird
     im Dienstarbeiter zwischengespeichert (public/sw.js).
   ========================================================================== */

const ANBIETER = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com",
  "*.push.services.mozilla.com", "web.push.apple.com", "*.push.apple.com", "*.notify.windows.com"];

function hostErlaubt(host) {
  const h = host.toLowerCase();
  const eigene = String(process.env.CENTRIC_PUSH_HOSTS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  /* „.example“ ist nach RFC 2606 nie auflösbar. Nur außerhalb der Auslieferung
     zugelassen, damit Prüfungen ohne echten Anbieter eine Anmeldung bilden. */
  if (process.env.NODE_ENV !== "production" && (h === "example" || h.endsWith(".example"))) return true;
  return [...ANBIETER, ...eigene].some((m) => (m.startsWith("*.") ? h.endsWith(m.slice(1)) && h.length > m.length - 1 : h === m));
}

/**
 * Darf der Server an diesen Endpunkt senden? https, keine Zugangsdaten in der
 * Adresse, Standardport, Host eines bekannten Push-Dienstes.
 * @param {unknown} endpunkt
 */
export function pushEndpunktErlaubt(endpunkt) {
  if (typeof endpunkt !== "string" || endpunkt.length > 1000) return false;
  let u;
  try { u = new URL(endpunkt); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  return hostErlaubt(u.hostname);
}

/** Aus der Antwort des Push-Dienstes: welche Klasse von Fehler? */
export function pushKlasse(status) {
  if (status === 404 || status === 410) return "erloschen";
  if (status === 400 || status === 413) return "dauerhaft";
  if (status === 401 || status === 403) return "konfiguration";
  return "temporaer";
}

/* Nachtrag 2 (F2): Frist für eine Anfrage an den Push-Dienst. web-push bricht
   die Anfrage nach `timeout` ab; zusätzlich endet das Warten hier spätestens
   eine Sekunde danach — ein hängender Dienst hält weder den Versand noch den
   Takt (nachfassen) auf. Eine Zeitüberschreitung ist vorübergehend. */
export const PUSH_FRIST_MS = 10_000;

/**
 * @param {any} anmeldung  die gespeicherte Push-Anmeldung (Push-Register)
 * @param {string} titel
 * @param {string} text
 * @param {string|null} ziel
 * @param {{topic?: string, dringend?: boolean}} [opt]  dringend: Urgency „high“ (Notruf, dringende Arten — Nachtrag 2, F4)
 * @returns {Promise<{ok: boolean, trocken?: boolean, erloschen?: boolean, klasse?: string, status?: number, fehler?: string}>}
 */
export async function sendePush(anmeldung, titel, text, ziel, opt = {}) {
  const oeff = process.env.VAPID_PUBLIC, priv = process.env.VAPID_PRIVATE;
  if (!oeff || !priv) return { ok: true, trocken: true };
  if (!anmeldung || !pushEndpunktErlaubt(anmeldung.endpoint))
    return { ok: false, erloschen: true, klasse: "erloschen", fehler: "endpunkt-nicht-erlaubt" };
  /** @type {any} */
  let wecker;
  try {
    const webpush = await import("web-push");
    webpush.default.setVapidDetails(
      process.env.VAPID_KONTAKT || "mailto:kein-kontakt@example.invalid", oeff, priv);
    const zeitUm = new Promise((_, nein) => {
      wecker = setTimeout(() => nein(Object.assign(new Error("zeitueberschreitung"), { zeitUm: true })), PUSH_FRIST_MS + 1000);
    });
    await Promise.race([webpush.default.sendNotification(anmeldung,
      JSON.stringify({ titel, text, ziel }),
      { TTL: 24 * 60 * 60, urgency: opt.dringend ? "high" : "normal", timeout: PUSH_FRIST_MS,
        ...(opt.topic ? { topic: opt.topic } : {}) }), zeitUm]);
    return { ok: true };
  } catch (e) {
    const status = e && Number.isInteger(e.statusCode) ? e.statusCode : undefined;
    const klasse = status === undefined ? "temporaer" : pushKlasse(status);
    /* Nur der Statuscode — der Text des Dienstes enthält den Endpunkt. */
    return { ok: false, erloschen: klasse === "erloschen", klasse, status,
      fehler: status !== undefined ? `http-${status}` : e && e.zeitUm ? "zeit" : "netz" };
  } finally {
    clearTimeout(wecker);
  }
}
