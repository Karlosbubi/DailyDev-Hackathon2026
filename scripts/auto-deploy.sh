#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
REMOTE="${DEPLOY_REMOTE:-origin}"
INTERVAL_SECONDS="${DEPLOY_INTERVAL_SECONDS:-60}"
LOG_PREFIX="${DEPLOY_LOG_PREFIX:-[auto-deploy]}"

log() {
  printf '%s %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$LOG_PREFIX" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf 'docker compose'
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    printf 'docker-compose'
    return
  fi

  return 1
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log "Working tree is dirty. Refusing to auto-deploy over local changes."
    exit 1
  fi
}

run_deploy() {
  local compose
  compose="$(compose_cmd)" || {
    log "Could not find docker compose or docker-compose."
    exit 1
  }

  log "Rebuilding and restarting services with: $compose up -d --build"
  $compose up -d --build
  log "Deploy finished."
}

check_for_update() {
  git fetch --quiet "$REMOTE" "$BRANCH"

  local local_sha remote_sha
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "$REMOTE/$BRANCH")"

  if [[ "$local_sha" == "$remote_sha" ]]; then
    return 1
  fi

  log "New commit detected: $local_sha -> $remote_sha"
  git pull --ff-only "$REMOTE" "$BRANCH"
  run_deploy
  return 0
}

main() {
  require_command git
  require_command docker
  ensure_clean_worktree

  log "Watching $REMOTE/$BRANCH every ${INTERVAL_SECONDS}s from $ROOT_DIR"

  while true; do
    if ! check_for_update; then
      log "No update."
    fi

    sleep "$INTERVAL_SECONDS"
  done
}

main "$@"
