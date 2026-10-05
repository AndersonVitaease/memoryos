# OPERATOR HARNESS — doutrina do operator, fonte única (não depende do Hermes)

**Dono:** operator · **Criado:** 05/10/2026 · **Regra:** qualquer agente (Hermes com qualquer modelo, ou outro runtime) lê ESTE repositório antes de atuar como supervisor/worker de missões.

## Mapa das camadas

| Camada | Onde | Runtime-dependente? |
|---|---|---|
| Doutrina (conduta, papéis, fechos) | `doctrine/` + `skills/` deste repo | **NÃO** — markdown/JSON puros |
| Papéis dos modelos | `doctrine/roles.json` (fonte única; cópia de /opt/gpu-bridge/roles.json) | NÃO |
| Tools governadas (mission-ops plugin, fast-router, guard, token, spend) | `/root/.hermes/plugins/mission-ops/` (Python puro; fala com o herdr) | plugin mora no Hermes hoje; cópia versionada em `plugins/` (pendência: sync) |
| Trilhas/audits | `/data/audit/`, `/opt/mission-supervisor/`, ledgers | NÃO — do operator |
| Runtime do agente (chat, modelo, gateway) | Hermes (modelo trocável) | **SIM — trocável sem tocar em nada acima** |

## Doutrina vigente (resumo; detalhe nos arquivos)

1. **CONDUTA-SUP** (`skills/supervisor-conduct.md`): 'verifique' = 1 chamada; provas pesadas só em fecho; supervisor usa rota governada (terminal host-side só p/ dívida com ordem explícita, diagnóstico, plugin/gateway); contorno manual = finding declarado; fail-closed.
2. **ROLES-09 v6** (`doctrine/roles.json`): worker=advisor=classifier=glm-5.3-flash; supervisor=nex-agi/nex-n2.5-pro; judge=JEV jev-1.13; advisor≠judge; não trocar camada sem ordem.
3. **RELATÓRIO-INTEGRA v2**: relatório integral = entregável da missão no herdr (arquivo + verify.json); no chat: resumo em palavras simples + caminho + ack.
4. **ORDENS FIRMES**: tools eng-mcp primeiro; SHIP sempre via missão; close sem entregável mergeado em main = não fecha.
5. **PROMPT-PTBR + HORÁRIO BRT**: prompts/relatórios em português; horários sempre em BRT.
6. **Anti-self-write do token de ordem**: operator gera e provisiona; worker/supervisor nunca gravam o token (só hash no arquivo 0600; agente lê via sudo cat allowlistado).

## Trocando o agente amanhã (runbook)

1. Instalar o runtime novo e apontar skills para `operator-harness/skills/`.
2. Copiar/ligar o plugin mission-ops (Python) ao runtime novo.
3. O herdr, hermes-chat gateway, trilhas e o token de ordem permanecem intocados.
4. Papéis: `doctrine/roles.json` muda só se o operator quiser trocar modelo de papel.

## Pendências

- [ ] Push para repo privado GitHub (precisa do PAT do operator — dívida RD-MOPS-03/RD-MOPS-04).
- [ ] Sync automático skills ↔ este repo (hoje: cópia manual; missão futura).
- [ ] Cópia versionada do plugin mission-ops em `plugins/`.
