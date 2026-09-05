#!/usr/bin/env node

// Pull experimental Buffer post metrics and turn them into evidence-based iteration guidance.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const skillDir = path.resolve(__dirname, '..');
const libraryRoot = process.env.VIDEO_ASSET_LIBRARY || path.resolve(process.cwd(), 'media-library');
const receiptsDir = arg('receipts-dir') || path.join(libraryRoot, 'buffer', 'receipts');
const historyPath = arg('history') || path.join(libraryRoot, 'buffer', 'performance-history.json');
const reportPath = arg('output') || path.join(libraryRoot, 'buffer', 'reports', `${new Date().toISOString().slice(0, 10)}.md`);

function readSecretFile(name) {
  const file = path.join(skillDir, name);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim())
    .find(line => line && !line.startsWith('#')) || '';
}

const apiKey = process.env.BUFFER_API_KEY || readSecretFile('.buffer-api-key');

async function graphql(query, variables) {
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`Buffer API error: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

function receiptFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => /^buffer-.*\.json$/i.test(file))
    .sort()
    .map(file => path.join(dir, file));
}

function loadReceipts(dir) {
  const rows = [];
  for (const file of receiptFiles(dir)) {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const result of receipt.results || []) {
      const post = result?.result?.post;
      if (!post?.id) continue;
      rows.push({
        postId: post.id,
        channelId: post.channel?.id || result.channelId || null,
        service: post.channel?.service || result.service || null,
        channelName: post.channel?.name || null,
        title: receipt.title || '',
        caption: receipt.caption || '',
        dueAt: post.dueAt || receipt.date || null,
        source: receipt.source || {},
        creative: receipt.creative || {},
        receipt: file
      });
    }
  }
  return [...new Map(rows.map(row => [row.postId, row])).values()];
}

function numericMetrics(metrics) {
  const output = {};
  for (const metric of metrics || []) {
    const key = String(metric.name || metric.type || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const value = Number(metric.value);
    if (key && Number.isFinite(value)) output[key] = { value, unit: metric.unit || null, type: metric.type || null, name: metric.name || key };
  }
  return output;
}

function findMetric(metrics, patterns) {
  for (const [key, metric] of Object.entries(metrics)) {
    if (patterns.some(pattern => pattern.test(key))) return metric.value;
  }
  return null;
}

function summarizeMetrics(metrics) {
  const exposure = findMetric(metrics, [/^views?$/, /video_views?/, /plays?/, /impressions?/, /^reach$/]);
  const reactions = findMetric(metrics, [/likes?/, /reactions?/]) || 0;
  const comments = findMetric(metrics, [/comments?/]) || 0;
  const shares = findMetric(metrics, [/shares?/, /reposts?/]) || 0;
  const saves = findMetric(metrics, [/saves?/, /bookmarks?/]) || 0;
  const engagement = reactions + comments + shares + saves;
  return { exposure, engagement, engagementRate: exposure > 0 ? engagement / exposure : null };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function diagnosis(row, exposureMedian, rateMedian, comparableCount) {
  if (row.status !== 'sent') return 'Wait until the post is sent before evaluating it.';
  if (!row.metricsUpdatedAt || row.summary.exposure === null) return 'Metrics are not ready yet; Buffer ingestion may lag the social network by about 24 hours.';
  if (comparableCount < 3 || exposureMedian === null || rateMedian === null) return 'Collect at least three comparable sent posts before drawing a performance conclusion.';
  const highExposure = row.summary.exposure >= exposureMedian;
  const highEngagement = row.summary.engagementRate >= rateMedian;
  if (highExposure && highEngagement) return 'Preserve this opening hook, overlay style, process pacing, and reveal structure; test a close variation.';
  if (highExposure && !highEngagement) return 'Reach is healthy but response is weak; improve the overlay promise, process payoff, final reveal, or CTA without discarding the opening format.';
  if (!highExposure && highEngagement) return 'People who see it respond; strengthen the first-frame visual, opening overlay, cover choice, or posting time while keeping the core process.';
  return 'Test a different source blueprint, opening visual, overlay hook, or pacing pattern; do not infer a single cause from this post alone.';
}

function markdown(rows, reportDate) {
  const comparable = rows.filter(row => row.status === 'sent' && row.metricsUpdatedAt && row.summary.exposure !== null && row.summary.engagementRate !== null);
  const exposureMedian = median(comparable.map(row => row.summary.exposure));
  const rateMedian = median(comparable.map(row => row.summary.engagementRate));
  let text = `# Buffer performance feedback — ${reportDate}\n\n`;
  text += `Buffer post metrics are experimental, available for personal workflows, and may lag by about 24 hours. Recommendations below use relative comparisons only.\n\n`;
  text += `| Service | Post | Status | Exposure | Engagement | Rate | Metrics updated |\n`;
  text += `|---|---|---|---:|---:|---:|---|\n`;
  for (const row of rows) {
    const rate = row.summary.engagementRate === null ? '—' : `${(row.summary.engagementRate * 100).toFixed(2)}%`;
    text += `| ${row.service || 'unknown'} | ${row.postId} | ${row.status || 'unknown'} | ${row.summary.exposure ?? '—'} | ${row.summary.engagement} | ${rate} | ${row.metricsUpdatedAt || '—'} |\n`;
  }
  text += `\n## Next-run guidance\n\n`;
  for (const row of rows) text += `- **${row.service || 'unknown'} / ${row.postId}:** ${diagnosis(row, exposureMedian, rateMedian, comparable.length)}\n`;
  return text;
}

async function main() {
  if (!apiKey || apiKey.startsWith('PASTE_')) throw new Error('Set BUFFER_API_KEY or fill .buffer-api-key in the skill directory. A personal API key with postsRead and insightsRead is required.');
  const receipts = loadReceipts(receiptsDir);
  if (!receipts.length) throw new Error(`No Buffer receipts found in ${receiptsDir}. Publish through publish-to-buffer.js first.`);
  const checkedAt = new Date().toISOString();
  const rows = [];
  for (const receipt of receipts) {
    const data = await graphql(`query PostPerformance($input: PostInput!) { post(input: $input) { id text channelId channelService status dueAt sentAt externalLink metrics { type name value unit } metricsUpdatedAt } }`, { input: { id: receipt.postId } });
    const post = data.post;
    const metrics = numericMetrics(post?.metrics);
    rows.push({ ...receipt, ...post, checkedAt, metrics, summary: summarizeMetrics(metrics) });
  }

  let history = { version: 1, updatedAt: null, posts: [] };
  if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const byId = new Map((history.posts || []).map(post => [post.postId || post.id, post]));
  for (const row of rows) {
    const previous = byId.get(row.postId) || {};
    const snapshots = Array.isArray(previous.snapshots) ? previous.snapshots : [];
    if (!snapshots.some(snapshot => snapshot.metricsUpdatedAt === row.metricsUpdatedAt && JSON.stringify(snapshot.metrics) === JSON.stringify(row.metrics))) {
      snapshots.push({ checkedAt, metricsUpdatedAt: row.metricsUpdatedAt || null, status: row.status || null, metrics: row.metrics, summary: row.summary });
    }
    byId.set(row.postId, { ...previous, ...row, snapshots });
  }
  history = { version: 1, updatedAt: checkedAt, posts: [...byId.values()] };
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  fs.writeFileSync(reportPath, markdown(rows, checkedAt.slice(0, 10)));
  console.log(JSON.stringify({ receipts: receipts.length, postsChecked: rows.length, historyPath, reportPath }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });

module.exports = { receiptFiles, loadReceipts, numericMetrics, summarizeMetrics, median, diagnosis, markdown };
