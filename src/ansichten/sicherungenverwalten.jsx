/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */

import { useState, useEffect } from "react";
import { darfZurueckspielen, ergebnisMeldung, eintragText } from "../sicherungen-ui.js";
import { Card, CardHead, Laden, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { Sheet } from "../ui/leisten.jsx";
import { BestaetigungsText } from "./bestaetigungstext.jsx";

export function SicherungenVerwalten({ rolle, laden, zurueckspielen, vorgabe = null }) {
  const [liste, setListe] = useState(vorgabe ? vorgabe.liste || [] : null);
  const [fehler, setFehler] = useState(vorgabe ? vorgabe.fehler || null : null);
  const [auswahl, setAuswahl] = useState(vorgabe ? vorgabe.auswahl || null : null);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const zurueck = darfZurueckspielen(rolle);
  /* Fehlt eine Aktion, ist das ein Programmfehler — und soll sichtbar sein, nicht
     als ewiges „Lädt …" oder als TypeError beim Klick enden (WP-25, Review). */
  const nichtVerdrahtet = !vorgabe && (typeof laden !== "function" || (zurueck && typeof zurueckspielen !== "function"));

  useEffect(() => {
    if (vorgabe || typeof laden !== "function") return undefined;
    let aktiv = true;
    laden().then((l) => { if (aktiv) { setListe(l); setFehler(null); } },
      (e) => { if (aktiv) { setListe([]); setFehler(String((e && e.message) || e)); } });
    return () => { aktiv = false; };
  }, [laden, vorgabe]);

  const bestaetigt = async () => {
    if (!auswahl || laeuft) return;
    setLaeuft(true);
    let a;
    try { a = await zurueckspielen(auswahl.marke); }
    catch (e) { a = { status: 0, daten: { fehler: String((e && e.message) || e) } }; }
    setLaeuft(false);
    setErgebnis(ergebnisMeldung(a));
  };

  return (
    <Card>
      <CardHead>Sicherungen</CardHead>
      <div style={{ padding: "var(--pad-y) var(--pad-x)", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, color: C.dim }}>
          {zurueck
            ? "Kopien des eigenen Betriebs. Eine davon lässt sich zurückspielen — vorher wird der jetzige Stand gesichert."
            : "Kopien des eigenen Betriebs. Zurückspielen kann nur die Leitung."}
        </div>
        {nichtVerdrahtet && <div role="alert" style={{ fontSize: 13, color: C.danger }}>
          Die Sicherungen sind in dieser Fassung nicht angeschlossen (Programmfehler). Bitte den Betreiber verständigen.</div>}
        {fehler && <div role="alert" style={{ fontSize: 13, color: C.danger }}>{fehler}</div>}
        {liste === null && !fehler && !nichtVerdrahtet && <Laden zeilen={2} text="Sicherungen werden geladen …" />}
        {liste && !liste.length && !fehler && <div style={{ fontSize: 13, color: C.dim }}>Noch keine Sicherung vorhanden.</div>}
        {liste && liste.map((e) => {
          const t = eintragText(e);
          return (
            <div key={e.marke} data-sicherung={e.marke} style={{ display: "flex", alignItems: "center", gap: 12,
              padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.titel}</div>
                <div style={{ fontSize: 12.5, color: C.dim }}>{t.text}</div>
              </div>
              {zurueck && <Btn size="sm" onClick={() => { setErgebnis(null); setAuswahl(e); }}>Zurückspielen</Btn>}
            </div>);
        })}
      </div>
      <Sheet open={!!auswahl} onClose={() => { if (!laeuft) { setAuswahl(null); setErgebnis(null); } }}
        titel={ergebnis ? ergebnis.titel : "Sicherung zurückspielen?"} width={560}>
        {auswahl && !ergebnis && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Stand vom {eintragText(auswahl).titel}</div>
            <BestaetigungsText />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setAuswahl(null)} disabled={laeuft}>Abbrechen</Btn>
              <Btn kind="danger" onClick={bestaetigt} disabled={laeuft}>
                {laeuft ? "Wird zurückgespielt …" : "Ja, zurückspielen"}</Btn>
            </div>
          </div>)}
        {ergebnis && (
          <div role={ergebnis.ok ? "status" : "alert"} style={{ display: "grid", gap: 10, fontSize: 13.5 }}>
            <div>{ergebnis.text}</div>
            {ergebnis.fristen && <div style={{ color: C.dim }}>{ergebnis.fristen}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {ergebnis.neuLaden
                ? <Btn kind="primary" onClick={() => window.location.reload()}>Neu laden</Btn>
                : <Btn onClick={() => { setAuswahl(null); setErgebnis(null); }}>Schließen</Btn>}
            </div>
          </div>)}
      </Sheet>
    </Card>);
}

/* ==========================================================================
   MANDANTEN ANLEGEN
   Ein neu angelegter Betrieb startet leer. Kein Beispielpersonal, keine
   erfundenen Dienstpläne — wer echte Daten eingibt, will nicht erst
   dreiundachtzig Phantasienamen löschen.

   Was mitkommt, ist das Gerüst: ein Standort, die gesetzlichen Grundwerte,
   drei übliche Dienstarten. Alles änderbar, aber besser als ein leeres
   Formular ohne Anhaltspunkt.
   ========================================================================== */
