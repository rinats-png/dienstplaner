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

import { RANG, pruefeRollenwechsel } from "./rollenvergabe.mjs";
import { bestandSicht, SICHT_ROLLEN } from "./sicht.mjs";

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
   das brauchen: die Meldung auf ein fremdes Tauschgesuch, die Bewerbung
   auf eine ausgeschriebene Schicht, die Mitteilung an die Gegenseite.

   Und einen Antrag entscheidet nie, wer ihn stellt: Der Status eines
   eigenen Antrags darf nur „offen" oder „zurueckgezogen" werden. */
const eigenerEintrag = (e, ich) => e && String(e.personId) === String(ich);
const eigenerSchluessel = (k, ich) => String(k).split("|")[0] === String(ich);
const ANTRAGSTATUS_SELBST = ["offen", "zurueckgezogen"];
const NACHRICHT_AN_FREMDE = ["tauschAngebot"];

/** Objekt mit Schlüsseln „personId|Datum": nur die eigenen wandern hinein. */
function eigeneSchluessel(alt, neu, ich) {
  const aus = {};
  for (const [k, v] of Object.entries(alt || {})) if (!eigenerSchluessel(k, ich)) aus[k] = v;
  for (const [k, v] of Object.entries(neu || {})) if (eigenerSchluessel(k, ich)) aus[k] = v;
  return aus;
}

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

function nachrichtenZusammen(alt, neu, ich) {
  const alteIds = new Set((Array.isArray(alt) ? alt : []).filter(Boolean).map((n) => n.id));
  const fremdeAlt = (Array.isArray(alt) ? alt : []).filter((n) => n && !eigenerEintrag(n, ich));
  const eigene = (Array.isArray(neu) ? neu : []).filter((n) => eigenerEintrag(n, ich));
  const neueAnFremde = (Array.isArray(neu) ? neu : []).filter((n) => n && !eigenerEintrag(n, ich)
    && !alteIds.has(n.id) && NACHRICHT_AN_FREMDE.includes(n.art));
  return [...fremdeAlt, ...neueAnFremde, ...eigene];
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

   Mitteilungen an die Planung nimmt der Server von Beschäftigten weiterhin
   nur als Tauschangebot an. Die Planung sieht Krankmeldung und Notruf im
   Bestand; eine Zustellung per E-Mail oder Push folgt erst, wenn der
   Server sie selbst auslöst.
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
const NOTRUF_ARTEN = ["hilfe", "medizin", "bedrohung", "technik"];
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
  if (hat("erfassung")) aus.erfassung = eigeneSchluessel(alt.erfassung, geschickt.erfassung, ich);
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

   Name, Anschrift und Ansprechpartner stehen bewusst nicht hier: Die darf
   ein Betrieb pflegen, sie kosten nichts.

   laeuftAb und selbstAngelegt gehören dazu, seit der Löschlauf für
   abgelaufene Testbetriebe daran hängt (aufraeumen.mjs): Wer sie
   zurückschreiben könnte, könnte seine eigene Löschung aushebeln. */
const VERTRAGSFELDER = ["status", "tarif", "seit", "bis", "stichtag",
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

/** Der gespeicherte Betrieb dieser Sitzung samt seiner Stelle — oder null,
    wenn es noch keinen gespeicherten Bestand gibt. Dieselbe Zuordnung wie
    eigenerMandant, damit Lesen und Schreiben denselben Betrieb meinen. */
function gespeicherterBetrieb(gespeichert, sitzung) {
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
        for (const feld of VERTRAGSFELDER) delete ohne[feld];
        return ohne;
      }
      const zusammen = { ...m };
      for (const feld of ["protokoll", "aenderungen"]) {
        if (!(feld in m) && feld in alt) zusammen[feld] = alt[feld];
      }
      /* Vertragsfelder gehen immer auf den gespeicherten Stand zurück —
         nicht nur, wenn sie fehlen. Ein Betrieb bekommt sie zu sehen, aber
         ändern darf sie nur der Betreiber, und der nimmt diesen Weg nicht. */
      for (const feld of VERTRAGSFELDER) {
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
function rollenwechselErlaubt(gespeichert, uebermittelt, sitzung) {
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

    /* TEMPORÄRER BOOTSTRAP-ALTPFAD. Gibt es noch keinen gespeicherten
       Betrieb, schreibt heute der erste Client den ganzen Bestand — so
       entstehen Demo- und Testräume aus startbestand(). Das bleibt bis zur
       serverseitigen Erstbefüllung unverändert und ist keine sichere
       Architektur: Wer als Erster schreibt, bestimmt Anzahl, Kennungen und
       Reihenfolge der Betriebe. Doppelte und ungültige Kennungen weist
       pruefeGestalt trotzdem ab. */
    if (!ort) {
      if (umfang === SCHREIBEN_VOLL) {
        const rw = rollenwechselErlaubt(gespeichert, uebermittelt, sitzung);
        if (!rw.ok) return { verweigert: rw.grund };
        return verlorenesZurueck(gespeichert, uebermittelt);
      }
      return uebermittelt;
    }

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
    const geschickt = uebermittelt.mandanten[0];

    if (umfang === SCHREIBEN_EINHEIT) {
      const urteil = einheitDarf(ort.betrieb, geschickt, sitzung);
      if (!urteil.ok) return { verweigert: urteil.grund };
    }
    const rw = rollenwechselErlaubt(gespeichert, uebermittelt, sitzung);
    if (!rw.ok) return { verweigert: rw.grund };

    /* Verlorenes ergänzen wie bisher — dann den einen Betrieb an seine
       Stelle im gespeicherten Bestand setzen. Alle anderen bleiben, wo
       und wie sie waren. */
    const zusammen = verlorenesZurueck(gespeichert, { ...uebermittelt, mandanten: [geschickt] });
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
    if (!gespeichert || typeof gespeichert !== "object") return uebermittelt;
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

  neu.mandanten = gespeichert.mandanten.map((x) => (x && x.id === alt.id ? zusammen : x));
  return neu;
}

/* --------------------------------------------------------------------------
   SCHREIBEN NUR IN DER EIGENEN EINHEIT

   Die Schichtverantwortung darf Einsätze ihres Wohnbereichs ändern, sonst
   nichts. Geprüft wird nicht die Absicht, sondern das Ergebnis: Welche
   Personen sind von der Änderung betroffen, und gehören die alle zur
   eigenen Einheit?

   Das ist genauer als eine Prüfung des Vorhabens und kommt ohne Vertrauen
   in die Oberfläche aus.
   -------------------------------------------------------------------------- */

/** Welcher Einheit gehört die Person an diesem Tag an? */
function einheitAm(person, datum) {
  const liste = (person.zugehoerigkeit || [])
    .filter((z) => !z.ab || z.ab <= datum)
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : (person.bereich || null);
}

/* Felder, deren Schlüssel die Form "personId|JJJJ-MM-TT" tragen. */
const TAGESFELDER = ["abweichungen", "erfassung", "einstempeln"];

/**
 * Welche Personen sind von der Änderung betroffen?
 * Vergleicht die tagesbezogenen Felder Schlüssel für Schlüssel.
 */
function betroffenePersonen(alt, neu) {
  const aus = new Set();
  for (const feld of TAGESFELDER) {
    const a = (alt || {})[feld] || {};
    const b = (neu || {})[feld] || {};
    const alle = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of alle) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      const pid = String(k).split("|")[0];
      if (pid) aus.add(pid);
    }
  }
  return aus;
}

/** Was außerhalb der Tagesfelder geändert wurde. */
function andereFelderGeaendert(alt, neu) {
  const aus = [];
  const alle = new Set([...Object.keys(alt || {}), ...Object.keys(neu || {})]);
  for (const feld of alle) {
    if (TAGESFELDER.includes(feld)) continue;
    if (JSON.stringify((alt || {})[feld]) !== JSON.stringify((neu || {})[feld])) aus.push(feld);
  }
  return aus;
}

/* Was die Schichtverantwortung außerhalb der Tagesfelder anfassen darf:
   Anliegen und Übergaben ihres Bereichs. Personal, Dienstarten,
   Schichtfolge und Regelwerk gehören der Leitung. */
const EINHEIT_FELDER = ["anfragen", "nachrichten", "dienstbuch", "einspruenge",
  "unterschreitungen", "aenderungen", "protokoll"];

/**
 * Prüft, ob eine einheitsgebundene Rolle diese Änderung vornehmen darf.
 * @returns {{ok: boolean, grund?: string}}
 */
export function einheitDarf(altM, neuM, sitzung) {
  if (!altM) return { ok: true };   // frischer Betrieb, nichts zu schützen

  /* Die Einheit steht an der Person, nicht am Zugangscode.

     Erst wurde sie aus dem Konto gelesen — das war falsch gedacht: Der Code
     wird einmal ausgegeben, die Zuordnung ändert sich mit jeder Versetzung.
     Maßgeblich ist, wo die Person heute steht. */
  const ich = (altM.personen || []).find((p) => String(p.id) === String(sitzung.person));
  const eigene = sitzung.einheit
    || (ich && ich.bereich && ich.bereich !== "ALLE" ? ich.bereich : null)
    || (ich ? einheitAm(ich, new Date().toISOString().slice(0, 10)) : null);

  if (ich && ich.bereich === "ALLE") return { ok: true };
  if (!eigene)
    return { ok: false,
      grund: "Diesem Zugang ist kein Bereich zugeordnet. Bitte die Leitung ansprechen." };

  const fremdeFelder = andereFelderGeaendert(altM, neuM)
    .filter((f) => !EINHEIT_FELDER.includes(f));
  if (fremdeFelder.length)
    return { ok: false,
      grund: `Änderungen an ${fremdeFelder.slice(0, 3).join(", ")} sind der Leitung vorbehalten.` };

  const personen = new Map((altM.personen || []).map((p) => [String(p.id), p]));
  for (const pid of betroffenePersonen(altM, neuM)) {
    const person = personen.get(pid);
    if (!person) return { ok: false, grund: "Eine geänderte Person gehört nicht zum Betrieb." };
    /* Die Einheit wird zum betroffenen Tag geprüft, nicht zu heute — eine
       Versetzung darf rückwirkende Einträge nicht plötzlich erlauben. */
    const tage = [...TAGESFELDER].flatMap((feld) => {
      const a = (altM || {})[feld] || {}, b = (neuM || {})[feld] || {};
      return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => String(k).split("|")[0] === pid
          && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        .map((k) => String(k).split("|")[1]);
    }).filter(Boolean);
    for (const tag of tage) {
      if (einheitAm(person, tag) !== eigene)
        return { ok: false,
          grund: `${person.nachname || "Diese Person"} gehört am ${tag} nicht zu deinem Bereich.` };
    }
  }

  /* Anträge und Einsprünge tragen eine Person, keinen Tagesschlüssel.
     Bisher gingen sie im Ganzen durch — die Schichtverantwortung konnte
     damit per API den Urlaubsantrag einer Person aus einem fremden
     Bereich genehmigen. Die Oberfläche zeigte den Knopf nie; der Server
     muss es trotzdem prüfen. Geändert oder neu: nur im eigenen Bereich,
     zum Tag des Antrags. */
  for (const feld of ["anfragen", "einspruenge"]) {
    const alt = new Map(((altM || {})[feld] || []).filter(Boolean).map((a) => [a.id, a]));
    for (const a of ((neuM || {})[feld] || []).filter(Boolean)) {
      const vorher = alt.get(a.id);
      if (vorher && JSON.stringify(vorher) === JSON.stringify(a)) continue;
      const person = personen.get(String(a.personId));
      if (!person) return { ok: false, grund: "Eine geänderte Person gehört nicht zum Betrieb." };
      const tag = a.von || a.datum || new Date().toISOString().slice(0, 10);
      if (einheitAm(person, tag) !== eigene)
        return { ok: false,
          grund: `${person.nachname || "Diese Person"} gehört nicht zu deinem Bereich — der Antrag ist Sache der Leitung.` };
    }
  }
  return { ok: true };
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
