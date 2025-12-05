import { getNovel } from '@database/queries/NovelQueries';
import { insertNovelInLibrary } from '@database/queries/NovelQueriesV2';
import * as DocumentPicker from 'expo-document-picker';
import RNFS from 'react-native-fs';
import { parseEpub } from '@services/epub';

const epubSourceId = 0;

export async function openDirectory() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/epub+zip',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    return;
  }

  const epubFilePath = result.assets[0].uri;

  // Parse the EPUB using JavaScript
  const destDir = `${RNFS.DocumentDirectoryPath}/`;
  const savePath = await parseEpub(epubFilePath, destDir);

  const dbNovel = await getNovel(epubSourceId, savePath);
  if (dbNovel === undefined || dbNovel.followed === 0) {
    await insertNovelInLibrary(epubSourceId, savePath, false, 1);
  }
}
