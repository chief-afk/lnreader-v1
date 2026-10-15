import {
  cloudflareCheck,
  defaultUserAgentString,
  fetchApi as fetchApiV1,
} from '../utils/fetch/fetch';
import { isUrlAbsolute } from '../utils/isAbsoluteUrl';
import {
  clearPluginError,
  InstalledPlugin,
  setPluginError,
  upsertPlugin,
} from '../database/queries/PluginQueries';
import {
  createRequireShim,
  getPluginDistFile,
  PLUGIN_ID_PATTERN,
  validatePluginId,
} from './shim';
import { Plugin, PluginImageRequestInit, PluginManifestItem } from './types';

export const OFFICIAL_PLUGIN_MANIFEST_URL =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json';

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
  if (!Array.isArray(manifest)) {
    throw new Error('Plugin manifest has an unexpected format');
  }
  return manifest;
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
    setPluginError(pluginId, errorMessage(err));
    return undefined;
  }
};
