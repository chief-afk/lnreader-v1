import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Modal, overlay, Portal, Switch } from 'react-native-paper';

import { Button, IconButtonV2 } from '../../../components';
import { useTheme } from '@hooks/useTheme';
import { showToast } from '@hooks/showToast';
import { getString } from '@strings/translations';
import {
  InstalledRepository,
  countPluginsByRepo,
  deleteRepository,
  isOfficialRepository,
  setRepositoryEnabled,
} from '../../../database/queries/RepoQueries';
import AddRepoModal from './AddRepoModal';

interface RepoManagerModalProps {
  visible: boolean;
  closeModal: () => void;
  repos: InstalledRepository[];
  onReposChanged: () => void;
}

const RepoManagerModal: React.FC<RepoManagerModalProps> = ({
  visible,
  closeModal,
  repos,
  onReposChanged,
}) => {
  const theme = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemove, setPendingRemove] =
    useState<InstalledRepository | null>(null);

  const removeCount = pendingRemove
    ? countPluginsByRepo(pendingRemove.repoUrl)
    : 0;
  const removeReport =
    removeCount === 0
      ? getString('reposScreen.removeReportNone')
      : `${removeCount} ${getString(
          removeCount === 1
            ? 'reposScreen.removeReportOne'
            : 'reposScreen.removeReportMany',
        )}`;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={closeModal}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: overlay(2, theme.surface) },
        ]}
      >
        <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
          {getString('reposScreen.title')}
        </Text>
        {repos.map(repo => (
          <View key={repo.id} style={styles.repoRow}>
            <View style={styles.repoInfo}>
              <View style={styles.nameRow}>
                <Text style={{ color: theme.onSurface }}>
                  {repo.name ?? repo.repoUrl}
                </Text>
                {isOfficialRepository(repo) ? (
                  <Text style={[styles.officialTag, { color: theme.primary }]}>
                    {getString('reposScreen.officialTag')}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[styles.repoUrl, { color: theme.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {repo.repoUrl}
              </Text>
            </View>
            <Switch
              value={!!repo.enabled}
              onValueChange={enabled => {
                setRepositoryEnabled(repo.id, enabled);
                onReposChanged();
              }}
            />
            {!isOfficialRepository(repo) ? (
              <IconButtonV2
                name="delete-outline"
                size={22}
                onPress={() => setPendingRemove(repo)}
                theme={theme}
              />
            ) : null}
          </View>
        ))}
        <View style={styles.btnContainer}>
          <Button
            title={getString('reposScreen.add')}
            onPress={() => setShowAddModal(true)}
          />
        </View>
      </Modal>
      <AddRepoModal
        visible={showAddModal}
        closeModal={() => setShowAddModal(false)}
        onAdded={() => {
          setShowAddModal(false);
          onReposChanged();
        }}
      />
      <Modal
        visible={!!pendingRemove}
        onDismiss={() => setPendingRemove(null)}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: overlay(2, theme.surface) },
        ]}
      >
        <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
          {getString('reposScreen.removeTitle')}
        </Text>
        <Text style={{ color: theme.onSurfaceVariant }}>{removeReport}</Text>
        <View style={styles.btnContainer}>
          <Button
            title={getString('reposScreen.remove')}
            onPress={() => {
              if (pendingRemove) {
                try {
                  deleteRepository(pendingRemove.id);
                  onReposChanged();
                } catch (err) {
                  showToast(err instanceof Error ? err.message : String(err));
                }
              }
              setPendingRemove(null);
            }}
          />
          <Button
            title={getString('common.cancel')}
            onPress={() => setPendingRemove(null)}
          />
        </View>
      </Modal>
    </Portal>
  );
};

export default RepoManagerModal;

const styles = StyleSheet.create({
  modalContainer: {
    margin: 30,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 32,
  },
  modalTitle: {
    fontSize: 24,
    marginBottom: 16,
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  repoInfo: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  officialTag: {
    fontSize: 12,
    marginLeft: 8,
  },
  repoUrl: {
    fontSize: 12,
  },
  btnContainer: {
    marginTop: 24,
    flexDirection: 'row-reverse',
  },
});
