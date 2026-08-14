/* ==========================================================================
   MIGRATION

   Bis hierher stand in App.jsx eine einzige Zeile:

     let b = bestand && bestand.version === 5 ? bestand : startbestand();

   Passte die Version nicht, wurde der geladene Bestand kommentarlos durch
   die Beispieldaten ersetzt — und der nächste Speichervorgang schrieb diese
   Beispieldaten über den echten Betrieb. Beim Sprung auf Version 6 hätte
   jeder Kunde beim nächsten Öffnen seine Daten verloren, ohne Meldung.

   Diese Datei ersetzt das durch drei Regeln:

     Zu alt    → schrittweise hochziehen, jede Stufe für sich
     Passend   → unverändert durchreichen
     Zu neu    → abbrechen und sagen, was los ist

   Der letzte Fall ist der wichtigste. Eine Fassung, die einen neueren
   Bestand nicht versteht, darf ihn nicht anfassen. Sonst überschreibt ein
   Browser mit altem Zwischenspeicher die Arbeit aller anderen.
   ========================================================================== */

export const VERSION = 8;

/**
 * Eine Stufe je Eintrag. Der Schlüssel ist die Version, aus der gehoben
 * wird; die Funktion gibt den Bestand eine Version höher zurück.
 *
 * Regeln für neue Stufen:
 *   - Niemals löschen, was eine ältere Fassung noch braucht.
 *   - Keine Seiteneffekte: rein aus Eingabe neue Ausgabe bauen.
 *   - Fehlende Felder ergänzen, vorhandene nie überschreiben.
 */
const STUFEN = {
  /* 5 → 6: Aufbewahrungsangaben je Betrieb. Vorher gab es keine, und ohne
     sie lässt sich kein Löschkonzept nach Artikel 17 DSGVO umsetzen. */
  5: (b) => ({
    ...b,
    version: 6,
    mandanten: (b.mandanten || []).map((m) => ({
      ...m,
      aufbewahrung: m.aufbewahrung || {
        /* Plandaten: zwei Jahre. Die Aufzeichnungspflicht nach § 16 Abs. 2
           Arbeitszeitgesetz liegt bei zwei Jahren. */
        plandatenMonate: 24,
        /* Stammdaten nach Austritt: sechs Monate. Danach wird die Person
           anonymisiert, nicht gelöscht — sonst zerfällt die Vergangenheit
           des Plans. */
        stammdatenMonate: 6,
        /* Abwesenheitsgründe sind Gesundheitsangaben nach Artikel 9 DSGVO
           und gehören am kürzesten aufbewahrt. */
        gruendeMonate: 3,
        zuletztGeraeumt: null,
      },
    })),
  }),

  /* 6 → 7: zyklus.tage sicherstellen.

     Über zwanzig Stellen greifen auf m.zyklus.tage zu, die meisten ohne
     Prüfung — nur zyklusLaenge() fing den Fall ab. Fehlte das Feld, stürzte
     die Personalakte ab („Cannot read properties of undefined"), und mit ihr
     jede Ansicht, die Stunden über ein Jahr rechnet.

     Statt zwanzig Zugriffe einzeln abzusichern, wird die Form garantiert:
     eine Liste mit wochen × 7 Einträgen, gefüllt mit „-" für dienstfrei. */
  6: (b) => ({
    ...b,
    version: 7,
    mandanten: (b.mandanten || []).map((m) => {
      const wochen = (m.zyklus && m.zyklus.wochen) || 3;
      const laenge = wochen * 7;
      const vorhanden = Array.isArray(m.zyklus && m.zyklus.tage) ? m.zyklus.tage : [];
      return {
        ...m,
        zyklus: {
          wochen,
          vorlage: (m.zyklus && m.zyklus.vorlage) || null,
          /* Vorhandene Einträge behalten, fehlende auffüllen. Ein zu langer
             Zyklus wird nicht gekürzt — lieber mitschleppen als verlieren. */
          tage: vorhanden.length >= laenge
            ? vorhanden
            : Array.from({ length: laenge }, (_, i) => vorhanden[i] ?? "-"),
        },
      };
    }),
  }),

  /* 7 → 8: Rechtematrix sicherstellen.

     Selbst angelegte Betriebe kamen ohne m.matrix auf die Welt —
     baueLeerenBetrieb() legte sie nicht an. Die Betriebsansicht liest
     m.matrix[rolle] ungeprüft und stürzte ab, sobald jemand „Verwaltung →
     Betrieb" öffnete. Betroffen war jeder Betrieb aus dem Selbststart.

     Die Werte stammen aus derselben Tabelle, die der Server benutzt; eine
     abweichende Matrix eines bestehenden Betriebs bleibt unangetastet. */
  7: (b) => ({
    ...b,
    version: 8,
    mandanten: (b.mandanten || []).map((m) => {
      if (!m || typeof m !== "object") return m;
      const e = m.einstellungen || {};
      return {
        ...m,
        /* null heißt: die Oberfläche nimmt MATRIX_STD. Eine bestehende,
           betrieblich angepasste Matrix bleibt unangetastet. */
        matrix: (m.matrix && typeof m.matrix === "object" && Object.keys(m.matrix).length)
          ? m.matrix : null,
        einstellungen: {
          ...e,
          /* Zwei Namen für dieselbe Größe. Die Oberfläche liest
             sollWochenstunden, der Selbststart legte nur wochenstunden an —
             das Feld blieb leer und jeder Vergleich fiel auf 40 zurück. */
          sollWochenstunden: e.sollWochenstunden ?? e.wochenstunden ?? 40,
          wochenstunden: e.wochenstunden ?? e.sollWochenstunden ?? 40,
          /* Ohne Obergrenze prüft die Urlaubsregel nichts: `n > undefined`
             ist immer falsch. */
          maxUrlaubJeEinheit: e.maxUrlaubJeEinheit ?? 2,
        },
      };
    }),
  }),
};

/** Was ist mit diesem Bestand? Ohne ihn zu verändern. */
export function pruefeBestand(bestand) {
  if (!bestand || typeof bestand !== "object")
    return { lage: "leer" };
  const v = Number(bestand.version);
  if (!Number.isFinite(v))
    return { lage: "unbekannt", version: bestand.version };
  if (v > VERSION)
    return { lage: "zuNeu", version: v };
  if (v === VERSION)
    return { lage: "passend", version: v };
  return { lage: "zuAlt", version: v };
}

/**
 * Hebt einen Bestand auf die aktuelle Version.
 *
 * Gibt { ok, bestand, von, nach, schritte } zurück — oder { ok: false }
 * mit einem Grund. Wirft nie: Der Aufrufer soll entscheiden, was er dem
 * Menschen davon zeigt.
 */
export function migriere(bestand) {
  const stand = pruefeBestand(bestand);

  if (stand.lage === "leer") return { ok: false, grund: "leer" };
  if (stand.lage === "passend")
    return { ok: true, bestand, von: stand.version, nach: stand.version, schritte: 0 };

  if (stand.lage === "zuNeu") {
    /* Der gefährlichste Fall, und der einzige, in dem Nichtstun richtig ist.
       Ein Bestand aus einer neueren Fassung enthält Felder, die diese hier
       nicht kennt — schriebe sie ihn zurück, gingen sie verloren. */
    return { ok: false, grund: "zuNeu", version: stand.version, erwartet: VERSION };
  }

  if (stand.lage === "unbekannt")
    return { ok: false, grund: "unbekannt", version: stand.version };

  let b = bestand;
  let v = stand.version;
  let schritte = 0;
  while (v < VERSION) {
    const stufe = STUFEN[v];
    if (!stufe) return { ok: false, grund: "luecke", version: v, erwartet: VERSION };
    try {
      b = stufe(b);
    } catch (e) {
      return { ok: false, grund: "fehler", version: v, text: String(e && e.message || e) };
    }
    const neu = Number(b.version);
    /* Schutz gegen eine Stufe, die die Version nicht anhebt — sonst dreht
       sich diese Schleife für immer. */
    if (!Number.isFinite(neu) || neu <= v)
      return { ok: false, grund: "steht", version: v };
    v = neu;
    schritte++;
    if (schritte > 50) return { ok: false, grund: "zuVieleSchritte", version: v };
  }
  return { ok: true, bestand: b, von: stand.version, nach: v, schritte };
}

/** Klartext für die Oberfläche. Kein Fachchinesisch, kein Schuldzuweisen. */
export function migrationstext(ergebnis) {
  switch (ergebnis.grund) {
    case "zuNeu":
      return {
        titel: "Diese Fassung ist zu alt",
        text: "Die Daten wurden mit einer neueren Fassung von CENTRIC gespeichert. "
          + "Lade die Seite neu — dann holt der Browser die aktuelle Fassung. "
          + "Bis dahin wird nichts geändert, damit nichts verlorengeht.",
        neuladen: true,
      };
    case "luecke":
    case "steht":
    case "unbekannt":
      return {
        titel: "Die Daten lassen sich nicht öffnen",
        text: `Der gespeicherte Stand trägt die Fassung ${ergebnis.version ?? "?"}, `
          + `erwartet wird ${VERSION}. Die Daten sind unverändert — bitte melde dich, `
          + "bevor du weiterarbeitest.",
        neuladen: false,
      };
    case "fehler":
      return {
        titel: "Beim Öffnen ist etwas schiefgegangen",
        text: "Die Daten wurden nicht verändert. Bitte melde diesen Hinweis: "
          + (ergebnis.text || "unbekannter Fehler"),
        neuladen: false,
      };
    default:
      return {
        titel: "Die Daten lassen sich nicht öffnen",
        text: "Bitte lade die Seite neu. Es wurde nichts geändert.",
        neuladen: true,
      };
  }
}
