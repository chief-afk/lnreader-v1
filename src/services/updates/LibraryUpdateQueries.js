import { showToast } from '../../hooks/showToast';

import { fetchNovel } from '../Source/source';
import { downloadChapter } from '../../database/queries/ChapterQueries';

import { db } from '../../database/db';
import { getNovel } from '../../database/queries/NovelQueries';

const updateNovelMetadata = async (novelId, novel) => {
  const { novelName, novelCover, novelSummary, author, artist, genre, status } =
    novel;

  db.runSync(
    'UPDATE novels SET novelName = ?, novelCover = ?, novelSummary = ?, author = ?, artist = ?, genre = ?, status = ? WHERE novelId = ?',
    [
      novelName,
      novelCover,
      novelSummary,
      author,
      artist,
      genre,
      status,
      novelId,
    ],
  );
};

const insertUpdate = (chapterId, novelId) =>
  db.runSync(
    "INSERT OR IGNORE INTO updates (chapterId, novelId, updateTime) values (?, ?, (datetime('now','localtime')))",
    [chapterId, novelId],
  );

const updateNovel = async (sourceId, novelUrl, novelId, options) => {
  const { downloadNewChapters, refreshNovelMetadata } = options;

  let novel = await fetchNovel(sourceId, novelUrl);
  let forceMetdataUpdate = false;

  if (novelId === undefined) {
    // novelId will be undefined if novel is not saved in local library
    let dbNovel = await getNovel(sourceId, novelUrl);
    novelId = dbNovel.novelId;
    forceMetdataUpdate = true;
  }

  if (refreshNovelMetadata || forceMetdataUpdate) {
    updateNovelMetadata(novelId, novel);
  }

  novel.chapters.map(chapter => {
    const { chapterUrl, chapterName, releaseDate } = chapter;

    const result = db.runSync(
      'INSERT OR IGNORE INTO chapters (chapterUrl, chapterName, releaseDate, novelId) values (?, ?, ?, ?)',
      [chapterUrl, chapterName, releaseDate, novelId],
    );
    const insertId = Number(result.lastInsertRowId);
    if (insertId !== -1 && insertId !== 0) {
      if (downloadNewChapters) {
        downloadChapter(sourceId, novelUrl, novelId, chapterUrl, insertId);
      }
      insertUpdate(insertId, novelId);
    }
  });
};

export { updateNovel };
