import { getStore } from "../lib/ablage.mjs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { bestandLesen, altBestandSchluessel } from "../lib/bestand.mjs";
import { eigenerMandant, rolleBekannt } from "../lib/rechte.mjs";
import { kernSchluessel } from "../lib/scherben.mjs";
import { heuteBerlin } from "../lib/zeiterfassung.mjs";

/* ==========================================================================
   KALENDER-FEED

   Der Dienstplan landet dort, wo die Leute ohnehin hinschauen: im eigenen
   Kalender auf dem Telefon. Einmal abonniert, aktualisiert er sich von
   selbst — auch wenn sich der Plan ändert.

   Zwei Entscheidungen, die den Unterschied machen:

   Der Feed hängt an einem eigenen Geheimnis, nicht an der Anmeldung. Sonst
   müsste der Kalender die Sitzung erneuern, was er nicht kann. Das Geheimnis
   lässt sich einzeln zurückziehen, ohne den Zugang zu ändern.

   Der Feed zeigt nur die eigenen Dienste. Kein Kollege, keine Besetzung,
   keine Abwesenheitsgründe — ein abonnierter Kalender ist am Ende eine
   Datei auf einem fremden Gerät.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });

/* --------------------------------------------------------------------------
   WESSEN KALENDER — immer die eigene Person (Commit 3)

   Bis Oktober 2026 nahm „einrichten" die Person aus dem Rumpf, „alt"
   löschte jeden Feed, dessen Geheimnis man kannte, und „daten"/„loeschen"
   prüften nur den Raum: Mit dem Geheimnis einer Person aus einem anderen
   Betrieb ließ sich deren Feed überschreiben oder abschalten. Und weil
   Beschäftigte ihr Geheimnis nicht speichern konnten, blieb nach dem
   Neuladen jeder alte Feed gültig — ein weitergegebener Verweis ließ sich
   nicht mehr zurückziehen.

   Jetzt bestimmt die Sitzung die Person: Raum, Betrieb (mandantId) und
   Personenkennung. Eine personId im Rumpf zählt nicht. Je Person zeigt
   ein Index auf das eine aktive Geheimnis — nur als Hash:
     feedperson:<raum>:<mandantId>:<personId>  →  { hash, seit }
   Der Feed-Eintrag trägt dieselbe Bindung. Werte im Bestand (kalenderGeheim
   an der Person) entscheiden nie über Berechtigungen; sie sind nur, was die
   Oberfläche anzeigt.
   -------------------------------------------------------------------------- */
const NUR_EIGENE = "Den Kalender gibt es nur für die eigene Person.";
const indexSchluessel = (b) => `feedperson:${b.raum}:${b.mandantId}:${b.personId}`;

/** Die Bindung der Sitzung: Raum, eigener Betrieb, eigene Person — oder null. */
async function eigeneBindung(s) {
  if (!s || s.person === null || s.person === undefined || s.rolle === "betreiber") return null;
  const gelesen = await bestandLesen(store(), s.bestand).catch(() => null);
  const bestand = gelesen && gelesen.bestand;
  const m = bestand ? eigenerMandant(bestand, s) : null;
  if (!m || !Array.isArray(m.personen) || !m.personen.some((p) => p && String(p.id) === String(s.person))) return null;
  /* Ein alter Feed ohne Betriebskennung gehört nur dann sicher dieser
     Person, wenn ihre Kennung im Raum in keinem anderen Betrieb vorkommt. */
  const eindeutig = (bestand.mandanten || []).filter((x) => x && Array.isArray(x.personen)
    && x.personen.some((p) => p && String(p.id) === String(s.person))).length === 1;
  return { raum: s.bestand, mandantId: m.id, personId: String(s.person), eindeutig };
}

/** Gehört dieser Feed-Eintrag sicher der eigenen Person? */
function gehoertMir(eintrag, b) {
  if (!eintrag || eintrag.bestand !== b.raum || String(eintrag.personId) !== b.personId) return false;
  if (eintrag.mandantId) return eintrag.mandantId === b.mandantId;
  return b.eindeutig;                                   // Altfeed: nur bei eindeutiger Zuordnung
}

/* --------------------------------------------------------------------------
   GILT DER FEED NOCH? — bei jedem Abruf (Commit D1f)

   Das Geheimnis ist ein Bearer-Zugang ohne Sitzung. Es allein reicht nicht:
   Die Berechtigung dahinter muss jetzt noch bestehen. Bis D1f lieferte der
   Feed weiter, wenn die Person ausgetreten, gesperrt, anonymisiert oder
   aus dem Betrieb entfernt war — auch nach Löschen des Betriebs.

   Geprüft wird gegen den gespeicherten Kern (dort stehen die Personen):
   Raum vorhanden, Betrieb mit der Kennung des Feeds vorhanden, Person in
   genau diesem Betrieb, nicht anonymisiert, nicht gesperrt (status außer
   „aktiv" gilt als deaktiviert), nicht ausgetreten (Austrittstag zählt noch
   wie in imDienst), Rolle bekannt (BEKANNTE_ROLLEN aus rechte.mjs; ohne
   Angabe „mitarbeiter" wie in der Oberfläche; „betreiber" und „kunde" sind
   keine Rollen von Personen).

   Fehlt die Berechtigung, wird der Feed endgültig widerrufen (Commit D1g):
   feed:, feeddaten: und der genau zugehörige feedperson:-Index werden
   gelöscht. Kehrt die Person später zurück, gilt der alte Verweis nicht
   wieder — sie richtet einen neuen Feed ein. Ein weitergegebener Bearer-Link
   lebt damit nicht über einen Autoritätsentzug hinaus.

   Widerrufen wird nur bei eindeutigem fachlichem Befund. Ein Lesefehler der
   Ablage (nicht erreichbar, beschädigter Umschlag) ist keiner: Er wirft,
   endet im allgemeinen Fehlerzweig (500, protokolliert) und lässt den Feed
   unangetastet.

   Noch nicht geprüft: Konto, Mitgliedschaft, Sperre des Zugangscodes. Dafür
   müsste ein Feed seine Herkunft tragen (Zugangscode bzw. accountId und
   Generation) — ein späterer Schritt; Feeds ohne diese Angabe würden dann
   weiterhin nur über Person und Betrieb geprüft.
   -------------------------------------------------------------------------- */
async function feedBetrieb(raum) {
  /* Kein .catch: Ein Lesefehler soll werfen (kein Widerruf), nur ein
     fehlender Schlüssel ergibt null (Raum gibt es nicht mehr). */
  const kern = await store().get(kernSchluessel(raum), { type: "json" });
  if (kern) return kern;
  /* Ein noch nicht zerlegter Altbestand liegt als ein Blob vor. */
  return (await store().get(altBestandSchluessel(raum), { type: "json" })) || null;
}

export function feedPersonGilt(bestand, eintrag, heute = heuteBerlin()) {
  if (!bestand || !Array.isArray(bestand.mandanten) || !eintrag || !eintrag.mandantId) return false;
  const m = bestand.mandanten.filter((x) => x && x.id === eintrag.mandantId);
  if (m.length !== 1 || !Array.isArray(m[0].personen)) return false;
  const p = m[0].personen.filter((x) => x && String(x.id) === String(eintrag.personId));
  if (p.length !== 1) return false;
  const person = p[0];
  if (person.anonym) return false;
  if (person.status !== undefined && person.status !== null && person.status !== "aktiv") return false;
  if (person.austritt && String(person.austritt) < heute) return false;
  const rolle = person.rolle ?? "mitarbeiter";
  return typeof rolle === "string" && rolleBekannt(rolle) && rolle !== "betreiber" && rolle !== "kunde";
}

/** Einen Feed endgültig widerrufen: feed:, feeddaten: und nur der
    feedperson:-Index, der genau auf diesen Hash zeigt (Altfeed ohne
    Betriebskennung, Commit D1f; fehlende Berechtigung, Commit D1g). */
async function feedEndgueltigWiderrufen(h, eintrag) {
  await feedWiderrufen(h);
  if (!eintrag || typeof eintrag.bestand !== "string" || !eintrag.bestand) return;
  const { blobs } = await store().list({ prefix: `feedperson:${eintrag.bestand}:` }).catch(() => ({ blobs: [] }));
  for (const x of blobs || []) {
    const idx = await store().get(x.key, { type: "json" }).catch(() => null);
    if (idx && idx.hash === h) await store().delete(x.key).catch(() => {});
  }
}

async function feedWiderrufen(h) {
  await store().delete(`feed:${h}`).catch(() => {});
  await store().delete(`feeddaten:${h}`).catch(() => {});
}

/** Alle sicher eigenen Feeds außer `behalten` widerrufen — aktiver Index,
    mitgeschicktes Geheimnis, Altfeeds aus der Zeit vor dem Index. */
async function eigeneFeedsWiderrufen(b, behalten = null, zusaetzlich = null) {
  const ziele = new Set();
  const index = await store().get(indexSchluessel(b), { type: "json" }).catch(() => null);
  if (index && index.hash) ziele.add(index.hash);
  if (zusaetzlich) ziele.add(zusaetzlich);
  const { blobs } = await store().list({ prefix: "feed:" }).catch(() => ({ blobs: [] }));
  for (const x of blobs || []) ziele.add(x.key.slice(5));
  let weg = 0;
  for (const h of ziele) {
    if (!h || h === behalten) continue;
    const eintrag = await store().get(`feed:${h}`, { type: "json" }).catch(() => null);
    if (!gehoertMir(eintrag, b)) continue;               // fremd oder mehrdeutig: unangetastet
    await feedWiderrufen(h);
    weg++;
  }
  return weg;
}
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

const antwort = (d, status = 200) => new Response(JSON.stringify(d),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/* Der Rumpf: kaputtes JSON ist ein Fehler des Aufrufers (400), kein
   Serverfehler. Achthundert Termine passen bequem in ein Megabyte. */
const RUMPF_MAX = 1024 * 1024;

async function rumpfLesen(req) {
  if (Number(req.headers.get("content-length") || 0) > RUMPF_MAX)
    return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  let text;
  try { text = await req.text(); } catch { text = ""; }
  if (text.length > RUMPF_MAX) return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  try {
    const daten = JSON.parse(text || "{}");
    if (!daten || typeof daten !== "object" || Array.isArray(daten))
      return { antwort: antwort({ fehler: "Der Rumpf muss ein JSON-Objekt sein." }, 400) };
    return { daten };
  } catch {
    return { antwort: antwort({ fehler: "Der Rumpf ist kein gültiges JSON." }, 400) };
  }
}

/* ---------------------------- Termine prüfen ------------------------------

   Bisher speicherte /kalender/daten jede Liste, die ein Array war. Ein
   Termin ohne Uhrzeit oder mit kaputtem Datum fiel erst beim Abruf des
   Feeds auf — als 500, den der Kalender des Beschäftigten stumm schluckte.
   Und was in eine ICS-Zeile wandert (Kennung, Datum, Uhrzeit), ging
   ungeprüft hinein: Ein Zeilenumbruch darin hätte eigene Zeilen in den
   Feed geschrieben.

   Geprüft wird genau die Form, die die Anwendung baut (kalenderTermine in
   App.jsx): ein ganztägiger Termin mit datum und bis, oder ein Dienst mit
   datum/von und endDatum/bisZeit; endDatum ist derselbe Tag oder bei
   Nachtdiensten der nächste. „24:00" ist als Dienstende erlaubt. */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const KENNUNG = /^[A-Za-z0-9_.:-]{1,120}$/;
const TEXT_MAX = 200;

/* Rundreise über Date: „2026-02-30" wird zum 2. März und fällt durch;
   „2026-13-01" ist gar kein Datum (getTime NaN) und darf nicht werfen. */
const datumGueltig = (s) => {
  if (typeof s !== "string" || !DATUM.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const naechsterTag = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const textGueltig = (s, pflicht) => (s === undefined || s === null || s === "")
  ? !pflicht : typeof s === "string" && s.length <= TEXT_MAX;

/** Warum ein Termin nicht passt (Feldname) — oder null. */
export function terminFehler(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return "termin";
  if (typeof t.id !== "string" || !KENNUNG.test(t.id)) return "id";
  if (!datumGueltig(t.datum)) return "datum";
  if (!textGueltig(t.titel, true)) return "titel";
  if (!textGueltig(t.text, false)) return "text";
  if (!textGueltig(t.ort, false)) return "ort";
  if (t.ganztags === true) {
    if (!datumGueltig(t.bis) || t.bis <= t.datum) return "bis";
    return null;
  }
  if (t.ganztags !== undefined && t.ganztags !== false) return "ganztags";
  if (typeof t.von !== "string" || !ZEIT.test(t.von)) return "von";
  if (!datumGueltig(t.endDatum) || (t.endDatum !== t.datum && t.endDatum !== naechsterTag(t.datum)))
    return "endDatum";
  if (typeof t.bisZeit !== "string" || !(ZEIT.test(t.bisZeit) || t.bisZeit === "24:00")) return "bisZeit";
  if (t.endDatum === t.datum && t.bisZeit <= t.von) return "bisZeit";
  return null;
}


/* ------------------------------ ICS bauen -------------------------------- */

const zeile = (s) => {
  /* RFC 5545 verlangt Zeilen unter 75 Oktett. Fortsetzungen beginnen mit
     einem Leerzeichen — sonst verweigern manche Kalender die Datei. */
  const b = Buffer.from(s, "utf8");
  if (b.length <= 73) return s;
  const teile = [];
  let rest = s;
  while (Buffer.from(rest, "utf8").length > 73) {
    let n = 73;
    while (Buffer.from(rest.slice(0, n), "utf8").length > 73) n--;
    teile.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  teile.push(rest);
  return teile[0] + teile.slice(1).map((t) => `\r\n ${t}`).join("");
};

/* Auch ein einzelnes \r ist für manche Kalender ein Zeilenende — es wird
   wie \n zu einem maskierten Umbruch, statt eine neue Zeile zu beginnen. */
const esc = (s) => String(s || "")
  .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
  .replace(/\r\n|\r|\n/g, "\\n");

const stempel = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

/** Ortszeit als schwebender Wert — der Kalender rechnet mit der Zonenangabe. */
const lokal = (datum, zeit) => `${datum.replace(/-/g, "")}T${zeit.replace(":", "")}00`;

function baueICS(name, betrieb, termine) {
  const z = ["BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//CENTRIC//Dienstplanung//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    zeile(`X-WR-CALNAME:Dienstplan ${esc(betrieb)}`),
    "X-WR-TIMEZONE:Europe/Berlin",
    /* Ohne diese Angabe fragen manche Kalender nur einmal am Tag nach. */
    "X-PUBLISHED-TTL:PT2H", "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    /* Die Zeitzone muss mitgeliefert werden, sonst verschieben sich
       Nachtdienste bei der Zeitumstellung. */
    "BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
    "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
    "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE"];

  const jetzt = stempel(new Date());
  for (const t of termine) {
    z.push("BEGIN:VEVENT");
    z.push(zeile(`UID:${t.id}@centric-dienstplanung`));
    z.push(`DTSTAMP:${jetzt}`);
    if (t.ganztags) {
      z.push(`DTSTART;VALUE=DATE:${t.datum.replace(/-/g, "")}`);
      z.push(`DTEND;VALUE=DATE:${t.bis.replace(/-/g, "")}`);
    } else {
      z.push(`DTSTART;TZID=Europe/Berlin:${lokal(t.datum, t.von)}`);
      /* „24:00" kennt ICS nicht (Stunden 0–23): Mitternacht des Folgetags. */
      z.push(`DTEND;TZID=Europe/Berlin:${t.bisZeit === "24:00"
        ? lokal(naechsterTag(t.endDatum), "00:00") : lokal(t.endDatum, t.bisZeit)}`);
    }
    z.push(zeile(`SUMMARY:${esc(t.titel)}`));
    if (t.text) z.push(zeile(`DESCRIPTION:${esc(t.text)}`));
    if (t.ort) z.push(zeile(`LOCATION:${esc(t.ort)}`));
    z.push("TRANSP:OPAQUE");
    z.push("END:VEVENT");
  }
  z.push("END:VCALENDAR");
  return z.join("\r\n") + "\r\n";
}

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(kalender)\/?/, "");

  /* Zustandsändernde Anfragen nur von der eigenen Seite (siehe schutz.mjs). */
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  try {
    /* ------------------- Feed abrufen (ohne Anmeldung) ---------------- */
    /* Der Kalender kann sich nicht anmelden. Statt einer Sitzung trägt der
       Verweis ein langes Geheimnis — wer ihn hat, sieht diesen einen Plan. */
    if (pfad.startsWith("feed/")) {
      const geheim = pfad.slice(5).replace(/\.ics$/, "");
      if (!geheim || geheim.length < 20) return new Response("Nicht gefunden", { status: 404 });

      const b = await bremse("lesen", `f:${hash(geheim).slice(0, 16)}`);
      if (!b.frei) return zuVielAntwort(b.wartet);

      const eintrag = await store().get(`feed:${hash(geheim)}`, { type: "json" });
      if (!eintrag) return new Response("Nicht gefunden", { status: 404 });

      /* Commit D1f: Gilt die Berechtigung noch? Sonst dieselbe Antwort wie
         bei einem unbekannten Geheimnis. Ein Altfeed ohne Betriebskennung
         wird dabei widerrufen — keine Zuordnung zu einem Betrieb geraten. */
      if (!eintrag.mandantId) {
        await feedEndgueltigWiderrufen(hash(geheim), eintrag);
        return new Response("Nicht gefunden", { status: 404 });
      }
      /* Commit D1g: Fehlt die Berechtigung, ist der Verweis endgültig
         verbraucht — auch wenn die Person später zurückkehrt. Ein Lesefehler
         wirft vorher (feedBetrieb) und widerruft nichts. */
      if (!feedPersonGilt(await feedBetrieb(eintrag.bestand), eintrag)) {
        await feedEndgueltigWiderrufen(hash(geheim), eintrag);
        return new Response("Nicht gefunden", { status: 404 });
      }

      const daten = await store().get(`feeddaten:${hash(geheim)}`, { type: "json" });
      if (!daten) return new Response("Noch keine Daten", { status: 404 });

      /* Was vor der Prüfung in /kalender/daten gespeichert wurde, kann
         ungültige Termine enthalten. Sie fehlen im Feed, statt ihn ganz
         scheitern zu lassen; beim nächsten Abgleich ersetzt die Anwendung
         die Liste ohnehin. */
      const termine = Array.isArray(daten.termine) ? daten.termine.filter((t) => !terminFehler(t)) : [];
      const ics = baueICS(daten.name, daten.betrieb, termine);
      return new Response(ics, { status: 200, headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `inline; filename="dienstplan.ics"`,
        /* Kurz zwischenspeichern: Kalender fragen oft, der Plan ändert sich selten. */
        /* private: Der Verweis trägt ein Geheimnis, und der Inhalt ist ein
           persönlicher Dienstplan — ein gemeinsamer Zwischenspeicher hat
           damit nichts zu tun. */
        "cache-control": "private, max-age=1800",
      } });
    }

    /* ---------------- Ab hier nur mit gültiger Sitzung ---------------- */
    /* Die Sitzung kommt aus dem einen Prüfpunkt (lib/arbeitssitzung.mjs): Merkmal,
       Frist, Untätigkeit und — bei einer Sitzung aus einem Konto — der Anker.
       Eine eigene Fassung des Lesens gab es hier bis Phase A.1; sie kannte
       weder die Untätigkeit noch hat sie je verlängert. */
    const s = (await arbeitssitzungLesen(req, { store: store() })).sitzung;
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);
    /* Unbekannte Rolle: kein Zugriff, auch nicht auf den eigenen Kalender (Commit D1e). */
    if (!rolleBekannt(s.rolle)) return antwort({ fehler: "Keine Berechtigung." }, 403);

    /* Alle Wege ab hier: nur für die eigene Person. */
    const b = (pfad === "einrichten" || pfad === "daten" || pfad === "loeschen") ? await eigeneBindung(s) : null;
    if ((pfad === "einrichten" || pfad === "daten" || pfad === "loeschen") && req.method === "POST" && !b)
      return antwort({ fehler: NUR_EIGENE }, 403);

    /* Feed einrichten oder erneuern — immer für die eigene Person; eine
       personId im Rumpf wird nicht gelesen. Reihenfolge ohne Transaktion:
       erst den neuen Feed anlegen, dann den Index umstellen, erst dann die
       alten widerrufen. Bricht es dazwischen ab, funktioniert der alte Feed
       weiter, und der nächste Lauf räumt den liegengebliebenen weg — nie
       steht die Person ohne Feed da, weil der alte zu früh gelöscht wurde. */
    if (pfad === "einrichten" && req.method === "POST") {
      const r = await rumpfLesen(req);
      if (r.antwort) return r.antwort;
      const { alt } = r.daten;
      const geheim = randomBytes(24).toString("base64url");
      const neu = hash(geheim);
      const seit = new Date().toISOString();
      await store().setJSON(`feed:${neu}`, { bestand: b.raum, mandantId: b.mandantId, personId: b.personId, seit });
      await store().setJSON(indexSchluessel(b), { hash: neu, seit });
      /* „alt" nur, wenn es nachweislich der eigenen Person gehört (gehoertMir). */
      await eigeneFeedsWiderrufen(b, neu, typeof alt === "string" && alt ? hash(alt) : null);
      return antwort({ ok: true, geheim,
        verweis: `${url.origin}/kalender/feed/${geheim}.ics` });
    }

    /* Termine hinterlegen — die Anwendung rechnet, der Server speichert nur */
    if (pfad === "daten" && req.method === "POST") {
      const r = await rumpfLesen(req);
      if (r.antwort) return r.antwort;
      const { geheim, name, betrieb, termine } = r.daten;
      if (typeof geheim !== "string" || !geheim || !Array.isArray(termine))
        return antwort({ fehler: "Unvollständig." }, 400);
      /* Nur der eigene Feed — fremd und unbekannt antworten gleich. */
      const eintrag = await store().get(`feed:${hash(geheim)}`, { type: "json" });
      if (!gehoertMir(eintrag, b))
        return antwort({ fehler: "Unbekannter Verweis." }, 404);
      if (termine.length > 800) return antwort({ fehler: "Zu viele Termine." }, 400);
      if (!textGueltig(name, false) || !textGueltig(betrieb, false))
        return antwort({ fehler: "Name oder Betrieb ungültig." }, 400);
      for (let i = 0; i < termine.length; i++) {
        const feld = terminFehler(termine[i]);
        if (feld) return antwort({ fehler: "Ungültiger Termin.", termin: i, feld }, 400);
      }
      await store().setJSON(`feeddaten:${hash(geheim)}`,
        { name, betrieb, termine, stand: new Date().toISOString() });
      return antwort({ ok: true, termine: termine.length });
    }

    /* Feed abschalten */
    if (pfad === "loeschen" && req.method === "POST") {
      const r = await rumpfLesen(req);
      if (r.antwort) return r.antwort;
      /* Den eigenen Kalender abschalten: den aktiven Feed, ein mitgeschicktes
         eigenes Geheimnis und eigene Altfeeds. Ein fremdes oder unbekanntes
         Geheimnis bleibt ohne Wirkung — die Antwort ist immer dieselbe. */
      const { geheim } = r.daten;
      await eigeneFeedsWiderrufen(b, null, typeof geheim === "string" && geheim ? hash(geheim) : null);
      await store().delete(indexSchluessel(b)).catch(() => {});
      return antwort({ ok: true });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    /* Nach außen nur, dass es schiefging; die Ursache ins Protokoll wie in
       daten.mjs. Bisher verschwand sie spurlos. Der Pfad des Feeds trägt das
       Geheimnis — protokolliert wird nur „feed". */
    const ort = pfad.startsWith("feed/") ? "kalender/feed" : `kalender/${pfad.slice(0, 40)}`;
    await protokoll("fehler", kennung(req, null), ort, String(e && e.message || e).slice(0, 200));
    return antwort({ fehler: "Serverfehler",
      text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/kalender/*"] };
