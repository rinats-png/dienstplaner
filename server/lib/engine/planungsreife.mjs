/* ==========================================================================
   PLANUNGSREIFE (WP-I6)

   „Kann für diesen Zeitraum ein Plan aufgestellt werden?" — die Prüfliste aus
   PLAN-WARNEN-VORGABEN-PLANVORSCHLAG 7.3. Rein: keine Ablage, keine Uhr (das
   Tagesdatum kommt vom Aufrufer), kein Zufall, kein Sprachmodell, kein Netz.
   Die Eingaben werden nie verändert.

   Ort: server/lib/engine/ (AD-06: das Docker-Bild enthält src/ nicht);
   src/engine/planungsreife.js reicht weiter.

   Eingabe  daten    ein Betriebsbestand mit den Feldern des Mandanten
                     (src/App.jsx, Kopfkommentar „Datenbestand"): personen,
                     qualifikationen, dienstarten, abwesenheiten, freigaben,
                     optional vorgaben (Regelobjekte), wuensche, zyklus.
            optionen { von, bis }            Planungszeitraum (JJJJ-MM-TT)
                     { heute? }              Tagesdatum; ohne dieses wird
                                             „liegt in der Vergangenheit" nicht geprüft
                     { schichtsystemGenutzt? } verlangt dann einen Zyklus
                     { einheitId? }          nur diese Einheit
   Ausgabe  { urteil, bereit, zeitraum, punkte[], luecken[], gruende[], zaehler }

   Urteil
     nicht_bereit          mindestens ein Pflichtpunkt hat eine Lücke
     bereit_mit_hinweisen  alle Pflichtpunkte erfüllt, aber ein Hinweis (z. B. keine Vorgaben)
     bereit                nichts zu beanstanden

   Jeder Punkt: { id, titel, pflicht, status: "ok"|"fehlt"|"hinweis", luecken: [{ text, ids }] }
   Die Texte nennen Zahlen und Fachwörter, nie Namen („Bei 3 Personen fehlen
   die Vertragsstunden."); `ids` sind Kennungen (Personen, Dienstarten), die
   die Oberfläche selbst auflöst. Nichts davon gehört in Server-Logs.

   Nicht erfundene Regeln: Was fehlt, ist an den Feldern des Bestands
   gemessen (fehlt ein Feld, ist es leer oder ungültig). Es gibt keine
   fachliche Mindestgröße; Fachfragen: docs/acc45/wp-i3-i6-fragen.md.
   ========================================================================== */
import { addDays, iso, pISO } from "../regelwerk.mjs";
import { REGELARTEN_ALLE } from "../regelbaukasten-erweitert.mjs";

export const PLANUNGSREIFE_VERSION = "planungsreife-0.1";

/** Die acht Punkte der Prüfliste (Plan 7.3) plus der bedingte neunte. */
export const REIFE_PUNKTE = Object.freeze([
  "personal", "vertragsstunden", "qualifikationen", "abwesenheiten", "dienstarten", "bedarf", "vorgaben", "zeitraum",
]);

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const istTag = (s) => typeof s === "string" && ISO_TAG.test(s) && iso(pISO(s)) === s;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const zahl = (x) => typeof x === "number" && Number.isFinite(x);
const liste = (x) => (Array.isArray(x) ? x : null);
const MAX_TAGE = 400;
const BEDARFSFELDER = ["mo_do", "fr", "sa", "so"];

/** Anzahl + Nomen im richtigen Numerus: „1 Person", „3 Personen". */
const n = (k, eins, viele) => `${k} ${k === 1 ? eins : viele}`;

function punkt(id, titel, pflicht) {
  return { id, titel, pflicht, status: "ok", luecken: [] };
}
function luecke(p, text, ids = [], hinweis = false) {
  p.luecken.push({ text, ids: [...ids].sort(), hinweis });
  if (hinweis) { if (p.status === "ok") p.status = "hinweis"; } else p.status = "fehlt";
}

/** Monate (JJJJ-MM) zwischen von und bis, beide eingeschlossen. */
function monate(von, bis) {
  const aus = [];
  let y = Number(von.slice(0, 4)), m = Number(von.slice(5, 7));
  const yb = Number(bis.slice(0, 4)), mb = Number(bis.slice(5, 7));
  while (y < yb || (y === yb && m <= mb)) {
    aus.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return aus;
}

/** Einheit der Person am Stichtag (letzter Eintrag mit ab <= Stichtag), sonst der erste. */
function einheitDerPerson(p, tag) {
  const z = liste(p.zugehoerigkeit);
  if (z && z.length) {
    const bis = z.filter((e) => e && typeof e.ab === "string" && e.ab <= tag).sort((a, b) => (a.ab < b.ab ? -1 : 1));
    const e = bis.length ? bis[bis.length - 1] : z[0];
    return e && e.einheitId ? e.einheitId : null;
  }
  return null;
}

/**
 * Prüft, ob ein Plan für den Zeitraum aufgestellt werden kann.
 * @param {any} daten Betriebsbestand (wird nicht verändert)
 * @param {{von:string, bis:string, heute?:string, schichtsystemGenutzt?:boolean, einheitId?:string}} optionen
 */
export function planungsreife(daten, optionen = {}) {
  const o = optionen || {};
  const p = {
    zeitraum: punkt("zeitraum", "Planungszeitraum offen und ohne freigegebenen Plan", true),
    personal: punkt("personal", "Personen mit Eintritt und Einheit", true),
    vertragsstunden: punkt("vertragsstunden", "Vertragsstunden", true),
    qualifikationen: punkt("qualifikationen", "Qualifikationen und Einsatzeinschränkungen", true),
    abwesenheiten: punkt("abwesenheiten", "Abwesenheiten und Urlaub im Zeitraum", true),
    dienstarten: punkt("dienstarten", "Dienstarten mit Zeiten", true),
    bedarf: punkt("bedarf", "Besetzungsbedarf je Dienst und Tag", true),
    vorgaben: punkt("vorgaben", "Interne Vorgaben und Wünsche", true),
  };
  const zaehler = { personen: 0, dienstarten: 0, abwesenheiten: 0, vorgaben: 0, tage: 0, monate: 0 };
  const fertig = (zeitraum) => {
    const punkte = [p.personal, p.vertragsstunden, p.qualifikationen, p.abwesenheiten, p.dienstarten, p.bedarf, p.vorgaben, p.zeitraum];
    if (p.schichtsystem) punkte.splice(6, 0, p.schichtsystem);
    const fehlt = punkte.some((x) => x.pflicht && x.status === "fehlt");
    const hinweis = punkte.some((x) => x.status === "hinweis");
    const urteil = fehlt ? "nicht_bereit" : hinweis ? "bereit_mit_hinweisen" : "bereit";
    const luecken = punkte.flatMap((x) => x.luecken.map((l) => ({ punkt: x.id, text: l.text, ids: l.ids, hinweis: l.hinweis })));
    return {
      version: PLANUNGSREIFE_VERSION, urteil, bereit: urteil !== "nicht_bereit", zeitraum, punkte,
      luecken, gruende: luecken.map((l) => l.text), zaehler,
    };
  };

  /* --- Zeitraum und Bestand --------------------------------------------- */
  if (!daten || typeof daten !== "object") { luecke(p.zeitraum, "Es liegen keine Betriebsdaten vor."); return fertig(null); }
  if (!istTag(o.von) || !istTag(o.bis) || o.von > o.bis) {
    luecke(p.zeitraum, "Der Planungszeitraum fehlt oder ist ungültig.");
    return fertig(null);
  }
  let tage = 0;
  for (let d = o.von; d <= o.bis && tage <= MAX_TAGE; d = addDays(d, 1)) tage++;
  if (tage > MAX_TAGE) { luecke(p.zeitraum, `Der Planungszeitraum ist länger als ${MAX_TAGE} Tage.`); return fertig({ von: o.von, bis: o.bis }); }
  const zeitraum = { von: o.von, bis: o.bis };
  zaehler.tage = tage;
  const ms = monate(o.von, o.bis);
  zaehler.monate = ms.length;

  /* 8 Zeitraum: nicht vergangen, kein freigegebener Plan */
  if (o.heute !== undefined) {
    if (!istTag(o.heute)) luecke(p.zeitraum, "Das Tagesdatum ist ungültig.");
    else if (o.bis < o.heute) luecke(p.zeitraum, "Der Planungszeitraum liegt vollständig in der Vergangenheit.");
  }
  const freigaben = daten.freigaben && typeof daten.freigaben === "object" ? daten.freigaben : {};
  const frei = ms.filter((ym) => Object.prototype.hasOwnProperty.call(freigaben, ym) && freigaben[ym]);
  if (frei.length) luecke(p.zeitraum, `Für ${n(frei.length, "Monat", "Monate")} des Zeitraums liegt schon ein freigegebener Plan vor.`, frei);

  /* 1 Personal */
  const personenRoh = liste(daten.personen);
  if (!personenRoh) luecke(p.personal, "Die Personenliste fehlt.");
  const alle = (personenRoh || []).filter((x) => x && typeof x === "object");
  const planbar = alle.filter((x) => {
    if (x.status === "gesperrt" || x.imSchichtdienst === false) return false;
    if (istTag(x.austritt) && x.austritt < o.von) return false;
    if (istTag(x.eintritt) && x.eintritt > o.bis) return false;
    if (o.einheitId && einheitDerPerson(x, o.bis) !== o.einheitId && x.bereich !== o.einheitId) return false;
    return true;
  });
  zaehler.personen = planbar.length;
  if (personenRoh && !planbar.length) luecke(p.personal, "Im Planungszeitraum ist keine Person einsetzbar.");
  const idsOhne = (f) => planbar.filter(f).map((x) => String(x.id ?? "?"));
  const ohneEintritt = idsOhne((x) => !istTag(x.eintritt));
  if (ohneEintritt.length) luecke(p.personal, `Bei ${n(ohneEintritt.length, "Person", "Personen")} fehlt der Eintritt.`, ohneEintritt);
  const ohneEinheit = idsOhne((x) => !einheitDerPerson(x, o.bis) && !x.bereich);
  if (ohneEinheit.length) luecke(p.personal, `Bei ${n(ohneEinheit.length, "Person", "Personen")} fehlt die Einheit.`, ohneEinheit);

  /* 2 Vertragsstunden */
  const ohneStunden = idsOhne((x) => !zahl(x.wochenstunden) || x.wochenstunden <= 0);
  if (ohneStunden.length) luecke(p.vertragsstunden, `Bei ${n(ohneStunden.length, "Person", "Personen")} fehlen die Vertragsstunden.`, ohneStunden);

  /* 5 Dienstarten */
  const dienstRoh = liste(daten.dienstarten);
  const dienste = (dienstRoh || []).filter((d) => d && typeof d === "object");
  zaehler.dienstarten = dienste.length;
  if (!dienstRoh || !dienste.length) luecke(p.dienstarten, "Es sind keine Dienstarten angelegt.");
  const ohneZeit = dienste.filter((d) => !(typeof d.start === "string" && ZEIT.test(d.start) && typeof d.ende === "string" && ZEIT.test(d.ende)))
    .map((d) => String(d.id ?? "?"));
  if (ohneZeit.length) luecke(p.dienstarten, `Bei ${n(ohneZeit.length, "Dienstart", "Dienstarten")} fehlen die Zeiten.`, ohneZeit);
  if (o.schichtsystemGenutzt) {
    p.schichtsystem = punkt("schichtsystem", "Schichtsystem oder Schichtfolge", true);
    const z = daten.zyklus;
    if (!z || !liste(z.tage) || !z.tage.length || !(Number(z.wochen) >= 1)) luecke(p.schichtsystem, "Das Schichtsystem ist nicht festgelegt.");
  }

  /* 6 Bedarf */
  const bedarfDienste = dienste.filter((d) => !d.posten);
  const ohneBedarf = bedarfDienste.filter((d) => !d.mindest || typeof d.mindest !== "object" || BEDARFSFELDER.some((f) => !zahl(d.mindest[f]) || d.mindest[f] < 0))
    .map((d) => String(d.id ?? "?"));
  if (ohneBedarf.length) luecke(p.bedarf, `Bei ${n(ohneBedarf.length, "Dienstart", "Dienstarten")} fehlt der Besetzungsbedarf.`, ohneBedarf);
  else if (dienste.length && !dienste.some((d) => d.mindest && BEDARFSFELDER.some((f) => zahl(d.mindest[f]) && d.mindest[f] > 0)))
    luecke(p.bedarf, "Der Besetzungsbedarf ist für alle Dienstarten null.", [], true);

  /* 3 Qualifikationen */
  const quals = new Map((liste(daten.qualifikationen) || []).filter((q) => q && q.id !== undefined).map((q) => [q.id, q]));
  const verlangt = new Map(); // qualId → höchster geforderter Wert je Dienst
  for (const d of dienste) {
    if (!d.mindestQual || typeof d.mindestQual !== "object") continue;
    for (const [qid, k] of Object.entries(d.mindestQual)) if (zahl(k) && k > 0) verlangt.set(qid, Math.max(verlangt.get(qid) || 0, k));
  }
  const ohneQualAngabe = idsOhne((x) => !Array.isArray(x.qualifikationen));
  if (ohneQualAngabe.length) {
    const text = `Bei ${n(ohneQualAngabe.length, "Person", "Personen")} sind die Qualifikationen nicht erfasst.`;
    luecke(p.qualifikationen, text, ohneQualAngabe, !verlangt.size); // Pflicht nur, wenn Dienste Qualifikationen verlangen
  }
  for (const [qid, k] of [...verlangt.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const traeger = planbar.filter((x) => Array.isArray(x.qualifikationen) && x.qualifikationen.includes(qid)).map((x) => String(x.id ?? "?"));
    const bez = quals.has(qid) && quals.get(qid).name ? quals.get(qid).name : qid;
    if (!quals.has(qid)) luecke(p.qualifikationen, `Die geforderte Qualifikation „${bez}“ ist nicht angelegt.`, [qid]);
    else if (traeger.length < k) luecke(p.qualifikationen, `Für „${bez}“ gibt es ${n(traeger.length, "Person", "Personen")}, je Dienst werden ${k} gebraucht.`, traeger);
  }

  /* 4 Abwesenheiten */
  const abwRoh = liste(daten.abwesenheiten);
  if (!abwRoh) luecke(p.abwesenheiten, "Die Abwesenheiten sind nicht erfasst.");
  const idsAlle = new Set(alle.map((x) => x.id));
  const kaputt = [];
  let imZeitraum = 0;
  (abwRoh || []).forEach((a, i) => {
    const gut = a && typeof a === "object" && istTag(a.von) && istTag(a.bis) && a.von <= a.bis && idsAlle.has(a.personId);
    if (!gut) { kaputt.push(String(a && a.id !== undefined ? a.id : `#${i}`)); return; }
    if (a.von <= o.bis && a.bis >= o.von) imZeitraum++;
  });
  zaehler.abwesenheiten = imZeitraum;
  if (kaputt.length) luecke(p.abwesenheiten, `${n(kaputt.length, "Abwesenheit ist", "Abwesenheiten sind")} unvollständig oder ohne bekannte Person.`, kaputt);

  /* 7 Vorgaben und Wünsche (fehlen ist ein Hinweis, kaputt ist eine Lücke) */
  const vorRoh = daten.vorgaben === undefined ? undefined : liste(daten.vorgaben);
  if (vorRoh === undefined) luecke(p.vorgaben, "Es sind keine internen Vorgaben hinterlegt.", [], true);
  else if (vorRoh === null) luecke(p.vorgaben, "Die internen Vorgaben sind nicht lesbar.");
  else {
    zaehler.vorgaben = vorRoh.length;
    const schlecht = vorRoh.filter((v) => !v || typeof v !== "object" || !REGELARTEN_ALLE.includes(v.typ) || !v.parameter || typeof v.parameter !== "object" || !Object.keys(v.parameter).length)
      .map((v, i) => String(v && v.id !== undefined ? v.id : `#${i}`));
    if (schlecht.length) luecke(p.vorgaben, `${n(schlecht.length, "Vorgabe ist", "Vorgaben sind")} unvollständig.`, schlecht);
  }
  if (daten.wuensche !== undefined && !liste(daten.wuensche)) luecke(p.vorgaben, "Die Wünsche sind nicht lesbar.");

  return fertig(zeitraum);
}

/**
 * Darf jetzt ein Vorschlag gerechnet werden? (Plan 7.3: automatisch / nur auf
 * Knopfdruck / aus.) Ein nicht planungsreifer Bestand wird nie gerechnet.
 * @param {{urteil?:string}} reife Ergebnis von planungsreife()
 * @param {"automatisch"|"knopfdruck"|"aus"} modus
 * @param {boolean} [knopf] Die Planung hat „Vorschlag erstellen" gedrückt
 * @returns {{erlaubt:boolean, grund:string}}
 */
export function vorschlagErlaubt(reife, modus, knopf = false) {
  if (!reife || !["nicht_bereit", "bereit", "bereit_mit_hinweisen"].includes(reife.urteil)) return { erlaubt: false, grund: "keine_pruefung" };
  if (modus === "aus") return { erlaubt: false, grund: "aus" };
  if (reife.urteil === "nicht_bereit") return { erlaubt: false, grund: "nicht_bereit" };
  if (modus === "automatisch") return { erlaubt: true, grund: "automatisch" };
  if (modus === "knopfdruck") return knopf ? { erlaubt: true, grund: "knopfdruck" } : { erlaubt: false, grund: "wartet_auf_knopfdruck" };
  return { erlaubt: false, grund: "unbekannter_modus" };
}
