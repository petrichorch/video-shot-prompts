---
name: video-shot-prompts
description: Analyze an uploaded video into evidence-based shots, write faithful image or video generation prompts, compare generated references, and create one storyboard preview per shot by default. Use for shot-by-shot prompt reconstruction, continuity analysis, or requests for the next matching shot. Ask for a video upload when a social-video link cannot be accessed; do not use this skill for general video summaries.
---

# Video Shot Prompts

Turn an uploaded reference video into a faithful, reusable shot list. Preserve the visible subject, construction stage, physical action, camera framing, lighting, background, capture quality, and aspect ratio. Prefer observable details over decorative language.

## Source handling

- Use the uploaded video as primary evidence. If the user only provides a Douyin, TikTok, or other social-video link and the video cannot be opened directly, ask them to upload the video file; do not invent unseen shots.
- Use video inspection or code tools available in ChatGPT to read duration, dimensions, frame rate, and representative frames. Preserve portrait or landscape orientation.
- Make an overview sample, then inspect full-resolution frames at the beginning, middle, and end of every candidate shot. Around fast actions or cuts, sample adjacent frames more densely.
- Split on meaningful visual changes: camera angle or distance, subject or material stage, hand/tool action, setting, or composition. A continuous take may contain multiple prompt shots when the action or state changes.
- Give approximate timestamp ranges and mark uncertainty instead of claiming unsupported precision.

## Continuity and evidence

Before writing prompts, track these fields for every shot:

- Existing state: what is already complete and visible.
- Active change: what the hands, subject, or tool is doing now.
- End state: what changes by the end and what remains unfinished.
- Action geometry: support hand, tool appearance and angle, direction, and contact point.
- Identity anchors: stable facial features, markings, proportions, materials, and colors.
- Capture style: framing, surface, light, focus, motion blur, compression, and imperfections.

Carry state forward between adjacent shots. Write `uncertain` when evidence is insufficient. Do not polish casual footage into studio photography or turn an unfinished stage into a finished object.

## Prompt writing

For an image or storyboard request, freeze one visible micro-moment. For a video-generation request, describe a plausible start state, action progression, and end state.

Write one English generation prompt per shot, in this order when relevant:

1. Shot type, camera perspective, and aspect ratio.
2. Existing subject state and identity anchors.
3. Hands or subject action, tool, angle, and contact point.
4. Material transition and degree of completion.
5. Color, shape, texture, stray fibers, and other imperfections.
6. Background, surface, lighting, focus, motion blur, and phone-camera character.

Add a short negative prompt targeting only likely drift, prioritized as: wrong completion stage, wrong identity, wrong material, wrong action/tool, wrong framing, then overlays. Do not add constraints that contradict visible source content.

## Preview images

Generate one preview image for every shot by default unless the user asks for prompts only. Use ChatGPT's available image-generation capability; never request or expose local API keys.

For cross-shot consistency:

1. Find the clearest final-product or identity frame near the end of the source.
2. Create a fresh identity-anchor preview based on visual analysis rather than copying the source frame.
3. Reuse that identity anchor as the final reveal when the composition matches.
4. Use the same anchor for non-final previews while explicitly overriding the construction stage and action in each prompt.
5. Repeat the visible realism anchors in every prompt: orientation, camera distance, surface, real hands when present, lighting, compression, material texture, and imperfections.

Inspect each generated preview against the corresponding source frames. If it drifts, state the main mismatch and revise the prompt before presenting the result. Avoid near-duplicate source-frame edits unless the user explicitly requests one.

## Follow-ups and comparisons

When the user asks for the next shot, continue from the established timeline and material state. Give a Chinese shot title, one English prompt, a concise negative prompt, and the single detail that must not drift.

When comparing a supplied generated image with the source, lead with the most important mismatch: temporal stage, identity/silhouette, material, action/tool, framing, setting/light, or capture realism. Then rewrite the prompt with explicit corrections for the top two or three issues.

## Output

For each shot, use:

```text
### 镜头 1｜00:00-00:03｜中文标题
动作/画面：一句中文说明。

Prompt:
...

Negative prompt:
...

关键还原点：...
```

Default to English generation prompts with concise Chinese explanations. Mention the actual aspect ratio. Do not add text, logos, subtitles, or watermarks unless requested.

Before finishing, verify that every timestamp and action is supported by inspected frames, adjacent material states are consistent, tools and contact points are physically plausible, anchor features persist, and unfinished stages remain unfinished.

