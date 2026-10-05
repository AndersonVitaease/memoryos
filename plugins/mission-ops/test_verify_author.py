"""VERIFY-MANIFEST-01 — mission_verify_author: verify.json gerado de prova REAL.

Casos: geração a partir de relatório real (fixture judge-deploy-01: relatório + verify.json
feito à mão já existem), sem relatório (recusa honesta), sobrescrever sem force (recusa),
provenance correto (report|prompt|inferred), segurança (segredo/efeito colateral/inexistente
nunca entram), red→green natural (manifesto gerado roda no runner logo após gravar).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_mission_ops import PKG, TempState, mc  # noqa: E402
from test_mission_list_compacto import tools  # noqa: E402

va = getattr(PKG, "va", None)  # None no HEAD pré-patch → red por caso
JUDGE_CWD = "/opt/memoryos/eng-mcp"
JUDGE_REPORT = os.path.join(JUDGE_CWD, "relatorio-judge-deploy-01.md")
JUDGE_PROMPT = os.path.join(JUDGE_CWD, "missao-judge-deploy-01.md")
JUDGE_EVID = os.path.join(JUDGE_CWD, "evidence", "judge-deploy-01")


def author_tool(args):
    return json.loads(tools()["mission_verify_author"][1](args))


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def specs(manifest):
    return [s for v in manifest.values() for s in v]


class _Cwd:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="verify-author-")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write(self, name, text, mode=None):
        p = os.path.join(self.dir, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        if mode is not None:
            os.chmod(p, mode)
        return p


@unittest.skipUnless(os.path.isfile(JUDGE_REPORT) and os.path.isfile(JUDGE_PROMPT),
                     "fixture judge-deploy-01 ausente")
class TestJudgeDeployFixture(unittest.TestCase):
    def _ledger(self):
        mc.save_ledger({"missionId": "judge-deploy-01", "status": "closed", "cwd": JUDGE_CWD,
                        "promptFile": JUDGE_PROMPT, "paneId": "w5:p19"})

    def test_existing_manifest_refused_without_force_and_untouched(self):
        with TempState():
            self._ledger()
            before = sha(os.path.join(JUDGE_CWD, "verify.json"))
            j = author_tool({"missionId": "judge-deploy-01"})
            self.assertFalse(j["ok"])
            self.assertEqual(j["error"], "VERIFY_JSON_EXISTS")
            self.assertFalse(j["written"])
            self.assertIn("(proposto)", j["diff"])          # diff sempre mostrado
            self.assertEqual(sha(os.path.join(JUDGE_CWD, "verify.json")), before)

    def test_generation_matches_hand_authored_manifest(self):
        with TempState():
            self._ledger()
            before = sha(os.path.join(JUDGE_CWD, "verify.json"))
            j = author_tool({"missionId": "judge-deploy-01", "force": True, "dryRun": True})
            self.assertTrue(j["ok"])
            self.assertFalse(j["written"])
            self.assertEqual(sha(os.path.join(JUDGE_CWD, "verify.json")), before)
            prop = va.author("judge-deploy-01", JUDGE_CWD, JUDGE_PROMPT)["manifest"]
            runs = [s["run"] for s in prop["cmd"]]
            paths = [s["path"] for s in prop["file"]]
            # itens do manifesto feito à mão (supervisor-side) reencontrados a partir da prova
            self.assertIn(os.path.join(JUDGE_EVID, "smoke-judge.sh"), runs)
            self.assertTrue(any("docker inspect memoryos-eng-mcp" in r and
                                "eng-mcp-candidate:candidate-20260928142849307-7ae70943a081" in r
                                for r in runs))
            self.assertEqual([s["unit"] for s in prop["service"]], ["eng-mcp-release-runner"])
            self.assertEqual(prop["service"][0]["expect"], "active")
            for f in ("smoke-response.json", "pipeline-call-resume-1.json"):
                self.assertIn(os.path.join(JUDGE_EVID, f), paths)
            self.assertIn(JUDGE_REPORT, paths)
            # desvio declarado no relatório: unit engmcp NÃO existe → nunca vira spec
            self.assertNotIn("engmcp", json.dumps(prop))
            # segredos nunca entram
            self.assertNotIn(".claude.json", json.dumps(prop))
            self.assertNotIn("post-release-state.json", json.dumps(prop))   # 0600
            skipped = {s["candidate"]: s["reason"] for s in j["skipped"]}
            self.assertEqual(skipped["engmcp"], "unit inexistente no systemd")
            for s in specs(prop):
                self.assertIn(s["_provenance"], ("report", "prompt", "inferred"))
                self.assertTrue(s["_source"])


class TestRefusals(unittest.TestCase):
    def test_no_report_refused_nothing_written(self):
        with TempState(), _Cwd() as c:
            c.write("missao-m-norep.md", "## Tarefas\n- crie `/etc/hostname`\n")
            mc.save_ledger({"missionId": "m-norep", "status": "closed", "cwd": c.dir})
            j = author_tool({"missionId": "m-norep"})
            self.assertFalse(j["ok"])
            self.assertEqual(j["error"], "NO_REPORT")
            self.assertFalse(os.path.exists(os.path.join(c.dir, "verify.json")))

    def test_no_ledger_no_cwd(self):
        with TempState():
            j = author_tool({"missionId": "ghost-01"})
            self.assertEqual(j["error"], "NO_LEDGER")

    def test_overwrite_requires_force(self):
        with TempState(), _Cwd() as c:
            ev = c.write("out.txt", "x" * 50)
            c.write("relatorio-m-ow.md", "# R\n- evidência: `%s`\n%s" % (ev, "." * 600))
            vj = c.write("verify.json", '{"file": [{"path": "/etc/hostname"}]}\n')
            mc.save_ledger({"missionId": "m-ow", "status": "closed", "cwd": c.dir})
            before = sha(vj)
            j = author_tool({"missionId": "m-ow"})
            self.assertEqual(j["error"], "VERIFY_JSON_EXISTS")
            self.assertIn("-{\"file\": [{\"path\": \"/etc/hostname\"}]}", j["diff"])
            self.assertEqual(sha(vj), before)
            j = author_tool({"missionId": "m-ow", "force": "true"})
            self.assertTrue(j["ok"] and j["written"])
            with open(vj, encoding="utf-8") as f:
                self.assertIn(ev, f.read())
            self.assertEqual(j["verify"]["verdict"], "pass")

    def test_dry_run_does_not_write(self):
        with TempState(), _Cwd() as c:
            ev = c.write("out.txt", "x" * 50)
            c.write("RELATORIO-m-dry.md", "# R\n`%s`\n" % ev)
            mc.save_ledger({"missionId": "m-dry", "status": "closed", "cwd": c.dir})
            j = author_tool({"missionId": "m-dry", "dryRun": True})
            self.assertTrue(j["ok"])
            self.assertFalse(j["written"])
            self.assertTrue(j["diff"].startswith("--- /dev/null"))
            self.assertFalse(os.path.exists(os.path.join(c.dir, "verify.json")))


REPORT = """# RELATÓRIO m-prov
## 1. Entrega
- arquivo gerado: `{a}` e também `{both}`
- prova: `test -f {a}` → `ok`
- `grep -q ok {a}` passou; `rm -rf {cwd}/tmp` limpou; deploy via `engineering.release.pipeline`
- inexistente citado: `{cwd}/nao-existe.json`; token em `{secret}`
- a unit `fake-active.service` está active; a `fake-down.service` fica inativa por design
- a unit `fake-mute.service` foi citada sem estado; `ghost-unit.service` está active
"""

PROMPT = """# MISSÃO m-prov
## Contexto
- leia `{ctx}`
## Tarefas
- grave `{p}` e `{both}`
- NÃO toque em `{neg}`
## Regras
- mantenha `{rule}`
## Relatório final
`{cwd}/relatorio-m-prov.md`
"""


def _probe(unit):
    return "loaded" if unit.startswith("fake-") else "not-found"


class TestProvenance(unittest.TestCase):
    def _fixture(self, c):
        f = {k: c.write("%s.txt" % k, "ok\n" * 10) for k in ("a", "both", "p", "neg", "rule", "ctx")}
        f["secret"] = c.write("db.token.json", "{}" * 10)
        f["cwd"] = c.dir
        c.write("relatorio-m-prov.md", REPORT.format(**f) + "\n" + "." * 600)
        prompt = c.write("missao-m-prov.md", PROMPT.format(**f))
        return f, prompt

    def test_provenance_and_safety(self):
        with _Cwd() as c:
            f, prompt = self._fixture(c)
            r = va.author("m-prov", c.dir, None, probe=_probe)
            self.assertEqual(r["prompt"], prompt)
            by = {s.get("path") or s.get("run") or s.get("unit"): s for s in specs(r["manifest"])}
            prov = {k: v["_provenance"] for k, v in by.items()}
            self.assertEqual(prov[f["a"]], "report")
            self.assertEqual(prov[f["both"]], "report")     # report vence prompt no dedupe
            self.assertEqual(prov[f["p"]], "prompt")
            rep = os.path.join(c.dir, "relatorio-m-prov.md")
            self.assertEqual(prov[rep], "prompt")             # citado no Relatório final
            for k in ("neg", "rule", "ctx"):                  # negação / Regras / Contexto
                self.assertNotIn(f[k], by)
            self.assertNotIn(f["secret"], by)
            self.assertNotIn(os.path.join(c.dir, "nao-existe.json"), by)
            runs = [s["run"] for s in r["manifest"]["cmd"]]
            self.assertTrue(any(x.endswith("grep -q ok %s" % f["a"]) for x in runs))
            self.assertTrue(any("o=$(test -f %s 2>&1)" % f["a"] in x and "grep -qF -- ok" in x
                                for x in runs))
            self.assertFalse(any("rm -rf" in x or "engineering." in x for x in runs))
            self.assertEqual(by["fake-active.service"]["expect"], "active")
            self.assertEqual(by["fake-down.service"]["expect"], "inactive")   # lição oom-e2e
            self.assertNotIn("fake-mute.service", by)
            self.assertNotIn("ghost-unit.service", by)
            reasons = {s["candidate"]: s["reason"] for s in r["skipped"]}
            self.assertIn("efeito colateral", reasons["rm -rf %s/tmp" % c.dir])
            self.assertEqual(reasons[f["secret"]], "caminho de segredo")
            self.assertEqual(reasons[os.path.join(c.dir, "nao-existe.json")], "inexistente")
            self.assertIn("sem estado declarado", reasons["fake-mute.service"])
            self.assertEqual(reasons["ghost-unit.service"], "unit inexistente no systemd")
            self.assertEqual(r["provenance"], {
                "report": sum(1 for s in specs(r["manifest"]) if s["_provenance"] == "report"),
                "prompt": sum(1 for s in specs(r["manifest"]) if s["_provenance"] == "prompt")})

    def test_prose_fragments_never_become_cmd(self):
        """Dogfood (relatório desta missão): menções em prosa viravam cmd e davam vermelho falso."""
        with _Cwd() as c:
            ev = c.write("out.txt", "ok\n")
            c.write("relatorio-m-frag.md", "# R\n"
                    "- filtro: `curl -X/-d` e `curl -s -o /tmp/x http://h`\n"
                    "- prova falsa (`grep -q SUCESSO` em arquivo) e `sha256sum -c` OK\n"
                    "- alheio: `grep -q x src/judge.ts`\n"
                    "- real: `grep -q ok %s` e `git status`\n%s" % (ev, "." * 600))
            r = va.author("m-frag", c.dir, None, probe=_probe)
            runs = [s["run"] for s in r["manifest"]["cmd"]]
            self.assertEqual(runs, ["cd %s && grep -q ok %s" % (c.dir, ev),
                                    "cd %s && git status" % c.dir])
            reasons = {s["candidate"]: s["reason"] for s in r["skipped"]}
            self.assertIn("efeito colateral", reasons["curl -X/-d"])
            self.assertIn("efeito colateral", reasons["curl -s -o /tmp/x http://h"])
            self.assertIn("leria stdin", reasons["grep -q SUCESSO"])
            self.assertIn("leria stdin", reasons["sha256sum -c"])
            self.assertIn("operando inexistente", reasons["grep -q x src/judge.ts"])

    def test_inferred_fallback_for_uncited_report(self):
        with _Cwd() as c:
            c.write("relatorio-m-inf.md", "# R\nsem citações\n" + "." * 600)
            r = va.author("m-inf", c.dir, None, probe=_probe)
            self.assertEqual(r["manifest"], {"file": [{
                "path": os.path.realpath(os.path.join(c.dir, "relatorio-m-inf.md")),
                "min_bytes": 500, "_provenance": "inferred", "_source": "runner:relatorio"}]})

    def test_red_natural_when_claim_false(self):
        """PROOF-LINT-03 (atualiza VERIFY-MANIFEST-01): prova falsa NÃO é gravada —
        o rehearsal roda a prova 1x de verdade, exit ≠ 0 → REHEARSAL_EXIT_NONZERO
        sem force (o vermelho natural do runner agora acontece ANTES de gravar)."""
        with TempState(), _Cwd() as c:
            ev = c.write("out.txt", "nada aqui\n")
            c.write("relatorio-m-red.md", "# R\n- `grep -q SUCESSO %s` passou\n%s" % (ev, "." * 600))
            mc.save_ledger({"missionId": "m-red", "status": "closed", "cwd": c.dir})
            j = author_tool({"missionId": "m-red"})
            self.assertFalse(j["ok"])
            self.assertEqual(j["error"], "REHEARSAL_EXIT_NONZERO")
            self.assertFalse(os.path.exists(os.path.join(j["manifestPath"])))
            evf = mc.STATE_DIR / "events.jsonl"
            ev_events = []
            if evf.exists():
                with open(evf, encoding="utf-8") as f:
                    ev_events = [json.loads(l) for l in f]
            self.assertNotIn("verify_manifest_authored", [e["event"] for e in ev_events])


if __name__ == "__main__":
    unittest.main()
