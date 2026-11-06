/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { Card, Leer, CardHead, Lab } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { fLang, heute } from "../lib/datum.js";
import { addDays } from "../regelwerk.js";
import { ROLLEN } from "../lib/rollen.js";

/** Adressänderungen aller Betriebe, neueste zuerst. */
function adressAenderungen(db, tage) {
  const grenze = addDays(heute(), -(tage || 90));
  const out = [];
  for (const m of db.mandanten)
    for (const a of (m.adressAenderungen || [])) {
      if (a.zeit.slice(0, 10) < grenze) continue;
      const p = m.personen.find((x) => x.id === a.personId);
      out.push({ ...a, mandant: m.name, mandantId: m.id,
        rolle: p ? (ROLLEN.find((r) => r.id === p.rolle)?.label || p.rolle) : "unbekannt" });
    }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/* ==========================================================================
   ADRESSÄNDERUNGEN
   Wenn jemand seine Anmeldeadresse ändert, erscheint das hier. So merkst du,
   wenn ein Zugang den Besitzer wechselt — etwa weil die Planung neu besetzt
   wurde und niemand Bescheid gesagt hat.
   ========================================================================== */
export function Adressaenderungen({ db }) {
  const liste = useMemo(() => adressAenderungen(db, 90), [db]);
  if (!liste.length) return (
    <Card><Leer titel="Keine Änderungen"
      text="Wenn jemand seine Anmeldeadresse ändert, erscheint das hier mit Datum und Rolle." /></Card>);
  return (
    <Card>
      <CardHead right={<Lab>letzte 90 Tage</Lab>}>Geänderte Anmeldeadressen</CardHead>
      {liste.slice(0, 40).map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 16,
          padding: "14px var(--pad-x)",
          borderBottom: i < Math.min(39, liste.length - 1) ? `1px solid ${C.lineSoft}` : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 550 }}>{a.mandant}</div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
              {a.rolle} · {fLang(a.zeit.slice(0, 10))}</div>
          </div>
          <div style={{ fontSize: 13, textAlign: "right", minWidth: 0 }}>
            {a.von && <div style={{ color: C.dim, textDecoration: "line-through" }}>{a.von}</div>}
            <div style={{ fontWeight: 550 }}>{a.nach || "entfernt"}</div>
          </div>
        </div>))}
    </Card>);
}

/* ==========================================================================
   KALENDER, WECKZEITEN, VERFÜGBARKEIT

   Drei Dinge, die eine Belegschaft spürbar mehr wertschätzt als jede
   Auswertung: der Plan im eigenen Kalender, ein Weckruf, der zur Schicht
   passt, und die Möglichkeit, der Familie zu zeigen, wann man da ist.

   Alles drei nutzt aus, dass CENTRIC den Plan rechnet: Niemand muss etwas
   abtippen, und die Angaben stimmen auch zwölf Monate voraus.
   ========================================================================== */

/* Die Termine des Kalender-Feeds rechnet seit WP-24 der Server bei jedem Abruf (server/lib/kalenderfeed.mjs). */

/* --------------------------------------------------------------------------
   WECKZEITEN
   Aus dem Dienst den Weckruf ableiten. Wer den Plan hat, muss ihn nicht
   abtippen — das ist der ganze Trick.
   -------------------------------------------------------------------------- */
