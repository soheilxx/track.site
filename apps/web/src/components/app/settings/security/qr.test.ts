import { describe, expect, it } from "vitest";
import {
  alignmentPositions,
  buildDataCodewords,
  byteCapacity,
  encodeQr,
  formatBits,
  functionModules,
  interleave,
  maskBit,
  rawDataModules,
  rsGenerator,
  rsRemainder,
  toSvgPath,
  totalCodewords,
  versionBits,
  versionFor,
  type ErrorCorrectionLevel,
  type QrMatrix,
} from "./qr";

/**
 * Independent read-back of a symbol: walks the zig-zag placement, removes the mask, de-interleaves the
 * blocks and returns the data codewords — so a placement or interleaving slip shows up as a mismatch
 * against `buildDataCodewords`, not as a silently unreadable image.
 */
function readDataCodewords(matrix: QrMatrix): number[] {
  const { size, version, level, mask, modules } = matrix;
  const isFunction = functionModules(version, level);
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (isFunction[row]![col]) continue;
        const dark = modules[row]![col]! !== maskBit(mask, row, col);
        bits.push(dark ? 1 : 0);
      }
    }
  }
  const total = totalCodewords(version);
  const codewords: number[] = [];
  for (let i = 0; i < total; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j]!;
    codewords.push(byte);
  }
  // de-interleave: the data section holds the data codewords of every block, short blocks first
  const dataLength = codewords.length - eccCount(version, level);
  const blocks = BLOCKS[level][version]!;
  const shortLength = Math.floor(dataLength / blocks);
  const longBlocks = dataLength % blocks;
  const perBlock: number[][] = Array.from({ length: blocks }, () => []);
  let k = 0;
  for (let i = 0; i < shortLength + 1; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i === shortLength && b < blocks - longBlocks) continue;
      perBlock[b]!.push(codewords[k++]!);
    }
  }
  return perBlock.flat();
}

const BLOCKS: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
const ECC: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const eccCount = (version: number, level: ErrorCorrectionLevel) => ECC[level][version]! * BLOCKS[level][version]!;

const OTPAUTH = "otpauth://totp/Track%3Aowner%40acme.test?secret=KRQWG23FONUWIZLDN5XGK43BNVYGYZLTMVRXEZLUMFWHK5DIMV3GKY3P&issuer=Track&digits=6&period=30";

describe("QR encoder", () => {
  it("knows the module and codeword counts of versions 1–10", () => {
    expect(rawDataModules(1)).toBe(208);
    expect(totalCodewords(1)).toBe(26);
    expect(totalCodewords(2)).toBe(44);
    expect(totalCodewords(7)).toBe(196);
    expect(totalCodewords(10)).toBe(346);
    // byte-mode capacities of ISO 18004 table 7
    expect(byteCapacity(1, "L")).toBe(17);
    expect(byteCapacity(1, "M")).toBe(14);
    expect(byteCapacity(1, "Q")).toBe(11);
    expect(byteCapacity(1, "H")).toBe(7);
    expect(byteCapacity(7, "M")).toBe(122);
    expect(byteCapacity(10, "L")).toBe(271);
    expect(byteCapacity(10, "M")).toBe(213);
    expect(byteCapacity(10, "Q")).toBe(151);
    expect(byteCapacity(10, "H")).toBe(119);
  });

  it("derives the raw module count from the drawn function patterns", () => {
    for (let version = 1; version <= 10; version++) {
      const isFunction = functionModules(version);
      const free = isFunction.flat().filter((f) => !f).length;
      expect(free, `version ${version}`).toBe(rawDataModules(version));
    }
  });

  it("places the alignment patterns of ISO 18004 annex E", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(6)).toEqual([6, 34]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  it("computes the Reed-Solomon codewords of the ISO worked example (1-M, HELLO WORLD)", () => {
    const data = [0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, rsGenerator(10))).toEqual([0xc4, 0x23, 0x27, 0x77, 0xeb, 0xd7, 0xe7, 0xe2, 0x5d, 0x17]);
  });

  it("encodes the format and version information with their BCH codes", () => {
    expect(formatBits("M", 0)).toBe(0x5412);
    expect(formatBits("L", 0)).toBe(0x77c4);
    expect(formatBits("Q", 0)).toBe(0x355f);
    expect(formatBits("H", 0)).toBe(0x1689);
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(8)).toBe(0x085bc);
  });

  it("pads the data codewords with the terminator and the alternating pad bytes", () => {
    const codewords = buildDataCodewords(new TextEncoder().encode("Hi"), 1, "M");
    expect(codewords).toHaveLength(16);
    // 0100 (byte mode) 00000010 (length 2) 'H' 'i' 0000 (terminator) → 0x40 0x24 0x86 0x90 then pad bytes
    expect(codewords.slice(0, 4)).toEqual([0x40, 0x24, 0x86, 0x90]);
    expect(codewords.slice(4)).toEqual([0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
    expect(() => buildDataCodewords(new Uint8Array(15), 1, "M")).toThrow(RangeError);
  });

  it("interleaves multi-block versions to the total codeword count", () => {
    for (const [version, level] of [[5, "Q"], [7, "H"], [8, "M"], [9, "L"], [10, "M"]] as const) {
      const data = buildDataCodewords(new Uint8Array(byteCapacity(version, level)).map((_, i) => i & 0xff), version, level);
      expect(interleave(data, version, level), `${version}-${level}`).toHaveLength(totalCodewords(version));
    }
  });

  it("picks the smallest version that fits and refuses payloads beyond version 10", () => {
    expect(versionFor(14, "M")).toBe(1);
    expect(versionFor(15, "M")).toBe(2);
    expect(versionFor(122, "M")).toBe(7);
    expect(versionFor(123, "M")).toBe(8);
    expect(versionFor(OTPAUTH.length, "M")).toBe(8);
    expect(versionFor(214, "M")).toBeNull();
    expect(encodeQr("x".repeat(300))).toBeNull();
  });

  it("produces a symbol whose data reads back to the input for every level and several sizes", () => {
    const samples = ["Hi", "Hello, World!", OTPAUTH, "ä".repeat(60), "0".repeat(200)];
    for (const level of ["L", "M", "Q", "H"] as const) {
      for (const text of samples) {
        const matrix = encodeQr(text, level);
        if (!matrix) {
          expect(new TextEncoder().encode(text).length, `${text.slice(0, 8)}-${level}`).toBeGreaterThan(byteCapacity(10, level));
          continue;
        }
        expect(matrix.size).toBe(matrix.version * 4 + 17);
        expect(matrix.mask).toBeGreaterThanOrEqual(0);
        expect(matrix.mask).toBeLessThanOrEqual(7);
        const expected = buildDataCodewords(new TextEncoder().encode(text), matrix.version, level);
        expect(readDataCodewords(matrix), `${text.slice(0, 8)}-${level}`).toEqual(expected);
      }
    }
  });

  it("draws the finder patterns, the timing pattern, the dark module and the format information", () => {
    const matrix = encodeQr(OTPAUTH)!;
    const { size, modules } = matrix;
    const finder = (row: number, col: number) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(modules[row + dy]![col + dx], `finder ${row},${col} @ ${dy},${dx}`).toBe(ring !== 2);
        }
      }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6]![i]).toBe(i % 2 === 0);
      expect(modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8]![8]).toBe(true);
    // the first copy of the format information decodes to the chosen level and mask
    const bits = formatBits(matrix.level, matrix.mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) expect(modules[i]![8]).toBe(bit(i));
    expect(modules[7]![8]).toBe(bit(6));
    expect(modules[8]![8]).toBe(bit(7));
    expect(modules[8]![7]).toBe(bit(8));
    for (let i = 9; i < 15; i++) expect(modules[8]![14 - i]).toBe(bit(i));
    // second copy
    for (let i = 0; i < 8; i++) expect(modules[8]![size - 1 - i]).toBe(bit(i));
    for (let i = 8; i < 15; i++) expect(modules[size - 15 + i]![8]).toBe(bit(i));
  });

  it("renders one path command per dark module, offset by the quiet zone", () => {
    const matrix = encodeQr("Hi")!;
    const path = toSvgPath(matrix);
    const dark = matrix.modules.flat().filter(Boolean).length;
    expect(path.match(/M\d+ \d+h1v1h-1z/g)).toHaveLength(dark);
    // top-left finder module lands at the quiet zone offset
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
    expect(toSvgPath(matrix, 0).startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
