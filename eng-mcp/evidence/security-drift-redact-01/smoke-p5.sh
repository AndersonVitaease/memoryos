#!/usr/bin/env bash
# SECURITY-PAT-FIX-DEPLOY-01 smoke: live security.scan vps (secrets+hygiene) must redact the
# filename-embedded PAT (SEC-030) and never emit the raw value. Never prints the value.
set -euo pipefail
E=/opt/memoryos/eng-mcp/evidence/security-drift-redact-01
# FIX 28/09 (supervisor): grep sem match (estado de SUCESSO da pat-hygiene-01:
# arquivo com PAT no nome renomeado) morria em silêncio por pipefail+set -e.
# Estado desejado = sem PAT em nome de arquivo; segue exigindo redaction marker.
N=$( (ls /opt/eng-mcp-secrets/ 2>/dev/null | grep -oE 'github_pat_[A-Za-z0-9_]{20,}' | head -1) || true )
OUT=$(mktemp)
node $E/mcpcall.mjs engineering.security.scan '{"target":"vps","modules":["secrets","hygiene"],"mode":"scan"}' > "$OUT"
if [ -n "$N" ] && grep -qF "$N" "$OUT"; then echo "FAIL raw PAT in output (sha16 $(printf %s "$N"|sha256sum|cut -c1-16))"; rm -f "$OUT"; exit 1; fi
grep -q '"isError":true' "$OUT" && { echo "FAIL tool error"; rm -f "$OUT"; exit 1; }
# SEC-030 (PAT em nome de arquivo): se ainda aparecer como finding aberto, o
# valor NUNCA pode vir cru — exige o marcador de redaction. Se não aparecer
# (estado de sucesso pós pat-hygiene-01: arquivo renomeado), segue verde.
if grep -q 'SEC-030' "$OUT"; then
  grep -q 'github-pat\[sec-redacted:github-finegrained-token\]' "$OUT" || { echo "FAIL SEC-030 open sem redaction marker"; rm -f "$OUT"; exit 1; }
fi
echo "PASS latencyMs=$(grep -o '"latencyMs": [0-9]*' "$OUT" | grep -o '[0-9]*')"; rm -f "$OUT"
