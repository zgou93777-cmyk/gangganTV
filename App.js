import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEvent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
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
  fetchTvBoxConfig,
  fetchTvBoxDetail,
  fetchTvBoxHome,
  fetchTvBoxSearch,
  isBuiltInMockConfigUrl,
  resolveTvBoxEpisode,
} = require('./src/iptv-api');
const {
  APP_TABS,
  DEFAULT_TAB_ID,
  DISCOVER_FEED_TABS,
  DISCOVER_REGION_FILTERS,
  DISCOVER_SORT_FILTERS,
  buildDiscoverPosterFeed,
  buildPosterDetailModel,
  buildSourceDiscoverPosterFeed,
  buildVodResultCards,
  buildWatchingSummary,
  getTabById,
} = require('./src/ui-model');
const {
  addPlayHistoryItem,
  deletePlayHistoryItems,
  normalizePlayHistory,
} = require('./src/play-history');
const {
  testTvBoxSite,
  testTvBoxSites,
} = require('./src/site-tester');
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
const {
  addSearchHistoryKeyword,
  normalizeSearchHistory,
} = require('./src/search-history');
const {
  resolveResultRuntimeSite,
} = require('./src/search-result-runtime');
const {
  buildSearchTargets,
  searchAcrossSites,
} = require('./src/search-workflow');
const {
  buildSourceStatus,
  deleteConfigSource,
  renameConfigSource,
  replaceWithSingleSource,
  selectDefaultSource,
} = require('./src/source-management');
const {
  buildDetailLoadingMessage,
  buildEpisodeLoadingMessage,
  buildSearchLoadingMessage,
} = require('./src/vod-ux');
const {
  COLORS,
  GLASS_ACTIVE_OUTLINE_STYLE,
  GLASS_BUTTON_STYLE,
  GLASS_INPUT_STYLE,
  GLASS_NAV_STYLE,
  GLASS_PANEL_STYLE,
} = require('./src/ui-theme');

const BUILT_IN_TEST_CONFIG_URL = 'mock://demo-tvbox';
const RECOMMENDED_CATVOD_SOURCE_URL =
  'http://wexfnw:wexfnw@cat.999888987.xyz/index.js.md5';
const LOCAL_PARSER_HINT_URL = 'http://192.168.220.41:3000';
const TOP_SAFE_PADDING = Platform.select({
  ios: 54,
  android: (NativeStatusBar.currentHeight || 0) + 18,
  default: 36,
});
const COMPACT_TOP_PADDING = Platform.select({
  ios: 18,
  android: 12,
  default: 12,
});

const STORAGE_KEYS = {
  vod: 'iptv.prototype.recentVodUrl',
  configUrl: 'iptv.prototype.configUrl',
  configSources: 'iptv.prototype.configSources',
  sites: 'iptv.prototype.sites',
  selectedSiteId: 'iptv.prototype.selectedSiteId',
  playHistory: 'iptv.prototype.playHistory',
  searchHistory: 'iptv.prototype.searchHistory',
  pluginServerUrl: 'iptv.prototype.pluginServerUrl',
  pluginServerToken: 'iptv.prototype.pluginServerToken',
};

const LABELS = {
  vod: '点播',
  config: '配置',
};

export default function App() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB_ID);
  const [activePage, setActivePage] = useState('discover');
  const [activeFeedTab, setActiveFeedTab] = useState('hot');
  const [activeSortFilter, setActiveSortFilter] = useState('heat');
  const [activeRegionFilter, setActiveRegionFilter] = useState('all');
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [overlayKeyword, setOverlayKeyword] = useState('');
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [selectedSearchSourceIds, setSelectedSearchSourceIds] = useState([]);
  const [vodUrl, setVodUrl] = useState('');
  const [configUrl, setConfigUrl] = useState('');
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [renamingSourceId, setRenamingSourceId] = useState('');
  const [renamingSourceText, setRenamingSourceText] = useState('');
  const [configSourceText, setConfigSourceText] = useState('');
  const [pluginServerUrl, setPluginServerUrl] = useState('');
  const [pluginServerToken, setPluginServerToken] = useState('');
  const [configSourceScanResults, setConfigSourceScanResults] = useState([]);
  const [configSources, setConfigSources] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchHistory, setSearchHistory] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchFailures, setSearchFailures] = useState([]);
  const [sourceDiscoverResults, setSourceDiscoverResults] = useState([]);
  const [loadingDiscoverFeed, setLoadingDiscoverFeed] = useState(false);
  const [activeSearchBucketId, setActiveSearchBucketId] = useState('all');
  const [selectedResult, setSelectedResult] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [activeType, setActiveType] = useState('vod');
  const [currentUrl, setCurrentUrl] = useState('');
  const [playerLayerOpen, setPlayerLayerOpen] = useState(false);
  const [playerLayerTitle, setPlayerLayerTitle] = useState('');
  const [playerLayerSource, setPlayerLayerSource] = useState('');
  const [playHistory, setPlayHistory] = useState([]);
  const [historySelectionMode, setHistorySelectionMode] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([]);
  const [message, setMessage] = useState('等待播放地址');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [scanningConfigSources, setScanningConfigSources] = useState(false);
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
  const demoDiscoverPosterFeed = useMemo(() => buildDiscoverPosterFeed(), []);
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
  const sourceDiscoverPosters = useMemo(
    () =>
      buildSourceDiscoverPosterFeed(sourceDiscoverResults, {
        sourceName: selectedSite?.name || '',
      }),
    [selectedSite?.name, sourceDiscoverResults]
  );
  const discoverPosterFeed = sourceDiscoverPosters.length
    ? sourceDiscoverPosters
    : demoDiscoverPosterFeed;
  const selectedPosterDetail = useMemo(
    () => buildPosterDetailModel(selectedResult, selectedDetail),
    [selectedDetail, selectedResult]
  );
  const watchingSummary = useMemo(
    () =>
      buildWatchingSummary({
        configSources,
        sites,
        playHistory,
        currentUrl,
      }),
    [configSources, currentUrl, playHistory, sites]
  );
  const configDiagnostics = useMemo(
    () => buildConfigDiagnostics({ sources: configSources, sites }),
    [configSources, sites]
  );
  const activeSearchTargetCount = useMemo(
    () => buildSearchTargets({ sites, selectedSourceIds: selectedSearchSourceIds }).length,
    [selectedSearchSourceIds, sites]
  );

  useEffect(() => {
    restoreLocalState().catch(() => {
      setMessage('读取本地数据失败');
    });
  }, []);

  useEffect(() => {
    if (activePage !== 'discover' || activeTab !== 'discover') {
      return;
    }

    loadSourceDiscoverFeed().catch(() => {
      setSourceDiscoverResults([]);
    });
  }, [activePage, activeTab, selectedSiteId, sites]);

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
      storedVodUrl,
      storedConfigUrl,
      storedSources,
      storedSites,
      storedSelectedSiteId,
      storedPlayHistory,
      storedSearchHistory,
      storedPluginServerUrl,
      storedPluginServerToken,
    ] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.vod),
      AsyncStorage.getItem(STORAGE_KEYS.configUrl),
      AsyncStorage.getItem(STORAGE_KEYS.configSources),
      AsyncStorage.getItem(STORAGE_KEYS.sites),
      AsyncStorage.getItem(STORAGE_KEYS.selectedSiteId),
      AsyncStorage.getItem(STORAGE_KEYS.playHistory),
      AsyncStorage.getItem(STORAGE_KEYS.searchHistory),
      AsyncStorage.getItem(STORAGE_KEYS.pluginServerUrl),
      AsyncStorage.getItem(STORAGE_KEYS.pluginServerToken),
    ]);

    const nextSources = parseStoredArray(storedSources);
    const nextSites = normalizeStoredSites(parseStoredArray(storedSites));
    const nextPlayHistory = normalizePlayHistory(parseStoredArray(storedPlayHistory));
    const nextSearchHistory = normalizeSearchHistory(parseStoredArray(storedSearchHistory));

    setVodUrl(storedVodUrl || '');
    setPluginServerUrl(storedPluginServerUrl || '');
    setPluginServerToken(storedPluginServerToken || '');
    setConfigUrl(storedConfigUrl || '');
    setConfigSources(nextSources);
    setSites(nextSites);
    setPlayHistory(nextPlayHistory);
    setSearchHistory(nextSearchHistory);

    if (nextSites.some((site) => site.id === storedSelectedSiteId)) {
      setSelectedSiteId(storedSelectedSiteId);
    } else {
      setSelectedSiteId(firstUsableSiteId(nextSites));
    }
  }

  async function playDirectUrl(type) {
    const playbackType = type || 'vod';
    const cleanUrl = vodUrl.trim();

    if (!cleanUrl) {
      setActiveType(playbackType);
      setMessage(`请输入${LABELS[playbackType]}地址`);
      return;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      setActiveType(playbackType);
      setMessage(`${LABELS[playbackType]}地址需要以 http:// 或 https:// 开头`);
      return;
    }

    const playableIssue = getPlayableUrlIssue(cleanUrl);

    if (playableIssue) {
      setActiveType(playbackType);
      setMessage(playableIssue);
      return;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.vod, cleanUrl);
    await playResolvedUrl(playbackType, cleanUrl, `${LABELS[playbackType]}地址`, {
      sourceName: '点播直链',
    });
  }

  async function playResolvedUrl(type, url, title, historyMeta = {}) {
    setActiveType(type);
    setCurrentUrl(url);
    setPlayerLayerTitle(title);
    setPlayerLayerSource(historyMeta.sourceName || LABELS[type] || '播放');
    setMessage('正在加载视频');

    await player.replaceAsync({
      uri: url,
      metadata: {
        title,
      },
    });
    player.play();
    setPlayerLayerOpen(true);
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

  function toggleHistorySelectionMode() {
    setHistorySelectionMode((value) => {
      if (value) {
        setSelectedHistoryIds([]);
        setMessage('已退出多选');
        return false;
      }

      if (!playHistory.length) {
        setMessage('还没有可删除的播放历史');
        return false;
      }

      setMessage('请选择要删除的播放历史');
      return true;
    });
  }

  function toggleHistorySelection(itemId) {
    setSelectedHistoryIds((ids) =>
      ids.includes(itemId)
        ? ids.filter((id) => id !== itemId)
        : [...ids, itemId]
    );
  }

  async function deleteSelectedHistoryItems() {
    if (!selectedHistoryIds.length) {
      setMessage('请先选择要删除的播放历史');
      return;
    }

    const nextHistory = deletePlayHistoryItems(playHistory, selectedHistoryIds);
    const deletedCount = playHistory.length - nextHistory.length;

    setPlayHistory(nextHistory);
    setSelectedHistoryIds([]);
    setHistorySelectionMode(false);
    await saveJson(STORAGE_KEYS.playHistory, nextHistory);
    setMessage(`已删除 ${deletedCount} 条播放历史`);
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
        const serverSite = buildPluginServerSite(pluginSource, cleanUrl);
        const nextState = replaceWithSingleSource({
          selectedSearchSourceIds: [serverSite.id],
          selectedSiteId: serverSite.id,
          source: pluginSource,
          sites: [serverSite],
        });

        setConfigSources(nextState.sources);
        setSites(nextState.sites);
        setSelectedSiteId(nextState.selectedSiteId);
        setSelectedSearchSourceIds([serverSite.id]);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.configUrl, cleanUrl),
          saveJson(STORAGE_KEYS.configSources, nextState.sources),
          saveJson(STORAGE_KEYS.sites, nextState.sites),
          AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, nextState.selectedSiteId),
        ]);
        loadPluginServerSite(pluginSource, cleanUrl);
        setMessage(
          pluginServerUrl.trim()
            ? '已导入 CatVod 插件源，将使用本地解析器搜索'
            : '已导入 CatVod 插件源，请先填写本地解析器地址'
        );
        return;
      }

      const parsed = await fetchTvBoxConfig(cleanUrl);
      const source = {
        ...parsed.source,
        kind: 'config',
        reason: '',
      };
      const importedSites = parsed.sites.map((site) => ({
        ...site,
        id: `${source.id}#${site.id}`,
        siteKey: site.siteKey || site.id,
        scriptUrl: site.runtime === 'catvod-server' ? source.url : site.scriptUrl,
        sourceId: source.id,
        sourceName: source.name,
      }));
      const nextState = replaceWithSingleSource({
        selectedSearchSourceIds: [],
        source,
        sites: importedSites,
      });

      setConfigSources(nextState.sources);
      setSites(nextState.sites);
      setSelectedSiteId(nextState.selectedSiteId);
      setSelectedSearchSourceIds(nextState.selectedSearchSourceIds);
      setSearchResults([]);
      setSelectedResult(null);
      setSelectedDetail(null);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.configUrl, cleanUrl),
        saveJson(STORAGE_KEYS.configSources, nextState.sources),
        saveJson(STORAGE_KEYS.sites, nextState.sites),
        AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, nextState.selectedSiteId),
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

  async function renameSource(sourceId) {
    const cleanName = renamingSourceText.trim();

    if (!cleanName) {
      setMessage('请输入新的源名称');
      return;
    }

    const nextState = renameConfigSource({
      name: cleanName,
      sourceId,
      sources: configSources,
      sites,
    });

    setConfigSources(nextState.sources);
    setSites(nextState.sites);
    setRenamingSourceId('');
    setRenamingSourceText('');

    await Promise.all([
      saveJson(STORAGE_KEYS.configSources, nextState.sources),
      saveJson(STORAGE_KEYS.sites, nextState.sites),
    ]);
    setMessage(`已重命名为 ${cleanName}`);
  }

  function requestDeleteSource(source) {
    if (!source?.id) {
      return;
    }

    Alert.alert(
      '删除配置源',
      `确定删除「${source.name || '未命名源'}」吗？相关站点也会从本机移除。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            deleteSource(source).catch((deleteError) =>
              setMessage(deleteError?.message || '删除配置源失败')
            );
          },
        },
      ]
    );
  }

  async function deleteSource(source) {
    const nextState = deleteConfigSource({
      configUrl,
      selectedSearchSourceIds,
      selectedSiteId,
      sourceId: source.id,
      sources: configSources,
      sites,
    });

    setConfigSources(nextState.sources);
    setSites(nextState.sites);
    setSelectedSiteId(nextState.selectedSiteId);
    setSelectedSearchSourceIds(nextState.selectedSearchSourceIds);
    setConfigUrl(nextState.configUrl);
    setSearchResults([]);
    setSearchFailures([]);
    setSelectedResult(null);
    setSelectedDetail(null);
    setSourceMenuOpen(false);

    if (catVodSource?.id === source.id) {
      setCatVodSource(null);
      setCatVodReady(false);
      setCatVodExecutorHtml('');
      catVodRuntimeRef.current = null;
    }

    await Promise.all([
      saveJson(STORAGE_KEYS.configSources, nextState.sources),
      saveJson(STORAGE_KEYS.sites, nextState.sites),
      nextState.selectedSiteId
        ? AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, nextState.selectedSiteId)
        : AsyncStorage.removeItem(STORAGE_KEYS.selectedSiteId),
      nextState.configUrl
        ? AsyncStorage.setItem(STORAGE_KEYS.configUrl, nextState.configUrl)
        : AsyncStorage.removeItem(STORAGE_KEYS.configUrl),
    ]);
    setMessage(`已删除 ${source.name || '配置源'}`);
  }

  async function makeSourceDefault(source) {
    const nextSelectedSiteId = selectDefaultSource({
      sourceId: source.id,
      sites,
    });

    if (!nextSelectedSiteId) {
      setMessage('这个源当前没有可设为默认的可搜索站点');
      return;
    }

    setSelectedSiteId(nextSelectedSiteId);
    setSearchResults([]);
    setSearchFailures([]);
    setSelectedResult(null);
    setSelectedDetail(null);
    await AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, nextSelectedSiteId);
    setMessage(`已设为默认源：${source.name || '未命名源'}`);
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
    saveJson(STORAGE_KEYS.sites, nextSites).catch(() =>
      setMessage('插件执行器站点保存失败')
    );
    AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, runtimeSite.id).catch(() =>
      setMessage('默认站点保存失败')
    );
    setMessage('正在加载插件执行器');
  }

  function buildPluginServerSite(source, scriptUrl) {
    return {
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
  }

  function loadPluginServerSite(source, scriptUrl) {
    const serverSite = buildPluginServerSite(source, scriptUrl);
    const nextSites = upsertById(sites, serverSite);

    setCatVodSource({
      ...source,
      scriptUrl,
    });
    setSites(nextSites);
    setSelectedSiteId(serverSite.id);
    setActiveTab('discover');
    saveJson(STORAGE_KEYS.sites, nextSites).catch(() =>
      setMessage('本地解析器站点保存失败')
    );
    AsyncStorage.setItem(STORAGE_KEYS.selectedSiteId, serverSite.id).catch(() =>
      setMessage('默认站点保存失败')
    );
    setMessage(
      pluginServerUrl
        ? '已准备使用本地解析器'
        : '该插件需要本地解析器，请先填写本地解析器地址'
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
      setMessage('已清空本地解析器地址');
      return;
    }

    if (!isValidHttpUrl(cleanUrl)) {
      setMessage('本地解析器地址需要以 http:// 或 https:// 开头');
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
    setMessage('已保存本地解析器地址');
  }

  async function checkPluginServer() {
    setCheckingPluginServer(true);
    setPluginServerHealth(null);
    setActiveType('config');
    setMessage('正在检测本地解析器');

    try {
      const health = await fetchPluginServerHealth({
        baseUrl: pluginServerUrl.trim(),
        token: pluginServerToken.trim(),
      });
      const ok = Boolean(health?.ok);
      const capabilities = health?.capabilities || {};
      const capabilityText = [
        capabilities.catvod ? 'CatVod 可用' : 'CatVod 未确认',
        capabilities.tvboxRoutes ? 'TVBox 路由可用' : 'TVBox 路由缺失',
        capabilities.tvboxRuntime ? 'TVBox Spider 已连接' : 'TVBox Spider 未连接',
      ].join('，');

      setPluginServerHealth({
        capabilities,
        ok,
        message: ok
          ? `本地解析服务正常：${capabilityText}`
          : '服务返回异常状态',
      });
      setMessage(ok ? '本地解析服务连接正常' : '本地解析服务返回异常状态');
    } catch (healthError) {
      const errorMessage = healthError?.message || '本地解析器检测失败';
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
    if (loadingSearch) {
      setMessage('正在搜索，请稍候');
      return;
    }

    const cleanKeyword =
      typeof keywordOverride === 'string'
        ? keywordOverride.trim()
        : searchKeyword.trim();
    setSourceMenuOpen(false);

    if (!sites.length) {
      setActiveType('config');
      setMessage('请先导入可搜索的站点');
      return;
    }

    if (!cleanKeyword) {
      setActiveType('config');
      setMessage('请输入搜索关键词');
      return;
    }

    const targets = buildSearchTargets({
      selectedSourceIds: selectedSearchSourceIds,
      sites,
    });

    setLoadingSearch(true);
    setActiveType('config');
    setMessage(buildSearchLoadingMessage({ targetCount: targets.length }));
    setSearchResults([]);
    setSearchFailures([]);
    setActiveSearchBucketId('all');
    const nextSearchHistory = addSearchHistoryKeyword(searchHistory, cleanKeyword);
    setSearchHistory(nextSearchHistory);
    saveJson(STORAGE_KEYS.searchHistory, nextSearchHistory).catch(() =>
      setMessage('搜索历史保存失败')
    );

    try {
      const progressResults = [];
      const progressFailures = [];
      const { failures, results, targets: searchedTargets } = await searchAcrossSites({
        getSkipReason: getSearchSkipReason,
        keyword: cleanKeyword,
        onProgress: (event) => {
          if (event.type === 'results') {
            progressResults.push(...(event.results || []));
            setSearchResults([...progressResults]);
          }

          if (event.type === 'failure' && event.failure) {
            progressFailures.push(event.failure);
            setSearchFailures([...progressFailures]);
          }

          setMessage(
            buildSearchProgressMessage({
              completedCount: event.completedCount,
              failureCount: progressFailures.length,
              resultCount: progressResults.length,
              targetCount: event.targetCount,
            })
          );
        },
        selectedSourceIds: selectedSearchSourceIds,
        sites,
        searchSite,
      });

      if (searchedTargets.length) {
        setSelectedSiteId(searchedTargets[0].id);
      }
      setSearchResults(results);
      setSearchFailures(failures);
      setSelectedResult(null);
      setSelectedDetail(null);
      setMessage(
        buildSearchMessage({
          failureCount: failures.length,
          resultCount: results.length,
          targetCount: searchedTargets.length,
        })
      );
    } catch (searchError) {
      setSearchResults([]);
      setSearchFailures([
        {
          sourceId: selectedSite?.id || '',
          sourceName: selectedSite?.name || '当前站点',
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

  async function clearSearchHistory() {
    setSearchHistory([]);
    await saveJson(STORAGE_KEYS.searchHistory, []);
    setMessage('已清空搜索历史');
  }

  async function loadDetail(result) {
    const resultSite = resolveResultRuntimeSite({
      result,
      selectedSite,
      sites,
    });

    if (!resultSite) {
      setMessage('请先选择站点');
      return;
    }

    setSelectedSiteId(resultSite.id);
    setSelectedResult({
      ...result,
      runtimeSiteId: result.runtimeSiteId || resultSite.id,
      runtimeSiteName: result.runtimeSiteName || resultSite.name,
    });
    setSelectedDetail(null);
    setActivePage('detail');
    setLoadingDetailId(result.id);
    setMessage(buildDetailLoadingMessage(result.name || result.title));

    try {
      const detail = isTvBoxSpiderSite(resultSite)
        ? await fetchTvBoxServerDetail(
            buildTvBoxServerConfig(resultSite),
            result.id
          )
        : isPluginServerSite(resultSite)
        ? await fetchPluginServerDetail(
            buildPluginServerConfig(resultSite),
            result.id
          )
        : isCatVodRuntimeActive(resultSite)
        ? normalizeCatVodDetailResult(
            await catVodRuntimeRef.current.call('detail', [result.id])
          )
        : await fetchTvBoxDetail(resultSite, result.id);

      setSelectedDetail(detail);
      setMessage(detail.playGroups.length ? '请选择播放项' : '该结果没有可播放列表');
    } catch (detailError) {
      setMessage(detailError?.message || '播放列表读取失败');
    } finally {
      setLoadingDetailId('');
    }
  }

  async function playEpisode(group, episode, episodeIndex) {
    const playbackSite = resolveResultRuntimeSite({
      result: selectedResult,
      selectedSite,
      sites,
    });

    if (!playbackSite || !selectedDetail) {
      setMessage('请先选择播放项');
      return;
    }

    const episodeKey = `${group.name}-${episodeIndex}-${episode.name}`;
    setLoadingEpisodeKey(episodeKey);
    setMessage(buildEpisodeLoadingMessage(episode.name));

    try {
      const playableUrl = isTvBoxSpiderSite(playbackSite)
        ? await fetchTvBoxServerPlay(buildTvBoxServerConfig(playbackSite), {
            flag: group.name,
            id: episode.url,
          })
        : isPluginServerSite(playbackSite)
        ? await fetchPluginServerPlay(buildPluginServerConfig(playbackSite), {
            flag: group.name,
            id: episode.url,
          })
        : isCatVodRuntimeActive(playbackSite)
        ? normalizeCatVodPlayResult(
            await catVodRuntimeRef.current.call('play', [
              group.name,
              episode.url,
              [],
            ])
          ) || episode.url
        : await resolveTvBoxEpisode(playbackSite, episode);
      await playResolvedUrl(
        'vod',
        playableUrl,
        `${selectedDetail.name} ${episode.name}`,
        {
          sourceName:
            selectedResult?.sourceName ||
            playbackSite.name,
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

  function getSearchSkipReason(site) {
    if (
      isTvBoxSpiderSite(site) &&
      pluginServerHealth?.capabilities?.tvboxRuntime !== true
    ) {
      return 'TVBox Spider 运行时未连接，当前只能先用 CatVod JS 或普通 JSON API 源';
    }

    return '';
  }

  async function searchSite(site, keyword) {
    if (isTvBoxSpiderSite(site)) {
      return fetchTvBoxServerSearch(buildTvBoxServerConfig(site), keyword);
    }

    if (isPluginServerSite(site)) {
      return fetchPluginServerSearch(buildPluginServerConfig(site), keyword);
    }

    if (isCatVodRuntimeActive(site)) {
      return normalizeCatVodSearchResult(
        await catVodRuntimeRef.current.call('search', [keyword, false, 1])
      );
    }

    return fetchTvBoxSearch(site, keyword);
  }

  async function loadSourceDiscoverFeed() {
    if (!selectedSite || isTvBoxSpiderSite(selectedSite) || isPluginServerSite(selectedSite)) {
      setSourceDiscoverResults([]);
      return;
    }

    setLoadingDiscoverFeed(true);

    try {
      const results = await fetchTvBoxHome(selectedSite);
      setSourceDiscoverResults(results.slice(0, 30));
    } catch {
      setSourceDiscoverResults([]);
    } finally {
      setLoadingDiscoverFeed(false);
    }
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
      throw new Error('请先在设置里填写本地解析器地址');
    }

    return {
      baseUrl: pluginServerUrl.trim(),
      token: pluginServerToken.trim(),
      scriptUrl: firstValidHttpUrl([site?.scriptUrl, site?.sourceId, site?.api]),
    };
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
            disabled={Boolean(loadingDetailId)}
            key={card.id}
            onPress={() => loadDetail(card.raw)}
            style={({ pressed }) => [
              styles.vodCard,
              selectedResult?.id === card.raw.id && styles.vodCardActive,
              loadingDetailId && loadingDetailId !== card.raw.id && styles.cardDisabled,
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
              {loadingDetailId === card.raw.id ? (
                <View style={styles.posterLoadingOverlay}>
                  <ActivityIndicator color="#ffffff" />
                </View>
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
          <Icon
            name={menuVisible ? 'chevronUp' : 'chevronDown'}
            style={styles.sourceIcon}
          />
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
          <Text style={styles.sectionTitle}>点播直链测试</Text>
          <Text style={styles.sectionHint}>用于验证 mp4/m3u8 最终播放地址</Text>
        </View>
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

  function renderDiscover() {
    return (
      <View style={styles.discoverFeed}>
        {renderDiscoverFeedRail()}
        {renderDiscoverFilters()}
        {loadingDiscoverFeed ? (
          <Text style={styles.sectionHint}>正在读取当前源首页</Text>
        ) : null}
        {renderDiscoverPosterGrid()}
      </View>
    );
  }

  function renderWatching() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.historyTop}>
          <View style={styles.historyPill}>
            <Icon name="history" style={styles.historyPillIcon} />
            <Text style={styles.historyPillText}>播放历史</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={toggleHistorySelectionMode}
            style={({ pressed }) => [
              styles.historyPill,
              styles.historyPillAction,
              historySelectionMode && styles.historyPillActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.historyPillText}>
              {historySelectionMode ? '取消' : '多选'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.watchingQuickRow}>
          <View style={styles.watchingStatPill}>
            <Text style={styles.watchingStatValue}>{playHistory.length}</Text>
            <Text style={styles.watchingStatLabel}>历史</Text>
          </View>
          <View style={styles.watchingStatPill}>
            <Text style={styles.watchingStatValue}>{watchingSummary.siteCount}</Text>
            <Text style={styles.watchingStatLabel}>站点</Text>
          </View>
          <View style={styles.watchingStatPill}>
            <Text style={styles.watchingStatValue}>
              {watchingSummary.hasCurrentUrl ? '1' : '0'}
            </Text>
            <Text style={styles.watchingStatLabel}>当前</Text>
          </View>
        </View>

        <View style={styles.historyActionRow}>
            <CompactButton
              onPress={() =>
                continueLatestPlay().catch(() => setMessage('继续播放失败'))
              }
              variant="accent"
            >
              {isPlaying ? '暂停播放' : '继续播放'}
            </CompactButton>
            <CompactButton
              onPress={() => playDirectUrl('vod').catch(() => setMessage('点播加载失败'))}
              variant="plain"
            >
              播放直链
            </CompactButton>
        </View>

        <View style={styles.historyListSection}>
          {playHistory.length ? (
            <View style={styles.listStack}>
              {playHistory.slice(0, 12).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => {
                    if (historySelectionMode) {
                      toggleHistorySelection(item.id);
                      return;
                    }

                    playHistoryItem(item).catch(() => setMessage('历史播放失败'));
                  }}
                  style={({ pressed }) => [
                    styles.historyMediaRow,
                    historySelectionMode &&
                      selectedHistoryIds.includes(item.id) &&
                      styles.historyMediaRowSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <View style={styles.historyPosterBox}>
                    <Text style={styles.historyPosterInitial}>
                      {(item.title || '播').slice(0, 1)}
                    </Text>
                  </View>
                  <View style={styles.rowMain}>
                    <Text numberOfLines={2} style={styles.historyMediaTitle}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={2} selectable style={styles.historyMediaMeta}>
                      {formatHistoryType(item.type)} · {item.sourceName || '本机历史'}
                    </Text>
                    <Text numberOfLines={1} selectable style={styles.historyMediaMeta}>
                      {item.url}
                    </Text>
                  </View>
                  {historySelectionMode ? (
                    <View
                      style={[
                        styles.historySelectCircle,
                        selectedHistoryIds.includes(item.id) &&
                          styles.historySelectCircleActive,
                      ]}
                    >
                      {selectedHistoryIds.includes(item.id) ? (
                        <Icon name="check" style={styles.historySelectIcon} />
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.historyEmptyPanel}>
              <Text style={styles.sectionTitle}>还没有播放历史</Text>
              <Text style={styles.sectionHint}>
                播放一次点播剧集或点播直链后，这里会出现继续播放入口。
              </Text>
            </View>
          )}
          {historySelectionMode ? (
            <View style={styles.historyDeleteBar}>
              <Text style={styles.historyDeleteText}>
                已选择 {selectedHistoryIds.length} 条
              </Text>
              <CompactButton
                disabled={!selectedHistoryIds.length}
                onPress={() =>
                  deleteSelectedHistoryItems().catch(() =>
                    setMessage('删除播放历史失败')
                  )
                }
                variant="danger"
              >
                删除
              </CompactButton>
            </View>
          ) : null}
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
            <Icon name="shield" style={styles.settingsHeroIcon} />
            <Text style={styles.settingsHeroTitle}>私人 IPTV Pro</Text>
            <Text style={styles.settingsHeroState}>本机保存</Text>
          </View>
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>当前点播源</Text>
        </View>
        <View style={styles.settingsGroup}>
          <View style={styles.sourceAddressRow}>
            <View style={styles.rowMain}>
              <Text style={styles.sourceAddressName}>
                {selectedSite ? selectedSite.name : '未配置点播源'}
              </Text>
              <Text numberOfLines={2} selectable style={styles.sourceAddressUrl}>
                {configUrl || '填写源地址后会固定使用这一条源'}
              </Text>
            </View>
            <Text style={styles.rowAction}>
              {selectedSite ? '使用中' : '未启用'}
            </Text>
          </View>
          <Text style={styles.helperText}>
            当前版本按单源使用：导入新源会覆盖旧源，搜索页默认只搜索这一条源。
          </Text>
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>源地址</Text>
        </View>
        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>点播源接口</Text>
            <Text style={styles.sectionHint}>粘贴已验证可用的 CatVod/TVBox 地址</Text>
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
          </View>
          <CompactButton
            disabled={loadingConfig}
            onPress={() => {
              setConfigUrl(RECOMMENDED_CATVOD_SOURCE_URL);
              importConfigFromUrl(RECOMMENDED_CATVOD_SOURCE_URL).catch(() =>
                setMessage('CatVod 测试源导入失败')
              );
            }}
            variant="primary"
          >
            导入 CatVod 测试源
          </CompactButton>
          <Text style={styles.helperText}>
            推荐先使用已经验证可播放的 CatVod 源；如果更换源，保存后会直接替换当前点播源。
          </Text>
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>本地解析器</Text>
        </View>
        <View style={styles.settingsGroup}>
          <View style={styles.panelHeader}>
            <Text style={styles.sectionTitle}>本地解析器</Text>
            <Text style={styles.sectionHint}>用于解析 CatVod 插件源的搜索和播放地址</Text>
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setPluginServerUrl}
            placeholder={`本地解析器，例如 ${LOCAL_PARSER_HINT_URL}`}
            placeholderTextColor="#8d96a0"
            style={styles.input}
            value={pluginServerUrl}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPluginServerToken}
            placeholder="本地解析器 Token，可选"
            placeholderTextColor="#8d96a0"
            secureTextEntry
            style={styles.input}
            value={pluginServerToken}
          />
          <CompactButton
            onPress={() => {
              setPluginServerUrl(LOCAL_PARSER_HINT_URL);
              setPluginServerToken('');
              setPluginServerHealth(null);
              AsyncStorage.setItem(
                STORAGE_KEYS.pluginServerUrl,
                LOCAL_PARSER_HINT_URL
              ).catch(() => setMessage('本机解析器地址保存失败'));
              AsyncStorage.removeItem(STORAGE_KEYS.pluginServerToken).catch(() =>
                setMessage('本地解析器 Token 清理失败')
              );
              setMessage(`已填入本地解析器地址：${LOCAL_PARSER_HINT_URL}`);
            }}
            variant="plain"
          >
            使用本机解析器地址
          </CompactButton>
          <CompactButton
            onPress={() =>
              savePluginServerUrl().catch(() => setMessage('本地解析器保存失败'))
            }
            variant="secondary"
          >
            保存本地解析器
          </CompactButton>
          <View style={styles.buttonRow}>
            <CompactButton
              disabled={checkingPluginServer}
              onPress={() =>
                checkPluginServer().catch(() => setMessage('本地解析器检测失败'))
              }
              variant="plain"
            >
              {checkingPluginServer ? '检测中' : '检测解析服务'}
            </CompactButton>
          </View>
          {pluginServerHealth ? (
            <View style={styles.selectedSitePanel}>
              <Text style={styles.statusLabel}>连接状态</Text>
              <Text
                selectable
                style={[
                  styles.selectedSiteText,
                  pluginServerHealth.ok ? styles.successText : styles.warningText,
                ]}
              >
                {pluginServerHealth.message}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.settingsSectionLabelWrap}>
          <Text style={styles.settingsSectionLabel}>隐私说明</Text>
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
              editable={!loadingSearch}
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
            {searchHistory.length ? (
              <View style={styles.searchHistoryBlock}>
                <View style={styles.searchHistoryHeader}>
                  <Text style={styles.searchHistoryTitle}>搜索历史</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={loadingSearch}
                    onPress={() =>
                      clearSearchHistory().catch(() =>
                        setMessage('搜索历史清空失败')
                      )
                    }
                    style={({ pressed }) => [
                      styles.searchHistoryClear,
                      loadingSearch && styles.buttonDisabled,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.searchHistoryClearText}>清空</Text>
                  </Pressable>
                </View>
                <View style={styles.searchHistoryChips}>
                  {searchHistory.slice(0, 8).map((keyword) => (
                    <Pressable
                      accessibilityRole="button"
                      disabled={loadingSearch}
                      key={keyword}
                      onPress={() => {
                        setOverlayKeyword(keyword);
                        setSearchOverlayOpen(false);
                        setSearchKeyword(keyword);
                        setActivePage('searchResults');
                        setActiveTab('discover');
                        searchWithKeyword(keyword).catch(() =>
                          setMessage('搜索失败')
                        );
                      }}
                      style={({ pressed }) => [
                        styles.searchHistoryChip,
                        loadingSearch && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text numberOfLines={1} style={styles.searchHistoryChipText}>
                        {keyword}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
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
            <Icon name="back" style={styles.searchBackText} />
          </Pressable>
          <TextInput
            autoCorrect={false}
            editable={!loadingSearch}
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
          {searchKeyword ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingSearch}
              onPress={() => {
                setSearchKeyword('');
                setOverlayKeyword('');
                setSearchResults([]);
                setSearchFailures([]);
                setActiveSearchBucketId('all');
                setMessage('已清空搜索');
              }}
              style={({ pressed }) => [
                styles.searchSourceButton,
                loadingSearch && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.searchClearText}>清空</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={loadingSearch}
            onPress={() => setSourceFilterOpen(true)}
            style={({ pressed }) => [
              styles.searchSourceButton,
              loadingSearch && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Icon name="sliders" style={styles.searchSourceButtonText} />
          </Pressable>
        </View>

        <View style={styles.searchPageBody}>
          <View style={styles.searchPageRail}>
            {renderSearchSourceRail()}
          </View>
          <ScrollView
            contentContainerStyle={styles.searchPageResults}
            showsVerticalScrollIndicator={false}
            style={styles.searchResultPane}
          >
            {loadingSearch ? (
              <View style={styles.loadingStatePanel}>
                <ActivityIndicator color="#2f80ed" />
                <Text style={styles.loadingStateTitle}>正在搜索真实来源</Text>
                <Text selectable style={styles.loadingStateText}>
                  {message || buildSearchLoadingMessage({ targetCount: activeSearchTargetCount })}
                </Text>
              </View>
            ) : null}
            {searchResults.length || searchFailures.length ? (
              <>
                {searchResults.length ? renderVodResultGrid(vodResultCards) : null}
                {searchFailures.length ? (
                  <View style={styles.searchFailurePanel}>
                    <Text style={styles.searchFailureTitle}>失败来源</Text>
                    {searchFailures.map((failure) => (
                      <View
                        key={`${failure.sourceId}-${failure.sourceName}`}
                        style={styles.searchFailureItem}
                      >
                        <Text numberOfLines={1} style={styles.searchFailureName}>
                          {failure.sourceName || failure.sourceId || '未知来源'}
                        </Text>
                        <Text selectable style={styles.searchFailureMessage}>
                          {failure.message || '搜索失败'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              !loadingSearch ? (
                <View style={styles.searchEmptyState}>
                  <Text style={styles.sectionTitle}>输入关键词开始搜索</Text>
                  <Text style={styles.sectionHint}>
                    默认搜索全部可用来源，可在右上角筛选配置源。
                  </Text>
                </View>
              ) : null
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
            默认搜索全部可用来源；取消勾选后只搜索保留的来源。
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
                    disabled={loadingSearch}
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
                      loadingSearch && styles.buttonDisabled,
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

  function renderPosterDetailPage() {
    const playGroups = selectedDetail?.playGroups || [];
    const primaryGroup = playGroups[0];
    const primaryEpisode = primaryGroup?.episodes?.[0];

    return (
      <ScrollView
        contentContainerStyle={styles.detailPageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHero}>
          {selectedPosterDetail.heroImage ? (
            <Image
              resizeMode="cover"
              source={{ uri: selectedPosterDetail.heroImage }}
              style={styles.detailHeroImage}
            />
          ) : (
            <View style={styles.detailHeroFallback}>
              <Text style={styles.detailHeroFallbackText}>
                {selectedPosterDetail.title.slice(0, 1)}
              </Text>
            </View>
          )}
          <View style={styles.detailHeroShade} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setActivePage('searchResults');
              setLoadingDetailId('');
            }}
            style={({ pressed }) => [
              styles.detailBackButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Icon name="back" style={styles.detailBackText} />
          </Pressable>
        </View>

        <View style={styles.detailBody}>
          <Text numberOfLines={2} style={styles.detailTitle}>
            {selectedPosterDetail.title}
          </Text>
          {selectedPosterDetail.metaLine ? (
            <Text numberOfLines={1} style={styles.detailMeta}>
              {selectedPosterDetail.metaLine}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={
              !primaryGroup ||
              !primaryEpisode ||
              Boolean(loadingEpisodeKey) ||
              Boolean(loadingDetailId)
            }
            onPress={() =>
              playEpisode(primaryGroup, primaryEpisode, 0).catch(() =>
                setMessage('播放地址解析失败')
              )
            }
            style={({ pressed }) => [
              styles.detailPlayButton,
              (!primaryGroup || !primaryEpisode) && styles.buttonDisabled,
              (loadingEpisodeKey || loadingDetailId) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {loadingEpisodeKey ? (
              <ActivityIndicator color="#050505" />
            ) : (
              <Icon name="play" style={styles.detailPlayIcon} />
            )}
            <View>
              <Text style={styles.detailPlayTitle}>
                {loadingDetailId ? '加载中' : loadingEpisodeKey ? '解析中' : '播放'}
              </Text>
              <Text numberOfLines={1} style={styles.detailPlaySubtitle}>
                {primaryEpisode?.name || selectedPosterDetail.remarks || '暂无播放项'}
              </Text>
            </View>
          </Pressable>

          <View style={styles.detailActionRow}>
            <Icon name="search" style={styles.detailActionIcon} />
            <Icon name="favorite" style={styles.detailActionIcon} />
            <Icon name="more" style={styles.detailActionIcon} />
          </View>

          <Text numberOfLines={4} style={styles.detailDescription}>
            {loadingDetailId ? '正在读取详情和播放列表...' : selectedPosterDetail.description}
          </Text>

          <View style={styles.detailLineHeader}>
            <Text style={styles.detailLineTitle}>
              {selectedPosterDetail.sourceName}
            </Text>
            <Icon name="chevronDown" style={styles.detailLineArrow} />
          </View>

          {playGroups.length ? (
            <View style={styles.detailPlayGroups}>
              {playGroups.map((group) => (
                <View key={group.name} style={styles.detailPlayGroup}>
                  <Text style={styles.detailGroupTitle}>{group.name}</Text>
                  <View style={styles.detailEpisodeGrid}>
                    {group.episodes.map((episode, episodeIndex) => {
                      const episodeKey = `${group.name}-${episodeIndex}-${episode.name}`;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          disabled={Boolean(loadingEpisodeKey) || Boolean(loadingDetailId)}
                          key={episodeKey}
                          onPress={() =>
                            playEpisode(group, episode, episodeIndex).catch(() =>
                              setMessage('播放地址解析失败')
                            )
                          }
                          style={({ pressed }) => [
                            styles.detailEpisodeButton,
                            loadingEpisodeKey === episodeKey &&
                              styles.detailEpisodeButtonLoading,
                            (loadingEpisodeKey || loadingDetailId) &&
                              loadingEpisodeKey !== episodeKey &&
                              styles.buttonDisabled,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          {loadingEpisodeKey === episodeKey ? (
                            <View style={styles.episodeLoadingInline}>
                              <ActivityIndicator color="#ffffff" />
                              <Text numberOfLines={1} style={styles.detailEpisodeTitle}>
                                解析中
                              </Text>
                            </View>
                          ) : (
                            <Text numberOfLines={1} style={styles.detailEpisodeTitle}>
                              {episode.name}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.detailEmptyEpisodes}>
              <Text style={styles.detailEmptyTitle}>
                {loadingDetailId ? '正在加载播放项' : '暂无可播放列表'}
              </Text>
              <Text style={styles.detailEmptyText}>{message}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  function renderPlayerLayer() {
    if (!playerLayerOpen) {
      return null;
    }

    return (
      <View style={styles.playerLayer}>
        <StatusBar style="light" />
        <View style={styles.playerLayerTop}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPlayerLayerOpen(false)}
            style={({ pressed }) => [
              styles.playerCloseButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Icon name="back" style={styles.playerCloseText} />
          </Pressable>
          <View style={styles.playerLayerTitleWrap}>
            <Text numberOfLines={1} style={styles.playerLayerTitle}>
              {playerLayerTitle || '正在播放'}
            </Text>
            <Text numberOfLines={1} style={styles.playerLayerSource}>
              {playerLayerSource || currentLabel}
            </Text>
          </View>
        </View>
        <View style={styles.playerLandscapeFrame}>
          {currentUrl ? (
            <VideoView
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
              nativeControls
              player={player}
              style={styles.playerLandscapeVideo}
            />
          ) : (
            <View style={styles.playerEmptyFrame}>
              <Text style={styles.playerEmptyText}>暂无播放地址</Text>
            </View>
          )}
        </View>
        <Text selectable style={styles.playerLayerStatus}>
          {message}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        activeTab === 'settings' && styles.settingsRoot,
        activePage === 'searchResults' && styles.searchPageRoot,
        activePage === 'detail' && styles.detailPageRoot,
      ]}
    >
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.keyboardRoot}
      >
        <View style={styles.appShell}>
          {activePage === 'detail' ? (
            renderPosterDetailPage()
          ) : activePage === 'searchResults' ? (
            renderSearchResultsPage()
          ) : (
            <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              {activeTab === 'discover' ? (
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
                    <Icon name="settings" style={styles.circleButtonText} />
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
                    <Icon name="search" style={styles.circleButtonText} />
                  </Pressable>
                </View>
              </View>
              ) : null}
              {activeTab === 'settings' || activeTab === 'watching' ? (
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>{activeTabMeta.label}</Text>
                  <Text style={styles.subtitle}>{activeTabMeta.description}</Text>
                </View>
              ) : null}
            </View>

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
      {renderPlayerLayer()}
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
            <Icon
              name={tab.icon}
              style={[
                styles.bottomTabSymbol,
                isActive && styles.bottomTabSymbolActive,
              ]}
            />
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

function Icon({ name, style }) {
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const color = flattenedStyle.color || COLORS.ink;
  const size = flattenedStyle.fontSize || flattenedStyle.width || 24;

  return (
    <View
      style={[
        styles.icon,
        {
          height: size,
          width: size,
        },
      ]}
      pointerEvents="none"
    >
      {renderIconShape(name, color)}
    </View>
  );
}

function renderIconShape(name, color) {
  switch (name) {
    case 'back':
      return (
        <View style={styles.iconBack}>
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconBackTop]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconBackBottom]} />
        </View>
      );
    case 'check':
      return (
        <View style={styles.iconCheck}>
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconCheckShort]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconCheckLong]} />
        </View>
      );
    case 'chevronDown':
      return (
        <View style={styles.iconChevron}>
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconChevronLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconChevronRight]} />
        </View>
      );
    case 'chevronUp':
      return (
        <View style={styles.iconChevron}>
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconChevronUpLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconChevronUpRight]} />
        </View>
      );
    case 'favorite':
      return (
        <View style={styles.iconFavorite}>
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconFavoriteLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconFavoriteRight]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconFavoriteBottomLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconFavoriteBottomRight]} />
        </View>
      );
    case 'history':
      return (
        <View style={styles.iconHistory}>
          <View style={[styles.iconHistoryRing, { borderColor: color }]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconHistoryHand]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconHistoryNeedle]} />
        </View>
      );
    case 'more':
      return (
        <View style={styles.iconMore}>
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
        </View>
      );
    case 'play':
      return <View style={[styles.iconPlayTriangle, { borderLeftColor: color }]} />;
    case 'search':
      return (
        <View style={styles.iconSearch}>
          <View style={[styles.iconSearchRing, { borderColor: color }]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconSearchHandle]} />
        </View>
      );
    case 'settings':
      return (
        <View style={styles.iconSettings}>
          <View style={[styles.iconSettingsRing, { borderColor: color }]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconSettingsTop]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconSettingsRight]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconSettingsBottom]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconSettingsLeft]} />
        </View>
      );
    case 'shield':
      return (
        <View style={styles.iconShield}>
          <View style={[styles.iconShieldTop, { borderColor: color }]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconShieldLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconShieldRight]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconShieldBottomLeft]} />
          <View style={[styles.iconLine, { backgroundColor: color }, styles.iconShieldBottomRight]} />
        </View>
      );
    case 'sliders':
      return (
        <View style={styles.iconSliders}>
          <View style={[styles.iconSliderLine, { backgroundColor: color }]}>
            <View style={[styles.iconSliderKnobLeft, { backgroundColor: color }]} />
          </View>
          <View style={[styles.iconSliderLine, { backgroundColor: color }]}>
            <View style={[styles.iconSliderKnobRight, { backgroundColor: color }]} />
          </View>
        </View>
      );
    default:
      return null;
  }
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

function SourceList({
  onDeleteSource,
  onMakeDefault,
  onRenameSource,
  onVerifyPlugin,
  renamingSourceId,
  renamingSourceText,
  selectedSiteId,
  setRenamingSourceId,
  setRenamingSourceText,
  sites,
  sources,
  verifyingPlugin,
}) {
  if (!sources.length) {
    return null;
  }

  return (
    <View style={styles.sourceList}>
      {sources.map((source) => {
        const isRenaming = renamingSourceId === source.id;
        const status = buildSourceStatus({
          selectedSiteId,
          source,
          sites,
        });

        return (
          <View key={source.id} style={styles.sourceManageCard}>
            <View style={styles.sourceManageTop}>
              <View style={styles.rowMain}>
                {isRenaming ? (
                  <TextInput
                    autoCorrect={false}
                    onChangeText={setRenamingSourceText}
                    onSubmitEditing={() => onRenameSource(source.id)}
                    placeholder="新的源名称"
                    placeholderTextColor="#8d96a0"
                    returnKeyType="done"
                    style={styles.sourceRenameInput}
                    value={renamingSourceText}
                  />
                ) : (
                  <Text style={styles.rowTitle}>{source.name}</Text>
                )}
                <Text numberOfLines={1} selectable style={styles.rowMeta}>
                  {source.url}
                </Text>
                <Text style={styles.sourceStatusText}>
                  {status.isDefault ? '默认 · ' : ''}
                  {status.label} · {status.searchableCount}/{status.siteCount} 可用
                </Text>
              </View>
              <Text
                style={[
                  styles.badge,
                  status.tone !== 'ready' && styles.badgeMuted,
                ]}
              >
                {source.kind === 'plugin' ? '插件源' : '配置'}
              </Text>
            </View>

            <View style={styles.sourceActionRow}>
              {isRenaming ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onRenameSource(source.id)}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      styles.miniActionPrimary,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.miniActionTextPrimary}>保存</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setRenamingSourceId('');
                      setRenamingSourceText('');
                    }}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.miniActionText}>取消</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={status.isDefault || !status.searchableCount}
                    onPress={() => onMakeDefault(source)}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      (status.isDefault || !status.searchableCount) &&
                        styles.buttonDisabled,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.miniActionText}>
                      {status.isDefault ? '已默认' : '默认'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setRenamingSourceId(source.id);
                      setRenamingSourceText(source.name || '');
                    }}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.miniActionText}>重命名</Text>
                  </Pressable>
                  {source.kind === 'plugin' && onVerifyPlugin ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={verifyingPlugin}
                      onPress={() => onVerifyPlugin(source)}
                      style={({ pressed }) => [
                        styles.miniActionButton,
                        styles.miniActionBlue,
                        verifyingPlugin && styles.buttonDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.miniActionTextBlue}>
                        {verifyingPlugin ? '验证中' : '验证'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onDeleteSource(source)}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      styles.miniActionDanger,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.miniActionTextDanger}>删除</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        );
      })}
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

function buildSearchMessage({ failureCount = 0, resultCount = 0, targetCount = 0 } = {}) {
  if (!targetCount) {
    return '没有可搜索的来源，请先导入 CatVod 插件源或可用配置';
  }

  if (resultCount > 0 && failureCount > 0) {
    return `找到 ${resultCount} 个结果，${failureCount} 个来源暂不可用`;
  }

  if (resultCount > 0) {
    return `找到 ${resultCount} 个结果`;
  }

  if (failureCount > 0) {
    return `${failureCount} 个来源暂不可用，没有搜索结果`;
  }

  return '没有搜索结果';
}

function buildSearchProgressMessage({
  completedCount = 0,
  failureCount = 0,
  resultCount = 0,
  targetCount = 0,
} = {}) {
  if (!targetCount) {
    return '正在搜索真实来源';
  }

  if (resultCount > 0) {
    return `已返回 ${resultCount} 个结果，正在搜索 ${completedCount}/${targetCount} 个来源`;
  }

  if (failureCount > 0) {
    return `已有 ${failureCount} 个来源暂不可用，正在搜索 ${completedCount}/${targetCount} 个来源`;
  }

  return `正在搜索 ${completedCount}/${targetCount} 个来源`;
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
  return LABELS[type] || '播放历史';
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
    backgroundColor: COLORS.white,
    flex: 1,
  },
  settingsRoot: {
    backgroundColor: COLORS.page,
  },
  searchPageRoot: {
    backgroundColor: COLORS.white,
  },
  detailPageRoot: {
    backgroundColor: '#160f0f',
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
    gap: 10,
    padding: 14,
    paddingBottom: 118,
    paddingTop: COMPACT_TOP_PADDING,
  },
  header: {
    gap: 10,
  },
  topChrome: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    zIndex: 40,
  },
  sourceSelectorWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 50,
  },
  sourcePill: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  sourceIcon: {
    color: COLORS.blue,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandText: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceMeta: {
    color: COLORS.muted,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  sourceMenu: {
    ...GLASS_PANEL_STYLE,
    borderRadius: 26,
    left: 0,
    maxHeight: 520,
    overflow: 'hidden',
    position: 'absolute',
    top: 48,
    width: 245,
    zIndex: 60,
  },
  sourceMenuScroll: {
    maxHeight: 520,
  },
  sourceMenuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minHeight: 39,
    paddingHorizontal: 14,
  },
  sourceMenuItemActive: {
    ...GLASS_ACTIVE_OUTLINE_STYLE,
  },
  sourceMenuCheck: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    width: 16,
  },
  sourceMenuText: {
    color: COLORS.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  circleButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  circleButtonText: {
    color: COLORS.ink,
    fontSize: 21,
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
    ...GLASS_PANEL_STYLE,
    alignItems: 'center',
    borderRadius: 18,
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
    ...GLASS_PANEL_STYLE,
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    padding: 12,
  },
  idleStatusIconWrap: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
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
    marginHorizontal: -14,
  },
  discoverModeRow: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 14,
  },
  discoverModeButton: {
    justifyContent: 'center',
    minHeight: 32,
  },
  discoverModeButtonActive: {},
  discoverModeText: {
    color: COLORS.muted,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
  },
  discoverModeTextActive: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  discoverFeed: {
    gap: 10,
  },
  discoverFilterStack: {
    gap: 7,
  },
  discoverFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  filterLabelPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  filterLabelText: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  homeFilterChip: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 8,
  },
  homeFilterChipActive: {
    borderColor: 'rgba(47, 125, 246, 0.48)',
  },
  homeFilterChipText: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  homeFilterChipTextActive: {
    color: COLORS.blue,
  },
  discoverPosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  discoverPosterCard: {
    gap: 5,
    width: '31.4%',
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
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 16,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 18,
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
    ...GLASS_BUTTON_STYLE,
    borderRadius: 11,
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
    ...GLASS_PANEL_STYLE,
    borderRadius: 20,
    gap: 11,
    padding: 14,
  },
  settingsGroup: {
    ...GLASS_PANEL_STYLE,
    borderRadius: 17,
    gap: 12,
    padding: 14,
  },
  settingsHero: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 23,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingsHeroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 36,
  },
  settingsHeroIcon: {
    color: COLORS.blue,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  settingsHeroTitle: {
    color: COLORS.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  settingsHeroState: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  settingsSectionLabelWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  settingsSectionLabel: {
    color: COLORS.muted,
    fontSize: 15,
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
    color: COLORS.blue,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceAddressUrl: {
    color: COLORS.muted,
    fontSize: 12,
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
    ...GLASS_INPUT_STYLE,
    borderRadius: 14,
    color: COLORS.ink,
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
    ...GLASS_INPUT_STYLE,
    borderRadius: 16,
    color: COLORS.ink,
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
    ...GLASS_BUTTON_STYLE,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 13,
  },
  filterChipActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  filterChipText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  filterChipTextActive: {
    color: COLORS.blue,
  },
  emptyText: {
    color: '#8e8e93',
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 19,
  },
  loadingStatePanel: {
    ...GLASS_PANEL_STYLE,
    alignItems: 'flex-start',
    borderRadius: 20,
    gap: 7,
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 88,
    padding: 14,
    width: '100%',
  },
  loadingStateTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  loadingStateText: {
    color: '#8e8e93',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
  },
  compactButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
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
    borderColor: 'rgba(52, 199, 89, 0.48)',
  },
  secondaryButton: {
    backgroundColor: '#ff9500',
    borderColor: 'rgba(255, 149, 0, 0.48)',
  },
  accentButton: {
    backgroundColor: 'rgba(47, 125, 246, 0.22)',
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  compactButtonText: {
    color: COLORS.blue,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  plainButtonText: {
    color: COLORS.ink,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  icon: {
    alignItems: 'center',
    flexShrink: 0,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  iconLine: {
    borderRadius: 999,
    height: 2.2,
    position: 'absolute',
  },
  iconBack: {
    height: 24,
    width: 24,
  },
  iconBackTop: {
    left: 5,
    top: 7,
    transform: [{ rotate: '-42deg' }],
    width: 13,
  },
  iconBackBottom: {
    left: 5,
    top: 15,
    transform: [{ rotate: '42deg' }],
    width: 13,
  },
  iconCheck: {
    height: 24,
    width: 24,
  },
  iconCheckShort: {
    left: 5,
    top: 13,
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
  iconCheckLong: {
    left: 10,
    top: 11,
    transform: [{ rotate: '-45deg' }],
    width: 12,
  },
  iconChevron: {
    height: 24,
    width: 24,
  },
  iconChevronLeft: {
    left: 6,
    top: 11,
    transform: [{ rotate: '42deg' }],
    width: 8,
  },
  iconChevronRight: {
    right: 6,
    top: 11,
    transform: [{ rotate: '-42deg' }],
    width: 8,
  },
  iconChevronUpLeft: {
    left: 6,
    top: 11,
    transform: [{ rotate: '-42deg' }],
    width: 8,
  },
  iconChevronUpRight: {
    right: 6,
    top: 11,
    transform: [{ rotate: '42deg' }],
    width: 8,
  },
  iconFavorite: {
    height: 24,
    width: 24,
  },
  iconFavoriteLeft: {
    left: 6,
    top: 7,
    transform: [{ rotate: '-28deg' }],
    width: 8,
  },
  iconFavoriteRight: {
    right: 6,
    top: 7,
    transform: [{ rotate: '28deg' }],
    width: 8,
  },
  iconFavoriteBottomLeft: {
    left: 8,
    top: 13,
    transform: [{ rotate: '46deg' }],
    width: 9,
  },
  iconFavoriteBottomRight: {
    right: 8,
    top: 13,
    transform: [{ rotate: '-46deg' }],
    width: 9,
  },
  iconHistory: {
    height: 24,
    width: 24,
  },
  iconHistoryRing: {
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    left: 4,
    position: 'absolute',
    top: 4,
    width: 16,
  },
  iconHistoryHand: {
    left: 11,
    top: 8,
    transform: [{ rotate: '90deg' }],
    width: 6,
  },
  iconHistoryNeedle: {
    left: 11,
    top: 11,
    width: 6,
  },
  iconMore: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  iconDot: {
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  iconPlayTriangle: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderTopWidth: 7,
    height: 0,
    marginLeft: 3,
    width: 0,
  },
  iconSearch: {
    height: 24,
    width: 24,
  },
  iconSearchRing: {
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    left: 4,
    position: 'absolute',
    top: 4,
    width: 14,
  },
  iconSearchHandle: {
    left: 15,
    top: 16,
    transform: [{ rotate: '45deg' }],
    width: 8,
  },
  iconSettings: {
    height: 24,
    width: 24,
  },
  iconSettingsRing: {
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    left: 7,
    position: 'absolute',
    top: 7,
    width: 10,
  },
  iconSettingsTop: {
    left: 10,
    top: 3,
    width: 4,
  },
  iconSettingsRight: {
    right: 3,
    top: 11,
    width: 4,
  },
  iconSettingsBottom: {
    bottom: 3,
    left: 10,
    width: 4,
  },
  iconSettingsLeft: {
    left: 3,
    top: 11,
    width: 4,
  },
  iconShield: {
    height: 24,
    width: 24,
  },
  iconShieldTop: {
    borderLeftWidth: 2,
    borderRadius: 4,
    borderRightWidth: 2,
    borderTopWidth: 2,
    height: 8,
    left: 6,
    position: 'absolute',
    top: 4,
    width: 12,
  },
  iconShieldLeft: {
    left: 6,
    top: 10,
    transform: [{ rotate: '75deg' }],
    width: 10,
  },
  iconShieldRight: {
    right: 6,
    top: 10,
    transform: [{ rotate: '-75deg' }],
    width: 10,
  },
  iconShieldBottomLeft: {
    left: 8,
    top: 16,
    transform: [{ rotate: '42deg' }],
    width: 6,
  },
  iconShieldBottomRight: {
    right: 8,
    top: 16,
    transform: [{ rotate: '-42deg' }],
    width: 6,
  },
  iconSliders: {
    gap: 7,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  iconSliderLine: {
    borderRadius: 999,
    height: 2.2,
    position: 'relative',
    width: 20,
  },
  iconSliderKnobLeft: {
    borderRadius: 4,
    height: 8,
    left: 3,
    position: 'absolute',
    top: -3,
    width: 8,
  },
  iconSliderKnobRight: {
    borderRadius: 4,
    height: 8,
    position: 'absolute',
    right: 3,
    top: -3,
    width: 8,
  },
  cardDisabled: {
    opacity: 0.42,
  },
  searchSplit: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  searchPage: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: TOP_SAFE_PADDING,
  },
  searchPageTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingBottom: 12,
  },
  searchBackButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchBackText: {
    color: COLORS.ink,
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
  },
  searchPageInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderColor: 'rgba(229, 231, 235, 0.82)',
    borderRadius: 21,
    borderWidth: 1,
    color: COLORS.ink,
    flex: 1,
    fontSize: 15,
    letterSpacing: 0,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  searchSourceButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchSourceButtonText: {
    color: COLORS.ink,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchClearText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchPageBody: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  searchPageRail: {
    width: 104,
  },
  searchPageResults: {
    flexGrow: 1,
    paddingBottom: 40,
    width: '100%',
  },
  searchEmptyState: {
    ...GLASS_PANEL_STYLE,
    borderRadius: 18,
    gap: 6,
    padding: 16,
    paddingTop: 36,
  },
  searchFailurePanel: {
    ...GLASS_PANEL_STYLE,
    borderRadius: 18,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  searchFailureTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchFailureItem: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 14,
    gap: 4,
    padding: 10,
  },
  searchFailureName: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchFailureMessage: {
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  searchRail: {
    maxHeight: 560,
    width: 104,
  },
  searchRailContent: {
    gap: 8,
    paddingBottom: 12,
  },
  searchRailItem: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    minHeight: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  searchRailItemActive: {
    backgroundColor: COLORS.blue,
  },
  searchRailItemFailed: {
    opacity: 0.58,
  },
  searchRailLabel: {
    color: '#111827',
    flex: 1,
    fontSize: 12,
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
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    color: COLORS.blue,
  },
  searchResultPane: {
    flex: 1,
    minWidth: 0,
  },
  sourceFilterSheet: {
    backgroundColor: COLORS.page,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    bottom: 0,
    boxShadow: '0 -18px 54px rgba(0, 0, 0, 0.18)',
    gap: 14,
    left: 0,
    maxHeight: '90%',
    minHeight: '72%',
    padding: 20,
    position: 'absolute',
    right: 0,
  },
  sourceFilterList: {
    gap: 9,
    paddingBottom: 8,
  },
  sourceFilterItem: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  sourceFilterItemActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
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
  detailPageContent: {
    backgroundColor: '#160f0f',
    minHeight: '100%',
    paddingBottom: 46,
  },
  detailHero: {
    height: 520,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  detailHeroImage: {
    height: '100%',
    width: '100%',
  },
  detailHeroFallback: {
    alignItems: 'center',
    backgroundColor: '#2f2424',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  detailHeroFallbackText: {
    color: '#ffffff',
    fontSize: 92,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailHeroShade: {
    backgroundColor: 'rgba(22, 15, 15, 0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  detailBackButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    height: 40,
    justifyContent: 'center',
    left: 14,
    position: 'absolute',
    top: TOP_SAFE_PADDING,
    width: 40,
  },
  detailBackText: {
    color: COLORS.ink,
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 34,
  },
  detailBody: {
    gap: 22,
    marginTop: -136,
    paddingHorizontal: 22,
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 50,
    textAlign: 'center',
  },
  detailMeta: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  detailPlayButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    minHeight: 74,
    paddingHorizontal: 34,
    width: '96%',
  },
  detailPlayIcon: {
    color: '#050505',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailPlayTitle: {
    color: '#050505',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailPlaySubtitle: {
    color: '#4b5563',
    fontSize: 16,
    letterSpacing: 0,
    maxWidth: 260,
  },
  detailActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 66,
  },
  detailActionIcon: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: 0,
  },
  detailDescription: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 25,
  },
  detailLineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  detailLineTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailLineArrow: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailPlayGroups: {
    gap: 18,
  },
  detailPlayGroup: {
    gap: 12,
  },
  detailGroupTitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  detailEpisodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailEpisodeButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 74,
    paddingHorizontal: 16,
    width: '47.8%',
  },
  detailEpisodeButtonLoading: {
    backgroundColor: 'rgba(47, 128, 237, 0.56)',
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  detailEpisodeTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  episodeLoadingInline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  detailEmptyEpisodes: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 18,
    gap: 6,
    padding: 16,
  },
  detailEmptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  detailEmptyText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
  },
  playerLayer: {
    backgroundColor: '#050505',
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: TOP_SAFE_PADDING,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 120,
  },
  playerLayerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
  },
  playerCloseButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  playerCloseText: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '300',
    lineHeight: 45,
  },
  playerLayerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  playerLayerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  playerLayerSource: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  playerLandscapeFrame: {
    ...GLASS_PANEL_STYLE,
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 24,
    overflow: 'hidden',
    width: '100%',
  },
  playerLandscapeVideo: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
  playerEmptyFrame: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    width: '100%',
  },
  playerEmptyText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  playerLayerStatus: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 16,
  },
  listStack: {
    gap: 18,
  },
  historyTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 8,
  },
  historyPill: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 21,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  historyPillAction: {
    justifyContent: 'center',
  },
  historyPillActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  historyPillIcon: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  historyPillText: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  watchingQuickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  watchingStatPill: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 16,
    flex: 1,
    gap: 2,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  watchingStatValue: {
    color: COLORS.blue,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: 0,
  },
  watchingStatLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  historyActionRow: {
    flexDirection: 'row',
    gap: 9,
  },
  historyListSection: {
    gap: 12,
  },
  historyMediaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderRadius: 14,
    gap: 12,
    minHeight: 136,
    padding: 4,
    position: 'relative',
  },
  historyMediaRowSelected: {
    backgroundColor: 'rgba(47, 125, 246, 0.08)',
  },
  historyPosterBox: {
    alignItems: 'center',
    backgroundColor: '#dfe3ea',
    borderRadius: 6,
    height: 134,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 91,
  },
  historyPosterInitial: {
    color: '#7b8492',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  historyMediaTitle: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 21,
    marginTop: 4,
  },
  historyMediaMeta: {
    color: COLORS.muted,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
  },
  historySelectCircle: {
    alignItems: 'center',
    borderColor: COLORS.muted,
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 1,
    top: 58,
    width: 22,
  },
  historySelectCircleActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  historySelectIcon: {
    color: COLORS.white,
    height: 15,
    width: 15,
  },
  historyDeleteBar: {
    ...GLASS_PANEL_STYLE,
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  historyDeleteText: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  historyEmptyPanel: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 18,
    gap: 6,
    padding: 16,
  },
  listRow: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    padding: 13,
  },
  listRowActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  resultRow: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 12,
  },
  resultRowActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  vodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    width: '100%',
  },
  vodCard: {
    gap: 7,
    width: '48.2%',
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
  posterLoadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
    ...GLASS_PANEL_STYLE,
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
    ...GLASS_BUTTON_STYLE,
    borderRadius: 11,
    justifyContent: 'center',
    maxWidth: 132,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  siteChipActive: {
    borderColor: 'rgba(47, 125, 246, 0.52)',
  },
  siteChipText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  siteChipTextActive: {
    color: COLORS.blue,
  },
  selectedSiteText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectedDetailPanel: {
    ...GLASS_PANEL_STYLE,
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
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
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
    ...GLASS_PANEL_STYLE,
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
    ...GLASS_BUTTON_STYLE,
    borderRadius: 14,
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
  sourceManageCard: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 18,
    gap: 10,
    padding: 12,
  },
  sourceManageTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sourceStatusText: {
    color: '#2f80ed',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sourceActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceRenameInput: {
    ...GLASS_INPUT_STYLE,
    borderRadius: 12,
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  miniActionButton: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 11,
  },
  miniActionPrimary: {
    backgroundColor: 'rgba(52, 199, 89, 0.18)',
    borderColor: 'rgba(52, 199, 89, 0.48)',
  },
  miniActionBlue: {
    backgroundColor: 'rgba(47, 125, 246, 0.18)',
    borderColor: 'rgba(47, 125, 246, 0.48)',
  },
  miniActionDanger: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderColor: 'rgba(255, 59, 48, 0.38)',
  },
  miniActionText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  miniActionTextPrimary: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  miniActionTextBlue: {
    color: '#1769d7',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  miniActionTextDanger: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sourceRow: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
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
    ...GLASS_NAV_STYLE,
    alignItems: 'center',
    borderRadius: 37,
    bottom: 11,
    flexDirection: 'row',
    gap: 4,
    left: 44,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 5,
    position: 'absolute',
    right: 44,
  },
  bottomTab: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 62,
  },
  bottomTabActive: {
    ...GLASS_ACTIVE_OUTLINE_STYLE,
  },
  bottomTabSymbol: {
    color: COLORS.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 27,
  },
  bottomTabSymbolActive: {
    color: COLORS.blue,
  },
  bottomTabText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  bottomTabTextActive: {
    color: COLORS.blue,
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
    backgroundColor: COLORS.page,
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
    ...GLASS_INPUT_STYLE,
    borderRadius: 19,
    color: COLORS.ink,
    fontSize: 18,
    letterSpacing: 0,
    minHeight: 54,
    paddingHorizontal: 18,
  },
  searchHistoryBlock: {
    gap: 10,
  },
  searchHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchHistoryTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchHistoryClear: {
    ...GLASS_BUTTON_STYLE,
    alignItems: 'center',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  searchHistoryClearText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  searchHistoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  searchHistoryChip: {
    ...GLASS_BUTTON_STYLE,
    borderRadius: 16,
    maxWidth: '48%',
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  searchHistoryChipText: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
