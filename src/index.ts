export { loadConfig, saveConfig, ensureDataDir, getDataDir, getConfigValue, setConfigValue, resolveApiKey } from "./config/index.js";
export type { CMHConfig, WriterConfig } from "./config/index.js";
export {
  openDb,
  closeDb,
  indexDocument,
  storeEvent,
  getRecentEvents,
  getIndexedDocuments,
  createWriterJob,
  updateWriterJob,
  getPendingWriterJobs,
  getWriterJob,
  getRecentWriterJobs,
} from "./storage/index.js";
export type { StoredDocument, StoredEvent, WriterJob } from "./storage/index.js";
export { resolveProjectId } from "./storage/index.js";
export type { ProjectInfo } from "./storage/index.js";
export { readMemory, writeMemory, appendMemory, listMemoryFiles } from "./storage/index.js";
export type { MemoryScope, MemoryFile } from "./storage/index.js";
export { searchMemory, getMemoryContext } from "./search/index.js";
export type { SearchResult } from "./search/index.js";
export { parseTranscript, parseTranscriptFile, getTranscriptTail } from "./transcript/index.js";
export type { TranscriptEntry, ParsedTranscript, ToolEvent } from "./transcript/index.js";
export { buildSessionContext, buildPromptContext } from "./inject/index.js";
export { buildHandoffMarkdown, writeHandoff } from "./handoff/index.js";
export type { HandoffInput } from "./handoff/index.js";
export { callWriter, parseWriterOutput, buildWriterPrompt, createMockWriterOutput, applyMemoryPatch } from "./writer/index.js";
export type { WriterInput, WriterOutput } from "./writer/index.js";
export { redactSecrets, redactEnvValues, redactText, redactValue, containsSecret } from "./redaction/index.js";
export { generateId, sha256, truncate, log, initLogger } from "./utils/index.js";
