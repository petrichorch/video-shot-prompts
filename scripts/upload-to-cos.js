#!/usr/bin/env node

// Upload a local media file to Tencent COS and print its stable public HTTPS URL.
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');

const DEFAULT_BUCKET = 'codex-1306142582';
const DEFAULT_REGION = 'ap-singapore';

function argsFrom(argv) {
  const args = argv.slice(2);
  const arg = name => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? null : args[index + 1];
  };
  return { arg, has: name => args.includes(`--${name}`) };
}

function firstSecretFileLine(skillDir, name) {
  const file = path.join(skillDir, name);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

function credentials(skillDir) {
  return {
    secretId: process.env.TENCENTCLOUD_SECRET_ID || process.env.TENCENT_SECRET_ID || firstSecretFileLine(skillDir, '.tencent-cos-secret-id'),
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY || process.env.TENCENT_SECRET_KEY || firstSecretFileLine(skillDir, '.tencent-cos-secret-key'),
    token: process.env.TENCENTCLOUD_SESSION_TOKEN || process.env.TENCENT_SESSION_TOKEN || ''
  };
}

function safeSegment(value) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
}

function contentType(file) {
  const types = {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
  };
  return types[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function defaultObjectKey(file, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const parsed = path.parse(file);
  return `buffer-media/${month}/${safeSegment(parsed.name)}-${stamp}${safeSegment(parsed.ext.toLowerCase())}`;
}

function encodeObjectPath(objectKey) {
  return '/' + objectKey.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function uploadFile({ file, objectKey, bucket = DEFAULT_BUCKET, region = DEFAULT_REGION, dryRun = false }) {
  const absolute = path.resolve(file);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`Not a file: ${absolute}`);
  const key = objectKey || defaultObjectKey(absolute);
  const pathname = encodeObjectPath(key);
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const url = `https://${host}${pathname}`;
  if (dryRun) return { url, objectKey: key, uploaded: false, size: stat.size };

  const skillDir = path.resolve(__dirname, '..');
  const { secretId, secretKey, token } = credentials(skillDir);
  if (!secretId || !secretKey || secretId.startsWith('PASTE_') || secretKey.startsWith('PASTE_')) {
    throw new Error('Set TENCENTCLOUD_SECRET_ID and TENCENTCLOUD_SECRET_KEY, or fill the two .tencent-cos-secret-* files in the skill directory.');
  }
  const mime = contentType(absolute);
  const cos = new COS({ SecretId: secretId, SecretKey: secretKey, ...(token ? { SecurityToken: token } : {}) });
  await new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: bucket,
      Region: region,
      Key: key,
      Body: fs.createReadStream(absolute),
      ContentLength: stat.size,
      ContentType: mime,
      ACL: 'public-read'
    }, error => error ? reject(error) : resolve());
  });
  return { url, objectKey: key, uploaded: true, size: stat.size };
}

async function main() {
  const { arg, has } = argsFrom(process.argv);
  const file = arg('file');
  if (!file) {
    console.error('Usage: upload-to-cos.js --file /path/to/video.mp4 [--object-key buffer-media/name.mp4] [--bucket codex-1306142582] [--region ap-singapore] [--dry-run]');
    process.exit(1);
  }
  const result = await uploadFile({ file, objectKey: arg('object-key'), bucket: arg('bucket') || DEFAULT_BUCKET, region: arg('region') || DEFAULT_REGION, dryRun: has('dry-run') });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  uploadFile,
  defaultObjectKey,
  contentType,
  credentials,
  DEFAULT_BUCKET,
  DEFAULT_REGION
};
if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
