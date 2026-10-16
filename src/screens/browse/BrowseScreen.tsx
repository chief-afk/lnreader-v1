import { SectionList, StyleSheet, Text, View } from 'react-native';
import React, { useCallback, useEffect, useMemo } from 'react';

import { Button, EmptyView, SearchbarV2 } from '../../components';
import {
  defaultLanguage,
  getSourcesAction,
  searchSourcesAction,
  setLastUsedSource,
  togglePinSource,
} from '../../redux/source/sourcesSlice';
import {
  useAppDispatch,
  useBrowseSettings,
  useSourcesReducer,
} from '../../redux/hooks';
import { useTheme } from '@hooks/useTheme';
import { useNavigation } from '@react-navigation/native';
import { useSearch } from '../../hooks';
import SourceCard from './components/SourceCard/SourceCard';
import { getString } from '../../../strings/translations';
import { Source } from '../../sources/types';
import TrackerCard from './discover/TrackerCard';

const BrowseScreen = () => {
  const { navigate } = useNavigation();
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const { searchText, setSearchText, clearSearchbar } = useSearch();

  const onChangeText = (text: string) => {
    setSearchText(text);
    dispatch(searchSourcesAction(text));
  };

  const handleClearSearchbar = () => {
    clearSearchbar();
    dispatch(getSourcesAction());
  };

  const {
    allSources,
    searchResults,
    pinnedSourceIds = [],
    languageFilters = [defaultLanguage || 'English'], //defaultLang cant be null, but just for sure
    lastUsed,
    showLegacySources = false,
  } = useSourcesReducer();

  const {
    showMyAnimeList = true,
    showAniList = true,
    onlyShowPinnedSources = false,
  } = useBrowseSettings();

  useEffect(() => {
    dispatch(getSourcesAction());
  }, [dispatch, languageFilters, showLegacySources]);

  const isPinned = (sourceId: number) => pinnedSourceIds.indexOf(sourceId) > -1;

  const pinnedSources = allSources.filter(source => isPinned(source.sourceId));
  const lastUsedSource = lastUsed
    ? allSources.filter(source => source.sourceId === lastUsed)
    : [];

  const navigateToSource = useCallback(
    (source: Source, showLatestNovels?: boolean) => {
      navigate(
        'SourceScreen' as never,
        {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          url: source.url,
          showLatestNovels,
        } as never,
      );
      dispatch(setLastUsedSource({ sourceId: source.sourceId }));
    },
    [],
  );

  const searchbarActions = useMemo(
    () => [
      {
        iconName: 'book-search',
        onPress: () => navigate('GlobalSearchScreen' as never),
      },
      {
        iconName: 'swap-vertical-variant',
        onPress: () => navigate('Migration' as never),
      },
      {
        iconName: 'cog-outline',
        onPress: () => navigate('BrowseSettings' as never),
      },
      {
        iconName: 'puzzle',
        onPress: () => navigate('PluginBrowser' as never),
      },
    ],
    [navigate],
  );

  const sections = useMemo(() => {
    const list = [
      {
        header: getString('browseScreen.lastUsed'),
        data: lastUsedSource,
      },
    ];

    if (pinnedSourceIds) {
      list.push({
        header: getString('browseScreen.pinned'),
        data: pinnedSources,
      });
    }

    if (!onlyShowPinnedSources) {
      if (searchText) {
        list.unshift({
          header: getString('common.searchResults'),
          data: searchResults,
        });
      } else {
        list.push({
          header: getString('browseScreen.all'),
          data: allSources,
        });
      }
    }

    return list;
  }, [
    lastUsedSource,
    pinnedSourceIds,
    onlyShowPinnedSources,
    JSON.stringify(searchResults),
    searchText,
  ]);

  return (
    <>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('browseScreen.searchbar')}
        leftIcon="magnify"
        onChangeText={onChangeText}
        clearSearchbar={handleClearSearchbar}
        theme={theme}
        rightIcons={searchbarActions}
      />
      {languageFilters.length === 0 ? (
        <EmptyView
          icon="(･Д･。"
          description={getString('browseScreen.listEmpty')}
          theme={theme}
        />
      ) : allSources.length === 0 ? (
        showLegacySources ? null : (
          <View style={styles.pluginEmptyContainer}>
            <EmptyView
              icon="(･Д･。"
              description={getString('browseScreen.pluginListEmpty')}
              theme={theme}
            />
            <Button
              title={getString('browseScreen.browsePlugins')}
              onPress={() => navigate('PluginBrowser' as never)}
              style={styles.pluginEmptyButton}
            />
          </View>
        )
      ) : (
        <>
          <SectionList
            sections={sections}
            ListHeaderComponent={
              showMyAnimeList ? (
                <>
                  <Text
                    style={[
                      styles.sectionHeader,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    {getString('browseScreen.discover')}
                  </Text>
                  {showAniList && (
                    <TrackerCard
                      theme={theme}
                      icon={require('../../../assets/anilist.png')}
                      navTarget="BrowseAL"
                      trackerName="AniList"
                    />
                  )}
                  {showMyAnimeList && (
                    <TrackerCard
                      theme={theme}
                      icon={require('../../../assets/mal.png')}
                      navTarget="BrowseMal"
                      trackerName="MyAnimeList"
                    />
                  )}
                </>
              ) : null
            }
            keyExtractor={(_, index) => index.toString()}
            renderSectionHeader={({ section: { header, data } }) =>
              data.length > 0 ? (
                <Text
                  style={[
                    styles.sectionHeader,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {header}
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <SourceCard
                source={item}
                isPinned={isPinned(item.sourceId)}
                navigateToSource={navigateToSource}
                onTogglePinSource={sourceId =>
                  dispatch(togglePinSource(sourceId))
                }
                theme={theme}
              />
            )}
          />
        </>
      )}
    </>
  );
};

export default BrowseScreen;

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pluginEmptyContainer: {
    flex: 1,
  },
  pluginEmptyButton: {
    marginBottom: 16,
    marginHorizontal: 24,
  },
});
