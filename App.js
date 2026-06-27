import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEvent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const {
  classifySourceUrl,
  isValidHttpUrl,
} = require('./src/iptv-core');
const {
  fetchTvBoxConfig,
  fetchTvBoxDetail,
  fetchTvBoxSearch,
  isBuiltInMockConfigUrl,
  resolveTvBoxEpisode,
} = require('./src/iptv-api');

const BUILT_IN_TEST_CONFIG_URL = 'mock://demo-tvbox';

const STORAGE_KEYS = {
  live: 'iptv.prototype.recentLiveUrl',
  vod: 'iptv.prototype.recentVodUrl',
  configUrl: 'iptv.prototype.configUrl',
  configSources: 'iptv.prototype.configSources',
  sites: 'iptv.prototype.sites',
  selectedSiteId: 'iptv.prototype.selectedSiteId',
};

const LABELS = {
  live: '直播',
  vod: '点播',
  config: '配置',
};

export default function App() {
  const [liveUrl, setLiveUrl] = useState('');
  const [vodUrl, setVodUrl] = useState('');
  const [configUrl, setConfigUrl] = useState('');
  const [configSources, setConfigSources] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [activeType, setActiveType] = useState('live');
  const [currentUrl, setCurrentUrl] = useState('');
  const [message, setMessage] = useState('等待播放地址');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState('');
  const [loadingEpisodeKey, setLoadingEpisodeKey] = useState('');

  const player = useVideoPlayer(null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: null,
  });

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) || null,
    [selectedSiteId, sites]
  );

  const currentLabel = useMemo(() => LABELS[activeType], [activeType]);

  useEffect(() => {
    restoreLocalState().catch(() => {
      setMessage('读取本地数据失败');
    });
  }, []);

  useEffect(() => {
    if (error?.message) {
      setMessage(`播放错误：${error.message}`);
      return;
    }

    if (status === 'loading') {
      setMessage('正在加载视频');
      return;
    }

    if (status === 'readyToPlay' && currentUrl) {
      setMessage(isPlaying ? '正在播放' : '已就绪');
    }
  }, [currentUrl, error, isPlaying, status]);

  async function restoreLocalState() {
    const [
      storedLiveUrl,
      storedVodUrl,
      storedConfigUrl,
      storedSources,
      storedSites,
      storedSelectedSiteId,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.live),
      AsyncStorage.getItem(STORAGE_KEYS.vod),
      AsyncStorage.getItem(STORAGE_KEYS.configUrl),
      AsyncStorage.getItem(STORAGE_KEYS.configSources),
      AsyncStorage.getItem(STORAGE_KEYS.sites),
      AsyncStorage.getItem(STORAGE_KEYS.selectedSiteId),
    ]);

    const nextSources = parseStoredArray(storedSources);
    const nextSites = parseStoredArray(storedSites);

    setLiveUrl(storedLiveUrl || '');
    setVodUrl(storedVodUrl || '');
    setConfigUrl(storedConfigUrl || '');
    setConfigSources(nextSources);
    setSites(nextSites);

    if (nextSites.some((site) => site.id === storedSelectedSiteId)) {
      setSelectedSiteId(storedSelectedSiteId);
    } else {
      setSelectedSiteId(firstUsableSiteId(nextSites));
    }
  }

  async function playDirectUrl(type) {
    const sourceUrl = type === 'live' ? liveUrl : vodUrl;
    const cleanUrl = sourceUrl.trim();

    if (!cleanUrl) {
      setActiveType(type);
      setMessage(`请输入${LABELS[type]}地址`);
      return;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      setActiveType(type);
      setMessage(`${LABELS[type]}地址需要以 http:// 或 https:// 开头`);
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEYS[type], cleanUrl);
    await playResolvedUrl(type, cleanUrl, `${LABELS[type]}地址`);
  }

  async function playResolvedUrl(type, url, title) {
    setActiveType(type);
    setCurrentUrl(url);
    setMessage('正在加载视频');

    await player.replaceAsync({
      uri: url,
      metadata: {
        title,
      },
    });
    player.play();
  }

  function pauseOrResume() {
    if (!currentUrl) {
      setMessage('请先播放一个地址');
      return;
    }

    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }

  async function importConfigSource() {
    await importConfigFromUrl(configUrl);
  }

  async function importBuiltInTestSource() {
    setConfigUrl(BUILT_IN_TEST_CONFIG_URL);
    await importConfigFromUrl(BUILT_IN_TEST_CONFIG_URL);
  }

  async function importConfigFromUrl(url) {
    const cleanUrl = url.trim();

    if (!cleanUrl) {
      setActiveType('config');
      setMessage('请输入配置接口地址');
      return;
    }

    const classification = classifySourceUrl(cleanUrl);

    if (classification.kind === 'invalid') {
      setActiveType('config');
      setMessage(classification.reason);
      return;
    }

    setLoadingConfig(true);
    setActiveType('config');
    setMessage(
      isBuiltInMockConfigUrl(cleanUrl) ? '正在导入测试源' : '正在导入配置'
    );

    try {
      if (classification.kind === 'plugin') {
        const pluginSource = {
          id: cleanUrl,
          name: sourceNameFromUrl(cleanUrl, '插件源'),
          url: cleanUrl,
          importedAt: new Date().toISOString(),
          kind: 'plugin',
          reason: classification.reason,
        };
        const nextSources = upsertById(configSources, pluginSource);

        setConfigSources(nextSources);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.configUrl, cleanUrl),
          saveJson(STORAGE_KEYS.configSources, nextSources),
        ]);
        setMessage('已识别为插件源，当前版本不会执行第三方脚本');
        return;
      }

      const parsed = await fetchTvBoxConfig(cleanUrl);
      const source = {
        ...parsed.source,
        kind: 'config',
        reason: '',
      };
      const nextSources = upsertById(configSources, source);
      const importedSites = parsed.sites.map((site) => ({
        ...site,
        id: `${source.id}#${site.id}`,
        siteKey: site.siteKey || site.id,
        sourceId: source.id,
        sourceName: source.name,
      }));
      const nextSites = [
        ...sites.filter((site) => site.sourceId !== source.id),
        ...importedSites,
      ];
      const nextSelectedSiteId =
        firstUsableSiteId(importedSites) || firstUsableSiteId(nextSites);

      setConfigSources(nextSources);
      setSites(nextSites);
      setSelectedSiteId(nextSelectedSiteId);
      setSearchResults([]);
      setSelectedResult(null);
      setSelectedDetail(null);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.configUrl, cleanUrl),
        saveJson(STORAGE_KEYS.configSources, nextSources),
        saveJson(STORAGE_KEYS.sites, nextSites),
        AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, nextSelectedSiteId),
      ]);
      setMessage(`已导入 ${importedSites.length} 个站点`);
    } catch (importError) {
      setMessage(importError?.message || '配置导入失败');
    } finally {
      setLoadingConfig(false);
    }
  }

  async function selectSite(site) {
    setSelectedSiteId(site.id);
    setSelectedResult(null);
    setSelectedDetail(null);
    setSearchResults([]);
    await AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, site.id);

    if (site.unsupportedReason) {
      setMessage(site.unsupportedReason);
    } else if (!site.searchable) {
      setMessage('该站点未声明搜索能力');
    } else {
      setMessage(`已选择 ${site.name}`);
    }
  }

  async function searchSelectedSite() {
    const cleanKeyword = searchKeyword.trim();

    if (!selectedSite) {
      setActiveType('config');
      setMessage('请先导入并选择一个站点');
      return;
    }

    if (!cleanKeyword) {
      setActiveType('config');
      setMessage('请输入搜索关键词');
      return;
    }

    setLoadingSearch(true);
    setActiveType('config');
    setMessage('正在搜索');

    try {
      const results = await fetchTvBoxSearch(selectedSite, cleanKeyword);

      setSearchResults(results);
      setSelectedResult(null);
      setSelectedDetail(null);
      setMessage(results.length ? `找到 ${results.length} 个结果` : '没有搜索结果');
    } catch (searchError) {
      setSearchResults([]);
      setSelectedResult(null);
      setSelectedDetail(null);
      setMessage(searchError?.message || '搜索失败');
    } finally {
      setLoadingSearch(false);
    }
  }

  async function loadDetail(result) {
    if (!selectedSite) {
      setMessage('请先选择站点');
      return;
    }

    setSelectedResult(result);
    setSelectedDetail(null);
    setLoadingDetailId(result.id);
    setMessage('正在读取播放列表');

    try {
      const detail = await fetchTvBoxDetail(selectedSite, result.id);

      setSelectedDetail(detail);
      setMessage(
        detail.playGroups.length ? '请选择播放项' : '该结果没有可播放列表'
      );
    } catch (detailError) {
      setMessage(detailError?.message || '播放列表读取失败');
    } finally {
      setLoadingDetailId('');
    }
  }

  async function playEpisode(group, episode, episodeIndex) {
    if (!selectedSite || !selectedDetail) {
      setMessage('请先选择播放项');
      return;
    }

    const episodeKey = `${group.name}-${episodeIndex}-${episode.name}`;
    setLoadingEpisodeKey(episodeKey);
    setMessage('正在解析播放地址');

    try {
      const playableUrl = await resolveTvBoxEpisode(selectedSite, episode);
      await playResolvedUrl(
        'vod',
        playableUrl,
        `${selectedDetail.name} ${episode.name}`
      );
    } catch (episodeError) {
      setMessage(episodeError?.message || '播放地址解析失败');
    } finally {
      setLoadingEpisodeKey('');
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardRoot}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>私人播放器</Text>
            <Text style={styles.subtitle}>直播 / 点播 / 配置接口</Text>
          </View>

          <View style={styles.playerShell}>
            <VideoView
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
              nativeControls
              player={player}
              style={styles.video}
            />
          </View>

          <View style={styles.statusPanel}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>当前</Text>
              <Text style={styles.statusValue}>{currentLabel}</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusMessageGroup}>
              <Text style={styles.statusLabel}>状态</Text>
              <Text selectable style={styles.statusValue}>
                {message}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>直链播放</Text>
            <UrlInput
              label="直播地址"
              onChangeText={setLiveUrl}
              onPress={() =>
                playDirectUrl('live').catch(() => setMessage('直播加载失败'))
              }
              placeholder="https://example.com/live.m3u8"
              value={liveUrl}
              buttonLabel="播放直播"
              variant="primary"
            />
            <UrlInput
              label="点播地址"
              onChangeText={setVodUrl}
              onPress={() =>
                playDirectUrl('vod').catch(() => setMessage('点播加载失败'))
              }
              placeholder="https://example.com/movie.mp4"
              value={vodUrl}
              buttonLabel="播放点播"
              variant="secondary"
            />
            <Pressable
              accessibilityRole="button"
              onPress={pauseOrResume}
              style={({ pressed }) => [
                styles.outlineButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.outlineButtonText}>
                {isPlaying ? '暂停' : '继续播放'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>配置接口</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setConfigUrl}
              placeholder="https://example.com/tvbox.json"
              placeholderTextColor="#76716b"
              style={styles.input}
              value={configUrl}
            />
            <Pressable
              accessibilityRole="button"
              disabled={loadingConfig}
              onPress={importConfigSource}
              style={({ pressed }) => [
                styles.accentButton,
                (pressed || loadingConfig) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.accentButtonText}>
                {loadingConfig ? '导入中' : '导入配置'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={loadingConfig}
              onPress={() =>
                importBuiltInTestSource().catch(() => setMessage('测试源导入失败'))
              }
              style={({ pressed }) => [
                styles.outlineButton,
                (pressed || loadingConfig) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.outlineButtonText}>使用测试源</Text>
            </Pressable>
            <Text style={styles.helperText}>
              测试源只包含一个公开样片，用来验证搜索和播放流程。
            </Text>
            <SourceList sources={configSources} />
          </View>

          {sites.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>站点</Text>
              <View style={styles.siteList}>
                {sites.map((site) => (
                  <Pressable
                    accessibilityRole="button"
                    key={site.id}
                    onPress={() => selectSite(site)}
                    style={({ pressed }) => [
                      styles.siteRow,
                      selectedSiteId === site.id && styles.siteRowActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <View style={styles.siteMain}>
                      <Text style={styles.siteName}>{site.name}</Text>
                      <Text numberOfLines={1} selectable style={styles.siteMeta}>
                        {site.sourceName || '配置'} · {formatSiteType(site.type)}
                      </Text>
                      {site.unsupportedReason ? (
                        <Text style={styles.warningText}>{site.unsupportedReason}</Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.badge,
                        site.unsupportedReason && styles.badgeMuted,
                      ]}
                    >
                      {site.unsupportedReason
                        ? '插件'
                        : site.searchable
                          ? '可搜索'
                          : '未声明'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>搜索播放</Text>
            <View style={styles.selectedSitePanel}>
              <Text style={styles.statusLabel}>当前站点</Text>
              <Text style={styles.selectedSiteText}>
                {selectedSite ? selectedSite.name : '未选择'}
              </Text>
            </View>
            <TextInput
              autoCorrect={false}
              onChangeText={setSearchKeyword}
              placeholder="影片关键词"
              placeholderTextColor="#76716b"
              returnKeyType="search"
              onSubmitEditing={searchSelectedSite}
              style={styles.input}
              value={searchKeyword}
            />
            <Pressable
              accessibilityRole="button"
              disabled={loadingSearch}
              onPress={searchSelectedSite}
              style={({ pressed }) => [
                styles.accentButton,
                (pressed || loadingSearch) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.accentButtonText}>
                {loadingSearch ? '搜索中' : '搜索'}
              </Text>
            </Pressable>

            {searchResults.length ? (
              <View style={styles.resultList}>
                {searchResults.map((result) => (
                  <Pressable
                    accessibilityRole="button"
                    key={result.id}
                    onPress={() => loadDetail(result)}
                    style={({ pressed }) => [
                      styles.resultRow,
                      selectedResult?.id === result.id && styles.resultRowActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <View style={styles.resultTextGroup}>
                      <Text style={styles.resultTitle}>{result.name}</Text>
                      {result.remarks ? (
                        <Text style={styles.resultMeta}>{result.remarks}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.resultAction}>
                      {loadingDetailId === result.id ? '读取中' : '列表'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {selectedDetail?.playGroups?.length ? (
              <View style={styles.playGroupList}>
                {selectedDetail.playGroups.map((group) => (
                  <View key={group.name} style={styles.playGroup}>
                    <Text style={styles.playGroupTitle}>{group.name}</Text>
                    <View style={styles.episodeGrid}>
                      {group.episodes.map((episode, episodeIndex) => {
                        const episodeKey = `${group.name}-${episodeIndex}-${episode.name}`;

                        return (
                          <Pressable
                            accessibilityRole="button"
                            key={episodeKey}
                            onPress={() => playEpisode(group, episode, episodeIndex)}
                            style={({ pressed }) => [
                              styles.episodeButton,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            <Text numberOfLines={1} style={styles.episodeButtonText}>
                              {loadingEpisodeKey === episodeKey
                                ? '解析中'
                                : episode.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {currentUrl ? (
            <Text selectable style={styles.currentUrl}>
              {currentUrl}
            </Text>
          ) : null}

          <View style={styles.privacyPanel}>
            <Text style={styles.privacyTitle}>小范围测试说明</Text>
            <Text style={styles.privacyText}>
              地址和配置只保存在本机。应用不内置内容源，不上传用户输入的播放地址或配置接口。
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function UrlInput({
  buttonLabel,
  label,
  onChangeText,
  onPress,
  placeholder,
  value,
  variant,
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#76716b"
        style={styles.input}
        value={value}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text
          style={
            variant === 'primary'
              ? styles.primaryButtonText
              : styles.secondaryButtonText
          }
        >
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function SourceList({ sources }) {
  if (!sources.length) {
    return null;
  }

  return (
    <View style={styles.sourceList}>
      {sources.map((source) => (
        <View key={source.id} style={styles.sourceRow}>
          <View style={styles.sourceTextGroup}>
            <Text style={styles.sourceName}>{source.name}</Text>
            <Text numberOfLines={1} selectable style={styles.sourceUrl}>
              {source.url}
            </Text>
          </View>
          <Text style={[styles.badge, source.kind === 'plugin' && styles.badgeMuted]}>
            {source.kind === 'plugin' ? '插件源' : '配置'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function parseStoredArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJson(key, value) {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

function upsertById(items, nextItem) {
  return [nextItem, ...items.filter((item) => item.id !== nextItem.id)];
}

function firstUsableSiteId(items) {
  return items.find((site) => site.searchable && !site.unsupportedReason)?.id || '';
}

function sourceNameFromUrl(value, fallback) {
  try {
    return new URL(value).hostname || fallback;
  } catch {
    return fallback;
  }
}

function formatSiteType(type) {
  if (type === 3) {
    return '插件站点';
  }

  if (type === 1) {
    return '接口站点';
  }

  return `类型 ${type}`;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#111315',
    flex: 1,
  },
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 34,
    paddingTop: 56,
  },
  header: {
    gap: 4,
  },
  title: {
    color: '#f6f2ea',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#a79f94',
    fontSize: 15,
    letterSpacing: 0,
  },
  playerShell: {
    backgroundColor: '#000',
    borderColor: '#302d29',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  video: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: '#1a1d1d',
    borderColor: '#302d29',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  statusItem: {
    minWidth: 54,
  },
  statusLabel: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
  },
  statusValue: {
    color: '#f6f2ea',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  statusDivider: {
    alignSelf: 'stretch',
    backgroundColor: '#35312d',
    width: 1,
  },
  statusMessageGroup: {
    flex: 1,
    gap: 3,
  },
  section: {
    backgroundColor: '#1a1d1d',
    borderColor: '#302d29',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  sectionTitle: {
    color: '#f6f2ea',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  inputGroup: {
    gap: 9,
  },
  inputLabel: {
    color: '#d6cbbd',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#101111',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f6f2ea',
    fontSize: 14,
    letterSpacing: 0,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  helperText: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2ec4a6',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryButtonText: {
    color: '#071411',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1b35b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: '#1a1005',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  accentButton: {
    alignItems: 'center',
    backgroundColor: '#7cc7e8',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
  },
  accentButtonText: {
    color: '#061016',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: '#4a433b',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  outlineButtonText: {
    color: '#f6f2ea',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  sourceList: {
    gap: 8,
  },
  sourceRow: {
    alignItems: 'center',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  sourceTextGroup: {
    flex: 1,
    gap: 2,
  },
  sourceName: {
    color: '#f6f2ea',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceUrl: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
  },
  siteList: {
    gap: 9,
  },
  siteRow: {
    alignItems: 'center',
    backgroundColor: '#111315',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  siteRowActive: {
    borderColor: '#2ec4a6',
  },
  siteMain: {
    flex: 1,
    gap: 3,
  },
  siteName: {
    color: '#f6f2ea',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  siteMeta: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
  },
  warningText: {
    color: '#f1b35b',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  badge: {
    backgroundColor: '#23342e',
    borderRadius: 8,
    color: '#7ce8c8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    minWidth: 56,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: 'center',
  },
  badgeMuted: {
    backgroundColor: '#3a3022',
    color: '#f1b35b',
  },
  selectedSitePanel: {
    backgroundColor: '#111315',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 10,
  },
  selectedSiteText: {
    color: '#f6f2ea',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  resultList: {
    gap: 8,
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: '#111315',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 12,
  },
  resultRowActive: {
    borderColor: '#7cc7e8',
  },
  resultTextGroup: {
    flex: 1,
    gap: 3,
  },
  resultTitle: {
    color: '#f6f2ea',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  resultMeta: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
  },
  resultAction: {
    color: '#7cc7e8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  playGroupList: {
    gap: 12,
  },
  playGroup: {
    gap: 8,
  },
  playGroupTitle: {
    color: '#d6cbbd',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  episodeButton: {
    alignItems: 'center',
    backgroundColor: '#252829',
    borderColor: '#39352f',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 78,
    paddingHorizontal: 10,
  },
  episodeButtonText: {
    color: '#f6f2ea',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    maxWidth: 120,
  },
  currentUrl: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  privacyPanel: {
    backgroundColor: '#151615',
    borderColor: '#302d29',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  privacyTitle: {
    color: '#f6f2ea',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  privacyText: {
    color: '#a79f94',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
});
