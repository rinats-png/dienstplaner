/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { branchenListe } from "../../server/lib/branchen.mjs";
import { uid, n1, eur, zahl, n2, sgn } from "./format.js";
import { nachtAnteil, imDienst, einheitAm, einheitDienst, nachtschwelle, zyklusLaenge, versatzTageVon, einteilungsBefunde } from "../../server/lib/fachpruefung.mjs";
import { addDays, montag, toMin, dim_, pad, AUSGLEICH_WOCHEN, ausgleichszeitraum, DURCHSCHNITT_TAG, EBENEN, fenster, dow, dauer, stundengrenzeHinweis, REGELSTAND, between, kompetenzStand, dauerAm } from "../regelwerk.js";
import { DOW, heute, fKurz, fDatum, MON, fLang, zeitpunktText } from "./datum.js";
import { MATRIX_STD, ROLLEN, rollenName, anzahlWort } from "./rollen.js";
import { planFreigabeAktiv } from "../../server/lib/planfreigabe.mjs";
import { VERSION as BESTAND_VERSION } from "../migration.js";
import { STUFEN, stufeVon, ZUSATZ_PLANER, KONTAKT_AB_PLANER, KONTAKT_AB_ZUSCHLAGSSTANDORTE } from "../stufen.js";
import { eingefrorenerMonat, abschlussLuecke, freezeStatus, feiertagFuer, zuschlagTagAddieren, eingefrorenerBetrieb, eingefrorenFuerPerson, datevAusFreeze, datevHinweise, abschlussLuecken, abschlussLueckeText } from "../../server/lib/isteinfrieren.mjs";
import { istVerfuegbar, zeitraumMonat, zurPruefung, zeitraumJahr, ISTDATEN_TEXT, pruefHinweis, pruefFallText, istUngeplant, UNGEPLANT_TEXT } from "../istdaten.js";
import { LOHNARTEN_STD } from "../../server/lib/lohnrechnung.mjs";
import { rechtsquelleTabelle, regelIdFuerBefund } from "../regelregister.js";
import { darf } from "./berechtigung.js";
import { jeStandort as aufstellungJeStandort, standortzuschlaege } from "../standorte.js";
import { mandantPaketkosten, monatsanfang, paketTag, paketPositionen, kannMerkmal } from "../paketlogik.js";
import { monatspreis } from "../preisgestaltung.js";
import { monatAbgeschlossen, datevZeilenAbdruck, VORMONAT_KATEGORIEN as VORMONAT_KATEGORIEN_SERVER, monatText, datevReihenfolge, lohnexportVergleich, exportZeilenFuer } from "../../server/lib/monatsabschluss.mjs";
import { sperrtArt, stufeRang, abwesenheitTagAufheben as abwTagAufheben, bestaetigungsEintraege } from "../warnstufen.js";
import { useSchutzkonflikte as useSchutzkonflikteBasis } from "../schutzkonflikte-hook.js";
import { fristen as loeschFristen } from "../aufbewahrung.js";
import { stempelVorgang, MARKIERUNG_TEXT } from "../stempelvorgang.js";
import { csvText, csvFeld } from "../csvfeld.js";

/* WP-I12: Die Planrechnung steht im Rechenkern (server/lib/engine/); hier nur Weiterleitung und der Merkmalshaken. */
export { ABW, ABW_NEUTRAL, abwArt, _c, cache, memo, absIdx, aktive, abwesenheitAm, postenBesatzung, personTag, besetzung, sollStunden, istStunden, nachtTageImJahr, stundenkonto, istDauer, ungeplantAm, istTag, nachweisStand, qualGueltig } from "../../server/lib/engine/plan.mjs";
import { abwArt, memo, absIdx, aktive, abwesenheitAm, personTag, besetzung, sollStunden, istStunden, stundenkonto, istTag, nachweisStand, qualGueltig } from "../../server/lib/engine/plan.mjs";
export { EINSCHRAENKUNG_BEWERTUNG, fachkraftLage, pruefen } from "../../server/lib/engine/befunde.mjs";
import { pruefen } from "../../server/lib/engine/befunde.mjs";
export { verteilung, planKennzahlen } from "../../server/lib/engine/kennzahlen.mjs";
import { merkmalPruefungSetzen } from "../../server/lib/engine/befunde.mjs";

/* Bundesländer, in denen Feiertage von der Gemeinde abhängen.

   Fronleichnam gilt in Sachsen und Thüringen nur in bestimmten Gemeinden,
   Mariä Himmelfahrt in Bayern nur in überwiegend katholischen, und das
   Friedensfest allein in Augsburg. Wer dort plant, merkt einen Fehler erst,
   wenn die Zuschläge falsch abgerechnet sind — deshalb ein sichtbarer
   Hinweis statt einer stillen Annahme. */
export const GEMEINDE_FEIERTAGE = {
  BY: "In Bayern hängen Mariä Himmelfahrt und das Augsburger Friedensfest von der Gemeinde ab.",
  SN: "In Sachsen gilt Fronleichnam nur in bestimmten Gemeinden.",
  TH: "In Thüringen gilt Fronleichnam nur in bestimmten Gemeinden.",
};
export const gemeindeHinweis = (land) => GEMEINDE_FEIERTAGE[land] || null;
/* Ein Bestand, der nicht aus dem Demo-Aufbau stammt (leerer Betrieb, Neuinstallation),
   hat keinen Betreiberblock: die Betreiberkonsole stürzte darauf mit
   „Cannot read properties of undefined (reading 'steuersatz')" ab. */
export const BETREIBER_LEER = { firma: "", anschrift: "", ustId: "", iban: "", steuersatz: 19, zahlungsziel: 14 };

/* ------------------------ Feiertage aller Bundesländer -------------------- */
export const LAENDER = [["BW","Baden-Württemberg"],["BY","Bayern"],["BE","Berlin"],["BB","Brandenburg"],["HB","Bremen"],
  ["HH","Hamburg"],["HE","Hessen"],["MV","Mecklenburg-Vorpommern"],["NI","Niedersachsen"],["NW","Nordrhein-Westfalen"],
  ["RP","Rheinland-Pfalz"],["SL","Saarland"],["SN","Sachsen"],["ST","Sachsen-Anhalt"],["SH","Schleswig-Holstein"],["TH","Thüringen"]];
/* ostern, feiertage und feiertag: server/lib/feiertage.mjs (WP-16, Review H1) — der Server braucht sie für die
   Postenbesetzung beim Einfrieren des Ist. */

/* ------------------------------ Zeitrechnung ------------------------------ */
/* Das Nachtfenster ist nicht überall dasselbe.

   § 2 Abs. 3 ArbZG nennt 23 bis 6 Uhr — das war hier fest verdrahtet, an
   siebzehn Stellen und einmal sogar als Beschriftung „Nachtanteil 23–06
   Uhr". § 7 Abs. 5 TVöD zieht die Grenze bei 21 Uhr, ebenso die AVR. Für
   einen Frühdienst ändert das nichts, für einen Spätdienst bis 22 Uhr alles:
   Unter dem Tarifvertrag sind das zwei Stunden Nachtarbeit mit Zuschlag,
   nach dem Gesetz keine.

   Die Vorgabe bleibt das Gesetz. Wer ein Tarifwerk anwendet, bekommt dessen
   Fenster — siehe src/tarifwerke.js. */
/* nachtFenster, nachtschwelle und nachtAnteil stehen seit WP-22 in
   server/lib/fachpruefung.mjs — dieselbe Fassung prüft der Server. */

/**
 * Nachtstunden an einem bestimmten Tag — mit der Sommerzeit.
 *
 * Der Sprungpunkt liegt um 02:00 Ortszeit und damit immer innerhalb des
 * Nachtfensters. Wer in der Oktobernacht arbeitet, leistet eine
 * Nachtstunde mehr; im März eine weniger. Das wirkt unmittelbar auf den
 * Zuschlag nach § 6 Abs. 5 ArbZG.
 *
 * Die Schwellenprüfungen („ist das ein Nachtdienst?") benutzen weiterhin
 * die datumsfreie Fassung — eine Dienstart ist an jedem Tag dieselbe.
 */
/* nachtAnteilAm steht seit WP-16 (Nachtrag M-neu-2) in server/lib/isteinfrieren.mjs — der Monatsabschluss
   friert mit derselben Fassung ein. */

/* --------------------------------- Tarife --------------------------------- */
export const STATUS = [
  { id: "test", label: "Testphase", tone: "warn", zahlt: false },
  { id: "aktiv", label: "Aktiv", tone: "ok", zahlt: true },
  { id: "gekuendigt", label: "Gekündigt", tone: "neutral", zahlt: true },
  { id: "gesperrt", label: "Gesperrt", tone: "danger", zahlt: false },
];
export const stat = (id) => STATUS.find((s) => s.id === id) || STATUS[0];

/* --------------------------------------------------------------------------
   PREISMODELL — bezahlt wird, wer plant

   Wer geplant wird, kostet nichts: Mitarbeiter, Sub-Planer, Betriebsrat,
   Standorte und Einheiten sind in jeder Stufe unbegrenzt enthalten. Das
   war nicht immer so — zwei frühere Fassungen rechneten einen Kopfpreis
   und einen Preis je Standort, und beide bestraften genau das, wofür
   CENTRIC gedacht ist: mehr Personal, mehr Einsatzorte, mehr Betrieb.

   In die Rechnung geht nur, was ein Betrieb selbst entscheidet:

   Wie viele Personen planen zentral mit? — ein Planer-Zugang ist je
   Stufe enthalten, jeder weitere kostet eine Pauschale. Das ist eine
   Organisationsentscheidung, kein Nebeneffekt des Geschäfts — niemand
   stellt einen Planer ein, weil ein Patient dazukommt.

   Wie viele eigenständige, große Standorte betreibt er? — die größten
   Standorte bis zum Kontingent der Stufe sind kostenlos, unabhängig von
   ihrer Größe. Ein Betrieb, der an einem Ort wächst, zahlt dafür nie
   mehr. Erst ein WEITERER Standort ab vierzehn Personen — siehe
   `standorte.js` — macht einen Unterschied, und der ist gestaffelt nach
   dessen eigener Größe.

   Welche Funktionstiefe braucht er? — das unterscheidet die Stufen
   zusätzlich, wie schon in der vorigen Fassung.
   -------------------------------------------------------------------------- */
/* Die Zahlen selbst stehen in stufen.js — gemeinsam mit dem öffentlichen
   Rechner in main.jsx, der sie vorher als eigene Kopie führte. Eine
   zweite Preisliste driftet, und was driftet, ist am Ende ein
   Preisversprechen, das die Anwendung nicht einhält. */

/* Die Branchenliste stand hier als eigene Tabelle und lief gegen den
   Server auseinander: Die Oberfläche bot zehn Branchen an, der Server
   kannte fünf Kataloge, und „Produktion" traf den vorhandenen Katalog
   „industrie" wegen der abweichenden Kennung nie. Jetzt liest beides
   dieselbe Quelle. */
export const BRANCHEN = branchenListe();


   // Farbe wie „Freistellung“


/* ------------------------------- Zyklusvorlagen --------------------------- */
export const VORLAGEN = [
  { id: "v5", name: "5 Einheiten · 9,75 h", einheiten: 5, wochen: 5, wochenstunden: 40.95,
    text: "Drei Dienstarten, 40,95 h je Woche. Höchstens 4 Dienste und 4 Nächte am Stück, keine Einzeldienste.",
    zeiten: { F: ["06:00","15:45"], S: ["13:45","23:30"], N: ["21:30","07:15"] },
    tage: ["-","N","N","N","N","-","-","-","S","S","S","-","N","N","N","-","-","-","S","S","S","S","-","-","F","F","-","-","F","F","F","-","-","F","F"] },
  { id: "v4", name: "4 Einheiten · 8 h", einheiten: 4, wochen: 4, wochenstunden: 42,
    text: "Klassischer Vierschichtbetrieb, 42 h je Woche. Höchstens 5 Dienste am Stück. Vier einzelne Diensttage sind bei dieser Auslastung rechnerisch unvermeidbar.",
    zeiten: { F: ["06:00","14:00"], S: ["14:00","22:00"], N: ["22:00","06:00"] },
    tage: ["N","-","-","F","S","S","S","-","N","N","N","N","-","-","F","F","F","S","-","F","F","S","S","S","-","F","N","N"] },
];

/* --------------------------------------------------------------------------
   FARBWAHL

   Dreißig statt acht — die Farbe einer Dienstart, Einheit oder
   Qualifikation stand bis hierher fest, sobald sie angelegt wurde:
   PALETTE[i % PALETTE.length]. Wer bei acht Wohnbereichen anlangte, sah
   dieselbe Farbe zweimal, ohne sie ändern zu können.

   Alle dreißig sind bewusst so dunkel und zurückgenommen wie die
   ursprünglichen acht — dieselbe Farbe steht mitunter als Schrift auf
   hellem Grund (`color: e.farbe`), nicht nur als Fläche. Ein Farbton, der
   dort nicht trägt, gehört nicht in die Liste. Die ersten acht bleiben an
   erster Stelle: bestehende Daten zeigen auf ihren Index in diesem Array,
   eine andere Reihenfolge würde jede Zuordnung verschieben.
   -------------------------------------------------------------------------- */
export const PALETTE = [
  "#2C5A8A", "#5B4A87", "#2C6B63", "#9A4A22", "#96335C", "#4A6B2E", "#2A5C77", "#8A5518",
  "#7A3B8A", "#1E6B8C", "#6B4423", "#8A2A3D", "#3D7A5C", "#5C5C8A", "#A0522D", "#2E7D6B",
  "#7A5C2A", "#4A3B7A", "#8A6D2A", "#2A4A6B", "#6B2A4A", "#3D8A6B", "#8A4A6B", "#4A6B8A",
  "#6B8A2A", "#8A3D2A", "#2A6B5C", "#6B4A8A", "#8A2A6B", "#4A8A6B",
];
export const PALETTE_NAMEN = [
  "Blau", "Violett", "Petrol", "Terrakotta", "Beere", "Oliv", "Stahlblau", "Bernstein",
  "Magenta", "Türkisblau", "Braun", "Weinrot", "Smaragd", "Indigo", "Sienna", "Jade",
  "Ocker", "Tiefviolett", "Senf", "Marineblau", "Bordeaux", "Minze", "Pflaume", "Taubenblau",
  "Limette", "Ziegel", "Tanne", "Amethyst", "Fuchsia", "Salbei",
];

/* ------------------------------ Startbestand ------------------------------ */
export const VN = ["Anna","Mehmet","Sabine","Jonas","Katrin","Tobias","Elif","Markus","Julia","Piotr","Nadine","Sven","Maria","Kevin","Ines","Lars","Hanna","Ali","Britta","Dennis","Yvonne","Ruben","Steffi","Malte","Olga","Timo","Carla","Nils","Fatma","Ronja","Bastian","Leonie","Erdal","Miriam","Kai","Sonja","Dominik","Vera","Hakan","Josefine"];
export const NN = ["Berger","Yilmaz","Krämer","Hoffmann","Sander","Nowak","Demir","Reuter","Schäfer","Kowalski","Brandt","Vogel","Seibert","Ahrens","Lindner","Petrov","Baumann","Özdemir","Frank","Weiss","Roth","Kaminski","Haas","Dietrich","Sommer","Engel","Klose","Barth","Yildiz","Pohl","Winkler","Marek","Stein","Gruber"];
export function rnd(seed) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function baueMandant(cfg, seed) {
  const r = rnd(seed);
  const v = VORLAGEN.find((x) => x.id === cfg.vorlage) || VORLAGEN[0];
  const jahr = new Date().getFullYear();
  const standorte = (cfg.standorte || [{ name: cfg.ort || "Hauptstandort", land: cfg.land, lat: 50.11, lon: 8.68 }])
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name, bundesland: x.land,
      lat: x.lat === undefined ? 50.11 + i * 1.3 : x.lat,
      lon: x.lon === undefined ? 8.68 + i * 1.1 : x.lon,
      radius: x.radius === undefined ? 200 : x.radius }));
  const einheiten = Array.from({ length: v.einheiten }, (_, i) => ({
    id: uid("e"), name: `${cfg.einheitLabel} ${i + 1}`, versatz: i, versatzTage: i * 7, pool: false,
    standortId: standorte[i % standorte.length].id, farbe: PALETTE[i % PALETTE.length] }));
  // Springerpool: keine Rotation, wird gezielt in Lücken eingesetzt
  if (cfg.pool) einheiten.push({ id: uid("e"), name: "Springerpool", versatz: 0, versatzTage: 0, pool: true,
    standortId: standorte[0].id, farbe: "#0369A1" });
  const quals = cfg.qualifikationen.map((q, i) => ({ id: `q${i + 1}`, name: q[0], kurz: q[1],
    farbe: PALETTE[i % PALETTE.length],
    // Gültigkeitsdauer in Monaten; null bedeutet unbefristet
    gueltigMonate: q[2] === undefined ? null : q[2],
    nachweisPflicht: !!q[3],
    fachkraft: !!q[4],            // zählt für die Fachkraftquote
    harteSperre: !!q[5],          // verbindlich: ohne sie warnt jede Einteilung (seit E-19 keine Sperre mehr)
    /* Ebene und Bezug: Wer eine Einteilung verhindert, muss sagen können,
       worauf er sich stützt. In den Vorführdaten ist die einzige harte
       Sperre die Sachkunde nach § 34a GewO — Bundesrecht, aber nur für
       bestimmte Tätigkeiten. Alles Übrige ist eine betriebliche Festlegung
       und wird auch so ausgewiesen. */
    ebene: q[6] || (q[5] ? "bund" : "betrieb"),
    bezug: q[7] || (q[5] ? "taetigkeit" : "person"),
    grundlage: q[8] || (q[5] ? "§ 34a Abs. 1a GewO" : "Betriebliche Festlegung") }));

  const dienstarten = [
    { id: "F", name: "Frühdienst", kurz: "F", start: v.zeiten.F[0], ende: v.zeiten.F[1], pause: 0, farbe: "#1D4ED8",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.F, mindestQual: cfg.mindestQual.F || {} },
    { id: "S", name: "Spätdienst", kurz: "S", start: v.zeiten.S[0], ende: v.zeiten.S[1], pause: 0, farbe: "#B03A0A",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.S, mindestQual: cfg.mindestQual.S || {} },
    { id: "N", name: "Nachtdienst", kurz: "N", start: v.zeiten.N[0], ende: v.zeiten.N[1], pause: 0, farbe: "#7C3AED",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.N, mindestQual: cfg.mindestQual.N || {} },
  ];
  if (cfg.posten) dienstarten.push(
    { id: "PF", name: cfg.posten.name, kurz: "PF", start: cfg.posten.start, ende: cfg.posten.ende, pause: 0,
      farbe: "#2C6B63", ort: cfg.posten.ort, posten: true, quelle: "F", faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
      mindest: { mo_do: cfg.posten.n, fr: cfg.posten.n, sa: cfg.posten.n, so: cfg.posten.n }, mindestQual: {} });

  // Fachkraftquote je Dienst, wo das Paket es vorsieht
  if ((cfg.pakete || []).some((p) => p === "pflege" || p === "klinik"))
    for (const d of dienstarten) {
      if (d.posten) continue;
      /* Ohne Betrieb gilt hier die gesetzliche Nachtzeit. Die Quote ist ein
         Startwert und wird unter Verwaltung nachgezogen. */
      d.fachkraftQuote = nachtAnteil(d) >= 2 ? 0.5 : 0.4;
    }

  if (cfg.rufbereitschaft) dienstarten.push({ id: "RB", name: "Rufbereitschaft", kurz: "RB",
    start: "17:00", ende: "07:00", pause: 0, farbe: "#8A5309", ort: cfg.ort, posten: false, quelle: null,
    faktor: 0.125, ruhezeitNeutral: true, rufbereitschaft: true, form: "ruf", fachkraftQuote: null, zweiterAbschnitt: null,
    mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} });

  const personen = [];
  const belegt = new Set();
  einheiten.forEach((e, ei) => {
    const groesse = e.pool ? (cfg.pool || 0) : cfg.groesse + (ei % 2);
    for (let i = 0; i < groesse; i++) {
      let vn, nn, k;
      do { vn = VN[Math.floor(r() * VN.length)]; nn = NN[Math.floor(r() * NN.length)]; k = vn + nn; } while (belegt.has(k));
      belegt.add(k);
      // Die erste Qualifikation ist die fachliche Grundqualifikation.
      // Wo sie gesetzlich zwingend ist (harte Sperre), hat sie jede Person.
      // Wo sie nur die Fachkraftquote bestimmt, hat sie ein Teil — sonst wäre
      // die Quote ohne Aussage.
      const qs = [];
      const grund = quals[0];
      const jeder = grund.harteSperre || !grund.fachkraft;
      if (jeder || i % 5 !== 3) qs.push(grund.id);
      else if (quals[2]) qs.push(quals[2].id);   // Hilfskraft mit anderer Qualifikation
      if (i >= 1 && i <= 5 && quals[1]) qs.push(quals[1].id);
      if (r() > .6 && quals[2]) qs.push(quals[2].id);
      // Ablaufdaten: einige laufen absichtlich bald ab, damit die Prüfung greift
      const qNachweise = qs.map((qid, k) => {
        const q = quals.find((x) => x.id === qid);
        if (q && q.nurStatus) return { qualId: qid, ablauf: null, datei: null, vorhanden: i % 11 !== 4 };
        if (!q || !q.gueltigMonate) return { qualId: qid, ablauf: null, datei: null };
        const tage = Math.round(q.gueltigMonate * 30.44);
        const rest = (i % 9 === 0 && k === 0) ? 20 : (i % 7 === 0 && k === 1) ? -12 : Math.floor(r() * tage);
        return { qualId: qid, ablauf: addDays(heute(), rest), datei: null };
      });
      personen.push({ id: uid("p"), vorname: vn, nachname: nn,
        funktion: e.pool ? "Springer"
          : (!e.pool && i === 0 && ei === 0) ? "Personaldisposition"
          : i === 0 ? "Dienstplanung"
          : i === 1 ? "Schichtleitung"
          : i === groesse - 2 ? "Auszubildende" : "Fachkraft",
        email: `${vn.toLowerCase()}.${nn.toLowerCase().replace(/[^a-z]/g, "")}@${cfg.domain}`,
        zugehoerigkeit: [{ ab: `${jahr - 2}-01-01`, einheitId: e.id }],
        eintritt: `${jahr - 2}-01-01`, austritt: null,
        wochenstunden: e.pool ? 32 : (!e.pool && i === 5) ? Math.round(cfg.wochenstunden * 0.5 * 2) / 2
          : (!e.pool && i === 10) ? Math.round(cfg.wochenstunden * 0.75 * 2) / 2 : cfg.wochenstunden,
        urlaubsanspruch: 30, urlaubsuebertrag: i % 5 === 0 ? 3 : 0,
        stundenuebertrag: Math.round((r() * 60 - 75) * 10) / 10, qualifikationen: qs, qualNachweise: qNachweise,
        einschraenkungen: { keineNacht: false, keinAlleindienst: !e.pool && i === groesse - 2,
          maxDiensteWoche: null, wiedereingliederung: null },
        teilzeit: (!e.pool && (i === 5 || i === 10))
          ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null,
        springer: !!e.pool,
        // Springer arbeiten in Teilzeit auf Abruf — vier Einsätze je Woche.
        // Ein Vollzeitvertrag würde bei dieser Einsatzdichte ein dauerhaft
        // negatives Stundenkonto erzeugen.
        rolle: (!e.pool && i === 0 && ei === 0) ? "leitung" : (!e.pool && i === 0) ? "planer"
          : (!e.pool && i === 1) ? "subplaner" : (!e.pool && i === groesse - 1 && ei === 0) ? "betriebsrat" : "mitarbeiter",
        bereich: (!e.pool && (i === 0 || (i === groesse - 1 && ei === 0))) ? "ALLE" : e.id,
        // Verfügbarkeit als Wochenraster: 7 Tage × 3 Zeitfenster, true = kann
        verfuegbarkeit: (i % 6 === 0)
          ? { aktiv: true, raster: Array.from({ length: 21 }, (_, k) => !(k % 3 === 2 && k < 9)) }
          : { aktiv: false, raster: Array(21).fill(true) },
        nachweise: [],
        kontrastmodus: false,
        einfuehrung: { erledigt: true, schritt: 0 },   // Bestandsdaten gelten als eingeführt
        notiz: "",                       // Planungswissen zur Person
        einarbeitung: null,              // { bis, mentorId }
        benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
        rolleSeit: `${jahr - 2}-01-01`, status: "aktiv",
        // Planer sitzen im Geschäftszimmer und fahren keine Schicht mit.
        // Sub-Planer sind die Schichtverantwortlichen und arbeiten mit.
        imSchichtdienst: !((!e.pool && i === 0 && ei === 0) || (!e.pool && i === 0)) });
    }
  });

  const abwesenheiten = [];
  const start = heute().slice(0, 8) + "01";
  einheiten.forEach((e) => {
    const pool = personen.filter((p) => p.zugehoerigkeit[0].einheitId === e.id && p.funktion !== "Schichtleitung");
    const pick = new Set(); while (pick.size < Math.min(3, pool.length)) pick.add(Math.floor(r() * pool.length));
    [...pick].forEach((idx, k) => {
      const p = pool[idx];
      const art = k < 2 ? "urlaub" : ["krank", "schulung"][Math.floor(r() * 2)];
      const von = addDays(start, Math.floor(r() * 20));
      abwesenheiten.push({ id: uid("a"), personId: p.id, art, von,
        bis: addDays(von, art === "urlaub" ? 5 + Math.floor(r() * 7) : 1 + Math.floor(r() * 3)), notiz: "" });
    });
  });

  return {
    id: uid("m"), name: cfg.name, branche: cfg.branche, einheitLabel: cfg.einheitLabel,
    bundesland: cfg.land, tarif: cfg.tarif, status: cfg.status, seit: cfg.seit, stichtag: cfg.stichtag || null,
    rabattGrund: cfg.rabatt || 0, kontakt: cfg.kontakt, anschrift: cfg.anschrift,
    anker: montag(`${jahr}-01-01`), zyklus: { wochen: v.wochen, tage: [...v.tage], vorlage: v.id },
    matrix: JSON.parse(JSON.stringify(MATRIX_STD)),
    einstellungen: { ruhezeit: 11, maxFolge: 6, maxNachtFolge: 4, maxUrlaubJeEinheit: 3,
      sollWochenstunden: cfg.wochenstunden, ausgleichGrenze: 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24,
      planFreigabePflicht: true },
    standorte, einheiten, qualifikationen: quals, dienstarten, personen, abwesenheiten,
    dienstbuch: [],
    // Springer werden regelmäßig eingesetzt — sonst liefe ihr Stundenkonto
    // unrealistisch weit ins Minus und jede Auswertung wäre verzerrt.
    // Vier Einsätze je Woche auf festen Wochentagen, je Springer versetzt.
    abweichungen: (() => {
      const out = {};
      const springer = personen.filter((p) => p.springer);
      const rot = dienstarten.filter((d) => !d.posten && d.form !== "ruf");
      if (!springer.length || !rot.length) return out;
      const mo = montag(heute());
      // Tage, an denen jemand abwesend ist, bleiben frei — sonst entstünden
      // Einsätze trotz Urlaub.
      const belegt = new Set();
      for (const a of abwesenheiten)
        for (let d = a.von; d <= a.bis; d = addDays(d, 1)) belegt.add(`${a.personId}|${d}`);
      springer.forEach((p, si) => {
        // Je Woche eine Dienstart, vier Tage am Stück — so springt jemand
        // tatsächlich für eine Gruppe ein, ohne Ruhezeitkonflikte zu erzeugen.
        for (let w = -70; w <= 10; w++) {
          const idx = ((si + w) % rot.length + rot.length) % rot.length;
          const da = rot[idx];
          const start = (si * 2) % 3;
          for (let k = 0; k < 4; k++) {
            const d = addDays(mo, w * 7 + start + k);
            if (belegt.has(`${p.id}|${d}`)) continue;
            out[`${p.id}|${d}`] = da.id;
          }
        }
      });
      return out;
    })(),
    anfragen: (() => {
      const out = [];
      const kand = personen.filter((p) => p.imSchichtdienst !== false).slice(0, 6);
      kand.forEach((p, i) => {
        const von = addDays(heute(), 12 + i * 4);
        out.push({ id: `r_${p.id}`, personId: p.id, typ: "abwesenheit", art: i % 3 === 0 ? "schulung" : "urlaub",
          status: i < 3 ? "offen" : "genehmigt", von, bis: addDays(von, i % 3 === 0 ? 1 : 6),
          text: "", erstellt: new Date(Date.now() - i * 864e5).toLocaleString("de-DE"), antwort: "" });
      });
      if (kand[0]) out.push({ id: `t_${kand[0].id}`, personId: kand[0].id, typ: "tausch", status: "offen",
        partnerId: null, interessenten: [], von: addDays(heute(), 9), bis: addDays(heute(), 9),
        text: "Familienfeier, tausche gern gegen einen Spätdienst",
        erstellt: new Date(Date.now() - 864e5).toLocaleString("de-DE") });
      return out;
    })(),
    protokoll: [],
    // Der laufende Monat ist freigegeben — so sieht ein Betrieb in Benutzung aus
    freigaben: (() => {
      const ym = heute().slice(0, 7);
      const chef = personen.find((p) => p.rolle === "planer") || personen[0];
      return { [ym]: { stand: 1, zeit: new Date(Date.now() - 6048e5).toLocaleString("de-DE"),
        durch: chef ? `${chef.vorname} ${chef.nachname}` : "Planung" } };
    })(),
    nachrichten: [],      // Rückkanal an einzelne Personen
    aenderungen: [],      // Planänderungen mit Vorlauf, Grundlage für Planungssicherheit
    erfassung: {},        // "personId|datum" -> { start, ende, bestaetigt, grund }
    einspruenge: [],      // wer ist wann für wen eingesprungen
    zuschlaege: [
      { id: "z1", name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true },
      { id: "z2", name: "Sonntagsarbeit", art: "sonntag", prozent: 50, aktiv: true },
      { id: "z3", name: "Feiertagsarbeit", art: "feiertag", prozent: 125, aktiv: true },
      { id: "z4", name: "Samstagsarbeit", art: "samstag", prozent: 0, aktiv: false },
    ],
    urlaubsrunde: null,      // { jahr, phase, frist, kontingent, wuensche }
    unterschreitungen: [],   // dokumentierte Unterdeckung mit Begründung
    bestaetigungen: [],      // bewusst bestätigte Abweichungen (Warnen statt sperren)
    stand: 0,                // Fortschreibungszähler für die Konflikterkennung
    betriebsmittel: [],      // Schlüssel, Fahrzeuge, Geräte, Dienstkleidung
    kompetenzen: [],         // was jemand an einer bestimmten Sache darf
    belegung: {},            // "einheitId|datum|schicht" -> { patienten }
    aufgaben: [],            // vorbehaltene Tätigkeiten, § 4 PflBG und dergleichen
    fahrzeiten: {},          // "personId|datum" -> { lenkzeit, unterbrechungen[], ruhezeitDavor, kennzeichen }
    therapie: {},            // "einheitId|wocheMontag" -> { patienten, minuten{ gruppe: min } }
    aushang: [],             // Schwarzes Brett für alle
    einstempeln: {},         // "personId|datum" -> { start, ende, ortStart, ortEnde, abstand }
    notizen: {},             // "tag|JJJJ-MM-TT" oder "person|<id>" -> [{ id, text, von, zeit }]
    pakete: cfg.pakete || [],        // freigeschaltete Branchenpakete
    uebergaben: [],                  // Schichtübergaben (Pflege, Klinik)
    lohnarten: null,                 // null bedeutet Standardzuordnung
    genehmigungsstufen: null,        // null bedeutet Standardstufen
    ansichten: [],                   // gespeicherte Filter je Person
    wuensche: [],            // Wunsch- und Sperrdienste einzelner Personen
    einarbeitung: [],        // { personId, mentorId, von, bis, ziel }
    planstaende: {},         // "JJJJ-MM" -> Abbild der Abweichungen zum Freigabezeitpunkt
    briefing: { aktiv: true, uhrzeit: "06:00" },
  };
}

/* Die Demo für /api/bestand-anlegen: der Startbestand mit festen Kennungen
   in fester Reihenfolge. Der Server prüft genau diese Gestalt
   (server/lib/erstbefuellung.mjs, DEMO_KENNUNGEN). */
export const DEMO_KENNUNGEN = ["m-nordwacht", "m-lindenhof", "m-steinbach"];
export function demobestand() {
  const b = startbestand();
  return { ...b, mandanten: b.mandanten.map((m, i) => ({ ...m, id: DEMO_KENNUNGEN[i] })) };
}

export function startbestand() {
  const j = new Date().getFullYear();
  const mandanten = [
    baueMandant({ name: "Nordwacht Sicherheitsdienste GmbH", branche: "sicherheit", einheitLabel: "Schichtgruppe",
      land: "HE", tarif: "pro", status: "aktiv", seit: `${j}-02-01`, kontakt: "leitung@nordwacht.de",
      anschrift: "Hafenstraße 14\n60327 Frankfurt am Main", domain: "nordwacht.de", vorlage: "v5",
      standorte: [{ name: "Leitstelle Frankfurt", land: "HE", lat: 50.1109, lon: 8.6821, radius: 150 },
        { name: "Niederlassung Hannover", land: "NI", lat: 52.3759, lon: 9.7320, radius: 200 }],
      wochenstunden: 41, groesse: 16, ort: "Leitstelle", pool: 4, rufbereitschaft: true,
      pakete: ["sicherheit"],
      qualifikationen: [["Sachkunde §34a", "SK", null, true, true, true], ["Schichtleitung", "SL", null, false],
        ["Erste Hilfe", "EH", 24, true], ["Führungszeugnis", "FZ", 36, true]],
      mindest: { F: { mo_do: 7, fr: 7, sa: 7, so: 7 }, S: { mo_do: 7, fr: 7, sa: 7, so: 7 }, N: { mo_do: 6, fr: 7, sa: 7, so: 6 } },
      mindestQual: { F: { q1: 5, q2: 1 }, S: { q1: 5, q2: 1 }, N: { q1: 4, q2: 1 } },
      posten: { name: "Objektwache Tag", ort: "Objekt Nord", start: "06:00", ende: "16:00", n: 4 } }, 4711),
    baueMandant({ name: "Seniorenzentrum Lindenhof", branche: "pflege", einheitLabel: "Wohnbereich",
      land: "NW", tarif: "pro", status: "aktiv", seit: `${j}-04-15`, kontakt: "leitung@lindenhof.de",
      anschrift: "Lindenallee 3\n44135 Dortmund", domain: "lindenhof.de", vorlage: "v4",
      wochenstunden: 38.5, groesse: 13, ort: "Haupthaus", pool: 3, pakete: ["pflege"],
      qualifikationen: [["Pflegefachkraft", "PFK", null, true, true, false], ["Wohnbereichsleitung", "WBL", null, false],
        ["Betreuungskraft §43b", "BK", null, true], ["Erste Hilfe", "EH", 24, true],
        ["Hygieneschulung", "HYG", 12, true]],
      mindest: { F: { mo_do: 6, fr: 6, sa: 5, so: 5 }, S: { mo_do: 5, fr: 5, sa: 4, so: 4 }, N: { mo_do: 3, fr: 3, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 3 }, S: { q1: 3 }, N: { q1: 2 } }, posten: null }, 1234),
    baueMandant({ name: "Steinbach Fertigung GmbH", branche: "produktion", einheitLabel: "Schichtgruppe",
      land: "BY", tarif: "basis", status: "test", seit: `${j}-07-10`, stichtag: `${j}-08-24`,
      kontakt: "personal@steinbach.de", anschrift: "Industriering 8\n86167 Augsburg", domain: "steinbach.de",
      vorlage: "v4", wochenstunden: 35, groesse: 11, ort: "Werk Ost", pool: 2, pakete: ["industrie"],
      qualifikationen: [["Anlagenführer", "AF", null, true, true, false], ["Staplerschein", "STA", 12, true, false, true],
        ["Erste Hilfe", "EH", 24, true], ["Brandschutzhelfer", "BSH", 36, true]],
      mindest: { F: { mo_do: 5, fr: 5, sa: 4, so: 3 }, S: { mo_do: 5, fr: 5, sa: 4, so: 3 }, N: { mo_do: 4, fr: 4, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 2 }, S: { q1: 2 }, N: { q1: 2 } }, posten: null }, 9876),
  ];
  return { version: BESTAND_VERSION, stand: 0, tarife: JSON.parse(JSON.stringify(STUFEN)), mandanten, rechnungen: [], protokoll: [],
    betreiber: { firma: "CENTRIC Software", anschrift: "Musterweg 1\n64839 Münster", ustId: "DE000000000",
      iban: "DE00 0000 0000 0000 0000 00", steuersatz: 19, zahlungsziel: 14 },
    session: null };
}

/* ==========================================================================
   SCHICHTMODELL-KATALOG
   Jede Vorlage ist rechnerisch geprüft: Deckung, Wochenarbeitszeit,
   Dienstserien, Nachtserien und Ruhezeiten. Die angegebenen Werte sind
   berechnet, nicht behauptet — der Katalog zeigt sie offen an, damit die
   Planung eine begründete Wahl treffen kann.

   Zwei Rotationsarten:
     Wochenversatz — jede Gruppe startet eine Woche später (klassisch)
     Tagesversatz  — jede Gruppe startet einen Tag später (Stufenmodell)
   ========================================================================== */

/** Dienstartvorlagen, aus denen die Modelle schöpfen. */
export const DIENST_VORLAGEN = {
  F:   { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "14:00", farbe: "#1D4ED8" },
  S:   { name: "Spätdienst",     kurz: "S",  start: "14:00", ende: "22:00", farbe: "#B03A0A" },
  N:   { name: "Nachtdienst",    kurz: "N",  start: "22:00", ende: "06:00", farbe: "#7C3AED" },
  F9:  { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "15:45", farbe: "#1D4ED8" },
  S9:  { name: "Spätdienst",     kurz: "S",  start: "13:45", ende: "23:30", farbe: "#B03A0A" },
  N9:  { name: "Nachtdienst",    kurz: "N",  start: "21:30", ende: "07:15", farbe: "#7C3AED" },
  T12: { name: "Tagdienst",      kurz: "T",  start: "06:00", ende: "18:00", farbe: "#1D4ED8" },
  N12: { name: "Nachtdienst",    kurz: "N",  start: "18:00", ende: "06:00", farbe: "#7C3AED" },
  V24: { name: "24-Stunden-Dienst", kurz: "V", start: "07:00", ende: "07:00", farbe: "#2C6B63" },
  Z:   { name: "Zwischendienst", kurz: "Z",  start: "09:00", ende: "17:00", farbe: "#446F0D" },
};

/**
 * branchen: für welche Bereiche die Vorlage typisch ist
 * vollkonti: false bedeutet, dass am Wochenende planmäßig nicht gearbeitet wird —
 *            dort sind fehlende Dienste keine Lücke, sondern Absicht
 * kennzahlen: berechnet, nicht geschätzt
 */
export const MODELLE = [
  {
    id: "zwei-woechentlich", name: "2-Schicht, wöchentlich wechselnd",
    kurz: "Früh und Spät im Wochenwechsel, Wochenende frei",
    beschreibung: "Der einfachste Fall: zwei Gruppen tauschen jede Woche zwischen Früh- und Spätdienst. Kein Nachtdienst, keine Wochenendarbeit.",
    branchen: ["produktion", "handel", "logistik", "gastronomie", "sonstiges", "reinigung"],
    gruppen: 2, versatzTage: 7, vollkonti: false, dienste: ["F", "S"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Betriebszeit etwa 06 bis 22 Uhr, Montag bis Freitag.",
  },
  {
    id: "drei-teilkonti", name: "3-Schicht teilkontinuierlich",
    kurz: "Rund um die Uhr, aber nur werktags",
    beschreibung: "Drei Gruppen decken Früh, Spät und Nacht von Montag bis Freitag ab. Am Wochenende steht der Betrieb.",
    branchen: ["produktion", "logistik", "sonstiges"],
    gruppen: 3, versatzTage: 7, vollkonti: false, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-","N","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 5, besetzung: "1 Gruppe je Dienst" },
    passt: "Durchgehende Fertigung werktags, Wochenende ruht.",
    hinweis: "Fünf Nachtdienste am Stück gelten arbeitswissenschaftlich als belastend. Drei bis vier sind empfohlen.",
  },
  {
    id: "vier-x-vier", name: "4x4 Vollkonti, klassisch",
    kurz: "Vier Gruppen, je vier Tage Früh, Spät, Nacht, frei",
    beschreibung: "Das verbreitetste Modell der Fertigungsindustrie. Vier Gruppen rotieren in Viererblöcken durch alle Dienste.",
    branchen: ["produktion", "logistik", "leitstelle", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","S","S","S","S","N","N","N","N","-","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 12, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Anlagen, die nicht stillstehen dürfen.",
    hinweis: "Zwölf Diensttage am Stück. Das ist die bekannte Schwäche dieses Modells — die entzerrte Fassung behebt sie bei gleicher Wochenarbeitszeit.",
  },
  {
    id: "vier-x-vier-entzerrt", name: "4x4 Vollkonti, entzerrt",
    kurz: "Wie 4x4, aber mit Freitag nach jedem Block",
    beschreibung: "Gleiche Deckung und gleiche Wochenarbeitszeit wie das klassische 4x4, aber nach jedem Viererblock folgt ein freier Tag. Höchstens vier Dienste am Stück.",
    branchen: ["produktion", "logistik", "leitstelle", "pflege", "klinik", "sicherheit", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","-","S","S","S","S","-","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Wie 4x4, wenn die Belastung durch lange Dienstserien vermieden werden soll.",
    empfohlen: true,
  },
  {
    id: "panama", name: "Panama, 2-2-3 mit 12-Stunden-Diensten",
    kurz: "Zwei an, zwei frei, drei an — jedes zweite Wochenende ganz frei",
    beschreibung: "Vier Gruppen, zwölfstündige Tag- und Nachtdienste. Zwei Gruppen sind täglich im Einsatz. Jede Gruppe hat jedes zweite Wochenende vollständig frei.",
    branchen: ["produktion", "sicherheit", "leitstelle", "rettung", "sonstiges", "feuerwehr"],
    gruppen: 4, versatzTage: 7, vollkonti: true, dienste: ["T12", "N12"],
    tage: ["T12","T12","-","-","T12","T12","T12","-","-","T12","T12","-","-","-",
           "N12","N12","-","-","N12","N12","N12","-","-","N12","N12","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 3, nachtserie: 3, besetzung: "1 Gruppe je Dienst" },
    passt: "Wenn lange Freiblöcke wichtiger sind als kurze Dienste.",
    hinweis: "Zwölfstündige Dienste sind nach dem Arbeitszeitgesetz nur zulässig, wenn im Schnitt über sechs Monate acht Stunden je Werktag nicht überschritten werden oder erhebliche Bereitschaftsanteile vorliegen.",
  },
  {
    id: "fuenf-schicht", name: "5-Schicht Vollkonti, 9,75 Stunden",
    kurz: "Fünf Gruppen, keine Einzeldienste, viele freie Wochenenden",
    beschreibung: "Fünf Gruppen mit leicht verlängerten Diensten. Höchstens vier Dienste und vier Nächte am Stück, keine isolierten Diensttage.",
    branchen: ["sicherheit", "behoerde", "leitstelle", "klinik", "rettung", "sonstiges", "feuerwehr"],
    gruppen: 5, versatzTage: 7, vollkonti: true, dienste: ["F9", "S9", "N9"],
    tage: ["-","N9","N9","N9","N9","-","-","-","S9","S9","S9","-","N9","N9",
           "N9","-","-","-","S9","S9","S9","S9","-","-","F9","F9","-","-",
           "F9","F9","F9","-","-","F9","F9"],
    kennzahlen: { wochenstunden: 40.95, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "41-Stunden-Woche im Vollkontibetrieb, etwa im öffentlichen Dienst.",
    empfohlen: true,
  },
  {
    id: "stufe-8", name: "Stufenmodell F F S S N N frei frei",
    kurz: "Acht Gruppen im Tagesversatz, immer zwei je Dienst",
    beschreibung: "Jede Gruppe startet einen Tag später als die vorherige. Dadurch sind an jedem Tag genau zwei Gruppen je Dienstart im Einsatz — die Besetzung ist besonders gleichmäßig.",
    branchen: ["pflege", "klinik", "rettung", "leitstelle", "sonstiges", "feuerwehr"],
    gruppen: 8, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","S","S","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 6, nachtserie: 2, besetzung: "2 Gruppen je Dienst" },
    passt: "Größere Stationen und Wachen mit mehr als 30 Personen.",
    empfohlen: true,
  },
  {
    id: "stufe-11", name: "Stufenmodell drei Tage je Dienst",
    kurz: "Elf Gruppen im Tagesversatz, immer drei je Dienst",
    beschreibung: "Wie das achtstufige Modell, aber mit drei Tagen je Dienstart und drei Gruppen gleichzeitig je Dienst.",
    branchen: ["klinik", "pflege", "leitstelle", "sonstiges"],
    gruppen: 11, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","S","S","S","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 45.8, serie: 9, nachtserie: 3, besetzung: "3 Gruppen je Dienst" },
    passt: "Große Einheiten mit hohem Grundbedarf.",
    hinweis: "45,8 Wochenstunden liegen über jedem üblichen Vertrag. Ohne Teilzeitanteile oder zusätzliche Freischichten ist das Modell so nicht einsetzbar.",
  },
  {
    id: "24-72", name: "24-Stunden-Dienst mit 72 Stunden frei",
    kurz: "Ein voller Tag Dienst, drei Tage frei",
    beschreibung: "Vier Gruppen im Tagesversatz. Klassisch bei Feuerwehr und Rettungsdienst, wo erhebliche Teile Bereitschaft sind.",
    branchen: ["rettung", "sicherheit", "behoerde", "sonstiges", "feuerwehr"],
    gruppen: 4, versatzTage: 1, vollkonti: true, dienste: ["V24"],
    tage: ["V24","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 1, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Wachdienste mit hohem Bereitschaftsanteil.",
    hinweis: "24-Stunden-Dienste setzen eine Regelung nach § 7 Arbeitszeitgesetz voraus und sind nur bei erheblichem Bereitschaftsanteil zulässig.",
  },
];

export const modellFuerBranche = (b) => MODELLE.filter((m) => m.branchen.includes(b));

/** Rechnet ein Modell durch — dieselbe Prüfung wie im laufenden Betrieb. */
export function modellPruefen(modell) {
  const len = modell.tage.length;
  const dv = modell.dienste.map((d) => DIENST_VORLAGEN[d]);
  const nach = (k) => {
    const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    const s = toMin(v.start); let e = toMin(v.ende); if (e <= s) e += 1440;
    let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
    return sum / 60;
  };
  const dau = (k) => { const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    let d = toMin(v.ende) - toMin(v.start); if (d <= 0) d += 1440; return d / 60; };

  const luecken = {}; for (const d of modell.dienste) luecken[d] = 0;
  const proTag = [];
  for (let i = 0; i < len; i++) {
    const z = {};
    for (let g = 0; g < modell.gruppen; g++) {
      const idx = (((i - g * modell.versatzTage) % len) + len) % len;
      const t = modell.tage[idx]; if (t && t !== "-") z[t] = (z[t] || 0) + 1;
    }
    proTag.push(z);
    if (!modell.vollkonti && i % 7 >= 5) continue;   // Wochenende ist hier Absicht
    for (const d of modell.dienste) if (!z[d]) luecken[d]++;
  }
  let std = 0, dienste = 0;
  for (const t of modell.tage) if (t && t !== "-") { std += dau(t); dienste++; }
  let maxSerie = 0, serie = 0, maxNacht = 0, nserie = 0, ruhe = 0, einzel = 0;
  for (let i = 0; i < len; i++) {
    const c = modell.tage[i], nx = modell.tage[(i + 1) % len], pv = modell.tage[(i - 1 + len) % len];
    if (c && c !== "-") {
      serie++; maxSerie = Math.max(maxSerie, serie);
      if (nach(c) >= 2) { nserie++; maxNacht = Math.max(maxNacht, nserie); } else nserie = 0;
      if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
      if (nx && nx !== "-" && DIENST_VORLAGEN[c] && DIENST_VORLAGEN[nx]) {
        let e = toMin(DIENST_VORLAGEN[c].ende); if (e <= toMin(DIENST_VORLAGEN[c].start)) e += 1440;
        if ((1440 + toMin(DIENST_VORLAGEN[nx].start) - e) / 60 < 11) ruhe++;
      }
    } else { serie = 0; nserie = 0; }
  }
  const mind = {};
  for (const d of modell.dienste) {
    const werte = proTag.map((z, i) => (!modell.vollkonti && i % 7 >= 5) ? null : (z[d] || 0)).filter((x) => x !== null);
    mind[d] = werte.length ? Math.min(...werte) : 0;
  }
  return { len, wochenstunden: Math.round(std / (len / 7) * 100) / 100, dienste,
    luecken: Object.values(luecken).reduce((a, b) => a + b, 0),
    maxSerie, maxNacht, ruhe, einzel, mind, proTag };
}














/* --------------------------------------------------------------------------
   § 3 ArbZG — AUSGLEICHSZEITRAUM

   Die Lücke, die der Prüfung fehlte: Acht Stunden werktäglich, verlängerbar
   auf zehn, wenn im Durchschnitt von 24 Wochen acht nicht überschritten
   werden. Bis hierher prüfte die Anwendung die Tagesgrenze und ein
   Stundenkonto gegen eine frei gesetzte Schwelle — beides sagt nichts über
   den gesetzlichen Ausgleich. Ein Plan konnte Woche für Woche zulässig
   aussehen und den Zeitraum trotzdem reißen.

   Gerechnet wird über die tatsächlich geleisteten Stunden je Tag; die Regel
   selbst steht in src/regelwerk.js und ist dort geprüft.
   -------------------------------------------------------------------------- */
export function ausgleichPruefen(m, p, bis) {
  const ausglWochen = (m.einstellungen || {}).ausgleichWochen || AUSGLEICH_WOCHEN;
  if (!istVerfuegbar(m, p, { von: addDays(bis, -(ausglWochen * 7 - 1)), bis })) return { nichtVerfuegbar: true, eingehalten: null };
  /* Ein abgeschlossener Monat im Zeitraum ohne Freeze dieser Person (N3): nicht bewertbar statt 0 h. */
  for (let ym = addDays(bis, -(ausglWochen * 7 - 1)).slice(0, 7); ym <= bis.slice(0, 7); ym = addDays(`${ym}-01`, 32).slice(0, 7))
    if (abschlussLuecke(m, p, ym)) return { nichtVerfuegbar: true, eingehalten: null, abschlussLuecke: true };
  return memo(m, `ausgl|${p.id}|${bis}`, () => {
    const wochen = (m.einstellungen || {}).ausgleichWochen || AUSGLEICH_WOCHEN;
    const stundenAmTag = (d) => {
      const t = istTag(m, p, d);                       // abgeschlossener Monat: eingefroren (WP-16, H1)
      if (t.abwesenheit || !t.da) return 0;
      return t.idn.std;
    };
    return ausgleichszeitraum(stundenAmTag, bis, { wochen, grenze: DURCHSCHNITT_TAG });
  });
}



/** Alle Personen, deren Ausgleichszeitraum gerissen ist. */
export function ausgleichVerstoesse(m, bis) {
  const aus = [];
  for (const p of aktive(m, bis)) {
    const e = ausgleichPruefen(m, p, bis);
    if (e.nichtVerfuegbar) continue;
    if (!e.eingehalten) aus.push({ person: p, ...e });
  }
  return aus.sort((a, b) => b.ueberhang - a.ueberhang);
}

export function urlaubskonto(m, p, jahr) {
  return memo(m, `url|${p.id}|${jahr}`, () => {
    let genommen = 0; const zeilen = [];
    for (const a of absIdx(m).get(p.id) || []) {
      if (!abwArt(a.art).urlaub) continue;
      let tage = 0;
      for (let d = a.von; d <= a.bis; d = addDays(d, 1)) {
        if (d.slice(0, 4) !== String(jahr) || feiertagFuer(m, d, p) || !imDienst(p, d)) continue;
        const eid = einheitAm(p, d); if (eid && einheitDienst(m, eid, d)) tage++;
      }
      genommen += tage; zeilen.push({ ...a, tage });
    }
    /* WP-27: Ohne Kontoangaben (Betriebsrat) kein Anspruch — nicht NaN. */
    const anspruch = typeof p.urlaubsanspruch === "number" ? p.urlaubsanspruch + (p.urlaubsuebertrag || 0) : null;
    return { anspruch, genommen, rest: anspruch === null ? null : anspruch - genommen, zeilen };
  });
}

export function nachtJahr(m, p, jahr) {
  if (!istVerfuegbar(m, p, zeitraumJahr(jahr))) return { stunden: null, anzahl: null, nichtVerfuegbar: true };
  return memo(m, `nacht|${p.id}|${jahr}`, () => {
    let h = 0, n = 0;
    for (let x = 1; x <= 12; x++) {
      const r = istStunden(m, p, `${jahr}-${pad(x)}`);
      if (r.abschlussLuecke) return { stunden: null, anzahl: null, nichtVerfuegbar: true, abschlussLuecke: true };
      h += r.nacht; n += r.naechte;
    }
    return { stunden: Math.round(h * 10) / 10, anzahl: n };
  });
}
/* ==========================================================================
   RECHTSGRUNDLAGE JE BEFUNDART

   Ein Befund sagte bisher, *was* nicht stimmt, aber nie, *woraus* das folgt.
   Für die Planung macht das den Unterschied zwischen einer Meinung der
   Software und einer Vorschrift: „Ruhezeit unterschritten" lässt sich
   wegklicken, „§ 5 Abs. 1 ArbZG" nicht.

   Die Angabe ist bewusst knapp — Paragraf und Gesetz, dazu ein Halbsatz,
   was dort steht. Wer mehr braucht, findet den Volltext bei
   gesetze-im-internet.de; ihn hier einzubetten wäre Ballast und würde beim
   nächsten Änderungsgesetz falsch.

   Die Schutzvorschriften fehlen in dieser Tabelle mit Absicht: Bei ihnen
   liefert schutzBefunde() in src/regelwerk.js die Fundstelle je Befund mit,
   weil sie dort je nach Merkmal verschieden ist.
   ========================================================================== */
/* Die Tabelle steht im Regelregister (src/regelregister.js), je Eintrag mit
   Regelkennung, Prüfstatus und Gültigkeit. Hier wird sie nur gelesen: Gleiche
   Schlüssel, gleicher Wortlaut wie vorher. */
export const RECHTSQUELLE = rechtsquelleTabelle();

/**
 * Fundstelle zu einem Befund samt der Kennung der Regel aus dem Regelregister,
 * soweit der Befund einer Regel zugeordnet ist (Feld `regelId`).
 */
export function rechtsquelle(b) {
  const q = rechtsquelleDirekt(b);
  const regelId = regelIdFuerBefund(b);
  return q && regelId ? { ...q, regelId } : q;
}

/** Fundstelle zu einem Befund — bei Schutzvorschriften aus dem Befund selbst. */
export function rechtsquelleDirekt(b) {
  if (!b) return null;
  /* Einsatzregeln ohne Rohdaten (S1): keine Fundstelle — sie verriete den Grund. */
  if (b.neutral) return null;
  if (b.art === "schutz")
    return { norm: String(b.titel || "").split(" — ")[0], satz: null };
  /* Bei einer Sperre steht die Grundlage an der Qualifikation, nicht in
     der festen Tabelle — was dort gilt, hat der Betrieb hinterlegt, und
     es ist je nach Land, Tarif und Tätigkeit ein anderes. */
  if (b.quelle) {
    const e = EBENEN[b.ebene] || EBENEN.betrieb;
    return { norm: b.quelle, satz: e.satz, betrieblich: !e.gesetzlich };
  }
  return RECHTSQUELLE[b.art] || null;
}



/* Befunde, die auf Personendaten beruhen, die der Server Beschäftigten und
   dem Betriebsrat nicht ausliefert (server/lib/sicht.mjs): Mutterschutz,
   Schwerbehinderung, Geburtsdatum, arbeitsmedizinische Vorsorge und
   Einschränkungen. Aus den gekürzten Daten entstünden falsche Befunde mit
   Namen — etwa „Untersuchung anzubieten“ für jede Kollegin im Nachtdienst,
   weil das Datum der letzten Untersuchung fehlt. Wer plan.edit.unit hat,
   bekommt den Betrieb vollständig und sieht sie wie bisher. */
export const BEFUNDE_AUS_PERSONENDATEN = ["schutz", "vorsorge", "einschraenkung"];
/* Seit Commit 1e.1 bekommt auch die Schichtverantwortung Personen anderer
   Bereiche gekürzt (sichtbereich "fremd", siehe server/lib/sicht.mjs). Für
   diese Personen fehlen die Merkmale; ihre Befunde wären falsch. */
export const personFremd = (m, pid) => { const p = (m.personen || []).find((x) => x.id === pid); return !!p && p.sichtbereich === "fremd"; };
export function befundeFuer(sitz, befunde) {
  if (darf(sitz, "plan.edit.unit"))
    return befunde.filter((b) => !(BEFUNDE_AUS_PERSONENDATEN.includes(b.art) && personFremd(sitz.mandant, b.personId)));
  return befunde.filter((b) => !BEFUNDE_AUS_PERSONENDATEN.includes(b.art));
}
/** Konten einer Person: mit account.view.all — außer für Personen, deren
    Kontodaten die Sicht nicht enthält (fremder Bereich, Springer-Pool). */
export const kontoSichtbar = (sitz, p) => sitz.person.id === p.id
  || (darf(sitz, "account.view.all") && p.sichtbereich !== "fremd" && p.sichtbereich !== "pool");
export function simulation(m) {
  return memo(m, "sim", () => {
    const len = zyklusLaenge(m);
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    let std = 0, dienste = 0;
    for (const id of m.zyklus.tage) if (id && id !== "-" && map[id]) { std += dauer(map[id]); dienste++; }
    const wochenstunden = Math.round(std / m.zyklus.wochen * 100) / 100;
    const deckung = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const e of m.einheiten) {
        if (e.pool) continue;                       // Springer fahren keine Rotation
        const idx = (((i + versatzTageVon(e)) % len) + len) % len;
        const id = m.zyklus.tage[idx]; if (id && id !== "-") z[id] = (z[id] || 0) + 1; }
      deckung.push(z);
    }
    const luecken = m.dienstarten
      .filter((d) => !d.posten && (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0)
      .map((d) => ({ da: d, tage: deckung.filter((z) => !z[d.id]).length })).filter((x) => x.tage > 0);
    const t = m.zyklus.tage; let maxFolge = 0, lauf = 0, maxNacht = 0, nl = 0, einzel = 0; const konflikte = [];
    for (let i = 0; i < len; i++) {
      const c = t[i], nx = t[(i + 1) % len], pv = t[(i - 1 + len) % len];
      if (c && c !== "-") {
        lauf++; maxFolge = Math.max(maxFolge, lauf);
        if (map[c] && nachtAnteil(map[c], m.einstellungen) >= nachtschwelle(m.einstellungen)) {
          nl++; maxNacht = Math.max(maxNacht, nl); } else nl = 0;
        if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
        if (nx && nx !== "-" && map[c] && map[nx]) {
          const [, e1] = fenster("2024-01-01", map[c]); const [s2] = fenster("2024-01-02", map[nx]);
          const ruhe = (s2 - e1) / 60;
          if (ruhe < m.einstellungen.ruhezeit) konflikte.push({ von: c, nach: nx, ruhe: Math.round(ruhe * 10) / 10, tag: i });
        }
      } else { lauf = 0; nl = 0; }
    }
    return { wochenstunden, dienste, deckung, luecken, len, maxFolge, maxNacht, einzel, konflikte };
  });
}

export const darfEinheit = (s, eid) => darf(s, "plan.edit.all") || darf(s, "plan.edit.unit", eid);
/* Mitteilungen an Personen außerhalb des eigenen Bereichs nimmt der Server
   von der Schichtverantwortung nicht an (rechte.mjs, einheitZusammen) —
   dieselbe Bestimmung des eigenen Bereichs wie dort (eigeneEinheit). */
export const anBereichErlaubt = (s, p) => darf(s, "plan.edit.all") || !p || p.id === s.person.id
  || einheitAm(p, heute()) === (s.person.bereich && s.person.bereich !== "ALLE" ? s.person.bereich : einheitAm(s.person, heute()));
export const darfEntscheiden = (s, eid) => darf(s, "req.approve.all") || darf(s, "req.approve.unit", eid);
/* Dienstbuch und Übergaben tragen eine Einheit (Commit C2). Die
   Schichtverantwortung schreibt immer für ihre eigene — der Server setzt sie
   ohnehin; Planung und Leitung (plan.edit.all) wählen eine Einheit oder
   „betriebsweit" (null). */
export const eigeneEinheitVon = (s) => (s.person.bereich && s.person.bereich !== "ALLE" ? s.person.bereich : einheitAm(s.person, heute()));
export const waehltEinheit = (s) => darf(s, "plan.edit.all");
export const einheitName = (m, eid) => (eid ? ((m.einheiten || []).find((e) => e.id === eid) || {}).name || eid : "betriebsweit");

/* ------------------------------ Preisrechnung ----------------------------- */
/** Zählt Zugänge aus dem laufenden Personalbestand — daher automatisch aktuell. */
export function zugaenge(m) {
  const z = {}; for (const r of ROLLEN) if (!r.extern) z[r.id] = 0;
  for (const p of m.personen) {
    if (p.status === "gesperrt" || p.austritt) continue;
    if (z[p.rolle] === undefined) z[p.rolle] = 0;
    z[p.rolle]++;
  }
  return z;
}
/**
 * Zahl der Planer-Zugänge im laufenden Personalbestand. Die Leitung zählt
 * nicht mit — sie ist in jeder Stufe kostenfrei enthalten, wie der
 * Betriebsrat.
 */
export function planerZugaenge(m) {
  return aktive(m, heute()).filter((p) => p.rolle === "planer").length;
}

/**
 * Monatspreis eines Mandanten.
 *
 * Drei Bausteine: die Grundgebühr der gebuchten Stufe, ein Aufpreis je
 * Planer-Zugang über deren Kontingent, ein Aufpreis je Standort über
 * deren Kontingent — gestaffelt nach der Größe dieses einzelnen
 * zusätzlichen Standorts, nicht nach der Personenzahl des Betriebs.
 * Näher begründet in `standorte.js`.
 */
export function preis(db, m, ym = null) {
  const st = stufeVon(m.tarif);
  const gewaehlt = (db.tarife || []).find((x) => x.id === m.tarif) || st;

  const planerGesamt = planerZugaenge(m);
  const zusatzPlaner = Math.max(0, planerGesamt - gewaehlt.planerInklusive);
  const summePlaner = zusatzPlaner * ZUSATZ_PLANER;

  const standorte = (m.standorte || []).length ? m.standorte : [{ id: "s1", name: m.name }];
  const heuteD = heute();
  const standortPersonen = aufstellungJeStandort(m, heuteD).map((z) => z.personen);
  const zuschlaege = standortzuschlaege(standortPersonen, gewaehlt.standorteInklusive);
  const summeStandorte = zuschlaege.summe;

  /* Branchenpakete werden je Betrieb berechnet, nicht je Standort — und
     die in der Stufe enthaltenen sind frei. Enterprise trägt zwei; das
     stand bisher nur in `paketeFrei` und im Leistungstext der Karte, die
     Rechnung stellte sie trotzdem in Rechnung. */
  /* Abrechnungsgrund zählt erst für Zeiträume NACH seinem Datum: Stichtag = Beginn des Monats
     (auch ohne Monatsangabe: der laufende Monat, Review N4). Pilot = ein Pilotzeitraum berührt
     diesen Monat (Review M5), nicht der heutige Stand. */
  const paketkosten_ = mandantPaketkosten(m, gewaehlt.paketeFrei || 0, undefined, undefined, ym ? `${ym}-01` : monatsanfang(paketTag()));
  const pilot = paketkosten_.pilot;
  const pakete = paketkosten_.gewaehlt;
  const summePakete = paketkosten_.summe;
  const tarifwert = Math.round((gewaehlt.grund + summePlaner + summeStandorte + summePakete) * 100) / 100;

  /* Was der Betreiber vereinbart hat, gilt vor dem, was die Tabelle rechnet.
     Sonderpreis, Rabatt, kostenlose Zeit, ausgesetzter Monat — die
     Reihenfolge steht in preisgestaltung.js und ist dort begründet. */
  const g = monatspreis(m, tarifwert, heuteD.slice(0, 7), heuteD);
  const gesamt = g.netto;

  const zahlt = stat(m.status).zahlt;
  const personen = aktive(m, heuteD).length;
  /* Jenseits dieser Größe rechnet die Formel zwar weiter, aber die
     Oberfläche zeigt statt einer Zahl „Sprich uns an" — siehe STUFEN. */
  const kontaktEmpfohlen = planerGesamt > KONTAKT_AB_PLANER
    || zuschlaege.posten.length > KONTAKT_AB_ZUSCHLAGSSTANDORTE;
  return { t: gewaehlt, stufe: st, planerGesamt, zusatzPlaner, summePlaner,
    standorte: standorte.length, standortzuschlaege: zuschlaege, summeStandorte,
    pakete, paketeFrei: paketkosten_.frei, paketeZahlend: paketkosten_.zahlend,
    /* G9: gebucht, aber ohne nutzbare Funktion — nicht berechnet. */
    paketeNichtBerechnet: paketkosten_.nichtBerechnet, paketeOhneGrund: paketkosten_.ohneGrund, pilot,
    summePakete, grund: gewaehlt.grund, gesamt, tarifwert, gestaltung: g,
    zahlt, wirksam: zahlt ? gesamt : 0, personen, kontaktEmpfohlen,
    jeKopf: personen ? Math.round((gesamt / personen) * 100) / 100 : 0 };
}
/** Datenschutz: die Betreibersicht enthält ausschließlich Zahlen. */
/**
 * Was der Betreiber von einem Mandanten sieht. Bewusst nur Kennzahlen —
 * keine Namen, keine Dienstpläne, keine Personendaten. Der Betreiber
 * verkauft Software, er führt den Betrieb nicht.
 */
export function betreiberSicht(db, m) {
  const p = preis(db, m);
  const aktivP = aktive(m, heute());
  /* Zugänge nur als Anzahl je Art — für die Konsole reicht die Zahl. */
  const zugaenge = {};
  for (const r of ROLLEN) zugaenge[r.id] = aktivP.filter((x) => x.rolle === r.id).length;
  return { id: m.id, name: m.name, branche: m.branche, status: m.status, seit: m.seit,
    stichtag: m.stichtag, kontakt: m.kontakt, anschrift: m.anschrift, tarif: m.tarif,
    rabattGrund: m.rabattGrund, pakete: m.pakete || [],
    einheiten: m.einheiten.length, dienstarten: m.dienstarten.length,
    standorte: p.standorte, personen: p.personen, zugaenge, preis: p,
    letzteAenderung: m.protokoll[0] ? m.protokoll[0].zeit : null };
}

/* ============================== PDF-Erzeugung =============================
   Erzeugt eine echte PDF-Datei ohne Fremdbibliothek. Helvetica mit
   WinAnsi-Kodierung, damit Umlaute und das Eurozeichen stimmen.
   ========================================================================= */
export const WINANSI = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‰": 0x89, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };
export function pdfText(s) {
  let out = "";
  for (const ch of String(s)) {
    const c = WINANSI[ch] !== undefined ? WINANSI[ch] : ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 256) out += String.fromCharCode(c);
    else out += "?";
  }
  return out;
}
/** zeilen: [{x, y, text, size, bold, grau}] — Koordinaten in Millimetern von links oben. */
export function bauePDF(zeilen, linien) {
  const mm = (v) => (v * 72) / 25.4;
  const H = 297;
  let ops = "";
  for (const l of linien || []) {
    ops += `q ${l.grau !== undefined ? l.grau : 0.75} G ${l.dicke || 0.4} w ${mm(l.x1).toFixed(2)} ${mm(H - l.y1).toFixed(2)} m ${mm(l.x2).toFixed(2)} ${mm(H - l.y2).toFixed(2)} l S Q\n`;
  }
  for (const z of zeilen) {
    const font = z.bold ? "/F2" : "/F1";
    const g = z.grau !== undefined ? z.grau : 0;
    ops += `BT ${font} ${z.size || 10} Tf ${g} g ${mm(z.x).toFixed(2)} ${mm(H - z.y).toFixed(2)} Td (${pdfText(z.text)}) Tj ET\n`;
  }
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${ops.length} >>\nstream\n${ops}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Baut die Rechnungsseite und liefert PDF-Bytes. */
export function rechnungPDF(rg) {
  const T = [], L = [];
  const rechts = (x, txt, size, bold) => T.push({ x: x - String(txt).length * (size || 9) * 0.5 * 0.55, y: 0, text: txt, size, bold });
  let y = 24;
  T.push({ x: 20, y, text: rg.betreiber.firma, size: 16, bold: true });
  T.push({ x: 140, y: y - 2, text: "RECHNUNG", size: 18, bold: true });
  y += 6;
  rg.betreiber.anschrift.split("\n").forEach((z) => { T.push({ x: 20, y, text: z, size: 9, grau: 0.35 }); y += 4.5; });
  T.push({ x: 140, y: 30, text: `Nummer   ${rg.nummer}`, size: 9.5 });
  T.push({ x: 140, y: 35, text: `Datum    ${fDatum(rg.datum)}`, size: 9.5 });
  T.push({ x: 140, y: 40, text: `Zeitraum ${rg.zeitraum}`, size: 9.5 });
  T.push({ x: 140, y: 45, text: `Fällig   ${fDatum(rg.faellig)}`, size: 9.5 });

  y = 62;
  T.push({ x: 20, y, text: "Rechnungsempfänger", size: 8.5, grau: 0.45 }); y += 6;
  T.push({ x: 20, y, text: rg.mandant, size: 11, bold: true }); y += 5;
  (rg.anschrift || "").split("\n").forEach((z) => { if (z) { T.push({ x: 20, y, text: z, size: 9.5, grau: 0.3 }); y += 4.5; } });

  y = 96;
  L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.55, dicke: 0.6 }); y += 6;
  T.push({ x: 20, y, text: "Position", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 118, y, text: "Menge", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 140, y, text: "Einzel", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 170, y, text: "Betrag", size: 8.5, bold: true, grau: 0.35 });
  y += 3; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;

  for (const p of rg.positionen) {
    T.push({ x: 20, y, text: p.text, size: 10 });
    if (p.menge) T.push({ x: 118, y, text: String(p.menge), size: 10 });
    if (p.einzel) T.push({ x: 140, y, text: p.einzel, size: 10 });
    T.push({ x: 170, y, text: p.betrag, size: 10 });
    y += 6.5;
  }
  y += 2; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;
  const summe = (label, wert, bold, size) => { T.push({ x: 118, y, text: label, size: size || 10, bold });
    T.push({ x: 170, y, text: wert, size: size || 10, bold }); y += 6.5; };
  summe("Zwischensumme", eur(rg.netto));
  if (rg.rabattBetrag > 0) summe(`Rabatt ${rg.rabattText}`, "−" + eur(rg.rabattBetrag));
  summe(`Umsatzsteuer ${rg.steuersatz} %`, eur(rg.steuer));
  y += 1; L.push({ x1: 118, y1: y - 4, x2: 190, y2: y - 4, grau: 0.55, dicke: 0.6 });
  summe("Gesamtbetrag", eur(rg.brutto), true, 12);

  y += 12;
  T.push({ x: 20, y, text: `Zahlbar ohne Abzug bis ${fDatum(rg.faellig)} auf folgendes Konto:`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `IBAN ${rg.betreiber.iban}`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `Verwendungszweck ${rg.nummer}`, size: 9.5, grau: 0.3 }); y += 10;
  T.push({ x: 20, y, text: `Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}`, size: 8.5, grau: 0.5 }); y += 4.5;
  T.push({ x: 20, y, text: "Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.", size: 8.5, grau: 0.5 });

  L.push({ x1: 20, y1: 272, x2: 190, y2: 272, grau: 0.85 });
  T.push({ x: 20, y: 278, text: `${rg.betreiber.firma} · ${rg.betreiber.anschrift.replace(/\n/g, " · ")}`, size: 7.5, grau: 0.55 });
  return bauePDF(T, L);
}

/** Dieselbe Rechnung als Word-Dokument (HTML, das Word verlustfrei öffnet). */
export function rechnungHTML(rg) {
  const z = (p) => `<tr><td>${p.text}</td><td style="text-align:right">${p.menge || ""}</td>
    <td style="text-align:right">${p.einzel || ""}</td><td style="text-align:right">${p.betrag}</td></tr>`;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${rg.nummer}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}
h1{font-size:20pt;margin:0 0 4pt}table{width:100%;border-collapse:collapse;margin-top:14pt}
th{text-align:left;font-size:9pt;color:#555;border-bottom:1px solid #999;padding:4pt 0}
td{padding:5pt 0;border-bottom:1px solid #eee}
.s td{border:none;padding:3pt 0}.r{text-align:right}</style></head><body>
<table style="margin:0"><tr><td><h1>${rg.betreiber.firma}</h1>
<div style="font-size:9pt;color:#555">${rg.betreiber.anschrift.replace(/\n/g, "<br>")}</div></td>
<td class="r" style="vertical-align:top"><h1>RECHNUNG</h1>
<div style="font-size:10pt">Nummer ${rg.nummer}<br>Datum ${fDatum(rg.datum)}<br>Zeitraum ${rg.zeitraum}<br>Fällig ${fDatum(rg.faellig)}</div>
</td></tr></table>
<p style="margin-top:22pt;font-size:9pt;color:#555">Rechnungsempfänger</p>
<p style="margin:0"><b>${rg.mandant}</b><br><span style="font-size:10pt;color:#333">${(rg.anschrift || "").replace(/\n/g, "<br>")}</span></p>
<table><tr><th>Position</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Betrag</th></tr>
${rg.positionen.map(z).join("")}</table>
<table class="s" style="margin-top:12pt"><tr><td></td><td class="r" style="width:120pt">Zwischensumme</td><td class="r" style="width:90pt">${eur(rg.netto)}</td></tr>
${rg.rabattBetrag > 0 ? `<tr><td></td><td class="r">Rabatt ${rg.rabattText}</td><td class="r">−${eur(rg.rabattBetrag)}</td></tr>` : ""}
<tr><td></td><td class="r">Umsatzsteuer ${rg.steuersatz} %</td><td class="r">${eur(rg.steuer)}</td></tr>
<tr><td></td><td class="r"><b>Gesamtbetrag</b></td><td class="r"><b>${eur(rg.brutto)}</b></td></tr></table>
<p style="margin-top:20pt;font-size:10pt;color:#333">Zahlbar ohne Abzug bis ${fDatum(rg.faellig)}<br>
IBAN ${rg.betreiber.iban}<br>Verwendungszweck ${rg.nummer}</p>
<p style="font-size:8.5pt;color:#666">Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}<br>
Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.</p>
</body></html>`;
}

/** Stellt die Rechnungsdaten aus dem aktuellen Bestand zusammen. */
export function baueRechnung(db, m, monatISO) {
  const p = preisAnteilig(db, m, monatISO);
  const nr = `${monatISO.replace("-", "")}-${m.id.slice(-4).toUpperCase()}`;
  const positionen = [];
  const g = p.gestaltung || {};

  if (g.herkunft === "sonderpreis") {
    /* Bei einer individuellen Vereinbarung ist die Aufschlüsselung
       irreführend: Sie summiert sich auf einen Betrag, der nicht in
       Rechnung gestellt wird. Stattdessen eine Zeile mit dem, was
       vereinbart wurde — und darunter, wofür sie gilt. */
    positionen.push({ text: g.text, menge: "monatlich",
      einzel: eur(g.netto), betrag: eur(Math.round(g.netto * p.anteil * 100) / 100) });
    positionen.push({
      text: `Umfasst ${zahl(p.standorte)} ${p.standorte === 1 ? "Standort" : "Standorte"} `
        + `und ${zahl(p.personen)} ${p.personen === 1 ? "Person" : "Personen"}`,
      menge: "", einzel: "", betrag: "" });
  } else {
    positionen.push({ text: `Grundgebühr ${p.stufe.name}`,
      menge: `${zahl(p.stufe.planerInklusive)} Planer, ${zahl(p.stufe.standorteInklusive)} Standort${p.stufe.standorteInklusive === 1 ? "" : "e"} inklusive`,
      einzel: eur(p.grund), betrag: eur(Math.round(p.grund * p.anteil * 100) / 100) });
    if (p.zusatzPlaner > 0)
      positionen.push({ text: `${zahl(p.zusatzPlaner)} zusätzliche${p.zusatzPlaner === 1 ? "r" : ""} Planer-Zugang${p.zusatzPlaner === 1 ? "" : "änge"}`,
        menge: "", einzel: eur(ZUSATZ_PLANER),
        betrag: eur(Math.round(p.summePlaner * p.anteil * 100) / 100) });
    /* Je zuschlagspflichtigem Standort eine Zeile — der Kunde sieht, wofür
       er zahlt. Die kostenlosen, im Kontingent enthaltenen Standorte
       tauchen bewusst nicht auf: Eine Zeile mit dem Betrag „0,00 €" liest
       sich wie ein Fehler in der Abrechnung, nicht wie eine Vergünstigung. */
    for (const posten of p.standortzuschlaege.posten)
      positionen.push({ text: "Standort über dem Kontingent",
        menge: `${zahl(posten.personen)} Personen`,
        einzel: eur(posten.zuschlag),
        betrag: eur(Math.round(posten.zuschlag * p.anteil * 100) / 100) });
    /* Die in der Stufe enthaltenen Pakete stehen mit auf der Rechnung,
       aber mit null — sonst fragt jemand, wo sein Paket geblieben ist. */
    /* G9: nicht berechnete Pakete (Zustand < 5, Pilot) erzeugen keine Position (paketlogik.js). */
    positionen.push(...paketPositionen(p, eur));
    if (g.rabatt > 0)
      positionen.push({ text: "Vereinbarter Nachlass", menge: "", einzel: "",
        betrag: `−${Math.round(g.rabatt * 100)} %` });
  }

  if (p.anteil < 1)
    positionen.push({ text: `Anteilig ${p.tage} von ${p.gesamtTage} Tagen`, menge: "",
      einzel: "", betrag: "" });

  const netto = p.gesamt;
  const steuer = Math.round(netto * (db.betreiber || BETREIBER_LEER).steuersatz) / 100;
  return { nummer: nr, datum: heute(), faellig: addDays(heute(), (db.betreiber || BETREIBER_LEER).zahlungsziel),
    zeitraum: `${MON[Number(monatISO.slice(5, 7)) - 1]} ${monatISO.slice(0, 4)}`,
    mandantId: m.id, mandant: m.name, anschrift: m.anschrift, betreiber: db.betreiber || BETREIBER_LEER,
    positionen, netto, rabattBetrag: 0, rabattText: "", steuersatz: (db.betreiber || BETREIBER_LEER).steuersatz,
    steuer, brutto: Math.round((netto + steuer) * 100) / 100,
    standorte: p.standorte, personen: p.personen, tarif: p.t.name };
}

/* ==========================================================================
   ERWEITERTER RECHENKERN
   Krankmeldung und Ersatzsuche · Personenbezogene Einschränkungen ·
   Freigabe und Rückkanal · Ist-Erfassung · Verteilungsgerechtigkeit ·
   Anteilige Abrechnung
   ========================================================================== */

/** Rolle einer Person an einem Stichtag — Grundlage der anteiligen Abrechnung. */
export function rolleAm(p, d) {
  if (!p.rolleVerlauf || !p.rolleVerlauf.length) return (!p.rolleSeit || p.rolleSeit <= d) ? p.rolle : "mitarbeiter";
  let t = null;
  for (const z of p.rolleVerlauf) if (z.ab <= d) t = z;
  return t ? t.rolle : p.rolle;
}
export const einschr = (p) => p.einschraenkungen || {};




export const offeneErfassung = (m, p, bis) => {
  const out = [];
  for (let d = addDays(bis, -13); d <= bis; d = addDays(d, 1)) {
    /* Abgeschlossener Monat (WP-16): keine Selbstauskunft mehr — der Server nimmt sie nicht an. */
    if (monatAbgeschlossen(m, d)) continue;
    const t = personTag(m, p, d);
    if (!t.dienstId) continue;
    /* WP-15: Ein abgelehnter oder zurückgezogener Antrag lässt sich neu stellen; offen/freigegeben/erfasst nicht. */
    const erf = m.erfassung && m.erfassung[`${p.id}|${d}`];
    if (erf && !(erf.selbstauskunft && ["abgelehnt", "zurueckgezogen"].includes(erf.selbstauskunft.status))) continue;
    out.push(d);
  }
  return out;
};

/* ------------------ Personenbezogene Einschränkungen --------------------- */
/* Warnen statt sperren (E-19).

   Keine Regel verhindert die Entscheidung eines berechtigten Menschen.
   Jeder Befund trägt eine Stufe:
   - hinweis:  Information, nichts zu bestätigen
   - achtung:  betriebliche Vorgabe, Tarif oder Personalkonflikt — ein Klick
   - recht:    gesetzliche Vorgabe — „gelesen" ankreuzen, Grund freiwillig
   Die Maschine selbst (Planungsassistent) setzt weiter nur Einteilungen
   ohne Befund; der Mensch darf über den Warndialog abweichen. */
/* Stufen, Gründe und Protokolleinträge stehen in src/warnstufen.js. */

/* Quellenangaben für Schutzbefunde ohne Fundstelle: Den Grund einer
   Einsatzregel oder Einschränkung nennt CENTRIC nie. */
export const SCHUTZ_QUELLE_NEUTRAL = "Schutzvorschrift oder Einsatzregel für diese Person";
export const SCHUTZ_QUELLE_EINSCHRAENKUNG = "Schutzvorschrift oder Einsatzeinschränkung für diese Person";



/** Die in der Kalenderwoche von d schon geplanten Stunden einer Person. */
export function wochenStundenGeplant(m, p, d) {
  const mo = montag(d);
  let std = 0;
  for (let i = 0; i < 7; i++) {
    const t = personTag(m, p, addDays(mo, i));
    if (!t.dienstId) continue;
    const x = m.dienstarten.find((y) => y.id === t.dienstId);
    if (x) std += dauer(x);
  }
  return std;
}

/**
 * Prüft, ob eine Person an einem Tag einen bestimmten Dienst leisten kann,
 * und liefert die Befunde mit Stufe, Quelle und Text — leer bedeutet
 * regelkonform. Die Befunde gehen in den Warndialog. Ob ein Befund sperrt
 * (kein „dennoch", Bewerbung, Selbstplanung, Zuschlag, Übernahme blockiert)
 * oder warnt, steht an genau einer Stelle: SPERR_REGELN in src/warnstufen.js
 * (Review WP-10, H1 — bis zur Fachentscheidung die strenge Kette-B-Variante).
 * `regel` ist der Schlüssel dort.
 */
export function hindernisBefunde(m, p, d, da) {
  const g = [];
  /* regel: Schlüssel im Befundkatalog (sperrt oder warnt, BEFUND_KATALOG);
     regelId: Kennung im Regelregister (Fundstelle, Quellenstand) — beides
     Kennungen, kein Text. */
  const push = (stufe, text, quelle, art, regel, regelId) => g.push({ stufe, text, quelle, art: art || "regel",
    regel: regel || art || "regel", sperrt: sperrtArt(regel || art || "regel"),
    regelId: regelId === undefined ? regelIdFuerBefund({ art: art || "regel", quelle }) : regelId });
  /* Die Fachprüfung der Einteilung (WP-22): einteilungsBefunde in
     server/lib/fachpruefung.mjs — dieselbe, mit der der Server prüft (keine
     zweite Prüflogik). Darin die eine Schutzprüfung schutzEinsatz (mit den
     Einstellungen des Betriebs), Einschränkungen an der Person, verbindliche
     Qualifikationen, Einweisungen, Ruhezeit, Höchstzahl je Woche,
     Alleindienst und die Tagesgrenze. Den Plan liefert hier personTag
     (Posten, Springer, Teilzeit), die Besetzung besetzung(). Den Grund einer
     neutralen Einsatzregel oder Einschränkung nennt kein Befund. */
  const fach = einteilungsBefunde(m, p, da, d, {
    dienstAm: (x, t) => personTag(m, x, t).dienstId || null,
    alleinOhnePartner: (x, t, daId) => {
      const b = besetzung(m, t)[daId];
      return !(b ? b.personen : []).some((y) => y.id !== x.id && !einschr(y).keinAlleindienst);
    },
    heute: heute(),
    /* Branchenmodule (WP-19): die Besetzung des Dienstes so, wie sie mit dieser
       Einteilung wäre. Befunde nur aus aktiven Modulen, höchstens Hinweis. */
    branchen: { personenImDienst: (t, daId) => {
      const l = ((besetzung(m, t) || {})[daId] || { personen: [] }).personen;
      return l.some((y) => y.id === p.id) ? l : [...l, p];
    } },
  });
  const fachPush = (b) => {
    const regelId = b.art === "schutz" ? (b.neutral || b.quelle === SCHUTZ_QUELLE_EINSCHRAENKUNG ? null
      : regelIdFuerBefund({ art: "schutz", quelle: b.quelle })) : undefined;
    push(b.stufe, b.text, b.quelle, b.art, b.regel, regelId);
  };
  const vorQualifikation = ["bestand", "schutz", "schutzWeich", "schutzOffen", "schutzHinweis", "keineNacht"];
  const bis = (liste) => fach.filter((b) => liste.includes(b.regel));
  for (const b of bis(["bestand"])) fachPush(b);
  /* Eine Abwesenheit ist ein Datenkonflikt, keine Planungsregel: Der Dialog
     bietet an, sie für diesen Tag aufzuheben. */
  const abw = abwesenheitAm(m, p.id, d);
  if (abw) push("achtung", `abwesend (${abwArt(abw.art).label})`, "Abwesenheit", "abwesend", "abwesend");
  for (const b of bis(vorQualifikation.slice(1))) fachPush(b);
  if (!verfuegbarFuer(p, d, da))
    push("achtung", `nicht verfügbar (${FENSTER[fensterVon(da)].name} ${DOW[dow(d)]})`, "Verfügbarkeit der Person", "regel", "verfuegbarkeit");
  for (const b of bis(["qualifikationGesetzlich", "qualifikationBetrieblich", "kompetenz"])) fachPush(b);
  const tz = p.teilzeit;
  if (tz && tz.aktiv && tz.modus === "wochentage" && !(tz.wochentage || []).includes(dow(d)))
    push("achtung", "arbeitet an diesem Wochentag nicht", "Teilzeitvereinbarung", "regel", "teilzeit");
  for (const b of bis(["ruhezeitGesetz", "ruhezeitBetrieb", "maxDiensteWoche", "keinAlleindienst", "tagesgrenze"])) fachPush(b);
  /* Branchenmodule (WP-19): Hinweise mit eigener Regelkennung aus dem Register. */
  for (const b of bis(["branche"])) push(b.stufe, b.text, b.quelle, b.art, b.regel, b.regelId || null);
  // Dienste in Folge (Einstellung des Betriebs; nur die Oberfläche)
  let lauf = 0;
  for (let i = 1; i <= m.einstellungen.maxFolge + 1; i++) {
    if (personTag(m, p, addDays(d, -i)).dienstId) lauf++; else break;
  }
  if (lauf >= m.einstellungen.maxFolge)
    push("achtung", `${lauf} Dienste in Folge davor`, `höchstens ${m.einstellungen.maxFolge} Dienste in Folge (Einstellung des Betriebs)`,
      "regel", "folge");
  return g;
}

/** Die Befunde als Text — für alle Stellen, die nur den Wortlaut brauchen. */
/* Nur was ab „Achtung" wiegt; ein Hinweis (etwa „nicht bewertbar") hindert nicht. */
export const hindernisse = (m, p, d, da) => hindernisBefunde(m, p, d, da).filter((b) => stufeRang(b.stufe) >= 2).map((b) => b.text);

/** Der erste harte Schutzbefund (sperrt: true) oder null. Die Planungsaktionen
    prüfen ihn selbst noch einmal — der Warndialog ist nicht die einzige
    Schranke (Kette B; Vereinheitlichung WP-11). */
export const schutzSperre = (m, p, d, da) => (p && da && hindernisBefunde(m, p, d, da).find((b) => b.sperrt)) || null;

/**
 * Befunde für eine geplante Einteilung, wie der Warndialog sie braucht.
 * Ergänzt die Regelbefunde um den Hinweis, dass ein bestehender Dienst
 * ersetzt würde.
 */
export function befundeFuerEinteilung(m, personId, datum, dienstId) {
  const p = m.personen.find((x) => x.id === personId);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!p || !da) return { person: p || null, da: da || null, befunde: [], technisch: "Person oder Dienstart nicht gefunden" };
  const befunde = hindernisBefunde(m, p, datum, da);
  const vorher = personTag(m, p, datum).dienstId;
  if (vorher && vorher !== dienstId) {
    const alt = m.dienstarten.find((x) => x.id === vorher);
    befunde.push({ stufe: "hinweis", text: `ersetzt den geplanten ${alt ? alt.name : vorher}`, quelle: "Plan", art: "umteilung" });
  }
  /* Die Wochenstundengrenze (S2a): ein Hinweis, nichts zu bestätigen. Die
     Schutzbefunde selbst stehen schon in hindernisBefunde (schutzEinsatz) —
     nicht noch einmal (WP-11). */
  const grenze = stundengrenzeHinweis(p, da, datum, () => wochenStundenGeplant(m, p, datum));
  if (grenze) befunde.push({ stufe: "hinweis", text: grenze.text, quelle: SCHUTZ_QUELLE_NEUTRAL, art: "schutzhinweis" });
  return { person: p, da, befunde };
}

/** Hebt eine Abwesenheit für genau einen Tag auf (src/warnstufen.js). */
export const abwesenheitTagAufheben = (m, personId, datum) =>
  abwTagAufheben(m.abwesenheiten, personId, datum, () => uid("a"));

/**
 * Hält eine bestätigte Abweichung fest (Bestätigungsprotokoll). Ist eine
 * gesetzliche Vorgabe betroffen, unterrichtet der Server die Leitung.
 *
 * @param best   was der Warndialog zurückgibt: eintraege mit befunden, grund
 * @param wer    { personId, name, rolle } der bestätigenden Person
 * @param aktion Kennung der Planungsaktion, z. B. „einsprung"
 */
export function bestaetigungVermerken(m, best, wer, aktion) {
  const neu = bestaetigungsEintraege(best, wer, aktion,
    { neueId: () => uid("bs"), zeit: new Date().toISOString(), regelstand: REGELSTAND.version });
  if (!neu.length) return m;
  /* Die Mitteilung an die Leitung bei einem Rechtsverstoß erzeugt der Server
     beim Speichern (server/lib/bestaetigungen.mjs, WP-10 d.4) — auch für die
     Schichtverantwortung, deren Mitteilungen sonst nur in den eigenen
     Bereich gehen dürfen. Wer und Zeit des Eintrags setzt ebenfalls der Server. */
  return { ...m, bestaetigungen: [...neu, ...(m.bestaetigungen || [])].slice(0, 2000) };
}

/**
 * Offene Schutzkonflikte (Nachprüfung 948a4ba, A2): künftige Einteilungen,
 * denen eine harte Schutz- oder Einsatzregel der Person widerspricht — etwa
 * nachdem ein Mutterschutz eingetragen wurde, der immer gespeichert wird. Sie
 * bleiben sichtbar (Startseite, Monatsplan), bis umgeplant ist. Gerechnet für
 * Personen mit Schutzangaben oder Einsatzregeln: die Schichtfolge ein Jahr
 * voraus, ausdrückliche Einteilungen für den ganzen künftigen Zeitraum.
 * Schlüssel „personId|Datum". Die Rechnung steht in schutzkonflikteSchritte
 * (server/lib/fachpruefung.mjs) — dieselbe Quelle wie Server und Einsatzregeln.
 */
/** Der Plan der Oberfläche für die Konfliktrechnung (personTag, Abwesenheit frei). */
export const schutzkonfliktPlan = (m) => ({ heute: heute(),
  dienstAm: (p, d) => { const t = personTag(m, p, d); return t.abwesenheit ? null : t.dienstId; } });

/**
 * Offene Schutzkonflikte für eine Ansicht (Nachtrag WP-22b): entprellt
 * (250 ms nach der letzten Änderung) und in Häppchen gerechnet
 * (schutzkonflikteSchritte, höchstens SCHUTZKONFLIKT_HAEPPCHEN_MS am Stück),
 * damit der Plan beim Bearbeiten nicht ruckelt. Bis das Ergebnis da ist,
 * gilt das vorige.
 */
/* Der Haken selbst liegt in src/schutzkonflikte-hook.js (Verhalten dort geprüft): letzte Rechnung der Sitzung als
   Startwert, aktiv=false rechnet nicht, Abmelden und Rollenwechsel leeren das Gemerkte. */
export const useSchutzkonflikte = (sitz, aktiv = true) => useSchutzkonflikteBasis(sitz, aktiv, schutzkonfliktPlan, heute);

/**
 * Bestätigte Abweichungen, die im Plan noch wirken: Die Person hat an dem
 * Tag weiter genau diesen Dienst. Ist die Einteilung inzwischen geändert,
 * ist die Abweichung behoben und verschwindet von der Markierung.
 * Schlüssel „personId|Datum".
 */
export function offeneAbweichungen(m, von, bis) {
  const aus = new Map();
  for (const b of m.bestaetigungen || []) {
    if (!b || !b.personId || b.datum < von || b.datum > bis) continue;
    const p = m.personen.find((x) => x.id === b.personId);
    if (!p || personTag(m, p, b.datum).dienstId !== b.dienstId) continue;
    const k = `${b.personId}|${b.datum}`;
    if (!aus.has(k) || stufeRang(b.stufe) > stufeRang(aus.get(k).stufe)) aus.set(k, b);
  }
  return aus;
}

/**
 * Ersatzsuche für einen unterbesetzten Dienst.
 * Sortiert nach Eignung: Qualifikation, Stundenkonto im Minus, Belastungsausgleich.
 */
export function ersatzVorschlaege(m, d, dienstId, ctx) {
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
    const konten = m.personen.filter((x) => imDienst(x, d)).map((x) => stundenkonto(m, x, ym))
      .filter((k) => k !== null).sort((a, b2) => a - b2);
    median = konten.length ? konten[Math.floor(konten.length / 2)] : 0;
    const naechteJe = m.personen.filter((x) => imDienst(x, d)).map((x) => nachtJahr(m, x, jahr).anzahl)
      .filter((k) => k !== null);
    nachtMittel = naechteJe.length ? naechteJe.reduce((a, b2) => a + b2, 0) / naechteJe.length : 0;
  }

  const out = [];
  for (const p of m.personen) {
    const t = personTag(m, p, d);
    if (t.dienstId) continue;                      // hat bereits Dienst
    /* Einmal prüfen (WP-11): was ab „Achtung" wiegt, hindert; Hinweise
       (nicht bewertbar) stehen bei den Gründen. */
    const bef = hindernisBefunde(m, p, d, da);
    const g = bef.filter((b) => stufeRang(b.stufe) >= 2).map((b) => b.text);
    const kto = ctx ? (ctx.konten.has(p.id) ? ctx.konten.get(p.id) : 0) : stundenkonto(m, p, ym);
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
    /* Ohne Ist-Daten (Rollenschutz) gibt es kein Konto — dann keine Aussage dazu. */
    const relKto = kto === null ? null : kto - median;
    if (relKto === null) gruende.push("Stundenkonto nicht verfügbar");
    else if (relKto < -3) { punkte += Math.min(30, -relKto * 2); gruende.push(`${n1(Math.abs(relKto))} h unter dem Mittel`); }
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
    if (nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen) && nj > nachtMittel + 3) {
      punkte -= 8; gruende.push(`${nj} Nachtdienste im Jahr`); }
    /* Weiche Schutzregeln sind seit WP-11 „Achtung" (oben in g, wie im
       Warndialog); hier nur, was nichts zu bestätigen hat: nicht Bewertbares
       und die Wochenstundengrenze (S2a). Kein Befund steht doppelt. */
    for (const b of bef) if (b.stufe === "hinweis") gruende.push(`Hinweis: ${b.text}`);
    const grenze = stundengrenzeHinweis(p, da, d, () => wochenStundenGeplant(m, p, d));
    if (grenze) gruende.push(`Hinweis: ${grenze.text}`);
    out.push({ person: p, punkte: Math.round(punkte), gruende, hindernisse: g, moeglich: g.length === 0 });
  }
  out.sort((a, b2) => (a.moeglich !== b2.moeglich) ? (a.moeglich ? -1 : 1) : b2.punkte - a.punkte);
  return out;
}

/* --------------------------- Freigabe und Rückkanal ---------------------- */
export const freigabeStand = (m, ym) => (m.freigaben && m.freigaben[ym]) || null;
export const istFreigegeben = (m, ym) => !!freigabeStand(m, ym);
/** Vorlauf in Tagen zwischen Änderung und betroffenem Diensttag. */
export const vorlauf = (datum) => between(heute(), datum);

/** Kennzahl Planungssicherheit: Anteil kurzfristiger Änderungen an allen Änderungen. */
export function planungssicherheit(m, ym, grenze = 14) {
  const alle = (m.aenderungen || []).filter((a) => a.datum.slice(0, 7) === ym);
  const kurz = alle.filter((a) => a.vorlauf < grenze);
  const jePerson = {};
  for (const a of kurz) jePerson[a.personId] = (jePerson[a.personId] || 0) + 1;
  return { gesamt: alle.length, kurzfristig: kurz.length,
    anteil: alle.length ? Math.round(kurz.length / alle.length * 100) : 0, jePerson, grenze };
}



/* --------------------------- Anteilige Abrechnung ------------------------ */
/**
 * Zählt Zugänge tagesgenau und mittelt über den Monat.
 * Ein am Zwanzigsten angelegter Zugang schlägt nur anteilig zu Buche.
 */
export function zugaengeAnteilig(m, ym) {
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
export function preisAnteilig(db, m, ym) {
  /* Anteilige Berechnung für unterjährig begonnene oder beendete Verträge.
     Standortpreise werden tagesgenau geteilt — wer am 15. dazukommt, zahlt
     den halben Monat. */
  const p = preis(db, m, ym);
  const [y, mo] = ym.split("-").map(Number);
  const tage = dim_(y, mo - 1);
  const von = `${ym}-01`, bis = `${ym}-${pad(tage)}`;
  const start = m.seit && m.seit > von ? m.seit : von;
  const ende = m.bis && m.bis < bis ? m.bis : bis;
  if (start > bis || ende < von) return { ...p, anteil: 0, tage: 0, gesamtTage: tage,
    gesamt: 0, wirksam: 0 };
  const genutzt = between(start, ende) + 1;
  const anteil = Math.min(1, genutzt / tage);

  /* Die Vereinbarung wird für *diesen* Monat neu befragt, nicht aus preis()
     übernommen. Ein Betrieb kann im August kostenlos sein und im September
     zahlen — der Rechnungslauf im Oktober darf dann nicht die Augustlage
     verwenden. */
  const g = monatspreis(m, p.tarifwert, ym, heute());
  const grund = g.netto;
  const zahlt = p.zahlt && !g.frei && !g.ausgesetzt;

  return { ...p, anteil, tage: genutzt, gesamtTage: tage, gestaltung: g,
    gesamt: Math.round(grund * anteil * 100) / 100,
    wirksam: zahlt ? Math.round(grund * anteil * 100) / 100 : 0 };
}

/* ==========================================================================
   RECHENKERN — ZWEITE AUSBAUSTUFE
   Zuschläge · Freizeitausgleich · Kapazitätsvorschau · Jahresurlaubsrunde ·
   Planungsassistent · Eskalation bei Unterdeckung · Datenschutzbetrieb
   ========================================================================== */

/* ------------------------------- Zuschläge ------------------------------- */
/**
 * Zerlegt einen Dienst in Kalendertage und ordnet die Stunden zu.
 * Ein Nachtdienst von Samstag 21:30 bis Sonntag 07:15 zählt anteilig
 * als Samstags- und als Sonntagsarbeit.
 */
/* tagesanteile und zuschlagTagAddieren: server/lib/isteinfrieren.mjs (WP-16, Nachtrag M-neu-2). */
/** Zuschlagsrelevante Stunden einer Person in einem Monat. */
export function zuschlagStunden(m, p, ym) {
  const ohneIst = !istVerfuegbar(m, p, zeitraumMonat(ym));
  return memo(m, `zus|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number);
    const n = dim_(y, mo - 1);
    const r = { nacht: 0, sonntag: 0, feiertag: 0, samstag: 0, gesamt: 0 };
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      /* Abgeschlossener Monat: der eingefrorene Dienst und seine Ist-Dauer (WP-16, Review H1). */
      const t = istTag(m, p, d);
      const da = t.da;
      if (!da) continue;
      const gearbeitet = t.idn.std;
      r.gesamt += gearbeitet;
      zuschlagTagAddieren(m, p, d, da, r);
    }
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * 100) / 100;
    /* Abgeschlossener Monat (WP-16, Nachtrag M-neu-2): Nacht-, Sonn-, Feiertags- und Samstagsstunden wie zum
       Abschluss — Nachtfenster, Bundesland/Feiertage und Standort von damals. */
    const fm = eingefrorenerMonat(m, p, ym);
    if (fm && Array.isArray(fm.z)) [r.nacht, r.sonntag, r.feiertag, r.samstag] = fm.z.map((x) => Number(x) || 0);
    /* Freeze fehlt (N3): keine Zahlen statt 0. */
    if (abschlussLuecke(m, p, ym)) return { nacht: null, sonntag: null, feiertag: null, samstag: null, gesamt: null, nichtVerfuegbar: true, abschlussLuecke: true };
    /* Nacht-, Sonn- und Feiertagsanteile folgen dem Plan; die gearbeiteten
       Stunden gibt es ohne Ist-Daten nicht. */
    if (ohneIst) { r.gesamt = null; r.nichtVerfuegbar = true; }
    return r;
  });
}
/**
 * Bewertet die Zuschläge in Ausgleichsstunden.
 * Bewusst ohne Entgelt: Löhne gehören in die Lohnabrechnung, nicht in die Planung.
 * Ausgegeben wird, was die Lohnstelle braucht — Stunden je Zuschlagsart.
 */
export function zuschlagWert(m, p, ym) {
  const std = zuschlagStunden(m, p, ym);
  /* Abgeschlossener Monat: die Zuschlagsregeln zum Abschluss (M-neu-2). */
  const fb = eingefrorenerBetrieb(m, ym);
  /* Schema ≥ 2 ohne eingefrorene Regeln (WP-16, Nachtrag dritter Review M-1, P7): nicht die heutigen Regeln
     rückwirkend anwenden, sondern „nicht verfügbar". */
  const st = freezeStatus(m, ym);
  if (st && (st.unbekannt || (st.schema >= 2 && !(fb && Array.isArray(fb.zs)))))
    return { std, zeilen: [], summe: null, nichtVerfuegbar: true };
  const regeln = fb && Array.isArray(fb.zs) ? fb.zs : m.zuschlaege;
  const zeilen = (regeln || []).filter((z) => z.aktiv).map((z) => {
    const h = std[z.art] || 0;
    return { regel: z, stunden: Math.round(h * 100) / 100,
      wert: Math.round(h * z.prozent / 100 * 100) / 100 };
  });
  return { std, zeilen, summe: Math.round(zeilen.reduce((a, l) => a + l.wert, 0) * 100) / 100 };
}

/* --------------------------- Freizeitausgleich --------------------------- */
/** Wie viele Freischichten baut das Konto bis auf die Zielgröße ab? */
export function ausgleichBedarf(m, p, ym) {
  const kto = stundenkonto(m, p, ym);
  const grenze = m.einstellungen.ausgleichGrenze || 40;
  if (kto <= 0) return { kto, grenze, ueber: 0, schichten: 0, faellig: false };
  const mittel = m.dienstarten.filter((d) => !d.posten).reduce((a, d) => a + dauer(d), 0)
    / Math.max(1, m.dienstarten.filter((d) => !d.posten).length);
  return { kto, grenze, ueber: Math.round(Math.max(0, kto - grenze) * 10) / 10,
    schichten: Math.ceil(kto / Math.max(1, mittel)), faellig: kto > grenze, mittel };
}
/** Nächste geplante Diensttage, die sich als Freischicht eignen. */
export function ausgleichTage(m, p, ab, anzahl = 10) {
  const out = [];
  for (let i = 0; i < 120 && out.length < anzahl; i++) {
    const d = addDays(ab, i);
    const t = personTag(m, p, d);
    if (!t.dienstId || t.abwesenheit) continue;
    const b = besetzung(m, d)[t.dienstId];
    out.push({ datum: d, dienstId: t.dienstId, puffer: b.diff, moeglich: b.diff > 0 });
  }
  return out;
}

/* --------------------------- Kapazitätsvorschau -------------------------- */
/**
 * Beantwortet die Frage, die vor jeder Genehmigung steht:
 * Wenn ich die offenen Anträge bewillige — trage ich die kommenden Wochen noch?
 */
export function vorschau(m, wochen = 8) {
  return memo(m, `vor|${wochen}`, () => {
    const start = montag(heute());
    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ === "abwesenheit");
    const mitAntraegen = { ...m, abwesenheiten: [...m.abwesenheiten,
      ...offen.map((a) => ({ id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "beantragt" }))] };
    const out = [];
    for (let w = 0; w < wochen; w++) {
      const von = addDays(start, w * 7), bis = addDays(von, 6);
      const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const dann = pruefen(mitAntraegen, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const betroffen = offen.filter((a) => a.von <= bis && a.bis >= von);
      out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
        neu: Math.max(0, dann.length - jetzt.length), antraege: betroffen.length,
        status: dann.length > jetzt.length ? "danger" : jetzt.length ? "warn" : "ok" });
    }
    return { wochen: out, offen };
  });
}

/* --------------------------- Jahresurlaubsrunde -------------------------- */
/** Überschneidungen der Wünsche je Einheit und Tag — Grundlage der Entscheidung. */
export function urlaubskonflikte(m) {
  const r = m.urlaubsrunde;
  if (!r) return [];
  const proTag = {};
  for (const w of r.wuensche) {
    if (w.status === "abgelehnt") continue;
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    for (let d = w.von; d <= w.bis; d = addDays(d, 1)) {
      const eid = einheitAm(p, d) || "?";
      const k = `${eid}|${d}`;
      (proTag[k] = proTag[k] || []).push(w);
    }
  }
  const out = [];
  for (const [k, liste] of Object.entries(proTag)) {
    const [eid, d] = k.split("|");
    const grenze = (r.kontingent && r.kontingent[eid]) || m.einstellungen.maxUrlaubJeEinheit;
    if (liste.length > grenze) out.push({ einheitId: eid, datum: d, anzahl: liste.length, grenze, wuensche: liste });
  }
  out.sort((a, b) => (a.datum < b.datum ? -1 : 1));
  return out;
}
/**
 * Vorrangregel: wer im Vorjahr zurückstecken musste, kommt zuerst.
 * Danach die niedrigere selbstvergebene Priorität, danach das ältere Eingangsdatum.
 */
export function urlaubsRang(m, w) {
  const p = m.personen.find((x) => x.id === w.personId);
  const zurueck = ((m.urlaubsrunde && m.urlaubsrunde.vorjahrZurueck) || []).includes(w.personId) ? 0 : 1;
  return [zurueck, w.prio || 3, w.erstellt || "", p ? p.nachname : ""];
}

/* --------------------------- Planungsassistent --------------------------- */
/**
 * Füllt offene Stellen eines Monats automatisch.
 * Nutzt dieselbe Bewertung wie die Ersatzsuche und meldet, was offen bleibt.
 * Rechnet mit vorab ermittelten Konten, sonst wäre der Durchlauf zu langsam.
 */
export function planeMonat(m, ym, grenzen = {}) {
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const maxProPerson = grenzen.maxProPerson || 3;
  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map() };
  const jahr = Number(ym.slice(0, 4));
  for (const p of m.personen) {
    ctx.konten.set(p.id, stundenkonto(m, p, ym));
    ctx.nachtAnzahl.set(p.id, nachtJahr(m, p, jahr).anzahl);
  }
  for (const e of m.einspruenge || []) ctx.einspruenge[e.personId] = (ctx.einspruenge[e.personId] || 0) + 1;
  const werte = [...ctx.konten.values()].filter((k) => k !== null).sort((a, b) => a - b);
  ctx.median = werte.length ? werte[Math.floor(werte.length / 2)] : 0;
  ctx.mittelEinspruenge = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  const nw = [...ctx.nachtAnzahl.values()].filter((k) => k !== null);
  ctx.nachtMittel = nw.length ? nw.reduce((a, b) => a + b, 0) / nw.length : 0;

  let arbeit = { ...m, abweichungen: { ...m.abweichungen } };
  const gesetzt = [];
  const offen = [];
  const jePerson = {};

  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    for (const da of m.dienstarten) {
      let schutz = 0;
      while (schutz++ < 12) {
        const b = besetzung(arbeit, d)[da.id];
        if (b.diff >= 0 && !b.qualFehlt) break;
        const kand = ersatzVorschlaege(arbeit, d, da.id, ctx)
          .filter((x) => x.moeglich && (jePerson[x.person.id] || 0) < maxProPerson);
        if (!kand.length) {
          offen.push({ datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: b.qualFehlt });
          break;
        }
        const beste = kand[0];
        arbeit = { ...arbeit, abweichungen: { ...arbeit.abweichungen, [`${beste.person.id}|${d}`]: da.id } };
        jePerson[beste.person.id] = (jePerson[beste.person.id] || 0) + 1;
        gesetzt.push({ personId: beste.person.id, name: `${beste.person.vorname} ${beste.person.nachname}`,
          datum: d, dienstId: da.id, punkte: beste.punkte, grund: beste.gruende.slice(0, 2).join(" · ") });
      }
    }
  }
  return { gesetzt, offen, abweichungen: arbeit.abweichungen,
    betroffene: Object.keys(jePerson).length, ym };
}

/* ------------------- Eskalation bei nicht deckbarer Lücke ---------------- */
export const unterschreitungAm = (m, d, dienstId) =>
  (m.unterschreitungen || []).find((u) => u.datum === d && u.dienstId === dienstId) || null;
/** Nachweisliste für Aufsicht und Personalvertretung. */
export function unterschreitungsNachweis(m, von, bis) {
  const zeilen = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const b = besetzung(m, d);
    for (const k of Object.keys(b)) {
      const e = b[k];
      if (e.diff >= 0 && !e.qualFehlt) continue;
      const u = unterschreitungAm(m, d, k);
      zeilen.push({ datum: d, dienst: e.da.name, ist: e.anzahl, soll: e.soll,
        qualFehlt: e.qualFehlt, dokumentiert: !!u, grund: u ? u.grund : "", durch: u ? u.durch : "" });
    }
  }
  return zeilen;
}

/* ---------------------------- Datenschutzbetrieb ------------------------- */
/** Auskunft nach Artikel 15 — alles, was zu einer Person gespeichert ist. */
export function datenauskunft(m, personId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return "";
  const z = [];
  z.push(`Datenauskunft · ${m.name}`, `Erstellt am ${fDatum(heute())}`, "");
  z.push("STAMMDATEN");
  z.push(`Name: ${p.vorname} ${p.nachname}`, `E-Mail: ${p.email || "—"}`, `Funktion: ${p.funktion}`,
    `Zugangsart: ${rollenName(m, p.rolle)}`, `Eintritt: ${fDatum(p.eintritt)}`,
    `Austritt: ${p.austritt ? fDatum(p.austritt) : "—"}`,
    `Wochenstunden: ${n1(p.wochenstunden)}`, `Urlaubsanspruch: ${p.urlaubsanspruch} Tage`);
  z.push("", "ZUGEHÖRIGKEIT");
  p.zugehoerigkeit.forEach((x) => z.push(`  ab ${fDatum(x.ab)}: ${(m.einheiten.find((e) => e.id === x.einheitId) || {}).name || x.einheitId}`));
  z.push("", "QUALIFIKATIONEN");
  z.push("  " + (p.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).name).filter(Boolean).join(", ") || "—"));
  const e = p.einschraenkungen || {};
  z.push("", "EINSATZEINSCHRÄNKUNGEN");
  z.push(`  keine Nachtdienste: ${e.keineNacht ? "ja" : "nein"}`,
    `  kein Alleindienst: ${e.keinAlleindienst ? "ja" : "nein"}`,
    `  Höchstzahl Dienste je Woche: ${e.maxDiensteWoche || "—"}`,
    `  Wiedereingliederung: ${e.wiedereingliederung ? `bis ${fDatum(e.wiedereingliederung.bis)}, ${n1(e.wiedereingliederung.maxStundenWoche)} h/Woche` : "—"}`);
  z.push("", "ABWESENHEITEN");
  const abw = m.abwesenheiten.filter((a) => a.personId === personId);
  abw.length ? abw.forEach((a) => z.push(`  ${abwArt(a.art).label}: ${fDatum(a.von)} bis ${fDatum(a.bis)}${a.notiz ? ` (${a.notiz})` : ""}`))
    : z.push("  —");
  z.push("", "ANTRÄGE");
  const anf = m.anfragen.filter((a) => a.personId === personId);
  anf.length ? anf.forEach((a) => z.push(`  ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fDatum(a.von)}–${fDatum(a.bis)} · ${a.status} · gestellt ${a.erstellt}`))
    : z.push("  —");
  z.push("", "PLANÄNDERUNGEN");
  const aen = (m.aenderungen || []).filter((a) => a.personId === personId).slice(0, 60);
  aen.length ? aen.forEach((a) => z.push(`  ${fDatum(a.datum)}: ${a.von} → ${a.nach} (Vorlauf ${a.vorlauf} Tage, erfasst ${a.zeit})`))
    : z.push("  —");
  z.push("", "ERFASSTE ZEITEN");
  const erf = Object.entries(m.erfassung || {}).filter(([k]) => k.startsWith(personId + "|"));
  erf.length ? erf.forEach(([k, v]) => z.push(`  ${fDatum(k.split("|")[1])}: ${v.start || "wie geplant"}–${v.ende || ""}${v.grund ? ` (${v.grund})` : ""}`))
    : z.push("  —");
  /* Monatsabschluss (WP-16, Nachtrag N6): wie die Auskunft des Servers (auskunft.mjs) — das eingefrorene Ist
     abgeschlossener Monate und die nach dem Abschluss abgewiesenen eigenen Stempel. */
  z.push("", "EINGEFRORENES IST (MONATSABSCHLUSS)");
  const fz = Object.entries(eingefrorenFuerPerson(m, personId)).sort(([a], [b]) => a.localeCompare(b));
  fz.length ? fz.forEach(([k, v]) => {
    const t = k.split("|")[1];
    if (t.length === 7) z.push(`  ${t}: Soll ${v.s ?? "—"} h${Array.isArray(v.z) ? ` · Nacht ${v.z[0]} h, Sonntag ${v.z[1]} h, Feiertag ${v.z[2]} h, Samstag ${v.z[3]} h` : ""}`);
    else if (Array.isArray(v.a)) z.push(`  ${fDatum(t)}: ${v.a.map((x) => abwArt(x).label).join(", ")}`);
    else z.push(`  ${fDatum(t)}: ${(v.da && (v.da.name || v.da.kurz)) || "Dienst"} ${n1(Number(v.std) || 0)} h${v.e ? " (erfasst)" : ""}${v.p ? " (zur Prüfung)" : ""}`);
  }) : z.push("  —");
  z.push("", "ABGEWIESENE STEMPEL (ABGESCHLOSSENER MONAT)");
  const abgew = [];
  for (const [mon, e] of Object.entries(m.monatsabschluss || {})) {
    if (!e || typeof e !== "object") continue;
    for (const x of Array.isArray(e.abgewiesen) ? e.abgewiesen : [])
      if (x && String(x.personId) === String(personId))
        abgew.push(`  ${fDatum(x.datum)}: ${x.art === "ende" ? "Ende" : "Beginn"}${x.zeit ? ` ${x.zeit}` : ""}${x.offline ? " (offline)" : ""}${x.anzahl > 1 ? ` · ${x.anzahl}×` : ""}`);
    const n = e.abgewiesenGezaehlt && Number(e.abgewiesenGezaehlt[personId]);
    if (n) abgew.push(`  ${mon}: ${n} weitere (nur gezählt)`);
  }
  abgew.length ? abgew.forEach((x) => z.push(x)) : z.push("  —");
  z.push("", "MITTEILUNGEN");
  const na = (m.nachrichten || []).filter((x) => x.personId === personId).slice(0, 40);
  na.length ? na.forEach((x) => z.push(`  ${x.zeit}: ${x.titel}`)) : z.push("  —");
  /* WP-30: Einstellungen zu Benachrichtigungen; der Zustellstatus je Mitteilung steht in der serverseitigen Auskunft. */
  const kz = (p.zustellung || {}).kanal || {};
  z.push("", "BENACHRICHTIGUNGEN", `  E-Mail insgesamt: ${kz.mail === false ? "aus" : "an"}`,
    `  Gerätemitteilungen insgesamt: ${kz.push === false ? "aus" : "an"}`);
  /* Artikel 15 Abs. 1 lit. d DSGVO verlangt die Dauer der Speicherung —
     und zwar alle drei, nicht nur die für Stammdaten. */
  const fr = loeschFristen(m);
  z.push("", "AUFBEWAHRUNG");
  z.push(`  Plan-, Zeit- und Stempeldaten: ${fr.plandatenMonate} Monate`);
  z.push(`  Stammdaten nach Austritt: ${fr.stammdatenMonate} Monate, danach Anonymisierung`);
  z.push(`  Abwesenheitsgründe: ${fr.gruendeMonate} Monate`);
  if (fr.zuletztGeraeumt) z.push(`  Letzter Löschlauf: ${fDatum(fr.zuletztGeraeumt)}`);
  return z.join("\n");
}
/* Wer zur Anonymisierung fällig ist, rechnet jetzt src/aufbewahrung.js —
   zusammen mit den beiden anderen Fristen und mit Prüfungen dahinter. Die
   alte Fassung hier las einstellungen.aufbewahrungMonate; die Fristen liegen
   seit Migration 5 → 6 unter m.aufbewahrung, und beide Werte liefen
   auseinander, ohne dass es auffiel. */

/* --------------------------- Konflikterkennung --------------------------- */
/**
 * Ohne Server gibt es keinen echten Mehrbenutzerbetrieb. Erkennbar ist aber,
 * ob der gespeicherte Bestand seit dem Laden von anderer Stelle verändert wurde.
 */
export async function fremdstandPruefen(schluessel, eigenerStand) {
  try {
    const r = await window.storage.get(schluessel);
    if (!r || !r.value) return { konflikt: false };
    const fremd = JSON.parse(r.value);
    return { konflikt: typeof fremd.stand === "number" && fremd.stand > eigenerStand, fremdStand: fremd.stand };
  } catch (e) { return { konflikt: false }; }
}

/* ==========================================================================
   RECHENKERN — DRITTE AUSBAUSTUFE
   Teilzeit in der Rotation · Springerpool · Standortbezogene Feiertage ·
   Bewertungsfaktor für Rufbereitschaft · Personalimport
   ========================================================================== */

/* --------------------- Standortbezogene Feiertage ------------------------ */
/* landFuerEinheit: server/lib/fachpruefung.mjs (WP-22). */
/** Feiertag aus Sicht einer bestimmten Person an einem Tag. */
/* feiertagFuer: server/lib/isteinfrieren.mjs (WP-16, Nachtrag M-neu-2 — der Abschluss friert Soll und Zuschläge damit ein). */
/** Alle im Betrieb vorkommenden Bundesländer. */
export const laenderImBetrieb = (m) => [...new Set([m.bundesland, ...((m.standorte || []).map((s) => s.bundesland))])].filter(Boolean);

/* --------------------------- Teilzeit in der Rotation -------------------- */
/* teilzeitDienst — der Gruppendienst als Teilzeitdienst (Quote oder feste
   Wochentage) — steht seit WP-22 in server/lib/fachpruefung.mjs, damit der
   Server dieselben Tage rechnet. */

/** Wie viele Dienste je Zyklus leistet die Person tatsächlich? */
export function teilzeitProfil(m, p) {
  const gesamt = m.zyklus.tage.filter((t) => t && t !== "-").length;
  const soll = m.einstellungen.sollWochenstunden || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv) return { teilzeit: false, quote: 1, dienste: gesamt, gesamt };
  if (tz.modus === "wochentage")
    return { teilzeit: true, modus: "wochentage", quote, gesamt,
      dienste: m.zyklus.tage.filter((t, i) => t && t !== "-" && (tz.wochentage || []).includes(i % 7)).length };
  return { teilzeit: true, modus: "quote", quote, gesamt, dienste: Math.round(gesamt * quote * 10) / 10 };
}

/* ------------------------------ Bewertungsfaktor ------------------------- */
/**
 * Rufbereitschaft wird nicht voll als Arbeitszeit gewertet.
 *
 * Woher der Faktor kommt, entscheidet anrechnungsfaktor(): ein gesetzter
 * Wert der Dienstart, sonst der erfasste Einsatzanteil, sonst der Vorschlag
 * der Dienstform. gewertet() steht in server/lib/lohnrechnung.mjs (WP-16, Nachtrag dritter Review).
 */

/* ------------------------------- Personalimport -------------------------- */
export const IMPORT_SPALTEN = ["nachname", "vorname", "einheit", "funktion", "wochenstunden",
  "urlaubsanspruch", "eintritt", "rolle", "qualifikationen", "teilzeit"];
/** Zerlegt eingefügten Text in Zeilen und Felder. Erkennt Semikolon, Tabulator und Komma. */
export function importParsen(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
  if (!zeilen.length) return { kopf: [], daten: [], trenner: ";" };
  const kandidaten = [";", "\t", ","];
  const trenner = kandidaten.reduce((a, b) =>
    (zeilen[0].split(b).length > zeilen[0].split(a).length ? b : a), ";");
  const felder = (z) => z.split(trenner).map((x) => x.trim().replace(/^"|"$/g, ""));
  const kopf = felder(zeilen[0]);
  const daten = zeilen.slice(1).map(felder);
  return { kopf, daten, trenner };
}
/** Ordnet Spaltenüberschriften den bekannten Feldern zu. */
/**
 * Ordnet Tabellenspalten den Feldern zu — ohne Zutun.
 *
 * Drei Stufen, absteigend nach Verlässlichkeit:
 *   1. Überschrift trifft ein bekanntes Muster
 *   2. Überschrift ähnelt einem Muster (Tippfehler, Umlautschreibung)
 *   3. Der Inhalt der Spalte verrät das Feld — greift auch bei
 *      Überschriften wie „Spalte 3" oder ganz ohne Kopfzeile
 *
 * Jede Zuordnung nennt ihre Herkunft, damit die Vorschau zeigen kann,
 * wie sicher sie ist.
 */
export function importZuordnen(kopf, zeilen) {
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
  const muster = {
    nachname: ["nachname", "name", "familienname", "lastname", "surname", "zuname"],
    vorname: ["vorname", "firstname", "rufname", "givenname"],
    personalnummer: ["personalnummer", "persnr", "pnr", "mitarbeiternummer", "nummer", "id"],
    einheit: ["einheit", "gruppe", "team", "station", "wohnbereich", "schichtgruppe",
      "abteilung", "dienstgruppe", "bereich", "objekt", "kostenstelle"],
    funktion: ["funktion", "position", "taetigkeit", "stelle", "berufsbezeichnung", "job"],
    wochenstunden: ["wochenstunden", "stunden", "wochenarbeitszeit", "az", "arbeitszeit",
      "sollstunden", "vertragsstunden"],
    urlaubsanspruch: ["urlaub", "urlaubsanspruch", "urlaubstage", "jahresurlaub"],
    eintritt: ["eintritt", "eintrittsdatum", "beginn", "seit", "einstellung", "vertragsbeginn"],
    rolle: ["rolle", "zugang", "zugangsart", "berechtigung", "recht"],
    qualifikationen: ["qualifikation", "qualifikationen", "quali", "kenntnisse", "nachweise",
      "ausbildung", "befaehigung"],
    teilzeit: ["teilzeit", "tz", "beschaeftigungsart"],
    email: ["email", "mail", "emailadresse", "dienstmail"],
  };

  /* Ähnlichkeit zweier Zeichenketten über die Editierdistanz. Fängt
     Tippfehler und Abkürzungen ab, ohne fremde Bibliothek. */
  const abstand = (a, b) => {
    const v = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let vor = v[0]; v[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = v[j];
        v[j] = Math.min(v[j] + 1, v[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1));
        vor = t;
      }
    }
    return v[b.length];
  };
  const aehnlich = (a, b) => {
    if (!a.length || !b.length) return 0;
    return 1 - abstand(a, b) / Math.max(a.length, b.length);
  };

  /* Was sagt der Inhalt einer Spalte? Geprüft an bis zu zwanzig Zeilen. */
  const proben = (idx) => (zeilen || []).slice(0, 20)
    .map((z) => String(z[idx] || "").trim()).filter(Boolean);
  const inhaltsTyp = (idx) => {
    const p = proben(idx);
    if (p.length < 3) return null;
    const anteil = (f) => p.filter(f).length / p.length;
    if (anteil((x) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(x)) > .7)
      return "datum";
    if (anteil((x) => /@/.test(x) && /\./.test(x)) > .7) return "email";
    if (anteil((x) => /^\d{1,2}([.,]\d{1,2})?$/.test(x)) > .7) {
      const zahlen = p.map((x) => Number(x.replace(",", "."))).filter((x) => !isNaN(x));
      const mittel = zahlen.reduce((a, b) => a + b, 0) / (zahlen.length || 1);
      if (mittel >= 15 && mittel <= 50) return "wochenstunden";
      if (mittel >= 20 && mittel <= 40) return "urlaubsanspruch";
      return "zahl";
    }
    if (anteil((x) => /^[A-Za-z]?\d{3,8}$/.test(x)) > .7) return "personalnummer";
    // Namen: ein Wort, überwiegend Buchstaben, viele verschiedene Werte
    const einzigartig = new Set(p.map((x) => x.toLowerCase())).size / p.length;
    if (anteil((x) => /^[A-ZÄÖÜ][a-zäöüß-]{1,20}$/.test(x)) > .7 && einzigartig > .6) return "name";
    // Wenige verschiedene Werte über viele Zeilen: eine Einteilung
    if (einzigartig < .35 && p.length >= 8) return "kategorie";
    return null;
  };

  const zu = {}, herkunft = {};
  const belegt = new Set();

  // Stufe 1: genaue Treffer
  kopf.forEach((h, i) => {
    const n = norm(h);
    for (const [feld, liste] of Object.entries(muster)) {
      if (zu[feld] !== undefined) continue;
      if (liste.some((x) => n === x)) { zu[feld] = i; herkunft[feld] = "genau"; belegt.add(i); break; }
    }
  });
  // Stufe 2: Anfang oder ähnlich genug
  kopf.forEach((h, i) => {
    if (belegt.has(i)) return;
    const n = norm(h);
    let bestes = null, beste = .72;
    for (const [feld, liste] of Object.entries(muster)) {
      if (zu[feld] !== undefined) continue;
      for (const x of liste) {
        /* Mindestlänge drei: sonst trifft eine Überschrift wie „A" jedes
           Muster, das mit A beginnt — und die Inhaltsanalyse käme nie zum Zug. */
        if (n.length >= 3 && (n.startsWith(x) || x.startsWith(n))) {
          bestes = feld; beste = 1; break;
        }
        if (n.length >= 4) {
          const w = aehnlich(n, x);
          if (w > beste) { beste = w; bestes = feld; }
        }
      }
      if (beste === 1) break;
    }
    if (bestes) { zu[bestes] = i; herkunft[bestes] = beste === 1 ? "genau" : "aehnlich"; belegt.add(i); }
  });
  // Stufe 3: aus dem Inhalt schließen
  if (zeilen && zeilen.length) {
    const namensSpalten = [];
    kopf.forEach((h, i) => {
      if (belegt.has(i)) return;
      const t = inhaltsTyp(i);
      if (!t) return;
      if (t === "name") { namensSpalten.push(i); return; }
      const feld = { datum: "eintritt", email: "email", wochenstunden: "wochenstunden",
        personalnummer: "personalnummer", kategorie: "einheit" }[t];
      if (feld && zu[feld] === undefined) {
        zu[feld] = i; herkunft[feld] = "inhalt"; belegt.add(i);
      }
    });
    // Zwei Namensspalten: die linke ist üblicherweise der Nachname
    if (namensSpalten.length >= 2) {
      if (zu.nachname === undefined) { zu.nachname = namensSpalten[0]; herkunft.nachname = "inhalt"; }
      if (zu.vorname === undefined) { zu.vorname = namensSpalten[1]; herkunft.vorname = "inhalt"; }
    } else if (namensSpalten.length === 1 && zu.nachname === undefined) {
      zu.nachname = namensSpalten[0]; herkunft.nachname = "inhalt";
    }
  }
  return { zu, herkunft };
}

/** Ein Feld ohne Zuordnung, das gebraucht wird? */
export const importFehlend = (zu) => ["nachname"].filter((f) => zu[f] === undefined);
/** Baut aus den Rohzeilen Personendatensätze und meldet, was fehlt. */
/* IMP-1: Vierter Parameter `entscheidungen` — je Zeilennummer die Wahl bei einer Dublette:
   "neu" | "ueberspringen" | "klaeren" | { aktion: "aktualisieren", bestaetigt: true }.
   Ohne Wahl bleibt eine Dublette unübernehmbar (ok: false). */
export function importPruefen(m, kopf, daten, zu, entscheidungen = {}) {
  const rollen = ROLLEN.filter((r) => !r.extern).map((r) => r.id);
  const vorigeZeilen = [];
  const zeilen = daten.map((f, i) => {
    const hol = (k) => (zu[k] !== undefined ? (f[zu[k]] || "").trim() : "");
    const nachname = hol("nachname"), vorname = hol("vorname");
    const einheitName = hol("einheit");
    const einheit = m.einheiten.find((e) => e.name.toLowerCase() === einheitName.toLowerCase());
    const std = parseFloat((hol("wochenstunden") || "").replace(",", ".")) || m.einstellungen.sollWochenstunden;
    const rolleRoh = hol("rolle").toLowerCase();
    const rolleId = rollen.find((x) => x === rolleRoh)
      || (ROLLEN.find((x) => x.label.toLowerCase() === rolleRoh) || {}).id || "mitarbeiter";
    const qualNamen = hol("qualifikationen").split(/[,/|]/).map((x) => x.trim()).filter(Boolean);
    const quals = qualNamen.map((q) => (m.qualifikationen.find((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()) || {}).id).filter(Boolean);
    const fehlendeQuals = qualNamen.filter((q) => !m.qualifikationen.some((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()));
    /* IMP-1: Ein nicht lesbares oder unmögliches Datum wird gemeldet, nie durch heute() ersetzt.
       Nur eine leere Zelle (Spalte fehlt oder nichts eingetragen) nimmt wie bisher den heutigen Tag. */
    const eintrittRoh = hol("eintritt");
    const eintritt = (() => {
      if (!eintrittRoh) return heute();
      let j, mo, t;
      const iso = eintrittRoh.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const de = eintrittRoh.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (iso) [, j, mo, t] = iso.map(Number); else if (de) [, t, mo, j] = de.map(Number); else return null;
      const d = new Date(Date.UTC(j, mo - 1, t));
      if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
      return `${j}-${pad(mo)}-${pad(t)}`;
    })();
    const personalnummer = hol("personalnummer");
    /* IMP-1: Fehlt die E-Mail, bleibt sie leer — es wird keine Adresse erfunden. */
    const email = hol("email");
    const tzRoh = hol("teilzeit").toLowerCase();
    const teilzeit = (tzRoh === "ja" || tzRoh === "x" || tzRoh === "1" || std < (m.einstellungen.sollWochenstunden || 40) - .1)
      ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null;
    const fehler = [];
    if (!nachname) fehler.push("Nachname fehlt");
    if (!vorname) fehler.push("Vorname fehlt");
    if (einheitName && !einheit) fehler.push(`Einheit „${einheitName}" unbekannt`);
    if (!einheitName) fehler.push("Einheit fehlt");
    if (eintritt === null) fehler.push(`Eintrittsdatum „${eintrittRoh}" ungültig`);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fehler.push(`E-Mail „${email}" ungültig`);
    /* IMP-1: Dublette zuerst über die Personalnummer (mandantenintern), sonst über den Namen.
       Eine Dublette wird nie ungeprüft übernommen: ohne ausdrückliche Wahl bleibt die Zeile
       unübernehmbar. Namen allein führen nie zusammen oder überschreiben. */
    const nrNorm = personalnummer.toLowerCase();
    let treffer = nrNorm ? m.personen.find((p) => String(p.personalnummer || "").toLowerCase() === nrNorm) : null;
    let dublette = treffer ? { grund: "personalnummer", personId: treffer.id, inDatei: false } : null;
    if (!dublette && nachname && vorname) {
      treffer = m.personen.find((p) => p.nachname.toLowerCase() === nachname.toLowerCase()
        && p.vorname.toLowerCase() === vorname.toLowerCase());
      if (treffer) dublette = { grund: "name", personId: treffer.id, inDatei: false };
    }
    if (!dublette) {
      const frueher = vorigeZeilen.find((v) => (nrNorm && v.nrNorm === nrNorm)
        || (!nrNorm && !v.nrNorm && nachname && vorname && v.name === `${nachname}|${vorname}`.toLowerCase()));
      if (frueher) dublette = { grund: nrNorm ? "personalnummer" : "name", personId: null, inDatei: true, zeile: frueher.nr };
    }
    vorigeZeilen.push({ nr: i + 1, nrNorm, name: `${nachname}|${vorname}`.toLowerCase() });
    const doppelt = !!dublette;
    const wahl = dublette ? entscheidungen[i + 1] : null;
    const aktion = !wahl ? null : (typeof wahl === "string" ? wahl : wahl.aktion);
    const bestaetigt = !!(wahl && typeof wahl === "object" && wahl.bestaetigt === true);
    /* Nur "Neu anlegen" macht eine Dublette übernehmbar. Aktualisieren verlangt zusätzlich die
       ausdrückliche Bestätigung und ist nie eine Neuanlage; Überspringen/Klären nehmen nichts auf. */
    const neuGewaehlt = aktion === "neu";
    return { nr: i + 1, nachname, vorname, einheitName, einheitId: einheit ? einheit.id : null,
      funktion: hol("funktion") || "Fachkraft", wochenstunden: std,
      urlaubsanspruch: parseInt(hol("urlaubsanspruch"), 10) || 30, eintritt, rolle: rolleId,
      qualifikationen: quals, fehlendeQuals, teilzeit, fehler, doppelt, dublette,
      personalnummer, email, aktion, aktualisierungBestaetigt: aktion === "aktualisieren" && bestaetigt,
      zielId: aktion === "aktualisieren" && bestaetigt && dublette ? dublette.personId : null,
      ok: fehler.length === 0 && (!doppelt || neuGewaehlt) };
  });
  return { zeilen, gut: zeilen.filter((z) => z.ok).length, fehlerhaft: zeilen.filter((z) => !z.ok).length,
    doppelt: zeilen.filter((z) => z.doppelt).length,
    neueEinheiten: [...new Set(zeilen.filter((z) => z.einheitName && !z.einheitId).map((z) => z.einheitName))],
    neueQuals: [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))] };
}
export const IMPORT_BEISPIEL = `Nachname;Vorname;Einheit;Funktion;Wochenstunden;Urlaub;Eintritt;Rolle;Qualifikationen;Teilzeit
Meier;Sabine;Schichtgruppe 1;Fachkraft;41;30;01.03.2021;mitarbeiter;SK,EH;
Yildiz;Kerem;Schichtgruppe 2;Schichtleitung;41;30;15.08.2019;subplaner;SK,SL;
Novak;Petra;Schichtgruppe 1;Fachkraft;20,5;30;01.02.2024;mitarbeiter;SK;ja`;

/* ==========================================================================
   RECHENKERN — FÜNFTE AUSBAUSTUFE
   Verfügbarkeiten · Nachweisgültigkeit · Standortprüfung beim Einstempeln ·
   Auslastung · Was ist heute zu tun
   ========================================================================== */

/* ------------------------------ Verfügbarkeit ---------------------------- */
/** Drei Zeitfenster je Tag. Ein Dienst fällt in das Fenster, in dem er beginnt. */
export const FENSTER = [
  { id: 0, name: "Vormittag", von: 0, bis: 719 },
  { id: 1, name: "Nachmittag", von: 720, bis: 1079 },
  { id: 2, name: "Nacht", von: 1080, bis: 1439 },
];
export const fensterVon = (da) => {
  const s = toMin(da.start);
  return s < 720 ? 0 : s < 1080 ? 1 : 2;
};
/**
 * Kann die Person an diesem Tag diesen Dienst leisten?
 * Ohne gepflegte Verfügbarkeit gilt: immer verfügbar.
 */
export function verfuegbarFuer(p, datum, da) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return true;
  const idx = dow(datum) * 3 + fensterVon(da);
  return v.raster[idx] !== false;
}
/** Für die Anzeige: wie viele der 21 Felder sind freigegeben? */
export function verfuegbarkeitQuote(p) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return 1;
  return v.raster.filter(Boolean).length / 21;
}


/* --------------------------------------------------------------------------
   KOMPETENZEN AN DER PERSON

   Die Rechnung selbst steht in regelwerk.js und ist dort geprüft. Hier
   liegen nur die Griffe, die den Betrieb kennen: Welche Kompetenz gehört
   zu welchem Gerät, wer hat sie, und was fehlt für eine Dienstart.
   -------------------------------------------------------------------------- */

/** Der Nachweis einer Person zu einer Kompetenz — oder null. */
export const kompetenzNachweis = (p, kid) =>
  ((p && p.kompetenzNachweise) || []).find((x) => x.kompetenzId === kid) || null;

/** Stand einer Kompetenz an einer Person, an einem Tag. */
export function kompetenzAn(m, p, kid, datum) {
  const k = (m.kompetenzen || []).find((x) => x.id === kid);
  if (!k) return { stand: "unbekannt", komp: null };
  return { ...kompetenzStand(k, kompetenzNachweis(p, kid), datum || heute()), komp: k };
}

/** Welche Kompetenzen verlangt diese Dienstart? */
export const kompetenzenFuerDienst = (m, dienstId) =>
  (m.kompetenzen || []).filter((k) => (k.pflichtFuer || []).includes(dienstId));

/** Das Betriebsmittel, auf das sich eine Kompetenz bezieht. */
export const mittelZuKompetenz = (m, k) =>
  (k && k.betriebsmittelId && (m.betriebsmittel || []).find((x) => x.id === k.betriebsmittelId)) || null;

/** Lage über alle Kompetenzen: fehlend, ablaufend, abgelaufen. */
export function kompetenzLage(m) {
  return memo(m, "kompetenzlage", () => {
    const fehlt = [], bald = [], abgelaufen = [];
    const aktive = m.personen.filter((p) => imDienst(p, heute()));
    for (const k of m.kompetenzen || []) {
      for (const p of aktive) {
        const n = kompetenzNachweis(p, k.id);
        /* Ohne Nachweis ist eine Kompetenz nicht „fehlend" — die meisten
           Menschen brauchen die meisten Geräte nie. Gezählt wird nur, was
           für eine Dienstart verlangt wird und wem sie zugedacht ist. */
        if (!n) {
          if ((k.pflichtFuer || []).length && (k.zugedacht || []).includes(p.id))
            fehlt.push({ person: p, komp: k });
          continue;
        }
        const st = kompetenzStand(k, n, heute());
        if (st.stand === "abgelaufen") abgelaufen.push({ person: p, komp: k, ...st });
        else if (st.stand === "laeuft_ab") bald.push({ person: p, komp: k, ...st });
      }
    }
    return { fehlt, bald, abgelaufen };
  });
}


/** Alle Nachweise eines Betriebs, die Aufmerksamkeit brauchen. */
export function nachweisLage(m) {
  return memo(m, "nachweise", () => {
    const abgelaufen = [], bald = [], fehlt = [];
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      for (const qid of p.qualifikationen) {
        const s = nachweisStand(m, p, qid);
        if (s.stand === "abgelaufen") abgelaufen.push({ person: p, ...s });
        else if (s.stand === "laeuft_ab") bald.push({ person: p, ...s });
        else if (s.stand === "fehlt" && s.qual && s.qual.nachweisPflicht) fehlt.push({ person: p, ...s });
      }
    }
    const sort = (a, b) => (a.tage || 0) - (b.tage || 0);
    return { abgelaufen: abgelaufen.sort(sort), bald: bald.sort(sort), fehlt,
      gesamt: abgelaufen.length + bald.length + fehlt.length };
  });
}

/* ------------------------ Standortprüfung beim Stempeln ------------------ */
/* Die Ortsprüfung beim Stempeln liegt allein auf dem Server (server/lib/geo.mjs). */
export const stempelStand = (m, p, datum) => (m.einstempeln || {})[`${p.id}|${datum}`] || null;

/* -------------------------------- Auslastung ----------------------------- */
/**
 * Auslastung in Prozent: geleistete gegen vertragliche Stunden im Monat.
 * Eine Zahl, an der sofort ablesbar ist, wer noch Luft hat.
 */
export function auslastung(m, p, ym) {
  if (!istVerfuegbar(m, p, zeitraumMonat(ym)))
    return { ist: null, soll: sollStunden(m, p, ym), pct: null, stand: "nicht_verfuegbar", nichtVerfuegbar: true };
  return memo(m, `ausl|${p.id}|${ym}`, () => {
    const ist = istStunden(m, p, ym).gesamt;
    const soll = sollStunden(m, p, ym);
    const pct = soll > 0 ? Math.round((ist / soll) * 100) : 0;
    return { ist, soll, pct,
      stand: pct > 115 ? "hoch" : pct > 105 ? "erhoeht" : pct < 85 ? "niedrig" : "normal" };
  });
}

/**
 * Dieselbe Auslastung, einmal für den ganzen Betrieb statt je Person — die
 * Zahl, die eine Planung sonst erst in der Belastungsansicht zusammensuchen
 * musste, obwohl sie im Monatsplan als Erstes gebraucht wird.
 */
export function teamAuslastung(m, ym, bezugstag, standortId) {
  const leute = aktive(m, bezugstag).filter((p) => p.imSchichtdienst !== false
    && personAmStandort(m, p, standortId, bezugstag));
  let ist = 0, soll = 0, ueber = 0, unter = 0, ohneIst = 0;
  for (const p of leute) {
    const au = auslastung(m, p, ym);
    if (au.nichtVerfuegbar) { ohneIst++; soll += au.soll; continue; }
    ist += au.ist; soll += au.soll;
    if (au.stand === "hoch" || au.stand === "erhoeht") ueber++;
    else if (au.stand === "niedrig") unter++;
  }
  /* Fehlen Ist-Daten einzelner Personen, ist die Summe keine Ist-Summe mehr. */
  if (ohneIst) return { personen: leute.length, ist: null, soll, pct: null, ueber: null, unter: null, nichtVerfuegbar: true };
  return { personen: leute.length, ist, soll, pct: soll > 0 ? Math.round((ist / soll) * 100) : 0, ueber, unter };
}

/* --------------------------- Was ist heute zu tun ------------------------ */
/**
 * Der Einstieg für jede Rolle: nicht was alles existiert, sondern was ansteht.
 * Jeder Eintrag nennt Anzahl, Dringlichkeit und führt an die richtige Stelle.
 */
export function tagesaufgaben(sitz) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute(), ym = d0.slice(0, 7);
  const out = [];
  const push = (o) => out.push(o);

  // --- Für alle im Schichtdienst ---
  if (p.imSchichtdienst !== false) {
    const t = personTag(m, p, d0);
    /* Dienst über Mitternacht: Ein offener Beginn von gestern wird zuerst
       ausgestempelt — kein neuer Start für heute (stempelvorgang.js). */
    const vorgang = stempelVorgang(m, p, d0);
    if (vorgang.vortag) push({ art: "stempel", dringend: true, ziel: "meine",
      titel: `Im Dienst seit gestern ${vorgang.st.start}`, text: "Noch nicht ausgestempelt", aktion: "Ausstempeln" });
    else if (t.dienstId) {
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      const st = stempelStand(m, p, d0);
      if (da && !st) push({ art: "stempel", dringend: true, ziel: "meine",
        titel: `Heute ${da.name}`, text: `${da.start}–${da.ende} · noch nicht eingestempelt`, aktion: "Einstempeln" });
      else if (da && st && !st.ende && !vorgang.veraltet) push({ art: "stempel", dringend: false, ziel: "meine",
        titel: `Im Dienst seit ${st.start}`, text: da.name, aktion: "Ausstempeln" });
    }
    /* Offener Beginn ohne (noch) geplanten Dienst: bleibt sichtbar. */
    if (!vorgang.vortag && vorgang.offen && !(t.dienstId && !vorgang.veraltet))
      push({ art: "stempel", dringend: true, ziel: "meine",
        titel: vorgang.veraltet ? `Beginn ${vorgang.st.start} nicht zugeordnet` : `Im Dienst seit ${vorgang.st.start}`,
        text: vorgang.veraltet ? MARKIERUNG_TEXT.START_VERALTET : "Kein Dienst im Plan · noch nicht ausgestempelt",
        aktion: vorgang.veraltet ? "Ende erfassen" : "Ausstempeln" });
    const offen = offeneErfassung(m, p, addDays(d0, -1));
    if (offen.length) push({ art: "zeiten", dringend: false, ziel: "meine",
      titel: `${offen.length} Zeiten bestätigen`, text: "Solange offen, bleibt das Stundenkonto eine Hochrechnung", anzahl: offen.length });
    const meineNachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
      .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
    if (meineNachweise.length) push({ art: "nachweis", dringend: meineNachweise.some((x) => x.stand === "abgelaufen"),
      ziel: "meine", titel: `${meineNachweise.length} Nachweis${meineNachweise.length > 1 ? "e" : ""} prüfen`,
      text: meineNachweise.map((x) => `${x.qual.name}${x.stand === "abgelaufen" ? " abgelaufen" : ` läuft in ${x.tage} Tagen ab`}`).join(" · ") });
    const antw = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen);
    if (antw.length) push({ art: "post", dringend: false, ziel: "meine",
      titel: `${antw.length} neue Mitteilung${antw.length > 1 ? "en" : ""}`, text: antw[0].titel, anzahl: antw.length });
    const einsatz = m.anfragen.filter((a) => a.personId === p.id && a.typ === "einsatz" && a.status === "offen");
    if (einsatz.length) push({ art: "einsatz", dringend: true, ziel: "meine",
      titel: `${einsatz.length} Einsatzanfrage${einsatz.length > 1 ? "n" : ""}`, text: "Zusagen oder absagen" });
  }

  // --- Für Planung und Leitung ---
  if (darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all")) {
    const zu = m.anfragen.filter((a) => {
      if (a.status !== "offen" || a.typ === "einsatz") return false;
      const ap = m.personen.find((x) => x.id === a.personId);
      return ap && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(ap, d0)));
    });
    if (zu.length) push({ art: "antrag", dringend: zu.length > 4, ziel: "antraege",
      titel: `${zu.length} Antr${zu.length > 1 ? "äge" : "ag"} entscheiden`,
      text: zu.slice(0, 2).map((a) => { const ap = m.personen.find((x) => x.id === a.personId);
        return `${ap ? ap.nachname : "?"} · ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`; }).join(" · "),
      anzahl: zu.length });
    const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && (a.interessenten || []).length);
    if (boerse.length) push({ art: "boerse", dringend: false, ziel: "boerse",
      titel: `${boerse.length} Tauschgesuch${boerse.length > 1 ? "e" : ""} mit Meldung`, text: "Zuteilung steht aus" });
  }

  if (darf(sitz, "plan.view.unit")) {
    const kommend = befundeFuer(sitz, pruefen(m, d0, addDays(d0, 13)));
    const heuteOffen = kommend.filter((b) => b.datum === d0 && (b.art === "besetzung" || b.art === "qualifikation"));
    if (heuteOffen.length) push({ art: "besetzung", dringend: true, ziel: "lage",
      titel: `Heute ${heuteOffen.length}× unterbesetzt`, text: heuteOffen.map((b) => b.titel).slice(0, 2).join(" · "),
      anzahl: heuteOffen.length });
    const kritisch = kommend.filter((b) => b.schwere === "danger" && b.datum !== d0);
    if (kritisch.length) push({ art: "pruefung", dringend: false, ziel: "pruef",
      titel: `${kritisch.length} kritische Befunde in 14 Tagen`, text: kritisch[0].titel, anzahl: kritisch.length });
  }

  if (darf(sitz, "staff.view")) {
    const nl = nachweisLage(m);
    if (nl.abgelaufen.length) push({ art: "nachweise", dringend: true, ziel: "personal",
      titel: `${nl.abgelaufen.length} Nachweis${nl.abgelaufen.length > 1 ? "e" : ""} abgelaufen`,
      text: nl.abgelaufen.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
      anzahl: nl.abgelaufen.length });
    if (nl.bald.length) push({ art: "nachweise", dringend: false, ziel: "personal",
      titel: `${nl.bald.length} Nachweis${nl.bald.length > 1 ? "e laufen" : " läuft"} bald ab`,
      text: nl.bald.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name} in ${x.tage} Tagen`).join(" · "),
      anzahl: nl.bald.length });
  }

  /* WP-23: Solange die Planfreigabe nicht gilt, sehen Beschäftigte auch Entwürfe. Nur die Leitung
     (org.edit) schaltet das ein; sie bekommt den Hinweis als dringende Aufgabe. */
  if (darf(sitz, "org.edit") && !planFreigabeAktiv(m)) push({ art: "freigabe", dringend: true, ziel: "betrieb",
    titel: "Planfreigabe aktivieren", text: "Beschäftigte sehen sonst auch Entwürfe" });

  if (darf(sitz, "plan.publish")) {
    for (const off of [0, 1]) {
      const [y, mo] = ym.split("-").map(Number);
      const d = new Date(y, mo - 1 + off, 1);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      if (!istFreigegeben(m, k)) push({ art: "freigabe", dringend: off === 0, ziel: "plan",
        titel: `${MON[d.getMonth()]} ${d.getFullYear()} nicht freigegeben`,
        text: off === 0 ? "Der laufende Monat ist noch Entwurf" : "Vorlauf schaffen und freigeben" });
    }
  }

  if (darf(sitz, "account.view.all")) {
    const grenze = m.einstellungen.ausgleichGrenze || 40;
    const ueber = m.personen.filter((x) => imDienst(x, d0) && kontoSichtbar(sitz, x) && stundenkonto(m, x, ym) > grenze);
    if (ueber.length) push({ art: "konto", dringend: false, ziel: "abrechnung",
      titel: `${ueber.length}× Stundenkonto über der Grenze`,
      text: `Freizeitausgleich einplanen · Grenze ${n1(grenze)} h`, anzahl: ueber.length });
  }

  out.sort((a, b) => (a.dringend === b.dringend ? 0 : a.dringend ? -1 : 1));
  return out;
}

/* --------------------------- Tages- und Wochenband ----------------------- */
/**
 * Belegung eines Tages auf einer 24-Stunden-Achse.
 * Zeigt, WANN gearbeitet wird — nicht nur ob.
 */
export function tagesband(m, datum) {
  return memo(m, `band|${datum}`, () => {
    const spuren = [];
    for (const da of m.dienstarten) {
      const b = besetzung(m, datum)[da.id];
      const s = toMin(da.start);
      let e = toMin(da.ende); if (e <= s) e += 1440;
      spuren.push({ da, von: s, bis: e, ueberNacht: e > 1440,
        anzahl: b.anzahl, soll: b.soll, status: b.status, personen: b.personen });
    }
    return spuren.sort((a, b) => a.von - b.von);
  });
}

/* ==========================================================================
   EINGABEZEILE
   „Müller krank morgen" tippen statt drei Menüs durchklicken.

   Bewusst kein Sprachmodell. Ein Dienstplan braucht Vorhersagbarkeit: Wer
   dieselben Worte tippt, muss dasselbe Ergebnis bekommen — heute, morgen und
   vor dem Betriebsrat. Ein Modell, das zu 95 Prozent richtig rät, ist hier
   schlechter als ein Muster, das zu 100 Prozent nachvollziehbar ist.

   Die Zeile führt nichts selbst aus. Sie versteht, was gemeint ist, und
   öffnet die passende Ansicht mit vorausgefüllten Feldern. Die Entscheidung
   trifft weiterhin ein Mensch.
   ========================================================================== */

export const BEFEHLE = [
  { id: "krank", worte: ["krank", "krankmeldung", "au", "arbeitsunfähig", "ausgefallen"],
    braucht: ["person"], titel: "Krankmeldung erfassen", ziel: "personal" },
  { id: "urlaub", worte: ["urlaub", "frei", "urlaubsantrag"],
    braucht: ["person"], titel: "Urlaub eintragen", ziel: "antraege" },
  { id: "plan", worte: ["plan", "dienstplan", "schichtplan", "monatsplan"],
    braucht: [], titel: "Monatsplan öffnen", ziel: "plan" },
  { id: "lage", worte: ["lage", "besetzung", "lagebild", "wer arbeitet", "wer hat dienst"],
    braucht: [], titel: "Lagebild öffnen", ziel: "lage" },
  { id: "wer", worte: ["wer kann", "wer könnte", "wer springt", "ersatz", "vertretung"],
    braucht: [], titel: "Ersatz suchen", ziel: "lage" },
  { id: "ausschreiben", worte: ["ausschreiben", "offene schicht", "offene schichten"],
    braucht: [], titel: "Offene Schichten", ziel: "offene" },
  { id: "antraege", worte: ["anträge", "antrag", "genehmigen", "freigaben"],
    braucht: [], titel: "Anträge entscheiden", ziel: "antraege" },
  { id: "person", worte: ["akte", "personalakte", "zeige", "wer ist"],
    braucht: ["person"], titel: "Personalakte öffnen", ziel: "personal" },
  { id: "konto", worte: ["konto", "stunden", "stundenkonto", "überstunden"],
    braucht: [], titel: "Stundenkonten", ziel: "verteilung" },
  { id: "pruefung", worte: ["prüfung", "verstöße", "befunde", "probleme"],
    braucht: [], titel: "Prüfung öffnen", ziel: "pruefung" },
  { id: "belastbar", worte: ["belastbarkeit", "reserve", "puffer", "ausfall"],
    braucht: [], titel: "Belastbarkeit", ziel: "belastbarkeit" },
  { id: "uebergabe", worte: ["übergabe", "schichtübergabe"],
    braucht: [], titel: "Schichtübergabe", ziel: "uebergabe" },
  { id: "handbuch", worte: ["hilfe", "handbuch", "anleitung", "wie geht"],
    braucht: [], titel: "Handbuch", ziel: "handbuch" },
];

/** Wochentage und Zeitworte, die in einem Befehl vorkommen können. */
export const ZEITWORTE = {
  heute: 0, morgen: 1, übermorgen: 2, uebermorgen: 2, gestern: -1, vorgestern: -2,
};
export const WOCHENTAGE = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

/** Ein Datum aus dem Text lesen. Gibt null zurück, wenn keines vorkommt. */
export function datumAus(text) {
  const t = text.toLowerCase();
  for (const [wort, versatz] of Object.entries(ZEITWORTE))
    if (t.includes(wort)) return addDays(heute(), versatz);

  /* „ab montag", „am freitag" — der nächste dieser Wochentage */
  for (let i = 0; i < 7; i++) {
    if (!t.includes(WOCHENTAGE[i])) continue;
    const heuteTag = new Date(heute() + "T12:00").getDay();
    let versatz = (i - heuteTag + 7) % 7;
    if (versatz === 0) versatz = 7;              // „montag" am Montag heißt nächsten Montag
    return addDays(heute(), versatz);
  }

  /* 14.3. oder 14.03.2026 */
  const m1 = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
  if (m1) {
    const jahr = m1[3] ? Number(m1[3]) : Number(heute().slice(0, 4));
    return `${jahr}-${pad(Number(m1[2]))}-${pad(Number(m1[1]))}`;
  }
  /* 2026-03-14 */
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

/** Ein Zeitraum: „von montag bis freitag", „14.3. - 20.3." */
export function zeitraumAus(text) {
  const t = text.toLowerCase();
  const teil = t.split(/\s+(?:bis|-|–|—)\s+/);
  if (teil.length < 2) return null;
  const von = datumAus(teil[0]), bis = datumAus(teil[1]);
  if (!von || !bis || bis < von) return null;
  return { von, bis };
}

/**
 * Personen im Text finden. Sucht Nachnamen, Vornamen und beides zusammen.
 * Bei Mehrdeutigkeit werden alle Treffer zurückgegeben — die Zeile fragt
 * dann nach, statt zu raten.
 */
export function personenAus(m, text) {
  const t = text.toLowerCase();
  const treffer = [];
  for (const p of m.personen) {
    if (!imDienst(p, heute())) continue;
    const nach = (p.nachname || "").toLowerCase();
    const vor = (p.vorname || "").toLowerCase();
    /* Beide Reihenfolgen: „Ines Sommer" und „Sommer Ines" meinen dieselbe
       Person. Ohne das bleibt bei drei Ines und zwei Sommers alles mehrdeutig. */
    const beide = t.includes(`${vor} ${nach}`) || t.includes(`${nach} ${vor}`);
    /* Wortgrenzen prüfen — sonst steckt „ines" in „Steiner". */
    const alsWort = (w) => new RegExp(`(^|[^a-zäöüß])${w}([^a-zäöüß]|$)`, "i").test(t);
    if (beide) treffer.push({ person: p, genauigkeit: 3 });
    else if (nach.length >= 3 && alsWort(nach)) treffer.push({ person: p, genauigkeit: 2 });
    else if (vor.length >= 3 && alsWort(vor)) treffer.push({ person: p, genauigkeit: 1 });
  }
  const beste = Math.max(0, ...treffer.map((x) => x.genauigkeit));
  return treffer.filter((x) => x.genauigkeit === beste).map((x) => x.person);
}

/** Eine Dienstart im Text? */
export function dienstAus(m, text) {
  const t = text.toLowerCase();
  for (const d of m.dienstarten) {
    const n = (d.name || "").toLowerCase();
    if (n.length >= 3 && t.includes(n)) return d;
    if (d.kurz && t.includes(` ${d.kurz.toLowerCase()} `)) return d;
  }
  /* Umgangssprachlich */
  for (const [wort, muster] of [["früh", /^f/i], ["spät", /^s/i], ["nacht", /^n/i]]) {
    if (!t.includes(wort)) continue;
    const d = m.dienstarten.find((x) => muster.test(x.kurz || x.name));
    if (d) return d;
  }
  return null;
}

/**
 * Was ist gemeint? Gibt einen Vorschlag zurück — nie eine ausgeführte
 * Handlung. Bei Unklarheit wird das gesagt, statt zu raten.
 */
export function verstehe(m, text) {
  const t = (text || "").trim();
  if (t.length < 2) return null;
  const klein = t.toLowerCase();

  /* Welcher Befehl? Der mit der längsten Übereinstimmung gewinnt — sonst
     schlägt „frei" bei „Freitag" an. */
  let befehl = null, laenge = 0;
  for (const b of BEFEHLE) {
    for (const w of b.worte) {
      if (klein.includes(w) && w.length > laenge) { befehl = b; laenge = w.length; }
    }
  }

  const personen = personenAus(m, t);
  const datum = datumAus(t);
  const zeitraum = zeitraumAus(t);
  const dienst = dienstAus(m, t);

  /* Kein Befehlswort, aber eine Person: die Akte ist die beste Vermutung */
  if (!befehl && personen.length === 1)
    return { befehl: BEFEHLE.find((b) => b.id === "person"), personen, datum, zeitraum, dienst,
      sicher: true, satz: `Personalakte von ${personen[0].vorname} ${personen[0].nachname}` };

  if (!befehl) return { befehl: null, personen, datum, zeitraum, dienst, sicher: false,
    satz: "Nicht verstanden" };

  /* Fehlt etwas, das der Befehl braucht? */
  const fehlt = [];
  if (befehl.braucht.includes("person") && personen.length !== 1)
    fehlt.push(personen.length > 1 ? "mehrdeutig" : "person");

  const satz = baueSatz(befehl, personen, datum, zeitraum, dienst, fehlt);
  return { befehl, personen, datum, zeitraum, dienst, fehlt, sicher: !fehlt.length, satz };
}

export function baueSatz(befehl, personen, datum, zeitraum, dienst, fehlt) {
  if (fehlt.includes("mehrdeutig")) return `Mehrere Personen passen: ${personen
    .map((p) => `${p.vorname} ${p.nachname}`).join(", ")}`;
  if (fehlt.includes("person")) return `${befehl.titel} — für wen?`;
  const p = personen[0];
  const wer = p ? `${p.vorname} ${p.nachname}` : "";
  const wann = zeitraum ? `${fKurz(zeitraum.von)} bis ${fKurz(zeitraum.bis)}`
    : datum ? fLang(datum) : "";
  switch (befehl.id) {
    case "krank": return `Krankmeldung für ${wer}${wann ? ` · ${wann}` : " · ab heute"}`;
    case "urlaub": return `Urlaub für ${wer}${wann ? ` · ${wann}` : ""}`;
    case "person": return `Personalakte von ${wer}`;
    case "wer": return `Ersatz suchen${wann ? ` für ${wann}` : ""}${dienst ? ` · ${dienst.name}` : ""}`;
    case "lage": return `Lagebild${wann ? ` für ${wann}` : " für heute"}`;
    default: return befehl.titel + (wann ? ` · ${wann}` : "");
  }
}

/** Beispiele, die beim ersten Öffnen erscheinen. */
export const EINGABE_BEISPIELE = [
  "Müller krank morgen",
  "wer kann Freitag Nachtdienst",
  "Urlaub Schmidt 14.3. bis 20.3.",
  "Lagebild morgen",
  "offene Schichten",
];

/* ==========================================================================
   RECHENKERN — SECHSTE AUSBAUSTUFE
   Planstand-Vergleich · Wunschdienste · Einarbeitung · Qualifikationsmatrix ·
   Kontoverlauf · Bereitschaft · Notizen
   ========================================================================== */

/* --------------------------- Planstand-Vergleich ------------------------- */
/**
 * Was hat sich seit der Freigabe geändert?
 * Beantwortet die häufigste Frage im Schichtbetrieb: „Ich hatte doch Frühdienst?"
 */
export function planVergleich(m, ym) {
  const stand = (m.planstaende || {})[ym];
  if (!stand) return { hatStand: false, zeilen: [] };
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const nam = (id) => (!id || id === "-" ? "frei" : (map[id] || {}).name || id);
  const zeilen = [];
  for (const p of m.personen) {
    if (!imDienst(p, `${ym}-01`)) continue;
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      const k = `${p.id}|${d}`;
      const damals = stand[k] !== undefined ? stand[k] : null;
      const jetztAb = m.abweichungen[k];
      const eid = einheitAm(p, d);
      const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
      const alt = damals !== null ? damals : plan;
      const neu = jetztAb !== undefined ? jetztAb : plan;
      if ((alt || "-") === (neu || "-")) continue;
      zeilen.push({ person: p, datum: d, von: nam(alt), nach: nam(neu),
        vorlauf: between(heute(), d), richtung: !alt || alt === "-" ? "zusatz" : !neu || neu === "-" ? "entfall" : "wechsel" });
    }
  }
  zeilen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  return { hatStand: true, zeilen, zeit: (m.freigaben || {})[ym] ? m.freigaben[ym].zeit : null,
    zusatz: zeilen.filter((z) => z.richtung === "zusatz").length,
    entfall: zeilen.filter((z) => z.richtung === "entfall").length,
    wechsel: zeilen.filter((z) => z.richtung === "wechsel").length };
}
/** Abbild der Abweichungen zum Freigabezeitpunkt — Grundlage des Vergleichs. */
export function planAbbild(m, ym) {
  const out = {};
  for (const k of Object.keys(m.abweichungen)) if (k.split("|")[1].startsWith(ym)) out[k] = m.abweichungen[k];
  return out;
}

/* ------------------------------ Wunschdienste ---------------------------- */
export const WUNSCH_ARTEN = [
  { id: "moechte", label: "Möchte arbeiten", farbe: "#2E6B4F", zeichen: "+" },
  { id: "lieber_nicht", label: "Lieber nicht", farbe: "#8A5A00", zeichen: "−" },
];
export const wunschAm = (m, pid, d) => (m.wuensche || []).find((w) => w.personId === pid && w.datum === d) || null;
/** Wie gut trifft der Plan die geäußerten Wünsche? */
export function wunschErfuellung(m, ym) {
  const liste = (m.wuensche || []).filter((w) => w.datum.startsWith(ym));
  let erfuellt = 0;
  for (const w of liste) {
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    const hat = !!personTag(m, p, w.datum).dienstId;
    if ((w.art === "moechte" && hat) || (w.art === "lieber_nicht" && !hat)) erfuellt++;
  }
  return { gesamt: liste.length, erfuellt, quote: liste.length ? Math.round((erfuellt / liste.length) * 100) : null };
}

/* ------------------------------- Einarbeitung ---------------------------- */
export const einarbeitungAm = (m, pid, d) =>
  (m.einarbeitung || []).find((e) => e.personId === pid && e.von <= d && e.bis >= d) || null;
/**
 * Prüft, ob eine Person in Einarbeitung an ihrem Diensttag von der zugeordneten
 * Begleitung tatsächlich begleitet wird.
 */
export function einarbeitungLage(m, von, bis) {
  const out = [];
  for (const e of m.einarbeitung || []) {
    const p = m.personen.find((x) => x.id === e.personId);
    const mentor = m.personen.find((x) => x.id === e.mentorId);
    if (!p) continue;
    let tage = 0, begleitet = 0, allein = [];
    for (let d = maxISO(e.von, von); d <= minISO(e.bis, bis); d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      tage++;
      const mt = mentor ? personTag(m, mentor, d) : null;
      if (mt && mt.dienstId === t.dienstId) begleitet++;
      else allein.push(d);
    }
    out.push({ ...e, person: p, mentor, tage, begleitet, allein,
      quote: tage ? Math.round((begleitet / tage) * 100) : null });
  }
  return out;
}
export const maxISO = (a, b) => (a > b ? a : b);
export const minISO = (a, b) => (a < b ? a : b);

/* --------------------------- Qualifikationsmatrix ------------------------ */
/**
 * Wer kann was — und wo hängt eine Qualifikation an zu wenigen Personen?
 * Der Engpass zeigt sich sonst erst bei der Krankmeldung.
 */
export function qualMatrix(m) {
  return memo(m, "qmatrix", () => {
    const aktiv = m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false);
    const spalten = m.qualifikationen.map((q) => {
      const traeger = aktiv.filter((p) => qualGueltig(m, p, q.id));
      const jeEinheit = {};
      for (const e of m.einheiten.filter((x) => !x.pool)) {
        jeEinheit[e.id] = traeger.filter((p) => einheitAm(p, heute()) === e.id).length;
      }
      // Höchster Bedarf dieser Qualifikation über alle Dienstarten
      const bedarf = Math.max(0, ...m.dienstarten.map((d) => (d.mindestQual || {})[q.id] || 0));
      const schwaechste = Object.entries(jeEinheit).sort((a, b) => a[1] - b[1])[0];
      return { qual: q, traeger, anzahl: traeger.length, jeEinheit, bedarf,
        engpass: bedarf > 0 && schwaechste && schwaechste[1] <= bedarf,
        kritisch: bedarf > 0 && schwaechste && schwaechste[1] < bedarf,
        schwaechsteEinheit: schwaechste ? m.einheiten.find((e) => e.id === schwaechste[0]) : null,
        schwaechsteAnzahl: schwaechste ? schwaechste[1] : 0 };
    });
    return { spalten, personen: aktiv,
      engpaesse: spalten.filter((s) => s.engpass).length,
      kritische: spalten.filter((s) => s.kritisch).length };
  });
}

/* ------------------------------- Kontoverlauf ---------------------------- */
/** Zwölf Monate Stundenkonto — die Frage ist nie der Stand, sondern die Richtung. */
export function kontoVerlauf(m, p, bisYm, monate = 12) {
  const out = [];
  const [y, mo] = bisYm.split("-").map(Number);
  for (let i = monate - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), kto: stundenkonto(m, p, k),
      ist: istStunden(m, p, k).gesamt, soll: sollStunden(m, p, k) });
  }
  return out;
}
/** Besetzungsverlauf über einen Zeitraum — für das Balkendiagramm im Lagebild. */
export function besetzungsVerlauf(m, ab, tage = 14) {
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const b = besetzung(m, d);
    let ist = 0, soll = 0, luecken = 0;
    for (const k of Object.keys(b)) {
      ist += b[k].anzahl; soll += b[k].soll;
      if (b[k].diff < 0) luecken += Math.abs(b[k].diff);
    }
    out.push({ datum: d, ist, soll, luecken, quote: soll ? Math.round((ist / soll) * 100) : 100 });
  }
  return out;
}
/** Nachweise nach Ablaufmonat — zeigt, wann eine Welle auf den Betrieb zukommt. */
export function nachweisVerlauf(m, monate = 12) {
  const out = [];
  const h = heute();
  for (let i = 0; i < monate; i++) {
    const d = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 1 + i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    let n = 0;
    for (const p of m.personen) {
      if (!imDienst(p, h)) continue;
      for (const x of p.qualNachweise || []) if (x.ablauf && x.ablauf.startsWith(k)) n++;
    }
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), anzahl: n });
  }
  return out;
}

/* --------------------------------- Notizen ------------------------------- */
export const notizenZu = (m, schluessel) => ((m.notizen || {})[schluessel] || []);

/* ------------------------------- Bereitschaft ---------------------------- */
/** Wer ist wann in Rufbereitschaft — und wer ist Rückfallebene? */
export function bereitschaftsplan(m, ab, tage = 14) {
  const rb = m.dienstarten.filter((d) => d.rufbereitschaft);
  if (!rb.length) return null;
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const eintraege = [];
    for (const da of rb) {
      const b = besetzung(m, d)[da.id];
      eintraege.push({ da, personen: b.personen, soll: b.soll });
    }
    out.push({ datum: d, eintraege, besetzt: eintraege.some((e) => e.personen.length > 0) });
  }
  return { dienstarten: rb, tage: out };
}

/* ------------------------- Suche für die Kommandoleiste ------------------ */
/**
 * Eine Suche über alles: Ansichten, Personen, Daten, Aktionen.
 * Bei vielen Ansichten ist Tippen schneller als Klicken.
 */
export function kommandoSuche(sitz, nav, frage) {
  const m = sitz.mandant;
  const q = frage.trim().toLowerCase();
  const treffer = [];
  const passt = (t) => !q || String(t).toLowerCase().includes(q);

  for (const [id, label] of nav) if (passt(label))
    treffer.push({ art: "ansicht", id, titel: label, unter: "Ansicht öffnen", punkte: label.toLowerCase().startsWith(q) ? 100 : 60 });

  if (q.length >= 2 && darf(sitz, "staff.view")) {
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      const name = `${p.nachname}, ${p.vorname}`;
      if (!passt(name) && !passt(p.funktion)) continue;
      const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
      treffer.push({ art: "person", id: p.id, titel: name,
        unter: `${p.funktion}${e ? ` · ${e.name}` : ""}`,
        punkte: p.nachname.toLowerCase().startsWith(q) ? 90 : 50 });
    }
  }

  // Datumsangaben: 16.9. · 16.09.2026 · heute · morgen
  const dm = q.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/);
  if (dm) {
    const j = dm[3] || heute().slice(0, 4);
    const d = `${j}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    treffer.push({ art: "datum", id: d, titel: fLang(d), unter: "Tag öffnen", punkte: 95 });
  }
  if ("heute".startsWith(q) && q) treffer.push({ art: "datum", id: heute(), titel: `Heute · ${fLang(heute())}`, unter: "Tag öffnen", punkte: 80 });
  if ("morgen".startsWith(q) && q) treffer.push({ art: "datum", id: addDays(heute(), 1), titel: `Morgen · ${fLang(addDays(heute(), 1))}`, unter: "Tag öffnen", punkte: 80 });

  const aktionen = [
    ["krank", "Krankmeldung erfassen", darf(sitz, "plan.edit.unit")],
    ["verfuegbarkeit", "Verfügbarkeit bearbeiten", sitz.person.imSchichtdienst !== false],
    ["assistent", "Planungsassistent starten", darf(sitz, "plan.edit.all")],
    ["wizard", "Schichtplanung einrichten", darf(sitz, "pattern.edit")],
    ["aushang", "Aushangplan drucken", darf(sitz, "plan.view.unit")],
    ["feldmodus", "Feldmodus umschalten", true],
  ];
  for (const [id, label, erlaubt] of aktionen) if (erlaubt && passt(label))
    treffer.push({ art: "aktion", id, titel: label, unter: "Aktion ausführen", punkte: 70 });

  /* Ganze Sätze verstehen — „Müller krank morgen" statt drei Menüs.
     Steht ganz oben, weil eine erkannte Absicht immer besser passt als ein
     zufälliger Worttreffer. Ausgeführt wird nichts: die Zeile öffnet die
     Ansicht mit vorausgefüllten Feldern, entscheiden tut ein Mensch. */
  if (q.split(/\s+/).length >= 2) {
    const v = verstehe(m, frage);
    if (v && v.befehl && v.sicher) {
      treffer.unshift({ art: "satz", id: v.befehl.id, titel: v.satz,
        unter: "Eingabe verstanden — öffnen", punkte: 200, satz: v });
    } else if (v && v.fehlt && v.fehlt.length) {
      treffer.unshift({ art: "unklar", id: v.befehl ? v.befehl.id : null, titel: v.satz,
        unter: v.fehlt.includes("mehrdeutig") ? "Nachnamen ergänzen" : "Person ergänzen",
        punkte: 190, satz: v });
    }
  }

  treffer.sort((a, b) => b.punkte - a.punkte);
  return treffer.slice(0, 12);
}

/* --------------------------- Briefing für den Tag ------------------------ */
/** Textfassung der Tagesaufgaben — für Benachrichtigung und E-Mail. */
export function briefingText(sitz) {
  const auf = tagesaufgaben(sitz);
  const m = sitz.mandant, p = sitz.person;
  const z = [`CENTRIC · ${m.name}`, fLang(heute()), ""];
  const t = p.imSchichtdienst !== false ? personTag(m, p, heute()) : null;
  if (t && t.dienstId) {
    const da = m.dienstarten.find((x) => x.id === t.dienstId);
    if (da) z.push(`Dein Dienst: ${da.name}, ${da.start}–${da.ende} Uhr`, "");
  }
  if (!auf.length) z.push("Es liegt nichts an.");
  else { z.push(`${auf.length} ${auf.length === 1 ? "Vorgang" : "Vorgänge"}:`);
    for (const a of auf) z.push(`${a.dringend ? "!" : "·"} ${a.titel}${a.text ? ` — ${a.text}` : ""}`); }
  return z.join("\n");
}


/* ==========================================================================
   EINRICHTUNGSSTAND
   Ein frisch angelegter Betrieb ist leer. Statt den Nutzer suchen zu lassen,
   sagt die App, was als Nächstes fehlt — und führt direkt dorthin.
   ========================================================================== */
export function einrichtungsstand(m) {
  const aktivP = m.personen.filter((p) => imDienst(p, heute()));
  const imDienstP = aktivP.filter((p) => p.imSchichtdienst !== false);
  const schritte = [
    { id: "personal", ziel: "personal", erledigt: imDienstP.length >= 2,
      titel: "Personal anlegen",
      text: imDienstP.length === 0 ? "Noch niemand im Bestand — Liste einlesen oder einzeln anlegen"
        : `${imDienstP.length} Person${imDienstP.length === 1 ? "" : "en"} im Schichtdienst` },
    { id: "rollen", ziel: "personal", erledigt: aktivP.some((p) => ["planer", "subplaner"].includes(p.rolle)),
      titel: "Zugangsarten vergeben",
      text: "Mindestens eine Planung oder Schichtverantwortung festlegen" },
    { id: "quals", ziel: "quals", erledigt: (m.qualifikationen || []).length > 0
        && aktivP.some((p) => p.qualifikationen && p.qualifikationen.length),
      titel: "Qualifikationen zuordnen",
      text: "Wer darf was — Grundlage für Besetzung und Ersatzsuche" },
    { id: "mindest", ziel: "dienste", erledigt: m.dienstarten.some((d) =>
        (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0),
      titel: "Mindestbesetzung festlegen",
      text: "Wie viele Personen je Dienst gebraucht werden" },
    { id: "freigabe", ziel: "plan", erledigt: Object.keys(m.freigaben || {}).length > 0,
      titel: "Ersten Plan freigeben",
      text: "Danach ist der Plan für alle verbindlich" },
  ];
  const offen = schritte.filter((x) => !x.erledigt);
  return { schritte, offen, fertig: offen.length === 0,
    anteil: Math.round(((schritte.length - offen.length) / schritte.length) * 100) };
}


/**
 * Setzt einen genehmigten Antrag im Bestand um: Abwesenheiten werden
 * eingetragen, Tauschgesuche als Abweichung geschrieben.
 */
export function antragUmsetzen(m, a) {
  if (a.typ === "abwesenheit") {
    return { ...m, abwesenheiten: [...m.abwesenheiten,
      { id: uid("a"), personId: a.personId, art: a.art, von: a.von, bis: a.bis,
        notiz: a.text || "" }] };
  }
  if (a.typ === "tausch" && a.partnerId) {
    // Beide Personen tauschen ihre Dienste am betroffenen Tag
    const pA = m.personen.find((x) => x.id === a.personId);
    const pB = m.personen.find((x) => x.id === a.partnerId);
    if (!pA || !pB) return m;
    const dA = personTag(m, pA, a.von).dienstId;
    const dB = personTag(m, pB, a.von).dienstId;
    return { ...m, abweichungen: { ...m.abweichungen,
      [`${pA.id}|${a.von}`]: dB || "-", [`${pB.id}|${a.von}`]: dA || "-" } };
  }
  return m;
}

/* ==========================================================================
   BRANCHENPAKETE UND FACHLICHE ERWEITERUNGEN
   Ein Kern, mehrere Vertikalen. Was eine Branche braucht, wird als Paket
   freigeschaltet — der Rechenkern bleibt für alle derselbe.
   ========================================================================== */

/* PAKETE und paketVon stehen in stufen.js, neben der Preisliste — die
   Pakete tragen einen Aufpreis, also gehören sie dorthin, wo gerechnet
   wird. Bewusst grob geschnitten: fünf Pakete statt fünfzig Schalter. */

/** Ist ein Merkmal für diesen Betrieb freigeschaltet? */
export const kann = kannMerkmal;   // paketlogik.js: gebuchtes Paket UND nutzbares Merkmal (G9/G10)
merkmalPruefungSetzen(kannMerkmal);   // WP-I12: der Rechenkern fragt die Paketlogik des Clients über diesen Haken
/* ------------------------ Branchenbegriffe ------------------------------- */
/**
 * Dieselbe Sache heißt je Branche anders. Die Begriffe stecken an einer Stelle,
 * damit die Oberfläche in der Sprache des Betriebs spricht.
 */
export const BEGRIFFE = {
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
export const begriff = (m, was) => (BEGRIFFE[m.branche] || BEGRIFFE.standard)[was]
  || BEGRIFFE.standard[was] || was;

/* --------------------------- Fachkraftquote ------------------------------ */
/**
 * Pflege und Klinik arbeiten mit einer Mindestquote examinierter Kräfte je
 * Dienst. Sie wird als Anteil geführt, nicht als absolute Zahl — sonst stimmt
 * sie bei wechselnder Besetzungsstärke nicht mehr.
 */
/** Gilt diese Person als Pflegefachkraft?

    Der Nachweisstand wird gegen heute gerechnet, nicht gegen den fraglichen
    Tag — nachweisStand kennt kein Stichtagsargument. Für die Untergrenzen
    des laufenden Monats ist das richtig; für weit zurückliegende Monate
    wäre eine Rückrechnung nötig, und die gehört dann in nachweisStand. */
export function istFachkraft(m, p) {
  return m.qualifikationen.some((q) => q.fachkraft && qualGueltig(m, p, q.id));
}



/* ------------------ Anrechnung von Bereitschaft und Teildiensten --------- */
/**
 * Bereitschaftsdienst (Anwesenheit am Arbeitsplatz) und Rufbereitschaft
 * (Erreichbarkeit von zu Hause) zählen unterschiedlich. Beide sind
 * Arbeitszeit im Sinne des Arbeitsschutzes, aber nicht in voller Höhe
 * vergütungs- oder kontenwirksam. DIENSTFORMEN, dienstform() und anrechnungsfaktor() stehen in
 * server/lib/lohnrechnung.mjs (WP-16, Nachtrag dritter Review: der Abschluss rechnet damit).
 */

/* --------------------------------------------------------------------------
   AUFENTHALTSBINDUNG

   Ob eine Bereitschaft als Arbeitszeit zählt, entscheidet nicht ihr Name,
   sondern wie eng sie bindet. Der EuGH stellt darauf ab, wie stark die
   Möglichkeit eingeschränkt ist, die freie Zeit zu gestalten — eine
   Rufbereitschaft mit acht Minuten Abrufzeit ist in der Sache
   Bereitschaftsdienst, auch wenn sie anders heißt (EuGH C-580/19,
   C-344/19, jeweils vom 09.03.2021).

   Die Anwendung entscheidet das nicht selbst. Sie erfasst die drei Größen,
   auf die es ankommt — wo man sich aufhalten muss, in welcher Zeit man da
   sein muss, wie viel davon erfahrungsgemäß Einsatz ist — und sagt, wenn
   die Angaben nicht zur gewählten Form passen. Die Bewertung bleibt beim
   Betrieb und seinem Tarifvertrag.
   -------------------------------------------------------------------------- */
export const AUFENTHALT = [
  { id: "arbeitsplatz", name: "Am Arbeitsplatz",
    text: "Anwesenheit im Betrieb oder an einer vom Betrieb bestimmten Stelle." },
  { id: "naehe", name: "In erreichbarer Nähe",
    text: "Aufenthalt in einem vom Betrieb vorgegebenen Umkreis." },
  { id: "frei", name: "Frei wählbar",
    text: "Nur Erreichbarkeit geschuldet, der Ort ist Sache der Person." },
];
export const aufenthaltVon = (id) => AUFENTHALT.find((x) => x.id === id) || AUFENTHALT[0];

/**
 * Passt die Ausgestaltung zur gewählten Dienstform?
 *
 * Kein Urteil, ein Hinweis: Die Anwendung kennt weder den Tarifvertrag noch
 * die tatsächliche Belastung. Sie merkt nur an, wo die Angaben in eine
 * andere Richtung zeigen als die Form.
 */
export function bereitschaftHinweise(da) {
  const aus = [];
  if (!da || (da.form !== "ruf" && da.form !== "bereitschaft")) return aus;
  const abruf = Number(da.abrufMinuten);
  const anteil = Number(da.einsatzAnteil);

  if (da.form === "ruf" && da.aufenthalt === "arbeitsplatz")
    aus.push({ schwere: "warn",
      text: "Als Rufbereitschaft geführt, verlangt aber Anwesenheit am Arbeitsplatz. "
        + "Wer den Ort nicht wählen kann, leistet Bereitschaftsdienst — und der ist "
        + "in voller Länge Arbeitszeit." });

  if (da.form === "ruf" && Number.isFinite(abruf) && abruf > 0 && abruf <= 20)
    aus.push({ schwere: "warn",
      text: `Abrufzeit ${abruf} Minuten. Der EuGH sieht eine so kurze Frist als so `
        + "einschneidend an, dass die Zeit in der Regel als Arbeitszeit zählt "
        + "(EuGH C-580/19). Die Einstufung als Rufbereitschaft gehört geprüft." });

  if (da.form === "ruf" && Number.isFinite(anteil) && anteil >= 0.3)
    aus.push({ schwere: "warn",
      text: `Erfahrungsgemäß ${Math.round(anteil * 100)} Prozent Einsatz. Bei dieser Dichte `
        + "ist die Erholungswirkung dahin; Tarifverträge sehen dann meist eine höhere "
        + "Bewertung oder Bereitschaftsdienst vor." });

  if (da.form === "bereitschaft" && da.aufenthalt === "frei")
    aus.push({ schwere: "info",
      text: "Als Bereitschaftsdienst geführt, der Aufenthalt ist aber frei wählbar. "
        + "Das ist der Sache nach Rufbereitschaft — prüfe die Form." });

  if ((da.form === "ruf" || da.form === "bereitschaft") && !Number.isFinite(abruf))
    aus.push({ schwere: "info",
      text: "Keine Abrufzeit hinterlegt. Sie ist die Größe, an der die "
        + "arbeitszeitrechtliche Bewertung hängt — ohne sie lässt sich die Form nicht belegen." });

  return aus;
}

/** Dauer eines geteilten Dienstes: beide Abschnitte ohne die Lücke dazwischen. */
export function geteilteDauer(da) {
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
export const STUFEN_STD = { urlaub: 1, tausch: 1, schulung: 2, sonder: 2, krank: 0, ausgleich: 1 };
export const stufenFuer = (m, art) => (m.genehmigungsstufen || STUFEN_STD)[art] ?? 1;
/** Wie weit ist ein Antrag? */
export function genehmigungsStand(m, a) {
  const noetig = stufenFuer(m, a.art || a.typ);
  const erteilt = (a.freigaben || []).length;
  return { noetig, erteilt, offen: Math.max(0, noetig - erteilt), fertig: erteilt >= noetig,
    naechste: erteilt === 0 ? "Schichtverantwortung oder Planung" : "Organisationsleitung" };
}
/** Darf diese Person die nächste Stufe erteilen? */
export function darfStufe(sitz, a, stand) {
  if (stand.erteilt === 0) return darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all");
  return darf(sitz, "req.approve.all") || darf(sitz, "org.edit");
}

/* --------------------------- Schichtübergabe ----------------------------- */
/**
 * Die Übergabe ist in Pflege und Klinik ein eigener, dokumentationspflichtiger
 * Vorgang: Wer übergibt an wen, was ist offen, was ist besonders.
 */
export const UEBERGABE_FELDER = [
  { id: "lage", label: "Lage und Besonderheiten", pflicht: true,
    hinweis: "Was die übernehmende Schicht wissen muss." },
  { id: "offen", label: "Offene Aufgaben", pflicht: false,
    hinweis: "Was noch zu erledigen ist, mit Zeitbezug." },
  { id: "vorkommnis", label: "Besondere Vorkommnisse", pflicht: false,
    hinweis: "Ereignisse mit Dokumentationspflicht." },
  { id: "material", label: "Material und Betriebsmittel", pflicht: false,
    hinweis: "Fehlendes, Defektes, Übergebenes." },
];
/* Ältere Betriebe trugen `uebergaben: {}` (siehe leererMandant). */
export const uebergabenVon = (m) => (Array.isArray(m.uebergaben) ? m.uebergaben : []);
/* Eine Übergabe je Tag, Dienstart und Einheit (Commit C2; fehlend wie null). */
export const uebergabeAm = (m, datum, dienstId, einheitId = null) =>
  uebergabenVon(m).find((u) => u.datum === datum && u.dienstId === dienstId
    && (u.einheitId ?? null) === (einheitId ?? null)) || null;
/** Übergaben, die fällig, aber nicht erfolgt sind. */
export function offeneUebergaben(m, tage = 3, einheitId = null) {
  if (!kann(m, "uebergabe")) return [];
  const out = [];
  for (let i = tage; i >= 1; i--) {
    const d = addDays(heute(), -i);
    for (const da of m.dienstarten) {
      if (da.posten || da.form === "ruf") continue;
      const b = besetzung(m, d)[da.id];
      /* Fällig je Einheit: nur, wenn jemand aus ihr im Dienst war. */
      const personen = einheitId ? b.personen.filter((p) => einheitAm(p, d) === einheitId) : b.personen;
      if (!personen.length) continue;
      if (!uebergabeAm(m, d, da.id, einheitId)) out.push({ datum: d, dienstart: da, personen });
    }
  }
  return out;
}

/* --------------------------- Lohnausgabe --------------------------------- */
/* LOHNARTEN_STD (übliche Lohnartennummern als Startwerte, einstellbar) steht seit WP-16 (Nachtrag dritter Review
   N-d) in server/lib/lohnrechnung.mjs: Der Abschluss friert die wirksamen Lohnarten ein — eigene oder diese. */
/**
 * Erzeugt den Lohnartensatz je Person für einen Monat.
 * Bewusst als Stunden je Lohnart — Entgelte gehören in die Lohnabrechnung.
 *
 * Abgeschlossener Monat (WP-16, Nachtrag dritter Review H-1): NUR aus dem Freeze (datevAusFreeze) — Lohnarten,
 * Zugehörigkeit, Zuschläge, Bereitschaft/Ruf, Konto (Mehrarbeit) und Personalangaben wie zum Abschluss. Ein später
 * geänderter Übertrag, ein geänderter offener Vormonat, ein umbenannter oder aus dem Personalstamm entfernter
 * Mensch ändern die Zeilen nicht; der Server rechnet beim Bestätigen des Lohnexports dieselben Zeilen nach.
 * Unbrauchbarer Freeze (Version, Verzeichnis, Lohnarten): keine Zeilen — die Lohnausgabe nennt den Prüffall.
 * Altabschlüsse (Schema 1/2) rechnen wie bisher, gekennzeichnet als nicht reproduzierbar.
 */
export function datevSaetze(m, ym) {
  const st = freezeStatus(m, ym);
  if (st && st.unbekannt) return [];
  /* Ab Revision 2 (WP-16c) nur die Differenz zur exportierten Revision — der gekennzeichnete Korrekturexport. */
  if (st && st.reproduzierbar) return exportZeilenFuer(m, ym).zeilen;
  /* Abgeschlossener Monat (WP-16, Nachtrag M-neu-2): Lohnarten und Zugehörigkeit (im Dienst am 28.) wie zum
     Abschluss — ein rückwirkend verlegter Austritt lässt niemanden aus dem abgeschlossenen Monat fallen. */
  const fb = eingefrorenerBetrieb(m, ym);
  /* Schema 2 ohne Lohnarten (la: null): nicht die heutigen nehmen (Nachtrag dritter Review M-1) — keine Zeilen. */
  if (st && st.schema >= 2 && !(fb && fb.la && typeof fb.la === "object")) return [];
  const la = (fb && "la" in fb ? fb.la : m.lohnarten) || LOHNARTEN_STD;
  const zeilen = [];
  for (const p of m.personen) {
    const fm = eingefrorenerMonat(m, p, ym);
    if (fm && (fm.i === 0 || fm.i === 1) ? fm.i !== 1 : !imDienst(p, `${ym}-28`)) continue;
    /* Freeze fehlt (N3): keine Zeilen statt 0 h — die Lohnausgabe nennt den Prüffall (lohnPruefZeilen, exportWarnung). */
    if (abschlussLuecke(m, p, ym)) continue;
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
      /* Abgeschlossener Monat: der eingefrorene Dienst (WP-16, Review H1). Stunden aus dem Ist des Tages — Sommerzeit,
         erfasste Zeit (Nachtrag vierter Review N-1, wie summeAusTagen im Freeze); ohne Ist-Zeit die Dauer an dem Tag. */
      const t = istTag(m, p, d);
      const da = t.da;
      if (!da) continue;
      const std = t.idn && t.idn.std !== null && t.idn.std !== undefined && Number.isFinite(Number(t.idn.std)) ? Number(t.idn.std) : dauerAm(d, da);
      if (da.form === "bereitschaft") ber += std;
      else if (da.form === "ruf" || da.rufbereitschaft) ruf += std;
    }
    eintrag("bereitschaft", ber);
    eintrag("ruf", ruf);
    if (kto > 0) eintrag("mehrarbeit", kto);
  }
  return zeilen;
}
/* csvFeld (ein Feld der Trennzeichendatei) und csvText (Freitext, zusätzlich
   gegen Formel-Injection) stehen in src/csvfeld.js. */

/**
 * Der Stand, aus dem die Lohnausgabe eines abgeschlossenen Monats entsteht (WP-16, Nachtrag dritter Review H-2):
 * Prüfsumme und Kennung des Abschlusses, Revision und die Prüfsumme der Zeilen. Die Oberfläche merkt ihn sich beim
 * Ausgeben der Datei und schickt genau ihn beim Bestätigen des Lohnexports mit; der Server vergleicht (409 bei
 * Abweichung). null für einen offenen Monat.
 */
/** Der zuletzt ausgegebene Stand je Betrieb und Monat (nur in dieser Sitzung der Oberfläche). */
export const EXPORT_STAND = new Map();
export function lohnexportStand(m, ym) {
  const e = m && m.monatsabschluss && m.monatsabschluss[ym];
  if (!e || e.abgeschlossen !== true) return null;
  return { monat: ym, abdruck: e.abdruck ?? null, stand: e.stand ?? null, revision: Number.isInteger(e.revision) ? e.revision : 1,
    zeilen: datevZeilenAbdruck(datevSaetze(m, ym)) };
}
/** Dateiname der Lohnausgabe: im abgeschlossenen Monat mit Revision und Prüfsumme (die Datei selbst bleibt im Format). */
export function lohnausgabeDateiname(m, ym, endung) {
  const s = lohnexportStand(m, ym);
  return `lohnausgabe_${String(m.name || "").replace(/\W+/g, "_")}_${ym}${s && s.abdruck ? `_${s.revision > 1 ? "korrektur_" : ""}r${s.revision}_${String(s.abdruck).slice(0, 12)}` : ""}.${endung}`;
}

/** Kategorien der Überstimmung offener oder geänderter Vormonate beim Lohnexport — dieselbe Liste wie der Server. */
export const VORMONAT_KATEGORIEN = Object.entries(VORMONAT_KATEGORIEN_SERVER).map(([id, text]) => ({ id, text }));
/**
 * Rückfrage vor dem Bestätigen des Lohnexports (WP-16, Nachtrag vierter Review A-2): Nennt die Vormonate des Jahres,
 * die offen sind (oder beim Abschluss waren) oder seit dem Abschluss wiederöffnet und neu abgeschlossen wurden. Mit
 * `vormonate: true` bestätigt der Server nur mit ausdrücklicher Überstimmung (Kategorie und Begründung).
 */
export function lohnexportRueckfrage(m, ym) {
  const h = datevHinweise(m, ym);
  const offen = h ? h.vormonateOffen : [], geaendert = h ? h.vormonatGeaendert : [];
  const teile = [
    geaendert.length ? `Seit dem Abschluss wiederöffnet und neu abgeschlossen (geändert): ${geaendert.map(monatText).join(", ")} — das Konto (Mehrarbeit) dieses Monats ist veraltet.` : "",
    offen.length ? `Vormonat offen oder beim Abschluss offen: ${offen.map(monatText).join(", ")} — das Konto (Mehrarbeit) ist vorläufig.` : ""].filter(Boolean);
  return { vormonate: teile.length > 0, offen, geaendert, text: teile.join("\n") };
}
/** Die Lohnartennummer der Mehrarbeit (Kontostand) für einen Monat: im abgeschlossenen Monat aus dem Freeze. */
export function mehrarbeitNr(m, ym) {
  const fb = eingefrorenerBetrieb(m, ym);
  const la = (fb && fb.la && typeof fb.la === "object" ? fb.la : m.lohnarten) || LOHNARTEN_STD;
  return String(((la && la.mehrarbeit) || LOHNARTEN_STD.mehrarbeit).nr);
}
export const KONTOSTAND_TEXT = "Mehrarbeit = Stand des Stundenkontos zum Monatsende (Übertrag + alle Monate des Jahres), "
  + "kein Zuwachs dieses Monats — nicht über mehrere Monate addieren.";
/**
 * Personen, die im Monat beschäftigt waren, aber am 28. nicht (Austritt oder Eintritt im Monat): Sie bekommen keine
 * Zeilen (Produktentscheidung offen, WP-16 Nachtrag vierter Review A-5) — die Lohnausgabe sagt es. Abgeschlossen
 * (Schema 3) aus dem Freeze, sonst aus dem Personalstamm.
 */
export function ohneZeilenImMonat(m, ym) {
  const h = datevHinweise(m, ym);
  if (h && !h.unbekannt && !h.nichtReproduzierbar) return h.ausgetreten;
  const [y, mo] = ym.split("-").map(Number);
  const tage = Array.from({ length: dim_(y, mo - 1) }, (_, i) => `${ym}-${pad(i + 1)}`);
  return m.personen.filter((p) => !imDienst(p, `${ym}-28`) && tage.some((d) => imDienst(p, d)))
    .map((p) => ({ personId: p.id, personalnummer: p.personalnummer || p.id, nachname: p.nachname, vorname: p.vorname,
      austritt: typeof p.austritt === "string" && p.austritt.slice(0, 7) === ym ? p.austritt.slice(0, 10) : null }));
}
export function ohneZeilenText(m, ym) {
  const l = ohneZeilenImMonat(m, ym);
  if (!l.length) return [];
  const datum = (x) => `${x.slice(8, 10)}.${x.slice(5, 7)}.${x.slice(0, 4)}`;
  return [`HINWEIS: ${l.length === 1 ? "1 Person" : `${l.length} Personen`} am 28. nicht im Dienst — ausgetreten – Zeilen nicht ausgegeben `
    + "(auch keine Zuschläge, Bereitschaft oder Mehrarbeit; offene Entscheidung, siehe Nachweis WP-16):",
  ...l.map((x) => `  ${x.nachname || "?"}, ${x.vorname || "?"} (${x.personalnummer})${x.austritt ? `, Austritt ${datum(x.austritt)}` : ", Eintritt nach dem 28."}`), ""];
}

/**
 * Die Lohnausgabe als Trennzeichendatei.
 *
 * Kein amtliches DATEV-Importformat — die gibt es (LODAS und Lohn und Gehalt),
 * beide mit vorgeschriebenem Kopfsatz und fester Feldfolge. Diese Datei ist
 * eine schlichte, klar benannte Spaltenliste, wie sie ein Lohnbüro in seinen
 * Import einliest oder in die eigene Maske übernimmt. Sie ist bewusst so
 * gehalten, dass ein Mensch sie lesen und prüfen kann, bevor er sie weitergibt.
 *
 * Byte-Reihenfolge-Marke und CRLF stehen davor, damit Excel Umlaute nicht
 * zerlegt — ohne beides wird aus Müller ein MÃ¼ller.
 *
 * Prüfsumme und Revision eines abgeschlossenen Monats stehen nicht in der Datei (das Spaltenformat bleibt, wie
 * Importe es erwarten), sondern im Dateinamen und im Blatt zum Gegenlesen (lohnausgabeText).
 */
export function datevCSV(m, ym) {
  /* Feste Reihenfolge: Personalnummer, dann Lohnart. Vorher kam die Reihenfolge
     aus der Personalliste — zwei Ausgaben desselben Monats konnten sich
     unterscheiden, ohne dass sich eine Zahl geändert hatte. */
  /* Dieselbe Reihenfolge wie die Zeilen-Prüfsumme (datevReihenfolge, WP-16 Nachtrag vierter Review N-2). */
  const z = datevSaetze(m, ym).slice().sort(datevReihenfolge);
  const [jahr, monat] = ym.split("-");
  const kopf = ["Personalnummer", "Nachname", "Vorname", "Lohnart", "Bezeichnung",
    "Stunden", "Monat", "Jahr"];
  const zeilen = [kopf.join(";")];
  /* Textfelder gegen Formel-Injection (SI-02), Zahlen über csvFeld. */
  for (const x of z) zeilen.push([csvText(x.personalnummer), csvText(x.nachname), csvText(x.vorname), csvText(x.lohnart),
    csvText(x.bezeichnung), csvFeld(n2(x.stunden)), csvFeld(monat), csvFeld(jahr)].join(";"));
  return "\uFEFF" + zeilen.join("\r\n");
}

/**
 * Dieselben Zahlen als lesbares Blatt — zum Gegenlesen, bevor die Datei das
 * Haus verlässt. Eine Trennzeichendatei prüft niemand gern am Bildschirm.
 */
/**
 * Ist-Zeiten zur Prüfung (WP-17, W1) im Blatt zum Gegenlesen: je betroffenem
 * Tag eine Zeile „zur Prüfung, Planzeit vorläufig". Ohne offene Fälle leer.
 */
export function lohnPruefZeilen(m, ym) {
  const h = pruefHinweis(m, ym);
  /* Abgeschlossener Monat ohne Freeze einer Person (WP-16, Nachtrag N3): Prüffall statt still 0 h. */
  /* Nach Frist gelöscht (Nachtrag vierter Review A-3): kein Prüffall je Person — freezeZeilen sagt es einmal. */
  const lu = freezeGeloescht(m, ym) ? [] : abschlussLuecken(m, ym);
  const luZeilen = lu.length ? [`ACHTUNG: ${lu.length === 1 ? "1 Person fehlt" : `${lu.length} Personen fehlen`} in dieser Ausgabe. ${abschlussLueckeText(m, ym)}`,
    ...lu.map((p) => `  ${p.nachname}, ${p.vorname}`), ""] : [];
  /* Austritt im Monat (A-5): keine Zeilen — gesagt, nicht still. */
  const fz = [...freezeZeilen(m, ym), ...ohneZeilenText(m, ym)];
  if (!h) return [...luZeilen, ...fz];
  const nameVon = (pid) => { const p = m.personen.find((x) => x.id === pid); return p ? `${p.nachname}, ${p.vorname}` : pid; };
  return [
    `ACHTUNG: ${h.text}`,
    ...h.faelle.map((f) => `  ${f.datum}  ${nameVon(f.personId)}: ${pruefFallText(f.art)}`),
    "Vor der Weitergabe in Abrechnungsdaten · Stempelbefunde prüfen und bestätigen.",
    "",
    ...luZeilen,
    ...fz,
  ];
}
/**
 * Hinweise aus dem Freeze eines abgeschlossenen Monats (WP-16, Nachtrag dritter Review H-1, M-1, N-d) — Prüffälle
 * statt stiller Zahlen: unbrauchbarer oder nicht reproduzierbarer Abschluss, Personen nicht mehr im Personalstamm
 * (Zeilen aus dem Abschluss), Konto nicht rechenbar, offene Vormonate, anderer Rechenstand. Seit dem vierten Review
 * dazu: Vormonat nach dem Abschluss geändert (A-1), Abweichung von der bestätigten Ausgabe und Freeze nach Frist
 * gelöscht (A-3), Übertrag ohne Jahresbezug (A-4).
 */
export const freezeGeloescht = (m, ym) => { const st = freezeStatus(m, ym); return !!st && st.grund === "geloescht"; };
export function freezeZeilen(m, ym) {
  const h = datevHinweise(m, ym);
  if (!h) return [];
  const name = (x) => `  ${x.nachname || "?"}, ${x.vorname || "?"} (${x.personalnummer})`;
  const aus = [];
  /* Bestätigte Ausgabe gegen die heutige (A-3): Zeilen-Prüfsumme vergleichen, gelöschten Freeze benennen. */
  const vg = lohnexportVergleich(m, ym, datevSaetze(m, ym));
  const bestaetigt = vg ? `bestätigt am ${zeitpunktText(vg.am)}, Zeilen-Prüfsumme ${vg.bestaetigt || "unbekannt"}${Number.isFinite(vg.n) ? `, ${vg.n} Zeilen` : ""}` : "";
  if (h.unbekannt && h.geloescht) aus.push(`HINWEIS: Nach Frist gelöscht — ${abschlussLueckeText(m, ym)} Keine Lohnartensätze mehr; `
    + `die Ausgabe von damals gilt (${bestaetigt}).`, "");
  else if (h.unbekannt) aus.push("ACHTUNG: Der Abschluss dieses Monats ist in einem unbekannten oder unvollständigen Format — "
    + "keine Lohnartensätze (Prüffall: Monat wiederöffnen und erneut abschließen).", "");
  if (vg && vg.status === "abweichend") aus.push("ACHTUNG: Diese Ausgabe weicht von der bestätigten Ausgabe ab (Anonymisierung/Softwarestand) — "
    + `Zeilen-Prüfsumme heute ${vg.heute}, ${bestaetigt}. Maßgeblich bleibt die bestätigte Datei.`, "");
  if (h.nichtReproduzierbar) aus.push(`ACHTUNG: Abschluss im älteren Format (Schema ${h.schema}) — nicht reproduzierbar: `
    + "Soll, Zuschläge oder Konto teils mit heutigen Stammdaten gerechnet. Vor dem Lohnexport wiederöffnen und erneut abschließen.", "");
  if (h.lohnartenFehlen) aus.push("ACHTUNG: Im Abschluss fehlen die Lohnarten — keine Lohnartensätze (Prüffall).", "");
  if (h.entfernt.length) aus.push(`HINWEIS: ${h.entfernt.length === 1 ? "1 Person steht" : `${h.entfernt.length} Personen stehen`} `
    + "nicht mehr im Personalstamm — ihre Zeilen kommen aus dem Abschluss:", ...h.entfernt.map(name), "");
  if (h.kontoFehlt.length) aus.push(`ACHTUNG: Konto zum Abschluss nicht rechenbar (keine Mehrarbeitszeile) für `
    + `${h.kontoFehlt.length === 1 ? "1 Person" : `${h.kontoFehlt.length} Personen`}:`, ...h.kontoFehlt.map(name), "");
  if (h.vormonateOffen.length) aus.push(`HINWEIS: Konto vorläufig — Vormonat offen (${h.vormonateOffen.map(monatText).join(", ")}). `
    + "Das Konto dieses Monats ist der Stand zum Abschluss; Änderungen in offenen Vormonaten wirken erst in späteren Monaten.", "");
  if (h.vormonatGeaendert.length) aus.push(`ACHTUNG: Vormonat nach dem Abschluss geändert (${h.vormonatGeaendert.map(monatText).join(", ")}) — `
    + "wiederöffnet und neu abgeschlossen. Das Konto (Mehrarbeit) dieses Monats ist der Stand vor der Änderung und damit veraltet; "
    + "der Lohnexport lässt sich nur mit ausdrücklicher Begründung bestätigen.", "");
  if (h.uebertragGeaendert.length) {
    const seit = [...new Set(h.uebertragGeaendert.map((x) => x.seit))].sort();
    for (const s of seit) aus.push(`HINWEIS: Übertrag seit ${monatText(s)} geändert — der Übertrag hat keinen Jahresbezug; `
      + "das Konto rechnet mit dem Wert zum Abschluss, nichts umgerechnet. Bitte prüfen:",
    ...h.uebertragGeaendert.filter((x) => x.seit === s).map((x) => `${name(x)}: ${zahl(x.vorher)} → ${zahl(x.ue)}`), "");
  }
  if (h.uebertragJahreswechsel) aus.push(`HINWEIS: Übertrag ohne Jahresbezug — der Monat wurde erst nach dem Jahreswechsel abgeschlossen. `
    + `Bitte prüfen, ob der eingefrorene Übertrag noch der des Jahres ${ym.slice(0, 4)} war; nichts umgerechnet.`, "");
  if (h.rechenstand !== undefined) aus.push(`HINWEIS: Abschluss mit Rechenstand ${h.rechenstand ?? "unbekannt"} — die Software rechnet heute anders. `
    + "Die eingefrorenen Werte gelten unverändert.", "");
  return aus;
}

/** Rückfrage vor einem Lohn-Export: Prüffälle (WP-17) und Personen ohne Freeze im abgeschlossenen Monat (WP-16, N3). */
export function lohnWarnung(m, ym, w) {
  const l = freezeGeloescht(m, ym) ? 0 : abschlussLuecken(m, ym).length;
  const fz = freezeZeilen(m, ym).filter((z) => z.startsWith("ACHTUNG")).join("\n");
  if (!l && !fz) return w;
  const t = [l ? `${l === 1 ? "1 Person" : `${l} Personen`}: ${abschlussLueckeText(m, ym)} In der Ausgabe fehlt sie.` : "", fz].filter(Boolean).join("\n");
  return w ? `${t}\n\n${w}` : `${t}\n\nTrotzdem jetzt ausgeben?`;
}

export function lohnausgabeText(m, ym) {
  const z = datevSaetze(m, ym);
  const [jahr, monat] = ym.split("-");
  const jeLohnart = {};
  for (const x of z) {
    if (!jeLohnart[x.lohnart]) jeLohnart[x.lohnart] = { nr: x.lohnart, text: x.bezeichnung, stunden: 0, personen: new Set() };
    jeLohnart[x.lohnart].stunden += x.stunden;
    jeLohnart[x.lohnart].personen.add(x.personalnummer);
  }
  const summen = Object.values(jeLohnart).sort((a, b) =>
    String(a.nr).localeCompare(String(b.nr), "de", { numeric: true }));
  const breite = (s, n) => String(s).padEnd(n).slice(0, n);
  /* Begleitprotokoll (WP-16, Nachtrag dritter Review H-2): Abschluss, Revision und Prüfsummen des ausgegebenen Standes. */
  const st = lohnexportStand(m, ym);
  /* Mehrarbeit ist der Kontostand zum Monatsende, kein Monatszuwachs (Nachtrag vierter Review A-6) — im Blatt so benannt. */
  const ma = mehrarbeitNr(m, ym);
  const kontostand = summen.some((l) => String(l.nr) === ma);
  for (const l of summen) if (String(l.nr) === ma) l.text = `${l.text} (Kontostand)`;
  return [
    `Lohnausgabe ${m.name}`,
    `Abrechnungsmonat: ${MON[Number(monat) - 1]} ${jahr}`,
    `Erstellt: ${new Date().toLocaleString("de-DE")}`,
    ...(st ? [`Abschluss: Revision ${st.revision} · Prüfsumme ${st.abdruck} · Zeilen-Prüfsumme ${st.zeilen}`]
      : ["Monat nicht abgeschlossen — vorläufige Ausgabe, nicht als Lohnexport bestätigbar."]),
    "",
    ...lohnPruefZeilen(m, ym),
    "Summen je Lohnart",
    "—".repeat(58),
    `${breite("Lohnart", 10)}${breite("Bezeichnung", 32)}${"Personen".padStart(9)}${"Stunden".padStart(11)}`,
    ...summen.map((l) => `${breite(l.nr, 10)}${breite(l.text, 32)}`
      + `${String(l.personen.size).padStart(9)}${n2(l.stunden).padStart(11)}`),
    "—".repeat(58),
    `${breite("", 42)}${String(new Set(z.map((x) => x.personalnummer)).size).padStart(9)}`
      + `${n2(z.reduce((a, x) => a + x.stunden, 0)).padStart(11)}`,
    "",
    `${zahl(z.length)} Lohnartensätze für ${zahl(new Set(z.map((x) => x.personalnummer)).size)} Personen.`,
    "",
    ...(kontostand ? [`Lohnart ${ma}: ${KONTOSTAND_TEXT}`, ""] : []),
    "Ausgewiesen werden Stunden je Lohnart, keine Entgelte. Stundensätze,",
    "Tarifgruppen und Steuerfreibeträge gehören in die Lohnabrechnung.",
  ].join("\n");
}
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
export function tagesReserve(m, datum, dienstId) {
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
export function belastbarkeit(m, wochen = 8) {
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

/* Die Schwellen, ab denen eine Woche robust, knapp oder ohne Reserve heißt.
   Sie standen bisher nur als Zahlenvergleich im Code — auf dem Bildschirm
   erschien das Urteil, nie sein Maßstab. Wer „knapp" liest, soll erfahren
   können, ab wann etwas so heißt. */
export const RESERVE_STUFEN = [
  { id: "robust", ab: 3, text: "drei oder mehr gleichzeitige Ausfälle verkraftbar" },
  { id: "knapp", ab: 1, text: "ein bis zwei gleichzeitige Ausfälle verkraftbar" },
  { id: "ohne Reserve", ab: 0, text: "kein einziger Ausfall mehr verkraftbar" },
];

/**
 * Der Befund als Satz.
 *
 * Die Auswertung zeigte Balken, Zahlen und drei Farben — aber nie das
 * Ergebnis in Worten. Wer die Seite öffnet, will zuerst wissen, ob etwas
 * zu tun ist, und erst dann, woran man das sieht.
 */
export function belastbarkeitSatz(bl, grenze) {
  const kritisch = bl.filter((w) => w.stufe === "ohne Reserve");
  const knapp = bl.filter((w) => w.stufe === "knapp");
  const anteil = grenze ? `${Math.round(grenze.anteil * 100)} %` : "über 30 %";
  if (kritisch.length) {
    const w = kritisch[0];
    const d = w.schwaechste;
    return { ton: "danger",
      satz: `Ab der Woche vom ${fKurz(w.von)} verkraftet ${d ? d.da.name : "ein Dienst"} keinen `
        + `einzigen Ausfall mehr — die nächste Krankmeldung führt dort zur Unterbesetzung.`,
      dazu: `Betroffen sind ${anzahlWort(kritisch.length, "Woche")}. Der Plan reißt rechnerisch, `
        + `sobald ${anteil} der Belegschaft gleichzeitig ausfällt.` };
  }
  if (knapp.length) {
    const w = knapp[0];
    const d = w.schwaechste;
    const n = d ? d.min : 1;
    return { ton: "warn",
      satz: `Keine Woche steht ganz ohne Reserve da, aber ab dem ${fKurz(w.von)} wird es eng: `
        + `${d ? d.da.name : "ein Dienst"} verkraftet dort nur noch `
        + `${n === 1 ? "einen einzigen Ausfall" : `${zahl(n)} gleichzeitige Ausfälle`}.`,
      dazu: `${anzahlWort(knapp.length, "Woche")} mit dünner Decke. Der Plan reißt rechnerisch, `
        + `sobald ${anteil} der Belegschaft gleichzeitig ausfällt.` };
  }
  return { ton: "ok",
    satz: `Alle geprüften Wochen verkraften mindestens drei gleichzeitige Ausfälle.`,
    dazu: `Der Plan reißt rechnerisch erst, wenn ${anteil} der Belegschaft gleichzeitig ausfällt.` };
}

/**
 * Ausfallszenario: Was passiert, wenn ein bestimmter Anteil der Belegschaft
 * ausfällt? Krankheitswellen sind in Pflege und Klinik der Regelfall, nicht
 * die Ausnahme — und der Grund, warum Pläne im Winter reißen.
 *
 * Der Ausfall wird gleichmäßig über die Einheiten verteilt, nicht zufällig:
 * ein zufälliges Ergebnis wäre bei jedem Aufruf anders und damit wertlos.
 */
export function ausfallSzenario(m, anteil, tage = 14) {
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
export function rangGruende(m, x, datum, dienstId) {
  const g = [];
  const p = x.person;
  const ym = datum.slice(0, 7);
  const kto = stundenkonto(m, p, ym);
  const au = auslastung(m, p, ym);
  const alle = m.personen.filter((q) => imDienst(q, datum) && q.imSchichtdienst !== false);
  /* Ohne Ist-Daten (Rollenschutz) keine Aussage über Konto und Auslastung. */
  const mitKonto = alle.map((q) => stundenkonto(m, q, ym)).filter((k) => k !== null);
  const schnittKto = mitKonto.reduce((a, k) => a + k, 0) / (mitKonto.length || 1);

  if (p.springer) g.push({ art: "plus", text: "Springerpool — für genau solche Fälle vorgesehen" });
  if (kto === null) g.push({ art: "hinweis", text: `Stundenkonto und Auslastung: ${ISTDATEN_TEXT}` });
  else if (kto < schnittKto - 4) g.push({ art: "plus",
    text: `Stundenkonto ${sgn(kto)} h liegt unter dem Mittel (${sgn(Math.round(schnittKto))} h)` });
  else if (kto > schnittKto + 8) g.push({ art: "minus",
    text: `Stundenkonto ${sgn(kto)} h liegt bereits deutlich über dem Mittel` });
  if (au.pct === null) { /* siehe oben */ }
  else if (au.pct < 85) g.push({ art: "plus", text: `Auslastung ${au.pct} % — Luft nach oben` });
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
   AUSSTIEGSSICHERHEIT
   Wer seine Dienstplanung auf ein System stellt, muss jederzeit vollständig
   wieder herauskommen. Das ist kein Zugeständnis, sondern Voraussetzung für
   Vertrauen — und beantwortet die Frage nach der Abhängigkeit vom Anbieter.
   ========================================================================== */
export function vollExport(m) {
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
      notiz: v.notiz || "", status: zurPruefung(v) ? pruefFallText(istUngeplant(v) ? "ungeplant" : "lang") : v.bestaetigt ? (istUngeplant(v) ? UNGEPLANT_TEXT + ", bestätigt" : "bestätigt") : "offen" };
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
export function tabelleCSV(zeilen) {
  if (!zeilen.length) return "";
  const spalten = Object.keys(zeilen[0]);
  /* Text gegen Formel-Injection (csvText, SI-02), Zahlen unverändert. */
  const feld = (v) => (typeof v === "number" ? csvFeld(v) : csvText(v));
  return "\uFEFF" + [spalten.map(csvText).join(";"),
    ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(";"))].join("\r\n");
}
/* --------------------------------------------------------------------------
   STANDORTWAHL

   Ein Betrieb mit mehreren Standorten sah bis hierher überall aus wie
   einer: Die Personalliste führte alle Häuser untereinander, der
   Monatsplan reihte alle Einheiten aneinander, und wer für Hannover
   plante, musste Frankfurt mitlesen.

   Die Zugehörigkeit lag längst vor — eine Einheit steht an einem
   Standort, eine Person gehört zu einer Einheit. Gefehlt hat nur der
   Schalter, der daraus eine Auswahl macht.

   Sichtbar wird er erst ab dem zweiten Standort. Ein Betrieb mit einem
   Haus soll nicht eine Auswahl bedienen müssen, die nur eine Möglichkeit
   kennt.
   -------------------------------------------------------------------------- */
export const ALLE_STANDORTE = "alle";

/** Hat dieser Betrieb überhaupt mehr als einen Standort? */
export const mehrereStandorte = (m) => (((m && m.standorte) || []).length > 1);

/**
 * Die Einheiten eines Standorts.
 *
 * Einheiten ohne `standortId` gehören zum ersten Standort — so war es
 * schon in der Preisberechnung und in `jeStandort()` festgelegt, und zwei
 * verschiedene Antworten auf dieselbe Frage wären schlimmer als eine
 * unvollkommene.
 */
export function einheitenAmStandort(m, standortId) {
  const alle = (m && m.einheiten) || [];
  if (!standortId || standortId === ALLE_STANDORTE) return alle;
  const erster = (((m && m.standorte) || [])[0] || {}).id;
  return alle.filter((e) => (e.standortId || erster) === standortId);
}

/** Gehört diese Person am Stichtag zum gewählten Standort? */
export function personAmStandort(m, p, standortId, datum) {
  if (!standortId || standortId === ALLE_STANDORTE) return true;
  const ids = new Set(einheitenAmStandort(m, standortId).map((e) => e.id));
  return ids.has(einheitAm(p, datum));
}
