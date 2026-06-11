import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { redactSecrets, redactEnvValues, containsSecret } from "./index.js";

describe("redaction", () => {
  it("redacts OpenAI API keys", () => {
    const text = "Using key sk-proj-abc123def456ghi789jkl012mno345pqr678";
    expect(redactSecrets(text)).toContain("[REDACTED]");
    expect(redactSecrets(text)).not.toContain("sk-proj-");
  });

  it("redacts Anthropic API keys", () => {
    const text = "key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("redacts GitHub tokens", () => {
    const text = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("redacts AWS access keys", () => {
    const text = "AKIAIOSFODNN7EXAMPLE";
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("redacts private keys", () => {
    const text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("redacts password assignments", () => {
    const text = 'password: "super_secret_123"';
    expect(redactSecrets(text)).toContain("[REDACTED]");
  });

  it("does not redact normal text", () => {
    const text = "Hello, this is a normal message about coding.";
    expect(redactSecrets(text)).toBe(text);
  });

  it("redacts environment variable values", () => {
    const text = "The token is abc123def456ghi789 in the request";
    const env = { MY_TOKEN: "abc123def456ghi789" };
    const result = redactEnvValues(text, env);
    expect(result).toContain("$MY_TOKEN");
    expect(result).not.toContain("abc123def456ghi789");
  });

  it("detects secrets in text", () => {
    expect(containsSecret("sk-proj-abc123def456ghi789jkl012mno345pqr678")).toBe(true);
    expect(containsSecret("normal text without secrets")).toBe(false);
  });
});
