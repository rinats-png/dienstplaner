
/* ==========================================================================
   BRANCHENPAKETE UND FACHLICHE ERWEITERUNGEN
   Ein Kern, mehrere Vertikalen. Was eine Branche braucht, wird als Paket
   freigeschaltet — der Rechenkern bleibt für alle derselbe.
   ========================================================================== */

/**
 * Pakete bestimmen, welche Ansichten und Regeln ein Betrieb sieht.
 * Bewusst grob geschnitten: fünf Pakete statt fünfzig einzelner Schalter.
 */
const PAKETE = [
  { id: "kern", name: "Kernplattform", pflicht: true,
    beschreibung: "Schichtplanung, Anträge, Zeiten, Stundenkonten, Auswertungen.",
    merkmale: ["plan", "antraege", "zeiten", "konten", "qualifikationen", "export"] },
  { id: "sicherheit", name: "Sicherheitsdienst", aufpreis: 79,
    beschreibung: "Objektbezogene Posten, Sachkundenachweis mit harter Sperre, Wachbuch, Standortprüfung beim Stempeln.",
    merkmale: ["posten", "wachbuch", "hartesperre", "geofence", "objektbericht"] },
  { id: "pflege", name: "Pflege", aufpreis: 89,
    beschreibung: "Fachkraftquote je Dienst, Übergabeprotokoll, Wohnbereichsplanung, Betreuungskräfte nach § 43b.",
    merkmale: ["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"] },
  { id: "klinik", name: "Klinik", aufpreis: 129,
    beschreibung: "Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung, geteilte Dienste, Funktionsdienste, Rotationen.",
    merkmale: ["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation", "uebergabe", "fachkraftquote"] },
  { id: "industrie", name: "Industrie und Anlagen", aufpreis: 59,
    beschreibung: "Anlagenbindung, Maschinenqualifikationen, Kontischichtmodelle mit Stufenversatz.",
    merkmale: ["anlagen", "maschinenqual", "kontimodelle"] },
];

const paketVon = (id) => PAKETE.find((p) => p.id === id) || PAKETE[0];
/** Ist ein Merkmal für diesen Betrieb freigeschaltet? */
const kann = (m, merkmal) => {
  const aktiv = ["kern", ...(m.pakete || [])];
  return PAKETE.filter((p) => aktiv.includes(p.id)).some((p) => p.merkmale.includes(merkmal));
};
/** Welche Pakete schlägt eine Branche vor? */
const paketeFuerBranche = (b) => ({
  sicherheit: ["sicherheit"], pflege: ["pflege"], klinik: ["klinik"],
  produktion: ["industrie"], logistik: ["industrie"], rettung: ["klinik"],
}[b] || []);

/* ------------------------ Branchenbegriffe ------------------------------- */
/**
 * Dieselbe Sache heißt je Branche anders. Die Begriffe stecken an einer Stelle,
 * damit die Oberfläche in der Sprache des Betriebs spricht.
 */
const BEGRIFFE = {
  standard: { einheit: "Einheit", person: "Beschäftigte", schicht: "Dienst",
    leitung: "Schichtleitung", uebergabe: "Übergabe", fachkraft: "Fachkraft" },
  sicherheit: { einheit: "Schichtgruppe", person: "Sicherheitskraft", schicht: "Dienst",
    leitung: "Objektleitung", uebergabe: "Postenübergabe", fachkraft: "Sachkundige Kraft" },
  pflege: { einheit: "Wohnbereich", person: "Pflegekraft", schicht: "Dienst",
    leitung: "Wohnbereichsleitung", uebergabe: "Schichtübergabe", fachkraft: "Pflegefachkraft" },
  klinik: { einheit: "Station", person: "Mitarbeitende", schicht: "Dienst",
    leitung: "Stationsleitung", uebergabe: "Schichtübergabe", fachkraft: "Fachpflegekraft" },
  rettung: { einheit: "Wachabteilung", person: "Einsatzkraft", schicht: "Wachdienst",
    leitung: "Wachleitung", uebergabe: "Wachübergabe", fachkraft: "Notfallsanitäter" },
  produktion: { einheit: "Schichtgruppe", person: "Mitarbeitende", schicht: "Schicht",
    leitung: "Schichtführung", uebergabe: "Schichtübergabe", fachkraft: "Anlagenführer" },
};
const begriff = (m, was) => (BEGRIFFE[m.branche] || BEGRIFFE.standard)[was]
  || BEGRIFFE.standard[was] || was;

/* --------------------------- Fachkraftquote ------------------------------ */
/**
 * Pflege und Klinik arbeiten mit einer Mindestquote examinierter Kräfte je
 * Dienst. Sie wird als Anteil geführt, nicht als absolute Zahl — sonst stimmt
 * sie bei wechselnder Besetzungsstärke nicht mehr.
 */
function fachkraftLage(m, datum, dienstId) {
  if (!kann(m, "fachkraftquote")) return null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da || !da.fachkraftQuote) return null;
  const b = besetzung(m, datum)[dienstId];
  const fkQuals = m.qualifikationen.filter((q) => q.fachkraft).map((q) => q.id);
  if (!fkQuals.length) return null;
  const fk = b.personen.filter((p) => fkQuals.some((q) => qualGueltig(m, p, q))).length;
  const ist = b.anzahl > 0 ? fk / b.anzahl : 0;
  const noetig = Math.ceil(b.anzahl * da.fachkraftQuote);
  return { fk, gesamt: b.anzahl, ist: Math.round(ist * 100), soll: Math.round(da.fachkraftQuote * 100),
    noetig, fehlt: Math.max(0, noetig - fk), erfuellt: fk >= noetig };
}

/* ------------------ Anrechnung von Bereitschaft und Teildiensten --------- */
/**
 * Bereitschaftsdienst (Anwesenheit am Arbeitsplatz) und Rufbereitschaft
 * (Erreichbarkeit von zu Hause) zählen unterschiedlich. Beide sind
 * Arbeitszeit im Sinne des Arbeitsschutzes, aber nicht in voller Höhe
 * vergütungs- oder kontenwirksam.
 */
const DIENSTFORMEN = [
  { id: "regel", name: "Regeldienst", faktor: 1, ruhezeitNeutral: false,
    hinweis: "Volle Arbeitszeit, unterbricht die Ruhezeit." },
  { id: "bereitschaft", name: "Bereitschaftsdienst", faktor: 0.6, ruhezeitNeutral: false,
    hinweis: "Anwesenheit am Arbeitsplatz. Zählt als Arbeitszeit, wird anteilig auf das Konto gerechnet." },
  { id: "ruf", name: "Rufbereitschaft", faktor: 0.125, ruhezeitNeutral: true,
    hinweis: "Erreichbarkeit von zu Hause. Unterbricht die Ruhezeit nicht, solange kein Einsatz erfolgt." },
  { id: "geteilt", name: "Geteilter Dienst", faktor: 1, ruhezeitNeutral: false, geteilt: true,
    hinweis: "Zwei Abschnitte mit Unterbrechung. Die Pause dazwischen ist keine Arbeitszeit." },
];
const dienstform = (id) => DIENSTFORMEN.find((x) => x.id === id) || DIENSTFORMEN[0];

/** Dauer eines geteilten Dienstes: beide Abschnitte ohne die Lücke dazwischen. */
function geteilteDauer(da) {
  if (!da.zweiterAbschnitt) return dauer(da);
  const a = dauer(da);
  const zw = da.zweiterAbschnitt;
  let b = toMin(zw.ende) - toMin(zw.start); if (b <= 0) b += 1440;
  return Math.round((a + b / 60) * 100) / 100;
}

/* --------------------- Mehrstufige Genehmigung --------------------------- */
/**
 * Manche Anträge brauchen zwei Unterschriften — etwa Sonderurlaub oder
 * Fortbildungen mit Kostenfolge. Die Stufen sind je Betrieb einstellbar.
 */
const STUFEN_STD = { urlaub: 1, tausch: 1, schulung: 2, sonder: 2, krank: 0, ausgleich: 1 };
const stufenFuer = (m, art) => (m.genehmigungsstufen || STUFEN_STD)[art] ?? 1;
/** Wie weit ist ein Antrag? */
function genehmigungsStand(m, a) {
  const noetig = stufenFuer(m, a.art || a.typ);
  const erteilt = (a.freigaben || []).length;
  return { noetig, erteilt, offen: Math.max(0, noetig - erteilt), fertig: erteilt >= noetig,
    naechste: erteilt === 0 ? "Schichtverantwortung oder Planung" : "Organisationsleitung" };
}
/** Darf diese Person die nächste Stufe erteilen? */
function darfStufe(sitz, a, stand) {
  if (stand.erteilt === 0) return darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all");
  return darf(sitz, "req.approve.all") || darf(sitz, "org.edit");
}

/* --------------------------- Schichtübergabe ----------------------------- */
/**
 * Die Übergabe ist in Pflege und Klinik ein eigener, dokumentationspflichtiger
 * Vorgang: Wer übergibt an wen, was ist offen, was ist besonders.
 */
const UEBERGABE_FELDER = [
  { id: "lage", label: "Lage und Besonderheiten", pflicht: true,
    hinweis: "Was die übernehmende Schicht wissen muss." },
  { id: "offen", label: "Offene Aufgaben", pflicht: false,
    hinweis: "Was noch zu erledigen ist, mit Zeitbezug." },
  { id: "vorkommnis", label: "Besondere Vorkommnisse", pflicht: false,
    hinweis: "Ereignisse mit Dokumentationspflicht." },
  { id: "material", label: "Material und Betriebsmittel", pflicht: false,
    hinweis: "Fehlendes, Defektes, Übergebenes." },
];
const uebergabeAm = (m, datum, dienstId) =>
  (m.uebergaben || []).find((u) => u.datum === datum && u.dienstId === dienstId) || null;
/** Übergaben, die fällig, aber nicht erfolgt sind. */
function offeneUebergaben(m, tage = 3) {
  if (!kann(m, "uebergabe")) return [];
  const out = [];
  for (let i = tage; i >= 1; i--) {
    const d = addDays(heute(), -i);
    for (const da of m.dienstarten) {
      if (da.posten || da.form === "ruf") continue;
      const b = besetzung(m, d)[da.id];
      if (!b.personen.length) continue;
      if (!uebergabeAm(m, d, da.id)) out.push({ datum: d, dienstart: da, personen: b.personen });
    }
  }
  return out;
}

/* --------------------------- DATEV-Ausgabe ------------------------------- */
/**
 * Lohnarten nach dem üblichen DATEV-Schema. Die Zuordnung ist einstellbar,
 * weil jeder Betrieb eigene Lohnartennummern führt.
 */
const LOHNARTEN_STD = {
  grund: { nr: "1000", text: "Gehalt" },
  nacht: { nr: "1400", text: "Nachtzuschlag steuerfrei" },
  sonntag: { nr: "1410", text: "Sonntagszuschlag steuerfrei" },
  feiertag: { nr: "1420", text: "Feiertagszuschlag steuerfrei" },
  samstag: { nr: "1430", text: "Samstagszuschlag" },
  bereitschaft: { nr: "1500", text: "Bereitschaftsdienst" },
  ruf: { nr: "1510", text: "Rufbereitschaft" },
  mehrarbeit: { nr: "1200", text: "Mehrarbeit" },
};
/**
 * Erzeugt den Lohnartensatz je Person für einen Monat.
 * Bewusst als Stunden je Lohnart — Entgelte gehören in die Lohnabrechnung.
 */
function datevSaetze(m, ym) {
  const la = m.lohnarten || LOHNARTEN_STD;
  const zeilen = [];
  for (const p of m.personen) {
    if (!imDienst(p, `${ym}-28`)) continue;
    const w = zuschlagWert(m, p, ym);
    const kto = stundenkonto(m, p, ym);
    const eintrag = (schluessel, stunden) => {
      if (!stunden || Math.abs(stunden) < 0.01) return;
      const l = la[schluessel] || { nr: "9999", text: schluessel };
      zeilen.push({ personalnummer: p.personalnummer || p.id, nachname: p.nachname, vorname: p.vorname,
        lohnart: l.nr, bezeichnung: l.text, stunden: Math.round(stunden * 100) / 100, monat: ym });
    };
    eintrag("nacht", w.std.nacht);
    eintrag("sonntag", w.std.sonntag);
    eintrag("feiertag", w.std.feiertag);
    eintrag("samstag", w.std.samstag);
    // Bereitschaftsanteile getrennt ausweisen
    let ber = 0, ruf = 0;
    const [y, mo] = ym.split("-").map(Number);
    for (let i = 1; i <= dim_(y, mo - 1); i++) {
      const d = `${ym}-${pad(i)}`;
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      if (!da) continue;
      if (da.form === "bereitschaft") ber += dauer(da);
      else if (da.form === "ruf" || da.rufbereitschaft) ruf += dauer(da);
    }
    eintrag("bereitschaft", ber);
    eintrag("ruf", ruf);
    if (kto > 0) eintrag("mehrarbeit", kto);
  }
  return zeilen;
}
function datevCSV(m, ym) {
  const z = datevSaetze(m, ym);
  const kopf = ["Personalnummer", "Nachname", "Vorname", "Lohnart", "Bezeichnung", "Stunden", "Abrechnungsmonat"];
  const zeilen = [kopf.join(";")];
  for (const x of z) zeilen.push([x.personalnummer, x.nachname, x.vorname, x.lohnart,
    x.bezeichnung, n2(x.stunden), x.monat].join(";"));
  return "\uFEFF" + zeilen.join("\r\n");
}
