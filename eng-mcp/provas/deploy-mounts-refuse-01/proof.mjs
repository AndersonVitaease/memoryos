// DEPLOY-MOUNTS-REFUSE-01 red→green proof: isolated import of readOnlyMountArgs (no action runs).
import { readFileSync } from "node:fs";
const target = process.argv[2] ?? "../../scripts/eng-mcp-release.mjs";
const { readOnlyMountArgs } = await import(new URL(target, import.meta.url));
const spec = "/root/.hermes/plugins/mission-ops:/root/.hermes/plugins/mission-ops:ro";
let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`); if (!ok) fails++; };
// (a) missing declared source -> typed refusal with spec in text
try { const r = readOnlyMountArgs({ readOnlyMounts: [spec] }, () => false); check("a_missing_refuses_typed", false, `returned ${JSON.stringify(r)} (silent skip)`); }
catch (e) { check("a_missing_refuses_typed", e.code === "DEPLOY_MOUNT_SOURCE_MISSING" && e.message.includes(spec), e.message); }
// (b) optional "?" spec, missing source -> silent skip
try { const r = readOnlyMountArgs({ readOnlyMounts: ["/a:/a:ro", `?${spec}`] }, (p) => p === "/a"); check("b_optional_skips", JSON.stringify(r) === JSON.stringify(["-v", "/a:/a:ro"]), JSON.stringify(r)); }
catch (e) { check("b_optional_skips", false, e.message); }
// (c) real release-config.json, real host fs: all 8 exist -> args identical to current behavior
const cfg = JSON.parse(readFileSync(new URL("../../scripts/release-config.json", import.meta.url), "utf8"));
const specs = cfg.production.readOnlyMounts;
const expected = specs.flatMap((s) => ["-v", s]);
try { const r = readOnlyMountArgs(cfg.production); check("c_real_config_identical", JSON.stringify(r) === JSON.stringify(expected), `${specs.length} specs -> ${r.length} args`); }
catch (e) { check("c_real_config_identical", false, e.message); }
console.log(fails ? `RESULT FAIL ${fails}` : "RESULT PASS 3/3");
process.exit(fails ? 1 : 0);
