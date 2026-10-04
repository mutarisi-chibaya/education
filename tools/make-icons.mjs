// Generates the PWA icons (PNG + SVG) with no dependencies.
// Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x12, 0x35, 0x5b];
const BARS = [
  { color: [0x4c, 0xc3, 0x8a], h: 0.42 },
  { color: [0x7e, 0xa6, 0xf5], h: 0.64 },
  { color: [0xf2, 0xa9, 0x3b], h: 0.52 },
];

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// content: fraction of the icon the bars may occupy (smaller for maskable safe zone)
function icon(size, { rounded, content }) {
  const s = size;
  const area = s * content;
  const barW = area * 0.2;
  const gap = area * 0.1;
  const total = barW * 3 + gap * 2;
  const left = (s - total) / 2;
  const base = s / 2 + area * 0.34;
  return png(size, (x, y) => {
    if (rounded && !inRoundRect(x, y, 0, 0, s, s, s * 0.22)) return [0, 0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const x0 = left + i * (barW + gap);
      const h = area * BARS[i].h;
      if (inRoundRect(x, y, x0, base - h, x0 + barW, base, barW * 0.3)) return [...BARS[i].color, 255];
    }
    return [...BG, 255];
  });
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', icon(192, { rounded: true, content: 0.8 }));
writeFileSync('icons/icon-512.png', icon(512, { rounded: true, content: 0.8 }));
writeFileSync('icons/maskable-512.png', icon(512, { rounded: false, content: 0.6 }));

const svgBars = BARS.map((b, i) => {
  const x = 22 + i * 20;
  const h = 80 * b.h;
  return `<rect x="${x}" y="${77 - h}" width="16" height="${h}" rx="5" fill="rgb(${b.color.join(',')})"/>`;
}).join('');
writeFileSync('icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="rgb(${BG.join(',')})"/>${svgBars}</svg>\n`);
console.log('Icons written to icons/');
