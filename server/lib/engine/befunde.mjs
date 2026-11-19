/* ==========================================================================
   RECHENKERN — BEFUNDE (WP-I12)

   Die Planprüfung (pruefen) mit Fachkraftquote und Einschränkungsbewertung, aus src/lib/fachlogik.js
   unverändert herausgelöst. Die Frage „ist dieses Merkmal gebucht und nutzbar?“ (Pakete) steht in server/lib/paketliste.mjs; der
   Rechenkern nutzt sie als Vorgabe und lässt sie über einen Haken ersetzen (merkmalPruefungSetzen / mitMerkmalen).
   ========================================================================== */
import { addDays, aufgabeGedeckt, aufgabeSchwere, ersatzruhetage, fenster, uhrversatz, alterAm, pauseGenuegt, tagesgrenzeVerletzt, bruttoAm, pausePflicht, HOECHST_TAG, dow, freieSonntage, FREIE_SONNTAGE_MIN, vorsorgeFaellig, stundengrenzeAusRegeln, dauer, montag, schutzEinsatz, regelMaengel } from "../regelwerk.mjs";
import { kannMerkmal } from "../paketliste.mjs";
import { addMonate } from "../regelbaukasten.mjs";
import { n1 } from "./textformat.mjs";
import { fKurz } from "./textformat.mjs";
import { nachtAnteil, nachtschwelle, sperreWirkt, landFuerEinheit, einheitAm, imDienst } from "../fachpruefung.mjs";
import { eingefrorenerTag, feiertagFuer } from "../isteinfrieren.mjs";
import { pruefZeitFuer, ISTDATEN_TEXT } from "../istdaten.mjs";
import { sperrtBefund as sperrtArt } from "../bestaetigungen.mjs";
import { memo, besetzung, qualGueltig, istStunden, absIdx, personTag, abwesenheitAm, abwArt, istTag, istDauer, nachtTageImJahr, nachweisStand, aktive } from "./plan.mjs";

/* Merkmalsprüfung (Pakete): Ist ein Merkmal für diesen Betrieb gebucht und nutzbar? Die Paketliste und die
   Prüfung stehen seit WP-I12b in server/lib/paketliste.mjs (gemeinsame Quelle mit dem Client); Vorgabe ist
   diese Prüfung. Der Haken bleibt für Aufrufer, die die Merkmale vorgeben (rechnen: o.merkmale). Er wird nie
   auf den Mandanten geschrieben. */
let merkmalHaken = kannMerkmal;
export function merkmalPruefungSetzen(f) {
  if (typeof f !== "function") throw new TypeError("Merkmalsprüfung muss eine Funktion sein.");
  merkmalHaken = f;
}
/** Führt f mit einer Merkmalsprüfung aus; danach gilt wieder die vorherige (synchron). */
export function mitMerkmalen(f, aufruf) {
  if (typeof f !== "function") throw new TypeError("Merkmalsprüfung muss eine Funktion sein.");
  const vorher = merkmalHaken;
  merkmalHaken = f;
  try { return aufruf(); } finally { merkmalHaken = vorher; }
}
const kann = (m, merkmal) => merkmalHaken(m, merkmal) === true;

export function pruefen(m, von, bis) {
  return memo(m, `pr|${von}|${bis}`, () => {
    const out = []; const push = (o) => out.push({ id: `${o.art}|${o.datum}|${o.ref || ""}`, ...o });
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const b = besetzung(m, d);
      for (const k of Object.keys(b)) {
        const e = b[k];
        // Fachkraftquote (Pflege, Klinik)
        const fl = fachkraftLage(m, d, k);
        if (fl && !fl.erfuellt)
          push({ art: "fachkraft", schwere: "danger", datum: d, ref: k,
            titel: `${e.da.name}: Fachkraftquote unterschritten`,
            text: `${fl.fk} von ${fl.gesamt} sind Fachkräfte (${fl.ist} %), gefordert sind ${fl.soll} % — es fehlen ${fl.fehlt}` });
        if (e.diff < 0) {
          const u = (m.unterschreitungen || []).find((x) => x.datum === d && x.dienstId === k);
          push({ art: "besetzung", schwere: u ? "warn" : (e.diff <= -2 ? "danger" : "warn"), datum: d, ref: k,
            titel: `${e.da.name} unterbesetzt${u ? " · dokumentiert" : ""}`,
            text: u ? `${e.anzahl} von ${e.soll} — begründet: ${u.grund}` : `${e.anzahl} von ${e.soll} — es fehlen ${Math.abs(e.diff)}` });
        }
        for (const q of e.qual.filter((x) => !x.ok)) {
          const qn = m.qualifikationen.find((x) => x.id === q.qid);
          push({ art: "qualifikation", schwere: "danger", datum: d, ref: `${k}|${q.qid}`,
            titel: `${e.da.name}: ${qn ? qn.name : q.qid} fehlt`, text: `${q.ist} von ${q.noetig} erforderlich` });
        }

        /* Vorbehaltene Aufgaben — anders als die Quote eine Anwesenheit.

           Eine Schicht kann jede Quote erfüllen und trotzdem rechtswidrig
           sein, weil niemand da ist, der die Pflegeplanung verantworten
           darf (§ 4 PflBG). Geprüft wird je Dienstart, an der die Aufgabe
           hängt. */
        for (const a of (m.aufgaben || []).filter((x) => (x.dienstarten || []).includes(k))) {
          const u = aufgabeGedeckt(a, e.personen, (p, qid) => qualGueltig(m, p, qid));
          const schwere = aufgabeSchwere(u);
          if (!schwere) continue;
          push({ art: "aufgabe", schwere, datum: d, ref: `${k}|${a.id}`,
            titel: u.offen ? `${e.da.name}: ${a.name} nicht prüfbar` : `${e.da.name}: ${a.name} nicht abgedeckt`, text: u.text });
        }
      }
    }
    /* Abwesenheiten, deren Entgeltstatus nicht geklärt ist: Das Stundenkonto
       schreibt dafür nichts gut — und sagt es, statt still zu kürzen. */
    for (const p of m.personen) {
      for (let ym = von.slice(0, 7); ym <= bis.slice(0, 7); ym = addMonate(ym + "-01", 1).slice(0, 7)) {
        const n = istStunden(m, p, ym).ungeklaert;
        if (n > 0)
          push({ art: "entgelt", schwere: "warn", datum: `${ym}-01`, ref: `${p.id}|${ym}`, personId: p.id,
            titel: `${p.nachname}: Entgeltstatus der Abwesenheit nicht geklärt`,
            text: `${n} geplante Abwesenheitstag(e) im ${ym} haben keinen geprüften Entgeltstatus. Das Stundenkonto schreibt dafür nichts gut; bitte Lohnbuchhaltung oder Tarif klären.` });
      }
    }
    const vor = addDays(von, -10);
    for (const p of m.personen) {
      const reihe = [];
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) { const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (da && !da.ruhezeitNeutral) reihe.push({ d, da }); }
      }
      for (let i = 1; i < reihe.length; i++) {
        const [, e1] = fenster(reihe[i - 1].d, reihe[i - 1].da); const [s2] = fenster(reihe[i].d, reihe[i].da);
        /* Über die Zeitumstellung hinweg ist die Ruhezeit eine Stunde kürzer
           oder länger, als die Uhr zeigt. Im März wurden aus elf Stunden auf
           dem Plan zehn in Wirklichkeit — ein Verstoß gegen § 5 Abs. 1 ArbZG,
           den die Prüfung nicht sah. */
        const ruhe = (s2 - e1 + uhrversatz(e1, s2)) / 60;
        if (ruhe < m.einstellungen.ruhezeit && reihe[i].d >= von && reihe[i].d <= bis)
          push({ art: "ruhezeit", schwere: ruhe < 8 ? "danger" : "warn", datum: reihe[i].d, ref: p.id, personId: p.id,
            titel: `Ruhezeit unterschritten — ${p.nachname}`,
            text: `${n1(ruhe)} h zwischen ${reihe[i - 1].da.kurz} am ${fKurz(reihe[i - 1].d)} und ${reihe[i].da.kurz}` });
      }
      let lauf = 0, nl = 0, ab = null;
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) {
          if (!lauf) ab = d; lauf++;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          nl = da && nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen) ? nl + 1 : 0;
          if (lauf === m.einstellungen.maxFolge + 1 && d >= von && d <= bis)
            push({ art: "folge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${lauf} Dienste in Folge — ${p.nachname}`, text: `Serie ab ${fKurz(ab)}, Grenzwert ${m.einstellungen.maxFolge}` });
          if (nl === m.einstellungen.maxNachtFolge + 1 && d >= von && d <= bis)
            push({ art: "nachtfolge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${nl} Nachtdienste in Folge — ${p.nachname}`, text: `Grenzwert ${m.einstellungen.maxNachtFolge}` });
        } else { lauf = 0; nl = 0; }
      }
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const a = m.abweichungen[`${p.id}|${d}`], w = abwesenheitAm(m, p.id, d);
        if (a && a !== "-" && w) push({ art: "abwesend", schwere: "danger", datum: d, ref: p.id, personId: p.id,
          titel: `Dienst trotz ${abwArt(w.art).label} — ${p.nachname}`, text: `Eingetragen: ${a}. Abwesend bis ${fKurz(w.bis)}` });
      }

      /* --- § 4 ArbZG Ruhepausen und § 3 ArbZG Tagesgrenze ---

         Beide Regeln standen in regelwerk.js und waren dort geprüft, wurden
         aber nie auf einen Plan angewendet: In App.jsx hingen sie als tote
         Importe. Ein Dienst über zehn Stunden und ein Dienst ohne
         ausreichende Pause liefen deshalb ohne Befund durch. */
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        /* Abgeschlossener Monat (WP-16, Review H1): der eingefrorene Dienst und seine Ist-Dauer. Geprüft
           werden wie bisher nur geplante Dienste, kein ungeplanter. */
        const tz = eingefrorenerTag(m, p, d) !== undefined ? istTag(m, p, d) : null;
        let da;
        if (tz) da = tz.da && !tz.da.ungeplant ? tz.da : null;
        else {
          const t = personTag(m, p, d);
          if (t.abwesenheit || !t.dienstId) continue;
          da = m.dienstarten.find((x) => x.id === t.dienstId);
        }
        if (!da || da.form === "ruf") continue;

        /* Gegen die tatsächlich erfassten Zeiten, wo sie bestätigt sind —
           sonst gegen den Plan. Die Pause ist Teil der Dienstart, weil sie
           nach § 4 Satz 1 im Voraus feststehen muss. */
        const ist = pruefZeitFuer(m, p, d, da);
        /* Ohne Zugang zu den Ist-Daten nicht bewertbar — nie gegen den Plan
           als Ersatz prüfen. Ein Befund für die ganze Ansicht genügt. */
        if (!ist) {
          if (!out.some((x) => x.art === "istdaten"))
            push({ art: "istdaten", schwere: "warn", datum: von, ref: "istdaten",
              titel: "Pausen, Tageshöchstarbeitszeit und Ausgleichszeitraum nicht bewertbar",
              text: `${ISTDATEN_TEXT} Diese Prüfungen brauchen die tatsächlichen Arbeitszeiten.` });
          continue;
        }

        /* Jugendliche: § 11 JArbSchG (WP-16) — dieselbe Rechnung wie Stempeln und Korrektur. */
        const jungAm = alterAm(p.geburtstag, d) !== null && alterAm(p.geburtstag, d) < 18;
        if (!pauseGenuegt(ist, jungAm)) {
          const anwesend = bruttoAm(d, ist);
          const noetig = pausePflicht(anwesend - (ist.pause || 0) / 60, jungAm);
          push({ art: "pause", schwere: "danger", datum: d, ref: `${p.id}|pause`, personId: p.id,
            titel: `Ruhepause zu kurz — ${p.nachname}`,
            text: `${da.name}: ${ist.pause || 0} min eingetragen, nötig sind ${noetig} min bei ${n1(anwesend)} h Anwesenheit` });
        }

        const std = tz ? tz.idn.std : istDauer(m, p, d, da).std;
        /* Lange Dienste (Nutzerentscheidung, WP-22): automatisch erlaubt — nur
           ein Hinweis. Ob eine Regelung nach § 7 ArbZG (Tarifvertrag,
           Betriebsvereinbarung) die Verlängerung trägt, verantwortet der Betrieb. */
        if (tagesgrenzeVerletzt(std)) {
          push({ art: "tagesgrenze", schwere: "info", datum: d, ref: `${p.id}|tag`, personId: p.id,
            titel: `Über zehn Stunden — ${p.nachname}`,
            text: `${da.name} ergibt ${n1(std)} h. Mehr als ${HOECHST_TAG} h werktäglich erlaubt § 3 nur mit einer Regelung nach § 7 ArbZG (Tarif oder Betriebsvereinbarung) — das verantwortet der Betrieb.` });
        }
      }

      /* --- § 11 ArbZG Sonn- und Feiertagsruhe ---

         Zwei Vorschriften, die vorher beide fehlten. Der Ersatzruhetag wird
         zugeordnet, nicht gezählt: Ein einzelner freier Tag zwischen zwei
         gearbeiteten Sonntagen deckt nur einen von beiden.

         Gesucht wird über den geprüften Zeitraum hinaus, weil der Ersatztag
         davor oder danach liegen darf. Beurteilt wird nur, was vollständig
         im betrachteten Fenster liegt — für einen Anspruch am Rand ist die
         Antwort schlicht noch nicht bekannt, und eine Meldung „kein
         Ersatzruhetag" wäre dort schlicht falsch. */
      const ARBEITET = new Map();
      const arbeitet = (d) => {
        if (ARBEITET.has(d)) return ARBEITET.get(d);
        const t = personTag(m, p, d);
        const da = t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
        const v = !t.abwesenheit && !!da && da.form !== "ruf";
        ARBEITET.set(d, v);
        return v;
      };
      const istFei = (d) => !!feiertagFuer(m, d, p);
      const RAND = 56;                       // die längere Frist, § 11 Abs. 3 Satz 2
      const weitVon = addDays(von, -RAND), weitBis = addDays(bis, RAND);
      const er = ersatzruhetage(arbeitet, istFei, weitVon, weitBis);
      for (const o of er.offen) {
        if (o.datum < von || o.datum > bis) continue;
        /* Nur melden, wenn das ganze Fenster betrachtet wurde. */
        if (addDays(o.datum, -(o.frist - 1)) < weitVon) continue;
        if (addDays(o.datum, o.frist - 1) > weitBis) continue;
        push({ art: "ersatzruhe", schwere: "warn", datum: o.datum, ref: `${p.id}|er`, personId: p.id,
          titel: `Ersatzruhetag fehlt — ${p.nachname}`,
          text: o.art === "sonntag"
            ? `Dienst am Sonntag, ${fKurz(o.datum)}. Innerhalb von zwei Wochen steht kein freier Werktag zur Verfügung.`
            : `Dienst am Feiertag, ${fKurz(o.datum)}. Innerhalb von acht Wochen steht kein freier Werktag zur Verfügung.` });
      }

      /* Die Jahresbilanz nach Absatz 1 ist kein Tagesereignis. Sie hängt am
         letzten Sonntag des geprüften Zeitraums, damit sie überhaupt
         irgendwo erscheint — und sie meldet erst dann einen Verstoß, wenn
         selbst alle noch offenen Sonntage die fünfzehn nicht mehr retten. */
      let letzterSo = null;
      for (let d = von; d <= bis; d = addDays(d, 1)) if (dow(d) === 6) letzterSo = d;
      if (letzterSo) {
        const jahr = Number(letzterSo.slice(0, 4));
        const fs = freieSonntage(arbeitet, jahr, letzterSo);
        if (fs.verletzt || fs.knapp)
          push({ art: "sonntagsfrei", schwere: fs.verletzt ? "danger" : "warn",
            datum: letzterSo, ref: `${p.id}|so${jahr}`, personId: p.id,
            titel: `Freie Sonntage ${fs.verletzt ? "unterschritten" : "knapp"} — ${p.nachname}`,
            text: fs.verletzt
              ? `${fs.frei} frei, ${fs.gearbeitet} gearbeitet. Selbst mit allen ${fs.offen} noch offenen Sonntagen sind ${FREIE_SONNTAGE_MIN} nicht mehr erreichbar.`
              : `${fs.frei} von ${FREIE_SONNTAGE_MIN} bisher frei, ${fs.offen} Sonntage stehen noch offen.` });

        /* --- § 6 Abs. 3 ArbZG: die arbeitsmedizinische Untersuchung ---

           Ein Anspruch der Beschäftigten, keine Pflicht. Der Befund sagt dem
           Betrieb, dass das Angebot fällig ist — er sperrt nie einen Einsatz,
           denn wer nicht untersucht werden will, muss nicht. */
        const vs = vorsorgeFaellig({
          nachtTage: nachtTageImJahr(m, p, jahr),
          alter: alterAm(p.geburtstag, letzterSo),
          letzte: p.nachtvorsorge || null,
          stichtag: letzterSo,
        });
        /* Ohne Rohdaten (Sicht der Schichtverantwortung, Commit S1) gibt es
           weder Untersuchungsdatum noch Alter — und die Pflicht liegt bei
           Planung und Leitung. Kein Befund statt eines falschen. */
        if (vs.nachtarbeitnehmer && vs.faellig && !("sichtbereich" in p))
          push({ art: "vorsorge", schwere: "warn", datum: letzterSo, ref: `${p.id}|vs${jahr}`, personId: p.id,
            titel: `Arbeitsmedizinische Untersuchung anzubieten — ${p.nachname}`,
            text: vs.letzte
              ? `Zuletzt am ${fKurz(vs.letzte)}, fällig seit ${fKurz(vs.faellig_am)} (Abstand ${vs.abstand} Monate).`
              : `Noch keine Untersuchung hinterlegt. Der Anspruch besteht schon vor Beginn der Nachtarbeit.` });
      }
      // Personenbezogene Einschränkungen
      const ein = p.einschraenkungen || {};
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        if (ein.keineNacht && nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen))
          push({ art: "einschraenkung", schwere: EINSCHRAENKUNG_BEWERTUNG.keineNacht.schwere, datum: d, ref: p.id, personId: p.id,
            titel: `Nachtdienst trotz Einschränkung — ${p.nachname}`,
            text: `${da.name} eingeteilt, obwohl keine Nachtdienste zugelassen sind` });
        if (ein.keinAlleindienst) {
          const mit = besetzung(m, d)[t.dienstId].personen.filter((x) => x.id !== p.id && !(x.einschraenkungen || {}).keinAlleindienst);
          if (mit.length === 0)
            push({ art: "einschraenkung", schwere: EINSCHRAENKUNG_BEWERTUNG.keinAlleindienst.schwere, datum: d, ref: p.id, personId: p.id,
              titel: `Alleindienst nicht zulässig — ${p.nachname}`,
              text: `${da.name}: keine weitere eingewiesene Person eingeteilt` });
        }
        /* Ohne Rohdaten kommt die Grenze neutral aus planungsregeln (S1). */
        const wNeutral = !ein.wiedereingliederung ? stundengrenzeAusRegeln(p.planungsregeln) : null;
        const w = ein.wiedereingliederung || wNeutral;
        if (w && w.von <= d && w.bis >= d && dow(d) === 0) {
          let std = 0;
          for (let i = 0; i < 7; i++) { const tt = personTag(m, p, addDays(d, i));
            if (!tt.dienstId) continue; const xx = m.dienstarten.find((y) => y.id === tt.dienstId); if (xx) std += dauer(xx); }
          if (std > w.maxStundenWoche)
            push({ art: "einschraenkung", schwere: "warn", datum: d, ref: p.id, personId: p.id, neutral: !!wNeutral,
              titel: wNeutral ? `Wochenstundengrenze überschritten — ${p.nachname}` : `Wiedereingliederung überschritten — ${p.nachname}`,
              text: `${n1(std)} h geplant, zulässig sind ${n1(w.maxStundenWoche)} h je Woche` });
        }
      }
      if (ein.maxDiensteWoche) {
        for (let d = montag(von); d <= bis; d = addDays(d, 7)) {
          let n = 0;
          for (let i = 0; i < 7; i++) if (personTag(m, p, addDays(d, i)).dienstId) n++;
          if (n > ein.maxDiensteWoche)
            push({ art: "einschraenkung", schwere: EINSCHRAENKUNG_BEWERTUNG.maxDiensteWoche.schwere, datum: d < von ? von : d, ref: `${p.id}|w`, personId: p.id,
              titel: `${n} Dienste in der Woche — ${p.nachname}`,
              text: `vereinbart sind höchstens ${ein.maxDiensteWoche}` });
        }
      }
      // Dienst mit abgelaufenem Pflichtnachweis
      for (const qid of p.qualifikationen) {
        const q = m.qualifikationen.find((x) => x.id === qid);
        if (!q || !q.nachweisPflicht) continue;
        const st = nachweisStand(m, p, qid);
        if (st.stand !== "abgelaufen") continue;
        for (let d = von; d <= bis; d = addDays(d, 1)) {
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
          if (!da2 || !(da2.mindestQual || {})[qid]) continue;
          push({ art: "nachweis", schwere: "danger", datum: d, ref: `${p.id}|${qid}`, personId: p.id,
            titel: `Nachweis abgelaufen — ${p.nachname}`,
            text: `${q.name} seit ${fKurz(st.ablauf)} ungültig, wird aber für ${da2.name} gezählt` });
          break;
        }
      }
      /* Harte Sperre: eine zwingende Qualifikation gilt für jeden Dienst,
         nicht nur dort, wo sie als Mindestbesetzung genannt ist.

         Der Wortlaut folgt jetzt der Ebene. Vorher stand unter jeder Sperre
         „Der Einsatz ist unzulässig" — auch dann, wenn dahinter nur eine
         betriebliche Festlegung stand. Eine Anwendung, die Gesetzeskraft
         behauptet, wo keine ist, richtet mehr Schaden an als eine, die
         schweigt.

         Und Landesrecht wirkt nur dort, wo es gilt: Eine Anforderung, die
         Nordrhein-Westfalen stellt, sperrt keinen Dienst am bayerischen
         Standort desselben Betriebs. */
      {
        for (const q of m.qualifikationen) {
          if (!q.harteSperre) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const t2 = personTag(m, p, d);
            if (!t2.dienstId) continue;
            const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
            if (!da2 || da2.form === "ruf") continue;
            if (qualGueltig(m, p, q.id)) continue;
            const v = sperreWirkt(m, q, landFuerEinheit(m, einheitAm(p, d)));
            if (!v) continue;
            const st = nachweisStand(m, p, q.id);
            const woher = st.stand === "abgelaufen"
              ? `${q.name} ist seit ${fKurz(st.ablauf)} ungültig.`
              : `${q.name} liegt nicht vor.`;
            push({ art: "sperre", schwere: v.gesetzlich ? "danger" : "warn",
              datum: d, ref: `${p.id}|${q.id}`, personId: p.id,
              titel: `Einsatz ohne ${q.name} — ${p.nachname}`,
              text: `${woher} Der Einsatz am ${fKurz(d)} ist ${v.wort}`
                + (v.gesetzlich ? "." : ` — ${v.label}, kein gesetzliches Verbot.`),
              /* Die Fundstelle kommt aus der Qualifikation selbst, nicht aus
                 der festen Tabelle: Was hier gilt, hat der Betrieb hinterlegt. */
              quelle: q.grundlage || null, ebene: v.ebene });
            break;
          }
        }
      }
      const l = (absIdx(m).get(p.id) || []).filter((a) => a.bis >= von && a.von <= bis);
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
        if (l[i].von <= l[j].bis && l[j].von <= l[i].bis)
          push({ art: "ueberlappung", schwere: "danger", datum: l[j].von > von ? l[j].von : von, ref: `${p.id}|${i}|${j}`, personId: p.id,
            titel: `Überlappende Abwesenheiten — ${p.nachname}`,
            text: `${abwArt(l[i].art).label} und ${abwArt(l[j].art).label} überschneiden sich` });
    }
    /* --- Besondere Personengruppen ---

       Jugendliche, Schwangere und Stillende, schwerbehinderte Menschen. Drei
       Fälle, in denen ein Plan unzulässig ist, der für alle anderen in
       Ordnung wäre — und alle drei sind in Pflege und Sicherheit alltäglich.

       Die Regeln stehen in src/regelwerk.js und sind dort geprüft; hier
       werden sie nur auf den Plan angewendet. */
    /* Drei Wege, nie zwei zugleich (Commit S1):
       - Rohdaten (Planung, Leitung): schutzBefunde, mit Fundstelle;
       - Einsatzregeln (Schichtverantwortung, Bereich und Pool): regelBefunde,
         neutral — ohne Diagnose, ohne Gesetz;
       - die Sicht erwartet Einsatzregeln, sie fehlen: Die Prüfung ist nicht
         möglich, und das sperrt (fail-closed). Eine Person ohne Daten ist
         nicht frei planbar. */
    for (const p of m.personen) {
      if (!imDienst(p, von) && !imDienst(p, bis)) continue;
      const abgeleitet = Array.isArray(p.planungsregeln);
      const erwartet = p.sichtbereich === "bereich" || p.sichtbereich === "pool";
      if (!abgeleitet && !erwartet) {
        /* Ohne Merkmal und mit bekanntem Alter ab 18 gibt es nichts zu prüfen —
           das spart bei einem Betrieb ohne Jugendliche und ohne Mutterschutz
           den ganzen Durchlauf. Ein unbekanntes Alter (Geburtsdatum fehlt oder
           ungültig) überspringt die Prüfung nicht: Es wird einmal je Person als
           „nicht bewertbar" gemeldet (Kette A). */
        const alterHeute = alterAm(p.geburtstag || p.geburtsdatum, bis);
        if (!p.mutterschutz && !p.schwerbehindert && alterHeute !== null && alterHeute >= 18) continue;
      }
      if (abgeleitet && !p.planungsregeln.some((x) => x && x.regel !== "stundengrenzeWoche")) continue;
      let datenGemeldet = false;

      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.abwesenheit || !t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        /* Die eine Schutzprüfung (schutzEinsatz), wie im Warndialog. */
        for (const b of schutzEinsatz(p, da, d, m.einstellungen)) {
          if (b.offen) { if (datenGemeldet) continue; datenGemeldet = true; }
          push({ art: "schutz", schwere: b.schwere, datum: d,
            ref: `${p.id}|${b.regel}`, personId: p.id, neutral: b.neutral,
            titel: b.regel === "pruefungNichtMoeglich" ? `Schutzprüfung nicht möglich — ${p.nachname}`
              : b.neutral ? `Einsatzregel verletzt — ${p.nachname}` : `${b.regel} — ${p.nachname}`,
            text: `${b.text} Eingeteilt ist ${da.name} am ${fKurz(d)}.` });
        }
      }
    }

    /* --- Die Regeln selbst, nicht der Plan ---

       Eine Sperre ohne Grundlage ist keine Rechtsdurchsetzung, sondern eine
       Behauptung. Und eine tätigkeitsabhängige Anforderung, die pauschal
       jeden Dienst sperrt, ist genau der Fehler, den § 34a GewO nicht
       hergibt — dort unterscheidet das Gesetz nach Tätigkeiten, und wer das
       einebnet, sperrt Menschen von Diensten aus, die sie ausüben dürfen.

       Der Befund hängt am ersten Tag des Zeitraums: Er gilt für den Betrieb,
       nicht für einen Tag. */
    for (const q of m.qualifikationen) {
      for (const mangel of regelMaengel(q)) {
        push({ art: "regelsatz", schwere: mangel.schwere, datum: von, ref: `q|${q.id}|${mangel.art}`,
          titel: `Regel prüfen: ${q.name}`, text: mangel.text });
      }
    }

    for (let d = von; d <= bis; d = addDays(d, 1)) for (const e of m.einheiten) {
      const n = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && (abwesenheitAm(m, p.id, d) || {}).art === "urlaub").length;
      if (n > m.einstellungen.maxUrlaubJeEinheit)
        push({ art: "urlaub", schwere: "warn", datum: d, ref: e.id, titel: `${e.name}: ${n} gleichzeitig im Urlaub`,
          text: `Obergrenze ${m.einstellungen.maxUrlaubJeEinheit}` });
    }
    out.sort((a, b) => a.datum === b.datum ? (a.schwere === b.schwere ? 0 : a.schwere === "danger" ? -1 : 1) : (a.datum < b.datum ? -1 : 1));
    return out;
  });
}
/**
 * Wie schwer eine Einschränkung an der Person wiegt — für Planprüfung
 * (pruefen: schwere) und Einteilung (hindernisBefunde: stufe) aus derselben
 * Quelle: der Spalte `sperrt` im Befundkatalog (SPERR_REGELN, WP-11). Bis
 * dahin meldete die Planprüfung „keine Nacht" als Verstoß (danger), der
 * Warndialog nur „Achtung" zum Wegklicken, und die Höchstzahl Dienste je
 * Woche war hier „warn", im Dialog „recht". Bis zur Fachentscheidung gilt
 * die strenge Variante (Review H1): alle drei sperren.
 */
export const EINSCHRAENKUNG_BEWERTUNG = Object.fromEntries(["keineNacht", "keinAlleindienst", "maxDiensteWoche"]
  .map((k) => [k, sperrtArt(k) ? { stufe: "recht", schwere: "danger" } : { stufe: "achtung", schwere: "warn" }]));
export function fachkraftLage(m, datum, dienstId) {
  if (!kann(m, "fachkraftquote")) return null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da || !da.fachkraftQuote) return null;
  const b = besetzung(m, datum)[dienstId];
  const fkQuals = m.qualifikationen.filter((q) => q.fachkraft).map((q) => q.id);
  if (!fkQuals.length) return null;
  const fk = b.personen.filter((p) => fkQuals.some((q) => qualGueltig(m, p, q))).length;
  const ist = b.anzahl > 0 ? fk / b.anzahl : 0;
  const noetig = Math.ceil(b.anzahl * da.fachkraftQuote);
  return { fk, gesamt: b.anzahl, ist: Math.round(ist * 100), soll: Math.round(da.fachkraftQuote * 100),
    noetig, fehlt: Math.max(0, noetig - fk), erfuellt: fk >= noetig };
}
