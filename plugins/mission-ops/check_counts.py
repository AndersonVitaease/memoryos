import json, glob, subprocess

ms = []
for f in glob.glob('/root/.hermes/mission-state/*.json'):
    if f.endswith('.verify.json'):
        continue
    try:
        d = json.load(open(f))
        ms.append(d)
    except:
        pass
act = [m for m in ms if isinstance(m, dict) and m.get('status') in ('dispatched', 'active')]
print('active:', len(act))
for m in act:
    print(' ', m.get('missionId','?'), 'status=', m.get('status','?'))

r = subprocess.run(['herdr', 'tab', 'list'], capture_output=True, text=True, timeout=10)
d = json.loads(r.stdout)
tabs = d['result']['tabs']
mission_tabs = [t for t in tabs if 'MISSION:' in t.get('label','')]
print('mission tabs:', len(mission_tabs))
for t in mission_tabs:
    print(' ', t['tab_id'], 'label=', t.get('label','?'))
