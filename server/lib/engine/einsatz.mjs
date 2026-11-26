/* ==========================================================================
   RECHENKERN — EINSATZPRÜFUNG UND ERSATZSUCHE (WP-I12a)

   hindernisBefunde (darf diese Person an diesem Tag diesen Dienst leisten?),
   ersatzVorschlaege (Ersatzsuche für einen unterbesetzten Dienst, sortiert
   nach Eignung) und ihre Schließung: nachtJahr, wochenStundenGeplant, die
   Verfügbarkeitsfenster. Aus src/lib/fachlogik.js unverändert herausgelöst
   (Text der Funktionen gleich); die Fachlogik des Clients reicht sie weiter:
   eine Implementierung. Auf dem Server erreichbar, weil das Docker-Bild src/
   nicht enthält.

   Einziger Haken: die Regelkennung im Regelregister (regelIdFuerBefund,
   src/regelregister.js, nur im Client; WP-I12 Frage 6). Der Client setzt ihn
   beim Laden von fachlogik.js; ohne Haken (Server) gilt null.
   ========================================================================== */
import { addDays, montag, toMin, dow, dauer, pad, stundengrenzeHinweis } from "../regelwerk.mjs";
import { einteilungsBefunde, einheitAm, einheitDienst, imDienst, nachtAnteil, nachtschwelle, schichtmodellWirkungAktiv,
  schichtmodellLageAm, schichtfolgeAm } from "../fachpruefung.mjs";
import { istVerfuegbar, zeitraumJahr } from "../istdaten.mjs";
import { vorgabenBefunde, neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { sperrtBefund as sperrtArt } from "../bestaetigungen.mjs";
import { memo, besetzung, personTag, abwesenheitAm, abwArt, stundenkonto, istStunden, nachweisStand, qualGueltig } from "./plan.mjs";
import { heute } from "./zeit.mjs";
import { n1, DOW } from "./textformat.mjs";

/* Rang der Warnstufen (src/warnstufen.js hält dieselbe Tabelle mit Beschriftung; Test: gleicher Rang). */
const STUFEN_RANG = { hinweis: 1, achtung: 2, recht: 3 };
export const stufeRang = (s) => (Object.prototype.hasOwnProperty.call(STUFEN_RANG, s) ? STUFEN_RANG[s] : STUFEN_RANG.hinweis);

/* Haken: Regelkennung im Regelregister. Ohne Haken keine Kennung (null). */
/* Typangabe nur für die Typprüfung (seit RB-5 liegt diese Datei im geprüften Graphen). */
/** @type {(b: any) => any} */
let regelIdHaken = () => null;
export const regelIdHakenSetzen = (f) => { regelIdHaken = typeof f === "function" ? f : () => null; };
const regelIdFuerBefund = (b) => regelIdHaken(b);

/* Quellenangaben für Schutzbefunde ohne Fundstelle: Den Grund einer
   Einsatzregel oder Einschränkung nennt CENTRIC nie. */
export const SCHUTZ_QUELLE_NEUTRAL = "Schutzvorschrift oder Einsatzregel für diese Person";
export const SCHUTZ_QUELLE_EINSCHRAENKUNG = "Schutzvorschrift oder Einsatzeinschränkung für diese Person";

export const einschr = (p) => p.einschraenkungen || {};

export function nachtJahr(m, p, jahr) {
  if (!istVerfuegbar(m, p, zeitraumJahr(jahr))) return { stunden: null, anzahl: null, nichtVerfuegbar: true };
  return memo(m, `nacht|${p.id}|${jahr}`, () => {
    let h = 0, n = 0;
    for (let x = 1; x <= 12; x++) {
      const r = istStunden(m, p, `${jahr}-${pad(x)}`);
      if (r.abschlussLuecke) return { stunden: null, anzahl: null, nichtVerfuegbar: true, abschlussLuecke: true };
      h += r.nacht; n += r.naechte;
    }
    return { stunden: Math.round(h * 10) / 10, anzahl: n };
  });
}

/** Drei Zeitfenster je Tag. Ein Dienst fällt in das Fenster, in dem er beginnt. */
export const FENSTER = [
  { id: 0, name: "Vormittag", von: 0, bis: 719 },
  { id: 1, name: "Nachmittag", von: 720, bis: 1079 },
  { id: 2, name: "Nacht", von: 1080, bis: 1439 },
];
export const fensterVon = (da) => {
  const s = toMin(da.start);
  return s < 720 ? 0 : s < 1080 ? 1 : 2;
};
/**
 * Kann die Person an diesem Tag diesen Dienst leisten?
 * Ohne gepflegte Verfügbarkeit gilt: immer verfügbar.
 */
export function verfuegbarFuer(p, datum, da) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return true;
  const idx = dow(datum) * 3 + fensterVon(da);
  return v.raster[idx] !== false;
}

/** Die in der Kalenderwoche von d schon geplanten Stunden einer Person. */
export function wochenStundenGeplant(m, p, d) {
  const mo = montag(d);
  let std = 0;
  for (let i = 0; i < 7; i++) {
    const t = personTag(m, p, addDays(mo, i));
    if (!t.dienstId) continue;
    const x = m.dienstarten.find((y) => y.id === t.dienstId);
    if (x) std += dauer(x);
  }
  return std;
}

/**
 * Prüft, ob eine Person an einem Tag einen bestimmten Dienst leisten kann,
 * und liefert die Befunde mit Stufe, Quelle und Text — leer bedeutet
 * regelkonform. Die Befunde gehen in den Warndialog. Ob ein Befund sperrt
 * (kein „dennoch", Bewerbung, Selbstplanung, Zuschlag, Übernahme blockiert)
 * oder warnt, steht an genau einer Stelle: SPERR_REGELN in src/warnstufen.js
 * (Review WP-10, H1 — bis zur Fachentscheidung die strenge Kette-B-Variante).
 * `regel` ist der Schlüssel dort.
 * `opt.vorgabenBudget`: das Rechenbudget des äußeren Einstiegs für interne Vorgaben (WP-I5); ohne eines hat dieser Aufruf sein eigenes.
 * `opt.vorgabenAutomatisch`: die Einteilung geschieht ohne Mensch (Planungsassistent): ungeprüfte Muss-Vorgaben gelten dann als Achtung.
 */
export function hindernisBefunde(m, p, d, da, opt) {
  const g = [];
  /* regel: Schlüssel im Befundkatalog (sperrt oder warnt, BEFUND_KATALOG);
     regelId: Kennung im Regelregister (Fundstelle, Quellenstand) — beides
     Kennungen, kein Text. */
  const push = (stufe, text, quelle, art, regel, regelId) => g.push({ stufe, text, quelle, art: art || "regel",
    regel: regel || art || "regel", sperrt: sperrtArt(regel || art || "regel"),
    regelId: regelId === undefined ? regelIdFuerBefund({ art: art || "regel", quelle }) : regelId });
  /* Die Fachprüfung der Einteilung (WP-22): einteilungsBefunde in
     server/lib/fachpruefung.mjs — dieselbe, mit der der Server prüft (keine
     zweite Prüflogik). Darin die eine Schutzprüfung schutzEinsatz (mit den
     Einstellungen des Betriebs), Einschränkungen an der Person, verbindliche
     Qualifikationen, Einweisungen, Ruhezeit, Höchstzahl je Woche,
     Alleindienst und die Tagesgrenze. Den Plan liefert hier personTag
     (Posten, Springer, Teilzeit), die Besetzung besetzung(). Den Grund einer
     neutralen Einsatzregel oder Einschränkung nennt kein Befund. */
  const fach = einteilungsBefunde(m, p, da, d, {
    dienstAm: (x, t) => personTag(m, x, t).dienstId || null,
    alleinOhnePartner: (x, t, daId) => {
      const b = besetzung(m, t)[daId];
      return !(b ? b.personen : []).some((y) => y.id !== x.id && !einschr(y).keinAlleindienst);
    },
    heute: heute(),
    /* Branchenmodule (WP-19): die Besetzung des Dienstes so, wie sie mit dieser
       Einteilung wäre. Befunde nur aus aktiven Modulen, höchstens Hinweis. */
    branchen: { personenImDienst: (t, daId) => {
      const l = ((besetzung(m, t) || {})[daId] || { personen: [] }).personen;
      return l.some((y) => y.id === p.id) ? l : [...l, p];
    } },
  });
  const fachPush = (b) => {
    const regelId = b.art === "schutz" ? (b.neutral || b.quelle === SCHUTZ_QUELLE_EINSCHRAENKUNG ? null
      : regelIdFuerBefund({ art: "schutz", quelle: b.quelle })) : undefined;
    push(b.stufe, b.text, b.quelle, b.art, b.regel, regelId);
  };
  const vorQualifikation = ["bestand", "schutz", "schutzWeich", "schutzOffen", "schutzHinweis", "keineNacht"];
  const bis = (liste) => fach.filter((b) => liste.includes(b.regel));
  for (const b of bis(["bestand"])) fachPush(b);
  /* Eine Abwesenheit ist ein Datenkonflikt, keine Planungsregel: Der Dialog
     bietet an, sie für diesen Tag aufzuheben. */
  const abw = abwesenheitAm(m, p.id, d);
  if (abw) push("achtung", `abwesend (${abwArt(abw.art).label})`, "Abwesenheit", "abwesend", "abwesend");
  for (const b of bis(vorQualifikation.slice(1))) fachPush(b);
  if (!verfuegbarFuer(p, d, da))
    push("achtung", `nicht verfügbar (${FENSTER[fensterVon(da)].name} ${DOW[dow(d)]})`, "Verfügbarkeit der Person", "regel", "verfuegbarkeit");
  for (const b of bis(["qualifikationGesetzlich", "qualifikationBetrieblich", "kompetenz"])) fachPush(b);
  const tz = p.teilzeit;
  if (tz && tz.aktiv && tz.modus === "wochentage" && !(tz.wochentage || []).includes(dow(d)))
    push("achtung", "arbeitet an diesem Wochentag nicht", "Teilzeitvereinbarung", "regel", "teilzeit");
  for (const b of bis(["ruhezeitGesetz", "ruhezeitBetrieb", "maxDiensteWoche", "keinAlleindienst", "tagesgrenze"])) fachPush(b);
  /* Branchenmodule (WP-19): Hinweise mit eigener Regelkennung aus dem Register. */
  for (const b of bis(["branche"])) push(b.stufe, b.text, b.quelle, b.art, b.regel, /** @type {any} */ (b).regelId || null);
  /* Interne Vorgaben des Betriebs (WP-I5): Muss = Achtung mit Bestätigung, Soll = Hinweis, sperrt nie; Budget je Anfrage. */
  for (const b of vorgabenBefunde(m, p, d, da, { dienstAm: (x, t) => personTag(m, x, t).dienstId || null, einheitAm, abwesendAm: (x, t) => { const ab = abwesenheitAm(m, x.id, t); return ab ? ab.art : null; }, budget: opt && opt.vorgabenBudget, automatisch: !!(opt && opt.vorgabenAutomatisch) }))
    push(b.stufe, b.text, b.quelle, b.art, b.regel, b.regelId);
  // Dienste in Folge (Einstellung des Betriebs; nur die Oberfläche)
  let lauf = 0;
  for (let i = 1; i <= m.einstellungen.maxFolge + 1; i++) {
    if (personTag(m, p, addDays(d, -i)).dienstId) lauf++; else break;
  }
  if (lauf >= m.einstellungen.maxFolge)
    push("achtung", `${lauf} Dienste in Folge davor`, `höchstens ${m.einstellungen.maxFolge} Dienste in Folge (Einstellung des Betriebs)`,
      "regel", "folge");
  return g;
}

/**
 * Bestandspersonen eines Tags gegen den Bestand, frisch gerechnet: Jede Person OHNE eigene Einteilung an diesem Tag muss dort denselben
 * Dienst haben wie im Bestand (Review #572 A1, Posten: eine Einteilung kann eine andere Person aus der Postenbesetzung verdrängen oder
 * hineinziehen; dann hätte sie einen Dienst, den niemand geprüft hat). Gibt die Zahl der veränderten Personen zurück. Arbeit: P Tagesabfragen
 * je Stand (der Bestand liegt im Zwischenspeicher). Ohne Posten ändert eine Einteilung keine andere Person (personTag hängt nur über die
 * Postenbesetzung von anderen ab). Aus planer.mjs hierher (gemeinsam mit planeMonat, Review #577); `liste` (wahlweise) sammelt die
 * veränderten Personen mit ihrem Dienst vorher und nachher.
 * @param {any} bestand Bestand als Stand (Abweichungen des Bestands) @param {any} stand @param {string} d @param {{ has: (k: string) => boolean }} eigene Schlüssel personId|tag
 * @param {{ person: any, vorher: any, nachher: any }[]} [liste]
 */
export function verdraengt(bestand, stand, d, eigene, liste) {
  let n = 0;
  for (const x of bestand.personen) {
    if (eigene.has(`${x.id}|${d}`)) continue;
    const nachher = personTag(stand, x, d).dienstId || null, vorher = personTag(bestand, x, d).dienstId || null;
    if (nachher !== vorher) { n++; if (liste) liste.push({ person: x, vorher, nachher }); }
  }
  return n;
}

/**
 * Ersatzsuche für einen unterbesetzten Dienst.
 * Sortiert nach Eignung: Qualifikation, Stundenkonto im Minus, Belastungsausgleich.
 */
export function ersatzVorschlaege(m, d, dienstId, ctx, opt) {
  /* WP-I5: ein Budget je äußerem Einstieg — wer eines übergibt (opt oder ctx), bekommt kein neues; sonst eines für alle Personen dieser Suche. */
  const vorgabenBudget = (opt && opt.vorgabenBudget) || (ctx && ctx.vorgabenBudget) || neuesVorgabenBudget();
  const vorgabenAutomatisch = !!((opt && opt.vorgabenAutomatisch) || (ctx && ctx.vorgabenAutomatisch));
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return [];
  const ym = d.slice(0, 7);
  const b = besetzung(m, d)[dienstId];
  const fehlendeQuals = (b.qual || []).filter((q) => !q.ok).map((q) => q.qid);
  const jahr = Number(d.slice(0, 4));
  const einspruengeJe = {};
  for (const e of m.einspruenge || []) einspruengeJe[e.personId] = (einspruengeJe[e.personId] || 0) + 1;
  const mittel = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  // Bewertet wird der Abstand zum Median, nicht der absolute Kontostand.
  // Sonst wirkt ein systematischer Überhang auf alle gleich und die Reihung wird beliebig.
  let median, nachtMittel;
  if (ctx) { median = ctx.median; nachtMittel = ctx.nachtMittel; }
  else {
    const konten = m.personen.filter((x) => imDienst(x, d)).map((x) => stundenkonto(m, x, ym))
      .filter((k) => k !== null).sort((a, b2) => a - b2);
    median = konten.length ? konten[Math.floor(konten.length / 2)] : 0;
    const naechteJe = m.personen.filter((x) => imDienst(x, d)).map((x) => nachtJahr(m, x, jahr).anzahl)
      .filter((k) => k !== null);
    nachtMittel = naechteJe.length ? naechteJe.reduce((a, b2) => a + b2, 0) / naechteJe.length : 0;
  }

  /* Einmal prüfen (WP-11): was ab „Achtung" wiegt, hindert; Hinweise (nicht bewertbar) stehen bei den Gründen.
     Geprüft wird in stabiler Reihenfolge der Personenkennung, nicht der Eingabe: Ist das gemeinsame Budget (WP-I5) aufgebraucht,
     trifft es immer dieselben Personen. */
  const eingabe = new Map(m.personen.map((x, i) => [x, i]));   // gleichstarke Ergebnisse behalten die Reihenfolge der Eingabe
  const out = [];
  for (const p of [...m.personen].sort((a, b2) => (String(a.id) < String(b2.id) ? -1 : String(a.id) > String(b2.id) ? 1 : 0))) {
    const t = personTag(m, p, d);
    if (t.dienstId) continue;                      // hat bereits Dienst
    const bef = hindernisBefunde(m, p, d, da, { vorgabenBudget, vorgabenAutomatisch });
    const g = bef.filter((b) => stufeRang(b.stufe) >= 2).map((b) => b.text);
    const kto = ctx ? (ctx.konten.has(p.id) ? ctx.konten.get(p.id) : 0) : stundenkonto(m, p, ym);
    const eigene = ctx ? (ctx.einspruenge[p.id] || 0) : (einspruengeJe[p.id] || 0);
    const passendeQuals = fehlendeQuals.filter((q) => qualGueltig(m, p, q));
    const gruende = [];
    let punkte = 0;
    // Abgelaufene Nachweise senken die Eignung deutlich
    const abgelaufen = p.qualifikationen.filter((q) => nachweisStand(m, p, q).stand === "abgelaufen");
    if (abgelaufen.length) { punkte -= 25 * abgelaufen.length;
      gruende.push(`${abgelaufen.length} Nachweis abgelaufen`); }
    if (passendeQuals.length) { punkte += 45 * passendeQuals.length;
      gruende.push(`bringt ${passendeQuals.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(", ")}`); }
    /* Ohne Ist-Daten (Rollenschutz) gibt es kein Konto — dann keine Aussage dazu. */
    const relKto = kto === null ? null : kto - median;
    if (relKto === null) gruende.push("Stundenkonto nicht verfügbar");
    else if (relKto < -3) { punkte += Math.min(30, -relKto * 2); gruende.push(`${n1(Math.abs(relKto))} h unter dem Mittel`); }
    else if (relKto > 3) { punkte -= Math.min(28, relKto * 2); gruende.push(`${n1(relKto)} h über dem Mittel`); }
    else gruende.push("Stundenkonto im Mittel");
    if (eigene < mittel - .5) { punkte += 14; gruende.push("selten eingesprungen"); }
    else if (eigene > mittel + .5) { punkte -= 12; gruende.push(`${eigene}× eingesprungen`); }
    if (p.springer) { punkte += 28; gruende.push("Springerpool"); }
    else {
      const eid = einheitAm(p, d);
      /* IMP-6 Planwirkung (Vorgabe aus): die Folge des zugeordneten Modells; aus wörtlich wie bisher (schichtfolgeAm).
         Review #429 Hinweis 3: An Tagen ohne eindeutiges Modell (Lücke nach Q5, Überschneidung, ungültige Zuordnung)
         gilt weder „hätte regulär frei“ noch „in der Dienstphase“ — beides wäre eine Aussage über eine Folge, die es an
         diesem Tag nicht gibt. Neutral: keine Punkte, der Grund wird genannt (die Planung entscheidet). */
      const lage = schichtmodellWirkungAktiv() ? schichtmodellLageAm(m, p, d) : null;
      if (lage && (lage.art === "keine" || lage.art === "uneindeutig" || lage.art === "ungueltig"))
        gruende.push(lage.art === "keine" ? "kein Schichtmodell an diesem Tag" : "Schichtmodell unklar (Klärung)");
      else if (schichtfolgeAm(m, p, d, () => eid && einheitDienst(m, eid, d))) { punkte -= 10; gruende.push("hätte regulär frei"); }
      else { punkte += 8; gruende.push("in der Dienstphase"); }
      if (p.teilzeit && p.teilzeit.aktiv) { punkte -= 6; gruende.push("Teilzeit"); }
    }
    const nj = ctx ? (ctx.nachtAnzahl.get(p.id) || 0) : nachtJahr(m, p, jahr).anzahl;
    if (nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen) && nj > nachtMittel + 3) {
      punkte -= 8; gruende.push(`${nj} Nachtdienste im Jahr`); }
    /* Weiche Schutzregeln sind seit WP-11 „Achtung" (oben in g, wie im
       Warndialog); hier nur, was nichts zu bestätigen hat: nicht Bewertbares
       und die Wochenstundengrenze (S2a). Kein Befund steht doppelt. */
    for (const b of bef) if (b.stufe === "hinweis") gruende.push(`Hinweis: ${b.text}`);
    const grenze = stundengrenzeHinweis(p, da, d, () => wochenStundenGeplant(m, p, d));
    if (grenze) gruende.push(`Hinweis: ${grenze.text}`);
    out.push({ person: p, punkte: Math.round(punkte), gruende, hindernisse: g, moeglich: g.length === 0 });
  }
  out.sort((a, b2) => (a.moeglich !== b2.moeglich) ? (a.moeglich ? -1 : 1) : (b2.punkte - a.punkte) || (eingabe.get(a.person) - eingabe.get(b2.person)));
  return out;
}
