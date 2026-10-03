import assert from "node:assert/strict";
import test from "node:test";

class MemoryBucket {
  objects = new Map();

  async put(key, body, options = {}) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    const object = {
      key,
      bytes,
      size: bytes.byteLength,
      httpEtag: `"${key}-${bytes.byteLength}"`,
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
    };
    this.objects.set(key, object);
    return object;
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      ...object,
      body: new Blob([object.bytes]).stream(),
      writeHttpMetadata(headers) {
        if (object.httpMetadata.contentType) headers.set("content-type", object.httpMetadata.contentType);
      },
    };
  }

  async head(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.objects.delete(key);
  }

  async list({ prefix = "" }) {
    return {
      objects: [...this.objects.values()].filter((object) => object.key.startsWith(prefix)),
      truncated: false,
    };
  }
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("storage-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

test("stores and serves original manga pages and thumbnails from R2", async () => {
  const worker = await loadWorker();
  const bucket = new MemoryBucket();
  const env = {
    BUCKET: bucket,
    MANGA_IMPORT_TOKEN: "test-import-token",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const uploadUrl = "http://localhost/api/internal/manga-pages/00/00-001.png";

  const unauthorized = await worker.fetch(new Request(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/png", "content-length": String(bytes.byteLength) },
    body: bytes,
  }), env, ctx);
  assert.equal(unauthorized.status, 401);

  const uploaded = await worker.fetch(new Request(uploadUrl, {
    method: "PUT",
    headers: {
      authorization: "Bearer test-import-token",
      "content-type": "image/png",
      "content-length": String(bytes.byteLength),
      "x-drive-file-id": "drive-test-id",
      "x-content-sha256": "test-sha256",
    },
    body: bytes,
  }), env, ctx);
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).size, bytes.byteLength);

  const served = await worker.fetch(
    new Request("http://localhost/media/original/pages/00/00-001.png"),
    env,
    ctx,
  );
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(served.headers.get("content-length"), String(bytes.byteLength));
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);

  const thumbnailBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80]);
  const thumbnailUploadUrl = "http://localhost/api/internal/manga-thumbnails/00/00-001.webp";
  const uploadedThumbnail = await worker.fetch(new Request(thumbnailUploadUrl, {
    method: "PUT",
    headers: {
      authorization: "Bearer test-import-token",
      "content-type": "image/webp",
      "content-length": String(thumbnailBytes.byteLength),
      "x-source-file": "00/00-001.webp",
    },
    body: thumbnailBytes,
  }), env, ctx);
  assert.equal(uploadedThumbnail.status, 201);

  const servedThumbnail = await worker.fetch(
    new Request("http://localhost/media/pages/00/00-001.webp"),
    env,
    ctx,
  );
  assert.equal(servedThumbnail.status, 200);
  assert.equal(servedThumbnail.headers.get("content-type"), "image/webp");
  assert.deepEqual(new Uint8Array(await servedThumbnail.arrayBuffer()), thumbnailBytes);

  const status = await worker.fetch(new Request(
    "http://localhost/api/internal/manga-pages/status?volume=00&file=00-001.png",
    { headers: { authorization: "Bearer test-import-token" } },
  ), env, ctx);
  assert.deepEqual(await status.json(), {
    exists: true,
    key: "manga/pages/00/00-001.png",
    size: bytes.byteLength,
    etag: `"manga/pages/00/00-001.png-${bytes.byteLength}"`,
    metadata: {
      source: "google-drive",
      sourceId: "drive-test-id",
      sha256: "test-sha256",
    },
  });

  const summary = await worker.fetch(new Request(
    "http://localhost/api/internal/manga-pages/status",
    { headers: { authorization: "Bearer test-import-token" } },
  ), env, ctx);
  assert.deepEqual(await summary.json(), {
    originals: {
      count: 1,
      bytes: bytes.byteLength,
      withSourceMetadata: 1,
      byVolume: { "00": 1 },
    },
    thumbnails: {
      count: 1,
      bytes: thumbnailBytes.byteLength,
      withSourceMetadata: 1,
      byVolume: { "00": 1 },
    },
  });
});
