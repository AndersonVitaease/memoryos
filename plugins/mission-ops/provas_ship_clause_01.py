"""Prova SHIP-CLAUSE-01 — grep da frase-âncora no body renderizado da DISPATCH_TEMPLATE.

Roda a partir do cwd do plugin. Saída: linha final ANCHOR-OK <len> quando a
frase-âncora está no body e o body cabe no DISPATCH_INLINE_LIMIT; exit 1 caso contrário.
"""
import sys

import mission_core

FRASE_ANCORA = 'Entregável só na branch do worktree = FAIL, mesmo com suíte verde'


def main() -> int:
    body = mission_core.DISPATCH_TEMPLATE.format(
        prompt_file='/x/missao.md', mission_id='M')
    idx = body.find(FRASE_ANCORA)
    print(f"len(body)={len(body)} limit={mission_core.DISPATCH_INLINE_LIMIT} "
          f"idx_anchor={idx}")
    if idx < 0:
        print("ANCHOR-FAIL")
        return 1
    if len(body) > mission_core.DISPATCH_INLINE_LIMIT:
        print("ANCHOR-FAIL (body > limit)")
        return 1
    print("ANCHOR-OK")
    return 0


if __name__ == '__main__':
    sys.exit(main())
