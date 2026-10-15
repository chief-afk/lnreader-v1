import { Directory, File, Paths } from 'expo-file-system';
import { Parser } from 'htmlparser2';
import { load } from 'cheerio';
import dayjs from 'dayjs';

import { isUrlAbsolute } from '../utils/isAbsoluteUrl';
import { FilterTypes, PluginNovelStatus } from './types';
import { fetchApi, fetchProto, fetchText } from './fetchShim';

/**
 * A pluginId is safe to use in filesystem paths only when it matches
 * this pattern (no path separators, no leading/trailing separators).
 * Every path derived from manifest data must go through
 * `validatePluginId` first.
 */
const PLUGIN_ID_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/i;

export { PLUGIN_ID_PATTERN };

export const validatePluginId = (pluginId: string): string => {
  if (!pluginId || !PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id: "${pluginId}"`);
  }
  return pluginId;
};

const pluginsRoot = new Directory(Paths.document, 'plugins');

export const getPluginDir = (pluginId: string): Directory =>
  new Directory(pluginsRoot, validatePluginId(pluginId));

export const getPluginDistFile = (pluginId: string): File =>
  new File(getPluginDir(pluginId), 'index.js');

/**
 * Removes the plugin's directory (dist and storage files) and drops
 * the in-memory storage cache so a reinstall starts clean.
 */
export const deletePluginData = (pluginId: string): void => {
  const validatedId = validatePluginId(pluginId);
  storageStores.delete(validatedId);
  const dir = getPluginDir(validatedId);
  if (dir.exists) {
    dir.delete();
  }
};

// --- @libs/storage shim, backed by one JSON file per store ---

interface StoredItem {
  created: string;
  value: unknown;
  expires?: number;
}

class JsonFileStore {
  private data: Record<string, StoredItem> = {};
  private file: File;

  constructor(pluginId: string, fileName: string) {
    const dir = getPluginDir(pluginId);
    dir.create({ intermediates: true, idempotent: true });
    this.file = new File(dir, fileName);
    if (this.file.exists) {
      try {
        this.data = JSON.parse(this.file.textSync());
      } catch {
        this.data = {};
      }
    }
  }

  private flush(): void {
    if (!this.file.exists) {
      this.file.create();
    }
    this.file.write(JSON.stringify(this.data));
  }

  getItem(key: string): StoredItem | undefined {
    return this.data[key];
  }

  setItem(key: string, item: StoredItem): void {
    this.data[key] = item;
    this.flush();
  }

  removeItem(key: string): void {
    delete this.data[key];
    this.flush();
  }

  keys(): string[] {
    return Object.keys(this.data);
  }
}

const storageStores = new Map<string, PluginStorageShim>();

class PluginStorage {
  constructor(private store: JsonFileStore) {}

  set(key: string, value: unknown, expires?: Date | number): void {
    this.store.setItem(key, {
      created: new Date().toISOString(),
      value,
      expires: expires instanceof Date ? expires.getTime() : expires,
    });
  }

  get(key: string, raw?: boolean): unknown {
    const storedItem = this.store.getItem(key);
    if (!storedItem) {
      return undefined;
    }
    if (storedItem.expires && Date.now() > storedItem.expires) {
      this.store.removeItem(key);
      return undefined;
    }
    return raw ? storedItem : storedItem.value;
  }

  delete(key: string): void {
    this.store.removeItem(key);
  }

  clearAll(): void {
    this.store.keys().forEach(key => this.store.removeItem(key));
  }

  getAllKeys(): string[] {
    return this.store.keys();
  }
}

class PluginWebStorage {
  constructor(private store: JsonFileStore) {}

  get(): unknown {
    const stored = this.store.keys()[0]
      ? this.store.getItem(this.store.keys()[0])
      : undefined;
    return stored ? stored.value : undefined;
  }
}

interface PluginStorageShim {
  storage: PluginStorage;
  localStorage: PluginWebStorage;
  sessionStorage: PluginWebStorage;
}

const createStorageShim = (pluginId: string): PluginStorageShim => {
  const cached = storageStores.get(pluginId);
  if (cached) {
    return cached;
  }
  const shim = {
    storage: new PluginStorage(new JsonFileStore(pluginId, 'storage.json')),
    localStorage: new PluginWebStorage(
      new JsonFileStore(pluginId, 'local.json'),
    ),
    sessionStorage: new PluginWebStorage(
      new JsonFileStore(pluginId, 'session.json'),
    ),
  };
  storageStores.set(pluginId, shim);
  return shim;
};

// --- @libs/utils helpers ---

const utf8ToBytes = (text: string): Uint8Array => {
  const bytes: number[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0) as number;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
};

const bytesToUtf8 = (bytes: Uint8Array): string => {
  let result = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];
    let codePoint: number;
    let sequenceLength: number;
    if (byte < 0x80) {
      codePoint = byte;
      sequenceLength = 1;
    } else if ((byte & 0xe0) === 0xc0) {
      codePoint = byte & 0x1f;
      sequenceLength = 2;
    } else if ((byte & 0xf0) === 0xe0) {
      codePoint = byte & 0x0f;
      sequenceLength = 3;
    } else {
      codePoint = byte & 0x07;
      sequenceLength = 4;
    }
    for (let j = 1; j < sequenceLength; j++) {
      codePoint = (codePoint << 6) | (bytes[i + j] & 0x3f);
    }
    result += String.fromCodePoint(codePoint);
    i += sequenceLength;
  }
  return result;
};

const defaultCover =
  'https://github.com/LNReader/lnreader-plugins/blob/main/icons/src/coverNotAvailable.jpg?raw=true';

/**
 * The require allowlist for plugin dists, mapped onto libraries the
 * app already bundles (mirrors upstream's pluginManager packages map).
 */
export const createRequireShim =
  (pluginId: string) =>
  (packageName: string): unknown => {
    const validatedId = validatePluginId(pluginId);
    if (packageName === '@libs/storage') {
      return createStorageShim(validatedId);
    }
    if (packageName === '@libs/aes') {
      throw new Error(
        `Plugin "${validatedId}" uses the unsupported @libs/aes library and cannot run`,
      );
    }
    const packages: Record<string, unknown> = {
      htmlparser2: { Parser },
      cheerio: { load },
      dayjs,
      urlencode: {
        encode: (text: string) => encodeURIComponent(text),
        decode: (text: string) => decodeURIComponent(text),
      },
      '@libs/novelStatus': { NovelStatus: PluginNovelStatus },
      '@libs/fetch': { fetchApi, fetchText, fetchProto },
      '@libs/isAbsoluteUrl': { isUrlAbsolute },
      '@libs/filterInputs': { FilterTypes },
      '@libs/defaultCover': { defaultCover },
      '@libs/utils': { utf8ToBytes, bytesToUtf8 },
    };
    const lib = packages[packageName];
    if (!lib) {
      throw new Error(`Unsupported plugin library: ${packageName}`);
    }
    return lib;
  };
