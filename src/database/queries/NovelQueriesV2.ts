import { xor } from 'lodash-es';

import { db } from '../db';
import { LibraryNovelInfo } from '../types';
import { fetchNovel } from '../../services/Source/source';
import { showToast } from '@hooks/showToast';
import { getString } from '@strings/translations';
import { checkNovelInCache } from './NovelQueries';

export const getCategoryNovelsFromDb = (
  categoryId: number,
  onlyOngoingNovels?: boolean,
): LibraryNovelInfo[] => {
  let query = `
    SELECT * FROM novels
    WHERE (
      categoryIds LIKE '[${categoryId}]'
      OR categoryIds LIKE '[${categoryId},%'
      OR categoryIds LIKE '%,${categoryId}]'
      OR categoryIds LIKE '%,${categoryId},%'
    )
    AND followed = 1
  `;

  if (onlyOngoingNovels) {
    query += ' AND status NOT LIKE "Completed"';
  }

  return db.getAllSync<LibraryNovelInfo>(query);
};

export const resetCategoryIdsToDefault = (deletedCategoryId: number) => {
  const categoryNovels = getCategoryNovelsFromDb(deletedCategoryId);

  db.withTransactionSync(() => {
    categoryNovels.forEach(novel => {
      let categoryIds = xor(JSON.parse(novel.categoryIds), [deletedCategoryId]);
      categoryIds = categoryIds.length ? categoryIds : [1];

      db.runSync('UPDATE novels SET categoryIds = ? WHERE novelId = ?', [
        JSON.stringify(categoryIds),
        novel.novelId,
      ]);
    });
  });
};

export const insertNovelInLibrary = async (
  sourceId: number,
  novelUrl: string,
  inLibrary: boolean,
  defaultCategoryId: number,
) => {
  if (inLibrary) {
    showToast(getString('browseScreen.removeFromLibrary'));
    db.runSync(
      'UPDATE novels SET followed = 0 WHERE sourceId = ? AND novelUrl = ?',
      [sourceId, novelUrl],
    );
    return;
  }

  showToast(getString('browseScreen.addedToLibrary'));

  const novelSavedInDb = checkNovelInCache(novelUrl);

  if (novelSavedInDb) {
    db.runSync(
      'UPDATE novels SET followed = 1 WHERE sourceId = ? AND novelUrl = ?',
      [sourceId, novelUrl],
    );
    return;
  }

  const novel = await fetchNovel(sourceId, novelUrl);

  db.withTransactionSync(() => {
    const result = db.runSync(
      `INSERT INTO novels
        (novelUrl, sourceUrl, sourceId, source, novelName, novelCover,
         novelSummary, author, artist, status, genre, followed, categoryIds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
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
        JSON.stringify([defaultCategoryId]),
      ],
    );

    const insertId = result.lastInsertRowId;

    novel.chapters?.forEach(chapter => {
      db.runSync(
        `INSERT INTO chapters (chapterUrl, chapterName, releaseDate, novelId)
         VALUES (?, ?, ?, ?)`,
        [
          chapter.chapterUrl,
          chapter.chapterName,
          chapter.releaseDate || '',
          insertId,
        ],
      );
    });
  });
};

export const updateNovelCategoryById = (
  novelId: number,
  categoryIds: number[],
) => {
  db.runSync('UPDATE novels SET categoryIds = ? WHERE novelId = ?', [
    JSON.stringify(categoryIds.length ? categoryIds : [1]),
    novelId,
  ]);
};

export const updateNovelCategoryByIds = (
  novelIds: number[],
  categoryIds: number[],
) => {
  db.withTransactionSync(() => {
    novelIds.forEach(novelId =>
      db.runSync('UPDATE novels SET categoryIds = ? WHERE novelId = ?', [
        JSON.stringify(categoryIds.length ? categoryIds : [1]),
        novelId,
      ]),
    );
  });
};
