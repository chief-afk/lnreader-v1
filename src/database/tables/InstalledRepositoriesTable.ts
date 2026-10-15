import {
  OFFICIAL_PLUGIN_MANIFEST_URL,
  OFFICIAL_PLUGIN_REPO_NAME,
} from '../../plugins/constants';

export const createInstalledRepositoriesTableQuery = `
    CREATE TABLE IF NOT EXISTS installedRepositories(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repoUrl TEXT UNIQUE NOT NULL,
        name TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )
  `;

export const createOfficialRepositoryQuery = `
    INSERT OR IGNORE INTO installedRepositories (repoUrl, name, enabled)
    VALUES ('${OFFICIAL_PLUGIN_MANIFEST_URL}', '${OFFICIAL_PLUGIN_REPO_NAME}', 1)
  `;
