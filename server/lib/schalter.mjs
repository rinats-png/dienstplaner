/* ==========================================================================
   SCHALTER FÜR ÖFFENTLICHE ZUGANGSWEGE — Vorgabe jeweils AUS

   Gelesen wird bei jeder Anfrage, nicht beim Laden. An ist ein Schalter nur
   bei genau `true`; „1", „yes", „TRUE", leer und alles andere bleiben aus.

   CENTRIC_DEMO  öffentlicher Demozugang (POST /api/demo, GET /api/demos);
                 siehe docs/DEMO-SCHALTER.md. Unabhängig von
                 CENTRIC_SELBSTSTART und CENTRIC_PUBLIC_REGISTRATION.
   CENTRIC_TEILSPEICHERUNG  Teilspeicherung je Segment (WP-48.3, POST /api/bestand/teile und
                 `teile` im GET /api/bestand). Aus: den Weg gibt es nicht (404), GET ohne
                 `teile`, die Oberfläche bleibt beim Voll-PUT. Kein öffentlicher Weg, aber
                 ein neuer Schreibweg — deshalb dieselbe strenge Regel. Einschalten erst mit
                 der Oberfläche (WP-48.5) und nach Betreiberfreigabe.
   ========================================================================== */

export const demoAn = () => process.env.CENTRIC_DEMO === "true";
export const teilwegAn = () => process.env.CENTRIC_TEILSPEICHERUNG === "true";
