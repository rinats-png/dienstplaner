/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { pufferZustandText } from "../stempelvorgang.js";
import { Btn } from "../ui/bausteine.jsx";

/* WP-07: Stempel im Puffer des Geräts — vorläufig (offline gespeichert),
   bestätigt oder abgelehnt mit Grund. Nur die eigenen (Inhaber der Sitzung);
   ein abgelehnter verschwindet nicht still, sondern bleibt, bis die Person
   ihn erneut senden lässt oder zur Kenntnis nimmt. */
export function StempelPuffer({ akt }) {
  const [liste, setListe] = useState([]);
  const [dauerhaft, setDauerhaft] = useState(true);
  useEffect(() => {
    let lebt = true;
    SP.stempelEreignisse().then((l) => { if (lebt) setListe(l); });
    SP.stempelPufferDauerhaft().then((d) => { if (lebt) setDauerhaft(d); });
    const ab = SP.stempelBeobachten((l) => { if (lebt) setListe(l); });
    return () => { lebt = false; ab(); };
  }, []);
  if (!liste.length) return null;
  return (
    <div role="status" aria-live="polite" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.45, textAlign: "left" }}>
      {liste.map((ev) => {
        const zeit = new Date(ev.erfasstAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        const ton = ev.zustand === "abgelehnt" ? C.danger : ev.zustand === "wartet" ? C.warn : C.ok;
        return (<div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "3px 0", ...NUM }}>
          <span>{ev.art === "start" ? "Beginn" : "Ende"} {zeit}</span>
          <span style={{ color: ton, fontWeight: 600 }}>{pufferZustandText(ev)}</span>
          {ev.zustand === "abgelehnt" && <Btn size="sm" kind="quiet" onClick={() => akt.stempelErneut(ev.id)}>Erneut senden</Btn>}
          {ev.zustand !== "wartet" && <Btn size="sm" kind="quiet" onClick={() => akt.stempelVerwerfen(ev.id)}>Zur Kenntnis</Btn>}
        </div>);
      })}
      {!dauerhaft && liste.some((e) => e.zustand === "wartet") && <div style={{ color: C.warn }}>
        Dieses Gerät kann den Stempel nicht dauerhaft ablegen — bitte die Anwendung offen lassen, bis das Netz zurück ist.</div>}
    </div>);
}
