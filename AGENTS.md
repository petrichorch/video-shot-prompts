# Video Shot Prompts

This repository root contains the complete `video-shot-prompts` Codex skill.

After editing the repository, run `bash scripts/install-skill.sh` to synchronize
it into `${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts` and install its
Node dependencies. The installer preserves existing local credential files and
writes credentials from environment variables when they are present.

For Codex Cloud, clone this repository and run `bash scripts/install-skill.sh`
from the checkout during environment setup. Supply credentials separately as
environment secrets. Never commit or print credential values.

Use `node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/publish-to-buffer.js" --list-channels`
as the non-mutating Buffer connectivity check.
