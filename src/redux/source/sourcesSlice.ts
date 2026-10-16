import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AllSources from '../../sources/sources.json';

import { translations } from 'i18n-js';
import { localization } from '../../../strings/translations';
import { Source } from '../../sources/types';
import {
  InstalledPlugin,
  getAllPlugins,
} from '../../database/queries/PluginQueries';

const languages = {
  'en': 'English',
  'es': 'Spanish',
  'tr': 'Turkish',
  'ru': 'Russian',
  'ar': 'Arabic',
  'uk': 'Ukrainian',
  'pt': 'Portuguese',
  'pt-BR': 'Portuguese',
  'de': 'German',
  'it': 'Italian',
  'zh-CN': 'Chinese',
  'zh-TW': 'Chinese',
  'vi': 'Vietnamese',
  'ja': 'Japanese',
};
// Hope you can do something to synchronize translation system.
// Also take care of some case like vi-VN: Vietnamese not vi
export const defaultLanguage =
  localization in translations || localization.split('-')[0] in translations
    ? languages[localization] || languages[localization.split('-')[0]]
    : 'English';
// That's why this code is so long :(

/**
 * Plugin manifests name languages in their native spellings; bundled
 * sources and the language filters use the English vocabulary below.
 * Unmapped names (e.g. Thai, Polish, Multi) keep their manifest value.
 */
const manifestLanguageNames: Record<string, string> = {
  'English': 'English',
  'Русский': 'Russian',
  'Español': 'Spanish',
  'Français': 'French',
  'Türkçe': 'Turkish',
  'Українська': 'Ukraine',
  'Tiếng Việt': 'Vietnamese',
  'Bahasa Indonesia': 'Indonesian',
  'Português': 'Portuguese (Brazil)',
  '日本語': 'Japanese',
  '조선말, 한국어': 'Korean',
  '中文, 汉语, 漢語': 'Chinese',
  'العربية': 'Arabic',
};

const toFilterLanguage = (lang: string | undefined): string => {
  // Manifest values may carry invisible direction marks.
  const normalized = (lang ?? '').replace(/[\u200e\u200f]/g, '').trim();
  return manifestLanguageNames[normalized] ?? normalized;
};

const pluginToSource = (plugin: InstalledPlugin): Source => ({
  sourceId: plugin.sourceId,
  sourceName: plugin.name ?? plugin.pluginId,
  url: plugin.site ?? '',
  lang: toFilterLanguage(plugin.lang),
  icon: plugin.iconUrl ?? '',
  isPlugin: true,
});

/**
 * Installed plugins as catalog sources. Failed rows have no working
 * scraper and stay out of the catalog. The plugins table is created
 * after the first render on a fresh install, when nothing can be
 * installed yet.
 */
const installedPluginSources = (): Source[] => {
  try {
    return getAllPlugins()
      .filter(plugin => !plugin.error)
      .map(pluginToSource);
  } catch {
    return [];
  }
};

/**
 * Bundled sources are opt-in: the default catalog is the plugin
 * ecosystem. Catalog visibility only - novels from hidden sources
 * keep resolving through sourceManager.
 */
const allCatalogSources = (showLegacySources: boolean): Source[] => [
  ...(showLegacySources ? AllSources : []),
  ...installedPluginSources(),
];

/**
 * Bundled sources plus installed plugins regardless of the legacy
 * toggle, for surfaces that must see every shipped source (novel
 * migration).
 */
export const allShippedSources = (): Source[] => [
  ...AllSources,
  ...installedPluginSources(),
];

interface SourcesState {
  allSources: Source[];
  searchResults: Source[];
  pinnedSourceIds: number[];
  lastUsed: number | null;
  languageFilters: string[];
  showLegacySources: boolean;
}

const initialState: SourcesState = {
  allSources: allCatalogSources(false),
  searchResults: [],
  pinnedSourceIds: [],
  lastUsed: null,
  languageFilters: [defaultLanguage],
  showLegacySources: false,
};

export const sourcesSlice = createSlice({
  name: 'sourcesSlice',
  initialState,
  reducers: {
    getSourcesAction: state => {
      const sources = allCatalogSources(state.showLegacySources)
        .filter(source => state.languageFilters.indexOf(source.lang) !== -1)
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName));

      state.allSources = sources;
    },
    searchSourcesAction: (state, action: PayloadAction<string>) => {
      if (state?.pinnedSourceIds === undefined) {
        state.pinnedSourceIds = [];
      }

      state.searchResults = state.allSources.filter((source: Source) =>
        source.sourceName.toLowerCase().includes(action.payload.toLowerCase()),
      );
    },
    setLastUsedSource: (state, action: PayloadAction<{ sourceId: number }>) => {
      state.lastUsed = action.payload.sourceId;
    },
    togglePinSource: (state, action: PayloadAction<number>) => {
      if (state?.pinnedSourceIds === undefined) {
        state.pinnedSourceIds = [];
      }

      if (state.pinnedSourceIds?.indexOf(action.payload) > -1) {
        state.pinnedSourceIds = state.pinnedSourceIds.filter(
          source => source !== action.payload,
        );
      } else {
        state.pinnedSourceIds = [...state.pinnedSourceIds, action.payload];
      }
    },
    toggleShowLegacySources: state => {
      state.showLegacySources = !state.showLegacySources;
    },
    toggleLanguageFilter: (
      state,
      action: PayloadAction<{ language: string }>,
    ) => {
      if (state.languageFilters.indexOf(action.payload.language) > -1) {
        state.languageFilters = state.languageFilters.filter(
          item => item !== action.payload.language,
        );
      } else {
        state.languageFilters = [
          ...state.languageFilters,
          action.payload.language,
        ];
      }
    },
  },
});

export const {
  getSourcesAction,
  togglePinSource,
  toggleLanguageFilter,
  toggleShowLegacySources,
  setLastUsedSource,
  searchSourcesAction,
} = sourcesSlice.actions;

export default sourcesSlice.reducer;
