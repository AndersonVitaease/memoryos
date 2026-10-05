# MEMORYOS-SEP-LIVE-01 — SupervisedEngineeringProcess em execução (escopo: runtime backend)

## Contexto
SupervisedEngineeringProcess.ts (gate de completion) foi restaurado e commitado no
/opt/memoryos (b8a2ce43→atual), mas o BACKEND do MemoryOS não foi reiniciado — o código
novo não está carregado. Desconheço qual serviço roda o backend (candidatos: dokploy,
librechat, yarn/v1.22.22 — descobrir).

## Contrato
1. Descubra o serviço runtime do backend MemoryOS (docker ps, pm2, systemd, yarn) — DOCUMENTE.
2. Valide que o código atual (SupervisedEngineeringProcess.ts completo, ~1594 linhas) é o
   que o runtime carrega (bind mount /opt/memoryos → container? build? tsx watch?).
3. Reinicie o serviço com segurança (anuncie no spool antes: sep_restart_begin).
4. Health pós-restart: serviço up + endpoint vivo + (se aplicável) import do módulo sem erro.
5. SE o runtime não existir mais (backend morto/abandonado): NÃO invente — reporte no
   relatório que não há runtime e pare (decisão do operator).

## Provas (verify-memoryos-sep-live-01.json no cwd /opt/memoryos)
- cmd: comando que identifica o serviço + status ativo pós-restart
- cmd: prova de carga do módulo (import/transpile sem erro)
- file: RELATORIO-memoryos-sep-live-01.md

## NÃO tocar
- eng-mcp container (memoryos-eng-mcp) — produção, JÁ atualizado
- /opt/gpu-bridge/**, bridge 8103, or-autonudge