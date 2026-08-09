# RFC-001: Web Connector Architecture (Hybrid MVP → Enterprise)

**Date:** 2026-08-09
**Status:** SUPERSEDED — ver aviso abaixo
**Author:** Anderson (MemoryOS)
**Scope:** WebConnector para múltiplos sites, multi-usuário, escalável

---

> ## ⚠️ SUPERSEDED (2026-08-09)
>
> Este documento está **desatualizado no modelo de autenticação** (Seção 2.2, entidade `UserCredential` com `encryptedEmail`/`encryptedPassword`). A arquitetura corrigida elimina completamente o armazenamento de senha de terceiros — autenticação passa a ser por **captura de sessão** (cookies, após login direto do usuário no site), nunca por credenciais guardadas.
>
> **Decisão formal e motivo da correção:** ver `src/docs/foundation/adr/ADR-019.md`.
>
> **Substituído por:**
> - `src/docs/foundation/rfc/RFC-012-Web-Connector-Session-Capture.md` (captura de sessão)
> - `src/docs/foundation/rfc/RFC-013-Web-Connector-Capability-Discovery.md` (descoberta de capabilities)
> - `src/docs/foundation/rfc/RFC-014-Web-Connector-Runtime-Integration.md` (integração ao Connector Runtime + escala)
>
> **Nota de numeração:** este arquivo se autodenomina "RFC-001", mas nunca esteve na árvore canônica `src/docs/foundation/rfc/`, que já tem um `RFC-001.md` real e não relacionado a este assunto. Os documentos substitutos usam a numeração canônica correta (012-014) para não repetir essa confusão.
>
> O conteúdo original abaixo é preservado como registro histórico — não usar como especificação para implementação.

---

---

## 1. VISÃO GERAL

**Objetivo:** Sistema que permita:
- ✅ MVP agora (1 VPS, 10-100 usuários)
- ✅ Escala para 1M+ usuários depois
- ✅ Sem reescrever código
- ✅ Upgrade path claro (MVP → Kubernetes)

**Arquitetura:** Hybrid + Stateless Design

---

## 2. FASE 1: MVP (0-3 meses, 10-100 usuários)

### 2.1 Stack
```
┌─────────────────────────────────┐
│   MemoryOS (Base44)             │
│   - Web Connector Executor      │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│   API Gateway (Express)         │
│   - Auth (JWT)                  │
│   - Permission checking         │
│   - Request routing             │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│   Browser Pool Manager (Local)  │
│   - Max 5 concurrent browsers   │
│   - Playwright              │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│   Data Layer                    │
│   - PostgreSQL (credentials)    │
│   - Redis (sessions, cache)     │
│   - File storage (screenshots)  │
└─────────────────────────────────┘
```

### 2.2 Data Model

```typescript
// Sites que podem ser conectados
interface SiteConfig {
  id: string;
  name: string;  // "GitHub", "Gmail", "Notion"
  baseUrl: string;
  loginFlow: {
    emailSelector: string;
    passwordSelector: string;
    submitSelector: string;
    postLoginWait?: number;  // ms
  };
  mfaRequired: boolean;
  allowedDomains: string[];
  requiredScopes: string[];
}

// Credenciais do usuário (encrypted em BD)
interface UserCredential {
  id: string;
  userId: string;
  siteId: string;
  encryptedEmail: string;
  encryptedPassword: string;
  encryptedMfaSecret?: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'expired' | 'revoked';
}

// Sessão ativa
interface UserSession {
  id: string;
  userId: string;
  credentialId: string;
  siteId: string;
  browserId: string;  // ID do browser no pool
  cookies: Array<{ name: string; value: string; }>;
  screenshot?: string;  // base64
  lastAction: Date;
  expiresAt: Date;
  permissions: string[];  // ['read_repos', 'create_issues']
}

// Log de auditoria
interface AuditLog {
  id: string;
  userId: string;
  sessionId: string;
  action: string;  // 'login', 'click', 'navigate'
  target?: string;  // seletor clickado, URL navigada
  status: 'success' | 'failed';
  timestamp: Date;
  ipAddress: string;
}
```

### 2.3 API Endpoints (MVP)

```bash
# Criar sessão
POST /api/v1/sessions
{
  "userId": "anderson-001",
  "siteId": "github",
  "credentialId": "cred_123"
}
→ { sessionId, screenshot, cookies }

# Executar ação
POST /api/v1/sessions/:sessionId/action
{
  "action": "click|type|snapshot|navigate",
  "target": "#search-button",
  "text": "memoryos"  // para type
}
→ { status, screenshot, result }

# Fechar sessão
DELETE /api/v1/sessions/:sessionId
→ { status: "closed" }

# Listar credenciais do usuário
GET /api/v1/users/:userId/credentials
→ [{ id, siteId, lastUsed, status }]

# Audit log
GET /api/v1/audit?userId=:userId&days=30
→ [{ action, timestamp, status }]
```

### 2.4 Browser Pool Manager (MVP)

```typescript
class BrowserPoolManager {
  private pool: Map<string, PlaywrightBrowser> = new Map();
  private maxBrowsers = 5;
  private sessionManager: SessionManager;

  async getOrCreateBrowser(userId: string, siteId: string) {
    // 1. Procura browser disponível
    let browser = this.findAvailable();
    
    // 2. Se nenhum disponível e < max, cria novo
    if (!browser && this.pool.size < this.maxBrowsers) {
      browser = await this.createBrowser();
    }
    
    // 3. Se ainda sem browser, aguarda liberar
    if (!browser) {
      browser = await this.waitForAvailable(30000);  // timeout 30s
    }
    
    return browser;
  }

  async executeAction(sessionId: string, action: Action) {
    const session = await this.sessionManager.get(sessionId);
    const browser = this.pool.get(session.browserId);
    
    // Executa ação
    const result = await this.executeInBrowser(browser, action);
    
    // Atualiza audit log
    await this.auditLog(sessionId, action, result);
    
    return result;
  }

  async closeSession(sessionId: string) {
    const session = await this.sessionManager.get(sessionId);
    const browser = this.pool.get(session.browserId);
    
    // Limpa cookies/storage
    await browser.clearCookies();
    
    // Marca como disponível
    this.markAvailable(session.browserId);
    
    // Registra na auditoria
    await this.auditLog(sessionId, 'close_session', { success: true });
  }
}
```

---

## 3. FASE 2: Production (3-6 meses, 1k-10k usuários)

### 3.1 Mudanças Mínimas

```
├─ Redis Cluster (não local)
├─ PostgreSQL ReplicaSet
├─ Load Balancer (múltiplas API instances)
├─ Separate Browser Machines (não no mesmo VPS)
└─ Monitoring (Prometheus + Grafana)
```

**Código da aplicação: 0% mudança!**
(Conexão strings apontam para cluster em vez de localhost)

---

## 4. FASE 3: Enterprise (12+ meses, 100k-1M+ usuários)

### 4.1 Migração para Kubernetes

```
Mesma API, mesmos data models
Mas:
├─ K8s orquestra os workers
├─ Auto-scaling baseado em load
├─ Multi-region support
└─ Disaster recovery automático
```

**Mudança no código:** Apenas configuração de deployment!

---

## 5. DESIGN PRINCIPLES (CRÍTICO)

### 5.1 Stateless API
```typescript
// ✅ CORRETO - stateless
app.post('/sessions/:id/action', async (req, res) => {
  const session = await db.getSession(req.params.id);
  const browser = await getBrowser(session.browserId);
  // ... executa ação
});

// ❌ ERRADO - stateful
let currentSession = null;
app.post('/action', () => {
  // ← Quebra em múltiplas instâncias!
});
```

### 5.2 Credential Encryption
```typescript
// SEMPRE encripta em repouso
interface StoredCredential {
  id: string;
  encryptedData: string;  // AES-256-GCM
  salt: string;
  iv: string;
}

// NUNCA loga credentials
logger.info(`User logged in`, {
  userId: user.id,  // ✅ ok
  password: user.password  // ❌ NUNCA!
});
```

### 5.3 Session Isolation
```typescript
// Cada usuário/site tem contexto isolado
async executeAction(userId, siteId, action) {
  const session = await this.getSessionForUser(userId, siteId);
  
  // ✅ Browser isolado por usuário
  const browser = await this.getBrowserFor(session);
  
  // ✅ Cookies não vazam entre sessões
  // ✅ LocalStorage isolado
  // ✅ Cada aba tem seu contexto
}
```

---

## 6. SECURITY CHECKLIST

- [ ] All credentials encrypted at rest (AES-256)
- [ ] Sessions have TTL (30min inactivity)
- [ ] HTTPS enforced
- [ ] API rate limiting (100 req/min per user)
- [ ] Audit logging (todas ações)
- [ ] CORS properly configured
- [ ] Browser contexts isolated
- [ ] No credential logs
- [ ] MFA support ready
- [ ] GDPR-compliant data retention

---

## 7. TIMELINE & EFFORT

```
FASE 1 (MVP):
├─ Week 1-2: Core API + Pool Manager
├─ Week 2-3: Security layer + Encryption
├─ Week 3-4: Testing + Documentation
└─ Effort: 80-120 horas

FASE 2 (Production):
├─ Week 4-8: Add Redis Cluster + LB
├─ Week 8-12: Monitoring + Auto-recovery
└─ Effort: 40-60 horas (app code: 0 mudanças)

FASE 3 (Enterprise):
├─ Month 6+: Kubernetes migration
├─ Multi-region setup
└─ Effort: 100-150 horas (mostly DevOps)
```

---

## 8. PRÓXIMOS PASSOS

**Imediato:**
1. [ ] Finalizar data models
2. [ ] Implement PostgreSQL schema
3. [ ] Build SiteConfig registry (GitHub, Gmail, etc)
4. [ ] MVP API gateway

**Semana 1:**
5. [ ] BrowserPoolManager (local version)
6. [ ] SessionManager + AuditLog
7. [ ] Encryption layer

**Semana 2-3:**
8. [ ] API endpoints
9. [ ] Integration testes
10. [ ] Security audit

---

## DECISÃO RECOMENDADA

**Começar implementação Fase 1 imediatamente.**
- API é simples (50-100 linhas core logic)
- Architecture é sound
- Upgrade path é claro
- Zero technical debt

**GO/NO-GO:** Anderson aprova? ✅

