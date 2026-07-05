/**
 * MACR Formatter for Chat — v4.0
 *
 * Converte o resultado do Architecture Auditor v4.0 (MACR + metadata)
 * em markdown legível para o chat.
 *
 * v4.0 — Renderiza:
 *   - Audit Modes executados (transparência obrigatória)
 *   - Base das Evidências
 *   - Limitações da Auditoria
 *   - Conclusões classificadas (EVIDÊNCIA / COMPORTAMENTO OBSERVADO / INFERÊNCIA)
 *   - Inferências separadas de evidências
 *
 * NÃO chama o LLM. Puramente determinístico.
 */

function statusIcon(status) {
  if (status === "CONFORME" || status === "CONSISTENTE" || status === "ADERENTE") return "🟢";
  if (status === "PARCIALMENTE CONFORME" || status === "ATENÇÃO") return "🟡";
  if (status === "NÃO CONFORME" || status === "CONFLITO" || status === "DIVERGENTE" || status === "CRÍTICO") return "🔴";
  if (status === "LACUNA" || status === "REDUNDÂNCIA") return "🟠";
  if (status === "INCONCLUSIVO" || status === "INDISPONÍVEL") return "⚪";
  return "•";
}

export function formatMacrForChat(macr, metadata = {}) {
  if (!macr) return "Auditoria executada, mas nenhum relatório foi gerado.";

  const cabecalho = macr.cabecalho || {};
  const status = cabecalho.compliance_status || macr.metadata?.overallComplianceStatus || "—";
  const lines = [];

  // === Cabeçalho ===
  lines.push(`## 🛡️ ${cabecalho.titulo || "MACR"}`);
  lines.push("");
  lines.push(`**Status de Conformidade:** \`${status}\``);
  lines.push(`**Versão:** ${cabecalho.auditor_version || "v4.0"}  ·  **Data:** ${cabecalho.data || "—"}`);
  lines.push("");

  // === v4.0: AUDIT MODES EXECUTADOS (transparência obrigatória) ===
  if (macr.audit_modes?.length > 0) {
    lines.push("### 🔍 Audit Modes");
    lines.push("");
    for (const m of macr.audit_modes) {
      if (m.executed) {
        lines.push(`- ✅ **${m.label}** — ${m.evidenceBase || "executado"} (${m.conclusionCount || 0} conclusões)`);
      } else {
        lines.push(`- ❌ **${m.label}** — Motivo: ${m.motivo || "indisponível"}`);
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // === v4.0: BASE DAS EVIDÊNCIAS ===
  if (macr.evidence_base) {
    const eb = macr.evidence_base;
    lines.push("### 📚 Base das Evidências");
    lines.push("");
    lines.push(`- Biblioteca Oficial: ${eb.library ? "✅ Disponível" : "❌ Indisponível"}`);
    lines.push(`- Código-fonte: ${eb.code ? "✅ Disponível" : "❌ Indisponível"}`);
    lines.push(`- Runtime: ${eb.runtime ? "✅ Disponível" : "❌ Indisponível"}`);
    lines.push(`- Logs: ${eb.logs ? "✅ Disponível" : "❌ Indisponível"}`);
    lines.push(`- Eventos: ${eb.events ? "✅ Disponível" : "❌ Indisponível"}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // === v4.0: LIMITAÇÕES DA AUDITORIA ===
  if (macr.limitacoes?.length > 0) {
    lines.push("### ⚠️ Limitações da Auditoria");
    lines.push("");
    for (const l of macr.limitacoes) {
      lines.push(`- ${l}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // === Resumo Executivo ===
  if (macr.resumo_executivo) {
    lines.push("### 📋 Resumo Executivo");
    lines.push("");
    lines.push(macr.resumo_executivo);
    lines.push("");
  }

  // === v4.0: CONCLUSÕES CLASSIFICADAS ===
  const conclusions = macr.conclusions;
  if (conclusions) {
    // EVIDÊNCIAS
    if (conclusions.evidence?.length > 0) {
      lines.push(`### ✅ Conclusões com Evidência (${conclusions.evidence.length})`);
      lines.push("");
      for (const c of conclusions.evidence) {
        lines.push(`- ${statusIcon(c.status)} **${c.item}** — \`${c.status}\``);
        lines.push(`  > **Fonte:** ${c.origem}`);
        if (c.detalhe) lines.push(`  > ${c.detalhe}`);
        lines.push("");
      }
    }

    // COMPORTAMENTO OBSERVADO
    if (conclusions.observed_behavior?.length > 0) {
      lines.push(`### 👁️ Comportamento Observado (${conclusions.observed_behavior.length})`);
      lines.push("");
      lines.push("> ⚠️ As conclusões abaixo são baseadas em **comportamento observado**, não em código-fonte.");
      lines.push("");
      for (const c of conclusions.observed_behavior) {
        lines.push(`- ${statusIcon(c.status)} **${c.item}** — \`${c.status}\``);
        lines.push(`  > **Fonte:** ${c.origem}`);
        if (c.detalhe) lines.push(`  > ${c.detalhe}`);
        lines.push("");
      }
    }

    // INFERÊNCIAS
    if (conclusions.inference?.length > 0) {
      lines.push(`### 🟠 Inferências (${conclusions.inference.length})`);
      lines.push("");
      lines.push("> ⚠️ As conclusões abaixo são **inferências** — não foram confirmadas por código-fonte.");
      lines.push("");
      for (const c of conclusions.inference) {
        lines.push(`- ${statusIcon(c.status)} **${c.item}** — \`${c.status}\``);
        lines.push(`  > **Fonte:** ${c.origem}`);
        lines.push(`  > ⚠️ Esta conclusão não foi confirmada por código-fonte.`);
        if (c.detalhe) lines.push(`  > ${c.detalhe}`);
        lines.push("");
      }
    }
  }

  // === Checklist Obrigatório ===
  if (macr.checklist_obrigatorio?.length > 0) {
    lines.push("### ✅ Critérios Obrigatórios");
    lines.push("");
    for (const item of macr.checklist_obrigatorio) {
      lines.push(`- ✅ ${item.criterio}`);
    }
    lines.push("");
  }

  // === Conformidade por Categoria ===
  if (macr.conformidade?.length > 0) {
    lines.push("### 📊 Conformidade por Categoria");
    lines.push("");
    for (const c of macr.conformidade) {
      lines.push(`- ${statusIcon(c.status)} **${c.categoria}** — \`${c.status}\``);
      if (c.comentario) lines.push(`  > ${c.comentario}`);
    }
    lines.push("");
  }

  // === Violações ===
  if (macr.violacoes?.length > 0) {
    lines.push(`### ⚠️ Violações (${macr.violacoes.length})`);
    lines.push("");
    for (const v of macr.violacoes) {
      lines.push(`**${(v.prioridade || "baixa").toUpperCase()}** · ${v.documento || "—"} · ${v.secao || "—"}`);
      if (v.arquivo) lines.push(`  \`${v.arquivo}\``);
      if (v.impacto) lines.push(`  ${v.impacto}`);
      if (v.correcao_recomendada) lines.push(`  > **Correção:** ${v.correcao_recomendada}`);
      lines.push("");
    }
  }

  // === Pendências Planejadas ===
  if (macr.pendencias_planejadas?.length > 0) {
    lines.push(`### 🔵 Pendências Planejadas (${macr.pendencias_planejadas.length})`);
    lines.push("");
    lines.push("> Itens previstos no roadmap oficial — não constituem violações arquiteturais.");
    lines.push("");
    for (const p of macr.pendencias_planejadas) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  // === Riscos Arquiteturais ===
  if (macr.riscos_arquiteturais?.length > 0) {
    lines.push("### 🔴 Riscos Arquiteturais");
    lines.push("");
    for (const r of macr.riscos_arquiteturais) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  // === Melhorias Recomendadas ===
  if (macr.melhorias_recomendadas?.length > 0) {
    lines.push("### 💡 Melhorias Recomendadas");
    lines.push("");
    for (const m of macr.melhorias_recomendadas) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }

  // === Conclusão ===
  if (macr.conclusao) {
    lines.push("### 📝 Conclusão");
    lines.push("");
    const vCount = macr.metadata?.violationCount ?? macr.violacoes?.length ?? 0;
    const pCount = macr.metadata?.plannedPendencyCount ?? macr.pendencias_planejadas?.length ?? 0;
    const eCount = macr.metadata?.evidenceCount ?? 0;
    const iCount = macr.metadata?.inferenceCount ?? 0;
    lines.push(`| Evidências | Comportamento | Inferências | Violações | Pendências |`);
    lines.push(`|---|---|---|---|---|`);
    lines.push(`| ${eCount} | ${macr.metadata?.behaviorCount ?? 0} | ${iCount} | ${vCount} | ${pCount} |`);
    lines.push("");
    lines.push(macr.conclusao);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Relatório gerado pelo **Architecture Auditor Specialist v4.0** — Especialista Oficial estabilizado do MemoryOS. Auditoria multi-modo com seleção automática, transparência de evidências e inferências separadas.*");

  return lines.join("\n");
}

export default formatMacrForChat;