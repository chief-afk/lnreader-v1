import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import {
  createNovelTableQuery,
  createUrlIndexQuery,
  createLibraryIndexQuery,
  addCategoryColumnQuery,
} from './tables/NovelTable';
import {
  createChapterTableQuery,
  createNovelIdIndexQuery,
  createUnreadChaptersIndexQuery,
} from './tables/ChapterTable';
import {
  createHistoryTableQuery,
  createChapterIdIndexQuery,
} from './tables/HistoryTable';
import {
  createDownloadIdIndex,
  createDownloadTableQuery,
} from './tables/DownloadTable';
import { createUpdatesTableQuery } from './tables/UpdateTable';
import {
  addCategorySortColumnQuery,
  createCategoriesTableQuery,
  createCategorydIndexQuery,
  createDefaultCategoryQuery,
} from './tables/CategoryTable';

const dbName = 'lnreader.db';

export const db: SQLiteDatabase = openDatabaseSync(dbName);

const createTables = () => {
  db.withTransactionSync(() => {
    db.runSync(createCategoriesTableQuery);
    try {
      db.runSync(addCategorySortColumnQuery);
    } catch {}
    try {
      db.runSync(createDefaultCategoryQuery);
    } catch {}
    db.runSync(createNovelTableQuery);
    try {
      db.runSync(addCategoryColumnQuery);
    } catch {}
    db.runSync(createChapterTableQuery);
    db.runSync(createHistoryTableQuery);
    db.runSync(createDownloadTableQuery);
    db.runSync(createUpdatesTableQuery);
  });
};

const createIndexes = () => {
  db.withTransactionSync(() => {
    db.runSync(createUrlIndexQuery);
    db.runSync(createLibraryIndexQuery);
    db.runSync(createNovelIdIndexQuery);
    db.runSync(createUnreadChaptersIndexQuery);
    db.runSync(createChapterIdIndexQuery);
    db.runSync(createCategorydIndexQuery);
    db.runSync(createDownloadIdIndex);
  });
};

export const createDatabase = () => {
  createTables();
  createIndexes();
};

/**
 * For Testing
 */
export const deleteDatabase = () => {
  db.withTransactionSync(() => {
    db.runSync('DROP TABLE IF EXISTS novels');
    db.runSync('DROP TABLE IF EXISTS chapters');
    db.runSync('DROP TABLE IF EXISTS history');
    db.runSync('DROP TABLE IF EXISTS downloads');
    db.runSync('DROP TABLE IF EXISTS updates');
    db.runSync('DROP TABLE IF EXISTS categories');
  });
};
