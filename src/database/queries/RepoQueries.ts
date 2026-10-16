import { db } from '../db';
import {
  OFFICIAL_PLUGIN_MANIFEST_URL,
  OFFICIAL_PLUGIN_REPO_NAME,
} from '../../plugins/constants';

export interface InstalledRepository {
  id: number;
  repoUrl: string;
  name?: string;
  /** SQLite boolean: 1 enabled, 0 disabled */
  enabled: number;
}

const getAllRepositoriesQuery =
  'SELECT * FROM installedRepositories ORDER BY id';

export const getAllRepositories = (): InstalledRepository[] => {
  return db.getAllSync<InstalledRepository>(getAllRepositoriesQuery);
};

export const getEnabledRepositories = (): InstalledRepository[] => {
  return db.getAllSync<InstalledRepository>(
    'SELECT * FROM installedRepositories WHERE enabled = 1 ORDER BY id',
  );
};

export const getRepositoryByUrl = (
  repoUrl: string,
): InstalledRepository | null => {
  return db.getFirstSync<InstalledRepository>(
    'SELECT * FROM installedRepositories WHERE repoUrl = ?',
    [repoUrl],
  );
};

export const isOfficialRepository = (
  repo: Pick<InstalledRepository, 'repoUrl'>,
): boolean => repo.repoUrl === OFFICIAL_PLUGIN_MANIFEST_URL;

/**
 * Inserts a repository, or re-enables the row with the same URL (the
 * official repository also keeps its built-in name). Returns the row
 * id.
 */
export const addRepository = (repoUrl: string, name?: string): number => {
  const existing = getRepositoryByUrl(repoUrl);
  if (existing) {
    if (isOfficialRepository(existing)) {
      db.runSync('UPDATE installedRepositories SET enabled = 1 WHERE id = ?', [
        existing.id,
      ]);
    } else {
      db.runSync(
        'UPDATE installedRepositories SET name = ?, enabled = 1 WHERE id = ?',
        [name ?? existing.name ?? null, existing.id],
      );
    }
    return existing.id;
  }
  const result = db.runSync(
    'INSERT INTO installedRepositories (repoUrl, name) VALUES (?, ?)',
    [repoUrl, name ?? null],
  );
  return result.lastInsertRowId;
};

export const setRepositoryEnabled = (id: number, enabled: boolean): void => {
  db.runSync('UPDATE installedRepositories SET enabled = ? WHERE id = ?', [
    enabled ? 1 : 0,
    id,
  ]);
};

/**
 * The official repository is the pinned built-in default: it can only
 * be disabled, never removed.
 */
export const deleteRepository = (id: number): void => {
  const repo = db.getFirstSync<InstalledRepository>(
    'SELECT * FROM installedRepositories WHERE id = ?',
    [id],
  );
  if (!repo) {
    return;
  }
  if (isOfficialRepository(repo)) {
    throw new Error('The official repository cannot be removed');
  }
  db.runSync('DELETE FROM installedRepositories WHERE id = ?', [id]);
};

/** How many installed plugins were installed from this repository. */
export const countPluginsByRepo = (repoUrl: string): number => {
  const row = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM installedPlugins WHERE repoUrl = ?',
    [repoUrl],
  );
  return row?.count ?? 0;
};

export const defaultRepoNameForUrl = (repoUrl: string): string => {
  try {
    return new URL(repoUrl).hostname;
  } catch {
    return OFFICIAL_PLUGIN_REPO_NAME;
  }
};
