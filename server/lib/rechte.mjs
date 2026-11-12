/* ==========================================================================
   RECHTE — serverseitig

   Bis hierher gab es eine sorgfältige Rechteprüfung in der Oberfläche und
   keine auf dem Server. Das ist der gefährlichste Zustand, den ein
   Mehrbenutzersystem haben kann: Es sieht aus, als sei es geschützt.

   Was im Browser läuft, gehört dem Browser. Wer die Anwendung umgeht und
   unmittelbar gegen /api/bestand arbeitet, hat mit einer Zeile den ganzen
   Betrieb — lesend wie schreibend. Diese Datei ist die zweite, echte Prüfung.

   Sie spiegelt MATRIX_STD aus src/App.jsx. Weichen beide voneinander ab,
   gilt diese Datei: Die Oberfläche darf weniger zeigen als der Server
   erlaubt, niemals mehr.
   ========================================================================== */

import { GEO_MODUS_TEXT } from "./geo.mjs";
import { erfassungZusammen, heuteBerlin } from "./zeiterfassung.mjs";
import { abschlussAusGespeichert } from "./monatsabschluss.mjs";
import { RANG, pruefeRollenwechsel } from "./rollenvergabe.mjs";
import { ABGELEITETE_PERSONENFELDER } from "./planungsregeln.mjs";
import { mitteilungenVorfiltern, mitteilungenErzeugen, NOTRUF_ARTEN as NOTRUF_NAMEN, TITEL_MAX,
  TEXT_MAX as MITTEILUNG_TEXT_MAX } from "./mitteilungen.mjs";
import { ABWEICHUNG_GRUENDE, bestaetigungMitteilungen, BEFUND_KATALOG, sperrtBefund,
  BESTAETIGUNGEN_JE_SPEICHERN, BESTAETIGUNGEN_GESAMT, BESTAETIGUNGEN_JE_TAG, schutzKonfliktMitteilungen, schutzEntferntMitteilungen } from "./bestaetigungen.mjs";
import { nichtUebernommenNormal } from "./selbstplanung.mjs";
import { freigegebeneMonate, planFreigabePflicht } from "./planfreigabe.mjs";
import { fachpruefungUebermittlung, sperrendeBefunde, letzteLaufzeit } from "./schutzdurchsetzung.mjs";
import { EINWILLIGUNG_ARTEN } from "./schutzpruefung.mjs";
import { branchenmoduleZusammen, moduleinstellungenVerwerfen } from "./branchenmodule.mjs";
import { paketfelderGeprueft, preisgestaltungFuerKunde } from "./paketstand.mjs";
import { modulSchreibwegeAnwenden } from "./modulschreibwege.mjs";
import { anlagenZusammen } from "./modul-anlagen.mjs";
import { maschinenqualZusammen } from "./modul-maschinenqual.mjs";
import { geteilterdienstZusammen } from "./modul-geteilterdienst.mjs";
import { postenZusammen } from "./modul-posten.mjs";
import { bereichsplanZusammen, bereichsPlanSchicht } from "./modul-bereichsplan.mjs";
import { fallAusAbwesenheit, svZustaendig, krankSchrittErlaubt, krankmeldungMitteilungen } from "./krankmeldung.mjs";
import { klaerungFuerRolle, KLAERUNG_ROLLEN } from "./klaerung.mjs";
import { ausschreibungDerEinheit, eintragDerEinheit, bestandSichtBetreiber, bestandSicht, SICHT_ROLLEN, schichtKontext, schichtPersonSicht, betriebSichtSchicht, OBEN_FELDER,
  betriebSichtVoll, VOLL_BETRIEB, PERSONENFELDER, VOLL_PERSON, zugehoerigkeitsAbschnitte } from "./sicht.mjs";

/* Die Rechtetabelle. Wortgleich zu MATRIX_STD in src/App.jsx — Änderungen
   dort müssen hier nachgezogen werden. */
const ALLE_RECHTE = [
  "plan.view.own", "plan.view.unit", "plan.view.all", "plan.edit.unit",
  "plan.edit.all", "pattern.edit", "shift.edit",
  /* RB-1 (Betreiberentscheidung 2026-11-11): Dienstpläne verbindlich veröffentlichen
     (m.freigaben, m.planstaende) dürfen ausschließlich Leitung und Planung. Keine andere
     Rolle bekommt es — RB-3 (Betreiberentscheidung 2026-11-11, Ergänzung): auch die
     Altrolle „kunde" nicht, auch nicht im Probierraum. Demo-Funktionen laufen über
     ausdrücklich zugewiesene Rollen (leitung oder planer mit demo: true). */
  "plan.publish",
  "req.create", "req.approve.unit", "req.approve.all",
  "staff.view", "staff.edit", "account.view.own", "account.view.all",
  "org.edit", "roles.assign", "billing.view", "audit.view", "export.data",
];

/* RB-3: Rechte, die die Altrolle „kunde" nicht trägt, obwohl sie sonst wie die Leitung behandelt wird. */
export const KUNDE_OHNE = Object.freeze(["plan.publish"]);

export const MATRIX = {
  leitung: [...ALLE_RECHTE],
  planer: ALLE_RECHTE.filter((r) => !["org.edit", "roles.assign", "billing.view"].includes(r)),
  subplaner: ["plan.view.own", "plan.view.unit", "plan.edit.unit", "req.create",
    "req.approve.unit", "staff.view", "account.view.own", "account.view.all"],
  mitarbeiter: ["plan.view.own", "plan.view.unit", "req.create", "account.view.own"],
  betriebsrat: ["plan.view.own", "plan.view.unit", "plan.view.all", "staff.view",
    "audit.view", "export.data"],
  /* Ein eigener Datenraum zum freien Ausprobieren — dort gibt es keine
     zweite Person, vor der etwas zu schützen wäre. RB-3 (Betreiberentscheidung
     2026-11-11): alles wie die Leitung AUSSER plan.publish — die Altrolle erhält
     auch im Probierraum keine Sonderrechte für die verbindliche Veröffentlichung
     (pruefungen/kunde-abloesung.test.js, pruefungen/rb3-kunde-ohne-publish.test.js). */
  kunde: ALLE_RECHTE.filter((r) => !KUNDE_OHNE.includes(r)),
};

export function darf(rolle, recht) {
  const rechte = MATRIX[rolle] || [];
  if (!rechte.includes(recht)) return false;
  /* Derselbe Riegel wie in der Oberfläche: Der Betriebsrat prüft, er ändert
     nicht. Auch dann nicht, wenn ihm jemand versehentlich ein Änderungsrecht
     in die Tabelle schreibt. */
  if (rolle === "betriebsrat" && /\.(edit|approve|assign|publish)/.test(recht)) return false;
  return true;
}

/**
 * Darf diese Rolle einen Dienstplan verbindlich freigeben, erneut freigeben
 * oder eine Freigabe ändern (RB-1, Betreiberentscheidung 2026-11-11)? Das
 * Recht plan.publish UND der volle Schreibumfang. Eine Rolle ohne
 * Vollschreibrecht erreicht die Freigaben ohnehin nicht; die zweite Bedingung
 * hält das auch dann, wenn jemand das Recht versehentlich einer weiteren
 * Rolle in die Tabelle schreibt. Die Rücknahme einer Freigabe verlangt
 * zusätzlich org.edit (WP-23b).
 * @param {string|null|undefined} rolle
 */
export function darfPlanFreigeben(rolle) {
  return typeof rolle === "string" && rolleBekannt(rolle) && darf(rolle, "plan.publish")
    && schreibumfang(rolle) === SCHREIBEN_VOLL;
}

/* --------------------------------------------------------------------------
   SCHREIBUMFANG

   Drei Stufen statt eines Ja/Nein. Der Unterschied zwischen „darf gar nicht
   schreiben" und „darf den eigenen Urlaubsantrag stellen" ist der Grund,
   warum es diese Datei überhaupt braucht.
   -------------------------------------------------------------------------- */

/* Die Rollen, die eine Person im Betrieb tragen kann. */
const KUNDENROLLEN = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"];

/**
 * Die Rolle, die für diese Sitzung tatsächlich gilt.
 *
 * Bis September 2026 entschied die Rolle am Zugangscode. Ein Code
 * „leitung", ausgestellt für eine Person, die im Betrieb Schichtverant-
 * wortung hat, gab dem Server Vollschreibrecht — während die Oberfläche
 * derselben Person die Ansicht der Schichtverantwortung zeigte, weil sie
 * sich nach der Person richtet. Umgekehrt genauso. Zwei Wahrheiten für
 * eine Sitzung sind eine zu viel.
 *
 * Jetzt zählt die Person: Ist der Code an eine gebunden und steht sie im
 * Betrieb, gilt ihre dort eingetragene Rolle. Der Code ist der Schlüssel,
 * die Personalliste sagt, wer jemand ist — und die pflegt die Leitung,
 * nicht der Betreiber. Der Betreiber selbst, ein Sicherungsschlüssel und
 * Codes ohne Person bleiben, wie sie sind.
 */
export function wirksameRolle(sitzung, bestand) {
  if (!sitzung) return null;
  if (sitzung.nurSicherung || sitzung.rolle === "betreiber") return sitzung.rolle;
  if (sitzung.person === null || sitzung.person === undefined) return sitzung.rolle;
  const m = eigenerMandant(bestand, sitzung);
  const p = m && Array.isArray(m.personen)
    ? m.personen.find((x) => x && String(x.id) === String(sitzung.person)) : null;
  if (!p || !KUNDENROLLEN.includes(p.rolle)) return sitzung.rolle;
  return p.rolle;
}

/* Die Rollen, die es gibt (Commit D1d): die Rangliste aus rollenvergabe.mjs
   und „kunde" — die Rolle älterer Zugangscodes ohne Rollenangabe. Eine
   Sitzung ohne Rolle gilt weiterhin als „kunde". Alles andere ist keine
   Rolle: kein Bestand, keine Sicht, kein Rückfall. */
export const BEKANNTE_ROLLEN = Object.freeze([...Object.keys(RANG), "kunde"]);
export const rolleBekannt = (rolle) => typeof rolle === "string" && BEKANNTE_ROLLEN.includes(rolle);

/* Rollen, die ein NEUER Zugang tragen darf (Betreiberentscheidung 2026-11-07).
   „kunde" gehört nicht dazu: Die Rolle war ein Rückfall für Codes ohne
   Rollenangabe und zugleich der „eigene Probierraum". Beides ist abgelöst —
   ein Zugang trägt immer eine ausdrückliche Rolle, und Demo ist das Merkmal
   `demo: true` am Konto (eine Demo mit Leitungsrechten ist rolle „leitung" +
   demo), keine eigene Rolle. Bestehende „kunde"-Konten werden weiter
   gelesen (kein Aussperren vor der gezielten Umstellung,
   werkzeug/kunde-abloesen.mjs); angelegt wird keines mehr.
   Eine fehlende Angabe ist hier immer ein Nein — es gibt keinen Rückfall. */
export const ROLLEN_VERGEBBAR = Object.freeze(Object.keys(RANG));
export const rolleVergebbar = (rolle) => typeof rolle === "string" && ROLLEN_VERGEBBAR.includes(rolle);

/* P0 (PR #17-Prüfung): Für eine SITZUNG gilt kein Rückfall. Ohne eine Rolle,
   die als Zeichenkette in der Rangliste steht, gibt es keinen Zugriff —
   kein Bestand, kein Schreiben, keine Sicht. Auch Anlagen haben seit
   2026-11-07 keine Vorgabe „kunde" mehr (rolleVergebbar). */
export const sitzungsRolleBekannt = (rolle) => typeof rolle === "string" && BEKANNTE_ROLLEN.includes(rolle);

export const SCHREIBEN_VOLL = "voll";
export const SCHREIBEN_EINHEIT = "einheit";
export const SCHREIBEN_EIGENES = "eigenes";
export const SCHREIBEN_BETREIBER = "betreiber";
export const SCHREIBEN_NEIN = "nein";

export function schreibumfang(rolle) {
  if (rolle === "leitung" || rolle === "planer" || rolle === "kunde") return SCHREIBEN_VOLL;
  /* Die Rolle heißt „nur der eigene Wohnbereich" — bis hierher galt das nur
     in der Oberfläche, der Server ließ betriebsweit schreiben. */
  if (rolle === "subplaner") return SCHREIBEN_EINHEIT;
  if (rolle === "mitarbeiter") return SCHREIBEN_EIGENES;
  /* Der Betreiber fiel bis hierher auf SCHREIBEN_NEIN durch. Die
     Betreiberkonsole zeigte damit Felder, die sich bedienen ließen und die
     der Server jedes Mal abwies: Tarif ändern, Status setzen, Rechnung
     stellen, Mandant anlegen — jedes Mal „Diese Änderung ist mit deiner
     Rolle nicht zulässig". Die ganze Konsole war eine Anzeige.

     Er bekommt einen eigenen Umfang statt SCHREIBEN_VOLL, weil das
     Gegenteil ebenso falsch wäre: Wer Software verkauft, hat in den
     Dienstplänen und Personalakten seiner Kunden nichts zu suchen. Das ist
     keine Vorsicht, sondern die Zusage aus § 3 des AV-Vertrags. */
  if (rolle === "betreiber") return SCHREIBEN_BETREIBER;
  return SCHREIBEN_NEIN;
}

/**
 * Monatsabschluss (WP-16): Abschließen dürfen Rollen mit Vollschreibrecht und
 * staff.edit (Leitung, Planung, Kundenrolle) — sie korrigieren auch Stempel.
 * Wiederöffnen hebt eine Sperre auf, auf die sich Lohn und Auswertungen
 * verlassen; das darf nur die Leitung (org.edit, ebenso die Kundenrolle im
 * eigenen Probierraum). Alle anderen Rollen und Aktionen: nein.
 * @param {string|null|undefined} rolle
 * @param {string} aktion "abschliessen" | "wiederoeffnen"
 */
export function abschlussRecht(rolle, aktion) {
  if (!rolle || !rolleBekannt(rolle) || schreibumfang(rolle) !== SCHREIBEN_VOLL) return false;
  if (aktion === "abschliessen") return darf(rolle, "staff.edit");
  if (aktion === "wiederoeffnen") return darf(rolle, "org.edit");
  /* Lohnexport bestätigen (WP-16 Nachtrag, Betreiberentscheidung 2026-11-03): wie das Wiederöffnen — org.edit. */
  if (aktion === "lohnexport") return darf(rolle, "org.edit");
  /* Korrekturrevision nach bestätigtem Lohnexport (WP-16c): beginnen und (als zweite Person) freigeben nur Leitung und
     Probierraum (org.edit); den Abschluss der Revision macht wie bisher staff.edit. */
  if (aktion === "korrektur-beginnen" || aktion === "korrektur-freigeben" || aktion === "korrektur-verwerfen") return darf(rolle, "org.edit");
  return false;
}

/* Was eine beschäftigte Person am Betrieb ändern darf: ihre eigenen
   Anliegen in den Feldern anfragen, erfassung, nachrichten, wuensche,
   einspruenge, urlaubsrunde und ausschreibungen, dazu neue eigene
   Krankmeldungen (abwesenheiten), die eigenen Einträge einer offenen
   Selbstplanungsrunde und neue eigene Notrufe. Alles andere — Personal,
   Dienstarten, Schichtfolge, Freigaben — bleibt unberührt, auch wenn es
   mitgeschickt wird.

   Diese Felder wurden bisher im Ganzen übernommen, sobald sie mitgeschickt
   waren. Damit konnte ein Beschäftigten-Token per API die Zeiterfassung
   jeder anderen Person überschreiben, fremde Anträge anlegen — auch gleich
   mit Status „genehmigt" — und fremde Wünsche und Nachrichten verändern.
   Die Oberfläche bot das nie an; der Server verließ sich darauf.

   Jetzt entscheidet die Person am Eintrag: Eigenes wird übernommen,
   Fremdes bleibt, wie es gespeichert war. Dazu die wenigen Stellen, an
   denen Beschäftigte fremde Einträge berühren dürfen — weil die Abläufe
   das brauchen: die Meldung auf ein fremdes Tauschgesuch und die Bewerbung
   auf eine ausgeschriebene Schicht. Die Mitteilung an die Gegenseite
   erzeugt seit Commit 4 der Server (mitteilungen.mjs).

   Und einen Antrag entscheidet nie, wer ihn stellt: Der Status eines
   eigenen Antrags darf nur „offen" oder „zurueckgezogen" werden. */
const eigenerEintrag = (e, ich) => e && String(e.personId) === String(ich);
const ANTRAGSTATUS_SELBST = ["offen", "zurueckgezogen"];

/** Liste mit personId: eigene Einträge aus dem Neuen, fremde aus dem Alten. */
function eigeneEintraege(alt, neu, ich) {
  const fremde = (Array.isArray(alt) ? alt : []).filter((e) => !eigenerEintrag(e, ich));
  const eigene = (Array.isArray(neu) ? neu : []).filter((e) => eigenerEintrag(e, ich));
  return [...fremde, ...eigene];
}

function anfragenZusammen(alt, neu, ich) {
  const alteNachId = new Map((Array.isArray(alt) ? alt : []).filter(Boolean).map((a) => [a.id, a]));
  const neueNachId = new Map((Array.isArray(neu) ? neu : []).filter(Boolean).map((a) => [a.id, a]));
  const aus = [];
  for (const a of neueNachId.values()) {
    const vorher = alteNachId.get(a.id);
    if (eigenerEintrag(a, ich)) {
      /* Eigener Antrag: anlegen, ändern, zurückziehen — aber nicht entscheiden. */
      const status = ANTRAGSTATUS_SELBST.includes(a.status) ? a.status
        : (vorher ? vorher.status : "offen");
      aus.push(vorher
        ? { ...a, status, freigaben: vorher.freigaben, entschieden: vorher.entschieden,
            durch: vorher.durch, antwort: vorher.antwort }
        : { ...a, status, freigaben: undefined, entschieden: undefined, durch: undefined, antwort: undefined });
    } else if (vorher) {
      /* Fremder Antrag: nur die eigene Meldung als Interessent kommt durch. */
      const alteI = (vorher.interessenten || []).filter((x) => String(x) !== String(ich));
      const meineI = (a.interessenten || []).filter((x) => String(x) === String(ich));
      aus.push({ ...vorher, interessenten: [...alteI, ...meineI] });
    }
    /* Neuer fremder Antrag: verworfen. */
  }
  /* Fremde Anträge, die nicht mehr mitgeschickt wurden, bleiben. */
  for (const v of alteNachId.values())
    if (!neueNachId.has(v.id) && !eigenerEintrag(v, ich)) aus.push(v);
  return aus;
}

/* Nachrichten: Beschäftigte sind nur Empfänger. An den eigenen ändert sich
   allein `gelesen` (Commit 4) — vorher ließen sie sich umschreiben, löschen
   und neu anlegen, und an Fremde ging ein „Tauschangebot" mit freiem Text.
   Die Mitteilung zur eigenen Tauschmeldung erzeugt jetzt der Server. */
function nachrichtenZusammen(alt, neu, ich) {
  const gelesen = new Map((Array.isArray(neu) ? neu : [])
    .filter((n) => eigenerEintrag(n, ich) && typeof n.gelesen === "boolean").map((n) => [String(n.id), n.gelesen]));
  return (Array.isArray(alt) ? alt : []).map((n) => (eigenerEintrag(n, ich) && gelesen.has(String(n.id))
    && gelesen.get(String(n.id)) !== n.gelesen ? { ...n, gelesen: gelesen.get(String(n.id)) } : n));
}

function ausschreibungenZusammen(alt, neu, ich) {
  const neueNachId = new Map((Array.isArray(neu) ? neu : []).filter(Boolean).map((a) => [a.id, a]));
  return (Array.isArray(alt) ? alt : []).map((a) => {
    const g = a && neueNachId.get(a.id);
    if (!g) return a;
    const fremdeB = (a.bewerbungen || []).filter((b) => !eigenerEintrag(b, ich));
    const meineB = (g.bewerbungen || []).filter((b) => eigenerEintrag(b, ich));
    return { ...a, bewerbungen: [...fremdeB, ...meineB] };
  });
}

function urlaubsrundeZusammen(alt, neu, ich) {
  if (!alt || typeof alt !== "object") return alt;
  const w = neu && typeof neu === "object" ? neu.wuensche : undefined;
  return { ...alt, wuensche: eigeneEintraege(alt.wuensche, w, ich) };
}

/* --------------------------------------------------------------------------
   KRANKMELDUNG, SELBSTPLANUNG, NOTRUF

   Alle drei bot die Oberfläche Beschäftigten an, und alle drei verwarf der
   Server bis Oktober 2026 stillschweigend: Die Felder fehlten hier, die
   Antwort lautete trotzdem „ok". Eine Krankmeldung erschien als erfasst und
   war nach dem Neuladen verschwunden.

   Zugelassen wird jetzt genau der vorgesehene Vorgang, nicht das Feld:
   eine neue eigene Krankmeldung, die eigenen Einträge in einer offenen
   Selbstplanungsrunde, ein neuer eigener Notruf. Bestehendes und Fremdes
   kommt immer aus dem gespeicherten Stand — die Sicht der Beschäftigten
   enthält davon ohnehin nur einen Teil (sicht.mjs).

   Mitteilungen legen Beschäftigte nicht an. Zum neuen Notruf erzeugt der
   Server die Mitteilungen an die Empfänger und stellt sie nach dem
   Speichern selbst per E-Mail und Push zu (Commit 4, mitteilungen.mjs).
   -------------------------------------------------------------------------- */
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ANMERKUNG_MAX = 2000;
const kennungGueltig = (id) => (typeof id === "string" && id.length > 0 && id.length <= 100)
  || (typeof id === "number" && Number.isFinite(id));
const textOderLeer = (t) => t === undefined || t === null || (typeof t === "string" && t.length <= ANMERKUNG_MAX);

/** Neue eigene Krankmeldungen: nur Art „krank", nur die Felder des Formulars.
    RB-2 (Betreiberentscheidung 2026-11-11): Sie werden nicht mehr als wirksame Abwesenheit gespeichert,
    sondern als eingegangener Fall (`krankmeldungen`, server/lib/krankmeldung.mjs) — wirksam erst mit der
    endgültigen Bestätigung durch Planung oder Leitung. Die Abwesenheiten bleiben, wie sie gespeichert waren.
    @returns {{ abwesenheiten: any[], faelle: any[] }} */
function krankmeldungenZusammen(alt, neu, ich, faelleAlt, jetzt = new Date()) {
  return krankAlsFaelle(alt, neu, faelleAlt, (a) => eigenerEintrag(a, ich), { personId: ich, rolle: "mitarbeiter" }, jetzt);
}
/** Gemeinsamer Kern für Beschäftigte und Schichtverantwortung: neue Krank-Einträge, die `zulassen`
    besteht, werden zu eingegangenen Fällen; alles andere aus `neu` zählt hier nicht. */
function krankAlsFaelle(alt, neu, faelleAlt, zulassen, akteur, jetzt) {
  const gespeichert = Array.isArray(alt) ? alt : [];
  const bekannt = new Set(gespeichert.filter(Boolean).map((a) => String(a.id)));
  const faelleBekannt = new Set((Array.isArray(faelleAlt) ? faelleAlt : []).filter(Boolean).map((f) => String(f.id)));
  const faelle = [];
  let verworfen = 0;
  for (const a of Array.isArray(neu) ? neu : []) {
    if (!a || typeof a !== "object") continue;
    if (!kennungGueltig(a.id) || bekannt.has(String(a.id))) continue;
    if (a.art !== "krank") continue;
    if (typeof a.von !== "string" || !DATUM.test(a.von)
      || typeof a.bis !== "string" || !DATUM.test(a.bis) || a.bis < a.von || !textOderLeer(a.notiz) || !zulassen(a)) { verworfen++; continue; }
    const fall = fallAusAbwesenheit({ id: String(a.id).replace(/[^A-Za-z0-9_-]/g, "_"), personId: a.personId,
      von: a.von, bis: a.bis, notiz: a.notiz }, akteur, jetzt);
    if (faelleBekannt.has(fall.id)) continue;                              // Wiederholung: der Fall besteht schon
    faelle.push(fall);
    faelleBekannt.add(fall.id);
    bekannt.add(String(a.id));
  }
  return { abwesenheiten: gespeichert, faelle, verworfen };
}

const HINWEISE_MAX = 12;
const HINWEIS_LAENGE = 300;

/** Selbstplanung: die eigenen Einträge in einer offenen Runde, sonst nichts. */
function selbstplanungZusammen(alt, neu, ich, dienstarten) {
  if (!Array.isArray(alt)) return alt;
  const neueNachId = new Map((Array.isArray(neu) ? neu : [])
    .filter((r) => r && typeof r === "object").map((r) => [r.id, r]));
  const dienste = new Set((Array.isArray(dienstarten) ? dienstarten : [])
    .filter(Boolean).map((d) => String(d.id)));
  return alt.map((r) => {
    if (!r || typeof r !== "object" || r.status !== "offen") return r;
    const g = neueNachId.get(r.id);
    if (!g) return r;
    const fremde = (Array.isArray(r.eintraege) ? r.eintraege : []).filter((e) => !eigenerEintrag(e, ich));
    const eigene = [];
    const tage = new Set();
    for (const e of Array.isArray(g.eintraege) ? g.eintraege : []) {
      if (!e || typeof e !== "object" || !eigenerEintrag(e, ich)) continue;
      if (typeof e.datum !== "string" || !DATUM.test(e.datum)
        || e.datum.slice(0, 7) !== r.monat) continue;                    // nur im Monat der Runde
      if (!dienste.has(String(e.dienstId))) continue;                     // nur bekannte Dienstarten
      if (tage.has(e.datum)) continue;                                    // ein Eintrag je Tag
      tage.add(e.datum);
      const sauber = { personId: e.personId, datum: e.datum, dienstId: e.dienstId };
      if (typeof e.zeit === "string" && e.zeit.length <= 40) sauber.zeit = e.zeit;
      /* Hinweise (Warnen statt sperren, Kette A; WP-10 d.3): Was bei der
         Eintragung gegen den Dienst sprach, nimmt die Person mit — die
         Planung entscheidet bei der Übernahme mit dem Warndialog und prüft
         dort neu. Nur kurze Texte; anderes fällt weg, ohne die Eintragung
         abzuweisen. Fremde sehen sie nicht (sicht.mjs: selbstplanung). */
      if (Array.isArray(e.hinweise) && e.hinweise.length && e.hinweise.length <= HINWEISE_MAX
        && e.hinweise.every((h) => typeof h === "string" && h.length > 0 && h.length <= HINWEIS_LAENGE))
        sauber.hinweise = [...e.hinweise];
      eigene.push(sauber);
    }
    return { ...r, eintraege: [...fremde, ...eigene] };
  });
}

/* Die Arten eines Notrufs — dieselben wie NOTRUF_ARTEN in src/App.jsx. */
const NOTRUF_ARTEN = Object.keys(NOTRUF_NAMEN);
const PLANUNGSROLLEN = ["subplaner", "planer", "leitung"];

/** Neue eigene Notrufe. Bestätigen ist Sache der Planung. */
function notrufeZusammen(alt, neu, ich, personen) {
  const gespeichert = Array.isArray(alt) ? alt : [];
  const bekannt = new Set(gespeichert.filter(Boolean).map((n) => String(n.id)));
  const planung = new Set((Array.isArray(personen) ? personen : [])
    .filter((p) => p && PLANUNGSROLLEN.includes(p.rolle)).map((p) => String(p.id)));
  const neue = [];
  for (const n of Array.isArray(neu) ? neu : []) {
    if (!n || typeof n !== "object" || !eigenerEintrag(n, ich)) continue;
    if (!kennungGueltig(n.id) || bekannt.has(String(n.id))) continue;
    if (!NOTRUF_ARTEN.includes(n.art)) continue;
    if (!textOderLeer(n.notiz)) continue;
    neue.push({
      id: n.id, personId: n.personId, art: n.art,
      notiz: typeof n.notiz === "string" ? n.notiz : "",
      zeit: typeof n.zeit === "string" && n.zeit.length <= 40 ? n.zeit : new Date().toISOString(),
      datum: typeof n.datum === "string" && DATUM.test(n.datum) ? n.datum : new Date().toISOString().slice(0, 10),
      dienst: typeof n.dienst === "string" && n.dienst.length <= 200 ? n.dienst : null,
      ort: typeof n.ort === "string" && n.ort.length <= 200 ? n.ort : null,
      /* Wer unterrichtet wird, bestimmt nicht die Übermittlung: nur
         Schichtverantwortung, Planung und Leitung dieses Betriebs. */
      empfaenger: (Array.isArray(n.empfaenger) ? n.empfaenger : [])
        .filter((x) => planung.has(String(x))),
      bestaetigt: null,
    });
    bekannt.add(String(n.id));
  }
  /* Neueste zuerst — so legt auch die Oberfläche sie ab. */
  return [...neue, ...gespeichert];
}

/** Die eigenen Felder einer beschäftigten Person, personenbezogen gefiltert. */
export function eigenesZusammen(alt, geschickt, ich) {
  const hat = (f) => Object.prototype.hasOwnProperty.call(geschickt, f);
  const aus = {};
  /* Zeiten: der gespeicherte Stand. Selbstauskünfte laufen über
     POST /api/zeit-bestaetigen (zeiterfassung.mjs), Kopien werden übergangen. */
  if (hat("erfassung")) aus.erfassung = erfassungZusammen(alt, geschickt.erfassung, ich).erfassung;
  if (hat("wuensche")) aus.wuensche = eigeneEintraege(alt.wuensche, geschickt.wuensche, ich);
  if (hat("einspruenge")) aus.einspruenge = eigeneEintraege(alt.einspruenge, geschickt.einspruenge, ich);
  if (hat("anfragen")) aus.anfragen = anfragenZusammen(alt.anfragen, geschickt.anfragen, ich);
  if (hat("nachrichten")) aus.nachrichten = nachrichtenZusammen(alt.nachrichten, geschickt.nachrichten, ich);
  if (hat("ausschreibungen")) aus.ausschreibungen = ausschreibungenZusammen(alt.ausschreibungen, geschickt.ausschreibungen, ich);
  if (hat("urlaubsrunde")) aus.urlaubsrunde = urlaubsrundeZusammen(alt.urlaubsrunde, geschickt.urlaubsrunde, ich);
  if (hat("abwesenheiten")) {
    /* RB-2: eine neue eigene Krankmeldung wird ein eingegangener Fall, keine wirksame Abwesenheit. */
    const k = krankmeldungenZusammen(alt.abwesenheiten, geschickt.abwesenheiten, ich, alt.krankmeldungen);
    aus.abwesenheiten = k.abwesenheiten;
    if (k.faelle.length) aus.krankmeldungen = [...k.faelle, ...(Array.isArray(alt.krankmeldungen) ? alt.krankmeldungen : [])];
  }
  if (hat("selbstplanung")) aus.selbstplanung = selbstplanungZusammen(alt.selbstplanung, geschickt.selbstplanung, ich, alt.dienstarten);
  if (hat("notrufe")) aus.notrufe = notrufeZusammen(alt.notrufe, geschickt.notrufe, ich, alt.personen);
  return aus;
}

/* Was eine beschäftigte Person an der eigenen Person ändern darf.

   Erreichbarkeit und Vorlieben — nicht der Vertrag, nicht die
   Qualifikation, nicht die Beurteilung. Wer hier etwas ergänzt, sollte
   sich fragen: Würde der Betrieb es hinnehmen, wenn die Person es selbst
   einträgt? */
const SELBST_FELDER = [
  /* Erreichbarkeit */
  "telefon", "mobil", "email", "anschrift", "notfallkontakt",
  /* Wie sie erreicht werden möchte */
  "zustellung", "pushSchluessel", "kalenderVerweis",
  /* Der Kalenderzustand der eigenen Person (Commit 3): Ohne gespeichertes
     Geheimnis ließ sich ein Feed nach dem Neuladen nicht mehr abschalten,
     und die Schichtverantwortung bekam beim Einrichten 403. Über die
     Berechtigung entscheidet der Kalender-Endpunkt, nicht dieser Wert. */
  "kalenderGeheim", "kalenderStand",
  /* Wann sie kann und was sie sich wünscht */
  "verfuegbarkeit", "wunschfrei",
  /* Wie die Anwendung für sie aussieht */
  "kontrastmodus", "feldmodus", "thema", "dichte", "tour", "einfuehrung", "handbuch",
];

/* Felder des Gesamtbestands, die jede Rolle setzen darf: der Zählerstand
   und die Sitzungsmarke der Oberfläche. */
/* session gehört seit Commit D1b nicht mehr dazu — sie ist kein Bestandsfeld
   und wird beim Schreiben wie beim Lesen auf null gesetzt (siehe
   zusammenfuehren, bestandFuerRolle, bestandSchreiben). */
const BESTAND_FELDER = ["stand", "version"];

/* Was dem Betreiber gehört: sein eigener Firmenstamm, die Tarifliste, der
   Rechnungsausgang, sein Protokoll. Nichts davon steht in einem Betrieb. */
const BETREIBER_FELDER = ["betreiber", "tarife", "rechnungen", "protokoll",
  "pakete", "adressaenderungen", "selbststarts"];

/* Und was er an einem Betrieb ändern darf: alles Kaufmännische, nichts
   Betriebliches.

   Die Grenze verläuft nicht willkürlich. Links davon steht, was im Vertrag
   zwischen ihm und dem Kunden geregelt ist — Preis, Laufzeit, Status,
   Rechnungsanschrift. Rechts davon steht, was dem Kunden gehört: Personal,
   Dienstarten, Schichtfolge, Pläne, Abwesenheiten, Nachrichten. Auf die
   rechte Seite kommt der Betreiber über diesen Weg nicht, auch wenn seine
   Oberfläche sie mitschickt. */
const KAUFMAENNISCHE_FELDER = ["name", "branche", "status", "tarif", "seit",
  "bis", "stichtag", "testTage", "rabattGrund", "preisgestaltung", "pakete", "paketZustimmungen", "paketGrundlage",
  "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "einheitLabel",
  /* Die Rollenbezeichnungen darf auch der Betreiber setzen — beim
     Einrichten eines Hauses ist er derjenige, der weiß, ob dort
     Stationsleitung oder Wohnbereichsleitung gesagt wird. */
  "rollennamen"];

/* Und die Gegenrichtung: Was ein Betrieb an sich selbst *nicht* ändern darf.

   Die Organisationsleitung hat billing.view und bekommt deshalb Tarif,
   Status und Preisgestaltung ausgeliefert — sie soll die eigenen Kosten
   einsehen können. Unter SCHREIBEN_VOLL durfte sie bis hierher alles
   zurückschreiben, was sie bekommen hat. Ein Kunde konnte sich damit auf
   „Testphase" setzen, sich einen Sonderpreis von null geben oder die
   kostenlose Zeit um ein Jahr verlängern — ein Aufruf genügte.

   Das ist keine Änderung an seinem Betrieb, sondern am Vertrag. Verträge
   ändert der Betreiber.

   Der Name steht bewusst nicht hier: Den darf ein Betrieb pflegen.
   Anschrift, Ansprechpartner und USt-ID sind seit Commit 1e.2a
   Rechnungsstammdaten des Betreibers (BETREIBERSTAMM oben).

   laeuftAb und selbstAngelegt gehören dazu, seit der Löschlauf für
   abgelaufene Testbetriebe daran hängt (aufraeumen.mjs): Wer sie
   zurückschreiben könnte, könnte seine eigene Löschung aushebeln. */
/* Rechnungs- und Ansprechpartnerangaben, die interne Notiz des Betreibers,
   die Raumkennung und die Lohnartenzuordnung. Gepflegt werden sie in der
   Betreiberkonsole; einen Weg für den Betrieb gibt es in der Oberfläche
   nicht (lohnarten hat noch gar keinen Editor). Bis Oktober 2026 konnten
   Leitung und Planung sie über den allgemeinen Schreibweg ändern. Wie die
   Vertragsfelder gehen sie immer auf den gespeicherten Stand zurück. */
export const BETREIBERSTAMM = ["kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum", "lohnarten"];

/** Was Leitung und Kundenrolle zur Preisanzeige lesen (B2) — nur lesend. */
const PREISGRUNDLAGE = ["tarif", "preisgestaltung", "rabattGrund"];

/* G9 (Review F1, Nachtrag 2): Pakete lassen sich unter Zustand 5 nur in einem Betrieb mit Pilot
   zubuchen; Pilot, Zustimmungen und Grundlagen mit Servertag, nur für gebuchte Pakete. Die Regel
   steht in paketstand.mjs (paketfelderGeprueft) — /api/bestand-anlegen nutzt dieselbe. */
const paketeGeprueft = (m0, altM) => paketfelderGeprueft(m0, altM);

export const VERTRAGSFELDER = ["status", "tarif", "seit", "bis", "stichtag",
  "testTage", "rabattGrund", "preisgestaltung", "pakete", "paketZustimmungen", "paketGrundlage",
  "laeuftAb", "selbstAngelegt"];

/* --------------------------------------------------------------------------
   LESEN — was verlässt den Server?

   Ohne Filter bekommt eine Pflegekraft beim Öffnen der Telefonansicht die
   vollständigen Stammdaten aller Kolleginnen: Anschrift, Geburtsdatum,
   Notfallkontakt, Krankheitszeiten mit Grund. Nichts davon braucht sie, um
   den eigenen Dienstplan zu sehen.
   -------------------------------------------------------------------------- */

/**
 * Baut die Antwort für eine Rolle.
 *
 * Wichtig für den Schreibpfad: Was hier entfernt wird, darf nie über einen
 * späteren PUT zurückgeschrieben werden — sonst löscht die Oberfläche der
 * beschäftigten Person beim ersten Speichern die Stammdaten aller anderen.
 * Deshalb schreibt `zusammenfuehren` unten immer auf den gespeicherten
 * Stand, nicht auf den übermittelten.
 */
/** session am Betrieb (mandanten[].session) ist kein Bestandsfeld (Commit
    D1c). Kein Schreiber hat es je gesetzt; die Oberfläche las daraus nur
    irrtümlich die eigene Person (siehe 33e1cc1). Planung und Leitung konnten
    dort aber beliebige Daten ablegen, die alle Beschäftigten des Betriebs
    zurückbekamen. Es wird beim Lesen wie beim Schreiben entfernt. */
function ohneBetriebsSession(bestand) {
  if (!bestand || typeof bestand !== "object" || Array.isArray(bestand) || !Array.isArray(bestand.mandanten)) return bestand;
  if (!bestand.mandanten.some((m) => m && typeof m === "object" && "session" in m)) return bestand;
  return { ...bestand, mandanten: bestand.mandanten.map((m) => {
    if (!m || typeof m !== "object" || !("session" in m)) return m;
    const { session, ...rest } = m; // eslint-disable-line no-unused-vars
    return rest;
  }) };
}

/** Die Sicht der Rolle — session immer null (Commit D1b): Auch ein
    gespeicherter Altinhalt (Personenkennung, Token, beliebige Felder) geht
    an keine Rolle hinaus. Gilt für GET /api/bestand und die 409-Antwort.
    session am Betrieb fehlt ganz (Commit D1c). */
export function bestandFuerRolle(bestand, sitzung) {
  const aus = ohneBetriebsSession(bestandFuerRolleKern(ohneBetriebsSession(bestand), sitzung));
  return aus && typeof aus === "object" && !Array.isArray(aus) ? { ...aus, session: null } : aus;
}

/** Die Antwort von GET /api/bestand (und der 409-Antwort von PUT): die Sicht der Rolle und — nur für
    Planung, Leitung und die Schichtverantwortung (ihr Bereich; nicht die Kundenrolle) — die abgeleitete Markierung
    „Besetzung klärungsbedürftig“ (RB-5, klaerung.mjs) als `klaerung` am eigenen Betrieb. Nie gespeichert
    (abgeleiteteEntfernen), nicht in Auskunft, Import oder Faktenpaket (die lesen bestandFuerRolle). */
export function bestandFuerAntwort(bestand, sitzung) {
  const aus = bestandFuerRolle(bestand, sitzung);
  if (!sitzung || !KLAERUNG_ROLLEN.includes(sitzung.rolle) || !aus || !Array.isArray(aus.mandanten) || aus.mandanten.length !== 1) return aus;
  const sicht = aus.mandanten[0];
  const roh = eigenerMandant(ohneBetriebsSession(bestand), sitzung);
  if (!sicht || typeof sicht !== "object" || !roh || String(roh.id) !== String(sicht.id)) return aus;
  const klaerung = klaerungFuerRolle(roh, sitzung, sicht.krankmeldungen);
  return klaerung ? { ...aus, mandanten: [{ ...sicht, klaerung }] } : aus;
}

function bestandFuerRolleKern(bestand, sitzung) {
  if (!bestand || typeof bestand !== "object") return bestand;
  /* Unbekannte Rolle: nichts (Commit D1d). Bis hierher fiel sie unten auf
     eine Rohkopie des eigenen Betriebs durch. */
  if (!sitzung || !sitzungsRolleBekannt(sitzung.rolle)) return null;
  const rolle = sitzung.rolle;
  /* Seit Commit D1 eine Positivliste statt des ganzen Raums (sicht.mjs). */
  if (rolle === "betreiber") return bestandSichtBetreiber(bestand);

  /* Beschäftigte und Betriebsrat: nur, was der Katalog in sicht.mjs
     ausdrücklich freigibt. Unbekannte Felder gehen nicht hinaus — weder
     ganz oben noch im Betrieb noch an einer Person. */
  if (SICHT_ROLLEN.includes(rolle)) {
    const eigener = eigenerMandant(bestand, sitzung);
    const aus = bestandSicht(bestand, sitzung, eigener);
    /* WP-27: Die Auswertung für den Betriebsrat steht NICHT im Bestand — sie hat
       einen eigenen Weg (GET /api/br-auswertung, daten.mjs), der im Hintergrund
       rechnet und nie den Prozess blockiert. */
    return aus;
  }

  /* Die Schichtverantwortung: ebenso über einen Katalog (SCHICHT), gestuft
     nach eigener Person, eigenem Bereich, Springer-Pool und fremd. */
  if (rolle === "subplaner") {
    const aus = {};
    for (const feld of OBEN_FELDER) if (Object.prototype.hasOwnProperty.call(bestand, feld)) aus[feld] = bestand[feld];
    const eigenerS = eigenerMandant(bestand, sitzung);
    if (eigenerS) aus.mandanten = [betriebSichtSchicht(eigenerS, schichtSichtKontext(eigenerS, sitzung))];
    return aus;
  }

  /* Planung, Leitung, Kundenrolle: Positivkatalog (sicht.mjs, Commit 1e.3).
     Oben nur Zähler und Sitzungsmarke, darunter der eigene Betrieb. Die
     Betreiberdaten liest keine Ansicht dieser Rollen. */
  if (schreibumfang(rolle) === SCHREIBEN_VOLL) {
    const aus = {};
    for (const feld of OBEN_FELDER) if (Object.prototype.hasOwnProperty.call(bestand, feld)) aus[feld] = bestand[feld];
    const eigenerV = eigenerMandant(bestand, sitzung);
    if (eigenerV) aus.mandanten = [betriebSichtVoll(eigenerV, sitzung)];
    /* Die Kosten des eigenen Betriebs (B2): Wer billing.view hat — Leitung,
       Kundenrolle —, bekommt die Preisgrundlage nur lesend: Tarif,
       Preisgestaltung und Rabatt des eigenen Betriebs, oben nur den Eintrag
       des eigenen Tarifs. Ohne sie rechnete die Betriebsseite mit der
       ersten Stufe ohne Vereinbarung und zeigte einen falschen Monatspreis.
       Schreiben bleibt beim Betreiber: Vertragsfelder und die oberste Ebene
       kommen beim Speichern immer aus dem gespeicherten Stand. Die Planung
       hat billing.view nicht und bekommt nichts davon. */
    if (eigenerV && aus.mandanten && darf(rolle, "billing.view")) {
      for (const feld of PREISGRUNDLAGE) if (hat(eigenerV, feld))
        aus.mandanten[0][feld] = feld === "preisgestaltung" ? preisgestaltungFuerKunde(eigenerV[feld]) : eigenerV[feld];
      const eigenerTarif = Array.isArray(bestand.tarife)
        ? bestand.tarife.filter((t) => t && typeof t === "object" && t.id === eigenerV.tarif) : [];
      if (eigenerTarif.length) aus.tarife = eigenerTarif;
    }
    return aus;
  }

  /* Jede bekannte Rolle hat oben ihre ausdrückliche Sicht. Hier stand bis
     Commit D1d ein Rückfall auf eine Kopie des Bestands mit dem eigenen
     Betrieb im Rohzustand — erreichbar nur für eine Rolle, die es nicht
     gibt. Was keine Sicht hat, bekommt nichts. */
  return null;
}

/** Die Personen eines Betriebs in der Sicht der Schichtverantwortung. */
function schichtSichtKontext(m, sitzung) {
  const ich = (Array.isArray(m.personen) ? m.personen : []).find((p) => p && String(p.id) === String(sitzung.person));
  return schichtKontext(m, sitzung, eigeneEinheit(m, ich), heuteBerlin());
}

/**
 * Die Rückfüllung. Die Schichtverantwortung liest Personen gekürzt und
 * schreibt diese gekürzte Fassung zurück. Ohne Rückfüllung sähe jedes
 * Speichern aus wie das Löschen aller verborgenen Felder — und bekäme 403.
 *
 * Je Person: Was die Sicht zeigt und unverändert zurückkommt, wird durch
 * den gespeicherten Wert ersetzt; was sie verbirgt und nicht mitkommt,
 * kommt aus dem gespeicherten Stand. Alles andere — eine Änderung an einem
 * sichtbaren Feld, ein mitgeschicktes verborgenes Feld — bleibt, wie es
 * kam, und einheitZusammen entscheidet darüber wie bisher.
 */
export function personenRueckfuellen(altM, neuM, sitzung) {
  if (!altM || !neuM || !Array.isArray(neuM.personen)) return neuM;
  const ctx = schichtSichtKontext(altM, sitzung);
  const gespeichert = new Map((Array.isArray(altM.personen) ? altM.personen : [])
    .filter(Boolean).map((p) => [String(p.id), p]));
  const gleichWert = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const personen = neuM.personen.map((n) => {
    const s = n && gespeichert.get(String(n.id));
    if (!s || typeof n !== "object") return n;
    const v = schichtPersonSicht(s, ctx);
    const aus = {};
    for (const k of new Set([...Object.keys(s), ...Object.keys(v), ...Object.keys(n)])) {
      const hatN = Object.prototype.hasOwnProperty.call(n, k);
      const hatS = Object.prototype.hasOwnProperty.call(s, k);
      if (Object.prototype.hasOwnProperty.call(v, k)) {
        if (hatN && gleichWert(n[k], v[k])) { if (hatS) aus[k] = s[k]; }
        else if (hatN) aus[k] = n[k];
        /* sichtbar, aber nicht mehr mitgeschickt: gelöscht — einheitZusammen urteilt */
      } else if (hatN) aus[k] = n[k];
      else if (hatS) aus[k] = s[k];
    }
    return aus;
  });
  return { ...neuM, personen };
}

/* Die Rückfüllung der Sammlungen (Commit 1e.2) — dieselbe Regel wie für
   Personen, je Eintrag: Was die Sicht zeigt und unverändert zurückkommt,
   wird durch den gespeicherten Eintrag ersetzt; was sie verbirgt und nicht
   mitkommt, kommt aus dem gespeicherten Stand. Neue Einträge, geänderte
   und mitgeschickte verborgene bleiben, wie sie kamen — darüber urteilt
   einheitZusammen. Listen ohne Kennung am Eintrag werden als Ganzes
   verglichen. */
const gleichJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* Ein einzelner Eintrag, den die Sicht gekürzt hat und der verändert
   zurückkommt: der gespeicherte Eintrag, darauf nur die sichtbar geänderten
   Felder (und mitgeschickte verborgene, über die einheitZusammen urteilt).
   Die Meldungen auf ein Tauschgesuch zeigt die Sicht maskiert
   („verborgen-0"); zurück gehen die gespeicherten, die eigene dazu oder weg. */
function eintragRueckfuellen(a, n, v, ich) {
  if (!istObjekt(a) || !istObjekt(n) || !istObjekt(v)) return n;
  const aus = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) {
    /* Bewerbungen haben keine eigene Kennung — zusammengeführt wird über die
       personId (Commit C1): Was die Sicht verbarg, bleibt aus dem gespeicherten
       Stand; die sichtbaren kommen aus der Übermittlung. Ob eine Änderung daran
       zulässig ist, entscheidet danach einheitZusammen. */
    if (k === "bewerbungen" && Array.isArray(a[k]) && Array.isArray(n[k]) && Array.isArray(v[k])) {
      if (gleichJson(n[k], v[k])) { aus[k] = a[k]; continue; }
      const sichtbar = new Set(v[k].filter(istObjekt).map((b) => String(b.personId)));
      aus[k] = [...a[k].filter((b) => !istObjekt(b) || !sichtbar.has(String(b.personId))), ...n[k]];
      continue;
    }
    if (k === "interessenten" && Array.isArray(a[k]) && Array.isArray(n[k]) && Array.isArray(v[k])) {
      const ichDabei = n[k].some((x) => String(x) === String(ich));
      aus[k] = [...a[k].filter((x) => String(x) !== String(ich)), ...(ichDabei ? [ich] : [])];
      if (gleichJson(aus[k].map(String).sort(), a[k].map(String).sort())) aus[k] = a[k];
      continue;
    }
    if (hat(v, k)) {
      if (hat(n, k)) aus[k] = gleichJson(n[k], v[k]) && hat(a, k) ? a[k] : n[k];
    } else if (hat(n, k)) aus[k] = n[k];
    else if (hat(a, k)) aus[k] = a[k];
  }
  return aus;
}
function listeRueckfuellen(alt, neu, sicht, ich) {
  const kennung = (e) => (e && typeof e === "object" && (typeof e.id === "string" || typeof e.id === "number") ? String(e.id) : null);
  if (!alt.every((e) => kennung(e) !== null) || !sicht.every((e) => kennung(e) !== null))
    return gleichJson(neu, sicht) ? alt : neu;
  const sichtNach = new Map(sicht.map((e) => [kennung(e), e]));
  const neuNach = new Map(neu.filter((e) => kennung(e) !== null).map((e) => [kennung(e), e]));
  const altIds = new Set(alt.map(kennung));
  const neue = neu.filter((e) => kennung(e) === null || !altIds.has(kennung(e)));
  const aus = [];
  for (const a of alt) {
    const id = kennung(a);
    if (neuNach.has(id)) {
      const n = neuNach.get(id);
      const v = sichtNach.get(id);
      aus.push(v === undefined ? n : gleichJson(n, v) ? a : eintragRueckfuellen(a, n, v, ich));
    } else if (!sichtNach.has(id)) aus.push(a);               // verborgen: bleibt
    /* sichtbar, aber nicht mehr mitgeschickt: gelöscht — einheitZusammen urteilt */
  }
  return [...neue, ...aus];
}
function objektRueckfuellen(alt, neu, sicht, ich) {
  const aus = {};
  for (const k of new Set([...Object.keys(alt), ...Object.keys(neu)])) {
    /* Listen je Schlüssel (notizen „tag|…", Commit C3): Einträge wie bei
       Listen zusammenführen — sonst ginge mit einem sichtbaren Eintrag eines
       Tages jeder verborgene desselben Tages verloren. Ein ganz verborgener
       Schlüssel zählt als leere Sicht. */
    if (hat(neu, k) && hat(alt, k) && Array.isArray(alt[k]) && Array.isArray(neu[k])
        && (!hat(sicht, k) || Array.isArray(sicht[k]))) {
      aus[k] = listeRueckfuellen(alt[k], neu[k], hat(sicht, k) ? sicht[k] : [], ich);
      continue;
    }
    if (hat(neu, k)) aus[k] = !hat(sicht, k) || !hat(alt, k) ? neu[k]
      : gleichJson(neu[k], sicht[k]) ? alt[k] : eintragRueckfuellen(alt[k], neu[k], sicht[k], ich);
    else if (hat(alt, k) && !hat(sicht, k)) aus[k] = alt[k];
  }
  return aus;
}
/** Rückfüllung des ganzen Betriebs der Schichtverantwortung. */
export function schichtRueckfuellen(altM, neuM, sitzung) {
  if (!altM || !neuM || typeof neuM !== "object") return neuM;
  const sicht = betriebSichtSchicht(altM, schichtSichtKontext(altM, sitzung));
  const mitPersonen = personenRueckfuellen(altM, neuM, sitzung);
  const aus = {};
  for (const feld of new Set([...Object.keys(altM), ...Object.keys(neuM)])) {
    if (feld === "personen") { if (hat(mitPersonen, feld)) aus[feld] = mitPersonen[feld]; continue; }
    /* Vertrag und Betreiberstamm: immer der gespeicherte Stand (1e.2a) —
       mitgeschickt wirkungslos, wie bei allen Rollen außer dem Betreiber. */
    if (VERTRAGSFELDER.includes(feld) || BETREIBERSTAMM.includes(feld)) { if (hat(altM, feld)) aus[feld] = altM[feld]; continue; }
    const a = altM[feld], n = neuM[feld], v = sicht[feld];
    /* nicht mitgeschickt: verborgen, gekürzt oder weggelassen — der gespeicherte Stand */
    if (!hat(neuM, feld)) { if (hat(altM, feld)) aus[feld] = a; continue; }
    if (!hat(sicht, feld)) { aus[feld] = n; continue; }        // verborgenes Feld mitgeschickt
    if (Array.isArray(a) && Array.isArray(v) && Array.isArray(n)) aus[feld] = listeRueckfuellen(a, n, v, sitzung.person);
    else if (istObjekt(a) && istObjekt(v) && istObjekt(n)) aus[feld] = objektRueckfuellen(a, n, v, sitzung.person);
    else aus[feld] = gleichJson(n, v) ? a : n;
  }
  return aus;
}

/**
 * Rückfüllung für Planung, Leitung und Kundenrolle (Commit 1e.3). Ihr
 * Betrieb wird im Ganzen aus der Übermittlung übernommen; was die Sicht
 * verbirgt, fehlt darin. Verborgene Felder kommen deshalb immer aus dem
 * gespeicherten Stand — fehlend wie mitgeschickt (wirkungslos). Eine neue
 * Person bekommt verborgene Felder gar nicht erst.
 */
export function vollRueckfuellen(altM, neuM, sitzung) {
  if (!altM || !neuM || typeof neuM !== "object") return neuM;
  /* In der gespeicherten Reihenfolge der Felder — die Monatsscherben
     vergleichen Abdrücke, eine bloß andere Reihenfolge wäre eine Änderung. */
  const zusammenlegen = (alt, neu, sichtbar) => {
    const aus = {};
    for (const [k, v] of Object.entries(alt || {})) {
      if (!sichtbar(k)) aus[k] = v;
      else if (Object.prototype.hasOwnProperty.call(neu, k)) aus[k] = neu[k];
    }
    for (const [k, v] of Object.entries(neu)) if (sichtbar(k) && !Object.prototype.hasOwnProperty.call(aus, k)) aus[k] = v;
    return aus;
  };
  const aus = zusammenlegen(altM, neuM, (k) => VOLL_BETRIEB.includes(k));
  if (Array.isArray(neuM.personen)) {
    const gespeichert = new Map((Array.isArray(altM.personen) ? altM.personen : [])
      .filter(Boolean).map((p) => [String(p.id), p]));
    aus.personen = neuM.personen.map((n) => {
      if (!n || typeof n !== "object") return n;
      const sichtbar = String(n.id) === String(sitzung.person) ? PERSONENFELDER : VOLL_PERSON;
      return zusammenlegen(gespeichert.get(String(n.id)), n, (k) => sichtbar.includes(k));
    });
  }
  return aus;
}

/** Der gespeicherte Betrieb dieser Sitzung samt seiner Stelle — oder null,
    wenn es noch keinen gespeicherten Bestand gibt. Dieselbe Zuordnung wie
    eigenerMandant, damit Lesen und Schreiben denselben Betrieb meinen. */
export function gespeicherterBetrieb(gespeichert, sitzung) {
  if (!gespeichert || !Array.isArray(gespeichert.mandanten) || !gespeichert.mandanten.length) return null;
  const i = Number(sitzung.betrieb);
  const index = Number.isInteger(i) && i >= 0 && i < gespeichert.mandanten.length ? i : 0;
  return { index, betrieb: gespeichert.mandanten[index] || {} };
}

/** Genau ein übermittelter Betrieb, und zwar der eigene. Sonst der Grund der Absage. */
function einzigerEigenerBetrieb(uebermittelt, id) {
  const liste = uebermittelt && uebermittelt.mandanten;
  const grund = "Über diesen Zugang lässt sich genau ein Betrieb schreiben — der eigene.";
  if (typeof id !== "string" || !id) return grund;
  if (!Array.isArray(liste) || liste.length !== 1) return grund;
  const m = liste[0];
  if (!m || typeof m !== "object" || m.id !== id) return grund;
  return null;
}

/* Der Betriebsschalter für die Geo-Prüfung beim Stempeln (E7). Schalten
   darf nur, wer org.edit hat (Leitung, Kundenrolle) — die Planung schreibt
   die übrigen Einstellungen, diesen Schalter nicht. Wann und von wem
   zuletzt eingeschaltet wurde, setzt der Server; mitgeschickte Werte zählen
   nicht. Fehlt der Schalter, gilt er als aus.

   Einschalten (aus → an) verlangt zusätzlich die ausdrückliche Bestätigung
   der betrieblichen Prüfung in derselben Anfrage: geoPruefungBestaetigt:
   true in den mitgeschickten Einstellungen. Das Merkmal wirkt nur für diese
   Anfrage und wird nie gespeichert. Ausschalten und „bleibt an" brauchen
   keine Bestätigung. Eine juristische Einwilligung ist das nicht — nur der
   technische Nachweis, dass die Leitung die Freigabe bestätigt hat. */
const GEO_SCHALTER = ["geoPruefung", "geoPruefungAktiviertAm", "geoPruefungAktiviertVon",
  "geoModus", "geoModusGeaendertAm", "geoModusGeaendertVon"];
export const GEO_BESTAETIGUNG_TEXT = "Datenschutz und gegebenenfalls Mitbestimmung für diese Funktion wurden betrieblich geprüft.";
function geoSchalterZusammen(altM, neuM, sitzung, rolle) {
  if (!neuM || typeof neuM !== "object" || !neuM.einstellungen || typeof neuM.einstellungen !== "object") return { mandant: neuM };
  const altE = altM && altM.einstellungen && typeof altM.einstellungen === "object" ? altM.einstellungen : {};
  const e = { ...neuM.einstellungen };
  const bestaetigt = e.geoPruefungBestaetigt === true;
  delete e.geoPruefungBestaetigt;                                   // nur für diese Anfrage
  for (const feld of GEO_SCHALTER) {
    if (Object.prototype.hasOwnProperty.call(altE, feld)) e[feld] = altE[feld];
    else delete e[feld];
  }
  const gewuenscht = neuM.einstellungen.geoPruefung === true;
  if (gewuenscht !== (altE.geoPruefung === true) && darf(rolle, "org.edit")) {
    if (gewuenscht && !bestaetigt)
      return { grund: `Die Standortprüfung lässt sich nur mit der Bestätigung einschalten: „${GEO_BESTAETIGUNG_TEXT}"` };
    e.geoPruefung = gewuenscht;
    if (gewuenscht) {
      e.geoPruefungAktiviertAm = new Date().toISOString();
      e.geoPruefungAktiviertVon = sitzung.person === undefined ? null : sitzung.person;
    }
  }
  /* Prüfmodus (WP-20): hinweis (Vorgabe) oder pflicht. Nur org.edit; „pflicht" verlangt dieselbe
     Bestätigung wie das Einschalten, mit dem Hinweis auf die Mitbestimmung. Wann und von wem setzt
     der Server. Abwesend oder null: bleibt, wie es ist. */
  const wunsch = neuM.einstellungen.geoModus;
  if (darf(rolle, "org.edit") && wunsch !== undefined && wunsch !== null) {
    if (wunsch !== "hinweis" && wunsch !== "pflicht")
      return { grund: "Der Prüfmodus der Standortprüfung muss „hinweis“ oder „pflicht“ sein." };
    if (wunsch !== (altE.geoModus === "pflicht" ? "pflicht" : "hinweis")) {
      if (wunsch === "pflicht" && !bestaetigt) return { grund: `Die verpflichtende Standortprüfung lässt sich nur mit der Bestätigung einstellen: „${GEO_MODUS_TEXT}"` };
      e.geoModus = wunsch;
      e.geoModusGeaendertAm = new Date().toISOString();
      e.geoModusGeaendertVon = sitzung.person === undefined ? null : sitzung.person;
    }
  }
  return { mandant: { ...neuM, einstellungen: e } };
}

/* Offline-Stempel vertrauen (WP-07, Review-Auflage A1): Mit dem Schalter
   gilt eine offline erfasste Zeit, die 15 Minuten oder später eingeht, als
   bestätigt (sonst zur Prüfung durch die Leitung). Er lockert eine
   Schutzprüfung — schalten darf nur org.edit (Leitung, Kundenrolle), Wann
   und Wer setzt der Server, mitgeschickte Werte zählen nicht. Vorgabe: aus. */
const OFFLINE_SCHALTER = ["offlineStempelVertrauen", "offlineStempelVertrauenAm", "offlineStempelVertrauenVon"];
function offlineSchalterZusammen(altM, neuM, sitzung, rolle) {
  if (!neuM || typeof neuM !== "object" || !neuM.einstellungen || typeof neuM.einstellungen !== "object") return neuM;
  const altE = altM && altM.einstellungen && typeof altM.einstellungen === "object" ? altM.einstellungen : {};
  const e = { ...neuM.einstellungen };
  for (const feld of OFFLINE_SCHALTER) {
    if (Object.prototype.hasOwnProperty.call(altE, feld)) e[feld] = altE[feld];
    else delete e[feld];
  }
  const gewuenscht = neuM.einstellungen.offlineStempelVertrauen === true;
  if (gewuenscht !== (altE.offlineStempelVertrauen === true) && darf(rolle, "org.edit")) {
    e.offlineStempelVertrauen = gewuenscht;
    e.offlineStempelVertrauenAm = new Date().toISOString();
    e.offlineStempelVertrauenVon = sitzung.person === undefined ? null : sitzung.person;
  }
  return { ...neuM, einstellungen: e };
}

/* Ortsangaben von Dienstarten und Einsatzorte (WP-20, Review M1). Wer Dienstarten pflegt (org.edit oder
   pattern.edit, also auch die Planung), bestimmt mittelbar den Referenzort der Standortprüfung — auch bei
   bestätigtem Pflichtmodus. Das Recht bleibt; nachvollziehbar wird es durch Wann/Wer, die der Server setzt:
   ortGeaendertAm/-Von an der Dienstart (ortModus, einsatzortId), einsatzorteGeaendertAm/-Von am Betrieb
   (Liste der Einsatzorte). Mitgeschickte Werte zählen nie; ohne Änderung bleibt der gespeicherte Vermerk. */
function ortAngabenZusammen(altM, neuM, sitzung) {
  if (!neuM || typeof neuM !== "object") return neuM;
  const wer = sitzung && sitzung.person !== undefined ? sitzung.person : null;
  const jetzt = new Date().toISOString();
  const aus = { ...neuM };
  const altD = new Map((Array.isArray(altM && altM.dienstarten) ? altM.dienstarten : [])
    .filter((d) => d && typeof d === "object").map((d) => [String(d.id), d]));
  if (Array.isArray(neuM.dienstarten)) {
    aus.dienstarten = neuM.dienstarten.map((d) => {
      if (!d || typeof d !== "object") return d;
      const vorher = altD.get(String(d.id));
      const neu = { ...d };
      delete neu.ortGeaendertAm; delete neu.ortGeaendertVon;
      const geaendert = vorher
        ? !Object.is(vorher.ortModus, d.ortModus) || !Object.is(vorher.einsatzortId, d.einsatzortId)
        : d.ortModus !== undefined || d.einsatzortId !== undefined;
      if (geaendert) { neu.ortGeaendertAm = jetzt; neu.ortGeaendertVon = wer; }
      else if (vorher) {
        if (hat(vorher, "ortGeaendertAm")) neu.ortGeaendertAm = vorher.ortGeaendertAm;
        if (hat(vorher, "ortGeaendertVon")) neu.ortGeaendertVon = vorher.ortGeaendertVon;
      }
      return neu;
    });
  }
  delete aus.einsatzorteGeaendertAm; delete aus.einsatzorteGeaendertVon;
  const altO = altM && altM.einsatzorte;
  if (hat(neuM, "einsatzorte") && !gleichJson(neuM.einsatzorte, altO) && !(altO === undefined && Array.isArray(neuM.einsatzorte) && neuM.einsatzorte.length === 0)) {
    aus.einsatzorteGeaendertAm = jetzt; aus.einsatzorteGeaendertVon = wer;
  } else if (altM && hat(altM, "einsatzorteGeaendertAm")) {
    aus.einsatzorteGeaendertAm = altM.einsatzorteGeaendertAm;
    if (hat(altM, "einsatzorteGeaendertVon")) aus.einsatzorteGeaendertVon = altM.einsatzorteGeaendertVon;
  }
  return aus;
}

/* Jugendarbeitsschutz: „mehrschichtiger Betrieb" (§ 14 Abs. 2 Nr. 2
   JArbSchG, Nachprüfung WP-11). Mit der Einstellung dürfen Jugendliche ab 16
   Jahren bis 23 Uhr eingeteilt werden (sonst „Achtung" mit Bestätigung).
   Sie lockert eine Schutzprüfung — setzen darf sie, wer org.edit oder
   pattern.edit hat (Leitung, Kundenrolle, Planung; Nutzerentscheidung); für
   alle anderen bleibt der gespeicherte Wert.
   Gespeichert wird nur { mehrschichtig: boolean } und, vom Server, wann und
   von wem zuletzt geändert; alles andere weist der Server ab. */
const JUGENDSCHUTZ_FELDER = ["mehrschichtig"];
function jugendschutzZusammen(altM, neuM, sitzung, rolle) {
  if (!neuM || typeof neuM !== "object" || !neuM.einstellungen || typeof neuM.einstellungen !== "object") return { mandant: neuM };
  const altE = altM && altM.einstellungen && typeof altM.einstellungen === "object" ? altM.einstellungen : {};
  const e = { ...neuM.einstellungen };
  const alt = altE.jugendschutz && typeof altE.jugendschutz === "object" ? altE.jugendschutz : null;
  const neu = Object.prototype.hasOwnProperty.call(e, "jugendschutz") ? e.jugendschutz : alt;
  const behalten = () => {
    if (alt) e.jugendschutz = alt; else delete e.jugendschutz;
    return { mandant: { ...neuM, einstellungen: e } };
  };
  const wert = (j) => !!(j && typeof j === "object" && j.mehrschichtig === true);
  if (neu === alt || gleich(neu, alt)) return behalten();
  if (!darf(rolle, "org.edit") && !darf(rolle, "pattern.edit")) return behalten();
  if (neu === null || neu === undefined) { delete e.jugendschutz; return { mandant: { ...neuM, einstellungen: e } }; }
  if (typeof neu !== "object" || Array.isArray(neu)
    || Object.keys(neu).some((k) => !JUGENDSCHUTZ_FELDER.includes(k) && k !== "geaendertAm" && k !== "geaendertVon")
    || typeof neu.mehrschichtig !== "boolean")
    return { grund: "Jugendarbeitsschutz: erwartet wird { mehrschichtig: true oder false }." };
  if (alt && wert(alt) === neu.mehrschichtig) return behalten();
  e.jugendschutz = { mehrschichtig: neu.mehrschichtig, geaendertAm: new Date().toISOString(),
    geaendertVon: sitzung.person === undefined ? null : sitzung.person };
  return { mandant: { ...neuM, einstellungen: e } };
}

/* Planfreigabe als Pflicht (WP-23): `einstellungen.planFreigabePflicht`.
   Eingeschaltet (oder mit mindestens einer Freigabe) sehen Beschäftigte die
   Einteilungen eines nicht freigegebenen Monats nicht (planfreigabe.mjs,
   sicht.mjs). Schalten darf, wer org.edit hat (Leitung, Kundenrolle); für alle
   anderen — auch die Planung — bleibt der gespeicherte Wert. Erwartet wird
   true oder false, alles andere weist der Server ab. Wann und von wem, setzt
   der Server; mitgeschickte Werte dafür zählen nicht. Fehlt das Feld in der
   Übermittlung, bleibt der gespeicherte Wert (ein Client, der `einstellungen`
   ohne das Feld zurückschickt, schaltet nichts aus). */
const PLANFREIGABE_ZEIT = ["planFreigabePflichtGeaendertAm", "planFreigabePflichtGeaendertVon"];
function planFreigabeZusammen(altM, neuM, sitzung, rolle) {
  if (!neuM || typeof neuM !== "object") return { mandant: neuM };
  const altE = altM && altM.einstellungen && typeof altM.einstellungen === "object" ? altM.einstellungen : {};
  /* Fehlt `einstellungen` oder ist es kein Objekt (null, Text, Zahl), gilt wie bei einem fehlenden Feld der
     gespeicherte Stand — sonst schaltete die Planung den Entwurfsschutz mit einem Federstrich ab (Delta-Review WP-23b). */
  if (!neuM.einstellungen || typeof neuM.einstellungen !== "object") {
    if (!altM || !altM.einstellungen || typeof altM.einstellungen !== "object") return { mandant: neuM };
    return { mandant: { ...neuM, einstellungen: { ...altE } } };
  }
  const e = { ...neuM.einstellungen };
  const zurueck = () => {
    if ("planFreigabePflicht" in altE) e.planFreigabePflicht = altE.planFreigabePflicht; else delete e.planFreigabePflicht;
    for (const k of PLANFREIGABE_ZEIT) { if (k in altE) e[k] = altE[k]; else delete e[k]; }
    return { mandant: { ...neuM, einstellungen: e } };
  };
  const geschickt = Object.prototype.hasOwnProperty.call(e, "planFreigabePflicht") ? e.planFreigabePflicht : altE.planFreigabePflicht;
  if (!darf(rolle, "org.edit")) return zurueck();
  if (geschickt === undefined || geschickt === null) return zurueck();
  if (typeof geschickt !== "boolean") return { grund: "Planfreigabe: erwartet wird true oder false." };
  if (geschickt === (altE.planFreigabePflicht === true)) return zurueck();
  /* RB-3: Der Schalter entscheidet, ob Entwürfe vor Beschäftigten verborgen sind — also über den
     Veröffentlichungsstand. Ihn umlegen darf nur, wer auch verbindlich freigeben darf (plan.publish); die
     Altrolle „kunde" hat org.edit, aber nicht plan.publish. */
  if (!darfPlanFreigeben(rolle)) return { grund: PLAN_FREIGEBEN_GRUND };
  e.planFreigabePflicht = geschickt;
  e.planFreigabePflichtGeaendertAm = new Date().toISOString();
  e.planFreigabePflichtGeaendertVon = sitzung.person === undefined ? null : sitzung.person;
  return { mandant: { ...neuM, einstellungen: e } };
}

/* Freigaben (WP-23b, M2): `freigaben[JJJJ-MM]` hält den Entwurfsfilter am Leben (planfreigabe.mjs: ein
   freigegebener Monat genügt). Wer die Freigaben löschen kann, schaltet den Schutz ab — auch die Planung, die
   ihn nicht ausschalten dürfte. Deshalb:
   - Form: ein Objekt, neue oder geänderte Schlüssel `JJJJ-MM` mit einem Objekt als Wert; sonst abgewiesen.
     Fehlt das Feld (oder ist es null), bleibt der gespeicherte Stand.
   - Entfernen (Schlüssel fehlt oder Wert nicht wahr): nur mit org.edit. Für alle anderen kommt der gespeicherte
     Eintrag stillschweigend zurück (wie bei den übrigen Rechten).
   - Einrasten: Verliert ein Betrieb damit seine letzte Freigabe, setzt der Server `planFreigabePflicht` auf true,
     Wann/Wer vom Server — der Schutz fällt nicht stillschweigend weg. */
const FREIGABE_MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const FREIGABE_GRUND = "Freigaben: erwartet wird ein Objekt mit Einträgen je Monat (JJJJ-MM).";
/* RB-1: der eine Absagetext für jeden Freigabeweg ohne plan.publish. */
export const PLAN_FREIGEBEN_GRUND = "Dienstpläne verbindlich freigeben dürfen nur Leitung und Planung (plan.publish).";

/* RB-1: Der Planstand zum Freigabezeitpunkt (m.planstaende[JJJJ-MM]) gehört zur Freigabe. Ohne plan.publish
   ist eine Änderung daran eine Absage; ein fehlendes oder unverändertes Feld stört nicht. */
function planstaendeZusammen(altM, neuM, rolle) {
  if (!neuM || typeof neuM !== "object" || darfPlanFreigeben(rolle)) return {};
  if (!Object.prototype.hasOwnProperty.call(neuM, "planstaende") || neuM.planstaende === undefined) return {};
  const alt = altM && altM.planstaende && typeof altM.planstaende === "object" ? altM.planstaende : {};
  const neu = neuM.planstaende && typeof neuM.planstaende === "object" ? neuM.planstaende : {};
  return gleichJson(alt, neu) ? {} : { grund: PLAN_FREIGEBEN_GRUND };
}

/* RB-3: der Absagetext für eine unmittelbar eingetragene, geänderte oder entfernte Krankheit ohne Recht zur endgültigen Bestätigung. */
export const KRANK_ENDGUELTIG_GRUND = "Krank-Abwesenheiten eintragen, ändern oder entfernen (endgültige Bestätigung) dürfen nur Planung und Leitung.";

/* RB-3 (Betreiberentscheidung 2026-11-11): Planung und Leitung tragen eine Krankheit über PUT /api/bestand
   unmittelbar als Abwesenheit ein — das ist selbst die endgültige Bestätigung (RB-2). Eine Rolle mit
   Vollschreibrecht OHNE dieses Recht (die Altrolle „kunde") darf keine Krank-Abwesenheit anlegen, keine andere
   Abwesenheit zu „krank“ machen und eine wirksame (gespeicherte) Krank-Abwesenheit weder ändern (Art, Person,
   Zeitraum, halber Tag, Stunden, jedes andere Feld) noch entfernen — das hebt eine endgültige Bestätigung
   mittelbar auf (Review PR #206). Erlaubt bleibt nur eine geänderte Anmerkung (`notiz`); Abwesenheiten
   anderer Art legt sie weiter an und ändert sie. Fehlt das Feld `abwesenheiten`, gilt es als unverändert. */
const ohneNotiz = (a) => JSON.stringify(Object.keys(a).filter((k) => k !== "notiz").sort().map((k) => [k, a[k]]));
function krankUnmittelbarZusammen(altM, neuM, rolle) {
  if (krankSchrittErlaubt(rolle, "endgueltig")) return {};
  if (!neuM || typeof neuM !== "object" || !Array.isArray(neuM.abwesenheiten)) return {};
  const istE = (a) => !!a && typeof a === "object" && !Array.isArray(a);
  const alt = new Map((altM && Array.isArray(altM.abwesenheiten) ? altM.abwesenheiten : [])
    .filter(istE).map((a) => [String(a.id), a]));
  const neu = new Map(neuM.abwesenheiten.filter(istE).map((a) => [String(a.id), a]));
  for (const e of neu.values()) {
    if (e.art !== "krank") continue;
    const v = alt.get(String(e.id));
    if (!v || v.art !== "krank") return { grund: KRANK_ENDGUELTIG_GRUND };          // neu oder zu „krank“ gemacht
  }
  for (const [id, v] of alt) {
    if (v.art !== "krank") continue;
    const e = neu.get(id);
    if (!e || ohneNotiz(e) !== ohneNotiz(v)) return { grund: KRANK_ENDGUELTIG_GRUND }; // entfernt oder geändert
  }
  return {};
}
/** @returns {{ grund?: string, mandant?: any }} */
function freigabenZusammen(altM, neuM, sitzung, rolle) {
  if (!neuM || typeof neuM !== "object") return { mandant: neuM };
  const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const altF = altM && istObj(altM.freigaben) ? altM.freigaben : {};
  const geschickt = neuM.freigaben;
  if (geschickt === undefined || geschickt === null) {
    if (!Object.keys(altF).length && !(altM && "freigaben" in altM)) return { mandant: neuM };
    return { mandant: { ...neuM, freigaben: altF } };
  }
  if (!istObj(geschickt)) return { grund: FREIGABE_GRUND };
  for (const [k, v] of Object.entries(geschickt)) {
    if (Object.prototype.hasOwnProperty.call(altF, k) && gleichJson(altF[k], v)) continue;
    if (!FREIGABE_MONAT.test(k) || !istObj(v)) return { grund: FREIGABE_GRUND };
  }
  const neuF = { ...geschickt };
  /* RB-1: Freigeben, erneut freigeben (neuer Stand) und jede andere Änderung an einem Eintrag nur mit
     plan.publish (darfPlanFreigeben) — ausdrücklich geprüft, nicht nur über den Schreibumfang. Eine Rolle
     ohne das Recht bekommt eine Absage; nichts davon wird gespeichert. */
  const freigeben = darfPlanFreigeben(rolle);
  if (!freigeben && Object.keys(neuF).some((k) => !gleichJson(altF[k], neuF[k])))
    return { grund: PLAN_FREIGEBEN_GRUND };
  /* Zurücknehmen: org.edit (WP-23b) und plan.publish. Für alle anderen kommt der gespeicherte Eintrag zurück. */
  if (!darf(rolle, "org.edit") || !freigeben)
    for (const k of Object.keys(altF)) if (MONAT_FORM_WAHR(altF, k) && !neuF[k]) neuF[k] = altF[k];
  let mandant = { ...neuM, freigaben: neuF };
  if (freigegebeneMonate({ freigaben: altF }).size > 0 && freigegebeneMonate({ freigaben: neuF }).size === 0
    && !planFreigabePflicht(mandant)) {
    const e = mandant.einstellungen && typeof mandant.einstellungen === "object" ? { ...mandant.einstellungen }
      : (altM && altM.einstellungen && typeof altM.einstellungen === "object" ? { ...altM.einstellungen } : {});
    e.planFreigabePflicht = true;
    e.planFreigabePflichtGeaendertAm = new Date().toISOString();
    e.planFreigabePflichtGeaendertVon = sitzung.person === undefined ? null : sitzung.person;
    mandant = { ...mandant, einstellungen: e };
  }
  return { mandant };
}
const MONAT_FORM_WAHR = (f, k) => /^\d{4}-\d{2}$/.test(k) && !!f[k];

/** Wie viele Freigaben wurden zurückgenommen (für das Betriebsprotokoll, ohne Inhalt)? */
export function freigabeRuecknahmen(altB, neuB) {
  const liste = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter((m) => m && typeof m === "object");
  const neu = new Map(liste(neuB).map((m) => [m.id, freigegebeneMonate(m)]));
  let n = 0;
  for (const m of liste(altB)) {
    const jetzt = neu.get(m.id);
    if (!jetzt) continue;
    for (const k of freigegebeneMonate(m)) if (!jetzt.has(k)) n++;
  }
  return n;
}

/* Einwilligungen nach dem Mutterschutzgesetz an der Person (Nutzerentscheidung,
   WP-11): § 5 Abs. 2 (Art „nacht", 20–22 Uhr) und § 6 Abs. 1 (Art „sonntag"),
   Zeitraum ab/bis, optional „behördliche Genehmigung liegt vor" (§ 28).
   Schreiben nur die Rollen, die Schutzmerkmale schreiben (Planung, Leitung,
   Kundenrolle — der volle Schreibumfang; alle anderen bekommen das Feld nicht
   und füllen es aus dem gespeicherten Stand). Der Server prüft die Form und
   setzt an jedem neuen oder geänderten Eintrag, wann und von wem. */
const EINWILLIGUNG_FELDER = ["art", "ab", "bis", "genehmigung", "geaendertAm", "geaendertVon"];
/** @returns {{ grund?: string, mandant?: any }} */
function einwilligungenZusammen(altM, neuM, sitzung) {
  if (!neuM || !Array.isArray(neuM.personen)) return { mandant: neuM };
  const alt = new Map((altM && Array.isArray(altM.personen) ? altM.personen : []).filter((p) => p && typeof p === "object").map((p) => [String(p.id), p]));
  const grund = "Einwilligungen (Mutterschutz): erwartet wird eine Liste aus { art: \"nacht\" oder \"sonntag\", ab, bis (Pflicht, nicht vor ab), genehmigung }.";
  const istTag = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  let fehler = null;
  const personen = neuM.personen.map((p) => {
    if (fehler || !p || typeof p !== "object" || !Object.prototype.hasOwnProperty.call(p, "mutterschutzEinwilligungen")) return p;
    const a = alt.get(String(p.id));
    const vorher = a && Array.isArray(a.mutterschutzEinwilligungen) ? a.mutterschutzEinwilligungen : [];
    const l = p.mutterschutzEinwilligungen;
    if (l === null || (Array.isArray(l) && !l.length)) { const q = { ...p }; if (vorher.length) q.mutterschutzEinwilligungen = []; else delete q.mutterschutzEinwilligungen; return q; }
    if (gleich(l, vorher)) return p;
    if (!Array.isArray(l) || l.length > 20) { fehler = grund; return p; }
    const sauber = [];
    for (const e of l) {
      if (!e || typeof e !== "object" || Array.isArray(e) || Object.keys(e).some((k) => !EINWILLIGUNG_FELDER.includes(k))
        || !EINWILLIGUNG_ARTEN.includes(e.art) || !istTag(e.ab)
        || !(istTag(e.bis) && e.bis >= e.ab)                                   // Ende Pflicht (Review N1)
        || !(e.genehmigung === undefined || typeof e.genehmigung === "boolean")) { fehler = grund; return p; }
      const kern = { art: e.art, ab: e.ab, bis: e.bis || null, ...(e.genehmigung ? { genehmigung: true } : {}) };
      const gleicherAlter = vorher.find((v) => v && v.art === kern.art && v.ab === kern.ab && (v.bis || null) === kern.bis && !!v.genehmigung === !!kern.genehmigung);
      /* Nicht rückwirkend (Nachprüfung 9717ddf): Eine neue Einwilligung beginnt frühestens heute;
         ein bestehender Beginn darf bleiben (etwa beim Verlängern), aber nicht vorverlegt werden. */
      if (!gleicherAlter && kern.ab < heuteBerlin() && !vorher.some((v) => v && v.art === kern.art && v.ab === kern.ab)) {
        fehler = "Einwilligungen (Mutterschutz): Eine neue Einwilligung beginnt frühestens heute — rückwirkend lässt sie sich nicht erfassen."; return p; }
      sauber.push(gleicherAlter ? gleicherAlter
        : { ...kern, geaendertAm: new Date().toISOString(), geaendertVon: sitzung.person === undefined ? null : sitzung.person });
    }
    return { ...p, mutterschutzEinwilligungen: sauber };
  });
  return fehler ? { grund: fehler } : { mandant: { ...neuM, personen } };
}

/** Wie viele Personen haben geänderte Einwilligungen (für das Betriebsprotokoll, ohne Inhalt)? */
export function einwilligungsAenderungen(altB, neuB) {
  const liste = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter((m) => m && typeof m === "object");
  const altP = new Map();
  for (const m of liste(altB)) for (const p of (Array.isArray(m.personen) ? m.personen : [])) if (p) altP.set(`${m.id}|${p.id}`, p.mutterschutzEinwilligungen || []);
  let n = 0;
  for (const m of liste(neuB)) for (const p of (Array.isArray(m.personen) ? m.personen : []))
    if (p && !gleich(altP.get(`${m.id}|${p.id}`) || [], p.mutterschutzEinwilligungen || [])) n++;
  return n;
}

/** Den Betrieb finden, auf den die Sitzung zeigt. */
export function eigenerMandant(bestand, sitzung) {
  if (!bestand || !Array.isArray(bestand.mandanten) || !bestand.mandanten.length) return null;
  const i = Number(sitzung.betrieb);
  if (Number.isInteger(i) && i >= 0 && i < bestand.mandanten.length) return bestand.mandanten[i];
  return bestand.mandanten[0];
}

/* --------------------------------------------------------------------------
   SCHREIBEN — was darf zurück?

   Der Kniff: Statt den übermittelten Bestand zu prüfen und bei einem
   Verstoß abzulehnen, wird er gar nicht erst übernommen. Der gespeicherte
   Stand ist die Grundlage, und aus der Übermittlung wandern nur die
   erlaubten Felder hinein.

   Das ist strenger als eine Prüfung und zugleich freundlicher: Eine
   Oberfläche, die versehentlich zu viel mitschickt, verursacht keinen
   Fehler — der Überschuss wird schlicht verworfen.
   -------------------------------------------------------------------------- */

/* Felder, die bestandFuerRolle je nach Rolle entfernt. Was beim Lesen nicht
   mitkommt, darf beim Schreiben nicht verschwinden — sonst löscht jeder
   Speichervorgang genau das, was die Rolle nie zu Gesicht bekam.

   Das war ein echter Fehler: Seit der Einführung der Leseschicht entfernte
   jeder Schreibvorgang der Leitung das betriebsweite Protokoll, weil es in
   ihrer Antwort nicht enthalten war. Aufgefallen ist es erst, als die
   Zerlegung nach Monaten daraus Scheinkonflikte machte — zwei Planer
   „änderten" beide den Kern, obwohl keiner ihn angefasst hatte. */
const GEFILTERTE_FELDER = ["betreiber", "rechnungen", "tarife", "protokoll"];

function verlorenesZurueck(gespeichert, uebermittelt) {
  if (!gespeichert || typeof gespeichert !== "object") return uebermittelt;
  if (!uebermittelt || typeof uebermittelt !== "object") return uebermittelt;
  const aus = { ...uebermittelt };
  for (const feld of GEFILTERTE_FELDER) {
    if (!(feld in uebermittelt) && feld in gespeichert) aus[feld] = gespeichert[feld];
  }
  /* Dasselbe je Betrieb: mitarbeiter und betriebsrat bekommen protokoll und
     aenderungen nicht — die dürfen ihnen nicht abhandenkommen. */
  if (Array.isArray(aus.mandanten) && Array.isArray(gespeichert.mandanten)) {
    aus.mandanten = aus.mandanten.map((m) => {
      if (!m || !m.id) return m;
      const alt = gespeichert.mandanten.find((x) => x && x.id === m.id);
      /* Ein Betrieb, den es gespeichert nicht gibt, kommt ohne Vertragsfelder
         an. Sonst ließe sich ein zweiter Mandant mit erfundenem Status oder
         Selbststart-Merkmalen einschleusen — der gespeicherte Betrieb bleibt
         davon unberührt (siehe unten), aber der Löschlauf soll auch im Kern
         nichts vorfinden, was der Server nicht selbst geschrieben hat. */
      if (!alt) {
        const ohne = { ...m };
        for (const feld of [...VERTRAGSFELDER, ...BETREIBERSTAMM]) delete ohne[feld];
        return ohne;
      }
      const zusammen = { ...m };
      for (const feld of ["protokoll", "aenderungen"]) {
        if (!(feld in m) && feld in alt) zusammen[feld] = alt[feld];
      }
      /* Vertragsfelder gehen immer auf den gespeicherten Stand zurück —
         nicht nur, wenn sie fehlen. Ein Betrieb bekommt sie zu sehen, aber
         ändern darf sie nur der Betreiber, und der nimmt diesen Weg nicht. */
      for (const feld of [...VERTRAGSFELDER, ...BETREIBERSTAMM]) {
        if (feld in alt) zusammen[feld] = alt[feld];
        else delete zusammen[feld];
      }
      return zusammen;
    });
    /* Betriebe, die der Rolle nicht ausgeliefert wurden, bleiben bestehen. */
    for (const alt of gespeichert.mandanten) {
      if (alt && alt.id && !aus.mandanten.some((m) => m && m.id === alt.id))
        aus.mandanten.push(alt);
    }
  }
  return aus;
}

/* Wer Rollen vergibt, tut das über den gewöhnlichen Schreibweg: Die
   Oberfläche schickt den Betrieb mit geänderter `rolle` an einer Person.
   Der Server muss die Änderung deshalb selbst finden.

   Eine generische Kundenrolle zählt als Leitung — sie hat denselben
   Schreibumfang und soll darum auch dieselbe Vergabehöhe haben, nicht
   mehr. */
export function rollenwechselErlaubt(gespeichert, uebermittelt, sitzung) {
  const rolle = sitzung.rolle === "kunde" ? "leitung" : sitzung.rolle;
  if (!RANG[rolle]) return { ok: true, grund: null };
  const alt = eigenerMandant(gespeichert, sitzung);
  const neu = eigenerMandant(uebermittelt, sitzung);
  /* Ohne beide Seiten gibt es keinen Wechsel zu erkennen — ein neu
     angelegter Betrieb bringt sein Personal mit und wird anderswo
     geprüft. */
  if (!alt || !neu) return { ok: true, grund: null };

  /* Der leere Betrieb ist der Sonderfall, an dem die Regel sonst zerbricht.

     Ein selbst gestarteter Betrieb hat beim ersten Anmelden niemanden. Die
     Anwendung legt dann die Person an, die den Zugangscode in der Hand
     hält — mit der Rolle aus dem Code, also in aller Regel „leitung". Nach
     der Regel „niemand vergibt die eigene Rolle" wäre genau das verboten,
     und der Betrieb käme nie über den ersten Bildschirm hinaus. Beim
     Sichttest lief er prompt in „Keine Schreibberechtigung".

     Wo niemand ist, ist auch niemand zu schützen: Die erste Person darf
     die Rolle ihres Codes tragen. Ab der zweiten greift der Rang. */
  if (!Array.isArray(alt.personen) || alt.personen.length === 0)
    return { ok: true, grund: null };

  return pruefeRollenwechsel(alt.personen, neu.personen, rolle);
}

/* Abgeleitete Personenfelder (planungsregeln, sichtbereich) entstehen beim
   Lesen und werden nie gespeichert — mitgeschickt, verändert oder gelöscht
   bleiben sie ohne Wirkung (Commit S1). */
function abgeleiteteEntfernen(uebermittelt) {
  if (!uebermittelt || typeof uebermittelt !== "object" || !Array.isArray(uebermittelt.mandanten)) return uebermittelt;
  const ohne = (p) => (p && typeof p === "object" && ABGELEITETE_PERSONENFELDER.some((f) => Object.prototype.hasOwnProperty.call(p, f))
    ? Object.fromEntries(Object.entries(p).filter(([k]) => !ABGELEITETE_PERSONENFELDER.includes(k))) : p);
  /* sichtIstDaten (E1) entsteht nur in der Antwort — wie die abgeleiteten
     Personenfelder wird es vor dem Zusammenführen entfernt, nie gespeichert. */
  /* Ebenso die Auswertung für den Betriebsrat (WP-27). */
  const ohneVermerk = (m) => {
    /* Ebenso die Markierung „Besetzung klärungsbedürftig“ (RB-5, klaerung.mjs): mitgeschickt, verändert oder
       gelöscht ohne Wirkung — sie entsteht beim Lesen allein aus den offenen Fällen. */
    if (!m || typeof m !== "object" || (!("sichtIstDaten" in m) && !("auswertungBetriebsrat" in m) && !("klaerung" in m))) return m;
    const { sichtIstDaten, auswertungBetriebsrat, klaerung, ...rest } = m; // eslint-disable-line no-unused-vars
    return rest;
  };
  return { ...uebermittelt, mandanten: uebermittelt.mandanten.map((m0) => {
    const m = ohneVermerk(m0);
    return m && typeof m === "object" && Array.isArray(m.personen) ? { ...m, personen: m.personen.map(ohne) } : m;
  }) };
}

/** Zusammenführen für jede Rolle — das Ergebnis trägt session: null
    (Commit D1b): Ein mitgeschickter Inhalt wird verworfen, ein gespeicherter
    Altinhalt beim Schreiben bereinigt. session am Betrieb (Commit D1c)
    verschwindet auf beiden Seiten schon vorher — sonst hielte die
    Einheitsprüfung einen Altinhalt für eine Änderung und wiese ab. */
export function zusammenfuehren(gespeichert, uebermitteltRoh, sitzung, optionen = {}) {
  offenePruefung = null;
  /* WP-48.3 (Befund WP48-TEILSPEICHERUNG.md §7): Abgeleitete Felder werden nie gespeichert. Trägt ein
     gespeicherter Altinhalt trotzdem eines (planungsregeln, sichtbereich an einer Person), galt das unveränderte
     Zurückschreiben als Änderung — die Schichtverantwortung bekam 403, die Teilspeicherung erbte das. Deshalb
     auf beiden Seiten dieselbe Entfernung: Ohne Wirkung bleibt ein abgeleitetes Feld jetzt auch im Altinhalt;
     der nächste Schreibvorgang räumt es weg. Keine Rechteprüfung ändert sich — verglichen wird nur Gleiches mit Gleichem. */
  const aus = zusammenfuehrenKern(ohneBetriebsSession(abgeleiteteEntfernen(gespeichert)), ohneBetriebsSession(uebermitteltRoh), sitzung, optionen);
  const ergebnis = aus && typeof aus === "object" && !Array.isArray(aus) && !aus.verweigert
    ? { ...ohneBetriebsSession(aus), session: null } : aus;
  if (offenePruefung && ergebnis && typeof ergebnis === "object" && !ergebnis.verweigert) OFFENE_PRUEFUNG.set(ergebnis, offenePruefung);
  offenePruefung = null;
  return ergebnis;
}

/* Fachprüfung außerhalb (Review B2): Mit { fachpruefung: "aussen" } prüft
   zusammenfuehren nicht selbst, sondern legt die Eingaben ab; daten.mjs holt
   sie mit fachpruefungOffen(ergebnis) und prüft in Häppchen
   (fachpruefungUebermittlungAsync), ohne die Event-Loop zu blockieren. */
const OFFENE_PRUEFUNG = new WeakMap();
let offenePruefung = null;
/** @returns {null | { alt: any, neu: any, mandantId: any, imBereich: null | ((pid: any, tag: string) => boolean) }} */
export const fachpruefungOffen = (ergebnis) => (ergebnis && typeof ergebnis === "object" ? OFFENE_PRUEFUNG.get(ergebnis) || null : null);

/** Der Schreibumfang der Schichtverantwortung für die Fachprüfung (Review B4): eigene Person oder eigener Bereich am Tag. */
function schichtBereich(altM, sitzung) {
  const personen = new Map((Array.isArray(altM.personen) ? altM.personen : []).filter(Boolean).map((p) => [String(p.id), p]));
  const ich = sitzung.person === null || sitzung.person === undefined ? null : personen.get(String(sitzung.person));
  const eigene = ich ? eigeneEinheit(altM, ich) : null;
  return (pid, tag) => {
    if (ich && String(pid) === String(ich.id)) return true;
    const p = personen.get(String(pid));
    return !!p && !!eigene && einheitAm(p, tag) === eigene;
  };
}

/** Trägt die vom Server gezählte Anzahl in neue Sammelbestätigungen ein (Review B1). */
export function sammelAnzahlSetzen(mandant, sammel, altM = null) {
  if (!mandant || !Array.isArray(mandant.bestaetigungen)) return mandant;
  /* Review S1: Anzahl und Zeitraum aus dem, was die Sammelbestätigung tatsächlich
     deckt; eine neue, die nichts deckt, wird nicht gespeichert. */
  const alt = new Set((altM && Array.isArray(altM.bestaetigungen) ? altM.bestaetigungen : []).filter(Boolean).map((b) => String(b.id)));
  const s = sammel || {};
  return { ...mandant, bestaetigungen: mandant.bestaetigungen
    .filter((b) => !(b && b.art === "sammel" && !alt.has(String(b.id)) && !Object.prototype.hasOwnProperty.call(s, String(b.id))))
    .map((b) => (b && b.art === "sammel" && Object.prototype.hasOwnProperty.call(s, String(b.id))
      ? { ...b, anzahl: s[String(b.id)].anzahl, von: s[String(b.id)].von, bis: s[String(b.id)].bis, datum: s[String(b.id)].von } : b)) };
}

function zusammenfuehrenKern(gespeichert, uebermitteltRoh, sitzung, optionen = {}) {
  /* Unbekannte Rolle schreibt nicht (Commit D1d) — vorher machte
     „|| kunde" aus einer leeren Bezeichnung das volle Schreibrecht. */
  if (!sitzung || !sitzungsRolleBekannt(sitzung.rolle)) return null;
  const uebermittelt = abgeleiteteEntfernen(uebermitteltRoh);
  const rolle = sitzung.rolle;
  const umfang = schreibumfang(rolle);
  if (umfang === SCHREIBEN_NEIN) return null;

  if (umfang === SCHREIBEN_VOLL || umfang === SCHREIBEN_EINHEIT) {
    const ort = gespeicherterBetrieb(gespeichert, sitzung);

    /* Ein leerer Raum wird nicht über diesen Weg befüllt. Bis Oktober 2026
       schrieb hier der erste Client den ganzen Bestand und bestimmte damit
       Anzahl, Kennungen und Reihenfolge der Betriebe. Einen Raum richtet
       jetzt der Betreiber über /api/bestand-anlegen ein (erstbefuellung.mjs). */
    if (!ort) return { verweigert: "Raum ist noch nicht eingerichtet." };

    /* Ab hier gibt es einen gespeicherten Bestand, und der Server bestimmt
       seine Gestalt: wie viele Betriebe, welche Kennungen, welche
       Reihenfolge — und welcher davon zu dieser Sitzung gehört.

       Bis Oktober 2026 kam die Liste der Betriebe aus der Übermittlung.
       Zwei Folgen: Ein zweites Exemplar des eigenen Betriebs mit fremden
       Änderungen ging an der Einheitsprüfung vorbei, und nicht
       mitgeschickte Betriebe wurden hinten angehängt. In einem Raum mit
       mehreren Betrieben verschob das die Reihenfolge — und weil Sitzungen
       ihren Betrieb über den Index finden, sah danach die Leitung von A
       den Betrieb B. */
    const abweichung = einzigerEigenerBetrieb(uebermittelt, ort.betrieb.id);
    if (abweichung) return { verweigert: abweichung };
    let geschickt = uebermittelt.mandanten[0];
    /* RB-2: Die Fälle der zweistufigen Krankmeldung (`krankmeldungen`) gehören dem Server. Ihren Status ändert
       nur POST /api/krankmeldung; mitgeschickt ist das Feld für jede Rolle wirkungslos (auch eine veraltete
       oder gekürzte Kopie aus der Sicht). Neue Fälle entstehen hier nur aus einer Krankmeldung der
       Schichtverantwortung (einheitZusammen). */
    if (geschickt && typeof geschickt === "object") {
      const { krankmeldungen: _weg, ...ohneFaelle } = geschickt; // eslint-disable-line no-unused-vars
      geschickt = Object.prototype.hasOwnProperty.call(ort.betrieb, "krankmeldungen")
        ? { ...ohneFaelle, krankmeldungen: ort.betrieb.krankmeldungen } : ohneFaelle;
    }

    /* Dienstarten (WP-22, Nutzerentscheidung): anlegen, ändern und löschen,
       wer org.edit oder pattern.edit hat (Leitung, Kundenrolle, Planung — die
       Planung behält die Einrichtung). Alle anderen Rollen weist der Server
       ab; eine unveränderte Kopie stört nicht. */
    if (!darf(rolle, "org.edit") && !darf(rolle, "pattern.edit") && geschickt && typeof geschickt === "object"
      && hat(geschickt, "dienstarten") && !gleichJson(geschickt.dienstarten, ort.betrieb.dienstarten))
      return { verweigert: "Dienstarten legen Leitung und Planung an und ändern sie (org.edit oder pattern.edit)." };

    /* Mitteilungen: Notruf- und Tauschmitteilungen des Clients verworfen,
       Zustellwege und -status aus dem gespeicherten Stand, Grenzen für
       Titel und Text (Commit 4, mitteilungen.mjs). */
    /* Ausnahmeweg Art. 16/17 DSGVO für Daten ausgeschalteter Branchenmodule (modulschreibwege.mjs):
       Die Angabe ist kein Betriebsfeld (die Rückfüllung unten verwirft sie) — sie wird hier gemerkt
       und nur dem Modulschreibweg übergeben, gespeichert wird sie nie. */
    const moduldatenAusnahme = geschickt && typeof geschickt === "object" && hat(geschickt, "moduldatenAusnahme")
      ? geschickt.moduldatenAusnahme : undefined;
    const vorgefiltert = mitteilungenVorfiltern(ort.betrieb, geschickt, { planFreigegebenErlaubt: darfPlanFreigeben(rolle) });
    if (vorgefiltert.grund) return { verweigert: vorgefiltert.grund };
    geschickt = vorgefiltert.mandant;

    /* Planung und Leitung: verborgene Felder aus dem gespeicherten Stand. */
    if (umfang === SCHREIBEN_VOLL) {
      geschickt = vollRueckfuellen(ort.betrieb, geschickt, sitzung);
      /* Monatsabschluss (WP-16): abgeschlossen und wiedergeöffnet wird nur über POST /api/monatsabschluss —
         mitgeschickt ist er wirkungslos (auch eine veraltete Kopie überschreibt ihn nicht). */
      geschickt = abschlussAusGespeichert(ort.betrieb, geschickt);
      /* Geo-Prüfung beim Stempeln (E7): schalten darf nur die Leitung. */
      const schalter = geoSchalterZusammen(ort.betrieb, geschickt, sitzung, rolle);
      if (schalter.grund) return { verweigert: schalter.grund };
      geschickt = schalter.mandant;
      /* Offline-Stempel vertrauen (WP-07): nur org.edit, Wann/Wer vom Server. */
      geschickt = offlineSchalterZusammen(ort.betrieb, geschickt, sitzung, rolle);
      /* Ortsangaben der Dienstarten und Einsatzorte: Wann/Wer vom Server (WP-20, M1). */
      geschickt = ortAngabenZusammen(ort.betrieb, geschickt, sitzung);
      /* Jugendarbeitsschutz „mehrschichtig" (Nachprüfung WP-11): nur org.edit. */
      const jugend = jugendschutzZusammen(ort.betrieb, geschickt, sitzung, rolle);
      if (jugend.grund) return { verweigert: jugend.grund };
      geschickt = jugend.mandant;
      /* Planfreigabe als Pflicht (WP-23): nur org.edit; Form und Wann/Wer vom Server. */
      const freigabe = planFreigabeZusammen(ort.betrieb, geschickt, sitzung, rolle);
      if (freigabe.grund) return { verweigert: freigabe.grund };
      geschickt = freigabe.mandant;
      /* Freigaben (WP-23b): Form, Entfernen nur mit org.edit, Einrasten des Schutzes. */
      const freigaben = freigabenZusammen(ort.betrieb, geschickt, sitzung, rolle);
      if (freigaben.grund) return { verweigert: freigaben.grund };
      geschickt = freigaben.mandant;
      /* Planstände (RB-1): wie die Freigabe nur mit plan.publish. */
      const staende = planstaendeZusammen(ort.betrieb, geschickt, rolle);
      if (staende.grund) return { verweigert: staende.grund };
      /* RB-3: Eine Krank-Abwesenheit unmittelbar eintragen ist die endgültige Bestätigung (RB-2) — nur Planung
         und Leitung, nicht die Altrolle „kunde" mit ihrem Vollschreibrecht. */
      const krankUnm = krankUnmittelbarZusammen(ort.betrieb, geschickt, rolle);
      if (krankUnm.grund) return { verweigert: krankUnm.grund };
      /* Branchenmodule (WP-19): Schalter und Parameter nur mit org.edit, Form und Wann/Wer vom Server. */
      const module = branchenmoduleZusammen(ort.betrieb, geschickt, sitzung, darf(rolle, "org.edit"));
      if (module.grund) return { verweigert: module.grund };
      geschickt = module.mandant;
      /* Anlagen (WP-19): Form von Mindestbesetzung und Laufzeit an Betriebsmitteln der Art „anlage“. */
      const anlagen = anlagenZusammen(geschickt, ort.betrieb);
      if (anlagen.grund) return { verweigert: anlagen.grund };
      /* Maschinenqualifikationen (WP-19): befähigte Person und Wiederholung an Kompetenzen zu Anlagen. */
      const maschinen = maschinenqualZusammen(geschickt, ort.betrieb);
      if (maschinen.grund) return { verweigert: maschinen.grund };
      /* Geteilte Dienste (WP-19): Form des zweiten Abschnitts einer Dienstart. */
      const geteilt = geteilterdienstZusammen(geschickt, ort.betrieb);
      if (geteilt.grund) return { verweigert: geteilt.grund };
      /* Posten (WP-19): Form von Objekten und Postenplan, nur Neues oder Geändertes streng. */
      const posten = postenZusammen(geschickt, ort.betrieb);
      if (posten.grund) return { verweigert: posten.grund };
      /* Bereichsplan (WP-19): Bereiche je Einheit und Zuordnung, nur Neues oder Geändertes streng. */
      const bereiche = bereichsplanZusammen(geschickt, ort.betrieb);
      if (bereiche.grund) return { verweigert: bereiche.grund };
      /* Einwilligungen nach dem Mutterschutzgesetz: Form und Wann/Wer vom Server. */
      const einw = einwilligungenZusammen(ort.betrieb, geschickt, sitzung);
      if (einw.grund) return { verweigert: einw.grund };
      geschickt = einw.mandant;
      /* Empfehlung 948a4ba: Schutzangaben entfernt — die Leitung erfährt es ohne Inhalt. */
      geschickt = schutzEntferntMitteilungen(ort.betrieb, geschickt, sitzung.person);
      /* Dienstbuch und Übergaben (Commit C2): einheitId nur bekannt oder null. */
      const bezug = einheitsbezugVoll(ort.betrieb, geschickt, sitzung);
      if (bezug.grund) return { verweigert: bezug.grund };
      geschickt = bezug.mandant;
      /* Bestätigungsprotokoll (WP-10 d.1): nur anhängen, Wer und Zeit vom Server. */
      if (hat(geschickt, "bestaetigungen")) {
        const best = bestaetigungenZusammen(ort.betrieb, geschickt.bestaetigungen, sitzung, null);
        if (best.grund) return { verweigert: best.grund };
        geschickt = { ...geschickt, bestaetigungen: best.liste };
      }
      /* Selbstplanung, „nicht übernommen" (Review K1): nur Person, Tag, Dienst
         und eine Grund-Kennung — nie ein Befundtext. Unbekannte Gründe werden
         „befund", Ungültiges fällt weg (selbstplanung.mjs). */
      /* Unverändert Zurückgeschicktes bleibt der gespeicherte Stand (ein
         Rundweg ändert nichts); Altbestand mit Text geht ohnehin nur an Planung
         und Leitung — Beschäftigte und Schichtverantwortung lesen Kennungen. */
      if (Array.isArray(geschickt.selbstplanung) && geschickt.selbstplanung.some((r) => r && Array.isArray(r.nichtUebernommen))) {
        const gespeichert = new Map((Array.isArray(ort.betrieb.selbstplanung) ? ort.betrieb.selbstplanung : [])
          .filter((r) => r && typeof r === "object").map((r) => [String(r.id), r]));
        geschickt = { ...geschickt, selbstplanung: geschickt.selbstplanung.map((r) => {
          if (!r || typeof r !== "object" || !Array.isArray(r.nichtUebernommen)) return r;
          const vorher = gespeichert.get(String(r.id));
          if (vorher && gleich(vorher.nichtUebernommen, r.nichtUebernommen)) return r;
          return { ...r, nichtUebernommen: nichtUebernommenNormal(r.nichtUebernommen) };
        }) };
      }
    }

    /* Die Schichtverantwortung: Feld für Feld gegen den gespeicherten Stand
       (siehe einheitZusammen). Weiter geht nur, was dabei herauskommt. */
    if (umfang === SCHREIBEN_EINHEIT) {
      geschickt = schichtRueckfuellen(ort.betrieb, geschickt, sitzung);
      /* Monatsabschluss (WP-16): immer der gespeicherte Stand — die verkürzte Form der Sicht ist keine Änderung. */
      geschickt = abschlussAusGespeichert(ort.betrieb, geschickt);
      const urteil = einheitZusammen(ort.betrieb, geschickt, sitzung);
      if (!urteil.ok) return { verweigert: urteil.grund };
      geschickt = urteil.mandant;
    }
    /* Branchenmodule (WP-19.0): Daten ausgeschalteter Module nur lesbar (G3), danach die Schreibwege
       der Module aus MODUL_SCHREIBWEGE — der eine Einhängepunkt für Planung, Leitung und
       Schichtverantwortung (server/lib/modulschreibwege.mjs). */
    {
      /* Die Angabe immer übergeben, auch undefined: Ein gespeichertes Feld, das die Rückfüllung wieder
         eingesetzt hat, darf nie als Angabe gelten (zweiter Opus-Review H1 — es sperrte jedes Speichern). */
      /* optionen.liste: nur Prüfungen (Abnahmematrix WP-19.13, Prüfmodus „vorlaeufig“) — kein HTTP-Weg übergibt sie,
         ohne sie gilt die Registry (server/lib/branchenmodule.mjs). */
      const nurPruefung = Array.isArray(optionen.liste) ? { liste: optionen.liste } : {};
      const modulweg = modulSchreibwegeAnwenden(ort.betrieb, geschickt, { ...nurPruefung, sitzung, rolle, umfang, darfOrgEdit: darf(rolle, "org.edit"),
        ausnahme: moduldatenAusnahme });
      if (modulweg.grund) return { verweigert: modulweg.grund };
      geschickt = modulweg.mandant;
    }
    /* Harte Schutzregeln setzt der Server selbst durch (WP-11, B2): Eine neue
       oder geänderte Einteilung, die schutzEinsatz sperrt, wird abgewiesen —
       nicht nur im Warndialog der Oberfläche. */
    const imBereich = umfang === SCHREIBEN_EINHEIT ? schichtBereich(ort.betrieb, sitzung) : null;
    if (optionen.fachpruefung === "aussen") {
      offenePruefung = { alt: ort.betrieb, neu: geschickt, mandantId: geschickt.id, imBereich };
    } else {
      const fach = fachpruefungUebermittlung(ort.betrieb, geschickt, undefined, { imBereich });
      /* Laufzeit (Nachprüfung WP-11, N1): protokolliert, wenn mittelbar
         nachgerechnet wurde oder die Prüfung langsam war — ohne Personenbezug. */
      if (letzteLaufzeit && (letzteLaufzeit.mittelbar || letzteLaufzeit.ms >= 300))
        console.log(`[schutzdurchsetzung] ${letzteLaufzeit.ms} ms, ${letzteLaufzeit.personen} Personen, ${letzteLaufzeit.geprueft} Einteilungen geprüft`);
      if (fach && fach.sperre) return { verweigert: fach.sperre };
      /* Warnende Befunde (WP-22): nur mit Bestätigung im selben Speichervorgang —
         sonst 409 mit der Befundliste (neutrale Texte aus dem Katalog). */
      if (fach && fach.warnungen) return { verweigert: "Diese Änderung braucht eine Bestätigung.", status: 409, fachbefunde: fach.warnungen,
        sammelVorschlag: fach.sammelVorschlag || [] };
      geschickt = sammelAnzahlSetzen(geschickt, fach && fach.sammel, ort.betrieb);
      /* Nachprüfung 9717ddf (M2): Schutzangaben immer gespeichert; widersprechende bestehende Einteilungen melden. */
      if (fach && fach.konflikte) geschickt = schutzKonfliktMitteilungen(ort.betrieb, geschickt, fach.konflikte, sitzung.person);
    }
    /* Mitteilungen aus den Vorgängen dieser Übermittlung erzeugt der Server. */
    geschickt = mitteilungenErzeugen(ort.betrieb, geschickt, sitzung.person);
    /* RB-4: zu einem neuen eingegangenen Krankmeldungsfall (Schichtverantwortung, ältere Oberfläche) die
       neutralen Mitteilungen an Planung, Leitung und zuständige Schichtverantwortung (krankmeldung.mjs). */
    geschickt = krankmeldungMitteilungen(ort.betrieb, geschickt, sitzung.person);
    /* … und die an die Leitung zu bewusst bestätigten Rechtsverstößen (WP-10 d.4). */
    geschickt = bestaetigungMitteilungen(ort.betrieb, geschickt, sitzung.person);
    const rw = rollenwechselErlaubt(gespeichert, uebermittelt, sitzung);
    if (!rw.ok) return { verweigert: rw.grund };

    /* Verlorenes ergänzen wie bisher — dann den einen Betrieb an seine
       Stelle im gespeicherten Bestand setzen. Alle anderen bleiben, wo
       und wie sie waren. */
    /* Ganz oben steht, was dem Betreiber gehört: Firmenstamm, Preisliste,
       Rechnungen, sein Protokoll, Pakete, Adressänderungen, Selbststarts.
       Bis Oktober 2026 kam die oberste Ebene aus der Übermittlung — Leitung
       und Planung konnten Preisliste und Rechnungen überschreiben und das
       Betreiberprotokoll leeren, das sie nicht einmal lesen. Jetzt gilt der
       gespeicherte Stand; aus der Übermittlung nur Zähler und Sitzungsmarke.
       Mitgeschicktes wird übergangen, nicht abgewiesen — eine veraltete
       Kopie darf das Speichern nicht blockieren. */
    const oben = { ...gespeichert,
      ...Object.fromEntries(BESTAND_FELDER.filter((x) => hat(uebermittelt, x)).map((x) => [x, uebermittelt[x]])) };
    const zusammen = verlorenesZurueck(gespeichert, { ...oben, mandanten: [geschickt] });
    const ersetzt = zusammen.mandanten.find((m) => m && m.id === ort.betrieb.id);
    return { ...zusammen,
      mandanten: gespeichert.mandanten.map((m, i) => (i === ort.index ? ersetzt : m)) };
  }

  /* --------------------------- Der Betreiber ---------------------------
     Seine eigenen Felder ganz, an jedem Betrieb nur das Kaufmännische.

     Anlegen und Löschen eines Betriebs gehören ausdrücklich dazu: Ein neu
     angelegter Mandant wird vollständig übernommen — er stammt aus der
     Betreiberkonsole und hat noch keinen Inhalt, den man schützen müsste.
     Ein Betrieb, den die Oberfläche nicht mehr mitschickt, verschwindet.  */
  if (umfang === SCHREIBEN_BETREIBER) {
    /* Auch der Betreiber befüllt einen leeren Raum nicht über diesen Weg,
       sondern über /api/bestand-anlegen — dort wird die Gestalt geprüft. */
    if (!gespeichert || typeof gespeichert !== "object")
      return { verweigert: "Raum ist noch nicht eingerichtet." };
    if (!uebermittelt || typeof uebermittelt !== "object") return null;

    const aus = { ...gespeichert };
    for (const feld of [...BESTAND_FELDER, ...BETREIBER_FELDER]) {
      if (Object.prototype.hasOwnProperty.call(uebermittelt, feld)) aus[feld] = uebermittelt[feld];
    }

    const alteNachId = new Map((gespeichert.mandanten || [])
      .filter(Boolean).map((m) => [m.id, m]));
    aus.mandanten = (Array.isArray(uebermittelt.mandanten) ? uebermittelt.mandanten : [])
      .filter(Boolean)
      .map((geschickt) => {
        const alt = alteNachId.get(geschickt.id);
        /* Neu angelegt — ohne Moduleinstellungen: Schalter, Bestätigungen, Regelwerte und
           Modulprotokoll entstehen nur über branchenmoduleZusammen (G2/G6, WP-19.0 Nachtrag). */
        if (!alt) return paketeGeprueft(moduleinstellungenVerwerfen(geschickt), null);
        const zusammen = { ...alt };
        for (const feld of KAUFMAENNISCHE_FELDER) {
          if (Object.prototype.hasOwnProperty.call(geschickt, feld))
            zusammen[feld] = geschickt[feld];
        }
        return paketeGeprueft(zusammen, alt);     // alles Übrige bleibt, wie es war
      });
    return aus;
  }

  /* Ab hier: eingeschränktes Schreiben. Ohne gespeicherten Stand gibt es
     nichts, worauf sich zusammenführen ließe. */
  if (!gespeichert || typeof gespeichert !== "object") return null;
  if (!uebermittelt || typeof uebermittelt !== "object") return null;

  const neu = { ...gespeichert };
  for (const feld of BESTAND_FELDER) {
    if (Object.prototype.hasOwnProperty.call(uebermittelt, feld)) neu[feld] = uebermittelt[feld];
  }

  const alt = eigenerMandant(gespeichert, sitzung);
  if (!alt) return neu;

  /* Der übermittelte Betrieb wird über seine Kennung gesucht, nicht über
     den Index — die Oberfläche hat die Liste unter Umständen gekürzt
     bekommen (siehe bestandFuerRolle). */
  const geschickt = Array.isArray(uebermittelt.mandanten)
    ? uebermittelt.mandanten.find((x) => x && x.id === alt.id)
    : null;
  if (!geschickt) return neu;

  const zusammen = { ...alt, ...eigenesZusammen(alt, geschickt, sitzung.person) };

  /* Die eigene Person darf sich selbst pflegen — aber nur das, was ihr
     gehört. Bis September 2026 stand hier eine Ausschlussliste: Rolle,
     Bereich, Status und ein paar Vertragsfelder blieben, alles übrige kam
     durch. Übersehen wurde dabei das Wesentliche: `qualifikationen` und
     `qualNachweise` waren nicht darunter.

     Damit konnte sich eine beschäftigte Person per API die Pflegefachkraft
     eintragen und einen gültigen Nachweis dazu — und genau das Gate
     aushebeln, an dem die ganze Anwendung hängt: Wer ohne die nach § 4
     PflBG vorbehaltene Qualifikation eingeteilt wird, soll blockiert
     werden. Ein Katalogeintrag mit harter Sperre nützt nichts, wenn jeder
     sich die Sperre selbst wegschreiben kann. In der Oberfläche gab es den
     Weg nie; der Server verließ sich darauf.

     Deshalb jetzt umgekehrt: eine Liste dessen, was durchkommt. Was ein
     Betrieb über eine Person festhält — Qualifikation, Nachweis,
     Kompetenz, Vertrag, Einschränkung, Personalnummer —, bleibt so
     stehen, wie die Leitung es eingetragen hat. Was neu hinzukommt, ist
     erst einmal geschützt und wird bewusst freigegeben. */
  const ich = sitzung.person;
  if (Array.isArray(alt.personen) && ich !== null && ich !== undefined
      && Array.isArray(geschickt.personen)) {
    const meineNeu = geschickt.personen.find((p) => p && p.id === ich);
    if (meineNeu) {
      zusammen.personen = alt.personen.map((p) => {
        if (p.id !== ich) return p;
        const aus = { ...p };
        for (const feld of SELBST_FELDER) {
          if (Object.prototype.hasOwnProperty.call(meineNeu, feld)) aus[feld] = meineNeu[feld];
        }
        return aus;
      });
    }
  }

  /* Mitteilungen aus eigenen Vorgängen (Notruf, Tauschmeldung) erzeugt der
     Server — dazu wird eine Push-Anmeldung an der Person zum Merker. */
  /* RB-4: dazu die neutralen Mitteilungen zu einer neuen eigenen Krankmeldung (krankmeldung.mjs). */
  const mitMitteilungen = krankmeldungMitteilungen(alt, mitteilungenErzeugen(alt, zusammen, sitzung.person), sitzung.person);
  neu.mandanten = gespeichert.mandanten.map((x) => (x && x.id === alt.id ? mitMitteilungen : x));
  return neu;
}

/* --------------------------------------------------------------------------
   SCHREIBEN NUR IN DER EIGENEN EINHEIT

   Die Schichtverantwortung plant ihren Bereich und entscheidet dessen
   Anliegen. Geprüft wird nicht die Absicht, sondern das Ergebnis: Feld für
   Feld, Eintrag für Eintrag gegen den gespeicherten Stand.

   Bis Oktober 2026 genügte eine Liste von Feldern, die im Ganzen
   durchgingen — Anfragen, Nachrichten, Dienstbuch, Unterschreitungen,
   Änderungen, Protokoll —, dazu Stempeluhr und Zeiterfassung unter den
   Tagesfeldern. Damit ließen sich fremde Anträge löschen oder auf eine
   andere Person umhängen, das Protokoll leeren, Nachrichten anderer
   Bereiche ersetzen und Stempelzeiten samt Ortsurteil von Hand setzen,
   vorbei an /api/stempeln. Und wer am eigenen Eintrag „ALLE" trug, durfte
   alles.

   Welcher Bereich ist der eigene? Maßgeblich ist allein die gespeicherte
   Person — nicht der Zugangscode, nicht die Mitgliedschaft, nicht die
   Oberfläche. Zuerst ihr Zuständigkeitsbereich (`bereich`, von der Leitung
   gepflegt), sonst ihre Zugehörigkeit von heute. „ALLE" ist für die
   Schichtverantwortung nicht vorgesehen (die Oberfläche vergibt es nur an
   Leitung, Planung und Betriebsrat) und zählt deshalb nicht als Bereich.
   Ob eine betroffene Person dazugehört, entscheidet ihre Zugehörigkeit am
   betroffenen Tag.
   -------------------------------------------------------------------------- */

/** Welcher Einheit gehört die Person an diesem Tag an?
    Dieselben Abschnitte wie die Lesesicht (zugehoerigkeitsAbschnitte in
    sicht.mjs, WP-43): Ohne Zugehörigkeit zählt `bereich`; trägt die Person
    eine, gehört sie vor dem ersten Abschnitt keiner Einheit an — bis WP-43
    fiel der Schreibweg dort auf `bereich` zurück, während die Lesesicht den
    Tag schon verschloss. Ohne gültigen Tag: keiner. */
export function einheitAm(person, datum) {
  if (!person || typeof datum !== "string" || !TAG.test(datum)) return null;
  const z = zugehoerigkeitsAbschnitte(person);
  if (!z) return person.bereich === undefined || person.bereich === null || person.bereich === "" ? null : String(person.bereich);
  const a = z.find((x) => x.von <= datum && datum <= x.bis);
  return a ? a.einheitId : null;
}

/** Der eigene Bereich einer Schichtverantwortung — aus der gespeicherten Person. */
export function eigeneEinheit(altM, ich) {
  if (!ich) return null;
  const gueltig = new Set((altM.einheiten || []).filter(Boolean).map((e) => String(e.id)));
  if (ich.bereich && ich.bereich !== "ALLE" && gueltig.has(String(ich.bereich))) return String(ich.bereich);
  const heute = einheitAm(ich, new Date().toISOString().slice(0, 10));
  if (heute && heute !== "ALLE" && gueltig.has(String(heute))) return String(heute);
  return null;
}

/* --------------------------------------------------------------------------
   DIENSTBUCH UND ÜBERGABEN: EINHEITSBEZUG (Commit C2)

   Beide tragen `einheitId`: eine bekannte Einheit oder null (betriebsweit,
   Sache der Planung). Altbestand ohne das Feld bleibt, wie er ist. Eine
   Übergabe ist eindeutig je Tag, Dienstart und Einheit (fehlend zählt wie
   null) — nicht mehr nur je Tag und Dienstart.
   -------------------------------------------------------------------------- */
const einheitDerUebergabe = (u) => (u && u.einheitId !== undefined && u.einheitId !== null ? String(u.einheitId) : null);
const uebergabeSchluessel = (u) => `${u && u.datum}|${u && u.dienstId}|${einheitDerUebergabe(u)}`;

/** Planung und Leitung: neue oder umgehängte Einträge nur mit bekannter
    einheitId oder null; neue Dienstbucheinträge und Tagesnotizen bekommen
    vonId; keine zwei Übergaben mit gleichem Tag, Dienst und Einheit. */
function einheitsbezugVoll(altM, neuM, sitzung) {
  const einheiten = new Set((altM.einheiten || []).filter(Boolean).map((e) => String(e.id)));
  const gueltig = (e) => e.einheitId === undefined || e.einheitId === null || einheiten.has(String(e.einheitId));
  let aus = neuM;
  for (const feld of ["dienstbuch", "uebergaben"]) {
    if (!Array.isArray(neuM[feld])) continue;
    const alt = new Map((Array.isArray(altM[feld]) ? altM[feld] : []).filter((e) => e && typeof e === "object" && kennungGueltig(e.id))
      .map((e) => [String(e.id), e]));
    let geaendert = false;
    const liste = [];
    for (const e of neuM[feld]) {
      if (!e || typeof e !== "object") { liste.push(e); continue; }
      const vorher = kennungGueltig(e.id) ? alt.get(String(e.id)) : undefined;
      const neu = !vorher;
      if ((neu || !gleich(vorher.einheitId, e.einheitId)) && !gueltig(e))
        return { grund: `${feld}: unbekannte Einheit.` };
      if (neu && feld === "dienstbuch" && sitzung.person !== null && sitzung.person !== undefined
          && String(e.vonId) !== String(sitzung.person)) {
        liste.push({ ...e, vonId: sitzung.person }); geaendert = true; continue;
      }
      liste.push(e);
    }
    if (feld === "uebergaben") {
      const altSchluessel = new Set([...alt.values()].map(uebergabeSchluessel));
      const gesehen = new Set();
      for (const e of liste) {
        if (!e || typeof e !== "object") continue;
        const k = uebergabeSchluessel(e);
        const neu = !(kennungGueltig(e.id) && alt.has(String(e.id)));
        if (neu && (altSchluessel.has(k) || gesehen.has(k)))
          return { grund: "Für diesen Tag, Dienst und diese Einheit gibt es schon eine Übergabe." };
        if (neu) gesehen.add(k);
      }
    }
    if (geaendert) aus = { ...aus, [feld]: liste };
  }
  /* Tagesnotizen (Commit C3): neue Einträge nur mit bekannter einheitId oder
     null, vonId vom Server. */
  if (neuM.notizen && typeof neuM.notizen === "object" && !Array.isArray(neuM.notizen)) {
    const altN = altM.notizen && typeof altM.notizen === "object" ? altM.notizen : {};
    let geaendert = false;
    const notizen = {};
    for (const [k, liste] of Object.entries(neuM.notizen)) {
      if (!String(k).startsWith("tag|") || !Array.isArray(liste)) { notizen[k] = liste; continue; }
      const alt = new Map((Array.isArray(altN[k]) ? altN[k] : []).filter((e) => e && typeof e === "object" && kennungGueltig(e.id))
        .map((e) => [String(e.id), e]));
      const neu = [];
      for (const e of liste) {
        const vorher = e && typeof e === "object" && kennungGueltig(e.id) ? alt.get(String(e.id)) : undefined;
        if (e && typeof e === "object" && (!vorher || !gleich(vorher.einheitId, e.einheitId)) && !gueltig(e))
          return { grund: "notizen: unbekannte Einheit." };
        if (e && typeof e === "object" && !vorher && sitzung.person !== null && sitzung.person !== undefined
            && String(e.vonId) !== String(sitzung.person)) { neu.push({ ...e, vonId: sitzung.person }); geaendert = true; continue; }
        neu.push(e);
      }
      notizen[k] = neu;
    }
    if (geaendert) aus = { ...aus, notizen };
  }
  return { mandant: aus };
}

/** Gehört die Person `pid` heute zum eigenen Bereich der Schichtverantwortung `ichId`?
    (Für den Versand, Commit 4 — dieselbe Regel wie in einheitZusammen.) */
export function imEigenenBereich(altM, ichId, pid) {
  const personen = (altM && Array.isArray(altM.personen) ? altM.personen : []).filter(Boolean);
  const ich = personen.find((p) => String(p.id) === String(ichId));
  const eigene = eigeneEinheit(altM, ich);
  const p = personen.find((x) => String(x.id) === String(pid));
  return !!(eigene && p && einheitAm(p, new Date().toISOString().slice(0, 10)) === eigene);
}

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ohne = (o, felder) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !felder.includes(k)));
const jetztText = () => new Date().toLocaleString("de-DE");
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_MAX = 500;

/**
 * Eine Liste, an die nur angehängt wird. Neue Einträge prüft `neuerEintrag`
 * (gibt den bereinigten Eintrag oder null zurück), Änderungen an
 * bestehenden `aenderung` (Ersatz oder null). Bestehende Einträge dürfen
 * fehlen, wenn die Oberfläche die Liste hinten gekürzt hat — sie bleiben
 * dann gespeichert. Ein fehlender Eintrag davor ist eine Löschung.
 * @param {string} feld
 * @param {any} alt
 * @param {any} neu
 * @param {{neuerEintrag?: (e: any) => any, aenderung?: (vorher: any, e: any) => any, kuerzen?: boolean}} [optionen]
 * @returns {{liste?: any[], grund?: string}}
 */
function anhaengen(feld, alt, neu, { neuerEintrag = () => null, aenderung = () => null, kuerzen = true } = {}) {
  const altL = (Array.isArray(alt) ? alt : []).filter((e) => e && typeof e === "object");
  if (neu !== undefined && !Array.isArray(neu)) return { grund: `${feld}: ungültige Form.` };
  const neuL = (Array.isArray(neu) ? neu : []).filter((e) => e && typeof e === "object");
  const altIndex = new Map();
  altL.forEach((e, i) => { if (kennungGueltig(e.id)) altIndex.set(String(e.id), i); });
  const gesehen = new Set();
  const neue = [];
  const ersetzt = new Map();
  for (const e of neuL) {
    if (!kennungGueltig(e.id)) {
      /* Ohne Kennung: nur ein unveränderter gespeicherter Eintrag. */
      if (altL.some((a) => !kennungGueltig(a.id) && gleich(a, e))) continue;
      return { grund: `${feld}: Eintrag ohne Kennung.` };
    }
    const id = String(e.id);
    if (gesehen.has(id)) return { grund: `${feld}: doppelte Kennung.` };
    gesehen.add(id);
    if (!altIndex.has(id)) {
      const sauber = neuerEintrag(e);
      if (!sauber) return { grund: `${feld}: Dieser Eintrag ist über diesen Zugang nicht möglich.` };
      neue.push(sauber);
      continue;
    }
    const vorher = altL[altIndex.get(id)];
    if (gleich(vorher, e)) continue;
    const neuer = aenderung(vorher, e);
    if (!neuer) return { grund: `${feld}: Bestehende Einträge sind nicht änderbar.` };
    ersetzt.set(id, neuer);
  }
  /* Fehlende bestehende Einträge: nur am Ende der Liste (gekürzt). */
  const fehlend = [...altIndex.entries()].filter(([id]) => !gesehen.has(id)).map(([, i]) => i);
  if (fehlend.length) {
    const vorhanden = [...altIndex.entries()].filter(([id]) => gesehen.has(id)).map(([, i]) => i);
    /* Gekürzt heißt: Das Neueste ist noch da. Eine leere oder ganz neue
       Liste ersetzt das Gespeicherte — das ist keine Kürzung. Ein gar nicht
       übermitteltes Feld ändert nichts. */
    if (neu !== undefined && (!kuerzen || !vorhanden.length || Math.max(...vorhanden) > Math.min(...fehlend)))
      return { grund: `${feld}: Bestehende Einträge lassen sich nicht löschen.` };
  }
  return { liste: [...neue, ...altL.map((e) => (kennungGueltig(e.id) && ersetzt.get(String(e.id))) || e)] };
}

/* --------------------------------------------------------------------------
   BESTÄTIGUNGSPROTOKOLL (Warnen statt sperren, Kette A; WP-10 d.1)

   Bis WP-10 kannte der Server das Feld nicht: Die Positivkataloge (Kette B)
   verwarfen es für Planung und Leitung still (vollRueckfuellen), für die
   Schichtverantwortung lehnte einheitZusammen die ganze Speicherung ab.

   Jetzt ein Protokoll, an das nur angehängt wird — für jede schreibende
   Rolle gleich:
   - neu: Person des Betriebs, gültiger Tag, bekannte Dienstart, Stufe
     „achtung" oder „recht" (Hinweise brauchen keine Bestätigung), bei
     „recht" ausdrücklich gelesen; Befunde, Aktion, Grundart (bekannte
     Kennung oder keine) und Regelstand in festen Grenzen;
   - Wer (Name, Kennung, Rolle) und Zeit setzt der Server, nie der Client;
   - Bestehendes ist unveränderlich und lässt sich nicht löschen: geändert
     oder gar nicht mitgeschickt, es bleibt der gespeicherte Eintrag (die
     Oberfläche übernimmt Wer und Zeit des Servers erst beim nächsten Laden;
     ihre eigene Kopie darf das Speichern nicht blockieren);
   - die Schichtverantwortung bestätigt nur für sich und Personen, die am
     Tag des Eintrags zu ihrem Bereich gehören (wie bei abweichungen);
   - Beschäftigte schreiben das Protokoll nicht (eigenesZusammen kennt es
     nicht), der Betriebsrat schreibt gar nicht.
   Die Mitteilung an die Leitung erzeugt danach der Server
   (bestaetigungen.mjs, d.4).
   -------------------------------------------------------------------------- */
const SPERRT = Symbol("sperrt");
const PROTOKOLL_STUFEN = ["achtung", "recht"];
const kurzText = (t, max) => typeof t === "string" && t.length <= max;
/**
 * @param {any} altM gespeicherter Betrieb
 * @param {any} n übermittelte Liste
 * @param {any} sitzung
 * @param {null | ((pid: any, tag: string) => boolean)} imBereich nur für die Schichtverantwortung
 * @returns {{liste?: any[], grund?: string}}
 */
function bestaetigungenZusammen(altM, n, sitzung, imBereich) {
  const personen = new Map((Array.isArray(altM.personen) ? altM.personen : []).filter(Boolean).map((p) => [String(p.id), p]));
  const dienste = new Set((Array.isArray(altM.dienstarten) ? altM.dienstarten : []).filter(Boolean).map((d) => String(d.id)));
  const ich = sitzung.person === null || sitzung.person === undefined ? null : personen.get(String(sitzung.person));
  const meinName = ich ? `${ich.vorname || ""} ${ich.nachname || ""}`.trim() || String(ich.id) : null;
  const altL = (Array.isArray(altM.bestaetigungen) ? altM.bestaetigungen : []).filter((e) => e && typeof e === "object");
  if (n === undefined) return { liste: altL };
  if (!Array.isArray(n)) return { grund: "bestaetigungen: ungültige Form." };
  const bekannt = new Set(altL.filter((e) => kennungGueltig(e.id)).map((e) => String(e.id)));
  const gesehen = new Set();
  const neue = [];
  /* Sammelbestätigung (Review B1): eine Bestätigung je Regel, Einheit und
     Zeitraum statt je Einteilung — für strukturelle Änderungen, die viele
     Einteilungen auf einmal treffen. Nur im vollen Schreibumfang (Planung,
     Leitung, Kundenrolle); ein sperrender Befund lässt sich auch so nicht
     bestätigen. Wie viele Einteilungen sie deckt, zählt der Server
     (`anzahl`, schutzdurchsetzung.mjs). */
  const einheiten = new Set((Array.isArray(altM.einheiten) ? altM.einheiten : []).filter(Boolean).map((x) => String(x.id)));
  const sammelEintrag = (e) => {
    if (imBereich) return null;
    if (typeof e.regel !== "string" || !Object.prototype.hasOwnProperty.call(BEFUND_KATALOG, e.regel)) return null;
    if (sperrtBefund(e.regel)) return SPERRT;
    if (BEFUND_KATALOG[e.regel].schutz) return null;                       // Review S1: Schutzregeln nur einzeln
    const stufe = BEFUND_KATALOG[e.regel].stufe;
    if (!PROTOKOLL_STUFEN.includes(stufe)) return null;
    if (stufe === "recht" && e.gelesen !== true) return null;
    if (typeof e.von !== "string" || !TAG.test(e.von) || typeof e.bis !== "string" || !TAG.test(e.bis) || e.bis < e.von) return null;
    if ((Date.parse(e.bis) - Date.parse(e.von)) / 86400000 > 366) return null;
    if (e.einheitId === undefined || e.einheitId === null) return null;   // Review S1: Einheit Pflicht
    const einheitId = String(e.einheitId);
    if (!einheiten.has(einheitId)) return null;
    if (!(typeof e.aktion === "string" && /^[a-z]{1,40}$/i.test(e.aktion))) return null;
    const grundArt = e.grundArt === undefined || e.grundArt === null || e.grundArt === "" ? null : e.grundArt;
    if (grundArt !== null && !ABWEICHUNG_GRUENDE.includes(grundArt)) return null;
    if (grundArt !== null && e.grund !== undefined && e.grund !== null && !kurzText(e.grund, 200)) return null;
    return { id: e.id, art: "sammel", personId: null, datum: e.von, von: e.von, bis: e.bis, einheitId, dienstId: null, aktion: e.aktion,
      stufe, befunde: [{ regel: e.regel, stufe }], regel: e.regel, regelIds: [], anzahl: 0,
      grundArt, grund: grundArt !== null && typeof e.grund === "string" ? e.grund.trim() : "", ohneGrund: grundArt === null,
      gelesen: e.gelesen === true, durch: meinName, durchId: ich ? ich.id : null, rolle: sitzung.rolle || null,
      zeit: new Date().toISOString(), regelstand: typeof e.regelstand === "string" ? e.regelstand : null, behoben: null };
  };
  const neuerEintrag = (e) => {
    if (e.art === "sammel") return sammelEintrag(e);
    if (!personen.has(String(e.personId))) return null;
    if (typeof e.datum !== "string" || !TAG.test(e.datum)) return null;
    if (!dienste.has(String(e.dienstId))) return null;
    if (imBereich && !(ich && String(e.personId) === String(ich.id)) && !imBereich(e.personId, e.datum)) return null;
    const befunde = Array.isArray(e.befunde) ? e.befunde : [];
    if (!befunde.length || befunde.length > 20) return null;
    /* Nur Kennung aus dem Befundkatalog (Review M1) — kein Freitext. Die
       Stufe bestimmt der Katalog, nicht der Client (Nachprüfung N3). Ein
       sperrender Befund lässt sich nicht bestätigen (H1). */
    if (!befunde.every((b) => b && typeof b === "object" && Object.prototype.hasOwnProperty.call(BEFUND_KATALOG, b.regel))) return null;
    if (befunde.some((b) => sperrtBefund(b.regel))) return SPERRT;
    /* Der Server prüft selbst (WP-11, B2): Sperrt die Schutzprüfung diese
       Einteilung, hilft keine Bestätigung — auch nicht, wenn der Client den
       Befund verschweigt. */
    const daObj = (Array.isArray(altM.dienstarten) ? altM.dienstarten : []).find((d) => d && String(d.id) === String(e.dienstId));
    if (daObj && daObj.start && daObj.ende && sperrendeBefunde(personen.get(String(e.personId)), daObj, e.datum, altM.einstellungen).length) return SPERRT;
    const katalogStufen = befunde.map((b) => BEFUND_KATALOG[b.regel].stufe);
    const stufe = katalogStufen.includes("recht") ? "recht" : katalogStufen.includes("achtung") ? "achtung" : null;
    if (!PROTOKOLL_STUFEN.includes(stufe)) return null;           // ein Hinweis braucht keine Bestätigung
    if (stufe === "recht" && e.gelesen !== true) return null;
    if (!(typeof e.aktion === "string" && /^[a-z]{1,40}$/i.test(e.aktion))) return null;
    const grundArt = e.grundArt === undefined || e.grundArt === null || e.grundArt === "" ? null : e.grundArt;
    if (grundArt !== null && !ABWEICHUNG_GRUENDE.includes(grundArt)) return null;
    if (grundArt !== null && e.grund !== undefined && e.grund !== null && !kurzText(e.grund, 200)) return null;
    if (e.regelstand !== undefined && e.regelstand !== null && !kurzText(e.regelstand, 40)) return null;
    /* Kennungen des Regelregisters (Kette A, WP-11): nur das Kennungsformat,
       kein Text — der Betriebsrat sieht ohnehin nur Zählwerte. */
    const regelIds = e.regelIds === undefined || e.regelIds === null ? [] : e.regelIds;
    if (!Array.isArray(regelIds) || regelIds.length > 20 || !regelIds.every((x) => typeof x === "string" && /^[A-Z0-9][A-Z0-9-]{0,39}$/.test(x))) return null;
    return { id: e.id, personId: personen.get(String(e.personId)).id, datum: e.datum, dienstId: e.dienstId, aktion: e.aktion,
      stufe, befunde: [...new Set(befunde.map((b) => b.regel))].map((regel) => ({ regel, stufe: BEFUND_KATALOG[regel].stufe })),
      regelIds: [...new Set(regelIds)],
      grundArt, grund: grundArt !== null && typeof e.grund === "string" ? e.grund.trim() : "", ohneGrund: grundArt === null,
      gelesen: e.gelesen === true,
      durch: meinName, durchId: ich ? ich.id : null, rolle: sitzung.rolle || null,
      zeit: new Date().toISOString(), regelstand: typeof e.regelstand === "string" ? e.regelstand : null, behoben: null };
  };
  for (const e of n) {
    if (!e || typeof e !== "object" || !kennungGueltig(e.id)) return { grund: "bestaetigungen: Eintrag ohne Kennung." };
    const id = String(e.id);
    if (gesehen.has(id)) return { grund: "bestaetigungen: doppelte Kennung." };
    gesehen.add(id);
    /* Bestehend: immer der gespeicherte Eintrag. Was der Client daran
       geändert mitschickt (etwa seine eigene Zeit statt der des Servers),
       ist wirkungslos — das Protokoll ändert sich nur durch Anhängen. */
    if (bekannt.has(id)) continue;
    const sauber = neuerEintrag(e);
    if (sauber === SPERRT) return { grund: "bestaetigungen: Ein sperrender Befund (Schutz, Einschränkung, gesetzliche Qualifikation, Einweisung, Ruhezeit unter 11 Stunden, Bestand) lässt sich nicht bestätigen." };
    if (!sauber) return { grund: "bestaetigungen: Dieser Eintrag ist über diesen Zugang nicht möglich." };
    neue.push(sauber);
    if (neue.length > BESTAETIGUNGEN_JE_SPEICHERN) return { grund: `bestaetigungen: höchstens ${BESTAETIGUNGEN_JE_SPEICHERN} neue Einträge je Speichern.` };
  }
  /* Nie verdrängen (Nachprüfung B1): Bis WP-10-Review fielen über der
     Gesamtgrenze die ältesten Einträge weg — wer schreiben durfte, konnte
     das Protokoll durch Fluten leeren. Jetzt: Ist die Grenze erreicht,
     werden neue Einträge abgewiesen; gelöscht wird nichts. Dazu eine Bremse
     je bestätigender Person und Tag. Ältere Einträge auszulagern (Archiv je
     Monat) oder nach Frist zu löschen (§ 16 Abs. 2 ArbZG: zwei Jahre) ist
     ein eigener, protokollierter Aufbewahrungslauf — noch offen. */
  if (neue.length && altL.length + neue.length > BESTAETIGUNGEN_GESAMT)
    return { grund: `bestaetigungen: Das Bestätigungsprotokoll hat seine Grenze von ${BESTAETIGUNGEN_GESAMT} Einträgen erreicht. Bitte die Leitung ansprechen — ältere Einträge werden nicht verdrängt.` };
  if (neue.length && ich) {
    const heute = new Date().toISOString().slice(0, 10);
    const heuteVonMir = altL.filter((x) => String(x.durchId) === String(ich.id) && typeof x.zeit === "string" && x.zeit.startsWith(heute)).length;
    if (heuteVonMir + neue.length > BESTAETIGUNGEN_JE_TAG)
      return { grund: `bestaetigungen: höchstens ${BESTAETIGUNGEN_JE_TAG} Bestätigungen je Person und Tag.` };
  }
  /* Nicht mitgeschickte Einträge bleiben gespeichert: gelöscht wird nichts. */
  return { liste: [...neue, ...altL] };
}

/* Was ein Antrag ist, bestimmt der gespeicherte Stand: Person, Art,
   Zeitraum. Die Entscheidung ändert nur Status und Begleitfelder. */
const ANTRAG_KERN = ["personId", "typ", "art", "von", "bis", "dienstId", "partnerId"];
const ANTRAG_STATUS = ["offen", "genehmigt", "abgelehnt", "zurueckgezogen"];

/**
 * Führt den Betrieb einer einheitsgebundenen Rolle zusammen.
 * @returns {{ok: boolean, mandant?: any, grund?: string}}
 */
export function einheitZusammen(altM, neuM, sitzung) {
  const nein = (grund) => ({ ok: false, grund });
  if (!altM || !neuM || typeof neuM !== "object") return nein("Unvollständig.");
  const personen = new Map((altM.personen || []).filter(Boolean).map((p) => [String(p.id), p]));
  const ich = sitzung.person === null || sitzung.person === undefined ? null : personen.get(String(sitzung.person));
  if (!ich) return nein("Diesem Zugang ist keine Person des Betriebs zugeordnet. Bitte die Leitung ansprechen.");
  const ichId = String(ich.id);
  const eigene = eigeneEinheit(altM, ich);
  if (!eigene) return nein("Diesem Zugang ist kein Bereich zugeordnet. Bitte die Leitung ansprechen.");
  /* Eine Pool-Einheit ist kein eigener Bereich (C1/C2). */
  const eigeneNutzbar = !(altM.einheiten || []).some((x) => x && x.pool && String(x.id) === eigene);
  const meinName = `${ich.vorname || ""} ${ich.nachname || ""}`.trim() || ichId;
  const heute = new Date().toISOString().slice(0, 10);

  /** Gehört die Person am Tag zum eigenen Bereich? Ohne gültigen Tag nein
      (WP-43, wie die Lesesicht) — bis dahin galt dann der heutige Tag, und
      ein Notruf oder Antrag ohne Datum ließ sich für eine Person quittieren
      oder entscheiden, deren Eintrag die Schichtverantwortung nicht sieht. */
  const imBereich = (pid, tag) => {
    const p = personen.get(String(pid));
    if (!p) return false;
    return einheitAm(p, tag) === eigene;
  };
  const eigen = (pid) => String(pid) === ichId;

  /* Ohne Zugehörigkeit an diesem Tag (vor dem ersten Abschnitt, WP-43 N1c) eine eigene, klare Meldung. */
  const ohneEinheit = (pid, tag) => {
    const p = personen.get(String(pid));
    return !!p && typeof tag === "string" && TAG.test(tag) && einheitAm(p, tag) === null;
  };
  const OHNE_EINHEIT = "Person ist an diesem Tag keiner Einheit zugeordnet – Zugehörigkeit prüfen.";
  const fremdText = (pid, tag) => (ohneEinheit(pid, tag) ? OHNE_EINHEIT
    : `${(personen.get(String(pid)) || {}).nachname || "Diese Person"} gehört nicht zu deinem Bereich.`);

  const aus = { ...altM };
  const felder = new Set([...Object.keys(altM), ...Object.keys(neuM)]);
  /* Anträge zuerst: neue Urlaubseinträge hängen an ihrer Genehmigung. */
  const reihenfolge = ["anfragen", ...[...felder].filter((f) => f !== "anfragen")];
  for (const feld of reihenfolge) {
    if (!felder.has(feld)) continue;
    const a = altM[feld], n = neuM[feld];
    if (gleich(a, n)) continue;

    switch (feld) {
      /* --- Der Plan: Tag für Tag, Person für Person --- */
      case "abweichungen": {
        const altO = a && typeof a === "object" ? a : {};
        const neuO = n && typeof n === "object" && !Array.isArray(n) ? n : null;
        if (!neuO) return nein("abweichungen: ungültige Form.");
        for (const k of new Set([...Object.keys(altO), ...Object.keys(neuO)])) {
          if (gleich(altO[k], neuO[k])) continue;
          const [pid, tag] = String(k).split("|");
          if (!pid || !TAG.test(tag || "")) return nein("abweichungen: ungültiger Schlüssel.");
          if (!personen.has(pid)) return nein("Eine geänderte Person gehört nicht zum Betrieb.");
          if (!imBereich(pid, tag))
            return nein(ohneEinheit(pid, tag) ? OHNE_EINHEIT : `${personen.get(pid).nachname || "Diese Person"} gehört am ${tag} nicht zu deinem Bereich.`);
        }
        aus.abweichungen = neuO;
        break;
      }

      /* --- Bereichsplan (WP-19, Matrix B2 b): Zuordnung der eigenen Leute am Tag zu Bereichen der eigenen Einheit.
             Die Rückfüllung vor dieser Prüfung hat Unsichtbares (fremde Bereiche) schon wieder eingesetzt. --- */
      case "bereichsPlan": {
        const eigeneE = (altM.einheiten || []).find((x) => x && String(x.id) === String(eigene));
        const urteil = bereichsPlanSchicht(a, n, { imBereich,
          eigeneBereiche: new Set((eigeneE && Array.isArray(eigeneE.bereiche) ? eigeneE.bereiche : []).filter(Boolean).map((b) => b.id)) });
        if (urteil.ok === false) return nein(urteil.grund);
        aus.bereichsPlan = urteil.plan;
        break;
      }

      /* --- Stempeluhr: nur über /api/stempeln. Was die Oberfläche nach dem
             Stempeln lokal nachzieht, weicht im Detail ab (ohne geprueftStart);
             es wird übergangen, der gespeicherte Stand bleibt. --- */
      case "einstempeln":
        break;

      /* --- Zeiterfassung: kein Rohzugriff. Die eigene Selbstauskunft läuft
             wie bei Beschäftigten über POST /api/zeit-bestaetigen; eigene
             Kopien werden übergangen, fremde Änderungen abgewiesen. --- */
      case "erfassung": {
        if (n !== undefined && (!n || typeof n !== "object" || Array.isArray(n))) return nein("erfassung: ungültige Form.");
        const r = erfassungZusammen(altM, n, ichId);
        if (r.fremd.length)
          return nein("Zeiten anderer Personen erfasst die Leitung; Stempelzeiten entstehen über die Stempeluhr.");
        aus.erfassung = r.erfassung;
        break;
      }

      /* --- Ohne Bereichsbezug: der Leitung vorbehalten (siehe unten) --- */
      case "unterschreitungen":
        return nein(`Änderungen an ${feld} sind der Leitung vorbehalten — die Einträge tragen keinen Bereich.`);

      /* --- Dienstbuch (Commit C2): neue Einträge der eigenen Einheit
             anhängen. Einheit, Autor (vonId, durch) und Zeit setzt der
             Server; Bestehendes bleibt unverändert. Fremde, Pool-, null-
             und Altbestand-Einträge sieht die Schichtverantwortung nicht
             und kann sie weder ändern noch löschen. --- */
      case "dienstbuch": {
        if (!eigeneNutzbar) return nein("Ohne eigenen Bereich (oder im Pool) kein Dienstbucheintrag.");
        const r = anhaengen(feld, a, n, { neuerEintrag: (e) => {
          if (typeof e.datum !== "string" || !TAG.test(e.datum)) return null;
          if (!["uebergabe", "vorkommnis", "hinweis"].includes(e.art)) return null;
          if (typeof e.text !== "string" || !e.text.trim() || e.text.length > ANMERKUNG_MAX) return null;
          return { id: e.id, datum: e.datum, art: e.art, text: e.text,
            zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
            durch: meinName, vonId: ich.id, einheitId: eigene };
        } });
        if (r.grund) return nein(r.grund);
        aus.dienstbuch = r.liste;
        break;
      }

      /* --- Übergaben (Commit C2): eine neue für die eigene Einheit, eine
             bestehende der eigenen Einheit nur ergänzen (anhängen). Eindeutig
             je Tag, Dienstart und Einheit. --- */
      case "uebergaben": {
        if (!eigeneNutzbar) return nein("Ohne eigenen Bereich (oder im Pool) keine Übergabe.");
        const dienste = new Set((altM.dienstarten || []).filter(Boolean).map((d) => String(d.id)));
        const vorhanden = new Set((Array.isArray(a) ? a : []).filter((u) => u && typeof u === "object").map(uebergabeSchluessel));
        const textFeld = (t) => t === undefined || t === null || (typeof t === "string" && t.length <= ANMERKUNG_MAX);
        const r = anhaengen(feld, a, n, {
          neuerEintrag: (e) => {
            if (typeof e.datum !== "string" || !TAG.test(e.datum) || !dienste.has(String(e.dienstId))) return null;
            if (typeof e.lage !== "string" || !e.lage.trim()) return null;
            if (![e.lage, e.offen, e.vorkommnis, e.material].every(textFeld)) return null;
            const s = { id: e.id, datum: e.datum, dienstId: e.dienstId, einheitId: eigene,
              lage: e.lage, offen: e.offen || "", vorkommnis: e.vorkommnis || "", material: e.material || "",
              von: meinName, an: typeof e.an === "string" && e.an.length <= 200 ? e.an : null, zeit: jetztText(),
              personen: (Array.isArray(e.personen) ? e.personen : []).filter((x) => personen.has(String(x))).slice(0, 500),
              ergaenzungen: [] };
            const k = uebergabeSchluessel(s);
            if (vorhanden.has(k)) return null;                 // schon eine Übergabe für Tag, Dienst und Einheit
            vorhanden.add(k);
            return s;
          },
          aenderung: (vorher, e) => {
            if (!eintragDerEinheit(vorher, eigene)) return null;
            if (!gleich(ohne(vorher, ["ergaenzungen"]), ohne(e, ["ergaenzungen"]))) return null;
            const alt = Array.isArray(vorher.ergaenzungen) ? vorher.ergaenzungen : [];
            const neu = Array.isArray(e.ergaenzungen) ? e.ergaenzungen : [];
            if (neu.length <= alt.length || !gleich(neu.slice(0, alt.length), alt)) return null;
            const dazu = [];
            for (const x of neu.slice(alt.length)) {
              if (!x || typeof x.text !== "string" || !x.text.trim() || x.text.length > ANMERKUNG_MAX) return null;
              dazu.push({ zeit: jetztText(), von: meinName, text: x.text });
            }
            return { ...vorher, ergaenzungen: [...alt, ...dazu] };
          },
        });
        if (r.grund) return nein(r.grund);
        aus.uebergaben = r.liste;
        break;
      }

      /* --- Revisionsspur: nur anhängen --- */
      case "protokoll": {
        const r = anhaengen(feld, a, n, { neuerEintrag: (e) => (typeof e.text === "string" && e.text.length <= TEXT_MAX
          ? { id: e.id, zeit: jetztText(), text: e.text, durch: meinName } : null) });
        if (r.grund) return nein(r.grund);
        aus.protokoll = r.liste;
        break;
      }
      case "aenderungen": {
        const r = anhaengen(feld, a, n, { neuerEintrag: (e) => {
          if (typeof e.datum !== "string" || !TAG.test(e.datum)) return null;
          if (e.personId !== null && e.personId !== undefined && !imBereich(e.personId, e.datum)) return null;
          const s = { id: e.id, personId: e.personId ?? null, datum: e.datum, zeit: jetztText() };
          for (const f of ["von", "nach", "regelstand"]) if (typeof e[f] === "string" && e[f].length <= 200) s[f] = e[f];
          if (typeof e.vorlauf === "number" && Number.isFinite(e.vorlauf)) s.vorlauf = e.vorlauf;
          return s;
        } });
        if (r.grund) return nein(r.grund);
        aus.aenderungen = r.liste;
        break;
      }
      case "einspruenge": {
        const r = anhaengen(feld, a, n, { neuerEintrag: (e) => {
          if (typeof e.datum !== "string" || !TAG.test(e.datum)) return null;
          if (!eigen(e.personId) && !imBereich(e.personId, e.datum)) return null;
          const s = { id: e.id, personId: e.personId, datum: e.datum, zeit: jetztText() };
          if (typeof e.dienstId === "string" || typeof e.dienstId === "number") s.dienstId = e.dienstId;
          return s;
        } });
        if (r.grund) return nein(r.grund);
        aus.einspruenge = r.liste;
        break;
      }

      /* --- Nachrichten: neue an den eigenen Bereich, eigene lesen ---
             Notruf- und Tauschmitteilungen sind schon verworfen, Zustellwege
             und -status kommen aus dem gespeicherten Stand (mitteilungenVorfiltern);
             die Mitteilungen zum eigenen Notruf erzeugt der Server danach. */
      case "nachrichten": {
        const r = anhaengen(feld, a, n, {
          neuerEintrag: (e) => {
            if (!personen.has(String(e.personId))) return null;
            if (!eigen(e.personId) && !imBereich(e.personId, heute)) return null;
            if (typeof e.titel !== "string" || e.titel.length > TITEL_MAX) return null;
            if (e.text !== undefined && e.text !== null && (typeof e.text !== "string" || e.text.length > MITTEILUNG_TEXT_MAX)) return null;
            return e;
          },
          /* An einer eigenen Mitteilung ändert sich nur `gelesen` (Commit 4). */
          aenderung: (vorher, e) => {
            if (!eigen(vorher.personId) || !gleich(ohne(vorher, ["gelesen"]), ohne(e, ["gelesen"]))) return null;
            return { ...vorher, gelesen: e.gelesen === true };
          },
        });
        if (r.grund) return nein(r.grund);
        aus.nachrichten = r.liste;
        break;
      }

      /* --- Notrufe: eigene absetzen, an sie gerichtete bestätigen --- */
      case "notrufe": {
        const r = anhaengen(feld, a, n, {
          neuerEintrag: (e) => notrufeZusammen([], [e], ichId, altM.personen)[0] || null,
          aenderung: (vorher, e) => {
            const zustaendig = (vorher.empfaenger || []).map(String).includes(ichId) || imBereich(vorher.personId, vorher.datum);
            if (!zustaendig || vorher.bestaetigt || !e.bestaetigt) return null;
            if (!gleich(ohne(vorher, ["bestaetigt", "durch"]), ohne(e, ["bestaetigt", "durch"]))) return null;
            return { ...vorher, bestaetigt: new Date().toISOString(), durch: meinName };
          },
        });
        if (r.grund) return nein(r.grund);
        aus.notrufe = r.liste;
        break;
      }

      /* --- Anträge --- */
      case "anfragen": {
        const altL = (Array.isArray(a) ? a : []).filter(Boolean);
        if (n !== undefined && !Array.isArray(n)) return nein("anfragen: ungültige Form.");
        const neuL = (Array.isArray(n) ? n : []).filter(Boolean);
        const altNachId = new Map(altL.map((x) => [String(x.id), x]));
        const gesehen = new Set();
        const ergebnis = [];
        for (const x of neuL) {
          if (!kennungGueltig(x.id)) return nein("anfragen: Eintrag ohne Kennung.");
          const id = String(x.id);
          if (gesehen.has(id)) return nein("anfragen: doppelte Kennung.");
          gesehen.add(id);
          const vorher = altNachId.get(id);
          if (!vorher) {
            /* Neu: der eigene Antrag (offen) oder eine Anfrage an den eigenen Bereich (offen). */
            if (!eigen(x.personId) && !imBereich(x.personId, x.von)) return nein(fremdText(x.personId, x.von));
            if ((x.status || "offen") !== "offen")
              return nein("Ein neuer Antrag ist offen — entschieden wird er danach.");
            ergebnis.push({ ...x, status: "offen", freigaben: undefined, entschieden: undefined, durch: undefined });
            continue;
          }
          if (gleich(vorher, x)) { ergebnis.push(vorher); continue; }
          /* Wem der Antrag gehört, steht im gespeicherten Stand. */
          for (const f of ANTRAG_KERN)
            if (!gleich(vorher[f], x[f]) && !(eigen(vorher.personId) && f !== "personId" && f !== "typ"))
              return nein("Ein bestehender Antrag lässt sich nicht auf eine andere Person, Art oder Zeit umschreiben.");
          if (eigen(vorher.personId)) {
            /* Den eigenen Antrag entscheidet jemand anderes. */
            if (!ANTRAGSTATUS_SELBST.includes(x.status) && x.status !== vorher.status)
              return nein("Den eigenen Antrag entscheidet die Leitung oder eine andere zuständige Person.");
            ergebnis.push({ ...x, status: ANTRAGSTATUS_SELBST.includes(x.status) ? x.status : vorher.status,
              freigaben: vorher.freigaben, entschieden: vorher.entschieden, durch: vorher.durch, antwort: vorher.antwort });
            continue;
          }
          const ohneMich = (l) => (l || []).filter((y) => String(y) !== ichId).map(String);
          const nurInteresse = gleich(ohne(vorher, ["interessenten"]), ohne(x, ["interessenten"]))
            && gleich(ohneMich(vorher.interessenten), ohneMich(x.interessenten));
          if (nurInteresse) { ergebnis.push(x); continue; }   // eigene Meldung auf ein Tauschgesuch
          if (!imBereich(vorher.personId, vorher.von))
            return nein(`${fremdText(vorher.personId, vorher.von)} Der Antrag ist Sache der Leitung.`);
          if (!ANTRAG_STATUS.includes(x.status)) return nein("anfragen: unbekannter Status.");
          /* Freigaben: höchstens die eigene kommt hinzu, Bestehendes bleibt. */
          const fV = Array.isArray(vorher.freigaben) ? vorher.freigaben : [];
          const fN = Array.isArray(x.freigaben) ? x.freigaben : [];
          if (!gleich(fN.slice(0, fV.length), fV) || fN.length > fV.length + 1)
            return nein("Bestehende Freigaben eines Antrags sind nicht änderbar.");
          const freigaben = fN.length > fV.length ? [...fV, { von: meinName, zeit: jetztText() }] : fV;
          const entschieden = x.status !== vorher.status && x.status !== "offen";
          ergebnis.push({ ...vorher, status: x.status, freigaben,
            antwort: typeof x.antwort === "string" && x.antwort.length <= TEXT_MAX ? x.antwort : vorher.antwort,
            interessenten: x.interessenten ?? vorher.interessenten,
            entschieden: entschieden ? jetztText() : vorher.entschieden,
            durch: entschieden ? meinName : vorher.durch });
        }
        for (const v of altL) {
          if (gesehen.has(String(v.id))) continue;
          if (!eigen(v.personId)) return nein("Fremde Anträge lassen sich nicht löschen.");
        }
        aus.anfragen = ergebnis;
        break;
      }

      /* --- Abwesenheiten: Krankmeldung im Bereich, Urlaub nur mit Genehmigung --- */
      case "abwesenheiten": {
        const anfragenNeu = Array.isArray(aus.anfragen) ? aus.anfragen : [];
        const anfragenAlt = new Map((Array.isArray(altM.anfragen) ? altM.anfragen : []).filter(Boolean).map((x) => [String(x.id), x]));
        /* RB-2 (Betreiberentscheidung 2026-11-11): Eine neue Krankmeldung — die eigene oder die einer Person,
           für die sie an diesen Tagen zuständig ist (svZustaendig) — nimmt die Schichtverantwortung als
           eingegangenen Fall entgegen. Wirksam (Abwesenheit) wird sie erst mit der endgültigen Bestätigung
           durch Planung oder Leitung; das vorläufige Bestätigen läuft über POST /api/krankmeldung. */
        let nOhneKrank = n;
        if (Array.isArray(n)) {
          const altIds = new Set((Array.isArray(a) ? a : []).filter((x) => x && typeof x === "object").map((x) => String(x.id)));
          const krankNeu = n.filter((e) => e && typeof e === "object" && e.art === "krank" && kennungGueltig(e.id) && !altIds.has(String(e.id)));
          if (krankNeu.length) {
            const k = krankAlsFaelle(a, krankNeu, altM.krankmeldungen,
              (e) => eigen(e.personId) || svZustaendig(altM, ich, e.personId, e.von, e.bis),
              { personId: ich.id, rolle: "subplaner" }, new Date());
            if (k.verworfen) return nein("abwesenheiten: Diese Krankmeldung ist über diesen Zugang nicht möglich.");
            if (k.faelle.length) aus.krankmeldungen = [...k.faelle, ...(Array.isArray(altM.krankmeldungen) ? altM.krankmeldungen : [])];
            nOhneKrank = n.filter((e) => !krankNeu.includes(e));
          }
        }
        const r = anhaengen(feld, a, nOhneKrank, { kuerzen: false, neuerEintrag: (e) => {
          if (typeof e.von !== "string" || !TAG.test(e.von) || typeof e.bis !== "string" || !TAG.test(e.bis) || e.bis < e.von)
            return null;
          if (!textOderLeer(e.notiz)) return null;
          const meine = eigen(e.personId);
          if (!meine && !(imBereich(e.personId, e.von) && imBereich(e.personId, e.bis))) return null;
          /* RB-2: neue Krankmeldungen sind oben schon zu Fällen geworden; als Abwesenheit nie. */
          if (e.art === "krank") return null;
          /* Alles andere entsteht aus einem Antrag, den dieser Vorgang genehmigt —
             nicht aus der eigenen Person und nicht ohne Antrag. */
          if (meine) return null;
          const antrag = anfragenNeu.find((x) => x && x.status === "genehmigt" && String(x.personId) === String(e.personId)
            && x.art === e.art && x.von === e.von && x.bis === e.bis
            && (anfragenAlt.get(String(x.id)) || {}).status !== "genehmigt");
          if (!antrag) return null;
          return { id: e.id, personId: e.personId, art: e.art, von: e.von, bis: e.bis,
            notiz: typeof e.notiz === "string" ? e.notiz : "" };
        } });
        if (r.grund) return nein(r.grund);
        aus.abwesenheiten = r.liste;
        break;
      }

      /* --- Personen: nur die eigene, nur ihre Selbstfelder --- */
      case "personen": {
        const neuL = Array.isArray(n) ? n.filter(Boolean) : null;
        if (!neuL) return nein("personen: ungültige Form.");
        const altL = (Array.isArray(a) ? a : []).filter(Boolean);
        if (neuL.length !== altL.length || neuL.some((p, i) => String(p.id) !== String(altL[i].id)))
          return nein("Personal anlegen oder entfernen ist der Leitung vorbehalten.");
        const liste = [];
        for (let i = 0; i < altL.length; i++) {
          const vorher = altL[i], p = neuL[i];
          if (gleich(vorher, p)) { liste.push(vorher); continue; }
          if (!eigen(vorher.id)) return nein("Angaben anderer Personen ändert die Leitung.");
          for (const k of new Set([...Object.keys(vorher), ...Object.keys(p)]))
            if (!gleich(vorher[k], p[k]) && !SELBST_FELDER.includes(k))
              return nein(`An der eigenen Person ist ${k} der Leitung vorbehalten.`);
          liste.push(p);
        }
        aus.personen = liste;
        break;
      }

      /* --- Tagesnotizen (Commit C3): notizen[„tag|JJJJ-MM-TT"] ---
             Neue Notizen der eigenen Einheit anhängen (Einheit, Autor, Zeit
             setzt der Server), eigene (selbst verfasste, eigene Einheit)
             löschen. Bestehende sind unveränderlich; fremde, Pool-, null-
             und Altbestand-Notizen sieht die Schichtverantwortung nicht und
             kann sie weder ändern, löschen noch übernehmen. Personennotizen
             („person|…") bleiben der Leitung vorbehalten. --- */
      case "notizen": {
        const altO = a && typeof a === "object" && !Array.isArray(a) ? a : {};
        if (n !== undefined && (!n || typeof n !== "object" || Array.isArray(n))) return nein("notizen: ungültige Form.");
        const neuO = n || {};
        const ergebnis = {};
        for (const k of new Set([...Object.keys(altO), ...Object.keys(neuO)])) {
          if (gleich(altO[k], neuO[k])) { if (k in altO) ergebnis[k] = altO[k]; continue; }
          if (!(k in neuO)) { ergebnis[k] = altO[k]; continue; }          // nicht mitgeschickt: bleibt
          if (!/^tag\|\d{4}-\d{2}-\d{2}$/.test(k)) return nein("Personennotizen sind der Leitung vorbehalten.");
          if (!eigeneNutzbar) return nein("Ohne eigenen Bereich (oder im Pool) keine Tagesnotiz.");
          if (!Array.isArray(neuO[k])) return nein("notizen: ungültige Form.");
          const altL = (Array.isArray(altO[k]) ? altO[k] : []).filter((e) => e && typeof e === "object");
          const altNach = new Map(altL.filter((e) => kennungGueltig(e.id)).map((e) => [String(e.id), e]));
          const gesehen = new Set();
          const neue = [];
          for (const e of neuO[k]) {
            if (!e || typeof e !== "object" || !kennungGueltig(e.id)) return nein("notizen: Eintrag ohne Kennung.");
            const id = String(e.id);
            if (gesehen.has(id)) return nein("notizen: doppelte Kennung.");
            gesehen.add(id);
            const vorher = altNach.get(id);
            if (vorher) {
              if (!gleich(vorher, e)) return nein("Bestehende Tagesnotizen sind nicht änderbar.");
              continue;
            }
            if (typeof e.text !== "string" || !e.text.trim() || e.text.length > ANMERKUNG_MAX)
              return nein("Eine Tagesnotiz braucht einen Text mit höchstens 2000 Zeichen.");
            neue.push({ id: e.id, text: e.text, von: meinName, vonId: ich.id, zeit: jetztText(), einheitId: eigene });
          }
          const bleiben = [];
          for (const e of altL) {
            if (!kennungGueltig(e.id) || gesehen.has(String(e.id))) { bleiben.push(e); continue; }
            /* gelöscht: nur die eigene Notiz der eigenen Einheit */
            if (!(eintragDerEinheit(e, eigene) && String(e.vonId) === ichId))
              return nein("Fremde Tagesnotizen lassen sich nicht löschen.");
          }
          ergebnis[k] = [...neue, ...bleiben];
        }
        aus.notizen = ergebnis;
        break;
      }

      /* --- Ausschreibungen (Commit C1) ---
             Bis C1 nahm der Server von der Schichtverantwortung nur die eigene
             Bewerbung an; Anlegen, Vergeben und Zurückziehen, die ihre
             Oberfläche anbietet, verwarf er still. Jetzt:
             - neu: nur offen, ohne Bewerbungen, bekannte Dienstart; die
               verantwortende Einheit setzt der Server (eigene Einheit),
               ebenso Ersteller und Zeit — der Client bestimmt sie nicht;
             - eigene Einheit: zurückziehen oder vergeben (nur aus „offen“,
               nur an eine Person des eigenen Bereichs am Tag — das Eintragen
               in den Plan prüft abweichungen ohnehin genauso);
             - fremde Einheit, null, Altbestand: unverändert, nur die eigene
               Bewerbung; einheitId zu übernehmen ist abgewiesen;
             - Bewerbungen anderer kommen immer aus dem gespeicherten Stand,
               die eigene aus der Übermittlung;
             - nicht mitgeschickte Ausschreibungen bleiben gespeichert. */
      case "ausschreibungen": {
        if (n !== undefined && !Array.isArray(n)) return nein("ausschreibungen: ungültige Form.");
        const altL = (Array.isArray(a) ? a : []).filter((x) => x && typeof x === "object");
        const altNachId = new Map(altL.filter((x) => kennungGueltig(x.id)).map((x) => [String(x.id), x]));
        const dienste = new Set((altM.dienstarten || []).filter(Boolean).map((d) => String(d.id)));
        const meineB = (x) => (Array.isArray(x && x.bewerbungen) ? x.bewerbungen : []).filter((b) => b && eigen(b.personId))
          .slice(0, 1).map((b) => ({ personId: b.personId, ...(typeof b.zeit === "string" && b.zeit.length <= 40 ? { zeit: b.zeit } : {}),
            text: typeof b.text === "string" ? b.text.slice(0, TEXT_MAX) : "" }));
        const bewerbungenZusammen = (vorher, x) => {
          const alt = Array.isArray(vorher.bewerbungen) ? vorher.bewerbungen : [];
          const istMeine = (b) => b && eigen(b.personId);
          const neu = Array.isArray(x.bewerbungen) ? x.bewerbungen : [];
          if (gleich(alt.filter(istMeine), neu.filter(istMeine))) return alt;     // eigene unverändert
          return [...alt.filter((b) => !istMeine(b)), ...meineB(x)];
        };
        const ersetzt = new Map();
        const neue = [];
        const gesehen = new Set();
        for (const x of (Array.isArray(n) ? n : []).filter((y) => y && typeof y === "object")) {
          if (!kennungGueltig(x.id)) return nein("ausschreibungen: Eintrag ohne Kennung.");
          const id = String(x.id);
          if (gesehen.has(id)) return nein("ausschreibungen: doppelte Kennung.");
          gesehen.add(id);
          const vorher = altNachId.get(id);
          if (!vorher) {
            if (typeof x.datum !== "string" || !TAG.test(x.datum) || !dienste.has(String(x.dienstId)))
              return nein("Eine Ausschreibung braucht Tag und bekannte Dienstart.");
            if ((x.status || "offen") !== "offen" || (Array.isArray(x.bewerbungen) && x.bewerbungen.length) || (x.vergebenAn ?? null) !== null)
              return nein("Eine neue Ausschreibung ist offen und hat noch keine Bewerbungen.");
            if (typeof x.hinweis === "string" && x.hinweis.length > TEXT_MAX) return nein("ausschreibungen: Hinweis zu lang.");
            neue.push({ id: x.id, datum: x.datum, dienstId: x.dienstId, einheitId: eigene,
              hinweis: typeof x.hinweis === "string" ? x.hinweis : "", status: "offen",
              erstellt: new Date().toISOString(), durch: meinName, bewerbungen: [], vergebenAn: null });
            continue;
          }
          if (gleich(vorher, x)) continue;
          const bewerbungen = bewerbungenZusammen(vorher, x);
          const kopfGleich = gleich(ohne(vorher, ["bewerbungen"]), ohne(x, ["bewerbungen"]));
          if (kopfGleich) { ersetzt.set(id, gleich(bewerbungen, vorher.bewerbungen || []) ? vorher : { ...vorher, bewerbungen }); continue; }
          if (!ausschreibungDerEinheit(vorher, eigene))
            return nein("Diese Ausschreibung verantwortet eine andere Einheit oder die Planung.");
          /* Eigene Einheit: nur zurückziehen oder vergeben, aus „offen“. */
          const kopf = ["status", "vergebenAn", "vergebenZeit"];
          if (!gleich(ohne(vorher, ["bewerbungen", ...kopf]), ohne(x, ["bewerbungen", ...kopf])))
            return nein("An einer Ausschreibung ändern sich nur Status und Vergabe.");
          if (vorher.status !== "offen") return nein("Die Ausschreibung ist nicht mehr offen.");
          if (x.status === "zurueckgezogen") {
            ersetzt.set(id, { ...vorher, status: "zurueckgezogen", bewerbungen });
          } else if (x.status === "vergeben") {
            const an = x.vergebenAn;
            if (an === null || an === undefined || !personen.has(String(an)) || !(eigen(an) || imBereich(an, vorher.datum)))
              return nein(`${fremdText(an)} Die Vergabe ist Sache der Planung.`);
            ersetzt.set(id, { ...vorher, status: "vergeben", vergebenAn: an, vergebenZeit: jetztText(), bewerbungen });
          } else return nein("ausschreibungen: unbekannter Status.");
        }
        aus.ausschreibungen = [...neue, ...altL.map((x) => (kennungGueltig(x.id) && ersetzt.get(String(x.id))) || x)];
        break;
      }

      /* --- Bestätigungsprotokoll (WP-10 d.1): nur anhängen, nur für Personen
             des eigenen Bereichs am Tag; Wer und Zeit setzt der Server. --- */
      case "bestaetigungen": {
        const r = bestaetigungenZusammen(altM, n, sitzung, imBereich);
        if (r.grund) return nein(r.grund);
        aus.bestaetigungen = r.liste;
        break;
      }

      /* --- Selbstservice: nur die eigenen Einträge, Fremdes aus dem Stand --- */
      case "wuensche":
      case "urlaubsrunde":
      case "selbstplanung":
        Object.assign(aus, eigenesZusammen(altM, { [feld]: n }, ichId));
        break;

      /* --- Planfreigabe (RB-1): die Schichtverantwortung hat kein plan.publish, auch nicht als Funktion
         am Tag. Ausdrücklich abgewiesen, nicht erst über den Rückfall unten. --- */
      case "freigaben":
      case "planstaende":
        return nein(PLAN_FREIGEBEN_GRUND);

      default:
        return nein(`Änderungen an ${feld} sind der Leitung vorbehalten.`);
    }
  }
  return { ok: true, mandant: aus };
}

/** Klartext für die Absage — der Aufrufer soll wissen, woran es lag. */
export function absageText(rolle) {
  if (rolle === "subplaner")
    return "Über diesen Zugang lässt sich nur der eigene Bereich ändern.";
  if (rolle === "betriebsrat")
    return "Der Betriebsratszugang ist ein reiner Prüfzugang. Änderungen sind darüber nicht möglich.";
  if (rolle === "mitarbeiter")
    return "Über diesen Zugang lassen sich nur eigene Anträge und Zeiten ändern.";
  return "Für diese Änderung fehlt die Berechtigung.";
}
