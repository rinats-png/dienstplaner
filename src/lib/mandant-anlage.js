/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { RADIUS_VORGABE } from "../../server/lib/geo.mjs";
import { addDays, montag } from "../regelwerk.js";
import { heute } from "./datum.js";
import { uid } from "./format.js";
import { BRANCHEN, PALETTE, DIENST_VORLAGEN, MODELLE } from "./fachlogik.js";
import { ROLLEN, MATRIX_STD } from "./rollen.js";
import { zustellungStandard } from "./zustellung.js";


/** Ein Betrieb ohne Daten, aber mit brauchbaren Voreinstellungen. */
export function leererMandant(name, branche, anschrift, kontakt) {
  const jetzt = heute();
  const standortId = uid("st");
  const einheitId = uid("e");
  return {
    id: uid("m"), name, branche: branche || "sonstige",
    anschrift: anschrift || "", kontakt: kontakt || "",
    status: "test", seit: jetzt, bis: null, stichtag: 1,
    tarif: "basis", pakete: [], rabattGrund: 0,
    version: 5, stand: 1,

    /* Keine erfundenen Koordinaten: Ein neuer Betrieb wird nie gegen einen
       Ort geprüft, den niemand eingetragen hat. Die Leitung setzt sie in
       „Standorte". */
    standorte: [{ id: standortId, name: name, bundesland: "HE",
      lat: undefined, lon: undefined, radius: RADIUS_VORGABE }],

    /* Gesetzliche Grundwerte. Sie stehen bewusst da, wo sie hingehören —
       nicht auf null, denn null heißt „keine Prüfung", und das merkt
       niemand, bevor es zu spät ist. */
    einstellungen: {
      wochenstunden: 40, ruhezeit: 11, maxFolge: 6, ausgleichsgrenze: 40,
      urlaubsanspruch: 30, pausenregel: "gesetzlich",
      planungsvorlauf: 28, aenderungsvorlauf: 4,
      /* Planfreigabe (WP-23): Beschäftigte sehen Entwürfe nicht. */
      planFreigabePflicht: true,
    },

    einheiten: [{ id: einheitId, name: "Schichtgruppe A", standortId,
      pool: false, farbe: "#017070" }],

    /* Drei übliche Dienstarten. Wer anders fährt, ändert sie — aber
       niemand startet vor einer leeren Liste. */
    dienstarten: [
      { id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "14:00",
        pause: 30, farbe: "#017070", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 2, fr: 2, sa: 1, so: 1 }, mindestQual: {} },
      { id: "S", name: "Spätdienst", kurz: "S", start: "14:00", ende: "22:00",
        pause: 30, farbe: "#955410", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 2, fr: 2, sa: 1, so: 1 }, mindestQual: {} },
      { id: "N", name: "Nachtdienst", kurz: "N", start: "22:00", ende: "06:00",
        pause: 0, farbe: "#316C81", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
    ],

    qualifikationen: [],
    personen: [],
    /* Ein Zyklus mit einer Woche freier Tage. Nicht leer, weil der
       Rechenkern eine Struktur erwartet — und weil ein Plan aus lauter
       freien Tagen ehrlicher ist als gar keiner. */
    zyklus: { wochen: 1, tage: Array.from({ length: 7 }, () => null), vorlage: null },
    zyklusLaenge: 7, gruppen: 1, versatzTageVon: 0, anker: montag(jetzt),
    abwesenheiten: [], abweichungen: {}, erfassung: {}, anfragen: [],
    nachrichten: [], aenderungen: [], freigaben: {}, aushaenge: [],
    uebergaben: [], ausschreibungen: [], checklisten: [], listeneintraege: {},
    betriebsmittel: [], protokoll: [], adressAenderungen: [],
    einheitLabel: "Schichtgruppe",
  };
}

/* --------------------------------------------------------------------------
   ZUGÄNGE
   Beim Anlegen entstehen Personen ohne Namen, die nur den Zugang tragen.
   Sobald jemand sich anmeldet und seinen Namen einträgt, wird daraus eine
   richtige Person.
   -------------------------------------------------------------------------- */

/** Welche Zugänge ein neuer Betrieb mindestens braucht. */
export const START_ZUGAENGE = [
  { rolle: "leitung", label: "Organisationsleitung",
    text: "Richtet den Betrieb ein: Regelwerk, Personal, Qualifikationen." },
  { rolle: "planer", label: "Planung",
    text: "Führt den Plan: Schichtfolge, Lücken, Anträge, Freigabe." },
];

/** Eine Person, die zunächst nur einen Zugang trägt. */
export function zugangsPerson(rolle, einheitId, nummer) {
  const jetzt = heute();
  return {
    id: uid("p"),
    vorname: "", nachname: `Zugang ${nummer}`,
    funktion: ROLLEN.find((r) => r.id === rolle)?.label || rolle,
    email: null, emailGeaendert: null, emailVorher: null,
    zugehoerigkeit: [{ ab: jetzt, einheitId }],
    eintritt: jetzt, austritt: null,
    wochenstunden: 40, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
    qualifikationen: [], qualNachweise: [],
    einschraenkungen: { keineNacht: false, keinAlleindienst: false,
      maxDiensteWoche: null, wiedereingliederung: null },
    teilzeit: null, springer: false,
    rolle, bereich: rolle === "leitung" ? "ALLE" : einheitId,
    verfuegbarkeit: { aktiv: false, raster: Array.from({ length: 21 }, () => true) },
    nachweise: [], kontrastmodus: false,
    /* Die Tour startet beim ersten Anmelden von selbst — genau dafür
       ist sie gedacht. */
    tour: { schritt: 0, gesehen: [], fertig: false, nichtMehr: false, offen: false },
    notiz: "", einarbeitung: null,
    zustellung: zustellungStandard(),
    rolleSeit: jetzt, status: "aktiv",
    /* Die Leitung sitzt im Geschäftszimmer und fährt keine Schicht. */
    imSchichtdienst: rolle !== "leitung" && rolle !== "planer",
    neuerZugang: true,
  };
}

/**
 * Legt einen Mandanten samt Startzugängen an.
 * Gibt den Betrieb und die Personen zurück; die Codes entstehen auf dem
 * Server, weil sie dort als Prüfsumme abgelegt werden.
 */
export function mandantAnlegen({ name, branche, anschrift, kontakt, zusatzRollen }) {
  const m = leererMandant(name, branche, anschrift, kontakt);
  const einheitId = m.einheiten[0].id;
  const rollen = [...START_ZUGAENGE.map((z) => z.rolle), ...(zusatzRollen || [])];
  const personen = rollen.map((r, i) => zugangsPerson(r, einheitId, i + 1));
  return { ...m, personen };
}

/** Alle Zugänge eines Betriebs mit ihrem Stand — für die Betreiberkonsole. */
export function zugangsUebersicht(m) {
  return (m.personen || []).map((p) => ({
    personId: p.id, rolle: p.rolle,
    label: ROLLEN.find((r) => r.id === p.rolle)?.label || p.rolle,
    bezeichnung: p.vorname || p.nachname !== `Zugang ${1}` ? `${p.vorname} ${p.nachname}`.trim() : null,
    email: p.email, emailGeaendert: p.emailGeaendert, emailVorher: p.emailVorher,
    benutzt: !p.neuerZugang || !!p.email || !!(p.tour || {}).gesehen?.length,
    tourFertig: !!(p.tour || {}).fertig,
  }));
}

/* =============================== SELBSTTEST ============================== */
/** Baut einen vollständigen Mandanten aus den Angaben der Anlagemaske. */
export function baueAusAnlage(f) {
const br = BRANCHEN.find((b) => b[0] === f.branche) || BRANCHEN[BRANCHEN.length - 1];
  const mo = MODELLE.find((x) => x.id === f.modellId) || MODELLE[0];
  /* Grundlage, Ebene, Bezug und die Statuskennzeichen wandern mit. Ohne
     sie wäre der Katalog beim Anlegen wieder auf Namen zusammengeschrumpft,
     und die Anwendung hätte keine Rechtsquelle mehr zu nennen. */
  const quals = (f.qualifikationen || []).filter((q) => q.name && q.name.trim())
    .map((q, i) => ({ ...q, id: `q${i + 1}`, name: q.name.trim(),
      kurz: (q.kurz || q.name.slice(0, 2)).toUpperCase(),
      farbe: PALETTE[i % PALETTE.length], gueltigMonate: q.gueltigMonate ?? null,
      nachweisPflicht: !!q.nachweisPflicht }));
  const standorte = (f.standorte || [{ name: "Hauptstandort", land: "HE" }])
    /* Koordinaten trägt erst die Leitung ein — nie ein verschobener Platzhalterpunkt. */
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name || `Standort ${i + 1}`, bundesland: x.land || "HE",
      lat: undefined, lon: undefined, radius: x.radius || RADIUS_VORGABE }));
  // Dienstarten aus dem gewählten Modell ableiten
  const dienstarten = mo.dienste.map((k, i) => {
    const v = DIENST_VORLAGEN[k];
    return { id: v.kurz + (mo.dienste.slice(0, i).some((x) => DIENST_VORLAGEN[x].kurz === v.kurz) ? i : ""),
      name: v.name, kurz: v.kurz, start: v.start, ende: v.ende, pause: 0, farbe: v.farbe,
      ort: standorte[0].name, posten: false, quelle: null, faktor: 1,
      ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 1, fr: 1, sa: mo.vollkonti ? 1 : 0, so: mo.vollkonti ? 1 : 0 }, mindestQual: {} };
  });
  const abbild = Object.fromEntries(mo.dienste.map((k, i) => [k, dienstarten[i].id]));
  const einheiten = Array.from({ length: f.gruppen || mo.gruppen }, (_, i) => ({
    id: uid("e"), name: `${f.einheitLabel} ${i + 1}`, versatz: Math.round((i * mo.versatzTage) / 7),
    versatzTage: i * mo.versatzTage, pool: false, standortId: standorte[0].id,
    farbe: PALETTE[i % PALETTE.length] }));
  const anker = montag(heute());
  const hauptId = uid("p");
  const m = {
    id: uid("m"), name: f.name.trim(), branche: f.branche, einheitLabel: f.einheitLabel,
    bundesland: standorte[0].bundesland, tarif: f.tarif, status: f.status || "test",
    seit: heute(), stichtag: addDays(heute(), f.status === "test" ? (f.testTage || 90) : 30),
    rabattGrund: 0, kontakt: f.kontakt || "", anschrift: f.anschrift || "", ustId: f.ustId || "",
    anker, zyklus: { wochen: Math.ceil(mo.tage.length / 7),
      tage: mo.tage.map((t) => (t && t !== "-" ? abbild[t] : "-")), vorlage: mo.id },
    matrix: JSON.parse(JSON.stringify(MATRIX_STD)),
    einstellungen: { ruhezeit: f.ruhezeit || 11, maxFolge: f.maxFolge || 6, maxNachtFolge: 4,
      maxUrlaubJeEinheit: 3, sollWochenstunden: f.wochenstunden || 40,
      ausgleichGrenze: f.ausgleichGrenze || 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24,
      planFreigabePflicht: true },
    standorte, einheiten, qualifikationen: quals, dienstarten,
    personen: [{ id: hauptId, vorname: (f.kontaktName || "Haupt Zugang").split(" ")[0],
      nachname: (f.kontaktName || "Haupt Zugang").split(" ").slice(1).join(" ") || "Zugang",
      /* Betreiberentscheidung 2026-11-13 (E-Mail): Die Kontaktadresse des Betriebs ist nie die persönliche Adresse der
         ersten Leitungsperson — leer, bis die Person sie selbst einträgt. */
      funktion: "Organisationsleitung", email: "",
      zugehoerigkeit: [{ ab: heute(), einheitId: einheiten[0].id }],
      eintritt: heute(), austritt: null, wochenstunden: f.wochenstunden || 40,
      urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
      qualifikationen: [], qualNachweise: [], teilzeit: null, springer: false,
      einschraenkungen: {}, verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) },
      nachweise: [], kontrastmodus: false, notiz: "", einarbeitung: null,
      benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
      einfuehrung: { erledigt: false, schritt: 0 },
      rolle: "leitung", rolleSeit: heute(), bereich: "ALLE", status: "aktiv", imSchichtdienst: false }],
    abwesenheiten: [], abweichungen: {}, anfragen: [], protokoll: [],
    freigaben: {}, nachrichten: [], aenderungen: [], erfassung: {}, einspruenge: [],
    zuschlaege: (f.zuschlaege || []).map((z, i) => ({ id: `z${i + 1}`, ...z })),
    urlaubsrunde: null, unterschreitungen: [], dienstbuch: [], stand: 0,
    betriebsmittel: [], kompetenzen: [], belegung: {}, aufgaben: [], fahrzeiten: {},
    therapie: {}, aushang: [], einstempeln: {},
    wuensche: [], tagesnotizen: {}, planstaende: {},
  };
  return m;
}
