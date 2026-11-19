/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { ISTDATEN_TEXT } from "../istdaten.js";
import { einheitAm, imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays, montag, dauer, fenster, stundengrenzeHinweis, istNachtdienst } from "../regelwerk.js";
import { heute, fLang, fKurz } from "./datum.js";
import { n1, sgn } from "./format.js";
import { stufeRang, ruhezeitStufe } from "../warnstufen.js";
import { pruefeSchicht as ppugvPruefen } from "../ppugv.js";
import { abwesenheitAm, personTag, stundenkonto, pruefen, wochenStundenGeplant, hindernisBefunde, istFachkraft } from "./fachlogik.js";


/* ==========================================================================
   MANDANTENRECHNER
   Wie viele Planer-Zugänge, wie viele große Standorte — daraus ergibt sich
   der monatliche Preis. Die Zahl der Beschäftigten geht nicht mehr ein.
   ========================================================================== */

/* `preisFuer` steht in stufen.js: dieselbe Rechnung wie `preis(db, m)`,
   nur ohne einen echten Mandanten dahinter — für den Mandantenrechner,
   in dem der Betreiber eine Größe durchspielt, bevor es sie gibt, und
   für den öffentlichen Rechner vor der Anmeldung. */

/** Kapazität einer Woche mit und ohne die ausgewählten Anträge. */
export function wochenKapazitaet(m, wochen, probeAnfragen) {
  const start = montag(heute());
  const mitProbe = probeAnfragen && probeAnfragen.length
    ? { ...m, abwesenheiten: [...m.abwesenheiten, ...probeAnfragen.map((a) => ({
        id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "Probe" }))] }
    : m;
  const out = [];
  for (let w = 0; w < wochen; w++) {
    const von = addDays(start, w * 7), bis = addDays(von, 6);
    const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    const dann = pruefen(mitProbe, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    // Auslastungsgrad: wie viele Personen sind in dieser Woche abwesend?
    let abw = 0, gesamt = 0;
    for (const p of m.personen) {
      if (!imDienst(p, von) || p.imSchichtdienst === false) continue;
      gesamt++;
      for (let i = 0; i < 7; i++) if (abwesenheitAm(mitProbe, p.id, addDays(von, i))) { abw++; break; }
    }
    out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
      neu: Math.max(0, dann.length - jetzt.length),
      quote: gesamt ? Math.round((abw / gesamt) * 100) : 0,
      stand: dann.length > jetzt.length ? "kippt" : dann.length ? "eng" : "frei" });
  }
  return out;
}

/* ============================== MONATSPLAN =============================== */
/* --------------------------------------------------------------------------
   MONATSLAGE

   Die Frage einer Planerin lautet nicht „wie sieht der Monat aus", sondern
   „wo muss ich ran". Bis hierher musste sie dafür rund fünfhundert Zellen
   absuchen — die Antwort stand im Raster, aber nirgends als Antwort.

   Ausgewertet wird, was ohnehin schon berechnet ist: besetzung() läuft für
   jeden Tag des Monats. Hier wird daraus nur eine Rangfolge.
   -------------------------------------------------------------------------- */
export function monatsLage(m, tage, bes) {
  const treffer = [];
  for (const d of tage) {
    const je = bes[d] || {};
    let stufe = 0;
    const gruende = [];
    for (const [dienstId, b] of Object.entries(je)) {
      const da = m.dienstarten.find((x) => x.id === dienstId);
      const name = da ? da.kurz || da.name : dienstId;
      if (b.status === "danger") {
        stufe = 2;
        gruende.push(`${name} ${b.anzahl - b.soll}`);
      } else if (b.status === "warn") {
        stufe = Math.max(stufe, 1);
        gruende.push(`${name} ${b.anzahl - b.soll}`);
      }
      /* Eine fehlende Fachkraft wiegt schwerer als eine fehlende Kraft:
         Die Quote ist in der Pflege nachweispflichtig. */
      if (b.qualFehlt) { stufe = 2; gruende.push(`${name} Quote`); }
    }
    if (stufe) treffer.push({ datum: d, stufe, text: gruende.slice(0, 2).join(" · ") });
  }
  return {
    tage: treffer,
    dringend: treffer.filter((x) => x.stufe === 2).length,
    knapp: treffer.filter((x) => x.stufe === 1).length,
  };
}

/* ==========================================================================
   SCHNELLBESETZUNG — aus dem Lagebild heraus
   Zeigt vor dem Eintragen, welche Folgen die Einteilung hätte, und bietet
   als Alternative die Anfrage über einen Nachrichtendienst an.
   ========================================================================== */
/** Was passiert, wenn diese Person diesen Dienst übernimmt? */
export function folgenPruefen(m, person, datum, dienstId) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { hindernisse: [], hinweise: [] };
  /* Einmal geprüft (WP-11): Hindernisse ab „Achtung" — darin auch die
     weichen Schutzregeln, wie im Warndialog —, als Hinweis nur nicht
     Bewertbares und die Wochenstundengrenze. Kein Befund doppelt. */
  const bef = hindernisBefunde(m, person, datum, da);
  const hind = bef.filter((b) => stufeRang(b.stufe) >= 2).map((b) => b.text);
  const hinweise = bef.filter((b) => b.stufe === "hinweis").map((b) => ({ art: "warn", text: b.text }));
  const grenze = stundengrenzeHinweis(person, da, datum, () => wochenStundenGeplant(m, person, datum));
  if (grenze) hinweise.push({ art: "warn", text: grenze.text });
  const map = Object.fromEntries(m.dienstarten.map((x) => [x.id, x]));

  // Folgeschichten in beide Richtungen ausdrücklich benennen
  for (const off of [-1, 1]) {
    const dd = addDays(datum, off);
    const t = personTag(m, person, dd);
    if (!t.dienstId) continue;
    const other = map[t.dienstId];
    if (!other) continue;
    const [nS, nE] = fenster(datum, da);
    const [oS, oE] = fenster(dd, other);
    const ruhe = off > 0 ? (oS - nE) / 60 : (nS - oE) / 60;
    /* Dieselbe Bewertung wie in hindernisBefunde (ruhezeitStufe): Gesetz
       unterschritten → danger, nur Betriebsgrenze → warn. Bis WP-11 rechnete
       folgenPruefen mit eigener Grenze und meldete beides als danger. */
    const rs = ruhezeitStufe(ruhe, m.einstellungen.ruhezeit);
    hinweise.push({ art: rs === "recht" ? "danger" : rs ? "warn" : "info",
      text: off > 0
        ? `Am Folgetag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h`
        : `Am Vortag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h` });
  }
  // Dienste in Folge nach der Einteilung
  let serie = 1;
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, -i)).dienstId) serie++; else break; }
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, i)).dienstId) serie++; else break; }
  if (serie > m.einstellungen.maxFolge)
    hinweise.push({ art: "danger", text: `Ergibt ${serie} Dienste am Stück, Grenzwert ist ${m.einstellungen.maxFolge}` });
  else if (serie >= m.einstellungen.maxFolge - 1)
    hinweise.push({ art: "warn", text: `Ergibt ${serie} Dienste am Stück` });

  // Wochenarbeitszeit
  const mo = montag(datum);
  let std = dauer(da);
  for (let i = 0; i < 7; i++) { const t = personTag(m, person, addDays(mo, i));
    if (t.dienstId && addDays(mo, i) !== datum) { const x = map[t.dienstId]; if (x) std += dauer(x); } }
  if (std > 48) hinweise.push({ art: "danger", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche — über der Höchstgrenze von 48 h` });
  else if (std > 44) hinweise.push({ art: "warn", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche` });

  const kto = stundenkonto(m, person, datum.slice(0, 7));
  /* Ohne Ist-Daten keine Hochrechnung — null + Dauer wäre eine erfundene Zahl. */
  hinweise.push({ art: "info", text: kto === null ? `Stundenkonto: ${ISTDATEN_TEXT}` : `Stundenkonto danach etwa ${sgn(kto + dauer(da))} h` });
  return { hindernisse: hind, hinweise, dienstart: da };
}

/** Vorformulierte Anfrage für einen Nachrichtendienst. */
export function anfrageText(m, datum, dienstId, fehlt) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  return [
    `${m.name} — kurzfristige Dienstanfrage`,
    ``,
    `${fLang(datum)}`,
    `${da ? `${da.name}, ${da.start} bis ${da.ende} Uhr` : dienstId}`,
    da && da.ort ? `Ort: ${da.ort}` : ``,
    fehlt > 0 ? `Es fehlen ${fehlt} Personen.` : `Verstärkung gesucht.`,
    ``,
    `Wer übernehmen kann, bitte kurz zurückmelden.`,
  ].filter(Boolean).join("\n");
}

/** Die Schicht-für-Schicht-Prüfung einer Einheit für die Tage eines Monats.
 *  Steht als eigene Funktion, weil Untergrenzen und Startseite dieselbe
 *  Antwort brauchen — gerechnet wird nur in ppugv.js. */
export function ppugvZeilen(m, einheit, tage) {
  if (!einheit) return [];
  /* Welche Dienstart zählt als Tag-, welche als Nachtschicht? Der Betrieb
     entscheidet das über das Nachtkennzeichen der Dienstart. */
  const schichtVon = (da) => (istNachtdienst(da) ? "nacht" : "tag");
  const aus = [];
  for (const d of tage) {
    for (const schicht of ["tag", "nacht"]) {
      const imDienstHeute = m.personen.filter((p) => {
        if (!imDienst(p, d)) return false;
        if (einheitAm(p, d) !== einheit.id) return false;
        const t = personTag(m, p, d);
        if (!t.dienstId) return false;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        return da && schichtVon(da) === schicht;
      });
      const fach = imDienstHeute.filter((p) => istFachkraft(m, p)).length;
      const hilf = imDienstHeute.length - fach;
      const b = (m.belegung || {})[`${einheit.id}|${d}|${schicht}`] || {};
      aus.push({ datum: d, schicht,
        ...ppugvPruefen({ bereich: einheit.ppugvBereich || null, schicht, datum: d,
          patienten: b.patienten === undefined ? null : b.patienten,
          fachkraefte: fach, hilfskraefte: hilf }),
        erfasst: b.patienten !== undefined && b.patienten !== null && b.patienten !== "" });
    }
  }
  return aus;
}
