/* ==========================================================================
   PASSWORT VERGESSEN

   Zwei Pfade, eine Regel: Die Antwort verrät nie, ob es zu einer Adresse
   ein Konto gibt. Wer anfordert, bekommt immer denselben Satz — ob eine
   Nachricht hinausging, weiß nur das Postfach.

     anfordern  POST  Immer dieselbe Antwort. Besteht ein Konto mit
                      Passwort, geht ein Zurücksetzlink hinaus (60
                      Minuten); besteht eines ohne Passwort, wird still
                      die Einladung erneuert (7 Tage) — das ist der Fall
                      „bekannte Adresse ohne Passwort", und er führt
                      ausdrücklich nicht auf ein Passwortfeld.
     einloesen  POST  Setzt das neue Passwort, beendet ALLE laufenden
                      Sitzungen des Kontos und meldet mit einer frischen
                      an. Die alte Adresse bekommt eine Nachricht: „Dein
                      Passwort wurde geändert" — oft das Einzige, was
                      einen Übernahmeversuch auffliegen lässt.
   ========================================================================== */

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { bremse, entlasten, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { kontoLesen, kontoSchreiben, findeKontoMail, mailNormieren }
  from "../lib/konten.mjs";
import { passwortAblegen, pruefeRegel } from "../lib/passwoerter.mjs";
import { tokenAusstellen, tokenEinloesen, EINLADUNG_STUNDEN, ZURUECKSETZEN_MINUTEN }
  from "../lib/einladungen.mjs";
import { sitzungAnlegen, sitzungenBeenden } from "../lib/sitzungen.mjs";
import { sendeMail, anwendungsAdresse } from "../lib/post.mjs";

const store = () => getStore({ name: "centric", consistency: "strong" });

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const pruefLink = () => !process.env.RESEND_API_KEY
  && process.env.CENTRIC_PRUEFLINK === "ja";

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(zuruecksetzen)\/?/, "");

  try {
    /* ----------------------------- Anfordern ------------------------- */
    if (pfad === "anfordern" && req.method === "POST") {
      const k = kennung(req, null);
      const b = await bremse("anmelden", k);
      if (!b.frei) { await protokoll("zuruecksetzen", k, "gebremst", b.grund);
        return zuVielAntwort(b.wartet); }

      const { email } = await req.json();
      const mail = mailNormieren(email);
      const gleich = { ok: true,
        text: "Falls zu dieser Adresse ein Zugang besteht, ist eine Nachricht unterwegs." };
      if (!mail || !mail.includes("@")) return antwort(gleich);

      const fund = await findeKontoMail(store(), mail);
      if (!fund.eintrag || fund.eintrag.gesperrt) {
        /* Dieselbe Arbeit wie im Erfolgsfall, damit die Dauer nichts
           verrät: eine Prüfsumme und eine kurze Pause. */
        createHash("sha256").update(mail).digest();
        await new Promise((r) => setTimeout(r, 180));
        await protokoll("zuruecksetzen", k, "still");
        return antwort(gleich, 200);
      }

      const konto = fund.eintrag;
      const nr = (konto.einladungNr || 0) + 1;
      await kontoSchreiben(store(), fund.schluessel, { ...konto, einladungNr: nr });

      let link;
      if (konto.passwort) {
        const token = await tokenAusstellen(store(), {
          konto: fund.schluessel, zweck: "zuruecksetzen", nr,
          minuten: ZURUECKSETZEN_MINUTEN });
        link = `${anwendungsAdresse()}/#passwort=${token}`;
        await sendeMail(mail, "Passwort zurücksetzen",
          [`Unter diesem Link legst du ein neues Passwort fest — er gilt`,
           `${ZURUECKSETZEN_MINUTEN} Minuten und genau einmal:`, "", link, "",
           `Wenn du das nicht warst, tu nichts: Ohne den Link ändert sich nichts.`].join("\n"));
      } else {
        /* Bekannte Adresse ohne Passwort: die Einladung wird erneuert.
           Von außen ununterscheidbar vom Zurücksetzen — genau deshalb
           läuft dieser Fall hier und nicht an der Anmeldung. */
        const token = await tokenAusstellen(store(), {
          konto: fund.schluessel, zweck: "einladung", nr,
          minuten: EINLADUNG_STUNDEN * 60 });
        link = `${anwendungsAdresse()}/#einladung=${token}`;
        await sendeMail(mail, "Dein Zugang zu CENTRIC",
          [`Für diese Adresse ist ein Zugang vorbereitet, aber noch kein`,
           `Passwort gesetzt. Unter diesem Link holst du das nach — er gilt`,
           `sieben Tage und genau einmal:`, "", link].join("\n"));
      }

      await protokoll("zuruecksetzen", k, "erfolg",
        konto.passwort ? "zuruecksetzen" : "einladung erneuert");
      return antwort({ ...gleich, ...(pruefLink() ? { link } : {}) });
    }

    /* ----------------------------- Einlösen -------------------------- */
    if (pfad === "einloesen" && req.method === "POST") {
      const k = kennung(req, null);
      const b = await bremse("anmelden", k);
      if (!b.frei) { await protokoll("zuruecksetzen", k, "gebremst", b.grund);
        return zuVielAntwort(b.wartet); }

      const { token, passwort } = await req.json();
      const ungueltig = () => antwort({ fehler: "Der Link ist nicht mehr gültig.",
        text: `Fordere unter „Passwort vergessen" einen neuen an.` }, 400);

      const eintrag = await tokenEinloesen(store(), token, "zuruecksetzen");
      if (!eintrag) { await protokoll("zuruecksetzen", k, "abgewiesen", "token");
        return ungueltig(); }
      const konto = await kontoLesen(store(), eintrag.konto);
      if (!konto || konto.gesperrt || (konto.einladungNr || 0) !== eintrag.nr) {
        await protokoll("zuruecksetzen", k, "abgewiesen", "laufnummer");
        return ungueltig();
      }

      const regel = pruefeRegel(passwort,
        [konto.name, konto.email ? konto.email.split("@")[0] : ""]);
      if (!regel.ok) return antwort({ fehler: regel.grund }, 400);

      await kontoSchreiben(store(), eintrag.konto, {
        ...konto, passwort: await passwortAblegen(passwort),
        status: "aktiv", passwortGeaendert: new Date().toISOString(),
      });

      /* Erst alle alten Sitzungen beenden, dann die neue anlegen. */
      const beendet = await sitzungenBeenden(eintrag.konto);
      const { token: sitzung, gueltigBis } = await sitzungAnlegen({
        bestand: konto.bestand, name: konto.name, rolle: konto.rolle || "kunde",
        person: konto.person ?? null, betrieb: konto.betrieb ?? 0,
        konto: eintrag.konto, einheit: konto.einheit ?? konto.gruppe ?? null,
      });

      if (konto.email) await sendeMail(konto.email, "Dein Passwort wurde geändert",
        ["Soeben wurde für deinen CENTRIC-Zugang ein neues Passwort gesetzt",
         "und alle laufenden Sitzungen wurden beendet.", "",
         "Warst du das nicht, wende dich sofort an deine Organisationsleitung —",
         "sie kann den Zugang sperren."].join("\n"));

      await entlasten("anmelden", k);
      await protokoll("zuruecksetzen", k, "erfolg", `${beendet} Sitzungen beendet`);
      return antwort({ ok: true, token: sitzung, name: konto.name,
        rolle: konto.rolle || "kunde", person: konto.person ?? null,
        betrieb: konto.betrieb ?? 0, hinweis: konto.hinweis || null, gueltigBis });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch {
    return antwort({ fehler: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/zuruecksetzen/*"] };
