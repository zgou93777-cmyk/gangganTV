function resolveResultRuntimeSite({ result = {}, selectedSite = null, sites = [] } = {}) {
  const runtimeSiteId = readableText(result.runtimeSiteId);
  const sourceId = readableText(result.sourceId);

  if (runtimeSiteId) {
    const runtimeSite = sites.find((site) => site?.id === runtimeSiteId);
    if (runtimeSite) {
      return runtimeSite;
    }
  }

  if (sourceId) {
    const sourceSite = sites.find((site) => site?.id === sourceId);
    if (sourceSite) {
      return sourceSite;
    }
  }

  return selectedSite || null;
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  resolveResultRuntimeSite,
};
