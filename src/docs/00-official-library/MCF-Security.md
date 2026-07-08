# MCF-Security — Permissões, Autenticação, Assinatura, Sandbox e Auditoria

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 3 de 5 do MCF  
**Referência:** MES §24 — Segurança, MAS §4.6 — Policy Engine

---

## 1. Sistema de Permissões

### 1.1 Modelo de Permissões

```
┌─────────────────────────────────────────────────────────────────┐
│                     MODELO DE PERMISSÕES                        │
└─────────────────────────────────────────────────────────────────┘

  Permissões declaradas no Manifesto do Connector
         │
         ▼
  Policy Engine verifica
         │
         ├── Escopo do usuário autoriza esta permissão?
         ├── Plano contratado inclui este Connector?
         ├── Usuário já concedeu consentimento OAuth?
         └── Não há bloqueio por privacidade ou compliance?
         │
         ▼
  Permissão: GRANTED | DENIED | PENDING_CONSENT
```

### 1.2 Níveis de Permissão

```typescript
enum PermissionLevel {
  // Leitura básica — dados não sensíveis
  READ_BASIC = "READ_BASIC",
  
  // Leitura completa — inclui dados sensíveis
  READ_FULL = "READ_FULL",
  
  // Escrita — criação e modificação
  WRITE = "WRITE",
  
  // Exclusão — remoção de dados
  DELETE = "DELETE",
  
  // Admin — operações administrativas
  ADMIN = "ADMIN",
  
  // Webhook — receber notificações externas
  WEBHOOK = "WEBHOOK",
  
  // Financeiro — transações monetárias
  FINANCIAL = "FINANCIAL",
  
  // Dados pessoais — PII
  PII_ACCESS = "PII_ACCESS",
}
```

### 1.3 Declaração de Permissões no Manifesto

```json
{
  "permissions": [
    {
      "name": "GMAIL_READ",
      "level": "READ_FULL",
      "scope": "https://www.googleapis.com/auth/gmail.readonly",
      "description": "Leitura de e-mails do usuário",
      "required": true,
      "sensitiveData": false
    },
    {
      "name": "GMAIL_SEND",
      "level": "WRITE",
      "scope": "https://www.googleapis.com/auth/gmail.send",
      "description": "Envio de e-mails em nome do usuário",
      "required": false,
      "sensitiveData": false
    },
    {
      "name": "GMAIL_MODIFY",
      "level": "WRITE",
      "scope": "https://www.googleapis.com/auth/gmail.modify",
      "description": "Modificação de e-mails (arquivar, marcar, mover)",
      "required": false,
      "sensitiveData": false
    }
  ]
}
```

### 1.4 Consentimento Granular

O usuário pode autorizar **subconjuntos** de permissões:

```
Usuário autoriza Gmail Connector com:
  ✅ GMAIL_READ        (leitura habilitada)
  ✅ GMAIL_SEND        (envio habilitado)
  ❌ GMAIL_DELETE      (exclusão bloqueada pelo usuário)

Connector opera apenas dentro do escopo autorizado.
Qualquer tentativa de DELETE resulta em PERMISSION_DENIED.
```

### 1.5 Revogação de Permissões

```
Usuário revoga acesso
       │
       ▼
Policy Engine notifica Connector Manager
       │
       ▼
Connector Manager chama connector.disconnect()
       │
       ▼
Connector executa revokeAuth()
       │
       ▼
Tokens invalidados
       │
       ▼
CRE atualiza status para DISCONNECTED
       │
       ▼
Evento emitido: CONNECTOR_AUTH_REVOKED
       │
       ▼
Memória de sessão limpa
```

---

## 2. Sistema de Autenticação

### 2.1 Fluxos de Autenticação por Tipo

```
┌────────────────────────────────────────────────────────────────────┐
│                    FLUXOS DE AUTENTICAÇÃO                          │
├─────────────────┬──────────────────────────────────────────────────┤
│ Tipo            │ Fluxo                                            │
├─────────────────┼──────────────────────────────────────────────────┤
│ OAUTH2          │ Authorization Code Flow                          │
│ (Gmail, GCal,   │ 1. Redirect → Authorization Server               │
│  Shopify)       │ 2. User consent                                  │
│                 │ 3. Code exchange                                  │
│                 │ 4. Access token + refresh token                  │
│                 │ 5. Auto-refresh antes de expirar                 │
├─────────────────┼──────────────────────────────────────────────────┤
│ OAUTH2_PKCE     │ Proof Key for Code Exchange                      │
│ (mobile apps)   │ Sem client_secret no cliente                     │
│                 │ code_verifier + code_challenge                   │
├─────────────────┼──────────────────────────────────────────────────┤
│ API_KEY         │ Chave estática gerada no sistema externo         │
│ (Bling, Zebra)  │ Armazenada de forma criptografada                │
│                 │ Rotação periódica obrigatória                    │
├─────────────────┼──────────────────────────────────────────────────┤
│ CUSTOM          │ Protocolos proprietários                         │
│ (Sabre, Amadeus │ SOAP com WSSE Security Header                    │
│  Galileo)       │ Certificate-based com PEM                        │
│                 │ Session token com renovação automática           │
├─────────────────┼──────────────────────────────────────────────────┤
│ BASIC_AUTH      │ Username + Password                              │
│ (sistemas leg.) │ Sempre via HTTPS/TLS 1.2+                        │
│                 │ Nunca exposta em logs                            │
└─────────────────┴──────────────────────────────────────────────────┘
```

### 2.2 Armazenamento Seguro de Credenciais

```
Credenciais NUNCA são armazenadas em:
  ❌ Logs
  ❌ Memória do usuário (MemoryOS)
  ❌ Manifesto
  ❌ Código-fonte
  ❌ Variáveis de ambiente sem criptografia

Credenciais SÃO armazenadas em:
  ✅ Vault criptografado (AES-256)
  ✅ Por userId + connectorId (escopo completo)
  ✅ Com TTL (expiração automática)
  ✅ Com auditoria de acesso
```

### 2.3 Renovação Automática de Token

```
Verificação a cada request:
  ├── Token expira em > 5 minutos? → usar token atual
  ├── Token expira em ≤ 5 minutos? → renovar proativamente
  └── Token já expirado? → renovar antes de executar

Fluxo de renovação:
  1. refreshAuth(currentCredentials)
  2. Novo access_token recebido
  3. Atualizar no vault
  4. Emitir evento: TOKEN_REFRESHED (sem expor o token)
  5. Continuar com request original
```

---

## 3. Assinatura Digital

Todo Connector oficial deve ser **assinado digitalmente** antes de ser publicado no marketplace ou registrado no CRE.

### 3.1 Processo de Assinatura

```
┌─────────────────────────────────────────────────────────────────┐
│                   PROCESSO DE ASSINATURA                        │
└─────────────────────────────────────────────────────────────────┘

  1. Desenvolvedor cria Connector e Manifesto
         │
         ▼
  2. MCF CLI calcula hash do bundle:
     SHA-256(manifest.json + connector bundle)
         │
         ▼
  3. Assina com chave privada do desenvolvedor:
     signature = RSA-SHA256(hash, privateKey)
         │
         ▼
  4. Insere no Manifesto:
     {
       "signatureAlgorithm": "RSA-SHA256",
       "publicKey": "<PEM>",
       "signature": "<base64>",
       "signedAt": "2026-07-08T00:00:00Z"
     }
         │
         ▼
  5. Envio para certificação MCF
         │
         ▼
  6. MCF CA verifica:
     verify(signature, hash, publicKey) → VALID
         │
         ▼
  7. MCF CA assina novamente com chave raiz oficial
         │
         ▼
  8. Connector publicado como CERTIFIED
```

### 3.2 Verificação na Instalação

```
Connector recebido pelo CRE
       │
       ▼
1. Extrair publicKey do manifesto
2. Extrair signature do manifesto
3. Recalcular hash do bundle
4. verify(signature, hash, publicKey)
       │
       ├── VÁLIDO → registrar Connector
       └── INVÁLIDO → rejeitar com SIGNATURE_INVALID
```

---

## 4. Sandboxing

Todo Connector executa em um ambiente isolado (Sandbox).

### 4.1 Garantias do Sandbox

```typescript
interface SandboxConstraints {
  // Isolamento de memória
  memoryIsolated: true;           // Sem acesso à memória do usuário diretamente
  
  // Rede
  networkPolicy: {
    allowedHosts: string[];       // Apenas hosts declarados no manifesto
    blockPrivateIPs: true;        // Sem acesso a IPs internos (SSRF protection)
    tlsRequired: true;            // Apenas HTTPS/TLS
    maxConcurrentConnections: 10;
  };
  
  // CPU e tempo
  executionTimeoutMs: 30000;      // 30 segundos por request
  cpuLimitPercent: 25;            // Máximo 25% da CPU disponível
  
  // Armazenamento
  localStorageAccess: false;       // Sem acesso ao filesystem
  tempStorageMaxMb: 50;           // Storage temporário máximo
  
  // Comunicação
  canCallOtherConnectors: false;  // Via Connector Manager apenas
  canCallInternalAPIs: false;     // Sem acesso direto ao Core
  canModifyUserMemory: false;     // Via MemoryUpdateProposal apenas
  
  // Código
  allowEval: false;               // Sem execução dinâmica de código
  allowDynamicImport: false;      // Sem importações em runtime
}
```

### 4.2 Comunicação Saída do Sandbox

```
Connector Sandbox
       │
       ├── ✅ PODE: chamar APIs externas declaradas no manifesto
       ├── ✅ PODE: emitir eventos via Event Bus
       ├── ✅ PODE: retornar ConnectorResponse ao Connector Manager
       ├── ✅ PODE: propor atualizações de memória (MemoryUpdateProposal)
       │
       ├── ❌ NÃO PODE: acessar memória do usuário diretamente
       ├── ❌ NÃO PODE: chamar outros Connectors diretamente
       ├── ❌ NÃO PODE: modificar configuração de outros módulos
       ├── ❌ NÃO PODE: acessar endpoints internos do MemoryOS
       └── ❌ NÃO PODE: armazenar dados no filesystem
```

---

## 5. Eventos de Segurança Emitidos

```typescript
// Eventos obrigatórios relacionados à segurança
const SECURITY_EVENTS = [
  "CONNECTOR_AUTH_INITIATED",      // Início do fluxo OAuth
  "CONNECTOR_AUTH_COMPLETED",      // Autenticação bem-sucedida
  "CONNECTOR_AUTH_FAILED",         // Falha de autenticação
  "CONNECTOR_AUTH_REFRESHED",      // Token renovado
  "CONNECTOR_AUTH_REVOKED",        // Acesso revogado pelo usuário
  "CONNECTOR_PERMISSION_DENIED",   // Ação negada por falta de permissão
  "CONNECTOR_PERMISSION_ESCALATION_ATTEMPT", // Tentativa de elevar permissão
  "CONNECTOR_SIGNATURE_INVALID",   // Assinatura digital inválida
  "CONNECTOR_SANDBOX_VIOLATION",   // Tentativa de violação do sandbox
  "CONNECTOR_RATE_LIMIT_HIT",      // Limite de taxa atingido
  "CONNECTOR_SUSPICIOUS_PATTERN",  // Padrão anômalo detectado
];
```

---

## 6. Auditoria

### 6.1 Registro Obrigatório de Auditoria

Todo request ao Connector gera obrigatoriamente uma entrada de auditoria imutável:

```typescript
interface AuditEntry {
  auditId: string;              // ID único sequencial
  timestamp: string;            // ISO 8601 com milissegundos
  connectorId: string;
  connectorName: string;
  userId: string;
  requestId: string;
  action: string;
  status: ConnectorResponseStatus;
  
  // Dados do request (sem dados sensíveis)
  requestSummary: {
    action: string;
    payloadHash: string;        // SHA-256 do payload, nunca o payload real
    payloadSize: number;
  };
  
  // Dados da resposta
  responseSummary: {
    status: string;
    executionTimeMs: number;
    resultHash?: string;        // SHA-256 do result
    errorCode?: string;
  };
  
  // Contexto de segurança
  security: {
    permissionsUsed: string[];
    authType: string;
    tokenScopes: string[];      // Scopes OAuth utilizados
    sandboxViolations: string[];
  };
  
  // Rastreabilidade
  correlationId: string;
  parentRequestId?: string;     // Para chamadas em cadeia
  ipAddress?: string;           // Para auditoria de acesso
}
```

### 6.2 Retenção de Auditoria

```
Logs de auditoria: mínimo 90 dias
Logs de segurança: mínimo 365 dias
Logs de compliance (financeiro, saúde): mínimo 7 anos
Logs de debugging: 30 dias

Os logs são:
  ✅ Imutáveis após gravação
  ✅ Indexados por userId, connectorId, action, timestamp
  ✅ Exportáveis para compliance
  ✅ Não contêm dados sensíveis (apenas hashes)
```

---

## 7. Segurança em Trânsito e em Repouso

### 7.1 Em Trânsito

```
Comunicação externa (Connector → API):
  ✅ TLS 1.2 mínimo (preferência: TLS 1.3)
  ✅ Certificate pinning para sistemas críticos (financeiro, saúde)
  ✅ Sem redirect para HTTP (HSTS)
  ✅ HPKP para domínios críticos

Comunicação interna (Connector ↔ Core):
  ✅ Mensagens assinadas
  ✅ Canal interno isolado
  ✅ Sem exposição de tokens em headers de log
```

### 7.2 Em Repouso

```
Tokens e credenciais:
  ✅ AES-256-GCM
  ✅ Chave de criptografia por usuário (KMS)
  ✅ Rotação automática de chaves (90 dias)
  ✅ Zero-knowledge: MemoryOS não pode revelar o token em plain text

Dados em cache:
  ✅ Cache isolado por userId + connectorId
  ✅ TTL obrigatório (sem cache permanente)
  ✅ Dados sensíveis (PII) nunca cacheados
  ✅ Cache limpo ao logout
```

---

## 8. Compliance e LGPD/GDPR

```typescript
interface DataPrivacyPolicy {
  // Quais dados o Connector processa
  processesPersonalData: boolean;
  dataCategories: DataCategory[];
  
  // Retenção
  maxRetentionDays: number;
  autoDeleteOnRevoke: boolean;
  
  // Direitos do usuário
  supportsDataExport: boolean;    // Portabilidade
  supportsDataDeletion: boolean;  // Direito ao esquecimento
  
  // Legalidade
  legalBasis: LegalBasis;        // "CONSENT" | "CONTRACT" | "LEGITIMATE_INTEREST"
  dataProcessingAgreement: boolean; // DPA assinado com o sistema externo
  
  // Transferência internacional
  dataResidency?: string;         // Ex: "BR", "EU"
  crossBorderTransfer: boolean;
}
```

---

## 9. Tabela de Requisitos de Segurança por Nível de Certificação

```
┌─────────────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Requisito                       │  COMMUNITY  │   PARTNER   │  CERTIFIED  │
├─────────────────────────────────┼─────────────┼─────────────┼─────────────┤
│ Assinatura digital              │ Recomendado │ Obrigatório │ Obrigatório │
│ Manifesto completo              │ Obrigatório │ Obrigatório │ Obrigatório │
│ TLS em todas chamadas           │ Obrigatório │ Obrigatório │ Obrigatório │
│ Auditoria de acesso             │ Recomendado │ Obrigatório │ Obrigatório │
│ Sandboxing total                │ Recomendado │ Obrigatório │ Obrigatório │
│ Circuit Breaker                 │ Recomendado │ Obrigatório │ Obrigatório │
│ LGPD/GDPR declaration           │ Recomendado │ Obrigatório │ Obrigatório │
│ Pen test                        │ Não req.    │ Recomendado │ Obrigatório │
│ Code review oficial MCF         │ Não req.    │ Não req.    │ Obrigatório │
│ SLA documentado                 │ Não req.    │ Recomendado │ Obrigatório │
│ Plano de resposta a incidentes  │ Não req.    │ Recomendado │ Obrigatório │
└─────────────────────────────────┴─────────────┴─────────────┴─────────────┘
```

---

**Documento Oficial:** MCF-Security  
**Versão:** 1.0  
**Status:** Aprovado  
**Parte:** 3 de 5 do MemoryOS Connector Framework