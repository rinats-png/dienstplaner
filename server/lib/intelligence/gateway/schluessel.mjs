/* ==========================================================================
   INTELLIGENCE-GATEWAY — SCHLÜSSELBUND: GETRENNTE SCHLÜSSEL MIT ROTATION (WP-I13)

   Bedingung 2 aus wp-i11-nachweis.md: Alias-Schlüssel (Pseudonyme im
   Faktenpaket) und MAC-Schlüssel der Alias-Karte (Lauf-Store, WP-I14) sind
   GETRENNTE Geheimnisse; der MAC-Schlüssel lässt sich ohne Ausfall wechseln.

   Dieses Modul liest KEINE Umgebung selbst (kein process.env): der Aufrufer
   übergibt `env` (Muster wie anbieter-live.mjs). Kein Server verdrahtet es;
   die Variablen gehören erst mit der Verdrahtung (Betreiberfreigabe) in
   .env.example und Betriebshandbuch. Im Repo steht kein Schlüssel; die Tests
   erzeugen ihre zur Laufzeit.

     Variable (Namen unten)      Inhalt
     …_ALIAS_SCHLUESSEL          Hex, ≥ 32 Byte, Pflicht
     …_MAC_SCHLUESSEL            Hex, ≥ 32 Byte, Pflicht
     …_MAC_SCHLUESSEL_VORHER     Hex, ≥ 32 Byte, nur während eines Wechsels

   Rotation (MAC): neuen Schlüssel als aktiv setzen, den bisherigen als
   VORHER. Geladen wird mit aktiv, sonst mit vorher (dann `umschluesseln:
   true` — der Aufrufer legt die Karte mit dem aktiven Schlüssel neu ab).
   Nach Ablauf der Aufbewahrung (WP-I14) VORHER entfernen.
   Rotation (Alias): einfach ersetzen. Alias gelten je Auftragskontext; eine
   gespeicherte Antwort mit alten Alias fällt bei der Rückübersetzung durch
   (Rückfall, kein Leck). Die Kennung in `stand()` zeigt den Wechsel an.

   INVARIANTEN
   K1  Fehlt ein Pflichtschlüssel oder ist einer ungültig → KI_INTERN; es gibt
       keinen Vorgabewert und keinen Zufallsersatz (fail closed).
   K2  Getrennt: kein Schlüssel gleicht einem anderen (Alias, MAC, MAC vorher).
   K3  Platzhalter werden abgelehnt: zu kurz, kein Hex, weniger als 16
       verschiedene Bytes (gleiche Bytes, kurze Wiederholung wie deadbeef…).
   K4  Schlüssel stehen nur in der Closure: nie in Eigenschaft, Meldung, JSON,
       String oder inspect; herausgegeben werden nur Kopien.
   K5  Umgebungswerte nur als eigene Eigenschaft (keine Prototypkette).
   K6  (WP-I18) Gateway und Ergebnis-Speicher nehmen NUR einen Schlüsselbund aus
       erzeugeSchluesselbund an (Marke, schluesselbundPruefen) — keine lose
       Schlüsselfunktion.
   K7  (WP-I18) Einträge des Ergebnis-Speichers werden mit dem AKTIVEN MAC-
       Schlüssel signiert (`signieren`). `pruefen` nimmt erst den aktiven, dann
       den vorherigen Schlüssel — der vorherige dient NUR noch zum Prüfen
       bestehender Einträge, nie zum Signieren neuer. Der Alias-Schlüssel
       signiert nie etwas (Trennung Alias ↔ MAC).
   ========================================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";
import { KiFehler } from "../fehler.mjs";
import { AliasKarte } from "../alias.mjs";

/* Namen bewusst zusammengesetzt (wie anbieter-live.mjs): noch kein Server liest sie. */
const P = "CENTRIC" + "_KI_";
export const SCHLUESSEL_NAMEN = Object.freeze({
  alias: P + "ALIAS_SCHLUESSEL",
  mac: P + "MAC_SCHLUESSEL",
  macVorher: P + "MAC_SCHLUESSEL_VORHER",
});
const MIN_BYTES = 32;
const MIN_VERSCHIEDEN = 16;

function lesen(env, name, pflicht) {
  const v = Object.hasOwn(env, name) ? env[name] : undefined;
  if (v === undefined || v === "") {
    if (pflicht) throw new KiFehler("KI_INTERN", "Intelligence-Schlüssel fehlt.");
    return null;
  }
  if (typeof v !== "string" || v.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(v) || v.length < MIN_BYTES * 2)
    throw new KiFehler("KI_INTERN", "Intelligence-Schlüssel ungültig.");
  const b = Buffer.from(v, "hex");
  if (new Set(b).size < MIN_VERSCHIEDEN) throw new KiFehler("KI_INTERN", "Intelligence-Schlüssel ist ein Platzhalter.");
  return b;
}

const kennung = (b) => createHmac("sha256", b).update("centric-ki-schluessel-kennung/v1").digest("hex").slice(0, 12);
const kopie = (b) => new Uint8Array(b);
const echt = new WeakSet();
const MAC_MUSTER = /^[0-9a-f]{64}$/;
const macBilden = (k, zweck, text) => createHmac("sha256", k).update(`centric-ki-mac/v1|${zweck}|`).update(text).digest("hex");
const ZWECK = /^[a-z][a-z0-9-]{0,31}$/;

/** K6: nur ein Schlüsselbund aus erzeugeSchluesselbund (Marke), sonst KI_INTERN. */
export function schluesselbundPruefen(b) {
  if (!b || typeof b !== "object" || !echt.has(b)) throw new KiFehler("KI_INTERN", "Intelligence-Schlüsselbund ungültig.");
  return b;
}

/** @param {{ env?: Record<string, string|undefined> }} [o] */
export function erzeugeSchluesselbund(o = {}) {
  const env = o && o.env && typeof o.env === "object" ? o.env : {};
  const alias = lesen(env, SCHLUESSEL_NAMEN.alias, true);
  const mac = lesen(env, SCHLUESSEL_NAMEN.mac, true);
  const macVorher = lesen(env, SCHLUESSEL_NAMEN.macVorher, false);
  const alle = [alias, mac, macVorher].filter(Boolean);
  for (let i = 0; i < alle.length; i++) for (let j = i + 1; j < alle.length; j++)
    if (alle[i].equals(alle[j])) throw new KiFehler("KI_INTERN", "Intelligence-Schlüssel sind nicht getrennt.");
  const st = Object.freeze({
    alias: Object.freeze({ kennung: kennung(alias), vorher: false }),
    mac: Object.freeze({ kennung: kennung(mac), vorher: !!macVorher }),
  });

  const bund = Object.freeze({
    /** Für das Gateway (Faktenpaket, Alias) — jedes Mal eine Kopie. */
    aliasSchluessel: () => kopie(alias),
    /** K7: MAC über `text` mit dem AKTIVEN MAC-Schlüssel (nie mit dem vorherigen, nie mit dem Alias-Schlüssel). */
    signieren(zweck, text) {
      if (typeof zweck !== "string" || !ZWECK.test(zweck) || typeof text !== "string") throw new KiFehler("KI_INTERN", "Signatur ungültig.");
      return macBilden(mac, zweck, text);
    },
    /** K7: prüft erst mit dem aktiven, dann mit dem vorherigen MAC-Schlüssel. → { ok, vorher } */
    pruefen(zweck, text, wert) {
      if (typeof zweck !== "string" || !ZWECK.test(zweck) || typeof text !== "string" || typeof wert !== "string" || !MAC_MUSTER.test(wert))
        return { ok: false, vorher: false };
      const ist = Buffer.from(wert, "hex");
      const gleich = (k) => timingSafeEqual(Buffer.from(macBilden(k, zweck, text), "hex"), ist);
      if (gleich(mac)) return { ok: true, vorher: false };
      if (macVorher && gleich(macVorher)) return { ok: true, vorher: true };
      return { ok: false, vorher: false };
    },
    macSchluessel: () => kopie(mac),
    /** Karte für den Lauf-Store ablegen (immer mit dem aktiven MAC-Schlüssel). */
    karteAblegen(karte) {
      if (!(karte instanceof AliasKarte)) throw new KiFehler("KI_INTERN", "Keine Alias-Karte.");
      return karte.fuerServerSpeicher(kopie(mac));
    },
    /** Karte laden: erst aktiv, dann vorher (Rotation). Sonst KI_NICHT_GEFUNDEN. */
    karteLaden(d) {
      try { return { karte: AliasKarte.ausServerSpeicher(d, kopie(mac)), umschluesseln: false }; } catch (e) {
        if (!macVorher) throw e;
      }
      return { karte: AliasKarte.ausServerSpeicher(d, kopie(macVorher)), umschluesseln: true };
    },
    /** Nur Kennungen (HMAC-Ableitung, nicht umkehrbar) — für Protokoll und Betriebshandbuch. */
    stand: () => st,
    toJSON: () => ({ schluesselbund: st }),
    toString: () => "[Schluesselbund]",
    [Symbol.for("nodejs.util.inspect.custom")]: () => "[Schluesselbund]",
  });
  echt.add(bund);
  return bund;
}
