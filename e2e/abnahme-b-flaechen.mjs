/* Abnahme V4, Strang B: Namen der axe-Flächen aus e2e/abnahme-b-ablaeufe.spec.mjs. Eigene Datei, damit die Prüfung der
   Ausnahmeliste (e2e/barrierefreiheit.spec.mjs) die Flächen kennt, ohne eine Spec-Datei zu importieren. */
export const ABNAHME_B_FLAECHEN = Object.freeze({
  heute: "abnahme-b-heute-stempeluhr",
  krankBlatt: "abnahme-b-krankmeldung-blatt",
  lagebild: "abnahme-b-lagebild-planer",
  stempelbefunde: "abnahme-b-stempelbefunde-leitung",
});
