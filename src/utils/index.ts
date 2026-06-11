import { createHash, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

export function generateId(): string {
  return randomUUID();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n...[truncated]";
}

let logPath: string | null = null;

export function initLogger(dataDir: string): void {
  logPath = join(dataDir, "logs", "cmh.log");
}

export function log(level: string, message: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const line = data
    ? `[${ts}] ${level} ${message} ${JSON.stringify(data)}\n`
    : `[${ts}] ${level} ${message}\n`;
  if (logPath) {
    try {
      appendFileSync(logPath, line);
    } catch {
      // ignore log write failures
    }
  }
  if (level === "ERROR") {
    process.stderr.write(`cmh: ${message}\n`);
  }
}
