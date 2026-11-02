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
const FELDER = ["start", "ende", "bestaetigt", "grund"];

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
  const { start = null, ende = null } = wert;
  if (start === null && ende === null)                         // „wie geplant"
    return { eintrag: { start: null, ende: null, bestaetigt: true, grund } };
  if (typeof start !== "string" || typeof ende !== "string" || !UHRZEIT.test(start) || !UHRZEIT.test(ende)
      || start === "24:00")
    return { grund: "Beginn und Ende als Uhrzeit (HH:MM) angeben." };
  /* Ende vor oder gleich Beginn heißt: über Mitternacht. Das ist nur
     plausibel, wenn der geplante Dienst selbst über Mitternacht läuft. */
  const da = (m.dienstarten || []).find((x) => x && String(x.id) === String(dienstId));
  const dauer = (minuten(ende) - minuten(start) + 1440) % 1440 || 1440;
  if (minuten(ende) <= minuten(start) && !uebernacht(da))
    return { grund: "Das Ende liegt vor dem Beginn, der geplante Dienst läuft aber nicht über Mitternacht." };
  if (dauer > 24 * 60) return { grund: "Unplausible Dauer." };
  return { eintrag: { start, ende, bestaetigt: true, grund } };
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

/* --- Wohin gehört ein Stempel? (Geo-Spezifikation B6, B7) ---

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
     Tag — die Leitung kann die Zuordnung korrigieren (B7).
   - Ende: der offene Vorgang. Steht heute ein Vorgang, gilt er. Sonst ein
     offener Beginn von gestern, solange er höchstens 20 Stunden zurückliegt
     (B6, startZuordenbar) — der Nachtdienst endet auf seinem Starttag, mit
     `endeDatum` = heute. Ein älterer offener Beginn ist ein vergessenes
     Ausstempeln: Das Ende kommt als eigenes Ereignis auf heute
     (START_FEHLT), der alte Vorgang bleibt für die Korrektur offen.
   - Die Zeitumstellung zählt richtig, weil Datum und Abstand aus dem
     eindeutigen Zeitpunkt gerechnet werden (heuteBerlin, startAm).

   Das `datum` des Geräts dient nur noch der Plausibilität. Fehlt es, ist
   das in Ordnung. Ist es da, muss es heute sein (mit zwei Minuten Spiel
   um Mitternacht, B7) oder — beim Ende — der Tag des offenen Beginns; ein
   Ende mit dem Datum eines veralteten offenen Beginns wird wie bisher an
   diesen gehängt (START_VERALTET). Jedes andere Datum wird abgelehnt (400),
   statt still auf heute umgebogen zu werden: Die Oberfläche hat dann
   einen falschen Stand oder eine falsche Uhr, und das soll sie erfahren.
   --------------------------------------------------------------------------- */

/** Toleranz um Mitternacht für das mitgeschickte Gerätedatum (B7: zwei Minuten). */
export const GERAETE_TOLERANZ_MS = 2 * 60 * 1000;

/**
 * Bestimmt den Tag eines Stempels.
 * @param {object} m  der Betrieb
 * @param {object} person
 * @param {"start"|"ende"} art
 * @param {Date} jetzt  Serverzeit
 * @param {string|null|undefined} geraeteDatum  das mitgeschickte `datum`, nur zur Plausibilität
 * @returns {{ datum: string, status?: undefined } | { status: number, code: string, grund: string, datum?: string }}
 */
export function stempelZiel(m, person, art, jetzt = new Date(), geraeteDatum = null) {
  const heute = heuteBerlin(jetzt);
  const gestern = tagePlus(heute, -1);
  const tab = (m && m.einstempeln) || {};
  const eintrag = (d) => tab[`${person.id}|${d}`] || null;
  const offen = (e) => !!e && !!e.start && !e.ende;
  const vonGestern = offen(eintrag(gestern)) ? eintrag(gestern) : null;
  const gesternZuordenbar = !!vonGestern && startZuordenbar(gestern, vonGestern.start, jetzt, vonGestern.startAm);

  if (geraeteDatum !== null && geraeteDatum !== undefined && geraeteDatum !== "") {
    const g = String(geraeteDatum);
    if (!TAG.test(g)) return { status: 400, code: "STEMPEL_DATUM_UNGUELTIG", grund: "Kein gültiges Datum." };
    const heuteRund = new Set([heute, heuteBerlin(new Date(jetzt.getTime() - GERAETE_TOLERANZ_MS)),
      heuteBerlin(new Date(jetzt.getTime() + GERAETE_TOLERANZ_MS))]);
    const offenerTag = art === "ende" && vonGestern ? gestern : null;
    if (!heuteRund.has(g) && g !== offenerTag) {
      return { status: 400, code: "STEMPEL_DATUM_UNPASSEND",
        grund: `Gestempelt wird immer auf heute (${heute}) bzw. auf einen offenen Dienstbeginn — `
          + `das Datum ${g} passt dazu nicht. Bitte die Seite neu laden und die Uhrzeit des Geräts prüfen. `
          + "Vergangene Tage über „Zeiten bestätigen\"." };
    }
    /* Ausdrücklich der Tag des offenen Beginns von gestern: an diesen
       Vorgang — liegt er über 20 Stunden zurück, wie bisher mit
       START_VERALTET (siehe /api/stempeln). */
    if (g === offenerTag) return { datum: gestern };
  }

  if (art === "start") {
    if (!eintrag(heute) && gesternZuordenbar) {
      return { status: 409, code: "STEMPEL_SCHON_EINGESTEMPELT", datum: gestern,
        grund: `Du bist seit gestern ${vonGestern.start} Uhr eingestempelt — bitte zuerst ausstempeln.` };
    }
    return { datum: heute };
  }
  if (eintrag(heute)) return { datum: heute };
  if (gesternZuordenbar) return { datum: gestern };
  return { datum: heute };
}
