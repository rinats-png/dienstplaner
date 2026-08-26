/* ==========================================================================
   NACHFASSEN — einmal täglich

   Zwei Nachrichten je Testbetrieb, nie mehr:

     Tag 3   wenn noch kein Rotationsmodell steht (Stufe < 3). Wer hier
             hängt, hängt fast immer an Zyklus und Startpunkt — die
             Nachricht verweist genau dorthin, nicht auf „unser Angebot".
     Tag 25  fünf Tage vor Ablauf. Einmal, sachlich, mit dem Datum.

   Kein Verkaufsrhythmus, keine Serie: Der Vertrieb greift ein, wenn
   jemand steckt — das ist die Abmachung aus dem Umbauplan. Was gesendet
   wurde, steht am Eintrag; ein zweiter Lauf am selben Tag sendet nichts
   doppelt. Ohne Versandschlüssel läuft alles trocken und protokolliert
   nur, was hinausginge.
   ========================================================================== */

import { getStore } from "@netlify/blobs";
import { sendeMail, anwendungsAdresse } from "../lib/post.mjs";
import { protokoll } from "../lib/schutz.mjs";

const store = () => getStore({ name: "centric", consistency: "strong" });
const TAG = 24 * 60 * 60 * 1000;

export default async () => {
  try {
    const liste = (await store().get("selbststarts", { type: "json" })) || [];
    let gesendet = 0;
    for (let i = 0; i < liste.length; i++) {
      const e = liste[i];
      if (!e || !e.email || !e.angelegt) continue;
      const alter = Math.floor((Date.now() - new Date(e.angelegt).getTime()) / TAG);
      const ablauf = e.laeuftAb ? new Date(e.laeuftAb) : null;
      if (ablauf && ablauf.getTime() < Date.now()) continue;   // vorbei ist vorbei
      const nach = e.nachgefasst || {};

      if (alter >= 3 && (e.stufe || 0) < 3 && !nach.tag3) {
        await sendeMail(e.email, `${e.name}: Hilfe beim Rotationsmodell?`,
          [`Dein Testbetrieb steht seit ein paar Tagen — das Rotationsmodell`,
           `noch nicht. Genau dort bleiben die meisten kurz hängen: Zyklus`,
           `und Startpunkt je Gruppe.`, "",
           `Unter ${anwendungsAdresse()} führt die Tour direkt dorthin;`,
           `die geprüften Modelle (Vier-, Fünf-, Sechsgruppen, Konti) liegen`,
           `als Vorlage bei. Wenn du magst, richten wir es gemeinsam ein —`,
           `antworte einfach auf diese Nachricht.`].join("\n"));
        nach.tag3 = new Date().toISOString(); gesendet++;
      }
      if (alter >= 25 && !nach.tag25) {
        await sendeMail(e.email, `${e.name}: Testzeitraum endet ${ablauf
          ? ablauf.toISOString().slice(0, 10) : "bald"}`,
          [`Dein Testzeitraum läuft in wenigen Tagen aus. Deine Daten bleiben`,
           `erhalten — nichts wird gelöscht, der Zugang wird nur geschlossen.`, "",
           `Wenn du weitermachen willst, antworte auf diese Nachricht; wenn`,
           `nicht, musst du nichts tun.`].join("\n"));
        nach.tag25 = new Date().toISOString(); gesendet++;
      }
      liste[i] = { ...e, nachgefasst: nach };
    }
    if (gesendet) await store().setJSON("selbststarts", liste);
    await protokoll("nachfassen", "zeitplan", "erfolg", `${gesendet} Nachrichten`);
    return new Response(JSON.stringify({ ok: true, gesendet }),
      { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500,
      headers: { "content-type": "application/json" } });
  }
};

export const config = { schedule: "@daily" };
