// news-image-20261122 — dense revision (layout rev2): copy the rendered
// entry.png byte-for-byte to the output directory. Validates the image
// first (format, dimensions, size cap) so a bad asset fails loudly
// instead of shipping an invalid entry.
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SRC = new URL('./entry.png', import.meta.url);
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const MAX_BYTES = 1048576;
const MAX_DIM = 1024;

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function jpegSize(buf) {
  // Walk JPEG markers to the first SOF0/SOF2 frame and read its dimensions.
  let pos = 2;
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) fail('entry.png: bad JPEG marker');
    const marker = buf[pos + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const len = buf.readUInt16BE(pos + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(pos + 5), width: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + len;
  }
  fail('entry.png: no JPEG SOF frame found');
}

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    fail('entry.png: bad PNG header');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const buf = readFileSync(SRC);
const size = statSync(SRC).size;
if (size > MAX_BYTES) fail(`entry.png is ${size} bytes, over the 1 MiB cap`);

let dims;
if (buf[0] === 0xff && buf[1] === 0xd8) {
  dims = jpegSize(buf);
} else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
  dims = pngSize(buf);
} else {
  fail('entry.png: not a PNG or JPEG (bad magic bytes)');
}
if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
  fail(`entry.png is ${dims.width}x${dims.height}, over the 1024x1024 cap`);
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'entry.png');
copyFileSync(SRC, outPath);

// Read the copy back and confirm it is byte-identical to the source.
const check = readFileSync(outPath);
const digest = (b) => createHash('sha256').update(b).digest('hex');
if (digest(check) !== digest(buf)) fail('entry.png: copy differs from source');
console.log(`wrote ${outPath}: ${size} bytes, ${dims.width}x${dims.height}, ${buf[0] === 0xff ? 'JPEG' : 'PNG'}, sha256 ${digest(buf)}`);
