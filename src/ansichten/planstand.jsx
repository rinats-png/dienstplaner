/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { Card, CardHead, Lab, Leer, Avatar, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { Kennzahlen, Leitraster, Seitenkarte, Balkenzeile } from "../gestalt/ansichten.jsx";
import { NUM } from "../ui/thema.js";
import { fKurz } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { planVergleich } from "../lib/fachlogik.js";
import { freigabeStand } from "../lib/fachlogik.js";

/* ========================== PLANSTAND-VERGLEICH ========================= */
export function Planstand({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const v = useMemo(() => planVergleich(m, ym), [m, ym]);
  const fg = freigabeStand(m, ym);

  if (!v.hatStand) return (
    <Card style={{ padding: 26 }}>
      <div style={{ fontSize: 15, fontWeight: 620, marginBottom: 8 }}>Kein Vergleichsstand vorhanden</div>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
        Sobald der Monat freigegeben wird, hält CENTRIC den damaligen Stand fest. Jede spätere Änderung
        erscheint dann hier — mit Vorlauf und Betroffenen. Das beantwortet die häufigste Frage im
        Schichtbetrieb: „Ich hatte doch Frühdienst?"
      </div>
    </Card>);

  const kurz = v.zeilen.filter((z) => z.vorlauf < 14).length;
  const summe = Math.max(1, v.wechsel + v.zusatz + v.entfall);
  return (
    <div>
      <Kennzahlen min={165} kacheln={[
        { label: "Änderungen seit Freigabe", wert: v.zeilen.length, ton: v.zeilen.length > 20 ? "warn" : "accent",
          sub: fg ? `Stand ${fg.stand} · ${v.zeit}` : "" },
        { label: "Zusätzlich", wert: v.zusatz, ton: v.zusatz ? "warn" : "ok" },
        { label: "Entfallen", wert: v.entfall },
        { label: "Getauscht", wert: v.wechsel, ton: "accent" },
        { label: "Kurzfristig", wert: kurz, ton: kurz ? "danger" : "ok", hervor: kurz ? "danger" : undefined,
          sub: "unter 14 Tagen Vorlauf" }]} />

      <Leitraster seiteBreite={340}
        haupt={
          <Card>
            <CardHead right={<Lab>nach Datum</Lab>}>Was sich geändert hat</CardHead>
            {v.zeilen.length === 0
              ? <Leer titel="Unverändert" text="Seit der Freigabe wurde nichts am Plan geändert." />
              : v.zeilen.slice(0, 80).map((z, i) => (
                <div key={i} className="listenzeile" style={{ padding: "11px 22px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: C.dim, minWidth: 82, ...NUM }}>{fKurz(z.datum)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 190 }}>
                    <Avatar person={z.person} size="sm" style={{ width: 26, height: 26, fontSize: 10 }} />
                    <span style={{ fontSize: 13.5 }}>{z.person.nachname}, {z.person.vorname}</span></span>
                  <span style={{ fontSize: 13, color: C.dim }}>{z.von}</span>
                  <span style={{ color: C.dim, display: "flex" }}><Icon n="pfeil-rechts" size={15} /></span>
                  <span style={{ fontSize: 13, fontWeight: 600,
                    color: z.richtung === "zusatz" ? C.warn : z.richtung === "entfall" ? C.dim : C.accent }}>{z.nach}</span>
                  {z.vorlauf < 14 && z.vorlauf >= 0 && <Pill size="sm" tone="danger">{z.vorlauf} Tage Vorlauf</Pill>}
                </div>))}
          </Card>}
        seite={<>
          {fg && (
            <Seitenkarte titel="Stand der Freigabe" rechts={<Pill size="sm" tone="ok">festgehalten</Pill>}>
              <div style={{ fontSize: 26, fontWeight: 350, letterSpacing: "-.03em", ...NUM }}>{fg.stand}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
                Veröffentlicht {fg.zeit} durch {fg.durch}.</div>
            </Seitenkarte>)}
          <Seitenkarte titel="Nach Art der Änderung">
            <Balkenzeile label="Getauscht" wert={v.wechsel} anteil={(v.wechsel / summe) * 100} ton="accent" />
            <Balkenzeile label="Zusätzlich" wert={v.zusatz} anteil={(v.zusatz / summe) * 100} ton="warn" />
            <Balkenzeile label="Entfallen" wert={v.entfall} anteil={(v.entfall / summe) * 100} ton="neutral" />
            <Erklaerkasten style={{ marginTop: 12 }}>
              Kurzfristig heißt: weniger als 14 Tage zwischen der Änderung und dem betroffenen Diensttag.
            </Erklaerkasten>
          </Seitenkarte>
        </>} />
    </div>);
}
