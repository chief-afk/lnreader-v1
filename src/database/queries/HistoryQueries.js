import { db } from '../db';
import { showToast } from '../../hooks/showToast';

const getHistoryQuery = `
  SELECT history.*, chapters.*, novels.*
  FROM history
  JOIN chapters ON history.historyChapterId = chapters.chapterId
  JOIN novels ON history.historyNovelId = novels.novelId
  GROUP BY novels.novelId
  HAVING history.historyTimeRead = MAX(history.historyTimeRead)
  ORDER BY history.historyTimeRead DESC
`;

export const getHistoryFromDb = () => {
  return db.getAllSync(getHistoryQuery);
};

export const insertHistory = (novelId, chapterId) => {
  db.withTransactionSync(() => {
    db.runSync(
      "INSERT OR REPLACE INTO history (historyNovelId, historyChapterId, historyTimeRead) VALUES (?, ?, (datetime('now','localtime')))",
      [novelId, chapterId],
    );
    db.runSync('UPDATE novels SET unread = 0 WHERE novelId = ?', [novelId]);
  });
};

export const deleteChapterHistory = historyId => {
  db.runSync('DELETE FROM history WHERE historyId = ?', [historyId]);
};

export const deleteAllHistory = () => {
  db.runSync('DELETE FROM history');
  showToast('History deleted.');
};
