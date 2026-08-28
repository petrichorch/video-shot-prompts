#!/usr/bin/env node

// Search Douyin through TiKHub and retain references above a like threshold.
const fs = require('fs');
const path = require('path');
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');

if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const has = name => args.includes(`--${name}`);
const keyword = arg('keyword') || '羊毛毡';
const minLikes = Number(arg('min-likes') || 100);
const maxResults = Number(arg('max-results') || 8);
const pages = Number(arg('pages') || 1);
const skillDir = path.resolve(__dirname, '..');
const endpoint = process.env.TIKHUB_DOUYIN_SEARCH_API_URL
  || 'https://api.tikhub.io/api/v1/douyin/search/fetch_video_search_v2';

function usage() {
  console.error('Usage: search-douyin-references.js [--keyword 羊毛毡] [--min-likes 100] [--max-results 8] [--pages 1]');
}

function readSecret() {
  const file = path.join(skillDir, '.tikhub-api-key');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

const apiKey = process.env.TIKHUB_API_KEY || readSecret();
if (has('help') || !apiKey || !Number.isFinite(minLikes) || minLikes < 0
  || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 30
  || !Number.isInteger(pages) || pages < 1 || pages > 3) {
  usage();
  if (!apiKey) console.error('Fill .tikhub-api-key or set TIKHUB_API_KEY');
  process.exit(has('help') ? 0 : 1);
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    durationMs: asNumber(item.duration || item.video?.duration)
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

function nextCursor(body) {
  const options = [
    body?.data?.cursor,
    body?.data?.data?.cursor,
    body?.data?.extra?.cursor,
    body?.cursor
  ];
  return options.find(value => value !== undefined && value !== null) ?? 0;
}

async function fetchPage(cursor) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      keyword,
      cursor,
      sort_type: '1',
      publish_time: '0',
      filter_duration: '0',
      content_type: '1'
    })
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
  let cursor = 0;
  const all = [];
  for (let page = 0; page < pages; page += 1) {
    const body = await fetchPage(cursor);
    all.push(...collectCandidates(body));
    cursor = nextCursor(body);
  }
  const unique = new Map();
  for (const item of all) {
    const previous = unique.get(item.awemeId);
    if (!previous || item.likes > previous.likes) unique.set(item.awemeId, item);
  }
  const results = [...unique.values()]
    .filter(item => item.likes > minLikes)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, maxResults);
  console.log(JSON.stringify({
    keyword,
    minLikesExclusive: minLikes,
    pagesRequested: pages,
    requestCount: pages,
    resultCount: results.length,
    results
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
