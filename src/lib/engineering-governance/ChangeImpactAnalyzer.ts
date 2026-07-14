/**
 * ChangeImpactAnalyzer.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: calcular o impacto arquitetural de uma mudança proposta.
 * Lê o grafo de dependências do CoreProtectionEngine. Não modifica estado.
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import type { ImpactReport, OperationType, ImpactSeverity } from './GovernanceTypes';

// Static dependency graph for non-core paths (can be extended).
const KNOWN_DEPENDENCIES: Record<string, string[]> = {
  'src/lib/wme': ['src/lib/sprint1', 'src/pages/ChatPage.jsx', 'src/lib/memoryEngine.js'],
  'src/lib/sprint1': ['src/pages/ChatPage.jsx'],
  'src/lib/fce': ['src/lib/abv'],
  'src/lib/abv': ['src/pages/ArchitectureAudit.jsx'],
  'src/lib/connector-runtime': [
    'src/lib/cognitive-pipeline-adapter',
    'src/lib/universal-connector-platform',
  ],
  'src/lib/AuthContext.jsx': ['src/App.jsx', 'src/components/ProtectedRoute.jsx'],
  'src/lib/officialLibraryManager.js': ['src/lib/reasoning', 'src/lib/auditor'],
};

function computeRiskScore(severity: ImpactSeverity, affectedCount: number): number {
  const base: Record<ImpactSeverity, number> = {
    critical: 80,
    high: 60,
    medium: 40,
    low: 20,
    none: 0,
  };
  return Math.min(100, base[severity] + affectedCount * 2);
}

function resolveSeverity(path: string, operation: OperationType): ImpactSeverity {
  const level = CoreProtectionEngine.getProtectionLevel(path);
  if (!level) {
    if (operation === 'delete') return 'medium';
    if (operation === 'write' || operation === 'refactor') return 'low';
    return 'none';
  }
  if (level === 'immutable') {
    if (['write', 'delete', 'migrate', 'refactor'].includes(operation)) return 'critical';
    return 'medium';
  }
  if (level === 'restricted') {
    if (operation === 'delete') return 'high';
    if (['write', 'refactor', 'migrate'].includes(operation)) return 'high';
    return 'medium';
  }
  if (level === 'audited') {
    if (operation === 'delete') return 'medium';
    return 'low';
  }
  return 'low';
}

function collectDependents(path: string, visited = new Set<string>()): string[] {
  if (visited.has(path)) return [];
  visited.add(path);

  const result: string[] = [];

  // From CoreProtectionEngine registry.
  const component = CoreProtectionEngine.find(path);
  if (component) {
    const dependents = CoreProtectionEngine.getDependents(component.id);
    for (const dep of dependents) {
      result.push(dep.path);
      result.push(...collectDependents(dep.path, visited));
    }
  }

  // From static dependency graph.
  for (const [key, deps] of Object.entries(KNOWN_DEPENDENCIES)) {
    if (path.startsWith(key) || key.startsWith(path)) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          result.push(dep);
          result.push(...collectDependents(dep, visited));
        }
      }
    }
  }

  return [...new Set(result)];
}

export class ChangeImpactAnalyzer {
  /**
   * Analyzes the impact of performing `operation` on `targetPath`.
   */
  static analyze(targetPath: string, operation: OperationType): ImpactReport {
    const severity = resolveSeverity(targetPath, operation);
    const dependencyChain = collectDependents(targetPath);
    const affectedComponents = [...new Set(dependencyChain)];
    const riskScore = computeRiskScore(severity, affectedComponents.length);
    const requiresApproval = riskScore >= 60 || severity === 'critical' || severity === 'high';

    return {
      targetPath,
      operation,
      severity,
      affectedComponents,
      dependencyChain,
      riskScore,
      requiresApproval,
      summary: `Operation "${operation}" on "${targetPath}" has ${severity} impact. Risk score: ${riskScore}/100. Affected: ${affectedComponents.length} component(s).`,
    };
  }

  /**
   * Batch analysis for multiple paths.
   */
  static analyzeMany(targets: Array<{ path: string; operation: OperationType }>): ImpactReport[] {
    return targets.map(({ path, operation }) => this.analyze(path, operation));
  }

  /**
   * Returns true if any of the targets have critical or high impact.
   */
  static requiresBoardApproval(reports: ImpactReport[]): boolean {
    return reports.some((r) => r.severity === 'critical' || r.severity === 'high');
  }

  static health(): { status: 'ok'; knownPaths: number } {
    return { status: 'ok', knownPaths: Object.keys(KNOWN_DEPENDENCIES).length };
  }
}