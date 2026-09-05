# video-shot-prompts

An installable Codex skill repository with `SKILL.md` at the repository root.

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

For a recurring cloud draft, copy the ready-to-use prompt from
`references/scheduled-review-prompt.md`. It updates the skill from `main`, uses
one TiKHub search request, renders with bundled music, and stops for review
before any Buffer or Tencent COS action.
