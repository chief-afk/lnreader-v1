import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Modal, overlay, Portal, TextInput } from 'react-native-paper';

import { Button } from '../../../components';
import { useTheme } from '@hooks/useTheme';
import { showToast } from '@hooks/showToast';
import { getString } from '@strings/translations';
import {
  assertRepoUrl,
  fetchManifest,
  validatePluginManifest,
} from '../../../plugins/loader';
import {
  addRepository,
  defaultRepoNameForUrl,
} from '../../../database/queries/RepoQueries';

interface AddRepoModalProps {
  visible: boolean;
  closeModal: () => void;
  onAdded: () => void;
}

const AddRepoModal: React.FC<AddRepoModalProps> = ({
  visible,
  closeModal,
  onAdded,
}) => {
  const theme = useTheme();
  const [repoUrl, setRepoUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setRepoUrl('');
      setConfirming(false);
      setUrlError('');
      setBusy(false);
    }
  }, [visible]);

  const startAdd = () => {
    try {
      assertRepoUrl(repoUrl.trim());
    } catch {
      setUrlError(getString('reposScreen.invalidUrl'));
      return;
    }
    // The one-time "this runs third-party code" confirmation: shown
    // before the first fetch of a newly added repository.
    setUrlError('');
    setConfirming(true);
  };

  const confirmAdd = async () => {
    setBusy(true);
    try {
      const url = assertRepoUrl(repoUrl.trim());
      validatePluginManifest(await fetchManifest(url));
      addRepository(url, defaultRepoNameForUrl(url));
      showToast(getString('reposScreen.added'));
      onAdded();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

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
          {getString(
            confirming ? 'reposScreen.thirdPartyTitle' : 'reposScreen.add',
          )}
        </Text>
        {confirming ? (
          <>
            <Text style={{ color: theme.onSurfaceVariant }}>
              {getString('reposScreen.thirdPartyWarning')}
            </Text>
            <View style={styles.btnContainer}>
              <Button
                title={getString('reposScreen.add')}
                onPress={confirmAdd}
                disabled={busy}
              />
              <Button
                title={getString('common.cancel')}
                onPress={closeModal}
                disabled={busy}
              />
            </View>
          </>
        ) : (
          <>
            <TextInput
              autoFocus
              value={repoUrl}
              placeholder={getString('reposScreen.urlPlaceholder')}
              onChangeText={setRepoUrl}
              mode="outlined"
              underlineColor={theme.outline}
              theme={{ colors: { ...theme } }}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {urlError ? (
              <Text style={[styles.errorText, { color: theme.error }]}>
                {urlError}
              </Text>
            ) : null}
            <View style={styles.btnContainer}>
              <Button title={getString('reposScreen.add')} onPress={startAdd} />
              <Button title={getString('common.cancel')} onPress={closeModal} />
            </View>
          </>
        )}
      </Modal>
    </Portal>
  );
};

export default AddRepoModal;

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
  errorText: {
    marginTop: 8,
  },
  btnContainer: {
    marginTop: 24,
    flexDirection: 'row-reverse',
  },
});
