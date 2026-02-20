#!/bin/bash
# ABOUTME: PreToolUse hook — blocks Edit/Write on main branch.
# ABOUTME: Forces worktree workflow for all code changes.

BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  # Read stdin to check file path — allow edits to config/docs/memory
  INPUT=$(cat)
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)

  # Whitelist: CLAUDE.md, memory files, settings, docs
  case "$FILE_PATH" in
    */CLAUDE.md|*/memory/*|*/.claude/*|*/docs/*|*/config/settings.default.yaml)
      exit 0
      ;;
  esac

  echo "BLOCKED: You are on '$BRANCH'. Create a worktree (feat/* or fix/*) before editing code." >&2
  exit 2
fi

exit 0
