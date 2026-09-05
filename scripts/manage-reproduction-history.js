#!/usr/bin/env node

// Maintain the private COS manifest of source videos already reconstructed.
const COS = require('cos-nodejs-sdk-v5');
const path = require('path');
const {
  credentials,
  DEFAULT_BUCKET,
  DEFAULT_REGION
} = require('./upload-to-cos');

const DEFAULT_KEY = 'buffer-media/reproduced-videos.json';

function argsFrom(argv) {
  const args = argv.slice(2);
  const arg = name => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? null : args[index + 1];
  };
  return { arg, has: name => args.includes(`--${name}`) };
}

function requireClient() {
  const skillDir = path.resolve(__dirname, '..');
  const { secretId, secretKey, token } = credentials(skillDir);
  if (!secretId || !secretKey || secretId.startsWith('PASTE_') || secretKey.startsWith('PASTE_')) {
    throw new Error('Reproduction history requires TENCENTCLOUD_SECRET_ID and TENCENTCLOUD_SECRET_KEY, or the two .tencent-cos-secret-* files in the skill directory.');
  }
  return new COS({
    SecretId: secretId,
    SecretKey: secretKey,
    ...(token ? { SecurityToken: token } : {})
  });
}

function emptyHistory() {
  return { version: 1, updatedAt: null, reproducedVideos: [] };
}

function normalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|share_|timestamp|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function sourceIdentity({ platform, sourceId, sourceUrl }) {
  const normalizedPlatform = String(platform || 'unknown').trim().toLowerCase();
  const normalizedId = String(sourceId || '').trim();
  if (normalizedId) return `${normalizedPlatform}:${normalizedId}`;
  const normalizedUrl = normalizeUrl(sourceUrl);
  return normalizedUrl ? `${normalizedPlatform}:url:${normalizedUrl}` : '';
}

function validateHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COS reproduction history must be a JSON object.');
  if (!Array.isArray(value.reproducedVideos)) throw new Error('COS reproduction history must contain a reproducedVideos array.');
  return {
    version: Number.isInteger(value.version) ? value.version : 1,
    updatedAt: value.updatedAt || null,
    reproducedVideos: value.reproducedVideos.filter(item => item && typeof item === 'object' && !Array.isArray(item))
  };
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

async function loadPublicHistory(bucket, region, key) {
  const response = await fetch(publicObjectUrl(bucket, region, key), { cache: 'no-store' });
  if (response.status === 403 || response.status === 404) {
    return { history: emptyHistory(), exists: false, bucket, region, key };
  }
  if (!response.ok) throw new Error(`COS reproduction history fetch failed (${response.status}).`);
  try {
    return { history: validateHistory(JSON.parse(await response.text())), exists: true, bucket, region, key };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`COS reproduction history is not valid JSON: ${error.message}`);
    throw error;
  }
}

async function loadHistory({
  bucket = process.env.REPRODUCTION_HISTORY_COS_BUCKET || DEFAULT_BUCKET,
  region = process.env.REPRODUCTION_HISTORY_COS_REGION || DEFAULT_REGION,
  key = process.env.REPRODUCTION_HISTORY_COS_KEY || DEFAULT_KEY
} = {}) {
  const cos = requireClient();
  try {
    const data = await cos.getObject({ Bucket: bucket, Region: region, Key: key });
    const text = Buffer.isBuffer(data.Body) ? data.Body.toString('utf8') : String(data.Body || '');
    return { history: validateHistory(JSON.parse(text)), exists: true, bucket, region, key };
  } catch (error) {
    if (isMissing(error)) return { history: emptyHistory(), exists: false, bucket, region, key };
    if (isAccessDenied(error)) return loadPublicHistory(bucket, region, key);
    if (error instanceof SyntaxError) throw new Error(`COS reproduction history is not valid JSON: ${error.message}`);
    throw error;
  }
}

async function saveHistory(history, { bucket, region, key }) {
  const cos = requireClient();
  const next = validateHistory(history);
  next.updatedAt = new Date().toISOString();
  const body = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
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
  return next;
}

function seenIdentities(history) {
  const values = new Set();
  for (const item of history.reproducedVideos || []) {
    const identity = item.identity || sourceIdentity(item);
    if (identity) values.add(identity);
    const normalizedUrl = normalizeUrl(item.sourceUrl);
    if (normalizedUrl) values.add(`url:${normalizedUrl}`);
  }
  return values;
}

function wasReproduced(history, source) {
  const identities = seenIdentities(history);
  const identity = sourceIdentity(source);
  const normalizedUrl = normalizeUrl(source.sourceUrl);
  return Boolean((identity && identities.has(identity)) || (normalizedUrl && identities.has(`url:${normalizedUrl}`)));
}

async function main() {
  const { arg, has } = argsFrom(process.argv);
  const mode = ['init', 'list', 'check', 'record'].find(name => has(name));
  if (!mode) {
    console.error('Usage: manage-reproduction-history.js --init | --list | --check --platform douyin (--source-id ID | --source-url URL) | --record --platform douyin (--source-id ID | --source-url URL) [--author NAME] [--description TEXT] [--likes N] [--duration N]');
    process.exit(1);
  }

  const loaded = await loadHistory({
    bucket: arg('bucket') || process.env.REPRODUCTION_HISTORY_COS_BUCKET || DEFAULT_BUCKET,
    region: arg('region') || process.env.REPRODUCTION_HISTORY_COS_REGION || DEFAULT_REGION,
    key: arg('key') || process.env.REPRODUCTION_HISTORY_COS_KEY || DEFAULT_KEY
  });

  if (mode === 'init') {
    const history = loaded.exists ? loaded.history : await saveHistory(loaded.history, loaded);
    console.log(JSON.stringify({ created: !loaded.exists, key: loaded.key, entries: history.reproducedVideos.length }, null, 2));
    return;
  }
  if (mode === 'list') {
    console.log(JSON.stringify({ key: loaded.key, ...loaded.history }, null, 2));
    return;
  }

  const source = {
    platform: arg('platform') || 'douyin',
    sourceId: arg('source-id') || '',
    sourceUrl: arg('source-url') || ''
  };
  const identity = sourceIdentity(source);
  if (!identity) throw new Error('--source-id or --source-url is required.');

  if (mode === 'check') {
    console.log(JSON.stringify({ identity, reproduced: wasReproduced(loaded.history, source), key: loaded.key }, null, 2));
    return;
  }

  if (wasReproduced(loaded.history, source)) {
    console.log(JSON.stringify({ identity, recorded: false, duplicate: true, key: loaded.key }, null, 2));
    return;
  }

  const numberOrNull = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  loaded.history.reproducedVideos.push({
    identity,
    platform: source.platform.toLowerCase(),
    sourceId: source.sourceId || null,
    sourceUrl: normalizeUrl(source.sourceUrl) || null,
    author: arg('author') || null,
    description: arg('description') || null,
    likes: numberOrNull(arg('likes')),
    durationSeconds: numberOrNull(arg('duration')),
    reproducedAt: new Date().toISOString(),
    status: 'reconstructed'
  });
  const history = await saveHistory(loaded.history, loaded);
  console.log(JSON.stringify({ identity, recorded: true, duplicate: false, key: loaded.key, entries: history.reproducedVideos.length }, null, 2));
}

module.exports = {
  DEFAULT_KEY,
  emptyHistory,
  normalizeUrl,
  sourceIdentity,
  validateHistory,
  publicObjectUrl,
  loadHistory,
  saveHistory,
  seenIdentities,
  wasReproduced
};

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
