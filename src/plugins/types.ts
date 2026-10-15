/**
 * Local mirror of the upstream v2 plugin contract (manifest fields,
 * Plugin interface, filter shapes, novel status). Declared here so the
 * app never imports from upstream checkouts.
 */

export interface PluginManifestItem {
  id: string;
  name: string;
  site: string;
  lang: string;
  version: string;
  /** URL of the raw plugin code (absolute, or relative to the manifest's dist tree) */
  url: string;
  iconUrl: string;
  customCSS?: string;
}

export enum FilterTypes {
  TextInput = 'Text',
  Picker = 'Picker',
  CheckboxGroup = 'Checkbox',
  Switch = 'Switch',
  ExcludableCheckboxGroup = 'XCheckbox',
}

export interface PluginFilterOption {
  label: string;
  value: string;
}

interface FilterBase {
  label: string;
}

export interface TextFilter extends FilterBase {
  type: FilterTypes.TextInput;
  value: string;
}

export interface PickerFilter extends FilterBase {
  type: FilterTypes.Picker;
  value: string;
  options: PluginFilterOption[];
}

export interface CheckboxGroupFilter extends FilterBase {
  type: FilterTypes.CheckboxGroup;
  value: string[];
  options: PluginFilterOption[];
}

export interface SwitchFilter extends FilterBase {
  type: FilterTypes.Switch;
  value: boolean;
}

export interface ExcludableCheckboxGroupFilter extends FilterBase {
  type: FilterTypes.ExcludableCheckboxGroup;
  value: {
    include?: string[];
    exclude?: string[];
  };
  options: PluginFilterOption[];
}

export type PluginFilter =
  | TextFilter
  | PickerFilter
  | CheckboxGroupFilter
  | SwitchFilter
  | ExcludableCheckboxGroupFilter;

export type PluginFilters = Record<string, PluginFilter>;

/**
 * Upstream's NovelStatus is string-valued (v3.0.0 era); plugins may
 * also emit raw numeric/string statuses, so the adapter maps all of
 * them onto v1's Status enum.
 */
export enum PluginNovelStatus {
  Unknown = 'Unknown',
  Ongoing = 'Ongoing',
  Completed = 'Completed',
  Licensed = 'Licensed',
  PublishingFinished = 'Publishing Finished',
  Cancelled = 'Cancelled',
  OnHiatus = 'On Hiatus',
}

export interface PluginNovelItem {
  name: string;
  path: string;
  cover?: string;
}

export interface PluginChapterItem {
  name: string;
  path: string;
  chapterNumber?: number;
  releaseTime?: string;
  page?: string;
  scanlator?: string | string[];
}

export interface PluginSourceNovel extends PluginNovelItem {
  genres?: string;
  summary?: string;
  author?: string;
  artist?: string;
  status?: PluginNovelStatus | string | number;
  chapters: PluginChapterItem[];
  totalPages?: number;
}

export interface PluginImageRequestInit {
  method?: string;
  headers: Record<string, string>;
  body?: string;
  [key: string]:
    | string
    | Record<string, string>
    | Headers
    | FormData
    | undefined;
}

export interface PluginPopularNovelsOptions {
  showLatestNovels?: boolean;
  filters?: Record<string, unknown>;
}

/**
 * The shape a compiled v2 dist's `exports.default` exposes. Optional
 * members exist only on plugins that declare them.
 */
export interface Plugin {
  id: string;
  name: string;
  site: string;
  lang: string;
  version: string;
  url?: string;
  iconUrl?: string;
  customCSS?: string;
  imageRequestInit?: PluginImageRequestInit;
  filters?: PluginFilters;
  popularNovels: (
    pageNo: number,
    options?: PluginPopularNovelsOptions,
  ) => Promise<PluginNovelItem[]>;
  parseNovel: (novelPath: string) => Promise<PluginSourceNovel>;
  parseChapter: (chapterPath: string) => Promise<string>;
  searchNovels: (
    searchTerm: string,
    pageNo: number,
    filters?: Record<string, unknown>,
  ) => Promise<PluginNovelItem[]>;
  resolveUrl?: (path: string, isNovel?: boolean) => string;
}
