
/* ==========================================================================
   ERWEITERTER RECHENKERN
   Krankmeldung und Ersatzsuche · Personenbezogene Einschränkungen ·
   Freigabe und Rückkanal · Ist-Erfassung · Verteilungsgerechtigkeit ·
   Anteilige Abrechnung
   ========================================================================== */

/** Rolle einer Person an einem Stichtag — Grundlage der anteiligen Abrechnung. */
function rolleAm(p, d) {
  if (!p.rolleVerlauf || !p.rolleVerlauf.length) return (!p.rolleSeit || p.rolleSeit <= d) ? p.rolle : "mitarbeiter";
  let t = null;
  for (const z of p.rolleVerlauf) if (z.ab <= d) t = z;
  return t ? t.rolle : p.rolle;
}
const einschr = (p) => p.einschraenkungen || {};

/* ------------------------------ Ist-Erfassung ---------------------------- */
/** Tatsächliche Dauer eines Dienstes: erfasste Zeit schlägt die geplante. */
function istDauer(m, p, d, da) {
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  if (!e || !e.bestaetigt) return { std: dauer(da), erfasst: false, abweichung: 0 };
  const roh = { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 };
  const std = dauer(roh);
  return { std, erfasst: true, abweichung: Math.round((std - dauer(da)) * 100) / 100 };
}
const offeneErfassung = (m, p, bis) => {
  const out = [];
  for (let d = addDays(bis, -13); d <= bis; d = addDays(d, 1)) {
    const t = personTag(m, p, d);
    if (!t.dienstId) continue;
    if (m.erfassung && m.erfassung[`${p.id}|${d}`]) continue;
    out.push(d);
  }
  return out;
};

/* ------------------ Personenbezogene Einschränkungen --------------------- */
/**
 * Prüft, ob eine Person an einem Tag einen bestimmten Dienst leisten darf.
 * Liefert eine Liste von Hinderungsgründen — leer bedeutet zulässig.
 */
function hindernisse(m, p, d, da) {
  const g = [];
  const e = einschr(p);
  if (!imDienst(p, d)) g.push("nicht im Bestand");
  if (abwesenheitAm(m, p.id, d)) g.push(`abwesend (${abwArt(abwesenheitAm(m, p.id, d).art).label})`);
  if (e.keineNacht && nachtAnteil(da) >= 2) g.push("keine Nachtdienste zugelassen");
  if (!verfuegbarFuer(p, d, da)) g.push(`nicht verfügbar (${FENSTER[fensterVon(da)].name} ${DOW[dow(d)]})`);
  // Qualifikationen mit harter Sperre schließen die Einteilung ganz aus
  if (kann(m, "hartesperre") && da.form !== "ruf") {
    for (const q of m.qualifikationen) {
      if (!q.harteSperre) continue;
      if (!qualGueltig(m, p, q.id)) g.push(`${q.name} fehlt oder ist abgelaufen — gesetzlich zwingend`);
    }
  }
  const tz = p.teilzeit;
  if (tz && tz.aktiv && tz.modus === "wochentage" && !(tz.wochentage || []).includes(dow(d)))
    g.push("arbeitet an diesem Wochentag nicht");
  // Ruhezeit vor und nach dem Dienst
  const [nStart, nEnde] = fenster(d, da);
  for (const off of [-2, -1, 1, 2]) {
    const dd = addDays(d, off);
    const t = personTag(m, p, dd);
    if (!t.dienstId) continue;
    const other = m.dienstarten.find((x) => x.id === t.dienstId);
    if (!other) continue;
    const [oStart, oEnde] = fenster(dd, other);
    const ruhe = oStart > nStart ? (oStart - nEnde) / 60 : (nStart - oEnde) / 60;
    if (ruhe < m.einstellungen.ruhezeit) { g.push(`Ruhezeit ${n1(Math.max(0, ruhe))} h zum Dienst am ${fKurz(dd)}`); break; }
  }
  // Dienste je Woche
  if (e.maxDiensteWoche) {
    const mo = montag(d);
    let n = 0;
    for (let i = 0; i < 7; i++) if (personTag(m, p, addDays(mo, i)).dienstId) n++;
    if (n >= e.maxDiensteWoche) g.push(`bereits ${n} von ${e.maxDiensteWoche} Diensten in der Woche`);
  }
  // Wiedereingliederung
  const w = e.wiedereingliederung;
  if (w && w.von <= d && w.bis >= d) {
    const mo = montag(d);
    let std = 0;
    for (let i = 0; i < 7; i++) {
      const t = personTag(m, p, addDays(mo, i));
      if (!t.dienstId) continue;
      const x = m.dienstarten.find((y) => y.id === t.dienstId);
      if (x) std += dauer(x);
    }
    if (std + dauer(da) > w.maxStundenWoche)
      g.push(`Wiedereingliederung: höchstens ${n1(w.maxStundenWoche)} h je Woche`);
  }
  // Dienste in Folge
  let lauf = 0;
  for (let i = 1; i <= m.einstellungen.maxFolge + 1; i++) {
    if (personTag(m, p, addDays(d, -i)).dienstId) lauf++; else break;
  }
  if (lauf >= m.einstellungen.maxFolge) g.push(`${lauf} Dienste in Folge davor`);
  return g;
}

/**
 * Ersatzsuche für einen unterbesetzten Dienst.
 * Sortiert nach Eignung: Qualifikation, Stundenkonto im Minus, Belastungsausgleich.
 */
function ersatzVorschlaege(m, d, dienstId, ctx) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return [];
  const ym = d.slice(0, 7);
  const b = besetzung(m, d)[dienstId];
  const fehlendeQuals = (b.qual || []).filter((q) => !q.ok).map((q) => q.qid);
  const jahr = Number(d.slice(0, 4));
  const einspruengeJe = {};
  for (const e of m.einspruenge || []) einspruengeJe[e.personId] = (einspruengeJe[e.personId] || 0) + 1;
  const mittel = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  // Bewertet wird der Abstand zum Median, nicht der absolute Kontostand.
  // Sonst wirkt ein systematischer Überhang auf alle gleich und die Reihung wird beliebig.
  let median, nachtMittel;
  if (ctx) { median = ctx.median; nachtMittel = ctx.nachtMittel; }
  else {
    const konten = m.personen.filter((x) => imDienst(x, d)).map((x) => stundenkonto(m, x, ym)).sort((a, b2) => a - b2);
    median = konten.length ? konten[Math.floor(konten.length / 2)] : 0;
    const naechteJe = m.personen.filter((x) => imDienst(x, d)).map((x) => nachtJahr(m, x, jahr).anzahl);
    nachtMittel = naechteJe.length ? naechteJe.reduce((a, b2) => a + b2, 0) / naechteJe.length : 0;
  }

  const out = [];
  for (const p of m.personen) {
    const t = personTag(m, p, d);
    if (t.dienstId) continue;                      // hat bereits Dienst
    const g = hindernisse(m, p, d, da);
    const kto = ctx ? (ctx.konten.get(p.id) || 0) : stundenkonto(m, p, ym);
    const eigene = ctx ? (ctx.einspruenge[p.id] || 0) : (einspruengeJe[p.id] || 0);
    const passendeQuals = fehlendeQuals.filter((q) => qualGueltig(m, p, q));
    const gruende = [];
    let punkte = 0;
    // Abgelaufene Nachweise senken die Eignung deutlich
    const abgelaufen = p.qualifikationen.filter((q) => nachweisStand(m, p, q).stand === "abgelaufen");
    if (abgelaufen.length) { punkte -= 25 * abgelaufen.length;
      gruende.push(`${abgelaufen.length} Nachweis abgelaufen`); }
    if (passendeQuals.length) { punkte += 45 * passendeQuals.length;
      gruende.push(`bringt ${passendeQuals.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(", ")}`); }
    const relKto = kto - median;
    if (relKto < -3) { punkte += Math.min(30, -relKto * 2); gruende.push(`${n1(Math.abs(relKto))} h unter dem Mittel`); }
    else if (relKto > 3) { punkte -= Math.min(28, relKto * 2); gruende.push(`${n1(relKto)} h über dem Mittel`); }
    else gruende.push("Stundenkonto im Mittel");
    if (eigene < mittel - .5) { punkte += 14; gruende.push("selten eingesprungen"); }
    else if (eigene > mittel + .5) { punkte -= 12; gruende.push(`${eigene}× eingesprungen`); }
    if (p.springer) { punkte += 28; gruende.push("Springerpool"); }
    else {
      const eid = einheitAm(p, d);
      if (eid && einheitDienst(m, eid, d)) { punkte -= 10; gruende.push("hätte regulär frei"); }
      else { punkte += 8; gruende.push("in der Dienstphase"); }
      if (p.teilzeit && p.teilzeit.aktiv) { punkte -= 6; gruende.push("Teilzeit"); }
    }
    const nj = ctx ? (ctx.nachtAnzahl.get(p.id) || 0) : nachtJahr(m, p, jahr).anzahl;
    if (nachtAnteil(da) >= 2 && nj > nachtMittel + 3) { punkte -= 8; gruende.push(`${nj} Nachtdienste im Jahr`); }
    out.push({ person: p, punkte: Math.round(punkte), gruende, hindernisse: g, moeglich: g.length === 0 });
  }
  out.sort((a, b2) => (a.moeglich !== b2.moeglich) ? (a.moeglich ? -1 : 1) : b2.punkte - a.punkte);
  return out;
}

/* --------------------------- Freigabe und Rückkanal ---------------------- */
const freigabeStand = (m, ym) => (m.freigaben && m.freigaben[ym]) || null;
const istFreigegeben = (m, ym) => !!freigabeStand(m, ym);
/** Vorlauf in Tagen zwischen Änderung und betroffenem Diensttag. */
const vorlauf = (datum) => between(heute(), datum);

/** Kennzahl Planungssicherheit: Anteil kurzfristiger Änderungen an allen Änderungen. */
function planungssicherheit(m, ym, grenze = 14) {
  const alle = (m.aenderungen || []).filter((a) => a.datum.slice(0, 7) === ym);
  const kurz = alle.filter((a) => a.vorlauf < grenze);
  const jePerson = {};
  for (const a of kurz) jePerson[a.personId] = (jePerson[a.personId] || 0) + 1;
  return { gesamt: alle.length, kurzfristig: kurz.length,
    anteil: alle.length ? Math.round(kurz.length / alle.length * 100) : 0, jePerson, grenze };
}

/* --------------------------- Verteilungsgerechtigkeit -------------------- */
/**
 * Belastungsverteilung über einen Zeitraum: Wochenendnächte, Feiertagsdienste,
 * Nachtdienste, kurzfristige Änderungen. Grundlage für Streitfreiheit.
 */
function verteilung(m, von, bis) {
  return memo(m, `vert|${von}|${bis}`, () => {
    const kurz = {};
    for (const a of m.aenderungen || []) if (a.datum >= von && a.datum <= bis && a.vorlauf < 14)
      kurz[a.personId] = (kurz[a.personId] || 0) + 1;
    const zeilen = m.personen.filter((p) => imDienst(p, bis)).map((p) => {
      let weNacht = 0, feier = 0, naechte = 0, wochenenden = 0, dienste = 0;
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        dienste++;
        const w = dow(d), nacht = nachtAnteil(da) >= 2;
        if (nacht) naechte++;
        if (nacht && (w === 4 || w === 5)) weNacht++;
        if (w >= 5) wochenenden++;
        if (feiertag(d, m.bundesland)) feier++;
      }
      return { person: p, weNacht, feier, naechte, wochenenden, dienste, kurzfristig: kurz[p.id] || 0 };
    });
    const felder = ["weNacht", "feier", "naechte", "wochenenden", "kurzfristig"];
    const mittel = {};
    for (const f of felder) mittel[f] = zeilen.length ? zeilen.reduce((a, z) => a + z[f], 0) / zeilen.length : 0;
    for (const z of zeilen) { z.abw = {}; for (const f of felder) z.abw[f] = z[f] - mittel[f]; }
    zeilen.sort((a, b) => (b.weNacht + b.feier) - (a.weNacht + a.feier));
    return { zeilen, mittel, felder };
  });
}

/* --------------------------- Anteilige Abrechnung ------------------------ */
/**
 * Zählt Zugänge tagesgenau und mittelt über den Monat.
 * Ein am Zwanzigsten angelegter Zugang schlägt nur anteilig zu Buche.
 */
function zugaengeAnteilig(m, ym) {
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const summe = {};
  for (const r of ROLLEN) if (!r.extern) summe[r.id] = 0;
  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    for (const p of m.personen) {
      if (!imDienst(p, d)) continue;
      const r = rolleAm(p, d);
      if (summe[r] === undefined) summe[r] = 0;
      summe[r] += 1 / n;
    }
  }
  const out = {};
  for (const k of Object.keys(summe)) out[k] = Math.round(summe[k] * 1000) / 1000;
  return out;
}
function preisAnteilig(db, m, ym) {
  const t = db.tarife.find((x) => x.id === m.tarif) || db.tarife[0];
  const z = zugaengeAnteilig(m, ym);
  const stichtag = zugaenge(m);
  const zahlendStichtag = ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (stichtag[r.id] || 0), 0);
  const st = staffel(zahlendStichtag);
  const zeilen = ROLLEN.filter((r) => !r.extern).map((r) => {
    const anzahl = z[r.id] || 0, einzel = t.preis[r.id] || 0;
    return { rolle: r, anzahl: Math.round(anzahl * 100) / 100, ganz: stichtag[r.id] || 0,
      einzel, netto: Math.round(anzahl * einzel * (1 - st.rabatt) * 100) / 100 };
  });
  const summeZugaenge = Math.round(zeilen.reduce((a, l) => a + l.netto, 0) * 100) / 100;
  const grund = t.grund * (1 - (m.rabattGrund || 0));
  const gesamt = Math.round((grund + summeZugaenge) * 100) / 100;
  return { t, z, st, zeilen, grund, summeZugaenge, gesamt, zahlendStichtag,
    zahlendAnteilig: Math.round(ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (z[r.id] || 0), 0) * 100) / 100,
    zahlt: stat(m.status).zahlt };
}
