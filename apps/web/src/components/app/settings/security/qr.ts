/**
 * Minimal QR code encoder (ISO/IEC 18004) for the two-factor enrolment: byte mode, versions 1–10,
 * error-correction levels L/M/Q/H, Reed-Solomon over GF(2^8), the eight mask patterns with the
 * standard penalty rules, format and version information. No dependency — the otpauth URI of an
 * enrolment (about 130 bytes) fits version 7-M with room to spare, and the encoder refuses anything
 * larger instead of guessing (the manual key is always shown next to the image).
 *
 * The result is a square boolean matrix (`true` = dark module) without the quiet zone; `toSvgPath`
 * renders it as one SVG path so the image scales without blur.
 */
export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  version: number;
  size: number;
  level: ErrorCorrectionLevel;
  mask: number;
  /** `modules[row][column]`, `true` for a dark module */
  modules: boolean[][];
}

export const MAX_VERSION = 10;

/** Format-information bits of each level (ISO 18004 table 12). */
const LEVEL_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Error-correction codewords per block and number of blocks, index = version (ISO 18004 table 9, versions 1–10). */
const ECC_PER_BLOCK: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

/** Number of modules available for data and error-correction codewords (everything but the function patterns). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Total codewords (data + error correction) of a version. */
export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

/** Data codewords of a version at a level. */
export function dataCodewords(version: number, level: ErrorCorrectionLevel): number {
  return totalCodewords(version) - ECC_PER_BLOCK[level][version]! * BLOCKS[level][version]!;
}

/** Bytes of payload a version holds in byte mode at a level (mode indicator and length field included). */
export function byteCapacity(version: number, level: ErrorCorrectionLevel): number {
  const lengthBits = version >= 10 ? 16 : 8;
  return Math.floor((dataCodewords(version, level) * 8 - 4 - lengthBits) / 8);
}

/** Centre coordinates of the alignment patterns (empty for version 1). */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let i = numAlign - 1, pos = size - 7; i >= 1; i--, pos -= step) result[i] = pos;
  return result;
}

/* ------------------------------------------------------------------ Reed-Solomon (GF(2^8), 0x11D) */

export function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Coefficients of the generator polynomial (x - α^0)(x - α^1)…(x - α^(degree-1)), highest power first, leading 1 omitted. */
export function rsGenerator(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      const next = j + 1 < degree ? result[j + 1]! : 0;
      result[j] = gfMultiply(result[j]!, root) ^ next;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Error-correction codewords of one block. */
export function rsRemainder(data: readonly number[], generator: readonly number[]): number[] {
  const result = new Array<number>(generator.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < generator.length; i++) result[i] = result[i]! ^ gfMultiply(generator[i]!, factor);
  }
  return result;
}

/* ------------------------------------------------------------------ bit stream and codewords */

class BitBuffer {
  readonly bits: number[] = [];
  append(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** Data codewords of a byte-mode segment: mode, length, payload, terminator, padding. */
export function buildDataCodewords(payload: Uint8Array, version: number, level: ErrorCorrectionLevel): number[] {
  const capacityBits = dataCodewords(version, level) * 8;
  const buffer = new BitBuffer();
  buffer.append(0b0100, 4);
  buffer.append(payload.length, version >= 10 ? 16 : 8);
  for (const byte of payload) buffer.append(byte, 8);
  if (buffer.bits.length > capacityBits) throw new RangeError("payload exceeds the capacity of the version");
  buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);
  for (let pad = 0xec; buffer.bits.length < capacityBits; pad ^= 0xec ^ 0x11) buffer.append(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buffer.bits[i + j]!;
    out.push(byte);
  }
  return out;
}

/** Splits the data codewords into blocks, appends the error correction and interleaves both (ISO 18004 §7.6). */
export function interleave(data: readonly number[], version: number, level: ErrorCorrectionLevel): number[] {
  const numBlocks = BLOCKS[level][version]!;
  const eccLength = ECC_PER_BLOCK[level][version]!;
  const raw = totalCodewords(version);
  const numShortBlocks = numBlocks - (raw % numBlocks);
  const shortBlockLength = Math.floor(raw / numBlocks);
  const generator = rsGenerator(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLength = shortBlockLength - eccLength + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + dataLength);
    k += dataLength;
    const block = [...dat];
    if (i < numShortBlocks) block.push(-1); // placeholder so every block has the same length
    blocks.push([...block, ...rsRemainder(dat, generator)]);
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    for (const block of blocks) {
      const value = block[i]!;
      if (value >= 0) result.push(value);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ matrix */

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];
  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  setFunction(row: number, col: number, dark: boolean): void {
    this.modules[row]![col] = dark;
    this.isFunction[row]![col] = true;
  }
}

function drawFinder(m: Matrix, row: number, col: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const r = row + dy;
      const c = col + dx;
      if (r < 0 || c < 0 || r >= m.size || c >= m.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      m.setFunction(r, c, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(m: Matrix, row: number, col: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) m.setFunction(row + dy, col + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
}

/** Format information: level and mask, BCH(15,5) protected and XOR-masked (ISO 18004 §7.9). */
export function formatBits(level: ErrorCorrectionLevel, mask: number): number {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Version information for versions ≥ 7: BCH(18,6) (ISO 18004 §7.10). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function drawFormat(m: Matrix, level: ErrorCorrectionLevel, mask: number): void {
  const bits = formatBits(level, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const size = m.size;
  // first copy around the top-left finder: (row, column)
  for (let i = 0; i <= 5; i++) m.setFunction(i, 8, bit(i));
  m.setFunction(7, 8, bit(6));
  m.setFunction(8, 8, bit(7));
  m.setFunction(8, 7, bit(8));
  for (let i = 9; i < 15; i++) m.setFunction(8, 14 - i, bit(i));
  // second copy next to the other two finders
  for (let i = 0; i < 8; i++) m.setFunction(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) m.setFunction(size - 15 + i, 8, bit(i));
  m.setFunction(size - 8, 8, true); // the dark module
}

function drawFunctionPatterns(m: Matrix, version: number, level: ErrorCorrectionLevel): void {
  const size = m.size;
  for (let i = 0; i < size; i++) {
    m.setFunction(6, i, i % 2 === 0);
    m.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(m, 3, 3);
  drawFinder(m, 3, size - 4);
  drawFinder(m, size - 4, 3);
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((row, i) => {
    positions.forEach((col, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      drawAlignment(m, row, col);
    });
  });
  drawFormat(m, level, 0); // placeholder so the modules count as function modules; overwritten after masking
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m.setFunction(b, a, dark);
      m.setFunction(a, b, dark);
    }
  }
}

/** Places the codeword bits in the zig-zag order of ISO 18004 §7.7.3 (columns from the right, skipping column 6). */
function drawCodewords(m: Matrix, codewords: readonly number[]): void {
  const size = m.size;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!m.isFunction[row]![col] && i < total) {
          m.modules[row]![col] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

export function maskBit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      throw new RangeError(`invalid mask ${mask}`);
  }
}

function applyMask(m: Matrix, mask: number): void {
  for (let row = 0; row < m.size; row++) {
    for (let col = 0; col < m.size; col++) {
      if (!m.isFunction[row]![col] && maskBit(mask, row, col)) m.modules[row]![col] = !m.modules[row]![col];
    }
  }
}

/** Penalty score of the four mask-evaluation rules (ISO 18004 §7.8.3.1). */
export function penalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;
  const at = (row: number, col: number) => modules[row]![col]!;
  // rules 1 and 3, rows and columns
  for (let axis = 0; axis < 2; axis++) {
    const get = axis === 0 ? at : (row: number, col: number) => at(col, row);
    for (let a = 0; a < size; a++) {
      let run = 0;
      let last: boolean | null = null;
      for (let b = 0; b < size; b++) {
        const dark = get(a, b);
        if (dark === last) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
          last = dark;
        }
        // finder-like pattern 1011101 with four light modules on either side
        if (b >= 10) {
          const w = [b - 10, b - 9, b - 8, b - 7, b - 6, b - 5, b - 4, b - 3, b - 2, b - 1, b].map((i) => get(a, i));
          const core = (o: number) => w[o] && !w[o + 1] && w[o + 2] && w[o + 3] && w[o + 4] && !w[o + 5] && w[o + 6];
          const lightBefore = !w[0] && !w[1] && !w[2] && !w[3];
          const lightAfter = !w[7] && !w[8] && !w[9] && !w[10];
          if ((lightBefore && core(4)) || (lightAfter && core(0))) score += 40;
        }
      }
    }
  }
  // rule 2: 2×2 blocks of one colour
  for (let row = 0; row + 1 < size; row++) {
    for (let col = 0; col + 1 < size; col++) {
      const d = at(row, col);
      if (d === at(row, col + 1) && d === at(row + 1, col) && d === at(row + 1, col + 1)) score += 3;
    }
  }
  // rule 4: proportion of dark modules
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Which modules of a version are function patterns (finders, timing, alignment, format and version areas). */
export function functionModules(version: number, level: ErrorCorrectionLevel = "M"): boolean[][] {
  const m = new Matrix(version * 4 + 17);
  drawFunctionPatterns(m, version, level);
  return m.isFunction;
}

/* ------------------------------------------------------------------ public API */

/** Smallest version (1–10) whose byte capacity at `level` holds `length` bytes, or null. */
export function versionFor(length: number, level: ErrorCorrectionLevel): number | null {
  for (let version = 1; version <= MAX_VERSION; version++) if (byteCapacity(version, level) >= length) return version;
  return null;
}

/**
 * Encodes UTF-8 text in byte mode at the requested level (M by default), choosing the smallest version
 * that fits and the mask with the lowest penalty. Returns null when the text needs more than version 10.
 */
export function encodeQr(text: string, level: ErrorCorrectionLevel = "M"): QrMatrix | null {
  const payload = new TextEncoder().encode(text);
  const version = versionFor(payload.length, level);
  if (version === null) return null;
  const size = version * 4 + 17;
  const codewords = interleave(buildDataCodewords(payload, version, level), version, level);
  let best: { mask: number; score: number; modules: boolean[][] } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = new Matrix(size);
    drawFunctionPatterns(m, version, level);
    drawCodewords(m, codewords);
    applyMask(m, mask);
    drawFormat(m, level, mask);
    const score = penalty(m.modules);
    if (!best || score < best.score) best = { mask, score, modules: m.modules };
  }
  return { version, size, level, mask: best!.mask, modules: best!.modules };
}

/** One SVG path (`M x y h1 v1 h-1 z` per dark module) in module units, offset by the quiet zone. */
export function toSvgPath(matrix: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    });
  });
  return parts.join("");
}
