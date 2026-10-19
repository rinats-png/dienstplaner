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

import { erfassungZusammen, heuteBerlin } from "./zeiterfassung.mjs";
import { RANG, pruefeRollenwechsel } from "./rollenvergabe.mjs";
import { mitteilungenVorfiltern, mitteilungenErzeugen, NOTRUF_ARTEN as NOTRUF_NAMEN, TITEL_MAX,
  TEXT_MAX as MITTEILUNG_TEXT_MAX } from "./mitteilungen.mjs";
import { ausschreibungDerEinheit, eintragDerEinheit, bestandSicht, SICHT_ROLLEN, schichtKontext, schichtPersonSicht, betriebSichtSchicht, OBEN_FELDER,
  betriebSichtVoll, VOLL_BETRIEB, PERSONENFELDER, VOLL_PERSON } from "./sicht.mjs";

/* Die Rechtetabelle. Wortgleich zu MATRIX_STD in src/App.jsx — Änderungen
   dort müssen hier nachgezogen werden. */
const ALLE_RECHTE = [
  "plan.view.own", "plan.view.unit", "plan.view.all", "plan.edit.unit",
  "plan.edit.all", "pattern.edit", "shift.edit",
  "req.create", "req.approve.unit", "req.approve.all",
  "staff.view", "staff.edit", "account.view.own", "account.view.all",
  "org.edit", "roles.assign", "billing.view", "audit.view", "export.data",
];

export const MATRIX = {
  leitung: [...ALLE_RECHTE],
  planer: ALLE_RECHTE.filter((r) => !["org.edit", "roles.assign", "billing.view"].includes(r)),
  subplaner: ["plan.view.own", "plan.view.unit", "plan.edit.unit", "req.create",
    "req.approve.unit", "staff.view", "account.view.own", "account.view.all"],
  mitarbeiter: ["plan.view.own", "plan.view.unit", "req.create", "account.view.own"],
  betriebsrat: ["plan.view.own", "plan.view.unit", "plan.view.all", "staff.view",
    "audit.view", "export.data"],
  /* Ein eigener Datenraum zum freien Ausprobieren — dort gibt es keine
     zweite Person, vor der etwas zu schützen wäre. */
  kunde: [...ALLE_RECHTE],
};

export function darf(rolle, recht) {
  const rechte = MATRIX[rolle] || [];
  if (!rechte.includes(recht)) return false;
  /* Derselbe Riegel wie in der Oberfläche: Der Betriebsrat prüft, er ändert
     nicht. Auch dann nicht, wenn ihm jemand versehentlich ein Änderungsrecht
     in die Tabelle schreibt. */
  if (rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)) return false;
  return true;
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

/** Neue eigene Krankmeldungen: nur Art „krank", nur die Felder des Formulars. */
function krankmeldungenZusammen(alt, neu, ich) {
  const gespeichert = Array.isArray(alt) ? alt : [];
  const bekannt = new Set(gespeichert.filter(Boolean).map((a) => String(a.id)));
  const neue = [];
  for (const a of Array.isArray(neu) ? neu : []) {
    if (!a || typeof a !== "object" || !eigenerEintrag(a, ich)) continue;
    if (!kennungGueltig(a.id) || bekannt.has(String(a.id))) continue;    // Bestehendes bleibt, wie es war
    if (a.art !== "krank") continue;                                       // Urlaub geht über den Antrag
    if (typeof a.von !== "string" || !DATUM.test(a.von)
      || typeof a.bis !== "string" || !DATUM.test(a.bis) || a.bis < a.von) continue;
    if (!textOderLeer(a.notiz)) continue;
    const sauber = { id: a.id, personId: a.personId, art: "krank", von: a.von, bis: a.bis };
    if (typeof a.notiz === "string") sauber.notiz = a.notiz;
    neue.push(sauber);
    bekannt.add(String(a.id));
  }
  return [...gespeichert, ...neue];
}

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
  if (hat("abwesenheiten")) aus.abwesenheiten = krankmeldungenZusammen(alt.abwesenheiten, geschickt.abwesenheiten, ich);
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
const BESTAND_FELDER = ["stand", "session", "version"];

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
  "bis", "stichtag", "testTage", "rabattGrund", "preisgestaltung", "pakete",
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

export const VERTRAGSFELDER = ["status", "tarif", "seit", "bis", "stichtag",
  "testTage", "rabattGrund", "preisgestaltung", "pakete",
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
export function bestandFuerRolle(bestand, sitzung) {
  if (!bestand || typeof bestand !== "object") return bestand;
  const rolle = sitzung.rolle || "kunde";
  if (rolle === "betreiber") return bestand;

  /* Beschäftigte und Betriebsrat: nur, was der Katalog in sicht.mjs
     ausdrücklich freigibt. Unbekannte Felder gehen nicht hinaus — weder
     ganz oben noch im Betrieb noch an einer Person. */
  if (SICHT_ROLLEN.includes(rolle))
    return bestandSicht(bestand, sitzung, eigenerMandant(bestand, sitzung));

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
    return aus;
  }

  const kopie = { ...bestand };

  /* Kaufmännisches nur für Rollen, die es sehen dürfen.

     Die Organisationsleitung hat billing.view — sie soll die Kosten ihres
     Betriebs einsehen können, und dafür braucht die Rechnungsansicht auch
     die Angaben des Anbieters. Planung, Schichtverantwortung, Beschäftigte
     und Betriebsrat haben mit Rechnungen nichts zu tun. */
  if (!darf(rolle, "billing.view")) {
    delete kopie.betreiber;
    delete kopie.rechnungen;
    delete kopie.tarife;
  }
  /* Das Protokoll über alle Mandanten hinweg gehört niemandem außer dem
     Betreiber — das betriebseigene Protokoll steht im Mandanten. */
  delete kopie.protokoll;

  const eigener = eigenerMandant(bestand, sitzung);
  if (!Array.isArray(bestand.mandanten) || !eigener) return kopie;

  /* Nur der eigene Betrieb. Die Oberfläche sucht über session.mandantId,
     nicht über den Index — das Kürzen der Liste bricht sie also nicht. */
  kopie.mandanten = [{ ...eigener }];

  return kopie;
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

export function zusammenfuehren(gespeichert, uebermittelt, sitzung) {
  const rolle = sitzung.rolle || "kunde";
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

    /* Mitteilungen: Notruf- und Tauschmitteilungen des Clients verworfen,
       Zustellwege und -status aus dem gespeicherten Stand, Grenzen für
       Titel und Text (Commit 4, mitteilungen.mjs). */
    const vorgefiltert = mitteilungenVorfiltern(ort.betrieb, geschickt);
    if (vorgefiltert.grund) return { verweigert: vorgefiltert.grund };
    geschickt = vorgefiltert.mandant;

    /* Planung und Leitung: verborgene Felder aus dem gespeicherten Stand. */
    if (umfang === SCHREIBEN_VOLL) {
      geschickt = vollRueckfuellen(ort.betrieb, geschickt, sitzung);
      /* Dienstbuch und Übergaben (Commit C2): einheitId nur bekannt oder null. */
      const bezug = einheitsbezugVoll(ort.betrieb, geschickt, sitzung);
      if (bezug.grund) return { verweigert: bezug.grund };
      geschickt = bezug.mandant;
    }

    /* Die Schichtverantwortung: Feld für Feld gegen den gespeicherten Stand
       (siehe einheitZusammen). Weiter geht nur, was dabei herauskommt. */
    if (umfang === SCHREIBEN_EINHEIT) {
      geschickt = schichtRueckfuellen(ort.betrieb, geschickt, sitzung);
      const urteil = einheitZusammen(ort.betrieb, geschickt, sitzung);
      if (!urteil.ok) return { verweigert: urteil.grund };
      geschickt = urteil.mandant;
    }
    /* Mitteilungen aus den Vorgängen dieser Übermittlung erzeugt der Server. */
    geschickt = mitteilungenErzeugen(ort.betrieb, geschickt, sitzung.person);
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
        if (!alt) return geschickt;               // neu angelegt
        const zusammen = { ...alt };
        for (const feld of KAUFMAENNISCHE_FELDER) {
          if (Object.prototype.hasOwnProperty.call(geschickt, feld))
            zusammen[feld] = geschickt[feld];
        }
        return zusammen;                          // alles Übrige bleibt, wie es war
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
  const mitMitteilungen = mitteilungenErzeugen(alt, zusammen, sitzung.person);
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

/** Welcher Einheit gehört die Person an diesem Tag an? */
function einheitAm(person, datum) {
  const liste = (person.zugehoerigkeit || [])
    .filter((z) => !z.ab || z.ab <= datum)
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : (person.bereich || null);
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
    einheitId oder null; neue Dienstbucheinträge bekommen vonId; keine zwei
    Übergaben mit gleichem Tag, Dienst und Einheit. */
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

  /** Gehört die Person am Tag zum eigenen Bereich? */
  const imBereich = (pid, tag) => {
    const p = personen.get(String(pid));
    if (!p) return false;
    return einheitAm(p, typeof tag === "string" && TAG.test(tag) ? tag : heute) === eigene;
  };
  const eigen = (pid) => String(pid) === ichId;

  const fremdText = (pid) => `${(personen.get(String(pid)) || {}).nachname || "Diese Person"} gehört nicht zu deinem Bereich.`;

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
            return nein(`${personen.get(pid).nachname || "Diese Person"} gehört am ${tag} nicht zu deinem Bereich.`);
        }
        aus.abweichungen = neuO;
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
            if (!eigen(x.personId) && !imBereich(x.personId, x.von)) return nein(fremdText(x.personId));
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
            return nein(`${fremdText(vorher.personId)} Der Antrag ist Sache der Leitung.`);
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
        const r = anhaengen(feld, a, n, { kuerzen: false, neuerEintrag: (e) => {
          if (typeof e.von !== "string" || !TAG.test(e.von) || typeof e.bis !== "string" || !TAG.test(e.bis) || e.bis < e.von)
            return null;
          if (!textOderLeer(e.notiz)) return null;
          const meine = eigen(e.personId);
          if (!meine && !(imBereich(e.personId, e.von) && imBereich(e.personId, e.bis))) return null;
          if (e.art === "krank") {
            const s = { id: e.id, personId: e.personId, art: "krank", von: e.von, bis: e.bis };
            if (typeof e.notiz === "string") s.notiz = e.notiz;
            return s;
          }
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

      /* --- Selbstservice: nur die eigenen Einträge, Fremdes aus dem Stand --- */
      case "wuensche":
      case "urlaubsrunde":
      case "selbstplanung":
        Object.assign(aus, eigenesZusammen(altM, { [feld]: n }, ichId));
        break;

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
