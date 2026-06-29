function buildSearchLoadingMessage({ targetCount = 0 } = {}) {
  if (targetCount > 0) {
    return `正在搜索 ${targetCount} 个真实来源，可能需要 30-60 秒，请稍等`;
  }

  return '正在搜索真实来源，可能需要 30-60 秒，请稍等';
}

function buildDetailLoadingMessage(title) {
  const cleanTitle = readableText(title);

  if (cleanTitle) {
    return `正在读取「${cleanTitle}」详情和播放列表`;
  }

  return '正在读取详情和播放列表';
}

function buildEpisodeLoadingMessage(title) {
  const cleanTitle = readableText(title);

  if (cleanTitle) {
    return `正在解析「${cleanTitle}」播放地址`;
  }

  return '正在解析播放地址';
}

function hasMojibakeText(value) {
  const text = readableText(value);

  if (!text) {
    return false;
  }

  return /[鍙鐐鎾绱璁榛鏈鏆鈻鈾鈿]/.test(text);
}

function readableText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

module.exports = {
  buildDetailLoadingMessage,
  buildEpisodeLoadingMessage,
  buildSearchLoadingMessage,
  hasMojibakeText,
};
