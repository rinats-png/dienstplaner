/* ==========================================================================
   PLANVORSCHLAG — KONTROLLIERTE ÜBERNAHME, KERN (WP-I7, Stufe 1)

   Reine Logik, OHNE Verdrahtung in Routen oder Oberfläche (eigener späterer Schritt nach Review). Aus einem Vorschlag des eigenen
   Planers (planer.mjs: planerEinstieg/planeVorschlag, Form `gesetzt[{ personId, datum, dienstId, art }]`) übernimmt die Planung
   ausdrücklich eine Teilmenge (Häkchen je Einteilung). Ergebnis sind nur Daten: ein Patch genau der gewählten Schlüssel, die Vorwerte
   für das Rückgängigmachen, ein Protokolleintrag ohne Person|Tag und die Änderungseinträge. Geschrieben, verschickt oder gespeichert
   wird hier nichts.

   Entscheidungen (verbindlich in dieser Stufe):
   - Rechte: nur Leitung und Planung mit `plan.edit.all` (rechte.mjs `darf`), nie Demo; Schichtverantwortung, Betriebsrat, Beschäftigte
     und die Altrolle „kunde“ nie (Muster wie darfAnheften, server/lib/anheften.mjs).
   - Keine Auto-Übernahme: auch im Modus „automatisch“ verlangt die Anwendung `kontext.bestaetigt === true` (Mensch hat bestätigt).
   - Freigabe des Planers wie im Einstieg (PLANER_AN bleibt AUS; `kontext.freigabe: true` nur in Prüfungen), Pause (auch unlesbar),
     Hauptschalter, Mitbestimmungsfrage, Planer-Schalter und Modus über dieselben Funktionen wie planerEinstieg (planerModusWirksam,
     kiPauseAktiv, kiPlanerEntscheidung) — ohne den Planer erneut zu rechnen (kein zweiter Planlauf, Budget unverändert).
   - Basis-Fingerprint (`vorschlagBasis`): Hash über den für die Übernahme relevanten Stand (Monat ± 31 Tage: Einteilungen, Anheftungen,
     Abwesenheiten; Personen, Dienste, Einheiten, Folge, Vorgaben, Einstellungen ohne Modulprotokoll inkl. Schalterstand). Weicht er
     ab, wird nichts übernommen (`seit-vorschlag-geaendert`). Nach außen nur der Hash.
   - Je Eintrag auf dem ECHTEN aktuellen Stand: Dienst und Person vorhanden, Person im Betrieb, nicht abwesend, Zielschlüssel ohne Dienst,
     nicht angeheftet (anheftungSperrt; unlesbare Karte = nichts), Lücke im Dienst besteht noch, keine Befunde ab Achtung und kein
     sperrender Befund (hindernisBefunde wie schutzSperre/befundeFuerEinteilung, Automatik: Muss ungeprüft = Achtung, „nicht bewertbar“
     nie erfüllt), danach die Nachprüfung des Planers (nachpruefen: Bestandspersonen, Vorwärts, Planbefunde) über die ganze Auswahl.
   - Atomar: ein fehlgeschlagener Eintrag lehnt die ganze Übernahme ab; die Liste nennt nur Indizes der Auswahl und Kennungen.
   - Anheftungen werden nie gelöst oder verändert: der Patch nennt nie `angeheftet` und nie einen angehefteten Schlüssel. Das gilt
     nur, wenn der spätere Schreibweg den Patch mit `patchAnwenden` allein auf `abweichungen` legt (eigene Server-Aktion) — läuft er
     über zusammenfuehren/anheftenZusammen, entscheiden dort andere Regeln (Aufheben bei Änderung); das ist nicht vorgesehen.
   - Rückwirkend nichts: Tage vor dem heutigen Betriebstag (betriebstag(jetzt), wie planungsreife „vergangen = vor heute“) und
     abgeschlossene Monate (monatAbgeschlossen, monatsabschluss.mjs) werden weder übernommen noch zurückgenommen.
   - Rohstand: ein vorhandener Wert in `abweichungen` außer „-“ (auch "" oder null) gilt als belegt; gefilterte Sichten
     (sichtEntwuerfe, sichtIstDaten) sind kein Betriebsstand.
   - Rückgängig stellt nur die gespeicherten Vorwerte genau dieser Schlüssel her und nur, solange sie seitdem unverändert sind.

   Rein und deterministisch: keine Uhr (Zeit aus `kontext.jetzt`, Tagesdatum der Regeln über mitTagesdatum), kein Zufall, keine Ablage;
   die Eingaben werden nie verändert; wirft nie (`{ ok: false, grund }`).
   ========================================================================== */
import { dim_, pad, addDays, between } from "../regelwerk.mjs";
import { betriebstag } from "../betriebszeit.mjs";
import { darf } from "../rechte.mjs";
import { kiPauseAktiv, kiSteuerungUnlesbar, kiPlanerEntscheidung } from "../ki-steuerung.mjs";
import { freigegebeneMonate } from "../planfreigabe.mjs";
import { monatAbgeschlossen, sha256Hex } from "../monatsabschluss.mjs";
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { PLANER_AN, planerModusWirksam, nachpruefen } from "./planer.mjs";
import { anheftungenLesen, anheftungSperrt, ANGEHEFTET_FELD } from "./anheften.mjs";
import { personTag, abwesenheitAm, besetzung } from "./plan.mjs";
import { hindernisBefunde, stufeRang } from "./einsatz.mjs";
import { mitTagesdatum } from "./zeit.mjs";

/** Rollen, die einen Vorschlag übernehmen dürfen (zusätzlich `plan.edit.all`, nie Demo). */
export const UEBERNAHME_ROLLEN = Object.freeze(["leitung", "planer"]);
/** Arten im Protokoll (Modul „planer“). */
export const UEBERNAHME_PROTOKOLL = Object.freeze({ uebernommen: "planer-uebernommen", rueckgaengig: "planer-rueckgaengig" });
/** Obergrenzen: Einträge je Übernahme (ein Monat × viele Personen), Fenster des Fingerprints in Tagen um den Monat. */
export const UEBERNAHME_GRENZE = Object.freeze({ eintraege: 2000, fensterTage: 31 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MONAT = /^\d{4}-\d{2}$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const nein = (grund, mehr) => ({ ok: false, grund, ...(mehr || {}) });

/** Gültiger Kalendermonat JJJJ-MM (2000–2100). */
const monatOk = (ym) => {
  if (typeof ym !== "string" || !MONAT.test(ym)) return false;
  const j = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
  return mo >= 1 && mo <= 12 && j >= 2000 && j <= 2100;
};
/** Gültiger Tag im Monat ym (auch 29.2. nur im Schaltjahr). */
const tagImMonat = (d, ym) => {
  if (typeof d !== "string" || !TAG.test(d) || d.slice(0, 7) !== ym) return false;
  const t = Number(d.slice(8, 10));
  return t >= 1 && t <= dim_(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1);
};
const zeitraumVon = (ym) => ({ von: `${ym}-01`, bis: `${ym}-${pad(dim_(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1))}` });
/** Kennung einer Person oder eines Dienstes: Text oder ganze Zahl, ohne Trenner „|“. */
const kennungOk = (x) => (typeof x === "string" && x.length > 0 && x.length <= 80 && !x.includes("|")) || (typeof x === "number" && Number.isInteger(x));

/** Stabile JSON-Form (Schlüssel sortiert), Grundlage des Fingerprints. */
function stabil(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return `[${x.map(stabil).join(",")}]`;
  return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}

/** Felder des Betriebs, die Regeln, Besetzung und Personentag tragen (ganz in den Fingerprint). */
const REGELFELDER = Object.freeze(["personen", "dienstarten", "einheiten", "zyklus", "vorgaben", "qualifikationen", "kompetenzen", "bundesland", "anker", "standorte", "belegung"]);

/**
 * Stabiler Fingerprint des für die Übernahme relevanten Stands eines Monats. Wird beim Erzeugen des Vorschlags als `vorschlag.basis`
 * gespeichert. Nach außen nur der Hash (keine Namen, keine Personendaten). Rein; wirft nie (unlesbarer Stand: null).
 * @param {any} m Betrieb @param {string} ym Monat JJJJ-MM
 * @returns {string | null}
 */
export function vorschlagBasis(m, ym) {
  try {
    if (!istObjekt(m) || !monatOk(ym)) return null;
    const z = zeitraumVon(ym);
    const von = addDays(z.von, -UEBERNAHME_GRENZE.fensterTage), bis = addDays(z.bis, UEBERNAHME_GRENZE.fensterTage);
    const imFenster = (k) => { const d = typeof k === "string" ? k.slice(-10) : ""; return TAG.test(d) && d >= von && d <= bis; };
    const ab = istObjekt(m.abweichungen) ? Object.fromEntries(Object.entries(m.abweichungen).filter(([k]) => imFenster(k))) : { _form: typeof m.abweichungen };
    const roh = hat(m, ANGEHEFTET_FELD) ? m[ANGEHEFTET_FELD] : undefined;
    const anh = roh === undefined ? null : istObjekt(roh) ? Object.fromEntries(Object.entries(roh).filter(([k]) => imFenster(k))) : { _unlesbar: stabil(roh) };
    const abw = Array.isArray(m.abwesenheiten)
      ? m.abwesenheiten.filter((a) => !istObjekt(a) || typeof a.von !== "string" || typeof a.bis !== "string" || (a.von <= bis && a.bis >= von)).map(stabil).sort()
      : { _form: typeof m.abwesenheiten };
    const einst = istObjekt(m.einstellungen) ? Object.fromEntries(Object.entries(m.einstellungen).filter(([k]) => k !== "modulprotokoll")) : { _form: stabil(m.einstellungen) };
    const regeln = {};
    for (const f of REGELFELDER) if (hat(m, f)) regeln[f] = m[f];
    for (const f of Object.keys(m).filter((k) => /schichtmodell/i.test(k))) regeln[f] = m[f];
    const text = stabil({ v: 1, ym, abweichungen: ab, angeheftet: anh, abwesenheiten: abw, einstellungen: einst, regeln });
    return `sha256:${sha256Hex(text)}`;
  } catch {
    return null;
  }
}

/** Darf die Rolle übernehmen bzw. rückgängig machen? Leitung/Planung mit plan.edit.all, nie Demo. `demo` muss ein echtes Boolean
    `false` sein (serverseitig aus der Sitzung gesetzt); fehlt es oder ist es kein Boolean: verweigert (fail closed). */
export function darfUebernehmen(kontext) {
  if (!istObjekt(kontext) || typeof kontext.demo !== "boolean" || kontext.demo || typeof kontext.rolle !== "string") return false;
  return UEBERNAHME_ROLLEN.includes(kontext.rolle) && darf(kontext.rolle, "plan.edit.all");
}

/** Planer-Freigabe wie im Einstieg (ohne Planlauf): null = frei, sonst die Kennung. */
function planerSperre(m, kontext) {
  if (!(PLANER_AN || kontext.freigabe === true)) return "planer-nicht-freigegeben";
  const e = m.einstellungen;
  let pause = true;
  try { pause = kiSteuerungUnlesbar(e) || kiPauseAktiv(e); } catch { pause = true; }
  if (pause) return "planer-pausiert";
  let code = "KI_EINGABE";
  try { code = kiPlanerEntscheidung(e); } catch { code = "KI_EINGABE"; }
  if (code === "KI_PAUSIERT") return "planer-pausiert";
  if (code !== "OK") return "planer-im-betrieb-aus";
  let modus = "aus";
  try { modus = planerModusWirksam(e, true); } catch { modus = "aus"; }
  return modus === "knopfdruck" || modus === "automatisch" ? null : "planer-im-betrieb-aus";
}

/** Zeit des Kontexts (ISO); null, wenn ungültig. */
const zeitAus = (kontext) => {
  if (!istObjekt(kontext) || typeof kontext.jetzt !== "string" || kontext.jetzt.length > 40) return null;
  const t = new Date(kontext.jetzt);
  return Number.isFinite(t.getTime()) ? t : null;
};

/** Gemeinsame Vorprüfung: Rolle, Zeit, Betrieb, Monat. null = in Ordnung. */
function vorpruefung(m, ym, kontext) {
  if (!darfUebernehmen(kontext)) return "keine-berechtigung";
  if (!zeitAus(kontext)) return "zeit-ungueltig";
  if (!istObjekt(m) || !Array.isArray(m.personen) || !Array.isArray(m.dienstarten) || !istObjekt(m.abweichungen)) return "betrieb-ungueltig";
  /* Eine gefilterte Sicht (Entwürfe ausgeblendet, Ist-Daten gekürzt) ist kein Betriebsstand: darauf wird nichts geprüft. */
  if (hat(m, "sichtEntwuerfe") || hat(m, "sichtIstDaten")) return "betrieb-ungueltig";
  if (!monatOk(ym)) return "monat-ungueltig";
  if (monatAbgeschlossen(m, ym)) return "monat-abgeschlossen";
  return null;
}

/** Liegt der Tag vor dem heutigen Betriebstag (Europe/Berlin aus kontext.jetzt)? Heute selbst ist nicht vergangen (planungsreife). */
const vergangen = (d, kontext) => d < betriebstag(/** @type {Date} */ (zeitAus(kontext)));

/** Auswahl lesen: jede Einteilung genau einmal, aus dem Vorschlag, im Monat. */
function auswahlLesen(ym, vorschlag, auswahl) {
  if (!istObjekt(vorschlag) || vorschlag.status !== "ok" || vorschlag.ym !== ym || !Array.isArray(vorschlag.gesetzt)) return { grund: "vorschlag-ungueltig" };
  if (typeof vorschlag.basis !== "string" || !vorschlag.basis.startsWith("sha256:")) return { grund: "vorschlag-ohne-basis" };
  if (!Array.isArray(auswahl)) return { grund: "auswahl-ungueltig" };
  if (!auswahl.length) return { grund: "auswahl-leer" };
  if (auswahl.length > UEBERNAHME_GRENZE.eintraege || vorschlag.gesetzt.length > UEBERNAHME_GRENZE.eintraege) return { grund: "auswahl-zu-gross" };
  const imVorschlag = new Set();
  for (const g of vorschlag.gesetzt) if (istObjekt(g) && kennungOk(g.personId) && kennungOk(g.dienstId) && tagImMonat(g.datum, ym)) imVorschlag.add(`${g.personId}|${g.datum}|${g.dienstId}`);
  const schl = new Set(), eintraege = [];
  for (const a of auswahl) {
    if (!istObjekt(a) || !kennungOk(a.personId) || !kennungOk(a.dienstId) || !tagImMonat(a.datum, ym)) return { grund: "auswahl-ungueltig" };
    const k = `${a.personId}|${a.datum}`;
    if (schl.has(k)) return { grund: "auswahl-doppelt" };
    if (!imVorschlag.has(`${k}|${a.dienstId}`)) return { grund: "auswahl-nicht-im-vorschlag" };
    schl.add(k);
    eintraege.push({ personId: a.personId, datum: a.datum, dienstId: a.dienstId, schluessel: k });
  }
  return { eintraege };
}

/**
 * Prüft eine Übernahme, fail-closed, in dieser Reihenfolge: Rolle/Recht, Planer-Freigabe (Schalter, Pause, Modus), Eingaben,
 * Anheftungen lesbar, bereits übernommen, Basis-Fingerprint, je Eintrag auf dem echten aktuellen Stand, Nachprüfung der ganzen Auswahl.
 * @param {any} m aktueller Betrieb @param {string} ym @param {any} vorschlag Ergebnis des Planers mit `basis`
 * @param {{ personId: any, datum: string, dienstId: any }[]} auswahl Teilmenge von vorschlag.gesetzt
 * @param {{ rolle: string, demo?: boolean, jetzt: string, freigabe?: boolean, bestaetigt?: boolean }} kontext
 * @returns {{ ok: true, eintraege: any[], vorwerte: Record<string, string | null> } | { ok: false, grund: string, abgelehnt?: { index: number, grund: string, regeln?: string[] }[] }}
 */
export function uebernahmePruefen(m, ym, vorschlag, auswahl, kontext) {
  try {
    const v = vorpruefung(m, ym, kontext);
    if (v) return nein(v);
    const sperre = planerSperre(m, kontext);
    if (sperre) return nein(sperre);
    const a = auswahlLesen(ym, vorschlag, auswahl);
    if (a.grund) return nein(a.grund);
    const anh = anheftungenLesen(m);
    if (!anh.ok) return nein("anheftungen-unlesbar");
    const ab = m.abweichungen;
    if (a.eintraege.every((e) => hat(ab, e.schluessel) && ab[e.schluessel] === e.dienstId)) return nein("bereits-uebernommen");
    const basis = vorschlagBasis(m, ym);
    if (!basis || basis !== vorschlag.basis) return nein("seit-vorschlag-geaendert");

    const tag = betriebstag(zeitAus(kontext));
    return mitTagesdatum(tag, () => {
      const abgelehnt = [];
      const vorwerte = {};
      /* Stand mit der ganzen Auswahl (nur die gewählten Schlüssel ändern sich). */
      const neuAb = { ...ab };
      for (const e of a.eintraege) neuAb[e.schluessel] = e.dienstId;
      const stand = { ...m, abweichungen: neuAb };
      const budget = neuesVorgabenBudget();
      const opt = { vorgabenBudget: budget, vorgabenAutomatisch: true };
      a.eintraege.forEach((e, index) => {
        const p = m.personen.find((x) => x && x.id === e.personId);
        const da = m.dienstarten.find((x) => x && x.id === e.dienstId);
        const weg = (grund, regeln) => abgelehnt.push({ index, grund, ...(regeln ? { regeln } : {}) });
        if (vergangen(e.datum, kontext)) return weg("vergangen");
        if (!da) return weg("dienst-unbekannt");
        if (!p) return weg("person-unbekannt");
        const jetztTag = personTag(m, p, e.datum);
        if (jetztTag.quelle === "extern") return weg("nicht-im-dienst");
        if (abwesenheitAm(m, p.id, e.datum)) return weg("abwesend");
        if (anheftungSperrt(anh, p.id, e.datum)) return weg("angeheftet");
        /* Rohstand: nur „kein Eintrag“ oder ausdrücklich „-“ ist frei; "" / null / sonstige Werte gelten als belegt. */
        if (jetztTag.dienstId || (hat(ab, e.schluessel) && ab[e.schluessel] !== "-")) return weg("schluessel-belegt");
        vorwerte[e.schluessel] = hat(ab, e.schluessel) ? ab[e.schluessel] : null;
        /* Stand ohne diesen Eintrag (übrige Auswahl bleibt): Lücke muss noch bestehen, keine harte Regel. */
        const ohneAb = { ...neuAb };
        if (hat(ab, e.schluessel)) ohneAb[e.schluessel] = ab[e.schluessel]; else delete ohneAb[e.schluessel];
        const ohne = { ...m, abweichungen: ohneAb };
        const b = besetzung(ohne, e.datum)[da.id];
        if (!b || !(b.diff < 0 || b.qualFehlt)) return weg("keine-luecke");
        const harte = hindernisBefunde(ohne, p, e.datum, da, opt).filter((x) => x.sperrt || stufeRang(x.stufe) >= 2);
        if (harte.length) return weg("regel", [...new Set(harte.map((x) => String(x.regel)))].sort());
      });
      if (abgelehnt.length) return nein("eintrag-abgelehnt", { abgelehnt });
      /* Nachprüfung des Planers über die ganze Auswahl (Bestandspersonen/Posten, Vorwärts, Planbefunde, Anheften). */
      const n = nachpruefen(m, stand, a.eintraege.map(({ personId, datum, dienstId }) => ({ personId, datum, dienstId })), neuesVorgabenBudget());
      if (!n.durch) return nein("nachpruefung-nicht-bestanden", { abgelehnt: [] });
      return { ok: true, eintraege: a.eintraege.map(({ personId, datum, dienstId }) => ({ personId, datum, dienstId })), vorwerte };
    });
  } catch {
    return nein("pruefung-fehlgeschlagen");
  }
}

/** Kurze, deterministische Kennung eines Änderungseintrags (kein Zufall, keine Uhr). */
const kennung = (praefix, ...teile) => `${praefix}${sha256Hex(teile.join("\u0000")).slice(0, 16)}`;
/** Zeit wie in den bestehenden Änderungseinträgen (de-DE, Europe/Berlin). */
const zeitText = (t) => t.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

/**
 * Wendet eine geprüfte Übernahme an — als Daten. Verlangt die ausdrückliche Bestätigung eines Menschen (`kontext.bestaetigt === true`),
 * auch im Modus „automatisch“. Rein; wirft nie; die Eingaben bleiben unverändert.
 * @returns {{ ok: true, patch: { abweichungen: Record<string, any> }, rueckgaengig: any, protokoll: any, aenderungen: any[], mitteilungen: any }
 *   | { ok: false, grund: string, abgelehnt?: any[] }}
 */
export function uebernahmeAnwenden(m, ym, vorschlag, auswahl, kontext) {
  try {
    if (!darfUebernehmen(kontext)) return nein("keine-berechtigung");
    if (kontext.bestaetigt !== true) return nein("bestaetigung-fehlt");
    /** @type {any} */
    const p = uebernahmePruefen(m, ym, vorschlag, auswahl, kontext);
    if (!p.ok) return p;
    const t = zeitAus(kontext);
    const heute = betriebstag(t);
    const patch = { abweichungen: {} };
    const eintraege = [];
    const aenderungen = [];
    for (const e of p.eintraege) {
      const k = `${e.personId}|${e.datum}`;
      patch.abweichungen[k] = e.dienstId;
      eintraege.push({ schluessel: k, vorher: p.vorwerte[k], nachher: e.dienstId });
      aenderungen.push({ id: kennung("c-pu-", vorschlag.basis, kontext.jetzt, k, String(e.dienstId)), personId: e.personId, datum: e.datum, von: "-", nach: e.dienstId,
        zeit: zeitText(t), vorlauf: between(heute, e.datum), quelle: "planer" });
    }
    const tage = p.eintraege.map((e) => e.datum).sort();
    const personen = new Set(p.eintraege.map((e) => String(e.personId)));
    return {
      ok: true,
      patch,
      rueckgaengig: { art: "planer-uebernahme", ym, basis: vorschlag.basis, am: kontext.jetzt, eintraege },
      protokoll: { modul: "planer", art: UEBERNAHME_PROTOKOLL.uebernommen, am: kontext.jetzt, von: kontext.rolle, anzahl: eintraege.length, zeitraum: { von: tage[0], bis: tage[tage.length - 1] } },
      aenderungen,
      /* Nur ein Hinweis als Daten: ob Beschäftigte benachrichtigt werden, entscheidet der Betreiber (offen); hier wird nichts verschickt. */
      mitteilungen: { versandt: false, planFreigegeben: freigegebeneMonate(m).has(ym), betroffenePersonen: personen.size },
    };
  } catch {
    return nein("anwendung-fehlgeschlagen");
  }
}

/** Namen, die als Schlüssel eines einfachen Objekts nie geschrieben werden (Prototyp). */
const VERBOTEN = new Set(["__proto__", "constructor", "prototype"]);
/** Schlüsselform „Person|JJJJ-MM-TT“ (Person: Kennung ohne „|“, kein Prototyp-Name; Tag gültig; ym wahlweise). */
function schluesselOk(k, ym) {
  if (typeof k !== "string" || k.length > 100) return false;
  const i = k.indexOf("|");
  if (i < 1 || k.lastIndexOf("|") !== i) return false;
  const person = k.slice(0, i), d = k.slice(i + 1);
  if (!kennungOk(person) || VERBOTEN.has(person) || !TAG.test(d) || !monatOk(d.slice(0, 7))) return false;
  return tagImMonat(d, ym === undefined ? d.slice(0, 7) : ym);
}

/** Rückgängig-Daten lesen: Vorwert nur „kein Eintrag“ (null) oder „-“ — mehr kann eine Übernahme nie überschrieben haben. */
function rueckLesen(ym, r) {
  if (!istObjekt(r) || r.art !== "planer-uebernahme" || r.ym !== ym || !Array.isArray(r.eintraege) || !r.eintraege.length || r.eintraege.length > UEBERNAHME_GRENZE.eintraege) return null;
  const schl = new Set();
  for (const e of r.eintraege) {
    if (!istObjekt(e) || !schluesselOk(e.schluessel, ym) || schl.has(e.schluessel)) return null;
    if (!(e.vorher === null || e.vorher === "-")) return null;
    if (!kennungOk(e.nachher) || e.nachher === "-") return null;
    schl.add(e.schluessel);
  }
  return r.eintraege;
}

/**
 * Prüft das Rückgängigmachen einer Übernahme: gleiche Rechteprüfung; nur, wenn jeder Schlüssel seitdem unverändert ist (sonst
 * `seit-uebernahme-geaendert`) und keiner inzwischen angeheftet wurde (Anheftungen werden nie still gelöst). Atomar.
 * @param {any} m @param {string} ym @param {any} rueckgaengig aus uebernahmeAnwenden @param {any} kontext
 */
export function rueckgaengigPruefen(m, ym, rueckgaengig, kontext) {
  try {
    const v = vorpruefung(m, ym, kontext);
    if (v) return nein(v);
    const eintraege = rueckLesen(ym, rueckgaengig);
    if (!eintraege) return nein("rueckgaengig-ungueltig");
    const anh = anheftungenLesen(m);
    if (!anh.ok) return nein("anheftungen-unlesbar");
    const ab = m.abweichungen;
    const jetzt = (k) => (hat(ab, k) ? ab[k] : null);
    if (eintraege.every((e) => jetzt(e.schluessel) === e.vorher)) return nein("bereits-rueckgaengig");
    const abgelehnt = [];
    eintraege.forEach((e, index) => {
      if (vergangen(e.schluessel.slice(-10), kontext)) abgelehnt.push({ index, grund: "vergangen" });
      else if (jetzt(e.schluessel) !== e.nachher) abgelehnt.push({ index, grund: "seit-uebernahme-geaendert" });
      else if (anh.aktiv.has(e.schluessel)) abgelehnt.push({ index, grund: "angeheftet" });
    });
    if (abgelehnt.length) return nein("eintrag-abgelehnt", { abgelehnt });
    return { ok: true, eintraege: eintraege.map((e) => ({ schluessel: e.schluessel, vorher: e.vorher, nachher: e.nachher })) };
  } catch {
    return nein("pruefung-fehlgeschlagen");
  }
}

/**
 * Macht eine Übernahme rückgängig — als Daten (Patch: Vorwert oder null = Schlüssel entfernen). Verlangt die Bestätigung.
 * @returns {{ ok: true, patch: { abweichungen: Record<string, any> }, protokoll: any, aenderungen: any[] } | { ok: false, grund: string, abgelehnt?: any[] }}
 */
export function rueckgaengigAnwenden(m, ym, rueckgaengig, kontext) {
  try {
    if (!darfUebernehmen(kontext)) return nein("keine-berechtigung");
    if (kontext.bestaetigt !== true) return nein("bestaetigung-fehlt");
    const p = rueckgaengigPruefen(m, ym, rueckgaengig, kontext);
    if (!p.ok) return p;
    const t = zeitAus(kontext);
    const heute = betriebstag(t);
    const patch = { abweichungen: {} };
    const aenderungen = [];
    for (const e of p.eintraege) {
      patch.abweichungen[e.schluessel] = e.vorher;
      const i = e.schluessel.lastIndexOf("|");
      const datum = e.schluessel.slice(i + 1);
      const roh = e.schluessel.slice(0, i);
      const person = (m.personen.find((x) => x && String(x.id) === roh) || { id: roh }).id;
      aenderungen.push({ id: kennung("c-pr-", rueckgaengig.basis || "", kontext.jetzt, e.schluessel), personId: person, datum, von: e.nachher, nach: e.vorher === null ? "-" : e.vorher,
        zeit: zeitText(t), vorlauf: between(heute, datum), quelle: "planer-rueckgaengig" });
    }
    const tage = p.eintraege.map((e) => e.schluessel.slice(-10)).sort();
    return { ok: true, patch,
      protokoll: { modul: "planer", art: UEBERNAHME_PROTOKOLL.rueckgaengig, am: kontext.jetzt, von: kontext.rolle, anzahl: p.eintraege.length, zeitraum: { von: tage[0], bis: tage[tage.length - 1] } },
      aenderungen };
  } catch {
    return nein("anwendung-fehlgeschlagen");
  }
}

/**
 * Wendet einen Patch auf eine KOPIE an: nur die genannten Schlüssel von `abweichungen` (null = entfernen), alles andere unverändert
 * (nie Komplettüberschreiben). Für Prüfungen und den späteren Schreibweg (eigene Server-Aktion). Rein; wirft nie. Schlüssel nur in der
 * Form „Person|JJJJ-MM-TT“ (keine Prototyp-Namen), Werte nur Kennung, „-“ oder null; sonst wird nichts angewendet.
 * @param {any} m @param {{ abweichungen: Record<string, any> }} patch
 * @returns {{ ok: true, mandant: any } | { ok: false, grund: string }}
 */
export function patchAnwenden(m, patch) {
  try {
    if (!istObjekt(m) || !istObjekt(m.abweichungen)) return nein("betrieb-ungueltig");
    if (!istObjekt(patch) || !istObjekt(patch.abweichungen) || Object.keys(patch).some((k) => k !== "abweichungen")) return nein("patch-ungueltig");
    const e = Object.entries(patch.abweichungen);
    if (!e.length || e.length > UEBERNAHME_GRENZE.eintraege) return nein("patch-ungueltig");
    for (const [k, w] of e) if (!schluesselOk(k) || !(w === null || kennungOk(w))) return nein("patch-ungueltig");
    const ab = { ...m.abweichungen };
    for (const [k, w] of e) {
      if (w === null) delete ab[k];
      else Object.defineProperty(ab, k, { value: w, enumerable: true, writable: true, configurable: true });
    }
    return { ok: true, mandant: { ...m, abweichungen: ab } };
  } catch {
    return nein("patch-ungueltig");
  }
}
