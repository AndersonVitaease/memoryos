# BRIDGE-STREAMING-01 — streaming real do upstream (escopo exclusivo: /opt/gpu-bridge)

## Problema
sendSSE é sintético: o claude-CLI só recebe o 1º byte DEPOIS da resposta COMPLETA do
upstream. Turnos longos parecem travados (o operador vê pane mudo minutos).

## Contrato
1. /v1/messages com body.stream=true: quando o cliente pede stream, abrir stream: true
   no upstream OR e re-emitir eventos Anthropic INCREMENTAIS (message_start,
   content_block_start/delta text em tempo real, content_block_stop, message_delta, message_stop).
2. tool_calls vindas em stream: acumular deltas e emitir input_json_delta ao final do bloco.
3. Manter barreiras: barrierOutgoing aplicado ao conteúdo TEXTUAL antes do delta (padrões perigosos
   nunca passam) — tool_use nativo passa pela barreira igual ao caminho não-stream.
4. limitOrReject continua ANTES do upstream (413 fail-closed mantido).
5. Feature flag BRIDGE_STREAM=1 (default ON) — 0 volta ao sendSSE sintético.
6. Retries de empty-response só no caminho não-stream (stream: 1 tentativa, honesto).

## Provas (verify-bridge-streaming-01.json no cwd /opt/gpu-bridge)
- cmd: curl -N com stream:true em /v1/messages (pergunta curta) capturando primeiros bytes
  em <3s (python: medir tempo até 1º evento) — prova de streaming real
- cmd: curl stream:false → resposta completa intacta (compat)
- cmd: stream com tool_use → content_block tool_use íntegro
- file: RELATORIO-bridge-streaming-01.md
Permitido: systemctl restart or-worker-bridge (escopo próprio).

## NÃO tocar
- roles.json, tokenLimit.mjs, rotas advisor/supervisor/judge, /opt/memoryos/**