import * as cheerio from 'cheerio';
const baseUrl = 'https://novelfull.com';

const popularNovels = async page => {
  const url = `${baseUrl}/most-popular?page=${page}`;

  const result = await fetch(url);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  let novels = [];

  loadedCheerio('div.col-truyen-main > div.list-truyen > .row').each(
    function () {
      const novelName = loadedCheerio(this).find('h3.truyen-title > a').text();

      let novelCover = loadedCheerio(this).find('img').attr('src');
      novelCover = baseUrl + novelCover;

      let novelUrl = loadedCheerio(this)
        .find('h3.truyen-title > a')
        .attr('href')
        .replace('.html', '')
        .substring(1);
      novelUrl = `${novelUrl}/`;

      const novel = {
        sourceId: 8,
        novelUrl,
        novelName,
        novelCover,
      };

      novels.push(novel);
    },
  );

  return { novels };
};

const parseNovelAndChapters = async novelUrl => {
  const url = `${baseUrl}/${novelUrl.slice(0, -1)}.html`;

  const result = await fetch(url);
  const body = await result.text();

  let loadedCheerio = cheerio.load(body);

  let novel = {};

  novel.sourceId = 8;

  novel.sourceName = 'NovelFull';

  novel.url = url;

  novel.novelUrl = novelUrl;

  novel.novelName = loadedCheerio('div.book > img').attr('alt');

  novel.novelCover = baseUrl + loadedCheerio('div.book > img').attr('src');

  novel.summary = loadedCheerio('div.desc-text').text().trim();

  novel.author = loadedCheerio('div.info > div > h3')
    .filter(function () {
      return loadedCheerio(this).text().trim() === 'Author:';
    })
    .siblings()
    .text();

  novel.genre = loadedCheerio('div.info > div')
    .filter(function () {
      return loadedCheerio(this).find('h3').text().trim() === 'Genre:';
    })
    .text()
    .replace('Genre:', '');

  novel.artist = null;

  novel.status = loadedCheerio('div.info > div > h3')
    .filter(function () {
      return loadedCheerio(this).text().trim() === 'Status:';
    })
    .next()
    .text();

  const parseChapterList = html => {
    loadedCheerio = cheerio.load(html);

    const chapters = [];

    loadedCheerio('ul.list-chapter > li > a').each(function () {
      let chapterUrl = loadedCheerio(this).attr('href');
      if (!chapterUrl) {
        return;
      }
      const chapterName =
        loadedCheerio(this).attr('title') || loadedCheerio(this).text().trim();
      chapterUrl = chapterUrl.replace(`/${novelUrl}`, '');

      chapters.push({
        chapterName,
        releaseDate: null,
        chapterUrl,
      });
    });
    return chapters;
  };

  // the site removed its chapter ajax endpoint; the chapter list is now
  // server-rendered: page 1 holds the oldest 50 chapters, later pages
  // continue ascending in blocks of 50
  const getChapters = async () => {
    const novelPageUrl = `${baseUrl}/${novelUrl.slice(0, -1)}.html`;

    const firstResult = await fetch(novelPageUrl);
    const firstPage = await firstResult.text();
    const totalPages = parseInt(
      firstPage.match(/total-page[^0-9]*(\d+)/)?.[1] || '1',
      10,
    );

    const seen = new Set();
    const chapters = [];

    const addChapters = newChapters => {
      newChapters.forEach(chapter => {
        if (!seen.has(chapter.chapterUrl)) {
          seen.add(chapter.chapterUrl);
          chapters.push(chapter);
        }
      });
    };

    addChapters(parseChapterList(firstPage));

    for (let page = 2; page <= totalPages; page++) {
      const pageResult = await fetch(`${novelPageUrl}?page=${page}`);
      addChapters(parseChapterList(await pageResult.text()));
    }

    return chapters;
  };

  novel.chapters = await getChapters();

  return novel;
};

const parseChapter = async (novelUrl, chapterUrl) => {
  const url = `${baseUrl}/${novelUrl}${chapterUrl}`;

  const result = await fetch(url);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  const chapterName = loadedCheerio('.chapter-title').attr('title');
  let chapterText = loadedCheerio('#chapter-content').html();
  const chapter = {
    sourceId: 8,
    novelUrl,
    chapterUrl,
    chapterName,
    chapterText,
  };

  return chapter;
};

const searchNovels = async searchTerm => {
  const searchUrl = 'https://novelfull.com/search?keyword=';

  const url = `${searchUrl}${searchTerm}`;

  const result = await fetch(url);
  const body = await result.text();

  const loadedCheerio = cheerio.load(body);

  let novels = [];

  loadedCheerio('div.col-truyen-main > div.list-truyen > .row').each(
    function () {
      let novelUrl = loadedCheerio(this)
        .find('h3.truyen-title > a')
        .attr('href')
        .replace('.html', '')
        .substring(1);
      novelUrl = `${novelUrl}/`;

      const novelName = loadedCheerio(this).find('h3.truyen-title > a').text();
      const novelCover = baseUrl + loadedCheerio(this).find('img').attr('src');

      const novel = {
        sourceId: 8,
        novelUrl,
        novelName,
        novelCover,
      };

      novels.push(novel);
    },
  );

  return novels;
};

const novelFullScraper = {
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
};

export default novelFullScraper;
