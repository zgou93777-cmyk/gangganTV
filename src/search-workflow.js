function buildSearchTargets({ sites = [], selectedSourceIds = [] } = {}) {
  const selectedIds = Array.isArray(selectedSourceIds)
    ? selectedSourceIds.filter(Boolean)
    : [];
  const selectedSet = selectedIds.length ? new Set(selectedIds) : null;

  return sites.filter((site) => {
    if (!site?.searchable || site.unsupportedReason) {
      return false;
    }

    return !selectedSet || selectedSet.has(site.id);
  });
}

async function searchAcrossSites({
  getSkipReason = null,
  keyword,
  searchSite,
  selectedSourceIds = [],
  sites = [],
} = {}) {
  if (typeof searchSite !== 'function') {
    throw new Error('searchSite is required');
  }

  const targets = buildSearchTargets({ sites, selectedSourceIds });
  const runnableTargets = [];
  const skippedFailures = [];

  targets.forEach((site) => {
    const skipReason =
      typeof getSkipReason === 'function' ? getSkipReason(site) : '';

    if (skipReason) {
      skippedFailures.push({
        sourceId: site.id,
        sourceName: site.name || site.id,
        message: skipReason,
      });
      return;
    }

    runnableTargets.push(site);
  });

  const settledResults = await Promise.allSettled(
    runnableTargets.map(async (site) => {
      const results = await searchSite(site, keyword);

      return {
        results: normalizeResultSources(results, site),
        site,
      };
    })
  );
  const results = [];
  const failures = [];

  settledResults.forEach((settledResult, index) => {
    const site = runnableTargets[index];

    if (settledResult.status === 'fulfilled') {
      results.push(...settledResult.value.results);
      return;
    }

    failures.push({
      sourceId: site.id,
      sourceName: site.name || site.id,
      message: settledResult.reason?.message || '搜索失败',
    });
  });

  return {
    failures: [...failures, ...skippedFailures],
    results,
    targets,
  };
}

function normalizeResultSources(results = [], site = {}) {
  return (Array.isArray(results) ? results : []).map((result) => ({
    ...result,
    runtimeSiteId: result?.runtimeSiteId || site.id,
    runtimeSiteName: result?.runtimeSiteName || site.name || site.id,
    sourceId: result?.sourceId || site.id,
    sourceName: result?.sourceName || site.name || site.id,
  }));
}

module.exports = {
  buildSearchTargets,
  searchAcrossSites,
};
