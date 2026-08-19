// 扩展 Window 类型，支持 File System Access API

// CSS Module 类型声明
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
interface FileSystemDirectoryHandle {
  kind: "directory";
  name: string;
  path?: string; // Electron/Wails 特有
  getDirectoryHandle(name: string, options?: any): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: any): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: any): Promise<void>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
}

interface FileSystemFileHandle {
  kind: "file";
  name: string;
  path?: string; // Electron/Wails 特有
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemHandle {
  kind: "file" | "directory";
  name: string;
  path?: string;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: any): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }): Promise<FileSystemDirectoryHandle>;
}

// Material Web 自定义元素 JSX 类型(2026-08-17 引入)
// 完整组件库:https://material-web.dev/components/
declare namespace JSX {
  interface IntrinsicElements {
    "md-filled-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-filled-tonal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-outlined-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-text-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-icon": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-dialog": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-tabs": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "md-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      /** Material Web list 容器支持多 slot 子项 */
      children?: React.ReactNode;
    };
    "md-list-item": React.DetailedHTMLProps<
      React.ButtonHTMLAttributes<HTMLElement> & {
        /** 禁用/启用 ripple 效果 */
        disabled?: boolean;
        /** 列表项类型(button/link) */
        type?: "button" | "link";
      },
      HTMLElement
    >;
  }
}
