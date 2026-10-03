import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pagesRoot = resolve(process.argv[2] || "");
const ocrRoot = resolve(process.argv[3] || "");

if (!process.argv[2] || !existsSync(pagesRoot) || !process.argv[3] || !existsSync(ocrRoot)) {
  throw new Error("Usage: node scripts/build-comic-evidence.mjs <comic-pages-directory> <ocr-directory>");
}

const readJson = (name) => JSON.parse(readFileSync(join(root, "data/raw", `${name}.json`), "utf8"));
const chapters = readJson("chapters");
const characters = readJson("characters");
const techniques = readJson("techniques");
const terms = readJson("terms");
const supplements = readJson("supplements");
const volumeContent = readJson("volume-content");

const pagesForSupplement = (supplement) => [...new Set([
  ...(supplement.pages || []),
  ...(Number.isInteger(supplement.page_start) && Number.isInteger(supplement.page_end)
    ? Array.from({ length: supplement.page_end - supplement.page_start + 1 }, (_, index) => supplement.page_start + index)
    : []),
])].filter(Number.isInteger).sort((a, b) => a - b);

const supplementRangesByVolume = new Map();
for (const supplement of supplements) {
  if (!pagesForSupplement(supplement).length) continue;
  if (!supplementRangesByVolume.has(supplement.volume)) supplementRangesByVolume.set(supplement.volume, []);
  supplementRangesByVolume.get(supplement.volume).push({
    ...supplement,
    pageSet: new Set(pagesForSupplement(supplement)),
  });
}

const compact = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja")
  .replace(/[\s・「」『』（）()【】〈〉《》―ー…!?！？。、,.\-]/g, "");
const unique = (values) => [...new Set(values.filter(Boolean))];

const ocrByFile = new Map();
for (const name of readdirSync(ocrRoot).filter((file) => /^ocr-.+\.jsonl$/.test(file)).sort()) {
  const lines = readFileSync(join(ocrRoot, name), "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      ocrByFile.set(record.file, record);
    } catch {
      // A partial line is ignored; the source image remains in the page audit.
    }
  }
}

const pageText = (file) => {
  const record = ocrByFile.get(file);
  if (!record || record.error || !Array.isArray(record.text)) return "";
  return compact(record.text
    .filter((item) => Number(item.confidence || 0) >= 0.25)
    .map((item) => item.text || "")
    .join(" "));
};

const chaptersByVolume = new Map();
for (const chapter of chapters) {
  if (!chaptersByVolume.has(chapter.volume)) chaptersByVolume.set(chapter.volume, []);
  chaptersByVolume.get(chapter.volume).push(chapter);
}
for (const rows of chaptersByVolume.values()) rows.sort((a, b) => a.startPage - b.startPage);

const evidence = {
  generatedAt: new Date().toISOString(),
  scan: { expectedPages: 0, indexedPages: 0, ocrErrors: 0 },
  volumes: {},
  chapters: {},
};
const pageIndex = [];

const chooseScenePage = (start, end, ratio, availablePages, textByPage) => {
  const target = Math.round(start + (end - start) * ratio);
  const candidates = availablePages
    .filter((page) => page >= start && page <= end)
    .sort((a, b) => {
      const aHasText = textByPage.get(a) ? 1 : 0;
      const bHasText = textByPage.get(b) ? 1 : 0;
      return bHasText - aHasText || Math.abs(a - target) - Math.abs(b - target);
    });
  return candidates[0] || start;
};

for (let volume = 0; volume <= 30; volume += 1) {
  const volumeKey = String(volume).padStart(2, "0");
  const directory = join(pagesRoot, volumeKey);
  if (!existsSync(directory)) {
    evidence.volumes[volume] = { available: false, pageCount: 0, verifiedChapterStarts: 0 };
    continue;
  }

  const prefix = `${volumeKey}-`;
  const pages = readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".png"))
    .map((name) => Number(name.slice(prefix.length, -4)))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const pageSet = new Set(pages);
  const textByPage = new Map(pages.map((page) => {
    const file = `${volumeKey}-${String(page).padStart(3, "0")}.png`;
    return [page, pageText(file)];
  }));
  const volumeChapters = chaptersByVolume.get(volume) || [];
  const volumeSupplements = supplementRangesByVolume.get(volume) || [];
  const supplementForPage = (page) => volumeSupplements.find((item) => item.pageSet.has(page));
  const chapterRanges = volumeChapters.map((chapter, index) => {
    const next = volumeChapters[index + 1];
    const boundary = next
      ? next.startPage - 1
      : Number(volumeContent[volume]) || chapter.startPage;
    const firstSupplement = volumeSupplements
      .flatMap((item) => [...item.pageSet])
      .filter((page) => page >= chapter.startPage && page <= boundary)
      .sort((a, b) => a - b)[0];
    return {
      id: chapter.id,
      start: chapter.startPage,
      end: Math.max(chapter.startPage, firstSupplement ? firstSupplement - 1 : boundary),
    };
  });
  const chapterForPage = (page) => {
    if (supplementForPage(page)) return "";
    return chapterRanges.find((range) => page >= range.start && page <= range.end)?.id || "";
  };

  evidence.scan.expectedPages += pages.length;
  evidence.volumes[volume] = {
    available: true,
    pageCount: pages.length,
    firstPage: pages[0] || null,
    lastPage: pages.at(-1) || null,
    verifiedChapterStarts: volumeChapters.filter((chapter) => pageSet.has(chapter.startPage)).length,
  };

  for (const page of pages) {
    const file = `${volumeKey}-${String(page).padStart(3, "0")}.png`;
    const record = ocrByFile.get(file);
    if (record && !record.error) evidence.scan.indexedPages += 1;
    if (record?.error) evidence.scan.ocrErrors += 1;
    pageIndex.push({
      file: file.replace(/\.png$/, ".webp"),
      volume,
      page,
      chapterId: chapterForPage(page),
      supplementId: supplementForPage(page)?.id || "",
      text: textByPage.get(page) || "",
    });
  }

  for (let index = 0; index < volumeChapters.length; index += 1) {
    const chapter = volumeChapters[index];
    const range = chapterRanges[index];
    const end = Math.min(range.end, pages.at(-1) || range.end);
    const scenePages = unique([
      chapter.startPage,
      chooseScenePage(chapter.startPage, end, 0.33, pages, textByPage),
      chooseScenePage(chapter.startPage, end, 0.62, pages, textByPage),
      chooseScenePage(chapter.startPage, end, 0.88, pages, textByPage),
    ]).sort((a, b) => a - b);
    evidence.chapters[chapter.id] = {
      pageRange: { start: chapter.startPage, end },
      scenes: scenePages,
      characters: {},
      techniques: {},
      terms: {},
    };
  }
}

const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
const matchedPages = (chapterId, names) => {
  const chapter = chapterById.get(chapterId);
  const range = evidence.chapters[chapterId]?.pageRange;
  if (!chapter || !range) return [];
  const volumeKey = String(chapter.volume).padStart(2, "0");
  const needles = unique(names.map(compact)).filter((name) => name.length >= 2);
  if (!needles.length) return [];
  const matches = [];
  for (let page = range.start; page <= range.end; page += 1) {
    const file = `${volumeKey}-${String(page).padStart(3, "0")}.png`;
    const text = pageText(file);
    const score = needles.reduce((total, needle) => total + (text.includes(needle) ? needle.length : 0), 0);
    if (score) matches.push({ page, score });
  }
  return matches.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, 2).map((item) => item.page);
};

const attachMatches = (records, group, namesForRecord) => {
  for (const record of records) {
    for (const chapterId of unique(record.chapterIds || [])) {
      const pages = matchedPages(chapterId, namesForRecord(record));
      if (pages.length && evidence.chapters[chapterId]) evidence.chapters[chapterId][group][record.id] = pages;
    }
  }
};

attachMatches(characters, "characters", (record) => [record.name, ...(record.aliases || [])]);
attachMatches(techniques, "techniques", (record) => [record.name, ...(record.aliases || [])]);
attachMatches(terms, "terms", (record) => [record.name]);

mkdirSync(join(root, "public", "data"), { recursive: true });
writeFileSync(join(root, "data/raw/comic-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(join(root, "public/data/page-index.json"), JSON.stringify(pageIndex));

const availableVolumes = Object.values(evidence.volumes).filter((volume) => volume.available).length;
const verifiedChapterStarts = Object.values(evidence.volumes).reduce((total, volume) => total + volume.verifiedChapterStarts, 0);
console.log(JSON.stringify({
  availableVolumes,
  verifiedChapterStarts,
  ...evidence.scan,
  pageIndex: pageIndex.length,
}, null, 2));
