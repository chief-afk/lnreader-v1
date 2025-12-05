import { showToast } from '../../hooks/showToast';
import { sourceManager } from '../../sources/sourceManager';
import { DownloadedChapter } from '../types';
import { db } from '../db';
import {
  updateChapterDeletedQuery,
  updateChapterDownloadedQuery,
} from './ChapterQueries';

const downloadChapterQuery = `
  INSERT INTO downloads (downloadChapterId, chapterName, chapterText)
  VALUES (?, ?, ?)
`;

export const fetchAndInsertChapterInDb = async (
  sourceId: number,
  novelUrl: string,
  chapterId: number,
  chapterUrl: string,
) => {
  const chapter = await sourceManager(sourceId).parseChapter(
    novelUrl,
    chapterUrl,
  );

  db.withTransactionSync(() => {
    db.runSync(updateChapterDownloadedQuery, [chapterId]);
    db.runSync(downloadChapterQuery, [
      chapterId,
      chapter.chapterName || '',
      chapter.chapterText || '',
    ]);
  });
};

const deleteChapterFromDbQuery = `
  DELETE FROM downloads WHERE downloadChapterId = ?
`;

export const deleteChapterFromDb = (chapterId: number) => {
  db.withTransactionSync(() => {
    db.runSync(updateChapterDeletedQuery, [chapterId]);
    db.runSync(deleteChapterFromDbQuery, [chapterId]);
  });
};

const getChapterFromDbQuery = `
  SELECT * FROM downloads WHERE downloadChapterId = ?
`;

export const getChapterFromDb = (
  chapterId: number,
): DownloadedChapter | null => {
  return db.getFirstSync<DownloadedChapter>(getChapterFromDbQuery, [chapterId]);
};

const deleteReadChaptersFromDbQuery = `
  DELETE FROM downloads
  WHERE downloads.downloadChapterId IN (
    SELECT chapters.chapterId
    FROM downloads
    INNER JOIN chapters ON chapters.chapterId = downloads.downloadChapterId
    WHERE chapters.read = 1
  )
`;

const updateChaptersDeletedQuery = `
  UPDATE chapters SET downloaded = 0
  WHERE chapters.chapterId IN (
    SELECT downloads.downloadChapterId
    FROM downloads
    INNER JOIN chapters ON chapters.chapterId = downloads.downloadChapterId
    WHERE chapters.read = 1
  )
`;

export const deleteReadChaptersFromDb = () => {
  db.withTransactionSync(() => {
    db.runSync(updateChaptersDeletedQuery);
    db.runSync(deleteReadChaptersFromDbQuery);
  });
  showToast('Deleted read chapters.');
};
