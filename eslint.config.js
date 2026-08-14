/* ==========================================================================
   LINTER

   Der Stil ist für eine Datei dieser Größe bemerkenswert einheitlich — das
   ist Handarbeit, die niemand ewig durchhält. Und die Hooks-Regeln hätten
   den Absturz gefunden, bei dem eine Kennung in useState festgehalten und
   nie gegen den aktuellen Bestand geprüft wurde.

   Bewusst schmal gehalten: Was hier steht, soll Fehler finden, nicht über
   Geschmack streiten. Formatierung bleibt Handarbeit.
   ========================================================================== */

import js from "@eslint/js";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", ".netlify/**"] },

  /* --- Oberfläche --- */
  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": hooks },
    settings: { react: { version: "18.3" } },
    rules: {
      ...js.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      /* React 18 mit automatischem JSX braucht kein React im Geltungsbereich */
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      /* Ungenutzte Argumente sind oft Absicht (Signaturen), ungenutzte
         Variablen selten. */
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      /* Leere Auffangblöcke sind hier ein bewusstes Muster — sie tragen
         durchweg einen erklärenden Kommentar. */
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  /* --- Server --- */
  {
    files: ["netlify/**/*.mjs", "pruefungen/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
