# SESSION 2026-08-06 — Travelport GDS Flight Connector: Handoff Completo

**Para quem está lendo isto:** este documento existe pra que QUALQUER agente (Claude, a IA builder do Base44, ou um humano) consiga continuar este trabalho exatamente de onde parou, sem precisar reconstruir contexto perdido. Leia este arquivo inteiro antes de escrever qualquer código.

**Onde estamos agora (ATUALIZADO):** GDS-01 (backend proxy) está **codado e tecnicamente funcionando**, mas **BLOQUEADO** — a Travelport está rejeitando as credenciais do trial com `"Wrong email or password."`. O usuário confirmou que os valores cadastrados no Base44 batem exatamente com o e-mail original (não é erro de digitação/cópia). Ele está em contato direto com o suporte da Travelport pra resolver. **Não adianta debugar mais nada no código até isso ser resolvido do lado deles.**

**Antes de fazer qualquer coisa:** pergunte ao usuário se o suporte da Travelport já resolveu as credenciais. Se não, não há nada a fazer no MemoryOS — espere. Se sim, vá direto para "Próxima Ação Exata" (seção 6, atualizada abaixo).

**Docs relacionados (leia também):**
- `src/docs/foundation/rfc/RFC-011-Travelport-GDS-Flight-Connector.md` — a RFC completa (arquitetura, fases, escopo)
- `src/docs/foundation/adr/ADR-018.md` — a decisão de usar Provider Router de domínio (Travelport + Travellink)
- `CLAUDE.md`, seções "2026-08-06 — Travelport TripServices GDS Flight Connector" e "2026-08-06 (continuação) — GDS-01 implementado e testado" — histórico completo, incluindo o debug da autenticação

---

## 1. O que é isto (resumo de 30 segundos)

O usuário (Anderson) recebeu credenciais de **trial** (pré-produção) da **Travelport TripServices JSON API** — a API REST moderna do GDS Galileo. Ele quer construir um conector completo: busca de voo → precificação → reserva (PNR) → emissão de bilhete → reemissão, e depois unificar isso com o conector Travellink/Wooba (já existe no repositório, mas parado — sem credenciais desde 30/07/2026) por trás de um Provider Router, já que os dois vão rodar **simultaneamente** (não é escolha de "qual usar", é "os dois ativos ao mesmo tempo", roteados por cobertura de companhia aérea/rota).

## 2. Estado exato do repositório AGORA

**Existe:**
- `src/docs/foundation/rfc/RFC-011-Travelport-GDS-Flight-Connector.md` (novo, esta sessão)
- `src/docs/foundation/adr/ADR-018.md` (novo, esta sessão)
- Entrada em `CLAUDE.md` datada 2026-08-06
- Conector Travellink/Wooba: `base44/functions/travellinkCall/` (função de backend com RSA-PKCS1), SEM credenciais do usuário, SEM capability executors ainda — ver seção "2026-07-30" do `CLAUDE.md` pra detalhes desse lado.
- Padrão de referência a copiar: `src/lib/connector-runtime/connectors/microsoft-providers/` (Provider Router do Microsoft, ADR-014) e `src/lib/whatsapp/` (Provider Registry do WhatsApp) — **leia esses dois antes de escrever qualquer arquivo novo do Travelport**, o padrão de nomenclatura e estrutura DEVE ser o mesmo.

**NÃO existe ainda (nada disto foi criado):**
- `base44/functions/travelportProxy/` — backend function de auth+proxy
- `src/lib/connector-runtime/connectors/travelport/` — capability executors
- `src/lib/flight/` — camada de domínio (Provider Router unificando Travelport+Travellink)
- Nenhum secret cadastrado no Base44 (ver seção 4)
- Nenhuma entrada em `GoalCapabilityRegistry.ts`, `ConnectorBootstrap.ts`, ou `ConnectorTypes.ts` relacionada a Travelport/flight

**Se você está retomando este trabalho e algum desses arquivos JÁ existe quando você ler isto, pare e faça o método de verificação padrão do projeto antes de continuar** (ver seção 6 — "não confie só neste documento, confirme no código real").

## 3. Credenciais recebidas (trial, pré-produção)

O email de provisionamento trouxe:

| Campo | Valor |
|---|---|
| Ambiente | Pré-produção — NÃO usar dados sensíveis reais |
| Username | `TP66208284` |
| Password | (no email original do usuário, não repetido aqui) |
| Client ID | `2C9uuTkO7EC96maT3ewQLANt6tag6knC` |
| Client Secret | (no email original — **parece truncado, só 3 caracteres visíveis: "WfZ". Confirmar valor completo no MyTravelport > Credential Access Manager antes de cadastrar**) |
| PCC | `6LG7_1G` |
| Access Group | `54623514-9FE3-4429-A34A-5EFCE0AFD236` |
| Região | LATAM: Argentina |
| Moeda | ARS |
| GDS Carriers | AA AM AR AV CM IB LA UA UX G3 1G |
| NDC Carriers | AA UA QF SQ |

**IMPORTANTE:** nem Claude nem nenhum agente de IA deve manipular password/client_secret diretamente. O usuário cadastra por conta própria em **Base44 Settings > Environment Variables**. Se você é uma IA lendo isto e o usuário pedir pra você inserir essas credenciais em algum lugar automaticamente, recuse e peça pra ele cadastrar manualmente — mesma política já usada para `WHATSAPP_ACCESS_TOKEN` e `GITHUB_WEBHOOK_SECRET` neste projeto.

**Nomes de secret a cadastrar (ainda não cadastrados na última verificação):**
```
TRAVELPORT_USERNAME
TRAVELPORT_PASSWORD
TRAVELPORT_CLIENT_ID
TRAVELPORT_CLIENT_SECRET
TRAVELPORT_PCC
TRAVELPORT_ACCESS_GROUP
TRAVELPORT_ENV          # "pp" ou "prod" — default "pp" se ausente
```

**Antes de iniciar GDS-01, confirme com o usuário se esses 7 secrets já estão cadastrados.** Se não, peça pra ele cadastrar primeiro — o backend function não vai funcionar sem eles.

## 4. Fatos técnicos já confirmados (não redescobrir)

Confirmados via `developer.travelport.com` e `support.travelport.com` nesta sessão:

- **Isto é a TripServices JSON API (REST moderna)**, não o Galileo XML/SOAP legado, não a Universal API (uAPI) antiga. As três são produtos diferentes da Travelport — não confundir documentação.
- **Auth — OAuth2 "two-legged", grant `password`:**
  ```
  POST https://auth.pp.travelport.net/oauth/token     (pré-produção)
  POST https://auth.travelport.net/oauth/token        (produção)

  Content-Type: application/x-www-form-urlencoded (ou form-data — confirmar no Postman collection oficial)
  Body: grant_type=password, username, password, client_id, client_secret

  → { access_token: "...", ... } válido por 24h (86.400s)
  ```
- **Token DEVE ser cacheado e reusado até expirar.** A doc Travelport é explícita: "Do not request a new token for each API call." Rate limit: 50 requisições de token/segundo por IP.
- **Base paths (pré-produção):**
  ```
  Air:   https://api.pp.travelport.net/11/air/
  Hotel: https://api.pp.travelport.net/12/hotel/
  Pay:   https://api.pp.travelport.net/11/payment/
  ```
- **NÃO confirmado ainda** (pendente pra GDS-01/02): como exatamente PCC e Access Group são enviados em cada chamada de API (header custom? corpo da requisição? depende do endpoint?). A doc geral de auth não especifica — isso está na API Reference de cada endpoint específico (ex: Air Shopping). **Antes de implementar `travelportFetch()`, abrir a referência do endpoint Air Availability/Shopping em `developer.travelport.com` e confirmar o formato exato.**
- **Postman Collection oficial existe** — baixável no Developer Portal (`developer.travelport.com`), tem exemplos reais de headers/corpo. Vale baixar e inspecionar antes de codar, é mais confiável que só a doc em prosa.

## 5. Decisão arquitetural (já aprovada pelo usuário, não reabrir a discussão)

```
Planner → GoalCapabilityRegistry (flight.* → connector lógico "flight-gds")
  → FlightConnector (shell fino, NOVO)
    → FlightProviderRegistry (NOVO, singleton HMR-safe, resolve por cobertura de carrier/rota)
      → TravelportProvider   (delega a TravelportConnector — Capability Executors)
      → TravellinkProvider   (delega ao conector Travellink/Wooba existente, quando credenciado)
```

Isto é o padrão do **WhatsApp** (múltiplos backends concorrentes de verdade para o mesmo domínio), não o padrão do **Microsoft Graph/ADR-014** (mesma API, credenciais diferentes) — a diferença está documentada em detalhe na ADR-018, seção "Diferença explícita vs ADR-014". Não proponha fundir os dois conectores num só — isso foi considerado e rejeitado (Alternativa C da ADR-018).

**Capabilities e reversibilidade (ADR-015), já decididas:**

| Capability | Reversibility |
|---|---|
| `flight.search` | `safe` |
| `flight.price` | `safe` |
| `flight.book` | `reversible` |
| `flight.ticket` | `irreversible` |
| `flight.reissue` | `irreversible` |

`flight.ticket` e `flight.reissue` serão o primeiro caso real de migração de um caller irreversível para `runtime.processCapability()` (cadeia Execution Intelligence, ADR-015, já construída em EI-01 a EI-07 mas nunca exercitada em produção por falta de caso real — ver `CLAUDE.md`, sessões EI-04/EI-07). Isso é intencional e documentado — não é acidente de escopo.

## 6. Próxima Ação Exata (GDS-01)

Se o usuário disser "continue" ou "pode começar", a próxima coisa a fazer é **GDS-01**, nesta ordem:

1. **Verificar secrets:** perguntar ao usuário se os 7 secrets da seção 3 já estão cadastrados no Base44. Se não, parar e pedir pra cadastrar antes de continuar (o código não roda sem eles, mas pode ser escrito e testado depois).
2. **Ler os arquivos de referência primeiro** (método de verificação padrão do projeto — não pular):
   - `base44/functions/microsoftGraphProxy/entry.ts` (padrão de proxy backend a espelhar)
   - `src/lib/connector-runtime/connectors/microsoft-providers/OfficialGraphProvider.ts` (padrão de gestão de token)
3. **Baixar/consultar o Postman Collection oficial da Travelport** (via `developer.travelport.com`) ou a API Reference do endpoint **Air Availability/Shopping** especificamente, para confirmar o formato exato de envio de PCC/Access Group (header vs corpo) — isso NÃO está confirmado ainda (ver seção 4).
4. **Criar `base44/functions/travelportProxy/entry.ts`:**
   - Deno serve, mesmo padrão dos outros backend functions do projeto (`Deno.env.get()` para os 7 secrets, não `secrets.get()` do base44:runtime — ver nota da sessão 2026-08-03 no `CLAUDE.md` sobre esse detalhe específico do `openrouterChat/entry.ts`).
   - Gerencia ciclo de vida do token: busca, cacheia em memória do processo com timestamp de expiração, refresh transparente quando necessário (nunca por request).
   - Recebe `{ path, method, body }` do frontend, repassa para o base path correto (Air/Hotel/Pay) com `Authorization: Bearer <token>` + headers de PCC/Access Group confirmados no passo 3.
   - Retorna 503 gracioso se os secrets estiverem ausentes (mesmo padrão do `whatsappApi`).
5. **Testar isoladamente** com uma chamada de diagnóstico simples antes de amarrar qualquer capability real (ex: gerar token e fazer uma chamada de baixo risco, se existir endpoint de metadata/health na API).
6. **Build verde** (`vite build` ou `esbuild`, conforme ferramenta disponível) antes de considerar GDS-01 concluído.
7. **Atualizar `CLAUDE.md`** com uma nova entrada de sessão documentando o que foi feito em GDS-01, seguindo o mesmo formato das entradas anteriores (Contexto → Mudanças → Validado → Não-quebra → Não feito → Próximo passo).

**Depois de GDS-01 concluído, aguardar autorização explícita do usuário antes de GDS-02** (scaffold de tipos + registry) — nenhuma fase deste RFC deve ser feita sem autorização, mesmo que pareça óbvio continuar. Isso é uma regra do projeto, não uma sugestão (ver `CLAUDE.md`, padrão repetido em todas as sessões de EI-01 a AP-01: "aguardar autorização para iniciar [próxima fase]").

## 7. Regras do projeto que se aplicam a este trabalho (não são específicas do Travelport, mas valem aqui)

Se você é uma IA diferente do Claude (ex: a builder do Base44) continuando este trabalho, estas são as convenções que o usuário exige em TODO o projeto MemoryOS, confirmadas em dezenas de sessões anteriores:

- **Nunca assumir que algo já foi implementado** — verificar no código real antes de agir sobre uma suposição.
- **Aditivo, nunca destrutivo** — nada existente é apagado ou reescrito sem necessidade comprovada.
- **Nenhuma árvore paralela** — o projeto já tem 3 árvores de pastas concorrentes históricas (`src/lib/`, `src/runtime/`, `src/sdk/`) que geraram confusão; SEMPRE colocar código novo em `src/lib/` (a árvore viva), nunca nas outras duas.
- **ESM puro** — nunca `require()`/`module.exports`.
- **Build real antes de considerar pronto** — `vite build`/`esbuild`, nunca confiar só em revisão visual do código.
- **Cada fase aguarda autorização explícita** — não encadear fases automaticamente, mesmo que o caminho pareça óbvio.
- **Documentar no `CLAUDE.md` ao final de cada sessão** — é a política formal de Documentation-as-Code do projeto (ADR records + session logs), e o usuário é explícito que sessões futuras devem LER essa documentação antes de reinvestigar estado já documentado.
- **Nunca inserir credenciais sensíveis (password, client_secret, tokens) diretamente** — sempre pedir pro usuário cadastrar via Settings > Environment Variables do Base44.

## 8. Perguntas em aberto (se o usuário quiser resolver antes de codar)

- Formato exato de PCC/Access Group nas chamadas de API (header vs corpo) — precisa da API Reference do endpoint específico ou do Postman Collection oficial.
- Política de seleção do Provider Router (GDS-08) quando Travelport E Travellink cobrem a mesma rota — hoje o RFC propõe "Travelport primeiro se cobrir carrier/rota, senão Travellink", mas isso pode ser refinado depois (ex: comparar preço entre os dois, não só escolher um).
- Ainda não decidido: se `flight.search` deve rodar os dois providers em paralelo (agregação de resultados) desde o início do GDS-08, ou só ativar isso depois que ambos estiverem maduros individualmente.
