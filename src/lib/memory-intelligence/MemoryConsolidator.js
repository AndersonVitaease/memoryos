/**
 * MemoryConsolidator.js — Memory Intelligence Platform (MIP)
 * Sprint 7.1.1A: Consolida memórias semelhantes.
 *
 * Ao identificar grupos de registros com alta sobreposição semântica,
 * cria um "cluster" consolidado sem apagar os originais.
 * Utilizado APENAS no contexto — não altera o banco de dados.
 */

/**
 * Calcula sobreposição de palavras entre dois textos [0..1].
 */
function overlap(a, b) {
  if (!a || !b) return 0;
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  // Igualdade ou contenção direta (ex: "MemoryOS" dentro de "MemoryOS
  // Base44") é sempre um duplicado seguro, independente de quantas
  // palavras "significativas" sobram depois do filtro abaixo.
  if (normA === normB) return 1;
  if (normA.length > 3 && normB.length > 3 && (normA.includes(normB) || normB.includes(normA))) {
    return 1;
  }

  const setA = new Set(normA.split(/\W+/).filter((w) => w.length > 3));
  const setB = new Set(normB.split(/\W+/).filter((w) => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;

  // FIX (auditoria cognição): exige pelo menos 2 palavras significativas
  // em AMBOS os lados antes de aplicar a razão de sobreposição. Sem isso,
  // dois registros DIFERENTES que compartilham só uma palavra genérica
  // (ex: "Consolidadora Tyller" vs "Consolidadora CNT" — "CNT" tem 3
  // letras e é descartado pelo filtro length>3, sobrando só
  // "consolidadora" — ou "Banco do Brasil" vs "Banco Bradesco")
  // batiam o threshold e eram fundidos num cluster só, escondendo um
  // dos dois registros silenciosamente do contexto enviado ao LLM.
  if (setA.size < 2 || setB.size < 2) return 0;

  // Jaccard (interseção / união) — mais rigoroso que interseção/maior,
  // que inflava o score quando um conjunto era bem menor que o outro.
  const union = new Set([...setA, ...setB]);
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  return common / union.size;
}

/**
 * Agrupa registros em clusters semânticos usando threshold de similaridade.
 *
 * @param {Object[]} records          - Registros a agrupar
 * @param {string}   textField        - Campo de texto a comparar
 * @param {number}   [threshold=0.35] - Limiar de sobreposição para agrupar
 * @returns {Array<{ key: string, members: Object[], consolidated: string }>}
 */
export function consolidate(records, textField = "content", threshold = 0.35) {
  if (!records || records.length === 0) return [];

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < records.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [records[i]];
    assigned.add(i);

    for (let j = i + 1; j < records.length; j++) {
      if (assigned.has(j)) continue;
      const sim = overlap(records[i][textField], records[j][textField]);
      if (sim >= threshold) {
        cluster.push(records[j]);
        assigned.add(j);
      }
    }

    if (cluster.length > 1) {
      // Gera texto consolidado: pega o mais longo como base
      const longest = cluster.reduce((a, b) =>
        String(b[textField] || "").length > String(a[textField] || "").length ? b : a
      );
      clusters.push({
        key: String(longest[textField] || "").slice(0, 80),
        members: cluster,
        consolidated: String(longest[textField] || ""),
        count: cluster.length,
      });
    } else {
      clusters.push({
        key: String(records[i][textField] || "").slice(0, 80),
        members: cluster,
        consolidated: String(records[i][textField] || ""),
        count: 1,
      });
    }
  }

  return clusters;
}

/**
 * Retorna apenas os representantes de cada cluster (deduplication para contexto).
 * @param {Object[]} records
 * @param {string}   textField
 * @param {number}   threshold
 * @returns {Object[]} - Um representante por cluster
 */
export function deduplicateForContext(records, textField = "content", threshold = 0.35) {
  const clusters = consolidate(records, textField, threshold);
  return clusters.map((c) => ({
    ...c.members[0],
    _consolidated: c.count > 1,
    _mergedCount: c.count,
  }));
}
