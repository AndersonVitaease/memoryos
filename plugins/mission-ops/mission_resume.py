# Implementação da ferramenta mission_resume

def mission_resume(missionId: str, force: bool = False):
    # Implementação será adicionada aqui conforme o contrato
    ledger = load_ledger(missionId)

    if ledger['status'] in ['closed', 'failed', 'cancelled', 'delivered']:
        if not force:
            return {'ok': False, 'error': 'MISSION_TERMINAL', 'detail': 'Mission is in a terminal state.'}
        else:
            # Reabre a missão com um evento
            pass

    panes = pane_list()
    target_pane = None

    for pane in panes:
        if pane['title'].startswith(f'MISSION:{missionId}'):
            target_pane = pane
            break

    if target_pane is None:
        return {'ok': False, 'error': 'PANE_NOT_FOUND', 'detail': 'Target pane not found.'}

    output = read_output(target_pane['id'])

    if 'claude' in output and 'working' in output:
        return {'ok': True, 'action': 'no_op', 'detail': 'Claude is already working.'}
    elif 'claude' in output and 'idle' in output:
        # Entrega prompt de retomada curto
        pass
    elif target_pane['state'] == 'shell' or target_pane is None:
        # Relançamento
        pass

    # Implementação dos passos restantes conforme o contrato
    pass
