import { base44 } from "@/api/base44Client";

/**
 * Memory Engine — Motor de processamento automático de documentos.
 * Transforma um arquivo enviado em conhecimento estruturado.
 *
 * Fluxo:
 * 1. Extrair texto do arquivo (se ainda não feito)
 * 2. LLM extrai: resumo, categoria, entidades, palavras-chave, eventos (1 chamada)
 * 3. Salvar tudo no banco de conhecimento
 * 4. Criar eventos na timeline automaticamente
 */

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resumo conciso do documento em português (máx 300 palavras)" },
    category: {
      type: "string",
      enum: ["contrato", "financeiro", "marketing", "produto", "juridico", "comercial", "atendimento", "reuniao", "planejamento", "outro"],
      description: "Categoria do documento"
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "10-20 palavras-chave relevantes em português"
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pessoa", "empresa", "organizacao", "produto", "local", "data", "horario", "numero", "valor_monetario", "telefone", "email", "site"] },
          value: { type: "string", description: "Valor da entidade" },
          context: { type: "string", description: "Trecho onde foi mencionada" }
        },
        required: ["type", "value"]
      },
      description: "Entidades mencionadas no documento"
    },
    timeline_events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título do evento" },
          description: { type: "string", description: "Descrição do evento" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD (se mencionada)" },
          category: { type: "string", description: "Categoria do evento (ex: assinatura, lancamento, pagamento)" }
        },
        required: ["title"]
      },
      description: "Eventos importantes mencionados no documento"
    }
  },
  required: ["summary", "category", "keywords", "entities"]
};

/**
 * Processa um documento completo: extrai texto, gera resumo, entidades, keywords, eventos.
 * @param {Object} document - Documento já criado no banco
 * @param {Function} onProgress - Callback(status) para atualizar UI
 */
export async function processDocument(document, onProgress) {
  const update = (status) => {
    onProgress?.(status);
    return base44.entities.Document.update(document.id, { processing_status: status });
  };

  try {
    await update("processing");

    // --- Etapa 1: Extrair texto ---
    let extractedText = document.extracted_text || "";

    if (!extractedText && document.file_type !== "txt") {
      try {
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: document.file_url,
          json_schema: {
            type: "object",
            properties: { text: { type: "string", description: "Full text content" } },
            required: ["text"]
          }
        });
        if (result.status === "success" && result.output?.text) {
          extractedText = result.output.text;
        }
      } catch (e) { /* try text file fallback */ }
    }

    if (!extractedText && document.file_type === "txt") {
      try {
        const res = await fetch(document.file_url);
        extractedText = await res.text();
      } catch (e) { /* skip */ }
    }

    if (!extractedText) {
      await update("failed");
      return { success: false, error: "Não foi possível extrair texto do arquivo." };
    }

    // Save extracted text
    await base44.entities.Document.update(document.id, { extracted_text: extractedText });

    // --- Etapa 2: LLM extrai tudo ---
    const truncatedText = extractedText.substring(0, 12000);

    const knowledge = await base44.integrations.Core.InvokeLLM({
      prompt: `Analise o documento abaixo e extraia conhecimento estruturado.
Responda SEMPRE em português brasileiro.

DOCUMENTO: ${document.name}

CONTEÚDO:
${truncatedText}

Extraia:
1. Um resumo conciso do documento
2. A categoria mais adequada
3. Palavras-chave relevantes (10-20)
4. Todas as entidades mencionadas (pessoas, empresas, organizações, produtos, locais, datas, valores, telefones, emails, sites)
5. Eventos importantes que merecem entrar na linha do tempo (apenas se houver datas ou eventos concretos)`,
      response_json_schema: EXTRACTION_SCHEMA,
    });

    // --- Etapa 3: Salvar conhecimento estruturado ---
    const docUpdates = {
      summary: knowledge.summary,
      category: knowledge.category,
      processing_status: "completed",
    };
    await base44.entities.Document.update(document.id, docUpdates);

    // Keywords em lote
    if (knowledge.keywords?.length) {
      await base44.entities.Keyword.bulkCreate(
        knowledge.keywords.map((kw) => ({
          document_id: document.id,
          project_id: document.project_id,
          keyword: kw.toLowerCase().trim(),
        }))
      );
    }

    // Entidades em lote
    if (knowledge.entities?.length) {
      const validEntities = knowledge.entities
        .filter((e) => e.type && e.value)
        .map((e) => ({
          document_id: document.id,
          project_id: document.project_id,
          type: e.type,
          value: e.value,
          context: e.context || "",
        }));
      if (validEntities.length) {
        await base44.entities.KnowledgeEntity.bulkCreate(validEntities);
      }
    }

    // Eventos na timeline
    if (knowledge.timeline_events?.length) {
      for (const evt of knowledge.timeline_events) {
        if (evt.title && evt.date) {
          await base44.entities.TimelineEvent.create({
            project_id: document.project_id,
            title: evt.title,
            description: evt.description || "",
            event_date: evt.date,
            category: evt.category || "Documento",
          });
        }
      }
    }

    onProgress?.("completed");
    return { success: true, knowledge };
  } catch (error) {
    await update("failed");
    onProgress?.("failed");
    return { success: false, error: error.message };
  }
}