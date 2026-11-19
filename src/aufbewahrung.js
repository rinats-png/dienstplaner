/* Die Aufbewahrungsrechnung liegt seit WP-26 unter server/lib/aufbewahrung.mjs:
   Der Server führt den Löschlauf selbst aus (server/lib/datenschutzlauf.mjs),
   und das Serverbild enthält src/ nicht. Die Oberfläche benutzt dieselbe
   Rechnung über diesen Verweis. */
export * from "../server/lib/aufbewahrung.mjs";
