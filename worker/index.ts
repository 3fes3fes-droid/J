/** Cloudflare Worker entry point for the vinext-starter template. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  DB: D1Database;
  MANGA_IMPORT_TOKEN?: string;
}

const ORIGINAL_PAGE_ROUTE = /^\/media\/original\/pages\/(\d{2})\/(\d{2})-(\d{3})\.png$/;
const THUMBNAIL_PAGE_ROUTE = /^\/media\/pages\/(\d{2})\/(\d{2})-(\d{3})\.webp$/;
const IMPORT_PAGE_ROUTE = /^\/api\/internal\/manga-pages\/(\d{2})\/(\d{2})-(\d{3})\.png$/;
const IMPORT_THUMBNAIL_ROUTE = /^\/api\/internal\/manga-thumbnails\/(\d{2})\/(\d{2})-(\d{3})\.webp$/;
const STORAGE_STATUS_ROUTE = "/api/internal/manga-pages/status";
const ORIGINAL_PAGE_PREFIX = "manga/pages/";
const THUMBNAIL_PAGE_PREFIX = "manga/thumbnails/";

function mangaPageKey(volume: string, fileVolume: string, page: string) {
  if (volume !== fileVolume) return null;
  return `${ORIGINAL_PAGE_PREFIX}${volume}/${fileVolume}-${page}.png`;
}

function thumbnailPageKey(volume: string, fileVolume: string, page: string) {
  if (volume !== fileVolume) return null;
  return `${THUMBNAIL_PAGE_PREFIX}${volume}/${fileVolume}-${page}.webp`;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isAuthorizedImporter(request: Request, env: Env) {
  const token = env.MANGA_IMPORT_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

async function serveOriginalPage(request: Request, env: Env, key: string) {
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "image/png");
  headers.set("content-length", String(object.size));
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");

  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function serveThumbnailPage(request: Request, env: Env, key: string) {
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "image/webp");
  headers.set("content-length", String(object.size));
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function importOriginalPage(request: Request, env: Env, key: string) {
  if (!isAuthorizedImporter(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!request.body) return json({ error: "PNG body is required" }, 400);
  if (request.headers.get("content-type") !== "image/png") {
    return json({ error: "Only image/png is accepted" }, 415);
  }

  const declaredSize = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    return json({ error: "A valid Content-Length is required" }, 411);
  }

  const sourceId = request.headers.get("x-drive-file-id") || "";
  const sha256 = request.headers.get("x-content-sha256") || "";
  const uploaded = await env.BUCKET.put(key, request.body, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      source: "google-drive",
      sourceId,
      sha256,
    },
  });

  if (uploaded.size !== declaredSize) {
    await env.BUCKET.delete(key);
    return json({ error: "Stored size did not match Content-Length" }, 422);
  }

  return json({ key, size: uploaded.size, etag: uploaded.httpEtag }, 201);
}

async function importThumbnailPage(request: Request, env: Env, key: string) {
  if (!isAuthorizedImporter(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!request.body) return json({ error: "WebP body is required" }, 400);
  if (request.headers.get("content-type") !== "image/webp") {
    return json({ error: "Only image/webp is accepted" }, 415);
  }

  const declaredSize = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    return json({ error: "A valid Content-Length is required" }, 411);
  }

  const uploaded = await env.BUCKET.put(key, request.body, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: {
      source: "site-thumbnail",
      sourceFile: request.headers.get("x-source-file") || "",
    },
  });

  if (uploaded.size !== declaredSize) {
    await env.BUCKET.delete(key);
    return json({ error: "Stored size did not match Content-Length" }, 422);
  }

  return json({ key, size: uploaded.size, etag: uploaded.httpEtag }, 201);
}

async function summarizePrefix(env: Env, prefix: string) {
  let cursor: string | undefined;
  let count = 0;
  let bytes = 0;
  let withSourceMetadata = 0;
  const byVolume: Record<string, number> = {};
  do {
    const page = await env.BUCKET.list({ prefix, cursor, include: ["customMetadata"] });
    count += page.objects.length;
    for (const object of page.objects) {
      bytes += object.size;
      if (object.customMetadata?.source) withSourceMetadata += 1;
      const volume = object.key.slice(prefix.length).split("/")[0] || "unknown";
      byVolume[volume] = (byVolume[volume] || 0) + 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return {
    count,
    bytes,
    withSourceMetadata,
    byVolume: Object.fromEntries(Object.entries(byVolume).sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function storageStatus(request: Request, env: Env) {
  if (!isAuthorizedImporter(request, env)) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const volume = url.searchParams.get("volume");
  const file = url.searchParams.get("file");
  const kind = url.searchParams.get("kind") === "thumbnail" ? "thumbnail" : "original";
  if (volume || file) {
    const match = volume && file && kind === "thumbnail"
      ? THUMBNAIL_PAGE_ROUTE.exec(`/media/pages/${volume}/${file}`)
      : volume && file
        ? ORIGINAL_PAGE_ROUTE.exec(`/media/original/pages/${volume}/${file}`)
        : null;
    const key = match && kind === "thumbnail"
      ? thumbnailPageKey(match[1], match[2], match[3])
      : match
        ? mangaPageKey(match[1], match[2], match[3])
        : null;
    if (!key) return json({ error: "Invalid page locator" }, 400);
    const object = await env.BUCKET.head(key);
    return json(object
      ? { exists: true, key, size: object.size, etag: object.httpEtag, metadata: object.customMetadata }
      : { exists: false, key });
  }

  const [originals, thumbnails] = await Promise.all([
    summarizePrefix(env, ORIGINAL_PAGE_PREFIX),
    summarizePrefix(env, THUMBNAIL_PAGE_PREFIX),
  ]);
  return json({ originals, thumbnails });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const originalPage = ORIGINAL_PAGE_ROUTE.exec(url.pathname);
    if (originalPage && (request.method === "GET" || request.method === "HEAD")) {
      const key = mangaPageKey(originalPage[1], originalPage[2], originalPage[3]);
      return key ? serveOriginalPage(request, env, key) : new Response("Not found", { status: 404 });
    }

    const thumbnailPage = THUMBNAIL_PAGE_ROUTE.exec(url.pathname);
    if (thumbnailPage && (request.method === "GET" || request.method === "HEAD")) {
      const key = thumbnailPageKey(thumbnailPage[1], thumbnailPage[2], thumbnailPage[3]);
      return key ? serveThumbnailPage(request, env, key) : new Response("Not found", { status: 404 });
    }

    const importPage = IMPORT_PAGE_ROUTE.exec(url.pathname);
    if (importPage && request.method === "PUT") {
      const key = mangaPageKey(importPage[1], importPage[2], importPage[3]);
      return key ? importOriginalPage(request, env, key) : json({ error: "Invalid page locator" }, 400);
    }

    const importThumbnail = IMPORT_THUMBNAIL_ROUTE.exec(url.pathname);
    if (importThumbnail && request.method === "PUT") {
      const key = thumbnailPageKey(importThumbnail[1], importThumbnail[2], importThumbnail[3]);
      return key ? importThumbnailPage(request, env, key) : json({ error: "Invalid page locator" }, 400);
    }

    if (url.pathname === STORAGE_STATUS_ROUTE && request.method === "GET") {
      return storageStatus(request, env);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
