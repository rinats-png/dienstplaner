import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";

/* Vendor-Bündel getrennt halten: React ändert sich selten, die Anwendung
   täglich. Getrennt kann der Browser React über Wochen zwischenspeichern,
   während neue Fassungen der Anwendung nachgeladen werden. */
/* Die strenge Content-Security-Policy aus netlify.toml gilt dem gebauten
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

export default defineConfig({
  plugins: [react(), netlify(), cspNurFuerEntwicklung],
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
