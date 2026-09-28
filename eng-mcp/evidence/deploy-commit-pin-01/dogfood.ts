// DEPLOY-COMMIT-PIN-01 bootstrap deploy (OPERATOR runs it): the COMMITTED pipeline
// function driven on the host over the official runner socket — the production MCP
// still runs the pre-pin tools.ts whose strict schema has no commitSha.
// Usage: node --import tsx evidence/deploy-commit-pin-01/dogfood.ts <commitSha>
//        node --import tsx evidence/deploy-commit-pin-01/dogfood.ts --resume <deployJobId>
import { runOfficialReleasePipeline } from "../../src/tools.ts";
const [a, b] = process.argv.slice(2);
const result = a === "--resume" ? await runOfficialReleasePipeline(b) : await runOfficialReleasePipeline(undefined, a);
console.log(JSON.stringify(result, null, 1));
process.exit(0);
