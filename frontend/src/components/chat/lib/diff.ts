/**
 * LCS 行级 diff 算法(共享)
 * - 与 CodeReviewPanel.computeDiff 行为一致,数值可对齐
 * - 时间复杂度 O(m·n),小文件(<1k 行)足够快;大文件可后续切换 Myers diff
 */

export type DiffLineType = "added" | "removed" | "same";

export interface DiffLine {
  content: string;
  type: DiffLineType;
}

/**
 * 计算两段文本的行级 diff(返回按行序排列的结果)
 * 算法:经典 LCS DP,O(m·n) 时间 / O(m·n) 空间
 */
export function computeLineDiff(original: string, modified: string): DiffLine[] {
  const orig = original.split("\n");
  const mod = modified.split("\n");
  const m = orig.length;
  const n = mod.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (orig[i - 1] === mod[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === mod[j - 1]) {
      result.unshift({ content: orig[i - 1], type: "same" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ content: mod[j - 1], type: "added" });
      j--;
    } else {
      result.unshift({ content: orig[i - 1], type: "removed" });
      i--;
    }
  }
  return result;
}

/** 统计 +/- 行数(基于 LCS diff,与 CodeReviewPanel 数值一致) */
export function diffStats(diff: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.type === "added") added++;
    else if (line.type === "removed") removed++;
  }
  return { added, removed };
}

/** 一次性算出 diff + stats(常用入口) */
export function diffWithStats(
  original: string,
  modified: string,
): { diff: DiffLine[]; stats: { added: number; removed: number } } {
  const diff = computeLineDiff(original, modified);
  return { diff, stats: diffStats(diff) };
}
