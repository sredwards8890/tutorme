// Generates the PWA icons without any image library: a blue tile with a white board and
// two blue pen strokes, written as PNG via zlib. Run once: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BLUE = [37, 99, 235], WHITE = [255, 255, 255], INK = [29, 78, 216];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
// u,v in 0..1. Board: rounded white rect from 0.16..0.84; strokes: two slanted bars.
function pixel(u, v) {
  const inBoard = u > 0.16 && u < 0.84 && v > 0.22 && v < 0.78;
  if (!inBoard) return BLUE;
  const s1 = Math.abs((v - 0.42) - 0.18 * (u - 0.5)) < 0.035 && u > 0.26 && u < 0.74;
  const s2 = Math.abs((v - 0.60) + 0.10 * (u - 0.5)) < 0.035 && u > 0.26 && u < 0.62;
  return s1 || s2 ? INK : WHITE;
}

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), png(size, pixel));
  console.log(`icon-${size}.png`);
}
