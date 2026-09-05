#!/usr/bin/env node

// Add concise social-video text overlays to 8-15 storyboard images with FFmpeg.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};

const inputDir = arg('input');
const textsPath = arg('texts');
const outputDir = arg('output') || (inputDir ? path.join(inputDir, 'overlaid') : null);
const requestedFont = arg('font');
const yPercent = Number(arg('y-percent') || 0.28);

function usage() {
  console.error('Usage: add-text-overlays.js --input <images-dir> --texts <texts.json> [--output <dir>] [--font <font-file>] [--y-percent 0.28]');
  process.exit(1);
}

function shotFiles(dir) {
  return fs.readdirSync(dir)
    .filter(file => /^shot-\d+\.(jpe?g|png|webp)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function readTexts(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  const texts = Array.isArray(value) ? value : value.texts;
  if (!Array.isArray(texts) || texts.some(text => typeof text !== 'string')) {
    throw new Error('texts.json must be an array of strings or an object with a texts array.');
  }
  return texts;
}

function dimensions(file) {
  const output = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', file
  ], { encoding: 'utf8' });
  const stream = JSON.parse(output).streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error(`Could not read image dimensions: ${file}`);
  return stream;
}

function resolveFont() {
  const candidates = [
    requestedFont,
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Verdana Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'
  ].filter(Boolean);
  const found = candidates.find(file => fs.existsSync(file));
  if (found) return found;
  try {
    const matched = execFileSync('fc-match', ['-f', '%{file}', 'sans:style=bold'], { encoding: 'utf8' }).trim();
    if (matched && fs.existsSync(matched)) return matched;
  } catch {}
  throw new Error('No bold sans-serif font found. Pass --font with an installed TTF/OTF file.');
}

function stripEmoji(text) {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
}

function wrapLine(line, maxWords, maxChars) {
  const trimmed = line.trim();
  if (!trimmed) return [''];
  const words = trimmed.split(/\s+/);
  if (words.length === 1 && /[\u3400-\u9fff]/u.test(trimmed)) {
    const chunks = [];
    for (let index = 0; index < [...trimmed].length; index += maxChars) {
      chunks.push([...trimmed].slice(index, index + maxChars).join(''));
    }
    return chunks;
  }
  const lines = [];
  let current = [];
  for (const word of words) {
    const next = [...current, word];
    if (current.length && (next.length > maxWords || next.join(' ').length > maxChars)) {
      lines.push(current.join(' '));
      current = [word];
    } else {
      current = next;
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

function prepareText(value) {
  const clean = stripEmoji(value);
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  const maxWords = wordCount <= 5 ? 5 : 6;
  const maxChars = wordCount <= 5 ? 24 : 30;
  return clean.split('\n').flatMap(line => wrapLine(line, maxWords, maxChars)).join('\n');
}

function filterEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

function commandWorks(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function renderingEngine() {
  try {
    const filters = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (/\bdrawtext\b/.test(filters)) return 'ffmpeg-drawtext';
  } catch {}
  if (commandWorks('magick', ['-version'])) return 'imagemagick';
  if (commandWorks('convert', ['-version'])) return 'convert';
  throw new Error('Text rendering requires FFmpeg with drawtext or ImageMagick (magick/convert).');
}

function render(input, output, text, font, tempDir, engine) {
  const { width, height } = dimensions(input);
  const words = text.split(/\s+/).filter(Boolean).length;
  const fontPercent = words <= 5 ? 0.075 : words <= 12 ? 0.065 : 0.05;
  const fontSize = Math.max(36, Math.round(width * fontPercent));
  const borderWidth = Math.max(4, Math.round(fontSize * 0.15));
  const lineSpacing = Math.round(fontSize * 0.25);
  const prepared = prepareText(text);
  const textFile = path.join(tempDir, `${path.basename(input)}.txt`);
  fs.writeFileSync(textFile, `${prepared}\n`, 'utf8');
  if (engine === 'ffmpeg-drawtext') {
    const y = `max(h*0.10,min(h*${yPercent}-text_h/2,h*0.80-text_h))`;
    const filter = [
      `drawtext=fontfile='${filterEscape(font)}'`,
      `textfile='${filterEscape(textFile)}'`,
      `fontcolor=white`,
      `fontsize=${fontSize}`,
      `borderw=${borderWidth}`,
      `bordercolor=black`,
      `line_spacing=${lineSpacing}`,
      `x=(w-text_w)/2`,
      `y=${y}`
    ].join(':');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', filter, '-frames:v', '1', output], { stdio: 'inherit' });
    return;
  }
  const lineCount = prepared.split('\n').length;
  const estimatedHeight = lineCount * fontSize * 1.25;
  const y = Math.round(Math.max(height * 0.10, Math.min(height * yPercent - estimatedHeight / 2, height * 0.80 - estimatedHeight)));
  execFileSync(engine === 'imagemagick' ? 'magick' : 'convert', [
    input,
    '-font', font,
    '-pointsize', String(fontSize),
    '-gravity', 'North',
    '-fill', 'black',
    '-stroke', 'black',
    '-strokewidth', String(borderWidth),
    '-interline-spacing', String(lineSpacing),
    '-annotate', `+0+${y}`,
    prepared,
    '-fill', 'white',
    '-stroke', 'none',
    '-strokewidth', '0',
    '-annotate', `+0+${y}`,
    prepared,
    output
  ], { stdio: 'inherit' });
}

function main() {
  if (!inputDir || !textsPath || !Number.isFinite(yPercent) || yPercent < 0.15 || yPercent > 0.65) usage();
  const files = shotFiles(inputDir);
  const texts = readTexts(textsPath);
  if (files.length < 8 || files.length > 15) throw new Error(`Expected 8-15 shot images, found ${files.length}.`);
  if (texts.length !== files.length) throw new Error(`Expected ${files.length} overlay texts, found ${texts.length}.`);
  const font = resolveFont();
  const engine = renderingEngine();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-shot-overlays-'));
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    files.forEach((file, index) => {
      const input = path.join(inputDir, file);
      const output = path.join(outputDir, file.replace(/\.(jpe?g|webp)$/i, '.png'));
      render(input, output, texts[index], font, tempDir, engine);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ inputDir, outputDir, images: files.length, font, yPercent, engine }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { shotFiles, readTexts, stripEmoji, wrapLine, prepareText, renderingEngine };
