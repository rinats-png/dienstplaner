/* Aus src/App.jsx herausgelöst (Abnahme V4, A-3), damit der Bildschirm ohne Browser gerendert geprüft werden kann.
   Text und Aufbau unverändert. Ein Ladefehler bietet nie einen Rollenwechsel an — nur Neu laden, (Betreiber:) Demo
   anlegen und Abmelden. */
import { C } from "../farben.js";
import { Card, Btn } from "../ui/bausteine.jsx";

/** Bildschirm für einen Ladefehler: Text (string) oder { titel, text, neuladen?, demoAnlegen? }. */
export function Ladefehlerseite({ ladefehler, onNeuLaden, onDemoAnlegen, onAbmelden }) {
  const f = typeof ladefehler === "string"
    ? { titel: "Die Daten lassen sich nicht laden", text: ladefehler, neuladen: true }
    : ladefehler;
  return (
    <div className="sw-root"><div style={{ minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "5vh 20px" }}>
      <Card style={{ padding: 30, maxWidth: 520 }}>
        <div role="alert">
          <div style={{ fontSize: 19, fontWeight: 650, marginBottom: 10 }}>{f.titel}</div>
          <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: "0 0 20px" }}>{f.text}</p>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {f.neuladen && <Btn kind="primary" onClick={onNeuLaden}>Neu laden</Btn>}
          {f.demoAnlegen && <Btn kind="primary" onClick={onDemoAnlegen}>Demo-Bestand anlegen</Btn>}
          <Btn onClick={onAbmelden}>Abmelden</Btn>
        </div>
      </Card></div></div>);
}
