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
  buildConfigDiagnostics,
  classifySourceUrl,
  getPlayableUrlIssue,
  isValidHttpUrl,
} = require('./src/iptv-core');
const {
  fetchM3uPlaylist,
  fetchTvBoxConfig,
  fetchTvBoxDetail,
  fetchTvBoxSearch,
  isBuiltInMockConfigUrl,
  resolveTvBoxEpisode,
} = require('./src/iptv-api');
const {
  APP_TABS,
  DEFAULT_TAB_ID,
  buildLiveChannelGroups,
  buildWatchingSummary,
  filterLiveChannels,
  getTabById,
} = require('./src/ui-model');
const {
  addPlayHistoryItem,
  normalizePlayHistory,
} = require('./src/play-history');
const {
  testTvBoxSite,
  testTvBoxSites,
} = require('./src/site-tester');
const {
  scanLiveSourceText,
} = require('./src/live-source-scanner');
const {
  scanConfigSourceText,
} = require('./src/config-source-scanner');

const BUILT_IN_TEST_CONFIG_URL = 'mock://demo-tvbox';
const BUILT_IN_TEST_LIVE_PLAYLIST_URL = 'mock://demo-live-m3u';

const STORAGE_KEYS = {
  live: 'iptv.prototype.recentLiveUrl',
  livePlaylistUrl: 'iptv.prototype.livePlaylistUrl',
  liveChannels: 'iptv.prototype.liveChannels',
  vod: 'iptv.prototype.recentVodUrl',
  configUrl: 'iptv.prototype.configUrl',
  configSources: 'iptv.prototype.configSources',
  sites: 'iptv.prototype.sites',
  selectedSiteId: 'iptv.prototype.selectedSiteId',
  playHistory: 'iptv.prototype.playHistory',
};

const LABELS = {
  live: '直播',
  vod: '点播',
  config: '配置',
};

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB_ID);
  const [liveUrl, setLiveUrl] = useState('');
  const [livePlaylistUrl, setLivePlaylistUrl] = useState('');
  const [liveChannels, setLiveChannels] = useState([]);
  const [liveChannelKeyword, setLiveChannelKeyword] = useState('');
  const [selectedLiveGroup, setSelectedLiveGroup] = useState('all');
  const [liveSourceText, setLiveSourceText] = useState('');
  const [liveSourceScanResults, setLiveSourceScanResults] = useState([]);
  const [vodUrl, setVodUrl] = useState('');
  const [configUrl, setConfigUrl] = useState('');
  const [configSourceText, setConfigSourceText] = useState('');
  const [configSourceScanResults, setConfigSourceScanResults] = useState([]);
  const [configSources, setConfigSources] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [activeType, setActiveType] = useState('live');
  const [currentUrl, setCurrentUrl] = useState('');
  const [playHistory, setPlayHistory] = useState([]);
  const [message, setMessage] = useState('等待播放地址');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [scanningConfigSources, setScanningConfigSources] = useState(false);
  const [loadingLivePlaylist, setLoadingLivePlaylist] = useState(false);
  const [scanningLiveSources, setScanningLiveSources] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState('');
  const [loadingEpisodeKey, setLoadingEpisodeKey] = useState('');
  const [testingSite, setTestingSite] = useState(false);
  const [siteTestResult, setSiteTestResult] = useState(null);
  const [siteTestKeyword, setSiteTestKeyword] = useState('test');
  const [testingSites, setTestingSites] = useState(false);
  const [batchSiteTestResult, setBatchSiteTestResult] = useState(null);

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

  const activeTabMeta = useMemo(() => getTabById(activeTab), [activeTab]);
  const currentLabel = useMemo(() => LABELS[activeType] || '播放', [activeType]);
  const liveChannelGroups = useMemo(
    () => buildLiveChannelGroups(liveChannels),
    [liveChannels]
  );
  const filteredLiveChannels = useMemo(
    () =>
      filterLiveChannels(liveChannels, {
        keyword: liveChannelKeyword,
        group: selectedLiveGroup,
      }),
    [liveChannelKeyword, liveChannels, selectedLiveGroup]
  );
  const watchingSummary = useMemo(
    () =>
      buildWatchingSummary({
        liveChannels,
        configSources,
        sites,
        playHistory,
        currentUrl,
      }),
    [configSources, currentUrl, liveChannels, playHistory, sites]
  );
  const configDiagnostics = useMemo(
    () => buildConfigDiagnostics({ sources: configSources, sites }),
    [configSources, sites]
  );

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
      storedLivePlaylistUrl,
      storedLiveChannels,
      storedVodUrl,
      storedConfigUrl,
      storedSources,
      storedSites,
      storedSelectedSiteId,
      storedPlayHistory,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.live),
      AsyncStorage.getItem(STORAGE_KEYS.livePlaylistUrl),
      AsyncStorage.getItem(STORAGE_KEYS.liveChannels),
      AsyncStorage.getItem(STORAGE_KEYS.vod),
      AsyncStorage.getItem(STORAGE_KEYS.configUrl),
      AsyncStorage.getItem(STORAGE_KEYS.configSources),
      AsyncStorage.getItem(STORAGE_KEYS.sites),
      AsyncStorage.getItem(STORAGE_KEYS.selectedSiteId),
      AsyncStorage.getItem(STORAGE_KEYS.playHistory),
    ]);

    const nextSources = parseStoredArray(storedSources);
    const nextSites = parseStoredArray(storedSites);
    const nextLiveChannels = parseStoredArray(storedLiveChannels);
    const nextPlayHistory = normalizePlayHistory(parseStoredArray(storedPlayHistory));

    setLiveUrl(storedLiveUrl || '');
    setLivePlaylistUrl(storedLivePlaylistUrl || '');
    setLiveChannels(nextLiveChannels);
    setVodUrl(storedVodUrl || '');
    setConfigUrl(storedConfigUrl || '');
    setConfigSources(nextSources);
    setSites(nextSites);
    setPlayHistory(nextPlayHistory);

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

    const playableIssue = getPlayableUrlIssue(cleanUrl);

    if (playableIssue) {
      setActiveType(type);
      setMessage(playableIssue);
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEYS[type], cleanUrl);
    await playResolvedUrl(type, cleanUrl, `${LABELS[type]}地址`, {
      sourceName: '直链播放',
    });
  }

  async function playResolvedUrl(type, url, title, historyMeta = {}) {
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
    await recordPlayHistory({
      type,
      title,
      url,
      sourceName: historyMeta.sourceName || '',
    });
  }

  async function recordPlayHistory(item) {
    const nextHistory = addPlayHistoryItem(playHistory, item);

    setPlayHistory(nextHistory);
    await saveJson(STORAGE_KEYS.playHistory, nextHistory);
  }

  async function playHistoryItem(item) {
    if (!item?.url) {
      setMessage('这条历史记录没有可播放地址');
      return;
    }

    await playResolvedUrl(item.type || 'vod', item.url, item.title, {
      sourceName: item.sourceName || '播放历史',
    });
  }

  async function continueLatestPlay() {
    if (currentUrl) {
      pauseOrResume();
      return;
    }

    const latestItem = playHistory[0];

    if (latestItem) {
      await playHistoryItem(latestItem);
      return;
    }

    pauseOrResume();
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

  async function importLivePlaylist() {
    await importLivePlaylistFromUrl(livePlaylistUrl);
  }

  async function importBuiltInLivePlaylist() {
    setLivePlaylistUrl(BUILT_IN_TEST_LIVE_PLAYLIST_URL);
    await importLivePlaylistFromUrl(BUILT_IN_TEST_LIVE_PLAYLIST_URL);
  }

  async function scanPastedLiveSources() {
    const cleanText = liveSourceText.trim();

    if (!cleanText) {
      setActiveType('live');
      setLiveSourceScanResults([]);
      setMessage('请先粘贴直播源说明或链接');
      return;
    }

    setScanningLiveSources(true);
    setActiveType('live');
    setMessage('正在检测直播源链接');

    try {
      const results = await scanLiveSourceText(cleanText);
      const readyCount = results.filter((result) => result.ok).length;

      setLiveSourceScanResults(results);
      setMessage(
        results.length
          ? `已检测 ${results.length} 个链接，${readyCount} 个可导入直播列表`
          : '没有识别到 HTTP/HTTPS 链接'
      );
    } catch (scanError) {
      setLiveSourceScanResults([]);
      setMessage(scanError?.message || '直播源检测失败');
    } finally {
      setScanningLiveSources(false);
    }
  }

  async function importLivePlaylistFromUrl(url) {
    const cleanUrl = url.trim();

    if (!cleanUrl) {
      setActiveType('live');
      setMessage('请输入直播列表地址');
      return;
    }

    if (
      cleanUrl !== BUILT_IN_TEST_LIVE_PLAYLIST_URL &&
      !isValidHttpUrl(cleanUrl)
    ) {
      setActiveType('live');
      setMessage('直播列表地址需要以 http:// 或 https:// 开头');
      return;
    }

    setLoadingLivePlaylist(true);
    setActiveType('live');
    setMessage('正在导入直播列表');

    try {
      const channels = await fetchM3uPlaylist(cleanUrl);

      setLiveChannels(channels);
      setLiveChannelKeyword('');
      setSelectedLiveGroup('all');
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.livePlaylistUrl, cleanUrl),
        saveJson(STORAGE_KEYS.liveChannels, channels),
      ]);
      setMessage(`已导入 ${channels.length} 个直播频道`);
    } catch (playlistError) {
      setLiveChannels([]);
      setMessage(playlistError?.message || '直播列表导入失败');
    } finally {
      setLoadingLivePlaylist(false);
    }
  }

  async function playLiveChannel(channel) {
    if (!channel?.url) {
      setMessage('该频道没有可播放地址');
      return;
    }

    setLiveUrl(channel.url);
    await AsyncStorage.setItem(STORAGE_KEYS.live, channel.url);
    await playResolvedUrl('live', channel.url, channel.name, {
      sourceName: channel.group || '直播列表',
    });
  }

  async function importConfigSource() {
    await importConfigFromUrl(configUrl);
  }

  async function importBuiltInTestSource() {
    setConfigUrl(BUILT_IN_TEST_CONFIG_URL);
    await importConfigFromUrl(BUILT_IN_TEST_CONFIG_URL);
  }

  async function scanPastedConfigSources() {
    const cleanText = configSourceText.trim();

    if (!cleanText) {
      setActiveType('config');
      setConfigSourceScanResults([]);
      setMessage('请先粘贴配置接口说明或链接');
      return;
    }

    setScanningConfigSources(true);
    setActiveType('config');
    setMessage('正在检测配置接口链接');

    try {
      const results = await scanConfigSourceText(cleanText);
      const readyCount = results.filter((result) => result.ok).length;

      setConfigSourceScanResults(results);
      setMessage(
        results.length
          ? `已检测 ${results.length} 个配置链接，${readyCount} 个可导入`
          : '没有识别到配置接口链接'
      );
    } catch (scanError) {
      setConfigSourceScanResults([]);
      setMessage(scanError?.message || '配置接口检测失败');
    } finally {
      setScanningConfigSources(false);
    }
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
    setSiteTestResult(null);
    await AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, site.id);

    if (site.unsupportedReason) {
      setMessage(site.unsupportedReason);
    } else if (!site.searchable) {
      setMessage('该站点未声明搜索能力');
    } else {
      setMessage(`已选择 ${site.name}`);
      setActiveTab('discover');
    }
  }

  async function testSelectedSite() {
    if (!selectedSite) {
      setMessage('请先选择一个站点');
      setSiteTestResult(null);
      return;
    }

    setTestingSite(true);
    setSiteTestResult(null);
    setMessage(`正在测试 ${selectedSite.name}`);

    try {
      const result = await testTvBoxSite(selectedSite, {
        keyword: siteTestKeyword,
      });

      setSiteTestResult(result);
      setMessage(result.message);
    } finally {
      setTestingSite(false);
    }
  }

  async function testAllSearchableSites() {
    setTestingSites(true);
    setBatchSiteTestResult(null);
    setMessage('正在批量测试可搜索站点');

    try {
      const result = await testTvBoxSites(sites, {
        keyword: siteTestKeyword,
      });

      setBatchSiteTestResult(result);
      setMessage(
        `批量测试完成：${result.passedCount} 个通过，${result.failedCount} 个失败`
      );
    } finally {
      setTestingSites(false);
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
        `${selectedDetail.name} ${episode.name}`,
        {
          sourceName: selectedSite.name,
        }
      );
    } catch (episodeError) {
      setMessage(episodeError?.message || '播放地址解析失败');
    } finally {
      setLoadingEpisodeKey('');
    }
  }

  function renderLiveChannelFilters() {
    if (!liveChannels.length) {
      return null;
    }

    return (
      <View style={styles.filterPanel}>
        <TextInput
          autoCorrect={false}
          onChangeText={setLiveChannelKeyword}
          placeholder="搜索频道或分组"
          placeholderTextColor="#8d96a0"
          returnKeyType="search"
          style={styles.searchInput}
          value={liveChannelKeyword}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroller}
        >
          <View style={styles.chipRow}>
            {liveChannelGroups.map((group) => {
              const isActive = selectedLiveGroup === group.id;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={group.id}
                  onPress={() => setSelectedLiveGroup(group.id)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    isActive && styles.filterChipActive,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}
                  >
                    {group.label} {group.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <Text style={styles.helperText}>
          当前显示 {filteredLiveChannels.length} / {liveChannels.length} 个频道
        </Text>
      </View>
    );
  }

  function renderLiveChannelList(
    limit = filteredLiveChannels.length,
    channels = filteredLiveChannels
  ) {
    if (!liveChannels.length) {
      return (
        <Text style={styles.emptyText}>
          还没有直播频道。可以导入自己的 m3u 列表，或先使用测试直播列表验证播放。
        </Text>
      );
    }

    if (!channels.length) {
      return (
        <Text style={styles.emptyText}>
          没有匹配的直播频道。可以换个关键词，或切回“全部”分组。
        </Text>
      );
    }

    return (
      <View style={styles.listStack}>
        {channels.slice(0, limit).map((channel) => (
          <Pressable
            accessibilityRole="button"
            key={channel.id}
            onPress={() =>
              playLiveChannel(channel).catch(() => setMessage('频道加载失败'))
            }
            style={({ pressed }) => [
              styles.listRow,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{channel.name}</Text>
              <Text numberOfLines={1} selectable style={styles.rowMeta}>
                {channel.group || '未分组'} · {channel.url}
              </Text>
            </View>
            <Text style={styles.rowAction}>播放</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  function renderSiteList() {
    if (!sites.length) {
      return (
        <Text style={styles.emptyText}>
          还没有站点。导入 TVBox/OK 影视配置后，可搜索的站点会显示在这里。
        </Text>
      );
    }

    return (
      <View style={styles.listStack}>
        {sites.map((site) => (
          <Pressable
            accessibilityRole="button"
            key={site.id}
            onPress={() => selectSite(site)}
            style={({ pressed }) => [
              styles.listRow,
              selectedSiteId === site.id && styles.listRowActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{site.name}</Text>
              <Text numberOfLines={1} selectable style={styles.rowMeta}>
                {site.sourceName || '配置'} · {formatSiteType(site.type)}
              </Text>
              {site.unsupportedReason ? (
                <Text selectable style={styles.warningText}>
                  {site.unsupportedReason}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.badge, site.unsupportedReason && styles.badgeMuted]}
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
    );
  }

  function renderSearchPanel() {
    return (
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.sectionTitle}>搜索播放</Text>
          <Text style={styles.sectionHint}>从已导入站点获取播放项</Text>
        </View>

        <View style={styles.selectedSitePanel}>
          <Text style={styles.statusLabel}>当前站点</Text>
          <Text style={styles.selectedSiteText}>
            {selectedSite ? selectedSite.name : '未选择'}
          </Text>
          {selectedSite?.unsupportedReason ? (
            <Text selectable style={styles.warningText}>
              {selectedSite.unsupportedReason}
            </Text>
          ) : null}
        </View>

        {!sites.length ? (
          <CompactButton onPress={() => setActiveTab('settings')} variant="plain">
            去设置导入配置
          </CompactButton>
        ) : null}

        <TextInput
          autoCorrect={false}
          onChangeText={setSearchKeyword}
          placeholder="影片关键词"
          placeholderTextColor="#8d96a0"
          returnKeyType="search"
          onSubmitEditing={searchSelectedSite}
          style={styles.input}
          value={searchKeyword}
        />
        <CompactButton
          disabled={loadingSearch}
          onPress={searchSelectedSite}
          variant="accent"
        >
          {loadingSearch ? '搜索中' : '搜索'}
        </CompactButton>

        {searchResults.length ? (
          <View style={styles.listStack}>
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
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{result.name}</Text>
                  {result.remarks ? (
                    <Text style={styles.rowMeta}>{result.remarks}</Text>
                  ) : null}
                </View>
                <Text style={styles.rowAction}>
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
                          {loadingEpisodeKey === episodeKey ? '解析中' : episode.name}
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
    );
  }

  function renderDiscover() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.statsGrid}>
          <StatTile label="直播频道" value={watchingSummary.liveChannelCount} />
          <StatTile label="配置源" value={watchingSummary.configSourceCount} />
          <StatTile label="最近播放" value={watchingSummary.playHistoryCount} />
        </View>

        <View style={styles.quickGrid}>
          <QuickAction
            label="测试直播"
            onPress={() =>
              importBuiltInLivePlaylist().catch(() =>
                setMessage('测试直播列表导入失败')
              )
            }
            value="m3u"
          />
          <QuickAction
            label="测试配置"
            onPress={() =>
              importBuiltInTestSource().catch(() => setMessage('测试源导入失败'))
            }
            value="TVBox"
          />
          <QuickAction
            label="配置接口"
            onPress={() => setActiveTab('settings')}
            value="导入"
          />
          <QuickAction
            label="继续播放"
            onPress={() =>
              continueLatestPlay().catch(() => setMessage('继续播放失败'))
            }
            value={isPlaying ? '暂停' : '播放'}
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>直链播放</Text>
            <Text style={styles.sectionHint}>直播或点播的最终可播放地址</Text>
          </View>
          <UrlInput
            buttonLabel="播放直播"
            label="直播地址"
            onChangeText={setLiveUrl}
            onPress={() =>
              playDirectUrl('live').catch(() => setMessage('直播加载失败'))
            }
            placeholder="https://example.com/live.m3u8"
            value={liveUrl}
            variant="primary"
          />
          <UrlInput
            buttonLabel="播放点播"
            label="点播地址"
            onChangeText={setVodUrl}
            onPress={() =>
              playDirectUrl('vod').catch(() => setMessage('点播加载失败'))
            }
            placeholder="https://example.com/movie.mp4"
            value={vodUrl}
            variant="secondary"
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>直播列表</Text>
            <Text style={styles.sectionHint}>导入 m3u 后选择频道播放</Text>
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setLivePlaylistUrl}
            placeholder="https://example.com/live.m3u"
            placeholderTextColor="#8d96a0"
            style={styles.input}
            value={livePlaylistUrl}
          />
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={loadingLivePlaylist}
              onPress={importLivePlaylist}
              variant="primary"
            >
              {loadingLivePlaylist ? '导入中' : '导入列表'}
            </CompactButton>
            <CompactButton
              disabled={loadingLivePlaylist}
              onPress={() =>
                importBuiltInLivePlaylist().catch(() =>
                  setMessage('测试直播列表导入失败')
                )
              }
              variant="plain"
            >
              测试列表
            </CompactButton>
          </View>
          {renderLiveChannelFilters()}
          {renderLiveChannelList()}
        </View>

        {renderSearchPanel()}
      </View>
    );
  }

  function renderWatching() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>最近状态</Text>
            <Text style={styles.sectionHint}>本机保存的播放和导入记录</Text>
          </View>
          <View style={styles.summaryList}>
            <SummaryRow
              label="当前播放"
              value={
                watchingSummary.hasCurrentUrl
                  ? '有地址'
                  : playHistory.length
                    ? '可继续最近播放'
                    : '未播放'
              }
            />
            <SummaryRow label="直播地址" value={liveUrl || '未保存'} selectable />
            <SummaryRow label="点播地址" value={vodUrl || '未保存'} selectable />
            <SummaryRow
              label="当前站点"
              value={selectedSite ? selectedSite.name : '未选择'}
            />
          </View>
          <View style={styles.buttonRow}>
            <CompactButton
              onPress={() =>
                continueLatestPlay().catch(() => setMessage('继续播放失败'))
              }
              variant="accent"
            >
              {isPlaying ? '暂停播放' : '继续播放'}
            </CompactButton>
            <CompactButton
              onPress={() =>
                playDirectUrl('live').catch(() => setMessage('直播加载失败'))
              }
              variant="plain"
            >
              播放直播
            </CompactButton>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>播放历史</Text>
            <Text style={styles.sectionHint}>最近播放会自动保存在本机</Text>
          </View>
          {playHistory.length ? (
            <View style={styles.listStack}>
              {playHistory.slice(0, 12).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() =>
                    playHistoryItem(item).catch(() => setMessage('历史播放失败'))
                  }
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text numberOfLines={1} selectable style={styles.rowMeta}>
                      {formatHistoryType(item.type)} · {item.sourceName || '本机历史'}
                    </Text>
                  </View>
                  <Text style={styles.rowAction}>继续</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              还没有播放历史。播放一次直播频道、点播剧集或直链地址后，这里会出现继续播放入口。
            </Text>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>最近直播频道</Text>
            <Text style={styles.sectionHint}>从已导入列表快速播放</Text>
          </View>
          {renderLiveChannelList(8, liveChannels)}
        </View>

        {currentUrl ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.sectionTitle}>当前地址</Text>
              <Text style={styles.sectionHint}>长按可复制</Text>
            </View>
            <Text selectable style={styles.currentUrl}>
              {currentUrl}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderSettings() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>直播源批量检测</Text>
            <Text style={styles.sectionHint}>粘贴整段来源说明，自动识别 M3U、网页、配置和插件链接</Text>
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={setLiveSourceText}
            placeholder="可以直接粘贴包含多个直播源链接的整段文字"
            placeholderTextColor="#8d96a0"
            style={[styles.input, styles.multilineInput]}
            textAlignVertical="top"
            value={liveSourceText}
          />
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={scanningLiveSources}
              onPress={() =>
                scanPastedLiveSources().catch(() => setMessage('直播源检测失败'))
              }
              variant="primary"
            >
              {scanningLiveSources ? '检测中' : '检测直播源'}
            </CompactButton>
            <CompactButton
              disabled={scanningLiveSources}
              onPress={() => {
                setLiveSourceText('');
                setLiveSourceScanResults([]);
                setMessage('已清空直播源检测内容');
              }}
              variant="plain"
            >
              清空
            </CompactButton>
          </View>
          <Text style={styles.helperText}>
            检测只读取你粘贴的链接，不内置源；网页类入口会标记为需要浏览器打开。
          </Text>
          {liveSourceScanResults.length ? (
            <LiveSourceScanResultPanel
              onImport={(url) => {
                setLivePlaylistUrl(url);
                importLivePlaylistFromUrl(url).catch(() =>
                  setMessage('直播列表导入失败')
                );
              }}
              results={liveSourceScanResults}
            />
          ) : null}
        </View>

        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>配置接口</Text>
            <Text style={styles.sectionHint}>粘贴 TVBox/OK 影视 JSON URL</Text>
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setConfigUrl}
            placeholder="https://example.com/tvbox.json"
            placeholderTextColor="#8d96a0"
            style={styles.input}
            value={configUrl}
          />
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={loadingConfig}
              onPress={importConfigSource}
              variant="accent"
            >
              {loadingConfig ? '导入中' : '导入配置'}
            </CompactButton>
            <CompactButton
              disabled={loadingConfig}
              onPress={() =>
                importBuiltInTestSource().catch(() => setMessage('测试源导入失败'))
              }
              variant="plain"
            >
              测试源
            </CompactButton>
          </View>
          <Text style={styles.helperText}>
            测试源只包含公开样片，用来验证搜索、详情和播放流程。插件源会被识别，但当前版本不会执行第三方脚本。
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={setConfigSourceText}
            placeholder="也可以粘贴整段 OK影视/TVBox/魔力云播接口说明"
            placeholderTextColor="#8d96a0"
            style={[styles.input, styles.multilineInput]}
            textAlignVertical="top"
            value={configSourceText}
          />
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={scanningConfigSources}
              onPress={() =>
                scanPastedConfigSources().catch(() =>
                  setMessage('配置接口检测失败')
                )
              }
              variant="primary"
            >
              {scanningConfigSources ? '检测中' : '检测配置接口'}
            </CompactButton>
            <CompactButton
              disabled={scanningConfigSources}
              onPress={() => {
                setConfigSourceText('');
                setConfigSourceScanResults([]);
                setMessage('已清空配置接口检测内容');
              }}
              variant="plain"
            >
              清空
            </CompactButton>
          </View>
          {configSourceScanResults.length ? (
            <ConfigSourceScanResultPanel
              onImport={(url) => {
                setConfigUrl(url);
                importConfigFromUrl(url).catch(() => setMessage('配置导入失败'));
              }}
              results={configSourceScanResults}
            />
          ) : null}
          <ConfigDiagnosticsPanel diagnostics={configDiagnostics} />
          <SourceList sources={configSources} />
        </View>

        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>站点</Text>
            <Text style={styles.sectionHint}>选择一个可搜索站点后回到发现页搜索</Text>
          </View>
          <View style={styles.selectedSitePanel}>
            <Text style={styles.statusLabel}>当前站点</Text>
            <Text style={styles.selectedSiteText}>
              {selectedSite ? selectedSite.name : '未选择'}
            </Text>
          </View>
          <TextInput
            autoCorrect={false}
            onChangeText={setSiteTestKeyword}
            placeholder="测试关键词，例如 test"
            placeholderTextColor="#8d96a0"
            returnKeyType="done"
            style={styles.input}
            value={siteTestKeyword}
          />
          <CompactButton
            disabled={!selectedSite || testingSite}
            onPress={() =>
              testSelectedSite().catch(() => setMessage('站点测试失败'))
            }
            variant="accent"
          >
            {testingSite ? '测试中' : '测试当前站点'}
          </CompactButton>
          <CompactButton
            disabled={!configDiagnostics.searchableSites || testingSites}
            onPress={() =>
              testAllSearchableSites().catch(() => setMessage('批量测试失败'))
            }
            variant="primary"
          >
            {testingSites ? '批量测试中' : '一键测试可搜索站点'}
          </CompactButton>
          {batchSiteTestResult ? (
            <BatchSiteTestResultPanel batch={batchSiteTestResult} />
          ) : null}
          {siteTestResult ? <SiteTestResultPanel result={siteTestResult} /> : null}
          {renderSiteList()}
        </View>

        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>小范围测试说明</Text>
            <Text style={styles.sectionHint}>隐私与内容边界</Text>
          </View>
          <Text style={styles.privacyText}>
            地址和配置只保存在本机。应用不内置内容源，不上传用户输入的播放地址或配置接口。所有播放源由用户自行输入和管理。
          </Text>
        </View>
      </View>
    );
  }

  function renderActiveTab() {
    if (activeTab === 'watching') {
      return renderWatching();
    }

    if (activeTab === 'settings') {
      return renderSettings();
    }

    return renderDiscover();
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardRoot}
      >
        <View style={styles.appShell}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Text style={styles.brandText}>私人 IPTV</Text>
                <Text style={styles.buildPill}>iPhone 优先</Text>
              </View>
              <TopTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={APP_TABS}
              />
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{activeTabMeta.label}</Text>
                <Text style={styles.subtitle}>{activeTabMeta.description}</Text>
              </View>
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

            {renderActiveTab()}
          </ScrollView>
          <BottomTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={APP_TABS}
          />
        </View>
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
        placeholderTextColor="#8d96a0"
        style={styles.input}
        value={value}
      />
      <CompactButton fullWidth onPress={onPress} variant={variant}>
        {buttonLabel}
      </CompactButton>
    </View>
  );
}

function CompactButton({
  children,
  disabled = false,
  fullWidth = false,
  onPress,
  variant = 'plain',
}) {
  const buttonStyle = [
    styles.compactButton,
    fullWidth && styles.fullWidthButton,
    variant === 'primary' && styles.primaryButton,
    variant === 'secondary' && styles.secondaryButton,
    variant === 'accent' && styles.accentButton,
    disabled && styles.buttonDisabled,
  ];
  const textStyle = [
    styles.compactButtonText,
    variant === 'plain' && styles.plainButtonText,
  ];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [buttonStyle, pressed && styles.buttonPressed]}
    >
      <Text style={textStyle}>{children}</Text>
    </Pressable>
  );
}

function TopTabs({ activeTab, onChange, tabs }) {
  return (
    <View style={styles.topTabs}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <Pressable
            accessibilityRole="button"
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.topTab,
              isActive && styles.topTabActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.topTabText, isActive && styles.topTabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BottomTabs({ activeTab, onChange, tabs }) {
  return (
    <View style={styles.bottomTabs}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <Pressable
            accessibilityRole="button"
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.bottomTab,
              isActive && styles.bottomTabActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.bottomTabText,
                isActive && styles.bottomTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function QuickAction({ label, onPress, value }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.buttonPressed]}
    >
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function StatTile({ label, value }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, selectable = false, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        numberOfLines={selectable ? undefined : 1}
        selectable={selectable}
        style={styles.summaryValue}
      >
        {value}
      </Text>
    </View>
  );
}

function ConfigDiagnosticsPanel({ diagnostics }) {
  return (
    <View style={styles.diagnosticsPanel}>
      <Text style={styles.diagnosticsSummary}>{diagnostics.summary}</Text>
      <View style={styles.diagnosticsGrid}>
        <DiagnosticTile label="配置源" value={diagnostics.configSourceCount} />
        <DiagnosticTile label="可搜索" value={diagnostics.searchableSites} />
        <DiagnosticTile label="未声明" value={diagnostics.nonSearchableSites} />
        <DiagnosticTile label="插件/不兼容" value={diagnostics.unsupportedSites} />
      </View>
    </View>
  );
}

function SiteTestResultPanel({ result }) {
  return (
    <View
      style={[
        styles.siteTestPanel,
        result.ok ? styles.siteTestPanelPassed : styles.siteTestPanelFailed,
      ]}
    >
      <Text style={styles.siteTestTitle}>
        {result.ok ? '测试通过' : '测试未通过'}
      </Text>
      <Text selectable style={styles.siteTestMessage}>
        {result.message}
      </Text>
      <View style={styles.siteTestGrid}>
        <DiagnosticTile label="关键词" value={result.keyword || '-'} />
        <DiagnosticTile label="线路" value={result.playGroupCount} />
        <DiagnosticTile label="剧集" value={result.episodeCount} />
        <DiagnosticTile label="状态" value={result.status} />
      </View>
      {result.resultName ? (
        <Text selectable style={styles.siteTestMessage}>
          样例结果：{result.resultName}
        </Text>
      ) : null}
    </View>
  );
}

function BatchSiteTestResultPanel({ batch }) {
  return (
    <View style={styles.siteTestPanel}>
      <Text style={styles.siteTestTitle}>
        批量测试：{batch.passedCount} 通过 / {batch.failedCount} 失败
      </Text>
      <Text style={styles.siteTestMessage}>
        关键词：{batch.keyword} · 已测试 {batch.totalSites} 个可搜索站点
      </Text>
      <View style={styles.listStack}>
        {batch.results.map((result) => (
          <View
            key={result.siteId}
            style={[
              styles.batchResultRow,
              result.ok ? styles.batchResultPassed : styles.batchResultFailed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{result.siteName}</Text>
              <Text selectable style={styles.rowMeta}>
                {result.ok
                  ? `${result.resultName || '有搜索结果'} · ${result.playGroupCount} 线路 · ${result.episodeCount} 剧集`
                  : result.message}
              </Text>
            </View>
            <Text style={[styles.badge, !result.ok && styles.badgeMuted]}>
              {result.ok ? '通过' : '失败'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LiveSourceScanResultPanel({ onImport, results }) {
  const readyCount = results.filter((result) => result.ok).length;

  return (
    <View style={styles.siteTestPanel}>
      <Text style={styles.siteTestTitle}>
        直播源检测：{readyCount} 可导入 / {results.length} 已识别
      </Text>
      <View style={styles.listStack}>
        {results.map((result) => (
          <View
            key={result.url}
            style={[
              styles.batchResultRow,
              result.ok ? styles.batchResultPassed : styles.batchResultFailed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{formatLiveSourceKind(result.kind)}</Text>
              <Text numberOfLines={2} selectable style={styles.rowMeta}>
                {result.url}
              </Text>
              <Text selectable style={styles.siteTestMessage}>
                {result.message}
                {result.sampleName ? ` 样例：${result.sampleName}` : ''}
              </Text>
            </View>
            {result.ok ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onImport(result.url)}
                style={({ pressed }) => [
                  styles.inlineActionButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.inlineActionText}>导入</Text>
              </Pressable>
            ) : (
              <Text style={[styles.badge, styles.badgeMuted]}>
                {formatLiveSourceStatus(result.status)}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function ConfigSourceScanResultPanel({ onImport, results }) {
  const readyCount = results.filter((result) => result.ok).length;

  return (
    <View style={styles.siteTestPanel}>
      <Text style={styles.siteTestTitle}>
        配置检测：{readyCount} 可导入 / {results.length} 已识别
      </Text>
      <View style={styles.listStack}>
        {results.map((result) => (
          <View
            key={`${result.input}-${result.status}`}
            style={[
              styles.batchResultRow,
              result.ok ? styles.batchResultPassed : styles.batchResultFailed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{formatConfigSourceKind(result.kind)}</Text>
              <Text numberOfLines={2} selectable style={styles.rowMeta}>
                {result.url || result.input}
              </Text>
              <Text selectable style={styles.siteTestMessage}>
                {result.message}
                {result.ok
                  ? ` 可搜索 ${result.searchableCount}，插件/不兼容 ${result.pluginCount}`
                  : ''}
              </Text>
            </View>
            {result.ok ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onImport(result.url)}
                style={({ pressed }) => [
                  styles.inlineActionButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.inlineActionText}>导入</Text>
              </Pressable>
            ) : (
              <Text style={[styles.badge, styles.badgeMuted]}>
                {formatConfigSourceStatus(result.status)}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DiagnosticTile({ label, value }) {
  return (
    <View style={styles.diagnosticTile}>
      <Text style={styles.diagnosticValue}>{value}</Text>
      <Text style={styles.diagnosticLabel}>{label}</Text>
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
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{source.name}</Text>
            <Text numberOfLines={1} selectable style={styles.rowMeta}>
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

function formatHistoryType(type) {
  return LABELS[type] || '播放';
}

function formatLiveSourceKind(kind) {
  if (kind === 'm3u') {
    return 'M3U 直播列表';
  }

  if (kind === 'web') {
    return '网页入口';
  }

  if (kind === 'config') {
    return '配置接口';
  }

  if (kind === 'plugin') {
    return '插件源';
  }

  return '未知链接';
}

function formatLiveSourceStatus(status) {
  if (status === 'web-page') {
    return '网页';
  }

  if (status === 'config-source') {
    return '配置';
  }

  if (status === 'plugin-source') {
    return '插件';
  }

  if (status === 'network-error') {
    return '网络';
  }

  if (status === 'empty-playlist') {
    return '空列表';
  }

  return '不可用';
}

function formatConfigSourceKind(kind) {
  if (kind === 'config') {
    return 'TVBox/OK 配置';
  }

  if (kind === 'plugin') {
    return '插件源';
  }

  if (kind === 'invalid') {
    return '格式错误';
  }

  return '未知配置';
}

function formatConfigSourceStatus(status) {
  if (status === 'plugin-source') {
    return '插件';
  }

  if (status === 'invalid-url') {
    return '格式';
  }

  if (status === 'network-error') {
    return '网络';
  }

  if (status === 'invalid-config') {
    return '无效';
  }

  return '不可用';
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#f2f4f7',
    flex: 1,
  },
  keyboardRoot: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    padding: 16,
    paddingBottom: 116,
    paddingTop: 54,
  },
  header: {
    gap: 14,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  buildPill: {
    backgroundColor: '#e5f6f2',
    borderColor: '#b9e7dc',
    borderRadius: 16,
    borderWidth: 1,
    color: '#08735d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topTabs: {
    backgroundColor: '#e8ebef',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  topTab: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  topTabActive: {
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px rgba(17, 24, 39, 0.12)',
  },
  topTabText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  topTabTextActive: {
    color: '#111827',
  },
  titleBlock: {
    gap: 3,
  },
  title: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#667085',
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 20,
  },
  playerShell: {
    backgroundColor: '#000000',
    borderColor: '#d8dde5',
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
    backgroundColor: '#ffffff',
    borderColor: '#dde2ea',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  statusItem: {
    minWidth: 54,
  },
  statusLabel: {
    color: '#7b8491',
    fontSize: 12,
    letterSpacing: 0,
  },
  statusValue: {
    color: '#111827',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
  },
  statusDivider: {
    alignSelf: 'stretch',
    backgroundColor: '#e1e6ee',
    width: 1,
  },
  statusMessageGroup: {
    flex: 1,
    gap: 3,
  },
  tabContent: {
    gap: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    backgroundColor: '#ffffff',
    borderColor: '#dde2ea',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 70,
    padding: 12,
  },
  statValue: {
    color: '#0f766e',
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
  },
  statLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    backgroundColor: '#ffffff',
    borderColor: '#dde2ea',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 72,
    padding: 12,
    width: '48.5%',
  },
  quickValue: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  quickLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#dde2ea',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  settingsGroup: {
    backgroundColor: '#ffffff',
    borderColor: '#dde2ea',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  panelHeader: {
    gap: 3,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionHint: {
    color: '#7b8491',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  inputGroup: {
    gap: 9,
  },
  inputLabel: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    letterSpacing: 0,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  multilineInput: {
    minHeight: 128,
  },
  helperText: {
    color: '#667085',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  filterPanel: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d7dde6',
    borderRadius: 22,
    borderWidth: 1,
    color: '#111827',
    fontSize: 15,
    letterSpacing: 0,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  filterScroller: {
    marginHorizontal: -2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  filterChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    minHeight: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#1d4ed8',
  },
  filterChipText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  emptyText: {
    color: '#667085',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  fullWidthButton: {
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  secondaryButton: {
    backgroundColor: '#c2410c',
    borderColor: '#c2410c',
  },
  accentButton: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  compactButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  plainButtonText: {
    color: '#111827',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  listStack: {
    gap: 9,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  listRowActive: {
    borderColor: '#0f766e',
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 12,
  },
  resultRowActive: {
    borderColor: '#1d4ed8',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  rowMeta: {
    color: '#667085',
    fontSize: 12,
    letterSpacing: 0,
  },
  rowAction: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  warningText: {
    color: '#b45309',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  badge: {
    backgroundColor: '#e5f6f2',
    borderRadius: 8,
    color: '#08735d',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 58,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: 'center',
  },
  badgeMuted: {
    backgroundColor: '#fff4e5',
    color: '#b45309',
  },
  selectedSitePanel: {
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 10,
  },
  selectedSiteText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  playGroupList: {
    gap: 12,
  },
  playGroup: {
    gap: 8,
  },
  playGroupTitle: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  episodeButton: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 78,
    paddingHorizontal: 10,
  },
  episodeButtonText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 120,
  },
  summaryList: {
    gap: 10,
  },
  summaryRow: {
    borderBottomColor: '#eef2f7',
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
  summaryLabel: {
    color: '#7b8491',
    fontSize: 12,
    letterSpacing: 0,
  },
  summaryValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 19,
  },
  currentUrl: {
    color: '#475467',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  diagnosticsPanel: {
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  diagnosticsSummary: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 18,
  },
  diagnosticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diagnosticTile: {
    backgroundColor: '#ffffff',
    borderColor: '#e1e6ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '48%',
  },
  diagnosticValue: {
    color: '#1d4ed8',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
  },
  diagnosticLabel: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  siteTestPanel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  siteTestPanelPassed: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  siteTestPanelFailed: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  siteTestTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  siteTestMessage: {
    color: '#475467',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  siteTestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchResultRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  batchResultPassed: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  batchResultFailed: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  inlineActionButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 54,
    paddingHorizontal: 10,
  },
  inlineActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sourceList: {
    gap: 8,
  },
  sourceRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d7dde6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  privacyText: {
    color: '#475467',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 20,
  },
  bottomTabs: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7dde6',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 18,
    boxShadow: '0 8px 24px rgba(17, 24, 39, 0.14)',
    flexDirection: 'row',
    gap: 4,
    left: 16,
    padding: 6,
    position: 'absolute',
    right: 16,
  },
  bottomTab: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  bottomTabActive: {
    backgroundColor: '#111827',
  },
  bottomTabText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  bottomTabTextActive: {
    color: '#ffffff',
  },
});
