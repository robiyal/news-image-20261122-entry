// news-image-20261122: the entry is the picture beside this file.
// The program proves the picture is a whole PNG or JPEG of at most
// 1 MiB and at most 1024 by 1024 pixels, then copies it byte for
// byte to /output/entry.png. The judge sees exactly those bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The picture lives in entry.png (1024 by 1024 JPEG, rendered from
// assets/source-rev2.webp, the approved rev2 image). This program
// never edits a pixel; it only checks the file and copies it, so
// two runs always write identical bytes.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 1024;
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SOURCE = new URL('./entry.png', import.meta.url);

function reject(reason) {
  throw new Error(`entry.png rejected: ${reason}`);
}

function pngSize(bytes) {
  // PNG signature, then the IHDR chunk: width and height, 4 bytes
  // each, big-endian, right after the 8-byte chunk header.
  if (bytes.length < 24) reject('PNG too short for an IHDR chunk');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  // A JPEG starts FF D8. Each segment is FF <marker> <2-byte length>,
  // except the standalone markers, which carry no length. The frame
  // header (SOF0 or SOF2) holds height then width, 2 bytes each,
  // after one byte of precision.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) reject('not a JPEG (missing FF D8)');
  let at = 2;
  while (at + 9 <= bytes.length) {
    if (bytes[at] !== 0xff) reject('bad marker prefix in JPEG');
    const marker = bytes[at + 1];
    if (marker === 0xd9) reject('end of image with no frame header');
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  reject('no frame header found in JPEG');
}

function imageSize(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return pngSize(bytes);
  }
  return jpegSize(bytes);
}

const bytes = readFileSync(SOURCE);
if (bytes.length > MAX_BYTES) reject(`${bytes.length} bytes exceeds the ${MAX_BYTES} byte limit`);
const { width, height } = imageSize(bytes);
if (width > MAX_SIDE || height > MAX_SIDE) reject(`${width}x${height} exceeds ${MAX_SIDE}x${MAX_SIDE}`);
mkdirSync(OUT_DIR, { recursive: true });
const target = join(OUT_DIR, 'entry.png');
copyFileSync(SOURCE, target);
const digest = createHash('sha256').update(bytes).digest('hex');
// Read the copy back: the grader must judge exactly the bytes this
// program checked, so a copy that differs is a failure, not a warning.
const copied = readFileSync(target);
const copiedDigest = createHash('sha256').update(copied).digest('hex');
if (copiedDigest !== digest) reject(`copied entry.png sha256 ${copiedDigest} differs from source ${digest}`);
console.log(`entry.png ${width}x${height} ${bytes.length} bytes sha256 ${digest} -> ${target}`);
