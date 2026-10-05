#!/usr/bin/env python3
"""SHIP-ENG-MCP-04 — prova do release-state.json (artefato do runner).

Asserta: testStatus PASS, failed 0, commitSha/testedHeadSha = head shipado,
buildStatus PASS, candidateToolCount 150, imageTag do head.
Exit 0 = prova OK.
"""
import json
import sys

STATE = "/opt/memoryos/eng-mcp/release-state.json"
HEAD = "9ad21732ae2ea51d78d9f7c6963d6ddf3133f7bb"

d = json.load(open(STATE))
checks = {
    "testStatus": d.get("testStatus") == "PASS",
    "failed==0": d.get("failed") == 0,
    "tests==1773": d.get("tests") == 1773,
    "commitSha": d.get("commitSha") == HEAD,
    "testedHeadSha": d.get("testedHeadSha") == HEAD,
    "buildStatus": d.get("buildStatus") == "PASS",
    "candidateToolCount==150": d.get("candidateToolCount") == 150,
    "imageTag": d.get("imageTag") == f"eng-mcp-candidate:commit-{HEAD}",
    "treeClean": d.get("treeClean") is True,
}
for k, v in checks.items():
    print(f"{k}: {'OK' if v else 'FAIL'}")
sys.exit(0 if all(checks.values()) else 1)
