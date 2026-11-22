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
  /* WP-48.5 (Review #348 H1): nach „Gleichzeitig bearbeitet" in einer Sitzung mit Teilspeicherung. */
  vollGesperrt: {
    titel: "Gleichzeitig bearbeitet — bitte neu laden",
    text: "Jemand anderes hat dieselben Angaben gespeichert, seit du geladen hast. Deine letzten Änderungen sind "
      + "noch nicht gespeichert und werden nicht über die andere Fassung geschrieben. Sichere sie als Datei und lade "
      + "dann neu.",
    neuladen: true,
  },
  /* Folgepaket #365: nach „Gleichzeitig bearbeitet" ohne Teilspeicherung — gesendet wird erst nach der Entscheidung. */
  konfliktOffen: {
    titel: "Gleichzeitig bearbeitet — bis zur Entscheidung wird nichts gespeichert",
    text: "Jemand anderes hat dieselben Angaben gespeichert, seit du geladen hast. Damit nichts still überschrieben "
      + "wird, sendet diese Seite nichts mehr, bis du entschieden hast: neu laden (deine ungespeicherten Änderungen "
      + "verwerfen) oder deinen Stand übernehmen. Sichere deine Änderungen vorher bei Bedarf als Datei. Am Telefon "
      + "vor dem Schließen der App entscheiden oder als Datei sichern — sonst sind diese Änderungen weg.",
    konflikt: true,
  },
  /* WP-48.5 (Review #350): Nach einem Löschlauf (auch bei unklarem Ausgang) geht aus dieser Seite nichts mehr hinaus. */
  neuLadenPflicht: {
    titel: "Nach dem Löschlauf bitte die Seite neu laden",
    text: "Bis zum Neuladen wird nichts mehr gespeichert: Jeder Stand dieser Seite kann noch enthalten, was der Löschlauf "
      + "gelöscht hat. Sichere nicht gespeicherte Änderungen als Datei, lade neu und trage sie danach noch einmal ein — "
      + "Gelöschtes bitte nicht wieder einspielen.",
    neuladen: true,
  },
  zuGross: {
    titel: "Der Bestand ist zu groß geworden",
    text: "Der Server hat die Übertragung abgewiesen. Sichere die Arbeit als Datei "
      + "und melde dich bei uns — das lässt sich lösen, aber nicht von hier aus.",
    hilfe: true,
  },
  /* P2-12 (Folgepunkt (1) Review #344): 422 UNGUELTIGER_KALENDERTAG. Ein zweiter Versuch schickte denselben Stand —
     deshalb kein „Noch einmal senden". Der Ausweg: das Datum korrigieren (das nächste Speichern nimmt alles mit) oder
     als Datei sichern, verwerfen und neu laden. Offen (Review #354, Auflage 4, Doku-Rest): Nach einem späteren
     erfolgreichen Speichern bleibt die Leiste stehen, bis sie geschlossen oder neu geladen wird — das Räumen gehört
     in den onGespeichert-Weg von App.jsx (Aktionsfabriken-Gate), nicht in diese Ansicht. */
  kalendertag: {
    titel: "Ein Datum gibt es nicht — die letzten Änderungen sind nicht gespeichert",
    text: "Ein neuer oder geänderter Eintrag trägt ein ungültiges Datum (etwa den 30. Februar). Der Server hat den "
      + "Speichervorgang deshalb abgewiesen; gespeichert wurde nichts, auch keine andere Änderung seit dem letzten "
      + "Speichern. Solange der Eintrag so hier steht, scheitert jedes weitere Speichern. Korrigiere das Datum des Eintrags "
      + "(oder entferne ihn) — das nächste Speichern nimmt dann alle Änderungen mit. Oder verwirf die nicht gespeicherten "
      + "Änderungen und lade neu; sichere sie vorher bei Bedarf als Datei.",
    verwerfen: true,
  },
  /* IMP-6 Oberfläche: Der Server hat eine Änderung an Schichtmodellen oder Zuordnungen abgewiesen (422
     MODELL_VERKUERZT_VERSATZ oder eine inhaltliche 403 aus schichtzuordnungZusammen). Kein Rollenproblem; ein zweiter
     Versuch schickte denselben Stand. Der Text des Servers steht darunter (nur Kennungen, keine Namen). */
  schichtmodell: {
    titel: "Schichtmodell oder Zuordnung nicht gespeichert",
    text: "Der Server hat die Änderung an den Schichtmodellen abgewiesen; gespeichert wurde nichts, auch keine andere "
      + "Änderung seit dem letzten Speichern. Der Grund steht unten. Wer Schichtmodelle pflegt (Planung oder "
      + "Leitung), ändert das Schichtmodell oder die Zuordnung entsprechend — das nächste Speichern nimmt dann alle Änderungen "
      + "mit. Sonst: die nicht gespeicherten Änderungen verwerfen und neu laden; vorher bei Bedarf als Datei sichern.",
    verwerfen: true,
  },
  /* Befund B-L4c / Review #381 (2): Nach dem Sitzungsende hat sich ein anderer Zugang angemeldet (anderer Inhaber).
     speicher.js hat nichts gesendet und die Eingaben der vorherigen Sitzung verworfen; die Seite lädt neu. */
  fremd: {
    titel: "Mit einem anderen Zugang angemeldet — die Seite lädt neu",
    text: "Die nicht gespeicherten Eingaben der vorherigen Sitzung gehören nicht zu diesem Zugang. Sie wurden nicht "
      + "gesendet und sind verworfen. Nach dem Neuladen siehst du den Stand dieses Zugangs.",
    neuladen: true, automatischNeuladen: true,
  },
  unbekannt: {
    titel: "Die letzten Änderungen sind nicht gespeichert",
    text: "Woran es lag, ist von hier aus nicht zu erkennen. Ein zweiter Versuch ist "
      + "der erste Schritt; hilft er nicht, sichere die Arbeit als Datei.",
    nochmal: true, hilfe: true,
  },
};

/** Rückfrage vor dem Verwerfen (Review #354, Auflage 1). Abbrechen: nichts geschieht (der Auftrag bleibt ausstehend,
    kein Neuladen). Bestätigen: gescheiterter und wartender Auftrag verworfen, dann neu laden.
    @returns {boolean} verworfen */
export function verwerfenMitRueckfrage() {
  if (!window.confirm("Alle nicht gespeicherten Änderungen dieser Seite werden verworfen, und die Seite lädt neu. "
    + "Wer sie behalten will, sichert sie vorher als Datei. Jetzt verwerfen?")) return false;
  SP.allesAusstehendeVerwerfen();
  window.location.reload();
  return true;
}

/* Befund B-L4c: Nach dem Sitzungsende hat sich eine andere Sitzung angemeldet (anderer Inhaber: Person, Betrieb oder
   Datenraum). speicher.js hat die Eingaben der vorherigen Sitzung verworfen und nichts gesendet; die Seite lädt neu,
   damit auch die Anzeige nichts der vorherigen Sitzung mehr zeigt. */
function fremdVerworfen(melde) {
  melde("Angemeldet mit einem anderen Zugang — die nicht gespeicherten Eingaben der vorherigen Sitzung wurden verworfen.");
  window.location.reload();
}

/** Review #382 A-a: Text, wenn die Konfliktfrage nach einem Anmeldungswechsel keine gültige Absage mehr hat. */
export const OHNE_ABSAGE_TEXT = "Die Konfliktfrage gehört zur vorherigen Anmeldung und lässt sich hier nicht mehr entscheiden. "
  + "Sichere deine Änderungen bei Bedarf als Datei, verwirf sie dann und lade neu.";

export function NichtGespeichert({ lage, melde, aufGeloest, onKonflikt = null }) {
  const [laeuft, setLaeuft] = useState(false);
  /* Review #381 (1): Enter im Codefeld und der Knopf dürfen keinen zweiten Vorgang starten, solange einer läuft. */
  const laeuftJetzt = useRef(false);
  const [code, setCode] = useState("");
  const automatisch = !!(lage && SPEICHERLAGE[lage.art] && SPEICHERLAGE[lage.art].automatischNeuladen);
  useEffect(() => { if (automatisch) window.location.reload(); }, [automatisch]);
  if (!lage) return null;
  const l = SPEICHERLAGE[lage.art] || SPEICHERLAGE.unbekannt;
  const ohneAbsage = !!l.konflikt && SP.konfliktOhneAbsage();

  const nochmal = async () => {
    if (laeuftJetzt.current) return;
    laeuftJetzt.current = true;
    setLaeuft(true);
    try {
      const erg = await SP.nochmalSchreiben();
      if (erg.fremd) { fremdVerworfen(melde); return; }
      if (erg.ok) { aufGeloest(); melde("Gespeichert."); }
      else melde("Es hat wieder nicht geklappt.");
    } catch { melde("Es hat wieder nicht geklappt."); }
    finally { laeuftJetzt.current = false; setLaeuft(false); }
  };

  /* Anmelden muss in diesem Reiter geschehen, nicht in einem zweiten.

     Bei einer 401 verwirft speicher.js den Zugangsschlüssel — richtig, denn
     er ist tot. Nur: Ein neues Fenster legt seinen Schlüssel dort ab, wo
     dieser Reiter ihn nicht sieht. Der Rat „melde dich nebenan an und komm
     zurück" führte deshalb geradewegs in dieselbe Meldung. */
  const anmeldenUndSenden = async () => {
    const c = code.trim().toUpperCase();
    if (!c || laeuftJetzt.current) return;
    laeuftJetzt.current = true;
    setLaeuft(true);
    try {
      await SP.anmelden(c, SP.wirdGemerkt());
      const erg = await SP.nochmalSchreiben();
      if (erg.fremd) { fremdVerworfen(melde); return; }
      if (erg.ok) { aufGeloest(); melde("Angemeldet und gespeichert."); }
      else melde("Angemeldet — das Speichern hat trotzdem nicht geklappt.");
    } catch (e) { melde(String(e.message || e)); }
    finally { laeuftJetzt.current = false; setLaeuft(false); }
  };

  const sichern = () => {
    const b = SP.ausstehenderBestand();
    if (!b) return melde("Es liegt nichts mehr aus.");
    const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (lade(`centric-ungespeichert-${marke}.json`, JSON.stringify(b, null, 2),
      "application/json;charset=utf-8")) {
      SP.ausstehendGesichert();   // WP-48.5: beforeunload fragt danach nicht mehr (nur nach einem Löschlauf wirksam)
      melde("Als Datei gesichert.");
    }
  };

  return (
    <div role="alert" style={{ padding: "16px 20px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20,
      background: C.dangerLight, border: `1px solid ${C.danger}44` }}>
      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{l.titel}</div>
      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
        {l.text}</p>
      {ohneAbsage && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
        {OHNE_ABSAGE_TEXT}</p>}
      {/* E1 (Review #397): Begründung des Servers zu einer 403 (speicher.js `grund`) — als Text, nie als Markup. */}
      {typeof lage.grund === "string" && lage.grund && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px",
        maxWidth: "72ch", overflowWrap: "anywhere" }}>Begründung: {lage.grund}</p>}
      {l.verwerfen && (lage.bereich || lage.text) && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
        {lage.bereich ? <>Bereich: <strong>{lage.bereich}</strong>. </> : null}{lage.text}</p>}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        {l.konflikt && onKonflikt && !ohneAbsage && <Btn kind="primary" size="sm" onClick={onKonflikt}>Konflikt entscheiden</Btn>}
        {/* Review #382 A-a: ohne gültige Absage nichts zu entscheiden — sichern, dann verwerfen und neu laden. */}
        {ohneAbsage && <Btn size="sm" kind="danger" onClick={() => { verwerfenMitRueckfrage(); }}>
          Änderungen verwerfen und neu laden</Btn>}
        {l.nochmal && <Btn kind="primary" size="sm" disabled={laeuft} onClick={nochmal}>
          {laeuft ? "Wird gesendet …" : "Noch einmal senden"}</Btn>}
        {l.neuAnmelden && (<>
          <Inp value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !laeuft) anmeldenUndSenden(); }}
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
        {/* Folgepunkt (1): verwerfen (gescheitert und wartend), dann neu laden — nur nach Rückfrage. */}
        {l.verwerfen && <Btn size="sm" kind="danger" onClick={() => { verwerfenMitRueckfrage(); }}>
          Änderungen verwerfen und neu laden</Btn>}
        {l.hilfe && <a href={hilfeVerweis({ betreff: "CENTRIC — Speichern schlägt fehl",
          zusatz: `Lage: ${lage.art}\nMeldung: ${lage.text}\nZeit: ${lage.zeit}` })}
          style={{ fontSize: 13, color: C.accent }}>Uns schreiben</a>}
        {/* Review #354: bei „kalendertag" steht der Text schon oben mit dem Bereich — nicht doppelt. */}
        {!l.verwerfen && <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
          {lage.text}</span>}
      </div>
    </div>);
}

/* P2-20 (Hinweis, Verhalten unverändert): „Meinen Stand übernehmen" schickt den ganzen eigenen Stand mit dem ETag
   der Absage; der Server schreibt ihn ohne Abgleich. Ersetzt wird damit auch, was andere seit dem letzten eigenen
   Laden an anderer Stelle geändert haben (weitere Monate, Stammdaten), die der Dialog nicht nennt — das sagt der
   Text ehrlich dazu. Er trägt auch beim reinen Stammdaten-Konflikt ohne Monatsliste. */
const WEITERES_ERSETZT = "Auch weitere Änderungen anderer seit deinem letzten Laden, etwa in anderen Monaten "
  + "oder in den Stammdaten, können dabei ersetzt werden.";

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
      {/* B-P3: auch am Telefon (Telefonschale) — höher als der Bildschirm wird das Blatt in sich gerollt, nicht abgeschnitten. */}
      <div ref={rahmen} tabIndex={-1} className="blatt"
        style={{ maxWidth: 560, padding: 28, outline: "none", maxHeight: "100%", overflowY: "auto" }}>
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
              {lage && lage.selbstAbgleich
                ? `Du siehst den Stand von ${wer}. Deine Änderungen seit dem letzten Speichern sind dann weg. `
                  + "Lädst du nicht neu, bleiben sie erhalten: Beim nächsten Speichern gleicht CENTRIC sie mit dem gespeicherten "
                  + "Stand ab und fragt bei Überschneidungen nach."
                : <>Du siehst den Stand von {wer}. Deine Änderungen seit dem letzten
              Speichern sind weg.</>}</div>
            {/* Folgepaket #365: ohne Teilweg sichtbar verwerfen (Rückfrage), sonst schickte das Schließen nichts, aber
                der Browser fragte „Seite verlassen?". Mit Teilweg (ohneUebernehmen) unverändert. */}
            <Btn size="sm" kind="primary" onClick={() => {
              if (lage && lage.ohneUebernehmen) window.location.reload(); else verwerfenMitRueckfrage(); }}>
              Neu laden</Btn>
          </div>

          {/* WP-48.5 (Entscheidung 6.4): War in dieser Sitzung der Teilweg aktiv, gibt es kein blindes Übernehmen —
              auch nicht im Rückfall auf den Voll-PUT. Ohne Teilweg bleibt die Karte wie bisher. */}
          {!(lage && lage.ohneUebernehmen) && <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Meinen Stand nehmen</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Dein Stand wird gespeichert. Was {wer}
              {monate.length ? ` in ${monate.join(", ")}` : ""} geändert hat, ist
              danach weg. {WEITERES_ERSETZT} Bitte vorher kurz Rücksprache halten.</div>
            <Btn size="sm" kind="danger" onClick={() => {
              if (window.confirm(`Die Änderungen von ${wer}`
                + `${monate.length ? ` in ${monate.join(", ")}` : ""} werden überschrieben. `
                + `${WEITERES_ERSETZT} `
                + "Das lässt sich nicht rückgängig machen.")) onUebernehmen();
            }}>Meinen Stand übernehmen</Btn>
          </div>}

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
    <div role="status" style={{ padding: "12px 18px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20,
      background: C.warnLight, border: `1px solid ${C.warn}33`,
      display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, fontWeight: 640 }}>Keine Verbindung</span>
      {/* min(): auch in der Telefonschale bei 320 px kein waagrechtes Scrollen (B-P2). */}
      <span style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, flex: 1, minWidth: "min(260px, 100%)" }}>
        Der Plan ist lesbar, aber Änderungen lassen sich nicht speichern.
        {alter ? ` Der angezeigte Stand wurde ${alter} geholt.` : ""}
        {" "}Sobald die Verbindung zurück ist, verschwindet dieser Hinweis.
      </span>
    </div>);
}
