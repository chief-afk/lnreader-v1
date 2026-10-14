import * as cheerio from 'cheerio';
import { defaultCoverUri } from '../helpers/constants';

// the site's 2025 redesign renamed everything: rankings live under
// yomou/rank with c-card items, novels use p-novel/p-eplist classes
const site = 'https://yomou.syosetu.com/';
const novelPrefix = 'https://ncode.syosetu.com';

const sourceId = 36;

const sourceName = 'Syosetu';

// there are no covers on Syosetu
const novelCover = defaultCoverUri;

// get the Syosetu ID of a novel (/n2267be/) or chapter (/n2267be/1/)
const getLastPartOfUrl = url => {
  let temp = /.*(?=\/)(.{2,})$/.exec(url);
  return temp ? temp[1].replace(/\//g, '') : null;
};

const getNovelUrl = id => `${novelPrefix}/${id}`;

const getChapterUrl = (id, chn) =>
  `${novelPrefix}/${id}${chn === 'oneshot' ? '' : `/${chn}`}`;

// the ranking list clamps out-of-range pages to the last one; the pager
// marks the served page with .is-current (absent on page 1)
const getRankPageNovels = async pagenumber => {
  const url = `${site}rank/list/type/total_total/?p=${pagenumber}`;

  const result = await fetch(url);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  const servedPage = parseInt(loadedCheerio('.is-current').text() || '1', 10);
  if (servedPage !== pagenumber) {
    return [];
  }

  let novels = [];

  loadedCheerio('.c-card .p-ranklist-item__title a').each(function () {
    const href = loadedCheerio(this).attr('href');
    if (!href) {
      return;
    }

    novels.push({
      novelName: loadedCheerio(this).text(),
      novelUrl: getLastPartOfUrl(href),
      sourceId,
      novelCover,
    });
  });

  return novels;
};

const popularNovels = async page => {
  return { novels: await getRankPageNovels(parseInt(page, 10) || 1) };
};

// the episode list is paginated 100 per page; read the total from the
// last-page pager link and fetch the remaining pages in parallel
const getChapters = loadedCheerio =>
  loadedCheerio('.p-eplist__sublist')
    .map(function () {
      const chapterA = loadedCheerio(this).find('a');
      return {
        chapterName: chapterA.text().trim(),
        releaseDate: loadedCheerio(this)
          .find('.p-eplist__update')
          .text()
          .trim()
          .split(' ')[0]
          .replace(/\//g, '-'),
        chapterUrl: getLastPartOfUrl(chapterA.attr('href')),
      };
    })
    .toArray();

const parseNovelAndChapters = async novelUrl => {
  const url = getNovelUrl(novelUrl);

  const result = await fetch(url);
  const body = await result.text();
  const cheerioQuery = cheerio.load(body);

  const announceText = cheerioQuery('.c-announce').text();

  let novel = {
    sourceId,
    sourceName,
    url,
    novelUrl,
    novelName: cheerioQuery('.p-novel__title').text(),
    author: cheerioQuery('.p-novel__author')
      .text()
      .replace('作者：', '')
      .trim(),
    novelCover,
    status:
      announceText.includes('連載中') || announceText.includes('未完結')
        ? 'Ongoing'
        : announceText.includes('完結')
        ? 'Completed'
        : 'Unknown',
  };

  novel.summary = cheerioQuery('#novel_ex').text().trim();

  let chapters = getChapters(cheerioQuery);

  if (chapters.length === 0) {
    // oneshots have no episode list; the whole text sits on the novel page
    const nameResult = await fetch(
      `${site}search.php?order=hyoka&word=${encodeURIComponent(
        novel.novelName,
      )}`,
    );
    const summaryQuery = cheerio.load(await nameResult.text());
    novel.summary = summaryQuery
      .find('.smpnovel_list')
      .first()
      .find('.smpnovel_ex')
      .text()
      .trim();

    chapters.push({
      chapterName: 'Oneshot',
      releaseDate: null,
      chapterUrl: 'oneshot',
    });
  } else {
    const lastPageLink = cheerioQuery('.c-pager__item--last').attr('href');
    if (lastPageLink) {
      const lastPageMatch = lastPageLink.match(/\?p=(\d+)/);
      const totalPages = lastPageMatch ? parseInt(lastPageMatch[1], 10) : 1;

      const pageBodies = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(`${getNovelUrl(novelUrl)}?p=${i + 2}`).then(r => r.text()),
        ),
      );

      for (const pageBody of pageBodies) {
        chapters = chapters.concat(getChapters(cheerio.load(pageBody)));
      }
    }
  }

  novel.chapters = chapters;

  return novel;
};

const parseChapter = async (novelUrl, chapterUrl) => {
  const result = await fetch(getChapterUrl(novelUrl, chapterUrl));
  const body = await result.text();

  const cheerioQuery = cheerio.load(body);

  const chapter = {
    sourceId,
    novelUrl,
    chapterUrl,
    chapterName: cheerioQuery('.p-novel__title').text(),
    // exclude the modifier variants (afterword, keyword blocks)
    chapterText:
      cheerioQuery(
        '.p-novel__body .p-novel__text:not([class*="p-novel__text--"])',
      ).html() || '',
  };

  return chapter;
};

const searchNovels = async searchTerm => {
  const result = await fetch(
    `${site}search.php?order=hyoka&word=${encodeURIComponent(searchTerm)}`,
  );
  const body = await result.text();

  const cheerioQuery = cheerio.load(body);

  let novels = [];

  cheerioQuery('.smpnovel_list').each(function () {
    // the "read this work" button carries the novel's ncode link
    const novelA = cheerioQuery(this).find('a.read_button').attr('href');
    if (!novelA) {
      return;
    }

    novels.push({
      novelName: cheerioQuery(this).find('.novel_h').text(),
      novelUrl: getLastPartOfUrl(novelA),
      sourceId,
      novelCover,
    });
  });

  return novels;
};

const SyosetuScraper = {
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
};

export default SyosetuScraper;
