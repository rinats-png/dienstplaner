import { useState } from "react";
import * as SP from "../speicher.js";
import { Btn, Card, CardHead, Lab, Sel } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { ROLLENBEZEICHNUNG } from "../lib/rollen.js";
import { vergebbareRollen } from "../../server/lib/rollenvergabe.mjs";

/* ==========================================================================
   EINLADUNGEN (WP-18)

   Einladungen — für die Organisationsleitung, im Bereich Personal: eine
   Person aus der Personalliste wählen, Einladung ausstellen, weitergeben.
   Die Leitung sieht nur die Einladung, nie den späteren Zugangscode.

   EinladungAnnehmen — auf der Anmeldeseite: Die eingeladene Person gibt die
   Einladung ein und bekommt genau einmal ihren persönlichen Zugangscode.

   Die Liste hier ist Bedienkomfort. Wer welche Person einladen darf, welche
   Rolle daraus wird und ob schon ein Code existiert, entscheidet der Server
   (server/lib/einladungen.mjs).
   ========================================================================== */

const personName = (p) => [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || String(p.id);
const bisText = (ms) => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit" });

/** Wen kann diese Sitzung grundsätzlich einladen? Nur aktive Personen mit einer Rolle unter der eigenen. */
export function einladbarePersonen(sitz) {
  const m = sitz && sitz.mandant;
  const eigene = sitz && sitz.person && sitz.person.rolle;
  const erlaubt = vergebbareRollen(eigene);
  if (!m || !Array.isArray(m.personen) || !erlaubt.length) return [];
  return m.personen.filter((p) => p && !p.anonym && (p.status === undefined || p.status === "aktiv")
    && erlaubt.includes(p.rolle) && String(p.id) !== String(sitz.person.id));
}

export function Einladungen({ sitz, api = SP }) {
  const personen = einladbarePersonen(sitz);
  const [wahl, setWahl] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);

  if (!personen.length) return null;

  const ausstellen = async () => {
    if (!wahl || laeuft) return;
    setLaeuft(true); setFehler(null); setErgebnis(null);
    try { setErgebnis(await api.einladungAusstellen(wahl)); }
    catch (e) { setFehler(String((e && e.message) || e)); }
    finally { setLaeuft(false); }
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <CardHead>Zugang einladen</CardHead>
      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 12px", maxWidth: "70ch" }}>
        Eine Person aus der Personalliste einladen. Sie löst die Einladung auf der Anmeldeseite ein und
        bekommt dabei ihren persönlichen Zugangscode — mit der Rolle, die in der Personalliste steht.
        Die Einladung gilt sieben Tage und genau einmal.</p>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <Sel value={wahl} onChange={(e) => setWahl(e.target.value)} aria-label="Person für die Einladung">
          <option value="">Person wählen …</option>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>{personName(p)} · {ROLLENBEZEICHNUNG[p.rolle] || p.rolle}</option>))}
        </Sel>
        <Btn kind="primary" size="sm" disabled={!wahl || laeuft} onClick={ausstellen}>
          {laeuft ? "Wird ausgestellt …" : "Einladung ausstellen"}</Btn>
      </div>
      {fehler && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.danger }}>{fehler}</div>}
      {ergebnis && (
        <div role="status" style={{ marginTop: 14 }}>
          <Lab>Einladung für {ergebnis.person && ergebnis.person.name} · {ROLLENBEZEICHNUNG[ergebnis.rolle] || ergebnis.rolle}</Lab>
          <code data-einladung style={{ display: "block", marginTop: 6, padding: "10px 12px", borderRadius: 10,
            border: `1px solid ${C.line}`, wordBreak: "break-all", fontSize: 13.5, userSelect: "all" }}>
            {ergebnis.einladung}</code>
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.dim }}>
            Gültig bis {bisText(ergebnis.bis)}. Nur an diese Person weitergeben. Eine neue Einladung für
            dieselbe Person macht diese ungültig.</div>
        </div>)}
    </Card>);
}

/** Auf der Anmeldeseite: ein Verweis, der das Einlösen aufklappt. Eigener Zustand, damit die Anmeldeseite keinen braucht. */
export function EinladungEinstieg({ api = SP, F = C }) {
  const [offen, setOffen] = useState(false);
  return (
    <div style={{ marginTop: 18, maxWidth: 430 }}>
      <button onClick={() => setOffen((o) => !o)} aria-expanded={offen}
        style={{ border: "none", background: "transparent", color: F.accent, fontFamily: "inherit",
          fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
        {offen ? "Einladung schließen" : "Ich habe eine Einladung"}</button>
      {offen && <EinladungAnnehmen api={api} F={F} />}
    </div>);
}

export function EinladungAnnehmen({ api = SP, F = C }) {
  const [einladung, setEinladung] = useState("");
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
