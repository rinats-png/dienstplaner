/* ==========================================================================
   SCHUTZPRÜFUNG — die eine (WP-11)

   Jugendarbeitsschutz, Mutterschutz, Schwerbehinderung und die neutralen
   Einsatzregeln der Schichtverantwortung, dazu die Zeit- und Nachtrechnung,
   die sie brauchen. Bis WP-11 stand das in src/regelwerk.js und war für den
   Server unerreichbar (das Serverbild enthält kein src/). Jetzt hier, rein
   und ohne Abhängigkeiten: Die Oberfläche liest es über src/regelwerk.js
   (Re-Export), der Server direkt — etwa, um eine Bestätigung abzuweisen,
   die einen harten Schutzbefund wegbestätigen soll (rechte.mjs).
   Es gibt keine zweite Fassung: pruefungen/schutzpruefung-eine.test.js
   prüft per Quelltextsuche, dass schutzBefunde und regelBefunde nur hier
   aufgerufen werden und alle Verbraucher über schutzEinsatz gehen.
   ========================================================================== */

export const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
/** Ein Kalendertag als Millisekunden in UTC — ohne Zeitzone, deshalb schnell
    (Nachprüfung WP-11, N1: `new Date(j, m, t)` kostet unter Windows je Aufruf
    eine Zeitzonenauflösung, die Nachrechnung rief es zehntausendfach). */
const UTC_SPEICHER = new Map();
export const tagUTC = (s) => {
  let v = UTC_SPEICHER.get(s);
  if (v === undefined) {
    const [y, m, d] = s.split("-").map(Number);
    v = Date.UTC(y, m - 1, d);
    if (UTC_SPEICHER.size > 20000) UTC_SPEICHER.clear();
    UTC_SPEICHER.set(s, v);
  }
  return v;
};
/** n Kalendertage weiter — in UTC gerechnet, dasselbe Ergebnis wie über die
    Ortszeit; zwischengespeichert, weil die Prüfungen dieselben Tage immer
    wieder verschieben (WP-22). */
const TAGE_SPEICHER = new Map();
export const addDays = (s, n) => {
  let je = TAGE_SPEICHER.get(s);
  if (!je) { if (TAGE_SPEICHER.size > 20000) TAGE_SPEICHER.clear(); je = new Map(); TAGE_SPEICHER.set(s, je); }
  let v = je.get(n);
  if (v === undefined) { v = new Date(tagUTC(s) + n * 86400000).toISOString().slice(0, 10); je.set(n, v); }
  return v;
};
/** Montag ist 0 — im deutschen Arbeitsrecht beginnt die Woche dort. */
const DOW = new Map();
export const dow = (s) => {
  let w = DOW.get(s);
  if (w === undefined) { w = (new Date(tagUTC(s)).getUTCDay() + 6) % 7; if (DOW.size > 10000) DOW.clear(); DOW.set(s, w); }
  return w;
};

/* „HH:MM" ohne Zwischenzeichenketten (WP-22, Laufzeit); alles andere wie bisher. */
const ziffer = (c) => c >= 48 && c <= 57;
export const toMin = (t) => {
  const a = t.charCodeAt(0), b = t.charCodeAt(1), c = t.charCodeAt(3), d = t.charCodeAt(4);
  if (t.charCodeAt(2) === 58 && ziffer(a) && ziffer(b) && ziffer(c) && ziffer(d)) return (a - 48) * 600 + (b - 48) * 60 + (c - 48) * 10 + (d - 48);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
};

/** Bezahlte Stunden eines Dienstes, Pause abgezogen. */
export function dauer(d) {
  let x = toMin(d.ende) - toMin(d.start);
  if (x <= 0) x += 1440;                     // Ende vor Start heißt Folgetag
  return Math.round((x / 60 - (d.pause || 0) / 60) * 100) / 100;
}

export const NACHT_VON = 23 * 60;
export const NACHT_BIS = 6 * 60;

/** Minuten eines Dienstes, die in die Nachtzeit fallen. */
export function nachtMinuten(d) {
  const s = toMin(d.start);
  let e = toMin(d.ende);
  if (e <= s) e += 1440;
  let summe = 0;
  /* Zwei Abschnitte, weil die Nachtzeit über Mitternacht läuft: 23–24 Uhr
     des Vortags reicht als 1380–1440 herein, 0–6 Uhr als 0–360, und für
     Dienste, die über Mitternacht gehen, noch einmal 1440+ */
  for (const [a, b] of [[0, NACHT_BIS], [NACHT_VON, 1440 + NACHT_BIS], [1440 + NACHT_VON, 2880]]) {
    summe += Math.max(0, Math.min(e, b) - Math.max(s, a));
  }
  return Math.min(summe, e - s);
}

/** Ist das ein Nachtdienst im Sinne des § 2 Abs. 4? */
export function istNachtdienst(d) {
  return nachtMinuten(d) > 120;
}

/**
 * Liegt ein Teil des Dienstes zwischen 20 und 6 Uhr? Das gesetzliche
 * Fenster von § 14 Abs. 1 JArbSchG und § 5 Abs. 1 MuSchG (Review WP-11, F3).
 * Bis dahin prüfte CENTRIC „Nachtdienst" (mehr als zwei Stunden zwischen 23
 * und 6 Uhr) oder Beginn vor 6 Uhr — ein Spätdienst 14–22 Uhr einer
 * Sechzehnjährigen blieb ohne Befund, obwohl der Text „20 bis 6 Uhr" sagte.
 * Jede Überschneidung zählt. Für Jugendliche ab 16 Jahren unterscheidet
 * schutzBefunde 20–23 Uhr (§ 14 Abs. 2 JArbSchG, Nachprüfung WP-11) von
 * 23–6 Uhr; die Branchenfenster (§ 14 Abs. 2 bis 7: Gaststätten bis 22 Uhr,
 * Bäckereien ab 5 bzw. 4 Uhr, Landwirtschaft) und § 5 Abs. 2 MuSchG (20–22
 * Uhr mit Einwilligung und behördlicher Genehmigung) kennt die Prüfung
 * nicht — dokumentiert im Regelregister.
 */
export function imNachtfenster20bis6(d) {
  return ueberschneidet(d, [[0, 360], [1200, 1800], [2640, 2880]]);
}

/** Liegt ein Teil des Dienstes zwischen 23 und 6 Uhr (Grenze für Jugendliche ab 16 im mehrschichtigen Betrieb)? */
export function imNachtfenster23bis6(d) {
  return ueberschneidet(d, [[0, 360], [1380, 1800], [2820, 2880]]);
}

/** Liegt ein Teil des Dienstes zwischen 22 und 6 Uhr (Grenze mit Einwilligung, § 5 Abs. 2 MuSchG)? */
export function imNachtfenster22bis6(d) {
  return ueberschneidet(d, [[0, 360], [1320, 1800], [2760, 2880]]);
}

/** Arten einer Einwilligung nach dem Mutterschutzgesetz: 20–22 Uhr (§ 5 Abs. 2), Sonn- und Feiertag (§ 6 Abs. 1). */
export const EINWILLIGUNG_ARTEN = Object.freeze(["nacht", "sonntag"]);

/**
 * Die am Tag gültige Einwilligung einer Person (Art „nacht" oder „sonntag") oder null.
 * @param {any} person
 * @param {string} art
 * @param {string} datum
 */
export function einwilligungAm(person, art, datum) {
  const l = person && Array.isArray(person.mutterschutzEinwilligungen) ? person.mutterschutzEinwilligungen : [];
  for (const e of l)
    if (e && typeof e === "object" && e.art === art && typeof e.ab === "string" && e.ab <= datum && (!e.bis || datum <= e.bis)) return e;
  return null;
}

/** Überschneidet der Dienst eines der Fenster (Minuten ab Mitternacht des Dienstbeginns)? */
function ueberschneidet(d, fenster) {
  const s = toMin(d.start);
  let e = toMin(d.ende);
  if (e <= s) e += 1440;
  for (const [a, b] of fenster) if (Math.min(e, b) > Math.max(s, a)) return true;
  return false;
}

/**
 * Betriebseinstellung „mehrschichtiger Betrieb" (§ 14 Abs. 2 Nr. 2 JArbSchG):
 * Jugendliche über 16 Jahre dürfen dort bis 23 Uhr beschäftigt werden. Setzen
 * darf sie nur, wer org.edit hat (server/lib/rechte.mjs, jugendschutzZusammen).
 * @param {any} [einst] Einstellungen des Betriebs
 */
export const jugendMehrschichtig = (einst) =>
  !!(einst && typeof einst === "object" && einst.jugendschutz && typeof einst.jugendschutz === "object"
    && einst.jugendschutz.mehrschichtig === true);

/**
 * Die Nachtruhe Jugendlicher (§ 14 JArbSchG) für einen Dienst — dieselbe
 * Bewertung für Rohdaten (schutzBefunde) und Einsatzregeln (regelBefunde):
 *   unter 16 Jahren:  jede Überschneidung mit 20–6 Uhr hart;
 *   ab 16 Jahren:     23–6 Uhr hart (auch Beginn vor 6 Uhr);
 *                     20–23 Uhr mit Einstellung „mehrschichtig" ein Hinweis,
 *                     ohne sie „Achtung" (bestätigungspflichtig) — die
 *                     Ausnahme kann je nach Betrieb gelten oder nicht.
 * @param {boolean} ab16
 * @returns {null | "hart" | "achtung" | "hinweis"}
 */
export function jugendNachtBewertung(dienstart, ab16, einst) {
  if (!ab16) return imNachtfenster20bis6(dienstart) ? "hart" : null;
  if (imNachtfenster23bis6(dienstart)) return "hart";
  if (!imNachtfenster20bis6(dienstart)) return null;
  return jugendMehrschichtig(einst) ? "hinweis" : "achtung";
}

/** Alter in Jahren am Stichtag. Ohne Geburtsdatum: null. */
/* Gibt es den Kalendertag? Zwischengespeichert — die Nachrechnung fragt je
   Person und Tag (Nachprüfung WP-11, N1). */
const GUELTIG = new Map();
function tagGueltig(s) {
  let ok = GUELTIG.get(s);
  if (ok === undefined) {
    const [j, m, t] = s.split("-").map(Number);
    const echt = new Date(Date.UTC(j, m - 1, t));
    ok = echt.getUTCFullYear() === j && echt.getUTCMonth() === m - 1 && echt.getUTCDate() === t;
    if (GUELTIG.size > 10000) GUELTIG.clear();
    GUELTIG.set(s, ok);
  }
  return ok;
}
/* Alter je Geburtsdatum und Tag, zwischengespeichert (WP-22, Laufzeit). */
const ALTER = new Map();
export function alterAm(geburtstag, datum) {
  if (!geburtstag) return null;
  const g = String(geburtstag);
  let je = ALTER.get(g);
  if (!je) { if (ALTER.size > 5000) ALTER.clear(); je = new Map(); ALTER.set(g, je); }
  let v = je.get(datum);
  if (v !== undefined) return v;
  v = null;
  /* Einen Tag, den es nicht gibt (30.02.), rechnet Date auf den 02.03. weiter —
     das wäre ein falsches Alter statt keines. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(g) && tagGueltig(g)) {
    const gj = Number(g.slice(0, 4)), gm = Number(g.slice(5, 7)), gt = Number(g.slice(8, 10));
    const j = Number(datum.slice(0, 4)), m = Number(datum.slice(5, 7)), t = Number(datum.slice(8, 10));
    v = j - gj;
    if (m < gm || (m === gm && t < gt)) v--;                         // vor dem Geburtstag
  }
  if (je.size > 2000) je.clear();
  je.set(datum, v);
  return v;
}

/**
 * Prüft einen geplanten Dienst gegen die Schutzvorschriften.
 *
 * @param {any} person
 * @param {any} dienstart
 * @param {string} datum
 * @param {any} [einst] Einstellungen des Betriebs (jugendschutz.mehrschichtig)
 * @returns Liste von Befunden: { regel, text, hart, hinweis? }
 *   hart = die Zuweisung ist unzulässig, nicht nur bedenklich;
 *   hinweis = zulässig nach einer hinterlegten Ausnahme, nur zur Kenntnis.
 */
export function schutzBefunde(person, dienstart, datum, einst) {
  const aus = [];
  const alter = alterAm(person.geburtstag || person.geburtsdatum, datum);

  /* --- Jugendarbeitsschutzgesetz --- */
  /* Fehlt das Geburtsdatum (oder ist es ungültig), lässt sich nicht sagen, ob
     das Gesetz gilt. Das ist „nicht bewertbar" — kein Verstoß, aber auch nicht
     stillschweigend zulässig. Gemeldet wird nur, wo es darauf ankäme: bei einem
     Dienst, den eine minderjährige Person nicht leisten dürfte. */
  if (alter === null && (imNachtfenster20bis6(dienstart) || dauer(dienstart) > 8.5))
    aus.push({ regel: "JArbSchG (Geburtsdatum)", hart: false, offen: true,
      text: "Das Geburtsdatum fehlt oder ist ungültig. Ob das Jugendarbeitsschutzgesetz gilt, lässt sich nicht prüfen — "
        + "für Jugendliche wäre dieser Dienst nicht zulässig (zwischen 20 und 6 Uhr oder über acht Stunden)." });
  if (alter !== null && alter < 18) {
    const nacht = jugendNachtBewertung(dienstart, alter >= 16, einst);
    if (nacht === "hart")
      aus.push({ regel: "JArbSchG § 14", hart: true,
        text: alter >= 16 ? "Jugendliche dürfen auch ab 16 Jahren nicht zwischen 23 und 6 Uhr beschäftigt werden."
          : "Jugendliche dürfen nicht zwischen 20 und 6 Uhr beschäftigt werden." });
    else if (nacht === "achtung")
      aus.push({ regel: "JArbSchG § 14 Abs. 2", hart: false,
        text: "Zwischen 20 und 23 Uhr nur mit einer gesetzlichen Ausnahme für Jugendliche ab 16 Jahren (etwa im mehrschichtigen Betrieb) — bitte prüfen." });
    else if (nacht === "hinweis")
      aus.push({ regel: "JArbSchG § 14 Abs. 2", hart: false, hinweis: true,
        text: "Bis 23 Uhr zulässig: Der Betrieb ist als mehrschichtig hinterlegt (Ausnahme für Jugendliche ab 16 Jahren)." });
    if (dauer(dienstart) > 8.5)
      aus.push({ regel: "JArbSchG § 8", hart: true,
        text: "Für Jugendliche gelten höchstens acht Stunden täglich." });
    if (dow(datum) >= 5)
      aus.push({ regel: "JArbSchG §§ 16–17", hart: false,
        text: "Samstags- und Sonntagsarbeit Jugendlicher ist nur in Ausnahmen zulässig — in der Pflege erlaubt, mit Ersatzruhetag." });
  }

  /* --- Mutterschutzgesetz ---
     Nutzerentscheidung (WP-11): Eine an der Person erfasste Einwilligung
     (mutterschutzEinwilligungen, § 5 Abs. 2 / § 6 Abs. 1 MuSchG) macht den
     Befund im Gültigkeitszeitraum zum Hinweis: 20–22 Uhr bzw. Sonntag. Nach
     22 Uhr bleibt Nachtarbeit hart; ohne gültige Einwilligung ebenso. */
  if (person.mutterschutz) {
    if (imNachtfenster20bis6(dienstart)) {
      const ew = einwilligungAm(person, "nacht", datum);
      if (ew && !imNachtfenster22bis6(dienstart))
        aus.push({ regel: "MuSchG § 5 Abs. 2", hart: false, hinweis: true,
          text: ew.genehmigung ? "Arbeit bis 22 Uhr mit Einwilligung; die behördliche Genehmigung liegt vor."
            : "Arbeit bis 22 Uhr mit Einwilligung; die behördliche Genehmigung (§ 28 MuSchG) muss vorliegen." });
      else
        aus.push({ regel: "MuSchG § 5", hart: true,
          text: ew ? "Nach 22 Uhr auch mit Einwilligung nicht zulässig."
            : "Nachtarbeit zwischen 20 und 6 Uhr nur mit Einwilligung und behördlicher Genehmigung." });
    }
    if (dow(datum) === 6) {
      if (einwilligungAm(person, "sonntag", datum))
        aus.push({ regel: "MuSchG § 6 Abs. 1", hart: false, hinweis: true, text: "Sonntagsarbeit mit ausdrücklicher Einwilligung." });
      else
        aus.push({ regel: "MuSchG § 6", hart: true, text: "Sonntagsarbeit nur mit ausdrücklicher Einwilligung." });
    }
  }

  /* --- Schwerbehinderung --- */
  if (person.schwerbehindert && dauer(dienstart) > 8)
    aus.push({ regel: "SGB IX § 207", hart: false,
      text: "Schwerbehinderte Menschen sind auf Verlangen von Mehrarbeit über acht Stunden freizustellen." });

  return aus;
}

/**
 * DIE SCHUTZPRÜFUNG (WP-11: genau eine). Jede Stelle, die wissen will, ob
 * eine Person einen Dienst leisten darf — Planprüfung (pruefen), Warndialog
 * und Einteilung (hindernisBefunde), Ersatzsuche, Vergabe und Selbstplanung
 * (einsatzSchutz) —, liest hier, damit sie über dieselbe Person und denselben
 * Dienst nie Verschiedenes sagen. Die Daten bestimmen den Weg
 * (schutzBefundeFuer: Rohdaten mit Fundstelle, Einsatzregeln neutral, ohne
 * Einsatzregeln „nicht möglich"); die Bewertung steht nur hier:
 *
 *   hart (Verbot)  → Rechtsverstoß (stufe "recht", schwere "danger") und
 *                    sperrt — Schutz besonderer Personengruppen lässt sich
 *                    nicht wegbestätigen (Kette B, maßgeblich);
 *   nicht hart (Pflicht zur Freistellung auf Verlangen, Ausnahme) → Achtung;
 *   offen (Daten fehlen, nicht bewertbar) → Hinweis, nie „erfüllt".
 *
 * Zusammengeführt aus schutzEinsatz (Kette A: Bewertung, „nicht bewertbar")
 * und schutzBefundeFuer/einsatzSchutz (Kette B: Datenweg, Sperre).
 * @returns {{regel: string, text: string, offen: boolean, neutral: boolean, hart: boolean, hinweis: boolean, sperrt: boolean, stufe: string, schwere: string}[]}
 */
export function schutzEinsatz(person, dienstart, datum, einst) {
  return /** @type {any[]} */ (schutzBefundeFuer(person, dienstart, datum, einst)).map((b) => ({
    regel: b.regel, text: b.text, offen: !!b.offen, neutral: !!b.neutral, hart: !!b.hart, hinweis: !!b.hinweis,
    /* offen = nicht bewertbar, hinweis = Ausnahme des Betriebs hinterlegt:
       beides nur zur Kenntnis, nichts zu bestätigen, nichts zu sperren */
    sperrt: !!b.hart && !b.offen,
    stufe: b.offen || b.hinweis ? "hinweis" : b.hart ? "recht" : "achtung",
    schwere: b.hart ? "danger" : b.hinweis ? "info" : "warn",
  }));
}

/* --------------------------------------------------------------------------
   EINSATZREGELN STATT SCHUTZMERKMALE (Commit S1)

   Die Schichtverantwortung bekommt Mutterschutz, Schwerbehinderung,
   Geburtsdatum und Wiedereingliederung ihrer Leute nicht mehr. Der Server
   leitet daraus bei jedem Lesen Einsatzregeln ab (server/lib/planungsregeln.mjs)
   — ohne Grund, mit Zeitraum. Hier werden sie auf einen Dienst angewendet:
   dieselben Bedingungen und dieselbe Härte wie in schutzBefunde, aber mit
   neutralen Texten, die weder Diagnose noch Gesetz nennen.
   pruefungen/schutzmerkmale-sicht.test.js prüft die Gleichwertigkeit.

   Eine unbekannte Regel sperrt (fail-closed): Was der Server meint, aber
   diese Fassung nicht versteht, darf nicht als „frei" durchgehen.
   -------------------------------------------------------------------------- */
export const EINSATZREGEL_TEXTE = {
  nachtNichtZulaessig: "Nachteinsatz 20–6 Uhr nicht zulässig.",
  nachtAb23NichtZulaessig: "Nachteinsatz 23–6 Uhr nicht zulässig.",
  nachtSpaetPruefen: "Einsatz 20–23 Uhr nur mit einer betrieblichen Ausnahme — bitte prüfen.",
  nachtSpaetAusnahme: "Einsatz bis 23 Uhr: Ausnahme des Betriebs hinterlegt.",
  nachtAb22NichtZulaessig: "Nachteinsatz 22–6 Uhr nicht zulässig.",
  nachtMitFreigabe: "Einsatz 20–22 Uhr: Freigabe hinterlegt.",
  sonntagMitFreigabe: "Sonntagseinsatz: Freigabe hinterlegt.",
  hoechstens8hTag: "Dienst überschreitet die zulässige Tagesdauer.",
  wochenendePruefen: "Wochenendeinsatz prüfen.",
  sonntagNurMitFreigabe: "Sonntagseinsatz nur mit Freigabe der Planung.",
  ueber8hNurAbsprache: "Dienst über 8 Stunden nur nach Absprache.",
  stundengrenzeWoche: "Wochenstundengrenze überschritten.",
  unbekannt: "Einsatzregel nicht auswertbar — Planungsprüfung erforderlich.",
  alterNichtBewertbar: "Alter nicht hinterlegt — ob dieser Einsatz zulässig ist (zwischen 20 und 6 Uhr, über acht Stunden), lässt sich nicht prüfen.",
};

/**
 * Die abgeleiteten Einsatzregeln einer Person auf einen geplanten Dienst
 * anwenden. Gegenstück zu schutzBefunde für die Sicht ohne Rohdaten.
 * Die Wochenstundengrenze gilt für eine Woche, nicht für einen Dienst; sie
 * liest stundengrenzeAusRegeln.
 * @returns Liste von Befunden: { regel, text, hart }
 */
export function regelBefunde(planungsregeln, dienstart, datum, einst) {
  const aus = [];
  for (const r of Array.isArray(planungsregeln) ? planungsregeln : []) {
    if (!r || typeof r !== "object") continue;
    if (r.von && datum < r.von) continue;
    if (r.bis && datum > r.bis) continue;
    const treffer = (bed) => { if (bed) aus.push({ regel: r.regel, hart: r.hart === true, text: EINSATZREGEL_TEXTE[r.regel] }); };
    switch (r.regel) {
      case "nachtNichtZulaessig": treffer(imNachtfenster20bis6(dienstart)); break;
      /* Ab 16 Jahren (Nachprüfung WP-11): 23–6 Uhr hart, 20–23 Uhr je nach
         Einstellung des Betriebs — dieselbe Bewertung wie schutzBefunde
         (jugendNachtBewertung). Die Treffer heißen wie die Regel mit
         Rohdaten: hart „nachtNichtZulaessig", sonst „nachtSpaetPruefen". */
      case "nachtAb23NichtZulaessig": {
        const n = jugendNachtBewertung(dienstart, true, einst);
        if (n === "hart") aus.push({ regel: "nachtNichtZulaessig", hart: true, text: EINSATZREGEL_TEXTE.nachtAb23NichtZulaessig });
        else if (n === "achtung") aus.push({ regel: "nachtSpaetPruefen", hart: false, text: EINSATZREGEL_TEXTE.nachtSpaetPruefen });
        else if (n === "hinweis") aus.push({ regel: "nachtSpaetPruefen", hart: false, hinweis: true, text: EINSATZREGEL_TEXTE.nachtSpaetAusnahme });
        break;
      }
      case "hoechstens8hTag": treffer(dauer(dienstart) > 8.5); break;
      case "wochenendePruefen": treffer(dow(datum) >= 5); break;
      case "sonntagNurMitFreigabe": treffer(dow(datum) === 6); break;
      /* Mit hinterlegter Einwilligung (Nutzerentscheidung, WP-11): dieselbe
         Bewertung wie schutzBefunde — 22–6 Uhr hart, 20–22 Uhr bzw. Sonntag
         nur ein Hinweis. Treffer heißen wie mit Rohdaten. */
      case "nachtAb22NichtZulaessig":
        if (imNachtfenster22bis6(dienstart)) aus.push({ regel: "nachtNichtZulaessig", hart: true, text: EINSATZREGEL_TEXTE.nachtAb22NichtZulaessig });
        else if (imNachtfenster20bis6(dienstart)) aus.push({ regel: "nachtMitFreigabe", hart: false, hinweis: true, text: EINSATZREGEL_TEXTE.nachtMitFreigabe });
        break;
      case "sonntagFreigegeben":
        if (dow(datum) === 6) aus.push({ regel: "sonntagMitFreigabe", hart: false, hinweis: true, text: EINSATZREGEL_TEXTE.sonntagMitFreigabe });
        break;
      case "ueber8hNurAbsprache": treffer(dauer(dienstart) > 8); break;
      case "stundengrenzeWoche": break;
      /* Geburtsdatum fehlt (planungsregeln.mjs): nicht bewertbar — ein
         Hinweis bei den Diensten, die für Jugendliche unzulässig wären,
         wie schutzBefunde mit Rohdaten (WP-11). */
      case "alterNichtBewertbar":
        if (imNachtfenster20bis6(dienstart) || dauer(dienstart) > 8.5)
          aus.push({ regel: r.regel, hart: false, offen: true, text: EINSATZREGEL_TEXTE.alterNichtBewertbar });
        break;
      default: aus.push({ regel: "unbekannt", hart: true, text: EINSATZREGEL_TEXTE.unbekannt });
    }
  }
  return aus;
}

/**
 * Die Schutzprüfung einer Person für einen geplanten Dienst — auf dem Weg,
 * den ihre Daten zulassen, nie auf zweien:
 * - planungsregeln vorhanden (Sicht der Schichtverantwortung): regelBefunde,
 *   neutral;
 * - die Sicht erwartet planungsregeln (sichtbereich Bereich oder Pool), sie
 *   fehlen: ein sperrender Befund — ohne Daten ist niemand frei planbar;
 * - sonst die Rohdaten: schutzBefunde, mit Fundstelle.
 * @returns Liste von Befunden: { regel, text, hart, neutral? }
 */
export function schutzBefundeFuer(person, dienstart, datum, einst) {
  if (Array.isArray(person.planungsregeln))
    return regelBefunde(person.planungsregeln, dienstart, datum, einst).map((b) => ({ ...b, neutral: true }));
  if (person.sichtbereich === "bereich" || person.sichtbereich === "pool")
    return [{ regel: "pruefungNichtMoeglich", hart: true, neutral: true,
      text: "Für diese Person fehlen die Einsatzregeln; sie gilt nicht als frei planbar." }];
  return schutzBefunde(person, dienstart, datum, einst);
}
