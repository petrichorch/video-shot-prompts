#!/usr/bin/env node

// Resolve a TikTok share link through TiKHub and download its video or music track.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const has = name => args.includes(`--${name}`);
const shareUrl = arg('url');
const audioOnly = has('audio-only');
const libraryRoot = process.env.VIDEO_ASSET_LIBRARY || path.resolve(process.cwd(), 'media-library');
const assetStamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = arg('output') || path.join(libraryRoot, 'source-videos', `tiktok-${assetStamp}.mp4`);
const audioOutput = arg('audio-output') || (has('extract-audio')
  ? path.join(libraryRoot, 'music', `tiktok-${assetStamp}.m4a`)
  : null);
const skillDir = path.resolve(__dirname, '..');
const apiUrl = process.env.TIKHUB_TIKTOK_API_URL
  || 'https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url_v2';
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY
  || process.env.http_proxy || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';

function readSecretFile(fileName) {
  const file = path.join(skillDir, fileName);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

const apiKey = process.env.TIKHUB_API_KEY || readSecretFile('.tikhub-api-key');

function usage() {
  console.error('Usage: download-tiktok.js --url "https://vm.tiktok.com/..." [--output file.mp4] [--extract-audio | --audio-output file.m4a] [--audio-only]');
}

if (has('help') || !shareUrl || !apiKey) {
  usage();
  if (!apiKey) console.error('Fill .tikhub-api-key or set TIKHUB_API_KEY');
  process.exit(has('help') ? 0 : 1);
}

function safeMessage(body) {
  return String(body?.message || body?.msg || body?.detail || body?.error || 'unknown error').slice(0, 500);
}

function curlJson(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sS', '-L', '--fail-with-body', '--max-time', '120', '--proxy', proxyUrl,
      '-H', `Authorization: Bearer ${apiKey}`, '-H', 'Accept: application/json', url],
    { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || stdout.trim() || error.message));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('TiKHub returned invalid JSON')); }
    });
  });
}

async function requestJson(url) {
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { message: text }; }
    if (!response.ok) throw new Error(`TiKHub request failed (${response.status}): ${safeMessage(body)}`);
    return body;
  } catch (error) {
    console.warn(`Direct TiKHub request failed (${error.message}); retrying once through proxy.`);
    return curlJson(url);
  }
}

function firstUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) return value.find(url => typeof url === 'string' && /^https?:\/\//i.test(url)) || null;
  return null;
}

function detailFrom(body) {
  const details = body?.data?.aweme_details;
  return Array.isArray(details) ? details[0] : details || body?.data?.aweme_detail || null;
}

function mediaUrls(body) {
  const detail = detailFrom(body);
  const video = detail?.video || {};
  const music = detail?.music || {};
  return {
    video: firstUrl(video.play_addr_h264?.url_list)
      || firstUrl(video.play_addr?.url_list)
      || firstUrl(video.download_no_watermark_addr?.url_list)
      || firstUrl(video.download_addr?.url_list),
    audio: firstUrl(music.play_url?.url_list),
    title: music.title || null,
    artist: music.author || null
  };
}

function curlDownload(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    execFile('curl', ['-sS', '-L', '--fail-with-body', '--max-time', '300', '--proxy', proxyUrl, '--output', destination, url],
    { maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || stdout.trim() || error.message));
      resolve();
    });
  });
}

async function download(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`media download returned HTTP ${response.status}`);
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.warn(`Direct media download failed (${error.message}); retrying once through proxy.`);
    await curlDownload(url, destination);
  }
  if (!fs.statSync(destination).size) throw new Error(`Downloaded file is empty: ${destination}`);
}

async function main() {
  const body = await requestJson(`${apiUrl}?share_url=${encodeURIComponent(shareUrl)}`);
  const media = mediaUrls(body);
  if (!audioOnly) {
    if (!media.video) throw new Error(`TiKHub response did not contain a downloadable TikTok video URL: ${safeMessage(body)}`);
    await download(media.video, output);
  }
  if (audioOutput) {
    if (!media.audio) throw new Error('TiKHub response did not contain a downloadable TikTok music URL');
    await download(media.audio, audioOutput);
  }
  console.log(JSON.stringify({ video: audioOnly ? null : output, audio: audioOutput || null, music: { title: media.title, artist: media.artist } }, null, 2));
}

main().catch(error => { console.error(error.message); process.exit(1); });
