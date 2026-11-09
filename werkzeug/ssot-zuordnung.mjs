/* ==========================================================================
   SSOT-ZUORDNUNG — deterministisch, ohne Netz, ohne Opus.

   Ordnet Pakete (WP-I12b, IMP-3, E-21i, SI-P5 …) einem Text (PR-Titel,
   Branchenname) zu. Ein Paket trifft, wenn seine Tokenfolge als
   zusammenhängende Folge im Text vorkommt. Tokens: Kleinbuchstaben,
   getrennt an allem, was kein Buchstabe oder Ziffer ist.

   Beispiele: "WP-I12" ↔ "WP-I12b" trifft NICHT (Token "i12b" ≠ "i12").
   "intelligence/wp-i12-decision" trifft WP-I12, nicht WP-I12b.
   ========================================================================== */

/** Tokens eines Textes. */
export function tokens(text) {
  return String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** true, wenn die Tokenfolge `muster` zusammenhängend in `text` vorkommt. */
export function enthaelt(textTokens, musterTokens) {
  if (musterTokens.length === 0) return false;
  for (let i = 0; i + musterTokens.length <= textTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < musterTokens.length; j++) {
      if (textTokens[i + j] !== musterTokens[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Paket-IDs, deren Tokenfolge in einem der Texte vorkommt. */
export function paketeFuerTexte(ids, texte) {
  const tt = texte.map((t) => tokens(t));
  return ids.filter((id) => {
    const m = tokens(id);
    return tt.some((x) => enthaelt(x, m));
  });
}

/** Ist das Paket laut Status bereits erledigt? */
export const ERLEDIGT = Object.freeze(["INTEGRATED", "VERIFIED", "DONE"]);

/**
 * Betrifft ein gemergter PR das Paket als Gegenstand? Nur dann, wenn die
 * Paket-ID als Tokenfolge im Titel oder am Anfang der letzten Branch-Ebene steht.
 * SSOT-Pflege-PRs ("SSOT: …") zählen nie als Umsetzung eines Pakets.
 */
export function betrifft(id, pr) {
  const titel = String(pr.title ?? "");
  if (/^\s*ssot\b/i.test(titel)) return false;
  const m = tokens(id);
  if (enthaelt(tokens(titel), m)) return true;
  const letzte = String(pr.headRefName ?? "").split("/").pop();
  return enthaelt(tokens(letzte).slice(0, m.length), m);
}

/** Pakete, die ein PR als Gegenstand betrifft. */
export function paketeFuerPr(ids, pr) {
  return ids.filter((id) => betrifft(id, pr));
}

/** Braucht ein erledigtes Paket einen PR-Beleg? Betreiberentscheidungen (E-…) und extern nicht. */
export function brauchtPrBeleg(paket) {
  return !/^E-/.test(paket.id) && paket.strang !== "extern";
}
