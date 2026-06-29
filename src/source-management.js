function renameConfigSource({ name, sourceId, sources = [], sites = [] } = {}) {
  const cleanName = readableText(name);

  if (!sourceId || !cleanName) {
    return {
      sources,
      sites,
    };
  }

  return {
    sources: sources.map((source) =>
      source?.id === sourceId
        ? {
            ...source,
            name: cleanName,
          }
        : source
    ),
    sites: sites.map((site) =>
      site?.sourceId === sourceId
        ? {
            ...site,
            name: renameSiteForSource(site, cleanName),
            sourceName: cleanName,
          }
        : site
    ),
  };
}

function deleteConfigSource({
  configUrl = '',
  selectedSearchSourceIds = [],
  selectedSiteId = '',
  sourceId,
  sources = [],
  sites = [],
} = {}) {
  const source = sources.find((item) => item?.id === sourceId);
  const nextSources = sources.filter((item) => item?.id !== sourceId);
  const nextSites = sites.filter((site) => site?.sourceId !== sourceId);
  const removedSiteIds = new Set(
    sites.filter((site) => site?.sourceId === sourceId).map((site) => site.id)
  );
  const nextSelectedSiteId = removedSiteIds.has(selectedSiteId)
    ? firstUsableSiteId(nextSites)
    : selectedSiteId;
  const nextSelectedSearchSourceIds = selectedSearchSourceIds.filter(
    (id) => !removedSiteIds.has(id)
  );

  return {
    configUrl: source?.url && source.url === configUrl ? '' : configUrl,
    selectedSearchSourceIds: nextSelectedSearchSourceIds,
    selectedSiteId: nextSelectedSiteId,
    sources: nextSources,
    sites: nextSites,
  };
}

function selectDefaultSource({ sourceId, sites = [] } = {}) {
  return firstUsableSiteId(sites.filter((site) => site?.sourceId === sourceId));
}

function buildSourceStatus({ selectedSiteId = '', source = {}, sites = [] } = {}) {
  const sourceSites = sites.filter((site) => site?.sourceId === source?.id);
  const searchableSites = sourceSites.filter(
    (site) =>
      site?.searchable &&
      !site.unsupportedReason &&
      site?.runtime !== 'tvbox-jar-spider'
  );
  const isDefault = sourceSites.some((site) => site?.id === selectedSiteId);
  const hasPendingRuntime = sourceSites.some(
    (site) =>
      site?.runtime === 'tvbox-jar-spider' ||
      site?.unsupportedReason ||
      !site?.searchable
  );
  const label = searchableSites.length
    ? hasPendingRuntime
      ? '部分可用'
      : '可搜索'
    : hasPendingRuntime
    ? '待适配'
    : source?.kind === 'plugin'
    ? '待验证'
    : '无站点';

  return {
    isDefault,
    label,
    searchableCount: searchableSites.length,
    siteCount: sourceSites.length,
    tone: searchableSites.length ? 'ready' : hasPendingRuntime ? 'pending' : 'muted',
  };
}

function renameSiteForSource(site, sourceName) {
  if (site?.runtime === 'catvod-server') {
    return `${sourceName} 服务端插件`;
  }

  if (site?.runtime === 'catvod-webview') {
    return `${sourceName} 插件`;
  }

  return readableText(site?.name) || sourceName;
}

function firstUsableSiteId(items) {
  return items.find((site) => site?.searchable && !site.unsupportedReason)?.id || '';
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  buildSourceStatus,
  deleteConfigSource,
  renameConfigSource,
  selectDefaultSource,
};
