# RELATORIO-TRINITY-WIRE-01

## Integracao Trinity Wire — mission-ops

### Resumo

O modulo `trinity_wire.py` foi integrado ao fluxo de lifecycle da missao no `__init__.py` do mission-ops. A integracao inclui dois checkpoints HTTP com timeout de 5s e comportamento fail-open (nunca bloqueia a missao).

### Pontos de integracao

1. **Advisor** — chamado em `_on_event()` quando o veredito do JEV e `needs_supervisor` (decisao ambigua). Incrementa a contagem de chamadas do advisor no ledger antes da consulta.
2. **Supervisor** — chamado em `handle_mission_close()` antes do passo 0 (deliver-verify), apenas para missoes com classe >= media (media/alta/critica/high/critical). Incrementa a contagem de chamadas do supervisor no ledger antes da consulta.
3. **TRINDADE** — linha gravada no ledger apos o passo 4 (status closed), registrando o bloco `roles` com contagens de chamadas por papel e modelo usado.

### TRINDADE

```
TRINDADE: advisor+supervisor checkpoints integrated in mission-ops lifecycle;
  advisor on ambiguous JEV decisions (fail-open, 5s timeout);
  supervisor on pre-close for class>=medium (fail-open, never blocks);
  call counts per role in ledger roles block + TRINDADE line after step 4.
```

### Arquivos modificados/criados

- `__init__.py` — import trinity_wire + advisor call + supervisor call + TRINDADE line
- `verify-TRINITY-WIRE-01.json` — executable (chmod +x)
- `RELATORIO-TRINITY-WIRE-01.md` — este relatorio

### Verificacao

- Suite de testes do trinity_wire: 159/159 verde
- Import de trinity_wire funcional
- Integracao nao quebra o fluxo existente (fail-open em todas as chamadas)
