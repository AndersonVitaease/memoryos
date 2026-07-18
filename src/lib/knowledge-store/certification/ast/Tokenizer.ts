// Tokenizer.ts — Sprint EF-39.6
// Splits source into tokens. SRP: only tokenizes.

export type TokenKind = "import" | "class" | "interface" | "export" | "function" | "other";

export interface Token {
  readonly kind:    TokenKind;
  readonly line:    number;
  readonly text:    string;
}

export const Tokenizer = Object.freeze({
  tokenize(source: string): readonly Token[] {
    const tokens: Token[] = [];
    const lines = source.split("\n");

    lines.forEach((text, idx) => {
      const t = text.trim();
      const line = idx + 1;
      if (/^\s*import\s/.test(text))                                       tokens.push(Object.freeze({ kind: "import",    line, text }));
      else if (/^\s*(?:export\s+)?(?:abstract\s+)?class\s+/.test(text))   tokens.push(Object.freeze({ kind: "class",     line, text }));
      else if (/^\s*(?:export\s+)?interface\s+/.test(text))               tokens.push(Object.freeze({ kind: "interface", line, text }));
      else if (/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|type|enum|interface)\s+/.test(text)) {
                                                                           tokens.push(Object.freeze({ kind: "export",    line, text }));
      }
      else if (/^\s+(?:(?:private|public|protected|static|async|override|abstract)\s+)*(?:async\s+)?(\w+)\s*\(/.test(text)) {
                                                                           tokens.push(Object.freeze({ kind: "function",  line, text }));
      }
    });

    return Object.freeze(tokens);
  },
});