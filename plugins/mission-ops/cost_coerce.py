"""GPU-VAST-TFA-FIX-01 — coerção tolerante de campos de custo/tempo do state GPU.

Os ledgers/state.json misturam tipos (cost_usd "0.0374", readyAt ISO "...Z", None, lixo).
float() cru no agregado fazia UM campo ruim derrubar o custo inteiro. Aqui cada valor é
coagido isoladamente: ruim → None (quem soma decide o default).
"""

from __future__ import annotations

import calendar
import time
from typing import Any, Optional

_ISO_FORMATS = ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S")


def num(v: Any) -> Optional[float]:
    """float de num/str numérica; None/''/lixo/bool → None."""
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def epoch(v: Any) -> Optional[float]:
    """epoch de num/str numérica/ISO-8601 UTC; None/lixo → None."""
    f = num(v)
    if f is not None:
        return f
    if not isinstance(v, str):
        return None
    s = v.strip().replace("+00:00", "Z")
    for fmt in _ISO_FORMATS:
        try:
            return float(calendar.timegm(time.strptime(s, fmt)))
        except ValueError:
            continue
    return None
