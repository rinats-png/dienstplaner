/* ==========================================================================
   RECHTSTEXTE

   Impressum, Datenschutzerklärung, AGB, Auftragsverarbeitung und
   Verarbeitungsverzeichnis lagen als Markdown-Dateien im Ordner
   `rechtliches/` — richtig abgelegt, aber für niemanden erreichbar, der die
   Anwendung benutzt. Ein Impressum, das nur im Quelltext steht, erfüllt § 5
   DDG nicht: Es muss „leicht erkennbar, unmittelbar erreichbar und ständig
   verfügbar" sein.

   Diese Datei holt die Texte zur Bauzeit in das Bündel (`?raw`) und stellt
   sie dar. Damit gibt es genau eine Quelle: Wer `rechtliches/impressum.md`
   ändert, ändert die Seite.

   Warum kein Markdown-Paket? Weil hier fünf Textsorten vorkommen —
   Überschrift, Absatz, Liste, Tabelle, Trennlinie — und ein Paket dafür
   mehr Gewicht mitbringt als der ganze Rest dieser Datei. Der Zeichensatz
   ist bekannt, die Dateien liegen im selben Baum, und was nicht erkannt
   wird, erscheint als gewöhnlicher Absatz statt zu verschwinden.
   ========================================================================== */

import React, { useState, useEffect, useRef } from "react";
import { C } from "./farben.js";

import impressumMd from "../rechtliches/impressum.md?raw";
import datenschutzMd from "../rechtliches/datenschutz.md?raw";
import agbMd from "../rechtliches/agb.md?raw";
import avvMd from "../rechtliches/auftragsverarbeitung.md?raw";
import vvzMd from "../rechtliches/verarbeitungsverzeichnis.md?raw";

/** Die Texte in der Reihenfolge, in der sie jemand vermutlich sucht. */
export const RECHTSTEXTE = [
  { id: "impressum", titel: "Impressum",
    kurz: "Anbieterkennzeichnung nach § 5 DDG", text: impressumMd },
  { id: "datenschutz", titel: "Datenschutzerklärung",
    kurz: "Information nach Artikel 13 DSGVO", text: datenschutzMd },
  { id: "agb", titel: "Allgemeine Geschäftsbedingungen",
    kurz: "Vertragsbedingungen für die Nutzung", text: agbMd },
  { id: "avv", titel: "Auftragsverarbeitung",
    kurz: "Vertrag nach Artikel 28 DSGVO mit Anlagen", text: avvMd },
  { id: "vvz", titel: "Verarbeitungsverzeichnis",
    kurz: "Verzeichnis nach Artikel 30 DSGVO", text: vvzMd },
];

/** Enthält ein Text noch Beispieldaten? Dann muss das oben stehen. */
const hatPlatzhalter = (t) => /\[BEISPIEL-/.test(t);

/* --------------------------------------------------------------------------
   Markdown, so weit diese Texte reichen
   -------------------------------------------------------------------------- */

/** Fettdruck und Schrägstriche in einer Zeile. Alles andere bleibt Text. */
function inline(roh, schluessel) {
  const teile = [];
  let rest = String(roh);
  let n = 0;
  /* Fett vor kursiv, sonst frisst der einzelne Stern das Sternpaar. */
  const muster = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/;
  let treffer;
  while ((treffer = muster.exec(rest))) {
    if (treffer.index > 0) teile.push(rest.slice(0, treffer.index));
    const k = `${schluessel}-${n++}`;
    if (treffer[1]) teile.push(<strong key={k} style={{ fontWeight: 640 }}>{treffer[1]}</strong>);
    else if (treffer[2]) teile.push(
      <code key={k} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.92em",
        background: C.flaecheStill, padding: "1px 5px", borderRadius: 4 }}>{treffer[2]}</code>);
    else teile.push(<em key={k}>{treffer[3]}</em>);
    rest = rest.slice(treffer.index + treffer[0].length);
  }
  if (rest) teile.push(rest);
  return teile;
}

/** Eine Tabellenzeile in Zellen zerlegen. */
const zellen = (zeile) => zeile.replace(/^\||\|$/g, "").split("|").map((z) => z.trim());

/**
 * Wandelt Markdown in Elemente. Bewusst zeilenweise: Die Texte sind
 * handgeschrieben und halten sich an einfache Formen.
 */
export function markdown(quelle) {
  const zeilen = String(quelle).split("\n");
  const aus = [];
  let absatz = [];
  let liste = null;
  let i = 0;

  const absatzSchliessen = () => {
    if (!absatz.length) return;
    const t = absatz.join(" ");
    aus.push(<p key={`p${aus.length}`} style={{ margin: "0 0 14px", fontSize: 14.5,
      lineHeight: 1.68, color: C.text }}>{inline(t, `p${aus.length}`)}</p>);
    absatz = [];
  };
  const listeSchliessen = () => {
    if (!liste) return;
    const eintraege = liste.eintraege;
    aus.push(React.createElement(liste.geordnet ? "ol" : "ul", {
      key: `l${aus.length}`,
      style: { margin: "0 0 16px", paddingLeft: 22, fontSize: 14.5, lineHeight: 1.68, color: C.text },
    }, eintraege.map((e, k) => <li key={k} style={{ marginBottom: 5 }}>{inline(e, `li${k}`)}</li>)));
    liste = null;
  };
  const alleSchliessen = () => { absatzSchliessen(); listeSchliessen(); };

  while (i < zeilen.length) {
    const z = zeilen[i];
    const roh = z.trim();

    /* Leerzeile trennt Absätze. */
    if (!roh) { alleSchliessen(); i++; continue; }

    /* Trennlinie */
    if (/^---+$/.test(roh)) {
      alleSchliessen();
      aus.push(<hr key={`hr${aus.length}`} style={{ border: 0, borderTop: `1px solid ${C.line}`,
        margin: "30px 0 26px" }} />);
      i++; continue;
    }

    /* Überschriften */
    const ueber = /^(#{1,4})\s+(.*)$/.exec(roh);
    if (ueber) {
      alleSchliessen();
      const stufe = ueber[1].length;
      const groesse = [23, 19, 16.5, 15][stufe - 1];
      const El = `h${Math.min(stufe + 1, 6)}`;
      aus.push(React.createElement(El, {
        key: `h${aus.length}`,
        style: { fontSize: groesse, fontWeight: stufe === 1 ? 660 : 640,
          margin: aus.length ? `${stufe === 1 ? 34 : 26}px 0 12px` : "0 0 12px",
          color: C.text, lineHeight: 1.35 },
      }, inline(ueber[2], `h${aus.length}`)));
      i++; continue;
    }

    /* Tabelle: Kopfzeile, Trennzeile, dann Inhalt. */
    if (roh.startsWith("|") && /^\|[\s:|-]+\|$/.test((zeilen[i + 1] || "").trim())) {
      alleSchliessen();
      const kopf = zellen(roh);
      const zeilenInhalt = [];
      i += 2;
      while (i < zeilen.length && zeilen[i].trim().startsWith("|")) {
        zeilenInhalt.push(zellen(zeilen[i].trim()));
        i++;
      }
      /* Eine Spalte ohne Beschriftung dient als Merkmalsname — dann ist es
         keine Tabelle mit Kopf, sondern eine Aufstellung. */
      const ohneKopf = kopf.every((k) => !k);
      aus.push(
        <div key={`t${aus.length}`} style={{ overflowX: "auto", margin: "0 0 20px",
          border: `1px solid ${C.lineSoft}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
            {!ohneKopf && (
              <thead>
                <tr>{kopf.map((k, n) => (
                  <th key={n} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 620,
                    background: C.flaecheStill, borderBottom: `1px solid ${C.line}`,
                    whiteSpace: "nowrap" }}>{inline(k, `th${n}`)}</th>))}</tr>
              </thead>)}
            <tbody>
              {zeilenInhalt.map((r, n) => (
                <tr key={n}>{r.map((c, m) => (
                  <td key={m} style={{ padding: "10px 14px", verticalAlign: "top",
                    lineHeight: 1.55,
                    borderTop: n || !ohneKopf ? `1px solid ${C.lineSoft}` : "none",
                    fontWeight: ohneKopf && m === 0 ? 600 : 400,
                    color: ohneKopf && m === 0 ? C.text : C.text,
                    width: ohneKopf && m === 0 ? "32%" : undefined }}>
                    {inline(c, `td${n}-${m}`)}</td>))}</tr>))}
            </tbody>
          </table>
        </div>);
      continue;
    }

    /* Aufzählung und Nummerierung */
    const punkt = /^[-*]\s+(.*)$/.exec(roh);
    const nummer = /^\d+\.\s+(.*)$/.exec(roh);
    if (punkt || nummer) {
      absatzSchliessen();
      const geordnet = !!nummer;
      if (!liste || liste.geordnet !== geordnet) { listeSchliessen(); liste = { geordnet, eintraege: [] }; }
      liste.eintraege.push((punkt || nummer)[1]);
      i++; continue;
    }

    /* Eingerückter Block — im Impressum die Anschrift. */
    if (/^ {4}\S/.test(z)) {
      alleSchliessen();
      const block = [];
      while (i < zeilen.length && (/^ {4}/.test(zeilen[i]) || !zeilen[i].trim())) {
        if (!zeilen[i].trim() && !/^ {4}/.test(zeilen[i + 1] || "")) break;
        block.push(zeilen[i].replace(/^ {4}/, ""));
        i++;
      }
      aus.push(<pre key={`pre${aus.length}`} style={{ margin: "0 0 18px", padding: "14px 16px",
        background: C.flaecheStill, borderRadius: 10, border: `1px solid ${C.lineSoft}`,
        fontSize: 13.5, lineHeight: 1.6, fontFamily: "inherit", whiteSpace: "pre-wrap",
        overflowX: "auto" }}>{block.join("\n").trimEnd()}</pre>);
      continue;
    }

    listeSchliessen();
    absatz.push(roh);
    i++;
  }
  alleSchliessen();
  return aus;
}

/* --------------------------------------------------------------------------
   Darstellung
   -------------------------------------------------------------------------- */

/** Ein einzelner Text, gesetzt für ruhiges Lesen. */
export function Rechtstext({ id }) {
  const eintrag = RECHTSTEXTE.find((t) => t.id === id) || RECHTSTEXTE[0];
  return (
    <div style={{ maxWidth: 760 }}>
      {hatPlatzhalter(eintrag.text) && (
        <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 24,
          background: C.warnLight || "#FFF7E6", border: `1px solid ${C.warn || "#D08700"}44`,
          fontSize: 13.5, lineHeight: 1.6, color: C.text }}>
          <strong style={{ fontWeight: 640 }}>Entwurf mit Beispieldaten.</strong>{" "}
          Angaben zu Firmensitz, Registernummer und Umsatzsteuer-Identifikationsnummer
          stehen als Platzhalter in eckigen Klammern. Vor der Veröffentlichung sind
          sie zu ersetzen und der Text ist anwaltlich zu prüfen.
        </div>)}
      {markdown(eintrag.text)}
    </div>);
}

/**
 * Die Rechtstexte als eigener Bereich — mit Auswahl links und Text rechts.
 * Wird sowohl in der angemeldeten Anwendung als auch im Vorschaltfenster
 * verwendet, damit es nur eine Darstellung gibt.
 */
export function Rechtliches({ start = "impressum", eingebettet = false }) {
  const [offen, setOffen] = useState(start);
  const inhalt = useRef(null);

  /* Beim Wechsel nach oben — sonst steht man mitten im neuen Text. */
  useEffect(() => { if (inhalt.current) inhalt.current.scrollTop = 0; }, [offen]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: eingebettet ? "1fr" : "230px 1fr",
      gap: eingebettet ? 18 : 30, alignItems: "start" }}
      className={eingebettet ? undefined : "rechtsraster"}>
      <nav aria-label="Rechtstexte" style={{ display: "flex",
        flexDirection: eingebettet ? "row" : "column", flexWrap: "wrap", gap: 4,
        position: eingebettet ? undefined : "sticky", top: eingebettet ? undefined : 12 }}>
        {RECHTSTEXTE.map((t) => (
          <button key={t.id} type="button" onClick={() => setOffen(t.id)}
            aria-current={offen === t.id ? "page" : undefined}
            style={{ textAlign: "left", padding: eingebettet ? "7px 12px" : "9px 12px",
              borderRadius: 9, border: `1px solid ${offen === t.id ? C.accent + "55" : "transparent"}`,
              background: offen === t.id ? C.accentLight : "transparent",
              color: offen === t.id ? C.accentDeep : C.dim, cursor: "pointer",
              fontSize: 13.5, fontWeight: offen === t.id ? 620 : 500, fontFamily: "inherit",
              lineHeight: 1.4 }}>
            {t.titel}
            {!eingebettet && (
              <span style={{ display: "block", fontSize: 11.5, color: C.dimmer,
                fontWeight: 400, marginTop: 2 }}>{t.kurz}</span>)}
          </button>))}
      </nav>
      <div ref={inhalt} style={{ minWidth: 0 }}>
        <Rechtstext id={offen} />
      </div>
    </div>);
}

/**
 * Vorschaltfenster für die Anmeldeseite. Wer noch keinen Zugang hat, muss
 * an Impressum und Datenschutzerklärung herankommen — ohne sich anzumelden.
 */
export function RechtFenster({ start, onClose }) {
  const rahmen = useRef(null);

  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", f);
    const vorher = document.activeElement;
    if (rahmen.current) rahmen.current.focus();
    return () => { window.removeEventListener("keydown", f); if (vorher) vorher.focus?.(); };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Rechtliche Angaben"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(24,26,30,.42)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "4vh 16px", overflowY: "auto" }}>
      <div ref={rahmen} tabIndex={-1}
        style={{ background: C.flaeche, borderRadius: 14, maxWidth: 880, width: "100%",
          padding: "26px 30px 34px", boxShadow: "0 24px 70px rgba(17,24,39,.30)",
          outline: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 20, gap: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 650 }}>Rechtliche Angaben</div>
          <button type="button" onClick={onClose} aria-label="Schließen"
            style={{ border: `1px solid ${C.line}`, background: "transparent", cursor: "pointer",
              borderRadius: 8, padding: "6px 12px", fontSize: 13.5, color: C.dim,
              fontFamily: "inherit" }}>Schließen</button>
        </div>
        <Rechtliches start={start} />
      </div>
    </div>);
}

/**
 * Die Zeile unter der Anmeldung. Klein, aber ständig verfügbar — genau das
 * verlangt § 5 DDG.
 */
export function RechtLeiste({ onOeffnen, style }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center",
      fontSize: 12.5, color: C.dimmer, ...style }}>
      {RECHTSTEXTE.map((t, i) => (
        <React.Fragment key={t.id}>
          {i > 0 && <span aria-hidden="true" style={{ opacity: .5 }}>·</span>}
          <button type="button" onClick={() => onOeffnen(t.id)}
            style={{ background: "none", border: 0, padding: "2px 4px", cursor: "pointer",
              color: C.dim, fontSize: 12.5, fontFamily: "inherit", textDecoration: "underline",
              textUnderlineOffset: 3 }}>{t.titel}</button>
        </React.Fragment>))}
    </div>);
}
