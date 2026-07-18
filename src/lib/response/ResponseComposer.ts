// ResponseComposer.ts — Sprint EF-36.1
// The ONLY component that converts StructuredResponse → natural language text.
// Never makes authorization decisions.

import type { StructuredResponse, ResponseFact, ResponseAction, ResponseReasoning, ResponseComponent } from "./StructuredResponse";

export type ComposerFormat = "text" | "markdown" | "json" | "voice";

export interface ComposedResponse {
  text: string;
  format: ComposerFormat;
  factCount: number;
  actionCount: number;
  reasoningCount: number;
  componentCount: number;
}

export const ResponseComposer = {
  compose(sr: StructuredResponse, format: ComposerFormat = "text"): ComposedResponse {
    switch (format) {
      case "json":     return composeJson(sr);
      case "markdown": return composeMarkdown(sr);
      case "voice":    return composeVoice(sr);
      default:         return composeText(sr);
    }
  },

  // Compose only what is present — no authorization checks
  composeText(sr: StructuredResponse): string {
    return composeText(sr).text;
  },
};

function composeText(sr: StructuredResponse): ComposedResponse {
  const parts: string[] = [];

  if (sr.facts.length > 0) {
    parts.push(sr.facts.map(f => f.text).join(" "));
  }
  if (sr.actions.length > 0) {
    parts.push(sr.actions.map(a => `${a.title}: ${a.description}`).join(" "));
  }
  if (sr.reasoning.length > 0) {
    parts.push(sr.reasoning.map(r => r.text).join(" "));
  }
  if (sr.components.length > 0) {
    parts.push(sr.components.map(c => `${c.name} (${c.role})`).join(", ") + ".");
  }
  if (sr.warnings && sr.warnings.length > 0) {
    parts.push("Note: " + sr.warnings.map(w => w.text).join("; "));
  }
  if (sr.examples && sr.examples.length > 0) {
    parts.push("Example: " + sr.examples.map(e => e.text).join(" "));
  }

  return {
    text: parts.filter(Boolean).join("\n\n").trim() || "(no authorized content)",
    format: "text",
    factCount:      sr.facts.length,
    actionCount:    sr.actions.length,
    reasoningCount: sr.reasoning.length,
    componentCount: sr.components.length,
  };
}

function composeMarkdown(sr: StructuredResponse): ComposedResponse {
  const lines: string[] = [];

  if (sr.facts.length > 0) {
    lines.push("## Facts");
    sr.facts.forEach(f => lines.push(`- ${f.text}`));
  }
  if (sr.actions.length > 0) {
    lines.push("\n## Actions");
    sr.actions.forEach(a => lines.push(`**${a.title}**: ${a.description}`));
  }
  if (sr.reasoning.length > 0) {
    lines.push("\n## Reasoning");
    sr.reasoning.forEach(r => lines.push(`> ${r.text}`));
  }
  if (sr.components.length > 0) {
    lines.push("\n## Components");
    sr.components.forEach(c => lines.push(`- **${c.name}**: ${c.role}`));
  }

  return {
    text: lines.join("\n").trim() || "(no authorized content)",
    format: "markdown",
    factCount:      sr.facts.length,
    actionCount:    sr.actions.length,
    reasoningCount: sr.reasoning.length,
    componentCount: sr.components.length,
  };
}

function composeVoice(sr: StructuredResponse): ComposedResponse {
  // Voice: facts only, short sentences
  const text = sr.facts.length > 0
    ? sr.facts.map(f => f.text).join(". ")
    : sr.actions.length > 0
      ? sr.actions.map(a => a.description).join(". ")
      : "(no authorized content)";
  return {
    text,
    format: "voice",
    factCount:      sr.facts.length,
    actionCount:    sr.actions.length,
    reasoningCount: sr.reasoning.length,
    componentCount: sr.components.length,
  };
}

function composeJson(sr: StructuredResponse): ComposedResponse {
  return {
    text: JSON.stringify(sr, null, 2),
    format: "json",
    factCount:      sr.facts.length,
    actionCount:    sr.actions.length,
    reasoningCount: sr.reasoning.length,
    componentCount: sr.components.length,
  };
}