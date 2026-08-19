/**
 * Codex-style protocol: a tiny store wrapper around `reduceSession`.
 *
 * Nothing in this file imports React, DOM, or Wails. UI code (hooks,
 * components) subscribes via `subscribe` to re-render on state changes.
 *
 * 2026-07-04 P1-1 终态: 旧的 `ToolCallExecutor` 已删除 (统一走原生 function call)。
 * 上游 event handler (`hooks/streaming/streamingSession.ts`) 直接把后端
 * `type=tool_call` 事件 dispatch 进 session,不再需要 XML 嗅探层。
 */

import {
    createInitialSession,
    reduceSession,
    type ChatEvent,
    type ChatSession,
} from "./events";

/** Listener invoked whenever the session state changes. */
export type ChatSessionListener = (state: ChatSession) => void;

/**
 * Minimal event-sourced session store. Pure data in, pure state out:
 * every `dispatch` runs the new event through `reduceSession` and
 * notifies subscribers with the resulting state.
 */
export interface ChatSessionStore {
    /** Apply a ChatEvent to the current state and notify subscribers. */
    dispatch: (event: ChatEvent) => void;
    /** Read the current session snapshot. */
    getState: () => ChatSession;
    /**
     * Register a listener. Returns an unsubscribe function. Listeners
     * are invoked synchronously after each `dispatch`, in the order
     * they were registered.
     */
    subscribe: (listener: ChatSessionListener) => () => void;
}

/**
 * Create a new ChatSessionStore. If `initial` is omitted the store starts
 * from `createInitialSession()` (status: "idle", no turn, no tool calls).
 */
export function createChatSessionStore(initial?: ChatSession): ChatSessionStore {
    let state: ChatSession = initial ?? createInitialSession();
    const listeners = new Set<ChatSessionListener>();

    return {
        dispatch(event) {
            state = reduceSession(state, event);
            for (const listener of listeners) listener(state);
        },
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
