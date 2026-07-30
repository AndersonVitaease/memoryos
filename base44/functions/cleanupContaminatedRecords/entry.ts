/**
 * cleanupContaminatedRecords — Backend function
 *
 * Faz a limpeza REAL (nao so filtro em tempo de execucao) dos registros
 * contaminados com a narrativa ficticia de "auditoria arquitetural
 * MAS/MES/Biblioteca Oficial" (nunca aconteceu de verdade — ver
 * IA-010/015/016/021/022/029/030).
 *
 * Hoje o memoryPipeline.js FILTRA esses registros em toda mensagem do chat
 * (ver [IA-030] nos logs) — ou seja, o app le, desserializa e descarta os
 * mesmos registros lixo repetidamente, pra sempre, sem nunca de fato
 * apaga-los. Isso desperdica:
 *   1. Banda/latencia (busca registros que nunca serao usados)
 *   2. CPU (JSON.stringify + regex/substring em cada registro, toda mensagem)
 *   3. Qualidade de contexto (os limites de query — ex: 50 tasks, 100
 *      entities — sao parcialmente consumidos por lixo, entao menos
 *      registros REAIS cabem no contexto enviado ao LLM)
 *
 * SEGURANCA: roda em modo DRY-RUN por padrao (so reporta o que seria
 * apagado). So apaga de verdade se o body tiver { confirm: true }.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const _CONTAMINATION_MARKERS = [
  'biblioteca oficial', 'mas e mes', 'mas/mes', ' mas ', ' mes ',
  'macr', 'compliance report', 'auditoria arquitetural',
  'módulo de acesso de segurança', 'módulo de execução de serviços',
  'módulo de visão', 'módulo de processamento de sistema',
];

function isContaminated(record: unknown): boolean {
  try {
    const text = JSON.stringify(record).toLowerCase();
    return _CONTAMINATION_MARKERS.some((marker) => text.includes(marker));
  } catch {
    return false;
  }
}

// Mapeia nome da entity Base44 -> campo de ordenacao usado no memoryPipeline
// (mesmo criterio, so pra buscar o volume real de registros existentes).
const ENTITY_SORT: Record<string, string> = {
  Decision: '-decided_date',
  Task: '-created_date',
  KnowledgeEntity: '-created_date',
  Document: '-created_date',
  Topic: '-created_date',
  Keyword: '-created_date',
  ChatSession: '-updated_date',
  Message: '-created_date',
};

// Limite alto o bastante pra pegar o volume real de registros contaminados
// acumulados (o memoryPipeline usa limites bem menores — 30/50/100 — por
// mensagem; aqui e uma varredura completa, unica, nao por mensagem).
const SCAN_LIMIT = 2000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // body vazio = dry-run padrao, tudo bem
    }
    const confirm = body?.confirm === true;

    const entityNames = Object.keys(ENTITY_SORT);
    const report: Record<string, { scanned: number; contaminated: number; deletedIds: string[] }> = {};

    for (const entityName of entityNames) {
      const sort = ENTITY_SORT[entityName];
      let records: any[] = [];
      try {
        records = await (base44.asServiceRole.entities as any)[entityName].list(sort, SCAN_LIMIT);
      } catch (e) {
        report[entityName] = { scanned: 0, contaminated: 0, deletedIds: [] };
        console.error(`[cleanupContaminatedRecords] Falha ao listar ${entityName}:`, (e as Error).message);
        continue;
      }

      const contaminated = records.filter((r) => isContaminated(r));
      const deletedIds: string[] = [];

      if (confirm) {
        for (const rec of contaminated) {
          try {
            await (base44.asServiceRole.entities as any)[entityName].delete(rec.id);
            deletedIds.push(rec.id);
          } catch (e) {
            console.error(`[cleanupContaminatedRecords] Falha ao apagar ${entityName}/${rec.id}:`, (e as Error).message);
          }
        }
      }

      report[entityName] = {
        scanned: records.length,
        contaminated: contaminated.length,
        deletedIds,
      };
    }

    const totalContaminated = Object.values(report).reduce((sum, r) => sum + r.contaminated, 0);
    const totalDeleted = Object.values(report).reduce((sum, r) => sum + r.deletedIds.length, 0);

    return Response.json({
      mode: confirm ? 'DELETE' : 'DRY_RUN',
      totalContaminated,
      totalDeleted,
      report,
      note: confirm
        ? `${totalDeleted} registro(s) apagado(s) permanentemente.`
        : `Modo DRY-RUN: nenhum registro foi apagado. Encontrados ${totalContaminated} registro(s) contaminado(s). Para apagar de verdade, chame novamente com { confirm: true }.`,
    });
  } catch (e) {
    console.error('[cleanupContaminatedRecords] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
