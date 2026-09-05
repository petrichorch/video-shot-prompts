# Scheduled draft prompt

Use this as the prompt for a recurring Codex Cloud task:

```text
Create one new wool-felting short-video draft for my review using $video-shot-prompts.

First update the skill: locate the checkout for https://github.com/petrichorch/video-shot-prompts, require a clean worktree, run `git pull --ff-only origin main`, then run `bash scripts/install-skill.sh`. Read the newly installed SKILL.md; do not rely on a cached copy. If updating or installation fails, stop and report the error without deleting local changes.

No source video is provided. Use the installed `search-douyin-references.js` to search TiKHub for `羊毛毡 宠物 制作`, with `--min-likes 100 --max-duration 180 --max-results 8 --pages 1`. Stop as soon as an eligible reference is found. Decide whether to retry or request another page from the actual error, result quality, and expected cost; avoid unnecessary calls. Likes are only a pass/fail threshold: do not sort or choose by highest likes. Preserve comprehensive search order and select the first relevant video with more than 100 likes, no longer than 180 seconds, and a visible pet wool-felting construction process. Reject generic felting clips and finished-product-only showcases. Record its URL, author, description, like count and duration.

Download and analyze the selected video shot by shot. Faithfully reconstruct it as a new vertical 9:16 pet wool-felting making video: preserve its construction-stage order, shot structure, perspective, framing, hand/tool actions, material transitions, pacing, edit rhythm and final reveal logic. This is a reconstruction of the source video's production flow, not merely general inspiration. Generate new frames for the pet; do not reuse source pixels, captions, watermarks or audio. Generate 8-15 storyboard preview images, choosing the count from meaningful source stages without near-duplicate padding. Prefer native ImageGen when available and use APIYi only when ImageGen is unavailable. Maintain pet identity and construction-stage continuity. Use an MP3 from the installed skill's `assets/music/` library, rotating away from the last draft's track when history is available. Render with `create-slideshow-video.js --audio`; never pass the selected Douyin video as the audio source.

Prepare an English title, caption and restrained CTA for Western audiences. Save the final MP4 and a review manifest containing: reference URL, likes and duration; source-to-reconstruction shot mapping; prompts; music filename and credit; caption; output path; and any generation warnings.

Stop at the review gate. Attach or link the generated MP4 in the task and ask me to approve or request changes. Do not upload to Tencent COS, do not call Buffer, do not schedule or publish to any social channel until I explicitly approve that exact video and caption.
```
