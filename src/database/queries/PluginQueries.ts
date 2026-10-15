import { db } from '../db';

export interface InstalledPlugin {
  /** The stable numeric v1 source id for this plugin */
  sourceId: number;
  pluginId: string;
  name?: string;
  site?: string;
  lang?: string;
  version?: string;
  iconUrl?: string;
  repoUrl?: string;
  /** Set when the plugin failed to download or initialize */
  error?: string;
}

export interface PluginUpsertValues {
  pluginId: string;
  name?: string;
  site?: string;
  lang?: string;
  version?: string;
  iconUrl?: string;
  repoUrl?: string;
}

const getPluginBySourceIdQuery = `
  SELECT * FROM installedPlugins WHERE sourceId = ?
`;

export const getPluginBySourceId = (
  sourceId: number,
): InstalledPlugin | null => {
  return db.getFirstSync<InstalledPlugin>(getPluginBySourceIdQuery, [sourceId]);
};

const getPluginByPluginIdQuery = `
  SELECT * FROM installedPlugins WHERE pluginId = ?
`;

export const getPluginByPluginId = (
  pluginId: string,
): InstalledPlugin | null => {
  return db.getFirstSync<InstalledPlugin>(getPluginByPluginIdQuery, [pluginId]);
};

const getAllPluginsQuery = `
  SELECT * FROM installedPlugins ORDER BY IFNULL(name, pluginId)
`;

export const getAllPlugins = (): InstalledPlugin[] => {
  return db.getAllSync<InstalledPlugin>(getAllPluginsQuery);
};

/**
 * Bundled sources occupy the low id space (0..173 today); installed
 * plugins allocate from above it so sourceManager never resolves a
 * plugin id to a bundled scraper (or the reverse).
 */
const PLUGIN_SOURCE_ID_FLOOR = 1000;

const nextPluginSourceId = (): number => {
  const highestId = db.getFirstSync<{ nextId: number }>(
    'SELECT IFNULL(MAX(sourceId), 0) + 1 AS nextId FROM installedPlugins',
  );
  return Math.max(
    PLUGIN_SOURCE_ID_FLOOR,
    highestId?.nextId ?? PLUGIN_SOURCE_ID_FLOOR,
  );
};

/**
 * Inserts the plugin row or refreshes the existing one, keyed by
 * pluginId. Reinstalling keeps the original numeric sourceId stable.
 * Returns the sourceId.
 */
export const upsertPlugin = (plugin: PluginUpsertValues): number => {
  const existing = getPluginByPluginId(plugin.pluginId);
  if (existing) {
    db.runSync(
      `UPDATE installedPlugins
       SET name = ?, site = ?, lang = ?, version = ?, iconUrl = ?, repoUrl = ?
       WHERE pluginId = ?`,
      [
        plugin.name ?? null,
        plugin.site ?? null,
        plugin.lang ?? null,
        plugin.version ?? null,
        plugin.iconUrl ?? null,
        plugin.repoUrl ?? null,
        plugin.pluginId,
      ],
    );
    return existing.sourceId;
  }
  const sourceId = nextPluginSourceId();
  db.runSync(
    `INSERT INTO installedPlugins
       (sourceId, pluginId, name, site, lang, version, iconUrl, repoUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sourceId,
      plugin.pluginId,
      plugin.name ?? null,
      plugin.site ?? null,
      plugin.lang ?? null,
      plugin.version ?? null,
      plugin.iconUrl ?? null,
      plugin.repoUrl ?? null,
    ],
  );
  return sourceId;
};

export const deletePluginByPluginId = (pluginId: string): void => {
  db.runSync('DELETE FROM installedPlugins WHERE pluginId = ?', [pluginId]);
};

export const updatePluginVersion = (
  pluginId: string,
  version: string,
): void => {
  db.runSync('UPDATE installedPlugins SET version = ? WHERE pluginId = ?', [
    version,
    pluginId,
  ]);
};

/**
 * Records a failure on the plugin row, inserting a minimal row keyed
 * by pluginId when the plugin has none yet (a first-install failure
 * runs before upsertPlugin), so the error message always persists.
 */
export const setPluginError = (pluginId: string, error: string): void => {
  if (!getPluginByPluginId(pluginId)) {
    db.runSync(
      'INSERT INTO installedPlugins (sourceId, pluginId, error) VALUES (?, ?, ?)',
      [nextPluginSourceId(), pluginId, error],
    );
    return;
  }
  db.runSync('UPDATE installedPlugins SET error = ? WHERE pluginId = ?', [
    error,
    pluginId,
  ]);
};

export const clearPluginError = (pluginId: string): void => {
  db.runSync('UPDATE installedPlugins SET error = NULL WHERE pluginId = ?', [
    pluginId,
  ]);
};
