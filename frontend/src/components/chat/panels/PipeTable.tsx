import { cn } from '@/lib/utils';

/**
 * 伪表格解析器:把 | 分隔文本解析为表格行
 *
 * 适用场景:AI 输出非标准 markdown 表格
 *   输入示例 1(标准多行):
 *     ```
 *     | 项目 | 详情 |
 *     |------|------|
 *     | 文件名 | test.html |
 *     ```
 *   输入示例 2(单行伪表格,AI 压成一行):
 *     `| 文件名 | test.html | 状态 | ✅ 写入成功 |`
 *   输入示例 3(列数不一致,AI 输出不规范):
 *     ```
 *     | 项目 | 详情 |
 *     | 文件名 | test.html | 完整路径 |
 *     ```
 *
 * 解析规则:
 *   - 按 \n 切行
 *   - 过滤 markdown 分隔行(只含 - 和 | 和空格)
 *   - 每行按 | split,trim,过滤空 cell
 *   - 至少 1 行 2+ 列
 *   - 列数允许不一致(由 PipeTable 用 maxCols 补齐)
 */
export function parsePipeTable(text: string): string[][] | null {
  if (!text || !text.includes('|')) return null;

  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 1) return null;

  const isSeparator = (s: string) =>
    /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(s);

  const dataLines = lines.filter((l) => !isSeparator(l));
  if (dataLines.length < 1) return null;

  const rows = dataLines.map((line) =>
    line
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  // 至少 1 行有 2+ 列(放宽:允许部分行只有 1 列,被过滤掉)
  if (rows[0].length < 2) return null;
  const validRows = rows.filter((r) => r.length >= 2);
  if (validRows.length < 1) return null;

  return validRows;
}

interface PipeTableProps {
  rows: string[][];
}

/**
 * PipeTable 组件:把伪表格 rows 渲染为 HTML <table>
 * 列数不一致时用 maxCols 补齐缺失 cell
 */
export function PipeTable({ rows }: PipeTableProps) {
  const [header, ...body] = rows;
  // 补齐列数:列数不足的行用空 cell 填充
  const maxCols = Math.max(header.length, ...body.map((r) => r.length));
  const pad = (r: string[]) =>
    r.length < maxCols ? [...r, ...Array(maxCols - r.length).fill('')] : r;

  return (
    <div className="my-2 w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border border-b">
            {pad(header).map((cell, i) => (
              <th
                className={cn('bg-muted/40 px-3 py-1.5 text-left font-medium align-top')}
                key={i}
              >
                {renderCellText(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              className="border-border/60 border-b last:border-b-0"
              key={ri}
            >
              {pad(row).map((cell, ci) => (
                <td
                  className="px-3 py-1.5 align-top whitespace-pre-wrap"
                  key={ci}
                >
                  {renderCellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * cell 文本渲染:支持 **bold** 与 `code`,其他按字面输出
 * 用 React 元素数组返回,避免用 dangerouslySetInnerHTML
 */
function renderCellText(text: string) {
  // 用 | 拆分,**xxx** → <strong>xxx</strong>,`xxx` → <code>xxx</code>
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              className="bg-primary/10 text-primary rounded-md px-1 py-0.5"
              key={i}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
