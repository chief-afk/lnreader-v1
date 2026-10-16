import WQMangaStreamScraper from './WQMangaStreamScraper';

export const KolNovelScraper = new WQMangaStreamScraper(
  53,
  'https://kolnovel.com/',
  'KolNovel',
  { reverseChapters: true },
);
