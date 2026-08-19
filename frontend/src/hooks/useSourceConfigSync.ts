import { rescanAllSources } from '@/lib/fs/source-scanner';
import { useAgentStore } from '@/stores/agentStore';
import { useSkillStore } from '@/stores/skillStore';
import { useSourceStore } from '@/stores/sourceStore';
import { useEffect } from 'react';

/**
 * 监听 source 配置变化,自动重新拉取 agent/skill 列表
 * - mount 时拉一次 config(确保 store 初始化)并自动扫描已授权来源
 * - 监听 'source-config-changed' 事件,触发列表刷新 + 自动扫描
 */
export function useSourceConfigSync() {
  const fetchConfig = useSourceStore((s) => s.fetchConfig);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);

  useEffect(() => {
    const run = async () => {
      await fetchConfig();
      // 先加载 localStorage 已有数据,再自动扫描,避免 mount 重复写入
      await Promise.all([fetchAgents(), fetchSkills()]);
      await rescanAllSources();
    };
    void run();

    const handler = () => {
      void (async () => {
        await Promise.all([fetchAgents(), fetchSkills()]);
        await rescanAllSources();
      })();
    };
    window.addEventListener('source-config-changed', handler);
    return () => window.removeEventListener('source-config-changed', handler);
  }, [fetchConfig, fetchAgents, fetchSkills]);
}
