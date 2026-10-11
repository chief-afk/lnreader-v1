import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import BackgroundService from 'react-native-background-actions';

import { restoreLibrary } from '../../../database/queries/NovelQueries';
import {
  createRestoreContext,
  getBackupExportData,
  importCategories,
  importHistory,
  importNovelWithChapters,
} from '../../../database/queries/BackupQueries';
import { showToast } from '../../../hooks/showToast';
import dayjs from 'dayjs';

const sleep = time => new Promise(resolve => setTimeout(() => resolve(), time));

export const createBackup = async () => {
  try {
    const { novels, categories, chapters, history } = getBackupExportData();

    const payload = {
      format: 'lnreader-fork-backup',
      version: 1,
      exportedAt: dayjs().toISOString(),
      novels,
      categories,
      chapters,
      history,
    };

    const permissions =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      return;
    }

    const uri = permissions.directoryUri;

    const datetime = dayjs().format('YYYY-MM-DD_HH:mm');

    const fileName = 'lnreader_backup_' + datetime;

    if (uri) {
      const fileUri = await StorageAccessFramework.createFileAsync(
        uri,
        fileName,
        'application/json',
      );

      await StorageAccessFramework.writeAsStringAsync(
        fileUri,
        JSON.stringify(payload),
      );

      showToast(`Backup created ${fileName}`);
    }
  } catch (error) {
    showToast(error.message);
  }
};

const restoreOfficialBackup = async novels => {
  if (!novels.length) {
    return;
  }

  const notificationOptions = {
    taskName: 'Backup Restore',
    taskTitle: 'Restoring backup',
    taskDesc: '(0/' + novels.length + ')',
    taskIcon: { name: 'notification_icon', type: 'drawable' },
    color: '#00adb5',
    parameters: { delay: 1000 },
    linkingURI: 'lnreaderv1://updates',
    progressBar: { max: novels.length, value: 0 },
  };

  const restoreBackupBackgroundAction = async taskData =>
    await new Promise(async resolve => {
      for (let i = 0; BackgroundService.isRunning() && i < novels.length; i++) {
        try {
          if (BackgroundService.isRunning()) {
            await restoreLibrary(novels[i]);

            await BackgroundService.updateNotification({
              taskTitle: novels[i].novelName,
              taskDesc: '(' + (i + 1) + '/' + novels.length + ')',
              progressBar: { max: novels.length, value: i + 1 },
            });

            if (novels.length === i + 1) {
              resolve();

              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Library Restored',
                  body: novels.length + ' novels restored',
                },
                trigger: null,
              });
            }

            const nextNovelIndex = i + 1;

            if (
              nextNovelIndex in novels &&
              novels[nextNovelIndex].sourceId === novels[i].sourceId
            ) {
              await sleep(taskData.delay);
            }
          }
        } catch (error) {
          showToast((novels[i]?.novelName || 'Novel') + ': ' + error.message);
          continue;
        }
      }

      resolve();
    });

  await BackgroundService.start(
    restoreBackupBackgroundAction,
    notificationOptions,
  );
};

const restoreForkBackup = async backup => {
  const novels = backup.novels;

  if (!novels.length) {
    return;
  }

  const chaptersByNovel = new Map();
  (backup.chapters || []).forEach(chapter => {
    const novelChapters = chaptersByNovel.get(chapter.novelId) || [];
    novelChapters.push(chapter);
    chaptersByNovel.set(chapter.novelId, novelChapters);
  });

  const notificationOptions = {
    taskName: 'Backup Restore',
    taskTitle: 'Restoring backup',
    taskDesc: '(0/' + novels.length + ')',
    taskIcon: { name: 'notification_icon', type: 'drawable' },
    color: '#00adb5',
    parameters: { delay: 1000 },
    linkingURI: 'lnreaderv1://updates',
    progressBar: { max: novels.length, value: 0 },
  };

  const context = createRestoreContext();

  const restoreBackupBackgroundAction = async () =>
    await new Promise(async resolve => {
      try {
        importCategories(context, backup.categories);
      } catch (error) {
        showToast('Restore failed: ' + error.message);
        resolve();
        return;
      }

      for (let i = 0; BackgroundService.isRunning() && i < novels.length; i++) {
        try {
          if (BackgroundService.isRunning()) {
            importNovelWithChapters(
              context,
              novels[i],
              chaptersByNovel.get(novels[i].novelId),
            );

            await BackgroundService.updateNotification({
              taskTitle: novels[i].novelName,
              taskDesc: '(' + (i + 1) + '/' + novels.length + ')',
              progressBar: { max: novels.length, value: i + 1 },
            });
          }
        } catch (error) {
          showToast((novels[i]?.novelName || 'Novel') + ': ' + error.message);
          continue;
        }
      }

      importHistory(context, backup.history);

      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Library Restored',
          body: novels.length + ' novels restored',
        },
        trigger: null,
      });

      resolve();
    });

  await BackgroundService.start(
    restoreBackupBackgroundAction,
    notificationOptions,
  );
};

export const restoreBackup = async () => {
  try {
    const backup = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });

    const fileUri = backup.assets?.[0]?.uri;

    if (fileUri) {
      const parsed = JSON.parse(
        await StorageAccessFramework.readAsStringAsync(fileUri),
      );

      if (Array.isArray(parsed)) {
        await restoreOfficialBackup(parsed);
      } else if (parsed && Array.isArray(parsed.novels)) {
        await restoreForkBackup(parsed);
      } else {
        showToast('Not a recognizable LNReader backup file');
      }
    }
  } catch (error) {
    showToast(error.message);
  }
};
