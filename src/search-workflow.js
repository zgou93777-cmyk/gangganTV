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
  onProgress = null,
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
  const notifyProgress =
    typeof onProgress === 'function' ? onProgress : () => {};
  let completedCount = 0;

  targets.forEach((site) => {
    const skipReason =
      typeof getSkipReason === 'function' ? getSkipReason(site) : '';

    if (skipReason) {
      completedCount += 1;
      const failure = {
        sourceId: site.id,
        sourceName: site.name || site.id,
        message: skipReason,
      };

      skippedFailures.push(failure);
      notifyProgress({
        completedCount,
        failure,
        site,
        targetCount: targets.length,
        type: 'failure',
      });
      return;
    }

    runnableTargets.push(site);
  });

  const results = [];
  const failures = [];

  await Promise.all(
    runnableTargets
      .map(async (site) => {
        const rawResults = await searchSite(site, keyword);
        const normalizedResults = normalizeResultSources(rawResults, site);

        completedCount += 1;
        notifyProgress({
          completedCount,
          results: normalizedResults,
          site,
          targetCount: targets.length,
          type: 'results',
        });
        return normalizedResults;
      })
      .map((searchPromise, index) =>
        searchPromise
          .then((normalizedResults) => {
            results.push(...normalizedResults);
          })
          .catch((error) => {
            const site = runnableTargets[index];
            const failure = {
              sourceId: site.id,
              sourceName: site.name || site.id,
              message: error?.message || '搜索失败',
            };

            completedCount += 1;
            failures.push(failure);
            notifyProgress({
              completedCount,
              failure,
              site,
              targetCount: targets.length,
              type: 'failure',
            });
          })
      )
  );

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
