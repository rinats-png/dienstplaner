/* ==========================================================================
   INTELLIGENCE-GATEWAY — NOTSCHALTER / KILL-SWITCH (WP-I13, Grundlage für WP-I16)

   Zwei unabhängige Schalter (Prozess und Laufzeit); BEIDE müssen genau "an"
   liefern. Alles andere — "aus", leer, true, 1, "AN", ein Wurf, ein Promise,
   ein fehlender Schalter — heißt AUS (fail closed). Vorgabe: AUS.

   Dieses Modul liest KEINE Umgebung selbst. `modusAusUmgebung(env)` ist eine
   reine Funktion; wer sie mit process.env füttert, ist der (noch nicht
   vorhandene) Verdrahtungscode in server.mjs — und der ist Betreiberfreigabe.
   ========================================================================== */

export const SCHALTER_UMGEBUNGSVARIABLE = "CENTRIC" + "_KI_MODUS";

/** "an" nur bei genau diesem Wert; sonst "aus". */
export function modusAusUmgebung(env) {
  return env && typeof env === "object" && Object.hasOwn(env, SCHALTER_UMGEBUNGSVARIABLE) && env[SCHALTER_UMGEBUNGSVARIABLE] === "an" ? "an" : "aus";
}

/** Liest einen Schalter streng: nur der String "an" zählt. */
export function schalterAn(lies) {
  try {
    if (typeof lies !== "function") return false;
    return lies() === "an";
  } catch {
    return false;
  }
}

/** Vorgabe: beide Schalter aus. */
export const SCHALTER_AUS = Object.freeze({ prozess: () => "aus", laufzeit: () => "aus" });

/** Beide Ebenen müssen an sein. */
export function gatewayAn(schalter) {
  return !!schalter && schalterAn(schalter.prozess) && schalterAn(schalter.laufzeit);
}
