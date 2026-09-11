import { getStore } from "../lib/ablage.mjs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort } from "../lib/schutz.mjs";

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
const sitzungen = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

const antwort = (d, status = 200) => new Response(JSON.stringify(d),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sitzung(req) {
  const kopf = req.headers.get("authorization") || "";
  const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
  if (!token) return null;
  const s = await sitzungen().get(`t:${hash(token)}`, { type: "json" });
  if (!s || s.bis < Date.now()) return null;
  return s;
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

const esc = (s) => String(s || "")
  .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
  .replace(/\n/g, "\\n");

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
      z.push(`DTEND;TZID=Europe/Berlin:${lokal(t.endDatum, t.bisZeit)}`);
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

      const daten = await store().get(`feeddaten:${hash(geheim)}`, { type: "json" });
      if (!daten) return new Response("Noch keine Daten", { status: 404 });

      const ics = baueICS(daten.name, daten.betrieb, daten.termine || []);
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
    const s = await sitzung(req);
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);

    /* Feed einrichten oder erneuern */
    if (pfad === "einrichten" && req.method === "POST") {
      const { personId, alt } = await req.json();
      if (!personId) return antwort({ fehler: "Keine Person." }, 400);
      /* Ein bestehendes Geheimnis wird ungültig — so lässt sich ein Verweis
         zurückziehen, der versehentlich weitergegeben wurde. */
      /* Beide Schlüssel löschen. Vorher blieb feeddaten: liegen — nicht
         mehr abrufbar, aber gespeichert, was dem Zweck eines Widerrufs
         widerspricht. */
      if (alt) {
        await store().delete(`feed:${hash(alt)}`).catch(() => {});
        await store().delete(`feeddaten:${hash(alt)}`).catch(() => {});
      }
      const geheim = randomBytes(24).toString("base64url");
      await store().setJSON(`feed:${hash(geheim)}`, {
        bestand: s.bestand, personId, seit: new Date().toISOString() });
      return antwort({ ok: true, geheim,
        verweis: `${url.origin}/kalender/feed/${geheim}.ics` });
    }

    /* Termine hinterlegen — die Anwendung rechnet, der Server speichert nur */
    if (pfad === "daten" && req.method === "POST") {
      const { geheim, name, betrieb, termine } = await req.json();
      if (!geheim || !Array.isArray(termine))
        return antwort({ fehler: "Unvollständig." }, 400);
      const eintrag = await store().get(`feed:${hash(geheim)}`, { type: "json" });
      if (!eintrag || eintrag.bestand !== s.bestand)
        return antwort({ fehler: "Unbekannter Verweis." }, 404);
      if (termine.length > 800) return antwort({ fehler: "Zu viele Termine." }, 400);
      await store().setJSON(`feeddaten:${hash(geheim)}`,
        { name, betrieb, termine, stand: new Date().toISOString() });
      return antwort({ ok: true, termine: termine.length });
    }

    /* Feed abschalten */
    if (pfad === "loeschen" && req.method === "POST") {
      const { geheim } = await req.json();
      if (geheim) {
        /* Prüfen, ob der Verweis zum eigenen Betrieb gehört — wie es
           „daten" weiter oben bereits richtig macht. */
        const eintrag = await store().get(`feed:${hash(geheim)}`, { type: "json" });
        if (eintrag && eintrag.bestand !== s.bestand)
          return antwort({ fehler: "Unbekannter Verweis." }, 404);
        await store().delete(`feed:${hash(geheim)}`).catch(() => {});
        await store().delete(`feeddaten:${hash(geheim)}`).catch(() => {});
      }
      return antwort({ ok: true });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    return antwort({ fehler: "Serverfehler" }, 500);
  }
};

export const config = { path: ["/kalender/*"] };
