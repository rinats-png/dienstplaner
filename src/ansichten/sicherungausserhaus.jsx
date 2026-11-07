/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useCallback, useEffect } from "react";
import { darf } from "../lib/berechtigung.js";
import * as SP from "../speicher.js";
import { Card, CardHead, Lab, Btn, Field, Inp, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { fDatum } from "../lib/datum.js";
import { lade } from "../lib/download.js";

/* ==========================================================================
   AUSSTIEGSSICHERHEIT
   Wer seine Dienstplanung auf ein System stellt, muss jederzeit vollständig
   wieder herauskommen. Diese Ansicht beantwortet die Frage nach der
   Abhängigkeit vom Anbieter — bevor sie im Vertragsgespräch gestellt wird.
   ========================================================================== */
/* ==========================================================================
   SICHERUNG AUSSER HAUS

   Die Datenmitnahme gibt CSV-Dateien aus. Gut zum Weiterverarbeiten,
   ungeeignet als Sicherung: Sie läuft im Browser, sie braucht einen
   Menschen, der daran denkt, und sie gibt nicht alles her.

   Eine Sicherung, die im selben Haus liegt wie das Original, ist keine.
   Für eine außer Haus braucht es zwei Dinge: eine vollständige Datei und
   einen Weg, sie ohne Browser zu holen.

   Der Sicherungsschlüssel darf genau eines — lesen. Er kann nichts ändern,
   nichts löschen und sich nicht anmelden. Damit lässt sich ein nächtliches
   Skript einrichten, ohne einen Zugang aus der Hand zu geben, der den
   Betrieb umschreiben könnte.
   ========================================================================== */
export function SicherungAusserHaus({ sitz, melde }) {
  const [schluessel, setSchluessel] = useState([]);
  const [widerrufen, setWiderrufen] = useState([]);
  const [info, setInfo] = useState({ aktiv: 0, grenze: 5, standardTage: 90, warnung: "" });
  const [neu, setNeu] = useState(null);
  const [tage, setTage] = useState(90);
  const [laeuft, setLaeuft] = useState(false);
  const darfEs = darf(sitz, "org.edit");

  const laden = useCallback(() => {
    if (!darfEs) return;
    SP.schluesselUebersicht().then((u) => {
      setSchluessel(u.schluessel); setWiderrufen(u.widerrufen);
      setInfo({ aktiv: u.aktiv, grenze: u.grenze, standardTage: u.standardTage, warnung: u.warnung });
    }).catch(() => {});
  }, [darfEs]);
  useEffect(() => { laden(); }, [laden]);

  if (!darfEs) return null;

  const ausgeben = async () => {
    setLaeuft(true);
    try {
      const d = await SP.vollausgabe();
      const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (lade(`centric-vollausgabe-${marke}.json`, JSON.stringify(d, null, 2),
        "application/json;charset=utf-8")) melde("Vollausgabe heruntergeladen.");
    } catch (e) { melde(String(e.message || e)); }
    finally { setLaeuft(false); }
  };

  const anlegen = async () => {
    setLaeuft(true);
    try {
      const d = await SP.schluesselAnlegen(tage);
      setNeu(d);
      laden();
    } catch (e) { melde(String(e.message || e)); }
    finally { setLaeuft(false); }
  };

  const befehl = (k) => `curl -sS -H "Authorization: Bearer ${k}" \\\n  `
    + `${window.location.origin}/api/vollausgabe \\\n  `
    + `-o centric-$(date +%F).json`;

  return (
    <Card>
      <CardHead right={<Lab>{info.aktiv} von {info.grenze} aktiv</Lab>}>
        Sicherung außer Haus</CardHead>
      <div style={{ padding: 22 }}>
        <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 16px", maxWidth: "72ch" }}>
          Eine Sicherung, die im selben Haus liegt wie das Original, ist keine.
          Die Vollausgabe enthält den kompletten Bestand in einer Datei — alles,
          woraus sich der Betrieb wiederherstellen lässt.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <Btn kind="primary" disabled={laeuft} onClick={ausgeben}>
            {laeuft ? "Läuft …" : "Vollausgabe herunterladen"}</Btn>
        </div>

        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 18 }}>
          <Lab style={{ marginBottom: 8 }}>Ohne Browser — für ein nächtliches Skript</Lab>
          <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
            Ein Sicherungsschlüssel darf ausschließlich lesen. Er kann nichts
            ändern, nichts löschen und sich nicht anmelden. Er erscheint genau
            einmal — danach ist nur noch der Hashwert gespeichert.
          </p>

          {neu && (
            <div style={{ padding: "14px 16px", borderRadius: "var(--r)", marginBottom: 16,
              background: C.okLight, border: `1px solid ${C.ok}44` }}>
              <div style={{ fontSize: 14, fontWeight: 640, marginBottom: 8 }}>
                Schlüssel angelegt — gültig bis {fDatum(neu.gueltigBis.slice(0, 10))}</div>
              <code style={{ display: "block", fontFamily: "ui-monospace, monospace",
                fontSize: 12.5, wordBreak: "break-all", background: C.flaeche,
                padding: "9px 11px", borderRadius: 8, marginBottom: 10 }}>{neu.schluessel}</code>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>
                Jetzt notieren. Er wird nicht wieder angezeigt.</div>
              <pre style={{ margin: 0, padding: "10px 12px", borderRadius: 8,
                background: C.flaecheStill, color: C.text, border: `1px solid ${C.lineSoft}`, fontSize: 12,
                overflowX: "auto", lineHeight: 1.5 }}>{befehl(neu.schluessel)}</pre>
              <div style={{ marginTop: 10 }}>
                <Btn size="sm" onClick={() => setNeu(null)}>Verstanden, ausblenden</Btn></div>
            </div>)}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
            marginBottom: 16 }}>
            <Field label="Gültig für Tage" hint={`Standard ${info.standardTage} Tage. Eine längere Laufzeit (bis ein Jahr) wählst du hier bewusst.`}>
              <Inp type="number" min={1} max={365} value={tage} style={{ width: 110 }}
                onChange={(e) => setTage(Number(e.target.value))} /></Field>
            <Btn disabled={laeuft || info.aktiv >= info.grenze} onClick={anlegen}>Schlüssel anlegen</Btn>
          </div>
          {info.aktiv >= info.grenze && (
            <div role="status" style={{ fontSize: 12.5, color: C.dim, marginBottom: 12 }}>
              Es gibt schon {info.grenze} aktive Schlüssel. Widerrufe einen, den du nicht mehr brauchst; es wird nichts automatisch gelöscht.</div>)}
          {info.warnung && (
            <div role="note" style={{ fontSize: 12.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>{info.warnung}</div>)}
          {widerrufen.length > 0 && (
            <div role="alert" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Widerrufene Schlüssel — Sicherungen mit diesen Schlüsseln laufen nicht mehr. Lege einen neuen Schlüssel an und trage ihn in der Sicherung ein.</div>
              {widerrufen.map((k) => (
                <div key={k.kennung} className="karte-still" style={{ display: "flex", gap: 12, alignItems: "center",
                  padding: "8px 13px", marginBottom: 6, flexWrap: "wrap", borderRadius: "var(--r)" }}>
                  <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{k.kennung}…</code>
                  <span style={{ fontSize: 12.5, color: C.dim, flex: 1, minWidth: 160 }}>{k.text}</span>
                  <Pill size="sm" tone="danger">widerrufen</Pill>
                </div>))}
            </div>)}

          {schluessel.length > 0 && (<div>
            {schluessel.map((k) => (
              <div key={k.kennung} className="karte-still" style={{ display: "flex", gap: 12,
                alignItems: "center", padding: "10px 13px", marginBottom: 7, flexWrap: "wrap", borderRadius: "var(--r)" }}>
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
                  {k.kennung}…</code>
                <span style={{ fontSize: 12.5, color: C.dim, flex: 1, minWidth: 160 }}>
                  angelegt {fDatum(String(k.angelegt).slice(0, 10))}</span>
                <Pill size="sm" tone={k.abgelaufen ? "danger" : "ok"}>
                  {k.abgelaufen ? "abgelaufen" : `bis ${fDatum(k.gueltigBis.slice(0, 10))}`}</Pill>
                <Btn size="sm" kind="danger" onClick={async () => {
                  if (!window.confirm("Der Schlüssel wird sofort ungültig. Ein Skript, "
                    + "das ihn benutzt, sichert danach nichts mehr.")) return;
                  try { await SP.schluesselWiderrufen(k.kennung); melde("Widerrufen."); laden(); }
                  catch (e) { melde(String(e.message || e)); }
                }}>Widerrufen</Btn>
              </div>))}
          </div>)}
        </div>
      </div>
    </Card>);
}
