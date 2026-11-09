/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useRef } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { Btn, Inp, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { hilfeVerweis } from "../kontakt.js";
import { lade } from "../lib/download.js";


/* ==========================================================================
   NICHT GESPEICHERT

   Bisher stand hier eine Zeile: `melde("Nicht gespeichert: " + e.message)`.
   Ein Hinweis, der nach drei Sekunden verschwindet, und darin der rohe
   Text vom Server — „Failed to fetch" etwa. Wer gerade einen Monat geplant
   hat, konnte daraus weder ablesen, was verloren ist, noch was zu tun
   wäre. Und der schlimmste Fall meldete sich gar nicht: Bei abgelaufener
   Sitzung kehrte der Schreibvorgang wortlos zurück.

   Diese Leiste bleibt stehen, bis es geklärt ist. Sie sagt je nach Lage
   etwas anderes, weil je nach Lage etwas anderes zu tun ist — und sie
   bietet immer den Ausweg an, der nichts voraussetzt: die Arbeit als Datei
   sichern.
   ========================================================================== */
export const SPEICHERLAGE = {
  abgemeldet: {
    titel: "Die Sitzung ist abgelaufen — die letzten Änderungen sind noch nicht gespeichert",
    text: "Nach dreißig Minuten ohne Eingabe endet die Sitzung. Gib den Zugangscode "
      + "hier ein: Die Anwendung meldet sich an und schickt die Arbeit sofort hinterher. "
      + "Bitte diesen Reiter dabei offen lassen — die Änderungen liegen nur hier.",
    neuAnmelden: true,
  },
  netz: {
    titel: "Keine Verbindung — die letzten Änderungen sind noch nicht gespeichert",
    text: "Die Anwendung erreicht den Server nicht. Das kann am Netz hier liegen oder "
      + "am Server. Die Arbeit ist nicht verloren, solange dieser Reiter offen bleibt.",
    nochmal: true,
  },
  server: {
    titel: "Der Server konnte nicht speichern",
    text: "Ein Fehler auf der Gegenseite. Ein zweiter Versuch hilft oft; hilft er nicht, "
      + "sichere die Arbeit als Datei und melde dich bei uns.",
    nochmal: true, hilfe: true,
  },
  keinRecht: {
    titel: "Diese Änderung ist mit deiner Rolle nicht zulässig",
    text: "Der Server hat sie abgewiesen. Was du siehst, ist noch dein Stand — "
      + "gespeichert ist er nicht. Lade die Seite neu, um den gültigen Stand zu sehen.",
    neuladen: true,
  },
  ausnahmeZurueck: {
    titel: "Die Datenschutz-Berichtigung oder -Löschung ist nicht gespeichert",
    text: "Der Server hat sie abgewiesen, oder der Bestand hat sich inzwischen geändert. Die Änderung wird "
      + "zurückgenommen: Lade die Seite neu und führe den Ausnahmeweg danach noch einmal aus.",
    neuladen: true,
  },
  stempelStand: {
    titel: "Der Bestand ist veraltet — bitte neu laden",
    text: "Seit du die Daten geladen hast, hat sich ein Stempel geändert, und gestempelte Werte bleiben unverändert. "
      + "Die Änderung ist nicht gespeichert. Lade den Bestand neu und trage sie dann noch einmal ein.",
    neuladen: true,
  },
  zuGross: {
    titel: "Der Bestand ist zu groß geworden",
    text: "Der Server hat die Übertragung abgewiesen. Sichere die Arbeit als Datei "
      + "und melde dich bei uns — das lässt sich lösen, aber nicht von hier aus.",
    hilfe: true,
  },
  unbekannt: {
    titel: "Die letzten Änderungen sind nicht gespeichert",
    text: "Woran es lag, ist von hier aus nicht zu erkennen. Ein zweiter Versuch ist "
      + "der erste Schritt; hilft er nicht, sichere die Arbeit als Datei.",
    nochmal: true, hilfe: true,
  },
};

export function NichtGespeichert({ lage, melde, aufGeloest }) {
  const [laeuft, setLaeuft] = useState(false);
  const [code, setCode] = useState("");
  if (!lage) return null;
  const l = SPEICHERLAGE[lage.art] || SPEICHERLAGE.unbekannt;

  const nochmal = async () => {
    setLaeuft(true);
    try {
      const erg = await SP.nochmalSchreiben();
      if (erg.ok) { aufGeloest(); melde("Gespeichert."); }
      else melde("Es hat wieder nicht geklappt.");
    } catch { melde("Es hat wieder nicht geklappt."); }
    finally { setLaeuft(false); }
  };

  /* Anmelden muss in diesem Reiter geschehen, nicht in einem zweiten.

     Bei einer 401 verwirft speicher.js den Zugangsschlüssel — richtig, denn
     er ist tot. Nur: Ein neues Fenster legt seinen Schlüssel dort ab, wo
     dieser Reiter ihn nicht sieht. Der Rat „melde dich nebenan an und komm
     zurück" führte deshalb geradewegs in dieselbe Meldung. */
  const anmeldenUndSenden = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLaeuft(true);
    try {
      await SP.anmelden(c, SP.wirdGemerkt());
      const erg = await SP.nochmalSchreiben();
      if (erg.ok) { aufGeloest(); melde("Angemeldet und gespeichert."); }
      else melde("Angemeldet — das Speichern hat trotzdem nicht geklappt.");
    } catch (e) { melde(String(e.message || e)); }
    finally { setLaeuft(false); }
  };

  const sichern = () => {
    const b = SP.ausstehenderBestand();
    if (!b) return melde("Es liegt nichts mehr aus.");
    const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (lade(`centric-ungespeichert-${marke}.json`, JSON.stringify(b, null, 2),
      "application/json;charset=utf-8"))
      melde("Als Datei gesichert.");
  };

  return (
    <div role="alert" style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 20,
      background: C.dangerLight, border: `1px solid ${C.danger}44` }}>
      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{l.titel}</div>
      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
        {l.text}</p>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        {l.nochmal && <Btn kind="primary" size="sm" disabled={laeuft} onClick={nochmal}>
          {laeuft ? "Wird gesendet …" : "Noch einmal senden"}</Btn>}
        {l.neuAnmelden && (<>
          <Inp value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") anmeldenUndSenden(); }}
            placeholder="Zugangscode" aria-label="Zugangscode"
            style={{ width: 190, textTransform: "uppercase", letterSpacing: ".05em" }} />
          <Btn kind="primary" size="sm" disabled={laeuft || !code.trim()} onClick={anmeldenUndSenden}>
            {laeuft ? "Läuft …" : "Anmelden und senden"}</Btn>
        </>)}
        {/* Der Ausweg, der nichts voraussetzt — kein Netz, keine Sitzung,
            kein Recht. Er funktioniert immer. */}
        <Btn size="sm" onClick={sichern}>Als Datei sichern</Btn>
        {l.neuladen && <Btn size="sm" kind="quiet"
          onClick={() => window.location.reload()}>Seite neu laden</Btn>}
        {l.hilfe && <a href={hilfeVerweis({ betreff: "CENTRIC — Speichern schlägt fehl",
          zusatz: `Lage: ${lage.art}\nMeldung: ${lage.text}\nZeit: ${lage.zeit}` })}
          style={{ fontSize: 13, color: C.accent }}>Uns schreiben</a>}
        <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
          {lage.text}</span>
      </div>
    </div>);
}

export function Konfliktfenster({ lage, onSchliessen, onUebernehmen, melde }) {
  const rahmen = useRef(null);
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onSchliessen(); };
    window.addEventListener("keydown", f);
    if (rahmen.current) rahmen.current.focus();
    return () => window.removeEventListener("keydown", f);
  }, [onSchliessen]);

  const monate = Array.isArray(lage && lage.monate) ? lage.monate : [];
  const kern = !!(lage && lage.kernBetroffen);
  const wer = (lage && lage.durch) || "jemand anderes";
  const wann = lage && lage.zeit ? new Date(lage.zeit) : null;

  const sichern = () => {
    const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (lade(`centric-mein-stand-${marke}.json`, JSON.stringify(lage.meiner ?? null, null, 2),
      "application/json;charset=utf-8")) melde("Als Datei gesichert.");
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Gleichzeitig bearbeitet"
      style={{ position: "fixed", inset: 0, background: "var(--c-ueberlagerung)",
        backdropFilter: "blur(6px)", zIndex: 90, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 20 }}>
      <div ref={rahmen} tabIndex={-1} className="blatt"
        style={{ maxWidth: 560, padding: 28, outline: "none" }}>
        <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 10 }}>
          {kern
            ? "Die Stammdaten wurden gleichzeitig geändert"
            : monate.length === 1
              ? `${monate[0]} wurde gleichzeitig bearbeitet`
              : monate.length > 1
                ? `${monate.length} Monate wurden gleichzeitig bearbeitet`
                : "Gleichzeitig bearbeitet"}
        </div>

        <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
          {wer} hat gespeichert
          {wann && `, während du gearbeitet hast — zuletzt um ${
            wann.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}.
          Arbeit in verschiedenen Monaten führt CENTRIC von selbst zusammen;
          hier überschneidet sie sich wirklich.
        </p>

        {monate.length > 0 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {monate.map((mo) => <Pill key={mo} tone="warn" size="sm">{mo}</Pill>)}
          </div>)}

        <div style={{ display: "grid", gap: 10, marginBottom: 6 }}>
          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Neu laden</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Du siehst den Stand von {wer}. Deine Änderungen seit dem letzten
              Speichern sind weg.</div>
            <Btn size="sm" kind="primary" onClick={() => window.location.reload()}>
              Neu laden</Btn>
          </div>

          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Meinen Stand nehmen</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Dein Stand wird gespeichert. Was {wer}
              {monate.length ? ` in ${monate.join(", ")}` : ""} geändert hat, ist
              danach weg — bitte vorher kurz Rücksprache halten.</div>
            <Btn size="sm" kind="danger" onClick={() => {
              if (window.confirm(`Die Änderungen von ${wer}`
                + `${monate.length ? ` in ${monate.join(", ")}` : ""} werden überschrieben. `
                + "Das lässt sich nicht rückgängig machen.")) onUebernehmen();
            }}>Meinen Stand übernehmen</Btn>
          </div>

          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Erst einmal sichern</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Legt deinen Stand als Datei ab. Nichts geht verloren, gespeichert
              ist damit aber auch nichts.</div>
            <Btn size="sm" onClick={sichern}>Als Datei sichern</Btn>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Btn kind="quiet" onClick={onSchliessen}>Später entscheiden</Btn>
        </div>
      </div>
    </div>);
}

/* ==========================================================================
   OHNE NETZ

   Der Dienstarbeiter hält den zuletzt geladenen Plan bereit. Das ist genau
   dann nützlich, wenn es zählt — Kellergeschoss, Parkhaus, Funkloch — und
   genau dann gefährlich, wenn niemand merkt, dass der Stand alt ist.

   Deshalb diese Leiste. Sie sagt beides: dass die Verbindung fehlt und wie
   alt das ist, was auf dem Bildschirm steht.
   ========================================================================== */
export function Offlineleiste({ lage }) {
  if (!lage) return null;
  const geholt = lage.geholt ? new Date(lage.geholt) : null;
  const minuten = geholt ? Math.round((Date.now() - geholt.getTime()) / 60000) : null;
  const alter = minuten === null ? null
    : minuten < 2 ? "gerade eben"
      : minuten < 60 ? `vor ${minuten} Minuten`
        : minuten < 1440 ? `vor ${Math.round(minuten / 60)} Stunden`
          : `vor ${Math.round(minuten / 1440)} Tagen`;

  return (
    <div role="status" style={{ padding: "12px 18px", borderRadius: 12, marginBottom: 20,
      background: C.warnLight, border: `1px solid ${C.warn}33`,
      display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, fontWeight: 640 }}>Keine Verbindung</span>
      <span style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, flex: 1, minWidth: 260 }}>
        Der Plan ist lesbar, aber Änderungen lassen sich nicht speichern.
        {alter ? ` Der angezeigte Stand wurde ${alter} geholt.` : ""}
        {" "}Sobald die Verbindung zurück ist, verschwindet dieser Hinweis.
      </span>
    </div>);
}
