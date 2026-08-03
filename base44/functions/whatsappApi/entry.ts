/**
 * whatsappApi — Backend function para WhatsApp Business Cloud API (Meta oficial)
 *
 * Chama a Graph API do Meta (graph.facebook.com/v21.0) usando o token
 * permanente do System User guardado nos secrets do backend — nunca
 * exposto ao navegador.
 *
 * Secrets necessarios (Settings > Environment Variables):
 *   WHATSAPP_ACCESS_TOKEN   — token permanente do System User (Meta Business Manager)
 *   WHATSAPP_PHONE_NUMBER_ID — ID do numero verificado (WhatsApp Manager > Phone Numbers)
 *
 * Operacoes suportadas:
 *   sendMessage      — envia mensagem de texto
 *   sendTemplate      — envia template aprovado
 *   getMessageStatus — consulta status de entrega
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

Deno.serve(async (req) => {
  const START_MS = Date.now();

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
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { operation, to, message, templateName, templateLanguage, components, messageId } = body as {
      operation?: string;
      to?: string;
      message?: string;
      templateName?: string;
      templateLanguage?: string;
      components?: unknown[];
      messageId?: string;
    };

    if (!operation) {
      return Response.json({ error: 'operation is required' }, { status: 400 });
    }

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

    if (!accessToken || !phoneNumberId) {
      return Response.json({
        error: 'WhatsApp nao configurado. Defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nos secrets.',
      }, { status: 503 });
    }

    switch (operation) {
      case 'sendMessage': {
        if (!to || !message) {
          return Response.json({ error: 'to e message sao obrigatorios para sendMessage' }, { status: 400 });
        }
        const res = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: String(to).replace(/\D/g, ''),
            type: 'text',
            text: { body: message },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('[whatsappApi] sendMessage HTTP error', res.status, JSON.stringify(data));
          return Response.json({
            error: data?.error?.message ?? `Meta API HTTP ${res.status}`,
            metaError: data?.error,
          }, { status: res.status });
        }
        return Response.json({
          ok: true,
          messageId: data?.messages?.[0]?.id ?? null,
          status: data?.messages?.[0]?.message_status ?? null,
          meta: data,
          totalMs: Date.now() - START_MS,
        });
      }

      case 'sendTemplate': {
        if (!to || !templateName) {
          return Response.json({ error: 'to e templateName sao obrigatorios para sendTemplate' }, { status: 400 });
        }
        const tplBody: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          to: String(to).replace(/\D/g, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage ?? 'pt_BR' },
          },
        };
        if (components) {
          (tplBody.template as Record<string, unknown>).components = components;
        }
        const res = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tplBody),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('[whatsappApi] sendTemplate HTTP error', res.status, JSON.stringify(data));
          return Response.json({
            error: data?.error?.message ?? `Meta API HTTP ${res.status}`,
            metaError: data?.error,
          }, { status: res.status });
        }
        return Response.json({
          ok: true,
          messageId: data?.messages?.[0]?.id ?? null,
          status: data?.messages?.[0]?.message_status ?? null,
          meta: data,
          totalMs: Date.now() - START_MS,
        });
      }

      case 'getMessageStatus': {
        if (!messageId) {
          return Response.json({ error: 'messageId e obrigatorio para getMessageStatus' }, { status: 400 });
        }
        const res = await fetch(`${META_GRAPH_BASE}/${messageId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('[whatsappApi] getMessageStatus HTTP error', res.status, JSON.stringify(data));
          return Response.json({
            error: data?.error?.message ?? `Meta API HTTP ${res.status}`,
            metaError: data?.error,
          }, { status: res.status });
        }
        return Response.json({
          ok: true,
          messageId: data?.id ?? messageId,
          status: data?.status ?? null,
          meta: data,
          totalMs: Date.now() - START_MS,
        });
      }

      default:
        return Response.json({ error: `Unknown operation: "${operation}"` }, { status: 400 });
    }
  } catch (e) {
    console.error('[whatsappApi] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});