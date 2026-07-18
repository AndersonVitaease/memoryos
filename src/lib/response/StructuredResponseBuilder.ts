// StructuredResponseBuilder.ts — Sprint EF-36.1
// Fluent builder for constructing StructuredResponse objects

import type {
  StructuredResponse, ResponseFact, ResponseReasoning,
  ResponseAction, ResponseComponent, ResponseExample,
  ResponseWarning, ResponseMetadata, JustificationTag,
} from "./StructuredResponse";
import type { KnowledgeClassification } from "@/lib/disclosure/DisclosureTypes";

let _seq = 0;
const uid = () => `sr-${Date.now()}-${++_seq}`;

export class StructuredResponseBuilder {
  private _facts:      ResponseFact[]      = [];
  private _reasoning:  ResponseReasoning[] = [];
  private _actions:    ResponseAction[]    = [];
  private _components: ResponseComponent[] = [];
  private _examples:   ResponseExample[]   = [];
  private _warnings:   ResponseWarning[]   = [];
  private _citations:  string[]            = [];
  private _confidence  = 1.0;
  private _metadata: ResponseMetadata = {
    generatedBy:     "MemoryOS",
    pipelineVersion: "EF-36.1",
    timestamp:       Date.now(),
    confidence:      1.0,
    knowledgeSources: [],
    justificationTags: [],
  };

  addFact(text: string, classification: KnowledgeClassification = "PUBLIC"): this {
    this._facts.push({ id: uid(), text, classification });
    return this;
  }

  addReasoning(text: string, classification: KnowledgeClassification = "ENGINEERING"): this {
    this._reasoning.push({ id: uid(), text, classification });
    return this;
  }

  addAction(title: string, description: string, classification: KnowledgeClassification = "PUBLIC"): this {
    this._actions.push({ id: uid(), title, description, classification });
    return this;
  }

  addComponent(name: string, role: string, classification: KnowledgeClassification = "ENGINEERING"): this {
    this._components.push({ id: uid(), name, role, classification });
    return this;
  }

  addExample(text: string, classification: KnowledgeClassification = "PUBLIC"): this {
    this._examples.push({ id: uid(), text, classification });
    return this;
  }

  addWarning(text: string, classification: KnowledgeClassification = "PUBLIC"): this {
    this._warnings.push({ id: uid(), text, classification });
    return this;
  }

  addCitation(src: string): this {
    this._citations.push(src);
    return this;
  }

  setConfidence(c: number): this {
    this._confidence = c;
    this._metadata.confidence = c;
    return this;
  }

  setGeneratedBy(name: string): this {
    this._metadata.generatedBy = name;
    return this;
  }

  setSpecialist(name: string): this {
    this._metadata.specialist = name;
    return this;
  }

  addKnowledgeSource(src: string): this {
    this._metadata.knowledgeSources.push(src);
    return this;
  }

  addJustificationTag(tag: JustificationTag): this {
    this._metadata.justificationTags.push(tag);
    return this;
  }

  build(): StructuredResponse {
    return {
      facts:      [...this._facts],
      reasoning:  [...this._reasoning],
      actions:    [...this._actions],
      components: [...this._components],
      examples:   [...this._examples],
      warnings:   [...this._warnings],
      citations:  [...this._citations],
      confidence: this._confidence,
      metadata:   { ...this._metadata, timestamp: Date.now() },
    };
  }

  // Static factory
  static create(): StructuredResponseBuilder {
    return new StructuredResponseBuilder();
  }
}