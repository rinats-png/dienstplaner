/* ==========================================================================
   VORLAUF FÜR PRÜFUNGEN GEGEN EINEN SERVER MIT NODE_ENV=production (WP-32d)

   Seit WP-32d verlangt der Server in der Auslieferung für jeden Betreibercode
   einen eingerichteten zweiten Faktor — ohne Abschalter. Die Prüfläufe
   (pruefungen/serverlauf.mjs und Tests, die server.mjs starten) melden sich aber
   mit einem frisch angelegten Betreibercode an. Dieser Vorlauf wird mit
   `node --import` bzw. `import` vor die Prüfung geladen und erledigt das, was
   ein Betreiber täte: Antwortet /api/anmelden mit 403 `zweifaktor: "einrichten"`,
   richtet er den Faktor über dieselbe API ein (beginnen, bestätigen) und meldet
   sich mit dem nächsten Code an. Die Antwort der gelungenen Anmeldung wird je
   Code gemerkt, damit eine Prüfung ihren Betreibertoken beliebig oft „holen“
   kann (ein Code gilt nur einmal je 30 Sekunden); ein Abmelden mit diesem Token
   verwirft sie.

   Nichts davon lockert den Server: Er wird nur über seine öffentliche API
   bedient. Ohne 403 `einrichten` (Pflicht aus, Fremdcode, falscher Code) greift
   der Vorlauf nie ein.
   ========================================================================== */

import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const echtes = globalThis.fetch;
if (echtes && !globalThis.__betreiberFaktorVorlauf) {
  globalThis.__betreiberFaktorVorlauf = true;
  /** Zugangscode → { antwort: { status, text, kopf } } der gelungenen Anmeldung. */
  const gemerkt = new Map();
  const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(Date.now()) + d);
  const antwortAus = (a) => new Response(a.text, { status: a.status, headers: a.kopf });
  const post = (url, opts, rumpf) => echtes(url, { ...opts, method: "POST", body: JSON.stringify(rumpf) });

  globalThis.fetch = async (url, opts) => {
    const adresse = String(url && url.url ? url.url : url);
    if (/\/api\/abmelden(\?|$)/.test(adresse) && opts && opts.headers) {
      const kopf = opts.headers;
      const auth = (typeof kopf.get === "function" ? kopf.get("authorization") : kopf.authorization || kopf.Authorization) || "";
      const token = String(auth).replace(/^Bearer\s+/i, "");
      for (const [c, a] of gemerkt) { try { if (JSON.parse(a.antwort.text).token === token) gemerkt.delete(c); } catch { /* weiter */ } }
      return echtes(url, opts);
    }
    if (!/\/api\/anmelden(\?|$)/.test(adresse) || !opts || typeof opts.body !== "string") return echtes(url, opts);
    let rumpf = null;
    try { rumpf = JSON.parse(opts.body); } catch { return echtes(url, opts); }
    if (!rumpf || typeof rumpf.zugangscode !== "string" || rumpf.zweifaktorAktion || rumpf.zweifaktor) return echtes(url, opts);
    const alt = gemerkt.get(rumpf.zugangscode);
    if (alt) return antwortAus(alt.antwort);

    const erste = await echtes(url, opts);
    if (erste.status !== 403) return erste;
    const text = await erste.clone().text();
    let d = {}; try { d = JSON.parse(text); } catch { return erste; }
    if (d.zweifaktor !== "einrichten") return erste;

    const b = await (await post(url, opts, { zugangscode: rumpf.zugangscode, zweifaktorAktion: "beginnen" })).json();
    if (!b.geheimnis) return erste;
    const f = await post(url, opts, { zugangscode: rumpf.zugangscode, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    if (f.status !== 200) return erste;
    /* Der Bestätigungsschritt ist verbraucht; der nächste Schritt liegt im erlaubten Fenster. */
    const l = await post(url, opts, { zugangscode: rumpf.zugangscode, zweifaktor: code(b.geheimnis, 1) });
    const antwort = { status: l.status, text: await l.text(), kopf: { "content-type": "application/json; charset=utf-8" } };
    if (l.status === 200) gemerkt.set(rumpf.zugangscode, { antwort });
    return antwortAus(antwort);
  };
}
