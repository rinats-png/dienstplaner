/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { urlaubshinweisFaellig } from "../regelwerk.js";
import { uid } from "./format.js";
import { aktive, urlaubskonto } from "./fachlogik.js";


/* ==========================================================================
   ZUSTELLUNG
   Eine Mitteilung im Postfach erreicht nur, wer die Anwendung ohnehin öffnet.
   Wer im Frühdienst ist und abends erfährt, dass sein Urlaub abgelehnt wurde,
   hat einen Tag verloren.

   Deshalb drei Wege, die dieselbe Mitteilung tragen:
     Postfach — immer, kostenlos, bleibt erhalten
     E-Mail   — für alles, was eine Entscheidung enthält
     Push     — für alles, was heute oder morgen wirkt

   Welcher Weg wofür gilt, entscheidet die Art der Mitteilung, nicht der
   Absender. Sonst bekommt die Belegschaft für jede Kleinigkeit einen Ton.
   ========================================================================== */

export const ZUSTELLARTEN = {
  antragEntschieden: { titel: "Antrag entschieden", mail: true, push: true, dringend: false,
    text: "Urlaub, Tausch oder Schulung wurde genehmigt oder abgelehnt." },
  planGeaendert: { titel: "Dienst geändert", mail: true, push: true, dringend: true,
    text: "Ein bereits freigegebener Dienst wurde verschoben, getauscht oder gestrichen." },
  planFreigegeben: { titel: "Monatsplan freigegeben", mail: true, push: true, dringend: false,
    text: "Der Plan für einen Monat ist verbindlich." },
  einspringen: { titel: "Anfrage zum Einspringen", mail: true, push: true, dringend: true,
    text: "Jemand fehlt, und du kämst infrage." },
  offeneSchicht: { titel: "Offene Schicht ausgeschrieben", mail: false, push: true, dringend: false,
    text: "Ein Dienst ist unbesetzt und steht zur Bewerbung offen." },
  tauschAngebot: { titel: "Tauschangebot", mail: false, push: true, dringend: false,
    text: "Jemand bietet einen Tausch an, der zu deinem Plan passt." },
  /* Der Hinweis, ohne den Urlaub gar nicht verfällt.

     Nach EuGH C-684/16 und BAG 9 AZR 541/15 verfällt Urlaub nur, wenn der
     Arbeitgeber rechtzeitig und ausdrücklich darauf hingewiesen hat. Ohne
     Hinweis wird er übertragen und häuft sich an — mit allem, was das für
     Rückstellungen und ausscheidende Beschäftigte bedeutet.

     Die Mitteilung ist damit kein Service, sondern die Erfüllung einer
     Pflicht. Deshalb geht sie über E-Mail hinaus und bleibt im Postfach
     nachweisbar stehen. */
  urlaubVerfaellt: { titel: "Resturlaub verfällt", mail: true, push: false, dringend: false,
    text: "Nicht genommener Urlaub verfällt zum Jahresende, wenn er nicht eingeplant wird." },
  nachweisLaeuftAb: { titel: "Nachweis läuft ab", mail: false, push: false, dringend: false,
    text: "Eine Qualifikation verliert demnächst ihre Gültigkeit." },
  zeitFehlt: { titel: "Zeiten offen", mail: false, push: true, dringend: false,
    text: "Erfasste Zeiten warten auf Bestätigung." },
  aushang: { titel: "Aushang am Schwarzen Brett", mail: false, push: true, dringend: false,
    text: "Etwas Neues betrifft alle im Betrieb." },
  uebergabeFehlt: { titel: "Übergabe fehlt", mail: false, push: true, dringend: true,
    text: "Für eine abgeschlossene Schicht wurde keine Übergabe hinterlegt." },
  /* RB-4: nur Planung, Leitung und die zuständige Schichtverantwortung; Inhalt ohne Gesundheitsangaben. */
  krankmeldungEingegangen: { titel: "Neue Meldung zur Abwesenheit", mail: true, push: true, dringend: false,
    text: "Eine Meldung ist eingegangen, die Planung oder Bereich betrifft." },
};

/** Voreinstellung je Person: alles an, was die Art vorsieht. */
export const zustellungStandard = () => {
  const z = {};
  for (const [id, a] of Object.entries(ZUSTELLARTEN)) z[id] = { mail: a.mail, push: a.push };
  return z;
};

/**
 * Was soll für diese Mitteilung tatsächlich hinausgehen?
 * Die Person kann jede Art einzeln abschalten — außer den dringenden,
 * die im Postfach immer erscheinen.
 */
export function zustellwege(person, art) {
  const vorgabe = ZUSTELLARTEN[art];
  if (!vorgabe) return { postfach: true, mail: false, push: false };
  const eigen = (person.zustellung || {})[art] || {};
  /* WP-30: Sammelschalter je Kanal (zustellung.kanal) — wie auf dem Server (zustellregeln.mjs, kanalAus). */
  const kanalAus = (k) => !!((person.zustellung || {}).kanal) && person.zustellung.kanal[k] === false;
  const hatMail = !!(person.email && person.email.includes("@"));
  return {
    postfach: true,
    mail: hatMail && !kanalAus("mail") && (eigen.mail !== undefined ? eigen.mail : vorgabe.mail),
    push: !kanalAus("push") && (eigen.push !== undefined ? eigen.push : vorgabe.push) && !!(person.pushSchluessel),
    dringend: vorgabe.dringend,
  };
}

/* Kennungen der Mitteilungen, die diese Oberfläche angelegt hat und deren
   Zustellung sie nach dem Speichern anstößt (siehe zustellungAnstossen). */
export const zustellungAusstehend = new Set();

/**
 * Baut eine Mitteilung fürs Postfach. Ob und wie sie per E-Mail oder Push
 * hinausgeht, entscheidet seit Commit 4 der Server aus dem gespeicherten
 * Stand — Adresse, Push-Anmeldung und Zustellstatus stehen nicht mehr hier.
 * Titel höchstens 120, Text höchstens 500 Zeichen (prüft auch der Server).
 * `tag` (JJJJ-MM-TT): der Plantag, den die Mitteilung betrifft — der Server
 * stellt sie Beschäftigten nicht zu, solange der Monat Entwurf ist (WP-30).
 */
export function baueMitteilung(m, personId, art, titel, text, ziel, tag) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const id = uid("n");
  zustellungAusstehend.add(id);
  return {
    id, personId, art, titel: String(titel ?? "").slice(0, 120), text: String(text ?? "").slice(0, 500),
    ziel: ziel || null,
    zeit: new Date().toLocaleString("de-DE"), erstellt: new Date().toISOString(),
    gelesen: false, dringend: !!(ZUSTELLARTEN[art] || {}).dringend,
    ...(typeof tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? { tag } : {}),
  };
}

/* --------------------------------------------------------------------------
   URLAUBSHINWEIS

   Sammelt, für wen ein Hinweis fällig ist. Die Regel selbst steht in
   src/regelwerk.js und ist dort geprüft; hier wird sie auf die Urlaubskonten
   angewendet.

   Ausgelöst wird höchstens einmal je Person und Jahr — festgehalten wird das
   an der Person selbst, damit es auch nach einem Gerätewechsel gilt.
   -------------------------------------------------------------------------- */
export function urlaubshinweiseFaellig(m, stichtag) {
  const jahr = Number(String(stichtag).slice(0, 4));
  const aus = [];
  for (const p of aktive(m, stichtag)) {
    const konto = urlaubskonto(m, p, jahr);
    const offen = Math.max(0, (konto.anspruch || 0) - (konto.genommen || 0));
    const h = urlaubshinweisFaellig(offen, stichtag, p.urlaubshinweis || null);
    if (h.faellig) aus.push({ person: p, ...h });
  }
  return aus;
}
