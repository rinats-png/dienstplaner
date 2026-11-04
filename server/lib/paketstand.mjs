/* ==========================================================================
   PAKETSTAND — was ein Branchenpaket heute tatsächlich nutzbar macht (G9)

   Entscheidung G9 (WP19-PRODUKTENTSCHEIDUNGEN): Was nicht nutzbar ist, wird
   weder als verfügbare Leistung beworben noch verkauft. Ein Paket verkauft
   Merkmale. Ein Merkmal ist nutzbar, wenn

     - es zu keinem Branchenmodul der Registry gehört (bestehende Funktion,
       G10: bleibt unverändert), oder
     - sein Modul die Registry verlassen hat: Status „vorlaeufig" oder
       „freigegeben" UND eine Abnahme { datum, nachweis } laut Statusvertrag
       `pruefeModulStatus` (WP-19.13).

   Ein Paket ohne ein einziges nutzbares Merkmal (heute: Industrie) wird weder
   berechnet noch neu zugebucht, noch zur Buchung angeboten. Ein bereits
   gebuchtes Paket bleibt im Bestand unverändert (nichts wird gelöscht).

   Rein, ohne Ablage. Die Merkmalslisten der Pakete stehen hier und nur hier;
   src/stufen.js liest sie von hier (keine zweite Liste, die driftet).
   ========================================================================== */
import { BRANCHENMODULE, pruefeModulStatus } from "./branchenmodule.mjs";

export const PAKET_MERKMALE = Object.freeze({
  kern: Object.freeze(["plan", "antraege", "zeiten", "konten", "qualifikationen", "export", "sperreGesetz"]),
  sicherheit: Object.freeze(["posten", "wachbuch", "sperreEigen", "geofence", "objektbericht"]),
  pflege: Object.freeze(["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"]),
  klinik: Object.freeze(["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation", "uebergabe", "fachkraftquote"]),
  industrie: Object.freeze(["anlagen", "maschinenqual", "kontimodelle"]),
});

/** Ist das ein bekanntes Paket? Nur eigene Schlüssel (Review N1: kein „constructor“, „toString“, „__proto__“). */
export const paketBekannt = (paketId) => typeof paketId === "string" && Object.hasOwn(PAKET_MERKMALE, paketId);
const merkmaleVon = (paketId) => (paketBekannt(paketId) ? PAKET_MERKMALE[paketId] : []);

/** Ist das Registry-Modul abgenommen (nicht „geplant", Abnahmenachweis stimmig)? */
const modulNutzbar = (x) => x.status !== "geplant" && pruefeModulStatus([x]).length === 0;

/** Ist ein Merkmal heute nutzbar? Merkmale außerhalb der Registry: ja (G10). */
export function merkmalNutzbar(merkmal, liste = BRANCHENMODULE) {
  const ms = liste.filter((x) => x.merkmal === merkmal);
  return ms.length === 0 || ms.some(modulNutzbar);
}

/** Die Merkmale eines Pakets, die noch nicht nutzbar sind. */
export function merkmaleInVorbereitung(paketId, liste = BRANCHENMODULE) {
  return merkmaleVon(paketId).filter((m) => !merkmalNutzbar(m, liste));
}

/** Hat das Paket mindestens ein nutzbares Merkmal? Die Kernplattform immer. */
export function paketNutzbar(paketId, liste = BRANCHENMODULE) {
  if (paketId === "kern") return true;
  const mm = merkmaleVon(paketId);
  return mm.some((m) => merkmalNutzbar(m, liste));
}

/**
 * Selbststart bucht NIE ein Paket still zu (Betreiberentscheidung G9, Review F1): auch ab
 * Zustand 5 bucht der Betreiber bewusst. Die Konstante macht das prüfbar und ist die einzige
 * Stelle, die das ändern würde.
 */
export const SELBSTSTART_BUCHT_PAKET = false;

/**
 * Das Paket, das ein Selbststart für die Branche NEU zubucht — oder null. Heute immer null
 * (SELBSTSTART_BUCHT_PAKET = false); nur wenn jemand die Konstante bewusst umlegt, dann auch
 * nur bei Zustand 5. Bestehende Buchungen fasst das nicht an.
 */
export function paketFuerNeubuchung(paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN,
  bucht = SELBSTSTART_BUCHT_PAKET) {
  return bucht && paketId && paketBuchbar(paketId, liste, freigaben) ? paketId : null;
}

/* ==========================================================================
   PAKETZUSTÄNDE (Betreiberentscheidung G9, 2026-11-03)

   Fünf getrennte Zustände je Paket; nur Zustand 5 darf als verfügbar
   beworben, gewählt, gebucht und regulär berechnet werden. Die Zielpreise
   bleiben (PAKETE[].aufpreis), sie gelten erst ab Zustand 5.

     1 geplant                    mindestens ein Modul des Pakets ist „geplant"
     2 technisch implementiert    kein Modul „geplant", aber der Statusvertrag
                                  (pruefeModulStatus, Abnahme WP-19.13) fehlt
     3 getestet und abgenommen    alle Module mit gültigem Abnahmenachweis
     4 für Kunden freigegeben     + Betreiberfreigabe stufe „kunden"
     5 buchbar und abrechenbar    + Betreiberfreigabe stufe „buchbar"

   Der Zustand wird nur hier aus Registry und Betreiberfreigabe abgeleitet.
   Kein Client und keine Rolle eines Betriebs (Beschäftigte, Leitung,
   Planung) schickt oder setzt ihn: Er steht im Code (PAKET_FREIGABEN, mit
   Datum, Person und Nachweis je Eintrag, geprüft durch Test und Review) und
   läuft nicht über die Daten eines Betriebs. Standard heute für alle vier
   Pakete: keine Freigabe.
   ========================================================================== */
export const PAKET_ZUSTAENDE = Object.freeze({
  1: "geplant", 2: "technisch implementiert", 3: "getestet und abgenommen",
  4: "für Kunden freigegeben", 5: "buchbar und abrechenbar",
});

/**
 * Betreiberfreigaben je Paket: { [paketId]: { stufe: "kunden"|"buchbar", datum, von, nachweis } }.
 * Heute leer: kein Paket ist freigegeben.
 */
export const PAKET_FREIGABEN = Object.freeze({});

/* --------------------------------------------------------------------------
   DATUM UND TEXT (Review M4, N2, N4)

   Ein Tag ist ein echter Kalendertag JJJJ-MM-TT (Jahr 2000–2999): „2026-99-99“,
   „0000-01-01“, „9999-99-99“ und „2026-02-30“ zählen nicht. paketTag() ist der
   Kalendertag in Europe/Berlin — dasselbe Format für den Server (Servertag neuer
   Einträge), paketlogik.js und die Paketstellen in App.jsx. Freitexte (von, grund,
   notiz, nachweis) sind höchstens TEXT_GRENZE Zeichen lang.
   ------------------------------------------------------------------------ */
const TAGFORM = /^\d{4}-\d{2}-\d{2}$/;
export const TEXT_GRENZE = 500;

/** Ist das ein echter Kalendertag JJJJ-MM-TT (Jahr 2000–2999)? */
export function tagGueltig(s) {
  if (typeof s !== "string" || !TAGFORM.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  if (j < 2000 || j > 2999 || m < 1 || m > 12 || t < 1) return false;
  return t <= new Date(Date.UTC(j, m, 0)).getUTCDate();
}

/** Der heutige Kalendertag in Europe/Berlin (Servertag). */
export const paketTag = (jetzt = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);

/** Pflichttext: nicht leer, höchstens TEXT_GRENZE Zeichen. */
const text = (x) => typeof x === "string" && x.trim() !== "" && x.length <= TEXT_GRENZE;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

const freigabeGueltig = (f) => istObjekt(f) && (f.stufe === "kunden" || f.stufe === "buchbar")
  && tagGueltig(f.datum) && text(f.von) && text(f.nachweis);

/** Der Zustand 1–5 eines Pakets. Die Kernplattform ist immer 5. */
export function paketZustand(paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  if (paketId === "kern") return 5;
  if (!paketBekannt(paketId)) return 1;
  const mods = liste.filter((x) => Array.isArray(x.pakete) && x.pakete.includes(paketId));
  if (!mods.length || mods.some((x) => x.status === "geplant")) return 1;
  if (mods.some((x) => pruefeModulStatus([x]).length > 0)) return 2;
  const f = freigaben && typeof freigaben === "object" && Object.hasOwn(freigaben, paketId) ? freigaben[paketId] : undefined;
  if (!freigabeGueltig(f)) return 3;
  return f.stufe === "buchbar" ? 5 : 4;
}

/** Nur Zustand 5: wählbar, buchbar, beworben, berechnet. */
export const paketBuchbar = (paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  paketZustand(paketId, liste, freigaben) === 5;

/** Meldungen zu Betreiberfreigaben: unbekanntes Paket, Form, Freigabe über dem Registry-Zustand. */
export function pruefePaketFreigaben(freigaben = PAKET_FREIGABEN, liste = BRANCHENMODULE) {
  const m = [];
  for (const [id, f] of Object.entries(freigaben || {})) {
    if (!paketBekannt(id) || id === "kern") { m.push(`${id}: unbekanntes Paket`); continue; }
    if (!freigabeGueltig(f)) { m.push(`${id}: Freigabe nur mit stufe, datum, von, nachweis`); continue; }
    if (paketZustand(id, liste, {}) < 3) m.push(`${id}: Freigabe über dem Registry-Zustand (Module nicht abgenommen)`);
  }
  return m;
}

/**
 * Ist der Betrieb im Pilot? Der Betreiber setzt ihn bewusst und je Betrieb:
 * preisgestaltung.pilot = { seit, von, grund } — der Grund ist Pflicht. Kein Standard- und kein
 * Migrationspfad setzt ihn; ein Pilot ohne Grund zählt nicht.
 *
 * Review M5: Ein beendeter Pilot bleibt als Zeitraum in preisgestaltung.pilotHistorie
 * [{ seit, bis, von, grund }]. Für die Abrechnung zählt, ob ein Pilotzeitraum den
 * Rechnungsmonat berührt (pilotImZeitraum), nicht der heutige Stand.
 */
const pilotEintragGueltig = (p) => istObjekt(p) && tagGueltig(p.seit) && text(p.von) && text(p.grund);
const historieGueltig = (h) => pilotEintragGueltig(h) && tagGueltig(h.bis) && h.seit <= h.bis;
const pilotHistorie = (pg) => (istObjekt(pg) && Array.isArray(pg.pilotHistorie) ? pg.pilotHistorie.filter(historieGueltig) : []);

export const pilotAktiv = (m) => pilotEintragGueltig(m && m.preisgestaltung && m.preisgestaltung.pilot);

/** Erster Tag des Folgemonats zu einem Tag JJJJ-MM-TT. */
export function folgemonatsanfang(tag) {
  const [j, m] = String(tag).slice(0, 7).split("-").map(Number);
  return m === 12 ? `${j + 1}-01-01` : `${j}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Berührt ein Pilotzeitraum den Rechnungszeitraum [stichtag, Ende seines Monats]? Laufender Pilot:
 * { seit, bis offen }; Historie: { seit, bis } (bis = Tag des Endes, eingeschlossen). Ohne gültigen
 * Stichtag zählt nur der laufende Pilot.
 */
export function pilotImZeitraum(m, stichtag) {
  const pg = m && m.preisgestaltung;
  if (!tagGueltig(stichtag)) return pilotAktiv(m);
  const ende = folgemonatsanfang(stichtag);
  const zeitraeume = [...pilotHistorie(pg), ...(pilotAktiv(m) ? [{ seit: pg.pilot.seit, bis: null }] : [])];
  return zeitraeume.some((z) => z.seit < ende && (z.bis === null || z.bis >= stichtag));
}

/**
 * Serverregel für preisgestaltung.pilot / pilotHistorie im Betreiber-PUT (Review M4/M5):
 *   - ein NEUER Pilot beginnt am Servertag (seit = heute), Grund und Betreiberkennung vom Client;
 *   - ein laufender Pilot bleibt, wie er gespeichert ist (nicht zurückdatierbar);
 *   - endet er, schreibt der Server { …, bis: heute } in die Historie;
 *   - die Historie ist nur anhängbar: der gespeicherte Stand gilt, Mitgeschicktes nicht.
 * Übrige Felder der Preisgestaltung bleiben, wie der Client sie schickt.
 */
export function pilotNachServerregel(neuPg0, altPg, heute = paketTag()) {
  /* Review N-B: null, Liste, Text, Zahl sind kein Preisgestaltungsobjekt — wie {} behandeln: ein laufender
     Pilot endet mit Servertag, die Historie geht nie verloren. */
  const neuPg = istObjekt(neuPg0) ? neuPg0 : {};
  const altP = pilotEintragGueltig(altPg && altPg.pilot) ? altPg.pilot : null;
  const neuP = pilotEintragGueltig(neuPg.pilot) ? neuPg.pilot : null;
  const hist = pilotHistorie(altPg).map((h) => ({ seit: h.seit, bis: h.bis, von: h.von, grund: h.grund }));
  const aus = { ...neuPg };
  delete aus.pilot;
  delete aus.pilotHistorie;
  if (altP && neuP) aus.pilot = { seit: altP.seit, von: altP.von, grund: altP.grund };
  else if (neuP) aus.pilot = { seit: heute, von: neuP.von.trim(), grund: neuP.grund.trim() };
  else if (altP) hist.push({ seit: altP.seit, bis: heute, von: altP.von, grund: altP.grund });
  if (hist.length) aus.pilotHistorie = hist;
  return aus;
}

/* --------------------------------------------------------------------------
   ABRECHNUNGSGRUND (Betreiberentscheidung 2026-11-03, Punkt 5; Review M1–M4)

   Ein Paket wird nur berechnet, wenn Zustand 5 UND ein Abrechnungsgrund vorliegt:
     (a) ausdrückliche Zustimmung des Kunden: m.paketZustimmungen[] mit
         { paket, datum, preis, intervall, von } — Paket, Preis, wiederkehrende Kosten
         (Intervall) und Bestätiger stehen im Eintrag; oder
     (b) vom Betreiber dokumentierte vertragliche Grundlage JE PAKET MIT PREIS:
         m.paketGrundlage[] mit { paket, datum, preis, intervall, von, notiz }. Eine pauschale
         Grundlage für alle Pakete zählt nicht (Review M2). Ob sie rechtlich wirkt, prüft der
         Betreiber/Jurist (rechtliches/agb.md, § 4 Abs. 4 — hier nicht geändert).
   Ein Grund zählt nur, wenn sein Preis dem AKTUELLEN Aufpreis entspricht (M3) und sein Datum VOR
   dem Stichtag (Beginn des berechneten Zeitraums) liegt: keine rückwirkende Berechnung.
   Abschalten entzieht den Grund des Pakets (M1): Wer wieder zubucht, braucht einen neuen.
   Ohne Grund: nicht berechnet, Hinweis „Zustimmung erforderlich“. Beide Felder sind
   Vertragsfelder (nur der Betreiber schreibt; der Server prüft Form, gebuchtes Paket und setzt
   das Datum neuer Einträge selbst: Servertag, M4).
   ------------------------------------------------------------------------ */
export const ZUSTIMMUNG_INTERVALL = "monatlich";

const grundBasis = (x, paketId) => istObjekt(x) && x.paket === paketId && paketBekannt(paketId) && paketId !== "kern"
  && tagGueltig(x.datum) && typeof x.preis === "number" && Number.isFinite(x.preis) && x.preis > 0
  && x.intervall === ZUSTIMMUNG_INTERVALL && text(x.von);

/** Ist dieser Zustimmungseintrag vollständig und für das Paket? */
export const zustimmungGueltig = (z, paketId) => grundBasis(z, paketId);

/** Ist dieser Grundlageneintrag (je Paket, mit Preis) vollständig und für das Paket? */
export const grundlageGueltig = (g, paketId) => grundBasis(g, paketId) && text(g.notiz);

const liste_ = (x) => (Array.isArray(x) ? x : []);

/**
 * Warum darf dieses Paket berechnet werden — "zustimmung", "vertrag" oder null? Nur ein Grund zum
 * aktuellen Preis (`preis` = Aufpreis des Pakets heute), dessen Datum VOR dem Stichtag liegt, zählt.
 */
export function abrechnungsGrund(m, paketId, stichtag, preis) {
  if (typeof preis !== "number" || !Number.isFinite(preis) || preis <= 0) return null;
  const zaehlt = (x) => x.preis === preis && typeof stichtag === "string" && x.datum < stichtag;
  if (liste_(m && m.paketZustimmungen).some((x) => zustimmungGueltig(x, paketId) && zaehlt(x))) return "zustimmung";
  if (liste_(m && m.paketGrundlage).some((x) => grundlageGueltig(x, paketId) && zaehlt(x))) return "vertrag";
  return null;
}

const ZUSTIMMUNG_FELDER = ["paket", "datum", "preis", "intervall", "von"];
const GRUNDLAGE_FELDER = [...ZUSTIMMUNG_FELDER, "notiz"];

/**
 * Serverregel für Grundeinträge: nur formgültige, höchstens einer je Paket (der erste), nur für
 * gebuchte Pakete (`pakete`, wenn angegeben) und nur die bekannten Felder. Mit `heute`: ein Eintrag,
 * der nicht unverändert gespeichert war (`alt`), bekommt den Servertag als Datum.
 * @param {{ alt?: any, pakete?: any, heute?: string }} [optionen]
 */
function eintraegeBereinigen(liste, gueltig, felder, optionen = {}) {
  const { alt, pakete, heute } = optionen;
  const gesehen = new Set();
  const gespeichert = liste_(alt);
  /* Review N-A: „unverändert“ heißt gleicher Inhalt OHNE das Datum — das Datum des Clients zählt nie. */
  const inhalt = felder.filter((k) => k !== "datum");
  const gleich = (a, b) => istObjekt(a) && inhalt.every((k) => a[k] === b[k]);
  return liste_(liste).filter((x) => {
    if (!istObjekt(x) || !gueltig(x, x.paket) || gesehen.has(x.paket)) return false;
    if (Array.isArray(pakete) && !pakete.includes(x.paket)) return false;
    gesehen.add(x.paket); return true;
  }).map((x) => {
    const e = Object.fromEntries(felder.map((k) => [k, x[k]]));
    if (!heute) return e;
    /* Treffer: der GESPEICHERTE Eintrag samt Datum (nicht nach vorn, nicht zurück datierbar). */
    const treffer = gespeichert.find((a) => gleich(a, e));
    return treffer ? Object.fromEntries(felder.map((k) => [k, treffer[k]])) : { ...e, datum: heute };
  });
}

/** Serverregel Zustimmungen (siehe eintraegeBereinigen). */
export const zustimmungenBereinigen = (liste, optionen) =>
  eintraegeBereinigen(liste, zustimmungGueltig, ZUSTIMMUNG_FELDER, optionen);
/** Serverregel Grundlagen je Paket (siehe eintraegeBereinigen); eine pauschale Grundlage fällt weg. */
export const grundlageBereinigen = (liste, optionen) =>
  eintraegeBereinigen(liste, grundlageGueltig, GRUNDLAGE_FELDER, optionen);

/** Anzeige: „In Vorbereitung (Zustand)“ bzw. Pilot mit nutzbaren und nicht nutzbaren Funktionen. */
export function paketAnzeige(paketId, { pilot = false, zustimmungFehlt = false, liste = BRANCHENMODULE,
  freigaben = PAKET_FREIGABEN } = {}) {
  const z = paketZustand(paketId, liste, freigaben);
  if (z === 5 && !pilot) return zustimmungFehlt ? "Zustimmung erforderlich – nicht berechnet." : "";
  const offen = merkmaleInVorbereitung(paketId, liste);
  if (pilot) {
    const nutzbar = merkmaleVon(paketId).filter((x) => !offen.includes(x));
    const namen = offen.map((x) => (liste.find((y) => y.merkmal === x) || { name: x }).name);
    return `Pilot – freigeschaltet, nicht berechnet (eingeschränkter Umfang): nutzbar: ${nutzbar.join(", ") || "nichts"}; in Vorbereitung: ${namen.join(", ") || "nichts"}.`;
  }
  return `In Vorbereitung (Zustand ${z}: ${PAKET_ZUSTAENDE[z]}). Berechnung ausgesetzt, bis das Paket freigegeben ist.`;
}

/**
 * Darf der Betreiber dieses Paket zubuchen? Zustand 5 immer; darunter nur in einem Betrieb mit
 * aktivem Pilot („freigeschaltet, nicht berechnet", Review F1). Die Kernplattform und unbekannte
 * Pakete nie. Abschalten ist keine Frage dieser Funktion: es geht immer.
 */
export const paketZubuchenErlaubt = (paketId, pilot, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  paketBekannt(paketId) && paketId !== "kern"
  && (paketBuchbar(paketId, liste, freigaben) || !!pilot);

/**
 * Serverregel für den Betreiber-PUT: Die neue Paketliste darf nur Pakete ENTHALTEN, die schon
 * gespeichert waren oder die zubuchbar sind (Zustand 5 oder Pilot). Entfernen ist immer erlaubt.
 * Alles andere fällt auf den gespeicherten Stand zurück. Gibt immer ein Array zurück.
 */
export function paketeNachServerregel(alt, neu, pilot, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const a = Array.isArray(alt) ? alt : [];
  if (!Array.isArray(neu)) return a;
  return neu.filter((id) => a.includes(id) || paketZubuchenErlaubt(id, pilot, liste, freigaben));
}

/**
 * Die eine Serverregel für die Paketfelder eines Betriebs (Betreiber-PUT in rechte.mjs und
 * /api/bestand-anlegen mit eigenem Inhalt). `altM` ist der gespeicherte Betrieb (null: neu).
 * Reihenfolge: Pilot (Servertag, Historie nur anhängbar) → Pakete (unter Zustand 5 nur mit Pilot)
 * → Zustimmungen und Grundlagen (formgültig, nur für gebuchte Pakete, neue mit Servertag).
 * Abschalten eines Pakets entzieht damit auch seinen Abrechnungsgrund (Review M1).
 */
export function paketfelderGeprueft(m0, altM, heute = paketTag()) {
  if (!istObjekt(m0)) return m0;
  const alt = istObjekt(altM) ? altM : {};
  let m = m0;
  if (Object.hasOwn(m, "preisgestaltung"))
    m = { ...m, preisgestaltung: pilotNachServerregel(m.preisgestaltung, alt.preisgestaltung, heute) };
  if (Object.hasOwn(m, "pakete"))
    m = { ...m, pakete: paketeNachServerregel(altM ? altM.pakete : [], m.pakete, pilotAktiv(m)) };
  const pakete = liste_(m.pakete);
  /* Review R1: „unverändert“ gilt nur für gespeicherte Einträge zu Paketen, die schon gebucht waren. */
  const altGebucht = (l) => liste_(l).filter((e) => istObjekt(e) && liste_(alt.pakete).includes(e.paket));
  if (Object.hasOwn(m, "paketZustimmungen"))
    m = { ...m, paketZustimmungen: zustimmungenBereinigen(m.paketZustimmungen, { alt: altGebucht(alt.paketZustimmungen), pakete, heute }) };
  if (Object.hasOwn(m, "paketGrundlage")) {
    const { paketGrundlage, ...rest } = m;
    const g = grundlageBereinigen(paketGrundlage, { alt: altGebucht(alt.paketGrundlage), pakete, heute });
    m = g.length ? { ...rest, paketGrundlage: g } : rest;
  }
  return m;
}

/* --------------------------------------------------------------------------
   VERTRAGSSTAND, PROTOKOLL, KUNDENSICHT (Nachtrag 3, Review N-A, N-E, N-F)
   ------------------------------------------------------------------------ */

/**
 * Die Vertragsfelder der Pakete je Betrieb, wie der Server sie gespeichert hat. Die Antwort auf den
 * Betreiber-PUT trägt sie, damit die Konsole den Serverstand (Servertag, Pilot, Historie) übernimmt.
 */
export const vertragsstandVon = (bestand) => liste_(bestand && bestand.mandanten).filter(istObjekt).map((m) => ({
  id: m.id, pakete: liste_(m.pakete), paketZustimmungen: liste_(m.paketZustimmungen), paketGrundlage: liste_(m.paketGrundlage),
  preisgestaltung: m.preisgestaltung === undefined ? {} : m.preisgestaltung }));

/**
 * Was sich an Paketen, Zustimmungen, Grundlagen und Pilot je Betrieb geändert hat — als Protokollzeilen
 * ohne Freitexte (kein Grund, keine Notiz, keine Namen). `alt` darf null sein (neuer Raum).
 */
export function paketAenderungen(alt, neu) {
  const vorher = new Map(liste_(alt && alt.mandanten).filter(istObjekt).map((m) => [m.id, m]));
  const zeilen = [];
  const pk = (x) => liste_(x && x.pakete).filter((p) => typeof p === "string");
  const laeuft = (x) => pilotAktiv({ preisgestaltung: x && x.preisgestaltung });
  for (const m of liste_(neu && neu.mandanten).filter(istObjekt)) {
    const a = vorher.get(m.id) || {};
    for (const p of pk(m)) if (!pk(a).includes(p)) zeilen.push(`${m.id}: Paket ${p} zugebucht`);
    for (const p of pk(a)) if (!pk(m).includes(p)) zeilen.push(`${m.id}: Paket ${p} abgeschaltet`);
    for (const [feld, wort] of [["paketZustimmungen", "Zustimmung"], ["paketGrundlage", "Grundlage"]]) {
      const eintraege = (x) => liste_(x && x[feld]).filter(istObjekt);
      const schluessel = (e) => `${e.paket}|${e.datum}|${e.preis}`;
      const vor = eintraege(a);
      for (const e of eintraege(m)) if (!vor.some((v) => schluessel(v) === schluessel(e)))
        zeilen.push(`${m.id}: ${wort} zu ${e.paket} festgehalten (${e.preis} € ${e.intervall})`);
      for (const v of vor) if (!eintraege(m).some((e) => e.paket === v.paket)) zeilen.push(`${m.id}: ${wort} zu ${v.paket} entfernt`);
    }
    if (laeuft(m) && !laeuft(a)) zeilen.push(`${m.id}: Pilot gesetzt`);
    if (!laeuft(m) && laeuft(a)) zeilen.push(`${m.id}: Pilot beendet`);
  }
  return zeilen;
}

/**
 * Die Preisgestaltung in der Sicht von Leitung und Kundenrolle (Review N-F): vom Pilot nur Beginn und
 * Ende. Grund und Betreiberkennung sind Betreiberwissen; neutrale Platzhalter halten den Pilot für die
 * Kostenanzeige gültig (pilotAktiv/pilotImZeitraum). Ohne Pilot unverändert.
 */
export function preisgestaltungFuerKunde(pg) {
  if (!istObjekt(pg)) return pg;
  const aus = { ...pg };
  const rest = { von: "Betreiber", grund: "Pilotbetrieb" };
  if (istObjekt(aus.pilot)) aus.pilot = { seit: aus.pilot.seit, ...rest };
  if (Array.isArray(aus.pilotHistorie))
    aus.pilotHistorie = aus.pilotHistorie.filter(istObjekt).map((h) => ({ seit: h.seit, bis: h.bis, ...rest }));
  return aus;
}

/**
 * Review N-D: entfernt aus allen Betrieben eines Bestands Zustimmungen, Grundlagen, Pilot und
 * Pilot-Historie (Vorlage „demo“: Beispielpakete ja, Abrechnungsgrund und Pilot nein). Der Rest bleibt.
 */
export function betriebeOhneAbrechnungsgrund(bestand) {
  if (!istObjekt(bestand) || !Array.isArray(bestand.mandanten)) return bestand;
  return { ...bestand, mandanten: bestand.mandanten.map((m) => {
    if (!istObjekt(m)) return m;
    const { paketZustimmungen, paketGrundlage, ...rest } = m; // eslint-disable-line no-unused-vars
    if (istObjekt(rest.preisgestaltung)) {
      const { pilot, pilotHistorie, ...ohne } = rest.preisgestaltung; // eslint-disable-line no-unused-vars
      rest.preisgestaltung = ohne;
    }
    return rest;
  }) };
}
