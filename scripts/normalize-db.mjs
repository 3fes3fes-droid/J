import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const rawRoot = join(root, "data", "raw");
const outputRoot = join(root, "public", "data");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readGenerated = (name) => readJson(join(rawRoot, `${name}.json`));
const evidencePath = join(rawRoot, "comic-evidence.json");
const entityImageEvidencePath = join(rawRoot, "entity-image-evidence.json");
const unique = (values) => [...new Set(values.filter(Boolean))];
const uniqueText = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
};

const raw = {
  chapters: readGenerated("chapters"),
  characters: readGenerated("characters"),
  characterStatus: readGenerated("character-status"),
  techniques: readGenerated("techniques"),
  terms: readGenerated("terms"),
  volumes: readGenerated("volumes"),
  supplements: readGenerated("supplements"),
  endComments: readGenerated("end-comments"),
  volumeContent: readGenerated("volume-content"),
  sources: [],
  arcs: readJson(join(rawRoot, "arcs.json")),
  comicEvidence: existsSync(evidencePath) ? readJson(evidencePath) : { chapters: {} },
  entityImageEvidence: existsSync(entityImageEvidencePath)
    ? readJson(entityImageEvidencePath)
    : { techniques: {}, terms: {} },
  battleData: readGenerated("battles"),
};

const endCommentByChapter = new Map(
  (raw.endComments.comments || []).map((comment) => [comment.chapter, comment]),
);

const supplementPages = (supplement) => unique([
  ...(supplement.pages || []),
  ...(Number.isInteger(supplement.page_start) && Number.isInteger(supplement.page_end)
    ? Array.from(
      { length: supplement.page_end - supplement.page_start + 1 },
      (_, index) => supplement.page_start + index,
    )
    : []),
]).filter(Number.isInteger).sort((a, b) => a - b);

const pageRanges = (pages) => pages.reduce((ranges, page) => {
  const last = ranges.at(-1);
  if (last && page === last.end + 1) last.end = page;
  else ranges.push({ start: page, end: page });
  return ranges;
}, []);

const formatPageRanges = (ranges) => ranges
  .map((range) => range.start === range.end ? `p.${range.start}` : `p.${range.start}–${range.end}`)
  .join("・");

const supplementPagesByVolume = new Map();
for (const supplement of raw.supplements) {
  for (const page of supplementPages(supplement)) {
    if (!supplementPagesByVolume.has(supplement.volume)) supplementPagesByVolume.set(supplement.volume, new Set());
    supplementPagesByVolume.get(supplement.volume).add(page);
  }
}

const volumeContentEnd = new Map(
  Object.entries(raw.volumeContent).map(([volume, end]) => [Number(volume), Number(end)]),
);

const characterStatusByName = new Map(
  Object.entries(raw.characterStatus.records || {}),
);

const addToMapSet = (map, key, value) => {
  if (!key || !value) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
};

const characterIdsFromEntities = new Map();
const techniqueIdsFromEntities = new Map();
const termIdsFromEntities = new Map();
for (const character of raw.characters) {
  for (const chapterId of character.chapterIds || []) addToMapSet(characterIdsFromEntities, chapterId, character.id);
}
for (const technique of raw.techniques) {
  for (const chapterId of technique.chapterIds || []) addToMapSet(techniqueIdsFromEntities, chapterId, technique.id);
}
for (const term of raw.terms) {
  for (const chapterId of term.chapterIds || []) addToMapSet(termIdsFromEntities, chapterId, term.id);
}

const chapterIdsFromCharacters = new Map();
const chapterIdsFromTechniques = new Map();
const chapterIdsFromTerms = new Map();
for (const chapter of raw.chapters) {
  for (const id of chapter.characterIds || []) addToMapSet(chapterIdsFromCharacters, id, chapter.id);
  for (const id of chapter.techniqueIds || []) addToMapSet(chapterIdsFromTechniques, id, chapter.id);
  for (const id of chapter.termIds || []) addToMapSet(chapterIdsFromTerms, id, chapter.id);
}

for (const term of raw.terms) {
  for (const chapter of raw.chapters) {
    if (JSON.stringify(chapter).includes(term.name)) {
      addToMapSet(termIdsFromEntities, chapter.id, term.id);
      addToMapSet(chapterIdsFromTerms, term.id, chapter.id);
    }
  }
}

const techniqueChapterOverrides = new Map([
  ["朶頤光海", ["ch-102"]],
]);
const termChapterOverrides = new Map([
  ["フィジカルギフテッド", ["ch-073", "ch-074", "ch-149", "ch-150", "ch-198"]],
  ["京都府立呪術高等専門学校", ["ch-032", "ch-033", "ch-034"]],
  ["仮想怨霊", ["ch-073"]],
  ["呪力効率", ["ch-140"]],
  ["呪力総量", ["ch-140"]],
  ["必中必殺型領域", ["ch-164"]],
  ["懐玉・玉折", Array.from({ length: 15 }, (_, index) => `ch-${String(index + 65).padStart(3, "0")}`)],
  ["旧式領域", ["ch-164"]],
  ["特別一級術師", ["ch-138"]],
]);

for (const technique of raw.techniques) {
  for (const chapterId of techniqueChapterOverrides.get(technique.name) || []) {
    addToMapSet(chapterIdsFromTechniques, technique.id, chapterId);
    addToMapSet(techniqueIdsFromEntities, chapterId, technique.id);
  }
}
for (const term of raw.terms) {
  for (const chapterId of termChapterOverrides.get(term.name) || []) {
    addToMapSet(chapterIdsFromTerms, term.id, chapterId);
    addToMapSet(termIdsFromEntities, chapterId, term.id);
  }
}

const fromMapSet = (map, key) => [...(map.get(key) || [])];
const chapterById = new Map(raw.chapters.map((chapter) => [chapter.id, chapter]));
const chapterIndexById = new Map(raw.chapters.map((chapter, index) => [chapter.id, index]));
const splitSentences = (text) => String(text || "")
  .split(/(?<=。)/)
  .map((sentence) => sentence.trim())
  .filter(Boolean);
const normalizeNeedle = (text) => String(text || "").replace(/\s+/g, "").trim();
const compactChapterLabel = (label) => String(label || "")
  .replace(/第([0-9０-９]+)話/g, "$1")
  .replace(/\s+/g, " ")
  .trim();
const textImportance = (text) => {
  const value = String(text || "");
  let score = 1;
  if (/(死亡|死ぬ|倒す|撃破|勝利|敗北|覚醒|領域|受肉|成仏|解呪|発動|黒閃|処刑|復活|救う|守る|奪う|斬る|殺す|判明|正体|決着)/.test(value)) score += 2;
  if (/(決める|選ぶ|告げる|明かす|頼む|誓う|謝る|感謝|再会|別れ)/.test(value)) score += 1;
  return score;
};
const evidencePages = (chapterId, group, entityId) => {
  const chapter = chapterById.get(chapterId);
  if (!chapter) return [];
  const range = verifiedChapterRange(chapter);
  return unique(
    raw.comicEvidence?.chapters?.[chapterId]?.[group]?.[entityId] || [],
  ).filter((page) => Number.isInteger(page) && page >= range.start && page <= range.end);
};
const contextCandidates = (chapter) => uniqueText([
  ...(chapter.events || []),
  ...(chapter.detailedEvents || []).map((item) => item.text),
  ...splitSentences(chapter.summaryFull),
]);

const buildStoryContexts = ({ chapterIds, names, entityGroup, entityId, limit = 12 }) => unique(chapterIds)
  .map((chapterId) => chapterById.get(chapterId))
  .filter(Boolean)
  .flatMap((chapter) => {
    const needles = unique(names.map(normalizeNeedle)).filter((name) => name.length >= 2);
    const matches = contextCandidates(chapter)
      .filter((text) => needles.some((name) => normalizeNeedle(text).includes(name)))
      .sort((a, b) => textImportance(b) - textImportance(a) || b.length - a.length);
    const text = matches[0] || "";
    return text ? [{
      chapterId: chapter.id,
      label: compactChapterLabel(chapter.label),
      title: chapter.title,
      text,
      pages: evidencePages(chapter.id, entityGroup, entityId),
    }] : [];
  })
  .filter((item, index, array) => array.findIndex((other) => other.text === item.text && other.chapterId === item.chapterId) === index)
  .sort((a, b) => (chapterIndexById.get(a.chapterId) || 0) - (chapterIndexById.get(b.chapterId) || 0))
  .slice(0, limit);

const characterNeedles = (character) => {
  const name = [...normalizeNeedle(character.name)];
  const variants = [character.name, ...(character.aliases || [])];
  if (name.length >= 3) variants.push(name.slice(0, 2).join(""));
  if (name.length >= 4) variants.push(name.slice(-2).join(""));
  return unique(variants.map(normalizeNeedle)).filter((value) => value.length >= 2);
};

const buildCharacterHighlights = (character, chapterIds) => {
  const meaningfulExisting = (character.highlights || [])
    .filter((highlight) => highlight.kind !== "keyword")
    .map((highlight) => ({
      chapterId: highlight.chapterId,
      kind: highlight.kind || "highlight",
      label: highlight.label || "印象的な場面",
      text: highlight.text || "",
      speaker: highlight.speaker || "",
      importance: highlight.kind === "quote" || highlight.kind === "line-gist" ? 5 : textImportance(highlight.text),
      pages: evidencePages(highlight.chapterId, "characters", character.id),
    }))
    .filter((highlight) => highlight.text);

  const needles = characterNeedles(character);
  const generated = unique(chapterIds)
    .map((chapterId) => chapterById.get(chapterId))
    .filter(Boolean)
    .flatMap((chapter) => {
      const matches = contextCandidates(chapter)
        .filter((text) => needles.some((needle) => normalizeNeedle(text).includes(needle)))
        .sort((a, b) => textImportance(b) - textImportance(a) || b.length - a.length);
      if (!matches[0]) return [];
      return [{
        chapterId: chapter.id,
        arcId: chapter.arcId || "other",
        kind: "action",
        label: "役割・転機",
        text: matches[0],
        speaker: "",
        importance: textImportance(matches[0]),
        pages: evidencePages(chapter.id, "characters", character.id),
      }];
    });

  const generatedByArc = new Map();
  for (const highlight of generated) {
    if (!generatedByArc.has(highlight.arcId)) generatedByArc.set(highlight.arcId, []);
    generatedByArc.get(highlight.arcId).push(highlight);
  }
  const selectedGenerated = [...generatedByArc.values()].flatMap((items) => items
    .sort((a, b) => b.importance - a.importance
      || (chapterIndexById.get(a.chapterId) || 0) - (chapterIndexById.get(b.chapterId) || 0))
    .slice(0, 2));

  return [...meaningfulExisting, ...selectedGenerated]
    .filter((item, index, array) => array.findIndex((other) => other.chapterId === item.chapterId && other.text === item.text) === index)
    .sort((a, b) => (chapterIndexById.get(a.chapterId) || 0) - (chapterIndexById.get(b.chapterId) || 0)
      || b.importance - a.importance)
    .map((highlight) => ({
      chapterId: highlight.chapterId,
      kind: highlight.kind,
      label: highlight.label,
      text: highlight.text,
      speaker: highlight.speaker,
      importance: highlight.importance,
      pages: highlight.pages,
    }));
};

const characterGroup = (category = "") => {
  if (/(呪霊|式神|受肉体|呪物)/.test(category)) return "呪霊・式神・呪物";
  if (/(術師|学生|教員|補助監督|窓|一般人|呪詛師)/.test(category)) return "人物";
  return "その他";
};

const rankAppliesToCharacter = (category = "") => /(術師|呪詛師|呪霊|泳者|受肉|術師候補)/.test(category);
const defaultCharacterGrade = (character) => {
  if (!rankAppliesToCharacter(character.category)) {
    return { label: "等級対象外", note: "", kind: "not-applicable" };
  }
  if (/呪霊/.test(character.category)) {
    return { label: "等級不明", note: "", kind: "unknown" };
  }
  return { label: "公式等級なし", note: "", kind: "unregistered" };
};

const buildCharacterStatus = (character) => {
  const source = characterStatusByName.get(character.name) || {};
  const fallback = defaultCharacterGrade(character);
  const label = source.grade || fallback.label;
  const kind = source.grade
    ? (/公式等級なし|術師等級なし/.test(label) ? "unregistered" : "official")
    : fallback.kind;
  const growthApplies = rankAppliesToCharacter(character.category);
  return {
    grade: {
      label,
      note: source.gradeNote || "",
      kind,
    },
    growth: {
      status: source.growthStatus || (growthApplies ? "明確な成長描写なし" : "対象外"),
      summary: source.growthSummary || "",
    },
  };
};

const techniqueGroup = (category = "") => {
  if (/領域/.test(category)) return "領域・結界";
  if (/(術式|虚式|呪法|呪力)/.test(category)) return "術式・呪力";
  if (/(呪具|武器)/.test(category)) return "呪具・武器";
  if (/(体術|打撃|剣術)/.test(category)) return "体術・戦闘";
  return "その他";
};

const termGroup = (category = "") => {
  if (/(領域|結界)/.test(category)) return "領域・結界";
  if (/(術式|呪力|術式体系|呪力操作)/.test(category)) return "術式・呪力";
  if (/(組織|制度|階級|学校)/.test(category)) return "組織・制度";
  if (/(事件|章|死滅回游)/.test(category)) return "事件・章";
  if (/(存在|呪物|式神|呪霊)/.test(category)) return "存在・呪物";
  return "その他";
};

const combatPattern = /(戦|攻撃|撃破|決着|勝利|敗北|祓|領域|術式|呪力|斬|殴|発動|顕現|召喚|黒閃|必中|無量空処|伏魔御厨子|自閉円頓裹)/;

const pageImageUrl = (volume, page) => {
  if (!Number.isInteger(page)) return "";
  const volumeKey = String(volume).padStart(2, "0");
  return `/media/pages/${volumeKey}/${volumeKey}-${String(page).padStart(3, "0")}.webp`;
};

const chaptersByVolumeForRanges = new Map();
for (const chapter of raw.chapters) {
  if (!chaptersByVolumeForRanges.has(chapter.volume)) chaptersByVolumeForRanges.set(chapter.volume, []);
  chaptersByVolumeForRanges.get(chapter.volume).push(chapter);
}
for (const volumeChapters of chaptersByVolumeForRanges.values()) {
  volumeChapters.sort((a, b) => a.startPage - b.startPage);
}

const verifiedChapterRange = (chapter) => {
  const volumeChapters = chaptersByVolumeForRanges.get(chapter.volume) || [];
  const index = volumeChapters.findIndex((item) => item.id === chapter.id);
  const next = volumeChapters[index + 1];
  const boundary = next
    ? next.startPage - 1
    : volumeContentEnd.get(chapter.volume) || chapter.startPage;
  const firstSupplement = [...(supplementPagesByVolume.get(chapter.volume) || [])]
    .filter((page) => page >= chapter.startPage && page <= boundary)
    .sort((a, b) => a - b)[0];
  return {
    start: chapter.startPage,
    end: Math.max(chapter.startPage, firstSupplement ? firstSupplement - 1 : boundary),
  };
};

const chapters = raw.chapters.map((chapter) => {
  const events = uniqueText(chapter.events || []);
  const combatEvents = events.filter((event) => combatPattern.test(event));
  const storyEvents = events.filter((event) => !combatPattern.test(event));
  const quoteGists = (chapter.popularLineGists || []).map((quote) => ({
    speaker: quote.speaker || "",
    label: quote.label || "言葉の要旨",
    text: quote.text || "",
  })).filter((quote) => quote.text);
  const range = verifiedChapterRange(chapter);
  const finalScenePages = Array.from(
    { length: range.end - range.start + 1 },
    (_, index) => range.start + index,
  );
  const endComment = Number.isInteger(chapter.number)
    ? endCommentByChapter.get(chapter.number) || null
    : null;

  return {
    id: chapter.id,
    label: compactChapterLabel(chapter.label),
    number: chapter.number,
    zeroNumber: chapter.zeroNumber,
    volume: chapter.volume,
    title: chapter.title,
    arcId: chapter.arcId,
    startPage: chapter.startPage,
    summary: chapter.summaryFull,
    lead: "",
    digest: (chapter.chapterDigest || []).map((item) => ({
      label: item.label || "場面",
      text: item.text || "",
    })).filter((item) => item.text),
    beats: events.map((text) => ({
      type: combatPattern.test(text) ? "battle" : "event",
      text,
    })),
    storyEvents,
    combatEvents,
    characterIds: unique([...(chapter.characterIds || []), ...fromMapSet(characterIdsFromEntities, chapter.id)]),
    techniqueIds: unique([...(chapter.techniqueIds || []), ...fromMapSet(techniqueIdsFromEntities, chapter.id)]),
    termIds: unique([...(chapter.termIds || []), ...fromMapSet(termIdsFromEntities, chapter.id)]),
    battleIds: [],
    quoteGists,
    endComment: endComment ? {
      text: endComment.text,
      releaseDate: endComment.releaseDate,
      issue: endComment.issue,
      placement: endComment.placement,
    } : null,
    keywords: uniqueText(chapter.highlightKeywords || []).slice(0, 16),
    imageUrl: pageImageUrl(chapter.volume, finalScenePages[0]),
    sceneImages: finalScenePages.map((page) => ({
      page,
      src: pageImageUrl(chapter.volume, page),
    })),
    pageRange: range,
    pageUrl: "",
    sourceLocator: `${chapter.volume}巻 p.${range.start}–${range.end}`,
    sourceIds: [],
  };
});

const compactName = (value) => String(value || "")
  .normalize("NFKC")
  .replace(/[\s・「」『』（）()【】]/g, "")
  .toLowerCase();

const genericRelationNames = new Set([
  "術式", "領域", "結界", "呪力", "呪い", "呪霊", "呪具", "式神", "縛り", "必中",
]);

const isLinkableName = (name, minimumLength = 3) => {
  const compact = compactName(name);
  return compact.length >= minimumLength && !genericRelationNames.has(compact);
};

const textMentions = (text, names, minimumLength = 3) => {
  const compactText = compactName(text);
  return names.some((name) => isLinkableName(name, minimumLength) && compactText.includes(compactName(name)));
};

const characterIdsByName = new Map();
for (const character of raw.characters) {
  if (compactName(character.name)) characterIdsByName.set(compactName(character.name), character.id);
  for (const name of character.aliases || []) {
    if (compactName(name).length >= 2) characterIdsByName.set(compactName(name), character.id);
  }
}

const resolveCharacterId = (name, locator) => {
  const characterId = characterIdsByName.get(compactName(name));
  if (!characterId) throw new Error(`Unknown character in ${locator}: ${name}`);
  return characterId;
};

const battleIdsByCharacter = new Map();
const battleIdsByChapter = new Map();
const battles = (raw.battleData.battles || []).map((battle) => {
  const chapterIds = unique(battle.chapterIds || []);
  for (const chapterId of chapterIds) {
    if (!chapterById.has(chapterId)) throw new Error(`Unknown chapter in battle ${battle.id}: ${chapterId}`);
    addToMapSet(battleIdsByChapter, chapterId, battle.id);
  }
  const sides = (battle.sides || []).map((side, sideIndex) => {
    const characterIds = unique((side.characterNames || []).map((name) => (
      resolveCharacterId(name, `battle ${battle.id} side ${sideIndex + 1}`)
    )));
    for (const characterId of characterIds) addToMapSet(battleIdsByCharacter, characterId, battle.id);
    return {
      characterIds,
      result: side.result || "決着なし",
    };
  });
  if (sides.length < 2) throw new Error(`Battle requires at least two sides: ${battle.id}`);
  return {
    id: battle.id,
    title: battle.title,
    summary: battle.summary || "",
    chapterIds,
    sides,
    sourceIds: [],
  };
});

const deaths = (raw.battleData.deaths || []).map((death) => {
  if (!chapterById.has(death.chapterId)) throw new Error(`Unknown chapter in death ${death.id}: ${death.chapterId}`);
  return {
    id: death.id,
    characterId: resolveCharacterId(death.characterName, `death ${death.id}`),
    killerIds: unique((death.killerNames || []).map((name) => resolveCharacterId(name, `death ${death.id}`))),
    killerLabel: death.killerLabel || "",
    chapterId: death.chapterId,
    kind: death.kind || "死亡",
    summary: death.summary || "",
    sourceIds: [],
  };
});

for (const chapter of chapters) chapter.battleIds = fromMapSet(battleIdsByChapter, chapter.id);

const techniqueIdsByCharacter = new Map();
for (const technique of raw.techniques) {
  for (const ref of technique.userRefs || []) addToMapSet(techniqueIdsByCharacter, ref.characterId, technique.id);
  for (const user of technique.users || []) {
    const characterId = characterIdsByName.get(compactName(user));
    if (characterId) addToMapSet(techniqueIdsByCharacter, characterId, technique.id);
  }
}

const techniqueByName = new Map(raw.techniques.map((technique) => [technique.name, technique]));
const relatedTechniqueIds = new Map();
const linkTechniques = (leftName, rightName) => {
  const left = techniqueByName.get(leftName);
  const right = techniqueByName.get(rightName);
  if (!left || !right || left.id === right.id) return;
  addToMapSet(relatedTechniqueIds, left.id, right.id);
  addToMapSet(relatedTechniqueIds, right.id, left.id);
};

const techniqueFamilies = [
  ["無下限呪術", ["200％虚式「茈」", "無量空処", "虚式「茈」", "術式反転「赫」", "術式順転「蒼」", "無限"]],
  ["十種影法術", ["八握剣異戒神将魔虚羅", "円鹿", "大蛇", "嵌合暗翳庭", "嵌合獣 顎吐", "満象", "玉犬", "玉犬「渾」", "脱兎", "蝦蟇", "貫牛", "鵺", "不知井底"]],
  ["赤血操術", ["朽", "百斂", "穿血", "翅王", "苅祓", "血刃", "血星磊", "赤鱗躍動", "赤鱗躍動・載", "超新星", "赤縛"]],
  ["不義遊戯", ["不義遊戯 改", "共振器式不義遊戯"]],
  ["芻霊呪法", ["共鳴り", "簪"]],
  ["呪霊操術", ["極ノ番「うずまき」"]],
  ["無為転変", ["改造人間", "多重魂", "多重魂「撥体」", "幾魂異性体", "遍殺即霊体", "自閉円頓裹"]],
];
for (const [rootName, memberNames] of techniqueFamilies) {
  for (const memberName of memberNames) linkTechniques(rootName, memberName);
}

for (const technique of raw.techniques) {
  for (const candidate of raw.techniques) {
    if (technique.id === candidate.id) continue;
    const candidateNames = [candidate.name, ...(candidate.aliases || [])];
    const describedDirectly = textMentions(technique.description, candidateNames, 3);
    const nestedName = isLinkableName(candidate.name, 3)
      && compactName(technique.name).includes(compactName(candidate.name));
    if (describedDirectly || nestedName) linkTechniques(technique.name, candidate.name);
  }
}

const relationIdsForTerm = (term) => {
  const characterIds = raw.characters
    .filter((character) => textMentions(term.definition, [character.name, ...(character.aliases || [])], 2))
    .map((character) => character.id);
  const techniqueIds = raw.techniques
    .filter((technique) => textMentions(term.definition, [technique.name, ...(technique.aliases || [])], 3))
    .map((technique) => technique.id);
  const relatedTermIds = raw.terms
    .filter((candidate) => candidate.id !== term.id && textMentions(term.definition, [candidate.name], 3))
    .map((candidate) => candidate.id);
  return {
    characterIds: unique(characterIds).slice(0, 12),
    techniqueIds: unique(techniqueIds).slice(0, 12),
    relatedTermIds: unique(relatedTermIds).slice(0, 12),
  };
};

const characters = raw.characters.map((character) => {
  const status = buildCharacterStatus(character);
  const chapterIds = unique([...(character.chapterIds || []), ...fromMapSet(chapterIdsFromCharacters, character.id)]);
  const highlights = buildCharacterHighlights(character, chapterIds);
  return {
    id: character.id,
    name: character.name,
    aliases: unique(character.aliases || []),
    category: character.category || "未分類",
    group: characterGroup(character.category),
    affiliation: character.affiliation || "",
    profile: character.profile,
    grade: status.grade,
    growth: status.growth,
    techniqueIds: fromMapSet(techniqueIdsByCharacter, character.id),
    battleIds: fromMapSet(battleIdsByCharacter, character.id),
    chapterIds,
    highlights,
    imageUrl: character.media?.imageUrl || "",
    pageUrl: character.media?.pageUrl || "",
    sourceIds: [],
  };
});

const techniques = raw.techniques.map((technique) => ({
  id: technique.id,
  name: technique.name,
  reading: technique.reading || "",
  category: technique.category || "未分類",
  group: techniqueGroup(technique.category),
  aliases: unique(technique.aliases || []),
  description: technique.description,
  storyContexts: buildStoryContexts({
    chapterIds: unique([...(technique.chapterIds || []), ...fromMapSet(chapterIdsFromTechniques, technique.id)]),
    names: [technique.name, ...(technique.aliases || [])],
    entityGroup: "techniques",
    entityId: technique.id,
  }),
  relatedTechniqueIds: fromMapSet(relatedTechniqueIds, technique.id).slice(0, 16),
  users: unique(technique.users || []),
  userRefs: (technique.userRefs || []).filter((ref) => ref.characterId),
  chapterIds: unique([...(technique.chapterIds || []), ...fromMapSet(chapterIdsFromTechniques, technique.id)]),
  activationStarts: (technique.activationStarts || []).map((item) => ({
    chapterId: item.chapterId || "",
    count: item.count || 1,
    status: item.status || "activated",
    note: item.note || "",
  })),
  activationAttempts: (technique.activationAttempts || []).map((item) => ({
    chapterId: item.chapterId || "",
    count: item.count || 1,
    status: item.status || "attempted",
    note: item.note || "",
  })),
  imageUrl: raw.entityImageEvidence.techniques?.[technique.id]?.[0]?.src || "",
  sceneImages: raw.entityImageEvidence.techniques?.[technique.id] || [],
  sourceIds: [],
}));

const terms = raw.terms.map((term) => {
  const chapterIds = unique([
    ...(term.chapterIds || []),
    ...fromMapSet(chapterIdsFromTerms, term.id),
  ]);
  const relations = relationIdsForTerm(term);
  return {
    id: term.id,
    name: term.name,
    category: term.category || "未分類",
    group: termGroup(term.category),
    definition: term.definition,
    storyContexts: buildStoryContexts({
      chapterIds,
      names: [term.name],
      entityGroup: "terms",
      entityId: term.id,
    }),
    characterIds: relations.characterIds,
    techniqueIds: relations.techniqueIds,
    relatedTermIds: relations.relatedTermIds,
    chapterIds,
    imageUrl: raw.entityImageEvidence.terms?.[term.id]?.[0]?.src || "",
    sceneImages: raw.entityImageEvidence.terms?.[term.id] || [],
    sourceIds: [],
  };
});

const rawSupplementsByVolume = new Map();
for (const supplement of raw.supplements) {
  if (!rawSupplementsByVolume.has(supplement.volume)) rawSupplementsByVolume.set(supplement.volume, []);
  rawSupplementsByVolume.get(supplement.volume).push(supplement);
}

const volumes = raw.volumes.map((volume) => ({
  id: volume.id,
  number: volume.number,
  label: volume.label,
  title: volume.title,
  synopsis: volume.synopsis,
  imageUrl: `/media/covers/${String(volume.number).padStart(2, "0")}.webp`,
  pageUrl: "",
  chapters: (volume.chapters || []).map((chapter) => ({
    ...chapter,
    label: compactChapterLabel(chapter.label),
  })),
  supplements: (rawSupplementsByVolume.get(volume.number) || []).map((supplement) => {
    return {
      id: supplement.id,
      title: supplement.title,
      imageUrl: pageImageUrl(supplement.volume, supplement.thumbnail_page || supplementPages(supplement)[0]),
    };
  }),
  sourceIds: [],
}));

const supplements = raw.supplements.map((supplement) => {
  const pages = supplementPages(supplement);
  const ranges = pageRanges(pages);
  return {
    id: supplement.id,
    title: supplement.title,
    kind: supplement.kind,
    volume: supplement.volume,
    summary: supplement.summary,
    characterIds: unique(supplement.character_ids || []),
    techniqueIds: unique(supplement.technique_ids || []),
    termIds: unique(supplement.term_ids || []),
    pageRange: {
      start: pages[0],
      end: pages.at(-1),
    },
    pageRanges: ranges,
    pageLabel: formatPageRanges(ranges),
    imageUrl: pageImageUrl(supplement.volume, supplement.thumbnail_page || pages[0]),
    sceneImages: pages.map((page) => ({
      page,
      src: pageImageUrl(supplement.volume, page),
    })),
    sourceIds: [],
  };
});

const supplementIdsByCharacter = new Map();
const supplementIdsByTechnique = new Map();
const supplementIdsByTerm = new Map();
for (const supplement of supplements) {
  for (const id of supplement.characterIds) addToMapSet(supplementIdsByCharacter, id, supplement.id);
  for (const id of supplement.techniqueIds) addToMapSet(supplementIdsByTechnique, id, supplement.id);
  for (const id of supplement.termIds) addToMapSet(supplementIdsByTerm, id, supplement.id);
}
for (const character of characters) character.supplementIds = fromMapSet(supplementIdsByCharacter, character.id);
for (const technique of techniques) technique.supplementIds = fromMapSet(supplementIdsByTechnique, technique.id);
for (const term of terms) term.supplementIds = fromMapSet(supplementIdsByTerm, term.id);

const supplementById = new Map(supplements.map((supplement) => [supplement.id, supplement]));
const withSupplementScenes = (record) => {
  const supplementalScenes = (record.supplementIds || []).flatMap((supplementId) => {
    const supplement = supplementById.get(supplementId);
    if (!supplement) return [];
    return supplement.sceneImages.slice(0, 2).map((scene) => ({
      chapterId: "",
      supplementId,
      volume: supplement.volume,
      page: scene.page,
      src: scene.src,
      matchKind: "visual-confirmed",
      matchedText: supplement.title,
    }));
  });
  const sceneImages = [...record.sceneImages, ...supplementalScenes]
    .filter((scene, index, scenes) => scenes.findIndex((other) => other.src === scene.src) === index)
    .slice(0, 12);
  return {
    ...record,
    imageUrl: sceneImages[0]?.src || "",
    sceneImages,
  };
};

for (const [index, technique] of techniques.entries()) techniques[index] = withSupplementScenes(technique);
for (const [index, term] of terms.entries()) terms[index] = withSupplementScenes(term);

const sources = [];

const groups = { chapters, volumes, characters, techniques, terms, supplements, battles, deaths };
const coverage = Object.fromEntries(Object.entries(groups).map(([name, records]) => [
  name,
  {
    total: records.length,
    withSources: records.filter((record) => record.sourceIds?.length).length,
  },
]));

const database = {
  meta: {
    title: "呪術廻戦",
    subtitle: "",
    updated: "2026-08-13",
    counts: Object.fromEntries(Object.entries(groups).map(([name, records]) => [name, records.length])),
    pages: raw.comicEvidence?.scan?.indexedPages || 0,
    coverage,
    sourceIds: [],
  },
  arcs: raw.arcs,
  sources,
  chapters,
  volumes,
  characters,
  techniques,
  terms,
  supplements,
  battles,
  deaths,
};

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "db.json"), JSON.stringify(database));

const pageIndexPath = join(outputRoot, "page-index.json");
if (existsSync(pageIndexPath)) {
  const supplementByPage = new Map();
  for (const supplement of supplements) {
    for (const scene of supplement.sceneImages) supplementByPage.set(`${supplement.volume}:${scene.page}`, supplement.id);
  }
  const chapterRangeById = new Map(chapters.map((chapter) => [chapter.id, chapter.pageRange]));
  const pageIndex = readJson(pageIndexPath).map((page) => {
    const supplementId = supplementByPage.get(`${page.volume}:${page.page}`) || "";
    const range = chapterRangeById.get(page.chapterId);
    const inChapterRange = range && page.page >= range.start && page.page <= range.end;
    return {
      ...page,
      chapterId: supplementId || !inChapterRange ? "" : page.chapterId,
      supplementId,
    };
  });
  writeFileSync(pageIndexPath, JSON.stringify(pageIndex));
}
console.log(JSON.stringify({
  output: join(outputRoot, "db.json"),
  bytes: Buffer.byteLength(JSON.stringify(database)),
  counts: database.meta.counts,
  coverage,
}, null, 2));
