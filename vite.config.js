import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Vendor-Bündel getrennt halten: React ändert sich selten, die Anwendung
   täglich. Getrennt kann der Browser React über Wochen zwischenspeichern,
   während neue Fassungen der Anwendung nachgeladen werden. */
/* Die strenge Content-Security-Policy aus server.mjs gilt dem gebauten
   Ergebnis — dort gibt es kein einziges Inline-Skript, geprüft im Build.

   Im Entwicklungsbetrieb schiebt Vite ein Inline-Skript für das schnelle
   Neuladen ein. Ohne diese Ausnahme bliebe die Seite lokal weiß, und die
   Prüfungen liefen ins Leere. Die Lockerung greift nur hier: `vite build`
   sieht sie nie. */
const cspNurFuerEntwicklung = {
  name: "csp-entwicklung",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        + "font-src 'self'; connect-src 'self' ws: wss:");
      next();
    });
  },
};

/* Im Entwicklungsbetrieb liefert Vite nur die Oberfläche. Alles, was der
   Server beantwortet, geht an einen parallel laufenden `node server.mjs`
   (Vorgabe Port 3000, siehe ENTWICKLUNG.md). Die Liste entspricht den
   Pfaden, die die Funktionen in `export const config = { path }` nennen,
   plus /gesund aus server.mjs. `vite build` sieht sie nie. */
const SERVER = process.env.CENTRIC_ENTWICKLUNG_SERVER || "http://localhost:3000";
const proxy = Object.fromEntries(
  ["/api", "/lage", "/starten", "/kalender", "/zustellung", "/einrichten", "/gesund"]
    .map((pfad) => [pfad, { target: SERVER, changeOrigin: false }]));

export default defineConfig({
  plugins: [react(), cspNurFuerEntwicklung],
  server: { proxy },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
        /* Sprechende Namen statt Hashsalat in den Netzwerkwerkzeugen —
           hilft, wenn jemand meldet „es lädt ewig". */
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
