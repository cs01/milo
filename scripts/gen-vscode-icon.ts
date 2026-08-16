// Renders the mascot to editors/vscode/icon.png.
//
// The VS Code Marketplace and
// Open VSX both reject SVG icons, so the pixel grid is rasterized here rather
// than converted from logo.svg (no rasterizer dependency, and nearest-neighbor
// scaling keeps the pixel art crisp instead of blurring it).
//   bun scripts/gen-vscode-icon.ts
import { deflateSync } from "zlib";
import { PALETTE, PIXELS } from "./mascot";

const SIZE = 256;          // marketplace wants >=128; 256 is the recommended size
const BG = "#221c18";      // the sprite's own dark; transparent reads badly on the
                           // marketplace's light card and VS Code's dark sidebar alike

const gridW = Math.max(...PIXELS.map(r => r.length));
const gridH = PIXELS.length;
const scale = Math.floor((SIZE * 0.85) / Math.max(gridW, gridH));
const offX = Math.floor((SIZE - gridW * scale) / 2);
const offY = Math.floor((SIZE - gridH * scale) / 2);

function rgba(hex: string): [number, number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}

const px = Buffer.alloc(SIZE * SIZE * 4);
const bg = rgba(BG);
for (let i = 0; i < SIZE * SIZE; i++) px.set(bg, i * 4);

for (let y = 0; y < gridH; y++) {
  const row = PIXELS[y];
  for (let x = 0; x < row.length; x++) {
    const color = PALETTE[row[x]];
    if (!color) continue; // transparent cell → background shows through
    const c = rgba(color);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const py = offY + y * scale + dy;
        const pxx = offX + x * scale + dx;
        if (py < 0 || py >= SIZE || pxx < 0 || pxx >= SIZE) continue;
        px.set(c, (py * SIZE + pxx) * 4);
      }
    }
  }
}

// ── minimal PNG writer (8-bit RGBA, filter type 0) ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
// 10..12 = compression/filter/interlace, all 0

// Each scanline is prefixed with its filter byte; 0 (None) compresses fine for
// flat pixel art and keeps this encoder trivial.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = new URL("../editors/vscode/icon.png", import.meta.url);
await Bun.write(out, png);
console.log(`wrote editors/vscode/icon.png — ${SIZE}×${SIZE}, ${png.length} bytes (scale ${scale}px/cell)`);
