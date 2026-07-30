import subprocess, re, os, sys

max_iters = int(sys.argv[1]) if len(sys.argv) > 1 else 8
removed = []
done = False

for iteration in range(max_iters):
    result = subprocess.run(
        ['npx', 'vite', 'build'],
        capture_output=True, text=True, cwd='/app', timeout=40
    )
    if result.returncode == 0:
        print(f"✓ BUILD PASSOU depois de {len(removed)} remocao(oes) extra(s) nessa rodada")
        done = True
        break

    output = result.stdout + result.stderr
    m = re.search(r"\(imported by (src/pages/[^)]+\.jsx?)\)", output)
    if not m:
        print("PARADA: nao consegui extrair pagina causadora. Output:")
        print(output[-1200:])
        break

    bad_page = m.group(1)
    comp_name = os.path.splitext(os.path.basename(bad_page))[0]
    removed.append(bad_page)
    print(f"[{iteration+1}] Removendo {bad_page}")

    with open('src/App.jsx', encoding='utf-8') as f:
        app = f.read()
    for cand in [comp_name, comp_name + 'Page']:
        app2 = re.sub(rf"^const {re.escape(cand)} = lazy\(\(\) => import\('@/pages/{re.escape(comp_name)}'\)\);\n", "", app, flags=re.MULTILINE)
        app2 = re.sub(rf'^\s*<Route path="[^"]*" element=\{{<{re.escape(cand)}\s*/>\}}\s*/>\n', "", app2, flags=re.MULTILINE)
        if app2 != app:
            app = app2
    with open('src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(app)

    if os.path.isfile(bad_page):
        subprocess.run(['git', 'rm', bad_page], cwd='/app', capture_output=True)

print(f"REMOVIDAS_NESSA_RODADA={len(removed)}")
print(f"BUILD_PASSOU={done}")
