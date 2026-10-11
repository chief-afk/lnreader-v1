import { SQLiteDatabase } from 'expo-sqlite';

import { db } from '../db';

export interface BackupCategory {
  id: number;
  name: string;
  sort?: number | null;
}

export interface BackupChapter {
  chapterId: number;
  chapterUrl: string;
  novelId: number;
  chapterName: string;
  releaseDate?: string;
  bookmark?: number;
  read?: number;
}

export interface BackupHistoryRow {
  historyNovelId: number;
  historyChapterId: number;
  historyTimeRead: string;
}

export interface BackupNovel {
  novelId: number;
  novelUrl: string;
  sourceUrl: string;
  sourceId: number;
  source: string;
  novelName: string;
  novelCover?: string;
  novelSummary?: string;
  author?: string;
  artist?: string;
  status?: string;
  genre?: string;
  unread?: number;
  categoryIds?: string;
}

export interface RestoreContext {
  categoryIds: Map<number, number>;
  novelIds: Map<number, number>;
  chapterIds: Map<number, number>;
}

export const createRestoreContext = (): RestoreContext => ({
  categoryIds: new Map(),
  novelIds: new Map(),
  chapterIds: new Map(),
});

const getCategoryByNameQuery = 'SELECT id FROM categories WHERE name = ?';

const insertCategoryQuery = 'INSERT INTO categories (name, sort) VALUES (?, ?)';

const getNovelBySourceUrlQuery = 'SELECT * FROM novels WHERE sourceUrl = ?';

const insertBackupNovelQuery =
  'INSERT INTO novels (novelUrl, sourceUrl, sourceId, source, novelName, novelCover, novelSummary, author, artist, status, genre, followed, unread, categoryIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)';

const updateNovelCategoryIdsQuery =
  'UPDATE novels SET categoryIds = ?, followed = 1 WHERE novelId = ?';

const getChapterByNovelAndUrlQuery =
  'SELECT chapterId, `read`, bookmark FROM chapters WHERE novelId = ? AND chapterUrl = ?';

const insertBackupChapterQuery =
  'INSERT INTO chapters (chapterUrl, chapterName, releaseDate, novelId, bookmark, `read`, downloaded) VALUES (?, ?, ?, ?, ?, ?, 0)';

const markChapterReadByIdQuery =
  'UPDATE chapters SET `read` = 1 WHERE chapterId = ?';

const markChapterBookmarkedQuery =
  'UPDATE chapters SET bookmark = 1 WHERE chapterId = ?';

const insertHistoryRowQuery =
  'INSERT OR REPLACE INTO history (historyNovelId, historyChapterId, historyTimeRead) VALUES (?, ?, ?)';

const markNovelOpenedQuery = 'UPDATE novels SET unread = 0 WHERE novelId = ?';

const parseCategoryIds = (raw?: string): number[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const remapCategoryIds = (ctx: RestoreContext, raw?: string): number[] => {
  const remapped = parseCategoryIds(raw).map(
    id => ctx.categoryIds.get(id) ?? id,
  );
  return remapped.length ? remapped : [1];
};

export const importCategories = (
  ctx: RestoreContext,
  categories?: BackupCategory[],
) => {
  if (!categories?.length) {
    return;
  }

  db.withTransactionSync(() => {
    categories.forEach(category => {
      const existing = db.getFirstSync<{ id: number }>(getCategoryByNameQuery, [
        category.name,
      ]);

      if (existing) {
        ctx.categoryIds.set(category.id, existing.id);
      } else {
        const result = db.runSync(insertCategoryQuery, [
          category.name,
          category.sort ?? null,
        ]);
        ctx.categoryIds.set(category.id, result.lastInsertRowId);
      }
    });
  });
};

export const importNovelWithChapters = (
  ctx: RestoreContext,
  novel: BackupNovel,
  chapters?: BackupChapter[],
) => {
  db.withTransactionSync(() => {
    const categoryIds = remapCategoryIds(ctx, novel.categoryIds);
    const existing = db.getFirstSync<{ novelId: number; categoryIds: string }>(
      getNovelBySourceUrlQuery,
      [novel.sourceUrl],
    );

    let novelId: number;

    if (existing) {
      novelId = existing.novelId;

      const merged = Array.from(
        new Set([...parseCategoryIds(existing.categoryIds), ...categoryIds]),
      );
      db.runSync(updateNovelCategoryIdsQuery, [
        JSON.stringify(merged.length ? merged : [1]),
        novelId,
      ]);
    } else {
      const result = db.runSync(insertBackupNovelQuery, [
        novel.novelUrl,
        novel.sourceUrl,
        novel.sourceId,
        novel.source,
        novel.novelName,
        novel.novelCover || '',
        novel.novelSummary || '',
        novel.author || '',
        novel.artist || '',
        novel.status || '',
        novel.genre || '',
        novel.unread ?? 1,
        JSON.stringify(categoryIds),
      ]);
      novelId = result.lastInsertRowId;
    }

    ctx.novelIds.set(novel.novelId, novelId);

    (chapters || []).forEach(chapter => {
      const existingChapter = db.getFirstSync<{
        chapterId: number;
        read: number;
        bookmark: number;
      }>(getChapterByNovelAndUrlQuery, [novelId, chapter.chapterUrl]);

      if (existingChapter) {
        ctx.chapterIds.set(chapter.chapterId, existingChapter.chapterId);

        if (chapter.read && !existingChapter.read) {
          db.runSync(markChapterReadByIdQuery, [existingChapter.chapterId]);
        }
        if (chapter.bookmark && !existingChapter.bookmark) {
          db.runSync(markChapterBookmarkedQuery, [existingChapter.chapterId]);
        }
      } else {
        const result = db.runSync(insertBackupChapterQuery, [
          chapter.chapterUrl,
          chapter.chapterName || '',
          chapter.releaseDate || '',
          novelId,
          chapter.bookmark ? 1 : 0,
          chapter.read ? 1 : 0,
        ]);
        ctx.chapterIds.set(chapter.chapterId, result.lastInsertRowId);
      }
    });
  });
};

export const importHistory = (
  ctx: RestoreContext,
  history?: BackupHistoryRow[],
) => {
  if (!history?.length) {
    return;
  }

  db.withTransactionSync(() => {
    history.forEach(row => {
      const novelId = ctx.novelIds.get(row.historyNovelId);
      const chapterId = ctx.chapterIds.get(row.historyChapterId);

      if (novelId && chapterId) {
        db.runSync(insertHistoryRowQuery, [
          novelId,
          chapterId,
          row.historyTimeRead,
        ]);
        db.runSync(markNovelOpenedQuery, [novelId]);
      }
    });
  });
};

export const getBackupExportData = () => {
  const novels = db.getAllSync('SELECT * FROM novels WHERE followed = 1');
  const categories = db.getAllSync('SELECT id, name, sort FROM categories');
  const chapters = db.getAllSync(
    'SELECT chapters.* FROM chapters JOIN novels ON chapters.novelId = novels.novelId WHERE novels.followed = 1',
  );
  const history = db.getAllSync(
    'SELECT history.historyNovelId, history.historyChapterId, history.historyTimeRead FROM history JOIN chapters ON history.historyChapterId = chapters.chapterId JOIN novels ON novels.novelId = chapters.novelId WHERE novels.followed = 1',
  );

  return { novels, categories, chapters, history };
};

export const isLNReaderDatabase = (handle: SQLiteDatabase): boolean => {
  const tables = handle.getAllSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  return tables.some(table => table.name === 'novels');
};

export const readLegacyDatabase = (
  handle: SQLiteDatabase,
): {
  novels: BackupNovel[];
  categories: BackupCategory[];
  chapters: BackupChapter[];
  history: BackupHistoryRow[];
} => {
  const novels = handle.getAllSync<BackupNovel>(
    'SELECT * FROM novels WHERE followed = 1',
  );

  let categories: BackupCategory[];
  try {
    categories = handle.getAllSync<BackupCategory>(
      'SELECT id, name, sort FROM categories',
    );
  } catch {
    categories = handle.getAllSync<BackupCategory>(
      'SELECT id, name FROM categories',
    );
  }

  const chapters = handle.getAllSync<BackupChapter>(
    'SELECT chapters.chapterId, chapters.chapterUrl, chapters.novelId, chapters.chapterName, chapters.releaseDate, chapters.bookmark, chapters.read FROM chapters JOIN novels ON chapters.novelId = novels.novelId WHERE novels.followed = 1',
  );
  const history = handle.getAllSync<BackupHistoryRow>(
    'SELECT history.historyNovelId, history.historyChapterId, history.historyTimeRead FROM history JOIN chapters ON history.historyChapterId = chapters.chapterId JOIN novels ON novels.novelId = chapters.novelId WHERE novels.followed = 1',
  );

  return { novels, categories, chapters, history };
};
