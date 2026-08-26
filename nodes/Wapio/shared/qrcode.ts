/*
 * Vendored and adapted QR Code generator library for rendering Pairing QR codes to PNG binary in n8n.
 * Copyright (c) Project Nayuki (MIT License)
 */

type Bit = number;
type Byte = number;
type Int = number;

const QR_MARGIN = 4;
const QR_SCALE = 8;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = createCrc32Table();

export function renderQrCodeBuffer(qrCode: string): Buffer {
  const qr = QrCode.encodeText(qrCode, QrCodeEcc.MEDIUM);
  const png = toPngBytes(qr, QR_MARGIN, QR_SCALE);

  return Buffer.from(png.buffer, png.byteOffset, png.byteLength);
}

function toPngBytes(qr: QrCode, border: number, scale: number): Uint8Array {
  if (border < 0) {
    throw new RangeError('Border must be non-negative');
  }

  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError('Scale must be a positive integer');
  }

  const dimension = (qr.size + border * 2) * scale;
  const imageData = new Uint8Array((dimension * 4 + 1) * dimension);
  let offset = 0;

  for (let y = 0; y < dimension; y++) {
    imageData[offset++] = 0;
    const moduleY = Math.floor(y / scale) - border;

    for (let x = 0; x < dimension; x++) {
      const moduleX = Math.floor(x / scale) - border;
      const isDarkModule =
        moduleX >= 0 && moduleX < qr.size && moduleY >= 0 && moduleY < qr.size
          ? qr.getModule(moduleX, moduleY)
          : false;
      const color = isDarkModule ? 0 : 255;

      imageData[offset++] = color;
      imageData[offset++] = color;
      imageData[offset++] = color;
      imageData[offset++] = 255;
    }
  }

  const headerChunk = createPngChunk(
    'IHDR',
    concatBytes(
      uint32ToBytes(dimension),
      uint32ToBytes(dimension),
      Uint8Array.from([8, 6, 0, 0, 0]),
    ),
  );

  const dataChunk = createPngChunk('IDAT', compressDeflate(imageData));
  const endChunk = createPngChunk('IEND', new Uint8Array(0));

  return concatBytes(PNG_SIGNATURE, headerChunk, dataChunk, endChunk);
}

function compressDeflate(data: Uint8Array): Uint8Array {
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(data.length / maxBlockSize) || 1;
  const outputLength = 2 + data.length + numBlocks * 5 + 4;
  const output = new Uint8Array(outputLength);
  let outOffset = 0;

  output[outOffset++] = 0x78;
  output[outOffset++] = 0x01;

  for (let blockIndex = 0; blockIndex < numBlocks; blockIndex++) {
    const start = blockIndex * maxBlockSize;
    const end = Math.min(start + maxBlockSize, data.length);
    const blockLength = end - start;
    const isFinalBlock = blockIndex === numBlocks - 1;

    output[outOffset++] = isFinalBlock ? 1 : 0;
    output[outOffset++] = blockLength & 0xff;
    output[outOffset++] = (blockLength >>> 8) & 0xff;
    output[outOffset++] = ~blockLength & 0xff;
    output[outOffset++] = (~blockLength >>> 8) & 0xff;

    output.set(data.subarray(start, end), outOffset);
    outOffset += blockLength;
  }

  const adler = computeAdler32(data);
  output[outOffset++] = (adler >>> 24) & 0xff;
  output[outOffset++] = (adler >>> 16) & 0xff;
  output[outOffset++] = (adler >>> 8) & 0xff;
  output[outOffset++] = adler & 0xff;

  return output;
}

function computeAdler32(data: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;

  for (let index = 0; index < data.length; index++) {
    s1 = (s1 + data[index]) % 65521;
    s2 = (s2 + s1) % 65521;
  }

  return (s2 << 16) | s1;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);

  const lengthBytes = uint32ToBytes(data.length);
  const typeAndData = concatBytes(typeBytes, data);
  const crcBytes = uint32ToBytes(computeCrc32(typeAndData));

  return concatBytes(lengthBytes, typeAndData, crcBytes);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, current) => sum + current.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const current of arrays) {
    result.set(current, offset);
    offset += current.length;
  }

  return result;
}

function uint32ToBytes(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index++) {
    let current = index;

    for (let bit = 0; bit < 8; bit++) {
      current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }

    table[index] = current >>> 0;
  }

  return table;
}

function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index++) {
    const tableIndex = (crc ^ data[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[tableIndex];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

class QrCode {
  public static encodeText(text: string, ecl: QrCodeEcc): QrCode {
    const segments = QrSegment.makeSegments(text);
    return QrCode.encodeSegments(segments, ecl);
  }

  public static encodeSegments(
    segments: Readonly<Array<QrSegment>>,
    ecl: QrCodeEcc,
    minVersion: Int = 1,
    maxVersion: Int = 40,
    mask: Int = -1,
    boostEcl: boolean = true,
  ): QrCode {
    if (!(1 <= minVersion && minVersion <= maxVersion && maxVersion <= 40) || mask < -1 || mask > 7) {
      throw new RangeError('Invalid value');
    }

    let version: Int;
    let dataUsedBits: Int;
    for (version = minVersion; ; version++) {
      const dataCapacityBits: Int = QrCode.getNumDataCodewords(version, ecl) * 8;
      const usedBits: number = QrSegment.getTotalBits(segments, version);
      if (usedBits <= dataCapacityBits) {
        dataUsedBits = usedBits;
        break;
      }
      if (version >= maxVersion) {
        throw new RangeError('Data too long');
      }
    }

    if (boostEcl) {
      for (const newEcl of [QrCodeEcc.MEDIUM, QrCodeEcc.QUARTILE, QrCodeEcc.HIGH]) {
        if (dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8) {
          ecl = newEcl;
        }
      }
    }

    const bb: Array<Bit> = [];
    for (const seg of segments) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      for (const b of seg.getData()) {
        bb.push(b);
      }
    }

    const padLen = QrCode.getNumDataCodewords(version, ecl) * 8 - bb.length;
    appendBits(0, Math.min(padLen, 4), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);

    for (let padByte = 0xec; bb.length < QrCode.getNumDataCodewords(version, ecl) * 8; padByte ^= 0xec ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    const dataCodewords: Array<Byte> = [];
    while (dataCodewords.length * 8 < bb.length) {
      dataCodewords.push(0);
    }
    bb.forEach((b: Bit, i: Int) => (dataCodewords[i >>> 3] |= b << (7 - (i & 7))));

    return new QrCode(version, ecl, dataCodewords, mask);
  }

  public readonly size: Int;
  public readonly mask: Int;
  private readonly modules: Array<Array<boolean>> = [];
  private readonly isFunction: Array<Array<boolean>> = [];

  public constructor(
    public readonly version: Int,
    public readonly errorCorrectionLevel: QrCodeEcc,
    dataCodewords: Readonly<Array<Byte>>,
    mask: Int,
  ) {
    this.size = version * 4 + 17;
    const row: Array<boolean> = [];
    for (let i = 0; i < this.size; i++) row.push(false);
    for (let i = 0; i < this.size; i++) {
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }

    this.drawFunctionPatterns();
    const allCodewords: Array<Byte> = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    if (mask === -1) {
      let minPenalty = 1e9;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          minPenalty = penalty;
          mask = i;
        }
        this.applyMask(i);
      }
    }
    this.mask = mask;
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.isFunction = [];
  }

  public getModule(x: Int, y: Int): boolean {
    return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const alignPatPos: Array<Int> = this.getAlignmentPatternPositions();
    const numAlign: Int = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }

    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFormatBits(mask: Int): void {
    const data: Int = (this.errorCorrectionLevel.formatBits << 3) | mask;
    let rem: Int = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem: Int = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits: Int = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color: boolean = getBit(bits, i);
      const a: Int = this.size - 11 + (i % 3);
      const b: Int = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  private drawFinderPattern(x: Int, y: Int): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist: Int = Math.max(Math.abs(dx), Math.abs(dy));
        const xx: Int = x + dx;
        const yy: Int = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: Int, y: Int): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private setFunctionModule(x: Int, y: Int, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private addEccAndInterleave(data: Readonly<Array<Byte>>): Array<Byte> {
    const ver: Int = this.version;
    const ecl: QrCodeEcc = this.errorCorrectionLevel;
    const numBlocks: Int = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    const blockEccLen: Int = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    const rawCodewords: Int = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
    const numShortBlocks: Int = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen: Int = Math.floor(rawCodewords / numBlocks);

    const blocks: Array<Array<Byte>> = [];
    const rsDiv: Array<Byte> = QrCode.reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat: Array<Byte> = data.slice(k, k + shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0));
      k += dat.length;
      const ecc: Array<Byte> = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
      if (i >= numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result: Array<Byte> = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
      });
    }
    return result;
  }

  private drawCodewords(data: Readonly<Array<Byte>>): void {
    let i: Int = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x: Int = right - j;
          const upward: boolean = ((right + 1) & 2) === 0;
          const y: Int = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: Int): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error('Unreachable');
        }
        if (!this.isFunction[y][x] && invert) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  private getPenaltyScore(): Int {
    let result: Int = 0;
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runVal = 0;
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result++;
        } else {
          runColor = this.modules[y][x];
          runVal = 1;
        }
      }
    }
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runVal = 0;
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result++;
        } else {
          runColor = this.modules[y][x];
          runVal = 1;
        }
      }
    }
    return result;
  }

  private getAlignmentPatternPositions(): Array<Int> {
    if (this.version === 1) return [];
    const numAlign: Int = Math.floor(this.version / 7) + 2;
    const step: Int =
      this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: Array<Int> = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  private static getNumRawDataModules(ver: Int): Int {
    let result: Int = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign: Int = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  private static getNumDataCodewords(ver: Int, ecl: QrCodeEcc): Int {
    return (
      Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
      QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
        QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
    );
  }

  private static reedSolomonComputeDivisor(degree: Int): Array<Byte> {
    const result: Array<Byte> = [];
    for (let i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = QrCode.reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = QrCode.reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  private static reedSolomonComputeRemainder(
    data: Readonly<Array<Byte>>,
    divisor: Readonly<Array<Byte>>,
  ): Array<Byte> {
    const result: Array<Byte> = divisor.map(() => 0);
    for (const b of data) {
      const factor: Byte = b ^ (result.shift() as Byte);
      result.push(0);
      divisor.forEach((coef, i) => (result[i] ^= QrCode.reedSolomonMultiply(coef, factor)));
    }
    return result;
  }

  private static reedSolomonMultiply(x: Byte, y: Byte): Byte {
    let z: Int = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  private static readonly ECC_CODEWORDS_PER_BLOCK: Array<Array<Int>> = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  private static readonly NUM_ERROR_CORRECTION_BLOCKS: Array<Array<Int>> = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 72, 74, 78],
  ];
}

class QrCodeEcc {
  public static readonly LOW = new QrCodeEcc(0, 1);
  public static readonly MEDIUM = new QrCodeEcc(1, 0);
  public static readonly QUARTILE = new QrCodeEcc(2, 3);
  public static readonly HIGH = new QrCodeEcc(3, 2);
  private constructor(public readonly ordinal: Int, public readonly formatBits: Int) {}
}

class QrSegment {
  public static makeSegments(text: string): Array<QrSegment> {
    if (text === '') return [];
    return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];
  }

  public static makeBytes(data: Readonly<Array<Byte>>): QrSegment {
    const bb: Array<Bit> = [];
    for (const b of data) appendBits(b, 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  public static getTotalBits(segs: Readonly<Array<QrSegment>>, version: Int): number {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= 1 << ccbits) return Infinity;
      result += 4 + ccbits + seg.getData().length;
    }
    return result;
  }

  private static toUtf8ByteArray(str: string): Array<Byte> {
    const result: Array<Byte> = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (0xd800 <= c && c <= 0xdbff && i + 1 < str.length) {
        const d = str.charCodeAt(i + 1);
        if (0xdc00 <= d && d <= 0xdfff) {
          c = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
          i++;
        }
      }
      if (c <= 0x7f) result.push(c);
      else if (c <= 0x7ff) result.push(0xc0 | (c >>> 6), 0x80 | (c & 0x3f));
      else if (c <= 0xffff) result.push(0xe0 | (c >>> 12), 0x80 | ((c >>> 6) & 0x3f), 0x80 | (c & 0x3f));
      else result.push(0xf0 | (c >>> 18), 0x80 | ((c >>> 12) & 0x3f), 0x80 | ((c >>> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return result;
  }

  public constructor(
    public readonly mode: Mode,
    public readonly numChars: Int,
    private readonly bitData: Array<Bit>,
  ) {}

  public getData(): Array<Bit> {
    return this.bitData.slice();
  }
}

class Mode {
  public static readonly NUMERIC = new Mode(0x1, [10, 12, 14]);
  public static readonly ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
  public static readonly BYTE = new Mode(0x4, [8, 16, 16]);
  public static readonly KANJI = new Mode(0x8, [8, 10, 12]);
  public static readonly ECI = new Mode(0x7, [0, 0, 0]);

  private constructor(public readonly modeBits: Int, private readonly numBitsCharCount: [Int, Int, Int]) {}

  public numCharCountBits(ver: Int): Int {
    return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
  }
}

function appendBits(val: Int, len: Int, bb: Array<Bit>): void {
  for (let i = len - 1; i >= 0; i--) {
    bb.push((val >>> i) & 1);
  }
}

function getBit(x: Int, i: Int): boolean {
  return ((x >>> i) & 1) !== 0;
}
