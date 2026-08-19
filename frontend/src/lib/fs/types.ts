/** 文件信息(用于 listFiles / readDirDeep 等返回值) */
export interface FileInfo {
  /** 是否目录 */
  isDir: boolean;
  /** 最后修改时间(ms) */
  modifiedAt?: number;
  /** 文件名 */
  name: string;
  /** 相对根 handle 的路径 */
  path: string;
  /** 字节数(目录为 0) */
  size: number;
}

declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    /** 查询读/写权限(旧 TS lib 缺失,补充声明;页面刷新后权限回到 prompt) */
    queryPermission(
      descriptor?: { mode?: 'read' | 'readwrite' },
    ): Promise<'granted' | 'denied' | 'prompt'>;
    /** 请求读/写权限(需用户手势) */
    requestPermission(
      descriptor?: { mode?: 'read' | 'readwrite' },
    ): Promise<'granted' | 'denied' | 'prompt'>;
  }
}

export {};