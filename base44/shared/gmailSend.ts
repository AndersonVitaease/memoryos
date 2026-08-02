/**
 * gmailSend.ts — shared module
 * Envia email via Gmail OAuth (RFC 2822 / base64url).
 * Reaproveitado por watchSchedulerTick e sendPdfReport.
 */

export async function getGoogleOAuthToken(base44: any, fromEmail: string): Promise<{ token: string; email: string } | null> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  // Busca token pelo email do remetente
  const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ email: fromEmail });
  let record = records.find((r: any) => r.scopes?.includes('gmail.send') && r.refresh_token);

  // Fallback: qualquer token com gmail.send
  if (!record) {
    const all = await base44.asServiceRole.entities.GoogleOAuthToken.filter({});
    record = all.find((r: any) => r.scopes?.includes('gmail.send') && r.refresh_token);
  }

  if (!record) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: record.refresh_token,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    console.warn(`[gmailSend] Token refresh failed: ${data.error}`);
    return null;
  }
  return { token: data.access_token, email: record.email };
}

export async function sendGmailOAuth(accessToken: string, fromEmail: string, to: string, subject: string, body: string): Promise<void> {
  const encodeHeader = (str: string) => {
    const b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    ));
    return `=?UTF-8?B?${b64}?=`;
  };

  const emailLines = [
    `From: MemoryOS <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join('\r\n');

  const encoder = new TextEncoder();
  const bytes = encoder.encode(emailLines);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail send failed ${res.status}: ${JSON.stringify(err)}`);
  }
  console.log(`[gmailSend] Email enviado para ${to}`);
}