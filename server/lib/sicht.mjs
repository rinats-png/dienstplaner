/* ==========================================================================
   SICHT — was Beschäftigte und Betriebsrat über GET /api/bestand bekommen

   Bis Oktober 2026 arbeitete die Leseschicht für diese beiden Rollen nach
   dem Prinzip „alles, außer was ausdrücklich entfernt wird". Jedes neue Feld
   ging damit ungefragt hinaus — so sind Mutterschutz und Schwerbehinderung,
   die Planungsnotiz zur Person, die frühere Anmeldeadresse, die Anmerkung
   einer Krankmeldung, fremde Anträge, Stempelzeiten mit Ortsurteil und die
   Schichtübergaben samt Bewohnerangaben an jede Pflegekraft gegangen. Die
   Oberfläche zeigte davon wenig; die Antwort enthielt alles.

   Jetzt umgekehrt: Ein Katalog entscheidet für jedes Feld des Betriebs und
   jedes Feld einer Person, was die Rolle bekommt. Was nicht im Katalog
   steht, geht nicht hinaus. pruefungen/sicht.test.js schlägt fehl, sobald
   im Quelltext ein Feld auftaucht, für das hier keine Entscheidung steht.

   Für den Schreibweg ändert sich nichts. zusammenfuehren (rechte.mjs) baut
   für beide Rollen immer auf dem gespeicherten Stand auf — der Betriebsrat
   schreibt gar nicht, Beschäftigte nur ihre eigenen Einträge. Was hier
   gekürzt wird, kann beim Zurückschreiben deshalb nicht verloren gehen.
   ========================================================================== */

import { planungsregelnAbleiten } from "./planungsregeln.mjs";

/* Die vier Entscheidungen. Reduziert heißt: Die Regel ist eine Funktion. */
export const VOLL = "voll";
export const NUR_EIGENE = "nurEigene";
export const WEG = "weg";
export const REDUZIERT = "reduziert";

const gleich = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined
  && String(a) === String(b);
const eigen = (e, ich) => !!e && gleich(e.personId, ich);
const eigenerSchluessel = (k, ich) => gleich(String(k).split("|")[0], ich);
const liste = (w) => (Array.isArray(w) ? w : []);
const nimm = (o, felder) => {
  const aus = {};
  for (const f of felder) if (o && Object.prototype.hasOwnProperty.call(o, f)) aus[f] = o[f];
  return aus;
};

/* Sammlungen, die als Objekt geführt werden ("personId|datum" und ähnlich).
   Wird eine davon weggelassen, bleibt ein leeres Objekt stehen — die
   Oberfläche greift an vielen Stellen ungeprüft zu. */
const OBJEKT_SAMMLUNGEN = new Set(["erfassung", "einstempeln", "fahrzeiten", "checks",
  "notizen", "tagesnotizen", "belegung", "therapie", "planstaende", "freigaben",
  "abweichungen"]);

/* ------------------------------------------------------------------------
   PERSONEN
   ------------------------------------------------------------------------ */

/* Was der Plan-Rechenkern an jeder Person braucht: personTag, imDienst,
   einheitAm, teilzeitDienst, Besetzung und Qualifikationsprüfung. Ohne
   diese Felder ist weder der Monatsplan noch die Tauschbörse lesbar. */
const PLAN = ["id", "vorname", "nachname", "funktion", "rolle", "zugehoerigkeit",
  "eintritt", "austritt", "status", "imSchichtdienst", "springer", "teilzeit",
  "wochenstunden", "qualifikationen", "anonym"];

/* Nachweise einer fremden Person: nur Qualifikation und Ablaufdatum. Keine
   Datei, kein `vorhanden` — und Nachweise, die nur einen Status tragen
   (Masernschutz nach § 20 IfSG, Zuverlässigkeit nach § 34a GewO), gar
   nicht. Dieselben Qualifikationen fallen auch aus `qualifikationen`
   heraus, sonst verriete die Zuordnung, was der Nachweis verschweigt. */
function nachweiseFremd(p, ctx) {
  return liste(p.qualNachweise)
    .filter((n) => n && !ctx.nurStatus.has(n.qualId))
    .map((n) => nimm(n, ["qualId", "ablauf"]));
}
function qualifikationenFremd(p, ctx) {
  return liste(p.qualifikationen).filter((q) => !ctx.nurStatus.has(q));
}

/* Die eigene Person: was die Oberfläche der Beschäftigten an ihr liest —
   Plan, Stunden- und Urlaubskonto, die eigenen Prüfungen bei Bewerbung und
   Selbstplanung, die selbst gepflegten Angaben (SELBST_FELDER) und die
   Einstellungen der Anwendung. Nicht dabei: die Notiz der Leitung („nicht
   für die Person selbst"), die frühere Anmeldeadresse und die Rohfelder zu
   Mutterschutz und Schwerbehinderung, die keine Ansicht der Person braucht. */
const EIGENE_PERSON = [...PLAN, "bereich", "qualNachweise", "kompetenzNachweise",
  "einschraenkungen", "verfuegbarkeit", "wunschfrei", "stundenuebertrag",
  "urlaubsanspruch", "urlaubsuebertrag", "email", "telefon", "mobil", "anschrift",
  "notfallkontakt", "zustellung", "pushSchluessel", "kalenderVerweis",
  "kalenderGeheim", "kalenderStand", "weckzeit", "benachrichtigung",
  "kontrastmodus", "feldmodus", "thema", "dichte", "tour", "einfuehrung",
  "handbuch", "startansicht", "wenigerBewegung"];

/* Der Katalog der Personenfelder. Jedes Feld, das irgendwo an einer Person
   geschrieben wird, braucht hier eine Entscheidung — für die eigene Person
   (EIGENE_PERSON) und für fremde Personen je Rolle. */
/** @type {Record<string, string | ((p: any, ctx: any) => any)>} */
const FREMD_MITARBEITER = Object.fromEntries(PLAN.map((f) => [f, VOLL]));
FREMD_MITARBEITER.qualifikationen = qualifikationenFremd;
FREMD_MITARBEITER.qualNachweise = nachweiseFremd;

/* Der Betriebsrat sieht, was Personal, Qualifikationsmatrix, Nachweise und
   Kompetenzen zeigen — dieselben Nachweise wie Beschäftigte, dazu die
   Freigaben je Gerät. */
const FREMD_BETRIEBSRAT = { ...FREMD_MITARBEITER, kompetenzNachweise: VOLL };

/** Alle bekannten Personenfelder — für die Katalogprüfung. Was hier steht
    und weder in EIGENE_PERSON noch in den Fremd-Listen, geht an niemanden
    dieser beiden Rollen. */
export const PERSONENFELDER = [...new Set([...EIGENE_PERSON, "mutterschutz",
  "schwerbehindert", "notiz", "notizen", "emailVorher", "emailGeaendert",
  "nachtvorsorge", "rolleSeit", "rolleVerlauf", "urlaubshinweis", "geburtstag",
  "geburtsdatum", "personalnummer", "iban", "steuerId", "sozialversicherung",
  "notfall", "lohn", "gehalt", "zuschlaege", "einarbeitung", "nachweise",
  "neuerZugang", "anonymSeit", "schutz", "sichtbereich"])];

/* ------------------------------------------------------------------------
   PERSONEN IN DER SICHT DER SCHICHTVERANTWORTUNG

   Bis Oktober 2026 bekam die Schichtverantwortung jede Person des Betriebs
   vollständig: Anschrift, Notfallkontakt, Lohnfelder, die Notiz der Leitung,
   Geheimnisse von Kalender und Push — auch aus fremden Bereichen. Jetzt
   drei Stufen, jede eine Positivliste (was fehlt, geht nicht hinaus):

   - die eigene Person wie bei Beschäftigten (EIGENE_PERSON);
   - Personen des eigenen Bereichs: was Planung, Ersatzsuche, Konten und die
     Schutzprüfung brauchen, dazu Telefon und Mobilnummer für Ausfälle;
   - der Springer-Pool: dasselbe ohne Konten und Wünsche;
   - alle übrigen wie für Beschäftigte (FREMD_MITARBEITER).

   Zum Bereich gehört, wer im Sichtfenster (SICHTFENSTER) irgendwann dort
   zugeordnet ist — Versetzungen im Planungszeitraum bleiben so sichtbar.
   Jede Person trägt `sichtbereich`, damit die Oberfläche weiß, wofür die
   Daten reichen; geschrieben wird das Feld nie (rechte.mjs füllt zurück).

   Schutzmerkmale (Commit S1): Mutterschutz, Schwerbehinderung, Geburtsdatum,
   das Datum der arbeitsmedizinischen Vorsorge und eine Wiedereingliederung
   gehen nicht mehr hinaus. Stattdessen trägt jede Person aus Bereich und
   Pool `planungsregeln` — Einsatzregeln ohne Grund, bei jedem Lesen aus dem
   gespeicherten Datensatz abgeleitet (server/lib/planungsregeln.mjs), nie
   gespeichert. Ein leeres Feld heißt: geprüft, keine Regel.

   Dienstbuch und Übergaben (Commit C2) sowie die Tagesnotizen (Commit C3)
   tragen eine einheitId und gehen nur für die eigene Einheit hinaus.
   ------------------------------------------------------------------------ */

/** Wie weit um heute die Zugehörigkeit zum Bereich zählt. Zentral, damit
    spätere Ansichten oder Branchen ein anderes Fenster wählen können. */
export const SICHTFENSTER = { vorTage: 60, nachTage: 90 };

const BEREICH_PERSON = [...PLAN, "bereich", "kompetenzNachweise", "einschraenkungen",
  "verfuegbarkeit", "wunschfrei", "stundenuebertrag", "urlaubsanspruch", "urlaubsuebertrag",
  "einarbeitung", "telefon", "mobil"];
const POOL_PERSON = [...PLAN, "bereich", "kompetenzNachweise", "einschraenkungen",
  "verfuegbarkeit", "telefon", "mobil"];
/* Einschränkungen: die operativen Regeln (keine Nacht, kein Alleindienst,
   Dienste je Woche) bleiben; die Wiedereingliederung verrät eine Erkrankung
   und geht nur als neutrale Wochenstundengrenze in planungsregeln hinaus. */
const EINSCHRAENKUNGEN_SCHICHT = ["keineNacht", "keinAlleindienst", "maxDiensteWoche"];
/* Nachweise im eigenen Bereich: Qualifikation, Ablauf und — für die
   Status-Nachweise, an denen das Einsatz-Gate hängt — ob er vorliegt.
   Keine Datei. */
const nachweiseBereich = (p) => liste(p.qualNachweise).map((n) => nimm(n, ["qualId", "ablauf", "vorhanden"]));

const tagPlus = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/** War die Person im Fenster [von, bis] irgendwann einer dieser Einheiten zugeordnet? */
function imFenster(p, einheiten, von, bis) {
  const z = liste(p.zugehoerigkeit).filter((x) => x && x.einheitId !== undefined)
    .map((x) => ({ ab: x.ab || "0000-01-01", einheitId: String(x.einheitId) }))
    .sort((a, b) => a.ab.localeCompare(b.ab));
  if (!z.length) return p.bereich !== undefined && einheiten.has(String(p.bereich));
  for (let i = 0; i < z.length; i++) {
    const ende = z[i + 1] ? tagPlus(z[i + 1].ab, -1) : "9999-12-31";
    if (z[i].ab <= bis && ende >= von && einheiten.has(z[i].einheitId)) return true;
  }
  return false;
}

/** Der Kontext der Personensicht: eigener Bereich (aus rechte.mjs), Pool, Fenster. */
export function schichtKontext(m, sitzung, eigene, heute, fenster = SICHTFENSTER) {
  return {
    rolle: "subplaner", ich: sitzung.person, eigene: eigene ? String(eigene) : null,
    pool: new Set(liste(m && m.einheiten).filter((e) => e && e.pool).map((e) => String(e.id))),
    von: tagPlus(heute, -fenster.vorTage), bis: tagPlus(heute, fenster.nachTage),
    nurStatus: new Set(liste(m && m.qualifikationen).filter((q) => q && q.nurStatus).map((q) => q.id)),
  };
}

/** eigen, bereich, pool oder fremd — für die Person selbst und für ihre Einträge. */
export function umfangVon(p, ctx) {
  if (!p || typeof p !== "object") return "fremd";
  if (gleich(p.id, ctx.ich)) return "eigen";
  /* Ohne eigenen Bereich gibt es weder Bereich noch Pool — alles fremd. */
  if (!ctx.eigene) return "fremd";
  if (imFenster(p, new Set([ctx.eigene]), ctx.von, ctx.bis)) return "bereich";
  if (imFenster(p, ctx.pool, ctx.von, ctx.bis) || p.springer === true) return "pool";
  return "fremd";
}

/** Eine Person in der Sicht der Schichtverantwortung. */
export function schichtPersonSicht(p, ctx) {
  if (!p || typeof p !== "object") return p;
  const umfang = umfangVon(p, ctx);
  if (umfang === "eigen") return { ...nimm(p, EIGENE_PERSON), sichtbereich: "eigen" };
  if (umfang === "fremd") return { ...personSicht(p, { ...ctx, rolle: "mitarbeiter" }), sichtbereich: "fremd" };
  const aus = nimm(p, umfang === "bereich" ? BEREICH_PERSON : POOL_PERSON);
  if (Object.prototype.hasOwnProperty.call(p, "qualNachweise")) aus.qualNachweise = nachweiseBereich(p);
  if (aus.einschraenkungen && typeof aus.einschraenkungen === "object" && !Array.isArray(aus.einschraenkungen))
    aus.einschraenkungen = nimm(aus.einschraenkungen, EINSCHRAENKUNGEN_SCHICHT);
  aus.planungsregeln = planungsregelnAbleiten(p, { von: ctx.von });
  aus.sichtbereich = umfang;
  return aus;
}

function personSicht(p, ctx) {
  if (!p || typeof p !== "object") return p;
  if (gleich(p.id, ctx.ich)) return nimm(p, EIGENE_PERSON);
  const katalog = ctx.rolle === "betriebsrat" ? FREMD_BETRIEBSRAT : FREMD_MITARBEITER;
  const aus = {};
  for (const [feld, regel] of Object.entries(katalog)) {
    if (!Object.prototype.hasOwnProperty.call(p, feld)) continue;
    aus[feld] = typeof regel === "function" ? regel(p, ctx) : p[feld];
  }
  return aus;
}

/* ------------------------------------------------------------------------
   EINZELNE SAMMLUNGEN
   ------------------------------------------------------------------------ */

/* Eine fremde Abwesenheit bleibt sichtbar — sonst stimmt die Besetzung
   nicht. Mehr als Zeitraum und Kategorie geht nicht hinaus: kein Grund,
   keine Anmerkung (dort steht die Anmerkung einer Krankmeldung), kein
   Nachweis. Dass jemand fehlt, ist Betriebswissen; warum, ist eine
   Gesundheitsangabe nach Art. 9 DSGVO. */
function abwesenheiten(w, ctx) {
  return liste(w).map((a) => {
    if (!a || eigen(a, ctx.ich)) return a;
    const rein = nimm(a, ["id", "personId", "von", "bis"]);
    rein.art = a.art === "urlaub" || a.art === "frei" ? a.art : "abwesend";
    return rein;
  });
}

/* Anträge: die eigenen ganz. Von fremden nur offene Tauschgesuche ohne
   festen Partner — die Tauschbörse lebt davon, und den Text schreibt die
   Person ausdrücklich für alle. Wer sich gemeldet hat, bleibt verborgen;
   die Börse braucht nur die Zahl und ob die eigene Meldung darunter ist.
   Urlaubs- und Abwesenheitsanträge anderer, ihre Begründungen und die
   Antworten der Leitung gehen nicht hinaus. */
function anfragen(w, ctx) {
  const aus = [];
  for (const a of liste(w)) {
    if (!a) continue;
    if (eigen(a, ctx.ich)) { aus.push(a); continue; }
    if (a.typ !== "tausch" || a.status !== "offen" || a.partnerId) continue;
    const rein = nimm(a, ["id", "typ", "status", "personId", "von", "bis", "text", "erstellt"]);
    rein.partnerId = null;
    rein.interessenten = liste(a.interessenten).map((x, i) =>
      (gleich(x, ctx.ich) ? x : `verborgen-${i}`));
    aus.push(rein);
  }
  return aus;
}

/* Offene Schichten: die Ausschreibung für alle, die Meldungen nur die
   eigene. Namen, Zeitpunkte und Texte der anderen — und daraus abgeleitet
   ihr Stundenkonto und ihre Wünsche in der Rangfolge — gehören der Planung. */
function ausschreibungen(w, ctx) {
  return liste(w).map((a) => {
    if (!a || typeof a !== "object") return a;
    return { ...a, bewerbungen: liste(a.bewerbungen).filter((b) => eigen(b, ctx.ich)) };
  });
}
function ausschreibungenOhneMeldungen(w) {
  return liste(w).map((a) => (a && typeof a === "object" ? { ...a, bewerbungen: [] } : a));
}

/* Jahresurlaubsrunde: Kopf für alle, Wünsche nur die eigenen. */
function urlaubsrunde(w, ctx) {
  if (!w || typeof w !== "object") return w;
  const rein = { ...w, wuensche: liste(w.wuensche).filter((x) => eigen(x, ctx.ich)) };
  if (Array.isArray(w.vorjahrZurueck))
    rein.vorjahrZurueck = w.vorjahrZurueck.filter((x) => gleich(x && x.personId !== undefined ? x.personId : x, ctx.ich));
  return rein;
}

/* Selbstplanung: Die Runde für alle. Fremde Einträge ohne Person und Zeit —
   die Deckelung zählt sie je Tag und Dienst, wer es war, braucht sie nicht. */
function selbstplanung(w, ctx) {
  return liste(w).map((r) => (r && typeof r === "object" ? { ...r,
    eintraege: liste(r.eintraege).map((e) => (eigen(e, ctx.ich) ? e
      : nimm(e, ["datum", "dienstId"]))) } : r));
}

/* Kompetenzen: der Katalog für alle, die Zuordnung `zugedacht` nur, soweit
   sie die eigene Person betrifft. */
function kompetenzenMitarbeiter(w, ctx) {
  return liste(w).map((k) => (k && Array.isArray(k.zugedacht)
    ? { ...k, zugedacht: k.zugedacht.filter((x) => gleich(x, ctx.ich)) } : k));
}

/* Einarbeitung: wer eingearbeitet wird oder begleitet. */
function einarbeitungEigen(w, ctx) {
  return liste(w).filter((e) => e && (gleich(e.personId, ctx.ich) || gleich(e.mentorId, ctx.ich)));
}

/* Betriebsmittel: was man selbst hat und was frei ist — nicht, wer welchen
   Schlüssel oder welches Fahrzeug trägt. */
function betriebsmittelEigen(w, ctx) {
  return liste(w).filter((b) => b && (b.personId === null || b.personId === undefined
    || b.personId === "" || gleich(b.personId, ctx.ich)));
}

/* Sondereinsätze: nur die, denen man zugeteilt ist; ohne Auftraggeber und
   Kostenstelle. */
function sondereinsaetzeEigen(w, ctx) {
  return liste(w)
    .filter((s) => s && liste(s.zugeteilt).some((x) => gleich(x && x.personId !== undefined ? x.personId : x, ctx.ich)))
    .map((s) => { const r = { ...s }; delete r.auftraggeber; delete r.kostenstelle; return r; });
}

/* Standorte: Name und Land (Feiertage), keine Koordinaten und kein Radius.
   Ob ein Stempel am Einsatzort liegt, entscheidet der Server. */
function standorte(w) {
  return liste(w).map((s) => nimm(s, ["id", "name", "land", "bundesland"]));
}

/* Zeiterfassung für den Betriebsrat: Zeiten für Prüfung und Verteilung,
   ohne den freien Korrekturgrund. */
function erfassungOhneGrund(w) {
  const aus = {};
  for (const [k, v] of Object.entries(w && typeof w === "object" ? w : {}))
    aus[k] = nimm(v, ["start", "ende", "bestaetigt", "pause"]);
  return aus;
}

/* ------------------------------------------------------------------------
   DER KATALOG DER BETRIEBSFELDER
   Je Feld: [mitarbeiter, betriebsrat].
   ------------------------------------------------------------------------ */
const R = (fn) => ({ art: REDUZIERT, fn });

export const BETRIEB = {
  /* Stammdaten und Regelwerk — ohne sie rechnet kein Plan. */
  id: [VOLL, VOLL], name: [VOLL, VOLL], branche: [VOLL, VOLL],
  bundesland: [VOLL, VOLL], einheitLabel: [VOLL, VOLL], einheiten: [VOLL, VOLL],
  dienstarten: [VOLL, VOLL], zyklus: [VOLL, VOLL], anker: [VOLL, VOLL],
  zyklusLaenge: [VOLL, VOLL], gruppen: [VOLL, VOLL], versatzTageVon: [VOLL, VOLL],
  zuschlaege: [VOLL, VOLL], einstellungen: [VOLL, VOLL], rollennamen: [VOLL, VOLL],
  /* Die Oberfläche richtet Navigation und Knöpfe danach (darf → m.matrix). */
  matrix: [VOLL, VOLL],
  briefing: [VOLL, VOLL], aufgaben: [VOLL, VOLL], qualifikationen: [VOLL, VOLL],
  genehmigungsstufen: [VOLL, VOLL], tarifwerk: [VOLL, VOLL], session: [VOLL, VOLL],
  version: [VOLL, VOLL], stand: [VOLL, VOLL],
  /* Gebuchte Pakete steuern, welche Ansichten es gibt (kann()). */
  pakete: [VOLL, VOLL],
  /* Die Leiste „Testphase endet" sehen alle. */
  status: [VOLL, VOLL], stichtag: [VOLL, VOLL], laeuftAb: [VOLL, VOLL],

  /* Der Plan selbst. */
  abweichungen: [VOLL, VOLL], planstaende: [VOLL, VOLL], freigaben: [VOLL, VOLL],
  unterschreitungen: [VOLL, VOLL], belegung: [VOLL, VOLL], therapie: [VOLL, VOLL],
  aushang: [VOLL, VOLL],
  standorte: [R(standorte), R(standorte)],

  /* Personen und personenbezogene Sammlungen. */
  personen: [R((w, ctx) => liste(w).map((p) => personSicht(p, ctx))),
    R((w, ctx) => liste(w).map((p) => personSicht(p, ctx)))],
  abwesenheiten: [R(abwesenheiten), R(abwesenheiten)],
  anfragen: [R(anfragen), WEG],
  wuensche: [NUR_EIGENE, WEG],
  einspruenge: [NUR_EIGENE, WEG],
  ausschreibungen: [R(ausschreibungen), R(ausschreibungenOhneMeldungen)],
  urlaubsrunde: [R(urlaubsrunde), WEG],
  selbstplanung: [R(selbstplanung), WEG],
  nachrichten: [NUR_EIGENE, NUR_EIGENE],
  notrufe: [NUR_EIGENE, NUR_EIGENE],
  erfassung: [NUR_EIGENE, R(erfassungOhneGrund)],
  einstempeln: [NUR_EIGENE, WEG],
  fahrzeiten: [NUR_EIGENE, WEG],
  checks: [NUR_EIGENE, WEG],
  ansichten: [NUR_EIGENE, NUR_EIGENE],
  kompetenzen: [R(kompetenzenMitarbeiter), VOLL],
  einarbeitung: [R(einarbeitungEigen), VOLL],
  betriebsmittel: [R(betriebsmittelEigen), WEG],
  sondereinsaetze: [R(sondereinsaetzeEigen), WEG],
  /* Freigabeleiste und Verteilung zeigen Planänderungen mit Vorlauf. */
  aenderungen: [WEG, VOLL],

  /* Inhalte ohne belegten Bedarf dieser Rollen. Übergaben und Dienstbuch
     tragen Bewohner- und Vorfallsangaben ohne Bereichsbezug; das
     Betriebsprotokoll hat für den Betriebsrat (noch) keine Ansicht. */
  dienstbuch: [WEG, WEG], uebergaben: [WEG, WEG], protokoll: [WEG, WEG],
  notizen: [WEG, WEG], tagesnotizen: [WEG, WEG],
  /* Gehört dem Betreiber, nicht dem Betrieb: alte und neue Anmeldeadressen. */
  adressAenderungen: [WEG, WEG],

  /* Kaufmännisches und Vertragliches. */
  tarif: [WEG, WEG], seit: [WEG, WEG], bis: [WEG, WEG], testTage: [WEG, WEG],
  selbstAngelegt: [WEG, WEG], preisgestaltung: [WEG, WEG], rabattGrund: [WEG, WEG],
  kontakt: [WEG, WEG], kontaktName: [WEG, WEG], anschrift: [WEG, WEG],
  ustId: [WEG, WEG], notiz: [WEG, WEG], raum: [WEG, WEG], lohnarten: [WEG, WEG],
  aufbewahrung: [WEG, WEG],

  /* Altnamen aus früheren Fassungen, von keiner Ansicht gelesen. */
  aushaenge: [WEG, WEG], checklisten: [WEG, WEG], listeneintraege: [WEG, WEG],
};

/* Ganz oben im Bestand: nur Zähler, Sitzungsmarke und der eigene Betrieb. */
const OBEN = ["version", "stand", "session"];

/* ------------------------------------------------------------------------
   ANWENDEN
   ------------------------------------------------------------------------ */

function leerFuer(feld, wert) {
  if (Array.isArray(wert)) return [];
  if (OBJEKT_SAMMLUNGEN.has(feld)) return {};
  return undefined;
}

/** Der Betrieb in der Sicht der Rolle. Unbekannte Felder fallen weg. */
export function betriebSicht(m, sitzung) {
  if (!m || typeof m !== "object") return m;
  const rolle = sitzung.rolle;
  const spalte = rolle === "betriebsrat" ? 1 : 0;
  const ctx = {
    rolle, ich: sitzung.person,
    nurStatus: new Set(liste(m.qualifikationen).filter((q) => q && q.nurStatus).map((q) => q.id)),
  };
  const aus = {};
  for (const [feld, wert] of Object.entries(m)) {
    const eintrag = BETRIEB[feld];
    if (!eintrag) continue;                                // unbekannt: geht nicht hinaus
    const regel = eintrag[spalte];
    let neu;
    if (regel === VOLL) neu = wert;
    else if (regel === WEG) neu = leerFuer(feld, wert);
    else if (regel === NUR_EIGENE) {
      if (Array.isArray(wert)) neu = wert.filter((e) => eigen(e, ctx.ich));
      else if (wert && typeof wert === "object")
        neu = Object.fromEntries(Object.entries(wert).filter(([k]) => eigenerSchluessel(k, ctx.ich)));
      else neu = leerFuer(feld, wert);
    } else neu = regel.fn(wert, ctx);
    if (neu !== undefined) aus[feld] = neu;
  }
  return aus;
}

/** Der Bestand in der Sicht der Rolle: oben nur das Nötigste, darunter der
    eigene Betrieb. */
export function bestandSicht(bestand, sitzung, eigener) {
  const aus = nimm(bestand, OBEN);
  if (eigener) aus.mandanten = [betriebSicht(eigener, sitzung)];
  return aus;
}

/* ------------------------------------------------------------------------
   DIE SAMMLUNGEN IN DER SICHT DER SCHICHTVERANTWORTUNG (Commit 1e.2)

   Je Eintrag entscheidet die Person, zu der er gehört (umfangVon): eigen,
   eigener Bereich, Springer-Pool, fremd. Bereinigt wird über Positivlisten
   (nimm), damit ein neues Feld nicht von selbst hinausgeht. Was nicht im
   Katalog SCHICHT steht, geht nicht hinaus.

   Dienstbuch und Übergaben (C2) und die Tagesnotizen (in `notizen` unter
   „tag|…", C3): nur die eigene Einheit (siehe nurEigeneEinheit,
   schichtNotizen). Die
   Ausschreibungen tragen seit Commit C1 die verantwortende Einheit
   (siehe schichtAusschreibungen).
   ------------------------------------------------------------------------ */
const umfangDer = (ctx, pid) => (gleich(pid, ctx.ich) ? "eigen" : (ctx.umfang.get(String(pid)) || "fremd"));
const imScope = (ctx, pid, erlaubt) => erlaubt.includes(umfangDer(ctx, pid));
const schluesselPerson = (k) => String(k).split("|")[0];
const objektFilter = (w, fn) => Object.fromEntries(Object.entries(w && typeof w === "object" ? w : {})
  .map(([k, v]) => [k, fn(k, v)]).filter(([, v]) => v !== undefined));

/* Abwesenheiten: eigene ganz; im Bereich Zeitraum und Kategorie, keine
   Anmerkung; sonst wie für Beschäftigte („abwesend"). */
const schichtAbwesenheiten = (w, ctx) => liste(w).map((a) => {
  if (!a) return a;
  const u = umfangDer(ctx, a.personId);
  if (u === "eigen") return a;
  if (u === "bereich") return nimm(a, ["id", "personId", "art", "von", "bis"]);
  return abwesenheiten([a], { ...ctx, ich: undefined })[0];
});
/* Anträge: eigene und aus dem Bereich ganz (sie entscheidet sie), sonst
   wie für Beschäftigte (nur offene Tauschgesuche, Meldungen verborgen). */
const schichtAnfragen = (w, ctx) => {
  const eigeneOderBereich = (a) => imScope(ctx, a.personId, ["eigen", "bereich"]);
  const rest = new Map(anfragen(liste(w).filter((a) => a && !eigeneOderBereich(a)), ctx).map((a) => [a.id, a]));
  return liste(w).filter((a) => a && (eigeneOderBereich(a) || rest.has(a.id)))
    .map((a) => (eigeneOderBereich(a) ? a : rest.get(a.id)));
};
/* Zeiterfassung: eigene ganz; im Bereich die Zeiten ohne freien Grund. */
const schichtErfassung = (w, ctx) => objektFilter(w, (k, v) => {
  const u = umfangDer(ctx, schluesselPerson(k));
  if (u === "eigen") return v;
  if (u === "bereich") return nimm(v, ["start", "ende", "bestaetigt", "pause"]);
  return undefined;
});
const schichtSchluessel = (erlaubt) => (w, ctx) => objektFilter(w, (k, v) =>
  (imScope(ctx, schluesselPerson(k), erlaubt) ? v : undefined));
const schichtEintraege = (erlaubt, felder) => (w, ctx) => liste(w)
  .filter((e) => e && imScope(ctx, e.personId, erlaubt))
  .map((e) => (gleich(e.personId, ctx.ich) ? e : nimm(e, felder)));
/* Änderungen: zu Personen im Bereich oder Pool, und die ohne Person
   (Anfragen der Planung je Tag und Dienst). Nur die bekannten Felder. */
const AENDERUNG = ["id", "personId", "datum", "von", "nach", "zeit", "regelstand", "vorlauf"];
const schichtAenderungen = (w, ctx) => liste(w)
  .filter((e) => e && (e.personId === null || e.personId === undefined || imScope(ctx, e.personId, ["eigen", "bereich", "pool"])))
  .map((e) => nimm(e, AENDERUNG));
/* Notrufe: eigene, an sie gerichtete, aus dem eigenen Bereich. */
const schichtNotrufe = (w, ctx) => liste(w).filter((n) => n && (imScope(ctx, n.personId, ["eigen", "bereich"])
  || liste(n.empfaenger).some((x) => gleich(x, ctx.ich))));
/* Selbstplanung: Einträge aus dem Bereich mit Person, sonst wie für Beschäftigte. */
const schichtSelbstplanung = (w, ctx) => liste(w).map((r) => (r && typeof r === "object" ? { ...r,
  eintraege: liste(r.eintraege).map((e) => (e && imScope(ctx, e.personId, ["eigen", "bereich"]) ? e
    : nimm(e, ["datum", "dienstId"]))) } : r));
/* Urlaubsrunde: Kopf, Wünsche aus dem Bereich und die eigenen
   (Überschneidungen im Bereich), ohne andere Bereiche. */
const schichtUrlaubsrunde = (w, ctx) => {
  if (!w || typeof w !== "object") return w;
  const rein = { ...w, wuensche: liste(w.wuensche).filter((x) => x && imScope(ctx, x.personId, ["eigen", "bereich"])) };
  if (Array.isArray(w.vorjahrZurueck))
    rein.vorjahrZurueck = w.vorjahrZurueck.filter((x) => imScope(ctx, x && x.personId !== undefined ? x.personId : x, ["eigen", "bereich"]));
  return rein;
};
const schichtKompetenzen = (w, ctx) => liste(w).map((k) => (k && Array.isArray(k.zugedacht)
  ? { ...k, zugedacht: k.zugedacht.filter((x) => imScope(ctx, x, ["eigen", "bereich", "pool"])) } : k));
const schichtEinarbeitung = (w, ctx) => liste(w).filter((e) => e
  && (imScope(ctx, e.personId, ["eigen", "bereich"]) || gleich(e.mentorId, ctx.ich)));
const schichtBetriebsmittel = (w, ctx) => liste(w).filter((b) => b && (b.personId === null
  || b.personId === undefined || b.personId === "" || imScope(ctx, b.personId, ["eigen", "bereich"])));
const schichtSondereinsaetze = (w, ctx) => liste(w).filter((s) => s && liste(s.zugeteilt)
  .some((x) => imScope(ctx, x && x.personId !== undefined ? x.personId : x, ["eigen", "bereich"])));
/* Ausschreibungen (Commit C1): fachlich betriebsweit, der Kopf ist für alle
   sichtbar wie bei Beschäftigten. `einheitId` ist allein die verantwortende
   Einheit. Nur bei einer Ausschreibung der eigenen Einheit gehen alle
   Bewerbungen hinaus — auch die von Pool- oder fremden Personen, denn diese
   Ausschreibung entscheidet die Schichtverantwortung. Sonst (fremde Einheit,
   null, Altbestand ohne einheitId) nur die eigene Bewerbung; nicht etwa die
   von Personen des eigenen Bereichs. Der Pool ist kein eigener Bereich. */
export const ausschreibungDerEinheit = (a, eigene) => !!a && eigene !== null && eigene !== undefined
  && a.einheitId !== undefined && a.einheitId !== null && String(a.einheitId) === String(eigene);
const schichtAusschreibungen = (w, ctx) => liste(w).map((a) => {
  if (!a || typeof a !== "object") return a;
  return ausschreibungDerEinheit(a, ctx.eigene) ? a
    : { ...a, bewerbungen: liste(a.bewerbungen).filter((b) => eigen(b, ctx.ich)) };
});
/* Dienstbuch und Übergaben (Commit C2): nur Einträge mit einheitId der
   eigenen Einheit. Fremde Einheit, Pool-Einheit, null (betriebsweit, Sache
   der Planung) und Altbestand ohne einheitId gehen nicht hinaus — es wird
   nichts abgeleitet (fail-closed). Ist die eigene Einheit selbst eine
   Pool-Einheit, gilt nichts als eigen. */
export const eigeneEinheitNutzbar = (eigene, pool) => eigene !== null && eigene !== undefined && !pool.has(String(eigene));
export const eintragDerEinheit = (e, eigene) => !!e && typeof e === "object" && e.einheitId !== undefined
  && e.einheitId !== null && String(e.einheitId) === String(eigene);
const nurEigeneEinheit = (w, ctx) => (eigeneEinheitNutzbar(ctx.eigene, ctx.pool)
  ? liste(w).filter((e) => eintragDerEinheit(e, ctx.eigene)) : []);
/* notizen: „tag|…" sind die Tagesnotizen — seit Commit C3 nur die Einträge
   der eigenen Einheit (wie Dienstbuch und Übergaben; fremde, Pool, null und
   Altbestand ohne einheitId nicht). Ein Tag ohne sichtbaren Eintrag fällt
   ganz weg. „person|…" sind Notizen zu einzelnen Personen — weg. */
const schichtNotizen = (w, ctx) => objektFilter(w, (k, v) => {
  if (!String(k).startsWith("tag|")) return undefined;
  const sichtbar = nurEigeneEinheit(v, ctx);
  return sichtbar.length ? sichtbar : undefined;
});

/** Je Betriebsfeld die Regel für die Schichtverantwortung. Ausgangspunkt
    ist die Spalte der Beschäftigten, wo sie Vollständiges oder nichts
    vorsieht; personenbezogene Sammlungen haben eigene Regeln. */
export const SCHICHT = Object.fromEntries(Object.entries(BETRIEB).map(([feld, [ma]]) => [feld, ma]));
Object.assign(SCHICHT, {
  personen: "personen",
  abwesenheiten: R(schichtAbwesenheiten),
  anfragen: R(schichtAnfragen),
  erfassung: R(schichtErfassung),
  einstempeln: NUR_EIGENE,
  wuensche: R(schichtEintraege(["eigen", "bereich"], ["id", "personId", "datum", "art"])),
  einspruenge: R(schichtEintraege(["eigen", "bereich", "pool"], ["id", "personId", "datum", "dienstId", "zeit"])),
  fahrzeiten: R(schichtSchluessel(["eigen", "bereich", "pool"])),
  checks: NUR_EIGENE,
  ansichten: NUR_EIGENE,
  nachrichten: NUR_EIGENE,
  notrufe: R(schichtNotrufe),
  aenderungen: R(schichtAenderungen),
  selbstplanung: R(schichtSelbstplanung),
  ausschreibungen: R(schichtAusschreibungen),
  urlaubsrunde: R(schichtUrlaubsrunde),
  kompetenzen: R(schichtKompetenzen),
  einarbeitung: R(schichtEinarbeitung),
  betriebsmittel: R(schichtBetriebsmittel),
  sondereinsaetze: R(schichtSondereinsaetze),
  dienstbuch: R(nurEigeneEinheit), uebergaben: R(nurEigeneEinheit),
  /* Totes Feld (keine Ansicht liest oder schreibt es) — nicht ausliefern (C3). */
  tagesnotizen: WEG,
  notizen: R(schichtNotizen),
});

/** Der Betrieb in der Sicht der Schichtverantwortung. ctx aus schichtKontext. */
export function betriebSichtSchicht(m, ctx) {
  if (!m || typeof m !== "object") return m;
  const c = { ...ctx, umfang: new Map(liste(m.personen).filter(Boolean).map((p) => [String(p.id), umfangVon(p, ctx)])) };
  const aus = {};
  for (const [feld, wert] of Object.entries(m)) {
    const regel = SCHICHT[feld];
    if (!regel) continue;                                  // unbekannt: geht nicht hinaus
    let neu;
    if (regel === "personen") neu = liste(wert).map((p) => schichtPersonSicht(p, c));
    else if (regel === VOLL) neu = wert;
    else if (regel === WEG) neu = leerFuer(feld, wert);
    else if (regel === NUR_EIGENE) {
      if (Array.isArray(wert)) neu = wert.filter((e) => eigen(e, c.ich));
      else if (wert && typeof wert === "object")
        neu = Object.fromEntries(Object.entries(wert).filter(([k]) => eigenerSchluessel(k, c.ich)));
      else neu = leerFuer(feld, wert);
    } else neu = /** @type {any} */ (regel).fn(wert, c);
    if (neu !== undefined) aus[feld] = neu;
  }
  return aus;
}

/** Ganz oben im Bestand: nur Zähler, Sitzungsmarke und der eigene Betrieb. */
export const OBEN_FELDER = OBEN;

/* ------------------------------------------------------------------------
   DIE SICHT DES BETREIBERS (Commit D1)

   Bis Commit D1 bekam der Betreiber den ganzen Raum ungefiltert: Gesundheits-
   und Schutzmerkmale, Krankmeldungen mit Notiz, Bank-, Steuer- und
   Lohndaten, Notfallkontakte, Namen und Kontaktdaten, Notizen der Leitung,
   Kalender- und Push-Geheimnisse, Pläne, Zeiten, Anträge, Nachrichten,
   Notrufe, Dienstbuch und Übergaben aller Betriebe — und jedes neue Feld.
   Seine Konsole zeigt davon nichts; sie rechnet Preise, Zuschläge und
   Rechnungen aus wenigen Angaben. Wer Software verkauft, führt den Betrieb
   nicht (§ 3 AV-Vertrag).

   Jetzt eine Positivliste, Objekt für Objekt neu gebaut — was nicht darin
   steht, geht nicht hinaus, auch kein neues Feld:
   - oben die eigenen Felder des Betreibers (BETREIBER_OBEN);
   - je Betrieb das Kaufmännische, Einheiten, Standorte, die Zahl der
     Dienstarten, der Zeitpunkt der letzten Änderung und die
     Adressänderungen — Letztere als funktionale Ausnahme: Die Konsole
     erkennt daran Kontoübernahmen; eine allgemeine Personalberechtigung
     folgt daraus nicht;
   - je Person nur das Gerüst für die Abrechnung: Rolle (auch im Verlauf),
     Status, Ein- und Austritt, Zugehörigkeit — ohne Namen, Kontakt-,
     Gesundheits- oder Lohndaten.
   Schreiben nimmt der Server vom Betreiber ohnehin nur das Kaufmännische
   an (rechte.mjs, zusammenfuehren) — die gekürzte Sicht überschreibt nichts.
   ------------------------------------------------------------------------ */
const BETREIBER_OBEN = ["version", "stand", "session", "betreiber", "tarife", "rechnungen", "protokoll",
  "pakete", "adressaenderungen", "selbststarts"];
const BETREIBER_BETRIEB = ["id", "raum", "selbstAngelegt", "name", "branche", "status", "tarif", "seit", "bis",
  "stichtag", "testTage", "rabattGrund", "preisgestaltung", "pakete", "kontakt", "kontaktName", "anschrift",
  "ustId", "notiz", "einheitLabel", "rollennamen", "adressAenderungen"];
const BETREIBER_PERSON = ["id", "rolle", "rolleSeit", "status", "eintritt", "austritt"];
const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Eine Person in der Sicht des Betreibers: nur das Gerüst für die Abrechnung. */
export function betreiberPersonSicht(p) {
  if (!istObj(p)) return null;
  const aus = nimm(p, BETREIBER_PERSON);
  aus.zugehoerigkeit = liste(p.zugehoerigkeit).filter(istObj).map((z) => nimm(z, ["ab", "einheitId"]));
  if (Array.isArray(p.rolleVerlauf)) aus.rolleVerlauf = p.rolleVerlauf.filter(istObj).map((z) => nimm(z, ["ab", "rolle"]));
  return aus;
}

/** Ein Betrieb in der Sicht des Betreibers. */
export function betriebSichtBetreiber(m) {
  if (!istObj(m)) return null;
  const aus = nimm(m, BETREIBER_BETRIEB);
  aus.personen = liste(m.personen).filter(istObj).map(betreiberPersonSicht);
  aus.einheiten = liste(m.einheiten).filter(istObj).map((e) => nimm(e, ["id", "name", "standortId", "pool"]));
  aus.standorte = liste(m.standorte).filter(istObj).map((s) => nimm(s, ["id", "name"]));
  aus.dienstarten = liste(m.dienstarten).filter(istObj).map((x) => nimm(x, ["id"]));
  /* Nur der Zeitpunkt der letzten Änderung — die Einträge selbst nennen
     Personen und Vorgänge. */
  aus.protokoll = liste(m.protokoll).filter(istObj).slice(0, 1).map((x) => nimm(x, ["zeit"]));
  return aus;
}

/** Der Bestand in der Sicht des Betreibers: oben seine Felder, darunter
    alle Betriebe des Raums — jeder gekürzt. */
export function bestandSichtBetreiber(bestand) {
  if (!istObj(bestand)) return bestand;
  const aus = nimm(bestand, BETREIBER_OBEN);
  aus.mandanten = liste(bestand.mandanten).filter(istObj).map(betriebSichtBetreiber);
  return aus;
}


/* ------------------------------------------------------------------------
   PLANUNG UND LEITUNG (Commit 1e.3)

   Bis Oktober 2026 bekamen Planung, Leitung und Kundenrolle den eigenen
   Betrieb roh: Kalendergeheimnisse aller Personen, Bank-, Steuer- und
   Lohnfelder, Notfallkontakte, frühere Anmeldeadressen, die Vertrags- und
   Rechnungsangaben des Betreibers samt seiner internen Notiz — und ganz
   oben dessen Preisliste, die Rechnungen aller Betriebe des Raums, Pakete,
   Adressänderungen und Selbststarts. Keine Ansicht dieser Rollen liest
   davon etwas; die Betreiberkonsole ist die einzige.

   Jetzt ein Positivkatalog wie für die übrigen Rollen: Was nicht darin
   steht, geht nicht hinaus — auch kein neues Feld.

   Seit Commit 4 löst der Server Empfänger, Wege und Versand selbst auf
   (versand.mjs). pushSchluessel und zustellung fremder Personen gehen
   deshalb nicht mehr hinaus; beim Speichern kommen sie aus dem
   gespeicherten Stand (vollRueckfuellen). Die E-Mail-Adresse bleibt als
   Kontaktangabe für Planung und Leitung sichtbar (Datenauskunft, Export).
   ------------------------------------------------------------------------ */

/** Was Planung und Leitung an fremden Personen nicht bekommen. */
export const VOLL_PERSON_WEG = ["kalenderGeheim", "kalenderVerweis", "kalenderStand", "pushSchluessel", "zustellung",
  "emailVorher", "emailGeaendert", "iban", "steuerId", "sozialversicherung", "lohn", "gehalt",
  "notfallkontakt"];
/** Fremde Personen: alle bekannten Felder ohne die obigen. */
export const VOLL_PERSON = PERSONENFELDER.filter((f) => !VOLL_PERSON_WEG.includes(f));
/** Was Planung und Leitung im Betrieb nicht bekommen: Vertrag, Rechnungsangaben
    und die interne Notiz des Betreibers, die Raumkennung. */
export const VOLL_BETRIEB_WEG = ["tarif", "preisgestaltung", "rabattGrund", "seit", "bis", "testTage",
  "selbstAngelegt", "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum"];
/** Der Betrieb: alle Felder des Katalogs ohne die obigen. lohnarten bleibt
    (Lohnexport), adressAenderungen vorerst ebenfalls (die Oberfläche schreibt
    sie beim Ändern der eigenen Anmeldeadresse fort). */
export const VOLL_BETRIEB = Object.keys(BETRIEB).filter((f) => !VOLL_BETRIEB_WEG.includes(f));

/** Eine Person in der Sicht von Planung und Leitung. */
export function vollPersonSicht(p, ich) {
  if (!p || typeof p !== "object") return p;
  return nimm(p, gleich(p.id, ich) ? PERSONENFELDER : VOLL_PERSON);
}

/** Der Betrieb in der Sicht von Planung und Leitung. */
export function betriebSichtVoll(m, sitzung) {
  if (!m || typeof m !== "object") return m;
  const aus = nimm(m, VOLL_BETRIEB);
  if (Array.isArray(m.personen)) aus.personen = m.personen.map((p) => vollPersonSicht(p, sitzung.person));
  return aus;
}

/** Die Rollen, für die diese Sicht gilt. */
export const SICHT_ROLLEN = ["mitarbeiter", "betriebsrat"];
