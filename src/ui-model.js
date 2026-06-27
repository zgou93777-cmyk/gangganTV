const DEFAULT_TAB_ID = 'discover';

const APP_TABS = [
  {
    id: 'discover',
    label: '发现',
    description: '播放、直播列表和搜索入口',
    symbol: '▶',
  },
  {
    id: 'watching',
    label: '追剧',
    description: '最近播放和本机保存状态',
    symbol: '♥',
  },
  {
    id: 'settings',
    label: '设置',
    description: '配置接口、站点和隐私说明',
    symbol: '⚙',
  },
];

const DISCOVER_MODES = [
  {
    id: 'all',
    label: '热门内容',
  },
  {
    id: 'live',
    label: '直播频道',
  },
  {
    id: 'vod',
    label: '点播搜索',
  },
  {
    id: 'direct',
    label: '直链播放',
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

function buildLiveChannelGroups(channels = []) {
  const counts = new Map();

  channels.forEach((channel) => {
    const group = normalizeLiveGroup(channel?.group);
    counts.set(group, (counts.get(group) || 0) + 1);
  });

  return [
    {
      id: 'all',
      label: '全部',
      count: channels.length,
    },
    ...Array.from(counts.entries()).map(([group, count]) => ({
      id: group,
      label: group,
      count,
    })),
  ];
}

function filterLiveChannels(channels = [], { keyword = '', group = 'all' } = {}) {
  const cleanKeyword = String(keyword).trim().toLowerCase();
  const cleanGroup = group || 'all';

  return channels.filter((channel) => {
    const channelGroup = normalizeLiveGroup(channel?.group);
    const matchesGroup = cleanGroup === 'all' || channelGroup === cleanGroup;

    if (!matchesGroup) {
      return false;
    }

    if (!cleanKeyword) {
      return true;
    }

    const haystack = [
      channel?.name,
      channel?.group,
      channel?.url,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(cleanKeyword);
  });
}

function buildVodResultCards(results = []) {
  return results.map((result, index) => ({
    id: readableText(result?.id) || `vod-card-${index + 1}`,
    title: readableText(result?.name) || '未命名',
    poster: readableText(result?.poster),
    badge: readableText(result?.remarks),
    raw: result,
  }));
}

function normalizeLiveGroup(group) {
  const cleanGroup = typeof group === 'string' ? group.trim() : '';
  return cleanGroup || '未分组';
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  APP_TABS,
  DEFAULT_TAB_ID,
  DISCOVER_MODES,
  buildLiveChannelGroups,
  buildVodResultCards,
  buildWatchingSummary,
  filterLiveChannels,
  getTabById,
};
