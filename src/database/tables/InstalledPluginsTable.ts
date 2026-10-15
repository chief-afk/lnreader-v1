export const createInstalledPluginsTableQuery = `
    CREATE TABLE IF NOT EXISTS installedPlugins(
        sourceId INTEGER PRIMARY KEY AUTOINCREMENT,
        pluginId TEXT UNIQUE NOT NULL,
        name TEXT,
        site TEXT,
        lang TEXT,
        version TEXT,
        iconUrl TEXT,
        repoUrl TEXT,
        error TEXT
      )
  `;
