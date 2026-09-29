/**
 * 模型价格表与消费估算(lib/cache/cost)
 * - 价格单位: CNY 元 / 1M tokens(含 MiniMax 价格)
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
  'MiniMax-M3': { input: 4.2, output: 16.8, cacheRead: 0.84, cacheWriteMul: 1.0 },
  'MiniMax-M3-fast': { input: 3.15, output: 12.6, cacheRead: 0.63, cacheWriteMul: 1.0 },
	'MiniMax-M3-highspeed': { input: 3.15, output: 12.6, cacheRead: 0.63, cacheWriteMul: 1.0 },
  'MiniMax-M2.7': { input: 2.1, output: 8.4, cacheRead: 0.42, cacheWriteMul: 1.25 },
	'MiniMax-M2.7-highspeed': { input: 2.1, output: 16.8, cacheRead: 0.42, cacheWriteMul: 1.25 },
  'MiniMax-M2.5': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
	'MiniMax-M2.5-highspeed': { input: 2.1, output: 16.8, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2.1': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
	'MiniMax-M2.1-highspeed': { input: 2.1, output: 16.8, cacheRead: 0.21, cacheWriteMul: 1.25 },
  'MiniMax-M2': { input: 2.1, output: 8.4, cacheRead: 0.21, cacheWriteMul: 1.25 },
  default: { input: 0, output: 0, cacheRead: 0, cacheWriteMul: 1.0 },
};

/** 模糊匹配模型价格(case-insensitive 包含关系) */
export function getModelPrice(modelName: string): ModelPrice {
  const lower = modelName.toLowerCase();
	const candidates = Object.entries(modelPriceTable)
		.filter(([key]) => key !== 'default')
		.sort(([a], [b]) => b.length - a.length);
	for (const [key, price] of candidates) {
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
  const isMiniMaxM3LongContext =
    modelName.toLowerCase().includes('minimax-m3') &&
    input + cacheRead + cacheWrite > 512_000;
  const contextMultiplier = isMiniMaxM3LongContext ? 2 : 1;
  const million = 1_000_000;
  return (
    (input * price.input * contextMultiplier) / million +
    (output * price.output * contextMultiplier) / million +
    (cacheRead * price.cacheRead * contextMultiplier) / million +
    (cacheWrite * price.input * price.cacheWriteMul * contextMultiplier) / million
  );
}
