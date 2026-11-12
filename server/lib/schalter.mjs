/* ==========================================================================
   SCHALTER FÜR ÖFFENTLICHE ZUGANGSWEGE — Vorgabe jeweils AUS

   Gelesen wird bei jeder Anfrage, nicht beim Laden. An ist ein Schalter nur
   bei genau `true`; „1", „yes", „TRUE", leer und alles andere bleiben aus.

   CENTRIC_DEMO  öffentlicher Demozugang (POST /api/demo, GET /api/demos);
                 siehe docs/DEMO-SCHALTER.md. Unabhängig von
                 CENTRIC_SELBSTSTART und CENTRIC_PUBLIC_REGISTRATION.
   ========================================================================== */

export const demoAn = () => process.env.CENTRIC_DEMO === "true";

/* --------------------------------------------------------------------------
   HILFE-ASSISTENT (WP-I23, F9) — Vorgabe AUS

   CENTRIC_HILFE_ASSISTENT  aus (Vorgabe) | suche | an
     aus    der Weg /api/hilfe/frage antwortet 404, die Oberfläche zeigt nichts
     suche  die Hilfe-Suche über den festen Hilfekorpus; es wird nie ein Modell
            gefragt und nirgends von „KI“ gesprochen
     an     wie suche; zusätzlich darf das Gateway (WP-I13) eine Antwort aus
            genau diesen Hilfetexten formulieren — nur, wenn dort ein Gateway
            eingehängt ist (Einhängepunkt im Hilfe-Modul der Intelligence; heute keines)
   Gelesen wird bei jeder Anfrage; jeder andere Wert bedeutet aus.
   -------------------------------------------------------------------------- */
export const hilfeModus = () => {
  const w = process.env.CENTRIC_HILFE_ASSISTENT;
  return w === "suche" || w === "an" ? w : "aus";
};
