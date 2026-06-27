const { isValidHttpUrl } = require('./iptv-core');

const DEFAULT_HISTORY_LIMIT = 30;

function addPlayHistoryItem(
  history,
  item,
  playedAt = new Date().toISOString(),
  limit = DEFAULT_HISTORY_LIMIT
) {
  const normalizedItem = normalizePlayHistoryItem({
    ...item,
    playedAt,
  });

  if (!normalizedItem) {
    return normalizePlayHistory(history, limit);
  }

  return [
    normalizedItem,
    ...normalizePlayHistory(history, limit).filter(
      (historyItem) => historyItem.url !== normalizedItem.url
    ),
  ].slice(0, limit);
}

function normalizePlayHistory(history, limit = DEFAULT_HISTORY_LIMIT) {
  if (!Array.isArray(history)) {
    return [];
  }

  const seenUrls = new Set();
  const normalized = [];

  history.forEach((item) => {
    const normalizedItem = normalizePlayHistoryItem(item);

    if (!normalizedItem || seenUrls.has(normalizedItem.url)) {
      return;
    }

    seenUrls.add(normalizedItem.url);
    normalized.push(normalizedItem);
  });

  return normalized.slice(0, limit);
}

function normalizePlayHistoryItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const url = readableText(item.url);

  if (!isValidHttpUrl(url)) {
    return null;
  }

  const type = ['live', 'vod', 'config'].includes(item.type) ? item.type : 'vod';
  const title = readableText(item.title) || '未命名播放';

  return {
    id: url,
    type,
    title,
    url,
    sourceName: readableText(item.sourceName),
    playedAt: readableText(item.playedAt),
  };
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  DEFAULT_HISTORY_LIMIT,
  addPlayHistoryItem,
  normalizePlayHistory,
};
