import { runMissionClose } from "../src/missionOps.ts";
const r = await runMissionClose({ missionId: "proof-lint-03" });
console.log("CLOSE ACTIVE REAL:", JSON.stringify({ ok: r.ok, error: r.error, jevGate: r.jevGate }));
