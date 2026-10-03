// e2e-ORCH-QUEUE-COMPACT-01.mjs — E2E na fila de PRODUÇÃO (contrato ORCH-QUEUE-COMPACT-01):
// ciclo PLAN real (read-only, zero despacho) + compactação real contra
// /opt/mission-events/orchestrator-queue.jsonl, provando o invariante da trilha
// (fila_depois + cópias_arquivadas == fila_antes) e a elegibilidade (só missões
// closed/cancelled saem; pendentes e não-fechadas ficam).
// Zero-LLM, determinístico. Rodar: node --import tsx e2e-ORCH-QUEUE-COMPACT-01.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const QUEUE = "/opt/mission-events/orchestrator-queue.jsonl";
const ARCHIVE = "/opt/mission-events/orchestrator-queue.archive.jsonl";
const STATE = "/opt/mission-events/orchestrator-consumer.state.json";
const MISSION_STATE_DIR = "/root/.hermes/mission-state";
const PROOF = "/opt/memoryos/eng-mcp/e2e-proof-ORCH-QUEUE-COMPACT-01.json";

function readRaw(p) { try { return readFileSync(p, "utf8"); } catch { return null; } }
function sha16(s) { return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16); }
function lines(p) { const raw = readRaw(p); return raw ? raw.split("\n").filter((l) => l.trim().length > 0) : []; }

// ---- snapshot ANTES ----
const beforeRaw = readRaw(QUEUE) ?? "";
const beforeLines = lines(QUEUE).length;
const beforeSha = sha16(beforeRaw);
const beforeArchiveLines = lines(ARCHIVE).length;
const stateBefore = readRaw(STATE);
let promotedIds = [];
try { promotedIds = (JSON.parse(stateBefore ?? "{}").promotedIds ?? []).filter((v) => typeof v === "string"); } catch { /* fail-open */ }

// ledger status de cada missão citada na fila (prova de elegibilidade)
function ledgerStatus(missionId) {
  try {
    const led = JSON.parse(readFileSync(`${MISSION_STATE_DIR}/${missionId}.json`, "utf8"));
    return typeof led.status === "string" ? led.status : null;
    } catch { return null; }
}

// mapeia id de intent → missionId (payload.missionId ou fallback id)
function entryMission(l) {
  try {
    const e = JSON.parse(l);
    const p = e.payload ?? {};
    return typeof p.missionId === "string" && p.missionId.length > 0 ? p.missionId : e.id;
  } catch { return null; }
}

const beforeEntries = lines(QUEUE).map(entryMission); // null = malformada (fica)

// ---- ciclo PLAN real (read-only) ----
const { runOrchestrateConsume } = await import("./src/orchestrate.ts");
const plan = await runOrchestrateConsume({ dryRun: true });
if (!plan) throw new Error("runOrchestrateConsume(plan) retornou null");

// ---- compactação REAL (o passo da missão) ----
const { runOrchestrateQueueCompaction } = await import("./src/orchestrateCompaction.ts");
const comp = runOrchestrateQueueCompaction({});
if (!comp) throw new Error("runOrchestrateQueueCompaction retornou null");

// ---- snapshot DEPOIS ----
const afterRaw = readRaw(QUEUE) ?? "";
const afterLines = lines(QUEUE).length;
const afterSha16 = sha16(afterRaw);
const afterArchiveLines = lines(ARCHIVE).length;

// ---- provas ----
const kept = lines(QUEUE);
const keptMissions = kept.map(entryMission);
const archiveNew = lines(ARCHIVE).slice(beforeArchiveLines);
const archiveNewParsed = archiveNew.map((l) => JSON.parse(l));
const copiesSum = archiveNewParsed.reduce((a, e) => a + (e.archivedCopies ?? 1), 0);

// invariante 1: trilha — fila_depois + cópias_arquivadas == fila_antes
const inv1 = afterLines + copiesSum === beforeLines;
// invariante 2: Σ archivedCopies == moved
const inv2 = copiesSum === (comp.moved ?? -1);
// invariante 3: linhas de archive deste ciclo == archivedLines declarado
const inv3 = archiveNew.length === (comp.archivedLines ?? -1);
// invariante 4: TODAS as missões arquivadas têm ledger closed/cancelled
const archivedStatuses = [...new Set(archiveNewParsed.map((e) => {
  const p = e.payload ?? {};
  const m = typeof p.missionId === "string" && p.missionId.length > 0 ? p.missionId : e.id;
  return `${m}=${ledgerStatus(m)}`;
}))];
const inv4 = archivedStatuses.every((s) => {
  const st = s.split("=")[1];
  return st === "closed" || st === "cancelled";
});
// invariante 5: NENHUMA missão pendente/não-fechada saiu (kept ⊆ antes, e kept não tem fechada)
const beforeSet = new Set(beforeEntries);
const inv5 = keptMissions.every((m) => beforeSet.has(m)) && keptMissions.every((m) => {
  const st = ledgerStatus(m);
  return st !== "closed" && st !== "cancelled";
});
// invariante 6: estado do consumidor ganhou lastCompactionAt
let lastCompactionAt = null;
try { lastCompactionAt = JSON.parse(readRaw(STATE) ?? "{}").lastCompactionAt ?? null; } catch { /* fail-open */ }
const inv6 = typeof lastCompactionAt === "string" && lastCompactionAt.length > 0;

// ---- resultado ----
const verdict = [inv1, inv2, inv3, inv4, inv5, inv6].every(Boolean) && comp.ok === true;
const proof = {
  mission: "ORCH-QUEUE-COMPACT-01",
  ts: new Date().toISOString(),
  plan: { mode: plan.mode, promoted: plan.promoted, consumed: plan.consumed, skipped: plan.skipped, compacted: plan.compacted },
  compaction: {
    ok: comp.ok, dryRun: comp.dryRun, moved: comp.moved, archivedLines: comp.archivedLines,
    archivedIntents: comp.archivedIntents, promotedCopies: comp.promotedCopies, skipped: comp.skipped,
    rotated: comp.rotated, error: comp.error ?? null, stateError: comp.stateError ?? null,
  },
  before: { queueLines: beforeLines, queueSha16: beforeSha, archiveLines: beforeArchiveLines, promotedIdsCount: promotedIds.length },
  after: { queueLines: afterLines, queueSha16: afterSha16, archiveLines: afterArchiveLines },
  invariants: { inv1_trilha: inv1, inv2_copiesSum_eq_moved: inv2, inv3_archiveLines_eq_declared: inv3, inv4_soloFechadas: inv4, inv5_pendentesFicam: inv5, inv6_lastCompactionAt: inv6 },
  archivedStatuses,
  verdict: verdict ? "PASS" : "FAIL",
};
writeFileSync(PROOF, JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify(proof, null, 2));