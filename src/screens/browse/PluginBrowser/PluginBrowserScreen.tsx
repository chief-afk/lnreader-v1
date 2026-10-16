import { SectionList, StyleSheet, Text } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Appbar, EmptyView } from '../../../components';
import { Appbar as PaperAppbar } from 'react-native-paper';
import { useAppDispatch } from '../../../redux/hooks';
import { getSourcesAction } from '../../../redux/source/sourcesSlice';
import { useTheme } from '@hooks/useTheme';
import { useNavigation } from '@react-navigation/native';
import { showToast } from '../../../hooks/showToast';
import {
  fetchRepoManifests,
  installPlugin,
  RepoManifest,
  resolvePluginRepos,
  uninstallPlugin,
} from '../../../plugins/loader';
import {
  InstalledPlugin,
  getAllPlugins,
} from '../../../database/queries/PluginQueries';
import {
  InstalledRepository,
  getAllRepositories,
} from '../../../database/queries/RepoQueries';
import { PluginManifestItem } from '../../../plugins/types';
import { getPluginDistFile } from '../../../plugins/shim';
import { getString } from '../../../../strings/translations';
import PluginCard from './PluginCard';
import RepoManagerModal from './RepoManagerModal';

interface RepoSection {
  title: string;
  repoUrl: string;
  data: PluginManifestItem[];
}

const isPluginDownloaded = (pluginId: string): boolean => {
  try {
    return getPluginDistFile(pluginId).exists;
  } catch {
    return false;
  }
};

const PluginBrowserScreen = () => {
  const theme = useTheme();
  const { goBack } = useNavigation();
  const dispatch = useAppDispatch();

  const [repoManifests, setRepoManifests] = useState<RepoManifest[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState('');
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [repos, setRepos] = useState<InstalledRepository[]>([]);
  const [reposVersion, setReposVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRepoManager, setShowRepoManager] = useState(false);

  const refreshInstalled = useCallback(() => {
    setInstalled(getAllPlugins());
  }, []);

  const refreshRepos = useCallback(() => {
    setRepos(getAllRepositories());
  }, []);

  const onReposChanged = useCallback(() => {
    setReposVersion(version => version + 1);
  }, []);

  useEffect(() => {
    refreshInstalled();
    refreshRepos();
  }, [refreshInstalled, refreshRepos, reposVersion]);

  useEffect(() => {
    let cancelled = false;
    fetchRepoManifests()
      .then(results => {
        if (cancelled) {
          return;
        }
        resolvePluginRepos(results);
        refreshInstalled();
        setRepoManifests(results);
        const failed = results.filter(result => result.error);
        if (failed.length === results.length && failed.length > 0) {
          setLoadError(failed[0].error ?? '');
        } else {
          setLoadError('');
          failed.forEach(result =>
            showToast(
              `${result.repo.name ?? result.repo.repoUrl}: ${result.error}`,
            ),
          );
        }
      })
      .catch(err => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshInstalled, reposVersion]);

  const installedByPluginId = useMemo(() => {
    const map = new Map<string, InstalledPlugin>();
    installed.forEach(plugin => map.set(plugin.pluginId, plugin));
    return map;
  }, [installed]);

  /**
   * Rows recorded without downloaded code (e.g. restored from a v2
   * backup). Their repo may be disabled or gone, so they never show
   * up in any manifest section and get their own listing.
   */
  const seededRows = useMemo(() => {
    if (!repoManifests) {
      return [];
    }
    const listed = new Set<string>();
    repoManifests.forEach(({ items }) =>
      items.forEach(item => listed.add(item.id)),
    );
    return installed.filter(plugin => {
      if (plugin.error || listed.has(plugin.pluginId)) {
        return false;
      }
      return !isPluginDownloaded(plugin.pluginId);
    });
  }, [repoManifests, installed]);

  const sections = useMemo<RepoSection[]>(() => {
    if (!repoManifests) {
      return [];
    }
    const manifestSections: RepoSection[] = repoManifests
      .filter(({ items }) => items.length > 0)
      .map(({ repo, items }) => ({
        title: repo.name ?? repo.repoUrl,
        repoUrl: repo.repoUrl,
        data: [...items].sort(
          (a, b) =>
            a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
        ),
      }));
    if (seededRows.length) {
      manifestSections.push({
        title: getString('pluginBrowser.readyToInstall'),
        repoUrl: '',
        data: seededRows.map(row => ({
          id: row.pluginId,
          name: row.name ?? row.pluginId,
          site: row.site ?? '',
          lang: row.lang ?? '',
          version: row.version ?? '',
          url: '',
          iconUrl: row.iconUrl ?? '',
        })),
      });
    }
    return manifestSections;
  }, [repoManifests, seededRows]);

  // Updates and uninstalls only ever act through the plugin's recorded
  // repo: a repo never overwrites another repo's plugin.
  const canManage = useCallback(
    (repoUrl: string, plugin: InstalledPlugin | undefined) =>
      !plugin || !plugin.repoUrl || plugin.repoUrl === repoUrl,
    [],
  );

  const handleInstall = useCallback(
    async (item: PluginManifestItem, repoUrl: string) => {
      if (busyId) {
        return;
      }
      setBusyId(item.id);
      try {
        await installPlugin(item, repoUrl);
        dispatch(getSourcesAction());
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      } finally {
        refreshInstalled();
        setBusyId(null);
      }
    },
    [busyId, dispatch, refreshInstalled],
  );

  const handleUninstall = useCallback(
    (plugin: InstalledPlugin) => {
      if (busyId) {
        return;
      }
      try {
        uninstallPlugin(plugin.pluginId);
        dispatch(getSourcesAction());
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      } finally {
        refreshInstalled();
      }
    },
    [busyId, dispatch, refreshInstalled],
  );

  return (
    <>
      <Appbar
        title={getString('pluginBrowser.title')}
        handleGoBack={goBack}
        theme={theme}
      >
        <PaperAppbar.Action
          icon="source-branch"
          onPress={() => setShowRepoManager(true)}
          color={theme.onSurface}
        />
      </Appbar>
      {loadError ? (
        <EmptyView icon="(･Д･。" description={loadError} theme={theme} />
      ) : (
        <SectionList
          contentContainerStyle={styles.list}
          sections={sections}
          keyExtractor={item => item.id}
          extraData={installedByPluginId}
          ListEmptyComponent={
            repoManifests ? (
              <EmptyView
                icon="(･Д･。"
                description={getString('pluginBrowser.listEmpty')}
                theme={theme}
              />
            ) : null
          }
          renderSectionHeader={({ section: { title, data } }) =>
            data.length > 0 ? (
              <Text
                style={[
                  styles.sectionHeader,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                {title}
              </Text>
            ) : null
          }
          renderItem={({ item, section }) => {
            const plugin = installedByPluginId.get(item.id);
            const seeded =
              !!plugin && !plugin.error && !isPluginDownloaded(plugin.pluginId);
            return (
              <PluginCard
                item={item}
                installed={plugin}
                seeded={seeded}
                canManage={
                  section.repoUrl ? canManage(section.repoUrl, plugin) : false
                }
                busy={busyId === item.id}
                theme={theme}
                onInstall={installItem =>
                  handleInstall(installItem, section.repoUrl)
                }
                onRetry={retryItem => handleInstall(retryItem, section.repoUrl)}
                onUninstall={handleUninstall}
              />
            );
          }}
        />
      )}
      <RepoManagerModal
        visible={showRepoManager}
        closeModal={() => setShowRepoManager(false)}
        repos={repos}
        onReposChanged={onReposChanged}
      />
    </>
  );
};

export default PluginBrowserScreen;

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
