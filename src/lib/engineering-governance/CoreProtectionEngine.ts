/**
 * CoreProtectionEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: identificar e proteger componentes do Core.
 * Não executa mudanças. Expõe apenas APIs de consulta e verificação.
 */

import type { ProtectedComponent, ProtectionLevel, OperationType } from './GovernanceTypes';

// Registro imutável dos componentes protegidos do Core.
const CORE_REGISTRY: ProtectedComponent[] = [
  {
    id: 'wme',
    name: 'WorkingMemoryEngine',
    path: 'src/lib/wme',
    level: 'immutable',
    reason: 'Motor central de memoria de trabalho — alteracoes exigem aprovacao do Architecture Board',
    dependencies: [],
    ownedBy: 'core-team',
  },
  {
    id: 'sprint1',
    name: 'Sprint1 Core',
    path: 'src/lib/sprint1',
    level: 'immutable',
    reason: 'Implementacao de referencia MRI — congelada apos certificacao',
    dependencies: ['wme'],
    ownedBy: 'core-team',
  },
  {
    id: 'fce',
    name: 'FoundationComplianceEngine',
    path: 'src/lib/fce',
    level: 'restricted',
    reason: 'Engine de conformidade com o Foundation — alteracoes exigem revisao de politica',
    dependencies: [],
    ownedBy: 'governance-team',
  },
  {
    id: 'abv',
    name: 'ArchitecturalBoundaryValidator',
    path: 'src/lib/abv',
    level: 'restricted',
    reason: 'Validador de fronteiras arquiteturais — auditado em cada mudanca',
    dependencies: ['fce'],
    ownedBy: 'governance-team',
  },
  {
    id: 'connector-runtime',
    name: 'ConnectorRuntime',
    path: 'src/lib/connector-runtime',
    level: 'audited',
    reason: 'Runtime de conectores — alteracoes auditadas automaticamente',
    dependencies: [],
    ownedBy: 'platform-team',
  },
  {
    id: 'auth-context',
    name: 'AuthContext',
    path: 'src/lib/AuthContext.jsx',
    level: 'restricted',
    reason: 'Contexto de autenticacao — acesso restrito por seguranca',
    dependencies: [],
    ownedBy: 'security-team',
  },
  {
    id: 'official-library',
    name: 'OfficialLibrary',
    path: 'src/lib/officialLibraryManager.js',
    level: 'immutable',
    reason: 'Biblioteca oficial do MemoryOS — fonte unica de verdade',
    dependencies: [],
    ownedBy: 'core-team',
  },
];

// Operations that are never allowed on immutable components.
const IMMUTABLE_BLOCKED_OPS: OperationType[] = ['write', 'delete', 'refactor', 'migrate'];

export class CoreProtectionEngine {
  private static readonly registry: ProtectedComponent[] = [...CORE_REGISTRY];

  /** Returns all registered protected components. */
  static listProtected(): ProtectedComponent[] {
    return this.registry.map((c) => ({ ...c }));
  }

  /** Returns a single protected component by id or path prefix. */
  static find(idOrPath: string): ProtectedComponent | null {
    return (
      this.registry.find((c) => c.id === idOrPath || idOrPath.startsWith(c.path)) ?? null
    );
  }

  /** Returns true if the given path is under a protected component. */
  static isProtected(path: string): boolean {
    return this.registry.some((c) => path.startsWith(c.path));
  }

  /** Returns the protection level for a given path. */
  static getProtectionLevel(path: string): ProtectionLevel | null {
    const component = this.registry.find((c) => path.startsWith(c.path));
    return component?.level ?? null;
  }

  /**
   * Checks whether the given operation is blocked on a path.
   * Returns { blocked: false } if allowed, { blocked: true, reason } if not.
   */
  static checkOperation(
    path: string,
    operation: OperationType
  ): { blocked: boolean; reason?: string; component?: ProtectedComponent } {
    const component = this.registry.find((c) => path.startsWith(c.path));
    if (!component) return { blocked: false };

    if (component.level === 'immutable' && IMMUTABLE_BLOCKED_OPS.includes(operation)) {
      return {
        blocked: true,
        reason: `Component "${component.name}" is immutable. Operation "${operation}" is not permitted.`,
        component: { ...component },
      };
    }

    if (component.level === 'restricted' && operation === 'delete') {
      return {
        blocked: true,
        reason: `Component "${component.name}" is restricted. Deletion requires Architecture Board approval.`,
        component: { ...component },
      };
    }

    return { blocked: false, component: { ...component } };
  }

  /** Lists all components that depend on the given component id. */
  static getDependents(componentId: string): ProtectedComponent[] {
    return this.registry.filter((c) => c.dependencies.includes(componentId)).map((c) => ({ ...c }));
  }

  /** Returns health summary of the registry. */
  static health(): { status: 'ok'; componentCount: number; levels: Record<ProtectionLevel, number> } {
    const levels: Record<ProtectionLevel, number> = { immutable: 0, restricted: 0, audited: 0, open: 0 };
    for (const c of this.registry) levels[c.level]++;
    return { status: 'ok', componentCount: this.registry.length, levels };
  }
}