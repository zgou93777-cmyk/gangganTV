const {
  fetchTvBoxDetail,
  fetchTvBoxSearch,
} = require('./iptv-api');

const DEFAULT_TEST_KEYWORD = 'test';

async function testTvBoxSite(
  site,
  { keyword = DEFAULT_TEST_KEYWORD, fetchImpl = fetch } = {}
) {
  const cleanKeyword = typeof keyword === 'string' && keyword.trim()
    ? keyword.trim()
    : DEFAULT_TEST_KEYWORD;

  if (site?.unsupportedReason) {
    return buildFailedResult('unsupported', site.unsupportedReason, cleanKeyword);
  }

  try {
    const results = await fetchTvBoxSearch(site, cleanKeyword, fetchImpl);

    if (!results.length) {
      return buildFailedResult('no-results', '测试搜索没有返回结果', cleanKeyword);
    }

    const firstResult = results[0];
    const detail = await fetchTvBoxDetail(site, firstResult.id, fetchImpl);
    const playGroupCount = detail.playGroups.length;
    const episodeCount = detail.playGroups.reduce(
      (count, group) => count + group.episodes.length,
      0
    );

    if (!playGroupCount || !episodeCount) {
      return buildFailedResult(
        'no-play-items',
        '详情里没有可播放线路或剧集',
        cleanKeyword,
        firstResult.name
      );
    }

    return {
      ok: true,
      status: 'passed',
      keyword: cleanKeyword,
      message: '测试通过：搜索、详情和播放项可用',
      resultName: firstResult.name,
      playGroupCount,
      episodeCount,
    };
  } catch (error) {
    return buildFailedResult(
      'failed',
      error?.message || '站点测试失败',
      cleanKeyword
    );
  }
}

function buildFailedResult(status, message, keyword, resultName = '') {
  return {
    ok: false,
    status,
    keyword,
    message,
    resultName,
    playGroupCount: 0,
    episodeCount: 0,
  };
}

module.exports = {
  DEFAULT_TEST_KEYWORD,
  testTvBoxSite,
};
