/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { darf } from "../lib/berechtigung.js";
import { Card, CardHead, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fDatum } from "../lib/datum.js";

/* ==========================================================================
   STANDORTE

   Ein Standort war einmal eine Preisposition: Die Grundgebühr fiel je
   Standort an, wer einen anlegte, änderte den Vertrag — und musste dafür,
   je nach Rolle, entweder selbst bestätigen oder einen Antrag stellen,
   den die Leitung entschied.

   Das galt für einen mobilen Pflegedienst mit vielen kleinen Einsatzorten
   genauso wie für eine Zentrale mit einer großen Filiale — und traf damit
   den falschen Betrieb. Ein Standort kostet jetzt nichts, solange er zum
   Kontingent der gebuchten Stufe gehört; die größten zählen automatisch
   dazu. Anlegen ist deshalb keine Vertragsänderung mehr, sondern eine
   Frage der Struktur — offen für jeden, der die Seite erreicht.

   Was einen Zuschlag auslösen kann, ist nicht das Anlegen, sondern das
   Wachsen: ein Standort jenseits des Kontingents, der über die Schwelle
   in `standorte.js` hinauswächst. Das zeigt diese Seite an, ohne
   irgendetwas zu blockieren — es gibt nichts mehr zu bestätigen.
   ========================================================================== */
/**
 * Standortprüfung beim Stempeln ein- und ausschalten (Geo-Spezifikation E7).
 * Vorgabe: aus. Einschalten nur mit der ausdrücklichen Bestätigung; die
 * Arbeitszeit wird in jedem Fall erfasst.
 */
/**
 * Offline-Stempeln vertrauen (WP-07, Review-Auflage A1). Vorgabe: aus — eine
 * offline erfasste Zeit, die 15 Minuten oder später ankommt, steht zur
 * Prüfung. Schalten nur mit org.edit; wann und von wem, setzt der Server.
 */
export function OfflineSchalter({ sitz, akt }) {
  const e = sitz.mandant.einstellungen || {};
  const an = e.offlineStempelVertrauen === true;
  const darfSchalten = darf(sitz, "org.edit");
  const durch = e.offlineStempelVertrauenVon
    ? (sitz.mandant.personen.find((x) => String(x.id) === String(e.offlineStempelVertrauenVon)) || {}) : null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={an ? "warn" : "ok"}>{an ? "gelockert" : "streng"}</Pill>}>
        Stempeln ohne Netz</CardHead>
      <div style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
        Ohne Netz gestempelt zählt die Uhrzeit des Geräts. Sie lässt sich mit Flugmodus und verstellter Uhr fälschen.
        Deshalb steht eine Ist-Zeit zur Prüfung, wenn ein offline erfasster Beginn oder ein offline erfasstes Ende
        15 Minuten oder später beim Server ankommt — bis die Leitung sie in den Stempelbefunden bestätigt.
        {" "}Gelockert gilt sie dann als bestätigt; eine abweichende Geräteuhr und Stempel über 48 Stunden bleiben zur Prüfung.
        {e.offlineStempelVertrauenAm && (
          <div style={{ marginTop: 10, ...NUM }}>Zuletzt geändert am {fDatum(String(e.offlineStempelVertrauenAm).slice(0, 10))}
            {durch && (durch.vorname || durch.nachname) ? ` von ${`${durch.vorname || ""} ${durch.nachname || ""}`.trim()}` : ""}.</div>)}
        {darfSchalten && (
          <div style={{ marginTop: 14 }}>
            {an ? <Btn onClick={() => akt.setzeOfflineVertrauen(false)}>Wieder streng prüfen</Btn>
              : <Btn onClick={() => akt.setzeOfflineVertrauen(true)}>Lockern</Btn>}
          </div>)}
      </div>
    </Card>);
}
