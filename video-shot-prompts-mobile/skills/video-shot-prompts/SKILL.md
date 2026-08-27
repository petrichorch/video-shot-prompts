---
name: video-shot-prompts
description: Analyze local, Douyin, or TikTok videos into detailed storyboard prompts and preview images, or create a 6-8 shot wool-felting storyboard from bundled process references when no video is supplied. Use for shot reconstruction, continuity analysis, reference comparison, music extraction, next-shot work, generated previews, and original wool-felting concept storyboards.
---

# Video Shot Prompts

## Overview

Turn a video into a visually faithful shot list and reusable prompts, or build an original 6-8 shot wool-felting construction sequence from the bundled Devon Rex process study when no source is supplied. Preserve the actual craft stage, camera framing, hand actions, material state, lighting, background, subject identity, capture quality, and aspect ratio. Favor evidence density over decorative wording: a useful prompt records the exact visible state and physical change, not merely the general activity.

## Persistent asset library

Store durable assets in the absolute path from `VIDEO_ASSET_LIBRARY` when it is set. Otherwise use `$PWD/media-library`, which works in both local and Codex cloud workspaces:

| Asset | Directory |
| --- | --- |
| Downloaded source videos | `source-videos/` |
| Extracted or licensed music | `music/` |
| Generated storyboard/product images | `generated-images/` |
| Finished slideshow and rendered videos | `generated-videos/` |

Use timestamped, descriptive filenames and never overwrite an existing library asset. The task `work/` directory is only for transient frames, contact sheets, and retries. Save a generated image or finished video to the library as its canonical copy; create a task-local copy only when a tool requires one. Reuse library assets by their absolute paths in later conversations.

Before the first asset write, set `ASSET_LIBRARY="${VIDEO_ASSET_LIBRARY:-$PWD/media-library}"` and create any missing directories with `mkdir -p "$ASSET_LIBRARY"/{source-videos,music,generated-images,generated-videos}`. The download and slideshow scripts create their own parent folders automatically; image-generation outputs require the target `generated-images/` directory to exist.

## Preflight and configuration discovery

Before analyzing or publishing, check the actual skill directory and executable health. Do not infer that configuration is missing just because it is not inside the user's current video workspace:

- Skill directory: `${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/`.
- Image generation key: read the first non-empty, non-comment line of `.apiyi-key` in that directory.
- TiKHub API key: read the first non-empty, non-comment line of `.tikhub-api-key` in that directory.
- Buffer API key: read the first non-empty, non-comment line of `.buffer-api-key` in that directory, or use `BUFFER_API_KEY`.
- Tencent COS upload key: prefer `TENCENTCLOUD_SECRET_ID` and `TENCENTCLOUD_SECRET_KEY`; local fallbacks are `.tencent-cos-secret-id` and `.tencent-cos-secret-key`. The uploader uses the official `cos-nodejs-sdk-v5` dependency. Use a dedicated CAM sub-user limited to uploads into `codex-1306142582`, never a root account key.
- Verify `ffprobe -version` before running frame extraction. If it fails with a macOS `dyld` message such as `libxcb.1.dylib` missing, report the exact missing library and repair the local Homebrew dependency before claiming that the source video is unreadable. Do not silently switch tools or alter the original video.

## Western market defaults

When the user targets Europe or the United States, treat the audience as the primary content constraint:

- Write generation prompts, titles, captions, hooks, and calls to action in natural English. Use US English for `us`, UK English for `uk`, and neutral international English for `eu`.
- Adapt references, idioms, spelling, units, and calls to action to the selected market. Do not translate Chinese phrasing literally, use China-specific platform language, or put Chinese text in the creative unless explicitly requested.
- Keep the first caption line as a clear English hook. Describe the actual craft or product state, avoid unsupported claims, and use a restrained CTA appropriate to the platform.
- For Buffer scheduling, use `us` with `America/New_York`, `uk` with `Europe/London`, or `eu` with `Europe/Berlin`. The default posting windows are local `09:00`, `13:00`, and `19:00`; override them only when the user's audience data supports a different schedule.
- Treat C2PA and other provenance metadata as part of the asset's authenticity record. Preserve it when present and do not strip or falsify AI-origin information.

## Workflow

### 0. Route the request

- **Source-driven mode:** When the user supplies a local/uploaded video or Douyin/TikTok link, follow steps 1-10 and keep every shot evidence-based.
- **Bundled-reference concept mode:** When the user asks for a wool-felting storyboard but supplies no video, read `references/no-input-wool-felting.md`, inspect the bundled keyframes, and create a coherent 6-8 shot concept. Do not invent timestamps or claim that generated stages came from a new source video.
- If the user supplies neither a source nor a wool-felting concept, ask for a subject or propose one concise default; do not silently force the Devon cat onto an unrelated request.

### 1. Inspect the source

If the source is a Douyin or TikTok share link rather than a local file, download it first through TiKHub. The key is read locally from `.tikhub-api-key`; do not paste it into a command, prompt, log, or source file:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/download-douyin.js" \
  --url "https://v.douyin.com/..."
```

For TikTok, use the dedicated downloader. Add `--audio-output` when the user asks to reuse the reference video's music; it downloads the source music track alongside the video and prints its credited title and artist when available:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/download-tiktok.js" \
  --url "https://vm.tiktok.com/..." \
  --extract-audio
```

The Douyin downloader calls `GET https://api.tikhub.io/api/v1/douyin/web/fetch_one_video_by_share_url`; the TikTok downloader calls `GET https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url_v2`. Both pass `share_url` with Bearer authentication, try the network directly first, and use the configured local proxy only after a direct network failure. Use only videos and audio that the user has permission to download and repurpose.

- Confirm the local video is readable.
- Use `ffprobe` to collect duration, dimensions, frame rate, and codecs.
- Preserve the original orientation. A 576x1024 source is vertical 9:16; do not silently rewrite it as landscape.
- Extract an initial contact sheet at about 1 frame per second. For short videos, sample every 0.5-1 second; for longer videos, use roughly 20-40 representative frames.
- Treat this initial contact sheet only as a sequence overview. Do not use it as the sole evidence for final shot boundaries or detailed prompts.
- For every candidate shot, extract full-resolution frames at its beginning, middle, and end. Sample at 3-5 frames per second around fast craft actions, material changes, or suspected cuts.
- When a transition or action is ambiguous, inspect adjacent full-resolution frames on both sides of the timestamp. Continue sampling until the tool direction, contact point, and material state are visible.

Typical commands:

```sh
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate,codec_name \
  -of default=noprint_wrappers=1 "input.mp4"
ffmpeg -y -i "input.mp4" -vf "fps=1,scale=480:-1" "work/frame_%03d.jpg"
ffmpeg -y -ss 00:04 -i "input.mp4" -t 3 -vf "fps=4" "work/detail_%03d.png"
```

Use contact sheets for scanning the sequence, then inspect keyframes individually. Do not infer a precise action from a tiny thumbnail when the action affects the prompt. If full-resolution frames contradict the initial contact-sheet interpretation, correct the timeline before writing prompts.

### 2. Identify real shot boundaries

Split on meaningful visual changes, not fixed one-second intervals. A new shot normally starts when at least one of these changes:

- camera angle, distance, or surface;
- subject or material stage;
- hand position and tool/action;
- background or reference subject;
- composition changes from head to body, body to finished reveal, or craft process to comparison.

Detect both hard edits and continuous state changes. A single uninterrupted camera take may still require multiple prompt shots when the action changes from shaping a muzzle to attaching colored wool, or when loose fibers become an attached patch. Each prompt must describe one visual moment or one coherent material transformation.

Use this mandatory two-pass segmentation process:

1. Mark coarse boundaries from the overview contact sheet and, when useful, scene-change detection.
2. Resample each candidate boundary at 3-5 fps and adjust it using full-resolution frames.

For each shot, record an approximate start and end time. Use ranges such as `00:04.3-00:06.2` when sub-second precision matters. Mention uncertainty instead of inventing exact cuts. Never combine visibly different subjects, material stages, or actions merely because they occur within the same two-second interval.

### 3. Track continuity

Maintain a compact continuity table:

| Field | What to track |
|---|---|
| Subject | species, breed/type, color, size, unfinished or finished state |
| Material | loose roving, partially compacted fibers, attached patch, finished surface |
| Tool | needle, handle color, scissors, fingers, brush, etc. |
| Action | gather, pinch, wrap, poke, compress, attach, trim, reveal |
| Camera | first-person, overhead, macro, handheld, distance, orientation |
| Setting | pine desk, foam pad, fabric, background reference subject |
| Lighting | warm indoor, flat phone light, soft daylight, shadows |
| Capture character | casual smartphone still, compression, motion blur, focus falloff, polished or ordinary |

The next prompt must continue from the previous state. If one shot shows loose brown wool being placed on a torso, the next should show that same wool being poked or compressed, not a finished body.

Before writing prose, create a micro-state record for every shot:

| Required field | Question to answer from inspected frames |
|---|---|
| Existing state | What is already completed and visibly present before this action? |
| Active change | What exactly are the hands and tool doing now? |
| Material transition | What changes from loose to attached, flat to shaped, unfinished to refined? |
| End state | What is newly formed by the end, and what remains unfinished? |
| Action geometry | Which hand supports what, what is the tool angle, and where is the contact point? |
| Anchor features | Which nose, eyes, muzzle, cheeks, markings, limbs, or proportions must remain visible? |
| Imperfections | Which stray fibers, uneven edges, gaps, loose tufts, or handmade irregularities are visible? |
| Capture style | What phone-camera, focus, lighting, compression, or motion characteristics are visible? |

Write `uncertain` for a field that cannot be verified. Do not silently replace missing evidence with a generic or polished interpretation.

### 4. Write each prompt

First decide the requested output mode:

- For an image or storyboard frame, freeze one specific micro-moment. Describe the visible state at that instant rather than summarizing the whole action.
- For a generated video clip, describe a physically plausible start state, action progression, and end state. Use explicit temporal language such as `at first`, `as the needle repeatedly pokes`, and `by the end`.
- If the user does not specify a mode, default to a detailed video-still prompt and label it as such when the distinction matters.

Write one English prompt per shot. Prefer this order:

1. shot type and camera perspective;
2. existing subject state and anchor features;
3. real hands, support grip, and physical action;
4. tool appearance, angle, and exact contact point;
5. material transition and current degree of completion;
6. visible colors, shape, texture, stray fibers, and imperfections;
7. background and surface;
8. light, focus, motion blur, compression, and phone-camera character;
9. aspect ratio and composition.

Use concrete visual language:

- `loose, airy, frizzy wool roving` instead of `beautiful wool`;
- `one hand supports the underside while the other hand pokes diagonally with a beige wooden-handled felting needle` instead of `someone makes a dog`;
- `still unfinished, with stray fibers sticking out` whenever the source is visibly in progress.

Avoid vague filler such as `gentle hand movement`, `realistic craft detail`, `beautiful handmade object`, or `high-detail texture` unless it follows concrete visible evidence. Name the action, direction, contact point, surface state, and imperfection instead.

Do not omit features that are already complete merely because they are not changing. If the frame already contains a tiny black nose, curved closed eyes, a short flat muzzle, and rounded puffy cheeks, include them so the generator does not invent a different face or breed.

Keep the prompt faithful to the source rather than improving it. Translate visible capture artifacts into prompt language such as `casual smartphone video still`, `slightly compressed phone-camera quality`, `mild motion blur`, or `ordinary warm indoor lighting` when supported by the frames. Do not turn casual phone footage into polished product photography unless the source is actually polished.

### 5. Add negative prompts

Include a short negative prompt when generation is likely to drift. Derive it from the inspected frame and the most likely model errors, in this priority order:

1. wrong temporal stage or completion level;
2. wrong subject identity, breed, or facial state;
3. wrong material or surface quality;
4. wrong action, tool, or attachment state;
5. wrong camera style, orientation, or scale;
6. unwanted overlays.

Target observed failure modes:

- wrong stage: `not a finished sculpture`, `not already completed`;
- wrong identity: `not a poodle`, `not a bichon frise` when the source is a Shih Tzu-like dog;
- wrong medium: `not smooth synthetic fur`, `not plastic`, `not cartoon`;
- wrong framing: `not horizontal`, `not a studio macro photo`;
- wrong action: `not merely holding the wool`, `not a finished ear`;
- unwanted overlays: `no subtitles, no logo, no watermark`.

Prefer explicit contrastive phrases such as `not a finished dog`, `not open eyes`, `not a perfectly attached ear`, and `not a clean studio macro photo` when those are the primary risks. Do not add a generic long negative list if it contradicts the source. Do not say `no dog in background` if the source visibly contains a reference dog.

### 6. Compare a supplied reference image

When the user supplies a generated image or asks why it differs from the video, compare:

- temporal stage: too early, too late, or correct;
- subject identity and silhouette;
- material looseness, fiber direction, and unfinished quality;
- tool type, hand anatomy, and action direction;
- framing, aspect ratio, subject scale, and camera distance;
- surface, background objects, light temperature, and focus;
- realism level and phone-video artifacts.

State the most important mismatch first. Then rewrite the prompt with explicit correction phrases. Use `not ...` constraints for the top two or three errors, not every possible error.

### 7. Handle “下一张/下一个分镜”

When the user asks for the next shot without restating the video:

- use the established timeline and continuity table;
- identify the next meaningful visual state from the video, not the next generic craft action;
- state the shot title in Chinese;
- provide one English prompt and a concise negative prompt;
- call out the one detail that must not drift.

If the user corrects the stage, accept the correction and re-anchor to the actual video sequence. Do not defend the earlier guess.

### 8. Generate preview images (default: on)

After completing the shot analysis (steps 1-5), generate a preview image for every shot by default—do not stop at prompts alone. Only skip generation if the user explicitly asks for prompts only.

Prefer the native `imagegen`/ImageGen tool whenever it is available. Generate the identity anchor first, then generate each non-final shot with the identity anchor as the reference image and an explicit construction-stage override. Use `scripts/generate_image.py` through APIYi only when native ImageGen is unavailable. The API fallback may incur cost: do not retry or fail over after an ambiguous failure without user confirmation. In bundled-reference concept mode, inspect the bundled frames for craft grammar and capture style, but generate fresh compositions rather than editing or cloning the reference frames.

Use a three-anchor continuity strategy. The goal is to keep the generated sequence consistent and source-realistic without returning near-duplicates of the video frames.

1. **Find the final-product frame first.** Before generating the storyboard previews, locate the clearest finished-subject moment near the end of the source video. Prefer a frame where the final craft/object is fully visible, well lit, and representative of the subject identity. Extract this frame as an internal analysis reference such as `work/final-product-frame.jpg`.
2. **Create an identity anchor image.** Generate one fresh preview that recreates the final-product frame's subject identity and capture style. Do not pass the source video frame as `--reference` unless the user explicitly requests an edit or near-copy. Use the extracted frame only for visual analysis while writing the prompt. Save the canonical result under `generated-images/` in the persistent asset library.
3. **Treat the identity anchor as the final-product preview.** If the storyboard includes a final reveal, completed object, or product-comparison shot, reuse the canonical library identity-anchor file instead of generating another final-product image. In the shot list, note that the final shot reuses the identity anchor. Only create a separate final-shot image when the final shot has a different required composition from the anchor, such as a comparison against a reference subject or a wider reveal.
4. **Use the same identity anchor for other previews.** For every non-final storyboard shot, pass the identity anchor image with `--reference` to preserve subject identity, proportions, material quality, and capture style. Do not chain each generated shot into the next one by default, because this accumulates drift. Use the previous shot as reference only for a local continuation where the user explicitly wants that behavior.
5. **Add a stage anchor in every prompt.** Each shot prompt must explicitly override the anchor image's finished state with the shot's actual source-video stage: `early loose wool base`, `separate glass eyes`, `white bald felt face`, `new pink nose`, `untrimmed gray wool`, `whisker insertion`, etc. Include `preserve identity only; change the construction stage and action` when using the identity anchor for an earlier or unfinished stage.
6. **Add a realism anchor in every prompt.** Repeat the source capture qualities: vertical smartphone still, gray felt work mat, green cutting mat edge when visible, real hands, warm indoor light, mild motion blur, phone compression, handmade fibers, and imperfect craft-table realism.
7. **Avoid source-frame cloning.** Passing an extracted video frame as `--reference` often makes image edit mode return an image that is nearly identical to the frame. Use source frames for inspection and prompt writing; use the generated identity anchor for continuity. If a source-frame reference is necessary, say that the output may become a near-copy and ask the user before spending the generation call.
8. Use `--mask` only for a local redraw. The mask must be a same-size PNG with alpha; transparent pixels mark the redraw area.

Identity anchor generation:

```sh
python3 "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/generate_image.py" \
  --prompt "<Fresh English prompt recreating the final product identity from inspected frames, not a frame copy> Avoid: <negative prompt>" \
  --output "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/generated-images/identity-anchor-<timestamp>.jpg"
```

Storyboard shot using the identity anchor as a reference:

```sh
python3 "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/generate_image.py" \
  --reference "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/generated-images/identity-anchor-<timestamp>.jpg" \
  --prompt "<Prompt preserving identity only while changing to this shot's actual stage and action> Avoid: <negative prompt>" \
  --output "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/generated-images/shot-02-<timestamp>.jpg"
```

Put the APIYi key on the first line of `${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/.apiyi-key`. The script uses `POST https://api.apiyi.com/v1/images/generations` for the first shot and `POST https://api.apiyi.com/v1/images/edits` when `--reference` is supplied. Both modes decode `data[0].b64_json` into the requested image file. Use the default `1152x2048`, `medium`, and JPEG quality 90 for a vertical 9:16 preview. Override `--size`, `--quality`, `--output-format`, or `--output-compression` only when the shot requires it.

Use `--base-url https://b.apiyi.com/v1` only as a manual fallback after a failed call. Do not automatically retry or fail over: the API is synchronous, and a disconnected or timed-out client request may still be completing and billable. Do not copy API keys into prompts, output files, terminal logs, or source control.

For a still image, combine the positive prompt and only the highest-priority negative constraints in one API prompt, using an `Avoid:` clause. Keep the actual aspect ratio, temporal stage, physical action, and capture style intact. Save user-facing generated images under `generated-images/` in the persistent asset library, inspect the resulting image, and compare it against the reference frame before presenting it.

If the API returns an error, report its status and a concise sanitized message. Do not retry automatically when generation may incur usage or cost; ask the user whether to retry or revise the prompt.

### 9. Build a slideshow video with source audio

When the user asks for a video carousel after generating the shot images, create a vertical MP4 before publishing. Each `shot-*` image becomes one slide, and the audio is taken from the source video starting at `0` unless overridden:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/create-slideshow-video.js" \
  --images-dir "outputs" \
  --source-video "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/source-videos/<source>.mp4" \
  --slide-seconds 2.5
```

The output is 1080x1920, 30 fps, H.264/AAC, and uses the source video's audio track trimmed to the slideshow duration. The source video and generated images remain unchanged.

For a Douyin-link workflow, use the downloaded file as `--source-video`, so the final slideshow keeps the source video's audio:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/create-slideshow-video.js" \
  --images-dir "outputs" \
  --source-video "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/source-videos/<source>.mp4"
```

### 10. Optional Buffer scheduling

When the user asks to publish through Buffer, inspect the finished asset first. The publisher can upload a local video to Tencent COS bucket `codex-1306142582` in `ap-singapore`, obtain its stable public Tencent HTTPS URL, and pass that URL to Buffer. Connect the destination accounts in Buffer first. Use `--list-channels` to inspect the current destinations. Use `--channels all` to discover and publish to every currently connected channel; use explicit `service=<id>` entries only when publishing to a subset.

Test the COS destination without uploading:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/upload-to-cos.js" \
  --file "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/generated-videos/<video>.mp4" \
  --dry-run
```

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/publish-to-buffer.js" \
  --list-channels
```

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/publish-to-buffer.js" \
  --video "${VIDEO_ASSET_LIBRARY:-$PWD/media-library}/generated-videos/<video>.mp4" \
  --caption "<English caption>" \
  --title "<Video title>" \
  --channels "all" \
  --dry-run
```

With `--video`, dry-run computes the COS URL without uploading; a real run uploads first and includes the COS object details in `buffer-meta.json`. Use `--video-url` when the media already has a public HTTPS URL. Omit `--dry-run` only after reviewing the targets and scheduled time. Add `--date "2026-08-16T13:00:00Z"` to use an explicit future publication time; otherwise Buffer adds the posts to each channel queue. For YouTube, set `--youtube-category-id` when a category other than `22` (People & Blogs) is appropriate. The publisher rejects CJK captions in the Western-market workflow and writes a `buffer-meta.json` receipt after successful requests. Do not put API keys in commands or output logs. Buffer requires an automatic-publishing connection for each channel; personal Instagram accounts can only use notification publishing. After connecting a new service, run dry-run with `--channels all` and verify every target before publishing.

## Output Format

For a full analysis:

```text
### 镜头 1｜00:00-00:03｜中文标题
动作/画面：一句中文说明。

Prompt:
...

Negative prompt:
...

关键还原点：...
```

For a single follow-up shot:

```text
下一镜：中文标题

Prompt:
...

Negative prompt:
...

关键点：...
```

Default to English generation prompts with Chinese explanations. Match the user's requested prompt style and detail level. Mention the source video's actual aspect ratio and avoid adding text, logos, or watermarks unless explicitly requested.

For bundled-reference concept mode, output exactly 6-8 shots unless the user requests another count. Label them `概念分镜` rather than presenting fabricated source timestamps, and include the construction stage, English prompt, negative prompt, and continuity anchor for every shot.

## Quality Checks

Before answering, verify:

- shot order and timestamps match the resampled full-resolution frames, not only the overview contact sheet;
- each candidate shot has beginning, middle, and end evidence;
- every prompt describes one clear visual moment;
- a continuous take was split when the action or material state changed meaningfully;
- the prompt states the existing state, active change, material transition, and unfinished end state;
- material and subject state carry over between adjacent shots;
- the action is physically plausible and the support hand, tool appearance, angle, and contact point match the source;
- already completed anchor features such as eyes, nose, muzzle, cheeks, markings, and proportions are retained;
- camera orientation, composition, and surface match the source;
- phone-camera compression, motion blur, focus, and ordinary lighting are retained when visible;
- unfinished craft stages remain unfinished;
- the prompt does not substitute a different breed, material, or workflow;
- the negative prompt prioritizes stage, identity, material, action, and camera drift without overconstraining the image;
- vague filler has been replaced with concrete visible evidence wherever possible.
