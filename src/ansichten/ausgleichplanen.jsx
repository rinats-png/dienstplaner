/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { heute, fKurz } from "../lib/datum.js";
import { useMemo } from "react";
import { ausgleichTage, ausgleichBedarf } from "../lib/fachlogik.js";
import { Sheet, Zelle } from "../ui/leisten.jsx";
import { Lab, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { sgnIst, n1 } from "../lib/format.js";

export function AusgleichPlanen({ sitz, personId, akt, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const ym = heute().slice(0, 7);
  /* Hooks vor dem vorzeitigen Aussteigen.

     Vorher stand `if (!p) return null;` über dem useMemo. Fehlt die Person
     bei einem Rendern und ist beim nächsten da, ändert sich die Zahl der
     Hooks — React bricht dann mit „Rendered more hooks than during the
     previous render" ab. Der Linter hat es gefunden. */
  const tage = useMemo(() => p ? ausgleichTage(m, p, heute(), 12) : [], [m, p, personId]);
  if (!p) return null;
  const a = ausgleichBedarf(m, p, ym);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  return (
    <Sheet open onClose={onClose} titel={`Freizeitausgleich · ${p.vorname} ${p.nachname}`} width={620}>
      <div className="karte" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 22, flexWrap: "wrap" }}>
        <div><Lab>Stundenkonto</Lab><div style={{ fontSize: 22, fontWeight: 650, color: C.warn, ...NUM }}>{sgnIst(a.kto)} h</div></div>
        <div><Lab>Über der Grenze</Lab><div style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{n1(a.ueber)} h</div></div>
        <div><Lab>Freischichten nötig</Lab><div style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{Math.ceil(a.ueber / (a.mittel || 8))}</div></div>
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
        Eine Freischicht nimmt den geplanten Dienst heraus und schreibt die Stunden nicht gut —
        das Konto sinkt entsprechend. Vorgeschlagen werden nur Tage, an denen die Besetzung es trägt.
      </div>
      <Lab style={{ marginBottom: 10 }}>Geeignete Tage</Lab>
      {tage.map((t) => (
        <div key={t.datum} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
          padding: "11px 13px", marginBottom: 7, opacity: t.moeglich ? 1 : .55 }}>
          <span style={{ fontSize: 13, color: C.dim, minWidth: 74, ...NUM }}>{fKurz(t.datum)}</span>
          <Zelle da={map[t.dienstId]} size={26} />
          <div style={{ flex: 1, fontSize: 12.5, color: t.moeglich ? C.ok : C.danger }}>
            {t.moeglich ? `Besetzung trägt es (${t.puffer > 0 ? "+" : ""}${t.puffer})` : "Besetzung ist bereits knapp"}
          </div>
          <Btn size="sm" kind={t.moeglich ? "primary" : "quiet"}
            onClick={() => { akt.planeFreischicht(p.id, t.datum); onClose(); }}>Freischicht</Btn>
        </div>))}
    </Sheet>);
}
