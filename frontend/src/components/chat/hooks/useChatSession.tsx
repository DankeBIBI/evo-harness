/**
 * React adapter for the protocol-level ChatSessionStore.
 *
 * Two integration shapes are supported:
 *
 *   1. Local store (legacy / standalone consumers):
 *      const { dispatch, session } = useChatSession();
 *
 *   2. Shared store (recommended for chat surfaces with multiple components):
 *      <ChatSessionProvider>
 *        <ChatShell>
 *          ...multiple children call useChatSession / useChatSessionSelector
 *          ...events dispatched by one are observed by all
 *        </ChatShell>
 *      </ChatSessionProvider>
 *
 * Fine-grained reads (e.g. just `isStreaming`) should prefer
 * useChatSessionSelector over `useChatSession().session`, otherwise the
 * consumer re-renders on every dispatched event.
 */

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
    createChatSessionStore,
    type ChatEvent,
    type ChatSession,
    type ChatSessionStore,
} from '@/chat/protocol';

const ChatSessionStoreContext = createContext<ChatSessionStore | null>(null);

/**
 * Provide a ChatSessionStore to the React tree. Wrap the chat subtree
 * (typically inside ChatWindow) so that useChatSession / useChatSessionSelector
 * called anywhere below share the same store: an event dispatched from one
 * component is observed by all the others.
 *
 * Without a Provider, each consumer falls back to a private local store.
 * That preserves the legacy standalone behaviour but means siblings don't
 * see each other's dispatches.
 */
export function ChatSessionProvider({
    children,
    store,
}: {
    children: ReactNode;
    store?: ChatSessionStore;
}) {
    // Lazy-init a store on first mount; subsequent `store` prop changes are
    // ignored so the context value stays referentially stable for downstream
    // subscribers (this matters for useSyncExternalStore).
    const [owned] = useState(() => store ?? createChatSessionStore());
    const value = store ?? owned;
    return <ChatSessionStoreContext.Provider value={value}>{children}</ChatSessionStoreContext.Provider>;
}

/**
 * Returns the nearest ChatSessionStore from context, or falls back to a
 * fresh local store. The fallback is what makes `useChatSession` work even
 * when no Provider is mounted, which keeps the hook pleasant to use in
 * tests and isolated stories.
 */
function useSharedStore(): ChatSessionStore {
    const fromContext = useContext(ChatSessionStoreContext);
    const [local] = useState(() => createChatSessionStore());
    return fromContext ?? local;
}

export interface UseChatSessionResult {
    /** Push a ChatEvent into the store; triggers a re-render on every change. */
    dispatch: (event: ChatEvent) => void;
    /** Imperative read of the latest snapshot (e.g. from event handlers). */
    getState: () => ChatSession;
    /** Current session snapshot, suitable for direct rendering. */
    session: ChatSession;
    /** Escape hatch: the underlying store, for callers that need subscribe(). */
    store: ChatSessionStore;
}

/**
 * Hook into the nearest ChatSessionStore. Re-renders on every dispatch \u2014
 * convenient for full-session projections like the message transcript, but
 * expensive for components that only care about a handful of fields. For
 * those, prefer `useChatSessionSelector`.
 */
export function useChatSession(): UseChatSessionResult {
    const store = useSharedStore();
    // Mirror the store's state into a React-renderable value. The legacy
    // useState + useEffect pair keeps the existing contract (`session` is a
    // snapshot read on render) and is plenty cheap given React's bailout
    // when setState receives the same reference.
    const [session, setSession] = useState<ChatSession>(() => store.getState());
    useEffect(() => store.subscribe(setSession), [store]);
    return {
        dispatch: store.dispatch,
        getState: store.getState,
        session,
        store,
    };
}

/**
 * Subscribe to a derived slice of the chat session. Re-renders only when
 * the selected value changes (compared with Object.is), not on every event.
 *
 * Typical uses for ChatInput-style UI:
 *   const isStreaming = useChatSessionSelector((s) => s.status === "streaming");
 *
 * Caveat: the selector must return a value that compares equal (Object.is)
 * when the underlying state for the slice you care about hasn't changed.
 * Returning a freshly-constructed object on every call will cause spurious
 * re-renders on every notification.
 */
export function useChatSessionSelector<T>(selector: (state: ChatSession) => T): T {
    const store = useSharedStore();
    // Capture the latest selector in a ref so getSnapshot can always see it
    // without invalidating the subscription. The ref is updated synchronously
    // on every render, which is safe under React's normal scheduling.
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    // getSnapshot is stable for the lifetime of the store; React compares
    // its return value with Object.is to decide whether to re-render.
    const getSnapshot = () => selectorRef.current(store.getState());
    return useSyncExternalStore(store.subscribe, getSnapshot);
}