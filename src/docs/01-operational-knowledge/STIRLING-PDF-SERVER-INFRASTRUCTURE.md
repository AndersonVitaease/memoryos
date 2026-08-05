# Stirling-PDF Self-Hosted Server — Infraestrutura Operacional

**ID:** INFRA-STIRLING-PDF
**Category:** INFRASTRUCTURE_KNOWLEDGE
**Status:** ACTIVE
**Last Updated:** 2026-08-05
**Authority:** ENGINEERING

---

> Documentacao operacional da instancia Stirling-PDF self-hosted em VPS que atende
> a backend function `stirlingPdfCall`. Conhecimento acumulado entre sessões para
> evitar re-descobrir endpoints/versoes/autenticacao.

---

## Visao Geral

O MemoryOS usa Stirling-PDF (open-source, Docker `stirlingtools/stirling-pdf`) para
operacoes em PDFs ingeridos (rotate, password, merge, split, extract text). A instancia
roda em VPS dedicada do usuario (Hostinger), exposta via DuckDNS para contornar a
restricao do sandbox Deno (nao permite acesso a IP cru, so dominios).

**Backend function que consome:** `base44/functions/stirlingPdfCall/entry.ts`
**Frontend que consome:** `src/components/projects/PdfToolsButton.jsx` (menu de acoes)
**Secrets:** `STIRLING_PDF_URL` (URL publica base), `STIRLING_PDF_API_KEY` (chave de API)

---

## Topologia

```
Frontend (PdfToolsButton)
  -> base44.functions.invoke("stirlingPdfCall", { operation, fileUrl, ... })
    -> Deno backend function (sandbox cloud)
      -> fetch(STIRLING_PDF_URL + endpoint, headers: { "X-API-KEY": STIRLING_PDF_API_KEY })
        -> Stirling-PDF container (VPS Hostinger)
          -> DuckDNS (dominio publico) -> roteia para VPS:8080
```

### Por que DuckDNS (nao IP cru):
- O sandbox Deno (runtime das backend functions) **bloqueia fetch para IP cru**
  (ex: `http://2.25.96.245:8080`) — so permite dominios. DuckDNS fornece um dominio
  publico gratuito que roteia para o IP do VPS, contornando a restricao.
- Alternativa futura: Cloudflare Tunnel ou dominio proprio. DuckDNS e o zero-custo.

### Autenticacao:
- Stirling-PDF tem **Security/Login habilitado** — endpoints protegidos exigem
  header `X-API-KEY: <chave>`. A chave e gerada no painel admin do Stirling
  (`Settings > Security > Custom Global API Key`) e armazenada como secret
  `STIRLING_PDF_API_KEY`.
- Endpoint `/api/v1/info/status` e **PUBLICO** — retorna 200 mesmo sem chave.
  Nao serve para validar a API key (ver "Diagnostico de conectividade" abaixo).

---

## Versao e Endpoints Testados

**Versao instalada:** Stirling-PDF ~v2.14.x (Docker `stirlingtools/stirling-pdf:latest`
na data da configuracao). A versao afeta quais endpoints existem — sempre confirmar
via Swagger da instancia antes de adicionar nova operacao.

### Endpoints FUNCIONAIS (validados em producao, 2026-08-05):

| Operacao | Endpoint | Notas |
|---|---|---|
| health (publico) | `GET /api/v1/info/status` | Sem auth. So confirma que responde, nao valida chave. |
| merge | `POST /api/v1/general/merge-pdfs` | multipart `fileInput` (multiplas). |
| split | `POST /api/v1/general/split-pdf` | Retorna ZIP (intervalos) ou PDF (faixa). |
| rotate | `POST /api/v1/general/rotate-pdf` | `angle` em {90, 180, 270}. |
| addPassword | `POST /api/v1/security/add-password` | `password` no form. |
| removePassword | `POST /api/v1/security/remove-password`` | `password` (atual) no form. |
| pdfToText | `POST /api/v1/convert/pdf/text` | **Exige `outputFormat=txt`** no form. Sem isso, 400. |
| repair | `POST /api/v1/misc/repair` | Retorna 200 mas **qpdf falha** — ver KNOWN-ISSUES. |

### Endpoints INEXISTENTES nesta versao (dead ends — nao tentar):

| Operacao esperada | Endpoint tentado | Resultado |
|---|---|---|
| pdfToImage | `POST /api/v1/convert/pdf-to-image` | 404 — endpoint nao existe nesta build. |
| pdfToText (v1 antigo) | `POST /api/v1/extract/pdf-to-text` | 404 — migrado para `/convert/pdf/text`. |
| repair (path antigo) | `POST /api/v1/general/repair-pdf` | 404 — path correto e `/misc/repair`. |

> **Regra:** antes de adicionar qualquer operacao nova, consultar o Swagger da
> instancia (`{STIRLING_PDF_URL}/swagger-ui/index.html`) — os paths mudam entre
> versoes do Stirling.

---

## Diagnostico de Conectividade (operacao `health`)

A operation `health` do `stirlingPdfCall` faz 2 probes:

1. **`/api/v1/info/status` (publico)** — confirma apenas que o servico responde.
   Retorna 200 mesmo sem chave valida → **NAO valida a API key**.

2. **`/api/v1/convert/pdf/text` (protegido, sem file)** — probe real da chave.
   - `401` → chave **INVALIDA**. Verificar `SECURITY_CUSTOMGLOBALAPIKEY` no VPS e
     redefinir o secret `STIRLING_PDF_API_KEY`.
   - `400/500` → chave **VALIDA** (requisicao malformada sem file, mas autenticada).

> Antipadrao corrigido: confiar so no `/info/status` mascarava chaves invalidas
> ("API key valida" aparecia mesmo com chave errada). O probe protegido e obrigatorio
> para validar de verdade.

---

## Tratamento de Erros (contrato backend <-> frontend)

A backend function **sempre retorna HTTP 200** (mesmo em erro), com `{ ok: false,
error: ..., detail: ... }` no corpo. Motivo: o invoke client do Base44 lanca uma
excecao generica em qualquer status nao-2xx, o que esconde o `detail` do frontend.
Retornar 200 com `ok:false` permite o `PdfToolsButton` ler a mensagem real e exibir
ao usuario.

**Campos de erro:** `error` (mensagem curta), `detail`/`extractDetail`/`repairDetail`
(trecho do body do Stirling, truncado em 200-300 chars para diagnostico).

---

## Resultados Binarios (PDFs/ZIPs)

Operacoes que retornam binario (merge, split, rotate, addPassword, removePassword,
repair) codificam o `ArrayBuffer` em **base64** dentro do JSON: `{ ok: true,
contentType, base64 }`. O frontend decodifica `atob` -> `Uint8Array` -> `Blob` e
dispara download. ZIP (split por intervalos) usa `contentType: "application/zip"`.

---

## Manutencao do VPS (operacional, fora do codigo)

- **Atualizar a imagem Docker:** `docker pull stirlingtools/stirling-pdf:latest` +
  recreate container. Apos update, **revalidar endpoints** via Swagger (paths podem
  mudar entre minor versions) e rodar o `health` do `stirlingPdfCall`.
- **Renovar DuckDNS:** o dominio DuckDNS expira se nao for "atualizado" periodicamente
  (ping automatico). Verificar o cronjob de keepalive no VPS.
- **Rotacionar API key:** gerar nova no painel admin do Stirling + atualizar o secret
  `STIRLING_PDF_API_KEY` no Base44 (Settings > Environment Variables).
- **Backups:** os PDFs processados NAO sao persistidos no VPS — o Stirling processa
  on-demand e descarta. Nada a fazerzer backup no VPS. Documentos originais vivem no
  storage do Base44 (`file_url`).

---

## Referencias Cruzadas

- **Backend:** `base44/functions/stirlingPdfCall/entry.ts`
- **Frontend:** `src/components/projects/PdfToolsButton.jsx`
- **Sessao de implementacao:** `src/docs/01-operational-knowledge/SESSION-2026-08-05-PDF-TOOLS-STIRLING-OCR.md`
- **Dead end qpdf:** `src/docs/01-operational-knowledge/KNOWN-ISSUES.md` (KI — Stirling-PDF qpdf repair)
- **Claude.md:** entrada "2026-08-05 — PDF Tools (Stirling-PDF) + OCR Fallback por Visao"

---

## Licoes (reutilizar em futuras integracoes self-hosted)

1. **Sandbox Deno bloqueia IP cru** — sempre usar dominio (DuckDNS/Cloudflare) para
   expor servicos self-hosted que o backend function precisa alcancar.
2. **Endpoint publico mascara auth invalida** — validar credencial sempre com probe
   em endpoint protegido, nao com `/status`/`/health` publicos.
3. **Paths mudam entre versoes do Stirling** — nunca assumir endpoint estatico;
   consultar Swagger da instancia antes de codar nova operacao.
4. **HTTP 200 + `ok:false` > HTTP 4xx/5xx** — quando o invoke client lanca em nao-2xx,
   retornar 200 com campo de erro preserva o `detail` para o frontend exibir.
5. **Binarios como base64 em JSON** — quando o frontend precisa baixar, codificar
   base64 no backend e decodificar no frontend; nao streaming direto.
6. **qpdf no VPS e instavel** — nao confiar em `/misc/repair` automatico. Para PDFs
   corrompidos/escaneados, OCR por visao (Gemini) e mais confiavel.