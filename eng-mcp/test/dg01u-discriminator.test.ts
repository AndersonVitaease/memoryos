// DG01U discriminator — NEUTRALIZED after characterization (no live test remains).
// Evidence (engineering.release.test, official testAction, 2026-09-04):
//   suite executed for real: tests=202 passed=201 failed=1, testStatus=FAIL,
//   failing test = "DG01U discriminator: intentional failure probe"
//   (test/dg01u-discriminator.test.ts:9, AssertionError DG01U_DISCRIMINATOR_MUST_FAIL,
//   real TAP + stack trace inside the test container /app/test/...).
// => the official channel REALLY executes tests and detects real failures (exit != 0).
// Real runner: npm test => node --import tsx --test test/*.test.ts (package.json),
// executed officially via engineering.release.test (docker build + npm test;
// Dockerfile L10 RUN npm install; scripts/eng-mcp-release.mjs testAction).
// Host profiles file/suite/integration remain dry-run stubs (DG-01 + SIMPLE-TOOLS-01).
// Manifest note: package.json/package-lock.json are hardcoded HIGH_IMPACT paths
// (src/policy.ts isHighImpactPath) => file.patch/git.stage on manifests always throw
// HIGH_IMPACT_WRITE_BLOCKED / HIGH_IMPACT_GIT_BLOCKED; no authorized bypass exists.
