import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import BackgroundService from 'react-native-background-actions';
import { deleteDatabaseAsync, openDatabaseSync } from 'expo-sqlite';

import {
  createRestoreContext,
  importCategories,
  importHistory,
  importNovelWithChapters,
  isLNReaderDatabase,
  readLegacyDatabase,
} from '../../../database/queries/BackupQueries';
import { showToast } from '../../../hooks/showToast';

export const importLegacyDatabase = async () => {
  let legacyDb;
  let dbName;

  try {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });

    const fileUri = picked.assets?.[0]?.uri;

    if (!fileUri) {
      return;
    }

    dbName = 'lnreader_import_' + Date.now() + '.db';

    await FileSystem.copyAsync({
      from: fileUri,
      to: FileSystem.documentDirectory + 'SQLite/' + dbName,
    });

    legacyDb = openDatabaseSync(dbName);

    if (!isLNReaderDatabase(legacyDb)) {
      throw new Error('Not a valid LNReader database file');
    }

    const data = readLegacyDatabase(legacyDb);

    if (!data.novels.length) {
      throw new Error('No followed novels found in the database');
    }

    const chaptersByNovel = new Map();
    data.chapters.forEach(chapter => {
      const novelChapters = chaptersByNovel.get(chapter.novelId) || [];
      novelChapters.push(chapter);
      chaptersByNovel.set(chapter.novelId, novelChapters);
    });

    const notificationOptions = {
      taskName: 'v1 Import',
      taskTitle: 'Importing old LNReader data',
      taskDesc: '(0/' + data.novels.length + ')',
      taskIcon: { name: 'notification_icon', type: 'drawable' },
      color: '#00adb5',
      parameters: { delay: 1000 },
      linkingURI: 'lnreaderv1://updates',
      progressBar: { max: data.novels.length, value: 0 },
    };

    const context = createRestoreContext();

    const importLegacyData = async () =>
      await new Promise(async resolve => {
        try {
          importCategories(context, data.categories);
        } catch (error) {
          showToast('Import failed: ' + error.message);
          resolve();
          return;
        }

        for (
          let i = 0;
          BackgroundService.isRunning() && i < data.novels.length;
          i++
        ) {
          try {
            if (BackgroundService.isRunning()) {
              importNovelWithChapters(
                context,
                data.novels[i],
                chaptersByNovel.get(data.novels[i].novelId),
              );

              await BackgroundService.updateNotification({
                taskTitle: data.novels[i].novelName,
                taskDesc: '(' + (i + 1) + '/' + data.novels.length + ')',
                progressBar: { max: data.novels.length, value: i + 1 },
              });
            }
          } catch (error) {
            showToast(
              (data.novels[i]?.novelName || 'Novel') + ': ' + error.message,
            );
            continue;
          }
        }

        importHistory(context, data.history);

        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Import finished',
            body: data.novels.length + ' novels imported',
          },
          trigger: null,
        });

        resolve();
      });

    await BackgroundService.start(importLegacyData, notificationOptions);
  } catch (error) {
    showToast(error.message);
  } finally {
    if (legacyDb) {
      legacyDb.closeSync();
    }
    if (dbName) {
      deleteDatabaseAsync(dbName).catch(() => {});
    }
  }
};
