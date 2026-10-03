"use client";

import { imageSources, publicAsset } from "./pages-assets.mjs";

import {
  ArrowDownAZ,
  BookMarked,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  ImageIcon,
  Info,
  Library,
  Link2,
  MessageCircle,
  Quote,
  Search,
  Shuffle,
  Skull,
  Sparkles,
  Swords,
  Tags,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BattleRecord,
  ChapterRecord,
  CharacterRecord,
  Database,
  DeathRecord,
  EntitySceneImage,
  SectionKey,
  SourceRecord,
  StoryContext,
  SupplementRecord,
  TechniqueRecord,
  TermRecord,
  VolumeRecord,
} from "./types";

const CHAPTER_IMAGE_SEED_KEY = "jujutsu-db-chapter-image-seed";

type Selected = { section: SectionKey; id: string } | null;
type ViewKey = SectionKey | "line-stamps";
type OpenRecord = (section: SectionKey, id: string) => void;
type PageHit = { file: string; volume: number; page: number; chapterId: string; supplementId?: string; text: string };
type EntityCardItem =
  | { id: string; section: "techniques"; record: TechniqueRecord }
  | { id: string; section: "terms"; record: TermRecord };

const NAV_ITEMS: Array<{ key: SectionKey; label: string; icon: LucideIcon }> = [
  { key: "chapters", label: "各話", icon: Swords },
  { key: "volumes", label: "コミックス", icon: BookMarked },
  { key: "characters", label: "人物", icon: UsersRound },
  { key: "techniques", label: "用語・技・術式", icon: Sparkles },
  { key: "supplements", label: "巻末・描き下ろし", icon: FileText },
];

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string) {
  return normalizeText(value).replace(/[\s・「」『』（）()【】〈〉《》―ー…!?！？。、,.\-]/g, "");
}

function includesQuery(query: string, ...values: Array<string | string[] | undefined>) {
  if (!query) return true;
  const haystack = normalizeText(
    values.flatMap((value) => (Array.isArray(value) ? value : [value || ""])).join(" "),
  );
  return haystack.includes(query);
}

function shuffled<T>(items: T[], seed: number) {
  const copy = [...items];
  let state = seed || 1;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chapterCardImage(chapter: ChapterRecord, seed: number) {
  if (!chapter.sceneImages.length) return chapter.imageUrl;
  let hash = 2166136261;
  for (let index = 0; index < chapter.id.length; index += 1) {
    hash ^= chapter.id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const imageIndex = ((hash >>> 0) + (seed >>> 0)) % chapter.sceneImages.length;
  return chapter.sceneImages[imageIndex]?.src || chapter.imageUrl;
}

function entitySceneKey(section: "techniques" | "terms", id: string) {
  return `${section}:${id}`;
}

function buildUniqueEntitySceneMap(
  techniques: TechniqueRecord[],
  terms: TermRecord[],
  chapters: ChapterRecord[],
  supplements: SupplementRecord[],
) {
  const entries = [
    ...techniques.map((item) => ({ key: entitySceneKey("techniques", item.id), scenes: item.sceneImages })),
    ...terms.map((item) => ({ key: entitySceneKey("terms", item.id), scenes: item.sceneImages })),
  ].sort((left, right) => left.scenes.length - right.scenes.length || left.key.localeCompare(right.key, "ja"));
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const supplementById = new Map(supplements.map((supplement) => [supplement.id, supplement]));
  const selected = new Map<string, EntitySceneImage>();
  const usedSources = new Set<string>();
  const pending: typeof entries = [];

  for (const entry of entries) {
    const scene = entry.scenes.find((candidate) => !usedSources.has(candidate.src));
    if (!scene) {
      pending.push(entry);
      continue;
    }
    selected.set(entry.key, scene);
    usedSources.add(scene.src);
  }

  for (const entry of pending) {
    const anchor = entry.scenes[0];
    if (!anchor) continue;
    const volumeKey = String(anchor.volume).padStart(2, "0");
    let replacement: EntitySceneImage | undefined;

    for (const sceneAnchor of entry.scenes) {
      const nearbyPages = sceneAnchor.supplementId
        ? supplementById.get(sceneAnchor.supplementId)?.sceneImages
        : chapterById.get(sceneAnchor.chapterId)?.sceneImages;
      const nearby = [...(nearbyPages || [])].sort(
        (left, right) => Math.abs(left.page - sceneAnchor.page) - Math.abs(right.page - sceneAnchor.page),
      );
      const candidate = nearby.find((scene) => !usedSources.has(scene.src));
      if (!candidate) continue;
      replacement = {
        ...sceneAnchor,
        page: candidate.page,
        src: candidate.src,
        matchKind: "visual-confirmed",
        matchedText: "",
      };
      break;
    }

    for (let distance = 1; distance < 198 && !replacement; distance += 1) {
      for (const page of [anchor.page - distance, anchor.page + distance]) {
        if (page < 1 || page > 198) continue;
        const src = `/media/pages/${volumeKey}/${volumeKey}-${String(page).padStart(3, "0")}.webp`;
        if (usedSources.has(src)) continue;
        replacement = {
          ...anchor,
          page,
          src,
          matchKind: "visual-confirmed",
          matchedText: "",
        };
        break;
      }
    }

    if (replacement) {
      selected.set(entry.key, replacement);
      usedSources.add(replacement.src);
    }
  }

  return selected;
}

function SmartImage({
  src,
  alt,
  className = "",
  fallback,
  fallbackSrc = "",
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: string;
  fallbackSrc?: string;
}) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const candidates = [...new Set([src, fallbackSrc].flatMap((candidate) => imageSources(candidate)))];
  const activeSrc = candidates.find((candidate) => !failedSources.includes(candidate)) || "";
  if (!activeSrc) {
    return (
      <span className={`image-fallback ${className}`} aria-label={`${alt}（画像なし）`}>
        <ImageIcon aria-hidden="true" />
        <span>{fallback}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSources((failed) => failed.includes(activeSrc) ? failed : [...failed, activeSrc])}
    />
  );
}

function originalMangaPageSrc(src: string) {
  const match = /^\/media\/pages\/(\d{2})\/\1-(\d{3})\.webp$/.exec(src);
  return match ? `/media/original/pages/${match[1]}/${match[1]}-${match[2]}.png` : src;
}

function OriginalMangaImage({ src, alt, fallback }: { src: string; alt: string; fallback: string }) {
  const originalSrc = originalMangaPageSrc(src);
  return <SmartImage src={originalSrc} fallbackSrc={originalSrc === src ? "" : src} alt={alt} fallback={fallback} />;
}

function chapterNeedsLeadingSingle(chapter: ChapterRecord) {
  const firstPage = chapter.sceneImages[0]?.page;
  return typeof firstPage === "number" && firstPage % 2 === 1;
}

export default function DatabaseApp() {
  const [db, setDb] = useState<Database | null>(null);
  const [loadError, setLoadError] = useState("");
  const [section, setSection] = useState<ViewKey>("chapters");
  const [selected, setSelected] = useState<Selected>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"fixed" | "random">("random");
  const [shuffleVersion, setShuffleVersion] = useState(20260813);
  const [pageIndex, setPageIndex] = useState<PageHit[] | null>(null);
  const pageIndexLoading = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(publicAsset("/data/db.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Database>;
      })
      .then((data) => {
        if (active) setDb(data);
      })
      .catch(() => {
        if (active) setLoadError("データを読み込めませんでした。ページを再読み込みしてください。");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const timer = window.setTimeout(() => {
      let nextSeed = random[0];
      try {
        const storedSeed = window.localStorage.getItem(CHAPTER_IMAGE_SEED_KEY);
        const previousSeed = Number(storedSeed);
        if (storedSeed !== null && Number.isInteger(previousSeed)) nextSeed = (previousSeed + 1) >>> 0;
        window.localStorage.setItem(CHAPTER_IMAGE_SEED_KEY, String(nextSeed));
      } catch {
        // Private browsing can make localStorage unavailable; the random seed still works.
      }
      setShuffleVersion(nextSeed);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (compactSearchText(query).length < 2 || pageIndex !== null || pageIndexLoading.current) return;
    pageIndexLoading.current = true;
    fetch(publicAsset("/data/page-index.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PageHit[]>;
      })
      .then(setPageIndex)
      .catch(() => setPageIndex([]));
  }, [pageIndex, query]);

  const readHash = useCallback(() => {
    const match = window.location.hash.match(/^#(chapters|volumes|characters|techniques|terms|supplements|sources)\/(.+)$/);
    if (match) {
      setSection(match[1] === "terms" ? "techniques" : match[1] as SectionKey);
      setSelected({ section: match[1] as SectionKey, id: decodeURIComponent(match[2]) });
    } else {
      setSelected(null);
    }
  }, []);

  useEffect(() => {
    const initialHashTimer = window.setTimeout(readHash, 0);
    window.addEventListener("hashchange", readHash);
    return () => {
      window.clearTimeout(initialHashTimer);
      window.removeEventListener("hashchange", readHash);
    };
  }, [readHash]);

  const openRecord = useCallback<OpenRecord>((targetSection, id) => {
    setSection(targetSection === "terms" ? "techniques" : targetSection);
    setSelected({ section: targetSection, id });
    window.history.pushState(null, "", `#${targetSection}/${encodeURIComponent(id)}`);
  }, []);

  const closeDetail = useCallback(() => {
    setSelected(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  const advanceShuffle = useCallback(() => {
    setShuffleVersion((value) => {
      const nextSeed = (value + 1) >>> 0;
      try {
        window.localStorage.setItem(CHAPTER_IMAGE_SEED_KEY, String(nextSeed));
      } catch {
        // The in-memory seed still advances when storage is unavailable.
      }
      return nextSeed;
    });
  }, []);

  const chooseSection = useCallback((next: ViewKey) => {
    setSection(next);
    setSelected(null);
    setQuery("");
    setSortMode("random");
    advanceShuffle();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [advanceShuffle]);

  const reshuffle = useCallback(() => {
    setSortMode("random");
    advanceShuffle();
  }, [advanceShuffle]);

  const sourceById = useMemo(
    () => new Map((db?.sources || []).map((source) => [source.id, source])),
    [db],
  );

  if (loadError) {
    return (
      <main className="load-state error-state">
        <CircleHelp aria-hidden="true" />
        <h1>読み込みに失敗しました</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!db) {
    return (
      <main className="load-state" aria-live="polite">
        <span className="loading-mark" />
        <p>データベースを読み込んでいます</p>
      </main>
    );
  }

  return (
    <div className="site-shell">
      <nav className="icon-nav" aria-label="データの種類">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => chooseSection(item.key)}
              aria-label={item.label}
              aria-current={!query && section === item.key ? "page" : undefined}
              className={!query && section === item.key ? "active" : ""}
            >
              <Icon aria-hidden="true" />
              <span className="nav-tooltip">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`line-nav${!query && section === "line-stamps" ? " active" : ""}`}
          onClick={() => chooseSection("line-stamps")}
          aria-label="LINEスタンプ一覧"
          aria-current={!query && section === "line-stamps" ? "page" : undefined}
        >
          <MessageCircle aria-hidden="true" />
          <span className="nav-tooltip">LINE</span>
        </button>
      </nav>

      <main className="content-shell">
        {query ? (
          <SearchOverview
            db={db}
            query={query}
            openRecord={openRecord}
            selected={selected}
            close={closeDetail}
            sourceById={sourceById}
            pageIndex={pageIndex || []}
          />
        ) : (
          <SectionView
            db={db}
            section={section}
            sortMode={sortMode}
            setSortMode={setSortMode}
            reshuffle={reshuffle}
            shuffleVersion={shuffleVersion}
            openRecord={openRecord}
            selected={selected}
            close={closeDetail}
            sourceById={sourceById}
          />
        )}
      </main>
    </div>
  );
}

function SectionView({
  db,
  section,
  sortMode,
  setSortMode,
  reshuffle,
  shuffleVersion,
  openRecord,
  selected,
  close,
  sourceById,
}: {
  db: Database;
  section: ViewKey;
  sortMode: "fixed" | "random";
  setSortMode: (value: "fixed" | "random") => void;
  reshuffle: () => void;
  shuffleVersion: number;
  openRecord: OpenRecord;
  selected: Selected;
  close: () => void;
  sourceById: Map<string, SourceRecord>;
}) {
  const entityCardScenes = useMemo(
    () => buildUniqueEntitySceneMap(db.techniques, db.terms, db.chapters, db.supplements),
    [db.chapters, db.supplements, db.techniques, db.terms],
  );

  const chapterItems = useMemo(() => {
    let items = [...db.chapters];
    if (sortMode === "random") {
      void shuffleVersion;
      items = shuffled(items, shuffleVersion);
    }
    else items.sort((a, b) => (a.volume === 0 ? -4 + (a.zeroNumber || 0) : a.number || 0) - (b.volume === 0 ? -4 + (b.zeroNumber || 0) : b.number || 0));
    return items;
    // shuffleVersion intentionally triggers a fresh random order.
  }, [db.chapters, sortMode, shuffleVersion]);

  const volumeItems = useMemo(() => {
    const items = [...db.volumes];
    if (sortMode === "random") {
      void shuffleVersion;
      return shuffled(items, shuffleVersion);
    }
    return items.sort((a, b) => a.number - b.number);
  }, [db.volumes, sortMode, shuffleVersion]);

  const characterItems = useMemo(() => {
    const items = [...db.characters];
    if (sortMode === "random") {
      void shuffleVersion;
      return shuffled(items, shuffleVersion);
    }
    return items.sort((a, b) => a.group.localeCompare(b.group, "ja") || a.name.localeCompare(b.name, "ja"));
  }, [db.characters, sortMode, shuffleVersion]);

  const entityItems = useMemo(() => {
    const items: EntityCardItem[] = [
      ...db.techniques.map((record) => ({ id: record.id, section: "techniques" as const, record })),
      ...db.terms.map((record) => ({ id: record.id, section: "terms" as const, record })),
    ];
    if (sortMode === "random") return shuffled(items, shuffleVersion);
    return items.sort((a, b) => a.record.group.localeCompare(b.record.group, "ja") || a.record.name.localeCompare(b.record.name, "ja"));
  }, [db.techniques, db.terms, sortMode, shuffleVersion]);

  const supplementItems = useMemo(() => {
    const items = [...db.supplements];
    if (sortMode === "random") return shuffled(items, shuffleVersion);
    return items.sort((a, b) => a.volume - b.volume || a.pageRange.start - b.pageRange.start);
  }, [db.supplements, sortMode, shuffleVersion]);

  const sourceItems = useMemo(
    () => [...db.sources]
      .sort((a, b) => a.publisher.localeCompare(b.publisher, "ja") || a.title.localeCompare(b.title, "ja")),
    [db.sources],
  );

  return (
    <>
      {section !== "sources" && section !== "line-stamps" && (
        <div className="filter-bar">
          <div className="sort-actions" role="group" aria-label="並び順">
            <button type="button" className={sortMode === "fixed" ? "active" : ""} onClick={() => setSortMode("fixed")} aria-label="順番どおり" aria-pressed={sortMode === "fixed"}>
              <ArrowDownAZ aria-hidden="true" />
            </button>
            <button type="button" className={sortMode === "random" ? "active" : ""} onClick={reshuffle} aria-label="ランダム" aria-pressed={sortMode === "random"}>
              <Shuffle aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {section === "chapters" && (
        <InlineRecordGrid
          db={db}
          section="chapters"
          items={chapterItems}
          gridClassName="chapter-grid"
          fixedColumns={3}
          minWidth={340}
          gap={5}
          mobileColumns={3}
          selected={selected}
          close={close}
          openRecord={openRecord}
          sourceById={sourceById}
          renderCard={(chapter, isSelected) => (
            <ChapterCard key={chapter.id} chapter={chapter} imageSeed={shuffleVersion} openRecord={openRecord} selected={isSelected} />
          )}
        />
      )}

      {section === "volumes" && (
        <InlineRecordGrid
          db={db}
          section="volumes"
          items={volumeItems}
          gridClassName="volume-grid"
          minWidth={330}
          gap={5}
          mobileColumns={2}
          selected={selected}
          close={close}
          openRecord={openRecord}
          sourceById={sourceById}
          renderCard={(volume, isSelected) => <VolumeCard key={volume.id} volume={volume} openRecord={openRecord} selected={isSelected} />}
        />
      )}

      {section === "characters" && (
        <InlineRecordGrid
          db={db}
          section="characters"
          items={characterItems}
          gridClassName="character-grid"
          minWidth={126}
          gap={16}
          mobileColumns={4}
          selected={selected}
          close={close}
          openRecord={openRecord}
          sourceById={sourceById}
          renderCard={(character, isSelected) => <CharacterCard key={character.id} character={character} openRecord={openRecord} selected={isSelected} />}
        />
      )}

      {(section === "techniques" || section === "terms") && (
        <InlineRecordGrid
          db={db}
          section="techniques"
          items={entityItems}
          itemSection={(item) => item.section}
          gridClassName="text-card-grid entity-grid"
          fixedColumns={3}
          minWidth={330}
          gap={5}
          mobileColumns={3}
          selected={selected}
          close={close}
          openRecord={openRecord}
          sourceById={sourceById}
          renderCard={(item, isSelected) => item.section === "techniques"
            ? <TechniqueCard key={entitySceneKey(item.section, item.id)} technique={item.record} scene={entityCardScenes.get(entitySceneKey(item.section, item.id))} openRecord={openRecord} selected={isSelected} />
            : <TermCard key={entitySceneKey(item.section, item.id)} term={item.record} scene={entityCardScenes.get(entitySceneKey(item.section, item.id))} openRecord={openRecord} selected={isSelected} />}
        />
      )}

      {section === "supplements" && (
        <InlineRecordGrid
          db={db}
          section="supplements"
          items={supplementItems}
          gridClassName="text-card-grid supplement-grid"
          fixedColumns={2}
          minWidth={295}
          gap={18}
          mobileColumns={2}
          selected={selected}
          close={close}
          openRecord={openRecord}
          sourceById={sourceById}
          renderCard={(supplement, isSelected) => <SupplementCard key={supplement.id} supplement={supplement} openRecord={openRecord} selected={isSelected} />}
        />
      )}

      {section === "sources" && (
        <SourcesView sources={sourceItems} />
      )}

      {section === "line-stamps" && <LineStampsView />}
    </>
  );
}

function InlineRecordGrid<T extends { id: string }>({
  db,
  section,
  items,
  itemSection,
  gridClassName,
  fixedColumns,
  minWidth,
  gap,
  mobileColumns,
  selected,
  close,
  openRecord,
  sourceById,
  renderCard,
}: {
  db: Database;
  section: Exclude<SectionKey, "sources">;
  items: T[];
  itemSection?: (item: T) => SectionKey;
  gridClassName: string;
  fixedColumns?: number;
  minWidth: number;
  gap: number;
  mobileColumns: number;
  selected: Selected;
  close: () => void;
  openRecord: OpenRecord;
  sourceById: Map<string, SourceRecord>;
  renderCard: (item: T, isSelected: boolean) => React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(() => fixedColumns ?? Math.max(mobileColumns, Math.floor((1280 + gap) / (minWidth + gap))));

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      const next = fixedColumns ?? (window.innerWidth <= 680
        ? mobileColumns
        : Math.max(1, Math.floor((width + gap) / (minWidth + gap))));
      setColumns(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [fixedColumns, gap, minWidth, mobileColumns]);

  const rowCount = Math.ceil(items.length / columns);
  const isSelected = (item: T) => selected?.section === (itemSection?.(item) ?? section) && selected.id === item.id;

  return (
    <div className="inline-record-list" ref={listRef}>
      {Array.from({ length: rowCount }, (_, rowIndex) => {
        const rowItems = items.slice(rowIndex * columns, rowIndex * columns + columns);
        const rowHasSelection = rowItems.some(isSelected);
        return (
          <div className="inline-record-row" key={`${section}-${rowIndex}`} style={{ marginTop: rowIndex ? gap : 0 }}>
            <div className={gridClassName} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {rowItems.map((item) => renderCard(item, isSelected(item)))}
            </div>
            {rowHasSelection && selected && (
              <InlineDetail
                db={db}
                selected={selected}
                close={close}
                openRecord={openRecord}
                sourceById={sourceById}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChapterCard({ chapter, imageSeed, openRecord, selected }: { chapter: ChapterRecord; imageSeed: number; openRecord: OpenRecord; selected: boolean }) {
  const imageUrl = chapterCardImage(chapter, imageSeed);
  return (
    <button type="button" className={`chapter-card${selected ? " is-selected" : ""}`} onClick={() => openRecord("chapters", chapter.id)} aria-label={`${chapter.label} ${chapter.title}`} aria-expanded={selected}>
      <span className="chapter-image-wrap">
        <SmartImage src={imageUrl} alt="" fallback={chapter.label} />
      </span>
      <span className="chapter-card-title">
        <span className="chapter-card-number">{chapter.number ?? chapter.zeroNumber}</span>
        <span>{chapter.title}</span>
      </span>
    </button>
  );
}

function VolumeCard({ volume, openRecord, selected }: { volume: VolumeRecord; openRecord: OpenRecord; selected: boolean }) {
  return (
    <article className={`volume-card${selected ? " is-selected" : ""}`}>
      <button type="button" onClick={() => openRecord("volumes", volume.id)} aria-label={`${volume.label}の詳細`} aria-expanded={selected}>
        <SmartImage src={volume.imageUrl} alt={`${volume.label}表紙`} fallback={volume.label} />
      </button>
    </article>
  );
}

function CharacterCard({ character, openRecord, selected }: { character: CharacterRecord; openRecord: OpenRecord; selected: boolean }) {
  return (
    <button
      type="button"
      className={`character-card${selected ? " is-selected" : ""}`}
      onClick={() => openRecord("characters", character.id)}
      aria-label={character.name}
      title={character.name}
      aria-expanded={selected}
    >
      <SmartImage src={character.imageUrl} alt="" fallback={character.name.slice(0, 2)} />
      <span className="sr-only">{character.name}</span>
    </button>
  );
}

function TechniqueCard({ technique, scene, openRecord, selected }: { technique: TechniqueRecord; scene?: EntitySceneImage; openRecord: OpenRecord; selected: boolean }) {
  return (
    <button type="button" className={`entity-card${scene ? " has-scene" : ""}${selected ? " is-selected" : ""}`} onClick={() => openRecord("techniques", technique.id)} aria-expanded={selected}>
      {scene && (
        <span className="entity-card-image">
          <SmartImage src={scene.src} alt="" fallback={technique.name} />
          <small>{scene.volume}巻 p.{scene.page}</small>
        </span>
      )}
      <span className="entity-card-copy">
        <strong>{technique.name}</strong>
        {technique.users.length > 0 && <span className="card-footer"><span>{technique.users.slice(0, 2).join("・")}</span><ChevronRight aria-hidden="true" /></span>}
      </span>
    </button>
  );
}

function TermCard({ term, scene, openRecord, selected }: { term: TermRecord; scene?: EntitySceneImage; openRecord: OpenRecord; selected: boolean }) {
  return (
    <button type="button" className={`entity-card${scene ? " has-scene" : ""}${selected ? " is-selected" : ""}`} onClick={() => openRecord("terms", term.id)} aria-expanded={selected}>
      {scene && (
        <span className="entity-card-image">
          <SmartImage src={scene.src} alt="" fallback={term.name} />
          <small>{scene.volume}巻 p.{scene.page}</small>
        </span>
      )}
      <span className="entity-card-copy">
        <strong>{term.name}</strong>
      </span>
    </button>
  );
}

function SupplementCard({ supplement, openRecord, selected }: { supplement: SupplementRecord; openRecord: OpenRecord; selected: boolean }) {
  return (
    <button type="button" className={`supplement-card${selected ? " is-selected" : ""}`} onClick={() => openRecord("supplements", supplement.id)} aria-expanded={selected}>
      <span className="supplement-card-image"><SmartImage src={supplement.imageUrl} alt="" fallback={supplement.title} /></span>
      <span className="supplement-card-copy">
        <span className="category-pill">{supplement.volume}巻・{supplement.pageLabel}</span>
        <strong>{supplement.title}</strong>
      </span>
    </button>
  );
}

function LineStampsView() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1200);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;

    const syncHeight = () => {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) return;
      const nextHeight = Math.max(
        frameDocument.documentElement.scrollHeight,
        frameDocument.body?.scrollHeight || 0,
      );
      if (nextHeight > 0) setFrameHeight(nextHeight);
    };

    const handleLoad = () => {
      observer?.disconnect();
      syncHeight();
      const body = frame.contentDocument?.body;
      if (body) {
        observer = new ResizeObserver(syncHeight);
        observer.observe(body);
      }
    };

    frame.addEventListener("load", handleLoad);
    if (frame.contentDocument?.readyState === "complete") handleLoad();

    return () => {
      frame.removeEventListener("load", handleLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <section className="line-stamps-view" aria-label="LINEスタンプ一覧">
      <iframe
        ref={frameRef}
        className="line-stamps-frame"
        src={publicAsset("/external/jujutsu_line_stickers.html")}
        title="呪術廻戦 LINEスタンプ画像一覧"
        loading="eager"
        style={{ height: `${frameHeight}px` }}
      />
    </section>
  );
}

function SourcesView({ sources }: { sources: SourceRecord[] }) {
  return (
    <div className="source-grid">
      {sources.map((source) => (
        <a className="source-card" key={source.id} href={source.url} target="_blank" rel="noreferrer">
          <strong>{source.title}</strong>
          <small>{source.publisher}</small>
          {source.usableFor.length > 0 && <p>{source.usableFor.join("・")}</p>}
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function SearchOverview({
  db,
  query,
  openRecord,
  selected,
  close,
  sourceById,
  pageIndex,
}: {
  db: Database;
  query: string;
  openRecord: OpenRecord;
  selected: Selected;
  close: () => void;
  sourceById: Map<string, SourceRecord>;
  pageIndex: PageHit[];
}) {
  const normalized = normalizeText(query);
  const compactQuery = compactSearchText(query);
  const groups = useMemo(() => [
    {
      section: "chapters" as const,
      label: "各話",
      icon: ImageIcon,
      items: db.chapters.filter((item) => includesQuery(normalized, item.label, item.title, item.lead, item.summary, item.endComment?.text, item.keywords)),
      title: (item: ChapterRecord) => `${item.label} ${item.title}`,
      body: (item: ChapterRecord) => item.endComment?.text || item.summary,
    },
    {
      section: "volumes" as const,
      label: "コミックス",
      icon: Library,
      items: db.volumes.filter((item) => includesQuery(normalized, item.label, item.title, item.synopsis)),
      title: (item: VolumeRecord) => item.title,
      body: (item: VolumeRecord) => item.synopsis,
    },
    {
      section: "characters" as const,
      label: "人物",
      icon: UsersRound,
      items: db.characters.filter((item) => includesQuery(normalized, item.name, item.aliases, item.category, item.affiliation, item.profile, item.grade.label, item.grade.note, item.growth.status, item.growth.summary)),
      title: (item: CharacterRecord) => item.name,
      body: (item: CharacterRecord) => item.profile,
    },
    {
      section: "techniques" as const,
      label: "技・術式",
      icon: Sparkles,
      items: db.techniques.filter((item) => includesQuery(normalized, item.name, item.reading, item.aliases, item.category, item.description, item.users)),
      title: (item: TechniqueRecord) => item.name,
      body: (item: TechniqueRecord) => item.description,
    },
    {
      section: "terms" as const,
      label: "用語",
      icon: Tags,
      items: db.terms.filter((item) => includesQuery(normalized, item.name, item.category, item.definition)),
      title: (item: TermRecord) => item.name,
      body: (item: TermRecord) => item.definition,
    },
    {
      section: "supplements" as const,
      label: "巻末・描き下ろし",
      icon: FileText,
      items: db.supplements.filter((item) => includesQuery(normalized, item.title, item.kind, item.summary)),
      title: (item: SupplementRecord) => item.title,
      body: (item: SupplementRecord) => item.summary,
    },
  ], [db, normalized]);

  const pageMatches = useMemo(() => compactQuery.length < 2 ? [] : pageIndex
    .filter((item) => item.text.includes(compactQuery) && (item.chapterId || item.supplementId))
    .slice(0, 40), [compactQuery, pageIndex]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0) + pageMatches.length;
  const selectedFromPage = pageMatches.some((item) =>
    (selected?.section === "chapters" && item.chapterId === selected.id)
    || (selected?.section === "supplements" && item.supplementId === selected.id));

  return (
    <section className="search-results">
      <div className="section-heading search-heading">
        <div><h2>「{query}」の検索結果</h2></div>
      </div>
      {total === 0 && <div className="empty-state"><Search aria-hidden="true" /><p>一致する項目はありません。</p></div>}
      {pageMatches.length > 0 && (
        <section className="search-group page-search-group">
          <h3><ImageIcon aria-hidden="true" />画像内の言葉</h3>
          <div className="page-hit-grid">
            {pageMatches.map((item) => {
              const chapter = db.chapters.find((entry) => entry.id === item.chapterId);
              const supplement = db.supplements.find((entry) => entry.id === item.supplementId);
              const volumeKey = String(item.volume).padStart(2, "0");
              const targetSection: SectionKey = supplement ? "supplements" : "chapters";
              const targetId = supplement?.id || chapter?.id || "";
              return (
                <button type="button" key={item.file} onClick={() => openRecord(targetSection, targetId)}>
                  <SmartImage src={`/media/pages/${volumeKey}/${item.file}`} alt="" fallback={`${item.volume}巻 p.${item.page}`} />
                  <span><strong>{supplement?.title || chapter?.title || ""}</strong><small>{item.volume}巻 p.{item.page}</small></span>
                </button>
              );
            })}
          </div>
          {selectedFromPage && selected && <InlineDetail db={db} selected={selected} close={close} openRecord={openRecord} sourceById={sourceById} />}
        </section>
      )}
      {groups.filter((group) => group.items.length).map((group) => {
        const Icon = group.icon;
        return (
          <section className="search-group" key={group.section}>
            <h3><Icon aria-hidden="true" />{group.label}<span>{group.items.length}</span></h3>
            <div className="search-result-list">
              {group.items.slice(0, 12).map((item) => {
                const isSelected = selected?.section === group.section && selected.id === item.id;
                return (
                  <div className="search-result-row" key={item.id}>
                    <button type="button" onClick={() => openRecord(group.section, item.id)} aria-expanded={isSelected} className={isSelected ? "is-selected" : ""}>
                      <span><strong>{group.title(item as never)}</strong><small>{group.body(item as never)}</small></span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    {isSelected && selected && (
                      <InlineDetail db={db} selected={selected} close={close} openRecord={openRecord} sourceById={sourceById} />
                    )}
                  </div>
                );
              })}
            </div>
            {group.items.length > 12 && <p className="more-note">ほか {group.items.length - 12}件</p>}
          </section>
        );
      })}
    </section>
  );
}

function InlineDetail({
  db,
  selected,
  close,
  openRecord,
  sourceById,
}: {
  db: Database;
  selected: NonNullable<Selected>;
  close: () => void;
  openRecord: OpenRecord;
  sourceById: Map<string, SourceRecord>;
}) {
  const record = selected.section === "chapters" ? db.chapters.find((item) => item.id === selected.id)
    : selected.section === "volumes" ? db.volumes.find((item) => item.id === selected.id)
      : selected.section === "characters" ? db.characters.find((item) => item.id === selected.id)
        : selected.section === "techniques" ? db.techniques.find((item) => item.id === selected.id)
          : selected.section === "terms" ? db.terms.find((item) => item.id === selected.id)
            : selected.section === "supplements" ? db.supplements.find((item) => item.id === selected.id)
              : db.sources.find((item) => item.id === selected.id);

  if (!record) return null;

  return (
    <article className="inline-detail" role="region" aria-label="詳細情報">
      <button type="button" className="detail-close" onClick={close} aria-label="詳細を閉じる"><X aria-hidden="true" /></button>
      {selected.section === "chapters" && <ChapterDetail db={db} chapter={record as ChapterRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "volumes" && <VolumeDetail db={db} volume={record as VolumeRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "characters" && <CharacterDetail db={db} character={record as CharacterRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "techniques" && <TechniqueDetail db={db} technique={record as TechniqueRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "terms" && <TermDetail db={db} term={record as TermRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "supplements" && <SupplementDetail db={db} supplement={record as SupplementRecord} openRecord={openRecord} sourceById={sourceById} />}
      {selected.section === "sources" && <SourceDetail source={record as SourceRecord} />}
    </article>
  );
}

function ChapterDetail({ db, chapter, openRecord }: { db: Database; chapter: ChapterRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  const arc = db.arcs.find((item) => item.id === chapter.arcId);
  const battles = chapter.battleIds
    .map((id) => db.battles.find((battle) => battle.id === id))
    .filter(Boolean) as BattleRecord[];
  const leadingSingle = chapterNeedsLeadingSingle(chapter);
  return (
    <div className="detail-content">
      <DetailTitle eyebrow="" title={chapter.title} badges={[arc?.name || "未分類"]} lead="" />
      <div className="chapter-scene-gallery">
        {chapter.sceneImages.map((scene, index) => (
          <figure key={scene.page} className={leadingSingle && index === 0 ? "is-leading-single" : undefined}>
            <OriginalMangaImage src={scene.src} alt="" fallback={chapter.title} />
          </figure>
        ))}
      </div>
      {battles.length > 0 && <ChapterBattleList db={db} battles={battles} openRecord={openRecord} />}
      <DetailSection icon={BookMarked} title="あらすじ">
        <p className="long-copy">{chapter.summary}</p>
      </DetailSection>
      {chapter.endComment && (
        <DetailSection icon={MessageCircle} title="巻末コメント">
          <blockquote className="end-comment">
            <p>{chapter.endComment.text}</p>
            <cite>{chapter.endComment.releaseDate}・{chapter.endComment.issue}</cite>
          </blockquote>
        </DetailSection>
      )}
      <RelatedSection db={db} characterIds={chapter.characterIds} techniqueIds={chapter.techniqueIds} termIds={chapter.termIds} openRecord={openRecord} />
      {chapter.quoteGists.length > 0 && (
        <DetailSection icon={Quote} title="言葉の要旨">
          <div className="quote-list">{chapter.quoteGists.map((quote, index) => <blockquote key={`${quote.text}-${index}`}><p>{quote.text}</p>{quote.speaker && <cite>{quote.speaker}</cite>}</blockquote>)}</div>
        </DetailSection>
      )}
    </div>
  );
}

function VolumeDetail({ db, volume, openRecord }: { db: Database; volume: VolumeRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  const supplements = volume.supplements
    .map((item) => db.supplements.find((entry) => entry.id === item.id))
    .filter(Boolean) as SupplementRecord[];
  return (
    <div className="detail-content volume-detail">
      <div className="volume-detail-hero">
        <SmartImage src={volume.imageUrl} alt={`${volume.label}表紙`} fallback={volume.label} />
        <div>
          <DetailTitle eyebrow="" title={volume.title} badges={[]} lead={volume.synopsis} />
        </div>
      </div>
      <DetailSection icon={BookMarked} title="収録内容">
        <ChapterLinks db={db} ids={volume.chapters.map((item) => item.id)} openRecord={openRecord} showPage />
      </DetailSection>
      {supplements.length > 0 && (
        <DetailSection icon={FileText} title="巻末・描き下ろし">
          <div className="volume-supplement-grid">
            {supplements.map((supplement) => (
              <button type="button" key={supplement.id} onClick={() => openRecord("supplements", supplement.id)}>
                <SmartImage src={supplement.imageUrl} alt="" fallback={supplement.title} />
                <span>
                  <strong>{supplement.title}</strong>
                  <small>{supplement.pageLabel}</small>
                </span>
              </button>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

function CharacterDetail({ db, character, openRecord }: { db: Database; character: CharacterRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  const techniqueIds = character.techniqueIds || [];
  const highlights = character.highlights
    .filter((item) => item.kind !== "keyword" && normalizeText(item.text) !== normalizeText(character.name))
    .filter((item, index, array) => array.findIndex((other) => other.text === item.text && other.chapterId === item.chapterId) === index);
  const visibleHighlights = highlights.slice(0, 12);
  const remainingHighlights = highlights.slice(12);
  const showGrowth = Boolean(character.growth.summary);
  const highlightRows = (items: typeof highlights) => items.map((item, index) => {
    const chapter = db.chapters.find((entry) => entry.id === item.chapterId);
    return (
      <button type="button" key={`${item.chapterId}-${item.text}-${index}`} onClick={() => openRecord("chapters", item.chapterId)}>
        <span className="highlight-chapter"><strong>{chapter?.label || item.label}</strong><small>{chapter?.title || ""}</small>{item.pages.length > 0 && <em>p.{item.pages.join("・")}</em>}</span>
        <p>{item.text}</p>
        <ChevronRight aria-hidden="true" />
      </button>
    );
  });
  return (
    <div className="detail-content">
      <div className="entity-hero">
        <div className="entity-portrait"><SmartImage src={character.imageUrl} alt={character.name} fallback={character.name.slice(0, 2)} /></div>
        <DetailTitle eyebrow="人物" title={character.name} badges={[character.category, character.affiliation].filter(Boolean)} lead={character.profile} />
      </div>
      <section className={`character-status grade-${character.grade.kind}${showGrowth ? "" : " single"}`} aria-label="等級と作中の成長">
        <div>
          <span>等級</span>
          <strong>{character.grade.label}</strong>
          {character.grade.note && <p>{character.grade.note}</p>}
        </div>
        {showGrowth && (
          <div>
            <span>作中の成長</span>
            <strong>{character.growth.status}</strong>
            {character.growth.summary && <p>{character.growth.summary}</p>}
          </div>
        )}
      </section>
      <CharacterFate db={db} character={character} openRecord={openRecord} />
      <CharacterBattleHistory db={db} character={character} openRecord={openRecord} />
      <EvidenceSceneGrid db={db} contexts={highlights} openRecord={openRecord} />
      {character.aliases.length > 0 && <DetailSection icon={Info} title="別名・呼び方"><p>{character.aliases.join("・")}</p></DetailSection>}
      {techniqueIds.length > 0 && <DetailSection icon={Swords} title="技・術式"><TextLinks db={db} ids={techniqueIds} section="techniques" openRecord={openRecord} /></DetailSection>}
      <SupplementLinks db={db} ids={character.supplementIds || []} openRecord={openRecord} />
      {highlights.length > 0 && (
        <DetailSection icon={Sparkles} title="役割・転機">
          <div className="highlight-list">{highlightRows(visibleHighlights)}</div>
          {remainingHighlights.length > 0 && <details className="more-highlights"><summary>続きを表示（{remainingHighlights.length}件）</summary><div className="highlight-list">{highlightRows(remainingHighlights)}</div></details>}
        </DetailSection>
      )}
    </div>
  );
}

function CharacterBattleHistory({ db, character, openRecord }: { db: Database; character: CharacterRecord; openRecord: OpenRecord }) {
  const battles = character.battleIds
    .map((id) => db.battles.find((battle) => battle.id === id))
    .filter(Boolean) as BattleRecord[];
  if (!battles.length) return null;
  return (
    <DetailSection icon={Swords} title={`戦った相手・結果（${battles.length}件）`}>
      <div className="battle-history-list">
        {battles.map((battle) => {
          const ownSide = battle.sides.find((side) => side.characterIds.includes(character.id));
          const opponentIds = [...new Set(battle.sides
            .filter((side) => side !== ownSide)
            .flatMap((side) => side.characterIds))];
          return (
            <article className="battle-history-card" key={battle.id}>
              <header>
                <span className="battle-result">{ownSide?.result || "記録あり"}</span>
                <strong>{battle.title}</strong>
              </header>
              <div className="battle-opponents">
                <span>対戦相手</span>
                <NamedCharacterLinks db={db} ids={opponentIds} openRecord={openRecord} />
              </div>
              {battle.summary && <p>{battle.summary}</p>}
              <BattleChapterLinks db={db} ids={battle.chapterIds} openRecord={openRecord} />
            </article>
          );
        })}
      </div>
    </DetailSection>
  );
}

function CharacterFate({ db, character, openRecord }: { db: Database; character: CharacterRecord; openRecord: OpenRecord }) {
  const deaths = db.deaths.filter((death) => death.characterId === character.id);
  const causedDeaths = db.deaths.filter((death) => death.killerIds.includes(character.id));
  if (!deaths.length && !causedDeaths.length) return null;
  return (
    <DetailSection icon={Skull} title="死亡・殺害記録">
      <div className="fate-grid">
        {deaths.map((death) => (
          <FateCard key={death.id} db={db} death={death} mode="victim" openRecord={openRecord} />
        ))}
        {causedDeaths.map((death) => (
          <FateCard key={`caused-${death.id}`} db={db} death={death} mode="killer" openRecord={openRecord} />
        ))}
      </div>
    </DetailSection>
  );
}

function FateCard({ db, death, mode, openRecord }: { db: Database; death: DeathRecord; mode: "victim" | "killer"; openRecord: OpenRecord }) {
  const victim = db.characters.find((character) => character.id === death.characterId);
  const chapter = db.chapters.find((item) => item.id === death.chapterId);
  const counterpartIds = mode === "victim" ? death.killerIds : [death.characterId];
  return (
    <article className={`fate-card ${mode}`}>
      <header>
        <span>{mode === "victim" ? death.kind : "殺害・祓除"}</span>
        <strong>{mode === "victim" ? "最期" : victim?.name || "相手"}</strong>
      </header>
      <p>{death.summary}</p>
      <div className="fate-links">
        {counterpartIds.length > 0 ? (
          <NamedCharacterLinks db={db} ids={counterpartIds} openRecord={openRecord} />
        ) : (
          <span className="fate-cause-label">{death.killerLabel || "殺害者なし"}</span>
        )}
        {mode === "victim" && death.killerLabel && <span className="fate-cause-label">{death.killerLabel}</span>}
      </div>
      {chapter && (
        <button type="button" className="fate-chapter" onClick={() => openRecord("chapters", chapter.id)}>
          <BookMarked aria-hidden="true" />
          <span><strong>{chapter.label}</strong><small>{chapter.title}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

function ChapterBattleList({ db, battles, openRecord }: { db: Database; battles: BattleRecord[]; openRecord: OpenRecord }) {
  return (
    <DetailSection icon={Swords} title={`この話の戦闘（${battles.length}件）`}>
      <div className="chapter-battle-list">
        {battles.map((battle) => (
          <article key={battle.id}>
            <strong>{battle.title}</strong>
            <p>{battle.summary}</p>
            <div className="battle-side-grid">
              {battle.sides.map((side, index) => (
                <div key={`${battle.id}-side-${index}`}>
                  <span>{side.result}</span>
                  <NamedCharacterLinks db={db} ids={side.characterIds} openRecord={openRecord} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </DetailSection>
  );
}

function NamedCharacterLinks({ db, ids, openRecord }: { db: Database; ids: string[]; openRecord: OpenRecord }) {
  const characters = ids
    .map((id) => db.characters.find((character) => character.id === id))
    .filter(Boolean) as CharacterRecord[];
  return (
    <div className="named-character-links">
      {characters.map((character) => (
        <button type="button" key={character.id} onClick={() => openRecord("characters", character.id)}>
          <SmartImage src={character.imageUrl} alt="" fallback={character.name.slice(0, 2)} />
          <span>{character.name}</span>
        </button>
      ))}
    </div>
  );
}

function BattleChapterLinks({ db, ids, openRecord }: { db: Database; ids: string[]; openRecord: OpenRecord }) {
  const chapters = ids
    .map((id) => db.chapters.find((chapter) => chapter.id === id))
    .filter(Boolean) as ChapterRecord[];
  return (
    <div className="battle-chapter-links" aria-label="該当話">
      {chapters.map((chapter) => (
        <button type="button" key={chapter.id} onClick={() => openRecord("chapters", chapter.id)} title={chapter.title}>
          {chapter.label}
        </button>
      ))}
    </div>
  );
}

function TechniqueDetail({ db, technique, openRecord }: { db: Database; technique: TechniqueRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  const relatedTechniqueIds = technique.relatedTechniqueIds || [];
  const sceneContexts = technique.sceneImages.map((scene) => ({ chapterId: scene.chapterId, supplementId: scene.supplementId, pages: [scene.page] }));
  return (
    <div className="detail-content">
      <DetailTitle eyebrow="技・術式" title={technique.name} badges={[technique.category, technique.reading].filter(Boolean)} lead="" />
      <DetailSection icon={Info} title="効果"><p className="long-copy">{technique.description}</p></DetailSection>
      {technique.users.length > 0 && <DetailSection icon={UsersRound} title="使用者"><p>{technique.users.join("・")}</p>{technique.userRefs.length > 0 && <div className="chip-list">{technique.userRefs.map((user) => <button type="button" key={user.characterId} onClick={() => openRecord("characters", user.characterId)}>{user.name}<ChevronRight aria-hidden="true" /></button>)}</div>}</DetailSection>}
      {relatedTechniqueIds.length > 0 && <DetailSection icon={Link2} title="派生・関連技"><TextLinks db={db} ids={relatedTechniqueIds} section="techniques" openRecord={openRecord} /></DetailSection>}
      <SupplementLinks db={db} ids={technique.supplementIds || []} openRecord={openRecord} />
      {technique.storyContexts.length > 0 && <StoryContextList title="作中での使われ方" items={technique.storyContexts} openRecord={openRecord} />}
      <EvidenceSceneGrid db={db} contexts={sceneContexts} openRecord={openRecord} />
      {(technique.activationStarts.length > 0 || technique.activationAttempts.length > 0) && (
        <DetailSection icon={Swords} title="発動記録">
          <div className="activation-list">
            {technique.activationStarts.map((item, index) => <button type="button" key={`start-${item.chapterId}-${index}`} onClick={() => item.chapterId && openRecord("chapters", item.chapterId)}><CheckCircle2 aria-hidden="true" /><span><strong>成立{item.count > 1 ? ` ×${item.count}` : ""}</strong><small>{item.note}</small></span><ChevronRight aria-hidden="true" /></button>)}
            {technique.activationAttempts.map((item, index) => <button type="button" className="failed" key={`attempt-${item.chapterId}-${index}`} onClick={() => item.chapterId && openRecord("chapters", item.chapterId)}><CircleHelp aria-hidden="true" /><span><strong>不成立・試行</strong><small>{item.note}</small></span><ChevronRight aria-hidden="true" /></button>)}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

function TermDetail({ db, term, openRecord }: { db: Database; term: TermRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  const sceneContexts = term.sceneImages.map((scene) => ({ chapterId: scene.chapterId, supplementId: scene.supplementId, pages: [scene.page] }));
  return (
    <div className="detail-content">
      <DetailTitle eyebrow="用語" title={term.name} badges={[term.category]} lead="" />
      <DetailSection icon={Info} title="意味"><p className="long-copy">{term.definition}</p></DetailSection>
      <RelatedSection db={db} characterIds={term.characterIds || []} techniqueIds={term.techniqueIds || []} termIds={term.relatedTermIds || []} openRecord={openRecord} />
      <SupplementLinks db={db} ids={term.supplementIds || []} openRecord={openRecord} />
      {term.storyContexts.length > 0 && <StoryContextList title="作中での意味・使われ方" items={term.storyContexts} openRecord={openRecord} />}
      <EvidenceSceneGrid db={db} contexts={sceneContexts} openRecord={openRecord} />
    </div>
  );
}

function EvidenceSceneGrid({
  db,
  contexts,
  openRecord,
}: {
  db: Database;
  contexts: Array<{ chapterId: string; supplementId?: string; pages: number[] }>;
  openRecord: OpenRecord;
}) {
  const seen = new Set<string>();
  const scenes: Array<{
    key: string;
    chapter: ChapterRecord | null;
    supplement: SupplementRecord | null;
    page: number;
    src: string;
  }> = [];
  for (const context of contexts) {
    const supplement = context.supplementId
      ? db.supplements.find((item) => item.id === context.supplementId)
      : undefined;
    if (supplement) {
      for (const page of context.pages) {
        const image = supplement.sceneImages.find((item) => item.page === page);
        const key = `${supplement.id}-${page}`;
        if (!image || seen.has(key)) continue;
        seen.add(key);
        scenes.push({ key, chapter: null, supplement, page, src: image.src });
      }
      continue;
    }
    const chapter = db.chapters.find((item) => item.id === context.chapterId);
    if (!chapter) continue;
    const volumeKey = String(chapter.volume).padStart(2, "0");
    for (const page of context.pages) {
      const key = `${chapter.id}-${page}`;
      if (!Number.isInteger(page) || page < 1 || seen.has(key)) continue;
      seen.add(key);
      scenes.push({
        key,
        chapter,
        supplement: null,
        page,
        src: `/media/pages/${volumeKey}/${volumeKey}-${String(page).padStart(3, "0")}.webp`,
      });
    }
  }
  const visibleScenes = scenes.slice(0, 12);
  if (!visibleScenes.length) return null;
  return (
    <DetailSection icon={ImageIcon} title="作中の場面">
      <div className="evidence-scene-grid">
        {visibleScenes.map((scene) => (
          <button type="button" key={scene.key} onClick={() => scene.supplement ? openRecord("supplements", scene.supplement.id) : scene.chapter && openRecord("chapters", scene.chapter.id)}>
            <OriginalMangaImage src={scene.src} alt="" fallback={`p.${scene.page}`} />
            <span>
              <strong>{scene.supplement?.title || scene.chapter?.title}</strong>
              <small>{scene.supplement ? `${scene.supplement.volume}巻・${scene.supplement.kind} p.${scene.page}` : `${scene.chapter?.label}・${scene.chapter?.volume}巻 p.${scene.page}`}</small>
            </span>
          </button>
        ))}
      </div>
    </DetailSection>
  );
}

function StoryContextList({ title, items, openRecord }: { title: string; items: StoryContext[]; openRecord: OpenRecord }) {
  return (
    <DetailSection icon={Info} title={title}>
      <div className="story-context-list">
        {items.map((item) => <button type="button" key={item.chapterId} onClick={() => openRecord("chapters", item.chapterId)}><strong>{item.label}「{item.title}」{item.pages.length > 0 && <small>p.{item.pages.join("・")}</small>}</strong><span>{item.text}</span><ChevronRight aria-hidden="true" /></button>)}
      </div>
    </DetailSection>
  );
}

function SupplementLinks({ db, ids, openRecord }: { db: Database; ids: string[]; openRecord: OpenRecord }) {
  const items = ids
    .map((id) => db.supplements.find((supplement) => supplement.id === id))
    .filter(Boolean) as SupplementRecord[];
  if (!items.length) return null;
  return (
    <DetailSection icon={FileText} title="巻末・設定">
      <div className="volume-supplement-grid">
        {items.map((supplement) => (
          <button type="button" key={supplement.id} onClick={() => openRecord("supplements", supplement.id)}>
            <SmartImage src={supplement.imageUrl} alt="" fallback={supplement.title} />
            <span>
              <strong>{supplement.title}</strong>
              <small>{supplement.volume}巻・{supplement.pageLabel}</small>
            </span>
          </button>
        ))}
      </div>
    </DetailSection>
  );
}

function SupplementDetail({ db, supplement, openRecord }: { db: Database; supplement: SupplementRecord; openRecord: OpenRecord; sourceById: Map<string, SourceRecord> }) {
  return (
    <div className="detail-content">
      <DetailTitle eyebrow={`${supplement.volume}巻・${supplement.pageLabel}`} title={supplement.title} badges={[supplement.kind]} lead={supplement.summary} />
      <div className="supplement-scene-gallery">
        {supplement.sceneImages.map((scene) => (
          <figure key={scene.page}>
            <OriginalMangaImage src={scene.src} alt="" fallback={supplement.title} />
          </figure>
        ))}
      </div>
      {supplement.characterIds.length > 0 && <DetailSection icon={UsersRound} title="関連人物"><CharacterLinks db={db} ids={supplement.characterIds} openRecord={openRecord} /></DetailSection>}
      <RelatedSection db={db} characterIds={[]} techniqueIds={supplement.techniqueIds} termIds={supplement.termIds} openRecord={openRecord} />
    </div>
  );
}

function SourceDetail({ source }: { source: SourceRecord }) {
  return (
    <div className="detail-content source-detail">
      <DetailTitle eyebrow={source.publisher} title={source.title} badges={[]} lead={source.usableFor.join("・")} />
      <a className="source-open" href={source.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />ページを開く</a>
    </div>
  );
}

function DetailTitle({ eyebrow, title, badges, lead }: { eyebrow: string; title: string; badges: string[]; lead: string }) {
  return (
    <header className="detail-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {badges.length > 0 && <div className="detail-badges">{badges.map((badge) => <span key={badge}>{badge}</span>)}</div>}
      {lead && <p className="detail-lead">{lead}</p>}
    </header>
  );
}

function DetailSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3><Icon aria-hidden="true" />{title}</h3>
      {children}
    </section>
  );
}

function RelatedSection({ db, characterIds, techniqueIds, termIds, openRecord }: { db: Database; characterIds: string[]; techniqueIds: string[]; termIds: string[]; openRecord: OpenRecord }) {
  if (!characterIds.length && !techniqueIds.length && !termIds.length) return null;
  return (
    <DetailSection icon={Link2} title="人物・技・用語">
      {characterIds.length > 0 && <div className="related-group"><h4>人物</h4><CharacterLinks db={db} ids={characterIds} openRecord={openRecord} /></div>}
      {techniqueIds.length > 0 && <div className="related-group"><h4>技・術式</h4><TextLinks db={db} ids={techniqueIds} section="techniques" openRecord={openRecord} /></div>}
      {termIds.length > 0 && <div className="related-group"><h4>用語</h4><TextLinks db={db} ids={termIds} section="terms" openRecord={openRecord} /></div>}
    </DetailSection>
  );
}

function CharacterLinks({ db, ids, openRecord }: { db: Database; ids: string[]; openRecord: OpenRecord }) {
  const items = ids.map((id) => db.characters.find((item) => item.id === id)).filter(Boolean) as CharacterRecord[];
  return (
    <div className="mini-character-grid">
      {items.map((character) => <button type="button" key={character.id} aria-label={character.name} title={character.name} onClick={() => openRecord("characters", character.id)}><SmartImage src={character.imageUrl} alt="" fallback={character.name.slice(0, 2)} /></button>)}
    </div>
  );
}

function TextLinks({ db, ids, section, openRecord }: { db: Database; ids: string[]; section: "techniques" | "terms"; openRecord: OpenRecord }) {
  const collection = section === "techniques" ? db.techniques : db.terms;
  const items = ids.map((id) => collection.find((item) => item.id === id)).filter(Boolean) as Array<TechniqueRecord | TermRecord>;
  return <div className="chip-list">{items.map((item) => <button type="button" key={item.id} onClick={() => openRecord(section, item.id)}>{item.name}<ChevronRight aria-hidden="true" /></button>)}</div>;
}

function ChapterLinks({ db, ids, openRecord, showPage = false }: { db: Database; ids: string[]; openRecord: OpenRecord; showPage?: boolean }) {
  const items = ids.map((id) => db.chapters.find((item) => item.id === id)).filter(Boolean) as ChapterRecord[];
  const visible = items.slice(0, 18);
  const rest = items.slice(18);
  const rows = (rowsToRender: ChapterRecord[]) => rowsToRender.map((chapter) => (
    <button type="button" key={chapter.id} className="chapter-link" onClick={() => openRecord("chapters", chapter.id)}>
      <span><strong>{chapter.label}</strong><small>{chapter.title}{showPage && chapter.startPage ? `・${chapter.startPage}頁` : ""}</small></span>
      <ChevronRight aria-hidden="true" />
    </button>
  ));
  return (
    <div className="chapter-links">
      {rows(visible)}
      {rest.length > 0 && <details><summary>残り{rest.length}話を表示</summary>{rows(rest)}</details>}
    </div>
  );
}
