/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays, between } from "../regelwerk.js";
import { heute } from "./datum.js";
import { personTag, stundenkonto, hindernisBefunde, auslastung, wunschAm, rangGruende } from "./fachlogik.js";


/* ==========================================================================
   OFFENE SCHICHTEN
   Wenn jemand ausfällt, ruft die Planung heute zehn Leute an. Stattdessen:
   die Lücke sichtbar machen, wer kann und will meldet sich, die Planung
   entscheidet mit einem Griff.

   Der Unterschied zu Anbietern aus der Gastronomie: Dort bewirbt man sich
   auf alles. Hier zeigen wir jeder Person nur, was sie tatsächlich
   übernehmen darf — Ruhezeit, Qualifikation, Abwesenheit und harte Sperren
   sind vorher geprüft. Wer sich meldet, kann auch eingeteilt werden.
   ========================================================================== */

/** Eine Ausschreibung ist eine Lücke, die zur Bewerbung freigegeben wurde. */
export const OFFEN_STATUS = {
  offen: { label: "offen", ton: "accent" },
  vergeben: { label: "vergeben", ton: "ok" },
  zurueckgezogen: { label: "zurückgezogen", ton: null },
};

/**
 * Alle Ausschreibungen, die heute oder später liegen und noch offen sind.
 * Vergangene werden nicht gelöscht — sie bleiben im Nachweis.
 */
export function offeneSchichten(m, abDatum) {
  const ab = abDatum || heute();
  return (m.ausschreibungen || [])
    .filter((a) => a.status === "offen" && a.datum >= ab)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Darf diese Person sich auf diese Ausschreibung bewerben?
 * Gibt den Grund zurück, wenn nicht — die Person soll erfahren, warum ein
 * Dienst für sie nicht erscheint, statt ihn gar nicht zu sehen.
 */
export function darfSichBewerben(m, personId, a) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return { darf: false, grund: "Person unbekannt" };
  if (a.status !== "offen") return { darf: false, grund: "nicht mehr offen" };
  if (a.datum < heute()) return { darf: false, grund: "liegt in der Vergangenheit" };
  if (!imDienst(p, a.datum)) return { darf: false, grund: "an diesem Tag nicht beschäftigt" };
  if ((a.bewerbungen || []).some((b) => b.personId === personId))
    return { darf: false, grund: "bereits beworben" };

  /* Wer an dem Tag schon eingeteilt ist, kann nicht zusätzlich. Geprüft wird
     gegen die Dienstarten des Betriebs — eine feste Kennung wie „F" wäre
     falsch, weil sie in vielen Betrieben der Frühdienst ist. Das ist keine
     Regel, sondern technisch: Eine Person hat je Tag einen Planeintrag. */
  const eigen = personTag(m, p, a.datum);
  if (eigen && eigen.dienstId && m.dienstarten.some((x) => x.id === eigen.dienstId))
    return { darf: false, grund: "an diesem Tag bereits eingeteilt" };

  /* Dieselbe Prüfung wie bei der Ersatzsuche. Seit E-19 hindert ein
     warnender Befund die Bewerbung nicht: Die Person sieht den Hinweis und
     darf sich trotzdem melden; die Planung entscheidet mit dem Warndialog.
     Ein sperrender Befund (SPERR_REGELN) hindert — wie im Integrationsstand. */
  const da = m.dienstarten.find((x) => x.id === a.dienstId);
  const bef = da ? hindernisBefunde(m, p, a.datum, da) : [];
  const sperre = bef.find((b) => b.sperrt);
  if (sperre) return { darf: false, grund: sperre.text, hindernisse: [sperre.text] };
  const h = bef.map((b) => b.text);
  return h.length ? { darf: true, hinweise: h } : { darf: true };
}

/** Darf sich bewerben, und nichts spricht dagegen — wer so steht, wird benachrichtigt. */
export const bewerbbarOhneHinweis = (m, personId, a) => {
  const r = darfSichBewerben(m, personId, a);
  return r.darf && !(r.hinweise || []).length;
};

/** Die Ausschreibungen, die einer Person offenstehen. */
export const meineOffenenSchichten = (m, personId) =>
  offeneSchichten(m).filter((a) => darfSichBewerben(m, personId, a).darf);

/**
 * Reihenfolge der Bewerbungen. Wer zuerst kommt, steht nicht automatisch
 * oben — sonst gewinnt, wer am häufigsten auf das Telefon schaut. Stattdessen
 * dieselben Kriterien wie beim Ersatzvorschlag: Stundenkonto, Auslastung,
 * wie oft jemand zuletzt eingesprungen ist.
 */
export function bewerbungenGeordnet(m, a) {
  const liste = (a.bewerbungen || []).map((b) => {
    const p = m.personen.find((x) => x.id === b.personId);
    if (!p) return null;
    return { ...b, person: p, gruende: rangGruende(m, { person: p }, a.datum, a.dienstId),
      punkte: bewerbungsPunkte(m, p, a) };
  }).filter(Boolean);
  return liste.sort((x, y) => y.punkte - x.punkte);
}

/** Je höher, desto eher sollte diese Person den Zuschlag bekommen. */
export function bewerbungsPunkte(m, p, a) {
  const ym = a.datum.slice(0, 7);
  let punkte = 0;
  const konto = stundenkonto(m, p, ym);
  const alle = m.personen.filter((x) => imDienst(x, a.datum) && x.imSchichtdienst !== false);
  const konten = alle.map((x) => stundenkonto(m, x, ym)).filter((k) => k !== null);
  const mittel = konten.reduce((s, k) => s + k, 0) / (konten.length || 1);
  /* Wer unter dem Mittel liegt, hat Vorrang — das gleicht die Konten aus.
     Ohne Ist-Daten (Rollenschutz) zählt das Konto nicht. */
  if (konto !== null) punkte += Math.max(-40, Math.min(40, (mittel - konto) * 0.8));
  /* Wer zuletzt oft eingesprungen ist, tritt zurück. */
  const letzte = (m.ausschreibungen || []).filter((x) => x.status === "vergeben"
    && x.vergebenAn === p.id && x.datum >= addDays(heute(), -90)).length;
  punkte -= letzte * 12;
  /* Ein hinterlegter Wunsch zählt positiv. */
  const w = wunschAm(m, p.id, a.datum);
  if (w && w.art === "moechte") punkte += 15;
  if (w && w.art === "lieber_nicht") punkte -= 25;
  /* Springer sind für genau solche Fälle da. */
  if (p.springer) punkte += 20;
  /* Auslastung: wer Luft hat, zuerst. */
  const au = auslastung(m, p, ym);
  if (au.pct < 85) punkte += 10; else if (au.pct > 105) punkte -= 15;
  return Math.round(punkte * 10) / 10;
}

/** Wie steht es um eine Ausschreibung? Für die Übersicht der Planung. */
export function ausschreibungLage(m, a) {
  const bew = bewerbungenGeordnet(m, a);
  const moeglich = m.personen.filter((p) => imDienst(p, a.datum)
    && bewerbbarOhneHinweis(m, p.id, { ...a, bewerbungen: [] })).length;
  const tage = between(heute(), a.datum);
  return { bewerbungen: bew, anzahl: bew.length, moeglich, tage,
    dringend: tage <= 2 && !bew.length,
    beste: bew[0] || null };
}
