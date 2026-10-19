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

   SCHULD (Datenschutz): Für die Schutzprüfung (MuSchG, JArbSchG, SGB IX,
   § 6 ArbZG) liest die Oberfläche Mutterschutz, Schwerbehinderung,
   Geburtstag und Nachtvorsorge roh. Langfristig soll die Schichtverantwortung
   stattdessen abgeleitete Aussagen aus einer Plan-/Entscheidungslogik
   bekommen („Nachtdienst nicht zulässig", „besondere Schutzprüfung
   erforderlich") — nicht die Gesundheitsmerkmale selbst.

   SCHULD (Bereich): Dienstbuch, Übergaben und Tagesnotizen bekommt die
   Schichtverantwortung vorerst vollständig. Sie tragen Bewohner- und
   Vorfallsangaben ohne Bereichsbezug; sie brauchen eine einheitId bzw.
   bereichId und eine serverseitige Filterung, bevor sie gekürzt werden
   können. Die übrigen Sammlungen des Betriebs folgen in Commit 1e.2.
   ------------------------------------------------------------------------ */

/** Wie weit um heute die Zugehörigkeit zum Bereich zählt. Zentral, damit
    spätere Ansichten oder Branchen ein anderes Fenster wählen können. */
export const SICHTFENSTER = { vorTage: 60, nachTage: 90 };

const SCHUTZMERKMALE = ["mutterschutz", "schwerbehindert", "geburtstag", "nachtvorsorge"];
const BEREICH_PERSON = [...PLAN, "bereich", "kompetenzNachweise", "einschraenkungen",
  "verfuegbarkeit", "wunschfrei", "stundenuebertrag", "urlaubsanspruch", "urlaubsuebertrag",
  "einarbeitung", ...SCHUTZMERKMALE, "telefon", "mobil"];
const POOL_PERSON = [...PLAN, "bereich", "kompetenzNachweise", "einschraenkungen",
  "verfuegbarkeit", ...SCHUTZMERKMALE, "telefon", "mobil"];
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

/** Eine Person in der Sicht der Schichtverantwortung. */
export function schichtPersonSicht(p, ctx) {
  if (!p || typeof p !== "object") return p;
  if (gleich(p.id, ctx.ich)) return { ...nimm(p, EIGENE_PERSON), sichtbereich: "eigen" };
  /* Ohne eigenen Bereich gibt es weder Bereich noch Pool — alles fremd. */
  const umfang = !ctx.eigene ? "fremd"
    : imFenster(p, new Set([ctx.eigene]), ctx.von, ctx.bis) ? "bereich"
      : (imFenster(p, ctx.pool, ctx.von, ctx.bis) || p.springer === true) ? "pool" : "fremd";
  if (umfang === "fremd") return { ...personSicht(p, { ...ctx, rolle: "mitarbeiter" }), sichtbereich: "fremd" };
  const aus = nimm(p, umfang === "bereich" ? BEREICH_PERSON : POOL_PERSON);
  if (Object.prototype.hasOwnProperty.call(p, "qualNachweise")) aus.qualNachweise = nachweiseBereich(p);
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

/** Die Rollen, für die diese Sicht gilt. */
export const SICHT_ROLLEN = ["mitarbeiter", "betriebsrat"];
