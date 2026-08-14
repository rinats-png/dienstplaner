/* ==========================================================================
   VERWALTERKONTEN

   Der Betreiberzugang lief über ein einziges Geheimnis in der
   Umgebungsvariablen CENTRIC_ADMIN. Wer es kannte, konnte Zugänge für jeden
   Betrieb anlegen — und das Protokoll hielt davon nur einen Hashwert der
   Netzadresse fest.

   Drei Dinge gehen dabei nicht:

   Es lässt sich nicht entziehen. Scheidet jemand aus, muss das Geheimnis
   für alle gewechselt werden, und jedes Skript, das es benutzt, bricht.

   Es lässt sich nicht zuordnen. Nach einem Vorfall steht im Protokoll
   „jemand mit dem Verwaltungskennwort" — das ist keine Auskunft.

   Und es steht in einer Umgebungsvariablen, die jeder sieht, der Zugriff
   auf die Netlify-Oberfläche hat.

   Jetzt gibt es benannte Konten: je Person ein eigener Schlüssel, einzeln
   widerrufbar, mit Namen im Protokoll. CENTRIC_ADMIN bleibt als
   Ursprungsschlüssel — er legt das erste Konto an und kann danach aus der
   Umgebung entfernt werden.
   ========================================================================== */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

export const verwalterSchluessel = (roh) => `verwalter:${hash(roh)}`;

/** Zeitkonstanter Vergleich — sonst verrät die Laufzeit das Geheimnis. */
export function gleich(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Ein neuer Schlüssel. Vier Blöcke, gut vorlesbar, ohne Verwechsler. */
export function neuerSchluessel() {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
  const block = () => Array.from(randomBytes(5))
    .map((b) => alphabet[b % alphabet.length]).join("");
  return `V-${block()}-${block()}-${block()}-${block()}`;
}

/**
 * Wer ist das? Prüft den mitgeschickten Schlüssel.
 *
 * Zwei Fälle sind erlaubt:
 *   ein benanntes Verwalterkonto — dann steht sein Name im Protokoll
 *   der Ursprungsschlüssel CENTRIC_ADMIN — solange er gesetzt ist
 *
 * @returns {{ art, name, schluessel }} oder null
 */
export async function verwalterPruefen(store, roh) {
  if (!roh) return null;

  const eintrag = await store.get(verwalterSchluessel(roh), { type: "json" })
    .catch(() => null);
  if (eintrag) {
    if (eintrag.gesperrt) return null;
    if (eintrag.laeuftAb && new Date(eintrag.laeuftAb).getTime() < Date.now()) return null;
    return { art: "konto", name: eintrag.name, kennung: hash(roh).slice(0, 8),
      email: eintrag.email || null };
  }

  const ursprung = process.env.CENTRIC_ADMIN;
  /* Nur vergleichen, wenn überhaupt einer gesetzt ist. Ein leerer
     Ursprungsschlüssel darf nicht auf eine leere Eingabe passen. */
  if (ursprung && gleich(roh, ursprung))
    return { art: "ursprung", name: "Ursprungsschlüssel", kennung: "ursprung", email: null };

  return null;
}

/** Legt ein benanntes Konto an und gibt den Schlüssel genau einmal zurück. */
export async function verwalterAnlegen(store, { name, email, tage, durch }) {
  const roh = neuerSchluessel();
  const laeuftAb = tage
    ? new Date(Date.now() + Math.min(3650, Math.max(1, Number(tage))) * 86400000).toISOString()
    : null;
  await store.setJSON(verwalterSchluessel(roh), {
    name: String(name).trim(),
    email: email ? String(email).trim() : null,
    angelegt: new Date().toISOString(),
    angelegtVon: durch || "unbekannt",
    laeuftAb,
    gesperrt: false,
  });
  return { schluessel: roh, kennung: hash(roh).slice(0, 8), laeuftAb };
}

/** Alle Konten — ohne die Schlüssel, die gibt es nur einmal. */
export async function verwalterListe(store) {
  const { blobs } = await store.list({ prefix: "verwalter:" }).catch(() => ({ blobs: [] }));
  const aus = [];
  for (const b of blobs) {
    const e = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!e) continue;
    aus.push({
      kennung: b.key.slice("verwalter:".length, "verwalter:".length + 8),
      name: e.name, email: e.email || null,
      angelegt: e.angelegt, angelegtVon: e.angelegtVon || null,
      laeuftAb: e.laeuftAb || null, gesperrt: !!e.gesperrt,
      abgelaufen: !!(e.laeuftAb && new Date(e.laeuftAb).getTime() < Date.now()),
    });
  }
  return aus.sort((a, b) => (a.angelegt < b.angelegt ? 1 : -1));
}

/**
 * Sperrt ein Konto. Gelöscht wird nicht — der Eintrag bleibt als Beleg
 * stehen, dass es dieses Konto gab und wann es endete.
 */
export async function verwalterSperren(store, kennung) {
  const { blobs } = await store.list({ prefix: `verwalter:${kennung}` })
    .catch(() => ({ blobs: [] }));
  let n = 0;
  for (const b of blobs) {
    const e = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!e || e.gesperrt) continue;
    await store.setJSON(b.key, { ...e, gesperrt: true, gesperrtAm: new Date().toISOString() });
    n++;
  }
  return n;
}

/** Wie viele Konten gibt es, die nicht gesperrt und nicht abgelaufen sind? */
export async function verwalterAktiv(store) {
  return (await verwalterListe(store)).filter((v) => !v.gesperrt && !v.abgelaufen).length;
}
