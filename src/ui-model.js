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

const DISCOVER_FEED_TABS = [
  {
    id: 'hot',
    label: '热门内容',
  },
  {
    id: 'tv-hot',
    label: '热门电视',
  },
  {
    id: 'variety-hot',
    label: '热门综艺',
  },
  {
    id: 'movie',
    label: '电影',
  },
  {
    id: 'tv',
    label: '电视',
  },
];

const DISCOVER_SORT_FILTERS = [
  {
    id: 'sort',
    label: '排序',
    muted: true,
  },
  {
    id: 'heat',
    label: '热度',
  },
  {
    id: 'latest',
    label: '最新',
  },
  {
    id: 'rating',
    label: '评分',
  },
];

const DISCOVER_REGION_FILTERS = [
  {
    id: 'all',
    label: '全部',
  },
  {
    id: 'chinese',
    label: '华语',
  },
  {
    id: 'western',
    label: '欧美',
  },
  {
    id: 'korea',
    label: '韩国',
  },
  {
    id: 'japan',
    label: '日本',
  },
];

const DEMO_DISCOVER_POSTERS = [
  {
    id: 'hot-visible-lie',
    title: '我看见两朵一样的云',
    subtitle: '华语 · 剧情',
    rating: '5.6',
    poster: 'https://image.tmdb.org/t/p/w500/6qDaOYUoyb1rOhg47vWwJbES1Yn.jpg',
  },
  {
    id: 'hot-double-happiness',
    title: '双喜',
    subtitle: '华语 · 喜剧',
    rating: '7.4',
    poster: 'https://image.tmdb.org/t/p/w500/6agKYU5IQFpuDyUYPu39w7UCRrJ.jpg',
  },
  {
    id: 'hot-free-at-heart',
    title: '心门之外',
    subtitle: '欧美 · 爱情',
    rating: '7.4',
    poster: 'https://image.tmdb.org/t/p/w500/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg',
  },
  {
    id: 'hot-marsupilami',
    title: '长尾豹马修',
    subtitle: '欧美 · 冒险',
    rating: '6.7',
    poster: 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg',
  },
  {
    id: 'hot-voicemail',
    title: '真爱留言',
    subtitle: '欧美 · 剧情',
    rating: '7.0',
    poster: 'https://image.tmdb.org/t/p/w500/5KCVkau1HEl7ZzfPsKAPM0sMiKc.jpg',
  },
  {
    id: 'hot-my-mother',
    title: '我的妈耶',
    subtitle: '华语 · 家庭',
    rating: '6.3',
    poster: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
  },
  {
    id: 'hot-biao-ren',
    title: '镖人：风起大漠',
    subtitle: '华语 · 动作',
    rating: '7.5',
    poster: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
  },
  {
    id: 'hot-obsession',
    title: '痴迷',
    subtitle: '惊悚 · 悬疑',
    rating: '7.7',
    poster: 'https://image.tmdb.org/t/p/w500/vB8o2p4ETnrfiWEgVxHmHWP9yRl.jpg',
  },
  {
    id: 'hot-foggy-tale',
    title: '大沧',
    subtitle: '华语 · 剧情',
    rating: '8.1',
    poster: 'https://image.tmdb.org/t/p/w500/9Gtg2DzBhmYamXBS1hKAhiwbBKS.jpg',
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

function buildDiscoverPosterFeed() {
  return DEMO_DISCOVER_POSTERS.map((poster) => ({ ...poster }));
}

function buildPosterDetailModel(result = {}, detail = {}) {
  const source = {
    ...result,
    ...detail,
  };
  const title =
    readableText(source.title) ||
    readableText(source.name) ||
    readableText(source.vod_name) ||
    '未知影片';
  const heroImage =
    readableText(source.heroImage) ||
    readableText(source.poster) ||
    readableText(source.pic) ||
    readableText(source.vod_pic);
  const sourceName =
    readableText(source.sourceName) ||
    readableText(source.siteName) ||
    readableText(source.source) ||
    '默认来源';
  const year = readableText(source.year) || readableText(source.vod_year);
  const type = readableText(source.type) || readableText(source.vod_class);
  const duration =
    readableText(source.duration) ||
    readableText(source.vod_duration) ||
    readableText(source.remarks) ||
    readableText(source.vod_remarks);
  const metaLine = [year, type, duration].filter(Boolean).join(' · ');

  return {
    id: readableText(source.id) || readableText(source.vod_id) || title,
    title,
    heroImage,
    poster: heroImage,
    remarks: readableText(source.remarks) || readableText(source.vod_remarks),
    sourceName,
    description:
      readableText(source.description) ||
      readableText(source.desc) ||
      readableText(source.vod_content) ||
      '暂无简介',
    metaLine,
    raw: source,
  };
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
};
