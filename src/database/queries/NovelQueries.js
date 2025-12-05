import BackgroundService from 'react-native-background-actions';
import * as DocumentPicker from 'expo-document-picker';

import { fetchChapters, fetchNovel } from '../../services/Source/source';
import { insertChapters } from './ChapterQueries';
import { db } from '../db';
import { showToast } from '../../hooks/showToast';

const insertNovelQuery =
  'INSERT INTO novels (novelUrl, sourceUrl, sourceId, source, novelName, novelCover, novelSummary, author, artist, status, genre, categoryIds) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const insertNovel = novel => {
  const result = db.runSync(insertNovelQuery, [
    novel.novelUrl,
    novel.sourceUrl,
    novel.sourceId,
    novel.source,
    novel.novelName,
    novel.novelCover || '',
    novel.novelSummary,
    novel.author,
    novel.artist,
    novel.status,
    novel.genre,
    JSON.stringify(novel.categoryIds),
  ]);
  return result.lastInsertRowId;
};

export const followNovel = (followed, novelId) => {
  db.runSync('UPDATE novels SET followed = ? WHERE novelId = ?', [
    !followed ? 1 : 0,
    novelId,
  ]);
};

const checkNovelInCacheQuery = 'SELECT * FROM novels WHERE novelUrl=? LIMIT 1';

export const checkNovelInCache = novelUrl => {
  const result = db.getFirstSync(checkNovelInCacheQuery, [novelUrl]);
  return result !== null;
};

export const getNovel = (sourceId, novelUrl) => {
  return db.getFirstSync(
    'SELECT * FROM novels WHERE novelUrl = ? AND sourceId = ?',
    [novelUrl, sourceId],
  );
};

export const deleteNovelCache = () => {
  db.runSync('DELETE FROM novels WHERE followed = 0');
  showToast('Entries deleted');
};

const restoreFromBackupQuery =
  'INSERT INTO novels (novelUrl, sourceUrl, sourceId, source, novelName, novelCover, novelSummary, author, artist, status, genre, followed, unread) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const restoreLibrary = async novel => {
  const result = db.runSync(restoreFromBackupQuery, [
    novel.novelUrl,
    novel.sourceUrl,
    novel.sourceId,
    novel.source,
    novel.novelName,
    novel.novelCover,
    novel.novelSummary,
    novel.author,
    novel.artist,
    novel.status,
    novel.genre,
    novel.followed,
    novel.unread,
  ]);

  const insertId = result.lastInsertRowId;
  const chapters = await fetchChapters(novel.sourceId, novel.novelUrl);

  if (chapters.length) {
    insertChapters(insertId, chapters);
  }
};

const migrateNovelQuery =
  'INSERT INTO novels (novelUrl, sourceUrl, sourceId, source, novelName, novelCover, novelSummary, author, artist, status, genre, followed) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const migrateNovel = async (sourceId, novelUrl) => {
  try {
    const novel = await fetchNovel(sourceId, novelUrl);

    const options = {
      taskName: 'Migration',
      taskTitle: `Migrating ${novel.novelName} to new source`,
      taskDesc: novel.source,
      taskIcon: {
        name: 'notification_icon',
        type: 'drawable',
      },
      color: '#00adb5',
      parameters: {
        delay: 1000,
      },
      progressBar: {
        max: 1,
        value: 0,
        indeterminate: true,
      },
    };

    const veryIntensiveTask = async () => {
      const result = db.runSync(migrateNovelQuery, [
        novel.novelUrl,
        novel.sourceUrl,
        novel.sourceId,
        novel.source,
        novel.novelName,
        novel.novelCover,
        novel.novelSummary,
        novel.author,
        novel.artist,
        novel.status,
        novel.genre,
        1,
      ]);

      const insertId = result.lastInsertRowId;
      const chapters = await fetchChapters(novel.sourceId, novel.novelUrl);
      insertChapters(insertId, chapters);
    };

    await BackgroundService.start(veryIntensiveTask, options);
    await BackgroundService.updateNotification({
      progressBar: { value: 1, indeterminate: false },
    });
  } catch (error) {
    showToast(error.message);
  }
};

export const updateNovelInfo = (info, novelId) => {
  db.runSync(
    'UPDATE novels SET novelName = ?, novelSummary = ?, author = ?, genre = ?, status = ? WHERE novelId = ?',
    [
      info.novelName,
      info.novelSummary,
      info.author,
      info.genre,
      info.status,
      novelId,
    ],
  );
};

export const pickCustomNovelCover = async novelId => {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' });

  if (!result.canceled && result.assets?.[0]?.uri) {
    const uri = 'file://' + result.assets[0].uri;
    db.runSync('UPDATE novels SET novelCover = ? WHERE novelId = ?', [
      uri,
      novelId,
    ]);
    return result.assets[0].uri;
  }
};
