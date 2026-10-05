#!/usr/bin/env python3
# VIGIA-SESSION-02 (TRINDADE-RESERVA 29/09): auto-nudge com SUPERVISOR DA TRINDADE —
# ao detectar pane parado, consulta nex (/v1/supervisor) com o estado real do pane
# e entrega a ORIENTAÇÃO dele ao worker. Fallback: NUDGE genérico se o supervisor falhar.
# Bounded 30min, máx 1 nudge/2min/pane, log, kill: pkill -f vigia_session.py
import sys, time, json, urllib.request, importlib.util
spec = importlib.util.spec_from_file_location('mission_ops', '/root/.hermes/plugins/mission-ops/__init__.py', submodule_search_locations=['/root/.hermes/plugins/mission-ops'])
PKG = importlib.util.module_from_spec(spec); sys.modules['mission_ops'] = PKG
spec.loader.exec_module(PKG)
mc = PKG.mission_core
PANES = {'w6:p2A': 'bus-guard', 'w6:p2B': 'judge-cred', 'w6:p2C': 'sentinel', 'w6:p2D': 'dupfix'}
NUDGE = ('REGRA: done só com entregáveis pousados (código+testes+relatorio+verify.json). '
         'Narre MENOS, execute MAIS: retome agora o próximo passo concreto do contrato, '
         '1 comando curto por tool call. Se Invalid tool parameters, repita o comando.')
END = time.time() + 1800
last_nudge = {}
log = open('/tmp/vigia-session.log', 'a')

def supervisor_decide(pane_state, mission):
    body = json.dumps({
        'system': 'Supervisor de missão herdr. O worker parou. Dada a última saída do pane, '
                  'devolva UMA orientação curta e imperativa (máx 2 frases) do próximo passo concreto.',
        'question': f'[missão {mission}] Última saída do worker:\n{pane_state[-600:]}'
    }).encode()
    req = urllib.request.Request('http://127.0.0.1:8103/v1/supervisor', data=body,
                                 headers={'Content-Type': 'application/json'})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    return (d.get('content') or '').strip()

while time.time() < END:
    for p, m in PANES.items():
        try:
            t = str(mc.run_herdr(['pane', 'get', p]))
            if 'working' in t:
                continue
            if time.time() - last_nudge.get(p, 0) < 120:
                continue
            r = None
            try:
                tail = str(mc.run_herdr(['pane', 'read', p, '--lines', '10']))
                dec = supervisor_decide(tail, m)
                if dec:
                    r = mc.deliver_prompt(p, dec)
                    log.write(f"{time.strftime('%H:%M:%S')} nudge-supervisor {m} {p} -> {r} :: {dec[:120]}\n")
                    last_nudge[p] = time.time(); log.flush(); continue
            except Exception as e:
                log.write(f"{time.strftime('%H:%M:%S')} supervisor-fail {m}: {str(e)[:100]}\n"); log.flush()
            r = mc.deliver_prompt(p, NUDGE)
            log.write(f"{time.strftime('%H:%M:%S')} nudge {m} {p} -> {r}\n"); log.flush()
            last_nudge[p] = time.time()
        except Exception as e:
            log.write(f"{time.strftime('%H:%M:%S')} erro {m}: {e}\n"); log.flush()
    time.sleep(120)
log.write(f"{time.strftime('%H:%M:%S')} vigia encerrado (horizonte)\n")
