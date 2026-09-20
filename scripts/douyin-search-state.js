#!/usr/bin/env node

// Persist TiKHub search rotation state separately from reproduction history.
const COS = require('cos-nodejs-sdk-v5');
const path = require('path');
const {
  credentials,
  DEFAULT_BUCKET,
  DEFAULT_REGION
} = require('./upload-to-cos');

const DEFAULT_KEY = 'buffer-media/douyin-search-state.json';
const DEFAULT_KEYWORDS = [
  '羊毛毡 宠物 制作',
  '羊毛毡 宠物定制 制作过程',
  '羊毛毡 猫 制作',
  '羊毛毡 狗 制作'
];
const DEFAULT_REFRESH_EVERY = 30;

function emptyState() {
  return {
    version: 2,
    updatedAt: null,
    totalRuns: 0,
    nextKeywordIndex: 0,
    queries: {}
  };
}

function normalizeCursor(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  return text;
}

function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('COS Douyin search state must be a JSON object.');
  }
  const queries = {};
  if (value.queries && typeof value.queries === 'object' && !Array.isArray(value.queries)) {
    for (const [keyword, entry] of Object.entries(value.queries)) {
      if (!keyword || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      queries[keyword] = {
        cursor: normalizeCursor(entry.cursor),
        searchId: typeof entry.searchId === 'string' ? entry.searchId : '',
        backtrace: typeof entry.backtrace === 'string' ? entry.backtrace : '',
        usesSinceHeadScan: Number.isInteger(entry.usesSinceHeadScan) && entry.usesSinceHeadScan >= 0
          ? entry.usesSinceHeadScan : 0,
        runs: Number.isInteger(entry.runs) && entry.runs >= 0 ? entry.runs : 0,
        lastStartedAt: entry.lastStartedAt || null,
        lastFinishedAt: entry.lastFinishedAt || null
      };
    }
  }
  return {
    version: 2,
    updatedAt: value.updatedAt || null,
    totalRuns: Number.isInteger(value.totalRuns) && value.totalRuns >= 0 ? value.totalRuns : 0,
    nextKeywordIndex: Number.isInteger(value.nextKeywordIndex) && value.nextKeywordIndex >= 0
      ? value.nextKeywordIndex : 0,
    queries
  };
}

function planSearch(stateValue, {
  keywords = DEFAULT_KEYWORDS,
  explicitKeyword = '',
  refreshEvery = DEFAULT_REFRESH_EVERY
} = {}) {
  const state = validateState(stateValue);
  if (!Array.isArray(keywords) || !keywords.length || keywords.some(value => !String(value).trim())) {
    throw new Error('At least one non-empty Douyin search keyword is required.');
  }
  if (!Number.isInteger(refreshEvery) || refreshEvery < 2) {
    throw new Error('Head refresh interval must be an integer of at least 2.');
  }
  const keywordIndex = explicitKeyword
    ? Math.max(0, keywords.indexOf(explicitKeyword))
    : state.nextKeywordIndex % keywords.length;
  const keyword = explicitKeyword || keywords[keywordIndex];
  const entry = state.queries[keyword] || {
    cursor: 0,
    searchId: '',
    backtrace: '',
    usesSinceHeadScan: 0,
    runs: 0,
    lastStartedAt: null,
    lastFinishedAt: null
  };
  const savedCursor = normalizeCursor(entry.cursor);
  const startedFromHead = savedCursor === 0 || entry.usesSinceHeadScan >= refreshEvery - 1;
  return {
    keyword,
    keywordIndex,
    startCursor: startedFromHead ? 0 : savedCursor,
    searchId: startedFromHead ? '' : entry.searchId,
    backtrace: startedFromHead ? '' : entry.backtrace,
    startedFromHead,
    refreshEvery,
    explicitKeyword: Boolean(explicitKeyword)
  };
}

function completeSearch(stateValue, plan, {
  nextCursor = 0,
  searchId = '',
  backtrace = '',
  startedAt,
  finishedAt = new Date().toISOString()
} = {}) {
  const state = validateState(stateValue);
  const previous = state.queries[plan.keyword] || {
    cursor: 0,
    searchId: '',
    backtrace: '',
    usesSinceHeadScan: 0,
    runs: 0,
    lastStartedAt: null,
    lastFinishedAt: null
  };
  state.queries[plan.keyword] = {
    cursor: normalizeCursor(nextCursor),
    searchId: String(searchId || ''),
    backtrace: String(backtrace || ''),
    usesSinceHeadScan: plan.startedFromHead ? 1 : previous.usesSinceHeadScan + 1,
    runs: previous.runs + 1,
    lastStartedAt: startedAt || finishedAt,
    lastFinishedAt: finishedAt
  };
  state.totalRuns += 1;
  if (!plan.explicitKeyword) state.nextKeywordIndex = plan.keywordIndex + 1;
  state.updatedAt = finishedAt;
  return state;
}

function requireClient() {
  const skillDir = path.resolve(__dirname, '..');
  const { secretId, secretKey, token } = credentials(skillDir);
  if (!secretId || !secretKey || secretId.startsWith('PASTE_') || secretKey.startsWith('PASTE_')) {
    throw new Error('Douyin search state requires Tencent COS credentials.');
  }
  return new COS({
    SecretId: secretId,
    SecretKey: secretKey,
    ...(token ? { SecurityToken: token } : {})
  });
}

function isMissing(error) {
  return error && (error.statusCode === 404 || error.code === 'NoSuchKey' || error.code === 'NoSuchResource');
}

function isAccessDenied(error) {
  return error && (error.statusCode === 403 || error.code === 'AccessDenied');
}

function publicObjectUrl(bucket, region, key) {
  const objectPath = key.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `https://${bucket}.cos.${region}.myqcloud.com/${objectPath}`;
}

async function loadPublicState(bucket, region, key) {
  const response = await fetch(publicObjectUrl(bucket, region, key), { cache: 'no-store' });
  if (response.status === 403 || response.status === 404) {
    return { state: emptyState(), exists: false, bucket, region, key };
  }
  if (!response.ok) throw new Error(`COS Douyin search state fetch failed (${response.status}).`);
  try {
    return { state: validateState(JSON.parse(await response.text())), exists: true, bucket, region, key };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`COS Douyin search state is not valid JSON: ${error.message}`);
    throw error;
  }
}

async function loadSearchState({
  bucket = process.env.DOUYIN_SEARCH_STATE_COS_BUCKET || DEFAULT_BUCKET,
  region = process.env.DOUYIN_SEARCH_STATE_COS_REGION || DEFAULT_REGION,
  key = process.env.DOUYIN_SEARCH_STATE_COS_KEY || DEFAULT_KEY
} = {}) {
  const cos = requireClient();
  try {
    const data = await cos.getObject({ Bucket: bucket, Region: region, Key: key });
    const text = Buffer.isBuffer(data.Body) ? data.Body.toString('utf8') : String(data.Body || '');
    return { state: validateState(JSON.parse(text)), exists: true, bucket, region, key };
  } catch (error) {
    if (isMissing(error)) return { state: emptyState(), exists: false, bucket, region, key };
    if (isAccessDenied(error)) return loadPublicState(bucket, region, key);
    if (error instanceof SyntaxError) throw new Error(`COS Douyin search state is not valid JSON: ${error.message}`);
    throw error;
  }
}

async function saveSearchState(stateValue, { bucket, region, key }) {
  const state = validateState(stateValue);
  state.updatedAt = state.updatedAt || new Date().toISOString();
  const body = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const cos = requireClient();
  await cos.putObject({
    Bucket: bucket,
    Region: region,
    Key: key,
    Body: body,
    ContentLength: body.length,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
    ACL: 'public-read'
  });
  return state;
}

module.exports = {
  DEFAULT_KEY,
  DEFAULT_KEYWORDS,
  DEFAULT_REFRESH_EVERY,
  emptyState,
  normalizeCursor,
  validateState,
  planSearch,
  completeSearch,
  publicObjectUrl,
  loadSearchState,
  saveSearchState
};
