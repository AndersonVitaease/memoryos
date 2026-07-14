/**
 * governanceTests.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Suite de testes para todos os motores de governança.
 * Cobertura: CoreProtectionEngine, EngineeringPermissionEngine,
 *            ChangeImpactAnalyzer, ImplementationSandbox, RollbackEngine,
 *            GovernancePolicyEngine, GovernanceAuditEngine, SecurityEngine,
 *            EngineeringGovernance (facade).
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import { EngineeringPermissionEngine } from './EngineeringPermissionEngine';
import { ChangeImpactAnalyzer } from './ChangeImpactAnalyzer';
import { ImplementationSandbox } from './ImplementationSandbox';
import { RollbackEngine } from './RollbackEngine';
import { GovernancePolicyEngine } from './GovernancePolicyEngine';
import { GovernanceAuditEngine } from './GovernanceAuditEngine';
import { SecurityEngine } from './SecurityEngine';
import { EngineeringGovernance } from './EngineeringGovernance';

// ─── Minimal test harness ────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (e: unknown) {
    return {
      name,
      passed: false,
      error: e instanceof Error ? e.message : String(e),
      duration: Date.now() - start,
    };
  }
}

// ─── CoreProtectionEngine Tests ──────────────────────────────────────────────

const coreTests = [
  runTest('CPE-01: listProtected returns non-empty array', () => {
    const list = CoreProtectionEngine.listProtected();
    assert(list.length > 0, 'Expected protected components');
  }),
  runTest('CPE-02: isProtected returns true for wme path', () => {
    assert(CoreProtectionEngine.isProtected('src/lib/wme/WorkingMemoryEngine.ts'), 'Expected protected');
  }),
  runTest('CPE-03: isProtected returns false for unregistered path', () => {
    assert(!CoreProtectionEngine.isProtected('src/pages/Home.jsx'), 'Expected not protected');
  }),
  runTest('CPE-04: checkOperation blocks write on immutable', () => {
    const r = CoreProtectionEngine.checkOperation('src/lib/wme/index.ts', 'write');
    assert(r.blocked, 'Expected write to be blocked on immutable');
  }),
  runTest('CPE-05: checkOperation allows read on immutable', () => {
    const r = CoreProtectionEngine.checkOperation('src/lib/wme/index.ts', 'read');
    assert(!r.blocked, 'Expected read to be allowed on immutable');
  }),
  runTest('CPE-06: checkOperation blocks delete on restricted', () => {
    const r = CoreProtectionEngine.checkOperation('src/lib/fce/index.ts', 'delete');
    assert(r.blocked, 'Expected delete to be blocked on restricted');
  }),
  runTest('CPE-07: getProtectionLevel returns correct level', () => {
    const level = CoreProtectionEngine.getProtectionLevel('src/lib/wme/types.ts');
    assert(level === 'immutable', `Expected immutable, got ${level}`);
  }),
  runTest('CPE-08: find returns component by path prefix', () => {
    const c = CoreProtectionEngine.find('src/lib/sprint1/WorkingMemoryEngine.ts');
    assert(c !== null, 'Expected to find sprint1 component');
    assert(c!.id === 'sprint1', `Expected id sprint1, got ${c!.id}`);
  }),
  runTest('CPE-09: health returns ok status', () => {
    const h = CoreProtectionEngine.health();
    assert(h.status === 'ok', 'Expected ok status');
    assert(h.componentCount > 0, 'Expected components');
  }),
];

// ─── EngineeringPermissionEngine Tests ───────────────────────────────────────

const permTests = [
  runTest('EPE-01: admin role can execute write', () => {
    const r = EngineeringPermissionEngine.check('user-1', 'admin', 'write', 'src/pages/Home.jsx');
    assert(r.allowed, 'Admin should be allowed to write');
  }),
  runTest('EPE-02: viewer role cannot write', () => {
    const r = EngineeringPermissionEngine.check('user-2', 'viewer', 'write', 'src/pages/Home.jsx');
    assert(!r.allowed, 'Viewer should not be allowed to write');
  }),
  runTest('EPE-03: core protection block overrides admin', () => {
    const r = EngineeringPermissionEngine.check(
      'user-1',
      'admin',
      'write',
      'src/lib/wme/index.ts',
      { blocked: true, reason: 'Immutable component' }
    );
    assert(!r.allowed, 'Core protection should override admin grant');
  }),
  runTest('EPE-04: explicit grant overrides role default', () => {
    EngineeringPermissionEngine.grant({
      principalId: 'user-explicit',
      principalRole: 'viewer',
      operation: 'write',
      targetPath: 'src/pages',
      level: 'execute',
      grantedAt: new Date().toISOString(),
    });
    const r = EngineeringPermissionEngine.check('user-explicit', 'viewer', 'write', 'src/pages/Home.jsx');
    assert(r.allowed, 'Explicit grant should allow write');
  }),
  runTest('EPE-05: revoke removes explicit permission', () => {
    EngineeringPermissionEngine.revoke('user-explicit', 'write', 'src/pages');
    const grants = EngineeringPermissionEngine.listGrants();
    const found = grants.find(
      (g) => g.principalId === 'user-explicit' && g.operation === 'write' && g.targetPath === 'src/pages'
    );
    assert(!found, 'Grant should be revoked');
  }),
  runTest('EPE-06: delete requires admin', () => {
    const r = EngineeringPermissionEngine.check('user-eng', 'engineer', 'delete', 'src/pages/Home.jsx');
    assert(!r.allowed, 'Engineer should not be allowed to delete');
  }),
];

// ─── ChangeImpactAnalyzer Tests ───────────────────────────────────────────────

const impactTests = [
  runTest('CIA-01: write on immutable core returns critical severity', () => {
    const r = ChangeImpactAnalyzer.analyze('src/lib/wme/WorkingMemoryEngine.ts', 'write');
    assert(r.severity === 'critical', `Expected critical, got ${r.severity}`);
  }),
  runTest('CIA-02: risk score is between 0 and 100', () => {
    const r = ChangeImpactAnalyzer.analyze('src/lib/wme/WorkingMemoryEngine.ts', 'write');
    assert(r.riskScore >= 0 && r.riskScore <= 100, `Risk score out of range: ${r.riskScore}`);
  }),
  runTest('CIA-03: read on immutable returns non-critical severity', () => {
    const r = ChangeImpactAnalyzer.analyze('src/lib/wme/WorkingMemoryEngine.ts', 'read');
    assert(r.severity !== 'critical', 'Read should not be critical');
  }),
  runTest('CIA-04: analyzeMany returns one report per target', () => {
    const reports = ChangeImpactAnalyzer.analyzeMany([
      { path: 'src/lib/wme', operation: 'read' },
      { path: 'src/pages/Home.jsx', operation: 'write' },
    ]);
    assert(reports.length === 2, `Expected 2, got ${reports.length}`);
  }),
  runTest('CIA-05: requiresBoardApproval for critical reports', () => {
    const reports = ChangeImpactAnalyzer.analyzeMany([
      { path: 'src/lib/wme', operation: 'write' },
    ]);
    assert(ChangeImpactAnalyzer.requiresBoardApproval(reports), 'Expected board approval required');
  }),
];

// ─── ImplementationSandbox Tests ─────────────────────────────────────────────

const sandboxTests = [
  runTest('ISB-01: execute returns sandboxId', async () => {
    const r = await ImplementationSandbox.execute('src/pages/Home.jsx', 'write', () => 'ok', 'user-1');
    assert(typeof r.sandboxId === 'string', 'Expected sandboxId');
  }),
  runTest('ISB-02: execute on immutable core is blocked', async () => {
    const r = await ImplementationSandbox.execute('src/lib/wme/index.ts', 'write', () => 'ok', 'user-1');
    assert(!r.success, 'Expected sandbox to block write on immutable');
    assert(r.error !== undefined, 'Expected error message');
  }),
  runTest('ISB-03: approve marks sandbox as approved', async () => {
    const r = await ImplementationSandbox.execute(
      'src/lib/connector-runtime/index.ts',
      'write',
      () => 'result',
      'user-eng'
    );
    const approved = ImplementationSandbox.approve(r.sandboxId, 'user-admin');
    assert(approved, 'Expected approval to succeed');
  }),
  runTest('ISB-04: health returns status ok', () => {
    const h = ImplementationSandbox.health();
    assert(h.status === 'ok', 'Expected ok status');
  }),
];

// ─── RollbackEngine Tests ─────────────────────────────────────────────────────

const rollbackTests = [
  runTest('RBE-01: capture returns snapshot with id', () => {
    const snap = RollbackEngine.capture('test-snap', ['src/lib/wme'], { 'src/lib/wme': { version: 1 } });
    assert(typeof snap.snapshotId === 'string', 'Expected snapshotId');
    assert(snap.label === 'test-snap', 'Expected label match');
  }),
  runTest('RBE-02: rollback restores known paths', () => {
    const snap = RollbackEngine.capture('test-rollback', ['src/lib/fce'], { 'src/lib/fce': { version: 2 } });
    const r = RollbackEngine.rollback(snap.snapshotId);
    assert(r.success, 'Expected rollback success');
    assert(r.restoredPaths.includes('src/lib/fce'), 'Expected path restored');
  }),
  runTest('RBE-03: rollback fails for unknown snapshotId', () => {
    const r = RollbackEngine.rollback('nonexistent-snap');
    assert(!r.success, 'Expected failure for unknown snapshot');
  }),
  runTest('RBE-04: partial rollback restores only requested paths', () => {
    const snap = RollbackEngine.capture('partial-test', ['src/a', 'src/b'], {
      'src/a': { v: 1 },
      'src/b': { v: 2 },
    });
    const r = RollbackEngine.rollbackPartial(snap.snapshotId, ['src/a']);
    assert(r.restoredPaths.includes('src/a'), 'Expected src/a restored');
    assert(!r.restoredPaths.includes('src/b'), 'Expected src/b NOT restored');
  }),
  runTest('RBE-05: versionChain returns ordered entries', () => {
    const chain = RollbackEngine.versionChain();
    assert(Array.isArray(chain), 'Expected array');
    assert(chain.length > 0, 'Expected non-empty chain');
  }),
];

// ─── GovernancePolicyEngine Tests ────────────────────────────────────────────

const policyTests = [
  runTest('GPE-01: listPolicies returns baseline policies', () => {
    const policies = GovernancePolicyEngine.listPolicies();
    assert(policies.length >= 4, `Expected at least 4 policies, got ${policies.length}`);
  }),
  runTest('GPE-02: write on immutable fails baseline policy', () => {
    const evals = GovernancePolicyEngine.evaluate('src/lib/wme/index.ts', 'write', 'execute');
    const failed = evals.filter((e) => !e.passed);
    assert(failed.length > 0, 'Expected at least one policy failure');
  }),
  runTest('GPE-03: write on immutable passes with admin permission', () => {
    const passes = GovernancePolicyEngine.passes('src/lib/wme/index.ts', 'write', 'admin');
    assert(passes, 'Admin should pass policy for write on immutable');
  }),
  runTest('GPE-04: custom policy can be registered', () => {
    GovernancePolicyEngine.registerPolicy({
      id: 'test-custom-policy',
      name: 'Test Custom Policy',
      description: 'Test only',
      targets: ['src/test'],
      requiredPermission: 'execute',
      blockConditions: ['operation=delete'],
      enabled: true,
    });
    const policies = GovernancePolicyEngine.listPolicies();
    assert(policies.some((p) => p.id === 'test-custom-policy'), 'Expected custom policy registered');
  }),
  runTest('GPE-05: custom policy can be disabled', () => {
    const result = GovernancePolicyEngine.disablePolicy('test-custom-policy');
    assert(result, 'Expected disable to succeed');
    const policies = GovernancePolicyEngine.listPolicies();
    assert(!policies.some((p) => p.id === 'test-custom-policy'), 'Expected custom policy disabled');
  }),
];

// ─── GovernanceAuditEngine Tests ─────────────────────────────────────────────

const auditTests = [
  runTest('GAE-01: record creates an audit entry', () => {
    const before = GovernanceAuditEngine.trail().length;
    GovernanceAuditEngine.record('permission_check', 'user-test', 'src/test', 'read', 'allowed', {});
    const after = GovernanceAuditEngine.trail().length;
    assert(after === before + 1, 'Expected one new record');
  }),
  runTest('GAE-02: filterByPrincipal returns correct records', () => {
    GovernanceAuditEngine.record('change_approved', 'user-filter-test', 'src/x', 'write', 'allowed', {});
    const records = GovernanceAuditEngine.filterByPrincipal('user-filter-test');
    assert(records.length >= 1, 'Expected at least one record for principal');
  }),
  runTest('GAE-03: summary counts are consistent', () => {
    const s = GovernanceAuditEngine.summary();
    assert(s.total === s.allowed + s.denied + s.pending, 'Expected totals to match');
  }),
  runTest('GAE-04: recent returns last N records', () => {
    const r = GovernanceAuditEngine.recent(5);
    assert(r.length <= 5, 'Expected at most 5 records');
  }),
];

// ─── SecurityEngine Tests ────────────────────────────────────────────────────

const securityTests = [
  runTest('SE-01: blocked principal is denied', () => {
    SecurityEngine.blockPrincipal('blocked-user');
    const r = SecurityEngine.check('blocked-user', 'src/pages/Home.jsx', 'read', 'read');
    assert(!r.allowed, 'Blocked principal should be denied');
    SecurityEngine.unblockPrincipal('blocked-user');
  }),
  runTest('SE-02: write on immutable core is denied', () => {
    const r = SecurityEngine.check('user-eng', 'src/lib/wme/index.ts', 'write', 'execute');
    assert(!r.allowed, 'Write on immutable should be denied by security');
  }),
  runTest('SE-03: allowed operation returns no violations', () => {
    const r = SecurityEngine.check('user-eng', 'src/pages/Home.jsx', 'read', 'read');
    assert(r.allowed, 'Read on open path should be allowed');
    assert(r.violations.length === 0, 'Expected no violations');
  }),
  runTest('SE-04: enforce throws on denied operation', () => {
    let threw = false;
    try {
      SecurityEngine.enforce('bad-user', 'src/lib/wme/index.ts', 'delete', 'read');
    } catch {
      threw = true;
    }
    assert(threw, 'Expected enforce to throw');
  }),
];

// ─── EngineeringGovernance Facade Tests ──────────────────────────────────────

const facadeTests = [
  runTest('EG-01: evaluate rejects write on immutable for non-admin', () => {
    const d = EngineeringGovernance.evaluate({
      principalId: 'user-eng',
      principalRole: 'engineer',
      targetPath: 'src/lib/wme/index.ts',
      operation: 'write',
    });
    assert(!d.approved, 'Expected rejection');
    assert(d.violations.length > 0, 'Expected violations');
  }),
  runTest('EG-02: evaluate approves read on open path', () => {
    const d = EngineeringGovernance.evaluate({
      principalId: 'user-viewer',
      principalRole: 'viewer',
      targetPath: 'src/pages/Home.jsx',
      operation: 'read',
    });
    assert(d.approved, 'Expected approval for read on open path');
  }),
  runTest('EG-03: execute returns sandboxId for allowed operation', async () => {
    const { decision, sandboxId } = await EngineeringGovernance.execute(
      {
        principalId: 'user-admin',
        principalRole: 'admin',
        targetPath: 'src/pages/Home.jsx',
        operation: 'write',
      },
      () => 'executed'
    );
    assert(decision !== undefined, 'Expected decision');
    assert(typeof sandboxId === 'string', 'Expected sandboxId');
  }),
  runTest('EG-04: health returns all engines', () => {
    const h = EngineeringGovernance.health();
    const keys = Object.keys(h);
    assert(keys.includes('coreProtection'), 'Expected coreProtection');
    assert(keys.includes('securityEngine'), 'Expected securityEngine');
    assert(keys.includes('auditEngine'), 'Expected auditEngine');
    assert(keys.length >= 8, `Expected at least 8 engines, got ${keys.length}`);
  }),
];

// ─── Runner ──────────────────────────────────────────────────────────────────

export async function runGovernanceTests(): Promise<{
  results: TestResult[];
  passed: number;
  failed: number;
  coverage: string;
}> {
  const allTests = [
    ...coreTests,
    ...permTests,
    ...impactTests,
    ...sandboxTests,
    ...rollbackTests,
    ...policyTests,
    ...auditTests,
    ...securityTests,
    ...facadeTests,
  ];

  const results = await Promise.all(allTests);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const coverage = `${passed}/${results.length} tests passed (${Math.round((passed / results.length) * 100)}%)`;

  console.log(`\n[GovernanceTests] ${coverage}`);
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const suffix = r.error ? ` — ${r.error}` : '';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)${suffix}`);
  }

  return { results, passed, failed, coverage };
}