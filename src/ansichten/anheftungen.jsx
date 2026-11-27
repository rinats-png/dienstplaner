/* Anheften sichtbar (WP-I7 Teil 6, Stufe B; Betreiberentscheidung 27.11.: Zustand nachvollziehbar und sichtbar).
   Nur lesend: welche Einteilungen des Monats angeheftet sind und welche durch eine manuelle Änderung nicht mehr angeheftet sind
   (Vermerk der Karte `angeheftet`, server/lib/anheften.mjs). Eine unlesbare Karte wird genannt, nie still weggelassen. Die Karte
   bekommen nur Planung und Leitung (sicht.mjs); ohne Karte und ohne Einträge im Monat zeigt die Leiste nichts. */
import { anheftungenLesen, ANGEHEFTET_FELD } from "../../server/lib/engine/anheften.mjs";
import { Card, Lab } from "../ui/bausteine.jsx";
import { fKurz } from "../lib/datum.js";

const ROLLE = { leitung: "Leitung", planer: "Planung", kunde: "Kundenrolle" };

/**
 * Anheftungen eines Monats für die Anzeige.
 * @param {any} m Betrieb @param {string} ym JJJJ-MM
 * @returns {{ unlesbar: boolean, aktiv: { schluessel: string, personId: string, tag: string }[], aufgehoben: { schluessel: string, personId: string, tag: string, am: string, rolle: string }[] }}
 */
export function anheftungenImMonat(m, ym) {
  const l = anheftungenLesen(m);
  if (!l.ok) return { unlesbar: true, aktiv: [], aufgehoben: [] };
  const karte = m && m[ANGEHEFTET_FELD] && typeof m[ANGEHEFTET_FELD] === "object" ? m[ANGEHEFTET_FELD] : {};
  const teile = (s) => { const i = s.lastIndexOf("|"); return { schluessel: s, personId: s.slice(0, i), tag: s.slice(i + 1) }; };
  const imMonat = (s) => s.slice(-10, -3) === ym;
  return {
    unlesbar: false,
    aktiv: [...l.aktiv].filter(imMonat).sort().map(teile),
    aufgehoben: [...l.aufgehoben].filter(imMonat).sort().map((s) => ({ ...teile(s), am: String(karte[s].aufgehobenAm).slice(0, 10),
      rolle: ROLLE[karte[s].aufgehobenVonRolle] || "andere Rolle" })),
  };
}

export function Anheftungen({ m, ym }) {
  const a = anheftungenImMonat(m, ym);
  if (!a.unlesbar && !a.aktiv.length && !a.aufgehoben.length) return null;
  const name = (pid) => { const p = (m.personen || []).find((x) => String(x.id) === pid); return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "Person"; };
  return (
    <Card still data-testid="anheftungen">
      <Lab>Angeheftete Einteilungen (der Planer ändert sie nicht)</Lab>
      {a.unlesbar && <p role="alert">Die Anheftungen des Betriebs sind nicht lesbar. Der Planer rechnet nicht, bis die Leitung sie neu setzt.</p>}
      {a.aktiv.length > 0 && <ul>
        {a.aktiv.map((x) => <li key={x.schluessel}>{fKurz(x.tag)} · {name(x.personId)}: angeheftet</li>)}
      </ul>}
      {a.aufgehoben.length > 0 && <ul>
        {a.aufgehoben.map((x) => <li key={x.schluessel}>{fKurz(x.tag)} · {name(x.personId)}: nicht mehr angeheftet — manuell geändert am {fKurz(x.am)} ({x.rolle})</li>)}
      </ul>}
    </Card>
  );
}
