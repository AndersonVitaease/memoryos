/**
 * openrouterListModels — Backend function
 *
 * Lista os modelos disponíveis no OpenRouter, com nome e preço.
 * A listagem de modelos do OpenRouter é pública (não exige a chave),
 * mas mantemos essa chamada no backend para consistência arquitetural
 * com openrouterChat.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const t0 = Date.now();
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
    });
    const durationMs = Date.now() - t0;
    const data = await res.json();

    if (!res.ok) {
      console.error('[openrouterListModels] HTTP error', res.status, JSON.stringify(data));
      return Response.json(
        { error: data?.error?.message ?? `OpenRouter API error (HTTP ${res.status})`, status: res.status },
        { status: res.status },
      );
    }

    const models = (data?.data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricingPromptPerToken: (m.pricing as Record<string, unknown> | undefined)?.prompt ?? null,
      pricingCompletionPerToken: (m.pricing as Record<string, unknown> | undefined)?.completion ?? null,
    }));

    return Response.json({ models, count: models.length, durationMs });
  } catch (e) {
    console.error('[openrouterListModels] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
