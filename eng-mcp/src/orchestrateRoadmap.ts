// RD-ORCH-FILA-01: ROADMAP.md como fonte secundária de fila do orquestrador
// (roadmap→fila determinística, ZERO-LLM).
//
// A cada ciclo do consume, o scan varre a seção "## 1. Itens pendentes" do
// ROADMAP.md e promove linhas com `Fila: sim` + `Estado: pendente` +
// dependências satisfeitas, respeitando prioridade e a MESMA fila/guards do
// consume (dedupe por ledger, promptFile, class=pesada, serialização por
// componente, plan GO). Regras de fronteira:
//   - `Fila: gate-operator` entra APENAS por intent explícita do operator —
//     o scan NUNCA gera intent para ela (prova negativa).
//   - `aguarda-operator` é estado legítimo — nunca tratado como bug, nunca
//     promove (o gate de estado domina).
//   - RD-* com ledger closed/cancelled/dispatched NUNCA re-despacha
//     (idempotência; ledger presente de qualquer tipo → skip tipado).
//   - Kill switch: ROADMAP_QUEUE=off desliga o scan inteiro (tipado).
//   - Fail-open TOTAL: qualquer falha do scan (ROADMAP ausente/ilegível, erro
//     de write do contrato) nunca derruba o ciclo — evento tipado no spool.
//
// Contrato da missão (deliverable 3): linha RD-* COM contrato existente
// (missao-<id>.md no cwd do orquestrador) usa o contrato direto; linha SEM
// contrato recebe contrato gerado por TEMPLATE determinístico a partir do
// escopo citado na linha (fonte obrigatória) — nunca conteúdo inventado. O
// intent sai sempre com spawnedBy: roadmap-fila (pai da cadeia auditável via
// chainBasis=payload do ORCH-CHAIN-CWD-01).
//
// Telemetria (deliverable 5): cada decisão do scan vai tipada ao spool com
// origem, linha do ROADMAP e resultado do dedupe (execute apenas; PLAN é
// read-only e não spoola).
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { OrchestrateDeps, QueueEntry } from "./orchestrate.ts";

export interface RoadmapRow {
  id: string;
  fonte: string;
  escopo: string;
  prio: number | null;
  estado: string;
  fila: string | null; // "sim" | "nao" | "gate-operator" | null (coluna ausente/inválida)
  dependsOn: string[];
  lineNo: number; // linha 1-based no ROADMAP.md (telemetria "linha")
}

export interface RoadmapDecision {
  id: string;
  lineNo: number;
  fila: string | null;
  estado: string;
  decision: "enqueued" | "would_enqueue" | "skipped";
  reason: string; // tipado, nunca vazio
  contractPath?: string;
  contractGenerated?: boolean;
  priority?: number;
  /** RD-ORCH-FILA-01: intent construída (execute, decision=enqueued) — injetada na fila do ciclo. */
  entry?: QueueEntry;
}

export interface RoadmapScanResult {
  /** false quando kill switch ROADMAP_QUEUE=off (nada é lido nem enfileirado). */
  enabled: boolean;
  killSwitch: boolean;
  /** false = ROADMAP ausente/ilegível (fail-open: skip honesto, ciclo segue). */
  roadmapRead: boolean;
  rows: number; // linhas RD-* parseadas na seção 1
  enqueued: number; // execute: intents efetivamente enfileiradas neste ciclo
  eligible: number; // fila:sim + pendente + deps ok (antes do dedupe de fila/ledger)
  decisions: RoadmapDecision[];
  error?: string; // fail-open tipado
}

/** Catálogo determinístico componente→worktree (dado, não regra de conteúdo):
 * usado no payload do intent gerado e no template. Componente ausente no
 * catálogo → sem worktree (dispatch usa o default documentado). */
export const ROADMAP_COMPONENT_WORKTREES: Readonly<Record<string, string | undefined>> = {
  "eng-mcp": "/opt/memoryos/eng-mcp",
  "mission-ops": "/opt/mission-events",
  gateway: "/opt/mission-events",
  "fast-router": "/opt/mission-events",
};

/** Dicas determinísticas de componente por token do texto da linha (regex —
 * parser + regra determinística; sem julgamento de conteúdo). */
const COMPONENT_HINTS: ReadonlyArray<{ re: RegExp; component: string }> = [
  { re: /mission[-_ ]ops|mission[-_]close|mission[-_]core|supervisor[-_]guard/i, component: "mission-ops" },
  { re: /eng-mcp|engineering\.|orchestrate/i, component: "eng-mcp" },
  { re: /fast-router/i, component: "fast-router" },
  { re: /\bgateway\b/i, component: "gateway" },
];

function normalizeHeader(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Parse determinístico das linhas RD-* da seção "## 1. Itens pendentes".
 * Colunas mapeadas pelo cabeçalho da tabela (não por índice fixo): ID, Fonte,
 * Escopo, Dependências, Prio, Fila, DependsOn, Estado. Seção/cabeçalho sem a
 * coluna Fila → rows parseadas com fila=null (feature inerte até o schema). */
export function parseRoadmapRows(text: string | null): RoadmapRow[] {
  if (text == null) return [];
  const lines = text.split("\n");
  let inSection = false;
  let col: Record<string, number> | null = null;
  const rows: RoadmapRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      inSection = normalizeHeader(line).startsWith("## 1. itens pendentes");
      col = null;
      continue;
    }
    if (!inSection || !line.trimStart().startsWith("|")) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.every((c) => c.replace(/[-: ]/g, "") === "")) continue; // separador
    if (col == null) {
      // cabeçalho da tabela
      col = {};
      cells.forEach((c, idx) => {
        const n = normalizeHeader(c);
        if (n.startsWith("id")) col!["id"] = idx;
        else if (n.startsWith("fonte")) col!["fonte"] = idx;
        else if (n.startsWith("escopo")) col!["escopo"] = idx;
        else if (n.startsWith("dependencia")) col!["depsProse"] = idx;
        else if (n.startsWith("prio")) col!["prio"] = idx;
        else if (n === "fila") col!["fila"] = idx;
        else if (n.startsWith("dependson")) col!["dependsOn"] = idx;
        else if (n.startsWith("estado")) col!["estado"] = idx;
      });
      if (col["id"] == null || col["estado"] == null) col = null; // tabela não reconhecida
      continue;
    }
    const idCell = col["id"] != null ? (cells[col["id"]] ?? "") : "";
    if (!/^RD-[A-Za-z0-9-]+$/.test(idCell)) continue;
    const prioRaw = col["prio"] != null ? (cells[col["prio"]] ?? "") : "";
    const prio = /^\d+$/.test(prioRaw) ? parseInt(prioRaw, 10) : null;
    const depRaw = col["dependsOn"] != null ? (cells[col["dependsOn"]] ?? "") : "";
    rows.push({
      id: idCell,
      fonte: col["fonte"] != null ? (cells[col["fonte"]] ?? "") : "",
      escopo: col["escopo"] != null ? (cells[col["escopo"]] ?? "") : "",
      prio,
      estado: col["estado"] != null ? (cells[col["estado"]] ?? "") : "",
      fila: col["fila"] != null ? normalizeFila(cells[col["fila"]] ?? "") : null,
      dependsOn: depRaw.split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^RD-[A-Za-z0-9-]+$/.test(s)),
      lineNo: i + 1,
    });
  }
  return rows;
}

function normalizeFila(v: string): string | null {
  const n = v.trim().toLowerCase();
  if (n === "sim") return "sim";
  if (n === "nao" || n === "não") return "nao";
  if (n === "gate-operator") return "gate-operator";
  return null;
}

export function roadmapContractPath(contractDir: string, id: string): string {
  return `${contractDir.replace(/\/+$/, "")}/missao-${id.toLowerCase()}.md`;
}

/** Lê o status do ledger da missão (null = ledger ausente/ilegível). */
export function readLedgerStatus(d: OrchestrateDeps, missionId: string): string | null {
  try {
    const p = `${d.missionStateDir!}/${missionId}.json`;
    const raw = d.readText ? d.readText(p) : null;
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { status?: unknown };
    return typeof parsed.status === "string" ? parsed.status : null;
  } catch {
    return null;
  }
}

/** Extrai o componente declarado no contrato existente (**Componente:** X · ...).
 * null → contrato sem componente declarado. */
export function contractComponent(text: string | null): string | null {
  if (text == null) return null;
  const m = text.match(/^\*\*Componente:\*\*\s*([^\n·]+)/m);
  if (!m) return null;
  // "mission-ops (supervisor_guard)" → "mission-ops" (segmento sem parênteses)
  const seg = m[1].replace(/\([^)]*\)/g, " ").trim();
  return seg.length > 0 ? seg : null;
}

function inferComponent(row: RoadmapRow): string | null {
  const text = `${row.escopo} ${row.fonte}`;
  for (const h of COMPONENT_HINTS) if (h.re.test(text)) return h.component;
  return null;
}

function worktreeFor(component: string | null): string | undefined {
  if (!component) return undefined;
  const base = component.trim().toLowerCase();
  return ROADMAP_COMPONENT_WORKTREES[base];
}

/** TEMPLATE determinístico do contrato (zero-LLM): envelope com o escopo citado
 * na linha (fonte obrigatória) — nunca conteúdo inventado. */
export function roadmapContractMarkdown(row: RoadmapRow, component: string | null): string {
  const deps = row.dependsOn.length > 0 ? row.dependsOn.join(", ") : "nenhuma (ver coluna Dependências da linha para deps de ambiente)";
  return [
    `# MISSÃO ${row.id} — ${row.escopo.slice(0, 90)}`,
    "",
    `**Componente:** ${component ?? "não-classificado (linha RD-* sem token de componente determinístico)"} · **Prioridade:** ${row.prio ?? 5} · **Fonte:** ${row.fonte.slice(0, 200)} · **Autoria:** gerado por template determinístico do consumer roadmap (RD-ORCH-FILA-01), a partir da linha ${row.id} do ROADMAP.md (spawnedBy: roadmap-fila)`,
    "",
    "## Problema (fonte: ROADMAP.md — linha citada abaixo é a fonte OBRIGATÓRIA do escopo)",
    row.escopo,
    "",
    "## Entrega (não-quebrante)",
    "1. Executar o escopo citado acima conforme a linha do ROADMAP.md (releia /opt/mission-events/ROADMAP.md — a linha é a fonte da verdade do escopo).",
    "2. Se o escopo da linha for insuficiente para execução segura, feche com FAIL honesto citando `escopo-insuficiente` — NUNCA invente escopo.",
    "",
    "## Provas",
    "- Provas reais executadas ANTES de gravar; manifesto tipado verify-<missionId>.json no cwd + verify.py pass (verdict real).",
    "- Suíte(s) do componente íntegra(s) + RELATORIO-<missionId>.md em pt-BR íntegra + entrega no herdr terminando com `PASS` ou `FAIL`.",
    "",
    "## Restrições",
    `- Intent gerada pelo consumer roadmap (spawnedBy: roadmap-fila; origem auditada em /data/audit/orchestrate-consume.jsonl).`,
    `- Dependências declaradas na linha: ${deps}. Dependência não resolvida no disco = não comece; reporte no relatório.`,
    "- `Fila: gate-operator` e `aguarda-operator` NUNCA são tratados como bug — consequência externa/credencial/ship sempre por ordem explícita do operator.",
    "",
  ].join("\n");
}

export interface RoadmapScanOpts {
  mode: "plan" | "execute";
  /** Fila já parseada do ciclo (dedupe de fila antes de re-enfileirar). */
  queueEntries: QueueEntry[];
  /** Telemetria tipada (execute apenas — caller já filtra o modo). */
  spool(kind: string, missionId: string, msg: string): void;
}

/**
 * Scan determinístico do ROADMAP.md como fonte secundária de fila. Execute
 * enfileira intents (mesma fila, mesmos guards — o consume as avalia no MESMO
 * ciclo); plan computa decisões sem escrever nada (read-only).
 */
export function scanRoadmapQueue(d: OrchestrateDeps, opts: RoadmapScanOpts): RoadmapScanResult {
  const result: RoadmapScanResult = { enabled: true, killSwitch: false, roadmapRead: false, rows: 0, enqueued: 0, eligible: 0, decisions: [] };

  // Kill switch (deliverable 5): ROADMAP_QUEUE=off desliga o scan inteiro.
  if ((process.env.ROADMAP_QUEUE ?? "").trim().toLowerCase() === "off") {
    result.killSwitch = true;
    result.enabled = false;
    result.decisions.push({ id: "(scan)", lineNo: 0, fila: null, estado: "", decision: "skipped", reason: "kill-switch: ROADMAP_QUEUE=off (scan desligado)" });
    return result;
  }

  let rows: RoadmapRow[];
  try {
    const raw = d.readText!(d.roadmapPath!);
    result.roadmapRead = raw != null;
    if (raw == null) {
      result.error = "roadmap-ausente (fail-open: nada enfileirado)";
      return result;
    }
    rows = parseRoadmapRows(raw);
  } catch (err) {
    result.error = `roadmap-ilegivel: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    return result;
  }
  result.rows = rows.length;
  if (rows.length === 0) return result;

  const byId = new Map(rows.map((r) => [r.id.toUpperCase(), r]));
  const ledgerStatusCache = new Map<string, string | null>();
  const ledgerStatus = (id: string): string | null => {
    if (!ledgerStatusCache.has(id)) ledgerStatusCache.set(id, readLedgerStatus(d, id));
    return ledgerStatusCache.get(id) ?? null;
  };

  // Ordena por prioridade (1 = mais alta) e linha — ordem determinística de promoção.
  const candidates = rows
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => (a.r.prio ?? 5) - (b.r.prio ?? 5) || a.idx - b.idx);

  for (const { r: row } of candidates) {
    const base = { id: row.id, lineNo: row.lineNo, fila: row.fila, estado: row.estado };

    // (1) fronteira gate-operator (deliverable 5): NUNCA gera intent sem ordem explícita.
    if (row.fila === "gate-operator") {
      result.decisions.push({ ...base, decision: "skipped", reason: "gate-operator: entra APENAS por intent explícita do operator (prova negativa)" });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=gate-operator`);
      continue;
    }
    if (row.fila !== "sim") {
      const reason = row.fila == null ? "fila:ausente (schema RD-ORCH-FILA-01 não aplicado à linha)" : "fila:nao";
      result.decisions.push({ ...base, decision: "skipped", reason });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=${reason}`);
      continue;
    }

    // (2) estado: só `pendente` promove; aguarda-operator/bloqueado/em execução/resolvido → skip tipado.
    if (!row.estado.trim().toLowerCase().startsWith("pendente")) {
      const est = row.estado.trim().toLowerCase();
      const reason = est.startsWith("aguarda-operator")
        ? "estado:aguarda-operator (estado legítimo — nunca bug, nunca promove)"
        : `estado:${row.estado.trim().slice(0, 60)} (só pendente promove)`;
      result.decisions.push({ ...base, decision: "skipped", reason });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=${reason.slice(0, 120)}`);
      continue;
    }

    // (3) dependências satisfeitas: DependsOn resolvido no roadmap OU ledger closed.
    const unsat = row.dependsOn.filter((dep) => {
      const depRow = byId.get(dep);
      if (depRow && depRow.estado.toLowerCase().includes("resolvido")) return false;
      return ledgerStatus(dep) !== "closed";
    });
    if (unsat.length > 0) {
      const reason = `dep-unsatisfied:${unsat.join(",")}`;
      result.decisions.push({ ...base, decision: "skipped", reason });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=${reason}`);
      continue;
    }

    result.eligible += 1;

    // (4) dedupe por ledger (deliverable 2): RD-* com ledger closed/cancelled/
    // dispatched (ou qualquer ledger presente) NUNCA re-despacha.
    const st = ledgerStatus(row.id);
    if (st != null) {
      const reason = ["closed", "cancelled", "interrupted"].includes(st)
        ? `ledger:${st} (nunca re-despacha)`
        : `ledger:${st} (missão em voo)`;
      result.decisions.push({ ...base, decision: "skipped", reason });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=ledger:${st}`);
      continue;
    }

    // (5) dedupe por fila: intent da mesma RD-* já enfileirada → skip (re-ciclo idempotente).
    const dup = opts.queueEntries.find((e) => e.type === "mission_dispatch" && (e.payload ?? {})["missionId"] === row.id);
    if (dup) {
      result.decisions.push({ ...base, decision: "skipped", reason: "queue-duplicate (intent já na fila)" });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=queue-duplicate`);
      continue;
    }

    // (6) contrato: existente reusado; ausente → template determinístico (execute apenas).
    const contractPath = roadmapContractPath(d.roadmapContractDir ?? "/opt/mission-events", row.id);
    let contractText: string | null = null;
    try {
      contractText = d.readText!(contractPath);
    } catch { contractText = null; }
    const contractExists = contractText != null || (d.existsSync ? d.existsSync(contractPath) : existsSync(contractPath));

    if (opts.mode === "plan") {
      result.decisions.push({
        ...base,
        decision: "would_enqueue",
        reason: contractExists ? "plan: enfileiraria com contrato existente" : "plan: enfileiraria com contrato gerado por template",
        contractPath,
        contractGenerated: !contractExists,
        priority: row.prio ?? 5,
      });
      continue;
    }

    if (!contractExists) {
      const component = inferComponent(row);
      try {
        const md = roadmapContractMarkdown(row, component);
        if (d.writeText) d.writeText(contractPath, md);
        else writeFileSync(contractPath, md, "utf8");
      } catch (err) {
        const reason = `contract-write-failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160);
        result.decisions.push({ ...base, decision: "skipped", reason, contractPath });
        opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=${reason}`);
        continue;
      }
    }

    // (7) enqueue: MESMA fila, mesmos guards. spawnedBy=roadmap-fila é o pai da
    // cadeia declarado no payload (chainBasis=payload lê EXCLUSIVAMENTE daqui).
    const component = contractComponent(contractText) ?? inferComponent(row);
    const payload: Record<string, unknown> = {
      componente: component ?? "roadmap",
      missionId: row.id,
      prompt: contractPath,
      spawnedBy: "roadmap-fila",
    };
    const wt = worktreeFor(component);
    if (wt) payload["worktree"] = wt;
    const priority = row.prio != null && row.prio >= 1 && row.prio <= 9 ? row.prio : 5;
    const entry: QueueEntry = {
      id: `roadmap-${row.id.toLowerCase()}`,
      type: "mission_dispatch",
      payload,
      priority,
      enqueuedAt: new Date(d.now!()).toISOString(),
    };
    try {
      const line = `${JSON.stringify(entry)}\n`;
      if (d.appendFile) d.appendFile(d.queuePath!, line);
      else {
        mkdirSync(d.queuePath!.replace(/\/[^/]+$/, ""), { recursive: true });
        appendFileSync(d.queuePath!, line, "utf8");
      }
    } catch (err) {
      const reason = `queue-write-failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160);
      result.decisions.push({ ...base, decision: "skipped", reason, contractPath, contractGenerated: !contractExists });
      opts.spool("orch_roadmap_skip", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=skip motivo=${reason}`);
      continue;
    }

    result.decisions.push({ ...base, decision: "enqueued", reason: "enfileirado (origem=roadmap-fila, dedupe=novo)", contractPath, contractGenerated: !contractExists, priority, entry });
    result.enqueued += 1;
    opts.spool("orch_roadmap_enqueue", row.id, `origem=roadmap-fila linha=ROADMAP.md:L${row.lineNo} dedupe=novo contrato=${contractPath}${!contractExists ? " (gerado por template)" : ""} prio=${priority}`);
  }

  return result;
}
