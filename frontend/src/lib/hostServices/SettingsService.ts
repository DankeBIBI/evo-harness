/**
 * 设置服务(hostServices/SettingsService)
 * - 兼容旧 Wails 绑定签名(models.UserSettings / models.SourceConfig)
 * - 实现为 localStorage 持久化
 */

const SETTINGS_KEY = 'hostServices.settings.v1';
const SOURCE_KEY = 'hostServices.sourceConfig.v1';

/** 获取用户设置 */
export async function Get(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 更新用户设置 */
export async function Update(settings: object): Promise<void> {
  const current = await Get();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

/** 获取来源配置(Agent/Skill 扫描开关) */
export async function GetSourceConfig(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem(SOURCE_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 更新来源配置 */
export async function UpdateSourceConfig(cfg: object): Promise<void> {
  localStorage.setItem(SOURCE_KEY, JSON.stringify(cfg));
}

/** 导出全部数据(JSON 字符串) */
export async function ExportData(): Promise<string> {
  return JSON.stringify(
    { settings: await Get(), sourceConfig: await GetSourceConfig() },
    null,
    2,
  );
}

/** 导入全部数据(JSON 字符串) */
export async function ImportData(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { settings?: Record<string, unknown>; sourceConfig?: Record<string, unknown> };
  if (parsed.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed.settings));
  if (parsed.sourceConfig) localStorage.setItem(SOURCE_KEY, JSON.stringify(parsed.sourceConfig));
}
