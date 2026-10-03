// ORCH-DAEMON-01: 5 casos do ciclo do daemon (node --import tsx --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDaemonCycle, LOCK_PATH } from "../src/orchestrateConsumeDaemon.mjs";

test("1. fila vazia → ciclo ok, modo plan, nada executado", async () => {
  const r = await runDaemonCycle();
  assert.equal(r.ok, true);
  assert.equal(r.mode, "plan");
  assert.equal(r.executed, null);
});

test("2. lock concorrente → ciclo recusa (fail-closed)", async () => {
  const fs = await import("node:fs");
  // Lock em tmpdir via LOCK_PATH exportado — teste NUNCA escreve em /opt/mission-events (EROFS).
  fs.writeFileSync(LOCK_PATH, "other");
  fs.utimesSync(LOCK_PATH, new Date(), new Date()); // fresco: dentro da janela de 30s
  const r = await runDaemonCycle();
  assert.equal(r.ok, false);
  assert.match(r.reason, /lock/);
  fs.unlinkSync(LOCK_PATH);
});

test("3. ciclo nunca despacha fora do caminho governado (sem execute quando plan não promove)", async () => {
  const r = await runDaemonCycle();
  // Sem promovíveis, executed permanece null — zero dispatch direto.
  assert.equal(r.executed, null);
});

test("4. resultado do ciclo é serializável (auditoria via state jsonl)", async () => {
  const r = await runDaemonCycle();
  assert.doesNotThrow(() => JSON.stringify(r));
});

test("5. maxPromotions respeitado no plano (limite de slots por ciclo)", async () => {
  const r = await runDaemonCycle({ maxPromotions: 1 });
  assert.equal(r.ok, true);
  if (r.plan && typeof r.plan.promoted === "number") {
    assert.ok(r.plan.promoted <= 1);
  }
});