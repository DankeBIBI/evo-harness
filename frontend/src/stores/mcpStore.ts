/**
 * MCP 配置 store
 * - 原 Go MCPService 是 TODO 桩,改为纯 TS 实现
 * - 数据存 localStorage 明文(非敏感)
 */

import { create } from 'zustand';
import { getPlain, setPlain } from '../lib/storage/secure-storage';

const STORAGE_KEY = 'mcp.servers.v1';

export interface MCPServer {
  args: string[];
  command: string;
  createdAt: string;
  env: Record<string, string>;
  headers: Record<string, string>;
  id: string;
  isEnabled: boolean;
  lastConnectedAt: null | string;
  name: string;
  type: 'http' | 'sse' | 'stdio';
  url: string;
}

interface MCPState {
  addServer: (server: Omit<MCPServer, 'createdAt' | 'id'>) => void;
  error: null | string;
  load: () => void;
  removeServer: (id: string) => void;
  servers: MCPServer[];
  toggleServer: (id: string, enabled: boolean) => void;
  updateServer: (id: string, patch: Partial<MCPServer>) => void;
}

function persist(servers: MCPServer[]): void {
  setPlain(STORAGE_KEY, JSON.stringify(servers));
}

function loadFromStorage(): MCPServer[] {
  const raw = getPlain(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MCPServer[]) : [];
  } catch {
    return [];
  }
}

function genId(): string {
  return crypto.randomUUID();
}

export const useMCPStore = create<MCPState>((set, get) => ({
  addServer: (server) => {
    const next: MCPServer = {
      ...server,
      createdAt: new Date().toISOString(),
      id: genId(),
    };
    const list = [...get().servers, next];
    persist(list);
    set({ servers: list });
  },

  error: null,

  load: () => {
    const list = loadFromStorage();
    set({ servers: list });
  },

  removeServer: (id) => {
    const list = get().servers.filter((s) => s.id !== id);
    persist(list);
    set({ servers: list });
  },

  servers: [],

  toggleServer: (id, enabled) => {
    const list = get().servers.map((s) =>
      s.id === id ? { ...s, isEnabled: enabled } : s,
    );
    persist(list);
    set({ servers: list });
  },

  updateServer: (id, patch) => {
    const list = get().servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
    persist(list);
    set({ servers: list });
  },
}));