/* ==========================================================================
   AUFBEWAHRUNG UND LÖSCHLAUF

   Die Aufbewahrungsfristen kamen mit Migration 5 → 6 in den Bestand:
   plandatenMonate, stammdatenMonate, gruendeMonate. Seitdem standen sie
   dort und taten nichts. Ein Löschkonzept, das nur aus drei Zahlen in einem
   Datensatz besteht, ist keines — Artikel 17 Absatz 1 Buchstabe a DSGVO
   verlangt die Löschung, nicht die Absicht dazu.

   Diese Datei führt sie aus. Sie ist rein: Eingabe Betrieb, Ausgabe neuer
   Betrieb plus Bericht. Kein Zugriff auf Speicher, keine Seiteneffekte,
   damit sich die Vorschau mit demselben Code rechnen lässt, der später auch
   löscht — und damit die Prüfungen sie erreichen.

   ---------------------------------------------------------------------------
   Was gelöscht wird und was nicht

   Drei Fristen, drei sehr verschiedene Eingriffe:

   Plandaten (24 Monate). Schichtzuweisungen, erfasste Zeiten, Stempelungen
   und die Änderungshistorie. Sie verschwinden vollständig. Die Untergrenze
   ergibt sich aus § 16 Abs. 2 ArbZG: Die Aufzeichnungen über die über acht
   Stunden hinausgehende Arbeitszeit sind mindestens zwei Jahre
   aufzubewahren. Wer kürzer einstellt, verstößt gegen eine
   Aufbewahrungspflicht — deshalb warnt die Vorschau davor.

   Stammdaten (6 Monate nach Austritt). Ausgeschiedene Personen werden
   *anonymisiert*, nicht entfernt. Würde die Person verschwinden, zerfiele
   jeder vergangene Dienstplan, in dem sie steht — und genau der ist nach
   § 16 Abs. 2 ArbZG aufzubewahren. Name, Kontakt und Personalnummer gehen,
   die Kennung bleibt.

   Gründe (3 Monate). Freitexte zu Abwesenheiten sind Gesundheitsangaben
   nach Artikel 9 DSGVO und gehören am kürzesten aufbewahrt. Gelöscht wird
   nur der Text; dass jemand krank war, bleibt — sonst stimmt die
   Fehlzeitenstatistik nicht mehr.

   Nicht angefasst wird alles, was nach § 147 AO oder § 257 HGB aufzubewahren
   ist. Das betrifft in dieser Anwendung nur Rechnungen, und die liegen beim
   Betreiber, nicht im Betrieb.

   ---------------------------------------------------------------------------
   Warum die Untergrenze zwei Jahre bleibt, obwohl zwei Vorschriften greifen

   Neben § 16 Abs. 2 ArbZG verlangt § 17 Abs. 1 MiLoG für die Branchen des
   § 2a SchwarzArbG — darunter Bewachungsgewerbe, Gaststätten, Bau, Logistik
   und Fleischwirtschaft — Beginn, Ende und Dauer der täglichen Arbeitszeit
   aufzuzeichnen und diese Aufzeichnungen nach § 17 Abs. 1 Satz 2 ebenfalls
   mindestens zwei Jahre bereitzuhalten.

   Beide Fristen sind gleich lang, deshalb ändert sich an der Untergrenze
   nichts. Sie stehen hier trotzdem beide, weil sie verschiedene Betriebe
   treffen: Ein Sicherheitsdienst unterliegt § 17 MiLoG für die gesamte
   Arbeitszeit, nicht nur für die Stunden über acht. Wer die Aufbewahrung
   kürzer stellen will, muss wissen, welche der beiden ihn bindet.
   ========================================================================== */

/* Branchenmodule (WP-19.0, Nachtrag G3): Personenfelder der Module („personId|Tag")
   und das Modulprotokoll hängen am selben Lauf — siehe moduldatenFaellig unten. */
import { BRANCHENMODULE, modulprotokollFaellig } from "./branchenmodule.mjs";

/** Voreinstellungen, falls ein Betrieb sie noch nicht hat. */
export const VORGABE = {
  plandatenMonate: 24,
  stammdatenMonate: 6,
  gruendeMonate: 3,
};

/* § 16 Abs. 2 ArbZG. Unterhalb dieser Grenze ist die Einstellung nicht nur
   ungewöhnlich, sondern rechtswidrig. */
export const PLANDATEN_MINDEST = 24;

const ZWEI = (n) => String(n).padStart(2, "0");

/** Datum minus Monate, als ISO-Tag. Ohne Zeitzonenfallen — reine Rechnung. */
export function minusMonate(isoTag, monate) {
  const [j, m, t] = String(isoTag).slice(0, 10).split("-").map(Number);
  /* Arithmetisch, nicht mit einer Schleife: Bis November 2026 stand hier
     `while (monat <= 0) monat += 12`. Mit einer Frist von Infinity endete
     das nie, mit einer sehr großen erst nach Minuten — und der tägliche
     Datenschutzlauf hätte den ganzen Server angehalten (WP-26, H1). */
  const gesamt = j * 12 + (m - 1) - Number(monate);
  if (!Number.isSafeInteger(gesamt)) throw new RangeError(`Ungültige Frist: ${monate}`);
  const jahr = Math.floor(gesamt / 12);
  const monat = gesamt - jahr * 12 + 1;
  /* Der 31. März minus einen Monat ist der 28. Februar, nicht der 3. März.
     Ohne diese Deckelung sprängen Stichtage über den Monat hinaus. */
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${ZWEI(monat)}-${ZWEI(Math.min(t, letzterTag))}`;
}

/* Standort-Ergebnisse (WP-20) am Stempel: Urteil, Anzeigetext und die abgeleiteten Altfelder. Sie sind
   nicht aufbewahrungspflichtig — § 16 ArbZG verlangt die Zeiten, nicht den Ort — und gehen deshalb mit der
   kurzen Frist der Gründe (gruendeMonate, Vorgabe 3 Monate). Start, Ende und Kennzeichen bleiben bis zur
   Plandatenfrist. */
export const STANDORT_FELDER = Object.freeze(["geoStart", "geoEnde", "ortStart", "ortEnde",
  "innerhalbStart", "innerhalbEnde", "geprueftStart", "geprueftEnde"]);
const hatStandort = (e) => !!e && typeof e === "object" && STANDORT_FELDER.some((f) => f in e);

/** Der Tagesanteil aus einem Schlüssel "personId|JJJJ-MM-TT". */
const tagVon = (schluessel) => {
  const teil = String(schluessel).split("|")[1] || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(teil) ? teil : null;
};

/* Grenzen für die drei Fristen (Monate). Eine Angabe außerhalb ist kein
   Wert, sondern ein Fehler: Sie wird beim Speichern abgewiesen (gestalt.mjs,
   aufbewahrungFehler) und vom Datenschutzlauf übersprungen. */
export const FRIST_GRENZEN = Object.freeze({ min: 1, max: 600 });
const FRIST_FELDER = ["plandatenMonate", "stammdatenMonate", "gruendeMonate"];

/**
 * Ist m.aufbewahrung wohlgeformt? Ohne Angabe, null oder 0 heißt „Vorgabe".
 * Sonst eine ganze Zahl in FRIST_GRENZEN — keine Brüche, nichts Negatives,
 * kein Infinity. zuletztGeraeumt: fehlt oder JJJJ-MM-TT.
 * @returns {string|null} der Grund, oder null
 */
export function aufbewahrungFehler(a) {
  if (a === undefined || a === null) return null;
  if (typeof a !== "object" || Array.isArray(a)) return "Aufbewahrung: kein Objekt.";
  /* modulprotokollMonate: Frist des Modulprotokolls (Branchenmodule, MODULPROTOKOLL_FRIST) — gleiche Form. */
  for (const f of [...FRIST_FELDER, "modulprotokollMonate"]) {
    const w = a[f];
    if (w === undefined || w === null || w === 0 || w === "") continue;
    const n = typeof w === "number" || typeof w === "string" ? Number(w) : NaN;
    if (!Number.isInteger(n) || n < FRIST_GRENZEN.min || n > FRIST_GRENZEN.max)
      return `Aufbewahrung: ${f} muss eine ganze Zahl von ${FRIST_GRENZEN.min} bis ${FRIST_GRENZEN.max} Monaten sein.`;
  }
  if (a.zuletztGeraeumt !== undefined && a.zuletztGeraeumt !== null
      && !/^\d{4}-\d{2}-\d{2}$/.test(String(a.zuletztGeraeumt)))
    return "Aufbewahrung: zuletztGeraeumt ist kein Datum.";
  return null;
}

/** Die drei Fristen eines Betriebs, mit Voreinstellungen aufgefüllt. */
export function fristen(m) {
  const a = (m && m.aufbewahrung) || {};
  /* Nur gültige Werte zählen (ganze Zahl in FRIST_GRENZEN); ein Altwert wie
     1.5 aus der früheren Oberfläche gilt als „Vorgabe" — angezeigt und
     gerechnet. Gelöscht wird mit ihm nie: Der Lauf überspringt einen
     Betrieb mit ungültiger Angabe und meldet ihn (aufbewahrungFehler). */
  const gueltig = (w) => {
    const n = Number(w);
    return Number.isInteger(n) && n >= FRIST_GRENZEN.min && n <= FRIST_GRENZEN.max ? n : null;
  };
  return {
    plandatenMonate: gueltig(a.plandatenMonate) ?? VORGABE.plandatenMonate,
    stammdatenMonate: gueltig(a.stammdatenMonate) ?? VORGABE.stammdatenMonate,
    gruendeMonate: gueltig(a.gruendeMonate) ?? VORGABE.gruendeMonate,
    zuletztGeraeumt: a.zuletztGeraeumt || null,
  };
}

/** Schalter CENTRIC_DATENSCHUTZLAUF: „aus", „vorschau" (Vorgabe) oder „an". */
export const DATENSCHUTZ_MODI = Object.freeze(["aus", "vorschau", "an"]);

/** Der Modus aus der Umgebung: Vorgabe „vorschau", unbekannte Werte ebenfalls. */
export function datenschutzModus(wert = typeof process !== "undefined" ? process.env.CENTRIC_DATENSCHUTZLAUF : undefined) {
  const w = String(wert || "").trim().toLowerCase();
  return DATENSCHUTZ_MODI.includes(w) ? w : "vorschau";
}

/** Eine Eingabe der Oberfläche als gültige Frist: ganze Monate, 1 bis 600. */
export function fristWert(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return FRIST_GRENZEN.min;
  return Math.min(FRIST_GRENZEN.max, Math.max(FRIST_GRENZEN.min, n));
}

/**
 * Welche Betriebe haben ihre Aufbewahrungsangabe gegenüber dem
 * gespeicherten Stand geändert (oder sind neu)? Nur diese prüft das
 * Speichern streng (gestalt.mjs) — ein ungültiger Altwert in einem anderen
 * Betrieb desselben Raums sperrt sonst das Speichern für alle (N-1).
 * @returns {(m: any) => boolean}
 */
export function aufbewahrungGeaendert(vorher) {
  if (!vorher || !Array.isArray(vorher.mandanten)) return () => true;
  const alt = new Map(vorher.mandanten.filter((m) => m && typeof m === "object")
    .map((m) => [String(m.id), JSON.stringify(m.aufbewahrung ?? null)]));
  return (m) => !alt.has(String(m && m.id)) || alt.get(String(m.id)) !== JSON.stringify(m.aufbewahrung ?? null);
}

/** Die drei Stichtage, ab denen rückwärts gelöscht wird. */
export function stichtage(m, heuteIso) {
  const f = fristen(m);
  return {
    /* Harte Untergrenze (WP-26, H2): Plan-, Zeit- und Stempeldaten werden nie
       vor PLANDATEN_MINDEST Monaten gelöscht — § 16 Abs. 2 ArbZG, § 17 Abs. 1
       MiLoG. Eine kürzere Einstellung warnt in der Vorschau (s. unten), aber
       sie löscht nicht mehr: Vorher genügte eine Planerin mit Frist 1, und der
       Löschlauf nahm Ist-Zeiten und Stempel des Vormonats mit. */
    plan: minusMonate(heuteIso, Math.max(f.plandatenMonate, PLANDATEN_MINDEST)),
    stamm: minusMonate(heuteIso, f.stammdatenMonate),
    grund: minusMonate(heuteIso, f.gruendeMonate),
    /* Standort-Ergebnisse: wie die Gründe (WP-20). */
    standort: minusMonate(heuteIso, f.gruendeMonate),
    fristen: f,
  };
}

/**
 * Moduldaten mit Personenbezug (Registry: `personenfelder`, Schlüssel
 * „personId|JJJJ-MM-TT"), die fällig sind: Zuordnungen einer anonymisierten
 * oder heute zur Anonymisierung fälligen Person — die Kennung bleibt im Plan,
 * die Zuordnung zu Posten/Bereich hat ohne die Person keinen Zweck — und
 * Einträge hinter der Plandatenfrist. Gilt unabhängig vom Schalter: Auch ein
 * ausgeschaltetes Modul hält seine Daten nicht unbegrenzt (G3).
 * @returns {{ anzahl: number, felder: Record<string, Set<string>> }}
 */
function moduldatenFaellig(m, st, faelligePersonen, module) {
  const felder = [...new Set((module || []).flatMap((x) => (x && Array.isArray(x.personenfelder) ? x.personenfelder : [])))];
  const ohnePerson = new Set([...faelligePersonen.map((p) => String(p.id)),
    ...(m.personen || []).filter((p) => p && p.anonym).map((p) => String(p.id))]);
  /** @type {Record<string, Set<string>>} */
  const raus = {};
  let anzahl = 0;
  for (const f of felder) {
    const inhalt = m[f];
    if (!inhalt || typeof inhalt !== "object" || Array.isArray(inhalt)) continue;
    for (const k of Object.keys(inhalt)) {
      const i = k.lastIndexOf("|");
      if (i < 1) continue;                                       // unerwartete Form: bleibt liegen
      const tag = k.slice(i + 1);
      if (ohnePerson.has(k.slice(0, i)) || (/^\d{4}-\d{2}-\d{2}$/.test(tag) && tag < st.plan)) {
        (raus[f] = raus[f] || new Set()).add(k);
        anzahl++;
      }
    }
  }
  return { anzahl, felder: raus };
}

/* --------------------------------------------------------------------------
   Vorschau
   -------------------------------------------------------------------------- */

/**
 * Was wäre heute fällig? Verändert nichts.
 *
 * personen   zur Anonymisierung fällige Personen
 * plandaten  Anzahl je Feld
 * gruende    Freitexte, die entfallen
 * moduldaten Zuordnungen in Modul-Personenfeldern (anonymisierte Person, hinter der Plandatenfrist)
 * modulprotokoll  Einträge im Modulprotokoll nach dessen Frist
 * gesamt     Summe aller Eingriffe
 *
 * @returns {{stichtage: object, personen: Array<object>, plandaten: object,
 *   planSumme: number, aenderungen: number, gruende: number, standort: number, moduldaten: number,
 *   modulprotokoll: number, gesamt: number,
 *   warnung: (string|null)}}
 */
export function vorschau(m, heuteIso, { module = BRANCHENMODULE } = {}) {
  const st = stichtage(m, heuteIso);
  const personen = (m.personen || []).filter((p) => {
    if (!p || p.anonym || !p.austritt) return false;
    return String(p.austritt).slice(0, 10) <= st.stamm;
  });
  const md = moduldatenFaellig(m, st, personen, module);
  const modulprotokoll = modulprotokollFaellig(m, heuteIso).faellig;

  const plandaten = {};
  let planSumme = 0;
  for (const feld of ["abweichungen", "erfassung", "einstempeln"]) {
    const inhalt = m[feld];
    let n = 0;
    if (inhalt && typeof inhalt === "object") {
      for (const k of Object.keys(inhalt)) {
        const tag = tagVon(k);
        if (tag && tag < st.plan) n++;
      }
    }
    plandaten[feld] = n;
    planSumme += n;
  }

  /* Standort-Ergebnisse an Stempeln, die älter als die kurze Frist, aber noch nicht als Ganzes fällig sind. */
  let standort = 0;
  if (m.einstempeln && typeof m.einstempeln === "object") {
    for (const [k, e] of Object.entries(m.einstempeln)) {
      const tag = tagVon(k);
      if (tag && tag >= st.plan && tag < st.standort && hatStandort(e)) standort++;
    }
  }

  const aenderungen = (m.aenderungen || [])
    .filter((c) => c && c.datum && String(c.datum).slice(0, 10) < st.plan).length;

  /* Ein Grund zählt nur, wenn es ihn gibt und die Abwesenheit vorbei ist. */
  const gruende = (m.abwesenheiten || []).filter((a) => {
    if (!a) return false;
    const text = a.notiz || a.grund || "";
    if (!String(text).trim()) return false;
    const ende = String(a.bis || a.von || "").slice(0, 10);
    return ende && ende < st.grund;
  }).length;

  const warnung = st.fristen.plandatenMonate < PLANDATEN_MINDEST
    ? `Die Frist für Plandaten steht auf ${st.fristen.plandatenMonate} Monaten. `
      + "§ 16 Abs. 2 Arbeitszeitgesetz verlangt mindestens zwei Jahre für die "
      + "Aufzeichnung der über acht Stunden hinausgehenden Arbeitszeit. "
      + "In den Branchen des § 2a Schwarzarbeitsbekämpfungsgesetz — darunter "
      + "das Bewachungsgewerbe — kommt § 17 Abs. 1 Mindestlohngesetz hinzu: "
      + "dort sind Beginn, Ende und Dauer der gesamten täglichen Arbeitszeit "
      + "aufzuzeichnen und ebenfalls zwei Jahre bereitzuhalten."
    : null;

  return {
    stichtage: st,
    personen,
    plandaten,
    planSumme,
    aenderungen,
    gruende,
    standort,
    moduldaten: md.anzahl,
    modulprotokoll,
    gesamt: personen.length + planSumme + aenderungen + gruende + standort + md.anzahl + modulprotokoll,
    warnung,
  };
}

/* --------------------------------------------------------------------------
   Ausführen
   -------------------------------------------------------------------------- */

/** Eine Person anonymisieren — Kennung bleibt, damit der Plan hält. */
export function anonymisiere(p) {
  return {
    ...p,
    vorname: "",
    /* Ein lesbarer Platzhalter statt einer leeren Zeile: In alten Plänen
       muss noch erkennbar sein, dass dort jemand stand. */
    nachname: `Ausgeschieden ${String(p.id).slice(-4)}`,
    email: "",
    telefon: "",
    personalnummer: "",
    geburtstag: null,
    anschrift: "",
    notiz: "",
    /* Schutzangaben sind besonders schützenswert und für einen
       ausgeschiedenen Menschen ohne jeden Zweck. */
    einschraenkungen: {},
    schutz: undefined,
    anonym: true,
    anonymSeit: undefined,
  };
}

/**
 * Führt den Löschlauf aus.
 *
 * Der Bericht hat dieselbe Gestalt wie die Vorschau, damit die Oberfläche
 * beides gleich darstellt.
 *
 * @returns {{mandant: object, bericht: object}}
 */
export function raeumen(m, heuteIso, { module = BRANCHENMODULE } = {}) {
  const plan = vorschau(m, heuteIso, { module });
  /* Die Frist des Modulprotokolls (Branchenmodule) bleibt stehen, wenn der Betrieb sie gesetzt hat. */
  const mpm = m.aufbewahrung && typeof m.aufbewahrung === "object" && m.aufbewahrung.modulprotokollMonate !== undefined
    ? { modulprotokollMonate: m.aufbewahrung.modulprotokollMonate } : {};
  if (plan.gesamt === 0) {
    return {
      mandant: { ...m, aufbewahrung: { ...fristen(m), ...mpm, zuletztGeraeumt: heuteIso } },
      bericht: { ...plan, ausgefuehrt: true },
    };
  }
  const st = plan.stichtage;
  const faellig = new Set(plan.personen.map((p) => p.id));
  /* Moduldaten (Personenfelder der Branchenmodule): fällige Schlüssel entfernen. */
  const md = moduldatenFaellig(m, st, plan.personen, module);
  const moduldatenGeraeumt = Object.fromEntries(Object.entries(md.felder)
    .map(([f, raus]) => [f, Object.fromEntries(Object.entries(m[f]).filter(([k]) => !raus.has(k)))]));

  const gekuerzt = {};
  for (const feld of ["abweichungen", "erfassung", "einstempeln"]) {
    const inhalt = m[feld];
    if (!inhalt || typeof inhalt !== "object") { gekuerzt[feld] = inhalt; continue; }
    const neu = {};
    for (const [k, v] of Object.entries(inhalt)) {
      const tag = tagVon(k);
      /* Ein Schlüssel ohne erkennbares Datum bleibt liegen. Lieber eine
         unerwartete Form mitschleppen als sie stillschweigend löschen. */
      if (tag && tag < st.plan) continue;
      /* Standort-Ergebnisse gehen früher als der Stempel selbst (WP-20); die Zeiten bleiben. */
      if (feld === "einstempeln" && tag && tag < st.standort && hatStandort(v)) {
        const rest = { ...v };
        for (const f of STANDORT_FELDER) delete rest[f];
        neu[k] = rest;
        continue;
      }
      neu[k] = v;
    }
    gekuerzt[feld] = neu;
  }

  return {
    mandant: {
      ...m,
      ...gekuerzt,
      personen: (m.personen || []).map((p) => (faellig.has(p.id)
        ? { ...anonymisiere(p), anonymSeit: heuteIso } : p)),
      aenderungen: (m.aenderungen || [])
        .filter((c) => !(c && c.datum && String(c.datum).slice(0, 10) < st.plan)),
      abwesenheiten: (m.abwesenheiten || []).map((a) => {
        if (!a) return a;
        const ende = String(a.bis || a.von || "").slice(0, 10);
        if (!ende || ende >= st.grund) return a;
        if (!String(a.notiz || a.grund || "").trim()) return a;
        /* Nur der Text geht. Art und Zeitraum bleiben — ohne sie stimmt
           keine Fehlzeitenstatistik mehr. */
        return { ...a, notiz: "", grund: "", grundGeloescht: heuteIso };
      }),
      ...moduldatenGeraeumt,
      ...(plan.modulprotokoll ? { einstellungen: { ...m.einstellungen, modulprotokoll: modulprotokollFaellig(m, heuteIso).rest } } : {}),
      aufbewahrung: { ...fristen(m), ...mpm, zuletztGeraeumt: heuteIso },
    },
    bericht: { ...plan, ausgefuehrt: true },
  };
}

/** „1 Person" statt „1 Personen" — Zahlen im Text sind kein Formular. */
const zahlwort = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/** Ein Satz für die Oberfläche und fürs Protokoll. */
export function berichtstext(b) {
  if (!b || b.gesamt === 0) return "Nichts fällig — alle Fristen eingehalten.";
  const teile = [];
  if (b.personen.length)
    teile.push(`${zahlwort(b.personen.length, "Person", "Personen")} anonymisiert`);
  if (b.planSumme)
    teile.push(`${zahlwort(b.planSumme, "Plan- oder Zeiteintrag", "Plan- und Zeiteinträge")} gelöscht`);
  if (b.aenderungen)
    teile.push(`${zahlwort(b.aenderungen, "Änderungsvermerk", "Änderungsvermerke")} gelöscht`);
  if (b.standort)
    teile.push(`${zahlwort(b.standort, "Standort-Ergebnis", "Standort-Ergebnisse")} entfernt`);
  if (b.gruende)
    teile.push(`${zahlwort(b.gruende, "Abwesenheitsgrund", "Abwesenheitsgründe")} entfernt`);
  if (b.moduldaten)
    teile.push(`${zahlwort(b.moduldaten, "Modulzuordnung", "Modulzuordnungen")} entfernt`);
  if (b.modulprotokoll)
    teile.push(`${zahlwort(b.modulprotokoll, "Eintrag", "Einträge")} im Modulprotokoll entfernt`);
  return `${teile.join(", ")}.`;
}
