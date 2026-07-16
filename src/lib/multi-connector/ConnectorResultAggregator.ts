/**
 * ConnectorResultAggregator.ts — Engineering Sprint 8.0
 * Produces a single, human-readable response from a UnifiedContext.
 * Uses InvokeLLM when context is substantial; falls back to template otherwise.
 */

import type { UnifiedContext, MultiConnectorExecutionResult } from "./MultiConnectorExecutionPlan";

export interface AggregatedResponse {
  answer:    string;
  sources:   string[];
  usedLLM:   boolean;
  durationMs:number;
}

// ── Template-based summary (no LLM — fast path) ───────────────────────────────

function _templateSummary(ctx: UnifiedContext, rawQuery: string): string {
  const lines: string[] = [`Resultado para: "${rawQuery}"`, ""];
  if (ctx.calendarEvents.length > 0) {
    lines.push(`📅 Calendário (${ctx.calendarEvents.length} evento(s)):`);
    ctx.calendarEvents.slice(0, 3).forEach((e: unknown) => {
      const ev = e as Record<string, unknown>;
      const sum = ev.summary ?? ev.title ?? "Evento";
      const start = (ev.start as Record<string, string>)?.dateTime ?? (ev.start as Record<string, string>)?.date ?? "";
      lines.push(`  • ${sum}${start ? " — " + new Date(start).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}`);
    });
    lines.push("");
  }
  if (ctx.driveFiles.length > 0) {
    lines.push(`📁 Drive (${ctx.driveFiles.length} arquivo(s)):`);
    ctx.driveFiles.slice(0, 5).forEach((f: unknown) => {
      const fi = f as Record<string, unknown>;
      lines.push(`  • ${fi.name ?? fi.id ?? "Arquivo"} (${fi.fileType ?? fi.mimeType ?? ""})`);
    });
    lines.push("");
  }
  if (ctx.gmailMessages.length > 0) {
    lines.push(`📧 Gmail (${ctx.gmailMessages.length} email(s)):`);
    ctx.gmailMessages.slice(0, 3).forEach((m: unknown) => {
      const msg = m as Record<string, unknown>;
      lines.push(`  • ${msg.subject ?? msg.snippet ?? "Email"}`);
    });
    lines.push("");
  }
  if (lines.length <= 2) lines.push("Nenhum resultado encontrado nos conectores consultados.");
  lines.push(`Fontes: ${ctx.sources.join(", ") || "nenhuma"}`);
  return lines.join("\n");
}

// ── LLM-based synthesis (rich context) ───────────────────────────────────────

async function _llmSummary(ctx: UnifiedContext, rawQuery: string): Promise<string> {
  const { base44 } = await import("@/api/base44Client");
  const contextJson = JSON.stringify({
    calendar: ctx.calendarEvents.slice(0, 5),
    drive:    ctx.driveFiles.slice(0, 5),
    gmail:    ctx.gmailMessages.slice(0, 5),
  }, null, 2);
  const prompt = `Voce e o MemoryOS, a memoria permanente do usuario.
O usuario perguntou: "${rawQuery}"

Abaixo esta o contexto multi-connector recuperado:
${contextJson}

Gere uma resposta direta, clara e contextualizada em portugues brasileiro.
Nao mencione APIs ou tecnologia. Fale como se voce conhecesse o usuario.
Seja conciso. Maximo 150 palavras.`;

  return base44.integrations.Core.InvokeLLM({ prompt });
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function aggregateResults(
  execResult: MultiConnectorExecutionResult,
  rawQuery:   string,
  useLLM:     boolean = false,
): Promise<AggregatedResponse> {
  const t0  = Date.now();
  const ctx = execResult.unifiedContext;
  let answer: string;
  let usedLLM = false;

  const hasContent = ctx.calendarEvents.length + ctx.driveFiles.length + ctx.gmailMessages.length > 0;

  if (useLLM && hasContent) {
    try {
      answer  = await _llmSummary(ctx, rawQuery);
      usedLLM = true;
    } catch {
      answer = _templateSummary(ctx, rawQuery);
    }
  } else {
    answer = _templateSummary(ctx, rawQuery);
  }

  return { answer, sources: ctx.sources, usedLLM, durationMs: Date.now() - t0 };
}