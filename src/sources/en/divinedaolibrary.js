import * as cheerio from 'cheerio';
import { defaultCoverUri } from '../helpers/constants';

const sourceId = 70;

const sourceName = 'Divine Dao Library';

const baseUrl = 'https://www.divinedaolibrary.com/';

const parseStoryLinks = loadedCheerio => {
  let novels = [];
  const seen = new Set();

  loadedCheerio('a[href*="/story/"]').each(function () {
    const novelUrl = loadedCheerio(this).attr('href');
    if (!novelUrl || seen.has(novelUrl)) return;
    seen.add(novelUrl);

    const novelName = loadedCheerio(this).text().trim();

    novels.push({ sourceId, novelName, novelCover: null, novelUrl });
  });

  return novels;
};

const popularNovels = async page => {
  const result = await fetch(baseUrl + 'novels');
  const body = await result.text();

  return { novels: parseStoryLinks(cheerio.load(body)) };
};

const parseNovelAndChapters = async novelUrl => {
  const result = await fetch(novelUrl);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  const novel = {
    sourceId,
    sourceName,
    url: novelUrl,
    novelUrl,
  };

  novel.novelName = loadedCheerio('h1').first().text().trim();

  novel.novelCover =
    loadedCheerio('meta[property="og:image"]').attr('content') ||
    defaultCoverUri;

  novel.summary = loadedCheerio('meta[name="description"]').attr('content');

  novel.author = null;

  novel.status = null;

  novel.genre = null;

  let novelChapters = [];

  loadedCheerio('a.chapter-group__list-item-link').each(function () {
    const chapterUrl = loadedCheerio(this).attr('href');
    if (!chapterUrl) return;

    const chapterName = loadedCheerio(this).text().trim();
    const releaseDate = null;

    novelChapters.push({ chapterName, releaseDate, chapterUrl });
  });

  novel.chapters = novelChapters;

  return novel;
};

const parseChapter = async (novelUrl, chapterUrl) => {
  const result = await fetch(chapterUrl);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  const chapterName = loadedCheerio('h1.chapter__title').text().trim();

  let chapterText = loadedCheerio('#chapter-content').html();

  chapterText = `<p><h1>${chapterName}</h1></p>` + chapterText;

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
  const url = `${baseUrl}?s=${encodeURIComponent(searchTerm)}`;

  const result = await fetch(url);
  const body = await result.text();

  return parseStoryLinks(cheerio.load(body));
};

const DivineDaoLibraryScraper = {
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
};

export default DivineDaoLibraryScraper;
