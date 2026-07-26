/**
 * DriveFlowTracer.ts — Instrumentação de diagnóstico
 * 
 * Rastreia cada etapa do fluxo de abertura de arquivos do Google Drive
 * para identificar divergências entre PDF e vídeo.
 */

interface FlowTrace {
  timestamp: string;
  input: string;
  intent?: string;
  entityExtraction?: {
    fileName: string | null;
    extension: string | null;
    typeInferred: string | null;
  };
  queryBuilder?: {
    finalQuery: string;
  };
  googleDriveAPI?: {
    resultCount: number;
    filesReturned: Array<{
      id: string;
      name: string;
      mimeType: string;
    }>;
  };
  selection?: {
    selectedFile: {
      id: string;
      name: string;
      mimeType: string;
    };
  };
  download?: {
    driveDownloadExecutorCalled: boolean;
  };
  processing?: {
    documentProcessingEngineCalled: boolean;
  };
  response?: {
    finalResponse: string;
  };
  errorAt?: string;
}

class DriveFlowTracer {
  private traces: FlowTrace[] = [];
  private currentTrace: FlowTrace | null = null;

  startTrace(userInput: string): void {
    this.currentTrace = {
      timestamp: new Date().toISOString(),
      input: userInput,
    };
  }

  recordIntent(goal: string): void {
    if (this.currentTrace) {
      this.currentTrace.intent = goal;
    }
  }

  recordEntityExtraction(fileName: string | null, extension: string | null, typeInferred: string | null): void {
    if (this.currentTrace) {
      this.currentTrace.entityExtraction = {
        fileName,
        extension,
        typeInferred,
      };
    }
  }

  recordQueryBuilder(query: string): void {
    if (this.currentTrace) {
      this.currentTrace.queryBuilder = {
        finalQuery: query,
      };
    }
  }

  recordGoogleDriveAPI(resultCount: number, files: Array<{ id: string; name: string; mimeType: string }>): void {
    if (this.currentTrace) {
      this.currentTrace.googleDriveAPI = {
        resultCount,
        filesReturned: files,
      };
    }
  }

  recordSelection(fileId: string, fileName: string, mimeType: string): void {
    if (this.currentTrace) {
      this.currentTrace.selection = {
        selectedFile: {
          id: fileId,
          name: fileName,
          mimeType,
        },
      };
    }
  }

  recordDownloadExecutor(called: boolean): void {
    if (this.currentTrace) {
      this.currentTrace.download = {
        driveDownloadExecutorCalled: called,
      };
    }
  }

  recordDocumentProcessing(called: boolean): void {
    if (this.currentTrace) {
      this.currentTrace.processing = {
        documentProcessingEngineCalled: called,
      };
    }
  }

  recordResponse(response: string): void {
    if (this.currentTrace) {
      this.currentTrace.response = {
        finalResponse: response,
      };
    }
  }

  recordError(stage: string): void {
    if (this.currentTrace) {
      this.currentTrace.errorAt = stage;
    }
  }

  endTrace(): void {
    if (this.currentTrace) {
      this.traces.push(this.currentTrace);
      this.logTrace(this.currentTrace);
      this.currentTrace = null;
    }
  }

  private logTrace(trace: FlowTrace): void {
    console.log("\n" + "=".repeat(80));
    console.log("📊 DRIVE FLOW TRACE");
    console.log("=".repeat(80));
    
    console.log("\n📝 INPUT ORIGINAL");
    console.log("─".repeat(80));
    console.log(`   ${trace.input}`);

    console.log("\n🎯 INTENT");
    console.log("─".repeat(80));
    console.log(`   ${trace.intent || "❌ NOT RECORDED"}`);

    console.log("\n🔍 ENTITY EXTRACTION");
    console.log("─".repeat(80));
    if (trace.entityExtraction) {
      console.log(`   Nome do arquivo: ${trace.entityExtraction.fileName || "null"}`);
      console.log(`   Extensão: ${trace.entityExtraction.extension || "null"}`);
      console.log(`   Tipo inferido: ${trace.entityExtraction.typeInferred || "null"}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n🔨 QUERY BUILDER");
    console.log("─".repeat(80));
    if (trace.queryBuilder) {
      console.log(`   ${trace.queryBuilder.finalQuery}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n☁️ GOOGLE DRIVE API");
    console.log("─".repeat(80));
    if (trace.googleDriveAPI) {
      console.log(`   Resultados: ${trace.googleDriveAPI.resultCount}`);
      if (trace.googleDriveAPI.resultCount > 0) {
        console.log(`   Arquivos retornados:`);
        trace.googleDriveAPI.filesReturned.forEach((f, i) => {
          console.log(`      [${i + 1}] ${f.name}`);
          console.log(`          ID: ${f.id}`);
          console.log(`          MIME: ${f.mimeType}`);
        });
      }
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n✅ SELECTION");
    console.log("─".repeat(80));
    if (trace.selection) {
      console.log(`   ${trace.selection.selectedFile.name}`);
      console.log(`   ID: ${trace.selection.selectedFile.id}`);
      console.log(`   MIME: ${trace.selection.selectedFile.mimeType}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n⬇️ DOWNLOAD");
    console.log("─".repeat(80));
    if (trace.download) {
      console.log(`   DriveDownloadExecutor chamado? ${trace.download.driveDownloadExecutorCalled ? "✅ SIM" : "❌ NÃO"}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n⚙️ PROCESSING");
    console.log("─".repeat(80));
    if (trace.processing) {
      console.log(`   DocumentProcessingEngine chamado? ${trace.processing.documentProcessingEngineCalled ? "✅ SIM" : "❌ NÃO"}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    console.log("\n💬 RESPONSE");
    console.log("─".repeat(80));
    if (trace.response) {
      console.log(`   ${trace.response.finalResponse.substring(0, 150)}${trace.response.finalResponse.length > 150 ? "..." : ""}`);
    } else {
      console.log("   ❌ NOT RECORDED");
    }

    if (trace.errorAt) {
      console.log("\n❌ ERROR");
      console.log("─".repeat(80));
      console.log(`   Falha em: ${trace.errorAt}`);
    }

    console.log("\n" + "=".repeat(80) + "\n");
  }

  getAllTraces(): FlowTrace[] {
    return this.traces;
  }

  exportAsJSON(): string {
    return JSON.stringify(this.traces, null, 2);
  }

  exportAsCSV(): string {
    const headers = ["Timestamp", "Input", "Intent", "FileName", "Extension", "TypeInferred", "Query", "APIResults", "DownloadCalled", "ProcessingCalled", "ErrorAt"];
    const rows = this.traces.map(t => [
      t.timestamp,
      t.input,
      t.intent || "-",
      t.entityExtraction?.fileName || "-",
      t.entityExtraction?.extension || "-",
      t.entityExtraction?.typeInferred || "-",
      t.queryBuilder?.finalQuery || "-",
      t.googleDriveAPI?.resultCount || "-",
      t.download?.driveDownloadExecutorCalled ? "SIM" : "NÃO",
      t.processing?.documentProcessingEngineCalled ? "SIM" : "NÃO",
      t.errorAt || "-",
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
  }
}

export const driveFlowTracer = new DriveFlowTracer();
