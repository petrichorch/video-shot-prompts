# Scheduled draft prompt

Use this as the prompt for a recurring Codex Cloud task:

```text
Create one new wool-felting short-video draft for my review using $video-shot-prompts.

First update the skill: locate the checkout for https://github.com/petrichorch/video-shot-prompts, require a clean worktree, run `git pull --ff-only origin main`, then run `bash scripts/install-skill.sh`. Read the newly installed SKILL.md; do not rely on a cached copy. If updating or installation fails, stop and report the error without deleting local changes.

No source video is provided. Use the installed `search-douyin-references.js` to search TiKHub for `羊毛毡`, with `--min-likes 100 --max-results 8 --pages 1`. Make only one search request and do not retry automatically because search is billed. Select one relevant result whose reported likes are greater than 100, record its URL, author, description and like count, and use it only as visual/process inspiration. Do not clone its frames or use its audio.

Create a coherent 6-8 shot vertical 9:16 storyboard for an original wool-felting subject. Generate one preview per shot, preferring native ImageGen when available and using APIYi only when ImageGen is unavailable. Maintain identity and construction-stage continuity. Use an MP3 from the installed skill's `assets/music/` library, rotating away from the last draft's track when history is available. Render the video with `create-slideshow-video.js --audio`; never pass the selected Douyin reference as the audio source.

Prepare an English title, caption and restrained CTA for Western audiences. Save the final MP4 and a review manifest containing: reference URL and likes, shot list, prompts, music filename and credit, caption, output path, and any generation warnings.

Stop at the review gate. Attach or link the generated MP4 in the task and ask me to approve or request changes. Do not upload to Tencent COS, do not call Buffer, do not schedule or publish to any social channel until I explicitly approve that exact video and caption.
```
