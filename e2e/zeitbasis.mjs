/* QS-ZEIT (docs/acc45/QS-ZEITABHAENGIGKEIT.md): EINE gemeinsame Zeitbasis für Server, Browser und Testdaten der
   Playwright-Suite.

   Befund (2026-11-15, CI-Job browser-abnahme): B8 rechnete den Krankheitstag aus der echten Uhr (heute + 3) und trug dort
   einen Frühdienst ein. Der Demo-Bestand legt die Schichtfolge aber am Kalender fest (Nordwacht, Vorlage v5, Anker
   montag(Jahr-01-01), 35-Tage-Zyklus): Am 2026-11-14 traf heute + 3 = 11-17 auf einen freien Vortag, am 2026-11-15 traf
   11-18 auf den Spätdienst vom 11-17 (bis 22:00) — Frühdienst 06:00 = 8 h Ruhezeit, der Server wies das zu Recht ab (403).

   Darum laufen alle drei Uhren auf demselben festen Abnahmezeitpunkt:
   - Server: e2e/uhr-vorlauf.mjs (node --import, NUR der Testserver aus global-setup.mjs) versetzt Date um UHR_VERSATZ_VAR.
   - Browser: dieselbe Funktion uhrVersetzen als Init-Skript jeder Seite (hilfen.mjs, zweite Seiten, global-setup.mjs) —
     auch der Demo-Bestand entsteht im Browser und richtet sich damit nach demselben Tag.
   - Testcode: abnahmeHeute()/jetzt() statt new Date().
   Die Uhr läuft ab dem Abnahmezeitpunkt weiter (Versatz, kein Standbild): Zeitgeber, Netz und Wartezeiten bleiben echt.
   Ein Betriebstag ist der Berliner Kalendertag (server/lib/betriebszeit.mjs, WP-ZEIT).

   Staging-Gate (E2E_EXTERN_ADMIN, fremder Container): dessen Uhr lässt sich nicht stellen — dann Versatz 0, und die Suite
   läuft mit der echten Uhr (Restrisiko, im QS-Dokument vermerkt). */
import { betriebstag } from "../server/lib/betriebszeit.mjs";

/** Fester Abnahmezeitpunkt: Samstag, 2026-11-14, 10:00 Europe/Berlin (09:00 UTC). An diesem Tag lief die Suite in der CI
 *  grün (#303); fern von Mitternacht, Monatsende und Zeitumstellung. */
export const ABNAHME_ZEITPUNKT = "2026-11-14T09:00:00.000Z";
export const ABNAHMETAG = "2026-11-14";

/** Umgebungsvariable mit dem Versatz in Millisekunden (Abnahmezeitpunkt − echte Uhr beim Start der Suite). */
export const UHR_VERSATZ_VAR = "CENTRIC_E2E_UHR_VERSATZ";

/** Versatz für diesen Prozess (von global-setup.mjs gesetzt; 0 = echte Uhr). */
export function versatzMs() {
  const v = Number(process.env[UHR_VERSATZ_VAR] || 0);
  return Number.isFinite(v) ? v : 0;
}

/** Jetzt nach der gemeinsamen Zeitbasis. */
export const jetzt = () => new Date(Date.now() + versatzMs());

/** Berliner Betriebstag eines Zeitpunkts (Vorgabe: jetzt nach der Zeitbasis). */
export const abnahmeHeute = (d = jetzt()) => betriebstag(d);

/** Kalendertag n Tage nach `iso` (UTC-Mittag, frei von Zeitumstellung). */
export const tagPlus = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Versetzt `Date` im Zielbereich um `versatz` ms: `new Date()`, `Date.now()` und `Date()` laufen ab Abnahmezeitpunkt weiter;
 * `new Date(x)`, `Date.parse`, `Date.UTC` und `instanceof Date` bleiben unverändert. Selbstständig (keine Importe), weil sie
 * als Init-Skript in den Browser serialisiert wird. Zweimal angewandt: wirkt nur einmal.
 * @param {number|string} versatz @param {any} [ziel]
 */
export function uhrVersetzen(versatz, ziel) {
  const g = ziel || globalThis;
  const v = Number(versatz) || 0;
  if (!v || g.Date.__centricVersatz !== undefined) return;
  const Echt = g.Date;
  const jetztMs = () => Echt.now() + v;
  const Versetzt = new Proxy(Echt, {
    construct(z, a, neu) { return Reflect.construct(z, a.length ? a : [jetztMs()], neu === Versetzt ? z : neu); },
    apply() { return new Echt(jetztMs()).toString(); },
    get(z, k) {
      if (k === "now") return jetztMs;
      if (k === "__centricVersatz") return v;
      return Reflect.get(z, k);
    },
  });
  g.Date = Versetzt;
}
