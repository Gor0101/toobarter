'use strict';
/* Рисует иконки приложения без внешних библиотек: node tools/icons.js
   Знак — те же две встречные стрелки ⇄, что и в шапке сайта. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const INK = [14, 20, 32];      // фон
const WHITE = [255, 255, 255]; // верхняя стрелка
const BRAND = [92, 133, 255];  // нижняя стрелка

/* ---------- простейший растровый холст RGBA ---------- */
function canvas(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255, ia = 1 - na;
    px[i] = px[i] * ia + r * na;
    px[i + 1] = px[i + 1] * ia + g * na;
    px[i + 2] = px[i + 2] * ia + b * na;
    px[i + 3] = Math.max(px[i + 3], a);
  };
  return { size, px, put };
}

function roundedRect(c, x0, y0, w, h, r, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + r - x, 0, x - (x0 + w - r - 1));
      const dy = Math.max(y0 + r - y, 0, y - (y0 + h - r - 1));
      if (dx * dx + dy * dy <= r * r) c.put(x, y, color);
    }
  }
}

function bar(c, x0, x1, y, thickness, color) {
  for (let y2 = Math.round(y - thickness / 2); y2 < Math.round(y + thickness / 2); y2++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) c.put(x, y2, color);
  }
}

/* Треугольная головка стрелки. dir: 1 — вправо, -1 — влево */
function head(c, tipX, y, len, half, dir, color) {
  const yc = Math.round(y);
  const L = Math.round(len);
  for (let i = 0; i < L; i++) {
    const x = Math.round(tipX) - dir * i;
    const h = Math.round((half * i) / L);
    for (let y2 = yc - h; y2 <= yc + h; y2++) c.put(x, y2, color);
  }
}

/* Уменьшение с усреднением — даёт сглаженные края */
function downscale(c, factor) {
  const size = c.size / factor;
  const out = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * c.size + x * factor + dx) * 4;
          r += c.px[i]; g += c.px[i + 1]; b += c.px[i + 2]; a += c.px[i + 3];
        }
      }
      const n = factor * factor;
      const i = (y * size + x) * 4;
      out.px[i] = r / n; out.px[i + 1] = g / n; out.px[i + 2] = b / n; out.px[i + 3] = a / n;
    }
  }
  return out;
}

/* ---------- запись PNG (RGBA, без фильтров) ---------- */
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function writePng(file, c) {
  const { size, px } = c;
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]), Buffer.from(px.buffer, y * size * 4, size * 4));
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  return file;
}

/* ---------- сама иконка ---------- */
/* scale — доля холста, которую занимает знак; radius — скругление фона */
function drawIcon(size, { scale = 0.62, radius = 0.22, bleed = false } = {}) {
  const F = 4;                    // рисуем крупнее и уменьшаем — ради сглаживания
  const S = size * F;
  const c = canvas(S);

  if (bleed) roundedRect(c, 0, 0, S, S, 0, INK);
  else roundedRect(c, 0, 0, S, S, Math.round(S * radius), INK);

  const w = S * scale;            // ширина знака
  const cx = S / 2, cy = S / 2;
  const gap = w * 0.26;           // расстояние между стрелками
  const th = w * 0.13;            // толщина линии
  const headLen = w * 0.22;
  const half = w * 0.19;

  // верхняя стрелка — вправо
  bar(c, cx - w / 2, cx + w / 2 - headLen * 0.55, cy - gap / 2, th, WHITE);
  head(c, cx + w / 2, cy - gap / 2, headLen, half, 1, WHITE);

  // нижняя стрелка — влево
  bar(c, cx - w / 2 + headLen * 0.55, cx + w / 2, cy + gap / 2, th, BRAND);
  head(c, cx - w / 2, cy + gap / 2, headLen, half, -1, BRAND);

  return downscale(c, F);
}

const made = [
  writePng('icon-192.png', drawIcon(192)),
  writePng('icon-512.png', drawIcon(512)),
  // maskable: система обрежет края, поэтому знак меньше и фон во всю площадь
  writePng('maskable-512.png', drawIcon(512, { scale: 0.44, bleed: true })),
  // iOS сам скругляет углы, прозрачность там выглядит плохо
  writePng('apple-touch-icon.png', drawIcon(180, { scale: 0.58, bleed: true })),
];
console.log('Иконки готовы:', made.join(', '));
