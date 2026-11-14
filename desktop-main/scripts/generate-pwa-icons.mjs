// Génère les icônes PWA d'Iris dans public/icons (PNG RGBA, zéro dépendance).
// Usage : node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const BG = [7, 7, 11];
const VIOLET = [124, 77, 255];
const BLUE = [61, 123, 255];
const CYAN = [34, 211, 238];

/** Iris procédural : anneau iridescent, fibres radiales, pupille, reflet. */
function renderIcon(size, radiusRatio) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size * radiusRatio;
  const samples = 3;
  const total = samples * samples;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const dx = px - center;
          const dy = py - center;
          const distance = Math.hypot(dx, dy) / radius;

          let col;
          if (distance <= 1) {
            const angle = Math.atan2(dy, dx);
            const hue = 0.5 + 0.5 * Math.sin(angle + 0.6);

            const inner = [
              mix(VIOLET[0], BLUE[0], hue),
              mix(VIOLET[1], BLUE[1], hue),
              mix(VIOLET[2], BLUE[2], hue),
            ];
            const outer = [
              mix(BLUE[0], CYAN[0], hue),
              mix(BLUE[1], CYAN[1], hue),
              mix(BLUE[2], CYAN[2], hue),
            ];

            const radial = smooth(0.16, 0.66, distance);
            let rr = mix(inner[0], outer[0], radial);
            let gg = mix(inner[1], outer[1], radial);
            let bb = mix(inner[2], outer[2], radial);

            // fibres radiales + anneaux concentriques
            const fibers =
              0.84 + 0.16 * (0.5 + 0.5 * Math.sin(angle * 46 + distance * 24));
            const bands = 0.92 + 0.08 * Math.cos(distance * Math.PI * 9);
            const shading = fibers * bands * (0.5 + 0.8 * Math.sqrt(distance));
            rr *= shading;
            gg *= shading;
            bb *= shading;

            // pupille
            const pupil = 1 - smooth(0.2, 0.31, distance);
            rr = mix(rr, 3, pupil);
            gg = mix(gg, 3, pupil);
            bb = mix(bb, 6, pupil);

            // anneau limbique
            const limbal = smooth(0.84, 0.96, distance) * 0.8;
            rr = mix(rr, 6, limbal);
            gg = mix(gg, 6, limbal);
            bb = mix(bb, 12, limbal);

            // reflet spéculaire
            const hx = center - radius * 0.34;
            const hy = center - radius * 0.38;
            const highlight = Math.hypot(px - hx, py - hy) / (radius * 0.42);
            if (highlight < 1) {
              const strength = (1 - highlight) ** 2 * 0.5;
              rr += 235 * strength;
              gg += 240 * strength;
              bb += 255 * strength;
            }

            // bord anti-aliasé
            const edge = 1 - smooth(0.985, 1, distance);
            col = [
              mix(BG[0], rr, edge),
              mix(BG[1], gg, edge),
              mix(BG[2], bb, edge),
            ];
          } else {
            const glow = Math.exp(-(distance - 1) * 5.5) * 0.4;
            col = [BG[0] + 46 * glow, BG[1] + 28 * glow, BG[2] + 104 * glow];
          }

          r += col[0];
          g += col[1];
          b += col[2];
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(clamp01(r / total / 255) * 255);
      pixels[offset + 1] = Math.round(clamp01(g / total / 255) * 255);
      pixels[offset + 2] = Math.round(clamp01(b / total / 255) * 255);
      pixels[offset + 3] = 255;
    }
  }

  return encodePng(size, pixels);
}

const targets = [
  { file: "icon-192.png", size: 192, radius: 0.46 },
  { file: "icon-512.png", size: 512, radius: 0.46 },
  // zone sûre maskable : l'iris tient dans 80 % du carré
  { file: "icon-maskable-512.png", size: 512, radius: 0.36 },
  { file: "apple-touch-icon.png", size: 180, radius: 0.44 },
];

mkdirSync(outDir, { recursive: true });
for (const target of targets) {
  const filePath = join(outDir, target.file);
  writeFileSync(filePath, renderIcon(target.size, target.radius));
  console.log(`wrote ${filePath} (${target.size}x${target.size})`);
}
