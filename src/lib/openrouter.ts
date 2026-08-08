/**
 * @deprecated Use `@/lib/llm` (NVIDIA primary + OpenRouter fallback).
 * Kept as a thin re-export for any leftover imports.
 */
export { llmChat as openRouterChat, LlmError as OpenRouterError } from "@/lib/llm";
export type { ChatMessage } from "@/lib/llm";
