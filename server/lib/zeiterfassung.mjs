/* ==========================================================================
   ZEITERFASSUNG — was Beschäftigte selbst eintragen dürfen

   Bis Oktober 2026 übernahm der Server bei Beschäftigten jeden eigenen
   Schlüssel aus `erfassung` so, wie er übermittelt wurde: anlegen für
   beliebige Tage, auch künftige, ändern und löschen — auch die Zeiten, die
   /api/stempeln mit Ortsprüfung geschrieben hatte —, mit beliebigen
   Zusatzfeldern. Die Stempeluhr ließ sich so einfach überschreiben.

   Gewollt ist ein einziger Vorgang: „Zeiten bestätigen" in „Meine
   Schichten". Für einen vergangenen Tag mit geplantem Dienst, an dem es
   noch keine erfasste Zeit gibt, bestätigt die Person entweder „wie
   geplant" (start und ende leer) oder „abweichend" mit Beginn, Ende und
   Grund. Das läuft über einen eigenen Endpunkt (POST /api/zeit-bestaetigen)
   mit ausdrücklicher Antwort — nicht über das allgemeine Speichern, das
   eine verworfene Angabe nicht melden kann: Die Oberfläche hätte den Tag
   als bestätigt gezeigt, bis zum nächsten Neuladen.

   Ob an einem Tag Dienst geplant ist, rechnet der Server selbst: dieselbe
   Rechnung wie personTag in src/App.jsx (Schichtfolge der Einheit,
   Teilzeit, Abweichungen, Abwesenheiten), ohne die Postenvergabe — die
   ändert nur, welcher Dienst, nicht ob einer (personTag stellt nur im
   Zweig `ab === undefined && plan` von einer Dienstart auf eine andere
   um; ohne Plandienst bleibt es bei keinem).

   TECHNISCHE SCHULD — zwei Planrechnungen. personTag im Client und
   geplanterDienst hier sind zwei unabhängige Umsetzungen derselben Regel.
   Laufen sie auseinander, verwirft der Server, was die Oberfläche anbietet.
   Zielbild: eine maßgebliche, reine Planrechnung als gemeinsames Modul
   (ohne React), aus dem Client und Server ableiten; bis dahin wäre ein
   Vergleichstest beider Umsetzungen auf denselben Daten der Zwischenschritt.

   TECHNISCHE SCHULD — Uhr. „Heute" ist hier heuteBerlin() zum Zeitpunkt
   der Anfrage. Tests rechnen ihr „heute" einmal beim Start; fällt
   Mitternacht (Europe/Berlin) dazwischen, verschieben sich die relativen
   Tage. Ziel: eine injizierbare Uhr (server/lib/uhr.mjs, jetzt()), im
   Testserver über eine Umgebungsvariable fest gestellt — nur bei
   NODE_ENV=test —, dieselbe Referenz in den HTTP-Prüfungen; in Unit-Tests
   der Parameter `heute` bzw. vi.setSystemTime.
   ========================================================================== */

const TAG_MS = 86400000;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHRZEIT = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
export const RUECKBLICK_TAGE = 14;
const GRUND_MAX = 500;
const FELDER = ["start", "ende", "bestaetigt", "grund", "pause"];
/** Höchste Pause in Minuten (wie Korrektur und Antrag, WP-14; Stempeln und Selbstauskunft, WP-16). */
export const PAUSE_MAX = 180;
/** Eine angegebene Pause: ganze Minuten 0–180. undefined = keine Angabe, null = ungültig. */
export function pauseAngabe(roh) {
  if (roh === undefined || roh === null || roh === "") return undefined;
  const n = typeof roh === "number" ? roh : (typeof roh === "string" && /^\d{1,3}$/.test(roh.trim()) ? Number(roh.trim()) : NaN);
  return Number.isInteger(n) && n >= 0 && n <= PAUSE_MAX ? n : null;
}

const utc = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
export const tagePlus = (s, n) => iso(new Date(utc(s).getTime() + n * TAG_MS));
const zwischen = (a, b) => Math.round((utc(b).getTime() - utc(a).getTime()) / TAG_MS);
const wochentag = (s) => (utc(s).getUTCDay() + 6) % 7;     // Montag = 0, wie dow() im Client

/** Das heutige Datum dort, wo der Betrieb arbeitet. */
export function heuteBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}

/* --- Offener Stempelvorgang: technische Zuordnungsgrenze (Geo-Spezifikation B6) ---

   Ein Ende gehört nur dann automatisch zum offenen Beginn, wenn dieser
   höchstens 20 Stunden zurückliegt. Sonst hat die Person das Ausstempeln
   vergessen: Aus 06:00 Uhr Beginn und 06:01 Uhr am Folgetag würde sonst
   eine bestätigte 24-Stunden-Schicht. Die Grenze ist eine Zuordnungsregel,
   keine Aussage darüber, dass 20 Stunden Arbeitszeit zulässig wären — das
   bewertet das Regelwerk.

   Gerechnet wird mit den gespeicherten Minuten (HH:MM, Europe/Berlin), also
   genau mit dem, was Leitung und Person sehen: 06:00 → 02:00 am Folgetag
   sind 20:00 Stunden und werden noch zugeordnet, 02:01 nicht mehr. Die
   Zeitumstellung zählt mit (Nacht 25./26.10.: eine Stunde mehr, 28./29.3.:
   eine weniger).

   Maßgeblich ist der eindeutige Zeitpunkt `startAm` (UTC, ISO), den
   /api/stempeln seit der 20-Stunden-Grenze mitschreibt. Ältere Einträge
   haben nur Tag und Uhrzeit; für sie gilt eine in der Rückstellnacht doppelt
   vorkommende Uhrzeit (02:00–02:59) als die spätere (Winterzeit) — ein
   Beginn in der ersten, sommerzeitlichen Stunde wird dann um eine Stunde zu
   kurz gerechnet. */
export const OFFEN_MAX_MINUTEN = 20 * 60;

const BERLIN_TEILE = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Abstand der Berliner Wanduhr zu UTC in Millisekunden, zum Zeitpunkt ms. */
function berlinVersatz(ms) {
  const t = Object.fromEntries(BERLIN_TEILE.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wand = Date.UTC(Number(t.year), Number(t.month) - 1, Number(t.day), Number(t.hour), Number(t.minute));
  return wand - Math.floor(ms / 60000) * 60000;
}

/** Zeitpunkt (ms) einer Berliner Wanduhrzeit „JJJJ-MM-TT" + „HH:MM" — oder null. */
export function berlinZeitpunkt(datum, uhrzeit) {
  if (!TAG.test(String(datum)) || typeof uhrzeit !== "string" || !UHRZEIT.test(uhrzeit)) return null;
  const [y, mo, d] = datum.split("-").map(Number);
  if (iso(new Date(Date.UTC(y, mo - 1, d))) !== datum) return null;          // 2026-13-01, 2026-02-30
  const wand = Date.UTC(y, mo - 1, d, Number(uhrzeit.slice(0, 2)), Number(uhrzeit.slice(3, 5)));
  const erst = wand - berlinVersatz(wand);
  return wand - berlinVersatz(erst);
}

/** Die Berliner Uhrzeit (HH:MM, Minuten abgeschnitten) — dieselbe, die /api/stempeln speichert. */
export function uhrzeitBerlin(jetzt = new Date()) {
  return jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

/** Ein gespeicherter UTC-Zeitpunkt (ISO), auf die Minute abgeschnitten — oder null. */
function zeitpunktAus(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 60000) * 60000 : null;
}

/**
 * Minuten seit einem offenen Beginn, auf ganze Minuten. Mit `startAm`
 * (eindeutiger Zeitpunkt) gilt dieser; sonst Tag des Vorgangs + Uhrzeit.
 */
export function offenSeitMinuten(datum, start, jetzt = new Date(), startAm = null) {
  const beginn = zeitpunktAus(startAm) ?? berlinZeitpunkt(datum, start);
  const nun = Math.floor(jetzt.getTime() / 60000) * 60000;
  if (beginn === null || !Number.isFinite(nun)) return null;
  return Math.round((nun - beginn) / 60000);
}

/** Darf ein Ende jetzt automatisch diesem offenen Beginn zugeordnet werden? Höchstens 20:00 Stunden. */
export function startZuordenbar(datum, start, jetzt = new Date(), startAm = null) {
  const min = offenSeitMinuten(datum, start, jetzt, startAm);
  return min !== null && min >= 0 && min <= OFFEN_MAX_MINUTEN;
}

/* --- Dieselbe Planrechnung wie im Client --- */
function einheitAm(p, d) {
  let t = null;
  for (const z of Array.isArray(p.zugehoerigkeit) ? p.zugehoerigkeit : []) if (z && z.ab <= d) t = z;
  return t ? t.einheitId : null;
}
function imDienst(p, d) {
  if (p.eintritt && d < p.eintritt) return false;
  if (p.austritt && d > p.austritt) return false;
  return p.status !== "gesperrt";
}
const versatzTageVon = (e) => (e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7);
const zyklusLaenge = (m) => (m.zyklus && Array.isArray(m.zyklus.tage) ? m.zyklus.tage.length : ((m.zyklus && m.zyklus.wochen) || 0) * 7);
function einheitDienst(m, eid, d) {
  const e = (m.einheiten || []).find((x) => x && x.id === eid);
  if (!e || e.pool) return null;
  const tage = (m.zyklus && m.zyklus.tage) || null;
  if (!tage || !tage.length || !m.anker) return null;
  const len = zyklusLaenge(m);
  const i = (((zwischen(m.anker, d) + versatzTageVon(e)) % len) + len) % len;
  const id = tage[i];
  return id && id !== "-" ? id : null;
}
function idStreu(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function teilzeitDienst(m, p, datum, plan) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(wochentag(datum)) ? plan : null;
  const soll = (m.einstellungen && m.einstellungen.sollWochenstunden) || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;
  const len = zyklusLaenge(m);
  const e = (m.einheiten || []).find((x) => x && x.id === einheitAm(p, datum));
  if (!e || !len) return plan;
  const tage = zwischen(m.anker, datum) + versatzTageVon(e);
  const zyklen = Math.floor(tage / len);
  const rest = ((tage % len) + len) % len;
  let gesamt = 0;
  for (const t of m.zyklus.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < rest; i++) { const t = m.zyklus.tage[i]; if (t && t !== "-") vor++; }
  const nr = zyklen * gesamt + vor;
  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}
const abwesendAm = (m, pid, d) => (Array.isArray(m.abwesenheiten) ? m.abwesenheiten : [])
  .some((a) => a && String(a.personId) === String(pid) && a.von <= d && a.bis >= d);

/** Welcher Dienst ist für die Person an diesem Tag geplant? null = keiner. */
export function geplanterDienst(m, p, d) {
  if (!m || !p || !TAG.test(String(d)) || !imDienst(p, d)) return null;
  if (abwesendAm(m, p.id, d)) return null;
  const ab = (m.abweichungen || {})[`${p.id}|${d}`];
  if (ab !== undefined) return ab && ab !== "-" ? ab : null;
  const eid = einheitAm(p, d);
  const roh = (eid && !p.springer && p.imSchichtdienst !== false) ? einheitDienst(m, eid, d) : null;
  return teilzeitDienst(m, p, d, roh);
}

/** Läuft die Dienstart über Mitternacht (oder genau 24 Stunden)? */
export function uebernacht(da) {
  if (!da || typeof da.start !== "string" || typeof da.ende !== "string") return false;
  return da.ende === "24:00" || da.ende <= da.start;
}

const minuten = (z) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5));

/**
 * Eine neue Selbstauskunft prüfen. Gibt den bereinigten Eintrag zurück
 * oder { grund }.
 */
export function selbstauskunftPruefen(m, person, datum, wert, heute = heuteBerlin()) {
  if (!TAG.test(String(datum))) return { grund: "Kein gültiges Datum." };
  if (datum >= heute) return { grund: "Zeiten lassen sich erst nach dem Dienst bestätigen." };
  if (datum < tagePlus(heute, -RUECKBLICK_TAGE))
    return { grund: `Zeiten lassen sich höchstens ${RUECKBLICK_TAGE} Tage rückwirkend bestätigen.` };
  const dienstId = geplanterDienst(m, person, datum);
  if (!dienstId) return { grund: "An diesem Tag war kein Dienst geplant." };
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return { grund: "Ungültige Angabe." };
  if (Object.keys(wert).some((k) => !FELDER.includes(k))) return { grund: "Unbekannte Felder in der Zeitangabe." };
  if (wert.bestaetigt !== true) return { grund: "Eine Selbstauskunft ist eine Bestätigung." };
  const grund = wert.grund ?? "";
  if (typeof grund !== "string" || grund.length > GRUND_MAX) return { grund: "Der Grund ist zu lang oder ungültig." };
  /* Pause (WP-16): ganze Minuten 0–180, kürzer als die Anwesenheit; sonst keine Angabe. */
  const pause = pauseAngabe(wert.pause);
  if (pause === null) return { grund: `Die Pause in Minuten angeben (0 bis ${PAUSE_MAX}).` };
  const mitPause = pause === undefined ? {} : { pause };
  const da = (m.dienstarten || []).find((x) => x && String(x.id) === String(dienstId));
  const anwesend = (s, e) => (minuten(e) - minuten(s) + 1440) % 1440 || 1440;
  const { start = null, ende = null } = wert;
  if (start === null && ende === null) {                       // „wie geplant"
    if (pause !== undefined && da && UHRZEIT.test(String(da.start)) && UHRZEIT.test(String(da.ende)) && pause >= anwesend(da.start, da.ende))
      return { grund: "Die Pause muss kürzer sein als der Dienst." };
    return { eintrag: { start: null, ende: null, bestaetigt: true, grund, ...mitPause } };
  }
  if (typeof start !== "string" || typeof ende !== "string" || !UHRZEIT.test(start) || !UHRZEIT.test(ende)
      || start === "24:00")
    return { grund: "Beginn und Ende als Uhrzeit (HH:MM) angeben." };
  /* Ende vor oder gleich Beginn heißt: über Mitternacht. Das ist nur
     plausibel, wenn der geplante Dienst selbst über Mitternacht läuft. */
  const dauer = anwesend(start, ende);
  if (minuten(ende) <= minuten(start) && !uebernacht(da))
    return { grund: "Das Ende liegt vor dem Beginn, der geplante Dienst läuft aber nicht über Mitternacht." };
  if (dauer > 24 * 60) return { grund: "Unplausible Dauer." };
  if (pause !== undefined && pause >= dauer) return { grund: "Die Pause muss kürzer sein als die Anwesenheit." };
  return { eintrag: { start, ende, bestaetigt: true, grund, ...mitPause } };
}

/**
 * `erfassung` im allgemeinen Speichern einer Beschäftigten oder
 * Schichtverantwortung: Es bleibt der gespeicherte Stand. Neue
 * Selbstauskünfte kommen über POST /api/zeit-bestaetigen; was die
 * Oberfläche hier mitschickt, sind Kopien — veraltet, gekürzt oder
 * identisch — und wird übergangen. Zurückgemeldet wird nur, ob dabei
 * Schlüssel fremder Personen geändert werden sollten.
 */
export function erfassungZusammen(m, geschickt, ich) {
  const alt = m.erfassung && typeof m.erfassung === "object" ? m.erfassung : {};
  const neu = geschickt && typeof geschickt === "object" && !Array.isArray(geschickt) ? geschickt : {};
  const fremd = [...new Set([...Object.keys(alt), ...Object.keys(neu)])]
    .filter((k) => JSON.stringify(alt[k]) !== JSON.stringify(neu[k]))
    .filter((k) => String(k).split("|")[0] !== String(ich));
  return { erfassung: alt, fremd };
}

/* --- Wohin gehört ein Stempel? (Geo-Spezifikation B5, B6, B7) ---

   Bis November 2026 bestimmte das Gerät den Tag: /api/stempeln nahm das
   mitgeschickte `datum` und prüfte nur, ob es heute oder — mit Bezug —
   gestern war. Folgen: Ein Gerät mit falscher Uhr oder Zeitzone stempelte
   auf den falschen Tag; ein Nachtdienst, der um 22 Uhr begann, endete nach
   Mitternacht als „Ende ohne Start" auf dem neuen Tag, wenn die Oberfläche
   das heutige Datum schickte; und ein Beginn nach Mitternacht ließ sich
   dem Vortag zuschlagen, weil dort ein Nachtdienst geplant war.

   Jetzt bestimmt der Server den Tag aus seiner eigenen Uhr in der Zeitzone
   des Betriebs (Europe/Berlin; eine Zeitzone je Betrieb gibt es noch nicht):

   - Beginn: das heutige Datum. Ein Beginn nach Mitternacht gehört zum neuen
     Tag — die Leitung kann die Zuordnung korrigieren (B7). Läuft noch ein
     offener Beginn von gestern innerhalb der 20-Stunden-Grenze (Nachtdienst),
     ist ein neuer Beginn ein doppelter Start: 409 (B5).
   - Ende, in dieser Reihenfolge:
       1. Es gibt einen Eintrag von heute → dorthin.
       2. Offener Beginn von gestern, höchstens 20 Stunden alt → dorthin
          (Nachtdienst), mit `endeDatum` = heute.
       3. Offener Beginn von gestern, älter (vergessenes Ausstempeln, B6.3)
          → nie still anhängen: eigenes Ende ohne Start auf heute
          (START_FEHLT), der alte Vorgang wird als KONFLIKT markiert und
          bleibt für die Korrektur offen — unabhängig vom Gerätedatum.
       4. Kein offener Vorgang, aber gestern war ein Dienst über Mitternacht
          geplant, für gestern gibt es noch keinen Stempeleintrag, und jetzt
          ist es vor dem geplanten Dienstende + NACHT_TOLERANZ_MS → gestern,
          als START_FEHLT. Wer das Einstempeln am Abend vergessen hat, landet
          so beim richtigen Dienst und nicht als loses Ende am Folgetag.
       5. Sonst heute, START_FEHLT.
   - Die Zeitumstellung zählt richtig, weil Datum und Abstand aus dem
     eindeutigen Zeitpunkt gerechnet werden (heuteBerlin, startAm,
     berlinZeitpunkt).

   Das `datum` des Geräts wird angenommen und ignoriert (B7). Weicht es ab —
   außerhalb von zwei Minuten um Mitternacht und nicht der Tag, den der
   Server gewählt hat —, oder ist es kein Datum, trägt der Eintrag die
   Markierung GERAETEDATUM_ABWEICHEND für die Leitung. Nie eine Absage
   deswegen: Eine Stempelung darf nicht an einer falsch gestellten Uhr
   verloren gehen.
   --------------------------------------------------------------------------- */

/** Toleranz um Mitternacht für das mitgeschickte Gerätedatum (B7: zwei Minuten). */
export const GERAETE_TOLERANZ_MS = 2 * 60 * 1000;
/** Ein Ende ohne Beginn gehört noch bis so lange nach dem geplanten Ende des Nachtdiensts zu gestern. */
export const NACHT_TOLERANZ_MS = 4 * 60 * 60 * 1000;

/**
 * Bestimmt den Tag eines Stempels und die Markierungen, die sich daraus ergeben.
 * @param {object} m  der Betrieb
 * @param {object} person
 * @param {"start"|"ende"} art
 * @param {Date} jetzt  Serverzeit
 * @param {any} geraeteDatum  das mitgeschickte `datum` — wird ignoriert, nur verglichen
 * @returns {{ datum: string, markierungen: string[], konfliktAm: string|null }
 *   | { status: 409, code: string, grund: string, datum: string }}
 */
export function stempelZiel(m, person, art, jetzt = new Date(), geraeteDatum = null) {
  const heute = heuteBerlin(jetzt);
  const gestern = tagePlus(heute, -1);
  const tab = (m && m.einstempeln) || {};
  const eintrag = (d) => tab[`${person.id}|${d}`] || null;
  const offen = (e) => !!e && !!e.start && !e.ende;
  const vonGestern = offen(eintrag(gestern)) ? eintrag(gestern) : null;
  const gesternZuordenbar = !!vonGestern && startZuordenbar(gestern, vonGestern.start, jetzt, vonGestern.startAm);

  const markierungen = [];
  let konfliktAm = null;
  let datum;
  if (art === "start") {
    if (!eintrag(heute) && gesternZuordenbar) {
      return { status: 409, code: "STEMPEL_SCHON_EINGESTEMPELT", datum: gestern,
        grund: `Du bist seit gestern ${vonGestern.start} Uhr eingestempelt — bitte zuerst ausstempeln.` };
    }
    datum = heute;
  } else if (eintrag(heute)) {
    datum = heute;
  } else if (gesternZuordenbar) {
    datum = gestern;
  } else if (vonGestern) {
    datum = heute;                                   // B6.3: nicht anhängen
    konfliktAm = gestern;
  } else if (!eintrag(gestern) && nachtdienstOffen(m, person, heute, jetzt)) {
    datum = gestern;                                 // F1: vergessenes Einstempeln am Abend
  } else {
    datum = heute;
  }

  if (geraeteDatum !== null && geraeteDatum !== undefined && geraeteDatum !== "") {
    const g = String(geraeteDatum);
    const heuteRund = new Set([heute, heuteBerlin(new Date(jetzt.getTime() - GERAETE_TOLERANZ_MS)),
      heuteBerlin(new Date(jetzt.getTime() + GERAETE_TOLERANZ_MS))]);
    if (!TAG.test(g) || (!heuteRund.has(g) && g !== datum)) markierungen.push("GERAETEDATUM_ABWEICHEND");
  }
  return { datum, markierungen, konfliktAm };
}

/**
 * War gestern ein Dienst über Mitternacht geplant, für gestern noch kein
 * Stempeleintrag da, und ist sein Ende (+ NACHT_TOLERANZ_MS) noch nicht
 * vorbei? Dieselbe Regel nutzt die Oberfläche (src/stempelvorgang.js), um
 * „Dienstende stempeln" anzubieten (WP-17, F1/W3).
 */
export function nachtdienstOffen(m, person, heute, jetzt = new Date()) {
  const gestern = tagePlus(heute, -1);
  if (m && m.einstempeln && m.einstempeln[`${person.id}|${gestern}`]) return false;
  const dienstId = geplanterDienst(m, person, gestern);
  const da = dienstId ? (m.dienstarten || []).find((x) => x && String(x.id) === String(dienstId)) : null;
  if (!uebernacht(da)) return false;
  const ende = berlinZeitpunkt(heute, da.ende === "24:00" ? "00:00" : da.ende);
  return ende !== null && jetzt.getTime() <= ende + NACHT_TOLERANZ_MS;
}

/* --- Ein langer Dienst wird nicht automatisch bestätigt ---

   Ergibt ein Ende eine Dauer über der Grenze, entsteht keine bestätigte
   Ist-Zeit, sondern eine zur Prüfung (bestaetigt: false, Markierung
   LANGER_DIENST); die Leitung bestätigt sie in den Stempelbefunden.

   Die Grenze ist die geplante Dauer des Dienstes plus LANGER_DIENST_PUFFER
   (zwei Stunden für Übergaben und Verspätungen) — gemessen über die ganze
   Spanne von Beginn bis Ende, also auch für Bereitschaftsdienst und
   Rufbereitschaft (RB 17–07: 14 Stunden). Ohne geplanten Dienst gilt
   LANGER_DIENST_MINUTEN: die Höchstarbeitszeit nach § 3 ArbZG (zehn Stunden)
   plus zwei Stunden.

   Bis zur Review-Auflage W1 galt pauschal zwölf Stunden — reguläre
   Zwölfstundendienste (T12 06–18, N12 18–06) und Rufbereitschaften wurden
   dann zur Prüfung gestellt, und 05:55–18:10 ging mit der Planzeit 12,0
   statt 12,25 Stunden ins Konto, ohne Hinweis. */
export const LANGER_DIENST_MINUTEN = 12 * 60;
export const LANGER_DIENST_PUFFER = 2 * 60;

/** Ab wie vielen Minuten ist ein gestempelter Dienst an diesem Tag „lang"? */
export function langerDienstGrenze(m, person, datum) {
  const dienstId = geplanterDienst(m, person, datum);
  const da = dienstId ? (m.dienstarten || []).find((x) => x && String(x.id) === String(dienstId)) : null;
  if (!da || typeof da.start !== "string" || typeof da.ende !== "string"
      || !UHRZEIT.test(da.start) || !UHRZEIT.test(da.ende)) return LANGER_DIENST_MINUTEN;
  const beginn = minuten(da.start);
  const ende = da.ende === "24:00" ? 1440 : minuten(da.ende);
  let dauer = ende - beginn;
  if (dauer <= 0) dauer += 1440;
  return dauer + LANGER_DIENST_PUFFER;
}

/* --- Offline-Stempel (WP-07): Ereigniskennung, Erfassungszeit, Prüfung ---

   Ein Gerät ohne Netz legt jedes Stempeln als Ereignis in eine Warteschlange
   (src/stempelpuffer.js): eine zufällige Kennung (clientEventId, UUID v4),
   die Uhrzeit des Geräts beim Drücken (erfasstAm) und beim Absenden
   (gesendetAm). Es bleibt dort, bis der Server es quittiert hat — auch über
   einen Neustart hinweg. Der Server macht daraus genau einen Stempel:

   - Kennung: Ein Ereignis mit einer Kennung, die schon an einem Stempel
     derselben Person steht, ergibt keinen zweiten Stempel, sondern die
     Antwort des ersten (daten.mjs, unter der Raumsperre, also auch bei
     gleichzeitigen Wiederholungen aus zwei Reitern oder Geräten). Die
     Kennung steht im Stempel selbst (ereignisStart/ereignisEnde) und wird
     mit ihm in einem Schreibvorgang gespeichert — es gibt keinen Zustand,
     in dem der Stempel geschrieben, die Kennung aber verloren ist. Gesucht
     wird unter den Stempeln der Person aus den letzten
     IDEMPOTENZ_TAGE Tagen (und um den Tag des Ereignisses).

   - Zeit: Kommt ein Ereignis gleich an (nicht offline, höchstens
     ONLINE_FENSTER_MS nach dem Drücken), gilt wie bisher die Uhr des Servers.
     Sonst gilt die Erfassungszeit des Ereignisses — gestempelt hat der
     Mensch, als er gedrückt hat, nicht als das Netz zurückkam. Sie wird nie
     still übernommen:
       • Der Abstand der Geräteuhr zur Serveruhr ergibt sich aus gesendetAm
         und dem Eingang. Weicht er um mehr als UHR_TOLERANZ_MS ab, wird die
         Erfassungszeit um ihn berichtigt und der Stempel als
         GERAETEZEIT_ABWEICHEND markiert (die Berichtigung setzt voraus, dass
         die Uhr zwischen Drücken und Senden nicht verstellt wurde — darum
         zur Prüfung).
       • Fehlt gesendetAm oder ist erfasstAm kein Zeitpunkt: markiert; ohne
         lesbare Erfassungszeit gilt der Eingang.
       • Nie in der Zukunft: Liegt die (berichtigte) Erfassungszeit nach dem
         Eingang, gilt der Eingang; ab UHR_TOLERANZ_MS darüber markiert.
       • Älter als OFFLINE_MAX_ALTER_MS: gespeichert, als OFFLINE_ALT markiert
         — zur Prüfung durch die Leitung, nie abgelehnt. Datenverlust ist
         schlimmer als ein Prüffall.
     Ergibt ein solches Ende eine Ist-Zeit, ist sie unbestätigt
     (OFFLINE_PRUEFEN, src/istdaten.js zurPruefung) — die Leitung bestätigt
     oder korrigiert sie über den Korrekturweg (WP-06).
   - Tag und Zuordnung bestimmt weiter stempelZiel — mit der Erfassungszeit
     als „jetzt", also so, als wäre das Ereignis rechtzeitig angekommen. */
export const IDEMPOTENZ_TAGE = 14;
export const ONLINE_FENSTER_MS = 60 * 1000;
export const UHR_TOLERANZ_MS = 5 * 60 * 1000;
export const OFFLINE_MAX_ALTER_MS = 48 * 60 * 60 * 1000;
export const EREIGNIS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Markierungen, die eine Ist-Zeit aus einem Offline-Stempel zur Prüfung stellen. */
export const OFFLINE_PRUEF_MARKIERUNGEN = Object.freeze(["GERAETEZEIT_ABWEICHEND", "OFFLINE_ALT"]);

/* Review-Auflage A1: Die Erfassungszeit eines Offline-Ereignisses ist eine
   Angabe des Geräts. Flugmodus und eine zurückgestellte Geräteuhr genügen,
   um sie zu fälschen — ohne manipuliertes Programm, und unsichtbar für die
   Versatzprüfung, wenn die Uhr vor dem Senden wieder richtig steht. Liegt
   die maßgebliche Zeit eines Beginns oder Endes deshalb OFFLINE_SOFORT_MS
   oder mehr vor (oder nach) dem Eingang, ist die Ist-Zeit nicht automatisch
   bestätigt (OFFLINE_PRUEFEN) — die Leitung bestätigt sie über den
   Korrekturweg (WP-06). Lockern lässt sich das nur über den
   Betriebsschalter einstellungen.offlineStempelVertrauen (org.edit, Wann und
   Wer setzt der Server; Vorgabe streng). */
export const OFFLINE_SOFORT_MS = 15 * 60 * 1000;
/** Kam ein Offline-Ereignis erst OFFLINE_SOFORT_MS oder später nach seiner maßgeblichen Zeit an? */
export function offlineVerspaetet(info) {
  if (!info || typeof info !== "object" || info.offline !== true) return false;
  const ein = Date.parse(info.eingangAm), zeit = Date.parse(info.zeitAm);
  if (!Number.isFinite(ein) || !Number.isFinite(zeit)) return true;
  return Math.abs(ein - zeit) >= OFFLINE_SOFORT_MS;
}
/** Ist der Betriebsschalter „Offline-Stempeln vertrauen" an? Vorgabe: aus. */
export const offlineVertrauen = (m) => !!(m && m.einstellungen && m.einstellungen.offlineStempelVertrauen === true);

const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const zeitLesen = (x) => {
  if (typeof x !== "string" || !ISO_ZEIT.test(x)) return null;
  const ms = Date.parse(x);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Prüft die Ereignisangaben eines Stempelns und bestimmt den maßgeblichen Zeitpunkt.
 * @param {any} rumpf  { clientEventId?, erfasstAm?, gesendetAm?, offline? }
 * @param {Date} eingang  Serverzeit beim Eintreffen
 * @returns {{ fehler: string } | { id: string|null, zeitpunkt: Date, offline: boolean,
 *   markierungen: string[], info: object|null }}
 */
export function stempelEreignis(rumpf, eingang = new Date()) {
  const r = rumpf && typeof rumpf === "object" ? rumpf : {};
  let id = null;
  if (r.clientEventId !== undefined && r.clientEventId !== null) {
    if (typeof r.clientEventId !== "string" || !EREIGNIS_ID.test(r.clientEventId.toLowerCase()))
      return { fehler: "Die Kennung des Stempelereignisses ist ungültig." };
    id = r.clientEventId.toLowerCase();
  }
  const ein = eingang.getTime();
  const erfasst = zeitLesen(r.erfasstAm);
  const gesendet = zeitLesen(r.gesendetAm);
  const verzug = erfasst !== null && gesendet !== null ? gesendet - erfasst : null;
  const offline = r.offline === true || (verzug !== null && verzug > ONLINE_FENSTER_MS);
  if (!offline) return { id, zeitpunkt: eingang, offline: false, markierungen: [], info: null };

  const markierungen = ["OFFLINE_ERFASST"];
  const abweichend = () => { if (!markierungen.includes("GERAETEZEIT_ABWEICHEND")) markierungen.push("GERAETEZEIT_ABWEICHEND"); };
  const versatz = gesendet !== null ? ein - gesendet : null;
  let zeit;
  if (erfasst === null) { abweichend(); zeit = ein; }
  else if (versatz === null) { abweichend(); zeit = erfasst; }
  else if (Math.abs(versatz) > UHR_TOLERANZ_MS) { abweichend(); zeit = erfasst + versatz; }
  else zeit = erfasst;
  /* Nie in der Zukunft (Nachprüfung): Was nach dem Eingang liegt, gilt als
     Eingang — ohne Toleranz. Markiert wird erst ab UHR_TOLERANZ_MS; darunter
     ist es ehrlicher Uhrversatz. */
  if (zeit > ein) { if (zeit > ein + UHR_TOLERANZ_MS) abweichend(); zeit = ein; }
  if (ein - zeit > OFFLINE_MAX_ALTER_MS) markierungen.push("OFFLINE_ALT");
  /* Nur geprüfte Zeitpunkte werden gespeichert, nie die Rohangabe (Review L4). */
  const info = { offline: true,
    geraetAm: erfasst !== null ? r.erfasstAm : null,
    gesendetAm: gesendet !== null ? r.gesendetAm : null,
    eingangAm: eingang.toISOString(), versatzMs: versatz,
    zeitAm: new Date(zeit).toISOString() };
  return { id, zeitpunkt: new Date(zeit), offline: true, markierungen, info };
}

/**
 * Steht ein Ereignis mit dieser Kennung schon an einem Stempel der Person?
 * @returns {{ schluessel: string, datum: string, art: "start"|"ende", eintrag: object } | null}
 */
export function ereignisFinden(m, personId, id, heute, ereignisTag = heute) {
  if (!id || !m || !m.einstempeln) return null;
  const ab = tagePlus([tagePlus(heute, -IDEMPOTENZ_TAGE), ereignisTag].sort()[0], -2);
  const praefix = `${personId}|`;
  for (const [k, e] of Object.entries(m.einstempeln)) {
    if (!k.startsWith(praefix) || !e || typeof e !== "object") continue;
    const datum = k.slice(praefix.length);
    if (datum < ab) continue;
    if (e.ereignisStart === id) return { schluessel: k, datum, art: "start", eintrag: e };
    if (e.ereignisEnde === id) return { schluessel: k, datum, art: "ende", eintrag: e };
  }
  return null;
}
