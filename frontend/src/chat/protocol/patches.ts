/**
 * Codex-style protocol: patch, plan, and token-usage types.
 *
 * Pure type definitions, no runtime code beyond small helpers.
 * Re-exports ToolResult from the existing tools/base.ts so the
 * rest of the protocol can reference a single canonical result type.
 */

import type { ToolResult } from "@/lib/tools/base";

export type { ToolResult };

/** What kind of file operation a ProposedPatch represents. */
export type PatchKind = "create" | "delete" | "modify" | "rename";

/** Heuristic risk level used by the UI to colour approval buttons. */
export type RiskLevel = "high" | "low" | "medium";

/** A file edit proposed by the model, not yet applied to disk. */
export interface ProposedPatch {
  /** Optional human-readable summary (e.g. "rename to utils.ts"). */
  description?: string;
  /** Original file contents. `null` for create. */
  before: null | string;
  /** New file contents. `null` for delete. */
  after: null | string;
  /** Absolute or workspace-relative path. */
  filePath: string;
  /** Patch identifier (uuid/nanoid). */
  patchId: string;
  /** What kind of operation this is. */
  kind: PatchKind;
  /** Why the model is proposing this change. */
  reason?: string;
  /** For rename only: the destination path. */
  renamedTo?: string;
  /** Heuristic risk to surface in the approval UI. */
  riskLevel: RiskLevel;
}

/** Outcome of actually writing a patch to disk. */
export interface ApplyResult {
  /** Bytes written to disk (0 for delete / failed). */
  bytesWritten?: number;
  /** Unified diff produced (for the approval UI / logs). */
  diff?: string;
  /** Error message when success is false. */
  error?: string;
  /** True when the file on disk now matches `after`. */
  success: boolean;
}

/** A single step in a plan emitted via the update_plan tool. */
export interface PlanItem {
  /** Present-tense verb form (e.g. "Running tests"). */
  activeForm?: string;
  /** Human-readable description of the step. */
  content: string;
  /** Stable identifier within a single plan. */
  id: string;
  /** Step lifecycle. */
  status: "completed" | "in_progress" | "pending";
}

/** Token usage accounting for a single turn. */
export interface TokenUsage {
  /** Optional estimated cost in USD. */
  cost?: number;
  /** Input / prompt tokens consumed. */
  input: number;
  /** Output / completion tokens generated. */
  output: number;
  /** input + output + cached. */
  total: number;
}

/** Strongly-typed tool call result (already in base.ts, mirrored here for ergonomics). */
export type ProtocolToolResult = ToolResult;
