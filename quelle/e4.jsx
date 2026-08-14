
/* ==========================================================================
   BELASTBARKEIT UND ENTSCHEIDUNGSUNTERSTÜTZUNG
   Ein Plan, der heute aufgeht, sagt nichts darüber, ob er morgen noch trägt.
   Diese Rechnungen beantworten die Frage, die ein Planer wirklich hat:
   Wie viel Ausfall verträgt welche Woche — und wo bricht es zuerst?
   ========================================================================== */

/**
 * Wie viele Ausfälle verträgt ein einzelner Dienst an einem Tag, bevor die
 * Mindestbesetzung unterschritten wird? Zählt echte Reserve, nicht Hoffnung:
 * Springer werden mitgerechnet, wenn sie an dem Tag frei und einsetzbar sind.
 */
function tagesReserve(m, datum, dienstId) {
  const b = besetzung(m, datum)[dienstId];
  if (!b) return null;
  const da = b.da;
  const puffer = b.anzahl - b.soll;                       // schon eingeteilte Reserve
  // Wer könnte einspringen, ohne gegen harte Regeln zu verstoßen?
  const ersatz = ersatzVorschlaege(m, datum, dienstId).filter((x) => x.moeglich).length;
  const traegt = Math.max(0, puffer) + ersatz;
  return { datum, dienstId, da, ist: b.anzahl, soll: b.soll, puffer, ersatz, traegt,
    stufe: traegt >= 3 ? "robust" : traegt >= 1 ? "knapp" : "ohne Reserve" };
}

/**
 * Belastbarkeit über einen Zeitraum: welche Woche und welcher Dienst bricht
 * zuerst. Bewusst als Wochenbild — der Planer denkt in Wochen, nicht in Tagen.
 */
function belastbarkeit(m, wochen = 8) {
  const start = montag(heute());
  const dienste = m.dienstarten.filter((d) => !d.posten && d.form !== "ruf");
  const out = [];
  for (let w = 0; w < wochen; w++) {
    const von = addDays(start, w * 7);
    const zeilen = [];
    for (const da of dienste) {
      let min = 99, minTag = null, summe = 0, tage = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(von, i);
        const r = tagesReserve(m, d, da.id);
        if (!r || r.soll === 0) continue;
        tage++; summe += r.traegt;
        if (r.traegt < min) { min = r.traegt; minTag = d; }
      }
      if (!tage) continue;
      zeilen.push({ da, min: min === 99 ? 0 : min, minTag,
        schnitt: Math.round((summe / tage) * 10) / 10,
        stufe: min >= 3 ? "robust" : min >= 1 ? "knapp" : "ohne Reserve" });
    }
    const schwaechste = zeilen.slice().sort((a, b) => a.min - b.min)[0] || null;
    out.push({ kw: w, von, bis: addDays(von, 6), zeilen, schwaechste,
      stufe: schwaechste ? schwaechste.stufe : "robust" });
  }
  return out;
}

/**
 * Ausfallszenario: Was passiert, wenn ein bestimmter Anteil der Belegschaft
 * ausfällt? Krankheitswellen sind in Pflege und Klinik der Regelfall, nicht
 * die Ausnahme — und der Grund, warum Pläne im Winter reißen.
 *
 * Der Ausfall wird gleichmäßig über die Einheiten verteilt, nicht zufällig:
 * ein zufälliges Ergebnis wäre bei jedem Aufruf anders und damit wertlos.
 */
function ausfallSzenario(m, anteil, tage = 14) {
  const kandidaten = m.personen
    .filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const zahl = Math.round(kandidaten.length * anteil);
  // Gleichmäßig über die Liste greifen statt am Stück — sonst trifft es eine Einheit ganz
  const schritt = zahl > 0 ? kandidaten.length / zahl : 0;
  const betroffen = [];
  for (let i = 0; i < zahl; i++) betroffen.push(kandidaten[Math.floor(i * schritt)]);

  const bis = addDays(heute(), tage - 1);
  const mAus = { ...m, abwesenheiten: [...m.abwesenheiten, ...betroffen.map((p) => ({
    id: `sz_${p.id}`, personId: p.id, art: "krank", von: heute(), bis, notiz: "Szenario" }))] };

  const vorher = pruefen(m, heute(), bis);
  const nachher = pruefen(mAus, heute(), bis);
  const zaehl = (liste, art) => liste.filter((x) => x.art === art).length;
  // Wie viele Dienste bleiben ganz ohne Besetzung?
  let leer = 0, unter = 0;
  for (let i = 0; i < tage; i++) {
    const d = addDays(heute(), i);
    for (const [k, e] of Object.entries(besetzung(mAus, d))) {
      if (e.soll === 0) continue;
      if (e.anzahl === 0) leer++;
      else if (e.diff < 0) unter++;
    }
  }
  return { anteil, zahl, betroffen: betroffen.length, tage,
    vorher: vorher.length, nachher: nachher.length, neu: nachher.length - vorher.length,
    besetzung: zaehl(nachher, "besetzung") - zaehl(vorher, "besetzung"),
    ruhezeit: zaehl(nachher, "ruhezeit") - zaehl(vorher, "ruhezeit"),
    leer, unter,
    haltbar: leer === 0 && nachher.filter((x) => x.schwere === "danger").length
      <= vorher.filter((x) => x.schwere === "danger").length + 2 };
}

/**
 * Rangbegründung für Ersatzvorschläge. Der Planer soll nicht raten, warum
 * jemand oben steht — er soll es lesen können. Keine Blackbox.
 */
function rangGruende(m, x, datum, dienstId) {
  const g = [];
  const p = x.person;
  const ym = datum.slice(0, 7);
  const kto = stundenkonto(m, p, ym);
  const au = auslastung(m, p, ym);
  const alle = m.personen.filter((q) => imDienst(q, datum) && q.imSchichtdienst !== false);
  const schnittKto = alle.reduce((a, q) => a + stundenkonto(m, q, ym), 0) / (alle.length || 1);

  if (p.springer) g.push({ art: "plus", text: "Springerpool — für genau solche Fälle vorgesehen" });
  if (kto < schnittKto - 4) g.push({ art: "plus",
    text: `Stundenkonto ${sgn(kto)} h liegt unter dem Mittel (${sgn(Math.round(schnittKto))} h)` });
  else if (kto > schnittKto + 8) g.push({ art: "minus",
    text: `Stundenkonto ${sgn(kto)} h liegt bereits deutlich über dem Mittel` });
  if (au.pct < 85) g.push({ art: "plus", text: `Auslastung ${au.pct} % — Luft nach oben` });
  else if (au.pct > 105) g.push({ art: "minus", text: `Auslastung ${au.pct} % — bereits über Soll` });

  const t = personTag(m, p, datum);
  if (!t.dienstId) g.push({ art: "plus", text: "hat an diesem Tag ohnehin frei" });
  const vor = personTag(m, p, addDays(datum, -1));
  if (vor.dienstId) g.push({ art: "hinweis", text: "arbeitet auch am Vortag" });
  const w = wunschAm(m, p.id, datum);
  if (w && w.art === "moechte") g.push({ art: "plus", text: "hat diesen Tag als Wunschdienst hinterlegt" });
  if (w && w.art === "lieber_nicht") g.push({ art: "minus", text: "wollte an diesem Tag lieber nicht arbeiten" });

  const da = m.dienstarten.find((d) => d.id === dienstId);
  const noetig = Object.keys(da && da.mindestQual || {});
  const hat = noetig.filter((q) => qualGueltig(m, p, q));
  if (noetig.length && hat.length === noetig.length)
    g.push({ art: "plus", text: `bringt alle geforderten Qualifikationen mit` });

  const zuletzt = (() => {
    for (let i = 1; i <= 60; i++) {
      const d = addDays(datum, -i);
      if ((m.einspruenge || []).some((e) => e.personId === p.id && e.datum === d)) return i;
    }
    return null;
  })();
  if (zuletzt !== null && zuletzt < 21)
    g.push({ art: "minus", text: `ist vor ${zuletzt} Tagen schon einmal eingesprungen` });
  else if (zuletzt === null)
    g.push({ art: "plus", text: "ist in den letzten zwei Monaten nicht eingesprungen" });

  return g;
}

/* ==========================================================================
   SZENARIENVERGLEICH
   Zwei Planvarianten nebeneinander, mit denselben Kennzahlen gemessen.
   ========================================================================== */
function planKennzahlen(m, von, bis) {
  const bef = pruefen(m, von, bis);
  const schwer = bef.filter((x) => x.schwere === "danger").length;
  let unterbesetzt = 0, ueberbesetzt = 0, dienste = 0, stunden = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    for (const [k, e] of Object.entries(besetzung(m, d))) {
      if (e.soll === 0) continue;
      dienste += e.anzahl;
      if (e.diff < 0) unterbesetzt++;
      if (e.diff > 1) ueberbesetzt++;
      if (e.da) stunden += e.anzahl * dauer(e.da);
    }
  }
  const v = verteilung(m, von.slice(0, 7));
  return { befunde: bef.length, schwer, unterbesetzt, ueberbesetzt, dienste,
    stunden: Math.round(stunden), spanne: v.spanne,
    wochenenden: v.zeilen.reduce((a, z) => a + z.wochenendNaechte, 0) };
}

/* ==========================================================================
   AUSSTIEGSSICHERHEIT
   Wer seine Dienstplanung auf ein System stellt, muss jederzeit vollständig
   wieder herauskommen. Das ist kein Zugeständnis, sondern Voraussetzung für
   Vertrauen — und beantwortet die Frage nach der Abhängigkeit vom Anbieter.
   ========================================================================== */
function vollExport(m) {
  const ym = heute().slice(0, 7);
  const jahr = Number(ym.slice(0, 4));
  const tabellen = {};

  tabellen.personen = m.personen.map((p) => ({
    id: p.id, personalnummer: p.personalnummer || "", nachname: p.nachname, vorname: p.vorname,
    funktion: p.funktion, email: p.email || "", eintritt: p.eintritt, austritt: p.austritt || "",
    wochenstunden: p.wochenstunden, urlaubsanspruch: p.urlaubsanspruch,
    einheit: (m.einheiten.find((e) => e.id === einheitAm(p, heute())) || {}).name || "",
    rolle: p.rolle, springer: p.springer ? "ja" : "nein",
    qualifikationen: p.qualifikationen.map((q) =>
      (m.qualifikationen.find((x) => x.id === q) || {}).name).filter(Boolean).join(", "),
  }));

  // Der gerechnete Plan wird ausgeschrieben — sonst wäre er ohne CENTRIC wertlos
  tabellen.dienstplan = [];
  const von = `${jahr}-01-01`, bis = `${jahr}-12-31`;
  for (const p of m.personen) {
    if (p.imSchichtdienst === false) continue;
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (!t.dienstId && !t.abwesenheit) continue;
      const da = t.dienstId && m.dienstarten.find((x) => x.id === t.dienstId);
      tabellen.dienstplan.push({ personId: p.id, nachname: p.nachname, vorname: p.vorname, datum: d,
        dienst: da ? da.name : "", kurz: da ? da.kurz : "",
        start: da ? da.start : "", ende: da ? da.ende : "",
        stunden: da ? n2(dauer(da)) : "",
        abwesenheit: t.abwesenheit ? abwArt(t.abwesenheit.art).label : "",
        quelle: t.quelle });
    }
  }

  tabellen.abwesenheiten = m.abwesenheiten.map((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return { personId: a.personId, nachname: p ? p.nachname : "", vorname: p ? p.vorname : "",
      art: abwArt(a.art).label, von: a.von, bis: a.bis,
      tage: between(a.von, a.bis) + 1, notiz: a.notiz || "" };
  });

  tabellen.erfassung = Object.entries(m.erfassung || {}).map(([k, v]) => {
    const [pid, datum] = k.split("|");
    const p = m.personen.find((x) => x.id === pid);
    return { personId: pid, nachname: p ? p.nachname : "", datum,
      start: v.start || "", ende: v.ende || "", stunden: v.stunden != null ? n2(v.stunden) : "",
      notiz: v.notiz || "" };
  });

  tabellen.anfragen = m.anfragen.map((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return { id: a.id, personId: a.personId, nachname: p ? p.nachname : "",
      typ: a.typ, art: a.art ? abwArt(a.art).label : "", von: a.von, bis: a.bis,
      status: a.status, erstellt: a.erstellt, entschieden: a.entschieden || "",
      durch: a.durch || "", antwort: a.antwort || "" };
  });

  tabellen.qualifikationen = m.personen.flatMap((p) =>
    (p.qualifikationen || []).map((q) => {
      const s = nachweisStand(m, p, q);
      return { personId: p.id, nachname: p.nachname, vorname: p.vorname,
        qualifikation: s.qual ? s.qual.name : q,
        gueltigBis: s.unbefristet ? "unbefristet" : (s.ablauf || ""),
        stand: s.stand };
    }));

  tabellen.protokoll = (m.protokoll || []).map((x) => ({
    zeit: x.zeit, wer: x.wer || "", was: x.text || x.was || "" }));

  return tabellen;
}

/** Wandelt eine Tabelle in CSV mit deutschem Trennzeichen. */
function tabelleCSV(zeilen) {
  if (!zeilen.length) return "";
  const spalten = Object.keys(zeilen[0]);
  const feld = (v) => {
    const s = String(v == null ? "" : v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [spalten.join(";"),
    ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(";"))].join("\r\n");
}
