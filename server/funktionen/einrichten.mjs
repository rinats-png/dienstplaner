import { smtpStatus } from "../lib/post-smtp.mjs";
import { getStore } from "../lib/ablage.mjs";
import { randomBytes } from "node:crypto";
import { istProduktion } from "../lib/umgebung.mjs";
import { rollenPflicht, rollenPflichtUnerwartet } from "../lib/betreiber-zweifaktor.mjs";
import { bremse, entlasten, kennung, herkunftErlaubt, zuVielAntwort,
  protokoll, GRENZEN, xffOhneVertrauen } from "../lib/schutz.mjs";
import { ablageSchluessel } from "../lib/codes.mjs";
import { kontoSchreiben, alleKonten, raumUebersicht } from "../lib/konten.mjs";
import { bestandLesen } from "../lib/bestand.mjs";
import { ROLLEN_VERGEBBAR, rolleVergebbar } from "../lib/rechte.mjs";
import { betriebFuerNeuenCode, bindungsVorschau } from "../lib/erstbefuellung.mjs";
import { raumLage, ersteinrichtungVermerken, neueZugaengeErlaubt, KUNDENRAUM_TEXT } from "../lib/kundenraumschutz.mjs";
import { verwalterPruefen, verwalterAnlegen, verwalterListe, verwalterSperren, verwalterAktiv,
  verwalterZweifaktorIrgendwo, VerwalterBuchFehler }
  from "../lib/verwalter.mjs";
import { zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigen, zweifaktorPruefen,
  zweifaktorAbschalten, nachweisAusstellen, zweifaktorMoeglich, wiederherstellungNeu } from "../lib/zweifaktor.mjs";

/* ==========================================================================
   EINRICHTUNG
   Legt Zugänge an. Geschützt durch ein Verwaltungskennwort, das als
   Umgebungsvariable hinterlegt wird — nie im Quelltext.

   Aufruf einmalig nach dem ersten Deployment:
     curl -X POST https://<site>/einrichten \
       -H "content-type: application/json" \
       -d '{"verwaltung":"<CENTRIC_ADMIN>","name":"Nordwacht","bestand":"nordwacht"}'
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const antwort = (d, status = 200) => new Response(JSON.stringify(d, null, 2),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/einrichten\/?/, "");
  if (!["", "verwalter", "umgebung", "uebersicht", "bindung", "zweifaktor"].includes(pfad))
    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  if (pfad === "" && req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);

  /* Zustandsändernde Anfragen nur von der eigenen Seite (siehe schutz.mjs). */
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  /* Fünf Versuche in zehn Minuten, danach eine Stunde Sperre. Wer das
     Verwaltungskennwort raten will, braucht mit dieser Bremse länger als
     ein Menschenleben. */
  const k = kennung(req, null);
  const b = await bremse("einrichten", k);
  if (!b.frei) { await protokoll("einrichten", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet); }

  const s0 = store();

  let body;
  try { body = req.method === "GET" ? {} : await req.json(); } catch { body = {}; }
  const { name, bestand, rolle, person, betrieb, hinweis, demo, gruppe } = body || {};

  /* Der Schlüssel darf im Rumpf stehen (wie bisher) oder im Kopf. GET kennt
     keinen Rumpf — ohne den Kopf ließe sich die Liste gar nicht abrufen. */
  const kopfSchluessel = (req.headers.get("authorization") || "").startsWith("Bearer ")
    ? req.headers.get("authorization").slice(7) : null;
  const verwaltung = body.verwaltung || kopfSchluessel;

  /* Wer ist das? Entweder ein benanntes Verwalterkonto oder der
     Ursprungsschlüssel aus der Umgebung. Beides wird zeitkonstant
     verglichen — vorher brach !== beim ersten abweichenden Zeichen ab. */
  const wer = await verwalterPruefen(s0, verwaltung);
  if (!wer) {
    await new Promise((r) => setTimeout(r, 400));
    await protokoll("einrichten", k, "abgewiesen", pfad || "zugang");
    /* Ohne jeden Schlüssel steht die Anwendung noch vor der Einrichtung —
       das ist ein anderer Fall als ein falscher Schlüssel und verdient
       einen anderen Satz. */
    if (!process.env.CENTRIC_ADMIN && (await verwalterAktiv(s0)) === 0)
      return antwort({ fehler: "Es gibt noch keinen Verwalterzugang. "
        + "CENTRIC_ADMIN in den Umgebungsvariablen setzen und damit das erste "
        + "benannte Konto anlegen." }, 500);
    return antwort({ fehler: "Verwaltungsschlüssel stimmt nicht." }, 401);
  }
  await entlasten("einrichten", k);

  /* ---------------------------- Zweiter Faktor (WP-32) ---------------
     Ist für diesen Schlüssel ein zweiter Faktor eingerichtet, gilt er für
     JEDEN Aufruf von /einrichten — Lesen eingeschlossen. Mitzuschicken ist
     ein Code der App (Rumpf `zweifaktor` oder Kopf `x-centric-zweifaktor`),
     ein Wiederherstellungscode oder ein Nachweis
     (Kopf `x-centric-zweifaktor-nachweis`, siehe zweifaktor.mjs).
     Abschalten und das Holen eines Nachweises verlangen einen frischen
     Code, nie einen Nachweis.

     Ebenso Anlegen und Sperren von Verwalterschlüsseln (WP-32 M1): Wer
     einen Nachweis abgreift, soll sich damit keinen eigenen Dauerzugang
     anlegen können.

     Pflicht für Schlüssel OHNE zweiten Faktor — sie kommen nur noch an
     /einrichten/zweifaktor heran, zum Einrichten:
       - sobald irgendein nutzbarer Verwalterschlüssel einen aktiven
         zweiten Faktor hat (automatisch; sonst wäre ein neu angelegter
         Schlüssel der Weg um ihn herum), oder
       - mit CENTRIC_ZWEIFAKTOR_PFLICHT=1 von Anfang an. */
  const zfCode = (body && body.zweifaktor) || req.headers.get("x-centric-zweifaktor") || null;
  const zfNachweis = req.headers.get("x-centric-zweifaktor-nachweis") || null;
  const zfAktion = pfad === "zweifaktor" && req.method === "POST" ? String(body.aktion || "") : "";
  const zfAbschalten = pfad === "zweifaktor" && req.method === "DELETE";
  /* WP-32d (Review 1): In der Auslieferung ist der zweite Faktor auch für Verwalterschlüssel Pflicht — sonst legte
     der Schlüssel allein einen Betreibercode an und richtete dessen Faktor selbst ein. */
  const zfPflichtUmgebung = istProduktion() || (process.env.CENTRIC_ZWEIFAKTOR_PFLICHT || "").trim() === "1";
  const zfVerwalterAenderung = pfad === "verwalter" && (req.method === "POST" || req.method === "DELETE");
  const zfKennungen = [`v:${wer.zweifaktorId.slice(0, 16)}`, k];
  /** Bremse für Code-Versuche: je Schlüssel und je Herkunft, fail-closed. */
  const zfBremse = async () => {
    for (const kk of zfKennungen) {
      const bz = await bremse("zweifaktor", kk);
      if (!bz.frei) { await protokoll("zweifaktor", k, "gebremst", bz.grund);
        return zuVielAntwort(bz.wartet); }
      if (bz.fehler && GRENZEN.zweifaktor.failClosed)
        return antwort({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
          + "Bitte später erneut versuchen." }, 503);
    }
    return null;
  };
  const zfEntlasten = async () => { for (const kk of zfKennungen) await entlasten("zweifaktor", kk); };

  let zfStand;
  try { zfStand = await zweifaktorStand(s0, wer.zweifaktorId); }
  catch {
    return antwort({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
      + "Bitte später erneut versuchen." }, 503);
  }
  const zfPflicht = zfPflichtUmgebung || zfStand.aktiv || await verwalterZweifaktorIrgendwo(s0);
  /* WR-2: Die Neugenerierung der Wiederherstellungscodes prüft ihren frischen Code aus der App selbst — zusammen mit
     dem Erzeugen und Ersetzen unter EINER Sperre (zweifaktor.mjs, wiederherstellungNeu). Die allgemeine Prüfung unten
     liefe vorher und verbrauchte den Zeitschritt. Ein Wiederherstellungscode oder Nachweis gilt dort nie. */
  const zfNeu = zfAktion === "wiederherstellung-neu";
  if (zfStand.aktiv && !zfNeu) {
    const nurCode = zfAbschalten || zfAktion === "nachweis" || zfVerwalterAenderung;
    if (!zfCode && (nurCode || !zfNachweis)) {
      await protokoll("zweifaktor", k, "abgewiesen", `fehlt · ${wer.name}`);
      return antwort({ fehler: nurCode
        ? "Dafür ist ein frischer Code aus der App nötig."
        : "Für diesen Schlüssel ist ein zweiter Faktor eingerichtet. Bitte den Code aus der App mitschicken.",
      zweifaktor: "erforderlich" }, 401);
    }
    if (zfCode) { const gebremst = await zfBremse(); if (gebremst) return gebremst; }
    const p = await zweifaktorPruefen(s0, wer.zweifaktorId,
      { code: zfCode || undefined, nachweis: zfNachweis || undefined, nachweisErlaubt: !nurCode });
    if (!p.ok) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${p.grund} · ${wer.name}`);
      return antwort({ fehler: p.grund === "wiederholt"
        ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
        : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401);
    }
    if (zfCode) await zfEntlasten();
    if (p.art === "wiederherstellung")
      await protokoll("zweifaktor", k, "erfolg", `Wiederherstellungscode verbraucht · ${wer.name}`);
  } else if (zfPflicht && pfad !== "zweifaktor") {
    await protokoll("zweifaktor", k, "abgewiesen", `Pflicht, nicht eingerichtet · ${wer.name}`);
    return antwort({ fehler: "Ein zweiter Faktor ist Pflicht und für diesen Schlüssel noch nicht "
      + "eingerichtet. Zuerst unter /einrichten/zweifaktor einrichten.", zweifaktor: "einrichten" }, 403);
  }

  if (pfad === "zweifaktor") {
    const id = wer.zweifaktorId;
    if (req.method === "GET") {
      /* Neu gelesen: Ein eben verbrauchter Wiederherstellungscode zählt mit. */
      const st = await zweifaktorStand(s0, id);
      return antwort({ aktiv: st.aktiv, ausstehend: st.ausstehend,
        wiederherstellungUebrig: st.wiederherstellungUebrig, pflicht: zfPflicht,
        moeglich: zweifaktorMoeglich(), ich: wer.name });
    }

    if (req.method === "DELETE") {
      if (!zfStand.aktiv) return antwort({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409);
      try { await zweifaktorAbschalten(s0, id); }
      catch {
        return antwort({ fehler: "Abschalten gerade nicht möglich — die Ablage antwortet nicht. "
          + "Der zweite Faktor bleibt eingerichtet." }, 503);
      }
      await protokoll("zweifaktor", k, "erfolg", `abgeschaltet · ${wer.name}`);
      return antwort({ ok: true, aktiv: false });
    }

    if (req.method !== "POST") return antwort({ fehler: "Nur GET, POST oder DELETE." }, 405);

    if (zfAktion === "beginnen") {
      if (zfStand.aktiv) return antwort({ fehler: "Der zweite Faktor ist schon eingerichtet. "
        + "Zum Neueinrichten erst abschalten." }, 409);
      const erg = await zweifaktorBeginnen(s0, id, wer.name);
      if (erg.fehler === "pfeffer") return antwort({ fehler: "CENTRIC_PFEFFER fehlt. Ohne ihn lässt "
        + "sich das Geheimnis nicht verschlüsselt ablegen." }, 503);
      if (erg.fehler) return antwort({ fehler: "Der zweite Faktor ist schon eingerichtet." }, 409);
      await protokoll("zweifaktor", k, "erfolg", `Einrichtung begonnen · ${wer.name}`);
      return antwort({ ok: true, geheimnis: erg.geheimnis, otpauth: erg.otpauth,
        hinweis: "Geheimnis und Adresse erscheinen genau einmal. In der App erfassen und "
          + "mit dem ersten Code bestätigen (aktion: bestaetigen)." });
    }

    if (zfAktion === "bestaetigen") {
      if (zfStand.aktiv) return antwort({ fehler: "Der zweite Faktor ist schon eingerichtet." }, 409);
      if (!zfStand.ausstehend) return antwort({ fehler: "Es ist keine Einrichtung begonnen." }, 409);
      if (!zfCode) return antwort({ fehler: "Bitte den ersten Code aus der App angeben." }, 400);
      const gebremst = await zfBremse(); if (gebremst) return gebremst;
      const erg = await zweifaktorBestaetigen(s0, id, zfCode);
      if (erg.fehler === "pfeffer") return antwort({ fehler: "Das Geheimnis lässt sich nicht "
        + "entschlüsseln (CENTRIC_PFEFFER fehlt oder wurde geändert). Neu beginnen." }, 503);
      if (erg.fehler === "epoche") return antwort({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
        + "Bitte später erneut versuchen." }, 503);
      if (erg.fehler) {
        await new Promise((r) => setTimeout(r, 400));
        await protokoll("zweifaktor", k, "abgewiesen", `Bestätigung · ${wer.name}`);
        return antwort({ fehler: "Der Code stimmt nicht.", zweifaktor: "falsch" }, 401);
      }
      await zfEntlasten();
      await protokoll("zweifaktor", k, "erfolg", `eingerichtet · ${wer.name}`);
      return antwort({ ok: true, aktiv: true, wiederherstellung: erg.wiederherstellung,
        hinweis: "Die Wiederherstellungscodes erscheinen genau einmal. Jeder gilt einmal. "
          + "Gespeichert ist nur ihre Prüfsumme." });
    }

    if (zfAktion === "nachweis") {
      if (!zfStand.aktiv) return antwort({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409);
      return antwort({ ok: true, ...(await nachweisAusstellen(s0, id)),
        hinweis: "Im Kopf x-centric-zweifaktor-nachweis mitschicken. Gilt 15 Minuten, nur für "
          + "diesen Schlüssel, nicht zum Abschalten." });
    }
    if (zfNeu) {
      /* WR-2: Verwalterschlüssel (oben geprüft, erster Faktor) UND frischer Code aus der App. */
      if (!zfStand.aktiv) return antwort({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409);
      const neuCode = typeof zfCode === "string" ? zfCode.replace(/\s/g, "") : "";
      if (!neuCode) return antwort({ fehler: "Dafür ist ein frischer Code aus der App nötig.",
        zweifaktor: "erforderlich" }, 401);
      const gebremst = await zfBremse(); if (gebremst) return gebremst;
      if (!/^\d{6}$/.test(neuCode)) {
        await new Promise((r) => setTimeout(r, 400));
        await protokoll("zweifaktor", k, "abgewiesen", "Neugenerierung ohne Code aus der App");
        return antwort({ fehler: "Neue Wiederherstellungscodes gibt es nur mit dem aktuellen Code aus der App, "
          + "nicht mit einem Wiederherstellungscode.", zweifaktor: "falsch" }, 401);
      }
      let r;
      try { r = await wiederherstellungNeu(s0, id, neuCode); }
      catch {
        return antwort({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
          + "Bitte später erneut versuchen." }, 503);
      }
      if (!r.ok && (r.fehler === "pfeffer" || r.fehler === "epoche"))
        return antwort({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
          + "Bitte später erneut versuchen." }, 503);
      if (!r.ok) {
        await new Promise((res) => setTimeout(res, 400));
        await protokoll("zweifaktor", k, "abgewiesen", `Neugenerierung · ${r.fehler}`);
        return antwort({ fehler: r.fehler === "wiederholt"
          ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
          : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401);
      }
      await zfEntlasten();
      await protokoll("zweifaktor", k, "erfolg", "Wiederherstellungscodes neu erzeugt");
      return antwort({ ok: true, wiederherstellung: r.wiederherstellung,
        hinweis: "Neue Wiederherstellungscodes. Sie erscheinen genau einmal; jeder gilt einmal. Alle bisherigen "
          + "Wiederherstellungscodes gelten nicht mehr." });
    }
    return antwort({ fehler: "Unbekannte Aktion. Erlaubt: beginnen, bestaetigen, nachweis, "
      + "wiederherstellung-neu." }, 400);
  }

  /* Beschäftigte und Schichtverantwortung schreiben nur, was zu ihrer
     Person gehört — ein Code dieser Rollen ohne Person kann deshalb nichts
     und sieht in der Oberfläche eine Rollenauswahl statt eines Menschen.
     Solche Codes entstehen gar nicht erst.

     Diese Prüfung steht bewusst hinter dem Verwaltungsschlüssel und hinter
     dem Entlasten: Wer sich ausgewiesen hat und dann einen fachlichen
     Fehler macht, soll dafür nicht in die Bremse gegen das Erraten des
     Schlüssels laufen. */
  /* Nur Rollen, die es gibt (Commit D1d). Bis hierher nahm diese Stelle
     jede Bezeichnung an; eine Sitzung mit erfundener Rolle fiel beim Lesen
     auf den Rohbestand des eigenen Betriebs durch. Seit 2026-11-07 gibt es
     auch keine Vorgabe „kunde" mehr: Ohne ausdrückliche Rolle entsteht kein
     Zugang, und „kunde" selbst wird nicht mehr vergeben. Eine Demo ist
     `demo: true` mit einer echten Rolle (z. B. „leitung"). */
  if (req.method === "POST" && !pfad && !rolleVergebbar(rolle))
    return antwort({ fehler: rolle === undefined || rolle === null || rolle === ""
      ? "Eine Rolle ist nötig."
      : (rolle === "kunde" ? "Die Rolle „kunde“ wird nicht mehr vergeben." : "Diese Rolle gibt es nicht."),
      text: `Erlaubt sind: ${ROLLEN_VERGEBBAR.join(", ")}. Ein Demozugang ist demo: true mit einer dieser Rollen.` }, 400);

  if (req.method === "POST" && !pfad && (rolle === "mitarbeiter" || rolle === "subplaner")
      && (person === null || person === undefined || person === ""))
    return antwort({ fehler: `Ein Zugang der Rolle „${rolle}" braucht eine Person. `
      + "Bitte die Kennung der Person aus dem Betrieb angeben." }, 400);

  /* ---------------------------- Verwalterkonten ----------------------
     Ein Geheimnis für alle lässt sich weder entziehen noch zuordnen.
     Benannte Konten lösen beides: eigener Schlüssel je Person, einzeln
     widerrufbar, mit Namen im Protokoll.                              */
  if (pfad === "verwalter") {
    if (req.method === "GET")
      return antwort({ verwalter: await verwalterListe(s0), ich: wer.name });

    if (req.method === "POST") {
      if (!body.neuerName || String(body.neuerName).trim().length < 2)
        return antwort({ fehler: "Bitte einen Namen angeben." }, 400);
      const erg = await verwalterAnlegen(s0, {
        name: body.neuerName, email: body.email, tage: body.tage, durch: wer.name });
      await protokoll("verwalter", k, "angelegt", `${body.neuerName} durch ${wer.name}`);
      return antwort({ ok: true, ...erg, name: String(body.neuerName).trim(),
        hinweis: "Dieser Schlüssel erscheint genau einmal. Gespeichert ist nur seine "
          + "Prüfsumme." });
    }

    if (req.method === "DELETE") {
      if (!body.kennung) return antwort({ fehler: "Keine Kennung angegeben." }, 400);
      if (body.kennung === wer.kennung)
        return antwort({ fehler: "Der eigene Zugang lässt sich nicht sperren. "
          + "Sonst steht am Ende niemand mehr bereit." }, 400);
      let n;
      try { n = await verwalterSperren(s0, body.kennung); }
      catch (e) {
        if (!(e instanceof VerwalterBuchFehler)) throw e;
        /* E-M6: Die Sperre wirkt (Ablage), nur das Widerrufbuch fehlt — laut melden, nie still. */
        await protokoll("verwalter", k, "fehler", `Widerruf wirksam, Widerrufbuch nicht beschrieben: ${body.kennung} durch ${wer.name}`);
        return antwort({ fehler: "Widerruf wirksam, Widerrufbuch nicht beschrieben.", widerrufWirksam: true, gesperrt: e.gesperrt,
          text: "Der Schlüssel ist gesperrt. Dass er nach dem Zurückspielen einer älteren Sicherung gesperrt bleibt, holt der "
            + "nächste Serverstart nach (BEREITSTELLUNG.md §5.4)." }, 503);
      }
      await protokoll("verwalter", k, "gesperrt", `${body.kennung} durch ${wer.name}`);
      return antwort({ ok: true, gesperrt: n });
    }
    return antwort({ fehler: "Nur GET, POST oder DELETE." }, 405);
  }

  /* ---------------------------- Umgebungsbericht ---------------------
     Ob eine Umgebungsvariable im Container angekommen ist, war von außen
     nicht feststellbar — die .env liegt mit Rechten 600 auf dem Server,
     und wer sie setzt, kann anschließend nur raten, ob der Container sie
     gelesen hat. Das hat schon einmal dazu geführt, dass eine Anwendung
     ohne Pfeffer lief, ohne dass es jemandem auffiel.

     Deshalb hier: ja oder nein, nie der Wert. Der Bericht steht hinter
     derselben Prüfung wie das Anlegen von Zugängen; wer ihn lesen darf,
     dürfte die Werte ohnehin setzen.                                   */
  if (pfad === "umgebung") {
    if (req.method !== "GET") return antwort({ fehler: "Nur GET." }, 405);

    const gesetzt = (n) => !!(process.env[n] || "").trim();
    const absender = (process.env.CENTRIC_ABSENDER || "").trim();
    /* Resends Sandbox-Adresse stellt ausschließlich an den Kontoinhaber
       zu. Sie ist gesetzt und funktioniert — nur eben nicht für Kunden. */
    const sandbox = /@resend\.dev$/i.test(absender);

    const warnungen = [];
    if (!gesetzt("CENTRIC_PFEFFER"))
      warnungen.push("CENTRIC_PFEFFER fehlt. Zugangscodes liegen als ungesalzenes "
        + "SHA-256 im Speicher. Jetzt setzen — nach dem ersten Code geht es nicht "
        + "mehr folgenlos.");
    if (gesetzt("CENTRIC_ADMIN"))
      warnungen.push("CENTRIC_ADMIN ist noch gesetzt. Nach dem Anlegen des ersten "
        + "benannten Verwalterkontos gehört der Ursprungsschlüssel gelöscht.");
    const smtp = smtpStatus();
    if (smtp === "fehlerhaft")
      warnungen.push("Der SMTP-Weg ist gewählt, aber fehlerhaft eingerichtet (docs/MAIL-SMTP-IONOS.md). Es geht keine E-Mail hinaus.");
    else if (!gesetzt("RESEND_API_KEY") && smtp !== "konfiguriert")
      warnungen.push("RESEND_API_KEY fehlt. Es geht keine E-Mail hinaus.");
    else if (smtp === "aus" && (sandbox || !absender))
      warnungen.push("CENTRIC_ABSENDER steht auf der Sandbox-Adresse von Resend. "
        + "Nachrichten erreichen nur den Kontoinhaber, alle übrigen verschwinden "
        + "ohne Fehlermeldung.");
    if (gesetzt("VAPID_PUBLIC") !== gesetzt("VAPID_PRIVATE"))
      warnungen.push("Vom VAPID-Paar ist nur eine Hälfte gesetzt. So lässt sich "
        + "keine Push-Mitteilung versenden.");
    /* B-XFF-1: ohne Vertrauensliste teilen sich hinter Caddy alle Nutzer eine Herkunft. */
    if (!gesetzt("CENTRIC_VERTRAUTE_PROXYS") && xffOhneVertrauen() > 0)
      warnungen.push("CENTRIC_VERTRAUTE_PROXYS fehlt, aber Anfragen kommen mit X-Forwarded-For "
        + "(also über einen Proxy). Alle Nutzer zählen unter der Adresse des Proxys — die Bremse "
        + "je Herkunft träfe alle gemeinsam. Netz des Caddy-Containers eintragen.");

    /* SI-P4, Review-Auflage N4: Der Schalter kennt nur „1“. Ein anderer Wert schaltet die Pflicht NICHT ein. */
    if (rollenPflichtUnerwartet())
      warnungen.push("CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT hat einen unerwarteten Wert. Nur „1“ schaltet die Pflicht "
        + "zum zweiten Faktor für Leitung, Planung und Kunde ein — so ist sie AUS.");

    return antwort({
      gepr: new Date().toISOString(),
      umgebung: {
        pfeffer: gesetzt("CENTRIC_PFEFFER"),
        ursprungsschluessel: gesetzt("CENTRIC_ADMIN"),
        mailversand: gesetzt("RESEND_API_KEY") || smtp === "konfiguriert",
        smtp, /* nur „konfiguriert“, „fehlerhaft“ oder „aus“ — nie ein Wert */
        absender: absender || null,
        absenderIstSandbox: sandbox,
        pushOeffentlich: gesetzt("VAPID_PUBLIC"),
        pushPrivat: gesetzt("VAPID_PRIVATE"),
        bremseAtomar: gesetzt("REDIS_REST_URL") && gesetzt("REDIS_REST_TOKEN"),
        vertrauteProxys: gesetzt("CENTRIC_VERTRAUTE_PROXYS"),
        zweifaktorPflicht: istProduktion() || (process.env.CENTRIC_ZWEIFAKTOR_PFLICHT || "").trim() === "1",
        rollenZweifaktorPflicht: rollenPflicht(),
      },
      verwalterkonten: await verwalterAktiv(s0),
      warnungen,
      /* Ein leeres `warnungen` ist die einzige Aussage, die zählt. */
      inOrdnung: warnungen.length === 0,
    });
  }

  /* ---------------------------- Übersicht eines Raums ----------------
     Was gibt es schon? Bis hierher konnte das niemand fragen: /einrichten
     legte nur an, und die einzige Liste war die öffentliche Demoliste.
     Das Bereitstellungsskript lief deshalb zweimal blind durch und legte
     jeden Zugang doppelt an.

     Hier stehen die Zugänge eines Raums und die Selbststarts — ohne Codes
     und ohne Prüfsummen. Die gekürzte Kennung genügt zum Sperren.        */
  if (pfad === "uebersicht") {
    if (req.method !== "GET") return antwort({ fehler: "Nur GET." }, 405);
    const raum = url.searchParams.get("bestand") || "";
    if (!/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(raum))
      return antwort({ fehler: "Kein gültiger Raumname." }, 400);
    return antwort({ ...(await raumUebersicht(s0, raum)), ich: wer.name });
  }

  /* ------------------- Alte Codes an ihren Betrieb binden -------------
     Codes von vor Oktober 2026 zeigen nur über ihre Position auf den
     Betrieb. In einem Raum mit genau einem Betrieb ergänzt die Anmeldung
     die Kennung von selbst. In Räumen mit mehreren Betrieben — dem
     Demoraum — wird nicht geraten: GET zeigt, worauf jeder Code heute
     zeigt (Trockenlauf). POST bindet nur, was ein Mensch geprüft und
     ausdrücklich bestätigt hat, und nur, wenn die Position noch auf
     genau diesen Betrieb zeigt. */
  if (pfad === "bindung") {
    const raumB = req.method === "GET" ? (url.searchParams.get("bestand") || "") : String(body.bestand || "");
    if (!/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(raumB))
      return antwort({ fehler: "Kein gültiger Raumname." }, 400);
    const gelesenB = await bestandLesen(s0, raumB);
    const bestandB = gelesenB && gelesenB.bestand;
    if (!bestandB) return antwort({ fehler: "Raum ist noch nicht eingerichtet." }, 409);
    const konten = await alleKonten(s0);
    const eigene = Object.entries(konten).filter(([, kk]) => kk && kk.bestand === raumB && kk.rolle !== "betreiber");
    const zugaenge = eigene.map(([h, kk]) => ({ ...kk, kennung: h.slice(-8) }));
    if (req.method === "GET")
      return antwort({ bestand: raumB, trockenlauf: true,
        betriebe: (bestandB.mandanten || []).map((m, i) => ({ stelle: i, id: m.id, name: m.name || null })),
        zugaenge: bindungsVorschau(bestandB, zugaenge) });
    if (req.method !== "POST") return antwort({ fehler: "Nur GET oder POST." }, 405);
    const zuordnung = Array.isArray(body.zuordnung) ? body.zuordnung : [];
    if (!zuordnung.length) return antwort({ fehler: "Keine Zuordnung angegeben." }, 400);
    const ergebnis = [];
    for (const z of zuordnung) {
      const treffer = eigene.filter(([h]) => h.slice(-8) === String(z && z.kennung));
      if (treffer.length !== 1) { ergebnis.push({ kennung: z && z.kennung, gebunden: false, grund: "nicht eindeutig" }); continue; }
      const [h, kk] = treffer[0];
      if (kk.mandantId) { ergebnis.push({ kennung: z.kennung, gebunden: false, grund: "schon gebunden" }); continue; }
      const i = Number(kk.betrieb ?? 0);
      const m = Number.isInteger(i) ? (bestandB.mandanten || [])[i] : null;
      if (!m || m.id !== z.mandantId) {
        ergebnis.push({ kennung: z.kennung, gebunden: false, grund: "Position zeigt nicht auf diesen Betrieb" });
        continue;
      }
      await kontoSchreiben(s0, h, { ...kk, mandantId: m.id, gebunden: new Date().toISOString(),
        gebundenDurch: wer.name });
      ergebnis.push({ kennung: z.kennung, gebunden: true, mandantId: m.id });
    }
    await protokoll("einrichten", k, "erfolg",
      `Bindung ${raumB}: ${ergebnis.filter((x) => x.gebunden).length} von ${ergebnis.length} durch ${wer.name}`);
    return antwort({ bestand: raumB, ergebnis });
  }

  if (!name || !bestand) return antwort({ fehler: "name und bestand sind nötig." }, 400);

  /* Codes für Kundenrollen nur für einen eingerichteten Raum, gebunden an
     Position und Kennung des Betriebs. Bis Oktober 2026 entstand hier auch
     ein Code für einen Raum, den es noch nicht gab — und der erste Client
     befüllte ihn. Den leeren Raum richtet jetzt der Betreiber ein
     (/api/bestand-anlegen); sein eigener Code darf deshalb vorher entstehen. */
  let bindungE = { betrieb: betrieb ?? 0, mandantId: null };
  let lageE = null;
  if (rolle !== "betreiber") {
    const gelesenE = await bestandLesen(s0, bestand);
    const b2 = betriebFuerNeuenCode(gelesenE && gelesenE.bestand, betrieb);
    if (b2.grund) {
      await protokoll("einrichten", k, "abgewiesen", `${bestand}: ${b2.grund}`);
      return antwort({ fehler: b2.grund }, 409);
    }
    bindungE = b2;

    /* SI-P6, Betreiberentscheidung G.2: Auch hier legt niemand ohne nachweisbare Kundenzustimmung neue Zugänge für
       einen BESTEHENDEN Kundenraum an — für jede Rolle, Demozugang eingeschlossen, gleich ob eine Leitung fehlt.
       Der Verwalterschlüssel (mit zweitem Faktor) ersetzt keine Zustimmung. Erlaubt: die Ersteinrichtung eines neuen
       Betriebs (lib/kundenraumschutz.mjs); in einem Raum, der nur Demozugänge hat, nur weitere Demozugänge.
       Betreibercodes sind kein Kundenzugang und bleiben außerhalb. Lässt sich der Raum nicht lesen: nichts. */
    try { lageE = await raumLage(s0, bestand); }
    catch {
      await protokoll("einrichten", k, "fehler", `${bestand}: Raum nicht prüfbar (Kundenraumschutz)`);
      return antwort({ fehler: "Der Raum lässt sich gerade nicht prüfen. Bitte später erneut versuchen." }, 503);
    }
    if (!neueZugaengeErlaubt(lageE, !!demo)) {
      await protokoll("einrichten", k, "abgewiesen",
        `${bestand}: Kundenraum, neue Zugänge gesperrt (${lageE.art}${lageE.grund ? ` · ${lageE.grund}` : ""}) · ${rolle}${demo ? " demo" : ""}`);
      return antwort({ fehler: KUNDENRAUM_TEXT, grund: "kundenraum_gesperrt" }, 409);
    }
  } else {
    /* SI-P6, Review-Befund B1 (hoch): Auch ein Betreibercode ist kein Freibrief. Gebunden an einen BESTEHENDEN Kundenraum
       liest und schreibt er dessen Bestand (Personenkennungen, Rollen, Adressen). Der Betreiber legt ihn deshalb nur für einen
       neuen Raum, einen Raum im Fenster der Ersteinrichtung oder einen reinen Demoraum an (sein eigener Raum zählt als „neu“,
       weil Betreibercodes kein Kundenzugang sind). Kein Vermerk der Ersteinrichtung, keine Fensteröffnung. Nicht prüfbar: nichts. */
    let lageB;
    try { lageB = await raumLage(s0, bestand); }
    catch {
      await protokoll("einrichten", k, "fehler", `${bestand}: Raum nicht prüfbar (Kundenraumschutz, Betreibercode)`);
      return antwort({ fehler: "Der Raum lässt sich gerade nicht prüfen. Bitte später erneut versuchen." }, 503);
    }
    if (!["neu", "fenster", "demo"].includes(lageB.art)) {
      await protokoll("einrichten", k, "abgewiesen",
        `${bestand}: Kundenraum, Betreibercode gesperrt (${lageB.art}${lageB.grund ? ` · ${lageB.grund}` : ""})`);
      return antwort({ fehler: KUNDENRAUM_TEXT, grund: "kundenraum_gesperrt" }, 409);
    }
  }

  /* Ein Demozugang je Betrieb und Rolle. Die Startseite zeigt jeden
     aktiven Demozugang als eigene Karte; zwei gleiche wären zwei Karten
     mit demselben Namen. Das ist nie gewollt — wer denselben Betrieb aus
     einem zweiten Blickwinkel zeigen will, nimmt eine andere Rolle. Ein
     gesperrter Eintrag zählt nicht: Nach dem Zurückziehen darf neu
     angelegt werden. */
  if (demo) {
    const konten = await alleKonten(s0);
    const gleicheRolle = rolle, gleicherBetrieb = betrieb ?? 0;
    const vorhanden = Object.values(konten).find((k) => k && k.demo && !k.gesperrt
      && k.bestand === bestand && (k.betrieb ?? 0) === gleicherBetrieb
      && k.rolle === gleicheRolle);
    if (vorhanden) {
      await protokoll("einrichten", k, "abgewiesen", `Demozugang doppelt · ${bestand}`);
      return antwort({ fehler: "Für diesen Betrieb und diese Rolle gibt es bereits einen "
        + "aktiven Demozugang. Erst zurückziehen, dann neu anlegen.",
        vorhanden: { id: vorhanden.id || null, name: vorhanden.name || null,
          rolle: gleicheRolle, betrieb: gleicherBetrieb, gruppe: vorhanden.gruppe || null,
          angelegt: vorhanden.angelegt || null } }, 409);
    }
  }

  // Zugangscode in gut vorlesbarer Form: vier Blöcke, keine verwechselbaren Zeichen
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
  const block = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join("");
  const code = `${block()}-${block()}-${block()}`;

  const s = s0;
  const konto = { name, bestand,
    rolle,                         // betreiber | leitung | planer | subplaner | mitarbeiter | betriebsrat
    person: person ?? null,        // Index der Person innerhalb des Betriebs
    betrieb: bindungE.betrieb,     // Index des Betriebs im Bestand
    mandantId: bindungE.mandantId, // und seine Kennung — beides muss zusammenpassen
    hinweis: hinweis || null,
    /* Als Demozugang gekennzeichnete Konten erscheinen auf der Anmeldeseite
       und lassen sich ohne Code öffnen. Alle übrigen bleiben geschützt. */
    demo: !!demo, gruppe: gruppe || null,
    /* Kennung aus dem Code selbst statt aus der Anzahl — die Anzahl war
       unter Nebenläufigkeit nicht eindeutig. */
    id: demo ? `d${ablageSchluessel(code).slice(-8)}` : null,
    angelegt: new Date().toISOString() };
  /* Erster Vorgang der Ersteinrichtung: das Fenster vermerken, BEVOR ein Code entsteht (SI-P6). */
  if (lageE && lageE.art === "neu") {
    try { await ersteinrichtungVermerken(s, bestand); }
    catch {
      await protokoll("einrichten", k, "fehler", `${bestand}: Ersteinrichtung nicht vermerkbar`);
      return antwort({ fehler: "Der Raum lässt sich gerade nicht einrichten. Bitte später erneut versuchen." }, 503);
    }
  }
  await kontoSchreiben(s, ablageSchluessel(code), konto);

  /* Wer es war, steht jetzt im Protokoll — nicht mehr nur ein Hashwert
     der Netzadresse. */
  await protokoll("einrichten", k, "erfolg",
    `${rolle} · ${bestand} · durch ${wer.name}`);
  return antwort({ ok: true, zugangscode: code, name, bestand,
    hinweis: "Diesen Code sicher weitergeben. Er wird nur als Prüfsumme gespeichert "
      + "und lässt sich nicht wiederherstellen." });
};

export const config = { path: ["/einrichten", "/einrichten/*"] };
