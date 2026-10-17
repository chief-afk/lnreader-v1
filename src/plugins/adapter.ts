import { SourceChapter, SourceNovelItem, Status } from '../sources/types';
import {
  FilterInputs,
  SelectedFilter,
  SourceFilter,
} from '../sources/types/filterTypes';
import { isUrlAbsolute } from '../utils/isAbsoluteUrl';
import {
  FilterTypes,
  Plugin,
  PluginChapterItem,
  PluginFilter,
  PluginFilters,
  PluginNovelItem,
  PluginSourceNovel,
} from './types';

type Scraper = import('../sources/sourceManager').Scraper;

/** Mirror of v1's FilterValue (not exported by filterTypes). */
interface V1FilterValue {
  label: string;
  value: string;
}

/** Historical numeric NovelStatus ordering from early v2 plugins. */
const STATUS_BY_NUMBER: Status[] = [
  Status.Unknown,
  Status.Ongoing,
  Status.Completed,
  Status.Licensed,
  Status.PublishingFinished,
  Status.Cancelled,
  Status.OnHiatus,
];

const mapStatus = (
  pluginStatus?: string | number,
): Status | string | undefined => {
  if (pluginStatus === undefined || pluginStatus === null) {
    return undefined;
  }
  if (typeof pluginStatus === 'number') {
    return STATUS_BY_NUMBER[pluginStatus] ?? Status.Unknown;
  }
  // Upstream stores the raw string, so statuses outside v1's enum
  // ("Hiatus", "STUB", ...) keep their real value instead of reading
  // as Unknown.
  const match = Object.values(Status).find(
    value => value.toLowerCase() === String(pluginStatus).toLowerCase(),
  );
  return match ?? String(pluginStatus);
};

const joinToSite = (plugin: Plugin, path: string): string =>
  isUrlAbsolute(path)
    ? path
    : `${plugin.site.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

const toSourceNovelItem = (
  plugin: Plugin,
  sourceId: number,
  item: PluginNovelItem,
): SourceNovelItem => ({
  sourceId,
  novelName: item.name,
  novelUrl: item.path,
  novelCover: item.cover,
});

// --- filter conversion: v2 PluginFilters -> v1 SourceFilter[] ---

const toV1Values = (filter: PluginFilter): V1FilterValue[] => {
  switch (filter.type) {
    case FilterTypes.Picker:
    case FilterTypes.CheckboxGroup:
    case FilterTypes.ExcludableCheckboxGroup:
      return filter.options.map(option => ({
        label: option.label,
        value: option.value,
      }));
    case FilterTypes.Switch:
      // The checkbox sheet round-trips a selected 'on' entry;
      // unchecked is absent, which reads back as false.
      return [{ label: filter.label, value: 'on' }];
    default:
      // TextInput has no option list.
      return [];
  }
};

export const convertFiltersToV1 = (
  pluginFilters?: PluginFilters,
): SourceFilter[] | undefined => {
  if (!pluginFilters) {
    return undefined;
  }
  return Object.entries(pluginFilters).map(([key, filter]) => ({
    key,
    label: filter.label,
    values: toV1Values(filter),
    inputType: inputTypeFor(filter),
  }));
};

const inputTypeFor = (filter: PluginFilter): FilterInputs => {
  switch (filter.type) {
    case FilterTypes.Picker:
      return FilterInputs.Picker;
    case FilterTypes.CheckboxGroup:
    case FilterTypes.ExcludableCheckboxGroup:
    case FilterTypes.Switch:
      return FilterInputs.Checkbox;
    default:
      return FilterInputs.TextInput;
  }
};

// --- filter conversion: v1 SelectedFilter -> v2 {value} pairs ---

const convertFilterValueBack = (
  filter: PluginFilter,
  selected: string | string[],
): { value: unknown } => {
  switch (filter.type) {
    case FilterTypes.CheckboxGroup:
      return { value: Array.isArray(selected) ? selected : [] };
    case FilterTypes.ExcludableCheckboxGroup:
      // v1 cannot express an excluded state; only inclusive selections
      // pass through.
      return {
        value: { include: Array.isArray(selected) ? selected : [] },
      };
    case FilterTypes.Switch:
      return { value: Array.isArray(selected) && selected.length > 0 };
    default:
      return { value: Array.isArray(selected) ? '' : selected };
  }
};

export const convertSelectedFiltersToPlugin = (
  pluginFilters: PluginFilters | undefined,
  selectedFilters?: SelectedFilter,
): Record<string, { type: FilterTypes; value: unknown }> | undefined => {
  // Plugin dists read every filter key they declare (e.g.
  // filters.genres.value) before fetching, so upstream's runtime always
  // passes an object seeded with each filter's declared default value;
  // passing undefined when nothing is selected crashes them.
  if (!pluginFilters) {
    return undefined;
  }
  const converted: Record<string, { type: FilterTypes; value: unknown }> = {};
  Object.entries(pluginFilters).forEach(([key, filter]) => {
    converted[key] = { type: filter.type, value: filter.value };
  });
  Object.entries(selectedFilters ?? {}).forEach(([key, selected]) => {
    const filter = pluginFilters[key];
    // A key v1 kept but the plugin no longer declares is dropped.
    if (filter) {
      converted[key] = {
        type: filter.type,
        ...convertFilterValueBack(filter, selected),
      };
    }
  });
  return converted;
};

// --- adapter ---

/**
 * Upstream serves paginated chapter lists one page at a time: pages run
 * 1..totalPages and each page is fetched via parsePage only when
 * parseNovel did not already deliver its chapters (page 1 normally comes
 * with parseNovel). v1's single-shot parseNovelAndChapters concatenates
 * the remaining pages in page order instead; a failed page is skipped so
 * one dead page cannot blank the whole list.
 */
const MAX_CHAPTER_PAGES = 50;

const collectChapters = async (
  plugin: Plugin,
  novelUrl: string,
  novel: PluginSourceNovel,
): Promise<PluginChapterItem[]> => {
  const chapters = [...(novel.chapters ?? [])];
  const totalPages = novel.totalPages ?? 0;
  if (totalPages <= 1 || typeof plugin.parsePage !== 'function') {
    return chapters;
  }
  const lastPage = Math.min(totalPages, MAX_CHAPTER_PAGES);
  for (let page = chapters.length ? 2 : 1; page <= lastPage; page++) {
    try {
      const sourcePage = await plugin.parsePage(novelUrl, String(page));
      chapters.push(...(sourcePage?.chapters ?? []));
    } catch {
      // keep the pages fetched so far
    }
  }
  return chapters;
};

export const adaptPluginToScraper = (
  plugin: Plugin,
  sourceId: number,
): Scraper => ({
  popularNovels: async (pageNo, options) => {
    const filters = convertSelectedFiltersToPlugin(
      plugin.filters,
      options?.filters,
    );
    const novels = await plugin.popularNovels(pageNo, {
      showLatestNovels: options?.showLatestNovels,
      filters,
    });
    return {
      novels: novels.map(item => toSourceNovelItem(plugin, sourceId, item)),
    };
  },
  parseNovelAndChapters: async novelUrl => {
    const novel = await plugin.parseNovel(novelUrl);
    const chapters = await collectChapters(plugin, novelUrl, novel);
    return {
      sourceId,
      sourceName: plugin.name,
      url: joinToSite(plugin, novelUrl),
      novelUrl,
      novelName: novel.name,
      novelCover: novel.cover,
      genre: novel.genres,
      summary: novel.summary,
      author: novel.author,
      status: mapStatus(novel.status),
      chapters: chapters.map(chapter => ({
        chapterName: chapter.name,
        chapterUrl: chapter.path,
        releaseDate: chapter.releaseTime ?? null,
      })),
    };
  },
  parseChapter: async (novelUrl, chapterUrl) => {
    const chapterText = await plugin.parseChapter(chapterUrl);
    const chapter: SourceChapter = {
      sourceId,
      novelUrl,
      chapterUrl,
      chapterText,
    };
    return chapter;
  },
  searchNovels: async searchTerm => {
    const novels = await plugin.searchNovels(searchTerm, 1);
    return novels.map(item => toSourceNovelItem(plugin, sourceId, item));
  },
  filters: convertFiltersToV1(plugin.filters),
});
