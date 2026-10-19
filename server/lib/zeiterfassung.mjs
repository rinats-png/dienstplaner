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

/**
 * Darf /api/stempeln an diesem Datum stempeln? Heute ja. Gestern nur mit
 * Bezug: ein geplanter Dienst über Mitternacht, oder zum Ausstempeln ein
 * bereits gestempelter Beginn ohne Ende. Künftige und ältere Tage nie —
 * dafür gibt es „Zeiten bestätigen".
 */
export function stempelDatumPruefen(m, person, datum, art, heute = heuteBerlin()) {
  if (datum === heute) return null;
  if (datum > heute) return "Für einen künftigen Tag lässt sich nicht stempeln.";
  if (datum !== tagePlus(heute, -1))
    return "Ältere Tage lassen sich nicht nachstempeln. Bitte „Zeiten bestätigen\" verwenden.";
  const dienstId = geplanterDienst(m, person, datum);
  const da = dienstId ? (m.dienstarten || []).find((x) => x && String(x.id) === String(dienstId)) : null;
  if (uebernacht(da)) return null;
  const st = (m.einstempeln || {})[`${person.id}|${datum}`];
  if (art === "ende" && st && st.start && !st.ende) return null;
  return "Für gestern lässt sich nur ein Dienst über Mitternacht stempeln.";
}
