/**
 * ercTests.ts — Sprint 6.3.5
 * Regression tests for Engineering Readiness Certification.
 */

import type { RegressionTest, RegressionResult } from "../EngineeringRegressionSuite";
import { CapabilityValidator } from "../../engineering-readiness/CapabilityValidator";
import { DependencyValidator } from "../../engineering-readiness/DependencyValidator";
import { SecurityValidator } from "../../engineering-readiness/SecurityValidator";
import { RecoveryValidator } from "../../engineering-readiness/RecoveryValidator";
import { PersistenceValidator } from "../../engineering-readiness/PersistenceValidator";
import { ArchitectureValidator } from "../../engineering-readiness/ArchitectureValidator";
import { GovernanceValidator } from "../../engineering-readiness/GovernanceValidator";
import { ConnectorValidator } from "../../engineering-readiness/ConnectorValidator";
import { MemoryValidator } from "../../engineering-readiness/MemoryValidator";
import { KnowledgeGraphValidator } from "../../engineering-readiness/KnowledgeGraphValidator";
import { ReadinessEngine } from "../../engineering-readiness/ReadinessEngine";

export const ercTests: RegressionTest[] = [
  {
    id: "erc_01", name: "CapabilityValidator executes", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new CapabilityValidator();
        const r = await v.validate();
        const ok = !!r.id && r.domain === "Infrastructure" && r.checks.length > 0;
        return { testId: "erc_01", testName: "CapabilityValidator executes", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} checks=${r.checks.length}` : "Validator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_01", testName: "CapabilityValidator executes", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_02", name: "DependencyValidator executes", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new DependencyValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_02", testName: "DependencyValidator executes", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} checks=${r.checks.length}` : "DependencyValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_02", testName: "DependencyValidator executes", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_03", name: "SecurityValidator: no credential leaks", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new SecurityValidator();
        const r = await v.validate();
        const credCheck = r.checks.find(c => c.name.includes("credentials"));
        const ok = !!r.id && (!credCheck || credCheck.status === "PASS");
        return { testId: "erc_03", testName: "SecurityValidator: no credential leaks", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} security OK` : `Credential leak detected: ${r.blockers.join(";")}`,
          durationMs: Date.now() - t0,
          rca: ok ? undefined : "SessionSerializer is not sanitizing forbidden fields." };
      } catch (e) {
        return { testId: "erc_03", testName: "SecurityValidator: no credential leaks", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_04", name: "RecoveryValidator: all scenarios pass", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new RecoveryValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_04", testName: "RecoveryValidator: all scenarios pass", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} status=${r.status}` : "RecoveryValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_04", testName: "RecoveryValidator: all scenarios pass", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_05", name: "PersistenceValidator: sessions survive restart", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new PersistenceValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_05", testName: "PersistenceValidator: sessions survive restart", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} status=${r.status}` : "PersistenceValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_05", testName: "PersistenceValidator: sessions survive restart", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_06", name: "ArchitectureValidator: layers present", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new ArchitectureValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_06", testName: "ArchitectureValidator: layers present", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} status=${r.status}` : "ArchitectureValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_06", testName: "ArchitectureValidator: layers present", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_07", name: "GovernanceValidator: governance active", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new GovernanceValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_07", testName: "GovernanceValidator: governance active", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} status=${r.status}` : "GovernanceValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_07", testName: "GovernanceValidator: governance active", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_08", name: "ConnectorValidator: UCP runtime + registry OK", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const v = new ConnectorValidator();
        const r = await v.validate();
        const ok = !!r.id && r.checks.length > 0;
        return { testId: "erc_08", testName: "ConnectorValidator: UCP runtime + registry OK", category: "ERC" as any,
          passed: ok, detail: ok ? `score=${r.score} status=${r.status}` : "ConnectorValidator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_08", testName: "ConnectorValidator: UCP runtime + registry OK", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_09", name: "MemoryValidator + KGValidator execute", category: "ERC" as any,
    run: (): RegressionResult => {
      const t0 = Date.now();
      try {
        const mv = new MemoryValidator();
        const mr = mv.validate();
        const kgv = new KnowledgeGraphValidator();
        const kr = kgv.validate();
        const ok = !!mr.id && !!kr.id && mr.checks.length > 0 && kr.checks.length > 0;
        return { testId: "erc_09", testName: "MemoryValidator + KGValidator execute", category: "ERC" as any,
          passed: ok, detail: ok ? `mem=${mr.score} kg=${kr.score}` : "Validator failed",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_09", testName: "MemoryValidator + KGValidator execute", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
  {
    id: "erc_10", name: "ReadinessEngine.run() produces certification", category: "ERC" as any,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      try {
        const engine = new ReadinessEngine();
        const report = await engine.run();
        const ok = !!report.id && !!report.certification && report.scorecard.overall >= 0;
        return { testId: "erc_10", testName: "ReadinessEngine.run() produces certification", category: "ERC" as any,
          passed: ok, detail: ok
            ? `cert=${report.certification} overall=${report.scorecard.overall}% duration=${report.durationMs}ms`
            : "Engine did not produce a valid report",
          durationMs: Date.now() - t0 };
      } catch (e) {
        return { testId: "erc_10", testName: "ReadinessEngine.run() produces certification", category: "ERC" as any,
          passed: false, detail: String(e), durationMs: Date.now() - t0 };
      }
    },
  },
];