/* ==========================================================================
   INTELLIGENCE — BETRIEBSSTEUERUNG (WP-I16, Teil 1)

   Je Betrieb: Hauptschalter, Schalter je Funktion (F1…F18), die Frage nach
   Betriebsrat/Personalrat/MAV und die Pause. Alles steht in
   `einstellungen.kiSteuerung` des Betriebs und läuft durch den einen
   Speicherweg (zusammenfuehren, server/lib/rechte.mjs) — kein neuer Weg.

   Vorgabe: ALLES AUS. Fehlt etwas, ist es ungültig oder nicht lesbar, ist die
   Antwort nein (fail closed). Dieses Modul schaltet nichts ein, verdrahtet
   nichts und liest keine Umgebung: Der Prozessschalter kommt als Parameter
   (`prozess`, "an" nur bei genau diesem Wert) vom Aufrufer; das Anbinden an die
   Umgebung (server.mjs) bleibt Betreiberfreigabe.

   WER DARF WAS (Plan I16: „Bei Ja kein Modellaufruf bis Bestätigung“; die
   Rolle, die bestätigt, nennt der Plan nicht — engste Lesart, offene Frage im PR):
   - Leitung (Rolle „leitung“, nicht Demo): Hauptschalter, Schalter je
     Funktion, die Frage nach der Mitbestimmungsvertretung.
   - Betriebsrat: ausschließlich die Pause setzen und aufheben.
   - Die Pause hebt NUR der Betriebsrat auf. Die Leitung kann sie weder aufheben
     noch setzen — außer mittelbar: Die Antwort „ja“ auf die Frage setzt die
     Pause; sie gilt, bis der Betriebsrat sie bestätigt (aufhebt).
   - Alle anderen Rollen (Planung, Schichtverantwortung, Beschäftigte, Kunde,
     Betreiber, Demo): nie. Die Planung sieht den Stand, ändert ihn nicht.
   Wer, was und wann steht im Protokoll des Betriebs (Rolle und Personenkennung,
   nie Namen oder Inhalte); wann und von wem setzt der Server, mitgeschickte
   Werte zählen nie.

   Dieses Modul importiert nichts aus dem Intelligence-Ordner (Rechenkern-Grenze); die
   Funktionsliste und die Rollenliste sind hier festgehalten und werden von
   pruefungen/intelligence-steuerung.test.js mit der Positivliste abgeglichen.
   ========================================================================== */

/** F1…F18 (Spiegel von FUNKTIONEN_IDS in schemas.mjs, per Test abgeglichen). */
export const KI_FUNKTIONEN = Object.freeze(["F1", "F2", "F3", "F4", "F5", "F6", "F7A", "F8", "F9", "F10",
  "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18"]);
/** Rollen, die überhaupt auslösen dürfen (Spiegel von ROLLEN_ERLAUBT, per Test abgeglichen). */
export const KI_ROLLEN_AUSLOESEN = Object.freeze(["leitung", "planer", "mitarbeiter"]);
/** Funktionen, die nicht eingeschaltet werden dürfen (Spiegel von FREISCHALTUNG_GESPERRT, per Test abgeglichen). */
export const KI_GESPERRT = Object.freeze({ F7A: "serverseitige Maskierung der Tabelle vor der Leck-Prüfung fehlt" });

export const KI_FELD = "kiSteuerung";
export const KI_PROTOKOLL_GRENZE = 200;
export const KI_FRAGE_ANTWORTEN = Object.freeze(["ja", "nein"]);

export const KI_RECHTE = Object.freeze({
  leitung: Object.freeze(["betrieb", "funktion", "frage"]),
  betriebsrat: Object.freeze(["pause"]),
});

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ------------------------------------------------------------------ Lesen */

const stempelOk = (s) => istObjekt(s) && typeof s.am === "string" && s.am.length <= 40
  && (s.vonRolle === undefined || typeof s.vonRolle === "string")
  && (s.vonPerson === undefined || s.vonPerson === null || typeof s.vonPerson === "string" || typeof s.vonPerson === "number");

/**
 * Der gespeicherte Stand, streng gelesen. Alles Ungültige heißt „nicht vorhanden“
 * (also aus); ein einzelner kaputter Eintrag macht nur sich selbst zu „aus“.
 * @param {any} e einstellungen des Betriebs
 * @returns {null | { betrieb: any, funktionen: Record<string, any>, betriebsratFrage: any, pause: any, pauseUngueltig: boolean, protokoll: any[] }}
 */
export function kiSteuerungLesen(e) {
  if (!istObjekt(e) || !hat(e, KI_FELD) || !istObjekt(e[KI_FELD])) return null;
  const s = e[KI_FELD];
  const fn = {};
  if (istObjekt(s.funktionen)) {
    for (const id of KI_FUNKTIONEN) {
      if (hat(s.funktionen, id) && istObjekt(s.funktionen[id]) && typeof s.funktionen[id].an === "boolean" && stempelOk(s.funktionen[id]))
        fn[id] = { ...s.funktionen[id] };
    }
  }
  return {
    betrieb: istObjekt(s.betrieb) && typeof s.betrieb.an === "boolean" && stempelOk(s.betrieb) ? { ...s.betrieb } : null,
    funktionen: fn,
    betriebsratFrage: istObjekt(s.betriebsratFrage) && KI_FRAGE_ANTWORTEN.includes(s.betriebsratFrage.antwort) && stempelOk(s.betriebsratFrage)
      ? { ...s.betriebsratFrage } : null,
    pause: istObjekt(s.pause) && typeof s.pause.aktiv === "boolean" && stempelOk(s.pause) ? { ...s.pause } : null,
    pauseUngueltig: hat(s, "pause") && !(istObjekt(s.pause) && typeof s.pause.aktiv === "boolean" && stempelOk(s.pause)),
    protokoll: Array.isArray(s.protokoll) ? s.protokoll.filter((x) => istObjekt(x) && typeof x.art === "string" && stempelOk(x)).slice(-KI_PROTOKOLL_GRENZE) : [],
  };
}

/* ----------------------------------------------------------------- Helfer */

/**
 * Darf diese Funktion in diesem Betrieb für diese Rolle jetzt laufen — mit dem Grund, wenn nicht.
 * Alle Bedingungen müssen ausdrücklich erfüllt sein; alles Fehlende oder Ungültige heißt nein.
 *   1. Prozessschalter genau "an" (Parameter `prozess`, vom Aufrufer aus der Umgebung gelesen; Vorgabe aus)
 *   2. Rolle in KI_ROLLEN_AUSLOESEN (Betriebsrat, Betreiber, Kunde, Schichtverantwortung nie)
 *   3. Funktion F1…F18 (nicht gesperrt)
 *   4. Hauptschalter des Betriebs an
 *   5. Frage nach der Mitbestimmungsvertretung beantwortet
 *   6. Pause ausdrücklich nicht aktiv (der Betriebsrat hat bestätigt oder es gibt keine Vertretung)
 *   7. Schalter der Funktion an
 * @param {any} betrieb der Betrieb (Mandant) mit `einstellungen`
 * @param {string} funktion
 * @param {string} rolle
 * @param {{ prozess?: unknown }} [o]
 * @returns {{ erlaubt: boolean, code: "OK" | "KI_AUS" | "KI_PAUSIERT" | "KI_FUNKTION" | "KI_ROLLE" | "KI_EINGABE" }}
 */
export function intelligenceEntscheidung(betrieb, funktion, rolle, o = {}) {
  try {
    const nein = (code) => ({ erlaubt: false, code });
    if (typeof funktion !== "string" || typeof rolle !== "string" || !istObjekt(betrieb)) return nein("KI_EINGABE");
    if (!o || o.prozess !== "an") return nein("KI_AUS");
    if (!KI_FUNKTIONEN.includes(funktion) || hat(KI_GESPERRT, funktion)) return nein("KI_FUNKTION");
    if (!KI_ROLLEN_AUSLOESEN.includes(rolle)) return nein("KI_ROLLE");
    const s = kiSteuerungLesen(betrieb.einstellungen);
    if (!s) return nein("KI_AUS");
    /* Die Pause geht vor jedem Schalter. Ein unlesbarer Pausenstand (vorhanden, aber ungültig) zählt als aktiv. */
    if (s.pauseUngueltig || (s.pause && s.pause.aktiv === true)) return nein("KI_PAUSIERT");
    if (!s.betrieb || s.betrieb.an !== true) return nein("KI_AUS");
    if (!s.betriebsratFrage) return nein("KI_AUS");
    /* „Ja“: erst nach der ausdrücklichen Bestätigung des Betriebsrats (Pause vorhanden und aufgehoben). */
    if (s.betriebsratFrage.antwort === "ja" && (!s.pause || s.pause.aktiv !== false)) return nein("KI_PAUSIERT");
    if (!hat(s.funktionen, funktion) || s.funktionen[funktion].an !== true) return nein("KI_AUS");
    return { erlaubt: true, code: "OK" };
  } catch {
    return { erlaubt: false, code: "KI_EINGABE" };
  }
}

/** Kurzform: nur ja oder nein. Der Aufrufer reicht den Prozessschalter als `{ prozess }` durch. */
export function intelligenceErlaubt(betrieb, funktion, rolle, o = {}) {
  return intelligenceEntscheidung(betrieb, funktion, rolle, o).erlaubt === true;
}

/* ---------------------------------------------------------------- Schreiben */

const wer = (sitzung) => (sitzung && (typeof sitzung.person === "string" || typeof sitzung.person === "number") ? sitzung.person : null);

/**
 * Wendet die Absicht einer Anfrage auf den gespeicherten Stand an. Rein; wirft nie.
 * Die Absicht hat dieselbe Gestalt wie der Stand: betrieb.an, funktionen.<id>.an, betriebsratFrage.antwort,
 * pause.aktiv. Alles andere (am, von, Protokoll) zählt nicht. Ein unveränderter Wert ist keine Änderung.
 * @param {ReturnType<typeof kiSteuerungLesen>} alt
 * @param {any} absicht
 * @param {{ rolle: string, person?: any, demo?: boolean }} sitzung
 * @param {string} jetzt ISO-Zeit
 * @returns {{ grund: string } | { stand: any, ereignisse: any[] }}
 */
export function kiSteuerungAnwenden(alt, absicht, sitzung, jetzt) {
  const darfRecht = (r) => !!sitzung && sitzung.demo !== true && Object.hasOwn(KI_RECHTE, sitzung.rolle) && KI_RECHTE[sitzung.rolle].includes(r);
  const stand = alt
    ? { betrieb: alt.betrieb, funktionen: { ...alt.funktionen }, betriebsratFrage: alt.betriebsratFrage, pause: alt.pauseUngueltig ? { aktiv: true, am: jetzt, vonRolle: "system", vonPerson: null } : alt.pause, protokoll: [...alt.protokoll] }
    : { betrieb: null, funktionen: {}, betriebsratFrage: null, pause: null, protokoll: [] };
  const ereignisse = [];
  if (absicht === undefined || absicht === null) return { stand, ereignisse };
  if (!istObjekt(absicht)) return { grund: "Intelligence-Steuerung: erwartet wird ein Objekt." };
  const stempel = { am: jetzt, vonRolle: sitzung && typeof sitzung.rolle === "string" ? sitzung.rolle : "unbekannt", vonPerson: wer(sitzung) };
  const verweigert = (was) => ({ grund: `Intelligence-Steuerung: ${was} ist mit deiner Rolle nicht zulässig.` });

  /* Pause zuerst: Sie ist der Teil, den nur der Betriebsrat anfassen darf — auch im selben Zug wie die Frage. */
  if (hat(absicht, "pause")) {
    const p = absicht.pause;
    if (!istObjekt(p) || (hat(p, "aktiv") && typeof p.aktiv !== "boolean")) return { grund: "Intelligence-Steuerung: Die Pause braucht den Wert „aktiv“ (wahr oder falsch)." };
    if (hat(p, "aktiv") && p.aktiv !== (stand.pause ? stand.pause.aktiv : false)) {
      if (!darfRecht("pause")) return { grund: "Die Pause der Intelligence-Funktionen setzt und hebt nur der Betriebsrat auf — nicht die Leitung und keine andere Rolle." };
      stand.pause = { aktiv: p.aktiv, ...stempel };
      ereignisse.push({ art: p.aktiv ? "pause-gesetzt" : "pause-aufgehoben", ziel: "betrieb", wert: p.aktiv, ...stempel });
    }
  }
  if (hat(absicht, "betrieb")) {
    const b = absicht.betrieb;
    if (!istObjekt(b) || (hat(b, "an") && typeof b.an !== "boolean")) return { grund: "Intelligence-Steuerung: Der Hauptschalter braucht den Wert „an“ (wahr oder falsch)." };
    if (hat(b, "an") && b.an !== (stand.betrieb ? stand.betrieb.an : false)) {
      if (!darfRecht("betrieb")) return verweigert("Der Hauptschalter");
      if (b.an === true && !(absicht.betriebsratFrage && KI_FRAGE_ANTWORTEN.includes(absicht.betriebsratFrage.antwort)) && !stand.betriebsratFrage)
        return { grund: "Vor dem Einschalten ist die Frage zu beantworten, ob es einen Betriebsrat, Personalrat oder eine Mitarbeitervertretung gibt." };
      stand.betrieb = { an: b.an, ...stempel };
      ereignisse.push({ art: b.an ? "betrieb-an" : "betrieb-aus", ziel: "betrieb", wert: b.an, ...stempel });
    }
  }
  if (hat(absicht, "betriebsratFrage")) {
    const f = absicht.betriebsratFrage;
    if (!istObjekt(f) || (hat(f, "antwort") && !KI_FRAGE_ANTWORTEN.includes(f.antwort))) return { grund: "Intelligence-Steuerung: Die Antwort auf die Frage nach der Vertretung ist „ja“ oder „nein“." };
    if (hat(f, "antwort") && f.antwort !== (stand.betriebsratFrage ? stand.betriebsratFrage.antwort : null)) {
      if (!darfRecht("frage")) return verweigert("Die Antwort auf die Frage nach der Vertretung");
      const vorher = stand.betriebsratFrage ? stand.betriebsratFrage.antwort : null;
      stand.betriebsratFrage = { antwort: f.antwort, ...stempel };
      ereignisse.push({ art: "frage", ziel: "betriebsrat", wert: f.antwort, ...stempel });
      /* „Ja“ → keine Modellaufrufe, bis der Betriebsrat bestätigt (Pause). Das setzt der Server, nicht die Anfrage. */
      if (f.antwort === "ja" && vorher !== "ja" && !(stand.pause && stand.pause.aktiv === true)) {
        stand.pause = { aktiv: true, ...stempel };
        ereignisse.push({ art: "pause-gesetzt", ziel: "einrichtung", wert: true, ...stempel });
      }
    }
  }
  if (hat(absicht, "funktionen")) {
    const w = absicht.funktionen;
    if (!istObjekt(w)) return { grund: "Intelligence-Steuerung: Die Funktionen brauchen je Kennung den Wert „an“." };
    for (const [id, x] of Object.entries(w)) {
      if (!KI_FUNKTIONEN.includes(id)) return { grund: `Intelligence-Steuerung: Die Funktion „${String(id).slice(0, 12)}“ gibt es nicht.` };
      if (!istObjekt(x) || (hat(x, "an") && typeof x.an !== "boolean")) return { grund: `Intelligence-Steuerung: Funktion ${id} braucht den Wert „an“ (wahr oder falsch).` };
      if (!hat(x, "an") || x.an === (hat(stand.funktionen, id) ? stand.funktionen[id].an : false)) continue;
      if (!darfRecht("funktion")) return verweigert(`Der Schalter der Funktion ${id}`);
      if (x.an === true && hat(KI_GESPERRT, id)) return { grund: `Funktion ${id} lässt sich noch nicht einschalten.` };
      stand.funktionen[id] = { an: x.an, ...stempel };
      ereignisse.push({ art: x.an ? "funktion-an" : "funktion-aus", ziel: id, wert: x.an, ...stempel });
    }
  }
  stand.protokoll = [...stand.protokoll, ...ereignisse].slice(-KI_PROTOKOLL_GRENZE);
  return { stand, ereignisse };
}

/** Den Stand für die Ablage zusammensetzen: nur bekannte Felder, in fester Reihenfolge. */
function standFuerAblage(s) {
  const aus = {};
  if (s.betrieb) aus.betrieb = s.betrieb;
  if (Object.keys(s.funktionen).length) aus.funktionen = s.funktionen;
  if (s.betriebsratFrage) aus.betriebsratFrage = s.betriebsratFrage;
  if (s.pause) aus.pause = s.pause;
  if (s.protokoll.length) aus.protokoll = s.protokoll;
  return aus;
}

/**
 * Der eine Schreibweg für Leitung, Planung und alle Rollen mit Vollschreibrecht (Aufruf in zusammenfuehren).
 * Der gespeicherte Stand ist die Grundlage; die Anfrage trägt nur eine Absicht. Ein mitgeschickter Stand
 * (Wann/Wer, Protokoll) zählt nie. Rollen ohne Recht werden bei einer Änderung abgewiesen (grund).
 * @param {any} altM @param {any} neuM @param {{ rolle: string, person?: any, demo?: boolean }} sitzung
 * @param {{ jetzt?: string }} [o]
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function kiSteuerungZusammen(altM, neuM, sitzung, o = {}) {
  if (!istObjekt(neuM)) return { mandant: neuM };
  const altE = altM && istObjekt(altM.einstellungen) ? altM.einstellungen : {};
  const alt = kiSteuerungLesen(altE);
  const gespeichert = hat(altE, KI_FELD) ? altE[KI_FELD] : undefined;
  const neuE = istObjekt(neuM.einstellungen) ? neuM.einstellungen : null;
  const absicht = neuE && hat(neuE, KI_FELD) ? neuE[KI_FELD] : undefined;
  const jetzt = o.jetzt || new Date().toISOString();
  const aus = kiSteuerungAnwenden(alt, absicht, sitzung, jetzt);
  if ("grund" in aus) return { grund: aus.grund };
  const e = { ...(neuE || {}) };
  if (aus.ereignisse.length) e[KI_FELD] = standFuerAblage(aus.stand);
  else if (gespeichert !== undefined) e[KI_FELD] = gespeichert;      // unverändert: genau der gespeicherte Stand
  else delete e[KI_FELD];
  return { mandant: { ...neuM, einstellungen: e } };
}

/**
 * Der Weg des Betriebsrats: Er schreibt sonst nirgends, hier genau die Pause. Aus dem gespeicherten Stand
 * entsteht der neue; aus der Anfrage zählt nur `kiSteuerung.pause.aktiv` des eigenen Betriebs. Jede Änderung
 * eines anderen Teils der Steuerung (Hauptschalter, Funktion, Frage) weist ab. Ohne Änderung der Pause: null
 * (wie bisher: keine Schreibberechtigung).
 * @param {any} gespeicherterBetrieb @param {any} geschickterBetrieb @param {{ rolle: string, person?: any, demo?: boolean }} sitzung
 * @returns {null | { verweigert: string } | { mandant: any }}
 */
export function kiPauseDurchBetriebsrat(gespeicherterBetrieb, geschickterBetrieb, sitzung, o = {}) {
  if (!sitzung || sitzung.rolle !== "betriebsrat" || sitzung.demo === true) return null;
  if (!istObjekt(gespeicherterBetrieb) || !istObjekt(geschickterBetrieb)) return null;
  const altE = istObjekt(gespeicherterBetrieb.einstellungen) ? gespeicherterBetrieb.einstellungen : {};
  const neuE = istObjekt(geschickterBetrieb.einstellungen) ? geschickterBetrieb.einstellungen : null;
  if (!neuE || !hat(neuE, KI_FELD)) return null;
  const alt = kiSteuerungLesen(altE);
  const r = kiSteuerungAnwenden(alt, neuE[KI_FELD], sitzung, o.jetzt || new Date().toISOString());
  if ("grund" in r) return { verweigert: r.grund };
  if (!r.ereignisse.length) return null;
  if (r.ereignisse.some((x) => x.art !== "pause-gesetzt" && x.art !== "pause-aufgehoben"))
    return { verweigert: "Der Betriebsrat ändert an der Intelligence-Steuerung ausschließlich die Pause." };
  return { mandant: { ...gespeicherterBetrieb, einstellungen: { ...altE, [KI_FELD]: standFuerAblage(r.stand) } } };
}

/* ------------------------------------------------- Neuer Betrieb, Sicherung, Sicht */

/** Ein neu angelegter Betrieb bringt keine Steuerung mit — sie entsteht nur über den Schreibweg. */
export function kiSteuerungVerwerfen(m) {
  if (!istObjekt(m) || !istObjekt(m.einstellungen) || !hat(m.einstellungen, KI_FELD)) return m;
  const { [KI_FELD]: _weg, ...rest } = m.einstellungen; // eslint-disable-line no-unused-vars
  return { ...m, einstellungen: rest };
}

/**
 * Die Steuerung in der Sicht einer Rolle (server/lib/sicht.mjs).
 * Leitung, Planung, Kundenrolle: ganzer Stand samt Protokoll (sie gelangen über die Vollsicht dorthin, nicht hierher).
 * Betriebsrat: Stand und Protokoll ohne Personenkennung. Beschäftigte und Schichtverantwortung: nichts
 * (der Plan nennt für sie nichts; die Mitarbeiterinformation ist ein eigenes Paket).
 * @param {any} e einstellungen @param {string} rolle
 */
export function kiSteuerungSicht(e, rolle) {
  if (!istObjekt(e) || !hat(e, KI_FELD)) return e;
  const rest = Object.fromEntries(Object.entries(e).filter(([k]) => k !== KI_FELD));
  if (rolle !== "betriebsrat") return rest;
  const s2 = kiSteuerungLesen(e);
  if (!s2) return rest;
  const ohnePerson = (x) => (x ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== "vonPerson")) : x);
  return { ...rest, [KI_FELD]: standFuerAblage({
    betrieb: ohnePerson(s2.betrieb),
    funktionen: Object.fromEntries(Object.entries(s2.funktionen).map(([k, v]) => [k, ohnePerson(v)])),
    betriebsratFrage: ohnePerson(s2.betriebsratFrage), pause: ohnePerson(s2.pause),
    protokoll: s2.protokoll.map(ohnePerson) }) };
}

/**
 * Zeilen für das Betriebsprotokoll des Servers zu den neuen Einträgen — nur Art und Ziel, keine Person, kein Inhalt.
 * @param {any} altB @param {any} neuB
 * @returns {string[]}
 */
export function kiSteuerungProtokollZeilen(altB, neuB) {
  const betriebe = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter(istObjekt);
  const protokollVon = (m) => { const s = kiSteuerungLesen(istObjekt(m.einstellungen) ? m.einstellungen : null); return s ? s.protokoll : []; };
  const altP = new Map(betriebe(altB).map((m) => [m.id, new Set(protokollVon(m).map((x) => JSON.stringify(x)))]));
  const sauber = (x) => String(x || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 30);
  const zeilen = [];
  for (const m of betriebe(neuB)) {
    const bekannt = altP.get(m.id) || new Set();
    for (const x of protokollVon(m)) if (!bekannt.has(JSON.stringify(x))) zeilen.push(`${sauber(x.art)} ${sauber(x.ziel)} (${sauber(x.vonRolle)})`);
  }
  return zeilen;
}
