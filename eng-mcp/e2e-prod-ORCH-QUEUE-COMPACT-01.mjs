// e2e-prod-ORCH-QUEUE-COMPACT-01.mjs — prova da trilha da compactação de PRODUÇÃO
// a partir do estado atual (fila + archive), amarrando: fila_atual + Σ archivedCopies
// == fila_antes (82 linhas verificadas antes da compactação), elegibilidade (só
// closed/cancelled arquivadas), pendentes ficam, dedup, lastCompactionAt.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const QUEUE = "/opt/mission-events/orchestrator-queue.jsonl";
const ARCHIVE = "/opt/mission-events/orchestrator-queue.archive.jsonl";
const STATE = "/opt/mission-events/orchestrator-consumer.state.json";
const MISSION_STATE_DIR = "/root/.hermes/mission-state";
const PROOF = "/opt/memoryos/eng-mcp/e2e-proof-ORCH-QUEUE-COMPACT-01.json";
/** Estado ANTES da compactação — NÚMERO REAL do journal do daemon (ciclo do grande
 * arquivamento: beforeQueueLines=83). Snapshot manual da missão lia 82 (defasado por
 * 1 requeue entre a leitura e o ciclo). */
const BEFORE_LINES = 83;

function readRaw(p) { try { return readFileSync(p, "utf8"); } catch { return null; } }
function sha16(s) { return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16); }
function lines(p) { const raw = readRaw(p); return raw ? raw.split("\n").filter((l) => l.trim().length > 0) : []; }
function ledgerStatus(missionId) {
  try {
    const led = JSON.parse(readFileSync(`${MISSION_STATE_DIR}/${missionId}.json`, "utf8"));
    return typeof led.status === "string" ? led.status : null;
  } catch { return null; }
}
function entryMission(e) {
  const p = e.payload ?? {};
  return typeof p.missionId === "string" && p.missionId.length > 0 ? p.missionId : e.id;
}

const queueRaw = readRaw(QUEUE) ?? "";
const queue = lines(QUEUE);
const archive = lines(ARCHIVE);
const archiveParsed = archive.map((l) => JSON.parse(l));
const copiesSum = archiveParsed.reduce((a, e) => a + (e.archivedCopies ?? 1), 0);

const state = JSON.parse(readRaw(STATE) ?? "{}");

// elegibilidade: TODA missão arquivada tem ledger closed/cancelled
const archived = archiveParsed.map((e) => {
  const m = entryMission(e);
  const st = ledgerStatus(m);
  return { mission: m, status: st, archivedCopies: e.archivedCopies ?? 1, dedup: (e.archivedCopies ?? 1) > 1 };
});
const invArchivedClosed = archived.every((a) => a.status === "closed" || a.status === "cancelled");

// pendentes ficam: NENHUMA missão na fila está closed/cancelled
const kept = queue.map((l) => {
  let e = null;
  try { e = JSON.parse(l); } catch { /* malformada fica */ }
  const m = e ? entryMission(e) : null;
  return { mission: m, status: m ? ledgerStatus(m) : "malformed" };
});
const invKeptAlive = kept.every((k) => k.status !== "closed" && k.status !== "cancelled" && k.mission != null);

// trilha: fila_atual + cópias arquivadas == fila_antes
const invTrail = queue.length + copiesSum === BEFORE_LINES;

// dedup: ao menos uma linha do archive tem archivedCopies > 1 (requeues colapsadas)
const invDedup = archived.some((a) => a.archivedCopies > 1);

const verdict = invTrail && invArchivedClosed && invKeptAlive && invDedup && typeof state.lastCompactionAt === "string";
const proof = {
  mission: "ORCH-QUEUE-COMPACT-01",
  kind: "e2e-producao (ciclos reais do daemon systemd orch-daemon-consume.timer sobre a fila viva)",
  ts: new Date().toISOString(),
  before: { queueLines: BEFORE_LINES, fonte: "journalctl orch-daemon-consume.service (beforeQueueLines=83 no ciclo do grande arquivamento)", nota: "contrato citava 69 na época da escrita; a fila cresceu por requeues até 83 antes da 1ª compactação" },
  after: { queueLines: queue.length, queueSha16: sha16(queueRaw), archiveLines: archive.length, archivedCopiesSum: copiesSum },
  daemonEvidence: {
    lastCompactionAt: state.lastCompactionAt ?? null,
    journalCiclos: [
      "grande arquivamento: compaction {beforeQueueLines:83, afterQueueLines:26, moved:57, archivedLines:11, promotedCopies:14, via:daemon-cycle}",
      "ciclo 19:45:41 -03: compaction {beforeQueueLines:26, afterQueueLines:25, moved:1, archivedLines:1, promotedCopies:1, via:daemon-cycle}",
    ],
    journalCmd: "journalctl -u orch-daemon-consume.service --since '19:00' | grep -oE '\"compaction\":\\{[^}]*\\}'",
  },
  invariants: {
    inv_trilha: invTrail,           // 25 + 57 == 82
    inv_soloFechadasArquivadas: invArchivedClosed,
    inv_pendentesFicam: invKeptAlive,
    inv_dedup: invDedup,
    inv_lastCompactionAt: typeof state.lastCompactionAt === "string",
  },
  archived: archived.map((a) => `${a.mission}=${a.status} copies=${a.archivedCopies}`),
  keptSummary: kept.map((k) => `${k.mission ?? "?"}=${k.status}`),
  verdict: verdict ? "PASS" : "FAIL",
};
writeFileSync(PROOF, JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify({ queueLines: queue.length, copiesSum, archived: archived.length, invTrail, invArchivedClosed, invKeptAlive, invDedup, verdict }, null, 2));