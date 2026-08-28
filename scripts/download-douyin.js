#!/usr/bin/env node

// Resolve a Douyin share link through TiKHub and download the source video.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
}
const has = name => args.includes(`--${name}`);

const shareUrl = arg('url');
const audioOnly = has('audio-only');
const libraryRoot = process.env.VIDEO_ASSET_LIBRARY || path.resolve(process.cwd(), 'media-library');
const assetStamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = arg('output') || path.join(libraryRoot, 'source-videos', `douyin-${assetStamp}.mp4`);
const audioOutput = arg('audio-output') || (has('extract-audio')
  ? path.join(libraryRoot, 'music', `douyin-${assetStamp}.m4a`)
  : null);
const skillDir = path.resolve(__dirname, '..');
const apiUrl = process.env.TIKHUB_API_URL
  || 'https://api.tikhub.io/api/v1/douyin/web/fetch_one_video_by_share_url';
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY
  || process.env.http_proxy || process.env.HTTP_PROXY
  || 'http://127.0.0.1:7897';
const mediaHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://www.douyin.com/',
  Accept: '*/*'
};

function readSecretFile(fileName) {
  const file = path.join(skillDir, fileName);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

const apiKey = process.env.TIKHUB_API_KEY || readSecretFile('.tikhub-api-key');

if (has('help') || !shareUrl || !apiKey) {
  console.error('Usage: download-douyin.js --url "https://v.douyin.com/..." [--output file.mp4] [--extract-audio | --audio-output file.m4a] [--audio-only]');
  if (!apiKey) console.error('Fill .tikhub-api-key or set TIKHUB_API_KEY');
  process.exit(has('help') ? 0 : 1);
}

function safeMessage(body) {
  if (!body || typeof body !== 'object') return String(body || 'unknown error');
  return String(body.message || body.msg || body.detail || body.error || 'unknown error').slice(0, 500);
}

function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '-L', '--fail-with-body', '--max-time', '120', '--proxy', proxyUrl,
      '-H', `Authorization: Bearer ${apiKey}`,
      '-H', 'Accept: application/json', url
    ], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || stdout.trim() || error.message));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('TiKHub returned invalid JSON')); }
    });
  });
}

async function requestJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });
  } catch (directError) {
    console.warn(`Direct TiKHub request failed (${directError.message}); retrying once through proxy.`);
    return curlJson(url);
  }
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok) throw new Error(`TiKHub request failed (${response.status}): ${safeMessage(body)}`);
  return body;
}

function looksLikeVideoUrl(value) {
  return typeof value === 'string'
    && /^https?:\/\//i.test(value)
    && !/\.(jpe?g|png|webp|gif|m3u8|mp3|aac|wav)(\?|$)/i.test(value)
    && /(video|play|download|aweme|douyin|byteimg|muscdn|douyinvod)/i.test(value);
}

function urlListAt(root, parts) {
  let value = root;
  for (const part of parts) value = value && value[part];
  if (!Array.isArray(value)) return null;
  return value.find(looksLikeVideoUrl) || null;
}

function preferredVideoUrl(body) {
  const paths = [
    ['data', 'aweme_detail', 'video', 'play_addr_h264', 'url_list'],
    ['data', 'aweme_detail', 'video', 'play_addr', 'url_list'],
    ['data', 'aweme_detail', 'video', 'download_addr', 'url_list']
  ];
  return paths.map(parts => urlListAt(body, parts)).find(Boolean) || null;
}

function collectVideoUrls(value, key = '', found = []) {
  if (typeof value === 'string') {
    if (key !== 'share_url' && looksLikeVideoUrl(value) && /(play|download|video|url|addr)/i.test(key)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVideoUrls(item, key, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      const normalized = childKey.toLowerCase();
      if (typeof childValue === 'string' && looksLikeVideoUrl(childValue)
        && normalized !== 'share_url'
        && /(play|download|video|url|addr|nwm)/i.test(normalized)) found.push(childValue);
      else collectVideoUrls(childValue, normalized, found);
    }
  }
  return found;
}

function firstUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) return value.find(url => typeof url === 'string' && /^https?:\/\//i.test(url)) || null;
  return null;
}

function musicFrom(body) {
  const detail = body?.data?.aweme_detail || body?.data?.aweme_details?.[0] || body?.data;
  const music = detail?.music || {};
  return {
    url: firstUrl(music.play_url?.url_list) || firstUrl(music.play_url?.uri) || firstUrl(music.play_url),
    title: music.title || null,
    artist: music.author || music.owner_nickname || null,
    id: music.id_str || music.id || null
  };
}

function curlDownload(url, destination) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '-L', '--fail-with-body', '--max-time', '300', '--proxy', proxyUrl,
      '-H', `User-Agent: ${mediaHeaders['User-Agent']}`,
      '-H', `Referer: ${mediaHeaders.Referer}`,
      '--output', destination, url
    ], { maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || stdout.trim() || error.message));
      resolve();
    });
  });
}

async function download(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', headers: mediaHeaders });
  } catch (directError) {
    console.warn(`Direct video download failed (${directError.message}); retrying once through proxy.`);
    await curlDownload(url, destination);
    return;
  }
  if (!response.ok) {
    console.warn(`Direct video download returned HTTP ${response.status}; retrying once through proxy.`);
    await curlDownload(url, destination);
    return;
  }
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function rejectHtmlDownload(destination) {
  const sample = fs.readFileSync(destination, { encoding: 'utf8', flag: 'r' }).slice(0, 512);
  if (/^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(sample)) {
    fs.rmSync(destination, { force: true });
    throw new Error('Downloaded response is HTML, not a video file');
  }
}

async function main() {
  const requestUrl = `${apiUrl}?share_url=${encodeURIComponent(shareUrl)}`;
  const body = await requestJson(requestUrl);
  if (!audioOnly) {
    const candidates = [...new Set([preferredVideoUrl(body), ...collectVideoUrls(body)].filter(Boolean))];
    if (!candidates.length) {
      throw new Error(`TiKHub response did not contain a downloadable video URL: ${safeMessage(body)}`);
    }
    let lastError;
    for (const candidate of candidates) {
      try {
        await download(candidate, output);
        rejectHtmlDownload(output);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        fs.rmSync(output, { force: true });
      }
    }
    if (lastError) throw lastError;
    const stat = fs.statSync(output);
    if (!stat.size) throw new Error('Downloaded video is empty');
  }
  const music = musicFrom(body);
  if (audioOutput) {
    if (!music.url) throw new Error('TiKHub response did not contain a downloadable Douyin music URL');
    await download(music.url, audioOutput);
  }
  console.log(JSON.stringify({
    video: audioOnly ? null : output,
    audio: audioOutput || null,
    music: { title: music.title, artist: music.artist, id: music.id }
  }, null, 2));
}

main().catch(error => { console.error(error.message); process.exit(1); });
