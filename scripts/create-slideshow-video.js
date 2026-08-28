#!/usr/bin/env node

// Build a vertical slideshow video from generated shots and a selected music file.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
}

const imagesDir = arg('images-dir');
const sourceVideo = arg('source-video');
const audioFile = arg('audio');
const libraryRoot = process.env.VIDEO_ASSET_LIBRARY || path.resolve(process.cwd(), 'media-library');
const assetStamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = arg('output') || path.join(libraryRoot, 'generated-videos', `slideshow-${assetStamp}.mp4`);
const slideSeconds = Number(arg('slide-seconds') || 2.5);
const audioStart = Number(arg('audio-start') || 0);

if (!imagesDir || (!audioFile && !sourceVideo) || !Number.isFinite(slideSeconds) || slideSeconds <= 0) {
  console.error('Usage: create-slideshow-video.js --images-dir <outputs> --audio <music.mp3> [--source-video <fallback.mp4>] [--output slideshow.mp4] [--slide-seconds 2.5] [--audio-start 0]');
  process.exit(1);
}

const images = fs.readdirSync(imagesDir)
  .filter(file => /^shot-\d+\.(jpe?g|png|webp)$/i.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map(file => path.join(imagesDir, file));

if (!images.length) throw new Error(`No shot-*.jpg/png/webp files found in ${imagesDir}`);
const audioSource = audioFile || sourceVideo;
if (!fs.existsSync(audioSource)) throw new Error(`Audio source not found: ${audioSource}`);

const totalSeconds = images.length * slideSeconds;
const ffmpegArgs = ['-y'];
for (const image of images) ffmpegArgs.push('-loop', '1', '-t', String(slideSeconds), '-i', image);
const audioInput = images.length;
ffmpegArgs.push('-stream_loop', '-1', '-ss', String(audioStart), '-i', audioSource);

const filters = images.map((_, index) =>
  `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}]`
);
filters.push(`${images.map((_, index) => `[v${index}]`).join('')}concat=n=${images.length}:v=1:a=0[vout]`);

ffmpegArgs.push(
  '-filter_complex', filters.join(';'),
  '-map', '[vout]', '-map', `${audioInput}:a:0?`, '-t', String(totalSeconds),
  '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart', output
);

fs.mkdirSync(path.dirname(output), { recursive: true });
console.log(`Creating ${images.length}-slide video (${totalSeconds.toFixed(1)}s) with audio from ${audioSource}`);
execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
console.log(`Wrote ${output}`);
