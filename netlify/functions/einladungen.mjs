/* ==========================================================================
   EINLADUNGEN

   Der Weg, auf dem alle Zugänge nach dem ersten entstehen: Die Leitung
   lädt die Planung ein, die Planung die Übrigen — jede Einladung an eine
   Adresse, jeder Zugang an eine Person. Wer keine Adresse hat, bekommt
   stattdessen einen Code (daten.mjs, Pfad zugaenge); die Einladung ist
   der Normalfall, der Code der gleichwertige zweite Weg.

   Die eine Regel, die dieser Datei ihre Form gibt: Die Bekanntheit einer
   Adresse öffnet nie das Passwortfeld. Wer die Adresse einer Kollegin
   kennt, darf daraus nichts machen können. Das Tor ist ausschließlich
   der Link, der an genau diese Adresse ging — einmalig, befristet, als
   Prüfsumme abgelegt und über die Laufnummer des Kontos entwertbar.

     erstellen   POST  Leitung oder Planung, nur eigener Betrieb,
                       nur Rollen unterhalb der eigenen. Legt das Konto
                       als „eingeladen" an oder erneuert eine offene
                       Einladung; jede Erneuerung entwertet alle
                       früheren Links.
     einloesen   POST  ohne Sitzung. Token und Wunschpasswort; setzt das
                       Passwort, aktiviert das Konto und meldet an.
   ========================================================================== */

import { getStore } from "@netlify/blobs";
import { bremse, entlasten, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { kontoLesen, kontoSchreiben, alleKonten, mailSchluessel, mailNormieren,
  findeKontoMail } from "../lib/konten.mjs";
import { passwortAblegen, pruefeRegel } from "../lib/passwoerter.mjs";
import { tokenAusstellen, tokenEinloesen, EINLADUNG_STUNDEN } from "../lib/einladungen.mjs";
import { sitzungLesen, sitzungAnlegen } from "../lib/sitzungen.mjs";
import { darfVergeben } from "../lib/rollenvergabe.mjs";
import { sendeMail, anwendungsAdresse } from "../lib/post.mjs";

const store = () => getStore({ name: "centric", consistency: "strong" });

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/* Im Trockenlauf (kein Versandschlüssel) kann eine Prüfung den Link aus
   der Antwort lesen — aber nur, wenn das ausdrücklich eingeschaltet ist.
   In einer Auslieferung mit Versand steht der Link nie in der Antwort. */
const pruefLink = () => !process.env.RESEND_API_KEY
  && process.env.CENTRIC_PRUEFLINK === "ja";

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(einladungen)\/?/, "");

  try {
    /* ----------------------------- Erstellen ------------------------- */
    if (pfad === "erstellen" && req.method === "POST") {
      const s = await sitzungLesen(req);
      const darf = s && (s.rolle === "leitung" || s.rolle === "planer");
      if (!darf) {
        await protokoll("einladung", kennung(req, null), "abgewiesen", "ohne Recht");
        return antwort({ fehler: "Einladen dürfen Organisationsleitung und Planung." }, 403);
      }
      const k = kennung(req, s);
      const b = await bremse("zugaenge", k);
      if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund);
        return zuVielAntwort(b.wartet); }

      const { email, rolle, name, personId } = await req.json();
      const mail = mailNormieren(email);
      if (!mail || !mail.includes("@") || mail.length > 254)
        return antwort({ fehler: "Das sieht nicht nach einer E-Mail-Adresse aus." }, 400);
      const zielRolle = String(rolle || "mitarbeiter");
      const urteil = darfVergeben(s.rolle, zielRolle, null);
      if (!urteil.ok) return antwort({ fehler: urteil.grund }, 403);

      const fund = await findeKontoMail(store(), mail);
      let kontoKey = fund.schluessel || mailSchluessel(mail);
      let konto = fund.eintrag;

      if (konto && konto.bestand !== s.bestand)
        return antwort({ fehler: "Diese Adresse kann hier nicht eingeladen werden." }, 409);
      if (konto && konto.passwort && !konto.gesperrt)
        return antwort({ fehler: "Diese Adresse hat bereits einen Zugang.",
          text: `Zum Neusetzen des Passworts gibt es „Passwort vergessen" an der Anmeldung.` }, 409);

      /* Anlegen oder erneuern — jede Ausstellung zählt die Laufnummer
         hoch und entwertet damit jeden früheren Link. */
      const nr = ((konto && konto.einladungNr) || 0) + 1;
      konto = {
        ...(konto || {}),
        name: name ? String(name).trim().slice(0, 80) : (konto && konto.name) || mail,
        email: mail, bestand: s.bestand, rolle: zielRolle,
        person: personId ?? (konto && konto.person) ?? null,
        betrieb: s.betrieb ?? 0, demo: false,
        gruppe: (konto && konto.gruppe) ?? null, hinweis: (konto && konto.hinweis) ?? null,
        status: "eingeladen", einladungNr: nr, gesperrt: false,
        eingeladenVon: s.name || s.rolle,
        angelegt: (konto && konto.angelegt) || new Date().toISOString(),
      };
      await kontoSchreiben(store(), kontoKey, konto);

      const token = await tokenAusstellen(store(), {
        konto: kontoKey, zweck: "einladung", nr, minuten: EINLADUNG_STUNDEN * 60 });
      const link = `${anwendungsAdresse()}/#einladung=${token}`;
      const versand = await sendeMail(mail, "Dein Zugang zu CENTRIC",
        [`${s.name || "Dein Betrieb"} hat dich zu CENTRIC eingeladen`,
         `(Rolle: ${zielRolle}).`, "",
         `Unter diesem Link legst du dein Passwort fest — er gilt sieben Tage`,
         `und genau einmal:`, "", link, "",
         `Wenn du diese Einladung nicht erwartest, tu einfach nichts.`].join("\n"));

      await protokoll("einladung", k, "erfolg", `${zielRolle} · Nr. ${nr}`);
      return antwort({ ok: true, status: "eingeladen", nr,
        ...(versand.trocken ? { trocken: true } : {}),
        ...(pruefLink() ? { link } : {}) });
    }

    /* ----------------------------- Einlösen -------------------------- */
    if (pfad === "einloesen" && req.method === "POST") {
      const k = kennung(req, null);
      const b = await bremse("anmelden", k);
      if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund);
        return zuVielAntwort(b.wartet); }

      const { token, passwort } = await req.json();
      /* Abgelaufen, entwertet und nie gewesen sehen von außen gleich aus. */
      const ungueltig = () => antwort({ fehler: "Der Link ist nicht mehr gültig.",
        text: "Bitte lass dich neu einladen — der Absender kann das in der Personalliste." }, 400);

      const eintrag = await tokenEinloesen(store(), token, "einladung");
      if (!eintrag) { await protokoll("einladung", k, "abgewiesen", "token");
        return ungueltig(); }
      const konto = await kontoLesen(store(), eintrag.konto);
      if (!konto || konto.gesperrt || (konto.einladungNr || 0) !== eintrag.nr) {
        await protokoll("einladung", k, "abgewiesen", "laufnummer");
        return ungueltig();
      }

      const regel = pruefeRegel(passwort,
        [konto.name, konto.email ? konto.email.split("@")[0] : ""]);
      if (!regel.ok) return antwort({ fehler: regel.grund }, 400);

      await kontoSchreiben(store(), eintrag.konto, {
        ...konto, passwort: await passwortAblegen(passwort),
        status: "aktiv", aktiviert: new Date().toISOString(),
      });

      const { token: sitzung, gueltigBis } = await sitzungAnlegen({
        bestand: konto.bestand, name: konto.name, rolle: konto.rolle || "kunde",
        person: konto.person ?? null, betrieb: konto.betrieb ?? 0,
        konto: eintrag.konto, einheit: konto.einheit ?? konto.gruppe ?? null,
      });

      await entlasten("anmelden", k);
      await protokoll("einladung", k, "erfolg", `eingelöst · ${konto.rolle}`);
      return antwort({ ok: true, token: sitzung, name: konto.name,
        rolle: konto.rolle || "kunde", person: konto.person ?? null,
        betrieb: konto.betrieb ?? 0, hinweis: konto.hinweis || null, gueltigBis });
    }

    /* ----------------------------- Übersicht ------------------------- */
    /* Für die Personalliste: Welche Zugänge hat der eigene Betrieb, und in
       welchem Zustand sind sie? Nur lesend, nur der eigene Betrieb, nur
       für die Rollen, die auch einladen dürfen. */
    if (pfad === "uebersicht" && req.method === "GET") {
      const s = await sitzungLesen(req);
      const darf = s && (s.rolle === "leitung" || s.rolle === "planer");
      if (!darf) return antwort({ fehler: "Nur für Organisationsleitung und Planung." }, 403);
      const alle = await alleKonten(store());
      const liste = [];
      for (const [schluessel, konto] of Object.entries(alle)) {
        if (!konto || konto.bestand !== s.bestand || konto.verweis) continue;
        if (konto.rolle === "betreiber") continue;
        liste.push({
          schluessel,
          art: schluessel.startsWith("mail:") ? "email" : "code",
          email: konto.email || null,
          name: konto.name || null,
          rolle: konto.rolle || "kunde",
          person: konto.person ?? null,
          status: konto.gesperrt ? "gesperrt"
            : konto.passwort ? "aktiv"
              : schluessel.startsWith("mail:") ? "eingeladen" : "aktiv",
          angelegt: konto.angelegt || null,
        });
      }
      return antwort({ ok: true, zugaenge: liste });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch {
    return antwort({ fehler: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/einladungen/*"] };
