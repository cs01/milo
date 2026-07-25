// The Milo mascot as a char grid — the single source for every rendering of it
// (docs/site/scripts/gen-logo.ts → logo.svg, scripts/gen-vscode-icon.ts → the
// extension's icon.png). Edit here; re-run both generators after.
//
// Legend / palette — each char maps to a color; space or '.' = transparent.
// Add a new color by putting a char in PALETTE; use it in PIXELS.
export const PALETTE: Record<string, string> = {
  d: "#603c26", // dark brown (ear / outline)
  b: "#91603a", // brown shadow
  t: "#c89868", // tan
  l: "#e2c096", // light tan
  w: "#f0e2ce", // cream muzzle
  W: "#fffaf5", // white highlight
  k: "#221c18", // eye / nose
  g: "#ffffff", // eye glint
  p: "#e296a2", // pink inner ear
};

// The sprite. Every row must be the same length. Edit freely.
export const PIXELS = [
  "  dd          dd  ",
  " dddd        dddd ",
  " dpdd        ddpd ",
  " ddpdb      bdpdd ",
  "  ddbtttttttttbdd ",
  "   btttttttttttb  ",
  "  bttlllllllllttb ",
  " bttllllllllllllb ",
  " btllkkllllkkllltb",
  " btllkgllllkglltb ",
  " bttllllllllllttb ",
  " bbttttwwwwttttbb ",
  "  bttwwwwwwwwttb  ",
  "  bttwwwkkwwwttb  ",
  "   bttwwkkwwttb   ",
  "   bbttwppwttbb   ",
  "    bttwwwwttb    ",
  "     bbtttbb      ",
];
