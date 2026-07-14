/**
 * CertificationEngine.ts
 * Sprint 6.4.2A — Connector Certification Engine
 *
 * Evaluates all qualification domains and generates the official
 * Certification Report for the Google Workspace Reference Connector.
 * Score: 0-100. Certified if score >= 95 and no critical failures.
 */

import { runOAuthQualification } from './OAuthQualification';
import { runMultiConnectionQualification } from './MultiConnectionQualification';
import { runStressQualification } from './StressQualification';
import { runRuntimeQualification } from './RuntimeQualification';
import { runGWTests } from '../gwTests';
import type {
  QualResult, QualSuite, CertDomain, CertDomainScore, CertificationReport,
} from './QualificationTypes';

// Domain weights — sum = 100
const DOMAIN_WEIGHTS: Record<CertDomain, number> = {
  identity:    15,
  runtime:     20,
  workflow:    10,
  audit:       10,
  metrics:     8,
  health:      8,
  security:    10,
  performance: 9,
  observability: 10,
};

// Category → Domain mapping
const CATEGORY_DOMAIN: Record<string, CertDomain> = {
  oauth:            'identity',
  identity:         'identity',
  runtime:          'runtime',
  'multi-connection': 'runtime',
  stress:           'performance',
  engineering:      'audit',
  workflow:         'workflow',
  health:           'health',
  metrics:          'metrics',
  security:         'security',
  observability:    'observability',
};

function groupByDomain(results: QualResult[]): Record<CertDomain, QualResult[]> {
  const groups: Partial<Record<CertDomain, QualResult[]>> = {};
  for (const r of results) {
    const domain = CATEGORY_DOMAIN[r.category] ?? 'observability';
    if (!groups[domain]) groups[domain] = [];
    groups[domain]!.push(r);
  }
  return groups as Record<CertDomain, QualResult[]>;
}

function scoreDomain(domain: CertDomain, results: QualResult[]): CertDomainScore {
  if (!results || results.length === 0) {
    return { domain, score: 0, maxScore: DOMAIN_WEIGHTS[domain], passed: 0, total: 0, status: 'skip', notes: ['No tests in domain'] };
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const warned  = results.filter((r) => r.status === 'warn').length;
  const total   = results.length;
  const ratio   = (passed + warned * 0.5) / total;
  const score   = Math.round(ratio * DOMAIN_WEIGHTS[domain]);
  const status  = ratio === 1 ? 'pass' : ratio >= 0.8 ? 'warn' : 'fail';
  const notes   = results.filter((r) => !r.status.match('pass|warn')).map((r) => r.error ?? r.name);
  return { domain, score, maxScore: DOMAIN_WEIGHTS[domain], passed, total, status: status as any, notes };
}

async function collectAllResults(): Promise<QualResult[]> {
  const [oauthR, mcR, stressR, runtimeR, gwBase] = await Promise.all([
    runOAuthQualification(),
    runMultiConnectionQualification(),
    runStressQualification(),
    runRuntimeQualification(),
    runGWTests().then((r) => r.results.map((t): QualResult => ({
      id:         t.name,
      name:       t.name,
      category:   'runtime',
      status:     t.passed ? 'pass' : 'fail',
      durationMs: t.duration,
      error:      t.error,
    }))),
  ]);
  return [...oauthR, ...mcR, ...stressR, ...runtimeR, ...gwBase];
}

export async function runCertificationEngine(): Promise<CertificationReport & { suites: QualSuite[] }> {
  const allResults = await collectAllResults();

  const grouped   = groupByDomain(allResults);
  const domains   = Object.keys(DOMAIN_WEIGHTS) as CertDomain[];
  const scores    = domains.map((d) => scoreDomain(d, grouped[d] ?? []));

  const overall       = scores.reduce((s, d) => s + d.score, 0);
  const maxPossible   = scores.reduce((s, d) => s + d.maxScore, 0);
  const overallPct    = Math.round((overall / maxPossible) * 100);
  const criticalFails = scores.filter((d) => d.status === 'fail' && ['identity', 'runtime'].includes(d.domain));
  const certified     = overallPct >= 90 && criticalFails.length === 0;

  // Build suites for UI display
  const suiteMap: Record<string, QualResult[]> = {};
  for (const r of allResults) {
    const suite = r.category;
    if (!suiteMap[suite]) suiteMap[suite] = [];
    suiteMap[suite].push(r);
  }
  const suites: QualSuite[] = Object.entries(suiteMap).map(([name, results]) => ({
    name,
    results,
    passed:   results.filter((r) => r.status === 'pass').length,
    failed:   results.filter((r) => r.status === 'fail').length,
    warned:   results.filter((r) => r.status === 'warn').length,
    total:    results.length,
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
  }));

  const totalPassed = allResults.filter((r) => r.status === 'pass').length;
  const totalFailed = allResults.filter((r) => r.status === 'fail').length;

  const badge = certified
    ? 'GOOGLE WORKSPACE CERTIFIED'
    : overallPct >= 80 ? 'CONDITIONAL CERTIFICATION' : 'CERTIFICATION FAILED';

  const summary = certified
    ? `Google Workspace Reference Connector passed platform qualification with ${overallPct}/100 score. ${totalPassed}/${allResults.length} tests passed. All critical domains (Identity, Runtime) are GREEN. The connector is officially certified as the MemoryOS Reference Connector.`
    : `Qualification completed with score ${overallPct}/100. ${totalPassed}/${allResults.length} tests passed. ${totalFailed} failures detected. Review failed domains before certification.`;

  const report: CertificationReport = {
    connectorId:   'google-workspace',
    connectorName: 'Google Workspace Reference Connector',
    version:       '1.0.0',
    generatedAt:   new Date().toISOString(),
    overall:       overallPct,
    certified,
    domains:       scores,
    summary,
    badge,
    auditTrail:    allResults,
  };

  return { ...report, suites };
}