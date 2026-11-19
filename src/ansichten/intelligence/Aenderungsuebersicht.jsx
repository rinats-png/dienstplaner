/* ==========================================================================
   ÄNDERUNGSÜBERSICHT (WP-I24 Teil 1, F15) — Ansicht für Planung und Leitung

   Eigenständige Komponente, in App.jsx nicht eingehängt (Einhängepunkt: Leitstand, wie KiEntwurf).
   Zeigt die BERECHNETE Liste „Was hat sich im Plan geändert" (server/lib/intelligence/funktionen/aenderungsuebersicht.mjs).
   Es steht nichts von „KI" darauf: die Liste ist gerechnet; die Textzusammenfassung ist (noch) nicht verfügbar
   und sagt das.

   A1  Nur Leitung und Planung bekommen etwas gerendert; jede andere Rolle null (kein Platzhalter).
   A2  Texte nur als Text (React-Escaping), keine Links, kein Roh-HTML.
   A3  Barrierefrei: Liste als ul/li, Status per role=status, keine reine Farbkodierung; schmale Bildschirme:
       umbrechender Text (overflow-wrap), keine feste Breite, nichts Klickbares kleiner als 24 px (hier nichts Klickbares).
   A4  Kein console.*, kein Netz.
   ========================================================================== */

export const AENDERUNG_TEXTE = Object.freeze({
  titel: "Änderungen im Plan",
  leer: "Im gewählten Zeitraum hat sich nichts geändert.",
  keinVergleich: "Es gibt noch keinen früheren Planstand zum Vergleichen.",
  neu: "neu eingeplant", geaendert: "geändert", entfernt: "nicht mehr eingeplant",
  frei: "frei", entwurf: "Entwurf, noch nicht veröffentlicht",
  gekuerzt: "Die Liste ist gekürzt, weil sie sehr lang ist.",
  fehler: "Die Änderungen konnten nicht angezeigt werden.",
});
export const AENDERUNG_ROLLEN = Object.freeze(["leitung", "planer"]);
const ARTEN = ["neu", "geaendert", "entfernt"];
const datumDe = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
const dienst = (x) => (x && typeof x.kurz === "string" ? x.kurz : AENDERUNG_TEXTE.frei);
const zeit = (z) => (z && z.beginn && z.ende ? `${z.beginn}–${z.ende}` : "");

/** @param {{ rolle: string, uebersicht?: any }} props */
export function Aenderungsuebersicht({ rolle, uebersicht }) {
  if (!AENDERUNG_ROLLEN.includes(rolle)) return null;
  const u = uebersicht;
  const rumpf = (() => {
    if (!u || typeof u !== "object" || !Array.isArray(u.ereignisse) || (u.status !== "ok" && u.status !== "kein_vergleich"))
      return <p role="status">{AENDERUNG_TEXTE.fehler}</p>;
    if (u.status === "kein_vergleich") return <p role="status">{AENDERUNG_TEXTE.keinVergleich}</p>;
    if (!u.ereignisse.length) return <p role="status">{AENDERUNG_TEXTE.leer}</p>;
    return (
      <>
        <p role="status">{ARTEN.map((a) => `${u.zaehler && Number.isFinite(u.zaehler[a]) ? u.zaehler[a] : 0} ${AENDERUNG_TEXTE[a]}`).join(" · ")}</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {u.ereignisse.map((e, i) => (
            <li key={`${e.personId}|${e.datum}|${i}`} style={{ marginBottom: 6, overflowWrap: "anywhere" }}>
              <strong>{datumDe(e.datum)}</strong>{" "}{typeof e.name === "string" && e.name ? e.name : ""}{": "}
              {AENDERUNG_TEXTE[e.art] || ""}{" ("}{dienst(e.von)}{" → "}{dienst(e.nach)}
              {e.zeiten ? `, ${zeit(e.zeiten.vorher)} → ${zeit(e.zeiten.nachher)}` : ""}{")"}
              {e.entwurf ? ` – ${AENDERUNG_TEXTE.entwurf}` : ""}
            </li>
          ))}
        </ul>
        {u.gekuerzt ? <p role="status">{AENDERUNG_TEXTE.gekuerzt}</p> : null}
      </>
    );
  })();
  return (
    <section aria-label={AENDERUNG_TEXTE.titel} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, maxWidth: "100%", overflowWrap: "anywhere" }}>
      <h3 style={{ marginTop: 0 }}>{AENDERUNG_TEXTE.titel}</h3>
      {rumpf}
      {u && u.zusammenfassung && u.zusammenfassung.verfuegbar === false && typeof u.zusammenfassung.text === "string"
        ? <p>{u.zusammenfassung.text}</p> : null}
    </section>
  );
}
