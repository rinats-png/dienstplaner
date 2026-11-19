/* ==========================================================================
   HILFE-ASSISTENT — EINHÄNGEPUNKT FÜR DAS GATEWAY (WP-I23)

   Der einzige Ort, an dem der Hilfe-Assistent ein Gateway (WP-I13) bekommt.
   Heute gibt es keines: der Server baut kein Gateway, kein Anbieter ist
   verdrahtet, kein Schlüssel gelesen. Die Rückgabe ist null, also „nicht
   verfügbar“ — die Hilfe zeigt dann die gefundenen Hilfetexte allein.

   Ein späteres Paket (Betreiberfreigabe E-25/E-26, Anbieter, Auftragsverarbeitung)
   baut hier ein echtes Gateway: erzeugeGateway(...) mit Schalter, Limits,
   Kontingent, Schlüsselbund und Registry, und gibt es zurück. Der Aufrufer
   (assistent.mjs) ruft nur `ausfuehren(sitzung, { funktion: "F9", eingabe })`.
   ========================================================================== */

/** @returns {{ ausfuehren: (sitzung: any, anfrage: any) => Promise<any> } | null} */
export const hilfeGateway = () => null;
