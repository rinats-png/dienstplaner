/* ==========================================================================
   SITZUNGEN

   Herausgezogen aus daten.mjs, unverändert im Verhalten. Der Anlass:
   Einladungen und das Zurücksetzen von Passwörtern müssen Sitzungen
   lesen und anlegen — und eine zweite Kopie dieser Logik wäre der
   Anfang von zwei Wahrheiten über denselben Vorgang. Die Rechtematrix
   hat diese Lektion schon einmal gekostet; sie steht in matrix.mjs.

   Was eine Sitzung ist: ein zufälliges Token beim Klienten, im Speicher
   nur seine Prüfsumme, daran der Betrieb, die Rolle, die Person und der
   Ablageschlüssel des Kontos. Untätigkeit beendet sie nach dreißig
   Minuten, die Frist nach zwölf Stunden (Betreiber: zwei).
   ========================================================================== */

import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";

export const sitzungsSpeicher = () =>
  getStore({ name: "centric-sitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Prüft den Sitzungsschlüssel aus dem Kopf und gibt die Sitzung zurück. */
export async function sitzungLesen(req) {
  const kopf = req.headers.get("authorization") || "";
  const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
  if (!token) return null;
  const sitzungen = sitzungsSpeicher();

  /* Ein Sicherungsschlüssel ist keine Sitzung: Er läuft nicht ab, weil
     jemand eine halbe Stunde nichts tut, und er wird nirgends verlängert.
     Er darf ausschließlich lesen — das prüft der Endpunkt selbst über
     nurSicherung. */
  const sk = await sitzungen.get(`sk:${hash(token)}`, { type: "json" }).catch(() => null);
  if (sk) {
    if (sk.bis < Date.now()) { await sitzungen.delete(`sk:${hash(token)}`); return null; }
    return { ...sk, nurSicherung: true };
  }

  const s = await sitzungen.get(`t:${hash(token)}`, { type: "json" });
  if (!s) return null;
  const jetzt = Date.now();
  if (s.bis < jetzt) { await sitzungen.delete(`t:${hash(token)}`); return null; }

  /* Untätigkeit beendet die Sitzung, nicht erst die Frist.

     Zwölf Stunden sind für ein eigenes Telefon richtig und für den
     Stationsrechner, den sich eine ganze Schicht teilt, zu lang. Wer eine
     halbe Stunde nichts tut, ist weg — wer arbeitet, bleibt, weil jeder
     Zugriff die Uhr neu stellt. */
  const RUHE = 30 * 60 * 1000;
  if (s.zuletzt && jetzt - s.zuletzt > RUHE) {
    await sitzungen.delete(`t:${hash(token)}`);
    return null;
  }
  /* Nicht bei jedem Zugriff schreiben — ein Planer klickt sich durch einen
     Monat, das wären hunderte Schreibvorgänge. Einmal je Minute genügt. */
  if (!s.zuletzt || jetzt - s.zuletzt > 60 * 1000) {
    sitzungen.setJSON(`t:${hash(token)}`, { ...s, zuletzt: jetzt }).catch(() => {});
  }
  return s;
}

/**
 * Legt eine Sitzung an und gibt das Token zurück — die einzige Stelle,
 * an der es im Klartext existiert. `eintrag` trägt bestand, name, rolle,
 * person, betrieb, konto und einheit; Zeiten setzt diese Funktion.
 */
export async function sitzungAnlegen(eintrag, dauerMs) {
  const token = randomBytes(32).toString("base64url");
  const dauer = dauerMs || 1000 * 60 * 60 * 12;
  await sitzungsSpeicher().setJSON(`t:${hash(token)}`, {
    ...eintrag,
    seit: Date.now(), zuletzt: Date.now(), bis: Date.now() + dauer,
  });
  return { token, gueltigBis: Date.now() + dauer };
}

/**
 * Beendet alle Sitzungen eines Kontos — beim Zurücksetzen des Passworts
 * und beim Austritt. Ein neues Passwort, unter dem eine alte Sitzung
 * weiterläuft, wäre keine Trennung, sondern nur ein neuer Schlüssel
 * neben dem alten.
 */
export async function sitzungenBeenden(kontoSchluessel) {
  if (!kontoSchluessel) return 0;
  const sitzungen = sitzungsSpeicher();
  let beendet = 0;
  try {
    const { blobs } = await sitzungen.list();
    for (const b of blobs) {
      const sit = await sitzungen.get(b.key, { type: "json" });
      if (sit && sit.konto === kontoSchluessel) {
        await sitzungen.delete(b.key);
        beendet++;
      }
    }
  } catch { /* Sitzungen laufen ohnehin nach spätestens zwölf Stunden ab */ }
  return beendet;
}
