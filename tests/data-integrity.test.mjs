import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const db = JSON.parse(readFileSync(new URL("../public/data/db.json", import.meta.url), "utf8"));

const byId = (records) => new Map(records.map((record) => [record.id, record]));
const chapters = byId(db.chapters);
const characters = byId(db.characters);
const techniques = byId(db.techniques);
const terms = byId(db.terms);
const supplements = byId(db.supplements);
const pageIndex = JSON.parse(readFileSync(new URL("../public/data/page-index.json", import.meta.url), "utf8"));
const drivePageIds = JSON.parse(readFileSync(new URL("../data/drive/page-ids.json", import.meta.url), "utf8"));

// Image delivery is configured separately. This checks page identity only.
function assertMangaPageReference(src) {
  const match = /^\/media\/pages\/(\d{2})\/(\d{2})-(\d{3})\.webp$/.exec(src);
  assert.ok(match, `Invalid manga page reference: ${src}`);
  assert.equal(match[1], match[2], src);
  assert.match(drivePageIds[`${match[2]}-${match[3]}`] ?? "", /^[A-Za-z0-9_-]+$/, src);
}

const rawSupplements = JSON.parse(readFileSync(new URL("../data/raw/supplements.json", import.meta.url), "utf8"));
const endComments = JSON.parse(readFileSync(new URL("../data/raw/end-comments.json", import.meta.url), "utf8"));
const volumeContent = JSON.parse(readFileSync(new URL("../data/raw/volume-content.json", import.meta.url), "utf8"));
const compact = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja")
  .replace(/[\s・「」『』（）()【】〈〉《》―ー…!?！？。、,.\-／/]/g, "");

test("expected complete catalog counts", () => {
  assert.equal(db.chapters.length, 275);
  assert.equal(db.volumes.length, 31);
  assert.equal(db.characters.length, 189);
  assert.equal(db.techniques.length, 181);
  assert.equal(db.terms.length, 173);
  assert.equal(db.supplements.length, 61);
  assert.equal(db.battles.length, 87);
  assert.equal(db.deaths.length, 53);
  assert.equal(db.meta.pages, 6260);
  assert.equal(pageIndex.length, 6260);
});

test("chapter presentation contains no duplicated beats", () => {
  for (const chapter of db.chapters) {
    assert.ok(chapter.summary);
    assert.equal(chapter.lead, "", chapter.id);
    assert.equal(new Set(chapter.beats.map((beat) => beat.text)).size, chapter.beats.length, chapter.id);
  }
});

test("chapter labels use compact numeric notation everywhere", () => {
  assert.equal(chapters.get("ch-001")?.label, "1");
  assert.equal(chapters.get("zero-01")?.label, "0巻 1");
  for (const chapter of db.chapters) assert.doesNotMatch(chapter.label, /第[0-9０-９]+話/, chapter.id);
  for (const volume of db.volumes) {
    for (const chapter of volume.chapters) assert.doesNotMatch(chapter.label, /第[0-9０-９]+話/, `${volume.id} -> ${chapter.id}`);
  }
  for (const item of [...db.techniques, ...db.terms]) {
    for (const context of item.storyContexts) assert.doesNotMatch(context.label, /第[0-9０-９]+話/, `${item.id} -> ${context.chapterId}`);
  }
});

test("forward and reverse relations are symmetrical", () => {
  for (const chapter of db.chapters) {
    for (const id of chapter.characterIds) assert.ok(characters.get(id)?.chapterIds.includes(chapter.id), `${chapter.id} -> ${id}`);
    for (const id of chapter.techniqueIds) assert.ok(techniques.get(id)?.chapterIds.includes(chapter.id), `${chapter.id} -> ${id}`);
    for (const id of chapter.termIds) assert.ok(terms.get(id)?.chapterIds.includes(chapter.id), `${chapter.id} -> ${id}`);
  }
  for (const character of db.characters) {
    for (const id of character.chapterIds) assert.ok(chapters.get(id)?.characterIds.includes(character.id), `${character.id} -> ${id}`);
    for (const id of character.battleIds) {
      const battle = db.battles.find((item) => item.id === id);
      assert.ok(battle?.sides.some((side) => side.characterIds.includes(character.id)), `${character.id} -> ${id}`);
    }
  }
  for (const technique of db.techniques) {
    for (const id of technique.chapterIds) assert.ok(chapters.get(id)?.techniqueIds.includes(technique.id), `${technique.id} -> ${id}`);
  }
  for (const term of db.terms) {
    for (const id of term.chapterIds) assert.ok(chapters.get(id)?.termIds.includes(term.id), `${term.id} -> ${id}`);
  }
  for (const battle of db.battles) {
    assert.ok(battle.sides.length >= 2, battle.id);
    for (const chapterId of battle.chapterIds) assert.ok(chapters.get(chapterId)?.battleIds.includes(battle.id), `${battle.id} -> ${chapterId}`);
    for (const side of battle.sides) {
      for (const characterId of side.characterIds) assert.ok(characters.get(characterId)?.battleIds.includes(battle.id), `${battle.id} -> ${characterId}`);
    }
  }
  for (const death of db.deaths) {
    assert.ok(characters.has(death.characterId), death.id);
    assert.ok(chapters.has(death.chapterId), death.id);
    for (const killerId of death.killerIds) assert.ok(characters.has(killerId), `${death.id} -> ${killerId}`);
  }
});

test("all displayed information is detached from external reference pages", () => {
  assert.deepEqual(db.sources, []);
  const groups = [db.chapters, db.volumes, db.characters, db.techniques, db.terms, db.supplements, db.battles, db.deaths];
  for (const records of groups) {
    for (const record of records) {
      assert.deepEqual(record.sourceIds, [], record.id);
    }
  }
});

test("every chapter retains its manga page identity", () => {
  const commentByChapter = new Map(endComments.comments.map((comment) => [comment.chapter, comment]));
  for (const chapter of db.chapters) {
    assert.ok(chapter.pageRange.start <= chapter.pageRange.end, chapter.id);
    assert.equal(chapter.startPage, chapter.pageRange.start, chapter.id);
    assert.equal(chapter.sceneImages.length, chapter.pageRange.end - chapter.pageRange.start + 1, chapter.id);
    assert.equal(chapter.imageUrl, chapter.sceneImages[0].src, chapter.id);
    if (Number.isInteger(chapter.number)) {
      const expected = commentByChapter.get(chapter.number);
      assert.ok(expected, chapter.id);
      assert.equal(chapter.endComment?.text, expected.text, chapter.id);
      assert.equal(chapter.endComment?.issue, expected.issue, chapter.id);
      assert.equal(chapter.endComment?.releaseDate, expected.releaseDate, chapter.id);
    } else {
      assert.equal(chapter.endComment, null, chapter.id);
    }
    for (const scene of chapter.sceneImages) {
      assert.ok(scene.page >= chapter.pageRange.start && scene.page <= chapter.pageRange.end, `${chapter.id} p.${scene.page}`);
      assert.ok(scene.src.startsWith("/media/pages/"), scene.src);
      assertMangaPageReference(scene.src);
    }
  }
  assert.equal(db.chapters.filter((chapter) => chapter.endComment).length, 271);
});

test("all covers remain local and all searchable pages have unique Drive IDs", () => {
  for (const volume of db.volumes) {
    assert.match(volume.imageUrl, /^\/media\/covers\/\d{2}\.webp$/);
    assert.ok(existsSync(new URL(`../public${volume.imageUrl}`, import.meta.url)), volume.imageUrl);
  }
  assert.equal(new Set(pageIndex.map((page) => page.file)).size, 6260);
  assert.equal(new Set(Object.values(drivePageIds)).size, 6260);
  assert.deepEqual(Object.keys(drivePageIds).sort(), pageIndex.map((page) => page.file.replace(/\.webp$/, "")).sort());
  for (const page of pageIndex) {
    const volume = String(page.volume).padStart(2, "0");
    assertMangaPageReference(`/media/pages/${volume}/${page.file}`);
  }
});

test("chapter spread alignment follows the scanned page side", () => {
  const leadingSingles = db.chapters.filter((chapter) => chapter.sceneImages[0]?.page % 2 === 1);
  const openingSpreads = db.chapters.filter((chapter) => chapter.sceneImages[0]?.page % 2 === 0);

  assert.equal(leadingSingles.length, 264);
  assert.equal(openingSpreads.length, 11);

  for (const chapter of db.chapters) {
    const pages = chapter.sceneImages.map((scene) => scene.page);
    assert.ok(pages.length > 0, chapter.id);
    assert.equal(pages[0], chapter.startPage, chapter.id);
    assert.ok(pages.every((page, index) => index === 0 || page === pages[index - 1] + 1), chapter.id);

    const firstDisplayedPair = pages[0] % 2 === 0 ? pages.slice(0, 2) : pages.slice(1, 3);
    assert.equal(firstDisplayedPair[0] % 2, 0, chapter.id);
    assert.equal(firstDisplayedPair[1], firstDisplayedPair[0] + 1, chapter.id);
  }

  const finalChapter = db.chapters.find((chapter) => chapter.id === "ch-271");
  assert.deepEqual(finalChapter.sceneImages.slice(0, 2).map((scene) => scene.page), [148, 149]);
});

test("character cards use the original icons instead of arbitrary manga pages", () => {
  assert.equal(db.characters.filter((character) => character.imageUrl).length, 189);
  for (const character of db.characters) {
    assert.ok(!character.imageUrl.startsWith("/media/pages/"), character.name);
    if (character.imageUrl.startsWith("/")) {
      assert.ok(existsSync(new URL(`../public${character.imageUrl}`, import.meta.url)), character.imageUrl);
    }
  }
});

test("character, technique, and term scenes point to mapped manga pages", () => {
  const groups = [
    ...db.characters.map((item) => [item.id, item.highlights]),
    ...db.techniques.map((item) => [item.id, item.storyContexts]),
    ...db.terms.map((item) => [item.id, item.storyContexts]),
  ];
  for (const [recordId, contexts] of groups) {
    for (const context of contexts) {
      const chapter = chapters.get(context.chapterId);
      assert.ok(chapter, `${recordId} -> ${context.chapterId}`);
      const volume = String(chapter.volume).padStart(2, "0");
      for (const page of context.pages) {
        assert.ok(page >= chapter.pageRange.start && page <= chapter.pageRange.end, `${recordId} -> ${context.chapterId} p.${page}`);
        const file = `${volume}-${String(page).padStart(3, "0")}.webp`;
        assertMangaPageReference(`/media/pages/${volume}/${file}`);
      }
    }
  }

  const imageEvidenceGroups = [...db.techniques, ...db.terms];
  for (const item of imageEvidenceGroups) {
    assert.equal(item.imageUrl, item.sceneImages[0]?.src || "", item.name);
    assert.ok(item.sceneImages.length > 0, item.name);
    for (const scene of item.sceneImages) {
      if (scene.supplementId) {
        const supplement = supplements.get(scene.supplementId);
        assert.ok(supplement, `${item.id} -> ${scene.supplementId}`);
        assert.equal(supplement.volume, scene.volume, `${item.id} -> ${scene.src}`);
        assert.ok(supplement.sceneImages.some((image) => image.page === scene.page && image.src === scene.src), `${item.id} -> ${scene.src}`);
        assertMangaPageReference(scene.src);
        const indexedPage = pageIndex.find((page) => page.volume === scene.volume && page.page === scene.page);
        assert.equal(indexedPage?.supplementId, scene.supplementId, `${item.id} -> ${scene.src}`);
        assert.equal(indexedPage?.chapterId, "", `${item.id} -> ${scene.src}`);
        continue;
      }
      const chapter = chapters.get(scene.chapterId);
      assert.ok(chapter, `${item.id} -> ${scene.chapterId}`);
      assert.equal(chapter.volume, scene.volume, `${item.id} -> ${scene.src}`);
      assert.ok(scene.page >= chapter.pageRange.start && scene.page <= chapter.pageRange.end, `${item.id} -> ${scene.chapterId} p.${scene.page}`);
      assertMangaPageReference(scene.src);
      const indexedPage = pageIndex.find((page) => page.volume === scene.volume && page.page === scene.page);
      assert.equal(indexedPage?.chapterId, scene.chapterId, `${item.id} -> ${scene.src}`);
      for (const fragment of scene.matchKind === "visual-confirmed" ? [] : scene.matchedText.split("・").filter(Boolean)) {
        assert.ok(compact(indexedPage?.text).includes(compact(fragment)), `${item.id} -> ${fragment}`);
      }
    }
  }
});

test("all manga supplements are separated from chapter pages with exact page sets", () => {
  const expected = new Map([
    ["supp-epilogue-ozawa", [170, 171, 172, 173, 174, 175]],
    ["supp-epilogue-panda", [176, 177, 178]],
    ["supp-epilogue-nobara", [179, 180, 181, 182, 183, 184]],
    ["supp-epilogue-uraume", [185, 186, 187, 188, 189]],
    ["supp-v30-afterword", [190, 191]],
  ]);
  assert.equal(db.supplements.reduce((total, item) => total + item.sceneImages.length, 0), 122);
  assert.equal(rawSupplements.length, db.supplements.length);
  const occupiedPages = new Set();
  for (const rawSupplement of rawSupplements) {
    const supplement = supplements.get(rawSupplement.id);
    assert.ok(supplement, rawSupplement.id);
    const pages = [...rawSupplement.pages].sort((left, right) => left - right);
    assert.deepEqual(supplement.sceneImages.map((scene) => scene.page), pages, supplement.id);
    assert.deepEqual(supplement.pageRange, { start: pages[0], end: pages.at(-1) }, supplement.id);
    for (const scene of supplement.sceneImages) {
      const locator = `${supplement.volume}:${scene.page}`;
      assert.ok(!occupiedPages.has(locator), locator);
      occupiedPages.add(locator);
      assertMangaPageReference(scene.src);
    }
  }

  for (const [id, pages] of expected) {
    assert.deepEqual(supplements.get(id)?.sceneImages.map((scene) => scene.page), pages, id);
  }

  const chapter271 = chapters.get("ch-271");
  assert.deepEqual(chapter271.pageRange, { start: 148, end: 169 });
  assert.ok(chapter271.sceneImages.every((scene) => scene.page <= 169));

  const supplementPages = pageIndex.filter((page) => page.supplementId);
  assert.equal(supplementPages.length, 122);
  for (const page of supplementPages) {
    assert.equal(page.chapterId, "", `${page.volume}巻 p.${page.page}`);
    assert.ok(supplements.get(page.supplementId)?.sceneImages.some((scene) => scene.page === page.page), `${page.supplementId} p.${page.page}`);
  }
  for (const page of pageIndex) {
    const contentEnd = volumeContent[String(page.volume)];
    if (page.page > contentEnd) {
      assert.equal(page.chapterId, "", `${page.volume}巻 p.${page.page}`);
      assert.equal(page.supplementId, "", `${page.volume}巻 p.${page.page}`);
    }
  }
});

test("story context is only shown when it names the linked technique or term", () => {
  for (const item of [...db.techniques, ...db.terms]) {
    const names = [item.name, ...(item.aliases || [])];
    for (const context of item.storyContexts) {
      assert.ok(names.some((name) => context.text.includes(name)), `${item.name}: ${context.text}`);
    }
  }
});

test("original LINE gallery links every product and serves its images as assets", () => {
  const html = readFileSync(new URL("../public/external/jujutsu_line_stickers.html", import.meta.url), "utf8");
  const productLinks = html.match(/https:\/\/store\.line\.me\/stickershop\/product\/\d+\/ja/g) ?? [];
  assert.equal(new Set(productLinks).size, 11);
  assert.equal(readdirSync(new URL("../public/external/jujutsu_line_stickers_assets/", import.meta.url)).length, 280);
  assert.ok(!html.includes("data:image/"));
  assert.ok(html.length < 100_000);
});
