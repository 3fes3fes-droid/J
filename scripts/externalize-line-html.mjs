import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [sourcePath, outputPath] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
  throw new Error("usage: node scripts/externalize-line-html.mjs SOURCE_HTML OUTPUT_HTML");
}

const source = readFileSync(sourcePath, "utf8");
const assetDirectoryName = `${basename(outputPath, ".html")}_assets`;
const assetDirectory = join(dirname(outputPath), assetDirectoryName);
mkdirSync(assetDirectory, { recursive: true });

const written = new Set();
let imageCount = 0;
let totalBytes = 0;

const html = source.replace(
  /data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)/g,
  (_, mimeType, payload) => {
    const bytes = Buffer.from(payload, "base64");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
    const digest = createHash("sha1").update(bytes).digest("hex").slice(0, 16);
    const filename = `${digest}.${extension}`;
    if (!written.has(filename)) {
      writeFileSync(join(assetDirectory, filename), bytes);
      written.add(filename);
      totalBytes += bytes.length;
    }
    imageCount += 1;
    return `./${assetDirectoryName}/${filename}`;
  },
);

if (imageCount === 0) {
  throw new Error("no embedded images found");
}

writeFileSync(outputPath, html);
console.log(JSON.stringify({
  outputPath,
  imageReferences: imageCount,
  uniqueImages: written.size,
  totalBytes,
  htmlBytes: Buffer.byteLength(html),
}, null, 2));
