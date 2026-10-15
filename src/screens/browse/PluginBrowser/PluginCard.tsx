import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../../components';
import { getString } from '../../../../strings/translations';
import { InstalledPlugin } from '../../../database/queries/PluginQueries';
import { PluginManifestItem } from '../../../plugins/types';
import { coverPlaceholderColor } from '../../../theme/colors';
import { ThemeColors } from '../../../theme/types';
import { newer } from '../../../utils/compareVersion';

interface Props {
  item: PluginManifestItem;
  installed: InstalledPlugin | undefined;
  busy: boolean;
  theme: ThemeColors;
  onInstall: (item: PluginManifestItem) => void;
  onRetry: (item: PluginManifestItem) => void;
  onUninstall: (plugin: InstalledPlugin) => void;
}

const PluginCard = ({
  item,
  installed,
  busy,
  theme,
  onInstall,
  onRetry,
  onUninstall,
}: Props) => {
  const hasUpdate =
    !!installed &&
    !installed.error &&
    newer(item.version, installed.version ?? '');
  const version =
    installed && !installed.error
      ? installed.version ?? item.version
      : item.version;

  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        <Image source={{ uri: item.iconUrl }} style={styles.icon} />
        <View style={styles.details}>
          <Text style={{ color: theme.onSurface }}>{item.name}</Text>
          <Text style={[{ color: theme.onSurfaceVariant }, styles.description]}>
            {`${item.lang} · v${version}`}
          </Text>
          {installed?.error ? (
            <Text
              style={[styles.description, { color: theme.error }]}
              numberOfLines={3}
            >
              {installed.error}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        {installed?.error ? (
          <Button
            title={getString('pluginBrowser.retry')}
            textColor={theme.primary}
            onPress={() => onRetry(item)}
            disabled={busy}
          />
        ) : installed ? (
          hasUpdate ? (
            <Button
              title={getString('pluginBrowser.update')}
              textColor={theme.primary}
              onPress={() => onInstall(item)}
              disabled={busy}
            />
          ) : (
            <Text style={{ color: theme.primary }}>
              {getString('pluginBrowser.installed')}
            </Text>
          )
        ) : (
          <Button
            title={getString('pluginBrowser.install')}
            textColor={theme.primary}
            onPress={() => onInstall(item)}
            disabled={busy}
          />
        )}
        {installed ? (
          <Button
            title={getString('pluginBrowser.uninstall')}
            textColor={theme.error}
            onPress={() => onUninstall(installed)}
            disabled={busy}
          />
        ) : null}
      </View>
    </View>
  );
};

export default PluginCard;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingVertical: 12,
  },
  icon: {
    height: 40,
    width: 40,
    borderRadius: 4,
    backgroundColor: coverPlaceholderColor,
  },
  leftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  details: {
    flexShrink: 1,
    marginLeft: 16,
  },
  description: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
