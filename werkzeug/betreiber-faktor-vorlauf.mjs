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

  /** Verwalterschlüssel → { geheimnis, nachweis } (WP-32d, Review 1: auch /einrichten verlangt in production den Faktor). */
  const verwalter = new Map();
  /** Der Ursprungsschlüssel (CENTRIC_ADMIN, wenn bekannt) oder ein benanntes Konto (V-…). */
  const istVerwalterSchluessel = (k) => (process.env.CENTRIC_ADMIN ? k === process.env.CENTRIC_ADMIN : true) || /^V-/.test(String(k));
  /** Für Werkzeuge, die den Nachweis als Kopf selbst mitschicken (zugaenge-anlegen.sh: CENTRIC_ZWEIFAKTOR_NACHWEIS). */
  globalThis.__verwalterNachweis = (schluessel) => { const v = verwalter.get(schluessel); return v ? v.nachweis : null; };
  const kopfMit = (opts, zusatz) => {
    const k = opts && opts.headers ? (typeof opts.headers.entries === "function" ? Object.fromEntries(opts.headers.entries()) : { ...opts.headers }) : {};
    return { ...k, ...zusatz };
  };
  /** Prüfläufe auf der eigenen Maschine (serverlauf.mjs reicht Datenordner und Pfeffer durch): direkt in der Ablage
      einrichten, ohne die Zähler von /einrichten zu belasten (20 Aufrufe je 10 Minuten insgesamt). */
  const einrichtenDirekt = async (schluessel) => {
    if (!process.env.CENTRIC_DATEN || !process.env.CENTRIC_PFEFFER || !istVerwalterSchluessel(schluessel)) return null;
    try {
      const { getStore } = await import("../server/lib/ablage.mjs");
      const { zweifaktorBeginnen, zweifaktorBestaetigen, nachweisAusstellen } = await import("../server/lib/zweifaktor.mjs");
      const { createHash } = await import("node:crypto");
      const store = getStore({ name: "centric", consistency: "strong" });
      const id = createHash("sha256").update(String(schluessel)).digest("hex");
      const b = await zweifaktorBeginnen(store, id, "Prüflauf");
      if (!b.geheimnis) return null;
      const f = await zweifaktorBestaetigen(store, id, code(b.geheimnis));
      if (!f.ok) return null;
      const stand = { geheimnis: b.geheimnis, nachweis: (await nachweisAusstellen(store, id)).nachweis, letzter: schrittZu(Date.now()) };
      verwalter.set(schluessel, stand);
      return stand;
    } catch (e) { return null; }
  };
  const einrichtenVerwalter = async (adresse, opts, schluessel) => {
    const direkt = await einrichtenDirekt(schluessel);
    if (direkt) return direkt;
    const basis = new URL(adresse).origin;
    const z = (rumpf) => echtes(`${basis}/einrichten/zweifaktor`, { ...opts, method: "POST", headers: kopfMit(opts, { "content-type": "application/json" }),
      body: JSON.stringify({ verwaltung: schluessel, ...rumpf }) });
    const b = await (await z({ aktion: "beginnen" })).json();
    if (!b.geheimnis) return null;
    const f = await z({ aktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    if (f.status !== 200) return null;
    const n = await (await z({ aktion: "nachweis", zweifaktor: code(b.geheimnis, 1) })).json();
    if (!n.nachweis) return null;
    const stand = { geheimnis: b.geheimnis, nachweis: n.nachweis, letzter: schrittZu(Date.now()) + 1 };
    verwalter.set(schluessel, stand);
    return stand;
  };

  globalThis.fetch = async (url, opts) => {
    const adresse = String(url && url.url ? url.url : url);
    const pfadTeil = new URL(adresse, "http://x").pathname;
    if (pfadTeil === "/einrichten" || (pfadTeil.startsWith("/einrichten/") && pfadTeil !== "/einrichten/zweifaktor")) {
      let schluessel = null;
      try { schluessel = opts && typeof opts.body === "string" ? JSON.parse(opts.body).verwaltung : null; } catch { /* kein JSON */ }
      if (!schluessel && opts && opts.headers) {
        const kopf = kopfMit(opts, {});
        const auth = kopf.authorization || kopf.Authorization || "";
        if (/^Bearer\s+/i.test(auth)) schluessel = auth.replace(/^Bearer\s+/i, "");
      }
      if (!schluessel) return echtes(url, opts);
      const mit = (st) => ({ ...opts, headers: kopfMit(opts, { "x-centric-zweifaktor-nachweis": st.nachweis }) });
      /* Gleich zu Beginn einrichten (kein Probeaufruf): /einrichten ist insgesamt auf 20 Aufrufe je 10 Minuten
         begrenzt, und die Prüfläufe brauchen davon fast alle. */
      /* Nur der Verwalterschlüssel der Prüfung (CENTRIC_ADMIN, wenn bekannt) — ein Betreiber-Token als Bearer ist keiner. */
      /* Hat ein übergeordneter Prozess den Faktor schon eingerichtet (staging-proben.mjs startet die Proben als
         eigene Prozesse), kennt dieser Prozess das Geheimnis nicht und kann ihn nicht noch einmal einrichten.
         Er bekommt den Nachweis durchgereicht (CENTRIC_ZWEIFAKTOR_NACHWEIS, wie bei zugaenge-anlegen.sh). */
      if (!verwalter.has(schluessel) && istVerwalterSchluessel(schluessel) && process.env.CENTRIC_ZWEIFAKTOR_NACHWEIS)
        verwalter.set(schluessel, { geheimnis: null, nachweis: process.env.CENTRIC_ZWEIFAKTOR_NACHWEIS, letzter: schrittZu(Date.now()) });
      if (!verwalter.has(schluessel) && istVerwalterSchluessel(schluessel)) {
        verwalter.set(schluessel, null);
        await einrichtenVerwalter(adresse, opts, schluessel);
      }
      const bekannt = verwalter.get(schluessel);
      /* Verwalterkonten anlegen/sperren verlangt einen frischen Code (kein Nachweis): nächster ungenutzter Schritt
         im erlaubten Fenster; ist keiner frei, bis zum nächsten Schritt warten (höchstens 30 s). */
      const methode = String((opts && opts.method) || "GET").toUpperCase();
      if (bekannt && bekannt.geheimnis && pfadTeil === "/einrichten/verwalter" && (methode === "POST" || methode === "DELETE") && typeof opts.body === "string") {
        let schritt = Math.max(bekannt.letzter + 1, schrittZu(Date.now()) - 1);
        while (schritt > schrittZu(Date.now()) + 1) await new Promise((r) => setTimeout(r, 1000));
        bekannt.letzter = schritt;
        const rumpf = { ...JSON.parse(opts.body), zweifaktor: hotp(base32Dekodieren(bekannt.geheimnis), schritt) };
        return echtes(url, { ...mit(bekannt), body: JSON.stringify(rumpf) });
      }
      return echtes(url, bekannt ? mit(bekannt) : opts);
    }
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
