function buildSearchBuckets({ sites = [], results = [], failures = [] } = {}) {
  const resultCounts = new Map();
  const resultSourceLabels = new Map();

  results.forEach((result) => {
    const sourceId = result?.sourceId || '';
    if (!sourceId) {
      return;
    }

    resultCounts.set(sourceId, (resultCounts.get(sourceId) || 0) + 1);
    if (!resultSourceLabels.has(sourceId) && result?.sourceName) {
      resultSourceLabels.set(sourceId, result.sourceName);
    }
  });

  const buckets = [
    {
      id: 'all',
      label: '全部',
      count: results.length,
      total: results.length + failures.length,
      status: failures.length ? 'partial' : 'ready',
    },
  ];

  sites.forEach((site) => {
    const count = resultCounts.get(site.id) || 0;
    if (count <= 0) {
      return;
    }

    buckets.push({
      id: site.id,
      label: site.name || site.id,
      count,
      total: count,
      status: 'ready',
    });
  });

  resultCounts.forEach((count, sourceId) => {
    if (sites.some((site) => site.id === sourceId)) {
      return;
    }

    buckets.push({
      id: sourceId,
      label: resultSourceLabels.get(sourceId) || sourceId,
      count,
      total: count,
      status: 'ready',
    });
  });

  failures.forEach((failure) => {
    buckets.push({
      id: failure.sourceId,
      label: failure.sourceName || failure.sourceId,
      count: 0,
      total: 0,
      status: 'failed',
      message: failure.message || '解析失败',
    });
  });

  return buckets;
}

function filterResultsByBucket(results = [], bucketId = 'all') {
  if (!bucketId || bucketId === 'all') {
    return results;
  }

  return results.filter((result) => result?.sourceId === bucketId);
}

module.exports = {
  buildSearchBuckets,
  filterResultsByBucket,
};
