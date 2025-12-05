export interface EpubChapter {
  name: string;
  path: string;
}

export interface EpubMetadata {
  url: string;
  title: string;
  cover: string | null;
  genre: string;
  summary: string;
  authors: string;
  artist: string;
  chapters: EpubChapter[];
}
