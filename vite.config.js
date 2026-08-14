import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";

/* Vendor-Bündel getrennt halten: React ändert sich selten, die Anwendung
   täglich. Getrennt kann der Browser React über Wochen zwischenspeichern,
   während neue Fassungen der Anwendung nachgeladen werden. */
export default defineConfig({
  plugins: [react(), netlify()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
