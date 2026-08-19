/**
 * Codex-style protocol: strongly-typed event stream + session reducer.
 *
 * Every chat turn emits an ordered sequence of ChatEvent values.
 * The reducer is a pure function: (state, event) -> state.
 *
 * Nothing in this file imports React, DOM, or Wails. The UI layer
 * is a pure projection of ChatSession.
 */

import type { ApplyResult, PlanItem, ProposedPatch, TokenUsage } from "./patches";
import type { ToolResult } from "@/lib/tools/base";

/** Identifies a single model turn within a session. */
export type TurnId = string;

/** Identifies a single message within a turn. */
export type MessageId = string;

/** Identifies a single tool invocation. */
export type ToolCallId = string;

/** Identifies a single proposed patch. */
export type PatchId = string;

/** High-level session lifecycle. */
export type SessionStatus =
  | "cancelled"
  | "error"
  | "idle"
  | "streaming"
  | "waiting_approval";

/** A streamed text segment belonging to a message. */
export interface TextSegment {
  /** Streamed so far (may grow with each text_delta). */
  content: string;
  messageId: MessageId;
  /** Has the server signalled text_done? */
  done: boolean;
}

/** A streamed reasoning/think segment. */
export interface ReasoningSegment {
  content: string;
  messageId: MessageId;
  done: boolean;
}

/** In-flight tool call state. */
export interface SessionToolCall {
  /** Tool name (ReadFile, WriteFile, ApplyPatch, ...). */
  name: string;
  /** Raw args text as it streams in (JSON). */
  argsText: string;
  /** Parsed args once args_done fires. */
  parsedArgs: Record<string, unknown> | null;
  /** Final result, populated on tool_call_result. */
  result: ToolResult | null;
  toolCallId: ToolCallId;
  status: "args_done" | "args_streaming" | "complete" | "pending_result";
}

/** In-flight patch state. */
export interface SessionPatch {
  patch: ProposedPatch;
  /** Diff string computed at propose time, kept for the approval card. */
  diff: string;
  status: "approved" | "applied" | "proposed" | "rejected";
  /** Set when status reaches "applied". */
  result: ApplyResult | null;
}

/** ------------------------------------------------------------------------- */
/** Event union                                                                */
/** ------------------------------------------------------------------------- */

interface BaseEvent {
  /** When the event was produced (ms since epoch). */
  timestamp: number;
  /** Which turn this event belongs to. */
  turnId: TurnId;
  /** Discriminator. */
  type: string;
}

export interface TurnStartedEvent extends BaseEvent {
  type: "turn_started";
}

export interface TurnCompleteEvent extends BaseEvent {
  type: "turn_complete";
  status: "cancelled" | "error" | "success";
  error?: string;
}

export interface TextDeltaEvent extends BaseEvent {
  type: "text_delta";
  messageId: MessageId;
  delta: string;
}

export interface TextDoneEvent extends BaseEvent {
  type: "text_done";
  messageId: MessageId;
}

export interface ReasoningDeltaEvent extends BaseEvent {
  type: "reasoning_delta";
  messageId: MessageId;
  delta: string;
}

export interface ReasoningDoneEvent extends BaseEvent {
  type: "reasoning_done";
  messageId: MessageId;
}

export interface ToolCallBeginEvent extends BaseEvent {
  type: "tool_call_begin";
  toolCallId: ToolCallId;
  name: string;
}

export interface ToolCallArgsDeltaEvent extends BaseEvent {
  type: "tool_call_args_delta";
  toolCallId: ToolCallId;
  delta: string;
}

export interface ToolCallArgsDoneEvent extends BaseEvent {
  type: "tool_call_args_done";
  toolCallId: ToolCallId;
  /** Parsed JSON args, may be null if parsing failed. */
  parsedArgs: Record<string, unknown> | null;
}

export interface ToolCallResultEvent extends BaseEvent {
  type: "tool_call_result";
  toolCallId: ToolCallId;
  result: ToolResult;
}

export interface PatchProposedEvent extends BaseEvent {
  type: "patch_proposed";
  patch: ProposedPatch;
  diff: string;
}

export interface PatchApprovedEvent extends BaseEvent {
  type: "patch_approved";
  patchId: PatchId;
}

export interface PatchRejectedEvent extends BaseEvent {
  type: "patch_rejected";
  patchId: PatchId;
}

export interface PatchAppliedEvent extends BaseEvent {
  type: "patch_applied";
  patchId: PatchId;
  result: ApplyResult;
}

export interface PlanDeltaEvent extends BaseEvent {
  type: "plan_delta";
  items: PlanItem[];
}

export interface PlanItemCompletedEvent extends BaseEvent {
  type: "plan_item_completed";
  itemId: string;
}

export interface PlanCompleteEvent extends BaseEvent {
  type: "plan_complete";
}

export interface TokenUsageEvent extends BaseEvent {
  type: "token_usage";
  usage: TokenUsage;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  message: string;
  /** Whether the error is fatal (turn ends) or recoverable. */
  fatal: boolean;
}

export type ChatEvent =
  | ErrorEvent
  | PatchAppliedEvent
  | PatchApprovedEvent
  | PatchProposedEvent
  | PatchRejectedEvent
  | PlanCompleteEvent
  | PlanDeltaEvent
  | PlanItemCompletedEvent
  | ReasoningDeltaEvent
  | ReasoningDoneEvent
  | TextDeltaEvent
  | TextDoneEvent
  | TokenUsageEvent
  | ToolCallArgsDeltaEvent
  | ToolCallArgsDoneEvent
  | ToolCallBeginEvent
  | ToolCallResultEvent
  | TurnCompleteEvent
  | TurnStartedEvent;

/** ------------------------------------------------------------------------- */
/** Session state                                                              */
/** ------------------------------------------------------------------------- */

export interface ChatSession {
  turnId: TurnId | null;
  status: SessionStatus;
  lastError: string | null;
  textSegments: Record<MessageId, TextSegment>;
  reasoningSegments: Record<MessageId, ReasoningSegment>;
  toolCalls: Record<ToolCallId, SessionToolCall>;
  patches: Record<PatchId, SessionPatch>;
  plan: PlanItem[];
  planComplete: boolean;
  usage: TokenUsage;
}

export function createInitialSession(): ChatSession {
  return {
    lastError: null,
    patches: {},
    plan: [],
    planComplete: false,
    reasoningSegments: {},
    status: "idle",
    textSegments: {},
    toolCalls: {},
    turnId: null,
    usage: { input: 0, output: 0, total: 0 },
  };
}

export function emptyTokenUsage(): TokenUsage {
  return { input: 0, output: 0, total: 0 };
}

/** ------------------------------------------------------------------------- */
/** Reducer                                                                    */
/** ------------------------------------------------------------------------- */

function ensureTurn(state: ChatSession, turnId: TurnId): ChatSession {
  if (state.turnId === turnId) return state;
  return { ...state, turnId };
}

function upsertText(state: ChatSession, messageId: MessageId, delta: string, done: boolean): ChatSession {
  const existing = state.textSegments[messageId];
  const next: TextSegment = existing
    ? { content: existing.content + delta, done: done || existing.done, messageId }
    : { content: delta, done, messageId };
  return { ...state, textSegments: { ...state.textSegments, [messageId]: next } };
}

function upsertReasoning(state: ChatSession, messageId: MessageId, delta: string, done: boolean): ChatSession {
  const existing = state.reasoningSegments[messageId];
  const next: ReasoningSegment = existing
    ? { content: existing.content + delta, done: done || existing.done, messageId }
    : { content: delta, done, messageId };
  return { ...state, reasoningSegments: { ...state.reasoningSegments, [messageId]: next } };
}

export function reduceSession(state: ChatSession, event: ChatEvent): ChatSession {
  switch (event.type) {
    case "turn_started": {
      return {
        ...ensureTurn(state, event.turnId),
        lastError: null,
        patches: {},
        plan: [],
        planComplete: false,
        reasoningSegments: {},
        status: "streaming",
        textSegments: {},
        toolCalls: {},
        usage: emptyTokenUsage(),
      };
    }
    case "turn_complete": {
      const status: SessionStatus =
        event.status === "success" ? "idle" : event.status === "cancelled" ? "cancelled" : "error";
      return {
        ...state,
        lastError: event.status === "error" ? event.error ?? "turn failed" : state.lastError,
        status,
      };
    }
    case "text_delta":
      return upsertText(ensureTurn(state, event.turnId), event.messageId, event.delta, false);
    case "text_done":
      return upsertText(ensureTurn(state, event.turnId), event.messageId, "", true);
    case "reasoning_delta":
      return upsertReasoning(ensureTurn(state, event.turnId), event.messageId, event.delta, false);
    case "reasoning_done":
      return upsertReasoning(ensureTurn(state, event.turnId), event.messageId, "", true);
    case "tool_call_begin": {
      const tc: SessionToolCall = {
        argsText: "",
        name: event.name,
        parsedArgs: null,
        result: null,
        status: "args_streaming",
        toolCallId: event.toolCallId,
      };
      return {
        ...ensureTurn(state, event.turnId),
        toolCalls: { ...state.toolCalls, [event.toolCallId]: tc },
      };
    }
    case "tool_call_args_delta": {
      const existing = state.toolCalls[event.toolCallId];
      if (!existing) return state;
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [event.toolCallId]: { ...existing, argsText: existing.argsText + event.delta, status: "args_streaming" },
        },
      };
    }
    case "tool_call_args_done": {
      const existing = state.toolCalls[event.toolCallId];
      if (!existing) return state;
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [event.toolCallId]: { ...existing, parsedArgs: event.parsedArgs, status: "args_done" },
        },
      };
    }
    case "tool_call_result": {
      const existing = state.toolCalls[event.toolCallId];
      if (!existing) return state;
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [event.toolCallId]: { ...existing, result: event.result, status: "complete" },
        },
      };
    }
    case "patch_proposed": {
      const sp: SessionPatch = {
        diff: event.diff,
        patch: event.patch,
        result: null,
        status: "proposed",
      };
      return {
        ...ensureTurn(state, event.turnId),
        patches: { ...state.patches, [event.patch.patchId]: sp },
        status: "waiting_approval",
      };
    }
    case "patch_approved": {
      const existing = state.patches[event.patchId];
      if (!existing) return state;
      return {
        ...state,
        patches: { ...state.patches, [event.patchId]: { ...existing, status: "approved" } },
      };
    }
    case "patch_rejected": {
      const existing = state.patches[event.patchId];
      if (!existing) return state;
      return {
        ...state,
        patches: { ...state.patches, [event.patchId]: { ...existing, status: "rejected" } },
      };
    }
    case "patch_applied": {
      const existing = state.patches[event.patchId];
      if (!existing) return state;
      return {
        ...state,
        patches: { ...state.patches, [event.patchId]: { ...existing, result: event.result, status: "applied" } },
      };
    }
    case "plan_delta":
      return { ...ensureTurn(state, event.turnId), plan: event.items, planComplete: false };
    case "plan_item_completed": {
      const items = state.plan.map((it) => (it.id === event.itemId ? { ...it, status: "completed" as const } : it));
      return { ...state, plan: items };
    }
    case "plan_complete":
      return { ...state, planComplete: true };
    case "token_usage": {
      return { ...state, usage: event.usage };
    }
    case "error": {
      return {
        ...state,
        lastError: event.message,
        status: event.fatal ? "error" : state.status,
      };
    }
    default: {
      // Exhaustiveness check: if a new event variant is added and not
      // handled, this line will fail to compile. Do not remove.
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
}

/** ------------------------------------------------------------------------- */
/** Convenience constructors                                                   */
/** ------------------------------------------------------------------------- */

export function nowMs(): number {
  return Date.now();
}

export function makeTurnStarted(turnId: TurnId): TurnStartedEvent {
  return { timestamp: nowMs(), turnId, type: "turn_started" };
}

export function makeTurnComplete(turnId: TurnId, status: "cancelled" | "error" | "success", error?: string): TurnCompleteEvent {
  return { error, status, timestamp: nowMs(), turnId, type: "turn_complete" };
}

export function makeTextDelta(turnId: TurnId, messageId: MessageId, delta: string): TextDeltaEvent {
  return { delta, messageId, timestamp: nowMs(), turnId, type: "text_delta" };
}

export function makeTextDone(turnId: TurnId, messageId: MessageId): TextDoneEvent {
  return { messageId, timestamp: nowMs(), turnId, type: "text_done" };
}

export function makeReasoningDelta(turnId: TurnId, messageId: MessageId, delta: string): ReasoningDeltaEvent {
  return { delta, messageId, timestamp: nowMs(), turnId, type: "reasoning_delta" };
}

export function makeReasoningDone(turnId: TurnId, messageId: MessageId): ReasoningDoneEvent {
  return { messageId, timestamp: nowMs(), turnId, type: "reasoning_done" };
}

export function makeToolCallBegin(turnId: TurnId, toolCallId: ToolCallId, name: string): ToolCallBeginEvent {
  return { name, timestamp: nowMs(), toolCallId, turnId, type: "tool_call_begin" };
}

export function makeToolCallArgsDelta(turnId: TurnId, toolCallId: ToolCallId, delta: string): ToolCallArgsDeltaEvent {
  return { delta, timestamp: nowMs(), toolCallId, turnId, type: "tool_call_args_delta" };
}

export function makeToolCallArgsDone(turnId: TurnId, toolCallId: ToolCallId, parsedArgs: Record<string, unknown> | null): ToolCallArgsDoneEvent {
  return { parsedArgs, timestamp: nowMs(), toolCallId, turnId, type: "tool_call_args_done" };
}

export function makeToolCallResult(turnId: TurnId, toolCallId: ToolCallId, result: ToolResult): ToolCallResultEvent {
  return { result, timestamp: nowMs(), toolCallId, turnId, type: "tool_call_result" };
}

export function makePatchProposed(turnId: TurnId, patch: ProposedPatch, diff: string): PatchProposedEvent {
  return { diff, patch, timestamp: nowMs(), turnId, type: "patch_proposed" };
}

export function makePatchApproved(turnId: TurnId, patchId: PatchId): PatchApprovedEvent {
  return { patchId, timestamp: nowMs(), turnId, type: "patch_approved" };
}

export function makePatchRejected(turnId: TurnId, patchId: PatchId): PatchRejectedEvent {
  return { patchId, timestamp: nowMs(), turnId, type: "patch_rejected" };
}

export function makePatchApplied(turnId: TurnId, patchId: PatchId, result: ApplyResult): PatchAppliedEvent {
  return { patchId, result, timestamp: nowMs(), turnId, type: "patch_applied" };
}

export function makePlanDelta(turnId: TurnId, items: PlanItem[]): PlanDeltaEvent {
  return { items, timestamp: nowMs(), turnId, type: "plan_delta" };
}

export function makePlanItemCompleted(turnId: TurnId, itemId: string): PlanItemCompletedEvent {
  return { itemId, timestamp: nowMs(), turnId, type: "plan_item_completed" };
}

export function makePlanComplete(turnId: TurnId): PlanCompleteEvent {
  return { timestamp: nowMs(), turnId, type: "plan_complete" };
}

export function makeTokenUsage(turnId: TurnId, usage: TokenUsage): TokenUsageEvent {
  return { timestamp: nowMs(), turnId, type: "token_usage", usage };
}

export function makeError(turnId: TurnId, message: string, fatal: boolean): ErrorEvent {
  return { fatal, message, timestamp: nowMs(), turnId, type: "error" };
}
