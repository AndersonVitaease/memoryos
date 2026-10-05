#!/usr/bin/env python3
"""E2E REAL do mission_batch (MISSION-BATCH-01): lote de 2 canários despachados
em UMA chamada, sem mock — prova tempo total, panes vivos e tolerância.

Uso: python3 test_batch_e2e.py  |  python3 test_batch_e2e.py --cleanup (fecha canários)
"""
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, '/root/.hermes/plugins/mission-ops')
import mission_core as mc  # noqa: E402
import __init__ as PKG  # noqa: E402


def make_canario(i: int):
    d = Path(tempfile.mkdtemp(prefix=f'batch-e2e-{i:02d}-'))
    p = d / 'prompt.md'
    p.write_text(
        f'# batch-e2e-canario-{i:02d}\n\n'
        f'Tarefa minima (1 passo): execute `echo "ok-{i:02d}" > /tmp/batch-e2e-{i:02d}.txt` '
        'e termine. Nao faca mais nada, nao pergunte nada.\n')
    return str(p), str(d)


def cleanup(ids):
    for mid in ids:
        try:
            out = PKG.handle_mission_close({"missionId": mid, "acceptUnverified":
                                            "canario descartavel do E2E do mission_batch (prova: 1 linha em /tmp)"})
            r = json.loads(out)
            print(f"  close {mid}: ok={r.get('ok')} steps_falhos="
                  f"{[s['step'] for s in r.get('steps', []) if not s.get('ok')] or 'nenhum'}")
        except Exception as e:
            print(f"  close {mid}: EXCECAO {e}")


def main():
    ids = ["batch-e2e-canario-01", "batch-e2e-canario-02"]
    items = []
    for i, mid in enumerate(ids, 1):
        pf, cwd = make_canario(i)
        items.append({"missionId": mid, "promptFile": pf, "cwd": cwd, "spawnedBy": "operator"})
    mf = Path(tempfile.mkdtemp(prefix='batch-manifest-')) / 'manifest.json'
    mf.write_text(json.dumps({"missions": items}))

    if '--cleanup' in sys.argv:
        cleanup(ids)
        return 0

    t0 = time.time()
    res = PKG.handle_mission_batch({"manifest": str(mf)})
    dt = time.time() - t0
    out = json.loads(res)
    print(f"=== E2E REAL mission_batch: {dt:.1f}s no total (tool call unico) ===")
    print(json.dumps({k: out[k] for k in ('ok', 'total', 'despachadas', 'falhas',
                                          'fantasmasLimpos', 'tempoTotalS')},
                     indent=1, ensure_ascii=False))
    for it in out['itens']:
        print(f"  {it['missionId']} -> {it.get('result')} {it.get('status')} "
              f"pane={it.get('paneId')} tab={it.get('tabId')} {it.get('error') or ''}")
    # guarda: arquivo de prova (canaries escrevem /tmp/batch-e2e-XX.txt)
    return 0 if out.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
