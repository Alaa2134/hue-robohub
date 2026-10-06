import sharp from "sharp";
const files = process.argv.slice(3);
const tiles = await Promise.all(files.map((f) => sharp(f).resize(420, 420).toBuffer()));
await sharp({ create: { width: 420 * tiles.length, height: 420, channels: 3, background: "#000" } })
  .composite(tiles.map((t, i) => ({ input: t, left: i * 420, top: 0 })))
  .png()
  .toFile(process.argv[2]);
