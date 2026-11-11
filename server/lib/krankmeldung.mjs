/* ==========================================================================
   KRANKMELDUNG IN ZWEI STUFEN (RB-2)

   Betreiberentscheidung 2026-11-11: Die Schichtverantwortung darf eingehende
   Krankmeldungen entgegennehmen und vorläufig bestätigen. Die endgültige
   Bestätigung geben ausschließlich Planung oder Leitung. Eine vorläufige
   Bestätigung löst keinen endgültigen Status aus. Beide Schritte werden
   protokolliert; die Rechte prüft der Server.

   Modell (rückwärtsverträglich, ohne Umbau gespeicherter Daten):
   - Eine eingehende Krankmeldung ist ein Fall in `m.krankmeldungen`:
       { id, personId, von, bis, notiz?, status, verlauf: [{ schritt, von, rolle, funktion?, zeit }] }
     status: "eingegangen" → "vorlaeufig_bestaetigt" → "endgueltig_bestaetigt";
     Endzustände ohne Wirkung: "abgelehnt" (Planung/Leitung) und "zurueckgezogen"
     (die meldende Person selbst) — Nachtrag Review RB-2, M1.
   - WIRKSAM ist eine Krankheit nur als Eintrag in `m.abwesenheiten` (Art
     „krank"). Den legt allein die endgültige Bestätigung an (oder Planung und
     Leitung, die eine Abwesenheit wie bisher unmittelbar eintragen — das ist
     selbst die endgültige Bestätigung). Plan, Ist-Zeiten, Konto, Lohn,
     Ersatzsuche, Auswertungen und Kalender lesen ausschließlich
     `abwesenheiten` — ein Fall in `krankmeldungen` zählt dort nie, gleich
     welcher Status darin steht (fail-closed).
   - Gespeicherte Krankmeldungen aus der Zeit davor stehen in `abwesenheiten`
     und bleiben, was sie waren: endgültig.

   Die Schichtverantwortung ist hier die Rolle „subplaner" (Anzeige
   „Schichtverantwortung") in der Funktion für ihren Bereich: Sie handelt nur,
   wenn sie selbst an jedem Tag der Meldung (von und bis) zu dieser Einheit
   gehört und die gemeldete Person an diesen Tagen ebenfalls — dieselbe
   tagesgenaue Bereichsregel wie bei Anträgen und Abwesenheiten
   (einheitZusammen in rechte.mjs). Eine Pool-Einheit ist kein Bereich.

   Rein: keine Ablage, kein Versand. Der Endpunkt (POST /api/krankmeldung,
   server/funktionen/daten.mjs) liest und schreibt unter der Raumsperre.
   ========================================================================== */

import { einheitAm, dienstAm } from "./fachpruefung.mjs";
import { servermitteilung } from "./mitteilungen.mjs";
import { laufenderTag } from "./planfreigabe.mjs";
import { aktivePerson } from "./personengueltig.mjs";

export const KRANK_STATUS = Object.freeze({
  EINGEGANGEN: "eingegangen",
  VORLAEUFIG: "vorlaeufig_bestaetigt",
  ENDGUELTIG: "endgueltig_bestaetigt",
  ABGELEHNT: "abgelehnt",
  ZURUECKGEZOGEN: "zurueckgezogen",
});
export const KRANK_SCHRITTE = Object.freeze(["melden", "vorlaeufig", "endgueltig", "ablehnen", "zurueckziehen"]);
/** Offen ist ein Fall nur in den beiden ersten Stufen; alles andere (auch Unbekanntes) ist abgeschlossen. */
export const fallOffen = (f) => !!f && (f.status === KRANK_STATUS.EINGEGANGEN || f.status === KRANK_STATUS.VORLAEUFIG);
/** Ablehnen ohne Freitext (keine Gesundheitsangabe im Protokoll): nur ein Kennzeichen aus dieser Liste oder keines. */
export const ABLEHNGRUENDE = Object.freeze(["doppelt", "irrtum", "ueberholt", "sonstiges"]);

/** Rollen je Schritt. Andere Rollen (Betriebsrat, Betreiber, unbekannt): keiner. Die Kundenrolle (Altrolle,
    alter Probierraum) darf melden und die eigene Meldung zurückziehen, aber — RB-3, Betreiberentscheidung
    2026-11-11 — weder endgültig bestätigen noch ablehnen: das dürfen ausschließlich Planung und Leitung. */
const MELDEN_ROLLEN = ["mitarbeiter", "subplaner", "planer", "leitung", "kunde"];
const VORLAEUFIG_ROLLEN = ["subplaner"];
const ENDGUELTIG_ROLLEN = ["planer", "leitung"];

/** Darf diese Rolle diesen Schritt überhaupt (ohne Fallbezug)? */
export function krankSchrittErlaubt(rolle, schritt) {
  if (typeof rolle !== "string") return false;
  if (schritt === "melden") return MELDEN_ROLLEN.includes(rolle);
  if (schritt === "vorlaeufig") return VORLAEUFIG_ROLLEN.includes(rolle);
  if (schritt === "endgueltig" || schritt === "ablehnen") return ENDGUELTIG_ROLLEN.includes(rolle);
  /* Zurückziehen: wer melden darf — am Fall zusätzlich nur die meldende Person selbst. */
  if (schritt === "zurueckziehen") return MELDEN_ROLLEN.includes(rolle);
  return false;
}

/** Ist ein Fall endgültig bestätigt? Nur genau dieser Status — alles andere (auch Unbekanntes) nicht. */
export const fallEndgueltig = (f) => !!f && typeof f === "object" && f.status === KRANK_STATUS.ENDGUELTIG;

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const tagGueltig = (s) => typeof s === "string" && TAG.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const NOTIZ_MAX = 300;
const KENNUNG = /^[A-Za-z0-9_-]{1,64}$/;
const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (x) => (Array.isArray(x) ? x.filter(istObj) : []);
const gleich = (a, b) => String(a) === String(b);

/**
 * Ist die Schichtverantwortung `ich` für Person `pid` im Zeitraum zuständig?
 * Sie und die Person gehören am ersten und am letzten Tag zur selben Einheit,
 * und diese Einheit ist kein Pool. Ohne gültige Tage: nein.
 */
export function svZustaendig(m, ich, pid, von, bis) {
  if (!m || !ich || !tagGueltig(von) || !tagGueltig(bis)) return false;
  const p = liste(m.personen).find((x) => gleich(x.id, pid));
  if (!p) return false;
  const pools = new Set(liste(m.einheiten).filter((e) => e.pool).map((e) => String(e.id)));
  for (const tag of [von, bis]) {
    const e = einheitAm(ich, tag);
    if (e === null || e === undefined || e === "ALLE" || pools.has(String(e))) return false;
    /* Ist ein Bereich am Zugang eingetragen (wie eigeneEinheit in rechte.mjs), muss er es sein. */
    if (ich.bereich && ich.bereich !== "ALLE" && String(ich.bereich) !== String(e)) return false;
    if (einheitAm(p, tag) !== e) return false;
  }
  return true;
}

/** Ein Schritt im Verlauf: wer (Person), in welcher Rolle/Funktion, wann. Keine Gesundheitsangabe. */
function schrittEintrag(schritt, akteur, jetzt) {
  const e = { schritt, von: akteur.personId === undefined ? null : akteur.personId, rolle: akteur.rolle, zeit: jetzt.toISOString() };
  if (akteur.rolle === "subplaner") e.funktion = "Schichtverantwortung";
  return e;
}

/**
 * Eine Krankmeldung entgegennehmen (Status „eingegangen").
 *
 * Wiederholung (Review RB-2, L1): Trägt die Meldung eine `clientEventId` (wie die Stempelkette, WP-07b) und
 * hat dieselbe meldende Person schon einen Fall damit, kommt dieser Fall zurück (`wiederholt: true`, nichts
 * geschrieben). Ohne Kennung gilt dasselbe für einen OFFENEN Fall derselben Person mit gleichem Zeitraum,
 * den dieselbe Person gemeldet hat — eine Netzwiederholung legt keinen zweiten Fall an.
 * @param {any} m  der gespeicherte Betrieb
 * @param {{ personId: any, rolle: string }} akteur
 * @param {{ personId?: any, von?: string, bis?: string, notiz?: string, clientEventId?: string }} angabe
 * @param {Date} jetzt
 * @param {string} id  neue Fallkennung
 * @returns {{ status: number, grund: string } | { mandant: any, fall: any, wiederholt?: boolean }}
 */
export function krankmeldungMelden(m, akteur, angabe, jetzt, id) {
  if (!krankSchrittErlaubt(akteur.rolle, "melden"))
    return { status: 403, grund: "Krankmeldungen nimmt dieser Zugang nicht entgegen." };
  const a = istObj(angabe) ? angabe : {};
  const personen = liste(m.personen);
  const ich = personen.find((x) => gleich(x.id, akteur.personId));
  if (!ich) return { status: 403, grund: "Diesem Zugang ist keine Person des Betriebs zugeordnet." };
  const pid = a.personId === undefined || a.personId === null || a.personId === "" ? ich.id : a.personId;
  const p = personen.find((x) => gleich(x.id, pid));
  if (!p) return { status: 404, grund: "Person nicht gefunden." };
  if (!tagGueltig(a.von) || !tagGueltig(a.bis) || a.bis < a.von)
    return { status: 400, grund: "Zeitraum: erwartet werden gültige Tage, „bis“ nicht vor „von“." };
  if (a.notiz !== undefined && (typeof a.notiz !== "string" || a.notiz.length > NOTIZ_MAX))
    return { status: 400, grund: `Anmerkung: höchstens ${NOTIZ_MAX} Zeichen Text.` };
  if (a.clientEventId !== undefined && (typeof a.clientEventId !== "string" || !KENNUNG.test(a.clientEventId)))
    return { status: 400, grund: "clientEventId: höchstens 64 Zeichen aus Buchstaben, Ziffern, - und _." };
  const eigen = gleich(p.id, ich.id);
  if (!eigen) {
    if (akteur.rolle === "mitarbeiter") return { status: 403, grund: "Beschäftigte melden nur die eigene Krankheit." };
    if (akteur.rolle === "subplaner" && !svZustaendig(m, ich, p.id, a.von, a.bis))
      return { status: 403, grund: "Diese Person gehört an diesen Tagen nicht zu deinem Bereich." };
  }
  const faelle = liste(m.krankmeldungen);
  const vonMir = (f) => gleich(meldendePerson(f), ich.id);
  const schon = typeof a.clientEventId === "string"
    ? faelle.find((f) => f.clientEventId === a.clientEventId && vonMir(f))
    : faelle.find((f) => fallOffen(f) && gleich(f.personId, p.id) && f.von === a.von && f.bis === a.bis && vonMir(f));
  if (schon) return { mandant: m, fall: schon, wiederholt: true };
  const fall = { id, personId: p.id, von: a.von, bis: a.bis, status: KRANK_STATUS.EINGEGANGEN,
    verlauf: [schrittEintrag("eingegangen", akteur, jetzt)] };
  if (typeof a.notiz === "string" && a.notiz.trim()) fall.notiz = a.notiz;
  if (typeof a.clientEventId === "string") fall.clientEventId = a.clientEventId;
  return { mandant: { ...m, krankmeldungen: [fall, ...faelle] }, fall };
}

/** Wer hat den Fall gemeldet? Die Person des Verlaufsschritts „eingegangen“. */
export const meldendePerson = (f) => {
  const v = f && Array.isArray(f.verlauf) ? f.verlauf.find((x) => x && x.schritt === "eingegangen") : null;
  return v ? v.von : undefined;
};

/* Eine Antwort für „gibt es nicht“ und „geht dich nichts an“ (Review RB-2, L2): Wer den Fall nicht bearbeiten
   darf, erfährt nicht, ob es ihn gibt. */
const NICHT_GEFUNDEN = Object.freeze({ status: 404, grund: "Krankmeldung nicht gefunden." });
const STATUS_TEXT = { [KRANK_STATUS.EINGEGANGEN]: "eingegangen", [KRANK_STATUS.VORLAEUFIG]: "vorläufig bestätigt",
  [KRANK_STATUS.ENDGUELTIG]: "endgültig bestätigt", [KRANK_STATUS.ABGELEHNT]: "abgelehnt", [KRANK_STATUS.ZURUECKGEZOGEN]: "zurückgezogen" };

/**
 * Ein Schritt an einem bestehenden Fall: vorläufig bestätigen (Schichtverantwortung des Bereichs), endgültig
 * bestätigen oder ablehnen (Planung, Leitung), zurückziehen (die meldende Person selbst). Nur aus einem offenen
 * Fall; „endgueltig_bestaetigt“, „abgelehnt“ und „zurueckgezogen“ sind Endzustände (409). Die endgültige
 * Bestätigung legt die wirksame Abwesenheit an; Ablehnen und Zurückziehen haben keine Folgewirkung.
 * @param {any} m
 * @param {{ personId: any, rolle: string }} akteur
 * @param {string} schritt  "vorlaeufig" | "endgueltig" | "ablehnen" | "zurueckziehen"
 * @param {{ id?: any, grund?: any }} angabe
 * @param {Date} jetzt
 * @returns {{ status: number, grund: string, code?: string } | { mandant: any, fall: any, abwesenheit?: any, zusammengefuehrt?: boolean }}
 */
export function krankmeldungSchritt(m, akteur, schritt, angabe, jetzt) {
  if (!["vorlaeufig", "endgueltig", "ablehnen", "zurueckziehen"].includes(schritt)) return { status: 400, grund: "Unbekannter Schritt." };
  if (!krankSchrittErlaubt(akteur.rolle, schritt))
    return { status: 403, grund: schritt === "endgueltig" || schritt === "ablehnen"
      ? "Endgültig bestätigen und ablehnen nur Planung und Leitung."
      : schritt === "vorlaeufig" ? "Vorläufig bestätigt die Schichtverantwortung des Bereichs."
        : "Krankmeldungen nimmt dieser Zugang nicht entgegen." };
  const a = istObj(angabe) ? angabe : {};
  const fallId = a.id;
  if (typeof fallId !== "string" || !KENNUNG.test(fallId)) return { status: 400, grund: "Kennung der Krankmeldung fehlt." };
  let ablehngrund;
  if (schritt === "ablehnen" && a.grund !== undefined && a.grund !== null) {
    if (!ABLEHNGRUENDE.includes(a.grund)) return { status: 400, grund: `Grund: nur ${ABLEHNGRUENDE.join(", ")} oder keiner.` };
    ablehngrund = a.grund;
  }
  const personen = liste(m.personen);
  const ich = personen.find((x) => gleich(x.id, akteur.personId));
  if (!ich) return { status: 403, grund: "Diesem Zugang ist keine Person des Betriebs zugeordnet." };
  const faelle = liste(m.krankmeldungen);
  const fall = faelle.find((f) => f.id === fallId);
  /* Zugang zum Fall zuerst — sonst verriete 403/409 seine Existenz. */
  if (!fall) return NICHT_GEFUNDEN;
  if (schritt === "zurueckziehen" && !gleich(meldendePerson(fall), ich.id)) return NICHT_GEFUNDEN;
  if (schritt === "vorlaeufig" && !gleich(fall.personId, ich.id) && !svZustaendig(m, ich, fall.personId, fall.von, fall.bis))
    return NICHT_GEFUNDEN;
  /* Vier Augen: die eigene Krankmeldung bestätigt oder lehnt eine andere Person ab (zurückziehen darf man selbst). */
  if (schritt !== "zurueckziehen" && gleich(fall.personId, ich.id))
    return { status: 403, code: "VIER_AUGEN", grund: "Die eigene Krankmeldung bestätigt eine andere Person." };
  if (!fallOffen(fall) || (schritt === "vorlaeufig" && fall.status !== KRANK_STATUS.EINGEGANGEN))
    return { status: 409, code: "SCHRITT_BEREITS",
      grund: `Diese Krankmeldung ist bereits ${STATUS_TEXT[fall.status] || "abgeschlossen"}.` };

  const verlaufNeu = (extra = {}) => [...liste(fall.verlauf), { ...schrittEintrag(schritt, akteur, jetzt), ...extra }];
  const ersetzt = (neu, mehr = {}) => ({ mandant: { ...m, krankmeldungen: faelle.map((f) => (f === fall ? neu : f)), ...mehr }, fall: neu });

  if (schritt === "vorlaeufig") return ersetzt({ ...fall, status: KRANK_STATUS.VORLAEUFIG, verlauf: verlaufNeu() });
  if (schritt === "ablehnen")
    return ersetzt({ ...fall, status: KRANK_STATUS.ABGELEHNT, verlauf: verlaufNeu(ablehngrund ? { grund: ablehngrund } : {}) });
  if (schritt === "zurueckziehen") return ersetzt({ ...fall, status: KRANK_STATUS.ZURUECKGEZOGEN, verlauf: verlaufNeu() });

  /* endgültig */
  if (!personen.some((x) => gleich(x.id, fall.personId))) return { status: 404, grund: "Person nicht gefunden." };
  if (!tagGueltig(fall.von) || !tagGueltig(fall.bis) || fall.bis < fall.von)
    return { status: 409, grund: "Der Zeitraum dieser Krankmeldung ist ungültig." };
  const abwId = `a-${fall.id}`;
  const abw = liste(m.abwesenheiten);
  /* Überschneidung (Review RB-2, L1): Steht für die Person im Zeitraum schon eine Abwesenheit, wird nicht
     stumm eine zweite angelegt. Genau dieselbe Krankheit (Art, von, bis) wird zusammengeführt — der Fall zeigt
     auf die bestehende; jede andere Überschneidung meldet 409, die Planung klärt sie im Plan. */
  const ueber = abw.filter((x) => x.id !== abwId && gleich(x.personId, fall.personId)
    && typeof x.von === "string" && typeof x.bis === "string" && x.von <= fall.bis && x.bis >= fall.von);
  if (ueber.length) {
    const gleiche = ueber.find((x) => x.art === "krank" && x.von === fall.von && x.bis === fall.bis);
    if (gleiche && ueber.length === 1) {
      const neu = { ...fall, status: KRANK_STATUS.ENDGUELTIG, abwesenheitId: gleiche.id, verlauf: verlaufNeu({ zusammengefuehrt: true }) };
      return { ...ersetzt(neu), abwesenheit: gleiche, zusammengefuehrt: true };
    }
    return { status: 409, code: "UEBERSCHNEIDUNG",
      grund: "Für diese Person steht im Zeitraum schon eine andere Abwesenheit. Bitte im Plan klären; der Fall bleibt offen." };
  }
  const abwesenheit = { id: abwId, personId: fall.personId, art: "krank", von: fall.von, bis: fall.bis,
    notiz: typeof fall.notiz === "string" ? fall.notiz : "" };
  const neu = { ...fall, status: KRANK_STATUS.ENDGUELTIG, abwesenheitId: abwId, verlauf: verlaufNeu() };
  return { ...ersetzt(neu, { abwesenheiten: [...(Array.isArray(m.abwesenheiten) ? m.abwesenheiten : []), abwesenheit] }), abwesenheit };
}

/** Kurzform für vorläufig/endgültig mit Fallkennung (frühere Signatur). */
export function krankmeldungBestaetigen(m, akteur, schritt, fallId, jetzt) {
  if (schritt !== "vorlaeufig" && schritt !== "endgueltig") return { status: 400, grund: "Unbekannter Schritt." };
  return krankmeldungSchritt(m, akteur, schritt, { id: fallId }, jetzt);
}

/* --------------------------------------------------------------------------
   AUFBEWAHRUNG (Review RB-2, M2)

   Die Anmerkung eines Falls ist eine Gesundheitsangabe wie die Anmerkung der Abwesenheit und fällt mit
   derselben Frist (Gründe, `gruendeMonate`): Endet der Zeitraum vor dem Stichtag, wird sie geleert. Ein Fall,
   der nicht wirksam wurde (abgelehnt, zurückgezogen, nie bestätigt), hat nach dieser Frist keinen Zweck mehr
   und wird ganz entfernt. Endgültige Fälle bleiben (ohne Anmerkung) — sie belegen die Bestätigung.
   -------------------------------------------------------------------------- */
const fallEnde = (f) => String(f.bis || f.von || "").slice(0, 10);
const hatText = (f) => !!String(f.notiz || "").trim() || !!String(f.grund || "").trim();
/** Was der Löschlauf an den Fällen täte: { entfernen, leeren } (Anzahl Fälle). */
export function faelleFaellig(faelle, grundStichtag) {
  let entfernen = 0, leeren = 0;
  for (const f of liste(faelle)) {
    const ende = fallEnde(f);
    if (!ende || ende >= grundStichtag) continue;
    if (!fallEndgueltig(f)) entfernen++;
    else if (hatText(f)) leeren++;
  }
  return { entfernen, leeren };
}
/** Die Fälle nach dem Löschlauf: nicht wirksame nach der Frist weg, wirksame ohne Anmerkung. */
export function faelleRaeumen(faelle, grundStichtag, heuteIso) {
  if (!Array.isArray(faelle)) return faelle;
  return faelle.flatMap((f) => {
    if (!istObj(f)) return [f];
    const ende = fallEnde(f);
    if (!ende || ende >= grundStichtag) return [f];
    if (!fallEndgueltig(f)) return [];
    if (!hatText(f)) return [f];
    return [{ ...f, notiz: "", ...(f.grund !== undefined ? { grund: "" } : {}), grundGeloescht: heuteIso }];
  });
}


/**
 * Ältere Oberflächen schreiben eine Krankmeldung von Beschäftigten und Schichtverantwortung als
 * Abwesenheit über PUT /api/bestand. Der Server macht daraus einen eingegangenen Fall — wirksam
 * wird sie erst mit der endgültigen Bestätigung. Kennung: `km-` + Kennung des Eintrags.
 * @param {any} eintrag  bereits geprüfter Eintrag { id, personId, von, bis, notiz? }
 */
export function fallAusAbwesenheit(eintrag, akteur, jetzt) {
  const fall = { id: `km-${eintrag.id}`.slice(0, 64), personId: eintrag.personId, von: eintrag.von, bis: eintrag.bis,
    status: KRANK_STATUS.EINGEGANGEN, verlauf: [schrittEintrag("eingegangen", akteur, jetzt)] };
  if (typeof eintrag.notiz === "string" && eintrag.notiz.trim()) fall.notiz = eintrag.notiz;
  return fall;
}

/**
 * Zeilen für das Betriebsprotokoll aus einem Speichervorgang (PUT /api/bestand): neue eingegangene
 * Fälle und Krankmeldungen, die Planung oder Leitung unmittelbar als Abwesenheit eintragen (das ist
 * selbst die endgültige Bestätigung). Ohne Person, Tag und Anmerkung — nur Kennung, Schritt, Rolle.
 */
export function krankProtokollZeilen(altB, neuB, rolle) {
  const mandanten = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter(istObj);
  const alt = new Map(mandanten(altB).map((m) => [m.id, m]));
  const zeilen = [];
  for (const m of mandanten(neuB)) {
    const vorher = alt.get(m.id) || {};
    const faelleAlt = new Set(liste(vorher.krankmeldungen).map((f) => f.id));
    for (const f of liste(m.krankmeldungen)) if (!faelleAlt.has(f.id)) zeilen.push(`Krankmeldung ${f.id}: eingegangen · Rolle ${rolle}`);
    if (ENDGUELTIG_ROLLEN.includes(rolle)) {
      const abwAlt = new Set(liste(vorher.abwesenheiten).map((a) => String(a.id)));
      for (const a of liste(m.abwesenheiten))
        if (a.art === "krank" && !abwAlt.has(String(a.id))) zeilen.push(`Krankmeldung ${a.id}: endgültig (unmittelbar eingetragen) · Rolle ${rolle}`);
    }
  }
  return zeilen;
}

/* --------------------------------------------------------------------------
   BENACHRICHTIGUNG BEI EINGANG (RB-4)

   Betreiberentscheidung 2026-11-11: „Bei Eingang einer Krankmeldung sollen zuständige Planer und
   Betriebsleiter benachrichtigt werden. Die zuständige Schichtverantwortung kann eine sachlich
   erforderliche Benachrichtigung erhalten. Push und E-Mail enthalten keine Gesundheitsdetails.“

   Empfänger (je neuem Fall genau einmal, Kennung n-krank-<Fall>-<Empfänger>):
   - Planung und Leitung des Betriebs (Rollen „planer“, „leitung“): alle Personen des Betriebs mit dieser
     Rolle, die heute im Betrieb gelten (Review #205: aktivePerson aus personengueltig.mjs — genau einmal in
     der Liste, nicht anonymisiert, Status „aktiv“ oder ohne Angabe, nicht ausgetreten — und Eintritt gesetzt
     und nicht nach heute; dieselbe Regel für die Schichtverantwortung). Einen Bereichsumfang hat die Planung im
     Datenmodell nicht (schreibumfang „voll“, rechte.mjs) — zuständig ist damit die Planung des Betriebs.
     Die Kundenrolle (alter Probierraum) bekommt nichts: die Entscheidung nennt Planer und Betriebsleiter.
   - Schichtverantwortung („subplaner“) NUR, wenn es sachlich erforderlich ist: Die gemeldete Person hat ab
     heute (Berliner Zeit) bis zum Ende des Zeitraums an mindestens einem Tag einen Dienst (dienstAm:
     Abweichung, sonst Schichtfolge), und die Schichtverantwortung ist an genau diesem Tag für die Einheit
     dieser Person zuständig (svZustaendig — dieselbe tagesgenaue Bereichsregel wie beim vorläufigen
     Bestätigen). Ein rein rückwirkender Zeitraum oder einer ohne Dienst braucht keine Umplanung im Bereich.
     Geprüft werden höchstens SV_TAGE_MAX Tage ab dem ersten offenen Tag.
   - Nie: die gemeldete Person selbst, die meldende Person, Beschäftigte, Betriebsrat, Betreiber, Personen
     anderer Betriebe (es zählen nur die Personen dieses Betriebs).

   Inhalt: neutral, ohne Namen, ohne Tag, ohne Grund, ohne Anmerkung, ohne das Wort „krank“. Die
   Mitteilung im Postfach trägt KRANK_HINWEIS_TITEL/-TEXT; E-Mail und Push tragen ohnehin nur den
   neutralen Hinweis der Art (zustellregeln.mjs, HINWEIS_TITEL) — nie Titel oder Text der Mitteilung.
   `quelle` = { art: "krankmeldung", id: <Fall> } setzt nur der Server (mitteilungen.mjs, NUR_SERVER und
   nurVomServer) — ein Client kann eine solche Mitteilung weder anlegen noch ändern. Kein `tag`: Die
   Mitteilung betrifft keinen Plantag; die Entwurfsregel greift damit nicht (Empfänger sind Planung,
   Leitung und Schichtverantwortung, die den Plan in der Anwendung ohnehin sehen).
   Zugestellt wird nach dem Speichern über versand.mjs (Wünsche je Person und Art, Sammelschalter,
   Kontingente, Schalter der Anbieter) — ohne Anbieter (RESEND_API_KEY/SMTP, VAPID) geht nichts hinaus.
   -------------------------------------------------------------------------- */
export const KRANK_ART = "krankmeldungEingegangen";
export const KRANK_HINWEIS_TITEL = "Neue Meldung zur Abwesenheit";
export const KRANK_HINWEIS_TEXT = "Bitte in CENTRIC prüfen.";
const KRANK_PLANUNG_ROLLEN = ["planer", "leitung"];
const SV_TAGE_MAX = 62;

const tagNach = (s) => new Date(Date.parse(`${s}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Empfänger nur, wer heute im Betrieb gilt (aktivePerson) und schon eingetreten ist. Eintritt null/"" heißt im
    Datenmodell „nie beschäftigt“ (imDienst) — kein Empfänger; ohne Angabe (undefined) gilt wie bisher „von Anfang an“.
    Eine Sperre des Anmeldekontos (accounts.mjs) liegt nicht im Betrieb und ist hier nicht lesbar; zugestellt wird an
    Adresse und Push-Anmeldung der Person (Abmelden löscht die Anmeldung) — siehe PILOT-DATENSCHUTZ-RAHMEN.md. */
const aktivAm = (m, p, heute) => {
  if (!aktivePerson(m, p.id, heute)) return false;
  if (p.eintritt === null || p.eintritt === "") return false;
  return !(typeof p.eintritt === "string" && p.eintritt > heute);
};

/**
 * Wer bekommt zu diesem neuen Fall eine Mitteilung?
 * @param {any} m  der Betrieb
 * @param {any} fall  { id, personId, von, bis, verlauf }
 * @param {string} [heute]  JJJJ-MM-TT (Berlin)
 * @returns {{ planung: any[], sv: any[] }}
 */
export function krankEmpfaenger(m, fall, heute = laufenderTag()) {
  const personen = liste(m && m.personen);
  const p = personen.find((x) => gleich(x.id, fall && fall.personId));
  if (!p || !istObj(fall)) return { planung: [], sv: [] };
  const melder = meldendePerson(fall);
  const ausgeschlossen = (x) => gleich(x.id, p.id) || (melder !== undefined && melder !== null && gleich(x.id, melder));
  const planung = personen.filter((x) => KRANK_PLANUNG_ROLLEN.includes(x.rolle) && !ausgeschlossen(x) && aktivAm(m, x, heute));
  const sv = [];
  if (tagGueltig(fall.von) && tagGueltig(fall.bis) && fall.bis >= fall.von) {
    const kandidaten = personen.filter((x) => x.rolle === "subplaner" && !ausgeschlossen(x) && aktivAm(m, x, heute));
    const gefunden = new Set();
    let d = fall.von < heute ? heute : fall.von;
    for (let i = 0; i < SV_TAGE_MAX && d <= fall.bis && gefunden.size < kandidaten.length; i++, d = tagNach(d)) {
      if (!dienstAm(m, p, d)) continue;
      for (const s of kandidaten) if (!gefunden.has(String(s.id)) && svZustaendig(m, s, p.id, d, d)) gefunden.add(String(s.id));
    }
    for (const s of kandidaten) if (gefunden.has(String(s.id))) sv.push(s);
  }
  return { planung, sv };
}

/**
 * Erzeugt zu jedem NEUEN eingegangenen Fall (in `neuM`, nicht in `altM`), den die Person `ich` gemeldet hat,
 * die Mitteilungen an die Empfänger (krankEmpfaenger). Kennungen sind fest: Was es schon gibt, entsteht nicht
 * noch einmal (Wiederholung, zweiter Aufruf). Andere Fälle (fremd gemeldet, schon bekannt) lösen nichts aus.
 * @returns {any} der Betrieb mit den neuen Mitteilungen vorn
 */
export function krankmeldungMitteilungen(altM, neuM, ich, heute = laufenderTag()) {
  if (!istObj(neuM) || ich === null || ich === undefined) return neuM;
  const bekannt = new Set(liste(altM && altM.krankmeldungen).map((f) => String(f.id)));
  const neu = liste(neuM.krankmeldungen).filter((f) => !bekannt.has(String(f.id))
    && f.status === KRANK_STATUS.EINGEGANGEN && gleich(meldendePerson(f), ich));
  if (!neu.length) return neuM;
  const basis = Array.isArray(neuM.nachrichten) ? neuM.nachrichten : Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [];
  const vorhanden = new Set(basis.filter(istObj).map((n) => String(n.id)));
  const dazu = [];
  for (const f of neu) {
    const { planung, sv } = krankEmpfaenger(neuM, f, heute);
    for (const e of [...planung, ...sv]) {
      const id = `n-krank-${f.id}-${e.id}`;
      if (vorhanden.has(id)) continue;
      vorhanden.add(id);
      dazu.push(servermitteilung({ id, personId: e.id, art: KRANK_ART, titel: KRANK_HINWEIS_TITEL, text: KRANK_HINWEIS_TEXT,
        ziel: "lage", quelle: { art: "krankmeldung", id: f.id } }));
    }
  }
  if (!dazu.length) return neuM;
  return { ...neuM, nachrichten: [...dazu, ...basis] };
}

/**
 * Zeilen für das Betriebsprotokoll: je Fall, zu dem in diesem Vorgang Mitteilungen entstanden sind, die Zahl
 * der Empfänger — ohne Person, Tag, Anmerkung oder Empfängernamen.
 */
export function krankBenachrichtigungZeilen(altM, neuM) {
  const alt = new Set(liste(altM && altM.nachrichten).map((n) => String(n.id)));
  const jeFall = new Map();
  for (const n of liste(neuM && neuM.nachrichten)) {
    if (alt.has(String(n.id)) || n.art !== KRANK_ART || !istObj(n.quelle) || n.quelle.art !== "krankmeldung") continue;
    const k = String(n.quelle.id);
    jeFall.set(k, (jeFall.get(k) || 0) + 1);
  }
  return [...jeFall].map(([id, anzahl]) => `Krankmeldung ${id}: Benachrichtigung an ${anzahl} Empfänger (Planung, Leitung, Schichtverantwortung nach Zuständigkeit)`);
}
