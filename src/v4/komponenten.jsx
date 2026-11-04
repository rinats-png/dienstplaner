import React, { useEffect, useRef, useId } from "react";
import { Icon } from "../gestalt/icons.jsx";

/* ==========================================================================
   V4 GLASS — Basiskomponenten
   Karte, Knopf, Eingabefeld, Dialog-Rahmen, Statushinweis. Sie tragen keine
   Fachlogik und keine Farben: Aussehen kommt aus stil.js (Klassen .v4-…).
   ========================================================================== */

const klassen = (...k) => k.filter(Boolean).join(" ");

/** Karte. `glas` nur für Navigation, Dialoge und einzelne Karten, nie für Tabellenraster. */
export function V4Karte({ glas = false, as: Tag = "div", className, children, ...rest }) {
  return <Tag className={klassen("v4-karte", glas && "v4-glas", className)} {...rest}>{children}</Tag>;
}

/** Knopf. `art`: primaer | sekundaer | leise. `laeuft` setzt aria-busy und sperrt Mehrfachklicks. */
export function V4Knopf({ art = "primaer", laeuft = false, type = "button", disabled, className, children, ...rest }) {
  return (
    <button type={type} disabled={disabled || laeuft} aria-busy={laeuft ? "true" : undefined}
      className={klassen("v4-knopf", `v4-knopf-${art}`, className)} {...rest}>{children}</button>);
}

/** Eingabefeld mit Beschriftung, Hinweis und Fehlertext (Fehler mit Symbol, per aria-describedby verbunden). */
export function V4Feld({ label, hinweis, fehler, id, className, ...eingabe }) {
  const auto = useId();
  const feldId = id || `v4f-${auto}`;
  const hinweisId = hinweis ? `${feldId}-h` : undefined;
  const fehlerId = fehler ? `${feldId}-e` : undefined;
  const beschreibt = [hinweisId, fehlerId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={klassen("v4-feld", className)}>
      <label htmlFor={feldId} className="v4-feld-label">{label}</label>
      <input id={feldId} className="v4-feld-eingabe" aria-invalid={fehler ? "true" : undefined}
        aria-describedby={beschreibt} {...eingabe} />
      {hinweis && <div id={hinweisId} className="v4-feld-hinweis">{hinweis}</div>}
      {fehler && <div id={fehlerId} role="alert" className="v4-feld-fehler">
        <Icon n="warnung" size={16} /><span>{fehler}</span></div>}
    </div>);
}

/**
 * Dialog-Rahmen: role=dialog, aria-modal, Titel verbunden, Escape schließt,
 * Fokus geht hinein und kehrt beim Schließen zurück, Tab bleibt im Dialog.
 */
export function V4Dialog({ titel, onSchliessen, glas = false, children }) {
  const titelId = useId();
  const ref = useRef(null);
  useEffect(() => {
    const davor = document.activeElement;
    const el = ref.current;
    const fokussierbar = () => (el
      ? [...el.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex]:not([tabindex="-1"])')]
      : []);
    const ziel = fokussierbar()[0] || el;
    if (ziel) ziel.focus();
    const taste = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (onSchliessen) onSchliessen(); return; }
      if (e.key !== "Tab") return;
      const f = fokussierbar();
      if (!f.length) { e.preventDefault(); return; }
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("keydown", taste);
      if (davor && davor.focus) davor.focus();
    };
  }, [onSchliessen]);
  return (
    <div className="v4-dialog-rueck">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titelId} tabIndex={-1}
        className={klassen("v4-dialog", glas && "v4-glas")}>
        <h2 id={titelId} className="v4-dialog-titel">{titel}</h2>
        {children}
      </div>
    </div>);
}

const HINWEIS_ICON = { info: "info", ok: "kreis-haken", warn: "warnung", danger: "warnung" };

/**
 * Statushinweis. `ton`: info | ok | warn | danger. Immer Symbol plus Text.
 * Gefahr und Warnung werden als Alarm angekündigt, der Rest höflich als Status.
 */
export function V4Hinweis({ ton = "info", className, children, ...rest }) {
  const alarm = ton === "danger" || ton === "warn";
  return (
    <div role={alarm ? "alert" : "status"} className={klassen("v4-hinweis", `v4-hinweis-${ton}`, className)} {...rest}>
      <span className="v4-hinweis-symbol"><Icon n={HINWEIS_ICON[ton] || "info"} size={18} /></span>
      <div>{children}</div>
    </div>);
}
