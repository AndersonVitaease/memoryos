#!/usr/bin/env bash
# SECURITY-DRIFT-REDACT-01 E2E (produção :8787). Fixture SINTÉTICA gerada em runtime
# (nunca a PAT real); só o sha16 é impresso. Padrão smoke-p5: probe não quebra em estado
# de sucesso — asserções condicionais, greps com || true.
set -uo pipefail
E=/opt/memoryos/eng-mcp/evidence/security-drift-redact-01
FX=/opt/memoryos/.secdrift-e2e-fixture
SNAPDIR=/opt/eng-mcp-release-data/production/security-scan
SYN="github_pat_$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 30)"
echo "synthetic sha16 $(printf %s "$SYN" | sha256sum | cut -c1-16)" | tee $E/e2e-synthetic.sha16
rm -rf "$FX"; mkdir -p "$FX/github-pat$SYN"; echo "token=$SYN" > "$FX/github-pat$SYN/payload.txt"; echo ok > "$FX/clean.txt"
fail=0; chk(){ if grep -qF "$SYN" "$1"; then echo "FAIL raw synthetic in $2"; fail=1; else echo "ok no-raw $2"; fi; }
# 1) scan com secret em nome -> finding redacted, output nunca cru
node $E/mcpcall.mjs engineering.security.scan "{\"target\":\"$FX\",\"modules\":[\"secrets\"],\"mode\":\"scan\"}" > $E/e2e-scan1.json
chk $E/e2e-scan1.json scan1
grep -q '"isError": true' $E/e2e-scan1.json && { echo "FAIL scan1 tool error"; fail=1; }
TID=$( (grep -oE 'path-[0-9a-f]{12}' $E/e2e-scan1.json | head -1) || true ); echo "targetId $TID"
if grep -q 'SEC-0' $E/e2e-scan1.json; then grep -q 'sec-redacted:github-finegrained-token' $E/e2e-scan1.json && echo "ok scan1 finding redacted" || { echo "FAIL scan1 finding sem marker"; fail=1; }; fi
# 2) snapshot LEGADO (pré-sanitização) com o valor cru no local + fixture removida -> fecha
if [ -n "$TID" ]; then
  printf '{"ts":"2026-09-22T00:00:00.000Z","findings":[{"findingId":"e2elegacy0000001","checkId":"SEC-004","kind":"github-finegrained-token","severity":"critical","local":"%s"}]}' "$FX/github-pat$SYN" > "$SNAPDIR/$TID.json"
  rm -rf "$FX/github-pat$SYN"
  node $E/mcpcall.mjs engineering.security.scan "{\"target\":\"$FX\",\"modules\":[\"secrets\"],\"mode\":\"scan\"}" > $E/e2e-scan2.json
  chk $E/e2e-scan2.json scan2
  grep -q 'SEC_OUTPUT_CONTAMINATION' $E/e2e-scan2.json && { echo "FAIL scan2 fail-closed (drift.closed não redigido)"; fail=1; }
  if grep -q 'e2elegacy0000001' $E/e2e-scan2.json; then
    grep -q 'github-pat\[sec-redacted:github-finegrained-token\]' $E/e2e-scan2.json && echo "ok drift.closed redacted" || { echo "FAIL drift.closed sem marker"; fail=1; }
  else echo "FAIL legacy finding não fechou"; fail=1; fi
  chk "$SNAPDIR/$TID.json" snapshot-rewritten
  rm -f "$SNAPDIR/$TID.json"
fi
rm -rf "$FX"
[ $fail -eq 0 ] && echo PASS || echo FAIL
