/* ==========================================================================
   ZWEI-FAKTOR FÜR VERWALTERSCHLÜSSEL — Ansicht in der Betreiberkonsole (WP-32)

   Ein Verwalterschlüssel öffnet /einrichten. Diese Ansicht richtet für einen
   solchen Schlüssel einen zweiten Faktor ein (TOTP, jede Authenticator-App),
   zeigt seinen Stand und schaltet ihn ab. Die Prüfung selbst steht im Server
   (server/funktionen/einrichten.mjs, server/lib/zweifaktor.mjs) — hier wird
   nur gefragt und angezeigt.

   Der Schlüssel und die Codes bleiben im Zustand dieser Ansicht, nicht im
   Speicher des Browsers. Geheimnis und Wiederherstellungscodes zeigt der
   Server genau einmal; diese Ansicht zeigt sie, bis sie verlassen wird.

   Eigenes Modul, damit App.jsx nur den Einhängepunkt trägt. Die Bausteine
   der Oberfläche (H1, Card, Btn …) kommen als `ui` herein — so sieht die
   Ansicht aus wie der Rest der Konsole, ohne sie zu importieren.
   ========================================================================== */

import { useState } from "react";

async function rufe(methode, pfad, schluessel, { rumpf, code } = {}) {
  const kopf = { authorization: `Bearer ${schluessel}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (code && methode === "GET") kopf["x-centric-zweifaktor"] = code;
  const r = await fetch(pfad, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify({ ...(rumpf || {}), ...(code ? { zweifaktor: code } : {}) }) }) });
  let d = {};
  try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, ...d };
}

export default function BetreiberZweifaktor({ ui }) {
  const [schluessel, setSchluessel] = useState("");
  const [code, setCode] = useState("");
  const [stand, setStand] = useState(null);
  const [einrichtung, setEinrichtung] = useState(null);
  const [wiederherstellung, setWiederherstellung] = useState(null);
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const schritt = async (arbeit) => {
    setLaeuft(true); setMeldung("");
    try { await arbeit(); } catch { setMeldung("Keine Verbindung zum Server."); }
    finally { setLaeuft(false); setCode(""); }
  };
  const fehler = (a) => setMeldung(a.fehler || a.text || `Fehler ${a.status}`);

  const pruefen = () => schritt(async () => {
    const a = await rufe("GET", "/einrichten/zweifaktor", schluessel, { code: code || undefined });
    if (a.status === 200) setStand(a); else fehler(a);
  });
  const beginnen = () => schritt(async () => {
    const a = await rufe("POST", "/einrichten/zweifaktor", schluessel, { rumpf: { aktion: "beginnen" } });
    if (a.status === 200) { setEinrichtung({ geheimnis: a.geheimnis, otpauth: a.otpauth }); setWiederherstellung(null); }
    else fehler(a);
  });
  const bestaetigen = () => schritt(async () => {
    const a = await rufe("POST", "/einrichten/zweifaktor", schluessel, { rumpf: { aktion: "bestaetigen" }, code });
    if (a.status === 200) {
      setEinrichtung(null); setWiederherstellung(a.wiederherstellung || []);
      setStand((s) => ({ ...(s || {}), aktiv: true, ausstehend: false }));
    } else fehler(a);
  });
  const abschalten = () => schritt(async () => {
    const a = await rufe("DELETE", "/einrichten/zweifaktor", schluessel, { code });
    if (a.status === 200) { setStand((s) => ({ ...(s || {}), aktiv: false })); setWiederherstellung(null); setMeldung("Zweiter Faktor abgeschaltet."); }
    else fehler(a);
  });

  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" };
  return (
    <div>
      <ui.H1 rubrik="Betreiber"
        sub="Ein Verwalterschlüssel öffnet /einrichten. Mit einem zweiten Faktor reicht der Schlüssel allein nicht mehr: Jeder Aufruf braucht zusätzlich einen Code aus einer Authenticator-App.">
        Zwei-Faktor</ui.H1>
      <ui.Card>
        <ui.CardHead>Verwalterschlüssel</ui.CardHead>
        <div style={{ padding: 22, display: "grid", gap: 13, maxWidth: 560 }}>
          <ui.Field label="Schlüssel" hint="Bleibt nur in dieser Ansicht und wird nirgends gespeichert.">
            <ui.Inp type="password" autoComplete="off" value={schluessel} onChange={(e) => setSchluessel(e.target.value)} /></ui.Field>
          <ui.Field label="Code aus der App" hint="Sechs Ziffern — oder ein Wiederherstellungscode. Jeder Code gilt einmal.">
            <ui.Inp inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></ui.Field>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ui.Btn onClick={pruefen} disabled={laeuft || !schluessel}>Stand abfragen</ui.Btn>
            {stand && !stand.aktiv && !einrichtung &&
              <ui.Btn kind="primary" onClick={beginnen} disabled={laeuft || !schluessel}>Einrichten</ui.Btn>}
            {einrichtung &&
              <ui.Btn kind="primary" onClick={bestaetigen} disabled={laeuft || !code}>Mit Code bestätigen</ui.Btn>}
            {stand && stand.aktiv &&
              <ui.Btn onClick={abschalten} disabled={laeuft || !code}>Abschalten</ui.Btn>}
          </div>
          {meldung && <div role="status">{meldung}</div>}
          {stand && <div>
            Stand: {stand.aktiv ? "eingerichtet" : stand.ausstehend ? "begonnen, nicht bestätigt" : "nicht eingerichtet"}
            {stand.aktiv && typeof stand.wiederherstellungUebrig === "number" && ` · ${stand.wiederherstellungUebrig} Wiederherstellungscodes übrig`}
            {stand.pflicht && " · Pflicht für alle Verwalterschlüssel"}
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
    </div>
  );
}
