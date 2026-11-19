/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { einheitAm, imDienst } from "../../server/lib/fachpruefung.mjs";
import { heute } from "./datum.js";


/* ==========================================================================
   NOTRUF
   Für Alleindienste. Ein Knopf, der Standort und Person an hinterlegte
   Empfänger meldet — und der nicht versehentlich ausgelöst wird.
   ========================================================================== */

export const NOTRUF_ARTEN = {
  hilfe: { label: "Hilfe angefordert", dringend: true,
    text: "Ich brauche Unterstützung am Einsatzort." },
  medizin: { label: "Medizinischer Notfall", dringend: true,
    text: "Verletzung oder medizinischer Zwischenfall." },
  bedrohung: { label: "Bedrohungslage", dringend: true,
    text: "Bedrohung oder Übergriff." },
  technik: { label: "Technischer Ausfall", dringend: false,
    text: "Anlage, Fahrzeug oder Ausrüstung ausgefallen." },
};

/** Wer wird bei einem Notruf unterrichtet? */
export function notrufEmpfaenger(m, personId, datum) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return [];
  const eid = einheitAm(p, datum || heute());
  /* Zuerst die eigene Schichtverantwortung, dann die Planung, dann die
     Leitung. Nicht alle gleichzeitig — sonst fühlt sich niemand zuständig. */
  const stufen = [
    m.personen.filter((x) => x.rolle === "subplaner" && einheitAm(x, datum) === eid),
    m.personen.filter((x) => x.rolle === "planer"),
    m.personen.filter((x) => x.rolle === "leitung"),
  ];
  const out = [];
  for (const s of stufen) for (const x of s)
    if (imDienst(x, datum || heute()) && !out.some((y) => y.id === x.id)) out.push(x);
  return out;
}

/** Offene Notrufe — was noch niemand bestätigt hat. */
export const offeneNotrufe = (m) => (m.notrufe || [])
  .filter((n) => !n.bestaetigt)
  .sort((a, b) => b.zeit.localeCompare(a.zeit));
