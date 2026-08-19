/**
 * 模型价格表与消费估算(lib/cache/cost)
 * - 与 Go services/cache/cost.go 1:1 迁移(含 MiniMax 价格)
 * - 价格单位: CNY 元 / 1M tokens
 */

/** 模型价格(主动缓存写入按 input × cacheWriteMul 计费) */
interface ModelPrice {
  /** 标准输入价 */
  input: number;
  /** 输出价 */
  output: number;
  /** 缓存命中价 */
  cacheRead: number;
  /** 主动缓存写入倍率 */
  cacheWriteMul: number;
}

const modelPriceTable: Record<string, ModelPrice> = {
  'MiniMax-M3': { input: 2.1, output: 8.4, cacheRead: 0.42, cacheWriteMul: 1.0 },
  'MiniMax-M3-fast': { input: 3.15, output: 12.6, cacheRead: 0.63, cacheWriteMul: 1.0 },
  'MiniMax-M2.7': { input: 2.1, output: 8.4, cacheRead: 0.42, cacheWriteMul: 1.25 },
  'MiniMax-M2.7-highspeed': { input: 4.2, output: 16.8, cacheRead: 0.42, cacheWriteMul: 1.25 },
  'MiniMax-M2.5': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2.5-highspeed': { input: 4.2, output: 16.8, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2.1': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2.1-highspeed': { input: 4.2, output: 16.8, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
  default: { input: 2.1, output: 8.4, cacheRead: 0.42, cacheWriteMul: 1.0 },
};

/** 模糊匹配模型价格(case-insensitive 包含关系) */
export function getModelPrice(modelName: string): ModelPrice {
  const lower = modelName.toLowerCase();
  for (const [key, price] of Object.entries(modelPriceTable)) {
    if (key === 'default') continue;
    if (lower.includes(key.toLowerCase())) return price;
  }
  return modelPriceTable.default;
}

/** 估算单轮消费(CNY) */
export function estimateTurnCostCny(
  modelName: string,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const price = getModelPrice(modelName);
  const million = 1_000_000;
  return (
    (input * price.input) / million +
    (output * price.output) / million +
    (cacheRead * price.cacheRead) / million +
    (cacheWrite * price.input * price.cacheWriteMul) / million
  );
}
