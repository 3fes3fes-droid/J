export type SectionKey =
  | "chapters"
  | "volumes"
  | "characters"
  | "techniques"
  | "terms"
  | "supplements"
  | "sources";

export type RecordKind = Exclude<SectionKey, "sources"> | "source";

export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string;
  type: string;
  tier: "official" | "reference";
  mediaScope: string;
  usableFor: string[];
  limitations: string[];
}

export interface ArcRecord {
  id: string;
  name: string;
  start: string | number;
  end: string | number;
  status: string;
  overview: string;
}

export interface ChapterRecord {
  id: string;
  label: string;
  number: number | null;
  zeroNumber: number | null;
  volume: number;
  title: string;
  arcId: string;
  startPage: number | null;
  summary: string;
  lead: string;
  digest: Array<{ label: string; text: string }>;
  beats: Array<{ type: "event" | "battle"; text: string }>;
  storyEvents: string[];
  combatEvents: string[];
  characterIds: string[];
  techniqueIds: string[];
  termIds: string[];
  battleIds: string[];
  quoteGists: Array<{ speaker: string; label: string; text: string }>;
  endComment: {
    text: string;
    releaseDate: string;
    issue: string;
    placement: number;
  } | null;
  keywords: string[];
  imageUrl: string;
  sceneImages: Array<{ page: number; src: string }>;
  pageRange: { start: number; end: number };
  pageUrl: string;
  sourceLocator: string;
  sourceIds: string[];
}

export interface CharacterHighlight {
  chapterId: string;
  kind: string;
  label: string;
  text: string;
  speaker: string;
  importance: number;
  pages: number[];
}

export interface StoryContext {
  chapterId: string;
  label: string;
  title: string;
  text: string;
  pages: number[];
}

export interface EntitySceneImage {
  chapterId: string;
  supplementId?: string;
  volume: number;
  page: number;
  src: string;
  matchKind: "exact-label" | "fuzzy-label" | "context-text" | "visual-confirmed";
  matchedText: string;
}

export interface CharacterRecord {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  group: string;
  affiliation: string;
  profile: string;
  grade: {
    label: string;
    note: string;
    kind: "official" | "unregistered" | "unknown" | "not-applicable";
  };
  growth: {
    status: string;
    summary: string;
  };
  techniqueIds: string[];
  battleIds: string[];
  chapterIds: string[];
  highlights: CharacterHighlight[];
  supplementIds: string[];
  imageUrl: string;
  pageUrl: string;
  sourceIds: string[];
}

export interface BattleSide {
  characterIds: string[];
  result: string;
}

export interface BattleRecord {
  id: string;
  title: string;
  summary: string;
  chapterIds: string[];
  sides: BattleSide[];
  sourceIds: string[];
}

export interface DeathRecord {
  id: string;
  characterId: string;
  killerIds: string[];
  killerLabel: string;
  chapterId: string;
  kind: string;
  summary: string;
  sourceIds: string[];
}

export interface TechniqueRecord {
  id: string;
  name: string;
  reading: string;
  category: string;
  group: string;
  aliases: string[];
  description: string;
  storyContexts: StoryContext[];
  relatedTechniqueIds: string[];
  users: string[];
  userRefs: Array<{ name: string; characterId: string }>;
  chapterIds: string[];
  activationStarts: Array<{ chapterId: string; count: number; status: string; note: string }>;
  activationAttempts: Array<{ chapterId: string; count: number; status: string; note: string }>;
  imageUrl: string;
  sceneImages: EntitySceneImage[];
  supplementIds: string[];
  sourceIds: string[];
}

export interface TermRecord {
  id: string;
  name: string;
  category: string;
  group: string;
  definition: string;
  storyContexts: StoryContext[];
  characterIds: string[];
  techniqueIds: string[];
  relatedTermIds: string[];
  chapterIds: string[];
  imageUrl: string;
  sceneImages: EntitySceneImage[];
  supplementIds: string[];
  sourceIds: string[];
}

export interface VolumeChapter {
  id: string;
  label: string;
  title: string;
  startPage: number | null;
}

export interface VolumeRecord {
  id: string;
  number: number;
  label: string;
  title: string;
  synopsis: string;
  imageUrl: string;
  pageUrl: string;
  chapters: VolumeChapter[];
  supplements: Array<{ id: string; title: string; imageUrl: string }>;
  sourceIds: string[];
}

export interface SupplementRecord {
  id: string;
  title: string;
  kind: string;
  volume: number;
  summary: string;
  characterIds: string[];
  techniqueIds: string[];
  termIds: string[];
  pageRange: { start: number; end: number };
  pageRanges: Array<{ start: number; end: number }>;
  pageLabel: string;
  imageUrl: string;
  sceneImages: Array<{ page: number; src: string }>;
  sourceIds: string[];
}

export interface Database {
  meta: {
    title: string;
    subtitle: string;
    updated: string;
    counts: Record<string, number>;
    pages: number;
    coverage: Record<string, { total: number; withSources: number }>;
    sourceIds: string[];
  };
  arcs: ArcRecord[];
  sources: SourceRecord[];
  chapters: ChapterRecord[];
  volumes: VolumeRecord[];
  characters: CharacterRecord[];
  techniques: TechniqueRecord[];
  terms: TermRecord[];
  supplements: SupplementRecord[];
  battles: BattleRecord[];
  deaths: DeathRecord[];
}
