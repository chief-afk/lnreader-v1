import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import RNFS from 'react-native-fs';
import { EpubChapter, EpubMetadata } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Clean a string for use as a directory name
 */
function cleanTitle(title: string): string {
  return title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
}

/**
 * Find the content.opf path from container.xml
 */
function getOpfPath(containerXml: string): string {
  const parsed = parser.parse(containerXml);
  const rootfile = parsed?.container?.rootfiles?.rootfile;
  if (Array.isArray(rootfile)) {
    return rootfile[0]['@_full-path'];
  }
  return rootfile?.['@_full-path'] || '';
}

/**
 * Extract metadata from OPF content
 */
function extractMetadata(opfContent: string): {
  title: string;
  authors: string;
  genre: string;
  summary: string;
} {
  const parsed = parser.parse(opfContent);
  const metadata = parsed?.package?.metadata || {};

  // Title
  let title = 'Unknown Title';
  const dcTitle = metadata['dc:title'];
  if (typeof dcTitle === 'string') {
    title = dcTitle;
  } else if (dcTitle?.['#text']) {
    title = dcTitle['#text'];
  } else if (Array.isArray(dcTitle)) {
    title =
      typeof dcTitle[0] === 'string'
        ? dcTitle[0]
        : dcTitle[0]?.['#text'] || title;
  }

  // Authors
  let authors = '';
  const dcCreator = metadata['dc:creator'];
  if (typeof dcCreator === 'string') {
    authors = dcCreator;
  } else if (dcCreator?.['#text']) {
    authors = dcCreator['#text'];
  } else if (Array.isArray(dcCreator)) {
    authors = dcCreator
      .map(c => (typeof c === 'string' ? c : c?.['#text'] || ''))
      .filter(Boolean)
      .join(' ');
  }

  // Genre/Subject
  let genre = 'N/A';
  const dcSubject = metadata['dc:subject'];
  if (typeof dcSubject === 'string') {
    genre = dcSubject;
  } else if (dcSubject?.['#text']) {
    genre = dcSubject['#text'];
  } else if (Array.isArray(dcSubject)) {
    genre = dcSubject
      .map(s => (typeof s === 'string' ? s : s?.['#text'] || ''))
      .filter(Boolean)
      .join(' ');
  }

  // Summary/Description
  let summary = 'N/A';
  const dcDescription = metadata['dc:description'];
  if (typeof dcDescription === 'string') {
    summary = dcDescription;
  } else if (dcDescription?.['#text']) {
    summary = dcDescription['#text'];
  } else if (Array.isArray(dcDescription)) {
    summary =
      typeof dcDescription[0] === 'string'
        ? dcDescription[0]
        : dcDescription[0]?.['#text'] || summary;
  }

  return { title, authors: authors.trim(), genre, summary };
}

/**
 * Find cover image path from OPF content
 */
function getCoverPath(opfContent: string): string | null {
  const parsed = parser.parse(opfContent);
  const metadata = parsed?.package?.metadata || {};
  const manifest = parsed?.package?.manifest?.item || [];
  const items = Array.isArray(manifest) ? manifest : [manifest];

  // EPUB 2.0: Look for meta name="cover" content="<id>"
  const metas = metadata?.meta || [];
  const metaArr = Array.isArray(metas) ? metas : [metas];
  const coverMeta = metaArr.find(m => m?.['@_name'] === 'cover');
  if (coverMeta) {
    const coverId = coverMeta['@_content'];
    const coverItem = items.find(item => item?.['@_id'] === coverId);
    if (coverItem) {
      return coverItem['@_href'];
    }
  }

  // EPUB 3.0: Look for item with properties="cover-image"
  const coverImageItem = items.find(
    item => item?.['@_properties'] === 'cover-image',
  );
  if (coverImageItem) {
    return coverImageItem['@_href'];
  }

  // Fallback: Look for any image item with "cover" in the id
  const coverFallback = items.find(
    item =>
      item?.['@_id']?.toLowerCase().includes('cover') &&
      item?.['@_media-type']?.startsWith('image/'),
  );
  if (coverFallback) {
    return coverFallback['@_href'];
  }

  return null;
}

/**
 * Get chapters from EPUB 2.0 NCX file
 */
function getChaptersFromNcx(
  ncxContent: string,
  opfContent: string,
  opfDir: string,
): EpubChapter[] {
  const ncxParsed = parser.parse(ncxContent);
  const opfParsed = parser.parse(opfContent);

  // Build name-by-path map from NCX navPoints
  const nameByPath: Record<string, string> = {};
  const navMap = ncxParsed?.ncx?.navMap?.navPoint || [];
  const navPoints = Array.isArray(navMap) ? navMap : [navMap];

  function processNavPoints(points: any[]) {
    for (const np of points) {
      const name = np?.navLabel?.text || '';
      let path = np?.content?.['@_src'] || '';
      // Remove fragment (#...)
      if (path.includes('#')) {
        path = path.substring(0, path.indexOf('#'));
      }
      if (path && !nameByPath[path]) {
        nameByPath[path] = name;
      }
      // Process nested navPoints
      if (np?.navPoint) {
        const nested = Array.isArray(np.navPoint) ? np.navPoint : [np.navPoint];
        processNavPoints(nested);
      }
    }
  }
  processNavPoints(navPoints);

  // Get spine order from OPF
  const spine = opfParsed?.package?.spine?.itemref || [];
  const spineItems = Array.isArray(spine) ? spine : [spine];
  const manifest = opfParsed?.package?.manifest?.item || [];
  const manifestItems = Array.isArray(manifest) ? manifest : [manifest];

  const chapters: EpubChapter[] = [];
  for (const itemref of spineItems) {
    const idref = itemref?.['@_idref'];
    const item = manifestItems.find(i => i?.['@_id'] === idref);
    if (!item) continue;

    const href = item['@_href'];
    let chapterName = nameByPath[href];

    if (chapterName) {
      // If name is numeric, prefix with "Chapter"
      if (/^\d+$/.test(chapterName)) {
        chapterName = `Chapter ${chapterName}`;
      }
    } else {
      // Fallback to idref without underscores
      chapterName = idref?.split('_')[0] || `Chapter ${chapters.length + 1}`;
    }

    chapters.push({
      name: chapterName,
      path: opfDir ? `${opfDir}/${href}` : href,
    });
  }

  return chapters;
}

/**
 * Get chapters from EPUB 3.0 (fallback when no NCX)
 */
function getChaptersFromSpine(
  opfContent: string,
  opfDir: string,
): EpubChapter[] {
  const parsed = parser.parse(opfContent);
  const spine = parsed?.package?.spine?.itemref || [];
  const spineItems = Array.isArray(spine) ? spine : [spine];
  const manifest = parsed?.package?.manifest?.item || [];
  const manifestItems = Array.isArray(manifest) ? manifest : [manifest];

  const chapters: EpubChapter[] = [];
  for (let i = 0; i < spineItems.length; i++) {
    const itemref = spineItems[i];
    const idref = itemref?.['@_idref'];
    const item = manifestItems.find(it => it?.['@_id'] === idref);
    if (!item) continue;

    const href = item['@_href'];
    chapters.push({
      name: `EPUB3 - Chapter ${i + 1}`,
      path: opfDir ? `${opfDir}/${href}` : href,
    });
  }

  return chapters;
}

/**
 * Parse an EPUB file and extract contents to destination directory
 */
export async function parseEpub(
  epubPath: string,
  destDir: string,
): Promise<string> {
  // Read EPUB file
  const epubData = await RNFS.readFile(epubPath, 'base64');
  const zip = await JSZip.loadAsync(epubData, { base64: true });

  // Read container.xml to find OPF path
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) {
    throw new Error('Invalid EPUB: missing container.xml');
  }
  const opfPath = getOpfPath(containerXml);
  const opfDir = opfPath.includes('/')
    ? opfPath.substring(0, opfPath.lastIndexOf('/'))
    : '';

  // Read OPF content
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) {
    throw new Error('Invalid EPUB: missing content.opf');
  }

  // Extract metadata
  const { title, authors, genre, summary } = extractMetadata(opfContent);
  const cleanedTitle = cleanTitle(title);
  const savePath = `${destDir}convertedEpubs/${cleanedTitle}`;

  // Create destination directory
  await RNFS.mkdir(savePath);

  // Get cover path
  let cover = getCoverPath(opfContent);
  if (cover && opfDir) {
    cover = `${opfDir}/${cover}`;
  }

  // Find NCX file for chapters
  let chapters: EpubChapter[] = [];
  const ncxFile = Object.keys(zip.files).find(f => f.endsWith('toc.ncx'));
  if (ncxFile) {
    const ncxContent = await zip.file(ncxFile)?.async('text');
    if (ncxContent) {
      chapters = getChaptersFromNcx(ncxContent, opfContent, opfDir);
    }
  } else {
    // EPUB 3.0 fallback
    chapters = getChaptersFromSpine(opfContent, opfDir);
  }

  // Extract relevant files
  const extensions = [
    '.html',
    '.htm',
    '.xhtml',
    '.css',
    '.png',
    '.jpeg',
    '.jpg',
    '.gif',
    '.ncx',
    '.opf',
  ];
  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (extensions.some(ext => filename.toLowerCase().endsWith(ext))) {
      const content = await file.async('base64');
      const destPath = `${savePath}/${filename}`;
      const destDirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await RNFS.mkdir(destDirPath);
      await RNFS.writeFile(destPath, content, 'base64');
    }
  }

  // Write metadata.json
  const metadata: EpubMetadata = {
    url: savePath,
    title,
    cover,
    genre,
    summary,
    authors,
    artist: '',
    chapters,
  };
  await RNFS.writeFile(`${savePath}/metadata.json`, JSON.stringify(metadata));

  return savePath;
}
