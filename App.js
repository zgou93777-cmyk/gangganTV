import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEvent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar as NativeStatusBar,
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
  DISCOVER_FEED_TABS,
  DISCOVER_MODES,
  DISCOVER_REGION_FILTERS,
  DISCOVER_SORT_FILTERS,
  buildDiscoverPosterFeed,
  buildLiveChannelGroups,
  buildPosterDetailModel,
  buildVodResultCards,
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
const {
  diagnosePluginSite,
} = require('./src/plugin-diagnostics');
const {
  verifyPluginTarget,
} = require('./src/plugin-adapter');
const {
  buildCatVodExecutorHtml,
  normalizeCatVodDetailResult,
  normalizeCatVodPlayResult,
  normalizeCatVodSearchResult,
} = require('./src/catvod-adapter');
const {
  CatVodRuntimeController,
} = require('./src/catvod-runtime');
const {
  fetchPluginServerHealth,
  fetchPluginServerDetail,
  fetchPluginServerPlay,
  fetchPluginServerSearch,
} = require('./src/plugin-server-client');
const {
  fetchTvBoxServerDetail,
  fetchTvBoxServerPlay,
  fetchTvBoxServerSearch,
} = require('./src/tvbox-server-client');
const {
  buildSearchBuckets,
  filterResultsByBucket,
} = require('./src/search-buckets');

const BUILT_IN_TEST_CONFIG_URL = 'mock://demo-tvbox';
const BUILT_IN_TEST_LIVE_PLAYLIST_URL = 'mock://demo-live-m3u';
const TOP_SAFE_PADDING = Platform.select({
  ios: 54,
  android: (NativeStatusBar.currentHeight || 0) + 18,
  default: 36,
});

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
  pluginServerUrl: 'iptv.prototype.pluginServerUrl',
  pluginServerToken: 'iptv.prototype.pluginServerToken',
};

const LABELS = {
  live: '直播',
  vod: '点播',
  config: '配置',
};

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB_ID);
  const [activePage, setActivePage] = useState('discover');
  const [activeDiscoverMode, setActiveDiscoverMode] = useState('all');
  const [activeFeedTab, setActiveFeedTab] = useState('hot');
  const [activeSortFilter, setActiveSortFilter] = useState('heat');
  const [activeRegionFilter, setActiveRegionFilter] = useState('all');
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [overlayKeyword, setOverlayKeyword] = useState('');
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [selectedSearchSourceIds, setSelectedSearchSourceIds] = useState([]);
  const [liveUrl, setLiveUrl] = useState('');
  const [livePlaylistUrl, setLivePlaylistUrl] = useState('');
  const [liveChannels, setLiveChannels] = useState([]);
  const [liveChannelKeyword, setLiveChannelKeyword] = useState('');
  const [selectedLiveGroup, setSelectedLiveGroup] = useState('all');
  const [liveSourceText, setLiveSourceText] = useState('');
  const [liveSourceScanResults, setLiveSourceScanResults] = useState([]);
  const [vodUrl, setVodUrl] = useState('');
  const [configUrl, setConfigUrl] = useState('');
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [configSourceText, setConfigSourceText] = useState('');
  const [pluginServerUrl, setPluginServerUrl] = useState('');
  const [pluginServerToken, setPluginServerToken] = useState('');
  const [configSourceScanResults, setConfigSourceScanResults] = useState([]);
  const [configSources, setConfigSources] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchFailures, setSearchFailures] = useState([]);
  const [activeSearchBucketId, setActiveSearchBucketId] = useState('all');
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
  const [verifyingPlugin, setVerifyingPlugin] = useState(false);
  const [pluginVerifyResult, setPluginVerifyResult] = useState(null);
  const [checkingPluginServer, setCheckingPluginServer] = useState(false);
  const [pluginServerHealth, setPluginServerHealth] = useState(null);
  const [catVodExecutorHtml, setCatVodExecutorHtml] = useState('');
  const [catVodSource, setCatVodSource] = useState(null);
  const [catVodReady, setCatVodReady] = useState(false);
  const catVodWebViewRef = useRef(null);
  const catVodRuntimeRef = useRef(null);

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
  const discoverPosterFeed = useMemo(() => buildDiscoverPosterFeed(), []);
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
  const searchBuckets = useMemo(
    () =>
      buildSearchBuckets({
        sites,
        results: searchResults,
        failures: searchFailures,
      }),
    [searchFailures, searchResults, sites]
  );
  const visibleSearchResults = useMemo(
    () => filterResultsByBucket(searchResults, activeSearchBucketId),
    [activeSearchBucketId, searchResults]
  );
  const vodResultCards = useMemo(
    () => buildVodResultCards(visibleSearchResults),
    [visibleSearchResults]
  );
  const selectedPosterDetail = useMemo(
    () => buildPosterDetailModel(selectedResult, selectedDetail),
    [selectedDetail, selectedResult]
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
      storedPluginServerUrl,
      storedPluginServerToken,
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
      AsyncStorage.getItem(STORAGE_KEYS.pluginServerUrl),
      AsyncStorage.getItem(STORAGE_KEYS.pluginServerToken),
    ]);

    const nextSources = parseStoredArray(storedSources);
    const nextSites = normalizeStoredSites(parseStoredArray(storedSites));
    const nextLiveChannels = parseStoredArray(storedLiveChannels);
    const nextPlayHistory = normalizePlayHistory(parseStoredArray(storedPlayHistory));

    setLiveUrl(storedLiveUrl || '');
    setLivePlaylistUrl(storedLivePlaylistUrl || '');
    setLiveChannels(nextLiveChannels);
    setVodUrl(storedVodUrl || '');
    setPluginServerUrl(storedPluginServerUrl || '');
    setPluginServerToken(storedPluginServerToken || '');
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
        loadPluginServerSite(pluginSource, cleanUrl);
        setMessage(
          pluginServerUrl.trim()
            ? '已导入 CatVod 插件源，将使用插件解析服务搜索'
            : '已导入 CatVod 插件源，请先填写插件解析服务地址和 Token'
        );
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
        scriptUrl: site.runtime === 'catvod-server' ? source.url : site.scriptUrl,
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

  async function verifySelectedPlugin() {
    if (!selectedSite) {
      setMessage('请先选择一个插件站点');
      setPluginVerifyResult(null);
      return;
    }

    setVerifyingPlugin(true);
    setPluginVerifyResult(null);
    setActiveType('config');
    setMessage(`正在验证插件站点：${selectedSite.name}`);

    try {
      const result = await verifyPluginTarget({
        kind: 'site',
        site: selectedSite,
      });

      setPluginVerifyResult(result);
      setMessage(result.message);
    } catch (verifyError) {
      setMessage(verifyError?.message || '插件站点验证失败');
    } finally {
      setVerifyingPlugin(false);
    }
  }

  async function verifyPluginSource(source) {
    if (!source?.url) {
      setMessage('插件源缺少地址');
      return;
    }

    setVerifyingPlugin(true);
    setPluginVerifyResult(null);
    setActiveType('config');
    setMessage(`正在验证插件源：${source.name || source.url}`);

    try {
      const result = await verifyPluginTarget({
        kind: 'source',
        url: source.url,
      });

      setPluginVerifyResult(result);
      if (result.scriptUrl && pluginServerUrl.trim()) {
        loadPluginServerSite(source, result.scriptUrl);
      } else if (
        result.scriptText &&
        (result.sandboxPreflight?.ok ||
          result.sandboxPreflight?.compatibility?.runnable)
      ) {
        loadCatVodExecutor(source, result.scriptText);
      } else if (
        result.scriptUrl &&
        result.sandboxPreflight?.compatibility?.status === 'server-runtime-required'
      ) {
        loadPluginServerSite(source, result.scriptUrl);
      }
      setMessage(result.message);
    } catch (verifyError) {
      setMessage(verifyError?.message || '插件源验证失败');
    } finally {
      setVerifyingPlugin(false);
    }
  }

  function loadCatVodExecutor(source, scriptText) {
    catVodRuntimeRef.current = new CatVodRuntimeController({
      fetchText: fetchCatVodText,
      injectJavaScript: (script) => catVodWebViewRef.current?.injectJavaScript(script),
    });
    const runtimeSite = {
      id: 'catvod-runtime',
      siteKey: 'catvod-runtime',
      name: `${source.name || 'CatVod'} 插件`,
      type: 3,
      api: source.url,
      searchable: true,
      unsupportedReason: '',
      sourceId: source.id,
      sourceName: source.name || '插件源',
      runtime: 'catvod-webview',
    };
    const nextSites = upsertById(sites, runtimeSite);

    setCatVodSource(source);
    setCatVodReady(false);
    setCatVodExecutorHtml(buildCatVodExecutorHtml(scriptText));
    setSites(nextSites);
    setSelectedSiteId(runtimeSite.id);
    setActiveTab('discover');
    setMessage('正在加载插件执行器');
  }

  function loadPluginServerSite(source, scriptUrl) {
    const serverSite = {
      id: 'catvod-server-runtime',
      siteKey: 'catvod-server-runtime',
      name: `${source.name || 'CatVod'} 服务端插件`,
      type: 3,
      api: scriptUrl,
      searchable: true,
      unsupportedReason: '',
      sourceId: source.id,
      sourceName: source.name || '插件源',
      runtime: 'catvod-server',
      scriptUrl,
    };

    setCatVodSource({
      ...source,
      scriptUrl,
    });
    setSites(upsertById(sites, serverSite));
    setSelectedSiteId(serverSite.id);
    setActiveTab('discover');
    setMessage(
      pluginServerUrl
        ? '已准备使用插件解析服务'
        : '该插件需要服务端解析，请先填写插件解析服务地址'
    );
  }

  async function savePluginServerUrl() {
    const cleanUrl = pluginServerUrl.trim();
    const cleanToken = pluginServerToken.trim();

    if (!cleanUrl) {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.pluginServerUrl),
        cleanToken
          ? AsyncStorage.setItem(STORAGE_KEYS.pluginServerToken, cleanToken)
          : AsyncStorage.removeItem(STORAGE_KEYS.pluginServerToken),
      ]);
      setPluginServerUrl('');
      setPluginServerToken(cleanToken);
      setPluginServerHealth(null);
      setMessage('已清空插件解析服务地址');
      return;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      setMessage('插件解析服务地址需要以 http:// 或 https:// 开头');
      return;
    }

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.pluginServerUrl, cleanUrl),
      cleanToken
        ? AsyncStorage.setItem(STORAGE_KEYS.pluginServerToken, cleanToken)
        : AsyncStorage.removeItem(STORAGE_KEYS.pluginServerToken),
    ]);
    setPluginServerUrl(cleanUrl);
    setPluginServerToken(cleanToken);
    setPluginServerHealth(null);
    setMessage('已保存插件解析服务地址');
  }

  async function checkPluginServer() {
    setCheckingPluginServer(true);
    setPluginServerHealth(null);
    setActiveType('config');
    setMessage('正在检测插件解析服务');

    try {
      const health = await fetchPluginServerHealth({
        baseUrl: pluginServerUrl.trim(),
        token: pluginServerToken.trim(),
      });
      const ok = Boolean(health?.ok);

      setPluginServerHealth({
        ok,
        message: ok ? `服务正常：${health.service || 'plugin-parser'}` : '服务返回异常状态',
      });
      setMessage(ok ? '插件解析服务连接正常' : '插件解析服务返回异常状态');
    } catch (healthError) {
      const errorMessage = healthError?.message || '插件解析服务检测失败';
      setPluginServerHealth({
        ok: false,
        message: errorMessage,
      });
      setMessage(errorMessage);
    } finally {
      setCheckingPluginServer(false);
    }
  }

  async function fetchCatVodText(url, options = {}) {
    const response = await fetch(url, {
      headers: options.headers || {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'okhttp/4.10.0',
      },
      method: options.method || 'GET',
    });

    if (!response.ok) {
      throw new Error(`请求失败：HTTP ${response.status}`);
    }

    return response.text();
  }

  async function handleCatVodMessage(event) {
    const payload = await catVodRuntimeRef.current?.handleMessage(event.nativeEvent.data);

    if (payload?.type === 'ready') {
      setCatVodReady(true);
      setMessage(`插件执行器已准备：${catVodSource?.name || 'CatVod'}`);
    }
  }

  async function searchSelectedSite(keywordOverride) {
    const cleanKeyword =
      typeof keywordOverride === 'string'
        ? keywordOverride.trim()
        : searchKeyword.trim();
    setSourceMenuOpen(false);

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
    setSearchFailures([]);
    setActiveSearchBucketId('all');

    try {
      const results = isTvBoxSpiderSite(selectedSite)
        ? await fetchTvBoxServerSearch(
            buildTvBoxServerConfig(selectedSite),
            cleanKeyword
          )
        : isPluginServerSite(selectedSite)
        ? await fetchPluginServerSearch(
            buildPluginServerConfig(selectedSite),
            cleanKeyword
          )
        : isCatVodRuntimeActive(selectedSite)
        ? normalizeCatVodSearchResult(
            await catVodRuntimeRef.current.call('search', [cleanKeyword, false, 1])
          )
        : await fetchTvBoxSearch(selectedSite, cleanKeyword);

      setSearchResults(results);
      setSelectedResult(null);
      setSelectedDetail(null);
      setMessage(results.length ? `找到 ${results.length} 个结果` : '没有搜索结果');
    } catch (searchError) {
      setSearchResults([]);
      setSearchFailures([
        {
          sourceId: selectedSite.id,
          sourceName: selectedSite.name,
          message: searchError?.message || '搜索失败',
        },
      ]);
      setSelectedResult(null);
      setSelectedDetail(null);
      setMessage(searchError?.message || '搜索失败');
    } finally {
      setLoadingSearch(false);
    }
  }

  async function submitOverlaySearch() {
    const cleanKeyword = overlayKeyword.trim();

    if (!cleanKeyword) {
      setMessage('请输入搜索关键词');
      return;
    }

    setSearchOverlayOpen(false);
    setSearchKeyword(cleanKeyword);
    setActivePage('searchResults');
    setActiveTab('discover');
    await searchWithKeyword(cleanKeyword);
  }

  async function searchWithKeyword(keyword) {
    setSearchKeyword(keyword);
    await searchSelectedSite(keyword);
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
      const detail = isTvBoxSpiderSite(selectedSite)
        ? await fetchTvBoxServerDetail(
            buildTvBoxServerConfig(selectedSite),
            result.id
          )
        : isPluginServerSite(selectedSite)
        ? await fetchPluginServerDetail(
            buildPluginServerConfig(selectedSite),
            result.id
          )
        : isCatVodRuntimeActive(selectedSite)
        ? normalizeCatVodDetailResult(
            await catVodRuntimeRef.current.call('detail', [result.id])
          )
        : await fetchTvBoxDetail(selectedSite, result.id);

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
      const playableUrl = isTvBoxSpiderSite(selectedSite)
        ? await fetchTvBoxServerPlay(buildTvBoxServerConfig(selectedSite), {
            flag: group.name,
            id: episode.url,
          })
        : isPluginServerSite(selectedSite)
        ? await fetchPluginServerPlay(buildPluginServerConfig(selectedSite), {
            flag: group.name,
            id: episode.url,
          })
        : isCatVodRuntimeActive(selectedSite)
        ? normalizeCatVodPlayResult(
            await catVodRuntimeRef.current.call('play', [
              group.name,
              episode.url,
              [],
            ])
          ) || episode.url
        : await resolveTvBoxEpisode(selectedSite, episode);
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

  function isCatVodRuntimeActive(site) {
    return Boolean(catVodReady && catVodRuntimeRef.current && site?.id === 'catvod-runtime');
  }

  function isPluginServerSite(site) {
    return site?.runtime === 'catvod-server';
  }

  function isTvBoxSpiderSite(site) {
    return site?.runtime === 'tvbox-jar-spider';
  }

  function buildTvBoxServerConfig(site) {
    if (!pluginServerUrl.trim()) {
      throw new Error('请先在设置里填写解析服务地址');
    }

    return {
      baseUrl: pluginServerUrl.trim(),
      token: pluginServerToken.trim(),
      configUrl: site?.sourceId || site?.configUrl,
      siteKey: site?.siteKey || site?.id,
    };
  }

  function buildPluginServerConfig(site) {
    if (!pluginServerUrl.trim()) {
      throw new Error('请先在设置里填写插件解析服务地址');
    }

    if (!pluginServerToken.trim()) {
      throw new Error('请先在设置里填写插件解析服务 Token');
    }

    return {
      baseUrl: pluginServerUrl.trim(),
      token: pluginServerToken.trim(),
      scriptUrl: firstValidHttpUrl([site?.scriptUrl, site?.sourceId, site?.api]),
    };
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
          <SiteRow
            isActive={selectedSiteId === site.id}
            key={site.id}
            onPress={() => selectSite(site)}
            site={site}
          />
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

        {sites.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.siteRailScroller}
          >
            <View style={styles.siteRail}>
              {sites.slice(0, 24).map((site) => {
                const isActive = selectedSiteId === site.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={site.id}
                    onPress={() => selectSite(site)}
                    style={({ pressed }) => [
                      styles.siteChip,
                      isActive && styles.siteChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.siteChipText,
                        isActive && styles.siteChipTextActive,
                      ]}
                    >
                      {site.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : null}

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

        {searchResults.length || searchFailures.length ? (
          <View style={styles.searchSplit}>
            {renderSearchSourceRail()}
            <View style={styles.searchResultPane}>{renderVodResultGrid(vodResultCards)}</View>
          </View>
        ) : null}

        {selectedDetail?.playGroups?.length ? (
          <View style={styles.playGroupList}>
            <View style={styles.selectedDetailPanel}>
              <Text style={styles.selectedSiteText}>{selectedDetail.name}</Text>
              {selectedDetail.remarks ? (
                <Text style={styles.rowMeta}>{selectedDetail.remarks}</Text>
              ) : null}
            </View>
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

  function renderSearchSourceRail() {
    if (!searchBuckets.length) {
      return null;
    }

    return (
      <ScrollView
        contentContainerStyle={styles.searchRailContent}
        showsVerticalScrollIndicator={false}
        style={styles.searchRail}
      >
        {searchBuckets.map((bucket) => {
          const isActive = activeSearchBucketId === bucket.id;

          return (
            <Pressable
              accessibilityRole="button"
              key={bucket.id}
              onPress={() => setActiveSearchBucketId(bucket.id)}
              style={({ pressed }) => [
                styles.searchRailItem,
                isActive && styles.searchRailItemActive,
                bucket.status === 'failed' && styles.searchRailItemFailed,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.searchRailLabel,
                  isActive && styles.searchRailLabelActive,
                ]}
              >
                {bucket.label}
              </Text>
              <Text
                style={[
                  styles.searchRailCount,
                  isActive && styles.searchRailCountActive,
                ]}
              >
                {bucket.id === 'all' ? `${bucket.count}/${bucket.total}` : bucket.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  function renderVodResultGrid(cards) {
    if (!cards.length) {
      return <Text style={styles.emptyText}>当前源没有匹配结果</Text>;
    }

    return (
      <View style={styles.vodGrid}>
        {cards.map((card) => (
          <Pressable
            accessibilityRole="button"
            key={card.id}
            onPress={() => loadDetail(card.raw)}
            style={({ pressed }) => [
              styles.vodCard,
              selectedResult?.id === card.raw.id && styles.vodCardActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.posterFrame}>
              {card.poster ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: card.poster }}
                  style={styles.posterImage}
                />
              ) : (
                <View style={styles.posterPlaceholder}>
                  <Text style={styles.posterPlaceholderText}>
                    {card.title.slice(0, 1)}
                  </Text>
                </View>
              )}
              {card.badge ? (
                <Text numberOfLines={1} style={styles.posterBadge}>
                  {card.badge}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={2} style={styles.vodCardTitle}>
              {loadingDetailId === card.raw.id ? '读取中...' : card.title}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  function renderSourceSelector() {
    const label = selectedSite?.name || '导入配置';
    const menuVisible = sourceMenuOpen && activeTab === 'discover';

    return (
      <View style={styles.sourceSelectorWrap}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (activeTab !== 'discover') {
              setActiveTab('discover');
              return;
            }

            setSourceMenuOpen((value) => !value);
          }}
          style={({ pressed }) => [
            styles.sourcePill,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.sourceIcon}>{menuVisible ? '⌃' : '⌄'}</Text>
          <Text numberOfLines={1} style={styles.brandText}>
            {label}
          </Text>
          <Text numberOfLines={1} style={styles.sourceMeta}>
            {sites.length ? `${sites.length} 个源` : '本机源'}
          </Text>
        </Pressable>
        {menuVisible ? (
          <View style={styles.sourceMenu}>
            <ScrollView showsVerticalScrollIndicator style={styles.sourceMenuScroll}>
              {sites.length ? (
                sites.map((site) => (
                  <Pressable
                    accessibilityRole="button"
                    key={site.id}
                    onPress={() => {
                      selectSite(site);
                      setSourceMenuOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.sourceMenuItem,
                      selectedSiteId === site.id && styles.sourceMenuItemActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.sourceMenuCheck}>
                      {selectedSiteId === site.id ? '✓' : ''}
                    </Text>
                    <Text numberOfLines={1} style={styles.sourceMenuText}>
                      {site.name}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSourceMenuOpen(false);
                    setActiveTab('settings');
                  }}
                  style={({ pressed }) => [
                    styles.sourceMenuItem,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.sourceMenuCheck}>＋</Text>
                  <Text numberOfLines={1} style={styles.sourceMenuText}>
                    去设置导入配置
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  function renderDiscoverModeRail() {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.discoverModeScroller}
      >
        <View style={styles.discoverModeRow}>
          {DISCOVER_MODES.map((mode) => {
            const isActive = activeDiscoverMode === mode.id;

            return (
              <Pressable
                accessibilityRole="button"
                key={mode.id}
                onPress={() => {
                  setSourceMenuOpen(false);
                  setActiveDiscoverMode(mode.id);
                }}
                style={({ pressed }) => [
                  styles.discoverModeButton,
                  isActive && styles.discoverModeButtonActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.discoverModeText,
                    isActive && styles.discoverModeTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  function renderDiscoverFeedRail() {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.discoverModeScroller}
      >
        <View style={styles.discoverModeRow}>
          {DISCOVER_FEED_TABS.map((tab) => {
            const isActive = activeFeedTab === tab.id;

            return (
              <Pressable
                accessibilityRole="button"
                key={tab.id}
                onPress={() => setActiveFeedTab(tab.id)}
                style={({ pressed }) => [
                  styles.discoverModeButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.discoverModeText,
                    isActive && styles.discoverModeTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  function renderDiscoverFilters() {
    return (
      <View style={styles.discoverFilterStack}>
        <View style={styles.discoverFilterRow}>
          {DISCOVER_SORT_FILTERS.map((filter) => {
            const isActive = activeSortFilter === filter.id;

            return (
              <Pressable
                accessibilityRole="button"
                key={filter.id}
                onPress={() => {
                  if (!filter.muted) {
                    setActiveSortFilter(filter.id);
                  }
                }}
                style={({ pressed }) => [
                  filter.muted ? styles.filterLabelPill : styles.homeFilterChip,
                  isActive && !filter.muted && styles.homeFilterChipActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    filter.muted ? styles.filterLabelText : styles.homeFilterChipText,
                    isActive && !filter.muted && styles.homeFilterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.discoverFilterRow}>
          <View style={styles.filterLabelPill}>
            <Text style={styles.filterLabelText}>地区</Text>
          </View>
          {DISCOVER_REGION_FILTERS.map((filter) => {
            const isActive = activeRegionFilter === filter.id;

            return (
              <Pressable
                accessibilityRole="button"
                key={filter.id}
                onPress={() => setActiveRegionFilter(filter.id)}
                style={({ pressed }) => [
                  styles.homeFilterChip,
                  isActive && styles.homeFilterChipActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.homeFilterChipText,
                    isActive && styles.homeFilterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function renderDiscoverPosterGrid() {
    return (
      <View style={styles.discoverPosterGrid}>
        {discoverPosterFeed.map((poster) => (
          <Pressable
            accessibilityRole="button"
            key={poster.id}
            onPress={() => {
              setSelectedResult({
                id: poster.id,
                name: poster.title,
                poster: poster.poster,
                remarks: poster.subtitle,
                sourceName: selectedSite?.name || '豆瓣热播',
                year: '2026',
                type: poster.subtitle,
                duration: poster.rating ? `评分 ${poster.rating}` : '',
                description:
                  '热门内容流仅用于首页展示。搜索结果进入详情后会读取对应来源的播放线路和剧集。',
              });
              setSelectedDetail(null);
              setActivePage('detail');
            }}
            style={({ pressed }) => [
              styles.discoverPosterCard,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.discoverPosterFrame}>
              <Image
                resizeMode="cover"
                source={{ uri: poster.poster }}
                style={styles.posterImage}
              />
              {poster.rating ? (
                <Text numberOfLines={1} style={styles.discoverRatingBadge}>
                  评分：{poster.rating}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.discoverPosterTitle}>
              {poster.title}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  function renderDirectPanel() {
    return (
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
    );
  }

  function renderLivePanel() {
    return (
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
    );
  }

  function renderDiscover() {
    return (
      <View style={styles.discoverFeed}>
        {renderDiscoverFeedRail()}
        {renderDiscoverFilters()}
        {renderDiscoverPosterGrid()}
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
            <SummaryRow
              label="直播地址"
              value={liveUrl || '未保存'}
              selectable
              compact
            />
            <SummaryRow
              label="点播地址"
              value={vodUrl || '未保存'}
              selectable
              compact
            />
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
        <View style={styles.settingsHero}>
          <View style={styles.settingsHeroTop}>
            <Text style={styles.settingsHeroIcon}>♕</Text>
            <Text style={styles.settingsHeroTitle}>私人 IPTV Pro</Text>
            <Text style={styles.settingsHeroState}>本机保存</Text>
          </View>
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>源地址</Text>
        </View>
        <View style={styles.settingsGroup}>
          <View style={styles.sourceAddressRow}>
            <View style={styles.rowMain}>
              <Text style={styles.sourceAddressName}>
                {selectedSite ? selectedSite.name : '未选择点播源'}
              </Text>
              <Text numberOfLines={2} selectable style={styles.sourceAddressUrl}>
                {configUrl || livePlaylistUrl || '导入配置或直播列表后会显示在这里'}
              </Text>
            </View>
            <Text style={styles.rowAction}>更改</Text>
          </View>
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>直播</Text>
        </View>
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

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>点播</Text>
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
            测试源只包含公开样片。插件源会先做沙盒预检；简单 JS 可本地隔离执行，Node/CSP 插件需要插件解析服务。
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setPluginServerUrl}
            placeholder="插件解析服务，例如 https://parser.example.com"
            placeholderTextColor="#8d96a0"
            style={styles.input}
            value={pluginServerUrl}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPluginServerToken}
            placeholder="插件解析服务 Token，可选"
            placeholderTextColor="#8d96a0"
            secureTextEntry
            style={styles.input}
            value={pluginServerToken}
          />
          <CompactButton
            onPress={() =>
              savePluginServerUrl().catch(() => setMessage('插件解析服务保存失败'))
            }
            variant="secondary"
          >
            保存插件解析服务
          </CompactButton>
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={checkingPluginServer}
              onPress={() =>
                checkPluginServer().catch(() => setMessage('插件解析服务检测失败'))
              }
              variant="plain"
            >
              {checkingPluginServer ? '检测中' : '检测解析服务'}
            </CompactButton>
          </View>
          {pluginServerHealth ? (
            <Text
              style={[
                styles.helperText,
                pluginServerHealth.ok ? styles.successText : styles.warningText,
              ]}
            >
              {pluginServerHealth.message}
            </Text>
          ) : null}
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
          <SourceList
            onVerifyPlugin={verifyPluginSource}
            sources={configSources}
            verifyingPlugin={verifyingPlugin}
          />
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>站点</Text>
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
            disabled={!selectedSite || verifyingPlugin}
            onPress={() =>
              verifySelectedPlugin().catch(() => setMessage('插件验证失败'))
            }
            variant="secondary"
          >
            {verifyingPlugin ? '验证中' : '验证插件适配'}
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
          {pluginVerifyResult ? (
            <PluginVerifyResultPanel result={pluginVerifyResult} />
          ) : null}
          {renderSiteList()}
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>数据</Text>
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

  function renderSearchOverlay() {
    if (!searchOverlayOpen) {
      return null;
    }

    return (
      <View style={styles.overlayBackdrop}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSearchOverlayOpen(false)}
          style={styles.overlayScrim}
        />
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.searchOverlayCenter}
        >
          <View style={styles.searchOverlayCard}>
            <View style={styles.overlayHandle} />
            <Text style={styles.searchOverlayTitle}>搜索全部来源</Text>
            <TextInput
              autoFocus
              autoCorrect={false}
              onChangeText={setOverlayKeyword}
              onSubmitEditing={() =>
                submitOverlaySearch().catch(() => setMessage('搜索失败'))
              }
              placeholder="输入片名、演员或关键词"
              placeholderTextColor="#8d96a0"
              returnKeyType="search"
              style={styles.searchOverlayInput}
              value={overlayKeyword}
            />
            <View style={styles.buttonRow}>
              <CompactButton
                onPress={() => setSearchOverlayOpen(false)}
                variant="plain"
              >
                取消
              </CompactButton>
              <CompactButton
                disabled={loadingSearch}
                onPress={() =>
                  submitOverlaySearch().catch(() => setMessage('搜索失败'))
                }
                variant="accent"
              >
                {loadingSearch ? '搜索中' : '搜索'}
              </CompactButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  function renderSearchResultsPage() {
    return (
      <View style={styles.searchPage}>
        <View style={styles.searchPageTopBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setActivePage('discover');
              setSourceFilterOpen(false);
            }}
            style={({ pressed }) => [
              styles.searchBackButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.searchBackText}>‹</Text>
          </Pressable>
          <TextInput
            autoCorrect={false}
            onChangeText={setSearchKeyword}
            onSubmitEditing={() =>
              searchSelectedSite().catch(() => setMessage('搜索失败'))
            }
            placeholder="搜索影片"
            placeholderTextColor="#8d96a0"
            returnKeyType="search"
            style={styles.searchPageInput}
            value={searchKeyword}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setSourceFilterOpen(true)}
            style={({ pressed }) => [
              styles.searchSourceButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.searchSourceButtonText}>☰</Text>
          </Pressable>
        </View>

        <View style={styles.searchPageBody}>
          <View style={styles.searchPageRail}>
            {renderSearchSourceRail()}
          </View>
          <ScrollView
            contentContainerStyle={styles.searchPageResults}
            showsVerticalScrollIndicator={false}
          >
            {loadingSearch ? (
              <Text style={styles.emptyText}>正在搜索...</Text>
            ) : searchResults.length || searchFailures.length ? (
              renderVodResultGrid(vodResultCards)
            ) : (
              <View style={styles.searchEmptyState}>
                <Text style={styles.sectionTitle}>输入关键词开始搜索</Text>
                <Text style={styles.sectionHint}>
                  默认搜索当前站点，后续会扩展为真正的全部源并发搜索。
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderSourceFilterSheet() {
    if (!sourceFilterOpen) {
      return null;
    }

    const activeIds = selectedSearchSourceIds.length
      ? selectedSearchSourceIds
      : sites.map((site) => site.id);

    return (
      <View style={styles.overlayBackdrop}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSourceFilterOpen(false)}
          style={styles.overlayScrim}
        />
        <View style={styles.sourceFilterSheet}>
          <View style={styles.overlayHandle} />
          <Text style={styles.searchOverlayTitle}>选择配置源</Text>
          <Text style={styles.sectionHint}>
            当前版本先保存选择状态，搜索仍优先使用当前站点；多源并发搜索下一版接上。
          </Text>
          <ScrollView
            contentContainerStyle={styles.sourceFilterList}
            showsVerticalScrollIndicator={false}
          >
            {sites.length ? (
              sites.map((site) => {
                const isSelected = activeIds.includes(site.id);

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={site.id}
                    onPress={() => {
                      setSelectedSearchSourceIds((currentIds) => {
                        const baseIds = currentIds.length
                          ? currentIds
                          : sites.map((item) => item.id);

                        if (baseIds.includes(site.id)) {
                          return baseIds.filter((id) => id !== site.id);
                        }

                        return [...baseIds, site.id];
                      });
                    }}
                    style={({ pressed }) => [
                      styles.sourceFilterItem,
                      isSelected && styles.sourceFilterItemActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.sourceFilterCheck}>
                      {isSelected ? '✓' : ''}
                    </Text>
                    <Text numberOfLines={1} style={styles.sourceFilterName}>
                      {site.name}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyText}>还没有导入配置源</Text>
            )}
          </ScrollView>
          <CompactButton
            onPress={() => setSourceFilterOpen(false)}
            variant="accent"
          >
            完成
          </CompactButton>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        activeTab === 'settings' && styles.settingsRoot,
        activePage === 'searchResults' && styles.searchPageRoot,
      ]}
    >
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardRoot}
      >
        <View style={styles.appShell}>
          {activePage === 'searchResults' ? (
            renderSearchResultsPage()
          ) : (
            <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.topChrome}>
                {renderSourceSelector()}
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSourceMenuOpen(false);
                      setActiveTab('settings');
                    }}
                    style={({ pressed }) => [
                      styles.circleButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.circleButtonText}>⌁</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSourceMenuOpen(false);
                      setOverlayKeyword(searchKeyword);
                      setSearchOverlayOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.circleButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.circleButtonText}>⌕</Text>
                  </Pressable>
                </View>
              </View>
              {activeTab === 'settings' || activeTab === 'watching' ? (
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>{activeTabMeta.label}</Text>
                  <Text style={styles.subtitle}>{activeTabMeta.description}</Text>
                </View>
              ) : null}
            </View>

            {activeTab !== 'discover' && currentUrl ? (
              <>
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
              </>
            ) : activeTab !== 'discover' ? (
              <View style={styles.idleStatusPanel}>
                <View style={styles.idleStatusIconWrap}>
                  <Text style={styles.idleStatusIcon}>▶</Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.idleStatusTitle}>等待播放</Text>
                  <Text selectable style={styles.idleStatusText}>
                    {message}
                  </Text>
                </View>
              </View>
            ) : null}

            {renderActiveTab()}
          </ScrollView>
          <BottomTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={APP_TABS}
          />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      {catVodExecutorHtml ? (
        <WebView
          javaScriptEnabled
          onMessage={(event) => {
            handleCatVodMessage(event).catch((bridgeError) =>
              setMessage(bridgeError?.message || '插件执行器通信失败')
            );
          }}
          originWhitelist={['*']}
          ref={catVodWebViewRef}
          source={{ html: catVodExecutorHtml }}
          style={styles.hiddenWebView}
        />
      ) : null}
      {renderSearchOverlay()}
      {renderSourceFilterSheet()}
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
                styles.bottomTabSymbol,
                isActive && styles.bottomTabSymbolActive,
              ]}
            >
              {tab.symbol}
            </Text>
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

function SummaryRow({ compact = false, label, selectable = false, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        numberOfLines={compact ? 2 : selectable ? undefined : 1}
        selectable={selectable}
        style={[styles.summaryValue, compact && styles.summaryValueCompact]}
      >
        {value}
      </Text>
    </View>
  );
}

function SiteRow({ isActive, onPress, site }) {
  const pluginDiagnostic = site?.unsupportedReason ? diagnosePluginSite(site) : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        isActive && styles.listRowActive,
        pressed && styles.buttonPressed,
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{site.name}</Text>
        <Text numberOfLines={1} selectable style={styles.rowMeta}>
          {site.sourceName || '配置'} · {formatSiteType(site.type)}
        </Text>
        {pluginDiagnostic ? (
          <PluginDiagnosticSummary diagnostic={pluginDiagnostic} compact />
        ) : site.unsupportedReason ? (
          <Text selectable style={styles.warningText}>
            {site.unsupportedReason}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.badge, site.unsupportedReason && styles.badgeMuted]}>
        {site.unsupportedReason ? '插件' : site.searchable ? '可搜索' : '未声明'}
      </Text>
    </Pressable>
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
              {result.pluginDiagnostic ? (
                <PluginDiagnosticSummary diagnostic={result.pluginDiagnostic} />
              ) : null}
              {result.pluginDiagnostics?.length ? (
                <View style={styles.pluginDiagnosticStack}>
                  {result.pluginDiagnostics.slice(0, 3).map((diagnostic, index) => (
                    <PluginDiagnosticSummary
                      compact
                      diagnostic={diagnostic}
                      key={`${diagnostic.kind}-${index}`}
                    />
                  ))}
                  {result.pluginDiagnostics.length > 3 ? (
                    <Text style={styles.pluginDiagnosticMore}>
                      还有 {result.pluginDiagnostics.length - 3} 个插件站点需要适配
                    </Text>
                  ) : null}
                </View>
              ) : null}
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

function PluginDiagnosticSummary({ compact = false, diagnostic }) {
  if (!diagnostic) {
    return null;
  }

  return (
    <View
      style={[
        styles.pluginDiagnostic,
        compact && styles.pluginDiagnosticCompact,
      ]}
    >
      <View style={styles.pluginDiagnosticHeader}>
        <Text style={styles.pluginDiagnosticTitle}>{diagnostic.title}</Text>
        <Text style={styles.pluginDiagnosticBadge}>
          {formatPluginCompatibility(diagnostic.compatibility)}
        </Text>
      </View>
      <Text selectable style={styles.pluginDiagnosticText}>
        {diagnostic.summary}
      </Text>
      {!compact ? (
        <>
          <CapabilityDots capabilities={diagnostic.capabilities} />
          <Text selectable style={styles.pluginDiagnosticNext}>
            {diagnostic.nextStep}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function PluginVerifyResultPanel({ result }) {
  const panelStyle =
    result.ok || result.status === 'sandbox-required'
      ? styles.siteTestPanelPassed
      : styles.siteTestPanelFailed;

  return (
    <View style={[styles.siteTestPanel, panelStyle]}>
      <View style={styles.pluginDiagnosticHeader}>
        <Text style={styles.siteTestTitle}>{result.title}</Text>
        <Text style={styles.pluginDiagnosticBadge}>
          {formatPluginVerifyStatus(result.status)}
        </Text>
      </View>
      <Text selectable style={styles.siteTestMessage}>
        {result.message}
      </Text>
      <View style={styles.siteTestGrid}>
        <DiagnosticTile label="运行时" value={result.runtime || '-'} />
        <DiagnosticTile label="目标" value={result.targetKind === 'site' ? '站点' : '脚本'} />
        <DiagnosticTile label="脚本字节" value={result.scriptBytes || 0} />
        <DiagnosticTile label="状态" value={formatPluginVerifyStatus(result.status)} />
      </View>
      {result.scriptUrl ? (
        <Text numberOfLines={2} selectable style={styles.rowMeta}>
          脚本入口：{result.scriptUrl}
        </Text>
      ) : null}
      {result.manifestUrl ? (
        <Text numberOfLines={2} selectable style={styles.rowMeta}>
          校验入口：{result.manifestUrl}
        </Text>
      ) : null}
      <CapabilityDots capabilities={result.capabilities} />
      {result.sandboxPreflight ? (
        <View
          style={[
            styles.pluginDiagnostic,
            result.sandboxPreflight.ok
              ? styles.sandboxPreflightPassed
              : styles.sandboxPreflightBlocked,
          ]}
        >
          <View style={styles.pluginDiagnosticHeader}>
            <Text style={styles.pluginDiagnosticTitle}>
              {result.sandboxPreflight.title}
            </Text>
            <Text style={styles.pluginDiagnosticBadge}>
              {formatPluginVerifyStatus(result.sandboxPreflight.status)}
            </Text>
          </View>
          <Text selectable style={styles.pluginDiagnosticText}>
            {result.sandboxPreflight.message}
          </Text>
          {result.sandboxPreflight.blockedTokens?.length ? (
            <Text selectable style={styles.pluginDiagnosticNext}>
              阻断能力：{result.sandboxPreflight.blockedTokens.join(' / ')}
            </Text>
          ) : null}
          {result.sandboxPreflight.compatibility?.shimTokens?.length ? (
            <Text selectable style={styles.pluginDiagnosticNext}>
              可兼容：{result.sandboxPreflight.compatibility.shimTokens.join(' / ')}
            </Text>
          ) : null}
          {result.sandboxPreflight.compatibility?.blockedTokens?.length ? (
            <Text selectable style={styles.pluginDiagnosticNext}>
              仍需适配：{result.sandboxPreflight.compatibility.blockedTokens.join(' / ')}
            </Text>
          ) : null}
          <Text selectable style={styles.pluginDiagnosticNext}>
            允许能力：{result.sandboxPreflight.allowedApis.join(' / ')}
          </Text>
        </View>
      ) : null}
      <Text selectable style={styles.pluginDiagnosticNext}>
        {result.nextStep}
      </Text>
    </View>
  );
}

function CapabilityDots({ capabilities }) {
  const entries = [
    ['home', '首页'],
    ['search', '搜索'],
    ['detail', '详情'],
    ['play', '播放'],
  ];

  return (
    <View style={styles.capabilityRow}>
      {entries.map(([key, label]) => {
        const status = capabilities?.[key] || 'unknown';
        const isKnown =
          status === 'supported' || status === 'declared' || status === 'detected';

        return (
          <View
            key={key}
            style={[
              styles.capabilityPill,
              isKnown && styles.capabilityPillKnown,
            ]}
          >
            <Text
              style={[
                styles.capabilityText,
                isKnown && styles.capabilityTextKnown,
              ]}
            >
              {label} {formatCapabilityStatus(status)}
            </Text>
          </View>
        );
      })}
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

function SourceList({ onVerifyPlugin, sources, verifyingPlugin }) {
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
          {source.kind === 'plugin' && onVerifyPlugin ? (
            <Pressable
              accessibilityRole="button"
              disabled={verifyingPlugin}
              onPress={() => onVerifyPlugin(source)}
              style={({ pressed }) => [
                styles.inlineActionButton,
                styles.inlineActionButtonMuted,
                verifyingPlugin && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.inlineActionText}>
                {verifyingPlugin ? '验证中' : '验证'}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.badge, source.kind === 'plugin' && styles.badgeMuted]}>
              {source.kind === 'plugin' ? '插件源' : '配置'}
            </Text>
          )}
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

function normalizeStoredSites(items) {
  return items.map((site) => {
    if (!isPluginLikeSite(site)) {
      return site;
    }

    if (isTvBoxCspSite(site)) {
      return {
        ...site,
        runtime: 'tvbox-jar-spider',
        searchable: site.searchable !== false,
        unsupportedReason: '',
      };
    }

    return {
      ...site,
      runtime: 'catvod-server',
      scriptUrl: isValidHttpUrl(site.scriptUrl || '')
        ? site.scriptUrl
        : isValidHttpUrl(site.sourceId || '')
        ? site.sourceId
        : site.scriptUrl || site.api,
      unsupportedReason: '',
    };
  });
}

function isPluginLikeSite(site) {
  const api = String(site?.api || site?.scriptUrl || '').trim().toLowerCase();
  return Number(site?.type) === 3 || /^csp_/i.test(api) || api.includes('.js');
}

function isTvBoxCspSite(site) {
  const api = String(site?.api || site?.scriptUrl || '').trim();
  const lowerApi = api.toLowerCase();
  const isCatVodScript =
    /^https?:\/\//i.test(api) &&
    (lowerApi.includes('/cat/') ||
      lowerApi.includes('cat.') ||
      lowerApi.endsWith('.js') ||
      lowerApi.endsWith('.js.md5'));

  return (Number(site?.type) === 3 || /^csp_/i.test(api)) && !isCatVodScript;
}

function firstValidHttpUrl(values) {
  return values.find((value) => isValidHttpUrl(value || '')) || '';
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

function formatPluginCompatibility(value) {
  if (value === 'requires-sandbox') {
    return '需沙盒';
  }

  if (value === 'requires-adapter') {
    return '需适配';
  }

  if (value === 'repair-needed') {
    return '需修正';
  }

  if (value === 'supported') {
    return '可尝试';
  }

  return '待验证';
}

function formatPluginVerifyStatus(value) {
  if (value === 'sandbox-required') {
    return '需沙盒';
  }

  if (value === 'adapter-required') {
    return '需适配';
  }

  if (value === 'network-error') {
    return '网络失败';
  }

  if (value === 'supported-json-api') {
    return '普通接口';
  }

  if (value === 'script-manifest-only') {
    return '缺脚本';
  }

  if (value === 'repair-needed') {
    return '需修正';
  }

  if (value === 'sandbox-preflight-passed') {
    return '预检通过';
  }

  if (value === 'sandbox-preflight-blocked') {
    return '已阻断';
  }

  if (value === 'server-runtime-required') {
    return '需服务端';
  }

  if (value === 'shim-required') {
    return '需兼容层';
  }

  return '待验证';
}

function formatCapabilityStatus(value) {
  if (value === 'supported') {
    return '可用';
  }

  if (value === 'declared') {
    return '声明';
  }

  if (value === 'detected') {
    return '检测到';
  }

  return '未知';
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  settingsRoot: {
    backgroundColor: '#f2f2f7',
  },
  searchPageRoot: {
    backgroundColor: '#ffffff',
  },
  keyboardRoot: {
    flex: 1,
  },
  hiddenWebView: {
    height: 1,
    left: -9999,
    opacity: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  appShell: {
    flex: 1,
    position: 'relative',
  },
  scrollContent: {
    gap: 14,
    padding: 16,
    paddingBottom: 210,
    paddingTop: TOP_SAFE_PADDING,
  },
  header: {
    gap: 10,
  },
  topChrome: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 40,
  },
  sourceSelectorWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 50,
  },
  sourcePill: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ececf0',
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 10px 26px rgba(0, 0, 0, 0.08)',
    flexDirection: 'row',
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  sourceIcon: {
    color: '#2f80ed',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandText: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceMeta: {
    color: '#8e8e93',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  sourceMenu: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(209, 213, 219, 0.84)',
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
    left: 0,
    maxHeight: 520,
    overflow: 'hidden',
    position: 'absolute',
    top: 60,
    width: 318,
    zIndex: 60,
  },
  sourceMenuScroll: {
    maxHeight: 520,
  },
  sourceMenuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 18,
  },
  sourceMenuItemActive: {
    backgroundColor: 'rgba(47, 128, 237, 0.12)',
  },
  sourceMenuCheck: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    width: 22,
  },
  sourceMenuText: {
    color: '#111827',
    flex: 1,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 9,
  },
  circleButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ececf0',
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 10px 26px rgba(0, 0, 0, 0.08)',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  circleButtonText: {
    color: '#050505',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  titleBlock: {
    gap: 2,
    paddingHorizontal: 2,
  },
  title: {
    color: '#050505',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  playerShell: {
    backgroundColor: '#000000',
    borderRadius: 18,
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
  },
  video: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#efeff4',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  statusItem: {
    minWidth: 54,
  },
  statusLabel: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
  },
  statusValue: {
    color: '#111111',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
  },
  statusDivider: {
    alignSelf: 'stretch',
    backgroundColor: '#ededf2',
    width: 1,
  },
  statusMessageGroup: {
    flex: 1,
    gap: 3,
  },
  idleStatusPanel: {
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    padding: 12,
  },
  idleStatusIconWrap: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  idleStatusIcon: {
    color: '#2f80ed',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  idleStatusTitle: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  idleStatusText: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  tabContent: {
    gap: 14,
  },
  discoverModeScroller: {
    marginHorizontal: -16,
  },
  discoverModeRow: {
    flexDirection: 'row',
    gap: 25,
    paddingHorizontal: 16,
  },
  discoverModeButton: {
    justifyContent: 'center',
    minHeight: 38,
  },
  discoverModeButtonActive: {},
  discoverModeText: {
    color: '#8e8e93',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  discoverModeTextActive: {
    color: '#050505',
    fontSize: 26,
    fontWeight: '900',
  },
  discoverFeed: {
    gap: 20,
  },
  discoverFilterStack: {
    gap: 12,
  },
  discoverFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterLabelPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  filterLabelText: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  homeFilterChip: {
    alignItems: 'center',
    backgroundColor: '#eeeeef',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
  },
  homeFilterChipActive: {
    backgroundColor: '#dfeeff',
  },
  homeFilterChipText: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  homeFilterChipTextActive: {
    color: '#1769d7',
  },
  discoverPosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  discoverPosterCard: {
    gap: 8,
    width: '29.9%',
  },
  discoverPosterFrame: {
    aspectRatio: 0.72,
    backgroundColor: '#e5e5ea',
    borderRadius: 7,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  discoverRatingBadge: {
    backgroundColor: '#f49a2f',
    borderBottomLeftRadius: 7,
    borderTopRightRadius: 7,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: '82%',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  discoverPosterTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 22,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    backgroundColor: '#ffffff',
    borderColor: '#efeff4',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 66,
    padding: 12,
  },
  statValue: {
    color: '#2f80ed',
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
  },
  statLabel: {
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickAction: {
    backgroundColor: '#f1f1f3',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#f1f1f3',
    gap: 4,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '48.5%',
  },
  quickValue: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  quickLabel: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    gap: 11,
    padding: 14,
  },
  settingsGroup: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    gap: 12,
    padding: 16,
  },
  settingsHero: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  settingsHeroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 36,
  },
  settingsHeroIcon: {
    color: '#2f80ed',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  settingsHeroTitle: {
    color: '#111111',
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  settingsHeroState: {
    color: '#8e8e93',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  settingsSectionLabelWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  settingsSectionLabel: {
    color: '#8e8e93',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sourceAddressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
  },
  sourceAddressName: {
    color: '#2f80ed',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceAddressUrl: {
    color: '#8e8e93',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
  },
  panelHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionHint: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 9,
  },
  inputLabel: {
    color: '#333333',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#f2f2f7',
    borderColor: '#f2f2f7',
    borderRadius: 14,
    borderWidth: 1,
    color: '#111111',
    fontSize: 14,
    letterSpacing: 0,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 128,
  },
  helperText: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  filterPanel: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#f2f2f7',
    borderRadius: 16,
    color: '#111111',
    fontSize: 15,
    letterSpacing: 0,
    minHeight: 42,
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
    backgroundColor: '#eeeeef',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 13,
  },
  filterChipActive: {
    backgroundColor: '#2f80ed',
  },
  filterChipText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  emptyText: {
    color: '#8e8e93',
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: '#eeeeef',
    borderRadius: 15,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 13,
  },
  fullWidthButton: {
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#34c759',
  },
  secondaryButton: {
    backgroundColor: '#ff9500',
  },
  accentButton: {
    backgroundColor: '#2f80ed',
  },
  compactButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  plainButtonText: {
    color: '#111111',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  searchSplit: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  searchPage: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: TOP_SAFE_PADDING,
  },
  searchPageTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    paddingBottom: 14,
  },
  searchBackButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  searchBackText: {
    color: '#050505',
    fontSize: 44,
    fontWeight: '300',
    lineHeight: 48,
  },
  searchPageInput: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 26,
    borderWidth: 1,
    color: '#111111',
    flex: 1,
    fontSize: 19,
    letterSpacing: 0,
    minHeight: 56,
    paddingHorizontal: 22,
  },
  searchSourceButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  searchSourceButtonText: {
    color: '#111111',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchPageBody: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
  },
  searchPageRail: {
    width: 112,
  },
  searchPageResults: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  searchEmptyState: {
    gap: 6,
    paddingTop: 36,
  },
  searchRail: {
    maxHeight: 560,
    width: 116,
  },
  searchRailContent: {
    gap: 8,
    paddingBottom: 12,
  },
  searchRailItem: {
    alignItems: 'center',
    backgroundColor: '#f6f7f9',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  searchRailItemActive: {
    backgroundColor: '#2f80ed',
  },
  searchRailItemFailed: {
    opacity: 0.58,
  },
  searchRailLabel: {
    color: '#111827',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  searchRailLabelActive: {
    color: '#ffffff',
  },
  searchRailCount: {
    backgroundColor: '#f6a953',
    borderRadius: 8,
    color: '#111827',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 24,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: 'center',
  },
  searchRailCountActive: {
    backgroundColor: '#ffffff',
    color: '#2f80ed',
  },
  searchResultPane: {
    flex: 1,
    minWidth: 0,
  },
  sourceFilterSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    boxShadow: '0 -18px 54px rgba(0, 0, 0, 0.18)',
    gap: 14,
    left: 0,
    maxHeight: '72%',
    padding: 20,
    position: 'absolute',
    right: 0,
  },
  sourceFilterList: {
    gap: 9,
    paddingBottom: 8,
  },
  sourceFilterItem: {
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  sourceFilterItemActive: {
    backgroundColor: '#e7f1ff',
  },
  sourceFilterCheck: {
    color: '#2f80ed',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    width: 22,
  },
  sourceFilterName: {
    color: '#111111',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  listStack: {
    gap: 8,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    padding: 13,
  },
  listRowActive: {
    backgroundColor: '#eaf3ff',
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 12,
  },
  resultRowActive: {
    backgroundColor: '#eaf3ff',
  },
  vodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  vodCard: {
    gap: 7,
    width: '31.4%',
  },
  vodCardActive: {
    opacity: 0.82,
  },
  posterFrame: {
    aspectRatio: 2 / 3,
    backgroundColor: '#e5e5ea',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  posterImage: {
    height: '100%',
    width: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#e5e5ea',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  posterPlaceholderText: {
    color: '#98a2b3',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  posterBadge: {
    backgroundColor: '#f6a04d',
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 10,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: '80%',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  vodCardTitle: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 19,
    textAlign: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  rowMeta: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
  },
  rowAction: {
    color: '#2f80ed',
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
  successText: {
    color: '#168a56',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  badge: {
    backgroundColor: '#e8f5ee',
    borderRadius: 12,
    color: '#168a56',
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
    backgroundColor: '#fff2df',
    color: '#c16b18',
  },
  selectedSitePanel: {
    backgroundColor: '#f7f7f8',
    borderRadius: 15,
    gap: 3,
    padding: 11,
  },
  siteRailScroller: {
    marginHorizontal: -4,
  },
  siteRail: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  siteChip: {
    backgroundColor: '#eeeeef',
    borderRadius: 11,
    justifyContent: 'center',
    maxWidth: 132,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  siteChipActive: {
    backgroundColor: '#2f80ed',
  },
  siteChipText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  siteChipTextActive: {
    color: '#ffffff',
  },
  selectedSiteText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectedDetailPanel: {
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    gap: 4,
    padding: 12,
  },
  playGroupList: {
    gap: 12,
  },
  playGroup: {
    gap: 8,
  },
  playGroupTitle: {
    color: '#333333',
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
    backgroundColor: '#eeeeef',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 78,
    paddingHorizontal: 10,
  },
  episodeButtonText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 120,
  },
  summaryList: {
    gap: 10,
  },
  summaryRow: {
    borderBottomColor: '#ededf2',
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
  },
  summaryLabel: {
    color: '#8e8e93',
    fontSize: 12,
    letterSpacing: 0,
  },
  summaryValue: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 19,
  },
  summaryValueCompact: {
    color: '#333333',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  currentUrl: {
    color: '#555555',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  diagnosticsPanel: {
    backgroundColor: '#f7f7f8',
    borderRadius: 18,
    gap: 10,
    padding: 12,
  },
  diagnosticsSummary: {
    color: '#111111',
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
    borderColor: '#ededf2',
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '48%',
  },
  diagnosticValue: {
    color: '#2f80ed',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
  },
  diagnosticLabel: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  siteTestPanel: {
    borderRadius: 18,
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
    color: '#111111',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  siteTestMessage: {
    color: '#555555',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
  },
  pluginDiagnostic: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    padding: 8,
  },
  sandboxPreflightPassed: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  sandboxPreflightBlocked: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  pluginDiagnosticCompact: {
    gap: 4,
    padding: 7,
  },
  pluginDiagnosticHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  pluginDiagnosticTitle: {
    color: '#111111',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  pluginDiagnosticBadge: {
    backgroundColor: '#ffedd5',
    borderRadius: 9,
    color: '#c2410c',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pluginDiagnosticText: {
    color: '#7c2d12',
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: 16,
  },
  pluginDiagnosticNext: {
    color: '#9a3412',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 16,
  },
  pluginDiagnosticStack: {
    gap: 6,
  },
  pluginDiagnosticMore: {
    color: '#9a3412',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  capabilityPill: {
    backgroundColor: '#fef3c7',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  capabilityPillKnown: {
    backgroundColor: '#dcfce7',
  },
  capabilityText: {
    color: '#92400e',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  capabilityTextKnown: {
    color: '#166534',
  },
  siteTestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchResultRow: {
    alignItems: 'center',
    borderRadius: 16,
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
    backgroundColor: '#34c759',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 54,
    paddingHorizontal: 10,
  },
  inlineActionButtonMuted: {
    backgroundColor: '#2f80ed',
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
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  privacyText: {
    color: '#555555',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 20,
  },
  bottomTabs: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderColor: 'rgba(210, 210, 215, 0.72)',
    borderRadius: 34,
    borderWidth: 1,
    bottom: 12,
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
    flexDirection: 'row',
    gap: 4,
    left: 44,
    padding: 6,
    position: 'absolute',
    right: 44,
  },
  bottomTab: {
    alignItems: 'center',
    borderRadius: 28,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 50,
  },
  bottomTabActive: {
    backgroundColor: 'rgba(47, 128, 237, 0.16)',
  },
  bottomTabSymbol: {
    color: '#111111',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 23,
  },
  bottomTabSymbolActive: {
    color: '#2f80ed',
  },
  bottomTabText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  bottomTabTextActive: {
    color: '#2f80ed',
  },
  overlayBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100,
  },
  overlayScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  searchOverlayCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  searchOverlayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
    gap: 16,
    padding: 20,
  },
  overlayHandle: {
    alignSelf: 'center',
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    height: 4,
    width: 44,
  },
  searchOverlayTitle: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  searchOverlayInput: {
    backgroundColor: '#f2f2f7',
    borderRadius: 19,
    color: '#111111',
    fontSize: 18,
    letterSpacing: 0,
    minHeight: 54,
    paddingHorizontal: 18,
  },
});
