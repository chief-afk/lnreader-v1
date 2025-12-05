import { LibraryFilter } from '@screens/library/constants/constants';
import { LibraryNovelInfo, NovelInfo } from '../types';
import { db } from '../db';

const getLibraryQuery = `
  SELECT novels.*, C.chaptersUnread, D.chaptersDownloaded, H.lastReadAt, U.lastUpdatedAt
  FROM novels
  LEFT JOIN (
    SELECT chapters.novelId, COUNT(*) AS chaptersUnread
    FROM chapters
    WHERE chapters.read = 0
    GROUP BY chapters.novelId
  ) AS C ON novels.novelId = C.novelId
  LEFT JOIN (
    SELECT chapters.novelId, COUNT(*) AS chaptersDownloaded
    FROM chapters
    WHERE chapters.downloaded = 1
    GROUP BY chapters.novelId
  ) AS D ON novels.novelId = D.novelId
  LEFT JOIN (
    SELECT history.historyNovelId as novelId, historyTimeRead AS lastReadAt
    FROM history
    GROUP BY history.historyNovelId
    HAVING history.historyTimeRead = MAX(history.historyTimeRead)
    ORDER BY history.historyTimeRead DESC
  ) AS H ON novels.novelId = H.novelId
  LEFT JOIN (
    SELECT updates.novelId, updateTime AS lastUpdatedAt
    FROM updates
    GROUP BY updates.novelId
    HAVING updates.updateTime = MAX(updates.updateTime)
    ORDER BY updates.updateTime DESC
  ) AS U ON novels.novelId = U.novelId
  WHERE novels.followed = 1
`;

export const getLibrary = ({
  filter,
  searchText,
  sortOrder,
  downloadedOnlyMode,
}: {
  sortOrder?: string;
  filter?: string;
  searchText?: string;
  downloadedOnlyMode?: boolean;
}): LibraryNovelInfo[] => {
  let query = getLibraryQuery;

  if (filter) {
    query += ` AND ${filter}`;
  }

  if (downloadedOnlyMode) {
    query += ' ' + LibraryFilter.DownloadedOnly;
  }

  if (searchText) {
    query += ` AND novelName LIKE '%${searchText}%'`;
  }

  if (sortOrder) {
    query += ` ORDER BY ${sortOrder}`;
  }

  return db.getAllSync<LibraryNovelInfo>(query);
};

export const getLibraryNovelsFromDb = (
  onlyOngoingNovels?: boolean,
): NovelInfo[] => {
  let query = 'SELECT * FROM novels WHERE followed = 1';

  if (onlyOngoingNovels) {
    query += " AND status NOT LIKE 'Completed'";
  }

  return db.getAllSync<NovelInfo>(query);
};
