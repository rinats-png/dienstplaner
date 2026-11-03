/* ==========================================================================
   AUSKUNFT NACH ARTIKEL 15 DSGVO — serverseitig, maschinenlesbar

   Bis November 2026 baute die Oberfläche die Auskunft selbst (App.jsx,
   datenauskunft) — aus dem Bestand, den sie gerade in der Hand hatte. Darin
   fehlten die Stempeldaten samt Ortsbefund, die Markierungen, die
   Protokolleinträge zur Person und alles, was gar nicht im Bestand liegt
   (Push-Anmeldung, Kalenderverweis, Konto). Und sie war Text, nicht
   maschinenlesbar.

   Hier entsteht sie auf dem Server, aus dem streng gelesenen Bestand, als
   JSON (Art. 15 Abs. 3 Satz 3: „in einem gängigen elektronischen Format").

   Wer was bekommt — keine Erweiterung der Rechte:

   - Die betroffene Person über sich selbst: ihr Personendatensatz
     vollständig; ihre Stempel mit Ortsbefund (Koordinaten werden nicht
     gespeichert), Ist-Zeiten, Planabweichungen und der geplante Dienst der
     letzten und nächsten Monate; Abwesenheiten mit Anmerkung; die eigenen
     Anträge ganz, fremde Anträge, an denen sie als Tauschpartner beteiligt
     ist, nur im Gerüst; Planänderungen, Mitteilungen und Notrufe an sie;
     die eigenen Einträge in den Sammlungen, die auch /api/bestand ihr allein
     zeigt (Wünsche, Einsprüche, Fahrzeiten, Checks, Ansichten, Kompetenzen,
     Einarbeitung, Betriebsmittel, Sondereinsätze, Bewerbungen auf
     Ausschreibungen); Einträge im Betriebsprotokoll mit ihrer Kennung; ihr
     Konto ohne Geheimnisse; die Protokollzeilen ihrer eigenen Vorgänge und
     die Auskünfte, die die Leitung über sie erteilt hat (Empfänger, Art. 15
     Abs. 1 lit. c); ob Push-Anmeldung und Kalenderverweis bestehen.
     Was fehlt, sagt der Hinweis ausdrücklich.
   - Die Leitung (und „kunde", dieselben Rollen wie bei Sicherungen) für eine
     Person des eigenen Betriebs, auf Anfrage dieser Person: genau das, was
     die Leitung ohnehin sieht (bestandFuerRolle) — kein Protokoll (das sieht
     sonst nur der Betreiber), kein Push- und Kalenderstatus, kein Konto.
   - Niemand sonst. Der Betreiber nicht, andere Rollen nur für sich selbst.
   ========================================================================== */

import { fristen } from "./aufbewahrung.mjs";
import { geplanterDienst, tagePlus } from "./zeiterfassung.mjs";
import { accountLesenPerId } from "./accounts.mjs";
import { BESTAETIGUNG_FELDER } from "./sicht.mjs";

export const AUSKUNFT_FORMAT = "centric-auskunft";
export const AUSKUNFT_FASSUNG = 2;

/** Rollen, die für eine andere Person des eigenen Betriebs Auskunft erstellen dürfen. */
export const AUSKUNFT_FUER_ANDERE = Object.freeze(["leitung", "kunde"]);

/** Spur-Zeilen der letzten so vielen Tage — so lange bleibt die Spur liegen (schutz.mjs). */
export const PROTOKOLL_TAGE = 30;

const gleich = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);
const eigenerSchluessel = (pid) => (k) => gleich(String(k).split("|")[0], pid);
const nachTag = (obj, pid) => Object.entries(obj && typeof obj === "object" ? obj : {})
  .filter(([k]) => eigenerSchluessel(pid)(k))
  .map(([k, v]) => ({ datum: String(k).split("|").slice(1).join("|"), ...(v && typeof v === "object" ? v : { wert: v }) }))
  .sort((a, b) => a.datum.localeCompare(b.datum));
const liste = (w) => (Array.isArray(w) ? w : []);
const eigene = (w, pid) => liste(w).filter((x) => x && gleich(x.personId, pid));

/** Die eigenen Einträge einer Sammlung — als Liste (personId) oder als Objekt (Schlüssel „pid|…"). */
function eigeneAus(wert, pid) {
  if (Array.isArray(wert)) return eigene(wert, pid);
  if (wert && typeof wert === "object") return nachTag(wert, pid);
  return [];
}

/* Sammlungen, die /api/bestand einer Person nur mit ihren eigenen Einträgen
   zeigt (sicht.mjs, NUR_EIGENE bzw. reduziert auf Eigenes). */
const EIGENE_SAMMLUNGEN = ["wuensche", "einspruenge", "fahrzeiten", "checks", "ansichten", "notrufe",
  "kompetenzen", "einarbeitung", "betriebsmittel", "sondereinsaetze", "urlaubsrunde", "selbstplanung"];

/** Was diese Auskunft ausdrücklich nicht enthält. */
const LUECKEN_SELBST = [
  "Sitzungen und angemeldete Geräte (nur das Konto selbst ist enthalten)",
  "Protokollzeilen, in denen andere über dich gehandelt haben — außer erteilten Auskünften; das Protokoll "
    + "verzeichnet, wer handelt, nicht über wen",
  "Einträge im Betriebsprotokoll ohne deine Personenkennung (Freitexte mit Namen werden nicht durchsucht)",
  "Inhalte von Sicherungskopien (sie enthalten dieselben Daten wie der Bestand zum Zeitpunkt der Sicherung)",
  `Protokollzeilen, die älter als ${PROTOKOLL_TAGE} Tage sind (sie werden gelöscht)`,
  "bei Auskünften, die die Leitung über dich erteilt hat: wer genau und von wo (nur Rolle, Zeit und Art)",
  "Bestätigungen, die du selbst für andere Personen abgegeben hast (sie betreffen deren Daten); die Zählwerte "
    + "für den Betriebsrat enthalten keine Einzeldaten",
];

/* Bestätigungsprotokoll (WP-10, Sammlung bestaetigungen): Einträge ÜBER die
   Person. In der eigenen Auskunft ohne Namen und Kennung der bestätigenden
   Person — nur deren Rolle (wie N-2 bei den Protokollzeilen). Die Leitung
   bekommt die Felder ihrer eigenen Sicht. */
const BESTAETIGUNG_SELBST = BESTAETIGUNG_FELDER.filter((f) => f !== "durch" && f !== "durchId");
const felder = (o, liste) => Object.fromEntries(liste.filter((f) => f in o).map((f) => [f, o[f]]));

/**
 * Baut die Auskunft.
 * @param {object} m  der Betrieb (vollständig bzw. in der Sicht der anfragenden Leitung)
 * @param {object} person  der Personendatensatz aus m
 * @param {{ raum: string, erstellt: string, umfang: "selbst"|"leitung", protokoll?: object[],
 *   push?: boolean, kalender?: boolean, konto?: object|null, eigeneSicht?: object|null }} o
 *   `eigeneSicht`: derselbe Betrieb in der Sicht einer Beschäftigten (bestandFuerRolle) —
 *   aus ihr kommen die Sammlungen mit eigenen Einträgen, ohne Daten Dritter.
 */
export function auskunftBauen(m, person, { raum, erstellt, umfang, protokoll = [], push = false, kalender = false,
  konto = null, eigeneSicht = null }) {
  const pid = person.id;
  const selbst = umfang === "selbst";
  const abweichungen = Object.entries(m.abweichungen || {}).filter(([k]) => eigenerSchluessel(pid)(k))
    .map(([k, v]) => ({ datum: String(k).split("|")[1], dienst: v }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  /* Einteilungen auf Posten (WP-19, modul-posten.mjs): nur die eigenen Einträge. */
  const postenzuordnungen = Object.entries(m.postenPlan || {}).filter(([k]) => eigenerSchluessel(pid)(k))
    .map(([k, v]) => ({ datum: String(k).split("|")[1], posten: v }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  /* Zuordnung zu Bereichen (WP-19, modul-bereichsplan.mjs): nur die eigenen Einträge. */
  const bereichszuordnungen = Object.entries(m.bereichsPlan || {}).filter(([k]) => eigenerSchluessel(pid)(k))
    .map(([k, v]) => ({ datum: String(k).split("|")[1], bereich: v }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  /* Der Plan, wie er sich aus Schichtfolge, Teilzeit, Abweichungen und
     Abwesenheiten ergibt — vom vorletzten bis zum übernächsten Monat. */
  const heute = String(erstellt).slice(0, 10);
  const plan = [];
  for (let d = tagePlus(heute, -62); d <= tagePlus(heute, 62); d = tagePlus(d, 1)) {
    const dienst = geplanterDienst(m, person, d);
    if (dienst) plan.push({ datum: d, dienst });
  }
  /* Anträge: die eigenen ganz; fremde, an denen die Person als Partner
     beteiligt ist, nur im Gerüst — Text, Antwort der Leitung und
     Interessenten gehören der anderen Person (wie sicht.mjs, anfragen). */
  const antraege = [];
  for (const a of liste(m.anfragen)) {
    if (!a) continue;
    if (gleich(a.personId, pid)) antraege.push(a);
    else if (gleich(a.partnerId, pid))
      antraege.push({ id: a.id, typ: a.typ, von: a.von, bis: a.bis, status: a.status, personId: a.personId, partnerId: a.partnerId });
  }
  const f = fristen(m);
  const sammlungen = {};
  if (selbst && eigeneSicht) {
    for (const s of EIGENE_SAMMLUNGEN) sammlungen[s] = eigeneAus(eigeneSicht[s], pid);
    sammlungen.ausschreibungen = liste(eigeneSicht.ausschreibungen)
      .map((a) => (a && typeof a === "object" ? { ...a, bewerbungen: eigene(a.bewerbungen, pid) } : null))
      .filter((a) => a && a.bewerbungen.length);
  }
  return {
    format: AUSKUNFT_FORMAT,
    fassung: AUSKUNFT_FASSUNG,
    erstellt,
    rechtsgrundlage: "Art. 15 DSGVO",
    umfang,
    hinweis: selbst
      ? "Auskunft über die zu deiner Person gespeicherten Daten. Nicht enthalten: " + LUECKEN_SELBST.join("; ") + "."
      : "Erstellt durch die Leitung auf Anfrage der Person. Enthalten ist nur, was die Leitung ohnehin einsehen "
        + "darf; Angaben, die nur der Person selbst zugänglich sind (z. B. Notfallkontakt, Bank-, Steuer- und "
        + "Sozialversicherungsdaten, Konto, Protokoll, Push- und Kalenderstatus), fehlen — die Person erhält sie "
        + "über ihre eigene Auskunft.",
    verantwortlicher: { betrieb: m.name || null, betriebId: m.id || null, raum },
    zwecke: ["Dienstplanung", "Arbeitszeiterfassung (§ 16 Abs. 2 ArbZG, ggf. § 17 MiLoG)",
      "Abwesenheitsverwaltung", "Kommunikation im Betrieb", "Sicherheit und Nachvollziehbarkeit (Protokoll)"],
    empfaenger: "Leitung und Planung des Betriebs im Rahmen ihrer Rechte; keine Übermittlung an Dritte "
      + "außer dem technischen Betreiber (Auftragsverarbeitung). Von der Leitung erteilte Auskünfte über dich "
      + "stehen im Protokoll unten.",
    herkunft: "Eingaben der Person, der Leitung und Planung sowie die Stempeluhr (Serverzeit, Ortsbefund).",
    aufbewahrung: {
      plandatenMonate: f.plandatenMonate, stammdatenMonateNachAustritt: f.stammdatenMonate,
      abwesenheitsgruendeMonate: f.gruendeMonate, letzterLoeschlauf: f.zuletztGeraeumt,
      protokollTage: PROTOKOLL_TAGE,
    },
    person,
    stempel: nachTag(m.einstempeln, pid),
    istZeiten: nachTag(m.erfassung, pid),
    planabweichungen: abweichungen,
    ...(postenzuordnungen.length ? { postenzuordnungen } : {}),
    ...(bereichszuordnungen.length ? { bereichszuordnungen } : {}),
    plan,
    abwesenheiten: eigene(m.abwesenheiten, pid),
    antraege,
    planaenderungen: eigene(m.aenderungen, pid),
    mitteilungen: eigene(m.nachrichten, pid),
    bestaetigungen: eigene(m.bestaetigungen, pid)
      .map((e) => felder(e, selbst ? BESTAETIGUNG_SELBST : BESTAETIGUNG_FELDER)),
    ...(selbst ? {
      ...sammlungen,
      betriebsprotokoll: eigene(m.protokoll, pid),
      konto,
      pushAnmeldung: !!push,
      kalenderverweis: !!kalender,
      protokoll: [...protokoll].sort((a, b) => String(a.zeit).localeCompare(String(b.zeit))),
    } : {}),
  };
}

/**
 * Protokollzeilen zu einer Person eines Betriebs (centric-spur):
 * - ihre eigenen Vorgänge (person = ihre Kennung),
 * - Auskünfte, die andere über sie erteilt haben (art „auskunft", zusatz
 *   nennt ihre Kennung).
 * Zeilen tragen seit WP-26 den Betrieb (mandantId). Ältere Zeilen ohne ihn
 * zählen nur in einem Raum mit genau einem Betrieb — in einem Raum mit
 * mehreren könnte dieselbe Kennung einer anderen Person gehören.
 * Gelesen werden nur die Tage der letzten PROTOKOLL_TAGE.
 */
export async function protokollZurPerson(spurStore, { raumKennung, mandantId, personId, einBetrieb, jetzt = new Date() }) {
  const aus = [];
  /* Je Tag ein Präfix (Schlüssel „JJJJ-MM-TT/art/…", schutz.mjs): Gelesen
     wird nur das Fenster der letzten PROTOKOLL_TAGE, nicht die ganze Spur.
     Raum und Person stehen nicht im Schlüssel — innerhalb eines Tages
     bleibt es beim Durchsehen aller Betriebe (Backlog, wp26-nachweis.md).
     Altbestand („JJJJ-MM-TT/art", ein Array) fällt unter dasselbe Präfix. */
  const blobs = [];
  for (let i = 0; i <= PROTOKOLL_TAGE; i++) {
    const tag = new Date(jetzt.getTime() - i * 86400000).toISOString().slice(0, 10);
    blobs.push(...(await spurStore.list({ prefix: `${tag}/` })).blobs);
  }
  for (const b of blobs) {
    const z = await spurStore.get(b.key, { type: "json" }).catch(() => null);
    const zeilen = Array.isArray(z) ? z : z ? [z] : [];         // Altbestand: ein Array je Tag und Art
    for (const r of zeilen) {
      if (!r || r.kennung !== raumKennung) continue;
      if (r.mandantId ? !gleich(r.mandantId, mandantId) : !einBetrieb) continue;
      const eigen = gleich(r.person, personId);
      const ueberMich = r.art === "auskunft" && typeof r.zusatz === "string"
        && r.zusatz.endsWith(`Person ${personId}`) && !eigen;
      if (eigen) aus.push(r);
      /* Über sie durch die Leitung (N-2): nur Rolle, Zeit, Art — keine
         Kennung, keine Herkunft der handelnden Person. */
      else if (ueberMich) aus.push({ zeit: r.zeit, art: r.art, ...(r.rolle ? { rolle: r.rolle } : {}) });
    }
  }
  return aus;
}

/**
 * Das Konto der Sitzung für die eigene Auskunft — nur, wenn die Sitzung aus
 * einem Konto stammt, und ohne Passwort, Token-Zähler und Epoche. Hier und
 * nicht in daten.mjs: Der Code-Weg dort bindet die Accounts nicht ein
 * (pruefungen/account-isolation.test.js).
 * @returns {Promise<object|null>}
 */
export async function kontoFuerAuskunft(store, sitzung) {
  const id = sitzung && sitzung.herkunft && sitzung.herkunft.accountId;
  if (!id) return null;
  const k = await accountLesenPerId(store, id).catch(() => null);
  if (!k) return null;
  return { email: k.email, emailVerifiziertAm: k.emailVerifiziertAm || null, status: k.status,
    erstellt: k.erstellt, aktualisiert: k.aktualisiert, passwortGeaendert: k.passwortGeaendert || null,
    letzteAnmeldung: k.letzteAnmeldung || null, profil: k.profil || null };
}
