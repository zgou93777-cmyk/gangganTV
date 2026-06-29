const DEFAULT_SEARCH_HISTORY_LIMIT = 10;

function addSearchHistoryKeyword(
  history,
  keyword,
  limit = DEFAULT_SEARCH_HISTORY_LIMIT
) {
  const cleanKeyword = readableText(keyword);
  const normalizedHistory = normalizeSearchHistory(history, limit);

  if (!cleanKeyword) {
    return normalizedHistory;
  }

  return [
    cleanKeyword,
    ...normalizedHistory.filter((item) => item !== cleanKeyword),
  ].slice(0, limit);
}

function normalizeSearchHistory(history, limit = DEFAULT_SEARCH_HISTORY_LIMIT) {
  if (!Array.isArray(history)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  history.forEach((item) => {
    const keyword = readableText(item);

    if (!keyword || seen.has(keyword)) {
      return;
    }

    seen.add(keyword);
    normalized.push(keyword);
  });

  return normalized.slice(0, limit);
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  DEFAULT_SEARCH_HISTORY_LIMIT,
  addSearchHistoryKeyword,
  normalizeSearchHistory,
};
