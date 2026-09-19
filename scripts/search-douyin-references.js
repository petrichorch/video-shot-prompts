#!/usr/bin/env node

// Search Douyin through TiKHub and retain eligible pet-felting process videos.
const fs = require('fs');
const path = require('path');
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
const { loadHistory, wasReproduced } = require('./manage-reproduction-history');
const {
  DEFAULT_KEYWORDS,
  DEFAULT_REFRESH_EVERY,
  loadSearchState,
  saveSearchState,
  planSearch,
  completeSearch
} = require('./douyin-search-state');
const {
  extractPagination,
  searchRequestBody,
  shouldRequestNextPage
} = require('./douyin-search-pagination');

if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const has = name => args.includes(`--${name}`);
const explicitKeyword = arg('keyword') || '';
const minLikes = Number(arg('min-likes') || 100);
const maxDurationSeconds = Number(arg('max-duration') || 180);
const maxResults = Number(arg('max-results') || 8);
const pages = Number(arg('pages') || 1);
const refreshEvery = Number(arg('refresh-every') || DEFAULT_REFRESH_EVERY);
const skillDir = path.resolve(__dirname, '..');
const endpoint = process.env.TIKHUB_DOUYIN_SEARCH_API_URL
  || 'https://api.tikhub.io/api/v1/douyin/search/fetch_video_search_v2';

function usage() {
  console.error('Usage: search-douyin-references.js [--keyword "QUERY"] [--min-likes 100] [--max-duration 180] [--max-results 8] [--pages 1] [--refresh-every 3]');
}

function readSecret() {
  const file = path.join(skillDir, '.tikhub-api-key');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

const apiKey = process.env.TIKHUB_API_KEY || readSecret();
if (has('help') || !apiKey || !Number.isFinite(minLikes) || minLikes < 0
  || !Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || maxDurationSeconds > 180
  || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 30
  || !Number.isInteger(pages) || pages < 1 || pages > 3
  || !Number.isInteger(refreshEvery) || refreshEvery < 2 || refreshEvery > 30) {
  usage();
  if (!apiKey) console.error('Fill .tikhub-api-key or set TIKHUB_API_KEY');
  process.exit(has('help') ? 0 : 1);
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDurationMs(value) {
  const parsed = asNumber(value);
  if (!parsed) return 0;
  return parsed < 1000 ? parsed * 1000 : parsed;
}

function candidateFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value.aweme_info || value.aweme_detail || value;
  const id = String(item.aweme_id || item.id_str || item.id || '');
  const statistics = item.statistics || item.stats || {};
  const likes = asNumber(statistics.digg_count ?? statistics.like_count ?? item.digg_count ?? item.like_count);
  if (!id || !likes) return null;
  const author = item.author || {};
  return {
    awemeId: id,
    likes,
    comments: asNumber(statistics.comment_count),
    shares: asNumber(statistics.share_count),
    description: String(item.desc || item.description || '').slice(0, 500),
    author: String(author.nickname || author.unique_id || author.short_id || ''),
    shareUrl: item.share_url || `https://www.douyin.com/video/${id}`,
    durationMs: asDurationMs(item.duration || item.video?.duration)
  };
}

function collectCandidates(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectCandidates(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  const candidate = candidateFrom(value);
  if (candidate) found.push(candidate);
  for (const child of Object.values(value)) collectCandidates(child, found);
  return found;
}

async function fetchPage(keyword, pagination) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(searchRequestBody(keyword, pagination))
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok) {
    const rawMessage = body?.message || body?.detail || body?.error || 'unknown error';
    const message = (typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage)).slice(0, 500);
    throw new Error(`TiKHub search failed (${response.status}): ${message}`);
  }
  return body;
}

async function main() {
  const [{ history, key: historyObjectKey }, loadedState] = await Promise.all([
    loadHistory(),
    loadSearchState()
  ]);
  const plan = planSearch(loadedState.state, {
    keywords: DEFAULT_KEYWORDS,
    explicitKeyword,
    refreshEvery
  });
  const startedAt = new Date().toISOString();
  const keyword = plan.keyword;
  let pagination = {
    cursor: plan.startCursor,
    searchId: plan.searchId,
    backtrace: plan.backtrace,
    hasMore: true
  };
  const all = [];
  let requestCount = 0;
  for (let page = 0; page < pages; page += 1) {
    const requestCursor = pagination.cursor;
    const body = await fetchPage(keyword, pagination);
    requestCount += 1;
    all.push(...collectCandidates(body));
    pagination = extractPagination(body);
    if (!shouldRequestNextPage({
      pageIndex: page,
      pages,
      requestCursor,
      pagination
    })) break;
  }
  const unique = new Map();
  for (const item of all) {
    const previous = unique.get(item.awemeId);
    if (!previous || item.likes > previous.likes) unique.set(item.awemeId, item);
  }
  let excludedAsAlreadyReproduced = 0;
  const results = [...unique.values()]
    .filter(item => item.likes > minLikes
      && item.durationMs > 0
      && item.durationMs <= maxDurationSeconds * 1000)
    .filter(item => {
      const seen = wasReproduced(history, {
        platform: 'douyin',
        sourceId: item.awemeId,
        sourceUrl: item.shareUrl
      });
      if (seen) excludedAsAlreadyReproduced += 1;
      return !seen;
    })
    .map(item => ({ ...item, durationSeconds: Number((item.durationMs / 1000).toFixed(3)) }))
    .slice(0, maxResults);
  const nextState = completeSearch(loadedState.state, plan, {
    nextCursor: pagination.cursor,
    searchId: pagination.searchId,
    backtrace: pagination.backtrace,
    startedAt,
    finishedAt: new Date().toISOString()
  });
  await saveSearchState(nextState, loadedState);
  console.log(JSON.stringify({
    keyword,
    keywordMode: explicitKeyword ? 'explicit' : 'rotating',
    keywordIndex: plan.keywordIndex,
    keywordPoolSize: DEFAULT_KEYWORDS.length,
    searchStateObject: loadedState.key,
    startCursor: plan.startCursor,
    nextCursor: pagination.cursor,
    hasMore: pagination.hasMore,
    startedFromHead: plan.startedFromHead,
    headRefreshEveryKeywordUses: refreshEvery,
    minLikesExclusive: minLikes,
    maxDurationSeconds,
    ordering: 'TiKHub comprehensive search order; not sorted by likes',
    reproductionHistoryObject: historyObjectKey,
    excludedAsAlreadyReproduced,
    pagesRequested: pages,
    requestCount,
    stoppedAfterEligibleMetadata: false,
    resultCount: results.length,
    results
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
