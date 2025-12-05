import { showToast } from '../../hooks/showToast';
import { sourceManager } from '../../sources/sourceManager';
import { ChapterItem, DownloadedChapter } from '../types';
import { db } from '../db';

import * as cheerio from 'cheerio';
import RNFetchBlob from 'react-native-blob-util';

const insertChaptersQuery = `
INSERT INTO chapters (
  chapterUrl, chapterName, releaseDate,
  novelId
)
values
  (?, ?, ?, ?)
`;

export const insertChapters = (novelId: number, chapters?: ChapterItem[]) => {
  if (!chapters?.length) {
    return;
  }

  db.withTransactionSync(() => {
    chapters.forEach(chapter =>
      db.runSync(insertChaptersQuery, [
        chapter.chapterUrl,
        chapter.chapterName,
        chapter.releaseDate || '',
        novelId,
      ]),
    );
  });
};

const getChaptersQuery = (sort = 'ORDER BY chapterId ASC', filter = '') =>
  `SELECT * FROM chapters WHERE novelId = ? ${filter} ${sort}`;

export const getChapters = (
  novelId: number,
  sort: string,
  filter: string,
): ChapterItem[] => {
  return db.getAllSync<ChapterItem>(getChaptersQuery(sort, filter), [novelId]);
};

const getChapterQuery = 'SELECT * FROM downloads WHERE downloadChapterId = ?';

export const getChapterFromDB = (
  chapterId: number,
): DownloadedChapter | null => {
  return db.getFirstSync<DownloadedChapter>(getChapterQuery, [chapterId]);
};

const getPrevChapterQuery = `
  SELECT * FROM chapters WHERE novelId = ? AND chapterId < ?
`;

export const getPrevChapter = (
  novelId: number,
  chapterId: number,
): ChapterItem | null => {
  const chapters = db.getAllSync<ChapterItem>(getPrevChapterQuery, [
    novelId,
    chapterId,
  ]);
  return chapters.length > 0 ? chapters[chapters.length - 1] : null;
};

const getNextChapterQuery = `
  SELECT * FROM chapters WHERE novelId = ? AND chapterId > ?
`;

export const getNextChapter = (
  novelId: number,
  chapterId: number,
): ChapterItem | null => {
  return db.getFirstSync<ChapterItem>(getNextChapterQuery, [
    novelId,
    chapterId,
  ]);
};

const markChapterReadQuery =
  'UPDATE chapters SET `read` = 1 WHERE chapterId = ?';

export const markChapterRead = (chapterId: number) => {
  db.runSync(markChapterReadQuery, [chapterId]);
};

const markChapterUnreadQuery =
  'UPDATE chapters SET `read` = 0 WHERE chapterId = ?';

export const markChapterUnread = (chapterId: number) => {
  db.runSync(markChapterUnreadQuery, [chapterId]);
};

const markAllChaptersReadQuery =
  'UPDATE chapters SET `read` = 1 WHERE novelId = ?';

export const markAllChaptersRead = (novelId: number) => {
  db.runSync(markAllChaptersReadQuery, [novelId]);
};

const markAllChaptersUnreadQuery =
  'UPDATE chapters SET `read` = 0 WHERE novelId = ?';

export const markAllChaptersUnread = (novelId: number) => {
  db.runSync(markAllChaptersUnreadQuery, [novelId]);
};

const isChapterDownloadedQuery =
  'SELECT * FROM downloads WHERE downloadChapterId=?';

export const isChapterDownloaded = (chapterId: number): boolean => {
  const result = db.getFirstSync(isChapterDownloadedQuery, [chapterId]);
  return result !== null;
};

const downloadChapterQuery =
  'INSERT INTO downloads (downloadChapterId, chapterName, chapterText) VALUES (?, ?, ?)';

const createImageFolder = async (
  path: string,
  data?: {
    sourceId: number;
    novelId: number;
    chapterId: number;
  },
): Promise<string> => {
  const mkdirIfNot = async (p: string) => {
    const nomediaPath =
      p + (p.charAt(p.length - 1) === '/' ? '' : '/') + '.nomedia';
    if (!(await RNFetchBlob.fs.exists(p))) {
      await RNFetchBlob.fs.mkdir(p);
      await RNFetchBlob.fs.createFile(nomediaPath, ',', 'utf8');
    }
  };

  await mkdirIfNot(path);

  if (data) {
    const { sourceId, novelId, chapterId } = data;
    await mkdirIfNot(`${path}/${sourceId}/`);
    await mkdirIfNot(`${path}/${sourceId}/${novelId}/`);
    await mkdirIfNot(`${path}/${sourceId}/${novelId}/${chapterId}/`);
    return `${path}/${sourceId}/${novelId}/${chapterId}/`;
  } else {
    return path;
  }
};

const downloadImages = async (
  html: string,
  sourceId: number,
  novelId: number,
  chapterId: number,
): Promise<string> => {
  try {
    const headers = sourceManager(sourceId)?.headers || {};
    const loadedCheerio = cheerio.load(html);
    const imgs = loadedCheerio('img').toArray();
    for (let i = 0; i < imgs.length; i++) {
      const elem = loadedCheerio(imgs[i]);
      const url = elem.attr('src');
      if (url) {
        const imageb64 = (
          await RNFetchBlob.fetch('GET', url, headers)
        ).base64();
        const fileurl =
          (await createImageFolder(
            `${RNFetchBlob.fs.dirs.DownloadDir}/LNReader`,
            { sourceId, novelId, chapterId },
          ).catch(() => {
            showToast(
              `Unexpected storage error!\nRemove ${fileurl} and try downloading again`,
            );
            return '--';
          })) +
          i +
          '.b64.png';
        if (fileurl.charAt(0) === '-') {
          return loadedCheerio.html();
        }
        elem.attr('src', `file://${fileurl}`);
        const exists = await RNFetchBlob.fs.exists(fileurl).catch(() => {
          showToast(
            `Unexpected storage error!\nRemove ${fileurl} and try downloading again`,
          );
        });
        if (!exists) {
          RNFetchBlob.fs.createFile(fileurl, imageb64, 'base64').catch(() => {
            showToast(
              `Unexpected storage error!\nRemove ${fileurl} and try downloading again`,
            );
          });
        } else {
          RNFetchBlob.fs.writeFile(fileurl, imageb64, 'base64').catch(() => {
            showToast(
              `Unexpected storage error!\nRemove ${fileurl} and try downloading again`,
            );
          });
        }
      }
    }
    loadedCheerio('body').prepend("<input type='hidden' offline />");
    return loadedCheerio.html();
  } catch {
    return html;
  }
};

export const downloadChapter = async (
  sourceId: number,
  novelUrl: string,
  novelId: number,
  chapterUrl: string,
  chapterId: number,
) => {
  const source = sourceManager(sourceId);
  const chapter = await source.parseChapter(novelUrl, chapterUrl);

  if (!chapter.chapterText?.length) {
    throw new Error("Either chapter is empty or the app couldn't scrape it");
  }

  const imagedChapterText = await downloadImages(
    chapter.chapterText,
    sourceId,
    novelId,
    chapterId,
  );

  db.withTransactionSync(() => {
    db.runSync('UPDATE chapters SET downloaded = 1 WHERE chapterId = ?', [
      chapterId,
    ]);
    db.runSync(downloadChapterQuery, [
      chapterId,
      chapter.chapterName || '',
      imagedChapterText,
    ]);
  });
};

const deleteDownloadedImages = async (
  sourceId: number,
  novelId: number,
  chapterId: number,
) => {
  try {
    const path = await createImageFolder(
      `${RNFetchBlob.fs.dirs.DownloadDir}/LNReader`,
      { sourceId, novelId, chapterId },
    );
    const files = await RNFetchBlob.fs.ls(path);
    for (let i = 0; i < files.length; i++) {
      const ex = /\.b64\.png/.exec(files[i]);
      if (ex) {
        if (await RNFetchBlob.fs.exists(`${path}${files[i]}`)) {
          RNFetchBlob.fs.unlink(`${path}${files[i]}`);
        }
      }
    }
  } catch {}
};

export const deleteChapter = async (
  sourceId: number,
  novelId: number,
  chapterId: number,
) => {
  await deleteDownloadedImages(sourceId, novelId, chapterId);

  db.withTransactionSync(() => {
    db.runSync('UPDATE chapters SET downloaded = 0 WHERE chapterId=?', [
      chapterId,
    ]);
    db.runSync('DELETE FROM downloads WHERE downloadChapterId=?', [chapterId]);
  });
};

export const deleteChapters = async (
  sourceId: number,
  chapters?: ChapterItem[],
) => {
  if (!chapters?.length) {
    return;
  }

  const chapterIdsString = chapters
    .map(chapter => chapter.chapterId)
    .toString();

  await Promise.all(
    chapters.map(chapter =>
      deleteDownloadedImages(sourceId, chapter.novelId, chapter.chapterId),
    ),
  );

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE chapters SET downloaded = 0 WHERE chapterId IN (${chapterIdsString})`,
    );
    db.runSync(
      `DELETE FROM downloads WHERE downloadChapterId IN (${chapterIdsString})`,
    );
  });
};

const getLastReadChapterQuery = `
  SELECT chapters.*
  FROM history
  JOIN chapters ON history.historyChapterId = chapters.chapterId
  WHERE history.historyNovelId = ?
`;

export const getLastReadChapter = (novelId: number): ChapterItem | null => {
  return db.getFirstSync<ChapterItem>(getLastReadChapterQuery, [novelId]);
};

const bookmarkChapterQuery =
  'UPDATE chapters SET bookmark = ? WHERE chapterId = ?';

export const bookmarkChapter = (bookmark: boolean, chapterId: number) => {
  db.runSync(bookmarkChapterQuery, [!bookmark ? 1 : 0, chapterId]);
};

const markPreviuschaptersReadQuery =
  'UPDATE chapters SET `read` = 1 WHERE chapterId < ? AND novelId = ?';

export const markPreviuschaptersRead = (chapterId: number, novelId: number) => {
  db.runSync(markPreviuschaptersReadQuery, [chapterId, novelId]);
};

const markPreviousChaptersUnreadQuery =
  'UPDATE chapters SET `read` = 0 WHERE chapterId < ? AND novelId = ?';

export const markPreviousChaptersUnread = (
  chapterId: number,
  novelId: number,
) => {
  db.runSync(markPreviousChaptersUnreadQuery, [chapterId, novelId]);
};

const getDownloadedChaptersQuery = `
  SELECT chapters.*, novels.sourceId, novels.novelName, novels.novelCover, novels.novelUrl
  FROM chapters
  JOIN novels ON chapters.novelId = novels.novelId
  WHERE chapters.downloaded = 1
`;

export const getDownloadedChapters = () => {
  return db.getAllSync(getDownloadedChaptersQuery);
};

export const deleteDownloads = () => {
  db.withTransactionSync(() => {
    db.runSync('UPDATE chapters SET downloaded = 0');
    db.runSync('DELETE FROM downloads');
  });
};

export const updateChapterDownloadedQuery = `
  UPDATE chapters SET downloaded = 1 WHERE chapterId = ?
`;

export const updateChapterDeletedQuery = `
  UPDATE chapters SET downloaded = 0 WHERE chapterId = ?
`;
