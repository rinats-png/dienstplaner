/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { pISO } from "../regelwerk.js";
import { heute, fDatum } from "../lib/datum.js";
import { C } from "../farben.js";
import { Btn } from "../ui/bausteine.jsx";
import { hilfeVerweis } from "../kontakt.js";

/* ================================ PRÜFUNG ================================ */
/* ==========================================================================
   TESTABLAUF

   Ein selbst angelegter Betrieb läuft nach 30 Tagen ab, und der Server weist
   danach jede Anmeldung ab — nachgelesen in server/funktionen/daten.mjs. Der
   Kunde erfuhr davon nichts: Der Ablauf stand nur in der Betreiberkonsole.
   Am einunddreißigsten Tag stand jemand mit einem eingerichteten Betrieb vor
   einer Anmeldung, die ihn nicht mehr kannte.

   Diese Leiste zählt die Tage rückwärts, ab vierzehn Tagen vor Schluss. Sie
   sagt, was bleibt und was passiert, und sie hört mit dem Ablauf nicht auf —
   danach ist sie am wichtigsten.
   ========================================================================== */
export function Testablauf({ mandant, darfEinrichten }) {
  const m = mandant || {};
  const ende = m.laeuftAb || (m.status === "test" ? m.stichtag : null);
  if (!ende || m.status === "aktiv") return null;

  const tag = String(ende).slice(0, 10);
  const rest = Math.ceil((pISO(tag).getTime() - pISO(heute()).getTime()) / 86400000);
  /* Vorher nicht stören. Zwei Wochen sind genug, um zu entscheiden, und
     wenig genug, dass die Leiste nicht zum Hintergrundrauschen wird. */
  if (rest > 14) return null;

  const abgelaufen = rest <= 0;
  const ton = abgelaufen || rest <= 3 ? "danger" : "warn";
  const grund = ton === "danger" ? C.dangerLight : C.warnLight;
  const rand = ton === "danger" ? C.danger : C.warn;

  return (
    <div role="status" style={{ padding: "14px 18px", borderRadius: 12, marginBottom: 20,
      background: grund, border: `1px solid ${rand}33`,
      display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontSize: 14.5, fontWeight: 640, marginBottom: 5 }}>
          {abgelaufen
            ? `Der Testzeitraum ist am ${fDatum(tag)} abgelaufen`
            : rest === 1 ? "Der Testzeitraum endet morgen"
              : `Noch ${rest} Tage im Testzeitraum`}
        </div>
        <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6 }}>
          {abgelaufen
            ? "Die Zugänge werden abgewiesen, sobald die Sitzung endet. Der Betrieb "
              + "bleibt vollständig erhalten und ist sofort wieder da, wenn der Zugang "
              + "verlängert wird — es geht nichts verloren."
            : `Bis zum ${fDatum(tag)} ist alles unverändert nutzbar. Danach werden die `
              + "Zugänge abgewiesen; der Betrieb bleibt gespeichert. "
              + (darfEinrichten
                ? "Vorher lohnt eine Datenmitnahme — dann liegt der Stand auch außerhalb."
                : "Die Organisationsleitung kann verlängern.")}
        </div>
      </div>
      {darfEinrichten && (
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Btn size="sm" kind="primary" onClick={() => {
            window.location.href = hilfeVerweis({
              betreff: `CENTRIC verlängern — ${m.name || ""}`,
              betrieb: m.name, zusatz: `Der Testzeitraum endet am ${tag}. Wir möchten verlängern.` });
          }}>Verlängern</Btn>
        </div>)}
    </div>);
}
