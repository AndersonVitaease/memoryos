/**
 * MACR Formatter for Chat
 *
 * Converte o resultado do Architecture Auditor (objeto MACR + metadata)
 * em markdown legível para renderização no chat via ReactMarkdown.
 *
 * NÃO chama o LLM. É puramente determinístico.
 */

/**
 * @param {Object} macr - Resultado do ReportBuilderCapability
 * @param {Object} metadata - Metadata retornada pelo Specialist.analyze()
 * @returns {string} Markdown formatado
 */
export function formatMacrForChat(macr, metadata = {}) {
  if (!macr) return "Auditoria executada, mas nenhum relatório foi gerado.";

  const cabecalho = macr.cabecalho || {};
  const status = cabecalho.compliance_status || macr.metadata?.overallComplianceStatus || "—";
  const lines = [];

  // === Cabeçalho ===
  lines.push(`## 🛡️ ${cabecalho.titulo || "MACR"}`);
  lines.push("");
  lines.push(`**Status de Conformidade:** \`${status}\``);
  lines.push(`**Versão:** ${cabecalho.auditor_version || "v3.1"}  ·  **Data:** ${cabecalho.data || "—"}`);
  if (cabecalho.documentos_utilizados?.length > 0) {
    lines.push(`**Documentos:** ${cabecalho.documentos_utilizados.join(", ")}`);
  }
  lines.push(`**Escopo:** ${metadata?.scope?.level || "project"}  ·  ${metadata?.fileCount || 0} arquivos  ·  ${metadata?.moduleCount || 0} módulos`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // === Resumo Executivo ===
  if (macr.resumo_executivo) {
    lines.push("### 📋 Resumo Executivo");
    lines.push("");
    lines.push(macr.resumo_executivo);
    lines.push("");
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
      const icon = c.status === "CONFORME" ? "🟢" : c.status === "PARCIALMENTE CONFORME" ? "🟡" : "🔴";
      lines.push(`- ${icon} **${c.categoria}** — \`${c.status}\``);
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
    lines.push(`| Violações Arquiteturais | Violações Funcionais | Pendências Planejadas |`);
    lines.push(`|---|---|---|`);
    lines.push(`| ${vCount} | 0 | ${pCount} |`);
    lines.push("");
    lines.push(macr.conclusao);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Relatório gerado pelo **Architecture Auditor Specialist v3.1** — primeiro Especialista Oficial do MemoryOS. A auditoria foi executada através do pipeline oficial: ProjectReader → OfficialLibraryReader → PolicyEngine → CodeAnalyzer → ReportBuilder.*");

  return lines.join("\n");
}

export default formatMacrForChat;