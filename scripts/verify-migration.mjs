import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = JSON.parse(readFileSync(join(root, "migration/source-baseline.json"), "utf8"));
const allowedChanges = new Set([".gitignore", "README.md", "package.json", "tests/data-integrity.test.mjs", "app/database-app.tsx"]);
let preservedBytes = 0;
let preservedFiles = 0;
for (const file of baseline.kept_files) {
  const path = join(root, file.path);
  assert.ok(existsSync(path), `Missing retained file: ${file.path}`);
  if (allowedChanges.has(file.path)) continue;
  const bytes = readFileSync(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `Unexpected source change: ${file.path}`);
  preservedFiles += 1;
  preservedBytes += bytes.length;
}

const pages = JSON.parse(readFileSync(join(root, "data/drive/page-ids.json"), "utf8"));
const index = JSON.parse(readFileSync(join(root, "public/data/page-index.json"), "utf8"));
assert.equal(index.length, 6260);
assert.deepEqual(Object.keys(pages).sort(), index.map((page) => page.file.replace(/\.webp$/, "")).sort());
assert.equal(new Set(Object.values(pages)).size, 6260, "Duplicate Drive IDs");
for (const [key, id] of Object.entries(pages)) {
  assert.match(key, /^\d{2}-\d{3}$/);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
}

const excludedDirs = new Set([".git", "node_modules", "dist", ".next", ".wrangler", ".sites-runtime"]);
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirs.has(entry.name)) return [];
    const path = join(directory, entry.name);
    assert.ok(!lstatSync(path).isSymbolicLink(), `Unexpected symlink: ${path}`);
    return entry.isDirectory() ? filesUnder(path) : [relative(root, path).replaceAll("\\", "/")];
  });
}
const paths = filesUnder(root);
let sourceBytes = 0;
let largest = { path: "", bytes: 0 };
const baselinePaths = new Set(baseline.kept_files.map((file) => file.path));
for (const path of paths) {
  assert.doesNotMatch(path, /(?:^|\/)media\/(?:original\/)?pages\//, `Manga page in source: ${path}`);
  assert.doesNotMatch(path, /(?:^|\/)\d{2}-\d{3}\.(?:png|webp|jpe?g)$/i, `Unexpected manga image: ${path}`);
  assert.doesNotMatch(path, /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|.*\.(?:pem|p12|key))$/i, `Credential file in source: ${path}`);
  if (/\.(?:png|webp|jpe?g|gif|avif|ico|svg)$/i.test(path)) {
    assert.ok(baselinePaths.has(path), `Image not in the original retained assets: ${path}`);
  }
  const bytes = lstatSync(join(root, path)).size;
  assert.ok(bytes < 100 * 1024 * 1024, `File exceeds 100 MiB: ${path}`);
  sourceBytes += bytes;
  if (bytes > largest.bytes) largest = { path, bytes };
}

let historyChecked = false;
if (existsSync(join(root, ".git"))) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
  assert.ok(tracked.length > 0, "Stage the prepared source before verifying Git contents");
  assert.deepEqual(tracked.sort(), [...paths].sort(), "Staged/tracked files differ from the prepared source");
  const ignored = git("check-ignore", "public/media/pages/00/00-001.webp", "public/media/original/pages/00/00-001.png");
  assert.equal(ignored.trim().split("\n").length, 2);
  let hasHead = false;
  try { git("rev-parse", "--verify", "HEAD"); hasHead = true; }
  catch (error) { if (error.status !== 128) throw error; }
  if (hasHead) {
    const objectPaths = git("rev-list", "--objects", "--all");
    assert.doesNotMatch(objectPaths, /public\/media\/(?:original\/)?pages\//, "Manga pages found in Git history");
    const stats = execFileSync("git", ["cat-file", "--batch-check=%(objecttype) %(objectsize)"], {
      cwd: root, encoding: "utf8", input: objectPaths.split("\n").filter(Boolean).map((line) => line.split(" ")[0]).join("\n") + "\n",
    });
    for (const line of stats.trim().split("\n")) {
      const [kind, size] = line.split(" ");
      if (kind === "blob") assert.ok(Number(size) < 100 * 1024 * 1024, "Oversized blob in Git history");
    }
    historyChecked = true;
  }
}

console.log(JSON.stringify({
  sourceCommit: baseline.source_commit,
  preservedFiles, preservedBytes, sourceFiles: paths.length, sourceBytes, largest,
  mangaImagesIncluded: 0, mappedDrivePages: Object.keys(pages).length, historyChecked,
  imageDelivery: "Drive resolver implemented; external sharing and live image delivery not yet verified",
}, null, 2));
