/* ==========================================================================
   SCHALTER FÜR ÖFFENTLICHE ZUGANGSWEGE — Vorgabe jeweils AUS

   Gelesen wird bei jeder Anfrage, nicht beim Laden. An ist ein Schalter nur
   bei genau `true`; „1", „yes", „TRUE", leer und alles andere bleiben aus.

   CENTRIC_DEMO  öffentlicher Demozugang (POST /api/demo, GET /api/demos);
                 siehe docs/DEMO-SCHALTER.md. Unabhängig von
                 CENTRIC_SELBSTSTART und CENTRIC_PUBLIC_REGISTRATION.
   ========================================================================== */

export const demoAn = () => process.env.CENTRIC_DEMO === "true";
