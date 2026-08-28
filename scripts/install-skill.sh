#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
TARGET_DIR="$CODEX_ROOT/skills/video-shot-prompts"

mkdir -p "$CODEX_ROOT/skills" "$TARGET_DIR"

if [[ "$SOURCE_DIR" != "$TARGET_DIR" ]]; then
  rsync -a --delete \
    --exclude '.git/' \
    --exclude '.gitignore' \
    --exclude 'AGENTS.md' \
    --exclude 'README.md' \
    --exclude 'node_modules/' \
    --exclude '.apiyi-key' \
    --exclude '.tikhub-api-key' \
    --exclude '.buffer-api-key' \
    --exclude '.tencent-cos-secret-id' \
    --exclude '.tencent-cos-secret-key' \
    "$SOURCE_DIR/" "$TARGET_DIR/"
fi

write_secret_if_set() {
  local variable_name="$1"
  local destination_name="$2"
  local variable_value="${!variable_name:-}"
  if [[ -n "$variable_value" ]]; then
    printf '%s\n' "$variable_value" > "$TARGET_DIR/$destination_name"
    chmod 600 "$TARGET_DIR/$destination_name"
  fi
}

write_secret_if_set APIYI_API_KEY .apiyi-key
write_secret_if_set TIKHUB_API_KEY .tikhub-api-key
write_secret_if_set BUFFER_API_KEY .buffer-api-key
write_secret_if_set TENCENTCLOUD_SECRET_ID .tencent-cos-secret-id
write_secret_if_set TENCENTCLOUD_SECRET_KEY .tencent-cos-secret-key

for secret_file in \
  .apiyi-key \
  .tikhub-api-key \
  .buffer-api-key \
  .tencent-cos-secret-id \
  .tencent-cos-secret-key; do
  if [[ -f "$TARGET_DIR/$secret_file" ]]; then
    chmod 600 "$TARGET_DIR/$secret_file"
  fi
done

if [[ -f "$TARGET_DIR/package-lock.json" ]]; then
  npm --prefix "$TARGET_DIR" ci --omit=dev --ignore-scripts --no-audit --no-fund --prefer-offline
fi

printf 'Installed video-shot-prompts at %s\n' "$TARGET_DIR"
