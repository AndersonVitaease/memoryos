// ORCH-QUEUE-COMPACT-01: compactação/arquivamento da fila do orquestrador —
// trilha preservada, arquivo enxuto. A fila `orchestrator-queue.jsonl` é append-only
// (intents nunca removidas; dedupe por promotedIds no estado do consumidor) e, com
// requeues, cresce sem limite. Este módulo move, no FIM do ciclo do consume, as
// linhas cuja missão tem ledger closed/cancelled para `orchestrator-queue.archive.jsonl`
// (mesmo dir, append, linha original intacta).
//
// Critério de elegibilidade (decisão técnica ORCH-QUEUE-COMPACT-01, juiz 0.95 —
// engineering.judge.evaluate gen-dec-1791066932): missão com ledger status ∈
// {closed, cancelled}. O contrato literal pedia "id ∈ promotedIds E ledger closed",
// mas com dados reais (82 linhas, 24 ids, 9 promotedIds) o AND deixaria para sempre
// na fila linhas de missões fechadas nunca promovidas — e o invariante do E2E do
// MESMO contrato ("depois = pendentes + não-fechadas") não se realizaria. O consume
// NUNCA re-despacha missão fechada (regra 1b, ORCH-CLOSED-NOOP-01), então mover
// essas linhas não perde função. promotedIds continua sendo lido e registrado como
// sinal no resultado (promotedCopies). Ledger ausente/desconhecido → linha FICA
// (fail-closed, teste (b)).
//
// Invariantes (todos verificados ANTES da primeira escrita; violação = fail-closed):
//  - Trilha: nada é apagado sem destino — toda linha movida existe no archive;
//    prova: contagem (afterQueue + moved == beforeQueue) e cobertura
//    (Σ archivedCopies das linhas novas == moved). Violação pós-escrita = rollback
//    da fila para o conteúdo original + ok:false honesto.
//  - Dedup: múltiplas cópias da mesma intent (mesmo id — requeues mantêm o id)
//    viram 1 linha no archive (a mais recente) + campo `archivedCopies: N`; a linha
//    ORIGINAL na fila NÃO é alterada.
//  - Limites: no máx 200 linhas movidas por ciclo; archive rotaciona a 5MB
//    (archive.jsonl → archive.jsonl.1, geração única).
//
// Ordem de escrita (crash-safe no sentido da trilha): archive PRIMEIRO (um único
// append), fila DEPOIS. Se o processo morrer entre os dois, as linhas continuam na
// fila (fail direction seguro: nada é apagado sem destino) e o ciclo seguinte
// re-arquiva — o dedup seguinte é por id, então vira nova linha de archive com as
// cópias remanescentes, nunca perda de trilha.
//
// Zero-LLM, síncrono, determinístico. Todo I/O é injetável (padrão HERMÉTICO-FIX-01):
// testes rodam com fs em memória; produção usa o fs real.
import { appendFileSync, existsSync as fsExistsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";

/** Rotação do archive (archive.jsonl → archive.jsonl.1) em 5MB. */
export const QUEUE_ARCHIVE_ROTATE_BYTES = 5_000_000;
/** Teto de segurança: linhas movidas por ciclo. */
export const QUEUE_ARCHIVE_MAX_LINES_PER_CYCLE = 200;

// Defaults de produção (mesmos paths de DEFAULT_PATHS em orchestrate.ts — duplicados
// aqui de propósito: importar de orchestrate.ts criaria dependência circular).
const DEFAULT_QUEUE_PATH = "/opt/mission-events/orchestrator-queue.jsonl";
const DEFAULT_ARCHIVE_PATH = "/opt/mission-events/orchestrator-queue.archive.jsonl";
const DEFAULT_CONSUMER_STATE_PATH = "/opt/mission-events/orchestrator-consumer.state.json";
const DEFAULT_MISSION_STATE_DIR = "/root/.hermes/mission-state";

/** Ledger statuses que permitem arquivamento (fechamento PROVADO; interrupted é transiente). */
const ARCHIVABLE_LEDGER_STATUSES = new Set(["closed", "cancelled"]);

export interface QueueCompactionDeps {
  queuePath?: string;
  archivePath?: string;
  consumerStatePath?: string;
  missionStateDir?: string;
  /** Lê arquivo UTF-8; null quando inexistente/ilegível (fail-open). */
  readText?(path: string): string | null;
  /** Reescreve arquivo inteiro (fila + estado do consumidor). */
  writeText?(path: string, data: string): void;
  /** Append atômico lógico (uma chamada = um bloco inteiro). */
  appendFile?(path: string, data: string): void;
  existsSync?(path: string): boolean;
  rename?(from: string, to: string): void;
  /** Tamanho do arquivo em bytes; null quando inexistente (para rotação). */
  statSize?(path: string): number | null;
  now?(): number;
  maxLines?: number;
  rotateBytes?: number;
}

export interface QueueCompactionResult {
  ok: boolean;
  /** true = apenas projeção (nada escrito). */
  dryRun: boolean;
  /** Linhas físicas da fila antes (não-vazias). */
  beforeQueueLines: number;
  /** Linhas físicas da fila depois. */
  afterQueueLines: number;
  /** Cópias físicas movidas (cap 200/ciclo). */
  moved: number;
  /** Linhas físicas gravadas no archive (pós-dedup). */
  archivedLines: number;
  /** Intents únicas arquivadas neste ciclo. */
  archivedIntents: number;
  /** Sinal registrado: cópias movidas cujo id ∈ promotedIds do estado do consumidor. */
  promotedCopies: number;
  /** Linhas não elegíveis (ledger ausente/desconhecido, missão viva) ou acima do cap. */
  skipped: number;
  rotated: boolean;
  /** Fail-closed: violação de invariante ou erro de I/O (nada movido, ou rollback aplicado). */
  error?: string;
  /** Fail-open: estado do consumidor não atualizado (trilha preservada). */
  stateError?: string;
}

interface QueueEntryLike {
  id: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function resolveDeps(deps?: QueueCompactionDeps): Required<Pick<QueueCompactionDeps, "queuePath" | "archivePath" | "consumerStatePath" | "missionStateDir" | "readText" | "writeText" | "appendFile" | "existsSync" | "rename" | "statSize" | "now" | "maxLines" | "rotateBytes">> {
  return {
    queuePath: deps?.queuePath ?? DEFAULT_QUEUE_PATH,
    archivePath: deps?.archivePath ?? DEFAULT_ARCHIVE_PATH,
    consumerStatePath: deps?.consumerStatePath ?? DEFAULT_CONSUMER_STATE_PATH,
    missionStateDir: deps?.missionStateDir ?? DEFAULT_MISSION_STATE_DIR,
    readText: deps?.readText ?? ((p: string) => { try { return readFileSync(p, "utf8"); } catch { return null; } }),
    writeText: deps?.writeText ?? ((p: string, data: string) => { writeFileSync(p, data, "utf8"); }),
    appendFile: deps?.appendFile ?? ((p: string, data: string) => { appendFileSync(p, data, "utf8"); }),
    existsSync: deps?.existsSync ?? fsExistsSync,
    rename: deps?.rename ?? ((from: string, to: string) => { renameSync(from, to); }),
    statSize: deps?.statSize ?? ((p: string) => { try { return statSync(p).size; } catch { return null; } }),
    now: deps?.now ?? Date.now,
    maxLines: deps?.maxLines ?? QUEUE_ARCHIVE_MAX_LINES_PER_CYCLE,
    rotateBytes: deps?.rotateBytes ?? QUEUE_ARCHIVE_ROTATE_BYTES,
  };
}

/**
 * Lê o ledger da missão e retorna o status se for arquivável (closed/cancelled).
 * Ledger ausente/ilegível/status desconhecido → null (fail-closed: linha fica).
 */
function archivableLedgerStatus(d: ReturnType<typeof resolveDeps>, missionId: string, cache: Map<string, string | null>): string | null {
  const cached = cache.get(missionId);
  if (cached !== undefined) return cached;
  let status: string | null = null;
  try {
    const ledgerPath = `${d.missionStateDir}/${missionId}.json`;
    const raw = d.readText(ledgerPath);
    if (raw != null) {
      const ledger = JSON.parse(raw) as { status?: unknown };
      if (typeof ledger.status === "string" && ARCHIVABLE_LEDGER_STATUSES.has(ledger.status)) {
        status = ledger.status;
      }
    }
  } catch { /* fail-closed: sem prova de fechamento → linha fica */ }
  cache.set(missionId, status);
  return status;
}

/**
 * Compacta a fila do orquestrador: move linhas de missões fechadas para o archive.
 * Veja o cabeçalho do arquivo para invariantes, limites e ordem de escrita.
 * dryRun=true projeta o que faria (zero escrita).
 */
export function runOrchestrateQueueCompaction(
  input: { dryRun?: boolean } = {},
  deps?: QueueCompactionDeps,
): QueueCompactionResult {
  const d = resolveDeps(deps);
  const dryRun = input.dryRun === true;
  const base: QueueCompactionResult = {
    ok: false, dryRun, beforeQueueLines: 0, afterQueueLines: 0, moved: 0,
    archivedLines: 0, archivedIntents: 0, promotedCopies: 0, skipped: 0, rotated: false,
  };

  try {
    const raw = d.readText(d.queuePath);
    if (raw == null || raw.trim().length === 0) {
      return { ...base, ok: true, beforeQueueLines: 0, afterQueueLines: 0 };
    }
    // Linhas físicas verbatim (preserva formatação original; linhas em branco ficam).
    const endsWithNewline = raw.endsWith("\n");
    const physical = raw.split("\n");
    if (endsWithNewline) physical.pop();

    // Parse por linha: entry válido → candidato; linha inválida → fica verbatim (skip).
    const lines: Array<{ pos: number; rawLine: string; entry: QueueEntryLike | null }> = physical.map((rawLine, pos) => {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) return { pos, rawLine, entry: null };
      try {
        const parsed = JSON.parse(trimmed) as QueueEntryLike;
        if (parsed && typeof parsed.id === "string") return { pos, rawLine, entry: parsed };
      } catch { /* linha malformada: nunca é movida */ }
      return { pos, rawLine, entry: null };
    });
    const beforeQueueLines = physical.filter((l) => l.trim().length > 0).length;

    // promotedIds: sinal registrado (fonte: estado do consumidor). Ilegível → vazio (fail-open).
    let promotedIds = new Set<string>();
    try {
      const stateRaw = d.readText(d.consumerStatePath);
      if (stateRaw != null) {
        const state = JSON.parse(stateRaw) as { promotedIds?: unknown };
        if (Array.isArray(state.promotedIds)) {
          promotedIds = new Set(state.promotedIds.filter((v): v is string => typeof v === "string"));
        }
      }
    } catch { /* sinal indisponível — elegibilidade continua sendo pelo ledger */ }

    // Elegibilidade por linha (ledger fechado), com cache por missão (1 leitura por missão).
    const ledgerCache = new Map<string, string | null>();
    const eligibleIdx: number[] = [];
    let skipped = 0;
    let capped = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.entry == null) { skipped += 1; continue; }
      const payload = l.entry.payload ?? {};
      const missionId = typeof payload.missionId === "string" && payload.missionId.length > 0
        ? payload.missionId
        : l.entry.id;
      const ledgerStatus = archivableLedgerStatus(d, missionId, ledgerCache);
      if (ledgerStatus == null) { skipped += 1; continue; }
      if (eligibleIdx.length >= d.maxLines) { capped += 1; continue; }
      eligibleIdx.push(l.pos);
    }
    skipped += capped;
    const eligiblePos = new Set(eligibleIdx);

    if (eligibleIdx.length === 0) {
      return { ...base, ok: true, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped, moved: 0 };
    }

    // Dedup no archive: mesma intent (mesmo id) → 1 linha (a mais recente = última
    // ocorrência na fila; append-only) + archivedCopies: N. A linha original NÃO é alterada.
    const groups = new Map<string, number[]>(); // pos → grupo por id
    for (const pos of eligiblePos) {
      const id = lines[pos].entry!.id;
      const g = groups.get(id);
      if (g) g.push(pos); else groups.set(id, [pos]);
    }
    const archiveLines: string[] = [];
    let moved = 0;
    let promotedCopies = 0;
    let representedCopies = 0;
    for (const [id, positions] of groups) {
      const lastPos = positions[positions.length - 1]; // a mais recente
      const entry = lines[lastPos].entry!;
      const archived = { ...entry, archivedCopies: positions.length };
      archiveLines.push(JSON.stringify(archived));
      moved += positions.length;
      representedCopies += positions.length;
      if (promotedIds.has(id)) promotedCopies += positions.length;
    }

    // Invariante da trilha (ANTES de qualquer escrita): fila encolhe exatamente `moved`
    // e o archive cobre todas as cópias movidas.
    const afterQueueLines = beforeQueueLines - moved;
    if (moved > d.maxLines || moved !== representedCopies || afterQueueLines < 0) {
      return { ...base, ok: false, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped,
        error: `ORCH_COMPACT_INVARIANT: moved=${moved} represented=${representedCopies} after=${afterQueueLines} before=${beforeQueueLines} (nada escrito)` };
    }

    if (dryRun) {
      return { ...base, ok: true, beforeQueueLines, afterQueueLines, moved,
        archivedLines: archiveLines.length, archivedIntents: groups.size, promotedCopies, skipped };
    }

    // Rotação do archive (5MB → .1, geração única). Falha de rename = fail-closed.
    let rotated = false;
    const archiveSize = d.statSize(d.archivePath);
    if (archiveSize != null && archiveSize >= d.rotateBytes) {
      try {
        d.rename(d.archivePath, `${d.archivePath}.1`);
        rotated = true;
      } catch (err) {
        return { ...base, ok: false, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped,
          error: `ORCH_COMPACT_ROTATE_FAILED: ${err instanceof Error ? err.message : String(err)} (nada movido)` };
      }
    }

    // (1) archive PRIMEIRO — um único append com o bloco inteiro (janela de crash mínima).
    const block = archiveLines.map((l) => l + "\n").join("");
    try {
      d.appendFile(d.archivePath, block);
    } catch (err) {
      return { ...base, ok: false, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped,
        error: `ORCH_COMPACT_ARCHIVE_WRITE_FAILED: ${err instanceof Error ? err.message : String(err)} (fila intacta)` };
    }

    // (2) fila DEPOIS — reescreve sem as linhas movidas (verbatim, ordem preservada).
    const keptLines = lines.filter((l) => !eligiblePos.has(l.pos)).map((l) => l.rawLine);
    const newRaw = keptLines.join("\n") + (endsWithNewline && keptLines.length > 0 ? "\n" : "");
    const originalRaw = raw;
    try {
      d.writeText(d.queuePath, newRaw);
    } catch (err) {
      // Fail-closed: archive ganhou cópias, fila intacta — próximo ciclo re-arquiva (dedup por id).
      return { ...base, ok: false, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped, rotated,
        error: `ORCH_COMPACT_QUEUE_WRITE_FAILED: ${err instanceof Error ? err.message : String(err)} (archive tem cópias; fila intacta — próximo ciclo re-arquiva)` };
    }

    // (3) verificação pós-escrita: fila encolheu exatamente `moved` e o archive tem as linhas.
    const queueAfter = d.readText(d.queuePath);
    const archiveAfter = d.readText(d.archivePath);
    const queueAfterCount = queueAfter == null ? -1 : queueAfter.split("\n").filter((l) => l.trim().length > 0).length;
    const archiveHasBlock = archiveAfter != null && archiveLines.every((l) => archiveAfter.includes(l));
    if (queueAfterCount !== afterQueueLines || !archiveHasBlock) {
      // Rollback da fila para o conteúdo original (trilha: linhas voltam à fila; archive
      // pode ter cópias a mais — reportado honestamente; próximo ciclo re-arquiva por dedup).
      try { d.writeText(d.queuePath, originalRaw); } catch { /* rollback falhou — reportado */ }
      return { ...base, ok: false, beforeQueueLines, afterQueueLines: beforeQueueLines, skipped, rotated,
        error: `ORCH_COMPACT_POSTCHECK_FAILED: queueAfter=${queueAfterCount} esperado=${afterQueueLines} archiveHasBlock=${archiveHasBlock} (fila restaurada ao original)` };
    }

    // (4) estado do consumidor: lastCompactionAt (fail-open — trilha já preservada).
    let stateError: string | undefined;
    try {
      const stateRaw = d.readText(d.consumerStatePath) ?? "{}";
      const state = JSON.parse(stateRaw) as Record<string, unknown>;
      state.lastCompactionAt = new Date(d.now()).toISOString();
      d.writeText(d.consumerStatePath, JSON.stringify(state, null, 2));
    } catch (err) {
      stateError = err instanceof Error ? err.message : String(err);
    }

    return { ...base, ok: true, beforeQueueLines, afterQueueLines, moved, archivedLines: archiveLines.length,
      archivedIntents: groups.size, promotedCopies, skipped, rotated, stateError };
  } catch (err) {
    return { ...base, ok: false, beforeQueueLines: 0, afterQueueLines: 0,
      error: `ORCH_COMPACT_FAILED: ${err instanceof Error ? err.message : String(err)} (nada movido)` };
  }
}