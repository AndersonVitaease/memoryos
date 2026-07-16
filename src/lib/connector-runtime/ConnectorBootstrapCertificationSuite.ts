/**
 * ConnectorBootstrapCertificationSuite.ts — Engineering Sprint 8.2
 *
 * Valida exhaustivamente o ConnectorBootstrap e o ConnectorRegistry.
 * Meta: 100% de aprovacao.
 *
 * SRP: certificacao apenas. Sem logica de producao.
 * Nenhuma alteracao no Core, Runtime, UCR, MCOE ou MissionPlanner.
 */

import { ConnectorBootstrap } from "./ConnectorBootstrap";
import { ConnectorRegistry } from "./ConnectorRegistry";

export interface CertificationCase {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly detail: string;
}

export interface CertificationReport {
  readonly suiteName: string;
  readonly totalCases: number;
  readonly passed: number;
  readonly failed: number;
  readonly passRate: number;
  readonly totalDurationMs: number;
  readonly cases: readonly CertificationCase[];
  readonly certified: boolean;
}

async function runCase(
  id: string,
  description: string,
  fn: () => boolean | Promise<boolean>,
): Promise<CertificationCase> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return Object.freeze({
      id,
      description,
      passed: result,
      durationMs: Date.now() - t0,
      detail: result ? "PASS" : "FAIL — assertion returned false",
    });
  } catch (e) {
    return Object.freeze({
      id,
      description,
      passed: false,
      durationMs: Date.now() - t0,
      detail: `FAIL — threw: ${(e as Error).message}`,
    });
  }
}

export async function runConnectorBootstrapCertification(): Promise<CertificationReport> {
  const t0 = Date.now();

  // Bootstrap once into a fresh registry for all tests
  const registry = new ConnectorRegistry();
  const result = await ConnectorBootstrap.bootstrap(registry);

  const cases: CertificationCase[] = [];

  cases.push(await runCase(
    "C-01", "Bootstrap executa corretamente (connectorsLoaded >= 1)",
    () => result.connectorsLoaded >= 1,
  ));

  cases.push(await runCase(
    "C-02", "Gmail registrado",
    () => registry.has("gmail"),
  ));

  cases.push(await runCase(
    "C-03", "Google Drive registrado",
    () => registry.has("google-drive"),
  ));

  cases.push(await runCase(
    "C-04", "Google Calendar registrado",
    () => registry.has("google-calendar"),
  ));

  cases.push(await runCase(
    "C-05", "Nenhum Connector duplicado (registry.count() === connectorIds.length)",
    () => registry.count() === result.connectorIds.length,
  ));

  cases.push(await runCase(
    "C-06", "Nenhuma Capability duplicada",
    () => {
      const allCaps: string[] = [];
      for (const id of result.connectorIds) {
        const c = registry.get(id);
        if (c) allCaps.push(...c.metadata().capabilities);
      }
      return allCaps.length === new Set(allCaps).size;
    },
  ));

  cases.push(await runCase(
    "C-07", "IDs unicos em connectorIds",
    () => new Set(result.connectorIds).size === result.connectorIds.length,
  ));

  cases.push(await runCase(
    "C-08", "Bootstrap idempotente (segunda chamada nao duplica, registra erros de duplicidade)",
    async () => {
      const reg2 = new ConnectorRegistry();
      const r1 = await ConnectorBootstrap.bootstrap(reg2);
      const r2 = await ConnectorBootstrap.bootstrap(reg2);
      // Second run must report duplicate errors for each already-registered connector
      return r1.connectorsLoaded > 0 && r2.errors.some((e) => e.includes("already registered"));
    },
  ));

  cases.push(await runCase(
    "C-09", "Registry consistente (listAll() count matches registry.count())",
    () => registry.listAll().length === registry.count(),
  ));

  cases.push(await runCase(
    "C-10", "statistics() correto",
    () => {
      const stats = registry.statistics();
      return (
        stats.connectorsLoaded === result.connectorsLoaded &&
        stats.connectorIds.length === result.connectorIds.length &&
        stats.capabilitiesLoaded === result.capabilitiesLoaded
      );
    },
  ));

  cases.push(await runCase(
    "C-11", "capabilitiesLoaded > 0",
    () => result.capabilitiesLoaded > 0,
  ));

  cases.push(await runCase(
    "C-12", "Bootstrap Performance (bootstrapTimeMs < 5000ms)",
    () => result.bootstrapTimeMs < 5000,
  ));

  cases.push(await runCase(
    "C-13", "Regressao — Gmail capabilities intactas (readInbox, searchEmails presentes)",
    () => {
      const gmail = registry.get("gmail");
      if (!gmail) return false;
      const caps = gmail.metadata().capabilities;
      return caps.includes("readInbox") && caps.includes("searchEmails");
    },
  ));

  cases.push(await runCase(
    "C-14", "Regressao — Drive capabilities intactas (drive.files.list, drive.files.search presentes)",
    () => {
      const drive = registry.get("google-drive");
      if (!drive) return false;
      const caps = drive.metadata().capabilities;
      return caps.includes("drive.files.list") && caps.includes("drive.files.search");
    },
  ));

  cases.push(await runCase(
    "C-15", "Regressao — Calendar capabilities intactas (calendar.events.list presente)",
    () => {
      const cal = registry.get("google-calendar");
      if (!cal) return false;
      return cal.metadata().capabilities.includes("calendar.events.list");
    },
  ));

  const passed = cases.filter((c) => c.passed).length;
  const total  = cases.length;

  return Object.freeze({
    suiteName:       "ConnectorBootstrapCertificationSuite v1.0 — Sprint 8.2",
    totalCases:      total,
    passed,
    failed:          total - passed,
    passRate:        Math.round((passed / total) * 100),
    totalDurationMs: Date.now() - t0,
    cases:           Object.freeze(cases),
    certified:       passed === total,
  });
}