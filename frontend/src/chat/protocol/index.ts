/**
 * Codex-style protocol: public surface.
 *
 * Components and hooks should import from "@/chat/protocol" rather than
 * reaching into individual files. This keeps the seam stable while the
 * internals (e.g. reducer shape, adapter signatures) evolve.
 */

export * from "./events";
export * from "./patches";
export * from "./diff";
export * from "./store";
