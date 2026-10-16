import React from 'react';

import { ScreenContainer } from '../../components/Common';

import { createBackup, restoreBackup } from '../../services/backup/v1/backup';
import { importLegacyDatabase } from '../../services/backup/v1/dbImport';
import { importV2Backup } from '../../services/backup/v2/import';

import { useTheme } from '@hooks/useTheme';
import { Appbar, List } from '@components';
import { showToast } from '../../hooks/showToast';
import { getString } from '../../../strings/translations';

const importV2BackupWithSummary = async () => {
  try {
    const summary = await importV2Backup();

    if (!summary) {
      return;
    }

    const parts = [
      summary.novels.imported
        ? summary.novels.imported + ' ' + getString('backupScreen.novels')
        : '',
      summary.chapters
        ? summary.chapters + ' ' + getString('backupScreen.chapters')
        : '',
      summary.history.imported
        ? summary.history.imported +
          ' ' +
          getString('backupScreen.historyEntries')
        : '',
      summary.categories.imported
        ? summary.categories.imported +
          ' ' +
          getString('backupScreen.categoriesImported')
        : '',
      summary.plugins.seeded
        ? summary.plugins.seeded + ' ' + getString('backupScreen.pluginsSeeded')
        : '',
    ].filter(Boolean);

    if (!parts.length && summary.errors.length) {
      showToast(summary.errors[0]);
      return;
    }

    showToast(
      getString('backupScreen.importV2Finished') +
        (parts.length ? ': ' + parts.join(', ') : '') +
        (summary.novels.failed
          ? ` (${summary.novels.failed} ${getString(
              'backupScreen.failedSuffix',
            )})`
          : ''),
    );
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
};

const BackupSettings = ({ navigation }) => {
  const theme = useTheme();

  return (
    <>
      <ScreenContainer theme={theme}>
        <Appbar
          title="Backup"
          handleGoBack={() => navigation.goBack()}
          theme={theme}
        />
        <List.Section>
          <List.SubHeader theme={theme}>Backup</List.SubHeader>
          <List.Item
            title="Create backup"
            description="Can be used to restore current library"
            onPress={createBackup}
            theme={theme}
          />
          <List.Item
            title="Restore backup"
            description="Restore library from backup file"
            onPress={restoreBackup}
            theme={theme}
          />
          <List.InfoItem
            title="Restoring large backups may freeze the app until restoring is finished"
            icon="information-outline"
            theme={theme}
          />
          <List.InfoItem
            title="Create backup may not work on devices with Android 9 or lower."
            icon="information-outline"
            theme={theme}
          />
        </List.Section>
        <List.Section>
          <List.SubHeader theme={theme}>
            Migrate from official LNReader v1
          </List.SubHeader>
          <List.Item
            title="Import old app database"
            description="Pick the old app's lnreader.db to also restore reading progress, history and categories"
            onPress={importLegacyDatabase}
            theme={theme}
          />
          <List.InfoItem
            title="Extracting the database needs root or adb; downloaded chapters do not transfer. See the README."
            icon="information-outline"
            theme={theme}
          />
          <List.Item
            title={getString('backupScreen.importV2')}
            description={getString('backupScreen.importV2Desc')}
            onPress={importV2BackupWithSummary}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.importV2DownloadedNote')}
            icon="information-outline"
            theme={theme}
          />
        </List.Section>
      </ScreenContainer>
    </>
  );
};

export default BackupSettings;
