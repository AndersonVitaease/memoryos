import json

d = json.load(open('/root/.hermes/mission-state/ledger-hygiene-02.json'))
print('status:', d.get('status'))
print('missionId:', d.get('missionId'))
print('paneId:', d.get('paneId'))
print('tabId:', d.get('tabId'))