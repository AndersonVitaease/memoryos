/**
 * ArchitectureAuthority.ts — Sprint 6.2.3
 * The MAXIMUM authority over any structural change in MemoryOS.
 * Positioned above Engineering Governance. Nothing touches Core without passing here.
 *
 * Full pipeline:
 *   Submit → Inspect Architecture → Detect Breaking Changes → Validate Contracts
 *   → Check Compatibility → Generate Proposal → Create Feature Flag → Create Migration Plan
 *   → Architecture Decision → [WAIT_ARCHITECTURE_APPROVAL | AUTO_APPROVED | BLOCKED]
 *   → Audit
 */

import { ArchitectureInspector }     from "./ArchitectureInspector";
import { ContractRegistry }           from "./ContractRegistry";
import { ContractValidator }          from "./ContractValidator";
import { BreakingChangeDetector }     from "./BreakingChangeDetector";
import { CompatibilityEngine }        from "./CompatibilityEngine";
import { ArchitectureProposalEngine } from "./ArchitectureProposalEngine";
import { ArchitectureDecisionEngine } from "./ArchitectureDecisionEngine";
import { MigrationPlanner }           from "./MigrationPlanner";
import { FeatureFlagEngine }          from "./FeatureFlagEngine";
import { ArchitectureHistory }        from "./ArchitectureHistory";
import { ArchitectureAudit }          from "./ArchitectureAudit";
import { ArchitectureDiffEngine }     from "./ArchitectureDiffEngine";
import type { ArchitectureAuthorityResult, ArchitectureProposal } from "./AATypes";

let _seq = 0;
function makeId(p: string): string { return `${p}_${Date.now()}_${++_seq}`; }
function ts(): string { return new Date().toISOString().slice(11, 23); }

export interface AAExecution {
  id:           string;
  objective:    string;
  stage:        string;
  log:          string[];
  result:       ArchitectureAuthorityResult | null;
  startedAt:    number;
  completedAt:  number | null;
}

export class ArchitectureAuthority {
  private readonly _inspector  = new ArchitectureInspector();
  private readonly _registry   = new ContractRegistry();
  private readonly _validator  = new ContractValidator();
  private readonly _bcd        = new BreakingChangeDetector();
  private readonly _compat     = new CompatibilityEngine();
  private readonly _proposalEng = new ArchitectureProposalEngine();
  private readonly _decisionEng = new ArchitectureDecisionEngine();
  private readonly _migPlanner  = new MigrationPlanner();
  private readonly _flagEng     = new FeatureFlagEngine();
  private readonly _history     = new ArchitectureHistory();
  private readonly _audit       = new ArchitectureAudit();
  private readonly _diffEng     = new ArchitectureDiffEngine();

  onStageChange?: (exec: AAExecution) => void;

  get audit():    ArchitectureAudit    { return this._audit; }
  get history():  ArchitectureHistory  { return this._history; }
  get flags():    FeatureFlagEngine    { return this._flagEng; }
  get contracts(): ContractRegistry   { return this._registry; }

  async submit(objective: string, affectedComponents: string[]): Promise<AAExecution> {
    const exec: AAExecution = {
      id: makeId("aa"), objective, stage: "SUBMITTED",
      log: [], result: null,
      startedAt: Date.now(), completedAt: null,
    };

    const log = (msg: string) => { exec.log.push(`[${ts()}] ${msg}`); this._emit(exec); };
    const setStage = (s: string) => { exec.stage = s; this._emit(exec); };

    log(`Architecture Authority: "${objective}"`);
    log(`Affected components: ${affectedComponents.join(", ") || "none specified"}`);

    // 1. Inspect current architecture
    setStage("INSPECTING_ARCHITECTURE");
    log("STEP 1 — Inspecting live architecture snapshot");
    const snapshot = this._inspector.inspect();
    log(`Snapshot: ${snapshot.modules.length} modules, ${snapshot.singletons.length} singletons, ${snapshot.kgEntityCount} KG entities, ${snapshot.cycles.length} cycles`);

    // 2. Detect breaking changes
    setStage("DETECTING_BREAKING_CHANGES");
    log("STEP 2 — Detecting breaking changes");
    const allContracts = this._registry.all();
    const diffs = this._validator.validateAll(allContracts, {}); // no patches in inspection mode
    const breakingChanges = this._bcd.detect(objective, affectedComponents, diffs);
    const maxLevel = this._bcd.maxLevel(breakingChanges);
    const isBlocked = this._bcd.isBlocked(breakingChanges);
    log(`Breaking changes: ${breakingChanges.length} — max level: ${maxLevel} — auto-blocked: ${isBlocked}`);
    breakingChanges.forEach(bc => log(`  [${bc.level}] ${bc.component}: ${bc.description}`));

    // 3. Validate contracts
    setStage("VALIDATING_CONTRACTS");
    log("STEP 3 — Validating public contracts");
    log(`Registered contracts: ${allContracts.length}`);
    const affected = allContracts.filter(c => c.exports.some(e => affectedComponents.includes(e)));
    log(`Contracts in scope: ${affected.length}`);

    // 4. Check compatibility
    setStage("CHECKING_COMPATIBILITY");
    log("STEP 4 — Checking backward compatibility");
    const compat = this._compat.validate(affectedComponents, breakingChanges);
    log(`Compatibility: ${compat.overall} — backward compatible: ${compat.backwardCompatible}`);
    compat.issues.forEach(i => log(`  ⚠ ${i}`));

    // 5. Generate Architecture Proposal
    setStage("GENERATING_PROPOSAL");
    log("STEP 5 — Generating Architecture Proposal");
    const proposal = this._proposalEng.generate(objective, snapshot, affectedComponents, breakingChanges);
    log(`Proposal: complexity=${proposal.estimatedComplexity}, confidence=${proposal.confidenceScore}%, core hit=${proposal.coreComponentsHit.length}`);

    // 6. Create Feature Flag (born disabled)
    setStage("CREATING_FEATURE_FLAG");
    log("STEP 6 — Creating Feature Flag (disabled by default)");
    const flag = this._flagEng.create(proposal.id, objective);
    log(`Feature flag created: "${flag.key}" — enabled=false`);

    // 7. Migration Plan (if breaking changes exist)
    let migrationPlan = null;
    if (breakingChanges.length > 0 || proposal.coreComponentsHit.length > 0) {
      setStage("GENERATING_MIGRATION");
      log("STEP 7 — Generating Migration Plan");
      migrationPlan = this._migPlanner.generate(proposal.id, objective, breakingChanges, affectedComponents);
      log(`Migration: ${migrationPlan.steps.length} steps, rollback: ${migrationPlan.rollbackSteps.length} steps`);
    } else {
      log("STEP 7 — No breaking changes — migration plan not required");
    }

    // 8. Architecture Decision
    setStage("ARCHITECTURE_DECISION");
    log("STEP 8 — Architecture Decision");
    const decision = this._decisionEng.decide(proposal);
    proposal.status = decision.status === "AUTO_APPROVED" ? "AUTO_APPROVED"
      : decision.status === "BLOCKED" ? "BLOCKED" : "PENDING";
    if (decision.status === "AUTO_APPROVED") proposal.approvedAt = Date.now();
    log(`Decision: ${decision.stage} — ${decision.reason}`);

    // 9. Record to history
    this._history.record(proposal, decision.reason);

    // 10. Audit
    setStage("RECORDING_AUDIT");
    const auditEntry = this._audit.record(
      proposal,
      proposal.status as any,
      decision.requiresApproval ? "Pending human" : "MemoryOS (auto)",
      true,
      migrationPlan !== null,
    );
    log(`Audit recorded: ${auditEntry.id}`);

    // Compatibility map
    const compatMap: Record<string, string> = {};
    Object.entries(compat.domains).forEach(([k, v]) => { compatMap[k] = v; });

    exec.result = {
      proposalId:      proposal.id,
      proposal,
      snapshot,
      breakingChanges,
      migrationPlan,
      featureFlags:    [flag],
      compatibility:   compat.domains,
      auditEntry,
      authorized:      proposal.status === "AUTO_APPROVED" || proposal.status === "APPROVED",
      stage:           decision.stage,
      log:             [...exec.log],
    };

    setStage(decision.stage);
    exec.completedAt = decision.requiresApproval ? null : Date.now();
    log(decision.stage === "WAIT_ARCHITECTURE_APPROVAL"
      ? "⏸ WAIT_ARCHITECTURE_APPROVAL — no implementation until human approves"
      : decision.stage === "BLOCKED"
        ? "❌ BLOCKED — proposal requires re-scoping"
        : "✅ AUTO_APPROVED — no core components affected, implementation may proceed");

    this._emit(exec);
    return exec;
  }

  approve(exec: AAExecution, approver = "Human"): AAExecution {
    if (!exec.result?.proposal) throw new Error("Nothing to approve");
    const p = exec.result.proposal;
    p.approvedAt = Date.now();
    p.status     = "APPROVED";
    exec.result.authorized = true;
    exec.stage   = "AUTHORIZED";
    exec.completedAt = Date.now();
    exec.log.push(`[${ts()}] ✅ HUMAN APPROVED by ${approver} — architecture implementation authorized`);
    this._history.record(p, `Approved by ${approver}`);
    this._audit.record(p, "APPROVED", approver, true, exec.result.migrationPlan !== null);
    this._emit(exec);
    return exec;
  }

  reject(exec: AAExecution, reason: string): AAExecution {
    if (!exec.result?.proposal) return exec;
    const p = exec.result.proposal;
    p.rejectedAt      = Date.now();
    p.rejectionReason = reason;
    p.status          = "REJECTED";
    exec.result.authorized = false;
    exec.stage       = "REJECTED";
    exec.completedAt = Date.now();
    exec.log.push(`[${ts()}] ❌ REJECTED — ${reason}`);
    this._history.record(p, `Rejected: ${reason}`);
    this._audit.record(p, "REJECTED", "Human", false, false);
    this._emit(exec);
    return exec;
  }

  private _emit(exec: AAExecution): void {
    this.onStageChange?.({ ...exec, log: [...exec.log] });
  }
}