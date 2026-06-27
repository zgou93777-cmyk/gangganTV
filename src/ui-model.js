const DEFAULT_TAB_ID = 'discover';

const APP_TABS = [
  {
    id: 'discover',
    label: '发现',
    description: '播放、直播列表和搜索入口',
  },
  {
    id: 'watching',
    label: '追剧',
    description: '最近播放和本机保存状态',
  },
  {
    id: 'settings',
    label: '设置',
    description: '配置接口、站点和隐私说明',
  },
];

function getTabById(id) {
  return APP_TABS.find((tab) => tab.id === id) || APP_TABS[0];
}

function buildWatchingSummary({
  liveChannels = [],
  configSources = [],
  sites = [],
  playHistory = [],
  currentUrl = '',
} = {}) {
  return {
    hasCurrentUrl: Boolean(currentUrl),
    liveChannelCount: liveChannels.length,
    configSourceCount: configSources.length,
    playHistoryCount: playHistory.length,
    siteCount: sites.length,
  };
}

module.exports = {
  APP_TABS,
  DEFAULT_TAB_ID,
  buildWatchingSummary,
  getTabById,
};
