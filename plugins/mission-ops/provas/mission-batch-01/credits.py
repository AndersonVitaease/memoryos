#!/usr/bin/env python3
"""Snapshot de créditos OpenRouter (read-only, /api/v1/credits). Uso: credits.py <saida.json>.
A chave é lida do OPENROUTER_KEY_FILE da unit or-worker-bridge — nunca impressa."""
import json, re, sys, urllib.request as u
unit = open("/etc/systemd/system/or-worker-bridge.service", encoding="utf-8").read()
key = open(re.search(r"Environment=OPENROUTER_KEY_FILE=(\S+)", unit).group(1)).read().strip()
req = u.Request("https://openrouter.ai/api/v1/credits", headers={"Authorization": "Bearer " + key})
body = u.urlopen(req, timeout=15).read().decode()
open(sys.argv[1], "w").write(body)
d = json.loads(body)["data"]
print(f"total_credits={d['total_credits']} total_usage={d['total_usage']:.4f}")
