// RD-PERF-GATE-01 — E2E hermético do gate NOVO (in-process, com cache) contra
// componentes REAIS via servidor de produção (984a4504):
//   - recentContext = HTTP MCP engineering.memory.context (ponte real, ~2.6s)
//   - judge         = HTTP MCP engineering.judge.evaluate (Jev real, adaptado ao
//                     shape provider que o runJudgeEvaluate espera)
// O store NÃO é chamado in-process (gate puro): o custo de escrita é idêntico
// pre/pós-cache e cancela na comparação. Fases:
//   A (fresco, kill switch ON)  → p50 do gate SEM cache (leitura da ponte a cada capture)
//   B (cache ON)                → p50 do gate COM cache (1ª leitura aquece, resto hit)
//   D  → MESMO input, decisão fresh vs cacheada (banda/veredito/score)
//   R  → MESMO repeat, recusa fresh vs cacheada (mensagem idêntica)
// Saída: prova-rd-perf-gate-01-e2e.json + audit local prova-rd-perf-gate-01-e2e-audit.jsonl.
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gateCapture, cachedRecentContext, resetGateContextCache, emitGateAudit } from "./src/memoryGate.ts";

const ENG_MCP_URL = process.env.ENG_MCP_SERVER_URL || "http://127.0.0.1:8787/mcp";
const PID = "rd-perf-gate-01-e2e";
const AUDIT_FILE = join(process.cwd(), "prova-rd-perf-gate-01-e2e-audit.jsonl");
const OUT_FILE = join(process.cwd(), "prova-rd-perf-gate-01-e2e.json");

function token() {
  if (process.env.ENG_MCP_TOKEN) return process.env.ENG_MCP_TOKEN.trim();
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    const auth = ((cfg.mcpServers || {})["memoryos-engmcp"] || {}).headers?.Authorization || "";
    return auth.includes(" ") ? auth.split(" ", 2)[1].trim() : (auth || null);
  } catch { return null; }
}
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const TOK = token();
if (TOK) HEADERS.authorization = "Bearer " + TOK;

// Servidor em modo stateless: tools/call direto, SEM handshake (1 POST — o
// buildMcpHandler por request é custo fixo pré-existente do servidor, ~0.7s,
// fora do escopo do gate; cancela na comparação fresh vs cacheada).
async function postFirstData(body) {
  const resp = await fetch(ENG_MCP_URL, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // completa linhas; devolve a primeira "data:" COMPLETA (pode vir fatiada)
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) { reader.cancel().catch(() => {}); return line; }
    }
  }
  return buf;
}
async function mcpCall(tool, args) {
  const t0 = performance.now();
  const raw = await postFirstData({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } });
  const ms = performance.now() - t0;
  let envelope = null;
  if (raw.startsWith("data:")) { try { envelope = JSON.parse(raw.slice(5).trim()); } catch { /* fallthrough */ } }
  if (envelope === null) { try { envelope = JSON.parse(raw); } catch { return { payload: null, ms, err: "mcp_response_unparseable" }; } }
  if (!envelope || envelope.error) return { payload: null, ms, err: "mcp_error: " + JSON.stringify(envelope?.error ?? null).slice(0, 200) };
  const result = envelope.result || {};
  if (result.isError) {
    const text = (result.content || []).map((p) => p?.text || "").join(" ");
    return { payload: null, ms, err: "tool_error: " + text.slice(0, 300) };
  }
  const text = (result.content || []).map((p) => (p && p.text) || "").join("");
  let payload = null;
  try { payload = JSON.parse(text); } catch { return { payload: null, ms, err: "tool_text_unparseable" }; }
  return { payload, ms, err: null };
}

// judge adapter: server envelope → raw provider shape (answers RECORD por qid)
function judgeDepsViaServer() {
  return {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const r = await mcpCall("engineering.judge.evaluate", { state: body.state, questions: Object.entries(body.questions).map(([id, q]) => ({ id, ...q })) });
      if (r.err) throw new Error("JUDGE_UNREACHABLE(" + r.err.slice(0, 120) + ")");
      const env = r.payload;
      const raw = {
        model: env.provider?.model ?? "typesafe/jev-1.13",
        id: env.provider?.id ?? "e2e-adapter",
        usage: { input_tokens: env.provider?.inputTokens ?? null, output_tokens: env.provider?.outputTokens ?? null, cost: env.provider?.cost ?? null },
        answers: Object.fromEntries((env.answers || []).filter((a) => a.type === "noul").map((a) => [a.id, { type: "noul", noul: a.probability }]))
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(raw) };
    },
    // formato sk-or-v1- + [A-Za-z0-9]{20,} exigido pelo resolveJudgeCredential antes do
    // fetch; a credencial REAL nunca sai do servidor — o judge roda lá via MCP (adaptador).
    readCredential: () => "sk-or-v1-" + "e2e".repeat(10) + "adapter"
  };
}

const p50 = (v) => v.length ? Math.round(v.slice().sort((a, b) => a - b)[Math.floor((v.length - 1) / 2)] * 10) / 10 : null;

const out = { ts: new Date().toISOString(), server: "live:984a4504", projectId: PID, store: "production-server (capture de referência Y via MCP)", fresh: [], cached: [], decisions: {}, refusals: {} };
const judgeDeps = judgeDepsViaServer();
const fetchContextLive = async () => (await mcpCall("engineering.memory.context", { projectId: PID, limit: 20 })).payload;
const dep = (recentContext) => ({ projectId: PID, agent: "rd-perf-gate-01-e2e", judgeDeps, recentContext });
const uniq = () => "E2E RD-PERF-GATE-01 (" + new Date().toISOString() + ")";

// ---- Fase 0: referência Y gravada NO KB de produção via MCP (para recusa real) ----
const Y = "E2E RD-PERF-GATE-01: captura de referência para recusa idêntica fresh vs cache — decisão: gravar referência única nesta prova; prova: fase R compara a mensagem de recusa nas duas leituras.";
const y0 = await mcpCall("engineering.memory.capture", {
  summary: Y, projectId: PID, agent: "rd-perf-gate-01-e2e",
  userPrompt: "operator-order (prova RD-PERF-GATE-01: referência de dedupe)",
  outcome: "referência de conteúdo para a comparação fresh-vs-cache da recusa",
  decisions: ["gravar referência Y uma única vez para exercitar o dedupe do gate"]
});
out.refusals["Y_store"] = { ok: y0.err === null, err: y0.err, memoryId_sha16: (y0.payload?.memoryId || "").slice(0, 16) || null };
if (y0.err) { console.error("FALHA ao gravar Y:", y0.err); }

// ---- Fase A: caminho fresco (kill switch ON) — gate SEM cache ----
process.env.ENG_MCP_GATE_CONTEXT_CACHE = "off";
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  const d = await gateCapture({ summary: "E2E fase fresca A" + i + ": medição do gate sem cache — leitura da ponte real a cada capture (" + uniq() + ")", outcome: "prova A: p50 fresco", decisions: ["medição A sem cache"] }, dep(fetchContextLive));
  out.fresh.push({ ms: Math.round(performance.now() - t0), i, ok: d.ok, band: d.band, verdict: d.verdict, score: d.score });
  emitGateAudit(d, null, { projectId: PID, auditFile: AUDIT_FILE });
}
// D: MESMO input no caminho fresco (decisão registrada)
const D = "E2E RD-PERF-GATE-01 decisão idêntica: o gate de admissão consolidou o screen de memória em chamada única de judge com dedupe cacheado por TTL — entrega da missão de performance com suíte verde e provas ao vivo.";
const dFresh = await gateCapture({ summary: D, outcome: "prova D: decisão com leitura fresca", decisions: ["decisão idêntica fresh vs cacheada"], tests: ["test/memoryGate.test.ts"], files: ["src/memoryGate.ts"] }, dep(fetchContextLive));
emitGateAudit(dFresh, null, { projectId: PID, auditFile: AUDIT_FILE });
out.decisions.fresh = { ok: dFresh.ok, band: dFresh.band, verdict: dFresh.verdict, score: dFresh.score, dedupeCached: dFresh.dedupeCached };
// R: repeat de Y com leitura FRESCA (Y já está no KB de produção) → recusa
const dFreshY = await gateCapture({ summary: Y }, dep(fetchContextLive));
out.refusals.fresh = { ok: dFreshY.ok, refusalMessage: dFreshY.refusalMessage, dedupeCached: dFreshY.dedupeCached, reasons: dFreshY.reasons };

// ---- Fase B: cache ON — 1ª leitura aquece, resto HIT ----
delete process.env.ENG_MCP_GATE_CONTEXT_CACHE;
resetGateContextCache();
const wrapped = cachedRecentContext(PID, fetchContextLive);
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  const d = await gateCapture({ summary: "E2E fase cacheada B" + i + ": medição do gate com cache TTL — hit reusa o snapshot da ponte (" + uniq() + ")", outcome: "prova B: p50 cacheado", decisions: ["medição B com cache"] }, dep(wrapped));
  out.cached.push({ ms: Math.round(performance.now() - t0), i, ok: d.ok, band: d.band, verdict: d.verdict, score: d.score, dedupeCached: d.dedupeCached });
  emitGateAudit(d, null, { projectId: PID, auditFile: AUDIT_FILE });
}
// D: MESMO input no caminho CACHEADO (snapshot não contém D — sem store in-process)
const t0d = performance.now();
const dCached = await gateCapture({ summary: D, outcome: "prova D: decisão com leitura cacheada", decisions: ["decisão idêntica fresh vs cacheada"], tests: ["test/memoryGate.test.ts"], files: ["src/memoryGate.ts"] }, dep(wrapped));
out.decisions.cached = { ok: dCached.ok, band: dCached.band, verdict: dCached.verdict, score: dCached.score, dedupeCached: dCached.dedupeCached, ms: Math.round(performance.now() - t0d) };
emitGateAudit(dCached, null, { projectId: PID, auditFile: AUDIT_FILE });
// R: repeat de Y no caminho CACHEADO (snapshot contém Y gravado no KB)
const t0r = performance.now();
const dCachedY = await gateCapture({ summary: Y }, dep(wrapped));
out.refusals.cached = { ok: dCachedY.ok, refusalMessage: dCachedY.refusalMessage, dedupeCached: dCachedY.dedupeCached, reasons: dCachedY.reasons, ms: Math.round(performance.now() - t0r) };

// ---- Resumo ----
out.p50_fresh_ms = p50(out.fresh.filter((f) => f.ok).map((f) => f.ms));
out.p50_cached_ms = p50(out.cached.filter((c) => c.ok).map((c) => c.ms));
out.decisao_idêntica = out.decisions.fresh.band === out.decisions.cached.band
  && out.decisions.fresh.verdict === out.decisions.cached.verdict
  && Math.abs((out.decisions.fresh.score ?? 0) - (out.decisions.cached.score ?? 0)) <= 0.05;
out.recusa_idêntica = out.refusals.fresh.refusalMessage != null
  && out.refusals.fresh.refusalMessage === out.refusals.cached.refusalMessage;
const before = 3469.0; // baseline ao vivo (prova-rd-perf-gate-01-baseline.json)
out.projecao_producao = {
  baseline_p50_capture_ms: before,
  leitura_dedupe_salva_ms: Math.round((out.p50_fresh_ms - out.p50_cached_ms) * 10) / 10,
  p50_projetado_ms: Math.round((before - (out.p50_fresh_ms - out.p50_cached_ms)) * 10) / 10,
  queda_pct: Math.round(((out.p50_fresh_ms - out.p50_cached_ms) / out.p50_fresh_ms) * 1000) / 10
};
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify({
  p50_fresh_ms: out.p50_fresh_ms, p50_cached_ms: out.p50_cached_ms,
  decisao_idêntica: out.decisao_idêntica, recusa_idêntica: out.recusa_idêntica,
  cached_flags: out.cached.map((c) => c.dedupeCached),
  projecao_producao: out.projecao_producao,
  Y_store_ok: out.refusals.Y_store.ok
}, null, 1));
