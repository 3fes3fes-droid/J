import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { publicAsset, imageSources } from "../app/pages-assets.mjs";

const pageIds = JSON.parse(readFileSync(new URL("../data/drive/page-ids.json", import.meta.url), "utf8"));

test("every manga page resolves to its own Drive ID at thumbnail and reading sizes", () => {
  assert.equal(Object.keys(pageIds).length, 6260);
  for (const [key, id] of Object.entries(pageIds)) {
    const volume = key.slice(0, 2);
    for (const [path, size] of [
      [`/media/pages/${volume}/${key}.webp`, "w800"],
      [`/media/original/pages/${volume}/${key}.png`, "s0"],
    ]) {
      const [primary, fallback] = imageSources(path, "/J/");
      assert.equal(new URL(primary).pathname, `/d/${id}=${size}`);
      assert.equal(new URL(fallback).searchParams.get("id"), id);
      assert.equal(new URL(fallback).hostname, "drive.google.com");
    }
  }
  assert.deepEqual(imageSources("/media/pages/99/99-999.webp", "/J/"), []);
});

test("local assets and data respect the Pages base while external URLs are preserved", () => {
  for (const path of ["/data/db.json", "/data/page-index.json", "/external/jujutsu_line_stickers.html", "/media/covers/00.webp"]) {
    assert.equal(publicAsset(path, "/J/"), `/J${path}`);
    assert.equal(publicAsset(path, "/"), path);
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)));
  }
  const external = "https://example.org/image.png";
  assert.deepEqual(imageSources(external, "/J/"), [external]);
  assert.deepEqual(imageSources("", "/J/"), []);
});

test("Pages artifact is standalone and contains all retained asset groups", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /src="\/J\/assets\/[^\"]+\.js"/);
  assert.match(html, /href="\/J\/assets\/[^\"]+\.css"/);
  assert.doesNotMatch(html, /codex-preview|vinext|\/app\/pages-entry/);
  for (const path of [".nojekyll", "data/db.json", "data/page-index.json", "media/covers/00.webp", "external/jujutsu_line_stickers.html"]) {
    assert.ok(existsSync(new URL(`../dist/${path}`, import.meta.url)), path);
  }
  assert.ok(!existsSync(new URL("../dist/media/pages/", import.meta.url)));
  assert.ok(!existsSync(new URL("../dist/media/original/pages/", import.meta.url)));
});
