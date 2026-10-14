import React from 'react';
import { ScrollView } from 'react-native';

import * as Linking from 'expo-linking';

import { ScreenContainer } from '../../components/Common';
import { MoreHeader } from './components/MoreHeader';
import { appVersion, releaseDate } from '../../utils/versionUtils';
import { useTheme } from '@hooks/useTheme';
import { List } from '@components';

const AboutScreen = ({ navigation }) => {
  const theme = useTheme();

  return (
    <ScreenContainer theme={theme}>
      <MoreHeader
        title="About"
        navigation={navigation}
        theme={theme}
        goBack={true}
      />
      <ScrollView style={{ flex: 1 }}>
        <List.Section>
          <List.Item
            title="Version"
            description={`Stable ${appVersion} (${releaseDate})`}
            theme={theme}
          />
          <List.Item
            title="What's new"
            onPress={() =>
              Linking.openURL(
                `https://github.com/chief-afk/lnreader-v1/releases/tag/v${appVersion}`,
              )
            }
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.Item
            title="Github"
            description="https://github.com/chief-afk/lnreader-v1"
            onPress={() =>
              Linking.openURL('https://github.com/chief-afk/lnreader-v1')
            }
            theme={theme}
          />
        </List.Section>
      </ScrollView>
    </ScreenContainer>
  );
};

export default AboutScreen;
