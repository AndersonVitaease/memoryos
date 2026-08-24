export class EngineeringError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "EngineeringError";
  }
}

export type AuthenticatedSubject = {
  subject: string;
  scopes: string[];
};

export type RepositoryPolicy = {
  authorizedRoot: string;
  resolve: (relativePath: string) => Promise<{ absolutePath: string; relativePath: string }>;
  resolveGitStageable: (relativePath: string) => Promise<{ absolutePath: string; relativePath: string }>;
  resolveWritable: (relativePath: string) => Promise<{ absolutePath: string; relativePath: string; parentPath: string }>;
  readUtf8: (relativePath: string, maxBytes: number) => Promise<{ text: string; relativePath: string }>;
  assertReadableExtension: (relativePath: string) => void;
};

export function assertNoSensitiveContent(content: string | Buffer): void {
  const text = typeof content === "string" ? content : content.toString("utf8", 0, 4096);
  const lower = text.toLowerCase();
  const forbidden = [
    "bearer ", "authorization:", "token=", "password=", "secret=",
    "private_key", "api_key", "access_token", "refresh_token",
    "aws_secret", "azure_key", "gcp_key"
  ];
  for (const pattern of forbidden) {
    if (lower.includes(pattern)) {
      throw new EngineeringError("SENSITIVE_CONTENT_BLOCKED");
    }
  }
}