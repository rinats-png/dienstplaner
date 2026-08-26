import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { bremse, entlasten, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { bestandFuerRolle, zusammenfuehren, schreibumfang, absageText,
  SCHREIBEN_NEIN } from "../lib/rechte.mjs";
import { pruefeGestalt, schrumpfung, SICHERUNGSSCHWELLE } from "../lib/gestalt.mjs";
import { ablageSchluessel, findeKonto, umschluesseln, altHash } from "../lib/codes.mjs";
import { kontoLesen, kontoSchreiben, alleKonten, kontoVereinzeln,
  findeKontoMail } from "../lib/konten.mjs";
import { passwortPruefen } from "../lib/passwoerter.mjs";
import { darfVergeben } from "../lib/rollenvergabe.mjs";
import { selbststartVermerken } from "../lib/fortschritt.mjs";
import { sitzungsSpeicher, sitzungLesen } from "../lib/sitzungen.mjs";
import { bestandLesen, bestandSchreiben, raumBelegt } from "../lib/bestand.mjs";

/* ==========================================================================
   DATENSPEICHER

   Der Betrieb liegt als Kern plus Monatsscherben (siehe lib/bestand.mjs).
   Für die Oberfläche ändert sich dadurch nichts — sie bekommt und schickt
   weiterhin einen vollständigen Bestand.

   Konfliktschutz je Monat statt auf das Ganze: Zwei Planer, die an
   verschiedenen Monaten arbeiten, stören einander nicht mehr. Vorher verlor
   einer von beiden seine Arbeit, obwohl sie sich nie in die Quere kamen —
   bei einer Anwendung, deren Kern die gemeinsame Monatsplanung ist, traf
   das den Normalfall statt der Ausnahme.
   ========================================================================== */

const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzungen = sitzungsSpeicher;

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const gleich = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

const antwort = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", ...kopf },
  });

/* --------------------------------------------------------------------------
   ORTSPRÜFUNG

   Dieselbe Rechnung wie bisher im Browser — nur an einer Stelle, an der sie
   niemand umschreiben kann. Gespeichert wird weiterhin nur das Urteil, nie
   die Koordinate: Der Betrieb muss wissen, ob jemand am Einsatzort war,
   nicht wo er sich aufhält.
   -------------------------------------------------------------------------- */
function abstandMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const bogen = (g) => (g * Math.PI) / 180;
  const dLat = bogen(lat2 - lat1);
  const dLon = bogen(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(bogen(lat1)) * Math.cos(bogen(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Welche Einheit hat die Person an diesem Tag? */
function einheitAm(person, datum) {
  const liste = (person.zugehoerigkeit || [])
    .filter((z) => !z.ab || z.ab <= datum)
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : null;
}

function ortPruefen(m, person, datum, lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number"
      || !Number.isFinite(lat) || !Number.isFinite(lon))
    return { geprueft: false, innerhalb: null, text: "Ohne Standortfreigabe erfasst" };

  const eid = einheitAm(person, datum);
  const einheit = (m.einheiten || []).find((x) => x.id === eid);
  const st = einheit && (m.standorte || []).find((x) => x.id === einheit.standortId);
  if (!st || typeof st.lat !== "number" || typeof st.lon !== "number")
    return { geprueft: false, innerhalb: null, text: "Kein Standort hinterlegt" };

  const d = abstandMeter(lat, lon, st.lat, st.lon);
  const radius = st.radius || 200;
  return {
    geprueft: true,
    innerhalb: d <= radius,
    abstand: d,
    text: d <= radius ? `Am Einsatzort (${d} m)`
      : `Abweichend, ${d > 1500 ? `${(d / 1000).toFixed(1)} km` : `${d} m`} entfernt`,
  };
}

/* --------------------------------------------------------------------------
   SICHERUNGEN AUSDÜNNEN

   Es gab keine Obergrenze und kein Aufräumen: Jede angeforderte Sicherung
   legte eine vollständige Kopie an, für immer. Bei einem Betrieb von
   mehreren Megabyte wächst das schnell in Bereiche, die Geld kosten.

   Behalten werden die zwanzig jüngsten und je Tag die jüngste der älteren.
   Das hält den jüngsten Verlauf dicht und die Vergangenheit schlank.
   -------------------------------------------------------------------------- */
async function sicherungenAusduennen(store, raum) {
  try {
    const { blobs } = await store.list({ prefix: `sicherung:${raum}:` });
    const marken = blobs.map((b) => ({ key: b.key, marke: b.key.split(":").pop() }))
      .sort((a, b) => b.marke.localeCompare(a.marke));
    const behalten = new Set(marken.slice(0, 20).map((x) => x.key));
    const tageGesehen = new Set();
    for (const m of marken.slice(20)) {
      const tag = String(m.marke).slice(0, 10);
      if (!tageGesehen.has(tag)) { tageGesehen.add(tag); behalten.add(m.key); }
    }
    for (const m of marken) {
      if (!behalten.has(m.key)) await store.delete(m.key).catch(() => {});
    }
  } catch { /* Aufräumen darf nie eine Anfrage scheitern lassen */ }
}

/* Sitzungen liest und schreibt jetzt lib/sitzungen.mjs — Einladungen
   und Zurücksetzen brauchen dieselbe Logik, und zwei Kopien wären
   zwei Wahrheiten. */
const sitzung = (req) => sitzungLesen(req);

export default async (req, context) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(api|\.netlify\/functions\/daten)\/?/, "");
  const store = laden();

  try {
    /* ------------------ Zugänge für einen Mandanten ------------------ */
    /* Nur der Betreiber darf das. Die Codes entstehen hier, damit sie als
       Prüfsumme abgelegt werden können — im Browser wäre das sinnlos. */
    if (pfad === "zugaenge" && req.method === "POST") {
      const sB = await sitzung(req);
      /* Neben dem Betreiber jetzt auch Leitung und Planung — aber nur im
         eigenen Betrieb, nur für Rollen unterhalb der eigenen und nur je
         Person. Das ist der Weg für Kräfte ohne E-Mail-Adresse: Der Code
         wird ausgedruckt übergeben und lässt sich hier in zwei Klicks neu
         ausstellen — der Handywechsel ist dann eine Sache des Betriebs,
         kein Anruf beim Hersteller. */
      const darfAnlegen = sB && (sB.rolle === "betreiber"
        || sB.rolle === "leitung" || sB.rolle === "planer");
      if (!darfAnlegen) {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "ohne Recht");
        return antwort({ fehler: "Zugänge legt die Organisationsleitung oder die Planung an." }, 403);
      }
      const kZ = kennung(req, sB);
      const bZ = await bremse("zugaenge", kZ);
      if (!bZ.frei) { await protokoll("zugaenge", kZ, "gebremst", bZ.grund);
        return zuVielAntwort(bZ.wartet); }
      const { bestand: zielW, eintraege } = await req.json();
      /* Leitung und Planung arbeiten immer im eigenen Betrieb — der steht
         in der Sitzung. Was der Klient schickt, ist dort ohne Belang. */
      const ziel = sB.rolle === "betreiber" ? zielW : sB.bestand;
      if (!ziel || !Array.isArray(eintraege) || !eintraege.length)
        return antwort({ fehler: "Unvollständig." }, 400);
      if (eintraege.length > 20) return antwort({ fehler: "Zu viele auf einmal." }, 400);
      if (sB.rolle !== "betreiber") {
        for (const e of eintraege) {
          if (!e.personId)
            return antwort({ fehler: "Ein Code gehört zu einer Person — ohne Personenbezug bleibt das Protokoll ohne Urheber." }, 400);
          const urteil = darfVergeben(sB.rolle, e.rolle || "mitarbeiter", null);
          if (!urteil.ok)
            return antwort({ fehler: urteil.grund }, 403);
        }
      }

      const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
      const block = () => Array.from(randomBytes(4))
        .map((b) => alphabet[b % alphabet.length]).join("");
      const erzeugt = [];
      for (const e of eintraege) {
        const code = `${block()}-${block()}-${block()}`;
        /* Ein Schlüssel je Konto: Zwei gleichzeitige Anlagen stören
           einander nicht mehr, und kein ausgelieferter Code geht verloren. */
        await kontoSchreiben(store, ablageSchluessel(code), {
          name: e.name || ziel, bestand: ziel,
          rolle: e.rolle || "kunde", person: e.personId || null, betrieb: 0,
          demo: false, gruppe: null, hinweis: null,
          angelegt: new Date().toISOString() });
        erzeugt.push({ rolle: e.rolle, personId: e.personId || null, code });
      }
      /* Neu ausstellen heißt entwerten: Trägt ein Eintrag `ersetzen`,
         werden alle bisherigen Codes derselben Person gesperrt und ihre
         Sitzungen beendet. Ein alter Code auf einem verlorenen Telefon
         bleibt sonst ein gültiger Schlüssel zum Dienstplan. */
      const zuErsetzen = eintraege.filter((e) => e.ersetzen && e.personId);
      let entwertet = 0;
      if (zuErsetzen.length) {
        const alle = await alleKonten(store);
        const neueHashes = new Set(erzeugt.map((z) => ablageSchluessel(z.code)));
        const gesperrteH = new Set();
        for (const [h, konto] of Object.entries(alle)) {
          if (!konto || konto.bestand !== ziel || konto.gesperrt || konto.verweis) continue;
          if (neueHashes.has(h)) continue;
          if (!zuErsetzen.some((e) => String(e.personId) === String(konto.person))) continue;
          await kontoSchreiben(store, h, { ...konto, gesperrt: true,
            gesperrtAm: new Date().toISOString(),
            gesperrtDurch: `${sB.name || sB.rolle} · neu ausgestellt` });
          gesperrteH.add(h); entwertet++;
        }
        if (gesperrteH.size) {
          try {
            const { blobs } = await sitzungen().list();
            for (const b of blobs) {
              const sit = await sitzungen().get(b.key, { type: "json" });
              if (sit && sit.konto && gesperrteH.has(sit.konto))
                await sitzungen().delete(b.key);
            }
          } catch { /* Sitzungen laufen ohnehin ab */ }
        }
      }

      await protokoll("einrichten", kennung(req, sB), "erfolg",
        `${erzeugt.length} Zugänge für ${ziel}`
        + (entwertet ? ` · ${entwertet} entwertet` : ""));
      return antwort({ ok: true, zugaenge: erzeugt, entwertet });
    }

    /* ------------------------ Einen Zugang sperren -------------------- */
    /* Bis hierher gab es drei Stellen, die Zugänge anlegen, und keine, die
       einen zurückzieht. Wer den Betrieb verließ, behielt seinen Code —
       und mit ihm den Plan. Für personenbezogene Daten ist das kein
       Schönheitsfehler, sondern ein fehlendes Löschkonzept.

       Gesperrt wird über den Code selbst oder über seine Prüfsumme. Der
       Eintrag bleibt als Grabstein stehen: So kann derselbe Code nicht
       durch Zufall ein zweites Mal vergeben werden. */
    if (pfad === "zugang-sperren" && req.method === "POST") {
      const sB = await sitzung(req);
      const darfSperren = sB && (sB.rolle === "betreiber" || sB.rolle === "leitung");
      if (!darfSperren) {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "Sperrung ohne Recht");
        return antwort({ fehler: "Nur die Organisationsleitung darf Zugänge zurückziehen." }, 403);
      }
      const kS = kennung(req, sB);
      const bS = await bremse("zugaenge", kS);
      if (!bS.frei) { await protokoll("zugaenge", kS, "gebremst", bS.grund);
        return zuVielAntwort(bS.wartet); }

      const { code, pruefsumme, alleDesBetriebs } = await req.json();
      const konten = await alleKonten(store);
      const ziele = [];

      /* Beide Schlüssel — ein Konto kann noch unter dem alten liegen. */
      if (code) { ziele.push(ablageSchluessel(code)); ziele.push(altHash(code)); }
      if (pruefsumme) ziele.push(String(pruefsumme));
      /* Notausgang: alle Zugänge eines Betriebs auf einmal. Gedacht für den
         Fall, dass Codes in falsche Hände geraten sind. Der eigene Zugang
         bleibt bestehen, sonst sperrt man sich selbst aus. */
      if (alleDesBetriebs) {
        const eigenerHash = sB.konto || null;
        for (const [h, k] of Object.entries(konten)) {
          if (k.bestand === sB.bestand && k.rolle !== "betreiber" && h !== eigenerHash) ziele.push(h);
        }
      }
      if (!ziele.length) return antwort({ fehler: "Kein Zugang angegeben." }, 400);

      let gesperrt = 0;
      for (const h of ziele) {
        const k = konten[h];
        if (!k) continue;
        /* Nur im eigenen Betrieb — die Leitung eines Hauses darf nicht die
           Zugänge eines anderen abschalten. */
        if (sB.rolle !== "betreiber" && k.bestand !== sB.bestand) continue;
        if (k.gesperrt) continue;
        konten[h] = { ...k, gesperrt: true,
          gesperrtAm: new Date().toISOString(), gesperrtDurch: sB.name || sB.rolle };
        gesperrt++;
      }
      /* Einzeln zurückschreiben — der Sammelblob wird nicht mehr gepflegt. */
      if (gesperrt) {
        for (const h of ziele) {
          if (konten[h] && konten[h].gesperrt) await kontoSchreiben(store, h, konten[h]);
        }
      }

      /* Laufende Sitzungen enden mit. Ein gesperrter Code, dessen Sitzung
         noch zwölf Stunden weiterläuft, ist nicht gesperrt. */
      let beendet = 0;
      const gesperrteHashes = new Set(ziele);
      try {
        const { blobs } = await sitzungen().list();
        for (const b of blobs) {
          const sit = await sitzungen().get(b.key, { type: "json" });
          if (!sit || sit.bestand !== sB.bestand) continue;
          /* Sitzungen aus der Zeit vor dieser Änderung tragen keine
             Kontokennung. Sie laufen binnen zwölf Stunden von selbst ab. */
          if (!sit.konto || !gesperrteHashes.has(sit.konto)) continue;
          await sitzungen().delete(b.key);
          beendet++;
        }
      } catch { /* Sitzungen laufen ohnehin nach spätestens zwölf Stunden ab */ }

      await protokoll("zugaenge", kS, "erfolg", `${gesperrt} gesperrt · ${beendet} Sitzungen beendet`);
      return antwort({ ok: true, gesperrt, sitzungenBeendet: beendet });
    }

    /* --------------- Bestand für einen anderen Raum schreiben --------- */
    /* Der Betreiber legt den leeren Betrieb an, bevor sich jemand anmeldet. */
    if (pfad === "bestand-anlegen" && req.method === "POST") {
      const sB = await sitzung(req);
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "Raumanlage ohne Recht");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      const { bestand: ziel, inhalt } = await req.json();
      if (!ziel || !inhalt) return antwort({ fehler: "Unvollständig." }, 400);
      if (await raumBelegt(store, ziel))
        return antwort({ fehler: "Dieser Raum ist bereits belegt." }, 409);
      await bestandSchreiben(store, ziel, inhalt, { durch: "Betreiber" });
      return antwort({ ok: true });
    }

    /* ------------------------- Demozugänge auflisten ----------------- */
    if (pfad === "demos" && req.method === "GET") {
      /* Auch das Auflisten wird gebremst — sonst ist es ein ungedeckelter
         Aufruf, der bei jedem Treffer den kompletten Kontenbestand liest. */
      const bDemo = await bremse("demo", kennung(req, null));
      if (!bDemo.frei) return zuVielAntwort(bDemo.wartet);
      const konten = await alleKonten(store);
      /* `gesperrt` gehört hierher wie überall sonst. Es fehlte, und damit war
         das Zurückziehen eines Demozugangs wirkungslos: Er blieb in der
         öffentlichen Liste stehen und ließ sich weiter öffnen. Beim Anmelden
         und bei den Verwalterkonten wurde die Sperre geprüft, auf den beiden
         Demopfaden nicht — eine Sperre, die nur an drei von vier Türen
         gilt, ist keine. */
      const liste = Object.values(konten)
        .filter((k) => k.demo && k.id && k.rolle !== "betreiber" && !k.gesperrt)
        .map((k) => ({ id: k.id, name: k.name, rolle: k.rolle, gruppe: k.gruppe,
          bestand: k.bestand, hinweis: k.hinweis }));
      return antwort({ demos: liste }, 200, { "cache-control": "public, max-age=60" });
    }

    /* ------------------- Ohne Code in einen Demozugang --------------- */
    if (pfad === "demo" && req.method === "POST") {
      const kd = kennung(req, null);
      const bd = await bremse("demo", kd);
      if (!bd.frei) return zuVielAntwort(bd.wartet);
      const { id } = await req.json();
      const konten = await alleKonten(store);
      const eintrag = Object.values(konten).find((k) => k.demo && k.id === id);
      if (!eintrag) return antwort({ fehler: "Unbekannter Demozugang." }, 404);
      /* Ein zurückgezogener Zugang bleibt zurückgezogen — auch wenn seine
         Kennung noch jemand kennt. Die Liste verschweigt ihn zwar, aber sie
         ist nicht die Sicherung; diese Prüfung ist es. */
      if (eintrag.gesperrt) {
        await protokoll("demo", kd, "abgewiesen", "gesperrter Demozugang");
        return antwort({ fehler: "Dieser Zugang steht nicht mehr bereit." }, 403);
      }
      /* Ein Demozugang darf nur in einen Demoraum führen. Die Liste ist
         öffentlich und der Zugang braucht keinen Code — zeigte einer davon
         versehentlich auf einen echten Betrieb, wäre dieser öffentlich.
         Der Raumname trägt die Absicht, nicht nur ein Merkmal im Konto. */
      if (!String(eintrag.bestand || "").startsWith("demo-")) {
        await protokoll("demo", kd, "abgewiesen", `kein Demoraum: ${eintrag.bestand}`);
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      }
      /* Ein Demozugang darf niemals Betreiberrechte tragen. Die Liste der
         Demozugänge ist öffentlich — wäre die Betreiberrolle darunter,
         könnte jeder Datenräume anlegen und Zugangscodes erzeugen. */
      if (eintrag.rolle === "betreiber")
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      const token = randomBytes(32).toString("base64url");
      const dauer = 1000 * 60 * 60 * 12;
      await sitzungen().setJSON(`t:${hash(token)}`, {
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        demo: true, seit: Date.now(), zuletzt: Date.now(), bis: Date.now() + dauer,
      });
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        gueltigBis: Date.now() + dauer });
    }

    /* ---------------------------- Anmelden --------------------------- */
    if (pfad === "anmelden" && req.method === "POST") {
      const k = kennung(req, null);
      const { zugangscode, email, passwort } = await req.json();

      /* ---- Weg A: Adresse und Passwort ----------------------------------
         Für die Zugänge, die einen Betrieb führen. Die Antwort auf alles
         Ungültige ist ein und dieselbe: Ob die Adresse unbekannt ist, das
         Passwort falsch oder noch keines gesetzt, sieht von außen gleich
         aus — sonst wäre die Anmeldung ein Adressprüfer. Wer den Link
         braucht, fordert ihn unter „Passwort vergessen" an; dort wird für
         Konten ohne Passwort still die Einladung erneuert. */
      if (!zugangscode && (email !== undefined || passwort !== undefined)) {
        const fundM = await findeKontoMail(store, email);
        const zielM = fundM.eintrag ? fundM.eintrag.bestand : null;
        const bM = await bremse("anmelden", k, zielM);
        if (!bM.frei) { await protokoll("anmelden", k, "gebremst",
          `${bM.grund}${bM.dimension ? ` (${bM.dimension})` : ""}`);
          return zuVielAntwort(bM.wartet); }
        if (!email || !String(email).includes("@") || !passwort)
          return antwort({ fehler: "E-Mail und Passwort gehören zusammen." }, 400);

        const abgewiesen = async (grund) => {
          /* Gleichlange Antwortzeit — ein unbekanntes Konto rechnet kein
             scrypt, also wird die Zeit hier angeglichen. */
          await new Promise((r) => setTimeout(r, 240));
          await protokoll("anmelden", k, "abgewiesen", grund);
          return antwort({ fehler: "E-Mail oder Passwort stimmt nicht.",
            text: `Noch kein Passwort gesetzt? Unter „Passwort vergessen" kommt der Link.`,
            ...(bM.uebrig !== undefined && bM.uebrig <= 3
              ? { hinweis: `Noch ${bM.uebrig} Versuche, dann ist der Zugang kurz gesperrt.` } : {}) }, 401);
        };
        if (!fundM.eintrag || !fundM.eintrag.passwort) return abgewiesen("adresse");
        if (!(await passwortPruefen(passwort, fundM.eintrag.passwort)))
          return abgewiesen("passwort");

        const e = fundM.eintrag;
        if (e.gesperrt) {
          await protokoll("anmelden", k, "abgewiesen", "gesperrt");
          return antwort({ fehler: "Dieser Zugang wurde zurückgezogen.",
            text: "Bitte wende dich an die Organisationsleitung." }, 403);
        }
        if (e.laeuftAb && new Date(e.laeuftAb).getTime() < Date.now()) {
          await protokoll("anmelden", k, "abgewiesen", "abgelaufen");
          return antwort({ fehler: "Der Testzeitraum ist abgelaufen.",
            text: "Melde dich bei uns, wenn du weitermachen möchtest — die Daten sind noch da." }, 403);
        }

        const tokenM = randomBytes(32).toString("base64url");
        const dauerM = 1000 * 60 * 60 * 12;
        await sitzungen().setJSON(`t:${hash(tokenM)}`, {
          bestand: e.bestand, name: e.name, rolle: e.rolle || "kunde",
          person: e.person ?? null, betrieb: e.betrieb ?? 0,
          konto: fundM.schluessel,
          einheit: e.einheit ?? e.gruppe ?? null,
          seit: Date.now(), zuletzt: Date.now(), bis: Date.now() + dauerM,
        });
        /* Über den alten Adressschlüssel gefunden und ein Pfeffer ist da:
           still auf den geschlüsselten heben — dasselbe Muster wie bei den
           Codes. */
        try {
          if (fundM.umschluesseln) await kontoSchreiben(store, fundM.schluessel,
            { ...e, umgeschluesselt: new Date().toISOString() });
        } catch { /* darf keine Anmeldung scheitern lassen */ }

        await entlasten("anmelden", k);
        await protokoll("anmelden", k, "erfolg", `${e.rolle} · mit Adresse`);
        return antwort({ token: tokenM, name: e.name, rolle: e.rolle || "kunde",
          person: e.person ?? null, betrieb: e.betrieb ?? 0,
          hinweis: e.hinweis || null, gueltigBis: Date.now() + dauerM });
      }

      /* ---- Weg B: Zugangscode, unverändert ------------------------------ */
      /* Das Ziel ist der Betrieb, auf den der Code zeigt. Es wird aus dem
         Code abgeleitet, ohne ihn preiszugeben — so lässt sich ein
         verteilter Angriff auf einen bestimmten Betrieb erkennen, auch
         wenn er von hundert Adressen kommt. */
      /* Gezielt lesen statt den ganzen Bestand: zwei Zugriffe auf einen
         Schlüssel, nicht ein Blob mit allen Konten des Dienstes. */
      const neuS = ablageSchluessel(zugangscode);
      const altS = altHash(zugangscode || "");
      let eintragV = zugangscode ? await kontoLesen(store, neuS) : null;
      let fundSchluessel = eintragV ? neuS : null;
      let mussUmschluesseln = false;
      if (!eintragV && zugangscode && altS !== neuS) {
        eintragV = await kontoLesen(store, altS);
        if (eintragV) { fundSchluessel = altS; mussUmschluesseln = true; }
      }
      const fund = { eintrag: eintragV, schluessel: fundSchluessel,
        umschluesseln: mussUmschluesseln };
      const zielRaum = eintragV ? eintragV.bestand : null;
      const b = await bremse("anmelden", k, zielRaum);
      if (!b.frei) { await protokoll("anmelden", k, "gebremst",
        `${b.grund}${b.dimension ? ` (${b.dimension})` : ""}`);
        return zuVielAntwort(b.wartet); }
      if (!zugangscode || String(zugangscode).length < 6)
        return antwort({ fehler: "Zugangscode fehlt oder ist zu kurz." }, 400);

      const eintrag = eintragV;
      if (!eintrag) {
        // Gleichlange Antwortzeit, damit sich gültige und ungültige Codes
        // nicht anhand der Dauer unterscheiden lassen.
        await new Promise((r) => setTimeout(r, 240));
        await protokoll("anmelden", k, "abgewiesen");
        return antwort({ fehler: "Unbekannter Zugangscode.",
          ...(b.uebrig !== undefined && b.uebrig <= 3
            ? { hinweis: `Noch ${b.uebrig} Versuche, dann ist der Zugang kurz gesperrt.` } : {}) }, 401);
      }

      /* Gesperrt? Ein zurückgezogener Zugang bleibt als Eintrag stehen,
         damit derselbe Code nicht später erneut vergeben wird. */
      if (eintrag.gesperrt) {
        await protokoll("anmelden", k, "abgewiesen", "gesperrt");
        return antwort({ fehler: "Dieser Zugang wurde zurückgezogen.",
          text: "Bitte wende dich an die Organisationsleitung." }, 403);
      }

      /* Abgelaufen? Selbst angelegte Testbetriebe tragen ein Enddatum. Bis
         hierher wurde es geschrieben und nie gelesen — der Testzeitraum war
         damit unbegrenzt. */
      if (eintrag.laeuftAb && new Date(eintrag.laeuftAb).getTime() < Date.now()) {
        await protokoll("anmelden", k, "abgewiesen", "abgelaufen");
        return antwort({ fehler: "Der Testzeitraum ist abgelaufen.",
          text: "Melde dich bei uns, wenn du weitermachen möchtest — die Daten sind noch da." }, 403);
      }

      const token = randomBytes(32).toString("base64url");
      /* Eine Betreitersitzung läuft kürzer ab. Wer Datenräume anlegen kann,
         soll nicht zwölf Stunden lang auf einem fremden Rechner offen sein. */
      const dauer = eintrag.rolle === "betreiber"
        ? 1000 * 60 * 60 * 2 : 1000 * 60 * 60 * 12;
      await sitzungen().setJSON(`t:${hash(token)}`, {
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle || "kunde",
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        /* Die Prüfsumme des eigenen Zugangs mitführen: Nur so lässt sich
           beim Sperren aller Zugänge der eigene aussparen. */
        konto: fund.schluessel,
        /* Für die einheitsgenaue Schreibprüfung der Schichtverantwortung. */
        einheit: eintrag.einheit ?? eintrag.gruppe ?? null,
        seit: Date.now(), zuletzt: Date.now(), bis: Date.now() + dauer,
      });
      /* Über den alten Schlüssel gefunden und ein Pfeffer ist da: still
         umschlüsseln. So wandert der Bestand ohne Sammelvorgang hinüber —
         jeder Code beim ersten Anmelden nach der Umstellung. */
      try {
        if (fund.umschluesseln) {
          /* Unter dem neuen Schlüssel ablegen, den alten stehen lassen —
             löschen könnte einen parallel laufenden Zugriff treffen. Er
             wird beim nächsten Sperren mit erfasst. */
          await kontoSchreiben(store, ablageSchluessel(zugangscode),
            { ...eintrag, umgeschluesselt: new Date().toISOString() });
        } else {
          /* Aus dem Sammelblob auf einen Einzelschlüssel heben. */
          await kontoVereinzeln(store, fund.schluessel);
        }
      } catch { /* darf keine Anmeldung scheitern lassen */ }

      await entlasten("anmelden", k);
      await protokoll("anmelden", k, "erfolg", eintrag.rolle);
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle || "kunde",
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        hinweis: eintrag.hinweis || null, gueltigBis: Date.now() + dauer });
    }

    /* ------------------------- Ab hier angemeldet -------------------- */
    const s = await sitzung(req);
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);

    /* Ein Sicherungsschlüssel darf genau einen Pfad, und zwar lesend.

       Der erste Entwurf verließ sich darauf, dass jeder Endpunkt selbst auf
       nurSicherung prüft. Die Prüfung hat das sofort widerlegt: Der Schlüssel
       trägt die Rolle „leitung", und PUT /bestand fragt nur nach der Rolle —
       ein Schlüssel, der ausdrücklich nur lesen sollte, konnte den ganzen
       Betrieb überschreiben.

       Deshalb hier eine Positivliste statt Einzelprüfungen: Was nicht
       ausdrücklich erlaubt ist, ist verboten. Wer eine Einzelprüfung
       vergisst, verliert damit nichts. */
    if (s.nurSicherung && !(pfad === "vollausgabe" && req.method === "GET")) {
      await protokoll("sicherungsschluessel", kennung(req, s), "abgewiesen",
        `${req.method} ${pfad}`);
      return antwort({ fehler: "Dieser Schlüssel darf ausschließlich die Vollausgabe lesen.",
        text: "Für alles andere braucht es einen Zugangscode." }, 403);
    }


    /* ------------------------------ Lesen ---------------------------- */
    /* Was hinausgeht, hängt an der Rolle. Eine Pflegekraft bekommt den Plan,
       aber nicht die Anschriften und Krankheitsgründe ihrer Kolleginnen —
       siehe lib/rechte.mjs. */
    if (pfad === "bestand" && req.method === "GET") {
      const bl = await bremse("lesen", kennung(req, s));
      if (!bl.frei) return zuVielAntwort(bl.wartet);
      const mit = await bestandLesen(store, s.bestand);
      if (!mit) return antwort({ bestand: null, etag: null,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name,
        einheit: s.einheit ?? null, schreiben: schreibumfang(s.rolle) });
      return antwort({ bestand: bestandFuerRolle(mit.bestand, s), etag: mit.stand,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name,
        einheit: s.einheit ?? null, schreiben: schreibumfang(s.rolle),
        geaendert: mit.zeit, durch: mit.durch });
    }

    /* ----------------------------- Schreiben ------------------------- */
    if (pfad === "bestand" && req.method === "PUT") {
      const ks = kennung(req, s);

      /* Erst die Rolle, dann alles andere. Wer gar nicht schreiben darf,
         soll auch keine Bremse und keinen Konfliktvergleich auslösen. */
      if (schreibumfang(s.rolle) === SCHREIBEN_NEIN) {
        await protokoll("schreiben", ks, "abgewiesen", `Rolle ${s.rolle}`);
        return antwort({ fehler: "Keine Schreibberechtigung.",
          text: absageText(s.rolle) }, 403);
      }

      const bs = await bremse("schreiben", ks);
      if (!bs.frei) return zuVielAntwort(bs.wartet);
      const { bestand, etag, durch } = await req.json();
      if (!bestand || typeof bestand !== "object")
        return antwort({ fehler: "Kein Bestand übergeben." }, 400);

      const jetzt = await bestandLesen(store, s.bestand);

      /* Grundlage ist der gespeicherte Stand, nicht der übermittelte. Eine
         eingeschränkte Rolle kann damit nichts überschreiben, was sie beim
         Lesen gar nicht bekommen hat. */
      const zuSchreiben = zusammenfuehren(jetzt ? jetzt.bestand : null, bestand, s);
      if (!zuSchreiben) {
        await protokoll("schreiben", ks, "abgewiesen", `Rolle ${s.rolle}`);
        return antwort({ fehler: "Keine Schreibberechtigung.",
          text: absageText(s.rolle) }, 403);
      }
      if (zuSchreiben.verweigert) {
        await protokoll("schreiben", ks, "abgewiesen", zuSchreiben.verweigert);
        return antwort({ fehler: "Keine Schreibberechtigung.",
          text: zuSchreiben.verweigert }, 403);
      }

      /* Form prüfen, bevor geschrieben wird. Die Rechteprüfung schützt vor
         fremdem Zugriff, nicht vor der eigenen fehlerhaften Anwendung — und
         ein halb übertragenes Objekt ersetzte bisher den ganzen Betrieb. */
      const form = pruefeGestalt(zuSchreiben);
      if (!form.ok) {
        await protokoll("schreiben", ks, "abgewiesen", `Gestalt: ${form.grund}`);
        return antwort({ fehler: "Der Stand sieht unvollständig aus.",
          text: `${form.grund} Es wurde nichts geändert — bitte lade die Seite neu `
            + "und versuch es erneut.", feld: form.feld || null }, 422);
      }

      /* Auffälliger Verlust wird nicht abgelehnt — es gibt gute Gründe, viel
         zu löschen —, aber vorher gesichert. Eine Sicherung, die niemand
         angefordert hat, ist genau dann wertvoll, wenn es niemand kommen sah. */
      if (jetzt) {
        const schrumpf = schrumpfung(jetzt.bestand, zuSchreiben);
        if (schrumpf.anteil >= SICHERUNGSSCHWELLE) {
          const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          await store.setJSON(`sicherung:${s.bestand}:${marke}`, jetzt.bestand,
            { metadata: { zeit: new Date().toISOString(),
              durch: `automatisch vor Verlust von ${Math.round(schrumpf.anteil * 100)} %`,
              automatisch: "ja" } }).catch(() => {});
          await protokoll("schreiben", ks, "gesichert",
            `${schrumpf.vorher} → ${schrumpf.nachher} Datensätze`);
        }
      }

      /* Geschrieben wird je Monat. Zwei Planer, die an verschiedenen Monaten
         arbeiten, kollidieren dadurch nicht mehr — und wenn sie es doch tun,
         sagt die Absage, welcher Monat betroffen ist. */
      const erg = await bestandSchreiben(store, s.bestand, zuSchreiben, {
        erwarteterStand: etag ?? null,
        durch: durch || s.name || "unbekannt",
      });

      if (!erg.ok) {
        await protokoll("schreiben", ks, "konflikt",
          (erg.monate || []).join(", ") || "unbestimmt");
        const monate = erg.monate || [];
        return antwort({ fehler: "konflikt",
          text: erg.kernBetroffen
            ? "Jemand anderes hat inzwischen die Stammdaten geändert."
            : monate.length
              ? `Jemand anderes hat inzwischen ${monate.length > 1 ? "dieselben Monate" : "denselben Monat"} bearbeitet: ${monate.join(", ")}.`
              : "Jemand anderes hat inzwischen gespeichert.",
          monate, kernBetroffen: !!erg.kernBetroffen,
          bestand: bestandFuerRolle(erg.bestand, s), etag: erg.stand,
          durch: erg.durch, zeit: erg.zeit }, 409);
      }

      await protokoll("schreiben", ks, "erfolg",
        `${erg.geschrieben} Stücke · ${s.rolle}`
        + (erg.zusammengefuehrt ? ` · zusammengeführt: ${erg.zusammengefuehrt.join(", ")}` : ""));
      /* Für die Betreiberliste: Wie weit ist ein Testbetrieb gekommen?
         Beobachtung, kein Bestand — ein Fehler bleibt folgenlos. */
      await selbststartVermerken(store, s.bestand, zuSchreiben);
      return antwort({ ok: true, etag: erg.stand,
        zusammengefuehrt: erg.zusammengefuehrt || null });
    }

    /* ------------------------------ Stempeln ------------------------- */
    /* Bis hierher meldete der Browser die Koordinaten, rechnete den Abstand
       und entschied selbst `innerhalb: true` — dieses Urteil wurde als
       Tatsache gespeichert. Wer die Anwendung umging oder dem Browser andere
       Koordinaten unterschob, stempelte sich von überall am Einsatzort ein.
       Für eine Zeiterfassung, die im Streitfall etwas belegen soll, war das
       wertlos.

       Jetzt kommen nur die Rohkoordinaten herein. Der Standort, der Radius
       und die Entscheidung liegen hier; die Zeit ebenfalls, denn eine
       gestellte Uhr im Gerät ist genauso leicht zu ändern. */
    if (pfad === "stempeln" && req.method === "POST") {
      const kSt = kennung(req, s);
      const bSt = await bremse("schreiben", kSt);
      if (!bSt.frei) return zuVielAntwort(bSt.wartet);

      const { datum, art, lat, lon } = await req.json();
      if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(String(datum)))
        return antwort({ fehler: "Kein gültiges Datum." }, 400);
      if (art !== "start" && art !== "ende")
        return antwort({ fehler: "Nur start oder ende." }, 400);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);

      const mit = await bestandLesen(store, s.bestand);
      if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      const bestand = mit.bestand;
      const i = Number(s.betrieb);
      const m = (Array.isArray(bestand.mandanten) && bestand.mandanten[i])
        ? bestand.mandanten[i] : (bestand.mandanten || [])[0];
      if (!m) return antwort({ fehler: "Kein Betrieb vorhanden." }, 404);

      const person = (m.personen || []).find((x) => String(x.id) === String(s.person));
      if (!person) return antwort({ fehler: "Person nicht gefunden." }, 404);

      /* Die eigene Zeit, nicht die des Geräts. */
      const jetzt = new Date();
      const zeit = jetzt.toLocaleTimeString("de-DE", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

      const urteil = ortPruefen(m, person, datum, lat, lon);

      const k = `${person.id}|${datum}`;
      const alt = (m.einstempeln || {})[k] || {};
      const neu = art === "start"
        ? { start: zeit, ortStart: urteil.text, innerhalbStart: urteil.innerhalb,
            geprueftStart: urteil.geprueft }
        : { ...alt, ende: zeit, ortEnde: urteil.text, innerhalbEnde: urteil.innerhalb,
            geprueftEnde: urteil.geprueft };

      let neuerMandant = { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: neu } };
      if (art === "ende") {
        neuerMandant = { ...neuerMandant, erfassung: { ...(neuerMandant.erfassung || {}),
          [k]: { start: neu.start, ende: zeit, bestaetigt: true, grund: "" } } };
      }
      const neuerBestand = { ...bestand,
        mandanten: bestand.mandanten.map((x) => x === m ? neuerMandant : x) };

      const ergSt = await bestandSchreiben(store, s.bestand, neuerBestand, {
        erwarteterStand: mit.stand, durch: s.name || "Stempeluhr" });
      await protokoll("schreiben", kSt, ergSt.ok ? "erfolg" : "konflikt", `stempeln ${art}`);
      return antwort({ ok: true, zeit, ort: urteil.text, innerhalb: urteil.innerhalb,
        geprueft: urteil.geprueft, etag: ergSt.stand || null });
    }

    /* ------------------------------ Abmelden ------------------------- */
    if (pfad === "abmelden" && req.method === "POST") {
      const kopf = req.headers.get("authorization") || "";
      const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
      if (token) await sitzungen().delete(`t:${hash(token)}`);
      return antwort({ ok: true });
    }

    /* ------------------------- Vollausgabe --------------------------
       Die Datenmitnahme in der Oberfläche gibt CSV-Dateien aus — gut zum
       Weiterverarbeiten, ungeeignet als Sicherung: Sie läuft im Browser, sie
       braucht einen Menschen, und sie gibt nicht alles her.

       Für eine Sicherung außer Haus braucht es einen Weg, der ohne Browser
       auskommt. Ein nächtliches Skript auf einem eigenen Server holt sich
       damit den vollständigen Bestand als eine Datei.

       Zwei Wege hinein: eine angemeldete Sitzung der Organisationsleitung —
       oder ein Sicherungsschlüssel, der nur das hier darf.               */
    if (pfad === "vollausgabe" && req.method === "GET") {
      if (s.rolle !== "leitung" && !s.nurSicherung)
        return antwort({ fehler: "Nur die Organisationsleitung darf den ganzen Bestand ausgeben.",
          text: absageText(s.rolle) }, 403);
      const bv = await bremse("lesen", kennung(req, s));
      if (!bv.frei) return zuVielAntwort(bv.wartet);
      const mit = await bestandLesen(store, s.bestand);
      if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      await protokoll("vollausgabe", kennung(req, s), "erfolg", s.nurSicherung ? "Schlüssel" : "Sitzung");
      const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return antwort({
        centric: "vollausgabe",
        fassung: 1,
        erzeugt: new Date().toISOString(),
        raum: s.bestand,
        stand: mit.stand,
        bestand: mit.bestand,
      }, 200, { "content-disposition": `attachment; filename="centric-${s.bestand}-${marke}.json"` });
    }

    /* --------------------- Sicherungsschlüssel ----------------------
       Ein Schlüssel, der genau eines darf: den Bestand lesen. Er kann
       nichts ändern, nichts löschen und sich nicht anmelden. Damit lässt
       sich eine Sicherung einrichten, ohne einen Zugang aus der Hand zu
       geben, der den Betrieb umschreiben könnte.

       Er wird genau einmal gezeigt. Gespeichert ist nur der Hashwert —
       genau wie bei den Zugangscodes.                                  */
    if (pfad === "sicherungsschluessel" && req.method === "POST") {
      if (s.rolle !== "leitung" || s.nurSicherung)
        return antwort({ fehler: "Nur die Organisationsleitung darf Sicherungsschlüssel anlegen." }, 403);
      const { tage } = await req.json().catch(() => ({}));
      /* Ein Schlüssel ohne Ablauf ist ein Schlüssel, der irgendwann in
         einem alten Skript vergessen wird. Höchstens ein Jahr. */
      const gueltig = Math.min(365, Math.max(1, Number(tage) || 90));
      const roh = randomBytes(24).toString("base64url");
      const bis = Date.now() + gueltig * 86400000;
      await sitzungen().setJSON(`sk:${hash(roh)}`, {
        bestand: s.bestand, rolle: "leitung", nurSicherung: true,
        name: `Sicherungsschlüssel (${s.name || "Leitung"})`,
        angelegt: new Date().toISOString(), bis,
      });
      await protokoll("sicherungsschluessel", kennung(req, s), "erfolg", `${gueltig} Tage`);
      return antwort({ ok: true, schluessel: roh, gueltigBis: new Date(bis).toISOString(),
        tage: gueltig,
        hinweis: "Dieser Schlüssel erscheint genau einmal. Er darf ausschließlich lesen." });
    }

    if (pfad === "sicherungsschluessel" && req.method === "GET") {
      if (s.rolle !== "leitung" || s.nurSicherung)
        return antwort({ fehler: "Nur die Organisationsleitung." }, 403);
      const { blobs } = await sitzungen().list({ prefix: "sk:" }).catch(() => ({ blobs: [] }));
      const liste = [];
      for (const b of blobs) {
        const k = await sitzungen().get(b.key, { type: "json" }).catch(() => null);
        if (!k || k.bestand !== s.bestand) continue;
        liste.push({ kennung: b.key.slice(3, 11), angelegt: k.angelegt,
          gueltigBis: new Date(k.bis).toISOString(), abgelaufen: k.bis < Date.now() });
      }
      return antwort({ schluessel: liste.sort((a, b) => (a.angelegt < b.angelegt ? 1 : -1)) });
    }

    if (pfad === "sicherungsschluessel" && req.method === "DELETE") {
      if (s.rolle !== "leitung" || s.nurSicherung)
        return antwort({ fehler: "Nur die Organisationsleitung." }, 403);
      const { kennung: kz } = await req.json().catch(() => ({}));
      if (!kz) return antwort({ fehler: "Keine Kennung angegeben." }, 400);
      const { blobs } = await sitzungen().list({ prefix: `sk:${kz}` }).catch(() => ({ blobs: [] }));
      let weg = 0;
      for (const b of blobs) {
        const k = await sitzungen().get(b.key, { type: "json" }).catch(() => null);
        if (!k || k.bestand !== s.bestand) continue;
        await sitzungen().delete(b.key); weg++;
      }
      await protokoll("sicherungsschluessel", kennung(req, s), "widerrufen", String(weg));
      return antwort({ ok: true, widerrufen: weg });
    }

    /* -------------------------- Sicherungskopien --------------------- */
    if (pfad === "sicherung" && req.method === "POST") {
      const mit = await bestandLesen(store, s.bestand);
      if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      await store.setJSON(`sicherung:${s.bestand}:${marke}`, mit.bestand,
        { metadata: { zeit: new Date().toISOString(), durch: s.name } });
      await sicherungenAusduennen(store, s.bestand);
      return antwort({ ok: true, marke });
    }
    if (pfad === "sicherungen" && req.method === "GET") {
      const { blobs } = await store.list({ prefix: `sicherung:${s.bestand}:` });
      const liste = [];
      for (const b of blobs) {
        const meta = await store.getMetadata(b.key).catch(() => null);
        liste.push({ marke: b.key.split(":").pop(),
          zeit: meta?.metadata?.zeit || null,
          durch: meta?.metadata?.durch || null,
          automatisch: meta?.metadata?.automatisch === "ja" });
      }
      return antwort({ sicherungen: liste.sort((a, b) => b.marke.localeCompare(a.marke)) });
    }

    /* --------------------------- Wiederherstellen -------------------- */
    /* Eine Sicherung, die sich nicht einspielen lässt, ist Speicherverbrauch
       mit gutem Gewissen. Bis hierher listete „sicherungen" nur Zeitmarken;
       einen Weg zurück gab es nicht.

       Vor dem Einspielen wird der jetzige Stand gesichert — sonst tauscht
       man einen Verlust gegen den nächsten. */
    if (pfad === "wiederherstellen" && req.method === "POST") {
      if (schreibumfang(s.rolle) !== "voll")
        return antwort({ fehler: "Nur die Planung darf wiederherstellen.",
          text: absageText(s.rolle) }, 403);
      const kW = kennung(req, s);
      const bW = await bremse("schreiben", kW);
      if (!bW.frei) return zuVielAntwort(bW.wartet);

      const { marke } = await req.json();
      if (!marke || !/^[\d-]{10,25}$/.test(String(marke)))
        return antwort({ fehler: "Keine gültige Marke." }, 400);

      const alt2 = await store.get(`sicherung:${s.bestand}:${marke}`, { type: "json" });
      if (!alt2) return antwort({ fehler: "Diese Sicherung gibt es nicht." }, 404);
      const form = pruefeGestalt(alt2);
      if (!form.ok)
        return antwort({ fehler: "Diese Sicherung ist unbrauchbar.", text: form.grund }, 422);

      /* Erst den jetzigen Stand wegschreiben, dann tauschen. */
      const jetztGelesen = await bestandLesen(store, s.bestand);
      const jetztStand = jetztGelesen ? jetztGelesen.bestand : null;
      if (jetztStand) {
        const m2 = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        await store.setJSON(`sicherung:${s.bestand}:${m2}`, jetztStand,
          { metadata: { zeit: new Date().toISOString(),
            durch: `automatisch vor Wiederherstellung von ${marke}`, automatisch: "ja" } })
          .catch(() => {});
      }

      const ergW = await bestandSchreiben(store, s.bestand, alt2, {
        durch: `${s.name || "unbekannt"} · wiederhergestellt aus ${marke}` });
      await protokoll("schreiben", kW, "erfolg", `wiederhergestellt aus ${marke}`);
      return antwort({ ok: true, etag: ergW.stand, marke });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    /* Nach außen nur, dass es schiefging. Die Einzelheiten bleiben im
       Protokoll — eine Fehlermeldung mit Innenleben ist eine Landkarte
       für den nächsten Angriff. */
    await protokoll("fehler", kennung(req, null), pfad, String(e && e.message || e).slice(0, 200));
    return antwort({ fehler: "Serverfehler",
      text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/api/*"] };
