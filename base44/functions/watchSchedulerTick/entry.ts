/**
 * watchSchedulerTick — Backend function chamada pelo workflow agendado (a cada 5 min)
 * Executa 5 iterações internas com delay de 60s cada, cobrindo todos os minutos
 * da janela de 5 minutos para não perder nenhum alarme de horário exato.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runOneTick(base44: any): Promise<{ processed: number; triggered: number; failed: number; skipped: number }> {
  const now = new Date().toISOString();

  const allWatches = await base44.asServiceRole.entities.Watch.filter({ status: 'active' });
  const dueWatches = allWatches.filter((w: any) => {
    if (!w.next_execution_at) return true;
    return new Date(w.next_execution_at) <= new Date(now);
  });

  const result = { processed: 0, triggered: 0, failed: 0, skipped: allWatches.length - dueWatches.length };

  for (const watch of dueWatches) {
    try {
      result.processed++;

      let conditionTree: any = {};
      try { conditionTree = JSON.parse(watch.condition_tree || '{}'); } catch {}

      let evaluationResult = false;
      const executionStart = Date.now();

      if (conditionTree.kind === 'leaf' && conditionTree.provider === 'clock') {
        const target = conditionTree.params?.target_time;
        if (target) {
          // Usar Intl para extrair hora/minuto em BRT sem depender de Date parse
          const nowUTC = new Date();
          const hPart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(nowUTC);
          const mPart = new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'America/Sao_Paulo' }).format(nowUTC);
          const nowH = parseInt(hPart, 10);
          const nowM = parseInt(mPart, 10);
          const [tH, tM] = target.split(':').map(Number);
          const nowTotalMin = nowH * 60 + nowM;
          const targetTotalMin = tH * 60 + tM;
          const diffMin = nowTotalMin - targetTotalMin;
          // Janela normal: ±2 min (absorve atrasos do scheduler)
          // Recuperação: se nunca foi avaliado e o horário passou há menos de 10 min,
          // dispara de qualquer forma para não perder alarmes criados próximo ao horário
          const neverEvaluated = !watch.last_execution_at;
          const isInNormalWindow = Math.abs(diffMin) <= 2;
          const isMissedRecovery = neverEvaluated && diffMin > 0 && diffMin <= 10;
          evaluationResult = isInNormalWindow || isMissedRecovery;
          console.log(`[clock] target=${target} nowBRT=${nowH}:${String(nowM).padStart(2,'0')} diff=${diffMin} normalWindow=${isInNormalWindow} missedRecovery=${isMissedRecovery} match=${evaluationResult}`);
        }
      }

      const durationMs = Date.now() - executionStart;
      // Dispara se: condição true E (nunca avaliado antes OU transição false→true)
      const prevResult = watch.last_evaluation_result === true;
      const wasTriggered = evaluationResult && !prevResult;

      // Clock watches: next execution in 1 minute; others: use their frequency
      const freqMin = conditionTree.provider === 'clock' ? 1 : (watch.frequency_minutes || 60);
      const nextExec = new Date(Date.now() + freqMin * 60 * 1000).toISOString();

      await base44.asServiceRole.entities.Watch.update(watch.id, {
        last_execution_at: now,
        next_execution_at: nextExec,
        last_evaluation_result: evaluationResult,
        trigger_count: wasTriggered ? (watch.trigger_count || 0) + 1 : (watch.trigger_count || 0),
        consecutive_failures: 0,
      });

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
        result.triggered++;
        await base44.asServiceRole.entities.PendingWatchAction.create({
          watch_id: watch.id,
          action_type: watch.on_trigger_type || 'notify_user',
          payload: JSON.stringify({
            watchId: watch.id,
            watchName: watch.name,
            message: `Watch disparou: ${watch.name}`,
            timestamp: now,
          }),
          status: 'pending',
          retry_count: 0,
          max_retries: 3,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          session_id: watch.session_id || null,
        });
      }

    } catch (watchErr: any) {
      result.failed++;
      try {
        await base44.asServiceRole.entities.Watch.update(watch.id, {
          consecutive_failures: (watch.consecutive_failures || 0) + 1,
          status: (watch.consecutive_failures || 0) >= 2 ? 'error' : 'active',
          error_message: watchErr.message,
        });
      } catch { /* silent */ }
    }
  }

  return result;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const totals = { processed: 0, triggered: 0, failed: 0, iterations: 0 };

    // 5 iterações de 1 minuto cada = cobre toda a janela de 5 minutos do cron
    for (let i = 0; i < 5; i++) {
      const r = await runOneTick(base44);
      totals.processed += r.processed;
      totals.triggered += r.triggered;
      totals.failed += r.failed;
      totals.iterations++;

      // Aguarda 60s antes da próxima iteração (exceto na última)
      if (i < 4) await delay(60_000);
    }

    return Response.json({ ok: true, ...totals, timestamp: new Date().toISOString() });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}