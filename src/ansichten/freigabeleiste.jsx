/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { freigabeStand, planungssicherheit, offeneAbweichungen } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { pad, dim_ } from "../regelwerk.js";
import { Card, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";

/* =========================== FREIGABE DES PLANS ========================== */
export function Freigabeleiste({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const f = freigabeStand(m, ym);
  const darfFreigeben = darf(sitz, "plan.publish");
  const sicher = planungssicherheit(m, ym);
  const [y, mo] = ym.split("-").map(Number);
  const offen = [...offeneAbweichungen(m, `${ym}-01`, `${ym}-${pad(dim_(y, mo - 1))}`).values()];
  const offenRecht = offen.filter((b) => b.stufe === "recht").length;
  return (
    <Card style={{ padding: "14px 20px", marginBottom: 18, display: "flex", alignItems: "center",
      gap: 16, flexWrap: "wrap" }}>
      <Pill tone={f ? "ok" : "warn"}>{f ? `Freigegeben · Stand ${f.stand}` : "Entwurf"}</Pill>
      <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: C.dim }}>
        {f
          ? `Veröffentlicht ${f.zeit} durch ${f.durch}. Änderungen danach lösen eine Mitteilung an die Betroffenen aus.`
          : "Der Plan ist noch nicht verbindlich. Beschäftigte sehen ihn als Entwurf."}
      </div>
      {sicher.gesamt > 0 && (
        <Pill tone={sicher.anteil > 30 ? "danger" : sicher.anteil > 15 ? "warn" : "ok"}>
          {sicher.kurzfristig} von {sicher.gesamt} Änderungen kurzfristig
        </Pill>)}
      {offen.length > 0 && (
        /* Die Freigabe bleibt immer möglich (E-19). Sie zeigt nur, was bewusst abweicht. */
        <Pill tone={offenRecht ? "danger" : "warn"}>
          {offen.length} bestätigte Abweichung{offen.length === 1 ? "" : "en"}{offenRecht ? `, davon ${offenRecht} ${offenRecht === 1 ? "Rechtsverstoß" : "Rechtsverstöße"}` : ""}
        </Pill>)}
      {darfFreigeben && <Btn kind={f ? "plain" : "primary"} onClick={() => {
        if (offen.length && typeof window !== "undefined" && !window.confirm(
          `Im Plan stehen ${offen.length} bewusst bestätigte Abweichungen${offenRecht ? `, davon ${offenRecht} gegen gesetzliche Vorgaben` : ""}. `
          + "Sie sind in der Prüfung einzeln aufgeführt. Plan trotzdem freigeben?")) return;
        akt.freigeben(ym); }}>
        {f ? "Erneut freigeben" : "Plan freigeben"}</Btn>}
    </Card>);
}
