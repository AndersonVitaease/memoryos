# MISSÃO: DELIVER-VERIFY-01 — SUPERVISOR DE ENTREGA: VERIFICAÇÃO PONTA A PONTA QUANDO MISSÃO ENCERRA

Despacho autorizado pelo operator 26/09 ~15:30Z: "vamos direto para as missões, despache a missão do supervisor e orchestrador de gpu" (junto com GPU-ORCHESTRATOR-01). Pedido original verbatim: "verificar se o que foi entregue realmente está funcionando de ponta a ponta, exatamente para não termos surpresa assim como aconteceu com o photopea".

## O PROBLEMA (lições-âncora, ambas reais)
- Photopea 25/09: judge 5/5 verde + E2E do operator VERMELHO — ele abriu o painel e NÃO VIU NADA. "Pronto só é pronto quando funciona na mão de quem pediu."
- Texto-branco-em-fundo-branco 26/09: "a op aplicou" ≠ "o usuário VÊ". Ninguém conferiu pixels.

O supervisor Hermes faz deep-verify, mas é REATIVO. Falta a camada SISTEMÁTICA: verificar no INSTANTE do encerramento, antes de valer "entregue".

## O QUE CONSTRUIR
1. **Manifesto de provas por missão** (dado, não código): cada missão despachada pode declarar `verify.json` no seu cwd com provas de uso reais:
   - `{"http": [{"url": "...", "expect_status": 200}]}` — URL viva
   - `{"pixels": [{"image": "/caminho.png", "region": [x,y,w,h], "expect": "non_blank"}]}` — entregas visuais (lição do fundo branco)
   - `{"ocr": [{"image": "...", "expect_contains": "TEXTO ESPERADO"}]}` — texto renderizado de verdade (ponte OCR tesseract da VPS, já comprovada)
   - `{"cmd": [{"run": "curl -s ... | grep OK", "expect_exit": 0}]}` — comando E2E
   - `{"file": [{"path": "...", "min_bytes": 100}]}` — artefato com conteúdo
   - `{"service": [{"unit": "xyz.service", "expect": "active"}]}` — serviço de pé
   - `{"bus": [{"event_kind": "...", "since_minutes": 30}]}` — evento aconteceu
2. **Runner determinístico** (`/opt/deliver-verify/verify.py`): lê o manifesto, roda as provas, 0 LLM no caminho feliz, tudo read-only fora do próprio relatório; saída JSON (verdict + failures com mensagem específica: "P2 falhou: pixels em branco na região do texto").
3. **Gatilho no mission_close** (patch no mission-ops): ao fechar missão com manifesto presente → roda verify → VERDE grava badge `verified_e2e` no ledger; VERMELHO → reabre a missão automaticamente com finding no nudge ("REABERTA POR DELIVER-VERIFY: P3 falhou — ...") + evento no bus pro supervisor Hermes.
4. **Integração com a TRINITY (quando GPU ativa):** o supervisor-Qwen pode chamar o verify como tool adicional — mas o verify é determinístico e independente (não depende de LLM).

## PROVAS red-then-green
- P1 red: missão fake com manifesto quebrado (URL morta, arquivo inexistente) → verify VERMELHO com findings corretos.
- P2: missão fake com entrega boa → verified_e2e no ledger.
- P3: gatilho mission_close: missão de teste com manifesto vermelho → REABRE automática + evento bus.
- P4: 0 chamadas LLM no caminho (grep no audit/spool: nenhum evento de modelo).
- P5: latência total <30s por missão com manifesto típico.
- P6: judge 2 rodadas + capture + relatório pt-BR + integração documentada no RUNBOOK do mission-ops.

## GUARDS
- Somente leitura fora do ledger/relatório — nunca mutar a entrega que verifica.
- Verificação é de USO, não de estilo — bug funcional e prova falha contam; capricho estético não (mesma calibração do supervisor.mjs da TRINITY).
- Anti-crash 10KB; cwd: /opt/deliver-verify; não tocar GWS/VOICE.
- missão 100% autônoma; transcript-400 → parar e reportar.
