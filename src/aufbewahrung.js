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
  let jahr = j;
  let monat = m - monate;
  while (monat <= 0) { monat += 12; jahr -= 1; }
  /* Der 31. März minus einen Monat ist der 28. Februar, nicht der 3. März.
     Ohne diese Deckelung sprängen Stichtage über den Monat hinaus. */
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${ZWEI(monat)}-${ZWEI(Math.min(t, letzterTag))}`;
}

/** Der Tagesanteil aus einem Schlüssel "personId|JJJJ-MM-TT". */
const tagVon = (schluessel) => {
  const teil = String(schluessel).split("|")[1] || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(teil) ? teil : null;
};

/** Die drei Fristen eines Betriebs, mit Voreinstellungen aufgefüllt. */
export function fristen(m) {
  const a = (m && m.aufbewahrung) || {};
  return {
    plandatenMonate: Number(a.plandatenMonate) > 0 ? Number(a.plandatenMonate) : VORGABE.plandatenMonate,
    stammdatenMonate: Number(a.stammdatenMonate) > 0 ? Number(a.stammdatenMonate) : VORGABE.stammdatenMonate,
    gruendeMonate: Number(a.gruendeMonate) > 0 ? Number(a.gruendeMonate) : VORGABE.gruendeMonate,
    zuletztGeraeumt: a.zuletztGeraeumt || null,
  };
}

/** Die drei Stichtage, ab denen rückwärts gelöscht wird. */
export function stichtage(m, heuteIso) {
  const f = fristen(m);
  return {
    plan: minusMonate(heuteIso, f.plandatenMonate),
    stamm: minusMonate(heuteIso, f.stammdatenMonate),
    grund: minusMonate(heuteIso, f.gruendeMonate),
    fristen: f,
  };
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
 * gesamt     Summe aller Eingriffe
 *
 * @returns {{stichtage: object, personen: Array<object>, plandaten: object,
 *   planSumme: number, aenderungen: number, gruende: number, gesamt: number,
 *   warnung: (string|null)}}
 */
export function vorschau(m, heuteIso) {
  const st = stichtage(m, heuteIso);
  const personen = (m.personen || []).filter((p) => {
    if (!p || p.anonym || !p.austritt) return false;
    return String(p.austritt).slice(0, 10) <= st.stamm;
  });

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
    gesamt: personen.length + planSumme + aenderungen + gruende,
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
export function raeumen(m, heuteIso) {
  const plan = vorschau(m, heuteIso);
  if (plan.gesamt === 0) {
    return {
      mandant: { ...m, aufbewahrung: { ...fristen(m), zuletztGeraeumt: heuteIso } },
      bericht: { ...plan, ausgefuehrt: true },
    };
  }
  const st = plan.stichtage;
  const faellig = new Set(plan.personen.map((p) => p.id));

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
      aufbewahrung: { ...fristen(m), zuletztGeraeumt: heuteIso },
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
  if (b.gruende)
    teile.push(`${zahlwort(b.gruende, "Abwesenheitsgrund", "Abwesenheitsgründe")} entfernt`);
  return `${teile.join(", ")}.`;
}
