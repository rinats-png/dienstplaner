/* ==========================================================================
   INTELLIGENCE-GATEWAY — LIVE-ANBIETER: NUR EIN STUMPF (WP-I18 steht aus)

   Dieses Modul spricht NICHT mit einem Anbieter. Es gibt keinen Netzcode, keinen
   Anbietertreiber und keine Anbieteradresse. `erzeuge` wirft immer
   „nicht freigegeben“.

   Wer später (WP-I18, nach ausdrücklicher Betreiberfreigabe: Anbieterbedingungen,
   AVV, DSFA, Mitbestimmung, E-25) einen echten Adapter einhängt, ersetzt NUR den
   Rumpf von `erzeuge` und darf das Netz nur hier verwenden.

   INVARIANTEN
   L1  Ohne Umgebungs-Schalter UND Schlüssel wirft erzeuge „nicht freigegeben“.
   L2  Auch mit beiden: noch kein Netzcode — wirft „nicht freigegeben (WP-I18)“.
   L3  Das Modul liest KEINE Umgebung selbst (kein process.env): der Aufrufer
       übergibt `env`. server.mjs verdrahtet es nicht.
   L4  Der Schlüssel steht nur in einer Closure; er erscheint in keiner
       Eigenschaft, keiner Fehlermeldung, keinem toJSON, keiner Ausgabe.
   ========================================================================== */

import { AnbieterFehler } from "./anbieter.mjs";

/* Namen bewusst zusammengesetzt: noch kein Server liest sie; sie gehören erst mit der Verdrahtung (Betreiberfreigabe) ins Betriebshandbuch und in .env.example. */
export const LIVE_SCHALTER_NAME = "CENTRIC" + "_KI_ANBIETER_LIVE";
export const LIVE_SCHLUESSEL_NAME = "CENTRIC" + "_KI_ANBIETER_SCHLUESSEL";

/**
 * @param {{ env?: Record<string, string|undefined> }} [o]
 */
export function erzeugeLiveAnbieter(o = {}) {
  const env = o.env && typeof o.env === "object" ? o.env : {};
  const schlussDa = typeof env[LIVE_SCHLUESSEL_NAME] === "string" && env[LIVE_SCHLUESSEL_NAME].length >= 20;
  const schalterAn = env[LIVE_SCHALTER_NAME] === "ja";
  const freigabeGesetzt = schlussDa && schalterAn;
  return Object.freeze({
    id: "live-stumpf",
    modellOrt: /** @type {const} */ ("extern"),
    async erzeuge() {
      if (!freigabeGesetzt) throw new AnbieterFehler("nicht_freigegeben", "nicht freigegeben");
      throw new AnbieterFehler("nicht_freigegeben", "nicht freigegeben (Live-Anbindung WP-I18 fehlt)");
    },
    toJSON() { return { id: "live-stumpf" }; },
  });
}
