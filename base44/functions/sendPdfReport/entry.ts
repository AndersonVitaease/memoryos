import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getGoogleOAuthToken, sendGmailOAuth } from '../../shared/gmailSend.ts';

/**
 * sendPdfReport — envia email com resumo de PDF via Gmail OAuth.
 * Chamado pelo knowledgeIngestionPipeline após processar um PDF
 * quando há um Watch de automação PDF ativo.
 *
 * Payload esperado:
 * {
 *   to: string,
 *   from: string,
 *   subject: string,
 *   body: string,
 * }
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, from, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    const fromEmail = from || 'noreply@memoryos.app';
    const oauthResult = await getGoogleOAuthToken(base44, fromEmail);

    if (oauthResult) {
      const messageId = await sendGmailOAuth(oauthResult.token, oauthResult.email, to, subject, body);
      console.log(`[sendPdfReport] Email enviado via Gmail OAuth para ${to} — messageId: ${messageId}`);
      return Response.json({ ok: true, method: 'gmail_oauth', to, messageId });
    }

    // Fallback: Base44 SendEmail (só funciona para usuários registrados)
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body });
    console.log(`[sendPdfReport] Email enviado via Base44 fallback para ${to}`);
    return Response.json({ ok: true, method: 'base44_fallback', to });

  } catch (error: any) {
    console.error('[sendPdfReport] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}