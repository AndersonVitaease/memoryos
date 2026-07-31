/**
 * travellinkCall — Backend function
 *
 * Proxy generico para QUALQUER servico da API Travellink Web API (Aereo).
 * Cuida da parte dificil uma vez so (criptografia RSA-PKCS1 do Developer
 * Access Code + montagem dos headers obrigatorios) — cada servico
 * especifico (Disponibilidade, Tarifar, Reservar, Emitir, etc.) so
 * precisa chamar essa function passando { operation, body }, sem
 * reconstruir a autenticacao.
 *
 * Mesma filosofia do mcpClientCall/documentParser de hoje: um motor
 * generico, varias capacidades especificas construidas em cima dele.
 *
 * Secrets necessarias (configurar em Segredos, no Base44):
 *   - TRAVELLINK_DEVELOPER_TOKEN       (texto puro)
 *   - TRAVELLINK_DEVELOPER_ACCESS_CODE (texto puro, sera criptografado aqui)
 *   - TRAVELLINK_RSA_PUBLIC_KEY        (formato PEM, ex: "-----BEGIN PUBLIC KEY-----\n...")
 *
 * IMPORTANTE — nao testado end-to-end ainda (esperando credenciais reais
 * de sandbox/producao). A logica de criptografia RSA-PKCS1 ja foi testada
 * isoladamente e confirmada. O formato exato da URL/corpo de cada
 * operacao (ex: "Disponibilidade") precisa ser confirmado contra a
 * documentacao real de cada servico antes do primeiro uso real.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { publicEncrypt, constants } from 'node:crypto';

const SANDBOX_BASE_URL = 'https://wooba-sandbox-api.travellink.com.br/wcftravellinkjson/AereoNoSession.svc';

/** Criptografa o Developer Access Code com RSA-PKCS1 + Base64, exatamente
 * como a documentacao da Travellink exige. Testado isoladamente antes de
 * integrar aqui (ver sessao de testes — RSA_PKCS1_PADDING funciona pra
 * encrypt, so decrypt e' que tem restricao de seguranca no Node/Deno
 * recentes, e decrypt e' trabalho do lado da Travellink, nao nosso). */
/** FIX (achado real, testado): chaves PEM coladas em campos de secret de
 * uma linha so as vezes perdem a quebra de linha de verdade, virando um
 * "\n" literal (barra invertida + n) no texto salvo. Detecta esse padrao
 * e converte de volta pra quebra de linha real — sem custo se a chave ja
 * estiver certa. */
function normalizePemKey(pem: string): string {
  const hasLiteralBackslashN = pem.indexOf('\\n') !== -1;
  const hasRealNewlineBeforeFooter = pem.indexOf('\n-----') !== -1;
  if (hasLiteralBackslashN && !hasRealNewlineBeforeFooter) {
    return pem.split('\\n').join('\n');
  }
  return pem;
}

function encryptAccessCode(accessCode: string, publicKeyPem: string): string {
  const normalizedKey = normalizePemKey(publicKeyPem);
  const encrypted = publicEncrypt(
    { key: normalizedKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(accessCode, "utf8"),
  );
  return encrypted.toString("base64");
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let requestBody: Record<string, unknown> = {};
    try {
      requestBody = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { operation, body, useProduction, productionUrl } = requestBody as {
      operation?: string;
      body?: Record<string, unknown>;
      useProduction?: boolean;
      productionUrl?: string;
    };

    if (!operation) {
      return Response.json({ error: "Campo 'operation' obrigatório (ex: 'Disponibilidade')" }, { status: 400 });
    }

    const developerToken = Deno.env.get('TRAVELLINK_DEVELOPER_TOKEN');
    const developerAccessCode = Deno.env.get('TRAVELLINK_DEVELOPER_ACCESS_CODE');
    const rsaPublicKey = Deno.env.get('TRAVELLINK_RSA_PUBLIC_KEY');

    if (!developerToken || !developerAccessCode || !rsaPublicKey) {
      return Response.json({
        error: 'Credenciais Travellink não configuradas. Faltam: ' +
          [
            !developerToken && 'TRAVELLINK_DEVELOPER_TOKEN',
            !developerAccessCode && 'TRAVELLINK_DEVELOPER_ACCESS_CODE',
            !rsaPublicKey && 'TRAVELLINK_RSA_PUBLIC_KEY',
          ].filter(Boolean).join(', '),
      }, { status: 500 });
    }

    let encryptedAccessCode: string;
    try {
      encryptedAccessCode = encryptAccessCode(developerAccessCode, rsaPublicKey);
    } catch (e) {
      return Response.json({
        error: `Falha ao criptografar o Developer Access Code — verifique o formato da chave pública (deve ser PEM): ${(e as Error).message}`,
      }, { status: 500 });
    }

    // ATENCAO: formato de URL abaixo e' a melhor suposicao pro padrao de
    // servico WCF JSON (.svc/NomeDaOperacao) — precisa confirmar contra
    // o endpoint real de "Disponibilidade" assim que tivermos acesso.
    const baseUrl = useProduction && productionUrl ? productionUrl : SANDBOX_BASE_URL;
    const url = `${baseUrl}/${operation}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DeveloperToken': developerToken,
        'DeveloperAccesCode': encryptedAccessCode,
      },
      body: JSON.stringify(body ?? {}),
    });

    const durationMs = Date.now() - t0;
    const rawText = await res.text();
    let parsed: unknown = rawText;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // resposta nao era JSON — devolve texto bruto pra diagnostico
    }

    if (!res.ok) {
      return Response.json({
        error: `Travellink retornou HTTP ${res.status}`,
        rawResponse: parsed,
        urlUsed: url,
        durationMs,
      }, { status: 502 });
    }

    return Response.json({ result: parsed, urlUsed: url, durationMs });
  } catch (e) {
    return Response.json({ error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
});
