"""MISSION-BATCH-01: despacho em lote determinístico + ready fail-fast.

- lote de 3 missões fake (TempState, herdr mockado): 3 despachos SEQUENCIAIS numa chamada,
  1 falha tolerada (a lista segue), 1 ledger morto convertido pelo anti-fantasma;
- anti-fantasma só age com pane COMPROVADAMENTE morto (vivo/desconhecido = não toca);
- manifesto JSON/YAML/inline, tamanho 2-6, missionId repetido recusado;
- ready-loop: ponte Qwen morta = deadline 45s (não 180s); ponte viva segue 180s.
"""
import json
import os
import threading
import types
import unittest
from pathlib import Path
from unittest import mock

from test_mission_ops import PKG  # noqa: F401  (guard vast_sandbox via test_mission_ops)
import test_mission_ops as T

PKG, mc = T.PKG, T.mc


def _mission(ts, mid):
    prompt = ts.prompt_file(f"{mid}/prompt.md")
    return {"missionId": mid, "promptFile": prompt, "cwd": str(Path(prompt).parent)}


def _script_ok(cwd, mid, tab, pane):
    return {
        f"tab create --cwd {cwd} --no-focus": T.tab_ok(tab, pane),
        f"tab rename {tab} MISSION:{mid}": "",
        f"pane run {pane} *": "",
    }


class _Seq:
    """Envolve o handle_mission_dispatch: registra ordem e concorrência máxima."""

    def __init__(self):
        self.order, self.active, self.max_active = [], 0, 0
        self._lock = threading.Lock()
        self._real = PKG.handle_mission_dispatch

    def __call__(self, args, **kw):
        with self._lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            self.order.append(args["missionId"])
        try:
            return self._real(args, **kw)
        finally:
            with self._lock:
                self.active -= 1


class TestBatchDispatch(unittest.TestCase):
    def setUp(self):
        self._env = mock.patch.dict(os.environ, {"HERDR_PANE_ID": ""})
        self._env.start()

    def tearDown(self):
        self._env.stop()

    def _run(self, missions, script, pane_alive=None):
        seq = _Seq()
        alive = pane_alive or {}
        with mock.patch.object(mc, "run_herdr", T.fake_herdr(script)), \
             mock.patch.object(mc, "wait_output", return_value=(T.READY, None)), \
             mock.patch.object(mc, "deliver_prompt", return_value=(True, None)), \
             mock.patch.object(mc, "pane_exists", side_effect=lambda p: alive.get(p)), \
             mock.patch.object(PKG, "handle_mission_dispatch", seq):
            res = json.loads(PKG.handle_mission_batch({"missions": missions}))
        return res, seq

    def test_three_missions_sequential_one_failure_one_ghost(self):
        with T.TempState() as ts:
            b1, b2, b3 = (_mission(ts, m) for m in ("b1", "b2", "b3"))
            b3["consequence"] = True
            # b3: fantasma real do 29/09 — interrupted com pane morto (sem o lote = no_op eterno)
            mc.save_ledger({"missionId": "b3", "status": "interrupted", "paneId": "w1:pDEAD",
                            "tabId": "t0", "promptFile": b3["promptFile"], "cwd": b3["cwd"],
                            "updatedAt": mc._now()})
            script = {**_script_ok(b1["cwd"], "b1", "t1", "w1:p1"),
                      # b2: tab create falha e não há sourcePaneId -> erro do item
                      f"tab create --cwd {b2['cwd']} --no-focus": {"ok": False, "error": "herdr caiu"},
                      **_script_ok(b3["cwd"], "b3", "t3", "w1:p3")}
            res, seq = self._run([b1, b2, b3], script, pane_alive={"w1:pDEAD": False})

            self.assertEqual(seq.order, ["b1", "b2", "b3"])   # ordem do manifesto
            self.assertEqual(seq.max_active, 1)               # nunca 2 writes no herdr juntos
            self.assertFalse(res["ok"])
            self.assertEqual((res["total"], res["despachadas"], res["falhas"],
                              res["fantasmasLimpos"]), (3, 2, 1, 1))
            self.assertEqual(set(res["tempoPorMissao"]), {"b1", "b2", "b3"})
            self.assertIsInstance(res["tempoTotalS"], float)
            by = {r["missionId"]: r for r in res["itens"]}
            self.assertEqual(by["b1"]["result"], "ok")
            self.assertEqual(by["b1"]["paneId"], "w1:p1")
            self.assertEqual(by["b2"]["result"], "erro")
            self.assertEqual(by["b2"]["error"], "HERDR_TAB_CREATE_FAILED")
            self.assertEqual(by["b3"]["result"], "fantasma-limpo")
            self.assertEqual(by["b3"]["status"], "dispatched")
            self.assertEqual(by["b3"]["paneId"], "w1:p3")
            self.assertEqual(by["b3"]["ghost"]["previousStatus"], "interrupted")
            self.assertEqual(by["b3"]["ghost"]["paneId"], "w1:pDEAD")
            # ledger novo do b3 (re-despacho) + consequence do manifesto repassado
            led3 = mc.load_ledger("b3")
            self.assertEqual((led3["status"], led3["paneId"]), ("dispatched", "w1:p3"))
            self.assertTrue(led3["consequence"])
            self.assertEqual(mc.load_ledger("b1")["status"], "dispatched")
            events = (ts.state / "events.jsonl").read_text()
            self.assertIn('"batch_ghost_cancelled"', events)
            self.assertIn("mission_batch anti-fantasma", events)

    def test_ghost_statuses_dispatching_and_failed(self):
        with T.TempState() as ts:
            b1, b2 = _mission(ts, "b1"), _mission(ts, "b2")
            for m, st in ((b1, "dispatching"), (b2, "failed")):
                mc.save_ledger({"missionId": m["missionId"], "status": st, "paneId": "w1:pX" + st,
                                "promptFile": m["promptFile"], "cwd": m["cwd"]})
            script = {**_script_ok(b1["cwd"], "b1", "t1", "w1:p1"),
                      **_script_ok(b2["cwd"], "b2", "t2", "w1:p2")}
            res, _ = self._run([b1, b2], script,
                               pane_alive={"w1:pXdispatching": False, "w1:pXfailed": False})
            self.assertTrue(res["ok"], res)
            self.assertEqual(res["fantasmasLimpos"], 2)
            self.assertEqual([r["result"] for r in res["itens"]], ["fantasma-limpo"] * 2)
            self.assertEqual({r["ghost"]["previousStatus"] for r in res["itens"]},
                             {"dispatching", "failed"})

    def test_live_or_unknown_pane_is_not_a_ghost(self):
        """interrupted de pane VIVO = missão real (no_op); herdr desconhecido = não adivinha."""
        with T.TempState() as ts:
            b1, b2 = _mission(ts, "b1"), _mission(ts, "b2")
            for m, pane in ((b1, "w1:pLIVE"), (b2, "w1:pUNK")):
                mc.save_ledger({"missionId": m["missionId"], "status": "interrupted",
                                "paneId": pane, "promptFile": m["promptFile"], "cwd": m["cwd"]})
            res, _ = self._run([b1, b2], {}, pane_alive={"w1:pLIVE": True})  # pUNK -> None
            self.assertEqual(res["fantasmasLimpos"], 0)
            self.assertEqual([r["status"] for r in res["itens"]], ["no_op", "no_op"])
            self.assertIn("vivo", res["itens"][0]["ledgerNote"])
            self.assertIn("desconhecido", res["itens"][1]["ledgerNote"])
            self.assertEqual(mc.load_ledger("b1")["status"], "interrupted")

    def test_dispatching_without_pane_only_ghost_when_stale(self):
        with T.TempState() as ts:
            b1, b2 = _mission(ts, "b1"), _mission(ts, "b2")
            mc.save_ledger({"missionId": "b1", "status": "dispatching", "paneId": None,
                            "promptFile": b1["promptFile"], "cwd": b1["cwd"],
                            "updatedAt": "2026-09-29T00:00:00Z"})   # velho = fantasma
            mc.save_ledger({"missionId": "b2", "status": "dispatching", "paneId": None,
                            "promptFile": b2["promptFile"], "cwd": b2["cwd"],
                            "updatedAt": mc._now()})                  # recente = pode estar em curso
            self.assertIsNotNone(PKG._batch_ghost_check("b1")[0])
            led, why = PKG._batch_ghost_check("b2")
            self.assertIsNone(led)
            self.assertIn("pode estar em curso", why)

    def test_item_exception_does_not_abort_batch(self):
        with T.TempState() as ts:
            b1, b2 = _mission(ts, "b1"), _mission(ts, "b2")
            calls = []

            def boom(args, **kw):
                calls.append(args["missionId"])
                if args["missionId"] == "b1":
                    raise RuntimeError("explodiu")
                return json.dumps({"ok": True, "status": "dispatched", "paneId": "w1:p2"})
            with mock.patch.object(PKG, "handle_mission_dispatch", boom):
                res = json.loads(PKG.handle_mission_batch({"missions": [b1, b2]}))
            self.assertEqual(calls, ["b1", "b2"])
            self.assertEqual(res["itens"][0]["error"], "BATCH_ITEM_EXCEPTION")
            self.assertEqual((res["despachadas"], res["falhas"]), (1, 1))


class TestBatchManifest(unittest.TestCase):
    def _items(self, ts, n):
        return [_mission(ts, f"m{i}") for i in range(n)]

    def test_size_bounds(self):
        with T.TempState() as ts:
            for n in (0, 1, 7):
                res = json.loads(PKG.handle_mission_batch({"missions": self._items(ts, n)}))
                self.assertEqual(res.get("error"), "BATCH_SIZE_OUT_OF_RANGE", n)

    def test_duplicate_and_bad_items(self):
        with T.TempState() as ts:
            a = _mission(ts, "a")
            res = json.loads(PKG.handle_mission_batch({"missions": [a, dict(a)]}))
            self.assertEqual(res["error"], "INVALID_MANIFEST")
            self.assertIn("repetido", res["detail"])
            res = json.loads(PKG.handle_mission_batch({"missions": [a, {"missionId": "x"}]}))
            self.assertEqual(res["error"], "INVALID_MANIFEST")
            self.assertEqual(json.loads(PKG.handle_mission_batch({}))["error"], "INVALID_MANIFEST")
            res = json.loads(PKG.handle_mission_batch({"manifest": "/nao/existe.json"}))
            self.assertEqual(res["error"], "INVALID_MANIFEST")

    def test_json_and_yaml_files_and_text(self):
        with T.TempState() as ts:
            items = self._items(ts, 2)
            jp = Path(ts.tmp) / "lote.json"
            jp.write_text(json.dumps({"missions": items}), encoding="utf-8")
            yp = Path(ts.tmp) / "lote.yaml"
            yp.write_text("".join(f"- missionId: {m['missionId']}\n  promptFile: {m['promptFile']}\n"
                                  f"  cwd: {m['cwd']}\n  consequence: false\n" for m in items),
                          encoding="utf-8")
            for src in (str(jp), str(yp), jp.read_text(encoding="utf-8")):
                got, err = PKG._batch_load_manifest({"manifest": src})
                self.assertEqual(err, "", src)
                self.assertEqual([g["missionId"] for g in got], ["m0", "m1"])
            self.assertIs(PKG._batch_load_manifest({"manifest": str(yp)})[0][0]["consequence"], False)


class TestBatchRegistered(unittest.TestCase):
    def test_tool_in_catalog(self):
        reg = {}
        # RD-TESTBASE-01: register() marca o processo como gateway (global PERMANENTE
        # de supervisor_guard) — fixture restaura a marca depois do catálogo.
        _booted_saved = PKG.sg._GATEWAY_BOOTED
        PKG.register(types.SimpleNamespace(
            register_tool=lambda name, toolset, schema, handler: reg.__setitem__(name, (toolset, schema, handler))))
        PKG.sg._GATEWAY_BOOTED = _booted_saved
        self.assertIn("mission_batch", reg)
        toolset, schema, handler = reg["mission_batch"]
        self.assertEqual(toolset, "mission-ops")
        self.assertIs(handler, PKG.handle_mission_batch)
        self.assertIn("manifest", schema["parameters"]["properties"])
        self.assertIn("missions", schema["parameters"]["properties"])


class TestReadyFailFast(unittest.TestCase):
    """Ponte Qwen morta: claude no 8103 não tem ponte para esperar -> ready em 45s, não 180s."""

    def _timeout_dispatch(self, alive):
        clock = {"t": 1_000_000.0, "waits": 0}

        def wait(pane_id, regex, timeout_ms):
            clock["waits"] += 1
            clock["t"] += timeout_ms / 1000.0
            return None, "timeout"
        fake_time = types.SimpleNamespace(time=lambda: clock["t"],
                                          sleep=lambda s: clock.__setitem__("t", clock["t"] + s))
        with T.TempState() as ts:
            m = _mission(ts, "m1")
            script = _script_ok(m["cwd"], "m1", "t1", "w1:pZ")
            with mock.patch.dict(os.environ, {"HERDR_PANE_ID": ""}), \
                 mock.patch.object(mc, "run_herdr", T.fake_herdr(script)), \
                 mock.patch.object(mc, "wait_output", side_effect=wait), \
                 mock.patch.object(mc, "read_output", return_value=("", None)), \
                 mock.patch.object(PKG, "_qwen_bridge_alive", return_value=alive), \
                 mock.patch.object(PKG, "_gpu_up_for_mission", return_value=True), \
                 mock.patch.object(PKG, "time", fake_time):
                res = json.loads(PKG.handle_mission_dispatch(m))
            return res, clock, mc.load_ledger("m1")

    def test_dead_bridge_ready_deadline_45s(self):
        res, clock, led = self._timeout_dispatch(alive=False)
        self.assertEqual(res["error"], "CLAUDE_START_TIMEOUT")
        self.assertIn("45s", res["detail"])
        self.assertEqual(clock["waits"], 3)          # 3 x 15s = 45s (antes: 12 x 15s = 180s)
        self.assertEqual(led["readyDeadlineS"], 45)
        self.assertEqual(led["engine"], "openrouter-fallback")

    def test_live_bridge_keeps_180s(self):
        res, clock, led = self._timeout_dispatch(alive=True)
        self.assertEqual(res["error"], "CLAUDE_START_TIMEOUT")
        self.assertIn("180s", res["detail"])
        self.assertEqual(clock["waits"], 12)
        self.assertEqual(led["readyDeadlineS"], 180)


if __name__ == "__main__":
    unittest.main()
