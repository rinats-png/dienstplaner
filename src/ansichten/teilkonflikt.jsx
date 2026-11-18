/* ==========================================================================
   KONFLIKTFENSTER DER TEILSPEICHERUNG (WP-48.5 Teil 2)

   Betreiberentscheidung 2026-11-18 (Entwurf 6.4, Option A): Ein Konflikt
   auf dem Teilweg wird je Zelle oder Kernfeld entschieden — „fremdes
   übernehmen" oder „meins setzen". Ein blindes „alles übernehmen" gibt es
   hier nicht. Gezeigt wird das Fenster nur, wenn der Server die Fähigkeit
   `teile` meldet (Schalter CENTRIC_TEILSPEICHERUNG an); sonst bleibt es
   beim heutigen Konfliktfenster (speicherlage.jsx).

   Bedienung: je Frage eine Radiogruppe (fieldset mit legend als
   zugänglichem Namen; Pfeiltasten wechseln die Wahl, Tab springt zur
   nächsten Gruppe). Keine verschachtelten Bedienelemente: Die Auswahl
   steckt im label, Knöpfe stehen außerhalb der Gruppen. Escape schließt
   (Später entscheiden) — gespeichert wird dann nichts, bis entschieden ist.

   „Neu laden" (Epoche anders, Wiederherstellen): erst die ausstehenden
   Änderungen als Datei sichern (lokal, ohne Netz), dann neu laden.
   ========================================================================== */
import { useState, useEffect, useRef } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { Btn } from "../ui/bausteine.jsx";
import { frageText } from "../app/teilkonflikt.js";
import { bezeichne } from "../app/feldbezeichnungen.js";
import { lade } from "../lib/download.js";

/** Die ausstehenden Änderungen als JSON-Datei sichern — lokal, ohne Netz. Gibt zurück, ob die Datei angeboten wurde. */
export function teilSichern(melde, inhalt = SP.teilSicherung()) {
  const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ok = lade(`centric-ausstehend-${marke}.json`, JSON.stringify(inhalt, null, 2), "application/json;charset=utf-8");
  if (ok) melde("Als Datei gesichert.");
  return ok;
}

/** Die ausstehenden Änderungen beim Neuladen als lesbare Liste (höchstens `max` Zeilen). */
export function ausstehendListe(zustand, m, max = 20) {
  const aus = zustand && zustand.ausstehendBeiNeuLaden;
  const zeilen = [];
  if (aus && typeof aus === "object" && "voll" in aus)
    zeilen.push("Änderungen, die sich nicht einzeln übertragen lassen (die Datei enthält deinen ganzen Stand).");
  else if (aus && typeof aus === "object") {
    for (const feld of Object.keys(aus.kern || {}))
      zeilen.push(`Stammdaten: ${bezeichne(feld)}`);
    for (const z of aus.zellen || []) {
      const t = frageText({ art: "zelle", feld: z.feld, k: z.k, meins: z.neu, fremd: z.alt }, m, bezeichne);
      zeilen.push(`${t.titel}: ${t.meins}`);
    }
  }
  for (const f of (zustand && zustand.konflikte) || []) zeilen.push(`${frageText(f, m, bezeichne).titel} (noch nicht entschieden)`);
  const rest = zeilen.length - max;
  return rest > 0 ? [...zeilen.slice(0, max), `… und ${rest} weitere`] : zeilen;
}

const RAHMEN = { position: "fixed", inset: 0, background: "var(--c-ueberlagerung)", backdropFilter: "blur(6px)", zIndex: 90,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };

/**
 * @param {{ zustand: any, m: any, onEntscheiden: (wahl: Record<string, "fremd"|"meins">) => void,
 *   onSpaeter: () => void, onSichern: () => void, onSichernUndNeuLaden: () => void }} p
 */
export function Teilkonfliktfenster({ zustand, m, onEntscheiden, onSpaeter, onSichern, onSichernUndNeuLaden }) {
  const rahmen = useRef(null);
  const [wahl, setWahl] = useState({});
  const neuLaden = !!zustand && zustand.phase === "neuLaden";
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onSpaeter(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onSpaeter]);
  /* Fokus nur beim Öffnen ins Fenster — ein Neuzeichnen der Anwendung darf ihn nicht aus der Radiogruppe nehmen. */
  useEffect(() => { if (rahmen.current) rahmen.current.focus(); }, []);
  if (!zustand) return null;
  const fragen = zustand.konflikte || [];
  const offen = fragen.filter((f) => wahl[f.id] !== "fremd" && wahl[f.id] !== "meins").length;

  if (neuLaden) {
    const liste = ausstehendListe(zustand, m);
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="teilkonflikt-titel" style={RAHMEN}>
        <div ref={rahmen} tabIndex={-1} className="blatt" style={{ maxWidth: 600, maxHeight: "90vh", overflowY: "auto", padding: 28, outline: "none" }}>
          <h2 id="teilkonflikt-titel" style={{ fontSize: 18, fontWeight: 650, margin: "0 0 10px" }}>
            Der gespeicherte Stand wurde neu aufgesetzt</h2>
          <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
            Seit du geladen hast, wurde der Bestand zurückgespielt oder neu angelegt. Deine noch nicht gespeicherten
            Änderungen lassen sich deshalb nicht von selbst abgleichen. Sichere sie als Datei und lade neu — danach
            kannst du sie aus der Datei nachtragen.</p>
          {liste.length > 0 && (
            <ul aria-label="Noch nicht gespeichert" style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 16px", paddingLeft: 20 }}>
              {liste.map((z, i) => <li key={i}>{z}</li>)}
            </ul>)}
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn onClick={onSichern}>Nur als Datei sichern</Btn>
            <Btn kind="primary" onClick={onSichernUndNeuLaden}>Sichern und neu laden</Btn>
          </div>
        </div>
      </div>);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="teilkonflikt-titel" aria-describedby="teilkonflikt-text" style={RAHMEN}>
      <div ref={rahmen} tabIndex={-1} className="blatt" style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto", padding: 28, outline: "none" }}>
        <h2 id="teilkonflikt-titel" style={{ fontSize: 18, fontWeight: 650, margin: "0 0 10px" }}>
          {fragen.length === 1 ? "Eine Angabe wurde gleichzeitig geändert" : `${fragen.length} Angaben wurden gleichzeitig geändert`}</h2>
        <p id="teilkonflikt-text" style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 16px" }}>
          Jemand anderes hat inzwischen dieselben Angaben gespeichert. Entscheide je Angabe, welche Fassung gilt.
          Deine übrigen Änderungen werden danach gespeichert.</p>
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          {fragen.map((f, i) => {
            const t = frageText(f, m, bezeichne);
            const name = `teilfrage-${i}`;
            return (
              <fieldset key={f.id} className="karte" style={{ margin: 0, padding: "12px 15px", minWidth: 0, border: `1px solid ${C.line}` }}>
                <legend style={{ fontSize: 14, fontWeight: 600, padding: "0 4px" }}>{t.titel}</legend>
                {t.hinweis && <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, margin: "0 0 8px" }}>{t.hinweis}</p>}
                {[["fremd", "Fremdes übernehmen", t.fremd], ["meins", "Meins setzen", t.meins]].map(([w, was, wert]) => (
                  <label key={w} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, fontSize: 13.5, cursor: "pointer" }}>
                    <input type="radio" name={name} value={w} checked={wahl[f.id] === w}
                      onChange={() => setWahl((x) => ({ ...x, [f.id]: w }))}
                      style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />
                    <span>{was}: <strong style={{ fontWeight: 600 }}>{wert}</strong></span>
                  </label>))}
              </fieldset>);
          })}
        </div>
        <p role="status" style={{ fontSize: 12.5, color: C.dim, margin: "0 0 12px" }}>
          {offen ? `Noch ${offen} ${offen === 1 ? "Angabe" : "Angaben"} offen.` : "Alles entschieden."}</p>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn kind="quiet" onClick={onSpaeter}>Später entscheiden</Btn>
          <Btn onClick={onSichern}>Als Datei sichern</Btn>
          <Btn kind="primary" disabled={offen > 0} onClick={() => onEntscheiden(wahl)}>Entscheidungen speichern</Btn>
        </div>
      </div>
    </div>);
}

/** Leiste, solange auf dem Teilweg eine Entscheidung aussteht und das Fenster geschlossen ist. */
export function TeilwegLeiste({ zustand, onOeffnen }) {
  if (!zustand || (zustand.phase !== "neuLaden" && !(zustand.konflikte || []).length)) return null;
  const neuLaden = zustand.phase === "neuLaden";
  return (
    <div role="alert" style={{ padding: "12px 18px", borderRadius: 12, marginBottom: 20, background: C.warnLight,
      border: `1px solid ${C.warn}33`, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, fontWeight: 640 }}>
        {neuLaden ? "Neu laden nötig — Änderungen sind noch nicht gespeichert" : "Speichern wartet auf deine Entscheidung"}</span>
      <Btn size="sm" kind="primary" onClick={onOeffnen}>{neuLaden ? "Ansehen" : "Jetzt entscheiden"}</Btn>
    </div>);
}
