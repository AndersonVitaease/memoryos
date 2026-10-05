# RELATORIO — health-sentinel-red-01 (29/09/2026)

## Diagnóstico
RED sustentado 24860s (red_streak 234) tinha DUAS causas encadeadas, nenhma
doença real do chat:

1. **Porta morta**: a sonda p1_llm batia em `BRIDGE = http://127.0.0.1:8102`
   (herança da era GPU/vLLM). Nada escuta em 8102 desde a migração para
   OpenRouter — o proxy vivo está em **8103** (`OPENROUTER=1 PORT=8103`,
   pid 1616984, upstream openrouter.ai, modelo inclusionai/ling-3.0-flash).
   Resposta em 9ms com http 0 = connection refused imediato.
2. **Payload mínimo insuficiente no modelo novo**: com max_tokens=8/16, o
   ling-3.0-flash gasta reasoning tokens e devolve `finish_reason=length`
   com `content: null` (chat) / "(resposta vazia do modelo)" (messages).
   Medido ao vivo: max_tokens=512 → chat `finish=stop 'Ok'`, messages
   `stop=end_turn 'OK'`.

## Fix (contrato item 3a+3b)
- `health-sentinel.py`: `BRIDGE` 8102 → **8103** (alvo correto atual, sem
  depender de worker de missão — o proxy 8103 é serviço permanente).
- `P1_MAX_TOKENS` 16 → **512** (reserva de saída; alinhado com o fix de
  4096 aplicado no proxy — respostas não são mais cortadas).
- Backups: `health-sentinel.py.bak-health-sentinel-red-01-*` e
  `health-sentinel.state.json.bak-health-sentinel-red-01-*` (29/09).
- Serviço reiniciado (pid antigo 735134 morto; novo ciclo com código fixado).

## Prova
- 3 ciclos consecutivos verdict=**ok** (15:25–15:26), p1_llm verde nas 2 rotas:
  `chat ok 200 'Ok!' finish=stop | messages ok 200 'Ok!' stop=end_turn`.
- state.json: verdict ok, red_streak 0.
- NÃO foi doença real: o chat do Hermes (via ponte) responde ponta-a-ponta.
- AS-IS preservado: ponte 8103, eng-mcp, systemd de missões, GPU — nada tocado.

## Lição
Sonda de liveness precisa acompanhar a topologia da ponte (porta/modelo).
Ao migrar a ponte de porta, atualizar o sentinel no mesmo commit.
