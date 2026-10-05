# RD-SEC-SURFACE-01 — provas comportamentais determinísticas (re-runnable).
# Prova P1..P6 (nada de conteúdo sensível é impresso — só exit codes, sha16 e flags):
#   P1 sudo deny-all implícito: comando FORA da allowlist recusado (id)
#   P2 sudo deny-all implícito: mesma linha, caminho DIFERENTE recusado (cat tokens.json)
#   P3 sudo deny-all implícito: shell via sudo recusado (/bin/sh -c)
#   P4 rota governada do cat segue funcionando (exit 0, saída só de hashes → sha16)
#   P5 connect no agent.sock por uid alheio (nobody 65534) → negado (EACCES)
#   P6 rota governada do socket segue viva: ping pelo socket responde pong (como root)
import hashlib, json, os, socket, subprocess, sys

SUDO = "/usr/bin/sudo"
TOKEN_FILE = "/data/manifests/operator-order-token.json"
SOCK = "/data/host-ops/agent.sock"
UID_AGENT = 994   # eng-mcp-host-ops
UID_FOREIGN = 65534  # nobody

def run_as(uid, argv, timeout=15):
    def preexec():
        os.setgid(994)
        os.initgroups("eng-mcp-host-ops", 994) if uid == 994 else os.setgroups([])
        os.setuid(uid)
    p = subprocess.run(argv, preexec_fn=preexec, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr

def sha16(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]

def ping_socket():
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(SOCK)
    s.sendall(json.dumps({"id": "sec-surface-probe", "op": "ping", "ts": "probe"}).encode() + b"\n")
    buf = b""
    while not buf.endswith(b"\n"):
        chunk = s.recv(4096)
        if not chunk:
            break
        buf += chunk
    s.close()
    return json.loads(buf.decode())

results = {}

# P1..P3 — recusas fora da allowlist (deny-all implícito do sudoers)
for pid, (label, argv) in enumerate([
    ("P1-sudo-id-recusado", [SUDO, "-n", "/usr/bin/id"]),
    ("P2-sudo-cat-outro-caminho-recusado", [SUDO, "-n", "/usr/bin/cat", "/data/tokens.json"]),
    ("P3-sudo-shell-recusado", [SUDO, "-n", "/bin/sh", "-c", "id"]),
], start=1):
    try:
        rc, out, err = run_as(UID_AGENT, argv)
        denied = rc != 0
        results[label] = {"exit": rc, "denied": denied, "stderr_head": err[:160]}
    except subprocess.TimeoutExpired:
        results[label] = {"exit": None, "denied": False, "error": "timeout"}

# P4 — rota governada do cat: exit 0, conteúdo NUNCA impresso (só sha16 + tamanho)
try:
    rc, out, err = run_as(UID_AGENT, [SUDO, "-n", "/usr/bin/cat", TOKEN_FILE])
    results["P4-sudo-cat-token-ok"] = {"exit": rc, "allowed": rc == 0, "out_len": len(out), "out_sha16": sha16(out), "stderr_head": err[:160]}
except subprocess.TimeoutExpired:
    results["P4-sudo-cat-token-ok"] = {"exit": None, "allowed": False, "error": "timeout"}

# P5 — connect por uid alheio → negado
try:
    def preexec_foreign():
        os.setgid(65534)
        os.setgroups([])
        os.setuid(UID_FOREIGN)
    code = subprocess.run(
        [sys.executable, "-c", "import socket;socket.socket(socket.AF_UNIX,socket.SOCK_STREAM).connect('/data/host-ops/agent.sock')"],
        preexec_fn=preexec_foreign, capture_output=True, text=True, timeout=10)
    results["P5-connect-uid-alheio-negado"] = {"exit": code.returncode, "denied": code.returncode != 0, "stderr_head": code.stderr.strip()[:200]}
except subprocess.TimeoutExpired:
    results["P5-connect-uid-alheio-negado"] = {"exit": None, "denied": False, "error": "timeout"}

# P6 — rota governada viva: ping no socket (como root, o cliente do gate)
try:
    pong = ping_socket()
    results["P6-ping-governado-pong"] = {"pong": bool(pong.get("pong")), "version": pong.get("version", pong.get("agentVersion"))}
except Exception as e:
    results["P6-ping-governado-pong"] = {"pong": False, "error": str(e)[:200]}

# Veredito estrutural: recusas (P1,P2,P3,P5) negadas; P4 e P6 permitidos.
ok = all([
    results["P1-sudo-id-recusado"].get("denied"),
    results["P2-sudo-cat-outro-caminho-recusado"].get("denied"),
    results["P3-sudo-shell-recusado"].get("denied"),
    results["P4-sudo-cat-token-ok"].get("allowed"),
    results["P5-connect-uid-alheio-negado"].get("denied"),
    results["P6-ping-governado-pong"].get("pong"),
])
print(json.dumps({"ok": ok, "results": results}, ensure_ascii=False, indent=1))
sys.exit(0 if ok else 1)
