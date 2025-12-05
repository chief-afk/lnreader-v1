import { showToast } from '../../hooks/showToast';
import { Update } from '../types';
import { db } from '../db';

const getUpdatesFromDbQuery = `
  SELECT
    chapters.chapterId,
    chapters.read,
    chapters.downloaded,
    chapters.chapterUrl,
    chapters.chapterName,
    chapters.bookmark,
    chapters.releaseDate,
    novels.novelUrl,
    novels.novelId,
    novels.novelCover,
    novels.novelName,
    novels.sourceId,
    updates.updateTime,
    updates.updateId
  FROM updates
  JOIN chapters ON updates.chapterId = chapters.chapterId
  JOIN novels ON updates.novelId = novels.novelId
  WHERE date(updates.updateTime) > date('now','-3 months')
  ORDER BY updates.updateTime DESC, chapters.chapterName DESC, chapters.releaseDate DESC
`;

export const getUpdatesFromDb = (): Update[] => {
  return db.getAllSync<Update>(getUpdatesFromDbQuery);
};

const insertChapterUpdateQuery = `
  INSERT OR IGNORE INTO updates (chapterId, novelId, updateTime)
  VALUES (?, ?, (datetime('now','localtime')))
`;

export const insertChapterUpdate = (chapterId: number, novelId: number) => {
  db.runSync(insertChapterUpdateQuery, [chapterId, novelId]);
};

const deleteUpdateFromDbQuery = `
  DELETE FROM updates WHERE novelId = ?
`;

export const deleteUpdateFromDb = (novelId: number) => {
  db.runSync(deleteUpdateFromDbQuery, [novelId]);
};

export const clearUpdates = () => {
  db.runSync('DELETE FROM updates');
  showToast('Updates cleared.');
};
