import drivePageIds from "../data/drive/page-ids.json" with { type: "json" };

/** Resolve retained local files beneath the GitHub Pages repository path. */
export function publicAsset(path, base = import.meta.env?.BASE_URL || "/") {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Keep logical page identities unchanged in the database and resolve at display time. */
export function imageSources(src, base = import.meta.env?.BASE_URL || "/") {
  if (!src) return [];
  const match = /^\/media\/(original\/)?pages\/(\d{2})\/\2-(\d{3})\.(?:webp|png)$/.exec(src);
  if (!match) return [publicAsset(src, base)];
  const id = drivePageIds[`${match[2]}-${match[3]}`];
  if (!id) return [];
  const encoded = encodeURIComponent(id);
  const fullSize = Boolean(match[1]);
  return [
    `https://lh3.googleusercontent.com/d/${encoded}=${fullSize ? "s0" : "w800"}`,
    `https://drive.google.com/thumbnail?id=${encoded}&sz=${fullSize ? "w2560" : "w800"}`,
  ];
}
