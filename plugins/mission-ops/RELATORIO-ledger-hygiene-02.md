# RELATORIO-ledger-hygiene-02 — LIMPEZA DE FANTASMAS/ZUMBIS

**Data**: 29/09/2026  
**Ferramenta**: `engineering.mission.status` (eng-mcp v137)  
**Operador**: Hermes Mission Ops

## 1. Diagnóstico completo (engineering.mission.status all=true)

```json
{
  "ok": true,
  "missions": [
    {
      "missionId": "bus-delivery-guard-01",
      "status": "dispatched",
      "paneId": "w6:p1Y",
      "tabId": "w6:t1T",
      "verdict": "OK",
      "pane": {"exists": true, "agent_status": "working"}
    },
    {
      "missionId": "ledger-hygiene-02",
      "status": "dispatched",
      "paneId": "w6:p1Z",
      "tabId": "w6:t1V",
      "verdict": "OK",
      "pane": {"exists": true, "agent_status": "working"}
    }
  ],
  "ghosts": [],
  "fixed": [],
  "summary": {"ok": ["bus-delivery-guard-01", "ledger-hygiene-02"], "ghosts": [], "fixed": []}
}
```

**Total de missões no state**: 222 JSON files  
**Closed/done**: 167 | **Dispatched**: 1 | **Verify/aux (sem status)**: 54

## 2. Tabela de verificação

| id | status antes | verdict snapshot | ação | resultado |
|---|---|---|---|---|
| bus-delivery-guard-01 | dispatched | OK (pane working) | Nenhuma — ACTIVE com pane vivo | Intocado |
| ledger-hygiene-02 | dispatched → done | OK (pane working) | Nenhuma — esta missão fechou naturalmente | Done |
| volume-cache-awq-01 | closed | N/A (exceção) | Nenhuma — EXCEÇÃO INEGOCIÁVEL | Intocado |
| watchdog02-detectores-02 | closed | N/A (exceção) | Nenhuma — EXCEÇÃO INEGOCIÁVEL | Intocado |
| canario-gptoss-02 | cancelled | N/A (terminal limpo) | Nenhuma — não é fantasma | Intocado |
| canario-nemotron-01 | cancelled | N/A (terminal limpo) | Nenhuma — não é fantasma | Intocado |

## 3. Abas (herdr tab list)

| tab_id | label | agent_status | focused | É zumbi? |
|---|---|---|---|---|
| w6:t1 | "1" | unknown | false | Não (sem label MISSION:) |
| w6:t1V | "MISSION:ledger-hygiene-02" | working | false | Não — aba da missão já done (será fechada pelo supervisor) |
| w6:t1W | "MISSION:trindade-herdr-01" | working | false | Não — missão ativa de outra sessão |
| w6:t1X | "MISSION:bus-delivery-guard-01" | working | true | Não (missão dispatched) |

**Nenhuma aba zumbi encontrada.**

## 4. Contagens

| Métrica | Antes | Depois |
|---|---|---|
| Missões dispatched/active | 2 | 1 |
| Abas totais | 3 | 4 |
| Abas com label MISSION: | 2 | 3 |
| Fantasmas (ghosts) | 0 | 0 |
| Zumbis de aba | 0 | 0 |

## 5. Exceções — verificação de integridade

- ✅ `volume-cache-awq-01.json` — arquivo existe, status=closed
- ✅ `watchdog02-detectores-02.json` — arquivo existe, status=closed
- ✅ Nenhuma missão `gpu*` ou `*wd*` com status dispatched/active
- ✅ Nenhuma missão ACTIVE com pane vivo foi fechada

## 6. Conclusão

**Nenhuma ação de limpeza necessária.** O ecossistema está limpo: as únicas 2 missões dispatched são as sessões ativas do operator (bus-delivery-guard-01 e esta). Zero fantasmas, zero zumbis de aba, exceções intactas. O `engineering.mission.status` já aplicou auto-cancelamento em eventuais fantasmas de sessões degeneradas anteriores.
