import * as DocumentPicker from 'expo-document-picker';
import { EncodingType, StorageAccessFramework } from 'expo-file-system/legacy';
import { Directory, File, Paths } from 'expo-file-system';
import { unzipSync, Unzipped } from 'fflate';

import { db } from '../../../database/db';
import {
  BackupChapter,
  BackupHistoryRow,
  BackupNovel,
  createRestoreContext,
  importCategories,
  importHistory,
  importNovelWithChapters,
  RestoreContext,
} from '../../../database/queries/BackupQueries';
import {
  getPluginByPluginId,
  upsertPlugin,
} from '../../../database/queries/PluginQueries';
import { getRepositoryByUrl } from '../../../database/queries/RepoQueries';
import { OFFICIAL_PLUGIN_MANIFEST_URL } from '../../../plugins/constants';
import { validatePluginId } from '../../../plugins/shim';

// Upstream v2 archive entry names (BackupEntryName in the v2 source).
const ENTRY_VERSION = 'Version.json';
const ENTRY_CATEGORY = 'Category.json';
const ENTRY_SETTING = 'Setting.json';
const ENTRY_PLUGINS = 'Plugins.json';
const ENTRY_NOVELS = 'NovelAndChapters/';
const ENTRY_COVERS = 'Covers/';

/**
 * A hostile archive must not exhaust memory: entries beyond these caps
 * are not decompressed and the import is rejected.
 */
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

interface V2Manifest {
  appVersion?: string;
  formatVersion?: number;
  sections?: {
    library?: boolean;
    settings?: boolean;
    plugins?: boolean;
    downloadedFiles?: boolean;
  };
}

interface V2PluginItem {
  id: string;
  name?: string;
  site?: string;
  lang?: string;
  version?: string;
  url?: string;
  iconUrl?: string;
}

interface V2Category {
  id: number;
  name: string;
  sort?: number | null;
  novelIds?: number[];
}

interface V2Chapter {
  id: number;
  path: string;
  name?: string;
  releaseTime?: string | null;
  bookmark?: boolean | null;
  unread?: boolean | null;
  readTime?: string | null;
  isDownloaded?: boolean | null;
}

interface V2Novel {
  id: number;
  path: string;
  pluginId: string;
  name?: string;
  cover?: string | null;
  summary?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  genres?: string | null;
  inLibrary?: boolean | null;
}

export interface V2ImportSummary {
  novels: { imported: number; skipped: number; failed: number };
  chapters: number;
  history: { imported: number; skipped: number };
  categories: { imported: number };
  covers: { imported: number; failed: number };
  plugins: { seeded: number; existing: number; invalid: number };
  reposAdded: number;
  settingsIgnored: boolean;
  errors: string[];
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64ToBytes = (base64: string): Uint8Array => {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    let value = 0;
    let chars = 0;
    for (const char of clean.slice(i, i + 4)) {
      if (char === '=') {
        break;
      }
      value = (value << 6) | BASE64_ALPHABET.indexOf(char);
      chars++;
    }
    if (chars === 4) {
      bytes.push((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
    } else if (chars === 3) {
      bytes.push((value >> 10) & 0xff, (value >> 2) & 0xff);
    } else if (chars === 2) {
      bytes.push((value >> 4) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

const bytesToUtf8 = (bytes: Uint8Array): string => {
  let result = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];
    let codePoint: number;
    let sequenceLength: number;
    if (byte < 0x80) {
      codePoint = byte;
      sequenceLength = 1;
    } else if ((byte & 0xe0) === 0xc0) {
      codePoint = byte & 0x1f;
      sequenceLength = 2;
    } else if ((byte & 0xf0) === 0xe0) {
      codePoint = byte & 0x0f;
      sequenceLength = 3;
    } else {
      codePoint = byte & 0x07;
      sequenceLength = 4;
    }
    for (let j = 1; j < sequenceLength; j++) {
      codePoint = (codePoint << 6) | (bytes[i + j] & 0x3f);
    }
    result += String.fromCodePoint(codePoint);
    i += sequenceLength;
  }
  return result;
};

/**
 * Archive-entry safety: entry names must be plain relative archive
 * paths. Absolute paths, `..` segments, and drive-letter/UNC shapes
 * are rejected before anything is read or written.
 */
const isSafeEntryName = (name: string): boolean => {
  if (!name || name.startsWith('/') || name.startsWith('\\')) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(name) || name.startsWith('\\\\')) {
    return false;
  }
  const segments = name.split(/[\\/]/);
  return segments.every(segment => segment !== '..');
};

const unzipBackup = (bytes: Uint8Array): Unzipped => {
  let entryCount = 0;
  let totalUncompressed = 0;
  let rejectedName = '';
  let capExceeded = false;

  const unzipped = unzipSync(bytes, {
    filter: file => {
      if (rejectedName || capExceeded) {
        return false;
      }
      if (!isSafeEntryName(file.name)) {
        rejectedName = file.name;
        return false;
      }
      entryCount++;
      totalUncompressed += file.originalSize || file.size || 0;
      if (
        entryCount > MAX_ARCHIVE_ENTRIES ||
        totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES
      ) {
        capExceeded = true;
        return false;
      }
      return true;
    },
  });

  if (rejectedName) {
    throw new Error(
      `Unsafe entry in backup archive: "${rejectedName}" - import rejected`,
    );
  }
  if (capExceeded) {
    throw new Error(
      'Backup archive exceeds the size or entry limit - import rejected',
    );
  }
  return unzipped;
};

const parseJsonEntry = (archive: Unzipped, name: string): unknown => {
  const entry = archive[name];
  if (!entry) {
    return undefined;
  }
  return JSON.parse(bytesToUtf8(entry));
};

const novelEntries = (archive: Unzipped): string[] =>
  Object.keys(archive).filter(
    name => name.startsWith(ENTRY_NOVELS) && name.endsWith('.json'),
  );

/**
 * A v2 plugin dist url lives under the repo's `.js/src/plugins/` tree;
 * the manifest url that carries it is the same prefix plus
 * `.dist/plugins.min.json`. The official repo keeps its pinned,
 * capitalized constant so the seeded row and the repo row line up
 * with the loader's exact-match checks.
 */
const deriveRepoUrl = (distUrl?: string): string | undefined => {
  if (!distUrl) {
    return undefined;
  }
  const marker = '.js/src/plugins/';
  const index = distUrl.indexOf(marker);
  if (index === -1) {
    return undefined;
  }
  const derived = distUrl.slice(0, index) + '.dist/plugins.min.json';
  return derived.toLowerCase() === OFFICIAL_PLUGIN_MANIFEST_URL.toLowerCase()
    ? OFFICIAL_PLUGIN_MANIFEST_URL
    : derived;
};

const joinToSite = (site: string | undefined, path: string): string => {
  if (!site) {
    return path;
  }
  return `${site.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
};

const coversDir = () =>
  new Directory(new Directory(Paths.document, 'covers'), 'v2');

const importV2BackupFromFile = async (
  archiveBytes: Uint8Array,
): Promise<V2ImportSummary> => {
  const archive = unzipBackup(archiveBytes);

  const manifest = parseJsonEntry(archive, ENTRY_VERSION) as
    | V2Manifest
    | undefined;
  if (!manifest || manifest.formatVersion !== 2) {
    throw new Error('Not a recognizable LNReader v2 backup (formatVersion 2)');
  }
  const sections = manifest.sections ?? {};

  const summary: V2ImportSummary = {
    novels: { imported: 0, skipped: 0, failed: 0 },
    chapters: 0,
    history: { imported: 0, skipped: 0 },
    categories: { imported: 0 },
    covers: { imported: 0, failed: 0 },
    plugins: { seeded: 0, existing: 0, invalid: 0 },
    reposAdded: 0,
    settingsIgnored: false,
    errors: [],
  };

  // --- plugins: record only; existing rows keep their stored state ---
  const pluginItems = new Map<string, V2PluginItem>();
  if (sections.plugins) {
    const parsed = parseJsonEntry(archive, ENTRY_PLUGINS);
    if (Array.isArray(parsed)) {
      (parsed as V2PluginItem[]).forEach(item => {
        try {
          const pluginId = validatePluginId(item.id);
          pluginItems.set(pluginId, item);
        } catch {
          summary.plugins.invalid++;
        }
      });
    } else if (parsed !== undefined) {
      throw new Error('Backup plugin list has an unexpected format');
    }

    const repoUrls = new Set<string>();
    pluginItems.forEach(item => {
      if (!getPluginByPluginId(item.id)) {
        const repoUrl = deriveRepoUrl(item.url);
        upsertPlugin({
          pluginId: item.id,
          name: item.name,
          site: item.site,
          lang: item.lang,
          version: item.version,
          iconUrl: item.iconUrl,
          repoUrl,
        });
        summary.plugins.seeded++;
        if (repoUrl && repoUrl !== OFFICIAL_PLUGIN_MANIFEST_URL) {
          repoUrls.add(repoUrl);
        }
      } else {
        summary.plugins.existing++;
      }
    });

    // Seeded repos stay disabled until the user reviews and enables
    // them; the official default already exists enabled.
    repoUrls.forEach(repoUrl => {
      if (/^https:\/\//i.test(repoUrl) && !getRepositoryByUrl(repoUrl)) {
        db.runSync(
          'INSERT INTO installedRepositories (repoUrl, enabled) VALUES (?, 0)',
          [repoUrl],
        );
        summary.reposAdded++;
      }
    });
  }

  const ctx: RestoreContext = createRestoreContext();

  // --- categories first so novel inserts can carry their ids ---
  const v2Categories: V2Category[] = [];
  if (sections.library) {
    const parsed = parseJsonEntry(archive, ENTRY_CATEGORY);
    if (Array.isArray(parsed)) {
      v2Categories.push(...(parsed as V2Category[]));
    }
    if (v2Categories.length) {
      try {
        importCategories(
          ctx,
          v2Categories.map(category => ({
            id: category.id,
            name: category.name,
            sort: category.sort ?? null,
          })),
        );
        summary.categories.imported = v2Categories.filter(category =>
          ctx.categoryIds.has(category.id),
        ).length;
      } catch (error) {
        summary.errors.push(
          `Categories: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const categoriesByNovel = new Map<number, number[]>();
    v2Categories.forEach(category => {
      (category.novelIds ?? []).forEach(novelId => {
        const ids = categoriesByNovel.get(novelId) ?? [];
        ids.push(category.id);
        categoriesByNovel.set(novelId, ids);
      });
    });

    const historyRows: BackupHistoryRow[] = [];

    // --- library: per-novel JSONs through the v1 restore queries ---
    for (const entryName of novelEntries(archive)) {
      let v2novel: V2Novel & { chapters?: V2Chapter[] };
      try {
        v2novel = JSON.parse(bytesToUtf8(archive[entryName]));
      } catch (error) {
        summary.novels.failed++;
        summary.errors.push(
          `${entryName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }

      if (!v2novel.inLibrary) {
        // v2 archives its whole cache; only library novels migrate.
        summary.novels.skipped++;
        continue;
      }

      try {
        if (!v2novel.pluginId || typeof v2novel.pluginId !== 'string') {
          throw new Error('novel is missing its pluginId');
        }
        const pluginId = validatePluginId(v2novel.pluginId);
        const pluginRow = getPluginByPluginId(pluginId);
        const pluginItem = pluginItems.get(pluginId);
        const sourceId = pluginRow?.sourceId ?? upsertPlugin({ pluginId });
        const pluginName = pluginRow?.name ?? pluginItem?.name ?? pluginId;
        const pluginSite = pluginRow?.site ?? pluginItem?.site;

        const chapters = Array.isArray(v2novel.chapters)
          ? v2novel.chapters
          : [];
        const v1novel: BackupNovel = {
          novelId: v2novel.id,
          novelUrl: v2novel.path,
          sourceUrl: joinToSite(pluginSite, v2novel.path),
          sourceId,
          source: pluginName,
          novelName: v2novel.name ?? '',
          novelCover:
            v2novel.cover && /^https?:\/\//i.test(v2novel.cover)
              ? v2novel.cover
              : '',
          novelSummary: v2novel.summary ?? '',
          author: v2novel.author ?? '',
          artist: v2novel.artist ?? '',
          status: v2novel.status ?? '',
          genre: v2novel.genres ?? '',
          unread: 1,
          categoryIds: JSON.stringify(categoriesByNovel.get(v2novel.id) ?? []),
        };

        const v1chapters: BackupChapter[] = chapters.map(chapter => ({
          chapterId: chapter.id,
          chapterUrl: chapter.path,
          novelId: v2novel.id,
          chapterName: chapter.name ?? '',
          releaseDate: chapter.releaseTime ?? '',
          bookmark: chapter.bookmark ? 1 : 0,
          read: chapter.unread ? 0 : 1,
        }));

        importNovelWithChapters(ctx, v1novel, v1chapters);
        summary.novels.imported++;
        summary.chapters += v1chapters.length;

        // Downloaded state imports as the chapter flag only; chapter
        // file content (a separate v2 section) is not transferred.
        chapters.forEach(chapter => {
          if (!chapter.isDownloaded) {
            return;
          }
          const chapterId = ctx.chapterIds.get(chapter.id);
          if (chapterId) {
            db.runSync(
              'UPDATE chapters SET downloaded = 1 WHERE chapterId = ?',
              [chapterId],
            );
          }
        });

        chapters.forEach(chapter => {
          if (chapter.readTime) {
            historyRows.push({
              historyNovelId: v2novel.id,
              historyChapterId: chapter.id,
              historyTimeRead: chapter.readTime,
            });
          }
        });

        // --- covers ---
        const v1novelId = ctx.novelIds.get(v2novel.id);
        const coverIsLocal =
          !!v2novel.cover && !/^https?:\/\//i.test(v2novel.cover);
        const coverEntry = v1novelId
          ? archive[ENTRY_COVERS + v2novel.id]
          : undefined;
        if (v1novelId && coverIsLocal && coverEntry) {
          try {
            const dir = coversDir();
            dir.create({ intermediates: true, idempotent: true });
            const file = new File(dir, String(v2novel.id));
            if (!file.exists) {
              file.create();
            }
            file.write(coverEntry);
            db.runSync('UPDATE novels SET novelCover = ? WHERE novelId = ?', [
              file.uri,
              v1novelId,
            ]);
            summary.covers.imported++;
          } catch (error) {
            summary.covers.failed++;
            summary.errors.push(
              `Cover for "${v2novel.name ?? v2novel.id}": ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      } catch (error) {
        summary.novels.failed++;
        summary.errors.push(
          `${v2novel?.name ?? entryName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // --- history: last-read markers resolve through the new rows ---
    const resolvable = historyRows.filter(
      row =>
        ctx.novelIds.has(row.historyNovelId) &&
        ctx.chapterIds.has(row.historyChapterId),
    );
    summary.history.imported = resolvable.length;
    summary.history.skipped = historyRows.length - resolvable.length;
    importHistory(ctx, resolvable);
  }

  if (sections.settings && archive[ENTRY_SETTING]) {
    // Confirmed non-goal: v2 settings do not map onto v1 storage.
    summary.settingsIgnored = true;
  }

  return summary;
};

export const importV2Backup = async (): Promise<V2ImportSummary | null> => {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
    ],
  });

  const fileUri = picked.assets?.[0]?.uri;

  if (!fileUri) {
    return null;
  }

  const base64 = await StorageAccessFramework.readAsStringAsync(fileUri, {
    encoding: EncodingType.Base64,
  });

  return importV2BackupFromFile(base64ToBytes(base64));
};
