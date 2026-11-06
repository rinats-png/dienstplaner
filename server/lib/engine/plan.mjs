/* ==========================================================================
   RECHENKERN — PLANRECHNUNG (WP-I12)

   Die Planrechnung je Mandant (Besetzung, Personentag, Soll/Ist, Stundenkonto), aus src/lib/fachlogik.js
   unverändert herausgelöst (WP-39 → WP-I12). Rein: kein React, kein DOM, kein Netz, kein Dateizugriff;
   die Eingabe (ein Mandant) wird nie verändert (nur der Zwischenspeicher je Bestand in einer WeakMap).
   Das Tagesdatum kommt aus ./zeit.mjs (heute) und ist für Gegenrechnungen festlegbar.
   ========================================================================== */
import { ABW_WEITERE, entgeltStatus } from "./abwesenheitsarten.mjs";
import { imDienst, einheitAm, einheitDienst, teilzeitDienst, nachtschwelle, nachweisStand as fpNachweisStand, qualGueltig as fpQualGueltig } from "../fachpruefung.mjs";
import { postenBesatzung as postenBesatzungRechnen, mindestFuer, eingefrorenerMonat, abschlussLuecke, freezeStatus, sollMonat, nachtAnteilAm, eingefrorenerTag, eingefrorenerDienst } from "../isteinfrieren.mjs";
import { istEntwurfstag } from "../planfreigabe.mjs";
import { dim_, pad, addDays, istNachtdienst } from "../regelwerk.mjs";
import { istVerfuegbar, zeitraumMonat, IST_NICHT_VERFUEGBAR, zeitraumBisMonat, istZeitFuer, ungeplanterDienst } from "../istdaten.mjs";
import { gewertet } from "../lohnrechnung.mjs";
import { heute } from "./zeit.mjs";

export const ABW = [
  { id: "urlaub", label: "Urlaub", kurz: "U", farbe: "#2E6B4F", urlaub: true, bezahlt: true, rang: 3 },
  { id: "krank", label: "Krank", kurz: "K", farbe: "#B3261E", urlaub: false, bezahlt: true, rang: 5 },
  { id: "schulung", label: "Schulung", kurz: "S", farbe: "#35506B", urlaub: false, bezahlt: true, rang: 4 },
  { id: "frei", label: "Freistellung", kurz: "F", farbe: "#878C93", urlaub: false, bezahlt: false, rang: 1 },
  { id: "sonst", label: "Sonstiges", kurz: "X", farbe: "#8A5A00", urlaub: false, bezahlt: true, rang: 2 },
  { id: "ausgleich", label: "Freizeitausgleich", kurz: "A", farbe: "#0369A1", urlaub: false, bezahlt: false, rang: 2 },
  ...ABW_WEITERE,
];
/* WP-27: Wer Abwesenheiten nur gekürzt bekommt (Betriebsrat, Beschäftigte für
   fremde Personen), sieht „abwesend" — nicht „Sonstiges". */
export const ABW_NEUTRAL = { id: "abwesend", label: "abwesend", kurz: "–", farbe: ABW[3].farbe, urlaub: false, bezahlt: true, rang: 1 };
export const abwArt = (id) => ABW.find((a) => a.id === id) || (id === "abwesend" ? ABW_NEUTRAL : ABW[4]);
/* ==========================================================================
   ENGINE — arbeitet immer auf genau einem Mandanten
   ========================================================================== */
export const _c = new WeakMap();
export function cache(m) { let c = _c.get(m); if (!c) { c = { map: new Map(), abs: null, posten: new Map() }; _c.set(m, c); } return c; }
export function memo(m, k, fn) { const c = cache(m); if (c.map.has(k)) return c.map.get(k); const v = fn(); c.map.set(k, v); return v; }
export function absIdx(m) {
  const c = cache(m); if (c.abs) return c.abs;
  const x = new Map();
  for (const a of m.abwesenheiten) { if (!x.has(a.personId)) x.set(a.personId, []); x.get(a.personId).push(a); }
  c.abs = x; return x;
}
/* einheitAm und imDienst: server/lib/fachpruefung.mjs (WP-22). */
export const aktive = (m, d) => memo(m, `akt|${d}`, () => m.personen.filter((p) => imDienst(p, d)));
export function abwesenheitAm(m, pid, d) {
  const l = absIdx(m).get(pid); if (!l) return null;
  let best = null;
  for (const a of l) if (a.von <= d && a.bis >= d && (!best || abwArt(a.art).rang > abwArt(best.art).rang)) best = a;
  return best;
}
/* versatzTageVon, zyklusLaenge und einheitDienst (Schichtfolge einer Einheit)
   stehen seit WP-22 in server/lib/fachpruefung.mjs — der Server rechnet
   damit dieselbe Folge. Ein Betrieb ohne zyklus.tage liefert dort null. */
/* mindestFuer (C5: ein Feiertag hebt die Vorgabe an, senkt sie nie) und die Postenbesetzung stehen seit
   WP-16 (Review H1) in server/lib/isteinfrieren.mjs: Der Server friert beim Monatsabschluss das Ist mit
   derselben Planrechnung ein. Hier nur der Zwischenspeicher je Bestand. */
export const postenBesatzung = (m, eid, d, pid) => postenBesatzungRechnen(m, eid, d, pid, cache(m).posten);
export function personTag(m, p, d) {
  if (!imDienst(p, d)) return { dienstId: null, plan: null, abweichung: null, abwesenheit: null, quelle: "extern" };
  /* Entwurf (WP-23): Der Server lässt die Einteilungen nicht freigegebener Monate nach heute für
     Beschäftigte weg und sagt es in sichtEntwuerfe. Ohne diesen Zweig rechnete die Oberfläche für
     solche Tage die Schichtfolge und zeigte einen Regeldienst, den die Planung vielleicht längst
     geändert hat — falscher als gar nichts. */
  if (m.sichtEntwuerfe && istEntwurfstag(m, d, m.sichtEntwuerfe.heute))
    return { dienstId: null, plan: null, abweichung: null, abwesenheit: abwesenheitAm(m, p.id, d), quelle: "entwurf" };
  const eid = einheitAm(p, d);
  // Geschäftszimmer: Planung und Leitung fahren keine Rotation mit.
  // Sie erscheinen im Plan nur durch ausdrückliche Zuweisung.
  const roh = (eid && !p.springer && p.imSchichtdienst !== false) ? einheitDienst(m, eid, d) : null;
  const plan = teilzeitDienst(m, p, d, roh);
  const ab = m.abweichungen[`${p.id}|${d}`];
  let basis = ab !== undefined ? (ab === "-" ? null : ab) : plan;
  if (ab === undefined && plan) {
    const po = m.dienstarten.find((x) => x.posten && x.quelle === plan);
    if (po && postenBesatzung(m, eid, d, po.id).has(p.id)) basis = po.id;
  }
  const abw = abwesenheitAm(m, p.id, d);
  return { dienstId: abw ? null : basis, plan, abweichung: ab !== undefined ? ab : null, abwesenheit: abw,
    quelle: ab !== undefined ? "abweichung" : "plan" };
}
export function besetzung(m, d) {
  return memo(m, `bes|${d}`, () => {
    const out = {};
    for (const da of m.dienstarten) out[da.id] = { da, personen: [], soll: mindestFuer(m, da, d) };
    for (const p of aktive(m, d)) { const t = personTag(m, p, d); if (t.dienstId && out[t.dienstId]) out[t.dienstId].personen.push(p); }
    for (const k of Object.keys(out)) {
      const e = out[k];
      e.anzahl = e.personen.length; e.diff = e.anzahl - e.soll;
      e.qual = Object.entries(e.da.mindestQual || {}).filter(([, n]) => n > 0).map(([qid, n]) => {
        const ist = e.personen.filter((p) => qualGueltig(m, p, qid)).length;
        return { qid, noetig: n, ist, ok: ist >= n };
      });
      e.qualFehlt = e.qual.some((q) => !q.ok);
      e.status = e.diff < -1 ? "danger" : e.diff < 0 || e.qualFehlt ? "warn" : "ok";
    }
    return out;
  });
}
export function sollStunden(m, p, ym) {
  return memo(m, `soll|${p.id}|${ym}`, () => {
    /* Abgeschlossener Monat (WP-16, Nachtrag M-neu-2): das Soll zum Abschluss — spätere Änderungen an
       Wochenstunden, Eintritt/Austritt, Standort oder Bundesland ändern es nicht. */
    const fm = eingefrorenerMonat(m, p, ym);
    if (fm && Number.isFinite(fm.s) && !abschlussLuecke(m, p, ym)) return fm.s;
    /* Schema ≥ 2 (WP-16, Nachtrag dritter Review M-1/N-e): ohne brauchbaren Monatseintrag kein live gerechnetes
       Soll — „nicht verfügbar" (null), auch für Rollen, die den Eintrag nicht sehen (Betriebsrat, Schicht-
       verantwortung ohne den ganzen Monat im Bereich). Nur wer im Monat gar nicht im Dienst war, hat Soll 0. */
    const st = freezeStatus(m, ym);
    if (st && (st.unbekannt || st.schema >= 2) && !(fm && !Number.isFinite(fm.s) && !abschlussLuecke(m, p, ym))) {
      const [y, mo] = ym.split("-").map(Number);
      let im = false;
      for (let i = 1; i <= dim_(y, mo - 1) && !im; i++) im = imDienst(p, `${ym}-${pad(i)}`);
      return im ? null : 0;
    }
    return sollMonat(m, p, ym);
  });
}
export function istStunden(m, p, ym) {
  /* Ohne Zugang zu den Ist-Daten (Rollenschutz, src/istdaten.js) gibt es keine
     Ist-Stunden — auch nicht aus dem Plan. */
  if (!istVerfuegbar(m, p, zeitraumMonat(ym))) return IST_NICHT_VERFUEGBAR;
  /* Abgeschlossener Monat ohne Freeze dieser Person (WP-16, Nachtrag N3): nicht 0 h, sondern Prüffall. */
  if (abschlussLuecke(m, p, ym)) return { ...IST_NICHT_VERFUEGBAR, abschlussLuecke: true };
  return memo(m, `ist|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
    let g = 0, gg = 0, nacht = 0, dienste = 0, naechte = 0, erfasst = 0, ungeklaert = 0, pruefFaelle = 0, ungeplantTage = 0;
    for (let i = 1; i <= n; i++) {
      /* istTag: im abgeschlossenen Monat nur das eingefrorene Ist (WP-16, Review H1). */
      const d = `${ym}-${pad(i)}`; const t = istTag(m, p, d);
      if (t.abwesenheit) {
        /* Ungeklärt ist nicht unbezahlt: nichts gutschreiben, aber zählen, damit
           die Prüfansicht sagen kann, dass das Konto dort unvollständig ist. */
        const es = entgeltStatus(abwArt(t.abwesenheit.art));
        if (es === "bezahlt" && t.plan) gg += t.wochenstunden / 5;
        else if (es === "ungeklaert" && t.plan) ungeklaert++;
        continue;
      }
      /* Ohne geplanten Dienst zählt nur ein gestempelter und von der Leitung
         bestätigter ungeplanter Dienst (WP-13) — mit seiner Ist-Dauer. */
      const da = t.da;
      if (!da) continue;
      if (da.ungeplant) ungeplantTage++;
      const idn = t.idn;
      g += gewertet(da, idn.std); if (idn.erfasst) erfasst++;
      /* Ist-Zeit zur Prüfung (WP-17, W1): vorläufig die Planzeit — gezählt,
         damit Konto und Lohnausgabe es sagen können, statt still zu rechnen. */
      if (idn.zurPruefung) pruefFaelle++;
      const na = nachtAnteilAm(d, da, m.einstellungen); nacht += na; dienste++;
      if (na >= nachtschwelle(m.einstellungen)) naechte++;
    }
    /* Abgeschlossener Monat: Nachtstunden und Nachtdienste wie zum Abschluss (Nachtfenster von damals, M-neu-2). */
    const fm = eingefrorenerMonat(m, p, ym);
    if (fm && Array.isArray(fm.z)) { nacht = Number(fm.z[0]) || 0; naechte = Number(fm.nn) || 0; }
    /* Schema 3 (WP-16, Nachtrag dritter Review N-d): die Summen wie zum Abschluss gerechnet — eine spätere Änderung an
       Anrechnungsfaktor oder Entgeltstatus (Code-Konstanten) ändert den abgeschlossenen Monat nicht. */
    if (fm && Number.isFinite(fm.g) && Number.isFinite(fm.gg) && Number.isFinite(fm.ig))
      return { geleistet: fm.g, gutgeschrieben: fm.gg, gesamt: fm.ig, nacht: Math.round(nacht * 100) / 100, dienste, naechte, erfasst, ungeklaert,
        zurPruefung: pruefFaelle, ungeplant: ungeplantTage };
    return { geleistet: Math.round(g * 100) / 100, gutgeschrieben: Math.round(gg * 100) / 100,
      gesamt: Math.round((g + gg) * 100) / 100, nacht: Math.round(nacht * 100) / 100, dienste, naechte, erfasst, ungeklaert, zurPruefung: pruefFaelle, ungeplant: ungeplantTage };
  });
}
/* --------------------------------------------------------------------------
   § 2 Abs. 5 ArbZG — WER NACHTARBEITNEHMER IST

   Nicht jeder, der einmal nachts arbeitet. Nachtarbeitnehmer ist, wer
   Nachtarbeit in Wechselschicht leistet oder sonst an mindestens 48 Tagen
   im Kalenderjahr. Gezählt wird deshalb über das ganze Jahr, nicht über den
   angesehenen Monat — und zwar mit istNachtdienst aus dem Regelwerk, das
   die Nachtzeit von 23 bis 6 Uhr und die Zwei-Stunden-Grenze des § 2 Abs. 4
   kennt. Die betriebliche Nachtschwelle aus den Einstellungen ist etwas
   anderes und gilt hier ausdrücklich nicht.
   -------------------------------------------------------------------------- */
export function nachtTageImJahr(m, p, jahr) {
  return memo(m, `nt|${p.id}|${jahr}`, () => {
    let n = 0;
    for (let d = `${jahr}-01-01`; d <= `${jahr}-12-31`; d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (t.abwesenheit || !t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      if (da && da.form !== "ruf" && istNachtdienst(da)) n++;
    }
    return n;
  });
}
export function stundenkonto(m, p, ym) {
  if (!istVerfuegbar(m, p, zeitraumBisMonat(ym))) return null;
  return memo(m, `kto|${p.id}|${ym}`, () => {
    /* Abgeschlossener Monat (WP-16, Nachtrag dritter Review H-1): das Konto zum Monatsende, wie der Abschluss es
       rechnete — mit dem Übertrag und den Vormonaten von damals. Ein später geänderter Übertrag oder ein geänderter
       offener Vormonat ändert es nicht (Lohnart Mehrarbeit). Unbrauchbarer Freeze: nicht verfügbar. */
    const st = freezeStatus(m, ym);
    if (st) {
      if (st.unbekannt || abschlussLuecke(m, p, ym)) return null;
      const fm = eingefrorenerMonat(m, p, ym);
      if (st.reproduzierbar && fm) return Number.isFinite(fm.k) ? fm.k : null;
    }
    const j = Number(ym.slice(0, 4)), bis = Number(ym.slice(5, 7)); let d = p.stundenuebertrag || 0;
    for (let x = 1; x <= bis; x++) {
      const k = `${j}-${pad(x)}`; const ist = istStunden(m, p, k).gesamt;
      /* Ein abgeschlossener Monat ohne Freeze (N3): Konto unbekannt, nicht geschätzt. */
      if (ist === null || ist === undefined) return null;
      const soll = sollStunden(m, p, k);
      if (soll === null || soll === undefined) return null;
      d += ist - soll;
    }
    return Math.round(d * 10) / 10;
  });
}
/* ------------------------------ Ist-Erfassung ---------------------------- */
/** Tatsächliche Dauer eines Dienstes: erfasste Zeit schlägt die geplante. */
/* Diese Stelle ist der Engpass für alle geleisteten Stunden — Stundenkonto,
   Lohnausgabe, Ausgleichszeitraum, Belastung hängen daran. Die Rechnung steht
   in src/istdaten.js, mit dem Rollenschutz: Ohne Zugang zu den Ist-Daten
   ist std null, nie die Planzeit. */
export const istDauer = (m, p, d, da) => istZeitFuer(m, p, d, da);
/* Der bestätigte ungeplante Dienst eines Tages (WP-13), sonst null — nur wo
   die Person im Dienst und nichts geplant oder abwesend ist. Der Aufrufer hat
   den Plan schon befragt (personTag.dienstId leer). */
export const ungeplantAm = (m, p, d) => (imDienst(p, d) && !abwesenheitAm(m, p.id, d) ? ungeplanterDienst(m, p, d) : null);
/**
 * Der Tag einer Person, wie er ins Ist eingeht — die eine Stelle für Stundenkonto, Lohnausgabe/DATEV,
 * Zuschläge, Ausgleichszeitraum und Prüfungsansicht:
 *   abwesenheit  die Abwesenheit des Tages (nur `art`) oder null
 *   plan         ob nach Schichtfolge ein Dienst geplant war (Gutschrift bezahlter Abwesenheit)
 *   da           die Dienstart, die zählt (auch ein bestätigter ungeplanter Dienst), sonst null
 *   idn          istZeitFuer für diesen Dienst, sonst null
 *   wochenstunden  für die Gutschrift (im abgeschlossenen Monat die zum Abschluss)
 * Abgeschlossener Monat (WP-16, Review H1): NUR das eingefrorene Ist (server/lib/isteinfrieren.mjs) —
 * eine spätere Änderung an Plan, Dienstart oder Abwesenheit ändert es nicht. Nicht zugängliche Ist-Daten
 * (Rollenschutz): wie bisher, also „nicht verfügbar", nie die Planzeit.
 */
export function istTag(m, p, d) {
  const fz = eingefrorenerTag(m, p, d);
  if (fz !== undefined) {
    if (!fz) return { abwesenheit: null, plan: null, da: null, idn: null, wochenstunden: p.wochenstunden, eingefroren: true };
    /* Freeze fehlt (N3): kein Dienst „0 h", sondern ein Prüffall — die Monatsrechnungen geben null zurück. */
    if (fz.luecke) return { abwesenheit: null, plan: null, da: null, idn: null, wochenstunden: p.wochenstunden, eingefroren: true, luecke: true };
    if (Array.isArray(fz.a) && fz.a.length) {
      const art = fz.a.reduce((best, x) => (best === null || abwArt(x).rang > abwArt(best).rang ? x : best), null);
      return { abwesenheit: { art }, plan: fz.pl ? true : null, da: null, idn: null,
        wochenstunden: Number.isFinite(Number(fz.w)) ? Number(fz.w) : p.wochenstunden, eingefroren: true };
    }
    const da = eingefrorenerDienst(fz);
    return { abwesenheit: null, plan: null, da, eingefroren: true, wochenstunden: p.wochenstunden,
      idn: da ? { std: Number(fz.std), erfasst: fz.e === 1, abweichung: 0, ...(fz.p === 1 ? { zurPruefung: true } : {}) } : null };
  }
  const t = personTag(m, p, d);
  const da = t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : ungeplantAm(m, p, d);
  return { abwesenheit: t.abwesenheit, plan: t.plan, da: da || null, idn: da ? istDauer(m, p, d, da) : null, wochenstunden: p.wochenstunden };
}
/* --------------------------- Nachweise und Ablauf ------------------------ */
/* Gültigkeitsstand eines Nachweises: server/lib/fachpruefung.mjs (WP-22),
   dort mit dem Tag als Argument — hier immer heute. */
export const nachweisStand = (m, p, qualId) => fpNachweisStand(m, p, qualId, heute());
/* sperreWirkt: server/lib/fachpruefung.mjs (WP-22). Seit E-21 warnen eigene
   Vorgaben in jeder Stufe; die Verbindlichkeit bestimmt nur die Warnstufe. */
export const qualGueltig = (m, p, qualId) => fpQualGueltig(m, p, qualId, heute());
