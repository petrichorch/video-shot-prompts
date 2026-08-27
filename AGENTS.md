# Video Shot Prompts

This repository contains the `video-shot-prompts` Codex skill at
`video-shot-prompts-mobile/skills/video-shot-prompts`.

The Codex cloud environment setup installs that directory into
`${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts` and writes its API
credentials there with mode `0600`. For requests involving video shot analysis,
storyboard prompts, preview generation, Tencent COS upload, or Buffer publishing,
read and follow that installed `SKILL.md`.

When no video is supplied for a wool-felting request, use the bundled Devon
process keyframes and compact reference video under the installed skill's
`assets/wool-felting-devon-process/` directory, then create 6-8 concept shots.
Prefer native ImageGen for previews when it is available.

Use `node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/publish-to-buffer.js" --list-channels`
as the non-mutating Buffer connectivity check. Never print credential files or
secret environment-variable values.
