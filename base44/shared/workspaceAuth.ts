/**
 * workspaceAuth.ts — Camada compartilhada de autorizacao de Workspace (Fase 1).
 *
 * Esta e a UNICA fonte de verdade server-side para validacao de membership e
 * resolucao do workspace ativo. Todas as funcoes backend que precisam saber
 * "em qual workspace o usuario esta operando" devem chamar resolveActiveWorkspace
 * ou assertWorkspaceMember a partir daqui — nunca confiar em active_workspace_id
 * enviado pelo frontend sem validar.
 *
 * Modelo de seguranca:
 * - RLS (nas entidades) protege acesso direto via API: le workspace_ids do User.
 * - Esta camada protege operacoes backend: valida membership em WorkspaceMember
 *   (fonte da verdade) antes de agir.
 * - User.workspace_ids e um ESPELHO denormalizado de WorkspaceMember(status=active),
 *   mantido por syncUserWorkspaceIds (fail-closed) + reconciler periodico.
 * - active_workspace_id e apenas um seletor de contexto; nunca concede acesso.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Recomputa User.workspace_ids a partir das memberships ativas (status=active).
 * Idempotente. Chamado apos toda mutacao de membership e pelo reconciler.
 * Retorna a lista final de workspace_ids.
 */
export async function syncUserWorkspaceIds(base44, userId) {
  const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
    user_id: userId,
    status: 'active',
  });
  const ids = (members || [])
    .map((m) => m.workspace_id)
    .filter(Boolean);
  const unique = Array.from(new Set(ids));
  await base44.asServiceRole.entities.User.update(userId, {
    workspace_ids: unique,
  });
  return unique;
}

/**
 * Resolve o workspace ativo do usuario, VALIDANDO membership.
 * - Se active_workspace_id esta setado e o usuario e membro ativo: retorna ele.
 * - Se nao ha active_workspace_id mas ha workspaces: retorna o primeiro + seta ativo.
 * - Se nao ha nenhum workspace: provisiona um pessoal e retorna.
 * - Se active_workspace_id NAO bate com membership: lanca erro (rejeita).
 * Retorna { workspace_id, role }.
 */
export async function resolveActiveWorkspace(base44, userId) {
  const user = await base44.asServiceRole.entities.User.get(userId);
  const activeId = user?.active_workspace_id || null;
  const workspaceIds = Array.isArray(user?.workspace_ids) ? user.workspace_ids : [];

  if (workspaceIds.length === 0) {
    const prov = await provisionPersonalWorkspace(base44, userId);
    return { workspace_id: prov.workspace_id, role: 'owner' };
  }

  if (!activeId) {
    const first = workspaceIds[0];
    await base44.asServiceRole.entities.User.update(userId, { active_workspace_id: first });
    const role = await getMemberRole(base44, userId, first);
    return { workspace_id: first, role };
  }

  if (!workspaceIds.includes(activeId)) {
    throw new Error('active_workspace_id inválido: usuário não é membro ativo deste workspace');
  }

  const role = await getMemberRole(base44, userId, activeId);
  return { workspace_id: activeId, role };
}

/**
 * Asserta que o usuario e membro ativo do workspace. Lanca erro se nao for.
 * Retorna { role }.
 */
export async function assertWorkspaceMember(base44, userId, workspaceId) {
  const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
    workspace_id: workspaceId,
    user_id: userId,
    status: 'active',
  });
  if (!members || members.length === 0) {
    throw new Error('Usuário não é membro ativo do workspace');
  }
  return { role: members[0].role };
}

/**
 * Provisiona um workspace pessoal para o usuario se ele nao tiver NENHUM.
 * Idempotente. Cria Workspace(type=pessoal) + WorkspaceMember(role=owner, active),
 * sincroniza workspace_ids e seta active_workspace_id.
 * Retorna { workspace_id, created }.
 */
export async function provisionPersonalWorkspace(base44, userId) {
  const existing = await base44.asServiceRole.entities.WorkspaceMember.filter({
    user_id: userId,
    status: 'active',
  });
  if (existing && existing.length > 0) {
    const wsId = existing[0].workspace_id;
    const user = await base44.asServiceRole.entities.User.get(userId);
    if (!user?.active_workspace_id) {
      await base44.asServiceRole.entities.User.update(userId, { active_workspace_id: wsId });
    }
    return { workspace_id: wsId, created: false };
  }

  const ws = await base44.asServiceRole.entities.Workspace.create({
    name: 'Meu espaço',
    type: 'pessoal',
    owner_id: userId,
  });
  await base44.asServiceRole.entities.WorkspaceMember.create({
    workspace_id: ws.id,
    user_id: userId,
    role: 'owner',
    status: 'active',
    joined_at: new Date().toISOString(),
  });
  await syncUserWorkspaceIds(base44, userId);
  await base44.asServiceRole.entities.User.update(userId, { active_workspace_id: ws.id });
  return { workspace_id: ws.id, created: true };
}

async function getMemberRole(base44, userId, workspaceId) {
  const members = await base44.asServiceRole.entities.WorkspaceMember.filter({
    workspace_id: workspaceId,
    user_id: userId,
    status: 'active',
  });
  if (!members || members.length === 0) {
    throw new Error('Usuário não é membro ativo do workspace');
  }
  return members[0].role;
}