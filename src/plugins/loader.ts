import {
  cloudflareCheck,
  defaultUserAgentString,
  fetchApi as fetchApiV1,
} from '../utils/fetch/fetch';
import { isUrlAbsolute } from '../utils/isAbsoluteUrl';
import {
  clearPluginError,
  deletePluginByPluginId,
  getAllPlugins,
  getPluginByPluginId,
  InstalledPlugin,
  setPluginError,
  updatePluginRepo,
  upsertPlugin,
} from '../database/queries/PluginQueries';
import {
  createRequireShim,
  deletePluginData,
  getPluginDistFile,
  PLUGIN_ID_PATTERN,
  validatePluginId,
} from './shim';
import { OFFICIAL_PLUGIN_MANIFEST_URL } from './constants';
import {
  InstalledRepository,
  getEnabledRepositories,
} from '../database/queries/RepoQueries';
import { clearPluginScraper } from '../sources/sourceManager';
import { Plugin, PluginImageRequestInit, PluginManifestItem } from './types';

export { OFFICIAL_PLUGIN_MANIFEST_URL };

const instanceCache = new Map<string, Plugin>();

const assertHttpUrl = (url: string | undefined, field: string): string => {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`Plugin ${field} must be an http(s) URL`);
  }
  return url;
};

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const fetchManifest = async (
  manifestUrl: string = OFFICIAL_PLUGIN_MANIFEST_URL,
): Promise<PluginManifestItem[]> => {
  const res = await fetchApiV1({ url: manifestUrl });
  const manifest = await res.json();
  return validatePluginManifest(manifest);
};

/**
 * Manifest fields every plugin entry must carry for the app to work
 * (the same fields Phase 2's listing, install, and catalog merge use).
 */
const REQUIRED_MANIFEST_FIELDS = [
  'id',
  'name',
  'site',
  'lang',
  'version',
  'url',
  'iconUrl',
] as const;

const validateManifestItem = (item: unknown, index: number): void => {
  if (typeof item !== 'object' || item === null) {
    throw new Error(`Plugin manifest item ${index} is malformed`);
  }
  const record = item as Record<string, unknown>;
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (
      typeof record[field] !== 'string' ||
      !(record[field] as string).trim()
    ) {
      throw new Error(`Plugin manifest item "${index}" is missing "${field}"`);
    }
  }
};

/**
 * Add-time gate: the payload must parse as the plugins.min.json
 * schema, i.e. an array of plugin items. Entries are validated
 * individually like upstream: a malformed entry is skipped so it
 * cannot take down the rest of the repository's listing. A repo with
 * only malformed entries stays a hard error.
 */
export const validatePluginManifest = (
  manifest: unknown,
): PluginManifestItem[] => {
  if (!Array.isArray(manifest)) {
    throw new Error('Plugin manifest has an unexpected format');
  }
  const items: PluginManifestItem[] = [];
  let firstError: unknown;
  manifest.forEach((item, index) => {
    try {
      validateManifestItem(item, index);
      items.push(item as PluginManifestItem);
    } catch (err) {
      firstError = firstError ?? err;
    }
  });
  if (manifest.length > 0 && items.length === 0) {
    throw firstError;
  }
  return items;
};

const LOOPBACK_REPO_HOSTS = ['localhost', '127.0.0.1', '::1', '10.0.2.2'];

/**
 * Repositories must be https://; plain http is only accepted for
 * loopback hosts (local testing against the emulator). The host must
 * come from parsed URL data: a string prefix check is spoofable via
 * userinfo (http://localhost@evil.com parses to hostname evil.com).
 */
export const assertRepoUrl = (rawUrl: string): string => {
  const url = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Repository URL must be an https:// URL');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parsed.protocol === 'http:' && LOOPBACK_REPO_HOSTS.includes(host)) {
    return url;
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Repository URL must be an https:// URL');
  }
  return url;
};

export interface RepoManifest {
  repo: InstalledRepository;
  items: PluginManifestItem[];
  error?: string;
}

/**
 * Fetches every enabled repository's manifest. A failing repo never
 * takes the others down: its error is reported on its own result.
 */
export const fetchRepoManifests = async (): Promise<RepoManifest[]> => {
  const repos = getEnabledRepositories();
  return Promise.all(
    repos.map(async repo => {
      try {
        return { repo, items: await fetchManifest(repo.repoUrl) };
      } catch (err) {
        return { repo, items: [], error: errorMessage(err) };
      }
    }),
  );
};

/**
 * Re-points installed rows whose recorded repo is disabled or gone
 * (e.g. backup-seeded rows, or plugins whose repo was removed) to the
 * first enabled repo carrying the same pluginId. Plugins recorded to
 * a live enabled repo are never touched: a repo never overwrites
 * another repo's plugin.
 */
export const resolvePluginRepos = (repoManifests: RepoManifest[]): void => {
  const enabledUrls = new Set(repoManifests.map(({ repo }) => repo.repoUrl));
  const firstRepoByPluginId = new Map<string, RepoManifest>();
  repoManifests.forEach(repoManifest => {
    repoManifest.items.forEach(item => {
      if (!firstRepoByPluginId.has(item.id)) {
        firstRepoByPluginId.set(item.id, repoManifest);
      }
    });
  });
  getAllPlugins().forEach(plugin => {
    if (plugin.repoUrl && enabledUrls.has(plugin.repoUrl)) {
      return;
    }
    const target = plugin.pluginId
      ? firstRepoByPluginId.get(plugin.pluginId)
      : undefined;
    if (target && target.repo.repoUrl !== plugin.repoUrl) {
      updatePluginRepo(plugin.pluginId, target.repo.repoUrl);
    }
  });
};

/**
 * Manifest dist urls resolve relative to the .js/src/plugins/ tree on
 * the manifest's branch; absolute urls are used as-is.
 */
const resolveDistUrl = (distUrl: string, manifestUrl: string): string => {
  if (!distUrl) {
    throw new Error('Plugin dist url is missing');
  }
  if (isUrlAbsolute(distUrl) || distUrl.indexOf('//') === 0) {
    return distUrl;
  }
  const manifestDir = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  const distBase = manifestDir.replace(/\.dist\/$/, '.js/src/plugins/');
  return distBase + distUrl;
};

/**
 * Instantiates a compiled v2 plugin dist through upstream's exact
 * Function-constructor wrapper. Throws with the plugin's own error so
 * callers can record a failed state.
 */
export const initPlugin = (pluginId: string, rawCode: string): Plugin => {
  // The Function constructor is the pinned v2 dist contract (the same
  // wrapper upstream uses); a require allowlist scopes what the code
  // can reach.
  // eslint-disable-next-line no-new-func
  const plugin = Function(
    'require',
    'module',
    `const exports = module.exports = {};
    ${rawCode};
    return exports.default`,
  )(createRequireShim(pluginId), {}) as Plugin;

  if (!plugin || typeof plugin.popularNovels !== 'function') {
    throw new Error(`Plugin "${pluginId}" did not expose a valid plugin`);
  }

  const imageRequestInit: PluginImageRequestInit = plugin.imageRequestInit || {
    headers: {},
  };
  if (
    !imageRequestInit.headers['User-Agent'] &&
    !(imageRequestInit.headers instanceof Headers)
  ) {
    imageRequestInit.headers = {
      'User-Agent': defaultUserAgentString,
      ...imageRequestInit.headers,
    };
  }
  plugin.imageRequestInit = imageRequestInit;
  return plugin;
};

const downloadPluginCode = async (
  item: PluginManifestItem,
  manifestUrl: string,
): Promise<string> => {
  const res = await fetchApiV1({ url: resolveDistUrl(item.url, manifestUrl) });
  const rawCode = await res.text();
  cloudflareCheck(rawCode);
  if (!rawCode) {
    throw new Error(`Plugin "${item.id}" dist is empty`);
  }
  return rawCode;
};

/**
 * Downloads, instantiates, persists the dist, and registers the
 * plugin row (upsert keeps the numeric sourceId stable). Throws on
 * failure after recording the failed state.
 */
export const installPlugin = async (
  item: PluginManifestItem,
  manifestUrl: string = OFFICIAL_PLUGIN_MANIFEST_URL,
): Promise<InstalledPlugin> => {
  // Security gate: nothing below may run before the id is validated.
  const pluginId = validatePluginId(item.id);
  assertHttpUrl(item.url, 'url');
  assertHttpUrl(item.iconUrl, 'iconUrl');
  try {
    const rawCode = await downloadPluginCode(item, manifestUrl);
    const plugin = initPlugin(pluginId, rawCode);

    const distFile = getPluginDistFile(pluginId);
    distFile.parentDirectory.create({ intermediates: true, idempotent: true });
    if (!distFile.exists) {
      distFile.create();
    }
    distFile.write(rawCode);

    const sourceId = upsertPlugin({
      pluginId,
      name: item.name,
      site: item.site,
      lang: item.lang,
      version: item.version,
      iconUrl: item.iconUrl,
      repoUrl: manifestUrl,
    });
    // An update overwrites the dist; drop the stale cached scraper so
    // the new code takes effect without a restart.
    clearPluginScraper(sourceId);
    clearPluginError(pluginId);
    instanceCache.set(pluginId, plugin);
    return {
      sourceId,
      pluginId,
      name: item.name,
      site: item.site,
      lang: item.lang,
      version: item.version,
      iconUrl: item.iconUrl,
      repoUrl: manifestUrl,
    };
  } catch (err) {
    if (PLUGIN_ID_PATTERN.test(pluginId)) {
      setPluginError(pluginId, errorMessage(err));
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
};

/**
 * Removes the stored dist and storage files, the installed row, and
 * the cached instance.
 */
export const uninstallPlugin = (pluginId: string): void => {
  const validatedId = validatePluginId(pluginId);
  const row = getPluginByPluginId(validatedId);
  deletePluginData(validatedId);
  if (row) {
    clearPluginScraper(row.sourceId);
  }
  deletePluginByPluginId(validatedId);
  instanceCache.delete(validatedId);
};

/**
 * Instantiates an installed plugin from its cached dist. Synchronous
 * on purpose: sourceManager resolves scrapers synchronously. A failed
 * init is recorded and surfaces as `undefined`, never a crash.
 */
export const getInstalledPlugin = (pluginId: string): Plugin | undefined => {
  const cached = instanceCache.get(pluginId);
  if (cached) {
    return cached;
  }
  try {
    const distFile = getPluginDistFile(pluginId);
    if (!distFile.exists) {
      throw new Error(`Plugin "${pluginId}" is not downloaded`);
    }
    const plugin = initPlugin(pluginId, distFile.textSync());
    clearPluginError(pluginId);
    instanceCache.set(pluginId, plugin);
    return plugin;
  } catch (err) {
    // Only a downloaded dist that fails to init is a real failure; a
    // missing dist (backup-seeded rows swept by every update/search)
    // must stay error-less or the row gets poisoned into the failed
    // state before it is ever installed.
    if (getPluginDistFile(pluginId).exists) {
      setPluginError(pluginId, errorMessage(err));
    }
    return undefined;
  }
};
