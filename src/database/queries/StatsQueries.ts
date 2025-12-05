import { countBy } from 'lodash-es';
import { LibraryStats } from '../types';
import { db } from '../db';

const getLibraryStatsQuery = `
  SELECT COUNT(*) as novelsCount, COUNT(DISTINCT sourceId) as sourcesCount
  FROM novels WHERE novels.followed = 1
`;

const getChaptersReadCountQuery = `
  SELECT COUNT(*) as chaptersRead
  FROM chapters
  JOIN novels ON chapters.novelId = novels.novelId
  WHERE chapters.read = 1 AND novels.followed = 1
`;

const getChaptersTotalCountQuery = `
  SELECT COUNT(*) as chaptersCount
  FROM chapters
  JOIN novels ON chapters.novelId = novels.novelId
  WHERE novels.followed = 1
`;

const getChaptersUnreadCountQuery = `
  SELECT COUNT(*) as chaptersUnread
  FROM chapters
  JOIN novels ON chapters.novelId = novels.novelId
  WHERE chapters.read = 0 AND novels.followed = 1
`;

const getChaptersDownloadedCountQuery = `
  SELECT COUNT(*) as chaptersDownloaded
  FROM chapters
  JOIN novels ON chapters.novelId = novels.novelId
  WHERE chapters.downloaded = 1 AND novels.followed = 1
`;

const getNovelGenresQuery = `
  SELECT genre FROM novels WHERE novels.followed = 1
`;

const getNovelStatusQuery = `
  SELECT status FROM novels WHERE novels.followed = 1
`;

export const getLibraryStatsFromDb = (): LibraryStats => {
  return db.getFirstSync<LibraryStats>(getLibraryStatsQuery) || {};
};

export const getChaptersTotalCountFromDb = (): LibraryStats => {
  return db.getFirstSync<LibraryStats>(getChaptersTotalCountQuery) || {};
};

export const getChaptersReadCountFromDb = (): LibraryStats => {
  return db.getFirstSync<LibraryStats>(getChaptersReadCountQuery) || {};
};

export const getChaptersUnreadCountFromDb = (): LibraryStats => {
  return db.getFirstSync<LibraryStats>(getChaptersUnreadCountQuery) || {};
};

export const getChaptersDownloadedCountFromDb = (): LibraryStats => {
  return db.getFirstSync<LibraryStats>(getChaptersDownloadedCountQuery) || {};
};

export const getNovelGenresFromDb = (): LibraryStats => {
  const rows = db.getAllSync<{ genre: string }>(getNovelGenresQuery);
  const genres: string[] = [];

  rows.forEach(item => {
    const novelGenres = item.genre?.split(/\s*,\s*/);
    if (novelGenres?.length) {
      genres.push(...novelGenres);
    }
  });

  return { genres: countBy(genres) };
};

export const getNovelStatusFromDb = (): LibraryStats => {
  const rows = db.getAllSync<{ status: string }>(getNovelStatusQuery);
  const status = rows.map(item => item.status);
  return { status: countBy(status) };
};
