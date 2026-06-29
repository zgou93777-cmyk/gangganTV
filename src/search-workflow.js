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
  getSearchBatchKey = null,
  getSkipReason = null,
  keyword,
  onProgress = null,
  searchSite,
  searchSiteBatch = null,
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
  const runnableUnits = buildRunnableSearchUnits({
    getSearchBatchKey,
    runnableTargets,
    searchSiteBatch,
  });

  await Promise.all(
    runnableUnits
      .map((unit) =>
        unit.type === 'batch'
          ? runBatchSearchUnit({
              getCompletedCount: () => completedCount,
              keyword,
              notifyProgress,
              searchSite,
              searchSiteBatch,
              sites: unit.sites,
              targetCount: targets.length,
              updateCompletedCount: (value) => {
                completedCount = value;
              },
            })
          : runSingleSearchUnit({
              getCompletedCount: () => completedCount,
              keyword,
              notifyProgress,
              searchSite,
              site: unit.site,
              targetCount: targets.length,
              updateCompletedCount: (value) => {
                completedCount = value;
              },
            })
      )
      .map((searchPromise, index) =>
        searchPromise
          .then((unitResult) => {
            results.push(...(unitResult.results || []));
            failures.push(...(unitResult.failures || []));
          })
          .catch((error) => {
            const unit = runnableUnits[index];
            const failedSites = unit.type === 'batch' ? unit.sites : [unit.site];

            failedSites.forEach((site) => {
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

function buildRunnableSearchUnits({
  getSearchBatchKey = null,
  runnableTargets = [],
  searchSiteBatch = null,
} = {}) {
  if (typeof searchSiteBatch !== 'function' || typeof getSearchBatchKey !== 'function') {
    return runnableTargets.map((site) => ({ site, type: 'single' }));
  }

  const units = [];
  const groups = new Map();

  runnableTargets.forEach((site) => {
    const batchKey = getSearchBatchKey(site);

    if (!batchKey) {
      units.push({ site, type: 'single' });
      return;
    }

    if (!groups.has(batchKey)) {
      groups.set(batchKey, []);
    }
    groups.get(batchKey).push(site);
  });

  groups.forEach((groupSites) => {
    if (groupSites.length > 1) {
      units.push({ sites: groupSites, type: 'batch' });
      return;
    }

    units.push({ site: groupSites[0], type: 'single' });
  });

  return units;
}

async function runSingleSearchUnit({
  getCompletedCount,
  keyword,
  notifyProgress,
  searchSite,
  site,
  targetCount,
  updateCompletedCount,
}) {
  const rawResults = await searchSite(site, keyword);
  const normalizedResults = normalizeResultSources(rawResults, site);
  const completedCount = getCompletedCount() + 1;

  updateCompletedCount(completedCount);
  notifyProgress({
    completedCount,
    results: normalizedResults,
    site,
    targetCount,
    type: 'results',
  });

  return {
    failures: [],
    results: normalizedResults,
  };
}

async function runBatchSearchUnit({
  getCompletedCount,
  keyword,
  notifyProgress,
  searchSite,
  searchSiteBatch,
  sites,
  targetCount,
  updateCompletedCount,
}) {
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const siteByBasePath = new Map(
    sites
      .filter((site) => site?.siteBasePath)
      .map((site) => [normalizeSiteBasePath(site.siteBasePath), site])
  );
  let batchResult;

  try {
    batchResult = await searchSiteBatch(sites, keyword);
  } catch (error) {
    if (error?.batchUnsupported) {
      return runBatchFallbackAsSingleSearches({
        getCompletedCount,
        keyword,
        notifyProgress,
        searchSite,
        sites,
        targetCount,
        updateCompletedCount,
      });
    }

    throw error;
  }
  const normalizedResults = normalizeBatchResultSources(
    batchResult?.results || [],
    sites,
    siteById,
    siteByBasePath
  );
  const normalizedFailures = normalizeBatchFailures(
    batchResult?.failures || [],
    sites,
    siteById,
    siteByBasePath
  );
  const completedSiteIds = new Set();
  let completedCount = getCompletedCount();

  normalizedResults.forEach((result) => {
    const site = siteById.get(result.sourceId) || siteById.get(result.runtimeSiteId);

    if (!site || completedSiteIds.has(site.id)) {
      return;
    }

    const siteResults = normalizedResults.filter(
      (item) => item.sourceId === site.id || item.runtimeSiteId === site.id
    );

    completedSiteIds.add(site.id);
    completedCount += 1;
    updateCompletedCount(completedCount);
    notifyProgress({
      completedCount,
      results: siteResults,
      site,
      targetCount,
      type: 'results',
    });
  });

  normalizedFailures.forEach((failure) => {
    const site = siteById.get(failure.sourceId);

    if (site) {
      completedSiteIds.add(site.id);
    }

    completedCount += 1;
    updateCompletedCount(completedCount);
    notifyProgress({
      completedCount,
      failure,
      site: site || { id: failure.sourceId, name: failure.sourceName },
      targetCount,
      type: 'failure',
    });
  });

  sites.forEach((site) => {
    if (completedSiteIds.has(site.id)) {
      return;
    }

    completedSiteIds.add(site.id);
    completedCount += 1;
    updateCompletedCount(completedCount);
    notifyProgress({
      completedCount,
      results: [],
      site,
      targetCount,
      type: 'results',
    });
  });

  return {
    failures: normalizedFailures,
    results: normalizedResults,
  };
}

async function runBatchFallbackAsSingleSearches({
  getCompletedCount,
  keyword,
  notifyProgress,
  searchSite,
  sites,
  targetCount,
  updateCompletedCount,
}) {
  if (typeof searchSite !== 'function') {
    throw new Error('批量搜索接口不可用，请更新或重启本地解析器');
  }

  const results = [];
  const failures = [];

  for (const site of sites) {
    try {
      const unitResult = await runSingleSearchUnit({
        getCompletedCount,
        keyword,
        notifyProgress,
        searchSite,
        site,
        targetCount,
        updateCompletedCount,
      });

      results.push(...unitResult.results);
    } catch (error) {
      const completedCount = getCompletedCount() + 1;
      const failure = {
        sourceId: site.id,
        sourceName: site.name || site.id,
        message: error?.message || '搜索失败',
      };

      updateCompletedCount(completedCount);
      failures.push(failure);
      notifyProgress({
        completedCount,
        failure,
        site,
        targetCount,
        type: 'failure',
      });
    }
  }

  return {
    failures,
    results,
  };
}

function normalizeBatchResultSources(results = [], sites = [], siteById, siteByBasePath) {
  return (Array.isArray(results) ? results : []).map((result) => {
    const site = resolveBatchSite(result, sites, siteById, siteByBasePath);

    return {
      ...result,
      runtimeSiteId: site?.id || result?.runtimeSiteId || result?.sourceId || '',
      runtimeSiteName:
        site?.name || result?.runtimeSiteName || result?.sourceName || result?.sourceId || '',
      sourceId: site?.id || result?.sourceId || '',
      sourceName: site?.name || result?.sourceName || result?.sourceId || '',
    };
  });
}

function normalizeBatchFailures(failures = [], sites = [], siteById, siteByBasePath) {
  return (Array.isArray(failures) ? failures : []).map((failure) => {
    const site = resolveBatchSite(failure, sites, siteById, siteByBasePath);

    return {
      sourceId: site?.id || failure?.sourceId || failure?.siteBasePath || '',
      sourceName:
        site?.name || failure?.sourceName || failure?.sourceId || failure?.siteBasePath || '来源',
      message: failure?.message || '搜索失败',
    };
  });
}

function resolveBatchSite(item = {}, sites = [], siteById, siteByBasePath) {
  const sourceId = String(item?.sourceId || '').trim();
  const runtimeSiteId = String(item?.runtimeSiteId || '').trim();
  const sourceApi = normalizeSiteBasePath(item?.sourceApi || '');
  const siteBasePath = normalizeSiteBasePath(item?.siteBasePath || '');

  return (
    siteById.get(sourceId) ||
    siteById.get(runtimeSiteId) ||
    siteByBasePath.get(siteBasePath) ||
    siteByBasePath.get(sourceApi) ||
    sites.find((site) => site?.name && site.name === item?.sourceName) ||
    null
  );
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

function normalizeSiteBasePath(value) {
  return String(value || '').replace(/\/+$/, '');
}

module.exports = {
  buildSearchTargets,
  searchAcrossSites,
};
