// Connector Runtime — Test Suite
// Foundation v1.0 · Engineering First
//
// Criterios de aceitacao:
// 1. Registrar Base44Connector
// 2. Registrar GitHubConnector
// 3. ConnectorRegistry localiza ambos
// 4. ConnectorLoader inicializa ambos
// 5. ConnectorRuntime executa ambos
// 6. ConnectorExecutor retorna ConnectorResult padronizado
// 7. Logs sao registrados
// 8. Health Check retorna SUCCESS

import { ConnectorRuntime } from "./ConnectorRuntime";
import { Base44Connector } from "./connectors/Base44Connector";
import { GitHubConnector } from "./connectors/GitHubConnector";

export interface RuntimeTestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}

const BASE_CTX = {
  userId: "test-user",
  projectId: "test-project",
  sessionId: "test-session",
};

async function run(name: string, fn: () => Promise<void>): Promise<RuntimeTestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (err) {
    return { name, passed: false, durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runConnectorRuntimeTests(): Promise<RuntimeTestResult[]> {
  const runtime = new ConnectorRuntime();
  const base44  = new Base44Connector();
  const github  = new GitHubConnector();

  const results: RuntimeTestResult[] = [];

  // 1. Register Base44Connector
  results.push(await run("Register Base44Connector", async () => {
    runtime.register(base44);
    const list = runtime.listConnectors();
    if (!list.find(c => c.id === "base44")) throw new Error("base44 not found after registration");
  }));

  // 2. Register GitHubConnector
  results.push(await run("Register GitHubConnector", async () => {
    runtime.register(github);
    const list = runtime.listConnectors();
    if (!list.find(c => c.id === "github")) throw new Error("github not found after registration");
  }));

  // 3. ConnectorRegistry locates both
  results.push(await run("ConnectorRegistry locates both connectors", async () => {
    const list = runtime.listConnectors();
    if (list.length < 2) throw new Error(`Expected 2 connectors, got ${list.length}`);
  }));

  // 4. ConnectorLoader initializes both
  results.push(await run("ConnectorLoader initializes Base44Connector", async () => {
    await runtime.load("base44", { ...BASE_CTX, executionId: "init-base44" });
    if (!runtime.isLoaded("base44")) throw new Error("base44 not loaded");
  }));

  results.push(await run("ConnectorLoader initializes GitHubConnector", async () => {
    await runtime.load("github", { ...BASE_CTX, executionId: "init-github" });
    if (!runtime.isLoaded("github")) throw new Error("github not loaded");
  }));

  // 5 & 6. Execute and return standardized ConnectorResult
  results.push(await run("ConnectorRuntime executes Base44Connector test.ping", async () => {
    const result = await runtime.execute("base44", "test.ping", {}, BASE_CTX);
    if (!result.success) throw new Error(result.error ?? "execution failed");
    if (!(result.data as any)?.pong) throw new Error("expected pong in data");
  }));

  results.push(await run("ConnectorRuntime executes GitHubConnector test.ping", async () => {
    const result = await runtime.execute("github", "test.ping", {}, BASE_CTX);
    if (!result.success) throw new Error(result.error ?? "execution failed");
    if (!(result.data as any)?.pong) throw new Error("expected pong in data");
  }));

  results.push(await run("ConnectorResult contains executionId and connectorId", async () => {
    const result = await runtime.execute("base44", "test.echo", { msg: "hello" }, BASE_CTX);
    if (!result.executionId) throw new Error("missing executionId");
    if (result.connectorId !== "base44") throw new Error("wrong connectorId");
  }));

  // 7. Logs are recorded
  results.push(await run("Execution logs are recorded", async () => {
    const result = await runtime.execute("github", "test.echo", { x: 1 }, BASE_CTX);
    if (!result.logs || result.logs.length === 0) throw new Error("no logs recorded");
  }));

  results.push(await run("Execution history is tracked by runtime", async () => {
    const history = runtime.getHistory();
    if (history.length === 0) throw new Error("execution history is empty");
  }));

  // 8. Health check returns healthy
  results.push(await run("Health check Base44Connector returns healthy", async () => {
    const h = await runtime.health("base44");
    if (h.status !== "healthy") throw new Error(`expected healthy, got ${h.status}`);
  }));

  results.push(await run("Health check GitHubConnector returns healthy", async () => {
    const h = await runtime.health("github");
    if (h.status !== "healthy") throw new Error(`expected healthy, got ${h.status}`);
  }));

  results.push(await run("Metrics are tracked after executions", async () => {
    const m = runtime.getMetrics("base44");
    if (!m || m.totalExecutions === 0) throw new Error("no metrics recorded");
  }));

  return results;
}