# video-shot-prompts

A flat, installable Codex skill repository. `SKILL.md` is intentionally at the
repository root; there is no plugin or `mobile/skills/...` wrapper.

## Local development

Edit this checkout, validate it, then synchronize the installed copy:

```sh
bash scripts/install-skill.sh
```

The default destination is
`${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts`.

## Codex Cloud

Add this command to the repository environment setup after cloning:

```sh
bash scripts/install-skill.sh
```

Provide these as Codex environment secrets when the corresponding feature is
needed: `APIYI_API_KEY`, `TIKHUB_API_KEY`, `BUFFER_API_KEY`,
`TENCENTCLOUD_SECRET_ID`, and `TENCENTCLOUD_SECRET_KEY`.

The installer writes available values only into the installed skill directory
with mode `0600`. Secret files and `node_modules/` are ignored by Git.
