/* ==========================================================================
   ZWEI-FAKTOR — Ansicht in der Betreiberkonsole (WP-32, WP-32b)

   Zwei Arten von Betreiberzugang, je ein Abschnitt:

     Betreibercode         der Zugangscode, mit dem man sich an der Konsole
                           anmeldet. Eingerichtet und abgeschaltet über
                           /api/anmelden (server/lib/betreiber-zweifaktor.mjs);
                           danach verlangt die Anmeldemaske den Code aus der
                           App (ZweifaktorFeld, unten, in main.jsx eingehängt).
     Verwalterschlüssel    der Schlüssel für /einrichten (Skripte).

   Die Prüfung steht im Server; hier wird nur gefragt und angezeigt. Code und
   Schlüssel bleiben im Zustand dieser Ansicht, nicht im Speicher des
   Browsers. Geheimnis und Wiederherstellungscodes zeigt der Server genau
   einmal; diese Ansicht zeigt sie, bis sie verlassen wird.

   Eigenes Modul, damit App.jsx und main.jsx nur Einhängepunkte tragen. Die
   Bausteine der Konsole (H1, Card, Btn …) kommen als `ui` herein.
   ========================================================================== */

import { useState, createContext, useContext } from "react";
import { VerlustWeg } from "./verlustweg.jsx";
import { CODEFELD, AUSWEISFELD } from "./lib/eingabefelder.js";

async function antwortLesen(r) {
  let d = {};
  try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, ...d };
}

/** Verwalterschlüssel: /einrichten/zweifaktor. */
async function verwalterRufen(aktion, schluessel, code) {
  const kopf = { authorization: `Bearer ${schluessel}` };
  if (aktion === "stand") {
    if (code) kopf["x-centric-zweifaktor"] = code;
    return antwortLesen(await fetch("/einrichten/zweifaktor", { headers: kopf }));
  }
  kopf["content-type"] = "application/json";
  const methode = aktion === "abschalten" ? "DELETE" : "POST";
  return antwortLesen(await fetch("/einrichten/zweifaktor", { method: methode, headers: kopf,
    body: JSON.stringify({ ...(methode === "POST" ? { aktion } : {}), ...(code ? { zweifaktor: code } : {}) }) }));
}

/** Betreibercode: /api/anmelden mit zweifaktorAktion — es entsteht dabei keine Sitzung. */
async function betreiberRufen(aktion, zugangscode, code) {
  return antwortLesen(await fetch("/api/anmelden", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ zugangscode: zugangscode.trim().toUpperCase(), zweifaktorAktion: aktion,
      ...(code ? { zweifaktor: code } : {}) }) }));
}

function Abschnitt({ ui, titel, feld, feldHinweis, rufen, pflichtText }) {
  const [ausweis, setAusweis] = useState("");
  const [code, setCode] = useState("");
  const [stand, setStand] = useState(null);
  const [einrichtung, setEinrichtung] = useState(null);
  const [wiederherstellung, setWiederherstellung] = useState(null);
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const schritt = (aktion, nachher) => async () => {
    setLaeuft(true); setMeldung("");
    try {
      const a = await rufen(aktion, ausweis, code.trim() || undefined);
      if (a.status === 200) nachher(a); else setMeldung(a.fehler || a.text || `Fehler ${a.status}`);
    } catch { setMeldung("Keine Verbindung zum Server."); }
    finally { setLaeuft(false); setCode(""); }
  };
  const pruefen = schritt("stand", setStand);
  const beginnen = schritt("beginnen", (a) => { setEinrichtung({ geheimnis: a.geheimnis, otpauth: a.otpauth }); setWiederherstellung(null); });
  const bestaetigen = schritt("bestaetigen", (a) => {
    setEinrichtung(null); setWiederherstellung(a.wiederherstellung || []);
    setStand((s) => ({ ...(s || {}), aktiv: true, ausstehend: false }));
  });
  const abschalten = schritt("abschalten", () => {
    setStand((s) => ({ ...(s || {}), aktiv: false })); setWiederherstellung(null); setMeldung("Zweiter Faktor abgeschaltet.");
  });

  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" };
  return (
    <ui.Card>
      <ui.CardHead>{titel}</ui.CardHead>
      <div style={{ padding: 22, display: "grid", gap: 13, maxWidth: 560 }}>
        <ui.Field label={feld} hint={feldHinweis}>
          <ui.Inp {...AUSWEISFELD} value={ausweis} onChange={(e) => setAusweis(e.target.value)} /></ui.Field>
        <ui.Field label="Code aus der App" hint="Sechs Ziffern — oder ein Wiederherstellungscode. Jeder Code gilt einmal.">
          <ui.Inp {...CODEFELD} value={code} onChange={(e) => setCode(e.target.value)} /></ui.Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ui.Btn onClick={pruefen} disabled={laeuft || !ausweis}>Stand abfragen</ui.Btn>
          {stand && !stand.aktiv && !einrichtung &&
            <ui.Btn kind="primary" onClick={beginnen} disabled={laeuft || !ausweis}>Einrichten</ui.Btn>}
          {einrichtung &&
            <ui.Btn kind="primary" onClick={bestaetigen} disabled={laeuft || !code}>Mit Code bestätigen</ui.Btn>}
          {stand && stand.aktiv &&
            <ui.Btn onClick={abschalten} disabled={laeuft || !code}>Abschalten</ui.Btn>}
        </div>
        {meldung && <div role="status">{meldung}</div>}
        {stand && <div>
          Stand: {stand.aktiv ? "eingerichtet" : stand.ausstehend ? "begonnen, nicht bestätigt" : "nicht eingerichtet"}
          {stand.aktiv && typeof stand.wiederherstellungUebrig === "number" && ` · ${stand.wiederherstellungUebrig} Wiederherstellungscodes übrig`}
          {stand.pflicht && pflichtText}
        </div>}
        {einrichtung && <div style={{ display: "grid", gap: 8 }}>
          <div>In der App erfassen (erscheint nur dieses eine Mal):</div>
          <div style={mono}>{einrichtung.geheimnis}</div>
          <div style={{ ...mono, fontSize: 12 }}>{einrichtung.otpauth}</div>
        </div>}
        {wiederherstellung && wiederherstellung.length > 0 && <div style={{ display: "grid", gap: 6 }}>
          <div>Wiederherstellungscodes — jetzt sicher ablegen, sie erscheinen nur dieses eine Mal:</div>
          <div style={{ ...mono, display: "grid", gridTemplateColumns: "repeat(2, max-content)", gap: "4px 24px" }}>
            {wiederherstellung.map((w) => <span key={w}>{w}</span>)}
          </div>
        </div>}
      </div>
    </ui.Card>
  );
}

export default function BetreiberZweifaktor({ ui }) {
  return (
    <div>
      <ui.H1 rubrik="Betreiber"
        sub="Mit einem zweiten Faktor reicht der Code oder Schlüssel allein nicht mehr: Anmeldung und jeder Verwaltungsaufruf brauchen zusätzlich einen Code aus einer Authenticator-App.">
        Zwei-Faktor</ui.H1>
      <div style={{ display: "grid", gap: 18 }}>
        <Abschnitt ui={ui} titel="Betreibercode (Anmeldung an der Konsole)" feld="Betreibercode"
          feldHinweis="Der Zugangscode, mit dem du dich hier angemeldet hast. Wird nirgends gespeichert."
          rufen={betreiberRufen} pflichtText="" />
        <Abschnitt ui={ui} titel="Verwalterschlüssel (/einrichten)" feld="Schlüssel"
          feldHinweis="Bleibt nur in dieser Ansicht und wird nirgends gespeichert."
          rufen={verwalterRufen} pflichtText=" · Pflicht für alle Verwalterschlüssel" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   SI-P4: Zweiter Faktor für den eigenen Zugangscode — in der Anmeldemaske
   (main.jsx), für Leitung, Planung und Kunde (der Server entscheidet, welche
   Rolle ihn bekommt; andere Codes erhalten 400). Derselbe Weg wie für den
   Betreibercode: /api/anmelden mit zweifaktorAktion, keine Sitzung.
   Die Bausteine sind auf Modulebene definiert, damit die Eingabefelder beim
   Tippen nicht neu entstehen; die Farben kommen über einen Kontext.
   -------------------------------------------------------------------------- */
const FarbenKontext = createContext(/** @type {any} */ ({}));
function ZCard({ children }) {
  const F = useContext(FarbenKontext);
  return <div style={{ marginTop: 18, border: `1px solid ${F.line}`, borderRadius: 14, background: F.bg, color: F.text }}>{children}</div>;
}
function ZCardHead({ children }) {
  return <div style={{ padding: "16px 22px 0", fontSize: 15, fontWeight: 600 }}>{children}</div>;
}
function ZField({ label, hint, children }) {
  const F = useContext(FarbenKontext);
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12.5, color: F.dim }}>
      <span style={{ fontWeight: 600 }}>{label}</span>{children}{hint && <span style={{ lineHeight: 1.45 }}>{hint}</span>}
    </label>);
}
function ZInp(p) {
  const F = useContext(FarbenKontext);
  return <input {...p} style={{ padding: "11px 13px", fontSize: 15, borderRadius: 10, border: `1px solid ${F.line}`,
    background: F.bg, color: F.text, fontFamily: "inherit", boxSizing: "border-box", width: "100%" }} />;
}
function ZBtn({ kind, children, ...p }) {
  const F = useContext(FarbenKontext);
  const primaer = kind === "primary";
  return <button {...p} style={{ padding: "9px 16px", fontSize: 14, fontWeight: 600, borderRadius: 999, fontFamily: "inherit",
    cursor: p.disabled ? "default" : "pointer", border: primaer ? "none" : `1px solid ${F.line}`,
    background: primaer ? F.accent : "transparent", color: primaer ? F.aufAkzent : F.text, opacity: p.disabled ? 0.55 : 1 }}>{children}</button>;
}
const ZUI = { Card: ZCard, CardHead: ZCardHead, Field: ZField, Inp: ZInp, Btn: ZBtn };

/** Zweiter Faktor für den eigenen Zugangscode (Anmeldemaske, SI-P4). `F`: Farben der Maske.
 *  `verlustStart` (WR-6): den Weg „Zugang verloren" gleich aufgeklappt zeigen (Verweis aus dem Feld für den Code aus der App). */
export function ZugangZweifaktor({ F, verlustStart = false }) {
  return (
    <FarbenKontext.Provider value={F}>
      <Abschnitt ui={ZUI} titel="Zweiter Faktor für deinen Zugangscode" feld="Zugangscode"
        feldHinweis="Für Leitung, Planung und Kunde. Der Code wird nirgends gespeichert; es entsteht keine Anmeldung."
        rufen={betreiberRufen} pflichtText=" · Pflicht für diesen Zugang" />
      <ZCard>
        <div style={{ padding: 22, display: "grid", gap: 13, maxWidth: 560 }}>
          <VerlustWeg ui={ZUI} start={verlustStart ? "traeger" : null} />
        </div>
      </ZCard>
    </FarbenKontext.Provider>);
}

/**
 * Das Code-Feld der Anmeldemaske (main.jsx). Erscheint erst, wenn der Server
 * für einen Betreibercode `zweifaktor: "erforderlich"` meldet.
 */
export function ZweifaktorFeld({ wert, setWert, senden, F }) {
  return (
    <div style={{ marginTop: 14 }}>
      <label htmlFor="zweifaktor" style={{ display: "block", fontSize: 12.5, fontWeight: 600,
        color: F.dim, marginBottom: 7 }}>Code aus der Authenticator-App</label>
      <input id="zweifaktor" {...CODEFELD} value={wert} autoFocus
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && senden()}
        placeholder="123456"
        style={{ width: "100%", padding: "13px 15px", fontSize: 17, borderRadius: 12,
          border: `1px solid ${F.line}`, fontFamily: "inherit", letterSpacing: ".06em",
          fontVariantNumeric: "tabular-nums", boxSizing: "border-box", background: F.bg, color: F.text }} />
    </div>
  );
}
