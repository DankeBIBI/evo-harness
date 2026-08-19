/**
 * Codex-style protocol: line-level diff and unified-diff formatter.
 *
 * Pure functions, no React, no DOM. Used by:
 *   - protocol/adapter.ts (to render ProposedPatch)
 *   - the future DiffApprovalCard component (Phase 4)
 *
 * Algorithm: classic LCS (Hunt-McIlroy) with backtracking, then
 * grouping adjacent changes into hunks with 3 lines of surrounding
 * context (matching `diff -U3`).
 */

export type DiffLineKind = "add" | "context" | "remove";

export interface DiffLine {
  /** The text of the line, without the trailing newline. */
  content: string;
  /** Kind of change. */
  kind: DiffLineKind;
  /** 1-based line number in the new file, or null if removed. */
  newLineNumber: null | number;
  /** 1-based line number in the old file, or null if added. */
  oldLineNumber: null | number;
}

export interface DiffHunk {
  /** 1-based starting line in the new file for the hunk header. */
  endLine: number;
  /** First hunk line, including leading context. */
  startLine: number;
  /** Ordered lines for the hunk. */
  lines: DiffLine[];
}

export interface DiffSummary {
  added: number;
  removed: number;
}

const CONTEXT_LINES = 3;

/**
 * Compute the LCS length table for two arrays of strings.
 * Exposed for testing; consumers should use `computeDiff` instead.
 */
export function lcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack the LCS table into a flat list of DiffLine entries.
 * Exposed for testing; consumers should use `computeDiff` instead.
 */
export function backtrack(a: string[], b: string[], dp: number[][]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push({ content: a[i - 1], kind: "context", newLineNumber: j, oldLineNumber: i });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      result.push({ content: a[i - 1], kind: "remove", newLineNumber: null, oldLineNumber: i });
      i--;
    } else {
      result.push({ content: b[j - 1], kind: "add", newLineNumber: j, oldLineNumber: null });
      j--;
    }
  }
  while (i > 0) {
    result.push({ content: a[i - 1], kind: "remove", newLineNumber: null, oldLineNumber: i });
    i--;
  }
  while (j > 0) {
    result.push({ content: b[j - 1], kind: "add", newLineNumber: j, oldLineNumber: null });
    j--;
  }
  result.reverse();
  return result;
}

/**
 * Split text into lines without trailing newlines.
 * Handles \n and \r\n. An empty input yields an empty array.
 */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text.split(/\r\n|\n|\r/);
}

/**
 * Group a flat DiffLine list into hunks with 3 lines of context,
 * matching `diff -U3` output. Adjacent change groups are NOT merged
 * across more than 2*CONTEXT_LINES of context, matching GNU diff.
 */
export function groupHunks(lines: DiffLine[]): DiffHunk[] {
  if (lines.length === 0) return [];
  const hunks: DiffHunk[] = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    while (i < n && lines[i].kind === "context") i++;
    if (i >= n) break;
    const changeStart = i;
    let changeEnd = i;
    while (changeEnd < n && lines[changeEnd].kind !== "context") changeEnd++;
    let hunkStart = Math.max(0, changeStart - CONTEXT_LINES);
    let hunkEnd = Math.min(n, changeEnd + CONTEXT_LINES);
    let k = hunkEnd;
    while (k < n && lines[k].kind === "context") k++;
    if (k - changeEnd <= 2 * CONTEXT_LINES) {
      hunkEnd = k;
    }
    const slice = lines.slice(hunkStart, hunkEnd);
    const newStartLine = slice.find((l) => l.newLineNumber !== null)?.newLineNumber ?? 1;
    const newEndLine = slice.length > 0 ? (slice[slice.length - 1].newLineNumber ?? newStartLine) : newStartLine;
    hunks.push({ endLine: newEndLine, lines: slice, startLine: newStartLine });
    i = hunkEnd;
  }
  return hunks;
}

/**
 * Compute a line-level diff between two text blobs.
 * Returns hunks ready for UI rendering.
 */
export function computeDiff(oldText: string, newText: string): DiffHunk[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const dp = lcs(a, b);
  const flat = backtrack(a, b, dp);
  return groupHunks(flat);
}

/** Count added/removed lines (does not count context). */
export function summarizeDiff(hunks: DiffHunk[]): DiffSummary {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    for (const ln of h.lines) {
      if (ln.kind === "add") added++;
      else if (ln.kind === "remove") removed++;
    }
  }
  return { added, removed };
}

/**
 * Format hunks as a unified diff string with file headers.
 * If `hunks` is empty, returns "" (caller can decide what to show).
 */
export function formatUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
  oldLabel?: string,
  newLabel?: string,
): string {
  const hunks = computeDiff(oldText, newText);
  if (hunks.length === 0) return "";
  const a = oldLabel ?? "a/" + filePath;
  const b = newLabel ?? "b/" + filePath;
  const header = [`--- ${a}`, `+++ ${b}`];
  const body = hunks.map((h) => {
    const oldCount = h.lines.filter((l) => l.kind !== "add").length;
    const newCount = h.lines.filter((l) => l.kind !== "remove").length;
    const headerLine = `@@ -${h.startLine},${oldCount} +${h.startLine},${newCount} @@`;
    const out: string[] = [headerLine];
    for (const ln of h.lines) {
      const prefix = ln.kind === "add" ? "+" : ln.kind === "remove" ? "-" : " ";
      out.push(prefix + ln.content);
    }
    return out.join("\n");
  });
  return header.join("\n") + "\n" + body.join("\n") + "\n";
}
