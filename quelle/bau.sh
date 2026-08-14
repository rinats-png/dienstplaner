#!/bin/bash
# Ein Befehl für alles: zusammenfügen, übersetzen, Testumgebung erneuern
cd /home/claude/v3
cat a0.jsx a1.jsx a1b.jsx a2.jsx a2b.jsx a2c.jsx a2d.jsx a2e.jsx c1.jsx e2.jsx e4.jsx a3.jsx d2.jsx \
    c2.jsx a9.jsx d3.jsx d4.jsx d5.jsx e1.jsx a4.jsx a5.jsx a6.jsx a6b.jsx a6c.jsx a6d.jsx \
    a8.jsx b1.jsx c3.jsx e3.jsx e5.jsx e6.jsx d1.jsx a7.jsx > CENTRIC.jsx
npx --yes esbuild CENTRIC.jsx --outfile=/tmp/c.js --format=esm --jsx=automatic 2>&1 | tail -2
cp CENTRIC.jsx rt/app.jsx
cd rt
for t in nav2:n2 mob:mb; do
  src=${t%%:*}; out=${t##*:}
  npx --yes esbuild $src.jsx --bundle --outfile=$out.mjs --format=esm --jsx=automatic \
    --platform=node --packages=external >/dev/null 2>&1
done
