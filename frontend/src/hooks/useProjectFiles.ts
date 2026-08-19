/**
 * 项目文件 Hook(useProjectFiles)
 * - 包装 project-file-service,暴露统一方法给 ChatInput 与 ProjectSelector 共用
 * - 所有方法内部走同一套 module 状态,两个入口数据一致
 */

import { useCallback, useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysisStore";
import {
  getChildren,
  readFileContent,
  reauthorizeProject,
  refreshFile,
  refreshFolder,
  refreshProject,
  restoreProject,
  searchProjectFiles,
  selectProject,
  type ProjectFileItem,
} from "@/lib/fs/project-file-service";

export interface UseProjectFiles {
  /** 当前第一层文件(从 store 订阅,React 响应式) */
  firstLevel: ProjectFileItem[];
  /** 选目录(File System Access API)并加载第一层 */
  selectProject: () => Promise<boolean>;
  /** 刷新页面后恢复持久化 handle 并重新拉取数据 */
  restoreProject: () => Promise<boolean>;
  /** 重新授权已持久化的 handle 并重建第一层(供刷新按钮调用,需用户手势) */
  reauthorizeProject: () => Promise<boolean>;
  /** 取某目录子层(懒加载,点开才实时读磁盘) */
  getChildren: (dirPath: string) => Promise<ProjectFileItem[]>;
  /** 读文件内容(实时磁盘读取) */
  readFileContent: (path: string) => Promise<string>;
  /** 刷新当前项目(重建第一层,供新增/删除根层文件后调用) */
  refreshProject: () => Promise<ProjectFileItem[]>;
  /** 刷新某文件夹(重建该目录子层,供该目录下新增/删除文件后调用) */
  refreshFolder: (dirPath: string) => Promise<ProjectFileItem[]>;
  /** 刷新单个文件(重读磁盘内容,供外部修改文件后获取最新内容) */
  refreshFile: (path: string) => Promise<string | null>;
  /** 按文件名搜索(供 ChatInput 文件弹层搜索) */
  searchProjectFiles: (
    keyword: string,
    maxResults?: number,
  ) => Promise<ProjectFileItem[]>;
}

/** 项目文件统一入口(供 ChatInput / ProjectSelector 共用) */
export function useProjectFiles(): UseProjectFiles {
  /** 订阅第一层(store.directories 由服务写入) */
  const storeDirectories = useAnalysisStore((s) => s.directories);

  /** store 条目 → ProjectFileItem(useMemo 缓存引用,避免每次渲染新数组导致下游 effect 死循环) */
  const firstLevel: ProjectFileItem[] = useMemo(
    () =>
      storeDirectories.map((d) => ({
        depth: Math.max(0, d.path.split("/").filter(Boolean).length - 1),
        isDir: d.isDir,
        name: d.name,
        path: d.path,
        size: d.size ?? 0,
        modifiedAt: d.modifiedAt,
      })),
    [storeDirectories],
  );

  const handleSelectProject = useCallback(async () => {
    return selectProject();
  }, []);

  const handleRestoreProject = useCallback(async () => {
    return restoreProject();
  }, []);

  const handleReauthorizeProject = useCallback(async () => {
    return reauthorizeProject();
  }, []);

  const handleGetChildren = useCallback(async (dirPath: string) => {
    return getChildren(dirPath);
  }, []);

  const handleReadFile = useCallback(async (path: string) => {
    return readFileContent(path);
  }, []);

  const handleRefreshProject = useCallback(async () => {
    return refreshProject();
  }, []);

  const handleRefreshFolder = useCallback(async (dirPath: string) => {
    return refreshFolder(dirPath);
  }, []);

  const handleRefreshFile = useCallback(async (path: string) => {
    return refreshFile(path);
  }, []);

  const handleSearchProjectFiles = useCallback(
    async (keyword: string, maxResults?: number) => {
      return searchProjectFiles(keyword, maxResults);
    },
    [],
  );

  return {
    firstLevel,
    selectProject: handleSelectProject,
    restoreProject: handleRestoreProject,
    reauthorizeProject: handleReauthorizeProject,
    getChildren: handleGetChildren,
    readFileContent: handleReadFile,
    refreshProject: handleRefreshProject,
    refreshFolder: handleRefreshFolder,
    refreshFile: handleRefreshFile,
    searchProjectFiles: handleSearchProjectFiles,
  };
}
