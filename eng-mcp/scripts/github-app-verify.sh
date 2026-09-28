#!/usr/bin/env bash
# GH-APP-TOKEN-01: read-only GitHub App setup check (JWT -> installation token ->
# GET repo). Prints verdicts + sha16 only. Usage:
#   GITHUB_APP_ID=... GITHUB_INSTALLATION_ID=... scripts/github-app-verify.sh
# (GITHUB_APP_PRIVATE_KEY_FILE defaults to /opt/eng-mcp-secrets/github-app.private-key.pem)
set -euo pipefail
# The two (non-secret) IDs may live in a 0600 env file written at bootstrap.
ENV_FILE="${GITHUB_APP_ENV_FILE:-/opt/eng-mcp-secrets/github-app.env}"
if [[ -z "${GITHUB_APP_ID:-}" && -z "${GITHUB_INSTALLATION_ID:-}" && -r "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec node --import tsx "$ROOT/scripts/github-app-verify.ts"
