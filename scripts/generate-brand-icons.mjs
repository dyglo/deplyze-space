import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// Rasterize the original vector, preserving its full viewBox, paths and color.
// An opaque white canvas keeps the black artwork visible in dark browser chrome
// and avoids Apple rendering transparency as black. Originals remain untouched.
const source = new URL("../public/brand/deplyze-space.svg", import.meta.url);
async function png(size) {
  return sharp(source.pathname, { density: 384 })
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}

for (const [name, size] of [
  ["favicon-96x96.png", 96],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
]) {
  await writeFile(
    new URL(`../public/${name}`, import.meta.url),
    await png(size),
  );
}

// Standard ICO directory containing lossless PNG frames, supported by modern
// browsers. No new artwork, cropping, color inversion or PNG upscaling.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(24, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, ...frames]),
);
