import { useEffect, useState } from "react";
import * as SP from "../speicher.js";
import { Btn, Card, CardHead, Inp, Lab, Sel } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { ROLLENBEZEICHNUNG } from "../lib/rollen.js";
import { vergebbareRollen } from "../../server/lib/rollenvergabe.mjs";

/* ==========================================================================
   EINLADUNGEN (WP-18)

   Einladungen — für die Organisationsleitung, im Bereich Personal: eine
   Person aus der Personalliste wählen, Einladung ausstellen (mit frischer
   Bestätigung der eigenen Anmeldung, B1), weitergeben — als Code zum
   Abtippen oder als Link. Darunter die Liste der Einladungen des Betriebs
   mit Status; offene lassen sich widerrufen (B2). Die Einladung selbst
   erscheint nur direkt nach dem Ausstellen, in der Liste nie wieder.

   Die Einladung ist ein Inhaberschlüssel: Wer sie hat, bekommt den Code.
   Jede Einlösung steht deshalb in der Liste („eingelöst", „neu").

   EinladungAnnehmen — auf der Anmeldeseite (und unter /einladung): Die
   eingeladene Person gibt die Einladung ein — oder öffnet den Link, dann
   steht sie schon im Feld — und bekommt genau einmal ihren Zugangscode.

   Der Link trägt die Einladung im Fragment (nach „#"): Ein Fragment geht
   nie an den Server und nie in einen Referrer. Gelesen wird es einmal,
   beim Laden, und sofort aus der Adresszeile entfernt (history.replaceState).
   Die Seite /einladung liefert der Server mit Referrer-Policy no-referrer
   und derselben CSP wie die Anwendung (nur eigene Ressourcen). Der Link
   ersetzt keine Prüfung: Eingelöst wird wie beim Abtippen, am Server.

   Die Liste hier ist Bedienkomfort. Wer welche Person einladen darf, welche
   Rolle daraus wird und ob schon ein Code existiert, entscheidet der Server
   (server/lib/einladungen.mjs).
   ========================================================================== */

const personName = (p) => [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || String(p.id);
const bisText = (ms) => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit" });

/* ----------------------------- Link und Fragment ----------------------------- */

const FRAGMENT = "einladung=";
/** Die Seite, auf die der Link zeigt (server.mjs liefert sie mit Referrer-Policy no-referrer). */
export const EINLOESESEITE = "/einladung";

/** Der Link zu einer Einladung: das Token im Fragment, nie im Pfad oder in der Abfrage. */
export function einladungsLink(herkunft, token) {
  return `${String(herkunft || "").replace(/\/+$/, "")}${EINLOESESEITE}#${FRAGMENT}${encodeURIComponent(String(token || ""))}`;
}

/** Das Token aus einem Fragment („#einladung=…"), sonst null. */
export function tokenAusFragment(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!h.startsWith(FRAGMENT)) return null;
  let t;
  try { t = decodeURIComponent(h.slice(FRAGMENT.length)); } catch { return null; }
  return /^[A-Za-z0-9_-]{20,200}$/.test(t) ? t : null;
}

let mitgebracht = null;

/**
 * Liest die Einladung aus der Adresse und entfernt sie sofort daraus (history.replaceState) — auch ohne
 * gültige Form, damit nichts im Verlauf stehen bleibt. Gibt das Token zurück, sonst null.
 * @param {any} win  das Fenster (in Prüfungen ein Ersatz)
 */
export function einladungAusAdresse(win) {
  try {
    const loc = win && win.location;
    if (!loc || !String(loc.hash || "").startsWith(`#${FRAGMENT}`)) return null;
    const t = tokenAusFragment(loc.hash);
    if (win.history && typeof win.history.replaceState === "function")
      win.history.replaceState(null, "", `${loc.pathname || "/"}${loc.search || ""}`);
    if (t) mitgebracht = t;
    return t;
  } catch { return null; }
}

/** Einmal abholen: Danach ist das mitgebrachte Token aus dem Speicher der Seite. */
export function mitgebrachteEinladung() {
  const t = mitgebracht;
  mitgebracht = null;
  return t;
}

/* Beim Laden der Anwendung, vor allem anderen: Das Fragment verschwindet aus der Adresszeile, gleich ob
   jemand angemeldet ist oder nicht. */
if (typeof window !== "undefined") einladungAusAdresse(window);

/* ------------------------------- Leitung ------------------------------------ */

/** Wen kann diese Sitzung grundsätzlich einladen? Nur aktive Personen mit einer Rolle unter der eigenen. */
export function einladbarePersonen(sitz) {
  const m = sitz && sitz.mandant;
  const eigene = sitz && sitz.person && sitz.person.rolle;
  const erlaubt = vergebbareRollen(eigene);
  if (!m || !Array.isArray(m.personen) || !erlaubt.length) return [];
  return m.personen.filter((p) => p && !p.anonym && (p.status === undefined || p.status === "aktiv")
    && erlaubt.includes(p.rolle) && String(p.id) !== String(sitz.person.id));
}

export const STATUS_TEXT = { offen: "offen", eingeloest: "eingelöst", widerrufen: "widerrufen",
  abgelaufen: "abgelaufen", verbraucht: "verbraucht, kein Zugang" };

const BESTAETIGUNG = {
  zweifaktor: { label: "Code aus der App", typ: "text", hinweis: "Zur Bestätigung den aktuellen Code aus der Authenticator-App eingeben." },
  zugangscode: { label: "Eigener Zugangscode", typ: "password", hinweis: "Zur Bestätigung den eigenen Zugangscode eingeben, mit dem du angemeldet bist." },
  passwort: { label: "Passwort", typ: "password", hinweis: "Zur Bestätigung dein Passwort eingeben." },
};

/** Die Liste der Einladungen — nur Metadaten. */
export function EinladungsListe({ liste, neu = 0, onWiderrufen, laeuft }) {
  if (!Array.isArray(liste) || !liste.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <Lab>Einladungen dieses Betriebs</Lab>
      {neu > 0 && (
        <div role="status" style={{ marginTop: 6, fontSize: 13, color: C.text }}>
          {neu === 1 ? "Eine Einladung wurde" : `${neu} Einladungen wurden`} seit deinem letzten Blick eingelöst.
          War das nicht die eingeladene Person, bitte den Zugang sperren und neu einladen.</div>)}
      <table style={{ width: "100%", marginTop: 8, fontSize: 13, borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", color: C.dim }}>
          <th>Person</th><th>Rolle</th><th>Ausgestellt</th><th>Gültig bis</th><th>Status</th><th /></tr></thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id} data-status={e.status} style={{ borderTop: `1px solid ${C.line}` }}>
              <td>{e.person && e.person.name}</td>
              <td>{ROLLENBEZEICHNUNG[e.rolle] || e.rolle}</td>
              <td>{e.ausgestellt ? bisText(Date.parse(e.ausgestellt)) : ""}</td>
              <td>{bisText(e.bis)}</td>
              <td>{STATUS_TEXT[e.status] || e.status}{e.am && e.status !== "offen" ? ` (${bisText(Date.parse(e.am))})` : ""}
                {e.neu ? " · neu" : ""}{e.ersetzt ? " · durch neuere ersetzt" : ""}</td>
              <td>{e.status === "offen" && onWiderrufen && (
                <Btn size="sm" disabled={laeuft} onClick={() => onWiderrufen(e.id)}>Widerrufen</Btn>)}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}

export function Einladungen({ sitz, api = SP }) {
  const personen = einladbarePersonen(sitz);
  const [wahl, setWahl] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [frage, setFrage] = useState(null);          // B1: welche Bestätigung der Server verlangt
  const [antwort, setAntwort] = useState("");
  const [liste, setListe] = useState(null);

  const laden = async () => {
    if (!api.einladungenListe) return;
    try { setListe(await api.einladungenListe()); } catch { /* die Liste ist Komfort */ }
  };
  useEffect(() => { if (personen.length) laden(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!personen.length) return null;

  const ausstellen = async () => {
    if (!wahl || laeuft) return;
    setLaeuft(true); setFehler(null); setErgebnis(null);
    try {
      const best = frage && antwort.trim() ? { [frage]: antwort.trim() } : undefined;
      setErgebnis(await api.einladungAusstellen(wahl, best));
      setFrage(null); setAntwort("");
      laden();
    } catch (e) {
      if (e && e.status === 403 && e.bestaetigung && BESTAETIGUNG[e.bestaetigung]) setFrage(e.bestaetigung);
      setFehler(String((e && e.message) || e));
    } finally { setLaeuft(false); setAntwort(""); }
  };

  const widerrufen = async (id) => {
    if (laeuft) return;
    setLaeuft(true); setFehler(null);
    try { await api.einladungWiderrufen(id); await laden(); }
    catch (e) { setFehler(String((e && e.message) || e)); }
    finally { setLaeuft(false); }
  };

  const link = ergebnis && typeof window !== "undefined" ? einladungsLink(window.location.origin, ergebnis.einladung) : null;

  return (
    <Card style={{ marginTop: 16 }}>
      <CardHead>Zugang einladen</CardHead>
      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 12px", maxWidth: "70ch" }}>
        Eine Person aus der Personalliste einladen. Sie löst die Einladung auf der Anmeldeseite ein (oder öffnet den
        Link) und bekommt dabei ihren persönlichen Zugangscode — mit der Rolle, die in der Personalliste steht.
        Die Einladung gilt sieben Tage und genau einmal. Wer sie hat, kann sie einlösen: nur der Person selbst geben.</p>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <Sel value={wahl} onChange={(e) => setWahl(e.target.value)} aria-label="Person für die Einladung">
          <option value="">Person wählen …</option>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>{personName(p)} · {ROLLENBEZEICHNUNG[p.rolle] || p.rolle}</option>))}
        </Sel>
        {frage && (
          <Inp type={BESTAETIGUNG[frage].typ} value={antwort} onChange={(e) => setAntwort(e.target.value)}
            aria-label={BESTAETIGUNG[frage].label} placeholder={BESTAETIGUNG[frage].label} autoComplete="off" />)}
        <Btn kind="primary" size="sm" disabled={!wahl || laeuft || (frage && !antwort.trim())} onClick={ausstellen}>
          {laeuft ? "Wird ausgestellt …" : "Einladung ausstellen"}</Btn>
      </div>
      {frage && <div style={{ marginTop: 8, fontSize: 12.5, color: C.dim }}>{BESTAETIGUNG[frage].hinweis}</div>}
      {fehler && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.danger }}>{fehler}</div>}
      {ergebnis && (
        <div role="status" style={{ marginTop: 14 }}>
          <Lab>Einladung für {ergebnis.person && ergebnis.person.name} · {ROLLENBEZEICHNUNG[ergebnis.rolle] || ergebnis.rolle}</Lab>
          <code data-einladung style={{ display: "block", marginTop: 6, padding: "10px 12px", borderRadius: 10,
            border: `1px solid ${C.line}`, wordBreak: "break-all", fontSize: 13.5, userSelect: "all" }}>
            {ergebnis.einladung}</code>
          {link && (<>
            <Lab style={{ marginTop: 10 }}>Oder als Link</Lab>
            <code data-link style={{ display: "block", marginTop: 6, padding: "10px 12px", borderRadius: 10,
              border: `1px solid ${C.line}`, wordBreak: "break-all", fontSize: 13, userSelect: "all" }}>{link}</code>
          </>)}
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.dim }}>
            Gültig bis {bisText(ergebnis.bis)}. Nur an diese Person weitergeben — sie erscheint hier nur jetzt.
            Eine neue Einladung für dieselbe Person macht diese ungültig.</div>
        </div>)}
      {liste && <EinladungsListe liste={liste.einladungen} neu={liste.neuEingeloest} onWiderrufen={widerrufen} laeuft={laeuft} />}
    </Card>);
}

/* ------------------------------ Anmeldeseite --------------------------------- */

/** Auf der Anmeldeseite: ein Verweis, der das Einlösen aufklappt. Eigener Zustand, damit die Anmeldeseite keinen braucht.
    Kam die Seite über einen Einladungslink, ist das Feld schon offen und gefüllt. */
export function EinladungEinstieg({ api = SP, F = C }) {
  const [vorgabe] = useState(() => mitgebrachteEinladung());
  const [offen, setOffen] = useState(!!vorgabe);
  return (
    <div style={{ marginTop: 18, maxWidth: 430 }}>
      <button onClick={() => setOffen((o) => !o)} aria-expanded={offen}
        style={{ border: "none", background: "transparent", color: F.accent, fontFamily: "inherit",
          fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
        {offen ? "Einladung schließen" : "Ich habe eine Einladung"}</button>
      {offen && <EinladungAnnehmen api={api} F={F} vorgabe={vorgabe || ""} />}
    </div>);
}

export function EinladungAnnehmen({ api = SP, F = C, vorgabe = "" }) {
  const [einladung, setEinladung] = useState(vorgabe);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);

  const annehmen = async () => {
    const e = einladung.trim();
    if (!e || laeuft) return;
    setLaeuft(true); setFehler(null);
    try { setErgebnis(await api.einladungAnnehmen(e)); setEinladung(""); }
    catch (x) { setFehler(String((x && x.message) || x)); }
    finally { setLaeuft(false); }
  };

  if (ergebnis) return (
    <div role="status" style={{ marginTop: 14, fontSize: 13.5, color: F.text, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600 }}>Dein persönlicher Zugangscode
        ({ROLLENBEZEICHNUNG[ergebnis.rolle] || ergebnis.rolle}, {ergebnis.name})</div>
      <code data-zugangscode style={{ display: "block", margin: "8px 0", padding: "12px 14px", borderRadius: 12,
        border: `1px solid ${F.line}`, fontSize: 18, letterSpacing: ".08em", userSelect: "all" }}>
        {ergebnis.zugangscode}</code>
      <div style={{ color: F.dim }}>Er wird nur dieses eine Mal angezeigt. Bitte jetzt notieren und damit
        oben anmelden. Gib ihn an niemanden weiter — er gehört nur dir.</div>
    </div>);

  return (
    <div style={{ marginTop: 14 }}>
      <label htmlFor="einladung" style={{ display: "block", fontSize: 12.5, fontWeight: 600,
        color: F.dim, marginBottom: 7 }}>Einladung</label>
      <input id="einladung" value={einladung} onChange={(e) => setEinladung(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && annehmen()} autoComplete="off" spellCheck={false}
        placeholder="Einladung einfügen"
        style={{ width: "100%", padding: "11px 13px", fontSize: 14, borderRadius: 12, boxSizing: "border-box",
          border: `1px solid ${fehler ? F.danger : F.line}`, fontFamily: "inherit", background: F.bg, color: F.text }} />
      {fehler && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: F.danger, lineHeight: 1.45 }}>{fehler}</div>}
      <button onClick={annehmen} disabled={!einladung.trim() || laeuft}
        style={{ marginTop: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, borderRadius: 999, border: "none",
          fontFamily: "inherit", cursor: einladung.trim() && !laeuft ? "pointer" : "default",
          background: einladung.trim() && !laeuft ? F.accent : F.lineStark, color: F.aufAkzent }}>
        {laeuft ? "Wird geprüft …" : "Einladung einlösen"}</button>
    </div>);
}
