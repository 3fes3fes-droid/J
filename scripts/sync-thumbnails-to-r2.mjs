import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const origin = (process.argv[2] || "").replace(/\/$/, "");
const importToken = process.env.SITE_IMPORT_TOKEN || "";
const bypassToken = process.env.SITES_BYPASS_TOKEN || "";
const concurrency = Math.max(1, Number(process.env.UPLOAD_CONCURRENCY || 20));
const pageRoot = new URL("../public/media/pages/", import.meta.url);

if (!/^https:\/\/[^/]+$/.test(origin)) throw new Error("Pass the HTTPS Site origin as the first argument.");
if (!importToken) throw new Error("SITE_IMPORT_TOKEN is required.");
if (!bypassToken) throw new Error("SITES_BYPASS_TOKEN is required.");

const volumes = (await readdir(pageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const files = [];
for (const volume of volumes) {
  const names = (await readdir(new URL(`${volume}/`, pageRoot)))
    .filter((name) => /^\d{2}-\d{3}\.webp$/.test(name))
    .sort();
  for (const name of names) files.push({ volume, name });
}

let nextIndex = 0;
let completed = 0;

async function upload(entry) {
  const body = await readFile(new URL(`${entry.volume}/${entry.name}`, pageRoot));
  const url = `${origin}/api/internal/manga-thumbnails/${entry.volume}/${entry.name}`;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${importToken}`,
          "OAI-Sites-Authorization": `Bearer ${bypassToken}`,
          "content-type": "image/webp",
          "content-length": String(body.byteLength),
          "x-source-file": `${entry.volume}/${entry.name}`,
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${entry.volume}/${entry.name}: ${lastError}`);
}

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= files.length) return;
    await upload(files[index]);
    completed += 1;
    if (completed % 250 === 0 || completed === files.length) {
      console.log(`uploaded ${completed}/${files.length}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const status = await fetch(`${origin}/api/internal/manga-pages/status`, {
  headers: {
    authorization: `Bearer ${importToken}`,
    "OAI-Sites-Authorization": `Bearer ${bypassToken}`,
  },
  signal: AbortSignal.timeout(120_000),
});
if (!status.ok) throw new Error(`Status check failed: ${status.status} ${await status.text()}`);
console.log(JSON.stringify(await status.json(), null, 2));
