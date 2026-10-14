import * as cheerio from 'cheerio';
import { Status, defaultCoverUri } from '../helpers/constants';

const sourceId = 88;
const sourceName = 'Chireads';

const baseUrl = 'https://chireads.com/';

// The site is fronted by Cloudflare, which serves different HTML to a
// plain device User-Agent (the app injects its own UA) than to a desktop
// browser. Send the same desktop Chrome UA on every request - HTML pages
// and the wp-json REST endpoints alike - so the chapter list survives.
const browserHeaders = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

const fetchHtml = async url => {
  const result = await fetch(url, { headers: browserHeaders });
  const body = await result.text();
  return body;
};

const absoluteUrl = url => (url ? new URL(url, baseUrl).href : defaultCoverUri);

const parseCards = loadedCheerio => {
  let novels = [];
  const seen = new Set();

  loadedCheerio('ul.refresh-card-grid li.refresh-card').each(function () {
    const novelUrl = loadedCheerio(this)
      .find('.refresh-card-title a')
      .attr('href');
    if (!novelUrl || seen.has(novelUrl)) {
      return;
    }
    seen.add(novelUrl);

    const novel = {
      sourceId,
      novelName: loadedCheerio(this)
        .find('.refresh-card-title a')
        .text()
        .trim(),
      novelCover: absoluteUrl(
        loadedCheerio(this).find('.refresh-card-cover img').attr('src'),
      ),
      novelUrl,
    };

    novels.push(novel);
  });

  return novels;
};

const popularNovels = async (page, { showLatestNovels }) => {
  if (showLatestNovels) {
    const body = await fetchHtml(baseUrl);
    const loadedCheerio = cheerio.load(body);

    let novels = [];
    const seen = new Set();

    loadedCheerio('.dernieres-tabel tbody tr').each(function () {
      const novelUrl = loadedCheerio(this)
        .find('td')
        .first()
        .find('a')
        .attr('href');
      if (!novelUrl || seen.has(novelUrl)) {
        return;
      }
      seen.add(novelUrl);

      novels.push({
        sourceId,
        novelName: loadedCheerio(this)
          .find('td')
          .first()
          .find('a')
          .text()
          .trim()
          .replace(/^\[[TO]\]\s*/, ''),
        novelCover: defaultCoverUri,
        novelUrl,
      });
    });

    // the homepage "latest" table carries no cover images, only links to
    // each novel's page; resolve covers from the detail pages
    const covers = await Promise.allSettled(
      novels.map(async novel => {
        const detail = cheerio.load(await fetchHtml(novel.novelUrl));
        return absoluteUrl(detail('.refresh-detail-cover img').attr('src'));
      }),
    );

    return {
      novels: novels.map((novel, index) => ({
        ...novel,
        novelCover:
          covers[index]?.status === 'fulfilled'
            ? covers[index].value
            : defaultCoverUri,
      })),
    };
  }

  // translated + original catalogues, deduplicated
  const pages = await Promise.allSettled([
    fetchHtml(`${baseUrl}category/translatedtales/page/${page}/`),
    fetchHtml(`${baseUrl}category/original/page/${page}/`),
  ]);

  let novels = [];
  const seen = new Set();

  for (const page_ of pages) {
    if (page_.status !== 'fulfilled') {
      continue;
    }
    for (const novel of parseCards(cheerio.load(page_.value))) {
      if (seen.has(novel.novelUrl)) {
        continue;
      }
      seen.add(novel.novelUrl);
      novels.push(novel);
    }
  }

  if (!novels.length) {
    throw new Error('All catalogue pages failed');
  }

  return { novels };
};

const parseNovelAndChapters = async novelUrl => {
  const body = await fetchHtml(novelUrl);

  const loadedCheerio = cheerio.load(body);

  let novel = {
    sourceId,
    sourceName,
    url: novelUrl,
    novelUrl,
    novelName: '',
    novelCover: '',
    author: '',
    status: '',
    genre: '',
    summary: '',
    chapters: [],
  };

  novel.novelName = loadedCheerio('h1.refresh-detail-title')
    .first()
    .text()
    .trim();

  novel.novelCover = absoluteUrl(
    loadedCheerio('.refresh-detail-cover img').attr('src'),
  );

  novel.summary = loadedCheerio('.refresh-detail-summary-content')
    .text()
    .trim();

  loadedCheerio('.refresh-detail-meta > div').each(function () {
    const label = loadedCheerio(this).find('dt').text().trim();
    const value = loadedCheerio(this).find('dd').text().trim();

    if (label.includes('Auteur')) {
      novel.author = value;
    } else if (label.includes('Statut')) {
      const status = value.toLowerCase();
      if (status.includes('en pause') || status.includes('hiatus')) {
        novel.status = Status.UNKNOWN;
      } else if (status.includes('complet') || status.includes('termin')) {
        novel.status = Status.COMPLETED;
      } else {
        novel.status = Status.ONGOING;
      }
    }
  });

  const chapters = new Map();

  loadedCheerio('.refresh-detail-chapter-list a').each(function () {
    const chapterUrl = loadedCheerio(this).attr('href');
    if (!chapterUrl || chapters.has(chapterUrl)) {
      return;
    }

    const title = loadedCheerio(this).text().trim();
    const match = title.match(
      /^Chapitre\s+(\d+(?:[.,]\d+)?)\s*(?:(?:–|-|:)\s*)?(.*)$/i,
    );

    // chapter URLs are dated (/.../2026/03/03/); read the release date
    // from the trailing date segments
    const segments = new URL(chapterUrl).pathname.split('/').filter(Boolean);
    const date = segments.slice(-3);
    const hasDate =
      /^\d{4}$/.test(date[0] || '') &&
      /^\d{1,2}$/.test(date[1] || '') &&
      /^\d{1,2}$/.test(date[2] || '');

    chapters.set(chapterUrl, {
      chapterName: match
        ? `${match[1]}${match[2] ? ` - ${match[2].trim()}` : ''}`
        : title,
      releaseDate: hasDate ? `${date[0]}-${date[1]}-${date[2]}` : null,
      chapterUrl,
    });
  });

  novel.chapters = Array.from(chapters.values());

  return novel;
};

const parseChapter = async (novelUrl, chapterUrl) => {
  const body = await fetchHtml(chapterUrl);

  const loadedCheerio = cheerio.load(body);

  const chapterName = loadedCheerio('.article-title').text();

  const content = loadedCheerio('#content').first();
  content
    .find('script, style, iframe, form, nav, footer, .sharedaddy, .ads')
    .remove();

  const chapterText = content.html();
  if (!chapterText || content.text().replace(/\s+/g, ' ').trim().length < 200) {
    throw new Error('Chapter content is not readable');
  }

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
  const restHeaders = {
    Accept: 'application/json, */*;q=0.8',
    'User-Agent': browserHeaders['User-Agent'],
  };

  // novels are WordPress categories; search them through wp-json
  const parents = await Promise.allSettled(
    [2, 811].map(async parent => {
      const response = await fetch(
        `${baseUrl}wp-json/wp/v2/categories?parent=${parent}&search=${encodeURIComponent(
          searchTerm,
        )}&per_page=20`,
        { headers: restHeaders },
      );
      if (!response.ok) {
        throw new Error(`Search parent ${parent} failed`);
      }
      return response.json();
    }),
  );

  const categories = parents.flatMap(parent =>
    parent.status === 'fulfilled' ? parent.value : [],
  );
  if (!categories.length) {
    throw new Error('Chireads search failed for all category parents');
  }

  let novels = [];
  const seen = new Set();

  for (const category of categories) {
    if (!category?.link || seen.has(category.link)) {
      continue;
    }
    seen.add(category.link);

    novels.push({
      sourceId,
      novelName: category.name,
      novelCover: defaultCoverUri,
      novelUrl: category.link,
    });
  }

  return novels;
};

const ChireadsScraper = {
  popularNovels,
  parseNovelAndChapters,
  parseChapter,
  searchNovels,
};

export default ChireadsScraper;
