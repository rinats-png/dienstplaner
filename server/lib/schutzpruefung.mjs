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
export const addDays = (s, n) => { const d = pISO(s); d.setDate(d.getDate() + n); return iso(d); };
/** Montag ist 0 — im deutschen Arbeitsrecht beginnt die Woche dort. */
export const dow = (s) => (pISO(s).getDay() + 6) % 7;

export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

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

/** Alter in Jahren am Stichtag. Ohne Geburtsdatum: null. */
export function alterAm(geburtstag, datum) {
  if (!geburtstag || !/^\d{4}-\d{2}-\d{2}$/.test(String(geburtstag))) return null;
  /* Einen Tag, den es nicht gibt (30.02.), rechnet Date auf den 02.03. weiter —
     das wäre ein falsches Alter statt keines. */
  if (iso(pISO(geburtstag)) !== String(geburtstag)) return null;
  const g = pISO(geburtstag), d = pISO(datum);
  let jahre = d.getFullYear() - g.getFullYear();
  const vorGeburtstag = d.getMonth() < g.getMonth()
    || (d.getMonth() === g.getMonth() && d.getDate() < g.getDate());
  if (vorGeburtstag) jahre--;
  return jahre;
}

/**
 * Prüft einen geplanten Dienst gegen die Schutzvorschriften.
 *
 * @returns Liste von Befunden: { regel, text, hart }
 *   hart = die Zuweisung ist unzulässig, nicht nur bedenklich.
 */
export function schutzBefunde(person, dienstart, datum) {
  const aus = [];
  const alter = alterAm(person.geburtstag || person.geburtsdatum, datum);

  /* --- Jugendarbeitsschutzgesetz --- */
  /* Fehlt das Geburtsdatum (oder ist es ungültig), lässt sich nicht sagen, ob
     das Gesetz gilt. Das ist „nicht bewertbar" — kein Verstoß, aber auch nicht
     stillschweigend zulässig. Gemeldet wird nur, wo es darauf ankäme: bei einem
     Dienst, den eine minderjährige Person nicht leisten dürfte. */
  if (alter === null && (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60 || dauer(dienstart) > 8.5))
    aus.push({ regel: "JArbSchG (Geburtsdatum)", hart: false, offen: true,
      text: "Das Geburtsdatum fehlt oder ist ungültig. Ob das Jugendarbeitsschutzgesetz gilt, lässt sich nicht prüfen — "
        + "für Jugendliche wäre dieser Dienst nicht zulässig (Nacht, vor 6 Uhr oder über acht Stunden)." });
  if (alter !== null && alter < 18) {
    if (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60)
      aus.push({ regel: "JArbSchG § 14", hart: true,
        text: "Jugendliche dürfen nicht zwischen 20 und 6 Uhr beschäftigt werden." });
    if (dauer(dienstart) > 8.5)
      aus.push({ regel: "JArbSchG § 8", hart: true,
        text: "Für Jugendliche gelten höchstens acht Stunden täglich." });
    if (dow(datum) >= 5)
      aus.push({ regel: "JArbSchG §§ 16–17", hart: false,
        text: "Samstags- und Sonntagsarbeit Jugendlicher ist nur in Ausnahmen zulässig — in der Pflege erlaubt, mit Ersatzruhetag." });
  }

  /* --- Mutterschutzgesetz --- */
  if (person.mutterschutz) {
    if (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60)
      aus.push({ regel: "MuSchG § 5", hart: true,
        text: "Nachtarbeit zwischen 20 und 6 Uhr nur mit Einwilligung und behördlicher Genehmigung." });
    if (dow(datum) === 6)
      aus.push({ regel: "MuSchG § 6", hart: true,
        text: "Sonntagsarbeit nur mit ausdrücklicher Einwilligung." });
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
 * @returns {{regel: string, text: string, offen: boolean, neutral: boolean, hart: boolean, sperrt: boolean, stufe: string, schwere: string}[]}
 */
export function schutzEinsatz(person, dienstart, datum) {
  return /** @type {any[]} */ (schutzBefundeFuer(person, dienstart, datum)).map((b) => ({
    regel: b.regel, text: b.text, offen: !!b.offen, neutral: !!b.neutral, hart: !!b.hart,
    /* offen = nicht bewertbar: ein Hinweis, nichts zu bestätigen, nichts zu sperren */
    sperrt: !!b.hart && !b.offen,
    stufe: b.offen ? "hinweis" : b.hart ? "recht" : "achtung", schwere: b.hart ? "danger" : "warn",
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
  hoechstens8hTag: "Dienst überschreitet die zulässige Tagesdauer.",
  wochenendePruefen: "Wochenendeinsatz prüfen.",
  sonntagNurMitFreigabe: "Sonntagseinsatz nur mit Freigabe der Planung.",
  ueber8hNurAbsprache: "Dienst über 8 Stunden nur nach Absprache.",
  stundengrenzeWoche: "Wochenstundengrenze überschritten.",
  unbekannt: "Einsatzregel nicht auswertbar — Planungsprüfung erforderlich.",
  alterNichtBewertbar: "Alter nicht hinterlegt — ob dieser Einsatz zulässig ist (Nacht, vor 6 Uhr, über acht Stunden), lässt sich nicht prüfen.",
};

/**
 * Die abgeleiteten Einsatzregeln einer Person auf einen geplanten Dienst
 * anwenden. Gegenstück zu schutzBefunde für die Sicht ohne Rohdaten.
 * Die Wochenstundengrenze gilt für eine Woche, nicht für einen Dienst; sie
 * liest stundengrenzeAusRegeln.
 * @returns Liste von Befunden: { regel, text, hart }
 */
export function regelBefunde(planungsregeln, dienstart, datum) {
  const aus = [];
  for (const r of Array.isArray(planungsregeln) ? planungsregeln : []) {
    if (!r || typeof r !== "object") continue;
    if (r.von && datum < r.von) continue;
    if (r.bis && datum > r.bis) continue;
    const treffer = (bed) => { if (bed) aus.push({ regel: r.regel, hart: r.hart === true, text: EINSATZREGEL_TEXTE[r.regel] }); };
    switch (r.regel) {
      case "nachtNichtZulaessig": treffer(istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60); break;
      case "hoechstens8hTag": treffer(dauer(dienstart) > 8.5); break;
      case "wochenendePruefen": treffer(dow(datum) >= 5); break;
      case "sonntagNurMitFreigabe": treffer(dow(datum) === 6); break;
      case "ueber8hNurAbsprache": treffer(dauer(dienstart) > 8); break;
      case "stundengrenzeWoche": break;
      /* Geburtsdatum fehlt (planungsregeln.mjs): nicht bewertbar — ein
         Hinweis bei den Diensten, die für Jugendliche unzulässig wären,
         wie schutzBefunde mit Rohdaten (WP-11). */
      case "alterNichtBewertbar":
        if (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60 || dauer(dienstart) > 8.5)
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
export function schutzBefundeFuer(person, dienstart, datum) {
  if (Array.isArray(person.planungsregeln))
    return regelBefunde(person.planungsregeln, dienstart, datum).map((b) => ({ ...b, neutral: true }));
  if (person.sichtbereich === "bereich" || person.sichtbereich === "pool")
    return [{ regel: "pruefungNichtMoeglich", hart: true, neutral: true,
      text: "Für diese Person fehlen die Einsatzregeln; sie gilt nicht als frei planbar." }];
  return schutzBefunde(person, dienstart, datum);
}
