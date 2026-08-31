import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const size = 16;
const xor = Buffer.alloc(size * size * 4, 0);
for (let i = 0; i < size * size; i++) {
  xor[i * 4 + 0] = 0xf2;
  xor[i * 4 + 1] = 0x65;
  xor[i * 4 + 2] = 0x58;
  xor[i * 4 + 3] = 0xff;
}
const andStride = Math.ceil(size / 32) * 4;
const and = Buffer.alloc(andStride * size, 0);
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);
dib.writeInt32LE(size, 4);
dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
const image = Buffer.concat([dib, xor, and]);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size;
header[7] = size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(image.length, 14);
header.writeUInt32LE(22, 18);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.ico");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, image]));
