/**
 * MQCCS — MemoryOS Quality, Compliance & Certification Specification
 * SDK Compliance Validator (Capítulo 4)
 *
 * Valida automaticamente se qualquer componente implementa corretamente
 * sua interface oficial, de acordo com os Contract Tests do Capítulo 3.
 */

// ─── Contract Test Runners ────────────────────────────────────────────────

export async function validateConnector(connector) {
  const checks = [];

  // Interface structure
  checks.push({ id: "interface.connectorId",  label: "connectorId presente",          passed: typeof connector.connectorId  === "string" && connector.connectorId.length > 0  });
  checks.push({ id: "interface.capabilityId", label: "capabilityId presente",         passed: typeof connector.capabilityId === "string" && connector.capabilityId.length > 0 });
  checks.push({ id: "interface.validate",     label: "validate() implementado",       passed: typeof connector.validate     === "function" });
  checks.push({ id: "interface.execute",      label: "execute() implementado",        passed: typeof connector.execute      === "function" });
  checks.push({ id: "interface.healthCheck",  label: "healthCheck() implementado",    passed: typeof connector.healthCheck  === "function" });
  checks.push({ id: "interface.getMetadata",  label: "getMetadata() implementado",    passed: typeof connector.getMetadata  === "function" });

  // Metadata quality
  if (typeof connector.getMetadata === "function") {
    const meta = connector.getMetadata();
    checks.push({ id: "metadata.version",     label: "version declarada",             passed: typeof meta.version === "string" && meta.version.length > 0 });
    checks.push({ id: "metadata.latency",     label: "estimatedLatencyMs declarado",  passed: typeof meta.estimatedLatencyMs === "number" });
    checks.push({ id: "metadata.rollback",    label: "supportsRollback declarado",    passed: typeof meta.supportsRollback   === "boolean" });
    // Rollback consistency
    const rollbackDeclared = meta.supportsRollback;
    const rollbackImpl     = typeof connector.rollback === "function";
    checks.push({ id: "metadata.rollbackImpl", label: "rollback() consistente com metadata", passed: !rollbackDeclared || rollbackImpl });
  }

  // Validate() contract
  if (typeof connector.validate === "function") {
    const emptyResult = connector.validate({});
    checks.push({ id: "validate.returnsObject", label: "validate() retorna objeto",   passed: typeof emptyResult === "object" && emptyResult !== null });
    checks.push({ id: "validate.hasValid",      label: "validate() tem campo valid",  passed: typeof emptyResult?.valid === "boolean" });
  }

  // HealthCheck contract
  if (typeof connector.healthCheck === "function") {
    const start = Date.now();
    const health = await connector.healthCheck().catch(() => null);
    const duration = Date.now() - start;
    checks.push({ id: "health.response",   label: "healthCheck() responde",        passed: health !== null });
    checks.push({ id: "health.status",     label: "healthCheck() tem status",      passed: ["healthy", "degraded", "unhealthy"].includes(health?.status) });
    checks.push({ id: "health.latency",    label: "healthCheck() < 500ms",         passed: duration < 500 });
    checks.push({ id: "health.timestamp",  label: "healthCheck() tem timestamp",   passed: typeof health?.timestamp === "string" });
  }

  return buildReport("Connector", connector.connectorId, checks);
}

export async function validateSpecialist(specialist) {
  const checks = [];

  checks.push({ id: "interface.specialistId", label: "specialistId presente",        passed: typeof specialist.specialistId === "string" && specialist.specialistId.length > 0 });
  checks.push({ id: "interface.domain",       label: "domain declarado",             passed: typeof specialist.domain       === "string" && specialist.domain.length > 0       });
  checks.push({ id: "interface.capabilities", label: "capabilities[] não vazio",     passed: Array.isArray(specialist.capabilities) && specialist.capabilities.length > 0      });
  checks.push({ id: "interface.process",      label: "process() implementado",       passed: typeof specialist.process      === "function"                                     });
  checks.push({ id: "interface.getMetadata",  label: "getMetadata() implementado",   passed: typeof specialist.getMetadata  === "function"                                     });

  if (typeof specialist.getMetadata === "function") {
    const meta = specialist.getMetadata();
    checks.push({ id: "metadata.languages",  label: "languages[] declarado",         passed: Array.isArray(meta.languages) && meta.languages.length > 0   });
    checks.push({ id: "metadata.expertise",  label: "expertise[] declarado",         passed: Array.isArray(meta.expertise) && meta.expertise.length > 0   });
    checks.push({ id: "metadata.version",    label: "version declarada",             passed: typeof meta.version === "string" && meta.version.length > 0  });
  }

  // Process mock call
  if (typeof specialist.process === "function") {
    const mockRequest = {
      query: "test query",
      context: {}, workingMemory: {}, identityContext: "test", journeyId: "j-test",
      knowledgeProvider: { search: async () => [] },
    };
    const response = await specialist.process(mockRequest).catch(() => null);
    checks.push({ id: "process.response",      label: "process() retorna resposta",    passed: response !== null });
    checks.push({ id: "process.facts",         label: "process() retorna facts[]",     passed: Array.isArray(response?.facts) });
    checks.push({ id: "process.reasoning",     label: "process() retorna reasoning[]", passed: Array.isArray(response?.reasoning) });
    checks.push({ id: "process.limitations",   label: "process() declara limitations", passed: Array.isArray(response?.limitations) && response.limitations.length > 0 });
    checks.push({ id: "process.confidence",    label: "process() tem confidence",      passed: typeof response?.confidence === "number" });
  }

  return buildReport("Specialist", specialist.specialistId, checks);
}

export async function validateMemoryProvider(provider) {
  const checks = [];

  checks.push({ id: "interface.store",    label: "store() implementado",    passed: typeof provider.store    === "function" });
  checks.push({ id: "interface.retrieve", label: "retrieve() implementado", passed: typeof provider.retrieve === "function" });
  checks.push({ id: "interface.delete",   label: "delete() implementado",   passed: typeof provider.delete   === "function" });
  checks.push({ id: "interface.flush",    label: "flush() implementado",    passed: typeof provider.flush    === "function" });
  checks.push({ id: "interface.getStats", label: "getStats() implementado", passed: typeof provider.getStats === "function" });

  // Functional contract
  if (typeof provider.store === "function" && typeof provider.retrieve === "function") {
    const record = await provider.store({
      userId: "_mqccs_test_", sessionId: "s-test", identityContext: "test",
      type: "FACT", tier: "working", content: { _test: true }, priority: 0.5, tags: ["_mqccs"],
    }).catch(() => null);
    checks.push({ id: "store.returnsRecord", label: "store() retorna record", passed: record !== null });

    const records = await provider.retrieve({ userId: "_mqccs_test_" }).catch(() => []);
    checks.push({ id: "retrieve.finds",  label: "retrieve() encontra o record salvo", passed: records.length > 0 });

    // Isolation: another user should not see it
    const other = await provider.retrieve({ userId: "_mqccs_other_" }).catch(() => []);
    checks.push({ id: "isolation.userId", label: "isolamento por userId garantido", passed: other.length === 0 });

    // Cleanup
    if (record?.memoryId) {
      await provider.delete(record.memoryId, "_mqccs_test_").catch(() => {});
    }
  }

  if (typeof provider.getStats === "function") {
    const stats = await provider.getStats("_mqccs_test_").catch(() => null);
    checks.push({ id: "stats.byTier", label: "getStats() retorna byTier", passed: stats?.byTier !== undefined });
  }

  return buildReport("MemoryProvider", "IMemoryProvider", checks);
}

export async function validateEventBus(bus) {
  const checks = [];

  checks.push({ id: "interface.publish",          label: "publish() implementado",          passed: typeof bus.publish          === "function" });
  checks.push({ id: "interface.subscribe",        label: "subscribe() implementado",        passed: typeof bus.subscribe        === "function" });
  checks.push({ id: "interface.subscribePattern", label: "subscribePattern() implementado", passed: typeof bus.subscribePattern === "function" });
  checks.push({ id: "interface.getStats",         label: "getStats() implementado",         passed: typeof bus.getStats         === "function" });

  // Publish → Subscribe contract
  if (typeof bus.publish === "function" && typeof bus.subscribe === "function") {
    let received = null;
    bus.subscribe("_mqccs_.test", async (e) => { received = e; });
    await bus.publish({ type: "_mqccs_.test", sourceEngine: "mqccs", priority: "NORMAL", payload: { ok: true } });
    await new Promise(r => setTimeout(r, 100));
    checks.push({ id: "pubsub.delivery",  label: "mensagem entregue ao subscriber",     passed: received !== null });
    checks.push({ id: "pubsub.payload",   label: "payload preservado",                  passed: received?.payload?.ok === true });
    checks.push({ id: "pubsub.type",      label: "type preservado",                     passed: received?.type === "_mqccs_.test" });
  }

  // Pattern subscribe
  if (typeof bus.subscribePattern === "function") {
    let patternCount = 0;
    bus.subscribePattern(/^_mqccs_pattern_/, async () => { patternCount++; });
    await bus.publish({ type: "_mqccs_pattern_.a", sourceEngine: "mqccs", priority: "NORMAL", payload: {} });
    await bus.publish({ type: "_mqccs_pattern_.b", sourceEngine: "mqccs", priority: "NORMAL", payload: {} });
    await bus.publish({ type: "_other_",            sourceEngine: "mqccs", priority: "NORMAL", payload: {} });
    await new Promise(r => setTimeout(r, 100));
    checks.push({ id: "pattern.matches", label: "subscribePattern() filtra corretamente", passed: patternCount === 2 });
  }

  return buildReport("EventBus", "IEventBus", checks);
}

// ─── Report Builder ───────────────────────────────────────────────────────

function buildReport(type, id, checks) {
  const passed  = checks.filter(c => c.passed).length;
  const failed  = checks.filter(c => !c.passed).length;
  const total   = checks.length;
  const score   = Math.round((passed / total) * 100);
  const status  = failed === 0 ? "APROVADO" : score >= 80 ? "PARCIALMENTE CONFORME" : "NÃO CONFORME";

  return { type, id, checks, passed, failed, total, score, status };
}

// ─── Full Platform Validation ─────────────────────────────────────────────

export async function runFullComplianceValidation() {
  const { WorkingMemoryEngine } = await import("@/lib/mri/core/memory/WorkingMemoryEngine");
  const { EventBus }             = await import("@/lib/mri/core/event-bus/EventBus");
  const { MockEmailConnector }   = await import("@/lib/mri/connectors/MockEmailConnector");
  const { MockGovConnector }     = await import("@/lib/mri/connectors/MockGovConnector");
  const { HttpConnector }        = await import("@/lib/mri/connectors/HttpConnector");
  const { GeneralSpecialist }    = await import("@/lib/mri/specialists/GeneralSpecialist");
  const { GovernmentSpecialist } = await import("@/lib/mri/specialists/GovernmentSpecialist");

  const [
    emailReport,
    govReport,
    httpReport,
    generalReport,
    govSpecReport,
    memReport,
    busReport,
  ] = await Promise.all([
    validateConnector(new MockEmailConnector()),
    validateConnector(new MockGovConnector()),
    validateConnector(new HttpConnector()),
    validateSpecialist(new GeneralSpecialist()),
    validateSpecialist(new GovernmentSpecialist()),
    validateMemoryProvider(new WorkingMemoryEngine()),
    validateEventBus(new EventBus()),
  ]);

  const reports = [emailReport, govReport, httpReport, generalReport, govSpecReport, memReport, busReport];
  const totalPassed = reports.reduce((a, r) => a + r.passed, 0);
  const totalChecks = reports.reduce((a, r) => a + r.total,  0);
  const globalScore = Math.round((totalPassed / totalChecks) * 100);

  return { reports, totalPassed, totalChecks, globalScore };
}