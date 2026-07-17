// ══════════════════════════════════════════════════════════════════════════════
// Architecture Validation Program — Main Runner
// Orchestrates AVP-01 through AVP-10 in sequence.
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult, AVPFinding, AVPReport } from "./AVPTypes";
import { runAVP01 } from "./audits/AVP01_Structural";
import { runAVP02 } from "./audits/AVP02_Runtime";
import { runAVP03 } from "./audits/AVP03_Concurrency";
import { runAVP04 } from "./audits/AVP04_Isolation";
import { runAVP05 } from "./audits/AVP05_FailureInjection";
import { runAVP06 } from "./audits/AVP06_Explainability";
import { runAVP07 } from "./audits/AVP07_Constitution";
import { runAVP08 } from "./audits/AVP08_Chaos";
import { runAVP09 } from "./audits/AVP09_Performance";
import { runAVP10 } from "./audits/AVP10_Certificate";

export type AVPProgressCallback = (auditId: string, result: AVPAuditResult) => void;

export async function runAVP(onProgress?: AVPProgressCallback): Promise<AVPReport> {
  const t0 = Date.now();

  // Run sequentially so each audit can build on previous results
  const avp01 = await runAVP01(); onProgress?.("AVP-01", avp01);
  const avp02 = await runAVP02(); onProgress?.("AVP-02", avp02);
  const avp03 = await runAVP03(); onProgress?.("AVP-03", avp03);
  const avp04 = await runAVP04(); onProgress?.("AVP-04", avp04);
  const avp05 = await runAVP05(); onProgress?.("AVP-05", avp05);
  const avp06 = await runAVP06(); onProgress?.("AVP-06", avp06);
  const avp07 = await runAVP07(); onProgress?.("AVP-07", avp07);
  const avp08 = await runAVP08(); onProgress?.("AVP-08", avp08);
  const avp09 = await runAVP09(); onProgress?.("AVP-09", avp09);
  const avp10 = await runAVP10({ avp01, avp02, avp03, avp04, avp05, avp06, avp07, avp08, avp09 });
  onProgress?.("AVP-10", avp10);

  const all = [avp01, avp02, avp03, avp04, avp05, avp06, avp07, avp08, avp09, avp10];
  const certified = all.every(a => a.status === "PASS");

  const criticalFindings: AVPFinding[] = all
    .flatMap(a => a.findings)
    .filter(f => f.severity === "CRITICAL");

  const remainingRisks: string[] = all
    .flatMap(a => a.findings)
    .filter(f => f.severity === "HIGH" || f.severity === "MEDIUM")
    .map(f => `[${f.severity}] ${f.message}`);

  const avg = (ids: number[]) =>
    Math.round(ids.reduce((s, i) => s + all[i].score, 0) / ids.length);

  return {
    avp01, avp02, avp03, avp04, avp05, avp06, avp07, avp08, avp09, avp10,
    certified,
    overallScore:        avg([0,1,2,3,4,5,6,7,8,9]),
    architectureScore:   avg([0,6]),           // structural + constitution
    engineeringScore:    avg([1,5]),           // runtime + explainability
    reliabilityScore:    avg([4,7]),           // failure + chaos
    maintainabilityScore: avg([0,5,6]),        // structural + explainability + constitution
    scalabilityScore:    avg([2,3,8]),         // concurrency + isolation + performance
    criticalFindings,
    remainingRisks,
    totalDurationMs: Date.now() - t0,
  };
}