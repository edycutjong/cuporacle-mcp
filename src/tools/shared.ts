/**
 * Shared helpers for tool handlers: uniform success/error result shapes and a
 * wrapper that turns thrown CupOracleErrors into typed, non-crashing tool
 * results (isError: true) that teach the fix.
 */
import type { ZodRawShape } from "zod";
import { CupOracleError } from "../errors.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** A registrable tool: name + config (schemas/metadata) + handler. */
export interface ToolDef {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: ZodRawShape;
    outputSchema?: ZodRawShape;
    annotations?: {
      title?: string;
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  };
  handler: (args: any) => Promise<ToolResult>;
}

/** Success result carrying both a human summary and structured content. */
export function ok(structured: Record<string, unknown>, summary?: string): ToolResult {
  return {
    content: [{ type: "text", text: summary ?? JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/** Typed error result (never throws to the transport; the agent can react). */
export function fail(err: unknown): ToolResult {
  if (err instanceof CupOracleError) {
    return {
      content: [{ type: "text", text: JSON.stringify(err.toJSON(), null, 2) }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: "INTERNAL", message }, null, 2) }],
    isError: true,
  };
}

/** Wrap an async handler so thrown errors become typed tool results. */
export function guard<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

export const FOOTBALL_ATTRIBUTION = "Football data provided by the Football-Data.org API.";
