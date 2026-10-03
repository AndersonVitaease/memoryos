# RELATÓRIO — TIMER-ACTIVATE-01 (03/10)

Ativação do despertador systemd do consume da fila de intents (ORCH-DAEMON-01).

## Entrega
- `orch-daemon-consume.service` + `.timer` instalados em `/etc/systemd/system/` (staging validado em `/opt/mission-events/quarantine-orch-daemon-01/`).
- `systemctl daemon-reload` + `enable --now orch-daemon-consume.timer` — symlink criado em `timers.target.wants/`.
- Ciclo: a cada 2 min (`OnUnitActiveSec=2min`), `Type=oneshot`, timeout 180s, zero-LLM.

## Prova E2E (real, host-side)
- Suíte do daemon: `node --import tsx --test test/orchestrateConsumeDaemon.test.mjs` → **5/5 pass**.
- Ciclo manual (`systemctl start`): `ok:true, mode:plan, consumed:7, promoted:0` (lock de promoção externo — anti-busy-loop correto).
- **3 Finished** no journal; 2 ciclos NATURAIS do timer (12:19:40 → 12:21:52, próximo 12:23:52), todos gravados no state `/tmp/orchestrator-consumer.daemon.state.json`.

## Nota
- `ProtectHome` não existe no unit staged — o daemon roda com `WorkingDirectory=/opt/memoryos/eng-mcp` e estado em tmpdir (LOCK_PATH/STATE_PATH exportados pelo commit 52cdbe87); nada escondido.
- O diagnostic "29.490 restarts / ProtectHome=yes" referia-se ao daemon ANTIGO (`or-orchestrate-consume`), que permanece inactive — este timer é o substituto determinístico.

## Rollback
```
sudo systemctl disable --now orch-daemon-consume.timer
sudo rm /etc/systemd/system/orch-daemon-consume.{service,timer}
sudo systemctl daemon-reload
```
Staging preservado em `/opt/mission-events/quarantine-orch-daemon-01/`.

## Veredito
PASS — timer ativo, ciclos honestos, rollback documentado. PARE.
