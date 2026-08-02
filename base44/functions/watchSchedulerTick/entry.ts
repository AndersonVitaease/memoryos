/**
 * watchSchedulerTick — Backend function chamada pelo workflow agendado
 * Roda o ciclo completo do Watch Engine: Scheduler + Outbox
 * Chamada a cada 1 minuto pelo workflow WatchEngineScheduler
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();

    // Busca Watches ativos que precisam ser executados agora
    const allWatches = await base44.asServiceRole.entities.Watch.filter({ status: 'active' });
    const dueWatches = allWatches.filter((w: any) => {
      if (!w.next_execution_at) return true; // nunca executado
      return new Date(w.next_execution_at) <= new Date(now);
    });

    const results = {
      processed: 0,
      triggered: 0,
      failed: 0,
      skipped: allWatches.length - dueWatches.length,
      timestamp: now,
    };

    for (const watch of dueWatches) {
      try {
        results.processed++;

        // Parse da condition_tree
        let conditionTree: any;
        try {
          conditionTree = JSON.parse(watch.condition_tree || '{}');
        } catch {
          conditionTree = {};
        }

        // Avaliar condição baseada no tipo
        let evaluationResult = false;
        const executionStart = Date.now();

        // Para Watches de horário (time-based)
        if (conditionTree.kind === 'leaf' && conditionTree.provider === 'clock') {
          const target = conditionTree.params?.target_time;
          if (target) {
            // Converte UTC → America/Sao_Paulo para comparar com o horário local do usuário
            const nowLocal = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
            const nowTime = new Date(nowLocal);
            const [h, m] = target.split(':').map(Number);
            evaluationResult = nowTime.getHours() === h && nowTime.getMinutes() === m;
          }
        } else {
          // Para outros tipos: avalia como falso por agora (sem acesso real ao Gmail/Drive/etc no backend)
          // O ConnectorGateway frontend é quem realmente executa — aqui apenas controlamos o scheduling
          evaluationResult = false;
        }

        const durationMs = Date.now() - executionStart;
        const wasTriggered = evaluationResult && (watch.last_evaluation_result === false || watch.last_evaluation_result === null || watch.last_evaluation_result === undefined);

        // Calcular próxima execução — Watches de clock rodam a cada 1 minuto
        const freqMin = (conditionTree.provider === 'clock') ? 1 : (watch.frequency_minutes || 60);
        const nextExec = new Date(Date.now() + freqMin * 60 * 1000).toISOString();

        // Atualizar o Watch
        await base44.asServiceRole.entities.Watch.update(watch.id, {
          last_execution_at: now,
          next_execution_at: nextExec,
          last_evaluation_result: evaluationResult,
          trigger_count: wasTriggered ? (watch.trigger_count || 0) + 1 : (watch.trigger_count || 0),
          consecutive_failures: 0,
        });

        // Registrar execução
        await base44.asServiceRole.entities.WatchExecution.create({
          watch_id: watch.id,
          status: 'success',
          evaluation_result: evaluationResult,
          triggered: wasTriggered,
          duration_ms: durationMs,
          providers_called: [conditionTree.provider || 'unknown'],
          session_id: watch.session_id || null,
        });

        if (wasTriggered) {
          results.triggered++;

          // Criar ação pendente no Outbox
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const payload = JSON.stringify({
            watchId: watch.id,
            watchName: watch.name,
            message: `Watch disparou: ${watch.name}`,
            timestamp: now,
          });

          await base44.asServiceRole.entities.PendingWatchAction.create({
            watch_id: watch.id,
            action_type: watch.on_trigger_type || 'notify_user',
            payload,
            status: 'pending',
            retry_count: 0,
            max_retries: 3,
            expires_at: expiresAt,
            session_id: watch.session_id || null,
          });
        }

      } catch (watchErr: any) {
        results.failed++;
        try {
          await base44.asServiceRole.entities.Watch.update(watch.id, {
            consecutive_failures: (watch.consecutive_failures || 0) + 1,
            status: (watch.consecutive_failures || 0) >= 2 ? 'error' : 'active',
            error_message: watchErr.message,
          });
        } catch { /* silent */ }
      }
    }

    return Response.json({ ok: true, ...results });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}