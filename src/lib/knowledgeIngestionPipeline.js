import { base44 } from "@/api/base44Client";
import { cognitiveEventBus } from "@/lib/cognitive-event-bus/CognitiveEventBus";

/**
 * Pipeline Universal de Ingestão de Conhecimento — Beta 0.2
 *
 * Fluxo: Receber → Extrair → Interpretar → Resumir → Extrair Entidades → Salvar → Finalizar
 *
 * Cada tipo de conteúdo possui seu próprio extrator, permitindo adicionar
 * novos formatos futuramente (vídeos, e-mails, APIs externas) sem alterar a arquitetura.
 */

export const PROCESSING_STAGES = [
  { id: "receiving", label: "Recebendo conteúdo..." },
  { id: "extracting", label: "Extraindo conteúdo..." },
  { id: "interpreting", label: "Interpretando..." },
  { id: "summarizing", label: "Criando resumo..." },
  { id: "entities", label: "Extraindo entidades..." },
  { id: "saving", label: "Atualizando memória..." },
  { id: "finalizing", label: "Finalizando..." },
];

const MAX_CONTENT_LENGTH = 50000;

export const ACCEPT_MAP = {
  pdf: ".pdf",
  image: "image/*",
  audio: "audio/*",
  word: ".doc,.docx",
  excel: ".xls,.xlsx",
};

export const TYPE_EMOJIS = {
  pdf: "📄",
  image: "🖼️",
  audio: "🎤",
  word: "📄",
  excel: "📊",
  link: "🌐",
  text: "📋",
};

const FILE_TYPE_MAP = {
  pdf: "pdf",
  word: "docx",
  excel: "spreadsheet",
  image: "image",
  audio: "audio",
  link: "link",
  text: "text",
};

const SOURCE_TYPE_MAP = {
  pdf: "file",
  word: "file",
  excel: "file",
  image: "file",
  audio: "file",
  link: "link",
  text: "text",
};

/**
 * Schema único para extração completa de conhecimento via LLM.
 * Aplica-se a todos os tipos de conteúdo — a diferença está em como
 * o conteúdo bruto é extraído antes de chegar aqui.
 */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Resumo inteligente e completo do conteúdo em português",
    },
    category: {
      type: "string",
      enum: [
        "contrato",
        "financeiro",
        "marketing",
        "produto",
        "juridico",
        "comercial",
        "atendimento",
        "reuniao",
        "planejamento",
        "outro",
      ],
    },
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          context: { type: "string", description: "Trecho ou contexto onde a pessoa foi mencionada" },
        },
        required: ["name"],
      },
    },
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          context: { type: "string" },
        },
        required: ["name"],
      },
    },
    dates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          context: { type: "string" },
        },
        required: ["value"],
      },
    },
    values: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          context: { type: "string" },
        },
        required: ["value"],
      },
    },
    phones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          context: { type: "string" },
        },
        required: ["value"],
      },
    },
    emails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          context: { type: "string" },
        },
        required: ["value"],
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["title"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string" },
          assignee: { type: "string" },
        },
        required: ["title"],
      },
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary"],
};

function truncate(text, max = MAX_CONTENT_LENGTH) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.substring(0, max) + "\n\n[Conteúdo truncado...]";
}

// === Extratores por tipo ===

/**
 * FIX (bug pre-existente, achado hoje): a interface ja anunciava aceitar
 * .docx/.xlsx (ver ACCEPT_MAP acima) mas extractFromFile() sempre usava
 * o servico gerenciado do Base44 (Core.ExtractDataFromUploadedFile), que
 * nunca suportou esses formatos — "Unsupported file type: docx" era o
 * erro real. Agora Word/Excel usam a function documentParser (mesma
 * construida hoje, ja testada com arquivos reais), lendo o arquivo
 * original direto do navegador (sem precisar rebaixar do file_url).
 */
async function extractFromOfficeFile(file, documentType) {
  const base64Content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await base44.functions.invoke("documentParser", {
    documentType,
    base64Content,
    fileName: file.name,
  });
  const d = res?.data ?? res;
  if (d?.error) throw new Error(d.error);
  return d?.text || "";
}

async function extractFromFile(file_url) {
  const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
    file_url,
    json_schema: {
      type: "object",
      properties: {
        full_text: {
          type: "string",
          description: "Todo o texto extraído do documento, preservando a estrutura e tabelas",
        },
      },
      required: ["full_text"],
    },
  });
  const output = result?.output;
  if (typeof output === "string") return output;
  return output?.full_text || "";
}

async function extractFromAudio(file_url) {
  const transcript = await base44.integrations.Core.TranscribeAudio({
    audio_url: file_url,
  });
  return typeof transcript === "string" ? transcript : String(transcript || "");
}

// === Pipeline principal ===

export async function ingestKnowledge({
  type,
  file,
  url,
  text,
  name,
  sessionId,
  projectId,
  onStage,
}) {
  const sourceType = SOURCE_TYPE_MAP[type] || "file";
  const fileType = FILE_TYPE_MAP[type] || "other";
  let fileUrl = null;
  let fileSize = 0;
  let rawContent = "";

  // 1 — Receber
  onStage?.("receiving");

  // Fase 1 — Observabilidade: sinaliza início da ingestão ao indicador cognitivo
  const ingestionExecId = `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    cognitiveEventBus.emit("planning_started", sessionId || "", ingestionExecId, {
      source: "knowledge_ingestion",
      contentType: type,
      name: name || null,
    });
  } catch { /* fire-and-forget — observabilidade apenas */ }

  if (sourceType === "file" && file) {
    const uploadResult = await base44.integrations.Core.UploadFile({ file });
    fileUrl = uploadResult.file_url;
    fileSize = file.size;
  }

  // 2 — Extrair conteúdo bruto
  onStage?.("extracting");

  if (type === "audio") {
    rawContent = await extractFromAudio(fileUrl);
  } else if (type === "word") {
    rawContent = await extractFromOfficeFile(file, "docx");
  } else if (type === "excel") {
    rawContent = await extractFromOfficeFile(file, "xlsx");
  } else if (type === "pdf") {
    rawContent = await extractFromFile(fileUrl);
  } else if (type === "text") {
    rawContent = text || "";
  }
  // Image e Link são processados diretamente pelo LLM (vision / web search)

  rawContent = truncate(rawContent);

  // 3 — Interpretar + Extrair conhecimento
  onStage?.("interpreting");

  // Fase 1 — Observabilidade: sinaliza chamada LLM de extração
  try {
    cognitiveEventBus.emit("llm_response_generated", sessionId || "", ingestionExecId, {
      source: "knowledge_ingestion",
      contentType: type,
      displayName,
    });
  } catch { /* fire-and-forget — observabilidade apenas */ }

  let llmParams;
  let displayName = name;

  if (type === "image" && fileUrl) {
    llmParams = {
      prompt:
        "Analise esta imagem em detalhes. Extraia TODO o texto visível (OCR), datas, valores, empresas, pessoas, produtos e quaisquer informações relevantes. Seja minucioso.",
      file_urls: [fileUrl],
      response_json_schema: EXTRACTION_SCHEMA,
    };
  } else if (type === "link" && url) {
    displayName = displayName || url;
    llmParams = {
      prompt: `Acesse e analise o conteúdo da seguinte página web: ${url}\n\nExtraia: título, texto principal, resumo e todas as entidades (pessoas, empresas, datas, valores, decisões, tarefas, assuntos). Seja minucioso.`,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: EXTRACTION_SCHEMA,
    };
  } else {
    llmParams = {
      prompt: `Você é o MemoryOS — a memória permanente do usuário.

Analise o seguinte conteúdo e extraia TODAS as informações relevantes de forma estruturada.

Conteúdo:
---
${rawContent}
---

Extraia:
1. Resumo inteligente do conteúdo
2. Categoria do documento
3. Pessoas mencionadas (nome e contexto)
4. Empresas mencionadas (nome e contexto)
5. Datas (valor e contexto)
6. Valores monetários (valor e contexto)
7. Telefones
8. Emails
9. Decisões tomadas (título, descrição, justificativa)
10. Tarefas identificadas (título, descrição, prazo, responsável)
11. Assuntos/Tópicos (nome e descrição)
12. Palavras-chave para indexação

Seja minucioso. Não perca nenhuma informação importante.`,
      response_json_schema: EXTRACTION_SCHEMA,
    };
  }

  // 4 — Resumir (mesma chamada LLM já gera o resumo)
  onStage?.("summarizing");
  const extraction = await base44.integrations.Core.InvokeLLM(llmParams);

  // 5 — Extrair entidades (mesma chamada já extrai tudo)
  onStage?.("entities");

  // 6 — Salvar na memória
  onStage?.("saving");

  const doc = await base44.entities.Document.create({
    session_id: sessionId,
    project_id: projectId || undefined,
    name: displayName || file?.name || "Conteúdo",
    file_url: fileUrl || undefined,
    file_type: fileType,
    source_type: sourceType,
    original_url: type === "link" ? url : undefined,
    extracted_text: rawContent || extraction.summary,
    size_bytes: fileSize || undefined,
    summary: extraction.summary,
    processing_status: "completed",
    category: extraction.category || "outro",
  });

  // KnowledgeEntities
  const entities = [];
  (extraction.people || []).forEach((p) =>
    entities.push({ type: "pessoa", value: p.name, context: p.context })
  );
  (extraction.companies || []).forEach((c) =>
    entities.push({ type: "empresa", value: c.name, context: c.context })
  );
  (extraction.dates || []).forEach((d) =>
    entities.push({ type: "data", value: d.value, context: d.context })
  );
  (extraction.values || []).forEach((v) =>
    entities.push({ type: "valor_monetario", value: v.value, context: v.context })
  );
  (extraction.phones || []).forEach((p) =>
    entities.push({ type: "telefone", value: p.value, context: p.context })
  );
  (extraction.emails || []).forEach((e) =>
    entities.push({ type: "email", value: e.value, context: e.context })
  );

  if (entities.length > 0) {
    await base44.entities.KnowledgeEntity.bulkCreate(
      entities.map((e) => ({
        document_id: doc.id,
        session_id: sessionId,
        project_id: projectId || undefined,
        source_type: "document",
        type: e.type,
        value: e.value,
        context: e.context,
        memory_tier: "active",
      }))
    );
  }

  // Keywords
  if (extraction.keywords && extraction.keywords.length > 0) {
    await base44.entities.Keyword.bulkCreate(
      extraction.keywords.map((k) => ({
        document_id: doc.id,
        session_id: sessionId,
        project_id: projectId || undefined,
        source_type: "document",
        keyword: k,
      }))
    );
  }

  // Decisions
  if (extraction.decisions && extraction.decisions.length > 0) {
    await base44.entities.Decision.bulkCreate(
      extraction.decisions.map((d) => ({
        session_id: sessionId,
        project_id: projectId || undefined,
        title: d.title,
        description: d.description,
        rationale: d.rationale,
      }))
    );
  }

  // Tasks
  if (extraction.tasks && extraction.tasks.length > 0) {
    await base44.entities.Task.bulkCreate(
      extraction.tasks.map((t) => ({
        session_id: sessionId,
        project_id: projectId || undefined,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        assignee: t.assignee,
      }))
    );
  }

  // Topics
  if (extraction.topics && extraction.topics.length > 0) {
    await base44.entities.Topic.bulkCreate(
      extraction.topics.map((t) => ({
        session_id: sessionId,
        project_id: projectId || undefined,
        name: t.name,
        description: t.description,
      }))
    );
  }

  // 7 — Finalizar
  onStage?.("finalizing");

  // Fase 1 — Observabilidade: sinaliza memória registrada
  try {
    cognitiveEventBus.emit("knowledge_observation_generated", sessionId || "", ingestionExecId, {
      source: "knowledge_ingestion",
      documentId: doc.id,
      stats: {
        entities: entities.length,
        keywords: extraction.keywords?.length || 0,
        decisions: extraction.decisions?.length || 0,
        tasks: extraction.tasks?.length || 0,
        topics: extraction.topics?.length || 0,
      },
    });
  } catch { /* fire-and-forget — observabilidade apenas */ }

  // 8 — Disparar email de automação PDF (se Watch ativo configurado)
  let emailSent = null;
  if (type === "pdf") {
    try {
      const pdfWatches = await base44.entities.Watch.filter({ status: "active", on_trigger_type: "emit_event" });
      const pdfWatch = pdfWatches.find((w) => {
        try {
          const p = JSON.parse(w.on_trigger_payload || "{}");
          return p?.type === "send_email" && p?.pipeline_steps?.length > 0;
        } catch { return false; }
      });

      if (pdfWatch) {
        const payload = JSON.parse(pdfWatch.on_trigger_payload);
        const { to, from, subject } = payload.email;
        const steps = payload.pipeline_steps || [];

        const emailBody = `Novo PDF processado pelo MemoryOS

Arquivo: ${displayName || file?.name || "PDF"}
Categoria: ${extraction.category || "outro"}

--- RESUMO ---
${extraction.summary || "Resumo não disponível"}

--- ETAPAS EXECUTADAS ---
${steps.map((s) => `✓ ${s}`).join("\n")}

--- ENTIDADES EXTRAÍDAS ---
Pessoas: ${(extraction.people || []).map((p) => p.name).join(", ") || "Nenhuma"}
Empresas: ${(extraction.companies || []).map((c) => c.name).join(", ") || "Nenhuma"}
Palavras-chave: ${(extraction.keywords || []).join(", ") || "Nenhuma"}

Processado automaticamente pelo MemoryOS Watch Engine.`;

        const finalSubject = subject || `Resumo do PDF: ${displayName || file?.name}`;
        const res = await base44.functions.invoke("sendPdfReport", {
          to,
          from: from || null,
          subject: finalSubject,
          body: emailBody,
        });

        console.log(`[PDF-AUTO] sendPdfReport resultado:`, res?.data);
        if (res?.data?.ok) {
          emailSent = { to, subject: finalSubject, messageId: res?.data?.messageId || null };
        }
      }
    } catch (err) {
      console.warn("[PDF-AUTO] Falha ao enviar email de automação:", err?.message);
      // Non-critical — não bloqueia o resultado do pipeline
    }
  }

  return {
    document: doc,
    displayName: displayName || file?.name || "Conteúdo",
    type,
    emailSent,
    stats: {
      entities: entities.length,
      keywords: extraction.keywords?.length || 0,
      decisions: extraction.decisions?.length || 0,
      tasks: extraction.tasks?.length || 0,
      topics: extraction.topics?.length || 0,
    },
  };
}