import { SectionList, StyleSheet, Text } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Appbar, EmptyView } from '../../../components';
import { useAppDispatch } from '../../../redux/hooks';
import { getSourcesAction } from '../../../redux/source/sourcesSlice';
import { useTheme } from '@hooks/useTheme';
import { useNavigation } from '@react-navigation/native';
import { showToast } from '../../../hooks/showToast';
import {
  fetchManifest,
  installPlugin,
  uninstallPlugin,
} from '../../../plugins/loader';
import {
  InstalledPlugin,
  getAllPlugins,
} from '../../../database/queries/PluginQueries';
import { PluginManifestItem } from '../../../plugins/types';
import { getString } from '../../../../strings/translations';
import PluginCard from './PluginCard';

interface PluginSection {
  title: string;
  data: PluginManifestItem[];
}

const PluginBrowserScreen = () => {
  const theme = useTheme();
  const { goBack } = useNavigation();
  const dispatch = useAppDispatch();

  const [manifest, setManifest] = useState<PluginManifestItem[] | null>(null);
  const [manifestError, setManifestError] = useState('');
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshInstalled = useCallback(() => {
    setInstalled(getAllPlugins());
  }, []);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then(items => {
        if (!cancelled) {
          setManifest(items);
          setManifestError('');
        }
      })
      .catch(err => {
        if (!cancelled) {
          setManifestError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const installedByPluginId = useMemo(() => {
    const map = new Map<string, InstalledPlugin>();
    installed.forEach(plugin => map.set(plugin.pluginId, plugin));
    return map;
  }, [installed]);

  const sections = useMemo<PluginSection[]>(() => {
    if (!manifest) {
      return [];
    }
    const byLang = new Map<string, PluginManifestItem[]>();
    manifest.forEach(item => {
      const group = byLang.get(item.lang);
      if (group) {
        group.push(item);
      } else {
        byLang.set(item.lang, [item]);
      }
    });
    return [...byLang.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lang, items]) => ({
        title: lang,
        data: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [manifest]);

  const handleInstall = useCallback(
    async (item: PluginManifestItem) => {
      if (busyId) {
        return;
      }
      setBusyId(item.id);
      try {
        await installPlugin(item);
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
      />
      {manifestError ? (
        <EmptyView icon="(･Д･。" description={manifestError} theme={theme} />
      ) : (
        <SectionList
          contentContainerStyle={styles.list}
          sections={sections}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            manifest ? (
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
          renderItem={({ item }) => (
            <PluginCard
              item={item}
              installed={installedByPluginId.get(item.id)}
              busy={busyId === item.id}
              theme={theme}
              onInstall={handleInstall}
              onRetry={handleInstall}
              onUninstall={handleUninstall}
            />
          )}
        />
      )}
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
