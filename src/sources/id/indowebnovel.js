import * as cheerio from 'cheerio';
import { fetchHtml } from '@utils/fetch/fetch';
import { startCase } from 'lodash-es';

const sourceId = 87;
const sourceName = 'IndoWebNovel';

const baseUrl = 'https://indowebnovel.id/';

// The paged listing (`page/<n>/?s`) renders `.flexbox2-item` cards, while
// the front page renders `.flexbox3-item` (latest updates) and
// `.popular .flexbox-item` (ranked list). Accept every variant so a
// listing page never parses to zero novels just because the server
// returned another listing layout.
const parseNovels = loadedCheerio => {
  const items = loadedCheerio('.flexbox2-item').length
    ? loadedCheerio('.flexbox2-item')
    : loadedCheerio('.flexbox3-item').length
    ? loadedCheerio('.flexbox3-item')
    : loadedCheerio('.popular .flexbox-item');

  let novels = [];

  items.each(function () {
    const novelName =
      loadedCheerio(this).find('.flexbox2-title span').first().text() ||
      loadedCheerio(this).find('.title a').first().text() ||
      loadedCheerio(this).find('.flexbox-title').first().text();
    const novelCover = loadedCheerio(this).find('img').attr('src');
    const novelUrl =
      loadedCheerio(this).find('.flexbox2-content > a').attr('href') ||
      loadedCheerio(this).find('.flexbox3-content > a').attr('href') ||
      loadedCheerio(this).find('a').attr('href');

    if (!novelUrl) {
      return;
    }

    const novel = {
      sourceId,
      novelName: novelName.trim(),
      novelCover,
      novelUrl,
    };

    novels.push(novel);
  });

  return novels;
};

const popularNovels = async page => {
  const url = `${baseUrl}page/${page}/?s`;

  const body = await fetchHtml({ url, sourceId });

  return { novels: parseNovels(cheerio.load(body)) };
};

const parseNovelAndChapters = async novelUrl => {
  const body = await fetchHtml({ url: novelUrl, sourceId });

  let loadedCheerio = cheerio.load(body);

  let novel = {
    sourceId,
    sourceName,
    url: novelUrl,
    novelUrl,
  };

  novel.novelName = startCase(loadedCheerio('.series-title h2').text().trim());

  novel.novelCover = loadedCheerio('.series-thumb img').attr('src');

  novel.author = loadedCheerio(".series-infolist li:contains('Author') span")
    .text()
    .trim();

  novel.status = loadedCheerio('.status').text().trim();

  novel.genre = loadedCheerio('.series-genres')
    .children('a')
    .map((i, el) => loadedCheerio(el).text())
    .toArray()
    .join(',');

  loadedCheerio('.series-synops div').remove();
  novel.summary = loadedCheerio('.series-synops').text().trim();

  let chapters = [];

  loadedCheerio('.series-chapterlists li').each(function () {
    // the entry also holds a span.date; drop it so the chapter name
    // does not end with the release date
    let titles = loadedCheerio(this)
      .find('a span')
      .not('.date')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const chapterName = titles.replace(`${novel.novelName}`, '').trim();
    const releaseDate = loadedCheerio(this).find('span.date').first().text();
    const chapterUrl = loadedCheerio(this).find('a').attr('href');

    if (!chapterUrl) {
      return;
    }

    chapters.push({ chapterName, releaseDate, chapterUrl });
  });

  novel.chapters = chapters.reverse();

  return novel;
};

const parseChapter = async (novelUrl, chapterUrl) => {
  const body = await fetchHtml({ url: chapterUrl, sourceId });

  let loadedCheerio = cheerio.load(body);

  const chapterName = loadedCheerio('.title-chapter').text();

  // the chapter body sits behind a wrapper div whose class is a rotating
  // random token; the stable inner #content element survives redesigns
  const chapterText = loadedCheerio('main #content').html();

  const chapter = {
    sourceId,
    novelUrl,
    chapterUrl,
    chapterName,
    chapterText,
  };

  return chapter;
};

const searchNovels = async searchTerm => {
  const url = `${baseUrl}page/1/?s=${searchTerm}`;

  const body = await fetchHtml({ url, sourceId });

  return parseNovels(cheerio.load(body));
};

const IndoWebNovelScraper = {
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
};

export default IndoWebNovelScraper;
