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
                 Derselbe Schalter gibt POST /api/loeschlauf frei (WP-48.4, Löschlauf der
                 Leitung als eigener Weg, lib/loeschlauf.mjs); aus: 404, der Löschlauf läuft
                 wie bisher über den Voll-PUT.
   ========================================================================== */

export const demoAn = () => process.env.CENTRIC_DEMO === "true";
export const teilwegAn = () => process.env.CENTRIC_TEILSPEICHERUNG === "true";

/* --------------------------------------------------------------------------
   MONATSABSCHLUSS SEGMENTWEISE (WP-48.7, Stufe a) — Vorgabe AUS

   CENTRIC_ABSCHLUSS_SEGMENTWEISE  Abschließen, Wiederöffnen und Lohnexport
                 lesen unter der Raumsperre nur den Kern und die Monatsscherben
                 des Jahres bis zum Monat und schreiben Kern + die Scherbe des
                 Monats über den Segmentschreiber (WP-48.2). Ergebnis auf der
                 Platte gleich dem vollen Weg (pruefungen/wp48-7-abschluss-segmentweise.test.js).
                 Aus: der bisherige volle Weg, unverändert. Kein neuer Weg und
                 kein neues Recht; eingeschaltet wird erst nach der Messung auf
                 Staging (WP-48.9) und Betreiberfreigabe.
   Nur genau `true` schaltet ein.
   -------------------------------------------------------------------------- */
export const abschlussSegmentweiseAn = () => process.env.CENTRIC_ABSCHLUSS_SEGMENTWEISE === "true";

/* --------------------------------------------------------------------------
   MONATSABSCHLUSS OHNE SPERRE RECHNEN (WP-48.7, Stufe b) — Vorgabe AUS

   CENTRIC_ABSCHLUSS_OHNE_SPERRE  Nur zusammen mit CENTRIC_ABSCHLUSS_SEGMENTWEISE.
                 Abschließen, Wiederöffnen und Lohnexport lesen Kern + Monate
                 des Jahres bis zum Monat OHNE Raumsperre als Schnappschuss
                 (Stand, Epoche) und rechnen dort; die Sperre gilt nur für
                 „unverändert seit dem Schnappschuss?" und das Schreiben
                 (compare-and-set). Bei Änderung höchstens 3 Versuche, danach
                 der gesperrte Weg der Stufe a. Ergebnis gleich dem vollen Weg
                 (pruefungen/wp48-7-stufe-b.test.js). Aus — oder Stufe a aus —:
                 unverändert. Kein neuer Weg, kein neues Recht.
   Nur genau `true` schaltet ein.
   -------------------------------------------------------------------------- */
export const abschlussOhneSperreAn = () => abschlussSegmentweiseAn() && process.env.CENTRIC_ABSCHLUSS_OHNE_SPERRE === "true";

/* --------------------------------------------------------------------------
   PERSONALIMPORT (IMP-1…IMP-4) — Vorgabe AUS

   CENTRIC_IMPORT_AKTIV  alle Wege /api/import/* (upload, analyse, vorschau,
                 uebernahme, verwerfen). Aus: server.mjs antwortet 404, bevor
                 ein Rumpf gelesen wird; der Handler selbst prüft denselben
                 Schalter als erste Anweisung (kein Parser-Kindprozess, kein
                 Vorgang, kein Schreiben). Der Schalter der Oberfläche
                 (`IMPORT_DATEI_AKTIV` in src/lib/import-schnittstelle.js) ist
                 nur Anzeige und schützt den Server nicht. Einschalten erst
                 nach der Prüfung IMP-9 §13 und Betreiberfreigabe.
   Nur genau `true` schaltet ein; „TRUE", „1", „yes", „true " und alles andere bleiben aus.
   -------------------------------------------------------------------------- */
export const importAn = () => process.env.CENTRIC_IMPORT_AKTIV === "true";

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

/* --------------------------------------------------------------------------
   PFLEGE DER SCHICHTMODELLE JE PERSON (IMP-6 Oberfläche, P2-24 B, Betreiberentscheidung 2026-11-20) — Vorgabe AUS

   CENTRIC_SCHICHTMODELL_PFLEGE  Nur die Anzeige: Ist er an, meldet GET /api/bestand
                 `schichtmodellPflege: true`, und die Oberfläche zeigt unter „Schichtfolge“
                 den Abschnitt „Schichtmodelle je Person“. Aus: kein Abschnitt; gespeicherte
                 Modelle und Zuordnungen bleiben im Bestand und gehen beim Speichern unverändert
                 mit. Der Schreibweg des Servers (Rechte, Prüfungen, historischer Schutz,
                 Protokoll) ist unabhängig vom Schalter und bleibt unverändert (Begründung:
                 docs/acc45/IMP-6-MEHRFACHMODELLE.md, Abschnitt „Schalter“). Kein neuer Weg,
                 kein neues Recht. Einschalten erst mit Betreiberfreigabe.
   Nur genau `true` schaltet ein.
   -------------------------------------------------------------------------- */
export const schichtmodellPflegeAn = () => process.env.CENTRIC_SCHICHTMODELL_PFLEGE === "true";
