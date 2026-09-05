#!/usr/bin/env node

// Schedule publicly hosted media to connected Buffer channels.
const fs = require('fs');
const path = require('path');
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
const { uploadFile } = require('./upload-to-cos');

if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const args = process.argv.slice(2);
const skillDir = path.resolve(__dirname, '..');
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const has = name => args.includes(`--${name}`);
const readSecretFile = name => {
  const file = path.join(skillDir, name);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
};
const apiKey = process.env.BUFFER_API_KEY || readSecretFile('.buffer-api-key');
const listChannels = has('list-channels');
const caption = arg('caption') || '';
const title = arg('title') || '';
const videoUrlArg = arg('video-url');
const localVideo = arg('video');
const imageUrls = (arg('image-urls') || '').split(',').map(url => url.trim()).filter(Boolean);
const channelsRaw = arg('channels') || '';
const date = arg('date');
const dryRun = has('dry-run');
const youtubeCategoryId = arg('youtube-category-id') || '22';
const sourceUrl = arg('source-url') || '';
const sourceId = arg('source-id') || '';
const music = arg('music') || '';
const shotCount = Number(arg('shot-count') || 0) || null;
const overlayStyle = arg('overlay-style') || '';

function usage() {
  console.error('Usage: publish-to-buffer.js --list-channels | --caption "..." --channels "all|tiktok=<id>,instagram=<id>,youtube=<id>,facebook=<id>" (--video /path/video.mp4 | --video-url https://... | --image-urls https://...,https://...) [--title "..."] [--date ISO] [--youtube-category-id 22] [--source-url URL] [--source-id ID] [--music FILE] [--shot-count N] [--overlay-style NAME] [--dry-run]');
  process.exit(1);
}
function parseChannels(value) {
  const entries = value.split(',').map(part => part.trim()).filter(Boolean).map(part => part.split('='));
  if (!entries.length || entries.some(([service, id]) => !service || !id)) throw new Error('Use --channels "tiktok=<id>,instagram=<id>,youtube=<id>,facebook=<id>"');
  return Object.fromEntries(entries.map(([service, id]) => [service.trim().toLowerCase(), id.trim()]));
}
function publicHttps(url) {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}
async function graphql(query, variables = {}) {
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`Buffer API error: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}
async function getConnectedChannels() {
  const data = await graphql(`query { account { organizations { id name } } }`);
  const results = [];
  for (const organization of data.account.organizations || []) {
    const channelData = await graphql(
      `query Channels($organizationId: OrganizationId!) { channels(input: { organizationId: $organizationId }) { id name service } }`,
      { organizationId: organization.id }
    );
    results.push(...(channelData.channels || []).map(channel => ({ ...channel, organizationId: organization.id, organizationName: organization.name })));
  }
  return results;
}
async function main() {
  if (listChannels) {
    if (!apiKey || apiKey.startsWith('PASTE_')) throw new Error('Set BUFFER_API_KEY or fill .buffer-api-key in the skill directory.');
    console.log(JSON.stringify(await getConnectedChannels(), null, 2));
    return;
  }
  const mediaChoices = [Boolean(localVideo), Boolean(videoUrlArg), Boolean(imageUrls.length)].filter(Boolean).length;
  if (!caption || !channelsRaw || mediaChoices !== 1) usage();
  if (/[㐀-鿿]/.test(caption)) throw new Error('Caption contains CJK text. Use natural English copy for the selected Western market.');
  let videoUrl = videoUrlArg;
  let cosUpload = null;
  if (localVideo) {
    cosUpload = await uploadFile({ file: localVideo, dryRun });
    videoUrl = cosUpload.url;
  }
  const urls = videoUrl ? [videoUrl] : imageUrls;
  if (!urls.every(publicHttps)) throw new Error('Buffer requires stable, direct, publicly accessible HTTPS media URLs.');
  if (date && (Number.isNaN(Date.parse(date)) || Date.parse(date) <= Date.now())) throw new Error('--date must be a future ISO timestamp.');
  const channels = channelsRaw.toLowerCase() === 'all'
    ? await getConnectedChannels()
    : Object.entries(parseChannels(channelsRaw)).map(([service, id]) => ({ service, id }));
  if (!channels.length) throw new Error('No connected Buffer channels found. Connect at least one destination or pass explicit --channels values.');
  const assets = videoUrl
    ? [{ video: { url: videoUrl, metadata: { title: title || undefined, thumbnailOffset: 1000 } } }]
    : imageUrls.map(url => ({ image: { url } }));
  const targets = channels.map(({ service, id: channelId }) => {
    service = service.toLowerCase();
    const metadata = {};
    if (service === 'instagram') metadata.instagram = { type: videoUrl ? 'reel' : 'post', shouldShareToFeed: true };
    if (service === 'tiktok' && title) metadata.tiktok = { title };
    if (service === 'youtube') metadata.youtube = { title: title || caption.slice(0, 95), categoryId: youtubeCategoryId, privacy: 'public', madeForKids: false, notifySubscribers: true };
    return { service, channelId, input: {
      text: caption, channelId, assets, metadata, schedulingType: 'automatic',
      mode: date ? 'customScheduled' : 'addToQueue', ...(date ? { dueAt: new Date(date).toISOString() } : {})
    } };
  });
  if (dryRun) { console.log(JSON.stringify({ cosUpload, targets }, null, 2)); return; }
  if (!apiKey || apiKey.startsWith('PASTE_')) throw new Error('Set BUFFER_API_KEY or fill .buffer-api-key in the skill directory.');
  const results = [];
  for (const target of targets) {
    const data = await graphql(`mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt channel { id name service } } } ... on MutationError { message } } }`, { input: target.input });
    results.push({ service: target.service, channelId: target.channelId, result: data.createPost });
  }
  const createdAt = new Date().toISOString();
  const receipt = {
    createdAt,
    date: date || null,
    title,
    caption,
    source: { id: sourceId || null, url: sourceUrl || null },
    creative: { music: music || null, shotCount, overlayStyle: overlayStyle || null },
    cosUpload,
    results
  };
  const libraryRoot = process.env.VIDEO_ASSET_LIBRARY || path.resolve(process.cwd(), 'media-library');
  const receiptDir = path.join(libraryRoot, 'buffer', 'receipts');
  const receiptName = `buffer-${createdAt.replace(/[:.]/g, '-')}.json`;
  fs.mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, receiptName);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(path.join(process.cwd(), 'buffer-meta.json'), `${JSON.stringify({ ...receipt, receiptPath }, null, 2)}\n`);
  receipt.receiptPath = receiptPath;
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(error => { console.error(error.message); process.exit(1); });
