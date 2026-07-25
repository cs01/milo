// Milo pixel-logo generator. Edit the sprite in scripts/mascot.ts (shared with the
// VS Code extension's icon so both renderings can't drift), then run:
//   bun docs/site/scripts/gen-logo.ts
// Output: docs/site/public/logo.svg (nav logo, hero image, favicon).
import { PALETTE, PIXELS } from "../../../scripts/mascot";

const w = Math.max(...PIXELS.map((r) => r.length));
const h = PIXELS.length;
let rects = "";
for (let y = 0; y < h; y++) {
  const row = PIXELS[y];
  let x = 0;
  while (x < row.length) {
    const c = row[x];
    if (PALETTE[c]) {
      let x2 = x; // merge horizontal runs of one color into a single rect
      while (x2 + 1 < row.length && row[x2 + 1] === c) x2++;
      rects += `<rect x="${x}" y="${y}" width="${x2 - x + 1}" height="1" fill="${PALETTE[c]}"/>`;
      x = x2 + 1;
    } else x++;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
const out = new URL("../public/logo.svg", import.meta.url);
await Bun.write(out, svg);
console.log(`wrote logo.svg — ${w}×${h}, ${svg.length} bytes`);
